/**
 * PS2 Bridge Display Engine — virtual SSD1306 OLED (128x32 / 128x64)
 *
 * Faithful port of the spec-sheet primitives (px / rect / line / text / font5x8)
 * and the 11 firmware idle screens + the 2 sheet logo screens.
 * Implements: page system, 180° rotation, notifications, hello/bye animations,
 * touchpad swipe navigation — per the Display Architecture sheet.
 */
import { LOGO_BITMAP_1, LOGO_BITMAP_2 } from './logos'

export const OLED_W = 128
export type OledHeight = 32 | 64

/* ------------------------------------------------------------------ */
/* 5x8 font — transcribed from the spec sheet (chars 32..95)           */
/* ------------------------------------------------------------------ */
const FONT5X8: number[][] = [
  [0x00,0x00,0x00,0x00,0x00],[0x00,0x00,0x5F,0x00,0x00],[0x00,0x07,0x00,0x07,0x00],[0x14,0x7F,0x14,0x7F,0x14],
  [0x24,0x2A,0x7F,0x2A,0x12],[0x23,0x13,0x08,0x64,0x62],[0x36,0x49,0x55,0x22,0x50],[0x00,0x05,0x03,0x00,0x00],
  [0x00,0x1C,0x22,0x41,0x00],[0x00,0x41,0x22,0x1C,0x00],[0x08,0x2A,0x1C,0x2A,0x08],[0x08,0x08,0x3E,0x08,0x08],
  [0x00,0x50,0x30,0x00,0x00],[0x08,0x08,0x08,0x08,0x08],[0x00,0x60,0x60,0x00,0x00],[0x20,0x10,0x08,0x04,0x02],
  [0x3E,0x51,0x49,0x45,0x3E],[0x00,0x42,0x7F,0x40,0x00],[0x42,0x61,0x51,0x49,0x46],[0x21,0x41,0x45,0x4B,0x31],
  [0x18,0x14,0x12,0x7F,0x10],[0x27,0x45,0x45,0x45,0x39],[0x3C,0x4A,0x49,0x49,0x30],[0x01,0x71,0x09,0x05,0x03],
  [0x36,0x49,0x49,0x49,0x36],[0x06,0x49,0x49,0x29,0x1E],[0x00,0x36,0x36,0x00,0x00],[0x00,0x56,0x36,0x00,0x00],
  [0x00,0x08,0x14,0x22,0x41],[0x14,0x14,0x14,0x14,0x14],[0x41,0x22,0x14,0x08,0x00],[0x02,0x01,0x51,0x09,0x06],
  [0x32,0x49,0x79,0x41,0x3E],[0x7E,0x11,0x11,0x11,0x7E],[0x7F,0x49,0x49,0x49,0x36],[0x3E,0x41,0x41,0x41,0x22],
  [0x7F,0x41,0x41,0x22,0x1C],[0x7F,0x49,0x49,0x49,0x41],[0x7F,0x09,0x09,0x01,0x01],[0x3E,0x41,0x41,0x51,0x32],
  [0x7F,0x08,0x08,0x08,0x7F],[0x00,0x41,0x7F,0x41,0x00],[0x20,0x40,0x41,0x3F,0x01],[0x7F,0x08,0x14,0x22,0x41],
  [0x7F,0x40,0x40,0x40,0x40],[0x7F,0x02,0x04,0x02,0x7F],[0x7F,0x04,0x08,0x10,0x7F],[0x3E,0x41,0x41,0x41,0x3E],
  [0x7F,0x09,0x09,0x09,0x06],[0x3E,0x41,0x51,0x21,0x5E],[0x7F,0x09,0x19,0x29,0x46],[0x26,0x49,0x49,0x49,0x32],
  [0x01,0x01,0x7F,0x01,0x01],[0x3F,0x40,0x40,0x40,0x3F],[0x1F,0x20,0x40,0x20,0x1F],[0x7F,0x20,0x18,0x20,0x7F],
  [0x63,0x14,0x08,0x14,0x63],[0x03,0x04,0x78,0x04,0x03],[0x61,0x51,0x49,0x45,0x43],[0x00,0x00,0x7F,0x41,0x41],
  [0x02,0x04,0x08,0x10,0x20],[0x41,0x41,0x7F,0x00,0x00],[0x04,0x02,0x01,0x02,0x04],[0x40,0x40,0x40,0x40,0x40],
]

/** OLED pages in rotation order (ids from the real firmware) */
export const PAGE_REGISTRY = [
  { id: 0, en: 'Info', fa: 'اطلاعات' },
  { id: 1, en: 'MAC', fa: 'آدرس MAC' },
  { id: 2, en: 'Layout P1', fa: 'چیدمان پورت ۱' },
  { id: 8, en: 'Layout P2', fa: 'چیدمان پورت ۲' },
  { id: 34, en: 'Nav Help', fa: 'راهنمای ناوبری' },
  { id: 32, en: 'Screensaver', fa: 'اسکرین‌سیور' },
] as const

export interface PortView {
  connected: boolean
  type: string
  battery: number
  r: number
  g: number
  b: number
}

export interface DisplayState {
  height: OledHeight
  rotated: boolean
  notifications: boolean
  idleScreen: number // 0..12
  helloAnim: number // 0..14, 255=none
  byeAnim: number // 0..9, 255=none
  clockMode: number // 0 off, 7 analog, 8 digital, 9 rect
  pageOrder: number[]
  consolePower: boolean
  bdaddr: string
  ports: PortView[]
  clock: { h: number; m: number; s: number }
}

export type SwipeDir = 'right' | 'left' | 'up' | 'down'

interface Anim {
  kind: 'hello' | 'bye'
  id: number
  start: number
  dur: number
}

interface Notification {
  lines: string[]
  start: number
}

/* ------------------------------------------------------------------ */
/* Display Engine                                                      */
/* ------------------------------------------------------------------ */
export class DisplayEngine {
  W = OLED_W
  H: OledHeight = 64
  fb = new Uint8Array(OLED_W * 64)
  dirty = true

  mode: 'normal' | 'screensaver' | 'always_on' = 'normal'
  pageIdx = 0 // index into state.pageOrder
  private anim: Anim | null = null
  private notifs: Notification[] = []
  private prevFb: Uint8Array | null = null

  /** swipe callbacks wired by the device */
  onLedCycle?: (dir: 1 | -1) => void
  onBatteryShow?: (port: 0 | 1) => void

  state: DisplayState = {
    height: 64,
    rotated: false,
    notifications: true,
    idleScreen: 1,
    helloAnim: 0,
    byeAnim: 0,
    clockMode: 7,
    pageOrder: PAGE_REGISTRY.map((p) => p.id),
    consolePower: true,
    bdaddr: '24:0A:C4:12:34:56',
    ports: [
      { connected: false, type: 'DS4', battery: 80, r: 46, g: 109, b: 180 },
      { connected: false, type: 'DS5', battery: 65, r: 196, g: 58, b: 58 },
    ],
    clock: { h: 12, m: 0, s: 0 },
  }

  // animation scratch
  private t0 = 0
  private stars: number[][] = []
  private floaters: { x: number; y: number; dx: number; dy: number; sym: number }[] = []
  private balls: { x: number; y: number; dx: number; dy: number }[] = []
  private pong = { bx: 64, by: 32, bdx: 1, bdy: 1, p1: 24, p2: 24, s1: 0, s2: 0, last: 0 }
  private tetris: { x: number; y: number; sym: number; stack: number[] } = { x: 60, y: 0, sym: 0, stack: [] }
  private touch: { x: number; y: number; active: boolean } = { x: 0, y: 0, active: false }

  constructor() {
    for (let i = 0; i < 5; i++) this.floaters.push({ x: 10 + i * 24, y: 8 + (i % 2) * 20, dx: (i % 2 ? 1 : -1), dy: (i % 3 ? 1 : -1), sym: i % 4 })
    this.balls = [{ x: 20, y: 20, dx: 1, dy: 1 }, { x: 90, y: 40, dx: -1, dy: 1 }]
  }

  setHeight(h: OledHeight) {
    if (this.state.height === h) return
    this.state.height = h
    this.dirty = true
  }

  setTouch(x: number, y: number, active: boolean) {
    this.touch = { x, y, active }
  }

  notify(lines: string[]) {
    if (!this.state.notifications) return
    this.notifs.push({ lines, start: performance.now() })
    if (this.notifs.length > 2) this.notifs.shift()
    this.dirty = true
  }

  gotoPageIdx(idx: number) {
    const n = this.state.pageOrder.length
    this.pageIdx = ((idx % n) + n) % n
    if (this.mode !== 'normal') this.mode = 'normal'
    this.anim = null
    this.dirty = true
  }

  gotoPageId(id: number) {
    const idx = this.state.pageOrder.indexOf(id)
    if (idx >= 0) this.gotoPageIdx(idx)
  }

  nextPage(d: 1 | -1 = 1) {
    this.gotoPageIdx(this.pageIdx + d)
  }

  setMode(m: 'normal' | 'screensaver' | 'always_on') {
    if (this.mode !== m) {
      this.mode = m
      this.dirty = true
    }
  }

  /* ---- state mutators (React-compiler-safe device API) ---- */
  setRotated(v: boolean) { this.state.rotated = v; this.dirty = true }
  setNotifications(v: boolean) { this.state.notifications = v; this.dirty = true }
  setIdleScreen(id: number) { this.state.idleScreen = id; this.dirty = true }
  setClockMode(m: number) { this.state.clockMode = m; this.dirty = true }
  setHelloAnim(id: number) { this.state.helloAnim = id; this.dirty = true }
  setByeAnim(id: number) { this.state.byeAnim = id; this.dirty = true }
  setClock(h: number, m: number, s: number) { this.state.clock = { h, m, s }; this.dirty = true }
  setPageOrderArr(order: number[]) { this.state.pageOrder = [...order]; this.dirty = true }

  /** Hello/startup animation (id 0..14 or 255 = none) */
  playHello(id: number) {
    if (id === 255) return
    this.anim = { kind: 'hello', id, start: performance.now(), dur: 1800 }
    this.dirty = true
  }

  /** Bye/shutdown animation — captures current screen first */
  playBye(id: number) {
    if (id === 255) {
      this.anim = null
      this.dirty = true
      return
    }
    this.prevFb = new Uint8Array(this.fb)
    this.anim = { kind: 'bye', id, start: performance.now(), dur: 1600 }
    this.dirty = true
  }

  get isAnimating() {
    return this.anim !== null
  }

  /** Swipe navigation — implements the Touchpad gestures sheet */
  swipe(dir: SwipeDir) {
    if (this.anim) return
    if (this.mode === 'screensaver' || this.mode === 'always_on') {
      // Screensaver mode: LR = next/prev screensaver, UD = LED color
      if (dir === 'left') this.stateIdle(1)
      else if (dir === 'right') this.stateIdle(-1)
      else if (dir === 'up') this.onLedCycle?.(1)
      else if (dir === 'down') this.onLedCycle?.(-1)
    } else {
      // Active mode: LR = battery pages, UD = LED color
      if (dir === 'left') this.onBatteryShow?.(0)
      else if (dir === 'right') this.onBatteryShow?.(1)
      else if (dir === 'up') this.onLedCycle?.(1)
      else if (dir === 'down') this.onLedCycle?.(-1)
    }
    this.dirty = true
  }

  stateIdle(d: 1 | -1) {
    const n = 13 // 11 firmware screens + 2 logo screens
    this.state.idleScreen = ((this.state.idleScreen + d) % n + n) % n
    this.dirty = true
  }

  wake() {
    this.anim = null
    this.mode = 'normal'
    this.dirty = true
  }

  /* ------------------------- primitives ------------------------- */
  private px(x: number, y: number, c: number) {
    if (x < 0 || x >= OLED_W || y < 0 || y >= this.H) return
    this.fb[y * OLED_W + x] = c ? 1 : 0
  }

  private rect(x: number, y: number, w: number, h: number, fill: number) {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        if (fill || i === 0 || j === 0 || i === w - 1 || j === h - 1) this.px(x + i, y + j, 1)
      }
  }

  private line(x0: number, y0: number, x1: number, y1: number) {
    let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1
    let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1
    let err = dx + dy
    for (;;) {
      this.px(x0, y0, 1)
      if (x0 === x1 && y0 === y1) break
      const e2 = 2 * err
      if (e2 >= dy) { err += dy; x0 += sx }
      if (e2 <= dx) { err += dx; y0 += sy }
    }
  }

  private text(x: number, y: number, s: string) {
    for (const ch of s) {
      let c = ch.charCodeAt(0)
      if (c >= 97 && c <= 122) c -= 32 // lowercase → uppercase (font covers 32..95)
      if (c < 32 || c > 127) c = 63 // '?'
      let gi = c - 32
      if (gi >= FONT5X8.length) gi = '?'.charCodeAt(0) - 32
      const g = FONT5X8[gi]
      for (let col = 0; col < 5; col++) {
        const bits = g[col]
        for (let row = 0; row < 8; row++) if (bits & (1 << row)) this.px(x + col, y + row, 1)
      }
      x += 6
      if (x > OLED_W - 6) break
    }
  }

  private textBig(x: number, y: number, s: string, sc = 2) {
    for (const ch of s) {
      let c = ch.charCodeAt(0)
      if (c < 32 || c > 127) c = '?'.charCodeAt(0)
      const g = FONT5X8[c - 32]
      for (let col = 0; col < 5; col++)
        for (let row = 0; row < 8; row++)
          if (g[col] & (1 << row)) this.rect(x + col * sc, y + row * sc, sc, sc, 1)
      x += 6 * sc
    }
  }

  private circle(cx: number, cy: number, r: number) {
    for (let a = 0; a < 360; a += 4) {
      const rad = (a * Math.PI) / 180
      this.px(Math.round(cx + r * Math.cos(rad)), Math.round(cy + r * Math.sin(rad)), 1)
    }
  }

  /** PS symbols: 0=circle 1=cross 2=square 3=triangle */
  private psSymbol(sym: number, cx: number, cy: number, s: number) {
    if (sym === 0) this.circle(cx, cy, s)
    else if (sym === 1) {
      this.line(cx - s, cy - s, cx + s, cy + s)
      this.line(cx - s, cy + s, cx + s, cy - s)
    } else if (sym === 2) {
      this.rect(cx - s, cy - s, s * 2 + 1, s * 2 + 1, 0)
    } else {
      this.line(cx, cy - s, cx - s, cy + s)
      this.line(cx, cy - s, cx + s, cy + s)
      this.line(cx - s, cy + s, cx + s, cy + s)
    }
  }

  private drawBitmap(bmp: number[], ox: number, oy: number) {
    for (let i = 0; i < OLED_W * 32; i++) {
      if (bmp[i]) this.px(ox + (i % OLED_W), oy + Math.floor(i / OLED_W), 1)
    }
  }

  private clear() {
    this.fb.fill(0)
  }

  /* ------------------------- pages ------------------------- */
  private currentPageId(): number {
    const order = this.state.pageOrder.length ? this.state.pageOrder : [0]
    return order[((this.pageIdx % order.length) + order.length) % order.length]
  }

  private drawPage(id: number, t: number) {
    const st = this.state
    const H = this.H
    if (id === 0) {
      // INFO page
      this.text(2, 1, 'BlueRetro')
      this.text(76, 1, 'PS2 Bridge')
      this.line(0, 10, OLED_W - 1, 10)
      const p1 = st.ports[0], p2 = st.ports[1]
      this.text(2, 14, `P1 ${p1.connected ? p1.type : '----'}`)
      if (p1.connected) this.text(38, 14, `BAT ${p1.battery}%`)
      this.px(33, 14, 1); this.px(33, 15, 1)
      this.rect(118, 13, 7, 7, 0)
      if (p1.connected) this.rect(119, 14, 5, 5, 1)
      this.text(2, 25, `P2 ${p2.connected ? p2.type : '----'}`)
      if (p2.connected) this.text(38, 25, `BAT ${p2.battery}%`)
      this.rect(118, 24, 7, 7, 0)
      if (p2.connected) this.rect(119, 25, 5, 5, 1)
      if (H === 64) {
        this.text(2, 38, st.consolePower ? 'PS2: ON' : 'PS2: OFF')
        const hh = String(st.clock.h).padStart(2, '0')
        const mm = String(st.clock.m).padStart(2, '0')
        this.text(70, 38, `${hh}:${mm}`)
        this.text(2, 50, t % 1000 < 500 ? 'BT: ready' : 'BT: ready ')
      }
    } else if (id === 1) {
      // MAC page
      this.text(2, 2, 'BT ADDRESS')
      this.line(0, 11, OLED_W - 1, 11)
      this.text(2, 16, st.bdaddr)
      this.text(2, 28, 'BlueRetro PS2 Bridge')
      if (H === 64) {
        this.text(2, 42, 'WebApp over BLE')
        this.text(2, 54, 'SWIPE: pages')
      }
    } else if (id === 2 || id === 8) {
      // Layout pages
      const p = id === 2 ? 0 : 1
      const port = st.ports[p]
      this.text(2, 1, `PORT ${p + 1} LAYOUT`)
      this.line(0, 10, OLED_W - 1, 10)
      this.text(2, 14, port.connected ? port.type : 'EMPTY')
      if (port.connected) {
        this.text(2, 25, `BAT ${port.battery}%  LED`)
        this.rect(60, 24, 9, 9, 0)
        const lum = (port.r + port.g + port.b) / 3
        if (lum > 40) this.rect(62, 26, 5, 5, 1)
        if (H === 64) this.text(2, 40, 'RUMBLE ' + (port.connected ? 'OK' : '--'))
      } else if (H === 64) {
        this.text(2, 30, 'plug a controller')
      }
    } else if (id === 34) {
      // Nav help page
      this.text(2, 1, 'NAVIGATION')
      this.line(0, 10, OLED_W - 1, 10)
      this.text(2, 14, 'HOME+ARROWS: page')
      this.text(2, 25, 'SWIPE LR: batt/saver')
      if (H === 64) {
        this.text(2, 38, 'SWIPE UD: LED color')
        this.text(2, 50, 'TAP: wake screen')
      }
    } else if (id === 32) {
      // Screensaver page entry — renders idle screen
      this.drawIdle(st.idleScreen, t)
    } else {
      this.text(2, 4, `PAGE ${id}`)
    }
  }

  /* ------------------------- idle screens ------------------------- */
  drawIdle(id: number, t: number) {
    const H = this.H
    switch (id) {
      case 0: // Off
        break
      case 1:
        this.idleCube(t)
        break
      case 2:
        this.idleStars(t)
        break
      case 3:
        this.idleTetris(t)
        break
      case 4:
        this.idleFloat(4, t)
        break
      case 5:
        this.idleFloat(7, t)
        break
      case 6:
        this.idleBalls(t)
        break
      case 7:
        this.idleAnalog()
        break
      case 8:
        this.idleFlip()
        break
      case 9:
        this.idleRectClock()
        break
      case 10:
        this.idlePong(t)
        break
      case 11:
        this.drawBitmap(LOGO_BITMAP_1, 0, H === 64 ? 16 : 0)
        break
      case 12:
        this.drawBitmap(LOGO_BITMAP_2, 0, H === 64 ? 16 : 0)
        break
    }
  }

  /** Spec-sheet idle_cube */
  private idleCube(t: number) {
    const cx = 64, cy = Math.round(this.H / 2), r = this.H === 64 ? 22 : 12
    const a = t / 700.0
    const x: number[] = [], y: number[] = []
    for (let i = 0; i < 4; i++) {
      const ang = a + i * 1.5707
      x.push(Math.round(cx + r * Math.cos(ang)))
      y.push(Math.round(cy + r * 0.5 * Math.sin(ang)))
    }
    const depth = this.H === 64 ? 14 : 8
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) & 3
      this.line(x[i], y[i], x[j], y[j])
      this.line(x[i], y[i] - depth, x[j], y[j] - depth)
      this.line(x[i], y[i], x[i], y[i] - depth)
    }
  }

  /** Perspective starfield (firmware: "points stream toward the viewer") */
  private idleStars(t: number) {
    if (this.stars.length === 0) {
      for (let i = 0; i < 20; i++) this.stars.push([Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 1 + 0.05])
    }
    for (const s of this.stars) {
      s[2] -= 0.006
      if (s[2] <= 0.05) {
        s[0] = Math.random() * 2 - 1
        s[1] = Math.random() * 2 - 1
        s[2] = 1.05
      }
      const x = Math.round(64 + (s[0] / s[2]) * 60)
      const y = Math.round(this.H / 2 + (s[1] / s[2]) * (this.H / 2 - 2))
      this.px(x, y, 1)
      if (s[2] < 0.4) {
        this.px(x + 1, y, 1)
        this.px(x, y + 1, 1)
      }
    }
  }

  /** Tetris-style falling PS symbols (spec sheet idle_tetris, enhanced) */
  private idleTetris(t: number) {
    const step = Math.floor(t / 220)
    const H = this.H
    if (this.tetris.stack.length === 0) this.tetris.stack = [0, 0, 0, 0]
    const col = Math.floor(step / 12) % 4
    const y = (step % 12) * Math.floor((H - 10) / 12)
    if (y === 0) this.tetris.sym = step / 12 > 0 ? (this.tetris.sym + 1) % 4 : 0
    this.tetris.stack[col] = y
    // stack pile at bottom
    this.rect(0, H - 6, OLED_W, 6, 1)
    for (let c = 0; c < 4; c++) {
      const sy = this.tetris.stack[c]
      if (sy >= Math.floor((H - 10) / 12) * Math.floor((H - 10) / 12) - 1) continue
      if (c === col) this.psSymbol(this.tetris.sym, 20 + c * 28, Math.min(y, H - 18), 5)
    }
  }

  /** Zero-gravity floating PS symbols */
  private idleFloat(size: number, t: number) {
    const dt = Math.min(50, t - (this.t0 || t))
    this.t0 = t
    for (const f of this.floaters) {
      f.x += (f.dx * dt) / 40
      f.y += (f.dy * dt) / 40
      if (f.x < size + 1 || f.x > OLED_W - size - 1) f.dx = -f.dx
      if (f.y < size + 1 || f.y > this.H - size - 1) f.dy = -f.dy
      this.psSymbol(f.sym, Math.round(f.x), Math.round(f.y), size)
    }
  }

  /** Zero-gravity balls, pushed by the touchpad (touchpad-reactive) */
  private idleBalls(t: number) {
    const dt = Math.min(50, t - (this.t0 || t))
    this.t0 = t
    const k = dt / 40
    for (const b of this.balls) {
      if (this.touch.active) {
        const dx = b.x - this.touch.x, dy = b.y - this.touch.y
        const d2 = dx * dx + dy * dy
        if (d2 < 400 && d2 > 1) {
          b.dx += dx / d2 * 6
          b.dy += dy / d2 * 6
        }
      }
      b.dx = Math.max(-3, Math.min(3, b.dx))
      b.dy = Math.max(-3, Math.min(3, b.dy))
      b.x += b.dx * k
      b.y += b.dy * k
      if (b.x < 0 || b.x > OLED_W - 6) b.dx = -b.dx
      if (b.y < 0 || b.y > this.H - 6) b.dy = -b.dy
      this.rect(Math.round(b.x), Math.round(b.y), 5, 5, 1)
    }
    if (this.touch.active) this.circle(this.touch.x, this.touch.y, 3)
  }

  /** Analog clock — centered dial with sweeping second hand */
  private idleAnalog() {
    const st = this.state
    const cx = 64, cy = Math.round(this.H / 2), r = Math.min(30, this.H / 2 - 3)
    this.circle(cx, cy, r)
    this.circle(cx, cy, 1)
    const ang = (deg: number, len: number) => {
      const rad = ((deg - 90) * Math.PI) / 180
      this.line(cx, cy, Math.round(cx + len * Math.cos(rad)), Math.round(cy + len * Math.sin(rad)))
    }
    ang((st.clock.h % 12) * 30 + st.clock.m * 0.5, r * 0.5)
    ang(st.clock.m * 6, r * 0.75)
    ang(st.clock.s * 6, r - 2)
  }

  /** Digital flip clock — large HH:MM:SS */
  private idleFlip() {
    const st = this.state
    const hh = String(st.clock.h).padStart(2, '0')
    const mm = String(st.clock.m).padStart(2, '0')
    const ss = String(st.clock.s).padStart(2, '0')
    const sep = st.clock.s % 2 === 0 ? ':' : ' '
    this.textBig(6, Math.round(this.H / 2) - 8, `${hh}${sep}${mm}${sep}${ss}`, 2)
  }

  /** Rectangular clock — HH:MM / DD-MM per the sheet */
  private idleRectClock() {
    const st = this.state
    const now = new Date()
    const hh = String(st.clock.h).padStart(2, '0')
    const mm = String(st.clock.m).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const mo = String(now.getMonth() + 1).padStart(2, '0')
    this.text(16, Math.round(this.H / 4), `${hh}:${mm}`)
    this.text(52, Math.round((this.H * 3) / 4) - 8, `${dd}-${mo}`)
  }

  /** Playable Pong with score — AI vs AI or touchpad-controlled P1 */
  private idlePong(t: number) {
    const p = this.pong
    const H = this.H
    if (t - p.last > 16) {
      p.last = t
      p.bx += p.bdx * 2
      p.by += p.bdy * 2
      if (p.by <= 2 || p.by >= H - 6) p.bdy = -p.bdy
      if (p.bx <= 8 || p.bx >= OLED_W - 11) {
        if (p.bx <= 8) p.s2 = (p.s2 + 1) % 10
        else p.s1 = (p.s1 + 1) % 10
        p.bx = 64
        p.by = Math.round(H / 2)
      }
      // paddles: AI; P1 follows touchpad when active
      const target1 = this.touch.active ? this.touch.y : H / 2 + Math.sin(t / 400) * (H / 2 - 10)
      const target2 = H / 2 + Math.cos(t / 500) * (H / 2 - 10)
      p.p1 += Math.sign(target1 - p.p1) * Math.min(2, Math.abs(target1 - p.p1))
      p.p2 += Math.sign(target2 - p.p2) * Math.min(2, Math.abs(target2 - p.p2))
      p.p1 = Math.max(2, Math.min(H - 16, p.p1))
      p.p2 = Math.max(2, Math.min(H - 16, p.p2))
    }
    this.rect(2, Math.round(p.p1), 3, 14, 1)
    this.rect(OLED_W - 5, Math.round(p.p2), 3, 14, 1)
    this.rect(Math.round(p.bx), Math.round(p.by), 3, 3, 1)
    this.text(52, 1, `${p.s1}-${p.s2}`)
  }

  /* ------------------------- tick / render ------------------------- */
  tick(t: number) {
    const st = this.state
    // advance soft clock
    if (t % 1000 < 17) {
      st.clock.s = (st.clock.s + 1) % 60
      if (st.clock.s === 0) {
        st.clock.m = (st.clock.m + 1) % 60
        if (st.clock.m === 0) st.clock.h = (st.clock.h + 1) % 24
      }
      this.dirty = true
    }
    if (this.anim) {
      const el = t - this.anim.start
      if (el >= this.anim.dur) {
        this.anim = null
        this.dirty = true
      } else {
        this.dirty = true
      }
    }
    // expire notifications
    const now = t
    const before = this.notifs.length
    this.notifs = this.notifs.filter((n) => now - n.start < 2600)
    if (before !== this.notifs.length) this.dirty = true

    const saver = this.mode === 'screensaver' || this.mode === 'always_on'
    const movingScreen = [1, 2, 3, 4, 5, 6, 10].includes(st.idleScreen)
    const animated = saver ? movingScreen : (this.currentPageId() === 32 && movingScreen)
    if (animated || saver) this.dirty = true

    if (!this.dirty) return
    this.dirty = false
    this.clear()
    if (this.anim) {
      this.drawAnim(t)
      return
    }
    if (saver) {
      this.drawIdle(st.idleScreen, t)
      return
    }
    this.drawPage(this.currentPageId(), t)
    this.drawNotifs(t)
  }

  private drawNotifs(t: number) {
    if (this.notifs.length === 0) return
    const n = this.notifs[this.notifs.length - 1]
    const el = t - n.start
    if (el < 250) return // brief delay
    const h = 10 + n.lines.length * 9
    const y = 1
    // inverted box
    for (let yy = y; yy < y + h; yy++)
      for (let xx = 2; xx < OLED_W - 2; xx++) this.fb[yy * OLED_W + xx] = this.fb[yy * OLED_W + xx] ? 0 : 1
    this.rect(2, y, OLED_W - 4, h, 0)
    let yy = y + 2
    for (const ln of n.lines) {
      this.text(5, yy, ln)
      yy += 9
    }
  }

  /* ------------------------- hello / bye anims ------------------------- */
  private drawAnim(t: number) {
    const a = this.anim!
    const p = Math.min(1, (t - a.start) / a.dur)
    if (a.kind === 'bye') {
      this.drawBye(a.id, p)
      return
    }
    this.drawHello(a.id, p, t)
  }

  private drawHello(id: number, p: number, t: number) {
    const H = this.H
    switch (id) {
      case 0: // PS Logo — bitmap fade-in
        if (p > 0.15) this.drawBitmap(LOGO_BITMAP_2, 0, H === 64 ? 16 : 0)
        break
      case 1: { // Typewriter
        const s = 'BlueRetro PS2 Bridge'
        const nch = Math.floor(p * 1.4 * s.length)
        this.text(4, Math.round(H / 2) - 4, s.slice(0, nch))
        if (t % 600 < 300) this.px(6 + nch * 6, Math.round(H / 2) - 4, 1)
        break
      }
      case 2: { // Slide in
        const off = Math.round((1 - Math.min(1, p * 1.6)) * OLED_W)
        this.text(off, 12, 'BlueRetro')
        this.text(off, 24, 'PS2 Bridge')
        if (H === 64) this.text(off, 40, 'PS2 adapter')
        break
      }
      case 3: { // Scan reveal
        const lines = Math.floor(p * H)
        this.text(4, 12, 'BlueRetro')
        this.text(4, 24, 'PS2 Bridge')
        for (let y = H - 1; y >= lines; y--) for (let x = 0; x < OLED_W; x++) this.fb[y * OLED_W + x] = 0
        if (lines < H) this.line(0, lines, OLED_W - 1, lines)
        break
      }
      case 4: { // Triple flash
        const phase = Math.floor(p * 6) % 2
        this.text(8, 16, phase ? '' : 'BlueRetro')
        this.text(8, 28, phase ? '' : 'PS2 Bridge')
        break
      }
      case 5: // Simple
        this.text(8, Math.round(H / 2) - 4, 'BlueRetro')
        break
      case 6: // PS2 Logo
        this.text(14, Math.round(H / 2) - 10, 'PlayStation 2')
        this.text(30, Math.round(H / 2) + 2, 'BlueRetro')
        break
      case 7: { // PS2 Draw — strokes appear progressively
        if (p < 0.3) this.line(20, 14, 108, 14)
        else if (p < 0.6) { this.line(20, 14, 108, 14); this.line(64, 14, 40, 34) }
        else { this.line(20, 14, 108, 14); this.line(64, 14, 40, 34); this.text(20, 40, 'PS2 READY') }
        break
      }
      case 8: { // PS Buttons — appear sequentially
        const n = Math.min(4, Math.floor(p * 5))
        for (let i = 0; i < n; i++) this.psSymbol(i, 24 + i * 28, Math.round(H / 2), 9)
        break
      }
      case 9: { // PS Buttons S
        const n = Math.min(4, Math.floor(p * 5))
        for (let i = 0; i < n; i++) this.psSymbol(i, 40 + i * 18, Math.round(H / 2), 5)
        break
      }
      case 10: { // PS Rnd Order
        const order = [2, 0, 3, 1]
        const n = Math.min(4, Math.floor(p * 5))
        for (let i = 0; i < n; i++) this.psSymbol(order[i], 24 + i * 28, Math.round(H / 2), 9)
        break
      }
      case 11: { // GC Cube
        const r = Math.round(4 + p * 14)
        const cx = 64, cy = Math.round(H / 2)
        for (let i = 0; i < 4; i++) {
          const a1 = (i * Math.PI) / 2 + p * 2
          const a2 = ((i + 1) * Math.PI) / 2 + p * 2
          this.line(Math.round(cx + r * Math.cos(a1)), Math.round(cy + r * Math.sin(a1)), Math.round(cx + r * Math.cos(a2)), Math.round(cy + r * Math.sin(a2)))
        }
        break
      }
      case 12: { // GC Cube + Text
        const cx = 24, cy = Math.round(H / 2)
        const r = Math.round(6 + p * 8)
        for (let i = 0; i < 4; i++) {
          const a1 = (i * Math.PI) / 2 + p * 3
          const a2 = ((i + 1) * Math.PI) / 2 + p * 3
          this.line(Math.round(cx + r * Math.cos(a1)), Math.round(cy + r * Math.sin(a1)), Math.round(cx + r * Math.cos(a2)), Math.round(cy + r * Math.sin(a2)))
        }
        this.text(46, Math.round(H / 2) - 4, 'PS2 Bridge')
        break
      }
      case 13: { // GC Wordmark
        const w = Math.floor(p * 1.5 * 11)
        this.textBig(10, Math.round(H / 2) - 8, 'PS2BRIDGE'.slice(0, Math.min(9, w)), 1)
        break
      }
      case 14: { // GC Cube Big
        const r = Math.round(8 + p * 24)
        const cx = 64, cy = Math.round(H / 2)
        for (let i = 0; i < 4; i++) {
          const a1 = (i * Math.PI) / 2 - p * 2.5
          const a2 = ((i + 1) * Math.PI) / 2 - p * 2.5
          this.line(Math.round(cx + r * Math.cos(a1)), Math.round(cy + r * Math.sin(a1)), Math.round(cx + r * Math.cos(a2)), Math.round(cy + r * Math.sin(a2)))
        }
        break
      }
    }
  }

  private drawBye(id: number, p: number) {
    const H = this.H
    // start from captured frame
    if (this.prevFb) this.fb.set(this.prevFb)
    const wipeAll = () => this.clear()
    switch (id) {
      case 0: { // CRT phosphor — collapse to horizontal line
        if (p > 0.7) {
          wipeAll()
          const y = Math.round(H / 2)
          const w = Math.round(OLED_W * (1 - (p - 0.7) / 0.3))
          this.line(64 - w / 2, y, 64 + w / 2, y)
        } else {
          const keep = Math.ceil(H * (1 - p))
          const y0 = Math.round((H - keep) / 2)
          const tmp = new Uint8Array(this.fb)
          this.clear()
          for (let y = 0; y < keep; y++) for (let x = 0; x < OLED_W; x++) this.fb[(y0 + y) * OLED_W + x] = tmp[(y + Math.floor(p * H / 2)) % H * OLED_W + x]
        }
        break
      }
      case 1: { // Venetian blind
        const bands = Math.floor(p * 8) + 1
        for (let b = 0; b < bands; b++) {
          const y0 = Math.round((H / 8) * b)
          const bh = Math.round((H / 8) * Math.min(1, p * 8 - b))
          for (let y = y0; y < y0 + bh; y++) for (let x = 0; x < OLED_W; x++) this.fb[y * OLED_W + x] = 0
        }
        break
      }
      case 2: { // Pixel drain — columns fall away
        const cut = Math.round(H * p)
        const tmp = new Uint8Array(this.fb)
        this.clear()
        for (let y = 0; y < H; y++)
          for (let x = 0; x < OLED_W; x++) {
            const yy = y - cut + (x % 3)
            if (yy >= 0) this.fb[yy * OLED_W + x] = tmp[y * OLED_W + x]
          }
        break
      }
      case 3: { // Static noise
        for (let y = 0; y < H; y++) for (let x = 0; x < OLED_W; x++) this.fb[y * OLED_W + x] = Math.random() < (1 - p) * 0.5 ? 1 : 0
        break
      }
      case 4: { // Diagonal wipe
        const cut = Math.round((OLED_W + H) * p)
        for (let y = 0; y < H; y++) for (let x = 0; x < OLED_W; x++) if (x + y < cut) this.fb[y * OLED_W + x] = 0
        break
      }
      case 5: { // Checkerboard
        const cells = Math.floor(p * 8) + 1
        const cw = Math.ceil(OLED_W / cells), ch = Math.ceil(H / cells)
        for (let cy = 0; cy < cells; cy++)
          for (let cx = 0; cx < cells; cx++)
            if ((cx + cy) % 2 === 0)
              for (let y = cy * ch; y < Math.min(H, (cy + 1) * ch); y++)
                for (let x = cx * cw; x < Math.min(OLED_W, (cx + 1) * cw); x++) this.fb[y * OLED_W + x] = 0
        break
      }
      case 6: { // Fade out — random dimming
        for (let y = 0; y < H; y++) for (let x = 0; x < OLED_W; x++) if (this.fb[y * OLED_W + x] && Math.random() < p * p) this.fb[y * OLED_W + x] = 0
        break
      }
      case 7: { // Explosion — pixels fly outward from center
        const cx = 64, cy = H / 2
        const tmp = new Uint8Array(this.fb)
        this.clear()
        const force = p * 90
        for (let y = 0; y < H; y++)
          for (let x = 0; x < OLED_W; x++) {
            if (!tmp[y * OLED_W + x]) continue
            const dx = x - cx, dy = y - cy
            const d = Math.sqrt(dx * dx + dy * dy) || 1
            const nx = Math.round(x + (dx / d) * force)
            const ny = Math.round(y + (dy / d) * force)
            this.px(nx, ny, 1)
          }
        break
      }
      case 8: { // PS Logo Boom
        wipeAll()
        if (p < 0.4) this.drawBitmap(LOGO_BITMAP_2, 0, H === 64 ? 16 : 0)
        else {
          const s = 1 + (p - 0.4) * 2
          const tmp = LOGO_BITMAP_2
          for (let i = 0; i < OLED_W * 32; i++) {
            if (!tmp[i]) continue
            const x = i % OLED_W, y = Math.floor(i / OLED_W)
            const dx = (x - 64) * s, dy = (y - 16) * s
            this.px(Math.round(64 + dx), Math.round(H / 2 + dy), 1)
          }
        }
        break
      }
      case 9: { // PS Symbols Boom — symbols scatter
        wipeAll()
        const syms = Math.min(4, Math.floor(p * 6))
        for (let i = 0; i < syms; i++) {
          const ang = (i * Math.PI) / 2
          const d = p * 70
          this.psSymbol(i, Math.round(64 + Math.cos(ang) * d), Math.round(H / 2 + Math.sin(ang) * d), 8)
        }
        break
      }
    }
  }
}
