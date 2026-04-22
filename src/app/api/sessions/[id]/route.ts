import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await prisma.comparisonSession.findUnique({
    where: { id: Number(params.id) },
    include: { quotes: true },
  })
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(session)
}
