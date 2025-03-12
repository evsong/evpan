const path = require('path');
const IDL = require('./pump-fun.json');

// 验证 IDL 格式
if (!IDL || !IDL.address) {
  throw new Error('Invalid IDL format: missing address field');
}

module.exports = { IDL }; 