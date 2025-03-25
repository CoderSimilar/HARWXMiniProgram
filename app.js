//app.js
App({
  onLaunch: function () {
    wx.request({
      url: 'http://8.136.10.160:18306/',
      method: 'GET',
      success(res) {
        console.log(res.data, "success connect to server")
      },
      fail() {
        console.log("fail connect to server")
      },
    }),
    wx.authorize({scope: 'scope.userLocationBackground'})
  },
  globalData: {},
})