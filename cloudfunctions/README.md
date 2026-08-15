# Settle CloudBase boundary

CloudBase is optional. The mini program remains a complete local-only expense
splitter while `miniprogram/config/cloud.js` has an empty environment ID.

The user must explicitly tap **创建共享账单** before the app sends participant
names or expenses to CloudBase. Local history, preferences, settlement images,
and ordinary local ledgers are never uploaded.

## Functions

- `health`: stateless environment check. It receives no ledger data.
- `ledger`: the only client-facing shared-ledger API. It derives identity from
  `cloud.getWXContext()`, validates every request, enforces room membership, and
  performs writes with server-side transactions.
- `ledger_cleanup`: scheduled retention worker. It permanently purges rooms 30
  days after an owner soft-deletes them. It rejects invocations carrying a mini
  program `OPENID`; do not expose it through an HTTP trigger.

The mini program must never directly read or write the six `ledger_*`
collections. Keep every collection set to **仅管理端可读写**.

See [wechat-shared-room-runbook.md](../docs/wechat-shared-room-runbook.md) for
collection setup, indexes, deployment gates, rollback, privacy, and two-account
verification.
