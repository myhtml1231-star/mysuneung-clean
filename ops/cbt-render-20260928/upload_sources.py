from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
import subprocess,json,time
ROOT=Path('/Users/shbj/Downloads/mysuneung-cbt-worker/work-20260928-content-r4')
items=json.load(open(ROOT/'source-upload-list.json'))
log=ROOT/'source-upload-results.jsonl'
done={}
if log.exists():
 for line in log.read_text().splitlines():
  try:
   d=json.loads(line)
   if d['ok']:done[d['key']]=d
  except:pass
pending=[x for x in items if x['key'] not in done]
def put(x):
 for attempt in range(3):
  p=subprocess.run(['/opt/homebrew/bin/wrangler','r2','object','put','mysuneung-cbt/'+x['key'],'--remote','--file='+x['file'],'--content-type=image/webp','--force'],cwd=str(ROOT.parent),stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=40)
  if p.returncode==0:return {'key':x['key'],'ok':True,'bytes':x['size']}
  time.sleep(.5)
 return {'key':x['key'],'ok':False,'error':p.stdout[-700:]}
print('UPLOAD',len(pending),'already',len(done),flush=True)
errors=[]
with ThreadPoolExecutor(max_workers=12) as pool, log.open('a') as out:
 fs=[pool.submit(put,x) for x in pending]
 for i,f in enumerate(as_completed(fs),1):
  try:r=f.result()
  except Exception as e:r={'key':'process-error','ok':False,'error':str(e)}
  out.write(json.dumps(r)+'\n');out.flush()
  if not r['ok']:errors.append(r)
  if i%50==0 or i==len(pending):print('UPLOADED',i,'/',len(pending),'errors',len(errors),flush=True)
print('DONE',len(pending),'errors',len(errors),flush=True)
if errors:raise SystemExit(1)
