require('dotenv').config();
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { PumpFunSDK } = require('pumpdotfun-sdk');
const { Wallet: NodeWallet } = require('@coral-xyz/anchor');
const { AnchorProvider } = require('@coral-xyz/anchor');
const base58 = require('base-58');

// 格式化工具函数
const formatSol = (lamports) => (Number(lamports) / 1e9).toFixed(3);
const formatTokenAmount = (amount) => (Number(amount) / 1e9).toFixed(0);
const formatTimestamp = (timestamp) => new Date(timestamp * 1000).toLocaleTimeString();
const calculatePrice = (solAmount, tokenAmount) => 
    ((Number(solAmount) / 1e9) / (Number(tokenAmount) / 1e9)).toFixed(6);
const calculateProgress = (solReserves) => {
    const percentage = (Number(solReserves) / 1e9 / 100) * 100;
    return { progressPercentage: percentage.toFixed(2) };
};

// Provider配置
function getProvider(rpcUrl) {
    if (!rpcUrl) {
        throw new Error('需要提供 RPC URL');
    }

    const connection = new Connection(rpcUrl, {
        commitment: 'processed',
        wsEndpoint: rpcUrl.replace('https', 'wss'),
        confirmTransactionInitialTimeout: 60000,
        disableRetryOnRateLimit: false,
        httpHeaders: {
            'Content-Type': 'application/json',
        }
    });

    const wallet = new NodeWallet(Keypair.generate());
    return new AnchorProvider(connection, wallet, {
        commitment: 'processed',
        preflightCommitment: 'processed',
        skipPreflight: true,
    });
}

// 添加我们的钱包列表
function getOurWallets() {
    const wallets = [];
    
    // 添加主钱包
    for (let i = 1; i <= 5; i++) {
        const privateKey = process.env[`WALLET_PRIVATE_KEY_${i}`];
        if (privateKey) {
            const keypair = Keypair.fromSecretKey(Uint8Array.from(base58.decode(privateKey)));
            wallets.push(keypair.publicKey.toString());
        }
    }
    
    // 添加拉盘钱包 - 改为100个
    for (let i = 1; i <= 100; i++) {  // 改为100
        const privateKey = process.env[`WALLET_LAPAN_KEY_${i}`];
        if (privateKey) {
            const keypair = Keypair.fromSecretKey(Uint8Array.from(base58.decode(privateKey)));
            wallets.push(keypair.publicKey.toString());
        }
    }
    
    return wallets;
}

// 主监听函数
function startTradeMonitoring(targetTokenAddress, callback) {
    let totalBuySOL = 0;
    let totalSellSOL = 0;
    let eventIds;
    let sdk;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 10;
    let isMonitoring = true;
    let heartbeatInterval;
    let reconnectTimeout;
    
    const ourWallets = getOurWallets();

    const setupHeartbeat = (provider) => {
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
        }
        
        heartbeatInterval = setInterval(async () => {
            try {
                // 尝试获取区块高度来检查连接
                await provider.connection.getSlot();
            } catch (error) {
                console.log('Heartbeat failed, reconnecting...');
                restartMonitoring();
            }
        }, 30000); // 每30秒检查一次
    };

    const restartMonitoring = () => {
        if (!isMonitoring) return;
        
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
        }

        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
        }

        if (sdk && eventIds) {
            try {
                Object.values(eventIds).forEach(id => {
                    sdk.removeEventListener(id);
                });
            } catch (error) {
                console.error('Error removing old listeners:', error);
            }
        }

        reconnectTimeout = setTimeout(() => {
            if (isMonitoring) {
                start();
            }
        }, 5000); // 5秒后重试
    };

    const start = async () => {
        try {
            const provider = getProvider(process.env.HELIUS_RPC_URL);
            sdk = new PumpFunSDK(provider);
            const TARGET_TOKEN = new PublicKey(targetTokenAddress);

            callback({
                type: 'info',
                message: `开始监听代币交易: ${TARGET_TOKEN.toString()}`
            });

            setupHeartbeat(provider);

            const tradeEventId = sdk.addEventListener('tradeEvent', (event) => {
                if (event.mint.toString() === TARGET_TOKEN.toString()) {
                    console.log('Event matches target token');
                    const now = Date.now();
                    const eventTime = event.timestamp * 1000;
                    const latency = now - eventTime;
                    
                    // 检查是否是我们的钱包
                    const isOurWallet = ourWallets.includes(event.user.toString());
                    
                    // 只有不是我们的钱包才计入统计
                    if (!isOurWallet) {
                        const solAmount = Number(event.solAmount) / 1e9;
                        if (event.isBuy) {
                            totalBuySOL += solAmount;
                        } else {
                            totalSellSOL += solAmount;
                        }
                    }
                    
                    const { progressPercentage } = calculateProgress(event.realSolReserves);
                    const price = calculatePrice(event.solAmount, event.tokenAmount);

                    // 发送交易信息到前端
                    callback({
                        type: event.isBuy ? 'buy' : 'sell',
                        message: `
                            <div class="trade-info-main">
                                <div>类型: ${event.isBuy ? '买入' : '卖出'}</div>
                                <div>SOL: ${formatSol(event.solAmount)}</div>
                                <div>价格: ${price} SOL/PUMP</div>
                                ${isOurWallet ? '<div class="our-wallet-tag">我们的钱包</div>' : ''}
                            </div>
                            <div class="trade-info-details">
                                <div>进度: ${progressPercentage}%</div>
                                <div>其他用户买入总量: ${totalBuySOL.toFixed(3)} SOL</div>
                                <div>其他用户卖出总量: ${totalSellSOL.toFixed(3)} SOL</div>
                                <div>其他用户净买入量: ${(totalBuySOL - totalSellSOL).toFixed(3)} SOL</div>
                            </div>
                        `
                    });
                }
            });

            eventIds = { tradeEventId };
            
            // 设置账户变化监听
            const accountSubscriptionId = provider.connection.onAccountChange(
                TARGET_TOKEN,
                () => {},
                'processed'
            );

            reconnectAttempts = 0; // 重置重连计数

            return {
                stop: () => {
                    isMonitoring = false;
                    if (heartbeatInterval) {
                        clearInterval(heartbeatInterval);
                    }
                    if (reconnectTimeout) {
                        clearTimeout(reconnectTimeout);
                    }
                    if (sdk && eventIds) {
                        Object.values(eventIds).forEach(id => {
                            try {
                                sdk.removeEventListener(id);
                            } catch (error) {
                                console.error('Error removing event listener:', error);
                            }
                        });
                    }
                    try {
                        provider.connection.removeAccountChangeListener(accountSubscriptionId);
                    } catch (error) {
                        console.error('Error removing account listener:', error);
                    }
                    callback({
                        type: 'info',
                        message: '已停止监听'
                    });
                }
            };
        } catch (error) {
            console.error('Monitoring error:', error);
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                callback({
                    type: 'warning',
                    message: `连接失败，${reconnectAttempts + 1}秒后重试...`
                });
                reconnectAttempts++;
                restartMonitoring();
            } else {
                callback({
                    type: 'error',
                    message: '重连次数过多，监听已停止'
                });
                isMonitoring = false;
            }
            throw error;
        }
    };

    return { start };
}

module.exports = {
    startTradeMonitoring
}; 