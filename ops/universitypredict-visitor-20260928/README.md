# universitypredict.com visitor integration — 2026-09-28

This snapshot records only the production changes made for shared visit counting.

- visitor.js: same visitor client used by mysuneung.com/CBT.
- index.patch: loads visitor.js on universitypredict.com.
- server_v4.patch: serves visitor.js and permits https://mysuneung.com in connect-src.
- patch_university_visit.py: idempotent patch helper used on the EC2 host.

The university application runs under admission-mvp.service and Caddy reverse-proxies to 127.0.0.1:8080.
During deployment a stale server process left by a remote development session occupied port 8080. It was terminated and the systemd service was restored as the single owner of the port. /health and /visitor.js were verified externally after recovery.

Visitor deduplication itself is server-side in the mysuneung account Worker. The same daily anonymous hash is used for main, CBT and universitypredict, so moving between services does not increase the daily count again.
