import test from "node:test";
import assert from "node:assert/strict";
import {organizeTeacherTaskDraft} from "../../assets/js/nalvi-teacher-task-organizer.mjs";
import {createTeacherTaskOrganizer} from "../../server/teacher-task-organizer.mjs";

test("browser organizer preserves exact teacher material and matches the server contract",async()=>{
  const source={title:"Mi tarea",questions:[{question:"¿Mba’éichapa reime?",answer:"Aime porã.",options:["Aime porã.","Aguyje."]},{question:"Ehai nde réra.",answer:"Che réra Ana."}]};
  const client=await organizeTeacherTaskDraft(source,{ownerUserId:"teacher-1"});
  const server=await createTeacherTaskOrganizer().organizeDraft({...source,questions:source.questions.map((item,index)=>({...item,order:index+1}))},{verifiedUserId:"teacher-1",isAnonymous:false});
  assert.equal(server.ok,true);
  assert.deepEqual(client,server.template);
  assert.equal(client.cards[0].question,source.questions[0].question);
  assert.equal(client.cards[1].answer,source.questions[1].answer);
});

test("browser organizer never invents a missing answer or repairs invalid options",async()=>{
  await assert.rejects(()=>organizeTeacherTaskDraft({title:"Tarea",questions:[{question:"Pregunta",answer:""}]},{ownerUserId:"teacher-1"}),/INVALID_TEACHER_TEXT/);
  const template=await organizeTeacherTaskDraft({title:"Tarea",questions:[{question:"Pregunta",answer:"Correcta",options:["Otra","Distinta"]}]},{ownerUserId:"teacher-1"});
  assert.equal(template.status,"needs_manual_review");
  assert.equal(template.cards[0].activityType,null);
  assert.deepEqual(template.cards[0].options,["Otra","Distinta"]);
});
