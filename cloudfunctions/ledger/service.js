const crypto = require('node:crypto')
const { automaticAvatarEmoji, ensureParticipantAvatars, isAvatarEmoji } = require('./avatar')

const CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CNY', 'JPY', 'KRW', 'MXN', 'BRL', 'TWD', 'HKD', 'INR'])
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW'])
const LIMITS = Object.freeze({
  title: 60,
  displayName: 28,
  participantName: 28,
  description: 60,
  participants: 30,
  expenses: 60,
  members: 20,
  invites: 30,
  inviteUses: 20,
  roomsPerUser: 50,
  amountMinor: 100_000_000_000,
})

class LedgerError extends Error {
  constructor(code, details = {}) {
    super(code)
    this.name = 'LedgerError'
    this.code = code
    this.details = details
  }
}

function assert(condition, code, details) {
  if (!condition) throw new LedgerError(code, details)
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cleanString(value, maxLength, code, { optional = false } = {}) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text && optional) return ''
  assert(Boolean(text), code)
  assert([...text].length <= maxLength, code)
  return text
}

function uniqueStrings(value, maxItems, code) {
  assert(Array.isArray(value) && value.length > 0 && value.length <= maxItems, code)
  const items = value.map((item) => cleanString(item, 96, code))
  assert(new Set(items).size === items.length, code)
  return items
}

function encodeToken(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function defaultToken(bytes = 24) {
  return encodeToken(crypto.randomBytes(bytes))
}

function defaultHash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex')
}

function stableSerialize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`
}

function isoTime(value) {
  const date = value instanceof Date ? value : new Date(value)
  assert(Number.isFinite(date.getTime()), 'invalid_clock')
  return date.toISOString()
}

function normalizeState(value) {
  assert(isRecord(value), 'invalid_state')
  assert(CURRENCIES.has(value.currency), 'invalid_currency')
  assert(Array.isArray(value.participants) && value.participants.length >= 2 && value.participants.length <= LIMITS.participants, 'invalid_participants')
  assert(Array.isArray(value.expenses) && value.expenses.length <= LIMITS.expenses, 'invalid_expenses')

  const participantIds = new Set()
  const participantNames = new Set()
  const participants = value.participants.map((participant) => {
    assert(isRecord(participant), 'invalid_participant')
    const id = cleanString(participant.id, 96, 'invalid_participant')
    const name = cleanString(participant.name, LIMITS.participantName, 'invalid_participant')
    assert(participant.avatarEmoji === undefined || isAvatarEmoji(participant.avatarEmoji), 'invalid_avatar')
    const normalizedName = name.toLocaleLowerCase()
    assert(!participantIds.has(id) && !participantNames.has(normalizedName), 'duplicate_participant')
    participantIds.add(id)
    participantNames.add(normalizedName)
    return { id, name, ...(isAvatarEmoji(participant.avatarEmoji) ? { avatarEmoji: participant.avatarEmoji } : {}) }
  })

  const expenseIds = new Set()
  const expenses = value.expenses.map((expense) => {
    assert(isRecord(expense), 'invalid_expense')
    const id = cleanString(expense.id, 96, 'invalid_expense')
    assert(!expenseIds.has(id), 'duplicate_expense')
    expenseIds.add(id)
    const description = cleanString(expense.description, LIMITS.description, 'invalid_expense')
    const paidBy = cleanString(expense.paidBy, 96, 'invalid_expense')
    assert(participantIds.has(paidBy), 'invalid_expense_participant')
    assert(Number.isSafeInteger(expense.amountMinor) && expense.amountMinor > 0 && expense.amountMinor <= LIMITS.amountMinor, 'invalid_amount')
    const splitWith = uniqueStrings(expense.splitWith, LIMITS.participants, 'invalid_expense_participant')
    assert(splitWith.every((participantId) => participantIds.has(participantId)), 'invalid_expense_participant')
    return { id, description, paidBy, amountMinor: expense.amountMinor, splitWith }
  })

  return {
    participants: ensureParticipantAvatars(participants, 'normalized-ledger'),
    expenses,
    currency: value.currency,
    roundToWhole: value.roundToWhole === true,
  }
}

function normalizeInviteToken(value) {
  const token = cleanString(value, 160, 'invalid_invite')
  assert(/^[A-Za-z0-9_-]{32,160}$/.test(token), 'invalid_invite')
  return token
}

function normalizeMutation(event) {
  const roomId = cleanString(event.roomId, 80, 'invalid_room')
  assert(/^[A-Za-z0-9_-]{16,80}$/.test(roomId), 'invalid_room')
  assert(Number.isSafeInteger(event.baseRevision) && event.baseRevision >= 1, 'invalid_revision')
  const mutationId = cleanString(event.mutationId, 80, 'invalid_mutation')
  assert(/^[A-Za-z0-9_-]{12,80}$/.test(mutationId), 'invalid_mutation')
  return { roomId, baseRevision: event.baseRevision, mutationId }
}

function normalizeMutationId(value) {
  const mutationId = cleanString(value, 80, 'invalid_mutation')
  assert(/^[A-Za-z0-9_-]{12,80}$/.test(mutationId), 'invalid_mutation')
  return mutationId
}

function rejectLegacyIdentity(event) {
  const legacyFields = ['state', 'displayName', 'ownerParticipantId', 'claimParticipantId', 'newParticipantName']
  assert(!legacyFields.some((field) => Object.prototype.hasOwnProperty.call(event, field)), 'legacy_identity_forbidden')
}

function normalizeProfile(event) {
  assert(isRecord(event.profile), 'invalid_profile')
  assert(Object.keys(event.profile).every((key) => ['nickname', 'avatarEmoji'].includes(key)), 'invalid_profile')
  const displayName = cleanString(event.profile.nickname, LIMITS.displayName, 'invalid_display_name')
  const avatarProvided = Object.prototype.hasOwnProperty.call(event.profile, 'avatarEmoji')
  const avatarEmoji = avatarProvided ? event.profile.avatarEmoji : null
  assert(!avatarProvided || avatarEmoji === null || isAvatarEmoji(avatarEmoji), 'invalid_avatar')
  return { displayName, avatarEmoji, avatarProvided }
}

function resolveProfileAvatar(profile, seed, usedEmojis, existingAvatar = '') {
  if (profile.avatarProvided && isAvatarEmoji(profile.avatarEmoji)) return profile.avatarEmoji
  if (!profile.avatarProvided && isAvatarEmoji(existingAvatar)) return existingAvatar
  return automaticAvatarEmoji(seed, usedEmojis)
}

function memberAuthId(hash, roomId, openid) {
  return hash(`member-auth:${roomId}:${openid}`)
}

function entityDocId(hash, kind, roomId, entityId) {
  return hash(`${kind}:${roomId}:${entityId}`)
}

function mutationDocId(hash, roomId, memberId, mutationId) {
  return hash(`mutation:${roomId}:${memberId}:${mutationId}`)
}

function roomCreateMutationDocId(hash, openid, mutationId) {
  return hash(`room-create:${openid}:${mutationId}`)
}

function userIndexId(hash, openid) {
  return hash(`user-index:${openid}`)
}

function normalizeKnownRoomIds(value) {
  if (value === undefined) return []
  assert(Array.isArray(value) && value.length <= LIMITS.roomsPerUser, 'invalid_room_list')
  return [...new Set(value.map((roomId) => {
    const safeRoomId = cleanString(roomId, 80, 'invalid_room_list')
    assert(/^[A-Za-z0-9_-]{16,80}$/.test(safeRoomId), 'invalid_room_list')
    return safeRoomId
  }))]
}

function active(document) {
  return Boolean(document) && !document.revokedAt && !document.deletedAt
}

function currencyScale(currency) {
  return ZERO_DECIMAL_CURRENCIES.has(currency) ? 1 : 100
}

function sortByCreated(left, right) {
  return String(left.createdAt || '').localeCompare(String(right.createdAt || ''))
}

function createLedgerService({
  repository,
  openid,
  appid = '',
  now = () => new Date(),
  makeToken = defaultToken,
  hash = defaultHash,
}) {
  assert(repository && typeof repository.runTransaction === 'function', 'repository_unavailable')
  assert(typeof repository.runRead === 'function', 'repository_unavailable')
  assert(typeof openid === 'string' && openid, 'no_openid')

  const timestamp = () => isoTime(now())
  const id = (prefix, bytes = 12) => `${prefix}_${makeToken(bytes)}`

  async function requireRoom(tx, roomId, { includeDeleted = false } = {}) {
    const room = await tx.getRoom(roomId)
    assert(room, 'room_not_found')
    if (!includeDeleted) assert(room.status !== 'deleted', 'room_not_found')
    return room
  }

  async function requireMember(tx, roomId) {
    const member = await tx.getMember(memberAuthId(hash, roomId, openid))
    assert(active(member), member && member.revokedAt ? 'membership_revoked' : 'not_member')
    return member
  }

  async function snapshot(tx, room, self) {
    const members = await tx.listMembers(room._id)
    const participants = await tx.listParticipants(room._id)
    const expenses = await tx.listExpenses(room._id)
    const invites = self.role === 'owner' ? await tx.listInvites(room._id) : []
    const activeMembers = members.filter(active).sort(sortByCreated)
    const activeMemberIds = new Set(activeMembers.map(({ memberId }) => memberId))
    const avatarCandidates = participants.filter(active).sort(sortByCreated).map((participant) => {
      const member = activeMembers.find(({ participantId }) => participantId === participant.participantId)
      return {
        participantId: participant.participantId,
        name: participant.name,
        memberId: participant.memberId || participant.claimedByMemberId || '',
        memberActive: activeMemberIds.has(participant.memberId || participant.claimedByMemberId || ''),
        avatarEmoji: isAvatarEmoji(participant.avatarEmoji) ? participant.avatarEmoji : member?.avatarEmoji,
      }
    })
    const visibleParticipants = ensureParticipantAvatars(avatarCandidates, `room:${room._id}`).map((participant) => ({
      participantId: participant.participantId,
      name: participant.name,
      memberId: participant.memberId || participant.claimedByMemberId || '',
      memberActive: activeMemberIds.has(participant.memberId || participant.claimedByMemberId || ''),
      avatarEmoji: participant.avatarEmoji,
    }))
    const avatarByParticipantId = new Map(visibleParticipants.map(({ participantId, avatarEmoji }) => [participantId, avatarEmoji]))
    const visibleMembers = activeMembers.map((member) => ({
      memberId: member.memberId,
      displayName: member.displayName,
      role: member.role,
      participantId: member.participantId || '',
      joinedAt: member.joinedAt,
      isSelf: member.memberId === self.memberId,
      avatarEmoji: avatarByParticipantId.get(member.participantId) || automaticAvatarEmoji(`room:${room._id}:${member.participantId}`),
    }))
    const visibleExpenses = expenses.filter(active).sort(sortByCreated).map((expense) => ({
      expenseId: expense.expenseId,
      description: expense.description,
      amountMinor: expense.amountMinor,
      paidByParticipantId: expense.paidByParticipantId,
      splitParticipantIds: [...expense.splitParticipantIds],
      createdByMemberId: expense.createdByMemberId,
      updatedAt: expense.updatedAt,
    }))
    const snapshotTime = Date.parse(timestamp())
    return {
      room: {
        roomId: room._id,
        title: room.title,
        currency: room.currency,
        roundToWhole: room.roundToWhole === true,
        revision: room.revision,
        status: room.status,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
      },
      self: {
        memberId: self.memberId,
        displayName: self.displayName,
        role: self.role,
        participantId: self.participantId || '',
        canManage: self.role === 'owner',
        avatarEmoji: avatarByParticipantId.get(self.participantId) || automaticAvatarEmoji(`room:${room._id}:${self.participantId}`),
      },
      members: visibleMembers,
      participants: visibleParticipants,
      expenses: visibleExpenses,
      invites: invites.filter((invite) => !invite.revokedAt).sort(sortByCreated).map((invite) => ({
        inviteId: invite._id,
        expiresAt: invite.expiresAt,
        maxUses: invite.maxUses,
        usedCount: invite.usedCount,
        active: Date.parse(invite.expiresAt) > snapshotTime && invite.usedCount < invite.maxUses,
      })),
    }
  }

  async function createRoom(event) {
    rejectLegacyIdentity(event)
    const mutationId = normalizeMutationId(event.mutationId)
    const title = cleanString(event.title || '共享账单', LIMITS.title, 'invalid_title')
    assert(CURRENCIES.has(event.currency), 'invalid_currency')
    const profile = normalizeProfile(event)
    const requestHash = hash(stableSerialize({
      title,
      currency: event.currency,
      roundToWhole: event.roundToWhole === true,
      profile,
    }))

    const created = await repository.runTransaction(async (tx) => {
      const requestDocumentId = roomCreateMutationDocId(hash, openid, mutationId)
      const replay = await tx.getMutation(requestDocumentId)
      if (replay) {
        assert(replay.requestHash === requestHash, 'mutation_mismatch')
        return { roomId: replay.roomId, replayed: true }
      }
      const createdAt = timestamp()
      const roomId = id('room', 18)
      const ownerMemberId = id('member')
      const ownerParticipantId = id('person')
      const ownerAvatarEmoji = resolveProfileAvatar(profile, `room:${roomId}:${ownerParticipantId}`, [])
      const ownerParticipant = {
        _id: entityDocId(hash, 'participant', roomId, ownerParticipantId),
        roomId,
        participantId: ownerParticipantId,
        name: profile.displayName,
        avatarEmoji: ownerAvatarEmoji,
        memberId: ownerMemberId,
        createdAt,
        deletedAt: null,
      }
      const room = {
        _id: roomId,
        title,
        currency: event.currency,
        roundToWhole: event.roundToWhole === true,
        ownerMemberId,
        revision: 1,
        status: 'active',
        createdAt,
        updatedAt: createdAt,
        totalMinor: 0,
        deletedAt: null,
        memberDocIds: [memberAuthId(hash, roomId, openid)],
        participantDocIds: [ownerParticipant._id],
        expenseDocIds: [],
        inviteIds: [],
      }
      const owner = {
        _id: memberAuthId(hash, roomId, openid),
        userIndexId: userIndexId(hash, openid),
        roomId,
        memberId: ownerMemberId,
        displayName: profile.displayName,
        avatarEmoji: ownerAvatarEmoji,
        role: 'owner',
        participantId: ownerParticipantId,
        joinedAt: createdAt,
        revokedAt: null,
        revokedReason: null,
        revokedAtRevision: null,
      }
      await tx.putRoom(room)
      await tx.putMember(owner)
      await tx.putParticipant(ownerParticipant)
      await tx.putMutation({
        _id: requestDocumentId,
        roomId,
        mutationId,
        memberId: ownerMemberId,
        kind: 'room_create',
        requestHash,
        revision: room.revision,
        createdAt,
      })
      return { roomId, replayed: false }
    })
    return { ok: true, replayed: created.replayed, snapshot: await readAuthorizedSnapshot(created.roomId) }
  }

  function assertInviteUsable(invite, currentTime) {
    assert(invite && !invite.revokedAt, 'invite_invalid')
    assert(Date.parse(invite.expiresAt) > Date.parse(currentTime), 'invite_expired')
    assert(invite.usedCount < invite.maxUses, 'invite_exhausted')
  }

  async function createInvite(event) {
    const { roomId, baseRevision, mutationId } = normalizeMutation(event)
    const ttlDays = Number.isSafeInteger(event.ttlDays) ? event.ttlDays : 7
    const maxUses = Number.isSafeInteger(event.maxUses) ? event.maxUses : LIMITS.inviteUses
    assert(ttlDays >= 1 && ttlDays <= 30, 'invalid_invite')
    assert(maxUses >= 1 && maxUses <= LIMITS.inviteUses, 'invalid_invite')
    const requestHash = hash(stableSerialize({ ttlDays, maxUses }))
    return repository.runTransaction(async (tx) => {
      const room = await requireRoom(tx, roomId)
      const member = await requireMember(tx, roomId)
      assert(member.role === 'owner' && room.ownerMemberId === member.memberId, 'owner_required')
      const mutationIdHash = mutationDocId(hash, roomId, member.memberId, mutationId)
      const token = hash(`invite-token:${roomId}:${openid}:${mutationId}`)
      const tokenHash = hash(token)
      const replay = await tx.getMutation(mutationIdHash)
      if (replay) {
        assert(replay.requestHash === requestHash, 'mutation_mismatch')
        return {
          ok: true,
          replayed: true,
          revision: replay.revision,
          inviteId: replay.entityId,
          expiresAt: replay.expiresAt,
          maxUses: replay.maxUses,
          sharePath: `/pages/room/room?invite=${encodeURIComponent(token)}`,
        }
      }
      assert(room.status === 'active', 'room_not_active')
      assert(room.revision === baseRevision, 'revision_conflict', { currentRevision: room.revision })
      const createdAt = timestamp()
      const inviteDocuments = await tx.listInvites(roomId)
      const activeInviteIds = inviteDocuments.filter((invite) => (
        !invite.revokedAt
        && Date.parse(invite.expiresAt) > Date.parse(createdAt)
        && invite.usedCount < invite.maxUses
      )).map(({ _id }) => _id)
      assert(activeInviteIds.length < LIMITS.invites, 'invite_limit')
      const expiresAt = new Date(Date.parse(createdAt) + ttlDays * 24 * 60 * 60 * 1000).toISOString()
      const existing = await tx.getInvite(tokenHash)
      assert(!existing, 'invite_collision')
      await tx.putInvite({
        _id: tokenHash,
        tokenHash,
        roomId,
        createdByMemberId: member.memberId,
        createdAt,
        createdRevision: room.revision + 1,
        expiresAt,
        maxUses,
        usedCount: 0,
        revokedAt: null,
      })
      const nextRoom = {
        ...room,
        revision: room.revision + 1,
        updatedAt: createdAt,
        inviteIds: [...activeInviteIds, tokenHash],
      }
      await tx.putRoom(nextRoom)
      await tx.putMutation({
        _id: mutationIdHash,
        roomId,
        mutationId,
        memberId: member.memberId,
        kind: 'room_invite',
        requestHash,
        entityId: tokenHash,
        expiresAt,
        maxUses,
        revision: nextRoom.revision,
        createdAt,
      })
      return {
        ok: true,
        replayed: false,
        revision: nextRoom.revision,
        inviteId: tokenHash,
        expiresAt,
        maxUses,
        sharePath: `/pages/room/room?invite=${encodeURIComponent(token)}`,
      }
    })
  }

  async function invitePreview(event) {
    const token = normalizeInviteToken(event.invite)
    return repository.runRead(async (tx) => {
      const currentTime = timestamp()
      const invite = await tx.getInvite(hash(token))
      assert(invite, 'invite_invalid')
      const room = await requireRoom(tx, invite.roomId)
      const existing = await tx.getMember(memberAuthId(hash, room._id, openid))
      const alreadyJoined = active(existing)
      if (!alreadyJoined) {
        assertInviteUsable(invite, currentTime)
        assert(room.status === 'active', 'room_not_active')
      }
      const members = (await tx.listMembers(room._id)).filter(active)
      return {
        ok: true,
        preview: {
          title: room.title,
          currency: room.currency,
          memberCount: members.length,
          alreadyJoined,
          expiresAt: invite.expiresAt,
        },
      }
    })
  }

  async function joinRoom(event) {
    rejectLegacyIdentity(event)
    const token = normalizeInviteToken(event.invite)
    const mutationId = normalizeMutationId(event.mutationId)

    const membership = await repository.runRead(async (tx) => {
      const invite = await tx.getInvite(hash(token))
      assert(invite, 'invite_invalid')
      const room = await requireRoom(tx, invite.roomId)
      const member = await tx.getMember(memberAuthId(hash, room._id, openid))
      return { roomId: room._id, alreadyJoined: active(member) }
    })
    if (membership.alreadyJoined) {
      return { ok: true, alreadyJoined: true, snapshot: await readAuthorizedSnapshot(membership.roomId) }
    }

    const profile = normalizeProfile(event)

    const joined = await repository.runTransaction(async (tx) => {
      const currentTime = timestamp()
      const invite = await tx.getInvite(hash(token))
      assert(invite, 'invite_invalid')
      const room = await requireRoom(tx, invite.roomId)
      const authId = memberAuthId(hash, room._id, openid)
      const existing = await tx.getMember(authId)
      if (active(existing)) {
        return { roomId: room._id, alreadyJoined: true }
      }
      assertInviteUsable(invite, currentTime)
      if (existing) {
        assert(['left', 'removed'].includes(existing.revokedReason), 'membership_revoked')
        const inviteIsNewer = Number.isSafeInteger(invite.createdRevision) && Number.isSafeInteger(existing.revokedAtRevision)
          ? invite.createdRevision > existing.revokedAtRevision
          : Date.parse(invite.createdAt) > Date.parse(existing.revokedAt)
        assert(inviteIsNewer, 'new_invite_required')
      }
      assert(room.status === 'active', 'room_not_active')
      const members = (await tx.listMembers(room._id)).filter(active)
      assert(members.length < LIMITS.members, 'room_full')
      const participants = (await tx.listParticipants(room._id)).filter(active)
      assert(participants.length < LIMITS.participants || Boolean(existing && existing.participantId), 'participant_limit')
      const participantId = existing && existing.participantId ? existing.participantId : id('person')
      const memberId = existing && existing.memberId ? existing.memberId : id('member')
      const existingParticipant = participants.find((item) => item.participantId === participantId)
      const usedAvatars = participants
        .filter((item) => item.participantId !== participantId)
        .map(({ avatarEmoji }) => avatarEmoji)
        .filter(isAvatarEmoji)
      const existingAvatar = existingParticipant?.avatarEmoji || existing?.avatarEmoji
      const avatarEmoji = resolveProfileAvatar(
        profile,
        `room:${room._id}:${participantId}`,
        usedAvatars,
        isAvatarEmoji(existingAvatar) && !usedAvatars.includes(existingAvatar) ? existingAvatar : '',
      )
      const member = {
        _id: authId,
        userIndexId: userIndexId(hash, openid),
        roomId: room._id,
        memberId,
        displayName: profile.displayName,
        avatarEmoji,
        role: 'editor',
        participantId,
        joinedAt: currentTime,
        revokedAt: null,
        revokedReason: null,
        revokedAtRevision: null,
      }
      const participantDocument = existingParticipant ? {
        ...existingParticipant,
        name: profile.displayName,
        avatarEmoji,
        memberId,
        claimedByMemberId: null,
        deletedAt: null,
      } : {
          _id: entityDocId(hash, 'participant', room._id, participantId),
          roomId: room._id,
          participantId,
          name: profile.displayName,
          avatarEmoji,
          memberId,
          createdAt: currentTime,
          deletedAt: null,
        }
      await tx.putParticipant(participantDocument)
      await tx.putMember(member)
      await tx.putInvite({ ...invite, usedCount: invite.usedCount + 1 })
      const nextRoom = {
        ...room,
        revision: room.revision + 1,
        updatedAt: currentTime,
        memberDocIds: [...new Set([...(room.memberDocIds || []), member._id])],
        participantDocIds: [...new Set([...(room.participantDocIds || []), participantDocument._id])],
      }
      await tx.putRoom(nextRoom)
      return { roomId: room._id, alreadyJoined: false }
    })
    return { ok: true, alreadyJoined: joined.alreadyJoined, snapshot: await readAuthorizedSnapshot(joined.roomId) }
  }

  async function updateProfile(event) {
    const { roomId, baseRevision, mutationId } = normalizeMutation(event)
    const profile = normalizeProfile(event)
    const requestHash = hash(stableSerialize({ profile }))
    return repository.runTransaction(async (tx) => {
      const room = await requireRoom(tx, roomId)
      const member = await requireMember(tx, roomId)
      const mutationIdHash = mutationDocId(hash, roomId, member.memberId, mutationId)
      const replay = await tx.getMutation(mutationIdHash)
      if (replay) {
        assert(replay.requestHash === requestHash, 'mutation_mismatch')
        return { ok: true, revision: replay.revision, replayed: true }
      }
      assert(room.status === 'active', 'room_not_active')
      assert(room.revision === baseRevision, 'revision_conflict', { currentRevision: room.revision })
      const currentTime = timestamp()
      const participants = await tx.listParticipants(roomId)
      const participant = participants.find((item) => item.participantId === member.participantId && active(item))
      assert(participant, 'participant_not_found')
      const usedAvatars = participants
        .filter((item) => item.participantId !== participant.participantId && active(item))
        .map(({ avatarEmoji }) => avatarEmoji)
        .filter(isAvatarEmoji)
      const avatarEmoji = resolveProfileAvatar(
        profile,
        `room:${roomId}:${participant.participantId}`,
        usedAvatars,
        participant.avatarEmoji || member.avatarEmoji,
      )
      await tx.putMember({ ...member, userIndexId: userIndexId(hash, openid), displayName: profile.displayName, avatarEmoji })
      await tx.putParticipant({ ...participant, name: profile.displayName, avatarEmoji, memberId: member.memberId, claimedByMemberId: null })
      const nextRoom = { ...room, revision: room.revision + 1, updatedAt: currentTime }
      await tx.putRoom(nextRoom)
      await tx.putMutation({
        _id: mutationIdHash,
        roomId,
        mutationId,
        memberId: member.memberId,
        kind: 'room_profile_update',
        requestHash,
        revision: nextRoom.revision,
        createdAt: currentTime,
      })
      return { ok: true, revision: nextRoom.revision }
    })
  }

  async function readAuthorizedSnapshot(roomId) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await repository.runRead(async (tx) => {
        const room = await requireRoom(tx, roomId)
        const member = await requireMember(tx, roomId)
        const view = await snapshot(tx, room, member)
        const latestRoom = await requireRoom(tx, roomId)
        return { stable: latestRoom.revision === room.revision && latestRoom.status === room.status, view }
      })
      if (result.stable) return result.view
    }
    throw new LedgerError('revision_conflict')
  }

  async function listRooms(event) {
    const knownRoomIds = normalizeKnownRoomIds(event.knownRoomIds)
    const currentUserIndexId = userIndexId(hash, openid)

    if (knownRoomIds.length) {
      await repository.runTransaction(async (tx) => {
        for (const roomId of knownRoomIds) {
          const room = await tx.getRoom(roomId)
          if (!room || room.status === 'deleted') continue
          const member = await tx.getMember(memberAuthId(hash, roomId, openid))
          if (!active(member) || member.userIndexId === currentUserIndexId) continue
          await tx.putMember({ ...member, userIndexId: currentUserIndexId })
        }
      })
    }

    const rooms = await repository.runRead(async (tx) => {
      const indexedMemberships = await tx.listMembersByUser(currentUserIndexId)
      const memberships = [...new Map(indexedMemberships
        .filter(active)
        .map((member) => [member.roomId, member])).values()]
      const summaries = []

      for (const member of memberships.slice(0, LIMITS.roomsPerUser)) {
        const room = await tx.getRoom(member.roomId)
        if (!room || room.status === 'deleted') continue
        const legacyExpenses = Number.isSafeInteger(room.totalMinor) && room.totalMinor >= 0
          ? null
          : (await tx.listExpenses(room._id)).filter(active)
        summaries.push({
          roomId: room._id,
          title: room.title,
          currency: room.currency,
          status: room.status,
          updatedAt: room.updatedAt,
          totalMinor: legacyExpenses ? legacyExpenses.reduce((total, expense) => total + expense.amountMinor, 0) : room.totalMinor,
          expenseCount: Array.isArray(room.expenseDocIds) ? room.expenseDocIds.length : (legacyExpenses || []).length,
          memberCount: Array.isArray(room.memberDocIds) ? room.memberDocIds.length : 1,
          avatars: [],
        })
      }

      return summaries.sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')))
    })

    return { ok: true, rooms }
  }

  async function getRoom(event) {
    const roomId = cleanString(event.roomId, 80, 'invalid_room')
    const knownRevision = Number.isSafeInteger(event.knownRevision) && event.knownRevision >= 1 ? event.knownRevision : 0
    if (knownRevision) {
      const current = await repository.runRead(async (tx) => {
        const room = await requireRoom(tx, roomId)
        await requireMember(tx, roomId)
        return { revision: room.revision, unchanged: room.revision === knownRevision }
      })
      if (current.unchanged) return { ok: true, unchanged: true, revision: current.revision }
    }
    return { ok: true, snapshot: await readAuthorizedSnapshot(roomId) }
  }

  async function applyMutation(tx, room, member, kind, payload, currentTime) {
    const activeMembers = (await tx.listMembers(room._id)).filter(active)
    const participantIds = new Set(activeMembers.map(({ participantId }) => participantId).filter(Boolean))
    if (kind === 'upsert_expense') {
      assert(isRecord(payload.expense), 'invalid_expense')
      const incoming = payload.expense
      const description = cleanString(incoming.description, LIMITS.description, 'invalid_expense')
      assert(Number.isSafeInteger(incoming.amountMinor) && incoming.amountMinor > 0 && incoming.amountMinor <= LIMITS.amountMinor, 'invalid_amount')
      const paidByParticipantId = cleanString(incoming.paidByParticipantId, 80, 'invalid_expense_participant')
      const splitParticipantIds = uniqueStrings(incoming.splitParticipantIds, LIMITS.participants, 'invalid_expense_participant')
      assert(participantIds.has(paidByParticipantId) && splitParticipantIds.every((participantId) => participantIds.has(participantId)), 'invalid_expense_participant')
      const requestedExpenseId = incoming.expenseId ? cleanString(incoming.expenseId, 80, 'invalid_expense') : ''
      const expenseId = requestedExpenseId || id('expense')
      const docId = entityDocId(hash, 'expense', room._id, expenseId)
      const existing = await tx.getExpense(docId)
      const currentTotal = Number.isSafeInteger(room.totalMinor) && room.totalMinor >= 0
        ? room.totalMinor
        : (await tx.listExpenses(room._id)).filter(active).reduce((total, expense) => total + expense.amountMinor, 0)
      if (requestedExpenseId) {
        assert(active(existing), 'expense_not_found')
      } else {
        assert(!existing, 'expense_collision')
        const expenses = (await tx.listExpenses(room._id)).filter(active)
        assert(expenses.length < LIMITS.expenses, 'expense_limit')
        room.expenseDocIds = [...(room.expenseDocIds || []), docId]
      }
      await tx.putExpense({
        _id: docId,
        roomId: room._id,
        expenseId,
        description,
        amountMinor: incoming.amountMinor,
        paidByParticipantId,
        splitParticipantIds,
        createdByMemberId: existing ? existing.createdByMemberId : member.memberId,
        createdAt: existing ? existing.createdAt : currentTime,
        updatedAt: currentTime,
        deletedAt: null,
      })
      room.totalMinor = currentTotal + incoming.amountMinor - (active(existing) ? existing.amountMinor : 0)
      return { entityId: expenseId }
    }
    if (kind === 'delete_expense') {
      const expenseId = cleanString(payload.expenseId, 80, 'invalid_expense')
      const existing = await tx.getExpense(entityDocId(hash, 'expense', room._id, expenseId))
      assert(active(existing), 'expense_not_found')
      const currentTotal = Number.isSafeInteger(room.totalMinor) && room.totalMinor >= 0
        ? room.totalMinor
        : (await tx.listExpenses(room._id)).filter(active).reduce((total, expense) => total + expense.amountMinor, 0)
      await tx.putExpense({ ...existing, deletedAt: currentTime, updatedAt: currentTime })
      room.expenseDocIds = (room.expenseDocIds || []).filter((documentId) => documentId !== existing._id)
      room.totalMinor = Math.max(0, currentTotal - existing.amountMinor)
      return { entityId: expenseId }
    }
    if (['add_participant', 'rename_participant', 'remove_participant'].includes(kind)) {
      throw new LedgerError('legacy_identity_forbidden')
    }
    if (kind === 'set_rounding') {
      room.roundToWhole = payload.roundToWhole === true
      return {}
    }
    if (kind === 'set_currency') {
      assert(member.role === 'owner', 'owner_required')
      assert(CURRENCIES.has(payload.currency), 'invalid_currency')
      if (currencyScale(payload.currency) !== currencyScale(room.currency)) {
        const expenses = (await tx.listExpenses(room._id)).filter(active)
        assert(expenses.length === 0, 'currency_precision_change')
      }
      room.currency = payload.currency
      return {}
    }
    if (kind === 'rename_room') {
      assert(member.role === 'owner', 'owner_required')
      room.title = cleanString(payload.title, LIMITS.title, 'invalid_title')
      return {}
    }
    throw new LedgerError('unknown_mutation')
  }

  async function mutateRoom(event) {
    const { roomId, baseRevision, mutationId } = normalizeMutation(event)
    const kind = cleanString(event.kind, 40, 'unknown_mutation')
    const payload = isRecord(event.payload) ? event.payload : {}
    const requestHash = hash(stableSerialize({ kind, payload }))
    return repository.runTransaction(async (tx) => {
      const room = await requireRoom(tx, roomId)
      const member = await requireMember(tx, roomId)
      const mutationIdHash = mutationDocId(hash, roomId, member.memberId, mutationId)
      const replay = await tx.getMutation(mutationIdHash)
      if (replay) {
        assert(replay.requestHash === requestHash, 'mutation_mismatch')
        return { ok: true, revision: replay.revision, replayed: true, entityId: replay.entityId || '' }
      }
      assert(room.status === 'active', 'room_not_active')
      assert(room.revision === baseRevision, 'revision_conflict', { currentRevision: room.revision })
      const currentTime = timestamp()
      const outcome = await applyMutation(tx, room, member, kind, payload, currentTime)
      const nextRoom = { ...room, revision: room.revision + 1, updatedAt: currentTime }
      await tx.putRoom(nextRoom)
      await tx.putMutation({
        _id: mutationIdHash,
        roomId,
        mutationId,
        memberId: member.memberId,
        kind,
        requestHash,
        entityId: outcome.entityId || null,
        revision: nextRoom.revision,
        createdAt: currentTime,
      })
      return { ok: true, revision: nextRoom.revision, entityId: outcome.entityId || '' }
    })
  }

  async function manageRoom(event) {
    const { roomId, baseRevision, mutationId } = normalizeMutation(event)
    const kind = cleanString(event.kind, 40, 'unknown_management')
    const payload = isRecord(event.payload) ? event.payload : {}
    const requestHash = hash(stableSerialize({ kind, payload }))
    return repository.runTransaction(async (tx) => {
      const room = await requireRoom(tx, roomId, { includeDeleted: true })
      const member = await tx.getMember(memberAuthId(hash, roomId, openid))
      assert(member, 'not_member')
      const mutationIdHash = mutationDocId(hash, roomId, member.memberId, mutationId)
      const replay = await tx.getMutation(mutationIdHash)
      if (replay) {
        assert(replay.requestHash === requestHash, 'mutation_mismatch')
        return { ok: true, revision: replay.revision, replayed: true }
      }
      assert(room.status !== 'deleted', 'room_not_found')
      assert(active(member), member.revokedAt ? 'membership_revoked' : 'not_member')
      assert(room.revision === baseRevision, 'revision_conflict', { currentRevision: room.revision })
      const currentTime = timestamp()
      if (kind === 'remove_member') {
        assert(member.role === 'owner', 'owner_required')
        const memberId = cleanString(payload.memberId, 80, 'invalid_member')
        assert(memberId !== room.ownerMemberId, 'cannot_remove_owner')
        const members = await tx.listMembers(roomId)
        const target = members.find((item) => item.memberId === memberId && active(item))
        assert(target, 'member_not_found')
        await tx.putMember({ ...target, revokedAt: currentTime, revokedReason: 'removed', revokedAtRevision: room.revision + 1 })
        room.memberDocIds = (room.memberDocIds || []).filter((documentId) => documentId !== target._id)
      } else if (kind === 'leave_room') {
        assert(member.role !== 'owner', 'owner_cannot_leave')
        await tx.putMember({ ...member, revokedAt: currentTime, revokedReason: 'left', revokedAtRevision: room.revision + 1 })
        room.memberDocIds = (room.memberDocIds || []).filter((documentId) => documentId !== member._id)
      } else if (kind === 'revoke_invite') {
        assert(member.role === 'owner', 'owner_required')
        const inviteId = cleanString(payload.inviteId, 80, 'invalid_invite')
        const invite = await tx.getInvite(inviteId)
        assert(invite && invite.roomId === roomId && !invite.revokedAt, 'invite_invalid')
        await tx.putInvite({ ...invite, revokedAt: currentTime })
        room.inviteIds = (room.inviteIds || []).filter((documentId) => documentId !== invite._id)
      } else if (kind === 'archive_room') {
        assert(member.role === 'owner', 'owner_required')
        assert(room.status === 'active', 'room_not_active')
        room.status = 'archived'
        room.archivedAt = currentTime
      } else if (kind === 'delete_room') {
        assert(member.role === 'owner', 'owner_required')
        room.status = 'deleted'
        room.deletedAt = currentTime
        const invites = await tx.listInvites(roomId)
        for (const invite of invites.filter((item) => !item.revokedAt)) {
          await tx.putInvite({ ...invite, revokedAt: currentTime })
        }
      } else {
        throw new LedgerError('unknown_management')
      }
      const nextRoom = { ...room, revision: room.revision + 1, updatedAt: currentTime }
      await tx.putRoom(nextRoom)
      await tx.putMutation({
        _id: mutationIdHash,
        roomId,
        mutationId,
        memberId: member.memberId,
        kind,
        requestHash,
        revision: nextRoom.revision,
        createdAt: currentTime,
      })
      return { ok: true, revision: nextRoom.revision }
    })
  }

  async function execute(event = {}) {
    try {
      const action = cleanString(event.action, 40, 'unknown_action')
      if (action === 'room_create') return await createRoom(event)
      if (action === 'room_invite') return await createInvite(event)
      if (action === 'room_join_preview') return await invitePreview(event)
      if (action === 'room_join') return await joinRoom(event)
      if (action === 'room_get') return await getRoom(event)
      if (action === 'room_list') return await listRooms(event)
      if (action === 'room_profile_update') return await updateProfile(event)
      if (action === 'room_mutate') return await mutateRoom(event)
      if (action === 'room_manage') return await manageRoom(event)
      throw new LedgerError('unknown_action')
    } catch (error) {
      if (error instanceof LedgerError) {
        const response = { ok: false, error: error.code, ...error.details }
        if (error.code === 'revision_conflict' && typeof event.roomId === 'string') {
          try {
            const latest = await readAuthorizedSnapshot(event.roomId)
            response.currentRevision = latest.room.revision
            response.snapshot = latest
          } catch (_snapshotError) {
            // Keep the explicit conflict result when a highly active room changes
            // again before a stable, authorized snapshot can be read.
          }
        }
        return response
      }
      console.error('[ledger] internal error', {
        action: typeof event.action === 'string' ? event.action : 'unknown',
        appid: appid || 'unknown',
        error: String(error && error.message ? error.message : error),
      })
      return { ok: false, error: 'internal_error' }
    }
  }

  return { execute }
}

module.exports = {
  CURRENCIES,
  LIMITS,
  LedgerError,
  createLedgerService,
  normalizeState,
}
