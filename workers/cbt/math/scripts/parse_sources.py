"""Deterministic extraction of official PDF question positions, answers and learning objectives.
Never OCR or reconstruct formulas. Any ambiguous answer/point/crop blocks publication.
"""
from pathlib import Path
import fitz,re,json,sys,hashlib,collections
ROOT=Path(sys.argv[1]) if len(sys.argv)>1 else Path.home()/'Downloads/mysuneung-math-cbt-20260929'
PUA={chr(0xE033+i):str(i) for i in range(1,10)};PUA[chr(0xE03D)]='0'
TRANS=str.maketrans({**PUA,**{chr(0xFF10+i):str(i) for i in range(10)},'．':'.','：':':'})
CIRCLE={c:i+1 for i,c in enumerate('①②③④⑤')}
def norm(s):return s.translate(TRANS).translate(str.maketrans('➀➁➂➃➄ⓛ⓵⓶⓷⓸⓹','①②③④⑤①①②③④⑤'))
def av(v):return CIRCLE[v] if v in CIRCLE else int(v)
H=re.compile(r'(?m)^\s*(\d{1,2})\s*\.\s*\[?\s*출제\s*의도\s*\]?\s*:?')
A=re.compile(r'(?:정\s*답\s*[:：]?|<\s*답\s*>|답\s*[:：])\s*([①②③④⑤]|[0-9]{1,3})(?![0-9])')
PAIR=re.compile(r'(?<![0-9])(\d{1,2})\.\s*([①②③④⑤]|[0-9]{1,3})(?![0-9])')

def layout_text(p):
    # Recover invalid CID->Unicode mappings only at matching PDF character origins.
    corrections={}
    for span in p.get_texttrace():
        for cp,gid,origin,bbox in span['chars']:
            if cp==65533 and 44032<=gid+4650<=55203:
                corrections[(round(origin[0],1),round(origin[1],1))]=chr(gid+4650)
    words=[]
    for block in p.get_text('rawdict')['blocks']:
        for line in block.get('lines',[]):
            for span in line['spans']:
                token=[]
                for c in span['chars']+[None]:
                    if c is not None:
                        ch=corrections.get((round(c['origin'][0],1),round(c['origin'][1],1)),c['c'])
                    if c is None or ch.isspace():
                        if token:
                            words.append((min(z[1][0] for z in token),min(z[1][1] for z in token),max(z[1][2] for z in token),max(z[1][3] for z in token),''.join(z[0] for z in token),token[0][2]))
                            token=[]
                    else:token.append((ch,c['bbox'],c['origin'][1]))
    w,h=p.rect.width,p.rect.height
    school=w>700 and h>1000
    cuts=[0,.368*w,.638*w,w] if school else [0,.5*w,w]
    out=[]
    for a,b in zip(cuts,cuts[1:]):
        ws=sorted([v for v in words if a<=v[0]<b and .09*h<v[1]<.945*h],key=lambda v:v[5])
        rows=[]
        for v in ws:
            y=v[5]
            if not rows or abs(y-rows[-1][0])>1.6:rows.append([y,[]])
            rows[-1][1].append(v)
        for y,line in rows:out.append(' '.join(x[4] for x in sorted(line,key=lambda v:v[0])))
    t=norm('\n'.join(out))
    # Native PDF spans sometimes split one printed integer across fonts on the same line.
    t=re.sub(r'(?m)(정답\s+)([0-9]) +([0-9])(?: +([0-9]))?\s*$',lambda m:m[1]+m[2]+m[3]+(m[4] or ''),t)
    t=re.sub(r'(?m)(\b\d{1,2}\. +)([0-9]) +([0-9])(?: +([0-9]))?(?= *$)',lambda m:m[1]+m[2]+m[3]+(m[4] or ''),t)
    return t

def solparse(path,track):
    manual=json.loads((Path(__file__).parents[1]/'manual-review.json').read_text())
    form_id=path.name.removesuffix('-solution.pdf');source_sha=hashlib.sha256(path.read_bytes()).hexdigest()
    manual_key=manual['solution_keys'].get(form_id)
    adjudications={int(a['question']):a for a in manual.get('adjudications',[]) if a.get('form')==form_id}
    if manual_key and source_sha!=manual_key['sha256']:raise ValueError('manual key source changed')
    for a in adjudications.values():
        if a.get('sha256') and source_sha!=a['sha256']:raise ValueError('adjudication source changed')
    doc=fitz.open(path);rawtexts=[norm(p.get_text()) for p in doc];layouttexts=[layout_text(p) for p in doc]
    rawfull='\n'.join(rawtexts);rawhs=[int(m[1]) for m in H.finditer(rawfull)]
    expected1=list(range(1,31));expected2=list(range(1,23))+list(range(23,31))*3
    texts=rawtexts if rawhs in [expected1,expected2] and not path.name.startswith('2014-09') else layouttexts
    full='\n'.join(texts)
    if path.name=='2014-09-B-solution.pdf':full=re.sub(r'(?m)^24\.[^\n]*\n출제의도', '24. 출제의도', full)
    heads=list(H.finditer(full));number_seq=[int(h[1]) for h in heads]
    expected=list(range(1,31));multi=number_seq==list(range(1,23))+list(range(23,31))*3
    multi=multi or number_seq.count(23)>=3
    # Missing objective headings do not invalidate an independently complete official answer table.
    table_groups=[]
    for pi in range(len(texts)):
      for t in [rawtexts[pi],layouttexts[pi]]:
        pairs=list(PAIR.finditer(t));run=[]
        for p in pairs+[None]:
            if p is not None and (not run or (int(p[1])==int(run[-1][1])+1 and p.start()-run[-1].end()<80)):
                run.append(p);continue
            if len(run)>=8 and int(run[0][1]) in [1,23] and int(run[-1][1]) in [22,30]:
                table_groups.append({'page':pi+1,'values':{int(x[1]):(None if x[2]=='-' else av(x[2])) for x in run}})
            run=[p] if p else []
        # No-dot answer tables: recognize a full consecutive 1..22 or 23..30 run only.
        npat=re.compile(r'(?<![0-9.])(\d{1,2})\s+([①②③④⑤]|[0-9]{1,3}|-)(?![0-9.])')
        pairs=list(npat.finditer(t));run=[]
        for pm in pairs+[None]:
            if pm is not None and (not run or (int(pm[1])==int(run[-1][1])+1 and pm.start()-run[-1].end()<30)):
                run.append(pm);continue
            if len(run) in [8,22,30] and int(run[0][1]) in [1,23] and int(run[-1][1]) in [22,30]:
                table_groups.append({'page':pi+1,'values':{int(x[1]):(None if x[2]=='-' else av(x[2])) for x in run}})
            run=[pm] if pm else []
    # Assign table identities by the verified question sequence / section order.
    dedup={}
    for tb in table_groups:
        k=(tb['page'],tuple(sorted(tb['values'].items())))
        dedup[k]=tb
    table_groups=list(dedup.values())
    table_groups.sort(key=lambda tb:(tb['page'],min(tb['values'])))
    tables=[]
    for tb in table_groups:
        n0=min(tb['values']);key='common' if n0==1 else track
        if n0!=1 and multi:
            pt=rawtexts[tb['page']-1]
            selected=re.search(r'\[(?:선택\s*:\s*)?(확률과\s*통계|미적분|기하)\]',pt)
            if selected:key={'확률과통계':'prob','미적분':'calc','기하':'geom'}[re.sub(r'\s+','',selected[1])]
            else:continue
        tables.append({**tb,'section':key})
    result={};conflicts=[]
    # The section is determined by resets of the original question sequence, not by missing heading positions.
    elective_index=-1
    for idx,h in enumerate(heads):
        q=int(h[1]);
        if q==23:elective_index+=1
        section='common'
        if q>=23 and number_seq==expected2:section=['prob','calc','geom'][(idx-22)//8]
        elif q>=23 and multi:
            sec=list(re.finditer(r'선택\s*:\s*(확률과\s*통계|미적분|기하)',full[:h.start()]))
            if sec:section={'확률과통계':'prob','미적분':'calc','기하':'geom'}[re.sub(r'\s+','',sec[-1][1])]
            elif elective_index in [0,1,2]:section=['prob','calc','geom'][elective_index]
            else:continue
        if multi and q>=23 and section!=track:continue
        content=full[h.end():heads[idx+1].start() if idx+1<len(heads) else len(full)]
        next_table=re.search(r'\[선택\s*:',content)
        if next_table:content=content[:next_table.start()]
        ans=[av(m[1]) for m in A.finditer(content) if (m.start()==0 or content[m.start()-1] not in '해정')]
        # A following section title ending in 정답 is not the previous question's answer.
        if re.match(r'202[2-7]-07',path.name) and q==22:ans=[]
        # A missing heading means this span contains another question. Grade only from the independent answer table.
        if idx+1<len(heads) and int(heads[idx+1][1])!=q+1 and q not in [22,30]:ans=[]
        if path.name=='2016-11-B-solution.pdf' and q==9:ans=[]  # adjudicated from problem + table; see manual-review.json
        if path.name.startswith('2024-09') and section=='geom' and q==28:ans=[]  # original choice 1 is computed value 6; reviewed
        # Rare repeated answer statements must agree.
        unique=set(ans)
        table=[tb['values'][q] for tb in tables if q in tb['values'] and (q<=22 or tb['section'] in ['common',track])]
        tv=set(table)
        inline=next(iter(unique)) if len(unique)==1 else None;tab=next(iter(tv)) if len(tv)==1 else None
        used_adjudication=q in adjudications
        if used_adjudication:
            answer=adjudications[q]['answer']
        else:
            if len(unique)>1 or len(tv)>1:conflicts.append({'q':q,'inline':ans,'table':table})
            if inline is not None and tab is not None and inline!=tab:conflicts.append({'q':q,'inline':inline,'table':tab})
            answer=tab if tab is not None else inline
        if answer is None:continue
        objective=content.split('정답풀이')[0].split('정답 풀이')[0]
        end=re.search(r'\?|한다\s*\.',objective)
        objective=objective[:end.end()] if end else objective.strip().split('\n')[0][:200]
        objective=re.sub(r'\s+',' ',objective).strip()
        startpage=full[:h.start()].count('\n') # replaced below with exact character offsets
        offset=0;page=1
        for pi,t in enumerate(texts):
            if offset+len(t)>=h.start():page=pi+1;break
            offset+=len(t)+1
        result[q]={'answer':answer,'objective':objective,'solution_page':page,'answer_evidence':('official_all_answers_accepted' if used_adjudication and adjudications[q].get('accepted_answers') else 'visually_verified_official_answer_table' if used_adjudication else 'table_and_solution' if inline is not None and tab is not None else 'answer_table' if tab is not None else 'explicit_solution_answer')}
        if used_adjudication and adjudications[q].get('accepted_answers'):
            result[q]['accepted_answers']=adjudications[q]['accepted_answers']
    for q in range(1,31):
        if q in result:continue
        choices=[tb for tb in tables if q in tb['values'] and (q<=22 or tb['section'] in ['common',track])]
        values={tb['values'][q] for tb in choices}
        if len(values)!=1 and manual_key:
            result[q]={'answer':manual_key['answers'][q-1],'objective':'','solution_page':1,'answer_evidence':'visually_verified_official_answer_table;objective_pending'};continue
        if len(values)!=1:raise ValueError('no verified table or explicit answer '+str(q))
        result[q]={'answer':next(iter(values)),'objective':'','solution_page':choices[0]['page'],'answer_evidence':'answer_table;objective_pending'}
    if manual_key and any(result[q]['answer']!=manual_key['answers'][q-1] for q in result):raise ValueError('manual table differs '+str([(q,result[q]['answer'],manual_key['answers'][q-1]) for q in result if result[q]['answer']!=manual_key['answers'][q-1]]))
    if conflicts:raise ValueError('answer conflicts '+str(conflicts))
    return result

def positions(path):
    manual=json.loads((Path(__file__).parents[1]/'manual-review.json').read_text())['problem_layouts'].get(path.name.removesuffix('-problem.pdf'))
    if manual:
        if hashlib.sha256(path.read_bytes()).hexdigest()!=manual['sha256']:raise ValueError('manual crop source changed')
        return manual['questions']
    d=fitz.open(path);found=[];shared=[]
    for pi,p in enumerate(d):
        w,h=p.rect.width,p.rect.height;lines=[]
        for b in p.get_text('dict')['blocks']:
            for line in b.get('lines',[]):
                tx=norm(''.join(s['text'] for s in line['spans']));x0,y0,x1,y1=line['bbox'];lines.append((tx,x0,y0,x1,y1))
        marks=[]
        for tx,x,y,x1,y1 in lines:
            pair=re.search(r'\[\s*(\d{1,2})\s*[~∼～－-]\s*(\d{1,2})\s*\]',tx)
            if pair:shared.append({'first':int(pair[1]),'last':int(pair[2]),'page':pi+1,'col':0 if x<.48*w else 1,'top':y-7,'w':w})
        for tx,x,y,x1,y1 in lines:
            m=re.match(r'^\s*(\d{1,2})\.\s*',tx)
            if m and 1<=int(m[1])<=30 and y>.115*h and y<.89*h:
                if .075*w<x<.135*w or .48*w<x<.555*w:marks.append({'no':int(m[1]),'page':pi+1,'x':x,'y':y,'col':0 if x<.48*w else 1})
        for m in marks:
            nx=[z['y'] for z in marks if z['col']==m['col'] and z['y']>m['y']+8]
            left=(.098 if m['col']==0 else .485)*w;right=(.493 if m['col']==0 else .9)*w
            bottom=min(nx)-7 if nx else .892*h
            # Avoid end-of-exam instructions; keep all actual question content above.
            foot=[y for tx,x,y,x1,y1 in lines if y>m['y']+20 and left<x<right and re.search(r'확인\s*사항|◦이어서|◦답안지',tx)]
            if foot:bottom=min(bottom,min(foot)-10)
            rect=fitz.Rect(left,m['y']-7,right,bottom)
            txt=norm(p.get_text(clip=rect))
            points=re.findall(r'\[\s*([234])\s*점\s*\]',txt)
            if not points:
                points=re.findall(r'\[\s*([234])\s*\]',txt)
            if len(points)!=1:raise ValueError(f'points q{m["no"]}: {points} page {pi+1} rect {rect}')
            circles=re.findall('[①②③④⑤]',txt)
            typ='mcq' if circles else 'numeric'
            if circles and set(circles)!=set(CIRCLE):raise ValueError('incomplete choices q'+str(m['no']))
            if re.search(r'\[\s*\d+\s*[~～∼]\s*\d+\s*\]',txt):raise ValueError('shared stem needs explicit grouping')
            found.append({**m,'rect':list(rect),'points':int(points[0]),'answer_type':typ,'text':txt})
    for stem in shared:
        first=next((q for q in found if q['no']==stem['first']),None)
        if not first or first['page']!=stem['page'] or first['col']!=stem['col']:raise ValueError('shared stem needs manual layout')
        if first['rect'][1]<=stem['top']:raise ValueError('invalid shared stem bounds')
        part={'page':stem['page'],'rect':[(.098 if stem['col']==0 else .485)*stem['w'],stem['top'],(.493 if stem['col']==0 else .9)*stem['w'],first['rect'][1]-2]}
        for q in found:
            if stem['first']<=q['no']<=stem['last']:
                q['shared_group']=str(stem['first'])+'-'+str(stem['last']);q['prepend_parts']=[part]
    found.sort(key=lambda x:x['no'])
    if [v['no'] for v in found]!=list(range(1,31)):raise ValueError('question numbering '+str([v['no'] for v in found]))
    if sum(v['points'] for v in found)!=100:raise ValueError('points total not 100')
    return found

def main():
    manifest=json.loads((ROOT/'source-manifest.json').read_text());parsed=[];errors=[]
    for r in manifest:
        try:
            pp=ROOT/'sources'/(r['id']+'-problem.pdf');sp=ROOT/'sources'/(r['id']+'-solution.pdf')
            qs=positions(pp);sol=solparse(sp,r['track'])
            for q in qs:
                q.update(sol[q['no']]);expected='mcq' if q['no']<=15 or q['no'] in range(23,29) else 'numeric'
                if r['academic_year']<2022:expected='mcq' if q['no']<=21 else 'numeric'
                if q['answer_type']!=expected:raise ValueError('answer kind mismatch '+str(q['no']))
                if not(1<=q['answer']<=5) and expected=='mcq':raise ValueError('choice answer outside range')
                if not 0<=q['answer']<=999:raise ValueError('numeric answer outside range')
            parsed.append({**r,'questions':qs})
        except Exception as e:errors.append({'id':r['id'],'error':str(e)})
    (ROOT/'parsed-forms.json').write_text(json.dumps(parsed,ensure_ascii=False,indent=2));(ROOT/'parse-errors.json').write_text(json.dumps(errors,ensure_ascii=False,indent=2))
    print('PARSED',len(parsed),'FAILED',len(errors))
    for e in errors:print(e)
if __name__=='__main__':main()
