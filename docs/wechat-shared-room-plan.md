# 微信共享分账房间方案（已由 V2 取代）

> 本文记录最初的“把本地账单转换为共享账单并认领参与人”方案，已不再作为实现依据。
> 当前方案见 [wechat-shared-room-v2-plan.md](./wechat-shared-room-v2-plan.md)。

## 结论

如果只是把结算结果发给朋友，当前文字/图片分享已经够用；如果要让被邀请的人进入同一笔账、持续查看并共同编辑，就需要云端共享状态。对这个原生微信小程序，CloudBase 云函数 + 文档数据库是最轻量的方案，不需要再维护一套传统服务器，也不需要把 AppSecret 放进客户端。

`guandan-scorer-wxapp` 已验证了房间码、分享路径、云函数读取、版本号并发控制和双账号验收这条链路。分账产品与它的关键区别是：掼蛋房间是“房主写、其他人围观”，共享账单是“多成员读写”。因此这里复用房间生命周期和分享入口，但不能复用“知道房间码即可读取”或“只有房主能写”的权限模型。

## 产品边界

- 普通本地账单继续保持本机存储，无需登录、无需网络。
- 用户主动点“创建共享账单”后，才把这一笔账上传到云端。
- 创建者是房主；通过邀请加入的人默认是可编辑成员。
- 微信账号身份与账单参与人分开建模。成员加入时可以认领已有参与人（例如“我是小浩”），也可以新增自己；未使用微信的参与人仍可作为访客存在。
- 房主可撤销邀请、移除成员、归档或删除房间。成员可以退出房间。
- 第一版不做聊天、头像授权、订阅消息、朋友圈裂变、复杂管理员角色或离线写入队列。

## 推荐数据模型

所有集合先设为仅管理端读写；客户端只调用云函数，不直接读写原始集合。这样可以避免把 OpenID 或未脱敏账单暴露给拿到房间 ID 的非成员。

| 集合 | 关键字段 | 用途 |
|---|---|---|
| `ledger_rooms` | `_id`, `title`, `currency`, `ownerMemberId`, `revision`, `status`, `memberDocIds`, `participantDocIds`, `expenseDocIds`, `inviteIds` | 房间元数据、并发版本与事务内文档索引 |
| `ledger_members` | `_id`（房间 ID + 运行时 OpenID 的单向哈希）, `roomId`, `memberId`, `displayName`, `role`, `participantId`, `joinedAt`, `revokedAt` | 房间权限和参与人认领关系；不保存原始 OpenID |
| `ledger_participants` | `roomId`, `participantId`, `name`, `claimedByMemberId`, `createdAt` | 实际参与分账的人，包括未注册访客 |
| `ledger_expenses` | `roomId`, `expenseId`, `description`, `amountMinor`, `paidByParticipantId`, `splitParticipantIds`, `createdByMemberId`, `updatedAt`, `deletedAt` | 支出事实；金额按币种最小单位保存（如分、日元、韩元） |
| `ledger_invites` | `tokenHash`, `roomId`, `createdByMemberId`, `expiresAt`, `maxUses`, `usedCount`, `revokedAt` | 可撤销、可过期的邀请能力 |
| `ledger_mutations` | `roomId`, `mutationId`, `memberId`, `kind`, `createdAt` | 写入重试的幂等记录，可按保留期清理 |

云函数只在请求期间使用 `getWXContext()` 提供的 OpenID，并把“房间 ID + OpenID”的单向哈希作为成员文档键；应用集合不保存原始 OpenID，也不返回客户端。不同房间的键无法直接关联，客户端看到的只是随机 `memberId`。邀请链接只携带高熵 token，不把 `roomId` 当成授权凭证。

共享房间已有支出时只展示相同小数精度的币种选项：两位小数币种之间可直接切换，JPY/KRW 两个整数币种之间可切换；删除全部支出后可跨组选择。服务端同样拒绝对已有支出做跨精度重解释，避免把 `12.34` 元静默变成 `1234` 日元。用户也可以在创建共享账单前从本地首页选择任意支持币种。

## 页面与用户流程

1. 当前账单顶部增加“共享”入口；用户点后明确提示“这笔账将同步给房间成员”。
2. `room_create` 把当前参与人和支出写入 CloudBase，并把创建者登记为 owner。
3. 房主点“邀请成员”，`room_invite` 生成有过期时间和最大使用次数的 token。
4. 分享卡使用 `/pages/room/room?invite=<token>`。微信官方 CloudBase 示例确认 `onShareAppMessage` 的 `path` 可以携带参数并由落地页读取。
5. 接收者打开后，`room_join_preview` 只返回房间名、币种和可认领的参与人，不返回支出。
6. 接收者输入房间显示名并选择“我是某位参与人”或“新增自己”，`room_join` 在事务中验证 token、增加使用次数并创建成员。
7. 成员进入房间页，`room_get` 先校验 membership，再返回脱敏账单快照。
8. 新增、编辑、删除支出全部走 `room_mutate`。云函数再次校验成员角色，事务写入并递增 `revision`。

## 同步与并发

- 第一版采用“打开页面立即拉取 + 前台每 2–3 秒轮询 + `onShow` 强制刷新”。轮询携带客户端已知 revision；未变化时服务端只验证房间和成员权限并返回轻量结果，变化时才读取完整快照。这样保持 3 秒内同步与移除生效，同时避免反复读取全部支出。
- 版本化写入带 `baseRevision` 和客户端生成的稳定 `mutationId`。版本落后时返回 `revision_conflict` 以及已鉴权的最新快照，客户端直接刷新；同一逻辑操作在弱网重试时复用原 `mutationId`，服务端返回第一次结果。建房也使用 `mutationId`；加入房间由 `(roomId, OPENID)` 唯一成员键天然幂等。
- 创建成员、消费邀请次数以及账单写入涉及多文档时使用服务端事务。CloudBase 官方文档说明事务只支持服务端 SDK，并提供 ACID 保证。
- 第二阶段如果确实需要即时更新，可增加不含 OpenID 的 `ledger_room_views` 投影集合，并用成员文档 + 自定义安全规则控制 `watch()` 读取；不要直接 watch 原始成员或邀请集合。官方文档说明实时监听仍受集合读权限约束。
- 第一版离线时只展示最近一次缓存快照并标注“离线”；不接受离线编辑，避免静默覆盖他人的修改。

实现使用单个 `ledger` 云函数作为经过验证的动作路由，提供上述七种等价能力。这样输入校验、身份提取、错误协议和权限检查只有一个事实源，不需要在七份云函数中复制安全逻辑。

CloudBase 事务当前最多 100 次操作，并且事务内只支持 `doc`、不支持 `where`。因此 `ledger_rooms` 文档维护当前有效成员、参与人、支出和邀请的文档 ID 索引；事务和 `room_get` 都按这些 ID 读取。软删除或撤销时同步移出活动索引，避免长期使用后突破事务操作上限；被移出的文档仍保留给房间级清理任务。`room_get` 在读取前后重新读取 `revision`，发现变化即重试，避免拼接出跨版本快照。

## 权限与隐私检查点

- 所有 read/write 云函数都从 `cloud.getWXContext().OPENID` 获取调用者身份；不信任客户端传入的 openid、memberId、role 或 owner 标记。
- 每个读写入口都先查询有效 membership；被移除的成员下一次请求立即失去访问权。
- 退出或被移除会撤销当前成员资格，并禁止用旧邀请重新加入；只有房主在撤销发生后新生成的邀请才能重新授权该微信账号。
- 邀请 token 为服务端派生的 256-bit 高熵值，数据库只存二次哈希；默认 7 天过期，可撤销并限制使用次数/房间人数。同一邀请 mutation 重放时可重新派生同一路径，但原文不写入数据库或日志。
- 非成员拿到 roomId、expenseId 或旧缓存都不能从云端读取；邀请预览不含参与人余额和支出明细。
- 成员被移除后，云端请求立即拒绝并在在线轮询时清除缓存。设备当时离线时，无法远程擦除其已同步的旧只读副本；该副本不能写入云端或获得后续更新，重新联网校验后会被清除。
- 房主删除房间需要二次确认；服务端软删除后进入短期恢复窗，再异步清理相关集合。
- 当前恢复窗为 30 天。`ledger_cleanup` 只按服务端时间分批清理已软删除满 30 天的房间，并在依赖文档全部删除后才删除房间文档；每日触发器使用仓库内可审查的七段 cron 配置，部署后仍要核对时区和实际触发状态。
- 云端化会改变当前“数据仅保存在本机”的隐私声明。上线共享功能前必须更新小程序隐私保护指引、产品内文案、数据保留/删除说明和审核测试路径。

## 实施阶段

### Phase 0：云环境与契约

- 为正式 AppID 创建/绑定 CloudBase 环境，填入 `miniprogram/config/cloud.js`。
- 建 6 个集合及必要索引：`roomId`、`openid + roomId`、`tokenHash`、`roomId + updatedAt`。
- 写共享 schema 校验器、金额/币种约束和服务端权限测试。
- 更新隐私文档，但先用功能开关隐藏共享入口。

### Phase 1：建房、邀请、只读加入

- 实现 `room_create`、`room_invite`、`room_join`、`room_get`。
- 新增房间页、邀请落地页、参与人认领和成员列表。
- 保留本地账单模式；共享账单显示明确的云同步状态。
- 双微信号验证：分享直达、过期/撤销 token、非成员拒绝、移除成员后拒绝。

### Phase 2：多人编辑

- 实现 `room_mutate` 的支出增删改、参与人管理和成员退出/移除。
- 加 `revision`、事务、幂等 mutation 和冲突 UI。
- 结算算法继续复用当前客户端逻辑，服务端只保存支出事实，不保存可漂移的结算结果。

### Phase 3：同步体验与发布

- 加前台轮询、`onShow` 刷新、离线只读缓存和同步状态。
- 根据真实使用频率决定是否增加安全规则保护的实时投影 `watch()`。
- 补隐私指引、云端数据删除入口、审核说明、监控和 CloudBase 用量预算。
- 两台真机并发编辑、弱网重试、重复点击、历史邀请链接和房主删除做完整验收。

## 验收门槛

- 未加入房间的账号无法读取任何账单明细。
- 被移除成员在 3 秒内或下一次请求时失去读取/写入权限。
- 同一写入重试不会生成重复支出；并发编辑不会静默覆盖。
- 分享卡点击后进入正确房间邀请页，加入后才显示账单。
- 本地账单仍可完全离线使用，且不会在用户未选择共享时上传。
- 云函数响应和客户端日志均不包含 OpenID、邀请 token 原文或 AppSecret。

## 官方依据

- [微信小程序调用 CloudBase 云函数与 `getWXContext`](https://docs.cloudbase.net/recipes/add-cloud-function-wechat-miniprogram)
- [CloudBase 数据库调用方式与权限边界](https://cloud.tencent.com/document/product/876/19369)
- [CloudBase 安全规则与角色权限控制](https://cloud.tencent.com/document/product/876/41802)
- [CloudBase 服务端数据库事务](https://cloud.tencent.com/document/product/876/48442)
- [CloudBase 数据库实时推送与读权限](https://cloud.tencent.com/document/product/876/41801)
- [小程序带参数分享的 CloudBase 官方示例](https://docs.cloudbase.net/recipes/add-share-with-params-miniprogram)
