import { QuoteResult } from "./types"

// Numeric IDs discovered by probing POST /api/landing/page on oxygen.sentbe.com
// source_currency=1 (KRW), source_country=209 (Korea)
const SENTBE_MAP: Record<string, { currency: number; country: number }> = {
  USD: { currency: 2,  country: 239 },  // Bank standard 2500₩
  PHP: { currency: 3,  country: 175 },  // Bank standard 2500₩
  VND: { currency: 4,  country: 245 },  // Bank standard 2500₩
  IDR: { currency: 5,  country: 103 },  // Bank standard 2500₩
  TWD: { currency: 6,  country: 223 },  // Bank standard 2500₩
  INR: { currency: 7,  country: 102 },  // Bank standard 2500₩
  LKR: { currency: 8,  country: 168 },  // Bank 0₩ (free)
  CNY: { currency: 9,  country: 47  },  // Alipay/Bank 5000₩
  JPY: { currency: 14, country: 155 },  // Bank standard 2500₩
  MYR: { currency: 12, country: 134 },  // Bank standard 2500₩
  GBP: { currency: 17, country: 237 },  // Bank standard 2500₩
  KHR: { currency: 18, country: 39  },  // Bank 2500₩
  EUR: { currency: 19, country: 22  },  // Bank standard 2500₩
  BDT: { currency: 25, country: 184 },  // Bank 5000₩
  AUD: { currency: 28, country: 158 },  // Bank 5000₩
  SEK: { currency: 29, country: 221 },  // Bank 5000₩
  MXN: { currency: 31, country: 207 },  // Bank 5000₩
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
