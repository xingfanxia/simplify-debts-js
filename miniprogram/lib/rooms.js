import { CLOUD_ENV_ID, SHARED_ROOMS_ENABLED } from '../config/cloud'
import { CURRENCIES } from './storage'

const ROOM_CACHE_PREFIX = 'settle-shared-room-cache-v2:'
const ACTIVE_ROOM_IDS_KEY = 'settle-shared-room-ids-v2'
const MAX_CACHED_ROOMS = 12
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW'])
const CURRENCY_SYMBOLS = {
  USD: '$', EUR: '€', GBP: '£', CAD: 'CA$', AUD: 'A$', CNY: '¥', JPY: '¥', KRW: '₩',
  MXN: 'MX$', BRL: 'R$', TWD: 'NT$', HKD: 'HK$', INR: '₹',
}

export class RoomError extends Error {
  constructor(code, details = {}) {
    super(code)
    this.name = 'RoomError'
    this.code = code
    this.details = details
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cleanString(value, maxLength = 100) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text && [...text].length <= maxLength ? text : ''
}

export function isZeroDecimalCurrency(currency) {
  return ZERO_DECIMAL_CURRENCIES.has(currency)
}

export function minorUnitFactor(currency) {
  return isZeroDecimalCurrency(currency) ? 1 : 100
}

export function parseAmountMinor(value, currency) {
  const text = typeof value === 'string' ? value.trim() : String(value ?? '').trim()
  const decimals = minorUnitFactor(currency) === 1 ? 0 : 2
  const pattern = decimals === 0 ? /^\d+$/ : /^\d+(?:\.\d{1,2})?$/
  if (!pattern.test(text)) return null
  const [wholeText, fractionText = ''] = text.split('.')
  const factor = minorUnitFactor(currency)
  const amountMinor = Number(wholeText) * factor + Number(fractionText.padEnd(decimals, '0') || 0)
  return Number.isSafeInteger(amountMinor) && amountMinor > 0 ? amountMinor : null
}

export function formatMinorMoney(amountMinor, currency) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || !CURRENCIES.includes(currency)) return ''
  const digits = isZeroDecimalCurrency(currency) ? 0 : 2
  const value = (amountMinor / minorUnitFactor(currency)).toFixed(digits).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${CURRENCY_SYMBOLS[currency] || `${currency} `}${value}`
}

export function reconcileExpenseDraft(snapshot, editingExpenseId, value) {
  const form = isRecord(value) ? value : {}
  const participants = Array.isArray(snapshot && snapshot.participants)
    ? snapshot.participants.filter(({ memberActive }) => memberActive !== false)
    : []
  const expenses = Array.isArray(snapshot && snapshot.expenses) ? snapshot.expenses : []
  const participantIds = participants.map(({ participantId }) => participantId).filter(Boolean)
  const participantIdSet = new Set(participantIds)
  const safeEditingExpenseId = cleanString(editingExpenseId, 80)
  const discardedEdit = Boolean(safeEditingExpenseId)
    && !expenses.some(({ expenseId }) => expenseId === safeEditingExpenseId)

  if (discardedEdit) {
    return {
      editingExpenseId: '',
      discardedEdit: true,
      form: { description: '', amount: '', paidBy: '', splitMode: 'everyone', selectedIds: [] },
    }
  }

  const splitMode = form.splitMode === 'custom' ? 'custom' : 'everyone'
  const selectedIds = splitMode === 'everyone'
    ? participantIds
    : [...new Set(Array.isArray(form.selectedIds) ? form.selectedIds : [])].filter((id) => participantIdSet.has(id))

  return {
    editingExpenseId: safeEditingExpenseId,
    discardedEdit: false,
    form: {
      description: typeof form.description === 'string' ? form.description : '',
      amount: typeof form.amount === 'string' ? form.amount : '',
      paidBy: participantIdSet.has(form.paidBy) ? form.paidBy : (participantIds[0] || ''),
      splitMode,
      selectedIds,
    },
  }
}

export function localAmountCentsToMinor(amountCents, currency) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return null
  if (minorUnitFactor(currency) === 1) return amountCents % 100 === 0 ? amountCents / 100 : null
  return amountCents
}

export function debtStateToRoomState(state) {
  if (!isRecord(state) || !CURRENCIES.includes(state.currency) || !Array.isArray(state.participants) || !Array.isArray(state.expenses)) {
    throw new RoomError('invalid_state')
  }
  const expenses = state.expenses.map((expense) => {
    const amountMinor = localAmountCentsToMinor(expense.amountCents, state.currency)
    if (!amountMinor) throw new RoomError('invalid_amount_precision')
    return {
      id: expense.id,
      description: expense.description,
      paidBy: expense.paidBy,
      amountMinor,
      splitWith: [...expense.splitWith],
    }
  })
  return {
    participants: state.participants.map(({ id, name }) => ({ id, name })),
    expenses,
    currency: state.currency,
    roundToWhole: state.roundToWhole === true,
  }
}

export function sharedRoomsAvailable() {
  return Boolean(SHARED_ROOMS_ENABLED && CLOUD_ENV_ID && wx.cloud)
}

export async function callLedger(action, data = {}) {
  if (!sharedRoomsAvailable()) throw new RoomError('cloud_unavailable')
  let response
  try {
    response = await wx.cloud.callFunction({ name: 'ledger', data: { ...data, action } })
  } catch (_error) {
    throw new RoomError('network_error')
  }
  const result = response && isRecord(response.result) ? response.result : null
  if (!result) throw new RoomError('empty_response')
  if (!result.ok) {
    const details = {}
    if (Number.isSafeInteger(result.currentRevision)) details.currentRevision = result.currentRevision
    if (result.error === 'revision_conflict') {
      const snapshot = parseRoomSnapshot(result.snapshot)
      if (snapshot) details.snapshot = snapshot
    }
    throw new RoomError(cleanString(result.error, 60) || 'unknown_error', details)
  }
  return result
}

export function makeMutationId(prefix = 'mutation') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

function validParticipant(value) {
  return isRecord(value)
    && Boolean(cleanString(value.participantId, 80))
    && Boolean(cleanString(value.name, 28))
    && Boolean(cleanString(value.memberId, 80))
    && typeof value.memberActive === 'boolean'
}

function validExpense(value, participantIds) {
  return isRecord(value)
    && Boolean(cleanString(value.expenseId, 80))
    && Boolean(cleanString(value.description, 60))
    && Number.isSafeInteger(value.amountMinor)
    && value.amountMinor > 0
    && participantIds.has(value.paidByParticipantId)
    && Array.isArray(value.splitParticipantIds)
    && value.splitParticipantIds.length > 0
    && new Set(value.splitParticipantIds).size === value.splitParticipantIds.length
    && value.splitParticipantIds.every((participantId) => participantIds.has(participantId))
}

export function parseRoomSnapshot(value) {
  if (!isRecord(value) || !isRecord(value.room) || !isRecord(value.self)) return null
  const roomId = cleanString(value.room.roomId, 80)
  const title = cleanString(value.room.title, 60)
  const currency = cleanString(value.room.currency, 8)
  if (!roomId || !title || !CURRENCIES.includes(currency) || !Number.isSafeInteger(value.room.revision) || value.room.revision < 1) return null
  if (!['active', 'archived'].includes(value.room.status)) return null
  if (!Array.isArray(value.participants) || !Array.isArray(value.expenses) || !Array.isArray(value.members)) return null
  const participants = value.participants.filter(validParticipant).map((participant) => ({
    participantId: participant.participantId,
    name: participant.name.trim(),
    memberId: participant.memberId,
    memberActive: participant.memberActive,
  }))
  if (participants.length !== value.participants.length) return null
  const participantIds = new Set(participants.map(({ participantId }) => participantId))
  if (participantIds.size !== participants.length) return null
  const expenses = value.expenses.filter((expense) => validExpense(expense, participantIds)).map((expense) => ({
    expenseId: expense.expenseId,
    description: expense.description.trim(),
    amountMinor: expense.amountMinor,
    paidByParticipantId: expense.paidByParticipantId,
    splitParticipantIds: [...new Set(expense.splitParticipantIds)],
    createdByMemberId: cleanString(expense.createdByMemberId, 80),
    updatedAt: cleanString(expense.updatedAt, 40),
  }))
  if (expenses.length !== value.expenses.length) return null
  const members = value.members.map((member) => isRecord(member) && ['owner', 'editor'].includes(member.role) ? ({
    memberId: cleanString(member.memberId, 80),
    displayName: cleanString(member.displayName, 28),
    role: member.role,
    participantId: cleanString(member.participantId, 80),
    joinedAt: cleanString(member.joinedAt, 40),
    isSelf: member.isSelf === true,
  }) : null)
  if (members.some((member) => !member)) return null
  if (members.some((member) => !member.memberId || !member.displayName)) return null
  const memberIds = new Set(members.map(({ memberId }) => memberId))
  if (memberIds.size !== members.length || members.filter(({ role }) => role === 'owner').length !== 1) return null
  if (members.some((member) => !member.participantId || !participantIds.has(member.participantId))) return null
  if (members.some((member) => participants.find(({ participantId }) => participantId === member.participantId)?.memberId !== member.memberId)) return null
  if (participants.some((participant) => participant.memberActive && !memberIds.has(participant.memberId))) return null
  if (participants.some((participant) => participant.memberActive && members.find(({ memberId }) => memberId === participant.memberId)?.participantId !== participant.participantId)) return null
  const selfMemberId = cleanString(value.self.memberId, 80)
  const selfMember = members.find(({ memberId }) => memberId === selfMemberId)
  const selfDisplayName = cleanString(value.self.displayName, 28)
  const selfRole = value.self.role
  if (!selfMember || !selfDisplayName || selfMember.displayName !== selfDisplayName || selfMember.role !== selfRole) return null
  if (members.filter(({ isSelf }) => isSelf).length !== 1 || !selfMember.isSelf) return null
  if ((value.self.canManage === true) !== (selfRole === 'owner')) return null

  const invites = Array.isArray(value.invites) ? value.invites.map((invite) => ({
    inviteId: cleanString(invite && invite.inviteId, 80),
    expiresAt: cleanString(invite && invite.expiresAt, 40),
    maxUses: Number.isSafeInteger(invite && invite.maxUses) ? invite.maxUses : 0,
    usedCount: Number.isSafeInteger(invite && invite.usedCount) ? invite.usedCount : 0,
    active: invite && invite.active === true,
  })) : []
  if (invites.some((invite) => !invite.inviteId || !invite.expiresAt || invite.maxUses < 1 || invite.usedCount < 0)) return null

  return {
    room: {
      roomId,
      title,
      currency,
      roundToWhole: value.room.roundToWhole === true,
      revision: value.room.revision,
      status: value.room.status,
      createdAt: cleanString(value.room.createdAt, 40),
      updatedAt: cleanString(value.room.updatedAt, 40),
    },
    self: {
      memberId: selfMemberId,
      displayName: selfDisplayName,
      role: selfRole,
      participantId: cleanString(value.self.participantId, 80),
      canManage: value.self.canManage === true,
    },
    members,
    participants,
    expenses,
    invites,
  }
}

export function snapshotToDebtState(snapshot) {
  return {
    participants: snapshot.participants.map(({ participantId, name }) => ({ id: participantId, name })),
    expenses: snapshot.expenses.map((expense) => ({
      id: expense.expenseId,
      description: expense.description,
      amountCents: expense.amountMinor,
      paidBy: expense.paidByParticipantId,
      splitWith: [...expense.splitParticipantIds],
    })),
    currency: snapshot.room.currency,
    roundToWhole: snapshot.room.roundToWhole,
  }
}

function rememberRoomId(roomId) {
  try {
    const existing = wx.getStorageSync(ACTIVE_ROOM_IDS_KEY)
    const ids = Array.isArray(existing) ? existing.filter((id) => typeof id === 'string' && id !== roomId) : []
    wx.setStorageSync(ACTIVE_ROOM_IDS_KEY, [roomId, ...ids].slice(0, MAX_CACHED_ROOMS))
  } catch (_error) {
    // The cloud result is still usable when local cache is unavailable.
  }
}

export function saveRoomCache(value) {
  const snapshot = parseRoomSnapshot(value)
  if (!snapshot) throw new RoomError('invalid_snapshot')
  try {
    wx.setStorageSync(`${ROOM_CACHE_PREFIX}${snapshot.room.roomId}`, {
      version: 2,
      cachedAt: new Date().toISOString(),
      snapshot,
    })
    rememberRoomId(snapshot.room.roomId)
  } catch (_error) {
    // Cache failure must not turn a successful cloud write into a failed write.
  }
  return snapshot
}

export function getRoomCache(roomId) {
  const safeRoomId = cleanString(roomId, 80)
  if (!safeRoomId) return null
  try {
    const value = wx.getStorageSync(`${ROOM_CACHE_PREFIX}${safeRoomId}`)
    if (!isRecord(value) || value.version !== 2) return null
    const snapshot = parseRoomSnapshot(value.snapshot)
    return snapshot ? { snapshot, cachedAt: cleanString(value.cachedAt, 40) } : null
  } catch (_error) {
    return null
  }
}

export function clearRoomCache(roomId) {
  const safeRoomId = cleanString(roomId, 80)
  if (!safeRoomId) return
  try {
    wx.removeStorageSync(`${ROOM_CACHE_PREFIX}${safeRoomId}`)
    const existing = wx.getStorageSync(ACTIVE_ROOM_IDS_KEY)
    if (Array.isArray(existing)) wx.setStorageSync(ACTIVE_ROOM_IDS_KEY, existing.filter((id) => id !== safeRoomId))
  } catch (_error) {
    // Nothing else to clean up.
  }
}

export function getCachedRooms() {
  try {
    const ids = wx.getStorageSync(ACTIVE_ROOM_IDS_KEY)
    if (!Array.isArray(ids)) return []
    return ids.map((roomId) => {
      const cached = getRoomCache(roomId)
      return cached ? { roomId, ...cached } : null
    }).filter(Boolean)
  } catch (_error) {
    return []
  }
}
