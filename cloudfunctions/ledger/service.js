const crypto = require('node:crypto')

const CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CNY', 'JPY', 'KRW', 'MXN', 'BRL', 'TWD', 'HKD', 'INR'])
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
    const normalizedName = name.toLocaleLowerCase()
    assert(!participantIds.has(id) && !participantNames.has(normalizedName), 'duplicate_participant')
    participantIds.add(id)
    participantNames.add(normalizedName)
    return { id, name }
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
    assert(Number.isSafeInteger(expense.amountCents) && expense.amountCents > 0 && expense.amountCents <= LIMITS.amountMinor, 'invalid_amount')
    const splitWith = uniqueStrings(expense.splitWith, LIMITS.participants, 'invalid_expense_participant')
    assert(splitWith.every((participantId) => participantIds.has(participantId)), 'invalid_expense_participant')
    return { id, description, paidBy, amountCents: expense.amountCents, splitWith }
  })

  return {
    participants,
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

function memberAuthId(hash, roomId, openid) {
  return hash(`member-auth:${roomId}:${openid}`)
}

function entityDocId(hash, kind, roomId, entityId) {
  return hash(`${kind}:${roomId}:${entityId}`)
}

function mutationDocId(hash, roomId, memberId, mutationId) {
  return hash(`mutation:${roomId}:${memberId}:${mutationId}`)
}

function active(document) {
  return Boolean(document) && !document.revokedAt && !document.deletedAt
}

function sortByCreated(left, right) {
  return String(left.createdAt || '').localeCompare(String(right.createdAt || ''))
}

function createLedgerService({ repository, openid, appid = '', now = () => new Date(), makeToken = defaultToken, hash = defaultHash }) {
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
    const visibleMembers = members.filter(active).sort(sortByCreated).map((member) => ({
      memberId: member.memberId,
      displayName: member.displayName,
      role: member.role,
      participantId: member.participantId || '',
      joinedAt: member.joinedAt,
      isSelf: member.memberId === self.memberId,
    }))
    const visibleParticipants = participants.filter(active).sort(sortByCreated).map((participant) => ({
      participantId: participant.participantId,
      name: participant.name,
      claimedByMemberId: participant.claimedByMemberId || '',
    }))
    const visibleExpenses = expenses.filter(active).sort(sortByCreated).map((expense) => ({
      expenseId: expense.expenseId,
      description: expense.description,
      amountCents: expense.amountCents,
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
    const state = normalizeState(event.state)
    const title = cleanString(event.title || '共享账单', LIMITS.title, 'invalid_title')
    const requestedDisplayName = cleanString(event.displayName || '我', LIMITS.displayName, 'invalid_display_name')
    const ownerSourceParticipantId = event.ownerParticipantId ? cleanString(event.ownerParticipantId, 96, 'invalid_participant') : ''
    const sourceIds = new Set(state.participants.map(({ id: sourceId }) => sourceId))
    assert(!ownerSourceParticipantId || sourceIds.has(ownerSourceParticipantId), 'invalid_participant')

    const created = await repository.runTransaction(async (tx) => {
      const createdAt = timestamp()
      const roomId = id('room', 18)
      const ownerMemberId = id('member')
      const idMap = new Map(state.participants.map((participant) => [participant.id, id('person')]))
      const ownerParticipantId = ownerSourceParticipantId ? idMap.get(ownerSourceParticipantId) : ''
      const participantDocuments = state.participants.map((source) => {
        const participantId = idMap.get(source.id)
        return {
          _id: entityDocId(hash, 'participant', roomId, participantId),
          roomId,
          participantId,
          name: source.name,
          claimedByMemberId: participantId === ownerParticipantId ? ownerMemberId : null,
          createdAt,
          deletedAt: null,
        }
      })
      const expenseDocuments = state.expenses.map((source) => {
        const expenseId = id('expense')
        return {
          _id: entityDocId(hash, 'expense', roomId, expenseId),
          roomId,
          expenseId,
          description: source.description,
          amountCents: source.amountCents,
          paidByParticipantId: idMap.get(source.paidBy),
          splitParticipantIds: source.splitWith.map((participantId) => idMap.get(participantId)),
          createdByMemberId: ownerMemberId,
          createdAt,
          updatedAt: createdAt,
          deletedAt: null,
        }
      })
      const room = {
        _id: roomId,
        title,
        currency: state.currency,
        roundToWhole: state.roundToWhole,
        ownerMemberId,
        revision: 1,
        status: 'active',
        createdAt,
        updatedAt: createdAt,
        deletedAt: null,
        memberDocIds: [memberAuthId(hash, roomId, openid)],
        participantDocIds: participantDocuments.map(({ _id }) => _id),
        expenseDocIds: expenseDocuments.map(({ _id }) => _id),
        inviteIds: [],
      }
      const owner = {
        _id: memberAuthId(hash, roomId, openid),
        roomId,
        memberId: ownerMemberId,
        openid,
        displayName: requestedDisplayName,
        role: 'owner',
        participantId: ownerParticipantId || null,
        joinedAt: createdAt,
        revokedAt: null,
      }
      await tx.putRoom(room)
      await tx.putMember(owner)
      for (const participant of participantDocuments) await tx.putParticipant(participant)
      for (const expense of expenseDocuments) await tx.putExpense(expense)
      return { roomId }
    })
    return { ok: true, snapshot: await readAuthorizedSnapshot(created.roomId) }
  }

  function assertInviteUsable(invite, currentTime) {
    assert(invite && !invite.revokedAt, 'invite_invalid')
    assert(Date.parse(invite.expiresAt) > Date.parse(currentTime), 'invite_expired')
    assert(invite.usedCount < invite.maxUses, 'invite_exhausted')
  }

  async function createInvite(event) {
    const roomId = cleanString(event.roomId, 80, 'invalid_room')
    const ttlDays = Number.isSafeInteger(event.ttlDays) ? event.ttlDays : 7
    const maxUses = Number.isSafeInteger(event.maxUses) ? event.maxUses : LIMITS.inviteUses
    assert(ttlDays >= 1 && ttlDays <= 30, 'invalid_invite')
    assert(maxUses >= 1 && maxUses <= LIMITS.inviteUses, 'invalid_invite')
    const token = event.token ? normalizeInviteToken(event.token) : makeToken(32)
    const tokenHash = hash(token)

    return repository.runTransaction(async (tx) => {
      const room = await requireRoom(tx, roomId)
      const member = await requireMember(tx, roomId)
      assert(member.role === 'owner' && room.ownerMemberId === member.memberId, 'owner_required')
      assert(room.status === 'active', 'room_not_active')
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
        expiresAt,
        maxUses,
        usedCount: 0,
        revokedAt: null,
      })
      await tx.putRoom({ ...room, inviteIds: [...activeInviteIds, tokenHash] })
      return {
        ok: true,
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
      assertInviteUsable(invite, currentTime)
      const room = await requireRoom(tx, invite.roomId)
      assert(room.status === 'active', 'room_not_active')
      const allParticipants = (await tx.listParticipants(room._id)).filter(active)
      const participants = allParticipants.filter((participant) => !participant.claimedByMemberId)
      return {
        ok: true,
        preview: {
          title: room.title,
          currency: room.currency,
          participantCount: allParticipants.length,
          claimableParticipants: participants.sort(sortByCreated).map(({ participantId, name }) => ({ participantId, name })),
          expiresAt: invite.expiresAt,
        },
      }
    })
  }

  async function joinRoom(event) {
    const token = normalizeInviteToken(event.invite)
    const displayName = cleanString(event.displayName, LIMITS.displayName, 'invalid_display_name')
    const claimParticipantId = event.claimParticipantId ? cleanString(event.claimParticipantId, 80, 'invalid_participant') : ''
    const newParticipantName = event.newParticipantName ? cleanString(event.newParticipantName, LIMITS.participantName, 'invalid_participant') : ''
    assert(!(claimParticipantId && newParticipantName), 'invalid_join_choice')

    const joined = await repository.runTransaction(async (tx) => {
      const currentTime = timestamp()
      const invite = await tx.getInvite(hash(token))
      assert(invite, 'invite_invalid')
      const room = await requireRoom(tx, invite.roomId)
      const authId = memberAuthId(hash, room._id, openid)
      const existing = await tx.getMember(authId)
      if (existing) {
        assert(!existing.revokedAt, 'membership_revoked')
        return { roomId: room._id, alreadyJoined: true }
      }
      assertInviteUsable(invite, currentTime)
      assert(room.status === 'active', 'room_not_active')
      const members = (await tx.listMembers(room._id)).filter(active)
      assert(members.length < LIMITS.members, 'room_full')
      const participants = (await tx.listParticipants(room._id)).filter(active)
      let participantId = ''
      if (claimParticipantId) {
        const participant = participants.find((item) => item.participantId === claimParticipantId)
        assert(participant && !participant.claimedByMemberId, 'participant_unavailable')
        participantId = participant.participantId
      } else if (newParticipantName) {
        assert(participants.length < LIMITS.participants, 'participant_limit')
        const normalizedName = newParticipantName.toLocaleLowerCase()
        assert(!participants.some(({ name }) => name.toLocaleLowerCase() === normalizedName), 'duplicate_participant')
        participantId = id('person')
      }
      const memberId = id('member')
      const member = {
        _id: authId,
        roomId: room._id,
        memberId,
        openid,
        displayName,
        role: 'editor',
        participantId: participantId || null,
        joinedAt: currentTime,
        revokedAt: null,
      }
      if (claimParticipantId) {
        const participant = participants.find((item) => item.participantId === participantId)
        await tx.putParticipant({ ...participant, claimedByMemberId: memberId })
      } else if (newParticipantName) {
        await tx.putParticipant({
          _id: entityDocId(hash, 'participant', room._id, participantId),
          roomId: room._id,
          participantId,
          name: newParticipantName,
          claimedByMemberId: memberId,
          createdAt: currentTime,
          deletedAt: null,
        })
      }
      await tx.putMember(member)
      await tx.putInvite({ ...invite, usedCount: invite.usedCount + 1 })
      const nextRoom = {
        ...room,
        revision: room.revision + 1,
        updatedAt: currentTime,
        memberDocIds: [...(room.memberDocIds || []), member._id],
        participantDocIds: newParticipantName ? [...(room.participantDocIds || []), entityDocId(hash, 'participant', room._id, participantId)] : (room.participantDocIds || []),
      }
      await tx.putRoom(nextRoom)
      return { roomId: room._id, alreadyJoined: false }
    })
    return { ok: true, alreadyJoined: joined.alreadyJoined, snapshot: await readAuthorizedSnapshot(joined.roomId) }
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

  async function getRoom(event) {
    const roomId = cleanString(event.roomId, 80, 'invalid_room')
    return { ok: true, snapshot: await readAuthorizedSnapshot(roomId) }
  }

  async function applyMutation(tx, room, member, kind, payload, currentTime) {
    const participants = (await tx.listParticipants(room._id)).filter(active)
    const participantIds = new Set(participants.map(({ participantId }) => participantId))
    if (kind === 'upsert_expense') {
      assert(isRecord(payload.expense), 'invalid_expense')
      const incoming = payload.expense
      const description = cleanString(incoming.description, LIMITS.description, 'invalid_expense')
      assert(Number.isSafeInteger(incoming.amountCents) && incoming.amountCents > 0 && incoming.amountCents <= LIMITS.amountMinor, 'invalid_amount')
      const paidByParticipantId = cleanString(incoming.paidByParticipantId, 80, 'invalid_expense_participant')
      const splitParticipantIds = uniqueStrings(incoming.splitParticipantIds, LIMITS.participants, 'invalid_expense_participant')
      assert(participantIds.has(paidByParticipantId) && splitParticipantIds.every((participantId) => participantIds.has(participantId)), 'invalid_expense_participant')
      const expenseId = incoming.expenseId ? cleanString(incoming.expenseId, 80, 'invalid_expense') : id('expense')
      const docId = entityDocId(hash, 'expense', room._id, expenseId)
      const existing = await tx.getExpense(docId)
      if (!existing) {
        const expenses = (await tx.listExpenses(room._id)).filter(active)
        assert(expenses.length < LIMITS.expenses, 'expense_limit')
        room.expenseDocIds = [...(room.expenseDocIds || []), docId]
      }
      await tx.putExpense({
        _id: docId,
        roomId: room._id,
        expenseId,
        description,
        amountCents: incoming.amountCents,
        paidByParticipantId,
        splitParticipantIds,
        createdByMemberId: existing ? existing.createdByMemberId : member.memberId,
        createdAt: existing ? existing.createdAt : currentTime,
        updatedAt: currentTime,
        deletedAt: null,
      })
      return { entityId: expenseId }
    }
    if (kind === 'delete_expense') {
      const expenseId = cleanString(payload.expenseId, 80, 'invalid_expense')
      const existing = await tx.getExpense(entityDocId(hash, 'expense', room._id, expenseId))
      assert(active(existing), 'expense_not_found')
      await tx.putExpense({ ...existing, deletedAt: currentTime, updatedAt: currentTime })
      return { entityId: expenseId }
    }
    if (kind === 'add_participant') {
      assert(participants.length < LIMITS.participants, 'participant_limit')
      const name = cleanString(payload.name, LIMITS.participantName, 'invalid_participant')
      assert(!participants.some((participant) => participant.name.toLocaleLowerCase() === name.toLocaleLowerCase()), 'duplicate_participant')
      const participantId = id('person')
      const participantDocId = entityDocId(hash, 'participant', room._id, participantId)
      await tx.putParticipant({
        _id: participantDocId,
        roomId: room._id,
        participantId,
        name,
        claimedByMemberId: null,
        createdAt: currentTime,
        deletedAt: null,
      })
      room.participantDocIds = [...(room.participantDocIds || []), participantDocId]
      return { entityId: participantId }
    }
    if (kind === 'rename_participant') {
      const participantId = cleanString(payload.participantId, 80, 'invalid_participant')
      const name = cleanString(payload.name, LIMITS.participantName, 'invalid_participant')
      const participant = participants.find((item) => item.participantId === participantId)
      assert(participant, 'participant_not_found')
      assert(!participants.some((item) => item.participantId !== participantId && item.name.toLocaleLowerCase() === name.toLocaleLowerCase()), 'duplicate_participant')
      await tx.putParticipant({ ...participant, name })
      return { entityId: participantId }
    }
    if (kind === 'remove_participant') {
      assert(member.role === 'owner', 'owner_required')
      const participantId = cleanString(payload.participantId, 80, 'invalid_participant')
      const participant = participants.find((item) => item.participantId === participantId)
      assert(participant, 'participant_not_found')
      assert(!participant.claimedByMemberId, 'participant_claimed')
      const expenses = (await tx.listExpenses(room._id)).filter(active)
      assert(!expenses.some((expense) => expense.paidByParticipantId === participantId || expense.splitParticipantIds.includes(participantId)), 'participant_in_use')
      await tx.putParticipant({ ...participant, deletedAt: currentTime })
      return { entityId: participantId }
    }
    if (kind === 'set_rounding') {
      room.roundToWhole = payload.roundToWhole === true
      return {}
    }
    if (kind === 'set_currency') {
      assert(member.role === 'owner', 'owner_required')
      assert(CURRENCIES.has(payload.currency), 'invalid_currency')
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
    return repository.runTransaction(async (tx) => {
      const room = await requireRoom(tx, roomId)
      const member = await requireMember(tx, roomId)
      const mutationIdHash = mutationDocId(hash, roomId, member.memberId, mutationId)
      const replay = await tx.getMutation(mutationIdHash)
      if (replay) return { ok: true, revision: replay.revision, replayed: true, entityId: replay.entityId || '' }
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
    return repository.runTransaction(async (tx) => {
      const room = await requireRoom(tx, roomId)
      const member = await requireMember(tx, roomId)
      const mutationIdHash = mutationDocId(hash, roomId, member.memberId, mutationId)
      const replay = await tx.getMutation(mutationIdHash)
      if (replay) return { ok: true, revision: replay.revision, replayed: true }
      assert(room.revision === baseRevision, 'revision_conflict', { currentRevision: room.revision })
      const currentTime = timestamp()
      if (kind === 'remove_member') {
        assert(member.role === 'owner', 'owner_required')
        const memberId = cleanString(payload.memberId, 80, 'invalid_member')
        assert(memberId !== room.ownerMemberId, 'cannot_remove_owner')
        const members = await tx.listMembers(roomId)
        const target = members.find((item) => item.memberId === memberId && active(item))
        assert(target, 'member_not_found')
        await tx.putMember({ ...target, revokedAt: currentTime })
        if (target.participantId) {
          const participants = await tx.listParticipants(roomId)
          const claimed = participants.find((participant) => participant.participantId === target.participantId && active(participant))
          if (claimed) await tx.putParticipant({ ...claimed, claimedByMemberId: null })
        }
      } else if (kind === 'leave_room') {
        assert(member.role !== 'owner', 'owner_cannot_leave')
        await tx.putMember({ ...member, revokedAt: currentTime })
        if (member.participantId) {
          const participants = await tx.listParticipants(roomId)
          const claimed = participants.find((participant) => participant.participantId === member.participantId && active(participant))
          if (claimed) await tx.putParticipant({ ...claimed, claimedByMemberId: null })
        }
      } else if (kind === 'revoke_invite') {
        assert(member.role === 'owner', 'owner_required')
        const inviteId = cleanString(payload.inviteId, 80, 'invalid_invite')
        const invite = await tx.getInvite(inviteId)
        assert(invite && invite.roomId === roomId && !invite.revokedAt, 'invite_invalid')
        await tx.putInvite({ ...invite, revokedAt: currentTime })
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
      if (action === 'room_mutate') return await mutateRoom(event)
      if (action === 'room_manage') return await manageRoom(event)
      throw new LedgerError('unknown_action')
    } catch (error) {
      if (error instanceof LedgerError) {
        return { ok: false, error: error.code, ...error.details }
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
