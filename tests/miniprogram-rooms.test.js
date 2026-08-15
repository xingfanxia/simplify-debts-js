import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseRoomSnapshot } from '../miniprogram/lib/rooms.js'

const require = createRequire(import.meta.url)
const { createLedgerService } = require('../cloudfunctions/ledger/service.js')
const { RETENTION_DAYS, purgeCutoff, shouldPurgeRoom } = require('../cloudfunctions/ledger_cleanup/policy.js')

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
  const list = (draft, name, roomId) => [...draft[name].values()].filter((document) => document.roomId === roomId).map(clone)
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
      { id: 'parking', description: '停车', paidBy: 'hao', amountCents: 8100, splitWith: ['xiao', 'hao', 'ax'] },
    ],
    currency: 'CNY',
    roundToWhole: false,
  }
}

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

describe('微信共享分账房间信任边界', () => {
  it('创建时重新生成实体 ID，并且响应不泄露 OpenID', async () => {
    const { created } = await fixture()
    expect(created.ok).toBe(true)
    expect(created.snapshot.room.title).toBe('周末旅行')
    expect(created.snapshot.participants).toHaveLength(3)
    expect(created.snapshot.participants.some(({ participantId }) => participantId === 'hao')).toBe(false)
    expect(JSON.stringify(created)).not.toMatch(/owner-openid|openid/i)
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
  })

  it('邀请预览只返回最小信息，加入后才能看到支出', async () => {
    const { owner, created, service } = await fixture()
    const invitation = await owner.execute({ action: 'room_invite', roomId: created.snapshot.room.roomId })
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
  })

  it('过期和撤销的邀请都无法再加入', async () => {
    const first = await fixture()
    const invitation = await first.owner.execute({ action: 'room_invite', roomId: first.created.snapshot.room.roomId, ttlDays: 1 })
    first.advance(25 * 60 * 60 * 1000)
    expect(await first.service('late-openid').execute({ action: 'room_join_preview', invite: inviteToken(invitation) }))
      .toEqual({ ok: false, error: 'invite_expired' })

    const second = await fixture()
    const secondInvite = await second.owner.execute({ action: 'room_invite', roomId: second.created.snapshot.room.roomId })
    const revoked = await second.owner.execute({
      action: 'room_manage',
      roomId: second.created.snapshot.room.roomId,
      baseRevision: second.created.snapshot.room.revision,
      mutationId: 'revoke-invite-0001',
      kind: 'revoke_invite',
      payload: { inviteId: secondInvite.inviteId },
    })
    expect(revoked.ok).toBe(true)
    expect(await second.service('guest-openid').execute({ action: 'room_join_preview', invite: inviteToken(secondInvite) }))
      .toEqual({ ok: false, error: 'invite_invalid' })
  })

  it('移除成员后立即拒绝其读取和写入', async () => {
    const { owner, created, service } = await fixture()
    const invitation = await owner.execute({ action: 'room_invite', roomId: created.snapshot.room.roomId })
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
          amountCents: 3000,
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
    expect(second).toEqual({ ok: false, error: 'revision_conflict', currentRevision: 2 })
  })

  it('拒绝非法金额、未知参与人和超长输入', async () => {
    const { owner, created } = await fixture()
    const base = {
      action: 'room_mutate', roomId: created.snapshot.room.roomId, baseRevision: 1,
      mutationId: 'invalid-expense-01', kind: 'upsert_expense',
    }
    expect(await owner.execute({
      ...base,
      payload: { expense: { description: '坏账', amountCents: -1, paidByParticipantId: 'missing', splitParticipantIds: ['missing'] } },
    })).toEqual({ ok: false, error: 'invalid_amount' })

    expect(await owner.execute({
      ...base,
      mutationId: 'invalid-expense-02',
      payload: { expense: { description: 'x'.repeat(61), amountCents: 100, paidByParticipantId: 'missing', splitParticipantIds: ['missing'] } },
    })).toEqual({ ok: false, error: 'invalid_expense' })
  })
})

describe('共享房间客户端边界', () => {
  it('拒绝引用未知参与人的云端快照', async () => {
    const { created } = await fixture()
    const tampered = structuredClone(created.snapshot)
    tampered.expenses[0].paidByParticipantId = 'unknown-person'
    expect(parseRoomSnapshot(tampered)).toBeNull()
  })

  it('客户端只调用 ledger 云函数，不直接读写原始集合', () => {
    const clientSource = readFileSync(new URL('../miniprogram/lib/rooms.js', import.meta.url), 'utf8')
    const pageSource = readFileSync(new URL('../miniprogram/pages/room/room.js', import.meta.url), 'utf8')
    expect(clientSource).toMatch(/callFunction\(\{ name: 'ledger'/)
    expect(clientSource).not.toMatch(/\.database\s*\(/)
    expect(pageSource).not.toMatch(/\.database\s*\(/)
    expect(pageSource).not.toMatch(/console\.(?:log|error).*invite/i)
  })

  it('云事务适配器不使用 where 查询', () => {
    const repositorySource = readFileSync(new URL('../cloudfunctions/ledger/repository.js', import.meta.url), 'utf8')
    const transactionAdapterSource = repositorySource.split('function transactionAdapter')[1].split('function readAdapter')[0]
    expect(transactionAdapterSource).not.toMatch(/\.where\s*\(/)
    expect(transactionAdapterSource).toMatch(/listDocumentsById/)
  })
})

describe('共享账单删除保留期', () => {
  it('只清理已经软删除满 30 天的房间', () => {
    const now = new Date('2026-08-15T00:00:00.000Z')
    expect(RETENTION_DAYS).toBe(30)
    expect(purgeCutoff(now)).toBe('2026-07-16T00:00:00.000Z')
    expect(shouldPurgeRoom({ status: 'deleted', deletedAt: '2026-07-15T23:59:59.000Z' }, now)).toBe(true)
    expect(shouldPurgeRoom({ status: 'deleted', deletedAt: '2026-07-17T00:00:00.000Z' }, now)).toBe(false)
    expect(shouldPurgeRoom({ status: 'active', deletedAt: '2026-01-01T00:00:00.000Z' }, now)).toBe(false)
  })
})
