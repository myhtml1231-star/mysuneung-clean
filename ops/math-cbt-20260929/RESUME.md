# Math CBT handoff

Status: deployed and verified.

Entry: /mixed-cbt?subject=math

Account worker: c1e3af52-22ac-4ac8-a7d8-d392ad632b16
CBT worker: d794306f-1bf7-4683-86f4-6990f688c04f

Math bank SHA-256: a3fe1e6c915a1e6a73978bffce5cafb0b7ccf68f72c5e0af0ca8ec247c7cb1d7

Rebuild instructions: workers/cbt/math/README.md
Release scope and verification: RELEASE.md and evidence/.
Original PDF staging: /Users/shbj/Downloads/mysuneung-math-cbt-20260929

Rollback: previous worker versions remain in Cloudflare. The original Korean R2 app before this change is backed up locally as pre-math-korean.html in staging. Restore both workers together if rolling back math record support; do not drop account records or delete source images. Migration 0008 only removes a timestamp/device uniqueness constraint and does not delete data.
