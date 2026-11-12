'use client'

/**
 * Home — device identity, OLED/audio/LED summary and safe quick actions.
 * All values are read from the real device (a01/a07/a0d/a0e).
 */
import { useEffect } from 'react'
import { Moon, RotateCw, RefreshCcw, MonitorSmartphone, Music, Palette, Radio, Cpu } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Section, PageHeader, Row, useT } from '../shared'
import { OledPreview } from '../OledPreview'
import { useBr, activeBle } from '@/lib/br/store'
import { sendDeepSleep, sendEspReset } from '@/lib/br/protocol'
import { IDLE_MODES } from '@/lib/br/constants'

const TILES: { id: 'display' | 'sound' | 'colors' | 'ports' | 'system'; icon: React.ComponentType<{ className?: string }>; key: 'display' | 'sound' | 'colors' | 'ports' | 'system'; mx?: boolean }[] = [
  { id: 'display', icon: MonitorSmartphone, key: 'display', mx: true },
  { id: 'sound', icon: Music, key: 'sound', mx: true },
  { id: 'colors', icon: Palette, key: 'colors', mx: true },
  { id: 'ports', icon: Radio, key: 'ports', mx: true },
  { id: 'system', icon: Cpu, key: 'system' },
]

export function HomePage() {
  const t = useT()
  const setPage = useBr((s) => s.setPage)
  const fw = useBr((s) => s.fw)
  const api = useBr((s) => s.api)
  const bdaddr = useBr((s) => s.bdaddr)
  const oled = useBr((s) => s.oled)
  const audio = useBr((s) => s.audio)
  const led = useBr((s) => s.led)
  const idle = useBr((s) => s.idle)
  const refresh = useBr((s) => s.refresh)

  // read config on mount if not yet loaded
  useEffect(() => {
    if (!oled) void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">BlueRetro PS2 Bridge</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('status')} · {t('ports')} · MX</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="space-y-4">
          <Section title={t('deviceInfo')}>
            <Row label={t('firmware')}><span className="font-mono text-xs" dir="ltr">{fw ?? '—'}</span></Row>
            <Row label={t('apiVersion')}><span className="font-mono text-xs" dir="ltr">{api ?? '—'}</span></Row>
            <Row label={t('bdaddr')}><span className="font-mono text-xs" dir="ltr">{bdaddr ?? '—'}</span></Row>
            <Row label="OLED" hint={`panel_h = ${oled?.panelH ?? '—'}`}>
              <Badge variant="outline" className={oled?.enabled ? 'border-emerald-700 text-emerald-400' : 'border-zinc-700 text-zinc-500'} dir="ltr">
                {oled ? (oled.panelH === 32 ? '128×32' : '128×64') : '—'} {oled?.enabled ? '' : `(${t('off')})`}
              </Badge>
            </Row>
            <Row label={t('audioEnable')}>
              <Badge variant="outline" className={audio?.enabled ? 'border-emerald-700 text-emerald-400' : 'border-zinc-700 text-zinc-500'}>
                {audio ? (audio.enabled ? `${t('on')} · ${audio.volume}%` : t('offLabel')) : '—'}
              </Badge>
            </Row>
            <Row label={t('autoPlayer')} hint={led ? (led.autoPlayer ? '' : 'manual colors') : undefined}>
              <Badge variant="outline" className="border-zinc-700 text-zinc-400">
                {led ? (led.autoPlayer ? 'auto' : 'manual') : '—'}
              </Badge>
            </Row>
            <Row label={t('idleScreen')}>
              <span className="text-sm text-zinc-300">{idle ? (IDLE_MODES.find((m) => m.id === idle.mode)?.[useBr.getState().lang === 'fa' ? 'fa' : 'en'] ?? idle.mode) : '—'}</span>
            </Row>
          </Section>

          <Section title={t('quickActions')}>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="gap-1.5 border-zinc-700" onClick={() => void refresh()}>
                <RefreshCcw className="h-4 w-4" /> {t('refresh')}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1.5 border-zinc-700">
                    <RotateCw className="h-4 w-4" /> {t('espReset')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-zinc-900 border-zinc-800">
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('espReset')}</AlertDialogTitle>
                    <AlertDialogDescription>{t('confirm')}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="border-zinc-700">{t('stop')}</AlertDialogCancel>
                    <AlertDialogAction onClick={async () => { const b = activeBle(); if (b) await sendEspReset(b) }}>{t('yes')}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1.5 border-zinc-700">
                    <Moon className="h-4 w-4" /> {t('deepSleep')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-zinc-900 border-zinc-800">
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('deepSleep')}</AlertDialogTitle>
                    <AlertDialogDescription>{t('deepSleepHint')}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="border-zinc-700">{t('stop')}</AlertDialogCancel>
                    <AlertDialogAction onClick={async () => { const b = activeBle(); if (b) await sendDeepSleep(b) }}>{t('yes')}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </Section>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {TILES.map((n) => (
              <button
                key={n.id}
                onClick={() => setPage(n.id)}
                className="group rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-start hover:border-sky-800 hover:bg-sky-950/30 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <n.icon className="h-5 w-5 text-sky-400" />
                  {n.mx && <Badge className="bg-sky-950 text-sky-300 border border-sky-900 text-[9px] px-1 py-0">MX</Badge>}
                </div>
                <div className="mt-2 text-sm font-medium">{t(n.key)}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 lg:w-[380px]">
          <div className="text-xs text-muted-foreground">{t('staticPreview')}</div>
          <OledPreview panelH={oled?.panelH ?? null} rotation={oled?.rotation} label={oled ? `SSD1306 · 128×${oled.panelH}` : undefined} />
        </div>
      </div>
    </div>
  )
}
