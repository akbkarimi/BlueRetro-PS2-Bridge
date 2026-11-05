'use client'

/**
 * System Manager — firmware reset/restore commands (a07: 0x37 / 0x38 / 0x39)
 * and device identity.
 */
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Moon, RotateCw, Factory, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Section, PageHeader, Row, useT } from '../shared'
import { useBr, activeBle } from '@/lib/br/store'
import { sendDeepSleep, sendEspReset, sendFactoryReset } from '@/lib/br/protocol'
import { getHardwareId, updateFirmware } from '@/lib/br/ota'

export function SystemPage() {
  const t = useT()
  const fw = useBr((s) => s.fw)
  const api = useBr((s) => s.api)
  const bdaddr = useBr((s) => s.bdaddr)
  const connected = useBr((s) => s.connected)

  const [otaFile, setOtaFile] = useState<File | null>(null)
  const [otaProgress, setOtaProgress] = useState(0)
  const [otaRunning, setOtaRunning] = useState(false)

  const otaAbortRef = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Stop the transfer if the BLE connection is lost.
  useEffect(() => {
    if (!connected && otaAbortRef.current) {
      otaAbortRef.current.abort()
    }
  }, [connected])

  const [hwIdCheck, setHwIdCheck] = useState<string | null>(null)
  const [hwIdChecking, setHwIdChecking] = useState(false)
  const [legacyHwSelection, setLegacyHwSelection] = useState<'' | 'BRHW1' | 'BRHW2'>('')

  const checkHardwareId = async () => {
    const ble = activeBle()
    if (!ble || hwIdChecking) return

    setHwIdChecking(true)
    setHwIdCheck(null)

    try {
      const id = await getHardwareId(ble)
      setHwIdCheck(id)
      toast.success(`Hardware ID: ${id}`)
    } catch (error) {
      console.error('Hardware ID check failed:', error)
      setHwIdCheck('READ FAILED')
      toast.error('Hardware ID read failed')
    } finally {
      setHwIdChecking(false)
    }
  }

  const startOta = async () => {
    const ble = activeBle()

    if (!connected || !ble) {
      toast.error(t('otaNotConnected'))
      return
    }

    if (!otaFile || otaRunning) return

    const controller = new AbortController()
    otaAbortRef.current = controller
    setOtaRunning(true)
    setOtaProgress(0)

    try {
      await updateFirmware(
        ble,
        otaFile,
        setOtaProgress,
        controller.signal,
        legacyHwSelection || undefined,
      )

      toast.success(t('otaSuccess'))
      setOtaFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (error) {
      const code = String((error as Error)?.message ?? error)

      if (code === 'OTA_CANCELLED') {
        if (!useBr.getState().connected) {
          toast.error(t('otaConnectionLost'))
        } else {
          toast.info(t('otaCancelled'))
        }
      } else {
        const messages: Record<string, string> = {
          OTA_INVALID_FILE_FORMAT: t('otaInvalidFileFormat'),
          OTA_INVALID_FILE_SIZE: t('otaInvalidFileSize'),
          OTA_HARDWARE_MISMATCH: t('otaHardwareMismatch'),
          OTA_HARDWARE_SELECTION_REQUIRED: t('otaSelectHardware'),
        }

        toast.error(
          messages[code] ?? `${t('otaFailed')}: ${code}`,
        )
      }
    } finally {
      if (otaAbortRef.current === controller) {
        otaAbortRef.current = null
      }
      setOtaRunning(false)
    }
  }

  const run = (fn: (ble: NonNullable<ReturnType<typeof activeBle>>) => Promise<void>) => async () => {
    const ble = activeBle()
    if (!ble) return
    try { await fn(ble) } catch { /* device resets mid-request; ignore */ }
  }

  return (
    <div className="space-y-4">
      <PageHeader titleKey="system" descKey="systemDesc" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t('system')}>
          <div className="grid gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="gap-1.5 border-zinc-700">
                  <Moon className="h-4 w-4" /> {t('deepSleep')} <span className="font-mono text-[10px] text-muted-foreground">0x37</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-zinc-900 border-zinc-800">
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('deepSleep')}</AlertDialogTitle>
                  <AlertDialogDescription>{t('deepSleepHint')}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="border-zinc-700">{t('stop')}</AlertDialogCancel>
                  <AlertDialogAction onClick={run(sendDeepSleep)}>{t('yes')}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="gap-1.5 border-zinc-700">
                  <RotateCw className="h-4 w-4" /> {t('espReset')} <span className="font-mono text-[10px] text-muted-foreground">0x38</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-zinc-900 border-zinc-800">
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('espReset')}</AlertDialogTitle>
                  <AlertDialogDescription>{t('confirm')}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="border-zinc-700">{t('stop')}</AlertDialogCancel>
                  <AlertDialogAction onClick={run(sendEspReset)}>{t('yes')}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="gap-1.5">
                  <Factory className="h-4 w-4" /> {t('factoryReset')} <span className="font-mono text-[10px] opacity-70">0x39</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-zinc-900 border-zinc-800">
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('factoryReset')}</AlertDialogTitle>
                  <AlertDialogDescription>{t('factoryHint')}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="border-zinc-700">{t('stop')}</AlertDialogCancel>
                  <AlertDialogAction onClick={run(sendFactoryReset)}>{t('yes')}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </Section>

        <Section title={t('deviceInfo')}>
          <Row label={t('firmware')}><span className="font-mono text-xs" dir="ltr">{fw ?? '—'}</span></Row>
          <Row label={t('apiVersion')}><span className="font-mono text-xs" dir="ltr">{api ?? '—'}</span></Row>
          <Row label={t('bdaddr')}><span className="font-mono text-xs" dir="ltr">{bdaddr ?? '—'}</span></Row>
        </Section>
      </div>

      <Section title={t('otaTitle')} desc={t('otaDesc')}>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-zinc-700 p-3">
            <Button
              type="button"
              variant="outline"
              disabled={!connected || hwIdChecking}
              onClick={() => void checkHardwareId()}
            >
              {hwIdChecking ? 'Reading hardware ID…' : 'Read hardware ID'}
            </Button>
            {hwIdCheck && (
              <span className="font-mono text-sm" dir="ltr">
                {hwIdCheck === 'LEGACY_ABI_2'
                  ? t('otaLegacyFirmware')
                  : hwIdCheck}
              </span>
            )}
          </div>

          {hwIdCheck === 'LEGACY_ABI_2' && (
            <div className="space-y-2">
              <label htmlFor="ota-legacy-hardware" className="text-sm font-medium">
                {t('otaSelectHardware')}
              </label>
              <select
                id="ota-legacy-hardware"
                value={legacyHwSelection}
                onChange={(event) =>
                  setLegacyHwSelection(event.target.value as '' | 'BRHW1' | 'BRHW2')
                }
                disabled={!connected || otaRunning}
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                dir="ltr"
              >
                <option value="">{t('otaChooseHardware')}</option>
                <option value="BRHW1">HW1</option>
                <option value="BRHW2">HW2</option>
              </select>
            </div>
          )}
          <p className="text-xs text-amber-400/90">
            {t('otaWarning')}
          </p>

          <div className="space-y-2">
            <label
              htmlFor="ota-firmware-file"
              className="text-sm font-medium"
            >
              {t('otaSelectFile')}
            </label>

            <input
              ref={fileInputRef}
              id="ota-firmware-file"
              type="file"
              accept=".bin,application/octet-stream"
              disabled={!connected || otaRunning}
              onChange={(event) => {
                const selected = event.target.files?.[0] ?? null
                setOtaFile(selected)
                setOtaProgress(0)
              }}
              className="block w-full text-sm text-muted-foreground
                file:mr-3 file:rounded-md file:border-0
                file:bg-zinc-800 file:px-3 file:py-2
                file:text-sm file:text-zinc-100
                hover:file:bg-zinc-700
                disabled:opacity-50"
              dir="ltr"
            />

            {otaFile ? (
              <p className="text-xs text-muted-foreground break-all" dir="ltr">
                {otaFile.name} · {(otaFile.size / (1024 * 1024)).toFixed(2)} MiB
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t('otaNoFile')}
              </p>
            )}
          </div>

          {otaRunning && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span>{t('otaProgress')}</span>
                <span className="font-mono" dir="ltr">
                  {otaProgress}%
                </span>
              </div>
              <Progress
                value={otaProgress}
                aria-label={t('otaProgress')}
              />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  disabled={!connected || !otaFile || otaRunning}
                  className="gap-2"
                >
                  <Upload className="h-4 w-4" />
                  {t('otaStart')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-zinc-900 border-zinc-800">
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('otaConfirmTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('otaConfirmDesc')}
                    {otaFile && (
                      <span className="mt-2 block break-all font-mono" dir="ltr">
                        {otaFile.name}
                      </span>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="border-zinc-700">
                    {t('stop')}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => void startOta()}
                    disabled={!connected || !otaFile || otaRunning}
                  >
                    {t('otaStart')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {otaRunning && (
              <Button
                variant="outline"
                className="gap-2 border-zinc-700"
                onClick={() => otaAbortRef.current?.abort()}
              >
                <X className="h-4 w-4" />
                {t('otaCancel')}
              </Button>
            )}
          </div>

          {!connected && (
            <p className="text-xs text-muted-foreground">
              {t('otaNotConnected')}
            </p>
          )}
        </div>
      </Section>
    </div>
  )
}
