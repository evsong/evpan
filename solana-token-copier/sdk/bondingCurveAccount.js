const { struct, bool, u64, publicKey } = require('@coral-xyz/borsh');
const { PublicKey } = require('@solana/web3.js');

class BondingCurveAccount {
  constructor(
    discriminator,
    initialized,
    mint,
    virtualSolReserves,
    virtualTokenReserves,
    realSolReserves,
    realTokenReserves
  ) {
    this.discriminator = discriminator;
    this.initialized = initialized || false;
    this.mint = mint;
    this.virtualSolReserves = virtualSolReserves;
    this.virtualTokenReserves = virtualTokenReserves;
    this.realSolReserves = realSolReserves;
    this.realTokenReserves = realTokenReserves;
  }

  // 计算买入价格
  getBuyPrice(solAmount) {
    const k = this.virtualSolReserves * this.virtualTokenReserves;
    const newSolReserves = this.virtualSolReserves + solAmount;
    const newTokenReserves = k / newSolReserves;
    const tokenAmount = this.virtualTokenReserves - newTokenReserves;
    
    return tokenAmount < this.realTokenReserves 
      ? tokenAmount 
      : this.realTokenReserves;
  }

  // 计算卖出价格
  getSellPrice(tokenAmount, feeBasisPoints) {
    if (tokenAmount > this.realTokenReserves) {
      return 0n;
    }

    const k = this.virtualSolReserves * this.virtualTokenReserves;
    const newTokenReserves = this.virtualTokenReserves - tokenAmount;
    const newSolReserves = k / newTokenReserves;
    let solAmount = newSolReserves - this.virtualSolReserves;

    // 应用手续费
    solAmount = solAmount - (solAmount * feeBasisPoints) / 10000n;

    return solAmount;
  }

  // 从缓冲区解析账户数据
  static fromBuffer(buffer) {
    const LAYOUT = struct([
      u64('discriminator'),
      bool('initialized'),
      publicKey('mint'),
      u64('virtualSolReserves'),
      u64('virtualTokenReserves'),
      u64('realSolReserves'),
      u64('realTokenReserves'),
    ]);

    const data = LAYOUT.decode(buffer);
    return new BondingCurveAccount(
      BigInt(data.discriminator),
      data.initialized,
      data.mint,
      BigInt(data.virtualSolReserves),
      BigInt(data.virtualTokenReserves),
      BigInt(data.realSolReserves),
      BigInt(data.realTokenReserves)
    );
  }
}

module.exports = { BondingCurveAccount }; 