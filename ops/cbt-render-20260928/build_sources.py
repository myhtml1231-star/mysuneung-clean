from pathlib import Path
import json,re,fitz,hashlib,io,collections,sys
from PIL import Image
W=Path(__file__).parent
DATA=W/'live-cache';SETS=Path('/Users/shbj/Downloads/CBT_문항세트');OUT=W/'source-assets';OUT.mkdir(exist_ok=True)
CAT=json.load(open(W/'catalog-live.json'))
UNSAFE=re.compile('[\ue000-\uf8ff\ufffd\U000f0000-\U000ffffd\U00100000-\U0010fffd]')
PASS_RISKS={'low_passage_pdf_match','complex_passage_assets','blank_visual_passage_part','passage_asset_order','passage_visual_asset','missing_passage_ref'}
Q_RISKS={'unsafe_glyph','low_pdf_match','nonexact_pdf_text','low_view_pdf_match','empty_choice'}
CACHE={};PAGES={};UPLOADS={};AUDIT=[];ERRORS=[];STATS=collections.Counter()
manifest={'version':'20260928-content-r4','units':{}}

def clean_quotes(s):return str(s).replace('\U000f0854','『').replace('\U000f0855','』')
def norm(s):return re.sub(r'\W+','',clean_quotes(s))
def doc(path):
 if path not in CACHE:CACHE[path]=fitz.open(path)
 return CACHE[path]
def page_info(path,pi):
 key=(path,pi)
 if key in PAGES:return PAGES[key]
 p=doc(path)[pi-1];lines=[]
 for b in p.get_text('dict')['blocks']:
  for l in b.get('lines',[]):
   lines.append({'text':''.join(x['text'] for x in l['spans']).strip(),'rect':fitz.Rect(l['bbox']),'size':max(x['size'] for x in l['spans'])})
 H,Wp=p.rect.height,p.rect.width
 # Find printing furniture by content AND page position, rather than cutting an arbitrary bottom percentage.
 foot=[l['rect'].y0-12 for l in lines if l['text'].isdigit() and l['rect'].y0>H*.86 and Wp*.42<l['rect'].x0<Wp*.55]
 foot += [l['rect'].y0-8 for l in lines if l['rect'].y0>H*.8 and ('저작권' in l['text'] or '이 문제지' in l['text'])]
 bottom=min(foot) if foot else H*.901
 heads=[l['rect'].y1+6 for l in lines if l['rect'].y0<H*.13 and (re.search(r'홀수형|짝수형|학년도.*시험|국어\s*영역',l['text']) or (l['text'].isdigit() and l['size']>18))]
 top=max([H*.128]+heads)
 drawings=p.get_drawings();notices=[]
 for l in lines:
  if l['rect'].y0<H*.45 or not re.fullmatch(r'[*※]?\s*확인\s*사항',l['text']):continue
  after=[x for x in lines if l['rect'].y0<x['rect'].y0<l['rect'].y0+130 and abs(x['rect'].x0-l['rect'].x0)<80]
  if not any('답안지' in x['text'] for x in after):continue
  boxes=[fitz.Rect(x['rect']) for x in drawings if x['rect'].width>140 and x['rect'].height>25 and x['rect'].contains(l['rect']) and 0<l['rect'].y0-x['rect'].y0<45]
  box=min(boxes,key=lambda x:x.width*x.height) if boxes else fitz.Rect(l['rect'].x0-18,l['rect'].y0-18,Wp-50,bottom)
  notices.append(box)
 PAGES[key]={'p':p,'lines':lines,'top':top,'bottom':bottom,'notices':notices,'drawings':drawings}
 return PAGES[key]

def safe_rect(path,pi,coords):
 info=page_info(path,pi);r=fitz.Rect(coords);old=list(r)
 r.y0=max(r.y0,info['top']);r.y1=min(r.y1,info['bottom'])
 reasons=[]
 if r.y0!=old[1]:reasons.append('page_header')
 if r.y1!=old[3]:reasons.append('page_footer')
 for n in info['notices']:
  if min(r.x1,n.x1)-max(r.x0,n.x0)>60 and r.y1>n.y0 and r.y0<n.y1:
   r.y1=min(r.y1,n.y0-4);reasons.append('answer_sheet_notice')
 return r,reasons

def save_crop(uid,name,path,regions):
 descriptors=[]
 for part,(pi,coords) in enumerate(regions,1):
  rect,reasons=safe_rect(path,pi,coords)
  if rect.is_empty or rect.height<8:continue
  info=page_info(path,pi)
  relevant=[l for l in info['lines'] if rect.contains(l['rect'])]
  remnants=[l['text'] for l in relevant if re.search(r'이 문제지에 관한 저작권|답안지의 해당란|선택한 과목인지 확인|^\*\s*확인 사항',l['text'])]
  if remnants:ERRORS.append({'id':uid,'kind':name,'page':pi,'remnants':remnants})
  # Only source-coordinate cropping is performed. The original PDF is never changed.
  pix=info['p'].get_pixmap(matrix=fitz.Matrix(2.35,2.35),clip=rect,alpha=False)
  im=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
  bbox=im.convert('L').point(lambda x:255 if x<242 else 0).getbbox()
  if not bbox:continue
  x0,y0,x1,y1=bbox;pad=10
  im=im.crop((max(0,x0-pad),max(0,y0-pad),min(im.width,x1+pad),min(im.height,y1+pad)))
  if im.height<10:continue
  buf=io.BytesIO();im.save(buf,'WEBP',lossless=True,method=4);b=buf.getvalue();sha=hashlib.sha256(b).hexdigest()[:20]
  fn=sha+'.webp';key='learning/render-20260928-r4/'+fn
  if key not in UPLOADS:(OUT/fn).write_bytes(b);UPLOADS[key]={'key':key,'file':str(OUT/fn),'size':len(b),'content_type':'image/webp'}
  descriptors.append({'src':'/cbt-data/'+key,'w':im.width,'h':im.height})
  AUDIT.append({'unit_id':uid,'kind':name,'part':part,'pdf':path,'page':pi,'before':coords,'clip':list(rect),'removed':reasons,'chars':sum(len(l['text']) for l in relevant),'src':key,'remnants':remnants})
  STATS.update(reasons)
 return descriptors

def lines_in(path,sl):
 r=fitz.Rect(sl['clip_pdf']);return sorted([l for l in page_info(path,sl['page'])['lines'] if r.contains(l['rect'])],key=lambda x:(round(x['rect'].y0/2)*2,x['rect'].x0))
def between(slices,start,end):
 regs=[]
 for i in range(start[0],end[0]+1):
  sl=slices[i];x0,y0,x1,y1=sl['clip_pdf'];y0=max(y0,start[1]) if i==start[0] else y0;y1=min(y1,end[1]) if i==end[0] else y1
  if y1-y0>=8:regs.append((sl['page'],[x0,y0,x1,y1]))
 return regs

saved_entries={}
if (W/'source-unit-checkpoints.jsonl').exists():
 for line in (W/'source-unit-checkpoints.jsonl').read_text().splitlines():
  try:
   saved=json.loads(line);saved_entries[saved['id']]=saved;manifest['units'][saved['id']]=saved['entry'];UPLOADS.update({x['key']:x for x in saved['uploads']});AUDIT.extend(saved['audit']);ERRORS.extend(saved['errors'])
  except (ValueError,KeyError):pass
print('RESUMED_SOURCE_UNITS',len(saved_entries),flush=True)
for ri,row in enumerate(CAT,1):
 if row['id'] in saved_entries:continue
 before_keys=set(UPLOADS);audit_start=len(AUDIT);error_start=len(ERRORS)
 u=json.load(open(DATA/row['key']));meta=json.load(open(SETS/row['key'].replace('unit.json','metadata.json')))
 uid=row['id'];slices=meta['slices'];path=meta['source_pdf'];ls=[lines_in(path,s) for s in slices];qs=u['questions'];positions={}
 for q in qs:
  no=q['original_no'];found=[]
  for si,lines in enumerate(ls):
   left=slices[si]['clip_pdf'][0]
   for l in lines:
    mt=re.match(r'^(\d{1,2})\s*\.\s*(.*)',l['text'])
    if mt and int(mt.group(1))==no and l['rect'].x0<left+64:
     pref=norm(q.get('stem',''))[:10];rest=norm(mt.group(2));score=(10 if rest.startswith(pref) and pref else 0)+l['size'];found.append((score,si,l))
  if found:
   _,si,l=max(found,key=lambda x:x[0]);positions[no]=(si,max(slices[si]['clip_pdf'][1],l['rect'].y0-5),l)
  else:ERRORS.append({'id':uid,'no':no,'error':'question_start_not_found'})
 entry={'key':row['key'],'original':'/cbt-data/originals/'+row['key'].replace('unit.json','original.png'),'passage':[],'questions':{}}
 entry['originalParts']=save_crop(uid,'original',path,[(sl['page'],sl['clip_pdf']) for sl in slices])
 reasons=set(sum([q.get('qc_reasons') or [] for q in qs],[]));ptext=json.dumps(u.get('passage'),ensure_ascii=False)
 risk=bool(reasons&PASS_RISKS or UNSAFE.search(clean_quotes(ptext)) or any('[A]' in (q.get('stem') or '') for q in qs))
 if risk and len(positions)==len(qs):
  first=min(positions.values(),key=lambda x:(x[0],x[1]));regs=between(slices,(0,slices[0]['clip_pdf'][1]),(first[0],first[1]-3))
  entry['passage']=save_crop(uid,'passage',path,regs);STATS['passage_sets']+=bool(entry['passage'])
 for q in qs:
  no=q['original_no'];t=q.get('stem') or '';v=q.get('view_text') or '';assets=[a for a in (u.get('assets') or []) if a.get('target')=='question' and a.get('question_no')==no]+(q.get('assets') or [])
  qhard=bool(set(q.get('qc_reasons') or [])&Q_RISKS or UNSAFE.search(clean_quotes(json.dumps(q,ensure_ascii=False))) or any(not (c.get('text') or '').strip() for c in q['choices']))
  extra=re.search(r'것은[?？]\s*(?:\[3점\])?\s*(.{12,})',t)
  need=bool(assets or qhard or extra or v or 'embedded_view' in (q.get('qc_reasons') or []))
  if not need or no not in positions:continue
  si,sy,line=positions[no];nxt=[p for n,p in positions.items() if (p[0],p[1])>(si,sy)]
  end=(min(nxt,key=lambda p:(p[0],p[1]))[:2] if nxt else (len(slices)-1,slices[-1]['clip_pdf'][3]));end=(end[0],end[1]-3 if nxt else end[1]);regs=between(slices,(si,sy),end)
  header=[l for l in ls[si] if sy<=l['rect'].y0<sy+105];ph=next((l['rect'].y1+6 for l in header if '?' in l['text'] or '？' in l['text']),None)
  ch=[]
  for sj in range(si,end[0]+1):
   for l in ls[sj]:
    if (sj,l['rect'].y0)<(si,sy) or (sj,l['rect'].y0)>(end[0],end[1]):continue
    if re.match(r'^[①②③④⑤]',l['text']):ch.append((sj,l))
  marks={l['text'][0] for _,l in ch};fc=min(ch,key=lambda x:(x[0],x[1]['rect'].y0)) if {'①','②','③','④','⑤'}<=marks else None
  qe={'sourceRequired':qhard,'hasVisual':bool(assets)};qe['full']=save_crop(uid,'q'+str(no),path,regs)
  if ph and fc and (si,ph)<(fc[0],fc[1]['rect'].y0-7):
   mats=between(slices,(si,ph),(fc[0],fc[1]['rect'].y0-7));qe['material']=save_crop(uid,'m'+str(no),path,mats)
  if re.search(r'가상의 표|주파수\(Hz\)|크기\(dB\)|A\s+B\s+C\s+D',v):qe['layoutCritical']=True
  # Keep specialized multi-table material as source. Simple labelled rows remain DOM.
  if re.search(r'<\s*보기\s*1\s*>[\s\S]*<\s*보기\s*2\s*>',t+v):qe['layoutCritical']=True
  entry['questions'][str(no)]=qe;STATS['question_sources']+=1
 manifest['units'][uid]=entry
 with (W/'source-unit-checkpoints.jsonl').open('a') as checkpoint:
  checkpoint.write(json.dumps({'id':uid,'entry':entry,'uploads':[v for k,v in UPLOADS.items() if k not in before_keys],'audit':AUDIT[audit_start:],'errors':ERRORS[error_start:]},ensure_ascii=False)+'\n');checkpoint.flush()
 (W/'source-build-checkpoint.json').write_text(json.dumps({'units':ri,'files':len(UPLOADS),'errors':ERRORS[-20:]},ensure_ascii=False))
 if ri%50==0:print('SOURCES',ri,'/',len(CAT),'files',len(UPLOADS),'errors',len(ERRORS),flush=True)
manifest['stats']=dict(STATS)
(W/'source-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':')))
(W/'source-upload-list.json').write_text(json.dumps(list(UPLOADS.values()),ensure_ascii=False))
(W/'source-crop-audit.json').write_text(json.dumps(AUDIT,ensure_ascii=False))
(W/'source-build-audit.json').write_text(json.dumps({'stats':dict(STATS),'files':len(UPLOADS),'bytes':sum(x['size'] for x in UPLOADS.values()),'errors':ERRORS},ensure_ascii=False,indent=2))
print('DONE',dict(STATS),'files',len(UPLOADS),'errors',len(ERRORS),flush=True)
if ERRORS:print(ERRORS[:30]);sys.exit(1)
