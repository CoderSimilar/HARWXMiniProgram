import * as Constants from '../config/constants.js'
import * as StepCounter from './step-counter.js'
import SensorManager from './sensor-manager.js'

/**
 * 步数管理模块 - 提供步数检测和统计相关功能
 */
const StepManager = {
  // 初始化步数检测器
  initStepDetector: function() {
    return {
      accNormValues: [],
      accTimestamps: [],
      peakIndices: [],
      lastPeakTime: 0,
      stepCount: 0,
      lastMinuteStepCount: 0
    };
  },
  
  // 启动步数检测
  startStepDetection: function(page) {
    // 初始化步数检测器（如果未初始化）
    if (!page.stepDetector) {
      page.stepDetector = this.initStepDetector();
    }
    
    // 启动加速度计 - 专用于步数检测
    this.startStepAccelerometer(page);
    
    // 设置步数检测定时器
    page.timers.stepDetection = setInterval(
      () => this.processStepData(page),
      Constants.STEP_UPDATE_INTERVAL
    );
    
    console.log('步数检测已启动');
  },
  
  // 启动专用于步数检测的加速度计
  startStepAccelerometer: function(page) {
    // 定义步数加速度计数据处理函数
    page.stepAccListener = (res) => {
      if (!page.data.tracking) return;
      
      // 计算加速度的模
      const accNorm = Math.sqrt(res.x*res.x + res.y*res.y + res.z*res.z);
      const timestamp = new Date().getTime();
      
      // 更新步数检测器数据
      page.stepDetector.accNormValues.push(accNorm);
      page.stepDetector.accTimestamps.push(timestamp);
      
      // 限制数据长度
      const MAX_STEP_DATA = Constants.SAMPLE_SIZE * 2;
      if (page.stepDetector.accNormValues.length > MAX_STEP_DATA) {
        page.stepDetector.accNormValues = page.stepDetector.accNormValues.slice(-MAX_STEP_DATA);
        page.stepDetector.accTimestamps = page.stepDetector.accTimestamps.slice(-MAX_STEP_DATA);
      }
    };
    
    // 启动加速度计并监听
    SensorManager.startAccelerometer(
      Constants.SENSOR_INTERVAL,
      page.stepAccListener,
      (error, sensorType) => {
        console.error('步数检测加速度计错误:', error);
        
        // 尝试重启传感器
        SensorManager.restartSensor(
          'accelerometer',
          Constants.SENSOR_INTERVAL,
          page.stepAccListener,
          null
        );
      }
    );
  },
  
  // 处理步数数据
  processStepData: function(page) {
    if (!page.stepDetector || page.stepDetector.accNormValues.length < 10) return;
    
    const { accNormValues, accTimestamps, lastPeakTime } = page.stepDetector;
    
    // 使用步数计数器模块处理
    const filteredValues = StepCounter.movingAverageFilter(
      accNormValues, 
      Constants.MOVING_AVERAGE_WINDOW
    );
    
    const results = StepCounter.detectNewPeaks(
      filteredValues,
      accTimestamps,
      lastPeakTime,
      Constants.PEAK_THRESHOLD,
      Constants.MIN_PEAK_DISTANCE_S
    );
    
    // 更新检测器状态
    page.stepDetector.lastPeakTime = results.lastPeakTime;
    page.stepDetector.peakIndices = results.peakIndices;
    
    // 只有在检测到新步数时才更新UI
    if (results.newStepCount > 0) {
      const newTotalSteps = page.data.stepCount + results.newStepCount;
      page.setData({ 
        stepCount: newTotalSteps,
        peakIndices: results.peakIndices.slice(-100)  // 只保留最近的100个峰值用于显示
      });
      
      console.log('步数更新：检测到新步数', results.newStepCount, 
                  '累计总步数', newTotalSteps,
                  '当前数据长度:', page.stepDetector.accNormValues.length);
    }
  },
  
  // 记录每分钟步数统计
  recordStepStats: function(page) {
    if (!page.data.tracking) return;
    
    const currentTime = new Date().getTime();
    const currentSteps = page.data.stepCount;
    const stepsSinceLastRecord = currentSteps - page.data.lastMinuteStepCount;
    
    // 添加到步数统计数据
    page.data.cachedStepsData.push({
      timestamp: currentTime,
      stepCount: currentSteps,
      stepsDelta: stepsSinceLastRecord
    });
    
    // 更新最后记录的步数
    page.setData({
      lastMinuteStepCount: currentSteps,
      cachedStepsData: page.data.cachedStepsData
    });
    
    console.log('记录步数统计: 当前总步数', currentSteps, 
                '本分钟新增', stepsSinceLastRecord,
                '统计记录总数', page.data.cachedStepsData.length);
  }
};

// 导出单例对象
export default StepManager; 