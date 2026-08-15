const COLLECTIONS = Object.freeze({
  rooms: 'ledger_rooms',
  members: 'ledger_members',
  participants: 'ledger_participants',
  expenses: 'ledger_expenses',
  invites: 'ledger_invites',
  mutations: 'ledger_mutations',
})

function withoutId(document) {
  const { _id, ...data } = document
  return data
}

function isMissingDocument(error) {
  return /not exist|does not exist|cannot find|-502004/i.test(String((error && error.errMsg) || error))
}

async function getDocument(transaction, collectionName, documentId) {
  try {
    const result = await transaction.collection(collectionName).doc(documentId).get()
    return result && result.data ? result.data : null
  } catch (error) {
    if (isMissingDocument(error)) return null
    throw error
  }
}

async function listDocuments(transaction, collectionName, roomId) {
  const result = await transaction.collection(collectionName).where({ roomId }).limit(100).get()
  return Array.isArray(result && result.data) ? result.data : []
}

async function listDocumentsById(transaction, collectionName, documentIds) {
  const documents = []
  for (const documentId of documentIds) {
    const document = await getDocument(transaction, collectionName, documentId)
    if (document) documents.push(document)
  }
  return documents
}

async function putDocument(transaction, collectionName, document) {
  await transaction.collection(collectionName).doc(document._id).set({ data: withoutId(document) })
}

function transactionAdapter(transaction) {
  const roomCache = new Map()
  async function getRoom(roomId) {
    if (roomCache.has(roomId)) return roomCache.get(roomId)
    const room = await getDocument(transaction, COLLECTIONS.rooms, roomId)
    if (room) roomCache.set(roomId, room)
    return room
  }
  async function putRoom(document) {
    roomCache.set(document._id, document)
    await putDocument(transaction, COLLECTIONS.rooms, document)
  }
  async function listIndexed(roomId, collectionName, indexName) {
    const room = await getRoom(roomId)
    const documentIds = room && Array.isArray(room[indexName]) ? room[indexName] : []
    return listDocumentsById(transaction, collectionName, documentIds)
  }
  return {
    getRoom,
    putRoom,
    getMember: (documentId) => getDocument(transaction, COLLECTIONS.members, documentId),
    listMembers: (roomId) => listIndexed(roomId, COLLECTIONS.members, 'memberDocIds'),
    putMember: (document) => putDocument(transaction, COLLECTIONS.members, document),
    listParticipants: (roomId) => listIndexed(roomId, COLLECTIONS.participants, 'participantDocIds'),
    putParticipant: (document) => putDocument(transaction, COLLECTIONS.participants, document),
    getExpense: (documentId) => getDocument(transaction, COLLECTIONS.expenses, documentId),
    listExpenses: (roomId) => listIndexed(roomId, COLLECTIONS.expenses, 'expenseDocIds'),
    putExpense: (document) => putDocument(transaction, COLLECTIONS.expenses, document),
    getInvite: (documentId) => getDocument(transaction, COLLECTIONS.invites, documentId),
    listInvites: (roomId) => listIndexed(roomId, COLLECTIONS.invites, 'inviteIds'),
    putInvite: (document) => putDocument(transaction, COLLECTIONS.invites, document),
    getMutation: (documentId) => getDocument(transaction, COLLECTIONS.mutations, documentId),
    putMutation: (document) => putDocument(transaction, COLLECTIONS.mutations, document),
  }
}

function readAdapter(database) {
  return {
    getRoom: (roomId) => getDocument(database, COLLECTIONS.rooms, roomId),
    getMember: (documentId) => getDocument(database, COLLECTIONS.members, documentId),
    listMembers: (roomId) => listDocuments(database, COLLECTIONS.members, roomId),
    listParticipants: (roomId) => listDocuments(database, COLLECTIONS.participants, roomId),
    listExpenses: (roomId) => listDocuments(database, COLLECTIONS.expenses, roomId),
    getInvite: (documentId) => getDocument(database, COLLECTIONS.invites, documentId),
    listInvites: (roomId) => listDocuments(database, COLLECTIONS.invites, roomId),
  }
}

function createCloudRepository(database) {
  return {
    async runTransaction(work) {
      const outcome = await database.runTransaction((transaction) => work(transactionAdapter(transaction)))
      return outcome && Object.prototype.hasOwnProperty.call(outcome, 'result') ? outcome.result : outcome
    },
    runRead(work) {
      return work(readAdapter(database))
    },
  }
}

module.exports = { COLLECTIONS, createCloudRepository }
