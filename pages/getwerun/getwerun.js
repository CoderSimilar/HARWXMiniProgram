const APP_ID = "wx9bb9c9bb18fe0b59";
const SECRET = "6a67283cde2578a77ebc921d9da39212";
const SERVER_URL = "http://8.136.10.160:18306";
const DATA_COLLECTION_INTERVAL = 60 * 1000; // 数据收集间隔(毫秒)
// 微信官方提供的加速度计采样间隔
const ACCELEROMETER_INTERVALS = {
  NORMAL: 'normal', // 正常采集频率，约200ms/次
  UI: 'ui',         // 适用于UI的采集频率，约60ms/次
  GAME: 'game'      // 适用于游戏的采集频率，约20ms/次
};
const NETWORK_SIMULATION = {
  DISCONNECT_DELAY: 2 * 60 * 1000, // 模拟断网延迟(毫秒)
  RECONNECT_DELAY: 4 * 60 * 1000, // 模拟重连延迟(毫秒)
  TOAST_DURATION: 2000, // 提示框显示时间(毫秒)
  MAX_SINGLE_KEY_SIZE: 1024 * 1024, // 微信小程序单个key最大存储容量(1MB)
  SAFETY_FACTOR: 0.8 // 安全系数，避免完全占满存储空间
};

Page({
  data: {
    stepInfoList: [],
    werunTimer: null, // 微信运动定时器
    accTimer: null, // 加速度计定时器
    accTracking: false, // 是否正在无感知获取步数
    session_key: '',
    accXs: [],
    accYs: [],
    accZs: [],
    networkAvailable: true, // 网络状态
    cacheData: [], // 缓存的步数数据
    networkSimulationActive: false, // 网络模拟状态
    weakNetSimulationActive: false, // 弱网模拟状态
    weakNetworkDisconnected: false, // 弱网断开状态
    maxCacheSize: 1000, // 默认最大缓存数据量，将在初始化时计算
    accelerometerInterval: ACCELEROMETER_INTERVALS.GAME, // 默认使用game频率
    intervalOptions: [
      { name: '低频(normal), 5Hz', value: ACCELEROMETER_INTERVALS.NORMAL, desc: '约200ms/次' },
      { name: '中频(ui), 16.6Hz', value: ACCELEROMETER_INTERVALS.UI, desc: '约60ms/次' },
      { name: '高频(game), 50Hz', value: ACCELEROMETER_INTERVALS.GAME, desc: '约20ms/次' }
    ],
    selectedIntervalIndex: 2 // 默认选中game频率
  },

  onLoad: function (options) {
    this.initializeApp();
  },

  onUnload: function() {
    // 页面卸载时清理资源
    this.stopWerunTimer();
    this.stopAccTracking();
  },

  // 初始化应用
  initializeApp: function() {
    this.getSessionKey();
    this.checkNetworkStatus();
    this.setupNetworkListener();
    this.clearCachedData();
    this.calculateMaxCacheSize(); // 计算最大缓存大小
  },

  // 计算最大缓存大小
  calculateMaxCacheSize: function() {
    // 创建一个样本加速度数据点来估算大小
    const sampleDataPoint = {
      accx: 0.123,
      accy: 0.456,
      accz: 0.789,
      timestamp: Date.now()
    };
    
    // 将样本数据转为JSON字符串，计算单个数据点的大小（字节）
    const sampleDataSize = JSON.stringify(sampleDataPoint).length;
    console.log('单个加速度数据点大小（字节）:', sampleDataSize);
    
    // 计算在安全系数下，单个key可以存储的最大数据点数量
    const maxSafeDataPoints = Math.floor(
      (NETWORK_SIMULATION.MAX_SINGLE_KEY_SIZE * NETWORK_SIMULATION.SAFETY_FACTOR) / sampleDataSize
    );
    
    console.log('计算得到的最大缓存数据点数量:', maxSafeDataPoints);
    
    // 更新最大缓存大小
    this.setData({
      maxCacheSize: maxSafeDataPoints
    });
  },

  // 获取会话密钥
  getSessionKey: function() {
    const that = this;
    wx.login({
      success: function (res) {
        if (res.code) {
          console.log('获取到登录code:', res.code);
          wx.request({
            url: `https://api.weixin.qq.com/sns/jscode2session?appid=${APP_ID}&secret=${SECRET}&js_code=${res.code}&grant_type=authorization_code`,
            header: {
              'content-type': 'application/json'
            },
            success: function (res) {
              if (res.data && res.data.session_key) {
                const session_key = res.data.session_key;
                console.log("获取session_key成功:", session_key);
                that.setData({
                  session_key
                });
                
                // 存储session_key到本地，避免频繁请求
                wx.setStorageSync('session_key', session_key);
                
                // 获取session_key后立即尝试获取微信运动数据
                if (that.data.werunTimer) {
                  that.getWeRunData(APP_ID, session_key);
                }
              } else {
                console.error('获取session_key失败:', res);
                // 尝试从本地存储获取之前的session_key
                const cachedSessionKey = wx.getStorageSync('session_key');
                if (cachedSessionKey) {
                  console.log('使用缓存的session_key');
                  that.setData({
                    session_key: cachedSessionKey
                  });
                } else {
                  wx.showToast({
                    title: '获取会话密钥失败',
                    icon: 'none',
                    duration: NETWORK_SIMULATION.TOAST_DURATION
                  });
                }
              }
            },
            fail: function (err) {
              console.error('请求session_key失败:', err);
              // 尝试从本地存储获取之前的session_key
              const cachedSessionKey = wx.getStorageSync('session_key');
              if (cachedSessionKey) {
                console.log('使用缓存的session_key');
                that.setData({
                  session_key: cachedSessionKey
                });
              } else {
                wx.showToast({
                  title: '获取会话密钥失败',
                  icon: 'none',
                  duration: NETWORK_SIMULATION.TOAST_DURATION
                });
              }
            }
          });
        } else {
          console.error('wx.login 失败:', res);
          wx.showToast({
            title: '登录失败',
            icon: 'none',
            duration: NETWORK_SIMULATION.TOAST_DURATION
          });
        }
      },
      fail: function (err) {
        console.error('wx.login 调用失败:', err);
        wx.showToast({
          title: '登录失败',
          icon: 'none',
          duration: NETWORK_SIMULATION.TOAST_DURATION
        });
      }
    });
  },

  // 检查网络状态
  checkNetworkStatus: function() {
    const that = this;
    wx.getNetworkType({
      success: function (res) {
        const networkType = res.networkType;
        const isConnected = networkType !== 'none';
        that.setData({
          networkAvailable: isConnected
        });
        console.log(`当前网络状态: ${isConnected ? networkType : '无网络'}`);
      }
    });
  },

  // 设置网络状态监听器
  setupNetworkListener: function() {
    const that = this;
    wx.onNetworkStatusChange(function (res) {
      that.setData({
        networkAvailable: res.isConnected
      });
      if (res.isConnected) {
        console.log('网络恢复:', res.networkType);
        // 网络恢复后，尝试上传缓存数据
        that.uploadCachedData();
      } else {
        console.log('网络断开');
      }
    });
  },

  // 清除缓存数据
  clearCachedData: function() {
    wx.removeStorageSync('stepDataCache');
  },

  // 切换无感知获取步数状态
  toggleAccTracking: function() {
    if (this.data.accTracking) {
      this.stopAccTracking();
    } else {
      // 弹出采集频率选择弹窗
      wx.showActionSheet({
        itemList: this.data.intervalOptions.map(item => `${item.name} (${item.desc})`),
        success: res => {
          // 设置选中的采集频率
          this.setData({
            selectedIntervalIndex: res.tapIndex,
            accelerometerInterval: this.data.intervalOptions[res.tapIndex].value
          });
          
          // 开始无感知获取步数
          this.startAccTracking();
          
          wx.showToast({
            title: `已设置为${this.data.intervalOptions[res.tapIndex].name}`,
            icon: 'success',
            duration: NETWORK_SIMULATION.TOAST_DURATION
          });
        }
      });
    }
  },
  
  // 设置采集频率
  setAccelerometerInterval: function(e) {
    const index = parseInt(e.currentTarget.dataset.index);
    const interval = this.data.intervalOptions[index].value;
    
    this.setData({
      accelerometerInterval: interval,
      selectedIntervalIndex: index
    });
    
    // 如果正在采集数据，需要重启采集以应用新的频率
    if (this.data.accTracking) {
      this.restartAccTracking();
    }
    
    wx.showToast({
      title: `已设置为${this.data.intervalOptions[index].name}`,
      icon: 'success',
      duration: NETWORK_SIMULATION.TOAST_DURATION
    });
  },
  
  // 重启加速度计数据采集
  restartAccTracking: function() {
    this.stopAccTracking();
    this.startAccTracking();
  },

  // 开始无感知获取步数
  startAccTracking: function() {
    const that = this;
    
    // 开始收集加速度计数据
    let accelerometerData = [];
    
    // 设置定时上传
    const accTimer = setInterval(() => {
      if (accelerometerData.length > 0) {
        const dataToUpload = [...accelerometerData]; // 创建副本
        accelerometerData = []; // 清空已经准备上传的数据
        
        // 上传到服务器进行步数判别
        that.uploadAccDataToServer(dataToUpload);
      }
    }, DATA_COLLECTION_INTERVAL);
    
    // 开始监听加速度计，使用当前设置的采集频率
    wx.startAccelerometer({
      interval: this.data.accelerometerInterval,
      success: () => {
        console.log('加速度计调用成功，采集频率:', this.data.accelerometerInterval);
        
        // 更新状态
        that.setData({
          accTimer: accTimer,
          accTracking: true
        });
        
        wx.showToast({
          title: '开启无感知获取步数',
          icon: 'success',
          duration: NETWORK_SIMULATION.TOAST_DURATION
        });
        
        wx.onAccelerometerChange(function (res) {
          accelerometerData.push({
            accx: res.x,
            accy: res.y,
            accz: res.z,
            timestamp: Date.now(),
          });
        });
      },
      fail: res => {
        console.log('加速度计调用失败', res);
        wx.showToast({
          title: '加速度计调用失败',
          icon: 'none',
          duration: NETWORK_SIMULATION.TOAST_DURATION
        });
      }
    });
  },

  // 停止无感知获取步数
  stopAccTracking: function() {
    if (this.data.accTimer) {
      clearInterval(this.data.accTimer);
      wx.stopAccelerometer(); // 停止加速度计
      
      this.setData({
        accTimer: null,
        accTracking: false
      });
      
      wx.showToast({
        title: '已停止无感知获取步数',
        icon: 'none',
        duration: NETWORK_SIMULATION.TOAST_DURATION
      });
    }
  },

  // 上传加速度数据到服务器进行步数判别
  uploadAccDataToServer: function(data) {
    const that = this;
    wx.request({
      url: `${SERVER_URL}/step`,
      method: 'POST',
      data: {
        data: data
      },
      header: {
        'content-type': 'application/json',
        'chartset': 'utf-8'
      },
      success: function (res) {
        console.log('加速度数据上传成功，服务器返回步数:', res.data);
        
        // 更新步数显示，标记来源为加速度计
        const currentTime = new Date().getTime();
        const time = that.formatTimestamp(currentTime);
        
        // 获取当前采集频率的显示名称
        const currentInterval = that.data.intervalOptions[that.data.selectedIntervalIndex].name;
        
        const newStepInfoList = that.data.stepInfoList.concat({
          step: res.data,
          timestamp: time,
          source: 'accelerometer', // 标记数据来源为加速度计
          interval: currentInterval // 添加采集频率信息
        });
        
        that.setData({
          stepInfoList: newStepInfoList
        });
      },
      fail: function (err) {
        console.error('加速度数据上传失败', err);
        wx.showToast({
          title: '数据上传失败',
          icon: 'none',
          duration: NETWORK_SIMULATION.TOAST_DURATION
        });
      }
    });
  },

  // 获取微信运动数据
  getWeRunData: function(appid, session_key) {
    const that = this;
    wx.getWeRunData({
      success(res) {
        const encryptedData = res.encryptedData;
        const iv = res.iv;
        
        wx.request({
          url: `${SERVER_URL}/decryptWeRunData`,
          method: 'POST',
          data: {
            appid,
            session_key,
            encryptedData,
            iv
          },
          success: (res) => {
            console.log('解密数据响应:', res);
            if (res.statusCode === 200 && res.data && res.data.data) {
              const weRunData = res.data.data.stepInfoList.map(item => {
                const currentTime = new Date().getTime();
                return {
                  timestamp: that.formatTimestamp(currentTime),
                  step: item.step,
                  source: 'werun' // 标记数据来源为微信运动
                };
              });

              // 只保留最新一天的步数数据
              const latestDayData = weRunData[weRunData.length - 1];
              console.log('最新的微信运动数据:', latestDayData);

              // 更新页面数据，避免重复数据
              const newStepInfoList = that.data.stepInfoList.concat(latestDayData);
              const len = newStepInfoList.length;
              
              if (len == 1 || (len > 1 && newStepInfoList[len - 1].step != newStepInfoList[len - 2].step)) {
                that.setData({
                  stepInfoList: newStepInfoList
                });
              }
            } else {
              console.error('解密失败或服务器错误:', res);
              
              // 检查是否是session_key过期
              if (res.data && (res.data.errcode === 87001 || res.data.errcode === -1)) {
                console.log('session_key可能已过期，重新获取');
                // 清除本地存储的session_key
                wx.removeStorageSync('session_key');
                // 重新获取session_key
                that.getSessionKey();
              }
              
              wx.showToast({
                title: '解密失败',
                icon: 'none',
                duration: NETWORK_SIMULATION.TOAST_DURATION
              });
            }
          },
          fail: (err) => {
            console.error('解密请求失败', err);
            wx.showToast({
              title: '网络请求失败',
              icon: 'none',
              duration: NETWORK_SIMULATION.TOAST_DURATION
            });
          }
        });
      },
      fail(err) {
        console.error('获取微信运动数据失败', err);
        
        // 检查是否是因为session_key过期
        if (err.errMsg && err.errMsg.includes('session key')) {
          console.log('session_key可能已过期，重新获取');
          // 清除本地存储的session_key
          wx.removeStorageSync('session_key');
          // 重新获取session_key
          that.getSessionKey();
        }
        
        wx.showToast({
          title: '获取微信运动数据失败',
          icon: 'none',
          duration: NETWORK_SIMULATION.TOAST_DURATION
        });
      }
    });
  },

  // 切换微信运动定时获取状态
  toggleWerunTimer: function() {
    if (this.data.werunTimer) {
      this.stopWerunTimer();
    } else {
      this.startWerunTimer();
    }
  },

  // 开启定时任务，每分钟获取一次微信运动数据
  startWerunTimer: function() {
    const that = this;
    const appid = APP_ID;
    let session_key = this.data.session_key;
    
    if (!session_key) {
      console.log('session_key为空，尝试从本地存储获取');
      session_key = wx.getStorageSync('session_key');
      
      if (session_key) {
        console.log('从本地存储获取到session_key');
        this.setData({ session_key });
      } else {
        console.log('本地存储中无session_key，重新获取');
        wx.showToast({
          title: '正在获取会话密钥',
          icon: 'loading',
          duration: NETWORK_SIMULATION.TOAST_DURATION
        });
        
        // 重新获取session_key
        this.getSessionKey();
      }
    }
    
    if (this.data.werunTimer) {
      clearInterval(this.data.werunTimer);
    }
    
    const werunTimer = setInterval(() => {
      // 每次定时获取前检查session_key是否存在
      if (that.data.session_key) {
        that.getWeRunData(appid, that.data.session_key);
      } else {
        console.log('定时器触发但session_key为空，尝试重新获取');
        that.getSessionKey();
      }
    }, DATA_COLLECTION_INTERVAL);
    
    this.setData({
      werunTimer
    });
    
    wx.showToast({
      title: '定时获取微信运动数据已开启',
      icon: 'none',
      duration: NETWORK_SIMULATION.TOAST_DURATION
    });
  },

  // 结束微信运动定时任务
  stopWerunTimer: function() {
    if (this.data.werunTimer) {
      clearInterval(this.data.werunTimer);
      this.setData({
        werunTimer: null
      });
      wx.showToast({
        title: '定时获取微信运动数据已停止',
        icon: 'none',
        duration: NETWORK_SIMULATION.TOAST_DURATION
      });
    }
  },

  // 立即获取微信运动步数
  getStepsNow: function() {
    const appid = APP_ID;
    const session_key = this.data.session_key;
    
    if (!session_key) {
      console.log('session_key为空，重新获取');
      wx.showToast({
        title: '正在获取会话密钥',
        icon: 'loading',
        duration: NETWORK_SIMULATION.TOAST_DURATION
      });
      
      // 重新获取session_key，并在获取成功后自动调用getWeRunData
      this.getSessionKey();
      return;
    }
    
    this.getWeRunData(appid, session_key);
  },

  // 格式化时间戳
  formatTimestamp: function(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    
    // 始终包含时间到秒
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  },

  // 上传缓存数据
  uploadCachedData: function() {
    const that = this;
    const cachedData = wx.getStorageSync('stepDataCache') || [];
    
    if (cachedData.length > 0 && that.data.networkAvailable) {
      that.uploadDataToServer(cachedData);
      wx.removeStorageSync('stepDataCache');
      console.log('缓存数据上传成功');
      
      wx.showToast({
        title: '缓存数据已上传',
        icon: 'success',
        duration: NETWORK_SIMULATION.TOAST_DURATION
      });
    } else {
      console.log('无缓存数据或网络不可用');
    }
  },

  // 本地缓存数据
  // cacheDataLocally: function(data) {
  //   let cache = wx.getStorageSync('stepDataCache') || [];
  //   cache = cache.concat(data);
    
  //   try {
  //     wx.setStorageSync('stepDataCache', cache);
  //     console.log('数据已缓存:', data);
      
  //     wx.showToast({
  //       title: '数据已缓存',
  //       icon: 'none',
  //       duration: NETWORK_SIMULATION.TOAST_DURATION
  //     });
  //   } catch (e) {
  //     console.error('缓存数据失败:', e);
  //   }
  // },

  // 停止网络模拟
  stopNetworkSimulation: function() {
    if (this.data.networkSimulationActive) {
      this.setData({
        networkSimulationActive: false,
        networkAvailable: true // 恢复正常网络状态
      });
      
      wx.showToast({
        title: '网络模拟已停止',
        icon: 'none',
        duration: NETWORK_SIMULATION.TOAST_DURATION
      });
    }
  },

  // 弱网环境获取步数测试
  weakNetGetSteps: function() {
    if (this.data.weakNetSimulationActive) {
      // 如果已经在模拟中，则停止模拟
      this.stopWeakNetSimulation();
    } else {
      // 开始弱网模拟
      this.startWeakNetSimulation();
    }
  },

  // 开始弱网模拟
  startWeakNetSimulation: function() {
    this.setData({
      weakNetSimulationActive: true
    });
    
    wx.showToast({
      title: '弱网环境模拟已开启',
      icon: 'none',
      duration: NETWORK_SIMULATION.TOAST_DURATION
    });
    
    // 开始收集加速度计数据，但不上传
    this.startAccTrackingWithCache();
  },

  // 停止弱网模拟
  stopWeakNetSimulation: function() {
    // 停止加速度计数据收集
    this.stopAccTracking();
    
    this.setData({
      weakNetSimulationActive: false,
      weakNetworkDisconnected: false
    });
    
    wx.showToast({
      title: '弱网环境模拟已停止',
      icon: 'none',
      duration: NETWORK_SIMULATION.TOAST_DURATION
    });
  },

  // 模拟断开网络
  simulateNetworkDisconnect: function() {
    if (!this.data.weakNetworkDisconnected) {
      this.setData({
        weakNetworkDisconnected: true,
        networkAvailable: false
      });
      
      wx.showToast({
        title: '网络已断开（模拟）',
        icon: 'none',
        duration: NETWORK_SIMULATION.TOAST_DURATION
      });
    } else {
      // 如果已经断开，则恢复网络
      this.simulateNetworkReconnect();
    }
  },

  // 模拟网络恢复
  simulateNetworkReconnect: function() {
    this.setData({
      weakNetworkDisconnected: false,
      networkAvailable: true
    });
    
    wx.showToast({
      title: '网络已恢复（模拟）',
      icon: 'success',
      duration: NETWORK_SIMULATION.TOAST_DURATION
    });
    
    // 上传缓存的数据
    this.uploadWeakNetCachedData();
  },

  // 开始带缓存的加速度计数据收集
  startAccTrackingWithCache: function() {
    const that = this;
    
    // 开始收集加速度计数据
    let accelerometerData = [];
    
    // 设置定时处理
    const accTimer = setInterval(() => {
      if (accelerometerData.length > 0) {
        const dataToProcess = [...accelerometerData]; // 创建副本
        accelerometerData = []; // 清空已经准备处理的数据
        
        if (that.data.weakNetworkDisconnected) {
          // 网络断开状态，缓存数据
          that.cacheAccelerometerData(dataToProcess);
        } else {
          // 网络正常状态，上传数据
          that.uploadAccDataToServer(dataToProcess);
        }
      }
    }, DATA_COLLECTION_INTERVAL);
    
    // 开始监听加速度计，使用当前设置的采集频率
    wx.startAccelerometer({
      interval: this.data.accelerometerInterval,
      success: () => {
        console.log('加速度计调用成功（弱网模式），采集频率:', this.data.accelerometerInterval);
        
        // 更新状态
        that.setData({
          accTimer: accTimer,
          accTracking: true
        });
        
        wx.showToast({
          title: '开启弱网模式步数采集',
          icon: 'success',
          duration: NETWORK_SIMULATION.TOAST_DURATION
        });
        
        wx.onAccelerometerChange(function (res) {
          accelerometerData.push({
            accx: res.x,
            accy: res.y,
            accz: res.z,
            timestamp: Date.now(),
          });
        });
      },
      fail: res => {
        console.log('加速度计调用失败', res);
        wx.showToast({
          title: '加速度计调用失败',
          icon: 'none',
          duration: NETWORK_SIMULATION.TOAST_DURATION
        });
      }
    });
  },

  // 缓存加速度计数据
  cacheAccelerometerData: function(data) {
    let cache = wx.getStorageSync('accDataCache') || [];
    cache = cache.concat(data);
    
    // 如果缓存数据超过最大限制，移除最早的数据
    if (cache.length > this.data.maxCacheSize) {
      const excessCount = cache.length - this.data.maxCacheSize;
      cache = cache.slice(excessCount);
    }
    
    try {
      wx.setStorageSync('accDataCache', cache);
      console.log('加速度数据已缓存，当前缓存数量:', cache.length, '/', this.data.maxCacheSize);
    } catch (e) {
      console.error('缓存加速度数据失败:', e);
      wx.showToast({
        title: '缓存数据失败',
        icon: 'none',
        duration: NETWORK_SIMULATION.TOAST_DURATION
      });
    }
  },

  // 上传弱网模式下缓存的数据
  uploadWeakNetCachedData: function() {
    const that = this;
    const cachedData = wx.getStorageSync('accDataCache') || [];
    
    if (cachedData.length > 0) {
      wx.showLoading({
        title: '正在上传缓存数据',
      });
      
      wx.request({
        url: `${SERVER_URL}/step`,
        method: 'POST',
        data: {
          data: cachedData
        },
        header: {
          'content-type': 'application/json',
          'chartset': 'utf-8'
        },
        success: function (res) {
          console.log('缓存的加速度数据上传成功，服务器返回步数:', res.data);
          
          // 更新步数显示，标记来源为加速度计
          const currentTime = new Date().getTime();
          const time = that.formatTimestamp(currentTime);
          
          // 获取当前采集频率的显示名称
          const currentInterval = that.data.intervalOptions[that.data.selectedIntervalIndex].name;
          
          const newStepInfoList = that.data.stepInfoList.concat({
            step: res.data,
            timestamp: time,
            source: 'accelerometer', // 标记数据来源为加速度计
            note: '弱网模式缓存数据', // 添加备注
            interval: currentInterval // 添加采集频率信息
          });
          
          that.setData({
            stepInfoList: newStepInfoList
          });
          
          // 清除缓存
          wx.removeStorageSync('accDataCache');
          
          wx.hideLoading();
          wx.showToast({
            title: '缓存数据上传成功',
            icon: 'success',
            duration: NETWORK_SIMULATION.TOAST_DURATION
          });
        },
        fail: function (err) {
          console.error('缓存的加速度数据上传失败', err);
          wx.hideLoading();
          wx.showToast({
            title: '缓存数据上传失败',
            icon: 'none',
            duration: NETWORK_SIMULATION.TOAST_DURATION
          });
        }
      });
    } else {
      console.log('无缓存的加速度数据');
      wx.showToast({
        title: '无缓存数据',
        icon: 'none',
        duration: NETWORK_SIMULATION.TOAST_DURATION
      });
    }
  }
});