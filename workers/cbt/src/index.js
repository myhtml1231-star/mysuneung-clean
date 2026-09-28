import * as Study from "./study-core.mjs";
import * as Learning from "./learning-core.mjs";
const LEARNING_DATA_KEY = "learning/question-types-20260927-v1.json";
let learningMetadataCache = null;
let catalogCache = null;
let answersCache = null;
let categoriesCache = null;
let questionTypesCache = null;

const CATEGORY_GROUPS = [
  { area: "독서론", categories: ["독서론"] },
  { area: "비문학", categories: ["인문", "사회", "과학", "기술", "예술"] },
  { area: "문학", categories: ["현대시", "고전시가", "현대소설", "고전소설", "판소리·민속극", "복합문학"] },
  { area: "선택", categories: ["화법과 작문", "언어와 매체"] }
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/mixed-cbt" || url.pathname === "/mixed-cbt/" || url.pathname === "/mixed-cbt.html") {
      const obj = await env.CBT.get("app/cbt.html");
      if (!obj) return new Response("CBT app missing", { status: 500 });
      return new Response(obj.body, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, max-age=0",
          "X-Content-Type-Options": "nosniff"
        }
      });
    }

    if (url.pathname === "/api/cbt/health") {
      return json({ ok: true, service: "mysuneung-cbt", grading: true, taxonomy: true, learning_version: Learning.LEARNING_VERSION });
    }

    if (url.pathname === "/api/cbt/learning-meta") {
      if (request.method !== "GET") return json({error:"Method not allowed"},405);
      try { return json(await learningMeta(env),200,{"Cache-Control":"no-store"}); }
      catch(e) { console.error(e);return json({error:"학습 분류 정보를 불러오지 못했습니다."},500); }
    }
    if (url.pathname === "/api/cbt/categories") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      try {
        return await categoryInfo(env);
      } catch (e) {
        console.error(e);
        return json({ error: "분류 정보를 불러오지 못했습니다." }, 500);
      }
    }

    if (url.pathname === "/api/cbt/generate") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      try {
        return await generateExam(request, env);
      } catch (e) {
        console.error(e);
        return json({ error: "시험 생성 중 오류가 발생했습니다." }, 500);
      }
    }

    if (url.pathname === "/api/cbt/submit") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      try {
        return await gradeExam(request, env);
      } catch (e) {
        console.error(e);
        return json({ error: "채점 중 오류가 발생했습니다." }, 500);
      }
    }

    if (url.pathname.startsWith("/cbt-data/")) {
      const key = decodeURIComponent(url.pathname.slice("/cbt-data/".length));
      if (!key || key.includes("..")) return new Response("Not found", { status: 404 });
      const obj = await env.CBT.get(key);
      if (!obj) return new Response("Not found", { status: 404 });
      const headers = new Headers();
      headers.set("Content-Type", contentType(key));
      headers.set("Cache-Control", key.endsWith(".json") ? "no-store, max-age=0" : "public, max-age=31536000, immutable");
      headers.set("X-Content-Type-Options", "nosniff");
      if (obj.httpEtag) headers.set("ETag", obj.httpEtag);
      return new Response(obj.body, { headers });
    }

    return new Response("Not found", { status: 404 });
  }
};

async function getCatalog(env) {
  if (catalogCache) return catalogCache;
  const obj = await env.CBT.get("catalog.json");
  if (!obj) throw new Error("catalog missing");
  catalogCache = JSON.parse(await obj.text());
  return catalogCache;
}

async function getAnswers(env) {
  if (answersCache) return answersCache;
  const obj = await env.CBT.get("answers.json");
  if (!obj) throw new Error("answers missing");
  answersCache = JSON.parse(await obj.text());
  return answersCache;
}

async function getCategories(env) {
  if (categoriesCache) return categoriesCache;
  const obj = await env.CBT.get("categories.json");
  if (!obj) throw new Error("categories missing");
  const parsed = JSON.parse(await obj.text());
  categoriesCache = parsed.units || {};
  return categoriesCache;
}

async function getQuestionTypes(env) {
  if (questionTypesCache) return questionTypesCache;
  const obj = await env.CBT.get(LEARNING_DATA_KEY);
  if (!obj) throw new Error("question types missing");
  const parsed = JSON.parse(await obj.text());
  questionTypesCache = parsed.questions || {};
  return questionTypesCache;
}

async function enrichedCatalog(env) {
  const catalog = await getCatalog(env);
  const categories = await getCategories(env);
  return catalog.map(function (row) {
    const meta = categories[row.id];
    if (!meta) throw new Error("category missing: " + row.id);
    return Object.assign({}, row, meta);
  });
}

async function categoryInfo(env) {
  const rows = await enrichedCatalog(env);
  const counts = {};
  for (const row of rows) counts[row.category] = (counts[row.category] || 0) + 1;
  return json({
    ok: true,
    groups: CATEGORY_GROUPS.map(function (g) {
      return {
        area: g.area,
        categories: g.categories.map(function (name) {
          return { name: name, unit_count: counts[name] || 0 };
        }).filter(function (x) { return x.unit_count > 0; })
      };
    })
  }, 200, { "Cache-Control": "public, max-age=300" });
}

async function generateExam(request, env) {
  const body = await request.json().catch(function () { return {}; });
  const mode = body.mode === "custom" ? "custom" : "full";
  const choice = body.choice === "lm" ? "lm" : "hw";
  const requestedYears = Array.isArray(body.years)
    ? body.years.map(Number).filter(function (y) { return y >= 2017 && y <= 2027; })
    : [2022, 2023, 2024, 2025, 2026, 2027];
  const years = requestedYears.length ? Array.from(new Set(requestedYears)) : [2022, 2023, 2024, 2025, 2026, 2027];

  const allRows = (await enrichedCatalog(env)).filter(function (x) { return years.includes(x.year); });
  const questionTypes = await getQuestionTypes(env);
  const learning = await prepareLearning(body, questionTypes, env);
  if (learning.error) return json({error:learning.error},400);
  if (mode === "full" && learning.targets.length) return json({error:"특정 유형 연습은 맞춤 출제에서 선택해 주세요."},400);
  const pick = (pool,target)=>learning.requested ? Learning.chooseExact(pool,target,learning.index,learning.weights,learning.recent) : exactRandomSubset(pool,target);
  let selected = [];
  let selectedCategories = [];
  let legacyFormat = false;

  if (mode === "full") {
    const hasCurrentFormatYear = years.some(function (y) { return y >= 2022; });
    if (!hasCurrentFormatYear) {
      const groups = {};
      allRows.filter(function (x) { return x.section_code === "full"; }).forEach(function (row) {
        const k = row.year + "-" + row.month;
        (groups[k] || (groups[k] = [])).push(row);
      });
      const complete = Object.values(groups).filter(function (rows) {
        return rows.reduce(function (n, x) { return n + Number(x.question_count || 0); }, 0) === 45;
      });
      if (!complete.length) {
        return json({ error: "선택한 이전 체제 학년도에서 45문항 시험을 구성할 수 없습니다." }, 400);
      }
      if (learning.active) {
        const ranked=complete.map(rows=>({rows,score:rows.reduce((n,r)=>n+Learning.rowWeight(r,learning.index,learning.weights,learning.recent),0)/Math.max(1,rows.length)+Math.random()*.2})).sort((a,b)=>b.score-a.score);
        selected=ranked[0].rows.slice();
      } else selected = complete[crypto.getRandomValues(new Uint32Array(1))[0] % complete.length].slice();
      selected.sort(function (a,b) {
        const ma = String(a.id).match(/q(\d+)-/), mb = String(b.id).match(/q(\d+)-/);
        return Number(ma ? ma[1] : 0) - Number(mb ? mb[1] : 0);
      });
      legacyFormat = true;
    } else {
      const theory = pick(allRows.filter(function (x) { return x.area === "독서론"; }), 3);
      const nonfiction = pick(allRows.filter(function (x) { return x.area === "비문학"; }), 14);
      const literature = pick(allRows.filter(function (x) { return x.area === "문학"; }), 17);
      const electivePool = allRows.filter(x=>x.section_code===choice||(x.legacy===true&&x.elective_code===choice));
    let elective;
    if (choice === "lm") {
      const grammar = electivePool.filter(r=>(learning.index.get(r.id)||[]).every(q=>r.section_code==='full'||q.no<=39));
      const media = electivePool.filter(r=>r.section_code==='lm'&&(learning.index.get(r.id)||[]).every(q=>q.no>=40));
      const g=pick(grammar,5),m=pick(media,6);elective=g&&m?g.concat(m):null;
    } else elective=pick(electivePool,11);

      if (!theory || !nonfiction || !literature || !elective) {
        return json({ error: "선택한 학년도 범위에서는 수능 구성 45문항을 만들 수 없습니다." }, 400);
      }

      shuffle(theory);
      shuffle(nonfiction);
      shuffle(literature);
      if(choice!=="lm") shuffle(elective);
      selected = theory.concat(nonfiction, literature, elective);
    }
  } else {
    const validCategories = new Set(CATEGORY_GROUPS.flatMap(function (g) { return g.categories; }));
    selectedCategories = Array.isArray(body.categories)
      ? Array.from(new Set(body.categories.map(String).filter(function (c) { return validCategories.has(c); })))
      : [];

    if (!selectedCategories.length) {
      return json({ error: "맞춤 유형을 하나 이상 선택해주세요." }, 400);
    }

    let pool = allRows.filter(function (x) { return selectedCategories.includes(x.category); });
    if (!pool.length) return json({ error: "선택한 조건에 맞는 지문이 없습니다." }, 400);

    let setCount = Number(body.set_count);
    if (!Number.isInteger(setCount)) setCount = 3;
    setCount = Math.max(1, Math.min(5, setCount));
    if(learning.transfer){
      pool=Study.transferCandidates(pool,learning.index,learning.profile?.details,learning.sourceKeys,await getQuestionTypes(env));
      if(!pool.length)return json({error:'이 범위에는 아직 보지 않은 다른 회차 기출이 없습니다. 같은 문제로 대체하지 않았습니다.',code:'NO_FRESH_TRANSFER'},400);
    }
    if (learning.targets.length) {
      const missing=learning.targets.filter(id=>!pool.some(r=>(learning.index.get(r.id)||[]).some(q=>q.eligible&&q.type_id===id)));
      if(missing.length)return json({error:"선택한 학년도·범주에 해당 유형이 없습니다: "+missing.join(", ")},400);
      selected = learning.transfer?Study.selectTransferSets(pool,learning.targets,setCount,learning.index):Learning.selectTargetSets(pool,learning.targets,setCount,learning.index,learning.recent,Math.random,learning.weights);
      if(learning.transfer){
        const uncovered=learning.targets.filter(t=>!selected.some(r=>(learning.index.get(r.id)||[]).some(q=>q.eligible&&q.type_id===t)));
        if(uncovered.length)return json({error:'모든 선택 유형을 담을 새 기출이 부족합니다. 유형 수를 줄여 주세요.',code:'INSUFFICIENT_TARGET_COVERAGE'},400);
        learning.requestedSets=setCount;
      }
      if (!selected.length) return json({error:"선택한 학년도·범주에 분류 근거가 확인된 해당 유형이 없습니다. 학년도를 넓혀 주세요."},400);
    } else if (learning.active) {
      selected = pickWeightedCustom(pool, selectedCategories, setCount, learning);
    } else selected = pickCustomSets(pool, selectedCategories, setCount);
    selected.sort(function (a, b) { return a.order_group - b.order_group; });
  }

  const loaded = await Promise.all(selected.map(async function (row) {
    const obj = await env.CBT.get(row.key);
    if (!obj) throw new Error("unit missing: " + row.key);
    const u = JSON.parse(await obj.text());
    return { row: row, unit: rewriteUnit(u, row.key) };
  }));

  let displayNo = 1;
  const sections = [];
  for (const item of loaded) {
    const row = item.row;
    const u = item.unit;
    const start = displayNo;
    for (const q of u.questions || []) {
      q.display_no = displayNo++;
      const qkey = Number(u.source?.academic_year) + "-" + String(Number(u.source?.month)).padStart(2,"0") + "-" + row.section_code + "-" + String(Number(q.original_no)).padStart(2,"0");
      const qt = questionTypes[qkey] || {};
      q.question_type = qt.type || "기타";
      q.skill = qt.type || "기타";
      q.question_key = qkey;
      q.type_group = Learning.typeGroup(qt);
      q.type_id = qt.type_id || q.type_group + "::" + q.question_type;
      q.review_status = qt.review_status || "needs_review";
      q.analysis_eligible = qt.analysis_eligible === true;
      q.taxonomy_version = Learning.LEARNING_VERSION;
    }
    sections.push({
      id: u.id,
      section_code: row.section_code,
      area: row.area,
      category: row.category,
      order_group: row.order_group,
      display_start: start,
      display_end: displayNo - 1,
      source: {
        academic_year: u.source?.academic_year,
        month: u.source?.month,
        exam_type: u.source?.exam_type,
        section: u.source?.section,
        original_questions: u.source?.original_questions,
        area: row.area,
        category: row.category
      },
      passage: u.passage || { sections: [] },
      questions: u.questions || [],
      assets: u.assets || [],
      force_image_render: !!u.force_image_render,
      original_url: "/cbt-data/originals/" + encodePath(row.key.replace(/unit\.json$/, "original.png"))
    });
  }

  const questionCount = displayNo - 1;
  if (mode === "full" && questionCount !== 45) throw new Error("generated count mismatch: " + questionCount);
  if (questionCount < 1 || questionCount > 45) throw new Error("custom question count invalid: " + questionCount);

  const seconds = mode === "full"
    ? 80 * 60
    : Math.max(5 * 60, Math.ceil((questionCount * 80 * 60 / 45) / 60) * 60);

  return json({
    ok: true,
    exam: {
      id: crypto.randomUUID(),
      generated_at: new Date().toISOString(),
      learning: describeSelection(selected, learning, legacyFormat),
      taxonomy_version: Learning.LEARNING_VERSION,
      subject: "국어",
      mode: mode,
      choice: mode === "full" && !legacyFormat ? choice : null,
      legacy_format: legacyFormat,
      categories: selectedCategories,
      years: years,
      time_limit_seconds: seconds,
      question_count: questionCount,
      common_count: mode === "full" && !legacyFormat ? 34 : null,
      elective_count: mode === "full" && !legacyFormat ? 11 : null,
      composition: mode === "full" ? (legacyFormat ? {
        speaking_writing: 10,
        grammar: 5,
        reading_literature: 30,
        format: "pre-2022"
      } : {
        reading_theory: 3,
        nonfiction: 14,
        literature: 17,
        elective: 11
      }) : null,
      sections: sections
    }
  }, 200, { "Cache-Control": "no-store" });
}

async function gradeExam(request, env) {
  const body = await request.json().catch(function () { return {}; });
  const refs = Array.isArray(body.refs) ? body.refs : [];
  const submitted = body.answers && typeof body.answers === "object" ? body.answers : {};
  if (refs.length < 1 || refs.length > 45) return json({ error: "채점 정보가 올바르지 않습니다." }, 400);

  const seen = new Set();
  for (const r of refs) {
    const n = Number(r.display_no), y = Number(r.academic_year), m = Number(r.month), q = Number(r.original_no);
    const sec = String(r.section_code || "");
    if (!Number.isInteger(n) || n < 1 || n > refs.length || seen.has(n)) return json({ error: "문항 번호가 올바르지 않습니다." }, 400);
    if (!Number.isInteger(y) || y < 2017 || y > 2027) return json({ error: "출처 학년도가 올바르지 않습니다." }, 400);
    if (!Number.isInteger(m) || ![3,5,6,7,9,11].includes(m)) return json({ error: "출처 회차가 올바르지 않습니다." }, 400);
    if (!["common","hw","lm","full"].includes(sec)) return json({ error: "과목 구분이 올바르지 않습니다." }, 400);
    if (!Number.isInteger(q) || q < 1 || q > 45) return json({ error: "원문 문항 번호가 올바르지 않습니다." }, 400);
    seen.add(n);
  }

  const answers = await getAnswers(env);
  const questionTypes = await getQuestionTypes(env);
  const seenQuestions = new Set();
  let correctCount = 0, unansweredCount = 0;
  const details = [];

  for (const r of refs.slice().sort(function (a,b) { return Number(a.display_no) - Number(b.display_no); })) {
    const n = Number(r.display_no);
    const key = Number(r.academic_year) + "-" + String(Number(r.month)).padStart(2,"0") + "-" + r.section_code + "-" + String(Number(r.original_no)).padStart(2,"0");
    if (seenQuestions.has(key)) return json({error:"같은 원문 문항을 중복 제출할 수 없습니다."},400);
    seenQuestions.add(key);
    const correct = Number(answers[key]);
    const qt = questionTypes[key] || {};
    if (!(correct >= 1 && correct <= 5)) throw new Error("answer key missing: " + key);
    const raw = submitted[String(n)] ?? submitted[n];
    const selected = raw == null ? null : Number(raw);
    const validSelected = Learning.answerValue(raw);
    const isCorrect = validSelected === correct;
    if (validSelected == null) unansweredCount++;
    if (isCorrect) correctCount++;
    details.push({
      display_no: n,
      selected: validSelected,
      correct_answer: correct,
      is_correct: isCorrect,
      question_type: qt.type || "기타",
      question_key: key,
      type_group: Learning.typeGroup(qt),
      type_id: qt.type_id || Learning.typeGroup(qt)+"::"+(qt.type||"기타"),
      review_status: qt.review_status || "needs_review",
      analysis_eligible: qt.analysis_eligible === true,
      taxonomy_version: Learning.LEARNING_VERSION,
      skill: qt.skill || "기타",
      area: qt.area || "",
      category: qt.category || "",
      unit_id: qt.unit_id || "",
      original_no: Number(r.original_no),
      academic_year: Number(r.academic_year),
      month: Number(r.month),
      section_code: r.section_code
    });
  }

  const total = refs.length;
  return json({
    ok: true,
    total_count: total,
    correct_count: correctCount,
    wrong_count: total - correctCount - unansweredCount,
    unanswered_count: unansweredCount,
    percent: Math.round((correctCount / total) * 1000) / 10,
    details: details,
    taxonomy_version: Learning.LEARNING_VERSION
  }, 200, { "Cache-Control": "no-store" });
}

function pickCustomSets(pool, categories, setCount) {
  const picked = [];
  const used = new Set();
  const categoryOrder = categories.slice();
  shuffle(categoryOrder);

  // If possible, guarantee at least one passage from each selected category.
  if (categoryOrder.length <= setCount) {
    for (const category of categoryOrder) {
      const group = pool.filter(function (x) { return x.category === category; });
      shuffle(group);
      if (group.length) {
        picked.push(group[0]);
        used.add(group[0].id);
      }
    }
  }

  const remain = pool.filter(function (x) { return !used.has(x.id); });
  shuffle(remain);
  while (picked.length < setCount && remain.length) picked.push(remain.shift());

  if (!picked.length) {
    const fallback = pool.slice();
    shuffle(fallback);
    return fallback.slice(0, Math.min(setCount, fallback.length));
  }
  shuffle(picked);
  return picked;
}

function exactRandomSubset(pool, target) {
  if (!pool.length) return null;
  const items = pool.slice();
  shuffle(items);
  for (let pass = 0; pass < 24; pass++) {
    if (pass) shuffle(items);
    const dp = new Map([[0, []]]);
    for (const item of items) {
      const sums = Array.from(dp.keys()).sort(function (a, b) { return b - a; });
      for (const s of sums) {
        const ns = s + item.question_count;
        if (ns > target || dp.has(ns)) continue;
        dp.set(ns, dp.get(s).concat([item]));
        if (ns === target) return dp.get(ns);
      }
    }
  }
  return null;
}

function hasUnsafeStructuredText(value) {
  if (typeof value === "string") return /[\uE000-\uF8FF\uFFFD]/.test(value);
  if (Array.isArray(value)) return value.some(hasUnsafeStructuredText);
  if (value && typeof value === "object") return Object.values(value).some(hasUnsafeStructuredText);
  return false;
}

function rewriteUnit(u, unitKey) {
  const base = unitKey.replace(/unit\.json$/, "");
  u.force_image_render = hasUnsafeStructuredText(u.passage) || hasUnsafeStructuredText(u.questions);
  const mapAsset = function (a) {
    return (!a || !a.file) ? a : Object.assign({}, a, { url: "/cbt-data/" + encodePath(base + a.file) });
  };
  const assetSort = function (a, b) {
    const ar = Array.isArray(a?.rect) ? a.rect : [0,0,0,0];
    const br = Array.isArray(b?.rect) ? b.rect : [0,0,0,0];
    return Number(a?.page || 0) - Number(b?.page || 0)
      || Number(ar[1] || 0) - Number(br[1] || 0)
      || Number(ar[0] || 0) - Number(br[0] || 0);
  };
  u.assets = (u.assets || []).filter(function (a) { return !isExamHeaderAsset(a); }).map(mapAsset).sort(assetSort);
  const hasPassageVisualAsset = u.assets.some(function (a) { return a && a.target === "passage" && a.url; });
  for (const q of u.questions || []) {
    if (Array.isArray(q.assets)) q.assets = q.assets.map(mapAsset).sort(assetSort);
    const qno = Number(q.original_no);
    const sourceQuestionAssets = u.assets.filter(function (a) {
      return a && a.target === "question" && Number(a.question_no) === qno;
    });
    q.force_image_render = q.force_image_render === true
      || hasUnsafeStructuredText(q)
      || hasPassageVisualAsset
      || sourceQuestionAssets.length > 0
      || (Array.isArray(q.choices) && q.choices.some(function (c) { return !String(c?.text || "").trim(); }))
      || (!q.view_text && typeof q.stem === "string" && /<\s*보기\s*>|〈\s*보기\s*〉/.test(q.stem));
    delete q.source_image_fallback;
  }
  delete u.fallback_image;
  if (u.source) delete u.source.source_pdf;
  return u;
}

function isExamHeaderAsset(a) {
  if (!a || a.page !== 1 || a.target !== "passage" || !Array.isArray(a.rect) || a.rect.length !== 4) return false;
  const x0 = Number(a.rect[0]), y0 = Number(a.rect[1]), x1 = Number(a.rect[2]), y1 = Number(a.rect[3]);
  const w = x1 - x0, h = y1 - y0;
  return x0 >= 330 && x0 <= 345 && y0 >= 150 && y0 <= 158 && w >= 160 && w <= 170 && h >= 40 && h <= 45;
}

function encodePath(s) { return s.split("/").map(encodeURIComponent).join("/"); }

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

function contentType(key) {
  const k = key.toLowerCase();
  if (k.endsWith(".png")) return "image/png";
  if (k.endsWith(".jpg") || k.endsWith(".jpeg")) return "image/jpeg";
  if (k.endsWith(".webp")) return "image/webp";
  if (k.endsWith(".svg")) return "image/svg+xml";
  if (k.endsWith(".json")) return "application/json; charset=utf-8";
  if (k.endsWith(".html")) return "text/html; charset=utf-8";
  return "application/octet-stream";
}

function json(value, status = 200, extra = {}) {
  return new Response(JSON.stringify(value), {
    status: status,
    headers: Object.assign({
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff"
    }, extra)
  });
}

async function learningMeta(env) {
  if (learningMetadataCache) return learningMetadataCache;
  const t = await getQuestionTypes(env);const rows=new Map((await getCatalog(env)).map(r=>[r.id,r]));const questions={};const statuses={};const groups={};
  for(const [key,m] of Object.entries(t)) {
    const g=Learning.typeGroup(m);statuses[m.review_status]=(statuses[m.review_status]||0)+1;
    if(!groups[g])groups[g]=[];if(!groups[g].includes(m.type))groups[g].push(m.type);
    questions[key]={type:m.type,area:m.area,category:m.category,unit_id:m.unit_id,original_no:m.original_no,
      type_group:g,type_id:m.type_id||g+'::'+m.type,analysis_eligible:m.analysis_eligible===true,review_status:m.review_status||'needs_review',
      taxonomy_version:Learning.LEARNING_VERSION,original_url:rows.has(m.unit_id)?"/cbt-data/originals/"+encodePath(rows.get(m.unit_id).key.replace(/unit\.json$/,"original.png")):null,review_note:m.evidence?.adjudication||m.evidence?.matched||'추가 맥락 확인 필요'};
  }
  learningMetadataCache={ok:true,version:Learning.LEARNING_VERSION,study_version:Study.STUDY_VERSION,questions,groups,
    summary:{total:Object.keys(t).length,statuses,pending:Object.values(t).filter(m=>!m.analysis_eligible).length},
    reasons:Learning.REASONS,min_evidence:Learning.MIN_EVIDENCE};
  return learningMetadataCache;
}
async function prepareLearning(body,taxonomy,env) {
  const empty={requested:false,active:false,targets:[],weights:{},recent:new Set(),index:Learning.unitTypeIndex(taxonomy),profile:null};
  if(body.strategy && !['balanced','weakness'].includes(body.strategy))return {...empty,error:'지원하지 않는 추천 방식입니다.'};
  const ids=body.type_ids ?? [];
  const transfer=body.practice_mode==='transfer';
  if(body.practice_mode!==undefined&&!transfer)return {...empty,error:'지원하지 않는 보완 출제 방식입니다.'};
  if(transfer&&body.mode!=='custom')return {...empty,error:'새 기출 보완은 맞춤 풀이에서 시작해 주세요.'};
  if(!Array.isArray(ids)||ids.length>3||ids.some(x=>typeof x!=='string'||x.length>100))return {...empty,error:'유형 선택은 3개 이하로 지정해 주세요.'};
  const valid=new Set(Object.values(taxonomy).filter(m=>m.analysis_eligible).map(m=>m.type_id));
  if(ids.some(id=>!valid.has(id)))return {...empty,error:'분류 근거가 확인되지 않은 유형입니다.'};
  if(body.recent_attempts!==undefined && (!Array.isArray(body.recent_attempts)||body.recent_attempts.length>30))return {...empty,error:'최근 학습 기록은 30회까지 보낼 수 있습니다.'};
  const attempts=body.recent_attempts||[];
  if(attempts.some(a=>!a||!Array.isArray(a.details)||a.details.length>45))return {...empty,error:'학습 기록의 문항 수가 올바르지 않습니다.'};
  const sourceKeys=body.source_question_keys??[];
  if(transfer&&(!ids.length||!Array.isArray(sourceKeys)||!sourceKeys.length||sourceKeys.length>45||sourceKeys.some(k=>typeof k!=='string'||!taxonomy[k]||!ids.includes(taxonomy[k].type_id))))return {...empty,error:'보완의 기준이 될 문항 출처와 유형을 확인해 주세요.'};
  const requested=body.strategy==='weakness';
  const officialAnswers=await getAnswers(env);
  const profile=Learning.buildProfile(attempts,taxonomy,officialAnswers);
  const evidence=Study.studyEvidence(attempts,taxonomy,officialAnswers);
  profile.weights=Object.fromEntries(evidence.types.filter(r=>r.reinforce).map(r=>[r.key,1+Math.min(3,r.error_rate*3)]));
  return {...empty,requested,transfer,sourceKeys:transfer?[...new Set(sourceKeys)]:[],active:requested&&Object.keys(profile.weights).length>0,targets:[...new Set(ids)],
    weights:requested?profile.weights:{},recent:new Set(profile.recent_units),profile};
}
function pickWeightedCustom(pool,categories,count,l) {
  const ranked=pool.map(r=>({r,score:-Math.log(Math.max(1e-12,Math.random()))/Learning.rowWeight(r,l.index,l.weights,l.recent)})).sort((a,b)=>a.score-b.score).map(x=>x.r);
  const out=[],used=new Set();
  if(categories.length<=count)for(const c of categories){const r=ranked.find(r=>r.category===c&&!used.has(r.id));if(r){out.push(r);used.add(r.id);}}
  for(const r of ranked){if(out.length>=count)break;if(!used.has(r.id)){out.push(r);used.add(r.id);}}
  return out;
}
function describeSelection(selected,l,legacy) {
  const wanted=new Set(l.targets.length?l.targets:Object.keys(l.weights));
  const matched=selected.reduce((n,r)=>n+(l.index.get(r.id)||[]).filter(q=>q.eligible&&wanted.has(q.type_id)).length,0);
  const total=selected.reduce((n,r)=>n+r.question_count,0);
  const strategy=l.targets.length?'targeted':l.active&&matched?'weakness':'balanced';
  const repeats=selected.filter(r=>l.recent.has(r.id)).length;
  const note=strategy==='targeted'?'선택 유형이 포함된 지문 세트입니다. 같은 지문의 다른 유형도 함께 출제됩니다.':
    strategy==='weakness'?(legacy?'이전 체제 한 회차를 유지하면서 최근 보완 유형을 반영했습니다.':'문항 구성과 지문 세트를 유지하며 최근 보완 유형의 선택 비중을 높였습니다.'):
    l.requested?'선택 범위에서 추천에 쓸 기록이 부족하여 균형 출제로 구성했습니다.':'균형 출제';
  return {strategy,practice_mode:l.transfer?'transfer':null,source_question_keys:l.transfer?l.sourceKeys:[],
    selected_sets:selected.length,requested_sets:l.requestedSets||null,study_version:Study.STUDY_VERSION,
    requested:l.requested,targets:[...wanted],matched_questions:matched,total_questions:total,repeated_recent_sets:repeats,
    min_evidence:Learning.MIN_EVIDENCE,excluded_types:l.profile?.excluded_types||0,
    note:l.transfer?'최근 30회에 없는 다른 회차 기출 '+selected.length+'지문'+(selected.length<l.requestedSets?' · 조건에 맞는 새 지문만 출제':''):note};
}
