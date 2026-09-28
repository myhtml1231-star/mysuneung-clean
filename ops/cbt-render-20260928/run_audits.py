from pathlib import Path
import json,subprocess,concurrent.futures
W=Path(__file__).parent

def run(width):
 for _ in range(12):
  cp=W/f'content-audit-{width}-checkpoint.json';d=json.loads(cp.read_text()) if cp.exists() else {'nextUnit':0,'issues':[]}
  if d['nextUnit']>=553:return {'width':width,'done':True,'questions':len(d['inventory']),'issues':d['issues'],'pageErrors':d['pageErrors']}
  with (W/f'content-audit-{width}.log').open('a') as log:
   try:r=subprocess.run(['node',str(W/'audit_content.cjs'),str(width)],stdout=log,stderr=log,timeout=90)
   except subprocess.TimeoutExpired:return {'width':width,'done':False,'reason':'batch-timeout-checkpoint-saved'}
  if r.returncode:return {'width':width,'done':False,'reason':'browser-exit-checkpoint-saved'}
  d=json.loads(cp.read_text());print('SAVED',width,d['nextUnit'],len(d['inventory']),len(d['issues']),flush=True)
 return {'width':width,'done':False}
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:results=list(ex.map(run,[1440,390]))
(W/'content-audit-summary.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print('FINAL',[(r['width'],r['done'],len(r.get('issues',[]))) for r in results],flush=True)
