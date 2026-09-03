import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const scriptUrl=new URL("../../assets/js/nalvi-institutional-experience.js",import.meta.url);
const serviceUrl=new URL("../../assets/js/nalvi-community-service.js",import.meta.url);
const styleUrl=new URL("../../assets/css/nalvi-institutional-experience.css",import.meta.url);
const indexUrl=new URL("../../index.html",import.meta.url);
const script=await readFile(scriptUrl,"utf8");
const service=await readFile(serviceUrl,"utf8");
const style=await readFile(styleUrl,"utf8");
const index=await readFile(indexUrl,"utf8");

test("institutional sprint exposes the five requested areas",()=>{
  assert.match(script,/const VERSION="NALVI-INSTITUTIONAL-SPRINT-2"/);
  assert.match(script,/const root=\$\("#institutionalExperience"\)/);
  assert.doesNotMatch(script,/#nalviInstitutionalExperience/);
  for(const label of ["Comunidad","Aula","En vivo","Miembros","Gestión"])assert.match(script,new RegExp(label));
  for(const tab of ["community","classroom","live","members","management"])assert.match(script,new RegExp(`data-institutional-tab=\\"\\$\\{id\\}`));
});

test("community remains demo-only and makes no remote writes",()=>{
  assert.match(script,/COMMUNITY_WRITES_ENABLED=false/);
  assert.match(service,/WRITES_ENABLED=false/);
  assert.match(script,/No se envió ninguna publicación/);
  assert.match(service,/COMMUNITY_WRITES_DISABLED/);
  assert.doesNotMatch(script+service,/\b(?:addDoc|setDoc|updateDoc|deleteDoc|firebase|firestore|fetch)\s*\(/i);
  assert.doesNotMatch(script+service,/localStorage|sessionStorage/);
});

test("demo service previews locally and rejects remote publication",()=>{
  const context=vm.createContext({window:{},Date,JSON,Error,TypeError,String,Math});
  vm.runInContext(service,context);
  const api=context.window.NALVI_COMMUNITY_SERVICE;
  const before=api.listPosts().length;
  const preview=api.previewPost("  Un avance del grupo  ");
  assert.equal(preview.body,"Un avance del grupo");
  assert.equal(api.listPosts().length,before+1);
  assert.throws(()=>api.createRemotePost(),/COMMUNITY_WRITES_DISABLED/);
});

test("demo includes posts, comments, replies, reactions, notifications and learning links",()=>{
  for(const marker of ["data-community-comment","data-community-reply","data-community-like","Notificaciones","Lección · Verbos en presente","Tarea · Práctica semanal","Grupo A"])assert.match(script+service,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
});

test("directory contains no emails or unnecessary personal data",()=>{
  assert.match(script,/Los correos no se muestran/);
  assert.doesNotMatch(script,/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
});

test("institutional copy is available in all six UI languages",()=>{
  for(const locale of ["es","en","pt","fr","it","de"])assert.match(script,new RegExp(`\\b${locale}:\\{nav:`));
});

test("mobile-first styles include safe areas and compact layouts",()=>{
  assert.match(style,/env\(safe-area-inset-bottom\)/);
  assert.match(style,/@media\(max-width:820px\)/);
  assert.match(style,/@media\(max-width:560px\)/);
  assert.match(style,/overflow-x:auto/);
  assert.match(style,/\.nalvi-institutional-layout>\*\{min-width:0\}/);
  assert.match(style,/grid-template-columns:minmax\(0,1fr\)/);
});

test("index loads the protected service and experience with explicit flags",()=>{
  assert.match(index,/institutionalExperience:true/);
  assert.match(index,/communityWrites:false/);
  assert.match(index,/nalvi-community-service\.js\?v=NALVI-COMMUNITY-SERVICE-1/);
  assert.match(index,/nalvi-institutional-experience\.js\?v=NALVI-INSTITUTIONAL-SPRINT-2/);
  assert.match(index,/nalvi-institutional-experience\.css\?v=NALVI-INSTITUTIONAL-SPRINT-2/);
});
