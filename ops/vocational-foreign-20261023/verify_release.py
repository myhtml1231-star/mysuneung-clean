from pathlib import Path
import json,re,hashlib,unicodedata,collections,io
import pymupdf as fitz
from PIL import Image,ImageChops
R=Path('archive-expansion');B=R/'release';rows=json.loads((B/'subjects.json').read_text());checks=[];proofs=[]
def norm(s):return re.sub(r'[^가-힣]','',unicodedata.normalize('NFKC',s))
for i,s in enumerate(rows):
 folder=B/s['asset_prefix'];qdoc=fitz.open(folder/'problem.pdf');t='\n'.join(p.get_text() for p in qdoc);native_years=set(re.findall(r'(20\d{2})\s*학년도',t));expected=str(s['academic_year'])
 if native_years:assert expected in native_years,(s['page'],native_years,expected)
 for kind in ['problem','solution']:
  b=(folder/(kind+'.pdf')).read_bytes();original=Path(s['files'][kind]['file']).read_bytes();assert b==original
 # Check that the answer panel embedded in the PDF is pixel-identical to EBS.
 adoc=fitz.open(folder/'answer.pdf');assert len(adoc)==1;images=adoc[0].get_images(full=True);assert len(images)==1
 encoded=adoc.extract_image(images[0][0])['image'];a=Image.open(io.BytesIO(encoded)).convert('RGB');b=Image.open(s['files']['answer']['file']).convert('RGB');assert a.size==b.size and ImageChops.difference(a,b).getbbox() is None,s['page']
 checks.append({'page':s['page'],'native_year_headers':sorted(native_years),'published_catalog_subject':s['subject_name'],'source_question_date':s['source_exam_date'],'native_source_pdfs_unchanged':True,'answer_panel_pixels_identical':True})
 if i in [0,12,26,40,190,300,394]:
  name=s['page'].removesuffix('.html');adoc[0].get_pixmap(matrix=fitz.Matrix(1.4,1.4)).save(B/(name+'-answer-proof.png'));qdoc[0].get_pixmap(matrix=fitz.Matrix(1.05,1.05)).save(B/(name+'-problem-proof.png'));proofs.append(name)
 adoc.close();qdoc.close()
selectors=collections.defaultdict(list)
for s in rows:selectors[s['selector']].append(s)
for name,children in selectors.items():
 before=(R/'source-cache/templates'/name).read_text();after=(B/'pages'/name).read_text();assert re.findall(r'<style>.*?</style>',before,re.S)==re.findall(r'<style>.*?</style>',after,re.S)
 old_links=re.findall(r'href="([^"]+)"',before);new_links=re.findall(r'href="([^"]+)"',after)
 for old in old_links:assert new_links.count(old)>=old_links.count(old),(name,old)
 for s in children:assert s['page'] in new_links,(name,s['page'])
for s in rows:
 page=(B/'pages'/s['page']).read_text();template=(R/'source-cache/templates'/s['template']).read_text();assert re.findall(r'<style>.*?</style>',page,re.S)==re.findall(r'<style>.*?</style>',template,re.S)
 for kind in ['problem','answer','solution']:assert (s['asset_prefix']+'/'+kind+'.pdf') in page
 assert s['selector'] in re.findall(r'href="([^"]+)"',page)
report={'additional_subjects':len(rows),'vocational':sum(s['category']=='vocational' for s in rows),'languages':sum(s['category']=='language' for s in rows),'additional_rounds':len(selectors),'new_subject_pages':len(rows),'modified_selectors':len(selectors),'pdf_files':len(rows)*3,'style_blocks_preserved':True,'existing_selector_links_preserved':True,'answer_panels_pixel_identical':len(checks),'native_problem_solution_pdfs_unchanged':len(rows)*2,'proof_samples':proofs,'checks':checks}
(B/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps({k:v for k,v in report.items() if k!='checks'},ensure_ascii=False))
