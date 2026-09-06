import assert from "node:assert/strict";
import test from "node:test";

import {
  ACADEMIC_COLLABORATION_LIMITS,
  buildAcademicPost,
  buildAcademicReply,
  buildTaskSubmission,
  buildTeacherMessage,
  buildTeacherTaskAssignment,
  buildTeacherTaskTemplate
} from "../nalvi-academic-collaboration.mjs";

const timestamp={server:true};

const organizerTemplate=overrides=>({
  schemaVersion:"NALVI-TEACHER-TASK-TEMPLATE-1",
  templateId:"teacher-task-1",
  version:1,
  previousVersion:null,
  ownerUserId:"teacher-a",
  title:"Preguntas del profesor",
  status:"draft",
  reusable:true,
  canPublish:false,
  canAssign:false,
  masteryEligible:false,
  contentPolicy:"exact-teacher-content-only",
  sourceFingerprint:"a".repeat(64),
  review:{required:true,items:[]},
  cards:[
    {cardId:"card-1",order:1,activityType:"CONTEXT_CHOICE",question:"  ¿Mba’éichapa reime?  ",answer:"Aime porã.",options:["Aime porã.","Che réra Ana."],contentSource:"teacher-provided"},
    {cardId:"card-2",order:2,activityType:"INDEPENDENT_RECALL",question:"Ehai ko ñe’ẽjoaju.",answer:"Jajoechata.",options:null,contentSource:"teacher-provided"}
  ],
  ...overrides
});

test("preserva literalmente las preguntas y respuestas organizadas por el profesor",()=>{
  const source=organizerTemplate(),result=buildTeacherTaskTemplate({institutionId:"inst-a",ownerUid:"teacher-a",template:source,timestamp});
  assert.equal(result.template.cards[0].question,"  ¿Mba’éichapa reime?  ");
  assert.equal(result.template.cards[0].answer,"Aime porã.");
  assert.deepEqual(result.template.cards.map(card=>card.order),[1,2]);
  assert.notEqual(result.template,source);
  assert.equal(result.template.contentPolicy,"exact-teacher-content-only");
  assert.equal(result.template.masteryEligible,false);
});

test("rechaza campos inventados y más de cincuenta tarjetas",()=>{
  const withInvented={...organizerTemplate(),inventedAnswer:"No"};
  assert.throws(()=>buildTeacherTaskTemplate({institutionId:"inst-a",ownerUid:"teacher-a",template:withInvented,timestamp}),/UNKNOWN_FIELD/);
  const tooMany=organizerTemplate({cards:Array.from({length:51},(_,index)=>({cardId:`card-${index+1}`,order:index+1,activityType:null,question:`Pregunta ${index+1}`,answer:`Respuesta ${index+1}`,options:null,contentSource:"teacher-provided"}))});
  assert.throws(()=>buildTeacherTaskTemplate({institutionId:"inst-a",ownerUid:"teacher-a",template:tooMany,timestamp}),/TEMPLATE_CARDS_INVALID/);
});

test("acepta el orden real uno a N y rechaza órdenes desplazados",()=>{
  const reviewed=organizerTemplate({review:{required:true,items:[{order:1,reasons:["Requiere revisión docente."]}]}});
  assert.equal(buildTeacherTaskTemplate({institutionId:"inst-a",ownerUid:"teacher-a",template:reviewed,timestamp}).template.review.items[0].order,1);
  assert.throws(()=>buildTeacherTaskTemplate({institutionId:"inst-a",ownerUid:"teacher-a",template:organizerTemplate({review:{required:true,items:[{order:2,reasons:["Orden incorrecto."]}]}}),timestamp}),/TEMPLATE_REVIEW_ORDER_INVALID/);
  assert.throws(()=>buildTeacherTaskTemplate({institutionId:"inst-a",ownerUid:"teacher-a",template:organizerTemplate({cards:[{...organizerTemplate().cards[0],order:0}]}),timestamp}),/CARD_0_ORDER_INVALID/);
});

test("una asignación conserva versión, fingerprint y snapshot exacto",()=>{
  const template={...organizerTemplate(),status:"approved",canPublish:true,canAssign:true};
  const assignment=buildTeacherTaskAssignment({institutionId:"inst-a",groupId:"class-a",templateDocumentId:"doc-1",template,title:"Práctica 1",instructions:"Respondé en clase.",assignedByUid:"teacher-a",timestamp,dueAt:"2026-09-12"});
  assert.equal(assignment.templateId,"teacher-task-1");
  assert.equal(assignment.templateVersion,1);
  assert.equal(assignment.sourceFingerprint,"a".repeat(64));
  assert.deepEqual(assignment.cardsSnapshot,template.cards);
  assert.equal(assignment.dueAt.toISOString(),"2026-09-12T23:59:59.999Z");
  assert.throws(()=>buildTeacherTaskAssignment({institutionId:"inst-a",groupId:"class-a",templateDocumentId:"doc-1",template,title:"Práctica 1",assignedByUid:"teacher-a",timestamp,dueAt:"12/09/2026"}),/ASSIGNMENT_DUE_AT_INVALID/);
});

test("el alcance institucional queda prohibido para el aula particular",()=>{
  assert.throws(()=>buildAcademicPost({institutionId:"self__teacher-a",audience:"institution",postType:"question",authorId:"teacher-a",authorName:"Docente A",body:"Pregunta",timestamp}),/PERSONAL_TEACHER_CLASS_AUDIENCE_ONLY/);
  const post=buildAcademicPost({institutionId:"self__teacher-a",groupId:"class-a",audience:"class",postType:"activity",authorId:"teacher-a",authorName:"Docente A",body:"Actividad",timestamp});
  assert.equal(post.audience,"class");
  assert.equal(post.groupId,"class-a");
});

test("mensajes, publicaciones y respuestas aplican límites de texto",()=>{
  assert.throws(()=>buildTeacherMessage({institutionId:"inst-a",authorId:"teacher-a",authorName:"Docente A",body:"x".repeat(ACADEMIC_COLLABORATION_LIMITS.teacherMessage+1),timestamp}),/TOO_LONG/);
  assert.throws(()=>buildAcademicReply({authorId:"student-a",authorName:"Estudiante A",body:"x".repeat(ACADEMIC_COLLABORATION_LIMITS.reply+1),timestamp}),/TOO_LONG/);
  assert.throws(()=>buildAcademicPost({institutionId:"inst-a",audience:"institution",postType:"question",authorId:"teacher-a",authorName:"Docente A",body:"x".repeat(ACADEMIC_COLLABORATION_LIMITS.postBody+1),timestamp}),/TOO_LONG/);
});

test("la entrega formativa conserva respuestas y no contiene XP ni mastery",()=>{
  const submission=buildTaskSubmission({institutionId:"inst-a",groupId:"class-a",assignmentId:"assignment-1",studentId:"student-a",studentName:"Estudiante A",status:"completed",answers:[{order:1,response:"Aime porã.",correct:true},{order:2,response:"Jajoechata.",correct:false}],timestamp});
  assert.deepEqual(submission.answers.map(item=>item.response),["Aime porã.","Jajoechata."]);
  assert.equal(submission.correctCount,1);
  assert.equal(submission.totalCount,2);
  assert.equal("xp" in submission,false);
  assert.equal("mastery" in submission,false);
});
