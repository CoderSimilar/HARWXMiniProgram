import * as Constants from '../config/constants.js'

// 滑动平均滤波
export function movingAverageFilter(data, windowSize = Constants.MOVING_AVERAGE_WINDOW) {
  const filtered = []
  let windowSum = 0
  const queue = []

  for (let i = 0; i < data.length; i++) {
    queue.push(data[i])
    windowSum += data[i]

    if (queue.length > windowSize) {
      windowSum -= queue.shift()
    }
    // 输出滑动窗口平均值
    filtered.push(windowSum / queue.length)
  }
  return filtered
}

// 基于时间戳的峰值检测方法
export function detectNewPeaks(accNorm, timestamps, lastPeakTime, threshold, minPeakDistanceS) {
  // 最小峰值时间间隔（毫秒）
  const minPeakDistanceMs = minPeakDistanceS * 1000
  let newStepCount = 0
  const peakIndices = []
  
  // 使用传入的最后峰值时间
  let currentLastPeakTime = lastPeakTime || 0
  
  // 遍历所有数据点检测峰值
  for (let i = 1; i < accNorm.length - 1; i++) {
    // 简易极大值判定
    if (accNorm[i] > threshold &&
        accNorm[i] > accNorm[i - 1] &&
        accNorm[i] > accNorm[i + 1]) {
      
      const currentTime = timestamps[i]
      
      // 确保与上一个峰值的时间间隔足够远
      if (currentTime - currentLastPeakTime > minPeakDistanceMs) {
        newStepCount++
        peakIndices.push(i)
        currentLastPeakTime = currentTime
        
        // 调试日志
        console.log(`检测到新步伐，间隔: ${(currentTime - lastPeakTime)/1000}秒, 值: ${accNorm[i].toFixed(2)}`)
      }
    }
  }
  
  return {
    newStepCount: newStepCount,
    peakIndices: peakIndices,
    lastPeakTime: currentLastPeakTime
  }
}

// 初始化步数检测器
export function initStepDetector() {
  return {
    lastPeakTime: 0,
    stepCount: 0,
    lastMinuteStepCount: 0,
    accNormValues: [],
    accTimestamps: [],
    peakIndices: []
  }
} 