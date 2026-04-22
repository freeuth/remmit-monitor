"use client"
import { MatrixRow, Quote, Session, SERVICE_COLORS, SERVICE_LABELS, SERVICES } from "@/lib/api"

const JPY_LIKE = ["JPY", "VND", "IDR", "KHR", "MMK"]

// 시중은행 기준 환전 스프레드 (KRW 기준 전신환 매도 기준 약 1.75%)
const STANDARD_SPREAD = 0.0175

function fmtAmt(n: number | undefined | null, currency: string) {
  if (n == null || n === 0) return null
  return JPY_LIKE.includes(currency)
    ? Math.round(n).toLocaleString("ko-KR")
    : n.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtRate(rate: number | null | undefined) {
  if (rate == null) return null
  return rate >= 100 ? rate.toFixed(2) : rate.toFixed(4)
}

function fmtFee(fee: number | null | undefined) {
  if (fee == null) return null
  return `${fee.toLocaleString("ko-KR")}원`
}

function Diff({ moin, other }: { moin?: number | null; other?: number | null }) {
  if (!moin || !other || other === 0) return null
  const pct = ((moin - other) / other) * 100
  if (Math.abs(pct) < 0.05) return <span className="text-gray-400 text-[11px]">≈</span>
  return (
    <span className={`text-[11px] font-medium ${pct > 0 ? "text-green-600" : "text-red-500"}`}>
      {pct > 0 ? "▲" : "▼"}{Math.abs(pct).toFixed(2)}%
    </span>
  )
}

// 환율 우대율 및 숨겨진 환전수수료 계산
function RateDiscount({
  q, moinQ, sendAmountKrw,
}: {
  q: Quote; moinQ: Quote | undefined; sendAmountKrw: number
}) {
  if (!q.exchangeRate || !moinQ?.exchangeRate) return null
  const moinRate = moinQ.exchangeRate
  const compRate = q.exchangeRate
  if (compRate <= moinRate * 1.0001) return null // 모인보다 환율이 같거나 좋으면 표시 안 함

  const rateSpread = (compRate - moinRate) / moinRate
  const discountPct = Math.max(0, Math.round((1 - rateSpread / STANDARD_SPREAD) * 10) * 10)

  // 모인 환율로 바꿨을 때 vs 실제 환율 → 차이를 KRW로 환산
  const base = sendAmountKrw - (q.feeKrw ?? 0)
  const hiddenFeeKrw = Math.round(base * (1 - moinRate / compRate))

  const discountColor =
    discountPct >= 80 ? "bg-green-50 text-green-700" :
    discountPct >= 50 ? "bg-yellow-50 text-yellow-700" :
    "bg-red-50 text-red-600"

  return (
    <div className="flex items-center gap-1.5 mt-1 flex-wrap justify-end">
      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${discountColor}`}>
        우대 {discountPct}%
      </span>
      <span className="text-[10px] text-orange-500 font-medium">
        환차 +{hiddenFeeKrw.toLocaleString("ko-KR")}원
      </span>
    </div>
  )
}

function cellContent(
  q: Quote | undefined,
  moinQ: Quote | undefined,
  isBest: boolean,
  currency: string,
  service: string,
  sendAmountKrw: number,
) {
  if (!q) return <span className="text-gray-300">—</span>

  const isUnsupported = q.notes?.includes("Unsupported currency")
  const isError = !isUnsupported && q.notes?.startsWith("ERROR:")
  const errorDetail = isError ? q.notes!.replace(/^ERROR:\s*/, "") : null
  const amt = fmtAmt(q.recipientAmount, currency)

  if (isUnsupported) {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">미지원</span>
      </div>
    )
  }
  if (isError || !amt) {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <span
          className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full cursor-help"
          title={errorDetail ?? undefined}
        >
          수집 실패
        </span>
        {errorDetail && (
          <span className="text-[10px] text-gray-400 max-w-[120px] truncate text-right" title={errorDetail}>
            {errorDetail}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="flex items-center gap-1">
        {isBest && <span className="text-green-500 text-xs">●</span>}
        <span className={`font-mono font-semibold text-base tabular-nums ${isBest ? "text-green-700" : "text-gray-800"}`}>
          {amt}
        </span>
      </div>
      <Diff moin={moinQ?.recipientAmount} other={q.recipientAmount} />
      <div className="flex gap-2 text-[11px] text-gray-400">
        {fmtFee(q.feeKrw) && <span>수수료 {fmtFee(q.feeKrw)}</span>}
        {fmtRate(q.exchangeRate) && <span>환율 {fmtRate(q.exchangeRate)}</span>}
      </div>
      {service !== "MOIN" && (
        <RateDiscount q={q} moinQ={moinQ} sendAmountKrw={sendAmountKrw} />
      )}
    </div>
  )
}

// MOIN 수수료 제안: 경쟁사 최고보다 1단위 높이려면 수수료를 얼마로?
function MoinSuggestion({ matrix, currency }: { matrix: MatrixRow[]; currency: string }) {
  const rows = matrix.map(row => {
    const moin = row.quotes["MOIN"]
    if (!moin?.exchangeRate || !moin.recipientAmount) return null

    const competitors = SERVICES.filter(s => s !== "MOIN" && s !== "SENTBE")
      .map(s => row.quotes[s])
      .filter(q => q && !q.notes && q.recipientAmount > 0)

    if (!competitors.length) return null

    const bestCompetitor = competitors.reduce((a, b) =>
      (b!.recipientAmount > a!.recipientAmount ? b : a)
    )!

    const rate = moin.exchangeRate
    const currentFee = moin.feeKrw ?? 0
    const moinAmt = moin.recipientAmount
    const compAmt = bestCompetitor.recipientAmount
    const bestSvc = SERVICES.find(s => row.quotes[s] === bestCompetitor)

    const requiredFee = Math.floor(row.sendAmountKrw - compAmt * rate) - 1
    const diff = currentFee - requiredFee

    return {
      amount: row.sendAmountKrw,
      moinAmt, compAmt, bestSvc, currentFee, requiredFee, diff,
      isWinning: moinAmt >= compAmt,
    }
  }).filter(Boolean) as any[]

  if (!rows.length) return null

  const hasAnyLosing = rows.some((r: any) => !r.isWinning)
  if (!hasAnyLosing) return (
    <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-3 text-sm text-green-700 font-medium">
      ✓ 모든 송금액에서 모인이 최고 수취금액을 제공하고 있습니다.
    </div>
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <h2 className="font-semibold text-gray-800">모인 수수료 조정 시뮬레이션</h2>
        <p className="text-xs text-gray-400 mt-0.5">동일 환율 기준, 수수료를 얼마로 낮추면 최고 수취금액이 되는지 계산</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-2.5 text-left font-medium">송금액</th>
              <th className="px-4 py-2.5 text-right font-medium">모인 수취</th>
              <th className="px-4 py-2.5 text-right font-medium">최고 경쟁사</th>
              <th className="px-4 py-2.5 text-right font-medium">현재 수수료</th>
              <th className="px-4 py-2.5 text-right font-medium">제안 수수료</th>
              <th className="px-4 py-2.5 text-right font-medium">인하 필요액</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(rows as any[]).map((r: any) => (
              <tr key={r.amount} className={r.isWinning ? "bg-green-50/40" : "hover:bg-gray-50"}>
                <td className="px-4 py-3 font-medium text-gray-700">{(r.amount / 10000).toFixed(0)}만원</td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-gray-700">
                  {fmtAmt(r.moinAmt, currency)} {currency}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="font-mono tabular-nums text-gray-700">
                    {fmtAmt(r.compAmt, currency)} {currency}
                  </div>
                  <div className="text-[11px] text-gray-400">{SERVICE_LABELS[r.bestSvc] ?? r.bestSvc}</div>
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-gray-600">
                  {r.currentFee.toLocaleString("ko-KR")}원
                </td>
                <td className="px-4 py-3 text-right">
                  {r.isWinning ? (
                    <span className="text-green-600 font-medium text-xs">현재 최고 ✓</span>
                  ) : r.requiredFee <= 0 ? (
                    <span className="text-red-500 text-xs">환율 개선 필요</span>
                  ) : (
                    <span className="font-mono tabular-nums font-semibold text-blue-600">
                      {r.requiredFee.toLocaleString("ko-KR")}원
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {!r.isWinning && r.requiredFee > 0 && (
                    <span className="font-mono tabular-nums text-red-600 font-semibold">
                      -{r.diff.toLocaleString("ko-KR")}원
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function ComparisonMatrix({ matrix, currency, session }: { matrix: MatrixRow[]; currency: string; session?: Session | null }) {
  if (!matrix.length) return (
    <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
      아직 수집된 데이터가 없습니다. 견적 수집을 시작해주세요.
    </div>
  )

  const activeServices = SERVICES.filter(s => matrix.some(r => r.quotes[s]))

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">
            수취 금액 비교
            <span className="text-gray-400 font-normal text-sm ml-1">({currency})</span>
          </h2>
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-xs text-gray-400">● 최고 수취  ▲▼ 모인 대비  우대% 시중은행 1.75% 기준</span>
            {session && (
              <span className="text-[11px] text-gray-400">
                수집: {new Date(session.triggeredAt).toLocaleString("ko-KR")}
              </span>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 w-32 whitespace-nowrap">
                  서비스
                </th>
                {matrix.map(row => (
                  <th key={row.sendAmountKrw} className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
                    {(row.sendAmountKrw / 10000).toFixed(0)}만원
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeServices.map(service => (
                <tr key={service} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: SERVICE_COLORS[service] }} />
                      <span className="font-medium text-gray-700 text-sm">{SERVICE_LABELS[service] ?? service}</span>
                    </div>
                  </td>
                  {matrix.map(row => (
                    <td key={row.sendAmountKrw} className="px-4 py-3 text-right align-top">
                      {cellContent(row.quotes[service], row.quotes["MOIN"], row.bestService === service, currency, service, row.sendAmountKrw)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
          수수료·환율은 수집 당시 기준 · 환차는 동일 환율 적용 시 모인 대비 추가 부담액
        </div>
      </div>

      <MoinSuggestion matrix={matrix} currency={currency} />
    </div>
  )
}
