/** 单个珠子的状态 */
export interface Cell {
  /** 颜色（调色板 hex），null 表示空格 */
  color: string | null
  /** 熔融程度 0~1 */
  melt: number
  /** 像素参考图颜色（导入图片的原色 hex），null 表示无；放豆后由珠子覆盖 */
  pixel: string | null
}

export type Mode = 'design' | 'ironing' | 'view3d'

export interface MouseState {
  x: number
  y: number
  down: boolean
}

export interface IronProgress {
  avg: number
  fused: number
  burned: number
  count: number
  fillColor: string
  label: string
}

/** 保存在作品面板上的一个成品 */
export interface SavedBoard {
  id: string
  /** 自动生成的作品名，如「作品 1」 */
  name: string
  cols: number
  rows: number
  grid: Cell[][]
  /** 缩略图 PNG dataURL */
  thumb: string
  savedAt: number
  /** 贴在墙上的 CSS 像素坐标（相对墙面左上角） */
  x: number
  y: number
  /** 旋转角度（度），0 = 正立 */
  rotation: number
  /** 缩放倍率（0.5~3），1 = 原尺寸 */
  scale: number
}
