import { NextRequest, NextResponse } from "next/server"
import { waitUntil } from "@vercel/functions"
import { prisma } from "@/lib/db"
import { collectMoin, collectHanpass, collectUtransfer, collectWirebarley } from "@/lib/collectors"
import type { QuoteResult } from "@/lib/collectors"

const DEFAULT_AMOUNTS = [500_000, 1_000_000, 3_000_000, 5_000_000]
const SUPPORTED_CURRENCIES = ["USD", "JPY", "EUR", "PHP", "VND", "THB", "CNY", "AUD", "GBP"]

type CollectorFn = (amount: number, currency: string) => Promise<QuoteResult>
const COLLECTORS: Record<string, CollectorFn> = {
  MOIN: collectMoin,
  HANPASS: collectHanpass,
  UTRANSFER: collectUtransfer,
  WIREBARLEY: collectWirebarley,
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const toCurrency: string = (body.to_currency ?? "USD").toUpperCase()
  const sendAmounts: number[] = body.send_amounts ?? DEFAULT_AMOUNTS
  const services: string[] = body.services ?? Object.keys(COLLECTORS)
  const triggeredBy: string = body.triggered_by ?? "manual"

  if (!SUPPORTED_CURRENCIES.includes(toCurrency)) {
    return NextResponse.json({ error: `Unsupported currency: ${toCurrency}` }, { status: 400 })
  }

  const session = await prisma.comparisonSession.create({
    data: { toCurrency, triggeredBy, status: "running" },
  })

  // Keep function alive until collection finishes (Vercel waitUntil)
  waitUntil(runCollection(session.id, toCurrency, sendAmounts, services).catch(console.error))

  return NextResponse.json({ session_id: session.id, status: "running" })
}

async function runCollection(
  sessionId: number,
  toCurrency: string,
  sendAmounts: number[],
  services: string[]
) {
  let total = 0
  let failed = 0

  for (const amount of sendAmounts) {
    const results = await Promise.allSettled(
      services
        .filter((s) => COLLECTORS[s])
        .map((s) => COLLECTORS[s](amount, toCurrency))
    )

    for (const result of results) {
      if (result.status === "rejected") { failed++; continue }
      const q = result.value
      if (q.error) failed++

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
      total++
    }
  }

  await prisma.comparisonSession.update({
    where: { id: sessionId },
    data: {
      status: failed > 0 ? "partial" : "complete",
      quotesCount: total,
    },
  })
}
