import type { Participant, Transfer } from '../types'

interface PaymentChartOptions {
  participants: Participant[]
  transfers: Transfer[]
  theme: 'light' | 'dark'
  currency: string
  formatMoney: (amountCents: number) => string
  labels: PaymentChartLabels
}

interface PlainTextPlanOptions {
  participants: Participant[]
  transfers: Transfer[]
  formatMoney: (amountCents: number) => string
  title?: string
}

export interface PaymentChartLabels {
  title: string
  subtitle: string
  toMove: string
  payments: string
  people: string
  paymentFlow: string
  payment: string
  amount: string
  footer: string
}

export const PAYMENT_CHART_LAYOUT = {
  logicalWidth: 720,
  scale: 2,
  minimumLogicalHeight: 760,
  cardsTop: 342,
  cardHeight: 184,
  cardGap: 16,
  paymentNameFontSize: 31,
  paymentAmountFontSize: 38,
  arrowChipWidth: 66,
  arrowChipHeight: 42,
  arrowStrokeWidth: 4.5,
} as const

const NODE_COLORS = ['#9ec6ff', '#ff7d61', '#95d8b2', '#c2b7eb', '#d8ff62']

function participantColor(name: string): string {
  const index = [...name].reduce((total, character) => total + character.charCodeAt(0), 0) % NODE_COLORS.length
  return NODE_COLORS[index]
}

function participantInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

export function formatSettlementPlan({
  participants,
  transfers,
  formatMoney,
  title = 'Settlement plan',
}: PlainTextPlanOptions): string {
  const peopleById = new Map(participants.map((participant) => [participant.id, participant]))
  const lines = transfers.map((transfer) => {
    const from = peopleById.get(transfer.from)?.name ?? 'Someone'
    const to = peopleById.get(transfer.to)?.name ?? 'Someone'
    return `${from} → ${to} · ${formatMoney(transfer.amountCents)}`
  })

  return `${title}\n\n${lines.join('\n')}`
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath()
  context.roundRect(x, y, width, height, radius)
}

function truncateCanvasText(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
): string {
  if (context.measureText(value).width <= maxWidth) return value
  let truncated = value
  while (truncated.length > 1 && context.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1)
  }
  return `${truncated}…`
}

function drawAvatar(
  context: CanvasRenderingContext2D,
  participant: Participant,
  x: number,
  y: number,
  radius: number,
  ink: string,
) {
  context.beginPath()
  context.arc(x, y, radius, 0, Math.PI * 2)
  context.fillStyle = participantColor(participant.name)
  context.fill()
  context.strokeStyle = ink
  context.lineWidth = 2
  context.stroke()
  context.fillStyle = ink
  context.font = '750 16px "Bricolage Grotesque Variable", sans-serif'
  context.textAlign = 'center'
  context.fillText(participantInitials(participant.name), x, y + 5)
}

function drawDirectionArrow(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  fill: string,
  ink: string,
) {
  const { arrowChipWidth, arrowChipHeight, arrowStrokeWidth } = PAYMENT_CHART_LAYOUT
  const x = centerX - arrowChipWidth / 2
  const y = centerY - arrowChipHeight / 2

  roundedRect(context, x, y, arrowChipWidth, arrowChipHeight, arrowChipHeight / 2)
  context.fillStyle = fill
  context.fill()
  context.strokeStyle = ink
  context.lineWidth = 1.5
  context.stroke()

  const startX = x + 18
  const endX = x + arrowChipWidth - 17
  context.beginPath()
  context.moveTo(startX, centerY)
  context.lineTo(endX, centerY)
  context.moveTo(endX - 9, centerY - 8)
  context.lineTo(endX, centerY)
  context.lineTo(endX - 9, centerY + 8)
  context.strokeStyle = ink
  context.lineWidth = arrowStrokeWidth
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.stroke()
}

export async function createPaymentChartBlob({
  participants,
  transfers,
  theme,
  currency,
  formatMoney,
  labels,
}: PaymentChartOptions): Promise<Blob> {
  await document.fonts.ready

  const {
    logicalWidth: chartWidth,
    scale,
    minimumLogicalHeight,
    cardsTop,
    cardHeight,
    cardGap,
    paymentNameFontSize,
    paymentAmountFontSize,
  } = PAYMENT_CHART_LAYOUT
  const cardsBottom = cardsTop
    + transfers.length * cardHeight
    + Math.max(0, transfers.length - 1) * cardGap
  const chartHeight = Math.max(
    minimumLogicalHeight,
    cardsBottom + 88,
  )
  const canvas = document.createElement('canvas')
  canvas.width = chartWidth * scale
  canvas.height = chartHeight * scale
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable')
  context.scale(scale, scale)

  const colors = theme === 'dark'
    ? {
        background: '#101511',
        surface: '#171d18',
        ink: '#edf4eb',
        muted: '#bdc7be',
        line: '#556158',
        grid: 'rgba(237, 244, 235, 0.055)',
        accent: '#d8ff62',
        accentInk: '#18231c',
      }
    : {
        background: '#f6f3ea',
        surface: '#fffefa',
        ink: '#142019',
        muted: '#465249',
        line: '#a5aca4',
        grid: 'rgba(20, 32, 25, 0.055)',
        accent: '#d8ff62',
        accentInk: '#142019',
      }

  context.fillStyle = colors.background
  context.fillRect(0, 0, chartWidth, chartHeight)
  context.strokeStyle = colors.grid
  context.lineWidth = 1
  for (let x = 0; x <= chartWidth; x += 32) {
    context.beginPath()
    context.moveTo(x, 0)
    context.lineTo(x, chartHeight)
    context.stroke()
  }
  for (let y = 0; y <= chartHeight; y += 32) {
    context.beginPath()
    context.moveTo(0, y)
    context.lineTo(chartWidth, y)
    context.stroke()
  }

  context.fillStyle = colors.ink
  context.font = '700 52px "Bricolage Grotesque Variable", sans-serif'
  context.textAlign = 'left'
  context.fillText(labels.title, 44, 76, chartWidth - 88)
  context.fillStyle = colors.muted
  context.font = '650 21px "Instrument Sans Variable", sans-serif'
  context.fillText(
    labels.subtitle,
    46,
    113,
  )

  const summaryX = 44
  const summaryY = 145
  const summaryWidth = chartWidth - 88
  const summaryHeight = 122
  roundedRect(context, summaryX, summaryY, summaryWidth, summaryHeight, 24)
  context.fillStyle = colors.surface
  context.fill()
  context.strokeStyle = colors.line
  context.lineWidth = 1.5
  context.stroke()

  const summaryColumns = [
    { label: labels.toMove.toLocaleUpperCase(), value: formatMoney(transfers.reduce((sum, transfer) => sum + transfer.amountCents, 0)) },
    { label: labels.payments.toLocaleUpperCase(), value: String(transfers.length) },
    { label: labels.people.toLocaleUpperCase(), value: String(participants.length) },
  ]
  summaryColumns.forEach((item, index) => {
    const columnWidth = summaryWidth / 3
    const columnX = summaryX + index * columnWidth
    if (index > 0) {
      context.beginPath()
      context.moveTo(columnX, summaryY + 22)
      context.lineTo(columnX, summaryY + summaryHeight - 22)
      context.strokeStyle = colors.line
      context.lineWidth = 1
      context.stroke()
    }
    context.fillStyle = colors.muted
    context.font = '750 16px "Instrument Sans Variable", sans-serif'
    context.textAlign = 'center'
    context.fillText(item.label, columnX + columnWidth / 2, summaryY + 40)
    context.fillStyle = colors.ink
    context.font = '700 32px "Bricolage Grotesque Variable", sans-serif'
    context.fillText(item.value, columnX + columnWidth / 2, summaryY + 91, columnWidth - 26)
  })

  context.textAlign = 'left'
  context.fillStyle = colors.muted
  context.font = '750 18px "Instrument Sans Variable", sans-serif'
  context.fillText(labels.paymentFlow.toLocaleUpperCase(), 44, 315)
  context.textAlign = 'right'
  context.fillText(currency, chartWidth - 44, 315)

  const peopleById = new Map(participants.map((participant) => [participant.id, participant]))
  transfers.forEach((transfer, index) => {
    const rowY = cardsTop + index * (cardHeight + cardGap)
    const from = peopleById.get(transfer.from) ?? { id: transfer.from, name: 'Someone' }
    const to = peopleById.get(transfer.to) ?? { id: transfer.to, name: 'Someone' }

    roundedRect(context, 44, rowY, chartWidth - 88, cardHeight, 24)
    context.fillStyle = colors.surface
    context.fill()
    context.strokeStyle = colors.line
    context.lineWidth = 1.5
    context.stroke()

    context.textAlign = 'left'
    context.fillStyle = colors.muted
    context.font = '750 16px "Instrument Sans Variable", sans-serif'
    context.fillText(`${labels.payment.toLocaleUpperCase()} ${String(index + 1).padStart(2, '0')}`, 68, rowY + 31)

    drawAvatar(context, from, 94, rowY + 82, 27, colors.accentInk)
    context.textAlign = 'left'
    context.fillStyle = colors.ink
    context.font = `700 ${paymentNameFontSize}px "Bricolage Grotesque Variable", sans-serif`
    context.fillText(truncateCanvasText(context, from.name, 168), 132, rowY + 92)

    drawDirectionArrow(context, chartWidth / 2, rowY + 82, colors.accent, colors.accentInk)

    drawAvatar(context, to, 464, rowY + 82, 27, colors.accentInk)
    context.textAlign = 'left'
    context.fillStyle = colors.ink
    context.font = `700 ${paymentNameFontSize}px "Bricolage Grotesque Variable", sans-serif`
    context.fillText(truncateCanvasText(context, to.name, 150), 502, rowY + 92)

    context.beginPath()
    context.moveTo(68, rowY + 120)
    context.lineTo(chartWidth - 68, rowY + 120)
    context.strokeStyle = colors.line
    context.lineWidth = 1
    context.stroke()

    context.textAlign = 'left'
    context.fillStyle = colors.muted
    context.font = '750 17px "Instrument Sans Variable", sans-serif'
    context.fillText(labels.amount.toLocaleUpperCase(), 68, rowY + 158)
    context.textAlign = 'right'
    context.fillStyle = colors.ink
    context.font = `700 ${paymentAmountFontSize}px "Bricolage Grotesque Variable", sans-serif`
    context.fillText(formatMoney(transfer.amountCents), chartWidth - 68, rowY + 166)
  })

  context.fillStyle = colors.muted
  context.font = '600 17px "Instrument Sans Variable", sans-serif'
  context.textAlign = 'center'
  context.fillText(labels.footer, chartWidth / 2, chartHeight - 43, chartWidth - 88)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Could not render payment chart'))
    }, 'image/png')
  })
}
