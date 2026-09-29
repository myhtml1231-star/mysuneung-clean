"""Collect publicly served official EBS exam/solution PDFs; academic year is verified later.
No guessed PDF addresses: all URLs are taken from the EBS past-paper response.
Only KICE June/September/CSAT for 2014–2026, plus released 2027 exams.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlencode, quote
from bs4 import BeautifulSoup
import subprocess, re, json, hashlib, fitz, time, sys
ROOT=Path(sys.argv[1]) if len(sys.argv)>1 else Path.home()/'Downloads/mysuneung-math-cbt-20260929'
(ROOT/'sources').mkdir(parents=True,exist_ok=True)
(ROOT/'listings').mkdir(exist_ok=True)
BASE='https://wdown.ebsi.co.kr/W61001/01exam'
API='https://www.ebsi.co.kr/ebs/xip/xipc/previousPaperListAjax.ajax'
def curl(url,dest,post=None):
    args=['curl','-fLSs','-A','Mozilla/5.0','--retry','2','--max-time','45',url,'-o',str(dest)]
    if post: args+=['--data',post]
    p=subprocess.run(args,capture_output=True)
    if p.returncode:raise RuntimeError(p.stderr.decode(errors='replace')[:180])
    return dest.read_bytes()
def listing(calendar):
    path=ROOT/'listings'/f'{calendar}.html'
    months='03,05,06,07,09' if calendar==2026 else '06,08,09,11,12'
    subj='mathPast' if calendar<2021 else '140119,140120,140121'
    if not path.exists():curl(API,path,urlencode({'targetCd':'D300','yearList':calendar,'monthList':months,'arOrd':'2','subjIdList':subj,'sort':'recent','pageSize':100}))
    text=path.read_text();s=BeautifulSoup(text,'html.parser');rows=[]
    for button in s.select('[onclick^="goDownLoadP("]'):
        args=re.findall(r"'([^']*)'",button['onclick'])
        if len(args)<7 or args[6]=='1':continue  # even versions excluded; no answer mismatch
        parent=button.find_parent('tr') or button.parent.parent
        while parent and not parent.find(attrs={'onclick':re.compile('^goDownLoadH')}):parent=parent.parent
        hb=parent.find(attrs={'onclick':re.compile('^goDownLoadH')}) if parent else None
        hargs=re.findall(r"'([^']*)'",hb['onclick']) if hb else []
        paper_title=parent.get_text(' ',strip=True) if parent else ''
        day=args[2];month=int(day[4:6]);academic=calendar+1
        if calendar!=2026 and month not in [6,8,9,11,12]:continue
        # CSAT 2021 held in December 2020; display canonical month 11 but retain actual date.
        canonical_month=11 if month in [11,12] else 9 if month==8 else month
        if calendar<2016:
            track='A' if ('수학A' in paper_title or re.search('matha',args[0],re.I)) else 'B'
        elif calendar<2021:
            track='ga' if args[5]=='61001' else 'na' if args[5]=='61007' else 'unknown'
        else:
            track={'140119':'prob','140120':'calc','140121':'geom'}.get(args[5],'unknown')
        rid=f'{academic}-{canonical_month:02}-{track}'
        rows.append({'id':rid,'academic_year':academic,'month':canonical_month,'administered_date':day[:8],'track':track,'form':'odd' if canonical_month==11 else 'standard','title':paper_title,'problem_url':BASE+args[0],'solution_url':BASE+hargs[0] if hargs else None,'listing_url':API,'listing_params':{'yearList':calendar,'monthList':months,'arOrd':'2','subjIdList':subj},'paper_id':args[-1]})
    print('LIST',calendar,len(rows),[(r['month'],r['track']) for r in rows],flush=True)
    return rows
rows=[]
with ThreadPoolExecutor(max_workers=3) as pool:
    for f in as_completed([pool.submit(listing,y) for y in range(2013,2027)]):rows+=f.result()
rows.sort(key=lambda x:x['id'])
ids=[r['id'] for r in rows]
if len(set(ids))!=len(ids):raise RuntimeError('Duplicate form IDs: '+str([i for i in ids if ids.count(i)>1]))
(ROOT/'source-manifest.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))
def fetch_one(r,kind):
    url=r[kind+'_url']
    if not url:return {'id':r['id'],'kind':kind,'ok':False,'error':'No source link'}
    dest=ROOT/'sources'/f"{r['id']}-{kind}.pdf"
    try:
        if not dest.exists() or dest.stat().st_size<1000:curl(quote(url,safe=':/?=&%'),dest)
        data=dest.read_bytes();d=fitz.open(stream=data,filetype='pdf')
        info={'id':r['id'],'kind':kind,'ok':True,'path':str(dest),'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'pages':len(d),'first_text':d[0].get_text()[:1000],'pdf_title':d.metadata.get('title')}
        return info
    except Exception as e:return {'id':r['id'],'kind':kind,'ok':False,'error':str(e)[:250]}
results=[]
with ThreadPoolExecutor(max_workers=5) as pool:
    for f in as_completed([pool.submit(fetch_one,r,k) for r in rows for k in ['problem','solution']]):
        v=f.result();results.append(v)
        if not v['ok']:print('DOWNLOAD_FAIL',v,flush=True)
        if len(results)%20==0:print('FETCH',len(results),'/',len(rows)*2,flush=True)
(ROOT/'download-report.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print('DONE',len(rows),'forms',sum(v['ok'] for v in results),'pdfs',flush=True)
