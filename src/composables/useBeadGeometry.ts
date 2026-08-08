import * as THREE from 'three'
import type { BeadSize } from '../types'

/**
 * 豆子规格参数（相对格子尺寸归一化，行业实测尺寸，含 ±0.2mm 公差）：
 * - s：珠体相对格子的比例（5mm 大豆填满格子；2.6mm 迷你豆略小、更精细）
 * - hole：中心孔径 / 外径——实测 5mm≈0.5、2.6mm≈0.52，此处略放大（+0.05）让空心更明显
 * - tol：生产公差 ±0.2mm 相对外径的比例，用于每颗豆的尺寸抖动
 */
export const BEAD_SCALE: Record<BeadSize, { s: number; hole: number; tol: number }> = {
  big: { s: 1, hole: 0.55, tol: 0.2 / 5 },
  mini: { s: 0.88, hole: 0.57, tol: 0.2 / 2.6 },
}

/** 珠体高度系数：无熔融时珠高 = 规格比例 s × 此系数（熔融时按 1−0.92×melt 压扁） */
export const BEAD_HEIGHT = 1.35

/**
 * 空心珠几何体（EVA 空心短圆筒）：圆环拉伸（高细分、圆润边缘），俯视可见贯穿珠孔。
 * 孔径占比随豆子规格变化。拼豆棋盘（useThreeBoard）与 3D 预览（useThreeScene）共用，
 * 保证两个视图的珠子形态完全一致。
 */
export function createHollowBeadGeometry(size: BeadSize = 'big'): THREE.ExtrudeGeometry {
  const ringShape = new THREE.Shape()
  ringShape.absarc(0, 0, 1, 0, Math.PI * 2, false)
  const hp = new THREE.Path()
  hp.absarc(0, 0, BEAD_SCALE[size].hole, 0, Math.PI * 2, true)
  ringShape.holes.push(hp)
  const geo = new THREE.ExtrudeGeometry(ringShape, {
    depth: 0.55,
    bevelEnabled: true,
    bevelThickness: 0.09,
    bevelSize: 0.09,
    bevelSegments: 4,
    curveSegments: 32,
  })
  geo.center()
  geo.rotateX(Math.PI / 2)
  return geo
}

/**
 * 熔融扁珠几何体：圆角矩形拉伸，中心保留小孔——EVA 熨烫后孔洞不容易完全消失，
 * 只略微收缩（残留孔随 instance 的 y 缩放一起压扁）。
 * 拼豆棋盘与 3D 预览共用。
 */
export function createFilledBeadGeometry(_size: BeadSize = 'big'): THREE.ExtrudeGeometry {
  const rw = 0.95
  const rh = 0.95
  const rr = 0.25
  const rrect = new THREE.Shape()
  rrect.moveTo(-rw + rr, -rh)
  rrect.lineTo(rw - rr, -rh)
  rrect.quadraticCurveTo(rw, -rh, rw, -rh + rr)
  rrect.lineTo(rw, rh - rr)
  rrect.quadraticCurveTo(rw, rh, rw - rr, rh)
  rrect.lineTo(-rw + rr, rh)
  rrect.quadraticCurveTo(-rw, rh, -rw, rh - rr)
  rrect.lineTo(-rw, -rh + rr)
  rrect.quadraticCurveTo(-rw, -rh, -rw + rr, -rh)
  // 熨烫残留孔（小于未熨烫时的孔径）
  const hp = new THREE.Path()
  hp.absarc(0, 0, 0.22, 0, Math.PI * 2, true)
  rrect.holes.push(hp)
  const geo = new THREE.ExtrudeGeometry(rrect, {
    depth: 1,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.08,
    bevelSegments: 4,
    curveSegments: 32,
  })
  geo.center()
  geo.rotateX(Math.PI / 2)
  return geo
}

/**
 * EVA 空心珠材质：哑光雾面（高粗糙度、无清漆高光），轻微雾面透光——
 * 对应真实 EVA 豆「哑光、色彩鲜艳、丢水里浮起来」的外观，区别于亮面 PE。
 */
export function createEvaHollowMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    roughness: 0.92,
    metalness: 0,
    clearcoat: 0,
    transmission: 0.2,
    ior: 1.5,
    thickness: 2.5,
    envMapIntensity: 1.0,
  })
}

/**
 * EVA 熔融扁珠材质：熨烫后更哑光、更不透明（雾面感明显），透光进一步减弱。
 */
export function createEvaFilledMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    roughness: 0.95,
    metalness: 0,
    clearcoat: 0,
    transmission: 0.08,
    ior: 1.5,
    thickness: 3,
    envMapIntensity: 0.9,
  })
}
