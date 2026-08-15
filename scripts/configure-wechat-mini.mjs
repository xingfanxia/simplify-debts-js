import { readFile, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const projectConfigPath = resolve(root, 'project.config.json')
const cloudConfigPath = resolve(root, 'miniprogram/config/cloud.js')

function option(name) {
  const equalsPrefix = `--${name}=`
  const equalsValue = process.argv.find((value) => value.startsWith(equalsPrefix))
  if (equalsValue) return equalsValue.slice(equalsPrefix.length)
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function writeJsonAtomically(path, value) {
  const temporaryPath = `${path}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, path)
}

const appid = option('appid')
const cloudEnvId = option('cloud-env')
const dryRun = process.argv.includes('--dry-run')

if (!appid || !/^wx[0-9a-f]{16}$/i.test(appid)) {
  throw new Error('Usage: npm run mini:configure -- --appid wx1234567890abcdef [--cloud-env env-id]')
}

if (cloudEnvId !== undefined && !/^[a-z0-9_-]{2,64}$/i.test(cloudEnvId)) {
  throw new Error('Invalid CloudBase environment ID')
}

const projectConfig = JSON.parse(await readFile(projectConfigPath, 'utf8'))
projectConfig.appid = appid
if (!dryRun) await writeJsonAtomically(projectConfigPath, projectConfig)

if (cloudEnvId !== undefined && !dryRun) {
  await writeFile(cloudConfigPath, `// Local ledgers stay on-device. This environment is used only after the user\n// explicitly chooses “创建共享账单”.\nexport const CLOUD_ENV_ID = ${JSON.stringify(cloudEnvId)}\nexport const SHARED_ROOMS_ENABLED = Boolean(CLOUD_ENV_ID)\n`, 'utf8')
}

console.log(`${dryRun ? 'Validated' : 'Configured'} WeChat AppID ${appid}${cloudEnvId ? ` and CloudBase ${cloudEnvId}` : ''}.`)
