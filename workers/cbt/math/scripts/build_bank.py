"""Build canonical server-only bank and public original-image assets.
All question/answer/crop provenance is retained; uncertain taxonomy is excluded from diagnosis.
"""
from pathlib import Path
from PIL import Image,ImageChops
import fitz,json,re,hashlib,collections,sys,io
ROOT=Path.home()/'Downloads/mysuneung-math-cbt-20260929'
REPO=Path(__file__).resolve().parents[4]
ASSETS=ROOT/'assets';ASSETS.mkdir(exist_ok=True)
VERSION='2026-09-29.math.v3'
TRACK={'A':'수학 A형','B':'수학 B형','ga':'수학 가형','na':'수학 나형','prob':'확률과 통계','calc':'미적분','geom':'기하'}
# Rules refer exclusively to the source's stated objective, never to a guessed answer or student behavior.
TOPICS=[
 ('matrix','행렬·일차변환','이전 교육과정',r'행렬|일차변환'),
 ('projection','정사영','기하',r'정사영'),
 ('space','공간도형·좌표','기하',r'공간|삼수선|이면각|구의|구와|구면'),
 ('vector','벡터','기하',r'벡터|내적'),
 ('conic','이차곡선','기하',r'포물선|타원|쌍곡선|이차곡선'),
 ('estimation','통계적 추정','확률·통계',r'신뢰구간|추정|표본평균|모평균'),
 ('normal','정규분포','확률·통계',r'정규분포'),
 ('binomial','이항분포','확률·통계',r'이항분포'),
 ('random','확률변수·분포','확률·통계',r'확률변수|확률분포|분산|기댓값'),
 ('conditional','조건부확률·독립','확률·통계',r'조건부|독립|종속'),
 ('probability','확률','확률·통계',r'확률|배반사건|여사건'),
 ('binomial_theorem','이항정리','확률·통계',r'이항정리'),
 ('counting','순열·조합','확률·통계',r'순열|조합|경우의수|경우의수를|경우의수를'),
 ('integral_application','적분의 활용','미적분',r'적분.*(넓이|부피|길이|거리)|(넓이|부피|길이|거리).*적분|회전체의부피|두곡선으로둘러싸인부분의넓이'),
 ('integral_methods','적분법','미적분',r'치환적분|부분적분'),
 ('integral','부정적분·정적분','미적분',r'적분'),
 ('derivative_application','미분의 활용','미적분',r'(미분|도함수).*(활용|극|최|증가|감소|접선|접점|방정식)|(극|최|증가|감소|접선|접점).*(미분|도함수)'),
 ('derivative_methods','여러 가지 미분법','미적분',r'매개변수|합성함수의.*도함수|역함수의.*미분|몫의미분|음함수'),
 ('derivative','미분계수·도함수','미적분',r'미분|도함수|속도|가속도'),
 ('series','수열의 극한·급수','미적분',r'급수|수열의극한|극한.*수열'),
 ('limits','함수의 극한·연속','미적분',r'극한|연속'),
 ('trigonometry','삼각함수','대수',r'삼각함수|사인법칙|코사인법칙|삼각비|호도법'),
 ('exp_log_functions','지수함수·로그함수','대수',r'지수함수|로그함수'),
 ('exp_log','지수·로그','대수',r'(?<!가)지수|로그'),
 ('sequence','수열·수학적 귀납법','대수',r'수열|귀납법|시그마'),
 ('sets','집합·명제','이전 교육과정',r'집합|명제|진리집합|필요충분'),
 ('algebra','방정식·부등식','대수',r'방정식|부등식|복소수|다항식|인수분해'),
 ('functions','함수·그래프','대수',r'함수|그래프'),
 ('geometry','평면도형·좌표','기하',r'좌표|원의|삼각형|도형|평행이동|대칭이동|직선|선분|원과')]
def curriculum(y):return 'ab-2014-2016' if y<=2016 else 'gana-2017-2020' if y<=2020 else 'gana-2021' if y==2021 else 'current-2022-2027'
def classify(objective,era):
    normalized=re.sub(r'\s+','',objective or '')
    # Formula-only fragments or missing objective headings are not diagnostic evidence.
    if normalized and len(re.findall('[가-힣]',normalized))>=6:
        for slug,label,area,pattern in TOPICS:
            if re.search(pattern,normalized):return {'type':label,'type_id':'math-'+era+'-'+slug,'type_group':area,'area':area,'category':label,'analysis_eligible':True,'review_status':'source_objective_mapped','topic':slug}
    return {'type':'유형 검토 중','type_id':'math-'+era+'-pending','type_group':'분류 검토','area':'분류 검토','category':'분류 검토','analysis_eligible':False,'review_status':'pending','topic':'pending'}
def render_question(doc,q):
    parts=[]
    for seg in q.get('prepend_parts',[])+[{'page':q['page'],'rect':q['rect']}]:
        p=doc[seg['page']-1];rect=fitz.Rect(seg['rect']);pix=p.get_pixmap(matrix=fitz.Matrix(2.3,2.3),clip=rect,alpha=False)
        im=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
        # Remove only all-white bottom margins. Keep every rendered ink pixel plus generous padding.
        ink=ImageChops.difference(im,Image.new('RGB',im.size,'white')).convert('L').point(lambda v:255 if v>18 else 0).getbbox()
        if not ink:raise ValueError('blank question image')
        im=im.crop((0,0,im.width,min(im.height,ink[3]+24)))
        parts.append(im)
    w=max(im.width for im in parts);h=sum(im.height for im in parts)+20*(len(parts)-1)
    out=Image.new('RGB',(w,h),'white');y=0
    for im in parts:out.paste(im,(0,y));y+=im.height+20
    b=io.BytesIO();out.save(b,'WEBP',lossless=True,method=4);return b.getvalue(),w,h

def main():
    forms=json.loads((ROOT/'parsed-forms.json').read_text());errors=json.loads((ROOT/'parse-errors.json').read_text())
    if errors or len(forms)!=156:raise ValueError('Cannot publish an incomplete or ambiguous source bank: '+str(errors))
    questions={};outforms=[];provenance=[];assets=[];dup=0
    for form in forms:
        fid=form['id'];year=form['academic_year'];month=form['month'];track=form['track'];era=curriculum(year)
        doc=fitz.open(ROOT/'sources'/(fid+'-problem.pdf'));ph=hashlib.sha256((ROOT/'sources'/(fid+'-problem.pdf')).read_bytes()).hexdigest();sh=hashlib.sha256((ROOT/'sources'/(fid+'-solution.pdf')).read_bytes()).hexdigest()
        keys=[]
        for q in form['questions']:
            no=q['no'];sec='mcommon' if year>=2022 and no<=22 else 'm'+track
            key=f'{year}-{month:02}-{sec}-{no:02}';keys.append(key)
            if key in questions:
                old=questions[key]
                if (old['correct_answer'],old['points'],old['answer_type'])!=(q['answer'],q['points'],q['answer_type']):raise ValueError('Common question mismatch '+key)
                # Identical original common-question text OR pixel data, not just matching number.
                prior=next(p for p in provenance if p['question_key']==key)
                text=re.sub(r'\s+','',q['text']);oldtext=prior.get('question_text','')
                if text and oldtext and text!=oldtext:raise ValueError('Common source content differs '+key)
                dup+=1;continue
            data,w,h=render_question(doc,q);sha=hashlib.sha256(data).hexdigest();imagekey=f'math/v1/questions/{key}-{sha[:12]}.webp';dest=ASSETS/(key+'.webp');dest.write_bytes(data)
            is_edu=form.get('exam_family')=='education_office' or (year==2027 and month in [3,5,7])
            if is_edu:
                display_month=form.get('official_exam_month',month)
                label=f'{year}학년도 {display_month}월 전국연합학력평가'
                provider=form.get('provider') or '교육청'
                label+=' · '+provider
            else:
                label=(f'2027 수능 대비 {month}월 학력평가' if year==2027 and month in [3,5,7] else f'{year}학년도 '+('수능' if month==11 else f'{month}월 모의평가'))
            if sec!='mcommon':label+=' · '+TRACK[track]
            stem=q.get('shared_group');unit=f'{year}-{month:02}-{sec}-'+('g'+stem if stem else f'q{no:02}')
            objectives=q.get('objective','')
            review=json.loads((REPO/'workers/cbt/math/edu-taxonomy-review.json').read_text())['entries'].get(key) if is_edu else None
            if review:
                tax={'type':review['type'],'type_id':'math-'+era+'-'+review['topic'],'type_group':review['type_group'],'area':review['type_group'],'category':review['type'],'analysis_eligible':True,'review_status':review['review_status'],'topic':review['topic']}
            elif is_edu and year in [2023,2024,2025,2026]:
                raise ValueError('Missing manual education-office taxonomy '+key)
            else:tax=classify(objectives,era)
            provider=form.get('provider') or ('교육청' if is_edu else '한국교육과정평가원')
            questions[key]={'question_key':key,'unit_id':unit,'academic_year':year,'month':month,'section_code':sec,'original_no':no,'track':'common' if sec=='mcommon' else track,'curriculum':era,'exam_type':'csat' if month==11 else 'school' if is_edu or month in [3,5,7] else 'mock','exam_family':'education_office' if is_edu else 'kice','provider':provider,'administered_date':form['administered_date'],'official_exam_month':form.get('official_exam_month',month),'source_label':label,'correct_answer':q['answer'],'answer_type':q['answer_type'],'points':q['points'],**tax,'objective':objectives,'image':{'src':'https://mysuneung.com/account-assets/math/questions/'+Path(imagekey).name,'w':w,'h':h},'problem_url':form['problem_url'],'problem_page':q['page'],'solution_url':form['solution_url'],'solution_page':q['solution_page'],'shared_group':stem}
            pub=REPO/'workers/accounts/public/account-assets/math/questions'/Path(imagekey).name;pub.parent.mkdir(parents=True,exist_ok=True);pub.write_bytes(data)
            assets.append({'key':imagekey,'path':str(dest),'sha256':sha,'bytes':len(data),'width':w,'height':h})
            provenance.append({'question_key':key,'form':fid,'problem_sha256':ph,'solution_sha256':sh,'answer_evidence':q['answer_evidence'],'objective':objectives,'question_text':text if (text:=re.sub(r'\s+','',q.get('text',''))) else '', 'page':q['page'],'crop':q['rect'],'prepend_parts':q.get('prepend_parts',[]),'image_sha256':sha,'review_status':tax['review_status']})
        if sum(questions[k]['points'] for k in keys)!=100:raise ValueError('Not 100 points '+fid)
        normalized_edu=form.get('exam_family')=='education_office' or (year==2027 and month in [3,5,7])
        normalized_provider=form.get('provider') or ('교육청' if normalized_edu else '한국교육과정평가원')
        outforms.append({k:v for k,v in form.items() if k not in ['questions','title','listing_params'] }|{'question_keys':keys,'curriculum':era,'exam_family':'education_office' if normalized_edu else 'kice','provider':normalized_provider})
        print('BUILT',fid,'questions',len(questions),flush=True)
    years=sorted(set(f['academic_year'] for f in forms))
    coverage={'academic_years':years,'exam_sessions':len(set((f['academic_year'],f['month'],f.get('exam_family','kice')) for f in outforms)),'forms':len(forms),'question_references':len(forms)*30,'distinct_questions':len(questions),'common_duplicates_removed':dup,'pending_taxonomy':sum(not q['analysis_eligible'] for q in questions.values()),'manual_taxonomy_reviewed':sum(q.get('review_status')=='manual_question_review' for q in questions.values()),'education_office_sessions':len(set((f['academic_year'],f['month']) for f in outforms if f.get('exam_family')=='education_office')),'periods':[{'year':y,'months':sorted(set(f['month'] for f in forms if f['academic_year']==y)),'tracks':sorted(set(f['track'] for f in forms if f['academic_year']==y))} for y in years],'not_published':['2027학년도 수능'],'source':'EBSi 공개 기출 문제·해설 PDF','scope_note':'2014–2026학년도 평가원 6·9월 및 수능 + 2023·2024학년도 고3 교육청 각 4회차 + 2025·2026학년도 고3 교육청 3·5·7·10월 + 2027 대비 교육청 3·5·7월 및 평가원 6·9월. 2027 수능 제외.','textbook_links_verified':0}
    bank={'version':VERSION,'years':years,'coverage':coverage,'forms':outforms,'questions':questions}
    path=REPO/'workers/cbt/data/math-bank.json';path.write_text(json.dumps(bank,ensure_ascii=False,separators=(',',':')))
    (ROOT/'assets-manifest.json').write_text(json.dumps(assets,ensure_ascii=False,indent=2))
    (ROOT/'provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2))
    (REPO/'workers/cbt/math/coverage.json').write_text(json.dumps(coverage,ensure_ascii=False,indent=2))
    print('DONE',coverage,'asset_bytes',sum(a['bytes'] for a in assets),flush=True)
if __name__=='__main__':main()
