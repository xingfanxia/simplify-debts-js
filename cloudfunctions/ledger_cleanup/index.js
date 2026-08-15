const cloud = require('wx-server-sdk')
const { isInteractiveInvocation, purgeCutoff, shouldPurgeRoom } = require('./policy')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const DEPENDENT_COLLECTIONS = [
  'ledger_members',
  'ledger_participants',
  'ledger_expenses',
  'ledger_invites',
  'ledger_mutations',
]
const BATCH_SIZE = 20
const DOCUMENT_BATCH_SIZE = 100
const MAX_DOCUMENT_BATCHES = 5

async function purgeCollection(database, collectionName, roomId) {
  for (let batch = 0; batch < MAX_DOCUMENT_BATCHES; batch += 1) {
    const result = await database.collection(collectionName).where({ roomId }).limit(DOCUMENT_BATCH_SIZE).get()
    const documents = Array.isArray(result && result.data) ? result.data : []
    for (const document of documents) await database.collection(collectionName).doc(document._id).remove()
    if (documents.length < DOCUMENT_BATCH_SIZE) return true
  }
  const remaining = await database.collection(collectionName).where({ roomId }).limit(1).get()
  return !Array.isArray(remaining && remaining.data) || remaining.data.length === 0
}

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
