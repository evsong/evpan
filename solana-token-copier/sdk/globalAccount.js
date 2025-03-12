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
    return (solAmount / this.initialVirtualSolReserves) * this.initialVirtualTokenReserves;
  }

  // 从缓冲区解析账户数据
  static fromBuffer(buffer) {
    const LAYOUT = struct([
      u64('discriminator'),
      bool('initialized'),
      publicKey('authority'),
      publicKey('feeRecipient'),
      u64('initialVirtualTokenReserves'),
      u64('initialVirtualSolReserves'),
      u64('initialRealTokenReserves'),
      u64('tokenTotalSupply'),
      u64('feeBasisPoints'),
    ]);

    const data = LAYOUT.decode(buffer);
    return new GlobalAccount(
      BigInt(data.discriminator),
      data.initialized,
      data.authority,
      data.feeRecipient,
      BigInt(data.initialVirtualTokenReserves),
      BigInt(data.initialVirtualSolReserves),
      BigInt(data.initialRealTokenReserves),
      BigInt(data.tokenTotalSupply),
      BigInt(data.feeBasisPoints)
    );
  }
}

module.exports = { GlobalAccount }; 