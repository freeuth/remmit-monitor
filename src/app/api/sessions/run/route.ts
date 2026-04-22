import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { collectMoin, collectHanpass, collectUtransfer } from "@/lib/collectors"
import { collectWirebarleyBatch } from "@/lib/collectors/wirebarley"
import type { QuoteResult } from "@/lib/collectors"

const DEFAULT_AMOUNTS = [500_000, 1_000_000, 3_000_000, 5_000_000]
const SUPPORTED_CURRENCIES = ["USD", "JPY", "EUR", "PHP", "VND", "THB", "CNY", "AUD", "GBP"]

type CollectorFn = (amount: number, currency: string) => Promise<QuoteResult>
const FAST_COLLECTORS: Record<string, CollectorFn> = {
  MOIN: collectMoin,
  HANPASS: collectHanpass,
  UTRANSFER: collectUtransfer,
}

async function saveQuote(sessionId: number, q: QuoteResult): Promise<void> {
  await prisma.quote.create({
    data: {
      sessionId,
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
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const toCurrency: string = (body.to_currency ?? "USD").toUpperCase()
  const sendAmounts: number[] = body.send_amounts ?? DEFAULT_AMOUNTS
  const requestedServices: string[] = body.services ?? [
    ...Object.keys(FAST_COLLECTORS),
    "WIREBARLEY",
  ]
  const triggeredBy: string = body.triggered_by ?? "manual"

  if (!SUPPORTED_CURRENCIES.includes(toCurrency)) {
    return NextResponse.json({ error: `Unsupported currency: ${toCurrency}` }, { status: 400 })
  }

  const fastServices = requestedServices.filter(s => FAST_COLLECTORS[s])
  const includeWirebarley = requestedServices.includes("WIREBARLEY")
  const totalExpected = fastServices.length * sendAmounts.length + (includeWirebarley ? sendAmounts.length : 0)

  const session = await prisma.comparisonSession.create({
    data: { toCurrency, triggeredBy, status: "running" },
  })

  let saved = 0
  let failed = 0

  const bump = () =>
    prisma.comparisonSession.update({
      where: { id: session.id },
      data: { quotesCount: saved },
    })

  // Fast collectors: all in parallel, then save per-amount batch for progress updates
  for (const amount of sendAmounts) {
    const results = await Promise.allSettled(
      fastServices.map(s => FAST_COLLECTORS[s](amount, toCurrency))
    )
    for (const r of results) {
      if (r.status === "rejected") { failed++; continue }
      if (r.value.error) failed++
      await saveQuote(session.id, r.value)
      saved++
    }
    await bump()
  }

  // WireBarley: single browser session for all amounts
  if (includeWirebarley) {
    const wbResults = await collectWirebarleyBatch(sendAmounts, toCurrency)
    for (const q of wbResults) {
      if (q.error) failed++
      await saveQuote(session.id, q)
      saved++
      await bump()
    }
  }

  const finalSession = await prisma.comparisonSession.update({
    where: { id: session.id },
    data: {
      status: failed === totalExpected ? "failed" : failed > 0 ? "partial" : "complete",
      quotesCount: saved,
    },
  })

  return NextResponse.json({ session_id: session.id, status: finalSession.status, quotes: saved, total: totalExpected })
}
