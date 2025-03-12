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
const { Program, BN, AnchorProvider } = require('@coral-xyz/anchor');
const { GlobalAccount } = require('./globalAccount');
const { BondingCurveAccount } = require('./bondingCurveAccount');
const { IDL } = require('./IDL'); // 确保正确引入IDL
const { EventProcessor } = require('./events');
const {
  DEFAULT_COMMITMENT,
  DEFAULT_FINALITY,
  calculateWithSlippageBuy,
  calculateWithSlippageSell,
  sendTx,
  solToBigInt,
  getRandomJitoTipAccount
} = require('./util');
const { createAssociatedTokenAccountInstruction, getAssociatedTokenAddress, getAccount } = require('@solana/spl-token');
const path = require('path');
const { PROGRAM_ID } = require('./types');

// Constants
const MPL_TOKEN_METADATA_PROGRAM_ID = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";
const GLOBAL_ACCOUNT_SEED = "global";
const MINT_AUTHORITY_SEED = "mint-authority";
const BONDING_CURVE_SEED = "bonding-curve";
const METADATA_SEED = "metadata";

// PumpFun SDK Implementation
class PumpFunSDK {
  constructor(provider) {
    try {
      // Validate provider
      if (!provider) {
        throw new Error('Provider cannot be null');
      }
      
      if (!provider.connection) {
        throw new Error('Provider must have a connection attribute');
      }
      
      if (!provider.wallet) {
        throw new Error('Provider must have a wallet attribute');
      }
      
      // Set the connection
      this.connection = provider.connection;
      
      // Initialize Anchor Program with the IDL
      this.programId = new PublicKey(PROGRAM_ID);
      this.provider = provider;
      
      // 初始化Anchor Program对象
      // 使用固定的程序地址
      const programAddress = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
      this.program = new Program(IDL, new PublicKey(programAddress), provider);
      
      // 验证IDL加载
      if (!IDL) {
        throw new Error('IDL 加载失败');
      }
      console.log('IDL loaded:', !!IDL, 'Address:', programAddress);
      
      // Store key program parameters
      this.mplTokenMetadata = new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID);
      
    } catch (error) {
      console.error('SDK initialization failed:', error);
      throw error;
    }
  }

  // Create and buy a token
  async createAndBuy(
    creator,
    mint,
    tokenMetadata,
    buyAmountSol,
    slippageBasisPoints = 100000n,
    priorityFees,
    commitment = DEFAULT_COMMITMENT,
    finality = DEFAULT_FINALITY
  ) {
    try {
      // Create token transaction
      let createTx = await this.getCreateInstructions(
        creator,
        tokenMetadata.name,
        tokenMetadata.symbol,
        tokenMetadata.uri,
        mint
      );

      let newTx = new Transaction().add(createTx);

      // Add buy instruction if requested
      if (buyAmountSol > 0n) {
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

      // Send transaction
      return await sendTx(
        this.connection,
        newTx,
        creator,
        priorityFees,
        commitment,
        finality,
        true
      );
    } catch (error) {
      console.error(`Create and buy transaction failed: ${error.message}`);
      throw error;
    }
  }

  // Buy tokens
  async buy(
    buyer,
    mint,
    buyAmountSol,
    payJito = false,
    slippageBasisPoints = 100000n,
    priorityFees,
    commitment = DEFAULT_COMMITMENT,
    finality = DEFAULT_FINALITY
  ) {
    try {
      let buyTx = await this.getBuyInstructionsBySolAmount(
        buyer,
        mint,
        buyAmountSol,
        slippageBasisPoints,
        commitment
      );
      
      return await sendTx(
        this.connection,
        buyTx,
        buyer,
        priorityFees,
        commitment,
        finality,
        payJito
      );
    } catch (error) {
      console.error(`Buy transaction failed: ${error.message}`);
      throw error;
    }
  }

  // Sell tokens
  async sell(
    seller,
    mint,
    sellTokenAmount,
    payJito = false,
    slippageBasisPoints = 100000n,
    priorityFees,
    commitment = DEFAULT_COMMITMENT,
    finality = DEFAULT_FINALITY
  ) {
    try {
      let sellTx = await this.getSellInstructionsByTokenAmount(
        seller,
        mint,
        sellTokenAmount,
        slippageBasisPoints,
        commitment
      );

      return await sendTx(
        this.connection,
        sellTx,
        seller,
        priorityFees,
        commitment,
        finality,
        payJito
      );
    } catch (error) {
      console.error(`Sell transaction failed: ${error.message}`);
      throw error;
    }
  }

  // Get create token instructions
  async getCreateInstructions(
    creator,
    name,
    symbol,
    uri,
    mint
  ) {
    try {
      const [metadataPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from(METADATA_SEED),
          this.mplTokenMetadata.toBuffer(),
          mint.toBuffer(),
        ],
        this.mplTokenMetadata
      );

      const [mintAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from(MINT_AUTHORITY_SEED)],
        this.programId
      );

      const [bondingCurvePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from(BONDING_CURVE_SEED), mint.toBuffer()],
        this.programId
      );

      const [globalPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from(GLOBAL_ACCOUNT_SEED)],
        this.programId
      );

      const associatedBondingCurve = await getAssociatedTokenAddress(
        mint,
        bondingCurvePDA,
        true
      );

      // Manually construct the transaction instruction
      // This avoids using Anchor's Program class which is causing issues
      const createIx = {
        programId: this.programId,
        keys: [
          { pubkey: mint, isSigner: true, isWritable: true },
          { pubkey: mintAuthority, isSigner: false, isWritable: false },
          { pubkey: bondingCurvePDA, isSigner: false, isWritable: true },
          { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
          { pubkey: globalPDA, isSigner: false, isWritable: false },
          { pubkey: this.mplTokenMetadata, isSigner: false, isWritable: false },
          { pubkey: metadataPDA, isSigner: false, isWritable: true },
          { pubkey: creator, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), isSigner: false, isWritable: false },
          { pubkey: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"), isSigner: false, isWritable: false },
          { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false },
          { pubkey: new PublicKey("62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV"), isSigner: false, isWritable: false },
          { pubkey: this.programId, isSigner: false, isWritable: false },
        ],
        data: this.encodeCreateData(name, symbol, uri)
      };

      return createIx;
    } catch (error) {
      console.error(`Failed to get create instructions: ${error.message}`);
      throw error;
    }
  }

  // Encode create instruction data
  encodeCreateData(name, symbol, uri) {
    // Create instruction has discriminator [24, 30, 200, 40, 5, 28, 7, 119]
    const discriminator = Buffer.from([24, 30, 200, 40, 5, 28, 7, 119]);
    
    // Encode name
    const nameBuffer = Buffer.from(name);
    const nameLength = Buffer.alloc(4);
    nameLength.writeUInt32LE(nameBuffer.length, 0);
    
    // Encode symbol
    const symbolBuffer = Buffer.from(symbol);
    const symbolLength = Buffer.alloc(4);
    symbolLength.writeUInt32LE(symbolBuffer.length, 0);
    
    // Encode URI
    const uriBuffer = Buffer.from(uri);
    const uriLength = Buffer.alloc(4);
    uriLength.writeUInt32LE(uriBuffer.length, 0);
    
    // Combine all parts
    return Buffer.concat([
      discriminator,
      nameLength,
      nameBuffer,
      symbolLength,
      symbolBuffer,
      uriLength,
      uriBuffer
    ]);
  }

  // Get buy instructions by SOL amount
  async getBuyInstructionsBySolAmount(
    buyer,
    mint,
    buyAmountSol,
    slippageBasisPoints = 100000n,
    commitment = DEFAULT_COMMITMENT
  ) {
    try {
      let bondingCurveAccount = await this.getBondingCurveAccount(
        mint,
        commitment
      );
      
      let buyAmount = 0n;
      if (!bondingCurveAccount) {
        buyAmount = (buyAmountSol * BigInt(1e6)) / solToBigInt(0.00000003);
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
    } catch (error) {
      console.error(`Failed to get buy instructions: ${error.message}`);
      throw error;
    }
  }

  // Get buy instructions
  async getBuyInstructions(
    buyer,
    mint,
    feeRecipient,
    amount,
    solAmount,
    commitment = DEFAULT_COMMITMENT
  ) {
    try {
      const [globalPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from(GLOBAL_ACCOUNT_SEED)],
        this.programId
      );

      const [bondingCurvePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from(BONDING_CURVE_SEED), mint.toBuffer()],
        this.programId
      );

      const associatedBondingCurve = await getAssociatedTokenAddress(
        mint,
        bondingCurvePDA,
        true
      );

      const associatedUser = await getAssociatedTokenAddress(mint, buyer, false);

      let transaction = new Transaction();

      // Check if user token account exists
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

      // Buy instruction has discriminator [102, 6, 61, 18, 1, 218, 235, 234]
      const discriminator = Buffer.from([102, 6, 61, 18, 1, 218, 235, 234]);
      
      // Encode amount as u64 (8 bytes)
      const amountBuf = Buffer.alloc(8);
      this.writeUint64LE(amountBuf, amount, 0);
      
      // Encode max SOL cost as u64 (8 bytes)
      const maxSolCostBuf = Buffer.alloc(8);
      this.writeUint64LE(maxSolCostBuf, solAmount, 0);
      
      // Combine to form instruction data
      const data = Buffer.concat([discriminator, amountBuf, maxSolCostBuf]);

      // Construct buy instruction
      const buyIx = {
        programId: this.programId,
        keys: [
          { pubkey: globalPDA, isSigner: false, isWritable: false },
          { pubkey: feeRecipient, isSigner: false, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: bondingCurvePDA, isSigner: false, isWritable: true },
          { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
          { pubkey: associatedUser, isSigner: false, isWritable: true },
          { pubkey: buyer, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), isSigner: false, isWritable: false },
          { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false },
          { pubkey: new PublicKey("62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV"), isSigner: false, isWritable: false },
          { pubkey: this.programId, isSigner: false, isWritable: false },
        ],
        data
      };

      transaction.add(buyIx);
      return transaction;
    } catch (error) {
      console.error(`Failed to get buy instructions: ${error.message}`);
      throw error;
    }
  }

  // Write uint64 in little-endian format
  writeUint64LE(buffer, value, offset) {
    const lo = Number(value & BigInt(0xffffffff));
    const hi = Number(value >> BigInt(32));
    buffer.writeUInt32LE(lo, offset);
    buffer.writeUInt32LE(hi, offset + 4);
    return offset + 8;
  }

  // Get sell instructions by token amount
  async getSellInstructionsByTokenAmount(
    seller,
    mint,
    sellTokenAmount,
    slippageBasisPoints = 100000n,
    commitment = DEFAULT_COMMITMENT
  ) {
    try {
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
    } catch (error) {
      console.error(`Failed to get sell instructions: ${error.message}`);
      throw error;
    }
  }

  // Get sell instructions
  async getSellInstructions(
    seller,
    mint,
    feeRecipient,
    amount,
    minSolOutput
  ) {
    try {
      const [globalPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from(GLOBAL_ACCOUNT_SEED)],
        this.programId
      );

      const [bondingCurvePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from(BONDING_CURVE_SEED), mint.toBuffer()],
        this.programId
      );

      const associatedBondingCurve = await getAssociatedTokenAddress(
        mint,
        bondingCurvePDA,
        true
      );

      const associatedUser = await getAssociatedTokenAddress(mint, seller, false);

      // Sell instruction has discriminator [51, 230, 133, 164, 1, 127, 131, 173]
      const discriminator = Buffer.from([51, 230, 133, 164, 1, 127, 131, 173]);
      
      // Encode amount as u64 (8 bytes)
      const amountBuf = Buffer.alloc(8);
      this.writeUint64LE(amountBuf, amount, 0);
      
      // Encode min SOL output as u64 (8 bytes)
      const minSolOutputBuf = Buffer.alloc(8);
      this.writeUint64LE(minSolOutputBuf, minSolOutput, 0);
      
      // Combine to form instruction data
      const data = Buffer.concat([discriminator, amountBuf, minSolOutputBuf]);

      // Construct sell instruction
      const sellIx = {
        programId: this.programId,
        keys: [
          { pubkey: globalPDA, isSigner: false, isWritable: false },
          { pubkey: feeRecipient, isSigner: false, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: bondingCurvePDA, isSigner: false, isWritable: true },
          { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
          { pubkey: associatedUser, isSigner: false, isWritable: true },
          { pubkey: seller, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"), isSigner: false, isWritable: false },
          { pubkey: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), isSigner: false, isWritable: false },
          { pubkey: new PublicKey("62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV"), isSigner: false, isWritable: false },
          { pubkey: this.programId, isSigner: false, isWritable: false },
        ],
        data
      };

      return new Transaction().add(sellIx);
    } catch (error) {
      console.error(`Failed to get sell instructions: ${error.message}`);
      throw error;
    }
  }

  // Get bonding curve account
  async getBondingCurveAccount(
    mint,
    commitment = DEFAULT_COMMITMENT
  ) {
    try {
      const [bondingCurvePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from(BONDING_CURVE_SEED), mint.toBuffer()],
        this.programId
      );

      const accountInfo = await this.connection.getAccountInfo(
        bondingCurvePDA,
        commitment
      );
      
      if (!accountInfo) {
        return null;
      }
      
      return BondingCurveAccount.fromBuffer(accountInfo.data);
    } catch (error) {
      console.error(`Failed to get bonding curve account: ${error.message}`);
      throw error;
    }
  }

  // Get global account
  async getGlobalAccount(commitment = DEFAULT_COMMITMENT) {
    try {
      const [globalAccountPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from(GLOBAL_ACCOUNT_SEED)],
        this.programId
      );
      
      const accountInfo = await this.connection.getAccountInfo(
        globalAccountPDA,
        commitment
      );
      
      if (!accountInfo) {
        throw new Error(`Failed to fetch global account: ${globalAccountPDA.toBase58()}`);
      }

      return GlobalAccount.fromBuffer(accountInfo.data);
    } catch (error) {
      console.error(`Failed to get global account: ${error.message}`);
      throw error;
    }
  }

  // Event listening functionality
  addEventListener(eventType, callback) {
    try {
      // 使用Anchor Program的addEventListener方法
      const eventId = this.program.addEventListener(
        eventType,
        (event, slot, signature) => {
          // 处理不同类型的事件
          let processedEvent;
          switch (eventType) {
            case "CreateEvent":
              processedEvent = EventProcessor.toCreateEvent(event);
              break;
            case "TradeEvent":
              processedEvent = EventProcessor.toTradeEvent(event);
              break;
            case "CompleteEvent":
              processedEvent = EventProcessor.toCompleteEvent(event);
              break;
            case "SetParamsEvent":
              processedEvent = EventProcessor.toSetParamsEvent(event);
              break;
            default:
              processedEvent = event;
          }
          
          // 调用回调函数
          callback(processedEvent, slot, signature);
        }
      );
      
      return eventId;
    } catch (error) {
      console.error(`Failed to add event listener for ${eventType}:`, error);
      throw error;
    }
  }

  removeEventListener(eventId) {
    try {
      // 使用Anchor Program的removeEventListener方法
      this.program.removeEventListener(eventId);
    } catch (error) {
      console.error(`Failed to remove event listener:`, error);
      throw error;
    }
  }
}

module.exports = { PumpFunSDK }; 