'use client'

/**
 * Reference — the ESP32 pinout and spec-sheet tables (pinout sheet +
 * shortcut/gesture summaries) used by this build.
 */
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Section, PageHeader, useT } from '../shared'

const PINOUT: { head: number; io: number; dir: string; fn: string; note: string }[] = [
  { head: 0, io: 0, dir: 'input', fn: 'ESP32 boot button (pair button)', note: 'Idle high' },
  { head: 1, io: 2, dir: 'Output', fn: 'Port status LED — Controller port 1 — LED', note: '3.3v level' },
  { head: 2, io: 4, dir: 'Output', fn: 'Port status LED — Controller port 2 — LED', note: '3.3v level' },
  { head: 3, io: 5, dir: 'Output', fn: 'Controller port 2 — System Pin 6 — P2_DTR', note: 'Player 2 ATTENTION' },
  { head: 4, io: 14, dir: 'Output', fn: 'Console Power / Reset (PWR/RST)', note: 'polarity varies based on system' },
  { head: 5, io: 15, dir: 'Output', fn: 'BlueRetro status — LED', note: '3.3v level' },
  { head: 6, io: 17, dir: 'Output', fn: 'SCL — oled SSD1306', note: '128*64 or 128*32 (I2C 0x3c)' },
  { head: 7, io: 18, dir: 'Output', fn: 'SDA — oled SSD1306', note: '128*64 or 128*32 (I2C 0x3c)' },
  { head: 8, io: 19, dir: 'input', fn: 'Controller port 1 — System Pin 1 — P1_RXD', note: 'Player 1 DATA' },
  { head: 9, io: 21, dir: 'input', fn: 'Controller port 1 — System Pin 9 — P1_DSR', note: 'Player 1 ACKNOWLEDGE' },
  { head: 10, io: 22, dir: 'input', fn: 'Controller port 2 — System Pin 1 — P2_RXD', note: 'Player 2 DATA' },
  { head: 11, io: 23, dir: 'Output', fn: 'Passive buzzer — audio feedback (MethyleneX)', note: '100Ω series resistor' },
  { head: 12, io: 25, dir: 'input', fn: 'Controller port 2 — System Pin 9 — P2_DSR', note: 'Player 2 ACKNOWLEDGE' },
  { head: 13, io: 26, dir: 'Output', fn: 'Controller port 2 — System Pin 7 — P2_SCK', note: 'Player 2 CLOCK' },
  { head: 14, io: 27, dir: 'Output', fn: 'Controller port 2 — System Pin 2 — P2_TXD', note: 'Player 2 COMMAND' },
  { head: 15, io: 32, dir: 'Output', fn: 'Controller port 1 — System Pin 2 — P1_TXD', note: 'Player 1 COMMAND' },
  { head: 16, io: 33, dir: 'Output', fn: 'Controller port 1 — System Pin 7 — P1_SCK', note: 'Player 1 CLOCK' },
  { head: 17, io: 34, dir: 'Output', fn: 'Controller port 1 — System Pin 6 — P1_DTR', note: 'Player 1 ATTENTION' },
  { head: 18, io: 35, dir: 'Input', fn: 'Controller port 1 detect', note: '3.3v, low: port used, high: free' },
  { head: 19, io: 36, dir: 'Input', fn: 'Controller port 2 detect', note: '3.3v, low: port used, high: free' },
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
          Direction convention: controller-port lines (ATT/CLK/CMD/DATA/ACK) are shown from the console&apos;s point of view —
          the ESP32 acts as the controller side, so ATT/CLK/CMD are inputs to the ESP32 (GPIO34 input-only) and DATA/ACK are
          driven by the ESP32 as open-drain. System signals (boot button, LEDs, OLED, buzzer, PWR/RST, port detect) are shown
          from the ESP32&apos;s point of view.
        </p>
      </Section>

      <Section title="I2C / peripherals">
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-lg border border-zinc-800 p-3">
            <div className="font-medium" dir="ltr">OLED SSD1306 — I2C 0x3C</div>
            <div className="text-xs text-muted-foreground">SCL GPIO17 · SDA GPIO18 · 128×32 / 128×64 selectable</div>
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
            <div className="font-medium" dir="ltr">Port detect — GPIO35/36</div>
            <div className="text-xs text-muted-foreground">low: port used · high: port free</div>
          </div>
        </div>
      </Section>
    </div>
  )
}
