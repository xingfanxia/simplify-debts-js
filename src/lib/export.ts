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

const CHART_WIDTH = 1200
const SCALE = 2
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

function drawArrowHead(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  color: string,
) {
  const size = 13
  context.save()
  context.translate(x, y)
  context.rotate(angle)
  context.beginPath()
  context.moveTo(0, 0)
  context.lineTo(-size, -7)
  context.lineTo(-size, 7)
  context.closePath()
  context.fillStyle = color
  context.fill()
  context.restore()
}

export async function createPaymentChartBlob({
  participants,
  transfers,
  theme,
  currency,
  formatMoney,
}: PaymentChartOptions): Promise<Blob> {
  await document.fonts.ready

  const chartHeight = 760 + transfers.length * 68
  const canvas = document.createElement('canvas')
  canvas.width = CHART_WIDTH * SCALE
  canvas.height = chartHeight * SCALE
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable')
  context.scale(SCALE, SCALE)

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
  context.fillRect(0, 0, CHART_WIDTH, chartHeight)
  context.strokeStyle = colors.grid
  context.lineWidth = 1
  for (let x = 0; x <= CHART_WIDTH; x += 36) {
    context.beginPath()
    context.moveTo(x, 0)
    context.lineTo(x, chartHeight)
    context.stroke()
  }
  for (let y = 0; y <= chartHeight; y += 36) {
    context.beginPath()
    context.moveTo(0, y)
    context.lineTo(CHART_WIDTH, y)
    context.stroke()
  }

  context.fillStyle = colors.ink
  context.font = '700 48px "Bricolage Grotesque Variable", sans-serif'
  context.fillText('Settlement plan', 70, 86)
  context.fillStyle = colors.muted
  context.font = '600 17px "Instrument Sans Variable", sans-serif'
  context.fillText(
    `${transfers.length} ${transfers.length === 1 ? 'repayment' : 'repayments'} · ${participants.length} people · ${currency}`,
    72,
    120,
  )
  context.fillStyle = colors.accent
  context.fillRect(70, 139, 190, 7)

  const graphX = 50
  const graphY = 175
  const graphWidth = CHART_WIDTH - 100
  const graphHeight = 390
  roundedRect(context, graphX, graphY, graphWidth, graphHeight, 24)
  context.fillStyle = colors.surface
  context.fill()
  context.strokeStyle = colors.line
  context.stroke()

  const centerX = CHART_WIDTH / 2
  const centerY = graphY + graphHeight / 2 - 4
  const radiusX = participants.length <= 2 ? 280 : 410
  const radiusY = participants.length <= 2 ? 0 : 110
  const positions = new Map(
    participants.map((participant, index) => {
      const angle = participants.length <= 2
        ? index * Math.PI
        : (index / participants.length) * Math.PI * 2 - Math.PI / 2
      return [participant.id, {
        x: centerX + Math.cos(angle) * radiusX,
        y: centerY + Math.sin(angle) * radiusY,
      }]
    }),
  )

  transfers.forEach((transfer, index) => {
    const start = positions.get(transfer.from)
    const end = positions.get(transfer.to)
    if (!start || !end) return

    const dx = end.x - start.x
    const dy = end.y - start.y
    const length = Math.hypot(dx, dy) || 1
    const unitX = dx / length
    const unitY = dy / length
    const from = { x: start.x + unitX * 50, y: start.y + unitY * 50 }
    const to = { x: end.x - unitX * 58, y: end.y - unitY * 58 }
    const curve = transfers.length > 1 ? (index % 2 === 0 ? 20 : -20) : 0
    const control = {
      x: (from.x + to.x) / 2 - unitY * curve,
      y: (from.y + to.y) / 2 + unitX * curve,
    }

    context.beginPath()
    context.moveTo(from.x, from.y)
    context.quadraticCurveTo(control.x, control.y, to.x, to.y)
    context.strokeStyle = colors.muted
    context.lineWidth = 3
    context.setLineDash([8, 7])
    context.stroke()
    context.setLineDash([])
    drawArrowHead(context, to.x, to.y, Math.atan2(to.y - control.y, to.x - control.x), colors.muted)

    const labelX = (from.x + 2 * control.x + to.x) / 4
    const labelY = (from.y + 2 * control.y + to.y) / 4
    const amount = formatMoney(transfer.amountCents)
    context.font = '700 15px "Bricolage Grotesque Variable", sans-serif'
    const labelWidth = context.measureText(amount).width + 28
    roundedRect(context, labelX - labelWidth / 2, labelY - 17, labelWidth, 34, 17)
    context.fillStyle = colors.background
    context.fill()
    context.strokeStyle = colors.line
    context.lineWidth = 1.5
    context.stroke()
    context.fillStyle = colors.ink
    context.textAlign = 'center'
    context.fillText(amount, labelX, labelY + 6)
  })

  participants.forEach((participant) => {
    const position = positions.get(participant.id)
    if (!position) return
    context.beginPath()
    context.arc(position.x, position.y, 43, 0, Math.PI * 2)
    context.fillStyle = participantColor(participant.name)
    context.fill()
    context.strokeStyle = colors.accentInk
    context.lineWidth = 2
    context.stroke()
    context.fillStyle = colors.accentInk
    context.font = '750 18px "Bricolage Grotesque Variable", sans-serif'
    context.textAlign = 'center'
    context.fillText(participantInitials(participant.name), position.x, position.y + 6)
    context.fillStyle = colors.ink
    context.font = '700 15px "Instrument Sans Variable", sans-serif'
    context.fillText(participant.name, position.x, position.y + 68)
  })

  const listTop = graphY + graphHeight + 42
  context.textAlign = 'left'
  context.fillStyle = colors.muted
  context.font = '700 13px "Instrument Sans Variable", sans-serif'
  context.fillText('PAYMENTS TO MAKE', 70, listTop)

  const peopleById = new Map(participants.map((participant) => [participant.id, participant]))
  transfers.forEach((transfer, index) => {
    const rowY = listTop + 29 + index * 68
    const from = peopleById.get(transfer.from)?.name ?? 'Someone'
    const to = peopleById.get(transfer.to)?.name ?? 'Someone'
    context.strokeStyle = colors.line
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(70, rowY + 38)
    context.lineTo(CHART_WIDTH - 70, rowY + 38)
    context.stroke()

    context.fillStyle = colors.ink
    context.font = '700 22px "Bricolage Grotesque Variable", sans-serif'
    context.fillText(from, 70, rowY + 7)
    const fromWidth = context.measureText(from).width
    context.fillStyle = colors.accent
    context.font = '700 23px "Instrument Sans Variable", sans-serif'
    context.fillText('→', 90 + fromWidth, rowY + 7)
    context.fillStyle = colors.ink
    context.font = '700 22px "Bricolage Grotesque Variable", sans-serif'
    context.fillText(to, 130 + fromWidth, rowY + 7)
    context.textAlign = 'right'
    context.fillText(formatMoney(transfer.amountCents), CHART_WIDTH - 70, rowY + 7)
    context.textAlign = 'left'
  })

  context.fillStyle = colors.muted
  context.font = '600 13px "Instrument Sans Variable", sans-serif'
  context.fillText('Made with Settle · Your data stays on your device', 70, chartHeight - 42)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Could not render payment chart'))
    }, 'image/png')
  })
}
