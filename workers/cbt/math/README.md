# Mathematics CBT — 2014–2027

Entry: `/mixed-cbt?subject=math`. The Korean start screen has a subject switch. Korean remains the default.

## Source coverage

EBSi past-paper listings supplied 216 explicitly linked PDFs: problem and solution for 108 paper variants. There are 44 sessions and 2,360 distinct questions after deduplicating the modern common section (3,240 paper-question references, 880 repeats removed).

- 2014–2016 academic years: KICE June, September and CSAT, A/B forms.
- 2017–2021: KICE June, September and CSAT, ga/na forms.
- 2022–2026: KICE June, September and CSAT, probability/statistics, calculus, geometry.
- 2027 CSAT preparation: released March, May, June, July and September 2026 papers. The November 2026 CSAT has not been included before administration.

The publication scope is explicit; other historical education-office months are not claimed as included. Actual administration dates are preserved, including the 2021 CSAT held in December and the 2023 September mock held in August.

## Rebuild

Run at repository root. Prerequisites: Python 3.9+, PyMuPDF, Pillow, BeautifulSoup4, curl, Node.js, and the existing accounts worker npm dependencies. OCR is not used.

```sh
python3 workers/cbt/math/scripts/collect_sources.py
python3 workers/cbt/math/scripts/parse_sources.py
python3 workers/cbt/math/scripts/build_bank.py
python3 workers/cbt/math/scripts/build_app.py
node workers/cbt/tests/math-core-test.mjs
node workers/cbt/tests/study-safety-r51.mjs
(cd workers/accounts && npm test)
```

Default staging directory: `$HOME/Downloads/mysuneung-math-cbt-20260929`. Downloaded PDFs, parse results, native question text and crop provenance remain there. Each known manual extraction/erratum requires the exact SHA-256 in `manual-review.json`; a changed source fails closed. Generation stops on incomplete papers or unresolved answer conflicts.

Generated `workers/cbt/data/math-bank.json` is server-only build input and deliberately ignored by git. It is bundled into both workers; it must not be published as a static download. Original question images are generated under `workers/accounts/public/account-assets/math/questions/` and are also ignored. Both are reproducible with the pipeline above. Do not deploy either worker with an outdated bank.

## Shared UI and rules

`build_app.py` derives mathematics from the current Korean CBT HTML, preserving the existing ink renderer, layout and report workspace. `math-adapter.js` changes only subject-specific behavior: numeric input, 30-question palette, eras, source images and the left solution notebook. `math-methods.mjs` supplies suggested study steps based on the official solution's stated learning objective; it is not a fabricated solution to the question.

Full paper: 30 questions, 100 points, 100 minutes, 21 multiple-choice and 9 numeric answers. Modern full generation preserves original slots, section and point values (22 common + 8 elective). Legacy full generation uses one intact original paper. Custom practice uses 1–30 questions and includes shared stems. A/B, ga/na and modern track constraints are validated on the server.

Grading recomputes the answer and points from the canonical bank. Numeric zero is an answer; blank and invalid input are different. Formula/diagram images are lossless renders of the original PDFs, not OCR text or invented redrawings.

The latest taxonomy audit leaves 89 questions pending. They remain gradeable but are excluded from type diagnosis and automatic type transfer. Generic mentions of area or maximum alone are not treated as proof of calculus. Classification metadata includes the original objective and the review status.

Weakness rules reuse the existing first-response evidence, minimum evidence, fresh-session transfer, and delayed independent verification. Repeated exposure to the same shared unit cannot count as new evidence. EBS links are official solutions; textbook linkage is not asserted without a verified linkage table.

## Account storage

Math uses independent history/current storage keys. Server account records retain `subject: 수학`, numeric zero, canonical points, original source references and question-bound annotations. The workspace labels math explicitly, links to the correct subject replay and displays weighted points. Korean storage, API behavior and 45-question/80-minute generation remain unchanged.

Migration `0008_login_event_timestamps.sql` removes an unrelated pre-existing timestamp/device uniqueness assumption that could reject two legitimate logins in the same millisecond. Event IDs remain unique; no login events are deleted.

## Deployment order

1. Build and test the canonical bank and HTML.
2. Apply accounts migrations and deploy accounts worker (includes static original images).
3. Upload `workers/cbt/app/math.html` as R2 `mysuneung-cbt/app/math.html`.
4. Deploy CBT worker (math API and subject router).
5. Upload the Korean `app/cbt.html` containing the subject switch.
6. Run live API and browser checks; do not create synthetic production accounts.

Browser tests use the authorized Mac's installed Chrome/Puppeteer path, as existing project UI tests do. `math-ui.mjs` runs against a local server with the real math handler; `math-live-ui.mjs` checks the production UI as a fresh guest. Evidence, source URLs/hashes, deployment IDs and screenshots are in `ops/math-cbt-20260929/`.
