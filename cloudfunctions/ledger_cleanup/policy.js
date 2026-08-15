const RETENTION_DAYS = 30
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000

function shouldPurgeRoom(room, now = new Date()) {
  if (!room || room.status !== 'deleted' || typeof room.deletedAt !== 'string') return false
  const deletedAt = Date.parse(room.deletedAt)
  const nowTime = now instanceof Date ? now.getTime() : new Date(now).getTime()
  return Number.isFinite(deletedAt) && Number.isFinite(nowTime) && nowTime - deletedAt >= RETENTION_MS
}

function purgeCutoff(now = new Date()) {
  const nowTime = now instanceof Date ? now.getTime() : new Date(now).getTime()
  if (!Number.isFinite(nowTime)) throw new Error('invalid_clock')
  return new Date(nowTime - RETENTION_MS).toISOString()
}

module.exports = { RETENTION_DAYS, shouldPurgeRoom, purgeCutoff }
