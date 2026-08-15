function distributeCents(amountCents, count) {
  const baseShare = Math.floor(amountCents / count)
  const remainder = amountCents % count
  return Array.from({ length: count }, (_, index) => baseShare + (index < remainder ? 1 : 0))
}

export function calculateBalances(participants, expenses) {
  const participantIds = new Set(participants.map(({ id }) => id))
  const balances = new Map(participants.map(({ id }) => [id, 0]))

  expenses.forEach((expense) => {
    if (!participantIds.has(expense.paidBy) || !Number.isSafeInteger(expense.amountCents) || expense.amountCents <= 0) return
    const splitWith = [...new Set(expense.splitWith)].filter((id) => participantIds.has(id))
    if (splitWith.length === 0) return

    balances.set(expense.paidBy, (balances.get(expense.paidBy) || 0) + expense.amountCents)
    distributeCents(expense.amountCents, splitWith.length).forEach((share, index) => {
      const participantId = splitWith[index]
      balances.set(participantId, (balances.get(participantId) || 0) - share)
    })
  })

  return balances
}

export function roundBalancesToWholeUnits(balances, unit = 100) {
  const rounded = new Map([...balances].map(([participantId, balance]) => [participantId, Math.round(balance / unit) * unit]))
  const discrepancy = [...rounded.values()].reduce((sum, balance) => sum + balance, 0)
  if (discrepancy === 0) return rounded

  const direction = discrepancy > 0 ? -unit : unit
  const corrections = Math.abs(discrepancy / unit)
  const candidates = [...balances.keys()].sort((leftId, rightId) => {
    const leftError = (rounded.get(leftId) || 0) - (balances.get(leftId) || 0)
    const rightError = (rounded.get(rightId) || 0) - (balances.get(rightId) || 0)
    return discrepancy > 0 ? rightError - leftError : leftError - rightError
  })

  for (let index = 0; index < corrections; index += 1) {
    const participantId = candidates[index % candidates.length]
    rounded.set(participantId, (rounded.get(participantId) || 0) + direction)
  }
  return rounded
}

export function simplifyBalances(balances) {
  const debtors = [...balances]
    .filter(([, balance]) => balance < 0)
    .map(([id, balance]) => ({ id, amount: -balance }))
    .sort((left, right) => right.amount - left.amount)
  const creditors = [...balances]
    .filter(([, balance]) => balance > 0)
    .map(([id, balance]) => ({ id, amount: balance }))
    .sort((left, right) => right.amount - left.amount)
  const transfers = []
  let debtorIndex = 0
  let creditorIndex = 0

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex]
    const creditor = creditors[creditorIndex]
    const amountCents = Math.min(debtor.amount, creditor.amount)
    if (amountCents > 0) transfers.push({ from: debtor.id, to: creditor.id, amountCents })
    debtor.amount -= amountCents
    creditor.amount -= amountCents
    if (debtor.amount === 0) debtorIndex += 1
    if (creditor.amount === 0) creditorIndex += 1
  }
  return transfers
}

export function simplifyDebts(participants, expenses, roundToWhole = false, wholeUnit = 100) {
  const balances = calculateBalances(participants, expenses)
  return simplifyBalances(roundToWhole ? roundBalancesToWholeUnits(balances, wholeUnit) : balances)
}
