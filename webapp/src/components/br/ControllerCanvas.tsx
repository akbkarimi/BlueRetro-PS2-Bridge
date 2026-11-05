'use client'

import type { ControllerState } from '@/lib/br/protocol'
import { CONTROLLER_STICK_SCALE, CONTROLLER_TRIGGER_MIN } from '@/lib/br/constants'
import { Badge } from '@/components/ui/badge'
import { useT } from './shared'
import { cn } from '@/lib/utils'

const BTN = {
  LD_L: 8, LD_R: 9, LD_D: 10, LD_U: 11,
  SQ: 16, CI: 17, CR: 18, TR: 19,
  MM: 20, MS: 21, MT: 22, MQ: 23,
  LS: 25, LT: 26, LJ: 27,
  RS: 29, RT: 30, RJ: 31,
} as const
const TRIGGER_MIN = CONTROLLER_TRIGGER_MIN

function isDown(mask: number, bit: number) {
  return (mask & (1 << bit)) !== 0
}
function triggerDown(value: number, mask: number, bit: number) {
  return value > TRIGGER_MIN || isDown(mask, bit)
}

function Btn({ label, active, className }: { label: string; active: boolean; className?: string }) {
  return (
    <div className={cn(
      'flex min-w-9 items-center justify-center rounded-md border px-1.5 py-1 text-[11px] font-semibold transition-colors select-none',
      active ? 'border-sky-600 bg-sky-600 text-white shadow-sm shadow-sky-600/40'
        : 'border-border bg-muted text-muted-foreground',
      className,
    )}>
      {label}
    </div>
  )
}

function Stick({ x, y, maxX, maxY, pressed, label }: { x: number; y: number; maxX: number; maxY: number; pressed: boolean; label: string }) {
  const norm = (v: number, max: number) => Math.max(-1, Math.min(1, v / Math.max(max, 100)))
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={cn(
        'flex size-16 items-center justify-center rounded-full border-2 transition-colors',
        pressed ? 'border-sky-500 bg-sky-500/10' : 'border-border bg-muted',
      )}>
        <div className="size-3.5 rounded-full bg-muted-foreground transition-transform duration-75"
          style={{ transform: `translate(${norm(x, maxX) * 22}px, ${norm(y, maxY) * 22}px)` }} />
      </div>
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
    </div>
  )
}

function DPad({ mask }: { mask: number }) {
  return (
    <div className="grid grid-cols-3 gap-0.5">
      <div className="size-9" /><Btn label="↑" active={isDown(mask, BTN.LD_U)} /><div className="size-9" />
      <Btn label="←" active={isDown(mask, BTN.LD_L)} /><div className="size-9 rounded bg-muted" /><Btn label="→" active={isDown(mask, BTN.LD_R)} />
      <div className="size-9" /><Btn label="↓" active={isDown(mask, BTN.LD_D)} /><div className="size-9" />
    </div>
  )
}

function FaceButtons({ mask }: { mask: number }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <Btn label="△" active={isDown(mask, BTN.TR)} />
      <div className="flex gap-0.5">
        <Btn label="□" active={isDown(mask, BTN.SQ)} /><div className="w-9" /><Btn label="○" active={isDown(mask, BTN.CI)} />
      </div>
      <Btn label="✕" active={isDown(mask, BTN.CR)} />
    </div>
  )
}

export function ControllerCanvas({ state, axisMax }: { state: ControllerState; axisMax?: number[] }) {
  const max = axisMax ?? [CONTROLLER_STICK_SCALE, CONTROLLER_STICK_SCALE, CONTROLLER_STICK_SCALE, CONTROLLER_STICK_SCALE]
  return (
    <div dir="ltr" className="flex flex-col gap-3 rounded-xl border bg-muted/40 p-4">
      <div className="flex items-center justify-center gap-1.5">
        <Btn label="L1" active={isDown(state.btns, BTN.LS)} />
        <Btn label="L2" active={triggerDown(state.l2, state.btns, BTN.LT)} />
        <div className="grow" />
        <Btn label="R2" active={triggerDown(state.r2, state.btns, BTN.RT)} />
        <Btn label="R1" active={isDown(state.btns, BTN.RS)} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col items-center gap-2.5">
          <DPad mask={state.btns} />
          <Stick x={state.lx} y={state.ly} maxX={max[0]} maxY={max[1]} pressed={isDown(state.btns, BTN.LJ)} label="L3" />
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <Btn label="Share" active={isDown(state.btns, BTN.MS)} className="min-w-14" />
          <Btn label="PS" active={isDown(state.btns, BTN.MT)} className="min-w-14" />
          <Btn label="Opt" active={isDown(state.btns, BTN.MM)} className="min-w-14" />
          <Btn label="TP" active={isDown(state.btns, BTN.MQ)} className="min-w-14" />
        </div>
        <div className="flex flex-col items-center gap-2.5">
          <FaceButtons mask={state.btns} />
          <Stick x={state.rx} y={state.ry} maxX={max[2]} maxY={max[3]} pressed={isDown(state.btns, BTN.RJ)} label="R3" />
        </div>
      </div>
    </div>
  )
}

export function RawBtns({ state }: { state: ControllerState }) {
  const t = useT()
  const hex = '0x' + (state.btns >>> 0).toString(16).padStart(8, '0').toUpperCase()
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{t('controllerRaw')}</span>
      <Badge variant="outline" className="font-mono">{hex}</Badge>
    </div>
  )
}
