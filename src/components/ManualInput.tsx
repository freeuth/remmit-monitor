"use client"
import { useState } from "react"
import { AMOUNTS, CURRENCIES, addManualQuote } from "@/lib/api"

export default function ManualInput({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [currency, setCurrency] = useState("USD")
  const [amount, setAmount] = useState(1_000_000)
  const [recipient, setRecipient] = useState("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)

  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (!recipient) return
    setSaving(true)
    setError(null)
    try {
      await addManualQuote({
        service: "SENTBE",
        fromCurrency: "KRW",
        toCurrency: currency,
        sendAmountKrw: amount,
        recipientAmount: parseFloat(recipient),
        recipientCurrency: currency,
        notes: notes || null,
      })
      setRecipient("")
      setNotes("")
      setOpen(false)
      onSaved()
    } catch (e: any) {
      setError(e.message ?? "저장 실패")
    } finally {
      setSaving(false)
    }
  }

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      className="text-sm text-blue-600 hover:underline"
    >
      + 센트비 수동 입력
    </button>
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">센트비 수동 입력</h2>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-gray-500">통화</label>
          <select
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            value={currency} onChange={e => setCurrency(e.target.value)}
          >
            {CURRENCIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-500">송금액</label>
          <select
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            value={amount} onChange={e => setAmount(Number(e.target.value))}
          >
            {AMOUNTS.map(a => <option key={a} value={a}>{(a / 10000).toFixed(0)}만원</option>)}
          </select>
        </div>
        <div className="space-y-1 col-span-2">
          <label className="text-xs text-gray-500">최종 수취 금액</label>
          <input
            type="number"
            step="0.01"
            placeholder="예: 671.23"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={recipient}
            onChange={e => setRecipient(e.target.value)}
          />
        </div>
        <div className="space-y-1 col-span-2">
          <label className="text-xs text-gray-500">메모 (선택)</label>
          <input
            type="text"
            placeholder="예: 앱 직접 확인"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        onClick={save}
        disabled={saving || !recipient}
        className="w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {saving ? "저장 중..." : "저장"}
      </button>
    </div>
  )
}
