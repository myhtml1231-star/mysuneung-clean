import re
from pathlib import Path

def clean_html(text: str) -> str:
    # remove HTML tags and trim whitespace
    return re.sub(r'<.*?>', '', text).strip()

subject_btn_re = re.compile(r'<div class="subject-btn">(?P<subject>[^<]+)</div>', re.S)
box_re = re.compile(r'<div class="sub-box">\s*<div class="sub-title">(?P<title>[^<]+)</div>\s*<div class="sub-diff">(?P<diff>[^<]+)</div>\s*<div class="cut-area">(?P<cut>.*?)</div>', re.S)
br_split_re = re.compile(r'<br\s*/?>', re.I)

def parse_grade_line(line: str):
    line = clean_html(line)
    if not line or ':' not in line:
        return None
    label, value = [part.strip() for part in line.split(':', 1)]
    m = re.match(r'(\d+)등급\s*(.*)', label)
    if m:
        grade = m.group(1)
        desc = m.group(2).strip() or '등급'
    else:
        grade = label
        desc = ''
    return {'grade': grade, 'desc': desc, 'value': value}

def parse_file(path: Path):
    html = path.read_text(encoding='utf-8')
    # title inside .top-year div
    title_match = re.search(r'<div class="top-year">(.*?)</div>', html, re.S)
    heading = clean_html(title_match.group(1)) if title_match else path.stem
    subjects = []
    subject_positions = list(subject_btn_re.finditer(html))
    for idx, subject_match in enumerate(subject_positions):
        subject_name = clean_html(subject_match.group('subject'))
        start = subject_match.end()
        end = subject_positions[idx + 1].start() if idx + 1 < len(subject_positions) else len(html)
        wrap = html[start:end]
        cards = []
        for box_match in box_re.finditer(wrap):
            sub_title = clean_html(box_match.group('title'))
            diff_text = clean_html(box_match.group('diff'))
            diff = diff_text.split(':', 1)[1].strip() if ':' in diff_text else diff_text
            cut_html = box_match.group('cut')
            lines = [l for l in br_split_re.split(cut_html) if l.strip()]
            rows = []
            for line in lines:
                parsed = parse_grade_line(line)
                if parsed:
                    rows.append(parsed)
            # Skip placeholder cards that carry no usable grade rows
            if not rows:
                continue
            cards.append({'title': sub_title, 'difficulty': diff, 'grades': rows})
        # Only keep subjects that yielded real cards
        if cards:
            subjects.append({'name': subject_name, 'cards': cards})
    return heading, subjects

def badge_class(grade: str):
    if grade == '1':
        return 'w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold bg-[#F4B733] text-white'
    if grade == '2':
        return 'w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold bg-slate-200 text-slate-600'
    return 'w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold bg-slate-100 text-slate-400'

def render_card(card):
    grade_rows = []
    for row in card['grades']:
        badge = badge_class(row['grade'])
        desc = row['desc'] if row['desc'] else '등급'
        value_class = 'font-bold text-[#d69e26]' if row['grade'] == '1' else 'font-bold text-slate-700'
        grade_rows.append(f"""
            <div class=\"flex items-center justify-between text-sm\">
                <div class=\"flex items-center gap-2\">
                    <span class=\"{badge}\">{row['grade']}</span>
                    <span class=\"text-slate-500 font-medium\">{desc}</span>
                </div>
                <span class=\"{value_class}\">{row['value']}</span>
            </div>
        """)
    grade_html = '\n'.join(grade_rows)
    return f"""
        <div class=\"bg-slate-50 rounded-2xl p-6 border border-slate-100 hover:border-[#F4B733]/30 hover:shadow-lg hover:shadow-yellow-100/50 transition-all group\">
            <h3 class=\"text-lg font-black text-slate-900 mb-1 group-hover:text-[#d69e26] transition-colors\">{card['title']}</h3>
            <div class=\"text-xs font-bold text-slate-400 mb-5 flex items-center gap-1\">
                <span class=\"w-1.5 h-1.5 rounded-full bg-slate-300\"></span>
                난이도: {card['difficulty']}
            </div>
            <div class=\"space-y-3\">
                {grade_html}
            </div>
        </div>
    """

def subject_category(name: str) -> str:
    mapping = {
        '국어': 'korean',
        '수학': 'math',
        '영어': 'english',
        '한국사': 'history',
        '사회탐구': 'social',
        '과학탐구': 'science',
    }
    return mapping.get(name, 'all')

def render_page(title: str, subjects):
    sections_html = []
    for subject in subjects:
        category = subject_category(subject['name'])
        cards_html = '\n'.join(render_card(card) for card in subject['cards'])
        columns = 'md:grid-cols-3'
        if category == 'math':
            columns = 'md:grid-cols-2'
        elif category in ('social', 'science'):
            columns = 'md:grid-cols-3'
        section = f"""
            <div class=\"subject-section fade-in bg-white rounded-3xl p-8 shadow-xl shadow-slate-200/50 border border-slate-100\" data-category=\"{category}\">
                <div class=\"flex items-center gap-3 mb-6 border-b border-slate-100 pb-4\">
                    <div class=\"w-3 h-8 bg-[#F4B733] rounded-full\"></div>
                    <h2 class=\"text-2xl font-black text-slate-800\">{subject['name']} 영역</h2>
                </div>
                <div class=\"grid grid-cols-1 {columns} gap-6\">
                    {cards_html}
                </div>
            </div>
        """
        sections_html.append(section)
    sections = '\n'.join(sections_html)
    return f"""
<!DOCTYPE html>
<html lang=\"ko\">
<head>
    <meta charset=\"UTF-8\">
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">
    <title>{title}</title>
    <script src=\"https://cdn.tailwindcss.com\"></script>
    <link href=\"https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap\" rel=\"stylesheet\">
    <script src=\"https://unpkg.com/lucide@latest\"></script>
    <style>
        body {{ font-family: 'Noto Sans KR', sans-serif; }}
        .fade-in {{ animation: fadeIn 0.5s ease-out forwards; }}
        @keyframes fadeIn {{ from {{ opacity: 0; transform: translateY(20px); }} to {{ opacity: 1; transform: translateY(0); }} }}
    </style>
    <script>
        tailwind.config = {{
            theme: {{
                extend: {{
                    colors: {{
                        primary: '#F4B733',
                    }}
                }}
            }}
        }}
    </script>
</head>
<body class=\"bg-[#f4f5f7] min-h-screen selection:bg-yellow-200 selection:text-slate-900\">
    <nav class=\"sticky top-0 z-40 w-full bg-white/80 backdrop-blur-md border-b border-slate-100\">
        <div class=\"max-w-[1200px] mx-auto px-4 h-16 flex items-center justify-between\">
            <a href=\"#\" class=\"flex items-center gap-3\">
                <div class=\"w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm border border-slate-100\">
                    <span class=\"font-bold text-slate-900\">수</span>
                </div>
                <span class=\"text-xl font-extrabold text-slate-800\">수능기출</span>
            </a>
            <div class=\"hidden md:flex gap-6 text-sm font-bold text-slate-600\">
                <a href=\"#\" class=\"hover:text-[#F4B733]\">고3</a>
                <a href=\"#\" class=\"hover:text-[#F4B733]\">고2</a>
                <a href=\"#\" class=\"hover:text-[#F4B733]\">고1</a>
                <a href=\"#\" class=\"text-[#F4B733]\">등급컷</a>
                <a href=\"#\" class=\"hover:text-[#F4B733]\">커뮤니티</a>
            </div>
            <button class=\"md:hidden p-2\">
                <i data-lucide=\"menu\"></i>
            </button>
        </div>
    </nav>
    <main class=\"max-w-[1000px] mx-auto px-4 pt-24 pb-20\">
        <div class=\"flex flex-col md:flex-row items-center justify-center gap-4 mb-12 text-center md:text-left\">
            <div class=\"w-20 h-20 bg-white rounded-2xl shadow-md flex items-center justify-center border border-slate-100\">
                <span class=\"text-3xl font-black text-slate-900\">수</span>
            </div>
            <div>
                <h1 class=\"text-3xl md:text-5xl font-black text-slate-900 tracking-tight\">{title}</h1>
            </div>
        </div>
        <div class=\"flex flex-wrap justify-center gap-2 mb-10 sticky top-20 z-20 bg-[#f4f5f7]/95 backdrop-blur-sm py-4 rounded-2xl\" id=\"filter-container\">
            <button onclick=\"filter('all')\" class=\"filter-btn active px-5 py-2.5 rounded-full font-bold text-sm transition-all shadow-sm bg-[#F4B733] text-white shadow-yellow-200 ring-2 ring-yellow-100\" data-target=\"all\">전체보기</button>
            <button onclick=\"filter('korean')\" class=\"filter-btn px-5 py-2.5 rounded-full font-bold text-sm transition-all shadow-sm bg-white text-slate-600 hover:bg-slate-50 border border-slate-200\" data-target=\"korean\">국어</button>
            <button onclick=\"filter('math')\" class=\"filter-btn px-5 py-2.5 rounded-full font-bold text-sm transition-all shadow-sm bg-white text-slate-600 hover:bg-slate-50 border border-slate-200\" data-target=\"math\">수학</button>
            <button onclick=\"filter('english')\" class=\"filter-btn px-5 py-2.5 rounded-full font-bold text-sm transition-all shadow-sm bg-white text-slate-600 hover:bg-slate-50 border border-slate-200\" data-target=\"english\">영어</button>
            <button onclick=\"filter('history')\" class=\"filter-btn px-5 py-2.5 rounded-full font-bold text-sm transition-all shadow-sm bg-white text-slate-600 hover:bg-slate-50 border border-slate-200\" data-target=\"history\">한국사</button>
            <button onclick=\"filter('social')\" class=\"filter-btn px-5 py-2.5 rounded-full font-bold text-sm transition-all shadow-sm bg-white text-slate-600 hover:bg-slate-50 border border-slate-200\" data-target=\"social\">사회탐구</button>
            <button onclick=\"filter('science')\" class=\"filter-btn px-5 py-2.5 rounded-full font-bold text-sm transition-all shadow-sm bg-white text-slate-600 hover:bg-slate-50 border border-slate-200\" data-target=\"science\">과학탐구</button>
        </div>
        <div class=\"space-y-8\" id=\"content-area\">
            {sections}
        </div>
        <div class=\"mt-20 text-center\">
            <button onclick=\"history.back()\" class=\"px-8 py-4 bg-white border-2 border-slate-200 text-slate-600 font-bold rounded-2xl hover:bg-slate-50 hover:border-slate-300 transition-all transform hover:-translate-y-1 shadow-sm\">
                ← 이전 화면으로 돌아가기
            </button>
        </div>
    </main>
    <script>
        lucide.createIcons();
        function filter(category) {{
            const buttons = document.querySelectorAll('.filter-btn');
            const sections = document.querySelectorAll('.subject-section');
            buttons.forEach(btn => {{
                if (btn.dataset.target === category) {{
                    btn.className = "filter-btn active px-5 py-2.5 rounded-full font-bold text-sm transition-all shadow-sm bg-[#F4B733] text-white shadow-yellow-200 ring-2 ring-yellow-100";
                }} else {{
                    btn.className = "filter-btn px-5 py-2.5 rounded-full font-bold text-sm transition-all shadow-sm bg-white text-slate-600 hover:bg-slate-50 border border-slate-200";
                }}
            }});
            sections.forEach(section => {{
                section.classList.remove('fade-in');
                void section.offsetWidth;
                if (category === 'all' || section.dataset.category === category) {{
                    section.style.display = 'block';
                    section.classList.add('fade-in');
                }} else {{
                    section.style.display = 'none';
                }}
            }});
        }}
    </script>
</body>
</html>
"""

def main():
    inputs = sorted(Path('.').glob('고3 등급컷 *.html'))
    produced = set()

    for path in inputs:
        heading, subjects = parse_file(path)
        if not subjects:
            continue
        slug = path.stem.replace('고3 등급컷 ', '')
        output = Path(f"{slug}-modern.html")
        output.write_text(render_page(heading, subjects), encoding='utf-8')
        produced.add(slug)
        print(f"Generated {output}")

if __name__ == '__main__':
    main()
