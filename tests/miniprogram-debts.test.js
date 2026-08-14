import { describe, expect, it } from 'vitest'
import { simplifyDebts as simplifyMiniProgramDebts } from '../miniprogram/lib/debts.js'
import { simplifyDebts as simplifyWebDebts } from '../src/lib/debts.ts'

const participants = [
  { id: 'xiao', name: 'xiao' },
  { id: 'hao', name: 'hao' },
  { id: 'ax', name: 'ax' },
]

const expenses = [
  { id: 'parking', description: 'parking', paidBy: 'hao', amountCents: 8100, splitWith: ['xiao', 'hao', 'ax'] },
  { id: 'coffee', description: 'coffee', paidBy: 'hao', amountCents: 4200, splitWith: ['xiao', 'hao'] },
]

describe('WeChat mini program debt engine', () => {
  it('stays exactly in parity with the web/native debt engine', () => {
    expect(simplifyMiniProgramDebts(participants, expenses)).toEqual(simplifyWebDebts(participants, expenses))
    expect(simplifyMiniProgramDebts(participants, expenses, true)).toEqual(simplifyWebDebts(participants, expenses, true))
  })

  it('ignores invalid and unknown expense members', () => {
    expect(simplifyMiniProgramDebts(participants, [
      ...expenses,
      { id: 'bad', description: 'bad', paidBy: 'unknown', amountCents: 1000, splitWith: ['xiao'] },
    ])).toEqual(simplifyMiniProgramDebts(participants, expenses))
  })
})
