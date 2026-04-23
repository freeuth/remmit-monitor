"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { CompareLatest, CURRENCY_GROUPS, Session, getLatestComparison, getSessions } from "@/lib/api"
import RunPanel from "@/components/RunPanel"
import ComparisonMatrix from "@/components/ComparisonMatrix"
import ManualInput from "@/components/ManualInput"

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "complete" ? "bg-green-100 text-green-700" :
    status === "running"  ? "bg-yellow-100 text-yellow-700" :
    status === "partial"  ? "bg-orange-100 text-orange-700" :
                            "bg-red-100 text-red-700"
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{status}</span>
}

export default function Home() {
  const [currency, setCurrency] = useState("USD")
  const [sessions, setSessions] = useState<Session[]>([])
  const [latest, setLatest] = useState<CompareLatest | null>(null)
  const [runningId, setRunningId] = useState<number | null>(null)
  const [totalExpected, setTotalExpected] = useState(0)
  const [sessionsOpen, setSessionsOpen] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async (overrideCurrency?: string) => {
    const [s, l] = await Promise.all([getSessions(), getLatestComparison(overrideCurrency ?? currency)])
    setSessions(s)
    setLatest(l)
  }, [currency])

  useEffect(() => { refresh() }, [refresh])

  const startPoll = (sessionId: number, total: number, collectedCurrency: string) => {
    setRunningId(sessionId)
    setTotalExpected(total)
    setCurrency(collectedCurrency)
    refresh(collectedCurrency)
    pollRef.current = setInterval(async () => {
      const s = await getSessions()
      setSessions(s)
      const target = s.find(x => x.id === sessionId)
      if (target && target.status !== "running") {
        clearInterval(pollRef.current!)
        setRunningId(null)
        setTotalExpected(0)
        setCurrency(collectedCurrency)
        refresh(collectedCurrency)
      }
    }, 2000)
  }

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const runningSession = sessions.find(s => s.id === runningId)
  const progress = totalExpected > 0 && runningSession
    ? Math.round((runningSession.quotesCount / totalExpected) * 100)
    : 0

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky header with collection controls */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-screen-xl mx-auto px-6">
          <div className="flex items-center gap-6 py-3">
            <div className="shrink-0">
              <h1 className="text-base font-bold text-gray-900">해외송금 견적 모니터</h1>
              <p className="text-xs text-gray-400">내부 전용 · 경쟁사 최종 수취 금액 비교</p>
            </div>
            <div className="flex-1">
              <RunPanel onStarted={startPoll} />
            </div>
          </div>
          {runningSession && (
            <div className="pb-3 flex items-center gap-3">
              <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-blue-600 w-10 text-right">{progress}%</span>
              <span className="text-xs text-gray-400">{runningSession.quotesCount} / {totalExpected}</span>
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <main className="max-w-screen-xl mx-auto px-6 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-600">비교 통화</label>
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
          </div>
          <ManualInput onSaved={refresh} />
        </div>

        <ComparisonMatrix matrix={latest?.matrix ?? []} currency={currency} session={latest?.session} />

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <button
            onClick={() => setSessionsOpen(o => !o)}
            className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <span className="font-semibold text-gray-800 text-sm">수집 세션 기록</span>
            <span className="text-gray-400 text-xs flex items-center gap-1">
              {sessions.length}건
              <span className="text-base leading-none">{sessionsOpen ? "▲" : "▼"}</span>
            </span>
          </button>
          {sessionsOpen && (
            <>
              <div className="border-t border-gray-100 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                      <th className="px-4 py-2.5 text-left font-medium">ID</th>
                      <th className="px-4 py-2.5 text-left font-medium">수집 시각</th>
                      <th className="px-4 py-2.5 text-left font-medium">통화</th>
                      <th className="px-4 py-2.5 text-left font-medium">상태</th>
                      <th className="px-4 py-2.5 text-right font-medium">견적 수</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sessions.map(s => (
                      <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5 text-gray-500">#{s.id}</td>
                        <td className="px-4 py-2.5 text-gray-700">{new Date(s.triggeredAt).toLocaleString("ko-KR")}</td>
                        <td className="px-4 py-2.5 font-medium">{s.toCurrency}</td>
                        <td className="px-4 py-2.5"><StatusBadge status={s.status} /></td>
                        <td className="px-4 py-2.5 text-right text-gray-600">{s.quotesCount}</td>
                      </tr>
                    ))}
                    {!sessions.length && (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">수집 기록 없음</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
