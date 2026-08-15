const cloud = require('wx-server-sdk')
const { createCloudRepository } = require('./repository')
const { createLedgerService } = require('./service')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const EXPECTED_APP_ID = 'wx7413688ef0714f4a'
const repository = createCloudRepository(cloud.database())

exports.main = async (event) => {
  const context = cloud.getWXContext()
  if (!context || !context.OPENID) return { ok: false, error: 'no_openid' }
  if (context.APPID && context.APPID !== EXPECTED_APP_ID) return { ok: false, error: 'wrong_app' }
  const service = createLedgerService({
    repository,
    openid: context.OPENID,
    appid: context.APPID || '',
  })
  return service.execute(event)
}
