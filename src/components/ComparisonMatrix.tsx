"use client"
import { MatrixRow, SERVICE_LABELS, SERVICES } from "@/lib/api"

function fmt(n: number | undefined, currency: string) {
  if (n == null) return "—"
  if (["JPY", "VND", "IDR"].includes(currency)) return Math.round(n).toLocaleString()
  return n.toFixed(2)
}

function DiffBadge({ moin, other }: { moin: number | undefined; other: number | undefined }) {
  if (!moin || !other) return null
  const diff = ((moin - other) / other) * 100
  const isWorse = diff < -0.05
  const isBetter = diff > 0.05
  if (!isWorse && !isBetter) return <span className="text-xs text-gray-400">≈</span>
  return (
    <span className={`text-xs font-medium ${isBetter ? "text-green-600" : "text-red-500"}`}>
      {isBetter ? "+" : ""}{diff.toFixed(2)}%
    </span>
  )
}

export default function ComparisonMatrix({
  matrix, currency,
}: {
  matrix: MatrixRow[]
  currency: string
}) {
  if (!matrix.length) return (
    <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
      이 통화에 대한 수집 데이터가 없습니다.
    </div>
  )

  const amounts = matrix.map(r => r.sendAmountKrw)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <h2 className="font-semibold text-gray-800">최신 비교 ({currency})</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <th className="px-4 py-2.5 text-left font-medium">서비스</th>
              {amounts.map(a => (
                <th key={a} className="px-4 py-2.5 text-right font-medium">
                  {(a / 10000).toFixed(0)}만원
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {SERVICES.map(service => (
              <tr key={service} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-700">
                  {SERVICE_LABELS[service] ?? service}
                </td>
                {matrix.map(row => {
                  const q = row.quotes[service]
                  const moinQ = row.quotes["MOIN"]
                  const isBest = row.bestService === service
                  return (
                    <td key={row.sendAmountKrw} className="px-4 py-3 text-right">
                      {q ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className={`font-mono ${isBest ? "text-green-700 font-semibold" : "text-gray-800"}`}>
                            {fmt(q.recipientAmount, currency)}
                          </span>
                          {service !== "MOIN" && (
                            <DiffBadge moin={moinQ?.recipientAmount} other={q.recipientAmount} />
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-2.5 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
        % = MOIN 대비 차이 (+ 는 MOIN이 더 많이 받음)
      </div>
    </div>
  )
}
