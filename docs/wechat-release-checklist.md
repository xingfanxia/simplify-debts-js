# WeChat release checklist

This is the copy-and-paste release pack for the native Chinese mini program.
The product is a local expense-splitting utility; it does not move money or
provide payment, lending, investment, or financial-account services.

## Basic information

- Suggested name: `多人分账助手`
- Short name: `分账助手`
- Introduction: `记录多人共同支出，自动生成清晰、精简的还款方案。支持多币种、账单历史和结算图分享，数据仅保存在本机。`
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
- Participant names, expenses, balances, preferences, and saved history remain
  in WeChat local storage on the user's device.
- No ledger data is uploaded, synchronized, analyzed, or used for advertising.
- Clipboard writing and image saving/sharing happen only after the user taps the
  corresponding action.
- The mini program does not request contacts, precise location, microphone,
  camera, health, payment, or advertising identifiers.
- Clearing WeChat mini-program data or uninstalling WeChat removes local history.
- The optional CloudBase function is stateless health checking only and never
  receives participant names, expenses, balances, or history.

Suggested privacy summary:

> 本小程序无需注册账号。参与人姓名、支出、余额、偏好设置和历史记录仅保存在用户设备的微信本地存储中，不会上传、同步、分析或用于广告。复制结算文字、保存或分享结算图仅在用户主动点击后执行。

## First upload

- Version: `1.0.0`
- Upload description: `首个体验版：支持多人支出记录、全员或指定成员分摊、支出编辑、本地历史、多币种、自动生成精简还款方案、文字和结算图分享、浅色和深色外观。`
- Reviewer test path:
  1. Tap `载入示例`.
  2. Confirm that the settlement plan appears.
  3. Edit one expense and save it.
  4. Tap `分享结算图` and confirm the portrait card is readable.
  5. Tap `保存并新建`, then reopen the saved plan from `历史`.
  6. Change the currency and appearance from `设置`.

## Release commands

```bash
# Bind the registered mini program. Add --cloud-env after creating CloudBase.
npm run mini:configure -- --appid wx1234567890abcdef

# Confirm that the real account exposes a CloudBase environment.
npm run mini:cloud:list

# Bind the selected environment locally and deploy only the stateless health function.
npm run mini:configure -- --appid wx1234567890abcdef --cloud-env cloud1-example
npm run mini:cloud:deploy -- --env cloud1-example

# Build a phone preview, then upload the first experience version.
npm run mini:preview
npm run mini:upload -- --version 1.0.0 --desc "首个体验版：中文多人分账、本地历史、多币种和结算图分享"
```

Before uploading, verify that the preview QR code is available to the registered
account's developers and testers.
