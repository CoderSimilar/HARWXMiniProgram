// 在文件顶部引入wx-charts
const wxCharts = require('../../utils/wxcharts.js');

// Constants
const ACTION_TYPES = ['walking', 'standing', 'raisearm', 'standing', 'ladderup', 'ladderdown', 'standing', 'walking'];
const SAMPLE_SIZE = 128;
const SENSOR_INTERVAL = 'game';
const API_BASE_URL = 'http://8.136.10.160:18306';
const SUBMIT_INTERVAL = 3000;
const VERIFY_DELAY = 0;
const HEADERS = {
  'content-type': 'application/x-www-form-urlencoded',
  'chartset': 'utf-8'
};
const CHART_COLORS = ['#7cb5ec', '#f7a35c', '#90ed7d', '#e74c3c', '#434348', '#8e44ad', '#2ecc71', '#f1c40f'];

// 步数统计相关常量
const STEP_UPDATE_INTERVAL = 1000; // 步数更新频率 (毫秒)
const SAMPLE_RATE = 50; // 加速度传感器采样率估计值 (Hz)
const PEAK_THRESHOLD = 0.2; // 峰值检测阈值
const MIN_PEAK_DISTANCE_S = 0.25; // 最小峰值间隔 (秒)
const MOVING_AVERAGE_WINDOW = 5; // 滑动平均窗口大小

// Global variables
var submit;
var cleanupTimer;
var stepDetectionTimer;

Page({
  data: {
    literal: '开始检测',
    result: [],
    current_action: '暂无',
    action_number: 0,
    detail: false,
    all_data: {},
    accXs: [],
    accYs: [],
    accZs: [],
    gyrXs: [],
    gyrYs: [],
    gyrZs: [],
    action_counts: {},
    isReading: false,
    canvasWidth: 0,
    canvasHeight: 0,
    actionSequence: [], // 存储动作序列及时间戳
    timeSeriesCanvasWidth: 0,
    timeSeriesCanvasHeight: 0,
    startTime: 0,
    value: 0,
    displayValue: 0,
    accelerometerX: 0,
    accelerometerY: 0,
    accelerometerZ: 0,
    gyroscopeX: 0,
    gyroscopeY: 0,
    gyroscopeZ: 0,
    // 步数统计相关数据
    stepCount: 0,        // 当前检测到的步数
    accNormValues: [],   // 加速度模值数组
    accTimestamps: [],   // 加速度时间戳
    peakIndices: [],     // 峰值索引
    lastStepTime: 0,     // 上次计步时间戳
    showStepChart: false // 是否显示计步图表
  },

  onLoad: function () {
    const windowInfo = wx.getWindowInfo();
    this.setData({
      canvasWidth: windowInfo.windowWidth,
      canvasHeight: 300,
      timeSeriesCanvasWidth: windowInfo.windowWidth,
      timeSeriesCanvasHeight: 300
    });
  },

  onUnload: function () {
    // Cleanup when page unloads
    if (this.data.isReading) {
      this.stopSensors();
    }

    // 清空数据数组，避免内存泄漏
    this.setData({
      accXs: [],
      accYs: [],
      accZs: [],
      gyrXs: [],
      gyrYs: [],
      gyrZs: [],
      actionSequence: [],
      action_counts: {},
      accNormValues: [], 
      accTimestamps: [],
      peakIndices: []
    });

    console.log('页面卸载，资源已释放');
  },

  // 开始动作识别和步数检测
  startActionRecognition: function () {
    try {
      if (this.data.isReading) {
        wx.showToast({
          title: '已经在识别中',
          icon: 'none'
        });
        return;
      }

      let accXs = []; // 临时数据
      let accYs = [];
      let accZs = [];
      let gyrXs = [];
      let gyrYs = [];
      let gyrZs = [];

      this.setData({
        startTime: new Date().getTime(),
        isReading: true,
        displayValue: 0,
        value: 0,
        accXs: [],
        accYs: [],
        accZs: [],
        gyrXs: [],
        gyrYs: [],
        gyrZs: [],
        action_counts: {},
        actionSequence: [],
        current_action: '等待识别...',
        literal: '显示详细信息',
        // 重置步数相关数据
        stepCount: 0,
        accNormValues: [],
        accTimestamps: [],
        peakIndices: [],
        lastStepTime: new Date().getTime(),
        showStepChart: false
      });

      // 不再设置自动停止的定时器

      // 设置定期提交数据的定时器
      submit = setInterval(this.submit.bind(this), SUBMIT_INTERVAL);

      // 添加定期清理计时器，每15秒执行一次
      cleanupTimer = setInterval(this.cleanupOldData.bind(this), 15000);
      
      // 添加定期更新步数的计时器
      stepDetectionTimer = setInterval(this.detectSteps.bind(this), STEP_UPDATE_INTERVAL);

      this.startAccelerometer(accXs, accYs, accZs);
      this.startGyroscope(gyrXs, gyrYs, gyrZs);

      wx.showToast({
        title: '开始动作识别和计步',
        icon: 'success'
      });
    } catch (error) {
      console.error('Error in startActionRecognition:', error);
      wx.showToast({
        title: '传感器初始化失败',
        icon: 'none'
      });
    }
  },

  // 结束动作识别和步数检测
  stopActionRecognition: function () {
    if (!this.data.isReading) {
      wx.showToast({
        title: '没有正在进行的识别',
        icon: 'none'
      });
      return;
    }

    this.stopSensors();
    this.setData({
      isReading: false,
      literal: '显示详细信息'
    });

    wx.showToast({
      title: '动作识别已停止',
      icon: 'success'
    });
  },

  // 保留原有的test函数以便向后兼容
  test: function () {
    this.startActionRecognition();
  },

  stopSensors: function () {
    wx.offAccelerometerChange();
    wx.offGyroscopeChange();
    wx.stopAccelerometer({});
    wx.stopGyroscope({});

    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }

    if (submit) {
      clearInterval(submit);
      submit = null;
    }

    if (cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
    
    if (stepDetectionTimer) {
      clearInterval(stepDetectionTimer);
      stepDetectionTimer = null;
    }

    console.log('传感器已停止，计时器已清除');
  },

  // 清理旧数据，仅保留最新的部分
  cleanupOldData: function () {
    if (!this.data.isReading) return;

    const {
      accXs,
      accYs,
      accZs,
      gyrXs,
      gyrYs,
      gyrZs,
      accNormValues,
      accTimestamps
    } = this.data;

    // 如果数据量超过了我们需要的2倍，则清理掉旧数据
    if (accXs.length > SAMPLE_SIZE * 2) {
      console.log('执行定期数据清理，清理前长度:', accXs.length);

      // 仅保留最新的数据
      const newAccXs = accXs.slice(-SAMPLE_SIZE * 2);
      const newAccYs = accYs.slice(-SAMPLE_SIZE * 2);
      const newAccZs = accZs.slice(-SAMPLE_SIZE * 2);
      const newGyrXs = gyrXs.slice(-SAMPLE_SIZE * 2);
      const newGyrYs = gyrYs.slice(-SAMPLE_SIZE * 2);
      const newGyrZs = gyrZs.slice(-SAMPLE_SIZE * 2);
      
      // 同时清理计步相关数据，仅保留最新的1000个点
      const MAX_STEP_DATA_POINTS = 1000;
      const newAccNormValues = accNormValues.length > MAX_STEP_DATA_POINTS 
        ? accNormValues.slice(-MAX_STEP_DATA_POINTS) 
        : accNormValues;
      const newAccTimestamps = accTimestamps.length > MAX_STEP_DATA_POINTS 
        ? accTimestamps.slice(-MAX_STEP_DATA_POINTS) 
        : accTimestamps;

      this.setData({
        accXs: newAccXs,
        accYs: newAccYs,
        accZs: newAccZs,
        gyrXs: newGyrXs,
        gyrYs: newGyrYs,
        gyrZs: newGyrZs,
        accNormValues: newAccNormValues,
        accTimestamps: newAccTimestamps
      });

      console.log('数据清理完成，清理后长度:', newAccXs.length);
    }
  },

  startAccelerometer: function (accXs, accYs, accZs) {
    var _this = this;
    wx.startAccelerometer({
      interval: SENSOR_INTERVAL,
      success: res => {
        console.log("加速度计调用成功");
        wx.onAccelerometerChange(function (res) {
          // 如果已经停止读取，忽略传感器数据
          if (!_this.data.isReading) return;

          let cur_time = new Date().getTime();
          let timeStep = (cur_time - _this.data.startTime) / 1000;
          
          const accX = res.x;
          const accY = res.y;
          const accZ = res.z;
          
          // 计算加速度模值，用于步数检测
          const accNorm = Math.sqrt(accX * accX + accY * accY + accZ * accZ);
          
          // 更新加速度模值数组和时间戳
          let accNormValues = _this.data.accNormValues;
          let accTimestamps = _this.data.accTimestamps;
          
          accNormValues.push(accNorm);
          accTimestamps.push(cur_time);
          
          _this.setData({
            value: parseInt(timeStep),
            displayValue: parseInt(timeStep),
            accelerometerX: parseFloat(accX.toFixed(5)),
            accelerometerY: parseFloat(accY.toFixed(5)),
            accelerometerZ: parseFloat(accZ.toFixed(5)),
            accNormValues: accNormValues,
            accTimestamps: accTimestamps
          });

          // 添加新数据并限制数组长度
          accXs.push(accX);
          accYs.push(accY);
          accZs.push(accZ);

          // 限制数组长度，防止无限增长
          if (accXs.length > SAMPLE_SIZE * 2) {
            accXs.splice(0, accXs.length - SAMPLE_SIZE * 2);
            accYs.splice(0, accYs.length - SAMPLE_SIZE * 2);
            accZs.splice(0, accZs.length - SAMPLE_SIZE * 2);
          }

          _this.setData({
            accXs,
            accYs,
            accZs
          });
        });
      },
      fail: res => console.error('Accelerometer failed:', res)
    });
  },

  startGyroscope: function (gyrXs, gyrYs, gyrZs) {
    var _this = this;
    wx.startGyroscope({
      interval: SENSOR_INTERVAL,
      success: res => {
        console.log("陀螺仪调用成功");
        wx.onGyroscopeChange(function (res1) {
          // 如果已经停止读取，忽略传感器数据
          if (!_this.data.isReading) return;

          // 添加新数据并限制数组长度
          gyrXs.push(res1.x);
          gyrYs.push(res1.y);
          gyrZs.push(res1.z);

          // 限制数组长度，防止无限增长
          if (gyrXs.length > SAMPLE_SIZE * 2) {
            gyrXs.splice(0, gyrXs.length - SAMPLE_SIZE * 2);
            gyrYs.splice(0, gyrYs.length - SAMPLE_SIZE * 2);
            gyrZs.splice(0, gyrZs.length - SAMPLE_SIZE * 2);
          }

          _this.setData({
            gyroscopeX: parseFloat(res1.x.toFixed(5)),
            gyroscopeY: parseFloat(res1.y.toFixed(5)),
            gyroscopeZ: parseFloat(res1.z.toFixed(5)),
            gyrXs,
            gyrYs,
            gyrZs
          });
        });
      },
      fail: res1 => console.error('Gyroscope failed:', res1)
    });
  },
  
  // 实现步数检测算法
  detectSteps: function() {
    if (!this.data.isReading || this.data.accNormValues.length < 10) {
      return;
    }
    
    const { accNormValues, accTimestamps } = this.data;
    
    // 滑动平均滤波
    const filteredValues = this.movingAverageFilter(accNormValues, MOVING_AVERAGE_WINDOW);
    
    // 峰值检测
    const results = this.detectPeaks(
      filteredValues, 
      accTimestamps, 
      SAMPLE_RATE, 
      PEAK_THRESHOLD, 
      MIN_PEAK_DISTANCE_S
    );
    
    this.setData({
      stepCount: results.stepCount,
      peakIndices: results.peakIndices
    });
    
    console.log('当前检测到步数：', results.stepCount);
  },
  
  // 滑动平均滤波
  movingAverageFilter: function(data, windowSize = 5) {
    const filtered = [];
    let windowSum = 0;
    const queue = [];

    for (let i = 0; i < data.length; i++) {
      queue.push(data[i]);
      windowSum += data[i];

      if (queue.length > windowSize) {
        windowSum -= queue.shift();
      }
      // 输出滑动窗口平均值
      filtered.push(windowSum / queue.length);
    }
    return filtered;
  },
  
  // 峰值检测
  detectPeaks: function(accNorm, timestamps, sampleRate, threshold = 0.2, minPeakDistanceS = 0.25) {
    const minPeakDistance = Math.floor(minPeakDistanceS * sampleRate);
    let stepCount = 0;
    const peakIndices = [];

    let lastPeak = -9999;

    for (let i = 1; i < accNorm.length - 1; i++) {
      // 简易极大值判定
      if (accNorm[i] > threshold &&
          accNorm[i] > accNorm[i - 1] &&
          accNorm[i] > accNorm[i + 1]) {

        if ((i - lastPeak) > minPeakDistance) {
          stepCount++;
          peakIndices.push(i);
          lastPeak = i;
        }
      }
    }

    return {
      stepCount,
      peakIndices
    };
  },
  
  // 绘制步数图表
  drawStepChart: function() {
    if (this.data.accNormValues.length < 10) {
      wx.showToast({
        title: '数据不足，无法生成图表',
        icon: 'none'
      });
      return;
    }
    
    try {
      const { accNormValues, peakIndices } = this.data;
      
      // 滤波后的数据
      const filteredValues = this.movingAverageFilter(accNormValues, MOVING_AVERAGE_WINDOW);
      
      // 准备图表数据 - 前200个点足够展示
      const displayLength = Math.min(200, filteredValues.length);
      const chartData = filteredValues.slice(-displayLength);
      const categories = Array.from({ length: displayLength }, (_, i) => i);
      
      // 准备峰值数据
      const peakData = new Array(displayLength).fill(null);
      for (const peakIndex of peakIndices) {
        // 确保峰值点在显示范围内
        const displayIndex = peakIndex - (filteredValues.length - displayLength);
        if (displayIndex >= 0 && displayIndex < displayLength) {
          peakData[displayIndex] = chartData[displayIndex];
        }
      }
      
      // 绘制图表
      new wxCharts({
        canvasId: 'stepChart',
        type: 'line',
        categories: categories,
        series: [{
          name: '加速度模值',
          data: chartData,
          color: '#1aad19'
        }, {
          name: '检测到的步数',
          data: peakData,
          color: '#e64340',
          pointShape: true
        }],
        width: this.data.canvasWidth,
        height: this.data.canvasHeight,
        xAxis: {
          title: '采样点',
          fontColor: '#666666',
          disableGrid: true
        },
        yAxis: {
          title: '加速度模值',
          min: 0,
          fontColor: '#666666'
        },
        extra: {
          lineStyle: 'curve'
        }
      });
      
      this.setData({
        showStepChart: true
      });
    } catch (error) {
      console.error('Error creating step chart:', error);
      wx.showToast({
        title: '步数图表创建失败',
        icon: 'none'
      });
    }
  },

  // submit定时器，每隔三秒提交一次数据
  submit: function () {
    if (this.data.accXs.length < SAMPLE_SIZE || !this.data.isReading) {
      console.log('数据不足或已停止读取，跳过提交');
      return;
    }
    // 每次上传的数据
    var data = {
      accXs: this.data.accXs.slice(-SAMPLE_SIZE),
      accYs: this.data.accYs.slice(-SAMPLE_SIZE),
      accZs: this.data.accZs.slice(-SAMPLE_SIZE),
      gyrXs: this.data.gyrXs.slice(-SAMPLE_SIZE),
      gyrYs: this.data.gyrYs.slice(-SAMPLE_SIZE),
      gyrZs: this.data.gyrZs.slice(-SAMPLE_SIZE),
    };

    console.log('提交动作识别数据，样本大小:', SAMPLE_SIZE, '当前数组长度:', this.data.accXs.length);
    this.data.all_data = [data];

    // 将数据传递给服务器，获取预测结果
    wx.request({
      url: `${API_BASE_URL}/recognize`,
      data: {
        data: JSON.stringify(data) // 设置请求的数据参数
      },
      method: "POST",
      header: HEADERS,
      success: res => {
        // 检查是否仍在读取中
        if (!this.data.isReading) {
          console.log('已停止读取，忽略返回结果');
          return;
        }

        console.log('预测结果：', res.data, '成功');

        // 获取识别结果（从响应中获取动作名称）
        let detected_action = res.data.class_name;

        // 记录动作及时间
        const actionRecord = {
          action: detected_action,
          timestamp: new Date().getTime(),
          index: this.data.actionSequence.length
        };

        // 识别结果返回的是动作名称：
        this.setData({
          current_action: res.data.class_name,
          actionSequence: [...this.data.actionSequence, actionRecord]
        });

        // Update action counts
        let action_counts = this.data.action_counts;
        if (action_counts[detected_action]) {
          action_counts[detected_action]++;
        } else {
          action_counts[detected_action] = 1;
        }
        this.setData({
          action_counts: action_counts
        });

        // 执行数据清理，避免过度堆积
        this.cleanupOldData();
      },
      fail: res => {
        console.log('动作识别请求失败:', res);
        // 请求失败时也执行清理，防止数据无限累积
        this.cleanupOldData();
      }
    });
  },

  // 再来一次
  Reset: function () {
    // 确保停止所有传感器和计时器
    this.stopSensors();

    wx.redirectTo({
      url: '/pages/recognize/recognize'
    });
  },

  clickVerify: function () {
    var that = this;
    if (that.data.literal == '开始检测') {
      setTimeout(function () {
        that.setData({
          literal: '正在检测'
        });
        that.startActionRecognition();
      }, VERIFY_DELAY);
    }
    if (that.data.literal == '显示详细信息') {
      that.setData({
        detail: true
      });
      wx.showLoading({
        title: '计算中...'
      });

      // Convert action_counts to array format
      const actionCounts = that.objToStrMap(that.data.action_counts);
      that.setData({
        action_number: actionCounts
      });

      // 绘制饼图
      that.drawPieChart(actionCounts);
      // 绘制时序图
      that.drawTimeSeriesChart();
      // 绘制步数图表
      that.drawStepChart();
      wx.hideLoading();
    }
  },

  // 添加绘制饼图的方法
  drawPieChart: function (actionCounts) {
    try {
      // 处理数据格式
      const series = actionCounts.map(item => ({
        name: item.keys,
        data: parseInt(item.value) // Ensure value is a number
      }));

      const pieChart = new wxCharts({
        animation: true,
        canvasId: 'pieCanvas',
        type: 'pie',
        series: series,
        width: this.data.canvasWidth,
        height: this.data.canvasHeight,
        dataLabel: true,
        legend: true,
        background: '#ffffff',
        padding: 0
      });
    } catch (error) {
      console.error('Error creating pie chart:', error);
      wx.showToast({
        title: '图表创建失败',
        icon: 'none'
      });
    }
  },

  // 将对象转换为数组格式
  objToStrMap: function (obj) {
    // 将对象转换为 [{keys: actionName, value: count}] 格式
    return Object.entries(obj).map(([keys, value]) => ({
      keys,
      value
    }));
  },

  // 添加绘制时序图的方法
  drawTimeSeriesChart: function () {
    try {
      const {
        actionSequence
      } = this.data;

      // Validate actionSequence
      if (!actionSequence || actionSequence.length === 0) {
        console.warn('No action sequence data to display');
        return;
      }

      // Make sure each item in actionSequence has the expected properties
      const validSequence = actionSequence.filter(item => item && item.action);

      if (validSequence.length === 0) {
        console.warn('No valid action sequence data');
        return;
      }

      const categories = validSequence.map((_, index) => `T${index + 1}`);

      // 创建数值映射，将动作名称映射到数字
      const actionToIndex = {};
      ACTION_TYPES.forEach((action, index) => {
        if (action) actionToIndex[action] = index;
      });

      // 将动作序列映射为数值 - add validation
      const seriesData = validSequence.map(item => {
        // Safely handle item.action potentially being undefined
        if (!item.action) return -1;

        // 如果动作在预定义列表中，使用映射的索引，否则使用默认值
        return actionToIndex[item.action] !== undefined ?
          actionToIndex[item.action] : -1;
      });

      new wxCharts({
        canvasId: 'timeSeriesCanvas',
        type: 'line',
        categories: categories,
        series: [{
          name: '动作序列',
          data: seriesData,
          color: CHART_COLORS[0], // 使用预定义颜色
          format: function (val) {
            // Safe check for val being a valid index
            if (val === null || val === undefined || val < 0 || val >= ACTION_TYPES.length) {
              return '未知动作';
            }
            return ACTION_TYPES[val] || '未知动作';
          }
        }],
        width: this.data.timeSeriesCanvasWidth,
        height: this.data.timeSeriesCanvasHeight,
        xAxis: {
          title: '时间序列',
          fontColor: '#666666',
          disableGrid: false
        },
        yAxis: {
          title: '动作类型',
          min: -1,
          max: ACTION_TYPES.length,
          format: function (val) {
            // Safe check before returning value
            if (val === null || val === undefined || val < 0 || val >= ACTION_TYPES.length) {
              return '';
            }
            return ACTION_TYPES[val] || '';
          },
          gridColor: '#e0e0e0'
        },
        legend: false,
        dataLabel: true,
        dataPointShape: true,
        extra: {
          lineStyle: 'curve',
          tooltip: {
            show: true,
            backgroundColor: 'rgba(0,0,0,0.7)',
            fontColor: '#fff'
          }
        }
      });
    } catch (error) {
      console.error('Error creating time series chart:', error);
      wx.showToast({
        title: '时序图创建失败',
        icon: 'none'
      });
    }
  }
});