'use client'

/**
 * Virtual Controllers — an interactive DS4/DS5 panel that feeds the
 * Shortcut Manager (Home combos, touchpad gestures) exactly like real
 * hardware would, plus one-tap scripted scenarios for demos and tests.
 */
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Zap, Gamepad2, Vibrate, Unplug, Power, RefreshCcw, Radio, MoonStar, BatteryLow, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Section, PageHeader, useT, useDeviceRev, usePortColor } from '../shared'
import { dev, useBr } from '@/lib/br/store'
import { BTN } from '@/lib/br/device'
import { SHORTCUT_HOLD_MS } from '@/lib/br/constants'
import type { SwipeDir } from '@/lib/br/display'

function PadButton({ label, onDown, onUp, className = '', active = false }: {
  label: string; onDown: () => void; onUp: () => void; className?: string; active?: boolean
}) {
  const [down, setDown] = useState(false)
  return (
    <button
      className={`select-none rounded-lg border text-xs font-semibold transition-all
        ${down || active ? 'bg-sky-800/70 text-white border-sky-500 scale-95' : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800'}
        ${className}`}
      onPointerDown={(e) => { e.preventDefault(); setDown(true); onDown() }}
      onPointerUp={() => { setDown(false); onUp() }}
      onPointerLeave={() => { if (down) { setDown(false); onUp() } }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  )
}

function TouchpadSurface({ port }: { port: 0 | 1 }) {
  const t = useT()
  const d = dev()
  const ref = useRef<{ x: number; y: number; fired: boolean } | null>(null)
  const [hint, setHint] = useState('')

  const pos = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return {
      x: Math.round(((e.clientX - r.left) / r.width) * 1920),
      y: Math.round(((e.clientY - r.top) / r.height) * 942),
      nx: (e.clientX - r.left) / r.width,
      ny: (e.clientY - r.top) / r.height,
    }
  }

  return (
    <div
      className="mt-2 h-28 rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-900/80 flex items-center justify-center text-xs text-muted-foreground touch-none cursor-grab active:cursor-grabbing hover:border-sky-700 transition-colors"
      data-testid={`touchpad-${port}`}
      onPointerDown={(e) => {
        e.preventDefault()
        const p = pos(e)
        ref.current = { x: p.x, y: p.y, fired: false }
        d.setControllerTouch(port, Math.round(p.nx * 128), Math.round(p.ny * 64), true)
      }}
      onPointerMove={(e) => {
        if (!ref.current) return
        const p = pos(e)
        d.display.setTouch(Math.round(p.nx * 128), Math.round(p.ny * 64), true)
        const dx = p.x - ref.current.x, dy = p.y - ref.current.y
        if (!ref.current.fired && (Math.abs(dx) > 220 || Math.abs(dy) > 160)) {
          ref.current.fired = true
          const dir: SwipeDir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')
          setHint({ left: '←', right: '→', up: '↑', down: '↓' }[dir])
          d.touchpadSwipe(port, dir)
          setTimeout(() => setHint(''), 900)
        }
      }}
      onPointerUp={() => {
        if (ref.current && !ref.current.fired) d.touchpadTap(port)
        ref.current = null
        d.display.setTouch(0, 0, false)
      }}
      onPointerLeave={() => {
        ref.current = null
        d.display.setTouch(0, 0, false)
      }}
    >
      {hint ? <span className="text-3xl text-sky-400">{hint}</span> : `${t('touchpad')} — ${t('swipeHere')}`}
    </div>
  )
}

function ControllerCard({ port }: { port: 0 | 1 }) {
  const t = useT()
  useDeviceRev()
  const d = dev()
  const c = d.controllers[port]
  const lang = useBr((s) => s.lang)
  const hex = usePortColor(port)

  const bd = (btn: number) => () => d.buttonDown(port, btn)
  const bu = (btn: number) => () => d.buttonUp(port, btn)

  return (
    <Section
      title={`${t('controller')} ${port + 1} — ${c.connected ? c.type : '—'}`}
      className={c.connected ? 'border-sky-900/60' : ''}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          {c.connected
            ? <Badge variant="outline" className="border-emerald-700 text-emerald-400">{t('connected')}</Badge>
            : <Badge variant="outline" className="border-zinc-700 text-zinc-500">{t('notConnected')}</Badge>}
          <span className="inline-block w-5 h-5 rounded-full border border-zinc-600" style={{ background: c.connected ? hex : '#3f3f46' }} />
        </div>
        <div className="flex gap-2">
          {c.connected ? (
            <Button size="sm" variant="outline" className="h-8 gap-1 border-zinc-700" onClick={() => d.disconnectController(port, 'webapp')}>
              <Unplug className="h-3.5 w-3.5" /> {t('unplug')}
            </Button>
          ) : (
            <>
              <Button size="sm" variant="outline" className="h-8 border-zinc-700" onClick={() => d.connectController(port, 'DS4')}>DS4</Button>
              <Button size="sm" variant="outline" className="h-8 border-zinc-700" onClick={() => d.connectController(port, 'DS5')}>DS5</Button>
            </>
          )}
        </div>
      </div>

      {c.connected && (
        <div className="space-y-3">
          {/* main buttons */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="flex gap-2 justify-start">
              <PadButton label={t('share')} onDown={bd(BTN.SHARE)} onUp={bu(BTN.SHARE)} className="px-3 py-2.5" active={(c.state.btns & BTN.SHARE) !== 0} />
              <PadButton label="PS" onDown={bd(BTN.PS)} onUp={bu(BTN.PS)} className="px-4 py-2.5" active={(c.state.btns & BTN.PS) !== 0} />
              <PadButton label={t('options')} onDown={bd(BTN.OPTIONS)} onUp={bu(BTN.OPTIONS)} className="px-3 py-2.5" active={(c.state.btns & BTN.OPTIONS) !== 0} />
            </div>
            {/* dpad */}
            <div className="grid grid-cols-3 gap-1 w-[104px]" dir="ltr">
              <span />
              <PadButton label="↑" onDown={bd(BTN.UP)} onUp={bu(BTN.UP)} className="py-2" active={(c.state.btns & BTN.UP) !== 0} />
              <span />
              <PadButton label="←" onDown={bd(BTN.LEFT)} onUp={bu(BTN.LEFT)} className="py-2" active={(c.state.btns & BTN.LEFT) !== 0} />
              <PadButton label="●" onDown={() => { }} onUp={() => { }} className="py-2 opacity-30" />
              <PadButton label="→" onDown={bd(BTN.RIGHT)} onUp={bu(BTN.RIGHT)} className="py-2" active={(c.state.btns & BTN.RIGHT) !== 0} />
              <span />
              <PadButton label="↓" onDown={bd(BTN.DOWN)} onUp={bu(BTN.DOWN)} className="py-2" active={(c.state.btns & BTN.DOWN) !== 0} />
              <span />
            </div>
            <div className="flex gap-2 justify-end">
              <PadButton label="△" onDown={bd(BTN.TRIANGLE)} onUp={bu(BTN.TRIANGLE)} className="w-9 py-2.5" active={(c.state.btns & BTN.TRIANGLE) !== 0} />
              <PadButton label="○" onDown={bd(BTN.CIRCLE)} onUp={bu(BTN.CIRCLE)} className="w-9 py-2.5" active={(c.state.btns & BTN.CIRCLE) !== 0} />
              <PadButton label="✕" onDown={bd(BTN.CROSS)} onUp={bu(BTN.CROSS)} className="w-9 py-2.5" active={(c.state.btns & BTN.CROSS) !== 0} />
              <PadButton label="□" onDown={bd(BTN.SQUARE)} onUp={bu(BTN.SQUARE)} className="w-9 py-2.5" active={(c.state.btns & BTN.SQUARE) !== 0} />
            </div>
          </div>

          <TouchpadSurface port={port} />

          <div className="flex items-center gap-3">
            <Vibrate className="h-4 w-4 text-muted-foreground" />
            <Slider value={[c.battery]} min={5} max={100} step={1} className="flex-1"
              onValueChange={(v) => d.setBattery(port, v[0])} />
            <span className="text-xs text-muted-foreground w-12" dir="ltr">{c.battery}%</span>
          </div>
          <div className="text-[11px] text-muted-foreground">
            {lang === 'fa'
              ? 'دکمه‌ها را نگه دارید: Home سه ثانیه = خاموشی · دوبار Home = ریست · Home+Start = جفت‌سازی · Home+Share = قطع دسته · Home+جهت = کنترل OLED'
              : 'Hold buttons: Home 3 s = power off · double Home = reset · Home+Start = pairing · Home+Share = disconnect · Home+direction = OLED control'}
          </div>
        </div>
      )}
    </Section>
  )
}

function runScenario(name: string, steps: (() => void)[], delays: number[]) {
  toast.info(`▶ ${name}`)
  let acc = 0
  steps.forEach((step, i) => {
    acc += delays[i] ?? 0
    setTimeout(step, acc)
  })
}

export function VirtualPadPage() {
  const t = useT()
  const d = dev()

  const scenarios: { label: string; icon: React.ComponentType<{ className?: string }>; run: () => void }[] = [
    {
      label: t('scenarioConnect'), icon: Gamepad2,
      run: () => runScenario(t('scenarioConnect'), [
        () => { d.display.wake(); d.connectController(0, 'DS4') },
      ], [0]),
    },
    {
      label: t('scenarioHold'), icon: Power,
      run: () => runScenario(t('scenarioPowerOff'), [
        () => d.buttonDown(0, BTN.PS),
        () => d.buttonUp(0, BTN.PS),
      ], [0, SHORTCUT_HOLD_MS + 100]),
    },
    {
      label: t('scenarioDouble'), icon: RefreshCcw,
      run: () => runScenario(t('scenarioDouble'), [
        () => d.buttonDown(0, BTN.PS), () => d.buttonUp(0, BTN.PS),
        () => d.buttonDown(0, BTN.PS), () => d.buttonUp(0, BTN.PS),
      ], [0, 120, 250, 420]),
    },
    {
      label: t('scenarioPairing'), icon: Radio,
      run: () => runScenario(t('scenarioPairing'), [
        () => d.buttonDown(0, BTN.PS),
        () => d.buttonDown(0, BTN.OPTIONS),
        () => { d.buttonUp(0, BTN.OPTIONS); d.buttonUp(0, BTN.PS) },
      ], [0, 150, 700]),
    },
    {
      label: t('scenarioDisconnect'), icon: Unplug,
      run: () => runScenario(t('scenarioDisconnect'), [
        () => d.buttonDown(0, BTN.PS),
        () => d.buttonDown(0, BTN.SHARE),
        () => d.buttonUp(0, BTN.SHARE),
      ], [0, 150, 700]),
    },
    {
      label: t('scenarioSwipeSaver'), icon: MoonStar,
      run: () => runScenario(t('scenarioSwipeSaver'), [
        () => { d.display.wake(); d.display.setMode('screensaver') },
        () => d.touchpadSwipe(0, 'left'),
      ], [0, 500]),
    },
    {
      label: t('scenarioSwipeBattery'), icon: BatteryLow,
      run: () => runScenario(t('scenarioSwipeBattery'), [
        () => d.display.wake(),
        () => d.touchpadSwipe(0, 'left'),
      ], [0, 400]),
    },
    {
      label: t('scenarioBlink'), icon: Zap,
      run: () => runScenario(t('scenarioBlink'), [
        () => d.blinkEffect(0, '#C43A3A', 1600),
      ], [0]),
    },
  ]

  return (
    <div className="space-y-4">
      <PageHeader titleKey="virtualpad" descKey="padDesc" />
      <Section title={t('scenarios')}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {scenarios.map((s) => (
            <Button key={s.label} variant="outline" className="h-10 gap-1.5 border-zinc-700 justify-start" onClick={s.run}>
              <s.icon className="h-4 w-4 text-sky-400" /> <span className="truncate text-xs">{s.label}</span>
            </Button>
          ))}
        </div>
      </Section>
      <div className="grid gap-4 lg:grid-cols-2">
        <ControllerCard port={0} />
        <ControllerCard port={1} />
      </div>
    </div>
  )
}
