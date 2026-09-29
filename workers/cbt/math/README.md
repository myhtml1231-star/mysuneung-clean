# Mathematics CBT — 2014–2027

Entry: `/mixed-cbt?subject=math`.

## Source coverage

The bank contains **176 official paper variants, 68 source sessions and 3,520 distinct questions** after deduplicating the modern common section from 5,280 paper-question references.

- 2014–2016: KICE June, September and CSAT, A/B forms.
- 2017–2021: KICE June, September and CSAT, ga/na forms.
- 2022–2026: KICE June, September and CSAT, probability/statistics, calculus and geometry.
- Education office, academic 2021: high3 March/April/July/October, ga/na.
- Education office, academic 2022: high3 March/April/July/October, common + probability/statistics/calculus/geometry.
- Education office, academic 2023–2026: four high3 sessions per year.
- Academic 2027: education-office March/May/July plus KICE June/September. The 2027 CSAT is not included before administration.

Education-office coverage is **27 sessions, 77 paper variants and 1,298 unique questions**. Academic 2021–2026 reviewed batches contribute **1,160 manually reviewed unique questions**. The previously included 2027 education-office questions retain their prior source-objective mapping.

## Per-question taxonomy review

Academic 2021–2026 education-office questions were reviewed question by question against the official EBS solution `[출제의도]`. Modern common 1–22 is reviewed once per session; elective 23–30 is reviewed independently. Legacy ga/na papers are reviewed as full 30-question papers. The decisions are stored in `edu-taxonomy-review.json` with `review_status=manual_question_review`.

The broader bank still has 89 older pending taxonomy items. They are gradeable but excluded from type diagnosis and automatic type transfer.

## Special official-source adjudications

Academic 2021 April Gyeonggi ga/na problem PDFs are image-only. OCR is not used. All 12 pages were visually reviewed and SHA-256-locked manual page/column/question crops are stored in `manual-review.json`.

Academic 2021 October na question 15 was officially treated as **all answers correct** by the Seoul Metropolitan Office of Education. The bank stores a canonical representative only for internal schema compatibility and `accepted_answers=[1,2,3,4,5]`. Server grading accepts every choice, attempt canonicalization preserves that result, and the result UI displays `모두 정답`. The accepted-answer rule is not exposed before grading.

For delayed 2020 high3 exams, EBS listing month and the actual exam-name month are kept separately. Academic 2021 March is internally the EBS April listing slot and has actual administration date 2020-04-24; academic 2021 April is internally the EBS May listing slot and has date 2020-05-21.

## Generation and UI rules

The solving workspace is problem-first: the original problem is large on the left, the answer palette stays on the right, and the solution notebook is a movable/resizable drawing popup.

Full papers are 30 questions, 100 points and 100 minutes. Modern papers preserve common 22 + elective 8, original slots and point values. Legacy papers use one intact original 30-question paper. Numeric zero is valid and distinct from blank.

The start screen has `전체 / 평가원·수능 / 교육청`. The server validates `source_family`. Education-office source selection works for academic 2021 ga/na and academic 2022+ current-format papers. `교육청 기출로 양치기` selects a fresh same-type question from another education-office session while excluding the source session, seen questions and shared source units.

## Rebuild and validation

Run from repository root. OCR is not used.

1. Collect official EBS problem/solution PDFs.
2. Parse question positions, answers and official objectives; publishing fails on unresolved conflicts.
3. Add SHA-locked manual adjudication only when the official PDF structure requires it.
4. Complete manual taxonomy review for each new unique education-office question.
5. Build bank and app.
6. Run core, UI, education-office UI, notebook, Korean safety and account regressions.
7. Verify all original image assets before deployment.
8. Deploy account assets, then CBT Worker, then R2 `app/math.html`, and finally run live API/browser tests.

Current data version: `2026-09-29.math.v4`.
Current bank SHA-256: `12428dcef55cd8febc1f3e26dcf5cf577b3caf0b13455ecb3454f414842bf736`.
