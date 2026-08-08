import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { store } from '../stores/game'
import { FUSE_MAX, beadHash, burnAt } from '../utils/color'
import {
  BEAD_HEIGHT,
  BEAD_SCALE,
  createEvaFilledMaterial,
  createEvaHollowMaterial,
  createFilledBeadGeometry,
  createHollowBeadGeometry,
} from './useBeadGeometry'

export interface ThreeHandle {
  resize(): void
  rebuild(): void
  dispose(): void
}

/**
 * 3D 预览场景：熔融度 < 0.35 的空心珠用环形拉伸几何，≥ 0.35 用圆角扁珠，
 * melt 影响高度/颜色，最终以 InstancedMesh 批量渲染。
 */
export function createThreeScene(container: HTMLElement): ThreeHandle {
  const md = Math.max(store.cols, store.rows)
  const scene = new THREE.Scene()
  // 浅色工作台背景，突出塑料珠的彩色与光泽
  scene.background = new THREE.Color(0xf0ede5)

  const cam = new THREE.PerspectiveCamera(
    50,
    container.clientWidth / container.clientHeight,
    0.1,
    300,
  )
  cam.position.set(store.cols * 0.2, md * 0.3, store.rows * 0.8)

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.1
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  container.appendChild(renderer.domElement)

  const controls = new OrbitControls(cam, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = md * 0.15
  controls.maxDistance = md * 1.5
  controls.maxPolarAngle = Math.PI * 0.48
  controls.target.set(0, 0, 0)

  // 柔和光照：低强度环境光 + 单一主光（投射阴影）+ 程序化房间环境贴图（塑料反射高光）
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.add(new THREE.AmbientLight(0xffffff, 0.45))
  const key = new THREE.DirectionalLight(0xffffff, 1.8)
  key.position.set(md * 0.3, md * 0.6, md * 0.3)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.camera.left = -md * 0.7
  key.shadow.camera.right = md * 0.7
  key.shadow.camera.top = md * 0.7
  key.shadow.camera.bottom = -md * 0.7
  key.shadow.camera.near = 0.1
  key.shadow.camera.far = md * 2
  key.shadow.bias = -0.002
  scene.add(key)

  // 工作台台面：浅色平面接收珠子的投影，增强立体感
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(md * 2.4, md * 2.4),
    new THREE.MeshStandardMaterial({ color: 0xf5f3ee, roughness: 0.9, metalness: 0 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.02
  ground.receiveShadow = true
  scene.add(ground)

  function resize() {
    const pw = Math.max(1, container.clientWidth)
    const ph = Math.max(1, container.clientHeight)
    cam.aspect = pw / ph
    cam.updateProjectionMatrix()
    renderer.setSize(pw, ph, false)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
  }

  function build3DScene() {
    const sp = 1.0
    const offX = -(store.cols - 1) * sp / 2
    const offZ = -(store.rows - 1) * sp / 2

    // 空心珠 / 熔融扁珠几何体与 EVA 哑光材质（与拼豆棋盘 useThreeBoard 共用，形态/质感一致）
    const size = store.beadSize
    const { s, tol } = BEAD_SCALE[size]
    const hollowGeo = createHollowBeadGeometry(size)
    const filledGeo = createFilledBeadGeometry(size)

    let hc = 0
    let fc = 0
    for (let r = 0; r < store.rows; r++)
      for (let c = 0; c < store.cols; c++) {
        const cell = store.grid[r][c]
        if (!cell.color) continue
        if (cell.melt < 0.35) hc++
        else fc++
      }
    if (hc + fc === 0) return

    const m4 = new THREE.Matrix4()
    const col = new THREE.Color()
    const pos = new THREE.Vector3()
    const sc = new THREE.Vector3()
    const q = new THREE.Quaternion()

    if (hc > 0) {
      // 未熨烫空心珠：EVA 哑光雾面（高粗糙度、无清漆，轻微雾面透光），色彩鲜艳
      const mat = createEvaHollowMaterial()
      const mesh = new THREE.InstancedMesh(hollowGeo, mat, hc)
      mesh.castShadow = true
      mesh.name = 'beadMeshHollow'
      let idx = 0
      for (let r = 0; r < store.rows; r++)
        for (let c = 0; c < store.cols; c++) {
          const cell = store.grid[r][c]
          if (!cell.color || cell.melt >= 0.35) continue
          const m = cell.melt
          // ±0.2mm 生产公差：每颗豆尺寸略有差异
          const jitter = 1 + (beadHash(r, c) - 0.5) * 2 * tol
          const h = s * jitter * BEAD_HEIGHT * (1 - m * 0.92)
          const rad = s * jitter * (0.48 + m * 0.18)
          pos.set(offX + c * sp, h / 2, offZ + r * sp)
          sc.set(rad, h, rad)
          m4.compose(pos, q, sc)
          mesh.setMatrixAt(idx, m4)
          col.set(cell.color)
          if (m > FUSE_MAX) col.multiplyScalar(0.8)
          mesh.setColorAt(idx, col)
          idx++
        }
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      scene.add(mesh)
    }

    if (fc > 0) {
      // 熔融扁珠：熨烫后更哑光、几乎不透光（雾面感明显），中心残留孔洞
      const mat = createEvaFilledMaterial()
      const mesh = new THREE.InstancedMesh(filledGeo, mat, fc)
      mesh.castShadow = true
      mesh.name = 'beadMeshFilled'
      let idx = 0
      for (let r = 0; r < store.rows; r++)
        for (let c = 0; c < store.cols; c++) {
          const cell = store.grid[r][c]
          if (!cell.color || cell.melt < 0.35) continue
          const m = cell.melt
          // ±0.2mm 生产公差 + 熔融扁珠的确定性形变
          const bh2 = beadHash(r, c)
          const jitter = 1 + (bh2 - 0.5) * 2 * tol
          const h = s * jitter * BEAD_HEIGHT * (1 - m * 0.92)
          const rad = s * jitter * (0.48 + m * 0.18)
          const ax = 0.94 + bh2 * 0.12
          const az = 0.94 + (1 - bh2) * 0.12
          pos.set(offX + c * sp, h / 2, offZ + r * sp)
          sc.set(rad * ax, h, rad * az)
          m4.compose(pos, q, sc)
          mesh.setMatrixAt(idx, m4)
          col.set(cell.color)
          if (m > burnAt(size)) col.multiplyScalar(0.35)
          else if (m > FUSE_MAX) col.multiplyScalar(0.78)
          mesh.setColorAt(idx, col)
          idx++
        }
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      scene.add(mesh)
    }
  }

  function rebuild() {
    ;(['beadMeshHollow', 'beadMeshFilled'] as const).forEach((name) => {
      const o = scene.getObjectByName(name) as THREE.Mesh | undefined
      if (o) {
        scene.remove(o)
        o.geometry.dispose()
        if (o.material instanceof THREE.Material) o.material.dispose()
      }
    })
    build3DScene()
  }

  let raf = 0
  function animate() {
    raf = requestAnimationFrame(animate)
    controls.update()
    renderer.render(scene, cam)
  }

  function dispose() {
    cancelAnimationFrame(raf)
    controls.dispose()
    renderer.dispose()
    renderer.domElement.remove()
  }

  resize()
  animate()
  return { resize, rebuild, dispose }
}
