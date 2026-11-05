'use client'

/**
 * Help — real-device usage guide, Web Bluetooth requirements (desktop +
 * Android) and the firmware protocol map this app speaks.
 */
import { Badge } from '@/components/ui/badge'
import { Section, PageHeader, useT } from '../shared'
import { useBr } from '@/lib/br/store'

const PROTOCOL: [string, string][] = [
  ['a01', 'global_cfg — 4 B: system, multitap, inquiry, banksel (a01 read/write)'],
  ['a02 / a03', 'port select + port data — dev_mode / acc_mode per port'],
  ['a06 / a09 / a0c', 'API version · firmware version · BDAddr'],
  ['a07 · 0x15', 'audio preview: [0x15, melody 0..26] — plays on the device buzzer'],
  ['a07 · 0x16', 'stop preview'],
  ['a07 · 0x37 / 0x38 / 0x39', 'deep sleep · ESP reset · factory reset'],
  ['a0d + a0e', 'MX slots: AUDIO(0) OLED(1) LED(2) IDLE(3) TIME(4) FEATURES(6) KEYS(7) — blob read/write, NVS-backed, applied live'],
]

export function HelpPage() {
  const t = useT()
  const lang = useBr((s) => s.lang)

  return (
    <div className="space-y-4">
      <PageHeader titleKey="help" />

      <Section title={lang === 'fa' ? 'اتصال — دسکتاپ' : 'Connect — desktop'}>
        <div className="space-y-2 text-sm leading-6">
          <p>{lang === 'fa'
            ? '۱. کروم را باز کنید و به آدرس http://localhost:3000 بروید (localhost بستر امن است).'
            : '1. Open Chrome and go to http://localhost:3000 (localhost is a secure context).'}</p>
          <p>{lang === 'fa'
            ? '۲. دکمه «اتصال به دستگاه» را بزنید و در پنجره بلوتوث، دستگاه BlueRetro را انتخاب کنید.'
            : '2. Click "Connect to device" and pick the BlueRetro device in the Bluetooth chooser.'}</p>
          <p>{lang === 'fa'
            ? '۳. اگر صفحه OLED متن به‌هم‌ریخته دارد: صفحه نمایشگر → رزولوشن ۱۲۸×۳۲ — فوراً اصلاح می‌شود.'
            : '3. If the OLED text is garbled: OLED Screen page → 128×32 — fixed instantly.'}</p>
        </div>
      </Section>

      <Section title={lang === 'fa' ? 'اتصال — اندروید' : 'Connect — Android'}>
        <div className="space-y-2 text-sm leading-6">
          <p>{lang === 'fa'
            ? 'Web Bluetooth به بستر امن نیاز دارد؛ باز کردن با IP شبکه (http://192.168.x.x:3000) به‌تنهایی کافی نیست:'
            : 'Web Bluetooth needs a secure context; opening via the LAN IP (http://192.168.x.x:3000) is not enough by itself:'}</p>
          <ol className="list-decimal ms-5 space-y-1">
            <li dir="ltr">chrome://flags/#unsafely-treat-insecure-origin-as-secure</li>
            <li dir="ltr">add http://192.168.x.x:3000 → Enable → Relaunch</li>
            <li>{lang === 'fa' ? 'بلوتوث و Location گوشی روشن باشد' : 'Enable Bluetooth and Location services on the phone'}</li>
          </ol>
          <p className="text-xs text-muted-foreground">{lang === 'fa'
            ? 'راه تمیزتر: اجرای سرور با HTTPS — npm run dev:https (گواهی self-signed؛ هشدار کروم را بپذیرید).'
            : 'Cleaner alternative: run the server with HTTPS — npm run dev:https (self-signed cert; accept the Chrome warning).'}</p>
        </div>
      </Section>

      <Section title="Protocol map — MethyleneX firmware (att_cfg.c / mx_config.h)">
        <div className="grid gap-2 text-sm">
          {PROTOCOL.map(([k, v]) => (
            <div key={k} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 rounded-lg border border-zinc-800 px-3 py-2">
              <Badge variant="outline" className="w-fit border-sky-900 text-sky-300 shrink-0 font-mono" dir="ltr">{k}</Badge>
              <span className="text-muted-foreground" dir="ltr">{v}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title={lang === 'fa' ? 'نکته‌ها' : 'Notes'}>
        <div className="space-y-2 text-sm leading-6 text-muted-foreground">
          <p>{lang === 'fa'
            ? '• همه تنظیمات MX در NVS دستگاه ذخیره می‌شوند و بعد از ریست هم می‌مانند؛ اسلات OLED/LED به‌صورت زنده اعمال می‌شوند.'
            : '• All MX settings persist in device NVS across reboots; the OLED and LED slots apply live on write.'}</p>
          <p>{lang === 'fa'
            ? '• پیش‌نمایش مرورگر فقط برای شنیدن ملودی‌هاست؛ صدای واقعی از بازر GPIO23 دستگاه پخش می‌شود.'
            : '• The browser preview is only for auditioning melodies; the real sound comes from the device buzzer (GPIO23).'}</p>
          <p>{lang === 'fa'
            ? '• ملودی‌ها ۰ تا ۲۶ شماره‌گذاری شده‌اند — همان ترتیب جدول ui.c فیرم‌ور.'
            : '• Melodies are indexed 0..26 — same order as the firmware ui.c table.'}</p>
        </div>
      </Section>
    </div>
  )
}
