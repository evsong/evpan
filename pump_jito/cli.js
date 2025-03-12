#!/usr/bin/env node
require('dotenv').config();
const { sendLocalCreateBundle } = require('./src/create');
const { startLapanLoop, stopLapan } = require('./src/lapan');
const { sendSellBundle } = require('./src/sell');
const fs = require('fs');
const path = require('path');

// 检查图片文件
const imagePath = path.join(__dirname, 'src', 'temp_image.png');
if (!fs.existsSync(imagePath)) {
  console.error('错误: 图片文件不存在:', imagePath);
  console.log('请创建或复制图片文件到此路径');
  process.exit(1);
}

// 解析命令行参数
const args = process.argv.slice(2);
const command = args[0];

async function main() {
  try {
    switch (command) {
      case 'create':
        // 创建代币
        console.log('开始创建代币...');
        const tokenName = args[1] || 'MyToken';
        const tokenSymbol = args[2] || 'MT';
        const result = await sendLocalCreateBundle({
          tokenMetadata: {
            name: tokenName,
            symbol: tokenSymbol,
            description: '通过命令行创建的代币',
            twitter: '',
            telegram: '',
            website: '',
            imagePath: imagePath
          }
        });
        console.log('创建结果:', result);
        break;

      case 'lapan':
        // 拉盘
        if (!args[1]) {
          console.error('错误: 请提供代币地址');
          process.exit(1);
        }
        console.log('开始拉盘...');
        await startLapanLoop(args[1], (result) => {
          console.log('拉盘结果:', result);
        }, {
          minDelay: 5000,
          maxDelay: 15000,
          minWallets: 1,
          maxWallets: 3
        });
        // 持续运行10分钟
        setTimeout(() => {
          stopLapan();
          console.log('拉盘已停止');
        }, 10 * 60 * 1000);
        break;

      case 'sell':
        // 卖出
        if (!args[1]) {
          console.error('错误: 请提供代币地址');
          process.exit(1);
        }
        console.log('开始卖出...');
        const sellResult = await sendSellBundle(args[1]);
        console.log('卖出结果:', sellResult);
        break;

      default:
        console.log(`
使用方法:
  node cli.js create [代币名称] [代币符号]  - 创建新代币
  node cli.js lapan <代币地址>            - 开始拉盘
  node cli.js sell <代币地址>             - 卖出代币
        `);
        break;
    }
  } catch (error) {
    console.error('执行出错:', error);
  }
}

main(); 