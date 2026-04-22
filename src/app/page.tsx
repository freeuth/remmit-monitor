"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { CompareLatest, CURRENCIES, Session, getLatestComparison, getSessions } from "@/lib/api"
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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async () => {
    const [s, l] = await Promise.all([getSessions(), getLatestComparison(currency)])
    setSessions(s)
    setLatest(l)
  }, [currency])

  useEffect(() => { refresh() }, [refresh])

  const startPoll = (sessionId: number, total: number) => {
    setRunningId(sessionId)
    setTotalExpected(total)
    pollRef.current = setInterval(async () => {
      const s = await getSessions()
      setSessions(s)
      const target = s.find(x => x.id === sessionId)
      if (target && target.status !== "running") {
        clearInterval(pollRef.current!)
        setRunningId(null)
        setTotalExpected(0)
        refresh()
      }
    }, 2000)
  }

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const runningSession = sessions.find(s => s.id === runningId)
  const progress = totalExpected > 0 && runningSession
    ? Math.round((runningSession.quotesCount / totalExpected) * 100)
    : 0

  return (
    <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">해외송금 견적 모니터</h1>
          <p className="text-sm text-gray-500 mt-0.5">내부 전용 · 경쟁사 최종 수취 금액 비교</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">통화</label>
          <select
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={currency}
            onChange={e => setCurrency(e.target.value)}
          >
            {CURRENCIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {runningSession && (
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-700 font-medium">세션 #{runningSession.id} 수집 중</span>
            <span className="text-gray-500">{runningSession.quotesCount} / {totalExpected}</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-right text-xs text-blue-600 font-semibold">{progress}%</div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <RunPanel onStarted={startPoll} />
          <ManualInput onSaved={refresh} />
        </div>
        <div className="lg:col-span-2">
          <ComparisonMatrix matrix={latest?.matrix ?? []} currency={currency} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">수집 세션 기록</h2>
        </div>
        <div className="overflow-x-auto">
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
                  <td className="px-4 py-2.5 text-gray-700">
                    {new Date(s.triggeredAt).toLocaleString("ko-KR")}
                  </td>
                  <td className="px-4 py-2.5 font-medium">{s.toCurrency}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={s.status} /></td>
                  <td className="px-4 py-2.5 text-right text-gray-600">{s.quotesCount}</td>
                </tr>
              ))}
              {!sessions.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">수집 기록 없음</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}
