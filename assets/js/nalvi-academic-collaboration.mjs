/* NALVI academic collaboration · Firestore adapter with institution/class isolation. */

export const NALVI_ACADEMIC_COLLABORATION_VERSION="NALVI-ACADEMIC-COLLABORATION-1";

export const ACADEMIC_COLLABORATION_LIMITS=Object.freeze({
  teacherMessage:1200,
  postTitle:160,
  postBody:4000,
  reply:1000
});

const POST_TYPES=new Set(["question","activity"]);
const AUDIENCES=new Set(["class","institution"]);
const ACTIVITY_TYPES=new Set(["CONTEXT_CHOICE","INDEPENDENT_RECALL",null]);

function text(value,{field,min=0,max}){
  if(typeof value!=="string")throw new TypeError(`${field}_MUST_BE_STRING`);
  const normalized=value.trim();
  if(normalized.length<min)throw new TypeError(`${field}_TOO_SHORT`);
  if(normalized.length>max)throw new TypeError(`${field}_TOO_LONG`);
  return normalized;
}

function integer(value,{field,min,max}){
  if(!Number.isInteger(value)||value<min||value>max)throw new TypeError(`${field}_INVALID`);
  return value;
}

function requiredId(value,field){
  return text(value,{field,min:1,max:240});
}

function dueDate(value){
  if(value===null||value===undefined||value==="")return null;
  if(value instanceof Date){
    if(Number.isNaN(value.getTime()))throw new TypeError("ASSIGNMENT_DUE_AT_INVALID");
    return value;
  }
  if(typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)){
    const parsed=new Date(`${value}T23:59:59.999Z`);
    if(!Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===value)return parsed;
  }
  if(typeof value==="object"&&typeof value.toDate==="function")return value;
  throw new TypeError("ASSIGNMENT_DUE_AT_INVALID");
}

function exactText(value,{field,min=0,max}){
  if(typeof value!=="string")throw new TypeError(`${field}_MUST_BE_STRING`);
  if(value.trim().length<min)throw new TypeError(`${field}_TOO_SHORT`);
  if(value.length>max)throw new TypeError(`${field}_TOO_LONG`);
  return value;
}

function exactCard(card,index){
  if(!card||Object.getPrototypeOf(card)!==Object.prototype)throw new TypeError(`CARD_${index}_INVALID`);
  const allowed=new Set(["cardId","order","activityType","question","answer","options","contentSource"]);
  if(Object.keys(card).some(key=>!allowed.has(key)))throw new TypeError(`CARD_${index}_UNKNOWN_FIELD`);
  if(!ACTIVITY_TYPES.has(card.activityType))throw new TypeError(`CARD_${index}_ACTIVITY_TYPE_INVALID`);
  const options=card.options===null?null:Array.isArray(card.options)?card.options.map((option,optionIndex)=>exactText(option,{field:`CARD_${index}_OPTION_${optionIndex}`,min:1,max:500})):(()=>{throw new TypeError(`CARD_${index}_OPTIONS_INVALID`)})();
  if(options&&options.length>8)throw new TypeError(`CARD_${index}_OPTIONS_INVALID`);
  return{
    cardId:requiredId(card.cardId,`CARD_${index}_ID`),
    order:integer(card.order,{field:`CARD_${index}_ORDER`,min:1,max:50}),
    activityType:card.activityType,
    question:exactText(card.question,{field:`CARD_${index}_QUESTION`,min:1,max:1000}),
    answer:exactText(card.answer,{field:`CARD_${index}_ANSWER`,min:1,max:500}),
    options:options===null?null:[...options],
    contentSource:card.contentSource==="teacher-provided"?card.contentSource:(()=>{throw new TypeError(`CARD_${index}_CONTENT_SOURCE_INVALID`)})()
  };
}

function exactReview(review,cardCount){
  if(!review||Object.getPrototypeOf(review)!==Object.prototype||review.required!==true||!Array.isArray(review.items)||review.items.length>50)throw new TypeError("TEMPLATE_REVIEW_INVALID");
  const items=review.items.map((item,index)=>{
    if(!item||Object.getPrototypeOf(item)!==Object.prototype||Object.keys(item).some(key=>!["order","reasons"].includes(key))||!Array.isArray(item.reasons)||item.reasons.length>10)throw new TypeError(`REVIEW_ITEM_${index}_INVALID`);
    return{order:integer(item.order,{field:`REVIEW_ITEM_${index}_ORDER`,min:1,max:Math.max(1,cardCount)}),reasons:item.reasons.map((reason,reasonIndex)=>exactText(reason,{field:`REVIEW_ITEM_${index}_REASON_${reasonIndex}`,min:1,max:200}))};
  });
  if(items.some((item,index)=>item.order!==index+1))throw new TypeError("TEMPLATE_REVIEW_ORDER_INVALID");
  return{required:true,items};
}

function exactOrganizerTemplate(template,ownerUid){
  if(!template||Object.getPrototypeOf(template)!==Object.prototype)throw new TypeError("TASK_TEMPLATE_INVALID");
  const allowed=new Set(["schemaVersion","templateId","version","previousVersion","ownerUserId","title","status","reusable","canPublish","canAssign","masteryEligible","contentPolicy","sourceFingerprint","review","cards"]);
  if(Object.keys(template).some(key=>!allowed.has(key)))throw new TypeError("TASK_TEMPLATE_UNKNOWN_FIELD");
  if(template.schemaVersion!=="NALVI-TEACHER-TASK-TEMPLATE-1")throw new TypeError("TASK_TEMPLATE_SCHEMA_INVALID");
  const knownStatus=["draft","needs_manual_review","approved","archived"].includes(template.status),assignable=template.status==="approved";
  if(!knownStatus||template.reusable!==true||template.canPublish!==assignable||template.canAssign!==assignable||template.masteryEligible!==false||template.contentPolicy!=="exact-teacher-content-only")throw new TypeError("TASK_TEMPLATE_POLICY_INVALID");
  if(template.ownerUserId!==ownerUid)throw new TypeError("TASK_TEMPLATE_OWNER_INVALID");
  if(!Array.isArray(template.cards)||template.cards.length<1||template.cards.length>50)throw new TypeError("TEMPLATE_CARDS_INVALID");
  const cards=template.cards.map(exactCard),orders=cards.map(card=>card.order);
  if(new Set(orders).size!==orders.length||orders.some((order,index)=>order!==index+1))throw new TypeError("TEMPLATE_SOURCE_ORDER_INVALID");
  const previousVersion=template.previousVersion===null?null:integer(template.previousVersion,{field:"PREVIOUS_VERSION",min:0,max:999999});
  return{
    schemaVersion:template.schemaVersion,
    templateId:requiredId(template.templateId,"TEMPLATE_ID"),
    version:integer(template.version,{field:"TEMPLATE_VERSION",min:1,max:1000000}),
    previousVersion,
    ownerUserId:ownerUid,
    title:exactText(template.title,{field:"TEMPLATE_TITLE",min:2,max:160}),
    status:template.status,
    reusable:true,
    canPublish:assignable,
    canAssign:assignable,
    masteryEligible:false,
    contentPolicy:template.contentPolicy,
    sourceFingerprint:/^[a-f0-9]{64}$/.test(template.sourceFingerprint)?template.sourceFingerprint:(()=>{throw new TypeError("SOURCE_FINGERPRINT_INVALID")})(),
    review:exactReview(template.review,cards.length),
    cards
  };
}

function identity(firebase){
  const user=firebase?.auth?.currentUser;
  if(!user||user.isAnonymous)throw new Error("ACADEMIC_SIGN_IN_REQUIRED");
  const rawName=typeof user.displayName==="string"?user.displayName.trim():"";
  return{
    uid:requiredId(user.uid,"USER_ID"),
    email:text(user.email||"",{field:"USER_EMAIL",min:3,max:160}).toLowerCase(),
    name:rawName.length>=2&&rawName.length<=120?rawName:"Usuario NALVI"
  };
}

function assertFirebase(firebase){
  const required=["collection","doc","addDoc","getDoc","setDoc","updateDoc","deleteDoc","query","where","orderBy","limit","onSnapshot","serverTimestamp"];
  if(!firebase?.db||!firebase?.auth||required.some(key=>typeof firebase[key]!=="function"))throw new TypeError("ACADEMIC_FIREBASE_ADAPTER_REQUIRED");
  return firebase;
}

export function buildTeacherMessage({institutionId,authorId,authorName,body,timestamp}){
  return{
    institutionId:requiredId(institutionId,"INSTITUTION_ID"),
    authorId:requiredId(authorId,"AUTHOR_ID"),
    authorName:text(authorName,{field:"AUTHOR_NAME",min:2,max:120}),
    body:text(body,{field:"MESSAGE_BODY",min:1,max:ACADEMIC_COLLABORATION_LIMITS.teacherMessage}),
    createdAt:timestamp,
    updatedAt:timestamp
  };
}

export function buildAcademicPost({institutionId,groupId="",audience,postType,authorId,authorName,title="",body,timestamp}){
  if(!AUDIENCES.has(audience))throw new TypeError("ACADEMIC_AUDIENCE_INVALID");
  if(!POST_TYPES.has(postType))throw new TypeError("ACADEMIC_POST_TYPE_INVALID");
  const cleanInstitutionId=requiredId(institutionId,"INSTITUTION_ID");
  if(audience==="institution"&&cleanInstitutionId.startsWith("self__"))throw new TypeError("PERSONAL_TEACHER_CLASS_AUDIENCE_ONLY");
  const cleanGroupId=audience==="class"?requiredId(groupId,"GROUP_ID"):"";
  return{
    institutionId:cleanInstitutionId,
    groupId:cleanGroupId,
    audience,
    postType,
    authorId:requiredId(authorId,"AUTHOR_ID"),
    authorName:text(authorName,{field:"AUTHOR_NAME",min:2,max:120}),
    title:text(title,{field:"POST_TITLE",max:ACADEMIC_COLLABORATION_LIMITS.postTitle}),
    body:text(body,{field:"POST_BODY",min:1,max:ACADEMIC_COLLABORATION_LIMITS.postBody}),
    status:"published",
    createdAt:timestamp,
    updatedAt:timestamp
  };
}

export function buildAcademicReply({authorId,authorName,body,timestamp}){
  return{
    authorId:requiredId(authorId,"AUTHOR_ID"),
    authorName:text(authorName,{field:"AUTHOR_NAME",min:2,max:120}),
    body:text(body,{field:"REPLY_BODY",min:1,max:ACADEMIC_COLLABORATION_LIMITS.reply}),
    createdAt:timestamp,
    updatedAt:timestamp
  };
}

export function buildTeacherTaskTemplate({institutionId,ownerUid,template,timestamp}){
  if(!["draft","needs_manual_review"].includes(template?.status))throw new TypeError("TASK_TEMPLATE_INITIAL_STATUS_INVALID");
  return{
    institutionId:requiredId(institutionId,"INSTITUTION_ID"),
    ownerUid:requiredId(ownerUid,"OWNER_UID"),
    template:exactOrganizerTemplate(template,ownerUid),
    createdAt:timestamp,
    updatedAt:timestamp
  };
}

export function buildTeacherTaskAssignment({institutionId,groupId,templateDocumentId,template,title,instructions="",assignedByUid,dueAt=null,timestamp}){
  return{
    institutionId:requiredId(institutionId,"INSTITUTION_ID"),
    groupId:requiredId(groupId,"GROUP_ID"),
    templateDocumentId:requiredId(templateDocumentId,"TEMPLATE_DOCUMENT_ID"),
    templateId:requiredId(template.templateId,"TEMPLATE_ID"),
    templateVersion:integer(template.version,{field:"TEMPLATE_VERSION",min:1,max:1000000}),
    sourceFingerprint:/^[a-f0-9]{64}$/.test(template.sourceFingerprint)?template.sourceFingerprint:(()=>{throw new TypeError("SOURCE_FINGERPRINT_INVALID")})(),
    cardsSnapshot:template.cards.map(exactCard),
    assignedByUid:requiredId(assignedByUid,"ASSIGNED_BY_UID"),
    title:text(title,{field:"ASSIGNMENT_TITLE",min:2,max:160}),
    instructions:text(instructions,{field:"ASSIGNMENT_INSTRUCTIONS",max:1200}),
    status:"assigned",
    assignedAt:timestamp,
    dueAt:dueDate(dueAt)
  };
}

export function buildTaskSubmission({institutionId,groupId,assignmentId,studentId,studentName,status,answers,timestamp}){
  if(!["in_progress","completed"].includes(status))throw new TypeError("SUBMISSION_STATUS_INVALID");
  if(!Array.isArray(answers)||answers.length>50)throw new TypeError("SUBMISSION_ANSWERS_INVALID");
  const exactAnswers=answers.map((answer,index)=>{
    if(!answer||Object.getPrototypeOf(answer)!==Object.prototype||Object.keys(answer).some(key=>!["order","response","correct"].includes(key)))throw new TypeError(`SUBMISSION_ANSWER_${index}_INVALID`);
    if(typeof answer.correct!=="boolean")throw new TypeError(`SUBMISSION_ANSWER_${index}_CORRECT_INVALID`);
    return{order:integer(answer.order,{field:`SUBMISSION_ANSWER_${index}_ORDER`,min:1,max:50}),response:exactText(answer.response,{field:`SUBMISSION_ANSWER_${index}_RESPONSE`,max:2000}),correct:answer.correct};
  });
  const orders=exactAnswers.map(answer=>answer.order);
  if(new Set(orders).size!==orders.length||orders.some((order,index)=>order!==index+1))throw new TypeError("SUBMISSION_ANSWER_ORDER_INVALID");
  return{
    institutionId:requiredId(institutionId,"INSTITUTION_ID"),
    groupId:requiredId(groupId,"GROUP_ID"),
    assignmentId:requiredId(assignmentId,"ASSIGNMENT_ID"),
    studentId:requiredId(studentId,"STUDENT_ID"),
    studentName:text(studentName,{field:"STUDENT_NAME",min:2,max:120}),
    status,
    correctCount:exactAnswers.filter(answer=>answer.correct).length,
    totalCount:exactAnswers.length,
    answers:exactAnswers,
    updatedAt:timestamp,
    completedAt:status==="completed"?timestamp:null
  };
}

function unsubscribeFrom(firebase,reference,onItems,onError){
  if(typeof onItems!=="function")throw new TypeError("ACADEMIC_SUBSCRIBER_REQUIRED");
  return firebase.onSnapshot(reference,snapshot=>{
    const items=snapshot.docs.map(item=>({id:item.id,...item.data()}));
    onItems(items);
  },error=>onError?.(error));
}

export function createAcademicCollaborationService(adapter){
  const firebase=assertFirebase(adapter);
  const timestamp=()=>firebase.serverTimestamp();

  async function ensureTeacherChannel(institutionId){
    const user=identity(firebase),id=requiredId(institutionId,"INSTITUTION_ID");
    if(id.startsWith("self__"))throw new TypeError("PERSONAL_TEACHER_HAS_NO_INSTITUTION_CHANNEL");
    const reference=firebase.doc(firebase.db,"academicTeacherChannels",id),snapshot=await firebase.getDoc(reference);
    if(!snapshot.exists())await firebase.setDoc(reference,{institutionId:id,channelType:"institution_teachers",createdBy:user.uid,createdAt:timestamp()});
    return reference;
  }

  async function sendTeacherMessage({institutionId,body}){
    const user=identity(firebase),channel=await ensureTeacherChannel(institutionId),now=timestamp();
    return firebase.addDoc(firebase.collection(channel,"messages"),buildTeacherMessage({institutionId,authorId:user.uid,authorName:user.name,body,timestamp:now}));
  }

  function subscribeTeacherMessages(institutionId,onItems,onError){
    identity(firebase);const id=requiredId(institutionId,"INSTITUTION_ID"),channel=firebase.doc(firebase.db,"academicTeacherChannels",id);
    const messages=firebase.query(firebase.collection(channel,"messages"),firebase.orderBy("createdAt","desc"),firebase.limit(80));
    return unsubscribeFrom(firebase,messages,onItems,onError);
  }

  async function editTeacherMessage({institutionId,messageId,body}){
    identity(firebase);const cleanBody=text(body,{field:"MESSAGE_BODY",min:1,max:ACADEMIC_COLLABORATION_LIMITS.teacherMessage});
    return firebase.updateDoc(firebase.doc(firebase.db,"academicTeacherChannels",requiredId(institutionId,"INSTITUTION_ID"),"messages",requiredId(messageId,"MESSAGE_ID")),{body:cleanBody,updatedAt:timestamp()});
  }

  async function deleteTeacherMessage({institutionId,messageId}){
    identity(firebase);return firebase.deleteDoc(firebase.doc(firebase.db,"academicTeacherChannels",requiredId(institutionId,"INSTITUTION_ID"),"messages",requiredId(messageId,"MESSAGE_ID")));
  }

  async function publishPost(input){
    const user=identity(firebase),now=timestamp(),payload=buildAcademicPost({...input,authorId:user.uid,authorName:user.name,timestamp:now});
    return firebase.addDoc(firebase.collection(firebase.db,"academicPosts"),payload);
  }

  function subscribePosts({institutionId,audience,groupId=""},onItems,onError){
    identity(firebase);const id=requiredId(institutionId,"INSTITUTION_ID");
    if(!AUDIENCES.has(audience))throw new TypeError("ACADEMIC_AUDIENCE_INVALID");
    if(typeof onItems!=="function")throw new TypeError("ACADEMIC_SUBSCRIBER_REQUIRED");
    const cleanGroupId=audience==="class"?requiredId(groupId,"GROUP_ID"):"",constraints=audience==="class"
      ?[firebase.where("institutionId","==",id),firebase.where("audience","==","class"),firebase.where("groupId","==",cleanGroupId),firebase.limit(60)]
      :[firebase.where("institutionId","==",id),firebase.where("audience","==","institution"),firebase.limit(60)];
    const reference=firebase.query(firebase.collection(firebase.db,"academicPosts"),...constraints);
    return firebase.onSnapshot(reference,snapshot=>{
      const items=snapshot.docs.map(item=>({id:item.id,...item.data()})).filter(item=>item.institutionId===id&&item.audience===audience&&(audience!=="class"||item.groupId===cleanGroupId));
      onItems(items);
    },error=>onError?.(error));
  }

  async function editPost({postId,title="",body}){
    identity(firebase);return firebase.updateDoc(firebase.doc(firebase.db,"academicPosts",requiredId(postId,"POST_ID")),{
      title:text(title,{field:"POST_TITLE",max:ACADEMIC_COLLABORATION_LIMITS.postTitle}),
      body:text(body,{field:"POST_BODY",min:1,max:ACADEMIC_COLLABORATION_LIMITS.postBody}),
      updatedAt:timestamp()
    });
  }

  async function deletePost(postId){
    identity(firebase);return firebase.deleteDoc(firebase.doc(firebase.db,"academicPosts",requiredId(postId,"POST_ID")));
  }

  async function replyToPost({postId,body}){
    const user=identity(firebase),now=timestamp(),post=firebase.doc(firebase.db,"academicPosts",requiredId(postId,"POST_ID"));
    return firebase.addDoc(firebase.collection(post,"replies"),buildAcademicReply({authorId:user.uid,authorName:user.name,body,timestamp:now}));
  }

  function subscribeReplies(postId,onItems,onError){
    identity(firebase);const post=firebase.doc(firebase.db,"academicPosts",requiredId(postId,"POST_ID"));
    const replies=firebase.query(firebase.collection(post,"replies"),firebase.orderBy("createdAt","asc"),firebase.limit(100));
    return unsubscribeFrom(firebase,replies,onItems,onError);
  }

  async function editReply({postId,replyId,body}){
    identity(firebase);return firebase.updateDoc(firebase.doc(firebase.db,"academicPosts",requiredId(postId,"POST_ID"),"replies",requiredId(replyId,"REPLY_ID")),{
      body:text(body,{field:"REPLY_BODY",min:1,max:ACADEMIC_COLLABORATION_LIMITS.reply}),
      updatedAt:timestamp()
    });
  }

  async function deleteReply({postId,replyId}){
    identity(firebase);return firebase.deleteDoc(firebase.doc(firebase.db,"academicPosts",requiredId(postId,"POST_ID"),"replies",requiredId(replyId,"REPLY_ID")));
  }

  async function saveTaskTemplate({institutionId,template}){
    const user=identity(firebase),now=timestamp(),payload=buildTeacherTaskTemplate({institutionId,ownerUid:user.uid,template,timestamp:now});
    const reference=await firebase.addDoc(firebase.collection(firebase.db,"teacherTaskTemplates"),payload);
    return{reference,payload};
  }

  function subscribeTaskTemplates({institutionId,ownerOnly=true},onItems,onError){
    const user=identity(firebase),id=requiredId(institutionId,"INSTITUTION_ID");
    if(!ownerOnly)return unsubscribeFrom(firebase,firebase.query(firebase.collection(firebase.db,"teacherTaskTemplates"),firebase.where("institutionId","==",id),firebase.limit(100)),onItems,onError);
    if(typeof onItems!=="function")throw new TypeError("ACADEMIC_SUBSCRIBER_REQUIRED");
    const reference=firebase.query(firebase.collection(firebase.db,"teacherTaskTemplates"),firebase.where("ownerUid","==",user.uid),firebase.limit(100));
    return firebase.onSnapshot(reference,snapshot=>{
      const items=snapshot.docs.map(item=>({id:item.id,...item.data()})).filter(item=>item.institutionId===id);
      onItems(items);
    },error=>onError?.(error));
  }

  async function setTaskTemplateStatus(templateDocumentId,status){
    const user=identity(firebase);
    if(!["approved","archived"].includes(status))throw new TypeError("TEMPLATE_STATUS_INVALID");
    const reference=firebase.doc(firebase.db,"teacherTaskTemplates",requiredId(templateDocumentId,"TEMPLATE_DOCUMENT_ID")),snapshot=await firebase.getDoc(reference);
    if(!snapshot.exists())throw new TypeError("TASK_TEMPLATE_NOT_FOUND");
    const stored=snapshot.data()||{},template=exactOrganizerTemplate(stored.template,stored.ownerUid);
    const reviewed={...template,status,canPublish:status==="approved",canAssign:status==="approved"};
    await firebase.updateDoc(reference,{template:reviewed,updatedAt:timestamp()});
    return{reviewedBy:user.uid,template:reviewed};
  }

  async function assignTask({institutionId,groupId,templateDocumentId,title,instructions="",dueAt=null}){
    const user=identity(firebase),templateReference=firebase.doc(firebase.db,"teacherTaskTemplates",requiredId(templateDocumentId,"TEMPLATE_DOCUMENT_ID")),snapshot=await firebase.getDoc(templateReference);
    if(!snapshot.exists())throw new TypeError("TASK_TEMPLATE_NOT_FOUND");
    const template=snapshot.data()?.template||{};
    if(template.status!=="approved"||template.canAssign!==true)throw new TypeError("TASK_TEMPLATE_NOT_APPROVED");
    const now=timestamp(),payload=buildTeacherTaskAssignment({institutionId,groupId,templateDocumentId,template,title,instructions,assignedByUid:user.uid,dueAt,timestamp:now});
    const reference=await firebase.addDoc(firebase.collection(firebase.db,"teacherTaskAssignments"),payload);
    return{reference,payload};
  }

  function subscribeTaskAssignments({institutionId,groupId},onItems,onError){
    identity(firebase);const id=requiredId(institutionId,"INSTITUTION_ID");
    if(!groupId)return unsubscribeFrom(firebase,firebase.query(firebase.collection(firebase.db,"teacherTaskAssignments"),firebase.where("institutionId","==",id),firebase.limit(100)),onItems,onError);
    if(typeof onItems!=="function")throw new TypeError("ACADEMIC_SUBSCRIBER_REQUIRED");
    const cleanGroupId=requiredId(groupId,"GROUP_ID"),reference=firebase.query(firebase.collection(firebase.db,"teacherTaskAssignments"),firebase.where("institutionId","==",id),firebase.where("groupId","==",cleanGroupId),firebase.limit(100));
    return firebase.onSnapshot(reference,snapshot=>{
      const items=snapshot.docs.map(item=>({id:item.id,...item.data()})).filter(item=>item.institutionId===id);
      onItems(items);
    },error=>onError?.(error));
  }

  async function saveTaskSubmission({assignmentId,status,answers}){
    const user=identity(firebase),id=requiredId(assignmentId,"ASSIGNMENT_ID"),assignmentReference=firebase.doc(firebase.db,"teacherTaskAssignments",id),snapshot=await firebase.getDoc(assignmentReference);
    if(!snapshot.exists())throw new TypeError("TASK_ASSIGNMENT_NOT_FOUND");
    const assignment=snapshot.data()||{},now=timestamp(),studentName=user.name==="Usuario NALVI"?"Estudiante":user.name,payload=buildTaskSubmission({institutionId:assignment.institutionId,groupId:assignment.groupId,assignmentId:id,studentId:user.uid,studentName,status,answers,timestamp:now});
    await firebase.setDoc(firebase.doc(firebase.db,"teacherTaskSubmissions",`${id}__${user.uid}`),payload);
    return payload;
  }

  function subscribeTaskSubmissions({institutionId="",groupId,assignmentId="",studentId=""},onItems,onError){
    identity(firebase);if(typeof onItems!=="function")throw new TypeError("ACADEMIC_SUBSCRIBER_REQUIRED");
    const cleanGroupId=requiredId(groupId,"GROUP_ID"),cleanAssignmentId=assignmentId?requiredId(assignmentId,"ASSIGNMENT_ID"):"",cleanStudentId=studentId?requiredId(studentId,"STUDENT_ID"):"",cleanInstitutionId=institutionId?requiredId(institutionId,"INSTITUTION_ID"):"";
    if(!cleanStudentId&&!cleanInstitutionId)throw new TypeError("INSTITUTION_ID_REQUIRED_FOR_TEACHER_SUBMISSIONS");
    const constraints=cleanStudentId?[firebase.where("studentId","==",cleanStudentId)]:[firebase.where("institutionId","==",cleanInstitutionId),firebase.where("groupId","==",cleanGroupId)],reference=firebase.query(firebase.collection(firebase.db,"teacherTaskSubmissions"),...constraints,firebase.limit(500));
    return firebase.onSnapshot(reference,snapshot=>{
      const items=snapshot.docs.map(item=>({id:item.id,...item.data()})).filter(item=>item.groupId===cleanGroupId&&(!cleanAssignmentId||item.assignmentId===cleanAssignmentId));
      onItems(items);
    },error=>onError?.(error));
  }

  return Object.freeze({
    ensureTeacherChannel,sendTeacherMessage,subscribeTeacherMessages,editTeacherMessage,deleteTeacherMessage,
    publishPost,subscribePosts,editPost,deletePost,replyToPost,subscribeReplies,editReply,deleteReply,
    saveTaskTemplate,subscribeTaskTemplates,setTaskTemplateStatus,assignTask,subscribeTaskAssignments,
    saveTaskSubmission,subscribeTaskSubmissions
  });
}
