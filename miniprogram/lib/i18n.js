import { getSystemLocale } from './storage'

const messages = {
  'zh-Hans': {
    toolTitle: '分账结算', localOnly: '仅保存在这台设备', history: '历史', settings: '设置',
    whoIn: '都有谁？', whoInHelp: '逐个添加姓名，也可以粘贴逗号分隔的名单。', namesPlaceholder: '小夏、小浩、阿新…', add: '添加', tryExample: '载入示例',
    whatPaid: '谁付了什么？', whatPaidHelp: '记下每笔共同支出，结算结果会实时更新。', whatWasIt: '这是什么支出？', descriptionPlaceholder: '晚餐、车票、民宿…', amount: '金额', paidBy: '付款人', splitBetween: '由谁分摊', everyone: '所有人', custom: '选择成员', addExpense: '添加支出', saveChanges: '保存修改', cancel: '取消',
    activity: '支出记录', expenses: '{count} 笔支出', paidSplitEveryone: '{payer} 已支付 · 全员分摊', paidSplitCustom: '{payer} 已支付 · {names} 分摊', edit: '编辑', remove: '删除',
    liveResult: '实时结果', settlementPlan: '结算方案', readyForNext: '这笔账算完了？', saveAndStartNewHelp: '存入历史记录，然后清空当前账单。', saveAndStartNew: '保存并新建', nameSettlement: '保存这笔账', nameSettlementHelp: '起一个方便日后查找的名字。', totalSpend: '总支出', repayments: '还款笔数', people: '人数', cleanSlateTitle: '先从参与人开始。', cleanSlateBody: '至少添加两个人和一笔支出，结算方案会自动出现在这里。', alreadyEvenTitle: '已经结清。', alreadyEvenBody: '现在没有人需要还款。', wholeRepayments: '整数还款', wholeRepaymentsHelp: '把最终还款取整，同时保持总额平衡。',
    share: '分享', copyText: '复制文字', shareImage: '分享结算图', shareMiniProgram: '分享小程序', settlementCopied: '结算文字已复制', generatingImage: '正在生成结算图…', imageReady: '结算图已生成',
    addTwoPeopleError: '请先添加至少两个人。', duplicateNameError: '这个名字已经在群组中。', validAmountError: '请输入大于零、最多两位小数的金额。', wholeAmountError: '当前币种只支持整数金额。', choosePayerError: '请选择付款人。', chooseShareError: '请至少选择一位分摊人。', addExpenseBeforeSave: '保存前请先添加一笔支出。', savedAndStartedNew: '已保存“{title}”，可以开始新账单了。', deletePersonConfirm: '删除 {name} 以及与其相关的支出？', resetConfirm: '清空全部成员和支出？',
    savedSettlements: '已保存的结算', noSavedTitle: '还没有保存的结算', noSavedBody: '完成的账单只会保存在这台设备上。', openPlan: '打开方案', delete: '删除', savedOn: '保存于 {date}', historyPrivacy: '这里的内容不会上传或同步。',
    preferences: '设置', currency: '币种', automatic: '自动（当前 {value}）', theme: '外观', systemDefault: '跟随系统', systemShort: '跟随', light: '浅色', dark: '深色', privacyTitle: '本地账单默认仅保存在本机', privacyBody: '普通账单和历史记录不会上传。只有你明确创建的共享账单，才会把参与人和支出同步给已加入的房间成员。',
    exampleDinner: '周五晚餐', exampleGroceries: '民宿采购', exampleRide: '回程打车', someone: '某人', paymentFlow: '付款路径', paymentNumber: '付款 {index}', toMove: '待转金额', shareOverview: '{repayments} 笔还款 · {people} 人 · {currency}', madeWith: '隐私保护 · 数据仅保存在你的设备上',
    storageError: '保存失败，请稍后重试', imageExportFailed: '结算图生成失败',
    createSharedBill: '新建共享账单', createSharedBillHelp: '创建空账单，邀请微信好友一起记账。', sharedUploadNotice: '只有这笔共享账单的昵称、成员关系和支出会同步到云端。',
    sharedBillName: '共享账单名称', yourDisplayName: '你的昵称', sharedPrivacyNotice: '普通本地账单不会上传；只有明确创建或加入的共享账单会同步。', confirmCreateShared: '创建账单',
    sharedUnavailable: '共享功能尚未连接云环境', sharedNameRequired: '请填写账单名称和昵称',
  },
}

export function detectCurrency(systemLocale = getSystemLocale()) {
  const normalized = String(systemLocale).replace('_', '-').toLowerCase()
  if (normalized.startsWith('zh-tw')) return 'TWD'
  if (normalized.startsWith('zh-hk')) return 'HKD'
  if (normalized.startsWith('zh')) return 'CNY'
  if (normalized.startsWith('ja')) return 'JPY'
  if (normalized.startsWith('ko')) return 'KRW'
  if (normalized.startsWith('en-gb')) return 'GBP'
  if (normalized.startsWith('en-ca')) return 'CAD'
  if (normalized.startsWith('en-au')) return 'AUD'
  if (normalized.startsWith('es-mx')) return 'MXN'
  if (normalized.startsWith('es')) return 'EUR'
  return 'USD'
}

export function translate(_language, key, replacements = {}) {
  let value = messages['zh-Hans'][key] || key
  Object.entries(replacements).forEach(([name, replacement]) => {
    value = value.split(`{${name}}`).join(String(replacement))
  })
  return value
}

export function getMessages() {
  return messages['zh-Hans']
}
