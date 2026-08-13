import { describe, expect, it } from 'vitest'
import type { AppState } from '../types'
import { createHistoryEntry, parseAppState, parseHistoryStore } from './storage'

const state: AppState = {
  participants: [
    { id: 'ax', name: 'AX' },
    { id: 'hao', name: 'Hao' },
  ],
  expenses: [{
    id: 'parking',
    description: 'Parking',
    paidBy: 'ax',
    amountCents: 10_000,
    splitWith: ['ax', 'hao'],
  }],
  currency: 'USD',
  roundToWhole: false,
}

describe('local settlement storage', () => {
  it('validates persisted app state and rejects invalid expenses', () => {
    const parsed = parseAppState({
      ...state,
      expenses: [
        ...state.expenses,
        { ...state.expenses[0], id: 'invalid', paidBy: 'missing' },
      ],
    })

    expect(parsed?.expenses).toEqual(state.expenses)
  })

  it('creates an independent timestamped history snapshot', () => {
    const workingState = structuredClone(state)
    const entry = createHistoryEntry(workingState, '  Weekend trip  ', new Date('2026-08-13T12:00:00Z'), 'one')
    workingState.expenses[0].amountCents = 1

    expect(entry).toMatchObject({
      id: 'history-one',
      title: 'Weekend trip',
      savedAt: '2026-08-13T12:00:00.000Z',
    })
    expect(entry.state.expenses[0].amountCents).toBe(10_000)
  })

  it('loads only valid entries from the versioned history envelope', () => {
    const valid = createHistoryEntry(state, 'Parking', new Date('2026-08-13T12:00:00Z'), 'valid')

    expect(parseHistoryStore({ version: 1, entries: [valid, { nope: true }] })).toEqual([valid])
    expect(parseHistoryStore({ version: 2, entries: [valid] })).toEqual([])
  })
})
