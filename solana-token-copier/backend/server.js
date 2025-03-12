const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { startMonitoring } = require('./monitor');
const { startTradeMonitoring, getTradeRecords } = require('./tradeMonitor');
const { createToken, sellToken } = require('./token');
const { getPendingTokens, getCreatedTokens, getSoldTokens, deleteToken } = require('./redis');
const config = require('./config');

// 创建应用
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// 全局变量
let monitor = null;
let isMonitoring = false;
let tradeMonitors = new Map(); // 存储正在监控的代币交易监视器

// 静态文件服务
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/images', express.static(path.join(__dirname, '../images')));

// API路由
app.use(express.json());

// 获取代币列表
app.get('/api/tokens', async (req, res) => {
  try {
    const pendingTokens = await getPendingTokens();
    const createdTokens = await getCreatedTokens();
    const soldTokens = await getSoldTokens();
    
    res.json({
      pending: pendingTokens,
      created: createdTokens,
      sold: soldTokens
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 创建代币
app.post('/api/tokens/create', async (req, res) => {
  try {
    const { mintAddress } = req.body;
    if (!mintAddress) {
      return res.status(400).json({ error: '缺少mintAddress参数' });
    }
    
    const result = await createToken({ mint: mintAddress });
    
    // 创建成功后，自动开始监控该代币的交易
    if (result.success) {
      startTokenTradeMonitor(result.newMintAddress || result.mintAddress);
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 卖出代币
app.post('/api/tokens/sell', async (req, res) => {
  try {
    const { mintAddress } = req.body;
    if (!mintAddress) {
      return res.status(400).json({ error: '缺少mintAddress参数' });
    }
    
    const result = await sellToken(mintAddress);
    
    // 卖出后停止监控
    stopTokenTradeMonitor(mintAddress);
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 删除代币
app.delete('/api/tokens/:mintAddress', async (req, res) => {
  try {
    const { mintAddress } = req.params;
    if (!mintAddress) {
      return res.status(400).json({ error: '缺少mintAddress参数' });
    }
    
    // 停止监控
    stopTokenTradeMonitor(mintAddress);
    
    const result = await deleteToken(mintAddress);
    res.json({ success: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 监控状态
app.get('/api/monitoring/status', (req, res) => {
  res.json({ isMonitoring });
});

// 启动监控
app.post('/api/monitoring/start', async (req, res) => {
  try {
    if (isMonitoring) {
      return res.json({ success: true, message: '监控已经在运行中' });
    }
    
    console.log('尝试启动监控...');
    try {
      // 在每次尝试启动之前，确保没有进程在运行
      if (monitor) {
        try {
          monitor.stop();
          monitor = null;
        } catch (stopErr) {
          console.error(`停止旧监控失败: ${stopErr.message}`);
          // 继续，不要让这阻止新监控的启动
        }
      }
      
      // 启动新监控
      monitor = await startMonitoring((token) => {
        try {
          // 通过WebSocket推送新发现的代币
          io.emit('newToken', token);
          console.log(`已向客户端推送新代币: ${token.name}`);
        } catch (emitErr) {
          console.error(`WebSocket推送失败: ${emitErr.message}`);
        }
      });
      
      isMonitoring = true;
      console.log('监控启动成功');
      res.json({ success: true });
    } catch (monitorError) {
      monitor = null;
      isMonitoring = false;
      console.error(`监控启动失败: ${monitorError.message}`);
      // 返回更详细的错误信息
      return res.status(500).json({ 
        success: false, 
        error: monitorError.message,
        details: '启动监控时出错，请检查连接配置和RPC服务状态'
      });
    }
  } catch (error) {
    console.error(`处理请求失败: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      details: '处理监控请求时出错'
    });
  }
});

// 停止监控
app.post('/api/monitoring/stop', (req, res) => {
  try {
    if (!isMonitoring) {
      return res.json({ success: true, message: '监控未在运行' });
    }
    
    if (monitor) {
      monitor.stop();
      monitor = null;
    }
    
    isMonitoring = false;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 启动代币交易监控
app.post('/api/tokens/:mintAddress/monitor', async (req, res) => {
  try {
    const { mintAddress } = req.params;
    if (!mintAddress) {
      return res.status(400).json({ error: '缺少mintAddress参数' });
    }
    
    const result = await startTokenTradeMonitor(mintAddress);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 停止代币交易监控
app.post('/api/tokens/:mintAddress/monitor/stop', async (req, res) => {
  try {
    const { mintAddress } = req.params;
    if (!mintAddress) {
      return res.status(400).json({ error: '缺少mintAddress参数' });
    }
    
    const result = stopTokenTradeMonitor(mintAddress);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取代币交易记录
app.get('/api/tokens/:mintAddress/trades', async (req, res) => {
  try {
    const { mintAddress } = req.params;
    if (!mintAddress) {
      return res.status(400).json({ error: '缺少mintAddress参数' });
    }
    
    const trades = await getTradeRecords(mintAddress);
    res.json(trades);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 启动代币交易监控函数
async function startTokenTradeMonitor(mintAddress) {
  try {
    // 如果已经在监控，先停止
    if (tradeMonitors.has(mintAddress)) {
      const existingMonitor = tradeMonitors.get(mintAddress);
      existingMonitor.stop();
      tradeMonitors.delete(mintAddress);
    }
    
    // 创建新的监控
    const monitor = await startTradeMonitoring(mintAddress, (event) => {
      // 通过WebSocket推送交易事件
      io.emit('tradeEvent', { ...event, mintAddress });
    });
    
    // 保存监控对象
    tradeMonitors.set(mintAddress, monitor);
    
    console.log(`开始监控代币 ${mintAddress} 的交易`);
    return { success: true, message: `已开始监控代币 ${mintAddress} 的交易` };
  } catch (error) {
    console.error(`监控代币 ${mintAddress} 交易失败:`, error);
    return { success: false, error: error.message };
  }
}

// 停止代币交易监控函数
function stopTokenTradeMonitor(mintAddress) {
  if (tradeMonitors.has(mintAddress)) {
    const monitor = tradeMonitors.get(mintAddress);
    monitor.stop();
    tradeMonitors.delete(mintAddress);
    console.log(`停止监控代币 ${mintAddress} 的交易`);
    return { success: true, message: `已停止监控代币 ${mintAddress} 的交易` };
  }
  
  return { success: false, message: `代币 ${mintAddress} 未在监控中` };
}

// WebSocket连接
io.on('connection', (socket) => {
  console.log('客户端已连接:', socket.id);
  
  // 客户端请求开始监控特定代币
  socket.on('startTokenMonitor', async (mintAddress) => {
    try {
      const result = await startTokenTradeMonitor(mintAddress);
      socket.emit('tokenMonitorStatus', { mintAddress, ...result });
    } catch (error) {
      socket.emit('tokenMonitorStatus', { 
        mintAddress, 
        success: false, 
        error: error.message 
      });
    }
  });
  
  // 客户端请求停止监控特定代币
  socket.on('stopTokenMonitor', (mintAddress) => {
    try {
      const result = stopTokenTradeMonitor(mintAddress);
      socket.emit('tokenMonitorStatus', { mintAddress, ...result });
    } catch (error) {
      socket.emit('tokenMonitorStatus', { 
        mintAddress, 
        success: false, 
        error: error.message 
      });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('客户端已断开连接:', socket.id);
  });
});

// 启动服务器
server.listen(config.port, () => {
  console.log(`服务器已启动，端口: ${config.port}`);
});

// 处理进程退出
process.on('SIGINT', () => {
  console.log('接收到终止信号');
  
  // 停止所有代币交易监控
  for (const [mintAddress, monitor] of tradeMonitors.entries()) {
    console.log(`停止监控代币 ${mintAddress} 的交易`);
    monitor.stop();
  }
  tradeMonitors.clear();
  
  if (monitor) {
    monitor.stop();
    monitor = null;
  }
  
  console.log('退出程序');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  // 保持程序运行，但记录错误
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
  // 保持程序运行，但记录错误
}); 