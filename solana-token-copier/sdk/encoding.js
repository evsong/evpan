/**
 * 编码 u64 值（小端序）
 */
function encodeU64(value) {
  try {
    value = typeof value === 'bigint' ? value : BigInt(value);
    const buffer = Buffer.alloc(8);
    
    for (let i = 0; i < 8; i++) {
      buffer[i] = Number((value >> BigInt(i * 8)) & BigInt(0xff));
    }
    
    return buffer;
  } catch (error) {
    console.error('编码 u64 失败:', error);
    throw error;
  }
}

/**
 * 编码字符串
 */
function encodeString(str) {
  try {
    const bytes = Buffer.from(str);
    const len = Buffer.alloc(4);
    len.writeUInt32LE(bytes.length, 0);
    return Buffer.concat([len, bytes]);
  } catch (error) {
    console.error('编码字符串失败:', error);
    throw error;
  }
}

/**
 * 编码布尔值
 */
function encodeBool(value) {
  try {
    return Buffer.from([value ? 1 : 0]);
  } catch (error) {
    console.error('编码布尔值失败:', error);
    throw error;
  }
}

/**
 * 编码公钥
 */
function encodePubkey(pubkey) {
  try {
    return pubkey.toBuffer();
  } catch (error) {
    console.error('编码公钥失败:', error);
    throw error;
  }
}

/**
 * 编码 create 指令数据
 */
function encodeCreateInstructionData(name, symbol, uri) {
  try {
    // 判别器 [24, 30, 200, 40, 5, 28, 7, 119]
    const discriminator = Buffer.from([24, 30, 200, 40, 5, 28, 7, 119]);
    
    // 编码参数
    const nameEncoded = encodeString(name);
    const symbolEncoded = encodeString(symbol);
    const uriEncoded = encodeString(uri);
    
    // 组合所有数据
    return Buffer.concat([
      discriminator,
      nameEncoded,
      symbolEncoded,
      uriEncoded
    ]);
  } catch (error) {
    console.error('编码 create 指令数据失败:', error);
    throw error;
  }
}

/**
 * 编码 buy 指令数据
 */
function encodeBuyInstructionData(amount, maxSolCost) {
  try {
    // 判别器 [102, 6, 61, 18, 1, 218, 235, 234]
    const discriminator = Buffer.from([102, 6, 61, 18, 1, 218, 235, 234]);
    
    // 编码参数
    const amountEncoded = encodeU64(amount);
    const maxSolCostEncoded = encodeU64(maxSolCost);
    
    // 组合所有数据
    return Buffer.concat([
      discriminator,
      amountEncoded,
      maxSolCostEncoded
    ]);
  } catch (error) {
    console.error('编码 buy 指令数据失败:', error);
    throw error;
  }
}

/**
 * 编码 sell 指令数据
 */
function encodeSellInstructionData(amount, minSolOutput) {
  try {
    // 判别器 [51, 230, 133, 164, 1, 127, 131, 173]
    const discriminator = Buffer.from([51, 230, 133, 164, 1, 127, 131, 173]);
    
    // 编码参数
    const amountEncoded = encodeU64(amount);
    const minSolOutputEncoded = encodeU64(minSolOutput);
    
    // 组合所有数据
    return Buffer.concat([
      discriminator,
      amountEncoded,
      minSolOutputEncoded
    ]);
  } catch (error) {
    console.error('编码 sell 指令数据失败:', error);
    throw error;
  }
}

module.exports = {
  encodeU64,
  encodeString,
  encodeBool,
  encodePubkey,
  encodeCreateInstructionData,
  encodeBuyInstructionData,
  encodeSellInstructionData
}; 