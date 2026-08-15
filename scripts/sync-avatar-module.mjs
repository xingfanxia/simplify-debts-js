import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = path.join(root, 'miniprogram/lib/avatar.js')
const targetPath = path.join(root, 'cloudfunctions/ledger/avatar.js')
const exportedNames = [
  'AVATAR_EMOJIS',
  'AVATAR_TONES',
  'isAvatarEmoji',
  'avatarHash',
  'automaticAvatarEmoji',
  'randomAvatarEmoji',
  'ensureParticipantAvatars',
  'avatarToneClass',
  'avatarPresentation',
]

function renderCommonJs(source) {
  const body = source
    .replace(/^\/\/ This is the canonical avatar contract\.[\s\S]*?implementation\.\n/, '')
    .replace(/^export const /gm, 'const ')
    .replace(/^export function /gm, 'function ')
  if (/\bexport\b/.test(body)) throw new Error('Unsupported export syntax in avatar module')
  return `// Generated from miniprogram/lib/avatar.js. Do not edit directly.\n${body.trim()}\n\nmodule.exports = {\n${exportedNames.map((name) => `  ${name},`).join('\n')}\n}\n`
}

const source = await readFile(sourcePath, 'utf8')
const expected = renderCommonJs(source)

if (process.argv.includes('--check')) {
  const current = await readFile(targetPath, 'utf8').catch(() => '')
  if (current !== expected) {
    console.error('cloudfunctions/ledger/avatar.js is out of date; run npm run mini:avatar:sync')
    process.exitCode = 1
  }
} else {
  await writeFile(targetPath, expected)
}
