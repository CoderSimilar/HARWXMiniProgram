// 位置相关常量
export const LOCATION_TYPE = 'gcj02'
export const TRACKING_INTERVAL = 3000
export const DEFAULT_SCALE = 10000
export const MARKER_SIZE = 10
export const POLYLINE_WIDTH = 2
export const POLYLINE_COLOR = '#FF0000DD'

// 区域相关常量
export const CIRCLE_COLOR = '#1AAD19AA'
export const CIRCLE_FILL_COLOR = '#1AAD1933'
export const DEFAULT_RADIUS = 50
export const MIN_RADIUS = 10
export const MAX_RADIUS = 2000
export const RADIUS_STEP = 10
export const EARTH_RADIUS = 6371000
export const CIRCLE_STROKE_WIDTH = 2
export const OUT_OF_AREA_THRESHOLD = 3
export const WARNING_COOLDOWN = 30000

// 动作识别相关常量
export const ACTION_TYPES = ['upstair', 'standing', 'raisearm', 'squatdown', 'ladderup', 'ladderdown', 'downstair', 'walking']
export const SAMPLE_SIZE = 128
export const SENSOR_INTERVAL = 'game'
export const API_BASE_URL = 'http://8.136.10.160:18306'
export const SUBMIT_INTERVAL = 3000
export const HEADERS = {
  'content-type': 'application/x-www-form-urlencoded',
  'chartset': 'utf-8'
}

// 步数统计相关常量
export const STEP_UPDATE_INTERVAL = 1000
export const SAMPLE_RATE = 50
export const PEAK_THRESHOLD = 1.5
export const MIN_PEAK_DISTANCE_S = 0.25
export const MOVING_AVERAGE_WINDOW = 5

// 数据存储相关常量
export const TOAST_DURATION = 2000
export const DATA_SAVE_INTERVAL = 60000
export const STORAGE_KEY_LOCATION = 'cached_location_data'
export const STORAGE_KEY_STEPS = 'cached_steps_data'
export const MAX_CACHE_ITEMS = 1000
export const STEP_STATS_INTERVAL = 60000
export const SYNC_INTERVAL = 60000
export const STEP_REFRESH_INTERVAL = 60000

// 精准电子围栏相关常量
export const FENCE_COLOR = '#FF6A00DD'
export const FENCE_FILL_COLOR = '#FF6A0033'
export const FENCE_STROKE_WIDTH = 3
export const FENCE_WIDTH = 4
export const DEFAULT_FENCE_BUFFER = 15 // 默认围栏缓冲区大小（米）
export const FENCE_RECORDING_INTERVAL = 3 * 1000 // 围栏记录点的时间间隔
export const FENCE_MARKER_SIZE = 8 // 围栏点位标记大小
export const FENCE_ORIGINAL_COLOR = '#0066FFDD' // 原始路径颜色
