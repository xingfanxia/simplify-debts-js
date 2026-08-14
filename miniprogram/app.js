import { getPreferences, resolveTheme } from './lib/storage'
import { CLOUD_ENV_ID } from './config/cloud'

App({
  globalData: {
    cloudReady: false,
    theme: 'light',
  },

  onLaunch() {
    const preferences = getPreferences()
    this.globalData.theme = resolveTheme(preferences.theme)
    this.applyNavigationTheme(this.globalData.theme)

    if (wx.onThemeChange) {
      wx.onThemeChange(({ theme }) => {
        if (getPreferences().theme !== 'system') return
        this.globalData.theme = theme === 'dark' ? 'dark' : 'light'
        this.applyNavigationTheme(this.globalData.theme)
      })
    }

    if (CLOUD_ENV_ID && wx.cloud) {
      wx.cloud.init({ env: CLOUD_ENV_ID, traceUser: false })
      this.globalData.cloudReady = true
    }
  },

  applyNavigationTheme(theme) {
    const dark = theme === 'dark'
    wx.setNavigationBarColor({
      frontColor: dark ? '#ffffff' : '#000000',
      backgroundColor: dark ? '#111512' : '#f5f6f4',
      animation: { duration: 0, timingFunc: 'linear' },
    })
  },
})
