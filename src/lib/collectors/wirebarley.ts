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
    const debugResponses: string[] = []
    let lastIntercepted: Intercepted | null = null
    // eslint-disable-next-line prefer-const

    // Intercept ALL JSON responses from wirebarley domain
    page.on("response", async (response) => {
      const url = response.url()
      if (!url.includes("wirebarley")) return
      try {
        const ct = response.headers()["content-type"] ?? ""
        if (!ct.includes("json")) return
        const json = await response.json()

        // Try multiple response shapes
        const candidates = [
          json,
          json?.data,
          json?.result,
          json?.response,
          json?.payload,
          ...(Array.isArray(json?.data) ? json.data : []),
        ]

        for (const d of candidates) {
          if (!d || typeof d !== "object") continue
          const recv =
            d.receiveAmt ?? d.receivingAmount ?? d.toAmount ??
            d.receiveAmount ?? d.targetAmount ?? d.destinationAmount?.amount ??
            d.amount ?? d.receive ?? d.recipientAmount
          if (recv != null && Number(recv) > 0) {
            lastIntercepted = {
              recipientAmount: Number(recv),
              exchangeRate: d.exchangeRate ?? d.rate ?? d.fxRate ?? d.baseRate,
              feeKrw: d.fee ?? d.feeAmount ?? d.transferFee,
            }
            debugResponses.push(`${url} → recv=${recv}`)
            return
          }
        }
        // Log any wirebarley JSON for debugging
        debugResponses.push(`${url} → keys=${Object.keys(json).join(",")}`)
      } catch {}
    })

    await page.goto("https://www.wirebarley.com/ko", { waitUntil: "networkidle2", timeout: 25000 })
    await sleep(2000)

    // Change currency once if needed
    if (currency !== "USD") {
      try {
        const btns = await page.$$("button")
        for (const btn of btns) {
          const txt = await btn.evaluate(el => el.textContent?.trim() ?? "")
          if (/^[A-Z]{3}$/.test(txt)) {
            await btn.click()
            await sleep(800)
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

    // Find the send amount input
    const allInputs = await page.$$("input")
    let sendInput = null
    for (const input of allInputs) {
      const visible = await input.evaluate(el => {
        const s = window.getComputedStyle(el)
        return s.display !== "none" && s.visibility !== "hidden" && el.offsetWidth > 0
      })
      if (visible) { sendInput = input; break }
    }

    const results: QuoteResult[] = []

    for (const amount of sendAmounts) {
      lastIntercepted = null

      if (sendInput) {
        await sendInput.click({ clickCount: 3 })
        await sendInput.type(String(amount), { delay: 50 })
        // Also try pressing Enter/Tab to trigger recalculation
        await sendInput.press("Tab")
      }

      // Wait up to 6s for API response
      for (let i = 0; i < 12; i++) {
        if (lastIntercepted) break
        await sleep(500)
      }

      const captured = lastIntercepted
      if (captured) {
        results.push({
          service: "WIREBARLEY", fromCurrency: "KRW", toCurrency: currency,
          sendAmountKrw: amount,
          recipientAmount: captured.recipientAmount,
          recipientCurrency: currency,
          exchangeRate: captured.exchangeRate,
          feeKrw: captured.feeKrw != null ? Math.round(captured.feeKrw) : undefined,
          rawSnapshot: debugResponses.slice(-3).join(" | "),
        })
      } else {
        // DOM fallback
        const domRecv = await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll("input")) as HTMLInputElement[]
          const visible = inputs.filter(el => {
            const s = window.getComputedStyle(el)
            return s.display !== "none" && s.visibility !== "hidden" && el.offsetWidth > 0
          })
          return visible.map(el => el.value).join("|")
        })
        const nums = domRecv.split("|").map(v => Number(v.replace(/,/g, ""))).filter(n => n > 0 && n < 1_000_000)
        const recv = nums[1] ?? nums[0] ?? 0
        results.push({
          service: "WIREBARLEY", fromCurrency: "KRW", toCurrency: currency,
          sendAmountKrw: amount,
          recipientAmount: recv,
          recipientCurrency: currency,
          rawSnapshot: `debug: ${debugResponses.slice(-5).join(" | ")} | dom: ${domRecv}`,
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
