const { PumpFunSDK } = require('../sdk');
const { AnchorProvider } = require('@coral-xyz/anchor');
const { Connection, Keypair } = require('@solana/web3.js');
const { getCreatorWallet } = require('./token');
const config = require('./config');
const redis = require('./redis');

/**
 * 启动对特定代币的交易监控
 * @param {String} mintAddress 要监控的代币地址
 * @param {Function} onTradeEvent 交易事件的回调函数
 * @returns {Object} 带有stop方法的控制对象
 */
async function startTradeMonitoring(mintAddress, onTradeEvent) {
  console.log(`开始监听代币交易: ${mintAddress}`);
  
  // 交易统计数据
  let totalBuySOL = 0;
  let totalSellSOL = 0;
  let totalBuyCount = 0;
  let totalSellCount = 0;
  
  // 初始化Solana连接
  const connection = new Connection(config.rpcUrl);
  
  // 创建一个虚拟钱包（只用于监听，不会进行签名）
  const wallet = {
    publicKey: Keypair.generate().publicKey,
    signTransaction: () => Promise.reject(new Error('这个钱包只用于监听')),
    signAllTransactions: () => Promise.reject(new Error('这个钱包只用于监听'))
  };
  
  // 创建Provider
  const provider = new AnchorProvider(
    connection, 
    wallet, 
    { commitment: 'confirmed' }
  );
  
  // 初始化SDK
  const sdk = new PumpFunSDK(provider);
  
  // 获取创建者钱包地址，用于区分自己的交易
  const creatorWallet = getCreatorWallet();
  const creatorAddress = creatorWallet.publicKey.toString();
  
  // 记录事件ID，用于后续停止监听
  let eventIds = [];
  
  // 心跳检测定时器
  let heartbeatInterval = null;
  
  // 设置心跳检测
  const setupHeartbeat = () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }
    
    heartbeatInterval = setInterval(async () => {
      try {
        // 尝试获取区块高度来检查连接
        await connection.getSlot();
      } catch (error) {
        console.log('心跳检测失败，正在重新连接...');
        restartMonitoring();
      }
    }, 30000); // 每30秒检查一次
  };
  
  let reconnectTimeout = null;
  let isMonitoring = true;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 10;
  
  // 重新连接函数
  const restartMonitoring = () => {
    if (!isMonitoring) return;
    
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }
    
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }
    
    if (sdk && eventIds.length > 0) {
      try {
        eventIds.forEach(id => sdk.removeEventListener(id));
        eventIds = [];
      } catch (error) {
        console.error('移除旧监听器时出错:', error);
      }
    }
    
    // 5秒后重试
    reconnectTimeout = setTimeout(() => {
      if (isMonitoring && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log(`第${reconnectAttempts}次尝试重新连接...`);
        setupListeners();
      } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.log('重连次数过多，监听已停止');
        isMonitoring = false;
        onTradeEvent({
          type: 'error',
          message: '重连次数过多，监听已停止'
        });
      }
    }, 5000);
  };
  
  // 设置监听器
  const setupListeners = async () => {
    try {
      // 监听交易事件
      const tradeEventId = sdk.addEventListener('tradeEvent', async (event) => {
        if (event.mint.toString() === mintAddress) {
          const now = Date.now();
          const eventTime = event.timestamp * 1000;
          const latency = now - eventTime;
          
          // 检查是否是我们自己的钱包
          const isOurWallet = event.user.toString() === creatorAddress;
          
          // 计算SOL金额
          const solAmount = Number(event.solAmount) / 1e9;
          const tokenAmount = Number(event.tokenAmount) / 1e9;
          
          // 计算价格
          const price = tokenAmount > 0 ? (solAmount / tokenAmount).toFixed(6) : 0;
          
          // 只有不是我们的钱包才计入统计
          if (!isOurWallet) {
            if (event.isBuy) {
              totalBuySOL += solAmount;
              totalBuyCount++;
            } else {
              totalSellSOL += solAmount;
              totalSellCount++;
            }
          }
          
          // 计算进度
          const realSolReserves = Number(event.realSolReserves) / 1e9;
          const progressPercentage = calculateProgressPercentage(realSolReserves);
          
          // 构建交易信息
          const tradeInfo = {
            type: event.isBuy ? 'buy' : 'sell',
            timestamp: event.timestamp * 1000,
            mint: event.mint.toString(),
            user: event.user.toString(),
            solAmount,
            tokenAmount,
            price,
            isOurWallet,
            progressPercentage,
            stats: {
              totalBuySOL,
              totalSellSOL,
              totalBuyCount,
              totalSellCount,
              netBuySOL: totalBuySOL - totalSellSOL
            }
          };
          
          // 存储交易记录到Redis
          await storeTradeRecord(mintAddress, tradeInfo);
          
          // 向前端推送交易信息
          onTradeEvent({
            type: 'trade',
            data: tradeInfo
          });
        }
      });
      
      eventIds.push(tradeEventId);
      
      // 设置心跳检测
      setupHeartbeat();
      
      // 重置重连计数
      reconnectAttempts = 0;
      
      onTradeEvent({
        type: 'info',
        message: `已开始监控代币 ${mintAddress} 的交易`
      });
    } catch (error) {
      console.error('设置监听器时出错:', error);
      restartMonitoring();
    }
  };
  
  // 立即设置监听器
  await setupListeners();
  
  // 返回控制对象
  return {
    stop: () => {
      console.log(`停止监听代币交易: ${mintAddress}`);
      isMonitoring = false;
      
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      
      if (sdk && eventIds.length > 0) {
        eventIds.forEach(id => {
          try {
            sdk.removeEventListener(id);
          } catch (error) {
            console.error('移除事件监听器时出错:', error);
          }
        });
        eventIds = [];
      }
      
      onTradeEvent({
        type: 'info',
        message: `已停止监听代币 ${mintAddress} 的交易`
      });
    }
  };
}

/**
 * 计算代币的进度百分比（基于实际SOL储备量）
 * @param {Number} realSolReserves 实际SOL储备量
 * @returns {Number} 进度百分比
 */
function calculateProgressPercentage(realSolReserves) {
  // 这里可以根据具体需求设置不同的进度计算逻辑
  // 例如，假设5 SOL是目标，我们计算已经达到目标的百分比
  const targetSol = 5; // 5 SOL作为100%进度
  const percentage = Math.min(100, (realSolReserves / targetSol) * 100);
  return Math.round(percentage * 100) / 100; // 保留两位小数
}

/**
 * 存储交易记录到Redis
 * @param {String} mintAddress 代币地址
 * @param {Object} tradeInfo 交易信息
 */
async function storeTradeRecord(mintAddress, tradeInfo) {
  try {
    // 存储最近的50条交易记录
    const key = `token:${mintAddress}:trades`;
    await redis.redis.lpush(key, JSON.stringify(tradeInfo));
    await redis.redis.ltrim(key, 0, 49); // 只保留最近50条
    
    // 更新代币统计信息
    await redis.updateTokenStatus(mintAddress, {
      totalBuySOL: tradeInfo.stats.totalBuySOL,
      totalSellSOL: tradeInfo.stats.totalSellSOL,
      totalBuyCount: tradeInfo.stats.totalBuyCount,
      totalSellCount: tradeInfo.stats.totalSellCount,
      lastTradeTime: tradeInfo.timestamp
    });
  } catch (error) {
    console.error('存储交易记录失败:', error);
  }
}

/**
 * 获取代币的交易记录
 * @param {String} mintAddress 代币地址
 * @returns {Array} 交易记录列表
 */
async function getTradeRecords(mintAddress) {
  try {
    const key = `token:${mintAddress}:trades`;
    const records = await redis.redis.lrange(key, 0, -1);
    return records.map(record => JSON.parse(record));
  } catch (error) {
    console.error('获取交易记录失败:', error);
    return [];
  }
}

module.exports = { 
  startTradeMonitoring,
  getTradeRecords
}; 