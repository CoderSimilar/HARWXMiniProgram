// 提取所有常量到代码开头
const LOCATION_TYPE = 'gcj02'; // 位置坐标类型
const TRACKING_INTERVAL = 3000; // 位置跟踪间隔(毫秒)，改为3秒刷新一次
const DEFAULT_SCALE = 10000; // 地图默认缩放级别
const MARKER_SIZE = 10; // 标记点大小
const POLYLINE_WIDTH = 2; // 轨迹线宽度
const POLYLINE_COLOR = '#FF0000DD'; // 轨迹线颜色
const CIRCLE_COLOR = '#1AAD19AA'; // 区域圆形颜色
const CIRCLE_FILL_COLOR = '#1AAD1933'; // 区域圆形填充颜色
const TOAST_DURATION = 2000; // 提示框显示时间(毫秒)
const DEFAULT_RADIUS = 50; // 默认区域半径(米)
const MIN_RADIUS = 10; // 最小区域半径(米)
const MAX_RADIUS = 2000; // 最大区域半径(米)
const RADIUS_STEP = 10; // 区域半径调整步长(米)
const EARTH_RADIUS = 6371000; // 地球半径(米)，用于距离计算
const CIRCLE_STROKE_WIDTH = 2; // 圆形边框宽度
const OUT_OF_AREA_THRESHOLD = 3; // 连续超出区域次数阈值，达到此值才触发预警
const WARNING_COOLDOWN = 30000; // 预警冷却时间(毫秒)，避免频繁弹出预警

// 动作识别相关常量
const ACTION_TYPES = ['walking', 'standing', 'raisearm', 'standing', 'ladderup', 'ladderdown', 'standing', 'walking'];
const SAMPLE_SIZE = 128;
const SENSOR_INTERVAL = 'game';
const API_BASE_URL = 'http://8.136.10.160:18306';
const SUBMIT_INTERVAL = 3000;
const HEADERS = {
  'content-type': 'application/x-www-form-urlencoded',
  'chartset': 'utf-8'
};

// 步数统计相关常量
const STEP_UPDATE_INTERVAL = 1000; // 步数更新频率 (毫秒)，保持每秒刷新一次
const SAMPLE_RATE = 50; // 加速度传感器采样率估计值 (Hz)
const PEAK_THRESHOLD = 1.2; // 峰值检测阈值
const MIN_PEAK_DISTANCE_S = 0.25; // 最小峰值间隔 (秒)
const MOVING_AVERAGE_WINDOW = 5; // 滑动平均窗口大小

// 离线数据缓存相关常量
const DATA_SAVE_INTERVAL = 60000; // 数据保存间隔(毫秒)，每分钟保存一次
const STORAGE_KEY_LOCATION = 'cached_location_data'; // 位置数据存储键名
const STORAGE_KEY_STEPS = 'cached_steps_data'; // 步数数据存储键名
const MAX_CACHE_ITEMS = 1000; // 最大缓存项数，防止存储空间溢出
const STEP_STATS_INTERVAL = 60000; // 步数统计间隔(毫秒)，每分钟记录一次
const SYNC_INTERVAL = 60000; // 数据同步尝试间隔(毫秒)，每分钟尝试一次
const STEP_REFRESH_INTERVAL = 60000; // 步数刷新间隔(毫秒)，改为每分钟刷新一次

Page({
  data: {
    latitude: '',
    longitude: '',
    markers: [],
    polyline: [],
    tracking: false,
    intervalId: null,
    // 添加区域相关数据
    isSettingArea: false,
    hasSetArea: false,
    areaCenter: null,
    areaRadius: DEFAULT_RADIUS, // 使用常量
    circles: [],
    // 添加地图显示控制
    mapVisible: false,
    // 添加超出区域检测相关数据
    outOfAreaCount: 0, // 连续超出区域次数计数
    lastWarningTime: 0, // 上次预警时间

    // 动作识别相关数据
    current_action: '暂无',
    action_counts: {},
    isReading: false,
    accXs: [],
    accYs: [],
    accZs: [],
    gyrXs: [],
    gyrYs: [],
    gyrZs: [],
    actionSequence: [],
    startTime: 0,
    value: 0,
    displayValue: 0,
    accelerometerX: 0,
    accelerometerY: 0,
    accelerometerZ: 0,
    gyroscopeX: 0,
    gyroscopeY: 0,
    gyroscopeZ: 0,
    // 步数统计相关数据
    stepCount: 0,        // 当前检测到的总步数
    lastMinuteStepCount: 0, // 上一分钟的步数记录，用于计算每分钟新增步数
    currentSteps: 0,     // 当前检测到的步数增量（每分钟重置一次）
    accNormValues: [],   // 加速度模值数组
    accTimestamps: [],   // 加速度时间戳
    peakIndices: [],     // 峰值索引
    lastStepTime: 0,     // 上次计步时间戳
    showStepChart: false, // 是否显示计步图表
    stepStatsIntervalId: null, // 步数统计定时器ID

    // 离线数据缓存相关数据
    cachedLocationData: [], // 缓存的位置数据
    cachedStepsData: [],    // 缓存的步数数据
    isOnline: true,         // 网络连接状态
    lastSyncTime: 0,        // 上次同步时间
    dataSaveIntervalId: null, // 数据保存定时器ID
    syncIntervalId: null,     // 数据同步定时器ID
    stepRefreshIntervalId: null, // 步数刷新定时器ID
    lastSyncedLocationIndex: 0, // 上次同步的位置数据索引
    lastSyncedStepsIndex: 0,    // 上次同步的步数数据索引
  },
  
  // 获取位置并显示地图
  getLocation: function() {
    wx.showLoading({
      title: '获取位置中...',
    });
    
    wx.getLocation({
      type: LOCATION_TYPE,
      success: res => {
        wx.hideLoading();
        this.setData({
          latitude: res.latitude,
          longitude: res.longitude,
          mapVisible: true,
          scale: DEFAULT_SCALE,
        });
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({
          title: '获取位置失败',
          icon: 'none',
          duration: TOAST_DURATION
        });
      }
    });
  },
  
  // 合并开始/停止记录功能 - 同时控制位置记录和动作识别
  toggleTracking: function() {
    if (this.data.tracking) {
      // 停止记录
      clearInterval(this.data.intervalId);
      
      // 同时停止动作识别
      this.stopActionRecognition();
      
      // 停止数据保存定时器
      if (this.data.dataSaveIntervalId) {
        clearInterval(this.data.dataSaveIntervalId);
      }
      
      // 停止数据同步定时器
      if (this.data.syncIntervalId) {
        clearInterval(this.data.syncIntervalId);
      }
      
      // 停止步数刷新定时器
      if (this.data.stepRefreshIntervalId) {
        clearInterval(this.data.stepRefreshIntervalId);
      }
      
      // 停止步数统计定时器
      if (this.data.stepStatsIntervalId) {
        clearInterval(this.data.stepStatsIntervalId);
      }
      
      // 尝试同步最终数据到服务器（先同步再清空）
      if (this.data.isOnline) {
        this.syncDataWithServer();
      }
      
      // 清空所有数据包括步数
      this.clearAllData(true);
      
      this.setData({
        tracking: false,
        intervalId: null,
        outOfAreaCount: 0, // 重置超出区域计数
        dataSaveIntervalId: null,
        syncIntervalId: null,
        stepRefreshIntervalId: null,
        stepStatsIntervalId: null,
        // 步数已在clearAllData中清零
      });
      
      // 显示停止成功提示
      wx.showToast({
        title: '监测已停止',
        icon: 'success',
        duration: 1500
      });
    } else {
      // 开始记录
      this.setData({
        tracking: true,
        markers: [],
        polyline: [{
          points: [],
          color: POLYLINE_COLOR,
          width: POLYLINE_WIDTH,
          dottedLine: false
        }],
        outOfAreaCount: 0, // 重置超出区域计数
        cachedLocationData: [], // 重置缓存数据
        cachedStepsData: [],
        lastMinuteStepCount: this.data.stepCount, // 设置为当前总步数
        lastSyncedLocationIndex: 0, // 重置同步索引
        lastSyncedStepsIndex: 0    // 重置同步索引
      });

      // 加载之前缓存的数据
      this.loadCachedData();
      
      // 检查网络状态
      this.checkNetworkStatus();

      // 立即获取一次位置
      this.getLocationAndUpdate();
      
      // 同时开始动作识别
      this.startActionRecognition();

      // 设置位置跟踪定时器 - 每3秒更新一次
      const intervalId = setInterval(this.getLocationAndUpdate.bind(this), TRACKING_INTERVAL);
      
      // 启动数据保存和同步定时器 - 每分钟执行一次
      const dataSaveIntervalId = setInterval(() => {
        this.saveDataToStorage();
        // 保存的同时上传到服务器
        if (this.data.isOnline) {
          this.syncDataWithServer();
        }
      }, DATA_SAVE_INTERVAL);
      
      // 步数统计定时器 - 每分钟记录一次步数数据
      const stepStatsIntervalId = setInterval(this.recordStepStats.bind(this), STEP_STATS_INTERVAL);
      
      this.setData({ 
        intervalId: intervalId,
        dataSaveIntervalId: dataSaveIntervalId,
        syncIntervalId: null, // 不再需要单独的同步定时器
        stepStatsIntervalId: stepStatsIntervalId
      });
      
      // 显示启动成功提示
      wx.showToast({
        title: '监测已启动',
        icon: 'success',
        duration: 1500
      });
    }
  },
  
  // 检查网络状态
  checkNetworkStatus: function() {
    wx.getNetworkType({
      success: (res) => {
        const networkType = res.networkType;
        const isOnline = networkType !== 'none';
        
        this.setData({ isOnline: isOnline });
        
        console.log('网络状态:', networkType, isOnline ? '在线' : '离线');
        
        // 监听网络状态变化
        wx.onNetworkStatusChange((result) => {
          const newIsOnline = result.networkType !== 'none';
          
          console.log('网络状态变化:', result.networkType, newIsOnline ? '在线' : '离线');
          
          // 如果网络状态发生变化
          if (this.data.isOnline !== newIsOnline) {
            this.setData({ isOnline: newIsOnline });
            
            // 如果从离线变为在线，尝试同步数据
            if (newIsOnline && this.data.tracking) {
              this.syncDataWithServer();
            }
          }
        });
      }
    });
  },
  
  // 加载缓存数据
  loadCachedData: function() {
    try {
      // 加载位置数据
      const cachedLocationData = wx.getStorageSync(STORAGE_KEY_LOCATION);
      if (cachedLocationData) {
        const parsedData = JSON.parse(cachedLocationData);
        
        // 恢复轨迹线和标记点
        if (parsedData.length > 0) {
          let markers = [];
          let polylinePoints = [];
          
          parsedData.forEach((item, index) => {
            // 添加标记点
            markers.push({
              id: index,
              latitude: item.latitude,
              longitude: item.longitude,
              width: MARKER_SIZE,
              height: MARKER_SIZE
            });
            
            // 添加轨迹点
            polylinePoints.push({
              latitude: item.latitude,
              longitude: item.longitude
            });
          });
          
          // 更新最新位置
          const lastPoint = parsedData[parsedData.length - 1];
          
          this.setData({
            markers: markers,
            polyline: [{
              points: polylinePoints,
              color: POLYLINE_COLOR,
              width: POLYLINE_WIDTH,
              dottedLine: false
            }],
            latitude: lastPoint.latitude,
            longitude: lastPoint.longitude,
            cachedLocationData: parsedData
          });
          
          console.log('已加载缓存位置数据，共', parsedData.length, '条记录');
        }
      }
      
      // 加载步数数据
      const cachedStepsData = wx.getStorageSync(STORAGE_KEY_STEPS);
      if (cachedStepsData) {
        const parsedData = JSON.parse(cachedStepsData);
        
        if (parsedData.length > 0) {
          // 获取最新的步数记录
          const lastStepRecord = parsedData[parsedData.length - 1];
          
          this.setData({
            stepCount: lastStepRecord.stepCount,
            cachedStepsData: parsedData
          });
          
          console.log('已加载缓存步数数据，共', parsedData.length, '条记录，当前步数:', lastStepRecord.stepCount);
        }
      }
    } catch (error) {
      console.error('加载缓存数据失败:', error);
    }
  },
  
  // 保存数据到本地存储
  saveDataToStorage: function() {
    if (!this.data.tracking) return;
    
    try {
      // 保存位置数据
      const locationData = this.data.cachedLocationData;
      if (locationData.length > 0) {
        wx.setStorageSync(STORAGE_KEY_LOCATION, JSON.stringify(locationData));
        console.log('位置数据已保存到本地存储，共', locationData.length, '条记录');
      }
      
      // 保存步数数据
      const stepsData = this.data.cachedStepsData;
      if (stepsData.length > 0) {
        wx.setStorageSync(STORAGE_KEY_STEPS, JSON.stringify(stepsData));
        console.log('步数数据已保存到本地存储，共', stepsData.length, '条记录');
      }
    } catch (error) {
      console.error('保存数据到本地存储失败:', error);
    }
  },
  
  // 同步数据到服务器 - 只发送新增数据
  syncDataWithServer: function() {
    if (!this.data.tracking || !this.data.isOnline) return;
    
    const currentTime = new Date().getTime();
    
    // 如果距离上次同步时间不足，则跳过
    if (currentTime - this.data.lastSyncTime < SYNC_INTERVAL) return;
    
    console.log('尝试同步数据到服务器...');
    
    // 同步位置数据 - 只发送新增部分
    const locationData = this.data.cachedLocationData;
    const newLocationData = locationData.slice(this.data.lastSyncedLocationIndex);
    
    if (newLocationData.length > 0) {
      wx.request({
        url: `${API_BASE_URL}/sync_location`,
        data: {
          data: JSON.stringify(newLocationData)
        },
        method: "POST",
        header: {
          'content-type': 'application/json',
          'chartset': 'utf-8'
        },
        success: res => {
          console.log('新增位置数据同步成功:', res.data, `(${newLocationData.length}条记录)`);
          
          // 更新已同步的位置数据索引
          this.setData({ 
            lastSyncedLocationIndex: locationData.length 
          });
        },
        fail: err => {
          console.error('位置数据同步失败:', err);
        },
        complete: () => {
          this.setData({ lastSyncTime: currentTime });
        }
      });
    }
    
    // 同步步数数据 - 只发送新增部分
    const stepsData = this.data.cachedStepsData;
    const newStepsData = stepsData.slice(this.data.lastSyncedStepsIndex);
    
    if (newStepsData.length > 0) {
      wx.request({
        url: `${API_BASE_URL}/sync_steps`,
        data: {
          data: JSON.stringify(newStepsData)
        },
        method: "POST",
        header: {
          'content-type': 'application/json',
          'chartset': 'utf-8'
        },
        success: res => {
          console.log('新增步数数据同步成功:', res.data, `(${newStepsData.length}条记录)`);
          
          // 更新已同步的步数数据索引
          this.setData({ 
            lastSyncedStepsIndex: stepsData.length 
          });
        },
        fail: err => {
          console.error('步数数据同步失败:', err);
        }
      });
    }
  },
  
  getLocationAndUpdate: function() {
    let that = this;
    wx.getLocation({
      type: LOCATION_TYPE,
      success(res) {
        const latitude = res.latitude;
        const longitude = res.longitude;
        const timestamp = new Date().getTime();

        let markers = that.data.markers;
        let polyline = that.data.polyline;
        let cachedLocationData = that.data.cachedLocationData;

        // 添加标记
        markers.push({
          id: markers.length,
          latitude: latitude,
          longitude: longitude,
          width: MARKER_SIZE,
          height: MARKER_SIZE
        });

        // 添加轨迹点
        if (polyline.length > 0) {
          polyline[0].points.push({
            latitude: latitude,
            longitude: longitude
          });
        }
        
        // 添加到缓存数据
        cachedLocationData.push({
          latitude: latitude,
          longitude: longitude,
          timestamp: timestamp
        });
        
        // 限制缓存数据大小
        if (cachedLocationData.length > MAX_CACHE_ITEMS) {
          cachedLocationData = cachedLocationData.slice(-MAX_CACHE_ITEMS);
        }

        // 更新数据
        that.setData({
          latitude: latitude,
          longitude: longitude,
          markers: markers,
          polyline: polyline,
          cachedLocationData: cachedLocationData
        });
        
        // 检查是否超出区域
        that.checkIfOutOfArea(latitude, longitude);
        
        console.log('位置轨迹已更新，当前位置:', latitude, longitude);
      },
      fail() {
        wx.showToast({
          title: '获取位置失败',
          icon: 'none',
          duration: TOAST_DURATION
        });
      }
    });
  },
  
  // 开始设置区域
  startSettingArea: function() {
    // 先获取当前位置作为圆心
    wx.getLocation({
      type: LOCATION_TYPE,
      success: res => {
        const circles = [{
          latitude: res.latitude,
          longitude: res.longitude,
          color: CIRCLE_COLOR,
          fillColor: CIRCLE_FILL_COLOR,
          radius: this.data.areaRadius,
          strokeWidth: CIRCLE_STROKE_WIDTH
        }];
        
        this.setData({
          isSettingArea: true,
          areaCenter: {
            latitude: res.latitude,
            longitude: res.longitude
          },
          circles: circles,
          outOfAreaCount: 0 // 重置超出区域计数
        });
        
        wx.showToast({
          title: '请调整围栏位置和半径',
          icon: 'none',
          duration: TOAST_DURATION
        });
      },
      fail: () => {
        wx.showToast({
          title: '获取位置失败',
          icon: 'none',
          duration: TOAST_DURATION
        });
      }
    });
  },
  
  // 确认设置区域
  confirmArea: function() {
    this.setData({
      isSettingArea: false,
      hasSetArea: true,
      outOfAreaCount: 0 // 重置超出区域计数
    });
    
    wx.showToast({
      title: '电子围栏设置成功',
      icon: 'success',
      duration: TOAST_DURATION
    });
  },
  
  // 取消设置区域
  cancelArea: function() {
    this.setData({
      isSettingArea: false,
      circles: this.data.hasSetArea ? this.data.circles : [],
      outOfAreaCount: 0 // 重置超出区域计数
    });
  },
  
  // 增加区域半径
  increaseRadius: function() {
    if (!this.data.isSettingArea && !this.data.hasSetArea) return;
    
    const newRadius = Math.min(MAX_RADIUS, this.data.areaRadius + RADIUS_STEP);
    const circles = [{
      ...this.data.circles[0],
      radius: newRadius
    }];
    
    this.setData({
      areaRadius: newRadius,
      circles: circles,
      outOfAreaCount: 0 // 重置超出区域计数
    });
  },
  
  // 减少区域半径
  decreaseRadius: function() {
    if (!this.data.isSettingArea && !this.data.hasSetArea) return;
    if (this.data.areaRadius <= MIN_RADIUS) return; // 最小半径限制
    
    const newRadius = Math.max(MIN_RADIUS, this.data.areaRadius - RADIUS_STEP);
    const circles = [{
      ...this.data.circles[0],
      radius: newRadius
    }];
    
    this.setData({
      areaRadius: newRadius,
      circles: circles,
      outOfAreaCount: 0 // 重置超出区域计数
    });
  },
  
  // 地图点击事件，用于设置圆心
  onMapTap: function(e) {
    if (!this.data.isSettingArea) return;
    
    const { latitude, longitude } = e.detail;
    const circles = [{
      ...this.data.circles[0],
      latitude: latitude,
      longitude: longitude
    }];
    
    this.setData({
      areaCenter: { latitude, longitude },
      circles: circles,
      outOfAreaCount: 0 // 重置超出区域计数
    });
  },
  
  // 检查是否超出区域 - 改进版，使用连续多次检测机制
  checkIfOutOfArea: function(latitude, longitude) {
    if (!this.data.hasSetArea) return;
    
    const center = this.data.areaCenter;
    const radius = this.data.areaRadius;
    
    // 使用Haversine公式计算当前位置与圆心的距离
    const distance = this.calculateDistance(
      latitude, 
      longitude, 
      center.latitude, 
      center.longitude
    );
    
    let outOfAreaCount = this.data.outOfAreaCount;
    
    // 如果距离大于半径，则超出区域
    if (distance > radius) {
      // 增加超出区域计数
      outOfAreaCount++;
      console.log(`超出区域检测: ${outOfAreaCount}/${OUT_OF_AREA_THRESHOLD}`);
      
      // 如果连续超出区域次数达到阈值，且距离上次预警时间超过冷却时间，则触发预警
      if (outOfAreaCount >= OUT_OF_AREA_THRESHOLD) {
        const currentTime = new Date().getTime();
        if (currentTime - this.data.lastWarningTime > WARNING_COOLDOWN) {
          wx.showModal({
            title: '警告',
            content: '您已经超出指定范围进行活动',
            showCancel: false
          });
          
          // 更新上次预警时间
          this.setData({
            lastWarningTime: currentTime,
            outOfAreaCount: 0 // 预警后重置计数
          });
        } else {
          // 在冷却期内，保持计数但不触发预警
          this.setData({ outOfAreaCount: outOfAreaCount });
        }
      } else {
        // 更新超出区域计数
        this.setData({ outOfAreaCount: outOfAreaCount });
      }
    } else {
      // 如果在区域内，重置超出区域计数
      if (outOfAreaCount > 0) {
        this.setData({ outOfAreaCount: 0 });
      }
    }
  },
  
  // 计算两点之间的距离（米）- Haversine公式
  calculateDistance: function(lat1, lon1, lat2, lon2) {
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    const distance = EARTH_RADIUS * c;
    return distance;
  },
  
  // 角度转弧度
  deg2rad: function(deg) {
    return deg * (Math.PI/180);
  },
  
  // 添加滑块控制半径的函数
  onRadiusSliderChange: function(e) {
    const newRadius = e.detail.value;
    const circles = [{
      ...this.data.circles[0],
      radius: newRadius
    }];
    
    this.setData({
      areaRadius: newRadius,
      circles: circles,
      outOfAreaCount: 0 // 重置超出区域计数
    });
  },

  onLoad: function() {
    
    // 初始化动作计数对象
    this.setData({
      action_counts: {},
      current_action: '暂无'
    });
  },

  onUnload: function() {
    // 确保资源被正确释放
    if (this.data.isReading) {
      wx.offAccelerometerChange();
      wx.offGyroscopeChange();
      wx.stopAccelerometer({});
      wx.stopGyroscope({});
      if (this.submitTimer) {
        clearInterval(this.submitTimer);
        this.submitTimer = null;
      }
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;
      }
      if (this.stepDetectionTimer) {
        clearInterval(this.stepDetectionTimer);
        this.stepDetectionTimer = null;
      }
    }
    if (this.data.intervalId) {
      clearInterval(this.data.intervalId);
      this.setData({ intervalId: null });
    }
    
    // 清理数据保存和同步定时器
    if (this.data.dataSaveIntervalId) {
      clearInterval(this.data.dataSaveIntervalId);
    }
    if (this.data.syncIntervalId) {
      clearInterval(this.data.syncIntervalId);
    }
    if (this.data.stepRefreshIntervalId) {
      clearInterval(this.data.stepRefreshIntervalId);
    }
    
    // 清理步数统计定时器
    if (this.data.stepStatsIntervalId) {
      clearInterval(this.data.stepStatsIntervalId);
    }
    
    // 如果正在跟踪，先尝试同步最终数据到服务器
    if (this.data.tracking && this.data.isOnline) {
      this.syncDataWithServer();
    }
    
    // 无论是否在跟踪，都清空所有数据
    this.clearAllData(true);
    
    // 释放音频资源
    if (this.audioCtx) {
      this.audioCtx.stop();
      this.audioCtx = null;
    }
    
    // 清空数据数组，避免内存泄漏
    this.setData({
      accXs: [],
      accYs: [],
      accZs: [],
      gyrXs: [],
      gyrYs: [],
      gyrZs: [],
      markers: [],
      polyline: [{points: []}],
      accNormValues: [],
      accTimestamps: [],
      peakIndices: [],
      cachedLocationData: [],
      cachedStepsData: [],
      stepCount: 0,
      lastMinuteStepCount: 0,
      currentSteps: 0
    });
    
    console.log('页面卸载，资源已释放，数据已清空');
  },

  // 开始动作识别
  startActionRecognition: function() {
    if (this.data.isReading) {
      return; // 如果已经在读取中，不重复启动
    }

    try {
      let accXs = [];
      let accYs = [];
      let accZs = [];
      let gyrXs = [];
      let gyrYs = [];
      let gyrZs = [];
      
      // 重要添加：重置步数检测状态变量
      this.lastPeakTime = 0; // 重置最后峰值时间
      this.lastProcessedDataLength = 0; // 重置处理长度
      
      this.setData({ 
        startTime: new Date().getTime(), 
        isReading: true, 
        displayValue: 0, 
        value: 0,
        accXs: [],
        accYs: [],
        accZs: [],
        gyrXs: [],
        gyrYs: [],
        gyrZs: [],
        actionSequence: [],
        action_counts: {},
        current_action: '等待识别...',
        // 不重置步数，只重置相关数据结构
        accNormValues: [],
        accTimestamps: [],
        peakIndices: [],
        lastStepTime: new Date().getTime()
      });
      
      // 记录起始步数
      if (!this.startingStepCount) {
        this.startingStepCount = this.data.stepCount;
      }
      
      // 开始收集传感器数据
      this.startAccelerometer(accXs, accYs, accZs);
      this.startGyroscope(gyrXs, gyrYs, gyrZs);
      
      // 设置定时提交数据
      this.submitTimer = setInterval(this.submit.bind(this), SUBMIT_INTERVAL);
      
      // 添加定期清理计时器，每分钟执行一次
      this.cleanupTimer = setInterval(this.cleanupOldData.bind(this), 60000);
      
      // 添加定期更新步数的计时器
      this.stepDetectionTimer = setInterval(this.detectSteps.bind(this), STEP_UPDATE_INTERVAL);
      
      console.log('动作识别和步数统计已开启，状态已重置');
    } catch (error) {
      console.error('Error in startActionRecognition:', error);
      wx.showToast({
        title: '传感器初始化失败',
        icon: 'none'
      });
    }
  },

  // 停止动作识别
  stopActionRecognition: function() {
    if (!this.data.isReading) {
      return; // 如果没有在读取中，不执行任何操作
    }
    
    wx.offAccelerometerChange();
    wx.offGyroscopeChange();
    wx.stopAccelerometer({});
    wx.stopGyroscope({});
    
    if (this.submitTimer) {
      clearInterval(this.submitTimer);
      this.submitTimer = null;
    }
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    if (this.stepDetectionTimer) {
      clearInterval(this.stepDetectionTimer);
      this.stepDetectionTimer = null;
    }
    
    this.setData({ 
      isReading: false,
      current_action: '已停止',
      // 清空所有数据数组，避免内存占用
      accXs: [],
      accYs: [],
      accZs: [],
      gyrXs: [],
      gyrYs: [],
      gyrZs: []
    });
    
    console.log('动作识别已停止，数据已清空');
  },
  
  // 清理旧数据，仅保留最新的部分
  cleanupOldData: function() {
    if (!this.data.isReading) return;
    
    const { accXs, accYs, accZs, gyrXs, gyrYs, gyrZs, accNormValues, accTimestamps, actionSequence } = this.data;
    
    // 如果动作识别数据量超过了阈值，则清理旧数据
    const MAX_SAMPLE_KEEP = SAMPLE_SIZE * 3; // 保留的最大样本数
    const MAX_STEP_DATA_POINTS = 1000; // 步数数据最大保留点数
    const MAX_ACTION_RECORDS = 50; // 最大动作记录数
    
    let needUpdate = false;
    let dataUpdate = {};
    
    // 清理传感器数据
    if (accXs.length > MAX_SAMPLE_KEEP) {
      console.log('执行定期数据清理，清理前长度:', accXs.length);
      
      dataUpdate.accXs = accXs.slice(-MAX_SAMPLE_KEEP);
      dataUpdate.accYs = accYs.slice(-MAX_SAMPLE_KEEP);
      dataUpdate.accZs = accZs.slice(-MAX_SAMPLE_KEEP);
      dataUpdate.gyrXs = gyrXs.slice(-MAX_SAMPLE_KEEP);
      dataUpdate.gyrYs = gyrYs.slice(-MAX_SAMPLE_KEEP);
      dataUpdate.gyrZs = gyrZs.slice(-MAX_SAMPLE_KEEP);
      
      needUpdate = true;
    }
    
    // 清理计步相关数据
    if (accNormValues.length > MAX_STEP_DATA_POINTS) {
      // 计算要清理的数据量
      const removedCount = accNormValues.length - MAX_STEP_DATA_POINTS;
      
      // 如果有已同步的数据被清理，调整同步索引
      if (this.data.lastSyncedStepsIndex > removedCount) {
        this.setData({
          lastSyncedStepsIndex: this.data.lastSyncedStepsIndex - removedCount
        });
      } else {
        // 如果所有已同步数据都被清理了，则重置索引
        this.setData({ lastSyncedStepsIndex: 0 });
      }
      
      dataUpdate.accNormValues = accNormValues.slice(-MAX_STEP_DATA_POINTS);
      dataUpdate.accTimestamps = accTimestamps.slice(-MAX_STEP_DATA_POINTS);
      
      // 重要修改：数据清理后重置处理状态
      this.lastProcessedDataLength = 0;
      dataUpdate.peakIndices = []; // 重置峰值索引
      
      needUpdate = true;
    }
    
    // 清理动作序列数据
    if (actionSequence.length > MAX_ACTION_RECORDS) {
      dataUpdate.actionSequence = actionSequence.slice(-MAX_ACTION_RECORDS);
      
      needUpdate = true;
    }
    
    // 只有在确实需要更新时才调用setData，减少不必要的UI更新
    if (needUpdate) {
      this.setData(dataUpdate);
      console.log('数据清理完成，传感器数据减少至:', 
                  dataUpdate.accXs ? dataUpdate.accXs.length : accXs.length);
      
      // 重要添加：输出清理后的步数相关状态
      console.log('数据清理后重置步数处理状态，峰值索引已清空');
    }
  },

  // 启动加速度计
  startAccelerometer: function(accXs, accYs, accZs) {
    wx.startAccelerometer({
      interval: SENSOR_INTERVAL,
      success: res => {
        console.log("加速度计调用成功");
        wx.onAccelerometerChange(res => {
          // 如果已经停止读取，忽略传感器数据
          if (!this.data.isReading) return;
          
          let cur_time = new Date().getTime();
          let timeStep = (cur_time - this.data.startTime) / 1000;
          
          const accX = res.x;
          const accY = res.y;
          const accZ = res.z;
          
          // 计算加速度模值，用于步数检测
          const accNorm = Math.sqrt(accX * accX + accY * accY + accZ * accZ);
          
          // 更新加速度模值数组和时间戳
          let accNormValues = this.data.accNormValues;
          let accTimestamps = this.data.accTimestamps;
          
          accNormValues.push(accNorm);
          accTimestamps.push(cur_time);
          
          // 只更新当前数值显示
          this.setData({ 
            value: parseInt(timeStep), 
            displayValue: parseInt(timeStep),
            accelerometerX: parseFloat(accX.toFixed(5)),
            accelerometerY: parseFloat(accY.toFixed(5)),
            accelerometerZ: parseFloat(accZ.toFixed(5)),
            accNormValues: accNormValues,
            accTimestamps: accTimestamps
          });
          
          // 添加新数据并限制数组长度
          accXs.push(accX);
          accYs.push(accY);
          accZs.push(accZ);
          
          // 限制数组长度，防止无限增长
          if (accXs.length > SAMPLE_SIZE * 2) {
            accXs.splice(0, accXs.length - SAMPLE_SIZE * 2);
            accYs.splice(0, accYs.length - SAMPLE_SIZE * 2);
            accZs.splice(0, accZs.length - SAMPLE_SIZE * 2);
          }
          
          this.setData({ accXs, accYs, accZs });
        });
      },
      fail: res => console.error('Accelerometer failed:', res)
    });
  },

  // 启动陀螺仪
  startGyroscope: function(gyrXs, gyrYs, gyrZs) {
    wx.startGyroscope({
      interval: SENSOR_INTERVAL,
      success: res => {
        console.log("陀螺仪调用成功");
        wx.onGyroscopeChange(res => {
          // 如果已经停止读取，忽略传感器数据
          if (!this.data.isReading) return;
          
          // 添加新数据并限制数组长度
          gyrXs.push(res.x);
          gyrYs.push(res.y);
          gyrZs.push(res.z);
          
          // 限制数组长度，防止无限增长
          if (gyrXs.length > SAMPLE_SIZE * 2) {
            gyrXs.splice(0, gyrXs.length - SAMPLE_SIZE * 2);
            gyrYs.splice(0, gyrYs.length - SAMPLE_SIZE * 2);
            gyrZs.splice(0, gyrZs.length - SAMPLE_SIZE * 2);
          }
          
          this.setData({
            gyroscopeX: parseFloat(res.x.toFixed(5)),
            gyroscopeY: parseFloat(res.y.toFixed(5)),
            gyroscopeZ: parseFloat(res.z.toFixed(5)),
            gyrXs, gyrYs, gyrZs
          });
        });
      },
      fail: res => console.error('Gyroscope failed:', res)
    });
  },

  // 提交数据到服务器进行动作识别
  submit: function() {
    // 确保数据足够且正在读取中
    if (this.data.accXs.length < SAMPLE_SIZE || !this.data.isReading) {
      console.log('数据不足或已停止读取，跳过提交');
      return;
    }

    const data = {
      // 只取最新的SAMPLE_SIZE个数据点进行提交
      accXs: this.data.accXs.slice(-SAMPLE_SIZE),
      accYs: this.data.accYs.slice(-SAMPLE_SIZE),
      accZs: this.data.accZs.slice(-SAMPLE_SIZE),
      gyrXs: this.data.gyrXs.slice(-SAMPLE_SIZE),
      gyrYs: this.data.gyrYs.slice(-SAMPLE_SIZE),
      gyrZs: this.data.gyrZs.slice(-SAMPLE_SIZE),
    };
    
    console.log('提交动作识别数据，样本大小:', SAMPLE_SIZE, '当前数组长度:', this.data.accXs.length);

    wx.request({
      url: `${API_BASE_URL}/recognize`,
      data: {
        data: JSON.stringify(data)
      },
      method: "POST",
      header: HEADERS,
      success: res => {
        // 检查是否仍在读取中
        if (!this.data.isReading) {
          console.log('已停止读取，忽略返回结果');
          return;
        }
        
        console.log('预测结果：', res.data, '成功');
        
        const detected_action = res.data.class_name;
        
        // 记录动作及时间
        const actionRecord = {
          action: detected_action,
          timestamp: new Date().getTime(),
          index: this.data.actionSequence.length
        };

        // 更新动作计数
        let action_counts = this.data.action_counts;
        if (action_counts[detected_action]) {
          action_counts[detected_action]++;
        } else {
          action_counts[detected_action] = 1;
        }

        this.setData({
          current_action: detected_action,
          actionSequence: [...this.data.actionSequence, actionRecord],
          action_counts: action_counts
        });
        
        // 提交完成后，清理数据以避免过度堆积
        this.cleanupOldData();
      },
      fail: res => {
        console.log('动作识别请求失败:', res);
        // 请求失败时也执行清理，防止数据无限累积
        this.cleanupOldData();
      }
    });
  },
  
  // 实现步数检测算法
  detectSteps: function() {
    if (!this.data.isReading || this.data.accNormValues.length < 10) {
      return;
    }
    
    const { accNormValues, accTimestamps, stepCount } = this.data;
    
    // 滑动平均滤波
    const filteredValues = this.movingAverageFilter(accNormValues, MOVING_AVERAGE_WINDOW);
    
    // 使用基于时间戳的峰值检测
    const results = this.detectNewPeaks(
      filteredValues, 
      accTimestamps, 
      SAMPLE_RATE, 
      PEAK_THRESHOLD, 
      MIN_PEAK_DISTANCE_S
    );
    
    // 如果检测到新步数，则累加到总步数
    if (results.newStepCount > 0) {
      // 更新总步数
      const newTotalSteps = stepCount + results.newStepCount;
      
      this.setData({
        stepCount: newTotalSteps,
        peakIndices: results.peakIndices.slice(-100) // 只保留最新的100个峰值点
      });
      
      console.log('步数更新：检测到新步数', results.newStepCount, '累计总步数', newTotalSteps, 
                  '当前数据长度:', accNormValues.length);
    }
  },
  
  // 基于时间戳的峰值检测方法
  detectNewPeaks: function(accNorm, timestamps, sampleRate, threshold, minPeakDistanceS) {
    // 最小峰值时间间隔（毫秒）
    const minPeakDistanceMs = minPeakDistanceS * 1000; 
    let newStepCount = 0;
    const peakIndices = [];
    
    // 获取最后记录的峰值时间
    let lastPeakTime = this.lastPeakTime || 0;
    
    // 遍历所有数据点检测峰值（不依赖lastProcessedDataLength）
    for (let i = 1; i < accNorm.length - 1; i++) {
      // 简易极大值判定
      if (accNorm[i] > threshold &&
          accNorm[i] > accNorm[i - 1] &&
          accNorm[i] > accNorm[i + 1]) {
        
        const currentTime = timestamps[i];
        
        // 确保与上一个峰值的时间间隔足够远
        if (currentTime - lastPeakTime > minPeakDistanceMs) {
          newStepCount++;
          peakIndices.push(i);
          lastPeakTime = currentTime;
          
          // 调试日志
          console.log(`检测到新步伐，间隔: ${(currentTime - this.lastPeakTime)/1000}秒, 值: ${accNorm[i].toFixed(2)}`);
        }
      }
    }
    
    // 存储最后的峰值时间，用于下次判断
    this.lastPeakTime = lastPeakTime;
    
    return {
      newStepCount: newStepCount,
      peakIndices: peakIndices
    };
  },
  
  // 滑动平均滤波
  movingAverageFilter: function(data, windowSize = 5) {
    const filtered = [];
    let windowSum = 0;
    const queue = [];

    for (let i = 0; i < data.length; i++) {
      queue.push(data[i]);
      windowSum += data[i];

      if (queue.length > windowSize) {
        windowSum -= queue.shift();
      }
      // 输出滑动窗口平均值
      filtered.push(windowSum / queue.length);
    }
    return filtered;
  },
  
  // 清空所有数据
  clearAllData: function(resetStepCount = true) {
    try {
      // 清空本地存储中的数据
      wx.removeStorageSync(STORAGE_KEY_LOCATION);
      wx.removeStorageSync(STORAGE_KEY_STEPS);
      
      // 准备更新的数据
      let updateData = {
        markers: [],
        polyline: [{
          points: [],
          color: POLYLINE_COLOR,
          width: POLYLINE_WIDTH,
          dottedLine: false
        }],
        cachedLocationData: [],
        cachedStepsData: [],
        lastMinuteStepCount: resetStepCount ? 0 : this.data.stepCount,
        lastSyncedLocationIndex: 0, // 重置同步索引
        lastSyncedStepsIndex: 0     // 重置同步索引
      };
      
      // 只有在需要重置步数时才更新stepCount
      if (resetStepCount) {
        updateData.stepCount = 0;
      }
      
      // 更新数据
      this.setData(updateData);
      
      console.log('位置数据已清空，步数' + (resetStepCount ? '已重置' : '保持不变'));
    } catch (error) {
      console.error('清空数据失败:', error);
    }
  },

  // 新增步数统计记录方法
  recordStepStats: function() {
    if (!this.data.tracking) return;
    
    console.log('记录步数统计数据...');
    
    const { stepCount, lastMinuteStepCount } = this.data;
    const timestamp = new Date().getTime();
    
    // 计算本次统计周期内新增的步数
    const stepsIncrement = stepCount - lastMinuteStepCount;
    
    // 将本次新增步数记录到缓存数据中
    let newCachedStepsData = [...this.data.cachedStepsData];
    
    newCachedStepsData.push({
      stepCount: stepCount, // 总步数
      stepsIncrement: stepsIncrement >= 0 ? stepsIncrement : 0, // 确保增量不为负数
      timestamp: timestamp
    });
    
    // 限制缓存数据大小
    if (newCachedStepsData.length > MAX_CACHE_ITEMS) {
      newCachedStepsData = newCachedStepsData.slice(-MAX_CACHE_ITEMS);
    }
    
    // 更新数据
    this.setData({
      cachedStepsData: newCachedStepsData,
      lastMinuteStepCount: stepCount // 更新上一分钟步数记录
    });
    
    console.log('步数统计数据已记录，当前总步数:', stepCount, '本周期新增步数:', stepsIncrement);
  },
})
