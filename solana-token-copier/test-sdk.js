require('dotenv').config();
const { Connection, Keypair } = require('@solana/web3.js');
const { PumpFunSDK } = require('./sdk');
const { AnchorProvider } = require('@coral-xyz/anchor');
const NodeWallet = require('@coral-xyz/anchor/dist/cjs/nodewallet').default;

async function testSDK() {
  try {
    console.log('开始测试SDK...');
    
    // 创建连接
    const rpcUrl = process.env.SOLANA_RPC_URL;
    if (!rpcUrl) {
      throw new Error('环境变量SOLANA_RPC_URL未设置');
    }
    console.log('RPC URL:', rpcUrl);
    
    const connection = new Connection(rpcUrl, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000
    });
    
    // 测试连接
    console.log('测试Solana连接...');
    try {
      const blockHeight = await connection.getBlockHeight();
      console.log('当前区块高度:', blockHeight);
      
      const recentBlockhash = await connection.getLatestBlockhash();
      console.log('最新区块哈希:', recentBlockhash.blockhash);
    } catch (connError) {
      throw new Error(`连接测试失败: ${connError.message}`);
    }
    
    // 创建测试钱包
    console.log('创建测试钱包...');
    const wallet = new NodeWallet(Keypair.generate());
    console.log('测试钱包地址:', wallet.publicKey.toString());
    
    // 创建Provider
    console.log('创建Provider...');
    const provider = new AnchorProvider(
      connection, 
      wallet,
      { 
        commitment: 'confirmed',
        preflightCommitment: 'confirmed',
        skipPreflight: false
      }
    );
    
    // 验证provider配置
    console.log('Provider配置:', {
      hasConnection: !!provider.connection,
      hasWallet: !!provider.wallet,
      hasSendTransaction: !!provider.sendTransaction,
      commitment: provider.connection.commitment
    });
    
    // 验证IDL
    console.log('验证IDL...');
    try {
      const idl = require('./sdk/IDL/pump-fun.json');
      console.log('IDL加载成功:', {
        name: idl.name,
        version: idl.version,
        programId: idl.metadata.address
      });
    } catch (idlError) {
      throw new Error(`IDL加载失败: ${idlError.message}`);
    }
    
    // 初始化SDK
    console.log('初始化PumpFunSDK...');
    const sdk = new PumpFunSDK(provider);
    
    // 测试获取全局账户
    console.log('尝试获取全局账户...');
    try {
      const globalAccount = await sdk.getGlobalAccount();
      console.log('全局账户加载成功');
      console.log('账户信息:', {
        feeRecipient: globalAccount.feeRecipient.toBase58(),
        initialVirtualTokenReserves: globalAccount.initialVirtualTokenReserves.toString(),
        initialVirtualSolReserves: globalAccount.initialVirtualSolReserves.toString(),
        feeBasisPoints: globalAccount.feeBasisPoints.toString()
      });
    } catch (accountError) {
      console.error('获取全局账户失败:', accountError);
      throw accountError;
    }
    
    console.log('SDK测试完成！');
  } catch (error) {
    console.error('SDK测试失败:', error);
    process.exit(1);
  }
}

// 运行测试
console.log('=== 开始SDK测试 ===');
testSDK()
  .then(() => {
    console.log('=== SDK测试完成 ===');
  })
  .catch((error) => {
    console.error('=== SDK测试失败 ===\n', error);
    process.exit(1);
  }); 