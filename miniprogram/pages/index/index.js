import { simplifyDebts } from '../../lib/debts'
import { detectCurrency, getMessages, translate } from '../../lib/i18n'
import {
  createHistoryEntry,
  EMPTY_STATE,
  getCurrentState,
  getHistory,
  getPreferences,
  resolveTheme,
  saveCurrentState,
  saveHistory,
} from '../../lib/storage'

const SYMBOLS = {
  USD: '$', EUR: '€', GBP: '£', CAD: 'CA$', AUD: 'A$', CNY: '¥', JPY: '¥', KRW: '₩',
  MXN: 'MX$', BRL: 'R$', TWD: 'NT$', INR: '₹', HKD: 'HK$',
}
const NO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW'])
const AVATAR_CLASSES = ['avatar-coral', 'avatar-mint', 'avatar-blue', 'avatar-purple', 'avatar-accent']

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function avatarClass(name) {
  const total = [...name].reduce((sum, character) => sum + character.charCodeAt(0), 0)
  return AVATAR_CLASSES[total % AVATAR_CLASSES.length]
}

function formatMoney(amountCents, currency) {
  const amount = amountCents / 100
  const digits = NO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2
  const value = amount.toFixed(digits).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${SYMBOLS[currency] || `${currency} `}${value}`
}

function defaultExpenseForm() {
  return {
    description: '',
    amount: '',
    paidBy: '',
    splitMode: 'everyone',
    selectedIds: [],
  }
}

function localizedExample(language, currency, roundToWhole) {
  const t = (key) => translate(language, key)
  return {
    participants: [
      { id: 'alex', name: 'Alex' }, { id: 'maya', name: 'Maya' },
      { id: 'theo', name: 'Theo' }, { id: 'jules', name: 'Jules' },
    ],
    expenses: [
      { id: 'dinner', description: t('exampleDinner'), paidBy: 'alex', amountCents: 12640, splitWith: ['alex', 'maya', 'theo', 'jules'] },
      { id: 'groceries', description: t('exampleGroceries'), paidBy: 'maya', amountCents: 7825, splitWith: ['alex', 'maya', 'theo', 'jules'] },
      { id: 'ride', description: t('exampleRide'), paidBy: 'theo', amountCents: 3600, splitWith: ['alex', 'theo', 'jules'] },
    ],
    currency,
    roundToWhole,
  }
}

Page({
  data: {
    themeClass: '',
    t: getMessages('zh-Hans'),
    language: 'zh-Hans',
    currency: 'CNY',
    state: clone(EMPTY_STATE),
    participantsView: [],
    expensesView: [],
    transfersView: [],
    participantNames: [],
    payerIndex: 0,
    nameInput: '',
    expenseForm: defaultExpenseForm(),
    editingExpenseId: '',
    formError: '',
    totalSpendText: '¥0.00',
    expenseCountText: '0',
    shareCanvasHeight: 760,
    hasExpenses: false,
    isEven: false,
    historyCount: 0,
    lastExportPath: '',
  },

  onLoad() {
    this.refreshFromStorage()
  },

  onShow() {
    this.refreshFromStorage()
  },

  onPullDownRefresh() {
    this.refreshFromStorage()
    wx.stopPullDownRefresh()
  },

  onShareAppMessage() {
    return {
      title: this.data.t.toolTitle || '多人分账',
      path: '/pages/index/index',
    }
  },

  onShareTimeline() {
    return { title: this.data.t.toolTitle || '多人分账' }
  },

  refreshFromStorage() {
    const preferences = getPreferences()
    const language = 'zh-Hans'
    const t = getMessages()
    const theme = resolveTheme(preferences.theme)
    const state = getCurrentState()
    const currency = preferences.currency === 'auto' ? detectCurrency() : preferences.currency
    state.currency = currency
    saveCurrentState(state)
    getApp().globalData.theme = theme
    getApp().applyNavigationTheme(theme)
    wx.setNavigationBarTitle({ title: t.toolTitle })
    this.setData({
      language,
      t,
      themeClass: theme === 'dark' ? 'theme-dark' : '',
      state,
      historyCount: getHistory().length,
    }, () => this.recompute())
  },

  recompute() {
    const { state, language } = this.data
    const transfers = simplifyDebts(state.participants, state.expenses, state.roundToWhole)
    const peopleById = new Map(state.participants.map((person) => [person.id, person]))
    const participantsView = state.participants.map((person) => ({
      ...person,
      initials: initials(person.name),
      avatarClass: avatarClass(person.name),
      selected: this.data.expenseForm.selectedIds.includes(person.id),
    }))
    const expensesView = state.expenses.map((expense) => {
      const payer = peopleById.get(expense.paidBy)
      const splitNames = expense.splitWith.map((id) => peopleById.get(id)?.name).filter(Boolean)
      const everyone = expense.splitWith.length === state.participants.length
      return {
        ...expense,
        amountText: formatMoney(expense.amountCents, state.currency),
        payerName: payer?.name || translate(language, 'someone'),
        splitText: translate(language, everyone ? 'paidSplitEveryone' : 'paidSplitCustom', {
          payer: payer?.name || '',
          names: splitNames.join(', '),
        }),
        isEditing: expense.id === this.data.editingExpenseId,
      }
    })
    const transfersView = transfers.map((transfer, index) => {
      const from = peopleById.get(transfer.from) || { id: transfer.from, name: translate(language, 'someone') }
      const to = peopleById.get(transfer.to) || { id: transfer.to, name: translate(language, 'someone') }
      return {
        ...transfer,
        key: `${transfer.from}-${transfer.to}-${index}`,
        fromName: from.name,
        toName: to.name,
        fromInitials: initials(from.name),
        toInitials: initials(to.name),
        fromClass: avatarClass(from.name),
        toClass: avatarClass(to.name),
        amountText: formatMoney(transfer.amountCents, state.currency),
      }
    })
    const totalSpend = state.expenses.reduce((sum, expense) => sum + expense.amountCents, 0)

    this.setData({
      participantsView,
      expensesView,
      transfersView,
      participantNames: state.participants.map(({ name }) => name),
      payerIndex: Math.max(0, state.participants.findIndex(({ id }) => id === this.data.expenseForm.paidBy)),
      totalSpendText: formatMoney(totalSpend, state.currency),
      expenseCountText: translate(language, 'expenses', { count: state.expenses.length }),
      currency: state.currency,
      hasExpenses: state.expenses.length > 0,
      isEven: state.expenses.length > 0 && transfers.length === 0,
      shareCanvasHeight: Math.max(760, 342 + transfers.length * 184 + Math.max(0, transfers.length - 1) * 16 + 88),
    })
  },

  persistState(nextState) {
    saveCurrentState(nextState)
    this.setData({ state: nextState }, () => this.recompute())
  },

  onNameInput(event) {
    this.setData({ nameInput: event.detail.value })
  },

  addPeople() {
    const candidates = this.data.nameInput.split(/[,，、\n]+/).map((name) => name.trim()).filter(Boolean)
    if (candidates.length === 0) return
    const existing = new Set(this.data.state.participants.map(({ name }) => name.toLocaleLowerCase()))
    const additions = []
    candidates.forEach((name) => {
      const normalized = name.toLocaleLowerCase()
      if (!existing.has(normalized)) {
        existing.add(normalized)
        additions.push({ id: makeId('person'), name: name.slice(0, 28) })
      }
    })
    if (additions.length === 0) {
      wx.showToast({ title: this.data.t.duplicateNameError, icon: 'none' })
      return
    }
    const participants = [...this.data.state.participants, ...additions]
    const expenseForm = { ...this.data.expenseForm }
    if (!expenseForm.paidBy) expenseForm.paidBy = participants[0].id
    if (expenseForm.splitMode === 'everyone') expenseForm.selectedIds = participants.map(({ id }) => id)
    this.setData({ nameInput: '', expenseForm })
    this.persistState({ ...this.data.state, participants })
  },

  removePerson(event) {
    const personId = event.currentTarget.dataset.id
    const person = this.data.state.participants.find(({ id }) => id === personId)
    if (!person) return
    wx.showModal({
      title: this.data.t.remove,
      content: translate(this.data.language, 'deletePersonConfirm', { name: person.name }),
      confirmColor: '#c44234',
      success: ({ confirm }) => {
        if (!confirm) return
        const participants = this.data.state.participants.filter(({ id }) => id !== personId)
        const expenses = this.data.state.expenses
          .filter(({ paidBy }) => paidBy !== personId)
          .map((expense) => ({ ...expense, splitWith: expense.splitWith.filter((id) => id !== personId) }))
          .filter(({ splitWith }) => splitWith.length > 0)
        this.setData({ editingExpenseId: '', expenseForm: defaultExpenseForm(), formError: '' })
        this.persistState({ ...this.data.state, participants, expenses })
      },
    })
  },

  tryExample() {
    this.setData({ editingExpenseId: '', expenseForm: defaultExpenseForm(), formError: '' })
    this.persistState(localizedExample(this.data.language, this.data.state.currency, this.data.state.roundToWhole))
  },

  onDescriptionInput(event) {
    this.setData({ 'expenseForm.description': event.detail.value, formError: '' })
  },

  onAmountInput(event) {
    this.setData({ 'expenseForm.amount': event.detail.value, formError: '' })
  },

  onPayerChange(event) {
    const payer = this.data.state.participants[Number(event.detail.value)]
    if (payer) this.setData({ 'expenseForm.paidBy': payer.id, payerIndex: Number(event.detail.value), formError: '' })
  },

  chooseEveryone() {
    this.setData({
      'expenseForm.splitMode': 'everyone',
      'expenseForm.selectedIds': this.data.state.participants.map(({ id }) => id),
      formError: '',
    }, () => this.recompute())
  },

  chooseCustom() {
    const selectedIds = this.data.expenseForm.selectedIds.length
      ? this.data.expenseForm.selectedIds
      : this.data.state.participants.map(({ id }) => id)
    this.setData({ 'expenseForm.splitMode': 'custom', 'expenseForm.selectedIds': selectedIds, formError: '' }, () => this.recompute())
  },

  toggleSplitPerson(event) {
    if (this.data.expenseForm.splitMode !== 'custom') return
    const id = event.currentTarget.dataset.id
    const selected = new Set(this.data.expenseForm.selectedIds)
    if (selected.has(id)) selected.delete(id)
    else selected.add(id)
    this.setData({ 'expenseForm.selectedIds': [...selected], formError: '' }, () => this.recompute())
  },

  submitExpense() {
    const participants = this.data.state.participants
    const form = this.data.expenseForm
    const amount = Number(form.amount)
    const amountCents = Math.round(amount * 100)
    const paidBy = form.paidBy || participants[0]?.id || ''
    const splitWith = form.splitMode === 'everyone' ? participants.map(({ id }) => id) : form.selectedIds
    let error = ''
    if (participants.length < 2) error = this.data.t.addTwoPeopleError
    else if (!paidBy) error = this.data.t.choosePayerError
    else if (!Number.isFinite(amount) || !Number.isSafeInteger(amountCents) || amountCents <= 0) error = this.data.t.validAmountError
    else if (splitWith.length === 0) error = this.data.t.chooseShareError
    if (error) {
      this.setData({ formError: error })
      return
    }

    const nextExpense = {
      id: this.data.editingExpenseId || makeId('expense'),
      description: form.description.trim().slice(0, 60) || this.data.t.whatWasIt,
      paidBy,
      amountCents,
      splitWith: [...new Set(splitWith)],
    }
    const expenses = this.data.editingExpenseId
      ? this.data.state.expenses.map((expense) => expense.id === this.data.editingExpenseId ? nextExpense : expense)
      : [...this.data.state.expenses, nextExpense]
    this.setData({ editingExpenseId: '', expenseForm: defaultExpenseForm(), formError: '' })
    this.persistState({ ...this.data.state, expenses })
  },

  editExpense(event) {
    const expense = this.data.state.expenses.find(({ id }) => id === event.currentTarget.dataset.id)
    if (!expense) return
    const everyone = expense.splitWith.length === this.data.state.participants.length
    this.setData({
      editingExpenseId: expense.id,
      expenseForm: {
        description: expense.description,
        amount: (expense.amountCents / 100).toFixed(2),
        paidBy: expense.paidBy,
        splitMode: everyone ? 'everyone' : 'custom',
        selectedIds: [...expense.splitWith],
      },
      formError: '',
    }, () => {
      this.recompute()
      wx.pageScrollTo({ selector: '#expense-composer', duration: 250 })
    })
  },

  cancelEdit() {
    this.setData({ editingExpenseId: '', expenseForm: defaultExpenseForm(), formError: '' }, () => this.recompute())
  },

  removeExpense(event) {
    const id = event.currentTarget.dataset.id
    this.persistState({ ...this.data.state, expenses: this.data.state.expenses.filter((expense) => expense.id !== id) })
    if (this.data.editingExpenseId === id) this.cancelEdit()
  },

  toggleRounding(event) {
    this.persistState({ ...this.data.state, roundToWhole: event.detail.value })
  },

  resetApp() {
    if (this.data.state.participants.length === 0) return
    wx.showModal({
      title: this.data.t.toolTitle,
      content: this.data.t.resetConfirm,
      confirmColor: '#c44234',
      success: ({ confirm }) => {
        if (!confirm) return
        this.setData({ editingExpenseId: '', expenseForm: defaultExpenseForm(), formError: '' })
        this.persistState({ ...clone(EMPTY_STATE), currency: this.data.state.currency, roundToWhole: this.data.state.roundToWhole })
      },
    })
  },

  defaultHistoryTitle() {
    const first = this.data.state.expenses[0]?.description
    const remainder = this.data.state.expenses.length - 1
    if (first) return remainder > 0 ? `${first} +${remainder}` : first
    return `${this.data.t.settlementPlan} · ${new Date().toLocaleDateString()}`
  },

  saveAndStartNew() {
    if (this.data.state.expenses.length === 0) {
      wx.showToast({ title: this.data.t.addExpenseBeforeSave, icon: 'none' })
      return
    }
    try {
      const title = this.defaultHistoryTitle()
      const nextHistory = [createHistoryEntry(this.data.state, title), ...getHistory()].slice(0, 50)
      saveHistory(nextHistory)
      const nextState = { ...clone(EMPTY_STATE), currency: this.data.state.currency, roundToWhole: this.data.state.roundToWhole }
      this.setData({ editingExpenseId: '', expenseForm: defaultExpenseForm(), historyCount: nextHistory.length })
      this.persistState(nextState)
      wx.pageScrollTo({ scrollTop: 0, duration: 240 })
      wx.showToast({ title: translate(this.data.language, 'savedAndStartedNew', { title }), icon: 'success', duration: 2200 })
    } catch (_error) {
      wx.showToast({ title: this.data.t.storageError, icon: 'none' })
    }
  },

  openHistory() {
    wx.navigateTo({ url: '/pages/history/history' })
  },

  openSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' })
  },

  settlementText() {
    const lines = this.data.transfersView.map((transfer) => `${transfer.fromName} → ${transfer.toName} · ${transfer.amountText}`)
    return `${this.data.t.settlementPlan}\n\n${lines.join('\n')}`
  },

  copySettlementText() {
    wx.setClipboardData({
      data: this.settlementText(),
      success: () => wx.showToast({ title: this.data.t.settlementCopied, icon: 'success' }),
    })
  },

  async shareSettlementImage() {
    if (this.data.transfersView.length === 0) return
    wx.showLoading({ title: this.data.t.generatingImage, mask: true })
    try {
      const path = await this.renderSettlementImage()
      wx.hideLoading()
      if (wx.showShareImageMenu) {
        wx.showShareImageMenu({ path })
      } else {
        wx.previewImage({ current: path, urls: [path] })
      }
    } catch (_error) {
      wx.hideLoading()
      wx.showToast({ title: this.data.t.imageExportFailed, icon: 'none' })
    }
  },

  renderSettlementImage() {
    return new Promise((resolve, reject) => {
      wx.createSelectorQuery().in(this).select('#shareCanvas').fields({ node: true, size: true }).exec((result) => {
        const canvas = result?.[0]?.node
        if (!canvas) {
          reject(new Error('Canvas unavailable'))
          return
        }
        const width = 720
        const height = this.data.shareCanvasHeight
        const scale = 2
        canvas.width = width * scale
        canvas.height = height * scale
        const context = canvas.getContext('2d')
        context.scale(scale, scale)
        this.drawSettlementCard(context, width, height)
        wx.canvasToTempFilePath({
          canvas,
          fileType: 'png',
          destWidth: width * scale,
          destHeight: height * scale,
          success: ({ tempFilePath }) => {
            this.setData({ lastExportPath: tempFilePath })
            resolve(tempFilePath)
          },
          fail: reject,
        })
      })
    })
  },

  roundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2)
    context.beginPath()
    context.moveTo(x + r, y)
    context.arcTo(x + width, y, x + width, y + height, r)
    context.arcTo(x + width, y + height, x, y + height, r)
    context.arcTo(x, y + height, x, y, r)
    context.arcTo(x, y, x + width, y, r)
    context.closePath()
  },

  drawSettlementCard(context, width, height) {
    const dark = this.data.themeClass === 'theme-dark'
    const colors = dark
      ? { bg: '#111512', surface: '#1a201b', ink: '#f0f4f1', muted: '#a8b1aa', line: '#343d36', accent: '#7bd9a4', accentInk: '#102117', avatarInk: '#172019' }
      : { bg: '#f5f6f4', surface: '#ffffff', ink: '#172019', muted: '#687169', line: '#dce1dc', accent: '#24724d', accentInk: '#ffffff', avatarInk: '#172019' }
    context.fillStyle = colors.bg
    context.fillRect(0, 0, width, height)
    context.fillStyle = colors.ink
    context.font = '700 52px sans-serif'
    context.textAlign = 'left'
    context.fillText(this.data.t.settlementPlan, 44, 76, width - 88)
    context.fillStyle = colors.muted
    context.font = '600 25px sans-serif'
    context.fillText(this.data.t.paymentFlow, 46, 113)

    this.roundedRect(context, 44, 145, width - 88, 122, 24)
    context.fillStyle = colors.surface; context.fill()
    context.strokeStyle = colors.line; context.lineWidth = 1.5; context.stroke()
    const toMove = this.data.transfersView.reduce((sum, transfer) => sum + transfer.amountCents, 0)
    const summary = [
      [this.data.t.toMove, formatMoney(toMove, this.data.state.currency)],
      [this.data.t.repayments, String(this.data.transfersView.length)],
      [this.data.t.people, String(this.data.state.participants.length)],
    ]
    summary.forEach(([label, value], index) => {
      const columnWidth = (width - 88) / 3
      const x = 44 + index * columnWidth
      if (index) {
        context.beginPath(); context.moveTo(x, 167); context.lineTo(x, 245); context.strokeStyle = colors.line; context.lineWidth = 1; context.stroke()
      }
      context.textAlign = 'center'; context.fillStyle = colors.muted; context.font = '700 24px sans-serif'; context.fillText(label, x + columnWidth / 2, 190, columnWidth - 20)
      context.fillStyle = colors.ink; context.font = '700 34px sans-serif'; context.fillText(value, x + columnWidth / 2, 239, columnWidth - 24)
    })
    context.textAlign = 'left'; context.fillStyle = colors.muted; context.font = '700 24px sans-serif'; context.fillText(this.data.t.paymentFlow, 44, 315)
    context.textAlign = 'right'; context.fillText(this.data.state.currency, width - 44, 315)

    this.data.transfersView.forEach((transfer, index) => {
      const rowY = 342 + index * 200
      this.roundedRect(context, 44, rowY, width - 88, 184, 24)
      context.fillStyle = colors.surface; context.fill(); context.strokeStyle = colors.line; context.lineWidth = 1.5; context.stroke()
      context.textAlign = 'left'; context.fillStyle = colors.muted; context.font = '700 22px sans-serif'; context.fillText(translate(this.data.language, 'paymentNumber', { index: String(index + 1).padStart(2, '0') }), 68, rowY + 34)
      this.drawCanvasAvatar(context, transfer.fromName, 94, rowY + 82, colors)
      context.textAlign = 'left'; context.fillStyle = colors.ink; context.font = '700 31px sans-serif'; context.fillText(this.canvasName(transfer.fromName), 136, rowY + 92, 156)
      this.drawCanvasArrow(context, width / 2, rowY + 82, colors)
      this.drawCanvasAvatar(context, transfer.toName, 464, rowY + 82, colors)
      context.textAlign = 'left'; context.fillStyle = colors.ink; context.font = '700 31px sans-serif'; context.fillText(this.canvasName(transfer.toName), 506, rowY + 92, 146)
      context.beginPath(); context.moveTo(68, rowY + 120); context.lineTo(width - 68, rowY + 120); context.strokeStyle = colors.line; context.lineWidth = 1; context.stroke()
      context.textAlign = 'left'; context.fillStyle = colors.muted; context.font = '700 22px sans-serif'; context.fillText(this.data.t.amount, 68, rowY + 160)
      context.textAlign = 'right'; context.fillStyle = colors.ink; context.font = '700 38px sans-serif'; context.fillText(transfer.amountText, width - 68, rowY + 166)
    })
    context.textAlign = 'center'; context.fillStyle = colors.muted; context.font = '600 22px sans-serif'; context.fillText(this.data.t.madeWith, width / 2, height - 43, width - 88)
  },

  drawCanvasAvatar(context, name, x, y, colors) {
    const fills = ['#e7b0a4', '#9ecbb1', '#aac7df', '#c8bddb', '#b8c9bc']
    const total = [...name].reduce((sum, character) => sum + character.charCodeAt(0), 0)
    context.beginPath(); context.arc(x, y, 27, 0, Math.PI * 2); context.fillStyle = fills[total % fills.length]; context.fill()
    context.strokeStyle = colors.avatarInk; context.lineWidth = 2; context.stroke()
    context.fillStyle = colors.avatarInk; context.font = '700 16px sans-serif'; context.textAlign = 'center'; context.fillText(initials(name), x, y + 5)
  },

  canvasName(name) {
    const characters = [...name.trim()]
    return characters.length > 9 ? `${characters.slice(0, 8).join('')}…` : name.trim()
  },

  drawCanvasArrow(context, centerX, centerY, colors) {
    this.roundedRect(context, centerX - 33, centerY - 21, 66, 42, 21)
    context.fillStyle = colors.accent; context.fill(); context.strokeStyle = colors.accentInk; context.lineWidth = 1.5; context.stroke()
    context.beginPath(); context.moveTo(centerX - 15, centerY); context.lineTo(centerX + 16, centerY); context.moveTo(centerX + 7, centerY - 8); context.lineTo(centerX + 16, centerY); context.lineTo(centerX + 7, centerY + 8)
    context.strokeStyle = colors.accentInk; context.lineWidth = 4.5; context.lineCap = 'round'; context.lineJoin = 'round'; context.stroke()
  },
})
