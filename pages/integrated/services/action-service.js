import * as Constants from '../config/constants.js'

// 提交数据进行动作识别
export function recognizeAction(accXs, accYs, accZs, gyrXs, gyrYs, gyrZs) {
  return new Promise((resolve, reject) => {
    // 确保数据足够
    if (accXs.length < Constants.SAMPLE_SIZE) {
      console.log('数据不足，跳过提交')
      return reject(new Error('数据不足'))
    }

    const data = {
      // 只取最新的SAMPLE_SIZE个数据点进行提交
      accXs: accXs.slice(-Constants.SAMPLE_SIZE),
      accYs: accYs.slice(-Constants.SAMPLE_SIZE),
      accZs: accZs.slice(-Constants.SAMPLE_SIZE),
      gyrXs: gyrXs.slice(-Constants.SAMPLE_SIZE),
      gyrYs: gyrYs.slice(-Constants.SAMPLE_SIZE),
      gyrZs: gyrZs.slice(-Constants.SAMPLE_SIZE),
    }
    
    console.log('提交动作识别数据，样本大小:', Constants.SAMPLE_SIZE, '当前数组长度:', accXs.length)

    wx.request({
      url: `${Constants.API_BASE_URL}/recognize`,
      data: {
        data: JSON.stringify(data)
      },
      method: "POST",
      header: Constants.HEADERS,
      success: res => {
        console.log('预测结果：', res.data, '成功')
        resolve(res.data)
      },
      fail: err => {
        console.log('动作识别请求失败:', err)
        reject(err)
      }
    })
  })
}

// 处理传感器数据限制长度
export function limitSensorData(dataArray, maxLength) {
  if (dataArray.length > maxLength) {
    return dataArray.slice(-maxLength)
  }
  return dataArray
}

// 清理旧数据
export function cleanupSensorData(sensorData, maxKeep) {
  const { accXs, accYs, accZs, gyrXs, gyrYs, gyrZs } = sensorData
  
  // 如果数据超过最大保留量，执行清理
  if (accXs.length > maxKeep) {
    return {
      accXs: accXs.slice(-maxKeep),
      accYs: accYs.slice(-maxKeep),
      accZs: accZs.slice(-maxKeep),
      gyrXs: gyrXs.slice(-maxKeep),
      gyrYs: gyrYs.slice(-maxKeep),
      gyrZs: gyrZs.slice(-maxKeep)
    }
  }
  
  return sensorData
} 