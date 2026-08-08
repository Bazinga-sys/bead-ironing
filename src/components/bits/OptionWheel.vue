<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, type CSSProperties, type ComponentPublicInstance } from 'vue';

// 摘自 vue-bits（DavidHDev/vue-bits，MIT+Commons Clause）：https://vue-bits.dev/components/option-wheel
// 适配：新增 swatch 色块模式（选项渲染为圆形色块）、eraserIndex（橡皮项特殊渲染）、受控 selected prop。

export type Side = 'left' | 'right';

interface OptionWheelProps {
  items?: string[];
  defaultSelected?: number;
  textColor?: string;
  activeColor?: string;
  side?: Side;
  fontSize?: number;
  spacing?: number;
  curve?: number;
  tilt?: number;
  blur?: number;
  fade?: number;
  minOpacity?: number;
  smoothing?: number;
  inset?: number;
  loop?: boolean;
  draggable?: boolean;
  soundUrl?: string;
  soundVolume?: number;
  /** 色块模式：选项渲染为圆形色块（背景 = 选项字符串） */
  swatch?: boolean;
  /** 橡皮项下标（色块模式下该项渲染为橡皮 ✕，默认 -1 表示无） */
  eraserIndex?: number;
  /** 外部受控选中项：传入后以它为准（用于与 store 状态同步），不传则内部自管 */
  selected?: number | null;
}

const props = withDefaults(defineProps<OptionWheelProps>(), {
  items: () => [
    'Ambient',
    'House',
    'Techno',
    'Jazz',
    'Lo-Fi',
    'Synthwave',
    'Trance',
    'Funk',
    'Disco',
    'Hip-Hop',
    'Chillwave',
    'Drum & Bass'
  ],
  defaultSelected: 3,
  textColor: '#a6a6a6',
  activeColor: '#ffffff',
  side: 'left',
  fontSize: 3,
  spacing: 1.4,
  curve: 1,
  tilt: 6,
  blur: 2,
  fade: 0.25,
  minOpacity: 0.05,
  smoothing: 200,
  inset: 80,
  loop: false,
  draggable: true,
  soundUrl: '',
  soundVolume: 0.5,
  swatch: false,
  eraserIndex: -1,
  selected: null
});

const emit = defineEmits<{
  change: [index: number, item: string];
}>();

const rootRef = ref<HTMLDivElement | null>(null);
const itemRefs = ref<(HTMLDivElement | null)[]>([]);
const selectedIndex = ref(props.defaultSelected);
const isDragging = ref(false);

/** 受控模式以 props.selected 为准，否则用内部 selectedIndex */
const selectedValue = computed(() => (props.selected != null ? props.selected : selectedIndex.value));

const setItemRef = (el: Element | ComponentPublicInstance | null, index: number) => {
  itemRefs.value[index] = el as HTMLDivElement | null;
};

const remPx =
  typeof window !== 'undefined' ? parseFloat(getComputedStyle(document.documentElement).fontSize) || 16 : 16;
const rowH = computed(() => Math.max(props.fontSize * props.spacing * remPx, 1));

// Mutable, non-reactive state — mirrors the React version's plain useRef
// values that don't need to trigger re-renders.
let pos = props.defaultSelected;
let target = props.defaultSelected;
let raf: number | null = null;
let last = 0;
let wheelTimer: ReturnType<typeof setTimeout> | null = null;
let drag: { y: number; start: number; id: number } | null = null;
let dragMoved = false;
let audio: HTMLAudioElement | null = null;
let audioUrl = '';
let lastTick = 0;

// Single rAF loop that eases the wheel position toward its target with
// frame-rate independent exponential smoothing, then lays every option out
// along the curve based on its distance from the current position.
const runFrame = (now: number) => {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  const tau = Math.max(props.smoothing, 1) / 1000;
  const k = 1 - Math.exp(-dt / tau);

  const cur = pos;
  let next = cur + (target - cur) * k;
  const settled = Math.abs(target - next) < 0.001;
  if (settled) next = target;
  pos = next;

  const els = itemRefs.value;
  const n = props.items.length;
  const mirror = props.side === 'right' ? -1 : 1;
  // Options sit on a circle whose radius keeps the arc length between two
  // neighbors equal to one row height, so tilt controls how tightly it curls.
  const tiltRad = (props.tilt * Math.PI) / 180;
  const R = tiltRad > 0.0005 ? rowH.value / tiltRad : 0;
  for (let i = 0; i < n; i++) {
    const el = els[i];
    if (!el) continue;
    let d = i - next;
    if (props.loop && n > 1) {
      d = ((d % n) + n) % n;
      if (d > n / 2) d -= n;
    }
    const dist = Math.abs(d);
    let x = 0;
    let y = d * rowH.value;
    let rot = 0;
    if (R > 0) {
      const ang = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, d * tiltRad));
      y = R * Math.sin(ang);
      x = -mirror * R * (1 - Math.cos(ang)) * props.curve;
      rot = (mirror * ang * 180) / Math.PI;
    }
    el.style.transform = `translate(${x.toFixed(2)}px, calc(${y.toFixed(2)}px - 50%)) rotate(${rot.toFixed(3)}deg)`;
    el.style.opacity = String(Math.max(props.minOpacity, 1 - dist * props.fade));
    el.style.filter = props.blur > 0 ? `blur(${(dist * props.blur).toFixed(2)}px)` : 'none';
    el.style.setProperty('--ow-p', Math.max(0, 1 - Math.min(dist, 1)).toFixed(4));
  }

  raf = settled ? null : requestAnimationFrame(runFrame);
};

const startLoop = () => {
  if (raf != null) return;
  last = performance.now();
  raf = requestAnimationFrame(runFrame);
};

// Optional tick on selection change, throttled so fast scrolling can't spam
// it, and with playback failures (e.g. autoplay policies) silently ignored.
const playTick = () => {
  if (!props.soundUrl) return;
  const now = performance.now();
  if (now - lastTick < 70) return;
  lastTick = now;
  if (!audio || audioUrl !== props.soundUrl) {
    audio = new Audio(props.soundUrl);
    audio.preload = 'auto';
    audioUrl = props.soundUrl;
  }
  audio.volume = Math.min(Math.max(props.soundVolume, 0), 1);
  audio.currentTime = 0;
  audio.play()?.catch(() => {});
};

const applyTarget = (value: number, snap: boolean) => {
  let v = value;
  const n = props.items.length;
  if (!props.loop) v = Math.min(Math.max(v, 0), Math.max(n - 1, 0));
  if (snap) v = Math.round(v);
  target = v;
  const idx = ((Math.round(v) % n) + n) % n;
  if (idx !== selectedIndex.value) {
    selectedIndex.value = idx;
    emit('change', idx, props.items[idx]);
    playTick();
  }
  startLoop();
};

const handlePointerDown = (e: PointerEvent) => {
  if (!props.draggable) return;
  drag = { y: e.clientY, start: target, id: e.pointerId };
  dragMoved = false;
  isDragging.value = true;
};

const handlePointerMove = (e: PointerEvent) => {
  if (!drag) return;
  const dy = e.clientY - drag.y;
  if (!dragMoved && Math.abs(dy) > 4) {
    dragMoved = true;
    // Capture only once a real drag starts, so plain clicks still reach
    // the items and navigate to them.
    rootRef.value?.setPointerCapture(drag.id);
  }
  if (dragMoved) applyTarget(drag.start - dy / rowH.value, false);
};

const handlePointerEnd = () => {
  if (!drag) return;
  drag = null;
  isDragging.value = false;
  if (dragMoved) applyTarget(target, true);
};

const handleItemClick = (index: number) => {
  if (dragMoved) return;
  const n = props.items.length;
  const cur = target;
  let d = index - (((cur % n) + n) % n);
  if (props.loop && n > 1) {
    if (d > n / 2) d -= n;
    else if (d < -n / 2) d += n;
  }
  applyTarget(cur + d, true);
};

const handleKeyDown = (e: KeyboardEvent) => {
  let delta: number | null = null;
  if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') delta = -1;
  else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') delta = 1;
  if (delta == null) return;
  e.preventDefault();
  applyTarget(Math.round(target) + delta, true);
};

const itemClass = (index: number): string =>
  `absolute top-1/2 cursor-pointer whitespace-nowrap leading-none will-change-[transform,opacity,filter] [font-size:var(--ow-font-size)] [color:color-mix(in_srgb,var(--ow-active-color)_calc(var(--ow-p,0)*100%),var(--ow-text-color))] ${
    props.side === 'right' ? 'right-[var(--ow-inset)] origin-right' : 'left-[var(--ow-inset)] origin-left'
  } ${selectedValue.value === index ? 'font-medium' : 'font-extralight'}`;

const rootStyle = computed<CSSProperties>(
  () =>
    ({
      '--ow-text-color': props.textColor,
      '--ow-active-color': props.activeColor,
      '--ow-font-size': `${props.fontSize}rem`,
      '--ow-inset': `${props.inset}px`,
      '--ow-swatch-size': `${Math.round(props.fontSize * 1.1 * remPx)}px`
    }) as CSSProperties
);

// Re-lay the wheel out whenever anything affecting its geometry changes.
watch(
  () => [
    props.items,
    props.fontSize,
    props.spacing,
    props.curve,
    props.tilt,
    props.blur,
    props.fade,
    props.minOpacity,
    props.side,
    props.loop,
    props.smoothing
  ],
  () => applyTarget(target, false),
  { deep: true }
);

let removeWheelListener: (() => void) | null = null;

onMounted(() => {
  // Wheel / touchpad scrolling, registered manually so it can be non-passive.
  const el = rootRef.value;
  if (el) {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaMode === 1 ? e.deltaY * 24 : e.deltaY;
      // Cap each event at one step so notchy mouse wheels move exactly one
      // option per click, while touchpads still scroll continuously.
      const step = Math.max(-1, Math.min(1, delta / rowH.value));
      applyTarget(target + step, false);
      if (wheelTimer) clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => applyTarget(target, true), 140);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    removeWheelListener = () => {
      el.removeEventListener('wheel', onWheel);
      if (wheelTimer) clearTimeout(wheelTimer);
    };
  }

  applyTarget(target, false);
});

onUnmounted(() => {
  if (raf != null) cancelAnimationFrame(raf);
  audio?.pause();
  removeWheelListener?.();
});
</script>

<template>
  <div
    ref="rootRef"
    role="listbox"
    tabindex="0"
    aria-label="Option wheel"
    class="relative outline-none w-full h-full overflow-hidden touch-none select-none"
    :class="isDragging ? 'cursor-grabbing' : 'cursor-grab'"
    :style="rootStyle"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerEnd"
    @pointercancel="handlePointerEnd"
    @keydown="handleKeyDown"
  >
    <div
      v-for="(label, index) in items"
      :key="`${label}-${index}`"
      :ref="el => setItemRef(el, index)"
      role="option"
      :aria-selected="selectedValue === index"
      :class="itemClass(index)"
      @click="handleItemClick(index)"
    >
      <span
        v-if="swatch"
        class="ow-marker"
        aria-hidden="true"
      />
      <span
        v-if="swatch"
        class="ow-swatch"
        :class="{ 'ow-swatch-eraser': index === eraserIndex }"
        :style="{ backgroundColor: index === eraserIndex ? '#3a3d42' : label }"
      >{{ index === eraserIndex ? '✕' : '' }}</span>
      <template v-else>{{ label }}</template>
    </div>
  </div>
</template>

<style scoped>
/* 色块模式：每项左侧的细线（与 LineSidebar 的 marker 同风格，选中时 blend 到 accent） */
.ow-marker {
  position: absolute;
  top: 50%;
  right: calc(var(--ow-swatch-size) + 14px);
  width: 34px;
  height: 1px;
  transform: translateY(-50%);
  background: color-mix(in srgb, var(--ow-active-color, #ef7d57) calc(var(--ow-p, 0) * 100%), var(--ow-text-color, #9a9282));
}

/* 色块模式：圆形色块，选中/邻近高亮由 --ow-p（0..1 选中进度）驱动，与原版文字 color-mix 同思路 */
.ow-swatch {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--ow-swatch-size);
  height: var(--ow-swatch-size);
  border-radius: 9999px;
  border: 2px solid rgba(0, 0, 0, 0.18);
  box-shadow:
    inset 0 1px 2px rgba(255, 255, 255, 0.4),
    0 2px 6px rgba(60, 55, 45, 0.22);
  outline: 2px solid transparent;
  outline-offset: 3px;
  transform: scale(calc(1 + var(--ow-p, 0) * 0.15));
  transition: outline-color 0.2s;
  outline-color: color-mix(in srgb, var(--ow-active-color, #ef7d57) calc(var(--ow-p, 0) * 100%), transparent);
}

/* 橡皮项：深底 + 白色 ✕，与普通色块区分 */
.ow-swatch-eraser {
  border: 2px dashed rgba(255, 255, 255, 0.65);
  color: #fff;
  font-size: calc(var(--ow-swatch-size) * 0.5);
  font-weight: 600;
  line-height: 1;
}
</style>
