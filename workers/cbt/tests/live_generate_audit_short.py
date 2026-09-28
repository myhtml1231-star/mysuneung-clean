import json,urllib.request,urllib.error
BASE='https://mysuneung.com'
HDR={'Content-Type':'application/json','User-Agent':'Mozilla/5.0'}

def post(body):
    req=urllib.request.Request(BASE+'/api/cbt/generate',data=json.dumps(body,ensure_ascii=False).encode(),headers=HDR,method='POST')
    try:return json.loads(urllib.request.urlopen(req,timeout=20).read())
    except urllib.error.HTTPError as e:return {'ok':False,'http':e.code,'body':e.read().decode('utf-8','replace')}

def validate(d,label,years,choice=None,legacy=None):
    out=[]
    if not d.get('ok'):return [('generate_fail',label,d)]
    e=d['exam'];pairs=[(s,q) for s in e['sections'] for q in s.get('questions',[])];qs=[q for _,q in pairs]
    if len(qs)!=45:out.append(('count',label,len(qs)))
    if [q.get('display_no') for q in qs]!=list(range(1,46)):out.append(('display_order',label))
    if e.get('time_limit_seconds')!=4800:out.append(('time',label,e.get('time_limit_seconds')))
    if len({s['id'] for s in e['sections']})!=len(e['sections']):out.append(('dup_section',label))
    for s in e['sections']:
        sq=s['questions']
        if s['display_start']!=sq[0]['display_no'] or s['display_end']!=sq[-1]['display_no']:out.append(('range',label,s['id']))
        if int(s['source']['academic_year']) not in years:out.append(('year',label,s['id'],s['source']['academic_year']))
        src=list(map(int,s['source'].get('original_questions') or []))
        actual=list(map(int,[q['original_no'] for q in sq]))
        if len(src)==2:
            expect=list(range(src[0],src[1]+1))
            if actual!=expect:out.append(('source_range',label,s['id'],src,actual))
        elif src and actual!=src:out.append(('source_list',label,s['id'],src,actual))
        for q in sq:
            if q.get('question_type') in ('','기타',None):out.append(('qtype',label,s['id'],q['original_no']))
            if q.get('skill') in ('','기타',None):out.append(('skill',label,s['id'],q['original_no']))
            if len(q.get('choices') or [])!=5:out.append(('choices',label,s['id'],q['original_no']))
    if legacy is not None and bool(e.get('legacy_format'))!=legacy:out.append(('legacy_flag',label,e.get('legacy_format')))
    if legacy:
        if [q['original_no'] for q in qs]!=list(range(1,46)):out.append(('legacy_order',label))
        if len({s['source']['month'] for s in e['sections']})!=1:out.append(('legacy_month_mix',label))
        if e.get('choice') is not None:out.append(('legacy_choice',label,e.get('choice')))
    else:
        if e.get('choice')!=choice:out.append(('choice',label,e.get('choice'),choice))
        if e.get('common_count')!=34 or e.get('elective_count')!=11:out.append(('counts',label,e.get('common_count'),e.get('elective_count')))
        if any(s['area']=='선택' for s,q in pairs[:34]):out.append(('early_elective',label))
        want='화법과 작문' if choice=='hw' else '언어와 매체'
        if any(s['category']!=want for s,q in pairs[34:]):out.append(('late_elective',label,[(s['id'],s['category']) for s,q in pairs[34:]]))
    return out

problems=[];n=0
for y in range(2017,2022):
    d=post({'years':[y],'mode':'full','choice':'hw'});n+=1;problems+=validate(d,f'{y}-legacy',{y},legacy=True)
for y in range(2022,2028):
    for ch in ('hw','lm'):
        d=post({'years':[y],'mode':'full','choice':ch});n+=1;problems+=validate(d,f'{y}-{ch}',{y},ch,False)
for years,ch in [([2021,2022],'hw'),([2019,2024],'lm'),([2017,2027],'hw'),([2017,2018,2022,2026],'lm')]:
    d=post({'years':years,'mode':'full','choice':ch});n+=1;problems+=validate(d,'mixed-'+','.join(map(str,years))+'-'+ch,set(years),ch,False)
print('GENERATIONS',n,'PROBLEMS',len(problems))
for x in problems:print('PROBLEM',x)
