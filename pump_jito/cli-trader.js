#!/usr/bin/env node
require('dotenv').config();
const { sendLocalCreateBundle } = require('./src/create');
const { startLapanLoop, stopLapan } = require('./src/lapan');
const { sendSellBundle } = require('./src/sell');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
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

// 显示操作日志
function showOperationLogs() {
  try {
    if (fs.existsSync(operationLogFile)) {
      const logs = fs.readFileSync(operationLogFile, 'utf8');
      console.log('\n=== 操作日志 ===');
      console.log(logs || '无操作记录');
    } else {
      console.log('\n=== 操作日志 ===');
      console.log('无操作记录');
    }
  } catch (error) {
    console.error('读取操作日志出错:', error.message);
  }
}

// 显示交易日志
function showTradeLogs() {
  try {
    if (fs.existsSync(tradeLogFile)) {
      const logs = fs.readFileSync(tradeLogFile, 'utf8');
      console.log('\n=== 交易信息 ===');
      console.log(logs || '无交易记录');
    } else {
      console.log('\n=== 交易信息 ===');
      console.log('无交易记录');
    }
  } catch (error) {
    console.error('读取交易日志出错:', error.message);
  }
}

// 清除日志
function clearLogs(type) {
  try {
    if (type === 'operation' || type === 'all') {
      fs.writeFileSync(operationLogFile, '');
      console.log('操作日志已清除');
    }
    if (type === 'trade' || type === 'all') {
      fs.writeFileSync(tradeLogFile, '');
      console.log('交易信息已清除');
    }
  } catch (error) {
    console.error('清除日志出错:', error.message);
  }
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

// 确保图片文件存在
async function ensureImageExists() {
  const imagePath = path.join(__dirname, 'src', 'temp_image.png');
  
  if (!fs.existsSync(imagePath)) {
    console.log('警告: 图片文件不存在，将创建一个空图片');
    fs.writeFileSync(imagePath, ''); // 创建空文件
    console.log('已创建空图片文件:', imagePath);
    console.log('注意: 建议使用真实的图片文件获得更好的效果');
  }
  
  return imagePath;
}

// 获取代币信息
async function getTokenInfo(mintAddress) {
  try {
    // 这里可以通过 RPC 获取代币信息
    return {
      address: mintAddress,
      name: '获取中...',
      symbol: '获取中...',
      supply: '获取中...'
    };
  } catch (error) {
    console.error('获取代币信息失败:', error.message);
    return {
      address: mintAddress,
      name: '未知',
      symbol: '未知',
      supply: '未知'
    };
  }
}

// 开盘（创建并买入）
async function createAndBuy() {
  // 检查服务器
  console.log('正在检查本地服务器...');
  const serverRunning = await checkServer();
  if (!serverRunning) {
    console.error('错误: 本地服务器未运行，请先在另一个终端启动服务器:');
    console.error('cd /root/pan/pumpBuildTx && node src/app.ts');
    return false;
  }
  
  console.log('本地服务器正在运行...');
  
  // 确保图片存在
  const imagePath = await ensureImageExists();
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  // 询问代币信息
  const name = await new Promise(resolve => {
    rl.question('请输入代币名称 (默认: MyToken): ', (answer) => {
      resolve(answer || 'MyToken');
    });
  });
  
  const symbol = await new Promise(resolve => {
    rl.question('请输入代币符号 (默认: MT): ', (answer) => {
      resolve(answer || 'MT');
    });
  });
  
  const description = await new Promise(resolve => {
    rl.question('请输入代币描述 (默认: "一个测试代币"): ', (answer) => {
      resolve(answer || '一个测试代币');
    });
  });
  
  console.log(`\n开始创建代币: ${name} (${symbol})`);
  logOperation(`开始创建代币: ${name} (${symbol})`);
  
  try {
    // 创建代币
    const result = await sendLocalCreateBundle({
      tokenMetadata: {
        name: name,
        symbol: symbol,
        description: description,
        twitter: '',
        telegram: '',
        website: '',
        imagePath: imagePath
      }
    });
    
    if (result && result.success) {
      const mintAddress = result.mint || result.signatures[0]; // 如果 mint 不存在，使用第一个签名作为标识
      logOperation(`代币创建成功! 地址: ${mintAddress}`);
      logOperation(`交易签名: ${result.signatures.join(', ')}`);
      
      // 记录交易信息
      result.signatures.forEach(sig => {
        logTrade(`创建交易: ${sig} (mint: ${mintAddress})`);
      });
      
      rl.close();
      return { success: true, mintAddress };
    } else {
      logOperation(`创建失败: ${JSON.stringify(result)}`);
      rl.close();
      return { success: false };
    }
  } catch (error) {
    logOperation(`创建过程中出错: ${error.message}`);
    rl.close();
    return { success: false, error: error.message };
  }
}

// 拉盘
async function startLapan(mintAddress) {
  if (!mintAddress) {
    console.error('错误: 请提供代币地址');
    return false;
  }
  
  console.log(`开始拉盘代币: ${mintAddress}`);
  logOperation(`开始拉盘代币: ${mintAddress}`);
  
  // 拉盘设置
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const minDelay = await new Promise(resolve => {
    rl.question('最小延迟时间(秒) (默认: 2): ', (answer) => {
      resolve(parseInt(answer || '2') * 1000);
    });
  });
  
  const maxDelay = await new Promise(resolve => {
    rl.question('最大延迟时间(秒) (默认: 5): ', (answer) => {
      resolve(parseInt(answer || '5') * 1000);
    });
  });
  
  const minWallets = await new Promise(resolve => {
    rl.question('每次最少钱包数 (默认: 1): ', (answer) => {
      resolve(parseInt(answer || '1'));
    });
  });
  
  const maxWallets = await new Promise(resolve => {
    rl.question('每次最多钱包数 (默认: 3): ', (answer) => {
      resolve(parseInt(answer || '3'));
    });
  });
  
  const minAmount = await new Promise(resolve => {
    rl.question('每笔最少金额(SOL) (默认: 0.1): ', (answer) => {
      resolve(parseFloat(answer || '0.1'));
    });
  });
  
  const maxAmount = await new Promise(resolve => {
    rl.question('每笔最多金额(SOL) (默认: 0.3): ', (answer) => {
      resolve(parseFloat(answer || '0.3'));
    });
  });
  
  const duration = await new Promise(resolve => {
    rl.question('拉盘持续时间(分钟) (默认: 10): ', (answer) => {
      resolve(parseInt(answer || '10'));
    });
  });
  
  rl.close();
  
  logOperation(`拉盘设置: 延迟${minDelay/1000}-${maxDelay/1000}秒, 钱包${minWallets}-${maxWallets}个, 金额${minAmount}-${maxAmount}SOL, 持续${duration}分钟`);
  
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
      minDelay,
      maxDelay,
      minWallets,
      maxWallets,
      minAmount,
      maxAmount
    });
    
    console.log(`拉盘程序已启动，将持续运行${duration}分钟`);
    
    setTimeout(() => {
      stopLapan();
      logOperation(`拉盘已自动停止 (运行了${duration}分钟)`);
    }, duration * 60 * 1000);
    
    return true;
  } catch (error) {
    logOperation(`拉盘过程中出错: ${error.message}`);
    return false;
  }
}

// 卖出
async function sell(mintAddress) {
  if (!mintAddress) {
    console.error('错误: 请提供代币地址');
    return false;
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
      
      return true;
    } else {
      logOperation(`卖出失败: ${JSON.stringify(result)}`);
      return false;
    }
  } catch (error) {
    logOperation(`卖出过程中出错: ${error.message}`);
    return false;
  }
}

// 显示菜单
function showMenu() {
  console.log('\n=== Pump 交易助手 (命令行版) ===');
  console.log('1. 开盘 (创建并买入)');
  console.log('2. 卖出');
  console.log('3. 拉盘');
  console.log('4. 查看操作日志');
  console.log('5. 查看盘内交易信息');
  console.log('6. 清除日志');
  console.log('0. 退出');
  console.log('============================');
}

// 主程序
async function main() {
  let currentMintAddress = '';
  
  // 如果已存在日志文件，尝试从中提取最后使用的代币地址
  try {
    if (fs.existsSync(operationLogFile)) {
      const logs = fs.readFileSync(operationLogFile, 'utf8');
      const mintMatches = logs.match(/地址: ([a-zA-Z0-9]{32,})/g);
      if (mintMatches && mintMatches.length > 0) {
        const lastMintMatch = mintMatches[mintMatches.length - 1];
        currentMintAddress = lastMintMatch.replace('地址: ', '');
      }
    }
  } catch (error) {
    // 忽略错误
  }
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  let running = true;
  
  while (running) {
    showMenu();
    
    if (currentMintAddress) {
      console.log(`当前代币地址: ${currentMintAddress}`);
    }
    
    const choice = await new Promise(resolve => {
      rl.question('请选择操作 (0-6): ', (answer) => {
        resolve(answer.trim());
      });
    });
    
    switch (choice) {
      case '1':
        // 开盘
        const createResult = await createAndBuy();
        if (createResult && createResult.success) {
          currentMintAddress = createResult.mintAddress;
        }
        break;
        
      case '2':
        // 卖出
        if (!currentMintAddress) {
          const mintInput = await new Promise(resolve => {
            rl.question('请输入代币地址: ', (answer) => {
              resolve(answer.trim());
            });
          });
          
          if (mintInput) {
            await sell(mintInput);
            currentMintAddress = mintInput;
          } else {
            console.log('错误: 未提供代币地址');
          }
        } else {
          const confirm = await new Promise(resolve => {
            rl.question(`确认卖出代币 ${currentMintAddress}? (y/n): `, (answer) => {
              resolve(answer.toLowerCase() === 'y');
            });
          });
          
          if (confirm) {
            await sell(currentMintAddress);
          }
        }
        break;
        
      case '3':
        // 拉盘
        if (!currentMintAddress) {
          const mintInput = await new Promise(resolve => {
            rl.question('请输入代币地址: ', (answer) => {
              resolve(answer.trim());
            });
          });
          
          if (mintInput) {
            await startLapan(mintInput);
            currentMintAddress = mintInput;
          } else {
            console.log('错误: 未提供代币地址');
          }
        } else {
          const confirm = await new Promise(resolve => {
            rl.question(`确认拉盘代币 ${currentMintAddress}? (y/n): `, (answer) => {
              resolve(answer.toLowerCase() === 'y');
            });
          });
          
          if (confirm) {
            await startLapan(currentMintAddress);
          }
        }
        break;
        
      case '4':
        // 查看操作日志
        showOperationLogs();
        break;
        
      case '5':
        // 查看交易信息
        showTradeLogs();
        break;
        
      case '6':
        // 清除日志
        const clearChoice = await new Promise(resolve => {
          rl.question('清除哪种日志? (1=操作日志, 2=交易信息, 3=全部): ', (answer) => {
            resolve(answer.trim());
          });
        });
        
        if (clearChoice === '1') {
          clearLogs('operation');
        } else if (clearChoice === '2') {
          clearLogs('trade');
        } else if (clearChoice === '3') {
          clearLogs('all');
        }
        break;
        
      case '0':
        console.log('退出程序');
        running = false;
        rl.close();
        process.exit(0);
        break;
        
      default:
        console.log('无效选择，请重新输入');
        break;
    }
    
    if (running) {
      await new Promise(resolve => {
        rl.question('\n按回车键继续...', () => {
          resolve();
        });
      });
    }
  }
}

// 运行主程序
main().catch(error => {
  console.error('程序执行出错:', error);
  process.exit(1);
}); 