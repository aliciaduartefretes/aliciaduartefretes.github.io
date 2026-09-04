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
const stableRuntime=index.match(/<script id="gca59-stable-runtime">([\s\S]*?)<\/script>/)?.[1]||"";

test("community experience keeps learning areas secondary to the social feed",()=>{
  assert.match(script,/const VERSION="NALVI-COMMUNITY-EXPERIENCE-4"/);
  assert.match(script,/const root=\$\("#institutionalExperience"\)/);
  assert.doesNotMatch(script,/#nalviInstitutionalExperience/);
  for(const label of ["Comunidad","Aula","En vivo","Miembros","Gestión"])assert.match(script,new RegExp(label));
  for(const tab of ["community","classroom","live","members","management"])assert.match(script,new RegExp(`data-institutional-tab=\\"\\$\\{id\\}`));
  assert.match(script,/tag:"COMUNIDAD NALVI"/);
  assert.match(script,/title:"Tu lugar para conversar y aprender"/);
  assert.doesNotMatch(script,/ESPACIO INSTITUCIONAL|Vista demostrativa|Demo view|INSTITUTIONAL SPACE/);
});

test("community has a consistent three-person icon in both navigation surfaces",()=>{
  assert.match(script,/const COMMUNITY_ICON='<svg/);
  assert.match(script,/nalvi-community-tab-icon/);
  assert.match(script,/nalvi-community-nav-icon/);
  assert.match(script,/<circle cx="12" cy="7" r="3"><\/circle>/);
  assert.match(style,/\.nalvi-community-tab-icon svg/);
  assert.match(style,/\.nalvi-community-nav-icon svg/);
});

test("community writes remain protected by the disabled production flag",()=>{
  assert.match(script,/COMMUNITY_WRITES_ENABLED=window\.GCA_FEATURES\?\.communityWrites===true\|\|window\.NALVI_FEATURES\?\.communityWrites===true/);
  assert.match(service,/WRITES_ENABLED=window\.GCA_FEATURES\?\.communityWrites===true\|\|window\.NALVI_FEATURES\?\.communityWrites===true/);
  assert.match(index,/communityWrites:false/);
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

test("social feed includes posts, replies, reactions, sharing, topics and learning links",()=>{
  for(const marker of ["data-community-comment","data-community-reply","data-community-like","data-community-share","#Mba’éichapaReime","#VerbosEnPresente","Verbos en presente"])assert.match(script+service,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
});

test("directory contains no emails or unnecessary personal data",()=>{
  assert.match(script,/Los correos y datos privados no se muestran/);
  assert.doesNotMatch(script,/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
});

test("community copy is available in all six UI languages",()=>{
  for(const locale of ["es","en","pt","fr","it","de"])assert.match(script,new RegExp(`\\b${locale}:\\{nav:`));
});

test("legacy language repaint cannot relabel Community as Videos",()=>{
  assert.match(index,/views=\[[^\]]*"institutionalExperience"\]/);
  assert.match(index,/views\.includes\(requestedView\).*view:requestedView,scrollY:0/);
  assert.match(stableRuntime,/const SURFACE_NAV_TARGETS=\["home","catalog","practice","dictionary","institutional","videos","suggestions"\]/);
  assert.ok(stableRuntime.includes('.nav-btn[data-go="${go}"] i'));
  assert.doesNotMatch(stableRuntime,/querySelectorAll\("\.bottom-nav \.nav-btn i"\)\.forEach\(\(node,index\)/);
  assert.match(script,/data-community-label="true"/);
});

test("mobile-first styles include safe areas and compact layouts",()=>{
  assert.match(style,/env\(safe-area-inset-bottom\)/);
  assert.match(style,/@media\(max-width:760px\)/);
  assert.match(style,/@media\(max-width:560px\)/);
  assert.match(style,/overflow-x:auto/);
  assert.match(style,/\.nalvi-institutional-layout>\*\{min-width:0\}/);
  assert.match(style,/grid-template-columns:minmax\(0,1fr\)/);
});

test("index loads the protected service and experience with explicit flags",()=>{
  assert.match(index,/institutionalExperience:true/);
  assert.match(index,/communityWrites:false/);
  assert.match(index,/nalvi-community-service\.js\?v=NALVI-COMMUNITY-SERVICE-2/);
  assert.match(index,/nalvi-institutional-experience\.js\?v=NALVI-COMMUNITY-EXPERIENCE-4/);
  assert.match(index,/nalvi-institutional-experience\.css\?v=NALVI-COMMUNITY-EXPERIENCE-4/);
});
