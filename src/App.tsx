import { useEffect, useId, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { Clipboard as NativeClipboard } from '@capacitor/clipboard'
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import {
  ArrowDownRight,
  ArrowRight,
  BookmarkPlus,
  CalendarDays,
  Check,
  ChevronDown,
  Copy,
  CodeXml,
  Download,
  FileText,
  FolderOpen,
  Globe2,
  History as HistoryIcon,
  Image as ImageIcon,
  LockKeyhole,
  Moon,
  PencilLine,
  Plus,
  ReceiptText,
  RotateCcw,
  Save,
  Share2,
  Smartphone,
  Sun,
  Trash2,
  UsersRound,
  WalletCards,
  X,
} from 'lucide-react'
import { calculateBalances, simplifyDebts } from './lib/debts'
import { createPaymentChartBlob, formatSettlementPlan } from './lib/export'
import {
  detectCurrency,
  LANGUAGE_OPTIONS,
  localeForLanguage,
  resolveLanguage,
  translate,
  type CurrencyPreference,
  type LanguagePreference,
  type MessageKey,
} from './lib/i18n'
import {
  createHistoryEntry,
  EMPTY_STATE,
  loadCurrentState,
  loadHistory,
  saveCurrentState,
  saveHistory,
} from './lib/storage'
import { CURRENCIES, type AppState, type Currency, type Expense, type HistoryEntry, type Participant, type Transfer } from './types'

const THEME_STORAGE_KEY = 'settle-theme'
const LANGUAGE_STORAGE_KEY = 'settle-language'
const CURRENCY_STORAGE_KEY = 'settle-currency-preference'
const IS_NATIVE = Capacitor.isNativePlatform()
const TESTFLIGHT_URL = 'https://testflight.apple.com/join/TAdQsckK'
const ANDROID_APK_URL = 'https://github.com/xingfanxia/simplify-debts-js/releases/download/v2.0.3/app-release.apk'

type Theme = 'light' | 'dark'
type Translate = (key: MessageKey, replacements?: Record<string, string | number>) => string

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

function loadTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

function loadLanguagePreference(): LanguagePreference {
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
  return LANGUAGE_OPTIONS.some(({ value }) => value === stored)
    ? stored as LanguagePreference
    : 'system'
}

function loadCurrencyPreference(): CurrencyPreference {
  const stored = window.localStorage.getItem(CURRENCY_STORAGE_KEY)
  return stored === 'auto' || CURRENCIES.includes(stored as Currency)
    ? stored as CurrencyPreference
    : 'auto'
}

function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('Could not encode image'))
    reader.onerror = () => reject(reader.error ?? new Error('Could not encode image'))
    reader.readAsDataURL(blob)
  })
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
  t: Translate
}

function SettlementDiagram({ participants, transfers, formatMoney, t }: SettlementDiagramProps) {
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
    <div className="diagram" aria-label={t('diagramAria')}>
      <svg viewBox="0 0 520 308" role="img">
        <title>{t('diagramTitle')}</title>
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
  t: Translate
}

function ExpenseComposer({
  participants,
  currency,
  editingExpense,
  onAdd,
  onUpdate,
  onCancelEdit,
  t,
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
      setError(t('addTwoPeopleError'))
      return
    }
    if (!paidBy) {
      setError(t('choosePayerError'))
      return
    }
    if (!Number.isFinite(parsedAmount) || !Number.isSafeInteger(amountCents)) {
      setError(t('validAmountError'))
      return
    }
    if (amountCents <= 0) {
      setError(t('positiveAmountError'))
      return
    }
    if (splitWith.length === 0) {
      setError(t('chooseShareError'))
      return
    }

    const expense = {
      id: editingExpense?.id ?? makeId('expense'),
      description: description.trim() || t('sharedExpense'),
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
          <span>{t('editing')} <strong>{editingExpense.description}</strong></span>
          <button
            type="button"
            onClick={() => {
              resetComposer()
              onCancelEdit()
            }}
          >
            {t('cancel')}
          </button>
        </div>
      )}
      <div className="field-grid">
        <label className="field field--description">
          <span>{t('whatWasIt')}</span>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t('descriptionPlaceholder')}
            autoComplete="off"
          />
        </label>
        <label className="field field--amount">
          <span>{t('amount')}</span>
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
          <span>{t('paidBy')}</span>
          <select value={paidBy} onChange={(event) => setPaidBy(event.target.value)} disabled={participants.length === 0}>
            {participants.length === 0 && <option value="">{t('addPeopleFirst')}</option>}
            {participants.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
        </label>
        <fieldset className="field split-field">
          <legend>{t('splitBetween')}</legend>
          <div className="segmented-control">
            <button
              type="button"
              className={splitMode === 'everyone' ? 'is-active' : ''}
              onClick={() => setSplitMode('everyone')}
              aria-pressed={splitMode === 'everyone'}
            >
              {t('everyone')}
            </button>
            <button
              type="button"
              className={splitMode === 'custom' ? 'is-active' : ''}
              onClick={() => setSplitMode('custom')}
              aria-pressed={splitMode === 'custom'}
            >
              {t('choosePeople')}
            </button>
          </div>
        </fieldset>
      </div>

      {splitMode === 'custom' && (
        <div className="split-people" aria-label={t('sharingAria')}>
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
              {t('cancel')}
            </button>
          )}
          <button className="primary-button" type="submit">
            {editingExpense ? <Save size={17} /> : <Plus size={18} strokeWidth={2.5} />}
            {editingExpense ? t('saveChanges') : t('addExpense')}
          </button>
        </div>
      </div>
    </form>
  )
}

interface HistoryDrawerProps {
  entries: HistoryEntry[]
  currentState: AppState
  notice: string
  onClose: () => void
  onDelete: (entry: HistoryEntry) => void
  onOpen: (entry: HistoryEntry) => void
  onSave: (title: string) => boolean
  locale: string
  t: Translate
}

function suggestedHistoryTitle(state: AppState, t: Translate): string {
  const firstExpense = state.expenses[0]?.description.trim()
  if (!firstExpense) return ''
  const remainder = state.expenses.length - 1
  return remainder > 0 ? t('historyMore', { title: firstExpense, count: remainder }) : firstExpense
}

function historyEntryTotal(entry: HistoryEntry): number {
  return entry.state.expenses.reduce((sum, expense) => sum + expense.amountCents, 0)
}

function HistoryDrawer({
  entries,
  currentState,
  notice,
  onClose,
  onDelete,
  onOpen,
  onSave,
  locale,
  t,
}: HistoryDrawerProps) {
  const [title, setTitle] = useState(() => suggestedHistoryTitle(currentState, t))
  const hasCurrentPlan = currentState.expenses.length > 0

  function submitHistory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fallback = t('settlementFallback', {
      date: new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(new Date()),
    })
    if (onSave(title.trim() || fallback)) setTitle('')
  }

  return (
    <div className="history-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="history-drawer" role="dialog" aria-modal="true" aria-labelledby="history-title">
        <header className="history-drawer__header">
          <div>
            <p className="eyebrow eyebrow--small"><span /> {t('onThisDevice')}</p>
            <h2 id="history-title">{t('savedSettlements')}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={t('closeHistory')}><X size={19} /></button>
        </header>

        <form className="history-save" onSubmit={submitHistory}>
          <div className="history-save__icon"><BookmarkPlus size={20} /></div>
          <div className="history-save__copy">
            <strong>{t('saveSettlement')}</strong>
            <span>{t('saveSettlementHelp')}</span>
          </div>
          <label>
            <span className="sr-only">{t('settlementName')}</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t('historyPlaceholder')}
              maxLength={80}
              disabled={!hasCurrentPlan}
            />
          </label>
          <button className="primary-button" type="submit" disabled={!hasCurrentPlan}>
            <BookmarkPlus size={17} /> {t('saveLocally')}
          </button>
          {!hasCurrentPlan && <p>{t('addExpenseBeforeSave')}</p>}
          <span className="history-notice" role="status">{notice}</span>
        </form>

        <section className="history-library" aria-labelledby="history-library-title">
          <div className="history-library__heading">
            <h3 id="history-library-title">{t('history')}</h3>
            <span>{t('savedCounter', { count: entries.length })}</span>
          </div>

          {entries.length === 0 ? (
            <div className="history-empty">
              <HistoryIcon size={24} />
              <strong>{t('noSavedTitle')}</strong>
              <p>{t('noSavedBody')}</p>
            </div>
          ) : (
            <div className="history-list">
              {entries.map((entry) => {
                const formatter = new Intl.NumberFormat(locale, {
                  style: 'currency',
                  currency: entry.state.currency,
                })
                return (
                  <article className="history-entry" key={entry.id}>
                    <div className="history-entry__topline">
                      <div className="history-entry__date"><CalendarDays size={13} /> {new Intl.DateTimeFormat(locale, {
                        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
                      }).format(new Date(entry.savedAt))}</div>
                      <button type="button" onClick={() => onDelete(entry)} aria-label={t('deleteLabel', { title: entry.title })}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <h4>{entry.title}</h4>
                    <div className="history-entry__stats">
                      <strong>{formatter.format(historyEntryTotal(entry) / 100)}</strong>
                      <span>{t('peopleCount', { count: entry.state.participants.length })}</span>
                      <span>{t(entry.state.expenses.length === 1 ? 'expenseOne' : 'expenseMany', { count: entry.state.expenses.length })}</span>
                    </div>
                    <div className="history-entry__footer">
                      <div className="history-entry__people" aria-label={entry.state.participants.map(({ name }) => name).join(', ')}>
                        {entry.state.participants.slice(0, 5).map((person) => <PersonAvatar key={person.id} person={person} small />)}
                        {entry.state.participants.length > 5 && <span>+{entry.state.participants.length - 5}</span>}
                      </div>
                      <button className="history-open-button" type="button" onClick={() => onOpen(entry)}>
                        <FolderOpen size={15} /> {t('openPlan')}
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <p className="history-privacy"><LockKeyhole size={13} /> {t('historyPrivacy')}</p>
      </aside>
    </div>
  )
}

export default function App() {
  const [state, setState] = useState<AppState>(loadCurrentState)
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>(loadHistory)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyNotice, setHistoryNotice] = useState('')
  const [completionNotice, setCompletionNotice] = useState('')
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const [languagePreference, setLanguagePreference] = useState<LanguagePreference>(loadLanguagePreference)
  const [currencyPreference, setCurrencyPreference] = useState<CurrencyPreference>(loadCurrencyPreference)
  const [nameInput, setNameInput] = useState('')
  const [peopleError, setPeopleError] = useState('')
  const [exportNotice, setExportNotice] = useState('')
  const [exportBusy, setExportBusy] = useState(false)
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null)
  const [systemLocale, setSystemLocale] = useState(() => navigator.languages[0] ?? navigator.language ?? 'en-US')
  const language = resolveLanguage(languagePreference, systemLocale)
  const locale = languagePreference === 'system' ? systemLocale : localeForLanguage(language)
  const automaticCurrency = detectCurrency(systemLocale)
  const t = useMemo<Translate>(
    () => (key, replacements) => translate(language, key, replacements),
    [language],
  )
  const localizedExampleState = useMemo<AppState>(() => ({
    ...EXAMPLE_STATE,
    expenses: EXAMPLE_STATE.expenses.map((expense) => ({
      ...expense,
      description: ({
        dinner: t('exampleDinner'),
        groceries: t('exampleGroceries'),
        cab: t('exampleRide'),
      } as Record<string, string>)[expense.id] ?? expense.description,
    })),
  }), [t])

  useEffect(() => {
    const followSystemLocale = () => setSystemLocale(navigator.languages[0] ?? navigator.language ?? 'en-US')
    window.addEventListener('languagechange', followSystemLocale)
    return () => window.removeEventListener('languagechange', followSystemLocale)
  }, [])

  useEffect(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, languagePreference)
    document.documentElement.lang = locale
  }, [languagePreference, locale])

  useEffect(() => {
    window.localStorage.setItem(CURRENCY_STORAGE_KEY, currencyPreference)
    const currency = currencyPreference === 'auto' ? automaticCurrency : currencyPreference
    setState((current) => current.currency === currency ? current : { ...current, currency })
  }, [automaticCurrency, currencyPreference])

  useEffect(() => {
    try {
      saveCurrentState(state)
    } catch {
      // The active workspace continues to work even when device storage is unavailable.
    }
  }, [state])

  useEffect(() => {
    if (!historyOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHistoryOpen(false)
    }
    document.body.classList.add('has-modal')
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.classList.remove('has-modal')
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [historyOpen])

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
    () => new Intl.NumberFormat(locale, { style: 'currency', currency: state.currency }),
    [locale, state.currency],
  )
  const formatMoney = (amountCents: number) => formatter.format(amountCents / 100)
  const totalSpend = state.expenses.reduce((sum, expense) => sum + expense.amountCents, 0)
  const activeParticipants = state.participants.filter(
    ({ id }) => (balances.get(id) ?? 0) !== 0 || transfers.some(({ from, to }) => from === id || to === id),
  )
  const languageCode = ({ en: 'EN', 'zh-CN': '简', 'zh-TW': '繁', ja: '日', ko: '한', es: 'ES' } as const)[language]

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
      setPeopleError(names.length === 0 ? t('typeNameError') : t('duplicateNameError'))
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
      setPeopleError(t('removePersonError', { name: person.name }))
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

  function clearWorkspace() {
    setState((current) => ({
      ...EMPTY_STATE,
      currency: current.currency,
      roundToWhole: current.roundToWhole,
    }))
    setNameInput('')
    setPeopleError('')
    setEditingExpenseId(null)
  }

  function resetApp() {
    if (state.participants.length > 0 && !window.confirm(t('resetConfirm'))) return
    clearWorkspace()
  }

  function saveCurrentToHistory(title: string): boolean {
    if (state.expenses.length === 0) return false
    const entry = createHistoryEntry(state, title)
    const nextEntries = [entry, ...historyEntries].slice(0, 50)
    try {
      saveHistory(nextEntries)
      setHistoryEntries(nextEntries)
      setHistoryNotice(t('savedOnDevice'))
      window.setTimeout(() => setHistoryNotice(''), 2200)
      return true
    } catch {
      setHistoryNotice(t('storageAccessError'))
      return false
    }
  }

  function saveAndStartNew() {
    const fallback = t('settlementFallback', {
      date: new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(new Date()),
    })
    const title = suggestedHistoryTitle(state, t) || fallback
    if (!saveCurrentToHistory(title)) return

    clearWorkspace()
    setCompletionNotice(t('savedAndStartedNew', { title }))
    window.setTimeout(() => setCompletionNotice(''), 4200)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function openHistoryEntry(entry: HistoryEntry) {
    if (
      state.expenses.length > 0 &&
      !window.confirm(t('openHistoryConfirm', { title: entry.title }))
    ) return

    setState(structuredClone(entry.state))
    setEditingExpenseId(null)
    setHistoryOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function deleteHistoryEntry(entry: HistoryEntry) {
    if (!window.confirm(t('deleteHistoryConfirm', { title: entry.title }))) return
    const nextEntries = historyEntries.filter(({ id }) => id !== entry.id)
    try {
      saveHistory(nextEntries)
      setHistoryEntries(nextEntries)
      setHistoryNotice(t('deleted'))
    } catch {
      setHistoryNotice(t('storageUpdateError'))
    }
  }

  function plainTextPlan(): string {
    return formatSettlementPlan({
      participants: state.participants,
      transfers,
      formatMoney,
      title: t('settlementPlan'),
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
      if (IS_NATIVE) {
        await NativeClipboard.write({ string: plan, label: t('settlementPlan') })
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(plan)
      } else {
        copyWithTextArea()
      }
    } catch {
      copyWithTextArea()
    }
    closeExportMenu()
    showExportNotice(t('textCopied'))
  }

  async function paymentChartBlob(): Promise<Blob> {
    return createPaymentChartBlob({
      participants: activeParticipants,
      transfers,
      theme,
      currency: state.currency,
      formatMoney,
      labels: {
        title: t('settlementPlan'),
        subtitle: t('exportSubtitle'),
        toMove: t('toMove'),
        payments: t('repayments'),
        people: t('people'),
        paymentFlow: t('paymentFlow'),
        payment: t('payment'),
        amount: t('amount'),
        footer: t('exportFooter'),
      },
    })
  }

  async function copyPaymentChart() {
    setExportBusy(true)
    try {
      const blob = await paymentChartBlob()
      if (IS_NATIVE) {
        await NativeClipboard.write({
          image: await blobToDataUrl(blob),
          label: t('copyChart'),
        })
      } else {
        if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
          throw new Error('Image clipboard is unavailable')
        }
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      }
      closeExportMenu()
      showExportNotice(t('chartCopied'))
    } catch {
      closeExportMenu()
      showExportNotice(t('useDownloadPng'))
    } finally {
      setExportBusy(false)
    }
  }

  async function downloadPaymentChart() {
    setExportBusy(true)
    try {
      const blob = await paymentChartBlob()
      if (IS_NATIVE) {
        const dataUrl = await blobToDataUrl(blob)
        const result = await Filesystem.writeFile({
          path: 'settle-payment-plan-mobile.png',
          data: dataUrl.slice(dataUrl.indexOf(',') + 1),
          directory: Directory.Cache,
        })
        await Share.share({
          title: t('settlementPlan'),
          text: t('paymentPlanFromSettle'),
          files: [result.uri],
          dialogTitle: t('shareChartDialog'),
        })
      } else {
        const objectUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = objectUrl
        link.download = 'settle-payment-plan-mobile.png'
        link.click()
        URL.revokeObjectURL(objectUrl)
      }
      closeExportMenu()
      showExportNotice(IS_NATIVE ? t('chartReady') : t('pngDownloaded'))
    } catch {
      closeExportMenu()
      showExportNotice(t('chartError'))
    } finally {
      setExportBusy(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label={t('appHome')}>
          <span className="brand__mark" aria-hidden="true"><img src="/app-icon.png" alt="" /></span>
          <span>Settle</span>
        </a>
        <div className="topbar__actions">
          <span className="privacy-note"><LockKeyhole size={14} /> {t('localOnly')}</span>
          <button className="history-button" type="button" onClick={() => setHistoryOpen(true)} aria-label={t('history')}>
            <HistoryIcon size={16} />
            <span>{t('history')}</span>
            {historyEntries.length > 0 && <b>{historyEntries.length}</b>}
          </button>
          <details className="preferences-menu">
            <summary className="preferences-button" aria-label={t('preferences')}>
              <Globe2 size={17} />
              <span>{languageCode}</span>
              <ChevronDown size={13} className="preferences-button__chevron" />
            </summary>
            <div className="preferences-menu__popover">
              <p>{t('preferences')}</p>
              <label>
                <span>{t('language')}</span>
                <select
                  value={languagePreference}
                  onChange={(event) => setLanguagePreference(event.target.value as LanguagePreference)}
                >
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.value === 'system' ? t('systemDefault') : option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t('currency')}</span>
                <select
                  value={currencyPreference}
                  onChange={(event) => setCurrencyPreference(event.target.value as CurrencyPreference)}
                >
                  <option value="auto">{t('autoCurrency', { currency: automaticCurrency })}</option>
                  {CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                </select>
              </label>
            </div>
          </details>
          <button
            className="icon-button theme-button"
            type="button"
            onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}
            aria-label={t('switchTheme', { theme: t(theme === 'light' ? 'themeDark' : 'themeLight') })}
            title={t('switchTheme', { theme: t(theme === 'light' ? 'themeDark' : 'themeLight') })}
          >
            {theme === 'light' ? <Moon size={17} /> : <Sun size={18} />}
          </button>
          <button className="icon-button" type="button" onClick={resetApp} aria-label={t('startOver')} title={t('startOver')}>
            <RotateCcw size={17} />
          </button>
        </div>
      </header>

      <main id="top">
        <h1 className="sr-only">{t('appTitle')}</h1>

        {!IS_NATIVE && (
          <nav className="download-strip" aria-label={t('downloadSettle')}>
            <p><strong>{t('takeSettle')}</strong><span>{t('nativePrivateLocal')}</span></p>
            <a href={TESTFLIGHT_URL} target="_blank" rel="noreferrer">
              <Smartphone size={17} aria-hidden="true" />
              <span><small>{t('iosDevices')}</small><strong>TestFlight</strong></span>
              <ArrowDownRight size={15} aria-hidden="true" />
            </a>
            <a href={ANDROID_APK_URL} target="_blank" rel="noreferrer">
              <Download size={17} aria-hidden="true" />
              <span><small>{t('android')}</small><strong>{t('downloadApk')}</strong></span>
              <ArrowDownRight size={15} aria-hidden="true" />
            </a>
          </nav>
        )}

        <div className="workspace">
          <div className="workspace__input">
            <section className="panel people-panel" aria-labelledby="people-title">
              <div className="section-heading">
                <div className="step-number">01</div>
                <div>
                  <h2 id="people-title">{t('whoIn')}</h2>
                  <p>{t('whoInHelp')}</p>
                </div>
              </div>

              <form className="people-form" onSubmit={addPeople}>
                <label className="sr-only" htmlFor="people-input">{t('names')}</label>
                <UsersRound size={19} aria-hidden="true" />
                <input
                  id="people-input"
                  value={nameInput}
                  onChange={(event) => setNameInput(event.target.value)}
                  placeholder={t('namesPlaceholder')}
                  autoComplete="off"
                />
                <button type="submit"><Plus size={18} /> {t('add')}</button>
              </form>
              <p className="form-error people-error" role="alert">{peopleError}</p>

              {state.participants.length > 0 ? (
                <div className="people-list" aria-label={t('groupMembers')}>
                  {state.participants.map((person) => (
                    <div className="person-chip" key={person.id}>
                      <PersonAvatar person={person} small />
                      <span>{person.name}</span>
                      <button type="button" onClick={() => removePerson(person)} aria-label={t('removePerson', { name: person.name })}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="inline-empty">
                  <span>{t('noOneYet')}</span>
                  <button
                    type="button"
                    onClick={() => setState((current) => ({
                      ...localizedExampleState,
                      currency: current.currency,
                      roundToWhole: current.roundToWhole,
                    }))}
                  >
                    {t('tryExample')}
                  </button>
                </div>
              )}
            </section>

            <section className="panel expenses-panel" aria-labelledby="expense-title">
              <div className="section-heading">
                <div className="step-number">02</div>
                <div>
                  <h2 id="expense-title">{t('whatPaid')}</h2>
                  <p>{t('whatPaidHelp')}</p>
                </div>
              </div>

              <ExpenseComposer
                participants={state.participants}
                currency={state.currency}
                editingExpense={editingExpense}
                onAdd={addExpense}
                onUpdate={updateExpense}
                onCancelEdit={() => setEditingExpenseId(null)}
                t={t}
              />

              {state.expenses.length > 0 && (
                <div className="expense-history">
                  <div className="subheading">
                    <span>{t('activity')}</span>
                    <span>{t(state.expenses.length === 1 ? 'expenseOne' : 'expenseMany', { count: state.expenses.length })}</span>
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
                            <span>{isEveryone
                              ? t('paidSplitEveryone', { payer: payer?.name ?? '' })
                              : t('paidSplitCustom', { payer: payer?.name ?? '', names: splitNames.join(', ') })}</span>
                          </div>
                          <strong className="expense-row__amount">{formatMoney(expense.amountCents)}</strong>
                          <div className="expense-row__actions">
                            <button type="button" onClick={() => editExpense(expense.id)} aria-label={t('editExpenseLabel', { description: expense.description })}>
                              <PencilLine size={16} />
                            </button>
                            <button type="button" onClick={() => removeExpense(expense.id)} aria-label={t('removeExpenseLabel', { description: expense.description })}>
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
                  <p className="eyebrow eyebrow--small">{t('liveResult')}</p>
                  <h2 id="settlement-title">{t('settlementPlan')}</h2>
                </div>
                {transfers.length > 0 && (
                  <details className="export-menu">
                    <summary className="export-button">
                      {exportNotice ? <Check size={15} /> : <Share2 size={15} />}
                      <span aria-live="polite">{exportNotice || t('export')}</span>
                      {!exportNotice && <ChevronDown size={14} className="export-button__chevron" />}
                    </summary>
                    <div className="export-menu__popover">
                      <p>{t('shareSettlement')}</p>
                      <button type="button" onClick={copyPlan} disabled={exportBusy}>
                        <span><FileText size={17} /></span>
                        <span><strong>{t('copyText')}</strong><small>{t('copyTextHelp')}</small></span>
                        <Copy size={14} />
                      </button>
                      <button type="button" onClick={copyPaymentChart} disabled={exportBusy}>
                        <span><ImageIcon size={17} /></span>
                        <span><strong>{t('copyChart')}</strong><small>{t('copyChartHelp')}</small></span>
                        <Copy size={14} />
                      </button>
                      <button type="button" onClick={downloadPaymentChart} disabled={exportBusy}>
                        <span>{IS_NATIVE ? <Share2 size={17} /> : <Download size={17} />}</span>
                        <span>
                          <strong>{IS_NATIVE ? t('shareSavePng') : t('downloadPng')}</strong>
                          <small>{t('portraitCardHelp')}</small>
                        </span>
                        {IS_NATIVE ? <Share2 size={14} /> : <Download size={14} />}
                      </button>
                    </div>
                  </details>
                )}
              </div>

              {state.expenses.length > 0 && (
                <div className="completion-panel">
                  <div className="completion-panel__copy">
                    <span><BookmarkPlus size={18} aria-hidden="true" /></span>
                    <p><strong>{t('readyForNext')}</strong><small>{t('saveAndStartNewHelp')}</small></p>
                  </div>
                  <button type="button" onClick={saveAndStartNew}>
                    <Save size={17} aria-hidden="true" />
                    <span>{t('saveAndStartNew')}</span>
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </div>
              )}

              {state.expenses.length === 0 ? (
                <div className="result-empty">
                  <div className="result-empty__visual" aria-hidden="true">
                    <span>A</span><ArrowRight /><span>B</span>
                  </div>
                  <h3>{t('cleanSlateTitle')}</h3>
                  <p>{t('cleanSlateBody')}</p>
                </div>
              ) : transfers.length === 0 ? (
                <div className="result-empty result-empty--balanced">
                  <div className="balance-seal"><Check size={30} strokeWidth={2.5} /></div>
                  <h3>{t('alreadyEvenTitle')}</h3>
                  <p>{t('alreadyEvenBody')}</p>
                </div>
              ) : (
                <>
                  <div className="summary-strip">
                    <div><span>{t('totalSpend')}</span><strong>{formatMoney(totalSpend)}</strong></div>
                    <div><span>{t('repayments')}</span><strong>{transfers.length}</strong></div>
                    <div><span>{t('people')}</span><strong>{state.participants.length}</strong></div>
                  </div>

                  <SettlementDiagram
                    participants={activeParticipants}
                    transfers={transfers}
                    formatMoney={formatMoney}
                    t={t}
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
                            <small>{t('onePayment')}</small>
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
                  <strong>{t('wholeRepayments')}</strong>
                  <span>{t('wholeRepaymentsHelp')}</span>
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
              <summary><WalletCards size={17} /> {t('mathWorks')} <Plus size={16} className="method-note__plus" /></summary>
              <p>{t('mathBody')}</p>
            </details>
          </aside>
        </div>
      </main>

      <footer>
        <div>
          <span className="brand brand--footer"><span className="brand__mark"><img src="/app-icon.png" alt="" /></span>Settle</span>
          <p>{t('footerTagline')}</p>
        </div>
        <a href="https://github.com/xingfanxia/simplify-debts-js" target="_blank" rel="noreferrer">
          <CodeXml size={17} /> {t('viewSource')}
        </a>
      </footer>

      {completionNotice && (
        <div className="completion-toast" role="status">
          <Check size={17} strokeWidth={2.7} aria-hidden="true" />
          <span>{completionNotice}</span>
          <button type="button" onClick={() => setHistoryOpen(true)}>{t('history')}</button>
        </div>
      )}

      {historyOpen && (
        <HistoryDrawer
          entries={historyEntries}
          currentState={state}
          notice={historyNotice}
          onClose={() => setHistoryOpen(false)}
          onDelete={deleteHistoryEntry}
          onOpen={openHistoryEntry}
          onSave={saveCurrentToHistory}
          locale={locale}
          t={t}
        />
      )}
    </div>
  )
}
