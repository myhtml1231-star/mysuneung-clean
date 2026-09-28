#!/usr/bin/env python3
"""Small read-only web service: history lookup, audit and transparent reference comparison."""
from __future__ import annotations
import argparse,json,math,mimetypes,re,sqlite3,traceback,os
from contextlib import closing
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse,parse_qs,unquote
from data_model_v4 import MODEL_VERSION,CRITERIA,REASONS,classify,number,norm,admission_key
from score_engine_v4 import conversion,calculator_spec,calculate_official,CALCULATOR_CODES
from history_evidence_v41 import evidence_for_history,linked_years,OMISSION_LABELS
from evidence_v42 import comparison_row_allowed,unit_evidence,history_admission_evidence,omission_record
import university_directory as directory
import account_bridge
ROOT=Path(__file__).resolve().parent
STATIC=Path(os.environ.get('ADMISSION_STATIC_DIR',str(ROOT/'static_v4'))).resolve()
DB=Path(os.environ.get('ADMISSION_DB',str(ROOT.parent/'data/nationwide/admissions_web_v4.db'))).resolve()
BANDS=('안정','적정','소신','상향','판정보류')
STATE_LABELS={'structured':'공개 숫자 조회','official_structured':'공식자료 추출값','suppressed':'점수 비공개·미제출','missing_metrics':'점수 미확인','anomaly':'이상값 사용 보류','unparsed':'원문 확인 필요','source_header':'원문 표 머리글'}

def db():
 c=sqlite3.connect(f'file:{DB}?mode=ro',uri=True);c.row_factory=sqlite3.Row;return c

def text(v,name='검색어',maxlen=100):
 if not isinstance(v,str):raise ValueError(f'{name}은 문자열이어야 합니다.')
 if len(v)>maxlen:raise ValueError(f'{name}은 {maxlen}자 이하로 입력하세요.')
 return v.strip()

def integer(v,lo,hi,name):
 if isinstance(v,bool):raise ValueError(f'{name}은 정수여야 합니다.')
 try:x=float(v)
 except (ValueError,TypeError):raise ValueError(f'{name}은 정수여야 합니다.')
 if not math.isfinite(x) or not x.is_integer() or not lo<=x<=hi:raise ValueError(f'{name}은 {lo}~{hi} 범위의 정수여야 합니다.')
 return int(x)

def valid_num(v,lo,hi,name):
 x=number(v)
 if x is None or not lo<=x<=hi:raise ValueError(f'{name}: {lo}~{hi} 범위의 숫자를 입력하세요.')
 return x

def pagination(p):return integer(p.get('offset',0),0,1000000,'시작 위치'),integer(p.get('limit',24),1,100,'페이지 크기')

def jsonfields(d,keys):
 for k in keys:
  if d.get(k) is not None and isinstance(d[k],str):d[k]=json.loads(d[k])
 return d

def clean_name(s):return str(s or '').replace('[본교]','')

REFERENCE_FILTER="u.active=1 AND c.status='reference_ready' AND r.year=2026 AND r.state='structured' AND EXISTS(SELECT 1 FROM result_audit_v41 a WHERE a.result_id=r.id AND a.decision='source_rechecked') AND EXISTS(SELECT 1 FROM result_audit_v42 a2 WHERE a2.result_id=r.id AND a2.decision='retained') AND EXISTS(SELECT 1 FROM admission_scope_audit_v42 g WHERE g.unit_id=c.id AND g.scope='ordinary_label')"

def summary():
 with closing(db()) as c:
  d=json.loads(c.execute("select value from metadata where key='summary'").fetchone()[0])
  rows=c.execute("select c.*,r.admission historical_admission,r.raw_json historical_raw_json from catalog c join universities u on u.code=c.code join results r on r.id=c.result_2026_id where "+REFERENCE_FILTER).fetchall()
  eligible=[dict(x) for x in rows if comparison_row_allowed(dict(x))]
  d['snapshot_reference_rows']=d.get('reference_rows')
  d['reference_rows']=len(eligible)
  d['reference_university_records']=len({x['code'] for x in eligible})
  d['active_university_records']=c.execute('select count(*) from universities where active=1').fetchone()[0]
  d['ui_release']='20260920-v57-clean'
  d['display_count_basis']='현재 활성 대학·캠퍼스와 실제 비교 허용 조건으로 재집계; 보관 감사 기록의 시점과 구분'
  return d

def sources(c,code,year=None,limit=30):
 sql='select * from sources where code=?';args=[code]
 if year:sql+=' and year=?';args.append(year)
 sql+=" order by case when authority='official' then 0 when authority like 'official%' then 1 else 2 end, year desc,id desc limit ?";args.append(limit)
 return [dict(r) for r in c.execute(sql,args)]

def catalog_record(r):
 d=jsonfields(dict(r),['reasons']);d['reason_labels']=[REASONS.get(x,x) for x in d['reasons']];d['status_label']=REASONS.get(d['status'],d['status']);d['prediction_ready']=False;return d

def result_record(r,raw=False):
 d=jsonfields(dict(r),['p50','p70','metrics','issues','notes','evidence']);d['state_label']=STATE_LABELS.get(d['state'],d['state'])
 if raw:d['original_values']=json.loads(d.pop('raw_json'))
 else:d.pop('raw_json',None)
 d['reference_result_year']=d['year'];d['probability_available']=False
 return d

RESULT_SELECT='''select r.*,u.name as university,s.url as source_url,s.title as source_title,s.authority as source_authority,s.sha256 as source_sha256,s.checked_at as source_checked_at,e.payload as evidence from results r join universities u on u.code=r.code left join sources s on s.id=r.source_id left join result_evidence e on e.result_id=r.id'''
CAT_SELECT='''select c.*,u.name as university,u.original_name,u.region from catalog c join universities u on u.code=c.code'''

def query_filters(p,prefix='c',historical=False):
 cond=[prefix+".kind!='source_header'"] if historical else [];args=[]
 code=text(p.get('code',''),'대학 코드',20);kw=text(p.get('keyword',''))
 if code:cond.append(prefix+'.code=?');args.append(code)
 else:cond.append('u.active=1')
 dep=text(p.get('department_key',''),'모집단위',250)
 if dep:
  if historical:
   cond.append("(r.department_key=? OR EXISTS(SELECT 1 FROM unit_result_links dl JOIN catalog dc ON dc.id=dl.unit_id WHERE dl.result_id=r.id AND dc.code=r.code AND dc.department_key=?))");args.extend([norm(dep),norm(dep)])
  else:cond.append(prefix+'.department_key=?');args.append(norm(dep))
 if kw:
  cond.append(f"(replace(u.name,' ','') like ? or replace(u.original_name,' ','') like ? or {prefix}.department_key like ?)")
  val='%'+norm(kw)+'%';args.extend([val,val,val])
 season=text(p.get('season',''),'모집시기',10)
 if season not in ('','수시','정시','추가','미분류'):raise ValueError('모집시기를 확인하세요.')
 if season:cond.append(prefix+'.season=?');args.append(season)
 if historical:
  year=integer(p.get('year',2026),2025,2026,'입결 학년도');cond.append(prefix+'.year=?');args.append(year)
 else:
  if str(p.get('include_zero','0'))!='1':cond.append('c.quota>0')
  status=text(p.get('status',''),'상태',50)
  if status=='not_ready':cond.append("c.status!='reference_ready'")
  elif status:
   if status not in REASONS:raise ValueError('자료 상태를 확인하세요.')
   cond.append('c.status=?');args.append(status)
 return ' and '.join(cond) or '1=1',args

def get_catalog(p):
 off,limit=pagination(p);where,args=query_filters(p)
 with closing(db()) as c:
  total=c.execute('select count(*) from catalog c join universities u on u.code=c.code where '+where,args).fetchone()[0]
  rows=c.execute(CAT_SELECT+' where '+where+' order by u.name,c.department,c.season,c.admission,c.id limit ? offset ?',args+[limit,off]).fetchall()
 return {'total':total,'offset':off,'limit':limit,'has_more':off+len(rows)<total,'results':[catalog_record(r) for r in rows]}

def get_results(p):
 off,limit=pagination(p);where,args=query_filters(p,'r',True)
 uid=p.get('unit_id')
 if uid is not None:where+=' and exists(select 1 from unit_result_links l where l.result_id=r.id and l.unit_id=?)';args.append(integer(uid,1,10000000,'모집단위 ID'))
 with closing(db()) as c:
  total=c.execute('select count(*) from results r join universities u on u.code=r.code where '+where,args).fetchone()[0]
  rows=c.execute(RESULT_SELECT+' where '+where+" order by u.name,r.department,case when r.kind='official' then 0 else 1 end,r.admission,r.id limit ? offset ?",args+[limit,off]).fetchall()
 return {'total':total,'offset':off,'limit':limit,'has_more':off+len(rows)<total,'results':[result_record(r) for r in rows]}

def get_unit(uid):
 with closing(db()) as c:
  r=c.execute(CAT_SELECT+' where c.id=?',(uid,)).fetchone()
  if r is None:raise LookupError('해당 모집단위가 없습니다.')
  item=catalog_record(r)
  conditions=[dict(x) for x in c.execute('select description,url from unit_conditions where unit_id=?',(uid,))]
  sr=sources(c,item['code'],2027,12)
  om=c.execute('SELECT * FROM omission_audit WHERE unit_id=?',(uid,)).fetchone()
  item['omission']=jsonfields(dict(om),['detail']) if om else None
  if item['omission']:item['omission']['category_label']=OMISSION_LABELS.get(om['category'],om['category'])
  item['comparison_evidence']=unit_evidence(c,uid)
 return {'unit':item,'conditions':conditions,'sources':sr,'history_note':'동일 이름 또는 근거가 있는 이전 이름·분할 전신의 조회 연결입니다. 분할 전 입결을 현재 학과의 컷으로 간주하지 않습니다. 전형·모집군·평가방법은 연도별 확인이 필요합니다.','results2026':get_results({'unit_id':uid,'year':2026,'limit':30}), 'results2025':get_results({'unit_id':uid,'year':2025,'limit':30})}

def get_universities(p):
 kw=text(p.get('keyword',''));code=text(p.get('code',''),'대학코드',20)
 with closing(db()) as c:
  rows=c.execute('select * from universities where '+('code=?' if code else 'active=1')+' order by name',[code] if code else []).fetchall()
  ans=[]
  for r in rows:
   d=jsonfields(dict(r),['stats']);
   if kw and norm(kw) not in norm(d['name']+d['original_name']):continue
   if code:d['sources']=sources(c,code,None,60)
   ans.append(d)
 return {'total':len(ans),'results':ans}


def _directory_metric(metrics,label):
 try:items=json.loads(metrics or '[]') if isinstance(metrics,str) else (metrics or [])
 except Exception:return None
 for m in items:
  if m.get('label')==label:
   x=number(m.get('value'))
   return x if x is not None and x>=0 and x<9999 else None
 return None

def _directory_result_priority(kind):
 return {'official':0,'csat':1,'student_record':1,'predecessor':5}.get(kind,3)

def get_university_directory(p):
 off,limit=pagination(p);kw=text(p.get('keyword',''));region=text(p.get('region',''),'지역',20);sort=text(p.get('sort','name'),'정렬',30)
 if sort not in ('name','competition_desc','quota_desc','departments_desc'):raise ValueError('대학 정렬 조건을 확인하세요.')
 with closing(db()) as c:
  current={}
  for r in c.execute("""SELECT code,COALESCE(SUM(CASE WHEN quota>0 THEN quota ELSE 0 END),0) quota_sum,COUNT(DISTINCT department_key) department_count,
                                COUNT(DISTINCT admission) admission_count,COUNT(*) track_count
                         FROM catalog WHERE year=2027 AND season='정시' GROUP BY code"""):
   current[r['code']]=dict(r)
  chosen={}
  for r in c.execute("SELECT code,season,department_key,admission,kind,state,metrics FROM results WHERE year=2026 AND season IN ('수시','정시') AND state IN ('structured','official_structured')"):
   rate=_directory_metric(r['metrics'],'경쟁률')
   quota=_directory_metric(r['metrics'],'원문 최종 모집인원')
   if quota is None:quota=_directory_metric(r['metrics'],'최종 모집인원')
   if quota is None:quota=_directory_metric(r['metrics'],'모집인원')
   if rate is None or quota is None or quota<=0:continue
   key=(r['code'],r['season'],r['department_key'],admission_key(r['admission']))
   cand=(_directory_result_priority(r['kind']),float(rate),float(quota))
   if key not in chosen or cand[0]<chosen[key][0]:chosen[key]=cand
  comp={}
  for (code,season,_,_),(_,rate,quota) in chosen.items():
   d=comp.setdefault((code,season),[0.0,0.0,0]);d[0]+=rate*quota;d[1]+=quota;d[2]+=1
  calc={}
  for r in c.execute('''SELECT c.code,COUNT(*) n FROM formula_unit_profiles f
      JOIN catalog c ON c.id=f.unit_id
      WHERE c.year=2027 AND c.season='정시'
      AND json_extract(f.payload,'$.mapping_status')='verified'
      AND json_extract(f.payload,'$.runtime_gate') IN ('ready','ready_if_no_school_violence')
      GROUP BY c.code'''):
   if r['code'] in CALCULATOR_CODES:calc[r['code']]=int(r['n'])
  univs=[dict(r) for r in c.execute('SELECT code,name,original_name,region,active FROM universities WHERE active=1')]
  regions=sorted({u['region'] for u in univs if u['region']})
  rows=[]
  nk=norm(kw)
  for u in univs:
   if nk and nk not in norm(u['name']+u['original_name']):continue
   if region and u['region']!=region:continue
   st=current.get(u['code'],{})
   def season_comp(season):
    d=comp.get((u['code'],season));return round(d[0]/d[1],2) if d and d[1]>0 else None
   logo=None
   for ext in ('png','webp','jpg','jpeg','svg','gif','bmp','ico'):
    if (STATIC/'logos'/f"{u['code']}.{ext}").is_file():logo=f"/logos/{u['code']}.{ext}";break
   rows.append({'code':u['code'],'name':u['name'],'region':u['region'],'logo_url':logo,
      'competition_2026':{'수시':season_comp('수시'),'정시':season_comp('정시')},
      'quota_2027_regular':int(st.get('quota_sum') or 0),'department_count':int(st.get('department_count') or 0),
      'admission_count':int(st.get('admission_count') or 0),'track_count':int(st.get('track_count') or 0),
      'calculator_ready':u['code'] in calc,'calculator_unit_count':calc.get(u['code'],0)})
  if sort=='competition_desc':rows.sort(key=lambda x:(-(x['competition_2026']['정시'] if x['competition_2026']['정시'] is not None else -1),x['name']))
  elif sort=='quota_desc':rows.sort(key=lambda x:(-x['quota_2027_regular'],x['name']))
  elif sort=='departments_desc':rows.sort(key=lambda x:(-x['department_count'],x['name']))
  else:rows.sort(key=lambda x:(x['name'],x['code']))
  total=len(rows);page=rows[off:off+limit]
  return {'total':total,'offset':off,'limit':limit,'has_more':off+len(page)<total,'year':2027,
          'competition_year':2026,'competition_method':'모집인원이 공개된 학과·전형의 모집인원 가중 경쟁률',
          'quota_label':'2027 정시 모집','regions':regions,'results':page}


def get_calculator(p):
 code=text(p.get('code',''),'대학 코드',20)
 if not code:raise ValueError('대학을 선택하세요.')
 with closing(db()) as c:
  d=calculator_spec(c,code)
  if d is None:raise LookupError('대학을 찾을 수 없습니다.')
  return d

def calculator_input(p):
 if not isinstance(p,dict):raise ValueError('입력 형식을 확인하세요.')
 code=text(p.get('code',''),'대학 코드',20);uid=integer(p.get('unit_id'),1,10000000,'모집단위 ID')
 with closing(db()) as c:spec=calculator_spec(c,code)
 if not spec or spec.get('status')!='ready':raise ValueError('현재 계산 가능한 공식 환산식이 없습니다.')
 if uid not in {x['unit_id'] for x in spec['units']}:raise ValueError('계산 가능한 모집단위를 선택하세요.')
 values={}
 for f in spec['fields']:
  name=f['name'];typ=f.get('type','number')
  if typ=='select':
   value=text(str(p.get(name,'')),f['label'],30)
   if value not in {str(x['value']) for x in f['options']}:raise ValueError(f['label']+'을 확인하세요.')
   values[name]=value
  elif typ=='multiselect':
   raw=p.get(name,'')
   if isinstance(raw,list):items=[str(x).strip() for x in raw if str(x).strip()]
   else:items=[x.strip() for x in str(raw or '').split(',') if x.strip()]
   allowed={str(x['value']) for x in f.get('options',[])}
   if any(x not in allowed for x in items):raise ValueError(f['label']+'을 확인하세요.')
   values[name]=','.join(dict.fromkeys(items))
  else:
   values[name]=valid_num(p.get(name),f.get('min',0),f.get('max',300),f['label'])
   if f.get('step')==1 and not float(values[name]).is_integer():raise ValueError(f['label']+'은 정수로 입력하세요.')
 return code,uid,values

def calculate_official_api(p):
 code,uid,values=calculator_input(p)
 with closing(db()) as c:return calculate_official(c,code,uid,values)

def score_inputs(p):
 if not isinstance(p,dict):raise ValueError('입력 형식을 확인하세요.')
 inp={k:valid_num(p.get(k),0,100,label) for k,label in [('korean','국어'),('math','수학'),('inquiry1','탐구1'),('inquiry2','탐구2')]};inp['english']=integer(p.get('english'),1,9,'영어 등급')
 inp['history']=integer(p['history'],1,9,'한국사 등급') if p.get('history') not in (None,'') else None
 inp['school_violence']=text(p.get('school_violence','unknown'),'감점 조건',20)
 if inp['school_violence'] not in ('unknown','none','present'):raise ValueError('감점 조건을 확인하세요.')
 return inp

def recommend(p):
 inp=score_inputs(p)
 off,limit=pagination(p);kw=text(p.get('keyword',''));code=text(p.get('code',''),'대학코드',20);band=text(p.get('band','전체'),'지원구간',10)
 if band not in ('전체',)+BANDS:raise ValueError('지원 구간을 확인하세요.')
 where=REFERENCE_FILTER;args=[]
 if code:where+=' and c.code=?';args.append(code)
 if kw:
  val='%'+norm(kw)+'%';where+=" and (replace(u.name,' ','') like ? or replace(u.original_name,' ','') like ? or c.department_key like ?)";args+=[val,val,val]
 with closing(db()) as c:
  records=c.execute('''select c.*,u.name as university,r.p50,r.p70,r.admission as historical_admission,r.raw_json as historical_raw_json,r.source_id,
       s.title as source_title,s.url as source_url,s.sha256 as source_sha256
       from catalog c join universities u on u.code=c.code join results r on r.id=c.result_2026_id left join sources s on s.id=r.source_id where '''+where,args).fetchall()
 out=[];counts={x:0 for x in BANDS}
 for r in records:
  r=dict(r)
  if not comparison_row_allowed(r):continue
  profile=json.loads(r['p70']);res=classify(inp,profile,json.loads(r['p50']) if r['p50'] else None);counts[res['band']]+=1
  if band!='전체' and res['band']!=band:continue
  diff=res['delta'];why=f"내 공통지표 {res['average']:.2f} − 2026 참고지표 {profile['index']:.2f} = {diff:+.2f}점"
  out.append({'unit_id':r['id'],'code':r['code'],'university':clean_name(r['university']),'department':r['department'],
    'current_admission':r['admission'],'historical_admission':r['historical_admission'],'current_method':r['method'],'current_quota':r['quota'],
    'band':res['band'],'band_note':'독립 합불 검증 전 지원등급 부여 안 함','reference_position':res['reference_position'],'subject_gaps':res['subject_gaps'],'reason':why,'holds':res['holds'],
    'cut50':round(json.loads(r['p50'])['index'],2) if r['p50'] else None,'user_average':round(res['average'],2),'margin70':round(diff,2),'profile70':profile,'profile50':json.loads(r['p50']) if r['p50'] else None,
    'cut70':round(profile['index'],2),'source_url':r['source_url'],'source_title':r['source_title'],'result_id':r['result_2026_id'],
    'source_sha256':r['source_sha256'],'result_year':2026,'model_version':MODEL_VERSION,'probability':None,'prediction_ready':False,
    '_sort':(abs(diff),r['code'],r['department'],r['id'])})
 out.sort(key=lambda x:x['_sort'])
 total=len(out);ans=out[off:off+limit]
 with closing(db()) as c:
  for r in ans:
   r.pop('_sort',None)
   unit=dict(c.execute('SELECT * FROM catalog WHERE id=?',(r['unit_id'],)).fetchone())
   r['conversion']=conversion(c,unit,inp)
   ev=c.execute('SELECT payload FROM result_evidence WHERE result_id=?',(r['result_id'],)).fetchone()
   r['evidence']=json.loads(ev[0]) if ev else {}
   r['comparison_evidence']=unit_evidence(c,r['unit_id'])
 avg=(inp['korean']+inp['math']+(inp['inquiry1']+inp['inquiry2'])/2)/3
 return {'input':inp,'keyword':kw,'band':band,'average_percentile':round(avg,2),'total':total,'total_matches':sum(counts.values()),'counts':counts,'offset':off,'limit':limit,'has_more':off+len(ans)<total,'results':ans,
 'model_note':'임시 ±점수 판정 폐기. 합불 검증 전 안정·적정·소신·상향은 판정보류합니다. 2026 과거 공개값과 비교한 참고 지표입니다. 대학별 환산은 식·입력 조건이 검증된 경우 별도 표시합니다. 지원자격과 전년도 척도 비교가 미검증이면 합격 가능성을 확정하거나 확률을 부여하지 않습니다. 가까운 점수순으로 정렬합니다.'}

def get_departments(p):
 code=text(p.get('code',''),'대학 코드',20)
 if not code:raise ValueError('대학을 먼저 선택하세요.')
 with closing(db()) as c:
  items={}
  for r in c.execute('SELECT department_key,MIN(department) department,MIN(id) unit_id FROM catalog WHERE code=? GROUP BY department_key',(code,)):
   items[r['department_key']]={**dict(r),'years':[2027]}
  for r in c.execute("SELECT department_key,MIN(department) department,group_concat(DISTINCT year) years FROM results WHERE code=? AND kind!='source_header' GROUP BY department_key",(code,)):
   k=r['department_key'];item=items.setdefault(k,{'department_key':k,'department':r['department'],'unit_id':None,'years':[]})
   item['years']=sorted(set(item['years']+[int(y) for y in r['years'].split(',')]),reverse=True)
  year_map=linked_years(c,code)
  for key,item in items.items():
   item['linked_result_counts']=year_map.get(key,{})
   item['years']=sorted(set(item['years']+[int(y) for y in item['linked_result_counts']]),reverse=True)
  ans=sorted(items.values(),key=lambda x:x['department'])
 return {'code':code,'total':len(ans),'results':ans}

def get_history(p):
 code=text(p.get('code',''),'대학 코드',20);dep=text(p.get('department_key',''),'모집단위',250)
 if not code or not dep:raise ValueError('대학과 학과를 선택하세요.')
 base={'code':code,'season':p.get('season','정시'),'limit':100}
 base['department_key']=dep
 result={'code':code,'department_key':dep,'results2026':get_results({**base,'year':2026}), 'results2025':get_results({**base,'year':2025}),
  'note':'두 연도는 별도 자료입니다. 2025로 2026 결측을 메우지 않습니다. 이름·분할 전신이 연결된 경우에도 동일 컷·동일 전형을 뜻하지 않습니다.'}
 with closing(db()) as c:
  result.update(evidence_for_history(c,code,dep,result))
  result['admission_mapping_evidence']=history_admission_evidence(c,code,norm(dep))
 return result

def get_omissions(p):
 off,limit=pagination(p);code=text(p.get('code',''),'대학 코드',20);category=text(p.get('category',''),'누락 원인',100)
 where=['1=1'];args=[]
 if code:where.append('c.code=?');args.append(code)
 if category:where.append('o.category=?');args.append(category)
 keyword=text(p.get('keyword',''))
 if keyword:where.append("(c.department_key LIKE ? OR replace(u.name,' ','') LIKE ?)");args.extend(['%'+norm(keyword)+'%']*2)
 if p.get('positive_regular')=='1':where+=['c.quota>0',"c.season='정시'"]
 base=' FROM omission_audit o JOIN catalog c ON c.id=o.unit_id JOIN universities u ON u.code=c.code WHERE '+' AND '.join(where)
 with closing(db()) as c:
  total=c.execute('SELECT count(*)'+base,args).fetchone()[0]
  rows=c.execute('SELECT o.*,c.department,c.admission,c.season,c.quota,c.code,u.name university'+base+' ORDER BY u.name,c.department,c.id LIMIT ? OFFSET ?',args+[limit,off]).fetchall()
 return {'total':total,'offset':off,'limit':limit,'has_more':off+len(rows)<total,'results':[omission_record(r) for r in rows],'category_labels':OMISSION_LABELS}

def calculate_unit(p):
 inp=score_inputs(p);uid=integer(p.get('unit_id'),1,10000000,'모집단위 ID')
 with closing(db()) as c:
  unit=c.execute('SELECT * FROM catalog WHERE id=?',(uid,)).fetchone()
  if unit is None:raise LookupError('해당 모집단위가 없습니다.')
  return {'unit_id':uid,'conversion':conversion(c,dict(unit),inp),'probability':None,'prediction_ready':False}

class Handler(BaseHTTPRequestHandler):
 server_version='AdmissionReference/4'
 def log_message(self,fmt,*args):
  if urlparse(self.path).path.startswith(('/account/','/api/account/')):print(self.command,urlparse(self.path).path,flush=True)
  else:print(self.command,urlparse(self.path).path,fmt%args,flush=True)
 def send_bytes(self,data,typ='application/json; charset=utf-8',status=200):
  self.send_response(status)
  for k,v in [('Content-Type',typ),('Content-Length',str(len(data))),('Cache-Control','public, max-age=86400' if status==200 and (urlparse(self.path).path.startswith('/logos/') or typ.startswith(('text/css','application/javascript','text/javascript'))) else 'no-store, max-age=0'),('X-Content-Type-Options','nosniff'),('Referrer-Policy','no-referrer'),('X-Frame-Options','DENY'),('Permissions-Policy','camera=(), microphone=(), geolocation=()'),('Content-Security-Policy',"default-src 'self'; script-src 'self' https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.google.com https://*.doubleclick.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.googlesyndication.com https://*.google.com https://*.doubleclick.net; connect-src 'self' https://mysuneung.com https://*.googlesyndication.com https://*.google.com https://*.doubleclick.net; frame-src https://*.googlesyndication.com https://*.google.com https://*.doubleclick.net; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'")]:self.send_header(k,v)
  self.end_headers()
  if self.command!='HEAD':self.wfile.write(data)
 def send_json(self,obj,status=200):return self.send_bytes(json.dumps(obj,ensure_ascii=False,allow_nan=False).encode('utf-8'),status=status)
 def do_HEAD(self):return self.do_GET()
 def do_GET(self):
  self.account_asset_dir=STATIC/'account-assets'
  if account_bridge.handle(self):return
  try:
   u=urlparse(self.path);path=unquote(u.path);p={k:v[-1] for k,v in parse_qs(u.query,keep_blank_values=True).items()}
   if path=='/health':return self.send_json({'ok':DB.is_file(),'version':MODEL_VERSION,'ui_release':'20260920-v57-clean'})
   if path=='/api/meta':return self.send_json(summary())
   if path=='/api/criteria':return self.send_json(CRITERIA)
   if path=='/api/university-search':
    with closing(db()) as connection:return self.send_json(directory.search(connection,p))
   if path=='/api/university-overview':
    with closing(db()) as connection:return self.send_json(directory.overview(connection,p))
   if path=='/api/university-directory':return self.send_json(get_university_directory(p))
   if path=='/api/calculator':return self.send_json(get_calculator(p))
   if path=='/api/universities':return self.send_json(get_universities(p))
   if path=='/api/catalog':return self.send_json(get_catalog(p))
   if path=='/api/results':return self.send_json(get_results(p))
   if path=='/api/departments':return self.send_json(get_departments(p))
   if path=='/api/history':return self.send_json(get_history(p))
   if path=='/api/omissions':return self.send_json(get_omissions(p))
   if path=='/api/audit':
    d=summary();test=STATIC/'test-report.json';d['tests']=json.loads(test.read_text()) if test.exists() else {'state':'not_run'};return self.send_json(d)
   if re.fullmatch(r'/api/unit/\d+',path):return self.send_json(get_unit(integer(path.rsplit('/',1)[1],1,10000000,'모집단위 ID')))
   if re.fullmatch(r'/api/result/[A-Za-z0-9_-]{1,120}',path):
    with closing(db()) as c:r=c.execute(RESULT_SELECT+' where r.id=?',(path.rsplit('/',1)[1],)).fetchone()
    if r is None:raise LookupError('입결 행을 찾을 수 없습니다.')
    return self.send_json(result_record(r,True))
   if re.fullmatch(r'/logos/[0-9]{7}\.(?:png|webp|jpg|jpeg|svg|gif|bmp|ico)',path):
    f=(STATIC/path.lstrip('/')).resolve()
    if STATIC not in f.parents or not f.is_file():raise LookupError('대학 로고를 찾을 수 없습니다.')
    typ=mimetypes.guess_type(f.name)[0] or 'image/x-icon';return self.send_bytes(f.read_bytes(),typ)
   allowed={'/visitor.js':'visitor.js','/university-account.js':'university-account.js','/university-account.css':'university-account.css','/':'index.html','/index.html':'index.html','/app.js':'app.js','/styles.css':'styles.css','/schools.js':'schools.js','/schools.css':'schools.css','/audit-summary.json':'audit-summary.json','/university-audit.json':'university-audit.json','/test-report.json':'test-report.json','/AUDIT_REPORT.md':'AUDIT_REPORT.md','/about':'about.html','/about.html':'about.html','/privacy':'privacy.html','/privacy.html':'privacy.html','/terms':'terms.html','/terms.html':'terms.html','/guides':'guides.html','/guide/2027-regular':'guide-2027-regular.html','/guide/score-conversion':'guide-score-conversion.html','/guide/admission-results':'guide-admission-results.html','/methodology':'methodology.html','/robots.txt':'robots.txt','/sitemap.xml':'sitemap.xml','/ads.txt':'ads.txt','/favicon.svg':'favicon.svg'}
   for name in ('medical-verification.json','stratified-samples.json','outlier-review.json','MODEL_DESIGN.md','reaudit-summary.json','mapping-repairs.json','official-supplements.json','test-report-v41.json','audit-report-v42.json','numeric-blocks-v42.json','medical-verification-v42.json','admission-mapping-repairs-v42.json','catalog-classification-v42.json','test-report-v42.json','deployment-report-v42.json','directory-test-report-v43.json','directory-release-v43.json'):allowed['/'+name]=name
   if path not in allowed:raise LookupError('페이지를 찾을 수 없습니다.')
   f=STATIC/allowed[path]
   if not f.is_file():raise LookupError('아직 생성되지 않은 자료입니다.')
   typ=mimetypes.guess_type(f.name)[0] or 'application/octet-stream'
   return self.send_bytes(f.read_bytes(),typ+'; charset=utf-8')
  except ValueError as e:return self.send_json({'error':str(e)},400)
  except LookupError as e:
   if not urlparse(self.path).path.startswith('/api/'):
    f=STATIC/'404.html'
    if f.is_file():return self.send_bytes(f.read_bytes(),'text/html; charset=utf-8',404)
   return self.send_json({'error':str(e)},404)
  except Exception:
   traceback.print_exc();return self.send_json({'error':'요청 처리 중 오류가 발생했습니다.'},500)
 def do_PATCH(self):
  self.account_asset_dir=STATIC/'account-assets'
  if not account_bridge.handle(self):return self.send_json({'error':'Not found'},404)
 def do_POST(self):
  self.account_asset_dir=STATIC/'account-assets'
  if account_bridge.handle(self):return
  if urlparse(self.path).path not in ('/api/recommend','/api/score','/api/calculate'):return self.send_json({'error':'요청 경로를 확인하세요.'},404)
  try:
   length=integer(self.headers.get('Content-Length',0),0,10485760,'요청 길이')
   if length>16384:return self.send_json({'error':'입력 용량이 너무 큽니다.'},413)
   if self.headers.get('Content-Type','').split(';')[0]!='application/json':return self.send_json({'error':'JSON 형식으로 전송하세요.'},415)
   data=json.loads(self.rfile.read(length).decode('utf-8'),parse_constant=lambda _: (_ for _ in ()).throw(ValueError('유한한 JSON 숫자를 입력하세요.')))
   if not isinstance(data,dict):raise ValueError('입력은 JSON 객체여야 합니다.')
   path=urlparse(self.path).path
   if path=='/api/score':return self.send_json(calculate_unit(data))
   if path=='/api/calculate':return self.send_json(calculate_official_api(data))
   return self.send_json(recommend(data))
  except LookupError as e:return self.send_json({'error':str(e)},404)
  except (ValueError,UnicodeDecodeError) as e:return self.send_json({'error':str(e)},400)
  except Exception:
   traceback.print_exc();return self.send_json({'error':'점수 비교 처리 중 오류가 발생했습니다.'},500)
 def setup(self):
  super().setup();self.connection.settimeout(20)

def main():
 p=argparse.ArgumentParser();p.add_argument('--host',default='127.0.0.1');p.add_argument('--port',type=int,default=8080);a=p.parse_args()
 if not DB.is_file():raise RuntimeError('먼저 build_audited_data.py를 실행하세요.')
 print(f'Admission reference {MODEL_VERSION}: {a.host}:{a.port}',flush=True);ThreadingHTTPServer((a.host,a.port),Handler).serve_forever()
if __name__=='__main__':main()
