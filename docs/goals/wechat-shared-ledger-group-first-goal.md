# Goal: 完成微信小程序“本地快算 / 群组共享”双模式与稳定 Emoji 成员标记

## Intent

把小程序做成易懂、易读、低摩擦的中文分账工具：用户在首页直接选择离线快算或微信群共享；共享账单从空房创建并由微信身份自动加入，成员通过完整昵称和稳定 Emoji 快速辨认，不需要认领身份，也不采集真实头像。

当体验、装饰和可靠性冲突时，优先保证权限安全、账单正确、本地模式零回归和手机可读性。

## Grounded context

- Verified (2026-08-15): 仓库为 `/Users/xingfanxia/projects/simplify-debts-js`，起草基线为 `main@baf49cd`。
- Verified: 详细产品、数据、权限和工作包方案位于 `docs/wechat-shared-room-v2-plan.md`，本 Goal 以该文件为实现规格。
- Verified at goal start: 首页使用独立共享 banner + 创建弹层，未形成明确双模式；本地、共享、历史和结算图使用昵称首字母，服务端 profile 只允许昵称。
- Verified: 空房创建、邀请加入、服务端微信身份和两账号自动化共同编辑已在现有代码中实现并测试。
- Verified: 生产环境为 `cloud1-d3gbdocpk8fcb2e97`；`ledger`/`ledger_cleanup` 已部署，代码版本 `2.0.3` 已上传，但新的生产变更不属于本 Goal 的默认授权。
- Verified implementation checkpoint (2026-08-15): 首页已改成常驻双模式；本地、共享、历史和结算图已统一使用受限 Emoji；服务端 profile、事务内分配和旧数据兼容已实现，仍需通过本 Goal 的完整门禁并提交。
- Verified visual checkpoint (2026-08-15): 微信开发者工具 `2.02.2607171`、基础库 `3.17.0` 已检查 320、390、430px；详细记录位于 `docs/wechat-v2-visual-verification.md`。
- Verified production preflight (2026-08-15, read-only): `cloud1-d3gbdocpk8fcb2e97` 中 `ledger` 与 `ledger_cleanup` 均为 Active；下载比对确认线上 `ledger` 尚无 `avatar.js` 且 `service.js` 与当前提交不同，`ledger_cleanup` 的应用源码未变。下一项生产变更只需部署 `ledger`，仍需用户新授权。
- Decision: 不获取或保存真实头像；默认使用 50 个受限动物/食物 Emoji，自动分配并持久化，用户可选修改。
- Assumption: 共享房间人数上限低于 50，因此自动分配在正常范围内可以做到房间内不重复。若代码事实不符，先调整规则和测试，不扩大资源范围。

## Done state

### 首页与模式

- 首页顶部有紧凑、同级且始终可见的 `本地快速分账` 与 `共享账单` 选择；默认本地模式。
- 选中本地模式只显示本地参与人、支出和结算工作流；选中共享模式直接显示内联创建表单，不再出现旧共享 banner 或二级创建弹层。
- 模式切换不丢失各自未提交输入；邀请卡片和共享历史可以直达房间。
- CloudBase 不可用时共享模式明确不可用，本地模式仍完整工作且不伪装云端成功。
- 视觉为克制的中文工具界面，没有荧光色、大段品牌文案、重复设置入口或不必要装饰。

### Emoji 成员标记

- 有且只有一份 50 个常见动物/食物 Emoji 的白名单和分配/校验模块。
- 新本地参与人和共享成员自动获得一个持久化 Emoji；有可用选项时同一账单内自动分配不重复。
- 同一参与人的 Emoji 在刷新、重启、换设备、参与人列表、支出、结算、历史和分享图片中保持一致；完整昵称始终显示。
- Emoji 选择是可选操作：当前工作流内可打开选择面板，并提供 50 个选项、`随机一个` 与 `恢复自动分配`；不新增独立设置菜单。
- 本地账单可修改任意手动参与人的 Emoji；共享成员只能修改自己的 Emoji。
- 旧记录缺少 Emoji 时仍可读取，获得稳定回退并在下一次正常保存时持久化；非法 Emoji 不进入持久化状态或画布。

### 共享流程与权限

- 共享账单可从零参与人、零支出的首页状态创建；输入仅包含账单名称、币种和一次昵称确认，Emoji 已自动提供。
- 创建者由服务端微信身份自动成为 owner/member/participant；邀请成员确认昵称后自动、幂等加入，不认领任何身份。
- 每位有效成员可以共同增删改支出；新增付款人默认自己；所有成员看到一致 revision、账单快照和结算结果。
- Emoji 作为受限房间资料与 nickname 一起保存，但不用于鉴权；服务端只允许调用者修改自己的共享 profile，并原子同步 member/participant。
- 邀请预览不返回成员昵称、Emoji、列表、支出、余额、内部 ID 或 token 原文。
- 客户端伪造 OpenID、角色、memberId、participantId、头像 URL/文件 ID、旧认领字段或非法 Emoji 都不能改变身份、权限或数据。
- 不请求、上传、缓存或返回真实微信头像，不新增跨房间 profile 或 CloudBase 文件存储。

### 兼容、质量与交付

- 本地历史、币种、取整、支出编辑、结算算法、文本分享和结算图无功能回归。
- 320、390、430px 视口下首页两模式、创建/加入、房间、Emoji 选择、历史和分享图无横向溢出或重叠，正文和金额无需缩放即可阅读，主要点击区至少 44px。
- 代码、测试、说明、运行手册、隐私说明草案和发布验收清单一致；任务改动经验证后提交并正常推送。
- 生产部署、隐私指引修改和新版本上传只能在分别获得用户确认后执行；最终完成还需两个真实微信账号通过群邀请与共同记账验收。

## Proof

- Run/check: `npm test`
  Pass when: 全部既有与新增测试通过，且没有删除或弱化身份、权限、隐私、并发和本地兼容断言。
- Run/check: `npm run typecheck && npm run build`
  Pass when: 两个命令退出码均为 0。
- Run/check: `node --check cloudfunctions/ledger/index.js && node --check cloudfunctions/ledger/service.js && node --check cloudfunctions/ledger/repository.js`
  Pass when: 所有云函数入口和服务文件语法检查通过。
- Run/check: `git diff --check`
  Pass when: 无空白错误；最终提交只包含本任务相关文件且不包含凭据。
- Automated tests must prove:
  - 白名单恰好 50 个唯一 Emoji，稳定分配、正常人数避重、显式修改、随机/恢复自动和旧数据回退行为明确；
  - 本地持久化与共享 snapshot 只接受白名单 Emoji；URL、文件 ID、组合字符串和未知 profile 字段被拒绝；
  - 共享默认 Emoji 在加入事务内分配，重复加入不重复建成员，member/participant 始终同步；
  - 普通成员只能更新自己的 nickname/Emoji，不能修改他人或执行房主操作；
  - 邀请预览、日志与缓存不泄露成员资料、OpenID、AppSecret、私钥或 token；
  - 首页存在明确双模式，旧共享 banner/创建弹层/认领 UI 不再存在，无云配置时本地流程仍可用；
  - A/B 独立成员共同编辑后得到相同 revision、快照和结算结果。
- WeChat Developer Tools inspection:
  - 在 320、390、430px 检查首页两模式、共享内联创建、邀请加入、房间、Emoji 选择、历史和分享图；
- 使用长中文昵称、至少 10 人、多个币种与低可视高度/输入聚焦状态检查可读性、点击面积、截断和溢出；真实系统键盘遮挡在上传后的真机验收中复核；
  - 留存截图或明确记录开发者工具版本、视口与观察结果，不以“已看过”代替证据。
- Independent two-account proof after production authorization:
  - A 创建空共享账单并把卡片发到微信群；B 确认昵称后加入，双方获得不同默认 Emoji；
  - A/B 分别新增、编辑支出，另一端在 3 秒内同步；重开后 Emoji、revision 和结算保持一致；
  - B 只能修改自己的 Emoji；A 移除 B 后 B 失去云端访问；
  - 历史与结算图片中的昵称、Emoji、箭头和金额清楚一致。

## Scope and authority

- May read: 整个仓库、微信/CloudBase 当前官方文档、现有生产资源的只读状态、`~/creds/README.md` 和任务所需凭据路径；不得输出凭据内容。
- May change: `miniprogram/`、`cloudfunctions/`、相关测试、配置和脚本、`docs/wechat-*`、本 Goal 文件以及必要的 `package.json` 命令。
- May commit/push: 完成相应本地门槛后可提交并正常推送当前分支；只暂存本任务文件。
- Must preserve: 用户已有改动；Web/iOS/Android 行为；本地优先与中文多币种；结算算法；已有生产数据；现有身份、权限、邀请和删除语义。
- Requires new authorization:
  - 创建、修改或删除生产集合、索引、安全规则、数据或运行配置；
  - 部署/重建生产云函数；
  - 修改微信隐私保护指引；
  - 生成或上传新的体验/代码版本、设为体验版、提交审核或发布；
  - 迁移/删除现有房间资料、轮换凭据、开启付费资源或扩展到其他客户端。

## Non-goals and invalid shortcuts

- 不创建或管理真正的微信群，只发送小程序邀请卡片到现有会话。
- 不做本地账单导入共享房间、聊天、联系人读取、订阅消息、离线共享编辑、跨房间社交资料或 Web/iOS/Android 共享账号。
- 不获取真实微信头像，也不以头像 URL、云文件或上传功能替代 Emoji。
- 不把昵称、Emoji、roomId、memberId、participantId、邀请短码或 token 当成身份凭证。
- 不得只替换首字母文案而忽略持久化、避重、历史、分享图、服务端校验和成员权限。
- 不得只隐藏旧共享 banner/弹层而保留混乱状态或丢失用户输入。
- 不得为了通过测试删除安全断言、跳过移动视觉检查或把自动化双身份测试冒充真实双账号验收。
- 未经授权不得部署、上传或修改公众平台资料；未经生产核验与双账号验收不得声称线上完成。

## Priorities and tradeoffs

1. 服务端身份、成员权限和私人账单访问边界。
2. 账单事实、幂等、并发与本地数据兼容。
3. 首页双模式与空房群邀请的直觉性。
4. 手机可读性、点击性和跨表面一致性。
5. Emoji 个性化与视觉精致度。

当 Emoji 自由选择与辨识度冲突时，允许用户主动重复，但自动分配继续避重；当视觉装饰与信息密度冲突时，保留昵称、金额和主要操作，去掉装饰。

## Unknowns and decision rules

- 首个工作单元核对共享房间人数上限、当前本地持久化和 snapshot 契约；可用白名单足够时采用事务内避重，不能静默依赖数组顺序制造不稳定结果。
- 若现有生产数据缺少 Emoji，不做破坏性批量迁移；优先兼容读取与正常写入时补全。任何生产回填都需单独授权。
- 若微信画布在目标设备不能可靠渲染某个 Emoji，先用白名单内可验证字符替换并更新兼容测试；不退回真实头像或不可读的小字母。
- 若实现必须新增全局 profile、公开文件或扩大隐私申报，暂停该部分并说明数据关联、访问和删除影响，不自行扩大范围。
- 无关问题记录但不扩展到其他平台或营销功能。

## Control loop and resumption

- Work units:
  1. 固化基线，核对参与人数、持久化、snapshot、历史和画布字段流；
  2. 完成单一 Emoji 模块、本地/共享数据契约与兼容测试；
  3. 用紧凑双模式和共享内联创建替换首页旧入口；
  4. 统一本地、共享、历史、结算与分享图的 Emoji 展示和选择体验；
  5. 完成服务端自资料权限、事务避重、邀请最小披露和负向测试；
  6. 运行完整门槛与 320/390/430px 微信开发者工具视觉验收，修复发现的问题；
  7. 更新文档，提交并推送本地实现；
  8. 分别获权后部署云函数、更新隐私指引、上传版本并完成双账号真机验收。
- Completion condition per unit: 对应行为有可复现代码、测试或视觉证据；聊天声明不算完成。
- State: 使用原生 Goal/线程状态，以本文件和 `docs/wechat-shared-room-v2-plan.md` 为恢复入口；恢复时先检查 `git status`、最近提交、测试和生产只读状态。
- Retry boundary: 同一失败假设连续三次后必须更换假设或策略并保留证据；不得机械重试或绕过平台安全策略。
- Stop when: Done state 与 Proof 全部通过；或遇到需要新增生产权限、破坏现有数据、扩大隐私边界或平台范围的决定并等待用户。

## Delivery

- Produce: 完成的双模式小程序、稳定 Emoji 资料契约、权限/兼容测试、移动截图证据，以及更新后的计划、说明、运行手册、隐私草案和发布清单。
- Report: 用户可见变化、关键文件、验证命令、视觉证据、生产变更、未决风险和下一项授权。
- Complete only when: 本地门槛、生产部署核验和两个真实微信账号的完整群邀请流程均通过。
- Otherwise report: `partial` 或 `blocked`，附证据和继续所需的最小决定；不得把未部署、未上传或未真机验收的状态标记为完成。
