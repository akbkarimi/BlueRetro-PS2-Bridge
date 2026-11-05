'use client'

/**
 * Controller LED Colors — writes the firmware MX LED slot (26 bytes):
 * {auto_player, brightness, ports[8]{r,g,b}}. With auto_player = 0 the
 * per-port custom colors are applied live by the adapter (ps_ctrl_color_get)
 * and persisted in NVS (deferred flush — mx_config_flush, firmware mx-v5).
 *
 * v4.3: the per-port rumble toggle no longer lives here — it moved to
 * Advance Config → Output config (a03 acc_mode), where the original
 * BlueRetro web config keeps it.
 */
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Section, PageHeader, Row, ColorDot, useT, NotReady } from '../shared'
import { useBr, activeBle } from '@/lib/br/store'
import { saveLedCfg, type LedCfg } from '@/lib/br/protocol'
import { LED_PALETTE } from '@/lib/br/constants'

function hexToRgb(hex: string) {
  const v = hex.replace('#', '')
  return { r: parseInt(v.slice(0, 2), 16) || 0, g: parseInt(v.slice(2, 4), 16) || 0, b: parseInt(v.slice(4, 6), 16) || 0 }
}
const rgbToHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((x) => (x & 0xff).toString(16).padStart(2, '0')).join('')}`

function PortColorRow({ port }: { port: number }) {
  const t = useT()
  const led = useBr((s) => s.led)
  const setLed = useBr((s) => s.setLed)
  if (!led) return null
  const c = led.ports[port] ?? { r: 0, g: 0, b: 0 }
  const hex = rgbToHex(c.r, c.g, c.b)

  const commit = (patch: { r?: number; g?: number; b?: number }) => {
    const ble = activeBle()
    const ports = led.ports.map((p, i) => (i === port ? { ...p, ...patch } : p))
    const next = { ...led, ports }
    setLed(next)
    if (!ble) return
    saveLedCfg(ble, next).then(
      () => toast.success(t('savedToast')),
      (e) => toast.error(`${t('writeFailed')}: ${String((e as Error)?.message ?? e)}`),
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-3 py-2.5 border-b border-zinc-800/60 last:border-0">
      <span className="text-xs text-muted-foreground w-14" dir="ltr">Port {port + 1}</span>
      <ColorDot hex={hex} size={16} />
      <div className="flex flex-wrap gap-1.5">
        {LED_PALETTE.map((h) => (
          <button
            key={h}
            className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${hex === h ? 'border-foreground' : 'border-zinc-600'}`}
            style={{ background: h }}
            onClick={() => commit(hexToRgb(h))}
            aria-label={h}
          />
        ))}
        <input
          type="color" value={hex} aria-label={`port ${port + 1} color`}
          className="w-6 h-6 rounded-full cursor-pointer bg-transparent"
          onChange={(e) => commit(hexToRgb(e.target.value))}
        />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground ms-auto" dir="ltr">{hex.toUpperCase()}</span>
    </div>
  )
}

export function ColorsPage() {
  const t = useT()
  const led = useBr((s) => s.led)
  const setLed = useBr((s) => s.setLed)

  if (!led) {
    return (
      <div className="space-y-4">
        <PageHeader titleKey="colors" descKey="colorsDesc" />
        <NotReady />
      </div>
    )
  }

  const commit = async (patch: Partial<LedCfg>) => {
    const ble = activeBle()
    const next = { ...led, ...patch }
    setLed(next)
    if (!ble) return
    try {
      await saveLedCfg(ble, next)
      toast.success(t('savedToast'))
    } catch (e) {
      toast.error(`${t('writeFailed')}: ${String((e as Error)?.message ?? e)}`)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader titleKey="colors" descKey="colorsDesc" />

      <Section title={t('colors')}>
        <Row label={t('autoPlayer')} hint={t('autoPlayerHint')}>
          <Switch checked={led.autoPlayer} onCheckedChange={(v) => void commit({ autoPlayer: v })} />
        </Row>
        <Row label={t('brightness')} hint={`${led.brightness}%`}>
          <div className="w-44">
            <Slider
              value={[led.brightness]} min={0} max={100} step={1}
              onValueChange={(v) => setLed({ ...led, brightness: v[0] })}
              onValueCommit={(v) => void commit({ brightness: v[0] })}
            />
          </div>
        </Row>
        {!led.autoPlayer ? (
          <div className="mt-2">
            {[0, 1].map((p) => <PortColorRow key={p} port={p} />)}
            <details className="mt-2">
              <summary className="text-xs text-muted-foreground cursor-pointer">{t('otherPorts')}</summary>
              {[2, 3, 4, 5, 6, 7].map((p) => <PortColorRow key={p} port={p} />)}
            </details>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground mt-1">
            {t('autoPlayerHint')}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-3 leading-5">{t('rumbleMoved')}</p>
      </Section>
    </div>
  )
}
