import { getMessages, translate } from '../../lib/i18n'
import { avatarPresentation } from '../../lib/avatar'
import { getCurrentState, getHistory, getPreferences, resolveTheme, saveCurrentState, saveHistory } from '../../lib/storage'
import { formatMinorMoney, getRoomDirectory, listSharedRooms, sharedRoomsAvailable } from '../../lib/rooms'

const SYMBOLS = { USD: '$', EUR: '€', GBP: '£', CAD: 'CA$', AUD: 'A$', CNY: '¥', JPY: '¥', KRW: '₩', MXN: 'MX$', BRL: 'R$', TWD: 'NT$', HKD: 'HK$', INR: '₹' }

function formatMoney(amountCents, currency) {
  const digits = ['JPY', 'KRW'].includes(currency) ? 0 : 2
  const value = (amountCents / 100).toFixed(digits).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${SYMBOLS[currency] || `${currency} `}${value}`
}

function formatDate(iso) {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return ''
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function sharedEntry(summary) {
  return {
    ...summary,
    statusText: summary.status === 'archived' ? '已归档' : '云端同步',
    totalText: formatMinorMoney(summary.totalMinor, summary.currency),
    expenseText: `${summary.expenseCount} 笔支出`,
    membersText: `${summary.memberCount} 位成员`,
    avatars: summary.avatars.map((avatar) => ({
      id: avatar.participantId,
      ...avatarPresentation(avatar.avatarEmoji, `room:${summary.roomId}:${avatar.participantId}`),
    })),
  }
}

Page({
  data: {
    themeClass: '',
    t: getMessages('zh-Hans'),
    language: 'zh-Hans',
    entries: [],
    sharedEntries: [],
    activeTab: 'local',
    sharedLoading: false,
    sharedError: '',
  },

  onShow() {
    this.refresh()
    this.syncSharedHistory()
  },

  refresh() {
    const preferences = getPreferences()
    const language = 'zh-Hans'
    const theme = resolveTheme(preferences.theme)
    getApp().applyNavigationTheme(theme)
    const entries = getHistory().map((entry) => ({
      ...entry,
      savedText: translate(language, 'savedOn', { date: formatDate(entry.savedAt) }),
      totalText: formatMoney(entry.state.expenses.reduce((sum, expense) => sum + expense.amountCents, 0), entry.state.currency),
      peopleText: translate(language, 'people', { count: entry.state.participants.length }),
      avatars: entry.state.participants.slice(0, 4).map((person) => ({
        id: person.id,
        ...avatarPresentation(person.avatarEmoji, `local-ledger:${person.id}`),
      })),
    }))
    const sharedEntries = getRoomDirectory().map(sharedEntry)
    this.setData({
      language,
      t: getMessages(),
      themeClass: theme === 'dark' ? 'theme-dark' : '',
      entries,
      sharedEntries,
      activeTab: !this.tabTouched && !entries.length && sharedEntries.length ? 'shared' : this.data.activeTab,
    })
    wx.setNavigationBarTitle({ title: translate(language, 'history') })
  },

  setTab(event) {
    const tab = event.currentTarget.dataset.tab
    if (tab === 'local' || tab === 'shared') {
      this.tabTouched = true
      this.setData({ activeTab: tab })
    }
  },

  async syncSharedHistory() {
    if (!sharedRoomsAvailable() || this.syncingSharedHistory) return
    this.syncingSharedHistory = true
    const requestId = (this.sharedHistoryRequestId || 0) + 1
    this.sharedHistoryRequestId = requestId
    this.setData({ sharedLoading: true, sharedError: '' })
    try {
      const rooms = await listSharedRooms()
      if (this.sharedHistoryRequestId !== requestId) return
      this.setData({
        sharedEntries: rooms.map(sharedEntry),
        sharedLoading: false,
        activeTab: !this.tabTouched && !this.data.entries.length && rooms.length ? 'shared' : this.data.activeTab,
      })
    } catch (_error) {
      if (this.sharedHistoryRequestId !== requestId) return
      this.setData({ sharedLoading: false, sharedError: '暂时无法同步，当前显示上次保存的记录。' })
    } finally {
      if (this.sharedHistoryRequestId === requestId) this.syncingSharedHistory = false
    }
  },

  openSharedRoom(event) {
    const roomId = event.currentTarget.dataset.id
    if (roomId) wx.navigateTo({ url: `/pages/room/room?roomId=${encodeURIComponent(roomId)}` })
  },

  openEntry(event) {
    const entry = getHistory().find(({ id }) => id === event.currentTarget.dataset.id)
    if (!entry) return
    const current = getCurrentState()
    const open = () => {
      saveCurrentState(entry.state)
      wx.navigateBack()
    }
    if (current.participants.length || current.expenses.length) {
      wx.showModal({ title: entry.title, content: this.data.t.resetConfirm, success: ({ confirm }) => confirm && open() })
    } else open()
  },

  deleteEntry(event) {
    const id = event.currentTarget.dataset.id
    const entry = getHistory().find((item) => item.id === id)
    if (!entry) return
    wx.showModal({
      title: this.data.t.delete,
      content: entry.title,
      confirmColor: '#c44234',
      success: ({ confirm }) => {
        if (!confirm) return
        saveHistory(getHistory().filter((item) => item.id !== id))
        this.refresh()
      },
    })
  },
})
