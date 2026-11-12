'use client'

import { useEffect, useState } from 'react'
import { FlaskConical, Radio } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { useBr, activeBle } from '@/lib/br/store'
import { getControllerState, type ControllerState } from '@/lib/br/protocol'
import { CONTROLLER_STICK_SCALE, CONTROLLER_TRIGGER_MIN } from '@/lib/br/constants'
import { PageHeader, useT } from '../shared'
import { ControllerCanvas, RawBtns } from '../ControllerCanvas'

const EMPTY: ControllerState = {
  btns: 0, lx: 0, ly: 0, rx: 0, ry: 0, l2: 0, r2: 0, valid: false,
}
const PORTS = [0, 1] /**  const PORTS = [0, 1, 2]  **/

export function ControllerTestPage() {
  const t = useT()
  const connected = useBr((s) => s.connected)
  const [monitoring, setMonitoring] = useState(false)
  const [port, setPort] = useState(0)
  const [state, setState] = useState<ControllerState>(EMPTY)
  const [axisMax, setAxisMax] = useState<number[]>([CONTROLLER_STICK_SCALE, CONTROLLER_STICK_SCALE, CONTROLLER_STICK_SCALE, CONTROLLER_STICK_SCALE])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!monitoring || !connected) return
    let active = true
    let busy = false

    const poll = async () => {
      if (busy || !active) return
      const ble = activeBle()
      if (!ble) return
      busy = true
      try {
        const next = await getControllerState(ble, port)
        if (active) {
          setState(next)
          setAxisMax((m) => [
            Math.max(m[0], Math.abs(next.lx)),
            Math.max(m[1], Math.abs(next.ly)),
            Math.max(m[2], Math.abs(next.rx)),
            Math.max(m[3], Math.abs(next.ry)),
          ])
          setError(null)
        }
      } catch (e) {
        if (active) {
          const message = (e as Error)?.message ?? String(e)
          if (message === 'CONTROLLER_STATE_UNSUPPORTED') {
            setError('unsupported')
            setMonitoring(false)
          } else {
            setError(message)
          }
        }
      } finally {
        busy = false
      }
    }

    void poll()
    const timer = setInterval(() => void poll(), 120)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [monitoring, connected, port])


  const selectPort = (next: number) => {
    setPort(next)
    setState(EMPTY)
    setAxisMax([CONTROLLER_STICK_SCALE, CONTROLLER_STICK_SCALE, CONTROLLER_STICK_SCALE, CONTROLLER_STICK_SCALE])
    setError(null)
  }

  return (
    <div className="space-y-4">
      <PageHeader titleKey="controllerTest" descKey="controllerTestDesc" />

      <Alert className="border-amber-500/40">
        <FlaskConical className="size-4" />
        <AlertTitle>{t('controllerExperimental')}</AlertTitle>
        <AlertDescription>{t('controllerExperimentalDesc')}</AlertDescription>
      </Alert>

      {error === 'unsupported' && (
        <Alert variant="destructive">
          <AlertTitle>{t('controllerTest')}</AlertTitle>
          <AlertDescription>{t('controllerStateUnsupported')}</AlertDescription>
        </Alert>
      )}
      {error && error !== 'unsupported' && (
        <Alert variant="destructive">
          <AlertTitle>{t('writeFailed')}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Radio className="size-4" />{t('controllerMonitor')}</CardTitle>
            <CardDescription>{monitoring ? t('controllerMonitoring') : t('controllerInactive')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <span className="text-sm">{t('controllerMonitor')}</span>
              <Switch checked={monitoring} disabled={!connected || error === 'unsupported'}
                onCheckedChange={(v) => {
                  setError(null)
                  if (!v) {
                    setState(EMPTY)
                    setAxisMax([CONTROLLER_STICK_SCALE, CONTROLLER_STICK_SCALE, CONTROLLER_STICK_SCALE, CONTROLLER_STICK_SCALE])
                  }
                  setMonitoring(v)
                }} />
            </div>
            <div>
              <div className="mb-2 text-xs text-muted-foreground">{t('port')}</div>
              <div className="flex gap-2">
                {PORTS.map((p) => (
                  <Button key={p} size="sm" variant={port === p ? 'default' : 'outline'}
                    aria-pressed={port === p} onClick={() => selectPort(p)}>
                    {t('port')} {p + 1}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2 border-t border-zinc-800 pt-3">
              <RawBtns state={state} />
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{t('controllerTriggers')}</span>
                <span className="flex gap-2">
                  <Badge variant="outline" className="font-mono">L2 {state.l2}</Badge>
                  <Badge variant="outline" className="font-mono">R2 {state.r2}</Badge>
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                L2/R2 &gt; {CONTROLLER_TRIGGER_MIN} → {t('controllerPressed')}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {state.valid ? t('controllerReceived') : t('controllerWaiting')}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('controllerTest')} — {t('port')} {port + 1}</CardTitle>
            <CardDescription>{state.valid ? t('controllerReceived') : t('controllerWaiting')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={monitoring && state.valid ? 'opacity-100' : 'opacity-55'}>
              <ControllerCanvas state={state} axisMax={axisMax} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
