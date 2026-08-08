# 熨烫拼豆 · Bead Ironing

一个像素风拼豆（perler beads）创作应用：在网格画布上摆放彩色拼豆，模拟熨烫让豆子熔融，最后用 Three.js 以 3D 视角查看成品。

基于 Vue 3 + Vite + TypeScript + Three.js，带复古 CRT 滤镜。

## 功能特性

- **设计模式** — 32 色调色板点击/拖拽放珠，右键擦除，滚轮缩放（0.3~12 倍），网格随窗口自适应
- **熨烫模式** — 按住鼠标模拟熨斗，熔融度随距离衰减，进度条实时显示 IRONING / CAREFUL / OK! / BURNED
- **3D 预览** — 空心珠与熔融扁珠按熔融度分别建模（InstancedMesh 批量渲染），拖拽旋转、滚轮缩放
- **图片导入** — 任意图片转拼豆图案：自动量化为 32 色、居中放置、画布自动扩容
- **复古像素风** — CRT 扫描线/暗角/闪烁滤镜，Press Start 2P 像素字体

## 快速开始

要求：Node.js ≥ 20.19（Vite 8 需要），npm

```bash
# 安装依赖
npm install

# 启动开发服务器（默认 http://localhost:5173/）
npm run dev
```

生产构建与预览：

```bash
npm run build    # 类型检查（vue-tsc）+ 构建到 dist/
npm run preview  # 本地预览构建产物
```

## 玩法

1. **放豆**：点选右侧色板颜色，在画布上点击或拖拽摆放拼豆；点 `X` 切换橡皮擦
2. **熨烫**：点「熨 烫」进入，按住鼠标在豆子上来回移动，豆子会熔融变扁、颜色加深；注意别烫过头（BURNED）
3. **3D 查看**：点「3D」查看立体成品，拖拽旋转视角、滚轮缩放
4. **导入图片**：点「导 入 图 片」选一张图，自动转成拼豆图案后回到设计模式继续编辑

> 提示：切回「设 计」模式会重置所有熔融度，3D 视图需要先熨烫至少一颗豆子才能进入。

## 项目结构

```text
src/
  types.ts                 # 核心类型（Cell / Mode 等）
  stores/game.ts           # 全局状态（模块级单例，reactive + actions）
  utils/color.ts           # 调色板、颜色工具、物理常量
  composables/
    useRender2D.ts         # 2D 画布渲染（网格/珠子/悬停/熨斗光标）
    useIroning.ts          # rAF 熨烫循环 + 熔融/进度计算
    useImageImport.ts      # 图片 → 32 色量化 → 写入网格
    useThreeScene.ts       # Three.js 3D 场景（动态 import，独立 chunk）
  components/
    ToolPanel.vue          # 模式切换 / 导入 / 清空
    PaletteBar.vue         # 32 色色板 + 橡皮擦
    Stage.vue              # 主舞台（画布 + 3D + 覆盖层）
    PixelCanvas.vue        # 2D 画布与交互
    View3D.vue             # 3D 容器（按需加载 three）
    IronProgress.vue       # 熨烫进度条
    StatusBar.vue          # 顶部提示条
    CRTOverlay.vue         # CRT 滤镜
```

## 技术栈

| 类别 | 选择 |
| --- | --- |
| 框架 | Vue 3.5（Composition API, `<script setup>`） |
| 构建 | Vite 8 + TypeScript 5.9 |
| 3D | three 0.185 + OrbitControls |
| 状态管理 | 模块级单例 store（未引入 Pinia） |

## 相关

- 仓库：[github.com/254558/bead-ironing](https://github.com/254558/bead-ironing)

