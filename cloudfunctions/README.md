# Settle CloudBase boundary

CloudBase is optional. The mini program remains fully functional when
`miniprogram/config/cloud.js` has an empty environment ID.

The `health` function is deliberately stateless and receives no participant,
expense, balance, history, device, or account data. Do not add cloud persistence
for those fields without a separate privacy review, explicit user opt-in, and
documented retention/deletion behavior.
