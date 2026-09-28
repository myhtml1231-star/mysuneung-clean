from pathlib import Path
import json,re,subprocess
W=Path(__file__).parent;s=(W/'backup/cbt.html').read_text()
manifest=json.load(open(W/'source-manifest.json'));assert len(manifest['units'])==553
# Replace only the embedded rendering manifest and renderer functions; leave grading/exam generation unchanged.
a=s.index('var CBT_RENDER_DATA=');b=s.index('// Source-aware rendering:',a)
s=s[:a]+'var CBT_RENDER_DATA='+json.dumps(manifest,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')+';\n'+s[b:]
a=s.index('// Source-aware rendering:');b=s.index('function isHeaderAsset',a)
helpers=(W/'renderer_helpers.js').read_text()
helpers=helpers.replace("host.innerHTML=sourceFramesHtml([{src:urls[at+1]}],'시험지 원문','');", "host.innerHTML=fallbackOriginalHtml(urls[at+1]);")
helpers=helpers.replace("if(host&&host.querySelectorAll('.source-frame').length>1)", "if(host)")
helpers=helpers.replace('if(innerWidth>960){var b=splitterBounds(),px=', 'if(innerWidth>960&&l.getBoundingClientRect().width>0){var b=splitterBounds(),px=')
helpers=helpers.replace('hasUnsafeDisplayText(set.passage)','contentUnsafe(set.passage)')
s=s[:a]+helpers+'\n'+(W/'content_helpers.js').read_text()+'\n'+s[b:]
a=s.index('function render(){');b=s.index('function buildPalette()',a)
s=s[:a]+(W/'render_functions.js').read_text()+'\n'+s[b:]
a=s.index('function setDrawTool(tool){');b=s.index('function encodePathClient',a)
s=s[:a]+(W/'ink.js').read_text()+'\n'+s[b:]
s=s.replace('function loadExam(e,isNew){','function loadExam(e,isNew){\n  finishActiveInk();redoData={};')
# Question toolbar stays outside the ink overlay; navigation also stays clickable.
tools=[]
for tool in ['hand','pen','highlight','eraser']:
 m=re.search(r'<button[^>]*class="paint-tool[^>]*data-tool="'+tool+r'"[\s\S]*?</button>',s);assert m,tool;tools.append(m.group(0))
head='<div class="question-head"><div id="qno" class="qno"></div><div id="questionInkTools" class="question-ink-tools" role="toolbar" aria-label="문제 필기 도구">'+''.join(tools)+'<button type="button" id="questionUndo" class="ink-action" title="문제 필기 실행 취소" aria-label="문제 필기 실행 취소">↶</button><button type="button" id="questionRedo" class="ink-action" title="문제 필기 다시 실행" aria-label="문제 필기 다시 실행">↷</button><button type="button" id="questionClear" class="ink-action" title="문제 필기 지우기" aria-label="문제 필기 모두 지우기">×</button></div></div>'
old='<div id="qno" class="qno"></div><div id="stem" class="stem"></div><div id="view"></div><div id="qassets"></div><div id="choices" class="choices"></div>'
new=head+'<div id="questionStage" class="question-stage"><div id="questionBody" class="question-body"><div id="stem" class="stem"></div><div id="view"></div><div id="qassets"></div><div id="choiceMatrixHead" class="choice-matrix-head hidden"></div><div id="choices" class="choices"></div></div><canvas id="questionCanvas" class="draw-canvas question-canvas" aria-label="문제 필기 영역"></canvas></div>'
assert s.count(old)==1;s=s.replace(old,new,1)
old='<button id="next" class="next">다음 →</button></div></section>'
assert old in s;s=s.replace(old,'<button id="next" class="next">다음 →</button></div><p class="source-credit">시험지 원문 · 저작권은 원문 제공기관에 있습니다.</p></section>',1)
s=s.replace('</style>','\n'+(W/'content_ui.css').read_text()+'\n</style>',1)
s=s.replace('window.addEventListener("resize",applyPassageState);','window.addEventListener("resize",applyPassageState);\ndocument.addEventListener("keydown",function(e){if(e.key==="Escape"&&!e.target.closest("input,textarea,select"))setDrawTool("hand")});')
p=W/'cbt-patched.html';p.write_text(s)
for i,x in enumerate(re.findall(r'<script(?:\s[^>]*)?>(.*?)</script>',s,re.S)):
 fp=W/f'check-inline-{i}.js';fp.write_text(x);subprocess.run(['node','--check',str(fp)],check=True)
print('CANDIDATE_READY',p.stat().st_size)
