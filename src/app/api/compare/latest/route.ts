import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export async function GET(req: NextRequest) {
  const toCurrency = (req.nextUrl.searchParams.get("to_currency") ?? "USD").toUpperCase()

  const session = await prisma.comparisonSession.findFirst({
    where: { toCurrency, status: { in: ["complete", "partial"] } },
    orderBy: { triggeredAt: "desc" },
  })

  if (!session) return NextResponse.json({ session: null, matrix: [] })

  const quotes = await prisma.quote.findMany({ where: { sessionId: session.id } })

  // Group by sendAmountKrw → { [service]: quote }
  const byAmount: Record<number, Record<string, any>> = {}
  for (const q of quotes) {
    if (!byAmount[q.sendAmountKrw]) byAmount[q.sendAmountKrw] = {}
    byAmount[q.sendAmountKrw][q.service] = q
  }

  const matrix = Object.entries(byAmount)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([amt, quoteMap]) => {
      const amounts = Object.values(quoteMap) as any[]
      const successful = amounts.filter((q: any) => q.recipientAmount > 0)
      const best = successful.length
        ? successful.reduce((top: any, q: any) => q.recipientAmount > top.recipientAmount ? q : top)
        : null
      return { sendAmountKrw: Number(amt), quotes: quoteMap, bestService: best?.service ?? null }
    })

  return NextResponse.json({ session, matrix })
}
