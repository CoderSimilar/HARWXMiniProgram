// 导入拆分后的模块
import * as Constants from './config/constants.js'
import LocationManager from './services/location-manager.js'
import StepManager from './services/step-manager.js'
import ActionManager from './services/action-manager.js'
import DataManager from './services/data-manager.js'
import TimerManager from './services/timer-manager.js'
import SensorManager from './services/sensor-manager.js'
import PolygonFenceService from './services/polygon-fence-service.js'

Page({
  data: {
    // 位置相关
    latitude: '',
    longitude: '',
    markers: [],
    polyline: [],
    tracking: false,
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
    actionSequence: [],
    startTime: 0,
    // 步数统计相关
    stepCount: 0,
    lastMinuteStepCount: 0,
    showStepChart: false,
    // 离线数据缓存相关
    cachedLocationData: [],
    cachedStepsData: [],
    isOnline: true,
    lastSyncTime: 0,
    lastSyncedLocationIndex: 0,
    lastSyncedStepsIndex: 0,
    isSyncing: false,  // 同步锁，防止并发同步
    preciseFencePoints: [],
    isRecordingFence: false,
    hasSetPreciseFence: false,
    preciseFence: null,
    fencePolyline: [{
      points: [],
      color: Constants.FENCE_COLOR,
      width: Constants.FENCE_WIDTH,
      dottedLine: false
    }],
    polygon: [],
    preciseFenceBuffer: Constants.DEFAULT_FENCE_BUFFER,
    tempCircles: null,
    includePoints: [],
    fenceMarkers: [], // 围栏点位标记
    originalPathPolyline: [] // 原始路径线条
  },
  
  // 定时器管理对象
  timers: {
    location: null,
    stepDetection: null,
    stepStats: null,
    dataSave: null,
    sync: null,
    actionSubmit: null,
    cleanup: null,
    networkCheck: null
  },
  
  // 传感器数据对象 - 在相应模块中初始化
  stepDetector: null,
  actionData: null,
  
  // ========= 生命周期函数 =========
  
  // 页面加载
  onLoad: function() {
    // 初始化空轨迹
    this.setData({
      action_counts: {},
      polyline: [{
        points: [],
        color: Constants.POLYLINE_COLOR,
        width: Constants.POLYLINE_WIDTH,
        dottedLine: false
      }]
    });
    
    // 检查网络状态
    DataManager.checkNetworkStatus(this);
    
    // 加载缓存数据
    DataManager.loadCachedData(this);
    
    console.log('页面加载完成');
  },
  
  // 页面显示
  onShow: function() {
    // 如果正在跟踪，恢复传感器和定时器
    if (this.data.tracking) {
      this.startAllSensorsAndTimers();
    }
    
    // 重新渲染地图
    this.updateMapDisplay();
  },
  
  // 页面隐藏
  onHide: function() {
    // 停止传感器，但保持定时器运行
    if (this.data.tracking) {
      SensorManager.stopAllSensors();
    }
  },
  
  // 页面卸载
  onUnload: function() {
    // 如果正在跟踪，先同步最终数据
    if (this.data.tracking) {
      // 保存缓存数据
      DataManager.saveCachedData(this);
      
      // 尝试同步
      if (this.data.isOnline) {
        DataManager.syncDataWithServer(this);
      }
      
      // 停止所有传感器和定时器
      this.stopTrackingAndSensors();
      
      // 清空缓存
      this.resetTrackingData();
    }
    
    console.log('页面已卸载，所有功能已停止');
  },
  
  // ========= 位置相关函数 =========
  
  // 获取位置
  getLocation: function() {
    LocationManager.getCurrentLocation(this);
  },
  
  // 开始或停止跟踪
  toggleTracking: function() {
    if (this.data.tracking) {
      // 停止跟踪
      this.stopTracking();
      
      // 直接删除本地存储的缓存键
      wx.removeStorage({
        key: Constants.STORAGE_KEY_LOCATION,
        success: () => console.log('位置缓存已清除')
      });
      
      wx.removeStorage({
        key: Constants.STORAGE_KEY_STEPS,
        success: () => console.log('步数缓存已清除')
      });
      
      // 确保清空内存中的数据
      this.resetTrackingData();
      
      wx.showToast({
        title: '监测已停止',
        icon: 'success',
        duration: Constants.TOAST_DURATION
      });
    } else {
      // 开始跟踪
      this.startTracking();
    }
  },
  
  // 开始跟踪
  startTracking: function() {
    // 设置状态
    this.setData({
      tracking: true,
      isReading: true,
      startTime: new Date().getTime()
    });
    
    // 启动所有传感器和定时器
    this.startAllSensorsAndTimers();
    
    wx.showToast({
      title: '监测已开始',
      icon: 'success',
      duration: Constants.TOAST_DURATION
    });
  },
  
  // 停止跟踪
  stopTracking: function() {
    // 停止所有传感器和定时器
    SensorManager.stopAllSensors();
    TimerManager.stopAllTimers(this);
    
    // 保存数据并尝试最终同步
    DataManager.saveDataToStorage(this);
    
    // 尝试同步数据到服务器
    if (this.data.isOnline) {
      DataManager.syncDataWithServer(this, true);
    }
    
    // 清空内存中的缓存数据
    this.resetTrackingData();
    
    this.setData({
      tracking: false,
      isReading: false
    });
  },
  
  // 启动所有传感器和定时器
  startAllSensorsAndTimers: function() {
    // 启动动作识别传感器
    ActionManager.startActionSensors(this);
    
    // 启动步数检测
    StepManager.startStepDetection(this);
    
    // 启动所有定时器
    TimerManager.startAllTimers(this);
  },
  
  // 开始设置区域
  startSettingArea: function() {
    LocationManager.startSettingArea(this);
  },
  
  // 确认设置区域
  confirmArea: function() {
    LocationManager.confirmArea(this);
  },
  
  // 取消设置区域
  cancelArea: function() {
    LocationManager.cancelArea(this);
  },
  
  // 增加区域半径
  increaseRadius: function() {
    LocationManager.adjustRadius(this, true);
  },
  
  // 减少区域半径
  decreaseRadius: function() {
    LocationManager.adjustRadius(this, false);
  },
  
  // 地图点击事件，简化围栏点位添加逻辑，保持与轨迹点位一致
  onMapTap: function(e) {
    const { latitude, longitude } = e.detail;
    
    if (this.data.isSettingArea) {
      // 设置圆形区域部分不变...
    } else if (this.data.isRecordingFence) {
      // 添加围栏点，更接近轨迹记录逻辑
      const preciseFencePoints = [...this.data.preciseFencePoints];
      
      // 避免重复添加距离很近的点
      const lastPoint = preciseFencePoints.length > 0 ? 
        preciseFencePoints[preciseFencePoints.length - 1] : null;
      
      if (lastPoint) {
        // 使用PolygonFenceService计算距离
        const distanceFromLast = PolygonFenceService.calculateHaversineDistance(
          lastPoint.latitude, lastPoint.longitude, latitude, longitude);
        
        // 如果与上一个点距离太近（小于2米），则不添加
        if (distanceFromLast < 2) {
          console.log('忽略距离太近的点', distanceFromLast);
          return;
        }
      }
      
      preciseFencePoints.push({ latitude, longitude });
      
      // 使用PolygonFenceService生成可视化元素，保持与轨迹记录一致的风格
      const fencePolyline = PolygonFenceService.createFencePolyline(preciseFencePoints);
      const fenceMarkers = PolygonFenceService.createFenceMarkers(preciseFencePoints);
      
      this.setData({
        preciseFencePoints,
        fencePolyline,
        fenceMarkers
      });
      
      console.log('手动添加围栏点:', latitude, longitude, '当前点数:', preciseFencePoints.length);
    }
  },
  
  // 滑块改变事件
  onRadiusSliderChange: function(e) {
    if (!this.data.isSettingArea && !this.data.hasSetArea) return;
    
    const newRadius = e.detail.value;
    const circles = [{
      ...this.data.circles[0],
      radius: newRadius
    }];
    
    this.setData({
      areaRadius: newRadius,
      circles: circles
    });
  },
  
  // ========= 数据管理功能 =========
  
  // 清空所有数据
  clearAllData: function() {
    wx.showModal({
      title: '确认清除数据',
      content: '这将清除所有位置和步数数据，请确认操作',
      success: (res) => {
        if (res.confirm) {
          DataManager.clearAllData(this, true);
        }
      }
    });
  },
  
  // 手动同步数据
  manualSync: function() {
    if (!this.data.isOnline) {
      wx.showToast({
        title: '当前网络不可用',
        icon: 'none',
        duration: Constants.TOAST_DURATION
      });
      return;
    }
    
    DataManager.syncDataWithServer(this);
  },
  
  // 开始记录精准电子围栏
  startRecordingPreciseFence: function() {
    // 如果正在跟踪，提示用户
    if (this.data.tracking) {
      wx.showModal({
        title: '提示',
        content: '记录围栏期间将暂停位置跟踪，是否继续？',
        success: (res) => {
          if (res.confirm) {
            // 临时保存当前跟踪状态
            this.data._trackingBeforeFence = true;
            // 停止跟踪但不重置数据
            this.stopTracking(false);
            // 开始记录围栏
            LocationManager.startRecordingPreciseFence(this);
          }
        }
      });
    } else {
      LocationManager.startRecordingPreciseFence(this);
    }
  },
  
  // 完成精准电子围栏设置
  finishPreciseFence: function() {
    LocationManager.finishPreciseFence(this);
  },
  
  // 取消精准电子围栏设置
  cancelPreciseFence: function() {
    LocationManager.cancelPreciseFence(this);
  },
  
  // 修改围栏缓冲区大小
  adjustFenceBuffer: function(e) {
    const newBuffer = e.detail.value;
    this.setData({
      preciseFenceBuffer: newBuffer
    });
    
    // 如果已设置围栏，更新缓冲区
    if (this.data.hasSetPreciseFence && this.data.preciseFence) {
      const bufferedPoints = PolygonFenceService.createBufferZone(
        this.data.preciseFence.originalPoints,
        newBuffer
      );
      
      const polygon = [{
        points: bufferedPoints,
        strokeWidth: Constants.FENCE_STROKE_WIDTH,
        strokeColor: Constants.FENCE_COLOR,
        fillColor: Constants.FENCE_FILL_COLOR
      }];
      
      this.setData({
        'preciseFence.bufferedPoints': bufferedPoints,
        polygon: polygon
      });
    }
  },
  
  // 清除精准围栏
  clearPreciseFence: function() {
    wx.showModal({
      title: '清除精准围栏',
      content: '确定要清除当前设置的精准电子围栏吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            hasSetPreciseFence: false,
            preciseFence: null,
            preciseFencePoints: [],
            fencePolyline: [{
              points: [],
              color: Constants.FENCE_COLOR,
              width: Constants.FENCE_WIDTH,
              dottedLine: false
            }],
            fenceMarkers: [],
            originalPathPolyline: [],
            polygon: []
          });
          
          wx.showToast({
            title: '已清除精准围栏',
            icon: 'success',
            duration: 2000
          });
        }
      }
    });
  },
  
  // 添加一个新方法用于重置所有缓存和状态
  resetTrackingData: function() {
    // 初始化空轨迹和标记
    this.setData({
      markers: [],
      polyline: [{
        points: [],
        color: Constants.POLYLINE_COLOR,
        width: Constants.POLYLINE_WIDTH,
        dottedLine: false
      }],
      cachedLocationData: [],
      cachedStepsData: [],
      stepCount: 0,
      action_counts: {},
      current_action: '暂无',
      lastMinuteStepCount: 0,
      actionSequence: [],
      outOfAreaCount: 0,
      lastSyncedLocationIndex: 0,
      lastSyncedStepsIndex: 0,
      lastWarningTime: 0
    });
    
    // 直接清除本地存储
    wx.removeStorage({
      key: Constants.STORAGE_KEY_LOCATION,
      success: () => console.log('位置缓存已清除')
    });
    
    wx.removeStorage({
      key: Constants.STORAGE_KEY_STEPS,
      success: () => console.log('步数缓存已清除')
    });
    
    console.log('所有跟踪数据已重置');
  },
  
  // 计算用于显示的折线
  getDisplayPolyline: function() {
    if (this.data.isRecordingFence) {
      // 记录围栏时只显示围栏线
      return this.data.fencePolyline;
    } else if (this.data.hasSetPreciseFence) {
      // 已设置围栏时，显示围栏线和轨迹线
      return this.data.originalPathPolyline.concat(this.data.polyline);
    }
    // 普通情况下显示轨迹线
    return this.data.polyline;
  },
  
  // 计算用于显示的标记
  getDisplayMarkers: function() {
    if (this.data.isRecordingFence) {
      // 记录围栏时只显示围栏标记
      return this.data.fenceMarkers;
    } else if (this.data.hasSetPreciseFence) {
      // 已设置围栏时，只显示轨迹标记，不显示围栏标记
      return this.data.markers;
    }
    // 普通情况下显示轨迹标记
    return this.data.markers;
  },
  
  // 添加一个方法用于更新地图显示
  updateMapDisplay: function() {
    // 确保地图组件正确显示
    if (this.data.isRecordingFence) {
      // 在记录围栏模式下，确保围栏点位和线条可见
      this.setData({
        // 主地图显示当前轨迹
        polyline: this.data.polyline,
        markers: this.data.markers,
        // 确保围栏地图显示围栏数据
        fencePolyline: this.data.fencePolyline,
        fenceMarkers: this.data.fenceMarkers
      });
    } else if (this.data.hasSetPreciseFence) {
      // 已设置围栏模式下
      this.setData({
        // 主地图显示轨迹
        polyline: this.data.polyline,
        markers: this.data.markers,
        // 围栏地图显示围栏线条，但不显示围栏点位
        originalPathPolyline: this.data.originalPathPolyline,
        fenceMarkers: []  // 清空围栏点位标记
      });
    } else {
      // 普通模式下只显示轨迹
      this.setData({
        polyline: this.data.polyline,
        markers: this.data.markers
      });
    }
  }
});
