export const CURRENT_STATE_KEY = 'settle-app-state-v2'
export const HISTORY_KEY = 'settle-history-v1'
export const PREFERENCES_KEY = 'settle-mini-preferences-v1'
export const MAX_HISTORY_ENTRIES = 50

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CNY', 'JPY', 'KRW', 'MXN', 'BRL', 'TWD', 'HKD', 'INR']

export const EMPTY_STATE = {
  participants: [],
  expenses: [],
  currency: 'CNY',
  roundToWhole: false,
}

const DEFAULT_PREFERENCES = {
  currency: 'auto',
  theme: 'system',
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseAppState(value) {
  if (!isRecord(value) || !Array.isArray(value.participants) || !Array.isArray(value.expenses)) return null
  const participants = value.participants.filter((person) => (
    isRecord(person) && typeof person.id === 'string' && typeof person.name === 'string' && person.name.trim()
  )).map((person) => ({ id: person.id, name: person.name.trim().slice(0, 28) }))
  const ids = new Set(participants.map(({ id }) => id))
  const expenses = value.expenses.filter((expense) => (
    isRecord(expense)
    && typeof expense.id === 'string'
    && typeof expense.description === 'string'
    && ids.has(expense.paidBy)
    && Number.isSafeInteger(expense.amountCents)
    && expense.amountCents > 0
    && Array.isArray(expense.splitWith)
    && expense.splitWith.length > 0
    && expense.splitWith.every((id) => ids.has(id))
  )).map((expense) => ({
    id: expense.id,
    description: expense.description.trim().slice(0, 60),
    paidBy: expense.paidBy,
    amountCents: expense.amountCents,
    splitWith: [...new Set(expense.splitWith)],
  }))

  return {
    participants,
    expenses,
    currency: CURRENCIES.includes(value.currency) ? value.currency : 'CNY',
    roundToWhole: value.roundToWhole === true,
  }
}

export function getCurrentState() {
  try {
    return parseAppState(wx.getStorageSync(CURRENT_STATE_KEY)) || clone(EMPTY_STATE)
  } catch (_error) {
    return clone(EMPTY_STATE)
  }
}

export function saveCurrentState(state) {
  const parsed = parseAppState(state)
  if (!parsed) throw new Error('Invalid Settle state')
  wx.setStorageSync(CURRENT_STATE_KEY, parsed)
}

export function getHistory() {
  try {
    const store = wx.getStorageSync(HISTORY_KEY)
    if (!isRecord(store) || store.version !== 1 || !Array.isArray(store.entries)) return []
    return store.entries.map((entry) => {
      if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.title !== 'string' || typeof entry.savedAt !== 'string') return null
      const state = parseAppState(entry.state)
      const title = entry.title.trim().slice(0, 80)
      return state && title ? { id: entry.id, title, savedAt: entry.savedAt, state } : null
    }).filter(Boolean).slice(0, MAX_HISTORY_ENTRIES)
  } catch (_error) {
    return []
  }
}

export function saveHistory(entries) {
  wx.setStorageSync(HISTORY_KEY, { version: 1, entries: entries.slice(0, MAX_HISTORY_ENTRIES) })
}

export function createHistoryEntry(state, title) {
  return {
    id: `history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: title.trim().slice(0, 80),
    savedAt: new Date().toISOString(),
    state: clone(state),
  }
}

export function getPreferences() {
  try {
    const value = wx.getStorageSync(PREFERENCES_KEY)
    if (!isRecord(value)) return { ...DEFAULT_PREFERENCES }
    return {
      currency: value.currency === 'auto' || CURRENCIES.includes(value.currency) ? value.currency : 'auto',
      theme: ['system', 'light', 'dark'].includes(value.theme) ? value.theme : 'system',
    }
  } catch (_error) {
    return { ...DEFAULT_PREFERENCES }
  }
}

export function savePreferences(preferences) {
  wx.setStorageSync(PREFERENCES_KEY, { ...getPreferences(), ...preferences })
}

export function getSystemLocale() {
  try {
    return wx.getAppBaseInfo().language || 'zh_CN'
  } catch (_error) {
    return 'zh_CN'
  }
}

export function resolveTheme(preference) {
  if (preference === 'light' || preference === 'dark') return preference
  try {
    return wx.getAppBaseInfo().theme === 'dark' ? 'dark' : 'light'
  } catch (_error) {
    return 'light'
  }
}
