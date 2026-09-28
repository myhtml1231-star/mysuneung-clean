# Shared daily visitor counting — 2026-09-28

The main site, /mixed-cbt, and universitypredict.com share one KST daily visitor counter.

The account Worker exposes /api/visit. D1 stores a salted day-scoped anonymous hash for deduplication; raw IP addresses are not stored. The existing Firebase visits object remains the aggregate counter so the existing Today/Month values continue from their previous values.

A visit to more than one of the three surfaces on the same day normally increments the aggregate once. three_site_visit_e2e.cjs verifies the production main → CBT → university flow without changing the aggregate by pre-seeding the local daily marker.
