const Redis = require('ioredis');
const config = require('./config');

// 创建Redis客户端
let redis;
try {
  redis = new Redis(config.redis);
  console.log('Redis连接已建立');
} catch (error) {
  console.error('Redis连接失败:', error.message);
  process.exit(1);
}

/**
 * 存储代币信息
 * @param {Object} tokenInfo 代币信息
 * @returns {boolean} 操作结果
 */
async function storeTokenInfo(tokenInfo) {
  try {
    // 存储详细信息
    await redis.hmset(`token:${tokenInfo.mint}`, {
      mint: tokenInfo.mint,
      name: tokenInfo.name,
      symbol: tokenInfo.symbol,
      description: tokenInfo.description,
      uri: tokenInfo.uri,
      image: tokenInfo.image,
      imagePath: tokenInfo.imagePath,
      twitter: tokenInfo.twitter,
      telegram: tokenInfo.telegram,
      website: tokenInfo.website,
      discoveredAt: tokenInfo.discoveredAt,
      status: tokenInfo.status || 'pending'
    });
    
    // 添加到发现列表
    await redis.zadd('tokens:discovered', tokenInfo.discoveredAt, tokenInfo.mint);
    
    console.log(`代币信息已存储到Redis: ${tokenInfo.mint} (${tokenInfo.name})`);
    return true;
  } catch (error) {
    console.error(`存储代币信息失败: ${error.message}`);
    return false;
  }
}

/**
 * 获取代币信息
 * @param {string} mintAddress 代币地址
 * @returns {Object|null} 代币信息
 */
async function getTokenInfo(mintAddress) {
  try {
    const tokenInfo = await redis.hgetall(`token:${mintAddress}`);
    if (Object.keys(tokenInfo).length === 0) {
      return null;
    }
    return tokenInfo;
  } catch (error) {
    console.error(`获取代币信息失败: ${error.message}`);
    return null;
  }
}

/**
 * 更新代币状态
 * @param {string} mintAddress 代币地址
 * @param {Object} updates 更新内容
 * @returns {boolean} 操作结果
 */
async function updateTokenStatus(mintAddress, updates) {
  try {
    await redis.hmset(`token:${mintAddress}`, updates);
    
    if (updates.status === 'created') {
      await redis.zadd('tokens:created', updates.createdAt, mintAddress);
    } else if (updates.status === 'sold') {
      await redis.zadd('tokens:sold', updates.soldAt, mintAddress);
    }
    
    console.log(`代币状态已更新: ${mintAddress} -> ${updates.status || '未更新状态'}`);
    return true;
  } catch (error) {
    console.error(`更新代币状态失败: ${error.message}`);
    return false;
  }
}

/**
 * 获取所有待处理的代币
 * @returns {Array} 代币信息数组
 */
async function getPendingTokens() {
  try {
    // 获取所有发现的代币
    const tokenIds = await redis.zrange('tokens:discovered', 0, -1);
    const pendingTokens = [];
    
    for (const id of tokenIds) {
      const token = await getTokenInfo(id);
      if (token && token.status === 'pending') {
        pendingTokens.push(token);
      }
    }
    
    return pendingTokens;
  } catch (error) {
    console.error(`获取待处理代币失败: ${error.message}`);
    return [];
  }
}

/**
 * 获取所有已创建的代币
 * @returns {Array} 代币信息数组
 */
async function getCreatedTokens() {
  try {
    const tokenIds = await redis.zrange('tokens:created', 0, -1);
    const createdTokens = [];
    
    for (const id of tokenIds) {
      const token = await getTokenInfo(id);
      if (token) {
        createdTokens.push(token);
      }
    }
    
    return createdTokens;
  } catch (error) {
    console.error(`获取已创建代币失败: ${error.message}`);
    return [];
  }
}

/**
 * 获取所有已卖出的代币
 * @returns {Array} 代币信息数组
 */
async function getSoldTokens() {
  try {
    const tokenIds = await redis.zrange('tokens:sold', 0, -1);
    const soldTokens = [];
    
    for (const id of tokenIds) {
      const token = await getTokenInfo(id);
      if (token) {
        soldTokens.push(token);
      }
    }
    
    return soldTokens;
  } catch (error) {
    console.error(`获取已卖出代币失败: ${error.message}`);
    return [];
  }
}

/**
 * 删除代币信息
 * @param {string} mintAddress 代币地址
 * @returns {boolean} 操作结果
 */
async function deleteToken(mintAddress) {
  try {
    // 删除详细信息
    await redis.del(`token:${mintAddress}`);
    
    // 从各列表中移除
    await redis.zrem('tokens:discovered', mintAddress);
    await redis.zrem('tokens:created', mintAddress);
    await redis.zrem('tokens:sold', mintAddress);
    
    console.log(`代币信息已删除: ${mintAddress}`);
    return true;
  } catch (error) {
    console.error(`删除代币信息失败: ${error.message}`);
    return false;
  }
}

module.exports = { 
  storeTokenInfo, 
  getTokenInfo, 
  updateTokenStatus, 
  getPendingTokens,
  getCreatedTokens,
  getSoldTokens,
  deleteToken
}; 