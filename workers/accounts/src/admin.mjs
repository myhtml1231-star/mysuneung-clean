import {fail,hash,privateJSON,readBody} from './security.mjs';
import {integer,text} from './records.mjs';

const DEFAULT_ADMIN_HASHES=new Set([
 '8a2156da2b182b6e55de37c99e02dee8d093bddff8d2c040bd8d274658dbc7e3'
]);
const DAY=86400000;

async function adminHashes(env){
 const extra=String(env.ADMIN_EMAIL_HASHES||'').split(',').map(x=>x.trim()).filter(Boolean);
 return new Set([...DEFAULT_ADMIN_HASHES,...extra]);
}
async function assertAdmin(s,env){
 const role=await env.DB.prepare('SELECT role,granted_at FROM admin_accounts WHERE account_id=?').bind(s.account_id).first();
 if(role)return {id:s.account_id,email:s.email,name:s.display_name||'관리자',role:role.role};
 // Compatibility fallback for pre-RBAC deployments; production owner lives in admin_accounts.
 const email=String(s.email||'').trim().toLowerCase(),digest=await hash('mysuneung-admin-v1:'+email);
 if(!(await adminHashes(env)).has(digest))fail(403,'ADMIN_REQUIRED','관리자 권한이 필요합니다.');
 return {id:s.account_id,email:s.email,name:s.display_name||'관리자',role:'admin'};
}
const safeJSON=v=>{try{return JSON.parse(v);}catch{return null;}};
const pct=(a,b)=>b?Math.round(a/b*100):0;
const isoDay=ms=>new Date(ms+9*3600000).toISOString().slice(0,10);

function typeRows(map,minTotal=1){
 return [...map.values()].filter(x=>x.total>=minTotal).map(x=>({...x,accuracy:pct(x.correct,x.total)}))
  .sort((a,b)=>a.accuracy-b.accuracy||b.wrong-a.wrong||b.total-a.total||a.label.localeCompare(b.label,'ko'));
}
function analyzeAttempts(rows){
 const global=new Map(),users=new Map(),seen=new Set();
 for(const row of rows){
  const data=safeJSON(row.data);if(!data||!Array.isArray(data.details))continue;
  let u=users.get(row.account_id);
  if(!u){u={account_id:row.account_id,email:row.email,name:row.display_name||'',attempts:0,latest_at:0,recent:[],types:new Map(),seen:new Set()};users.set(row.account_id,u);}
  u.attempts++;u.latest_at=Math.max(u.latest_at,Number(data.at||row.updated_at||0));u.recent.push({at:Number(data.at||row.updated_at||0),percent:Number(data.percent||0)});
  for(const d of data.details){
   if(!d||d.analysis_eligible!==true||!d.question_key||!d.type_id)continue;
   const uniq=row.account_id+':'+d.question_key;if(seen.has(uniq))continue;seen.add(uniq);u.seen.add(d.question_key);
   const label=(d.type_group||'기타')+' · '+(d.question_type||'기타');
   for(const m of [global,u.types]){
    let x=m.get(d.type_id);if(!x){x={type_id:d.type_id,label,type_group:d.type_group||'기타',question_type:d.question_type||'기타',total:0,correct:0,wrong:0};m.set(d.type_id,x);}
    x.total++;if(d.is_correct)x.correct++;else x.wrong++;
   }
  }
 }
 const globalTypes=typeRows(global,1);
 const userRows=[...users.values()].map(u=>{
  u.recent.sort((a,b)=>b.at-a.at);const recent=u.recent.slice(0,5),types=typeRows(u.types,2);
  return {account_id:u.account_id,email:u.email,name:u.name,attempts:u.attempts,distinct_questions:u.seen.size,latest_at:u.latest_at,
   recent_accuracy:recent.length?Math.round(recent.reduce((s,x)=>s+x.percent,0)/recent.length):0,
   weaknesses:types.filter(x=>x.wrong>=2&&x.accuracy<70).slice(0,3)};
 }).sort((a,b)=>b.latest_at-a.latest_at);
 return {sample_attempts:rows.length,global_types:globalTypes,priority_types:globalTypes.filter(x=>x.total>=5&&x.wrong>=2&&x.accuracy<75).slice(0,8),users:userRows};
}
async function attemptRows(env,limit=5000,account=''){
 const sql=account
  ? `SELECT r.account_id,r.data,r.updated_at,a.email,a.display_name FROM account_records r JOIN accounts a ON a.id=r.account_id WHERE r.kind='attempt' AND r.deleted=0 AND r.account_id=? ORDER BY r.updated_at ASC LIMIT ?`
  : `SELECT r.account_id,r.data,r.updated_at,a.email,a.display_name FROM account_records r JOIN accounts a ON a.id=r.account_id WHERE r.kind='attempt' AND r.deleted=0 ORDER BY r.updated_at ASC LIMIT ?`;
 return (await (account?env.DB.prepare(sql).bind(account,limit):env.DB.prepare(sql).bind(limit)).all()).results||[];
}
async function audit(env,admin,action,target='',detail={}){
 await env.DB.prepare('INSERT INTO admin_audit(admin_account_id,action,target_account_id,detail,created_at) VALUES(?,?,?,?,?)')
  .bind(admin.id,action,target||null,JSON.stringify(detail||{}),Date.now()).run();
}
async function summary(env){
 const now=Date.now(),today=isoDay(now);
 const [accounts,disabled,sessions,attempts,recent,loginsToday,loginUsers7,tracking,visitors]=await Promise.all([
  env.DB.prepare('SELECT COUNT(*) AS n FROM accounts').first(),
  env.DB.prepare('SELECT COUNT(*) AS n FROM accounts WHERE disabled=1').first(),
  env.DB.prepare('SELECT COUNT(*) AS n FROM account_sessions WHERE expires_at>?').bind(now).first(),
  env.DB.prepare("SELECT COUNT(*) AS n FROM account_records WHERE kind='attempt' AND deleted=0").first(),
  env.DB.prepare("SELECT COUNT(*) AS n FROM account_records WHERE kind='attempt' AND deleted=0 AND updated_at>=?").bind(now-7*DAY).first(),
  env.DB.prepare('SELECT COUNT(*) AS n,COUNT(DISTINCT account_id) AS users FROM account_login_events WHERE logged_in_at>=?').bind(Date.parse(today+'T00:00:00+09:00')).first(),
  env.DB.prepare('SELECT COUNT(DISTINCT account_id) AS n FROM account_login_events WHERE logged_in_at>=?').bind(now-7*DAY).first(),
  env.DB.prepare('SELECT MIN(logged_in_at) AS at,SUM(CASE WHEN source=\'session_backfill\' THEN 1 ELSE 0 END) AS backfilled FROM account_login_events').first(),
  env.DB.prepare('SELECT COUNT(*) AS n FROM visitor_daily WHERE day=? AND counted>0').bind(today).first()
 ]);
 const learning=analyzeAttempts(await attemptRows(env,1500));
 return {accounts:accounts?.n||0,disabled:disabled?.n||0,active_sessions:sessions?.n||0,attempts:attempts?.n||0,attempts_7d:recent?.n||0,
  logins_today:loginsToday?.n||0,login_users_today:loginsToday?.users||0,login_users_7d:loginUsers7?.n||0,visitors_today:visitors?.n||0,
  login_tracking_since:tracking?.at||null,login_backfilled_sessions:tracking?.backfilled||0,priority_types:learning.priority_types.slice(0,4)};
}
async function activity(env,days=14){
 const now=Date.now(),start=now-(days-1)*DAY;
 const [loginRows,signupRows,visitorRows]=await Promise.all([
  env.DB.prepare("SELECT date(logged_in_at/1000,'unixepoch','+9 hours') AS day,COUNT(*) AS logins,COUNT(DISTINCT account_id) AS users FROM account_login_events WHERE logged_in_at>=? GROUP BY day").bind(start).all(),
  env.DB.prepare("SELECT date(created_at/1000,'unixepoch','+9 hours') AS day,COUNT(*) AS signups FROM accounts WHERE created_at>=? GROUP BY day").bind(start).all(),
  env.DB.prepare('SELECT day,COUNT(*) AS visitors FROM visitor_daily WHERE first_seen>=? AND counted>0 GROUP BY day').bind(start).all()
 ]);
 const by={};for(let i=days-1;i>=0;i--){const d=isoDay(now-i*DAY);by[d]={day:d,logins:0,users:0,signups:0,visitors:0};}
 for(const r of loginRows.results||[])if(by[r.day])Object.assign(by[r.day],{logins:r.logins,users:r.users});
 for(const r of signupRows.results||[])if(by[r.day])by[r.day].signups=r.signups;
 for(const r of visitorRows.results||[])if(by[r.day])by[r.day].visitors=r.visitors;
 return {days:Object.values(by)};
}
async function listAccounts(request,env){
 const u=new URL(request.url),q=text(u.searchParams.get('q')||'',100).toLowerCase(),status=u.searchParams.get('status')||'all';
 const limit=integer(u.searchParams.get('limit'),1,100,30),offset=integer(u.searchParams.get('offset'),0,1000000,0),where=[],bind=[];
 if(q){where.push('(lower(a.email) LIKE ? OR lower(a.display_name) LIKE ?)');bind.push('%'+q+'%','%'+q+'%');}
 if(status==='active')where.push('a.disabled=0');else if(status==='disabled')where.push('a.disabled=1');
 const clause=where.length?' WHERE '+where.join(' AND '):'';
 const count=(await env.DB.prepare('SELECT COUNT(*) AS n FROM accounts a'+clause).bind(...bind).first())?.n||0;
 const sql=`SELECT a.id,a.email,a.display_name,a.auth_provider,a.disabled,a.created_at,a.updated_at,
  COALESCE((SELECT MAX(updated_at) FROM account_records r WHERE r.account_id=a.id),a.updated_at) AS last_activity,
  (SELECT COUNT(*) FROM account_records r WHERE r.account_id=a.id AND r.deleted=0) AS record_count,
  (SELECT COUNT(*) FROM account_records r WHERE r.account_id=a.id AND r.kind='attempt' AND r.deleted=0) AS attempt_count,
  (SELECT COUNT(*) FROM account_sessions s WHERE s.account_id=a.id AND s.expires_at>?) AS session_count,
  (SELECT COUNT(*) FROM account_login_events e WHERE e.account_id=a.id) AS login_count,
  (SELECT MAX(logged_in_at) FROM account_login_events e WHERE e.account_id=a.id) AS last_login_at
  FROM accounts a${clause} ORDER BY COALESCE(last_login_at,last_activity) DESC LIMIT ? OFFSET ?`;
 const rows=(await env.DB.prepare(sql).bind(Date.now(),...bind,limit,offset).all()).results||[];
 return {total:count,limit,offset,accounts:rows.map(x=>({...x,disabled:!!x.disabled}))};
}
async function accountDetail(id,env){
 const account=await env.DB.prepare(`SELECT a.id,a.email,a.display_name,a.auth_provider,a.disabled,a.created_at,a.updated_at,
  (SELECT COUNT(*) FROM account_login_events e WHERE e.account_id=a.id) AS login_count,
  (SELECT MAX(logged_in_at) FROM account_login_events e WHERE e.account_id=a.id) AS last_login_at
  FROM accounts a WHERE a.id=?`).bind(id).first();
 if(!account)fail(404,'ACCOUNT_NOT_FOUND','계정을 찾지 못했습니다.');
 const [counts,sessions,logins,attempts]=await Promise.all([
  env.DB.prepare('SELECT kind,COUNT(*) AS count,MAX(updated_at) AS latest FROM account_records WHERE account_id=? AND deleted=0 GROUP BY kind').bind(id).all(),
  env.DB.prepare('SELECT created_at,expires_at,device_label FROM account_sessions WHERE account_id=? AND expires_at>? ORDER BY created_at DESC LIMIT 20').bind(id,Date.now()).all(),
  env.DB.prepare('SELECT logged_in_at,auth_provider,device_label,session_expires_at,source FROM account_login_events WHERE account_id=? ORDER BY logged_in_at DESC LIMIT 30').bind(id).all(),
  attemptRows(env,500,id)
 ]);
 const learning=analyzeAttempts(attempts);
 const recent=attempts.slice(-20).reverse().map(r=>{const d=safeJSON(r.data)||{};return {id:d.id||'',at:d.at||r.updated_at,mode:d.mode||'',score:d.score||0,total:d.total||0,percent:d.percent||0,unanswered:d.unanswered||0};});
 return {account:{...account,disabled:!!account.disabled},counts:counts.results||[],sessions:sessions.results||[],logins:logins.results||[],
  learning:{priority_types:learning.global_types.filter(x=>x.total>=2&&x.wrong>=2&&x.accuracy<75).slice(0,6),distinct_questions:learning.users[0]?.distinct_questions||0,attempts:learning.users[0]?.attempts||0,recent_accuracy:learning.users[0]?.recent_accuracy||0},recent_attempts:recent};
}
async function auditList(request,env){
 const u=new URL(request.url),limit=integer(u.searchParams.get('limit'),1,200,80);
 const rows=(await env.DB.prepare(`SELECT l.id,l.action,l.target_account_id,l.detail,l.created_at,a.email AS admin_email,t.email AS target_email
  FROM admin_audit l LEFT JOIN accounts a ON a.id=l.admin_account_id LEFT JOIN accounts t ON t.id=l.target_account_id ORDER BY l.id DESC LIMIT ?`).bind(limit).all()).results||[];
 return {logs:rows.map(x=>({...x,detail:safeJSON(x.detail)||{}}))};
}

async function adminInquiries(request,env){
 const u=new URL(request.url),limit=integer(u.searchParams.get('limit'),1,200,100);
 const rows=(await env.DB.prepare(`SELECT id,title,author,content,privacy,date_label,created_at,answer,answered,answered_at,source
  FROM community_inquiries ORDER BY created_at DESC LIMIT ?`).bind(limit).all()).results||[];
 return rows.map(x=>({id:x.id,title:x.title,author:x.author||'익명',content:x.content,privacy:x.privacy,date:x.date_label||'',created_at:x.created_at,answer:x.answer||'',answered:!!x.answered,answered_at:x.answered_at||null,source:x.source}));
}
async function adminChat(request,env){
 const u=new URL(request.url),limit=integer(u.searchParams.get('limit'),1,300,120);
 const rows=(await env.DB.prepare(`SELECT m.id,m.user_id,m.author,m.content,m.created_at,m.source,u.disabled AS user_disabled
  FROM community_chat_messages m LEFT JOIN community_chat_users u ON u.id=m.user_id
  ORDER BY m.created_at DESC LIMIT ?`).bind(limit).all()).results||[];
 return rows.map(x=>({...x,user_disabled:!!x.user_disabled}));
}
async function reportsList(request,env){
 if(!env.REPORTS)fail(503,'REPORTS_UNAVAILABLE','오류 신고 저장소가 연결되지 않았습니다.');
 const u=new URL(request.url),q=text(u.searchParams.get('q')||'',120),status=text(u.searchParams.get('status')||'',30),where=[],bind=[];
 if(['pending','in_progress','resolved'].includes(status)){where.push('status=?');bind.push(status);}
 if(q){where.push('(nickname LIKE ? OR content LIKE ? OR source_page LIKE ? OR admin_note LIKE ?)');const like='%'+q+'%';bind.push(like,like,like,like);}
 let sql='SELECT id,type,nickname,content,source_page,status,admin_note,created_at,updated_at FROM reports';if(where.length)sql+=' WHERE '+where.join(' AND ');sql+=' ORDER BY created_unix DESC LIMIT 300';
 const rows=(await env.REPORTS.prepare(sql).bind(...bind).all()).results||[];
 const stats=await env.REPORTS.prepare("SELECT COUNT(*) total,SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pending,SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) in_progress,SUM(CASE WHEN status='resolved' THEN 1 ELSE 0 END) resolved FROM reports").first();
 return {reports:rows,stats:stats||{}};
}

export async function handleAdminRoute(request,env,s,subroute,method){
 const admin=await assertAdmin(s,env);
 if(subroute==='me'&&method==='GET')return privateJSON({ok:true,admin});
 if(subroute==='summary'&&method==='GET')return privateJSON({ok:true,...await summary(env)});
 if(subroute==='activity'&&method==='GET')return privateJSON({ok:true,...await activity(env,integer(new URL(request.url).searchParams.get('days'),7,31,14))});
 if(subroute==='accounts'&&method==='GET')return privateJSON({ok:true,...await listAccounts(request,env)});
 if(subroute==='learning'&&method==='GET')return privateJSON({ok:true,...analyzeAttempts(await attemptRows(env,5000))});
 if(subroute==='audit'&&method==='GET')return privateJSON({ok:true,...await auditList(request,env)});
 if(subroute==='reports'&&method==='GET')return privateJSON({ok:true,...await reportsList(request,env)});

 const detail=subroute.match(/^accounts\/([-a-zA-Z0-9_.:]{1,160})$/);
 if(detail&&method==='GET')return privateJSON({ok:true,...await accountDetail(detail[1],env)});
 const status=subroute.match(/^accounts\/([-a-zA-Z0-9_.:]{1,160})\/status$/);
 if(status&&method==='POST'){
  const body=await readBody(request,4000);if(typeof body.disabled!=='boolean')fail(400,'BAD_STATUS','계정 상태를 확인해 주세요.');
  if(status[1]===admin.id&&body.disabled)fail(409,'ADMIN_SELF_DISABLE','현재 관리자 계정은 이용정지할 수 없습니다.');
  const target=await env.DB.prepare('SELECT id,email,disabled FROM accounts WHERE id=?').bind(status[1]).first();if(!target)fail(404,'ACCOUNT_NOT_FOUND','계정을 찾지 못했습니다.');
  await env.DB.prepare('UPDATE accounts SET disabled=?,updated_at=? WHERE id=?').bind(body.disabled?1:0,Date.now(),target.id).run();
  if(body.disabled)await env.DB.prepare('DELETE FROM account_sessions WHERE account_id=?').bind(target.id).run();
  await audit(env,admin,body.disabled?'account_disable':'account_enable',target.id,{reason:text(body.reason,200)});
  return privateJSON({ok:true,id:target.id,disabled:body.disabled});
 }
 const logout=subroute.match(/^accounts\/([-a-zA-Z0-9_.:]{1,160})\/logout$/);
 if(logout&&method==='POST'){
  if(logout[1]===admin.id)fail(409,'ADMIN_SELF_LOGOUT','현재 관리자 세션은 여기서 종료하지 않습니다.');
  const target=await env.DB.prepare('SELECT id FROM accounts WHERE id=?').bind(logout[1]).first();if(!target)fail(404,'ACCOUNT_NOT_FOUND','계정을 찾지 못했습니다.');
  const out=await env.DB.prepare('DELETE FROM account_sessions WHERE account_id=?').bind(target.id).run();
  await audit(env,admin,'account_logout',target.id,{sessions:Number(out.meta?.changes||0)});
  return privateJSON({ok:true,id:target.id,sessions:Number(out.meta?.changes||0)});
 }

 if(subroute==='community/inquiries'&&method==='GET')return privateJSON({ok:true,inquiries:await adminInquiries(request,env)});
 if(subroute==='community/chat'&&method==='GET')return privateJSON({ok:true,messages:await adminChat(request,env)});
 const answer=subroute.match(/^community\/inquiries\/([-a-zA-Z0-9_.:]{1,160})\/answer$/);
 if(answer&&method==='POST'){
  const body=await readBody(request,12000),value=text(body.answer,5000);if(!value)fail(400,'ANSWER_REQUIRED','답변을 입력해 주세요.');
  const out=await env.DB.prepare('UPDATE community_inquiries SET answer=?,answered=1,answered_at=? WHERE id=?').bind(value,Date.now(),answer[1]).run();
  if(!Number(out.meta?.changes||0))fail(404,'INQUIRY_NOT_FOUND','문의를 찾지 못했습니다.');
  await audit(env,admin,'inquiry_answer','',{document_id:answer[1]});return privateJSON({ok:true});
 }
 const delInquiry=subroute.match(/^community\/inquiries\/([-a-zA-Z0-9_.:]{1,160})\/delete$/);
 if(delInquiry&&method==='POST'){
  const out=await env.DB.prepare('DELETE FROM community_inquiries WHERE id=?').bind(delInquiry[1]).run();
  if(!Number(out.meta?.changes||0))fail(404,'INQUIRY_NOT_FOUND','문의를 찾지 못했습니다.');
  await audit(env,admin,'inquiry_delete','',{document_id:delInquiry[1]});return privateJSON({ok:true});
 }
 const delChat=subroute.match(/^community\/chat\/([-a-zA-Z0-9_.:]{1,160})\/delete$/);
 if(delChat&&method==='POST'){
  const out=await env.DB.prepare('DELETE FROM community_chat_messages WHERE id=?').bind(delChat[1]).run();
  if(!Number(out.meta?.changes||0))fail(404,'CHAT_NOT_FOUND','채팅 메시지를 찾지 못했습니다.');
  await audit(env,admin,'chat_delete','',{document_id:delChat[1]});return privateJSON({ok:true});
 }

 const report=subroute.match(/^reports\/(\d+)$/);
 if(report&&method==='POST'){
  if(!env.REPORTS)fail(503,'REPORTS_UNAVAILABLE','오류 신고 저장소가 연결되지 않았습니다.');
  const body=await readBody(request,8000),status=text(body.status,30),note=text(body.admin_note,2000);
  if(!['pending','in_progress','resolved'].includes(status))fail(400,'BAD_STATUS','처리 상태를 확인해 주세요.');
  const out=await env.REPORTS.prepare('UPDATE reports SET status=?,admin_note=?,updated_at=? WHERE id=?').bind(status,note,new Date().toISOString(),Number(report[1])).run();
  if(!Number(out.meta?.changes||0))fail(404,'REPORT_NOT_FOUND','오류 신고를 찾지 못했습니다.');
  await audit(env,admin,'report_update','',{report_id:Number(report[1]),status});return privateJSON({ok:true});
 }
 const delReport=subroute.match(/^reports\/(\d+)\/delete$/);
 if(delReport&&method==='POST'){
  if(!env.REPORTS)fail(503,'REPORTS_UNAVAILABLE','오류 신고 저장소가 연결되지 않았습니다.');
  const out=await env.REPORTS.prepare('DELETE FROM reports WHERE id=?').bind(Number(delReport[1])).run();
  if(!Number(out.meta?.changes||0))fail(404,'REPORT_NOT_FOUND','오류 신고를 찾지 못했습니다.');
  await audit(env,admin,'report_delete','',{report_id:Number(delReport[1])});return privateJSON({ok:true});
 }
 fail(404,'ADMIN_NOT_FOUND','관리자 기능을 찾지 못했습니다.');
}
