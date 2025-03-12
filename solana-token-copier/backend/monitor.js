const { PumpFunSDK } = require('../sdk');
const { AnchorProvider } = require('@coral-xyz/anchor');
const { Connection, Keypair } = require('@solana/web3.js');
const NodeWallet = require('@coral-xyz/anchor/dist/cjs/nodewallet').default;
const { handleNewToken } = require('./metadata');
const config = require('./config');

/**
 * 启动监听新代币的服务
 * @param {Function} onTokenDiscovered 发现新代币时的回调
 * @returns {Object} 带有stop方法的控制对象
 */
async function startMonitoring(onTokenDiscovered) {
  try {
    console.log('开始监听新代币创建事件...');
    
    // 简化Solana连接创建，不显式指定WebSocket端点
    const connection = new Connection(
      config.rpcUrl,
      { commitment: 'finalized' }
    );
    
    // 测试连接
    console.log('测试Solana连接...');
    try {
      const blockHeight = await connection.getBlockHeight();
      console.log(`连接成功，当前区块高度: ${blockHeight}`);
    } catch (connErr) {
      console.error(`Solana连接测试失败: ${connErr.message}`);
      throw new Error(`无法连接到Solana网络: ${connErr.message}`);
    }
    
    // 创建有效的wallet对象
    const wallet = new NodeWallet(Keypair.generate());
    
    // 创建Provider - 使用简单配置，与pumpBuildTx保持一致
    const provider = new AnchorProvider(
      connection, 
      wallet, 
      { commitment: 'finalized' }
    );
    
    // 初始化SDK
    console.log('初始化PumpFunSDK...');
    const sdk = new PumpFunSDK(provider);
    
    // 记录事件ID，用于后续停止监听
    let eventIds = [];
    
    // 监听创建事件
    console.log('设置事件监听器...');
    try {
      const createEventId = sdk.addEventListener("createEvent", async (event) => {
        try {
          console.log(`发现新代币: ${event.name} (${event.symbol})`);
          console.log(`Mint地址: ${event.mint.toString()}`);
          console.log(`URI: ${event.uri}`);
          
          // 处理新代币
          const tokenInfo = await handleNewToken(event);
          
          // 触发回调
          if (onTokenDiscovered && tokenInfo) {
            onTokenDiscovered(tokenInfo);
          }
        } catch (eventErr) {
          console.error(`处理代币事件失败: ${eventErr.message}`);
        }
      });
      
      eventIds.push(createEventId);
      console.log('监听器设置成功，ID:', createEventId);
    } catch (listenerErr) {
      console.error(`设置事件监听器失败: ${listenerErr.message}`);
      throw new Error(`无法设置事件监听器: ${listenerErr.message}`);
    }
    
    // 返回控制对象
    return { 
      stop: () => {
        console.log('停止监听新代币...');
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
    console.error(`启动监控失败: ${error.message}`);
    throw new Error(`启动监控失败: ${error.message}`);
  }
}

module.exports = { startMonitoring }; 