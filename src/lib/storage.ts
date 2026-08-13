import { CURRENCIES, type AppState, type Currency, type Expense, type HistoryEntry, type Participant } from '../types'

export const CURRENT_STATE_KEY = 'settle-app-state-v2'
export const HISTORY_KEY = 'settle-history-v1'
export const MAX_HISTORY_ENTRIES = 50

export const EMPTY_STATE: AppState = {
  participants: [],
  expenses: [],
  currency: 'USD',
  roundToWhole: false,
}

interface HistoryStore {
  version: 1
  entries: HistoryEntry[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function parseAppState(value: unknown): AppState | null {
  if (!isRecord(value) || !Array.isArray(value.participants) || !Array.isArray(value.expenses)) {
    return null
  }

  const participants: Participant[] = value.participants.filter(
    (participant): participant is Participant =>
      isRecord(participant) &&
      typeof participant.id === 'string' &&
      typeof participant.name === 'string' &&
      participant.id.length > 0 &&
      participant.name.trim().length > 0,
  )
  const participantIds = new Set(participants.map(({ id }) => id))
  const expenses: Expense[] = value.expenses.filter(
    (expense): expense is Expense =>
      isRecord(expense) &&
      typeof expense.id === 'string' &&
      typeof expense.description === 'string' &&
      typeof expense.paidBy === 'string' &&
      participantIds.has(expense.paidBy) &&
      typeof expense.amountCents === 'number' &&
      Number.isSafeInteger(expense.amountCents) &&
      expense.amountCents > 0 &&
      Array.isArray(expense.splitWith) &&
      expense.splitWith.length > 0 &&
      expense.splitWith.every((id) => typeof id === 'string' && participantIds.has(id)),
  )
  const currency = CURRENCIES.includes(value.currency as Currency)
    ? (value.currency as Currency)
    : 'USD'

  return {
    participants,
    expenses,
    currency,
    roundToWhole: value.roundToWhole === true,
  }
}

export function loadCurrentState(storage: Storage = window.localStorage): AppState {
  try {
    const stored = storage.getItem(CURRENT_STATE_KEY)
    return stored ? (parseAppState(JSON.parse(stored)) ?? EMPTY_STATE) : EMPTY_STATE
  } catch {
    return EMPTY_STATE
  }
}

export function saveCurrentState(state: AppState, storage: Storage = window.localStorage): void {
  storage.setItem(CURRENT_STATE_KEY, JSON.stringify(state))
}

function parseHistoryEntry(value: unknown): HistoryEntry | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.savedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.savedAt))
  ) {
    return null
  }

  const state = parseAppState(value.state)
  const title = value.title.trim().slice(0, 80)
  if (!state || !title) return null

  return { id: value.id, title, savedAt: value.savedAt, state }
}

export function parseHistoryStore(value: unknown): HistoryEntry[] {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.entries)) return []

  return value.entries
    .map(parseHistoryEntry)
    .filter((entry): entry is HistoryEntry => entry !== null)
    .slice(0, MAX_HISTORY_ENTRIES)
}

export function loadHistory(storage: Storage = window.localStorage): HistoryEntry[] {
  try {
    const stored = storage.getItem(HISTORY_KEY)
    return stored ? parseHistoryStore(JSON.parse(stored)) : []
  } catch {
    return []
  }
}

export function saveHistory(entries: HistoryEntry[], storage: Storage = window.localStorage): void {
  const store: HistoryStore = { version: 1, entries: entries.slice(0, MAX_HISTORY_ENTRIES) }
  storage.setItem(HISTORY_KEY, JSON.stringify(store))
}

export function createHistoryEntry(
  state: AppState,
  title: string,
  now = new Date(),
  id: string = crypto.randomUUID(),
): HistoryEntry {
  return {
    id: `history-${id}`,
    title: title.trim().slice(0, 80),
    savedAt: now.toISOString(),
    state: structuredClone(state),
  }
}
