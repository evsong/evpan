require('dotenv').config();
const { Connection, Keypair } = require('@solana/web3.js');
const { PumpFunSDK } = require('./sdk');
const { AnchorProvider } = require('@coral-xyz/anchor');
const NodeWallet = require('@coral-xyz/anchor/dist/cjs/nodewallet').default;

async function testSDK() {
  try {
    console.log('开始测试SDK...');
    console.log('RPC URL:', process.env.SOLANA_RPC_URL);
    
    // 创建连接
    const connection = new Connection(process.env.SOLANA_RPC_URL, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000
    });
    
    // 测试连接
    console.log('测试Solana连接...');
    const blockHeight = await connection.getBlockHeight();
    console.log('当前区块高度:', blockHeight);
    
    // 创建测试钱包
    const testWallet = new NodeWallet(Keypair.generate());
    console.log('测试钱包地址:', testWallet.publicKey.toString());
    
    // 创建Provider
    const provider = new AnchorProvider(
      connection, 
      testWallet,
      { 
        commitment: 'confirmed',
        preflightCommitment: 'confirmed',
        skipPreflight: false
      }
    );
    
    // 初始化SDK
    console.log('初始化PumpFunSDK...');
    const sdk = new PumpFunSDK(provider);
    
    // 测试获取全局账户
    console.log('尝试获取全局账户...');
    const globalAccount = await sdk.getGlobalAccount();
    console.log('全局账户加载成功');
    console.log('收费接收方:', globalAccount.feeRecipient.toBase58());
    console.log('初始虚拟代币储备:', globalAccount.initialVirtualTokenReserves.toString());
    console.log('初始虚拟SOL储备:', globalAccount.initialVirtualSolReserves.toString());
    console.log('手续费基点:', globalAccount.feeBasisPoints.toString());
    
    console.log('SDK测试完成！');
  } catch (error) {
    console.error('SDK测试失败:', error);
    process.exit(1);
  }
}

testSDK(); 