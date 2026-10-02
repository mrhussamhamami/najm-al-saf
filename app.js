import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const ready = SUPABASE_URL.startsWith("http") && !SUPABASE_ANON_KEY.includes("ضع-");
const supabase = ready ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const CATS=[
 {id:"discipline",name:"الانضباط",weight:.25,icon:"🧭"},
 {id:"homework",name:"الوظائف",weight:.20,icon:"📚"},
 {id:"memorization",name:"الحفظ",weight:.20,icon:"📖"},
 {id:"participation",name:"المشاركة",weight:.15,icon:"🙋"},
 {id:"attendance",name:"الحضور والالتزام",weight:.10,icon:"🕐"},
 {id:"cooperation",name:"التعاون والسلوك",weight:.10,icon:"🤝"}
];
let state={user:null,profile:null,students:[],categories:[],evaluations:[],notes:[]};

const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
function go(id){document.querySelectorAll(".page").forEach(x=>x.classList.toggle("active",x.id===id));document.querySelectorAll(".nav").forEach(x=>x.classList.toggle("active",x.dataset.go===id));scrollTo({top:0,behavior:"smooth"})}
document.querySelectorAll("[data-go]").forEach(x=>x.onclick=()=>go(x.dataset.go));

function weighted(scores){
 let total=0; for(const c of CATS) total+=(Number(scores[c.id]||0))*c.weight;
 return Math.round(total*10)/10;
}
function scoreForStudent(studentId, evals){
 const relevant=evals.filter(e=>e.student_id===studentId);
 if(!relevant.length) return null;
 const sums=Object.fromEntries(CATS.map(c=>[c.id,0])), counts=Object.fromEntries(CATS.map(c=>[c.id,0]));
 relevant.forEach(e=>{if(sums[e.category_id]!==undefined){sums[e.category_id]+=Number(e.score);counts[e.category_id]++}});
 const scores={}; CATS.forEach(c=>scores[c.id]=counts[c.id]?sums[c.id]/counts[c.id]:0);
 return weighted(scores);
}
function dateRange(kind){
 const now=new Date(); const start=new Date(now);
 if(kind==="week"){const day=(now.getDay()+6)%7;start.setDate(now.getDate()-day)}
 else start.setDate(1);
 start.setHours(0,0,0,0);
 return start.toISOString();
}

async function loadData(){
 const {data:{user}}=await supabase.auth.getUser(); state.user=user;
 if(!user) return showLogin();
 const p=await supabase.from("profiles").select("*").eq("id",user.id).single();
 state.profile=p.data||{full_name:user.email,role:"teacher"};
 $("welcomeName").textContent=state.profile.full_name||user.email;
 const {data:classes}=await supabase.from("classes").select("*").eq("teacher_id",user.id).order("grade");
 const classIds=(classes||[]).map(c=>c.id);
 let students=[];
 if(classIds.length) {const r=await supabase.from("students").select("*").in("class_id",classIds).eq("status","active").order("full_name");students=r.data||[]}
 state.students=students;
 const studentIds=students.map(s=>s.id);
 if(studentIds.length){
   const e=await supabase.from("evaluations").select("*").in("student_id",studentIds).order("created_at",{ascending:false});
   state.evaluations=e.data||[];
   const n=await supabase.from("teacher_notes").select("*").in("student_id",studentIds).order("created_at",{ascending:false});
   state.notes=n.data||[];
 }
 render();
}
function showLogin(){$("login").classList.remove("hidden");$("app").classList.add("hidden")}
function showApp(){$("login").classList.add("hidden");$("app").classList.remove("hidden")}
function render(){
 showApp(); $("studentCount").textContent=state.students.length;
 const values=state.students.map(s=>scoreForStudent(s.id,state.evaluations)).filter(x=>x!==null);
 $("classAvg").textContent=(values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length*10)/10*10:0)+"%";
 const ranks=ranked("week"); $("weekStar").textContent=ranks[0]?.student.full_name||"—";
 const ranksM=ranked("month"); $("monthStar").textContent=ranksM[0]?.student.full_name||"—";
 renderStudents();renderSelect();renderScores();renderRecent();renderStars();renderParent();
}
function ranked(kind){
 const since=dateRange(kind), ids=state.students.map(s=>s.id);
 const ev=state.evaluations.filter(e=>new Date(e.created_at)>=new Date(since));
 return state.students.map(s=>({student:s,score:scoreForStudent(s.id,ev)})).filter(x=>x.score!==null).sort((a,b)=>b.score-a.score);
}
function renderStudents(){
 $("studentList").innerHTML=state.students.length?state.students.map(s=>{
 const score=scoreForStudent(s.id,state.evaluations);
 return `<div class="student card"><div class="avatar">${esc(s.full_name[0])}</div><div class="student-info"><b>${esc(s.full_name)}</b><small>الصف ${esc(s.class_id)}</small></div><span class="score-pill">${score===null?"—":score*10+"%"}</span><button class="primary" onclick="quickEval('${s.id}')">تقييم</button></div>`;
 }).join(""):`<div class="card empty">لا توجد طلاب مرتبطة بحسابك بعد.</div>`;
}
window.quickEval=id=>{go("evaluate");$("studentSelect").value=id}
function renderSelect(){$("studentSelect").innerHTML=state.students.map(s=>`<option value="${s.id}">${esc(s.full_name)}</option>`).join("")}
function renderScores(){
 $("scoreGrid").innerHTML=CATS.map(c=>`<div class="score-item"><label>${c.icon} ${c.name}</label><div class="score-buttons">${[1,2,3,4,5,6,7,8,9,10].map(n=>`<button data-cat="${c.id}" data-score="${n}">${n}</button>`).join("")}</div></div>`).join("");
 document.querySelectorAll(".score-buttons button").forEach(b=>b.onclick=()=>{document.querySelectorAll(`[data-cat="${b.dataset.cat}"]`).forEach(x=>x.classList.remove("selected"));b.classList.add("selected")});
}
async function saveEvaluation(){
 const sid=$("studentSelect").value, note=$("note").value.trim();
 const rows=[];
 for(const c of CATS){const b=document.querySelector(`[data-cat="${c.id}"].selected`);if(!b){$("evalMsg").textContent="اختر درجة لكل مجال من 1 إلى 10.";return}rows.push({student_id:sid,category_id:c.id,score:Number(b.dataset.score),teacher_id:state.user.id})}
 const {error}=await supabase.from("evaluations").insert(rows);
 if(error){$("evalMsg").textContent="تعذر حفظ التقييم: "+error.message;return}
 if(note){const n=await supabase.from("teacher_notes").insert({student_id:sid,teacher_id:state.user.id,note,visible_to_parent:true});if(n.error)$("evalMsg").textContent=n.error.message}
 $("evalMsg").textContent="تم حفظ التقييم بنجاح."; $("note").value="";
 document.querySelectorAll(".score-buttons button").forEach(b=>b.classList.remove("selected"));
 await loadData(); go("dashboard");
}
function renderRecent(){
 const arr=state.evaluations.slice(0,6);
 $("recent").innerHTML=arr.length?arr.map(e=>{const s=state.students.find(x=>x.id===e.student_id);const c=CATS.find(x=>x.id===e.category_id);return `<div class="student card"><div class="avatar">${esc((s?.full_name||"ط")[0])}</div><div class="student-info"><b>${esc(s?.full_name||"طالب")}</b><small>${c?.icon||""} ${c?.name||""}</small></div><span class="score-pill">${e.score}/10</span></div>`}).join(""):`<div class="card empty">لم تسجل تقييمات بعد.</div>`;
}
function renderStars(kind="week"){
 const r=ranked(kind);$("starsContent").innerHTML=r.length?r.map((x,i)=>`<div class="rank card"><span class="medal">${["🥇","🥈","🥉"][i]||"⭐"}</span><div class="grow"><b>${esc(x.student.full_name)}</b><div class="muted">${kind==="week"?"هذا الأسبوع":"هذا الشهر"}</div></div><strong>${x.score*10}%</strong></div>`).join(""):`<div class="card empty">لا توجد تقييمات كافية لهذه الفترة.</div>`;
}
function renderParent(){
 const links=state.students;
 $("parentContent").innerHTML=links.length?links.map(s=>{
 const score=scoreForStudent(s.id,state.evaluations); const notes=state.notes.filter(n=>n.student_id===s.id&&n.visible_to_parent);
 return `<div class="card parent-card"><div class="avatar big">${esc(s.full_name[0])}</div><h2>${esc(s.full_name)}</h2><p class="muted">ملف متابعة الطالب</p><div class="parent-score"><span>التقييم الحالي</span><strong>${score===null?"—":score*10+"%"}</strong></div><div class="metrics">${CATS.map(c=>`<div class="metric">${c.icon} ${c.name}<b>—/10</b></div>`).join("")}</div><h3>ملاحظات المعلم</h3><div class="notes">${notes.length?notes.map(n=>`<div>${esc(n.note)}</div>`).join(""):"لا توجد ملاحظات منشورة لولي الأمر."}</div></div>`
 }).join(""):`<div class="card empty">لا توجد بيانات لعرضها.</div>`;
}

$("loginBtn").onclick=async()=>{
 if(!ready){$("loginMsg").textContent="أولًا ضع بيانات Supabase في config.js.";return}
 $("loginMsg").textContent="جارٍ تسجيل الدخول...";
 const {error}=await supabase.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});
 $("loginMsg").textContent=error?error.message:"";
 if(!error) await loadData();
};
$("logoutBtn").onclick=async()=>{await supabase.auth.signOut();showLogin()};
$("saveEval").onclick=saveEvaluation;
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");renderStars(b.dataset.tab)});

if(ready){
 supabase.auth.onAuthStateChange((_event,session)=>{if(session) loadData(); else showLogin()});
 loadData();
}else showLogin();
