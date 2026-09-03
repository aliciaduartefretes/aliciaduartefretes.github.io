import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";

const root=path.resolve(import.meta.dirname,"..");
const prior=path.resolve(root,"..","NALVI-paso-7A-5-parte-2");
const index=fs.readFileSync(path.join(root,"index.html"),"utf8");
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const hash=file=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

const moduleMatch=index.match(/<script type="module" id="gca-gesa-01-firebase">([\s\S]*?)<\/script>/);
assert(moduleMatch,"No se encontró el módulo de Gestión académica.");
const moduleSource=moduleMatch[1];
const loadAcademicSource=moduleSource.slice(moduleSource.indexOf("async function loadAcademic"),moduleSource.indexOf("async function loadOwnInstitutions"));
const handleAuthSource=moduleSource.slice(moduleSource.indexOf("async function handleAuth"),moduleSource.indexOf("try{\n  live=await firebaseReady"));

assert(handleAuthSource.indexOf("await loadAcademic()")<handleAuthSource.indexOf("await loadStudentData(user)"),"La carga académica sigue esperando primero los datos de alumno.");
assert(moduleSource.includes("if(academicLoadPromise)return academicLoadPromise"),"Falta el guard contra cargas académicas paralelas duplicadas.");
for(const collection of ["groups","enrollments","assignments","progress","assessments","certificateRequests","certificates","liveClassrooms"]){
  assert(loadAcademicSource.includes(`scopedDocs(\"${collection}\")`),`Falta la consulta académica ${collection}.`);
}
assert(loadAcademicSource.includes("GESA_ACADEMIC_QUERY_FAILED"),"Las consultas académicas no informan el nombre que falló.");
assert(!/learningEvents|reviewSchedule|\/mastery|baselines/.test(loadAcademicSource),"El panel institucional está consultando Mastery durante esta estabilización.");
assert(handleAuthSource.includes("window.canAccessInstitutional=false"),"El acceso no se revoca mientras se revalida el rol.");

const expectedUnchanged=[
  "firebase/firestore-PASO-6.rules",
  "mastery-engine/mastery-engine.mjs",
  "mastery-engine/mastery-config.json",
  "assets/js/nalvi-general-route-ui.js",
  "assets/js/nalvi-guarani-general-route.js",
  "assets/js/kuaa-general-activities.js",
  "assets/js/kuaa-activity-renderer.js",
  "assets/js/nalvi-ui.js",
  "assets/css/nalvi-design-system.css",
  "assets/css/kuaa-activity-components.css"
];
for(const relative of expectedUnchanged){
  assert(hash(path.join(root,relative))===hash(path.join(prior,relative)),`Se modificó fuera de alcance: ${relative}`);
}
for(const language of ["es","en","pt","fr","it","de"]){
  assert(new RegExp(`\\b${language}:\\{`).test(index),`Falta el idioma de interfaz ${language}.`);
}

let core=moduleSource
  .replace(/^import[^\n]+\n/gm,"")
  .replace("const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));","const sleep=async()=>{};")
  .replace("const ACADEMIC_QUERY_TIMEOUT_MS=15000;","const ACADEMIC_QUERY_TIMEOUT_MS=30;");
core=core.slice(0,core.indexOf("try{\n  live=await firebaseReady"));

const calls=[];
const makeNode=()=>({dataset:{},hidden:false,classList:{add(){},remove(){},toggle(){},contains(){return false}},addEventListener(){},setAttribute(){}});
const institutional=makeNode();
const sandbox={
  console,setTimeout,clearTimeout,URLSearchParams,calls,location:{search:""},
  window:{GESA_SYNC_INSTITUTION_NAV(){},GESA_REPAINT(){},show(id){calls.push(`show:${id}`)}},
  document:{body:{dataset:{}},querySelector(selector){return selector==="#institutional"?institutional:makeNode()},querySelectorAll(){return[]}},
  collection(_db,name){return{type:"collection",name}},
  doc(_db,name,id){return{type:"doc",name,id}},
  where(field,operator,value){return{field,operator,value}},
  query(base,filter){return{...base,filter}},
  getDocs(ref){calls.push(`getDocs:${ref.name}`);return Promise.resolve({docs:[]})},
  getDoc(){return Promise.resolve({exists:()=>false})},
  setDoc(){return Promise.resolve()},addDoc(){return Promise.resolve({id:"test"})},serverTimestamp(){return 0},
  onAuthStateChanged(){},fetch(){throw new Error("not used")},Blob:class{},URL,Map,Set,Promise,Math,Date,JSON,Object,Array,String,Number,Boolean,Error
};
vm.createContext(sandbox);
vm.runInContext(core,sandbox,{filename:"gca-gesa-01-firebase.mjs"});

calls.length=0;
vm.runInContext('context={role:"platform_admin",canManage:true,institutionId:"",institutionIds:[]};currentUser={uid:"admin-1",email:"admin@example.com"};db={};',sandbox);
await vm.runInContext('scopedDocs("groups")',sandbox);
assert(calls.includes("getDocs:groups"),"El administrador no consulta grupos autorizados.");

calls.length=0;
vm.runInContext('context={role:"teacher",canManage:true,institutionId:"inst-1",institutionIds:["inst-1"]};currentUser={uid:"teacher-1",email:"teacher@example.com"};',sandbox);
await vm.runInContext('scopedDocs("progress")',sandbox);
assert(calls.includes("getDocs:progress"),"El profesor no consulta progreso con alcance institucional.");

calls.length=0;
vm.runInContext(`
  resolveContext=async()=>({role:"platform_admin",canManage:true,canHostLive:true,canAdministerInstitution:true,institutionIds:[],institutionId:"",memberships:[]});
  loadAcademic=async()=>{calls.push("academic")};
  loadStudentData=async()=>{calls.push("student")};
  syncUserInstitutionScope=async()=>{};
`,sandbox);
await vm.runInContext('handleAuth({uid:"admin-1",email:"admin@example.com",isAnonymous:false})',sandbox);
assert(calls.indexOf("academic")!==-1&&calls.indexOf("academic")<calls.indexOf("student"),"El administrador sigue bloqueado por una consulta de alumno.");

calls.length=0;
vm.runInContext(`
  resolveContext=async()=>({role:"student",canManage:false,canHostLive:false,canAdministerInstitution:false,institutionIds:[],institutionId:"",memberships:[]});
  loadAcademic=async()=>{calls.push("academic")};
  loadStudentData=async()=>{calls.push("student")};
`,sandbox);
await vm.runInContext('handleAuth({uid:"student-1",email:"student@example.com",isAnonymous:false})',sandbox);
assert(!calls.includes("academic"),"Un alumno obtuvo acceso a la carga académica.");
assert(calls.includes("show:institutions"),"El alumno no fue devuelto a la vista institucional pública.");

vm.runInContext('getDocs=()=>new Promise(()=>{});context={role:"platform_admin",canManage:true,institutionId:"",institutionIds:[]};',sandbox);
let timeoutError=null;
try{await vm.runInContext('scopedDocs("progress")',sandbox)}catch(error){timeoutError=error}
assert(timeoutError?.gesaQuery==="progress (colección completa · admin)","El timeout no identifica la consulta progress.");
assert(timeoutError?.gesaQueryKind==="timeout","El timeout no sale del estado pendiente.");

console.log("OK · Gestión académica estabilizada");
console.log("- admin: carga académica antes de datos de alumno");
console.log("- profesor: consultas limitadas por institutionId");
console.log("- alumno: sin carga académica ni acceso adicional");
console.log("- consulta pendiente: timeout identificado por nombre");
console.log("- Firebase Rules, Mastery, cursos y seis idiomas: conservados");
