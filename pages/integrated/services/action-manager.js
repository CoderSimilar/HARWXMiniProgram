import * as Constants from '../config/constants.js'
import * as ActionService from './action-service.js'
import SensorManager from './sensor-manager.js'

/**
 * 动作管理模块 - 提供动作识别和数据处理功能
 */
const ActionManager = {
  // 初始化动作传感器数据存储
  initActionData: function() {
    return {
      accXs: [], 
      accYs: [], 
      accZs: [],
      gyrXs: [], 
      gyrYs: [], 
      gyrZs: [],
      accelerometerX: 0,
      accelerometerY: 0,
      accelerometerZ: 0,
      gyroscopeX: 0,
      gyroscopeY: 0,
      gyroscopeZ: 0
    };
  },
  
  // 启动动作识别传感器
  startActionSensors: function(page) {
    // 初始化动作数据（如果未初始化）
    if (!page.actionData) {
      page.actionData = this.initActionData();
    }
    
    // 启动加速度计传感器
    SensorManager.startAccelerometer(
      Constants.SENSOR_INTERVAL,
      (res) => this.handleAccelerometerData(page, res),
      (error, sensorType) => this.handleSensorError(page, error, sensorType)
    );
    
    // 启动陀螺仪传感器
    SensorManager.startGyroscope(
      Constants.SENSOR_INTERVAL,
      (res) => this.handleGyroscopeData(page, res),
      (error, sensorType) => this.handleSensorError(page, error, sensorType)
    );
    
    console.log('动作识别传感器已启动');
  },
  
  // 处理加速度计数据
  handleAccelerometerData: function(page, res) {
    if (!page.data.isReading) return;
    
    // 更新动作数据
    page.actionData.accXs.push(res.x);
    page.actionData.accYs.push(res.y);
    page.actionData.accZs.push(res.z);
    
    // 更新UI显示数据
    page.setData({
      accelerometerX: res.x.toFixed(5),
      accelerometerY: res.y.toFixed(5),
      accelerometerZ: res.z.toFixed(5)
    });
  },
  
  // 处理陀螺仪数据
  handleGyroscopeData: function(page, res) {
    if (!page.data.isReading) return;
    
    // 更新动作数据
    page.actionData.gyrXs.push(res.x);
    page.actionData.gyrYs.push(res.y);
    page.actionData.gyrZs.push(res.z);
    
    // 更新UI显示数据
    page.setData({
      gyroscopeX: res.x.toFixed(5),
      gyroscopeY: res.y.toFixed(5),
      gyroscopeZ: res.z.toFixed(5)
    });
  },
  
  // 处理传感器错误
  handleSensorError: function(page, error, sensorType) {
    console.error(`${sensorType}传感器错误:`, error);
    
    // 尝试重启传感器
    if (sensorType === 'accelerometer') {
      SensorManager.restartSensor(
        'accelerometer',
        Constants.SENSOR_INTERVAL,
        (res) => this.handleAccelerometerData(page, res),
        (err, type) => this.handleSensorError(page, err, type)
      );
    } else if (sensorType === 'gyroscope') {
      SensorManager.restartSensor(
        'gyroscope',
        Constants.SENSOR_INTERVAL,
        (res) => this.handleGyroscopeData(page, res),
        (err, type) => this.handleSensorError(page, err, type)
      );
    }
    
    // 通知用户
    wx.showToast({
      title: `${sensorType}传感器出错，已尝试恢复`,
      icon: 'none',
      duration: 2000
    });
  },
  
  // 提交数据进行动作识别
  submitDataForRecognition: function(page) {
    if (!page.data.isReading || !page.actionData) return;
    
    const { accXs, accYs, accZs, gyrXs, gyrYs, gyrZs } = page.actionData;
    
    // 确保数据足够
    if (accXs.length < Constants.SAMPLE_SIZE) {
      console.log('样本数据不足，跳过动作识别');
      return;
    }
    
    console.log('提交动作识别数据，样本大小:', Constants.SAMPLE_SIZE);
    
    // 使用动作服务进行识别
    ActionService.recognizeAction(accXs, accYs, accZs, gyrXs, gyrYs, gyrZs)
      .then(result => {
        if (!result || !result.class_name) {
          console.warn('动作识别返回结果无效');
          return;
        }
        
        const action = result.class_name;
        console.log('动作识别结果:', action);
        
        // 更新动作计数
        let action_counts = page.data.action_counts;
        action_counts[action] = (action_counts[action] || 0) + 1;
        
        // 记录动作序列
        const actionSequence = page.data.actionSequence;
        actionSequence.push({
          action: action,
          time: new Date().toLocaleTimeString()
        });
        
        // 限制动作序列长度
        const MAX_ACTION_RECORDS = 50;
        const limitedSequence = actionSequence.length > MAX_ACTION_RECORDS ? 
          actionSequence.slice(-MAX_ACTION_RECORDS) : actionSequence;
        
        // 更新UI
        page.setData({
          current_action: action,
          action_counts: action_counts,
          actionSequence: limitedSequence
        });
      })
      .catch(error => {
        console.error('动作识别失败:', error);
      });
  },
  
  // 清理动作数据
  cleanupActionData: function(actionData) {
    if (!actionData) return this.initActionData();
    
    const MAX_KEEP = Constants.SAMPLE_SIZE * 3;
    
    // 如果数据超过最大保留量，执行清理
    if (actionData.accXs.length > MAX_KEEP) {
      console.log('清理动作数据，清理前长度:', actionData.accXs.length);
      
      return {
        ...actionData,
        accXs: actionData.accXs.slice(-MAX_KEEP),
        accYs: actionData.accYs.slice(-MAX_KEEP),
        accZs: actionData.accZs.slice(-MAX_KEEP),
        gyrXs: actionData.gyrXs.slice(-MAX_KEEP),
        gyrYs: actionData.gyrYs.slice(-MAX_KEEP),
        gyrZs: actionData.gyrZs.slice(-MAX_KEEP)
      };
    }
    
    return actionData;
  }
};

// 导出单例对象
export default ActionManager; 