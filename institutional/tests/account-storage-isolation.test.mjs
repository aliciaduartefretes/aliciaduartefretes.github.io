import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const index=await readFile(new URL("../../index.html",import.meta.url),"utf8");
const academic=await readFile(new URL("../../assets/js/nalvi-academic-studio.js",import.meta.url),"utf8");
const notifications=await readFile(new URL("../../assets/js/nalvi-notification-center.js",import.meta.url),"utf8");

function storageApi(initial={}){
  const values=new Map(Object.entries(initial));
  const localStorage={
    getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key)
  };
  const start=index.indexOf('const NALVI_GUEST_STORAGE_ID="guest";');
  const end=index.indexOf("let state=readCourseProgress(null);",start);
  assert.ok(start>0&&end>start,"account storage helpers must be present");
  const context=vm.createContext({window:{},localStorage,console,JSON,Object,Array,Number,String,Set,CustomEvent:class CustomEvent{}});
  vm.runInContext(index.slice(start,end),context);
  return{api:context.window,values};
}

test("course progress is isolated by Firebase UID while legacy data belongs only to the guest",()=>{
  const legacy=JSON.stringify({xp:1629,lives:5,done:[0,1,2]});
  const {api,values}=storageApi({guaraniAliPro:legacy});
  const alicia={uid:"uid-alicia",isAnonymous:false};
  const revision={uid:"uid-revision",isAnonymous:false};

  assert.equal(api.NALVI_USER_STORAGE_KEY("guaraniAliPro",alicia),"guaraniAliPro.v2.uid-alicia");
  assert.equal(api.NALVI_READ_COURSE_PROGRESS(null).xp,1629);
  assert.equal(api.NALVI_READ_COURSE_PROGRESS(alicia).xp,0);
  assert.equal(api.NALVI_READ_COURSE_PROGRESS(revision).xp,0);
  const unsaved=api.NALVI_READ_COURSE_PROGRESS(alicia);unsaved.done.push(99);
  assert.deepEqual([...api.NALVI_READ_COURSE_PROGRESS(alicia).done],[]);

  values.set(api.NALVI_USER_STORAGE_KEY("guaraniAliPro",alicia),JSON.stringify({xp:1629,done:[0]}));
  values.set(api.NALVI_USER_STORAGE_KEY("guaraniAliPro",revision),JSON.stringify({xp:30,done:[]}));
  assert.equal(api.NALVI_READ_COURSE_PROGRESS(alicia).xp,1629);
  assert.equal(api.NALVI_READ_COURSE_PROGRESS(revision).xp,30);
});

test("auth switching reloads scoped progress and cloud records carry an owner",()=>{
  assert.match(index,/window\.setCourseUser=user=>\{window\.currentCourseUser=user\|\|null;switchCourseProgressUser\(user\)/);
  assert.match(index,/progressOwnerUid:activeUser\.uid,progressSchemaVersion:2/);
  assert.match(index,/wrongOwner=!!remote\.progressOwnerUid&&remote\.progressOwnerUid!==user\.uid/);
  assert.match(index,/LEGACY_CROSS_ACCOUNT_REPAIRS=new Set\(\["revision\.guaraniconali@gmail\.com"\]\)/);
  assert.match(index,/window\.NALVI_RESET_COURSE_PROGRESS\?\.\(user\)/);
  assert.doesNotMatch(index,/localStorage\.setItem\("guaraniAliPro",JSON\.stringify\(state\)\)/);
});

test("practice, assessments, course library, and academic workspace use the active account key",()=>{
  for(const marker of [
    'window.NALVI_USER_STORAGE_KEY?.("gcaPracticeStats")',
    'scopedStudentKey("gcaGesaAssessments")',
    "scopedLifeKey(LIFE_KEY)",
    "nalvi:account-storage-changed"
  ])assert.match(index,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  assert.match(index,/window\.NALVI_USER_STORAGE_KEY\?\.\(ACTIVE_ACADEMIC_INSTITUTION_KEY,user\)/);
  assert.match(academic,/window\.NALVI_USER_STORAGE_KEY\?\.\(ACTIVE_INSTITUTION_KEY,currentUser\(\)\)/);
  assert.match(notifications,/window\.NALVI_USER_STORAGE_KEY\?\.\("nalviAcademicInstitution\.v1",user\)/);
});
