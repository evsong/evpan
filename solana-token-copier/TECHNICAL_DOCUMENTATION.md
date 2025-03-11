# Solana代币自动发盘工具 - 技术文档

## 1. 项目概述

Solana代币自动发盘工具是一个专为Solana区块链设计的自动化应用，用于监听、复制和交易代币，集成了PumpFunSDK实现与协议的交互。本文档详细介绍了系统架构、API接口以及实现原理。

### 1.1 核心功能

- 实时监控Solana区块链上的新代币创建事件
- 自动获取代币元数据（名称、符号、描述、图片等）
- 支持多种开盘模式（CA仿盘、自定义开盘、随机仿盘）
- 自动化代币创建和交易流程
- 实时交易监控和统计
- 基于Redis的高效数据存储

### 1.2 技术栈

- **前端**: HTML5, CSS3, JavaScript (原生)
- **后端**: Node.js, Express
- **存储**: Redis
- **区块链交互**: Solana Web3.js, SPL Token, Anchor
- **实时通信**: Socket.io

## 2. 系统架构

### 2.1 架构概览

```
+------------------+        +-------------------+       +------------------+
|                  |        |                   |       |                  |
|  前端界面        |<------>|  后端服务         |<----->|  Solana区块链    |
|  (HTML/JS/CSS)   |        |  (Node.js/Express)|       |                  |
|                  |        |                   |       |                  |
+------------------+        +-------------------+       +------------------+
                                     ^
                                     |
                                     v
                            +-------------------+
                            |                   |
                            |  Redis数据存储    |
                            |                   |
                            +-------------------+
```

### 2.2 模块组成

- **SDK模块**: 封装与PumpFun协议交互的核心功能
- **监控模块**: 负责监听区块链上的代币创建事件
- **元数据模块**: 处理代币元数据的获取与存储
- **代币操作模块**: 实现代币的创建与交易
- **数据存储模块**: 使用Redis管理代币信息和状态
- **交易监控模块**: 跟踪和记录代币的交易活动
- **前端界面**: 提供用户操作界面和可视化展示

## 3. SDK模块详解

### 3.1 PumpFunSDK

核心类，封装与PumpFun协议的所有交互。

主要方法：
- `createAndBuy`: 创建代币并执行初始购买
- `buy`: 购买代币
- `sell`: 出售代币
- `getCreateInstructions`: 获取创建代币的指令
- `getBondingCurveAccount`: 获取债券曲线账户信息
- `getGlobalAccount`: 获取全局账户信息

### 3.2 账户模型

- **GlobalAccount**: 管理全局参数和费用设置
- **BondingCurveAccount**: 管理代币的价格曲线和流动性池

### 3.3 交易工具

- `sendTx`: 发送交易到Solana网络
- `buildVersionedTx`: 构建带版本的交易
- `calculateWithSlippageBuy/Sell`: 计算交易滑点

## 4. 后端服务

### 4.1 服务器配置

```javascript
// 服务器配置示例
{
  port: 3000,
  solanaRpcUrl: "https://api.mainnet-beta.solana.com",
  jitoUrl: "https://amsterdam.mainnet.block-engine.jito.wtf:443/api/v1/bundles",
  redisConfig: {
    host: "localhost",
    port: 6379,
    password: "your_redis_password"
  },
  imagePath: "./images"
}
```

### 4.2 API接口

#### 代币管理

- `GET /api/tokens` - 获取所有代币列表
- `GET /api/tokens/info?ca={address}` - 获取代币信息
- `POST /api/tokens/create` - 创建新代币
- `POST /api/tokens/sell` - 卖出代币
- `DELETE /api/tokens/{mintAddress}` - 删除代币记录

#### 监控管理

- `GET /api/monitoring/status` - 获取监控状态
- `POST /api/monitoring/start` - 启动监控
- `POST /api/monitoring/stop` - 停止监控

#### 交易监控

- `GET /api/tokens/{mintAddress}/trades` - 获取代币交易记录

### 4.3 WebSocket事件

- `newToken` - 发现新代币时触发
- `tradeEvent` - 发生交易时触发
- `tokenMonitorStatus` - 代币监控状态变化时触发

## 5. 数据结构

### 5.1 代币信息

```javascript
{
  mint: "代币地址",
  name: "代币名称",
  symbol: "代币符号",
  description: "代币描述",
  twitter: "Twitter链接",
  telegram: "Telegram链接",
  website: "网站链接",
  discoveredAt: 1234567890, // 时间戳
  status: "pending|created|sold", // 代币状态
  createdAt: 1234567890, // 创建时间
  soldAt: 1234567890 // 卖出时间
}
```

### 5.2 交易记录

```javascript
{
  mintAddress: "代币地址",
  type: "buy|sell", // 交易类型
  solAmount: 0.5, // SOL数量
  tokenAmount: 10, // 代币数量
  price: 0.05, // 单价
  timestamp: 1234567890, // 时间戳
  wallet: "交易钱包地址",
  isOurWallet: true|false, // 是否为系统钱包
  progressPercentage: 35 // 交易进度百分比
}
```

## 6. 前端界面

### 6.1 界面布局

```
+---------------------------------------+
|              页面标题                  |
+---------------------------------------+
| 操作区域        |       系统日志        |
| (开盘选项)      |                     |
|                |                     |
+----------------+---------------------+
| 配置区域        |       交易监控        |
| (代币参数)      |     (统计和记录)      |
|                |                     |
+----------------+---------------------+
```

### 6.2 主要组件

- **操作模式选择器**: 切换不同开盘策略
- **CA输入框**: 输入目标代币合约地址
- **操作按钮**: 一键开盘、一键卖出
- **系统日志**: 显示操作和事件记录
- **配置面板**: 设置代币数量、价格和持仓时间
- **交易统计**: 显示买入卖出总量和净值
- **交易记录列表**: 显示每笔交易细节

## 7. 实现原理

### 7.1 代币监控流程

```
启动监控 -> 监听链上事件 -> 发现新代币 -> 获取元数据 -> 下载图片 -> 通知前端
```

### 7.2 代币创建流程

```
用户触发创建 -> 构建元数据 -> 调用SDK -> 执行交易 -> 更新状态 -> 通知前端
```

### 7.3 交易监控流程

```
启动监控 -> 订阅代币地址 -> 解析交易事件 -> 记录交易 -> 计算统计 -> 推送前端
```

### 7.4 自动卖出机制

```
创建代币 -> 设置计时器(持仓时间) -> 时间到达 -> 执行卖出 -> 更新状态 -> 通知前端
```

## 8. 部署指南

### 8.1 环境准备

- Node.js v16+
- Redis服务器
- Solana钱包(有足够的SOL余额)

### 8.2 安装步骤

1. 克隆代码仓库
   ```bash
   git clone https://github.com/yourusername/solana-token-copier.git
   cd solana-token-copier
   ```

2. 安装依赖
   ```bash
   npm install
   ```

3. 配置环境变量
   ```bash
   cp .env.example .env
   # 编辑.env文件设置必要参数
   ```

4. 创建图片存储目录
   ```bash
   mkdir -p images
   ```

5. 启动服务
   ```bash
   npm start
   # 或开发模式
   npm run dev
   ```

### 8.3 生产环境配置

- 使用PM2管理进程
  ```bash
  npm install -g pm2
  pm2 start backend/server.js --name solana-token-copier
  ```

- 配置Nginx反向代理
  ```nginx
  server {
    listen 80;
    server_name your-domain.com;
    
    location / {
      proxy_pass http://localhost:3000;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection 'upgrade';
      proxy_set_header Host $host;
      proxy_cache_bypass $http_upgrade;
    }
  }
  ```

## 9. 性能优化

### 9.1 Redis索引

为了提高查询效率，系统为代币Mint地址和状态创建了专用索引。

### 9.2 图片处理

代币图片下载后会进行本地缓存，避免重复请求和处理。

### 9.3 批量操作

使用Redis的pipeline批量处理数据操作，减少网络往返。

## 10. 安全考虑

### 10.1 私钥管理

私钥存储在环境变量中，不应出现在版本控制系统。

### 10.2 输入验证

所有API输入都经过严格验证，防止注入攻击。

### 10.3 限流措施

实施API请求限流，防止过度使用和资源耗尽。

## 11. 故障排除

### 11.1 常见错误

- **连接错误**: 检查Solana RPC URL和网络连接
- **交易失败**: 检查钱包余额和网络拥堵情况
- **数据不同步**: 重启Redis或清除缓存
- **监控无响应**: 检查WebSocket连接和事件监听器

### 11.2 日志分析

系统日志分为不同级别：
- `info`: 一般信息
- `success`: 成功操作
- `warning`: 需要注意的情况
- `error`: 错误情况

### 11.3 解决方案

- 重启服务
- 检查网络连接
- 验证配置参数
- 查看详细错误日志

## 12. 未来扩展

### 12.1 计划功能

- 支持多钱包操作
- 添加更多交易策略
- 集成价格预测模型
- 支持自定义交易滑点
- 集成更多DEX支持

### 12.2 性能改进

- 引入数据库缓存
- 优化链上数据获取
- 实现交易事件的批处理

---

## 附录

### A. 配置参考

完整的`.env`配置示例：

```
# Solana配置
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
JITO_URL=https://amsterdam.mainnet.block-engine.jito.wtf:443/api/v1/bundles

# 交易配置
INITIAL_BUY_AMOUNT=0.5
HOLD_DURATION=1800000

# 钱包配置
CREATOR_PRIVATE_KEY=your_private_key_here

# Redis配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# 服务器配置
PORT=3000
IMAGE_PATH=./images
```

### B. 依赖列表

主要依赖包及版本：

- @coral-xyz/anchor: ^0.30.1
- @coral-xyz/borsh: ^0.30.1
- @solana/spl-token: ^0.4.9
- @solana/web3.js: ^1.95.5
- base-58: ^2.0.1
- bn.js: ^5.2.1
- dotenv: ^16.3.1
- express: ^4.18.2
- form-data: ^4.0.0
- ioredis: ^5.3.2
- node-fetch: ^2.7.0
- socket.io: ^4.7.2

### C. 常用命令参考

```bash
# 启动服务
npm start

# 开发模式启动
npm run dev

# 查看日志
pm2 logs solana-token-copier

# 重启服务
pm2 restart solana-token-copier

# 备份Redis数据
redis-cli -a your_redis_password save
```

---

**版本**: 1.0.0  
**更新日期**: 2023年12月15日  
**作者**: Solana代币自动发盘工具开发团队 