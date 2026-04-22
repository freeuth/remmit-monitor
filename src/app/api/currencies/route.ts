import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json(["USD", "JPY", "EUR", "PHP", "VND", "THB", "CNY", "AUD", "GBP"])
}
