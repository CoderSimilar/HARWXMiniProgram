import * as echarts from '../../components/ec-canvas/echarts';
const app = getApp();

// 提取所有常量到程序开始处
const DELAY_START = 3000; // 3秒延迟开始
const DURATION = 30000; // 30秒采集时间
const MAX_DATA_POINTS = 1000; // 最大数据点数量
const SERVER_URL = 'http://8.136.10.160:18306/save'; // 服务器地址
const SENSOR_INTERVAL = 'game'; // 传感器采样间隔
const PROGRESS_UPDATE_INTERVAL = 100; // 进度条更新间隔(毫秒)
const COUNTDOWN_INTERVAL = 1000; // 倒计时更新间隔(毫秒)
const TOAST_DURATION = 2000; // 提示框显示时间(毫秒)

Page({
  data: {
    capsuleInfo: app.globalData.capsuleInfo,
    accXs: [],
    accYs: [],
    accZs: [],
    gyroXs: [],
    gyroYs: [],
    gyroZs: [],
    timeLabels: [],
    startTime: 0,
    actionCount: '',
    actionType: '',
    actionTypes: ['WALKING', 'RAISEARM', 'STANDING', 'SQUATDOWN', 'LADDERUP', 'LADDERDOWN', 'UPSTAIR', 'DOWNSTAIR'],
    selectedActionTypeIndex: null,
    isReading: false,
    currentAccX: 0,
    currentAccY: 0,
    currentAccZ: 0,
    currentGyroX: 0,
    currentGyroY: 0,
    currentGyroZ: 0,
    countdownText: '',
    progressPercent: 0
  },

  onLoad() {
    this.audioCtx = wx.createInnerAudioContext();
    this.audioCtx.src = '/OK.m4a';
  },

  onReady() {
    // 不再需要初始化图表
  },

  startAccelerometer() {
    console.log("开始采集加速度计和陀螺仪数据");
    
    // 重置数据
    this.setData({
      accXs: [],
      accYs: [],
      accZs: [],
      gyroXs: [],
      gyroYs: [],
      gyroZs: [],
      timeLabels: [],
      countdownText: '准备采集...',
      progressPercent: 0
    });
    
    // 倒计时显示
    let countdown = Math.floor(DELAY_START / COUNTDOWN_INTERVAL);
    const countdownInterval = setInterval(() => {
      countdown--;
      this.setData({
        countdownText: `准备采集... ${countdown}秒`
      });
      if (countdown <= 0) {
        clearInterval(countdownInterval);
      }
    }, COUNTDOWN_INTERVAL);
    
    // 延迟采集开始
    setTimeout(() => {
      const startTime = new Date().getTime();
      this.setData({ 
        startTime: startTime, 
        isReading: true,
        countdownText: '正在采集数据...'
      });
      
      // 进度条更新
      const progressInterval = setInterval(() => {
        const elapsed = new Date().getTime() - startTime;
        const percent = Math.min(100, (elapsed / DURATION) * 100);
        this.setData({
          progressPercent: percent
        });
      }, PROGRESS_UPDATE_INTERVAL);
      
      // 开始监听加速度计数据
      wx.startAccelerometer({
        interval: SENSOR_INTERVAL,
        success: () => wx.onAccelerometerChange(res => this.handleSensorData('acc', res)),
        fail: err => console.error('Accelerometer start failed', err)
      });

      // 开始监听陀螺仪数据
      wx.startGyroscope({
        interval: SENSOR_INTERVAL,
        success: () => wx.onGyroscopeChange(res => this.handleSensorData('gyro', res)),
        fail: err => console.error('Gyroscope start failed', err)
      });

      // 在采集周期结束后停止采集
      setTimeout(() => {
        wx.offAccelerometerChange();
        wx.stopAccelerometer();
        wx.offGyroscopeChange();
        wx.stopGyroscope();
        clearInterval(progressInterval);

        this.setData({ 
          isReading: false,
          countdownText: '采集完成！',
          progressPercent: 100
        });
        this.audioCtx.play();
      }, DURATION);
    }, DELAY_START);
  },

  handleSensorData(sensorType, res) {
    const time = new Date().toLocaleTimeString();
    const { timeLabels, accXs, accYs, accZs, gyroXs, gyroYs, gyroZs } = this.data;

    // if (accXs.length >= MAX_DATA_POINTS) {
      // accXs.shift();
    //   accYs.shift();
    //   accZs.shift();
    //   gyroXs.shift();
    //   gyroYs.shift();
    //   gyroZs.shift();
    //   timeLabels.shift();
    // }

    if (sensorType === 'acc') {
      accXs.push(res.x);
      accYs.push(res.y);
      accZs.push(res.z);
      this.setData({
        currentAccX: res.x,
        currentAccY: res.y,
        currentAccZ: res.z,
      });
    } else if (sensorType === 'gyro') {
      gyroXs.push(res.x);
      gyroYs.push(res.y);
      gyroZs.push(res.z);
      this.setData({
        currentGyroX: res.x,
        currentGyroY: res.y,
        currentGyroZ: res.z,
      });
    }
    timeLabels.push(time);

    this.setData({ accXs, accYs, accZs, gyroXs, gyroYs, gyroZs, timeLabels });
  },

  uploadData() {
    // 默认动作次数和类型为0，WALKING
    if (!this.data.actionCount) this.setData({ actionCount: '0' }); 
    if (this.data.selectedActionTypeIndex === null) this.setData({ selectedActionTypeIndex: 0 });
    
    const data = {
      accXs: this.data.accXs,
      accYs: this.data.accYs,
      accZs: this.data.accZs,
      gyroXs: this.data.gyroXs,
      gyroYs: this.data.gyroYs,
      gyroZs: this.data.gyroZs,
      actionCount: this.data.actionCount,
      actionType: this.data.selectedActionTypeIndex + 1
    };

    wx.showLoading({ title: '上传中...' });
    wx.request({
      url: SERVER_URL,
      data: { data: JSON.stringify(data) },
      method: 'POST',
      header: {
        'content-type': 'application/x-www-form-urlencoded',
        'charset': 'utf-8'
      },
      success: res => {
        wx.hideLoading();
        wx.showToast({
          title: '上传成功',
          icon: 'success',
          duration: TOAST_DURATION
        });
      },
      fail: res => {
        wx.hideLoading();
        wx.showToast({
          title: '上传失败',
          icon: 'error',
          duration: TOAST_DURATION
        });
        console.error('Data upload failed', res);
      }
    });
  },

  onActionCountInput(e) {
    this.setData({ actionCount: e.detail.value });
  },

  selectActionType(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      actionType: this.data.actionTypes[index],
      selectedActionTypeIndex: index
    });
  }
});
