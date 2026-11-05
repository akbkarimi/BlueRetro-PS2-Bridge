'use client'

import { useEffect, useState } from 'react'
import { Shield, RefreshCcw, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useBr, activeBle } from '@/lib/br/store'
import { readMacSpoofCfg, saveMacSpoofCfg } from '@/lib/br/protocol'
import { PageHeader, Section, Row, useT } from '../shared'

const PRESET_AABB = [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]
const PRESET_PS3 = [0x00, 0x1a, 0x7d, 0xda, 0x71, 0x13]
const EMPTY_BYTES = ['', '', '', '', '', '']

function macToString(mac: number[]) {
  return mac.map((b) => (b & 0xff).toString(16).padStart(2, '0').toUpperCase()).join(':')
}
function parseMac(bytes: string[]): number[] | null {
  if (bytes.length !== 6 || bytes.some((b) => !/^[0-9a-fA-F]{2}$/.test(b))) return null
  return bytes.map((b) => Number.parseInt(b, 16))
}
function statusOf(mac: number[] | null): 'valid' | 'multicast' | 'empty' | 'invalid' | 'unrepresentable' {
  if (!mac) return 'invalid'
  if (mac.every((b) => b === 0)) return 'empty'
  if ((mac[0] & 1) !== 0) return 'multicast'
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
  if (borrow > 0 || base.every((b) => b === 0) || (base[0] & 1) !== 0) return 'unrepresentable'
  return 'valid'
}

export function MacSpoofPage() {
  const t = useT()
  const connected = useBr((s) => s.connected)
  const currentAddress = useBr((s) => s.bdaddr)
  const firmware = useBr((s) => s.fw)
  const [enabled, setEnabled] = useState(false)
  const [bytes, setBytes] = useState<string[]>(EMPTY_BYTES)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [unsupported, setUnsupported] = useState(false)

  const load = async () => {
    const ble = activeBle()
    if (!ble) return
    setBusy(true)
    try {
      const cfg = await readMacSpoofCfg(ble)
      setEnabled(cfg.enabled)
      setBytes(cfg.mac.map((b) => b.toString(16).padStart(2, '0').toUpperCase()))
      setDirty(false)
      setLoaded(true)
      setUnsupported(false)
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e)
      setUnsupported(msg === 'MAC_SLOT_UNSUPPORTED')
      toast.error(msg === 'MAC_SLOT_UNSUPPORTED' ? t('macSpoofUnsupported') : `${t('writeFailed')}: ${msg}`)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    let active = true

    const timer = window.setTimeout(() => {
      if (active && connected) void load()
      if (active && !connected) {
        setLoaded(false)
        setUnsupported(false)
        setBytes(EMPTY_BYTES)
        setEnabled(false)
        setDirty(false)
      }
    }, 0)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
    // Connection lifecycle is the trigger; load is intentionally local to this page.
  }, [connected])

  const mac = parseMac(bytes)
  const status = statusOf(mac)

  const updateByte = (index: number, value: string) => {
    const clean = value.replace(/[^0-9a-fA-F]/g, '').slice(0, 2)
    setBytes((prev) => prev.map((b, i) => i === index ? clean : b))
    setDirty(true)
  }

  const setPreset = (values: number[]) => {
    setBytes(values.map((v) => v.toString(16).padStart(2, '0').toUpperCase()))
    setDirty(true)
  }

  const save = async () => {
    const ble = activeBle()
    if (!ble || !mac) return
    if (enabled && status !== 'valid') {
      toast.error(status === 'multicast' ? t('macSpoofMulticast') : status === 'unrepresentable' ? t('macSpoofUnrepresentable') : t('macSpoofInvalid'))
      return
    }
    setBusy(true)
    try {
      await saveMacSpoofCfg(ble, { enabled, mac })
      setDirty(false)
      setLoaded(true)
      toast.success(t('macSpoofSaved'))
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e)
      toast.error(msg === 'MAC_ADDRESS_INVALID' ? t('macSpoofInvalid') : `${t('writeFailed')}: ${msg}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader titleKey="macSpoof" descKey="macSpoofDesc" />

      {!connected && (
        <Section><p className="text-sm text-muted-foreground">{t('needConnect')}</p></Section>
      )}
      {connected && unsupported && (
        <Alert variant="destructive"><AlertDescription>{t('macSpoofUnsupported')}</AlertDescription></Alert>
      )}
      {connected && loaded && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title={t('macSpoofAddress')} desc={t('macSpoofEnable')}>
            <div className="space-y-5">
              <Row label={t('macSpoofEnable')}>
                <Switch checked={enabled} onCheckedChange={(v) => { setEnabled(v); setDirty(true) }} disabled={busy} />
              </Row>
              <div dir="ltr" className="flex flex-wrap items-center gap-1.5">
                {bytes.map((b, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-muted-foreground">:</span>}
                    <Input
                      value={b}
                      onChange={(e) => updateByte(i, e.target.value)}
                      aria-label={`MAC byte ${i + 1}`}
                      autoComplete="off"
                      className="h-11 w-12 text-center font-mono text-sm uppercase"
                      maxLength={2}
                      disabled={busy}
                    />
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={status === 'valid' ? 'default' : status === 'multicast' ? 'outline' : 'destructive'}>
                  {status === 'valid' ? t('macSpoofValid') : status === 'multicast' ? t('macSpoofMulticast') : status === 'empty' ? t('macSpoofEmpty') : status === 'unrepresentable' ? t('macSpoofUnrepresentable') : t('macSpoofInvalid')}
                </Badge>
                <span className="font-mono text-sm text-muted-foreground">{mac ? macToString(mac) : '—'}</span>
              </div>
              {status === 'multicast' && <p className="text-xs text-amber-500">{t('macSpoofMulticast')}</p>}
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">{t('macSpoofPresets')}</div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPreset(PRESET_AABB)} disabled={busy}>
                    <span className="font-mono text-xs">AA:BB:CC:DD:EE:FF</span>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPreset(PRESET_PS3)} disabled={busy}>
                    <span className="font-mono text-xs">00:1A:7D:DA:71:13</span>
                  </Button>
                  {currentAddress && (
                    <Button variant="outline" size="sm" onClick={() => setPreset(currentAddress.split(':').map((v) => Number.parseInt(v, 16)))} disabled={busy}>
                      {t('macSpoofUseCurrent')}
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={() => void save()} disabled={busy || !mac || (enabled && status !== 'valid')}>
                  <Save className="me-1 size-4" />{t('save')}
                </Button>
                <Button variant="outline" onClick={() => void load()} disabled={busy}>
                  <RefreshCcw className="me-1 size-4" />{t('refresh')}
                </Button>
                {dirty && <span className="text-xs text-amber-500">●</span>}
              </div>
            </div>
          </Section>

          <Section title={t('note')} desc={t('macSpoofReboot')}>
            <div className="space-y-3 text-sm">
              <Row label={t('macSpoofCurrent')}><span className="font-mono" dir="ltr">{currentAddress ?? '—'}</span></Row>
              <Row label={t('macSpoofConfigured')}><span className="font-mono" dir="ltr">{mac ? macToString(mac) : '—'}</span></Row>
              <Row label={t('macSpoofEnable')}><Badge variant="outline">{enabled ? t('on') : t('offLabel')}</Badge></Row>
              <Row label={t('firmware')}><span className="font-mono">{firmware ?? '—'}</span></Row>
              <Alert><AlertDescription>{t('macSpoofReboot')}</AlertDescription></Alert>
            </div>
          </Section>
        </div>
      )}
      {connected && !loaded && !unsupported && (
        <Section>
          <div className="flex items-center gap-3">
            <Shield className="size-5 text-muted-foreground" />
            <p className="flex-1 text-sm text-muted-foreground">{busy ? t('connecting') : t('refresh')}</p>
            <Button size="sm" variant="outline" onClick={() => void load()} disabled={busy}>{t('refresh')}</Button>
          </div>
        </Section>
      )}
    </div>
  )
}
