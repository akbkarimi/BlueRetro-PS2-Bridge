'use client'

/**
 * Sound Config — buzzer melodies per system event, stored in the firmware
 * MX AUDIO slot (8 bytes, NVS). Preview plays on the DEVICE via the buzzer
 * (a07 command 0x15, melody index 0..26) — the Bluetooth icon triggers it.
 * Browser (WebAudio) preview was removed in v4.4: it never worked reliably,
 * and the device preview is the sound the user actually gets.
 */
import { toast } from 'sonner'
import { Square, Volume2, Bluetooth } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Section, PageHeader, Row, useT, BrSelect, NotReady, type BrSelectGroup } from '../shared'
import { useBr, activeBle } from '@/lib/br/store'
import { saveAudioCfg, previewMelody, stopMelodyPreview, type AudioCfg } from '@/lib/br/protocol'
import { AUDIO_EVENTS, type AudioEventField } from '@/lib/br/constants'
import { MELODIES, MELODY_CATEGORIES, melodyDuration } from '@/lib/br/melodies'

export function SoundPage() {
  const t = useT()
  const lang = useBr((s) => s.lang)
  const audio = useBr((s) => s.audio)
  const setAudio = useBr((s) => s.setAudio)

  if (!audio) {
    return (
      <div className="space-y-4">
        <PageHeader titleKey="sound" descKey="soundDesc" />
        <NotReady />
      </div>
    )
  }

  const commit = async (patch: Partial<AudioCfg>) => {
    const ble = activeBle()
    const next = { ...audio, ...patch }
    setAudio(next)
    if (!ble) return
    try {
      await saveAudioCfg(ble, next)
      toast.success(t('savedToast'))
    } catch (e) {
      toast.error(`${t('writeFailed')}: ${String((e as Error)?.message ?? e)}`)
    }
  }

  const melodyPicker = (value: number, onChange: (v: number) => void) => {
    const groups: BrSelectGroup[] = MELODY_CATEGORIES.map((g) => ({
      label: lang === 'fa' ? g.fa : g.en,
      options: MELODIES.filter((m) => m.cat === g.cat).map((m) => ({ value: String(m.id), label: `${m.id}. ${m.label}` })),
    }))
    return (
      <BrSelect
        value={String(value)}
        onValueChange={(v) => onChange(Number(v))}
        groups={groups}
        ariaLabel="melody"
        className="w-44"
      />
    )
  }

  const playOnDevice = async (id: number) => {
    const ble = activeBle()
    if (!ble) return
    try { await previewMelody(ble, id) } catch (e) {
      toast.error(`${t('writeFailed')}: ${String((e as Error)?.message ?? e)}`)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader titleKey="sound" descKey="soundDesc" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t('event')} desc={t('soundEventsHint')}>
          <Row label={t('audioEnable')}>
            <Switch checked={audio.enabled} onCheckedChange={(v) => void commit({ enabled: v })} />
          </Row>
          <Row label={t('volume')} hint={`${audio.volume}%`}>
            <div className="flex items-center gap-2 w-44">
              <Volume2 className="h-4 w-4 text-muted-foreground" />
              <Slider
                value={[audio.volume]} min={0} max={100} step={5}
                onValueChange={(v) => setAudio({ ...audio, volume: v[0] })}
                onValueCommit={(v) => void commit({ volume: v[0] })}
              />
            </div>
          </Row>

          {AUDIO_EVENTS.map((e) => (
            <Row key={e.field} label={lang === 'fa' ? e.fa : e.en}>
              <div className="flex items-center gap-2">
                {melodyPicker(audio[e.field], (v) => void commit({ [e.field]: v } as Partial<AudioCfg>))}
                <Button
                  size="icon" variant="outline" className="h-8 w-8 border-zinc-700"
                  title={t('previewDevice')}
                  onClick={() => void playOnDevice(audio[e.field])}
                >
                  <Bluetooth className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Row>
          ))}

          <Row label={t('stop')}>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-8 gap-1 border-zinc-700" onClick={async () => {
                const ble = activeBle()
                if (ble) { try { await stopMelodyPreview(ble) } catch { /* ignore */ } }
              }}>
                <Square className="h-3.5 w-3.5" /> {t('stop')}
              </Button>
            </div>
          </Row>
        </Section>

        <Section title={`${t('melody')} — 27`}>
          <div className="max-h-96 overflow-y-auto rounded-lg border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-zinc-900">
                <tr className="text-start text-xs text-muted-foreground border-b border-zinc-800">
                  <th className="p-2 text-start w-10" dir="ltr">#</th>
                  <th className="p-2 text-start" dir="ltr">NAME</th>
                  <th className="p-2 text-end w-12"></th>
                </tr>
              </thead>
              <tbody>
                {MELODIES.map((m) => (
                  <tr key={m.id} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30">
                    <td className="p-2 text-muted-foreground" dir="ltr">{m.id}</td>
                    <td className="p-2" dir="ltr">
                      {m.label}
                      <span className="ms-2 text-[10px] text-muted-foreground">{melodyDuration(m)} ms</span>
                    </td>
                    <td className="p-2 text-end">
                      <Button size="icon" variant="ghost" className="h-7 w-7" title={t('previewDevice')}
                        onClick={() => void playOnDevice(m.id)}>
                        <Bluetooth className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </div>
  )
}
