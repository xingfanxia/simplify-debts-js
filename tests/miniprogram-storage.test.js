import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isAvatarEmoji } from '../miniprogram/lib/avatar.js'
import {
  CURRENT_STATE_KEY,
  HISTORY_KEY,
  PREFERENCES_KEY,
  createHistoryEntry,
  getCurrentState,
  getHistory,
  getPreferences,
  parseAppState,
  saveCurrentState,
  saveHistory,
  savePreferences,
} from '../miniprogram/lib/storage.js'

describe('小程序本地 Emoji 持久化', () => {
  let store
  let previousWx

  beforeEach(() => {
    store = new Map()
    previousWx = globalThis.wx
    globalThis.wx = {
      getStorageSync: (key) => store.get(key),
      setStorageSync: (key, value) => store.set(key, structuredClone(value)),
      getAppBaseInfo: () => ({ language: 'zh_CN', theme: 'light' }),
    }
  })

  afterEach(() => {
    globalThis.wx = previousWx
  })

  function state(participants) {
    return {
      participants,
      expenses: [{ id: 'e-1', description: '晚餐', paidBy: 'a', amountCents: 8800, splitWith: ['a', 'b'] }],
      currency: 'CNY',
      roundToWhole: false,
    }
  }

  it('旧账单稳定补齐 Emoji，保存后重新打开不会变化', () => {
    const legacy = state([{ id: 'a', name: '小夏' }, { id: 'b', name: '小浩' }])
    const parsed = parseAppState(legacy)
    expect(parsed.participants.every(({ avatarEmoji }) => isAvatarEmoji(avatarEmoji))).toBe(true)
    expect(new Set(parsed.participants.map(({ avatarEmoji }) => avatarEmoji)).size).toBe(2)
    expect(parseAppState(legacy)).toEqual(parsed)
    expect(saveCurrentState(legacy)).toEqual(parsed)
    expect(store.get(CURRENT_STATE_KEY)).toEqual(parsed)
    expect(getCurrentState()).toEqual(parsed)
  })

  it('保留用户选择，并把 URL 或白名单外值替换成安全的自动 Emoji', () => {
    const parsed = parseAppState(state([
      { id: 'a', name: '小夏', avatarEmoji: '🍎' },
      { id: 'b', name: '小浩', avatarEmoji: 'https://example.com/avatar.png' },
    ]))
    expect(parsed.participants[0].avatarEmoji).toBe('🍎')
    expect(isAvatarEmoji(parsed.participants[1].avatarEmoji)).toBe(true)
    expect(parsed.participants[1].avatarEmoji).not.toBe('🍎')
    expect(JSON.stringify(parsed)).not.toMatch(/https?:\/\/|cloud:\/\//)
  })

  it('历史记录写入和读取使用同一清洗后的 Emoji 合同', () => {
    const entry = createHistoryEntry(state([
      { id: 'a', name: '小夏', avatarEmoji: '🐶' },
      { id: 'b', name: '小浩' },
    ]), '周末账单')
    const saved = saveHistory([entry])
    expect(saved).toHaveLength(1)
    expect(store.get(HISTORY_KEY).entries[0].state.participants[0].avatarEmoji).toBe('🐶')
    expect(getHistory()).toEqual(saved)
  })

  it('共享昵称偏好只保存有限文本，不混入头像或身份字段', () => {
    savePreferences({ sharedNickname: `  ${'名'.repeat(32)}  `, avatarFileId: 'cloud://forbidden' })
    const preferences = getPreferences()
    expect([...preferences.sharedNickname]).toHaveLength(28)
    expect(preferences).not.toHaveProperty('avatarFileId')
    expect(JSON.stringify(store.get(PREFERENCES_KEY))).not.toContain('cloud://forbidden')
  })
})
