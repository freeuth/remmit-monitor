import { QuoteResult } from "./types"

const CURRENCY_TO_COUNTRY: Record<string, string> = {
  USD: "US", JPY: "JP", EUR: "DE", PHP: "PH",
  VND: "VN", THB: "TH", CNY: "CN", AUD: "AU",
  GBP: "GB", CAD: "CA", SGD: "SG", HKD: "HK",
  MYR: "MY", IDR: "ID", INR: "IN", NPR: "NP",
  BDT: "BD", MNT: "MN", RUB: "RU",
}

export async function collectHanpass(sendAmountKrw: number, toCurrency: string): Promise<QuoteResult> {
  const currency = toCurrency.toUpperCase()
  const country = CURRENCY_TO_COUNTRY[currency]

  if (!country) {
    return { service: "HANPASS", fromCurrency: "KRW", toCurrency: currency,
      sendAmountKrw, recipientAmount: 0, recipientCurrency: currency,
      error: `Unsupported currency: ${currency}` }
  }

  try {
    const res = await fetch("https://app.hanpass.com/app/v1/remittance/get-cost", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "accept-language": "ko",
        "Referer": "https://www.hanpass.com/",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      body: JSON.stringify({
        inputAmount: String(sendAmountKrw),
        inputCurrencyCode: "KRW",
        fromCurrencyCode: "KRW",
        toCurrencyCode: currency,
        toCountryCode: country,
        memberSeq: "1",
        lang: "ko",
      }),
    })

    const data = await res.json()
    const raw = JSON.stringify(data)

    // Response may be nested under data/result
    let result = data?.data ?? data?.result ?? data
    if (Array.isArray(result)) result = result[0] ?? {}

    const received = result?.recipientAmount ?? result?.receiveAmount
      ?? result?.toAmount ?? result?.recipient
    const rawRate = result?.exchangeRate ?? result?.rate ?? result?.fxRate
    // Hanpass returns rate as foreign/KRW (e.g. 0.00067 USD/KRW) → invert to KRW/foreign
    const rate = rawRate != null
      ? (Number(rawRate) < 1 ? 1 / Number(rawRate) : Number(rawRate))
      : null
    const fee = result?.feeAmount ?? result?.fee ?? result?.serviceFee

    if (received == null) {
      return { service: "HANPASS", fromCurrency: "KRW", toCurrency: currency,
        sendAmountKrw, recipientAmount: 0, recipientCurrency: currency,
        rawSnapshot: raw,
        error: `Unknown response shape: ${JSON.stringify(Object.keys(result ?? data))}` }
    }

    return {
      service: "HANPASS", fromCurrency: "KRW", toCurrency: currency,
      sendAmountKrw, recipientAmount: Number(received), recipientCurrency: currency,
      exchangeRate: rate != null ? rate : undefined,
      feeKrw: fee != null ? Math.round(Number(fee)) : undefined,
      rawSnapshot: raw,
    }
  } catch (e: any) {
    return { service: "HANPASS", fromCurrency: "KRW", toCurrency: currency,
      sendAmountKrw, recipientAmount: 0, recipientCurrency: currency, error: e.message }
  }
}
