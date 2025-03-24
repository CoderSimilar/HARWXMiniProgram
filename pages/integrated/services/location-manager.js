import * as Constants from '../config/constants.js'
import * as LocationService from './location-service.js'
import PolygonFenceService from './polygon-fence-service.js'

/**
 * 位置管理模块 - 提供位置跟踪、地图标记和电子围栏功能
 */
const LocationManager = {
  // 获取当前位置
  getCurrentLocation: function(page) {
    wx.showLoading({
      title: '获取位置中...',
    });
    
    wx.getLocation({
      type: Constants.LOCATION_TYPE,
      success: res => {
        wx.hideLoading();
        page.setData({
          latitude: res.latitude,
          longitude: res.longitude,
          mapVisible: true,
          scale: Constants.DEFAULT_SCALE,
        });
        return res;
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({
          title: '获取位置失败',
          icon: 'none',
          duration: Constants.TOAST_DURATION
        });
        return null;
      }
    });
  },
  
  // 获取位置并更新轨迹
  updateLocationTrack: function(page) {
    wx.getLocation({
      type: Constants.LOCATION_TYPE,
      success(res) {
        const latitude = res.latitude;
        const longitude = res.longitude;
        const timestamp = new Date().getTime();

        let markers = page.data.markers;
        let polyline = page.data.polyline;
        let cachedLocationData = page.data.cachedLocationData;

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
        
        console.log('位置轨迹已更新，当前位置:', latitude, longitude);
        
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
  
  // 开始设置区域
  startSettingArea: function(page) {
    // 先获取当前位置作为圆心
    wx.getLocation({
      type: Constants.LOCATION_TYPE,
      success: res => {
        const circles = [{
          latitude: res.latitude,
          longitude: res.longitude,
          color: Constants.CIRCLE_COLOR,
          fillColor: Constants.CIRCLE_FILL_COLOR,
          radius: page.data.areaRadius,
          strokeWidth: Constants.CIRCLE_STROKE_WIDTH
        }];
        
        page.setData({
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
  
  // 开始记录精准电子围栏
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
    
    // 获取当前位置作为第一个点
    wx.getLocation({
      type: Constants.LOCATION_TYPE,
      success: res => {
        const { latitude, longitude } = res;
        
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
    });
    
    // 如果已经设置了普通圆形围栏，临时隐藏它
    if (page.data.hasSetArea) {
      const tempCircles = [...page.data.circles];
      page.setData({
        tempCircles: tempCircles,
        circles: []
      });
    }
    
    // 启动精准围栏记录定时器
    page.timers.fenceRecording = setInterval(() => {
      this.recordFencePoint(page);
    }, Constants.FENCE_RECORDING_INTERVAL);
    
    wx.showToast({
      title: '开始记录精准围栏，请沿边界行走',
      icon: 'none',
      duration: 3000
    });
  },
  
  // 记录围栏点，更接近轨迹记录逻辑
  recordFencePoint: function(page) {
    if (!page.data.isRecordingFence) return;
    
    wx.getLocation({
      type: Constants.LOCATION_TYPE,
      success: res => {
        const { latitude, longitude } = res;
        
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
      }
    });
  },
  
  // 完成精准围栏设置 - 隐藏围栏点位标记
  finishPreciseFence: function(page) {
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
    
    const point = { latitude, longitude };
    const polygon = page.data.preciseFence.bufferedPoints;
    
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
  }
};

// 导出单例对象
export default LocationManager; 