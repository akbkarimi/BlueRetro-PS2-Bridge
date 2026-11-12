'use client'

/** Shared UI helpers for the BlueRetro PS2 Bridge WebApp pages */
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useBr } from '@/lib/br/store'
import { makeT, type DictKey } from '@/lib/br/i18n'
import { useEffect, useState } from 'react'

export function useT() {
  const lang = useBr((s) => s.lang)
  return makeT(lang)
}

/* ------------------------------------------------------------------ */
/* Native <select> — replaces the Radix/shadcn Select everywhere.      */
/* OS-rendered dropdowns cannot suffer from portal positioning, RTL    */
/* flips, z-index overlaps or instant-close bugs, and they work        */
/* identically on desktop Chrome and Android.                          */
/* ------------------------------------------------------------------ */

export interface BrSelectOption { value: string; label: string }
export interface BrSelectGroup { label: string; options: BrSelectOption[] }

export function BrSelect({ value, onValueChange, options, groups, className = 'w-44', ariaLabel, disabled }: {
  value: string
  onValueChange: (v: string) => void
  options?: BrSelectOption[]
  groups?: BrSelectGroup[]
  className?: string
  ariaLabel?: string
  disabled?: boolean
}) {
  return (
    <select
      dir="ltr"
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={(e) => onValueChange(e.target.value)}
      className={`h-8 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-100 outline-none focus:border-sky-600 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {groups
        ? groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </optgroup>
          ))
        : options?.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
    </select>
  )
}

export function PageHeader({ titleKey, descKey }: { titleKey: DictKey; descKey?: DictKey }) {
  const t = useT()
  return (
    <div className="mb-4">
      <h1 className="text-xl font-bold tracking-tight">{t(titleKey)}</h1>
      {descKey && <p className="text-sm text-muted-foreground mt-1">{t(descKey)}</p>}
    </div>
  )
}

export function Section({ title, desc, children, className = '' }: {
  title?: string; desc?: string; children: React.ReactNode; className?: string
}) {
  return (
    <Card className={`bg-zinc-900/60 border-zinc-800 ${className}`}>
      {title && (
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          {desc && <CardDescription className="text-xs">{desc}</CardDescription>}
        </CardHeader>
      )}
      <CardContent className={title ? 'pt-0' : 'py-5'}>{children}</CardContent>
    </Card>
  )
}

export function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-zinc-800/60 last:border-0">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function ColorDot({ hex, size = 14 }: { hex: string; size?: number }) {
  return <span className="inline-block rounded-full border border-zinc-600 align-middle" style={{ width: size, height: size, background: hex }} />
}

/** Shown when a page's config mirror is not loaded yet: either the device
 *  is not connected, or the slot read failed — offers a retry when connected. */
export function NotReady() {
  const t = useT()
  const connected = useBr((s) => s.connected)
  const refresh = useBr((s) => s.refresh)

  return (
    <Section>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground flex-1 min-w-40">
          {connected ? t('readFailedHint') : t('needConnect')}
        </p>
        {connected && (
          <Button size="sm" variant="outline" className="border-zinc-700" onClick={() => void refresh()}>
            {t('refresh')}
          </Button>
        )}
      </div>
    </Section>
  )
}
