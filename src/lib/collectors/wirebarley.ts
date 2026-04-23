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

    // Capture all exrate API responses
    const allExrates: Array<{ url: string; rate: number; fee: number; raw: string }> = []
    page.on("response", async (response) => {
      const url = response.url()
      if (!url.includes("/remittance/api/v2/exrate/")) return
      if (!response.ok()) return
      try {
        const json = await response.json()
        const d = json?.data
        if (!d) return
        const rate = d.exchangeRate ?? d.exrate ?? d.rate ?? d.ex_rate ?? d.krwPerUnit
        const fee = d.fee ?? d.transferFee ?? d.transfer_fee ?? d.feeKrw ?? 0
        if (rate && Number(rate) > 0) {
          allExrates.push({ url, rate: Number(rate), fee: Number(fee), raw: JSON.stringify(json) })
        }
      } catch {}
    })

    // Always start from a different currency page so the target selection
    // always triggers a fresh exrate API call (same-URL navigation does nothing)
    const startSlug = slug === "usd" ? "jpy" : "usd"
    const pageUrl = `https://www.wirebarley.com/kr/ko/${startSlug}`
    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 25000 })
    await sleep(3000)

    // Step 1: click the [flag USD ▼] button to open the country list
    // It's a cursor-pointer div wrapping a <p> with 3-letter non-KRW currency code
    const opened = await page.evaluate(() => {
      const divs = Array.from(document.querySelectorAll("div[class*='cursor-pointer']"))
      const target = divs.find(d => {
        const p = d.querySelector("p")
        const text = p?.textContent?.trim() ?? ""
        return /^[A-Z]{3}$/.test(text) && text !== "KRW"
      })
      if (target) { ;(target as HTMLElement).click(); return true }
      return false
    })

    await sleep(1500)

    // Step 2: click the country button whose text ends with the target currency code
    // e.g. button text = "말레이시아MYR" → matches currency "MYR"
    const selected = await page.evaluate((cur: string) => {
      const btns = Array.from(document.querySelectorAll("button"))
      const target = btns.find(btn => {
        const text = btn.textContent?.trim() ?? ""
        return text.endsWith(cur) && text.length < 40
      })
      if (target) { ;(target as HTMLElement).click(); return true }
      return false
    }, currency)

    // Country click may trigger page navigation (e.g. Japan → /?lang=ko)
    // Wait for navigation first, then extra time for React render
    await Promise.race([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 8000 }).catch(() => {}),
      sleep(3000),
    ])
    await sleep(2000) // additional settle time after navigation/render

    // Pick best captured exrate: URL-matching first, else last
    let capturedRate: WbRate | null = null
    let capturedRaw = ""
    if (allExrates.length) {
      const match = allExrates.find(e => e.url.toUpperCase().includes(currency))
        ?? allExrates[allExrates.length - 1]
      capturedRate = { rate: match.rate, fee: match.fee }
      capturedRaw = match.raw
    }

    // Fallback 1: parse rate from body text (currency-specific regex)
    if (!capturedRate) {
      const body: string = await page.evaluate(() => document.body.innerText)
      const rateMatch = body.match(new RegExp(`1\\s+${currency}\\s*=\\s*([\\d,]+\\.?\\d*)\\s*KRW`, "i"))
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
      if (rate > 0) capturedRate = { rate, fee }
    }

    // Fallback 2: read send/receive amounts directly from calculator DOM buttons
    // (works when page navigates e.g. JP→/?lang=ko and shows amounts without API call)
    if (!capturedRate) {
      const domRate = await page.evaluate((sendAmt: number) => {
        const btns = Array.from(document.querySelectorAll("button[class*='w-full text-left']"))
        const vals = btns.map(b => Number(b.textContent?.trim().replace(/,/g, "") ?? "0")).filter(v => v > 0)
        const send = vals.find(v => Math.abs(v - sendAmt) < sendAmt * 0.01)
        const receive = vals.find(v => v !== send && v > 0)
        if (send && receive) return send / receive
        return null
      }, sendAmounts[0])
      if (domRate && domRate > 0) capturedRate = { rate: domRate, fee: 0 }
    }

    await browser.close()

    if (!capturedRate) {
      return sendAmounts.map(amt => ({
        service: "WIREBARLEY", fromCurrency: "KRW", toCurrency: currency,
        sendAmountKrw: amt, recipientAmount: 0, recipientCurrency: currency,
        error: `환율 데이터를 가져오지 못했습니다 (opened=${opened}, selected=${selected})`,
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
