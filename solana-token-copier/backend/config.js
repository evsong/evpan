require('dotenv').config();

module.exports = {
  // Solana RPC配置
  rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  
  // Jito配置
  jitoUrl: process.env.JITO_URL || 'https://amsterdam.mainnet.block-engine.jito.wtf:443/api/v1/bundles',
  
  // 交易配置
  initialBuyAmount: BigInt(parseFloat(process.env.INITIAL_BUY_AMOUNT || '0.5') * 1e9),
  holdDuration: parseInt(process.env.HOLD_DURATION || '1800000'), // 默认30分钟
  
  // 钱包配置
  creatorPrivateKey: process.env.CREATOR_PRIVATE_KEY,
  
  // Redis配置
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD
  },
  
  // 服务器配置
  port: process.env.PORT || 3000,
  
  // 图片存储路径
  imagePath: process.env.IMAGE_PATH || './images'
}; 