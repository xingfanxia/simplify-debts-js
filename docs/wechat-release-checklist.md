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
  creates a shared ledger. They are synchronized only to joined room members.
- Shared-room authorization uses the caller's WeChat OpenID inside CloudBase;
  OpenID is never returned to the client.
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

> 本小程序无需注册账号。普通账单和历史记录默认仅保存在用户设备。只有用户主动创建共享账单时，参与人姓名、成员显示名称、币种和支出才会上传至微信云开发，用于向已加入的房间成员同步账单。房主可删除共享账单；删除后立即停止访问，并在 30 天恢复窗后永久清理。

## First upload

- Version: `1.0.0`
- Upload description: `首个体验版：支持多人支出记录、全员或指定成员分摊、支出编辑、本地历史、多币种、自动生成精简还款方案、文字和结算图分享、浅色和深色外观。`
- Reviewer test path:
  1. Tap `载入示例`.
  2. Confirm that the settlement plan appears.
  3. Edit one expense and save it.
  4. Tap `分享结算图` and confirm the portrait card is readable.
  5. Tap `保存并新建`, name the settlement, then reopen it from `历史`.
  6. Change the currency and appearance from the compact controls at the top of the main screen.

## Release commands

```bash
# Bind the registered mini program. Add --cloud-env after creating CloudBase.
npm run mini:configure -- --appid wx1234567890abcdef

# Confirm that the real account exposes a CloudBase environment.
npm run mini:cloud:list

# Bind the selected environment locally. Shared-room deployment requires the
# private collections and indexes in docs/wechat-shared-room-runbook.md.
npm run mini:configure -- --appid wx1234567890abcdef --cloud-env cloud1-example
npm run mini:cloud:deploy:health -- --env cloud1-example
npm run mini:cloud:deploy:ledger -- --env cloud1-example
npm run mini:cloud:deploy:cleanup -- --env cloud1-example

# Build a phone preview, then upload the first experience version.
npm run mini:preview
npm run mini:upload -- --version 1.0.0 --desc "首个体验版：中文多人分账、本地历史、多币种和结算图分享"
```

Do not deploy the shared functions or upload a build until the privacy form has
been updated and the account holder has explicitly approved the target
environment and release action. Run the two-account checklist in
[wechat-shared-room-runbook.md](./wechat-shared-room-runbook.md) before review.

Before uploading, verify that the preview QR code is available to the registered
account's developers and testers.
