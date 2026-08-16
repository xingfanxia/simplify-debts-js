# WeChat release checklist

This is the copy-and-paste release pack for the native Chinese mini program.
The product is a local expense-splitting utility; it does not move money or
provide payment, lending, investment, or financial-account services.

## Basic information

- Suggested name: `多人分账助手`
- Short name: `分账助手`
- Introduction: `记录多人共同支出，自动生成清晰、精简的还款方案。支持多币种、本地历史、结算图分享和可选的微信好友共享账单。`
- Category: choose the closest available utility/calculator/efficiency category
  in the current WeChat catalog. Do not select a payment or financial-services
  category because the mini program never handles funds.
- Language: Simplified Chinese only

The account holder must confirm name availability, category eligibility,
identity details, agreements, and any filing or verification requirement shown
by WeChat Public Platform.

## Privacy declaration

Use the following facts when completing the platform privacy form:

- No account or login is required.
- Ordinary local ledgers, preferences, and saved history remain in WeChat local
  storage on the user's device.
- Participant names and expenses are uploaded only after the user explicitly
  creates or joins a shared ledger. They are synchronized only to joined room members.
- The shared flow asks only for a room nickname. It assigns one room-scoped Emoji
  from a fixed animal/food allowlist and lets the member change it. It does not
  request, upload, or store the user's real WeChat avatar.
- Shared-room authorization uses the caller's WeChat OpenID transiently inside
  the Cloud Function. Application collections retain only one-way authorization
  values scoped to the room or this mini program; raw OpenID is neither persisted
  there nor returned to the client.
- Clipboard writing and image saving/sharing happen only after the user taps the
  corresponding action.
- The mini program does not request contacts, precise location, microphone,
  camera, health, payment, or advertising identifiers.
- Clearing WeChat mini-program data or uninstalling WeChat removes local history.
- CloudBase stores opted-in shared ledgers. Owner deletion immediately removes
  member access; permanent cleanup runs after a 30-day recovery window.
- Invitation links expire, can be revoked, and are stored in the database only
  as hashes.

Suggested privacy summary:

> 本小程序无需另行注册账号。普通账单和历史记录默认仅保存在用户设备。只有用户主动创建或加入共享账单时，房间昵称、Emoji 标记、成员关系、币种和支出才会上传至微信云开发，用于向已加入的房间成员同步账单。本小程序不采集微信头像。房主可删除共享账单；删除后立即停止访问，并在 30 天恢复窗后永久清理。

## Current upload

- Version `2.0.4` was uploaded on 2026-08-15 from commit `950a33d` with the
  description `共享账单历史与分摊布局优化`.
- The production `ledger` function is Active with a 20-second timeout. Its
  downloaded application source matches the repository, and an authenticated
  developer-tools smoke test confirmed that `room_list` returns successfully.
- The mini-program upload completed at 173.5 KB. Upload is not the same as review
  or public release.
- Before review, create the non-unique ascending single-field index
  `ledger_members.userIndexId`, then confirm the current privacy form still
  matches this document.
- Review submission and public release remain pending until the account holder
  completes the platform-controlled login/review steps and any outstanding
  filing or verification gate.
- For the next upload, use a new account-approved version number; do not reuse
  `2.0.4`.

## Reviewer test path

1. Tap `载入示例`.
2. Confirm that the settlement plan appears.
3. Edit one expense and save it.
4. Tap `分享结算图` and confirm the portrait card is readable.
5. Tap `保存并新建`, name the settlement, then reopen it from `历史`.
6. Change the currency and appearance from the compact controls at the top of the main screen.
7. Switch from `本地快速分账` to `共享账单` from an empty local state; enter a room name, currency, and nickname, optionally change the proposed Emoji, create the empty room, and generate an invitation.
8. Open the invitation with a second WeChat account; before joining it must show only the room name, currency, and member count. Confirm a nickname and join without identity claiming or avatar authorization; only then may it show the full ledger and the automatically assigned Emoji.
9. Confirm that each member can change only their own nickname/Emoji and that the settlement image shows full names, clear arrows, amounts, and Emoji in both themes.

## Release commands

```bash
# Bind the registered mini program. Add --cloud-env after creating CloudBase.
npm run mini:configure -- --appid wx7413688ef0714f4a

# Confirm that the real account exposes a CloudBase environment.
npm run mini:cloud:list

# Bind the authorized environment locally. Shared-room deployment requires the
# private collections and indexes in docs/wechat-shared-room-runbook.md.
npm run mini:configure -- --appid wx7413688ef0714f4a --cloud-env cloud1-d3gbdocpk8fcb2e97

# Deploy to the explicit production environment and inspect the effective config.
npm run mini:cloud:deploy:ledger
/Applications/wechatwebdevtools.app/Contents/MacOS/cli cloud functions info \
  --env cloud1-d3gbdocpk8fcb2e97 --names ledger ledger_cleanup \
  --project "$PWD" --lang zh

# Build a phone preview, then upload the authorized version.
npm run mini:preview
npm run mini:upload -- --version <approved-next-version> --desc "双模式分账、稳定 Emoji 成员标记、共享账单共同记账"
```

Deploying shared functions and uploading code each require the account holder's
explicit approval. Do not mark a build as an experience version, submit it for
review, or release it until the privacy form is current and those later actions
are separately approved. Run the two-account checklist in
[wechat-shared-room-runbook.md](./wechat-shared-room-runbook.md) before review.

The 2026-08-15 read-only preflight found no application-source change in
`ledger_cleanup`, so the next deployment updates only `ledger`. Re-check the
diff before any later release rather than redeploying unchanged functions by default.

Before uploading, verify that the preview QR code is available to the registered
account's developers and testers.
