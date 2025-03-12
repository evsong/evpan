const { PublicKey } = require('@solana/web3.js');
const { struct, bool, u64, publicKey } = require('@coral-xyz/borsh');

class GlobalAccount {
  constructor(
    discriminator,
    initialized,
    authority,
    feeRecipient,
    initialVirtualTokenReserves,
    initialVirtualSolReserves,
    initialRealTokenReserves,
    tokenTotalSupply,
    feeBasisPoints
  ) {
    this.discriminator = discriminator;
    this.initialized = initialized || false;
    this.authority = authority;
    this.feeRecipient = feeRecipient;
    this.initialVirtualTokenReserves = initialVirtualTokenReserves;
    this.initialVirtualSolReserves = initialVirtualSolReserves;
    this.initialRealTokenReserves = initialRealTokenReserves;
    this.tokenTotalSupply = tokenTotalSupply;
    this.feeBasisPoints = feeBasisPoints;
  }

  // 计算初始买入价格
  getInitialBuyPrice(solAmount) {
    try {
      solAmount = BigInt(solAmount);
      return (solAmount * this.initialVirtualTokenReserves) / this.initialVirtualSolReserves;
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
        bool('initialized'),
        publicKey('authority'),
        publicKey('feeRecipient'),
        u64('initialVirtualTokenReserves'),
        u64('initialVirtualSolReserves'),
        u64('initialRealTokenReserves'),
        u64('tokenTotalSupply'),
        u64('feeBasisPoints'),
      ]);

      const data = LAYOUT.decode(buffer.slice(8));
      
      return new GlobalAccount(
        BigInt('0x' + discriminator.toString('hex')),
        data.initialized,
        data.authority,
        data.feeRecipient,
        BigInt(data.initialVirtualTokenReserves.toString()),
        BigInt(data.initialVirtualSolReserves.toString()),
        BigInt(data.initialRealTokenReserves.toString()),
        BigInt(data.tokenTotalSupply.toString()),
        BigInt(data.feeBasisPoints.toString())
      );
    } catch (error) {
      throw error;
    }
  }
}

module.exports = { GlobalAccount }; 