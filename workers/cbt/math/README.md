# Mathematics CBT — 2014–2027

Entry: /mixed-cbt?subject=math. Korean remains the default subject.

## Source coverage

EBSi past-paper listings supplied 264 explicitly linked PDFs: problem and solution for 132 paper variants. The bank has 52 source sessions and 2,728 distinct questions after deduplicating the modern common section from 3,960 paper-question references.

- 2014–2016: KICE June, September and CSAT, A/B forms.
- 2017–2021: KICE June, September and CSAT, ga/na forms.
- 2022–2026: KICE June, September and CSAT, probability/statistics, calculus, geometry.
- Education-office high3: 2025 and 2026 academic years March, May, July and October.
- 2027 academic year: education-office March, May and July plus KICE June and September. The November 2026 CSAT is not included before administration.

Education-office coverage is currently those 11 sessions, not every historical 전국연합. It contributes 506 unique questions. The newly added 2025–2026 batch contributes 368 unique questions.

## Per-question taxonomy review

The 368 newly added education-office questions were reviewed one by one against the official EBS solution [출제의도]. Common questions 1–22 are reviewed once per session; elective questions 23–30 are reviewed separately for probability/statistics, calculus and geometry. The decisions and official objective text are stored in edu-taxonomy-review.json with review_status manual_question_review. The previously included 2027 education-office questions retain their earlier source-objective mapping.

The broader bank still has 89 older questions marked pending. They remain gradeable but are excluded from type diagnosis and automatic type transfer.

## Rebuild

Run from repository root. OCR is not used.

1. Collect the existing KICE/2027 sources with workers/cbt/math/scripts/collect_sources.py.
2. Collect the bounded education-office batch with workers/cbt/math/scripts/collect_edu_batch.py into $HOME/Downloads/mysuneung-math-edu-2025-2026.
3. Parse with parse_sources.py and merge only fully verified forms into the main staging parsed-forms.json.
4. Keep edu-taxonomy-review.json complete for every 2025–2026 education-office unique question.
5. Run build_bank.py and build_app.py.
6. Run math-core-test.mjs, math-ui.mjs, math-edu-ui.mjs, math-workspace-v2.mjs and study-safety-r51.mjs.

Generated math-bank.json and original question image files are deployment artifacts and are ignored by git. Do not deploy either worker with an outdated bank.

## UI and generation rules

The math solving workspace is problem-first. The original problem is large on the left, the answer palette is on the right, and the solution notebook is a movable/resizable drawing popup. Direct question ink remains available.

Full paper: 30 questions, 100 points, 100 minutes, 21 multiple-choice and 9 numeric answers. Modern full generation preserves original slots, section and point values. Legacy full generation uses one intact original paper. Numeric zero is a valid answer and differs from blank.

The start screen has source-family choices: 전체, 평가원·수능, 교육청. The server validates source_family and does not mix KICE into an education-office-only exam. Weakness results include an 교육청 기출로 양치기 action that chooses the same reviewed type from another education-office session while excluding the source session, seen questions and shared source units.

## Deployment

Account assets worker: deploy first so all question images exist. Then deploy the CBT worker, then upload app/math.html to R2 mysuneung-cbt/app/math.html. Run live API and browser checks afterward.

Current data version: 2026-09-29.math.v2.
Current bank SHA-256: 46175f9489be3d68e4ed5baf77a0ef71ba0f25c57ae3a9dabbfeb5af43c0c7e3.
