import { QuoteResult } from "./types"

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const SUPPORTED: Record<string, true> = {
  USD: true, JPY: true, EUR: true, PHP: true,
  VND: true, THB: true, CNY: true, AUD: true,
  GBP: true, CAD: true, SGD: true, MYR: true, IDR: true,
  HKD: true, NZD: true, INR: true, CHF: true,
  SEK: true, NOK: true, DKK: true, AED: true,
}

type Intercepted = { recipientAmount: number; exchangeRate?: number; feeKrw?: number }

// Parse receive amount from page body text
// e.g. "받는 금액  670.30  USD" or "보내는 금액  1,000,000  받는 금액  670.30"
function parseReceiveFromBody(body: string, currency: string): number {
  // Try "받는 금액 NNN" pattern
  const patterns = [
    new RegExp(`받는\\s*금액[\\s\\n]*(${currency})?[\\s\\n]*([\\d,]+\\.?\\d*)[\\s\\n]*${currency}?`),
    new RegExp(`([\\d,]+\\.?\\d*)[\\s\\n]*${currency}[\\s\\n]*$`, "m"),
  ]
  for (const p of patterns) {
    const m = body.match(p)
    if (m) {
      const val = Number((m[2] ?? m[1]).replace(/,/g, ""))
      if (val > 0 && val < 100_000_000) return val
    }
  }
  // Fallback: find all decimals in the vicinity of the currency name
  const idx = body.indexOf(currency)
  if (idx >= 0) {
    const nearby = body.slice(Math.max(0, idx - 30), idx + 30)
    const nums = nearby.match(/[\d,]+\.\d+/g)
    if (nums) {
      const v = Number(nums[0].replace(/,/g, ""))
      if (v > 0) return v
    }
  }
  return 0
}

// Click the send-amount element and type a new value
async function setSendAmount(page: any, amount: number): Promise<boolean> {
  return page.evaluate(async (amt: number) => {
    // Find element showing a large KRW number (the send amount display)
    const allEls = Array.from(document.querySelectorAll("*")) as HTMLElement[]
    const candidates = allEls.filter(el => {
      if (el.children.length > 0) return false
      const txt = el.innerText?.trim().replace(/,/g, "") ?? ""
      const n = Number(txt)
      return n >= 100000 && n <= 10_000_000 && el.offsetWidth > 0
    })

    const el = candidates[0]
    if (!el) return false

    el.click()
    el.focus()
    await new Promise(r => setTimeout(r, 300))

    // If contenteditable
    if (el.isContentEditable) {
      el.innerText = String(amt)
      el.dispatchEvent(new Event("input", { bubbles: true }))
      el.dispatchEvent(new Event("change", { bubbles: true }))
      return true
    }

    // Try selecting all and typing
    document.execCommand?.("selectAll")
    document.execCommand?.("insertText", false, String(amt))
    return true
  }, amount)
}

export async function collectWirebarleyBatch(
  sendAmounts: number[],
  toCurrency: string
): Promise<QuoteResult[]> {
  const currency = toCurrency.toUpperCase()

  if (!SUPPORTED[currency]) {
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
    await page.setExtraHTTPHeaders({ "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8" })
    await page.setViewport({ width: 1280, height: 900 })
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "language", { get: () => "ko-KR" })
      Object.defineProperty(navigator, "languages", { get: () => ["ko-KR", "ko"] })
    })
    await page.setCookie({ name: "lang", value: "ko", domain: ".wirebarley.com" })

    // Intercept API responses
    const state = { last: null as Intercepted | null }
    page.on("response", async (response: any) => {
      try {
        const ct = response.headers()["content-type"] ?? ""
        if (!ct.includes("json")) return
        const json = await response.json()
        const candidates = [json, json?.data, json?.result, json?.response, json?.payload]
        for (const d of candidates) {
          if (!d || typeof d !== "object") continue
          const recv =
            d.receiveAmt ?? d.receivingAmount ?? d.toAmount ??
            d.receiveAmount ?? d.targetAmount ?? d.destinationAmount?.amount ??
            d.receive ?? d.recipientAmount
          if (recv != null && Number(recv) > 0 && Number(recv) < 1_000_000) {
            state.last = {
              recipientAmount: Number(recv),
              exchangeRate: d.exchangeRate ?? d.rate ?? d.fxRate,
              feeKrw: d.fee ?? d.feeAmount ?? d.transferFee,
            }
            return
          }
        }
      } catch {}
    })

    await page.goto("https://www.wirebarley.com/ko", { waitUntil: "domcontentloaded", timeout: 25000 })
    await sleep(2000)

    // Click 시작하기 to reveal calculator
    await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll("a, button")).find(
        (el: any) => el.textContent?.trim() === "시작하기"
      ) as HTMLElement | undefined
      el?.click()
    })
    await sleep(3000)

    // Change currency if needed (look for currency selector)
    if (currency !== "USD") {
      try {
        // Click current currency display (likely "USD" text in a button)
        await page.evaluate(() => {
          const el = Array.from(document.querySelectorAll("*")).find(
            (el: any) => el.innerText?.trim() === "USD" && el.offsetWidth > 0
          ) as HTMLElement | undefined
          el?.click()
        })
        await sleep(800)
        // Click target currency in dropdown
        await page.evaluate((c: string) => {
          const el = Array.from(document.querySelectorAll("*")).find(
            (el: any) => el.innerText?.trim() === c && el.offsetWidth > 0
          ) as HTMLElement | undefined
          el?.click()
        }, currency)
        await sleep(1500)
      } catch {}
    }

    const results: QuoteResult[] = []

    for (const amount of sendAmounts) {
      state.last = null

      // Try to change the send amount
      const changed = await setSendAmount(page, amount)
      if (changed) {
        // Trigger keyboard events to force recalculation
        await page.keyboard.press("Tab")
        await page.keyboard.press("Enter")
        await sleep(2000)
      }

      // Wait up to 4s for API response
      for (let i = 0; i < 8; i++) {
        if (state.last) break
        await sleep(500)
      }

      const captured = state.last as Intercepted | null

      if (captured && captured.recipientAmount > 0) {
        results.push({
          service: "WIREBARLEY", fromCurrency: "KRW", toCurrency: currency,
          sendAmountKrw: amount,
          recipientAmount: captured.recipientAmount,
          recipientCurrency: currency,
          exchangeRate: captured.exchangeRate,
          feeKrw: captured.feeKrw != null ? Math.round(captured.feeKrw) : undefined,
        })
      } else {
        // Fallback: parse receive amount from page body text
        const body = await page.evaluate(() => document.body.innerText)
        const recv = parseReceiveFromBody(body, currency)
        results.push({
          service: "WIREBARLEY", fromCurrency: "KRW", toCurrency: currency,
          sendAmountKrw: amount,
          recipientAmount: recv,
          recipientCurrency: currency,
          rawSnapshot: body.slice(0, 300),
          error: recv === 0 ? "Could not read recipient amount" : undefined,
        })
      }
    }

    await browser.close()
    return results
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
