"use client"
import { MatrixRow, SERVICE_COLORS, SERVICE_LABELS, SERVICES } from "@/lib/api"

const JPY_LIKE = ["JPY", "VND", "IDR"]

function formatAmount(n: number | undefined, currency: string) {
  if (n == null || n === 0) return null
  if (JPY_LIKE.includes(currency)) return Math.round(n).toLocaleString("ko-KR")
  return n.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function Diff({ moin, other }: { moin?: number; other?: number }) {
  if (!moin || !other || other === 0) return null
  const pct = ((moin - other) / other) * 100
  if (Math.abs(pct) < 0.05) return <span className="text-gray-400 text-xs">≈</span>
  return (
    <span className={`text-xs font-medium ${pct > 0 ? "text-green-600" : "text-red-500"}`}>
      {pct > 0 ? "▲" : "▼"}{Math.abs(pct).toFixed(2)}%
    </span>
  )
}

export default function ComparisonMatrix({ matrix, currency }: { matrix: MatrixRow[]; currency: string }) {
  if (!matrix.length) return (
    <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
      아직 수집된 데이터가 없습니다. 견적 수집을 시작해주세요.
    </div>
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">수취 금액 비교 <span className="text-gray-400 font-normal text-sm">({currency})</span></h2>
        <span className="text-xs text-gray-400">% = 모인 대비</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
                서비스
              </th>
              {matrix.map(row => (
                <th key={row.sendAmountKrw} className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
                  {(row.sendAmountKrw / 10000).toFixed(0)}만원
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SERVICES.map((service, idx) => {
              const hasAny = matrix.some(r => r.quotes[service])
              if (!hasAny) return null
              const isBestInAny = matrix.some(r => r.bestService === service)
              return (
                <tr key={service} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${idx % 2 === 0 ? "" : "bg-gray-50/30"}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: SERVICE_COLORS[service] }}
                      />
                      <span className="font-medium text-gray-700">{SERVICE_LABELS[service] ?? service}</span>
                    </div>
                  </td>
                  {matrix.map(row => {
                    const q = row.quotes[service]
                    const moinQ = row.quotes["MOIN"]
                    const isBest = row.bestService === service
                    const formatted = formatAmount(q?.recipientAmount, currency)
                    return (
                      <td key={row.sendAmountKrw} className="px-4 py-3 text-right">
                        {formatted ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <span className={`font-mono text-base font-semibold ${isBest ? "text-green-700" : "text-gray-800"}`}>
                              {formatted}
                              {isBest && <span className="ml-1 text-xs text-green-600">●</span>}
                            </span>
                            {service !== "MOIN" && (
                              <Diff moin={moinQ?.recipientAmount} other={q?.recipientAmount} />
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300 text-lg">—</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-400 flex gap-4">
        <span>● 최고 수취 금액</span>
        <span>▲ 모인보다 더 받음 &nbsp; ▼ 모인보다 덜 받음</span>
      </div>
    </div>
  )
}
