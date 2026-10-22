from pathlib import Path
import json,re,html,hashlib,shutil,unicodedata,datetime,sys
import pymupdf as fitz
from PIL import Image
R=Path('archive-expansion');B=R/'release';P=B/'pages';P.mkdir(parents=True,exist_ok=True);rows=json.loads((R/'subjects.json').read_text());inventory=json.loads((R/'inventory.json').read_text());verification=json.loads((B/'source-verification.json').read_text()) if (B/'source-verification.json').exists() else [];assets=json.loads((B/'asset-manifest.json').read_text()) if (B/'asset-manifest.json').exists() else [];byselector={}
BASE='https://pub-847376fcebac40e496cc5726d0ff6245.r2.dev/'
def norm(s):return re.sub(r'[^a-z0-9가-힣]','',unicodedata.normalize('NFKC',s).lower())
for s in rows:
 s['source_exam_date']=re.search(r'/01exam/(\d{8})/',s['files']['problem']['url']).group(1)
 byselector.setdefault(s['selector'],[]).append(s)
batch_start,batch_end=map(int,sys.argv[1:3]);assert 0<=batch_start<batch_end<=len(rows) and batch_end-batch_start<=100
for s in rows[batch_start:batch_end]:
 dest=B/s['asset_prefix'];dest.mkdir(parents=True,exist_ok=True)
 source_date=re.search(r'/01exam/(\d{8})/',s['files']['problem']['url']).group(1);s['source_exam_date']=source_date
 # Keep the native published problem and explanation PDFs byte for byte.
 qdoc=fitz.open(s['files']['problem']['file']);hdoc=fitz.open(s['files']['solution']['file']);assert len(qdoc)>0 and len(hdoc)>0
 qtext='\n'.join(p.get_text() for p in qdoc);htext='\n'.join(p.get_text() for p in hdoc)
 subject_present=norm(s['subject_name']).rstrip('i') in norm(qtext)
 year_present=str(s['academic_year']) in qtext or str(s['calendar_year']) in qtext
 for kind in ['problem','solution']:
  source=Path(s['files'][kind]['file']);target=dest/(kind+'.pdf');shutil.copyfile(source,target);assert target.read_bytes()==source.read_bytes()
 # EBS supplies the answer panel separately. Embed the original image without
 # retyping any number or answer, preserving all language scripts and glyphs.
 doc=fitz.open();page=doc.new_page(width=595.276,height=841.89);title=s['site_title'].replace('과목 선택',s['subject_name']+' 정답');page.insert_text((40,42),title,fontname='korea',fontsize=10)
 im=Image.open(s['files']['answer']['file']);w,h=im.size;factor=min(515.276/w,700/h);rect=fitz.Rect(40,68,40+w*factor,68+h*factor);page.insert_image(rect,filename=s['files']['answer']['file'])
 page.insert_text((40,808),'출처: EBSi 공식 정답 · 시행 자료 '+source_date,fontname='korea',fontsize=7)
 target=dest/'answer.pdf';doc.save(target,garbage=4,deflate=True);doc.close()
 check=fitz.open(target);assert len(check)==1;assert check[0].get_images(full=True);check.close()
 old=(R/'source-cache/templates'/s['template']).read_text();new_title=s['site_title'].replace('과목 선택',s['subject_name']+' — 다운로드')
 pagehtml=re.sub(r'<title>.*?</title>','<title>'+html.escape(new_title)+'</title>',old,flags=re.S)
 pagehtml,n=re.subn(r'(<div class="title">).*?(</div>)',lambda m:m[1]+html.escape(new_title)+m[2],pagehtml,count=1,flags=re.S);assert n==1
 replacement={'문제':'problem','정답':'answer','해설':'solution'};done=[]
 def anchors(m):
  a=m[0];label=re.sub('<[^>]*>','',a).strip()
  if label in replacement:
   done.append(label);a=re.sub(r'href="[^"]+"','href="'+BASE+s['asset_prefix']+'/'+replacement[label]+'.pdf"',a,count=1)
  elif 'back-btn' in a:a=re.sub(r'href="[^"]+"','href="'+s['selector']+'"',a,count=1)
  return a
 pagehtml=re.sub(r'<a\b[^>]*>.*?</a>',anchors,pagehtml,flags=re.S);assert sorted(done)==sorted(replacement),(s['page'],done)
 (P/s['page']).write_text(pagehtml)
 for kind in ['problem','answer','solution']:
  p=dest/(kind+'.pdf');assets.append({'key':str(p.relative_to(B)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size})
 verification.append({'page':s['page'],'subject':s['subject_name'],'question_pages':len(qdoc),'solution_pages':len(hdoc),'source_date':source_date,'source_record':s['record'],'subject_text_found':subject_present,'year_text_found':year_present,'question_text_characters':len(qtext),'answer_image_width':w,'answer_image_height':h})
 qdoc.close();hdoc.close()
for selector,children in byselector.items():
 original=(R/'source-cache/templates'/selector).read_text();extra=''
 for cat,label in [('vocational','직업탐구'),('language','제2외국어/한문')]:
  group=[s for s in children if s['category']==cat];assert group
  links=''.join('<a href="'+s['page']+'">'+html.escape(s['subject_name'])+'</a>' for s in group)
  extra+='<div class="subject-item"><div class="subject-box" role="button" aria-expanded="false" tabindex="0">'+label+' <span class="caret">▾</span></div><div class="dropdown">'+links+'</div></div>\n'
 # Insert inside the existing grid immediately before its closing tag. Keep all
 # existing markup, CSS, scripts, and links unchanged.
 start=original.index('<div class="subject-grid">');depth=0;end=None
 for m in re.finditer(r'<div\b[^>]*>|</div\s*>',original[start:],re.I):
  if m[0].startswith('</'):depth-=1
  else:depth+=1
  if depth==0:end=start+m.start();break
 assert end is not None
 result=original[:end]+extra+original[end:];assert result.replace(extra,'',1)==original
 (P/selector).write_text(result)
assets=list({v['key']:v for v in assets}.values());verification=list({v['page']:v for v in verification}.values())
(B/'subjects.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2));(B/'source-verification.json').write_text(json.dumps(verification,ensure_ascii=False,indent=2));(B/'asset-manifest.json').write_text(json.dumps(assets,indent=2))
print('PDF BATCH COMPLETE',batch_start,batch_end,'RELEASE',len(rows),'subjects',len(byselector),'selectors',len(assets),'PDFs',len(list(P.glob('*.html'))),'HTML pages',flush=True)
print('Identity review flags',[(r['page'],r['subject_text_found'],r['year_text_found']) for r in verification if not r['subject_text_found'] or not r['year_text_found']],flush=True)
