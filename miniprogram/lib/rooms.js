import { CLOUD_ENV_ID, SHARED_ROOMS_ENABLED } from '../config/cloud'

const ROOM_CACHE_PREFIX = 'settle-shared-room-cache-v1:'
const ACTIVE_ROOM_IDS_KEY = 'settle-shared-room-ids-v1'
const MAX_CACHED_ROOMS = 12

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
    && typeof value.claimedByMemberId === 'string'
}

function validExpense(value, participantIds) {
  return isRecord(value)
    && Boolean(cleanString(value.expenseId, 80))
    && Boolean(cleanString(value.description, 60))
    && Number.isSafeInteger(value.amountCents)
    && value.amountCents > 0
    && participantIds.has(value.paidByParticipantId)
    && Array.isArray(value.splitParticipantIds)
    && value.splitParticipantIds.length > 0
    && value.splitParticipantIds.every((participantId) => participantIds.has(participantId))
}

export function parseRoomSnapshot(value) {
  if (!isRecord(value) || !isRecord(value.room) || !isRecord(value.self)) return null
  const roomId = cleanString(value.room.roomId, 80)
  const title = cleanString(value.room.title, 60)
  const currency = cleanString(value.room.currency, 8)
  if (!roomId || !title || !currency || !Number.isSafeInteger(value.room.revision) || value.room.revision < 1) return null
  if (!['active', 'archived'].includes(value.room.status)) return null
  if (!Array.isArray(value.participants) || !Array.isArray(value.expenses) || !Array.isArray(value.members)) return null
  const participants = value.participants.filter(validParticipant).map((participant) => ({
    participantId: participant.participantId,
    name: participant.name.trim(),
    claimedByMemberId: participant.claimedByMemberId,
  }))
  if (participants.length !== value.participants.length) return null
  const participantIds = new Set(participants.map(({ participantId }) => participantId))
  if (participantIds.size !== participants.length) return null
  const expenses = value.expenses.filter((expense) => validExpense(expense, participantIds)).map((expense) => ({
    expenseId: expense.expenseId,
    description: expense.description.trim(),
    amountCents: expense.amountCents,
    paidByParticipantId: expense.paidByParticipantId,
    splitParticipantIds: [...new Set(expense.splitParticipantIds)],
    createdByMemberId: cleanString(expense.createdByMemberId, 80),
    updatedAt: cleanString(expense.updatedAt, 40),
  }))
  if (expenses.length !== value.expenses.length) return null
  const members = value.members.map((member) => ({
    memberId: cleanString(member && member.memberId, 80),
    displayName: cleanString(member && member.displayName, 28),
    role: member && member.role === 'owner' ? 'owner' : 'editor',
    participantId: cleanString(member && member.participantId, 80),
    joinedAt: cleanString(member && member.joinedAt, 40),
    isSelf: member && member.isSelf === true,
  }))
  if (members.some((member) => !member.memberId || !member.displayName)) return null
  const selfMemberId = cleanString(value.self.memberId, 80)
  if (!selfMemberId || !members.some(({ memberId }) => memberId === selfMemberId)) return null

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
      displayName: cleanString(value.self.displayName, 28),
      role: value.self.role === 'owner' ? 'owner' : 'editor',
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
      amountCents: expense.amountCents,
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
      version: 1,
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
    if (!isRecord(value) || value.version !== 1) return null
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
