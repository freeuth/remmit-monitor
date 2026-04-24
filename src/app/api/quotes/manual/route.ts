import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Accept both camelCase (from frontend) and snake_case
    const toCurrency = (body.to_currency ?? body.toCurrency ?? "").toUpperCase()
    const sendAmountKrw = body.send_amount_krw ?? body.sendAmountKrw
    const recipientAmount = body.recipient_amount ?? body.recipientAmount
    const service = (body.service ?? "SENTBE").toUpperCase()
    const notes = body.notes ?? null

    if (!toCurrency || sendAmountKrw == null || recipientAmount == null) {
      return NextResponse.json({ error: "toCurrency, sendAmountKrw, recipientAmount는 필수입니다" }, { status: 400 })
    }

    // Manual quotes attach to the latest complete/partial session for this currency.
    // If none exists, create a standalone manual session.
    let sessionId: number = body.session_id ?? body.sessionId
    if (!sessionId) {
      const latest = await prisma.comparisonSession.findFirst({
        where: { toCurrency, status: { in: ["complete", "partial"] } },
        orderBy: { triggeredAt: "desc" },
      })
      if (latest) {
        sessionId = latest.id
      } else {
        const newSession = await prisma.comparisonSession.create({
          data: { toCurrency, triggeredBy: "manual", status: "complete", quotesCount: 0 },
        })
        sessionId = newSession.id
      }
    }

    const quote = await prisma.quote.create({
      data: {
        sessionId,
        service,
        fromCurrency: "KRW",
        toCurrency,
        sendAmountKrw,
        recipientAmount,
        recipientCurrency: toCurrency,
        exchangeRate: body.exchange_rate ?? body.exchangeRate ?? null,
        feeKrw: body.fee_krw ?? body.feeKrw ?? null,
        notes,
      },
    })
    return NextResponse.json(quote)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
