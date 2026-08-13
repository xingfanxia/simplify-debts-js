# Settle

Settle turns a group of shared expenses into a compact repayment plan. Everything is calculated and saved locally on the device—no account, database, analytics, or server-side processing required.

## What changed in v2

- Rebuilt the product as a responsive React 19 + TypeScript application.
- Replaced the free-form debt syntax with a guided people → expenses → settlement workflow.
- Moved all calculations into a pure, tested domain module using integer cents.
- Replaced server-rendered Graphviz output with an accessible live settlement view and SVG relationship diagram.
- Added editable expenses, custom splits, multiple currencies, optional balanced whole-number rounding, arrow-formatted text and readable portrait PNG exports.
- Added a versioned, device-local history library for naming, reopening, and deleting up to 50 settlement snapshots.
- Added pure-local iOS and Android apps with native text/image clipboard and image sharing through Capacitor.
- Added a persistent light/dark theme that follows the system preference on first visit.
- Removed Express, serverless functions, CDN scripts, and the Graphviz runtime.

## Stack

- React 19
- TypeScript 6 in strict mode
- Vite 8
- Vitest
- Capacitor 8 for iOS and Android
- Lucide icons
- Self-hosted variable fonts from Fontsource
- Plain CSS with responsive layout, accessible focus states, and reduced-motion support

## Development

Requires Node.js 22.12 or newer (Node 22 LTS or Node 24+).

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Verification

```bash
npm test
npm run typecheck
npm run build
```

## Mobile apps

The native projects load the same bundled interface from the app sandbox. They do not point at the hosted website or require an internet connection.

```bash
# Rebuild web assets and sync both native projects
npm run mobile:sync

# Open native projects
npm run mobile:ios
npm run mobile:android

# Build a debug APK or a signed release APK (JDK 21 required)
npm run mobile:android:debug
npm run mobile:android:apk
```

Release signing is read from the gitignored `android/keystore.properties` or the `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, and `ANDROID_KEY_ALIAS` environment variables. See [the mobile release guide](./docs/mobile-release.md) for artifact paths, asset regeneration, and TestFlight steps.

## How the math works

Each expense is distributed in integer cents across its selected participants. Settle calculates one net balance per person, then greedily matches the largest debtors with the largest creditors. This preserves the full ledger and produces at most `n - 1` repayments for `n` people.

## Privacy

Participant names, expenses, and saved history are stored only in local browser/app storage. Android cloud backup is disabled and the Android app requests no internet permission. Clearing site/app data or uninstalling the native app permanently removes its local history, so export anything you need to keep first.

## License

[MIT](./LICENSE.md)
