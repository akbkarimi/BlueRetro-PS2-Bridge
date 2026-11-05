'use client'

/**
 * Ports — raw per-port mode bytes (a02 select + a03 data): dev_mode and
 * acc_mode of the wired adapter, plus a friendly rumble-bit toggle.
 */
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Section, PageHeader, Row, useT } from '../shared'
import { activeBle } from '@/lib/br/store'
import { readPortMode, savePortMode, type PortMode } from '@/lib/br/protocol'

function PortCard({ port }: { port: number }) {
  const t = useT()
  const [m, setM] = useState<PortMode | null>(null)
  const [dev, setDev] = useState('0')
  const [acc, setAcc] = useState('0')

  useEffect(() => {
    const ble = activeBle()
    if (!ble) return
    readPortMode(ble, port).then((v) => {
      setM(v); setDev(String(v.devMode)); setAcc(String(v.accMode))
    }).catch(() => setM(null))
  }, [port])

  const save = async () => {
    const ble = activeBle()
    if (!ble) return
    const dm = parseInt(dev, 10) & 0xff
    const am = parseInt(acc, 10) & 0xff
    if (Number.isNaN(dm) || Number.isNaN(am)) return
    try {
      await savePortMode(ble, port, { devMode: dm, accMode: am })
      setM({ devMode: dm, accMode: am })
      toast.success(t('savedToast'))
    } catch (e) {
      toast.error(`${t('writeFailed')}: ${String((e as Error)?.message ?? e)}`)
    }
  }

  return (
    <Section title={`${t('port')} ${port + 1}`}>
      <Row label={t('devMode')} hint="a03[0]">
        <Input dir="ltr" value={dev} onChange={(e) => setDev(e.target.value)}
          className="w-24 h-8 text-center font-mono bg-zinc-900 border-zinc-700" inputMode="numeric" />
      </Row>
      <Row label={t('accMode')} hint="a03[1]">
        <Input dir="ltr" value={acc} onChange={(e) => setAcc(e.target.value)}
          className="w-24 h-8 text-center font-mono bg-zinc-900 border-zinc-700" inputMode="numeric" />
      </Row>
      <Row label={t('rumbleBit')}>
        <Switch
          checked={m ? (m.accMode & 2) !== 0 : false}
          disabled={!m}
          onCheckedChange={async (v) => {
            const nv = v ? (m!.accMode | 2) : (m!.accMode & ~2)
            setAcc(String(nv & 0xff))
            if (m) { setM({ ...m, accMode: nv & 0xff }) }
            await save()
          }}
        />
      </Row>
      <div className="mt-3">
        <Button size="sm" className="gap-1.5" onClick={() => void save()}>
          <Save className="h-4 w-4" /> {t('save')}
        </Button>
      </div>
    </Section>
  )
}

export function PortsPage() {
  const t = useT()
  return (
    <div className="space-y-4">
      <PageHeader titleKey="ports" descKey="portsDesc" />
      {/* PS2 logical slots: 2 physical ports × 4 Multitap slots. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 8 }, (_, port) => (
          <PortCard key={port} port={port} />
        ))}
      </div>
    </div>
  )
}
