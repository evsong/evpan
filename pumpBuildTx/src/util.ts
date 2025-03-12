import {
  Commitment,
  ComputeBudgetProgram,
  Connection,
  Finality,
  Keypair,
  PublicKey,
  SendTransactionError,
  SystemProgram,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
  VersionedTransactionResponse,
} from "@solana/web3.js";
import { PriorityFee, TransactionResult } from "./types";

export const DEFAULT_COMMITMENT: Commitment = "finalized";
export const DEFAULT_FINALITY: Finality = "finalized";
export const calculateWithSlippageBuy = (
  amount: bigint,
  basisPoints: bigint
) => {
  return amount + (amount * basisPoints) / 10000n;
};

export const calculateWithSlippageSell = (
  amount: bigint,
  basisPoints: bigint
) => {
  return amount - (amount * basisPoints) / 10000n;
};

export async function sendTx(
  connection: Connection,
  tx: Transaction,
  payer: PublicKey,
  priorityFees?: PriorityFee,
  commitment: Commitment = DEFAULT_COMMITMENT,
  finality: Finality = DEFAULT_FINALITY,
  jitoFee: Boolean = false
): Promise<VersionedTransaction> {
  let newTx = new Transaction();

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

  newTx.add(tx);
  if (jitoFee){
    const tipAccount = getRandomJitoTipAccount();
    console.log("随机选择jito 小费账户，tipAccount:", tipAccount);
    newTx.add(
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: tipAccount,
        lamports: 0.0001 * 1e9,
      })
    );
    console.log("jito小费转账transfer已加入newTx");
  }

  let versionedTx = await buildVersionedTx(
    connection,
    payer,
    newTx,
    commitment
  );
  // versionedTx.sign(signers);
  return versionedTx;
}

export const buildVersionedTx = async (
  connection: Connection,
  payer: PublicKey,
  tx: Transaction,
  commitment: Commitment = DEFAULT_COMMITMENT
): Promise<VersionedTransaction> => {
  const blockHash = (await connection.getLatestBlockhash(commitment)).blockhash;

  let messageV0 = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockHash,
    instructions: tx.instructions,
  }).compileToV0Message();

  return new VersionedTransaction(messageV0);
};

export const getTxDetails = async (
  connection: Connection,
  sig: string,
  commitment: Commitment = DEFAULT_COMMITMENT,
  finality: Finality = DEFAULT_FINALITY
): Promise<VersionedTransactionResponse | null> => {
  const latestBlockHash = await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    {
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: sig,
    },
    commitment
  );

  return connection.getTransaction(sig, {
    maxSupportedTransactionVersion: 0,
    commitment: finality,
  });
};

export function solToBigInt(sol: number): bigint {
  return BigInt(Math.floor(sol * 1e9))
}

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
// Jito 提示（小费）账户的列表，随机选择一个用于支付小费。
export function getRandomJitoTipAccount() {
  const randomIndex = Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length);
  // 随机生成一个索引。
  return JITO_TIP_ACCOUNTS[randomIndex];
  // 返回对应的提示账户 PublicKey。
}