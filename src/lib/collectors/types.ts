export interface QuoteResult {
  service: string
  fromCurrency: string
  toCurrency: string
  sendAmountKrw: number
  recipientAmount: number
  recipientCurrency: string
  exchangeRate?: number
  feeKrw?: number
  rawSnapshot?: string
  error?: string
}
