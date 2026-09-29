# Mathematics CBT — 2014–2027

Entry: `/mixed-cbt?subject=math`. Korean remains the default subject.

## Source coverage

The current bank contains 156 paper variants, 60 source sessions and 3,096 distinct questions after modern common-section deduplication from 4,680 paper-question references.

- 2014–2016: KICE June, September and CSAT, A/B forms.
- 2017–2021: KICE June, September and CSAT, ga/na forms.
- 2022–2026: KICE June, September and CSAT, probability/statistics, calculus and geometry.
- Education office: academic 2023 has March/April/July/October; academic 2024 has March/April/July/October (the April Gyeonggi paper is listed by EBS under its May search session); academic 2025 and 2026 have March/May/July/October.
- Academic 2027: education-office March/May/July plus KICE June/September. The November 2026 CSAT is not included before administration.

Education-office coverage is 19 sessions, 57 paper variants and 874 unique questions. The reviewed 2023–2026 education-office batches contribute 736 unique questions. The older 2027 education-office set retains its prior source-objective mapping.

## Per-question taxonomy review

All 736 unique questions in the academic 2023–2026 education-office reviewed batches were checked question by question against the official EBS solution `[출제의도]`. Common 1–22 is reviewed once per session; elective 23–30 is reviewed independently for probability/statistics, calculus and geometry. Decisions and official objective text are stored in `edu-taxonomy-review.json` with `review_status=manual_question_review`.

The broader bank still has 89 older pending taxonomy items. They remain gradeable but are excluded from type diagnosis and automatic type transfer.

For academic 2023 March, the EBS elective answer tables are visually adjudicated with a SHA-256 lock because the PDF layout makes the generic table parser ambiguous. July question 22 across affected education-office years also has a known solution-body number that must not override the official answer table. These adjudications are recorded in `manual-review.json`.

## Rebuild

Run from repository root. OCR is not used.

1. Collect the base KICE/2027 sources with `collect_sources.py`.
2. Collect bounded education-office batches with `collect_edu_batch.py <root> <calendar_years_csv> <months_csv>`.
3. Parse with `parse_sources.py`; publishing fails on incomplete papers or unresolved answer conflicts.
4. Merge only fully verified forms into the main staging `parsed-forms.json`.
5. Keep `edu-taxonomy-review.json` complete for every reviewed-batch unique question.
6. Run `build_bank.py` and `build_app.py`.
7. Run math core, UI, education-office UI, movable notebook and Korean safety tests.

Generated `math-bank.json` and question image files are deployment artifacts and are ignored by git. Do not deploy either worker with an outdated bank.

## UI and generation rules

The solving workspace is problem-first: the original problem is large on the left, the answer palette stays on the right, and the solution notebook is a movable/resizable drawing popup. Direct question ink remains available.

Full paper: 30 questions, 100 points, 100 minutes, 21 multiple-choice and 9 numeric answers. Modern full generation preserves original slots, section and point values. Legacy full generation uses one intact original paper. Numeric zero is a valid answer and differs from blank.

The start screen has source-family choices: `전체 / 평가원·수능 / 교육청`. The server validates `source_family`; education-office-only exams cannot contain KICE questions. Weakness results include `교육청 기출로 양치기`, which selects the same reviewed type from another education-office session while excluding the source session, seen questions and shared source units.

EBS listing month and official exam-name month are kept separately where needed. In particular, `2024-05-...` keys preserve the EBS May listing slot while the displayed source name correctly says `2024학년도 4월 전국연합학력평가`.

## Deployment

Deploy account assets first, then the CBT worker, then upload `app/math.html` to R2 `mysuneung-cbt/app/math.html`. Run live API and browser checks afterward.

Current data version: `2026-09-29.math.v3`.
Current bank SHA-256: `bb3bbee99384d331b31cbd756f9d9552d84bb573d2fbba227c932ebbf1fe54e7`.
