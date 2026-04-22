"use client"
import { useState } from "react"
import { AMOUNTS, CURRENCY_GROUPS, SERVICE_LABELS, SERVICES, runSession } from "@/lib/api"

export default function RunPanel({ onStarted }: { onStarted: (id: number, total: number, currency: string) => void }) {
  const [currency, setCurrency] = useState("USD")
  const [services, setServices] = useState<string[]>(SERVICES.filter(s => s !== "SENTBE"))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = (s: string) =>
    setServices(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])

  const run = async () => {
    if (!services.length) return
    setLoading(true)
    setError(null)
    try {
      const res = await runSession({ to_currency: currency, services })
      onStarted(res.session_id, res.total ?? services.length * AMOUNTS.length, currency)
    } catch (e: any) {
      setError(e.message ?? "알 수 없는 오류")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap justify-end">
      <select
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        value={currency}
        onChange={e => setCurrency(e.target.value)}
      >
        {CURRENCY_GROUPS.map(g => (
          <optgroup key={g.label} label={g.label}>
            {g.currencies.map(c => <option key={c} value={c}>{c}</option>)}
          </optgroup>
        ))}
      </select>
      <div className="flex gap-1.5 flex-wrap">
        {SERVICES.map(s => (
          <button
            key={s}
            onClick={() => toggle(s)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              services.includes(s)
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-400 border-gray-200 hover:border-blue-400"
            }`}
          >
            {SERVICE_LABELS[s]}
          </button>
        ))}
      </div>
      {error && <span className="text-xs text-red-500 shrink-0">{error}</span>}
      <button
        onClick={run}
        disabled={loading || !services.length}
        className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors shrink-0"
      >
        {loading ? "요청 중..." : "수집 시작"}
      </button>
    </div>
  )
}
