'use client'

import dynamic from 'next/dynamic'

const BrApp = dynamic(() => import('@/components/br/BrApp'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0f1a]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-2xl bg-[#1e3a5f] animate-pulse" />
        <span className="text-sm text-zinc-400">Loading BlueRetro MethyleneX…</span>
      </div>
    </div>
  ),
})

export default function Page() {
  return <BrApp />
}
