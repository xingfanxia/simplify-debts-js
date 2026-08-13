import { describe, expect, it } from 'vitest'
import type { Expense, Participant } from '../types'
import {
  calculateBalances,
  roundBalancesToWholeUnits,
  simplifyBalances,
  simplifyDebts,
} from './debts'

const participants: Participant[] = [
  { id: 'alex', name: 'Alex' },
  { id: 'maya', name: 'Maya' },
  { id: 'theo', name: 'Theo' },
]

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'expense-1',
    description: 'Dinner',
    paidBy: 'alex',
    amountCents: 9_000,
    splitWith: participants.map(({ id }) => id),
    ...overrides,
  }
}

describe('debt simplification', () => {
  it('splits an expense across everyone and removes self-payment', () => {
    expect(simplifyDebts(participants, [expense()])).toEqual([
      { from: 'maya', to: 'alex', amountCents: 3_000 },
      { from: 'theo', to: 'alex', amountCents: 3_000 },
    ])
  })

  it('honors a selected split group', () => {
    expect(
      simplifyDebts(participants, [expense({ amountCents: 4_000, splitWith: ['maya', 'theo'] })]),
    ).toEqual([
      { from: 'maya', to: 'alex', amountCents: 2_000 },
      { from: 'theo', to: 'alex', amountCents: 2_000 },
    ])
  })

  it('keeps every cent accounted for when a bill does not divide evenly', () => {
    const balances = calculateBalances(participants, [expense({ amountCents: 1_000 })])

    expect([...balances.values()].reduce((sum, value) => sum + value, 0)).toBe(0)
    expect(balances.get('alex')).toBe(666)
    expect(balances.get('maya')).toBe(-333)
    expect(balances.get('theo')).toBe(-333)
  })

  it('reduces a circular tab to no repayments', () => {
    const expenses = [
      expense({ id: '1', paidBy: 'alex', amountCents: 3_000 }),
      expense({ id: '2', paidBy: 'maya', amountCents: 3_000 }),
      expense({ id: '3', paidBy: 'theo', amountCents: 3_000 }),
    ]

    expect(simplifyDebts(participants, expenses)).toEqual([])
  })

  it('preserves a zero-sum ledger when rounding to whole units', () => {
    const balances = new Map([
      ['alex', 666],
      ['maya', -333],
      ['theo', -333],
    ])
    const rounded = roundBalancesToWholeUnits(balances)

    expect([...rounded.values()].reduce((sum, value) => sum + value, 0)).toBe(0)
    expect([...rounded.values()].every((value) => value % 100 === 0)).toBe(true)
    expect(simplifyBalances(rounded).reduce((sum, transfer) => sum + transfer.amountCents, 0)).toBe(600)
  })

  it('ignores malformed persisted expenses at the domain boundary', () => {
    expect(simplifyDebts(participants, [expense({ paidBy: 'missing' })])).toEqual([])
    expect(simplifyDebts(participants, [expense({ amountCents: Number.NaN })])).toEqual([])
    expect(simplifyDebts(participants, [expense({ amountCents: Number.MAX_VALUE })])).toEqual([])
    expect(simplifyDebts(participants, [expense({ splitWith: [] })])).toEqual([])
  })
})
