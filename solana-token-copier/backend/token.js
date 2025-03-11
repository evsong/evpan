const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { PumpFunSDK } = require('../sdk');
const { AnchorProvider } = require('@coral-xyz/anchor');
const base58 = require('base-58');
const fetch = require('node-fetch');
const config = require('./config');
const { updateTokenStatus } = require('./redis');
const { prepareMetadata, uploadMetadata } = require('./metadata');

// 创建钱包
const getCreatorWallet = () => {
  const creatorKeyPair = Keypair.fromSecretKey(
    base58.decode(config.creatorPrivateKey)
  );
  
  return {
    publicKey: creatorKeyPair.publicKey,
    signTransaction: async (tx) => {
      tx.sign(creatorKeyPair);
      return tx;
    },
    signAllTransactions: async (txs) => {
      return txs.map(tx => {
        tx.sign(creatorKeyPair);
        return tx;
      });
    },
    keypair: creatorKeyPair
  };
};

/**
 * 创建代币
 * @param {Object} tokenInfo 代币信息
 * @returns {Object} 创建结果
 */
async function createToken(tokenInfo) {
  try {
    console.log(`开始创建代币: ${tokenInfo.name} (${tokenInfo.symbol})`);
    
    // 初始化连接和SDK
    const connection = new Connection(config.rpcUrl);
    const wallet = getCreatorWallet();
    
    const provider = new AnchorProvider(
      connection, 
      wallet,
      { commitment: 'confirmed' }
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
    
    // 使用SDK创建代币并买入
    console.log('创建代币并买入...');
    const createTx = await sdk.createAndBuy(
      wallet.publicKey,
      mintKeypair.publicKey,
      {
        name: tokenInfo.name,
        symbol: tokenInfo.symbol,
        uri: metadataResult.metadataUri
      },
      config.initialBuyAmount,
      BigInt(1000), // 滑点设置
      { // 优先级费用
        unitLimit: 1_400_000,
        unitPrice: 200_000
      }
    );
    
    // 签名交易
    console.log('签名交易...');
    createTx.sign([mintKeypair, wallet.keypair]);
    
    // 构建Jito请求
    console.log('发送交易到Jito...');
    const encodedTx = base58.encode(createTx.serialize());
    const jitoResponse = await fetch(config.jitoUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "sendBundle",
        params: [
          [encodedTx]
        ]
      })
    });
    
    const jitoResult = await jitoResponse.json();
    console.log('Jito响应:', jitoResult);
    
    // 尝试获取签名
    let signature = "";
    try {
      if (jitoResult && jitoResult.result && jitoResult.result.txResults) {
        signature = jitoResult.result.txResults[0].signature || "";
      }
    } catch (e) {
      console.warn('无法提取交易签名:', e.message);
    }
    
    // 更新代币状态
    const newMintAddress = mintKeypair.publicKey.toString();
    await updateTokenStatus(tokenInfo.mint, {
      ourMint: newMintAddress,
      status: 'created',
      createdAt: Date.now(),
      sellAt: Date.now() + config.holdDuration,
      signature: signature
    });
    
    // 设置卖出定时器
    console.log(`设置卖出定时器, ${config.holdDuration/1000}秒后卖出...`);
    setTimeout(() => sellToken(newMintAddress), config.holdDuration);
    
    console.log(`代币创建成功: ${newMintAddress}`);
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
    const connection = new Connection(config.rpcUrl);
    const wallet = getCreatorWallet();
    
    const provider = new AnchorProvider(
      connection, 
      wallet,
      { commitment: 'confirmed' }
    );
    
    const sdk = new PumpFunSDK(provider);
    
    // 获取代币余额
    console.log('获取代币余额...');
    const tokenAccounts = await connection.getTokenAccountsByOwner(
      wallet.publicKey,
      { mint: new PublicKey(mintAddress) }
    );
    
    if (tokenAccounts.value.length === 0) {
      console.log(`没有持有代币: ${mintAddress}`);
      return { success: false, error: "没有持有代币" };
    }
    
    // 解析账户数据获取余额
    const accountInfo = tokenAccounts.value[0].account.data;
    const buffer = accountInfo.buffer.slice(accountInfo.byteOffset, accountInfo.byteOffset + accountInfo.length);
    const amount = buffer.readBigUInt64LE(64); // 读取余额
    console.log(`当前持有代币数量: ${amount}`);
    
    // 卖出代币
    console.log('卖出代币...');
    const sellTx = await sdk.sell(
      wallet.publicKey,
      new PublicKey(mintAddress),
      amount, // 全部卖出
      true, // 支付Jito小费
      BigInt(1000), // 滑点设置
      { // 优先级费用
        unitLimit: 1_400_000,
        unitPrice: 200_000
      }
    );
    
    // 签名交易
    console.log('签名交易...');
    sellTx.sign([wallet.keypair]);
    
    // 发送到Jito
    console.log('发送交易到Jito...');
    const encodedTx = base58.encode(sellTx.serialize());
    const jitoResponse = await fetch(config.jitoUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "sendBundle",
        params: [
          [encodedTx]
        ]
      })
    });
    
    const jitoResult = await jitoResponse.json();
    console.log('Jito响应:', jitoResult);
    
    // 尝试获取签名
    let signature = "";
    try {
      if (jitoResult && jitoResult.result && jitoResult.result.txResults) {
        signature = jitoResult.result.txResults[0].signature || "";
      }
    } catch (e) {
      console.warn('无法提取交易签名:', e.message);
    }
    
    // 更新代币状态
    await updateTokenStatus(mintAddress, {
      status: 'sold',
      soldAt: Date.now(),
      sellSignature: signature
    });
    
    console.log(`代币卖出成功: ${mintAddress}`);
    return { 
      success: true,
      signature: signature 
    };
  } catch (error) {
    console.error(`卖出代币失败: ${error.message}`);
    return { success: false, error: error.message };
  }
}

module.exports = { createToken, sellToken }; 