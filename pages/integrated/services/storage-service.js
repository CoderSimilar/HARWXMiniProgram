import * as Constants from '../config/constants.js'

// 保存数据到本地存储
export function saveDataToStorage(locationData, stepsData) {
  try {
    // 保存位置数据
    if (locationData.length > 0) {
      wx.setStorageSync(Constants.STORAGE_KEY_LOCATION, JSON.stringify(locationData))
      console.log('位置数据已保存到本地存储，共', locationData.length, '条记录')
    }
    
    // 保存步数数据
    if (stepsData.length > 0) {
      wx.setStorageSync(Constants.STORAGE_KEY_STEPS, JSON.stringify(stepsData))
      console.log('步数数据已保存到本地存储，共', stepsData.length, '条记录')
    }
    
    return true
  } catch (error) {
    console.error('保存数据到本地存储失败:', error)
    return false
  }
}

// 加载缓存数据
export function loadCachedData() {
  try {
    // 加载位置数据
    const locationDataStr = wx.getStorageSync(Constants.STORAGE_KEY_LOCATION)
    const locationData = locationDataStr ? JSON.parse(locationDataStr) : []
    
    // 加载步数数据
    const stepsDataStr = wx.getStorageSync(Constants.STORAGE_KEY_STEPS)
    const stepsData = stepsDataStr ? JSON.parse(stepsDataStr) : []
    
    return { locationData, stepsData }
  } catch (error) {
    console.error('加载缓存数据失败:', error)
    return { locationData: [], stepsData: [] }
  }
}

// 并行同步数据到服务器
export function syncDataWithServer(apiBaseUrl, locationData, stepsData, lastSyncedLocationIndex, lastSyncedStepsIndex) {
  return new Promise((resolve) => {
    // 输入验证和安全检查
    if (!Array.isArray(locationData)) locationData = [];
    if (!Array.isArray(stepsData)) stepsData = [];
    
    // 确保索引是有效数字
    lastSyncedLocationIndex = Math.max(0, parseInt(lastSyncedLocationIndex) || 0);
    lastSyncedStepsIndex = Math.max(0, parseInt(lastSyncedStepsIndex) || 0);
    
    // 检查是否有新数据需要同步
    const newLocationData = locationData.slice(lastSyncedLocationIndex);
    const newStepsData = stepsData.slice(lastSyncedStepsIndex);
    
    // 结果对象
    const result = {
      lastSyncedLocationIndex,
      lastSyncedStepsIndex,
      locationSuccess: false,
      stepsSuccess: false
    };
    
    // 如果没有新数据需要同步，立即返回
    if (newLocationData.length === 0 && newStepsData.length === 0) {
      console.log('同步服务: 没有新数据需要同步');
      resolve(result);
      return;
    }
    
    // 创建一个计数器，跟踪完成的请求数
    let completedRequests = 0;
    const totalRequests = 2; // 总共两个请求（位置和步数）
    
    // 同步完成后的回调
    const onComplete = () => {
      completedRequests++;
      if (completedRequests >= totalRequests) {
        resolve(result);
      }
    }
    
    // 1. 同步位置数据 - 只发送新增部分
    if (newLocationData.length > 0) {
      wx.request({
        url: `${apiBaseUrl}/sync_location`,
        data: {
          data: JSON.stringify(newLocationData)
        },
        method: "POST",
        header: {
          'content-type': 'application/json',
          'chartset': 'utf-8'
        },
        success: res => {
          console.log('新增位置数据同步成功:', res.data, `(${newLocationData.length}条记录)`);
          result.lastSyncedLocationIndex = locationData.length;
          result.locationSuccess = true;
        },
        fail: err => {
          console.error('位置数据同步失败:', err);
        },
        complete: onComplete
      });
    } else {
      // 如果没有新位置数据，直接标记为完成
      onComplete();
    }
    
    // 2. 并行同步步数数据 - 只发送新增部分
    if (newStepsData.length > 0) {
      wx.request({
        url: `${apiBaseUrl}/sync_steps`,
        data: {
          data: JSON.stringify(newStepsData)
        },
        method: "POST",
        header: {
          'content-type': 'application/json',
          'chartset': 'utf-8'
        },
        success: res => {
          console.log('新增步数数据同步成功:', res.data, `(${newStepsData.length}条记录)`);
          result.lastSyncedStepsIndex = stepsData.length;
          result.stepsSuccess = true;
        },
        fail: err => {
          console.error('步数数据同步失败:', err);
        },
        complete: onComplete
      });
    } else {
      // 如果没有新步数数据，直接标记为完成
      onComplete();
    }
  });
} 