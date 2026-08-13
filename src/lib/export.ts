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

const CHART_WIDTH = 1080
const MIN_CHART_HEIGHT = 1350
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

  const chartHeight = Math.max(MIN_CHART_HEIGHT, 1020 + transfers.length * 88)
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
  context.font = '700 50px "Bricolage Grotesque Variable", sans-serif'
  context.fillText('Settlement plan', 64, 88)
  context.fillStyle = colors.muted
  context.font = '600 17px "Instrument Sans Variable", sans-serif'
  context.fillText(
    `${transfers.length} ${transfers.length === 1 ? 'repayment' : 'repayments'} · ${participants.length} people · ${currency}`,
    66,
    124,
  )
  context.fillStyle = colors.accent
  context.fillRect(64, 145, 190, 8)

  const graphX = 56
  const graphY = 188
  const graphWidth = CHART_WIDTH - 112
  const graphHeight = 600
  roundedRect(context, graphX, graphY, graphWidth, graphHeight, 28)
  context.fillStyle = colors.surface
  context.fill()
  context.strokeStyle = colors.line
  context.stroke()

  const centerX = CHART_WIDTH / 2
  const centerY = graphY + graphHeight / 2 - 12
  const radiusX = participants.length <= 2 ? 250 : 350
  const radiusY = participants.length <= 2 ? 0 : 180
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
    const from = { x: start.x + unitX * 54, y: start.y + unitY * 54 }
    const to = { x: end.x - unitX * 62, y: end.y - unitY * 62 }
    const curve = transfers.length > 1 ? (index % 2 === 0 ? 23 : -23) : 0
    const control = {
      x: (from.x + to.x) / 2 - unitY * curve,
      y: (from.y + to.y) / 2 + unitX * curve,
    }

    context.beginPath()
    context.moveTo(from.x, from.y)
    context.quadraticCurveTo(control.x, control.y, to.x, to.y)
    context.strokeStyle = colors.muted
    context.lineWidth = 3.5
    context.setLineDash([9, 8])
    context.stroke()
    context.setLineDash([])
    drawArrowHead(context, to.x, to.y, Math.atan2(to.y - control.y, to.x - control.x), colors.muted)

    const labelX = (from.x + 2 * control.x + to.x) / 4
    const labelY = (from.y + 2 * control.y + to.y) / 4
    const amount = formatMoney(transfer.amountCents)
    context.font = '700 17px "Bricolage Grotesque Variable", sans-serif'
    const labelWidth = context.measureText(amount).width + 32
    roundedRect(context, labelX - labelWidth / 2, labelY - 20, labelWidth, 40, 20)
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
    context.arc(position.x, position.y, 48, 0, Math.PI * 2)
    context.fillStyle = participantColor(participant.name)
    context.fill()
    context.strokeStyle = colors.accentInk
    context.lineWidth = 2.5
    context.stroke()
    context.fillStyle = colors.accentInk
    context.font = '750 20px "Bricolage Grotesque Variable", sans-serif'
    context.textAlign = 'center'
    context.fillText(participantInitials(participant.name), position.x, position.y + 6)
    context.fillStyle = colors.ink
    context.font = '700 18px "Instrument Sans Variable", sans-serif'
    context.fillText(participant.name, position.x, position.y + 78, 170)
  })

  const listTop = graphY + graphHeight + 62
  context.textAlign = 'left'
  context.fillStyle = colors.muted
  context.font = '700 15px "Instrument Sans Variable", sans-serif'
  context.fillText('PAYMENTS TO MAKE', 64, listTop)

  const peopleById = new Map(participants.map((participant) => [participant.id, participant]))
  transfers.forEach((transfer, index) => {
    const rowY = listTop + 42 + index * 88
    const from = peopleById.get(transfer.from)?.name ?? 'Someone'
    const to = peopleById.get(transfer.to)?.name ?? 'Someone'
    context.strokeStyle = colors.line
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(64, rowY + 50)
    context.lineTo(CHART_WIDTH - 64, rowY + 50)
    context.stroke()

    context.fillStyle = colors.ink
    context.font = '700 26px "Bricolage Grotesque Variable", sans-serif'
    context.fillText(from, 64, rowY + 9, 260)
    const fromWidth = context.measureText(from).width
    context.fillStyle = colors.accent
    context.font = '700 28px "Instrument Sans Variable", sans-serif'
    context.fillText('→', 88 + Math.min(fromWidth, 260), rowY + 9)
    context.fillStyle = colors.ink
    context.font = '700 26px "Bricolage Grotesque Variable", sans-serif'
    context.fillText(to, 136 + Math.min(fromWidth, 260), rowY + 9, 260)
    context.textAlign = 'right'
    context.fillText(formatMoney(transfer.amountCents), CHART_WIDTH - 64, rowY + 9)
    context.textAlign = 'left'
  })

  context.fillStyle = colors.muted
  context.font = '600 15px "Instrument Sans Variable", sans-serif'
  context.fillText('Made with Settle · Your data stays on your device', 64, chartHeight - 48)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Could not render payment chart'))
    }, 'image/png')
  })
}
