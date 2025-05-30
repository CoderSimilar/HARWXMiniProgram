import WxCanvas from './wx-canvas';
import * as echarts from './echarts';

let ctx;

function compareVersion(v1, v2) {
  v1 = v1.split('.')
  v2 = v2.split('.')
  const len = Math.max(v1.length, v2.length)

  while (v1.length < len) {
    v1.push('0')
  }
  while (v2.length < len) {
    v2.push('0')
  }

  for (let i = 0; i < len; i++) {
    const num1 = parseInt(v1[i])
    const num2 = parseInt(v2[i])

    if (num1 > num2) {
      return 1
    } else if (num1 < num2) {
      return -1
    }
  }
  return 0
}

Component({
  properties: {
    canvasId: {
      type: String,
      value: 'ec-canvas'
    },
    ec: {
      type: Object
    },
    forceUseOldCanvas: {
      type: Boolean,
      value: false
    }
  },

  data: {
    isUseNewCanvas: false
  },

  ready: function () {
    // Disable progressive rendering because drawImage doesn't support DOM as parameter
    echarts.registerPreprocessor(option => {
      if (option && option.series) {
        if (Array.isArray(option.series)) {
          option.series.forEach(series => {
            series.progressive = 0;
          });
        }
        else if (typeof option.series === 'object') {
          option.series.progressive = 0;
        }
      }
    });

    if (!this.data.ec) {
      console.warn('组件需绑定 ec 变量，例：<ec-canvas canvas-id="mychart-bar" ec="{{ ec }}"></ec-canvas>');
      return;
    }
    // If lazyLoad is enabled, do not auto-init.
    if (!this.data.ec.lazyLoad) {
      this.init();
    }
  },

  methods: {
    init: function (callback) {
      wx.getSystemSetting({
        success: (res) => {
          const version = res.SDKVersion;
          const canUseNewCanvas = compareVersion(version, '2.9.0') >= 0;
          const forceUseOldCanvas = this.data.forceUseOldCanvas;
          const isUseNewCanvas = canUseNewCanvas && !forceUseOldCanvas;
          this.setData({ isUseNewCanvas });

          if (forceUseOldCanvas && canUseNewCanvas) {
            console.warn('开发者强制使用旧canvas,建议关闭');
          }

          if (isUseNewCanvas) {
            this.initByNewWay(callback);
          } else {
            const isValid = compareVersion(version, '1.9.91') >= 0;
            if (!isValid) {
              console.error('微信基础库版本过低，需大于等于 1.9.91。'
                + '参见：https://github.com/ecomfe/echarts-for-weixin');
              return;
            } else {
              console.warn('建议将微信基础库调整大于等于2.9.0版本。升级后绘图将有更好性能');
              this.initByOldWay(callback);
            }
          }
        },
        fail: (err) => {
          console.error('获取系统设置失败', err);
        }
      });
    },

    initByOldWay(callback) {
      // 1.9.91 <= version < 2.9.0：使用旧方式初始化
      ctx = wx.createCanvasContext(this.data.canvasId, this);
      const canvas = new WxCanvas(ctx, this.data.canvasId, false);

      if (echarts.setPlatformAPI) {
        echarts.setPlatformAPI({
          createCanvas: () => canvas,
        });
      } else {
        echarts.setCanvasCreator(() => canvas);
      }

      const canvasDpr = 1;
      var query = wx.createSelectorQuery().in(this);
      query.select('.ec-canvas').boundingClientRect(res => {
        if (typeof callback === 'function') {
          this.chart = callback(canvas, res.width, res.height, canvasDpr);
        } else if (this.data.ec && typeof this.data.ec.onInit === 'function') {
          this.chart = this.data.ec.onInit(canvas, res.width, res.height, canvasDpr);
        } else {
          this.triggerEvent('init', {
            canvas: canvas,
            width: res.width,
            height: res.height,
            canvasDpr: canvasDpr
          });
        }
      }).exec();
    },

    initByNewWay(callback) {
      // version >= 2.9.0：使用新方式初始化
      const query = wx.createSelectorQuery().in(this);
      query
        .select('.ec-canvas')
        .fields({ node: true, size: true })
        .exec(res => {
          const canvasNode = res[0].node;
          this.canvasNode = canvasNode;

          wx.getWindowInfo({
            success: (res) => {
              const canvasDpr = res.pixelRatio;
              const canvasWidth = res.windowWidth;
              const canvasHeight = res.windowHeight;

              const ctx = canvasNode.getContext('2d');
              const canvas = new WxCanvas(ctx, this.data.canvasId, true, canvasNode);

              if (echarts.setPlatformAPI) {
                echarts.setPlatformAPI({
                  createCanvas: () => canvas,
                  loadImage: (src, onload, onerror) => {
                    if (canvasNode.createImage) {
                      const image = canvasNode.createImage();
                      image.onload = onload;
                      image.onerror = onerror;
                      image.src = src;
                      return image;
                    }
                    console.error('加载图片依赖 `Canvas.createImage()` API，要求小程序基础库版本在 2.7.0 及以上。');
                  }
                });
              } else {
                echarts.setCanvasCreator(() => canvas);
              }

              if (typeof callback === 'function') {
                this.chart = callback(canvas, canvasWidth, canvasHeight, canvasDpr);
              } else if (this.data.ec && typeof this.data.ec.onInit === 'function') {
                this.chart = this.data.ec.onInit(canvas, canvasWidth, canvasHeight, canvasDpr);
              } else {
                this.triggerEvent('init', {
                  canvas: canvas,
                  width: canvasWidth,
                  height: canvasHeight,
                  dpr: canvasDpr
                });
              }
            },
            fail: (err) => {
              console.error('获取窗口信息失败', err);
            }
          });
        });
    },

    canvasToTempFilePath(opt) {
      if (this.data.isUseNewCanvas) {
        const query = wx.createSelectorQuery().in(this);
        query
          .select('.ec-canvas')
          .fields({ node: true, size: true })
          .exec(res => {
            const canvasNode = res[0].node;
            opt.canvas = canvasNode;
            wx.canvasToTempFilePath(opt);
          });
      } else {
        if (!opt.canvasId) {
          opt.canvasId = this.data.canvasId;
        }
        ctx.draw(true, () => {
          wx.canvasToTempFilePath(opt, this);
        });
      }
    },

    // 以下 touch 事件保持不变
    touchStart(e) {
      if (this.chart && e.touches.length > 0) {
        const touch = e.touches[0];
        const handler = this.chart.getZr().handler;
        handler.dispatch('mousedown', {
          zrX: touch.x,
          zrY: touch.y,
          preventDefault: () => {},
          stopImmediatePropagation: () => {},
          stopPropagation: () => {}
        });
        handler.dispatch('mousemove', {
          zrX: touch.x,
          zrY: touch.y,
          preventDefault: () => {},
          stopImmediatePropagation: () => {},
          stopPropagation: () => {}
        });
        handler.processGesture(wrapTouch(e), 'start');
      }
    },

    touchMove(e) {
      if (this.chart && e.touches.length > 0) {
        const touch = e.touches[0];
        const handler = this.chart.getZr().handler;
        handler.dispatch('mousemove', {
          zrX: touch.x,
          zrY: touch.y,
          preventDefault: () => {},
          stopImmediatePropagation: () => {},
          stopPropagation: () => {}
        });
        handler.processGesture(wrapTouch(e), 'change');
      }
    },

    touchEnd(e) {
      if (this.chart) {
        const touch = e.changedTouches ? e.changedTouches[0] : {};
        const handler = this.chart.getZr().handler;
        handler.dispatch('mouseup', {
          zrX: touch.x,
          zrY: touch.y,
          preventDefault: () => {},
          stopImmediatePropagation: () => {},
          stopPropagation: () => {}
        });
        handler.dispatch('click', {
          zrX: touch.x,
          zrY: touch.y,
          preventDefault: () => {},
          stopImmediatePropagation: () => {},
          stopPropagation: () => {}
        });
        handler.processGesture(wrapTouch(e), 'end');
      }
    }
  }
});

function wrapTouch(event) {
  for (let i = 0; i < event.touches.length; ++i) {
    const touch = event.touches[i];
    touch.offsetX = touch.x;
    touch.offsetY = touch.y;
  }
  return event;
}
