#!/usr/bin/env node
require('dotenv').config();
const { sendLocalCreateBundle } = require('./src/create');
const { startLapanLoop, stopLapan } = require('./src/lapan');
const { sendSellBundle } = require('./src/sell');
const fs = require('fs');
const path = require('path');
const { Connection, PublicKey } = require('@solana/web3.js');

// 创建日志目录
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// 日志文件路径
const operationLogFile = path.join(logDir, 'operations.log');
const tradeLogFile = path.join(logDir, 'trades.log');

// 初始化 Solana 连接
const connection = new Connection(process.env.HELIUS_RPC_URL);

// 记录操作日志
function logOperation(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(operationLogFile, logMessage);
  console.log(message);
}

// 记录交易日志
function logTrade(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(tradeLogFile, logMessage);
}

// 确保图片文件存在
async function ensureImageExists() {
  const imagePath = path.join(__dirname, 'src', 'temp_image.png');
  
  if (!fs.existsSync(imagePath)) {
    console.log('警告: 图片文件不存在，将创建一个空图片');
    fs.writeFileSync(imagePath, ''); // 创建空文件
    console.log('已创建空图片文件:', imagePath);
  }
  
  return imagePath;
}

// 检查服务器是否正在运行
async function checkServer() {
  try {
    const fetch = await import('node-fetch');
    const response = await fetch.default('http://127.0.0.1:3456/api/health', {
      method: 'GET',
      timeout: 3000
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

// 创建并购买代币
async function createAndBuy(options = {}) {
  // 检查服务器
  console.log('正在检查本地服务器...');
  const serverRunning = await checkServer();
  if (!serverRunning) {
    console.error('错误: 本地服务器未运行，请先启动服务器');
    return { success: false, error: 'SERVER_NOT_RUNNING' };
  }
  
  console.log('本地服务器正在运行...');
  
  // 确保图片存在
  const imagePath = await ensureImageExists();
  
  // 使用传入的参数或默认值
  const name = options.name || 'MyToken';
  const symbol = options.symbol || 'MT';
  const description = options.description || '一个测试代币';
  
  console.log(`开始创建代币: ${name} (${symbol})`);
  logOperation(`开始创建代币: ${name} (${symbol})`);
  
  try {
    // 创建代币
    const result = await sendLocalCreateBundle({
      tokenMetadata: {
        name,
        symbol,
        description,
        twitter: options.twitter || '',
        telegram: options.telegram || '',
        website: options.website || '',
        imagePath
      }
    });
    
    if (result && result.success) {
      const mintAddress = result.mint || result.signatures[0];
      logOperation(`代币创建成功! 地址: ${mintAddress}`);
      logOperation(`交易签名: ${result.signatures.join(', ')}`);
      
      // 记录交易信息
      result.signatures.forEach(sig => {
        logTrade(`创建交易: ${sig} (mint: ${mintAddress})`);
      });
      
      // 如果配置了创建后自动拉盘，则启动拉盘
      if (options.autoLapan) {
        await startLapan(mintAddress, options.lapanOptions || {});
      }
      
      return { success: true, mintAddress, signatures: result.signatures };
    } else {
      logOperation(`创建失败: ${JSON.stringify(result)}`);
      return { success: false, error: 'CREATE_FAILED', result };
    }
  } catch (error) {
    logOperation(`创建过程中出错: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// 拉盘
async function startLapan(mintAddress, options = {}) {
  if (!mintAddress) {
    console.error('错误: 请提供代币地址');
    return { success: false, error: 'NO_MINT_ADDRESS' };
  }
  
  console.log(`开始拉盘代币: ${mintAddress}`);
  logOperation(`开始拉盘代币: ${mintAddress}`);
  
  // 默认设置
  const settings = {
    minDelay: options.minDelay || 2000,
    maxDelay: options.maxDelay || 5000,
    minWallets: options.minWallets || 1,
    maxWallets: options.maxWallets || 3,
    minAmount: options.minAmount || 0.1,
    maxAmount: options.maxAmount || 0.3,
    duration: options.duration || 10 // 分钟
  };
  
  logOperation(`拉盘设置: 延迟${settings.minDelay/1000}-${settings.maxDelay/1000}秒, 钱包${settings.minWallets}-${settings.maxWallets}个, 金额${settings.minAmount}-${settings.maxAmount}SOL, 持续${settings.duration}分钟`);
  
  try {
    // 启动拉盘
    await startLapanLoop(mintAddress, (result) => {
      if (result && result.success) {
        logOperation(`拉盘交易成功: ${result.signatures.join(', ')}`);
        // 记录交易信息
        result.signatures.forEach(sig => {
          logTrade(`拉盘交易: ${sig} (mint: ${mintAddress})`);
        });
      } else {
        logOperation(`拉盘交易失败: ${JSON.stringify(result)}`);
      }
    }, {
      minDelay: settings.minDelay,
      maxDelay: settings.maxDelay,
      minWallets: settings.minWallets,
      maxWallets: settings.maxWallets,
      minAmount: settings.minAmount,
      maxAmount: settings.maxAmount
    });
    
    console.log(`拉盘程序已启动，将持续运行${settings.duration}分钟`);
    
    if (settings.duration > 0) {
      setTimeout(() => {
        stopLapan();
        logOperation(`拉盘已自动停止 (运行了${settings.duration}分钟)`);
      }, settings.duration * 60 * 1000);
    }
    
    return { success: true, message: '拉盘已启动' };
  } catch (error) {
    logOperation(`拉盘过程中出错: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// 卖出
async function sell(mintAddress) {
  if (!mintAddress) {
    console.error('错误: 请提供代币地址');
    return { success: false, error: 'NO_MINT_ADDRESS' };
  }
  
  console.log(`开始卖出代币: ${mintAddress}`);
  logOperation(`开始卖出代币: ${mintAddress}`);
  
  try {
    const result = await sendSellBundle(mintAddress);
    
    if (result && result.success) {
      logOperation(`卖出成功! 签名: ${result.signatures.join(', ')}`);
      
      // 记录交易信息
      result.signatures.forEach(sig => {
        logTrade(`卖出交易: ${sig} (mint: ${mintAddress})`);
      });
      
      return { success: true, signatures: result.signatures };
    } else {
      logOperation(`卖出失败: ${JSON.stringify(result)}`);
      return { success: false, error: 'SELL_FAILED', result };
    }
  } catch (error) {
    logOperation(`卖出过程中出错: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// 主程序入口
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (!command) {
    console.log('用法:');
    console.log('  node pm2-trader.js create [name] [symbol] [description]  - 创建代币');
    console.log('  node pm2-trader.js lapan <mintAddress> [duration]        - 拉盘');
    console.log('  node pm2-trader.js sell <mintAddress>                    - 卖出代币');
    console.log('  node pm2-trader.js auto-trade [name] [symbol] [duration] - 创建并自动拉盘');
    process.exit(0);
  }
  
  try {
    switch (command) {
      case 'create':
        // 创建代币
        const name = args[1] || 'MyToken';
        const symbol = args[2] || 'MT';
        const description = args[3] || '一个测试代币';
        
        const createResult = await createAndBuy({
          name,
          symbol,
          description
        });
        
        console.log(JSON.stringify(createResult, null, 2));
        
        // 如果成功创建代币，保存 mint 地址到文件中
        if (createResult.success) {
          fs.writeFileSync(path.join(logDir, 'last_mint.txt'), createResult.mintAddress);
        }
        break;
        
      case 'lapan':
        // 拉盘
        const lapanMint = args[1];
        if (!lapanMint) {
          console.error('错误: 请提供代币地址');
          process.exit(1);
        }
        
        const duration = parseInt(args[2] || '10', 10);
        const lapanResult = await startLapan(lapanMint, { duration });
        console.log(JSON.stringify(lapanResult, null, 2));
        
        // 这里不退出程序，让拉盘继续运行
        if (lapanResult.success) {
          console.log('拉盘程序已启动，PM2 将保持程序运行');
        } else {
          process.exit(1);
        }
        break;
        
      case 'sell':
        // 卖出
        const sellMint = args[1];
        if (!sellMint) {
          console.error('错误: 请提供代币地址');
          process.exit(1);
        }
        
        const sellResult = await sell(sellMint);
        console.log(JSON.stringify(sellResult, null, 2));
        process.exit(sellResult.success ? 0 : 1);
        break;
        
      case 'auto-trade':
        // 自动交易：创建代币并自动拉盘
        const autoName = args[1] || 'AutoToken';
        const autoSymbol = args[2] || 'AT';
        const autoDuration = parseInt(args[3] || '10', 10);
        
        const autoResult = await createAndBuy({
          name: autoName,
          symbol: autoSymbol,
          description: '自动交易代币',
          autoLapan: true,
          lapanOptions: {
            duration: autoDuration
          }
        });
        
        console.log(JSON.stringify(autoResult, null, 2));
        
        // 如果成功创建代币，保存 mint 地址到文件中
        if (autoResult.success) {
          fs.writeFileSync(path.join(logDir, 'last_mint.txt'), autoResult.mintAddress);
          console.log('自动交易已启动，PM2 将保持程序运行');
        } else {
          process.exit(1);
        }
        break;
        
      default:
        console.error(`未知命令: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    console.error('程序执行出错:', error);
    process.exit(1);
  }
}

// 捕获未处理的异常和拒绝
process.on('uncaughtException', (err) => {
  console.error('未捕获的异常:', err);
  logOperation(`未捕获的异常: ${err.message}`);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的拒绝:', reason);
  logOperation(`未处理的拒绝: ${reason}`);
});

// 启动主程序
main(); 