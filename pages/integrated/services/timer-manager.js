import * as Constants from '../config/constants.js'
import LocationManager from './location-manager.js'
import StepManager from './step-manager.js'
import ActionManager from './action-manager.js'
import DataManager from './data-manager.js'

/**
 * 定时器管理模块 - 统一管理所有定时器
 */
const TimerManager = {
  // 启动所有定时器
  startAllTimers: function(page) {
    // 位置跟踪定时器
    page.timers.location = setInterval(
      () => LocationManager.updateLocationTrack(page), 
      Constants.TRACKING_INTERVAL
    );
    
    // 数据保存和同步定时器
    page.timers.dataSave = setInterval(() => {
      DataManager.saveDataToStorage(page);
      if (page.data.isOnline && !page.data.isSyncing) {
        DataManager.syncDataWithServer(page);
      }
    }, Constants.DATA_SAVE_INTERVAL);
    
    // 步数统计定时器
    page.timers.stepStats = setInterval(
      () => StepManager.recordStepStats(page), 
      Constants.STEP_STATS_INTERVAL
    );
    
    // 动作识别提交定时器
    page.timers.actionSubmit = setInterval(
      () => ActionManager.submitDataForRecognition(page), 
      Constants.SUBMIT_INTERVAL
    );
    
    // 数据清理定时器
    page.timers.cleanup = setInterval(() => {
      // 清理动作数据
      if (page.actionData) {
        page.actionData = ActionManager.cleanupActionData(page.actionData);
      }
      
      // 清理位置缓存数据
      if (page.data.cachedLocationData.length > Constants.MAX_CACHE_ITEMS) {
        const removedCount = page.data.cachedLocationData.length - Constants.MAX_CACHE_ITEMS;
        
        // 调整同步索引
        let lastSyncedLocationIndex = page.data.lastSyncedLocationIndex;
        if (lastSyncedLocationIndex > removedCount) {
          lastSyncedLocationIndex = lastSyncedLocationIndex - removedCount;
        } else {
          lastSyncedLocationIndex = 0;
        }
        
        page.setData({
          cachedLocationData: page.data.cachedLocationData.slice(-Constants.MAX_CACHE_ITEMS),
          lastSyncedLocationIndex: lastSyncedLocationIndex
        });
      }
    }, 60000);
    
    // 网络状态检查定时器
    page.timers.networkCheck = setInterval(
      () => DataManager.checkNetworkStatus(page), 
      30000
    );
    
    console.log('所有定时器已启动');
  },
  
  // 停止所有定时器
  stopAllTimers: function(page) {
    Object.keys(page.timers).forEach(key => {
      if (page.timers[key]) {
        clearInterval(page.timers[key]);
        page.timers[key] = null;
      }
    });
    
    console.log('所有定时器已停止');
  }
};

// 导出单例对象
export default TimerManager; 