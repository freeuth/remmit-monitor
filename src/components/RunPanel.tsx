"use client"
import { useState } from "react"
import { CURRENCIES, SERVICE_LABELS, SERVICES, runSession } from "@/lib/api"

export default function RunPanel({ onStarted }: { onStarted: (id: number) => void }) {
  const [currency, setCurrency] = useState("USD")
  const [services, setServices] = useState<string[]>(SERVICES)
  const [loading, setLoading] = useState(false)

  const toggle = (s: string) =>
    setServices(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])

  const run = async () => {
    if (!services.length) return
    setLoading(true)
    try {
      const { session_id } = await runSession({ to_currency: currency, services })
      onStarted(session_id)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <h2 className="font-semibold text-gray-800">견적 수집</h2>
      <div className="flex flex-wrap gap-3 items-center">
        <label className="text-sm text-gray-600">통화</label>
        <select
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={currency}
          onChange={e => setCurrency(e.target.value)}
        >
          {CURRENCIES.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        {SERVICES.map(s => (
          <button
            key={s}
            onClick={() => toggle(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              services.includes(s)
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-500 border-gray-300 hover:border-blue-400"
            }`}
          >
            {SERVICE_LABELS[s]}
          </button>
        ))}
      </div>
      <button
        onClick={run}
        disabled={loading || !services.length}
        className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {loading ? "수집 중..." : "견적 수집 시작"}
      </button>
    </div>
  )
}
