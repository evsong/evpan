require('dotenv').config();
const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
const base58 = require('base-58');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function sendSellBundle(mintAddress) {
    try {
        let allSignerKeyPairs = [];
        
        // 收集所有钱包的私钥
        console.log('[SELL] Collecting all wallet private keys...');
        
        // 添加主钱包组 (1-5)
        for (let i = 1; i <= 5; i++) {
            const privateKey = process.env[`WALLET_PRIVATE_KEY_${i}`];
            if (privateKey) {
                allSignerKeyPairs.push(Keypair.fromSecretKey(base58.decode(privateKey)));
            }
        }
        
        // 添加所有拉盘钱包 (1-100)
        for (let i = 1; i <= 100; i++) {
            const privateKey = process.env[`WALLET_LAPAN_KEY_${i}`];
            if (privateKey) {
                allSignerKeyPairs.push(Keypair.fromSecretKey(base58.decode(privateKey)));
            }
        }

        console.log(`[SELL] Total wallets to sell: ${allSignerKeyPairs.length}`);

        // 将钱包分成每组5个
        const BATCH_SIZE = 5;
        const allSignatures = [];
        const allJitoResults = [];

        // 分批处理
        for (let i = 0; i < allSignerKeyPairs.length; i += BATCH_SIZE) {
            const batchSigners = allSignerKeyPairs.slice(i, i + BATCH_SIZE);
            console.log(`[SELL] Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(allSignerKeyPairs.length/BATCH_SIZE)}`);

            // 准备当前批次的交易参数
            const bundledTxArgs = batchSigners.map(keypair => ({
                publicKey: keypair.publicKey.toBase58(),
                "action": "sell",
                "mint": mintAddress,
                "denominatedInSol": "false",
                "amount": "100%",  // 卖出全部代币
                "slippage": 1000,
                "priorityFee": 0.001,  // 提高优先级费用以加快速度
                "pool": "pump"
            }));

            // 生成交易
            const response = await fetch(`https://pumpportal.fun/api/trade-local`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(bundledTxArgs)
            });

            if (response.status === 200) {
                const transactions = await response.json();
                let encodedSignedTransactions = [];
                let batchSignatures = [];

                // 签名交易
                for (let j = 0; j < bundledTxArgs.length; j++) {
                    const tx = VersionedTransaction.deserialize(new Uint8Array(base58.decode(transactions[j])));
                    tx.sign([batchSigners[j]]);
                    encodedSignedTransactions.push(base58.encode(tx.serialize()));
                    batchSignatures.push(base58.encode(tx.signatures[0]));
                }

                // 发送到 Jito
                console.log('[SELL] 正在发送到 Jito...');
                const jitoResponse = await fetch(`https://amsterdam.mainnet.block-engine.jito.wtf:443/api/v1/bundles`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    body: JSON.stringify({
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "sendBundle",
                        "params": [
                            encodedSignedTransactions
                        ]
                    })
                });

                const jitoResult = await jitoResponse.json();
                console.log(`[SELL] Batch ${Math.floor(i/BATCH_SIZE) + 1} Jito response:`, jitoResult);

                // 收集签名和结果
                allSignatures.push(...batchSignatures);
                allJitoResults.push(jitoResult);

                // 打印交易链接
                batchSignatures.forEach((sig, index) => {
                    console.log(`[SELL] Batch ${Math.floor(i/BATCH_SIZE) + 1} TX ${index + 1}: https://solscan.io/tx/${sig}`);
                });

                // 批次间短暂延迟，避免请求过于密集
                if (i + BATCH_SIZE < allSignerKeyPairs.length) {
                    await new Promise(resolve => setTimeout(resolve, 1));
                }
            } else {
                const errorText = await response.text();
                throw new Error(`Batch ${Math.floor(i/BATCH_SIZE) + 1} failed: ${response.status} ${response.statusText}\n${errorText}`);
            }
        }

        return {
            success: true,
            signatures: allSignatures,
            jitoResults: allJitoResults
        };
    } catch (error) {
        console.error('[SELL] Process error:', error.message);
        throw error;
    }
}

module.exports = {
    sendSellBundle
}; 