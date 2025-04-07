import * as Constants from '../config/constants.js'
import * as LocationService from './location-service.js'
import PolygonFenceService from './polygon-fence-service.js'

/**
 * 位置管理模块 - 提供位置跟踪、地图标记和电子围栏功能
 */
const LocationManager = {
  // 获取当前位置 - 改用位置监听方式
  getCurrentLocation: function(page) {
    wx.showLoading({
      title: '获取位置中...',
    });
    
    // 通过注册一次性位置变化事件获取当前位置
    const locationChangeFn = res => {
      wx.hideLoading();
      page.setData({
        latitude: res.latitude,
        longitude: res.longitude,
        mapVisible: true,
        scale: Constants.DEFAULT_SCALE,
      });
      
      // 获取到位置后取消监听
      wx.offLocationChange(locationChangeFn);
    };
    
    // 开始监听位置变化
    wx.startLocationUpdate({
      success: () => {
        wx.onLocationChange(locationChangeFn);
      },
      fail: (err) => {
        wx.hideLoading();
        console.error("启动位置更新失败:", err);
        wx.showToast({
          title: '获取位置失败',
          icon: 'none',
          duration: Constants.TOAST_DURATION
        });
      }
    });
  },
  
  // 获取位置并更新轨迹
  updateLocationTrack: function(page) {
    wx.startLocationUpdateBackground()({
      type: Constants.LOCATION_TYPE,
      success(res) {
        const latitude = res.latitude;
        const longitude = res.longitude;
        const timestamp = new Date().getTime();

        let markers = page.data.markers;
        let polyline = page.data.polyline;
        let cachedLocationData = page.data.cachedLocationData;

        // 添加标记 - 根据用户当前动作选择不同的标记图标
        const currentAction = page.data.current_action || '暂无';
        
        // 获取动作对应的标记配置，如果没有匹配的配置则使用默认配置
        const markerConfig = Constants.ACTION_MARKERS[currentAction] || Constants.ACTION_MARKERS['default'];
        
        // 创建标记，添加动作信息
        const marker = {
          id: markers.length,
          latitude: latitude,
          longitude: longitude,
          iconPath: markerConfig.iconPath,
          width: markerConfig.width,
          height: markerConfig.height,
          callout: {
            content: currentAction,
            color: '#000000',
            fontSize: 10,
            borderRadius: 5,
            bgColor: '#ffffff',
            padding: 5,
            display: 'ALWAYS'
          }
        };
        
        markers.push(marker);

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
          timestamp: timestamp,
          action: currentAction // 同时存储当前动作类型
        });
        
        // 限制缓存数据大小
        if (cachedLocationData.length > Constants.MAX_CACHE_ITEMS) {
          cachedLocationData = cachedLocationData.slice(-Constants.MAX_CACHE_ITEMS);
        }

        // 更新数据
        page.setData({
          latitude: latitude,
          longitude: longitude,
          markers: markers,
          polyline: polyline,
          cachedLocationData: cachedLocationData
        });
        
        // 检查是否超出区域
        if (page.data.hasSetArea) {
          LocationManager.checkIfOutOfArea(page, latitude, longitude);
        }
        
        // 检查是否超出精准围栏
        if (page.data.hasSetPreciseFence) {
          LocationManager.checkIfOutOfPreciseFence(page, latitude, longitude);
        }
        
        console.log('位置轨迹已更新，当前位置:', latitude, longitude, '当前动作:', currentAction);
        
        // 确保更新地图显示
        if (typeof page.updateMapDisplay === 'function') {
          page.updateMapDisplay();
        }
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
  
  // 开始设置区域 - 使用最新位置
  startSettingArea: function(page) {
    if (!page.data.latitude || !page.data.longitude) {
      wx.showToast({
        title: '等待位置信息...',
        icon: 'loading',
        duration: 2000
      });
      return;
    }
    
    // 使用当前位置作为圆心
    const circles = [{
      latitude: page.data.latitude,
      longitude: page.data.longitude,
      color: Constants.CIRCLE_COLOR,
      fillColor: Constants.CIRCLE_FILL_COLOR,
      radius: page.data.areaRadius,
      strokeWidth: Constants.CIRCLE_STROKE_WIDTH
    }];
    
    page.setData({
      isSettingArea: true,
      areaCenter: {
        latitude: page.data.latitude,
        longitude: page.data.longitude
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
  
  // 确认设置区域
  confirmArea: function(page) {
    page.setData({
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
  cancelArea: function(page) {
    page.setData({
      isSettingArea: false,
      circles: page.data.hasSetArea ? page.data.circles : [],
      outOfAreaCount: 0 // 重置超出区域计数
    });
  },
  
  // 调整区域半径
  adjustRadius: function(page, isIncrease) {
    if (!page.data.isSettingArea && !page.data.hasSetArea) return;
    
    let newRadius;
    if (isIncrease) {
      newRadius = Math.min(Constants.MAX_RADIUS, page.data.areaRadius + Constants.RADIUS_STEP);
    } else {
      newRadius = Math.max(Constants.MIN_RADIUS, page.data.areaRadius - Constants.RADIUS_STEP);
    }
    
    const circles = [{
      ...page.data.circles[0],
      radius: newRadius
    }];
    
    page.setData({
      areaRadius: newRadius,
      circles: circles
    });
  },
  
  // 检查是否超出区域
  checkIfOutOfArea: function(page, latitude, longitude) {
    if (!page.data.hasSetArea || !page.data.areaCenter) return;
    
    const distance = LocationService.calculateDistance(
      latitude, 
      longitude, 
      page.data.areaCenter.latitude, 
      page.data.areaCenter.longitude
    );
    
    const isOutOfArea = distance > page.data.areaRadius;
    const currentTime = new Date().getTime();
    
    if (isOutOfArea) {
      // 增加超出区域计数
      const newCount = page.data.outOfAreaCount + 1;
      page.setData({ outOfAreaCount: newCount });
      
      // 检查是否达到警告阈值 & 是否超过冷却时间
      if (newCount >= Constants.OUT_OF_AREA_THRESHOLD && 
          currentTime - page.data.lastWarningTime > Constants.WARNING_COOLDOWN) {
        // 发出警告
        wx.showModal({
          title: '超出活动范围警告',
          content: `您已超出设定的活动范围${newCount}次，请注意安全！`,
          showCancel: false,
          success: () => {
            // 更新最后警告时间
            page.setData({ lastWarningTime: currentTime });
          }
        });
        
        // 可选：播放警告声音
        const innerAudioContext = wx.createInnerAudioContext();
        innerAudioContext.src = '/assets/warning.mp3'; // 假设有警告音频文件
        innerAudioContext.play();
      }
      
      console.log(`超出活动范围: 距离圆心${distance.toFixed(2)}米，超出${(distance - page.data.areaRadius).toFixed(2)}米`);
    } else {
      // 如果返回区域内，重置计数
      if (page.data.outOfAreaCount > 0) {
        page.setData({ outOfAreaCount: 0 });
        console.log('已返回活动范围内');
      }
    }
  },
  
  // 开始记录精准电子围栏 - 使用当前位置作为起点
  startRecordingPreciseFence: function(page) {
    // 重置状态
    page.setData({
      isRecordingFence: true,
      preciseFencePoints: [],
      preciseFence: null,
      hasSetPreciseFence: false,
      preciseFenceBuffer: Constants.DEFAULT_FENCE_BUFFER,
      fencePolyline: [{
        points: [],
        color: Constants.FENCE_COLOR,
        width: Constants.FENCE_WIDTH,
        dottedLine: false
      }],
      fenceMarkers: [] // 初始化围栏点位标记
    });
    
    // 使用当前位置作为第一个点
    if (page.data.latitude && page.data.longitude) {
      const latitude = page.data.latitude;
      const longitude = page.data.longitude;
      
      // 添加第一个点
      const preciseFencePoints = [{ latitude, longitude }];
      const fencePolyline = [{
        points: [{ latitude, longitude }],
        color: Constants.FENCE_COLOR,
        width: Constants.FENCE_WIDTH,
        dottedLine: false
      }];
      
      // 添加第一个点位标记
      const fenceMarkers = [{
        id: 'fence-0',
        latitude,
        longitude,
        width: Constants.FENCE_MARKER_SIZE,
        height: Constants.FENCE_MARKER_SIZE,
        callout: {
          content: '起点',
          display: 'ALWAYS',
          fontSize: 10,
          color: '#ffffff',
          bgColor: Constants.FENCE_COLOR,
          padding: 2,
          borderRadius: 4
        }
      }];
      
      page.setData({
        preciseFencePoints,
        fencePolyline,
        fenceMarkers
      });
    }
    
    // 如果已经设置了普通圆形围栏，临时隐藏它
    if (page.data.hasSetArea) {
      const tempCircles = [...page.data.circles];
      page.setData({
        tempCircles: tempCircles,
        circles: []
      });
    }
    
    // 启动精准围栏记录定时器 - 不需要再单独获取位置
    page.timers.fenceRecording = setInterval(() => {
      // 此处不再需要主动获取位置
      // 在 handleLocationChange 中处理围栏点记录
      if (page.data.isRecordingFence && page.data.latitude && page.data.longitude) {
        this.addFencePointFromCurrent(page);
      }
    }, Constants.FENCE_RECORDING_INTERVAL);
    
    wx.showToast({
      title: '开始记录精准围栏，请沿边界行走',
      icon: 'none',
      duration: 3000
    });
  },
  
  // 新增：从当前位置添加围栏点
  addFencePointFromCurrent: function(page) {
    const latitude = page.data.latitude;
    const longitude = page.data.longitude;
    
    // 添加到围栏点集
    const preciseFencePoints = [...page.data.preciseFencePoints];
    
    // 避免记录距离太近的点
    const lastPoint = preciseFencePoints.length > 0 ? 
      preciseFencePoints[preciseFencePoints.length - 1] : null;
    
    if (lastPoint) {
      // 使用LocationService计算距离，保持一致性
      const distance = LocationService.calculateDistance(
        lastPoint.latitude, lastPoint.longitude, latitude, longitude);
      
      // 如果距离太近，不记录新点
      if (distance < 2) {
        console.log('自动记录点: 忽略距离太近的点', distance);
        return;
      }
    }
    
    preciseFencePoints.push({ latitude, longitude });
    
    // 更新围栏轨迹线，使用与轨迹记录相同的风格但不同颜色
    const fencePolyline = PolygonFenceService.createFencePolyline(preciseFencePoints);
    const fenceMarkers = PolygonFenceService.createFenceMarkers(preciseFencePoints);
    
    page.setData({
      preciseFencePoints,
      fencePolyline,
      fenceMarkers
    });
    
    console.log('记录精准围栏点:', latitude, longitude, '当前点数:', preciseFencePoints.length);
  },
  
  // 完成精准围栏设置 - 隐藏围栏点位标记
  finishPreciseFence: function(page) {
    // 停止记录定时器
    if (page.timers.fenceRecording) {
      clearInterval(page.timers.fenceRecording);
      page.timers.fenceRecording = null;
    }
    
    // 确保至少有3个点才能形成围栏
    const fencePoints = page.data.preciseFencePoints;
    if (fencePoints.length < 3) {
      wx.showToast({
        title: '至少需要3个点才能形成围栏',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    // 确保闭合
    const closedPoints = PolygonFenceService.closePolygon(fencePoints);
    
    // 创建带缓冲区的围栏
    const bufferDistance = page.data.preciseFenceBuffer;
    const bufferedPoints = PolygonFenceService.createBufferZone(closedPoints, bufferDistance);
    
    // 计算围栏中心点和边界框
    const center = PolygonFenceService.calculatePolygonCenter(fencePoints);
    const boundingBox = PolygonFenceService.calculateBoundingBox(bufferedPoints);
    
    // 创建显示对象
    const polygon = PolygonFenceService.createPolygon(bufferedPoints);
    const originalPathPolyline = PolygonFenceService.createOriginalPathPolyline(closedPoints);
    
    // 计算包含所有点的地图区域
    const includePoints = bufferedPoints.length > 0 ? bufferedPoints : closedPoints;
    
    // 更新状态
    page.setData({
      isRecordingFence: false,
      hasSetPreciseFence: true,
      preciseFence: {
        originalPoints: closedPoints,
        bufferedPoints: bufferedPoints,
        center: center,
        boundingBox: boundingBox
      },
      polygon: polygon,
      originalPathPolyline: originalPathPolyline,
      fenceMarkers: [], // 清空围栏标记，只显示线条和区域
      includePoints: includePoints
    });
    
    // 恢复原有的圆形围栏（如果有）
    if (page.data.tempCircles) {
      page.setData({
        circles: page.data.tempCircles,
        tempCircles: null
      });
    }
    
    // 更新地图显示
    if (typeof page.updateMapDisplay === 'function') {
      page.updateMapDisplay();
    }
    
    wx.showToast({
      title: '精准电子围栏设置成功',
      icon: 'success',
      duration: 2000
    });
  },
  
  // 取消记录精准围栏
  cancelPreciseFence: function(page) {
    // 停止记录定时器
    if (page.timers.fenceRecording) {
      clearInterval(page.timers.fenceRecording);
      page.timers.fenceRecording = null;
    }
    
    // 重置状态
    page.setData({
      isRecordingFence: false,
      preciseFencePoints: [],
      fencePolyline: [{
        points: [],
        color: Constants.FENCE_COLOR,
        width: Constants.FENCE_WIDTH,
        dottedLine: false
      }]
    });
    
    // 恢复原有的圆形围栏（如果有）
    if (page.data.tempCircles) {
      page.setData({
        circles: page.data.tempCircles,
        tempCircles: null
      });
    }
    
    wx.showToast({
      title: '已取消设置精准围栏',
      icon: 'none',
      duration: 2000
    });
  },
  
  // 检查是否超出精准围栏
  checkIfOutOfPreciseFence: function(page, latitude, longitude) {
    if (!page.data.hasSetPreciseFence || !page.data.preciseFence) return false;
    
    // 首先确保有效的 bufferedPoints
    const polygon = page.data.preciseFence.bufferedPoints || [];
    if (!polygon || polygon.length < 3) return false;
    
    const point = { latitude, longitude };
    
    try {
      const isInside = PolygonFenceService.isPointInPolygon(point, polygon);
      const isOutOfArea = !isInside;
      const currentTime = new Date().getTime();
      
      if (isOutOfArea) {
        // 增加超出区域计数
        const newCount = page.data.outOfAreaCount + 1;
        page.setData({ outOfAreaCount: newCount });
        
        // 检查是否达到警告阈值 & 是否超过冷却时间
        if (newCount >= Constants.OUT_OF_AREA_THRESHOLD && 
            currentTime - page.data.lastWarningTime > Constants.WARNING_COOLDOWN) {
          // 发出警告
          wx.showModal({
            title: '超出活动范围警告',
            content: `您已超出设定的精准活动范围${newCount}次，请注意安全！`,
            showCancel: false,
            success: () => {
              // 更新最后警告时间
              page.setData({ lastWarningTime: currentTime });
            }
          });
        }
        
        console.log('超出精准活动范围');
        return true;
      } else {
        // 如果返回区域内，重置计数
        if (page.data.outOfAreaCount > 0) {
          page.setData({ outOfAreaCount: 0 });
          console.log('已返回精准活动范围内');
        }
        return false;
      }
    } catch (error) {
      console.error('检查是否超出精准围栏时出错:', error);
      return false;
    }
  },

  // 初始化位置跟踪和后台更新
  initLocationTracking: function(page) {
    // 请求必要的权限
    wx.getSetting({
      success: (res) => {
        // 检查是否已授权位置权限
        if (!res.authSetting['scope.userLocation']) {
          wx.authorize({
            scope: 'scope.userLocation',
            success: () => {
              this.startLocationUpdates(page);
            },
            fail: () => {
              wx.showModal({
                title: '提示',
                content: '需要位置权限才能跟踪位置',
                showCancel: false
              });
            }
          });
        } else {
          this.startLocationUpdates(page);
        }
      }
    });
  },

  // 开始位置更新（包括后台位置更新）
  startLocationUpdates: function(page) {
    // 1. 先启动前台位置更新
    wx.startLocationUpdate({
      success: () => {
        console.log('前台位置更新已启动');
        
        // 2. 再注册位置变化监听
        wx.onLocationChange(res => {
          this.handleLocationChange(page, res);
        });
        
        // 3. 最后才尝试启动后台位置
        wx.startLocationUpdateBackground({
          success: () => {
            console.log('后台位置更新已启动');
          },
          fail: (err) => {
            console.error('后台位置启动失败:', err);
          }
        });
      }
    });
  },

  // 停止位置更新
  stopLocationUpdates: function() {
    // 停止位置更新
    wx.stopLocationUpdate({
      success: () => {
        console.log('位置更新已停止');
      }
    });
    
    // 取消位置变化监听
    wx.offLocationChange();
  },

  // 处理位置变化事件
  handleLocationChange: function(page, res) {
    if (!page.data.tracking) return;
    
    const latitude = res.latitude;
    const longitude = res.longitude;
    const timestamp = new Date().getTime();

    let markers = page.data.markers;
    let polyline = page.data.polyline;
    let cachedLocationData = page.data.cachedLocationData;

    // 获取当前动作类型
    const currentAction = page.data.current_action || '暂无';
    
    // 根据动作类型选择不同的标记图标
    let markerIcon, markerWidth, markerHeight;
    
    // 使用常量中定义的动作标记配置
    if (Constants.ACTION_MARKERS && Constants.ACTION_MARKERS[currentAction]) {
      const actionMarker = Constants.ACTION_MARKERS[currentAction];
      markerIcon = actionMarker.iconPath;
      markerWidth = actionMarker.width;
      markerHeight = actionMarker.height;
    } else {
      // 使用默认标记
      markerIcon = Constants.ACTION_MARKERS['default'] ? 
        Constants.ACTION_MARKERS['default'].iconPath : 
        '/images/markers/default.png';
      markerWidth = Constants.MARKER_SIZE;
      markerHeight = Constants.MARKER_SIZE;
    }
    console.log("标记：", markerIcon)
    // 添加带有动作类型的标记
    markers.push({
      id: markers.length,
      latitude: latitude,
      longitude: longitude,
      iconPath: markerIcon,
      width: markerWidth,
      height: markerHeight,
      action: currentAction // 记录动作类型
    });

    // 添加轨迹点
    if (polyline.length > 0) {
      polyline[0].points.push({
        latitude: latitude,
        longitude: longitude
      });
    }
    
    // 添加到缓存数据，包含动作信息
    cachedLocationData.push({
      latitude: latitude,
      longitude: longitude,
      timestamp: timestamp,
      action: currentAction // 记录动作类型
    });
    
    // 限制缓存数据大小
    if (cachedLocationData.length > Constants.MAX_CACHE_ITEMS) {
      cachedLocationData = cachedLocationData.slice(-Constants.MAX_CACHE_ITEMS);
    }

    // 更新数据
    page.setData({
      latitude: latitude,
      longitude: longitude,
      markers: markers,
      polyline: polyline,
      cachedLocationData: cachedLocationData
    });
    
    // 检查是否超出区域
    if (page.data.hasSetArea) {
      LocationManager.checkIfOutOfArea(page, latitude, longitude);
    }
    
    // 检查是否超出精准围栏
    if (page.data.hasSetPreciseFence) {
      LocationManager.checkIfOutOfPreciseFence(page, latitude, longitude);
    }
    
    console.log('位置轨迹已更新，当前位置:', latitude, longitude, '动作:', currentAction);
    
    // 确保更新地图显示
    if (typeof page.updateMapDisplay === 'function') {
      page.updateMapDisplay();
    }
  }
};

// 导出单例对象
export default LocationManager;