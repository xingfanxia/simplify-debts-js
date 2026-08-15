# Goal: 将微信共享分账重构为“先建房、群邀请、成员自动加入”

## Intent

让用户无需先创建本地参与人或支出，就能建立空白共享账单并把邀请卡片发到现有微信群。每个受邀微信用户以服务端确认的微信身份加入，自动成为账单成员和参与人，然后共同记账。

产品不再要求认领身份，也不采集或保存真实微信头像。普通本地账单继续完全离线；共享房间只有在用户明确创建或加入时才保存云端数据。权限、隐私和账单正确性优先，成员只需确认一次房间昵称，界面使用昵称首字母占位头像。

## Grounded context

- Verified: 仓库为 `/Users/xingfanxia/projects/simplify-debts-js`，基线为 `main@b1ff9a2`。
- Verified: 当前实现要求本地至少两人和一笔支出，并在建房/加入时使用显示名称和参与人认领 — `miniprogram/pages/index/index.js`、`miniprogram/pages/room/room.js`、`cloudfunctions/ledger/service.js`。
- Verified: V2 产品和安全方案位于 `docs/wechat-shared-room-v2-plan.md`，它取代旧的 `docs/wechat-shared-room-plan.md`。
- Verified: CloudBase 可从 `cloud.getWXContext().OPENID` 提供服务端可信的微信身份；客户端传参不能替代该身份。
- Decision (2026-08-15): 不实现真实头像上传、CloudBase 文件存储或临时头像 URL；只使用 `input type="nickname"` 让用户确认房间昵称，并在客户端生成首字母占位头像。
- Verified: 生产环境为 `cloud1-d3gbdocpk8fcb2e97`，已有私有 `ledger_*` 集合、`ledger` 和 `ledger_cleanup`；生产变更不属于本 Goal 的默认授权。
- Assumption: 正式环境尚无需要保留的真实共享房间数据。实施第一步必须只读验证；如果不成立，按迁移规则暂停受影响的生产操作。

## Done state

### 用户流程

- 首页始终可从空白状态创建共享账单，不要求先添加参与人或支出。
- 创建界面只要求房间名称、币种和昵称；创建者由服务端自动登记为 owner 与 participant。
- 房主可以把带安全邀请 token 的小程序卡片发送到现有微信群。
- 受邀用户打开后只能看到最小房间摘要；确认昵称后直接加入，不认领参与人。
- 每个有效微信成员自动且唯一地对应一个账单 participant；重复加入和弱网重试不产生重复数据。
- 每位有效成员均可新增、编辑和删除支出；新增时付款人默认自己，结算在所有成员端保持一致。
- 房主可以生成/撤销邀请、移除成员、归档和删除；普通成员可以退出；撤权在下一次请求或 3 秒内生效。
- 房间离线只读；本地账单、历史、币种、支出编辑和结算分享无回归，也不会自动上传。

### 身份和资料

- 所有身份与角色由服务端 `OPENID` 和现有 membership 决定；客户端提供的 OpenID、role、owner、memberId 或 participantId 不能提升权限。
- 应用集合不保存或返回原始 OpenID；成员鉴权键保持房间级单向派生。
- 昵称按房间保存，不建立跨房间用户画像；用户可以更新自己的房间昵称。
- 不请求、上传、保存或返回真实头像；所有头像样式仅由客户端根据昵称生成。
- 旧的认领协议和 UI 被删除；任何试图通过旧字段指定他人身份的请求被拒绝。

### 运维与隐私

- 数据保留、退出、移除、房主删除和 30 天恢复窗有一致实现与文档。
- 微信隐私保护指引和审核说明准确披露昵称、成员关系、共享支出、用途、访问对象和删除方式，并且不声称采集头像。
- 生产 CloudBase 配置、函数、存储规则和小程序版本只在用户分别确认后变更。

## Proof

- Run/check: `npm test`
  Pass when: 所有既有测试与 V2 测试通过，且没有删除或弱化安全断言。
- Run/check: `npm run typecheck && npm run build`
  Pass when: 两个命令退出码均为 0。
- Run/check: `node --check cloudfunctions/ledger/index.js && node --check cloudfunctions/ledger/service.js && node --check cloudfunctions/ledger/repository.js`
  Pass when: 所有云函数入口与服务文件语法检查通过。
- V2 service tests must prove:
  - 零支出空房间可创建，owner 自动绑定唯一 participant；
  - 伪造 OpenID、角色、memberId、participantId 或旧认领字段不能改变身份；
  - 邀请预览不包含成员资料、支出、余额、roomId 或 token 原文；
  - 新微信账号加入只创建一个 member/participant，重复加入幂等；
  - 非成员、撤销/过期/耗尽邀请、被移除成员不能读取或写入；
  - 普通成员可写支出但不能执行房主操作；
  - revision 冲突明确返回最新授权快照且不静默覆盖；
  - 昵称必填、长度受限，恶意或超限输入被拒绝；旧头像上传动作不再存在；
  - 日志和响应不泄露 OpenID、AppSecret、私钥或邀请 token。
- Developer Tools inspection:
  - 320px、390px、430px 常见视口下创建、邀请落地、加入和房间页面无横向溢出，主要操作清楚可点击；
  - 空白首页能进入建房；加入页没有认领列表或头像授权；昵称输入符合微信组件行为；
  - 无 CloudBase 配置时本地模式仍正常且不显示虚假云端成功。
- Independent two-account proof after authorization:
  - A 创建空房间并把卡片发到微信群；B 打开并确认昵称加入；
  - A/B 分别新增与编辑支出，另一端 3 秒内刷新；
  - B 重复打开邀请不会重复加入；A 移除 B 后 B 失去云端访问；
  - 非成员看不到账单或成员昵称；本地账单从未自动上传。

## Scope and authority

- May read: 整个仓库、V2 计划、当前 CloudBase/微信官方文档、现有生产资源的只读状态、`~/creds/README.md` 和任务所需凭据路径（不得输出内容）。
- May change: `miniprogram/`、`cloudfunctions/`、相关测试/脚本/config、`docs/wechat-*`、`package.json` 中必要命令，以及本仓库内直接相关代码。
- Must preserve: 用户已有改动；本地优先模式；中文和多币种；结算算法；简洁工具型视觉；Web/iOS/Android 当前行为；已有生产数据。
- Git authority: 完整验证后可提交并推送当前分支；不得 force push、覆盖用户工作或重写历史。
- Requires new authorization:
  - 创建/修改/删除生产集合、索引、安全规则或数据；
  - 部署/重建云函数或更改生产运行配置；
  - 修改微信公众平台隐私保护指引；
  - 上传体验版、提交审核或发布；
  - 迁移或删除任何现有房间资料；
  - 轮换凭据、开启付费资源或扩大到其他客户端。

## Non-goals and invalid shortcuts

- 不创建或管理真正的微信群；只把小程序邀请卡片发送到现有聊天或群。
- 第一版不做本地账单导入、未加入访客参与人、聊天、订阅消息、联系人读取、跨房间社交资料、离线编辑或 Web/iOS/Android 共享账号。
- 不得把客户端昵称当作身份；身份只能来自服务端微信上下文。
- 不得新增头像上传、公开文件或跨房间资料集合，除非重新取得授权并更新隐私边界。
- 不得把 invite token、roomId 或短码当成读取账单的充分权限。
- 不得只删除认领 UI 而保留可由客户端指定 participant/role 的旧服务端协议。
- 不得在未部署和双账号真机验收前声称线上共享流程已完成。

## Priorities and tradeoffs

1. 服务端身份、权限和私人资料访问边界。
2. 账单事实、幂等和并发正确性。
3. 空房建房、群邀请和无认领加入的易用性。
4. 本地模式零回归。
5. 手机可读性和视觉一致性。
6. 减少资料确认点击和视觉装饰。

保留一次昵称确认用于群内可读性；不得把昵称当作鉴权凭证。

## Unknowns and decision rules

- 首个工作单元只读确认生产是否已有房间数据；若有，先产出兼容/迁移方案并在任何生产写入前请求授权。
- 昵称默认按房间存储。若实现必须增加全局 profile 集合，暂停并说明跨房间关联、删除语义和隐私影响，不自行扩大。
- 如果当前事务上限或存储接口与计划冲突，以可复现实验和官方文档为准，调整实现但保持 Done state。
- 无关问题记录，不扩大到其他平台或营销功能。

## Control loop and resumption

- Work units:
  1. 固化现状测试、只读资源审计和 V2 协议；
  2. 实现服务端空房创建、自动 member/participant 与无认领加入；
  3. 实现按房间昵称的安全保存/读取、首字母占位和负向测试；
  4. 重做首页建房、邀请落地和房间成员/支出体验；
  5. 完成并发、离线、撤权、隐私和移动视口验证；
  6. 更新部署/回滚/审核文档并提交推送；
  7. 分别获权后部署、上传并完成双账号真机验收。
- Completion condition per unit: 对应代码、测试或检查证据可由下一次会话复现，不以聊天声明代替。
- State: 使用原生 Goal/线程状态；恢复时先检查 `git status`、最近提交、测试和生产只读状态，不重做已完成工作。
- Retry boundary: 同一失败假设连续三次后必须更换假设或策略并保存证据；不得机械重试或绕过平台安全策略。
- Stop when: Done state 与 Proof 全部通过；或遇到必须新增生产权限、破坏现有数据或扩大平台范围的决定并等待用户。

## Delivery

- Produce: V2 小程序与云函数、权限/昵称负向测试、更新后的计划/运行手册/隐私和双账号验收清单。
- Report: 改动文件、命令结果、开发者工具截图、生产资源变更、未决风险和下一项授权。
- Complete only when: 本地门槛、生产部署核验和两个真实微信账号的完整流程均通过。
- Otherwise report: `partial` 或 `blocked`，附证据和继续所需的最小决定；不得标记完成。

## Execution log

- 2026-08-15：用户确认生产部署与代码上传，并明确取消真实头像，只保留昵称和首字母占位。
- 部署前通过微信官方只读数据库接口确认 `cloud1-d3gbdocpk8fcb2e97` 的 `ledger_rooms` 计数为 0，无旧房间迁移风险。
- 已部署 `ledger` 与 `ledger_cleanup`；远端均为 `Active`，超时分别为 20/300 秒，运行时分别为 `Nodejs16.13`/`Nodejs20.19`，下载远端代码逐文件比对一致。
- 已生成 139.7 KB 预览包并上传小程序代码版本 `2.0.3`。当前状态仍为 partial：公众平台隐私指引、设为体验版和双账号真机验收尚未完成，未提交审核或发布。
- 自动化服务验收已覆盖 A/B 两个独立微信身份分别新增和编辑支出，并证明双方最终 revision、支出快照和结算路径一致；该证据不能替代最后的双账号真机验收。
