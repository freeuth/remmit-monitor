import { NextResponse } from "next/server"
import { CURRENCIES } from "@/lib/api"

export async function GET() {
  return NextResponse.json(CURRENCIES)
}
