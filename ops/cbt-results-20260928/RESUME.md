# Resume: CBT results r5.1

Status: deployed and live verified. No HTML deployment pending.
Updated: 2026-09-28T10:25:54.097730+00:00
Worker version: 0c6d0b88-f47d-4baa-9927-57aa3301f88e
HTML SHA256: 255d4a2d2167f59c6c2510fcf59fe2300e9eb7894da883a27d631efb64894072

Authoritative development directory: /Users/shbj/Downloads/mysuneung-cbt-worker/work-20260928-results-r5-1
Active deployment directory: /Users/shbj/Downloads/mysuneung-cbt-worker
Live endpoint: https://mysuneung.com/mixed-cbt

Core input files: results-ui.js, results.css, learning-ui.js, study-core.mjs, learning-core.mjs, ebs-links.json.
Rebuild: python3 work-20260928-results-r5-1/build_release.py (from active deployment directory).
The builder intentionally starts from backup-current/cbt.html and backup-current/index.js (r4 baseline). Do NOT replace that baseline with already-injected r5 HTML.

Production entry: src/index.js. Imported study-core.mjs and learning-core.mjs are synced. HTML is the R2 object mysuneung-cbt/app/cbt.html, not a local root app/cbt.html.
Git repository snapshot: /Users/shbj/Downloads/mysuneung-site-index/workers/cbt.

Tests: test-study.mjs (17 groups / 33 generation cases), test-regression.mjs (17 groups / 69 generation cases), test-safety.mjs (6), test-edge.cjs (4), test-ui-live.cjs (13 live), test-ui-safety.cjs (7 live).
Browser tests use puppeteer-core and isolated anonymous Chrome. To run live: CBT_TEST_BASE=https://mysuneung.com node work-20260928-results-r5-1/test-ui-live.cjs; repeat with test-ui-safety.cjs.
Development tests depend on the existing learning-20260927 corpus next to this work folder. Start dev-server.mjs before local browser tests; read its dev-server.json for the current port.

Rollback source: rollback-r5/cbt.html, rollback-r5/worker-candidate.js, rollback-r5/study-core.mjs plus the existing learning-core.mjs. Prior Worker version: 8cc3e4a8-4699-4292-bd70-b5d85a8f5d7e. Guard current production hashes before any further replacement. No user-history migration was performed.

Known limits: EBS reference/excerpt review is not a full EBS auto-graded problem bank; type procedures are not question-specific explanations; 30-attempt heuristic mastery is not a validated clinical/educational diagnosis; no automatic push/reminder was created. Do not claim weaknesses can never recur.
