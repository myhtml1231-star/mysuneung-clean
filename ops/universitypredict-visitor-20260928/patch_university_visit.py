from pathlib import Path
server=Path('/root/admission-predictor/web_mvp/server_v4.py')
index=Path('/root/admission-predictor/web_mvp/staging_explorer/index.html')
s=server.read_text()
old="connect-src 'self' https://*.googlesyndication.com https://*.google.com https://*.doubleclick.net;"
new="connect-src 'self' https://mysuneung.com https://*.googlesyndication.com https://*.google.com https://*.doubleclick.net;"
if old in s:s=s.replace(old,new,1)
elif new not in s:raise SystemExit('CSP pattern missing')
oldmap="allowed={'/university-account.js':'university-account.js',"
newmap="allowed={'/visitor.js':'visitor.js','/university-account.js':'university-account.js',"
if oldmap in s:s=s.replace(oldmap,newmap,1)
elif newmap not in s:raise SystemExit('allowed map pattern missing')
server.write_text(s)

h=index.read_text()
tag='<script src="/visitor.js?v=20260928-visitor-v2" data-visit-source="university" defer></script>'
if tag not in h:
    needle='<script src="/app.js?v=20260917-visual"></script>'
    if needle not in h:raise SystemExit('index app script missing')
    h=h.replace(needle,tag+needle,1)
index.write_text(h)
print('UNIVERSITY_VISITOR_PATCHED')
