/**
 * Zustand store v2 — real-device connection lifecycle + config mirrors.
 * The virtual ESP32 simulator was removed: the only source of truth is the
 * real BlueRetro MethyleneX device over Web Bluetooth.
 */
'use client'

import { create } from 'zustand'
import { toast } from 'sonner'
import { BR_SERVICE_UUID, BR_UUID as BR_UUIDS, CH } from './constants'
import type { BleLike } from './protocol'
import { getApiVersion, getBdaddr, getFirmwareVersion, readSysCfg, readAudioCfg, readOledCfg, readLedCfg, readIdleCfg, readFeatures, readKeysCfg, type SysCfg, type AudioCfg, type OledCfg, type LedCfg, type IdleCfg, type KeysCfg } from './protocol'
import type { Lang } from './i18n'

export type PageId =
  | 'home' | 'display' | 'sound' | 'colors' | 'shortcuts'
  | 'ports' | 'advance' | 'system' | 'reference' | 'debug' | 'help'

export interface LogEntry {
  ts: number
  dir: 'rd' | 'wr' | 'ev'
  ch: number
  msg: string
}

interface BrStore {
  lang: Lang
  dark: boolean
  page: PageId
  connected: boolean
  connecting: boolean
  error: string | null
  fw: string | null
  api: number | null
  bdaddr: string | null
  sys: SysCfg | null
  audio: AudioCfg | null
  oled: OledCfg | null
  led: LedCfg | null
  idle: IdleCfg | null
  features: number | null
  keys: KeysCfg | null
  logs: LogEntry[]

  setLang: (l: Lang) => void
  toggleDark: () => void
  setPage: (p: PageId) => void
  connect: () => Promise<void>
  disconnect: () => void
  refresh: () => Promise<boolean>
  setSys: (c: SysCfg) => void
  setAudio: (c: AudioCfg) => void
  setOled: (c: OledCfg) => void
  setLed: (c: LedCfg) => void
  setIdle: (c: IdleCfg) => void
  setFeatures: (v: number) => void
  setKeys: (c: KeysCfg) => void
  addLog: (e: LogEntry) => void
  clearLogs: () => void
}

/** Real Web Bluetooth transport (Chrome) with GATT logging */
async function createRealBle(log: (e: LogEntry) => void): Promise<{ ble: BleLike; disconnect: () => void; onLost: () => void }> {
  const bt = (navigator as Navigator & { bluetooth?: Bluetooth }).bluetooth
  if (!bt) throw new Error('WEB_BT_MISSING')
  // acceptAllDevices instead of a namePrefix filter: several Android phones
  // do not surface the advertised name, which made the chooser empty and
  // pairing fail. optionalServices still gates which device we can open.
  const device = await bt.requestDevice({ acceptAllDevices: true, optionalServices: [BR_SERVICE_UUID] })
  if (!device.gatt) throw new Error('GATT unavailable')
  const server = await device.gatt.connect()
  const service = await server.getPrimaryService(BR_SERVICE_UUID)
  const chars: Record<string, BluetoothRemoteGATTCharacteristic> = {}
  const get = async (idx: number) => {
    const key = String(idx)
    if (!chars[key]) chars[key] = await service.getCharacteristic(BR_UUIDS[idx])
    return chars[key]
  }
  const hex = (d: DataView | Uint8Array) => {
    const a = d instanceof Uint8Array ? d : new Uint8Array(d.buffer, d.byteOffset, d.byteLength)
    return Array.from(a.slice(0, 32)).map((v) => v.toString(16).padStart(2, '0')).join(' ') + (a.byteLength > 32 ? ' …' : '')
  }
  const ble: BleLike = {
    async read(idx) {
      const dv = await (await get(idx)).readValue()
      log({ ts: Date.now(), dir: 'rd', ch: idx, msg: `a0${idx.toString(16)} ← [${hex(dv)}]` })
      return dv
    },
    async write(idx, data) {
      const a = data instanceof Uint8Array ? data : new Uint8Array(data instanceof ArrayBuffer ? data : new Uint8Array(data).buffer)
      log({ ts: Date.now(), dir: 'wr', ch: idx, msg: `a0${idx.toString(16)} → [${hex(a)}]` })
      const ch = await get(idx)
      const buf = new ArrayBuffer(a.byteLength)
      new Uint8Array(buf).set(a)
      await ch.writeValue(buf)
    },
  }
  const onLost = () => {
    log({ ts: Date.now(), dir: 'ev', ch: 0, msg: 'GATT disconnected (device lost)' })
    useBr.setState({ connected: false, error: 'connection-lost' })
  }
  device.addEventListener('gattserverdisconnected', onLost)
  const disconnect = () => {
    try { device.removeEventListener('gattserverdisconnected', onLost) } catch { /* ignore */ }
    try { server.disconnect() } catch { /* ignore */ }
  }
  return { ble, disconnect, onLost }
}

let realBle: BleLike | null = null
let realDisconnect: (() => void) | null = null

/** BleLike of the active connection — null when not connected */
export function activeBle(): BleLike | null {
  return realBle
}

export const useBr = create<BrStore>((set, get) => ({
  lang: 'fa',
  /* Day/night theme: default dark, persisted in localStorage. The .dark
     class on <html> is synced by BrApp (globals.css palette flip). */
  dark: typeof window !== 'undefined' ? localStorage.getItem('brmx.dark') !== '0' : true,
  page: 'home',
  connected: false,
  connecting: false,
  error: null,
  fw: null,
  api: null,
  bdaddr: null,
  sys: null,
  audio: null,
  oled: null,
  led: null,
  idle: null,
  features: null,
  keys: null,
  logs: [],

  setLang: (l) => set({ lang: l }),
  toggleDark: () => set((s) => {
    const dark = !s.dark
    try { localStorage.setItem('brmx.dark', dark ? '1' : '0') } catch { /* private mode */ }
    return { dark }
  }),
  setPage: (p) => set({ page: p }),

  connect: async () => {
    if (get().connecting || get().connected) return
    set({ connecting: true, error: null })
    try {
      const { ble, disconnect: disc } = await createRealBle((e) => get().addLog(e))
      realBle = ble
      realDisconnect = disc
      const [api, fw, bdaddr] = await Promise.all([getApiVersion(ble), getFirmwareVersion(ble), getBdaddr(ble)])
      set({ connected: true, connecting: false, fw, api, bdaddr, error: null })
      get().addLog({ ts: Date.now(), dir: 'ev', ch: 0, msg: `connected: ${fw} · API ${api} · ${bdaddr}` })
      toast.success('اتصال برقرار شد — ' + fw)
      await get().refresh()
    } catch (e) {
      const err = e as Error
      const raw = String(err?.message ?? e)
      let msg: string
      if (err?.name === 'NotFoundError') {
        // Chrome reuses NotFoundError both for "user cancelled the chooser"
        // and "no device selected" — keep one calm message.
        msg = 'NO_DEVICE_SELECTED'
      } else if (raw === 'WEB_BT_MISSING') {
        msg = 'WEB_BT_MISSING'
      } else if (err?.name === 'SecurityError') {
        msg = 'BT_SECURITY'
      } else if (/GATT|Services|service/i.test(raw)) {
        msg = 'BT_SERVICE'
      } else {
        msg = raw
      }
      set({ connecting: false, connected: false, error: msg })
      toast.error(msg)
    }
  },

  disconnect: () => {
    realDisconnect?.()
    realBle = null
    realDisconnect = null
    set({ connected: false, fw: null, api: null, bdaddr: null, sys: null, audio: null, oled: null, led: null, idle: null, features: null, keys: null })
  },

  refresh: async () => {
    const ble = realBle
    if (!ble) return false
    // mxRead/mxWrite are serialized by the protocol-level MX lock, so these
    // reads always receive their own slot's bytes. Each config is applied
    // independently: one failing slot must NOT blank the other pages.
    const jobs: [string, Promise<unknown>][] = [
      ['sys', readSysCfg(ble)],
      ['audio', readAudioCfg(ble)],
      ['oled', readOledCfg(ble)],
      ['led', readLedCfg(ble)],
      ['idle', readIdleCfg(ble)],
      ['features', readFeatures(ble)],
      ['keys', readKeysCfg(ble)],
    ]
    const results = await Promise.allSettled(jobs.map(([, p]) => p))
    const failed: string[] = []
    const patch: Partial<BrStore> = {}
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        const key = jobs[i][0]
        if (key === 'features') patch.features = r.value as number
        else patch[key as 'sys'] = r.value as never
      } else if (jobs[i][0] === 'keys') {
        /* KEYS slot exists only on firmware mx-v6+. On older firmware this is
           expected: leave keys null (Shortcuts page shows "not available")
           without flagging the whole refresh as incomplete. */
      } else {
        failed.push(jobs[i][0].toUpperCase())
      }
    })
    if (Object.keys(patch).length) set(patch)
    if (failed.length) {
      toast.error('خواندن ناقص (' + failed.join('، ') + ') — دکمه خواندن مجدد را بزنید')
    }
    return failed.length === 0
  },

  setSys: (c) => set({ sys: c }),
  setAudio: (c) => set({ audio: c }),
  setOled: (c) => set({ oled: c }),
  setLed: (c) => set({ led: c }),
  setIdle: (c) => set({ idle: c }),
  setFeatures: (v) => set({ features: v }),
  setKeys: (c) => set({ keys: c }),

  addLog: (e) => set((s) => ({ logs: [e, ...s.logs].slice(0, 300) })),
  clearLogs: () => set({ logs: [] }),
}))

// dev/e2e debugging handle (never exposed in production builds)
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  (window as unknown as Record<string, unknown>).__br = useBr
}
