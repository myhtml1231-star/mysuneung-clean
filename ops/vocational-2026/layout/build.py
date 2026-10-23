from pathlib import Path
import json,re,html,collections,sys
sys.path.insert(0,str(Path('vocational-completion').resolve()))
from common import norm

ROOT=Path('layout-correction');OUT=ROOT/'pages';OUT.mkdir(exist_ok=True)
SOURCE=Path('vocational-completion/release/pages')
rows=json.loads(Path('vocational-completion/subjects.json').read_text())
metadata=json.loads(Path('vocational-completion/round-metadata.json').read_text())
esc=html.escape
def cut_name(s):return f"cut-g{s['grade']}-{s['calendar_year']}-{'s' if s['grade']==3 and s['month']==11 else s['month']}.html"
def difficulty_name(s):return cut_name(s).replace('cut-','difficulty-extra-')
def rank_name(g,category):return f"고{g} {'직탐' if category=='vocational' else '제2외국어'} 난이도 top10.html"
def round_label(s):return f"{s['academic_year']}학년도 "+('수능' if s['grade']==3 and s['month']==11 else f"{s['month']}월")

# Existing download pages contain only the original three downloads.
for name in {s['page'] for s in rows}|{s['selector'] for s in rows}:
    source=Path('archive-expansion/release/pages')/name
    if not source.exists():source=Path('suneung-work/release/pages')/name
    (OUT/name).write_text(source.read_text())
for name in {cut_name(s) for s in rows}:
    text=(SOURCE/name).read_text()
    text=re.sub(r'<section class="notice"><strong>[^<]*체감 난이도.*?</section>','',text,flags=re.S)
    (OUT/name).write_text(text)
name='cut-g1-2026-10.html'
text=Path('suneung-work/release/pages',name).read_text()
(OUT/name).write_text(re.sub(r'<section class="notice"><strong>[^<]*체감 난이도.*?</section>','',text,flags=re.S))
for name in {difficulty_name(s) for s in rows}:
    text=(SOURCE/name).read_text()
    text=re.sub(r'<p><a href="[^\"]+">문제·정답·해설</a>.*?</p>','',text,flags=re.S)
    text=re.sub(r'<p><a href="/mixed-cbt[^\"]+">CBT 풀기</a></p>','',text)
    sample=next(s for s in rows if difficulty_name(s)==name)
    text=text.replace('href="'+sample['selector']+'"','href="'+rank_name(sample['grade'],'vocational')+'"')
    # The return target follows the selected subject category.
    text=text.replace('</main>', '<script>if(location.hash.startsWith("#lang-"))document.querySelector(".back").href='+json.dumps(rank_name(sample['grade'],'language'),ensure_ascii=False)+';</script></main>')
    (OUT/name).write_text(text)

# Match the existing TOP10 page structure and CSS for the two new subjects.
rank_report=[]
for grade in (2,3):
 for category,label in [('vocational','직업탐구'),('language','제2외국어/한문')]:
    template=Path(f'suneung-work/release/pages/고{grade} 사탐 난이도'+('top10.html' if grade==3 else ' top10.html')).read_text()
    subset=[s for s in rows if s['grade']==grade and s['category']==category]
    grouped=collections.defaultdict(list)
    for s in subset:grouped[s['slug']].append(s)
    filters='<button class="active" onclick="showSubject(\'all\', this)">전체</button>'
    cards=[]
    for slug,children in grouped.items():
        subject=children[0]['subject_name']
        filters+=f'<button onclick="showSubject(\'{esc(subject,quote=True)}\', this)">{esc(subject)}</button>'
        values=collections.defaultdict(list)
        for s in children:
            table=next(t for t in metadata['rounds'][s['record']]['cut_tables'] if norm(t['subject'])==norm(subject))
            if table['status']!='confirmed':continue
            value=None
            if category=='vocational':
                top=next((r for r in table['rows'] if r[0]=='최고점'),None)
                if top and '표준점수' in table['headers']:
                    v=top[table['headers'].index('표준점수')]
                    if v.isdigit():value=int(v)
            else:
                average=next((re.search(r'평균:\s*([0-9.]+)',v) for v in table['statistics'] if v.startswith('평균:')),None)
                if average:value=float(average[1])
            if value is not None:values[value].append(round_label(s))
        metric='최고 표준점수' if category=='vocational' else '평균 원점수'
        content=f'<div class="subject-box" data-name="{esc(subject,quote=True)}"><div class="subject-title">{esc(subject)} <span class="score-tag">{metric}</span></div>'
        ordered=sorted(values,reverse=category=='vocational')[:10]
        for i,value in enumerate(ordered,1):
            content+=f'<div class="test-item"><div><b>{i}위</b> — {esc(", ".join(values[value]))}</div><div>{value:g}</div></div>'
        if not values:content+='<div class="test-item"><div>확정된 비교 지표가 없습니다.</div></div>'
        content+='<details><summary>회차별 문항 오답률</summary>'
        for s in sorted(children,key=lambda s:(s['calendar_year'],s['month']),reverse=True):
            content+=f'<div class="test-item"><div><a href="{difficulty_name(s)}#{slug}">{round_label(s)}</a></div></div>'
        content+='</details></div>';cards.append(content)
        rank_report.append({'grade':grade,'subject':slug,'ranked_rounds':sum(map(len,values.values())),'wrong_rate_rounds':len(children)})
    title=f'역대 고{grade} {label} 난이도 TOP10'
    note=('과목별 최고 표준점수가 높은 순으로 정렬했습니다.' if category=='vocational' else '제2외국어/한문은 표준점수가 공개되지 않아 과목별 평균 원점수가 낮은 순으로 정렬했습니다. 평균 원점수는 50점 만점이며 응시 집단에 따라 달라질 수 있습니다.')
    note+='<br>자료 기준: EBSi 공식 공개 통계. 확정 전 회차와 비교 지표가 공개되지 않은 회차는 순위에서 제외했습니다. 각 과목의 회차별 문항 오답률에서 모든 회차를 확인할 수 있습니다.'
    body='<body><div class="container"><div class="subject-filter">'+filters+'</div><div class="page-title"><img src="Images/logo.png" alt="로고"><h2>'+title+'</h2></div><div class="note">'+note+'</div><div class="subject-grid">'+''.join(cards)+'</div><a class="back-btn" href="index.html">← 이전 화면으로 돌아가기</a></div>\n'
    text=re.sub(r'<title>.*?</title>',f'<title>{title}</title>',template,count=1)
    start=text.index('<body>');end=text.index('<script>',start)
    text=text[:start]+body+text[end:]
    (OUT/rank_name(grade,category)).write_text(text)

# Login remains a plain button. No page-wide row or border is inserted.
nav=(ROOT/'navigation.js').read_text()
nav=nav.replace('background:#fff;border:1px solid #dfe4eb','background:transparent;border:0').replace('border-radius:9px','border-radius:0').replace('padding:8px 12px','padding:0')
nav=nav.replace("a:hover{background:#f8fafc}","a:hover{color:#b06a08}")
nav=nav.replace(".msn-account-button:hover{background:#f8fafc!important}",".msn-account-button:hover{color:#b06a08!important}")
nav=nav.replace(':host{display:inline-flex;flex:none;max-width:100%;vertical-align:middle}',':host{display:inline-flex;flex:none;max-width:100%;vertical-align:middle}@media(max-width:640px){:host{top:4px!important}}')
old="""      const row=document.createElement('div');
      row.style.cssText='display:flex;justify-content:flex-end;align-items:center;gap:12px;padding:8px 18px;background:#fff;border-bottom:1px solid #e9edf5;box-sizing:border-box;position:relative;z-index:1';
      row.append(host);document.body.prepend(row);"""
new="""      host.style.cssText='position:absolute;top:18px;right:22px;z-index:10';
      document.body.prepend(host);"""
assert old in nav;nav=nav.replace(old,new)
(ROOT/'navigation-fixed.js').write_text(nav)

menu=''.join('<div class="year-item" tabindex="0">'+label+'<div class="submenu" aria-hidden="true">'+''.join(f'<div><a href="{rank_name(g,category)}">고{g}</a></div>' for g in (3,2))+'</div></div>' for category,label in [('vocational','직업탐구'),('language','제2외국어/한문')])
(ROOT/'difficulty-menu.html').write_text(menu)

# Minimal Worker presentation patch; deployed CBT, accounts and private data stay intact.
worker=Path('vocational-completion/release/workers/admin_base.mjs').read_text()
needle='      const examDownloadResponse = await serveExamDownloads(request, env, url);'
assert worker.count(needle)==1
worker=worker.replace(needle,"""      if(url.pathname==='/account-assets/navigation.js' && ['GET','HEAD'].includes(request.method))return new Response(request.method==='HEAD'?null:LAYOUT_NAVIGATION,{headers:{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-cache, max-age=0','X-Content-Type-Options':'nosniff'}});
"""+needle)
needle='      if (publicFile === "index.html" && request.method === "GET" && response.ok) response = await octoberHomeLinks(response);'
assert needle in worker
worker=worker.replace(needle,needle+'\n      if(request.method==="GET" && response.ok && (publicFile==="index.html" || LAYOUT_PAGES.has(decodedPath)))response=await separateStudyPages(response,decodedPath,publicFile==="index.html");')
worker+='\nconst LAYOUT_NAVIGATION='+json.dumps(nav,ensure_ascii=False)+';\n'
worker+='const LAYOUT_PAGES=new Set('+json.dumps(['/'+p.name for p in OUT.glob('*.html')],ensure_ascii=False)+');\n'
worker+='const LAYOUT_DIFFICULTY_MENU='+json.dumps(menu,ensure_ascii=False)+';\n'
worker+='''async function separateStudyPages(response,path,isHome){
 let html=await response.text();
 if(isHome){
   const start=html.indexOf('id="panel-wrongs"');
   if(start>=0){const end=html.indexOf('<!-- 문의사항 -->',start),section=html.slice(start,end);if(!section.includes('직업탐구')){const marker=section.lastIndexOf('</div>\\n              </div>');if(marker>=0)html=html.slice(0,start)+section.slice(0,marker)+LAYOUT_DIFFICULTY_MENU+section.slice(marker)+html.slice(end);}}
 }else{
   html=html.replace(/<a class="download-box" href="(?:cut-|difficulty-extra-|\\/mixed-cbt)[^\"]*">.*?<\\/a>\\s*/gs,'');
   html=html.replace(/<div class="subject-item"><div class="subject-box"[^>]*>직탐·제2외국어 통계.*?<\\/div><\\/div>\\s*/gs,'');
   if(path.startsWith('/cut-'))html=html.replace(/<section class="notice"><strong>[^<]*체감 난이도.*?<\\/section>/gs,'');
   if(path.startsWith('/difficulty-extra-')){
     html=html.replace(/<p><a href="[^\"]+">문제·정답·해설<\\/a>.*?<\\/p>/gs,'').replace(/<p><a href="\\/mixed-cbt[^\"]+">CBT 풀기<\\/a><\\/p>/g,'');
   }
 }
 const headers=new Headers(response.headers);headers.delete('Content-Length');headers.delete('ETag');headers.set('X-Mysuneung-Layout','separate-study-v1');
 return new Response(html,{status:response.status,headers});
}
'''
(ROOT/'admin_base.mjs').write_text(worker)
(ROOT/'verification.json').write_text(json.dumps({'download_pages':len(rows),'round_selectors':len({s['selector'] for s in rows}),'grade_cut_pages':28,'wrong_rate_pages':27,'difficulty_rank_pages':4,'total_pages':len(list(OUT.glob('*.html'))),'ranks':rank_report},ensure_ascii=False,indent=2))
print('Prepared',len(list(OUT.glob('*.html'))),'separated pages and plain login navigation')
