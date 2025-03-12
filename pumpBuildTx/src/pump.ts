import { AnchorProvider } from "@coral-xyz/anchor";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { lamportsPerSol, PumpFunSDK } from "./pumpfun";
import { solToBigInt } from "./util";
import { deleteUser, findUserByKeys, updateUser } from "./database/curd";

export const pumpCreateAndBuy = async (
  publicKey: string,
  action: string,
  tokenMetadata: {
    name: string;
    symbol: string;
    uri: string;
  },
  mint: string,
  denominatedInSol: string,
  amount: number,
  slippage: number,
  priorityFee: number,
  pool: string
) => {
  const connection = new Connection(process.env.HELIUS_RPC_URL || "");
  let wallet = new NodeWallet(new Keypair()); //note this is not used
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "finalized",
  });
  let sdk = new PumpFunSDK(provider);
  const createTx = await sdk.createAndBuy(
    new PublicKey(publicKey),
    new PublicKey(mint),
    tokenMetadata,
    solToBigInt(amount)
  );
  return createTx;
};

export const pumpBuy = async (
  publicKey: string,
  action: string,
  mint: string,
  denominatedInSol: string,
  amount: number,
  slippage: number,
  priorityFee: number,
  pool: string,
  payJito: boolean = false
) => {
  const connection = new Connection(process.env.HELIUS_RPC_URL || "");
  let wallet = new NodeWallet(new Keypair()); //note this is not used
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "finalized",
  });
  let sdk = new PumpFunSDK(provider);
  const buyTx = await sdk.buy(
    new PublicKey(publicKey),
    new PublicKey(mint),
    solToBigInt(amount),
    payJito
  );
  return buyTx;
};

export const pumpSell = async (
  publicKey: string,
  action: string,
  mint: string,
  denominatedInSol: string,
  amount: number,
  slippage: number,
  priorityFee: number,
  pool: string,
  payJito: boolean = false
) => {
  const connection = new Connection(process.env.HELIUS_RPC_URL || "");
  let wallet = new NodeWallet(new Keypair()); //note this is not used
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "finalized",
  });
  let sdk = new PumpFunSDK(provider);
  const allAmount = await findUserByKeys(publicKey, mint);
  if (allAmount) {
    const sellAmount = allAmount.amount * (100 / amount);
    const buyTx = await sdk.sell(
      new PublicKey(publicKey),
      new PublicKey(mint),
      BigInt(sellAmount),
      payJito
    );

    //处理数据库数据
    if (amount == 100) {
      //删除数据
      await deleteUser(publicKey, mint);
    } else {
      //更新数据
      await updateUser(
        allAmount.id,
        allAmount.userPkey,
        allAmount.mintKey,
        allAmount.amount - sellAmount
      );
    }
    return buyTx;
  } else {
    const buyTx = await sdk.sell(
      new PublicKey(publicKey),
      new PublicKey(mint),
      BigInt(0),
      payJito
    );
    return buyTx;
  }
};
