const { struct, bool, u64 } = require('@coral-xyz/borsh');

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

  // 计算买入价格
  getBuyPrice(amount) {
    if (this.complete) {
      throw new Error("曲线已完成");
    }

    if (amount <= 0n) {
      return 0n;
    }

    // 计算虚拟储备乘积
    let n = this.virtualSolReserves * this.virtualTokenReserves;

    // 计算买入后的虚拟SOL储备
    let i = this.virtualSolReserves + amount;

    // 计算买入后的虚拟代币储备
    let r = n / i + 1n;

    // 计算可买入的代币数量
    let s = this.virtualTokenReserves - r;

    // 返回可买入的最大数量
    return s < this.realTokenReserves ? s : this.realTokenReserves;
  }

  // 计算卖出价格
  getSellPrice(amount, feeBasisPoints) {
    if (this.complete) {
      throw new Error("曲线已完成");
    }

    if (amount <= 0n) {
      return 0n;
    }

    // 计算卖出可获得的SOL数量
    let n =
      (amount * this.virtualSolReserves) / (this.virtualTokenReserves + amount);

    // 计算手续费
    let a = (n * feeBasisPoints) / 10000n;

    // 返回扣除手续费后的金额
    return n - a;
  }

  // 从缓冲区解析账户数据
  static fromBuffer(buffer) {
    const structure = struct([
      u64("discriminator"),
      u64("virtualTokenReserves"),
      u64("virtualSolReserves"),
      u64("realTokenReserves"),
      u64("realSolReserves"),
      u64("tokenTotalSupply"),
      bool("complete"),
    ]);

    let value = structure.decode(buffer);
    
    return new BondingCurveAccount(
      BigInt(value.discriminator),
      BigInt(value.virtualTokenReserves),
      BigInt(value.virtualSolReserves),
      BigInt(value.realTokenReserves),
      BigInt(value.realSolReserves),
      BigInt(value.tokenTotalSupply),
      value.complete
    );
  }
}

module.exports = { BondingCurveAccount }; 