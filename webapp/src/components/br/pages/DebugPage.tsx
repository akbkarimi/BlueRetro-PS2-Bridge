'use client'

/**
 * Debug — live GATT traffic log captured by the transport wrapper in the
 * store (every a0x read/write with a hex dump of the first 32 bytes).
 */
import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Section, PageHeader, useT } from '../shared'
import { useBr } from '@/lib/br/store'

type Filter = 'all' | 'rd' | 'wr' | 'ev'

/* The console area keeps its dark "terminal" look in BOTH themes, so its
   inner colors are pinned literals (they must not flip with the theme). */
const KIND_STYLE: Record<Filter, string> = {
  rd: 'border-[#1d5a8a] text-[#7dd3fc]',
  wr: 'border-[#9a5b1e] text-[#fdba74]',
  ev: 'border-[#1f7a4d] text-[#6ee7b7]',
  all: '',
}

export function DebugPage() {
  const t = useT()
  const logs = useBr((s) => s.logs)
  const clearLogs = useBr((s) => s.clearLogs)
  const [filter, setFilter] = useState<Filter>('all')

  const rows = logs.filter((e) => filter === 'all' || e.dir === filter).slice(0, 150)

  return (
    <div className="space-y-4">
      <PageHeader titleKey="debug" />
      <Section title={t('gattLog')}>
        <div className="flex gap-2 mb-3">
          {(['all', 'rd', 'wr', 'ev'] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'}
              className={`h-7 ${filter === f ? '' : 'border-zinc-700'}`} onClick={() => setFilter(f)} dir="ltr">
              {f === 'all' ? t('all') : f === 'rd' ? t('read') : f === 'wr' ? t('write') : t('events')}
            </Button>
          ))}
          <Button size="sm" variant="ghost" className="h-7 gap-1 ms-auto text-[#f87171]" onClick={clearLogs}>
            <Trash2 className="h-3.5 w-3.5" /> {t('clear')}
          </Button>
        </div>
        <ScrollArea className="h-[420px] rounded-lg border border-zinc-800 bg-[#0a0f16]">
          <div className="p-3 font-mono text-[11px] leading-5" dir="ltr">
            {rows.length === 0 && <span className="text-[#71717a]">{t('noTraffic')}</span>}
            {rows.map((e, i) => (
              <div key={`${e.ts}-${i}`} className="flex gap-2">
                <span className="text-[#71717a] shrink-0">{new Date(e.ts).toLocaleTimeString('en-GB', { hour12: false })}</span>
                <Badge variant="outline" className={`h-4 px-1 text-[9px] shrink-0 ${KIND_STYLE[e.dir]}`}>{e.dir}</Badge>
                <span className="text-[#d4d4d8] break-all">{e.msg}</span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </Section>
    </div>
  )
}
