import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";

const root=path.resolve(import.meta.dirname,"..");
const index=fs.readFileSync(path.join(root,"index.html"),"utf8");
const nalviUi=fs.readFileSync(path.join(root,"assets/js/nalvi-ui.js"),"utf8");
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
  assert(loadAcademicSource.includes(`scopedDocs("${collection}")`),`Falta la consulta académica ${collection}.`);
}
assert(loadAcademicSource.includes("GESA_ACADEMIC_QUERY_FAILED"),"Las consultas académicas no informan el nombre que falló.");
assert(!/learningEvents|reviewSchedule|\/mastery|baselines/.test(loadAcademicSource),"El panel institucional está consultando Mastery de forma incompatible.");
assert(handleAuthSource.includes("window.canAccessInstitutional=false"),"El acceso no se revoca mientras se revalida el rol.");

const protectedHashes={
  "firebase/firestore-PASO-6.rules":"4856ea2a489ca04bd6f8fa6d1d703ff6479bac73fdd45db68cee861982cdb732",
  "firebase/database-GESA.rules.json":"0a4d88e249411959a4e6d8ca6832218caf123371f8e4d292314e5c806f137abd",
  "knowledge-base/pilot-corpus.json":"a99be7bc2ce61a240f3be279a812597f1a1b9806f6d3d7e173675fc00b8e6918",
  "grammar-engine/grammar-engine.mjs":"e5995f92393afbe687e81ec6fa72df2d5253e9102c27ce007b9f0e8733496c42",
  "grammar-engine/compiled-knowledge.json":"d69be97bd5af0941021c3d51b6f6275132d913738725f61053aa2d1f35601d7b",
  "mastery-engine/mastery-engine.mjs":"22fbbba1b8e22a0f3737a53e1b356b5aab98212ad692f9b55a07ec12dff3b5cb",
  "mastery-engine/mastery-config.json":"e16b77e821d37d00a8e5d5c8e3a348d1a678c6d781555ead15e88568bb9deb01",
  "assets/js/nalvi-general-route-ui.js":"776a752364e9abbdb668c9f77379bae7bb5bb5da7880ebee79e0abaa20cf9eab",
  "assets/js/nalvi-guarani-general-route.js":"99473f05673ed896cbadbe69626990f9f1d8aaaa7322547d9678bb40400ec233",
  "assets/js/kuaa-general-activities.js":"f4aa2098eaece6b79c0f5ceebfc07754749de905b8b1d32568a8166e7a668975",
  "assets/js/kuaa-activity-renderer.js":"e280bc9f2e882955aeeb44d1a12ed7f298a4faf0dd47ef2d59cfff3540bf50e6",
  "assets/css/kuaa-activity-components.css":"111f62f3bed7a09479e78f6a72151581995f5059416372b5e8ae9e3d137a4f6b"
};
for(const [relative,expectedHash] of Object.entries(protectedHashes)){
  assert(hash(path.join(root,relative))===expectedHash,`Se modificó fuera de alcance: ${relative}`);
}

for(const language of ["es","en","pt","fr","it","de"]){
  assert(new RegExp(`\\b${language}:\\{`).test(index),`Falta el idioma de interfaz ${language}.`);
}
for(const authSymbol of ["signInWithPopup","signInWithRedirect","signInAnonymously","onAuthStateChanged"]){
  assert(index.includes(authSymbol),`Falta la integración de autenticación ${authSymbol}.`);
}
for(const preservedId of ["xp","lives","catalog","institutional"]){
  assert(index.includes(`id="${preservedId}"`),`Falta la interfaz conservada ${preservedId}.`);
}
assert(index.includes("data-nalvi-boot=\"booting\""),"Falta BOOTING en el documento inicial.");
assert(nalviUi.includes("nalvi:ready"),"Falta la transición READY.");
assert(!index.includes("OPENAI_API_KEY"),"Se expuso o conectó una clave de OpenAI.");

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
  CustomEvent:class CustomEvent{constructor(type,init={}){this.type=type;this.detail=init.detail}},
  window:{GESA_SYNC_INSTITUTION_NAV(){},GESA_REPAINT(){},show(id){calls.push(`show:${id}`)},dispatchEvent(){}},
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

console.log(JSON.stringify({
  status:"PASS",
  authentication:"preserved",
  languages:["es","en","pt","fr","it","de"],
  roles:{admin:"authorized",teacher:"institution-scoped",student:"denied"},
  academicPanel:"compatible-with-existing-schema",
  firebaseRulesChanged:false,
  knowledgeGrammarMasteryChanged:false,
  openAIConnected:false,
  paso7BStarted:false
},null,2));
