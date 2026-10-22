from pathlib import Path
import json,hashlib,urllib.request,urllib.parse,concurrent.futures,sys,datetime
R=Path('archive-expansion');B=R/'release';rows=json.loads((B/'subjects.json').read_text());through=int(sys.argv[1]);count=min(through*33,len(rows));targets=[];out=B/'upload-verification.json';done=json.loads(out.read_text()) if out.exists() else {}
for s in rows[:count]:
 for k in ['problem','answer','solution']:
  key=s['asset_prefix']+'/'+k+'.pdf'
  if key not in done:targets.append(key)
def verify(key):
 p=B/key;b=p.read_bytes();md5=hashlib.md5(b).hexdigest();sha=hashlib.sha256(b).hexdigest();u='https://pub-847376fcebac40e496cc5726d0ff6245.r2.dev/'+urllib.parse.quote(key,safe='/')
 with urllib.request.urlopen(urllib.request.Request(u,method='HEAD',headers={'User-Agent':'Mozilla/5.0'}),timeout=40) as r:
  assert r.status==200;assert int(r.headers['Content-Length'])==len(b),(key,'size');assert r.headers.get('Content-Type','').startswith('application/pdf'),(key,'mime');etag=r.headers.get('ETag','').strip('"')
 if etag!=md5:
  with urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'}),timeout=60) as r:assert hashlib.sha256(r.read()).hexdigest()==sha,(key,'SHA')
 return key,{'status':200,'bytes':len(b),'sha256':sha,'etag':etag,'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
 for i,(key,v) in enumerate(ex.map(verify,targets),1):
  done[key]=v
  if i%100==0:out.write_text(json.dumps(done,indent=2));print('public PDF readback',len(done),flush=True)
out.write_text(json.dumps(done,indent=2));assert len(done)>=count*3;print('UPLOAD VERIFIED',len(done),'PDFs through batch',through,flush=True)
