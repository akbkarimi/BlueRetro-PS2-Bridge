'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Section, PageHeader, Row, useT, NotReady } from '../shared'
import { useBr, activeBle } from '@/lib/br/store'
import { getControllerState, saveKeysCfg, DEFAULT_KEYS_CFG, SHORTCUT_ACTION, SHORTCUT_TRIGGER, type KeysCfg, type ShortcutEntry } from '@/lib/br/protocol'
import { PAD_BUTTON } from '@/lib/br/constants'

const ACTIONS = [
  { id: SHORTCUT_ACTION.SAVER_ENTER, en: 'Enter OLED screensaver', fa: 'ورود به محافظ صفحه OLED' },
  { id: SHORTCUT_ACTION.MENU_ENTER, en: 'Return to OLED menu', fa: 'بازگشت به منوی OLED' },
  { id: SHORTCUT_ACTION.PAGE_NEXT, en: 'Next OLED page', fa: 'صفحه بعد OLED' },
  { id: SHORTCUT_ACTION.PAGE_PREV, en: 'Previous OLED page', fa: 'صفحه قبل OLED' },
  { id: SHORTCUT_ACTION.SAVER_NEXT, en: 'Next screensaver', fa: 'محافظ صفحه بعدی' },
  { id: SHORTCUT_ACTION.SAVER_PREV, en: 'Previous screensaver', fa: 'محافظ صفحه قبلی' },
  { id: SHORTCUT_ACTION.DISCONNECT_PAD, en: 'Disconnect this controller', fa: 'قطع اتصال همین دسته' },
  { id: SHORTCUT_ACTION.DISCONNECT_ALL, en: 'Disconnect all controllers', fa: 'قطع اتصال همه دسته‌ها' },
]
const TRIGGERS = [
  { id: SHORTCUT_TRIGGER.PRESS, en: 'Press', fa: 'فشار' },
  { id: SHORTCUT_TRIGGER.HOLD, en: 'Hold', fa: 'نگه‌داشتن' },
  { id: SHORTCUT_TRIGGER.DOUBLE, en: 'Double press', fa: 'دو بار فشار' },
  { id: SHORTCUT_TRIGGER.RELEASE, en: 'Release', fa: 'رها کردن' },
]
const BUTTONS: [number, string][] = [
  [PAD_BUTTON.HOME, 'Home'], [16, 'Square'], [17, 'Cross'], [18, 'Circle'], [19, 'Triangle'], [PAD_BUTTON.LEFT, 'D-pad Left'], [PAD_BUTTON.RIGHT, 'D-pad Right'],
  [PAD_BUTTON.UP, 'D-pad Up'], [PAD_BUTTON.DOWN, 'D-pad Down'],
  [PAD_BUTTON.L1, 'L1'], [PAD_BUTTON.R1, 'R1'], [PAD_BUTTON.L2, 'L2'], [PAD_BUTTON.R2, 'R2'],
  [PAD_BUTTON.L3, 'L3'], [PAD_BUTTON.R3, 'R3'],
]
const bitCount = (v: number) => { let n = 0; for (let x = v >>> 0; x; x &= x - 1) n++; return n }
const BUTTON_MASK = BUTTONS.reduce((mask, [bit]) => mask | (1 << bit), 0) >>> 0
const describeButtons = (mask: number) => BUTTONS.filter(([bit]) => (mask & (1 << bit)) !== 0).map(([, name]) => name).join(' + ')

export function ShortcutsPage() {
  const t = useT()
  const lang = useBr((s) => s.lang)
  const keys = useBr((s) => s.keys)
  const setKeys = useBr((s) => s.setKeys)
  const [draft, setDraft] = useState<KeysCfg | null>(null)
  const [port, setPort] = useState(0)
  const [recording, setRecording] = useState<number | null>(null)
  const [liveMask, setLiveMask] = useState(0)
  const [busy, setBusy] = useState(false)
  const fa = lang === 'fa'

  useEffect(() => { if (keys) setDraft({ version: 2, entries: keys.entries.map((e) => ({ ...e })) }) }, [keys])

  useEffect(() => {
    if (recording === null) return
    let alive = true
    let polling = false
    const poll = async () => {
      if (polling) return
      const ble = activeBle()
      if (!ble) return
      polling = true
      try {
        const state = await getControllerState(ble, port)
        if (!alive || !state.valid) return
        const mask = (state.btns & BUTTON_MASK) >>> 0
        setLiveMask(mask)
        if ((mask & (1 << PAD_BUTTON.HOME)) && bitCount(mask) >= 2) {
          setDraft((current) => {
            if (!current) return current
            const entries = current.entries.map((e, i) => i === recording ? { ...e, buttons: mask } : e)
            return { ...current, entries }
          })
          setRecording(null)
          toast.success(fa ? 'ترکیب ثبت شد' : 'Combo captured')
        }
      } catch { /* Controller monitor may be temporarily busy; retry next poll. */ }
      finally { polling = false }
    }
    void poll()
    const timer = window.setInterval(() => void poll(), 140)
    return () => { alive = false; window.clearInterval(timer) }
  }, [recording, port, fa])

  const conflict = useMemo(() => {
    if (!draft) return -1
    const active = draft.entries.filter((e) => e.enabled && e.buttons)
    for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) {
      if ((active[i].buttons & active[j].buttons) === active[i].buttons ||
          (active[i].buttons & active[j].buttons) === active[j].buttons) return 1
    }
    return -1
  }, [draft])

  if (!draft) return <div className="space-y-4"><PageHeader titleKey="shortcuts" descKey="shortcutsDesc" /><NotReady /></div>

  const update = (index: number, patch: Partial<ShortcutEntry>) => setDraft((cur) => cur ? ({ ...cur, entries: cur.entries.map((e, i) => i === index ? { ...e, ...patch } : e) }) : cur)
  const save = async () => {
    const ble = activeBle()
    if (!ble || conflict > 0) return
    setBusy(true)
    try {
      await saveKeysCfg(ble, draft)
      setKeys(draft)
      toast.success(t('savedToast'))
    } catch (e) { toast.error(`${t('writeFailed')}: ${String((e as Error)?.message ?? e)}`) }
    finally { setBusy(false) }
  }
  const reset = () => setDraft({ version: 2, entries: DEFAULT_KEYS_CFG.entries.map((e) => ({ ...e })) })

  return (
    <div className="space-y-4">
      <PageHeader titleKey="shortcuts" descKey="shortcutsDesc" />
      <Section title={fa ? 'مدیریت میان‌برها' : 'Shortcut Manager'} desc={fa ? 'ترکیب‌ها برای هر دسته مستقل تشخیص داده می‌شوند. برای جلوگیری از تداخل با بازی، میان‌برهای قابل تنظیم باید با Home شروع شوند.' : 'Shortcuts are tracked independently per controller. User shortcuts must include Home to avoid consuming common gameplay inputs.'}>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="text-muted-foreground">{fa ? 'دسته برای ضبط' : 'Controller to record'}</label>
          <select className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2" value={port} onChange={(e) => setPort(Number(e.target.value))}>
            {[0, 1].map((i) => <option key={i} value={i}>{`Port ${i + 1}`}</option>)}
          </select>
          <span className="text-xs text-muted-foreground">{fa ? 'وضعیت زنده' : 'Live'}: {describeButtons(liveMask) || '—'}</span>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {fa ? `${draft.entries.length} از 8 میان‌بر` : `${draft.entries.length} of 8 shortcuts`}
            </span>
            <button
              type="button"
              disabled={draft.entries.length >= 8}
              onClick={() => setDraft((cur) => cur && cur.entries.length < 8
                ? { ...cur, entries: [...cur.entries, {
                    action: SHORTCUT_ACTION.DISCONNECT_PAD,
                    trigger: SHORTCUT_TRIGGER.PRESS,
                    enabled: false,
                    buttons: 0,
                    holdMs: 0,
                  }] }
                : cur)}
              className="rounded-md border border-zinc-700 px-3 py-2 text-xs hover:bg-zinc-800 disabled:opacity-40"
            >
              {fa ? 'افزودن میان‌بر' : 'Add shortcut'}
            </button>
          </div>
          {draft.entries.map((entry, i) => (
            <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={entry.enabled} onChange={(e) => update(i, { enabled: e.target.checked })} />
                  {fa ? 'فعال' : 'Enabled'}
                </label>
                <span className="text-xs text-muted-foreground">{fa ? 'عملکرد' : 'Action'} {i + 1}</span>
              </div>
              <Row label={fa ? 'عملکرد' : 'Action'}>
                <select className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm" value={entry.action} onChange={(e) => update(i, { action: Number(e.target.value) })}>
                  {ACTIONS.map((a) => <option key={a.id} value={a.id}>{fa ? a.fa : a.en}</option>)}
                </select>
              </Row>
              <Row label={fa ? 'ترکیب دکمه‌ها' : 'Button combo'}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 text-sm text-muted-foreground">{describeButtons(entry.buttons) || (fa ? 'ثبت نشده' : 'Not recorded')}</span>
                  <button type="button" className="rounded-md border border-zinc-700 px-3 py-2 text-xs hover:bg-zinc-800" onClick={() => setRecording(i)}>{recording === i ? (fa ? 'منتظر دکمه‌ها…' : 'Press combo…') : (fa ? 'ضبط ترکیب' : 'Record combo')}</button>
                </div>
              </Row>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Row label={fa ? 'نوع تحریک' : 'Trigger'}>
                  <select className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm" value={entry.trigger} onChange={(e) => update(i, { trigger: Number(e.target.value), holdMs: Number(e.target.value) === SHORTCUT_TRIGGER.HOLD ? Math.max(100, entry.holdMs || 1000) : 0 })}>
                    {TRIGGERS.map((v) => <option key={v.id} value={v.id}>{fa ? v.fa : v.en}</option>)}
                  </select>
                </Row>
                {entry.trigger === SHORTCUT_TRIGGER.HOLD && <Row label={fa ? 'مدت نگه‌داشتن (ms)' : 'Hold duration (ms)'}>
                  <input type="number" min={100} max={5000} step={100} className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm" value={entry.holdMs} onChange={(e) => update(i, { holdMs: Math.max(100, Math.min(5000, Number(e.target.value) || 100)) })} />
                </Row>}
              </div>
            </div>
          ))}
        </div>
        {conflict > 0 && <p className="text-sm text-red-400">{fa ? 'تداخل: ترکیب دکمه‌های میان‌برهای فعال با یکدیگر هم‌پوشانی دارد.' : 'Conflict: enabled shortcut combinations overlap and may trigger ambiguously.'}</p>}
        {recording !== null && <p className="text-sm text-amber-400">{fa ? 'اکنون Home را همراه یک یا چند دکمه دیگر روی دسته انتخاب‌شده فشار دهید.' : 'Press Home together with one or more other buttons on the selected controller.'}</p>}
        <div className="flex flex-wrap gap-2 pt-2">
          <button type="button" disabled={busy || conflict > 0} onClick={() => void save()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{busy ? (fa ? 'در حال ذخیره…' : 'Saving…') : (fa ? 'ذخیره تغییرات' : 'Save changes')}</button>
          <button type="button" onClick={reset} className="rounded-md border border-zinc-700 px-4 py-2 text-sm">{fa ? 'بازنشانی پیش‌فرض‌ها' : 'Reset defaults'}</button>
          {recording !== null && <button type="button" onClick={() => setRecording(null)} className="rounded-md border border-zinc-700 px-4 py-2 text-sm">{fa ? 'لغو ضبط' : 'Cancel recording'}</button>}
        </div>
      </Section>
      <Section title={fa ? 'میان‌برهای سیستمی ثابت' : 'Fixed system shortcuts'}>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Home hold 3s — Power off</li><li>Home double press — Reset</li>
          <li>Home + Start — Bluetooth pairing</li><li>Home + Share — Disconnect this controller</li>
          <li>{fa ? 'برای قطع اتصال انتخابی یا همه دسته‌ها، میان‌بر سفارشی با ترکیبی غیر از Home+Share بسازید.' : 'Use a custom combo other than Home+Share to disconnect this controller or all controllers.'}</li>
        </ul>
      </Section>
      <Section title={fa ? 'حرکت‌های تاچ‌پد' : 'Touchpad gestures'}>
        <p className="text-sm text-muted-foreground">{fa ? 'حرکت‌های Swipe فعلی OLED و تغییر رنگ Lightbar حفظ شده‌اند و مستقل از میان‌برهای دکمه‌ای عمل می‌کنند. سفارشی‌سازی Swipe و کلیک در مرحله بعدی موتور Gesture اضافه خواهد شد.' : 'Existing OLED navigation and per-controller Lightbar swipe behavior remain available independently. Custom swipe/click bindings are reserved for the next Gesture Engine iteration.'}</p>
      </Section>
    </div>
  )
}
