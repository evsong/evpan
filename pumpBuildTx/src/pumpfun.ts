import {
  Commitment,
  Connection,
  Finality,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { Program, Provider } from "@coral-xyz/anchor";
import { GlobalAccount } from "./globalAccount";
import {
  CompleteEvent,
  CreateEvent,
  CreateTokenMetadata,
  PriorityFee,
  PumpFunEventHandlers,
  PumpFunEventType,
  SetParamsEvent,
  TradeEvent,
  TransactionResult,
  CreateAndButTokenMetadata,
} from "./types";
import {
  toCompleteEvent,
  toCreateEvent,
  toSetParamsEvent,
  toTradeEvent,
} from "./events";
import {
  createAssociatedTokenAccountInstruction,
  getAccount,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { BondingCurveAccount } from "./bondingCurveAccount";
import { BN } from "bn.js";
import {
  DEFAULT_COMMITMENT,
  DEFAULT_FINALITY,
  calculateWithSlippageBuy,
  calculateWithSlippageSell,
  sendTx,
} from "./util";
import { PumpFun, IDL } from "./IDL";
import { solToBigInt, getRandomJitoTipAccount } from "./util";
import { createUser, findUserByKeys, updateUser } from "./database/curd";

const PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const MPL_TOKEN_METADATA_PROGRAM_ID =
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";

export const GLOBAL_ACCOUNT_SEED = "global";
export const MINT_AUTHORITY_SEED = "mint-authority";
export const BONDING_CURVE_SEED = "bonding-curve";
export const METADATA_SEED = "metadata";

export const DEFAULT_DECIMALS = 6;
export const lamportsPerSol = BigInt(1_000_000_000);
export class PumpFunSDK {
  public program: Program<PumpFun>;
  public connection: Connection;
  constructor(provider?: Provider) {
    this.program = new Program<PumpFun>(IDL as PumpFun, provider);
    this.connection = this.program.provider.connection;
  }

  async createAndBuy(
    creator: PublicKey,
    mint: PublicKey,
    createTokenMetadata: CreateAndButTokenMetadata,
    buyAmountSol: bigint,
    slippageBasisPoints: bigint = 100000n,
    priorityFees?: PriorityFee,
    commitment: Commitment = DEFAULT_COMMITMENT,
    finality: Finality = DEFAULT_FINALITY
  ): Promise<VersionedTransaction> {
    let createTx = await this.getCreateInstructions(
      creator,
      createTokenMetadata.name,
      createTokenMetadata.symbol,
      createTokenMetadata.uri,
      mint
    );

    let newTx = new Transaction().add(createTx);

    if (buyAmountSol > 0) {
      const globalAccount = await this.getGlobalAccount(commitment);
      const buyAmount = globalAccount.getInitialBuyPrice(buyAmountSol);
      const buyAmountWithSlippage = calculateWithSlippageBuy(
        buyAmountSol,
        slippageBasisPoints
      );

      const buyTx = await this.getBuyInstructions(
        creator,
        mint,
        globalAccount.feeRecipient,
        buyAmount,
        buyAmountWithSlippage
      );
      console.log(
        `开始写入数据-userPkey:${creator.toString()}-mintKey:${mint.toString()}-amount:${Number(
          buyAmount
        )}`
      );
      await createUser(creator.toString(), mint.toString(), Number(buyAmount));
      newTx.add(buyTx);
    }

    let createResults = await sendTx(
      this.connection,
      newTx,
      creator,
      priorityFees,
      commitment,
      finality,
      true
    );
    return createResults;
  }

  async buy(
    buyer: PublicKey,
    mint: PublicKey,
    buyAmountSol: bigint,
    payJito: boolean = false,
    slippageBasisPoints: bigint = 100000n,
    priorityFees?: PriorityFee,
    commitment: Commitment = DEFAULT_COMMITMENT,
    finality: Finality = DEFAULT_FINALITY
  ): Promise<VersionedTransaction> {
    let buyTx = await this.getBuyInstructionsBySolAmount(
      buyer,
      mint,
      buyAmountSol,
      slippageBasisPoints,
      commitment
    );
    let buyResults = await sendTx(
      this.connection,
      buyTx,
      buyer,
      priorityFees,
      commitment,
      finality,
      payJito
    );
    return buyResults;
  }

  async sell(
    seller: PublicKey,
    mint: PublicKey,
    sellTokenAmount: bigint,
    payJito: boolean = false,
    slippageBasisPoints: bigint = 100000n,
    priorityFees?: PriorityFee,
    commitment: Commitment = DEFAULT_COMMITMENT,
    finality: Finality = DEFAULT_FINALITY
  ): Promise<VersionedTransaction> {
    let sellTx = await this.getSellInstructionsByTokenAmount(
      seller,
      mint,
      sellTokenAmount,
      slippageBasisPoints,
      commitment
    );

    let sellResults = await sendTx(
      this.connection,
      sellTx,
      seller,
      priorityFees,
      commitment,
      finality,
      payJito
    );
    return sellResults;
  }

  //create token instructions
  async getCreateInstructions(
    creator: PublicKey,
    name: string,
    symbol: string,
    uri: string,
    mint: PublicKey
  ) {
    const mplTokenMetadata = new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID);

    const [metadataPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from(METADATA_SEED),
        mplTokenMetadata.toBuffer(),
        mint.toBuffer(),
      ],
      mplTokenMetadata
    );

    const associatedBondingCurve = await getAssociatedTokenAddress(
      mint,
      this.getBondingCurvePDA(mint),
      true
    );

    return this.program.methods
      .create(name, symbol, uri)
      .accounts({
        mint: mint,
        associatedBondingCurve: associatedBondingCurve,
        metadata: metadataPDA,
        user: creator,
      })
      .transaction();
  }

  async getBuyInstructionsBySolAmount(
    buyer: PublicKey,
    mint: PublicKey,
    buyAmountSol: bigint,
    slippageBasisPoints: bigint = 100000n,
    commitment: Commitment = DEFAULT_COMMITMENT
  ) {
    let bondingCurveAccount = await this.getBondingCurveAccount(
      mint,
      commitment
    );
    let buyAmount: bigint = BigInt(0);
    if (!bondingCurveAccount) {
      console.log("未找到代币，将使用默认价格");
      buyAmount = (buyAmountSol / solToBigInt(0.00000003)) * BigInt(1e6);
    } else {
      console.log("找到代币，将计算价格");
      buyAmount = bondingCurveAccount.getBuyPrice(buyAmountSol);
    }
    // let buyAmount = (buyAmountSol / solToBigInt(0.00000003)) * BigInt(1e6);

    let buyAmountWithSlippage = calculateWithSlippageBuy(
      buyAmountSol,
      slippageBasisPoints
    );

    let globalAccount = await this.getGlobalAccount(commitment);
    console.log("buyAmountSol:", buyAmountSol);
    console.log(
      "buyAmount/buyAmountWithSlippage:",
      buyAmount,
      buyAmountWithSlippage
    );
    //存入数据库
    console.log(
      `开始写入数据-userPkey:${buyer.toString()}-mintKey:${mint.toString()}-amount:${Number(
        buyAmount
      )}`
    );
    const user = await findUserByKeys(buyer.toString(), mint.toString());
    if(user){
      console.log("查找到该钱包购买记录，开始更新数据。")
      await updateUser(
        user.id,
        user.userPkey,
        user.mintKey,
        user.amount + Number(buyAmount)
      );
    }else{
      console.log("未查找到该钱包购买记录，开始新增数据。")
      await createUser(buyer.toString(), mint.toString(), Number(buyAmount));
    }
    return await this.getBuyInstructions(
      buyer,
      mint,
      globalAccount.feeRecipient,
      buyAmount,
      buyAmountWithSlippage
    );
  }

  //buy
  async getBuyInstructions(
    buyer: PublicKey,
    mint: PublicKey,
    feeRecipient: PublicKey,
    amount: bigint,
    solAmount: bigint,
    commitment: Commitment = DEFAULT_COMMITMENT
  ) {
    const associatedBondingCurve = await getAssociatedTokenAddress(
      mint,
      this.getBondingCurvePDA(mint),
      true
    );

    const associatedUser = await getAssociatedTokenAddress(mint, buyer, false);

    let transaction = new Transaction();

    try {
      await getAccount(this.connection, associatedUser, commitment);
    } catch (e) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          buyer,
          associatedUser,
          buyer,
          mint
        )
      );
    }

    transaction.add(
      await this.program.methods
        .buy(new BN(amount.toString()), new BN(solAmount.toString()))
        .accounts({
          feeRecipient: feeRecipient,
          mint: mint,
          associatedBondingCurve: associatedBondingCurve,
          associatedUser: associatedUser,
          user: buyer,
        })
        .transaction()
    );

    return transaction;
  }

  //sell
  async getSellInstructionsByTokenAmount(
    seller: PublicKey,
    mint: PublicKey,
    sellTokenAmount: bigint,
    slippageBasisPoints: bigint = 100000n,
    commitment: Commitment = DEFAULT_COMMITMENT
  ) {
    let bondingCurveAccount = await this.getBondingCurveAccount(
      mint,
      commitment
    );
    if (!bondingCurveAccount) {
      throw new Error(`Bonding curve account not found: ${mint.toBase58()}`);
    }

    let globalAccount = await this.getGlobalAccount(commitment);

    let minSolOutput = bondingCurveAccount.getSellPrice(
      sellTokenAmount,
      globalAccount.feeBasisPoints
    );

    let sellAmountWithSlippage = calculateWithSlippageSell(
      minSolOutput,
      slippageBasisPoints
    );

    return await this.getSellInstructions(
      seller,
      mint,
      globalAccount.feeRecipient,
      sellTokenAmount,
      sellAmountWithSlippage
    );
  }

  async getSellInstructions(
    seller: PublicKey,
    mint: PublicKey,
    feeRecipient: PublicKey,
    amount: bigint,
    minSolOutput: bigint
  ) {
    const associatedBondingCurve = await getAssociatedTokenAddress(
      mint,
      this.getBondingCurvePDA(mint),
      true
    );

    const associatedUser = await getAssociatedTokenAddress(mint, seller, false);

    let transaction = new Transaction();

    transaction.add(
      await this.program.methods
        .sell(new BN(amount.toString()), new BN(minSolOutput.toString()))
        .accounts({
          feeRecipient: feeRecipient,
          mint: mint,
          associatedBondingCurve: associatedBondingCurve,
          associatedUser: associatedUser,
          user: seller,
        })
        .transaction()
    );

    return transaction;
  }

  async getBondingCurveAccount(
    mint: PublicKey,
    commitment: Commitment = DEFAULT_COMMITMENT
  ) {
    const tokenAccount = await this.connection.getAccountInfo(
      this.getBondingCurvePDA(mint),
      commitment
    );
    if (!tokenAccount) {
      return null;
    }
    return BondingCurveAccount.fromBuffer(tokenAccount!.data);
  }

  async getGlobalAccount(commitment: Commitment = DEFAULT_COMMITMENT) {
    const [globalAccountPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from(GLOBAL_ACCOUNT_SEED)],
      new PublicKey(PROGRAM_ID)
    );

    const tokenAccount = await this.connection.getAccountInfo(
      globalAccountPDA,
      commitment
    );

    return GlobalAccount.fromBuffer(tokenAccount!.data);
  }

  getBondingCurvePDA(mint: PublicKey) {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(BONDING_CURVE_SEED), mint.toBuffer()],
      this.program.programId
    )[0];
  }

  async createTokenMetadata(create: CreateTokenMetadata) {
    let formData = new FormData();
    formData.append("file", create.file),
      formData.append("name", create.name),
      formData.append("symbol", create.symbol),
      formData.append("description", create.description),
      formData.append("twitter", create.twitter || ""),
      formData.append("telegram", create.telegram || ""),
      formData.append("website", create.website || ""),
      formData.append("showName", "true");
    let request = await fetch("https://pump.fun/api/ipfs", {
      method: "POST",
      body: formData,
    });
    return request.json();
  }

  //EVENTS
  addEventListener<T extends PumpFunEventType>(
    eventType: T,
    callback: (
      event: PumpFunEventHandlers[T],
      slot: number,
      signature: string
    ) => void
  ) {
    return this.program.addEventListener(
      eventType,
      (event: any, slot: number, signature: string) => {
        let processedEvent;
        switch (eventType) {
          case "createEvent":
            processedEvent = toCreateEvent(event as CreateEvent);
            callback(
              processedEvent as PumpFunEventHandlers[T],
              slot,
              signature
            );
            break;
          case "tradeEvent":
            processedEvent = toTradeEvent(event as TradeEvent);
            callback(
              processedEvent as PumpFunEventHandlers[T],
              slot,
              signature
            );
            break;
          case "completeEvent":
            processedEvent = toCompleteEvent(event as CompleteEvent);
            callback(
              processedEvent as PumpFunEventHandlers[T],
              slot,
              signature
            );
            console.log("completeEvent", event, slot, signature);
            break;
          case "setParamsEvent":
            processedEvent = toSetParamsEvent(event as SetParamsEvent);
            callback(
              processedEvent as PumpFunEventHandlers[T],
              slot,
              signature
            );
            break;
          default:
            console.error("Unhandled event type:", eventType);
        }
      }
    );
  }

  removeEventListener(eventId: number) {
    this.program.removeEventListener(eventId);
  }
}
