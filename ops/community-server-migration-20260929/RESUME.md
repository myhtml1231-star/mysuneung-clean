# Resume · community migration

Status: deployed and live verified.

Current worker:
- release: 2026-09-29.accounts.v1.4
- Cloudflare version: bd2ff705-42b3-49f0-a9a1-fcb56ca02ed8

Key files:
- workers/accounts/src/community.mjs
- workers/accounts/migrations/0007_community.sql
- workers/accounts/public/account-assets/community-inquiries.html
- workers/accounts/public/account-assets/community-inquiries.js
- workers/accounts/public/account-assets/community-chat.html
- workers/accounts/public/account-assets/community-chat.js
- workers/accounts/public/account-assets/community.css
- workers/accounts/src/admin.mjs
- workers/accounts/src/admin-client.mjs

Data state:
- D1 community inquiries: 2
- D1 community chat messages: 18
- D1 private inquiry password hash records: 1
- Legacy Firestore inquiries: 0
- Legacy Firestore chatMessages: 0

Validation:
- cd workers/accounts && npm test
- node tests/admin-ui-test.cjs
- ops/community-server-migration-20260929/evidence/live-check.json

The old Firebase browser-auth dependency is removed from the admin community path.
