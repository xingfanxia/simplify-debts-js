export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CNY'] as const

export type Currency = (typeof CURRENCIES)[number]

export interface Participant {
  id: string
  name: string
}

export interface Expense {
  id: string
  description: string
  paidBy: string
  amountCents: number
  splitWith: string[]
}

export interface Transfer {
  from: string
  to: string
  amountCents: number
}

export interface AppState {
  participants: Participant[]
  expenses: Expense[]
  currency: Currency
  roundToWhole: boolean
}

export interface HistoryEntry {
  id: string
  title: string
  savedAt: string
  state: AppState
}
