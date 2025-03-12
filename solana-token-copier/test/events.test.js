const { startMonitoring } = require('../backend/monitor');
const { expect } = require('chai');

describe('事件监听测试', () => {
  let monitor;
  
  afterEach(async () => {
    // 每个测试后停止监听
    if (monitor) {
      monitor.stop();
    }
  });
  
  it('应该能成功启动监听', async () => {
    let error;
    try {
      monitor = await startMonitoring(() => {});
    } catch (e) {
      error = e;
    }
    expect(error).to.be.undefined;
    expect(monitor).to.have.property('stop').that.is.a('function');
  });
  
  it('应该能正确处理新代币事件', (done) => {
    startMonitoring((tokenInfo) => {
      try {
        expect(tokenInfo).to.be.an('object');
        expect(tokenInfo).to.have.property('name').that.is.a('string');
        expect(tokenInfo).to.have.property('symbol').that.is.a('string');
        expect(tokenInfo).to.have.property('mint').that.is.a('string');
        expect(tokenInfo).to.have.property('uri').that.is.a('string');
        done();
      } catch (e) {
        done(e);
      }
    }).then(m => {
      monitor = m;
    }).catch(done);
  }).timeout(30000); // 给予足够的时间等待事件
  
  it('应该能正确停止监听', async () => {
    monitor = await startMonitoring(() => {});
    let error;
    try {
      monitor.stop();
    } catch (e) {
      error = e;
    }
    expect(error).to.be.undefined;
  });
}); 