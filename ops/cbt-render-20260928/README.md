# CBT render/content cleanup release — 2026-09-28

This folder contains the scripts and compact evidence used for the production release that:

- removes exam-page furniture (page counters, footer copyright text, answer-sheet notices) from rendered source crops;
- fixes duplicate/empty <보기> rendering and score-only boxes;
- preserves complex source layout via source crops while rendering safe structures as HTML/CSS;
- improves list/dialogue/A-B table line breaking;
- adds question-pane pen/highlighter/eraser annotations while preserving existing passage annotations;
- keeps question annotations anchored across pane resizing and persists/syncs them through the existing annotation record type.

Generated source images are intentionally excluded from Git because they are large deployment artifacts. build_sources.py, source-manifest.json, upload_sources.py, and verify_sources.py describe/reproduce that pipeline when the authorized source PDFs are available.

Key evidence is in release-evidence.json, content-audit-summary.json, source-verified-summary.json, and the test JSON files.
