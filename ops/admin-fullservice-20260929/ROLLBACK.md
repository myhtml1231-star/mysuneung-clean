# Rollback

Account Worker prior production release was 2026-09-27.accounts.v1.2. Source prior to this change is available from the git parent commit.

The legacy mysuneung-admin Worker now owns only:
- mysuneung.com/api/report*
- www.mysuneung.com/api/report*

To restore its old admin route temporarily, re-add:
- mysuneung.com/admin*
- www.mysuneung.com/admin*

The D1 migrations are additive. A Worker rollback does not require dropping admin_audit, account_login_events, or admin_accounts.
