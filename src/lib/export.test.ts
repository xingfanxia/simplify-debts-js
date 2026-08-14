import { describe, expect, it } from 'vitest'
import type { Participant, Transfer } from '../types'
import { formatSettlementPlan, PAYMENT_CHART_LAYOUT } from './export'

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
      title: 'Settlement plan',
    })).toBe('Settlement plan\n\nxiao → hao · $59.00\nax → hao · $22.00')
  })

  it('keeps payment names and amounts readable when the chart is fit to a 390px phone', () => {
    const phoneScale = 390 / PAYMENT_CHART_LAYOUT.logicalWidth

    expect(PAYMENT_CHART_LAYOUT.logicalWidth * PAYMENT_CHART_LAYOUT.scale).toBe(1440)
    expect(PAYMENT_CHART_LAYOUT.paymentNameFontSize * phoneScale).toBeGreaterThanOrEqual(16)
    expect(PAYMENT_CHART_LAYOUT.paymentAmountFontSize * phoneScale).toBeGreaterThanOrEqual(20)
    expect(PAYMENT_CHART_LAYOUT.arrowChipWidth * phoneScale).toBeGreaterThanOrEqual(35)
    expect(PAYMENT_CHART_LAYOUT.arrowStrokeWidth * PAYMENT_CHART_LAYOUT.scale).toBeGreaterThanOrEqual(8)
    expect(PAYMENT_CHART_LAYOUT.minimumLogicalHeight).toBeLessThan(800)
  })
})
