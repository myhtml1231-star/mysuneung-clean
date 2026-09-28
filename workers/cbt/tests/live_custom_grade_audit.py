import json,urllib.request,urllib.error,time
BASE='https://mysuneung.com'
HDR={'Content-Type':'application/json','User-Agent':'Mozilla/5.0'}

def post(path,body):
    req=urllib.request.Request(BASE+path,data=json.dumps(body,ensure_ascii=False).encode(),headers=HDR,method='POST')
    try:return json.loads(urllib.request.urlopen(req,timeout=20).read())
    except urllib.error.HTTPError as e:return {'ok':False,'http':e.code,'body':e.read().decode('utf-8','replace')}

def flat(e):
    return [(s,q) for s in e.get('sections',[]) for q in s.get('questions',[])]

cats=['독서론','인문','사회','과학','기술','예술','현대시','고전시가','현대소설','고전소설','판소리·민속극','복합문학','화법과 작문','언어와 매체']
problems=[];n=0
for cat in cats:
    d=post('/api/cbt/generate',{'years':list(range(2017,2028)),'mode':'custom','categories':[cat],'set_count':3})
    n+=1
    if not d.get('ok'):
        problems.append(('custom_generate',cat,d));continue
    e=d['exam']; pairs=flat(e)
    if e.get('mode')!='custom':problems.append(('custom_mode',cat,e.get('mode')))
    if e.get('categories')!=[cat]:problems.append(('custom_categories_field',cat,e.get('categories')))
    if not (1<=len(e.get('sections',[]))<=3):problems.append(('custom_section_count',cat,len(e.get('sections',[]))))
    if e.get('question_count')!=len(pairs):problems.append(('custom_qcount',cat,e.get('question_count'),len(pairs)))
    if [q.get('display_no') for s,q in pairs]!=list(range(1,len(pairs)+1)):problems.append(('custom_display',cat))
    if any(s.get('category')!=cat for s,q in pairs):problems.append(('custom_wrong_category',cat,[(s.get('id'),s.get('category')) for s,q in pairs]))
    if any(q.get('question_type') in ('기타','',None) for s,q in pairs):problems.append(('custom_bad_type',cat))
    if any(len(q.get('choices') or [])!=5 for s,q in pairs):problems.append(('custom_bad_choices',cat))

# Multi-category guarantee when set_count >= category count
multi=['사회','기술','현대소설','고전시가']
d=post('/api/cbt/generate',{'years':list(range(2017,2028)),'mode':'custom','categories':multi,'set_count':4});n+=1
if not d.get('ok'):problems.append(('multi_generate',d))
else:
    e=d['exam'];got={s.get('category') for s in e['sections']}
    if not set(multi).issubset(got):problems.append(('multi_missing_category',sorted(got)))

# Grading: one current full + one legacy full + one custom, answer all from live answer map.
ans_req=urllib.request.Request(BASE+'/cbt-data/answers.json?v='+str(time.time_ns()),headers={'User-Agent':'Mozilla/5.0','Cache-Control':'no-cache'})
answers=json.loads(urllib.request.urlopen(ans_req,timeout=20).read())

def grade_generated(genbody,label):
    d=post('/api/cbt/generate',genbody)
    if not d.get('ok'):return [('grade_generate_fail',label,d)]
    e=d['exam'];refs=[];submitted={}
    for s,q in flat(e):
        key=f"{int(s['source']['academic_year'])}-{int(s['source']['month']):02d}-{s['section_code']}-{int(q['original_no']):02d}"
        correct=answers.get(key)
        if correct not in (1,2,3,4,5):return [('grade_answer_missing_local',label,key,correct)]
        refs.append({'display_no':q['display_no'],'academic_year':s['source']['academic_year'],'month':s['source']['month'],'section_code':s['section_code'],'original_no':q['original_no']})
        submitted[str(q['display_no'])]=correct
    g=post('/api/cbt/submit',{'refs':refs,'answers':submitted})
    out=[]
    if not g.get('ok'):return [('grade_submit_fail',label,g)]
    total=len(refs)
    if (g.get('total_count'),g.get('correct_count'),g.get('wrong_count'),g.get('unanswered_count'),g.get('percent'))!=(total,total,0,0,100):
        out.append(('grade_score',label,{k:g.get(k) for k in ['total_count','correct_count','wrong_count','unanswered_count','percent']}))
    details=g.get('details') or []
    if len(details)!=total:out.append(('grade_details_count',label,len(details),total))
    if any(x.get('question_type') in ('','기타',None) or not x.get('category') for x in details):
        out.append(('grade_detail_metadata',label))
    return out

for body,label in [
    ({'years':[2026],'mode':'full','choice':'lm'},'current-lm'),
    ({'years':[2019],'mode':'full','choice':'hw'},'legacy'),
    ({'years':[2022,2023,2024,2025,2026,2027],'mode':'custom','categories':['사회','현대소설'],'set_count':4},'custom')
]:
    problems.extend(grade_generated(body,label));n+=1

print('CASES',n,'PROBLEMS',len(problems))
for p in problems:print('PROBLEM',p)
