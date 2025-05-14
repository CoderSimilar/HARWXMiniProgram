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
    polyline: [{ // 用户轨迹线
      points: [],
      color: Constants.POLYLINE_COLOR,
      width: Constants.POLYLINE_WIDTH,
      dottedLine: false
    }],
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
    isSyncing: false, // 同步锁，防止并发同步
    preciseFencePoints: [],
    isRecordingFence: false,
    hasSetPreciseFence: false,
    preciseFence: null,
    fencePolyline: [{ // 围栏线
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
    originalPathPolyline: [], // 原始路径线条
    displayPolylines: [], // 用于显示的所有线条
    displayMarkers: [], // 用于显示的所有标记点
    isManualFencing: false, // 是否为手动设置围栏模式
  },

  // 页面加载
  onLoad: function () {
    // 在这里初始化 timers 对象
    this.timers = {
      location: null,
      stepDetection: null,
      stepStats: null,
      dataSave: null,
      sync: null,
      actionSubmit: null,
      cleanup: null,
      networkCheck: null,
      fenceRecording: null // 添加围栏记录定时器
    };

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
  onShow: function () {
    // 如果正在跟踪，恢复传感器和定时器
    if (this.data.tracking) {
      this.startAllSensorsAndTimers();
    }

    // 确保围栏显示
    if (this.data.hasSetPreciseFence && this.data.preciseFence) {
      this.renderPreciseFence();
    }

    // 重新渲染地图
    this.updateMapDisplay();
  },

  // 页面隐藏
  onHide: function () {
    // 停止传感器，但保持定时器运行
    if (this.data.tracking) {
      SensorManager.stopAllSensors();
    }
  },

  // 页面卸载
  onUnload: function () {
    // 如果正在跟踪，先同步最终数据
    if (this.data.tracking) {
      // 保存缓存数据
      DataManager.saveCacheData(this);

      // 尝试同步
      if (this.data.isOnline) {
        DataManager.syncDataWithServer(this);
      }

      // 停止所有传感器和定时器
      this.stopAllSensorsAndTimers();

      // 更新跟踪状态
      this.setData({
        tracking: false
      });
    }

    // 清空缓存和轨迹数据
    this.resetTrackingData();

    console.log('页面已卸载，所有功能已停止');
  },

  // ========= 位置相关函数 =========

  // 获取位置
  getLocation: function () {
    LocationManager.getCurrentLocation(this);
  },

  // 开始或停止跟踪
  toggleTracking: function () {
    if (this.data.tracking) {
      // 停止跟踪，但不清除轨迹数据
      this.stopTracking(false); // 传入 false 表示不重置数据

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
  startTracking: function () {
    // 设置状态
    this.setData({
      tracking: true,
      isReading: true,
      startTime: new Date().getTime(),
      // 确保 polyline 正确初始化
      polyline: [{
        points: [],
        color: Constants.POLYLINE_COLOR,
        width: Constants.POLYLINE_WIDTH,
        dottedLine: false
      }]
    });

    // 启动位置更新，包括后台位置
    LocationManager.initLocationTracking(this);

    // 启动所有传感器和定时器
    this.startAllSensorsAndTimers();

    // 更新地图显示
    this.updateMapDisplay();

    wx.showToast({
      title: '监测已开始',
      icon: 'success',
      duration: Constants.TOAST_DURATION
    });
  },

  // 停止跟踪
  stopTracking: function (resetData = false) {
    // 停止位置更新
    LocationManager.stopLocationUpdates();

    // 停止所有传感器和定时器
    this.stopAllSensorsAndTimers();

    // 在停止之前保存当前缓存数据
    DataManager.saveCacheData(this);

    // 更新状态，但保留轨迹数据
    this.setData({
      tracking: false,
      isReading: false
    });

    // 更新地图显示
    this.updateMapDisplay();

    // 只有在明确要求时才重置数据
    if (resetData) {
      this.resetTrackingData();
    }
  },

  // 启动所有传感器和定时器
  startAllSensorsAndTimers: function () {
    // 启动动作识别传感器
    ActionManager.startActionSensors(this);

    // 启动步数检测
    StepManager.startStepDetection(this);

    // 启动所有定时器
    TimerManager.startAllTimers(this);
  },

  // 开始设置区域
  startSettingArea: function () {
    LocationManager.startSettingArea(this);
  },

  // 确认设置区域
  confirmArea: function () {
    LocationManager.confirmArea(this);
  },

  // 取消设置区域
  cancelArea: function () {
    LocationManager.cancelArea(this);
  },

  // 增加区域半径
  increaseRadius: function () {
    LocationManager.adjustRadius(this, true);
  },

  // 减少区域半径
  decreaseRadius: function () {
    LocationManager.adjustRadius(this, false);
  },

  // 切换围栏设置模式
  toggleFencingMode: function () {
    const newMode = !this.data.isManualFencing;

    // 切换模式时清空已记录的点
    this.setData({
      isManualFencing: newMode,
      preciseFencePoints: [],
      fenceMarkers: [],
      fencePolyline: [{
        points: [],
        color: Constants.FENCE_COLOR,
        width: Constants.FENCE_WIDTH,
        dottedLine: false
      }]
    });

    // 更新地图显示
    this.updateMapDisplay();

    // 如果切换到手动模式，停止位置更新
    if (newMode) {
      LocationManager.stopLocationUpdates();
    } else {
      // 如果切换到轨迹记录模式，重新开始位置更新
      wx.startLocationUpdate({
        success: () => {
          console.log('位置更新已启动');
          // 启动位置变化监听
          wx.onLocationChange((res) => {
            if (!this.data.isManualFencing && this.data.isRecordingFence) {
              this.addFencePointFromLocation(res);
            }
          });
        },
        fail: (err) => {
          console.error('位置更新启动失败:', err);
          wx.showToast({
            title: '位置更新启动失败',
            icon: 'none'
          });
        }
      });
    }
  },

  // 添加从位置更新获取的围栏点
  addFencePointFromLocation: function (res) {
    const {
      latitude,
      longitude
    } = res;
    let preciseFencePoints = [...this.data.preciseFencePoints];

    // 如果是第一个点，或者与上一个点的距离超过最小距离，则添加新点
    if (preciseFencePoints.length === 0 ||
      LocationManager.calculateDistance(
        preciseFencePoints[preciseFencePoints.length - 1].latitude,
        preciseFencePoints[preciseFencePoints.length - 1].longitude,
        latitude,
        longitude
      ) >= Constants.MIN_FENCE_POINT_DISTANCE
    ) {
      // 添加新的围栏点
      preciseFencePoints.push({
        latitude,
        longitude
      });

      // 创建围栏标记
      const fenceMarkers = preciseFencePoints.map((point, index) => ({
        id: `fence_${index}`,
        latitude: point.latitude,
        longitude: point.longitude,
        width: Constants.FENCE_MARKER_SIZE,
        height: Constants.FENCE_MARKER_SIZE,
        iconPath: Constants.FENCE_MARKER_ICON,
        callout: {
          content: `围栏点 ${index + 1}`,
          color: '#000000',
          fontSize: 10,
          borderRadius: 5,
          bgColor: '#ffffff',
          padding: 5,
          display: 'ALWAYS'
        }
      }));

      // 更新围栏线
      const fencePolyline = [{
        points: preciseFencePoints,
        color: Constants.FENCE_COLOR,
        width: Constants.FENCE_WIDTH,
        dottedLine: false
      }];

      this.setData({
        preciseFencePoints,
        fenceMarkers,
        fencePolyline
      });

      // 更新地图显示
      this.updateMapDisplay();

      console.log('自动添加围栏点:', latitude, longitude, '当前点数:', preciseFencePoints.length);
    }
  },

  // 修改地图点击事件处理
  onMapTap: function (e) {
    if (this.data.isRecordingFence && this.data.isManualFencing) {
      const {
        latitude,
        longitude
      } = e.detail;
      let preciseFencePoints = [...this.data.preciseFencePoints];

      // 如果是第一个点，或者与上一个点的距离超过最小距离，则添加新点
      // 添加新的围栏点
      preciseFencePoints.push({
        latitude,
        longitude
      });

      // 创建围栏标记
      const fenceMarkers = preciseFencePoints.map((point, index) => ({
        id: `fence_${index}`,
        latitude: point.latitude,
        longitude: point.longitude,
        width: Constants.FENCE_MARKER_SIZE,
        height: Constants.FENCE_MARKER_SIZE,
        iconPath: Constants.FENCE_MARKER_ICON,
        callout: {
          content: `围栏点 ${index + 1}`,
          color: '#000000',
          fontSize: 10,
          borderRadius: 5,
          bgColor: '#ffffff',
          padding: 5,
          display: 'ALWAYS'
        }
      }));

      // 更新围栏线
      const fencePolyline = [{
        points: preciseFencePoints,
        color: Constants.FENCE_COLOR,
        width: Constants.FENCE_WIDTH,
        dottedLine: false
      }];

      this.setData({
        preciseFencePoints,
        fenceMarkers,
        fencePolyline
      });

      // 更新地图显示
      this.updateMapDisplay();

      console.log('手动添加围栏点:', latitude, longitude, '当前点数:', preciseFencePoints.length);
    }
  },

  // 滑块改变事件
  onRadiusSliderChange: function (e) {
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
  clearAllData: function () {
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
  manualSync: function () {
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

  // 修改开始记录精准电子围栏的方法
  startRecordingPreciseFence: function () {
    // 默认从手动模式开始
    this.setData({
      isManualFencing: true,
      isRecordingFence: true,
      preciseFencePoints: [],
      fenceMarkers: [],
      fencePolyline: [{
        points: [],
        color: Constants.FENCE_COLOR,
        width: Constants.FENCE_WIDTH,
        dottedLine: false
      }]
    });

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
          } else {
            // 取消设置围栏
            this.cancelPreciseFence();
          }
        }
      });
    }

    // 更新地图显示
    this.updateMapDisplay();
  },

  // 完成精准电子围栏设置
  finishPreciseFence: function () {
    LocationManager.finishPreciseFence(this);
  },

  // 取消精准电子围栏设置
  cancelPreciseFence: function () {
    LocationManager.cancelPreciseFence(this);
  },

  // 修改围栏缓冲区大小
  adjustFenceBuffer: function (e) {
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
  clearPreciseFence: function () {
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

  // 重置所有缓存和状态
  resetTrackingData: function () {
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
      lastWarningTime: 0,
      // 重置围栏相关数据
      fenceMarkers: [],
      originalPathPolyline: []
    });

    console.log('所有跟踪数据已重置');
  },

  // 更新地图显示
  updateMapDisplay: function () {
    let displayPolylines = [];
    let displayMarkers = [];

    if (this.data.isRecordingFence) {
      // 记录围栏模式
      displayPolylines = this.data.fencePolyline;
      displayMarkers = this.data.markers.concat(this.data.fenceMarkers);
    } else if (this.data.hasSetPreciseFence) {
      // 已设置围栏模式，显示轨迹线和围栏线
      displayPolylines = [
        // 用户轨迹线
        {
          points: this.data.polyline[0]?.points || [],
          color: Constants.POLYLINE_COLOR,
          width: Constants.POLYLINE_WIDTH,
          dottedLine: false
        },
        // 围栏线
        {
          points: this.data.preciseFence?.originalPoints || [],
          color: Constants.FENCE_COLOR,
          width: Constants.FENCE_WIDTH,
          dottedLine: true
        }
      ];
      // 同时显示轨迹标记和围栏标记点
      displayMarkers = this.data.markers.concat(this.data.fenceMarkers);
    } else {
      // 普通模式
      displayPolylines = this.data.polyline;
      displayMarkers = this.data.markers;
    }

    // 更新显示数据
    this.setData({
      displayPolylines: displayPolylines,
      displayMarkers: displayMarkers
    });
  },

  // 停止所有传感器和定时器
  stopAllSensorsAndTimers: function () {
    // 停止所有传感器
    SensorManager.stopAllSensors();

    // 停止所有定时器
    TimerManager.stopAllTimers(this);

    // 设置状态
    this.setData({
      isReading: false
    });

    console.log('所有传感器和定时器已停止');
  },
  // 渲染精准电子围栏
  renderPreciseFence: function () {
    if (!this.data.preciseFence) return;

    // 设置围栏线条
    const fencePolyline = [{
      points: this.data.preciseFence.bufferPoints || [],
      color: Constants.FENCE_COLOR,
      width: Constants.FENCE_WIDTH,
      dottedLine: false
    }];

    // 设置原始路径线条
    const originalPathPolyline = [{
      points: this.data.preciseFence.originalPoints || [],
      color: Constants.FENCE_ORIGINAL_COLOR,
      width: Constants.FENCE_WIDTH - 1,
      dottedLine: true
    }];

    // 更新数据
    this.setData({
      fencePolyline: fencePolyline,
      originalPathPolyline: originalPathPolyline,
      fenceMarkers: this.data.fenceMarkers
    });

    // 更新地图显示
    this.updateMapDisplay();
  }
});