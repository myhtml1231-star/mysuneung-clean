# Resume · admin full service

Status: deployed and live route switched.
Account Worker version: 2026-09-29.accounts.v1.3
Account Worker Cloudflare version: 142f57b1-1588-48ad-915a-365e8d2798f0
Legacy report Worker Cloudflare version: 659cb272-e8a3-4d95-a222-31a4e8e01add

Account source: workers/accounts/
Admin page: workers/accounts/public/account-assets/admin.html
Admin client source: workers/accounts/src/admin-client.mjs
Admin backend: workers/accounts/src/admin.mjs

Applied migrations:
- 0004_admin.sql
- 0005_login_events.sql
- 0006_admin_roles.sql

Legacy admin Worker now keeps only /api/report*; /admin* was removed from its routes so the account Worker owns /admin.

Tests:
cd workers/accounts && npm test
node tests/admin-ui-test.cjs

Rollback instructions are in ops/admin-fullservice-20260929/ROLLBACK.md. The previous Account Worker source remains available from the git parent commit.
Important: rolling back the Worker does not require dropping new additive D1 tables.

Known follow-up: move legacy private inquiry password verification off public Firestore documents before claiming private inquiries are cryptographically private.
