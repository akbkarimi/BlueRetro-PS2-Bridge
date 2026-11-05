/**
 * Browser-side melody preview (WebAudio square wave — passive buzzer sim).
 * Independent from the device: lets you audition the 27 melodies without
 * hardware. The device itself previews through protocol.previewMelody().
 *
 * v3 fix: stop() no longer closes the AudioContext (closing it right after
 * creating it in play() made every preview silent). Oscillators are tracked
 * and stopped individually instead; the context is created lazily and kept
 * warm, with resume() handling the mobile autoplay policy on user tap.
 */
import { MELODIES, type Melody } from './melodies'

class PcAudio {
  private ctx: AudioContext | null = null
  private gain: GainNode | null = null
  private oscs: Set<OscillatorNode> = new Set()
  private playing = false
  volume = 60

  private ensureCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      this.ctx = new AC()
      this.gain = this.ctx.createGain()
      this.gain.gain.value = (this.volume / 100) * 0.25
      this.gain.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => { /* ignore */ })
    return this.ctx
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(100, v))
    if (this.gain && this.ctx && this.ctx.state === 'running') {
      this.gain.gain.setTargetAtTime((this.volume / 100) * 0.25, this.ctx.currentTime, 0.01)
    }
  }

  /** Stop every currently scheduled oscillator and kill the tail */
  stop() {
    this.oscs.forEach((o) => {
      try { o.stop() } catch { /* already stopped */ }
      try { o.disconnect() } catch { /* ignore */ }
    })
    this.oscs.clear()
    this.playing = false
  }

  /** Play one melody to completion (interrupts the previous one) */
  play(melodyId: number) {
    const m: Melody | undefined = MELODIES.find((x) => x.id === melodyId)
    if (!m || m.notes.length === 0) return
    const ctx = this.ensureCtx()
    if (!ctx || !this.gain) return
    this.stop()
    this.playing = true
    const t0 = ctx.currentTime + 0.05
    let t = t0
    for (const step of m.notes) {
      const dur = step.ms / 1000
      if (step.f > 0) {
        const osc = ctx.createOscillator()
        const g = ctx.createGain()
        osc.type = 'square'
        osc.frequency.value = step.f
        g.gain.setValueAtTime(0, t)
        g.gain.linearRampToValueAtTime(1, t + 0.005)
        g.gain.setValueAtTime(1, t + Math.max(0.005, dur - 0.015))
        g.gain.linearRampToValueAtTime(0, t + dur)
        osc.connect(g)
        g.connect(this.gain)
        osc.start(t)
        osc.stop(t + dur + 0.001)
        osc.onended = () => { this.oscs.delete(osc) }
        this.oscs.add(osc)
      }
      t += dur
    }
  }

  isPlaying() {
    return this.playing
  }
}

export const pcAudio = new PcAudio()
