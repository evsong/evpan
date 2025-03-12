const {
  Commitment,
  ComputeBudgetProgram,
  Finality,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} = require('@solana/web3.js');

// 默认设置
const DEFAULT_COMMITMENT = "finalized";
const DEFAULT_FINALITY = "finalized";

// 计算买入滑点
const calculateWithSlippageBuy = (amount, basisPoints) => {
  return amount + (amount * basisPoints) / 10000n;
};

// 计算卖出滑点
const calculateWithSlippageSell = (amount, basisPoints) => {
  return amount - (amount * basisPoints) / 10000n;
};

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

// 发送交易
async function sendTx(
  connection,
  tx,
  payer,
  priorityFees,
  commitment = DEFAULT_COMMITMENT,
  finality = DEFAULT_FINALITY,
  jitoFee = false
) {
  let newTx = new Transaction();

  // 添加优先级费用
  if (priorityFees) {
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: priorityFees.unitLimit,
    });

    const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: priorityFees.unitPrice,
    });
    
    newTx.add(modifyComputeUnits);
    newTx.add(addPriorityFee);
  }

  // 添加原交易
  if (Array.isArray(tx.instructions)) {
    newTx.add(...tx.instructions);
  } else {
    newTx.add(tx);
  }
  
  // 添加Jito小费
  if (jitoFee) {
    const tipAccount = getRandomJitoTipAccount();
    
    newTx.add(
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: tipAccount,
        lamports: 0.0001 * 1e9,
      })
    );
  }

  // 构建版本化交易
  let versionedTx = await buildVersionedTx(
    connection,
    payer,
    newTx,
    commitment
  );
  
  return versionedTx;
}

// SOL转BigInt
function solToBigInt(sol) {
  return BigInt(Math.floor(sol * 1e9));
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
  calculateWithSlippageBuy,
  calculateWithSlippageSell,
  buildVersionedTx,
  sendTx,
  solToBigInt,
  getRandomJitoTipAccount
}; 