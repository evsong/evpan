require('dotenv').config();
const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
const base58 = require('base-58');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// 获取随机数
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 获取随机延迟时间(2-3秒)
function getRandomDelay(minDelay, maxDelay) {
    // 将秒转换为毫秒
    const minMs = minDelay * 1000;
    const maxMs = maxDelay * 1000;
    return getRandomInt(minMs, maxMs);
}

// 从所有拉盘钱包中随机选择1-3个
async function getRandomWallets(minWallets, maxWallets, minAmount, maxAmount) {
    const availableWallets = [];
    
    // 先生成所有可能的钱包和它们的随机金额
    const walletConfigs = [];
    for (let i = 1; i <= 100; i++) {
        const privateKey = process.env[`WALLET_LAPAN_KEY_${i}`];
        if (privateKey) {
            // 先生成随机金额
            const randomAmount = getRandomAmount(minAmount, maxAmount);
            walletConfigs.push({
                index: i,
                privateKey,
                keypair: Keypair.fromSecretKey(base58.decode(privateKey)),
                amount: randomAmount
            });
        }
    }

    // 随机打乱钱包顺序
    for (let i = walletConfigs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [walletConfigs[i], walletConfigs[j]] = [walletConfigs[j], walletConfigs[i]];
    }

    // 随机选择要使用的钱包数量
    const count = getRandomInt(minWallets, Math.min(maxWallets, 5));
    const selectedWallets = [];
    const connection = new Connection(process.env.HELIUS_RPC_URL);

    // 检查钱包余额并选择符合条件的
    for (const wallet of walletConfigs) {
        if (selectedWallets.length >= count) break;

        try {
            const balance = await connection.getBalance(wallet.keypair.publicKey);
            const balanceInSol = balance / 1e9;
            
            // 检查余额是否足够支付交易金额
            if (balanceInSol >= wallet.amount) {
                selectedWallets.push({
                    index: wallet.index,
                    privateKey: wallet.privateKey,
                    amount: wallet.amount
                });
                console.log(`钱包 ${wallet.index} 余额充足: ${balanceInSol.toFixed(4)} SOL, 将使用: ${wallet.amount.toFixed(4)} SOL`);
            } else {
                console.log(`钱包 ${wallet.index} 余额不足: ${balanceInSol.toFixed(4)} SOL, 需要: ${wallet.amount.toFixed(4)} SOL`);
            }
        } catch (error) {
            console.error(`检查钱包 ${wallet.index} 余额失败:`, error);
        }
    }

    return selectedWallets;
}

// 添加随机金额生成函数
function getRandomAmount(min, max) {
    // 确保输入是数字
    min = parseFloat(min);
    max = parseFloat(max);
    
    // 生成随机金额
    const randomAmount = Math.random() * (max - min) + min;
    
    // 保留3位小数
    return Math.round(randomAmount * 1000) / 1000;
}

async function sendLapanBundle(mintAddress, selectedWallets) {
    try {
        if (!selectedWallets || selectedWallets.length === 0) {
            throw new Error('没有足够余额的钱包可用');
        }

        console.log(`本次使用 ${selectedWallets.length} 个钱包进行拉盘`);

        // 准备钱包
        const signerKeyPairs = [];
        const walletIndices = [];
        const amounts = [];
        
        selectedWallets.forEach(wallet => {
            signerKeyPairs.push(Keypair.fromSecretKey(base58.decode(wallet.privateKey)));
            walletIndices.push(wallet.index);
            amounts.push(wallet.amount);  // 使用配置的拉盘金额
            console.log(`钱包 ${wallet.index} 拉盘金额: ${wallet.amount} SOL`);
        });

        // 准备交易参数
        const bundledTxArgs = signerKeyPairs.map((keypair, index) => ({
            publicKey: keypair.publicKey.toBase58(),
            "action": "buy",
            "mint": mintAddress,
            "denominatedInSol": "true",
            "amount": amounts[index],  // 使用配置的拉盘金额
            "slippage": 1000,
            "priorityFee": 0.0001,
            "pool": "pump"
        }));

        // 生成交易
        console.log('正在生成拉盘交易...');
        const response = await fetch(`http://127.0.0.1:3456/api/trade-local`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(bundledTxArgs)
        });

        if (response.status === 200) {
            const transactions = await response.json();
            let encodedSignedTransactions = [];
            let signatures = [];

            console.log('正在签名交易...');
            for (let i = 0; i < bundledTxArgs.length; i++) {
                const tx = VersionedTransaction.deserialize(new Uint8Array(base58.decode(transactions[i])));
                tx.sign([signerKeyPairs[i]]);
                encodedSignedTransactions.push(base58.encode(tx.serialize()));
                signatures.push(base58.encode(tx.signatures[0]));
            }

            // 发送到 Jito
            try {
                console.log('正在发送到 Jito...');
                const jitoResponse = await fetch(`https://mainnet.block-engine.jito.wtf/api/v1/bundles`, {
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

                return {
                    success: true,
                    signatures,
                    jitoResult,
                    usedWallets: walletIndices
                };
            } catch (e) {
                console.error('Jito 提交错误:', e.message);
                throw e;
            }
        } else {
            const errorText = await response.text();
            throw new Error(`交易生成失败: ${response.status} ${response.statusText}\n${errorText}`);
        }
    } catch (error) {
        console.error('执行拉盘过程中出错:', error);
        throw error;
    }
}

// 添加控制变量
let isRunning = false;

// 修改为循环拉盘函数
async function startLapanLoop(mintAddress, callback, settings = {}) {
    const {
        minWallets = 1,
        maxWallets = 3,
        minAmount = 0.1,
        maxAmount = 0.3,
        minDelay = 2,
        maxDelay = 3
    } = settings;
    
    // 设置运行状态
    isRunning = true;
    
    while (isRunning) {
        try {
            // 获取符合条件的钱包
            const selectedWallets = await getRandomWallets(minWallets, maxWallets, minAmount, maxAmount);
            if (selectedWallets.length === 0) {
                callback({
                    success: false,
                    error: "没有足够余额的钱包可用"
                });
            } else {
                // 执行拉盘
                const result = await sendLapanBundle(mintAddress, selectedWallets);
                if (result.success) {
                    callback({
                        success: true,
                        signatures: result.signatures,
                        usedWallets: result.usedWallets
                    });
                }
            }

            // 随机延迟后继续下一轮
            const delay = getRandomInt(minDelay * 1000, maxDelay * 1000);
            await new Promise(resolve => setTimeout(resolve, delay));
        } catch (error) {
            callback({
                success: false,
                error: error.message
            });
            // 出错后也添加延迟
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}

// 添加停止函数
function stopLapan() {
    isRunning = false;
}

module.exports = {
    startLapanLoop,
    stopLapan
}; 