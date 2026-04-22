import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export async function GET() {
  const sessions = await prisma.comparisonSession.findMany({
    orderBy: { triggeredAt: "desc" },
    take: 50,
  })
  return NextResponse.json(sessions)
}
