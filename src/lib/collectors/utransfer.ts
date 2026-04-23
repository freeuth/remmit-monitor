import { QuoteResult } from "./types"

interface RateInfo {
  code: string
  ex_rate: number
  fee_amount: number
  multiplier: number
  precision: number
  ut_transaction_fee: number
}

// Single call returns all currencies — cache per process lifetime
let rateCache: Record<string, RateInfo> | null = null
let cacheFetchedAt = 0
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 min

async function fetchRates(): Promise<Record<string, RateInfo>> {
  if (rateCache && Date.now() - cacheFetchedAt < CACHE_TTL_MS) return rateCache

  const res = await fetch("https://www.utransfer.com/api/v1/common/fee_calculate", {
    headers: {
      "Referer": "https://www.utransfer.com/",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  })
  const data = await res.json()
  const map: Record<string, RateInfo> = {}
  for (const item of data?.data ?? []) {
    if (item.code) map[item.code.toUpperCase()] = item
  }
  rateCache = map
  cacheFetchedAt = Date.now()
  return map
}

export async function collectUtransfer(sendAmountKrw: number, toCurrency: string): Promise<QuoteResult> {
  const currency = toCurrency.toUpperCase()

  try {
    const rates = await fetchRates()
    const info = rates[currency]

    if (!info) {
      return { service: "UTRANSFER", fromCurrency: "KRW", toCurrency: currency,
        sendAmountKrw, recipientAmount: 0, recipientCurrency: currency,
        error: `Unsupported currency: ${currency}` }
    }

    // ex_rate is always KRW per 1 unit of foreign currency
    // multiplier is a display hint only (e.g. 100 = "show as per 100 JPY on site")
    const exRate = info.ex_rate
    const fee = info.fee_amount
    const precision = info.precision ?? 2

    const netKrw = sendAmountKrw - fee
    const recipient = netKrw / exRate

    return {
      service: "UTRANSFER", fromCurrency: "KRW", toCurrency: currency,
      sendAmountKrw,
      recipientAmount: Number(recipient.toFixed(precision)),
      recipientCurrency: currency,
      exchangeRate: exRate,
      feeKrw: Math.round(fee),
      rawSnapshot: JSON.stringify(info),
    }
  } catch (e: any) {
    return { service: "UTRANSFER", fromCurrency: "KRW", toCurrency: currency,
      sendAmountKrw, recipientAmount: 0, recipientCurrency: currency, error: e.message }
  }
}
