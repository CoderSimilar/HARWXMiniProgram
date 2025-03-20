// 提取所有常量到代码开头
const LOCATION_TYPE = 'gcj02'; // 位置坐标类型
const TRACKING_INTERVAL = 1000; // 位置跟踪间隔(毫秒)
const DEFAULT_SCALE = 10; // 地图默认缩放级别
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
const STEP_UPDATE_INTERVAL = 1000; // 步数更新频率 (毫秒)
const SAMPLE_RATE = 50; // 加速度传感器采样率估计值 (Hz)
const PEAK_THRESHOLD = 1.2; // 峰值检测阈值
const MIN_PEAK_DISTANCE_S = 0.25; // 最小峰值间隔 (秒)
const MOVING_AVERAGE_WINDOW = 5; // 滑动平均窗口大小

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
    stepCount: 0,        // 当前检测到的步数
    accNormValues: [],   // 加速度模值数组
    accTimestamps: [],   // 加速度时间戳
    peakIndices: [],     // 峰值索引
    lastStepTime: 0,     // 上次计步时间戳
    showStepChart: false // 是否显示计步图表

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
          mapVisible: true
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
      
      this.setData({
        tracking: false,
        intervalId: null,
        outOfAreaCount: 0, // 重置超出区域计数
        isReading: false // 确保isReading也被重置
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
        outOfAreaCount: 0 // 重置超出区域计数
      });

      this.getLocationAndUpdate();
      
      // 同时开始动作识别
      this.startActionRecognition();

      const intervalId = setInterval(this.getLocationAndUpdate.bind(this), TRACKING_INTERVAL);
      this.setData({ intervalId: intervalId });
      
      // 显示启动成功提示
      wx.showToast({
        title: '监测已启动',
        icon: 'success',
        duration: 1500
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

        let markers = that.data.markers;
        let polyline = that.data.polyline;

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

        // 更新数据
        that.setData({
          latitude: latitude,
          longitude: longitude,
          markers: markers,
          polyline: polyline
        });
        
        // 检查是否超出区域
        that.checkIfOutOfArea(latitude, longitude);
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
    // 初始化音频
    this.audioCtx = wx.createInnerAudioContext();
    this.audioCtx.src = '/OK.m4a';
    
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
      peakIndices: []
    });
    
    console.log('页面卸载，资源已释放');
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
        // 重置步数相关数据
        stepCount: 0,
        accNormValues: [],
        accTimestamps: [],
        peakIndices: [],
        lastStepTime: new Date().getTime()
      });
      
      // 开始收集传感器数据
      this.startAccelerometer(accXs, accYs, accZs);
      this.startGyroscope(gyrXs, gyrYs, gyrZs);
      
      // 设置定时提交数据
      this.submitTimer = setInterval(this.submit.bind(this), SUBMIT_INTERVAL);
      
      // 添加定期清理计时器，每分钟执行一次
      this.cleanupTimer = setInterval(this.cleanupOldData.bind(this), 60000);
      
      // 添加定期更新步数的计时器
      this.stepDetectionTimer = setInterval(this.detectSteps.bind(this), STEP_UPDATE_INTERVAL);
      
      console.log('动作识别已开启');
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
    
    const { accXs, accYs, accZs, gyrXs, gyrYs, gyrZs, accNormValues, accTimestamps } = this.data;
    
    // 如果数据量超过了我们需要的2倍，则清理掉旧数据
    if (accXs.length > SAMPLE_SIZE * 2) {
      console.log('执行定期数据清理，清理前长度:', accXs.length);
      
      // 仅保留最新的数据
      const newAccXs = accXs.slice(-SAMPLE_SIZE * 2);
      const newAccYs = accYs.slice(-SAMPLE_SIZE * 2);
      const newAccZs = accZs.slice(-SAMPLE_SIZE * 2);
      const newGyrXs = gyrXs.slice(-SAMPLE_SIZE * 2);
      const newGyrYs = gyrYs.slice(-SAMPLE_SIZE * 2);
      const newGyrZs = gyrZs.slice(-SAMPLE_SIZE * 2);
      
      // 同时清理计步相关数据，仅保留最新的1000个点
      const MAX_STEP_DATA_POINTS = 1000;
      const newAccNormValues = accNormValues.length > MAX_STEP_DATA_POINTS 
        ? accNormValues.slice(-MAX_STEP_DATA_POINTS) 
        : accNormValues;
      const newAccTimestamps = accTimestamps.length > MAX_STEP_DATA_POINTS 
        ? accTimestamps.slice(-MAX_STEP_DATA_POINTS) 
        : accTimestamps;
      
      this.setData({
        accXs: newAccXs,
        accYs: newAccYs,
        accZs: newAccZs,
        gyrXs: newGyrXs,
        gyrYs: newGyrYs,
        gyrZs: newGyrZs,
        accNormValues: newAccNormValues,
        accTimestamps: newAccTimestamps
      });
      
      console.log('数据清理完成，清理后长度:', newAccXs.length);
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
    
    const { accNormValues, accTimestamps } = this.data;
    
    // 滑动平均滤波
    const filteredValues = this.movingAverageFilter(accNormValues, MOVING_AVERAGE_WINDOW);
    
    // 峰值检测
    const results = this.detectPeaks(
      filteredValues, 
      accTimestamps, 
      SAMPLE_RATE, 
      PEAK_THRESHOLD, 
      MIN_PEAK_DISTANCE_S
    );
    
    this.setData({
      stepCount: results.stepCount,
      peakIndices: results.peakIndices
    });
    
    console.log('当前检测到步数：', results.stepCount);
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
  
  // 峰值检测
  detectPeaks: function(accNorm, timestamps, sampleRate, threshold = 0.2, minPeakDistanceS = 0.25) {
    const minPeakDistance = Math.floor(minPeakDistanceS * sampleRate);
    let stepCount = 0;
    const peakIndices = [];

    let lastPeak = -9999;

    for (let i = 1; i < accNorm.length - 1; i++) {
      // 简易极大值判定
      if (accNorm[i] > threshold &&
          accNorm[i] > accNorm[i - 1] &&
          accNorm[i] > accNorm[i + 1]) {

        if ((i - lastPeak) > minPeakDistance) {
          stepCount++;
          peakIndices.push(i);
          lastPeak = i;
        }
      }
    }

    return {
      stepCount,
      peakIndices
    };
  }
})
