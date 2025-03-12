const { struct, bool, u64 } = require('@coral-xyz/borsh');
const { ensureBigInt, safeBigIntDivision } = require('./util');

class BondingCurveAccount {
  constructor(
    discriminator,
    virtualTokenReserves,
    virtualSolReserves,
    realTokenReserves,
    realSolReserves,
    tokenTotalSupply,
    complete
  ) {
    this.discriminator = discriminator;
    this.virtualTokenReserves = virtualTokenReserves;
    this.virtualSolReserves = virtualSolReserves;
    this.realTokenReserves = realTokenReserves;
    this.realSolReserves = realSolReserves;
    this.tokenTotalSupply = tokenTotalSupply;
    this.complete = complete;
  }

  // 获取买入价格
  getBuyPrice(solAmount) {
    try {
      solAmount = ensureBigInt(solAmount);
      
      if (this.complete) {
        throw new Error("曲线已完成");
      }

      if (solAmount <= 0n) {
        return 0n;
      }

      // 使用恒定乘积公式计算
      const k = this.virtualSolReserves * this.virtualTokenReserves;
      const newSolReserves = this.virtualSolReserves + solAmount;
      const newTokenReserves = safeBigIntDivision(k, newSolReserves) + 1n;
      const tokenAmount = this.virtualTokenReserves - newTokenReserves;
      
      return tokenAmount < this.realTokenReserves ? tokenAmount : this.realTokenReserves;
    } catch (error) {
      throw error;
    }
  }

  // 获取卖出价格
  getSellPrice(amount, feeBasisPoints) {
    try {
      amount = ensureBigInt(amount);
      feeBasisPoints = ensureBigInt(feeBasisPoints);
      
      if (this.complete) {
        throw new Error("曲线已完成");
      }

      if (amount <= 0n) {
        return 0n;
      }

      // 计算卖出获得的SOL数量
      const n = (amount * this.virtualSolReserves) / (this.virtualTokenReserves + amount);
      const feeAmount = (n * feeBasisPoints) / 10000n;
      
      return n - feeAmount;
    } catch (error) {
      throw error;
    }
  }

  // 从缓冲区解析账户数据
  static fromBuffer(buffer) {
    try {
      // Anchor 账户数据以 8 字节判别器开始
      const discriminator = buffer.slice(0, 8);
      
      // 解析实际数据部分
      const LAYOUT = struct([
        u64('virtualTokenReserves'),
        u64('virtualSolReserves'),
        u64('realTokenReserves'),
        u64('realSolReserves'),
        u64('tokenTotalSupply'),
        bool('complete')
      ]);

      const data = LAYOUT.decode(buffer.slice(8));
      
      return new BondingCurveAccount(
        BigInt('0x' + discriminator.toString('hex')),
        BigInt(data.virtualTokenReserves.toString()),
        BigInt(data.virtualSolReserves.toString()),
        BigInt(data.realTokenReserves.toString()),
        BigInt(data.realSolReserves.toString()),
        BigInt(data.tokenTotalSupply.toString()),
        data.complete
      );
    } catch (error) {
      throw error;
    }
  }
}

module.exports = { BondingCurveAccount }; 