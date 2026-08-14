import { describe, expect, it } from 'vitest'
import { detectCurrency, resolveLanguage, translate } from './i18n'

describe('locale preferences', () => {
  it('follows the system language while preserving a manual override', () => {
    expect(resolveLanguage('system', 'zh-Hant-TW')).toBe('zh-TW')
    expect(resolveLanguage('system', 'ja-JP')).toBe('ja')
    expect(resolveLanguage('es', 'ko-KR')).toBe('es')
  })

  it('detects a practical default currency from the system region', () => {
    expect(detectCurrency('en-US')).toBe('USD')
    expect(detectCurrency('en-GB')).toBe('GBP')
    expect(detectCurrency('ja-JP')).toBe('JPY')
    expect(detectCurrency('ko-KR')).toBe('KRW')
    expect(detectCurrency('es-MX')).toBe('MXN')
    expect(detectCurrency('de-DE')).toBe('EUR')
  })

  it('interpolates localized UI messages', () => {
    expect(translate('zh-CN', 'autoCurrency', { currency: 'CNY' })).toBe('自动 · CNY')
    expect(translate('es', 'removePerson', { name: 'Luz' })).toBe('Eliminar a Luz')
  })
})
