import { avatarHash, avatarPresentation } from './avatar'

function characterWeight(character) {
  if (/\s/u.test(character)) return 0.35
  if (/^[\x00-\x7F]$/u.test(character)) return 0.55
  return 1
}

function wrappedNameLines(name, maxWeight = 5.5) {
  const characters = [...String(name || '').trim()]
  if (!characters.length) return ['']
  const lines = []
  let line = ''
  let weight = 0
  characters.forEach((character) => {
    const nextWeight = characterWeight(character)
    if (line && weight + nextWeight > maxWeight) {
      lines.push(line.trimEnd())
      line = ''
      weight = 0
    }
    line += character
    weight += nextWeight
  })
  if (line) lines.push(line.trimEnd())
  return lines
}

function settlementRowHeight(transfer) {
  if (!transfer) return 150
  const lineCount = Math.max(
    wrappedNameLines(transfer.fromName).length,
    wrappedNameLines(transfer.toName).length,
  )
  return 150 + Math.max(0, lineCount - 1) * 30
}

export function settlementCanvasHeight(transfersOrCount) {
  const transfers = Array.isArray(transfersOrCount) ? transfersOrCount : null
  const count = transfers
    ? transfers.length
    : Number.isSafeInteger(transfersOrCount) && transfersOrCount > 0 ? transfersOrCount : 0
  const rowsHeight = transfers
    ? transfers.reduce((sum, transfer) => sum + settlementRowHeight(transfer), 0)
    : count * 150
  return Math.max(520, 300 + rowsHeight + Math.max(0, count - 1) * 14 + 62)
}

function roundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + r, y)
  context.arcTo(x + width, y, x + width, y + height, r)
  context.arcTo(x + width, y + height, x, y + height, r)
  context.arcTo(x, y + height, x, y, r)
  context.arcTo(x, y, x + width, y, r)
  context.closePath()
}

function drawWrappedName(context, lines, x, startY) {
  lines.forEach((line, index) => context.fillText(line, x, startY + index * 30))
}

function drawAvatar(context, avatarEmoji, seed, x, y, colors) {
  const fills = ['#e7b0a4', '#9ecbb1', '#aac7df', '#c8bddb', '#b8c9bc']
  const presentation = avatarPresentation(avatarEmoji, seed)
  context.beginPath()
  context.arc(x, y, 24, 0, Math.PI * 2)
  context.fillStyle = fills[avatarHash(seed) % fills.length]
  context.fill()
  context.fillStyle = colors.avatarInk
  context.font = '24px sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(presentation.avatarEmoji, x, y + 1)
  context.textBaseline = 'alphabetic'
}

function drawArrow(context, centerX, centerY, colors) {
  context.beginPath()
  context.moveTo(centerX - 23, centerY)
  context.lineTo(centerX + 22, centerY)
  context.moveTo(centerX + 12, centerY - 9)
  context.lineTo(centerX + 22, centerY)
  context.lineTo(centerX + 12, centerY + 9)
  context.strokeStyle = colors.accent
  context.lineWidth = 4
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.stroke()
}

export function drawSettlementCard(context, model) {
  const { width, height, dark, title, overview, toMoveText, currency, transfers, labels } = model
  const colors = dark
    ? { bg: '#111512', surface: '#1a201b', ink: '#f0f4f1', muted: '#a8b1aa', line: '#343d36', accent: '#7bd9a4', avatarInk: '#172019' }
    : { bg: '#f5f6f4', surface: '#ffffff', ink: '#172019', muted: '#687169', line: '#d7ddd8', accent: '#24724d', avatarInk: '#172019' }
  context.fillStyle = colors.bg
  context.fillRect(0, 0, width, height)
  context.fillStyle = colors.ink
  context.font = '700 48px sans-serif'
  context.textAlign = 'left'
  context.fillText(title, 44, 70, width - 88)
  context.fillStyle = colors.muted
  context.font = '600 22px sans-serif'
  context.fillText(overview, 46, 107, width - 92)

  roundedRect(context, 44, 132, width - 88, 104, 20)
  context.fillStyle = colors.surface
  context.fill()
  context.strokeStyle = colors.line
  context.lineWidth = 1.5
  context.stroke()
  context.textAlign = 'left'
  context.fillStyle = colors.muted
  context.font = '700 20px sans-serif'
  context.fillText(labels.toMove, 68, 167)
  context.fillStyle = colors.ink
  context.font = '700 36px sans-serif'
  context.fillText(toMoveText, 68, 215, 310)
  context.beginPath()
  context.moveTo(424, 152)
  context.lineTo(424, 216)
  context.strokeStyle = colors.line
  context.lineWidth = 1
  context.stroke()
  context.textAlign = 'center'
  context.fillStyle = colors.muted
  context.font = '700 18px sans-serif'
  context.fillText(labels.repayments, 492, 168)
  context.fillStyle = colors.ink
  context.font = '700 30px sans-serif'
  context.fillText(String(transfers.length), 492, 211)
  context.fillStyle = colors.muted
  context.font = '700 18px sans-serif'
  context.fillText(labels.people, 600, 168)
  context.fillStyle = colors.ink
  context.font = '700 30px sans-serif'
  context.fillText(String(model.peopleCount), 600, 211)
  context.textAlign = 'left'
  context.fillStyle = colors.muted
  context.font = '700 21px sans-serif'
  context.fillText(labels.paymentFlow, 44, 278)
  context.textAlign = 'right'
  context.fillText(currency, width - 44, 278)

  let rowY = 300
  transfers.forEach((transfer) => {
    const fromLines = wrappedNameLines(transfer.fromName)
    const toLines = wrappedNameLines(transfer.toName)
    const maxLines = Math.max(fromLines.length, toLines.length)
    const rowHeight = settlementRowHeight(transfer)
    const peopleCenterY = rowY + 101 + (maxLines - 1) * 15
    roundedRect(context, 44, rowY, width - 88, rowHeight, 20)
    context.fillStyle = colors.surface
    context.fill()
    context.strokeStyle = colors.line
    context.lineWidth = 1.5
    context.stroke()
    context.textAlign = 'right'
    context.fillStyle = colors.ink
    context.font = '700 30px sans-serif'
    context.fillText(transfer.amountText, width - 66, rowY + 38, 230)
    context.beginPath()
    context.moveTo(66, rowY + 52)
    context.lineTo(width - 66, rowY + 52)
    context.strokeStyle = colors.line
    context.lineWidth = 1
    context.stroke()
    drawAvatar(context, transfer.fromAvatarEmoji, transfer.from, 86, peopleCenterY, colors)
    context.textAlign = 'left'
    context.fillStyle = colors.ink
    context.font = '700 26px sans-serif'
    drawWrappedName(context, fromLines, 122, rowY + 110 + (maxLines - fromLines.length) * 15)
    drawArrow(context, width / 2, peopleCenterY, colors)
    drawAvatar(context, transfer.toAvatarEmoji, transfer.to, 464, peopleCenterY, colors)
    context.textAlign = 'left'
    context.fillStyle = colors.ink
    context.font = '700 26px sans-serif'
    drawWrappedName(context, toLines, 500, rowY + 110 + (maxLines - toLines.length) * 15)
    rowY += rowHeight + 14
  })
  context.textAlign = 'center'
  context.fillStyle = colors.muted
  context.font = '600 19px sans-serif'
  context.fillText(labels.footer, width / 2, height - 30, width - 88)
}

export function exportSettlementImage(page, { selector = '#shareCanvas', width = 720, height, draw }) {
  return new Promise((resolve, reject) => {
    wx.createSelectorQuery().in(page).select(selector).fields({ node: true, size: true }).exec((result) => {
      const canvas = result?.[0]?.node
      if (!canvas) {
        reject(new Error('Canvas unavailable'))
        return
      }
      const scale = 2
      const bitmapWidth = width * scale
      const bitmapHeight = height * scale
      const resized = canvas.width !== bitmapWidth || canvas.height !== bitmapHeight
      if (resized) {
        canvas.width = bitmapWidth
        canvas.height = bitmapHeight
      }
      const context = canvas.getContext('2d')
      if (context.setTransform) {
        context.setTransform(scale, 0, 0, scale, 0, 0)
      } else if (resized || !page.__settlementCanvasScaled) {
        context.scale(scale, scale)
        page.__settlementCanvasScaled = true
      }
      context.clearRect(0, 0, width, height)
      draw(context, width, height)

      const exportPng = () => wx.canvasToTempFilePath({
        canvas,
        fileType: 'png',
        destWidth: bitmapWidth,
        destHeight: bitmapHeight,
        success: ({ tempFilePath }) => resolve(tempFilePath),
        fail: reject,
      })
      // Color Emoji are composited asynchronously by WeChat's canvas runtime.
      // Two frames prevent later consecutive exports from clipping their glyphs.
      if (canvas.requestAnimationFrame) {
        canvas.requestAnimationFrame(() => canvas.requestAnimationFrame(exportPng))
      } else {
        setTimeout(exportPng, 80)
      }
    })
  })
}
