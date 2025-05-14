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
    
    // 使用更小的容差，保留更多细节
    const simplifiedPoints = this.simplifyPolygon(closedPoints, 0.000002); // 降低简化程度，保留更多细节
    
    console.log('原始点数:', closedPoints.length, '简化后点数:', simplifiedPoints.length);
    
    // 计算缓冲区
    return this.calculateBufferZone(simplifiedPoints, bufferDistance);
  },
  
  // 计算实际的缓冲区
  calculateBufferZone: function(points, bufferDistance) {
    // 增加分段数，使缓冲区更平滑
    const segmentCount = 12; // 从8增加到12
    const bufferedPoints = [];
    
    // 对每个点进行缓冲操作
    for (let i = 0; i < points.length; i++) {
      const prev = i === 0 ? points[points.length - 2] : points[i - 1];
      const current = points[i];
      const next = i === points.length - 1 ? points[1] : points[i + 1];
      
      // 计算当前点的入射角和出射角
      const angleIn = Math.atan2(
        current.latitude - prev.latitude,
        current.longitude - prev.longitude
      );
      
      const angleOut = Math.atan2(
        next.latitude - current.latitude,
        next.longitude - current.longitude
      );
      
      // 计算内外角平分线的角度（垂直于线段，指向外部）
      let angleBisector = (angleIn + angleOut) / 2;
      
      // 判断是内角还是外角
      const angleDiff = Math.abs(angleOut - angleIn);
      const isInnerCorner = (angleDiff > Math.PI && angleDiff < 2 * Math.PI) || 
                            (angleDiff < Math.PI && angleDiff > 0);
      
      // 如果是内角，需要调整角度使其指向外部
      if (isInnerCorner) {
        angleBisector += Math.PI;
      }
      
      // 计算缓冲距离对应的经纬度偏移量
      // 纬度1度约111km
      const latOffset = (bufferDistance / 111000);
      // 经度1度随纬度变化，在某个纬度上经度1度的距离=111km*cos(纬度)
      const lngOffset = (bufferDistance / (111000 * Math.cos(current.latitude * Math.PI / 180)));
      
      // 生成圆弧上的点
      const halfAngleRange = Math.PI / 2; // 控制圆弧角度范围
      const startAngle = angleBisector - halfAngleRange;
      const endAngle = angleBisector + halfAngleRange;
      const angleStep = (endAngle - startAngle) / segmentCount;
      
      for (let j = 0; j <= segmentCount; j++) {
        const angle = startAngle + j * angleStep;
        bufferedPoints.push({
          latitude: current.latitude + Math.sin(angle) * latOffset,
          longitude: current.longitude + Math.cos(angle) * lngOffset
        });
      }
    }
    
    // 确保生成的缓冲区是闭合的
    return this.closePolygon(bufferedPoints);
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
    
    // 增加精度值，降低误判率
    const EPSILON = 1e-6; // 从 1e-8 改为 1e-6，提高容差
    const x = point.longitude;
    const y = point.latitude;
    
    // 使用简单包围盒快速判断（优化性能）
    const bbox = this.calculateBoundingBox(polygon);
    if (!bbox) return false;
    
    // 如果点不在包围盒内，快速返回 false
    if (x < bbox.southwest.longitude - EPSILON || 
        x > bbox.northeast.longitude + EPSILON ||
        y < bbox.southwest.latitude - EPSILON || 
        y > bbox.northeast.latitude + EPSILON) {
      console.log('点不在包围盒内，直接排除');
      return false;
    }
    
    // 检查点是否非常接近多边形边界
    // 由于这里调用了calculateDistanceToPolygon会导致循环引用，我们改为直接计算
    // 在isPointOnPolygonBoundary中计算点到边界的距离
    if (this.isPointOnPolygonBoundary(point, polygon, 2)) { // 2米内认为在边界上
      console.log('点距离多边形边界很近，视为在内部');
      return true;
    }
    
    let inside = false;
    
    // 射线法判断点是否在多边形内
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const p1 = polygon[i];
      const p2 = polygon[j];
      
      // 检查点是否在线段上
      if (this.isPointOnLineSegment(point, p1, p2, EPSILON)) {
        console.log('点在多边形边上');
        return true;
      }
      
      // 射线法判断 - 水平向右的射线与多边形边的交点个数
      // 如果相交次数为奇数，则点在多边形内部
      if (((p1.latitude > y) !== (p2.latitude > y)) && // 边跨过水平线
          (x < (p2.longitude - p1.longitude) * (y - p1.latitude) / 
               (p2.latitude - p1.latitude) + p1.longitude)) {
        inside = !inside;
      }
    }
    
    // 记录判断结果
    console.log('点' + (inside ? '在' : '不在') + '多边形内部');
    return inside;
  },
  
  // 新增：检查点是否在多边形边界上（不调用isPointInPolygon，避免循环引用）
  isPointOnPolygonBoundary: function(point, polygon, thresholdMeters = 2) {
    if (!polygon || polygon.length < 3) return false;
    
    // 计算点到多边形每条边的最短距离
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const p1 = polygon[j];
      const p2 = polygon[i];
      
      // 计算点到线段的最短距离
      const distance = this.calculateDistanceToLineSegment(point, p1, p2);
      
      // 如果距离小于阈值，认为点在边界上
      if (distance <= thresholdMeters) {
        return true;
      }
    }
    
    return false;
  },
  
  // 判断点是否在线段上 - 使用更宽松的距离阈值
  isPointOnLineSegment: function(point, lineStart, lineEnd, epsilon = 1e-6) {
    const x = point.longitude;
    const y = point.latitude;
    const x1 = lineStart.longitude;
    const y1 = lineStart.latitude;
    const x2 = lineEnd.longitude;
    const y2 = lineEnd.latitude;
    
    // 如果线段长度接近于0，判断点与端点的距离
    if (Math.abs(x2 - x1) < epsilon && Math.abs(y2 - y1) < epsilon) {
      const dist = Math.sqrt((x - x1) * (x - x1) + (y - y1) * (y - y1));
      return dist < epsilon;
    }
    
    // 计算点到线段的距离
    const A = x - x1;
    const B = y - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    
    const dot = A * C + B * D;
    const len_sq = C * C + D * D;
    
    // 参数 t
    let t = -1;
    if (len_sq !== 0) {
      t = dot / len_sq;
    }
    
    // 如果 t 在 [0,1] 范围内，点在线段上
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    
    // 计算投影点
    const xx = x1 + t * C;
    const yy = y1 + t * D;
    
    // 计算点到投影点的距离
    const dx = x - xx;
    const dy = y - yy;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // 将经纬度距离转换为实际物理距离（近似）
    const earthRadius = 6371000; // 地球半径，单位：米
    const latDistance = Math.abs(dy) * Math.PI / 180 * earthRadius;
    const lngDistance = Math.abs(dx) * Math.PI / 180 * earthRadius * Math.cos(y * Math.PI / 180);
    const physicalDistance = Math.sqrt(latDistance * latDistance + lngDistance * lngDistance);
    
    // 使用更宽松的阈值，如果物理距离小于2米，认为点在线段上
    return physicalDistance < 2 || distance < epsilon;
  },
  
  // 计算点到多边形的最短距离
  calculateDistanceToPolygon: function(point, polygon) {
    if (!polygon || polygon.length < 3) return Infinity;
    
    // 使用射线法判断点是否在多边形内部，不要反向调用isPointInPolygon避免循环引用
    let inside = false;
    const x = point.longitude;
    const y = point.latitude;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const p1 = polygon[i];
      const p2 = polygon[j];
      
      if (((p1.latitude > y) !== (p2.latitude > y)) && 
          (x < (p2.longitude - p1.longitude) * (y - p1.latitude) / 
               (p2.latitude - p1.latitude) + p1.longitude)) {
        inside = !inside;
      }
    }
    
    // 如果点在多边形内部，距离为0
    if (inside) return 0;
    
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
    if (!points || points.length < 4) return points;
    
    // 修改 Douglas-Peucker 算法实现，更准确地计算距离
    const findFurthest = (start, end, points) => {
      let maxDist = 0;
      let maxIndex = 0;
      
      const startPoint = points[start];
      const endPoint = points[end];
      
      for (let i = start + 1; i < end; i++) {
        // 使用Haversine计算点到线的实际物理距离，而不是简单的经纬度差值
        const dist = this.perpendicularDistanceHaversine(points[i], startPoint, endPoint);
        if (dist > maxDist) {
          maxDist = dist;
          maxIndex = i;
        }
      }
      
      return { maxDist, maxIndex };
    };
    
    const result = [points[0]]; // 先加入起点
    
    const simplifyPart = (start, end) => {
      const { maxDist, maxIndex } = findFurthest(start, end, points);
      
      if (maxDist > tolerance) {
        // 递归简化
        simplifyPart(start, maxIndex);
        result.push(points[maxIndex]);
        simplifyPart(maxIndex, end);
      } else if (end !== start + 1) {
        // 直接添加终点
        result.push(points[end]);
      }
    };
    
    // 闭合的多边形需要特殊处理，最后一个点和第一个点相同
    const actualEnd = points.length - 1;
    simplifyPart(0, actualEnd);
    
    return this.closePolygon(result);
  },
  
  // 使用 Haversine 公式计算点到线段的垂直距离
  perpendicularDistanceHaversine: function(point, lineStart, lineEnd) {
    // 先计算点到线段两个端点的距离
    const d1 = this.calculateHaversineDistance(
      point.latitude, point.longitude, 
      lineStart.latitude, lineStart.longitude
    );
    
    const d2 = this.calculateHaversineDistance(
      point.latitude, point.longitude, 
      lineEnd.latitude, lineEnd.longitude
    );
    
    // 计算线段长度
    const lineLength = this.calculateHaversineDistance(
      lineStart.latitude, lineStart.longitude,
      lineEnd.latitude, lineEnd.longitude
    );
    
    if (lineLength === 0) return Math.min(d1, d2);
    
    // 使用海伦公式计算三角形面积
    const s = (d1 + d2 + lineLength) / 2;
    const area = Math.sqrt(s * (s - d1) * (s - d2) * (s - lineLength));
    
    // 面积除以底边长度得到高，即点到线段的垂直距离
    return (2 * area) / lineLength;
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