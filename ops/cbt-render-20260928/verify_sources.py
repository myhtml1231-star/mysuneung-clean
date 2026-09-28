from pathlib import Path
import json,hashlib,urllib.request,io,concurrent.futures,time
from PIL import Image
W=Path(__file__).parent;items=json.load(open(W/'source-upload-list.json'));log=W/'source-verified-results.jsonl';done={}
if log.exists():
 for line in log.read_text().splitlines():
  try:
   x=json.loads(line)
   if x['ok']:done[x['key']]=x
  except (ValueError,KeyError):pass
uploaded=set()
p=W/'source-upload-results.jsonl'
if p.exists():
 for line in p.read_text().splitlines():
  try:
   x=json.loads(line)
   if x['ok']:uploaded.add(x['key'])
  except (ValueError,KeyError):pass
pending=[x for x in items if x['key'] in uploaded and x['key'] not in done]
def verify(x):
 for attempt in range(3):
  try:
   req=urllib.request.Request('https://mysuneung.com/cbt-data/'+x['key'],headers={'User-Agent':'Mysuneung-authorized-content-check/1.0'})
   with urllib.request.urlopen(req,timeout=12) as r:data=r.read();status=r.status
   assert hashlib.sha256(data).digest()==hashlib.sha256(Path(x['file']).read_bytes()).digest(),'hash mismatch'
   image=Image.open(io.BytesIO(data));image.load();return {'key':x['key'],'ok':True,'bytes':len(data),'width':image.width,'height':image.height,'status':status}
  except Exception as e:
   error=str(e);time.sleep(.15)
 return {'key':x['key'],'ok':False,'error':error}
print('VERIFY',len(pending),'already',len(done),'uploaded',len(uploaded),flush=True)
errors=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool,log.open('a') as out:
 for i,f in enumerate(concurrent.futures.as_completed([pool.submit(verify,x) for x in pending]),1):
  r=f.result();out.write(json.dumps(r)+'\n');out.flush()
  if r['ok']:done[r['key']]=r
  else:errors.append(r)
  if i%200==0:print('VERIFIED',len(done),'errors',len(errors),flush=True)
result={'total':len(items),'verified':len(done),'errors':errors,'remaining':len(items)-len(done)}
(W/'source-verified-summary.json').write_text(json.dumps(result,indent=2));print('DONE',result,flush=True)
