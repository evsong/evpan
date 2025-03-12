const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const base58 = require('base-58');
require('dotenv').config();

let mainWindow;
const connection = new Connection(process.env.HELIUS_RPC_URL);

let tradeMonitor = null;
let currentMintAddress = null;
let lapanRunning = false;

// 读取配置
function loadConfig() {
    // 创建和买入钱包配置
    const createConfig = {
        wallet1Key: process.env.WALLET_PRIVATE_KEY_1,
        wallet2Key: process.env.WALLET_PRIVATE_KEY_2,
        wallet3Key: process.env.WALLET_PRIVATE_KEY_3,
        wallet4Key: process.env.WALLET_PRIVATE_KEY_4,
        wallet5Key: process.env.WALLET_PRIVATE_KEY_5,
        wallet1Amount: process.env.WALLET_PRIVATE_KEY_1_AMOUNT,
        wallet2Amount: process.env.WALLET_PRIVATE_KEY_2_AMOUNT,
        wallet3Amount: process.env.WALLET_PRIVATE_KEY_3_AMOUNT,
        wallet4Amount: process.env.WALLET_PRIVATE_KEY_4_AMOUNT,
        wallet5Amount: process.env.WALLET_PRIVATE_KEY_5_AMOUNT
    };

    // 拉盘钱包配置
    const lapanConfig = {};
    for (let i = 1; i <= 100; i++) {
        lapanConfig[`key${i}`] = process.env[`WALLET_LAPAN_KEY_${i}`];
    }

    return { createConfig, lapanConfig };
}

// 获取钱包信息
async function getWalletInfo(privateKeyString) {
    try {
        if (!privateKeyString) {
            return {
                publicKey: '未配置',
                balance: 0
            };
        }

        console.log('Processing private key:', privateKeyString.slice(0, 10) + '...');
        
        const keypair = Keypair.fromSecretKey(Uint8Array.from(base58.decode(privateKeyString)));
        console.log('Generated public key:', keypair.publicKey.toString());
        
        // 获取余额
        const balance = await connection.getBalance(keypair.publicKey);
        console.log('Balance:', balance / 1e9, 'SOL');
        
        return {
            publicKey: keypair.publicKey.toString(),
            balance: balance / 1e9
        };
    } catch (error) {
        console.error('Failed to get wallet info:', error.message);
        return {
            publicKey: '加载失败',
            balance: 0
        };
    }
}

// 更新所有钱包信息
async function updateAllWalletInfo() {
    try {
        console.log('Updating wallet information...');
        
        // 创建所有钱包的查询任务
        const walletTasks = [];
        
        // 添加创建和买入钱包的任务
        for (let i = 1; i <= 5; i++) {
            const privateKey = process.env[`WALLET_PRIVATE_KEY_${i}`];
            if (privateKey) {
                walletTasks.push({
                    type: 'create',
                    index: i,
                    privateKey
                });
            }
        }

        // 添加拉盘钱包的任务
        for (let i = 1; i <= 100; i++) {
            const privateKey = process.env[`WALLET_LAPAN_KEY_${i}`];
            walletTasks.push({
                type: 'lapan',
                index: i,
                privateKey
            });
        }

        // 并发执行所有查询任务，每20个为一组
        const BATCH_SIZE = 20;
        const results = [];
        
        for (let i = 0; i < walletTasks.length; i += BATCH_SIZE) {
            const batch = walletTasks.slice(i, i + BATCH_SIZE);
            const batchPromises = batch.map(async task => {
                try {
                    if (!task.privateKey) {
                        return {
                            type: task.type,
                            index: task.index,
                            publicKey: '未配置',
                            balance: 0
                        };
                    }

                    const info = await getWalletInfo(task.privateKey);
                    return {
                        type: task.type,
                        index: task.index,
                        ...info
                    };
                } catch (error) {
                    console.error(`Error processing ${task.type} wallet ${task.index}:`, error);
                    return {
                        type: task.type,
                        index: task.index,
                        publicKey: '加载失败',
                        balance: 0
                    };
                }
            });

            // 等待当前批次完成
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
            
            // 可选：在批次之间添加小延迟以避免请求过于密集
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // 整理结果
        const createWallets = results
            .filter(r => r.type === 'create')
            .map(({ index, publicKey, balance }) => ({ index, publicKey, balance }));

        const lapanWallets = results
            .filter(r => r.type === 'lapan')
            .map(({ index, publicKey, balance }) => ({ index, publicKey, balance }));

        console.log('Sending wallet info to frontend');
        mainWindow.webContents.send('wallet-info', {
            createWallets,
            lapanWallets
        });
    } catch (error) {
        console.error('Failed to update wallet info:', error.message);
        mainWindow.webContents.send('log', `更新钱包信息失败: ${error.message}`);
    }
}

// 保存配置
async function saveConfig(type, config) {
    try {
        console.log(`Saving ${type} configuration:`);
        const envPath = path.join(__dirname, '..', '.env');
        let content = await fs.readFile(envPath, 'utf8');

        if (type === 'create') {
            for (let i = 1; i <= 5; i++) {
                if (config[`wallet${i}Key`]) {
                    content = content.replace(
                        new RegExp(`WALLET_PRIVATE_KEY_${i}=.*`, 'g'),
                        `WALLET_PRIVATE_KEY_${i}=${config[`wallet${i}Key`]}`
                    );
                }
                content = content.replace(
                    new RegExp(`WALLET_PRIVATE_KEY_${i}_AMOUNT=.*`, 'g'),
                    `WALLET_PRIVATE_KEY_${i}_AMOUNT=${config[`wallet${i}`]}`
                );
            }
        } else if (type === 'lapan') {
            for (let i = 1; i <= 25; i++) {
                if (config[`lapanKey${i}`]) {
                    content = content.replace(
                        new RegExp(`WALLET_LAPAN_KEY_${i}=.*`, 'g'),
                        `WALLET_LAPAN_KEY_${i}=${config[`lapanKey${i}`]}`
                    );
                }
                if (config[`lapanAmount${i}`] !== undefined) {
                    content = content.replace(
                        new RegExp(`WALLET_LAPAN_KEY_${i}_AMOUNT=.*`, 'g'),
                        `WALLET_LAPAN_KEY_${i}_AMOUNT=${config[`lapanAmount${i}`] || ''}`
                    );
                }
            }
        }

        await fs.writeFile(envPath, content);

        // 清除 require.cache
        Object.keys(require.cache).forEach(function(key) {
            delete require.cache[key];
        });

        // 重新加载 dotenv
        require('dotenv').config({ override: true });

        // 重新加载配置并发送到前端
        const newConfig = loadConfig();
        if (type === 'create') {
            mainWindow.webContents.send('load-config', newConfig.createConfig);
        } else {
            mainWindow.webContents.send('load-lapan-config', newConfig.lapanConfig);
        }

        console.log(`${type} configuration has been saved and reloaded`);
    } catch (error) {
        console.error('Failed to save configuration:', error.message);
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            defaultEncoding: 'utf8'
        }
    });

    mainWindow.loadFile('src/index.html');
    mainWindow.webContents.on('did-finish-load', () => {
        const config = loadConfig();
        mainWindow.webContents.send('load-config', config.createConfig);
        mainWindow.webContents.send('load-lapan-config', config.lapanConfig);
        updateAllWalletInfo();
    });
}

// 修改 mint-address 事件处理
ipcMain.on('start-trade-monitor', async (event, mintAddress) => {
    try {
        console.log('Starting trade monitor for:', mintAddress);
        const { startTradeMonitoring } = require('./tradem.js');
        
        // 如果已有监听则先停止
        if (tradeMonitor) {
            console.log('Stopping existing monitor');
            tradeMonitor.stop();
        }

        // 开始新的监听
        console.log('Creating new monitor');
        tradeMonitor = await startTradeMonitoring(mintAddress, (info) => {
            console.log('Received trade info:', info);
            mainWindow.webContents.send('trade-info', info);
        });
        
        console.log('Starting monitor');
        await tradeMonitor.start();

    } catch (error) {
        console.error('Trade monitoring failed:', error);
        mainWindow.webContents.send('trade-info', {
            type: 'error',
            message: `监听失败: ${error.message}`
        });
    }
});

ipcMain.on('stop-trade-monitor', () => {
    console.log('Stopping trade monitor');
    if (tradeMonitor) {
        tradeMonitor.stop();
        tradeMonitor = null;
    }
});

// 添加卖出事件处理
ipcMain.on('sell', async (event, mintAddress) => {
    try {
        console.log('Starting sell process for:', mintAddress);
        const { sendSellBundle } = require('./sell.js');
        const result = await sendSellBundle(mintAddress);

        if (result.success) {
            mainWindow.webContents.send('log', '出操作完成');
            mainWindow.webContents.send('log', '交易签名:');
            result.signatures.forEach((sig, index) => {
                mainWindow.webContents.send('log', `交易 ${index + 1}: https://solscan.io/tx/${sig}`);
            });
        } else {
            throw new Error('卖出失败');
        }
    } catch (error) {
        console.error('Sell failed:', error);
        mainWindow.webContents.send('log', `卖出失败: ${error.message}`);
    }
});

// 修改拉盘事件处理
ipcMain.on('lapan', async (event, mintAddress, settings) => {
    try {
        if (!lapanRunning) {
            console.log('Starting lapan process for:', mintAddress, 'with settings:', settings);
            const { startLapanLoop, stopLapan } = require('./lapan.js');
            
            lapanRunning = true;
            mainWindow.webContents.send('update-lapan-button', true); // 更新按钮状态为"停止拉盘"
            
            startLapanLoop(mintAddress, (result) => {
                if (result.success) {
                    mainWindow.webContents.send('log', `拉盘操作完成 (使用钱包 ${result.usedWallets.join(', ')})`);
                    result.signatures.forEach((sig, index) => {
                        mainWindow.webContents.send('log', `交易 ${index + 1}: https://solscan.io/tx/${sig}`);
                    });
                } else {
                    mainWindow.webContents.send('log', `拉盘失败: ${result.error}`);
                }
            }, settings);
        } else {
            // 停止拉盘
            console.log('Stopping lapan process');
            const { stopLapan } = require('./lapan.js');
            stopLapan();
            lapanRunning = false;
            mainWindow.webContents.send('update-lapan-button', false); // 更新按钮状态为"开始拉盘"
        }
    } catch (error) {
        console.error('Lapan failed:', error);
        mainWindow.webContents.send('log', `拉盘失败: ${error.message}`);
        lapanRunning = false;
        mainWindow.webContents.send('update-lapan-button', false);
    }
});

// 添加开盘事件处理
ipcMain.on('create-and-buy', async () => {
    try {
        console.log('Starting create and buy process...');
        
        // 生成新的 Mint Keypair
        const { Keypair } = require('@solana/web3.js');
        const mintKeypair = Keypair.generate();
        const mintAddress = mintKeypair.publicKey.toBase58();
        
        // 发 Mint 地址到前端
        mainWindow.webContents.send('mint-address', mintAddress);
        console.log('Generated Mint address:', mintAddress);
        mainWindow.webContents.send('log', `Mint 地址: ${mintAddress}`);

        // 启动监听
        console.log('Starting token monitoring...');
        mainWindow.webContents.send('log', '开始监听新代币...');
        
        const { watchNewToken } = require('./monitor.js');
        const metadata = await watchNewToken();
        
        if (!metadata) {
            throw new Error('获取元数据失败');
        }

        // 打印元数据到前端
        console.log('Token metadata:', metadata);
        mainWindow.webContents.send('log', '获取到代币元数据:');
        mainWindow.webContents.send('log', JSON.stringify(metadata, null, 2));

        // 下载图片
        console.log('Downloading token image...');
        mainWindow.webContents.send('log', '正在下载代币图片...');
        
        const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
        const imageResponse = await fetch(metadata.image);
        const arrayBuffer = await imageResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const path = require('path');
        const fs = require('fs').promises;
        const imagePath = path.join(__dirname, 'temp_image.png');
        await fs.writeFile(imagePath, buffer);

        // 创建代
        console.log('Creating token...');
        mainWindow.webContents.send('log', '正在创建代币...');
        
        const { sendLocalCreateBundle } = require('./create.js');
        const result = await sendLocalCreateBundle({
            mintKeypair,
            tokenMetadata: {
                name: metadata.name,
                symbol: metadata.symbol,
                description: metadata.description || '',
                twitter: metadata.twitter || '',
                telegram: metadata.telegram || '',
                website: metadata.website || '',
                imagePath
            }
        });

        // 清理临时文件
        await fs.unlink(imagePath);
        
        // 发送结果到前端
        if (result && result.success) {
            mainWindow.webContents.send('log', '开盘操作完成');
            mainWindow.webContents.send('log', '交易签名:');
            result.signatures.forEach((sig, index) => {
                mainWindow.webContents.send('log', `交易 ${index + 1}: https://solscan.io/tx/${sig}`);
            });
        } else {
            throw new Error('创建代币失败');
        }

    } catch (error) {
        console.error('Create and buy failed:', error);
        mainWindow.webContents.send('log', `开盘失败: ${error.message}`);
        // 清除 Mint 地址
        mainWindow.webContents.send('mint-address', '');
    }
});

// 添加归集买入钱包事件处理
ipcMain.on('collect-from-create-wallets', async () => {
    try {
        mainWindow.webContents.send('log', '开始归集主钱包...');
        showProgressModal('准备归集主钱包...', 0);

        // 从主钱包收集到创建者钱包
        const toPrivateKey = process.env.WALLET_PRIVATE_KEY_1;
        const fromPrivateKeys = [
            process.env.WALLET_PRIVATE_KEY_2,
            process.env.WALLET_PRIVATE_KEY_3,
            process.env.WALLET_PRIVATE_KEY_4,
            process.env.WALLET_PRIVATE_KEY_5
        ];

        const { collectSOL } = require('./wallet.js');
        await collectSOL(toPrivateKey, fromPrivateKeys, (progress) => {
            mainWindow.webContents.send('distribution-progress', {
                progress: progress.percent,
                message: progress.message,
                detail: progress.detail
            });
        });

        mainWindow.webContents.send('log', '主钱包归集完成');
        showProgressModal('主钱包归集完成', 100);
        
        // 刷新钱包信息
        await updateAllWalletInfo();
    } catch (error) {
        console.error('Collect failed:', error);
        mainWindow.webContents.send('log', `归集失败: ${error.message}`);
        showProgressModal(`归集失败: ${error.message}`, 100);
    }
});

// 添加集拉盘钱包件处理
ipcMain.on('collect-from-lapan-wallets', async (event) => {
    try {
        console.log('Starting collection from lapan wallets...');
        showProgressModal();
        
        // 从所有拉盘钱包归集到主钱包
        const toPrivateKey = process.env.WALLET_PRIVATE_KEY_1;
        const fromPrivateKeys = [];
        
        // 收集所有拉盘钱包的私钥 - 改为100
        for (let i = 1; i <= 100; i++) {  // 改为100
            const privateKey = process.env[`WALLET_LAPAN_KEY_${i}`];
            if (privateKey) {
                fromPrivateKeys.push(privateKey);
            }
        }

        const { collectSOL } = require('./wallet.js');
        await collectSOL(toPrivateKey, fromPrivateKeys, (progress) => {
            event.reply('distribution-progress', progress);
        });

        // 刷新钱包信息
        await updateAllWalletInfo();
        
        event.reply('distribution-complete', {
            success: true,
            message: "归集完成"
        });
    } catch (error) {
        console.error('Collection failed:', error);
        event.reply('distribution-progress', {
            message: `归集失败: ${error.message}`,
            percent: 100,
            detail: error.stack
        });
        event.reply('distribution-complete', {
            success: false,
            message: error.message
        });
    }
});

// 添加显示进度弹窗的辅助函数
function showProgressModal(message, percent) {
    mainWindow.webContents.send('distribution-progress', {
        progress: percent,
        message: message,
        detail: message
    });
}

// 添加保存配置事件处理
ipcMain.on('save-config', async (event, config) => {
    try {
        console.log('Saving create configuration:', config);
        const envPath = path.join(__dirname, '..', '.env');
        let content = await fs.readFile(envPath, 'utf8');

        // 更新创建者钱包配置
        content = content.replace(
            /WALLET_PRIVATE_KEY_1_AMOUNT=.*/,
            `WALLET_PRIVATE_KEY_1_AMOUNT=${config.wallet1}`
        );
        content = content.replace(
            /WALLET_PRIVATE_KEY_2_AMOUNT=.*/,
            `WALLET_PRIVATE_KEY_2_AMOUNT=${config.wallet2}`
        );
        content = content.replace(
            /WALLET_PRIVATE_KEY_3_AMOUNT=.*/,
            `WALLET_PRIVATE_KEY_3_AMOUNT=${config.wallet3}`
        );
        content = content.replace(
            /WALLET_PRIVATE_KEY_4_AMOUNT=.*/,
            `WALLET_PRIVATE_KEY_4_AMOUNT=${config.wallet4}`
        );
        content = content.replace(
            /WALLET_PRIVATE_KEY_5_AMOUNT=.*/,
            `WALLET_PRIVATE_KEY_5_AMOUNT=${config.wallet5}`
        );

        await fs.writeFile(envPath, content, 'utf8');
        console.log('Create configuration saved successfully');

        // 重新加载配
        require('dotenv').config({ override: true });
        const newConfig = loadConfig();
        event.reply('load-config', newConfig.createConfig);

    } catch (error) {
        console.error('Failed to save create configuration:', error);
        mainWindow.webContents.send('log', `保存创建配置失败: ${error.message}`);
    }
});

// 添加保存拉盘配置件处理
ipcMain.on('save-lapan-config', async (event, config) => {
    try {
        console.log('Saving lapan configuration:', config);
        const envPath = path.join(__dirname, '..', '.env');
        let content = await fs.readFile(envPath, 'utf8');

        // 更新拉盘钱包配置
        for (let i = 1; i <= 25; i++) {
            if (config[`lapanAmount${i}`] !== undefined) {
                content = content.replace(
                    new RegExp(`WALLET_LAPAN_KEY_${i}_AMOUNT=.*`),
                    `WALLET_LAPAN_KEY_${i}_AMOUNT=${config[`lapanAmount${i}`]}`
                );
            }
        }

        await fs.writeFile(envPath, content, 'utf8');
        console.log('Lapan configuration saved successfully');

        // 重新加载配置
        require('dotenv').config({ override: true });
        const newConfig = loadConfig();
        event.reply('load-lapan-config', newConfig.lapanConfig);

    } catch (error) {
        console.error('Failed to save lapan configuration:', error);
        mainWindow.webContents.send('log', `保存拉盘配置失败: ${error.message}`);
    }
});

// 修改分发至买入钱包事件处理
ipcMain.on('start-distribution', async (event, amounts) => {
    try {
        console.log('Starting distribution to buy wallets:', amounts);
        
        // 从主钱分发
        const fromPrivateKey = process.env.WALLET_PRIVATE_KEY_1;
        const toPrivateKeys = [];
        const distributionAmounts = [];

        // 收集钱包2-5的私钥和金额
        for (let i = 2; i <= 5; i++) {
            const amount = amounts[`wallet${i}`];
            if (amount > 0) {
                const privateKey = process.env[`WALLET_PRIVATE_KEY_${i}`];
                if (privateKey) {
                    toPrivateKeys.push(privateKey);
                    distributionAmounts.push(Math.floor(amount * 1e9));
                    console.log(`Added wallet ${i} for distribution: ${amount} SOL`);
                }
            }
        }

        if (toPrivateKeys.length === 0) {
            throw new Error('没有需要分发的钱包');
        }

        // 显示进度弹窗
        event.reply('distribution-progress', {
            message: "开始分发SOL",
            percent: 0,
            detail: `准备向 ${toPrivateKeys.length} 个钱包分发`
        });

        // 执行分发
        const { distributeSOL } = require('./wallet.js');
        await distributeSOL(fromPrivateKey, toPrivateKeys, distributionAmounts, (progress) => {
            console.log('Distribution progress:', progress);
            event.reply('distribution-progress', progress);
        });

        // 刷新钱包信息
        await updateAllWalletInfo();

        // 发送完成消息，通知前端关闭弹窗
        event.reply('distribution-complete', {
            success: true,
            message: "分发完成"
        });

    } catch (error) {
        console.error('Distribution failed:', error);
        event.reply('distribution-progress', {
            message: `分发失败: ${error.message}`,
            percent: 100,
            detail: error.stack
        });
        // 发送失败消息，通知前端关闭弹窗
        event.reply('distribution-complete', {
            success: false,
            message: error.message
        });
    }
});

// 修改拉盘分发事件处理
ipcMain.on('start-lapan-distribution', async (event, data) => {
    try {
        const { amount, walletCount } = data;  // 从前端接收统一金额和钱包数量
        console.log(`Starting distribution to ${walletCount} lapan wallets, ${amount} SOL each`);
        
        // 从主钱包分发
        const fromPrivateKey = process.env.WALLET_PRIVATE_KEY_1;
        const toPrivateKeys = [];
        const distributionAmounts = [];

        // 收集前N个配置了私钥的拉盘钱包 - 改为100
        let collectedCount = 0;
        for (let i = 1; i <= 100 && collectedCount < walletCount; i++) {  // 改为100
            const privateKey = process.env[`WALLET_LAPAN_KEY_${i}`];
            if (privateKey) {
                toPrivateKeys.push(privateKey);
                distributionAmounts.push(Math.floor(amount * 1e9)); // 转换为 lamports
                collectedCount++;
            }
        }

        if (toPrivateKeys.length === 0) {
            throw new Error('没有可用的拉盘钱包');
        }

        // 显示进度弹窗
        event.reply('distribution-progress', {
            message: "开始分发SOL到拉盘钱包",
            percent: 0,
            detail: `准备向 ${toPrivateKeys.length} 个拉盘钱包分发`
        });

        // 执行分发
        const { distributeSOL } = require('./wallet.js');
        await distributeSOL(fromPrivateKey, toPrivateKeys, distributionAmounts, (progress) => {
            console.log('Distribution progress:', progress);
            event.reply('distribution-progress', progress);
        });

        // 刷新钱包信息
        await updateAllWalletInfo();

        // 发送完成消息
        event.reply('distribution-complete', {
            success: true,
            message: "分发完成"
        });

    } catch (error) {
        console.error('Distribution failed:', error);
        event.reply('distribution-progress', {
            message: `分发失败: ${error.message}`,
            percent: 100,
            detail: error.stack
        });
        event.reply('distribution-complete', {
            success: false,
            message: error.message
        });
    }
});

// 添加一键生成买入钱包事件处理
ipcMain.on('generate-all-create-wallets', async (event) => {
    try {
        console.log('Generating all create wallets...');
        mainWindow.webContents.send('log', '开始生成买入钱包...');
        
        // 生成钱包2-5的私钥
        for (let i = 2; i <= 5; i++) {
            const keypair = Keypair.generate();
            const privateKey = base58.encode(keypair.secretKey);
            
            // 更新 .env 文件
            const envPath = path.join(__dirname, '..', '.env');
            let content = await fs.readFile(envPath, 'utf8');
            content = content.replace(
                new RegExp(`WALLET_PRIVATE_KEY_${i}=.*`),
                `WALLET_PRIVATE_KEY_${i}=${privateKey}`
            );
            await fs.writeFile(envPath, content, 'utf8');
            
            mainWindow.webContents.send('log', `钱包${i}生成完成: ${keypair.publicKey.toString()}`);
        }

        // 重新加载配置
        require('dotenv').config({ override: true });
        const newConfig = loadConfig();
        event.reply('load-config', newConfig.createConfig);
        
        // 刷新钱包信息
        await updateAllWalletInfo();
        
        mainWindow.webContents.send('log', '所有买入钱包生成完成');
    } catch (error) {
        console.error('Failed to generate create wallets:', error);
        mainWindow.webContents.send('log', `生成买入钱包失败: ${error.message}`);
    }
});

// 修改一键生成拉盘钱包事件处理
ipcMain.on('generate-all-lapan-wallets', async (event) => {
    try {
        console.log('Generating all lapan wallets...');
        mainWindow.webContents.send('log', '开始生成拉盘钱包...');
        
        // 生成100个拉盘钱包
        for (let i = 1; i <= 100; i++) {  // 改为100个
            const keypair = Keypair.generate();
            const privateKey = base58.encode(keypair.secretKey);
            
            // 更新 .env 文件
            const envPath = path.join(__dirname, '..', '.env');
            let content = await fs.readFile(envPath, 'utf8');
            content = content.replace(
                new RegExp(`WALLET_LAPAN_KEY_${i}=.*`),
                `WALLET_LAPAN_KEY_${i}=${privateKey}`
            );
            await fs.writeFile(envPath, content);
            
            mainWindow.webContents.send('log', `拉盘钱包${i}生成完成: ${keypair.publicKey.toString()}`);
        }

        // 重新加载配置
        require('dotenv').config({ override: true });
        const newConfig = loadConfig();
        event.reply('load-lapan-config', newConfig.lapanConfig);
        
        // 刷新钱包信息
        await updateAllWalletInfo();
        
        mainWindow.webContents.send('log', '所有拉盘钱包生成完成');
    } catch (error) {
        console.error('Failed to generate lapan wallets:', error);
        mainWindow.webContents.send('log', `生成拉盘钱包失败: ${error.message}`);
    }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// 在 electron.js 中添加错误消息映射
const errorMessages = {
    'No wallets need to be collected': '没有需要归集的钱包',
    'failed to get balance': '获取钱包余额失败',
    'Transaction confirmation timeout': '交易确认超时',
    // 添加其他错误消息映射...
};
