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
  newTx.add(tx);
  
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

// 构建版本化交易
const buildVersionedTx = async (
  connection,
  payer,
  tx,
  commitment = DEFAULT_COMMITMENT
) => {
  const blockHash = (await connection.getLatestBlockhash(commitment)).blockhash;

  let messageV0 = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockHash,
    instructions: tx.instructions,
  }).compileToV0Message();

  return new VersionedTransaction(messageV0);
};

// SOL转BigInt
function solToBigInt(sol) {
  return BigInt(Math.floor(sol * 1e9))
}

// Jito小费账户列表
const JITO_TIP_ACCOUNTS = [
  'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
  'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
  '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
  '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
  'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
  'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
  'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
  'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh'
].map(addr => new PublicKey(addr));

// 获取随机Jito小费账户
function getRandomJitoTipAccount() {
  const randomIndex = Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length);
  return JITO_TIP_ACCOUNTS[randomIndex];
}

module.exports = {
  DEFAULT_COMMITMENT,
  DEFAULT_FINALITY,
  calculateWithSlippageBuy,
  calculateWithSlippageSell,
  sendTx,
  buildVersionedTx,
  solToBigInt,
  getRandomJitoTipAccount
}; 