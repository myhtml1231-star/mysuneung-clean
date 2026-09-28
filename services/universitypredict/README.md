# universitypredict.com runtime snapshot

This directory keeps the visitor-related production snapshot from the EC2 university prediction service.

- server_v4.py: current HTTP service, including CSP permission for the central visitor endpoint and /visitor.js static mapping.
- static/index.html: production page with the shared visitor client.
- static/visitor.js: same visitor client used by mysuneung.com.
- deploy/: service and Caddy configuration snapshots.

Large admissions databases, logos, generated audit datasets, account bridge secrets, and other production data are intentionally not committed.
