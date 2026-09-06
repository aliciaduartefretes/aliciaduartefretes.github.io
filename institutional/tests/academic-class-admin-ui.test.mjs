import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const academicScript=await readFile(new URL("../../assets/js/nalvi-academic-studio.js",import.meta.url),"utf8");
const index=await readFile(new URL("../../index.html",import.meta.url),"utf8");

function academicApi(){
  const context=vm.createContext({window:{},document:{readyState:"loading",addEventListener(){}},Date,JSON,Error,TypeError,String,Math,Map,Set,Object,Array,Promise,URLSearchParams,setTimeout,clearTimeout,setInterval,clearInterval});
  vm.runInContext(academicScript,context);
  return context.window.NALVI_ACADEMIC_STUDIO;
}

test("empty teacher home offers three clear, separate starting actions",()=>{
  for(const marker of ["Crear mi primera clase","Unirme a una institución","Solicitar una institución","data-summary-create-class","data-empty-join-institution","data-empty-request-institution"])assert.match(academicScript,new RegExp(marker));
  assert.match(academicScript,/openClassCreator\(management\)/);
  assert.match(academicScript,/openInstitutionRequest\(\)/);
});

test("class creation is an exclusive pane and publishes its access data only after persistence",()=>{
  for(const marker of ["dataset.gesaPane=\"class-create\"","nalviClassCreated","data-created-class-qr","data-created-copy-code","data-created-copy-link","data-created-open"])assert.match(academicScript,new RegExp(marker.replace(".","\\.")));
  assert.match(index,/await setDoc\(doc\(db,"courseAccess"/);
  assert.match(index,/new CustomEvent\("nalvi:class-created",\{detail:\{id:ref\.id,name:data\.name,code,url:joinUrl/);
  assert.match(academicScript,/window\.addEventListener\("nalvi:class-created"/);
});

test("class directory has search, active/archive filters and a searchable detail",()=>{
  for(const marker of ["nalviClassSearch","nalviClassFilter","data-class-state","data-class-detail-tab=\"students\"","data-class-detail-tab=\"tasks\"","data-class-detail-tab=\"progress\"","data-class-detail-tab=\"access\"","nalvi-class-student-search"])assert.match(academicScript,new RegExp(marker));
  const api=academicApi();
  assert.equal(api.classStateMatches("active","all"),true);
  assert.equal(api.classStateMatches("active","active"),true);
  assert.equal(api.classStateMatches("archived","active"),false);
});

test("common users request an institution while platform admins approve it atomically",()=>{
  const dashboardBlock=academicScript.match(/function installDashboard\(\)[\s\S]*?function openTool/)?.[0]||"";
  assert.match(dashboardBlock,/installInstitutionRequest\(management,admin\)/);
  assert.doesNotMatch(dashboardBlock,/installInstitutionCreator\(management,admin\)/);
  assert.match(academicScript,/submitInstitutionLead/);
  assert.match(index,/function decideInstitutionRequest\(id,decision\)/);
  assert.match(index,/writeBatch\(db\)/);
  assert.match(index,/institution_teacher_invite/);
  assert.match(index,/status:"approved",institutionId:institutionRef\.id,institutionCode:code/);
  assert.match(index,/if\(context\.role!=="platform_admin"/);
});

test("platform administration is separate, role-gated and counts the complete user directory",()=>{
  for(const marker of ["data-gesa-tab=\"admin-overview\"","data-gesa-pane=\"admin-overview\"","data-platform-only","registeredUsers","enrolledStudents","pendingRequests","nalviAdminSearch"])assert.match(academicScript,new RegExp(marker));
  assert.match(academicScript,/window\.GESA_CONTEXT\?\.role!=="platform_admin"/);
  assert.match(index,/renderAdminOverview\?\.\(\{institutions:cache\.institutions,users:cache\.users,members:cache\.members,groups:cache\.groups,leads:cache\.leads\}\)/);
  assert.match(index,/if\(context\.role==="platform_admin"\)return\(await runNamedQuery\("users \(colección completa · admin\)"/);
  const counts=academicApi().adminCounts({institutions:[{id:"a"},{id:"b"}],users:[{id:"1"},{id:"2"},{id:"3"}],members:[{uid:"t1",role:"teacher",active:true},{uid:"t2",role:"institution_manager",active:true},{uid:"off",role:"teacher",active:false}],groups:[{studentEmails:["a@example.com","b@example.com"],archived:false},{studentEmails:["a@example.com"],archived:true}],leads:[{status:"new"},{status:"approved"}]});
  assert.deepEqual(JSON.parse(JSON.stringify(counts)),{registeredUsers:3,enrolledStudents:2,teachers:2,institutions:2,activeClasses:1,pendingRequests:1});
});

test("new class and administration surfaces include all supported UI languages",()=>{
  for(const locale of ["es","en","pt","fr","it","de"])assert.match(academicScript,new RegExp(`\\b${locale}:\\{classes:`));
  for(const phrase of ["Create my first class","Criar minha primeira turma","Créer ma première classe","Crea la mia prima classe","Meine erste Klasse erstellen"])assert.match(academicScript,new RegExp(phrase));
  assert.match(academicScript,/@media\(max-width:760px\)/);
});

test("academic data publishes stable teacher and student snapshots for collaboration",()=>{
  assert.match(index,/function publishAcademicData\(patch=\{\}\)/);
  assert.match(index,/new CustomEvent\("nalvi:academic-data",\{detail:\{\.\.\.window\.GESA_DATA\}\}\)/);
  assert.match(index,/publishAcademicData\(\{groups:cache\.groups,users:cache\.users,progress:cache\.progress,assignments:cache\.assignments,institutions:cache\.institutions,members:cache\.members,leads:cache\.leads\}\)/);
  assert.match(index,/studentEnrollments:enrollments,studentAssignments:/);
  assert.match(index,/studentEnrollments:\[\],studentAssignments:\[\],studentAssessments:\[\]/);
});
