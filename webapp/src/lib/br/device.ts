/**
 * MethyleneX Virtual ESP32 — device core
 *
 * Implements the full GATT byte protocol of the real firmware
 * (service 56830f56-…-2fa176799a00, chars a01..a0c) on top of:
 *   - virtual NVS (localStorage, versioned + snapshot)
 *   - MethyleneX Settings API (validation, event queue, versioning)
 *   - Display Engine (SSD1306 sim), Audio Engine (buzzer sim)
 *   - Color Manager (per-port / auto / player defaults / temporary effects)
 *   - Shortcut Manager (Home combos + touchpad gestures per spec sheets)
 */
import {
  BR_UUID, CFG, CFG_LENGTH, CMD, HELLO_ANIMS, BYE_ANIMS, PLAYER_COLORS,
  SHORTCUT_DOUBLE_MS, SHORTCUT_HOLD_MS, VIRTUAL_API_VERSION, VIRTUAL_BDADDR,
  VIRTUAL_FW_VERSION, type SoundEventKey,
} from './constants'
import { AudioEngine } from './audio'
import { DisplayEngine, type OledHeight } from './display'

/* ------------------------------------------------------------------ */
/* Virtual NVS — versioned key/value store with snapshot               */
/* ------------------------------------------------------------------ */
const NVS_PREFIX = 'mx_nvs_'
const NVS_VERSION_KEY = 'mx_nvs_version'
const NVS_VERSION = 3

export class VirtualNVS {
  private mem = new Map<string, string>()

  constructor() {
    try {
      if (typeof localStorage !== 'undefined') {
        const ver = Number(localStorage.getItem(NVS_VERSION_KEY) ?? '0')
        if (ver === NVS_VERSION) {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i)
            if (k?.startsWith(NVS_PREFIX)) this.mem.set(k.slice(NVS_PREFIX.length), localStorage.getItem(k) ?? '')
          }
        }
      }
    } catch { /* private mode — memory only */ }
  }

  get(key: string, def: string): string {
    return this.mem.get(key) ?? def
  }

  set(key: string, val: string) {
    this.mem.set(key, val)
    try { localStorage.setItem(NVS_PREFIX + key, val); localStorage.setItem(NVS_VERSION_KEY, String(NVS_VERSION)) } catch { }
  }

  del(key: string) {
    this.mem.delete(key)
    try { localStorage.removeItem(NVS_PREFIX + key) } catch { }
  }

  snapshot(): string {
    return JSON.stringify({ v: NVS_VERSION, data: Object.fromEntries(this.mem) })
  }

  restore(json: string): boolean {
    try {
      const obj = JSON.parse(json) as { v: number; data: Record<string, string> }
      if (obj.v !== NVS_VERSION) return false
      this.mem = new Map(Object.entries(obj.data))
      for (const [k, v] of this.mem) { try { localStorage.setItem(NVS_PREFIX + k, v) } catch { } }
      return true
    } catch { return false }
  }

  clearAll() {
    this.mem.clear()
    try {
      const keys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k?.startsWith(NVS_PREFIX) || k === NVS_VERSION_KEY) keys.push(k)
      }
      keys.forEach((k) => localStorage.removeItem(k))
    } catch { }
  }
}

/* ------------------------------------------------------------------ */
/* Virtual controller (DS4 / DS5)                                      */
/* ------------------------------------------------------------------ */
export const BTN = {
  TRIANGLE: 1 << 0, CIRCLE: 1 << 1, CROSS: 1 << 2, SQUARE: 1 << 3,
  UP: 1 << 4, DOWN: 1 << 5, LEFT: 1 << 6, RIGHT: 1 << 7,
  L1: 1 << 8, R1: 1 << 9, L2: 1 << 10, R2: 1 << 11,
  SHARE: 1 << 12, OPTIONS: 1 << 13, L3: 1 << 14, R3: 1 << 15,
  PS: 1 << 16, TOUCHCLICK: 1 << 17,
} as const

export interface CtrlState {
  btns: number
  lx: number; ly: number; rx: number; ry: number
  l2: number; r2: number
}

export class VirtualController {
  connected = false
  type: 'DS4' | 'DS5' = 'DS4'
  battery = 82
  playerIndex = 0 // 0 = unassigned, 1..4 = player slot
  state: CtrlState = { btns: 0, lx: 0, ly: 0, rx: 0, ry: 0, l2: 0, r2: 0 }
  touch: { x: number; y: number; active: boolean } = { x: 64, y: 32, active: false }
  rumble = false

  press(btn: number) { this.state.btns |= btn }
  release(btn: number) { this.state.btns &= ~btn }
  setAxis(which: 'lx' | 'ly' | 'rx' | 'ry' | 'l2' | 'r2', v: number) { this.state[which] = v }
}

/* ------------------------------------------------------------------ */
/* Color Manager — per the "پالت رنگ PS4 و PS5" sheet                  */
/* ------------------------------------------------------------------ */
export const LED_PALETTE = [
  ...PLAYER_COLORS.map((c) => c.hex),
  '#FFFFFF', '#00E5D0', '#FF9800', '#9C27B0', '#FFEB3B',
]

export interface PortColorCfg {
  mode: 'manual' | 'auto'
  hex: string
  brightness: number
  rumble: boolean
}

interface Effect {
  color: string
  until: number
  period: number
}

export class ColorManager {
  ports: PortColorCfg[] = [
    { mode: 'manual', hex: PLAYER_COLORS[0].hex, brightness: 255, rumble: true },
    { mode: 'manual', hex: PLAYER_COLORS[1].hex, brightness: 255, rumble: true },
  ]
  playerDefaults = PLAYER_COLORS.map((c) => c.hex)
  private effects: (Effect | null)[] = [null, null]

  /** Resolve the currently visible RGB for a port */
  resolve(port: number, now: number): { r: number; g: number; b: number } {
    const eff = this.effects[port]
    let hex: string
    if (eff && now < eff.until) {
      hex = Math.floor(now / eff.period) % 2 === 0 ? eff.color : this.baseHex(port)
    } else {
      if (eff) this.effects[port] = null
      hex = this.baseHex(port)
    }
    return this.hexToRgb(hex)
  }

  private baseHex(port: number): string {
    const cfg = this.ports[port]
    if (cfg.mode === 'auto') {
      return this.playerDefaults[port] ?? PLAYER_COLORS[port].hex
    }
    return cfg.hex
  }

  blink(port: number, color: string, ms: number, period = 200) {
    this.effects[port] = { color, until: Date.now() + ms, period }
  }

  cycle(port: number, dir: 1 | -1) {
    const cfg = this.ports[port]
    const idx = LED_PALETTE.indexOf(this.baseHex(port))
    const next = ((idx < 0 ? 0 : idx) + dir + LED_PALETTE.length) % LED_PALETTE.length
    cfg.hex = LED_PALETTE[next]
    cfg.mode = 'manual'
  }

  hexToRgb(hex: string): { r: number; g: number; b: number } {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex)
    if (!m) return { r: 255, g: 255, b: 255 }
    const v = parseInt(m[1], 16)
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 }
  }
}

/* ------------------------------------------------------------------ */
/* Device                                                              */
/* ------------------------------------------------------------------ */
export type DeviceLogKind = 'gatt' | 'event' | 'cmd'
export interface DeviceLogEntry { ts: number; kind: DeviceLogKind; msg: string }
export type DeviceListener = (entry: DeviceLogEntry) => void

const DEFAULT_GLOBAL_CFG = (): Uint8Array => {
  const b = new Uint8Array(CFG_LENGTH)
  b[CFG.SYSTEM_CFG] = 0
  b[CFG.MULTITAP_CFG] = 0
  b[CFG.INQUIRY_MODE] = 0
  b[CFG.BANKSEL] = 0
  b[CFG.MELODY_POWER_ON] = 2  // BOOT_CHIME
  b[CFG.MELODY_POWER_OFF] = 14 // PS2_BOOT
  b[CFG.MELODY_RESET] = 25     // SUCCESS
  b[CFG.MELODY_CTRL_ON] = 5    // SONIC_RING
  b[CFG.MELODY_CTRL_OFF] = 26  // ALERT
  b[CFG.MAC_SPOOF_ENABLED] = 0
  for (let i = 0; i < 6; i++) b[CFG.MAC_SPOOF_0 + i] = 0
  b[CFG.PAGE_ORDER + 0] = 0
  b[CFG.PAGE_ORDER + 1] = 1
  b[CFG.PAGE_ORDER + 2] = 2
  b[CFG.PAGE_ORDER + 3] = 8
  b[CFG.PAGE_ORDER + 4] = 34
  b[CFG.PAGE_ORDER + 5] = 32
  for (let i = 6; i < 20; i++) b[CFG.PAGE_ORDER + i] = 255
  b[CFG.AUTOPAUSE] = 1
  b[CFG.VIB_CONNECT] = 1
  b[CFG.VIB_POWEROFF] = 1
  b[CFG.BYE_ANIM] = 0
  b[CFG.HELLO_ANIM] = 0
  b[CFG.TOUCH_NAV] = 1
  b[CFG.SCREENSAVER_ANIM] = 1 // cube
  b[CFG.OLED_HEIGHT] = 64
  b[CFG.OLED_NOTIFS] = 1
  b[CFG.CLOCK_MODE] = 7
  b[CFG.OLED_ROTATED] = 0
  b[CFG.WIRED_DETECT] = 3
  b[CFG.PS2_FAT_ADAPTIVE_PWR] = 0
  b[CFG.PS2_FAT_HOME_PASSTHRU] = 0
  return b
}

export class VirtualBlueRetroDevice {
  name = 'BlueRetro MethyleneX'
  nvs = new VirtualNVS()
  audio = new AudioEngine()
  display = new DisplayEngine()
  color = new ColorManager()
  controllers: VirtualController[] = [new VirtualController(), new VirtualController()]

  globalCfg = DEFAULT_GLOBAL_CFG()
  portData = [
    { devMode: 0, accMode: 2, r: 46, g: 109, b: 180, brightness: 255 },
    { devMode: 0, accMode: 2, r: 196, g: 58, b: 58, brightness: 255 },
  ]
  consolePower = true
  pairingMode = false
  bank = 0
  inputMem = [new Uint8Array(2048), new Uint8Array(2048)]
  files = ['br_config.json', 'mx_preset_1.json']

  private selectedPort = 0
  private memAddr = { port: 0, offset: 0 }
  private lastCmdResponse = new Uint8Array(0)
  private listeners: DeviceListener[] = []
  private homeTimers: (ReturnType<typeof setTimeout> | null)[] = [null, null]
  private lastHomeDown: number[] = [0, 0]
  private comboHomeHeld: boolean[] = [false, false]
  private pendingPowerOff: (ReturnType<typeof setTimeout> | null)[] = [null, null]
  traffic: DeviceLogEntry[] = []

  constructor() {
    this.loadPersisted()
    this.audio.onEvent = (msg) => this.log('event', msg)
    // wire display swipe actions to color manager / battery notifications
    this.display.onLedCycle = (dir) => {
      this.color.cycle(this.selectedUiPort, dir)
      const hex = this.color.ports[this.selectedUiPort].hex
      this.log('event', `LED cycle P${this.selectedUiPort + 1} → ${hex}`)
      this.syncPortColor(this.selectedUiPort)
      this.display.notify([`LED P${this.selectedUiPort + 1}`, hex.toUpperCase()])
    }
    this.display.onBatteryShow = (port) => {
      const c = this.controllers[port]
      if (c.connected) this.display.notify([`P${port + 1} ${c.type}`, `Battery ${c.battery}%`])
      else this.display.notify([`P${port + 1}`, 'No controller'])
    }
    this.applyGlobalCfgToEngines()
  }

  /** port driven by touchpad swipes on the OLED (P1 by default) */
  selectedUiPort = 0

  /* -------------------- logging / events -------------------- */
  log(kind: DeviceLogKind, msg: string) {
    const entry: DeviceLogEntry = { ts: Date.now(), kind, msg }
    this.traffic.unshift(entry)
    if (this.traffic.length > 400) this.traffic.pop()
    this.listeners.forEach((l) => l(entry))
  }

  addListener(l: DeviceListener) {
    this.listeners.push(l)
    return () => { this.listeners = this.listeners.filter((x) => x !== l) }
  }

  /* -------------------- persistence -------------------- */
  private loadPersisted() {
    const saved = this.nvs.get('globalcfg', '')
    if (saved) {
      try {
        const arr = JSON.parse(saved) as number[]
        if (arr.length === CFG_LENGTH) this.globalCfg = new Uint8Array(arr)
      } catch { }
    }
    const colors = this.nvs.get('colorcfg', '')
    if (colors) {
      try { this.color.ports = JSON.parse(colors) as PortColorCfg[] } catch { }
    }
    const vol = this.nvs.get('volume', '')
    if (vol) this.audio.setVolume(Number(vol))
    // OLED panel identity persisted like a wired module
    const h = Number(this.nvs.get('oledHeight', '64'))
    this.display.setHeight(h === 32 ? 32 : 64)
  }

  private persistGlobalCfg() {
    this.nvs.set('globalcfg', JSON.stringify(Array.from(this.globalCfg)))
  }

  private persistColorCfg() {
    this.nvs.set('colorcfg', JSON.stringify(this.color.ports))
  }

  saveVolume(v: number) {
    this.audio.setVolume(v)
    this.nvs.set('volume', String(v))
  }

  saveOledHeight(h: OledHeight) {
    this.globalCfg[CFG.OLED_HEIGHT] = h
    this.display.setHeight(h)
    this.nvs.set('oledHeight', String(h))
    this.persistGlobalCfg()
    this.log('event', `OLED height → ${h}`)
  }

  /* -------------------- engines sync -------------------- */
  private applyGlobalCfgToEngines() {
    const d = this.display
    d.state.height = this.globalCfg[CFG.OLED_HEIGHT] === 32 ? 32 : 64
    d.state.rotated = this.globalCfg[CFG.OLED_ROTATED] !== 0
    d.state.notifications = this.globalCfg[CFG.OLED_NOTIFS] !== 0
    d.state.idleScreen = this.globalCfg[CFG.SCREENSAVER_ANIM] ?? 1
    d.state.helloAnim = this.globalCfg[CFG.HELLO_ANIM] ?? 0
    d.state.byeAnim = this.globalCfg[CFG.BYE_ANIM] ?? 0
    d.state.clockMode = this.globalCfg[CFG.CLOCK_MODE] ?? 7
    d.state.consolePower = this.consolePower
    d.state.bdaddr = this.bdaddrStr()
    const order: number[] = []
    for (let i = 0; i < 20; i++) {
      const v = this.globalCfg[CFG.PAGE_ORDER + i]
      if (v !== 255 && !order.includes(v)) order.push(v)
    }
    if (order.length) d.state.pageOrder = order
  }

  syncPortColor(port: number) {
    const now = Date.now()
    const { r, g, b } = this.color.resolve(port, now)
    const pd = this.portData[port]
    pd.r = r; pd.g = g; pd.b = b
    pd.brightness = this.color.ports[port].brightness
    pd.accMode = this.color.ports[port].rumble ? 2 : 0
    this.display.state.ports[port] = {
      connected: this.controllers[port].connected,
      type: this.controllers[port].type,
      battery: this.controllers[port].battery,
      r, g, b,
    }
    this.display.dirty = true
  }

  bdaddrStr(): string {
    return [...VIRTUAL_BDADDR].reverse().map((x) => x.toString(16).padStart(2, '0')).join(':').toUpperCase()
  }

  playEventSound(ev: SoundEventKey) {
    const idx = this.globalCfg[
      ev === 'powerOn' ? CFG.MELODY_POWER_ON :
      ev === 'powerOff' ? CFG.MELODY_POWER_OFF :
      ev === 'reset' ? CFG.MELODY_RESET :
      ev === 'ctrlOn' ? CFG.MELODY_CTRL_ON : CFG.MELODY_CTRL_OFF
    ]
    if (idx !== 1) this.audio.enqueue(idx, ev) // 1 = SILENT
  }

  /* -------------------- connect / disconnect -------------------- */
  connectController(port: 0 | 1, type: 'DS4' | 'DS5') {
    const c = this.controllers[port]
    if (c.connected) return
    c.connected = true
    c.type = type
    c.battery = 60 + Math.floor(Math.random() * 40)
    c.playerIndex = port + 1
    if (this.color.ports[port].mode === 'auto') {
      this.color.ports[port].hex = this.color.playerDefaults[port]
    }
    this.syncPortColor(port)
    this.log('event', `P${port + 1}: ${type} connected (BAT ${c.battery}%)`)
    this.display.notify([`P${port + 1} ${type}`, `BAT ${c.battery}%`])
    this.display.playHello(this.globalCfg[CFG.HELLO_ANIM] ?? 0)
    this.playEventSound('ctrlOn')
    if (this.globalCfg[CFG.VIB_CONNECT]) {
      this.log('event', `P${port + 1}: rumble pulse (vib on connect)`)
    }
  }

  disconnectController(port: 0 | 1, reason = 'webapp') {
    const c = this.controllers[port]
    if (!c.connected) return
    c.connected = false
    c.state.btns = 0
    this.log('event', `P${port + 1}: disconnected (${reason})`)
    this.display.notify([`P${port + 1}`, 'Disconnected'])
    this.playEventSound('ctrlOff')
    this.display.dirty = true
  }

  /* -------------------- power / system -------------------- */
  powerOn() {
    if (this.consolePower) return
    this.consolePower = true
    this.display.state.consolePower = true
    this.display.playHello(this.globalCfg[CFG.HELLO_ANIM] ?? 0)
    this.playEventSound('powerOn')
    this.log('event', 'Console power ON')
  }

  powerOff() {
    if (!this.consolePower) return
    this.display.playBye(this.globalCfg[CFG.BYE_ANIM] ?? 0)
    this.playEventSound('powerOff')
    this.log('event', 'Console power OFF (Home held 3 s)')
    setTimeout(() => {
      this.consolePower = false
      this.display.state.consolePower = false
      this.display.dirty = true
    }, 1200)
  }

  consoleReset() {
    this.playEventSound('reset')
    this.log('event', 'Console RESET (Home double-tap)')
    this.display.notify(['RESET', 'Console restarting'])
    this.display.playHello(this.globalCfg[CFG.HELLO_ANIM] ?? 0)
  }

  factoryReset() {
    this.nvs.clearAll()
    this.globalCfg = DEFAULT_GLOBAL_CFG()
    this.color.ports = [
      { mode: 'manual', hex: PLAYER_COLORS[0].hex, brightness: 255, rumble: true },
      { mode: 'manual', hex: PLAYER_COLORS[1].hex, brightness: 255, rumble: true },
    ]
    this.audio.setVolume(60)
    this.display.setHeight(64)
    this.applyGlobalCfgToEngines()
    this.persistGlobalCfg()
    this.log('event', 'FACTORY RESET — NVS erased, defaults restored')
    this.display.notify(['FACTORY', 'RESET'])
  }

  espReset() {
    this.log('event', 'ESP32 soft reset')
    this.applyGlobalCfgToEngines()
    this.display.playHello(this.globalCfg[CFG.HELLO_ANIM] ?? 0)
  }

  deepSleep() {
    this.log('event', 'Deep sleep — BLE off until reset')
    this.display.setMode('always_on')
  }

  setPairing(on: boolean) {
    this.pairingMode = on
    this.log('event', `Pairing mode ${on ? 'ON (BR_INQ visible)' : 'OFF'}`)
    this.display.notify([on ? 'PAIRING ON' : 'PAIRING OFF', on ? 'BR_INQ' : ''])
  }

  /* -------------------- Shortcut Manager -------------------- */
  /** Button press from a virtual controller — runs the Shortcut Manager */
  buttonDown(port: 0 | 1, btn: number) {
    const c = this.controllers[port]
    if (!c.connected) return
    c.press(btn)
    const isHome = btn === BTN.PS
    const st = this.globalCfg

    if (isHome) {
      this.comboHomeHeld[port] = true
      const now = Date.now()
      if (now - this.lastHomeDown[port] < SHORTCUT_DOUBLE_MS) {
        // double tap → console reset
        this.lastHomeDown[port] = 0
        if (this.homeTimers[port]) { clearTimeout(this.homeTimers[port]!); this.homeTimers[port] = null }
        this.consoleReset()
      } else {
        this.lastHomeDown[port] = now
        // start hold timer → power off after 3 s
        if (st[CFG.VIB_POWEROFF]) {
          setTimeout(() => {
            if (this.comboHomeHeld[port]) this.log('event', `P${port + 1}: warning rumble (power off in 500 ms)`)
          }, SHORTCUT_HOLD_MS - 500)
        }
        this.pendingPowerOff[port] = setTimeout(() => {
          if (this.comboHomeHeld[port]) this.powerOff()
        }, SHORTCUT_HOLD_MS)
      }
    }

    if (this.comboHomeHeld[port]) {
      if (btn === BTN.OPTIONS) this.setPairing(!this.pairingMode)
      if (btn === BTN.SHARE) {
        this.disconnectController(port, 'Home + Share')
        this.comboHomeHeld[port] = false
        if (this.pendingPowerOff[port]) clearTimeout(this.pendingPowerOff[port]!)
        return
      }
      if (btn === BTN.UP) this.display.nextPage(-1)
      if (btn === BTN.DOWN) this.display.nextPage(1)
      if (btn === BTN.LEFT) this.display.nextPage(-1)
      if (btn === BTN.RIGHT) this.display.nextPage(1)
    }
  }

  buttonUp(port: 0 | 1, btn: number) {
    const c = this.controllers[port]
    c.release(btn)
    if (btn === BTN.PS) {
      this.comboHomeHeld[port] = false
      if (this.pendingPowerOff[port]) { clearTimeout(this.pendingPowerOff[port]!); this.pendingPowerOff[port] = null }
    }
  }

  /** Touchpad swipe → OLED navigation (per the Touchpad gestures sheet) */
  touchpadSwipe(port: 0 | 1, dir: 'left' | 'right' | 'up' | 'down') {
    if (!this.globalCfg[CFG.TOUCH_NAV]) return
    this.log('event', `P${port + 1} touchpad swipe ${dir}`)
    this.display.swipe(dir)
  }

  touchpadTap(port: 0 | 1) {
    this.log('event', `P${port + 1} touchpad tap → wake`)
    this.display.wake()
  }

  /* -------------------- GATT surface -------------------- */
  async readCharacteristic(idx: number): Promise<DataView> {
    let data: Uint8Array
    if (idx === 1) data = new Uint8Array(this.globalCfg)
    else if (idx === 3) {
      const pd = this.portData[this.selectedPort]
      this.syncPortColor(this.selectedPort)
      data = new Uint8Array([pd.devMode, pd.accMode, pd.r, pd.g, pd.b, pd.brightness])
    } else if (idx === 5) {
      data = new Uint8Array(this.inputMem[this.memAddr.port].slice(this.memAddr.offset, this.memAddr.offset + 512))
    } else if (idx === 6) {
      data = new Uint8Array([VIRTUAL_API_VERSION])
    } else if (idx === 7) {
      data = new Uint8Array(this.lastCmdResponse)
    } else if (idx === 9) {
      data = new TextEncoder().encode(VIRTUAL_FW_VERSION)
    } else if (idx === 12) {
      data = new Uint8Array(VIRTUAL_BDADDR)
    } else {
      data = new Uint8Array(0)
    }
    this.log('gatt', `R ch${idx} ← ${Array.from(data.slice(0, 24)).map((b) => b.toString(16).padStart(2, '0')).join(' ')}${data.length > 24 ? '…' : ''}`)
    return new DataView(data.buffer)
  }

  async writeCharacteristic(idx: number, buf: ArrayBuffer | number[]): Promise<void> {
    const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf)
    this.log('gatt', `W ch${idx} → ${Array.from(bytes.slice(0, 24)).map((b) => b.toString(16).padStart(2, '0')).join(' ')}${bytes.length > 24 ? '…' : ''}`)
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

    if (idx === 1) {
      // global config write — validates length (MethyleneX Settings API)
      if (bytes.byteLength < 2 || bytes.byteLength > CFG_LENGTH) {
        this.log('event', `cfg write rejected: len ${bytes.byteLength}`)
        return
      }
      const prevHeight = this.globalCfg[CFG.OLED_HEIGHT]
      this.globalCfg.set(bytes)
      if (this.globalCfg[CFG.OLED_HEIGHT] !== prevHeight) {
        this.display.setHeight(this.globalCfg[CFG.OLED_HEIGHT] === 32 ? 32 : 64)
        this.nvs.set('oledHeight', String(this.globalCfg[CFG.OLED_HEIGHT]))
      }
      this.applyGlobalCfgToEngines()
      this.persistGlobalCfg()
      return
    }
    if (idx === 2) {
      this.selectedPort = dv.getUint16(0, true)
      return
    }
    if (idx === 3) {
      const pd = this.portData[this.selectedPort]
      pd.devMode = dv.getUint8(0)
      pd.accMode = dv.getUint8(1)
      const cm = this.color.ports[this.selectedPort]
      cm.hex = `#${[2, 3, 4].map((i) => dv.getUint8(i).toString(16).padStart(2, '0')).join('')}`
      cm.mode = 'manual'
      cm.brightness = dv.getUint8(5)
      cm.rumble = (dv.getUint8(1) & 2) !== 0
      this.syncPortColor(this.selectedPort)
      this.persistColorCfg()
      return
    }
    if (idx === 4) {
      const port = dv.getUint16(0, true)
      this.memAddr = { port: Math.min(1, port), offset: bytes.byteLength >= 4 ? dv.getUint16(2, true) : 0 }
      return
    }
    if (idx === 5) {
      const target = this.inputMem[this.memAddr.port]
      target.set(bytes.slice(0, Math.min(512, target.length - this.memAddr.offset)), this.memAddr.offset)
      return
    }
    if (idx === 7) {
      await this.handleCommand(bytes)
      return
    }
    if (idx === 8) {
      this.log('cmd', `OTA chunk ${bytes.byteLength}B`)
      return
    }
  }

  private async handleCommand(bytes: Uint8Array) {
    if (bytes.byteLength === 0) return
    const cmd = bytes[0]
    const arg = (i: number) => (bytes.byteLength > i ? bytes[i] : 0)
    const respond = (data: number[]) => { this.lastCmdResponse = new Uint8Array(data) }
    this.log('cmd', `cmd ${cmd}${bytes.byteLength > 1 ? ' ' + Array.from(bytes.slice(1)).join(',') : ''}`)

    switch (cmd) {
      case CMD.GET_CFG_SRC:
        respond([this.bank])
        break
      case CMD.SET_DEFAULT_CFG:
        this.bank = 0
        this.log('event', 'cfg source → default')
        break
      case CMD.SET_GAME_ID_CFG:
        this.bank = 2
        break
      case CMD.GET_CONTROLLER_STATE: {
        const port = Math.min(1, arg(1))
        const c = this.controllers[port]
        const b = new Uint8Array(16)
        const dv = new DataView(b.buffer)
        dv.setUint32(0, c.state.btns >>> 0, true)
        dv.setInt16(4, c.state.lx, true)
        dv.setInt16(6, c.state.ly, true)
        dv.setInt16(8, c.state.rx, true)
        dv.setInt16(10, c.state.ry, true)
        dv.setInt16(12, c.state.l2, true)
        dv.setInt16(14, c.state.r2, true)
        respond(Array.from(b))
        break
      }
      case CMD.GET_OLED_STATUS:
        respond([1, this.display.state.height])
        break
      case CMD.DEEP_SLEEP:
        this.deepSleep()
        break
      case CMD.ESP_RESET:
        this.espReset()
        break
      case CMD.FACTORY_RESET:
        this.factoryReset()
        break
      case CMD.POWER_ON:
        this.powerOn()
        break
      case CMD.POWER_OFF:
        this.powerOff()
        break
      case CMD.CONSOLE_RESET:
        this.consoleReset()
        break
      case CMD.INQUIRY:
        this.setPairing(true)
        break
      case CMD.DISCONNECT_PORT: {
        const port = Math.min(1, arg(1)) as 0 | 1
        this.disconnectController(port, 'command')
        break
      }
      case CMD.SWIPE_NEXT:
        this.display.swipe('left')
        break
      case CMD.SWIPE_PREV:
        this.display.swipe('right')
        break
      case CMD.PREVIEW_MELODY:
        this.audio.preview(arg(1))
        break
      case CMD.PREVIEW_COLOR: {
        const port = Math.min(1, arg(1))
        const cm = this.color.ports[port]
        const save = cm.hex
        cm.hex = `#${[arg(2), arg(3), arg(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`
        this.syncPortColor(port)
        setTimeout(() => { cm.hex = save; this.syncPortColor(port) }, 900)
        break
      }
      case CMD.PREVIEW_BYE_ANIM:
        this.display.playBye(arg(1))
        break
      case CMD.PREVIEW_HELLO_ANIM:
        this.display.playHello(arg(1))
        break
      case CMD.GOTO_DISPLAY_PAGE:
        this.display.gotoPageId(arg(1))
        break
      case CMD.SET_CLOCK: {
        const d = this.display.state.clock
        d.h = arg(1); d.m = arg(2); d.s = arg(3)
        this.log('event', `clock set ${arg(1)}:${arg(2)}:${arg(3)}`)
        break
      }
      case CMD.PREVIEW_CLOCK:
        this.display.gotoPageId(32)
        break
      case CMD.INJECT_CTRL: {
        const port = Math.min(1, arg(1)) as 0 | 1
        const c = this.controllers[port]
        if (c.connected && bytes.byteLength >= 18) {
          const dv = new DataView(bytes.buffer, bytes.byteOffset)
          c.state.btns = dv.getUint32(2, true) >>> 0
          c.state.lx = dv.getInt16(6, true)
          c.state.ly = dv.getInt16(8, true)
          c.state.rx = dv.getInt16(10, true)
          c.state.ry = dv.getInt16(12, true)
          c.state.l2 = dv.getInt16(14, true)
          c.state.r2 = dv.getInt16(16, true)
          this.display.dirty = true
        }
        break
      }
      case CMD.FILES_LIST_START:
      case CMD.FILES_LIST_NEXT:
        respond([])
        break
      case CMD.OTA_BEGIN:
        this.log('event', 'OTA session started (virtual flash)')
        break
      case CMD.OTA_END:
        this.log('event', 'OTA finished — rebooting (virtual)')
        this.espReset()
        break
      case CMD.OTA_ABORT:
        this.log('event', 'OTA aborted')
        break
      default:
        this.log('cmd', `cmd ${cmd} acknowledged`)
    }
  }

  /* Color effects helper used by the UI page */
  blinkEffect(port: 0 | 1, color: string, ms: number) {
    this.color.blink(port, color, ms)
    const tick = setInterval(() => this.syncPortColor(port), 80)
    setTimeout(() => { clearInterval(tick); this.syncPortColor(port) }, ms + 100)
    this.log('event', `P${port + 1}: temporary effect ${color} (${ms} ms)`)
  }

  /* ---- mutator API for the UI (React compiler: no direct singleton writes) ---- */
  setGlobalCfgByte(offset: number, value: number) {
    this.globalCfg[offset] = value
    this.persistGlobalCfg()
    this.display.dirty = true
  }

  setColorMode(port: 0 | 1, mode: 'manual' | 'auto') {
    this.color.ports[port].mode = mode
    this.syncPortColor(port)
    this.persistColorCfg()
  }

  setColorHex(port: 0 | 1, hex: string, persist = false) {
    this.color.ports[port].hex = hex
    this.color.ports[port].mode = 'manual'
    this.syncPortColor(port)
    if (persist) this.persistColorCfg()
  }

  setColorBrightness(port: 0 | 1, brightness: number) {
    this.color.ports[port].brightness = brightness
    this.syncPortColor(port)
  }

  setColorRumble(port: 0 | 1, rumble: boolean) {
    this.color.ports[port].rumble = rumble
    this.syncPortColor(port)
    this.persistColorCfg()
  }

  setPlayerDefault(idx: number, hex: string) {
    this.color.playerDefaults[idx] = hex
    this.syncPortColor(0)
    this.syncPortColor(1)
  }

  setBattery(port: 0 | 1, v: number) {
    this.controllers[port].battery = v
    this.syncPortColor(port)
  }

  setControllerTouch(port: 0 | 1, x: number, y: number, active: boolean) {
    this.controllers[port].touch = { x, y, active }
    this.display.setTouch(x, y, active)
  }

  clearTraffic() {
    this.traffic.length = 0
  }
}

/** HELLO_ANIMS / BYE_ANIMS re-export for UI labels */
export { HELLO_ANIMS, BYE_ANIMS }
