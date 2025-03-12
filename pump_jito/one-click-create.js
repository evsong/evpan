#!/usr/bin/env node
require('dotenv').config();
const { sendLocalCreateBundle } = require('./src/create');
const { startLapanLoop, stopLapan } = require('./src/lapan');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// 创建readline接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

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

// 一键创建代币
async function oneClickCreate() {
  try {
    // 检查服务器
    console.log('正在检查本地服务器...');
    const serverRunning = await checkServer();
    if (!serverRunning) {
      console.error('错误: 本地服务器未运行，请先在另一个终端启动服务器:');
      console.error('cd /root/pan/pumpBuildTx && node src/app.ts');
      process.exit(1);
    }
    
    console.log('本地服务器正在运行...');
    
    // 确保图片存在
    const imagePath = await ensureImageExists();
    
    // 询问代币信息
    rl.question('请输入代币名称 (默认: MyToken): ', async (name) => {
      name = name || 'MyToken';
      
      rl.question('请输入代币符号 (默认: MT): ', async (symbol) => {
        symbol = symbol || 'MT';
        
        rl.question('请输入代币描述 (默认: "一个测试代币"): ', async (description) => {
          description = description || '一个测试代币';
          
          console.log(`\n开始创建代币: ${name} (${symbol})`);
          
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
              console.log('\n✅ 代币创建成功!');
              console.log('代币地址:', result.mint);
              console.log('交易签名:', result.signatures.join(', '));
              console.log('\n是否要开始拉盘? (y/n)');
              
              rl.question('> ', async (answer) => {
                if (answer.toLowerCase() === 'y') {
                  console.log('开始拉盘程序...');
                  await startLapanLoop(result.mint, (lapanResult) => {
                    console.log('拉盘结果:', lapanResult);
                  }, {
                    minDelay: 5000,
                    maxDelay: 15000,
                    minWallets: 1, 
                    maxWallets: 3
                  });
                  
                  console.log('拉盘程序已启动，将持续运行10分钟');
                  setTimeout(() => {
                    stopLapan();
                    console.log('拉盘已自动停止');
                    rl.close();
                    process.exit(0);
                  }, 10 * 60 * 1000);
                } else {
                  console.log('拉盘已取消');
                  rl.close();
                  process.exit(0);
                }
              });
            } else {
              console.error('创建失败:', result);
              rl.close();
              process.exit(1);
            }
          } catch (error) {
            console.error('创建过程中出错:', error);
            rl.close();
            process.exit(1);
          }
        });
      });
    });
  } catch (error) {
    console.error('执行过程中出错:', error);
    rl.close();
    process.exit(1);
  }
}

// 运行主函数
oneClickCreate(); 