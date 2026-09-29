"""Math uses the existing Korean CBT layout, ink engine, and result-report DOM/CSS.
Fail closed when anchor functions change; regenerate from the current Korean page.
"""
from pathlib import Path
from bs4 import BeautifulSoup
import re,subprocess,json
ROOT=Path(__file__).resolve().parents[4]
MATH=ROOT/'workers/cbt/math'
SRC=ROOT/'workers/cbt/app/cbt.html'
def replacefun(text,name,new):
    matches=list(re.finditer(r'(?m)^(?:async )?function '+name+r'\(',text))
    if not matches:raise ValueError('missing function '+name)
    for m in reversed(matches):
        # All existing top-level declaration functions terminate at a newline closing brace.
        line_end=text.find('\n',m.end())
        if line_end!=-1 and text[m.start():line_end].rstrip().endswith('}'):
            text=text[:m.start()]+new+text[line_end:];continue
        end=re.search(r'(?m)^}',text[m.end():])
        if not end:raise ValueError('function boundary '+name)
        b=m.end()+end.end();text=text[:m.start()]+new+text[b:]
    return text
soup=BeautifulSoup(SRC.read_text(),'html.parser');scripts=soup.find_all('script');base=scripts[2].get_text();ui=scripts[5].get_text()
base=re.sub(r'(?m)^var CBT_RENDER_DATA=.*$', 'var CBT_RENDER_DATA={version:"math-v1",units:{}};',base)
base=base.replace('var YEARS=[2017,','var YEARS=[2014,2015,2016,2017,')
base=base.replace('/api/cbt/','/api/cbt/math/').replace('mysuneung-cbt-current','mysuneung-math-cbt-current').replace('mysuneung-cbt-history','mysuneung-math-cbt-history')
base=base.replace('var body={mode:mode,years:Array.from(selectedYears)};','var body={mode:mode,years:Array.from(selectedYears),source_family:window.mathSourceScope()};')
base=base.replace('<=45','<=30').replace('>45','>30').replace('||4800','||6000')
base=base.replace('국어 CBT','수학 CBT').replace('지문 보기','풀이 노트 보기').replace('지문 접기','풀이 노트 접기').replace('국어 혼합 CBT','수학 혼합 CBT').replace('2017~2021학년도는 이전 30문항 체제 기출입니다. 이전 학년도만 고르면 실제 한 회차 30문항 구성으로 출제됩니다.','2014–2016 A/B형 · 2017–2021 가/나형 · 2022–2027 공통·선택. 서로 다른 체제를 섞지 않습니다.').replace('0 / 45 응답','0 / 30 응답').replace('80:00','100:00').replace('지문 보기','풀이 노트 보기').replace('지문 접기','풀이 노트 접기')
anchor='window.MSNAccount.ready.then('
pos=base.rfind(anchor)
if pos<0:raise ValueError('missing init promise')
base=base[:pos]+(MATH/'math-adapter.js').read_text()+'\n'+base[pos:]
scripts[2].string=base
# Bundle shared pure logic, changing only the subject's study procedures.
entry=MATH/'browser-core.mjs';entry.write_text("import * as L from '../src/learning-core.mjs';\nimport * as S from '../src/study-core.mjs';\nimport {mathStudyMethod} from './math-methods.mjs';\nwindow.CBTLearning=L;window.CBTStudy={...S,studyMethod:mathStudyMethod};window.CBTEBS={questions:{},coverage:[]};\n")
out=MATH/'browser-core.bundle.js'
subprocess.run(['node','-e',"require('./workers/accounts/node_modules/esbuild').buildSync({entryPoints:['workers/cbt/math/browser-core.mjs'],bundle:true,minify:true,format:'iife',target:'es2022',outfile:'workers/cbt/math/browser-core.bundle.js',legalComments:'none'})"],cwd=ROOT,check=True)
scripts[3].string=out.read_text();scripts[4].decompose()
ui=ui.replace('/api/cbt/','/api/cbt/math/').replace('mysuneung-cbt-learning-history-v2','mysuneung-math-cbt-learning-history-v2').replace('mysuneung-cbt-history','mysuneung-math-cbt-history').replace('.slice(0,45)','.slice(0,30)')
ui=ui.replace("schema_version:2,id,at:before", "schema_version:2,subject:'수학',raw_score:data.raw_score,max_score:data.max_score,id,at:before")
ui=ui.replace("mode:window.exam.mode,choice:window.exam.choice,years:window.exam.years", "mode:window.exam.mode,choice:window.exam.choice,source_family:window.exam.source_family||'all',years:window.exam.years")
ui=ui.replace("if(body.mode==='full')body.choice=$('input[name=\"choice\"]:checked').value;\n  else{", "body.choice=window.mathChoice();\n  if(body.mode==='custom'){")
ui=ui.replace("mode:'custom',years:[2017,", "mode:'custom',choice:window.mathChoice(),years:[2014,2015,2016,2017,")
ui=ui.replace("const body={mode:window.mode,years:Array.from(window.selectedYears||[]),strategy:", "const body={mode:window.mode,years:Array.from(window.selectedYears||[]),source_family:window.mathSourceScope(),strategy:")
ui=ui.replace("const body={mode:full?'full':'custom',years:years.length?years:[2022,2023,2024,2025,2026,2027],strategy:", "const body={mode:full?'full':'custom',years:years.length?years:[2022,2023,2024,2025,2026,2027],source_family:window.exam?.source_family||window.mathSourceScope(),strategy:")
ui=ui.replace("'국어 · '","'수학 · '")
ui=ui.replace("const reviewNames={", "const reviewNames={source_objective_mapped:'공식 출제의도 기반 분류',pending:'분류 검토 중',")
ui=replacefun(ui,'sourceName',"function sourceName(d){return (meta?.questions?.[d.question_key]?.source_label||d.academic_year+'학년도 '+d.month+'월')+' · 원문 '+d.original_no+'번';}")
ui=replacefun(ui,'initTypeOptions',"""function initTypeOptions(){
 const e=$('#learnTarget');if(!e||!meta)return;
 const selected=e.value,groups=new Map();
 for(const q of Object.values(meta.questions)){if(!q.analysis_eligible||!window.mathQuestionMatchesSelection(q))continue;if(!groups.has(q.type_group))groups.set(q.type_group,new Map());const g=groups.get(q.type_group),v=g.get(q.type_id)||{label:q.type,n:0,curriculum:q.curriculum};v.n++;g.set(q.type_id,v);}
 let html='<option value="">특정 유형 제한 없음</option>';
 for(const [group,types] of groups){html+='<optgroup label="'+esc(group)+'">';for(const [id,t] of types)html+='<option value="'+esc(id)+'">'+esc(t.label)+(t.curriculum==='gana-2021'?' · 2021 체제':'')+' ('+t.n+'문항)</option>';html+='</optgroup>';}
 e.innerHTML=html;e.value=selected;
 const p=S.studyEvidence(r5History(),meta.questions);
 $('#learnRecordHint').textContent=p.unique_questions?'최근 '+p.attempts+'회 · 서로 다른 '+p.unique_questions+'문항 · 보완 기준 충족 '+p.types.filter(r=>r.reinforce).length+'유형':'수학 기록이 쌓이면 최근 오답 유형을 반영합니다.';
 $('#learnTaxonomy').textContent='수학 '+meta.summary.total+'문항 중 '+(meta.summary.total-meta.summary.pending)+'문항은 EBS 출제의도로 분류했습니다. 검토 중 '+meta.summary.pending+'문항은 점수에 포함하되 유형 진단에서는 제외합니다.';
}
""")
ui=ui.replace('setup();','setup();window.addEventListener(\'math-selection-change\',initTypeOptions);',1)
ui=ui.replace('!!(example&&EBS?.questions?.[example.question_key])','!!(example&&meta?.questions?.[example.question_key]?.solution_url)').replace('!!EBS?.questions?.[d?.question_key]','!!meta?.questions?.[d?.question_key]?.solution_url')
ui=replacefun(ui,'r5Ebs',"""function r5Ebs(d,quiet){
 const m=meta?.questions?.[d.question_key];if(!m?.solution_url)return '';
 const url=r5SafeEbs(m.solution_url);if(!url)return '';
 return '<div class="r5-ebs"><span class="r5-tag">EBS 공식 해설</span><h3>막힌 단계만 다시 확인하기</h3><p>이 문항이 수록된 해설 '+Number(m.solution_page||1)+'쪽에서 풀이를 확인하세요.</p><p style="margin-top:12px"><a href="'+esc(url)+'#page='+Number(m.solution_page||1)+'" target="_blank" rel="noopener noreferrer">공식 해설 열기 ↗</a></p></div>';
}
""")
ui=ui.replace('EBS 연계 확인','EBS 해설 확인').replace('EBS 연계 복습','EBS 해설 복습').replace('확인된 연계 자료만 바로 연결합니다.','같은 문항의 공식 해설을 연결합니다.').replace('확인된 공식 연계 자료만 봅니다.','풀이와 적용 조건을 대조합니다.')
ui=ui.replace('선택한 유형이 포함된 지문 세트를 출제합니다. 같은 지문의 다른 유형도 함께 포함되며 선택한 학년도·범주 안에서만 찾습니다.','선택한 학년도·과목·범주의 문항만 출제합니다. 공통 자료가 있는 문항은 자료를 함께 표시합니다.')
ui=ui.replace('취약 유형 3세트 연습','취약 유형 연습').replace('취약 유형 반영 45문항','취약 유형 보완').replace('새 지문','새 문항').replace('다른 지문','다른 문항')
# Use actual weighted raw score for a graded math exam; history retains accuracy as a different metric.
score=""" const mathMax=data?Number(data.max_score??R5.ds.reduce((n,d)=>n+(d.points||0),0)):0;
 const mathScore=data?Number(data.raw_score??R5.ds.reduce((n,d)=>n+(d.is_correct?d.points||0:0),0)):null;
"""
needle=" const blankPill=blank?"
assert needle in ui;ui=ui.replace(needle,score+needle,1)
ui=ui.replace('<span class="r8-kicker">정답률</span>','<span class="r8-kicker">\'+(data?\'점수\':\'정답률\')+\'</span>',1)
ui=ui.replace("'+(percent===null?'—':percent)+'<small>%</small>","'+(data?mathScore:percent===null?'—':percent)+'<small>'+ (data?'점':'%') +'</small>",1)
ui=ui.replace("'+right+' / '+total+'문항</span>","'+(data?mathMax+'점 만점 · ':'')+right+' / '+total+'문항</span>",1)
ui=ui.replace('EBS 연계는 공식 분석표의 해당 문항과 교재 위치를 확인한 항목만 표시합니다. 현재 확인 범위: 2026학년도 6월·9월·수능, 2027학년도 6월·9월의 129문항.','EBS 공개 기출의 공식 해설을 연결합니다. 교재 연계표 확인과는 다릅니다.')
ui=ui.replace('배점을 적용한 원점수·등급·백분위로 환산하지 않습니다.','수학 점수는 원문 배점을 합산합니다. 등급·백분위로 환산하지 않습니다.')
ui=ui.replace('<option value="hw">화법과 작문</option><option value="lm">언어와 매체</option>','<option value="prob">확률과 통계</option><option value="calc">미적분</option><option value="geom">기하</option><option value="A">A형</option><option value="B">B형</option><option value="ga">가형</option><option value="na">나형</option>')
ui=ui.replace('지문에 딸린 문항도 함께 풉니다.','공통 자료가 있는 문항은 자료를 함께 표시합니다.').replace('같은 지문','같은 자료')
ui=ui.replace("if(b.dataset.r5Transfer){practice(b.dataset.r5Transfer,false,b.dataset.r5Origin);return;}","if(b.dataset.r5Transfer){practice(b.dataset.r5Transfer,false,b.dataset.r5Origin,b.dataset.r5Source||'all');return;}")
ui=ui.replace('async function practice(id,full,origin){','async function practice(id,full,origin,sourceFamily){')
ui=ui.replace("practice_mode:'transfer',source_question_keys:[example]","source_family:sourceFamily||'all',practice_mode:'transfer',source_question_keys:[example]")
old_transfer='''<button type="button" class="r5-primary" data-r5-transfer="'+esc(d.type_id)+'" data-r5-origin="'+esc(d.question_key)+'">새 기출로 보완하기 →</button>'''
new_transfer='''<button type="button" class="r5-primary" data-r5-transfer="'+esc(d.type_id)+'" data-r5-origin="'+esc(d.question_key)+'" data-r5-source="education_office">교육청 기출로 양치기 →</button><button type="button" class="r5-quiet" data-r5-transfer="'+esc(d.type_id)+'" data-r5-origin="'+esc(d.question_key)+'" data-r5-source="all">전체 기출에서 보완 →</button>'''
ui=ui.replace(old_transfer,new_transfer)

scripts[5].string=ui
# Subject label/settings changes only. Preserve existing structural classes and all ink markup.
soup.title.string='수학 CBT · 수능기출'
soup.select_one('#start h1').string='수학 혼합 모의고사'
soup.select_one('#start .desc').string='2014~2027학년도 수학 기출을 풀어보세요. 평가원·수능과 수록된 교육청 전국연합을 출처별로 골라 연습할 수 있습니다.'
for old in soup.select('.cbt-subject-nav'):old.decompose()
nav=BeautifulSoup('<div class="math-subject-nav"><a class="ghost" href="/mixed-cbt">국어</a><span class="ghost math-active" aria-current="page">수학</span></div>','html.parser').div
soup.select_one('#start .brand').insert_after(nav)
for id,content in [('currentComposition','<b>공통 22</b><span class="arrow">→</span><b>선택 8</b><span class="arrow">·</span><b>100점</b>'),('legacyComposition','<b>같은 회차 30문항</b><span class="arrow">·</span><b>100점</b>')]:
 e=soup.select_one('#'+id);e.clear();e.append(BeautifulSoup(content,'html.parser'))
choice=soup.select_one('#choiceSetting');choice.extract();soup.select_one('#fullSettings').insert_before(choice);choice.select_one('.seg').clear()
for v,label in [('prob','확률과 통계'),('calc','미적분'),('geom','기하'),('A','수학 A형'),('B','수학 B형'),('ga','수학 가형'),('na','수학 나형')]:
 choice.select_one('.seg').append(BeautifulSoup('<div><input type="radio" name="choice" id="math-'+v+'" value="'+v+'"'+(' checked' if v=='prob' else '')+'><label for="math-'+v+'">'+label+'</label></div>','html.parser'))
source=BeautifulSoup('<div class="setting" id="sourceSetting"><div class="title">출처</div><div class="seg math-source-seg"><div><input type="radio" name="sourceFamily" id="math-source-all" value="all" checked><label for="math-source-all">전체</label></div><div><input type="radio" name="sourceFamily" id="math-source-kice" value="kice"><label for="math-source-kice">평가원·수능</label></div><div><input type="radio" name="sourceFamily" id="math-source-edu" value="education_office"><label for="math-source-edu">교육청</label></div></div><div class="mode-note" id="sourceHint">평가원·수능과 수록된 교육청 기출을 함께 사용합니다.</div></div>','html.parser').div
choice.insert_after(source)
yearbox=soup.select_one('#years');yearbox.insert_before(BeautifulSoup('<div class="count-seg math-eras"><button class="on" type="button" data-math-era="current">2022–2027</button><button type="button" data-math-era="gana">2017–2021</button><button type="button" data-math-era="ab">2014–2016</button></div>','html.parser'))
custom=soup.select_one('#setCounts');custom.find_previous_sibling(class_='title').string='문항 수';custom.clear()
for n in [1,3,5,10,20,30]:custom.append(BeautifulSoup('<button type="button" data-count="'+str(n)+'"'+(' class="on"' if n==3 else '')+'>'+str(n)+'문항</button>','html.parser'))
custom.find_next_sibling(class_='mode-note').string='선택 범주의 기출에서 뽑습니다. 공통문항은 선택과목이 달라도 중복 집계하지 않습니다.'
cover=BeautifulSoup('<details class="learn-policy math-coverage"><summary>수록 범위·출처</summary><p>평가원·수능: 2014–2026학년도 6·9월 및 수능. 교육청: 2023학년도 3·4·7·10월, 2024학년도 3·4·7·10월(4월 학평은 EBS 검색 회차 5월), 2025·2026학년도 3·5·7·10월, 2027학년도 3·5·7월. 2027학년도 평가원 6·9월도 포함하며 아직 시행되지 않은 2027 수능은 제외합니다.</p><p>총 60회차 · 156종 시험지 · 공통문항 중복 제외 3,096문항. 2023~2026학년도 교육청 고유 736문항은 각 문항의 EBS 공식 해설 [출제의도]를 문항별로 확인해 유형을 판정했습니다. 수식·도형은 EBS 공개 문제 PDF 원문을 표시합니다.</p></details>','html.parser')
soup.select_one('#generate').insert_before(cover)
css=soup.new_tag('style');css['data-math-ui']='v1';css.string='''
.math-subject-nav{display:flex;justify-content:center;gap:8px;margin:14px 0 22px}.math-source-seg{display:flex;flex-wrap:wrap}.math-source-seg>div{flex:1 1 30%}.math-source-seg>div.disabled{opacity:.38}.math-source-seg input:disabled+label{cursor:not-allowed}.math-subject-nav a{text-decoration:none;color:inherit}.math-active{background:#303747!important;color:#fff!important}.math-eras{margin:0 0 14px}.math-coverage{margin:18px 0}.math-notebook{min-height:650px;position:relative;background-image:linear-gradient(#edf0f4 1px,transparent 1px),linear-gradient(90deg,#edf0f4 1px,transparent 1px);background-size:24px 24px}.math-note-label{display:block;padding:12px;background:#fff;color:#98a2b3;font-size:12px}.math-short-answer{margin-top:14px;width:100%}.math-short-answer label{font-size:14px;font-weight:700}.math-answer-row{display:flex;gap:12px;margin-top:10px;align-items:center}.math-answer-row input{width:170px;max-width:65%;border:1px solid #c9d2df;border-radius:12px;font-family:inherit;font-weight:700;font-size:24px;line-height:1.4;padding:12px;text-align:center;background:#fff;color:#202b3c}.math-answer-row input:focus{outline:2px solid #91bafb;outline-offset:2px}.math-short-answer p{font-size:12px;color:#8994a4;margin-top:8px}.math-short-answer #math-answer-error{color:#ba344c}.math-answer-row input[aria-invalid=true]{border-color:#ba344c}.math-short-answer input[readonly]{background:#f4f6f9}.math-coverage p{font-size:12px;line-height:1.8}#choiceSetting .seg{display:flex;flex-wrap:wrap}#choiceSetting .seg>div:not(.hidden){flex:1 1 28%}@media(max-width:640px){.math-eras{flex-wrap:wrap}.math-notebook{min-height:450px}.math-short-answer input{font-size:20px}#setCounts{flex-wrap:wrap}}
''';soup.head.append(css)
# Static Korean explanation strings outside scripts do not apply to math.
for node in list(soup.find_all(string=True)):
 if node.parent.name not in ['script','style']:
  text=str(node).replace('45문항','30문항').replace('80분','100분').replace('국어 CBT','수학 CBT').replace('국어 혼합 CBT','수학 혼합 CBT').replace('2017~2021학년도는 이전 30문항 체제 기출입니다. 이전 학년도만 고르면 실제 한 회차 30문항 구성으로 출제됩니다.','2014–2016 A/B형 · 2017–2021 가/나형 · 2022–2027 공통·선택. 서로 다른 체제를 섞지 않습니다.').replace('0 / 45 응답','0 / 30 응답').replace('80:00','100:00').replace('지문 보기','풀이 노트 보기').replace('지문 접기','풀이 노트 접기')
  if '지문 / 자료' in text:text=text.replace('지문 / 자료','풀이 노트')
  if text!=str(node):node.replace_with(text)
for sc in soup.find_all('script',src=True):
 if any(x in sc['src'] for x in ['/store.js','/cbt-account.js']):sc['src']=sc['src'].split('?')[0]+'?v=math-20260929-v1'

workspace_css=soup.new_tag('style');workspace_css['data-math-workspace']='v2';workspace_css.string=r"""
#passagePane,#passageResizer,#mobileToggle{display:none!important}
@media(min-width:961px){
 .layout,.layout.passage-collapsed{grid-template-columns:minmax(0,1fr) 190px!important;max-width:1680px}
 #questionPane{grid-column:1!important;padding:30px 44px 36px!important;overflow:auto}
 .palette{grid-column:2!important}
 #questionBody,#questionPane .nav,#questionPane .source-credit{max-width:1080px;margin-left:0;margin-right:auto}
 #qassets .source-frame{max-width:960px!important;margin:20px 0!important}
 #qassets .source-frame .managed-source{margin-left:0!important;margin-right:auto!important}
}
@media(min-width:1200px){#questionPane{padding-left:58px!important}#qassets .source-frame{max-width:1000px!important}}
#paintRibbon.math-global-ribbon{z-index:72}
#paintRibbon .math-note-ribbon-button{grid-column:5;grid-row:1;margin-right:42px}
#paintRibbon #showOriginal.hidden{display:none!important}
.math-note-button{font-size:17px!important;font-weight:800}
.math-note-popup{position:fixed;z-index:86;left:40px;top:84px;width:520px;height:470px;min-width:300px;min-height:260px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);display:grid;grid-template-rows:auto minmax(0,1fr) auto;background:#fff;border:1px solid #cfd8e6;border-radius:14px;box-shadow:0 18px 55px rgba(24,39,67,.24);overflow:hidden;resize:both}
.math-note-popup.hidden{display:none!important}
.math-note-header{height:auto;min-height:48px;display:flex;align-items:center;gap:10px;padding:8px 9px 8px 14px;background:#f8fafc;border-bottom:1px solid #dfe6ef;cursor:move;touch-action:none;user-select:none}
.math-note-header strong{font-size:14px;white-space:nowrap}.math-note-tools,.math-note-actions{display:flex;align-items:center;gap:3px}.math-note-tools{flex:1}.math-note-tools button,.math-note-actions button{border:0;background:#fff;border-radius:7px;min-width:31px;height:31px;padding:0 7px;color:#42526a;font-weight:800;box-shadow:inset 0 0 0 1px #e1e7ef}.math-note-tools button:hover,.math-note-actions button:hover,.math-note-tools button.on{background:#eaf2ff;color:#245fc6}.math-note-color{width:31px;height:31px;border-radius:7px;background:#fff;box-shadow:inset 0 0 0 1px #e1e7ef;display:grid;place-items:center;overflow:hidden}.math-note-color input{width:34px;height:34px;border:0;padding:0;background:transparent;cursor:pointer}
.math-note-canvas-wrap{position:relative;min-height:0;overflow:hidden;background-color:#fff;background-image:linear-gradient(#e8edf4 1px,transparent 1px),linear-gradient(90deg,#e8edf4 1px,transparent 1px);background-size:24px 24px}
#mathNoteCanvas{display:block;width:100%;height:100%;touch-action:none}.math-note-canvas-wrap #mathNoteCanvas.active{cursor:crosshair}
.math-note-resize-hint{font-size:10px;color:#98a2b3;padding:5px 9px;text-align:right;background:#fafbfc;border-top:1px solid #edf0f4}
@media(max-width:960px){
 .layout,.layout.passage-collapsed{display:block!important}.question{padding:14px 14px calc(var(--cbt-palette-height,64px) + 28px)!important}
 #qassets .source-frame{max-width:100%!important;margin:16px 0!important}
 #paintRibbon.math-global-ribbon{max-width:calc(100vw - 12px)!important}
 .math-note-popup{width:min(92vw,440px);height:min(62vh,470px);min-width:280px}

}
"""
soup.head.append(workspace_css)

app=ROOT/'workers/cbt/app/math.html';app.write_text(str(soup))
# Catch syntax errors for every generated inline script.
for i,sc in enumerate(soup.find_all('script')):
 if not sc.get('src'):
  temp=MATH/('check-'+str(i)+'.js');temp.write_text(sc.get_text());subprocess.run(['node','--check',str(temp)],check=True);temp.unlink()
print('MATH_APP_BUILT',app.stat().st_size)
