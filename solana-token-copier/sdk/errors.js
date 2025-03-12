/**
 * SDK基础错误类
 */
class SDKError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'SDKError';
    this.code = code;
  }
}

/**
 * 连接错误类
 */
class ConnectionError extends SDKError {
  constructor(message, originalError) {
    super(`连接错误: ${message}`, 'CONNECTION_ERROR');
    this.originalError = originalError;
  }
}

/**
 * 账户错误类
 */
class AccountError extends SDKError {
  constructor(message, accountId, originalError) {
    super(`账户错误 (${accountId}): ${message}`, 'ACCOUNT_ERROR');
    this.accountId = accountId;
    this.originalError = originalError;
  }
}

/**
 * 交易错误类
 */
class TransactionError extends SDKError {
  constructor(message, signature, logs, originalError) {
    super(`交易错误: ${message}`, 'TRANSACTION_ERROR');
    this.signature = signature;
    this.logs = logs;
    this.originalError = originalError;
  }
}

/**
 * 配置错误类
 */
class ConfigurationError extends SDKError {
  constructor(message) {
    super(`配置错误: ${message}`, 'CONFIG_ERROR');
  }
}

module.exports = {
  SDKError,
  ConnectionError,
  AccountError,
  TransactionError,
  ConfigurationError
}; 