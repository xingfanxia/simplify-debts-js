# WeChat mini program

The `miniprogram/` directory is a native WeChat mini program. It intentionally
does not embed the hosted site in a WebView. Debt calculation, editing, local
History, Chinese UI, automatic/manual currency and theme preferences, text sharing, portrait settlement
image export, and “Save & start new” all run on-device through WeChat APIs.

## Open locally

```bash
npm run mini:open
```

`project.config.json` currently uses the sandbox test AppID
`wx31e5b94c26bdf9f6`. It supports local compilation and temporary preview QR
codes for the signed-in developer account, but it is not a registered Settle
mini program and cannot be used for a public release or CloudBase environment.
Replace it with the real AppID from WeChat Public Platform before uploading.
The complete registration copy, privacy declaration, reviewer path, and upload
commands are in [wechat-release-checklist.md](./wechat-release-checklist.md).

The real account still needs its basic information and service category
completed in WeChat Public Platform. Account-holder-only identity checks, QR
scans, agreements, and any paid verification step must be completed by the
account holder. After that, copy the `wx...` AppID into `project.config.json`,
reopen this project, and confirm that Preview no longer labels the account as a
sandbox account.

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
check. Verify both themes, the Chinese interface, expense editing, local
History, automatic/manual currency switching, image sharing, and that no network request contains
expense data. A sandbox preview is suitable for the developer account only; use
the registered AppID before adding testers or uploading a release.
