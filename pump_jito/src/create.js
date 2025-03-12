require('dotenv').config();
const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
const base58 = require('base-58');
const fs = require('fs');
const FormData = require('form-data');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function sendLocalCreateBundle(options = {}) {
    const { mintKeypair = Keypair.generate(), tokenMetadata } = options;
    
    try {
        // 从 .env 读取私钥和金额
        const signerKeyPairs = [
            Keypair.fromSecretKey(base58.decode(process.env.WALLET_PRIVATE_KEY_1)),
            Keypair.fromSecretKey(base58.decode(process.env.WALLET_PRIVATE_KEY_2)),
            Keypair.fromSecretKey(base58.decode(process.env.WALLET_PRIVATE_KEY_3)),
            Keypair.fromSecretKey(base58.decode(process.env.WALLET_PRIVATE_KEY_4)),
            Keypair.fromSecretKey(base58.decode(process.env.WALLET_PRIVATE_KEY_5))
        ];

        const amounts = [
            parseFloat(process.env.WALLET_PRIVATE_KEY_1_AMOUNT),
            parseFloat(process.env.WALLET_PRIVATE_KEY_2_AMOUNT),
            parseFloat(process.env.WALLET_PRIVATE_KEY_3_AMOUNT),
            parseFloat(process.env.WALLET_PRIVATE_KEY_4_AMOUNT),
            parseFloat(process.env.WALLET_PRIVATE_KEY_5_AMOUNT)
        ];

        // 准备表单数据
        const formData = new FormData();
        formData.append("file", fs.createReadStream(tokenMetadata.imagePath));
        formData.append("name", tokenMetadata.name);
        formData.append("symbol", tokenMetadata.symbol);
        formData.append("description", tokenMetadata.description);
        formData.append("twitter", tokenMetadata.twitter);
        formData.append("telegram", tokenMetadata.telegram);
        formData.append("website", tokenMetadata.website);
        formData.append("showName", "true");

        // 上传元数据
        console.log('正在上传元数据...');
        try {
            let metadataResponse = await fetch("https://pump.fun/api/ipfs", {
                method: "POST",
                body: formData,
                headers: {
                    // 不要设置 Content-Type，让 form-data 自动设置
                }
            });

            if (!metadataResponse.ok) {
                throw new Error(`HTTP error! status: ${metadataResponse.status}`);
            }

            let metadataResponseJSON = await metadataResponse.json();
            console.log('元数据 URI:', metadataResponseJSON.metadataUri);

            // 修改创建代币的交易参数
            const bundledTxArgs = [
                {
                    "publicKey": signerKeyPairs[0].publicKey.toBase58(),
                    "action": "create",
                    "tokenMetadata": {
                        name: tokenMetadata.name,
                        symbol: tokenMetadata.symbol,
                        uri: metadataResponseJSON.metadataUri
                    },
                    "mint": mintKeypair.publicKey.toBase58(),
                    "denominatedInSol": "true",
                    "amount": amounts[0],
                    "slippage": 1000,
                    "priorityFee": 0.0001,
                    "pool": "pump"
                }
            ];

            // 修改买入交易参数
            for (let i = 1; i < 5; i++) {
                if (amounts[i] > 0) {
                    bundledTxArgs.push({
                        publicKey: signerKeyPairs[i].publicKey.toBase58(),
                        "action": "buy",
                        "mint": mintKeypair.publicKey.toBase58(),
                        "denominatedInSol": "true",
                        "amount": amounts[i],
                        "slippage": 1000,
                        "priorityFee": 0.00005,
                        "pool": "pump"
                    });
                }
            }

            // 添加错误处理和日志
            try {
                console.log('正在生成交易...');
                console.log('交易参数:', JSON.stringify(bundledTxArgs, null, 2));
                console.log('正在连接本地服务器...');
                try {
                    const response = await fetch(`http://127.0.0.1:3456/api/trade-local`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify(bundledTxArgs)
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    if (response.status === 200) {
                        const transactions = await response.json();
                        let encodedSignedTransactions = [];
                        let signatures = [];

                        console.log('正在签名交易...');
                        for (let i = 0; i < bundledTxArgs.length; i++) {
                            const tx = VersionedTransaction.deserialize(new Uint8Array(base58.decode(transactions[i])));
                            if (bundledTxArgs[i].action === "create") {
                                console.log('签名创建交易...');
                                tx.sign([mintKeypair, signerKeyPairs[i]]);
                            } else {
                                console.log('签名买入交易...');
                                tx.sign([signerKeyPairs[i]]);
                            }
                            encodedSignedTransactions.push(base58.encode(tx.serialize()));
                            signatures.push(base58.encode(tx.signatures[0]));
                        }

                        // 发送到 Jito
                        console.log('正在发送到 Jito...');
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
                        console.log('Jito 响应:', jitoResult);

                        // 等待交易确认
                        console.log('等待交易确认...');
                        const connection = new Connection(process.env.HELIUS_RPC_URL);
                        for (const signature of signatures) {
                            try {
                                // 增加确认超时时间到60秒
                                await connection.confirmTransaction(
                                    signature, 
                                    'confirmed',
                                    { maxRetries: 60 }  // 增加重试次数
                                );
                                console.log(`交易确认成功: ${signature}`);
                                console.log(`交易链接: https://solscan.io/tx/${signature}`);
                            } catch (error) {
                                console.error(`交易确认超时，但不一定失败。请检查交易: https://solscan.io/tx/${signature}`);
                                console.error(`错误详情:`, error.message);
                            }
                        }

                        return {
                            success: true,
                            signatures,
                            jitoResult
                        };
                    }
                } catch (error) {
                    console.error('连接本地服务器失败:', error);
                    throw error;
                }
            } catch (error) {
                console.error('交易执行失败:', error.message);
                throw error;
            }
        } catch (error) {
            console.error('上传元数据失败:', error);
            throw error;
        }
    } catch (error) {
        console.error('执行过程中出错:', error);
        throw error;
    }
}

module.exports = {
    sendLocalCreateBundle
}; 