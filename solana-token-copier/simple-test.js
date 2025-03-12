require('dotenv').config();
const { Connection, Keypair } = require('@solana/web3.js');
const { AnchorProvider } = require('@coral-xyz/anchor');
const NodeWallet = require('@coral-xyz/anchor/dist/cjs/nodewallet').default;
const { PumpFunSDK } = require('./sdk');

async function testSDK() {
  try {
    console.log('=== 开始测试SDK初始化 ===\n');
    
    // 检查环境变量
    const rpcUrl = process.env.SOLANA_RPC_URL;
    if (!rpcUrl) {
      throw new Error('环境变量SOLANA_RPC_URL未设置');
    }
    console.log('RPC URL:', rpcUrl);
    
    // 创建连接
    console.log('\n1. 创建Solana连接...');
    const connection = new Connection(rpcUrl, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000
    });
    
    // 测试连接
    const blockHeight = await connection.getBlockHeight();
    console.log('连接成功 - 当前区块高度:', blockHeight);
    
    // 创建钱包
    console.log('\n2. 创建测试钱包...');
    const wallet = new NodeWallet(Keypair.generate());
    console.log('钱包地址:', wallet.publicKey.toString());
    
    // 创建Provider
    console.log('\n3. 创建Provider...');
    const provider = new AnchorProvider(
      connection, 
      wallet,
      { 
        commitment: 'confirmed',
        preflightCommitment: 'confirmed',
        skipPreflight: false
      }
    );
    
    // 初始化SDK
    console.log('\n4. 初始化SDK...');
    const sdk = new PumpFunSDK(provider);
    
    // 测试全局账户访问
    console.log('\n5. 测试全局账户访问...');
    const globalAccount = await sdk.getGlobalAccount();
    console.log('全局账户信息:', {
      feeRecipient: globalAccount.feeRecipient.toBase58(),
      feeBasisPoints: globalAccount.feeBasisPoints.toString()
    });
    
    console.log('\n=== SDK测试完成 ===');
    return true;
  } catch (error) {
    console.error('\n测试失败:', error);
    throw error;
  }
}

// 运行测试
console.log('开始SDK测试...\n');

testSDK()
  .then(() => {
    console.log('\nSDK测试成功完成');
    process.exit(0);
  })
  .catch(error => {
    console.error('\nSDK测试失败:', error);
    process.exit(1);
  }); 