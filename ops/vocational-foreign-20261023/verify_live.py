from pathlib import Path
import json, re, urllib.request, urllib.parse, concurrent.futures, datetime, time

ROOT = Path('archive-expansion')
BUILD = ROOT / 'release'
rows = json.loads((BUILD / 'subjects.json').read_text())
subjects = {s['page']: s for s in rows}
selectors = {}
for subject in rows:
    selectors.setdefault(subject['selector'], []).append(subject)

def links(text):
    return re.findall(r'href=[\"\']([^\"\']+)[\"\']', text)

def check(name):
    url = 'https://mysuneung.com/' + urllib.parse.quote(name)
    last = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=45) as response:
                assert response.status == 200
                html = response.read().decode('utf-8')
            actual = links(html)
            local = (BUILD / 'pages' / name).read_text()
            assert re.findall(r'<style>.*?</style>', local, re.S) == re.findall(r'<style>.*?</style>', html, re.S), 'style changed'
            if name in subjects:
                subject = subjects[name]
                assert subject['subject_name'] in html, 'subject title missing'
                for kind in ['problem', 'answer', 'solution']:
                    assert any(subject['asset_prefix'] + '/' + kind + '.pdf' in link for link in actual), kind + ' missing'
                assert subject['selector'] in actual, 'back link missing'
            else:
                for subject in selectors[name]:
                    assert subject['page'] in actual, subject['page'] + ' missing'
                previous = links((ROOT / 'source-cache' / 'templates' / name).read_text())
                for link in previous:
                    assert actual.count(link) >= previous.count(link), 'existing link missing: ' + link
            return {'page': name, 'status': 200, 'links_checked': len(actual), 'style_preserved': True}
        except Exception as error:
            last = error
            if attempt < 2:
                time.sleep(2)
    raise AssertionError((name, str(last)))

with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    results = list(pool.map(check, list(subjects) + list(selectors)))
report = {'checked_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'subject_pages': len(subjects), 'selectors': len(selectors), 'pages_verified': len(results), 'results': results}
(BUILD / 'live-verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
print('LIVE VERIFIED', len(results), 'pages;', len(rows)*3, 'PDF links')
