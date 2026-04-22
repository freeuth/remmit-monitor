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
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <h2 className="font-semibold text-gray-800">견적 수집</h2>
      <div className="flex flex-wrap gap-3 items-center">
        <label className="text-sm text-gray-600 shrink-0">통화</label>
        <select
          className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={currency}
          onChange={e => setCurrency(e.target.value)}
        >
          {CURRENCY_GROUPS.map(g => (
            <optgroup key={g.label} label={g.label}>
              {g.currencies.map(c => <option key={c} value={c}>{c}</option>)}
            </optgroup>
          ))}
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
      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
      <button
        onClick={run}
        disabled={loading || !services.length}
        className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {loading ? "요청 중..." : "견적 수집 시작"}
      </button>
    </div>
  )
}
