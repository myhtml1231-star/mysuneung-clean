# Mathematics CBT — 2014–2027

Entry: `/mixed-cbt?subject=math`.

## Current coverage

The canonical bank contains **4,000 unique questions**, **192 paper variants** and **76 source sessions**.

KICE:
- 2014–2016: June, September, CSAT; A/B
- 2017–2021: June, September, CSAT; ga/na
- 2022–2026: June, September, CSAT; common + probability/statistics/calculus/geometry
- 2027 preparation: June and September

Education office:
- 2019–2021: high3 March/April/July/October; ga/na
- 2022: high3 March/April/July/October; common + electives
- 2023: March/April/July/October
- 2024: March/April/July/October; the April Gyeonggi paper keeps EBS listing month 5 internally
- 2025–2026: March/May/July/October
- 2027: March/May/July

Education-office coverage is **35 sessions, 93 variants and 1,778 unique questions**.

## Manual taxonomy review

Academic 2019–2026 education-office reviewed batches contain **1,640 manually reviewed unique questions**.

- 1,550: question-by-question review against official EBS solution `[출제의도]`
- 90: 2019 March ga and October ga/na, whose solution objective text layer is unavailable; classified question by question from the official problem text/rendered source
- All review decisions are stored in `edu-taxonomy-review.json`
- Older pending taxonomy elsewhere in the bank remains gradeable but excluded from automatic type diagnosis/transfer

Legacy PDF irregularities use SHA-256-locked manual adjudication in `manual-review.json`; OCR is not used to reconstruct problem text.

## Solving workspace

Desktop:
- left: large original problem
- right: handwriting scratchpad using pen/highlighter/eraser
- far right: answer palette when width allows
- keyboard note: separate movable/resizable typed-text popup; saved per question automatically

Mobile:
- problem first
- `필기장 보기` opens the handwriting workspace
- typed note popup stays inside the viewport

Direct ink on the problem remains available.

## Generation and grading

Full exam: 30 questions, 100 points, 100 minutes, 21 multiple-choice + 9 numeric.

- Legacy A/B and ga/na full exams preserve one intact original paper.
- Modern exams preserve common 22 + elective 8, original slots and points.
- `source_family` can be `all`, `kice` or `education_office`.
- Education-office-only generation is server-validated.
- Numeric zero is a valid answer and differs from blank.
- Official multi-answer adjudications such as 2021 October na Q15 are graded server-side and are not exposed before submission.

`교육청 기출로 양치기` chooses a fresh other-session question of the same reviewed type while excluding the source session, seen questions and shared-source units.

## Rebuild

1. Collect official sources with the math collection scripts.
2. Parse them; unresolved answer/point/layout conflicts block publishing.
3. Complete per-question entries in `edu-taxonomy-review.json`.
4. Merge only verified forms into the main staging set.
5. Run `build_bank.py` then `build_app.py`.
6. Run math core/UI/education-office/workspace tests and Korean safety regression.
7. Deploy account assets first, then CBT Worker, then R2 `app/math.html`.
8. Run live API/browser checks.

Current data version: `2026-09-29.math.v5`
Bank SHA-256: `254a0bf291774cf066c407af999d414628d93e96a43bf21d0787048dd644080c`
