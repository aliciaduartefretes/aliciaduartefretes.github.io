import {assertFails,assertSucceeds,initializeTestEnvironment} from "@firebase/rules-unit-testing";
import {arrayUnion,collection,deleteDoc,doc,getDoc,getDocs,query,serverTimestamp,setDoc,updateDoc,where} from "firebase/firestore";
import {readFileSync} from "node:fs";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";

const here=dirname(fileURLToPath(import.meta.url));
const testEnv=await initializeTestEnvironment({projectId:"demo-nalvi-academic-collaboration",firestore:{rules:readFileSync(join(here,"firestore-PASO-6.rules"),"utf8")}});
const auth=(uid,name,email)=>testEnv.authenticatedContext(uid,{name,email,firebase:{sign_in_provider:"google.com"}}).firestore();
const message=(uid,name,body="Ñañemongeta mbo’ehára apytépe.")=>({institutionId:"inst-a",authorId:uid,authorName:name,body,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
const post=(overrides={})=>({institutionId:"inst-a",groupId:"class-a",audience:"class",postType:"question",authorId:"teacher-a",authorName:"Docente A",title:"Porandu",body:"¿Mba’éichapa reime?",status:"published",createdAt:serverTimestamp(),updatedAt:serverTimestamp(),...overrides});
const reply=(uid,name,body="Aime porã.")=>({authorId:uid,authorName:name,body,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
const templateShape=(overrides={})=>({schemaVersion:"NALVI-TEACHER-TASK-TEMPLATE-1",templateId:"task-1",version:1,previousVersion:null,ownerUserId:"teacher-a",title:"Preguntas del docente",status:"draft",reusable:true,canPublish:false,canAssign:false,masteryEligible:false,contentPolicy:"exact-teacher-content-only",sourceFingerprint:"a".repeat(64),review:{required:true,items:[]},cards:[{cardId:"card-1",order:1,activityType:"CONTEXT_CHOICE",question:"¿Mba’éichapa reime?",answer:"Aime porã.",options:["Aime porã.","Che réra Ana."],contentSource:"teacher-provided"}],...overrides});
const leadShape=(email,name)=>({name,email,organization:"Instituto Ñe’ẽ",role:"Docencia",studentCount:60,country:"Paraguay",message:"Piloto educativo",status:"new",source:"GCA-GESA-01",createdAt:serverTimestamp()});

try{
  await testEnv.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    await Promise.all([
      setDoc(doc(db,"staff","admin@example.com"),{role:"admin",active:true}),
      setDoc(doc(db,"institutions","inst-a"),{name:"Institución A",organization:true,selfService:false,active:true,status:"active"}),
      setDoc(doc(db,"institutions","inst-b"),{name:"Institución B",organization:true,selfService:false,active:true,status:"active"}),
      setDoc(doc(db,"institutions","self__private-teacher"),{name:"Aula particular",ownerUid:"private-teacher",selfService:true,active:true,status:"active"}),
      setDoc(doc(db,"institutionMembers","inst-a__manager-a"),{institutionId:"inst-a",uid:"manager-a",email:"manager@example.com",role:"institution_manager",active:true}),
      setDoc(doc(db,"institutionMembers","inst-a__teacher-a"),{institutionId:"inst-a",uid:"teacher-a",email:"teacher-a@example.com",role:"teacher",active:true}),
      setDoc(doc(db,"institutionMembers","inst-a__teacher-a2"),{institutionId:"inst-a",uid:"teacher-a2",email:"teacher-a2@example.com",role:"teacher",active:true}),
      setDoc(doc(db,"institutionMembers","inst-a__student-member"),{institutionId:"inst-a",uid:"student-member",email:"student-member@example.com",role:"student",active:true}),
      setDoc(doc(db,"institutionMembers","inst-a__inactive"),{institutionId:"inst-a",uid:"inactive",email:"inactive@example.com",role:"teacher",active:false}),
      setDoc(doc(db,"institutionMembers","inst-b__teacher-b"),{institutionId:"inst-b",uid:"teacher-b",email:"teacher-b@example.com",role:"teacher",active:true}),
      setDoc(doc(db,"institutionMembers","self__private-teacher__private-teacher"),{institutionId:"self__private-teacher",uid:"private-teacher",email:"private@example.com",role:"institution_manager",active:true}),
      setDoc(doc(db,"groups","class-a"),{institutionId:"inst-a",teacherId:"teacher-a",teacherEmail:"teacher-a@example.com",name:"Clase A",status:"active"}),
      setDoc(doc(db,"groups","class-a2"),{institutionId:"inst-a",teacherId:"teacher-a2",teacherEmail:"teacher-a2@example.com",name:"Clase A2",status:"active"}),
      setDoc(doc(db,"groups","inactive-class"),{institutionId:"inst-a",teacherId:"inactive",teacherEmail:"inactive@example.com",name:"Clase inactiva",status:"active"}),
      setDoc(doc(db,"groups","private-class"),{institutionId:"self__private-teacher",teacherId:"private-teacher",teacherEmail:"private@example.com",name:"Clase particular",status:"active"}),
      setDoc(doc(db,"enrollments","class-a__student-class@example.com"),{institutionId:"inst-a",groupId:"class-a",studentId:"student-class",studentEmail:"student-class@example.com",active:true}),
      setDoc(doc(db,"enrollments","class-a__inactive-student@example.com"),{institutionId:"inst-a",groupId:"class-a",studentId:"inactive-student",studentEmail:"inactive-student@example.com",active:false}),
      setDoc(doc(db,"enrollments","class-a__legacy-student@example.com"),{institutionId:"inst-a",groupId:"class-a",studentId:"legacy-student",studentEmail:"legacy-student@example.com"}),
      setDoc(doc(db,"enrollments","class-a__nameless-student@example.com"),{institutionId:"inst-a",groupId:"class-a",studentId:"nameless-student",studentEmail:"nameless-student@example.com",active:true}),
      setDoc(doc(db,"enrollments","private-class__private-student@example.com"),{institutionId:"self__private-teacher",groupId:"private-class",studentId:"private-student",studentEmail:"private-student@example.com",active:true})
    ]);
  });

  const teacherA=auth("teacher-a","Docente A","teacher-a@example.com"),teacherA2=auth("teacher-a2","Docente A2","teacher-a2@example.com"),teacherB=auth("teacher-b","Docente B","teacher-b@example.com"),manager=auth("manager-a","Gestora A","manager@example.com"),studentMember=auth("student-member","Estudiante Institucional","student-member@example.com"),studentClass=auth("student-class","Estudiante Clase","student-class@example.com"),inactiveStudent=auth("inactive-student","Estudiante Inactivo","inactive-student@example.com"),legacyStudent=auth("legacy-student","Estudiante sin estado","legacy-student@example.com"),namelessStudent=testEnv.authenticatedContext("nameless-student",{email:"nameless-student@example.com",firebase:{sign_in_provider:"google.com"}}).firestore(),inactive=auth("inactive","Docente Inactivo","inactive@example.com"),privateTeacher=auth("private-teacher","Docente Particular","private@example.com"),privateStudent=auth("private-student","Alumno Particular","private-student@example.com"),admin=auth("admin","Administración NALVI","admin@example.com"),anonymous=testEnv.authenticatedContext("anonymous",{name:"Invitado",email:"anonymous@example.com",firebase:{sign_in_provider:"anonymous"}}).firestore();

  const channel=doc(teacherA,"academicTeacherChannels","inst-a");
  await assertSucceeds(setDoc(channel,{institutionId:"inst-a",channelType:"institution_teachers",createdBy:"teacher-a",createdAt:serverTimestamp()}));
  const firstMessage=doc(teacherA,"academicTeacherChannels","inst-a","messages","message-1");
  await assertSucceeds(setDoc(firstMessage,message("teacher-a","Docente A")));
  await assertSucceeds(getDoc(doc(teacherA2,"academicTeacherChannels","inst-a","messages","message-1")));
  await assertSucceeds(getDocs(collection(teacherA2,"academicTeacherChannels","inst-a","messages")));
  await assertSucceeds(setDoc(doc(teacherA2,"academicTeacherChannels","inst-a","messages","message-2"),message("teacher-a2","Docente A2","Aguyje.")));
  await assertFails(getDoc(doc(studentMember,"academicTeacherChannels","inst-a","messages","message-1")));
  await assertFails(getDoc(doc(teacherB,"academicTeacherChannels","inst-a","messages","message-1")));
  await assertFails(setDoc(doc(inactive,"academicTeacherChannels","inst-a","messages","message-x"),message("inactive","Docente Inactivo")));
  await assertFails(setDoc(doc(anonymous,"academicTeacherChannels","inst-a","messages","message-x"),message("anonymous","Invitado")));
  await assertSucceeds(updateDoc(firstMessage,{body:"Mensaje corregido.",updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(doc(teacherA2,"academicTeacherChannels","inst-a","messages","message-1"),{body:"Alterado.",updatedAt:serverTimestamp()}));
  await assertSucceeds(deleteDoc(firstMessage));
  await assertFails(setDoc(doc(privateTeacher,"academicTeacherChannels","self__private-teacher"),{institutionId:"self__private-teacher",channelType:"institution_teachers",createdBy:"private-teacher",createdAt:serverTimestamp()}));

  const classPost=doc(teacherA,"academicPosts","class-post");
  await assertSucceeds(setDoc(classPost,post()));
  await assertSucceeds(getDoc(doc(studentClass,"academicPosts","class-post")));
  await assertSucceeds(getDocs(query(collection(studentClass,"academicPosts"),where("institutionId","==","inst-a"),where("audience","==","class"),where("groupId","==","class-a"))));
  await assertSucceeds(getDoc(doc(manager,"academicPosts","class-post")));
  await assertFails(getDoc(doc(studentMember,"academicPosts","class-post")));
  await assertFails(getDoc(doc(teacherA2,"academicPosts","class-post")));
  await assertFails(getDoc(doc(inactiveStudent,"academicPosts","class-post")));
  await assertFails(getDoc(doc(legacyStudent,"academicPosts","class-post")));
  await assertFails(setDoc(doc(teacherA2,"academicPosts","foreign-class"),post({authorId:"teacher-a2",authorName:"Docente A2"})));
  await assertFails(setDoc(doc(inactive,"academicPosts","inactive-teacher-class"),post({groupId:"inactive-class",authorId:"inactive",authorName:"Docente Inactivo"})));
  await assertFails(setDoc(doc(teacherA,"academicPosts","with-file"),{...post(),fileUrl:"https://example.com/file"}));
  await assertFails(setDoc(doc(teacherA,"academicPosts","long"),post({body:"x".repeat(4001)})));
  const classReply=doc(studentClass,"academicPosts","class-post","replies","reply-1");
  await assertSucceeds(setDoc(classReply,reply("student-class","Estudiante Clase")));
  await assertFails(setDoc(doc(studentMember,"academicPosts","class-post","replies","reply-x"),reply("student-member","Estudiante Institucional")));
  await assertSucceeds(updateDoc(classReply,{body:"Aime porã avei.",updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(doc(teacherA,"academicPosts","class-post","replies","reply-1"),{body:"Respuesta alterada.",updatedAt:serverTimestamp()}));
  await assertSucceeds(deleteDoc(doc(teacherA,"academicPosts","class-post","replies","reply-1")));

  const institutionPost=doc(teacherA,"academicPosts","institution-post");
  await assertSucceeds(setDoc(institutionPost,post({groupId:"",audience:"institution",postType:"activity",title:"Actividad institucional"})));
  await assertSucceeds(getDoc(doc(teacherA2,"academicPosts","institution-post")));
  await assertSucceeds(getDocs(query(collection(teacherA2,"academicPosts"),where("institutionId","==","inst-a"),where("audience","==","institution"))));
  await assertSucceeds(getDoc(doc(studentMember,"academicPosts","institution-post")));
  await assertSucceeds(setDoc(doc(studentMember,"academicPosts","institution-post","replies","member-reply"),reply("student-member","Estudiante Institucional")));
  await assertFails(getDoc(doc(studentClass,"academicPosts","institution-post")));
  await assertFails(getDoc(doc(teacherB,"academicPosts","institution-post")));

  const privatePost=doc(privateTeacher,"academicPosts","private-post");
  await assertSucceeds(setDoc(privatePost,post({institutionId:"self__private-teacher",groupId:"private-class",authorId:"private-teacher",authorName:"Docente Particular"})));
  await assertSucceeds(getDoc(doc(privateStudent,"academicPosts","private-post")));
  await assertFails(setDoc(doc(privateTeacher,"academicPosts","private-institution-post"),post({institutionId:"self__private-teacher",groupId:"",audience:"institution",authorId:"private-teacher",authorName:"Docente Particular"})));

  const templateRef=doc(teacherA,"teacherTaskTemplates","template-document-1"),draft=templateShape();
  await assertSucceeds(setDoc(templateRef,{institutionId:"inst-a",ownerUid:"teacher-a",template:draft,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
  await assertSucceeds(getDoc(doc(manager,"teacherTaskTemplates","template-document-1")));
  await assertSucceeds(getDocs(query(collection(teacherA,"teacherTaskTemplates"),where("ownerUid","==","teacher-a"))));
  await assertSucceeds(getDocs(query(collection(manager,"teacherTaskTemplates"),where("institutionId","==","inst-a"))));
  await assertFails(getDocs(query(collection(teacherA2,"teacherTaskTemplates"),where("institutionId","==","inst-a"))));
  await assertFails(getDoc(doc(teacherA2,"teacherTaskTemplates","template-document-1")));
  await assertFails(getDoc(doc(studentClass,"teacherTaskTemplates","template-document-1")));
  await assertFails(setDoc(doc(studentClass,"teacherTaskTemplates","student-template"),{institutionId:"inst-a",ownerUid:"student-class",template:{...draft,ownerUserId:"student-class"},createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
  const approved={...draft,status:"approved",canPublish:true,canAssign:true};
  await assertSucceeds(updateDoc(templateRef,{template:approved,updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(templateRef,{template:{...approved,cards:[{...approved.cards[0],answer:"Respuesta inventada"}]},updatedAt:serverTimestamp()}));
  const assignment={institutionId:"inst-a",groupId:"class-a",templateDocumentId:"template-document-1",templateId:"task-1",templateVersion:1,sourceFingerprint:"a".repeat(64),cardsSnapshot:approved.cards,assignedByUid:"teacher-a",title:"Tarea de hoy",instructions:"Respondé las preguntas.",status:"assigned",assignedAt:serverTimestamp(),dueAt:null};
  await assertSucceeds(setDoc(doc(teacherA,"teacherTaskAssignments","assignment-1"),assignment));
  await assertSucceeds(getDoc(doc(studentClass,"teacherTaskAssignments","assignment-1")));
  await assertSucceeds(getDocs(query(collection(studentClass,"teacherTaskAssignments"),where("institutionId","==","inst-a"),where("groupId","==","class-a"))));
  await assertFails(getDoc(doc(legacyStudent,"teacherTaskAssignments","assignment-1")));
  await assertFails(setDoc(doc(studentClass,"teacherTaskAssignments","assignment-student"),{...assignment,assignedByUid:"student-class"}));
  await assertFails(setDoc(doc(teacherA,"teacherTaskAssignments","assignment-drift"),{...assignment,cardsSnapshot:[{...approved.cards[0],answer:"Otra"}]}));

  const submission={institutionId:"inst-a",groupId:"class-a",assignmentId:"assignment-1",studentId:"student-class",studentName:"Estudiante Clase",status:"completed",correctCount:1,totalCount:1,answers:[{order:1,response:"Aime porã.",correct:true}],updatedAt:serverTimestamp(),completedAt:serverTimestamp()};
  const submissionRef=doc(studentClass,"teacherTaskSubmissions","assignment-1__student-class");
  await assertSucceeds(setDoc(submissionRef,submission));
  await assertSucceeds(getDoc(doc(teacherA,"teacherTaskSubmissions","assignment-1__student-class")));
  await assertSucceeds(getDocs(query(collection(teacherA,"teacherTaskSubmissions"),where("institutionId","==","inst-a"),where("groupId","==","class-a"))));
  await assertSucceeds(getDoc(doc(manager,"teacherTaskSubmissions","assignment-1__student-class")));
  await assertFails(getDoc(doc(teacherB,"teacherTaskSubmissions","assignment-1__student-class")));
  await assertFails(setDoc(doc(studentMember,"teacherTaskSubmissions","assignment-1__student-class"),{...submission,studentId:"student-member",studentName:"Estudiante Institucional"}));
  await assertFails(setDoc(doc(studentClass,"teacherTaskSubmissions","assignment-1__student-class-extra"),submission));
  await assertFails(setDoc(doc(studentClass,"teacherTaskSubmissions","assignment-1__student-class"),{...submission,xp:100}));
  await assertSucceeds(setDoc(doc(namelessStudent,"teacherTaskSubmissions","assignment-1__nameless-student"),{...submission,studentId:"nameless-student",studentName:"Estudiante"}));

  const institutionRequest=doc(studentClass,"institutionalLeads","request-student-class");
  await assertSucceeds(setDoc(institutionRequest,leadShape("student-class@example.com","Estudiante Clase")));
  await assertSucceeds(setDoc(doc(studentClass,"users","student-class"),{uid:"student-class",email:"student-class@example.com",institutionLeadIds:arrayUnion("request-student-class"),updatedAt:serverTimestamp()},{merge:true}));
  await assertSucceeds(getDoc(institutionRequest));
  await assertFails(getDocs(collection(studentClass,"institutionalLeads")));
  await assertFails(updateDoc(institutionRequest,{status:"approved",decisionBy:"student-class",decisionAt:serverTimestamp()}));
  await assertFails(setDoc(doc(studentClass,"institutionalLeads","spoofed-email"),leadShape("other@example.com","Estudiante Clase")));
  await assertFails(setDoc(doc(anonymous,"institutionalLeads","anonymous"),leadShape("anonymous@example.com","Invitado")));
  await assertSucceeds(getDocs(query(collection(admin,"institutionalLeads"),where("status","==","new"))));
  await assertSucceeds(updateDoc(doc(admin,"institutionalLeads","request-student-class"),{status:"approved",decisionBy:"admin",decisionAt:serverTimestamp(),updatedAt:serverTimestamp(),updatedBy:"admin"}));
  await assertFails(setDoc(doc(teacherA,"institutions","org__ABCDEF123456"),{name:"Organización directa",country:"Paraguay",active:true,status:"active",ownerUid:"teacher-a",organization:true,selfService:false,createdBy:"teacher-a",createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
  await assertSucceeds(setDoc(doc(admin,"institutions","org__ABCDEF123456"),{name:"Organización aprobada",country:"Paraguay",active:true,status:"active",ownerUid:"teacher-a",organization:true,selfService:false,createdBy:"admin",createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
  await assertSucceeds(setDoc(doc(studentClass,"institutions","self__student-class"),{name:"Aula particular",country:"",active:true,status:"active",ownerUid:"student-class",selfService:true,createdBy:"student-class",createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));

  console.log("PASS colaboración académica, plantillas y solicitudes aisladas");
}finally{
  await testEnv.cleanup();
}
