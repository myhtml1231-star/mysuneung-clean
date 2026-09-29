"""Collect a bounded high3 education-office math batch from official EBS listings.
Usage:
  python3 collect_edu_batch.py <root> [calendar_years_csv] [months_csv]
Defaults preserve the first reviewed batch: calendar 2024,2025 and months 03,05,07,10.
"""
from pathlib import Path
from urllib.parse import urlencode, quote
from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor, as_completed
import subprocess,re,json,hashlib,fitz,sys

ROOT=Path(sys.argv[1]) if len(sys.argv)>1 else Path.home()/'Downloads/mysuneung-math-edu-2025-2026'
CALENDARS=[int(x) for x in (sys.argv[2] if len(sys.argv)>2 else '2024,2025').split(',') if x]
MONTHS=[int(x) for x in (sys.argv[3] if len(sys.argv)>3 else '03,05,07,10').split(',') if x]
if not CALENDARS or not MONTHS: raise SystemExit('calendar years and months are required')
(ROOT/'sources').mkdir(parents=True,exist_ok=True)
(ROOT/'listings').mkdir(parents=True,exist_ok=True)
BASE='https://wdown.ebsi.co.kr/W61001/01exam'
API='https://www.ebsi.co.kr/ebs/xip/xipc/previousPaperListAjax.ajax'
TRACK_CURRENT={'140119':'prob','140120':'calc','140121':'geom'}
TRACK_GANA={'61001':'ga','61007':'na'}
TRACK_AB={'61001':'A','61007':'B'}
PROVIDER={'서울':'서울특별시교육청','경기':'경기도교육청','인천':'인천광역시교육청','경남':'경상남도교육청'}

def curl(url,dest,post=None):
    args=['curl','-fLSs','-A','Mozilla/5.0','--retry','2','--max-time','45',url,'-o',str(dest)]
    if post is not None: args+=['--data',post]
    p=subprocess.run(args,capture_output=True)
    if p.returncode: raise RuntimeError(p.stderr.decode(errors='replace')[:240])
    return dest.read_bytes()

def listing(calendar):
    path=ROOT/'listings'/f'{calendar}.html'
    month_list=','.join(f'{m:02d}' for m in MONTHS)
    subj='mathPast' if calendar<2021 else '140119,140120,140121'
    params={'targetCd':'D300','yearList':calendar,'monthList':month_list,'arOrd':'2','subjIdList':subj,'sort':'recent','pageSize':250}
    curl(API,path,urlencode(params))
    soup=BeautifulSoup(path.read_text(),'html.parser')
    rows=[]
    allowed='|'.join(str(m) for m in sorted(set(MONTHS)))
    for b in soup.select('[onclick^="goDownLoadP("]'):
        a=re.findall(r"'([^']*)'",b.get('onclick',''))
        if len(a)<8 or a[6]=='1': continue
        wrap=b.find_parent('div',class_='qus_box') or b.parent
        title=wrap.get_text(' ',strip=True)
        if '고3' not in title or '학평' not in title: continue
        hm=re.search(rf'{calendar}\s+({allowed})월',title)
        if not hm: continue
        month=int(hm[1])
        track_map=TRACK_AB if calendar<=2015 else TRACK_GANA if calendar<2021 else TRACK_CURRENT
        track=track_map.get(a[5])
        if not track: continue
        named_month=re.search(r'고3\s+(\d+)월\s+학평',title)
        official_exam_month=int(named_month[1]) if named_month else month
        h=wrap.select_one('[onclick^="goDownLoadH("]')
        ha=re.findall(r"'([^']*)'",h.get('onclick','')) if h else []
        pm=re.search(r'학평\(([^)]+)\)',title)
        provider=PROVIDER.get(pm[1],pm[1]+'교육청' if pm else '교육청') if pm else '교육청'
        delayed=re.search(r'_(\d{1,2})\.(\d{1,2})\s*시행',title)
        day=f'{calendar}{int(delayed[1]):02d}{int(delayed[2]):02d}' if delayed else a[2][:8]
        academic=calendar+1
        rid=f'{academic}-{month:02}-{track}-edu'
        rows.append({
            'id':rid,'academic_year':academic,'month':month,'official_exam_month':official_exam_month,'administered_date':day,'track':track,'form':'standard',
            'provider':provider,'exam_family':'education_office','title':title,
            'problem_url':BASE+a[0],'solution_url':BASE+ha[0] if ha else None,
            'listing_url':API,'listing_params':params,'paper_id':a[-1]
        })
    rows.sort(key=lambda x:x['id'])
    expected=8 if calendar<2021 else 12
    if len(rows)!=expected: raise ValueError(f'{calendar}: expected {expected} high3 math rows, got {len(rows)}')
    return rows

rows=[]
for y in CALENDARS: rows.extend(listing(y))
ids=[r['id'] for r in rows]
if len(ids)!=len(set(ids)): raise ValueError('duplicate ids')
(ROOT/'source-manifest.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))

def fetch(r,kind):
    url=r[kind+'_url']
    if not url:return {'id':r['id'],'kind':kind,'ok':False,'error':'missing official link'}
    dest=ROOT/'sources'/f"{r['id']}-{kind}.pdf"
    try:
        data=curl(quote(url,safe=':/?=&%'),dest)
        doc=fitz.open(stream=data,filetype='pdf')
        return {'id':r['id'],'kind':kind,'ok':True,'path':str(dest),'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'pages':len(doc),'first_text':doc[0].get_text()[:800]}
    except Exception as e:return {'id':r['id'],'kind':kind,'ok':False,'error':str(e)[:240]}

results=[]
with ThreadPoolExecutor(max_workers=6) as pool:
    fs=[pool.submit(fetch,r,k) for r in rows for k in ['problem','solution']]
    for i,f in enumerate(as_completed(fs),1):
        v=f.result();results.append(v)
        print('FETCH',i,'/',len(fs),v['id'],v['kind'],'OK' if v['ok'] else v['error'],flush=True)
(ROOT/'download-report.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
failed=[x for x in results if not x['ok']]
if failed: raise SystemExit('download failures '+json.dumps(failed,ensure_ascii=False))
print('DONE',len(rows),'forms',len(results),'pdfs','calendars',CALENDARS,'months',MONTHS)
