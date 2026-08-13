import type { Participant, Transfer } from '../types'

interface PaymentChartOptions {
  participants: Participant[]
  transfers: Transfer[]
  theme: 'light' | 'dark'
  currency: string
  formatMoney: (amountCents: number) => string
}

interface PlainTextPlanOptions {
  participants: Participant[]
  transfers: Transfer[]
  formatMoney: (amountCents: number) => string
}

export const PAYMENT_CHART_LAYOUT = {
  logicalWidth: 720,
  scale: 2,
  minimumLogicalHeight: 1120,
  cardsTop: 410,
  cardHeight: 188,
  cardGap: 20,
  paymentNameFontSize: 31,
  paymentAmountFontSize: 38,
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
}: PlainTextPlanOptions): string {
  const peopleById = new Map(participants.map((participant) => [participant.id, participant]))
  const lines = transfers.map((transfer) => {
    const from = peopleById.get(transfer.from)?.name ?? 'Someone'
    const to = peopleById.get(transfer.to)?.name ?? 'Someone'
    return `${from} → ${to} · ${formatMoney(transfer.amountCents)}`
  })

  return `Settlement plan\n\n${lines.join('\n')}`
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

export async function createPaymentChartBlob({
  participants,
  transfers,
  theme,
  currency,
  formatMoney,
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
  const chartHeight = Math.max(
    minimumLogicalHeight,
    cardsTop + transfers.length * (cardHeight + cardGap) + 90,
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
        muted: '#aab5ab',
        line: '#465248',
        grid: 'rgba(237, 244, 235, 0.055)',
        accent: '#d8ff62',
        accentInk: '#18231c',
      }
    : {
        background: '#f4f1e8',
        surface: '#fbfaf6',
        ink: '#18231c',
        muted: '#667068',
        line: '#b9b9ae',
        grid: 'rgba(24, 35, 28, 0.05)',
        accent: '#d8ff62',
        accentInk: '#18231c',
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
  context.font = '700 58px "Bricolage Grotesque Variable", sans-serif'
  context.textAlign = 'left'
  context.fillText('Settlement plan', 44, 92)
  context.fillStyle = colors.muted
  context.font = '600 22px "Instrument Sans Variable", sans-serif'
  context.fillText(
    'A clear, one-screen payment flow',
    46,
    132,
  )
  context.fillStyle = colors.accent
  context.fillRect(44, 158, 168, 8)

  const summaryX = 44
  const summaryY = 194
  const summaryWidth = chartWidth - 88
  const summaryHeight = 148
  roundedRect(context, summaryX, summaryY, summaryWidth, summaryHeight, 24)
  context.fillStyle = colors.surface
  context.fill()
  context.strokeStyle = colors.line
  context.lineWidth = 1.5
  context.stroke()

  const summaryColumns = [
    { label: 'TO MOVE', value: formatMoney(transfers.reduce((sum, transfer) => sum + transfer.amountCents, 0)) },
    { label: 'PAYMENTS', value: String(transfers.length) },
    { label: 'PEOPLE', value: String(participants.length) },
  ]
  summaryColumns.forEach((item, index) => {
    const columnWidth = summaryWidth / 3
    const columnX = summaryX + index * columnWidth
    if (index > 0) {
      context.beginPath()
      context.moveTo(columnX, summaryY + 28)
      context.lineTo(columnX, summaryY + summaryHeight - 28)
      context.strokeStyle = colors.line
      context.lineWidth = 1
      context.stroke()
    }
    context.fillStyle = colors.muted
    context.font = '750 17px "Instrument Sans Variable", sans-serif'
    context.textAlign = 'center'
    context.fillText(item.label, columnX + columnWidth / 2, summaryY + 45)
    context.fillStyle = colors.ink
    context.font = '700 34px "Bricolage Grotesque Variable", sans-serif'
    context.fillText(item.value, columnX + columnWidth / 2, summaryY + 101, columnWidth - 26)
  })

  context.textAlign = 'left'
  context.fillStyle = colors.muted
  context.font = '750 18px "Instrument Sans Variable", sans-serif'
  context.fillText('PAYMENT FLOW', 44, 386)
  context.textAlign = 'right'
  context.fillText(currency, chartWidth - 44, 386)

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
    context.fillText(`PAYMENT ${String(index + 1).padStart(2, '0')}`, 68, rowY + 31)

    drawAvatar(context, from, 91, rowY + 79, 27, colors.accentInk)
    context.textAlign = 'left'
    context.fillStyle = colors.ink
    context.font = `700 ${paymentNameFontSize}px "Bricolage Grotesque Variable", sans-serif`
    context.fillText(truncateCanvasText(context, from.name, 180), 129, rowY + 89)

    context.textAlign = 'center'
    context.fillStyle = colors.accent
    context.font = '750 36px "Instrument Sans Variable", sans-serif'
    context.fillText('→', 360, rowY + 90)

    drawAvatar(context, to, 422, rowY + 79, 27, colors.accentInk)
    context.textAlign = 'left'
    context.fillStyle = colors.ink
    context.font = `700 ${paymentNameFontSize}px "Bricolage Grotesque Variable", sans-serif`
    context.fillText(truncateCanvasText(context, to.name, 180), 460, rowY + 89)

    context.beginPath()
    context.moveTo(68, rowY + 117)
    context.lineTo(chartWidth - 68, rowY + 117)
    context.strokeStyle = colors.line
    context.lineWidth = 1
    context.stroke()

    context.textAlign = 'left'
    context.fillStyle = colors.muted
    context.font = '750 17px "Instrument Sans Variable", sans-serif'
    context.fillText('AMOUNT', 68, rowY + 160)
    context.textAlign = 'right'
    context.fillStyle = colors.ink
    context.font = `700 ${paymentAmountFontSize}px "Bricolage Grotesque Variable", sans-serif`
    context.fillText(formatMoney(transfer.amountCents), chartWidth - 68, rowY + 166)
  })

  context.fillStyle = colors.muted
  context.font = '600 17px "Instrument Sans Variable", sans-serif'
  context.textAlign = 'center'
  context.fillText('Made with Settle · Your data stays on your device', chartWidth / 2, chartHeight - 43)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Could not render payment chart'))
    }, 'image/png')
  })
}
