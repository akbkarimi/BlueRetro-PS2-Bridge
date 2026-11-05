/**
 * WebApp protocol layer v3 — speaks the REAL MethyleneX firmware protocol.
 * Every function mirrors the handlers in main/bluetooth/att_cfg.c:
 *   a01 global config (4 B) · a02/a03 port select/data · a07 command channel
 *   a0d MX slot select · a0e MX blob read/write
 * v3: all a0d/a0e (and a02/a03) sequences run atomically under a global lock.
 */
import { BR_UUID, CH, CMD, MX_SLOT } from './constants'

export interface BleLike {
  read(idx: number): Promise<DataView>
  write(idx: number, data: ArrayBuffer | Uint8Array | number[]): Promise<void>
}

const u8 = (...b: number[]) => new Uint8Array(b)

/** Safe byte read: 0-length GATT reads (e.g. slot not staged yet) return def */
const b8 = (dv: DataView, i: number, def = 0) => (dv.byteLength > i ? dv.getUint8(i) : def)

/**
 * Global mutex for MX slot operations (a0d select + a0e read/write).
 * The firmware keeps ONE `mx_cfg_selected_slot` register, so a slot-select
 * followed by its data transfer must be atomic. Without this lock, parallel
 * reads interleave and every page mirror gets another slot's bytes —
 * the "LED/controller/OLED pages dead + comboboxes jump" bug.
 */
let mxLock: Promise<unknown> = Promise.resolve()
function withMxLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = mxLock.then(fn, fn)
  mxLock = run.then(() => undefined, () => undefined)
  return run
}

/** The command characteristic is a shared command register: write + read must
 * stay atomic, otherwise concurrent pages can read another command's reply. */
let cmdLock: Promise<unknown> = Promise.resolve()
function withCmdLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = cmdLock.then(fn, fn)
  cmdLock = run.then(() => undefined, () => undefined)
  return run
}

export function commandRead(ble: BleLike, command: number, ...args: number[]): Promise<DataView> {
  return withCmdLock(async () => {
    await ble.write(CH.CFG_CMD, u8(command, ...args))
    return ble.read(CH.CFG_CMD)
  })
}

export function commandWrite(ble: BleLike, command: number, ...args: number[]): Promise<void> {
  return withCmdLock(() => ble.write(CH.CFG_CMD, u8(command, ...args)))
}

/** Small delay so the ESP32 ATT server can process the slot-select write */
const MX_SETTLE_MS = 30
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/* ---------------- global config (a01, 4 bytes) ---------------- */
export interface SysCfg { system: number; multitap: number; inquiry: number; banksel: number }

export async function readSysCfg(ble: BleLike): Promise<SysCfg> {
  const dv = await ble.read(CH.GLOBAL_CFG)
  return {
    system: b8(dv, 0),
    multitap: b8(dv, 1),
    inquiry: b8(dv, 2),
    banksel: b8(dv, 3),
  }
}

export async function saveSysCfg(ble: BleLike, cfg: SysCfg) {
  await ble.write(CH.GLOBAL_CFG, u8(cfg.system, cfg.multitap, cfg.inquiry, cfg.banksel))
}

/* ---------------- ports (a02 select / a03 data) ---------------- */
export interface PortMode { devMode: number; accMode: number }

export async function readPortMode(ble: BleLike, port: number): Promise<PortMode> {
  return withMxLock(async () => {
    await ble.write(CH.PORT_SEL, u8(port))
    await sleep(MX_SETTLE_MS)
    const dv = await ble.read(CH.PORT_DATA)
    return {
      devMode: dv.byteLength > 0 ? dv.getUint8(0) : 0,
      accMode: dv.byteLength > 1 ? dv.getUint8(1) : 0,
    }
  })
}

export async function savePortMode(ble: BleLike, port: number, m: PortMode) {
  return withMxLock(async () => {
    await ble.write(CH.PORT_SEL, u8(port))
    await sleep(MX_SETTLE_MS)
    await ble.write(CH.PORT_DATA, u8(m.devMode & 0xff, m.accMode & 0xff))
  })
}

export const setPortRumble = (ble: BleLike, port: number, on: boolean) =>
  readPortMode(ble, port).then((m) => savePortMode(ble, port, {
    devMode: m.devMode,
    accMode: on ? (m.accMode | 2) & 0xff : m.accMode & ~2 & 0xff,
  }))

/* ---------------- MX config slots (a0d select / a0e blob) ---------------- */
export async function mxSelect(ble: BleLike, slot: number) {
  await ble.write(CH.MX_SEL, u8(slot))
}

/** Atomic select + read under the global MX lock */
export function mxRead(ble: BleLike, slot: number): Promise<DataView> {
  return withMxLock(async () => {
    await mxSelect(ble, slot)
    await sleep(MX_SETTLE_MS)
    return ble.read(CH.MX_DATA)
  })
}

/** Atomic select + write under the global MX lock */
export function mxWrite(ble: BleLike, slot: number, bytes: number[] | Uint8Array): Promise<void> {
  return withMxLock(async () => {
    await mxSelect(ble, slot)
    await sleep(MX_SETTLE_MS)
    await ble.write(CH.MX_DATA, bytes)
  })
}

/* ---- AUDIO slot (8 bytes) ---- */
export interface AudioCfg {
  enabled: boolean
  volume: number // 0..100
  powerOn: number  // melody id 0..26
  powerOff: number
  reset: number
  connect: number
  disconnect: number
}

export async function readAudioCfg(ble: BleLike): Promise<AudioCfg> {
  const dv = await mxRead(ble, MX_SLOT.AUDIO)
  if (dv.byteLength < 2) throw new Error('AUDIO_SLOT_EMPTY')
  return {
    enabled: b8(dv, 0) !== 0,
    volume: b8(dv, 1),
    powerOn: b8(dv, 2),
    powerOff: b8(dv, 3),
    reset: b8(dv, 4),
    connect: b8(dv, 5),
    disconnect: b8(dv, 6),
  }
}

export async function saveAudioCfg(ble: BleLike, c: AudioCfg) {
  const clamp = (v: number) => Math.max(0, Math.min(26, v | 0))
  await mxWrite(ble, MX_SLOT.AUDIO, u8(
    c.enabled ? 1 : 0,
    Math.max(0, Math.min(100, c.volume | 0)),
    clamp(c.powerOn), clamp(c.powerOff), clamp(c.reset),
    clamp(c.connect), clamp(c.disconnect),
    0, // rsvd
  ))
}

/* ---- OLED slot (6+n bytes) ---- */
export interface OledCfg {
  enabled: boolean
  rotation: number // 0 | 1 (180°)
  panelH: number   // 32 | 64
  notifications: boolean
  touchpadNav: boolean
  pages: number[]  // 0..8 entries of page ids
}

export async function readOledCfg(ble: BleLike): Promise<OledCfg> {
  const dv = await mxRead(ble, MX_SLOT.OLED)
  if (dv.byteLength < 5) throw new Error('OLED_SLOT_EMPTY')
  const cnt = Math.min(b8(dv, 5), 8)
  const pages: number[] = []
  for (let i = 0; i < cnt && 6 + i < dv.byteLength; i++) pages.push(dv.getUint8(6 + i))
  return {
    enabled: b8(dv, 0) !== 0,
    rotation: b8(dv, 1) === 1 ? 1 : 0,
    panelH: b8(dv, 2) === 32 ? 32 : 64,
    notifications: b8(dv, 3) !== 0,
    touchpadNav: b8(dv, 4) !== 0,
    pages,
  }
}

export async function saveOledCfg(ble: BleLike, c: OledCfg) {
  const pages = c.pages.slice(0, 8)
  await mxWrite(ble, MX_SLOT.OLED, u8(
    c.enabled ? 1 : 0,
    c.rotation === 1 ? 1 : 0,
    c.panelH === 32 ? 32 : 64,
    c.notifications ? 1 : 0,
    c.touchpadNav ? 1 : 0,
    pages.length,
    ...pages,
  ))
}

/* ---- LED slot (26 bytes) ---- */
export interface LedCfg {
  autoPlayer: boolean
  brightness: number // 0..100 percent
  ports: { r: number; g: number; b: number }[] // 8 entries
}

export async function readLedCfg(ble: BleLike): Promise<LedCfg> {
  const dv = await mxRead(ble, MX_SLOT.LED)
  if (dv.byteLength < 2) throw new Error('LED_SLOT_EMPTY')
  const ports = Array.from({ length: 8 }, (_, i) => ({
    r: b8(dv, 2 + i * 3),
    g: b8(dv, 3 + i * 3),
    b: b8(dv, 4 + i * 3),
  }))
  return {
    autoPlayer: b8(dv, 0) !== 0,
    brightness: b8(dv, 1),
    ports,
  }
}

export async function saveLedCfg(ble: BleLike, c: LedCfg) {
  const b = u8(c.autoPlayer ? 1 : 0, Math.max(0, Math.min(100, c.brightness | 0)),
    ...c.ports.slice(0, 8).flatMap((p) => [p.r & 0xff, p.g & 0xff, p.b & 0xff]))
  await mxWrite(ble, MX_SLOT.LED, b)
}

/* ---- IDLE slot (3 bytes) ---- */
export interface IdleCfg { mode: number; timeoutSec: number }

export async function readIdleCfg(ble: BleLike): Promise<IdleCfg> {
  const dv = await mxRead(ble, MX_SLOT.IDLE)
  if (dv.byteLength < 1) throw new Error('IDLE_SLOT_EMPTY')
  return { mode: b8(dv, 0), timeoutSec: dv.byteLength >= 3 ? dv.getUint16(1, true) : 30 }
}

export async function saveIdleCfg(ble: BleLike, c: IdleCfg) {
  const b = new Uint8Array(3)
  b[0] = Math.max(0, Math.min(11, c.mode | 0))
  b[1] = c.timeoutSec & 0xff
  b[2] = (c.timeoutSec >> 8) & 0xff
  await mxWrite(ble, MX_SLOT.IDLE, b)
}

/* ---- TIME slot (6 bytes) ---- */
export interface TimeCfg { year: number; month: number; day: number; hour: number; minute: number }

export async function readTimeCfg(ble: BleLike): Promise<TimeCfg> {
  const dv = await mxRead(ble, MX_SLOT.TIME)
  if (dv.byteLength < 6) throw new Error('TIME_SLOT_EMPTY')
  return {
    year: dv.getUint16(0, true),
    month: dv.getUint8(2),
    day: dv.getUint8(3),
    hour: dv.getUint8(4),
    minute: dv.getUint8(5),
  }
}

export async function saveTimeCfg(ble: BleLike, c: TimeCfg) {
  const b = new Uint8Array(6)
  b[0] = c.year & 0xff
  b[1] = (c.year >> 8) & 0xff
  b[2] = c.month
  b[3] = c.day
  b[4] = c.hour
  b[5] = c.minute
  await mxWrite(ble, MX_SLOT.TIME, b)
}

/* ---- FEATURES slot (1 byte) ---- */
export async function readFeatures(ble: BleLike): Promise<number> {
  const dv = await mxRead(ble, MX_SLOT.FEATURES)
  if (dv.byteLength < 1) throw new Error('FEATURES_SLOT_EMPTY')
  return dv.getUint8(0)
}
export async function saveFeatures(ble: BleLike, bits: number) {
  await mxWrite(ble, MX_SLOT.FEATURES, u8(bits & 0xff))
}

/* ---- KEYS slot (2 bytes): configurable shortcut combos ---- */
export interface KeysCfg {
  saverCombo: number // combo id that enters screensaver mode (0..7)
  menuCombo: number  // combo id that returns to the main menu (0..7)
}

export async function readKeysCfg(ble: BleLike): Promise<KeysCfg> {
  const dv = await mxRead(ble, MX_SLOT.KEYS)
  if (dv.byteLength < 2) throw new Error('KEYS_SLOT_EMPTY')
  return {
    saverCombo: Math.min(b8(dv, 0), 7),
    menuCombo: Math.min(b8(dv, 1), 7),
  }
}

export async function saveKeysCfg(ble: BleLike, c: KeysCfg) {
  await mxWrite(ble, MX_SLOT.KEYS, u8(
    Math.max(0, Math.min(7, c.saverCombo | 0)),
    Math.max(0, Math.min(7, c.menuCombo | 0)),
  ))
}

/* ---- Bluetooth MAC spoof slot (8 bytes: magic + enabled + 6-byte address) ---- */
export interface MacSpoofCfg { enabled: boolean; mac: number[] }

export async function readMacSpoofCfg(ble: BleLike): Promise<MacSpoofCfg> {
  const dv = await mxRead(ble, MX_SLOT.MAC)
  if (dv.byteLength < 8 || b8(dv, 0) !== 0x4D) throw new Error('MAC_SLOT_UNSUPPORTED')
  return {
    enabled: b8(dv, 1) !== 0,
    mac: Array.from({ length: 6 }, (_, i) => b8(dv, i + 2)),
  }
}

export async function saveMacSpoofCfg(ble: BleLike, cfg: MacSpoofCfg) {
  if (cfg.mac.length !== 6) throw new Error('MAC_LENGTH_INVALID')
  const mac = cfg.mac.map((v) => v & 0xff)
  const any = mac.some((v) => v !== 0)
  const base = [...mac]
  let borrow = 2
  for (let i = 5; i >= 0 && borrow > 0; i--) {
    if (base[i] >= borrow) {
      base[i] -= borrow
      borrow = 0
    } else {
      base[i] = 256 + base[i] - borrow
      borrow = 1
    }
  }
  const baseAny = base.some((v) => v !== 0)
  if (cfg.enabled && (!any || (mac[0] & 1) !== 0 || borrow > 0 || !baseAny || (base[0] & 1) !== 0)) {
    throw new Error('MAC_ADDRESS_INVALID')
  }
  await mxWrite(ble, MX_SLOT.MAC, u8(0x4D, cfg.enabled ? 1 : 0, ...mac))
}

/* ---------------- command channel (a07) ---------------- */
export async function previewMelody(ble: BleLike, id: number) {
  await commandWrite(ble, CMD.AUDIO_PREVIEW, Math.max(0, Math.min(26, id | 0)))
}

export async function stopMelodyPreview(ble: BleLike) {
  await commandWrite(ble, CMD.AUDIO_PREVIEW_STOP)
}

export const sendDeepSleep = (ble: BleLike) => commandWrite(ble, CMD.SYS_DEEP_SLEEP)
export const sendEspReset = (ble: BleLike) => commandWrite(ble, CMD.SYS_RESET)
export const sendFactoryReset = (ble: BleLike) => commandWrite(ble, CMD.SYS_FACTORY)

export interface ControllerState {
  btns: number
  lx: number; ly: number; rx: number; ry: number
  l2: number; r2: number
  valid: boolean
}

export async function getControllerState(ble: BleLike, port: number): Promise<ControllerState> {
  if (!Number.isInteger(port) || port < 0 || port > 11) throw new Error('CONTROLLER_PORT_INVALID')
  const dv = await commandRead(ble, CMD.GET_CONTROLLER_STATE, port)
  if (dv.byteLength !== 17) throw new Error('CONTROLLER_STATE_UNSUPPORTED')
  return {
    btns: dv.getUint32(0, true),
    lx: dv.getInt16(4, true),
    ly: dv.getInt16(6, true),
    rx: dv.getInt16(8, true),
    ry: dv.getInt16(10, true),
    l2: dv.getInt16(12, true),
    r2: dv.getInt16(14, true),
    valid: dv.getUint8(16) !== 0,
  }
}

/* ---------------- version / identity ---------------- */
export async function getApiVersion(ble: BleLike): Promise<number> {
  const dv = await ble.read(CH.API_VER)
  return dv.getUint8(0)
}

export async function getFirmwareVersion(ble: BleLike): Promise<string> {
  const dv = await ble.read(CH.FW_VER)
  return new TextDecoder('utf-8').decode(dv).trim()
}

export async function getBdaddr(ble: BleLike): Promise<string> {
  const dv = await ble.read(CH.BDADDR)
  return [5, 4, 3, 2, 1, 0].map((i) => (dv.byteLength > i ? dv.getUint8(i) : 0).toString(16).padStart(2, '0')).join(':').toUpperCase()
}

/** Re-export so pages can build UUID-specific helpers if needed */
export const BR_UUIDS = BR_UUID
