import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { collectMoin, collectHanpass, collectUtransfer, collectWirebarley } from "@/lib/collectors"
import type { QuoteResult } from "@/lib/collectors"

const DEFAULT_AMOUNTS = [500_000, 1_000_000, 3_000_000, 5_000_000]
const SUPPORTED_CURRENCIES = ["USD", "JPY", "EUR", "PHP", "VND", "THB", "CNY", "AUD", "GBP"]

type CollectorFn = (amount: number, currency: string) => Promise<QuoteResult>

// Fast collectors: direct HTTP API calls (no browser)
const FAST_COLLECTORS: Record<string, CollectorFn> = {
  MOIN: collectMoin,
  HANPASS: collectHanpass,
  UTRANSFER: collectUtransfer,
}

// Slow collectors: requires headless browser (run last, best-effort)
const SLOW_COLLECTORS: Record<string, CollectorFn> = {
  WIREBARLEY: collectWirebarley,
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const toCurrency: string = (body.to_currency ?? "USD").toUpperCase()
  const sendAmounts: number[] = body.send_amounts ?? DEFAULT_AMOUNTS
  const requestedServices: string[] = body.services ?? [
    ...Object.keys(FAST_COLLECTORS),
    ...Object.keys(SLOW_COLLECTORS),
  ]
  const triggeredBy: string = body.triggered_by ?? "manual"

  if (!SUPPORTED_CURRENCIES.includes(toCurrency)) {
    return NextResponse.json({ error: `Unsupported currency: ${toCurrency}` }, { status: 400 })
  }

  const session = await prisma.comparisonSession.create({
    data: { toCurrency, triggeredBy, status: "running" },
  })

  // Run all (amount × service) combos at once — much faster than sequential per amount
  const fastServices = requestedServices.filter(s => FAST_COLLECTORS[s])
  const slowServices = requestedServices.filter(s => SLOW_COLLECTORS[s])

  const allTasks = sendAmounts.flatMap(amount => [
    ...fastServices.map(s => FAST_COLLECTORS[s](amount, toCurrency)),
    ...slowServices.map(s => SLOW_COLLECTORS[s](amount, toCurrency)),
  ])

  const results = await Promise.allSettled(allTasks)

  let total = 0
  let failed = 0

  for (const result of results) {
    if (result.status === "rejected") { failed++; continue }
    const q = result.value
    if (q.error) failed++
    await prisma.quote.create({
      data: {
        sessionId: session.id,
        service: q.service,
        fromCurrency: q.fromCurrency,
        toCurrency: q.toCurrency,
        sendAmountKrw: q.sendAmountKrw,
        recipientAmount: q.recipientAmount,
        recipientCurrency: q.recipientCurrency,
        exchangeRate: q.exchangeRate ?? null,
        feeKrw: q.feeKrw ?? null,
        rawSnapshot: q.rawSnapshot ?? null,
        notes: q.error ? `ERROR: ${q.error}` : null,
      },
    })
    total++
  }

  const finalSession = await prisma.comparisonSession.update({
    where: { id: session.id },
    data: {
      status: failed === allTasks.length ? "failed" : failed > 0 ? "partial" : "complete",
      quotesCount: total,
    },
  })

  return NextResponse.json({ session_id: session.id, status: finalSession.status, quotes: total })
}
