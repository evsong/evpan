const {
  Commitment,
  ComputeBudgetProgram,
  Finality,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
  sendAndConfirmTransaction,
} = require('@solana/web3.js');
const { SDKError, ConnectionError } = require('./errors');

// 常量定义
const DEFAULT_COMMITMENT = 'confirmed';
const DEFAULT_FINALITY = 'confirmed';

/**
 * 确保输入值为 BigInt 类型
 */
function ensureBigInt(value) {
  try {
    if (typeof value === 'bigint') {
      return value;
    }
    if (typeof value === 'number') {
      return BigInt(Math.floor(value));
    }
    if (typeof value === 'string') {
      return BigInt(value);
    }
    if (value && typeof value.toString === 'function') {
      return BigInt(value.toString());
    }
    throw new Error(`无法转换 ${typeof value} 为 BigInt`);
  } catch (error) {
    console.error('BigInt转换失败:', error);
    throw error;
  }
}

/**
 * 安全的 BigInt 除法（向下取整）
 */
function safeBigIntDivision(a, b) {
  try {
    a = ensureBigInt(a);
    b = ensureBigInt(b);
    if (b === 0n) throw new Error('除数不能为零');
    return a / b;
  } catch (error) {
    console.error('BigInt除法失败:', error);
    throw error;
  }
}

/**
 * SOL转换为BigInt（1 SOL = 1e9 lamports）
 */
function solToBigInt(sol) {
  try {
    const lamports = sol * 1e9;
    return BigInt(Math.floor(lamports));
  } catch (error) {
    console.error('SOL转换失败:', error);
    throw error;
  }
}

/**
 * 计算买入滑点
 */
function calculateWithSlippageBuy(amount, slippageBasisPoints) {
  try {
    amount = ensureBigInt(amount);
    slippageBasisPoints = ensureBigInt(slippageBasisPoints);
    return amount + (amount * slippageBasisPoints) / 10000n;
  } catch (error) {
    console.error('计算买入滑点失败:', error);
    throw error;
  }
}

/**
 * 计算卖出滑点
 */
function calculateWithSlippageSell(amount, slippageBasisPoints) {
  try {
    amount = ensureBigInt(amount);
    slippageBasisPoints = ensureBigInt(slippageBasisPoints);
    return amount - (amount * slippageBasisPoints) / 10000n;
  } catch (error) {
    console.error('计算卖出滑点失败:', error);
    throw error;
  }
}

/**
 * 带重试功能的异步操作包装器
 */
async function withRetry(fn, maxRetries = 3, delay = 1000) {
  let lastError;
  
  for (let retry = 0; retry < maxRetries; retry++) {
    try {
      return await fn();
    } catch (error) {
      console.warn(`操作失败 (尝试 ${retry + 1}/${maxRetries}): ${error.message}`);
      lastError = error;
      
      // 只对网络错误重试
      if (!isNetworkError(error)) {
        throw error;
      }
      
      // 等待一段时间后重试，使用指数退避策略
      if (retry < maxRetries - 1) {
        const backoffTime = delay * Math.pow(2, retry);
        console.log(`等待 ${backoffTime}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
    }
  }
  
  throw new ConnectionError(`在 ${maxRetries} 次尝试后失败`, lastError);
}

/**
 * 判断是否为网络错误
 */
function isNetworkError(error) {
  const errorMsg = error.message.toLowerCase();
  return (
    errorMsg.includes('timeout') ||
    errorMsg.includes('network') ||
    errorMsg.includes('econnreset') ||
    errorMsg.includes('etimedout') ||
    errorMsg.includes('econnrefused') ||
    errorMsg.includes('429') || // Too Many Requests
    errorMsg.includes('503') || // Service Unavailable
    errorMsg.includes('504')    // Gateway Timeout
  );
}

/**
 * 发送交易
 */
async function sendTx(
  connection,
  transaction,
  signer,
  priorityFees,
  commitment = DEFAULT_COMMITMENT,
  finality = DEFAULT_FINALITY,
  payJito = false
) {
  try {
    // 获取最新区块哈希
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(commitment);
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = signer.publicKey;

    // 如果需要添加优先费用
    if (priorityFees) {
      // TODO: 实现优先费用逻辑
    }

    // 签名并发送交易
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [signer],
      {
        commitment,
        preflightCommitment: commitment,
        skipPreflight: false
      }
    );

    return signature;
  } catch (error) {
    console.error('发送交易失败:', error);
    throw error;
  }
}

// 构建版本化交易
async function buildVersionedTx(
  connection,
  payer,
  tx,
  commitment = DEFAULT_COMMITMENT
) {
  const { blockhash, lastValidBlockHeight } = 
    await connection.getLatestBlockhash(commitment);

  tx.recentBlockhash = blockhash;
  tx.feePayer = payer;

  const messageV0 = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: tx.instructions,
  }).compileToV0Message();

  return new VersionedTransaction(messageV0);
}

// 获取随机Jito小费账户
function getRandomJitoTipAccount() {
  const tipAccounts = [
    "JitoNbKrCGpBR3bKbVn9yrpwLRyExKrQBwc8Zqe75GUe",
    "JitoVxJ7HoKwWLcnpkVQGJ9RsxLLuVZiJz9AEhzfGBGz",
    "JitouttGXhCYYGHKXz4yWXhDKpGVxQGBsMGJJwXvHxX9",
  ];
  return new PublicKey(tipAccounts[Math.floor(Math.random() * tipAccounts.length)]);
}

module.exports = {
  DEFAULT_COMMITMENT,
  DEFAULT_FINALITY,
  ensureBigInt,
  safeBigIntDivision,
  solToBigInt,
  calculateWithSlippageBuy,
  calculateWithSlippageSell,
  withRetry,
  isNetworkError,
  sendTx,
  buildVersionedTx,
  getRandomJitoTipAccount
}; 