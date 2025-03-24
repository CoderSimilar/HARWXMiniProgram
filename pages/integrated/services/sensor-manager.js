import * as Constants from '../config/constants.js'

/**
 * 传感器管理模块 - 提供传感器启动、停止和数据处理功能
 */
const SensorManager = {
  // 启动加速度计传感器
  startAccelerometer: function(interval, callback, errorCallback) {
    try {
      wx.startAccelerometer({
        interval: interval,
        success: () => {
          console.log('加速度计已启动，频率:', interval);
        },
        fail: (error) => {
          console.error('启动加速度计失败:', error);
          if (errorCallback) errorCallback(error, 'accelerometer');
        }
      });
      
      // 注册加速度计监听器
      wx.onAccelerometerChange(callback);
    } catch (error) {
      console.error('启动加速度计时发生异常:', error);
      if (errorCallback) errorCallback(error, 'accelerometer');
    }
  },
  
  // 启动陀螺仪传感器
  startGyroscope: function(interval, callback, errorCallback) {
    try {
      wx.startGyroscope({
        interval: interval,
        success: () => {
          console.log('陀螺仪已启动，频率:', interval);
        },
        fail: (error) => {
          console.error('启动陀螺仪失败:', error);
          if (errorCallback) errorCallback(error, 'gyroscope');
        }
      });
      
      // 注册陀螺仪监听器
      wx.onGyroscopeChange(callback);
    } catch (error) {
      console.error('启动陀螺仪时发生异常:', error);
      if (errorCallback) errorCallback(error, 'gyroscope');
    }
  },
  
  // 停止传感器
  stopSensor: function(sensorType) {
    try {
      if (sensorType === 'accelerometer') {
        wx.stopAccelerometer({
          success: () => {
            console.log('加速度计已停止');
            wx.offAccelerometerChange();
          }
        });
      } else if (sensorType === 'gyroscope') {
        wx.stopGyroscope({
          success: () => {
            console.log('陀螺仪已停止');
            wx.offGyroscopeChange();
          }
        });
      }
    } catch (error) {
      console.error(`停止${sensorType}时发生异常:`, error);
    }
  },
  
  // 停止所有传感器
  stopAllSensors: function() {
    this.stopSensor('accelerometer');
    this.stopSensor('gyroscope');
  },
  
  // 重启传感器
  restartSensor: function(sensorType, interval, callback, errorCallback) {
    this.stopSensor(sensorType);
    
    setTimeout(() => {
      if (sensorType === 'accelerometer') {
        this.startAccelerometer(interval, callback, errorCallback);
      } else if (sensorType === 'gyroscope') {
        this.startGyroscope(interval, callback, errorCallback);
      }
    }, 1000);
  }
};

// 导出单例对象
export default SensorManager; 