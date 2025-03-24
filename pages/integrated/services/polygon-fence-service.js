import * as Constants from '../config/constants.js'

/**
 * 多边形围栏服务 - 提供精准电子围栏的创建和判断功能
 */
const PolygonFenceService = {
  // 创建围栏点位的可视化标记
  createFenceMarkers: function(points) {
    if (!points || points.length === 0) return [];
    
    return points.map((point, index) => {
      return {
        id: `fence-${index}`,
        latitude: point.latitude,
        longitude: point.longitude,
        width: 12,  // 使用不同大小
        height: 12,
        iconPath: '/assets/fence_marker.png',  // 使用专用图标
        callout: index === 0 ? {
          content: '起点',
          display: 'BYCLICK',
          fontSize: 10,
          color: '#ffffff',
          bgColor: Constants.FENCE_COLOR,
          padding: 2,
          borderRadius: 4
        } : null
      };
    });
  },
  
  // 创建围栏轨迹线
  createFencePolyline: function(points) {
    if (!points || points.length === 0) return [];
    
    return [{
      points: points,
      color: Constants.FENCE_COLOR, // 使用不同颜色区分
      width: Constants.POLYLINE_WIDTH, // 使用与普通轨迹相同宽度
      dottedLine: false
    }];
  },
  
  // 创建原始轨迹线（用于显示未扩充的原始点集）
  createOriginalPathPolyline: function(points) {
    if (!points || points.length === 0) return [];
    
    return [{
      points: points,
      color: Constants.FENCE_ORIGINAL_COLOR,
      width: 2,
      dottedLine: true
    }];
  },
  
  // 闭合多边形（如果首尾点不相同）
  closePolygon: function(points) {
    if (!points || points.length < 3) return points;
    
    const result = [...points];
    const firstPoint = result[0];
    const lastPoint = result[result.length - 1];
    
    // 检查第一点与最后一点是否是同一个点
    const samePoint = 
      Math.abs(firstPoint.latitude - lastPoint.latitude) < 0.00001 && 
      Math.abs(firstPoint.longitude - lastPoint.longitude) < 0.00001;
    
    // 如果不是同一个点，则添加一个点闭合多边形
    if (!samePoint) {
      result.push(firstPoint);
    }
    
    return result;
  },
  
  // 创建围栏缓冲区
  createBufferZone: function(points, bufferDistance) {
    if (!points || points.length < 3) return [];
    
    // 确保多边形是闭合的
    let closedPoints = this.closePolygon(points);
    
    // 先使用点简化算法减少点数量，提高性能
    const simplifiedPoints = this.simplifyPolygon(closedPoints, 0.000005);
    
    // 计算缓冲区
    return this.calculateBufferZone(simplifiedPoints, bufferDistance);
  },
  
  // 计算实际的缓冲区
  calculateBufferZone: function(points, bufferDistance) {
    const bufferedPoints = [];
    const segmentCount = 8; // 每个角点生成的分段数
    
    // 对每个点进行缓冲操作
    for (let i = 0; i < points.length; i++) {
      const prev = i === 0 ? points[points.length - 2] : points[i - 1];
      const current = points[i];
      const next = i === points.length - 1 ? points[1] : points[i + 1];
      
      // 计算当前点的法向量
      const angleIn = Math.atan2(
        current.latitude - prev.latitude,
        current.longitude - prev.longitude
      );
      
      const angleOut = Math.atan2(
        next.latitude - current.latitude,
        next.longitude - current.longitude
      );
      
      // 法向量角度（垂直于线段）
      const angleBisector = (angleIn + angleOut) / 2 + Math.PI / 2;
      
      // 根据缓冲距离计算偏移量（地球坐标系转换）
      // 1度纬度约等于111km
      const latOffset = (bufferDistance / 111000);
      // 1度经度随纬度变化，在赤道约等于111km
      const lngOffset = (bufferDistance / (111000 * Math.cos(current.latitude * Math.PI / 180)));
      
      // 生成圆弧上的点
      const startAngle = angleBisector - Math.PI;
      const endAngle = angleBisector;
      const angleStep = (endAngle - startAngle) / segmentCount;
      
      for (let j = 0; j <= segmentCount; j++) {
        const angle = startAngle + j * angleStep;
        bufferedPoints.push({
          latitude: current.latitude + Math.sin(angle) * latOffset,
          longitude: current.longitude + Math.cos(angle) * lngOffset
        });
      }
    }
    
    return bufferedPoints;
  },
  
  // 生成多边形配置对象，用于地图显示
  createPolygon: function(points) {
    if (!points || points.length < 3) return [];
    
    return [{
      points: points,
      strokeWidth: Constants.FENCE_STROKE_WIDTH,
      strokeColor: Constants.FENCE_COLOR,
      fillColor: Constants.FENCE_FILL_COLOR
    }];
  },
  
  // 计算多边形面积（平面近似，单位：平方米）
  calculateArea: function(points) {
    if (!points || points.length < 3) return 0;
    
    // 确保多边形是闭合的
    const closedPoints = this.closePolygon(points);
    
    // 使用鞋带公式计算多边形面积
    let area = 0;
    const R = 6371000; // 地球半径，单位米
    
    for (let i = 0; i < closedPoints.length - 1; i++) {
      const p1 = closedPoints[i];
      const p2 = closedPoints[i + 1];
      
      // 将经纬度转换为平面坐标（简化计算）
      const x1 = p1.longitude * Math.cos(p1.latitude * Math.PI / 180) * R * Math.PI / 180;
      const y1 = p1.latitude * R * Math.PI / 180;
      const x2 = p2.longitude * Math.cos(p2.latitude * Math.PI / 180) * R * Math.PI / 180;
      const y2 = p2.latitude * R * Math.PI / 180;
      
      area += x1 * y2 - x2 * y1;
    }
    
    // 取绝对值并除以2
    return Math.abs(area) / 2;
  },
  
  // 判断点是否在多边形内（射线法）
  isPointInPolygon: function(point, polygon) {
    if (!polygon || polygon.length < 3) return false;
    
    const x = point.longitude;
    const y = point.latitude;
    let inside = false;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].longitude;
      const yi = polygon[i].latitude;
      const xj = polygon[j].longitude;
      const yj = polygon[j].latitude;
      
      // 射线法检查点是否在多边形内
      const intersect = ((yi > y) != (yj > y)) && 
                        (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    
    return inside;
  },
  
  // 计算点到多边形的最短距离
  calculateDistanceToPolygon: function(point, polygon) {
    if (!polygon || polygon.length < 3) return Infinity;
    
    // 如果点在多边形内部，距离为0
    if (this.isPointInPolygon(point, polygon)) return 0;
    
    // 计算点到多边形每条边的最短距离
    let minDistance = Infinity;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const p1 = polygon[j];
      const p2 = polygon[i];
      
      // 计算点到线段的最短距离
      const distance = this.calculateDistanceToLineSegment(
        point, p1, p2
      );
      
      minDistance = Math.min(minDistance, distance);
    }
    
    return minDistance;
  },
  
  // 计算点到线段的最短距离
  calculateDistanceToLineSegment: function(point, lineStart, lineEnd) {
    const lat1 = point.latitude;
    const lng1 = point.longitude;
    const lat2 = lineStart.latitude;
    const lng2 = lineStart.longitude;
    const lat3 = lineEnd.latitude;
    const lng3 = lineEnd.longitude;
    
    // 线段长度的平方
    const L2 = (lat3 - lat2) * (lat3 - lat2) + (lng3 - lng2) * (lng3 - lng2);
    
    if (L2 === 0) {
      // 线段实际上是一个点
      return this.calculateHaversineDistance(lat1, lng1, lat2, lng2);
    }
    
    // 计算投影点的参数 t
    const t = ((lat1 - lat2) * (lat3 - lat2) + (lng1 - lng2) * (lng3 - lng2)) / L2;
    
    if (t < 0) {
      // 最近点是线段的起点
      return this.calculateHaversineDistance(lat1, lng1, lat2, lng2);
    }
    
    if (t > 1) {
      // 最近点是线段的终点
      return this.calculateHaversineDistance(lat1, lng1, lat3, lng3);
    }
    
    // 最近点在线段上
    const projLat = lat2 + t * (lat3 - lat2);
    const projLng = lng2 + t * (lng3 - lng2);
    
    return this.calculateHaversineDistance(lat1, lng1, projLat, projLng);
  },
  
  // 使用 Haversine 公式计算两点间的距离（米）
  calculateHaversineDistance: function(lat1, lng1, lat2, lng2) {
    const R = 6371000; // 地球半径，单位：米
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    
    return distance;
  },
  
  // 计算多边形的中心点
  calculatePolygonCenter: function(points) {
    if (!points || points.length === 0) return null;
    
    let sumLat = 0;
    let sumLng = 0;
    
    for (const point of points) {
      sumLat += point.latitude;
      sumLng += point.longitude;
    }
    
    return {
      latitude: sumLat / points.length,
      longitude: sumLng / points.length
    };
  },
  
  // 计算多边形的边界框
  calculateBoundingBox: function(points) {
    if (!points || points.length === 0) return null;
    
    let minLat = points[0].latitude;
    let maxLat = points[0].latitude;
    let minLng = points[0].longitude;
    let maxLng = points[0].longitude;
    
    for (const point of points) {
      minLat = Math.min(minLat, point.latitude);
      maxLat = Math.max(maxLat, point.latitude);
      minLng = Math.min(minLng, point.longitude);
      maxLng = Math.max(maxLng, point.longitude);
    }
    
    return {
      southwest: { latitude: minLat, longitude: minLng },
      northeast: { latitude: maxLat, longitude: maxLng }
    };
  },
  
  // 使用 Douglas-Peucker 算法简化多边形点集
  simplifyPolygon: function(points, tolerance) {
    if (!points || points.length < 3) return points;
    
    // 简单实现 Douglas-Peucker 算法
    // 如果所有点到线段的距离都小于容差，则只保留起点和终点
    const findFurthest = (start, end, points) => {
      let maxDist = 0;
      let maxIndex = 0;
      
      const startPoint = points[start];
      const endPoint = points[end];
      
      for (let i = start + 1; i < end; i++) {
        const dist = this.perpendicularDistance(points[i], startPoint, endPoint);
        if (dist > maxDist) {
          maxDist = dist;
          maxIndex = i;
        }
      }
      
      return { maxDist, maxIndex };
    };
    
    const simplifyRecursive = (start, end, points, tolerance, result) => {
      const { maxDist, maxIndex } = findFurthest(start, end, points);
      
      if (maxDist > tolerance) {
        // 递归简化
        simplifyRecursive(start, maxIndex, points, tolerance, result);
        simplifyRecursive(maxIndex, end, points, tolerance, result);
      } else {
        // 只有终点加入结果，起点会在前一个递归中处理
        if (end > start + 1) {
          result.push(points[end]);
        }
      }
    };
    
    const result = [points[0]]; // 先加入起点
    simplifyRecursive(0, points.length - 1, points, tolerance, result);
    
    return result;
  },
  
  // 计算点到线段的垂直距离
  perpendicularDistance: function(point, lineStart, lineEnd) {
    const x = point.longitude;
    const y = point.latitude;
    const x1 = lineStart.longitude;
    const y1 = lineStart.latitude;
    const x2 = lineEnd.longitude;
    const y2 = lineEnd.latitude;
    
    // 线段长度的平方
    const L2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    
    if (L2 === 0) return 0; // 线段长度为0
    
    // 点到线的垂直距离公式
    const area = Math.abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1);
    return area / Math.sqrt(L2);
  },
  
  // 实现生成精确缓冲区的方法
  generatePreciseBuffer: function(points, bufferDistance) {
    // 实际上这个方法会调用我们原有的缓冲区生成逻辑
    // 这里我们使用原有的 createBufferZone 算法，但通过另一个函数调用
    return this._generateBuffer(points, bufferDistance);
  },
  
  // 原有的缓冲区生成逻辑，改名为内部方法
  _generateBuffer: function(points, bufferDistance) {
    if (!points || points.length < 3) {
      console.error('点集不足以形成有效多边形');
      return points;
    }
    
    // 确保多边形是闭合的
    const closedPoints = this.closePolygon(points);
    
    // 计算每个点的法向量方向，并沿该方向延伸缓冲距离
    const bufferedPoints = [];
    
    for (let i = 0; i < closedPoints.length; i++) {
      const prevIdx = (i === 0) ? closedPoints.length - 1 : i - 1;
      const nextIdx = (i === closedPoints.length - 1) ? 0 : i + 1;
      
      // 当前点
      const current = closedPoints[i];
      // 前一点
      const prev = closedPoints[prevIdx];
      // 后一点
      const next = closedPoints[nextIdx];
      
      // 计算从prev到current和从current到next的向量
      const vec1 = {
        lat: current.latitude - prev.latitude,
        lng: current.longitude - prev.longitude
      };
      const vec2 = {
        lat: next.latitude - current.latitude,
        lng: next.longitude - current.longitude
      };
      
      // 计算法向量（简化处理，假设在平面上）
      const norm1 = { lat: -vec1.lng, lng: vec1.lat };
      const norm2 = { lat: -vec2.lng, lng: vec2.lat };
      
      // 归一化
      const len1 = Math.sqrt(norm1.lat * norm1.lat + norm1.lng * norm1.lng);
      const len2 = Math.sqrt(norm2.lat * norm2.lat + norm2.lng * norm2.lng);
      
      if (len1 === 0 || len2 === 0) continue; // 避免除以零
      
      norm1.lat /= len1;
      norm1.lng /= len1;
      norm2.lat /= len2;
      norm2.lng /= len2;
      
      // 计算平均法向量
      const avgNorm = {
        lat: (norm1.lat + norm2.lat) / 2,
        lng: (norm1.lng + norm2.lng) / 2
      };
      
      // 归一化平均法向量
      const avgLen = Math.sqrt(avgNorm.lat * avgNorm.lat + avgNorm.lng * avgNorm.lng);
      
      if (avgLen === 0) continue; // 避免除以零
      
      avgNorm.lat /= avgLen;
      avgNorm.lng /= avgLen;
      
      // 创建缓冲区点（将点沿法向量方向移动bufferDistance）
      // 注意：这里需要将距离转换为对应的经纬度变化，使用了近似转换
      // 纬度1度约111km，经度1度在赤道约111km，随纬度增加而减少
      const latOffset = (bufferDistance / 111000);
      // 经度1度的距离随纬度变化：111km * cos(lat)
      const lngOffset = (bufferDistance / (111000 * Math.cos(current.latitude * Math.PI / 180)));
      
      bufferedPoints.push({
        latitude: current.latitude + avgNorm.lat * latOffset,
        longitude: current.longitude + avgNorm.lng * lngOffset
      });
    }
    
    return bufferedPoints;
  }
};

export default PolygonFenceService; 