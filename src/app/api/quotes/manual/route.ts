import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export async function POST(req: NextRequest) {
  const body = await req.json()
  const quote = await prisma.quote.create({
    data: {
      sessionId: body.session_id,
      service: (body.service ?? "SENTBE").toUpperCase(),
      fromCurrency: "KRW",
      toCurrency: body.to_currency.toUpperCase(),
      sendAmountKrw: body.send_amount_krw,
      recipientAmount: body.recipient_amount,
      recipientCurrency: body.to_currency.toUpperCase(),
      exchangeRate: body.exchange_rate ?? null,
      feeKrw: body.fee_krw ?? null,
      notes: body.notes ?? null,
    },
  })
  return NextResponse.json(quote)
}
