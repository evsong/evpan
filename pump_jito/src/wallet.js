const { Connection, Keypair, SystemProgram, Transaction, PublicKey } = require('@solana/web3.js');
const base58 = require('base-58');

// 添加延迟函数
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// 带重试的请求函数
async function withRetry(fn, maxRetries = 3, baseDelay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            // 针对不同错误类型采用不同重试策略
            if (error.message.includes('429')) {
                // 请求限制，使用指数退避
                const waitTime = baseDelay * Math.pow(2, i);
                console.log(`请求受限，等待 ${waitTime/1000} 秒后重试...`);
                await delay(waitTime);
                continue;
            } else if (error.message.includes('timeout')) {
                // 超时错误，使用较短延迟
                await delay(1000);
                continue;
            }
            throw error;
        }
    }
}

// 等待交易确认
async function confirmTransaction(connection, signature, commitment = 'confirmed') {
    const startTime = Date.now();
    const timeout = 60000; // 60秒超时
    
    while (Date.now() - startTime < timeout) {
        const status = await connection.getSignatureStatus(signature);
        if (status?.value?.confirmationStatus === commitment) {
            return true;
        }
        await delay(1000);
    }
    throw new Error('Transaction confirmation timeout');
}

// 修改分发功能,支持单个交易多笔转账
async function distributeSOL(fromPrivateKey, toPrivateKeys, amounts, progressCallback) {
    try {
        console.log('Starting SOL distribution from main wallet...');
        
        const connection = new Connection(process.env.HELIUS_RPC_URL);
        const fromKeypair = Keypair.fromSecretKey(Uint8Array.from(base58.decode(fromPrivateKey)));
        
        // 使用Map来去重钱包地址并合并金额
        const uniqueWallets = new Map();
        
        // 处理所有钱包，合并相同地址的金额
        toPrivateKeys.forEach((privateKey, index) => {
            const keypair = Keypair.fromSecretKey(Uint8Array.from(base58.decode(privateKey)));
            const pubkeyStr = keypair.publicKey.toString();
            
            if (uniqueWallets.has(pubkeyStr)) {
                // 如果钱包地址已存在，合并金额
                const existingWallet = uniqueWallets.get(pubkeyStr);
                const newAmount = existingWallet.amount + amounts[index];
                console.log(`发现重复钱包地址 ${pubkeyStr}, 合并金额: ${existingWallet.amount/1e9} + ${amounts[index]/1e9} = ${newAmount/1e9} SOL`);
                uniqueWallets.set(pubkeyStr, {
                    keypair,
                    amount: newAmount,
                    pubkeyStr
                });
            } else {
                uniqueWallets.set(pubkeyStr, {
                    keypair,
                    amount: amounts[index],
                    pubkeyStr
                });
                console.log(`准备分发: ${pubkeyStr} - ${amounts[index]/1e9} SOL`);
            }
        });

        const wallets = Array.from(uniqueWallets.values());
        const BATCH_SIZE = 8; // 每个交易最多包含8笔转账
        const CONFIRM_TIMEOUT = 90000; // 90秒超时
        
        // 将钱包分组
        const walletGroups = [];
        for (let i = 0; i < wallets.length; i += BATCH_SIZE) {
            walletGroups.push(wallets.slice(i, i + BATCH_SIZE));
        }

        const results = [];
        let completedCount = 0;
        const total = wallets.length;

        // 处理每个组
        for (let groupIndex = 0; groupIndex < walletGroups.length; groupIndex++) {
            const group = walletGroups[groupIndex];
            let retryCount = 0;
            const MAX_RETRIES = 3;

            while (retryCount < MAX_RETRIES) {
                try {
                    // 获取新的 blockhash
                    const { blockhash, lastValidBlockHeight } = 
                        await connection.getLatestBlockhash('confirmed');
                    const transaction = new Transaction();
                    transaction.recentBlockhash = blockhash;
                    transaction.lastValidBlockHeight = lastValidBlockHeight;
                    transaction.feePayer = fromKeypair.publicKey;

                    // 添加所有转账指令
                    group.forEach(({ keypair, amount, pubkeyStr }) => {
                        transaction.add(
                            SystemProgram.transfer({
                                fromPubkey: fromKeypair.publicKey,
                                toPubkey: keypair.publicKey,
                                lamports: amount
                            })
                        );
                    });

                    // 签名并发送交易
                    const signature = await connection.sendTransaction(transaction, [fromKeypair], {
                        skipPreflight: false,
                        preflightCommitment: 'confirmed',
                        maxRetries: 3
                    });

                    // 等待确认
                    await connection.confirmTransaction({
                        signature,
                        blockhash,
                        lastValidBlockHeight
                    }, 'confirmed', {
                        confirmTransactionInitialTimeout: CONFIRM_TIMEOUT
                    });

                    // 更新进度
                    completedCount += group.length;
                    const percent = Math.round(completedCount / total * 100);
                    progressCallback({
                        message: `完成 ${completedCount}/${total} 个钱包`,
                        percent,
                        detail: `批次 ${groupIndex + 1} 完成，包含 ${group.length} 笔转账`
                    });

                    // 记录结果
                    group.forEach(({ pubkeyStr, amount }) => {
                        console.log(`钱包 ${pubkeyStr} 分发完成: ${amount/1e9} SOL`);
                        results.push({
                            success: true,
                            signature,
                            pubkeyStr,
                            amount
                        });
                    });

                    console.log(`批次 ${groupIndex + 1} 完成: https://solscan.io/tx/${signature}`);
                    break; // 成功则跳出重试循环

                } catch (error) {
                    console.error(`批次 ${groupIndex + 1} 失败 (尝试 ${retryCount + 1}/${MAX_RETRIES}):`, error);
                    retryCount++;
                    if (retryCount === MAX_RETRIES) {
                        // 记录失败结果
                        group.forEach(({ pubkeyStr }) => {
                            results.push({
                                success: false,
                                error: error.message,
                                pubkeyStr
                            });
                        });
                        break;
                    }
                    // 根据错误类型设置不同的重试延迟
                    const retryDelay = error.message.includes('expired') ? 5000 : 2000;
                    await delay(retryDelay);
                }
            }

            // 批次间添加延迟
            if (groupIndex < walletGroups.length - 1) {
                await delay(2000);
            }
        }

        // 统计结果
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);

        console.log(`分发完成: ${successful.length} 成功, ${failed.length} 失败`);
        if (failed.length > 0) {
            console.log('失败的钱包:', failed.map(f => f.pubkeyStr).join(', '));
        }

        return results;
    } catch (error) {
        console.error('Distribution error:', error);
        progressCallback({
            message: "分发失败",
            percent: 100,
            detail: `错误: ${error.message}`
        });
        throw error;
    }
}

// 添加RPC请求重试函数
async function getBalanceWithRetry(connection, publicKey, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const balance = await connection.getBalance(publicKey);
            return balance;
        } catch (error) {
            console.log(`获取钱包 ${publicKey.toString()} 余额失败 (尝试 ${i + 1}/${maxRetries}):`, error.message);
            if (i === maxRetries - 1) throw error;
            await delay(2000); // 等待2秒后重试
        }
    }
}

// 修改归集功能,改为异步并行归集
async function collectSOL(toPrivateKey, fromPrivateKeys, progressCallback) {
    try {
        const connection = new Connection(process.env.HELIUS_RPC_URL);
        const toKeypair = Keypair.fromSecretKey(Uint8Array.from(base58.decode(toPrivateKey)));
        
        // 使用Map来去重钱包地址
        const uniqueWallets = new Map();
        
        // 串行获取所有钱包余额(避免并发请求导致RPC失败)
        console.log('开始获取钱包余额...');
        const wallets = [];
        
        for (const privateKey of fromPrivateKeys) {
            try {
                const keypair = Keypair.fromSecretKey(Uint8Array.from(base58.decode(privateKey)));
                const pubkeyStr = keypair.publicKey.toString();
                
                if (!uniqueWallets.has(pubkeyStr)) {
                    const balance = await getBalanceWithRetry(connection, keypair.publicKey);
                    console.log(`钱包 ${pubkeyStr} 余额: ${balance/1e9} SOL`);
                    wallets.push({ keypair, balance, pubkeyStr });
                    uniqueWallets.set(pubkeyStr, true);
                }
            } catch (error) {
                console.error(`获取钱包余额失败:`, error);
                // 继续处理下一个钱包
                continue;
            }
            
            // 每次请求后添加短暂延迟
            await delay(200);
        }

        // 设置最小保留余额 (仅保留5000 lamports作为gas费)
        const MIN_BALANCE = 5000;
        
        // 过滤出有足够余额的钱包
        const validWallets = wallets.filter(w => w.balance > MIN_BALANCE);
        
        if (validWallets.length === 0) {
            throw new Error('No wallets need to be collected');
        }

        console.log(`Found ${validWallets.length} wallets to collect`);
        const total = validWallets.length;
        let completedCount = 0;

        // 设置并发限制
        const CONCURRENT_LIMIT = 5;
        const CONFIRM_TIMEOUT = 90000; // 90秒超时
        
        // 将钱包分组
        const walletGroups = [];
        for (let i = 0; i < validWallets.length; i += CONCURRENT_LIMIT) {
            walletGroups.push(validWallets.slice(i, i + CONCURRENT_LIMIT));
        }

        const results = [];
        
        // 按组处理钱包
        for (const group of walletGroups) {
            const groupPromises = group.map(async ({ keypair, balance, pubkeyStr }) => {
                let retryCount = 0;
                const MAX_RETRIES = 3;
                
                while (retryCount < MAX_RETRIES) {
                    try {
                        // 每次重试获取新的 blockhash
                        const { blockhash, lastValidBlockHeight } = 
                            await connection.getLatestBlockhash('confirmed');
                        const transaction = new Transaction();
                        transaction.recentBlockhash = blockhash;
                        transaction.lastValidBlockHeight = lastValidBlockHeight;
                        transaction.feePayer = keypair.publicKey;

                        // 计算转账金额 (余额 - gas费用)
                        const transferAmount = balance - MIN_BALANCE;
                        
                        transaction.add(
                            SystemProgram.transfer({
                                fromPubkey: keypair.publicKey,
                                toPubkey: toKeypair.publicKey,
                                lamports: transferAmount
                            })
                        );

                        // 签名并发送交易
                        transaction.sign(keypair);

                        const signature = await connection.sendTransaction(transaction, [keypair], {
                            skipPreflight: false,
                            preflightCommitment: 'confirmed',
                            maxRetries: 3
                        });

                        // 使用更长的确认超时
                        await connection.confirmTransaction({
                            signature,
                            blockhash,
                            lastValidBlockHeight
                        }, 'confirmed', {
                            confirmTransactionInitialTimeout: CONFIRM_TIMEOUT
                        });

                        completedCount++;
                        const percent = Math.round(completedCount / total * 100);
                        progressCallback({
                            message: `完成 ${completedCount}/${total} 个钱包`,
                            percent,
                            detail: `钱包 ${pubkeyStr} 归集完成: ${transferAmount/1e9} SOL`
                        });

                        console.log(`钱包 ${pubkeyStr} 归集完成: https://solscan.io/tx/${signature}`);
                        return { success: true, signature, pubkeyStr };

                    } catch (error) {
                        console.error(`钱包 ${pubkeyStr} 归集失败 (尝试 ${retryCount + 1}/${MAX_RETRIES}):`, error);
                        retryCount++;
                        if (retryCount === MAX_RETRIES) {
                            return { success: false, error: error.message, pubkeyStr };
                        }
                        // 根据错误类型设置不同的重试延迟
                        const retryDelay = error.message.includes('expired') ? 5000 : 2000;
                        await delay(retryDelay);
                    }
                }
            });

            // 等待当前组完成
            const groupResults = await Promise.all(groupPromises);
            results.push(...groupResults);
            
            // 组之间添加延迟
            if (walletGroups.indexOf(group) < walletGroups.length - 1) {
                await delay(2000);
            }
        }

        // 统计结果
        const successful = results.filter(r => r && r.success);
        const failed = results.filter(r => r && !r.success);

        console.log(`归集完成: ${successful.length} 成功, ${failed.length} 失败`);
        if (failed.length > 0) {
            console.log('失败的钱包:', failed.map(f => f.pubkeyStr).join(', '));
        }

        return results;
    } catch (error) {
        console.error('[COLLECT] Collection failed:', error.message);
        throw error;
    }
}

function calculateProgress(current, total, stage) {
    const stageWeight = {
        'preparing': 0.1,
        'processing': 0.8,
        'confirming': 0.1
    };
    
    const baseProgress = {
        'preparing': 0,
        'processing': 10,
        'confirming': 90
    };
    
    return {
        percent: baseProgress[stage] + (current / total * 100 * stageWeight[stage]),
        message: `${stage}: ${current}/${total}`,
        detail: `处理进度: ${((current / total) * 100).toFixed(1)}%`
    };
}

async function estimateTransactionFee(connection, transaction) {
    const { feeCalculator } = await connection.getRecentBlockhash();
    const fee = feeCalculator.lamportsPerSignature * transaction.signatures.length;
    return fee + 5000; // 添加缓冲
}

module.exports = {
    distributeSOL,
    collectSOL
}; 