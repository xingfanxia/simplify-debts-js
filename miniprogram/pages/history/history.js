import { getMessages, translate } from '../../lib/i18n'
import { getCurrentState, getHistory, getPreferences, resolveTheme, saveCurrentState, saveHistory } from '../../lib/storage'
import { formatMinorMoney, getCachedRooms } from '../../lib/rooms'

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

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

Page({
  data: {
    themeClass: '',
    t: getMessages('zh-Hans'),
    language: 'zh-Hans',
    entries: [],
    sharedEntries: [],
  },

  onShow() {
    this.refresh()
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
      avatars: entry.state.participants.slice(0, 4).map((person) => ({ id: person.id, initials: initials(person.name) })),
    }))
    const sharedEntries = getCachedRooms().map(({ roomId, snapshot }) => ({
      roomId,
      title: snapshot.room.title,
      currency: snapshot.room.currency,
      statusText: snapshot.room.status === 'archived' ? '已归档' : '云端同步',
      totalText: formatMinorMoney(snapshot.expenses.reduce((sum, expense) => sum + expense.amountMinor, 0), snapshot.room.currency),
      expenseText: `${snapshot.expenses.length} 笔支出`,
      membersText: `${snapshot.members.length} 位成员`,
      avatars: snapshot.participants.slice(0, 4).map((person) => ({ id: person.participantId, initials: initials(person.name) })),
    }))
    this.setData({
      language,
      t: getMessages(),
      themeClass: theme === 'dark' ? 'theme-dark' : '',
      entries,
      sharedEntries,
    })
    wx.setNavigationBarTitle({ title: translate(language, 'history') })
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
