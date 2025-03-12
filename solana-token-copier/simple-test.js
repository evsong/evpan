require('dotenv').config();
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { AnchorProvider } = require('@coral-xyz/anchor');
const NodeWallet = require('@coral-xyz/anchor/dist/cjs/nodewallet').default;

async function testBasicConnection() {
  try {
    console.log('=== 测试基本连接 ===');
    
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
    const blockHeight = await connection.getBlockHeight();
    console.log('当前区块高度:', blockHeight);
    
    const recentBlockhash = await connection.getLatestBlockhash();
    console.log('最新区块哈希:', recentBlockhash.blockhash);
    
    // 尝试查询程序账户
    const programId = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
    console.log('Program ID:', programId.toBase58());
    
    // 查找Global账户
    const [globalAccountPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("global")],
      programId
    );
    
    console.log('Global账户地址:', globalAccountPDA.toBase58());
    
    // 尝试获取账户信息
    const accountInfo = await connection.getAccountInfo(globalAccountPDA);
    console.log('获取到账户信息:', !!accountInfo);
    
    if (accountInfo) {
      console.log('账户数据大小:', accountInfo.data.length);
    }
    
    console.log('基本连接测试完成');
    return true;
  } catch (error) {
    console.error('基本连接测试失败:', error);
    return false;
  }
}

async function testSDK() {
  try {
    console.log('\n=== 测试SDK初始化 ===');
    
    // 创建连接
    const connection = new Connection(process.env.SOLANA_RPC_URL, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000
    });
    
    // 创建测试钱包
    const wallet = new NodeWallet(Keypair.generate());
    console.log('测试钱包地址:', wallet.publicKey.toString());
    
    // 创建Provider
    const provider = new AnchorProvider(
      connection, 
      wallet,
      { 
        commitment: 'confirmed',
        preflightCommitment: 'confirmed',
        skipPreflight: false
      }
    );
    
    // 导入SDK
    const { PumpFunSDK } = require('./sdk');
    
    // 初始化SDK
    console.log('初始化PumpFunSDK...');
    const sdk = new PumpFunSDK(provider);
    
    // 测试获取全局账户
    console.log('尝试获取全局账户...');
    const globalAccount = await sdk.getGlobalAccount();
    
    console.log('全局账户信息:', {
      feeRecipient: globalAccount.feeRecipient.toBase58(),
      initialVirtualTokenReserves: globalAccount.initialVirtualTokenReserves.toString(),
      initialVirtualSolReserves: globalAccount.initialVirtualSolReserves.toString(),
      feeBasisPoints: globalAccount.feeBasisPoints.toString()
    });
    
    console.log('SDK测试完成');
    return true;
  } catch (error) {
    console.error('SDK测试失败:', error);
    return false;
  }
}

// 运行测试
console.log('开始测试...\n');

testBasicConnection()
  .then(success => {
    if (success) {
      return testSDK();
    } else {
      console.log('基本连接测试失败，跳过SDK测试');
      process.exit(1);
    }
  })
  .then(success => {
    if (success) {
      console.log('\n所有测试完成');
    } else {
      console.log('\nSDK测试失败');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('\n测试过程中出现错误:', error);
    process.exit(1);
  }); 