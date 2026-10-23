from common import *
import html

PREFIX='vocational/20261023-v1/';OUT=ROOT/'release/data'/PREFIX/'ui';OUT.mkdir(parents=True,exist_ok=True)
template=Path('suneung-work/current/ui/pause-source-20261009-v1/app/physics.html').read_text()
original_nav=re.search(r'<nav class="cbt-subject-nav".*?</nav>',template,re.S).group()
old_subjects=[('korean','국어'),('math','수학'),('english','영어'),('history','한국사'),('physics','물리학Ⅰ'),('chemistry','화학Ⅰ'),('biology','생명과학Ⅰ'),('earthscience','지구과학Ⅰ'),('physics2','물리학Ⅱ'),('chemistry2','화학Ⅱ'),('biology2','생명과학Ⅱ'),('earthscience2','지구과학Ⅱ'),('ethicslife','생활과 윤리'),('ethics','윤리와 사상'),('koreangeography','한국지리'),('worldgeography','세계지리'),('eastasianhistory','동아시아사'),('worldhistory','세계사'),('politics','정치와 법'),('economics','경제'),('society','사회문화')]
extra_js=(ROOT/'extra-ui.js').read_text();report=[]
for slug,label in LABELS.items():
    bank=json.loads((ROOT/'release/data'/PREFIX/'banks'/(slug+'.json')).read_text())
    source=template.replace('physics',slug).replace('物理학Ⅰ',label).replace('물리학Ⅰ',label)
    # The source's navigation must retain the original subject labels/order.
    nav='<nav class="cbt-subject-nav" aria-label="CBT 과목">'
    for subject,title in old_subjects+list(LABELS.items()):
        nav+=f'<span aria-current="page" class="ghost subject-active">{html.escape(title)}</span>' if subject==slug else f'<a class="ghost" href="/mixed-cbt?subject={subject}">{html.escape(title)}</a>'
    nav+='</nav>'
    source=re.sub(r'<nav class="cbt-subject-nav".*?</nav>',lambda m:nav,source,count=1,flags=re.S)
    source=re.sub(r'var YEARS=\[[^\]]*\];','var YEARS='+json.dumps(bank['years'])+';',source,count=1)
    section=next(iter(bank['questions'].values()))['section_code']
    source=source.replace('SCIENCE_SECTION="ph1"','SCIENCE_SECTION='+json.dumps(section))
    source=source.replace('2026-10-05.'+slug+'.grid-v4','2026-10-23.voclang.v1')
    source=source.replace('q.section_code===SCIENCE_SECTION','q.subject_key===SCIENCE_SLUG')
    source=source.replace("u.pathname.startsWith('/cbt-data/science/v3/'+SCIENCE_SLUG+'/questions/')","u.pathname.startsWith('/cbt-data/"+PREFIX+"images/')")
    source=source.replace('flat.length>20','flat.length>30').replace('exam.question_count<=20','exam.question_count<=30').replace('keys.length>20','keys.length>30')
    source=source.replace('c>20||!["ph1","ch1","bio1","earth1"].includes(n)','c>30||!/^([vl]\\d{2})g[23]$/.test(n)')
    source=source.replace('JSON.stringify(body)','JSON.stringify(extraRequestOptions(body))')
    source=source.replace('schema_version:2,subject:', 'schema_version:2,subject_key:SCIENCE_SLUG,subject:')
    # Type-specific transfer needs reviewed taxonomy; keep source review available.
    source=re.sub(r" const practice='<div class=\"r5-actions\">.*?</div>';", " const practice='';", source, count=1)
    source=source.replace('2014~2027학년도',str(min(bank['years']))+'~'+str(max(bank['years']))+'학년도')
    source=source.replace('1~20문항','1~30문항')
    assert "categories?'+p)" in source
    source=source.replace("categories?'+p)","categories?'+p+'&source_session='+encodeURIComponent(window.extraSourceSession||''))")
    source=source.replace("const inherited=id=>selected.some", "const inherited=id=>id==='전체 문항'?selected.includes(id):selected.some")
    source=source.replace("['사회탐구',subjects.slice(12)]","['사회탐구',subjects.slice(12,21)],['직업탐구',subjects.slice(21,32)],['제2외국어/한문',subjects.slice(32)]")
    source=source.replace("e.key==='End'?3:(groupIndex+(e.key==='ArrowRight'?1:3))%4","e.key==='End'?groups.length-1:(groupIndex+(e.key==='ArrowRight'?1:groups.length-1))%groups.length")
    source=re.sub(r'<script type="application/json" data-cbt-curriculum>.*?</script>',lambda m:'<script type="application/json" data-cbt-curriculum>'+json.dumps({'subject':slug,'title':label,'version':'2026-10-23.voclang.v1','majors':[{'id':'전체 문항','title':'전체 기출 문항','path':[label,'전체 기출 문항'],'children':[]}]},ensure_ascii=False)+'</script>',source,count=1,flags=re.S)
    source=re.sub(r'<script src="/account-assets/store.js[^\"]*"></script>','<script src="/cbt-data/'+PREFIX+'ui/account-store.js"></script>',source,count=1)
    config={'subject':slug,'label':label,'years':bank['years'],'forms':[{k:v for k,v in form.items() if k not in ['question_keys']} for form in bank['forms']]}
    code='<script>window.EXTRA_UI_CONFIG='+json.dumps(config,ensure_ascii=False,separators=(',',':'))+';\n'+extra_js+'</script>'
    source=source.replace('</body>',code+'\n</body>')
    assert re.findall(r'<style.*?</style>',template,re.S)==re.findall(r'<style.*?</style>',source,re.S),slug
    assert "['직업탐구',subjects.slice(21,32)]" in source and 'groups.length' in source
    assert 'flat.length>20' not in source and 'keys.length>20' not in source
    (OUT/(slug+'.html')).write_text(source)
    report.append({'subject':slug,'years':bank['years'],'forms':len(bank['forms']),'style_blocks_preserved':True})
(ROOT/'release/ui-build-verification.json').write_text(json.dumps({'production_deployed':False,'subjects':report},ensure_ascii=False,indent=2))
print('UI prepared',len(report),'subjects')
