import { QuoteResult } from "./types"

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const SUPPORTED: Record<string, true> = {
  USD: true, JPY: true, EUR: true, PHP: true,
  VND: true, THB: true, CNY: true, AUD: true,
  GBP: true, CAD: true, SGD: true, MYR: true, IDR: true,
  HKD: true, NZD: true, INR: true, CHF: true,
  SEK: true, NOK: true, DKK: true, AED: true,
}

// Set React-controlled input value via nativeInputValueSetter
const JS_SET_INPUT = `
  (function(labelText, value) {
    var labels = Array.from(document.querySelectorAll('p'));
    var label = labels.find(function(p) { return p.textContent && p.textContent.trim() === labelText; });
    var input = label && label.parentElement && label.parentElement.querySelector('input');
    if (!input) return false;
    var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') && Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    if (setter) setter.call(input, String(value));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })
`

// Read React-controlled input value by label
const JS_READ_INPUT = `
  (function(labelText) {
    var labels = Array.from(document.querySelectorAll('p'));
    var label = labels.find(function(p) { return p.textContent && p.textContent.trim() === labelText; });
    var input = label && label.parentElement && label.parentElement.querySelector('input');
    if (!input) return null;
    return input.value;
  })
`

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

    await page.goto("https://www.wirebarley.com/ko", { waitUntil: "domcontentloaded", timeout: 25000 })
    await sleep(3000)

    // Verify send amount input exists
    const sendInputFound = await page.evaluate(JS_SET_INPUT + `('보내는 금액', '1000000')`)
    if (!sendInputFound) {
      throw new Error("보내는 금액 input을 찾지 못함 — 페이지 구조 변경됨")
    }
    await sleep(1500)

    // Change currency if not USD
    if (currency !== "USD") {
      // Open currency dropdown by clicking the cursor-pointer div containing current currency text
      await page.evaluate((c: string) => {
        const all = Array.from(document.querySelectorAll("*"))
        const currEl = all.find((el: any) => {
          const rect = el.getBoundingClientRect()
          return rect.width > 0 && rect.height > 0
            && el.children.length === 0
            && /^[A-Z]{3}$/.test((el.textContent ?? "").trim())
        })
        const trigger = currEl?.closest("[class*='cursor-pointer']") as HTMLElement | undefined
        trigger?.click()
      }, currency)
      await sleep(800)

      // Click the row with matching currency code
      const selected = await page.evaluate((c: string) => {
        const all = Array.from(document.querySelectorAll("*"))
        const codeEl = all.find((el: any) => {
          const rect = el.getBoundingClientRect()
          return rect.width > 0 && el.children.length === 0 && (el.textContent ?? "").trim() === c
        })
        const row = codeEl?.closest("[class*='group'], [class*='cursor']") as HTMLElement | undefined
        if (row) { row.click(); return true }
        return false
      }, currency)

      if (!selected) {
        await browser.close()
        return sendAmounts.map(amt => ({
          service: "WIREBARLEY", fromCurrency: "KRW", toCurrency: currency,
          sendAmountKrw: amt, recipientAmount: 0, recipientCurrency: currency,
          error: `Unsupported currency: ${currency}`,
        }))
      }
      await sleep(2000)
    }

    const results: QuoteResult[] = []

    for (const amount of sendAmounts) {
      // Set send amount
      await page.evaluate(JS_SET_INPUT + `('보내는 금액', '${amount}')`)
      await sleep(2000)

      // Read receive amount directly from input
      const recvRaw = await page.evaluate(JS_READ_INPUT + `('받는 금액')`) as string | null
      const recipientAmount = recvRaw ? Number(recvRaw.replace(/,/g, "")) : 0

      // Parse exchange rate and fee from body text
      const body: string = await page.evaluate(() => document.body.innerText)

      let exchangeRate: number | undefined
      // Format A: "1 USD = 1,491.65 KRW"
      const rateA = body.match(/1\s+[A-Z]{3}\s*=\s*([\d,]+\.?\d*)\s*KRW/)
      if (rateA) exchangeRate = Number(rateA[1].replace(/,/g, ""))
      // Format B: "1,000 KRW = 17,613.57 VND" → convert to KRW per 1 foreign
      if (!exchangeRate) {
        const rateB = body.match(/([\d,]+)\s*KRW\s*=\s*([\d,]+\.?\d*)\s*[A-Z]{3}/)
        if (rateB) {
          const krw = Number(rateB[1].replace(/,/g, ""))
          const foreign = Number(rateB[2].replace(/,/g, ""))
          if (foreign > 0) exchangeRate = krw / foreign
        }
      }

      const feeMatch = body.match(/수수료\s*\n\s*([\d,]+)\s*KRW/)
      const feeKrw = feeMatch ? Number(feeMatch[1].replace(/,/g, "")) : undefined

      results.push({
        service: "WIREBARLEY", fromCurrency: "KRW", toCurrency: currency,
        sendAmountKrw: amount,
        recipientAmount,
        recipientCurrency: currency,
        exchangeRate,
        feeKrw,
        error: recipientAmount === 0 ? "Could not read recipient amount" : undefined,
      })
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
