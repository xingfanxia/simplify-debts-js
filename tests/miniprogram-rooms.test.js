import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { debtStateToRoomState, formatMinorMoney, parseAmountMinor, parseRoomSnapshot, reconcileExpenseDraft, saveRoomCache } from '../miniprogram/lib/rooms.js'

const require = createRequire(import.meta.url)
const { LIMITS, createLedgerService } = require('../cloudfunctions/ledger/service.js')
const { purgeCollection } = require('../cloudfunctions/ledger_cleanup/cleanup.js')
const { RETENTION_DAYS, isInteractiveInvocation, purgeCutoff, shouldPurgeRoom } = require('../cloudfunctions/ledger_cleanup/policy.js')

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function createMemoryRepository() {
  let stores = {
    rooms: new Map(),
    members: new Map(),
    participants: new Map(),
    expenses: new Map(),
    invites: new Map(),
    mutations: new Map(),
  }
  let tail = Promise.resolve()

  const cloneStores = (source) => Object.fromEntries(Object.entries(source).map(([name, store]) => [
    name,
    new Map([...store].map(([key, value]) => [key, clone(value)])),
  ]))
  const indexNames = { members: 'memberDocIds', participants: 'participantDocIds', expenses: 'expenseDocIds', invites: 'inviteIds' }
  const list = (draft, name, roomId) => {
    const room = draft.rooms.get(roomId)
    const ids = room && Array.isArray(room[indexNames[name]]) ? room[indexNames[name]] : []
    return ids.map((documentId) => draft[name].get(documentId)).filter(Boolean).map(clone)
  }
  const get = (draft, name, documentId) => clone(draft[name].get(documentId) || null)
  const put = (draft, name, document) => draft[name].set(document._id, clone(document))

  return {
    runTransaction(work) {
      const run = tail.then(async () => {
        const draft = cloneStores(stores)
        const tx = {
          getRoom: (id) => get(draft, 'rooms', id),
          putRoom: (document) => put(draft, 'rooms', document),
          getMember: (id) => get(draft, 'members', id),
          listMembers: (roomId) => list(draft, 'members', roomId),
          putMember: (document) => put(draft, 'members', document),
          listParticipants: (roomId) => list(draft, 'participants', roomId),
          putParticipant: (document) => put(draft, 'participants', document),
          getExpense: (id) => get(draft, 'expenses', id),
          listExpenses: (roomId) => list(draft, 'expenses', roomId),
          putExpense: (document) => put(draft, 'expenses', document),
          getInvite: (id) => get(draft, 'invites', id),
          listInvites: (roomId) => list(draft, 'invites', roomId),
          putInvite: (document) => put(draft, 'invites', document),
          getMutation: (id) => get(draft, 'mutations', id),
          putMutation: (document) => put(draft, 'mutations', document),
        }
        const result = await work(tx)
        stores = draft
        return clone(result)
      })
      tail = run.catch(() => {})
      return run
    },
    runRead(work) {
      const tx = {
        getRoom: (id) => get(stores, 'rooms', id),
        getMember: (id) => get(stores, 'members', id),
        listMembers: (roomId) => list(stores, 'members', roomId),
        listParticipants: (roomId) => list(stores, 'participants', roomId),
        listExpenses: (roomId) => list(stores, 'expenses', roomId),
        getInvite: (id) => get(stores, 'invites', id),
        listInvites: (roomId) => list(stores, 'invites', roomId),
      }
      return work(tx)
    },
    dump(name) {
      return [...stores[name].values()].map(clone)
    },
  }
}

function tokenFactory() {
  let counter = 0
  return (bytes = 24) => {
    counter += 1
    return `${String(bytes).padStart(2, '0')}_${String(counter).padStart(6, '0')}_${'x'.repeat(48)}`
  }
}

function sampleState() {
  return {
    participants: [
      { id: 'xiao', name: '小夏' },
      { id: 'hao', name: '小浩' },
      { id: 'ax', name: '阿新' },
    ],
    expenses: [
      { id: 'parking', description: '停车', paidBy: 'hao', amountMinor: 8100, splitWith: ['xiao', 'hao', 'ax'] },
    ],
    currency: 'CNY',
    roundToWhole: false,
  }
}

describe('共享账单编辑草稿收敛', () => {
  const snapshot = {
    participants: [
      { participantId: 'p-1', name: '小夏' },
      { participantId: 'p-2', name: '小浩' },
    ],
    expenses: [{ expenseId: 'expense-active' }],
  }

  it('其他成员删除正在编辑的支出后取消过期编辑', () => {
    expect(reconcileExpenseDraft(snapshot, 'expense-deleted', {
      description: '过期草稿', amount: '12.00', paidBy: 'p-1', splitMode: 'custom', selectedIds: ['p-1'],
    })).toEqual({
      editingExpenseId: '',
      discardedEdit: true,
      form: { description: '', amount: '', paidBy: '', splitMode: 'everyone', selectedIds: [] },
    })
  })

  it('成员变化后保留输入但移除无效付款人和分摊人', () => {
    expect(reconcileExpenseDraft(snapshot, '', {
      description: '晚餐', amount: '88.00', paidBy: 'p-removed', splitMode: 'custom',
      selectedIds: ['p-2', 'p-removed', 'p-2'],
    })).toEqual({
      editingExpenseId: '',
      discardedEdit: false,
      form: {
        description: '晚餐', amount: '88.00', paidBy: 'p-1', splitMode: 'custom', selectedIds: ['p-2'],
      },
    })
  })
})

function inviteToken(result) {
  return decodeURIComponent(result.sharePath.split('invite=')[1])
}

async function fixture() {
  const repository = createMemoryRepository()
  const makeToken = tokenFactory()
  let clock = Date.parse('2026-08-15T08:00:00.000Z')
  const service = (openid) => createLedgerService({
    repository,
    openid,
    appid: 'wx-test',
    makeToken,
    now: () => new Date(clock),
  })
  const owner = service('owner-openid')
  const created = await owner.execute({
    action: 'room_create',
    mutationId: 'create-room-0001',
    title: '周末旅行',
    displayName: '小浩',
    ownerParticipantId: 'hao',
    state: sampleState(),
  })
  return {
    repository,
    owner,
    service,
    created,
    advance: (milliseconds) => { clock += milliseconds },
  }
}

function createInvite(owner, snapshot, suffix = '0001', overrides = {}) {
  return owner.execute({
    action: 'room_invite',
    roomId: snapshot.room.roomId,
    baseRevision: snapshot.room.revision,
    mutationId: `invite-room-${suffix}`,
    ...overrides,
  })
}

describe('微信共享分账房间信任边界', () => {
  it('实体上限为最重写入事务保留 CloudBase 操作余量', () => {
    // 新增支出的最重成功路径：3 个鉴权/幂等读取、全部参与人、
    // 59 个现有支出、一次碰撞读取，以及支出/房间/幂等 3 个写入。
    expect(LIMITS.participants + LIMITS.expenses + 6).toBeLessThanOrEqual(100)
  })

  it('创建时重新生成实体 ID，并且响应不泄露 OpenID', async () => {
    const { created, repository } = await fixture()
    expect(created.ok).toBe(true)
    expect(created.snapshot.room.title).toBe('周末旅行')
    expect(created.snapshot.participants).toHaveLength(3)
    expect(created.snapshot.participants.some(({ participantId }) => participantId === 'hao')).toBe(false)
    expect(JSON.stringify(created)).not.toMatch(/owner-openid|openid/i)
    expect(repository.dump('members').every((member) => !Object.hasOwn(member, 'openid'))).toBe(true)
  })

  it('创建房间在响应丢失后使用同一 mutationId 重试不会重复建房', async () => {
    const repository = createMemoryRepository()
    const service = createLedgerService({ repository, openid: 'owner-openid', makeToken: tokenFactory() })
    const request = {
      action: 'room_create', mutationId: 'stable-create-0001', title: '同一笔账', displayName: '房主',
      ownerParticipantId: 'hao', state: sampleState(),
    }
    const first = await service.execute(request)
    const replay = await service.execute(request)
    expect(first.ok).toBe(true)
    expect(replay).toMatchObject({ ok: true, replayed: true })
    expect(replay.snapshot.room.roomId).toBe(first.snapshot.room.roomId)
  })

  it('非成员即使伪造角色、memberId 或 roomId 也无法读账单', async () => {
    const { created, service } = await fixture()
    const outsider = await service('outsider-openid').execute({
      action: 'room_get',
      roomId: created.snapshot.room.roomId,
      role: 'owner',
      memberId: created.snapshot.self.memberId,
      openid: 'owner-openid',
    })
    expect(outsider).toEqual({ ok: false, error: 'not_member' })
    expect(await service('outsider-openid').execute({
      action: 'room_mutate', roomId: created.snapshot.room.roomId, baseRevision: 1,
      mutationId: 'outsider-write-0001', kind: 'rename_participant',
      payload: { participantId: created.snapshot.participants[0].participantId, name: '越权' },
      role: 'owner', owner: true, openid: 'owner-openid',
    })).toEqual({ ok: false, error: 'not_member' })
  })

  it('轮询携带当前 revision 时返回轻量未变化结果', async () => {
    const { owner, created } = await fixture()
    expect(await owner.execute({
      action: 'room_get', roomId: created.snapshot.room.roomId, knownRevision: created.snapshot.room.revision,
    })).toEqual({ ok: true, unchanged: true, revision: created.snapshot.room.revision })
  })

  it('邀请预览只返回最小信息，加入后才能看到支出', async () => {
    const { owner, created, service, repository } = await fixture()
    const invitation = await createInvite(owner, created.snapshot)
    const token = inviteToken(invitation)
    const guest = service('guest-openid')
    const preview = await guest.execute({ action: 'room_join_preview', invite: token })
    expect(preview.ok).toBe(true)
    expect(preview.preview.title).toBe('周末旅行')
    expect(preview.preview).not.toHaveProperty('expenses')
    expect(preview.preview).not.toHaveProperty('roomId')
    expect(JSON.stringify(preview)).not.toContain(token)
    const ownerSnapshot = await owner.execute({ action: 'room_get', roomId: created.snapshot.room.roomId })
    expect(ownerSnapshot.snapshot.invites).toHaveLength(1)
    expect(ownerSnapshot.snapshot.invites[0].inviteId).toBe(invitation.inviteId)
    expect(JSON.stringify(ownerSnapshot)).not.toContain(token)

    const participantId = preview.preview.claimableParticipants[0].participantId
    const joined = await guest.execute({
      action: 'room_join',
      invite: token,
      displayName: '小夏',
      claimParticipantId: participantId,
    })
    expect(joined.ok).toBe(true)
    expect(joined.snapshot.expenses).toHaveLength(1)
    expect(JSON.stringify(joined)).not.toMatch(/guest-openid|owner-openid|openid/i)
    expect(repository.dump('members').every((member) => !Object.hasOwn(member, 'openid'))).toBe(true)
  })

  it('过期和撤销的邀请都无法再加入', async () => {
    const first = await fixture()
    const invitation = await createInvite(first.owner, first.created.snapshot, 'expiry', { ttlDays: 1 })
    first.advance(25 * 60 * 60 * 1000)
    expect(await first.service('late-openid').execute({ action: 'room_join_preview', invite: inviteToken(invitation) }))
      .toEqual({ ok: false, error: 'invite_expired' })

    const second = await fixture()
    const secondInvite = await createInvite(second.owner, second.created.snapshot, 'revoke')
    const revoked = await second.owner.execute({
      action: 'room_manage',
      roomId: second.created.snapshot.room.roomId,
      baseRevision: secondInvite.revision,
      mutationId: 'revoke-invite-0001',
      kind: 'revoke_invite',
      payload: { inviteId: secondInvite.inviteId },
    })
    expect(revoked.ok).toBe(true)
    expect(await second.service('guest-openid').execute({ action: 'room_join_preview', invite: inviteToken(secondInvite) }))
      .toEqual({ ok: false, error: 'invite_invalid' })
  })

  it('邀请令牌由服务端生成且同一 mutationId 重试返回同一链接', async () => {
    const { owner, created } = await fixture()
    const request = {
      action: 'room_invite', roomId: created.snapshot.room.roomId, baseRevision: 1,
      mutationId: 'invite-stable-0001', token: 'a'.repeat(32),
    }
    const first = await owner.execute(request)
    const replay = await owner.execute(request)
    const token = inviteToken(first)
    expect(token).toMatch(/^[a-f0-9]{64}$/)
    expect(token).not.toBe('a'.repeat(32))
    expect(first.inviteId).not.toBe(token)
    expect(replay).toMatchObject({ ok: true, replayed: true, sharePath: first.sharePath, inviteId: first.inviteId })
  })

  it('加入必须认领已有参与人或新增自己，达到次数上限后邀请失效', async () => {
    const { owner, created, service } = await fixture()
    const invitation = await createInvite(owner, created.snapshot, 'single-use', { maxUses: 1 })
    const token = inviteToken(invitation)
    expect(await service('empty-identity').execute({ action: 'room_join', invite: token, displayName: '访客' }))
      .toEqual({ ok: false, error: 'invalid_join_choice' })
    const preview = await service('guest-one').execute({ action: 'room_join_preview', invite: token })
    await service('guest-one').execute({
      action: 'room_join', invite: token, displayName: '访客一',
      claimParticipantId: preview.preview.claimableParticipants[0].participantId,
    })
    expect(await service('guest-two').execute({ action: 'room_join_preview', invite: token }))
      .toEqual({ ok: false, error: 'invite_exhausted' })
  })

  it('移除成员后立即拒绝其读取和写入', async () => {
    const { owner, created, service } = await fixture()
    const invitation = await createInvite(owner, created.snapshot, 'remove-member')
    const guest = service('guest-openid')
    const joined = await guest.execute({ action: 'room_join', invite: inviteToken(invitation), displayName: '朋友', newParticipantName: '朋友' })
    const removed = await owner.execute({
      action: 'room_manage',
      roomId: created.snapshot.room.roomId,
      baseRevision: joined.snapshot.room.revision,
      mutationId: 'remove-member-0001',
      kind: 'remove_member',
      payload: { memberId: joined.snapshot.self.memberId },
    })
    expect(removed.ok).toBe(true)
    expect(await guest.execute({ action: 'room_get', roomId: created.snapshot.room.roomId }))
      .toEqual({ ok: false, error: 'membership_revoked' })
    expect(await guest.execute({
      action: 'room_mutate', roomId: created.snapshot.room.roomId, baseRevision: removed.revision,
      mutationId: 'removed-write-0001', kind: 'set_rounding', payload: { roundToWhole: true },
    })).toEqual({ ok: false, error: 'membership_revoked' })
    expect(await guest.execute({
      action: 'room_join', invite: inviteToken(invitation), displayName: '朋友',
      claimParticipantId: joined.snapshot.self.participantId,
    })).toEqual({ ok: false, error: 'new_invite_required' })
    const freshInvite = await createInvite(owner, { room: { ...created.snapshot.room, revision: removed.revision } }, 'after-removal')
    const reauthorized = await guest.execute({
      action: 'room_join', invite: inviteToken(freshInvite), displayName: '朋友',
      claimParticipantId: joined.snapshot.self.participantId,
    })
    expect(reauthorized).toMatchObject({ ok: true, alreadyJoined: false })
  })

  it('主动退出后旧邀请不能复用，但可以通过房主新邀请重新加入', async () => {
    const { owner, created, service } = await fixture()
    const firstInvite = await createInvite(owner, created.snapshot, 'before-leave')
    const guest = service('leaving-openid')
    const joined = await guest.execute({ action: 'room_join', invite: inviteToken(firstInvite), displayName: '会回来', newParticipantName: '会回来' })
    const participantId = joined.snapshot.self.participantId
    const left = await guest.execute({
      action: 'room_manage', roomId: created.snapshot.room.roomId, baseRevision: joined.snapshot.room.revision,
      mutationId: 'leave-room-000001', kind: 'leave_room', payload: {},
    })
    expect(left.ok).toBe(true)
    expect(await guest.execute({
      action: 'room_join', invite: inviteToken(firstInvite), displayName: '会回来', claimParticipantId: participantId,
    })).toEqual({ ok: false, error: 'new_invite_required' })
    const freshInvite = await createInvite(owner, { room: { ...created.snapshot.room, revision: left.revision } }, 'after-leave')
    const rejoined = await guest.execute({
      action: 'room_join', invite: inviteToken(freshInvite), displayName: '会回来', claimParticipantId: participantId,
    })
    expect(rejoined).toMatchObject({ ok: true, alreadyJoined: false })
    expect(rejoined.snapshot.self.participantId).toBe(participantId)
  })

  it('普通成员可以共同编辑账单和未认领参与人，但不能伪造房主权限', async () => {
    const { owner, created, service } = await fixture()
    const invitation = await createInvite(owner, created.snapshot, 'editor')
    const guest = service('editor-openid')
    const joined = await guest.execute({ action: 'room_join', invite: inviteToken(invitation), displayName: '编辑者', newParticipantName: '编辑者' })
    const added = await guest.execute({
      action: 'room_mutate', roomId: created.snapshot.room.roomId, baseRevision: joined.snapshot.room.revision,
      mutationId: 'editor-add-person-01', kind: 'add_participant', payload: { name: '临时参与人' },
      role: 'owner', owner: true, openid: 'owner-openid',
    })
    expect(added.ok).toBe(true)
    const removed = await guest.execute({
      action: 'room_mutate', roomId: created.snapshot.room.roomId, baseRevision: added.revision,
      mutationId: 'editor-remove-person-01', kind: 'remove_participant', payload: { participantId: added.entityId },
    })
    expect(removed.ok).toBe(true)
    const participants = joined.snapshot.participants.map(({ participantId }) => participantId)
    const expense = await guest.execute({
      action: 'room_mutate', roomId: created.snapshot.room.roomId, baseRevision: removed.revision,
      mutationId: 'editor-add-expense-01', kind: 'upsert_expense',
      payload: { expense: { description: '成员添加', amountMinor: 1200, paidByParticipantId: participants[0], splitParticipantIds: participants } },
    })
    expect(expense.ok).toBe(true)
    const editedExpense = await guest.execute({
      action: 'room_mutate', roomId: created.snapshot.room.roomId, baseRevision: expense.revision,
      mutationId: 'editor-edit-expense-1', kind: 'upsert_expense',
      payload: { expense: { expenseId: expense.entityId, description: '成员修改', amountMinor: 1350, paidByParticipantId: participants[1], splitParticipantIds: participants } },
    })
    expect(editedExpense).toMatchObject({ ok: true, revision: expense.revision + 1, entityId: expense.entityId })
    const deletedExpense = await guest.execute({
      action: 'room_mutate', roomId: created.snapshot.room.roomId, baseRevision: editedExpense.revision,
      mutationId: 'editor-delete-expense', kind: 'delete_expense', payload: { expenseId: expense.entityId },
    })
    expect(deletedExpense).toMatchObject({ ok: true, revision: editedExpense.revision + 1, entityId: expense.entityId })
    expect(await guest.execute({
      action: 'room_mutate', roomId: created.snapshot.room.roomId, baseRevision: deletedExpense.revision,
      mutationId: 'editor-rename-room-01', kind: 'rename_room', payload: { title: '越权修改' }, role: 'owner', owner: true,
    })).toEqual({ ok: false, error: 'owner_required' })
    expect(await guest.execute({
      action: 'room_manage', roomId: created.snapshot.room.roomId, baseRevision: deletedExpense.revision,
      mutationId: 'editor-archive-room-1', kind: 'archive_room', payload: {}, role: 'owner', owner: true,
    })).toEqual({ ok: false, error: 'owner_required' })
  })

  it('房主归档后成员仍能读取，但任何账单编辑都会被拒绝', async () => {
    const { owner, created } = await fixture()
    const archived = await owner.execute({
      action: 'room_manage', roomId: created.snapshot.room.roomId, baseRevision: 1,
      mutationId: 'archive-room-0001', kind: 'archive_room', payload: {},
    })
    expect(archived).toMatchObject({ ok: true, revision: 2 })
    const readable = await owner.execute({ action: 'room_get', roomId: created.snapshot.room.roomId })
    expect(readable.snapshot.room.status).toBe('archived')
    expect(await owner.execute({
      action: 'room_mutate', roomId: created.snapshot.room.roomId, baseRevision: 2,
      mutationId: 'archived-write-0001', kind: 'set_rounding', payload: { roundToWhole: true },
    })).toEqual({ ok: false, error: 'room_not_active' })
  })

  it('共享房间始终保留至少两位参与人', async () => {
    const { owner, created } = await fixture()
    const unclaimed = created.snapshot.participants.filter(({ claimedByMemberId }) => !claimedByMemberId)
    const cleared = await owner.execute({
      action: 'room_mutate', roomId: created.snapshot.room.roomId, baseRevision: 1,
      mutationId: 'clear-before-remove', kind: 'delete_expense', payload: { expenseId: created.snapshot.expenses[0].expenseId },
    })
    const first = await owner.execute({
      action: 'room_mutate', roomId: created.snapshot.room.roomId, baseRevision: cleared.revision,
      mutationId: 'remove-third-person', kind: 'remove_participant', payload: { participantId: unclaimed[0].participantId },
    })
    expect(first).toMatchObject({ ok: true, revision: 3 })
    expect(await owner.execute({
      action: 'room_mutate', roomId: created.snapshot.room.roomId, baseRevision: first.revision,
      mutationId: 'remove-second-person', kind: 'remove_participant', payload: { participantId: unclaimed[1].participantId },
    })).toEqual({ ok: false, error: 'participant_minimum' })
  })
})

describe('微信共享分账房间并发与幂等', () => {
  it('重复 mutationId 不会重复新增支出', async () => {
    const { owner, created } = await fixture()
    const participants = created.snapshot.participants.map(({ participantId }) => participantId)
    const mutation = {
      action: 'room_mutate',
      roomId: created.snapshot.room.roomId,
      baseRevision: created.snapshot.room.revision,
      mutationId: 'add-expense-0001',
      kind: 'upsert_expense',
      payload: {
        expense: {
          description: '车票',
          amountMinor: 3000,
          paidByParticipantId: participants[0],
          splitParticipantIds: participants,
        },
      },
    }
    const first = await owner.execute(mutation)
    const replay = await owner.execute(mutation)
    const latest = await owner.execute({ action: 'room_get', roomId: created.snapshot.room.roomId })
    expect(first.ok).toBe(true)
    expect(replay).toMatchObject({ ok: true, replayed: true, revision: first.revision, entityId: first.entityId })
    expect(latest.snapshot.expenses).toHaveLength(2)
    expect(await owner.execute({
      ...mutation,
      payload: { ...mutation.payload, expense: { ...mutation.payload.expense, amountMinor: 9999 } },
    })).toEqual({ ok: false, error: 'mutation_mismatch' })
  })

  it('相同 baseRevision 的并发写入不会静默覆盖', async () => {
    const { owner, created } = await fixture()
    const first = await owner.execute({
      action: 'room_mutate', roomId: created.snapshot.room.roomId, baseRevision: 1,
      mutationId: 'rename-room-0001', kind: 'rename_room', payload: { title: '第一次修改' },
    })
    const second = await owner.execute({
      action: 'room_mutate', roomId: created.snapshot.room.roomId, baseRevision: 1,
      mutationId: 'rename-room-0002', kind: 'rename_room', payload: { title: '第二次修改' },
    })
    expect(first).toMatchObject({ ok: true, revision: 2 })
    expect(second).toMatchObject({
      ok: false,
      error: 'revision_conflict',
      currentRevision: 2,
      snapshot: { room: { revision: 2, title: '第一次修改' } },
    })
    expect(JSON.stringify(second)).not.toMatch(/owner-openid|openid/i)
  })

  it('旧页面不能通过编辑复活已经删除的支出', async () => {
    const { owner, created } = await fixture()
    const expense = created.snapshot.expenses[0]
    const deleted = await owner.execute({
      action: 'room_mutate', roomId: created.snapshot.room.roomId, baseRevision: 1,
      mutationId: 'delete-stale-expense', kind: 'delete_expense', payload: { expenseId: expense.expenseId },
    })
    expect(deleted).toMatchObject({ ok: true, revision: 2 })
    expect(await owner.execute({
      action: 'room_mutate', roomId: created.snapshot.room.roomId, baseRevision: 2,
      mutationId: 'revive-stale-expense', kind: 'upsert_expense',
      payload: { expense: { ...expense, description: '旧页面修改' } },
    })).toEqual({ ok: false, error: 'expense_not_found' })
    const latest = await owner.execute({ action: 'room_get', roomId: created.snapshot.room.roomId })
    expect(latest.snapshot.expenses).toHaveLength(0)
    expect(latest.snapshot.room.revision).toBe(2)
  })

  it('删除房间的响应丢失后重试仍返回幂等成功', async () => {
    const { owner, created } = await fixture()
    const request = {
      action: 'room_manage', roomId: created.snapshot.room.roomId, baseRevision: 1,
      mutationId: 'delete-room-retry-01', kind: 'delete_room', payload: {},
    }
    const first = await owner.execute(request)
    const replay = await owner.execute(request)
    expect(first).toMatchObject({ ok: true, revision: 2 })
    expect(replay).toMatchObject({ ok: true, revision: 2, replayed: true })
    expect(await owner.execute({ action: 'room_get', roomId: created.snapshot.room.roomId }))
      .toEqual({ ok: false, error: 'room_not_found' })
  })

  it('拒绝非法金额、未知参与人和超长输入', async () => {
    const { owner, created } = await fixture()
    const base = {
      action: 'room_mutate', roomId: created.snapshot.room.roomId, baseRevision: 1,
      mutationId: 'invalid-expense-01', kind: 'upsert_expense',
    }
    expect(await owner.execute({
      ...base,
      payload: { expense: { description: '坏账', amountMinor: -1, paidByParticipantId: 'missing', splitParticipantIds: ['missing'] } },
    })).toEqual({ ok: false, error: 'invalid_amount' })

    expect(await owner.execute({
      ...base,
      mutationId: 'invalid-expense-02',
      payload: { expense: { description: 'x'.repeat(61), amountMinor: 100, paidByParticipantId: 'missing', splitParticipantIds: ['missing'] } },
    })).toEqual({ ok: false, error: 'invalid_expense' })
  })

  it('拒绝非法币种、超大数组和重复分摊人', async () => {
    const first = await fixture()
    expect(await first.owner.execute({
      action: 'room_create', mutationId: 'invalid-currency-01', title: '坏币种', displayName: '房主',
      state: { ...sampleState(), currency: 'BTC' },
    })).toEqual({ ok: false, error: 'invalid_currency' })
    expect(await first.owner.execute({
      action: 'room_create', mutationId: 'too-many-people-01', title: '太多人', displayName: '房主',
      state: {
        ...sampleState(), expenses: [],
        participants: Array.from({ length: 31 }, (_, index) => ({ id: `p-${index}`, name: `成员${index}` })),
      },
    })).toEqual({ ok: false, error: 'invalid_participants' })
    expect(await first.owner.execute({
      action: 'room_create', mutationId: 'too-many-expenses-1', title: '太多支出', displayName: '房主',
      state: {
        ...sampleState(),
        expenses: Array.from({ length: 61 }, (_, index) => ({
          id: `expense-${index}`, description: `支出${index}`, paidBy: 'hao', amountMinor: 100, splitWith: ['xiao', 'hao', 'ax'],
        })),
      },
    })).toEqual({ ok: false, error: 'invalid_expenses' })
    const participant = first.created.snapshot.participants[0].participantId
    expect(await first.owner.execute({
      action: 'room_mutate', roomId: first.created.snapshot.room.roomId, baseRevision: 1,
      mutationId: 'duplicate-split-001', kind: 'upsert_expense',
      payload: { expense: { description: '重复', amountMinor: 100, paidByParticipantId: participant, splitParticipantIds: [participant, participant] } },
    })).toEqual({ ok: false, error: 'invalid_expense_participant' })
  })

  it('共享房间只允许在相同最小单位精度的币种间切换', async () => {
    const { owner, created } = await fixture()
    const samePrecision = await owner.execute({
      action: 'room_mutate', roomId: created.snapshot.room.roomId, baseRevision: 1,
      mutationId: 'currency-cny-usd-01', kind: 'set_currency', payload: { currency: 'USD' },
    })
    expect(samePrecision).toMatchObject({ ok: true, revision: 2 })
    expect(await owner.execute({
      action: 'room_mutate', roomId: created.snapshot.room.roomId, baseRevision: 2,
      mutationId: 'currency-usd-jpy-01', kind: 'set_currency', payload: { currency: 'JPY' },
    })).toEqual({ ok: false, error: 'currency_precision_change' })

    const repository = createMemoryRepository()
    const emptyOwner = createLedgerService({ repository, openid: 'empty-owner', makeToken: tokenFactory() })
    const empty = await emptyOwner.execute({
      action: 'room_create', mutationId: 'empty-room-create-01', title: '空账单', displayName: '房主',
      state: { ...sampleState(), expenses: [] },
    })
    expect(await emptyOwner.execute({
      action: 'room_mutate', roomId: empty.snapshot.room.roomId, baseRevision: 1,
      mutationId: 'currency-empty-jpy-1', kind: 'set_currency', payload: { currency: 'JPY' },
    })).toMatchObject({ ok: true, revision: 2 })
  })
})

describe('共享房间客户端边界', () => {
  it('按币种最小单位解析金额并转换本地账单', () => {
    expect(parseAmountMinor('12.34', 'CNY')).toBe(1234)
    expect(parseAmountMinor('12.345', 'CNY')).toBeNull()
    expect(parseAmountMinor('1200', 'JPY')).toBe(1200)
    expect(parseAmountMinor('1200.5', 'JPY')).toBeNull()
    const state = debtStateToRoomState({
      participants: [{ id: 'a', name: '甲' }, { id: 'b', name: '乙' }],
      expenses: [{ id: 'e', description: '车票', paidBy: 'a', amountCents: 120000, splitWith: ['a', 'b'] }],
      currency: 'JPY', roundToWhole: false,
    })
    expect(state.expenses[0].amountMinor).toBe(1200)
    expect(formatMinorMoney(12345, 'CNY')).toBe('¥123.45')
    expect(formatMinorMoney(1200, 'JPY')).toBe('¥1,200')
  })

  it('拒绝引用未知参与人的云端快照', async () => {
    const { created } = await fixture()
    const tampered = structuredClone(created.snapshot)
    tampered.expenses[0].paidByParticipantId = 'unknown-person'
    expect(parseRoomSnapshot(tampered)).toBeNull()
  })

  it('客户端只调用 ledger 云函数，不直接读写原始集合', () => {
    const clientSource = readFileSync(new URL('../miniprogram/lib/rooms.js', import.meta.url), 'utf8')
    const pageSource = readFileSync(new URL('../miniprogram/pages/room/room.js', import.meta.url), 'utf8')
    const roomTemplate = readFileSync(new URL('../miniprogram/pages/room/room.wxml', import.meta.url), 'utf8')
    const indexSource = readFileSync(new URL('../miniprogram/pages/index/index.js', import.meta.url), 'utf8')
    expect(clientSource).toMatch(/callFunction\(\{ name: 'ledger'/)
    expect(clientSource).not.toMatch(/\.database\s*\(/)
    expect(pageSource).not.toMatch(/\.database\s*\(/)
    expect(pageSource).not.toMatch(/console\.(?:log|error).*invite/i)
    expect(pageSource).toMatch(/pendingMutationId/)
    expect(pageSource).toMatch(/async manage[\s\S]+?syncClass === 'offline'/)
    expect(roomTemplate).toMatch(/class="room-controls" wx:if="\{\{syncClass !== 'offline'\}\}"/)
    expect(indexSource).toMatch(/pendingRoomCreate/)
  })

  it('云环境开关控制初始化与共享入口，本地模式不主动联网', () => {
    const configSource = readFileSync(new URL('../miniprogram/config/cloud.js', import.meta.url), 'utf8')
    const appSource = readFileSync(new URL('../miniprogram/app.js', import.meta.url), 'utf8')
    const indexTemplate = readFileSync(new URL('../miniprogram/pages/index/index.wxml', import.meta.url), 'utf8')
    expect(configSource).toMatch(/SHARED_ROOMS_ENABLED\s*=\s*Boolean\(CLOUD_ENV_ID\)/)
    expect(appSource).toMatch(/if \(CLOUD_ENV_ID && wx\.cloud\)/)
    expect(indexTemplate).toMatch(/wx:if="\{\{sharedRoomsEnabled && hasExpenses\}\}"/)
  })

  it('本地缓存只保存脱敏快照，不保存邀请链接或令牌', async () => {
    const { created } = await fixture()
    const writes = []
    const previousWx = globalThis.wx
    globalThis.wx = {
      getStorageSync: () => [],
      setStorageSync: (key, value) => writes.push({ key, value }),
    }
    try {
      saveRoomCache(created.snapshot)
    } finally {
      globalThis.wx = previousWx
    }
    const serialized = JSON.stringify(writes)
    expect(serialized).not.toMatch(/sharePath|inviteToken|[?&]invite=/i)
    expect(serialized).not.toMatch(/openid/i)
  })

  it('云事务适配器不使用 where 查询', () => {
    const repositorySource = readFileSync(new URL('../cloudfunctions/ledger/repository.js', import.meta.url), 'utf8')
    const transactionAdapterSource = repositorySource.split('function transactionAdapter')[1].split('function readAdapter')[0]
    expect(transactionAdapterSource).not.toMatch(/\.where\s*\(/)
    expect(transactionAdapterSource).toMatch(/listDocumentsById/)
  })
})

function createCleanupDatabase(documentCount) {
  const remaining = new Set(Array.from({ length: documentCount }, (_, index) => `document-${index}`))
  return {
    remaining,
    database: {
      collection() {
        return {
          where() {
            return {
              limit(limit) {
                return {
                  async get() {
                    return { data: [...remaining].slice(0, limit).map((_id) => ({ _id })) }
                  },
                }
              },
            }
          },
          doc(documentId) {
            return { async remove() { remaining.delete(documentId) } }
          },
        }
      },
    },
  }
}

describe('共享账单删除保留期', () => {
  it('只清理已经软删除满 30 天的房间', () => {
    const now = new Date('2026-08-15T00:00:00.000Z')
    expect(RETENTION_DAYS).toBe(30)
    expect(purgeCutoff(now)).toBe('2026-07-16T00:00:00.000Z')
    expect(shouldPurgeRoom({ status: 'deleted', deletedAt: '2026-07-15T23:59:59.000Z' }, now)).toBe(true)
    expect(shouldPurgeRoom({ status: 'deleted', deletedAt: '2026-07-17T00:00:00.000Z' }, now)).toBe(false)
    expect(shouldPurgeRoom({ status: 'active', deletedAt: '2026-01-01T00:00:00.000Z' }, now)).toBe(false)
  })

  it('定时清理函数拒绝带微信用户身份的交互式调用', () => {
    expect(isInteractiveInvocation({ OPENID: 'user-openid' })).toBe(true)
    expect(isInteractiveInvocation({})).toBe(false)
    expect(isInteractiveInvocation(null)).toBe(false)
  })

  it('分批并发清理依赖文档，并在超过单次上限时保留房间墓碑', async () => {
    const ordinary = createCleanupDatabase(230)
    expect(await purgeCollection(ordinary.database, 'ledger_expenses', 'room-1')).toBe(true)
    expect(ordinary.remaining.size).toBe(0)

    const oversized = createCleanupDatabase(501)
    expect(await purgeCollection(oversized.database, 'ledger_mutations', 'room-2')).toBe(false)
    expect(oversized.remaining.size).toBe(1)
  })

  it('仓库携带每日七段 cron 清理触发器配置', () => {
    const config = JSON.parse(readFileSync(new URL('../cloudfunctions/ledger_cleanup/config.json', import.meta.url), 'utf8'))
    expect(config.triggers).toEqual([{ name: 'dailyLedgerRetention', type: 'timer', config: '0 20 3 * * * *' }])
  })
})
