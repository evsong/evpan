const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');
const config = require('./config');
const { storeTokenInfo } = require('./redis');

/**
 * 处理新发现的代币
 * @param {Object} event 代币创建事件
 */
async function handleNewToken(event) {
  try {
    console.log(`处理新代币元数据: ${event.name}`);
    
    // 确保图片目录存在
    const imageDir = path.resolve(config.imagePath);
    await fs.mkdir(imageDir, { recursive: true });
    
    // 获取元数据
    const metadata = await fetchMetadata(event.uri);
    if (!metadata) {
      console.error('无法获取元数据');
      return;
    }
    
    console.log('成功获取元数据:', metadata.name);
    
    // 下载图片
    const imagePath = await downloadImage(
      metadata.image, 
      event.mint.toString(),
      imageDir
    );
    
    // 存储到Redis
    const tokenInfo = {
      mint: event.mint.toString(),
      name: metadata.name || event.name,
      symbol: metadata.symbol || event.symbol,
      description: metadata.description || '',
      uri: event.uri,
      image: metadata.image || '',
      imagePath: imagePath,
      twitter: metadata.twitter || '',
      telegram: metadata.telegram || '',
      website: metadata.website || '',
      discoveredAt: Date.now(),
      status: 'pending' // 初始状态为待处理
    };
    
    await storeTokenInfo(tokenInfo);
    console.log(`元数据已存储到Redis: ${tokenInfo.name}`);
    
    return tokenInfo;
    
  } catch (error) {
    console.error(`处理代币元数据失败: ${error.message}`);
    return null;
  }
}

/**
 * 获取元数据
 * @param {string} uri 元数据URI
 * @returns {Object|null} 元数据对象
 */
async function fetchMetadata(uri) {
  try {
    console.log(`获取元数据: ${uri}`);
    const response = await fetch(uri);
    
    if (!response.ok) {
      throw new Error(`HTTP请求失败: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`获取元数据失败: ${error.message}`);
    return null;
  }
}

/**
 * 下载代币图片
 * @param {string} imageUrl 图片URL
 * @param {string} mintAddress 代币地址
 * @param {string} imageDir 图片存储目录
 * @returns {string|null} 图片本地路径
 */
async function downloadImage(imageUrl, mintAddress, imageDir) {
  try {
    console.log(`下载图片: ${imageUrl}`);
    
    if (!imageUrl || !imageUrl.startsWith('http')) {
      console.warn('无效的图片URL，使用占位图片');
      // 使用占位图片路径
      const placeholderPath = path.join(imageDir, `${mintAddress}-placeholder.png`);
      // 创建一个占位图片
      await fs.writeFile(placeholderPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
      return placeholderPath;
    }
    
    const response = await fetch(imageUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP请求失败: ${response.status} ${response.statusText}`);
    }
    
    const buffer = await response.arrayBuffer();
    const imagePath = path.join(imageDir, `${mintAddress}.png`);
    
    // 保存图片
    await fs.writeFile(imagePath, Buffer.from(buffer));
    console.log(`图片已保存: ${imagePath}`);
    
    return imagePath;
  } catch (error) {
    console.error(`下载图片失败: ${error.message}`);
    
    // 创建一个占位图片
    try {
      const placeholderPath = path.join(imageDir, `${mintAddress}-placeholder.png`);
      // 创建一个1x1像素的空图片
      await fs.writeFile(placeholderPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
      return placeholderPath;
    } catch (e) {
      console.error(`创建占位图片失败: ${e.message}`);
      return null;
    }
  }
}

/**
 * 准备上传元数据
 * @param {Object} tokenInfo 代币信息
 * @returns {Object} FormData对象
 */
function prepareMetadata(tokenInfo) {
  const FormData = require('form-data');
  const fs = require('fs');
  
  const formData = new FormData();
  formData.append("file", fs.createReadStream(tokenInfo.imagePath));
  formData.append("name", tokenInfo.name);
  formData.append("symbol", tokenInfo.symbol);
  formData.append("description", tokenInfo.description);
  
  if (tokenInfo.twitter) {
    formData.append("twitter", tokenInfo.twitter);
  }
  
  if (tokenInfo.telegram) {
    formData.append("telegram", tokenInfo.telegram);
  }
  
  if (tokenInfo.website) {
    formData.append("website", tokenInfo.website);
  }
  
  formData.append("showName", "true");
  
  return formData;
}

/**
 * 上传元数据到IPFS
 * @param {Object} formData 表单数据
 * @returns {Object|null} 上传结果
 */
async function uploadMetadata(formData) {
  try {
    console.log('上传元数据到IPFS...');
    const response = await fetch("https://pump.fun/api/ipfs", {
      method: "POST",
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`上传元数据失败: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log('元数据上传成功:', result.metadataUri);
    
    return result;
  } catch (error) {
    console.error(`上传元数据失败: ${error.message}`);
    return null;
  }
}

module.exports = { 
  handleNewToken, 
  fetchMetadata, 
  downloadImage, 
  prepareMetadata, 
  uploadMetadata 
}; 