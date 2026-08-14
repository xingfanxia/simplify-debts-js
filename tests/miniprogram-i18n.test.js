import { describe, expect, it } from 'vitest'
import { detectCurrency, getMessages, translate } from '../miniprogram/lib/i18n.js'

describe('WeChat mini program localization', () => {
  it('uses a Chinese-only interface', () => {
    expect(getMessages().toolTitle).toBe('分账结算')
    expect(translate('en', 'saveAndStartNew')).toBe('保存并新建')
  })

  it.each([
    ['zh_CN', 'CNY'],
    ['zh_TW', 'TWD'],
    ['zh_HK', 'HKD'],
    ['ja_JP', 'JPY'],
    ['ko_KR', 'KRW'],
    ['en_GB', 'GBP'],
    ['en_US', 'USD'],
  ])('detects %s as %s while keeping the UI Chinese', (locale, expected) => {
    expect(detectCurrency(locale)).toBe(expected)
  })
})
