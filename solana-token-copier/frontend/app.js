document.addEventListener('DOMContentLoaded', () => {
  // 初始化Socket.io
  const socket = io();
  
  // DOM元素 - 操作区域
  const caCloneBtn = document.getElementById('ca-clone-btn');
  const customTokenBtn = document.getElementById('custom-token-btn');
  const randomTokenBtn = document.getElementById('random-token-btn');
  const caInputContainer = document.getElementById('ca-input-container');
  const caAddressInput = document.getElementById('ca-address');
  const caClearBtn = document.getElementById('ca-clear-btn');
  const caStopBtn = document.getElementById('ca-stop-btn');
  const oneClickCreateBtn = document.getElementById('one-click-create');
  const oneClickSellBtn = document.getElementById('one-click-sell');
  
  // DOM元素 - 系统日志
  const systemLog = document.getElementById('system-log');
  
  // DOM元素 - 配置
  const tokenAmountInput = document.getElementById('token-amount');
  const solPerTokenInput = document.getElementById('sol-per-token');
  const holdTimeInput = document.getElementById('hold-time');
  
  // DOM元素 - 交易监控
  const totalBuySol = document.getElementById('total-buy-sol');
  const totalBuyCount = document.getElementById('total-buy-count');
  const totalSellSol = document.getElementById('total-sell-sol');
  const totalSellCount = document.getElementById('total-sell-count');
  const netBuySol = document.getElementById('net-buy-sol');
  const progressBar = document.getElementById('progress-bar');
  const progressPercentage = document.getElementById('progress-percentage');
  const tradeRecordsList = document.getElementById('trade-records-list');
  
  // 模态框元素
  const tokenDetailsModal = document.getElementById('token-details-modal');
  const closeModal = document.querySelector('.close');
  
  // 状态变量
  let currentMode = null; // 'ca-clone', 'custom', 'random'
  let currentToken = null;
  let isMonitoring = false;
  let currentMonitoredMint = null;
  
  // 添加系统日志
  function addSystemLog(message, status = 'info') {
    const now = new Date();
    const timeStr = now.toLocaleTimeString();
    
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    
    logEntry.innerHTML = `
      <div class="log-time">${timeStr}</div>
      <div class="log-status ${status}">${status}</div>
      <div class="log-message">${message}</div>
    `;
    
    systemLog.appendChild(logEntry);
    systemLog.scrollTop = systemLog.scrollHeight;
    
    // 保持只显示最新的50条日志
    const entries = systemLog.querySelectorAll('.log-entry');
    if (entries.length > 50) {
      systemLog.removeChild(entries[0]);
    }
  }
  
  // 显示通知
  function showNotification(title, message, type = 'info') {
    // 移除已有通知
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => {
      notification.remove();
    });
    
    // 创建新通知
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    let iconClass = '';
    switch (type) {
      case 'success':
        iconClass = 'fa-check-circle';
        break;
      case 'error':
        iconClass = 'fa-times-circle';
        break;
      case 'warning':
        iconClass = 'fa-exclamation-triangle';
        break;
      default:
        iconClass = 'fa-info-circle';
    }
    
    notification.innerHTML = `
      <div class="notification-icon">
        <i class="fas ${iconClass}"></i>
      </div>
      <div class="notification-content">
        <h4>${title}</h4>
        <p>${message}</p>
      </div>
      <div class="notification-close">
        <i class="fas fa-times"></i>
      </div>
    `;
    
    // 添加关闭事件
    notification.querySelector('.notification-close').addEventListener('click', () => {
      notification.classList.remove('show');
      setTimeout(() => {
        notification.remove();
      }, 300);
    });
    
    // 添加到页面
    document.body.appendChild(notification);
    
    // 显示通知
    setTimeout(() => {
      notification.classList.add('show');
    }, 10);
    
    // 自动关闭
    setTimeout(() => {
      if (document.body.contains(notification)) {
        notification.classList.remove('show');
        setTimeout(() => {
          if (document.body.contains(notification)) {
            notification.remove();
          }
        }, 300);
      }
    }, 5000);
    
    // 同时添加到系统日志
    addSystemLog(message, type);
  }
  
  // 格式化日期
  function formatDate(timestamp) {
    if (!timestamp) return '未知';
    
    const date = new Date(parseInt(timestamp));
    
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
  }
  
  // 截断地址显示
  function truncateAddress(address) {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  }
  
  // 切换操作模式
  function switchMode(mode) {
    currentMode = mode;
    
    // 重置所有按钮样式
    caCloneBtn.classList.remove('active');
    customTokenBtn.classList.remove('active');
    randomTokenBtn.classList.remove('active');
    
    // 隐藏CA输入容器
    caInputContainer.classList.add('hidden');
    
    // 根据模式设置激活样式和显示相应元素
    switch (mode) {
      case 'ca-clone':
        caCloneBtn.classList.add('active');
        caInputContainer.classList.remove('hidden');
        addSystemLog('已切换到CA仿盘模式，请输入要模仿的代币合约地址');
        break;
      case 'custom':
        customTokenBtn.classList.add('active');
        showNotification('自定义开盘', '已切换到自定义开盘模式，点击"一键开盘"可立即创建您自定义的代币', 'info');
        break;
      case 'random':
        randomTokenBtn.classList.add('active');
        showNotification('随机仿盘', '已切换到随机仿盘模式，系统将监控新币并自动仿盘', 'info');
        startRandomMonitoring();
        break;
    }
  }
  
  // CA仿盘 - 获取代币信息
  async function getTokenInfoByCA(caAddress) {
    try {
      addSystemLog(`正在获取CA: ${caAddress} 的代币信息...`);
      showNotification('处理中', `正在获取 ${truncateAddress(caAddress)} 的代币信息`, 'info');
      
      const response = await fetch(`/api/tokens/info?ca=${caAddress}`, {
        method: 'GET'
      });
      
      if (!response.ok) {
        throw new Error('无法获取代币信息');
      }
      
      const tokenInfo = await response.json();
      
      if (tokenInfo.success) {
        addSystemLog(`成功获取代币 ${tokenInfo.data.name} (${tokenInfo.data.symbol}) 的信息`, 'success');
        showNotification('获取成功', `已获取代币 ${tokenInfo.data.name} 的信息，点击"一键开盘"可立即创建`, 'success');
        currentToken = tokenInfo.data;
        return tokenInfo.data;
      } else {
        throw new Error(tokenInfo.error || '获取代币信息失败');
      }
    } catch (error) {
      addSystemLog(`获取代币信息失败: ${error.message}`, 'error');
      showNotification('获取失败', `获取代币信息失败: ${error.message}`, 'error');
      return null;
    }
  }
  
  // 随机仿盘 - 开始监控
  async function startRandomMonitoring() {
    try {
      addSystemLog('正在启动随机仿盘监控...');
      
      const response = await fetch('/api/monitoring/start', {
        method: 'POST'
      });
      
      const result = await response.json();
      
      if (result.success) {
        isMonitoring = true;
        addSystemLog('随机仿盘监控已启动，等待新币发现...', 'success');
        showNotification('监控已启动', '正在监听新代币创建事件', 'success');
      } else {
        throw new Error(result.message || '启动监控失败');
      }
    } catch (error) {
      addSystemLog(`启动随机仿盘监控失败: ${error.message}`, 'error');
      showNotification('启动失败', `启动随机仿盘监控失败: ${error.message}`, 'error');
    }
  }
  
  // 停止随机仿盘监控
  async function stopRandomMonitoring() {
    try {
      addSystemLog('正在停止随机仿盘监控...');
      
      const response = await fetch('/api/monitoring/stop', {
        method: 'POST'
      });
      
      const result = await response.json();
      
      if (result.success) {
        isMonitoring = false;
        addSystemLog('随机仿盘监控已停止', 'success');
        showNotification('监控已停止', '已停止监听新代币创建事件', 'success');
      } else {
        throw new Error(result.message || '停止监控失败');
      }
    } catch (error) {
      addSystemLog(`停止随机仿盘监控失败: ${error.message}`, 'error');
      showNotification('停止失败', `停止随机仿盘监控失败: ${error.message}`, 'error');
    }
  }
  
  // 一键开盘
  async function oneClickCreate() {
    try {
      const tokenAmount = parseInt(tokenAmountInput.value);
      const solPerToken = parseFloat(solPerTokenInput.value);
      const holdTime = parseInt(holdTimeInput.value);
      
      if (isNaN(tokenAmount) || isNaN(solPerToken) || isNaN(holdTime)) {
        throw new Error('请输入有效的配置数值');
      }
      
      let createParams = {
        tokenAmount,
        solPerToken,
        holdTime
      };
      
      addSystemLog(`开始一键开盘，配置: ${tokenAmount}个, ${solPerToken} SOL/个, 持仓${holdTime}分钟`);
      
      switch (currentMode) {
        case 'ca-clone':
          if (!currentToken) {
            throw new Error('请先获取目标CA的代币信息');
          }
          createParams.sourceToken = currentToken;
          break;
        case 'custom':
          // 自定义模式
          createParams.isCustom = true;
          break;
        case 'random':
          if (!currentToken) {
            throw new Error('随机模式下需要先发现新币才能开盘');
          }
          createParams.sourceToken = currentToken;
          break;
        default:
          throw new Error('请先选择开盘模式');
      }
      
      showNotification('处理中', '正在创建代币...', 'info');
      
      const response = await fetch('/api/tokens/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(createParams)
      });
      
      const result = await response.json();
      
      if (result.success) {
        addSystemLog(`代币 ${result.name} 创建成功，Mint地址: ${result.mintAddress}`, 'success');
        showNotification('创建成功', `代币 ${result.name} 创建成功`, 'success');
        
        // 自动开始监控交易
        currentMonitoredMint = result.mintAddress;
        startTradeMonitor(result.mintAddress);
      } else {
        throw new Error(result.error || '创建代币失败');
      }
    } catch (error) {
      addSystemLog(`创建代币失败: ${error.message}`, 'error');
      showNotification('创建失败', `创建代币失败: ${error.message}`, 'error');
    }
  }
  
  // 一键卖出
  async function oneClickSell() {
    try {
      if (!currentMonitoredMint) {
        throw new Error('没有正在监控的代币，无法卖出');
      }
      
      addSystemLog(`正在卖出代币 ${truncateAddress(currentMonitoredMint)}...`);
      showNotification('处理中', `正在卖出代币...`, 'info');
      
      const response = await fetch('/api/tokens/sell', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ mintAddress: currentMonitoredMint })
      });
      
      const result = await response.json();
      
      if (result.success) {
        addSystemLog(`代币 ${truncateAddress(currentMonitoredMint)} 卖出成功`, 'success');
        showNotification('卖出成功', `代币卖出成功`, 'success');
        
        // 停止交易监控
        stopTradeMonitor();
      } else {
        throw new Error(result.error || '卖出代币失败');
      }
    } catch (error) {
      addSystemLog(`卖出代币失败: ${error.message}`, 'error');
      showNotification('卖出失败', `卖出代币失败: ${error.message}`, 'error');
    }
  }
  
  // 开始交易监控
  async function startTradeMonitor(mintAddress) {
    if (!mintAddress) {
      showNotification('错误', '无效的代币地址', 'error');
      return;
    }
    
    try {
      // 清空交易记录
      clearTradeStatistics();
      
      // 开始监控
      addSystemLog(`开始监控代币 ${truncateAddress(mintAddress)} 的交易...`);
      socket.emit('startTokenMonitor', mintAddress);
      currentMonitoredMint = mintAddress;
      
      // 加载历史交易记录
      await loadTradeRecords(mintAddress);
    } catch (error) {
      addSystemLog(`启动交易监控失败: ${error.message}`, 'error');
      showNotification('错误', `启动交易监控失败: ${error.message}`, 'error');
    }
  }
  
  // 停止交易监控
  function stopTradeMonitor() {
    if (!currentMonitoredMint) return;
    
    try {
      addSystemLog(`停止监控代币 ${truncateAddress(currentMonitoredMint)} 的交易`);
      socket.emit('stopTokenMonitor', currentMonitoredMint);
      currentMonitoredMint = null;
      
      // 清空统计数据
      clearTradeStatistics();
    } catch (error) {
      addSystemLog(`停止交易监控失败: ${error.message}`, 'error');
      showNotification('错误', `停止交易监控失败: ${error.message}`, 'error');
    }
  }
  
  // 加载交易记录
  async function loadTradeRecords(mintAddress) {
    try {
      addSystemLog(`加载代币 ${truncateAddress(mintAddress)} 的交易记录...`);
      
      const response = await fetch(`/api/tokens/${mintAddress}/trades`);
      const trades = await response.json();
      
      if (trades && trades.length > 0) {
        // 清空现有记录
        tradeRecordsList.innerHTML = '';
        
        // 更新统计信息
        updateTradeStatistics(trades[0].stats);
        
        // 渲染交易记录
        trades.forEach(trade => {
          addTradeRecord(trade);
        });
        
        addSystemLog(`成功加载 ${trades.length} 条交易记录`, 'success');
      } else {
        tradeRecordsList.innerHTML = `
          <div class="empty-state">
            <i class="fas fa-chart-line"></i>
            <p>暂无交易记录</p>
          </div>
        `;
        addSystemLog('没有找到交易记录', 'info');
      }
    } catch (error) {
      addSystemLog(`加载交易记录失败: ${error.message}`, 'error');
      tradeRecordsList.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-exclamation-triangle"></i>
          <p>加载交易记录失败</p>
        </div>
      `;
    }
  }
  
  // 清空交易统计
  function clearTradeStatistics() {
    totalBuySol.textContent = '0 SOL';
    totalBuyCount.textContent = '0笔';
    totalSellSol.textContent = '0 SOL';
    totalSellCount.textContent = '0笔';
    netBuySol.textContent = '0 SOL';
    progressBar.style.width = '0%';
    progressPercentage.textContent = '0%';
    
    tradeRecordsList.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-chart-line"></i>
        <p>等待交易数据...</p>
      </div>
    `;
  }
  
  // 更新交易统计
  function updateTradeStatistics(stats) {
    if (!stats) return;
    
    totalBuySol.textContent = `${stats.totalBuySOL.toFixed(4)} SOL`;
    totalBuyCount.textContent = `${stats.totalBuyCount}笔`;
    totalSellSol.textContent = `${stats.totalSellSOL.toFixed(4)} SOL`;
    totalSellCount.textContent = `${stats.totalSellCount}笔`;
    netBuySol.textContent = `${stats.netBuySOL.toFixed(4)} SOL`;
  }
  
  // 添加交易记录
  function addTradeRecord(trade) {
    // 如果是第一条记录，清空空状态提示
    if (tradeRecordsList.querySelector('.empty-state')) {
      tradeRecordsList.innerHTML = '';
    }
    
    // 更新进度条
    if (trade.progressPercentage) {
      progressBar.style.width = `${trade.progressPercentage}%`;
      progressPercentage.textContent = `${trade.progressPercentage}%`;
    }
    
    // 创建交易记录元素
    const recordEl = document.createElement('div');
    recordEl.className = `trade-record trade-record-${trade.type} ${trade.isOurWallet ? 'trade-record-our' : ''}`;
    
    recordEl.innerHTML = `
      <div class="trade-info">
        <span class="trade-type trade-type-${trade.type}">${trade.type === 'buy' ? '买入' : '卖出'}</span>
        <div class="trade-details">
          <div class="trade-detail">
            <strong>SOL:</strong> ${trade.solAmount.toFixed(4)}
          </div>
          <div class="trade-detail">
            <strong>数量:</strong> ${trade.tokenAmount.toFixed(4)}
          </div>
          <div class="trade-detail">
            <strong>价格:</strong> ${trade.price} SOL
          </div>
        </div>
      </div>
      <div class="trade-time">
        ${formatDate(trade.timestamp)}
      </div>
    `;
    
    // 添加到列表最前面
    tradeRecordsList.insertBefore(recordEl, tradeRecordsList.firstChild);
    
    // 如果记录超过50条，移除最旧的
    const records = tradeRecordsList.querySelectorAll('.trade-record');
    if (records.length > 50) {
      records[records.length - 1].remove();
    }
    
    // 添加日志
    addSystemLog(`${trade.type === 'buy' ? '买入' : '卖出'} ${trade.solAmount.toFixed(4)} SOL, 价格: ${trade.price} SOL`, trade.type === 'buy' ? 'info' : 'warning');
  }
  
  // 显示代币详情模态框
  function showTokenDetails(token) {
    currentToken = token;
    
    // 设置基本信息
    document.getElementById('modal-token-name').textContent = token.name;
    document.getElementById('modal-token-symbol').textContent = token.symbol;
    document.getElementById('modal-token-mint').textContent = token.mint;
    document.getElementById('modal-token-discovered').textContent = formatDate(token.discoveredAt);
    document.getElementById('modal-token-description').textContent = token.description || '无描述';
    
    // 设置图片
    const imgSrc = `/images/${token.mint}.png`;
    const fallbackSrc = `/images/${token.mint}-placeholder.png`;
    document.getElementById('modal-token-image').src = imgSrc;
    document.getElementById('modal-token-image').onerror = function() {
      this.src = fallbackSrc;
    };
    
    // 设置社交链接
    const twitterLink = document.getElementById('modal-token-twitter');
    const telegramLink = document.getElementById('modal-token-telegram');
    const websiteLink = document.getElementById('modal-token-website');
    
    if (token.twitter) {
      twitterLink.href = token.twitter.startsWith('http') ? token.twitter : `https://twitter.com/${token.twitter}`;
      twitterLink.classList.remove('hidden');
    } else {
      twitterLink.classList.add('hidden');
    }
    
    if (token.telegram) {
      telegramLink.href = token.telegram.startsWith('http') ? token.telegram : `https://t.me/${token.telegram}`;
      telegramLink.classList.remove('hidden');
    } else {
      telegramLink.classList.add('hidden');
    }
    
    if (token.website) {
      websiteLink.href = token.website;
      websiteLink.classList.remove('hidden');
    } else {
      websiteLink.classList.add('hidden');
    }
    
    // 设置操作按钮
    const actionsContainer = document.getElementById('modal-actions');
    actionsContainer.innerHTML = `
      <button class="btn primary" id="modal-create-btn">
        <i class="fas fa-plus"></i> 一键开盘
      </button>
    `;
    
    // 添加按钮事件
    document.getElementById('modal-create-btn').addEventListener('click', () => {
      closeTokenDetails();
      oneClickCreate();
    });
    
    // 显示模态框
    tokenDetailsModal.style.display = 'block';
    document.body.style.overflow = 'hidden'; // 防止背景滚动
  }
  
  // 关闭代币详情
  function closeTokenDetails() {
    tokenDetailsModal.style.display = 'none';
    document.body.style.overflow = 'auto';
  }
  
  // 监听WebSocket事件
  socket.on('connect', () => {
    addSystemLog('WebSocket已连接', 'success');
  });
  
  socket.on('disconnect', () => {
    addSystemLog('WebSocket已断开连接', 'error');
  });
  
  socket.on('newToken', (token) => {
    addSystemLog(`发现新代币: ${token.name} (${token.symbol})`, 'success');
    showNotification('发现新代币', `${token.name} (${token.symbol})`, 'success');
    
    if (currentMode === 'random') {
      // 在随机模式下，自动设置为当前代币
      currentToken = token;
      addSystemLog('已自动选择新发现的代币用于开盘', 'info');
    }
  });
  
  socket.on('tradeEvent', (event) => {
    if (event.type === 'trade' && event.mintAddress === currentMonitoredMint) {
      // 更新统计信息
      updateTradeStatistics(event.data.stats);
      
      // 添加交易记录
      addTradeRecord(event.data);
    } else if (event.type === 'info' || event.type === 'error') {
      addSystemLog(event.message, event.type);
    }
  });
  
  socket.on('tokenMonitorStatus', (status) => {
    if (status.success) {
      if (status.message.includes('已开始监控')) {
        addSystemLog(`已开始监控代币 ${truncateAddress(status.mintAddress)}`, 'success');
      } else if (status.message.includes('已停止监控')) {
        addSystemLog(`已停止监控代币 ${truncateAddress(status.mintAddress)}`, 'info');
      }
    } else {
      addSystemLog(`监控操作失败: ${status.error || '未知错误'}`, 'error');
    }
  });
  
  // 事件监听 - 操作区域
  caCloneBtn.addEventListener('click', () => switchMode('ca-clone'));
  customTokenBtn.addEventListener('click', () => switchMode('custom'));
  randomTokenBtn.addEventListener('click', () => switchMode('random'));
  
  caClearBtn.addEventListener('click', () => {
    caAddressInput.value = '';
    addSystemLog('已清除CA地址输入', 'info');
  });
  
  caStopBtn.addEventListener('click', () => {
    if (currentMode === 'random') {
      stopRandomMonitoring();
    } else {
      addSystemLog('当前没有活动的监控', 'info');
    }
  });
  
  // 在CA模式下，按下回车键自动获取CA信息
  caAddressInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && caAddressInput.value.trim()) {
      getTokenInfoByCA(caAddressInput.value.trim());
    }
  });
  
  oneClickCreateBtn.addEventListener('click', oneClickCreate);
  oneClickSellBtn.addEventListener('click', oneClickSell);
  
  // 模态框事件
  closeModal.addEventListener('click', closeTokenDetails);
  
  // 点击模态框背景关闭
  tokenDetailsModal.addEventListener('click', (e) => {
    if (e.target === tokenDetailsModal) {
      closeTokenDetails();
    }
  });
  
  // ESC键关闭模态框
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && tokenDetailsModal.style.display === 'block') {
      closeTokenDetails();
    }
  });
  
  // 初始化
  addSystemLog('系统初始化完成', 'success');
  showNotification('系统就绪', '请选择开盘模式开始操作', 'info');
  
  // 默认选择CA仿盘模式
  switchMode('ca-clone');
}); 