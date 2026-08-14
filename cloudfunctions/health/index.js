const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async () => ({
  ok: true,
  service: 'settle-health',
  version: 1,
  timestamp: Date.now(),
})
