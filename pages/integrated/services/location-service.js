import * as Constants from '../config/constants.js'

// 获取当前位置
export function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    wx.startLocationUpdateBackground()({
      type: Constants.LOCATION_TYPE,
      success: res => resolve(res),
      fail: err => reject(err)
    })
  })
}

// 计算两点之间的距离
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = Constants.EARTH_RADIUS // 地球半径（米）
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  const distance = R * c
  return distance
}

// 添加新位置点 - 保持现有轨迹
export function addLocationPoint(markers, polyline, locationData, latitude, longitude, timestamp) {
  // 添加标记
  const newMarkers = [...(markers || []), {
    id: (markers || []).length,
    latitude: latitude,
    longitude: longitude,
    width: Constants.MARKER_SIZE,
    height: Constants.MARKER_SIZE
  }];

  // 确保 polyline 正确初始化
  let newPolyline = polyline;
  if (!newPolyline || newPolyline.length === 0) {
    newPolyline = [{
      points: [],
      color: Constants.POLYLINE_COLOR,
      width: Constants.POLYLINE_WIDTH,
      dottedLine: false
    }];
  }

  // 添加轨迹点
  newPolyline[0].points.push({
    latitude: latitude,
    longitude: longitude
  });
  
  // 添加到缓存数据
  const newLocationData = [...(locationData || []), {
    latitude: latitude,
    longitude: longitude,
    timestamp: timestamp
  }];
  
  // 限制缓存数据大小
  const finalLocationData = newLocationData.length > Constants.MAX_CACHE_ITEMS ? 
    newLocationData.slice(-Constants.MAX_CACHE_ITEMS) : newLocationData;
  
  return {
    markers: newMarkers,
    polyline: newPolyline,
    locationData: finalLocationData
  };
} 