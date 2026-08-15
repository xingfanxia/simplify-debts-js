import { simplifyDebts } from '../../lib/debts'
import { getMessages } from '../../lib/i18n'
import { CURRENCIES, getPreferences, resolveTheme } from '../../lib/storage'
import {
  RoomError,
  callLedger,
  clearRoomCache,
  formatMinorMoney,
  getRoomCache,
  isZeroDecimalCurrency,
  makeMutationId,
  minorUnitFactor,
  parseAmountMinor,
  parseRoomSnapshot,
  reconcileExpenseDraft,
  saveRoomCache,
  sharedRoomsAvailable,
  snapshotToDebtState,
} from '../../lib/rooms'

const AVATAR_CLASSES = ['avatar-coral', 'avatar-mint', 'avatar-blue', 'avatar-purple']
const POLL_INTERVAL_MS = 2500

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function avatarClass(name) {
  const total = [...name].reduce((sum, character) => sum + character.charCodeAt(0), 0)
  return AVATAR_CLASSES[total % AVATAR_CLASSES.length]
}

function formatExpiry(iso) {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return ''
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function emptyExpenseForm(paidBy = '') {
  return { description: '', amount: '', paidBy, splitMode: 'everyone', selectedIds: [] }
}

function mutationFingerprint(action, kind, payload) {
  return JSON.stringify([action, kind, payload])
}

function errorText(error) {
  const code = error && error.code ? error.code : 'unknown_error'
  const messages = {
    cloud_unavailable: '共享功能尚未连接云环境。',
    network_error: '网络暂时不可用，请稍后重试。',
    invite_invalid: '邀请已失效，请让房主重新发送。',
    invite_expired: '邀请已过期，请让房主重新发送。',
    invite_exhausted: '这个邀请的使用次数已用完。',
    invite_limit: '这个房间创建的邀请过多，请先使用已有邀请。',
    room_full: '这个共享账单的成员已满。',
    membership_revoked: '你已被移出这个共享账单。',
    new_invite_required: '请使用退出后由房主新生成的邀请重新加入。',
    not_member: '你还不是这个共享账单的成员。',
    room_not_found: '共享账单不存在或已被删除。',
    room_not_active: '共享账单已归档，现在只能查看。',
    revision_conflict: '账单刚刚被其他成员更新，已为你刷新。',
    mutation_mismatch: '这次重试与原操作不一致，请刷新后再试。',
    currency_precision_change: '已有共享支出时，不能在整数币种与两位小数币种之间切换。',
    invalid_display_name: '请输入 1–28 个字符的昵称。',
    invalid_profile: '请输入你的昵称。',
    legacy_identity_forbidden: '加入流程已经更新，请重新打开邀请。',
    expense_not_found: '这笔支出已被删除，账单已为你刷新。',
    duplicate_participant: '账单中已有同名参与人。',
    invalid_amount: '请输入大于零的有效金额。',
    owner_required: '只有房主可以进行这项操作。',
    owner_cannot_leave: '房主不能直接退出；可以归档或删除账单。',
    invalid_snapshot: '云端账单数据格式异常，已停止显示。',
  }
  return messages[code] || '操作失败，请稍后重试。'
}

Page({
  data: {
    t: getMessages(),
    themeClass: '',
    mode: 'loading',
    errorMessage: '',
    preview: null,
    joinNickname: '',
    joining: false,
    roomId: '',
    snapshot: null,
    roomTitle: '',
    currency: 'CNY',
    revisionText: '',
    syncText: '正在同步',
    syncClass: 'syncing',
    readOnly: true,
    canManage: false,
    participantsView: [],
    participantNames: [],
    membersView: [],
    expensesView: [],
    transfersView: [],
    totalSpendText: '¥0.00',
    amountPlaceholder: '0.00',
    expenseForm: emptyExpenseForm(),
    editingExpenseId: '',
    payerIndex: 0,
    formError: '',
    mutating: false,
    showProfileDialog: false,
    profileNicknameInput: '',
    updatingProfile: false,
    invitePreparing: false,
    inviteReady: false,
    inviteSharePath: '',
    inviteId: '',
    inviteExpiryText: '',
    currencyValues: CURRENCIES,
    currencyIndex: CURRENCIES.indexOf('CNY'),
    inviteListView: [],
  },

  onLoad(options = {}) {
    this.applyTheme()
    this.inviteToken = typeof options.invite === 'string' ? options.invite.trim() : ''
    const roomId = typeof options.roomId === 'string' ? options.roomId.trim() : ''
    if (this.inviteToken) {
      this.loadInvitePreview()
      return
    }
    if (!roomId) {
      this.setData({ mode: 'error', errorMessage: '缺少共享账单信息。' })
      return
    }
    this.setData({ roomId })
    const cached = getRoomCache(roomId)
    if (cached) this.applySnapshot(cached.snapshot, { offline: true })
    this.loadRoom()
  },

  onShow() {
    this.applyTheme()
    if (this.data.roomId) {
      this.loadRoom({ silent: true })
      this.startPolling()
    }
  },

  onHide() {
    this.stopPolling()
  },

  onUnload() {
    this.stopPolling()
    this.inviteToken = ''
    this.pendingJoin = null
    this.pendingProfileUpdate = null
    if (this.pendingMutations) this.pendingMutations.clear()
  },

  onPullDownRefresh() {
    const task = this.data.roomId ? this.loadRoom() : this.loadInvitePreview()
    Promise.resolve(task).finally(() => wx.stopPullDownRefresh())
  },

  onShareAppMessage() {
    if (this.data.inviteReady && this.data.inviteSharePath) {
      return { title: `邀请你加入“${this.data.roomTitle}”`, path: this.data.inviteSharePath }
    }
    return { title: '多人分账', path: '/pages/index/index' }
  },

  noop() {},

  applyTheme() {
    const theme = resolveTheme(getPreferences().theme)
    getApp().globalData.theme = theme
    getApp().applyNavigationTheme(theme)
    this.setData({ themeClass: theme === 'dark' ? 'theme-dark' : '' })
  },

  async loadInvitePreview() {
    if (!this.inviteToken) return
    this.setData({ mode: 'loading', errorMessage: '' })
    try {
      const result = await callLedger('room_join_preview', { invite: this.inviteToken })
      const preview = result.preview
      this.setData({
        mode: 'preview',
        preview,
        joinNickname: '',
      })
      wx.setNavigationBarTitle({ title: '加入共享账单' })
      if (preview.alreadyJoined) this.joinRoom()
    } catch (error) {
      this.setData({ mode: 'error', errorMessage: errorText(error) })
    }
  },

  onJoinNicknameInput(event) {
    this.setData({ joinNickname: event.detail.value })
  },

  async joinRoom() {
    if (this.data.joining) return
    const alreadyJoined = this.data.preview?.alreadyJoined === true
    const nickname = this.data.joinNickname.trim()
    if (!alreadyJoined && !nickname) {
      wx.showToast({ title: '请输入你的昵称', icon: 'none' })
      return
    }
    const fingerprint = JSON.stringify([this.inviteToken, nickname, alreadyJoined])
    if (!this.pendingJoin || this.pendingJoin.fingerprint !== fingerprint) {
      this.pendingJoin = { fingerprint, mutationId: makeMutationId('room-join') }
    }
    this.setData({ joining: true })
    try {
      const request = {
        invite: this.inviteToken,
        mutationId: this.pendingJoin.mutationId,
      }
      if (!alreadyJoined) {
        request.profile = { nickname }
      }
      const result = await callLedger('room_join', request)
      this.pendingJoin = null
      this.inviteToken = ''
      const snapshot = saveRoomCache(result.snapshot)
      this.setData({ roomId: snapshot.room.roomId, joining: false })
      this.applySnapshot(snapshot)
      this.startPolling()
    } catch (error) {
      if (!['network_error', 'empty_response'].includes(error.code)) this.pendingJoin = null
      this.setData({ joining: false })
      wx.showToast({ title: errorText(error), icon: 'none', duration: 2600 })
      if (['invite_invalid', 'invite_expired', 'invite_exhausted', 'membership_revoked'].includes(error.code)) {
        this.setData({ mode: 'error', errorMessage: errorText(error) })
      }
    }
  },

  async loadRoom({ silent = false } = {}) {
    if (!this.data.roomId || this.fetching) return
    this.fetching = true
    if (!silent && !this.data.snapshot) this.setData({ mode: 'loading' })
    try {
      const result = await callLedger('room_get', {
        roomId: this.data.roomId,
        knownRevision: this.data.snapshot?.room.revision || 0,
      })
      if (result.unchanged && this.data.snapshot) {
        if (this.data.syncClass === 'offline') this.applySnapshot(this.data.snapshot)
        return
      }
      const snapshot = saveRoomCache(result.snapshot)
      this.applySnapshot(snapshot)
    } catch (error) {
      const cached = getRoomCache(this.data.roomId)
      if (cached && ['network_error', 'cloud_unavailable'].includes(error.code)) {
        this.applySnapshot(cached.snapshot, { offline: true })
      } else if (['membership_revoked', 'not_member', 'room_not_found'].includes(error.code)) {
        this.stopPolling()
        clearRoomCache(this.data.roomId)
        this.setData({ mode: 'error', snapshot: null, errorMessage: errorText(error) })
      } else if (!silent || !this.data.snapshot) {
        this.setData({ mode: 'error', errorMessage: errorText(error) })
      }
    } finally {
      this.fetching = false
    }
  },

  startPolling() {
    this.stopPolling()
    if (!this.data.roomId || !sharedRoomsAvailable()) return
    this.pollTimer = setInterval(() => this.loadRoom({ silent: true }), POLL_INTERVAL_MS)
  },

  stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = null
  },

  applySnapshot(value, { offline = false } = {}) {
    const snapshot = parseRoomSnapshot(value)
    if (!snapshot) {
      this.setData({ mode: 'error', errorMessage: errorText(new RoomError('invalid_snapshot')) })
      return
    }
    const readOnly = offline || snapshot.room.status !== 'active'
    const currencyValues = snapshot.expenses.length
      ? CURRENCIES.filter((currency) => minorUnitFactor(currency) === minorUnitFactor(snapshot.room.currency))
      : CURRENCIES
    const currentInvite = snapshot.invites.find((invite) => invite.inviteId === this.data.inviteId && invite.active)
    const keepCurrentInvite = offline ? this.data.inviteReady : Boolean(currentInvite)
    const draft = reconcileExpenseDraft(snapshot, this.data.editingExpenseId, this.data.expenseForm)
    if (!draft.editingExpenseId && !this.data.expenseForm.paidBy && snapshot.self.participantId) {
      draft.form.paidBy = snapshot.self.participantId
    }
    this.setData({
      mode: 'room',
      snapshot,
      roomId: snapshot.room.roomId,
      roomTitle: snapshot.room.title,
      currency: snapshot.room.currency,
      amountPlaceholder: isZeroDecimalCurrency(snapshot.room.currency) ? '0' : '0.00',
      currencyValues,
      currencyIndex: Math.max(0, currencyValues.indexOf(snapshot.room.currency)),
      revisionText: `版本 ${snapshot.room.revision}`,
      syncText: offline ? '离线，只读' : snapshot.room.status === 'archived' ? '已归档' : '已同步',
      syncClass: offline ? 'offline' : snapshot.room.status === 'archived' ? 'archived' : 'synced',
      readOnly,
      canManage: snapshot.self.canManage,
      inviteReady: keepCurrentInvite,
      inviteSharePath: keepCurrentInvite ? this.data.inviteSharePath : '',
      inviteId: keepCurrentInvite ? this.data.inviteId : '',
      inviteExpiryText: keepCurrentInvite ? this.data.inviteExpiryText : '',
      editingExpenseId: draft.editingExpenseId,
      expenseForm: draft.form,
      formError: draft.discardedEdit ? '正在编辑的支出已被其他成员删除，编辑已取消。' : this.data.formError,
    }, () => {
      wx.setNavigationBarTitle({ title: snapshot.room.title })
      this.recompute()
      if (draft.discardedEdit) wx.showToast({ title: '支出已被其他成员删除', icon: 'none', duration: 2600 })
    })
  },

  recompute() {
    const snapshot = this.data.snapshot
    if (!snapshot) return
    const state = snapshotToDebtState(snapshot)
    const peopleById = new Map(state.participants.map((person) => [person.id, person]))
    const selected = new Set(this.data.expenseForm.selectedIds)
    const participantsView = snapshot.participants.filter(({ memberActive }) => memberActive).map((participant) => ({
      ...participant,
      initials: initials(participant.name),
      avatarClass: avatarClass(participant.name),
      selected: selected.has(participant.participantId),
    }))
    const expensesView = snapshot.expenses.map((expense) => {
      const payer = peopleById.get(expense.paidByParticipantId)
      const splitNames = expense.splitParticipantIds.map((participantId) => peopleById.get(participantId)?.name).filter(Boolean)
      return {
        ...expense,
        payerName: payer?.name || '某人',
        amountText: formatMinorMoney(expense.amountMinor, snapshot.room.currency),
        splitText: expense.splitParticipantIds.length === snapshot.participants.length ? '全员分摊' : `${splitNames.join('、')} 分摊`,
        isEditing: expense.expenseId === this.data.editingExpenseId,
      }
    })
    const transfersView = simplifyDebts(state.participants, state.expenses, state.roundToWhole, minorUnitFactor(state.currency)).map((transfer, index) => {
      const from = peopleById.get(transfer.from)
      const to = peopleById.get(transfer.to)
      return {
        ...transfer,
        key: `${transfer.from}-${transfer.to}-${index}`,
        fromName: from?.name || '某人',
        toName: to?.name || '某人',
        amountText: formatMinorMoney(transfer.amountCents, state.currency),
      }
    })
    const membersView = snapshot.members.map((member) => ({
      ...member,
      initials: initials(member.displayName),
      avatarClass: avatarClass(member.displayName),
      roleText: member.role === 'owner' ? '房主' : '成员',
      canRemove: this.data.canManage && member.role !== 'owner' && !member.isSelf,
      canEditProfile: member.isSelf && !this.data.readOnly,
    }))
    const inviteListView = (snapshot.invites || []).map((invite) => ({
      ...invite,
      expiryText: formatExpiry(invite.expiresAt),
      usageText: `${invite.usedCount}/${invite.maxUses} 人已使用`,
      statusText: invite.active ? '有效' : '已失效',
    }))
    this.setData({
      participantsView,
      participantNames: participantsView.map(({ name }) => name),
      expensesView,
      transfersView,
      membersView,
      inviteListView,
      totalSpendText: formatMinorMoney(snapshot.expenses.reduce((sum, expense) => sum + expense.amountMinor, 0), state.currency),
      payerIndex: Math.max(0, participantsView.findIndex(({ participantId }) => participantId === this.data.expenseForm.paidBy)),
    })
  },

  onDescriptionInput(event) {
    this.setData({ 'expenseForm.description': event.detail.value, formError: '' })
  },

  onAmountInput(event) {
    this.setData({ 'expenseForm.amount': event.detail.value, formError: '' })
  },

  onPayerChange(event) {
    const participant = this.data.participantsView[Number(event.detail.value)]
    if (participant) this.setData({ 'expenseForm.paidBy': participant.participantId, payerIndex: Number(event.detail.value), formError: '' })
  },

  chooseEveryone() {
    this.setData({
      'expenseForm.splitMode': 'everyone',
      'expenseForm.selectedIds': this.data.participantsView.map(({ participantId }) => participantId),
      formError: '',
    }, () => this.recompute())
  },

  chooseCustom() {
    const selectedIds = this.data.expenseForm.selectedIds.length
      ? this.data.expenseForm.selectedIds
      : this.data.participantsView.map(({ participantId }) => participantId)
    this.setData({ 'expenseForm.splitMode': 'custom', 'expenseForm.selectedIds': selectedIds, formError: '' }, () => this.recompute())
  },

  toggleSplitPerson(event) {
    if (this.data.expenseForm.splitMode !== 'custom') return
    const selected = new Set(this.data.expenseForm.selectedIds)
    const participantId = event.currentTarget.dataset.id
    if (selected.has(participantId)) selected.delete(participantId)
    else selected.add(participantId)
    this.setData({ 'expenseForm.selectedIds': [...selected], formError: '' }, () => this.recompute())
  },

  async submitExpense() {
    const participants = this.data.participantsView
    const form = this.data.expenseForm
    const amountMinor = parseAmountMinor(form.amount, this.data.currency)
    const paidByParticipantId = form.paidBy || participants[0]?.participantId || ''
    const splitParticipantIds = form.splitMode === 'everyone' ? participants.map(({ participantId }) => participantId) : form.selectedIds
    if (!participants.length) this.setData({ formError: '当前没有可记账的成员。' })
    else if (!amountMinor) this.setData({ formError: isZeroDecimalCurrency(this.data.currency) ? '该币种只支持整数金额。' : '请输入大于零、最多两位小数的金额。' })
    else if (!paidByParticipantId) this.setData({ formError: '请选择付款人。' })
    else if (!splitParticipantIds.length) this.setData({ formError: '请至少选择一位分摊人。' })
    else {
      const ok = await this.mutate('upsert_expense', {
        expense: {
          expenseId: this.data.editingExpenseId || '',
          description: form.description.trim() || '共同支出',
          amountMinor,
          paidByParticipantId,
          splitParticipantIds,
        },
      }, 'expense')
      if (ok) this.setData({ editingExpenseId: '', expenseForm: emptyExpenseForm(this.data.snapshot.self.participantId), formError: '' }, () => this.recompute())
    }
  },

  editExpense(event) {
    const expense = this.data.snapshot.expenses.find(({ expenseId }) => expenseId === event.currentTarget.dataset.id)
    if (!expense) return
    const activeIds = new Set(this.data.participantsView.map(({ participantId }) => participantId))
    const everyone = expense.splitParticipantIds.length === activeIds.size && expense.splitParticipantIds.every((id) => activeIds.has(id))
    this.setData({
      editingExpenseId: expense.expenseId,
      expenseForm: {
        description: expense.description,
        amount: (expense.amountMinor / minorUnitFactor(this.data.currency)).toFixed(isZeroDecimalCurrency(this.data.currency) ? 0 : 2),
        paidBy: expense.paidByParticipantId,
        splitMode: everyone ? 'everyone' : 'custom',
        selectedIds: [...expense.splitParticipantIds],
      },
      formError: '',
    }, () => {
      this.recompute()
      wx.pageScrollTo({ selector: '#shared-expense-composer', duration: 240 })
    })
  },

  cancelExpenseEdit() {
    this.setData({ editingExpenseId: '', expenseForm: emptyExpenseForm(this.data.snapshot.self.participantId), formError: '' }, () => this.recompute())
  },

  removeExpense(event) {
    const expense = this.data.snapshot.expenses.find(({ expenseId }) => expenseId === event.currentTarget.dataset.id)
    if (!expense) return
    wx.showModal({
      title: '删除支出', content: `确定删除“${expense.description}”？`, confirmColor: '#b5443a',
      success: ({ confirm }) => confirm && this.mutate('delete_expense', { expenseId: expense.expenseId }, 'expense'),
    })
  },

  toggleRounding(event) {
    this.mutate('set_rounding', { roundToWhole: event.detail.value }, 'rounding')
  },

  onRoomCurrencyChange(event) {
    const currency = this.data.currencyValues[Number(event.detail.value)]
    if (currency && currency !== this.data.currency) this.mutate('set_currency', { currency }, 'currency')
  },

  async mutate(kind, payload, prefix) {
    if (this.data.readOnly || this.data.mutating) {
      if (this.data.readOnly) wx.showToast({ title: '当前为只读状态', icon: 'none' })
      return false
    }
    const fingerprint = mutationFingerprint('room_mutate', kind, payload)
    const mutationId = this.pendingMutationId(fingerprint, prefix)
    this.setData({ mutating: true, syncText: '正在同步', syncClass: 'syncing' })
    try {
      await callLedger('room_mutate', {
        roomId: this.data.roomId,
        baseRevision: this.data.snapshot.room.revision,
        mutationId,
        kind,
        payload,
      })
      this.clearPendingMutation(fingerprint)
      await this.loadRoom({ silent: true })
      return true
    } catch (error) {
      if (!['network_error', 'empty_response'].includes(error.code)) this.clearPendingMutation(fingerprint)
      if (error.code === 'revision_conflict' && !this.applyConflictSnapshot(error)) await this.loadRoom({ silent: true })
      wx.showToast({ title: errorText(error), icon: 'none', duration: 2600 })
      return false
    } finally {
      this.setData({ mutating: false })
    }
  },

  async prepareInvite() {
    if (!this.data.canManage || this.data.readOnly || this.data.invitePreparing) return
    const payload = { ttlDays: 7, maxUses: 20 }
    const fingerprint = mutationFingerprint('room_invite', 'create', payload)
    const mutationId = this.pendingMutationId(fingerprint, 'invite')
    this.setData({ invitePreparing: true })
    try {
      const result = await callLedger('room_invite', {
        roomId: this.data.roomId,
        baseRevision: this.data.snapshot.room.revision,
        mutationId,
        ...payload,
      })
      this.clearPendingMutation(fingerprint)
      this.setData({
        invitePreparing: false,
        inviteReady: true,
        inviteSharePath: result.sharePath,
        inviteId: result.inviteId,
        inviteExpiryText: `${formatExpiry(result.expiresAt)}前有效`,
      })
      await this.loadRoom({ silent: true })
    } catch (error) {
      if (!['network_error', 'empty_response'].includes(error.code)) this.clearPendingMutation(fingerprint)
      this.setData({ invitePreparing: false })
      if (error.code === 'revision_conflict' && !this.applyConflictSnapshot(error)) await this.loadRoom({ silent: true })
      wx.showToast({ title: errorText(error), icon: 'none' })
    }
  },

  revokeCurrentInvite() {
    if (!this.data.inviteId) return
    this.manage('revoke_invite', { inviteId: this.data.inviteId }, { successText: '邀请已撤销' }).then((ok) => {
      if (ok) this.setData({ inviteReady: false, inviteSharePath: '', inviteId: '', inviteExpiryText: '' })
    })
  },

  revokeInvite(event) {
    const inviteId = event.currentTarget.dataset.id
    if (!inviteId) return
    this.manage('revoke_invite', { inviteId }, { successText: '邀请已撤销' }).then((ok) => {
      if (ok && inviteId === this.data.inviteId) this.setData({ inviteReady: false, inviteSharePath: '', inviteId: '', inviteExpiryText: '' })
    })
  },

  openProfileDialog() {
    if (this.data.readOnly || !this.data.snapshot) return
    this.pendingProfileUpdate = null
    this.setData({
      showProfileDialog: true,
      profileNicknameInput: this.data.snapshot.self.displayName,
    })
  },

  closeProfileDialog() {
    if (this.data.updatingProfile) return
    this.pendingProfileUpdate = null
    this.setData({ showProfileDialog: false, profileNicknameInput: '' })
  },

  onProfileNicknameInput(event) {
    this.setData({ profileNicknameInput: event.detail.value })
  },

  async updateProfile() {
    if (this.data.updatingProfile || !this.data.snapshot) return
    const nickname = this.data.profileNicknameInput.trim()
    if (!nickname) {
      wx.showToast({ title: '请输入你的昵称', icon: 'none' })
      return
    }
    const fingerprint = JSON.stringify([this.data.roomId, nickname])
    if (!this.pendingProfileUpdate || this.pendingProfileUpdate.fingerprint !== fingerprint) {
      this.pendingProfileUpdate = { fingerprint, mutationId: makeMutationId('profile') }
    }
    this.setData({ updatingProfile: true })
    try {
      await callLedger('room_profile_update', {
        roomId: this.data.roomId,
        baseRevision: this.data.snapshot.room.revision,
        mutationId: this.pendingProfileUpdate.mutationId,
        profile: { nickname },
      })
      this.pendingProfileUpdate = null
      this.setData({ updatingProfile: false, showProfileDialog: false, profileNicknameInput: '' })
      await this.loadRoom({ silent: true })
      wx.showToast({ title: '昵称已更新', icon: 'success' })
    } catch (error) {
      if (!['network_error', 'empty_response'].includes(error.code)) this.pendingProfileUpdate = null
      this.setData({ updatingProfile: false })
      if (error.code === 'revision_conflict' && !this.applyConflictSnapshot(error)) await this.loadRoom({ silent: true })
      wx.showToast({ title: errorText(error), icon: 'none', duration: 2600 })
    }
  },

  removeMember(event) {
    const member = this.data.snapshot.members.find(({ memberId }) => memberId === event.currentTarget.dataset.id)
    if (!member) return
    wx.showModal({
      title: '移除成员', content: `移除“${member.displayName}”后，对方将立即无法查看或编辑账单。`, confirmColor: '#b5443a',
      success: ({ confirm }) => confirm && this.manage('remove_member', { memberId: member.memberId }, { successText: '成员已移除' }),
    })
  },

  leaveRoom() {
    wx.showModal({
      title: '退出共享账单', content: '退出后需要新的邀请才能重新加入。', confirmColor: '#b5443a',
      success: ({ confirm }) => confirm && this.manage('leave_room', {}, { leaveAfter: true }),
    })
  },

  archiveRoom() {
    wx.showModal({
      title: '归档共享账单', content: '归档后所有成员只能查看，不能再编辑。',
      success: ({ confirm }) => confirm && this.manage('archive_room', {}, { successText: '账单已归档' }),
    })
  },

  deleteRoom() {
    wx.showModal({
      title: '删除共享账单', content: '删除后所有成员将立即失去访问权限。云端数据保留 30 天，如需恢复请联系开发者。', confirmText: '确认删除', confirmColor: '#b5443a',
      success: ({ confirm }) => confirm && this.manage('delete_room', {}, { leaveAfter: true }),
    })
  },

  async manage(kind, payload, { successText = '', leaveAfter = false } = {}) {
    if (this.data.syncClass === 'offline') {
      wx.showToast({ title: '离线状态下只能查看', icon: 'none' })
      return false
    }
    if (this.data.mutating) return false
    const fingerprint = mutationFingerprint('room_manage', kind, payload)
    const mutationId = this.pendingMutationId(fingerprint, 'manage')
    this.setData({ mutating: true, syncText: '正在同步', syncClass: 'syncing' })
    try {
      await callLedger('room_manage', {
        roomId: this.data.roomId,
        baseRevision: this.data.snapshot.room.revision,
        mutationId,
        kind,
        payload,
      })
      this.clearPendingMutation(fingerprint)
      if (leaveAfter) {
        clearRoomCache(this.data.roomId)
        wx.showToast({ title: kind === 'delete_room' ? '共享账单已删除' : '已退出共享账单', icon: 'success' })
        setTimeout(() => wx.reLaunch({ url: '/pages/index/index' }), 500)
      } else {
        await this.loadRoom({ silent: true })
        if (successText) wx.showToast({ title: successText, icon: 'success' })
      }
      return true
    } catch (error) {
      if (!['network_error', 'empty_response'].includes(error.code)) this.clearPendingMutation(fingerprint)
      if (error.code === 'revision_conflict' && !this.applyConflictSnapshot(error)) await this.loadRoom({ silent: true })
      wx.showToast({ title: errorText(error), icon: 'none', duration: 2600 })
      return false
    } finally {
      this.setData({ mutating: false })
    }
  },

  pendingMutationId(fingerprint, prefix) {
    if (!this.pendingMutations) this.pendingMutations = new Map()
    if (!this.pendingMutations.has(fingerprint)) this.pendingMutations.set(fingerprint, makeMutationId(prefix))
    return this.pendingMutations.get(fingerprint)
  },

  clearPendingMutation(fingerprint) {
    if (this.pendingMutations) this.pendingMutations.delete(fingerprint)
  },

  applyConflictSnapshot(error) {
    const snapshot = error && error.details ? error.details.snapshot : null
    if (!snapshot) return false
    try {
      this.applySnapshot(saveRoomCache(snapshot))
      return true
    } catch (_error) {
      return false
    }
  },
})
