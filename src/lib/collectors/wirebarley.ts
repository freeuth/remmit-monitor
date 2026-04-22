import { QuoteResult } from "./types"

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const SUPPORTED: Record<string, true> = {
  USD: true, JPY: true, EUR: true, PHP: true,
  VND: true, THB: true, CNY: true, AUD: true,
  GBP: true, CAD: true, SGD: true, MYR: true, IDR: true,
  HKD: true, NZD: true, INR: true, CHF: true,
  SEK: true, NOK: true, DKK: true, AED: true,
}

// Collect all amounts in one browser session (much faster)
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
      browserWSEndpoint: `wss://production-sfo.browserless.io?token=${apiKey}&timeout=55000`,
    })

    const page = await browser.newPage()

    // Collect intercepted quotes keyed by amount
    const intercepted = new Map<number, { recipientAmount: number; exchangeRate?: number; feeKrw?: number }>()
    let lastIntercepted: typeof intercepted extends Map<any, infer V> ? V : never = null as any

    page.on("response", async (response) => {
      const url = response.url()
      if (!url.includes("wirebarley")) return
      try {
        const ct = response.headers()["content-type"] ?? ""
        if (!ct.includes("json")) return
        const json = await response.json()
        const d = json?.data ?? json?.result ?? json
        const recv = d?.receiveAmt ?? d?.receivingAmount ?? d?.toAmount ?? d?.amount
        if (recv != null && Number(recv) > 0) {
          lastIntercepted = {
            recipientAmount: Number(recv),
            exchangeRate: d?.exchangeRate ?? d?.rate,
            feeKrw: d?.fee ?? d?.feeAmount,
          }
        }
      } catch {}
    })

    await page.goto("https://www.wirebarley.com/ko", { waitUntil: "networkidle2", timeout: 25000 })
    await sleep(1500)

    // Change currency once if needed
    if (currency !== "USD") {
      try {
        const btns = await page.$$("button")
        for (const btn of btns) {
          const txt = await btn.evaluate(el => el.textContent?.trim() ?? "")
          if (/^[A-Z]{3}$/.test(txt)) {
            await btn.click()
            await sleep(600)
            break
          }
        }
        const items = await page.$$("li, [role='option']")
        for (const item of items) {
          const txt = await item.evaluate(el => el.textContent?.trim() ?? "")
          if (txt === currency || txt.startsWith(currency + " ")) {
            await item.click()
            await sleep(1000)
            break
          }
        }
      } catch {}
    }

    // Find the send amount input once
    const allInputs = await page.$$("input")
    let sendInput = null
    for (const input of allInputs) {
      const visible = await input.evaluate(el => {
        const s = window.getComputedStyle(el)
        return s.display !== "none" && s.visibility !== "hidden" && el.offsetWidth > 0
      })
      if (visible) { sendInput = input; break }
    }

    // Loop through amounts — reuse the same page
    const results: QuoteResult[] = []
    for (const amount of sendAmounts) {
      lastIntercepted = null as any

      if (sendInput) {
        await sendInput.click({ clickCount: 3 })
        await sendInput.type(String(amount), { delay: 30 })
      }

      // Wait up to 5s for API response
      for (let i = 0; i < 10; i++) {
        if (lastIntercepted) break
        await sleep(500)
      }

      // Fallback: read from DOM
      if (!lastIntercepted) {
        const domRecv = await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll("input")) as HTMLInputElement[]
          const visible = inputs.filter(el => {
            const s = window.getComputedStyle(el)
            return s.display !== "none" && s.visibility !== "hidden" && el.offsetWidth > 0
          })
          return visible[1]?.value ?? visible[0]?.value ?? ""
        })
        const recv = Number(domRecv.replace(/,/g, "")) || 0
        results.push({
          service: "WIREBARLEY", fromCurrency: "KRW", toCurrency: currency,
          sendAmountKrw: amount, recipientAmount: recv, recipientCurrency: currency,
          error: recv === 0 ? "Could not read recipient amount" : undefined,
        })
      } else {
        intercepted.set(amount, lastIntercepted)
        results.push({
          service: "WIREBARLEY", fromCurrency: "KRW", toCurrency: currency,
          sendAmountKrw: amount,
          recipientAmount: lastIntercepted.recipientAmount,
          recipientCurrency: currency,
          exchangeRate: lastIntercepted.exchangeRate,
          feeKrw: lastIntercepted.feeKrw != null ? Math.round(lastIntercepted.feeKrw) : undefined,
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

// Single-amount wrapper (kept for compatibility)
export async function collectWirebarley(sendAmountKrw: number, toCurrency: string): Promise<QuoteResult> {
  const results = await collectWirebarleyBatch([sendAmountKrw], toCurrency)
  return results[0]
}
