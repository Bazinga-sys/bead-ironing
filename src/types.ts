/** 单个珠子的状态 */
export interface Cell {
  /** 颜色（调色板 hex），null 表示空格 */
  color: string | null
  /** 熔融程度 0~1 */
  melt: number
  /** 像素参考图颜色（导入图片的原色 hex），null 表示无；放豆后由珠子覆盖 */
  pixel: string | null
}

export type Mode = 'design' | 'ironing'

/** 豆子规格：大豆 5mm（外径 5、孔径 ~2.5）／迷你豆 2.6mm（外径 2.6、孔径 ~1.5） */
export type BeadSize = 'big' | 'mini'

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

/** 已保存的一幅作品（点「恢复」列表取回，无拖拽/旋转/缩放姿态） */
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
}
