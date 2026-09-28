# Runtime workers

This directory tracks the production source for the two Cloudflare Workers used by mysuneung.com.

- cbt/: CBT API + the current /mixed-cbt application HTML and public metadata snapshots.
- accounts/: account/auth/sync Worker, D1 migrations, account UI assets, and regression tests.

Deployment secrets are intentionally not committed. Cloudflare/Firebase secrets must be supplied through the deployment environment. Generated R2 source crops are not stored in Git; see ../ops/cbt-render-20260928/ for the reproducible build/upload/verification pipeline.
