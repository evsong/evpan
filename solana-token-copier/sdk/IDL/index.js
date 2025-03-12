const path = require('path');
const fs = require('fs');
const IDL = require('./pump-fun.json');

// 确保 IDL 包含 address 字段
if (!IDL.address) {
  // 如果 IDL 没有 address，手动添加
  IDL.address = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
}

// 验证 IDL 格式
if (!IDL || !IDL.address) {
  throw new Error('Invalid IDL format: missing address field after fix attempt');
}

console.log('IDL 加载成功，地址:', IDL.address);

module.exports = { IDL }; 