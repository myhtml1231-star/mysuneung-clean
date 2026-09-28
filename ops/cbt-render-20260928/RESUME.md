# CBT content cleanup and question annotation r4

Read checkpoint.json before continuing. Source data and tests are saved per set.

- Candidate: cbt-patched.html. Baseline rollback: backup/cbt.html.
- Source generation: build_sources.py; resumes source-unit-checkpoints.jsonl.
- Upload: upload_sources.py; resumes source-upload-results.jsonl.
- Verify: verify_sources.py; resumes source-verified-results.jsonl.
- Corpus audits: run_audits.py; resumes content-audit-WIDTH-checkpoint.json.
- Account implementation: records.mjs, workspace.js, cbt-account.js; backups in backup/account.
- After remote image verification, publish CBT app/cbt.html, verify hash and live UI, then capture_live.cjs.
- Final delivery: actual live PNG ZIP, never synthetic imagery.

## Completed
CBT HTML and annotation-support account worker deployed and live-checked. PNG ZIP delivered at https://mysuneung.com/cbt-data/learning/reports/cbt-content-r4-20260928-screenshots.zip
