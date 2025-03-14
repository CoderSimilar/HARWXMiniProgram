// 在文件顶部引入wx-charts
const wxCharts = require('../../utils/wxcharts.js');

// Constants
const ACTION_TYPES = ['walking', 'standing', 'raisearm', 'standing', 'ladderup', 'ladderdown', 'standing', 'walking'];
const SAMPLE_SIZE = 128;
const SENSOR_INTERVAL = 'game';
const API_BASE_URL = 'http://8.136.10.160:18306';
const SUBMIT_INTERVAL = 3000;
const DETECTION_TIMEOUT = 30150;
const VERIFY_DELAY = 0;
const HEADERS = {
  'content-type': 'application/x-www-form-urlencoded',
  'chartset': 'utf-8'
};
const CHART_COLORS = ['#7cb5ec', '#f7a35c', '#90ed7d', '#e74c3c', '#434348', '#8e44ad', '#2ecc71', '#f1c40f'];

// Global variables
var timer;
var submit;

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
    timeSeriesCanvasHeight: 0
  },

  onLoad: function() {
    const windowInfo = wx.getWindowInfo();
    this.setData({
      canvasWidth: windowInfo.windowWidth,
      canvasHeight: 300,
      timeSeriesCanvasWidth: windowInfo.windowWidth,
      timeSeriesCanvasHeight: 300
    });
  },

  onUnload: function() {
    // Cleanup when page unloads
    if (this.data.isReading) {
      wx.offAccelerometerChange();
      wx.offGyroscopeChange();
      wx.stopAccelerometer({});
      wx.stopGyroscope({});
      clearInterval(timer);
      clearInterval(submit);
    }
  },

  test: function () {
    try {
      let accXs = []; // 临时数据
      let accYs = [];
      let accZs = [];
      let gyrXs = [];
      let gyrYs = [];
      let gyrZs = [];
      var _this = this;
      this.setData({ startTime: new Date().getTime(), isReading: true, displayValue: 0, value: 0 });
      
      // 设置定时器，30秒后执行
      setTimeout(function () {
        console.log("stop"); // 控制台打印stop
        _this.stopSensors();
        _this.setData({ 
          isReading: false, 
          literal: '显示详细信息',
          accXs: accXs, 
          accYs: accYs, 
          accZs: accZs, 
          gyrXs: gyrXs, 
          gyrYs: gyrYs, 
          gyrZs: gyrZs,
        });
      }, DETECTION_TIMEOUT);
      
      submit = setInterval(_this.submit.bind(_this), SUBMIT_INTERVAL); // 每隔3秒执行一次submit方法
      
      this.startAccelerometer(accXs, accYs, accZs);
      this.startGyroscope(gyrXs, gyrYs, gyrZs);
    } catch (error) {
      console.error('Error in test:', error);
      wx.showToast({
        title: '传感器初始化失败',
        icon: 'none'
      });
    }
  },

  stopSensors: function() {
    wx.offAccelerometerChange();
    wx.offGyroscopeChange();
    wx.stopAccelerometer({});
    wx.stopGyroscope({});
    clearInterval(timer);
    clearInterval(submit);
  },

  startAccelerometer: function(accXs, accYs, accZs) {
    var _this = this;
    wx.startAccelerometer({
      interval: SENSOR_INTERVAL,
      success: res => {
        console.log("加速度计调用成功");
        wx.onAccelerometerChange(function(res) {
          let cur_time = new Date().getTime();
          let timeStep = (cur_time - _this.data.startTime) / 1000;
          _this.setData({ 
            value: parseInt(timeStep), 
            displayValue: parseInt(timeStep),
            accelerometerX: parseFloat(res.x.toFixed(5)),
            accelerometerY: parseFloat(res.y.toFixed(5)),
            accelerometerZ: parseFloat(res.z.toFixed(5))
          });
          accXs.push(res.x);
          accYs.push(res.y);
          accZs.push(res.z);
          _this.setData({ accXs, accYs, accZs });
        });
      },
      fail: res => console.error('Accelerometer failed:', res)
    });
  },

  startGyroscope: function(gyrXs, gyrYs, gyrZs) {
    var _this = this;
    wx.startGyroscope({
      interval: SENSOR_INTERVAL,
      success: res => {
        console.log("陀螺仪调用成功");
        wx.onGyroscopeChange(function(res1) {
          gyrXs.push(res1.x);
          gyrYs.push(res1.y);
          gyrZs.push(res1.z);
          _this.setData({
            gyroscopeX: parseFloat(res1.x.toFixed(5)),
            gyroscopeY: parseFloat(res1.y.toFixed(5)),
            gyroscopeZ: parseFloat(res1.z.toFixed(5)),
            gyrXs, gyrYs, gyrZs
          });
        });
      },
      fail: res1 => console.error('Gyroscope failed:', res1)
    });
  },

  // submit定时器，每隔三秒提交一次数据
  submit: function () {
    if (this.data.accXs.length < SAMPLE_SIZE) {
      return ;
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

    this.data.all_data = [data];

    console.log("上传数据长度：", data.accXs.length); // 打印数据
    console.log("上传数据：", data)
    // 将数据传递给服务器，获取预测结果
    wx.request({
      url: `${API_BASE_URL}/recognize`,
      data: {
        data: JSON.stringify(data) // 设置请求的数据参数
      },
      method: "POST",
      header: HEADERS,
      success: res => {
        console.log('预测结果：', res.data, '成功');

        // 获取识别结果（从响应中获取动作名称）
        let detected_action = res.data.class_name;

        // 记录动作及时间
        const actionRecord = {
          action: detected_action,
          timestamp: new Date().getTime(),
          index: this.data.actionSequence.length
        };

        // 识别结果返回的是动作序号：
        // this.setData({
        //   current_action: detected_action,
        //   actionSequence: [...this.data.actionSequence, actionRecord]
        // });
        // 识别结果返回的是动作名称：
        this.setData({
          current_action: res.data.class_name,
          actionSequence: [...this.data.actionSequence, actionRecord]
        });
        var number = parseInt(res.data) - 1;

        
        // Update action counts
        let action_counts = this.data.action_counts;
        if (action_counts[detected_action]) {
          action_counts[detected_action]++;
        } else {
          action_counts[detected_action] = 1;
        }
        this.setData({ 
          action_counts: action_counts,
          // 清空临时数据，准备下一次采集
          accXs: [], accYs: [], accZs: [], gyrXs: [], gyrYs: [], gyrZs: [] 
        });
      },
      fail: res => {
        console.log(res, '失败');
      }
    });
  },

  // 再来一次
  Reset: function () {
    wx.redirectTo({
      url: '/pages/recognize/recognize'
    });
  },
  clickVerify: function () {
    var that = this;
    if (that.data.literal == '开始检测') {
      setTimeout(function () {
        that.setData({ literal: '正在检测' });
        that.test();
      }, VERIFY_DELAY);
    }
    if (that.data.literal == '显示详细信息') {
      that.setData({ detail: true });
      wx.showLoading({ title: '计算中...' });

      // Convert action_counts to array format
      const actionCounts = that.objToStrMap(that.data.action_counts);
      that.setData({
        action_number: actionCounts
      });
      
      // 绘制饼图
      that.drawPieChart(actionCounts);
      // 绘制时序图
      that.drawTimeSeriesChart();
      wx.hideLoading();
    }
  },

  // 添加绘制饼图的方法
  drawPieChart: function(actionCounts) {
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
  objToStrMap: function(obj) {
    // 将对象转换为 [{keys: actionName, value: count}] 格式
    return Object.entries(obj).map(([keys, value]) => ({
      keys,
      value
    }));
  },

  // 添加绘制时序图的方法
  drawTimeSeriesChart: function() {
    try {
      const { actionSequence } = this.data;
      
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
          format: function(val) {
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
          format: function(val) {
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
