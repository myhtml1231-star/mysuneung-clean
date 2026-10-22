from pathlib import Path
import sys,json,re,urllib.parse,concurrent.futures,hashlib,time
sys.path.insert(0,'archive-expansion');from inventory import request
R=Path('archive-expansion');cache=R/'sources';cache.mkdir(exist_ok=True);inventory=json.loads((R/'inventory.json').read_text());specs=[];templates=[]
for x in inventory:
 if not x['rows'] or x['already_has_extra']:continue
 selector=(R/'source-cache/templates'/x['selector']).read_text();links=re.findall(r'href="([^"]+\.html)"',selector);template=next((n for n in links if n.endswith('-y.html')),next(n for n in links if n!='index.html'))
 templates.append(template)
 for row in x['rows']:
  subject=("job" if row['category']=='vocational' else 'language')+row['subject_id'];part=(f'g{x["grade"]}/'+str(int(x['selector'][:4]) if x['grade']==3 else x['calendar_year'])+'/'+('s' if '_s' in x['selector'] else str(x['month']))+'/'+subject)
  meta={**row,'selector':x['selector'],'site_title':x['site_title'],'calendar_year':x['calendar_year'],'grade':x['grade'],'month':x['month'],'academic_year':int(x['selector'][:4]) if x['grade']==3 else x['calendar_year'],'template':template,'asset_prefix':'archive/voc-lang-20261023/'+part,'page':x['selector'].replace('_','-').removesuffix('.html')+'-'+subject+'.html','files':{}}
  for key,kind in [('P','problem'),('J','answer'),('H','solution')]:
   src=row['calls'][key][0];url=src.replace('http://','https://',1) if src.startswith(('https://','http://')) else 'https://wdown.ebsi.co.kr/W61001/01exam'+src
   assert urllib.parse.urlsplit(url).hostname=='wdown.ebsi.co.kr';ext=Path(urllib.parse.urlsplit(url).path).suffix.lower();assert ext in ['.pdf','.png','.jpg','.jpeg']
   path=cache/(hashlib.sha256(url.encode()).hexdigest()[:20]+ext);meta['files'][kind]={'url':url,'file':str(path)}
  specs.append(meta)
(R/'subjects.json').write_text(json.dumps(specs,ensure_ascii=False,indent=2))
for t in sorted(set(templates)):
 p=R/'source-cache/templates'/t
 if not p.exists():p.write_bytes(request('https://raw.githubusercontent.com/myhtml1231-star/mysuneung-clean/6628f4ad2a8029814f26b43f2aa6a4e8648e634f/'+urllib.parse.quote(t)))
items={v['url']:v for s in specs for v in s['files'].values()}
def fetch_download(x):
 url,v=x;p=Path(v['file'])
 if not p.exists():p.write_bytes(request(url))
 data=p.read_bytes();expected=b'%PDF-' if p.suffix=='.pdf' else b'\x89PNG' if p.suffix=='.png' else b'\xff\xd8';assert data.startswith(b'%PDF-') if p.suffix=='.pdf' else data.startswith((b'\x89PNG',b'\xff\xd8')),(url,data[:30]);return url,{'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)}
def download(x):
 try:return fetch_download(x)
 except Exception as error:return x[0],{'error':type(error).__name__,'message':str(error)[:200]}
receipts={}
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
 for i,(url,data) in enumerate(ex.map(download,items.items()),1):
  receipts[url]=data
  if i%100==0:print('official originals downloaded',i,'/',len(items),flush=True)
for s in specs:
 for v in s['files'].values():v.update(receipts[v['url']])
(R/'source-download-receipts.json').write_text(json.dumps(receipts,ensure_ascii=False,indent=2));(R/'subjects.json').write_text(json.dumps(specs,ensure_ascii=False,indent=2));print('OFFICIAL SOURCES COMPLETE',len(specs),'subjects',len(receipts),'files',sum(v.get('bytes',0) for v in receipts.values()),'failures',sum('error' in v for v in receipts.values()),flush=True)
