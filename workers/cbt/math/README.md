# Mathematics CBT — 2014–2027

Entry: `/mixed-cbt?subject=math`.

## Current coverage

The canonical bank contains **5,200 unique questions**, **232 paper variants** and **96 source sessions**.

KICE:
- 2014–2016: June, September, CSAT; A/B
- 2017–2021: June, September, CSAT; ga/na
- 2022–2026: June, September, CSAT; common + probability/statistics/calculus/geometry
- 2027 preparation: June and September

Education office:
- 2014–2016: high3 March/April/July/October; A/B
- 2017–2021: high3 March/April/July/October; ga/na
- 2022: high3 March/April/July/October; common + electives
- 2023: March/April/July/October
- 2024: March/April/July/October; the April Gyeonggi paper keeps EBS listing month 5 internally
- 2025–2026: March/May/July/October
- 2027: March/May/July

Education-office coverage is **55 sessions, 133 variants and 2,978 unique questions**.

## Per-question review

Academic 2014–2026 education-office reviewed batches contain **2,840 manually reviewed unique questions**. One additional 2027 education-office question plus 88 KICE/CSAT-source questions from the former pending set were manually reviewed in the final pass, for **2,929 total manual reviews and 0 pending taxonomy items**.

- 2,671 questions: official EBS solution `[출제의도]`, reviewed question by question
- 169 questions: official problem text/rendered source because the solution objective text is missing or corrupt
- all decisions are stored in `edu-taxonomy-review.json`
- 2027 education-office questions retain their prior official-objective mapping
- the former 89 pending taxonomy items have been manually resolved; pending taxonomy is now 0

OCR is not used to reconstruct problem text. Legacy PDF answer/layout irregularities use explicit parser rules or SHA-256-locked adjudications.

## Solving workspace

Desktop:
- left: large original problem
- right: handwriting scratchpad with pen/highlighter/eraser
- answer palette remains at the right edge when width permits
- keyboard note: separate movable/resizable textarea popup with per-question autosave

Mobile:
- problem first
- `필기장 보기` opens the handwriting workspace
- typed note remains inside the viewport

Direct ink on the problem remains available.

## Generation and grading

Full exam: 30 questions, 100 points, 100 minutes, 21 multiple-choice + 9 numeric.

- A/B and ga/na full exams preserve one intact original paper.
- Modern exams preserve common 22 + elective 8, original slots and points.
- `source_family`: `all`, `kice`, `education_office`.
- Education-office-only generation is server validated in A/B, ga/na and modern eras.
- Numeric zero is valid and differs from blank.
- Official multi-answer adjudications are graded server-side and are not exposed before submission.

`교육청 기출로 양치기` selects a fresh other-session problem of the same reviewed type while excluding the source session, seen questions and shared-source units.

## Rebuild

1. Collect official EBS sources.
2. Parse; unresolved answer/point/layout conflicts block publication.
3. Complete `edu-taxonomy-review.json` for every reviewed-batch question.
4. Merge only verified forms into the main staging set.
5. Run `build_bank.py` and `build_app.py`.
6. Run math core/UI/education-office/workspace and Korean safety regression tests.
7. Deploy account assets, CBT Worker and R2 `app/math.html`.
8. Run live API/browser checks.

Current data version: `2026-09-29.math.v9`
Bank SHA-256: `fc87025cdb9880623b2c71b938a3577ba27839a815f7b944ca8a14feafd197f0`
