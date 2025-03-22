// 导入拆分后的模块
import * as Constants from './config/constants.js'
import * as LocationService from './services/location-service.js'
import * as StepCounter from './services/step-counter.js'
import * as StorageService from './services/storage-service.js'
import * as ActionService from './services/action-service.js'

Page({
  data: {
    // 位置相关
    latitude: '',
    longitude: '',
    markers: [],
    polyline: [],
    tracking: false,
    intervalId: null,
    // 区域相关
    isSettingArea: false,
    hasSetArea: false,
    areaCenter: null,
    areaRadius: Constants.DEFAULT_RADIUS,
    circles: [],
    mapVisible: false,
    outOfAreaCount: 0,
    lastWarningTime: 0,
    // 动作识别相关
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
    // 步数统计相关
    stepCount: 0,
    lastMinuteStepCount: 0,
    currentSteps: 0,
    accNormValues: [],
    accTimestamps: [],
    peakIndices: [],
    lastStepTime: 0,
    showStepChart: false,
    stepStatsIntervalId: null,
    // 离线数据缓存相关
    cachedLocationData: [],
    cachedStepsData: [],
    isOnline: true,
    lastSyncTime: 0,
    dataSaveIntervalId: null,
    syncIntervalId: null,
    stepRefreshIntervalId: null,
    lastSyncedLocationIndex: 0,
    lastSyncedStepsIndex: 0,
    isSyncing: false  // 添加同步锁，防止并发同步
  },
  
  // 定时器管理对象
  timers: {
    location: null,
    stepDetection: null,
    stepStats: null,
    dataSave: null,
    sync: null,
    actionSubmit: null,
    cleanup: null
  },
  
  // 获取位置并显示地图
  getLocation: function() {
    wx.showLoading({
      title: '获取位置中...',
    });
    
    wx.getLocation({
      type: Constants.LOCATION_TYPE,
      success: res => {
        wx.hideLoading();
        this.setData({
          latitude: res.latitude,
          longitude: res.longitude,
          mapVisible: true,
          scale: Constants.DEFAULT_SCALE,
        });
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({
          title: '获取位置失败',
          icon: 'none',
          duration: Constants.TOAST_DURATION
        });
      }
    });
  },
  
  // 合并开始/停止记录功能 - 同时控制位置记录和动作识别
  toggleTracking: function() {
    if (this.data.tracking) {
      // 停止跟踪
      this.stopAllSensors();
      
      // 同步最终数据
      if (this.data.isOnline) {
        wx.showLoading({ title: '正在同步数据...' });
        this.syncDataWithServer();
        setTimeout(() => {
          wx.hideLoading();
          this.clearAllData();
        }, 1000);
      } else {
        this.clearAllData();
      }
      
      this.setData({ tracking: false });
    } else {
      // 开始跟踪
      this.resetAllData();
      
      // 初始化UI状态
      this.setData({
        tracking: true,
        isReading: true,
        markers: [],
        polyline: [{
          points: [],
          color: Constants.POLYLINE_COLOR,
          width: Constants.POLYLINE_WIDTH,
          dottedLine: false
        }],
        cachedLocationData: [],
        cachedStepsData: [],
        lastSyncedLocationIndex: 0,
        lastSyncedStepsIndex: 0,
        lastSyncTime: 0,
        isSyncing: false
      });
      
      // 启动传感器和处理逻辑
      this.getLocationAndUpdate();  // 立即获取位置
      this.startSensors();          // 启动所有传感器
      this.startAllTimers();        // 启动所有定时器
      
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
      const cachedLocationData = wx.getStorageSync(Constants.STORAGE_KEY_LOCATION);
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
              width: Constants.MARKER_SIZE,
              height: Constants.MARKER_SIZE
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
              color: Constants.POLYLINE_COLOR,
              width: Constants.POLYLINE_WIDTH,
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
      const cachedStepsData = wx.getStorageSync(Constants.STORAGE_KEY_STEPS);
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
    
    // 保存数据...
    const saveResult = StorageService.saveDataToStorage(
      this.data.cachedLocationData,
      this.data.cachedStepsData
    );
    
    // 如果保存成功且在线，尝试同步
    if (saveResult && this.data.isOnline && !this.data.isSyncing) {
      // 设置一个短暂延迟，避免在同一个事件循环中立即触发
      setTimeout(() => {
        this.syncDataWithServer();
      }, 100);
    }
    
    return saveResult;
  },
  
  // 同步数据到服务器 - 只发送新增数据
  syncDataWithServer: function() {
    // 防止重复同步：如果已经在同步或未跟踪或离线，则返回
    if (this.data.isSyncing || !this.data.tracking || !this.data.isOnline) return;
    
    const currentTime = new Date().getTime();
    
    // 如果距离上次同步时间不足，则跳过（除非是手动触发）
    if (currentTime - this.data.lastSyncTime < Constants.SYNC_INTERVAL) return;
    
    // 激活同步锁
    this.setData({ isSyncing: true });
    
    console.log('尝试同步数据到服务器...');
    
    // 打印调试信息
    console.log('准备同步数据 - 位置数据总量:', this.data.cachedLocationData.length, 
               '待同步:', this.data.cachedLocationData.length - this.data.lastSyncedLocationIndex, 
               '步数数据总量:', this.data.cachedStepsData.length,
               '待同步:', this.data.cachedStepsData.length - this.data.lastSyncedStepsIndex);
    
    // 使用存储服务中的同步方法进行增量上传
    StorageService.syncDataWithServer(
      Constants.API_BASE_URL,
      this.data.cachedLocationData,
      this.data.cachedStepsData,
      this.data.lastSyncedLocationIndex,
      this.data.lastSyncedStepsIndex
    ).then(result => {
      // 更新同步索引
      this.setData({
        lastSyncedLocationIndex: result.lastSyncedLocationIndex,
        lastSyncedStepsIndex: result.lastSyncedStepsIndex,
        lastSyncTime: currentTime,
        isSyncing: false  // 释放同步锁
      });
      
      console.log(`数据同步完成 - 位置数据: ${result.locationSuccess ? '成功' : '失败'}, 步数数据: ${result.stepsSuccess ? '成功' : '失败'}`);
    }).catch(error => {
      console.error('数据同步过程中出错:', error);
      this.setData({ isSyncing: false });  // 发生错误时也要释放锁
    });
  },
  
  getLocationAndUpdate: function() {
    let that = this;
    wx.getLocation({
      type: Constants.LOCATION_TYPE,
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
          width: Constants.MARKER_SIZE,
          height: Constants.MARKER_SIZE
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
        if (cachedLocationData.length > Constants.MAX_CACHE_ITEMS) {
          cachedLocationData = cachedLocationData.slice(-Constants.MAX_CACHE_ITEMS);
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
          duration: Constants.TOAST_DURATION
        });
      }
    });
  },
  
  // 开始设置区域
  startSettingArea: function() {
    // 先获取当前位置作为圆心
    wx.getLocation({
      type: Constants.LOCATION_TYPE,
      success: res => {
        const circles = [{
          latitude: res.latitude,
          longitude: res.longitude,
          color: Constants.CIRCLE_COLOR,
          fillColor: Constants.CIRCLE_FILL_COLOR,
          radius: this.data.areaRadius,
          strokeWidth: Constants.CIRCLE_STROKE_WIDTH
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
          duration: Constants.TOAST_DURATION
        });
      },
      fail: () => {
        wx.showToast({
          title: '获取位置失败',
          icon: 'none',
          duration: Constants.TOAST_DURATION
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
      duration: Constants.TOAST_DURATION
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
    
    const newRadius = Math.min(Constants.MAX_RADIUS, this.data.areaRadius + Constants.RADIUS_STEP);
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
    if (this.data.areaRadius <= Constants.MIN_RADIUS) return; // 最小半径限制
    
    const newRadius = Math.max(Constants.MIN_RADIUS, this.data.areaRadius - Constants.RADIUS_STEP);
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
      console.log(`超出区域检测: ${outOfAreaCount}/${Constants.OUT_OF_AREA_THRESHOLD}`);
      
      // 如果连续超出区域次数达到阈值，且距离上次预警时间超过冷却时间，则触发预警
      if (outOfAreaCount >= Constants.OUT_OF_AREA_THRESHOLD) {
        const currentTime = new Date().getTime();
        if (currentTime - this.data.lastWarningTime > Constants.WARNING_COOLDOWN) {
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
    const distance = Constants.EARTH_RADIUS * c;
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
    
    // 设置定时同步数据的计时器，每分钟检查一次
    this.syncCheckTimer = setInterval(() => {
      if (this.data.tracking && this.data.isOnline) {
        this.syncDataWithServer();
      }
    }, Constants.SYNC_INTERVAL / 2); // 设置为同步间隔的一半，确保及时同步
  },

  onUnload: function() {
    // 停止所有传感器
    wx.stopAccelerometer();
    wx.stopGyroscope();
    
    // 移除所有监听器
    if (this.actionAccListener) {
      wx.offAccelerometerChange(this.actionAccListener);
    }
    if (this.actionGyrListener) {
      wx.offGyroscopeChange(this.actionGyrListener);
    }
    
    // 停止所有定时器
    this.stopAllTimers();
    
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
    
    // 清除同步检查计时器
    if (this.syncCheckTimer) {
      clearInterval(this.syncCheckTimer);
    }
    
    // 确保清理同步状态
    this.setData({ 
      isSyncing: false,
      lastSyncTime: 0 
    });
  },

  // 完全独立的步数统计传感器监听
  startStepCounter: function() {
    // 初始化步数检测器
    this.stepDetector = {
      accNormValues: [],
      accTimestamps: [],
      lastPeakTime: 0,
      peakIndices: []
    };
    
    // 启动独立的加速度监听 - 使用与原代码相同的频率
    wx.startAccelerometer({
      interval: Constants.SENSOR_INTERVAL,  // 与动作识别使用相同频率
      success: () => console.log('步数统计加速度计启动成功')
    });
    
    // 步数统计专用监听器
    this.stepAccListener = (res) => {
      if (!this.data.tracking) return;
      
      const accNorm = Math.sqrt(res.x*res.x + res.y*res.y + res.z*res.z);
      const timestamp = new Date().getTime();
      
      this.stepDetector.accNormValues.push(accNorm);
      this.stepDetector.accTimestamps.push(timestamp);
      
      // 使用与原始代码相同的限制策略
      if (this.stepDetector.accNormValues.length > Constants.SAMPLE_SIZE * 2) {
        this.stepDetector.accNormValues = this.stepDetector.accNormValues.slice(-Constants.SAMPLE_SIZE);
        this.stepDetector.accTimestamps = this.stepDetector.accTimestamps.slice(-Constants.SAMPLE_SIZE);
      }
    };
    
    wx.onAccelerometerChange(this.stepAccListener);
    
    // 设置独立的步数检测定时器
    this.timers.stepDetection = setInterval(() => {
      if (this.stepDetector.accNormValues.length < 10) return;
      
      // 使用步数计数器模块处理
      const filteredValues = StepCounter.movingAverageFilter(
        this.stepDetector.accNormValues, 
        Constants.MOVING_AVERAGE_WINDOW
      );
      
      const results = StepCounter.detectNewPeaks(
        filteredValues,
        this.stepDetector.accTimestamps,
        this.stepDetector.lastPeakTime,
        Constants.PEAK_THRESHOLD,
        Constants.MIN_PEAK_DISTANCE_S
      );
      
      // 更新检测器状态
      this.stepDetector.lastPeakTime = results.lastPeakTime;
      this.stepDetector.peakIndices = results.peakIndices;
      
      // 只有在检测到新步数时才更新UI
      if (results.newStepCount > 0) {
        const newTotalSteps = this.data.stepCount + results.newStepCount;
        this.setData({ 
          stepCount: newTotalSteps,
          peakIndices: results.peakIndices.slice(-100)  // 保持与原代码一致
        });
        
        console.log('步数更新：检测到新步数', results.newStepCount, 
                    '累计总步数', newTotalSteps,
                    '当前数据长度:', this.stepDetector.accNormValues.length);
      }
    }, Constants.STEP_UPDATE_INTERVAL);
  },

  // 多个清理函数功能重叠
  cleanupOldData: function() {
    if (!this.data.isReading) return;
    
    // 清理传感器数据
    const MAX_SAMPLE_KEEP = Constants.SAMPLE_SIZE * 3; // 保留的最大样本数
    const MAX_STEP_DATA_POINTS = 1000; // 步数数据最大保留点数
    const MAX_ACTION_RECORDS = 50; // 最大动作记录数
    
    let needUpdate = false;
    let dataUpdate = {};
    
    // 1. 清理UI中的传感器数据（this.data中的数据）
    if (this.data.accXs && this.data.accXs.length > MAX_SAMPLE_KEEP) {
      console.log('执行定期数据清理，UI数据清理前长度:', this.data.accXs.length);
      
      dataUpdate.accXs = this.data.accXs.slice(-MAX_SAMPLE_KEEP);
      dataUpdate.accYs = this.data.accYs.slice(-MAX_SAMPLE_KEEP);
      dataUpdate.accZs = this.data.accZs.slice(-MAX_SAMPLE_KEEP);
      dataUpdate.gyrXs = this.data.gyrXs.slice(-MAX_SAMPLE_KEEP);
      dataUpdate.gyrYs = this.data.gyrYs.slice(-MAX_SAMPLE_KEEP);
      dataUpdate.gyrZs = this.data.gyrZs.slice(-MAX_SAMPLE_KEEP);
      console.log('UI数据清理后长度将更新为:', dataUpdate.accXs.length);
      needUpdate = true;
    }
    
    // 2. 同时清理actionData中的数据（这是动作识别实际使用的数据）
    if (this.actionData && this.actionData.accXs && this.actionData.accXs.length > MAX_SAMPLE_KEEP) {
      console.log('执行定期数据清理，actionData清理前长度:', this.actionData.accXs.length);
      
      // 清理存储在actionData中的数据
      this.actionData.accXs = this.actionData.accXs.slice(-MAX_SAMPLE_KEEP);
      this.actionData.accYs = this.actionData.accYs.slice(-MAX_SAMPLE_KEEP);
      this.actionData.accZs = this.actionData.accZs.slice(-MAX_SAMPLE_KEEP);
      this.actionData.gyrXs = this.actionData.gyrXs.slice(-MAX_SAMPLE_KEEP);
      this.actionData.gyrYs = this.actionData.gyrYs.slice(-MAX_SAMPLE_KEEP);
      this.actionData.gyrZs = this.actionData.gyrZs.slice(-MAX_SAMPLE_KEEP);
      
      console.log('actionData清理后长度:', this.actionData.accXs.length);
    }
    
    // 3. 清理步数检测相关数据
    if (this.stepDetector && this.stepDetector.accNormValues && 
        this.stepDetector.accNormValues.length > MAX_STEP_DATA_POINTS) {
      console.log('执行步数检测数据清理，清理前长度:', this.stepDetector.accNormValues.length);
      
      // 清理步数检测器中的数据
      this.stepDetector.accNormValues = this.stepDetector.accNormValues.slice(-MAX_STEP_DATA_POINTS);
      this.stepDetector.accTimestamps = this.stepDetector.accTimestamps.slice(-MAX_STEP_DATA_POINTS);
      this.stepDetector.peakIndices = []; // 重置峰值索引
      
      console.log('步数检测数据清理后长度:', this.stepDetector.accNormValues.length);
    }
    
    // 4. 清理UI中的步数相关数据
    if (this.data.accNormValues && this.data.accNormValues.length > MAX_STEP_DATA_POINTS) {
      // 计算要清理的数据量
      const removedCount = this.data.accNormValues.length - MAX_STEP_DATA_POINTS;
      
      // 如果有已同步的数据被清理，调整同步索引
      if (this.data.lastSyncedStepsIndex > removedCount) {
        dataUpdate.lastSyncedStepsIndex = this.data.lastSyncedStepsIndex - removedCount;
      } else {
        // 如果所有已同步数据都被清理了，则重置索引
        dataUpdate.lastSyncedStepsIndex = 0;
      }
      
      dataUpdate.accNormValues = this.data.accNormValues.slice(-MAX_STEP_DATA_POINTS);
      dataUpdate.accTimestamps = this.data.accTimestamps.slice(-MAX_STEP_DATA_POINTS);
      dataUpdate.peakIndices = []; // 重置峰值索引
      
      needUpdate = true;
    }
    
    // 5. 清理动作序列数据
    if (this.data.actionSequence && this.data.actionSequence.length > MAX_ACTION_RECORDS) {
      dataUpdate.actionSequence = this.data.actionSequence.slice(-MAX_ACTION_RECORDS);
      needUpdate = true;
    }
    
    // 只有在确实需要更新时才调用setData，减少不必要的UI更新
    if (needUpdate) {
      this.setData(dataUpdate);
      console.log('数据清理完成，UI更新已执行');
    }
  },

  // 提交数据到服务器进行动作识别
  submitDataToServerForAR: function() {
    // 确保数据足够且正在读取中
    if (!this.data.isReading || 
        this.sensorData.action.accXs.length < Constants.SAMPLE_SIZE) {
      console.log('数据不足或已停止读取，跳过提交');
      return;
    }

    const data = {
      // 只取最新的SAMPLE_SIZE个数据点
      accXs: this.sensorData.action.accXs.slice(-Constants.SAMPLE_SIZE),
      accYs: this.sensorData.action.accYs.slice(-Constants.SAMPLE_SIZE),
      accZs: this.sensorData.action.accZs.slice(-Constants.SAMPLE_SIZE),
      gyrXs: this.sensorData.action.gyrXs.slice(-Constants.SAMPLE_SIZE),
      gyrYs: this.sensorData.action.gyrYs.slice(-Constants.SAMPLE_SIZE),
      gyrZs: this.sensorData.action.gyrZs.slice(-Constants.SAMPLE_SIZE),
    };

    console.log('提交动作识别数据，样本大小:', Constants.SAMPLE_SIZE);

    wx.request({
      url: `${Constants.API_BASE_URL}/recognize`,
      data: {
        data: JSON.stringify(data)
      },
      method: "POST",
      header: Constants.HEADERS,
      success: res => {
        // 处理响应...
        this.handleActionRecognitionResult(res.data);
      },
      fail: err => {
        console.log('动作识别请求失败:', err);
      }
    });
  },
  
  // 清空所有数据
  clearAllData: function(resetStepCount = true) {
    try {
      // 清空本地存储中的数据
      wx.removeStorageSync(Constants.STORAGE_KEY_LOCATION);
      wx.removeStorageSync(Constants.STORAGE_KEY_STEPS);
      
      // 准备更新的数据
      let updateData = {
        markers: [],
        polyline: [{
          points: [],
          color: Constants.POLYLINE_COLOR,
          width: Constants.POLYLINE_WIDTH,
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
    if (newCachedStepsData.length > Constants.MAX_CACHE_ITEMS) {
      newCachedStepsData = newCachedStepsData.slice(-Constants.MAX_CACHE_ITEMS);
    }
    
    // 更新数据
    this.setData({
      cachedStepsData: newCachedStepsData,
      lastMinuteStepCount: stepCount // 更新上一分钟步数记录
    });
    
    console.log('步数统计数据已记录，当前总步数:', stepCount, '本周期新增步数:', stepsIncrement);
  },

  // 启动所有定时器
  startAllTimers: function() {
    // 位置跟踪定时器
    this.timers.location = setInterval(
      this.getLocationAndUpdate.bind(this), 
      Constants.TRACKING_INTERVAL
    );
    
    // 数据保存和同步定时器
    this.timers.dataSave = setInterval(() => {
      this.saveDataToStorage();
      if (this.data.isOnline) this.syncDataWithServer();
    }, Constants.DATA_SAVE_INTERVAL);
    
    // 步数统计定时器
    this.timers.stepStats = setInterval(
      this.recordStepStats.bind(this), 
      Constants.STEP_STATS_INTERVAL
    );
    
    // 动作识别提交定时器 - 这个很关键
    this.timers.actionSubmit = setInterval(
      this.submitDataToServerForAR.bind(this), 
      Constants.SUBMIT_INTERVAL
    );
    
    // 数据清理定时器
    this.timers.cleanup = setInterval(
      this.cleanupOldData.bind(this), 
      60000
    );
  },

  // 停止所有定时器
  stopAllTimers: function() {
    Object.keys(this.timers).forEach(key => {
      if (this.timers[key]) {
        clearInterval(this.timers[key]);
        this.timers[key] = null;
      }
    });
  },

  // 重构数据处理方法，使用标准化的接口
  processLocationData: function(locationData) {
    // 使用LocationService处理数据
    const result = LocationService.addLocationPoint(
      this.data.markers,
      this.data.polyline,
      this.data.cachedLocationData,
      locationData.latitude,
      locationData.longitude,
      new Date().getTime()
    );
    
    // 更新状态
    this.setData({
      markers: result.markers,
      polyline: result.polyline,
      cachedLocationData: result.locationData
    });
  },

  // 增强错误恢复机制
  handleSensorError: function(error, sensorType) {
    console.error(`${sensorType}传感器错误:`, error);
    
    // 尝试重启传感器
    if (sensorType === 'accelerometer') {
      wx.stopAccelerometer({
        success: () => {
          setTimeout(() => {
            this.startAccelerometer([], [], []);
          }, 1000);
        }
      });
    }
    
    // 通知用户
    wx.showToast({
      title: `${sensorType}传感器出错，已尝试恢复`,
      icon: 'none',
      duration: 2000
    });
  },

  // 多个清理函数功能重叠
  cleanupSensorData: function() {
    // 清理动作识别数据
    this.cleanupActionData();
    
    // 清理步数检测数据
    this.cleanupStepData();
    
    // 清理其他UI相关数据
    this.cleanupUIData();
  },

  // 清理动作识别数据
  cleanupActionData: function() {
    const MAX_ACTION_DATA = Constants.SAMPLE_SIZE * 3;
    
    if (this.sensorData.action.accXs.length > MAX_ACTION_DATA) {
      console.log('清理动作识别数据，清理前长度:', this.sensorData.action.accXs.length);
      
      // 清理传感器数据对象
      this.sensorData.action.accXs = this.sensorData.action.accXs.slice(-MAX_ACTION_DATA);
      this.sensorData.action.accYs = this.sensorData.action.accYs.slice(-MAX_ACTION_DATA);
      this.sensorData.action.accZs = this.sensorData.action.accZs.slice(-MAX_ACTION_DATA);
      this.sensorData.action.gyrXs = this.sensorData.action.gyrXs.slice(-MAX_ACTION_DATA);
      this.sensorData.action.gyrYs = this.sensorData.action.gyrYs.slice(-MAX_ACTION_DATA);
      this.sensorData.action.gyrZs = this.sensorData.action.gyrZs.slice(-MAX_ACTION_DATA);
      
      // 同步更新UI数据
      this.setData({
        accXs: this.sensorData.action.accXs,
        accYs: this.sensorData.action.accYs,
        accZs: this.sensorData.action.accZs,
        gyrXs: this.sensorData.action.gyrXs,
        gyrYs: this.sensorData.action.gyrYs,
        gyrZs: this.sensorData.action.gyrZs
      });
      
      console.log('动作识别数据清理完成，当前长度:', this.sensorData.action.accXs.length);
    }
  },

  // 清理步数检测数据
  cleanupStepData: function() {
    const MAX_STEP_DATA = Constants.SAMPLE_SIZE * 2;
    
    if (this.sensorData.step.accNormValues.length > MAX_STEP_DATA) {
      console.log('清理步数检测数据，清理前长度:', this.sensorData.step.accNormValues.length);
      
      // 清理步数数据对象
      this.sensorData.step.accNormValues = this.sensorData.step.accNormValues.slice(-MAX_STEP_DATA);
      this.sensorData.step.accTimestamps = this.sensorData.step.accTimestamps.slice(-MAX_STEP_DATA);
      
      // 同步更新UI数据
      this.setData({
        accNormValues: this.sensorData.step.accNormValues,
        accTimestamps: this.sensorData.step.accTimestamps
      });
      
      console.log('步数检测数据清理完成，当前长度:', this.sensorData.step.accNormValues.length);
    }
  },

  // 清理其他UI相关数据
  cleanupUIData: function() {
    const MAX_ACTION_RECORDS = 50;
    let needUpdate = false;
    let dataUpdate = {};
    
    // 清理动作序列记录
    if (this.data.actionSequence && this.data.actionSequence.length > MAX_ACTION_RECORDS) {
      dataUpdate.actionSequence = this.data.actionSequence.slice(-MAX_ACTION_RECORDS);
      needUpdate = true;
    }
    
    // 清理其他可能需要清理的UI数据...
    
    if (needUpdate) {
      this.setData(dataUpdate);
    }
  },

  // 处理步数数据
  processStepData: function() {
    const { accNormValues, accTimestamps, lastPeakTime } = this.sensorData.step;
    
    // 确保有足够的数据
    if (accNormValues.length < 10) return;
    
    // 使用步数计数器模块处理
    const filteredValues = StepCounter.movingAverageFilter(
      accNormValues, 
      Constants.MOVING_AVERAGE_WINDOW
    );
    
    const results = StepCounter.detectNewPeaks(
      filteredValues,
      accTimestamps,
      lastPeakTime,
      Constants.PEAK_THRESHOLD,
      Constants.MIN_PEAK_DISTANCE_S
    );
    
    // 更新检测器状态
    this.sensorData.step.lastPeakTime = results.lastPeakTime;
    this.sensorData.step.peakIndices = results.peakIndices;
    
    // 只有在检测到新步数时才更新UI
    if (results.newStepCount > 0) {
      const newTotalSteps = this.data.stepCount + results.newStepCount;
      this.setData({ 
        stepCount: newTotalSteps,
        peakIndices: results.peakIndices.slice(-100)  // 只保留最近的100个峰值用于显示
      });
      
      console.log('步数更新：检测到新步数', results.newStepCount, 
                  '累计总步数', newTotalSteps);
    }
  },

  // 重置所有数据
  resetAllData: function() {
    // 重置传感器数据对象
    this.sensorData = {
      action: {
        accXs: [], accYs: [], accZs: [],
        gyrXs: [], gyrYs: [], gyrZs: []
      },
      step: {
        accNormValues: [],
        accTimestamps: [],
        peakIndices: [],
        lastPeakTime: 0
      }
    };
    
    // 重置UI数据
    this.setData({
      accXs: [],
      accYs: [],
      accZs: [],
      gyrXs: [],
      gyrYs: [],
      gyrZs: [],
      accNormValues: [],
      accTimestamps: [],
      peakIndices: [],
      actionSequence: [],
      current_action: '暂无',
      stepCount: 0,
      lastMinuteStepCount: 0
    });
  },

  // 停止所有传感器
  stopAllSensors: function() {
    // 停止物理传感器
    wx.stopAccelerometer();
    wx.stopGyroscope();
    
    // 移除监听器
    if (this.accListener) {
      wx.offAccelerometerChange(this.accListener);
    }
    
    if (this.gyrListener) {
      wx.offGyroscopeChange(this.gyrListener);
    }
    
    // 停止定时器
    this.stopAllTimers();
    
    // 设置状态
    this.setData({ isReading: false });
  },
})
