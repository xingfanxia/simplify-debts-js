const DOCUMENT_BATCH_SIZE = 100
const MAX_DOCUMENT_BATCHES = 5
const REMOVE_CONCURRENCY = 10

async function removeDocuments(database, collectionName, documents) {
  for (let offset = 0; offset < documents.length; offset += REMOVE_CONCURRENCY) {
    await Promise.all(documents.slice(offset, offset + REMOVE_CONCURRENCY).map((document) => (
      database.collection(collectionName).doc(document._id).remove()
    )))
  }
}

async function purgeCollection(database, collectionName, roomId) {
  for (let batch = 0; batch < MAX_DOCUMENT_BATCHES; batch += 1) {
    const result = await database.collection(collectionName).where({ roomId }).limit(DOCUMENT_BATCH_SIZE).get()
    const documents = Array.isArray(result && result.data) ? result.data : []
    await removeDocuments(database, collectionName, documents)
    if (documents.length < DOCUMENT_BATCH_SIZE) return true
  }
  const remaining = await database.collection(collectionName).where({ roomId }).limit(1).get()
  return !Array.isArray(remaining && remaining.data) || remaining.data.length === 0
}

module.exports = {
  DOCUMENT_BATCH_SIZE,
  MAX_DOCUMENT_BATCHES,
  REMOVE_CONCURRENCY,
  purgeCollection,
}
