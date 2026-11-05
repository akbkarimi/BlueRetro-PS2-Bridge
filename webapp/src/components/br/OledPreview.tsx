'use client'

/**
 * Schematic OLED preview — a static mock of the SSD1306 panel drawn from
 * the device's OLED config (panel height, rotation, idle mode). Purely
 * illustrative; the real pixels live on the device.
 */
import { useEffect, useRef } from 'react'

export function OledPreview({ panelH, rotation, label }: {
  panelH: number | null
  rotation?: number
  label?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const h = panelH === 32 ? 32 : 64

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const scale = canvas.width / 128
    ctx.fillStyle = '#0c0f0d'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#1d2b23'
    ctx.lineWidth = 1
    // fake content: title bar + lines, half density for 32px panels
    ctx.fillStyle = '#8fd0a8'
    ctx.fillRect(4 * scale, 4 * scale, 50 * scale, 7 * scale)
    ctx.fillStyle = '#3d5a4a'
    const lines = h === 32 ? 2 : 5
    for (let i = 0; i < lines; i++) {
      ctx.fillRect(4 * scale, (16 + i * 9) * scale, (i % 2 === 0 ? 84 : 60) * scale, 4 * scale)
    }
    ctx.fillStyle = '#58806b'
    ctx.fillRect(96 * scale, (h - 12) * scale, 28 * scale, 8 * scale)
    if (rotation === 1) {
      // simple hint stripe for 180°
      ctx.fillStyle = '#22402f'
      ctx.fillRect(0, 0, canvas.width, 2)
    }
  }, [h, rotation, label])

  return (
    <div className="inline-flex flex-col items-center gap-2">
      <div className="rounded-xl border-4 border-zinc-800 bg-[#0c0f0d] shadow-[0_0_24px_rgba(120,255,180,0.12)] p-1">
        <canvas ref={ref} width={128 * 2} height={h * 2} data-testid="oled-canvas" className="block" />
      </div>
      {label && <div className="text-xs text-muted-foreground" dir="ltr">{label}</div>}
    </div>
  )
}
