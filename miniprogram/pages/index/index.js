import { simplifyDebts } from '../../lib/debts'
import {
  AVATAR_EMOJIS,
  automaticAvatarEmoji,
  avatarPresentation,
  randomAvatarEmoji,
} from '../../lib/avatar'
import { detectCurrency, getMessages, translate } from '../../lib/i18n'
import { callLedger, getRoomDirectory, isZeroDecimalCurrency, makeMutationId, parseAmountMinor, saveRoomCache, sharedRoomsAvailable } from '../../lib/rooms'
import { drawSettlementCard, exportSettlementImage, settlementCanvasHeight } from '../../lib/settlement-image'
import {
  createHistoryEntry,
  CURRENCIES,
  EMPTY_STATE,
  getCurrentState,
  getHistory,
  getPreferences,
  resolveTheme,
  saveCurrentState,
  saveHistory,
  savePreferences,
} from '../../lib/storage'

const SYMBOLS = {
  USD: '$', EUR: '€', GBP: '£', CAD: 'CA$', AUD: 'A$', CNY: '¥', JPY: '¥', KRW: '₩',
  MXN: 'MX$', BRL: 'R$', TWD: 'NT$', INR: '₹', HKD: 'HK$',
}
const CURRENCY_NAMES = {
  USD: '美元', EUR: '欧元', GBP: '英镑', CAD: '加拿大元', AUD: '澳大利亚元', CNY: '人民币', JPY: '日元', KRW: '韩元',
  MXN: '墨西哥比索', BRL: '巴西雷亚尔', TWD: '新台币', HKD: '港币', INR: '印度卢比',
}
const THEME_OPTIONS = [
  { value: 'system', key: 'systemDefault', shortKey: 'systemShort' },
  { value: 'light', key: 'light', shortKey: 'light' },
  { value: 'dark', key: 'dark', shortKey: 'dark' },
]

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function formatMoney(amountCents, currency) {
  const amount = amountCents / 100
  const digits = isZeroDecimalCurrency(currency) ? 0 : 2
  const value = amount.toFixed(digits).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${SYMBOLS[currency] || `${currency} `}${value}`
}

function formatDateTime(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
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

function normalizeCurrencyPrecision(state, currency) {
  if (!isZeroDecimalCurrency(currency)) return { ...state, currency }
  return {
    ...state,
    currency,
    expenses: state.expenses.map((expense) => ({
      ...expense,
      amountCents: Math.max(100, Math.round(expense.amountCents / 100) * 100),
    })),
  }
}

function sharedRoomError(error) {
  const messages = {
    cloud_unavailable: '共享功能尚未连接云环境。',
    network_error: '网络暂时不可用，请稍后重试。',
    invalid_state: '当前账单无法共享，请检查参与人和支出。',
    invalid_participants: '共享账单需要 2–30 位参与人。',
    invalid_expenses: '单个共享账单最多支持 60 笔支出。',
    invalid_amount_precision: '当前币种只支持整数金额，请先检查支出。',
    duplicate_participant: '参与人姓名不能重复。',
    invalid_display_name: '请输入 1–28 个字符的昵称。',
    invalid_profile: '请输入你的昵称。',
    invalid_avatar: '请选择列表中的 Emoji。',
    legacy_identity_forbidden: '共享账单流程已更新，请重新创建。',
  }
  return messages[error && error.code] || '创建共享账单失败，请稍后重试。'
}

function sharedDraftAvatar(title, nickname) {
  return automaticAvatarEmoji(`shared-draft:${title.trim()}:${nickname.trim()}`)
}

function localizedExample(language, currency, roundToWhole) {
  const t = (key) => translate(language, key)
  const state = {
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
  return normalizeCurrencyPrecision(state, currency)
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
    amountPlaceholder: '0.00',
    expenseCountText: '0',
    shareCanvasHeight: 520,
    hasExpenses: false,
    isEven: false,
    historyCount: 0,
    lastExportPath: '',
    currencyValues: ['auto', ...CURRENCIES],
    roomCurrencyValues: CURRENCIES,
    currencyLabels: [],
    currencyIndex: 0,
    themeLabels: [],
    themeIndex: 0,
    themeShortLabel: '',
    showSaveDialog: false,
    saveTitleInput: '',
    workspaceMode: 'local',
    sharedRoomsEnabled: false,
    shareRoomTitleInput: '',
    shareNicknameInput: '',
    shareAvatarEmoji: sharedDraftAvatar('', ''),
    shareAvatarCustomized: false,
    shareCurrencyIndex: CURRENCIES.indexOf('CNY'),
    creatingSharedRoom: false,
    avatarOptions: AVATAR_EMOJIS,
    showAvatarPicker: false,
    avatarPickerContext: '',
    avatarPickerTargetId: '',
    avatarPickerTargetName: '',
    avatarPickerSelected: '',
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
    let state = getCurrentState()
    const currency = preferences.currency === 'auto' ? detectCurrency() : preferences.currency
    const currencyValues = ['auto', ...CURRENCIES]
    const themeIndex = Math.max(0, THEME_OPTIONS.findIndex(({ value }) => value === preferences.theme))
    const shareRoomTitleInput = this.data.shareRoomTitleInput || this.defaultSharedRoomTitle()
    const shareNicknameInput = this.data.shareNicknameInput || preferences.sharedNickname || ''
    const shareAvatarEmoji = this.data.shareAvatarCustomized
      ? this.data.shareAvatarEmoji
      : sharedDraftAvatar(shareRoomTitleInput, shareNicknameInput)
    state = normalizeCurrencyPrecision(state, currency)
    saveCurrentState(state)
    getApp().globalData.theme = theme
    getApp().applyNavigationTheme(theme)
    wx.setNavigationBarTitle({ title: t.toolTitle })
    this.setData({
      language,
      t,
      themeClass: theme === 'dark' ? 'theme-dark' : '',
      state,
      historyCount: getHistory().length + getRoomDirectory().length,
      currencyValues,
      currencyLabels: [translate(language, 'automatic', { value: currency }), ...CURRENCIES.map((code) => `${CURRENCY_NAMES[code]}（${code}）`)],
      currencyIndex: Math.max(0, currencyValues.indexOf(preferences.currency)),
      themeLabels: THEME_OPTIONS.map(({ key }) => t[key]),
      themeIndex,
      themeShortLabel: t[THEME_OPTIONS[themeIndex].shortKey],
      sharedRoomsEnabled: sharedRoomsAvailable(),
      shareRoomTitleInput,
      shareNicknameInput,
      shareAvatarEmoji,
      shareCurrencyIndex: this.data.shareRoomTitleInput
        ? this.data.shareCurrencyIndex
        : Math.max(0, CURRENCIES.indexOf(state.currency)),
    }, () => this.recompute())
  },

  recompute() {
    const { state, language } = this.data
    const transfers = simplifyDebts(state.participants, state.expenses, state.roundToWhole)
    const peopleById = new Map(state.participants.map((person) => [person.id, person]))
    const participantsView = state.participants.map((person) => ({
      ...person,
      ...avatarPresentation(person.avatarEmoji, person.id),
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
        fromAvatarEmoji: from.avatarEmoji,
        toAvatarEmoji: to.avatarEmoji,
        fromClass: avatarPresentation(from.avatarEmoji, from.id).avatarClass,
        toClass: avatarPresentation(to.avatarEmoji, to.id).avatarClass,
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
      amountPlaceholder: isZeroDecimalCurrency(state.currency) ? '0' : '0.00',
      hasExpenses: state.expenses.length > 0,
      isEven: state.expenses.length > 0 && transfers.length === 0,
      shareCanvasHeight: settlementCanvasHeight(transfersView),
    })
  },

  persistState(nextState) {
    const savedState = saveCurrentState(nextState)
    this.setData({ state: savedState }, () => this.recompute())
  },

  selectWorkspaceMode(event) {
    const workspaceMode = event.currentTarget.dataset.mode === 'shared' ? 'shared' : 'local'
    this.setData({ workspaceMode })
  },

  avatarPickerUsedEmojis() {
    if (this.data.avatarPickerContext !== 'local') return []
    return this.data.state.participants
      .filter(({ id }) => id !== this.data.avatarPickerTargetId)
      .map(({ avatarEmoji }) => avatarEmoji)
  },

  openLocalAvatarPicker(event) {
    const participant = this.data.state.participants.find(({ id }) => id === event.currentTarget.dataset.id)
    if (!participant) return
    this.setData({
      showAvatarPicker: true,
      avatarPickerContext: 'local',
      avatarPickerTargetId: participant.id,
      avatarPickerTargetName: participant.name,
      avatarPickerSelected: participant.avatarEmoji,
    })
  },

  openSharedAvatarPicker() {
    this.setData({
      showAvatarPicker: true,
      avatarPickerContext: 'shared-create',
      avatarPickerTargetId: '',
      avatarPickerTargetName: this.data.shareNicknameInput.trim() || '你的标记',
      avatarPickerSelected: this.data.shareAvatarEmoji,
    })
  },

  closeAvatarPicker() {
    this.setData({
      showAvatarPicker: false,
      avatarPickerContext: '',
      avatarPickerTargetId: '',
      avatarPickerTargetName: '',
      avatarPickerSelected: '',
    })
  },

  applyAvatarEmoji(avatarEmoji, { customized = true } = {}) {
    if (this.data.avatarPickerContext === 'local') {
      const participants = this.data.state.participants.map((participant) => (
        participant.id === this.data.avatarPickerTargetId ? { ...participant, avatarEmoji } : participant
      ))
      this.persistState({ ...this.data.state, participants })
    } else if (this.data.avatarPickerContext === 'shared-create') {
      this.setData({ shareAvatarEmoji: avatarEmoji, shareAvatarCustomized: customized })
    }
    this.closeAvatarPicker()
  },

  chooseAvatarEmoji(event) {
    this.applyAvatarEmoji(event.currentTarget.dataset.emoji)
  },

  randomizeAvatarEmoji() {
    this.applyAvatarEmoji(randomAvatarEmoji(this.avatarPickerUsedEmojis()))
  },

  restoreAutomaticAvatar() {
    const seed = this.data.avatarPickerContext === 'local'
      ? `local-ledger:${this.data.avatarPickerTargetId}`
      : `shared-draft:${this.data.shareRoomTitleInput.trim()}:${this.data.shareNicknameInput.trim()}`
    this.applyAvatarEmoji(automaticAvatarEmoji(seed, this.avatarPickerUsedEmojis()), { customized: false })
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
    const amountMinor = parseAmountMinor(form.amount, this.data.state.currency)
    const amountCents = amountMinor ? amountMinor * (isZeroDecimalCurrency(this.data.state.currency) ? 100 : 1) : 0
    const paidBy = form.paidBy || participants[0]?.id || ''
    const splitWith = form.splitMode === 'everyone' ? participants.map(({ id }) => id) : form.selectedIds
    let error = ''
    if (participants.length < 2) error = this.data.t.addTwoPeopleError
    else if (!paidBy) error = this.data.t.choosePayerError
    else if (!Number.isSafeInteger(amountCents) || amountCents <= 0) error = isZeroDecimalCurrency(this.data.state.currency) ? this.data.t.wholeAmountError : this.data.t.validAmountError
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
        amount: (expense.amountCents / 100).toFixed(isZeroDecimalCurrency(this.data.state.currency) ? 0 : 2),
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

  onCurrencyChange(event) {
    const value = this.data.currencyValues[Number(event.detail.value)] || 'auto'
    savePreferences({ currency: value })
    const state = normalizeCurrencyPrecision(this.data.state, value === 'auto' ? detectCurrency() : value)
    saveCurrentState(state)
    this.refreshFromStorage()
  },

  onThemeChange(event) {
    const value = THEME_OPTIONS[Number(event.detail.value)]?.value || 'system'
    savePreferences({ theme: value })
    this.refreshFromStorage()
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
    return formatDateTime()
  },

  saveAndStartNew() {
    if (this.data.state.expenses.length === 0) {
      wx.showToast({ title: this.data.t.addExpenseBeforeSave, icon: 'none' })
      return
    }
    this.setData({ showSaveDialog: true, saveTitleInput: this.defaultHistoryTitle() })
  },

  onSaveTitleInput(event) {
    this.setData({ saveTitleInput: event.detail.value })
  },

  cancelSaveDialog() {
    this.setData({ showSaveDialog: false, saveTitleInput: '' })
  },

  noop() {},

  confirmSaveAndStartNew() {
    const title = this.data.saveTitleInput.trim().slice(0, 80) || this.defaultHistoryTitle()
    try {
      const nextHistory = [createHistoryEntry(this.data.state, title), ...getHistory()].slice(0, 50)
      saveHistory(nextHistory)
      const nextState = { ...clone(EMPTY_STATE), currency: this.data.state.currency, roundToWhole: this.data.state.roundToWhole }
      this.setData({ editingExpenseId: '', expenseForm: defaultExpenseForm(), historyCount: nextHistory.length, showSaveDialog: false, saveTitleInput: '' })
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

  defaultSharedRoomTitle() {
    const date = new Date()
    return `${date.getMonth() + 1}月${date.getDate()}日分账`
  },

  onShareRoomTitleInput(event) {
    const shareRoomTitleInput = event.detail.value
    this.setData({
      shareRoomTitleInput,
      ...(!this.data.shareAvatarCustomized ? { shareAvatarEmoji: sharedDraftAvatar(shareRoomTitleInput, this.data.shareNicknameInput) } : {}),
    })
  },

  onShareNicknameInput(event) {
    const shareNicknameInput = event.detail.value
    this.setData({
      shareNicknameInput,
      ...(!this.data.shareAvatarCustomized ? { shareAvatarEmoji: sharedDraftAvatar(this.data.shareRoomTitleInput, shareNicknameInput) } : {}),
    })
  },

  onShareCurrencyChange(event) {
    this.setData({ shareCurrencyIndex: Number(event.detail.value) })
  },

  async confirmCreateSharedRoom() {
    if (this.data.creatingSharedRoom) return
    if (!this.data.sharedRoomsEnabled) {
      wx.showToast({ title: this.data.t.sharedUnavailable, icon: 'none' })
      return
    }
    const title = this.data.shareRoomTitleInput.trim()
    const nickname = this.data.shareNicknameInput.trim()
    const currency = CURRENCIES[this.data.shareCurrencyIndex] || this.data.state.currency
    if (!title) {
      wx.showToast({ title: '请输入账单名称', icon: 'none' })
      return
    }
    if (!nickname) {
      wx.showToast({ title: '请输入你的昵称', icon: 'none' })
      return
    }
    const avatarEmoji = this.data.shareAvatarEmoji
    const request = { title, currency, nickname, avatarEmoji }
    const fingerprint = JSON.stringify(request)
    if (!this.pendingRoomCreate || this.pendingRoomCreate.fingerprint !== fingerprint) {
      this.pendingRoomCreate = { fingerprint, mutationId: makeMutationId('room-create') }
    }
    this.setData({ creatingSharedRoom: true })
    try {
      const result = await callLedger('room_create', {
        title,
        currency,
        roundToWhole: false,
        profile: { nickname, avatarEmoji },
        mutationId: this.pendingRoomCreate.mutationId,
      })
      this.pendingRoomCreate = null
      const snapshot = saveRoomCache(result.snapshot)
      savePreferences({ sharedNickname: nickname })
      this.setData({ creatingSharedRoom: false })
      wx.navigateTo({ url: `/pages/room/room?roomId=${encodeURIComponent(snapshot.room.roomId)}` })
    } catch (error) {
      if (!['network_error', 'empty_response'].includes(error.code)) this.pendingRoomCreate = null
      this.setData({ creatingSharedRoom: false })
      wx.showToast({ title: sharedRoomError(error), icon: 'none', duration: 2800 })
    }
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
    const state = this.data.state
    const transfers = this.data.transfersView
    const toMove = transfers.reduce((sum, transfer) => sum + transfer.amountCents, 0)
    return exportSettlementImage(this, {
      height: this.data.shareCanvasHeight,
      draw: (context, width, height) => drawSettlementCard(context, {
        width,
        height,
        dark: this.data.themeClass === 'theme-dark',
        title: this.data.t.settlementPlan,
        overview: translate(this.data.language, 'shareOverview', {
          repayments: transfers.length,
          people: state.participants.length,
          currency: state.currency,
        }),
        toMoveText: formatMoney(toMove, state.currency),
        peopleCount: state.participants.length,
        currency: state.currency,
        transfers,
        labels: {
          toMove: this.data.t.toMove,
          repayments: this.data.t.repayments,
          people: this.data.t.people,
          paymentFlow: this.data.t.paymentFlow,
          footer: this.data.t.madeWith,
        },
      }),
    }).then((path) => {
      this.setData({ lastExportPath: path })
      return path
    })
  },
})
