export type Quote = {
  id: number; sessionId: number; collectedAt: string
  service: string; fromCurrency: string; toCurrency: string
  sendAmountKrw: number; exchangeRate: number | null; feeKrw: number | null
  recipientAmount: number; recipientCurrency: string; notes: string | null
}
export type Session = {
  id: number; triggeredAt: string; triggeredBy: string
  toCurrency: string; status: string; quotesCount: number
}
export type MatrixRow = {
  sendAmountKrw: number
  quotes: Record<string, Quote>
  bestService: string | null
}
export type CompareLatest = { session: Session | null; matrix: MatrixRow[] }

export const SERVICE_LABELS: Record<string, string> = {
  MOIN: "모인", WIREBARLEY: "와이어바알리",
  HANPASS: "한패스", UTRANSFER: "유트랜스퍼", SENTBE: "센트비",
}
export const SERVICE_COLORS: Record<string, string> = {
  MOIN: "#2563eb", WIREBARLEY: "#16a34a",
  HANPASS: "#dc2626", UTRANSFER: "#9333ea", SENTBE: "#ea580c",
}
export const SERVICES = ["MOIN", "WIREBARLEY", "HANPASS", "UTRANSFER", "SENTBE"]
export const AMOUNTS = [500_000, 1_000_000, 3_000_000, 5_000_000]
export const CURRENCIES = ["USD", "JPY", "EUR", "PHP", "VND", "THB", "CNY", "AUD", "GBP"]

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export const runSession = (p: { to_currency: string; services?: string[] }) =>
  api<{ session_id: number }>("/sessions/run", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p),
  })

export const getSessions = () => api<Session[]>("/sessions")
export const getLatestComparison = (c: string) => api<CompareLatest>(`/compare/latest?to_currency=${c}`)
export const getHistory = (c: string, a: number) =>
  api<Record<string, { collectedAt: string; recipientAmount: number }[]>>(
    `/compare/history?to_currency=${c}&send_amount=${a}`
  )
export const addManualQuote = (data: object) =>
  api<Quote>("/quotes/manual", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
  })
