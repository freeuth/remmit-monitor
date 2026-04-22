import { QuoteResult } from "./types"

// Numeric IDs used by SentBe API (POST /api/landing/page on oxygen.sentbe.com)
// Discovered via Proxyman capture. source_currency=1 (KRW), source_country=209 (Korea)
// To add more currencies: capture /api/landing/page in Proxyman while tapping the target currency in SentBe app
const SENTBE_MAP: Record<string, { currency: number; country: number }> = {
  USD: { currency: 2, country: 239 },
  PHP: { currency: 3, country: 173 },
  VND: { currency: 4, country: 243 },
  THB: { currency: 5, country: 216 },
  EUR: { currency: 6, country: 82 },
  JPY: { currency: 11, country: 109 },
  CNY: { currency: 12, country: 46 },
}

export async function collectSentBe(sendAmountKrw: number, toCurrency: string): Promise<QuoteResult> {
  const currency = toCurrency.toUpperCase()
  const mapping = SENTBE_MAP[currency]

  if (!mapping) {
    return make(sendAmountKrw, currency, { error: `Unsupported currency: ${currency}` })
  }

  try {
    const res = await fetch("https://oxygen.sentbe.com/api/landing/page", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_currency: 1,
        currency: mapping.currency,
        country: mapping.country,
        pid: "1142560",
        source_country: 209,
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      return make(sendAmountKrw, currency, { error: `HTTP ${res.status}: ${text.slice(0, 120)}` })
    }

    const data = await res.json()
    const d = data?.data
    if (!d?.base_rate) {
      return make(sendAmountKrw, currency, { error: `Unexpected response: ${JSON.stringify(data).slice(0, 100)}` })
    }

    const methods: any[] = d.delivery_method ?? []
    // Use cheapest available fee for this currency
    const relevant = methods.filter(m => m.currency === mapping.currency)
    const pool = relevant.length ? relevant : methods
    const cheapest = pool.sort((a, b) => (a.fee?.fixed ?? 0) - (b.fee?.fixed ?? 0))[0]
    const feeKrw: number = cheapest?.fee?.fixed ?? 0
    const rate = Number(d.base_rate)
    const recipientAmount = (sendAmountKrw - feeKrw) / rate

    return make(sendAmountKrw, currency, {
      recipientAmount,
      exchangeRate: rate,
      feeKrw,
      rawSnapshot: JSON.stringify(data),
    })
  } catch (e: any) {
    return make(sendAmountKrw, currency, { error: e.message })
  }
}

function make(
  sendAmountKrw: number,
  toCurrency: string,
  fields: Partial<QuoteResult> & { error?: string },
): QuoteResult {
  return {
    service: "SENTBE",
    fromCurrency: "KRW",
    toCurrency,
    sendAmountKrw,
    recipientAmount: 0,
    recipientCurrency: toCurrency,
    ...fields,
  }
}
