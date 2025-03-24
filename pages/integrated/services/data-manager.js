import * as Constants from '../config/constants.js'
import * as StorageService from './storage-service.js'

/**
 * 数据管理模块 - 提供数据存储、同步和网络状态检测功能
 */
const DataManager = {
  // 检查网络状态
  checkNetworkStatus: function(page) {
    wx.getNetworkType({
      success: (res) => {
        const isCurrentlyOnline = res.networkType !== 'none';
        
        // 只有在状态发生变化时才更新UI并提示用户
        if (isCurrentlyOnline !== page.data.isOnline) {
          page.setData({
            isOnline: isCurrentlyOnline
          });
          
          if (isCurrentlyOnline) {
            wx.showToast({
              title: '网络已恢复，数据将自动同步',
              icon: 'none',
              duration: 2000
            });
            
            // 网络恢复后尝试同步数据
            if (page.data.tracking) {
              this.syncDataWithServer(page);
            }
          } else {
            wx.showToast({
              title: '网络已断开，数据将暂存在本地',
              icon: 'none',
              duration: 2000
            });
          }
        }
      }
    });
  },
  
  // 加载缓存数据
  loadCachedData: function(page) {
    console.log('开始加载缓存数据');
    
    // 加载位置缓存
    try {
      wx.getStorage({
        key: Constants.STORAGE_KEY_LOCATION,
        success(res) {
          if (res.data && Array.isArray(res.data)) {
            page.setData({
              cachedLocationData: res.data
            });
            console.log('加载位置缓存成功，条数:', res.data.length);
          } else {
            console.log('位置缓存为空或格式不正确');
            page.setData({
              cachedLocationData: []
            });
          }
        },
        fail(error) {
          console.log('加载位置缓存失败:', error);
          page.setData({
            cachedLocationData: []
          });
        }
      });
    } catch (error) {
      console.error('加载位置缓存过程中发生错误:', error);
      page.setData({
        cachedLocationData: []
      });
    }
    
    // 加载步数缓存
    try {
      wx.getStorage({
        key: Constants.STORAGE_KEY_STEPS,
        success(res) {
          if (res.data && Array.isArray(res.data)) {
            page.setData({
              cachedStepsData: res.data
            });
            console.log('加载步数缓存成功，条数:', res.data.length);
          } else {
            console.log('步数缓存为空或格式不正确');
            page.setData({
              cachedStepsData: []
            });
          }
        },
        fail(error) {
          console.log('加载步数缓存失败:', error);
          page.setData({
            cachedStepsData: []
          });
        }
      });
    } catch (error) {
      console.error('加载步数缓存过程中发生错误:', error);
      page.setData({
        cachedStepsData: []
      });
    }
  },
  
  // 保存数据到本地存储
  saveDataToStorage: function(page) {
    if (!page.data.tracking) return;
    
    const locationData = page.data.cachedLocationData || [];
    const stepsData = page.data.cachedStepsData || [];
    
    if (locationData.length === 0 && stepsData.length === 0) {
      console.log('无数据需要保存到本地存储');
      return false;
    }
    
    const success = StorageService.saveDataToStorage(locationData, stepsData);
    
    if (success) {
      console.log(`数据已保存到本地存储: ${locationData.length}条位置记录, ${stepsData.length}条步数记录`);
    } else {
      console.error('保存数据到本地存储失败');
    }
    
    return success;
  },
  
  // 同步数据到服务器
  syncDataWithServer: function(page, isFinalSync = false) {
    // 如果不在线或已经在同步中，则跳过
    if (!page.data.isOnline || page.data.isSyncing) return;
    
    // 如果没有需要同步的新数据，也跳过
    const locationData = page.data.cachedLocationData || [];
    const stepsData = page.data.cachedStepsData || [];
    
    const newLocationData = locationData.slice(page.data.lastSyncedLocationIndex);
    const newStepsData = stepsData.slice(page.data.lastSyncedStepsIndex);
    
    if (newLocationData.length === 0 && newStepsData.length === 0) {
      console.log('无新数据需要同步到服务器');
      return;
    }
    
    // 设置同步锁，防止并发同步
    page.setData({ isSyncing: true });
    
    // 设置超时处理
    const syncTimeout = setTimeout(() => {
      console.error('数据同步超时');
      page.setData({ isSyncing: false });
    }, 30000); // 30秒超时
    
    // 开始同步
    console.log(`开始同步数据: ${newLocationData.length}条位置记录, ${newStepsData.length}条步数记录`);
    
    StorageService.syncDataWithServer(
      Constants.API_BASE_URL,
      locationData,
      stepsData,
      page.data.lastSyncedLocationIndex,
      page.data.lastSyncedStepsIndex
    ).then(result => {
      // 清除超时计时器
      clearTimeout(syncTimeout);
      
      // 更新同步状态
      const currentTime = new Date().getTime();
      page.setData({
        lastSyncedLocationIndex: result.locationSuccess ? locationData.length : page.data.lastSyncedLocationIndex,
        lastSyncedStepsIndex: result.stepsSuccess ? stepsData.length : page.data.lastSyncedStepsIndex,
        lastSyncTime: currentTime,
        isSyncing: false  // 释放同步锁
      });
      
      console.log(`数据同步完成 - 位置数据: ${result.locationSuccess ? '成功' : '失败'}, 步数数据: ${result.stepsSuccess ? '成功' : '失败'}`);
      
      // 如果是最终同步，执行额外操作
      if (isFinalSync) {
        console.log('完成最终同步');
      }
    }).catch(error => {
      // 清除超时计时器
      clearTimeout(syncTimeout);
      
      console.error('数据同步过程中出错:', error);
      page.setData({ isSyncing: false });  // 释放同步锁
      
      // 如果是网络错误，可能需要更新网络状态
      if (error.errMsg && (error.errMsg.includes('request:fail') || error.errMsg.includes('timeout'))) {
        this.checkNetworkStatus(page); // 重新检查网络状态
      }
    });
  },
  
  // 清空所有数据
  clearAllData: function(page, resetStepCount = true) {
    try {
      // 清空本地存储中的数据
      StorageService.clearAllStoredData()
        .then(() => {
          // 准备更新的数据
          let updateData = {
            markers: [],
            polyline: [{
              points: [],
              color: Constants.POLYLINE_COLOR,
              width: Constants.POLYLINE_WIDTH,
              dottedLine: false
            }],
            cachedLocationData: [],
            cachedStepsData: [],
            lastMinuteStepCount: resetStepCount ? 0 : page.data.stepCount,
            lastSyncedLocationIndex: 0,
            lastSyncedStepsIndex: 0
          };
          
          // 只有在需要重置步数时才更新stepCount
          if (resetStepCount) {
            updateData.stepCount = 0;
          }
          
          // 更新数据
          page.setData(updateData);
          
          console.log('位置数据已清空，步数' + (resetStepCount ? '已重置' : '保持不变'));
        })
        .catch(error => {
          console.error('清空存储数据失败:', error);
        });
    } catch (error) {
      console.error('清空数据过程中出错:', error);
    }
  },
  
  // 清除缓存数据
  clearCachedData: function(page) {
    page.setData({
      cachedLocationData: [],
      cachedStepsData: [],
      lastSyncedLocationIndex: 0,
      lastSyncedStepsIndex: 0
    });
    
    // 清除本地存储
    wx.removeStorage({
      key: Constants.STORAGE_KEY_LOCATION,
      success: () => console.log('位置缓存已清除')
    });
    
    wx.removeStorage({
      key: Constants.STORAGE_KEY_STEPS,
      success: () => console.log('步数缓存已清除')
    });
    
    console.log('所有缓存数据已清除');
  },
  
  // 保存缓存数据到本地存储
  saveCacheData: function(page) {
    console.log('保存缓存数据到本地存储');
    
    // 保存位置数据
    try {
      if (page.data.cachedLocationData && Array.isArray(page.data.cachedLocationData) && page.data.cachedLocationData.length > 0) {
        wx.setStorage({
          key: Constants.STORAGE_KEY_LOCATION,
          data: page.data.cachedLocationData,
          success: function() {
            console.log('位置数据缓存成功，条数:', page.data.cachedLocationData.length);
          },
          fail: function(error) {
            console.error('位置数据缓存失败:', error);
          }
        });
      }
    } catch (error) {
      console.error('保存位置数据时出错:', error);
    }
    
    // 保存步数数据
    try {
      if (page.data.cachedStepsData && Array.isArray(page.data.cachedStepsData) && page.data.cachedStepsData.length > 0) {
        wx.setStorage({
          key: Constants.STORAGE_KEY_STEPS,
          data: page.data.cachedStepsData,
          success: function() {
            console.log('步数数据缓存成功，条数:', page.data.cachedStepsData.length);
          },
          fail: function(error) {
            console.error('步数数据缓存失败:', error);
          }
        });
      }
    } catch (error) {
      console.error('保存步数数据时出错:', error);
    }
    
    // 更新最后保存时间
    page.setData({
      lastSaveTime: new Date().getTime()
    });
  }
};

// 导出单例对象
export default DataManager; 