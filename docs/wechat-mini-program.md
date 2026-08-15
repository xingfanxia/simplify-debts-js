# WeChat mini program

The `miniprogram/` directory is a native WeChat mini program. It intentionally
does not embed the hosted site in a WebView. Debt calculation, editing, local
History, Chinese UI, automatic/manual currency and theme preferences, text
sharing, portrait settlement image export, and “Save & start new” all run
on-device through WeChat APIs. A separate opt-in shared-room flow lets users
create an empty room, invite WeChat members, and synchronize that room only.

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

The local product does not require a backend. CloudBase is used only when the
user explicitly creates a shared ledger. Ordinary ledgers and local History
remain on-device.

After the registered AppID is attached to an authorized CloudBase environment,
put its environment ID in `miniprogram/config/cloud.js`, create the private
`ledger_*` collections, and deploy the `ledger` function. The shared entry stays
hidden while the environment ID is empty.

Shared-room identity comes from the Cloud Function's WeChat context. Users
confirm only a room nickname; the mini program does not request or store WeChat
avatars and renders initials locally.

```bash
npm run mini:cloud:list
```

The cloud environment and functions can also be managed from the Cloud
Development panel in WeChat DevTools. Any identity verification, QR scan,
contract acceptance, paid-plan selection, deployment, or release upload requires
explicit account-holder authorization. Detailed setup and rollback are in
[wechat-shared-room-runbook.md](./wechat-shared-room-runbook.md).

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

When shared rooms are enabled, additionally run the two-account checks in the
shared-room runbook. Local ledgers must still produce no ledger network request.
