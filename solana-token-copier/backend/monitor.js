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
    
    // 初始化Solana连接 - 显式指定WebSocket端点
    const connection = new Connection(
      config.rpcUrl,
      {
        wsEndpoint: config.wsUrl,
        commitment: 'finalized' // 使用finalized而不是confirmed
      }
    );
    
    // 测试连接
    console.log('测试Solana连接...');
    try {
      const blockHeight = await connection.getBlockHeight();
      console.log(`HTTP连接成功，当前区块高度: ${blockHeight}`);
      
      // 测试WebSocket连接
      console.log('测试WebSocket连接...');
      try {
        // 创建一个延迟函数
        const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
        
        const dummyPublicKey = Keypair.generate().publicKey;
        console.log(`- 尝试订阅账户 ${dummyPublicKey.toString()}`);
        
        // 添加账户变更监听器（这会启动WebSocket连接）
        const testId = await connection.onAccountChange(
          dummyPublicKey,
          () => {
            console.log('收到账户变更事件（测试用）');
          },
          'confirmed'
        );
        
        // 等待一段时间，确保WebSocket连接完全建立
        console.log('等待WebSocket连接建立...');
        await delay(2000); // 等待2秒
        
        // 移除测试监听器
        await connection.removeAccountChangeListener(testId);
        console.log('WebSocket连接成功');
      } catch (wsErr) {
        console.error(`WebSocket连接测试失败: ${wsErr.message}`);
        throw new Error(`无法建立WebSocket连接: ${wsErr.message}`);
      }
    } catch (connErr) {
      console.error(`Solana连接测试失败: ${connErr.message}`);
      throw new Error(`无法连接到Solana网络: ${connErr.message}`);
    }
    
    // 创建有效的wallet对象 - 使用NodeWallet，与pumpBuildTx保持一致
    const wallet = new NodeWallet(Keypair.generate());
    
    // 创建Provider - 使用与pumpBuildTx完全相同的配置
    const provider = new AnchorProvider(
      connection, 
      wallet, 
      { 
        commitment: 'finalized',     // 使用finalized而不是confirmed
        preflightCommitment: 'finalized',
        skipPreflight: false
      }
    );
    
    // 确认provider已正确初始化
    if (!provider || !provider.connection) {
      throw new Error('Provider初始化失败');
    }
    
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