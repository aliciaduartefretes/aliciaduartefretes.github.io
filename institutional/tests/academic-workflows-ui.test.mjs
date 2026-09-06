import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html=fs.readFileSync(new URL("../../index.html",import.meta.url),"utf8");
const js=fs.readFileSync(new URL("../../assets/js/nalvi-academic-workflows.mjs",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("../../assets/css/nalvi-academic-workflows.css",import.meta.url),"utf8");

test("academic workflows are loaded with versioned JavaScript and CSS",()=>{
  assert.match(html,/nalvi-academic-workflows\.css\?v=NALVI-ACADEMIC-WORKFLOWS-1/);
  assert.match(html,/nalvi-academic-workflows\.mjs\?v=NALVI-ACADEMIC-WORKFLOWS-1/);
});

test("teacher workflow makes exact review explicit before save and assignment",()=>{
  assert.match(js,/NALVI solo las organiza; no cambia ni inventa contenido/);
  assert.match(js,/organizeTeacherTaskDraft/);
  assert.match(js,/data-approve-task/);
  assert.match(js,/setTaskTemplateStatus\(saved\.reference\.id,"approved"\)/);
  assert.match(js,/service\.assignTask/);
});

test("academic wall has explicit class or institution audience and nested replies",()=>{
  assert.match(js,/audience:isClass\?"class":"institution"/);
  assert.match(js,/data-replies-for/);
  assert.match(js,/service\.replyToPost/);
});

test("teacher room and student task runner are present and mobile safe",()=>{
  assert.match(js,/service\.sendTeacherMessage/);
  assert.match(js,/service\.saveTaskSubmission/);
  assert.match(css,/@media\(max-width:620px\)/);
  assert.match(css,/\.nalvi-task-dialog::backdrop/);
});
