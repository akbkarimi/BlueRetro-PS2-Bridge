'use client'

/**
 * Controller Input — live button state monitor via command 8
 * (getControllerState), exactly like the real webapp page.
 */
import { useEffect, useState } from 'react'
import { Section, PageHeader, useT } from '../shared'
import { activeBle, dev, useBr } from '@/lib/br/store'
import { getControllerState, type CtrlSnapshot } from '@/lib/br/protocol'
import { BTN } from '@/lib/br/device'

const BTN_LIST: { bit: number; label: string }[] = [
  { bit: BTN.UP, label: '↑' }, { bit: BTN.DOWN, label: '↓' }, { bit: BTN.LEFT, label: '←' }, { bit: BTN.RIGHT, label: '→' },
  { bit: BTN.TRIANGLE, label: '△' }, { bit: BTN.CIRCLE, label: '○' }, { bit: BTN.CROSS, label: '✕' }, { bit: BTN.SQUARE, label: '□' },
  { bit: BTN.L1, label: 'L1' }, { bit: BTN.R1, label: 'R1' }, { bit: BTN.L2, label: 'L2' }, { bit: BTN.R2, label: 'R2' },
  { bit: BTN.SHARE, label: 'SHARE' }, { bit: BTN.OPTIONS, label: 'START' }, { bit: BTN.PS, label: 'PS' }, { bit: BTN.TOUCHCLICK, label: 'PAD' },
]

function AxisBar({ v, label }: { v: number; label: string }) {
  const pct = Math.round(((v + 32768) / 65535) * 100)
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-5" dir="ltr">{label}</span>
      <div className="flex-1 h-1.5 bg-zinc-800 rounded relative overflow-hidden">
        <div className="absolute top-0 bottom-0 w-0.5 bg-zinc-600" style={{ left: '50%' }} />
        <div className="absolute top-0 bottom-0 bg-sky-500" style={{ left: `${Math.min(50, pct)}%`, width: `${Math.abs(pct - 50)}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground w-10 text-end" dir="ltr">{v}</span>
    </div>
  )
}

function PortMonitor({ port }: { port: 0 | 1 }) {
  const t = useT()
  const lang = useBr((s) => s.lang)
  const [snap, setSnap] = useState<CtrlSnapshot | null>(null)
  const c = dev().controllers[port]

  useEffect(() => {
    const id = setInterval(() => {
      void (async () => {
        try {
          setSnap(await getControllerState(activeBle(), port))
        } catch { /* device busy */ }
      })()
    }, 120)
    return () => clearInterval(id)
  }, [port])

  const btns = snap?.btns ?? 0
  return (
    <Section title={`${t('port')} ${port + 1} — ${c.connected ? c.type : '—'}`}>
      <div className="grid grid-cols-8 gap-1.5" dir="ltr">
        {BTN_LIST.map((b) => (
          <div
            key={b.label}
            className={`rounded-md border text-center text-[10px] py-1.5 font-mono transition-colors
              ${btns & b.bit ? 'bg-sky-600/80 border-sky-400 text-white' : 'border-zinc-800 text-zinc-500 bg-zinc-900'}`}
          >
            {b.label}
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-1.5">
        <AxisBar v={snap?.lx ?? 0} label="LX" />
        <AxisBar v={snap?.ly ?? 0} label="LY" />
        <AxisBar v={snap?.rx ?? 0} label="RX" />
        <AxisBar v={snap?.ry ?? 0} label="RY" />
      </div>
      <div className="mt-2 flex gap-4 text-xs text-muted-foreground" dir="ltr">
        <span>L2: {snap?.l2 ?? 0}</span>
        <span>R2: {snap?.r2 ?? 0}</span>
        <span>btns: 0x{(btns >>> 0).toString(16).padStart(8, '0')}</span>
      </div>
      {lang === 'fa' && <p className="mt-2 text-[11px] text-muted-foreground">از صفحه «دسته‌های مجازی» دکمه بزنید تا اینجا زنده دیده شود.</p>}
    </Section>
  )
}

export function InputPage() {
  const t = useT()
  return (
    <div className="space-y-4">
      <PageHeader titleKey="input" descKey="inputDesc" />
      <div className="grid gap-4 lg:grid-cols-2">
        <PortMonitor port={0} />
        <PortMonitor port={1} />
      </div>
    </div>
  )
}
