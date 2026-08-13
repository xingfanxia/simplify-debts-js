# Settle

Settle turns a group of shared expenses into a compact repayment plan. Everything is calculated and saved locally in the browser—no account, database, or server-side processing required.

## What changed in v2

- Rebuilt the product as a responsive React 19 + TypeScript application.
- Replaced the free-form debt syntax with a guided people → expenses → settlement workflow.
- Moved all calculations into a pure, tested domain module using integer cents.
- Replaced server-rendered Graphviz output with an accessible live settlement view and SVG relationship diagram.
- Added editable expenses, custom splits, multiple currencies, optional balanced whole-number rounding, arrow-formatted text and mobile-optimized portrait PNG exports, local persistence, and an example dataset.
- Added a persistent light/dark theme that follows the system preference on first visit.
- Removed Express, serverless functions, CDN scripts, and the Graphviz runtime.

## Stack

- React 19
- TypeScript 6 in strict mode
- Vite 8
- Vitest
- Lucide icons
- Self-hosted variable fonts from Fontsource
- Plain CSS with responsive layout, accessible focus states, and reduced-motion support

## Development

Requires Node.js 20.19 or newer.

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

## How the math works

Each expense is distributed in integer cents across its selected participants. Settle calculates one net balance per person, then greedily matches the largest debtors with the largest creditors. This preserves the full ledger and produces at most `n - 1` repayments for `n` people.

## Privacy

Participant names and expenses are stored only in the browser's local storage. There is no backend and no analytics integration.

## License

[MIT](./LICENSE.md)
