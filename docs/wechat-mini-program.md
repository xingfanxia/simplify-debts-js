# WeChat mini program

The `miniprogram/` directory is a native WeChat mini program. It intentionally
does not embed the hosted site in a WebView. Debt calculation, editing, local
History, Chinese UI, automatic/manual currency and theme preferences, text sharing, portrait settlement
image export, and “Save & start new” all run on-device through WeChat APIs.

## Open locally

```bash
npm run mini:open
```

`project.config.json` uses the registered Settle mini-program AppID. It supports
local compilation, phone previews, and release uploads for authorized project
members.
The complete registration copy, privacy declaration, reviewer path, and upload
commands are in [wechat-release-checklist.md](./wechat-release-checklist.md).

Basic information and the service category are configured in WeChat Public
Platform. Account-holder-only identity checks, QR scans, agreements, filing,
and verification remain platform-side workflows.

## CloudBase

The product does not require a backend. A sandbox/test AppID cannot create the
production environment. After the registered AppID is attached, if a CloudBase environment is attached,
put its environment ID in `miniprogram/config/cloud.js` and deploy only the
stateless `health` function. The app never sends participant names, expenses,
balances, or saved History to CloudBase.

```bash
npm run mini:cloud:list
```

The cloud environment and function can also be managed from the Cloud
Development panel in WeChat DevTools. Any identity verification, QR scan,
contract acceptance, or paid-plan selection must be completed by the account
holder.

## Verification

```bash
npm test
npm run typecheck
npm run build
npm run mini:open
```

After the IDE compiles without errors, use Preview for an actual WeChat device
check. Verify both themes, the Chinese interface, expense editing, the named
save dialog and local History, inline automatic/manual currency switching,
image sharing, and that no network request contains expense data. A sandbox preview is suitable for the developer account only; use
the registered AppID before adding testers or uploading a release.
