const { 
  PumpFunSDK, 
  DEFAULT_COMMITMENT,
  DEFAULT_FINALITY 
} = require('../sdk');
const { AnchorProvider } = require('@coral-xyz/anchor');
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const NodeWallet = require('@coral-xyz/anchor/dist/cjs/nodewallet').default;
const config = require('./config');
const redis = require('./redis');

/**
 * 启动对特定代币的交易监控
 * @param {String} mintAddress 要监控的代币地址
 * @param {Function} onTradeEvent 交易事件的回调函数
 * @returns {Object} 带有stop方法的控制对象
 */
async function startTradeMonitoring(mintAddress, onTradeEvent) {
  try {
    console.log(`开始监控代币交易: ${mintAddress}`);
    
    // 创建连接
    const connection = new Connection(
      config.rpcUrl,
      { 
        commitment: DEFAULT_COMMITMENT,
        confirmTransactionInitialTimeout: 60000
      }
    );
    
    // 创建钱包
    const wallet = new NodeWallet(Keypair.generate());
    
    // 创建Provider
    const provider = new AnchorProvider(
      connection, 
      wallet,
      { 
        commitment: DEFAULT_COMMITMENT,
        preflightCommitment: DEFAULT_COMMITMENT,
        skipPreflight: false
      }
    );
    
    // 初始化SDK
    const sdk = new PumpFunSDK(provider);
    
    // 记录事件ID
    let eventIds = [];
    
    // 监听交易事件
    const tradeEventId = sdk.addEventListener("tradeEvent", async (event) => {
      try {
        // 只处理指定代币的事件
        if (event.mint.toString() !== mintAddress) {
          return;
        }
        
        console.log(`检测到交易事件: ${event.mint.toString()}`);
        console.log(`交易类型: ${event.isBuy ? '买入' : '卖出'}`);
        console.log(`SOL数量: ${event.solAmount.toString()}`);
        console.log(`代币数量: ${event.tokenAmount.toString()}`);
        
        // 存储交易记录
        await storeTradeRecord(event);
        
        // 触发回调
        if (onTradeEvent) {
          onTradeEvent(event);
        }
      } catch (eventErr) {
        console.error(`处理交易事件失败: ${eventErr.message}`);
      }
    });
    
    eventIds.push(tradeEventId);
    console.log('交易监听器设置成功，ID:', tradeEventId);
    
    // 返回控制对象
    return {
      stop: () => {
        console.log(`停止监控代币交易: ${mintAddress}`);
        eventIds.forEach(id => {
          try {
            sdk.removeEventListener(id);
          } catch (e) {
            console.error(`移除监听器失败: ${e.message}`);
          }
        });
      }
    };
  } catch (error) {
    console.error(`启动交易监控失败: ${error.message}`);
    throw error;
  }
}

/**
 * 存储交易记录到Redis
 * @param {Object} event 交易事件
 */
async function storeTradeRecord(event) {
  try {
    const key = `trades:${event.mint.toString()}`;
    const record = {
      mint: event.mint.toString(),
      solAmount: event.solAmount.toString(),
      tokenAmount: event.tokenAmount.toString(),
      isBuy: event.isBuy,
      user: event.user.toString(),
      timestamp: event.timestamp,
      virtualSolReserves: event.virtualSolReserves.toString(),
      virtualTokenReserves: event.virtualTokenReserves.toString(),
      realSolReserves: event.realSolReserves.toString(),
      realTokenReserves: event.realTokenReserves.toString()
    };
    
    await redis.rpush(key, JSON.stringify(record));
  } catch (error) {
    console.error(`存储交易记录失败: ${error.message}`);
  }
}

/**
 * 获取代币的交易记录
 * @param {String} mintAddress 代币地址
 * @returns {Array} 交易记录列表
 */
async function getTradeRecords(mintAddress) {
  try {
    const key = `trades:${mintAddress}`;
    const records = await redis.lrange(key, 0, -1);
    return records.map(record => JSON.parse(record));
  } catch (error) {
    console.error(`获取交易记录失败: ${error.message}`);
    return [];
  }
}

module.exports = {
  startTradeMonitoring,
  getTradeRecords
}; 