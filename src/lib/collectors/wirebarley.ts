import { QuoteResult } from "./types"

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const SUPPORTED: Record<string, true> = {
  USD: true, JPY: true, EUR: true, PHP: true,
  VND: true, THB: true, CNY: true, AUD: true,
  GBP: true, CAD: true, SGD: true, MYR: true, IDR: true,
}

export async function collectWirebarley(sendAmountKrw: number, toCurrency: string): Promise<QuoteResult> {
  const currency = toCurrency.toUpperCase()

  if (!SUPPORTED[currency]) {
    return { service: "WIREBARLEY", fromCurrency: "KRW", toCurrency: currency,
      sendAmountKrw, recipientAmount: 0, recipientCurrency: currency,
      error: `Unsupported currency: ${currency}` }
  }

  const apiKey = process.env.BROWSERLESS_API_KEY
  if (!apiKey) {
    return { service: "WIREBARLEY", fromCurrency: "KRW", toCurrency: currency,
      sendAmountKrw, recipientAmount: 0, recipientCurrency: currency,
      error: "BROWSERLESS_API_KEY not set" }
  }

  const puppeteer = (await import("puppeteer-core")).default

  let browser
  try {
    browser = await puppeteer.connect({
      browserWSEndpoint: `wss://production-sfo.browserless.io?token=${apiKey}&timeout=55000`,
    })

    const page = await browser.newPage()

    // Intercept WireBarley's internal API response to get the actual quote data
    let interceptedQuote: { recipientAmount: number; exchangeRate?: number; feeKrw?: number } | null = null

    page.on("response", async (response) => {
      const url = response.url()
      if (!url.includes("wirebarley") || !url.includes("calc")) return
      try {
        const json = await response.json()
        // WireBarley API returns { data: { receiveAmt, exchangeRate, fee, ... } }
        const d = json?.data ?? json?.result ?? json
        const recv = d?.receiveAmt ?? d?.receivingAmount ?? d?.toAmount ?? d?.amount
        if (recv != null && Number(recv) > 0) {
          interceptedQuote = {
            recipientAmount: Number(recv),
            exchangeRate: d?.exchangeRate ?? d?.rate ?? undefined,
            feeKrw: d?.fee ?? d?.feeAmount ?? undefined,
          }
        }
      } catch {}
    })

    await page.goto("https://www.wirebarley.com/ko", { waitUntil: "networkidle2", timeout: 25000 })
    await sleep(1500)

    // Change currency first if not USD
    if (currency !== "USD") {
      try {
        const currencyBtns = await page.$$("button")
        for (const btn of currencyBtns) {
          const txt = await btn.evaluate(el => el.textContent?.trim() ?? "")
          if (txt === "USD" || /^[A-Z]{3}$/.test(txt)) {
            await btn.click()
            await sleep(600)
            break
          }
        }
        // Click target currency in dropdown
        const items = await page.$$("li, [role='option']")
        for (const item of items) {
          const txt = await item.evaluate(el => el.textContent?.trim() ?? "")
          if (txt === currency || txt.startsWith(currency)) {
            await item.click()
            await sleep(800)
            break
          }
        }
      } catch {}
    }

    // Fill send amount — triggers recalculation and API call
    const inputs = await page.$$("input[type='text'], input[type='number'], input:not([type])")
    for (const input of inputs) {
      const isVisible = await input.evaluate(el => {
        const s = window.getComputedStyle(el)
        return s.display !== "none" && s.visibility !== "hidden"
      })
      if (!isVisible) continue
      await input.click({ clickCount: 3 })
      await input.type(String(sendAmountKrw), { delay: 30 })
      break
    }

    // Wait for API response to be intercepted (up to 6 seconds)
    for (let i = 0; i < 12; i++) {
      if (interceptedQuote) break
      await sleep(500)
    }

    // Fallback: read from DOM if interception failed
    if (!interceptedQuote) {
      const snapshot = await page.evaluate(() => {
        const allInputs = Array.from(document.querySelectorAll("input")) as HTMLInputElement[]
        const visibleInputs = allInputs.filter(el => {
          const s = window.getComputedStyle(el)
          return s.display !== "none" && s.visibility !== "hidden" && el.offsetWidth > 0
        })
        // Try to find receive amount input (second visible input, or one with larger value)
        const recvInput = visibleInputs[1] ?? visibleInputs[0]
        const rateEl = Array.from(document.querySelectorAll("*")).find(
          el => /1\s*(USD|JPY|EUR)\s*=\s*[\d,]+(\.\d+)?\s*KRW/.test(el.textContent ?? "")
        )
        return {
          receiveValue: recvInput?.value ?? "",
          rateText: rateEl?.textContent?.trim() ?? null,
        }
      })

      const recv = Number(snapshot.receiveValue.replace(/,/g, "")) || 0
      let exchangeRate: number | undefined
      if (snapshot.rateText) {
        const m = snapshot.rateText.match(/=\s*([\d,]+\.?\d*)\s*KRW/)
        if (m) exchangeRate = Number(m[1].replace(/,/g, ""))
      }
      interceptedQuote = { recipientAmount: recv, exchangeRate }
    }

    await browser.close()
    browser = undefined

    if (!interceptedQuote || interceptedQuote.recipientAmount === 0) {
      return { service: "WIREBARLEY", fromCurrency: "KRW", toCurrency: currency,
        sendAmountKrw, recipientAmount: 0, recipientCurrency: currency,
        error: "Could not read recipient amount from page" }
    }

    return {
      service: "WIREBARLEY", fromCurrency: "KRW", toCurrency: currency,
      sendAmountKrw,
      recipientAmount: interceptedQuote.recipientAmount,
      recipientCurrency: currency,
      exchangeRate: interceptedQuote.exchangeRate,
      feeKrw: interceptedQuote.feeKrw != null ? Math.round(interceptedQuote.feeKrw) : undefined,
    }
  } catch (e: any) {
    if (browser) await browser.close().catch(() => {})
    return { service: "WIREBARLEY", fromCurrency: "KRW", toCurrency: currency,
      sendAmountKrw, recipientAmount: 0, recipientCurrency: currency, error: e.message }
  }
}
