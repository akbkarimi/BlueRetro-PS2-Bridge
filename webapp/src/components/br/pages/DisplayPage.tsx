'use client'

/**
 * OLED Screen page — writes the firmware MX OLED + IDLE + TIME slots.
 * Includes the 128×32 / 128×64 panel-height fix (applied live by the
 * firmware via gfx_set_panel_h and persisted in NVS).
 */
import { useState } from 'react'
import { toast } from 'sonner'
import { RefreshCcw, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Section, PageHeader, Row, useT, BrSelect, NotReady } from '../shared'
import { OledPreview } from '../OledPreview'
import { useBr, activeBle } from '@/lib/br/store'
import { saveOledCfg, saveIdleCfg, saveTimeCfg, type OledCfg, type IdleCfg } from '@/lib/br/protocol'
import { IDLE_MODES, OLED_PAGES } from '@/lib/br/constants'

export function DisplayPage() {
  const t = useT()
  const lang = useBr((s) => s.lang)
  const [manualDate, setManualDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [manualTime, setManualTime] = useState(() => {
    const d = new Date()
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
  })
  const oled = useBr((s) => s.oled)
  const idle = useBr((s) => s.idle)
  const setOled = useBr((s) => s.setOled)
  const setIdle = useBr((s) => s.setIdle)

  if (!oled || !idle) {
    return (
      <div className="space-y-4">
        <PageHeader titleKey="display" descKey="displayDesc" />
        <NotReady />
      </div>
    )
  }

  /** Write the OLED slot and update the local mirror */
  const commitOled = async (patch: Partial<OledCfg>) => {
    const ble = activeBle()
    const next = { ...oled, ...patch }
    setOled(next)
    if (!ble) return
    try {
      await saveOledCfg(ble, next)
      toast.success(t('savedToast'))
    } catch (e) {
      toast.error(`${t('writeFailed')}: ${String((e as Error)?.message ?? e)}`)
    }
  }

  const commitIdle = async (patch: Partial<IdleCfg>) => {
    const ble = activeBle()
    const next = { ...idle, ...patch }
    setIdle(next)
    if (!ble) return
    try {
      await saveIdleCfg(ble, next)
      toast.success(t('savedToast'))
    } catch (e) {
      toast.error(`${t('writeFailed')}: ${String((e as Error)?.message ?? e)}`)
    }
  }

  const togglePage = async (pageId: number) => {
    const has = oled.pages.includes(pageId)
    const pages = has ? oled.pages.filter((p) => p !== pageId) : [...oled.pages, pageId]
    await commitOled({ pages })
  }

  const writeClock = async (date: string, time: string) => {
    const ble = activeBle()
    if (!ble) return
    const [year, month, day] = date.split('-').map(Number)
    const [hour, minute, second] = time.split(':').map(Number)
    const dateCheck = new Date(year, month - 1, day)
    if (![year, month, day, hour, minute, second].every(Number.isInteger) ||
        year < 2000 || year > 2099 || month < 1 || month > 12 ||
        dateCheck.getFullYear() !== year || dateCheck.getMonth() !== month - 1 ||
        dateCheck.getDate() !== day || hour < 0 || hour > 23 ||
        minute < 0 || minute > 59 || second < 0 || second > 59) {
      toast.error(lang === 'fa' ? 'تاریخ یا ساعت نامعتبر است' : 'Invalid date or time')
      return
    }
    try {
      await saveTimeCfg(ble, { year, month, day, hour, minute, second })
      toast.success(t('savedToast'))
    } catch (e) {
      toast.error(`${t('writeFailed')}: ${String((e as Error)?.message ?? e)}`)
    }
  }

  const syncClock = async () => {
    const now = new Date()
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
    setManualDate(date)
    setManualTime(time)
    await writeClock(date, time)
  }

  const setManualClock = async () => writeClock(manualDate, manualTime)

  return (
    <div className="space-y-4">
      <PageHeader titleKey="display" descKey="displayDesc" />

      <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
        <Section className="justify-self-center">
          <div className="flex flex-col items-center gap-3">
            <OledPreview panelH={oled.panelH} rotation={oled.rotation} label={`SSD1306 · 128×${oled.panelH}`} />
            <Button size="sm" variant="outline" className="gap-1 border-zinc-700" onClick={() => void commitOled({})}>
              <RefreshCcw className="h-4 w-4" /> {t('refresh')}
            </Button>
          </div>
        </Section>

        <div className="space-y-4">
          <Section title={t('display')}>
            <Row label={t('oledEnable')}>
              <Switch checked={oled.enabled} onCheckedChange={(v) => void commitOled({ enabled: v })} />
            </Row>
            <Row label={t('resolution')} hint={t('resolutionHint')}>
              <BrSelect
                value={String(oled.panelH)}
                onValueChange={(v) => void commitOled({ panelH: Number(v) === 32 ? 32 : 64 })}
                ariaLabel={t('resolution')}
                className="w-36"
                options={[
                  { value: '32', label: '128 × 32' },
                  { value: '64', label: '128 × 64' },
                ]}
              />
            </Row>
            <Row label={t('rotation')}>
              <BrSelect
                value={String(oled.rotation)}
                onValueChange={(v) => void commitOled({ rotation: Number(v) })}
                ariaLabel={t('rotation')}
                className="w-36"
                options={[
                  { value: '0', label: '0°' },
                  { value: '1', label: '180°' },
                ]}
              />
            </Row>
            <Row label={t('notifications')}>
              <Switch checked={oled.notifications} onCheckedChange={(v) => void commitOled({ notifications: v })} />
            </Row>
            <Row label={t('touchNav')}>
              <Switch checked={oled.touchpadNav} onCheckedChange={(v) => void commitOled({ touchpadNav: v })} />
            </Row>
          </Section>

          <Section title={t('infoPages')}>
            <div className="flex flex-wrap gap-2">
              {OLED_PAGES.map((p) => {
                const idx = oled.pages.indexOf(p.id)
                return (
                  <Button
                    key={p.id}
                    size="sm"
                    variant={idx >= 0 ? 'default' : 'outline'}
                    className={`h-8 gap-1.5 ${idx >= 0 ? '' : 'border-zinc-700'}`}
                    onClick={() => void togglePage(p.id)}
                  >
                    {idx >= 0 && <span className="text-[10px] opacity-70" dir="ltr">{idx + 1}</span>}
                    {lang === 'fa' ? p.fa : p.en}
                  </Button>
                )
              })}
            </div>
          </Section>

          <Section title={t('idleScreen')}>
            <Row label={t('idleScreen')}>
              <BrSelect
                value={String(idle.mode)}
                onValueChange={(v) => void commitIdle({ mode: Number(v) })}
                ariaLabel={t('idleScreen')}
                className="w-52"
                options={IDLE_MODES.map((m) => ({ value: String(m.id), label: lang === 'fa' ? m.fa : m.en }))}
              />
            </Row>
            <Row label={t('idleTimeout')} hint={`${idle.timeoutSec} ${t('seconds')}`}>
              <div className="w-44">
                <Slider
                  value={[idle.timeoutSec]} min={0} max={600} step={5}
                  onValueCommit={(v) => void commitIdle({ timeoutSec: v[0] })}
                  onValueChange={(v) => setIdle({ ...idle, timeoutSec: v[0] })}
                />
              </div>
            </Row>
          </Section>

          <Section title={t('clockSlot')}>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{lang === 'fa' ? 'تاریخ' : 'Date'}</label>
                <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)}
                  className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{lang === 'fa' ? 'ساعت، دقیقه و ثانیه' : 'Time (HH:MM:SS)'}</label>
                <input type="time" step="1" value={manualTime} onChange={(e) => setManualTime(e.target.value)}
                  className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm" />
              </div>
              <Button size="sm" className="gap-1.5" onClick={() => void setManualClock()}>
                <Save className="h-4 w-4" /> {lang === 'fa' ? 'تنظیم دستی' : 'Set manually'}
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 border-zinc-700" onClick={() => void syncClock()}>
                <RefreshCcw className="h-4 w-4" /> {t('syncClock')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {lang === 'fa'
                ? 'همگام‌سازی خودکار، زمان محلی مرورگر را ارسال می‌کند. ساعت پس از تنظیم در Firmware هر ثانیه جلو می‌رود.'
                : 'Sync sends your browser local time. Firmware advances the clock once per second after setting it.'}
            </p>
          </Section>
        </div>
      </div>
    </div>
  )
}
