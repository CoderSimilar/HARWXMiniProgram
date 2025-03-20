// pages/first/first.js
Page({

  tocollect: function () {
    wx.navigateTo({
      url: '/pages/new_collect/collect',
    })
  },

  torecognize: function () {
    wx.navigateTo({
      url: '/pages/recognize/recognize',
    })
  },

  getwerun: function () {
    wx.navigateTo({
      url: '/pages/getwerun/getwerun',
    })
  },

  getlocation: function () {
    wx.navigateTo({
      url: '/pages/getlocation/getlocation',
    })
  },

  integrated: function () {
    wx.navigateTo({
      url: '/pages/integrated/integrated',
    })
  } 
})