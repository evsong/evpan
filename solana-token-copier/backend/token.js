const { 
  PumpFunSDK, 
  solToBigInt,
  DEFAULT_COMMITMENT,
  DEFAULT_FINALITY 
} = require('../sdk');
const { AnchorProvider } = require('@coral-xyz/anchor');
const NodeWallet = require('@coral-xyz/anchor/dist/cjs/nodewallet').default;
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const bs58 = require('bs58');
const fetch = require('node-fetch');
const config = require('./config');
const { updateTokenStatus } = require('./redis');
const { prepareMetadata, uploadMetadata } = require('./metadata');

// 获取创建者钱包
function getCreatorWallet() {
  if (!config.creatorPrivateKey) {
    throw new Error('未配置创建者私钥');
  }
  
  const privateKey = bs58.decode(config.creatorPrivateKey);
  return new NodeWallet(Keypair.fromSecretKey(privateKey));
}

/**
 * 创建代币
 * @param {Object} tokenInfo 代币信息
 * @returns {Object} 创建结果
 */
async function createToken(tokenInfo) {
  try {
    console.log(`开始创建代币: ${tokenInfo.name} (${tokenInfo.symbol})`);
    
    // 初始化连接和SDK
    const connection = new Connection(
      config.rpcUrl,
      { 
        commitment: DEFAULT_COMMITMENT,
        confirmTransactionInitialTimeout: 60000
      }
    );
    
    const wallet = getCreatorWallet();
    const provider = new AnchorProvider(
      connection, 
      wallet,
      { 
        commitment: DEFAULT_COMMITMENT,
        preflightCommitment: DEFAULT_COMMITMENT,
        skipPreflight: false
      }
    );
    
    const sdk = new PumpFunSDK(provider);
    
    // 准备元数据
    const formData = prepareMetadata(tokenInfo);
    
    // 上传元数据
    const metadataResult = await uploadMetadata(formData);
    if (!metadataResult) {
      throw new Error('上传元数据失败');
    }
    
    // 创建代币
    const mintKeypair = Keypair.generate();
    console.log(`生成Mint密钥对: ${mintKeypair.publicKey.toString()}`);
    
    // 使用新SDK的createAndBuy函数
    const createTx = await sdk.createAndBuy(
      wallet.publicKey,
      mintKeypair.publicKey,
      {
        name: tokenInfo.name,
        symbol: tokenInfo.symbol,
        uri: metadataResult.metadataUri
      },
      solToBigInt(0.5), // 初始购买量
      BigInt(1000), // 滑点
      { 
        unitLimit: 1_400_000,
        unitPrice: 200_000
      }
    );
    
    // 签名和发送交易
    createTx.sign([mintKeypair, wallet.keypair]);
    
    // 发送到Jito
    const signature = await sendToJito(createTx);
    
    // 成功后更新Redis
    const newMintAddress = mintKeypair.publicKey.toString();
    await updateTokenStatus(tokenInfo.mint, {
      ourMint: newMintAddress,
      status: 'created',
      createdAt: Date.now(),
      sellAt: Date.now() + config.holdDuration
    });
    
    // 设置卖出定时器
    setTimeout(() => sellToken(newMintAddress), config.holdDuration);
    
    return { 
      success: true, 
      mint: newMintAddress,
      signature: signature
    };
  } catch (error) {
    console.error(`创建代币失败: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * 卖出代币
 * @param {string} mintAddress 代币地址
 * @returns {Object} 卖出结果
 */
async function sellToken(mintAddress) {
  try {
    console.log(`开始卖出代币: ${mintAddress}`);
    
    // 初始化连接和SDK
    const connection = new Connection(
      config.rpcUrl,
      { 
        commitment: DEFAULT_COMMITMENT,
        confirmTransactionInitialTimeout: 60000
      }
    );
    
    const wallet = getCreatorWallet();
    const provider = new AnchorProvider(
      connection, 
      wallet,
      { 
        commitment: DEFAULT_COMMITMENT,
        preflightCommitment: DEFAULT_COMMITMENT,
        skipPreflight: false
      }
    );
    
    const sdk = new PumpFunSDK(provider);
    
    // 获取代币余额
    const mint = new PublicKey(mintAddress);
    const tokenAccount = await getTokenAccount(connection, wallet.publicKey, mint);
    if (!tokenAccount) {
      throw new Error('找不到代币账户');
    }
    
    // 卖出全部代币
    const sellTx = await sdk.sell(
      wallet.publicKey,
      mint,
      tokenAccount.amount,
      true, // 使用Jito
      BigInt(1000), // 滑点
      { 
        unitLimit: 1_400_000,
        unitPrice: 200_000
      }
    );
    
    // 发送到Jito
    const signature = await sendToJito(sellTx);
    
    // 更新状态
    await updateTokenStatus(mintAddress, {
      status: 'sold',
      soldAt: Date.now()
    });
    
    return { 
      success: true, 
      signature: signature 
    };
  } catch (error) {
    console.error(`卖出代币失败: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// 发送交易到Jito
async function sendToJito(tx) {
  try {
    const response = await fetch(config.jitoUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transaction: tx.serialize().toString('base64')
      })
    });
    
    if (!response.ok) {
      throw new Error(`Jito API错误: ${response.status}`);
    }
    
    const result = await response.json();
    return result.signature;
  } catch (error) {
    console.error(`发送到Jito失败: ${error.message}`);
    throw error;
  }
}

// 获取代币账户
async function getTokenAccount(connection, owner, mint) {
  const accounts = await connection.getTokenAccountsByOwner(owner, {
    mint: mint
  });
  
  if (accounts.value.length === 0) {
    return null;
  }
  
  return accounts.value[0].account;
}

module.exports = {
  createToken,
  sellToken
}; 