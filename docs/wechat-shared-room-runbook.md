# 微信共享账单 CloudBase 运行手册

## 发布边界

仓库中的共享账单代码可以在本地实现和测试，但下列操作都会改变外部状态，必须获得用户明确确认后才能执行：

- 创建或绑定生产 CloudBase 环境；
- 选择付费套餐或修改预算；
- 创建集合、索引和权限规则；
- 部署 `ledger` 或 `ledger_cleanup`；
- 修改微信公众平台隐私保护指引；
- 生成体验版、上传、提交审核或发布。

此前在聊天或日志中出现过的 AppSecret 应先在微信公众平台轮换。共享房间不需要 AppSecret；不要把 AppSecret、代码上传私钥或 OpenID 写入仓库、客户端或日志。

## 架构

- 本地账单：继续使用微信本地存储，完全离线，不上传。
- 共享账单：用户主动点击“创建共享账单”后，客户端调用 `ledger` 云函数。
- 身份：云函数只使用 `cloud.getWXContext().OPENID`，不接受客户端声明的 OpenID、角色或房主身份。原始 OpenID 只在请求期间使用；应用集合仅保存“房间 ID + OpenID”的单向哈希文档键，且不同房间不可直接关联。
- 资料：用户只确认房间昵称；系统从固定 50 个动物/食物 Emoji 中自动分配房间标记，成员可修改自己的标记。真实微信头像不请求、不上传、不存储。
- 数据访问：所有 `ledger_*` 集合均设置为“仅管理端可读写”；客户端只调用云函数。
- 同步：页面打开立即拉取、`onShow` 拉取、前台每 2.5 秒轮询；revision 未变化时走轻量权限检查，变化时才取完整快照；离线只读本地缓存。
- 并发：版本化写入包含 `baseRevision` 和稳定 `mutationId`；建房也带 `mutationId`，加入由微信身份唯一键天然幂等。服务端事务处理版本冲突与弱网重放；冲突响应附带已鉴权的最新快照，客户端直接刷新而不静默覆盖。
- 删除：房主删除先软删除，立即阻止成员访问；30 天后由 `ledger_cleanup` 永久清理。
- 金额：云端按币种最小单位保存；共享房间有支出时只允许在相同小数精度的币种组内切换，删除全部支出后或创建共享账单前可跨组选择。

本地只读副本是离线可用性与远程撤权之间的明确边界：移除或退出会让云端立即拒绝后续请求，在线页面会在下一次轮询（最多约 2.5 秒）清除缓存；设备若当时离线，开发者无法远程擦除它已同步的旧内容。旧副本不能写入、不能获得新版本，并会在重新联网校验失败后清除。隐私说明和审核材料不得宣称可以远程删除用户设备上已看过的数据。

## 创建资源

在已授权的正式 CloudBase 环境中创建以下集合，并全部设置为“仅管理端可读写”：

1. `ledger_rooms`
2. `ledger_members`
3. `ledger_participants`
4. `ledger_expenses`
5. `ledger_invites`
6. `ledger_mutations`

创建索引：

| 集合 | 索引字段 | 用途 |
|---|---|---|
| `ledger_rooms` | `status, deletedAt` | 找到超过恢复窗的软删除房间 |
| `ledger_members` | `roomId` | 删除房间时清理成员 |
| `ledger_participants` | `roomId` | 删除房间时清理参与人 |
| `ledger_expenses` | `roomId` | 删除房间时清理支出 |
| `ledger_invites` | `roomId` | 清理房间邀请 |
| `ledger_mutations` | `roomId` | 删除房间时清理幂等记录 |

不要创建允许小程序端直接读取这些集合的规则。邀请预览也必须经过 `ledger` 云函数。

## 本地配置

先只读查看环境：

```bash
npm run mini:cloud:list
```

取得用户对目标环境的确认后再写入环境 ID：

```bash
npm run mini:configure -- --appid wx7413688ef0714f4a --cloud-env <environment-id>
```

配置脚本只写公开 AppID 和环境 ID，不读取或写入 AppSecret。环境 ID 为空时，共享入口保持隐藏，本地账单功能不受影响。

当前已授权的正式环境为 `cloud1-d3gbdocpk8fcb2e97`（上海）。仓库根目录的
`cloudbaserc.json` 是函数类型、运行时、超时和定时触发器的配置来源；不要只依赖控制台默认值。

## 部署

先运行本地门槛：

```bash
npm test
npm run test:mini:rooms
npm run typecheck
npm run build
```

获得明确部署授权后：

```bash
npm run mini:cloud:deploy:ledger
npm run mini:cloud:deploy:cleanup

/Applications/wechatwebdevtools.app/Contents/MacOS/cli cloud functions info \
  --env cloud1-d3gbdocpk8fcb2e97 --names ledger ledger_cleanup \
  --project "$PWD" --lang zh
```

部署命令必须显式携带 `--env cloud1-d3gbdocpk8fcb2e97`；微信开发者工具 CLI
不会从 `cloudbaserc.json` 自动补充这个必填参数。若改用 CloudBase CLI，正确的
`npx` 入口是 `npx --yes --package @cloudbase/cli@3.7.3 tcb ...`，并且必须先确认
当前凭据确实能列出目标环境，不能仅凭本地凭据文件名判断账号。

函数设置要求：

- `ledger` 只允许小程序调用，不配置 HTTP 触发器；
- `ledger` 超时时间设为 20 秒；`ledger_cleanup` 超时时间设为 300 秒。部署后在函数配置页核对实际值，不依赖平台默认超时；
- `ledger_cleanup` 不配置 HTTP 触发器；仓库内 `cloudfunctions/ledger_cleanup/config.json` 定义每天一次的七段 cron 定时触发。上传函数代码后还必须单独上传/核对触发器，确认控制台显示 `dailyLedgerRetention`；
- `dailyLedgerRetention` 当前为 `0 20 3 * * * *`。部署前在控制台确认触发器时区；若平台显示 UTC，应按目标本地执行时间换算后再启用；
- `ledger_cleanup` 会拒绝带 `OPENID` 的小程序交互调用，只允许无用户身份的定时任务执行；
- 两个函数使用当前部署环境，不写固定密钥；
- 日志不得记录完整 event、OpenID、邀请 token 或账单内容；
- 为调用次数、数据库读写和存储设置预算告警。

`ledger` 最初创建在 `Nodejs16.13`，腾讯云不支持原地修改既有函数的
`Runtime`，因此 `cloudbaserc.json` 记录其实际运行时，避免 CLI 报告假成功后产生配置漂移。
`ledger_cleanup` 使用 `Nodejs20.19`。如需升级 `ledger`，必须走一次有明确回滚方案的函数重建，
不能把普通配置更新当成已升级。

`ledger_cleanup` 每次最多处理 5 个到期房间，并以最多 10 个并发删除依赖文档；超大房间若一次未清完会保留房间墓碑，由下一次定时任务继续。只有所有成员、参与人、支出、邀请和幂等记录都清理完后才删除房间文档。

## 隐私保护指引事实

平台隐私表和产品内说明应保持一致：

- 无需注册账号；微信身份仅由云函数在请求期间读取，用于派生房间内的授权键；应用集合不保存原始 OpenID；
- 普通本地账单、偏好和历史记录仅保存在设备上；
- 只有用户主动创建或加入的共享账单才上传房间昵称、受限 Emoji 标记、成员关系、币种和支出；
- 这些信息只用于向已加入成员同步账单和计算结算方案；
- 邀请链接默认 7 天过期，可撤销并限制使用次数；云端只保存邀请 token 的哈希；
- 房主可以删除共享账单，成员可以退出；软删除后立即停止访问，30 天后永久清理；
- 退出或被移除后，旧邀请不能恢复访问；为执行这一限制，已撤销的房间内授权键会保留到房主删除账单并完成 30 天清理；房主后续新生成的邀请可重新授权；
- 不收集联系人、精确位置、麦克风、健康、支付或广告标识；
- 不使用广告 SDK；第三方 SDK 仅为微信 CloudBase 官方运行时；
- 用户通过平台配置的开发者联系方式申请查询、更正或删除相关数据。

建议隐私摘要：

> 普通账单和历史记录默认仅保存在用户设备。只有用户主动创建或加入共享账单时，房间昵称、Emoji 标记、成员关系、币种和支出才会上传至微信云开发，用于向已加入的房间成员同步账单。本小程序不采集微信头像。房主可删除共享账单；删除后立即停止访问，并在 30 天恢复窗后永久清理。

## 两账号验收

使用两台真机和两个不同微信账号 A、B：

1. A 在首页选择“共享账单”，在没有本地参与人或支出的情况下填写账单名、币种和昵称，确认自动 Emoji 后创建空房间；确认不会自动上传本地账单或历史。
2. A 生成邀请并发给 B。
3. B 打开邀请，只能看到房间名、币种和成员数，不能看到成员昵称、支出或余额。
4. B 确认昵称后直接加入；不得出现身份认领或头像授权。加入后 A/B 应得到不同的自动 Emoji，并能看到完整账单。
5. A、B 分别新增、编辑、删除支出；另一端应在 3 秒内刷新。
6. 快速重复点击同一提交，不得产生重复支出。
7. 模拟请求已经提交但响应丢失，再点一次同一操作；客户端必须复用 mutationId，建房、邀请和支出都不得重复。
8. 两端同时基于旧版本编辑时，一端得到刷新提示，不能静默覆盖。
9. A 移除 B；B 下一次请求或 3 秒内失去云端读写权限。另验证 B 在移除前离线时只能看到旧只读副本；重新联网后清除，且离线期间不能写入或获取更新。
10. 验证撤销、过期和达到次数上限的邀请不能加入。
11. 断网后只显示“离线，只读”，不得接受编辑。
12. 用开发者工具尝试 `wx.cloud.database().collection('ledger_rooms').get()`，必须被权限拒绝。
13. B 修改自己的昵称和 Emoji 后，两端 member/participant 显示一致；B 不能修改 A 的资料，URL、云文件 ID、组合字符串和非白名单 Emoji 均被拒绝。
14. 检查浅色/深色结算图：完整昵称、Emoji、箭头和金额可读；连续导出不得截断 Emoji。
15. 检查云函数响应和日志：不得出现 OpenID、AppSecret、私钥或完整账单事件；`room_invite` 的分享路径是唯一需要短暂返回邀请 token 的响应，token 不得写入日志或本地持久化。

## 回滚

如果共享功能出现权限或数据一致性问题：

1. 先把 `miniprogram/config/cloud.js` 的环境 ID 清空并上传修复版本，隐藏新的共享入口；
2. 保留现有集合，避免在事故期间扩大数据损失；
3. 停止 `ledger_cleanup` 定时触发，保留 30 天恢复窗；
4. 回滚 `ledger` 到最后验证过的函数版本；
5. 验证现有成员仍受权限保护后再恢复入口；
6. 永久删除生产数据或环境前再次取得用户明确确认。

## 官方部署依据

- [微信小程序调用 CloudBase 云函数与 `getWXContext`](https://docs.cloudbase.net/recipes/add-cloud-function-wechat-miniprogram)
- [数据库事务限制（最多 100 个操作、事务内仅支持 `doc`）](https://docs.cloudbase.net/database/transaction)
- [数据库仅管理端权限](https://docs.cloudbase.net/database/data-permission)
- [云函数七段 cron 定时触发器](https://docs.cloudbase.net/cloud-function/timer-trigger)
- [云函数超时与运行配置](https://docs.cloudbase.net/cloud-function/function-configuration/config)
