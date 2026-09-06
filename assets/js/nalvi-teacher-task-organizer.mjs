/* NALVI teacher task organizer · browser-safe and deterministic. */

export const NALVI_TEACHER_TASK_ORGANIZER_VERSION="NALVI-TEACHER-TASK-ORGANIZER-1";
export const TEACHER_TASK_TEMPLATE_SCHEMA="NALVI-TEACHER-TASK-TEMPLATE-1";

const MAX_QUESTIONS=50;
const MAX_OPTIONS=8;
const SAFE_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CONTROL=/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function exactText(value,max){
  if(typeof value!=="string"||!value.trim()||CONTROL.test(value)||new TextEncoder().encode(value).length>max)throw new TypeError("INVALID_TEACHER_TEXT");
  return value;
}

function exactOptions(value){
  if(value===undefined||value===null)return null;
  if(!Array.isArray(value)||value.length>MAX_OPTIONS)throw new TypeError("INVALID_TEACHER_OPTIONS");
  return value.map(option=>exactText(option,2000));
}

function hex(buffer){
  return[...new Uint8Array(buffer)].map(value=>value.toString(16).padStart(2,"0")).join("");
}

async function fingerprint(ownerUserId,title,questions){
  const canonical=JSON.stringify({ownerUserId,title,questions:questions.map(({order,question,answer,options})=>({order,question,answer,options}))});
  return hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(canonical)));
}

export async function organizeTeacherTaskDraft(raw,{ownerUserId}){
  if(!raw||Object.getPrototypeOf(raw)!==Object.prototype)throw new TypeError("INVALID_TASK_MATERIAL");
  if(typeof ownerUserId!=="string"||!SAFE_ID.test(ownerUserId))throw new TypeError("AUTH_REQUIRED");
  const allowed=new Set(["title","questions","templateId","previousVersion"]);
  if(Reflect.ownKeys(raw).some(key=>typeof key!=="string"||!allowed.has(key)))throw new TypeError("INVALID_TASK_MATERIAL");
  const title=exactText(raw.title,240);
  if(!Array.isArray(raw.questions)||raw.questions.length<1||raw.questions.length>MAX_QUESTIONS)throw new TypeError("INVALID_TASK_QUESTIONS");
  const questions=raw.questions.map((entry,index)=>{
    if(!entry||Object.getPrototypeOf(entry)!==Object.prototype)throw new TypeError("INVALID_TASK_QUESTION");
    const order=index+1;
    if(entry.order!==undefined&&entry.order!==order)throw new TypeError("INVALID_TASK_ORDER");
    return{order,question:exactText(entry.question,4000),answer:exactText(entry.answer,2000),options:exactOptions(entry.options)};
  });
  const previousVersion=raw.previousVersion===undefined?0:raw.previousVersion;
  if(!Number.isSafeInteger(previousVersion)||previousVersion<0||previousVersion>9999)throw new TypeError("INVALID_TASK_VERSION");
  const sourceFingerprint=await fingerprint(ownerUserId,title,questions);
  const templateId=raw.templateId===undefined?`teacher-task-${sourceFingerprint.slice(0,24)}`:exactText(raw.templateId,128);
  if(!SAFE_ID.test(templateId))throw new TypeError("INVALID_TASK_ID");
  const version=previousVersion+1,reviewItems=[];
  const cards=questions.map(entry=>{
    const reasons=[];
    if(entry.options!==null){
      if(entry.options.length<2)reasons.push("AT_LEAST_TWO_OPTIONS_REQUIRED");
      if(new Set(entry.options).size!==entry.options.length)reasons.push("DUPLICATE_OPTIONS");
      if(!entry.options.includes(entry.answer))reasons.push("ANSWER_NOT_IN_OPTIONS");
    }
    if(reasons.length)reviewItems.push({order:entry.order,reasons});
    return{cardId:`${templateId}:v${version}:${entry.order}`,order:entry.order,activityType:entry.options===null?"INDEPENDENT_RECALL":reasons.length?null:"CONTEXT_CHOICE",question:entry.question,answer:entry.answer,options:entry.options===null?null:[...entry.options],contentSource:"teacher-provided"};
  });
  return{schemaVersion:TEACHER_TASK_TEMPLATE_SCHEMA,templateId,version,previousVersion,ownerUserId,title,status:reviewItems.length?"needs_manual_review":"draft",reusable:true,canPublish:false,canAssign:false,masteryEligible:false,contentPolicy:"exact-teacher-content-only",sourceFingerprint,review:{required:true,items:reviewItems},cards};
}

export const __test={fingerprint};
