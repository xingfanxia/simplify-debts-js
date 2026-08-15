const cloud = require('wx-server-sdk')
const { purgeCollection } = require('./cleanup')
const { isInteractiveInvocation, purgeCutoff, shouldPurgeRoom } = require('./policy')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const DEPENDENT_COLLECTIONS = [
  'ledger_members',
  'ledger_participants',
  'ledger_expenses',
  'ledger_invites',
  'ledger_mutations',
]
const BATCH_SIZE = 5

exports.main = async () => {
  if (isInteractiveInvocation(cloud.getWXContext())) return { ok: false, error: 'forbidden' }
  const database = cloud.database()
  const command = database.command
  const now = new Date()
  const result = await database.collection('ledger_rooms').where({
    status: 'deleted',
    deletedAt: command.lte(purgeCutoff(now)),
  }).limit(BATCH_SIZE).get()
  const rooms = Array.isArray(result && result.data) ? result.data.filter((room) => shouldPurgeRoom(room, now)) : []

  let purged = 0
  for (const room of rooms) {
    let dependenciesPurged = true
    for (const collectionName of DEPENDENT_COLLECTIONS) {
      const complete = await purgeCollection(database, collectionName, room._id)
      dependenciesPurged = dependenciesPurged && complete
    }
    if (dependenciesPurged) {
      await database.collection('ledger_rooms').doc(room._id).remove()
      purged += 1
    }
  }

  return { ok: true, purged, remainingPossible: rooms.length === BATCH_SIZE }
}
