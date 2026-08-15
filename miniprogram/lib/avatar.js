// This is the canonical avatar contract. Run `npm run mini:avatar:sync`
// after editing so the CloudBase runtime receives the same implementation.
export const AVATAR_EMOJIS = Object.freeze([
  '🐶', '🐱', '🐰', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷',
  '🐸', '🐵', '🐔', '🐧', '🐦', '🦊', '🐴', '🐝', '🐙', '🐢',
  '🐬', '🦋', '🐹', '🐺', '🦦',
  '🍎', '🍊', '🍋', '🍉', '🍇', '🍓', '🍒', '🍑', '🍍', '🥭',
  '🥝', '🍅', '🥑', '🥕', '🌽', '🍞', '🥐', '🧀', '🍕', '🍔',
  '🍟', '🌮', '🍣', '🍪', '🧁',
])

export const AVATAR_TONES = Object.freeze([
  'avatar-coral',
  'avatar-mint',
  'avatar-blue',
  'avatar-purple',
  'avatar-accent',
])

const AVATAR_EMOJI_SET = new Set(AVATAR_EMOJIS)

export function isAvatarEmoji(value) {
  return typeof value === 'string' && AVATAR_EMOJI_SET.has(value)
}

export function avatarHash(seed) {
  const value = String(seed || 'settle-avatar')
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.codePointAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function automaticAvatarEmoji(seed, usedEmojis = []) {
  const used = new Set(Array.from(usedEmojis).filter(isAvatarEmoji))
  const start = avatarHash(seed) % AVATAR_EMOJIS.length
  for (let offset = 0; offset < AVATAR_EMOJIS.length; offset += 1) {
    const candidate = AVATAR_EMOJIS[(start + offset) % AVATAR_EMOJIS.length]
    if (!used.has(candidate)) return candidate
  }
  return AVATAR_EMOJIS[start]
}

export function randomAvatarEmoji(usedEmojis = [], random = Math.random) {
  const used = new Set(Array.from(usedEmojis).filter(isAvatarEmoji))
  const available = AVATAR_EMOJIS.filter((emoji) => !used.has(emoji))
  const choices = available.length ? available : AVATAR_EMOJIS
  const randomValue = random()
  const sample = Number.isFinite(randomValue) ? Math.max(0, Math.min(0.999999, randomValue)) : 0
  return choices[Math.floor(sample * choices.length)]
}

export function ensureParticipantAvatars(participants, ledgerSeed = 'local-ledger') {
  if (!Array.isArray(participants)) return []
  const explicitlyUsed = new Set(participants.map(({ avatarEmoji }) => avatarEmoji).filter(isAvatarEmoji))
  const used = new Set(explicitlyUsed)
  return participants.map((participant, index) => {
    if (isAvatarEmoji(participant && participant.avatarEmoji)) return { ...participant, avatarEmoji: participant.avatarEmoji }
    const participantId = participant && (participant.id || participant.participantId) || String(index)
    const avatarEmoji = automaticAvatarEmoji(`${ledgerSeed}:${participantId}`, used)
    used.add(avatarEmoji)
    return { ...participant, avatarEmoji }
  })
}

export function avatarToneClass(seed) {
  return AVATAR_TONES[avatarHash(`tone:${seed}`) % AVATAR_TONES.length]
}

export function avatarPresentation(avatarEmoji, seed = '') {
  const resolvedEmoji = isAvatarEmoji(avatarEmoji) ? avatarEmoji : automaticAvatarEmoji(seed)
  return {
    avatarEmoji: resolvedEmoji,
    avatarClass: avatarToneClass(`${seed}:${resolvedEmoji}`),
  }
}
