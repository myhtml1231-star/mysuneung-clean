"""Collect the official October 2026 exams without modifying the serving site.

All outputs are preparation evidence. This does not mark CBT import or deployment
complete. Download names, source URLs, byte hashes, full cut tables and EBS survey
snapshots are retained so the existing production import can consume them.
"""
from pathlib import Path
import concurrent.futures, datetime, hashlib, html, io, json, re, time
import urllib.parse, urllib.request, zipfile
from pypdf import PdfReader

OUT=Path("october-2026-preparation")
OUT.mkdir(exist_ok=True)
BASE="https://www.ebsi.co.kr"
NOW=datetime.datetime.now(datetime.timezone.utc).isoformat()
def get(url):
    assert urllib.parse.urlsplit(url).hostname in ("www.ebsi.co.kr","wdown.ebsi.co.kr"), url
    for attempt in range(3):
        try:
            req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0","Referer":BASE+"/"})
            with urllib.request.urlopen(req,timeout=60) as r:
                data=r.read(128*1024*1024+1)
                assert len(data)<=128*1024*1024,"oversized source"
                return data
        except Exception:
            if attempt==2: raise
            time.sleep(attempt+1)
def dump(path,value):
    path=OUT/path
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+"\n")
def plain(s):
    return re.sub(r"\s+"," ",html.unescape(re.sub(r"<[^>]*>"," ",s))).strip()
def collect_grade(grade):
    record="20261020"+str(grade)
    top_url=BASE+"/ebs/xip/xipt/RetrieveSCVMainTop.ajax?irecord="+record
    top=get(top_url).decode()
    links=[{"kind":"question" if k=="P" else "answer","url":html.unescape(u),"subject":plain(n)}
           for k,u,n in re.findall(r"goDownMain([PH])\('([^']+)'\)[^>]*>([^<]+)</a>",top)]
    assert len(links)==(12 if grade==1 else 16),(grade,len(links))
    cuts_url=BASE+"/ebs/xip/xipa/retrieveGrdCut.ajax?irecord="+record+"&confYn=N"
    cut_tabs=get(cuts_url).decode()
    groups=re.findall(r"grdCutList\('([^']+)',\s*'(\d+)',\s*'"+record+r"'\)",cut_tabs)
    tables=[]
    raw={}
    for ids,order in dict.fromkeys(groups):
        if order=="999":continue
        url=BASE+"/ebs/xip/xipa/retrieveGrdCutList.ajax?"+urllib.parse.urlencode(
            {"subjectId":ids,"irecord":record,"ord":order})
        page=get(url).decode()
        raw[order]={"url":url,"html":page}
        for section in re.split(r'<div class="col_6">',page)[1:]:
            title=re.search(r"<h3>(.*?)</h3>",section,re.S)
            table=re.search(r"<table\b[^>]*>(.*?)</table>",section,re.S)
            if not title or not table:continue
            body=table[1]
            rows=[]
            for tr in re.findall(r"<tr\b[^>]*>(.*?)</tr>",body,re.S):
                cells=[plain(x) for x in re.findall(r"<td\b[^>]*>(.*?)</td>",tr,re.S)]
                if cells:rows.append(cells)
            available={r[0] for r in rows}
            assert set(map(str,range(1,9)))<=available,(grade,plain(title[1]),rows)
            tables.append({"subject":plain(title[1]),"group":order,"source_url":url,
                "headers":[plain(x) for x in re.findall(r"<th\b[^>]*>(.*?)</th>",body,re.S)],
                "rows":rows,"raw_score_cells_preserved":True,
                "status":"expected" if "grdTypCng('N')" in page else "check_source_label",
                "averages_and_standard_deviations":[plain(x) for x in re.findall(r"<p>(.*?)</p>",section.split("<table")[0],re.S)]})
    assert tables,(grade,"no cut tables")
    survey_url=BASE+"/ebs/xip/xipt/retrieveSCVBottomSurvey.ajax?nsMenuType=102&bbsId=1000009517&irecord="+record
    survey=get(survey_url).decode()
    difficulty=[{"label":plain(a),"percent":float(plain(b).rstrip("%"))}
        for a,b in re.findall(r'<p class="progress_label">(.*?)</p>[\s\S]*?<p class="progress_value">(.*?)</p>',survey)]
    assert len(difficulty)==5,(grade,difficulty)
    assert 99<=sum(r["percent"] for r in difficulty)<=101,(grade,difficulty)
    prefix=Path("metadata")/("go"+str(grade))
    dump(prefix/"cuts.json",{"fetched_at":NOW,"record":record,"tables":tables})
    dump(prefix/"difficulty.json",{"fetched_at":NOW,"source_url":survey_url,"values":difficulty})
    dump(prefix/"cut-source-html.json",raw)
    (OUT/prefix/"top-source.html").write_text(top)
    (OUT/prefix/"survey-source.html").write_text(survey)
    return {"grade":grade,"record":record,"source_url":top_url,"downloads":links,
            "cut_subjects":len(tables),"difficulty":difficulty}
grades=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    grades=list(pool.map(collect_grade,[1,2,3]))
downloads=[dict(x,grade=g["grade"]) for g in grades for x in g["downloads"]]
def inspect_pdf(data,path):
    assert data.startswith(b"%PDF-"),"not a PDF: "+str(path)
    reader=PdfReader(io.BytesIO(data),strict=False)
    assert len(reader.pages)>0
    text="\n\n".join(p.extract_text() or "" for p in reader.pages)
    textpath=path.with_suffix(".txt")
    textpath.write_text(text)
    return {"pages":len(reader.pages),"text_characters":len(text),
            "mentions_2026":"2026" in text,"mentions_october":bool(re.search(r"10\s*월",text)),
            "manual_exam_identity_review_required":not ("2026" in text and re.search(r"10\s*월",text))}
def download(item):
    data=get(item["url"])
    name=Path(urllib.parse.urlsplit(item["url"]).path).name
    path=OUT/"originals"/("go"+str(item["grade"]))/name
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_bytes(data)
    info=dict(item,file=str(path.relative_to(OUT)),size=len(data),sha256=hashlib.sha256(data).hexdigest())
    if name.lower().endswith(".pdf"):
        info["pdf"]=inspect_pdf(data,path)
    else:
        assert zipfile.is_zipfile(io.BytesIO(data)),name
        members=[]
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            assert sum(m.file_size for m in archive.infolist())<=512*1024*1024,"oversized archive"
            assert archive.testzip() is None,"corrupt ZIP"
            for index,m in enumerate(archive.infolist()):
                if m.is_dir():continue
                member_name=m.filename
                if not (m.flag_bits & 0x800):
                    try:member_name=m.filename.encode("cp437").decode("cp949")
                    except (UnicodeError,LookupError):pass
                b=archive.read(m)
                target=path.parent/(path.stem+"-members")/(str(index).zfill(3)+"-"+Path(member_name.replace("\\","/")).name)
                target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b)
                member={"name":member_name,"size":len(b),"sha256":hashlib.sha256(b).hexdigest(),
                        "file":str(target.relative_to(OUT))}
                if member_name.lower().endswith(".pdf"):member["pdf"]=inspect_pdf(b,target)
                members.append(member)
        info["members"]=members
    return info
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
    files=list(pool.map(download,downloads))
pdfs=[f["pdf"] for f in files if "pdf" in f]+[m["pdf"] for f in files for m in f.get("members",[]) if "pdf" in m]
report={"fetched_at":NOW,"exam_date":"2026-10-20","grades":[1,2,3],
    "official_downloads":len(files),"pdf_count":len(pdfs),
    "pdf_pages":sum(p["pages"] for p in pdfs),
    "pdf_identity_review_required":sum(p["manual_exam_identity_review_required"] for p in pdfs),
    "cut_subject_tables":sum(g["cut_subjects"] for g in grades),
    "difficulty_surveys":len(grades),"source_files_integrity_checked":True,
    "cbt_import_complete":False,"production_deployed":False,
    "remaining":["Obtain current production source and existing import templates",
                 "Import questions, choices, answer keys, explanations, taxonomy and source crops into the existing CBT schema",
                 "Apply existing archive, cut and difficulty templates without redesign",
                 "Verify every subject, grade, route, asset and actual production serving state"]}
dump(Path("manifest.json"),{"fetched_at":NOW,"grades":grades,"files":files})
dump(Path("report.json"),report)
print(json.dumps(report,ensure_ascii=False),flush=True)
