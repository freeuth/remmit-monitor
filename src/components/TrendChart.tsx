"use client"
import { useEffect, useState } from "react"
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts"
import { format } from "date-fns"
import { AMOUNTS, SERVICE_COLORS, SERVICE_LABELS, SERVICES, getHistory } from "@/lib/api"

type Point = { collectedAt: string; recipientAmount: number }

export default function TrendChart({ currency }: { currency: string }) {
  const [amount, setAmount] = useState(1_000_000)
  const [data, setData] = useState<Record<string, Point[]>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    getHistory(currency, amount)
      .then(setData)
      .finally(() => setLoading(false))
  }, [currency, amount])

  const timestamps = Array.from(
    new Set(Object.values(data).flatMap(pts => pts.map(p => p.collectedAt)))
  ).sort()

  const chartData = timestamps.map(ts => {
    const row: Record<string, string | number> = {
      ts: format(new Date(ts), "MM/dd HH:mm"),
    }
    SERVICES.forEach(s => {
      const pt = data[s]?.find(p => p.collectedAt === ts)
      if (pt) row[s] = pt.recipientAmount
    })
    return row
  })

  const activeServices = SERVICES.filter(s => data[s]?.length)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">추이 차트 ({currency})</h2>
        <select
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={amount}
          onChange={e => setAmount(Number(e.target.value))}
        >
          {AMOUNTS.map(a => (
            <option key={a} value={a}>{(a / 10000).toFixed(0)}만원</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center text-gray-400 text-sm">로딩 중...</div>
      ) : chartData.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-gray-400 text-sm">데이터 없음</div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="ts" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={60} />
            <Tooltip formatter={(v: number) => v.toFixed(4)} />
            <Legend formatter={s => SERVICE_LABELS[s] ?? s} />
            {activeServices.map(s => (
              <Line
                key={s}
                type="monotone"
                dataKey={s}
                stroke={SERVICE_COLORS[s]}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
