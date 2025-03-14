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
    lastWarningTime: 0 // 上次预警时间
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
  
  // 合并开始/停止记录功能
  toggleTracking: function() {
    if (this.data.tracking) {
      // 停止记录
      clearInterval(this.data.intervalId);
      this.setData({
        tracking: false,
        intervalId: null,
        outOfAreaCount: 0 // 重置超出区域计数
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

      const intervalId = setInterval(this.getLocationAndUpdate.bind(this), TRACKING_INTERVAL);
      this.setData({ intervalId: intervalId });
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
  }
})
