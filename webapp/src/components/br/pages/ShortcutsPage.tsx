'use client'

/**
 * Shortcuts — INTERACTIVE since v4.4:
 *   - Two comboboxes let the user pick which pad combo switches the OLED
 *     into screensaver mode and which returns to the main menu.
 *     Stored in the firmware MX KEYS slot (2 bytes, NVS), applied instantly.
 *   - The fixed firmware shortcuts (power off / reset / pairing / disconnect)
 *     and the touchpad gestures stay as reference tables.
 */
import { toast } from 'sonner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Section, PageHeader, Row, useT, BrSelect, NotReady } from '../shared'
import { useBr, activeBle } from '@/lib/br/store'
import { saveKeysCfg, type KeysCfg } from '@/lib/br/protocol'
import { KEY_COMBOS } from '@/lib/br/constants'

export function ShortcutsPage() {
  const t = useT()
  const lang = useBr((s) => s.lang)
  const keys = useBr((s) => s.keys)
  const setKeys = useBr((s) => s.setKeys)

  if (!keys) {
    return (
      <div className="space-y-4">
        <PageHeader titleKey="shortcuts" descKey="shortcutsDesc" />
        <NotReady />
      </div>
    )
  }

  const comboOptions = KEY_COMBOS.map((c) => ({ value: String(c.id), label: lang === 'fa' ? c.fa : c.en }))

  const commit = async (patch: Partial<KeysCfg>) => {
    const ble = activeBle()
    const next = { ...keys, ...patch }
    setKeys(next)
    if (!ble) return
    try {
      await saveKeysCfg(ble, next)
      toast.success(t('savedToast'))
    } catch (e) {
      toast.error(`${t('writeFailed')}: ${String((e as Error)?.message ?? e)}`)
    }
  }

  const combos = [
    { combo: t('scHold'), action: t('scPowerOff') },
    { combo: t('scDouble'), action: t('scReset') },
    { combo: t('scPairing'), action: t('scPairingA') },
    { combo: t('scShare'), action: t('scShareA') },
  ]

  const gestures = [
    { state: t('idleScreen'), g: t('scSwipe'), action: t('scSwipeA') },
    { state: t('idleScreen'), g: t('scSwipeUD'), action: t('scSwipeUDA') },
    { state: t('mainMenu'), g: t('scPageSwipe'), action: t('scPageSwipeA') },
    { state: t('mainMenu'), g: t('scSwipeUD'), action: t('scSwipeUDA') },
    { state: t('scTap'), action: t('scTapA') },
  ]

  return (
    <div className="space-y-4">
      <PageHeader titleKey="shortcuts" descKey="shortcutsDesc" />

      <Section title={t('combo')} desc={t('keysApplies')}>
        <Row label={t('keysSaver')} hint={t('keysSaverHint')}>
          <BrSelect
            value={String(keys.saverCombo)}
            onValueChange={(v) => void commit({ saverCombo: Number(v) })}
            ariaLabel={t('keysSaver')}
            className="w-52"
            options={comboOptions}
          />
        </Row>
        <Row label={t('keysMenu')} hint={t('keysMenuHint')}>
          <BrSelect
            value={String(keys.menuCombo)}
            onValueChange={(v) => void commit({ menuCombo: Number(v) })}
            ariaLabel={t('keysMenu')}
            className="w-52"
            options={comboOptions}
          />
        </Row>
      </Section>

      <Section title={t('fixedCombos')}>
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800">
              <TableHead className="w-1/2">{t('combo')}</TableHead>
              <TableHead>{t('action')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {combos.map((c, i) => (
              <TableRow key={i} className="border-zinc-800/60">
                <TableCell className="font-medium">{c.combo}</TableCell>
                <TableCell className="text-muted-foreground">{c.action}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section title={t('gesture')}>
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800">
              <TableHead className="w-24">{t('oledState')}</TableHead>
              <TableHead>{t('gesture')}</TableHead>
              <TableHead>{t('action')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {gestures.map((g, i) => (
              <TableRow key={i} className="border-zinc-800/60">
                <TableCell>
                  <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">{g.state}</span>
                </TableCell>
                <TableCell className="font-medium">{g.g}</TableCell>
                <TableCell className="text-muted-foreground">{g.action}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
    </div>
  )
}
