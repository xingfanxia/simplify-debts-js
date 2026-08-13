import { describe, expect, it } from 'vitest'
import type { Participant, Transfer } from '../types'
import { formatSettlementPlan } from './export'

describe('settlement export', () => {
  it('formats a scannable directional payment plan', () => {
    const participants: Participant[] = [
      { id: 'xiao', name: 'xiao' },
      { id: 'hao', name: 'hao' },
      { id: 'ax', name: 'ax' },
    ]
    const transfers: Transfer[] = [
      { from: 'xiao', to: 'hao', amountCents: 5_900 },
      { from: 'ax', to: 'hao', amountCents: 2_200 },
    ]

    expect(formatSettlementPlan({
      participants,
      transfers,
      formatMoney: (amountCents) => `$${(amountCents / 100).toFixed(2)}`,
    })).toBe('Settlement plan\n\nxiao → hao · $59.00\nax → hao · $22.00')
  })
})
