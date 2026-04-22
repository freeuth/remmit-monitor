import { QuoteResult } from "./types"

const CHROMIUM_REMOTE_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar"

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

  const chromium = (await import("@sparticuz/chromium-min")).default
  const puppeteer = (await import("puppeteer-core")).default

  let browser
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(CHROMIUM_REMOTE_URL),
      headless: true,
    })

    const page = await browser.newPage()
    await page.goto("https://www.wirebarley.com/ko", { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(2000)

    // Set send amount
    const inputs = await page.$$("input")
    if (inputs[0]) {
      await inputs[0].click({ clickCount: 3 })
      await inputs[0].type(String(sendAmountKrw))
    }
    await page.waitForTimeout(800)

    // Change currency if needed
    if (currency !== "USD") {
      const buttons = await page.$$("button")
      for (const btn of buttons) {
        const text = await btn.evaluate(el => el.textContent ?? "")
        if (/USD|JPY|EUR|PHP/.test(text)) {
          await btn.click()
          await page.waitForTimeout(500)
          break
        }
      }
      await page.evaluate((c) => {
        const el = Array.from(document.querySelectorAll("li, button, div")).find(
          n => n.textContent?.trim() === c
        ) as HTMLElement | undefined
        el?.click()
      }, currency)
      await page.waitForTimeout(1200)
    }

    const snapshot = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll("input")) as HTMLInputElement[]
      const rateEl = Array.from(document.querySelectorAll("p, span")).find(
        el => el.textContent?.includes("=") && el.textContent?.includes("KRW")
      )
      const feeEl = Array.from(document.querySelectorAll("p, span, div")).find(
        el => el.textContent?.trim().match(/^[\d,]+ KRW$/) && el.closest("[class*='fee']")
      )
      return {
        sendValue: inputs[0]?.value ?? "",
        receiveValue: inputs[1]?.value ?? "",
        rateText: rateEl?.textContent?.trim() ?? null,
        feeText: feeEl?.textContent?.trim() ?? null,
      }
    })

    await browser.close()
    browser = undefined

    const recipient = Number(snapshot.receiveValue.replace(/,/g, "")) || 0

    let exchangeRate: number | undefined
    if (snapshot.rateText) {
      const m = snapshot.rateText.match(/=\s*([\d,]+\.?\d*)\s*KRW/)
      if (m) exchangeRate = Number(m[1].replace(/,/g, ""))
    }

    let feeKrw: number | undefined
    if (snapshot.feeText) {
      const m = snapshot.feeText.match(/([\d,]+)\s*KRW/)
      if (m) feeKrw = Number(m[1].replace(/,/g, ""))
    }

    return {
      service: "WIREBARLEY", fromCurrency: "KRW", toCurrency: currency,
      sendAmountKrw, recipientAmount: recipient, recipientCurrency: currency,
      exchangeRate, feeKrw, rawSnapshot: JSON.stringify(snapshot),
    }
  } catch (e: any) {
    if (browser) await browser.close().catch(() => {})
    return { service: "WIREBARLEY", fromCurrency: "KRW", toCurrency: currency,
      sendAmountKrw, recipientAmount: 0, recipientCurrency: currency, error: e.message }
  }
}
