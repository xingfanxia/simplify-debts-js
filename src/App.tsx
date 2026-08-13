import { useEffect, useId, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import {
  ArrowDownRight,
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  CodeXml,
  Download,
  FileText,
  Image as ImageIcon,
  LockKeyhole,
  Moon,
  PencilLine,
  Plus,
  ReceiptText,
  RotateCcw,
  Save,
  Share2,
  Sun,
  Trash2,
  UsersRound,
  WalletCards,
  X,
} from 'lucide-react'
import { calculateBalances, simplifyDebts } from './lib/debts'
import { createPaymentChartBlob, formatSettlementPlan } from './lib/export'
import { CURRENCIES, type AppState, type Currency, type Expense, type Participant, type Transfer } from './types'

const STORAGE_KEY = 'settle-app-state-v2'
const THEME_STORAGE_KEY = 'settle-theme'

type Theme = 'light' | 'dark'

const EMPTY_STATE: AppState = {
  participants: [],
  expenses: [],
  currency: 'USD',
  roundToWhole: false,
}

const EXAMPLE_STATE: AppState = {
  participants: [
    { id: 'alex', name: 'Alex' },
    { id: 'maya', name: 'Maya' },
    { id: 'theo', name: 'Theo' },
    { id: 'jules', name: 'Jules' },
  ],
  expenses: [
    {
      id: 'dinner',
      description: 'Friday dinner',
      paidBy: 'alex',
      amountCents: 12_640,
      splitWith: ['alex', 'maya', 'theo', 'jules'],
    },
    {
      id: 'groceries',
      description: 'Cabin groceries',
      paidBy: 'maya',
      amountCents: 7_825,
      splitWith: ['alex', 'maya', 'theo', 'jules'],
    },
    {
      id: 'cab',
      description: 'Ride home',
      paidBy: 'theo',
      amountCents: 3_600,
      splitWith: ['alex', 'theo', 'jules'],
    },
  ],
  currency: 'USD',
  roundToWhole: false,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function loadState(): AppState {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return EMPTY_STATE

    const value: unknown = JSON.parse(stored)
    if (!isRecord(value) || !Array.isArray(value.participants) || !Array.isArray(value.expenses)) {
      return EMPTY_STATE
    }

    const participants: Participant[] = value.participants.filter(
      (participant): participant is Participant =>
        isRecord(participant) &&
        typeof participant.id === 'string' &&
        typeof participant.name === 'string' &&
        participant.id.length > 0 &&
        participant.name.trim().length > 0,
    )
    const participantIds = new Set(participants.map(({ id }) => id))
    const expenses: Expense[] = value.expenses.filter(
      (expense): expense is Expense =>
        isRecord(expense) &&
        typeof expense.id === 'string' &&
        typeof expense.description === 'string' &&
        typeof expense.paidBy === 'string' &&
        participantIds.has(expense.paidBy) &&
        typeof expense.amountCents === 'number' &&
        Number.isInteger(expense.amountCents) &&
        expense.amountCents > 0 &&
        Array.isArray(expense.splitWith) &&
        expense.splitWith.every((id) => typeof id === 'string' && participantIds.has(id)),
    )
    const currency = CURRENCIES.includes(value.currency as Currency)
      ? (value.currency as Currency)
      : 'USD'

    return {
      participants,
      expenses,
      currency,
      roundToWhole: value.roundToWhole === true,
    }
  } catch {
    return EMPTY_STATE
  }
}

function loadTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function PersonAvatar({ person, small = false }: { person: Participant; small?: boolean }) {
  const hue = [...person.name].reduce((total, character) => total + character.charCodeAt(0), 0) % 4

  return (
    <span className={`avatar avatar--${hue}${small ? ' avatar--small' : ''}`} aria-hidden="true">
      {initials(person.name)}
    </span>
  )
}

interface SettlementDiagramProps {
  participants: Participant[]
  transfers: Transfer[]
  formatMoney: (amountCents: number) => string
}

function SettlementDiagram({ participants, transfers, formatMoney }: SettlementDiagramProps) {
  const rawMarkerId = useId()
  const markerId = `arrow-${rawMarkerId.replace(/[^a-z0-9]/gi, '')}`
  const centerX = 260
  const centerY = 154
  const radiusX = participants.length <= 2 ? 145 : 196
  const radiusY = participants.length <= 2 ? 0 : 102
  const peopleById = new Map(participants.map((person) => [person.id, person]))
  const positions = new Map(
    participants.map((person, index) => {
      const angle = participants.length <= 2 ? index * Math.PI : (index / participants.length) * Math.PI * 2 - Math.PI / 2
      return [
        person.id,
        {
          x: centerX + Math.cos(angle) * radiusX,
          y: centerY + Math.sin(angle) * radiusY,
        },
      ]
    }),
  )

  return (
    <div className="diagram" aria-label="Settlement relationship diagram">
      <svg viewBox="0 0 520 308" role="img">
        <title>Who pays whom</title>
        <defs>
          <marker id={markerId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" />
          </marker>
        </defs>

        {transfers.map((transfer, index) => {
          const start = positions.get(transfer.from)
          const end = positions.get(transfer.to)
          if (!start || !end) return null

          const dx = end.x - start.x
          const dy = end.y - start.y
          const length = Math.hypot(dx, dy) || 1
          const unitX = dx / length
          const unitY = dy / length
          const from = { x: start.x + unitX * 35, y: start.y + unitY * 35 }
          const to = { x: end.x - unitX * 41, y: end.y - unitY * 41 }
          const curve = transfers.length > 1 ? (index % 2 === 0 ? 11 : -11) : 0
          const control = {
            x: (from.x + to.x) / 2 - unitY * curve,
            y: (from.y + to.y) / 2 + unitX * curve,
          }
          const label = {
            x: (from.x + 2 * control.x + to.x) / 4,
            y: (from.y + 2 * control.y + to.y) / 4,
          }
          const amount = formatMoney(transfer.amountCents)
          const labelWidth = Math.max(54, amount.length * 7.4 + 14)

          return (
            <g key={`${transfer.from}-${transfer.to}`} className="diagram__edge">
              <path
                d={`M ${from.x} ${from.y} Q ${control.x} ${control.y} ${to.x} ${to.y}`}
                markerEnd={`url(#${markerId})`}
              />
              <rect x={label.x - labelWidth / 2} y={label.y - 12} width={labelWidth} height="23" rx="11.5" />
              <text x={label.x} y={label.y + 4}>{amount}</text>
            </g>
          )
        })}

        {participants.map((person) => {
          const position = positions.get(person.id)!
          return (
            <g key={person.id} className="diagram__person" transform={`translate(${position.x} ${position.y})`}>
              <circle r="29" />
              <text y="5" className="diagram__initials">{initials(person.name)}</text>
              <text y="48" className="diagram__name">{person.name}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

interface ExpenseComposerProps {
  participants: Participant[]
  currency: Currency
  editingExpense: Expense | null
  onAdd: (expense: Expense) => void
  onUpdate: (expense: Expense) => void
  onCancelEdit: () => void
}

function ExpenseComposer({
  participants,
  currency,
  editingExpense,
  onAdd,
  onUpdate,
  onCancelEdit,
}: ExpenseComposerProps) {
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState(participants[0]?.id ?? '')
  const [splitMode, setSplitMode] = useState<'everyone' | 'custom'>('everyone')
  const [selectedIds, setSelectedIds] = useState<string[]>(participants.map(({ id }) => id))
  const [error, setError] = useState('')

  function resetComposer() {
    setDescription('')
    setAmount('')
    setPaidBy(participants[0]?.id ?? '')
    setSplitMode('everyone')
    setSelectedIds(participants.map(({ id }) => id))
    setError('')
  }

  useEffect(() => {
    if (!editingExpense) return

    const includesEveryone =
      editingExpense.splitWith.length === participants.length &&
      participants.every(({ id }) => editingExpense.splitWith.includes(id))
    setDescription(editingExpense.description)
    setAmount((editingExpense.amountCents / 100).toFixed(2))
    setPaidBy(editingExpense.paidBy)
    setSplitMode(includesEveryone ? 'everyone' : 'custom')
    setSelectedIds(editingExpense.splitWith)
    setError('')
  }, [editingExpense, participants])

  useEffect(() => {
    if (!participants.some(({ id }) => id === paidBy)) {
      setPaidBy(participants[0]?.id ?? '')
    }
    setSelectedIds((current) => {
      const currentIds = current.filter((id) => participants.some((person) => person.id === id))
      return currentIds.length > 0 ? currentIds : participants.map(({ id }) => id)
    })
  }, [participants, paidBy])

  function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsedAmount = Number(amount)
    const amountCents = Math.round(parsedAmount * 100)
    const splitWith = splitMode === 'everyone' ? participants.map(({ id }) => id) : selectedIds

    if (participants.length < 2) {
      setError('Add at least two people before logging an expense.')
      return
    }
    if (!paidBy) {
      setError('Choose who paid for this expense.')
      return
    }
    if (!Number.isFinite(parsedAmount) || !Number.isSafeInteger(amountCents)) {
      setError('Enter a valid amount.')
      return
    }
    if (amountCents <= 0) {
      setError('Enter an amount greater than zero.')
      return
    }
    if (splitWith.length === 0) {
      setError('Choose at least one person to share this expense.')
      return
    }

    const expense = {
      id: editingExpense?.id ?? makeId('expense'),
      description: description.trim() || 'Shared expense',
      paidBy,
      amountCents,
      splitWith,
    }

    if (editingExpense) {
      onUpdate(expense)
    } else {
      onAdd(expense)
    }
    resetComposer()
  }

  function toggleParticipant(participantId: string) {
    setSelectedIds((current) =>
      current.includes(participantId)
        ? current.filter((id) => id !== participantId)
        : [...current, participantId],
    )
  }

  return (
    <form
      id="expense-composer"
      className={editingExpense ? 'expense-composer is-editing' : 'expense-composer'}
      onSubmit={submitExpense}
    >
      {editingExpense && (
        <div className="edit-notice" role="status">
          <PencilLine size={16} aria-hidden="true" />
          <span>Editing <strong>{editingExpense.description}</strong></span>
          <button
            type="button"
            onClick={() => {
              resetComposer()
              onCancelEdit()
            }}
          >
            Cancel
          </button>
        </div>
      )}
      <div className="field-grid">
        <label className="field field--description">
          <span>What was it?</span>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Dinner, tickets, cabin…"
            autoComplete="off"
          />
        </label>
        <label className="field field--amount">
          <span>Amount</span>
          <div className="money-input">
            <span>{currency}</span>
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="0.00"
            />
          </div>
        </label>
      </div>

      <div className="field-grid field-grid--split">
        <label className="field">
          <span>Paid by</span>
          <select value={paidBy} onChange={(event) => setPaidBy(event.target.value)} disabled={participants.length === 0}>
            {participants.length === 0 && <option value="">Add people first</option>}
            {participants.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
        </label>
        <fieldset className="field split-field">
          <legend>Split between</legend>
          <div className="segmented-control">
            <button
              type="button"
              className={splitMode === 'everyone' ? 'is-active' : ''}
              onClick={() => setSplitMode('everyone')}
              aria-pressed={splitMode === 'everyone'}
            >
              Everyone
            </button>
            <button
              type="button"
              className={splitMode === 'custom' ? 'is-active' : ''}
              onClick={() => setSplitMode('custom')}
              aria-pressed={splitMode === 'custom'}
            >
              Choose people
            </button>
          </div>
        </fieldset>
      </div>

      {splitMode === 'custom' && (
        <div className="split-people" aria-label="People sharing this expense">
          {participants.map((person) => {
            const selected = selectedIds.includes(person.id)
            return (
              <button
                key={person.id}
                type="button"
                className={selected ? 'split-person is-selected' : 'split-person'}
                onClick={() => toggleParticipant(person.id)}
                aria-pressed={selected}
              >
                <span className="split-person__check">{selected && <Check size={13} strokeWidth={3} />}</span>
                {person.name}
              </button>
            )
          })}
        </div>
      )}

      <div className="composer-footer">
        <p className="form-error" role="alert">{error}</p>
        <div className="composer-actions">
          {editingExpense && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                resetComposer()
                onCancelEdit()
              }}
            >
              Cancel
            </button>
          )}
          <button className="primary-button" type="submit">
            {editingExpense ? <Save size={17} /> : <Plus size={18} strokeWidth={2.5} />}
            {editingExpense ? 'Save changes' : 'Add expense'}
          </button>
        </div>
      </div>
    </form>
  )
}

export default function App() {
  const [state, setState] = useState<AppState>(loadState)
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const [nameInput, setNameInput] = useState('')
  const [peopleError, setPeopleError] = useState('')
  const [exportNotice, setExportNotice] = useState('')
  const [exportBusy, setExportBusy] = useState(false)
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    document.querySelector<HTMLMetaElement>('#theme-color')?.setAttribute(
      'content',
      theme === 'dark' ? '#101511' : '#f4f1e8',
    )
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  const peopleById = useMemo(
    () => new Map(state.participants.map((person) => [person.id, person])),
    [state.participants],
  )
  const editingExpense = state.expenses.find(({ id }) => id === editingExpenseId) ?? null
  const transfers = useMemo(
    () => simplifyDebts(state.participants, state.expenses, state.roundToWhole),
    [state.participants, state.expenses, state.roundToWhole],
  )
  const balances = useMemo(
    () => calculateBalances(state.participants, state.expenses),
    [state.participants, state.expenses],
  )
  const formatter = useMemo(
    () => new Intl.NumberFormat(undefined, { style: 'currency', currency: state.currency }),
    [state.currency],
  )
  const formatMoney = (amountCents: number) => formatter.format(amountCents / 100)
  const totalSpend = state.expenses.reduce((sum, expense) => sum + expense.amountCents, 0)
  const activeParticipants = state.participants.filter(
    ({ id }) => (balances.get(id) ?? 0) !== 0 || transfers.some(({ from, to }) => from === id || to === id),
  )

  function addPeople(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const names = nameInput
      .split(',')
      .map((name) => name.trim().replace(/\s+/g, ' '))
      .filter(Boolean)
    const existingNames = new Set(state.participants.map(({ name }) => name.toLocaleLowerCase()))
    const uniqueNames = names.filter((name, index) =>
      !existingNames.has(name.toLocaleLowerCase()) &&
      names.findIndex((candidate) => candidate.toLocaleLowerCase() === name.toLocaleLowerCase()) === index,
    )

    if (uniqueNames.length === 0) {
      setPeopleError(names.length === 0 ? 'Type at least one name.' : 'Those people are already in the group.')
      return
    }

    setState((current) => ({
      ...current,
      participants: [
        ...current.participants,
        ...uniqueNames.map((name) => ({ id: makeId('person'), name })),
      ],
    }))
    setNameInput('')
    setPeopleError('')
  }

  function removePerson(person: Participant) {
    const isUsed = state.expenses.some(
      (expense) => expense.paidBy === person.id || expense.splitWith.includes(person.id),
    )
    if (isUsed) {
      setPeopleError(`Remove ${person.name} from their expenses before removing them from the group.`)
      return
    }
    setState((current) => ({
      ...current,
      participants: current.participants.filter(({ id }) => id !== person.id),
    }))
    setPeopleError('')
  }

  function addExpense(expense: Expense) {
    setState((current) => ({ ...current, expenses: [expense, ...current.expenses] }))
  }

  function updateExpense(expense: Expense) {
    setState((current) => ({
      ...current,
      expenses: current.expenses.map((currentExpense) =>
        currentExpense.id === expense.id ? expense : currentExpense,
      ),
    }))
    setEditingExpenseId(null)
  }

  function editExpense(expenseId: string) {
    setEditingExpenseId(expenseId)
    window.requestAnimationFrame(() => {
      document.querySelector('#expense-composer')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  function removeExpense(expenseId: string) {
    setState((current) => ({
      ...current,
      expenses: current.expenses.filter(({ id }) => id !== expenseId),
    }))
    if (editingExpenseId === expenseId) setEditingExpenseId(null)
  }

  function resetApp() {
    if (state.participants.length > 0 && !window.confirm('Clear everyone and every expense? This cannot be undone.')) return
    setState(EMPTY_STATE)
    setNameInput('')
    setPeopleError('')
    setEditingExpenseId(null)
  }

  function plainTextPlan(): string {
    return formatSettlementPlan({
      participants: state.participants,
      transfers,
      formatMoney,
    })
  }

  function closeExportMenu() {
    document.querySelector<HTMLDetailsElement>('.export-menu')?.removeAttribute('open')
  }

  function showExportNotice(message: string) {
    setExportNotice(message)
    window.setTimeout(() => setExportNotice(''), 2200)
  }

  async function copyPlan() {
    const plan = plainTextPlan()
    const copyWithTextArea = () => {
      const textArea = document.createElement('textarea')
      textArea.value = plan
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      textArea.remove()
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(plan)
      } else {
        copyWithTextArea()
      }
    } catch {
      copyWithTextArea()
    }
    closeExportMenu()
    showExportNotice('Text copied')
  }

  async function paymentChartBlob(): Promise<Blob> {
    return createPaymentChartBlob({
      participants: activeParticipants,
      transfers,
      theme,
      currency: state.currency,
      formatMoney,
    })
  }

  async function copyPaymentChart() {
    setExportBusy(true)
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        throw new Error('Image clipboard is unavailable')
      }
      const blob = await paymentChartBlob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      closeExportMenu()
      showExportNotice('Chart copied')
    } catch {
      closeExportMenu()
      showExportNotice('Use Download PNG in this browser')
    } finally {
      setExportBusy(false)
    }
  }

  async function downloadPaymentChart() {
    setExportBusy(true)
    try {
      const blob = await paymentChartBlob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = 'settle-payment-plan.png'
      link.click()
      URL.revokeObjectURL(objectUrl)
      closeExportMenu()
      showExportNotice('PNG downloaded')
    } catch {
      closeExportMenu()
      showExportNotice('Could not create the chart')
    } finally {
      setExportBusy(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Settle home">
          <span className="brand__mark" aria-hidden="true"><ArrowRight size={21} strokeWidth={3} /></span>
          <span>Settle</span>
        </a>
        <div className="topbar__actions">
          <span className="privacy-note"><LockKeyhole size={14} /> Stays on this device</span>
          <label className="currency-picker">
            <span className="sr-only">Currency</span>
            <select
              value={state.currency}
              onChange={(event) => setState((current) => ({ ...current, currency: event.target.value as Currency }))}
            >
              {CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}
            </select>
          </label>
          <button
            className="icon-button theme-button"
            type="button"
            onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          >
            {theme === 'light' ? <Moon size={17} /> : <Sun size={18} />}
          </button>
          <button className="icon-button" type="button" onClick={resetApp} aria-label="Start over" title="Start over">
            <RotateCcw size={17} />
          </button>
        </div>
      </header>

      <main id="top">
        <section className="intro" aria-labelledby="page-title">
          <div>
            <p className="eyebrow"><span /> The shortest path to even</p>
            <h1 id="page-title">One group tab.<br /><em>Zero awkward math.</em></h1>
          </div>
          <p className="intro__copy">
            Add who came and what they paid. Settle turns the whole tangle into a clean, compact repayment plan.
          </p>
        </section>

        <div className="workspace">
          <div className="workspace__input">
            <section className="panel people-panel" aria-labelledby="people-title">
              <div className="section-heading">
                <div className="step-number">01</div>
                <div>
                  <h2 id="people-title">Who’s in?</h2>
                  <p>Add names one at a time or paste a comma-separated list.</p>
                </div>
              </div>

              <form className="people-form" onSubmit={addPeople}>
                <label className="sr-only" htmlFor="people-input">Names</label>
                <UsersRound size={19} aria-hidden="true" />
                <input
                  id="people-input"
                  value={nameInput}
                  onChange={(event) => setNameInput(event.target.value)}
                  placeholder="Alex, Maya, Theo…"
                  autoComplete="off"
                />
                <button type="submit"><Plus size={18} /> Add</button>
              </form>
              <p className="form-error people-error" role="alert">{peopleError}</p>

              {state.participants.length > 0 ? (
                <div className="people-list" aria-label="Group members">
                  {state.participants.map((person) => (
                    <div className="person-chip" key={person.id}>
                      <PersonAvatar person={person} small />
                      <span>{person.name}</span>
                      <button type="button" onClick={() => removePerson(person)} aria-label={`Remove ${person.name}`}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="inline-empty">
                  <span>No one here yet.</span>
                  <button type="button" onClick={() => setState(EXAMPLE_STATE)}>Try an example</button>
                </div>
              )}
            </section>

            <section className="panel expenses-panel" aria-labelledby="expense-title">
              <div className="section-heading">
                <div className="step-number">02</div>
                <div>
                  <h2 id="expense-title">What was paid?</h2>
                  <p>Log each shared expense. We’ll do the balancing as you go.</p>
                </div>
              </div>

              <ExpenseComposer
                participants={state.participants}
                currency={state.currency}
                editingExpense={editingExpense}
                onAdd={addExpense}
                onUpdate={updateExpense}
                onCancelEdit={() => setEditingExpenseId(null)}
              />

              {state.expenses.length > 0 && (
                <div className="expense-history">
                  <div className="subheading">
                    <span>Activity</span>
                    <span>{state.expenses.length} {state.expenses.length === 1 ? 'expense' : 'expenses'}</span>
                  </div>
                  <div className="expense-list">
                    {state.expenses.map((expense) => {
                      const payer = peopleById.get(expense.paidBy)
                      const splitNames = expense.splitWith
                        .map((id) => peopleById.get(id)?.name)
                        .filter(Boolean)
                      const isEveryone = expense.splitWith.length === state.participants.length

                      return (
                        <article
                          className={editingExpenseId === expense.id ? 'expense-row is-editing' : 'expense-row'}
                          key={expense.id}
                        >
                          <div className="expense-row__icon"><ReceiptText size={18} /></div>
                          <div className="expense-row__body">
                            <strong>{expense.description}</strong>
                            <span>{payer?.name} paid · {isEveryone ? 'split with everyone' : `split with ${splitNames.join(', ')}`}</span>
                          </div>
                          <strong className="expense-row__amount">{formatMoney(expense.amountCents)}</strong>
                          <div className="expense-row__actions">
                            <button type="button" onClick={() => editExpense(expense.id)} aria-label={`Edit ${expense.description}`}>
                              <PencilLine size={16} />
                            </button>
                            <button type="button" onClick={() => removeExpense(expense.id)} aria-label={`Remove ${expense.description}`}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </div>
              )}
            </section>
          </div>

          <aside className="settlement-column" aria-labelledby="settlement-title">
            <section className="settlement-card">
              <div className="settlement-card__header">
                <div>
                  <p className="eyebrow eyebrow--small">Live result</p>
                  <h2 id="settlement-title">Settlement plan</h2>
                </div>
                {transfers.length > 0 && (
                  <details className="export-menu">
                    <summary className="export-button">
                      {exportNotice ? <Check size={15} /> : <Share2 size={15} />}
                      <span aria-live="polite">{exportNotice || 'Export'}</span>
                      {!exportNotice && <ChevronDown size={14} className="export-button__chevron" />}
                    </summary>
                    <div className="export-menu__popover">
                      <p>Share settlement</p>
                      <button type="button" onClick={copyPlan} disabled={exportBusy}>
                        <span><FileText size={17} /></span>
                        <span><strong>Copy text</strong><small>Names, arrows, amounts</small></span>
                        <Copy size={14} />
                      </button>
                      <button type="button" onClick={copyPaymentChart} disabled={exportBusy}>
                        <span><ImageIcon size={17} /></span>
                        <span><strong>Copy chart</strong><small>Paste a high-res image</small></span>
                        <Copy size={14} />
                      </button>
                      <button type="button" onClick={downloadPaymentChart} disabled={exportBusy}>
                        <span><Download size={17} /></span>
                        <span><strong>Download PNG</strong><small>Save the payment graph</small></span>
                        <Download size={14} />
                      </button>
                    </div>
                  </details>
                )}
              </div>

              {state.expenses.length === 0 ? (
                <div className="result-empty">
                  <div className="result-empty__visual" aria-hidden="true">
                    <span>A</span><ArrowRight /><span>B</span>
                  </div>
                  <h3>Your clean slate starts here.</h3>
                  <p>Add at least two people and one expense. The repayment plan will appear automatically.</p>
                </div>
              ) : transfers.length === 0 ? (
                <div className="result-empty result-empty--balanced">
                  <div className="balance-seal"><Check size={30} strokeWidth={2.5} /></div>
                  <h3>You’re already even.</h3>
                  <p>No one owes anyone. That’s the best kind of settlement plan.</p>
                </div>
              ) : (
                <>
                  <div className="summary-strip">
                    <div><span>Total spend</span><strong>{formatMoney(totalSpend)}</strong></div>
                    <div><span>Repayments</span><strong>{transfers.length}</strong></div>
                    <div><span>People</span><strong>{state.participants.length}</strong></div>
                  </div>

                  <SettlementDiagram
                    participants={activeParticipants}
                    transfers={transfers}
                    formatMoney={formatMoney}
                  />

                  <div className="transfer-list">
                    {transfers.map((transfer, index) => {
                      const from = peopleById.get(transfer.from)!
                      const to = peopleById.get(transfer.to)!
                      return (
                        <div className="transfer-row" key={`${transfer.from}-${transfer.to}`} style={{ '--delay': `${index * 70}ms` } as CSSProperties}>
                          <PersonAvatar person={from} small />
                          <div className="transfer-row__sentence">
                            <span><strong>{from.name}</strong><b aria-hidden="true">→</b><strong>{to.name}</strong></span>
                            <small>One payment, then you’re square</small>
                          </div>
                          <ArrowDownRight size={17} aria-hidden="true" />
                          <strong className="transfer-row__amount">{formatMoney(transfer.amountCents)}</strong>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}

              <div className="rounding-control">
                <div>
                  <strong>Whole-number repayments</strong>
                  <span>Round fairly while keeping the ledger balanced.</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={state.roundToWhole}
                  className={state.roundToWhole ? 'switch is-on' : 'switch'}
                  onClick={() => setState((current) => ({ ...current, roundToWhole: !current.roundToWhole }))}
                >
                  <span />
                </button>
              </div>
            </section>

            <details className="method-note">
              <summary><WalletCards size={17} /> How the math works <Plus size={16} className="method-note__plus" /></summary>
              <p>Settle nets what each person paid against their share, then matches the largest balances. The result needs at most one fewer repayment than there are people—and every cent remains accounted for.</p>
            </details>
          </aside>
        </div>
      </main>

      <footer>
        <div>
          <span className="brand brand--footer"><span className="brand__mark"><ArrowRight size={17} strokeWidth={3} /></span>Settle</span>
          <p>Shared expenses, minus the spreadsheet.</p>
        </div>
        <a href="https://github.com/xingfanxia/simplify-debts-js" target="_blank" rel="noreferrer">
          <CodeXml size={17} /> View source
        </a>
      </footer>
    </div>
  )
}
