'use client'

/**
 * Reference — the ESP32 pinout and spec-sheet tables (pinout sheet +
 * shortcut/gesture summaries) used by this build.
 */
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Section, PageHeader, useT } from '../shared'

const PINOUT: { head: number; io: number; dir: string; fn: string; note: string }[] = [
  { head: 0, io: 0, dir: 'Input', fn: 'ESP32 BOOT / Pair button', note: 'Active low · internal pull-up' },
  { head: 1, io: 2, dir: 'Output', fn: 'Bluetooth controller port 1 status LED', note: 'Controller connection indicator' },
  { head: 2, io: 4, dir: 'Output', fn: 'Bluetooth controller port 2 status LED', note: 'Controller connection indicator' },
  { head: 3, io: 5, dir: 'Input', fn: 'PS2 controller port 2 — ATT / P2_DTR', note: 'Console ATTENTION signal' },
  { head: 4, io: 12, dir: 'Output', fn: 'PS2 controller port 1 — Analog mode LED', note: 'Owned by ps_spi.c · ESP32 strapping pin' },
  { head: 5, io: 13, dir: 'Output', fn: 'Console POWER ON control', note: 'Power-control output' },
  { head: 6, io: 14, dir: 'Output', fn: 'Console RESET control', note: 'Reset pulse output' },
  { head: 7, io: 15, dir: 'Output', fn: 'PS2 controller port 2 — Analog mode LED', note: 'Owned by ps_spi.c · ESP32 strapping pin' },
  { head: 8, io: 16, dir: 'Output', fn: 'Console POWER OFF control', note: 'Power-control output' },
  { head: 9, io: 17, dir: 'I/O · open-drain', fn: 'OLED SSD1306 — I²C SCL', note: '128×32 display · address 0x3C' },
  { head: 10, io: 18, dir: 'I/O · open-drain', fn: 'OLED SSD1306 — I²C SDA', note: '128×32 display · address 0x3C' },
  { head: 11, io: 19, dir: 'Output · open-drain', fn: 'PS2 controller port 1 — DATA / P1_RXD', note: 'Controller data line' },
  { head: 12, io: 21, dir: 'Output · open-drain', fn: 'PS2 controller port 1 — ACK / P1_DSR', note: 'Controller acknowledge line' },
  { head: 13, io: 22, dir: 'Output · open-drain', fn: 'PS2 controller port 2 — DATA / P2_RXD', note: 'Controller data line' },
  { head: 14, io: 23, dir: 'Output', fn: 'Passive buzzer', note: 'Audio feedback · 100 Ω series resistor' },
  { head: 15, io: 25, dir: 'Output · open-drain', fn: 'PS2 controller port 2 — ACK / P2_DSR', note: 'Controller acknowledge line' },
  { head: 16, io: 26, dir: 'Input', fn: 'PS2 controller port 2 — CLK / P2_SCK', note: 'Console CLOCK signal' },
  { head: 17, io: 27, dir: 'Input', fn: 'PS2 controller port 2 — CMD / P2_TXD', note: 'Console COMMAND signal' },
  { head: 18, io: 32, dir: 'Input', fn: 'PS2 controller port 1 — CMD / P1_TXD', note: 'Console COMMAND signal' },
  { head: 19, io: 33, dir: 'Input', fn: 'PS2 controller port 1 — CLK / P1_SCK', note: 'Console CLOCK signal' },
  { head: 20, io: 34, dir: 'Input', fn: 'PS2 controller port 1 — ATT / P1_DTR', note: 'Input-only GPIO · Console ATTENTION signal' },
  { head: 21, io: 35, dir: 'Input', fn: 'Controller port 1 detect', note: 'Input-only GPIO · low: port used, high: free' },
  { head: 22, io: 36, dir: 'Input', fn: 'Controller port 2 detect', note: 'Input-only GPIO · low: port used, high: free' },
  { head: 23, io: 39, dir: 'Input', fn: 'Console power sense', note: 'Input-only GPIO · power-state sensing' },
]

export function ReferencePage() {
  const t = useT()
  return (
    <div className="space-y-4">
      <PageHeader titleKey="reference" descKey="refDesc" />

      <Section title="ESP32 pinout">
        <div className="max-h-96 overflow-y-auto rounded-lg border border-zinc-800">
          <Table>
            <TableHeader className="sticky top-0 bg-zinc-900">
              <TableRow className="border-zinc-800">
                <TableHead className="w-14" dir="ltr">{t('gpio')}</TableHead>
                <TableHead className="w-20" dir="ltr">{t('direction')}</TableHead>
                <TableHead>{t('function')}</TableHead>
                <TableHead className="text-muted-foreground">{t('note')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {PINOUT.map((p) => (
                <TableRow key={p.head} className="border-zinc-800/60">
                  <TableCell className="font-mono" dir="ltr">{p.io}</TableCell>
                  <TableCell className="text-xs text-muted-foreground" dir="ltr">{p.dir}</TableCell>
                  <TableCell className="text-sm">{p.fn}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.note}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Direction is from the ESP32&apos;s point of view. ATT/CLK/CMD are inputs; DATA/ACK are driven open-drain. GPIO34–39 are input-only. GPIO12 and GPIO15 are dedicated to the PS2 analog-mode LEDs, not general status LEDs.
        </p>
      </Section>

      <Section title="I2C / peripherals">
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-lg border border-zinc-800 p-3">
            <div className="font-medium" dir="ltr">OLED SSD1306 — I2C 0x3C</div>
            <div className="text-xs text-muted-foreground">SCL GPIO17 · SDA GPIO18 · 128×32</div>
          </div>
          <div className="rounded-lg border border-zinc-800 p-3">
            <div className="font-medium" dir="ltr">OLED System Status page</div>
            <div className="text-xs text-muted-foreground">READY / PAIRING / ERROR · connected controller count · navigable with the OLED page shortcuts</div>
          </div>
          <div className="rounded-lg border border-zinc-800 p-3">
            <div className="font-medium" dir="ltr">Passive buzzer — GPIO23</div>
            <div className="text-xs text-muted-foreground">100 Ω series resistor · 27 melodies · event queue</div>
          </div>
          <div className="rounded-lg border border-zinc-800 p-3">
            <div className="font-medium" dir="ltr">PWR/RST — GPIO14</div>
            <div className="text-xs text-muted-foreground">Console power / reset · polarity per system</div>
          </div>
          <div className="rounded-lg border border-zinc-800 p-3">
            <div className="font-medium" dir="ltr">PS2 Analog LEDs — GPIO12 / GPIO15</div>
            <div className="text-xs text-muted-foreground">Port 1: GPIO12 · Port 2: GPIO15 · indicate each controller&apos;s analog mode</div>
          </div>
          <div className="rounded-lg border border-zinc-800 p-3">
            <div className="font-medium" dir="ltr">Port detect — GPIO35/36</div>
            <div className="text-xs text-muted-foreground">low: port used · high: port free</div>
          </div>
        </div>
      </Section>
    </div>
  )
}
