import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export async function GET(req: NextRequest) {
  const toCurrency = (req.nextUrl.searchParams.get("to_currency") ?? "USD").toUpperCase()
  const sendAmount = Number(req.nextUrl.searchParams.get("send_amount") ?? 1_000_000)

  const quotes = await prisma.quote.findMany({
    where: { toCurrency, sendAmountKrw: sendAmount },
    orderBy: { collectedAt: "asc" },
  })

  const byService: Record<string, { collectedAt: string; recipientAmount: number }[]> = {}
  for (const q of quotes) {
    if (!byService[q.service]) byService[q.service] = []
    byService[q.service].push({
      collectedAt: q.collectedAt.toISOString(),
      recipientAmount: q.recipientAmount,
    })
  }

  return NextResponse.json(byService)
}
