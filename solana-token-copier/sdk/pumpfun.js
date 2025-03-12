const {
  Commitment,
  Connection,
  Finality,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
} = require('@solana/web3.js');
const { Program, Provider, AnchorProvider } = require('@coral-xyz/anchor');
const { GlobalAccount } = require('./globalAccount');
const { BondingCurveAccount } = require('./bondingCurveAccount');
const { BN } = require('bn.js');
const {
  DEFAULT_COMMITMENT,
  DEFAULT_FINALITY,
  calculateWithSlippageBuy,
  calculateWithSlippageSell,
  sendTx,
} = require('./util');
const { createAssociatedTokenAccountInstruction, getAssociatedTokenAddress, getAccount } = require('@solana/spl-token');

const PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const MPL_TOKEN_METADATA_PROGRAM_ID = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";

// 常量定义
const GLOBAL_ACCOUNT_SEED = "global";
const MINT_AUTHORITY_SEED = "mint-authority";
const BONDING_CURVE_SEED = "bonding-curve";
const METADATA_SEED = "metadata";
const DEFAULT_DECIMALS = 6;
const lamportsPerSol = BigInt(1_000_000_000);

// PumpFun SDK实现
class PumpFunSDK {
  constructor(provider) {
    try {
      // 简化的构造函数，与pumpBuildTx保持一致
      console.log('初始化SDK...');
      
      if (!provider) {
        throw new Error('Provider不能为空');
      }
      
      // 直接初始化程序，不做额外检查
      this.program = new Program(require('./IDL.json'), PROGRAM_ID, provider);
      
      // 设置connection - 这一步可能是问题所在，与pumpBuildTx保持一致
      this.connection = provider.connection;
      
      console.log(`SDK初始化成功，Program ID: ${PROGRAM_ID}`);
    } catch (error) {
      console.error(`SDK初始化失败: ${error.message}`);
      throw error;
    }
  }

  // 创建代币并买入
  async createAndBuy(
    creator,
    mint,
    tokenMetadata,
    buyAmountSol,
    slippageBasisPoints = BigInt(100000),
    priorityFees,
    commitment = DEFAULT_COMMITMENT,
    finality = DEFAULT_FINALITY
  ) {
    // 创建代币交易
    let createTx = await this.getCreateInstructions(
      creator,
      tokenMetadata.name,
      tokenMetadata.symbol,
      tokenMetadata.uri,
      mint
    );

    let newTx = new Transaction().add(createTx);

    // 如果需要买入
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
      
      newTx.add(buyTx);
    }

    // 发送交易
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

  // 买入代币
  async buy(
    buyer,
    mint,
    buyAmountSol,
    payJito = false,
    slippageBasisPoints = BigInt(100000),
    priorityFees,
    commitment = DEFAULT_COMMITMENT,
    finality = DEFAULT_FINALITY
  ) {
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

  // 卖出代币
  async sell(
    seller,
    mint,
    sellTokenAmount,
    payJito = false,
    slippageBasisPoints = BigInt(100000),
    priorityFees,
    commitment = DEFAULT_COMMITMENT,
    finality = DEFAULT_FINALITY
  ) {
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

  // 获取创建代币指令
  async getCreateInstructions(
    creator,
    name,
    symbol,
    uri,
    mint
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

  // 根据SOL金额获取买入指令
  async getBuyInstructionsBySolAmount(
    buyer,
    mint,
    buyAmountSol,
    slippageBasisPoints = BigInt(100000),
    commitment = DEFAULT_COMMITMENT
  ) {
    let bondingCurveAccount = await this.getBondingCurveAccount(
      mint,
      commitment
    );
    
    let buyAmount = BigInt(0);
    if (!bondingCurveAccount) {
      buyAmount = (buyAmountSol / this.solToBigInt(0.00000003)) * BigInt(1e6);
    } else {
      buyAmount = bondingCurveAccount.getBuyPrice(buyAmountSol);
    }

    let buyAmountWithSlippage = calculateWithSlippageBuy(
      buyAmountSol,
      slippageBasisPoints
    );

    let globalAccount = await this.getGlobalAccount(commitment);
    
    return await this.getBuyInstructions(
      buyer,
      mint,
      globalAccount.feeRecipient,
      buyAmount,
      buyAmountWithSlippage
    );
  }

  // 获取买入指令
  async getBuyInstructions(
    buyer,
    mint,
    feeRecipient,
    amount,
    solAmount,
    commitment = DEFAULT_COMMITMENT
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

  // 根据代币数量获取卖出指令
  async getSellInstructionsByTokenAmount(
    seller,
    mint,
    sellTokenAmount,
    slippageBasisPoints = BigInt(100000),
    commitment = DEFAULT_COMMITMENT
  ) {
    let bondingCurveAccount = await this.getBondingCurveAccount(
      mint,
      commitment
    );
    
    if (!bondingCurveAccount) {
      throw new Error(`找不到债券曲线账户: ${mint.toBase58()}`);
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

  // 获取卖出指令
  async getSellInstructions(
    seller,
    mint,
    feeRecipient,
    amount,
    minSolOutput
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

  // 获取债券曲线账户
  async getBondingCurveAccount(
    mint,
    commitment = DEFAULT_COMMITMENT
  ) {
    const tokenAccount = await this.connection.getAccountInfo(
      this.getBondingCurvePDA(mint),
      commitment
    );
    
    if (!tokenAccount) {
      return null;
    }
    
    return BondingCurveAccount.fromBuffer(tokenAccount.data);
  }

  // 获取全局账户
  async getGlobalAccount(commitment = DEFAULT_COMMITMENT) {
    const [globalAccountPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from(GLOBAL_ACCOUNT_SEED)],
      new PublicKey(PROGRAM_ID)
    );

    const tokenAccount = await this.connection.getAccountInfo(
      globalAccountPDA,
      commitment
    );

    return GlobalAccount.fromBuffer(tokenAccount.data);
  }

  // 获取债券曲线PDA
  getBondingCurvePDA(mint) {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(BONDING_CURVE_SEED), mint.toBuffer()],
      this.program.programId
    )[0];
  }

  // 添加事件监听器
  addEventListener(eventType, callback) {
    try {
      console.log(`添加事件监听器: ${eventType}`);
      
      // 只检查program，不依赖this.connection
      if (!this.program) {
        throw new Error('Program尚未初始化');
      }
      
      // 简化的诊断信息
      console.log('诊断信息:');
      console.log(`- this.program存在: ${!!this.program}`);
      console.log(`- this.program.provider存在: ${!!this.program.provider}`);
      
      // 直接使用program.addEventListener返回监听器ID，不做额外检查
      console.log('尝试添加程序事件监听器...');
      return this.program.addEventListener(
        eventType,
        (event, slot, signature) => {
          try {
            let processedEvent;
            
            switch (eventType) {
              case "createEvent":
                processedEvent = this.toCreateEvent(event);
                break;
              case "tradeEvent":
                processedEvent = this.toTradeEvent(event);
                break;
              case "completeEvent":
                processedEvent = this.toCompleteEvent(event);
                break;
              case "setParamsEvent":
                processedEvent = this.toSetParamsEvent(event);
                break;
              default:
                console.error("未处理的事件类型:", eventType);
                return;
            }
            
            // 触发回调
            callback(processedEvent, slot, signature);
          } catch (error) {
            console.error(`事件处理失败: ${error.message}`, error);
          }
        }
      );
    } catch (error) {
      console.error(`添加事件监听器失败: ${error.message}`, error);
      throw error;
    }
  }

  // 移除事件监听器
  removeEventListener(eventId) {
    try {
      console.log(`移除事件监听器: ${eventId}`);
      
      if (!this.program) {
        throw new Error('Program尚未初始化');
      }
      
      if (!eventId) {
        throw new Error('未提供有效的事件ID');
      }
      
      this.program.removeEventListener(eventId);
      console.log(`事件监听器已移除: ${eventId}`);
    } catch (error) {
      console.error(`移除事件监听器失败: ${error.message}`);
      throw error;
    }
  }

  // 事件转换方法
  toCreateEvent(event) {
    return {
      name: event.name,
      symbol: event.symbol,
      uri: event.uri,
      mint: new PublicKey(event.mint),
      bondingCurve: new PublicKey(event.bondingCurve),
      user: new PublicKey(event.user),
    };
  }

  toTradeEvent(event) {
    return {
      mint: new PublicKey(event.mint),
      solAmount: BigInt(event.solAmount),
      tokenAmount: BigInt(event.tokenAmount),
      isBuy: event.isBuy,
      user: new PublicKey(event.user),
      timestamp: Number(event.timestamp),
      virtualSolReserves: BigInt(event.virtualSolReserves),
      virtualTokenReserves: BigInt(event.virtualTokenReserves),
      realSolReserves: BigInt(event.realSolReserves),
      realTokenReserves: BigInt(event.realTokenReserves),
    };
  }

  toCompleteEvent(event) {
    return {
      user: new PublicKey(event.user),
      mint: new PublicKey(event.mint),
      bondingCurve: new PublicKey(event.bondingCurve),
      timestamp: event.timestamp,
    };
  }

  toSetParamsEvent(event) {
    return {
      feeRecipient: new PublicKey(event.feeRecipient),
      initialVirtualTokenReserves: BigInt(event.initialVirtualTokenReserves),
      initialVirtualSolReserves: BigInt(event.initialVirtualSolReserves),
      initialRealTokenReserves: BigInt(event.initialRealTokenReserves),
      tokenTotalSupply: BigInt(event.tokenTotalSupply),
      feeBasisPoints: BigInt(event.feeBasisPoints),
    };
  }

  // SOL转BigInt
  solToBigInt(sol) {
    return BigInt(Math.floor(sol * 1e9));
  }
}

module.exports = { PumpFunSDK }; 