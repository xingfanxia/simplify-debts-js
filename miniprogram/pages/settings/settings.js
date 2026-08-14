import { CURRENCIES, getCurrentState, getPreferences, resolveTheme, saveCurrentState, savePreferences } from '../../lib/storage'
import { detectCurrency, getMessages, translate } from '../../lib/i18n'

const CURRENCY_NAMES = {
  USD: '美元', EUR: '欧元', GBP: '英镑', CAD: '加拿大元', AUD: '澳大利亚元', CNY: '人民币', JPY: '日元', KRW: '韩元',
  MXN: '墨西哥比索', BRL: '巴西雷亚尔', TWD: '新台币', HKD: '港币', INR: '印度卢比',
}

const THEME_OPTIONS = [
  { value: 'system', key: 'systemDefault' },
  { value: 'light', key: 'light' },
  { value: 'dark', key: 'dark' },
]

Page({
  data: {
    themeClass: '',
    t: getMessages('zh-Hans'),
    language: 'zh-Hans',
    preferences: getPreferences(),
    currencyLabels: [],
    currencyValues: ['auto', ...CURRENCIES],
    currencyIndex: 0,
    themeLabels: [],
    themeIndex: 0,
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const preferences = getPreferences()
    const language = 'zh-Hans'
    const t = getMessages()
    const theme = resolveTheme(preferences.theme)
    const automaticCurrency = detectCurrency()
    const currencyValues = ['auto', ...CURRENCIES]
    this.setData({
      preferences,
      language,
      t,
      themeClass: theme === 'dark' ? 'theme-dark' : '',
      currencyValues,
      currencyLabels: [translate(language, 'automatic', { value: automaticCurrency }), ...CURRENCIES.map((code) => `${CURRENCY_NAMES[code]}（${code}）`)],
      currencyIndex: Math.max(0, currencyValues.indexOf(preferences.currency)),
      themeLabels: THEME_OPTIONS.map(({ key }) => t[key]),
      themeIndex: Math.max(0, THEME_OPTIONS.findIndex(({ value }) => value === preferences.theme)),
    })
    getApp().applyNavigationTheme(theme)
    wx.setNavigationBarTitle({ title: t.preferences })
  },

  onCurrencyChange(event) {
    const value = this.data.currencyValues[Number(event.detail.value)] || 'auto'
    savePreferences({ currency: value })
    const state = getCurrentState()
    state.currency = value === 'auto' ? detectCurrency() : value
    saveCurrentState(state)
    this.refresh()
  },

  onThemeChange(event) {
    const value = THEME_OPTIONS[Number(event.detail.value)]?.value || 'system'
    savePreferences({ theme: value })
    this.refresh()
  },
})
