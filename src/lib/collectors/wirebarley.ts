import { QuoteResult } from "./types"

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const CURRENCY_SLUGS: Record<string, string> = {
  USD: "usd", JPY: "jpy", EUR: "eur", PHP: "php",
  VND: "vnd", THB: "thb", CNY: "cny", AUD: "aud",
  GBP: "gbp", CAD: "cad", SGD: "sgd", MYR: "myr",
  IDR: "idr", HKD: "hkd", NZD: "nzd", INR: "inr",
  CHF: "chf", SEK: "sek", NOK: "nok", DKK: "dkk",
  AED: "aed",
}

interface WbRate {
  rate: number    // KRW per 1 foreign unit
  fee: number     // KRW
}

export async function collectWirebarleyBatch(
  sendAmounts: number[],
  toCurrency: string
): Promise<QuoteResult[]> {
  const currency = toCurrency.toUpperCase()
  const slug = CURRENCY_SLUGS[currency]

  if (!slug) {
    return sendAmounts.map(amt => ({
      service: "WIREBARLEY", fromCurrency: "KRW", toCurrency: currency,
      sendAmountKrw: amt, recipientAmount: 0, recipientCurrency: currency,
      error: `Unsupported currency: ${currency}`,
    }))
  }

  const apiKey = process.env.BROWSERLESS_API_KEY
  if (!apiKey) {
    return sendAmounts.map(amt => ({
      service: "WIREBARLEY", fromCurrency: "KRW", toCurrency: currency,
      sendAmountKrw: amt, recipientAmount: 0, recipientCurrency: currency,
      error: "BROWSERLESS_API_KEY not set",
    }))
  }

  const puppeteer = (await import("puppeteer-core")).default
  let browser
  try {
    browser = await puppeteer.connect({
      browserWSEndpoint: `wss://production-sfo.browserless.io?token=${apiKey}&timeout=55000&stealth=true`,
    })

    const page = await browser.newPage()
    await page.setExtraHTTPHeaders({ "Accept-Language": "ko-KR,ko;q=0.9" })
    await page.setViewport({ width: 1280, height: 900 })

    // Intercept exrate API responses — only capture the target currency, not USD default
    let capturedRate: WbRate | null = null
    let capturedRaw = ""
    page.on("response", async (response) => {
      const url = response.url()
      if (!url.includes("/remittance/api/exrate/")) return
      // Only capture the response for the target currency (avoid grabbing the USD default)
      const upperUrl = url.toUpperCase()
      if (!upperUrl.includes(currency)) return
      if (!response.ok()) return
      try {
        const json = await response.json()
        capturedRaw = JSON.stringify(json)
        const d = json?.data
        if (!d) return
        // Try every known field name for rate and fee
        const rate = d.exchangeRate ?? d.exrate ?? d.rate ?? d.ex_rate ?? d.krwPerUnit
        const fee = d.fee ?? d.transferFee ?? d.transfer_fee ?? d.feeKrw ?? 0
        if (rate && rate > 0) {
          capturedRate = { rate: Number(rate), fee: Number(fee) }
        }
      } catch {}
    })

    // Navigate directly to the currency page so the correct exrate is loaded
    const url = `https://www.wirebarley.com/kr/ko/${slug}`
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 })
    await sleep(4000)  // wait for JS to mount + exrate API call

    // If intercept didn't work, try switching currency dropdown then triggering calc
    if (!capturedRate) {
      await page.evaluate((cur: string) => {
        // Try <select> elements first
        const selects = Array.from(document.querySelectorAll<HTMLSelectElement>("select"))
        for (const sel of selects) {
          const opt = Array.from(sel.options).find(o =>
            o.value.toUpperCase() === cur || o.text.toUpperCase().includes(cur)
          )
          if (opt) {
            const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set
            setter?.call(sel, opt.value)
            sel.dispatchEvent(new Event("change", { bubbles: true }))
          }
        }
        // Also try amount input to re-trigger exrate fetch
        const inputs = Array.from(document.querySelectorAll("input"))
        const sendInput = inputs.find(i => {
          const parent = i.closest("[class]")
          return parent?.textContent?.includes("보내는 금액") || parent?.textContent?.includes("보내는금액")
        })
        if (sendInput) {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
          setter?.call(sendInput, "1000000")
          sendInput.dispatchEvent(new Event("input", { bubbles: true }))
        }
      }, currency)
      await sleep(3000)
    }

    // Fallback: parse rate from page body text if API intercept missed
    // Use currency-specific regex so USD/other rates on the page are not captured
    if (!capturedRate) {
      const body: string = await page.evaluate(() => document.body.innerText)
      // "1 MYR = 373.45 KRW"
      const rateMatch = body.match(new RegExp(`1\\s+${currency}\\s*=\\s*([\\d,]+\\.?\\d*)\\s*KRW`, "i"))
      // "1,000 KRW = 2.68 MYR"
      const rateMatch2 = body.match(new RegExp(`([\\d,]+)\\s*KRW\\s*=\\s*([\\d,]+\\.?\\d*)\\s*${currency}`, "i"))
      const feeMatch = body.match(/수수료\s*[:\s]*([\d,]+)\s*KRW/i)

      let rate = 0
      if (rateMatch) rate = Number(rateMatch[1].replace(/,/g, ""))
      else if (rateMatch2) {
        const krw = Number(rateMatch2[1].replace(/,/g, ""))
        const foreign = Number(rateMatch2[2].replace(/,/g, ""))
        if (foreign > 0) rate = krw / foreign
      }
      const fee = feeMatch ? Number(feeMatch[1].replace(/,/g, "")) : 0

      if (rate > 0) {
        capturedRate = { rate, fee }
      }
    }

    await browser.close()

    if (!capturedRate) {
      return sendAmounts.map(amt => ({
        service: "WIREBARLEY", fromCurrency: "KRW", toCurrency: currency,
        sendAmountKrw: amt, recipientAmount: 0, recipientCurrency: currency,
        error: "환율 데이터를 가져오지 못했습니다",
        rawSnapshot: capturedRaw || undefined,
      }))
    }

    const { rate, fee } = capturedRate
    return sendAmounts.map(amt => ({
      service: "WIREBARLEY", fromCurrency: "KRW", toCurrency: currency,
      sendAmountKrw: amt,
      recipientAmount: (amt - fee) / rate,
      recipientCurrency: currency,
      exchangeRate: rate,
      feeKrw: fee,
      rawSnapshot: capturedRaw || undefined,
    }))
  } catch (e: any) {
    if (browser) await browser.close().catch(() => {})
    return sendAmounts.map(amt => ({
      service: "WIREBARLEY", fromCurrency: "KRW", toCurrency: currency,
      sendAmountKrw: amt, recipientAmount: 0, recipientCurrency: currency, error: e.message,
    }))
  }
}

export async function collectWirebarley(sendAmountKrw: number, toCurrency: string): Promise<QuoteResult> {
  const results = await collectWirebarleyBatch([sendAmountKrw], toCurrency)
  return results[0]
}
