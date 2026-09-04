import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const scriptUrl=new URL("../../assets/js/nalvi-institutional-experience.js",import.meta.url);
const serviceUrl=new URL("../../assets/js/nalvi-community-service.js",import.meta.url);
const styleUrl=new URL("../../assets/css/nalvi-institutional-experience.css",import.meta.url);
const indexUrl=new URL("../../index.html",import.meta.url);
const firestoreRulesUrl=new URL("../../firebase/proposals/REGLAS-FIRESTORE-COMUNIDAD-PARA-COPIAR.rules",import.meta.url);
const storageRulesUrl=new URL("../../firebase/proposals/REGLAS-STORAGE-COMUNIDAD-PARA-COPIAR.rules",import.meta.url);
const script=await readFile(scriptUrl,"utf8");
const service=await readFile(serviceUrl,"utf8");
const style=await readFile(styleUrl,"utf8");
const index=await readFile(indexUrl,"utf8");
const firestoreRules=await readFile(firestoreRulesUrl,"utf8");
const storageRules=await readFile(storageRulesUrl,"utf8");
const stableRuntime=index.match(/<script id="gca59-stable-runtime">([\s\S]*?)<\/script>/)?.[1]||"";

test("community is a focused social network without academic-management tabs",()=>{
  assert.match(script,/const VERSION="NALVI-COMMUNITY-EXPERIENCE-11"/);
  assert.match(script,/class="nalvi-community-layout"/);
  assert.doesNotMatch(script,/class="nalvi-community-bar"/);
  assert.doesNotMatch(script,/data-institutional-tab|classroomPanel|livePanel|membersPanel|managementPanel/);
  for(const removed of ["Tu lugar para conversar y aprender","Aula","En vivo","Miembros","Gestión académica"])assert.doesNotMatch(script,new RegExp(removed));
});

test("community keeps the three-person icon only in bottom navigation",()=>{
  assert.match(script,/const COMMUNITY_ICON='<svg/);
  assert.match(script,/nalvi-community-nav-icon/);
  assert.doesNotMatch(script,/nalvi-community-hero-icon|nalvi-community-bar/);
  assert.match(script,/<circle cx="12" cy="7" r="3"><\/circle>/);
  assert.match(style,/\.nalvi-community-nav-icon svg/);
});

test("community writes are enabled only after the exact rules were restored",()=>{
  assert.match(script,/COMMUNITY_WRITES_ENABLED=window\.GCA_FEATURES\?\.communityWrites===true\|\|window\.NALVI_FEATURES\?\.communityWrites===true/);
  assert.match(service,/WRITES_ENABLED=window\.GCA_FEATURES\?\.communityWrites===true\|\|window\.NALVI_FEATURES\?\.communityWrites===true/);
  assert.match(index,/communityWrites:true/);
  assert.match(service,/COMMUNITY_WRITES_DISABLED/);
  for(const operation of ["subscribePosts","createRemotePost","deleteRemotePost","toggleReaction","createComment","toggleFollow","saveOwnProfile","recordView"])assert.match(service,new RegExp(operation));
  assert.doesNotMatch(script+service,/localStorage|sessionStorage/);
});

test("demo service previews locally and rejects remote mutations",async()=>{
  const context=vm.createContext({window:{},Date,JSON,Error,TypeError,String,Math});
  vm.runInContext(service,context);
  const api=context.window.NALVI_COMMUNITY_SERVICE;
  const before=api.listPosts().length;
  const preview=api.previewPost("  Un avance del grupo  ");
  assert.equal(preview.body,"Un avance del grupo");
  assert.equal(api.listPosts().length,before+1);
  await assert.rejects(api.createRemotePost("Un aporte"),/COMMUNITY_WRITES_DISABLED/);
  await assert.rejects(api.deleteRemotePost("post"),/COMMUNITY_WRITES_DISABLED/);
  await assert.rejects(api.toggleFollow("persona"),/COMMUNITY_WRITES_DISABLED/);
  await assert.rejects(api.saveOwnProfile("Bio"),/COMMUNITY_WRITES_DISABLED/);
});

test("enabled service writes only through authenticated Firestore operations",async()=>{
  const writes=[];
  const reference=path=>({path});
  const firebase={
    auth:{currentUser:{uid:"alicia",displayName:"Alicia Duarte",photoURL:"https://example.com/alicia.jpg",isAnonymous:false}},db:reference("db"),
    doc:(base,...parts)=>reference(`${base.path}/${parts.join("/")}`),
    collection:(base,...parts)=>reference(`${base.path}/${parts.join("/")}`),
    getDoc:async ref=>({exists:()=>ref.path.endsWith("communityProfiles/otra"),data:()=>({}),ref}),
    setDoc:async(ref,data,options)=>writes.push({kind:"set",path:ref.path,data,options}),
    addDoc:async(ref,data)=>{writes.push({kind:"add",path:ref.path,data});return{id:"post-1"}},
    deleteDoc:async ref=>writes.push({kind:"delete",path:ref.path}),
    serverTimestamp:()=>"timestamp"
  };
  const context=vm.createContext({window:{GCA_FEATURES:{communityWrites:true},GCA_FIREBASE_LIVE:firebase},Date,JSON,Error,TypeError,String,Math,setTimeout,clearTimeout,Intl,document:{documentElement:{lang:"es"}}});
  vm.runInContext(service,context);
  const api=context.window.NALVI_COMMUNITY_SERVICE;
  assert.equal(await api.createRemotePost("Un aporte"),"post-1");
  await assert.rejects(api.createRemotePost("Otro aporte"),/COMMUNITY_POST_COOLDOWN/);
  assert.equal(await api.toggleFollow("otra"),true);
  assert.equal(await api.saveOwnProfile("Docente de guaraní"),true);
  assert.equal(await api.deleteRemotePost("post-1"),true);
  assert.ok(writes.some(item=>item.kind==="add"&&item.path.endsWith("communityPosts")));
  assert.ok(writes.some(item=>item.kind==="set"&&item.path.endsWith("communityProfiles/alicia")));
  assert.ok(writes.some(item=>item.kind==="set"&&item.path.endsWith("communityProfiles/otra/followers/alicia")));
  assert.ok(writes.some(item=>item.kind==="delete"&&item.path.endsWith("communityPosts/post-1")));
});

test("feed supports discovery, likes, replies, views, sharing, own deletion and followers",()=>{
  for(const marker of ["data-community-feed","data-community-topic","data-community-comment","data-community-like","data-community-share","data-community-delete","data-community-follow","data-community-hide","data-community-report","recordView","followers","confirmRemove"])assert.match(script+service,new RegExp(marker));
  assert.match(script,/currentUid\(\)===post\.authorId/);
  assert.match(script,/state\.feed==="following"/);
  assert.match(service,/communityProfiles/);
  assert.match(service,/POST_COOLDOWN_MS=15000/);
  assert.match(service,/COMMUNITY_DUPLICATE_POST/);
  assert.match(script,/show\("suggestions",true\)/);
});

test("profiles are navigable, show their posts and keep rewards out of the fixed sidebar",()=>{
  assert.match(script,/nalviCommunityAvatarInput/);
  assert.match(script,/nalviCommunityCoverInput/);
  assert.match(script,/prepareImage/);
  assert.match(script,/coverMarkup/);
  assert.match(script,/data-community-profile/);
  assert.match(script,/communityNavigationBound/);
  assert.match(script,/event\.target\.closest\?\.\("\[data-community-profile\]"\)/);
  assert.match(script,/function profilePanel\(\)/);
  assert.match(script,/nalvi-community-profile-reward/);
  assert.match(script,/contributionScore/);
  assert.match(script,/hiddenAuthorIds:new Set\(\)/);
  assert.match(service,/if\(user&&!user\.isAnonymous\)await ensureOwnProfile\(firebase\)/);
  const communityPanel=script.match(/function communityPanel\(\)[\s\S]*?function render\(\)/)?.[0]||"";
  assert.doesNotMatch(communityPanel,/nalvi-reward-card/);
  assert.match(service,/safePhoto\(user\.photoURL\)/);
  assert.doesNotMatch(script,/email|correo/i);
});

test("social copy is Guaraní-first with support in all six UI languages",()=>{
  for(const locale of ["es","en","pt","fr","it","de"])assert.match(script,new RegExp(`\\b${locale}:\\{nav:`));
  for(const term of ["Ñañe’ẽ guaraníme","Jahai guaraníme","Ehai guaraníme","Emoherakuã","Mbohovái","Ndéve g̃uarã","Marandukuéra","Porandukuéra","Ñemoarandu","Pytyvõrã"])assert.match(script,new RegExp(term));
  for(const term of ["Sugerencias para seguir","Mi perfil","seguidores","visualizaciones"])assert.match(script,new RegExp(term));
});

test("resources have a visible purpose and support safe images and HTTPS links",()=>{
  for(const marker of ["nalvi-community-resource-composer","nalviCommunityResourceTitle","nalviCommunityResourceUrl","nalviCommunityPostImage","nalvi-community-resource-link","resourceTitle","resourceUrl","mediaPath","mediaType"])assert.match(script+service+style,new RegExp(marker));
  assert.match(service,/COMMUNITY_INVALID_RESOURCE_URL/);
  assert.match(service,/\["image\/jpeg","image\/png","image\/webp"\]/);
  assert.match(service,/5\*1024\*1024/);
  assert.match(index,/firebase-storage\.js/);
  assert.match(index,/storageRef,uploadBytes,getDownloadURL,deleteObject/);
});

test("community media writes stay inside the authenticated user's paths",async()=>{
  const writes=[],reference=path=>({path});
  const firebase={
    auth:{currentUser:{uid:"alicia",displayName:"Alicia Duarte",photoURL:"",isAnonymous:false}},db:reference("db"),storage:reference("storage"),
    doc:(base,...parts)=>reference(`${base.path}/${parts.join("/")}`),collection:(base,...parts)=>reference(`${base.path}/${parts.join("/")}`),storageRef:(base,path)=>reference(`${base.path}/${path}`),
    getDoc:async ref=>({exists:()=>ref.path.includes("communityProfiles"),data:()=>({}),ref}),setDoc:async(ref,data,options)=>writes.push({kind:"set",path:ref.path,data,options}),
    addDoc:async(ref,data)=>{writes.push({kind:"add",path:ref.path,data});return{id:"resource-1"}},deleteDoc:async()=>{},deleteObject:async()=>{},uploadBytes:async(ref,blob,metadata)=>writes.push({kind:"upload",path:ref.path,blob,metadata}),
    getDownloadURL:async ref=>`https://storage.example/${ref.path}`,serverTimestamp:()=>"timestamp"
  };
  const context=vm.createContext({window:{GCA_FEATURES:{communityWrites:true},GCA_FIREBASE_LIVE:firebase,crypto:{randomUUID:()=>"12345678-1234-1234-1234-123456789abc"}},Date,JSON,Error,TypeError,String,Math,Map,Set,Object,Promise,setTimeout,clearTimeout,Intl,document:{documentElement:{lang:"es"}}});
  vm.runInContext(service,context);const api=context.window.NALVI_COMMUNITY_SERVICE,image={size:1024,type:"image/webp"};
  assert.equal(await api.createRemotePost("Material útil","resources",{imageBlob:image,resourceTitle:"Guía",resourceUrl:"https://example.com/guia"}),"resource-1");
  await api.saveOwnProfile("Mbo’ehára",{avatarBlob:image,coverBlob:image});
  assert.ok(writes.some(item=>item.kind==="upload"&&item.path.includes("communityMedia/alicia/posts/12345678123412341234123456789abc")));
  assert.ok(writes.some(item=>item.kind==="upload"&&item.path.endsWith("communityMedia/alicia/profile/avatar")));
  assert.ok(writes.some(item=>item.kind==="upload"&&item.path.endsWith("communityMedia/alicia/profile/cover")));
  const resource=writes.find(item=>item.kind==="add");assert.equal(resource.data.resourceTitle,"Guía");assert.equal(resource.data.resourceUrl,"https://example.com/guia");assert.equal(resource.data.mediaType,"image");
});

test("proposed Firebase rules isolate media by UID and reject non-images",()=>{
  for(const marker of ["validCommunityMediaPath","resourceUrl","^https://","request.auth.uid, 'posts'","avatarPath","coverPath"])assert.match(firestoreRules,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  assert.match(storageRules,/userId == request\.auth\.uid/);
  assert.match(storageRules,/image\/\(jpeg\|png\|webp\)/);
  assert.match(storageRules,/request\.resource\.size <= 5 \* 1024 \* 1024/);
  assert.match(storageRules,/slot in \['avatar', 'cover'\]/);
  assert.match(storageRules,/match \/\{allPaths=\*\*\}[\s\S]*allow read, write: if false/);
});

test("retired profanity course remains absent from every visible product surface",()=>{
  assert.doesNotMatch(index,/id="(?:homeRude|rudeCourse|rudeLesson|rudeVideos|rudeList)"/);
  assert.doesNotMatch(index,/Groserías en guaraní|GUARANÍ SIN FILTRO|Swear words in Guaraní|Palavrões em guarani|Gros mots en guarani|Parolacce in guaraní|Schimpfwörter auf Guaraní/);
});

test("legacy language repaint cannot relabel Community as Videos",()=>{
  assert.match(index,/views=\[[^\]]*"institutionalExperience"\]/);
  assert.match(index,/views\.includes\(requestedView\).*view:requestedView,scrollY:0/);
  assert.match(stableRuntime,/const SURFACE_NAV_TARGETS=\["home","catalog","practice","dictionary","institutional","videos","suggestions"\]/);
  assert.ok(stableRuntime.includes('.nav-btn[data-go="${go}"] i'));
  assert.doesNotMatch(stableRuntime,/querySelectorAll\("\.bottom-nav \.nav-btn i"\)\.forEach\(\(node,index\)/);
  assert.match(script,/data-community-label="true"/);
});

test("mobile-first styles keep the social feed compact and safe",()=>{
  assert.match(style,/env\(safe-area-inset-bottom\)/);
  assert.match(style,/@media\(max-width:900px\)/);
  assert.match(style,/@media\(max-width:640px\)/);
  assert.match(style,/@media\(max-width:420px\)/);
  assert.match(style,/\.nalvi-community-profile-editor/);
  assert.match(style,/\.nalvi-community-profile-cover/);
  assert.match(style,/\.nalvi-community-feed-tabs/);
  assert.match(style,/overflow-x:clip/);
  assert.match(style,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(style,/border:0!important;outline:0!important;box-shadow:none!important/);
  assert.match(style,/grid-template-columns:minmax\(0,1fr\)/);
});

test("index loads the protected service and new social experience",()=>{
  assert.match(index,/institutionalExperience:true/);
  assert.match(index,/communityWrites:true/);
  assert.match(index,/nalvi-community-service\.js\?v=NALVI-COMMUNITY-SERVICE-6/);
  assert.match(index,/nalvi-institutional-experience\.js\?v=NALVI-COMMUNITY-EXPERIENCE-11/);
  assert.match(index,/nalvi-institutional-experience\.css\?v=NALVI-COMMUNITY-EXPERIENCE-11/);
  for(const operation of ["addDoc","deleteDoc","getDocs","getCountFromServer","orderBy","limit"])assert.match(index,new RegExp(`GCA_FIREBASE_LIVE=.*${operation}`));
});
