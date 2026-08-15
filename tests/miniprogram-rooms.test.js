import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { simplifyDebts } from '../miniprogram/lib/debts.js'
import { debtStateToRoomState, formatMinorMoney, parseAmountMinor, parseRoomSnapshot, reconcileExpenseDraft, saveRoomCache, snapshotToDebtState } from '../miniprogram/lib/rooms.js'

const require = createRequire(import.meta.url)
const { LIMITS, createLedgerService } = require('../cloudfunctions/ledger/service.js')
const { purgeCollection } = require('../cloudfunctions/ledger_cleanup/cleanup.js')
const { RETENTION_DAYS, isInteractiveInvocation, purgeCutoff, shouldPurgeRoom } = require('../cloudfunctions/ledger_cleanup/policy.js')

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function createMemoryRepository() {
  let stores = {
    rooms: new Map(), members: new Map(), participants: new Map(), expenses: new Map(), invites: new Map(), mutations: new Map(),
  }
  let tail = Promise.resolve()
  const cloneStores = (source) => Object.fromEntries(Object.entries(source).map(([name, store]) => [
    name, new Map([...store].map(([key, value]) => [key, clone(value)])),
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
          getRoom: (id) => get(draft, 'rooms', id), putRoom: (document) => put(draft, 'rooms', document),
          getMember: (id) => get(draft, 'members', id), listMembers: (roomId) => list(draft, 'members', roomId), putMember: (document) => put(draft, 'members', document),
          listParticipants: (roomId) => list(draft, 'participants', roomId), putParticipant: (document) => put(draft, 'participants', document),
          getExpense: (id) => get(draft, 'expenses', id), listExpenses: (roomId) => list(draft, 'expenses', roomId), putExpense: (document) => put(draft, 'expenses', document),
          getInvite: (id) => get(draft, 'invites', id), listInvites: (roomId) => list(draft, 'invites', roomId), putInvite: (document) => put(draft, 'invites', document),
          getMutation: (id) => get(draft, 'mutations', id), putMutation: (document) => put(draft, 'mutations', document),
        }
        const result = await work(tx)
        stores = draft
        return clone(result)
      })
      tail = run.catch(() => {})
      return run
    },
    runRead(work) {
      return work({
        getRoom: (id) => get(stores, 'rooms', id), getMember: (id) => get(stores, 'members', id),
        listMembers: (roomId) => list(stores, 'members', roomId), listParticipants: (roomId) => list(stores, 'participants', roomId),
        listExpenses: (roomId) => list(stores, 'expenses', roomId), getInvite: (id) => get(stores, 'invites', id),
        listInvites: (roomId) => list(stores, 'invites', roomId),
      })
    },
    dump(name) { return [...stores[name].values()].map(clone) },
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
    participants: [{ id: 'xiao', name: '小夏' }, { id: 'hao', name: '小浩' }],
    expenses: [{ id: 'parking', description: '停车', paidBy: 'hao', amountMinor: 8100, splitWith: ['xiao', 'hao'] }],
    currency: 'CNY', roundToWhole: false,
  }
}

describe('共享账单编辑草稿收敛', () => {
  const snapshot = {
    participants: [
      { participantId: 'p-1', name: '小夏', memberActive: true },
      { participantId: 'p-2', name: '小浩', memberActive: true },
      { participantId: 'p-old', name: '旧成员', memberActive: false },
    ],
    expenses: [{ expenseId: 'expense-active' }],
  }
  it('其他成员删除正在编辑的支出后取消过期编辑', () => {
    expect(reconcileExpenseDraft(snapshot, 'expense-deleted', {
      description: '过期草稿', amount: '12.00', paidBy: 'p-1', splitMode: 'custom', selectedIds: ['p-1'],
    })).toEqual({ editingExpenseId: '', discardedEdit: true, form: { description: '', amount: '', paidBy: '', splitMode: 'everyone', selectedIds: [] } })
  })
  it('成员变化后保留输入并排除已退出成员', () => {
    expect(reconcileExpenseDraft(snapshot, '', {
      description: '晚餐', amount: '88.00', paidBy: 'p-old', splitMode: 'custom', selectedIds: ['p-2', 'p-old', 'p-2'],
    })).toEqual({
      editingExpenseId: '', discardedEdit: false,
      form: { description: '晚餐', amount: '88.00', paidBy: 'p-1', splitMode: 'custom', selectedIds: ['p-2'] },
    })
  })
})

function inviteToken(result) {
  return decodeURIComponent(result.sharePath.split('invite=')[1])
}

async function profileRequest(_service, mutationId, nickname) {
  return { mutationId, profile: { nickname } }
}

async function fixture(options = {}) {
  const repository = createMemoryRepository()
  const makeToken = tokenFactory()
  let clock = Date.parse('2026-08-15T08:00:00.000Z')
  const service = (openid, overrides = {}) => createLedgerService({
    repository, openid, appid: 'wx-test', makeToken, now: () => new Date(clock), ...options, ...overrides,
  })
  const owner = service('owner-openid')
  const request = await profileRequest(owner, 'create-room-0001', '小浩')
  const created = await owner.execute({ action: 'room_create', title: '周末旅行', currency: 'CNY', roundToWhole: false, ...request })
  return { repository, owner, service, created, advance: (milliseconds) => { clock += milliseconds } }
}

function createInvite(owner, snapshot, suffix = '0001', overrides = {}) {
  return owner.execute({
    action: 'room_invite', roomId: snapshot.room.roomId, baseRevision: snapshot.room.revision,
    mutationId: `invite-room-${suffix}`, ...overrides,
  })
}

async function joinWithProfile(service, token, mutationId, nickname) {
  const request = await profileRequest(service, mutationId, nickname)
  return service.execute({ action: 'room_join', invite: token, ...request })
}

async function addExpense(service, snapshot, suffix = '0001', overrides = {}) {
  const activeIds = snapshot.participants.filter(({ memberActive }) => memberActive).map(({ participantId }) => participantId)
  return service.execute({
    action: 'room_mutate', roomId: snapshot.room.roomId, baseRevision: snapshot.room.revision,
    mutationId: `add-expense-${suffix}`, kind: 'upsert_expense',
    payload: { expense: { description: '成员添加', amountMinor: 1200, paidByParticipantId: snapshot.self.participantId, splitParticipantIds: activeIds, ...overrides } },
  })
}

describe('微信共享分账 V2 信任边界', () => {
  it('实体上限为最重写入事务保留 CloudBase 操作余量', () => {
    expect(LIMITS.members + LIMITS.expenses + 12).toBeLessThanOrEqual(100)
  })

  it('从空白创建房间并自动绑定唯一 owner participant', async () => {
    const { created, repository } = await fixture()
    expect(created.ok).toBe(true)
    expect(created.snapshot).toMatchObject({
      room: { title: '周末旅行', currency: 'CNY', revision: 1 },
      self: { displayName: '小浩', role: 'owner', canManage: true },
    })
    expect(created.snapshot.members).toHaveLength(1)
    expect(created.snapshot.participants).toHaveLength(1)
    expect(created.snapshot.expenses).toEqual([])
    expect(created.snapshot.self.participantId).toBe(created.snapshot.participants[0].participantId)
    expect(created.snapshot.participants[0]).toMatchObject({ memberId: created.snapshot.self.memberId, memberActive: true })
    expect(JSON.stringify(created)).not.toMatch(/owner-openid|cloud:\/\/|openid/i)
    expect(repository.dump('members').every((member) => !Object.hasOwn(member, 'openid'))).toBe(true)
  })

  it('建房重试幂等且禁止旧的本地账单/认领协议', async () => {
    const repository = createMemoryRepository()
    const owner = createLedgerService({ repository, openid: 'owner-openid', makeToken: tokenFactory() })
    const request = await profileRequest(owner, 'stable-create-0001', '房主')
    const create = { action: 'room_create', title: '同一笔账', currency: 'CNY', ...request }
    const first = await owner.execute(create)
    const replay = await owner.execute(create)
    expect(first.ok).toBe(true)
    expect(replay).toMatchObject({ ok: true, replayed: true })
    expect(replay.snapshot.room.roomId).toBe(first.snapshot.room.roomId)
    expect(await owner.execute({ ...create, state: sampleState() })).toEqual({ ok: false, error: 'legacy_identity_forbidden' })
    expect(await owner.execute({ ...create, displayName: '伪造身份' })).toEqual({ ok: false, error: 'legacy_identity_forbidden' })
  })

  it('昵称必填且最多 28 个字符，不接收头像上传动作', async () => {
    const repository = createMemoryRepository()
    const owner = createLedgerService({ repository, openid: 'owner-openid', makeToken: tokenFactory() })
    expect(await owner.execute({
      action: 'room_create', mutationId: 'empty-name-0001', title: '空昵称', currency: 'CNY', profile: { nickname: '   ' },
    })).toEqual({ ok: false, error: 'invalid_display_name' })
    expect(await owner.execute({
      action: 'room_create', mutationId: 'long-name-00001', title: '长昵称', currency: 'CNY', profile: { nickname: '名'.repeat(29) },
    })).toEqual({ ok: false, error: 'invalid_display_name' })
    expect(await owner.execute({
      action: 'room_create', mutationId: 'avatar-field-0001', title: '旧资料', currency: 'CNY',
      profile: { nickname: '房主', avatarFileId: 'cloud://legacy/avatar.png' },
    })).toEqual({ ok: false, error: 'invalid_profile' })
    expect(await owner.execute({ action: 'avatar_prepare', mutationId: 'avatar-old-0001', extension: 'png' }))
      .toEqual({ ok: false, error: 'unknown_action' })
  })

  it('非成员伪造 OpenID、角色、memberId 或 participantId 均不能读写', async () => {
    const { created, service } = await fixture()
    const outsider = service('outsider-openid')
    expect(await outsider.execute({
      action: 'room_get', roomId: created.snapshot.room.roomId, role: 'owner', memberId: created.snapshot.self.memberId,
      participantId: created.snapshot.self.participantId, openid: 'owner-openid',
    })).toEqual({ ok: false, error: 'not_member' })
    expect(await outsider.execute({
      action: 'room_mutate', roomId: created.snapshot.room.roomId, baseRevision: 1,
      mutationId: 'outsider-write-0001', kind: 'set_rounding', payload: { roundToWhole: true }, role: 'owner', owner: true,
    })).toEqual({ ok: false, error: 'not_member' })
  })

  it('邀请预览最小化；加入自动创建 member/participant 且不认领身份', async () => {
    const { owner, created, service, repository } = await fixture()
    const invitation = await createInvite(owner, created.snapshot)
    const token = inviteToken(invitation)
    const guest = service('guest-openid')
    const preview = await guest.execute({ action: 'room_join_preview', invite: token })
    expect(preview).toMatchObject({ ok: true, preview: { title: '周末旅行', currency: 'CNY', memberCount: 1, alreadyJoined: false } })
    expect(preview.preview).not.toHaveProperty('roomId')
    expect(preview.preview).not.toHaveProperty('members')
    expect(preview.preview).not.toHaveProperty('participants')
    expect(preview.preview).not.toHaveProperty('expenses')
    expect(JSON.stringify(preview)).not.toContain(token)
    const legacy = await guest.execute({
      action: 'room_join', invite: token, mutationId: 'join-legacy-0001', displayName: '访客', claimParticipantId: created.snapshot.self.participantId,
    })
    expect(legacy).toEqual({ ok: false, error: 'legacy_identity_forbidden' })
    const joined = await joinWithProfile(guest, token, 'join-guest-00001', '小夏')
    expect(joined.ok).toBe(true)
    expect(joined.snapshot.members).toHaveLength(2)
    expect(joined.snapshot.participants).toHaveLength(2)
    expect(joined.snapshot.self).toMatchObject({ displayName: '小夏', role: 'editor' })
    expect(joined.snapshot.participants.find(({ memberId }) => memberId === joined.snapshot.self.memberId)).toMatchObject({
      name: '小夏', participantId: joined.snapshot.self.participantId, memberActive: true,
    })
    expect(repository.dump('members').every((member) => !Object.hasOwn(member, 'openid'))).toBe(true)
  })

  it('同一微信账号重复打开邀请直接进入且不会重复成员或参与人', async () => {
    const { owner, created, service } = await fixture()
    const invitation = await createInvite(owner, created.snapshot, 'idempotent')
    const token = inviteToken(invitation)
    const guest = service('same-openid')
    const joined = await joinWithProfile(guest, token, 'join-same-000001', '同名')
    const repeated = await guest.execute({ action: 'room_join', invite: token, mutationId: 'join-again-00001' })
    expect(repeated).toMatchObject({ ok: true, alreadyJoined: true })
    expect(repeated.snapshot.members).toHaveLength(2)
    expect(repeated.snapshot.participants).toHaveLength(2)
    expect(repeated.snapshot.self.participantId).toBe(joined.snapshot.self.participantId)
    expect((await guest.execute({ action: 'room_join_preview', invite: token })).preview.alreadyJoined).toBe(true)
  })

  it('新成员受邀请过期、撤销和次数限制；已加入成员不受旧链接限制', async () => {
    const first = await fixture()
    const invitation = await createInvite(first.owner, first.created.snapshot, 'expiry', { ttlDays: 1, maxUses: 1 })
    const token = inviteToken(invitation)
    const joinedService = first.service('joined-openid')
    await joinWithProfile(joinedService, token, 'join-before-expiry', '已加入')
    first.advance(25 * 60 * 60 * 1000)
    expect((await joinedService.execute({ action: 'room_join_preview', invite: token })).preview.alreadyJoined).toBe(true)
    expect(await first.service('late-openid').execute({ action: 'room_join_preview', invite: token }))
      .toEqual({ ok: false, error: 'invite_expired' })

    const second = await fixture()
    const secondInvite = await createInvite(second.owner, second.created.snapshot, 'revoke')
    await second.owner.execute({
      action: 'room_manage', roomId: second.created.snapshot.room.roomId, baseRevision: secondInvite.revision,
      mutationId: 'revoke-invite-0001', kind: 'revoke_invite', payload: { inviteId: secondInvite.inviteId },
    })
    expect(await second.service('guest-openid').execute({ action: 'room_join_preview', invite: inviteToken(secondInvite) }))
      .toEqual({ ok: false, error: 'invite_invalid' })
  })

  it('邀请 token 不入快照，同一 mutationId 重试返回同一分享路径', async () => {
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
    const snapshot = await owner.execute({ action: 'room_get', roomId: created.snapshot.room.roomId })
    expect(JSON.stringify(snapshot)).not.toContain(token)
  })

  it('移除成员立即撤权；历史 participant 保留但不能用于新支出', async () => {
    const { owner, created, service } = await fixture()
    const invitation = await createInvite(owner, created.snapshot, 'remove-member')
    const guest = service('guest-openid')
    const joined = await joinWithProfile(guest, inviteToken(invitation), 'join-remove-0001', '朋友')
    const removed = await owner.execute({
      action: 'room_manage', roomId: created.snapshot.room.roomId, baseRevision: joined.snapshot.room.revision,
      mutationId: 'remove-member-0001', kind: 'remove_member', payload: { memberId: joined.snapshot.self.memberId },
    })
    expect(await guest.execute({ action: 'room_get', roomId: created.snapshot.room.roomId })).toEqual({ ok: false, error: 'membership_revoked' })
    const latest = (await owner.execute({ action: 'room_get', roomId: created.snapshot.room.roomId })).snapshot
    const former = latest.participants.find(({ participantId }) => participantId === joined.snapshot.self.participantId)
    expect(former).toMatchObject({ name: '朋友', memberActive: false })
    expect(await owner.execute({
      action: 'room_mutate', roomId: latest.room.roomId, baseRevision: latest.room.revision,
      mutationId: 'former-expense-0001', kind: 'upsert_expense',
      payload: { expense: { description: '无效', amountMinor: 100, paidByParticipantId: former.participantId, splitParticipantIds: [latest.self.participantId] } },
    })).toEqual({ ok: false, error: 'invalid_expense_participant' })
  })

  it('退出或移除后只能用更新的邀请重新加入，并复用自己的 participant', async () => {
    const { owner, created, service } = await fixture()
    const firstInvite = await createInvite(owner, created.snapshot, 'before-leave')
    const guest = service('leaving-openid')
    const joined = await joinWithProfile(guest, inviteToken(firstInvite), 'join-leave-00001', '会回来')
    const participantId = joined.snapshot.self.participantId
    const left = await guest.execute({
      action: 'room_manage', roomId: created.snapshot.room.roomId, baseRevision: joined.snapshot.room.revision,
      mutationId: 'leave-room-000001', kind: 'leave_room', payload: {},
    })
    const staleProfile = await profileRequest(guest, 'rejoin-stale-0001', '会回来')
    expect(await guest.execute({ action: 'room_join', invite: inviteToken(firstInvite), ...staleProfile }))
      .toEqual({ ok: false, error: 'new_invite_required' })
    const freshInvite = await createInvite(owner, { room: { ...created.snapshot.room, revision: left.revision } }, 'after-leave')
    const rejoined = await joinWithProfile(guest, inviteToken(freshInvite), 'rejoin-fresh-0001', '回来了')
    expect(rejoined).toMatchObject({ ok: true, alreadyJoined: false })
    expect(rejoined.snapshot.self.participantId).toBe(participantId)
    expect(rejoined.snapshot.participants.filter(({ participantId: id }) => id === participantId)).toHaveLength(1)
  })

  it('普通成员可新增、编辑和删除支出，但不能执行房主操作', async () => {
    const { owner, created, service } = await fixture()
    const invitation = await createInvite(owner, created.snapshot, 'editor')
    const guest = service('editor-openid')
    const joined = await joinWithProfile(guest, inviteToken(invitation), 'join-editor-0001', '编辑者')
    const expense = await addExpense(guest, joined.snapshot, 'editor-0001')
    expect(expense.ok).toBe(true)
    const activeIds = joined.snapshot.participants.map(({ participantId }) => participantId)
    const edited = await guest.execute({
      action: 'room_mutate', roomId: joined.snapshot.room.roomId, baseRevision: expense.revision,
      mutationId: 'edit-expense-0001', kind: 'upsert_expense',
      payload: { expense: { expenseId: expense.entityId, description: '成员修改', amountMinor: 1350, paidByParticipantId: joined.snapshot.self.participantId, splitParticipantIds: activeIds } },
    })
    expect(edited).toMatchObject({ ok: true, entityId: expense.entityId })
    const deleted = await guest.execute({
      action: 'room_mutate', roomId: joined.snapshot.room.roomId, baseRevision: edited.revision,
      mutationId: 'delete-expense-001', kind: 'delete_expense', payload: { expenseId: expense.entityId },
    })
    expect(deleted.ok).toBe(true)
    expect(await guest.execute({
      action: 'room_manage', roomId: joined.snapshot.room.roomId, baseRevision: deleted.revision,
      mutationId: 'editor-archive-001', kind: 'archive_room', payload: {}, role: 'owner', owner: true,
    })).toEqual({ ok: false, error: 'owner_required' })
  })

  it('成员只能更新自己的房间资料，并同步自己的 participant 名称', async () => {
    const { owner, created, service } = await fixture()
    const invitation = await createInvite(owner, created.snapshot, 'profile')
    const guest = service('profile-openid')
    const joined = await joinWithProfile(guest, inviteToken(invitation), 'join-profile-0001', '旧昵称')
    const profile = await profileRequest(guest, 'profile-update-001', '新昵称')
    const updated = await guest.execute({
      action: 'room_profile_update', roomId: joined.snapshot.room.roomId, baseRevision: joined.snapshot.room.revision, ...profile,
      memberId: created.snapshot.self.memberId, participantId: created.snapshot.self.participantId,
    })
    expect(updated.ok).toBe(true)
    const latest = (await guest.execute({ action: 'room_get', roomId: joined.snapshot.room.roomId })).snapshot
    expect(latest.self.displayName).toBe('新昵称')
    expect(latest.participants.find(({ participantId }) => participantId === latest.self.participantId)?.name).toBe('新昵称')
    expect(latest.members.find(({ role }) => role === 'owner')?.displayName).toBe('小浩')
  })

  it('邀请预览不泄露成员昵称、账单内容或内部标识', async () => {
    const { owner, created, service } = await fixture()
    const invitation = await createInvite(owner, created.snapshot, 'preview-boundary')
    const outsider = service('preview-openid')
    const preview = await outsider.execute({ action: 'room_join_preview', invite: inviteToken(invitation) })
    expect(Object.keys(preview.preview).sort()).toEqual(['alreadyJoined', 'currency', 'expiresAt', 'memberCount', 'title'])
    expect(JSON.stringify(preview)).not.toMatch(/小浩|memberId|participant|expense|openid/i)
    expect(await outsider.execute({ action: 'room_get', roomId: created.snapshot.room.roomId })).toEqual({ ok: false, error: 'not_member' })
  })

  it('房主归档后仍可读取但任何账单编辑都会被拒绝', async () => {
    const { owner, created } = await fixture()
    const archived = await owner.execute({
      action: 'room_manage', roomId: created.snapshot.room.roomId, baseRevision: 1,
      mutationId: 'archive-room-0001', kind: 'archive_room', payload: {},
    })
    expect(archived).toMatchObject({ ok: true, revision: 2 })
    expect((await owner.execute({ action: 'room_get', roomId: created.snapshot.room.roomId })).snapshot.room.status).toBe('archived')
    expect(await owner.execute({
      action: 'room_mutate', roomId: created.snapshot.room.roomId, baseRevision: 2,
      mutationId: 'archived-write-0001', kind: 'set_rounding', payload: { roundToWhole: true },
    })).toEqual({ ok: false, error: 'room_not_active' })
  })
})

describe('微信共享分账 V2 并发与幂等', () => {
  it('两名微信成员可分别新增和编辑支出，并在同一 revision 得到相同结算', async () => {
    const { owner, created, service } = await fixture()
    const invitation = await createInvite(owner, created.snapshot, 'two-member-flow')
    const guest = service('second-member-openid')
    const joined = await joinWithProfile(guest, inviteToken(invitation), 'join-two-member-1', '成员 B')

    const ownerAfterJoin = (await owner.execute({ action: 'room_get', roomId: joined.snapshot.room.roomId })).snapshot
    const ownerExpense = await addExpense(owner, ownerAfterJoin, 'owner-flow', {
      description: 'A 添加', amountMinor: 6000,
    })
    const guestAfterOwnerAdd = (await guest.execute({ action: 'room_get', roomId: joined.snapshot.room.roomId })).snapshot
    expect(guestAfterOwnerAdd.expenses).toMatchObject([{ expenseId: ownerExpense.entityId, description: 'A 添加', amountMinor: 6000 }])

    const guestExpense = await addExpense(guest, guestAfterOwnerAdd, 'guest-flow', {
      description: 'B 添加', amountMinor: 3000,
    })
    const ownerAfterGuestAdd = (await owner.execute({ action: 'room_get', roomId: joined.snapshot.room.roomId })).snapshot
    expect(ownerAfterGuestAdd.expenses).toHaveLength(2)

    const activeIds = ownerAfterGuestAdd.participants.filter(({ memberActive }) => memberActive).map(({ participantId }) => participantId)
    const ownerEdited = await owner.execute({
      action: 'room_mutate', roomId: ownerAfterGuestAdd.room.roomId, baseRevision: ownerAfterGuestAdd.room.revision,
      mutationId: 'owner-edit-shared-1', kind: 'upsert_expense',
      payload: { expense: { expenseId: ownerExpense.entityId, description: 'A 修改', amountMinor: 8000, paidByParticipantId: ownerAfterGuestAdd.self.participantId, splitParticipantIds: activeIds } },
    })
    const guestBeforeEdit = (await guest.execute({ action: 'room_get', roomId: joined.snapshot.room.roomId })).snapshot
    expect(guestBeforeEdit.expenses.find(({ expenseId }) => expenseId === ownerExpense.entityId)).toMatchObject({ description: 'A 修改', amountMinor: 8000 })
    const guestEdited = await guest.execute({
      action: 'room_mutate', roomId: guestBeforeEdit.room.roomId, baseRevision: ownerEdited.revision,
      mutationId: 'guest-edit-shared-1', kind: 'upsert_expense',
      payload: { expense: { expenseId: guestExpense.entityId, description: 'B 修改', amountMinor: 4000, paidByParticipantId: guestBeforeEdit.self.participantId, splitParticipantIds: activeIds } },
    })

    const [ownerFinal, guestFinal] = await Promise.all([
      owner.execute({ action: 'room_get', roomId: joined.snapshot.room.roomId }),
      guest.execute({ action: 'room_get', roomId: joined.snapshot.room.roomId }),
    ])
    expect(ownerFinal.snapshot.room.revision).toBe(guestEdited.revision)
    expect(guestFinal.snapshot.room.revision).toBe(guestEdited.revision)
    expect(ownerFinal.snapshot.expenses).toEqual(guestFinal.snapshot.expenses)
    const ownerState = snapshotToDebtState(ownerFinal.snapshot)
    const guestState = snapshotToDebtState(guestFinal.snapshot)
    expect(simplifyDebts(ownerState.participants, ownerState.expenses, false))
      .toEqual(simplifyDebts(guestState.participants, guestState.expenses, false))
    expect(simplifyDebts(ownerState.participants, ownerState.expenses, false)).toEqual([{
      from: guestFinal.snapshot.self.participantId,
      to: ownerFinal.snapshot.self.participantId,
      amountCents: 2000,
    }])
  })

  it('重复 mutationId 不会重复新增支出', async () => {
    const { owner, created } = await fixture()
    const mutation = {
      action: 'room_mutate', roomId: created.snapshot.room.roomId, baseRevision: 1,
      mutationId: 'add-expense-0001', kind: 'upsert_expense',
      payload: { expense: { description: '单人草稿', amountMinor: 1200, paidByParticipantId: created.snapshot.self.participantId, splitParticipantIds: [created.snapshot.self.participantId] } },
    }
    const first = await owner.execute(mutation)
    const replay = await owner.execute(mutation)
    expect(first.ok).toBe(true)
    expect(replay).toMatchObject({ ok: true, replayed: true, revision: first.revision, entityId: first.entityId })
    expect(await owner.execute({ ...mutation, payload: { expense: { ...mutation.payload.expense, amountMinor: 9999 } } }))
      .toEqual({ ok: false, error: 'mutation_mismatch' })
  })

  it('相同 baseRevision 的并发写入不会静默覆盖，并返回已鉴权快照', async () => {
    const { owner, created } = await fixture()
    const first = await owner.execute({
      action: 'room_mutate', roomId: created.snapshot.room.roomId, baseRevision: 1,
      mutationId: 'rename-room-0001', kind: 'rename_room', payload: { title: '第一次修改' },
    })
    const conflict = await owner.execute({
      action: 'room_mutate', roomId: created.snapshot.room.roomId, baseRevision: 1,
      mutationId: 'rename-room-0002', kind: 'rename_room', payload: { title: '第二次修改' },
    })
    expect(first).toMatchObject({ ok: true, revision: 2 })
    expect(conflict).toMatchObject({ ok: false, error: 'revision_conflict', currentRevision: 2, snapshot: { room: { title: '第一次修改' } } })
  })

  it('删除支出后旧页面不能复活，删除房间重试保持幂等', async () => {
    const { owner, created } = await fixture()
    const added = await addExpense(owner, created.snapshot, 'delete-00001')
    const deleted = await owner.execute({
      action: 'room_mutate', roomId: created.snapshot.room.roomId, baseRevision: added.revision,
      mutationId: 'delete-stale-0001', kind: 'delete_expense', payload: { expenseId: added.entityId },
    })
    expect(await owner.execute({
      action: 'room_mutate', roomId: created.snapshot.room.roomId, baseRevision: deleted.revision,
      mutationId: 'revive-stale-0001', kind: 'upsert_expense',
      payload: { expense: { expenseId: added.entityId, description: '复活', amountMinor: 100, paidByParticipantId: created.snapshot.self.participantId, splitParticipantIds: [created.snapshot.self.participantId] } },
    })).toEqual({ ok: false, error: 'expense_not_found' })
    const request = {
      action: 'room_manage', roomId: created.snapshot.room.roomId, baseRevision: deleted.revision,
      mutationId: 'delete-room-retry-01', kind: 'delete_room', payload: {},
    }
    const first = await owner.execute(request)
    const replay = await owner.execute(request)
    expect(replay).toMatchObject({ ok: true, replayed: true, revision: first.revision })
  })

  it('拒绝非法金额、未知或已退出参与人、非法币种和重复分摊人', async () => {
    const { owner, created } = await fixture()
    const base = {
      action: 'room_mutate', roomId: created.snapshot.room.roomId, baseRevision: 1,
      mutationId: 'invalid-expense-01', kind: 'upsert_expense',
    }
    expect(await owner.execute({ ...base, payload: { expense: { description: '坏金额', amountMinor: -1, paidByParticipantId: created.snapshot.self.participantId, splitParticipantIds: [created.snapshot.self.participantId] } } }))
      .toEqual({ ok: false, error: 'invalid_amount' })
    expect(await owner.execute({ ...base, mutationId: 'invalid-expense-02', payload: { expense: { description: '未知', amountMinor: 1, paidByParticipantId: 'unknown', splitParticipantIds: ['unknown'] } } }))
      .toEqual({ ok: false, error: 'invalid_expense_participant' })
    expect(await owner.execute({ ...base, mutationId: 'duplicate-split-01', payload: { expense: { description: '重复', amountMinor: 1, paidByParticipantId: created.snapshot.self.participantId, splitParticipantIds: [created.snapshot.self.participantId, created.snapshot.self.participantId] } } }))
      .toEqual({ ok: false, error: 'invalid_expense_participant' })

    const invalidService = createLedgerService({ repository: createMemoryRepository(), openid: 'invalid-owner' })
    const profile = await profileRequest(invalidService, 'invalid-currency-01', '房主')
    expect(await invalidService.execute({ action: 'room_create', title: '坏币种', currency: 'BTC', ...profile }))
      .toEqual({ ok: false, error: 'invalid_currency' })
  })

  it('有支出时只允许相同最小单位精度币种，空房可以跨精度切换', async () => {
    const first = await fixture()
    expect(await first.owner.execute({
      action: 'room_mutate', roomId: first.created.snapshot.room.roomId, baseRevision: 1,
      mutationId: 'currency-empty-jpy-1', kind: 'set_currency', payload: { currency: 'JPY' },
    })).toMatchObject({ ok: true, revision: 2 })

    const second = await fixture()
    const added = await addExpense(second.owner, second.created.snapshot, 'currency-0001')
    expect(await second.owner.execute({
      action: 'room_mutate', roomId: second.created.snapshot.room.roomId, baseRevision: added.revision,
      mutationId: 'currency-cny-usd-01', kind: 'set_currency', payload: { currency: 'USD' },
    })).toMatchObject({ ok: true })
    expect(await second.owner.execute({
      action: 'room_mutate', roomId: second.created.snapshot.room.roomId, baseRevision: added.revision + 1,
      mutationId: 'currency-usd-jpy-01', kind: 'set_currency', payload: { currency: 'JPY' },
    })).toEqual({ ok: false, error: 'currency_precision_change' })
  })
})

describe('共享房间客户端边界', () => {
  it('按币种最小单位解析金额并保留本地转换工具', () => {
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

  it('拒绝破坏 member/participant 一一关系或引用未知参与人的快照', async () => {
    const { owner, created } = await fixture()
    const added = await addExpense(owner, created.snapshot, 'snapshot-0001')
    const latest = (await owner.execute({ action: 'room_get', roomId: created.snapshot.room.roomId })).snapshot
    const tamperedExpense = structuredClone(latest)
    tamperedExpense.expenses.find(({ expenseId }) => expenseId === added.entityId).paidByParticipantId = 'unknown-person'
    expect(parseRoomSnapshot(tamperedExpense)).toBeNull()
    const tamperedIdentity = structuredClone(latest)
    tamperedIdentity.participants[0].memberId = 'forged-member'
    expect(parseRoomSnapshot(tamperedIdentity)).toBeNull()
  })

  it('客户端只调用 ledger 云函数，身份资料只确认昵称', () => {
    const clientSource = readFileSync(new URL('../miniprogram/lib/rooms.js', import.meta.url), 'utf8')
    const pageSource = readFileSync(new URL('../miniprogram/pages/room/room.js', import.meta.url), 'utf8')
    const roomTemplate = readFileSync(new URL('../miniprogram/pages/room/room.wxml', import.meta.url), 'utf8')
    const indexSource = readFileSync(new URL('../miniprogram/pages/index/index.js', import.meta.url), 'utf8')
    expect(clientSource).toMatch(/callFunction\(\{ name: 'ledger'/)
    expect(clientSource).not.toMatch(/\.database\s*\(/)
    expect(pageSource).not.toMatch(/\.database\s*\(/)
    expect(pageSource).not.toMatch(/console\.(?:log|error).*invite/i)
    expect(roomTemplate).toMatch(/type="nickname"/)
    expect(roomTemplate).not.toMatch(/chooseAvatar|认领|claimableParticipants/)
    expect(indexSource).toMatch(/pendingRoomCreate/)
  })

  it('云环境开关控制初始化；共享建房入口不依赖本地支出', () => {
    const configSource = readFileSync(new URL('../miniprogram/config/cloud.js', import.meta.url), 'utf8')
    const appSource = readFileSync(new URL('../miniprogram/app.js', import.meta.url), 'utf8')
    const indexTemplate = readFileSync(new URL('../miniprogram/pages/index/index.wxml', import.meta.url), 'utf8')
    expect(configSource).toMatch(/SHARED_ROOMS_ENABLED\s*=\s*Boolean\(CLOUD_ENV_ID\)/)
    expect(appSource).toMatch(/if \(CLOUD_ENV_ID && wx\.cloud\)/)
    expect(indexTemplate).toMatch(/wx:if="\{\{sharedRoomsEnabled\}\}"/)
    expect(indexTemplate).not.toMatch(/sharedRoomsEnabled && hasExpenses/)
  })

  it('本地缓存不保存邀请 token、OpenID 或云文件引用', async () => {
    const { created } = await fixture()
    const writes = []
    const previousWx = globalThis.wx
    globalThis.wx = { getStorageSync: () => [], setStorageSync: (key, value) => writes.push({ key, value }) }
    try { saveRoomCache(created.snapshot) } finally { globalThis.wx = previousWx }
    const serialized = JSON.stringify(writes)
    expect(serialized).not.toMatch(/sharePath|inviteToken|[?&]invite=|openid|cloud:\/\//i)
  })

  it('云事务适配器不使用 where 查询', () => {
    const source = readFileSync(new URL('../cloudfunctions/ledger/repository.js', import.meta.url), 'utf8')
    const adapter = source.split('function transactionAdapter')[1].split('function readAdapter')[0]
    expect(adapter).not.toMatch(/\.where\s*\(/)
    expect(adapter).toMatch(/listDocumentsById/)
  })
})

function createCleanupDatabase(documentCount) {
  const remaining = new Set(Array.from({ length: documentCount }, (_, index) => `document-${index}`))
  return {
    remaining,
    database: {
      collection() {
        return {
          where() { return { limit(limit) { return { async get() { return { data: [...remaining].slice(0, limit).map((_id) => ({ _id })) } } } } } },
          doc(documentId) { return { async remove() { remaining.delete(documentId) } } },
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
