'use client'

/**
 * Advance Config — rebuilds the ORIGINAL BlueRetro web config tool page
 * (blueretro.io, repo darthcloud/BlueRetroWebCfg) on the BlueRetro PS2 Bridge
 * protocol layer. The original firmware GATT model is kept by the fork:
 *   • Config selection — global_cfg.banksel (a01[3], banks 0..3, 0xDB = debug)
 *   • Global config    — system_cfg / multitap_cfg / inquiry_mode (a01[0..2])
 *   • Output config    — out_cfg per port {dev_mode, acc_mode} (a02/a03),
 *                        incl. the rumble toggle (moved out of Colors page, v4.3)
 *   • PS2 Bridge extension — MX FEATURES byte (a0d slot select + a0e blob, slot 6)
 *
 * All enum values mirror main/adapter/adapter.h + adapter/config.h of the
 * firmware (DEV_PAD=0, ACC_NONE=0, MT_NONE=0, INQ_AUTO=0, WIRED_AUTO=0 …).
 */
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { BookOpen, ExternalLink } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Section, PageHeader, Row, useT, BrSelect, NotReady } from '../shared'
import { useBr, activeBle } from '@/lib/br/store'
import { saveSysCfg, saveFeatures, readPortMode, savePortMode, type SysCfg, type PortMode } from '@/lib/br/protocol'
import { MX_SLOT } from '@/lib/br/constants'

const CONFIG_BANKSEL_DBG = 0xdb

/* out_cfg per-port card — named dev_mode / acc_mode + rumble bit toggle */
function PortOutCard({ port }: { port: number }) {
  const t = useT()
  const [m, setM] = useState<PortMode | null>(null)

  useEffect(() => {
    const ble = activeBle()
    if (!ble) return
    readPortMode(ble, port).then(setM).catch(() => setM(null))
  }, [port])

  const write = async (next: PortMode) => {
    const ble = activeBle()
    if (!ble) return
    setM(next)
    try {
      await savePortMode(ble, port, next)
      toast.success(t('savedToast'))
    } catch (e) {
      toast.error(`${t('writeFailed')}: ${String((e as Error)?.message ?? e)}`)
    }
  }

  const setDev = (v: number) => { if (m) void write({ devMode: v & 0xff, accMode: m.accMode }) }
  const setAcc = (v: number) => { if (m) void write({ devMode: m.devMode, accMode: v & 0xff }) }
  const setRumble = (on: boolean) => {
    if (!m) return
    setAcc(on ? (m.accMode | 2) & 0xff : m.accMode & ~2 & 0xff)
  }

  const devOptions = [
    { value: '0', label: `0 · ${t('devPad')}` },
    { value: '1', label: `1 · ${t('devPadAlt')}` },
    { value: '2', label: `2 · ${t('devKb')}` },
    { value: '3', label: `3 · ${t('devMouse')}` },
  ]
  const accOptions = [
    { value: '0', label: `0 · ${t('accNone')}` },
    { value: '1', label: `1 · ${t('accMem')}` },
    { value: '2', label: `2 · ${t('accRumble')}` },
    { value: '3', label: `3 · ${t('accBoth')}` },
  ]

  return (
    <Section title={`${t('port')} ${port + 1}`} desc={m ? `${t('rawBytes')}: dev 0x${m.devMode.toString(16).padStart(2, '0')} · acc 0x${m.accMode.toString(16).padStart(2, '0')}` : undefined}>
      <Row label={t('devModeName')} hint="a03[0] · dev_mode">
        <BrSelect
          value={m ? String(m.devMode) : '0'}
          onValueChange={(v) => setDev(Number(v))}
          ariaLabel={`port ${port + 1} dev mode`}
          className="w-44"
          options={devOptions}
          disabled={!m}
        />
      </Row>
      <Row label={t('accModeName')} hint="a03[1] · acc_mode">
        <BrSelect
          value={m ? String(m.accMode & 0xff) : '0'}
          onValueChange={(v) => setAcc(Number(v))}
          ariaLabel={`port ${port + 1} acc mode`}
          className="w-44"
          options={accOptions}
          disabled={!m}
        />
      </Row>
      <Row label={t('rumble')} hint="acc_mode bit 1 · ACC_RUMBLE/ACC_BOTH">
        <Switch
          checked={m ? (m.accMode & 2) !== 0 : false}
          disabled={!m}
          onCheckedChange={setRumble}
        />
      </Row>
    </Section>
  )
}

export function AdvancePage() {
  const t = useT()
  const sys = useBr((s) => s.sys)
  const setSys = useBr((s) => s.setSys)
  const features = useBr((s) => s.features)
  const setFeatures = useBr((s) => s.setFeatures)

  if (!sys || features === null) {
    return (
      <div className="space-y-4">
        <PageHeader titleKey="advance" descKey="advanceDesc" />
        <NotReady />
      </div>
    )
  }
  const feat: number = features
  const banksel = sys.banksel

  const commitSys = async (patch: Partial<SysCfg>) => {
    const ble = activeBle()
    const next = { ...sys, ...patch, system: 17 } // PS2 is the only supported product target.
    setSys(next)
    if (!ble) return
    try {
      await saveSysCfg(ble, next)
      toast.success(t('savedToast'))
    } catch (e) {
      toast.error(`${t('writeFailed')}: ${String((e as Error)?.message ?? e)}`)
    }
  }

  const commitFeatureBit = async (bit: number, v: boolean) => {
    const ble = activeBle()
    if (!ble) return
    const nv = v ? (feat | (1 << bit)) & 0xff : feat & ~(1 << bit) & 0xff
    setFeatures(nv)
    try {
      await saveFeatures(ble, nv)
      toast.success(t('savedToast'))
    } catch (e) {
      toast.error(`${t('writeFailed')}: ${String((e as Error)?.message ?? e)}`)
    }
  }

  const bankOptions = [0, 1, 2, 3].map((b) => ({
    value: String(b),
    label: b === 0 ? `0 · ${t('bankDefault')}` : `${b} · ${t('bankCustom')}`,
  }))

  const mtOptions = [
    { value: '0', label: `0 · ${t('mtNone')}` },
    { value: '1', label: `1 · ${t('mtSlot1')}` },
    { value: '2', label: `2 · ${t('mtSlot2')}` },
    { value: '3', label: `3 · ${t('mtDual')}` },
    { value: '4', label: `4 · ${t('mtAlt')}` },
  ]
  const inqOptions = [
    { value: '0', label: `0 · ${t('inqAuto')}` },
    { value: '1', label: `1 · ${t('inqManual')}` },
  ]

  return (
    <div className="space-y-4">
      <PageHeader titleKey="advance" descKey="advanceDesc" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t('configSel')} desc="a01[3] · banksel">
          <Row label={t('activeBank')} hint={t('configSelHint')}>
            <BrSelect
              value={String(banksel)}
              onValueChange={(v) => void commitSys({ banksel: Number(v) })}
              ariaLabel={t('configSel')}
              className="w-44"
              options={bankOptions}
            />
          </Row>
          {banksel === CONFIG_BANKSEL_DBG && (
            <p className="text-xs text-amber-300 mt-1" dir="ltr">0xDB — debug bank</p>
          )}
          <p className="text-xs text-muted-foreground leading-5">{t('bankDbgHint')}</p>
        </Section>

        <Section title={t('globalCfgTitle')} desc="a01[0..2]">
          <Row label={t('systemCfg')} hint="a01[0] = 17">
            <span className="text-sm font-medium text-sky-300">{t('ps2Only')}</span>
          </Row>
          <Row label={t('multitap')} hint={`a01[1] = ${sys.multitap}`}>
            <BrSelect
              value={String(sys.multitap)}
              onValueChange={(v) => void commitSys({ multitap: Number(v) })}
              ariaLabel={t('multitap')}
              className="w-44"
              options={mtOptions}
            />
          </Row>
          <Row label={t('inquiryMode')} hint={`a01[2] = ${sys.inquiry}`}>
            <BrSelect
              value={String(sys.inquiry)}
              onValueChange={(v) => void commitSys({ inquiry: Number(v) })}
              ariaLabel={t('inquiryMode')}
              className="w-44"
              options={inqOptions}
            />
          </Row>
        </Section>

        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-200">{t('outCfgTitle')}</h3>
            <span className="text-[10px] text-muted-foreground" dir="ltr">a02 select · a03 data</span>
          </div>
          <p className="text-xs text-muted-foreground leading-5">{t('outCfgHint')}</p>
          {/* PS2 logical slots: 2 physical ports × 4 Multitap slots. */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 8 }, (_, port) => (
              <PortOutCard key={port} port={port} />
            ))}
          </div>
        </div>

        <Section title={t('origDocs')}>
          <div className="grid gap-2">
            <a
              href="https://blueretro.io"
              target="_blank" rel="noreferrer"
              className="flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2.5 text-sm hover:bg-zinc-900 transition-colors"
            >
              <BookOpen className="h-4 w-4 text-sky-400 shrink-0" />
              <span className="flex-1">blueretro.io — {t('origDocs')}</span>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </a>
            <a
              href="https://github.com/darthcloud/BlueRetro/wiki/BlueRetro-BLE-Web-Config-User-Manual"
              target="_blank" rel="noreferrer"
              className="flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2.5 text-sm hover:bg-zinc-900 transition-colors"
            >
              <BookOpen className="h-4 w-4 text-sky-400 shrink-0" />
              <span className="flex-1" dir="ltr">github.com/darthcloud/BlueRetro — Web Config User Manual</span>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </a>
            <p className="text-xs text-muted-foreground leading-5">{t('origDocsHint')}</p>
          </div>
        </Section>

        <Section title={t('featuresByte')} desc={t('featuresHint')}>
          <Row label={`slot ${MX_SLOT.FEATURES} (a0e)`} hint={`0x${feat.toString(16).padStart(2, '0')} · ${feat} · ${feat.toString(2).padStart(8, '0')}`}>
            <span className="font-mono text-xs text-muted-foreground" dir="ltr">a0e</span>
          </Row>
          {[7, 6, 5, 4, 3, 2, 1, 0].map((bit) => (
            <Row key={bit} label={`bit ${bit}`} hint={`0x${(1 << bit).toString(16).padStart(2, '0')}`}>
              <Switch
                checked={(feat & (1 << bit)) !== 0}
                onCheckedChange={(v) => void commitFeatureBit(bit, v)}
              />
            </Row>
          ))}
        </Section>
      </div>
    </div>
  )
}
