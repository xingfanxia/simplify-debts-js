import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import {
  AVATAR_EMOJIS,
  automaticAvatarEmoji,
  avatarPresentation,
  ensureParticipantAvatars,
  isAvatarEmoji,
  randomAvatarEmoji,
} from '../miniprogram/lib/avatar.js'
import { settlementCanvasHeight } from '../miniprogram/lib/settlement-image.js'

const require = createRequire(import.meta.url)
const cloudAvatar = require('../cloudfunctions/ledger/avatar.js')

describe('小程序 Emoji 成员标记', () => {
  it('客户端与云函数共享同一份 50 个唯一动物/食物 Emoji 合同', () => {
    expect(AVATAR_EMOJIS).toHaveLength(50)
    expect(new Set(AVATAR_EMOJIS).size).toBe(50)
    expect(AVATAR_EMOJIS.slice(0, 25).join('')).toContain('🐶')
    expect(AVATAR_EMOJIS.slice(25).join('')).toContain('🍎')
    expect(cloudAvatar.AVATAR_EMOJIS).toEqual(AVATAR_EMOJIS)
    expect(cloudAvatar.automaticAvatarEmoji('room:person')).toBe(automaticAvatarEmoji('room:person'))
  })

  it('稳定分配并在 50 人以内避开已用 Emoji', () => {
    const participants = Array.from({ length: 30 }, (_, index) => ({ id: `person-${index}`, name: `成员${index}` }))
    const assigned = ensureParticipantAvatars(participants, 'room-1')
    expect(new Set(assigned.map(({ avatarEmoji }) => avatarEmoji)).size).toBe(30)
    expect(ensureParticipantAvatars(participants, 'room-1')).toEqual(assigned)
    expect(avatarPresentation(assigned[0].avatarEmoji, assigned[0].id).avatarEmoji).toBe(assigned[0].avatarEmoji)
  })

  it('保留用户选择，自动与随机操作优先使用未占用 Emoji', () => {
    const participants = ensureParticipantAvatars([
      { id: 'a', name: '甲', avatarEmoji: '🐶' },
      { id: 'b', name: '乙', avatarEmoji: '🐶' },
      { id: 'c', name: '丙' },
    ], 'room-2')
    expect(participants.slice(0, 2).map(({ avatarEmoji }) => avatarEmoji)).toEqual(['🐶', '🐶'])
    expect(participants[2].avatarEmoji).not.toBe('🐶')
    expect(automaticAvatarEmoji('c', ['🐶'])).not.toBe('🐶')
    expect(randomAvatarEmoji(['🐶'], () => 0)).toBe(AVATAR_EMOJIS.find((emoji) => emoji !== '🐶'))
  })

  it('拒绝 URL、文件 ID、组合字符和白名单外值', () => {
    expect(isAvatarEmoji('🐶')).toBe(true)
    expect(isAvatarEmoji('🐶🐱')).toBe(false)
    expect(isAvatarEmoji('cloud://avatar.png')).toBe(false)
    expect(isAvatarEmoji('https://example.com/avatar.png')).toBe(false)
    expect(isAvatarEmoji('A')).toBe(false)
  })
})

describe('移动结算图尺寸', () => {
  it('使用紧凑竖版高度并按还款数量增长', () => {
    expect(settlementCanvasHeight(0)).toBe(520)
    expect(settlementCanvasHeight(1)).toBe(520)
    expect(settlementCanvasHeight(2)).toBe(676)
    expect(settlementCanvasHeight(3)).toBe(840)
    expect(settlementCanvasHeight([
      { fromName: '超长昵称会完整换行显示一直到二十八字', toName: '小浩' },
    ])).toBeGreaterThan(520)
  })
})
