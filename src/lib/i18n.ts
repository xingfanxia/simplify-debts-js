import type { Currency } from '../types'

export const SUPPORTED_LANGUAGES = ['en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'es'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]
export type LanguagePreference = 'system' | SupportedLanguage
export type CurrencyPreference = 'auto' | Currency

export const LANGUAGE_OPTIONS: ReadonlyArray<{ value: LanguagePreference; label: string }> = [
  { value: 'system', label: 'System / 系统' },
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'es', label: 'Español' },
]

const en = {
  appHome: 'Settle home',
  localOnly: 'Stays on this device',
  history: 'History',
  preferences: 'Preferences',
  language: 'Language',
  systemDefault: 'Follow system',
  currency: 'Currency',
  autoCurrency: 'Auto · {currency}',
  themeLight: 'light',
  themeDark: 'dark',
  switchTheme: 'Switch to {theme} theme',
  startOver: 'Start over',
  appTitle: 'Settle shared expenses',
  downloadSettle: 'Download Settle',
  takeSettle: 'Take Settle with you',
  nativePrivateLocal: 'Native, private, and fully local.',
  iosDevices: 'iPhone & iPad',
  android: 'Android',
  downloadApk: 'Download APK',
  whoIn: 'Who’s in?',
  whoInHelp: 'Add names one at a time or paste a comma-separated list.',
  names: 'Names',
  namesPlaceholder: 'Alex, Maya, Theo…',
  add: 'Add',
  groupMembers: 'Group members',
  removePerson: 'Remove {name}',
  noOneYet: 'No one here yet.',
  tryExample: 'Try an example',
  exampleDinner: 'Friday dinner',
  exampleGroceries: 'Cabin groceries',
  exampleRide: 'Ride home',
  whatPaid: 'What was paid?',
  whatPaidHelp: 'Log each shared expense. We’ll do the balancing as you go.',
  activity: 'Activity',
  expenseOne: '{count} expense',
  expenseMany: '{count} expenses',
  paidSplitEveryone: '{payer} paid · split with everyone',
  paidSplitCustom: '{payer} paid · split with {names}',
  editExpenseLabel: 'Edit {description}',
  removeExpenseLabel: 'Remove {description}',
  liveResult: 'Live result',
  settlementPlan: 'Settlement plan',
  export: 'Export',
  shareSettlement: 'Share settlement',
  copyText: 'Copy text',
  copyTextHelp: 'Names, arrows, amounts',
  copyChart: 'Copy chart',
  copyChartHelp: 'Phone-ready portrait image',
  shareSavePng: 'Share / save PNG',
  downloadPng: 'Download PNG',
  portraitCardHelp: 'Readable portrait payment card',
  cleanSlateTitle: 'Your clean slate starts here.',
  cleanSlateBody: 'Add at least two people and one expense. The repayment plan will appear automatically.',
  alreadyEvenTitle: 'You’re already even.',
  alreadyEvenBody: 'No one owes anyone. That’s the best kind of settlement plan.',
  totalSpend: 'Total spend',
  repayments: 'Repayments',
  people: 'People',
  onePayment: 'One payment, then you’re square',
  wholeRepayments: 'Whole-number repayments',
  wholeRepaymentsHelp: 'Round fairly while keeping the ledger balanced.',
  mathWorks: 'How the math works',
  mathBody: 'Settle nets what each person paid against their share, then matches the largest balances. The result needs at most one fewer repayment than there are people—and every cent remains accounted for.',
  footerTagline: 'Shared expenses, minus the spreadsheet.',
  viewSource: 'View source',
  addTwoPeopleError: 'Add at least two people before logging an expense.',
  choosePayerError: 'Choose who paid for this expense.',
  validAmountError: 'Enter a valid amount.',
  positiveAmountError: 'Enter an amount greater than zero.',
  chooseShareError: 'Choose at least one person to share this expense.',
  sharedExpense: 'Shared expense',
  editing: 'Editing',
  cancel: 'Cancel',
  whatWasIt: 'What was it?',
  descriptionPlaceholder: 'Dinner, tickets, cabin…',
  amount: 'Amount',
  paidBy: 'Paid by',
  addPeopleFirst: 'Add people first',
  splitBetween: 'Split between',
  everyone: 'Everyone',
  choosePeople: 'Choose people',
  sharingAria: 'People sharing this expense',
  saveChanges: 'Save changes',
  addExpense: 'Add expense',
  historyMore: '{title} + {count} more',
  settlementFallback: 'Settlement · {date}',
  onThisDevice: 'On this device',
  savedSettlements: 'Saved settlements',
  closeHistory: 'Close history',
  saveSettlement: 'Save this settlement',
  saveSettlementHelp: 'Keep a local snapshot you can reopen later.',
  settlementName: 'Settlement name',
  historyPlaceholder: 'Weekend trip, apartment bills…',
  saveLocally: 'Save locally',
  addExpenseBeforeSave: 'Add an expense before saving this settlement.',
  savedCounter: '{count} / 50 saved',
  noSavedTitle: 'No saved settlements yet',
  noSavedBody: 'Saved plans stay in this browser and appear here.',
  deleteLabel: 'Delete {title}',
  peopleCount: '{count} people',
  openPlan: 'Open plan',
  historyPrivacy: 'Nothing here is uploaded or synced.',
  typeNameError: 'Type at least one name.',
  duplicateNameError: 'Those people are already in the group.',
  removePersonError: 'Remove {name} from their expenses before removing them from the group.',
  resetConfirm: 'Clear everyone and every expense? This cannot be undone.',
  savedOnDevice: 'Saved on this device',
  storageAccessError: 'Could not access local storage',
  openHistoryConfirm: 'Open “{title}”? This replaces the current workspace. Save it first if you want to keep it.',
  deleteHistoryConfirm: 'Delete “{title}” from this device?',
  deleted: 'Deleted',
  storageUpdateError: 'Could not update local storage',
  textCopied: 'Text copied',
  chartCopied: 'Chart copied',
  useDownloadPng: 'Use Download PNG in this browser',
  chartReady: 'Chart ready to share',
  pngDownloaded: 'PNG downloaded',
  chartError: 'Could not create the chart',
  paymentPlanFromSettle: 'Payment plan from Settle',
  shareChartDialog: 'Share or save payment chart',
  diagramAria: 'Settlement relationship diagram',
  diagramTitle: 'Who sends money to whom',
  exportSubtitle: 'Who sends what — at a glance',
  toMove: 'To move',
  paymentFlow: 'Payment flow',
  payment: 'Payment',
  exportFooter: 'Made with Settle · Your data stays on your device',
} as const

export type MessageKey = keyof typeof en
type MessageTable = Record<MessageKey, string>

const zhCN: MessageTable = {
  appHome: 'Settle 首页', localOnly: '仅保存在此设备', history: '历史记录', preferences: '偏好设置', language: '语言', systemDefault: '跟随系统', currency: '币种', autoCurrency: '自动 · {currency}', themeLight: '浅色', themeDark: '深色', switchTheme: '切换到{theme}模式', startOver: '重新开始', appTitle: 'Settle 分摊共享支出', downloadSettle: '下载 Settle', takeSettle: '把 Settle 装到手机上', nativePrivateLocal: '原生、私密、完全本地。', iosDevices: 'iPhone 与 iPad', android: 'Android', downloadApk: '下载 APK',
  whoIn: '都有谁？', whoInHelp: '逐个输入姓名，或粘贴用逗号分隔的名单。', names: '姓名', namesPlaceholder: '小明、小美、小林…', add: '添加', groupMembers: '群组成员', removePerson: '移除{name}', noOneYet: '还没有成员。', tryExample: '试用示例', exampleDinner: '周五晚餐', exampleGroceries: '小屋采购', exampleRide: '回程打车', whatPaid: '支付了什么？', whatPaidHelp: '记录每笔共享支出，余额会自动计算。', activity: '支出记录', expenseOne: '{count} 笔支出', expenseMany: '{count} 笔支出', paidSplitEveryone: '{payer} 已支付 · 全员分摊', paidSplitCustom: '{payer} 已支付 · 由 {names} 分摊', editExpenseLabel: '编辑{description}', removeExpenseLabel: '删除{description}', liveResult: '实时结果', settlementPlan: '结算方案', export: '导出', shareSettlement: '分享结算方案', copyText: '复制文字', copyTextHelp: '姓名、箭头和金额', copyChart: '复制图片', copyChartHelp: '适合手机阅读的竖版图片', shareSavePng: '分享 / 保存 PNG', downloadPng: '下载 PNG', portraitCardHelp: '清晰易读的竖版付款卡',
  cleanSlateTitle: '从这里开始记账。', cleanSlateBody: '至少添加两个人和一笔支出，系统会自动生成还款方案。', alreadyEvenTitle: '已经结清了。', alreadyEvenBody: '目前无人欠款，这是最理想的结算结果。', totalSpend: '总支出', repayments: '还款笔数', people: '人数', onePayment: '完成这笔付款即可结清', wholeRepayments: '整数还款', wholeRepaymentsHelp: '公平取整，同时保持账目平衡。', mathWorks: '计算方式', mathBody: 'Settle 会将每个人的实际支付与应承担份额相抵，再匹配最大余额。还款笔数最多比人数少一笔，且每一分钱都有记录。', footerTagline: '共享支出，不再需要表格。', viewSource: '查看源代码',
  addTwoPeopleError: '记录支出前请至少添加两个人。', choosePayerError: '请选择本笔支出的付款人。', validAmountError: '请输入有效金额。', positiveAmountError: '金额必须大于零。', chooseShareError: '请至少选择一个分摊人。', sharedExpense: '共享支出', editing: '正在编辑', cancel: '取消', whatWasIt: '这是什么支出？', descriptionPlaceholder: '晚餐、门票、住宿…', amount: '金额', paidBy: '付款人', addPeopleFirst: '请先添加成员', splitBetween: '分摊人', everyone: '所有人', choosePeople: '选择成员', sharingAria: '参与分摊的成员', saveChanges: '保存修改', addExpense: '添加支出',
  historyMore: '{title} + 另外 {count} 笔', settlementFallback: '结算 · {date}', onThisDevice: '保存在此设备', savedSettlements: '已保存的结算', closeHistory: '关闭历史记录', saveSettlement: '保存当前结算', saveSettlementHelp: '保存本地快照，之后可随时重新打开。', settlementName: '结算名称', historyPlaceholder: '周末旅行、合租账单…', saveLocally: '保存到本机', addExpenseBeforeSave: '请先添加一笔支出再保存。', savedCounter: '已保存 {count} / 50', noSavedTitle: '还没有已保存的结算', noSavedBody: '保存后的方案会留在此设备并显示在这里。', deleteLabel: '删除{title}', peopleCount: '{count} 人', openPlan: '打开方案', historyPrivacy: '这里的数据不会上传或同步。',
  typeNameError: '请至少输入一个姓名。', duplicateNameError: '这些成员已经在群组中。', removePersonError: '请先从相关支出中移除{name}，再将其移出群组。', resetConfirm: '要清除所有成员和支出吗？此操作无法撤销。', savedOnDevice: '已保存到此设备', storageAccessError: '无法访问本地存储', openHistoryConfirm: '打开“{title}”吗？当前工作区将被替换，如需保留请先保存。', deleteHistoryConfirm: '从此设备删除“{title}”吗？', deleted: '已删除', storageUpdateError: '无法更新本地存储', textCopied: '文字已复制', chartCopied: '图片已复制', useDownloadPng: '此浏览器请使用“下载 PNG”', chartReady: '图片已可分享', pngDownloaded: 'PNG 已下载', chartError: '无法生成图片', paymentPlanFromSettle: '来自 Settle 的付款方案', shareChartDialog: '分享或保存付款图片', diagramAria: '结算关系图', diagramTitle: '付款方向', exportSubtitle: '谁付给谁，一眼看清', toMove: '待转金额', paymentFlow: '付款路径', payment: '付款', exportFooter: '由 Settle 生成 · 数据仅保存在你的设备上',
}

const zhTW: MessageTable = {
  ...zhCN,
  localOnly: '僅保存在此裝置', preferences: '偏好設定', systemDefault: '跟隨系統', currency: '幣別', themeLight: '淺色', themeDark: '深色', appTitle: 'Settle 分攤共享支出', nativePrivateLocal: '原生、私密、完全本機。', whoIn: '有哪些人？', whoInHelp: '逐一輸入姓名，或貼上以逗號分隔的名單。', groupMembers: '群組成員', noOneYet: '尚未加入成員。', exampleDinner: '週五晚餐', exampleGroceries: '小屋採買', exampleRide: '回程叫車', whatPaid: '支付了什麼？', whatPaidHelp: '記錄每筆共享支出，餘額會自動計算。', activity: '支出記錄', paidSplitEveryone: '{payer} 已支付 · 全員分攤', paidSplitCustom: '{payer} 已支付 · 由 {names} 分攤', liveResult: '即時結果', settlementPlan: '結算方案', shareSettlement: '分享結算方案', copyChart: '複製圖片', copyChartHelp: '適合手機閱讀的直式圖片', portraitCardHelp: '清晰易讀的直式付款卡', cleanSlateTitle: '從這裡開始記帳。', cleanSlateBody: '至少加入兩個人和一筆支出，系統會自動產生還款方案。', alreadyEvenTitle: '已經結清了。', totalSpend: '總支出', repayments: '還款筆數', wholeRepayments: '整數還款', mathWorks: '計算方式', footerTagline: '共享支出，不再需要試算表。', addPeopleFirst: '請先加入成員', choosePeople: '選擇成員', saveChanges: '儲存修改', addExpense: '新增支出', onThisDevice: '保存在此裝置', savedSettlements: '已儲存的結算', saveSettlement: '儲存目前結算', saveSettlementHelp: '儲存本機快照，之後可隨時重新開啟。', saveLocally: '儲存到本機', noSavedTitle: '尚無已儲存的結算', noSavedBody: '儲存後的方案會留在此裝置並顯示於此。', openPlan: '開啟方案', historyPrivacy: '這裡的資料不會上傳或同步。', resetConfirm: '要清除所有成員和支出嗎？此操作無法復原。', savedOnDevice: '已儲存到此裝置', storageAccessError: '無法存取本機儲存空間', storageUpdateError: '無法更新本機儲存空間', textCopied: '文字已複製', chartCopied: '圖片已複製', chartReady: '圖片已可分享', pngDownloaded: 'PNG 已下載', diagramAria: '結算關係圖', exportSubtitle: '誰付給誰，一眼看清', toMove: '待轉金額', paymentFlow: '付款路徑', exportFooter: '由 Settle 產生 · 資料僅保存在你的裝置上',
}

const ja: MessageTable = {
  appHome: 'Settle ホーム', localOnly: 'このデバイス内に保存', history: '履歴', preferences: '設定', language: '言語', systemDefault: 'システムに合わせる', currency: '通貨', autoCurrency: '自動 · {currency}', themeLight: 'ライト', themeDark: 'ダーク', switchTheme: '{theme}テーマに切り替え', startOver: '最初からやり直す', appTitle: 'Settle 共有支出の精算', downloadSettle: 'Settle をダウンロード', takeSettle: 'Settle をスマホでも', nativePrivateLocal: 'ネイティブ、プライベート、完全ローカル。', iosDevices: 'iPhone・iPad', android: 'Android', downloadApk: 'APK をダウンロード',
  whoIn: '参加者は？', whoInHelp: '名前を1人ずつ入力するか、カンマ区切りで貼り付けます。', names: '名前', namesPlaceholder: 'Akira, Yuki, Ren…', add: '追加', groupMembers: 'メンバー', removePerson: '{name}を削除', noOneYet: 'まだ誰もいません。', tryExample: '例を試す', exampleDinner: '金曜の夕食', exampleGroceries: 'ロッジの食材', exampleRide: '帰りのタクシー', whatPaid: '何を支払った？', whatPaidHelp: '共有支出を記録すると、残高を自動で計算します。', activity: '支出履歴', expenseOne: '{count}件の支出', expenseMany: '{count}件の支出', paidSplitEveryone: '{payer}が支払い · 全員で分割', paidSplitCustom: '{payer}が支払い · {names}で分割', editExpenseLabel: '{description}を編集', removeExpenseLabel: '{description}を削除', liveResult: 'リアルタイム結果', settlementPlan: '精算プラン', export: '書き出す', shareSettlement: '精算プランを共有', copyText: 'テキストをコピー', copyTextHelp: '名前、矢印、金額', copyChart: '画像をコピー', copyChartHelp: 'スマホ向け縦長画像', shareSavePng: 'PNGを共有 / 保存', downloadPng: 'PNGをダウンロード', portraitCardHelp: '読みやすい縦長の支払いカード',
  cleanSlateTitle: 'ここから始めましょう。', cleanSlateBody: '2人以上と支出を1件追加すると、返済プランが自動で表示されます。', alreadyEvenTitle: 'すでに精算済みです。', alreadyEvenBody: '誰にも支払いはありません。理想的な精算結果です。', totalSpend: '支出合計', repayments: '送金件数', people: '人数', onePayment: 'この送金で精算完了', wholeRepayments: '整数で精算', wholeRepaymentsHelp: '帳尻を合わせたまま公平に丸めます。', mathWorks: '計算方法', mathBody: 'Settle は各自の支払額と負担額を相殺し、最も大きい残高同士を組み合わせます。送金は最大でも人数より1件少なく、1円まで正確に計算されます。', footerTagline: '共有支出を、表計算なしで。', viewSource: 'ソースを見る',
  addTwoPeopleError: '支出を記録する前に2人以上追加してください。', choosePayerError: '支払った人を選んでください。', validAmountError: '有効な金額を入力してください。', positiveAmountError: '0より大きい金額を入力してください。', chooseShareError: '負担する人を1人以上選んでください。', sharedExpense: '共有支出', editing: '編集中', cancel: 'キャンセル', whatWasIt: '何の支出？', descriptionPlaceholder: '夕食、チケット、宿泊…', amount: '金額', paidBy: '支払った人', addPeopleFirst: '先にメンバーを追加', splitBetween: '負担する人', everyone: '全員', choosePeople: '人を選ぶ', sharingAria: 'この支出を負担する人', saveChanges: '変更を保存', addExpense: '支出を追加',
  historyMore: '{title} + 他{count}件', settlementFallback: '精算 · {date}', onThisDevice: 'このデバイス内', savedSettlements: '保存した精算', closeHistory: '履歴を閉じる', saveSettlement: 'この精算を保存', saveSettlementHelp: 'あとで開けるローカルスナップショットを保存します。', settlementName: '精算名', historyPlaceholder: '週末旅行、家賃と光熱費…', saveLocally: '端末に保存', addExpenseBeforeSave: '保存する前に支出を追加してください。', savedCounter: '{count} / 50 保存済み', noSavedTitle: '保存した精算はまだありません', noSavedBody: '保存したプランはこのデバイスにだけ残ります。', deleteLabel: '{title}を削除', peopleCount: '{count}人', openPlan: 'プランを開く', historyPrivacy: 'ここにあるデータはアップロードも同期もされません。',
  typeNameError: '名前を1つ以上入力してください。', duplicateNameError: 'そのメンバーはすでに追加されています。', removePersonError: '先に支出から{name}を外してから、グループから削除してください。', resetConfirm: '全員とすべての支出を消去しますか？元に戻せません。', savedOnDevice: 'このデバイスに保存しました', storageAccessError: 'ローカルストレージにアクセスできません', openHistoryConfirm: '「{title}」を開きますか？現在の内容は置き換わります。残す場合は先に保存してください。', deleteHistoryConfirm: '「{title}」をこのデバイスから削除しますか？', deleted: '削除しました', storageUpdateError: 'ローカルストレージを更新できません', textCopied: 'テキストをコピーしました', chartCopied: '画像をコピーしました', useDownloadPng: 'このブラウザでは「PNGをダウンロード」を使用してください', chartReady: '画像を共有できます', pngDownloaded: 'PNGをダウンロードしました', chartError: '画像を作成できません', paymentPlanFromSettle: 'Settleの支払いプラン', shareChartDialog: '支払い画像を共有または保存', diagramAria: '精算関係図', diagramTitle: '誰から誰への送金か', exportSubtitle: '誰が誰に送るか、一目で確認', toMove: '送金総額', paymentFlow: '送金先', payment: '送金', exportFooter: 'Settleで作成 · データはデバイス内に保存',
}

const ko: MessageTable = {
  appHome: 'Settle 홈', localOnly: '이 기기에만 저장', history: '기록', preferences: '환경설정', language: '언어', systemDefault: '시스템 설정 따르기', currency: '통화', autoCurrency: '자동 · {currency}', themeLight: '라이트', themeDark: '다크', switchTheme: '{theme} 테마로 전환', startOver: '처음부터 다시', appTitle: 'Settle 공동 지출 정산', downloadSettle: 'Settle 다운로드', takeSettle: '휴대폰에서도 Settle', nativePrivateLocal: '네이티브, 비공개, 완전 로컬.', iosDevices: 'iPhone 및 iPad', android: 'Android', downloadApk: 'APK 다운로드',
  whoIn: '누가 함께했나요?', whoInHelp: '이름을 하나씩 입력하거나 쉼표로 구분해 붙여넣으세요.', names: '이름', namesPlaceholder: '민준, 서연, 지우…', add: '추가', groupMembers: '그룹 멤버', removePerson: '{name} 삭제', noOneYet: '아직 아무도 없어요.', tryExample: '예시 사용', exampleDinner: '금요일 저녁', exampleGroceries: '숙소 장보기', exampleRide: '귀가 택시', whatPaid: '무엇을 결제했나요?', whatPaidHelp: '공동 지출을 기록하면 잔액을 자동으로 계산합니다.', activity: '지출 내역', expenseOne: '지출 {count}건', expenseMany: '지출 {count}건', paidSplitEveryone: '{payer} 결제 · 전원 분담', paidSplitCustom: '{payer} 결제 · {names} 분담', editExpenseLabel: '{description} 수정', removeExpenseLabel: '{description} 삭제', liveResult: '실시간 결과', settlementPlan: '정산 계획', export: '내보내기', shareSettlement: '정산 공유', copyText: '텍스트 복사', copyTextHelp: '이름, 화살표, 금액', copyChart: '이미지 복사', copyChartHelp: '휴대폰용 세로 이미지', shareSavePng: 'PNG 공유 / 저장', downloadPng: 'PNG 다운로드', portraitCardHelp: '읽기 쉬운 세로 결제 카드',
  cleanSlateTitle: '여기서 시작하세요.', cleanSlateBody: '두 명 이상과 지출 한 건을 추가하면 정산 계획이 자동으로 표시됩니다.', alreadyEvenTitle: '이미 정산이 끝났어요.', alreadyEvenBody: '서로 주고받을 돈이 없습니다. 가장 좋은 정산 결과예요.', totalSpend: '총지출', repayments: '송금 건수', people: '인원', onePayment: '이 송금 한 번이면 정산 완료', wholeRepayments: '정수 금액으로 정산', wholeRepaymentsHelp: '장부 균형을 유지하며 공정하게 반올림합니다.', mathWorks: '계산 방식', mathBody: 'Settle은 각자의 실제 결제액과 부담액을 상계한 뒤 가장 큰 잔액끼리 연결합니다. 송금 횟수는 최대 인원수보다 한 번 적고, 모든 금액이 정확히 반영됩니다.', footerTagline: '공동 지출, 스프레드시트 없이.', viewSource: '소스 보기',
  addTwoPeopleError: '지출을 기록하기 전에 두 명 이상 추가하세요.', choosePayerError: '결제한 사람을 선택하세요.', validAmountError: '올바른 금액을 입력하세요.', positiveAmountError: '0보다 큰 금액을 입력하세요.', chooseShareError: '분담할 사람을 한 명 이상 선택하세요.', sharedExpense: '공동 지출', editing: '수정 중', cancel: '취소', whatWasIt: '어떤 지출인가요?', descriptionPlaceholder: '저녁, 티켓, 숙소…', amount: '금액', paidBy: '결제한 사람', addPeopleFirst: '먼저 사람 추가', splitBetween: '분담 대상', everyone: '모두', choosePeople: '사람 선택', sharingAria: '이 지출을 분담하는 사람', saveChanges: '변경 저장', addExpense: '지출 추가',
  historyMore: '{title} + {count}건 더', settlementFallback: '정산 · {date}', onThisDevice: '이 기기에 저장', savedSettlements: '저장된 정산', closeHistory: '기록 닫기', saveSettlement: '이 정산 저장', saveSettlementHelp: '나중에 다시 열 수 있는 로컬 스냅샷을 저장합니다.', settlementName: '정산 이름', historyPlaceholder: '주말 여행, 아파트 공과금…', saveLocally: '기기에 저장', addExpenseBeforeSave: '정산을 저장하기 전에 지출을 추가하세요.', savedCounter: '{count} / 50 저장됨', noSavedTitle: '저장된 정산이 아직 없습니다', noSavedBody: '저장한 계획은 이 기기에만 남아 여기에 표시됩니다.', deleteLabel: '{title} 삭제', peopleCount: '{count}명', openPlan: '계획 열기', historyPrivacy: '여기의 데이터는 업로드되거나 동기화되지 않습니다.',
  typeNameError: '이름을 하나 이상 입력하세요.', duplicateNameError: '이미 그룹에 있는 사람입니다.', removePersonError: '먼저 관련 지출에서 {name}을 제외한 다음 그룹에서 삭제하세요.', resetConfirm: '모든 사람과 지출을 지울까요? 되돌릴 수 없습니다.', savedOnDevice: '이 기기에 저장했습니다', storageAccessError: '로컬 저장소에 접근할 수 없습니다', openHistoryConfirm: '“{title}”을 열까요? 현재 작업 공간이 바뀝니다. 유지하려면 먼저 저장하세요.', deleteHistoryConfirm: '이 기기에서 “{title}”을 삭제할까요?', deleted: '삭제됨', storageUpdateError: '로컬 저장소를 업데이트할 수 없습니다', textCopied: '텍스트를 복사했습니다', chartCopied: '이미지를 복사했습니다', useDownloadPng: '이 브라우저에서는 PNG 다운로드를 사용하세요', chartReady: '이미지를 공유할 수 있습니다', pngDownloaded: 'PNG를 다운로드했습니다', chartError: '이미지를 만들 수 없습니다', paymentPlanFromSettle: 'Settle 결제 계획', shareChartDialog: '결제 이미지 공유 또는 저장', diagramAria: '정산 관계도', diagramTitle: '누가 누구에게 보내는지', exportSubtitle: '누가 누구에게 보내는지 한눈에', toMove: '송금 총액', paymentFlow: '송금 흐름', payment: '송금', exportFooter: 'Settle로 생성 · 데이터는 기기에만 저장됩니다',
}

const es: MessageTable = {
  appHome: 'Inicio de Settle', localOnly: 'Permanece en este dispositivo', history: 'Historial', preferences: 'Preferencias', language: 'Idioma', systemDefault: 'Seguir el sistema', currency: 'Moneda', autoCurrency: 'Auto · {currency}', themeLight: 'claro', themeDark: 'oscuro', switchTheme: 'Cambiar al tema {theme}', startOver: 'Empezar de nuevo', appTitle: 'Settle: divide gastos compartidos', downloadSettle: 'Descargar Settle', takeSettle: 'Lleva Settle contigo', nativePrivateLocal: 'Nativo, privado y totalmente local.', iosDevices: 'iPhone y iPad', android: 'Android', downloadApk: 'Descargar APK',
  whoIn: '¿Quién participa?', whoInHelp: 'Añade nombres uno a uno o pega una lista separada por comas.', names: 'Nombres', namesPlaceholder: 'Alex, Maya, Theo…', add: 'Añadir', groupMembers: 'Miembros del grupo', removePerson: 'Eliminar a {name}', noOneYet: 'Todavía no hay nadie.', tryExample: 'Probar un ejemplo', exampleDinner: 'Cena del viernes', exampleGroceries: 'Compra para la cabaña', exampleRide: 'Taxi de vuelta', whatPaid: '¿Qué se pagó?', whatPaidHelp: 'Registra cada gasto compartido. Calcularemos los saldos al momento.', activity: 'Actividad', expenseOne: '{count} gasto', expenseMany: '{count} gastos', paidSplitEveryone: '{payer} pagó · dividido entre todos', paidSplitCustom: '{payer} pagó · dividido entre {names}', editExpenseLabel: 'Editar {description}', removeExpenseLabel: 'Eliminar {description}', liveResult: 'Resultado en vivo', settlementPlan: 'Plan de pagos', export: 'Exportar', shareSettlement: 'Compartir plan', copyText: 'Copiar texto', copyTextHelp: 'Nombres, flechas e importes', copyChart: 'Copiar imagen', copyChartHelp: 'Imagen vertical para el móvil', shareSavePng: 'Compartir / guardar PNG', downloadPng: 'Descargar PNG', portraitCardHelp: 'Tarjeta vertical fácil de leer',
  cleanSlateTitle: 'Empieza desde cero.', cleanSlateBody: 'Añade al menos dos personas y un gasto. El plan de pagos aparecerá automáticamente.', alreadyEvenTitle: 'Ya están a mano.', alreadyEvenBody: 'Nadie le debe nada a nadie. El mejor resultado posible.', totalSpend: 'Gasto total', repayments: 'Pagos', people: 'Personas', onePayment: 'Un pago y quedáis a mano', wholeRepayments: 'Pagos con números enteros', wholeRepaymentsHelp: 'Redondeo justo sin descuadrar las cuentas.', mathWorks: 'Cómo funciona el cálculo', mathBody: 'Settle compensa lo que pagó cada persona con su parte y después empareja los saldos más grandes. El resultado requiere como máximo un pago menos que el número de personas, sin perder ni un céntimo.', footerTagline: 'Gastos compartidos, sin hojas de cálculo.', viewSource: 'Ver código fuente',
  addTwoPeopleError: 'Añade al menos dos personas antes de registrar un gasto.', choosePayerError: 'Elige quién pagó este gasto.', validAmountError: 'Introduce un importe válido.', positiveAmountError: 'Introduce un importe mayor que cero.', chooseShareError: 'Elige al menos una persona para compartir este gasto.', sharedExpense: 'Gasto compartido', editing: 'Editando', cancel: 'Cancelar', whatWasIt: '¿Qué fue?', descriptionPlaceholder: 'Cena, entradas, alojamiento…', amount: 'Importe', paidBy: 'Pagado por', addPeopleFirst: 'Añade personas primero', splitBetween: 'Dividir entre', everyone: 'Todos', choosePeople: 'Elegir personas', sharingAria: 'Personas que comparten este gasto', saveChanges: 'Guardar cambios', addExpense: 'Añadir gasto',
  historyMore: '{title} + {count} más', settlementFallback: 'Plan · {date}', onThisDevice: 'En este dispositivo', savedSettlements: 'Planes guardados', closeHistory: 'Cerrar historial', saveSettlement: 'Guardar este plan', saveSettlementHelp: 'Guarda una copia local para abrirla más tarde.', settlementName: 'Nombre del plan', historyPlaceholder: 'Viaje de fin de semana, facturas del piso…', saveLocally: 'Guardar localmente', addExpenseBeforeSave: 'Añade un gasto antes de guardar este plan.', savedCounter: '{count} / 50 guardados', noSavedTitle: 'Aún no hay planes guardados', noSavedBody: 'Los planes guardados permanecen en este dispositivo y aparecerán aquí.', deleteLabel: 'Eliminar {title}', peopleCount: '{count} personas', openPlan: 'Abrir plan', historyPrivacy: 'Nada de esto se sube ni se sincroniza.',
  typeNameError: 'Escribe al menos un nombre.', duplicateNameError: 'Esas personas ya están en el grupo.', removePersonError: 'Quita a {name} de sus gastos antes de eliminarlo del grupo.', resetConfirm: '¿Borrar todas las personas y gastos? No se puede deshacer.', savedOnDevice: 'Guardado en este dispositivo', storageAccessError: 'No se pudo acceder al almacenamiento local', openHistoryConfirm: '¿Abrir “{title}”? Sustituirá el espacio de trabajo actual. Guárdalo antes si quieres conservarlo.', deleteHistoryConfirm: '¿Eliminar “{title}” de este dispositivo?', deleted: 'Eliminado', storageUpdateError: 'No se pudo actualizar el almacenamiento local', textCopied: 'Texto copiado', chartCopied: 'Imagen copiada', useDownloadPng: 'Usa Descargar PNG en este navegador', chartReady: 'Imagen lista para compartir', pngDownloaded: 'PNG descargado', chartError: 'No se pudo crear la imagen', paymentPlanFromSettle: 'Plan de pagos de Settle', shareChartDialog: 'Compartir o guardar imagen de pagos', diagramAria: 'Diagrama de pagos', diagramTitle: 'Quién envía dinero a quién', exportSubtitle: 'Quién envía qué, de un vistazo', toMove: 'Total a mover', paymentFlow: 'Flujo de pagos', payment: 'Pago', exportFooter: 'Creado con Settle · Tus datos permanecen en tu dispositivo',
}

const messages: Record<SupportedLanguage, MessageTable> = {
  en,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  ja,
  ko,
  es,
}

const languageLocales: Record<SupportedLanguage, string> = {
  en: 'en-US',
  'zh-CN': 'zh-CN',
  'zh-TW': 'zh-TW',
  ja: 'ja-JP',
  ko: 'ko-KR',
  es: 'es-ES',
}

export function localeForLanguage(language: SupportedLanguage): string {
  return languageLocales[language]
}

export function resolveLanguage(
  preference: LanguagePreference,
  systemLocale = typeof navigator === 'undefined' ? 'en-US' : (navigator.languages[0] ?? navigator.language),
): SupportedLanguage {
  if (preference !== 'system') return preference
  const normalized = systemLocale.replace('_', '-').toLowerCase()
  if (normalized.startsWith('zh')) {
    return /-(tw|hk|mo)\b/.test(normalized) || normalized.includes('hant') ? 'zh-TW' : 'zh-CN'
  }
  if (normalized.startsWith('ja')) return 'ja'
  if (normalized.startsWith('ko')) return 'ko'
  if (normalized.startsWith('es')) return 'es'
  return 'en'
}

const regionCurrencies: Record<string, Currency> = {
  US: 'USD', GB: 'GBP', CA: 'CAD', AU: 'AUD', CN: 'CNY', JP: 'JPY', KR: 'KRW',
  MX: 'MXN', BR: 'BRL', TW: 'TWD', IN: 'INR',
  AT: 'EUR', BE: 'EUR', CY: 'EUR', DE: 'EUR', EE: 'EUR', ES: 'EUR', FI: 'EUR',
  FR: 'EUR', GR: 'EUR', HR: 'EUR', IE: 'EUR', IT: 'EUR', LT: 'EUR', LU: 'EUR',
  LV: 'EUR', MT: 'EUR', NL: 'EUR', PT: 'EUR', SI: 'EUR', SK: 'EUR',
}

export function detectCurrency(systemLocale: string): Currency {
  try {
    const locale = new Intl.Locale(systemLocale)
    const region = locale.region?.toUpperCase()
    if (region && regionCurrencies[region]) return regionCurrencies[region]
    const language = locale.language.toLowerCase()
    if (language === 'zh') return 'CNY'
    if (language === 'ja') return 'JPY'
    if (language === 'ko') return 'KRW'
    if (language === 'es') return 'EUR'
  } catch {
    // Fall through to the safest widely supported default.
  }
  return 'USD'
}

export function translate(
  language: SupportedLanguage,
  key: MessageKey,
  replacements: Record<string, string | number> = {},
): string {
  return Object.entries(replacements).reduce(
    (value, [name, replacement]) => value.replaceAll(`{${name}}`, String(replacement)),
    messages[language][key],
  )
}
