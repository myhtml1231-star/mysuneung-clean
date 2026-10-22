from pathlib import Path
import re,json,urllib.request,urllib.parse,concurrent.futures,html,time
R=Path('archive-expansion');C=R/'source-cache';C.mkdir(exist_ok=True)
BASE='https://www.ebsi.co.kr'
def request(url,params=None):
 for attempt in range(3):
  try:
   req=urllib.request.Request(url,data=None if params is None else urllib.parse.urlencode(params).encode(),headers={'User-Agent':'Mozilla/5.0','Referer':BASE+'/ebs/xip/xipc/previousPaperList.ebs?targetCd=D300'})
   with urllib.request.urlopen(req,timeout=50) as r:return r.read()
  except Exception:
   if attempt==2:raise
   time.sleep(attempt+1)
def text(s):return re.sub(r'\s+',' ',html.unescape(re.sub('<[^>]+>',' ',s))).strip()
def source(template):
 p=C/'templates'/template;p.parent.mkdir(exist_ok=True)
 if not p.exists():p.write_bytes(request('https://raw.githubusercontent.com/myhtml1231-star/mysuneung-clean/6628f4ad2a8029814f26b43f2aa6a4e8648e634f/'+urllib.parse.quote(template)))
 return p.read_text()
def collect(name):
 s=source(name);title=text(re.search(r'<div class="title">(.*?)</div>',s,re.S).group(1))
 if re.match(r'^20\d\d[_-]',name):
  year=int(name[:4])-1;grade=3;slot=name.split('_')[-1].split('-')[-1].split('.')[0];month='11' if slot=='s' else slot.zfill(2)
 else:year=2000+int(name[1:3] if name.startswith('0') else name[:2]);grade=2 if name.startswith('0') else 1;month=name.split('-')[1].split('.')[0].zfill(2)
 grade_file=C/('previous-paper.html' if grade==3 else 'previous-paper-g'+str(grade)+'.html')
 if not grade_file.exists():grade_file.write_bytes(request(BASE+'/ebs/xip/xipc/previousPaperList.ebs?targetCd=D'+str(grade)+'00'))
 grade_html=grade_file.read_text();ids=','.join(re.findall(r'name="sFormPart(?:Career|Lang)"[^>]*value="([^"]+)"',grade_html))
 params={'targetCd':'D'+str(grade)+'00','yearList':str(year),'monthList':('11,12' if grade==3 and month=='11' else '08,09' if grade==3 and month=='09' else month),'arOrd':'7,8','subjIdList':ids,'sort':'recent'}
 rows=[];pages=1;count=None
 for page in range(1,20):
  params['currentPage']=str(page);p=C/f'official-v2-{year}-g{grade}-{month}-p{page}.html'
  if not p.exists():p.write_bytes(request(BASE+'/ebs/xip/xipc/previousPaperListAjax.ajax',params))
  raw=p.read_text();m=re.search(r'class="tot">([0-9,]+)개',raw);assert m,(name,'missing total');total=int(m[1].replace(',',''));count=total if count is None else count;assert count==total
  chunks=re.split(r'<div class="qus_box\s+',raw)[1:]
  for c in chunks:
   title_match=re.search(r'<div class="qus_tit">(.*?)</div>',c,re.S);assert title_match
   dl=re.search(r'<dl class="btn_dwonload">(.*?)</dl>',c,re.S);assert dl
   calls={}
   for k,args in re.findall(r'onclick="goDownLoad([PJH][2]?)\((.*?)\);"',dl[1],re.S):
    vals=re.findall(r"'([^']*)'",html.unescape(args));calls[k]=vals
   if 'P' not in calls:raise AssertionError((name,text(title_match[1]),calls))
   v=calls['P'];round_code=re.search(r"showGrdCutPopup\('([^']+)'",c);rows.append({'category':'vocational' if c.startswith('career') else 'language','title':text(title_match[1]),'subject_name':[z.strip() for z in html.unescape(title_match[1]).split('\xa0') if z.strip()][-1],'calls':calls,'record':v[2],'subject_id':v[5],'form':v[6],'exam_code':round_code[1] if round_code else None,'paper_id':v[8] if len(v)>8 else None})
  pages=max([int(z) for z in re.findall(r'goPage\((\d+)\)',raw)] or [1])
  if page>=pages:break
 assert len(rows)==count,(name,len(rows),count,pages)
 result={'selector':name,'site_title':title,'calendar_year':year,'grade':grade,'month':int(month),'already_has_extra':'job1.html' in s or 'language1.html' in s,'rows':rows,'official_rows':count,'pagination_pages':pages,'params':params}
 print('inventory',name,'rows',count,flush=True);return result
if __name__=='__main__':
 names=json.loads((R/'selector-names.json').read_text());names=[x for x in names if x!='2020-6.html']
 with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:results=list(ex.map(collect,names))
 (R/'inventory.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print('INVENTORY COMPLETE',len(results),'selectors',sum(len(x['rows']) for x in results),'official rows',flush=True)
