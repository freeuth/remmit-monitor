import { QuoteResult } from "./types"

const CURRENCY_TO_COUNTRY: Record<string, string> = {
  USD: "US", JPY: "JP", EUR: "DE", PHP: "PH",
  VND: "VN", THB: "TH", CNY: "CN", AUD: "AU",
  GBP: "GB", CAD: "CA", SGD: "SG", HKD: "HK",
  MYR: "MY", IDR: "ID", INR: "IN",
}

export async function collectMoin(sendAmountKrw: number, toCurrency: string): Promise<QuoteResult> {
  const currency = toCurrency.toUpperCase()
  const country = CURRENCY_TO_COUNTRY[currency]

  if (!country) {
    return { service: "MOIN", fromCurrency: "KRW", toCurrency: currency,
      sendAmountKrw, recipientAmount: 0, recipientCurrency: currency,
      error: `Unsupported currency: ${currency}` }
  }

  try {
    const res = await fetch("https://web-api.ma.prd.themoin.com/v0/quote/ma", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "https://www.themoin.com",
        "Referer": "https://www.themoin.com/",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      body: JSON.stringify({
        targetCountry: country,
        targetCurrency: currency,
        fixedSide: "SEND",
        transferAmount: sendAmountKrw,
        couponTicketId: "",
      }),
    })

    const data = await res.json()
    const raw = JSON.stringify(data)

    const received = data.receivedAmount ?? data.receiveAmount ?? data.targetAmount
    const rate = data.exchangeRate ?? data.rate
    const fee = data.fee ?? data.feeAmount ?? data.sendFee

    if (received == null) {
      return { service: "MOIN", fromCurrency: "KRW", toCurrency: currency,
        sendAmountKrw, recipientAmount: 0, recipientCurrency: currency,
        rawSnapshot: raw, error: `Unknown response shape: ${Object.keys(data).join(",")}` }
    }

    return {
      service: "MOIN", fromCurrency: "KRW", toCurrency: currency,
      sendAmountKrw, recipientAmount: Number(received), recipientCurrency: currency,
      exchangeRate: rate != null ? Number(rate) : undefined,
      feeKrw: fee != null ? Math.round(Number(fee)) : undefined,
      rawSnapshot: raw,
    }
  } catch (e: any) {
    return { service: "MOIN", fromCurrency: "KRW", toCurrency: currency,
      sendAmountKrw, recipientAmount: 0, recipientCurrency: currency, error: e.message }
  }
}
