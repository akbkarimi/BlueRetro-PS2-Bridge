'use client'

/**
 * BlueRetro MethyleneX WebApp v2 — shell: connect screen with Web Bluetooth
 * support detection, bilingual EN/FA navigation, page routing.
 * The virtual ESP32 simulator has been removed — real device only.
 */
import { useEffect } from 'react'
import {
  Gamepad2, MonitorSmartphone, Music, Palette, Zap, Settings2, Cpu,
  Radio, Table2, Bug, CircleHelp, House, Sun, Moon, Languages, Unplug,
  Loader2, Bluetooth, Usb, Info,
} from 'lucide-react'
import { useBr, type PageId } from '@/lib/br/store'
import { makeT, LANGS, type DictKey } from '@/lib/br/i18n'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { OledPreview } from './OledPreview'
import { HomePage } from './pages/HomePage'
import { DisplayPage } from './pages/DisplayPage'
import { SoundPage } from './pages/SoundPage'
import { ColorsPage } from './pages/ColorsPage'
import { ShortcutsPage } from './pages/ShortcutsPage'
import { PortsPage } from './pages/PortsPage'
import { AdvancePage } from './pages/AdvancePage'
import { SystemPage } from './pages/SystemPage'
import { ReferencePage } from './pages/ReferencePage'
import { DebugPage } from './pages/DebugPage'
import { HelpPage } from './pages/HelpPage'

const NAV: { id: PageId; icon: React.ComponentType<{ className?: string }>; key: DictKey; methylene?: boolean }[] = [
  { id: 'home', icon: House, key: 'home' },
  { id: 'display', icon: MonitorSmartphone, key: 'display', methylene: true },
  { id: 'sound', icon: Music, key: 'sound', methylene: true },
  { id: 'colors', icon: Palette, key: 'colors', methylene: true },
  { id: 'shortcuts', icon: Zap, key: 'shortcuts', methylene: true },
  { id: 'ports', icon: Radio, key: 'ports', methylene: true },
  { id: 'advance', icon: Settings2, key: 'advance' },
  { id: 'system', icon: Cpu, key: 'system' },
  { id: 'reference', icon: Table2, key: 'reference' },
  { id: 'debug', icon: Bug, key: 'debug' },
  { id: 'help', icon: CircleHelp, key: 'help' },
]

const PAGES: Record<PageId, React.ComponentType> = {
  home: HomePage, display: DisplayPage, sound: SoundPage, colors: ColorsPage,
  shortcuts: ShortcutsPage, ports: PortsPage, advance: AdvancePage,
  system: SystemPage, reference: ReferencePage, debug: DebugPage, help: HelpPage,
}

function webBtState(): 'ok' | 'insecure' | 'missing' {
  if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
    if (typeof window !== 'undefined' && window.isSecureContext === false) return 'insecure'
    return 'missing'
  }
  return 'ok'
}

function ConnectScreen() {
  const { connect, connecting, lang, dark, toggleDark, setLang, error } = useBr()
  const t = makeT(lang)
  const bt = webBtState()
  const insecure = bt !== 'ok'
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const isAndroid = /Android/i.test(ua)
  const isChrome = /Chrome|CriOS/i.test(ua) && !/SamsungBrowser|OPR\/|EdgA|Firefox|FxiOS/i.test(ua)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 bg-gradient-to-b from-[var(--mx-grad-a)] via-[var(--mx-grad-b)] to-[var(--mx-bg)] text-foreground p-6">
      <div className="absolute top-4 end-4 flex gap-2">
        <Button variant="outline" size="icon" onClick={toggleDark} aria-label="theme">
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button variant="outline" size="sm" className="gap-1 px-3" onClick={() => setLang(lang === 'fa' ? 'en' : 'fa')}>
          <Languages className="h-4 w-4" /> {LANGS.find((l) => l.id !== lang)?.label}
        </Button>
      </div>
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="w-20 h-20 rounded-2xl bg-[var(--mx-logo)] flex items-center justify-center shadow-[0_0_40px_rgba(30,110,201,0.35)]">
          <Gamepad2 className="h-11 w-11 text-sky-300" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">BlueRetro MethyleneX</h1>
        <p className="text-muted-foreground max-w-md">{t('tagline')}</p>
      </div>

      <OledPreview panelH={32} label="SSD1306 · 128×32 / 128×64" />

      <Card className="w-full max-w-md bg-zinc-900/70 border-zinc-800">
        <CardContent className="p-5 flex flex-col gap-3">
          <Button className="h-12 text-base gap-2" onClick={() => void connect()} disabled={connecting || insecure}>
            {connecting ? <Loader2 className="h-5 w-5 animate-spin" /> : insecure ? <Usb className="h-5 w-5" /> : <Bluetooth className="h-5 w-5" />}
            {connecting ? t('connecting') : t('connectReal')}
          </Button>

          {insecure && (
            <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-3 text-xs leading-5 text-amber-200 space-y-2" role="alert">
              <div className="flex items-center gap-1.5 font-semibold">
                <Info className="h-4 w-4" /> {t('btMissing')}
              </div>
              <p>{t('btMissingWhy')}</p>
              {isAndroid ? (
                <p dir="ltr" className="font-mono text-[11px] bg-black/30 rounded p-2 break-all">npx next dev --experimental-https  →  https://PC-IP:3000</p>
              ) : null}
              <p>{isAndroid ? t('btFixAndroid') : t('btFixDesktop')}</p>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-400 text-center">
              {error === 'NO_DEVICE_SELECTED' ? t('noDeviceSelected')
                : error === 'connection-lost' ? t('connectionLost')
                : error === 'WEB_BT_MISSING' ? t('btMissing')
                : error === 'BT_SECURITY' ? (lang === 'fa'
                  ? 'اتصال به سرویس بلوتوث مسدود شد — صفحه را با localhost یا HTTPS باز کنید.'
                  : 'Bluetooth service blocked — open the page over localhost or HTTPS.')
                : error === 'BT_SERVICE' ? (lang === 'fa'
                  ? 'سرویس BlueRetro روی دستگاه پیدا نشد — مطمئن شوید فیرم‌ور MethyleneX فلش شده و دستگاه روشن است.'
                  : 'BlueRetro service not found — make sure the MethyleneX firmware is flashed and the device is on.')
                : error}
            </p>
          )}
          <Separator className="bg-zinc-800" />
          <p className="text-xs text-muted-foreground leading-5 text-center">
            {lang === 'fa'
              ? 'دستگاه واقعی BlueRetro MethyleneX با Web Bluetooth کروم — در آدرس localhost یا HTTPS اجرا کنید.'
              : 'Real BlueRetro MethyleneX device via Chrome Web Bluetooth — serve over localhost or HTTPS.'}
          </p>
          {isAndroid && !isChrome && insecure && (
            <p className="text-xs text-amber-300 text-center">
              {lang === 'fa'
                ? 'مرورگر فعلی از Web Bluetooth پشتیبانی نمی‌کند — حتماً از Google Chrome استفاده کنید (نه Samsung Internet یا مرورگرهای مشابه).'
                : 'This browser does not support Web Bluetooth — please use Google Chrome (not Samsung Internet or similar).'}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Shell() {
  const { lang, dark, page, setPage, fw, api, bdaddr, oled, disconnect, toggleDark, setLang } = useBr()
  const t = makeT(lang)
  const Active = PAGES[page]
  const dir = lang === 'fa' ? 'rtl' : 'ltr'

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = dir
  }, [lang, dir])

  return (
    <div className="min-h-screen flex flex-col bg-[var(--mx-bg)] text-foreground">
      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-[var(--mx-header)] backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 h-14 flex items-center gap-3">
          <Gamepad2 className="h-6 w-6 text-sky-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-4 truncate">BlueRetro MethyleneX</div>
            <div className="text-[11px] text-muted-foreground truncate" dir="ltr">
              {fw} · API {api} · {bdaddr}
            </div>
          </div>
          <div className="ms-auto flex items-center gap-2">
            {oled && (
              <Badge variant="outline" className="hidden md:inline-flex border-zinc-700 text-zinc-400" dir="ltr">
                OLED {oled.panelH === 32 ? '128×32' : '128×64'}
              </Badge>
            )}
            <Button variant="ghost" size="icon" onClick={toggleDark} aria-label="theme">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="sm" className="gap-1 px-2" onClick={() => setLang(lang === 'fa' ? 'en' : 'fa')}>
              <Languages className="h-4 w-4" /> {LANGS.find((l) => l.id !== lang)?.label}
            </Button>
            <Button variant="ghost" size="icon" onClick={disconnect} aria-label={t('disconnect')} title={t('disconnect')}>
              <Unplug className="h-4 w-4 text-red-400" />
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl flex-1 flex gap-4 px-3 sm:px-4 py-4">
        {/* desktop nav */}
        <nav className="hidden lg:flex flex-col gap-1 w-56 shrink-0" aria-label="pages">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => setPage(n.id)}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors text-start',
                page === n.id ? 'bg-sky-900/40 text-sky-200 border border-sky-800/60' : 'hover:bg-zinc-900 border border-transparent',
              )}
            >
              <n.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{t(n.key)}</span>
              {n.methylene && <Badge className="ms-auto bg-sky-950 text-sky-300 border border-sky-900 text-[9px] px-1 py-0">MX</Badge>}
            </button>
          ))}
        </nav>

        {/* mobile nav */}
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-zinc-800 bg-[var(--mx-header)] backdrop-blur">
          <ScrollArea className="w-full">
            <div className="flex gap-1 px-2 py-2 w-max">
              {NAV.map((n) => (
                <button
                  key={n.id}
                  onClick={() => setPage(n.id)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-[10px] min-w-[60px]',
                    page === n.id ? 'bg-sky-900/40 text-sky-200' : 'text-muted-foreground',
                  )}
                >
                  <n.icon className="h-4 w-4" />
                  {t(n.key)}
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        <main className="flex-1 min-w-0 pb-28 lg:pb-0" data-testid="page-content" key={page}>
          <Active />
        </main>
      </div>

      <footer className="mt-auto border-t border-zinc-800/80 bg-[var(--mx-header)]/80">
        <div className="mx-auto max-w-7xl px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>BlueRetro MethyleneX WebApp v4.4 — real device config tool</span>
          <span dir="ltr">Service 56830f56…799a00 · a01–a0e</span>
        </div>
      </footer>
    </div>
  )
}

export default function BrApp() {
  const connected = useBr((s) => s.connected)
  const dark = useBr((s) => s.dark)

  /* The theme class lives on <html> so shadcn portals (selects, dialogs)
     get it too — that is what makes the day/night switch actually work. */
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  return connected ? <Shell /> : <ConnectScreen />
}
