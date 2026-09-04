import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const scriptUrl=new URL("../../assets/js/nalvi-institutional-experience.js",import.meta.url);
const serviceUrl=new URL("../../assets/js/nalvi-community-service.js",import.meta.url);
const styleUrl=new URL("../../assets/css/nalvi-institutional-experience.css",import.meta.url);
const notificationScriptUrl=new URL("../../assets/js/nalvi-notification-center.js",import.meta.url);
const notificationStyleUrl=new URL("../../assets/css/nalvi-notification-center.css",import.meta.url);
const academicScriptUrl=new URL("../../assets/js/nalvi-academic-studio.js",import.meta.url);
const academicStyleUrl=new URL("../../assets/css/nalvi-academic-studio.css",import.meta.url);
const audioManifestUrl=new URL("../../assets/audio/guarani/ali-2026/manifest.json",import.meta.url);
const indexUrl=new URL("../../index.html",import.meta.url);
const firestoreRulesUrl=new URL("../../firebase/proposals/REGLAS-FIRESTORE-COMUNIDAD-PARA-COPIAR.rules",import.meta.url);
const script=await readFile(scriptUrl,"utf8");
const service=await readFile(serviceUrl,"utf8");
const style=await readFile(styleUrl,"utf8");
const notificationScript=await readFile(notificationScriptUrl,"utf8");
const notificationStyle=await readFile(notificationStyleUrl,"utf8");
const academicScript=await readFile(academicScriptUrl,"utf8");
const academicStyle=await readFile(academicStyleUrl,"utf8");
const audioManifest=JSON.parse(await readFile(audioManifestUrl,"utf8"));
const index=await readFile(indexUrl,"utf8");
const firestoreRules=await readFile(firestoreRulesUrl,"utf8");
const stableRuntime=index.match(/<script id="gca59-stable-runtime">([\s\S]*?)<\/script>/)?.[1]||"";

test("community is a focused social network without academic-management tabs",()=>{
  assert.match(script,/const VERSION="NALVI-COMMUNITY-EXPERIENCE-14"/);
  assert.match(script,/class="nalvi-community-stream"/);
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
  for(const operation of ["subscribePosts","subscribeProfiles","subscribeNotifications","createRemotePost","deleteRemotePost","toggleReaction","createComment","toggleFollow","saveOwnProfile","recordView"])assert.match(service,new RegExp(operation));
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
    getDoc:async ref=>({exists:()=>ref.path.endsWith("communityProfiles/otra")||ref.path.endsWith("communityProfiles/alicia"),data:()=>ref.path.endsWith("communityProfiles/alicia")?{displayName:"Alicia Pública",bio:""}:{},ref}),
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
  assert.equal(await api.createComment("post-1","Mba’éichapa reime?","comment-1"),"post-1");
  assert.equal(await api.toggleFollow("otra"),true);
  assert.equal(await api.saveOwnProfile("Alicia Ñe’ẽ","Docente de guaraní"),true);
  assert.equal(await api.deleteRemotePost("post-1"),true);
  assert.ok(writes.some(item=>item.kind==="add"&&item.path.endsWith("communityPosts")));
  assert.ok(writes.some(item=>item.kind==="add"&&item.path.endsWith("communityPosts/post-1/comments")&&item.data.parentCommentId==="comment-1"&&item.data.body==="Mba’éichapa reime?"));
  assert.ok(writes.some(item=>item.kind==="set"&&item.path.endsWith("communityProfiles/alicia")));
  assert.ok(writes.some(item=>item.kind==="set"&&item.path.endsWith("communityProfiles/otra/followers/alicia")));
  assert.ok(writes.some(item=>item.kind==="delete"&&item.path.endsWith("communityPosts/post-1")));
  assert.equal(writes.find(item=>item.kind==="add"&&item.path.endsWith("communityPosts")).data.authorName,"Alicia Pública");
  assert.ok(writes.some(item=>item.kind==="set"&&item.data.displayName==="Alicia Ñe’ẽ"&&item.data.bio==="Docente de guaraní"));
});

test("feed supports discovery, likes, replies, views, sharing, own deletion and followers",()=>{
  for(const marker of ["data-community-feed","data-community-topic","data-community-comment","data-community-reply-comment","data-parent-comment-id","parentCommentId","data-community-like","data-community-share","data-community-delete","data-community-follow","data-community-hide","data-community-report","recordView","followers","confirmRemove"])assert.match(script+service,new RegExp(marker));
  assert.match(script,/currentUid\(\)===post\.authorId/);
  assert.match(script,/state\.feed==="following"/);
  assert.match(service,/communityProfiles/);
  assert.match(service,/firebase\.limit\(12\)/);
  assert.match(service,/POST_COOLDOWN_MS=15000/);
  assert.match(service,/COMMUNITY_DUPLICATE_POST/);
  assert.match(script,/show\("suggestions",true\)/);
});

test("profiles are searchable, editable and keep rewards inside the profile",()=>{
  assert.match(script,/nalviCommunityPeopleSearch/);
  assert.match(script,/nalviCommunityDisplayName/);
  assert.match(script,/subscribeProfiles/);
  assert.match(script,/data-community-profile/);
  assert.match(script,/communityNavigationBound/);
  assert.match(script,/event\.target\.closest\?\.\("\[data-community-profile\]"\)/);
  assert.match(script,/function profilePanel\(\)/);
  assert.match(script,/nalvi-community-profile-reward/);
  assert.match(script,/contributionScore/);
  assert.match(script,/hiddenAuthorIds:new Set\(\)/);
  assert.match(service,/safeName\(current\.displayName\)\|\|safeName\(user\.displayName\)/);
  assert.match(script,/stored\?\.displayName\|\|post\?\.author\|\|account\?\.displayName/);
  assert.match(service,/safePhoto\(user\.photoURL\)/);
  assert.doesNotMatch(script,/type="file"|nalviCommunityAvatarInput|nalviCommunityCoverInput/);
  assert.doesNotMatch(script,/type="email"|name="email"/);
});

test("social copy is Guaraní-first with support in all six UI languages",()=>{
  for(const locale of ["es","en","pt","fr","it","de"])assert.match(script,new RegExp(`\\b${locale}:\\{`));
  for(const term of ["Ñañe’ẽ guaraníme","Jahai guaraníme","Ehai guaraníme","Emoherakuã","Mbohovái","Ndéve g̃uarã","Marandukuéra","Porandukuéra","Ñemoarandu"])assert.match(script,new RegExp(term));
  for(const term of ["Personas para descubrir","Mi perfil","seguidores","visualizaciones"])assert.match(script,new RegExp(term));
});

test("community is text-only and never exposes uploads or external resource links",()=>{
  for(const marker of ["nalviCommunityResourceTitle","nalviCommunityResourceUrl","nalviCommunityPostImage","type=\"file\"","firebase-storage.js","storageRef,uploadBytes","COMMUNITY_INVALID_RESOURCE_URL"])assert.doesNotMatch(script+service+index,new RegExp(marker));
  assert.match(service,/CATEGORY_KEYS=Object\.freeze\(\["community","announcements","questions","learning"\]\)/);
  assert.doesNotMatch(service,/mediaPath|mediaType|resourceTitle|resourceUrl|uploadImage/);
});

test("profile edits never modify authentication or email fields",()=>{
  const saveFunction=service.match(/async function saveOwnProfile[\s\S]*?\n  }/)?.[0]||"";
  assert.match(saveFunction,/displayName:name,bio:normalizeBio\(bio\)/);
  assert.doesNotMatch(saveFunction,/email|updateProfile|auth\./);
  assert.match(script,/Tu correo no se muestra ni se modifica/);
});

test("proposed Firebase rules are text-only and validate public names against profiles",()=>{
  for(const removed of ["validCommunityMediaPath","resourceUrl","avatarPath","coverPath","'resources'"])assert.doesNotMatch(firestoreRules,new RegExp(removed));
  assert.match(firestoreRules,/communityProfilePath\(request\.auth\.uid\)/);
  assert.match(firestoreRules,/authorName == get\(communityProfilePath\(request\.auth\.uid\)\)\.data\.displayName/);
  assert.match(firestoreRules,/request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\.hasOnly\(\[\s*'displayName', 'photoURL', 'bio', 'updatedAt'/);
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

test("global bell exposes relevant read-only Community notifications",()=>{
  assert.match(service,/const VERSION="NALVI-COMMUNITY-SERVICE-9"/);
  assert.match(notificationScript,/const VERSION="NALVI-NOTIFICATION-CENTER-1"/);
  for(const marker of ["nalviNotificationButton","nalviNotificationBadge","nalviNotificationPanel","subscribeNotifications","Marandu · Notificaciones","comment","like","follow","nalviCommunityNotificationsSeen.v1","openPost"])assert.match(notificationScript,new RegExp(marker));
  assert.match(notificationScript,/header \.stats/);
  assert.match(notificationScript,/aria-haspopup="dialog"/);
  assert.match(notificationStyle,/\.nalvi-notification-panel\{position:fixed/);
  assert.match(notificationStyle,/@media\(max-width:760px\)/);
  assert.doesNotMatch(service,/notification(?:s)?\s*[,)]\s*payload|addDoc\([^\n]*notification/i);
});

test("notification subscription excludes self interactions and merges comments, likes and follows",async()=>{
  const notifications=[];
  const timestamp=value=>({toMillis:()=>value,toDate:()=>new Date(value)});
  const reference=path=>({path});
  const snapshot=(id,data,path)=>({id,ref:reference(path),data:()=>data});
  const firebase={
    auth:{currentUser:{uid:"alicia",displayName:"Alicia",isAnonymous:false}},db:reference("db"),
    doc:(base,...parts)=>reference(`${base.path}/${parts.join("/")}`),collection:(base,...parts)=>reference(`${base.path}/${parts.join("/")}`),
    query:(base,...constraints)=>({...base,constraints}),where:(field,operator,value)=>({kind:"where",field,operator,value}),orderBy:(field,direction)=>({kind:"orderBy",field,direction}),limit:value=>({kind:"limit",value}),
    onSnapshot:(query,onNext)=>{
      if(query.path==="db/communityProfiles/alicia/followers")onNext({docs:[snapshot("maria",{createdAt:timestamp(1000)},query.path)]});
      else if(query.path==="db/communityPosts")onNext({docs:[snapshot("post-1",{authorId:"alicia",body:"Che aikuaa",createdAt:timestamp(900)},"db/communityPosts/post-1")]});
      else if(query.path.endsWith("/comments"))onNext({docs:[snapshot("comment-1",{authorId:"maria",authorName:"María",body:"Iporã",createdAt:timestamp(3000)},`${query.path}/comment-1`),snapshot("self",{authorId:"alicia",authorName:"Alicia",body:"Aguyje",createdAt:timestamp(3100)},`${query.path}/self`)]});
      else if(query.path.endsWith("/reactions"))onNext({docs:[snapshot("jorge",{type:"like",createdAt:timestamp(2000)},`${query.path}/jorge`),snapshot("alicia",{type:"like",createdAt:timestamp(2100)},`${query.path}/alicia`)]});
      return()=>{};
    }
  };
  const context=vm.createContext({window:{GCA_FEATURES:{communityWrites:true},GCA_FIREBASE_LIVE:firebase},Date,JSON,Error,TypeError,String,Math,Map,Set,Object,Promise,setTimeout,clearTimeout,Intl,document:{documentElement:{lang:"es"}}});
  vm.runInContext(service,context);
  const unsubscribe=context.window.NALVI_COMMUNITY_SERVICE.subscribeNotifications(items=>notifications.push(items));
  await new Promise(resolve=>setTimeout(resolve,0));
  const latest=notifications.at(-1)||[];
  assert.deepEqual([...latest.map(item=>item.kind)].sort(),["comment","follow","like"]);
  assert.ok(latest.every(item=>item.actorId!=="alicia"));
  assert.deepEqual(latest.map(item=>item.createdAt),[3000,2000,1000]);
  unsubscribe();
});

test("composer keeps normal keyboard input while the game overlay is closed",()=>{
  assert.match(index,/if\(overlay\.hidden\|\|editableTarget\(event\.target\)\)return/);
  assert.match(index,/target\.closest\("input,textarea,select,\[contenteditable='true'\]"\)/);
  assert.match(script,/root\.addEventListener\("keydown",event=>\{if\(event\.target\.closest/);
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
  assert.match(index,/nalvi-community-service\.js\?v=NALVI-COMMUNITY-SERVICE-9/);
  assert.match(index,/nalvi-institutional-experience\.js\?v=NALVI-COMMUNITY-EXPERIENCE-14/);
  assert.match(index,/nalvi-institutional-experience\.css\?v=NALVI-COMMUNITY-EXPERIENCE-14/);
  assert.match(index,/nalvi-notification-center\.js\?v=NALVI-NOTIFICATION-CENTER-1/);
  assert.match(index,/nalvi-notification-center\.css\?v=NALVI-NOTIFICATION-CENTER-1/);
  for(const operation of ["addDoc","deleteDoc","getDocs","getCountFromServer","orderBy","limit"])assert.match(index,new RegExp(`GCA_FIREBASE_LIVE=.*${operation}`));
  assert.doesNotMatch(index,/firebase-storage\.js|storageRef,uploadBytes|getDownloadURL,deleteObject/);
});

test("academic management is self-service and exposes classes, wheel, live PIN and progress",()=>{
  assert.match(academicScript,/const VERSION="NALVI-ACADEMIC-STUDIO-3"/);
  for(const marker of ["self__${user.uid}","institutionMembers","institution_manager","nalviAcademicClassCode","joinGroupByCode","nalviAcademicLivePin","gca68OpenJoin",'data-gesa-tab="tools"',"academicActivities","activityType","wheel","assessment","Crear una clase","Abrir la ruleta","Actividad con PIN","Ver el avance"])assert.match(academicScript,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  assert.match(index,/nalvi-academic-studio\.js\?v=NALVI-ACADEMIC-STUDIO-3/);
  assert.match(index,/nalvi-academic-studio\.css\?v=NALVI-ACADEMIC-STUDIO-2/);
  assert.doesNotMatch(academicScript,/sin aprobación manual/);
  assert.match(academicStyle,/\.nalvi-wheel/);
  assert.match(academicStyle,/\.nalvi-academic-quick-grid/);
  assert.match(academicStyle,/@media\(max-width:430px\)/);
  assert.match(firestoreRules,/match \/academicActivities\/\{activityId\}/);
  assert.match(firestoreRules,/isOwnSelfInstitution/);
  assert.match(firestoreRules,/ownsSelfInstitution/);
  assert.match(firestoreRules,/memberId == request\.resource\.data\.get\('institutionId', ''\) \+ '__' \+ request\.auth\.uid/);
});

test("academic login intent returns to management instead of bouncing to home",()=>{
  assert.match(academicScript,/nalviAcademicIntent\.v1/);
  assert.match(academicScript,/requestLogin\("teacher"\)/);
  assert.match(academicScript,/rememberIntent\("openDashboard"\)/);
  assert.match(academicScript,/restorePendingIntent\("role"\)/);
  assert.match(index,/if\(id==="institutional"&&!window\.canAccessInstitutional\)\{id="institutions"\}/);
  assert.doesNotMatch(index,/if\(id==="institutional"&&!window\.canAccessInstitutional\)\{id="home"/);
  assert.match(index,/if\(!window\.canAccessInstitutional&&location\.hash==="#institutional"\)show\("institutions",true\)/);
});

test("legacy academic loader delegates after the secure management shell is installed",()=>{
  assert.match(index,/document\.querySelector\("#institutional\[data-gesa-installed='true'\]"\)\)return window\.GESA\?\.loadAcademic\?\.\(\)/);
});

test("class and live codes normalize predictably and preserve separate flows",()=>{
  const context=vm.createContext({window:{},document:{readyState:"loading",addEventListener(){}},Date,JSON,Error,TypeError,String,Math,Set,Promise,setTimeout,clearTimeout,setInterval,clearInterval});
  vm.runInContext(academicScript,context);
  const api=context.window.NALVI_ACADEMIC_STUDIO;
  assert.equal(api.normalizeClassCode(" gcaabc123 "),"GCA-ABC123");
  assert.equal(api.normalizeClassCode("gca-xy12z9"),"GCA-XY12Z9");
  assert.equal(api.normalizeLivePin("12 34-56x"),"123456");
  assert.match(academicScript,/where\("studentEmail","==",email\)/);
  assert.match(academicScript,/\^GCA-\[A-Z0-9\]\{6\}\$/);
});

test("academic studio stays text-only while uploads would require paid storage",()=>{
  assert.doesNotMatch(academicScript,/type="file"|uploadBytes|getDownloadURL|firebase-storage|storageRef/);
  assert.match(academicScript,/Prepara actividades de texto/);
});

test("listening practice expands to every authorized human recording without exposing internal metadata",()=>{
  assert.equal(audioManifest.count,99);
  assert.equal(audioManifest.recordings.length,99);
  assert.equal(new Set(audioManifest.recordings.map(recording=>recording.id)).size,99);
  assert.match(index,/const AUTHORIZED_LISTENING_COUNT=99/);
  assert.match(index,/registry\.list\(\)\.map\(recording=>registry\.authorize\(/);
  assert.match(index,/practices\.listen=activities/);
  assert.match(index,/audio:recording\.audioId/);
  assert.match(index,/publicAudioLabel=value=>String\(value\|\|""\)\.split\("\("\)\[0\]\.trim\(\)/);
  assert.match(index,/showsInternalAudioMetadata:false/);
  assert.match(index,/data-audio-label-playing="Pausar"/);
  assert.match(index,/playPronunciation\(item\.audio,event\.currentTarget\)/);
});
