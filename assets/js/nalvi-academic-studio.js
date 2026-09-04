/* NALVI Academic Studio · self-service classrooms and lightweight teaching tools. */
(function(){
  "use strict";

  const VERSION="NALVI-ACADEMIC-STUDIO-3";
  const INTENT_KEY="nalviAcademicIntent.v1";
  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
  const cleanLines=(value,maximum=60)=>[...new Set(String(value||"").split(/\r?\n/).map(line=>line.trim()).filter(Boolean))].slice(0,maximum);
  const normalizeClassCode=value=>String(value||"").trim().toUpperCase().replace(/\s+/g,"").replace(/^GCA(?=[A-Z0-9]{6}$)/,"GCA-").slice(0,10);
  const normalizeLivePin=value=>String(value||"").replace(/\D/g,"").slice(0,6);
  const courseLabel=value=>({general:"Guaraní general",police:"Guaraní para Policía",medicine:"Guaraní para Medicina",kids:"Jugar"})[value]||"Guaraní";
  let firebase=null;
  let savedActivities=[];
  let studentClasses=[];
  let editing={wheel:"",assessment:""};
  let wheelRotation=0;
  let restoringIntent=false;

  function currentUser(){return firebase?.auth?.currentUser||window.GCA_FIREBASE_LIVE?.auth?.currentUser||null}
  function signedIn(){const user=currentUser();return !!user&&!user.isAnonymous}
  function canManage(){return window.GESA_CONTEXT?.canManage===true}
  function institutionId(){return String(window.GESA_CONTEXT?.institutionId||"")}
  function setStatus(selector,message,error=false){const node=$(selector);if(!node)return;node.textContent=message;node.classList.toggle("error",error);node.classList.toggle("ok",!!message&&!error)}
  function waitForFirebase(){if(window.GCA_FIREBASE_LIVE)return Promise.resolve(window.GCA_FIREBASE_LIVE);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("firebase-timeout")),12000);window.addEventListener("gca:firebase-live-ready",()=>{clearTimeout(timer);resolve(window.GCA_FIREBASE_LIVE)},{once:true})})}
  function waitForGesa(){if(window.GESA?.joinGroupByCode)return Promise.resolve(window.GESA);return new Promise((resolve,reject)=>{let attempts=0;const timer=setInterval(()=>{attempts+=1;if(window.GESA?.joinGroupByCode){clearInterval(timer);resolve(window.GESA)}else if(attempts>=80){clearInterval(timer);reject(new Error("academic-service-timeout"))}},100)})}
  function rememberIntent(kind,value=""){try{sessionStorage.setItem(INTENT_KEY,JSON.stringify({kind,value,createdAt:Date.now()}))}catch{}}
  function readIntent(){try{const value=JSON.parse(sessionStorage.getItem(INTENT_KEY)||"null");if(!value||Date.now()-Number(value.createdAt||0)>15*60*1000)return null;return value}catch{return null}}
  function clearIntent(){try{sessionStorage.removeItem(INTENT_KEY)}catch{}}
  function requestLogin(kind,value=""){rememberIntent(kind,value);window.show?.("institutions",true);window.courseGoogleLogin?.()}

  function publicHubMarkup(){
    const user=currentUser(),action=!signedIn()?"Entrar con Google":canManage()?"Abrir mi panel":"Crear mi espacio docente";
    return `<section class="nalvi-academic-entry" id="nalviAcademicEntry"><article class="nalvi-academic-entry-card teacher"><span class="nalvi-academic-entry-icon">🏫</span><div><small>DOCENTES</small><h3>Crea y organiza tus clases</h3><p>Comparte un código, asigna actividades, usa la ruleta y revisa el avance de cada alumno.</p>${signedIn()&&!canManage()?`<label>Nombre de tu espacio<input id="nalviAcademicWorkspaceName" maxlength="160" value="Aula de ${esc(user?.displayName||"guaraní")}"></label>`:""}<button class="btn" id="nalviAcademicStart" type="button">${esc(action)} →</button><div class="gesa-form-status" id="nalviAcademicStartStatus" role="status" aria-live="polite"></div></div></article><article class="nalvi-academic-entry-card student"><span class="nalvi-academic-entry-icon">👥</span><div><small>ESTUDIANTES</small><h3>Únete a una clase</h3><p>Escribe una sola vez el código que te dio tu profesor.</p><div class="nalvi-academic-pin-row class-code"><input id="nalviAcademicClassCode" maxlength="10" autocomplete="off" placeholder="GCA-ABC123" aria-label="Código de la clase"><button class="mini-btn" id="nalviAcademicJoinClass" type="button">Unirme</button></div><div class="gesa-form-status" id="nalviAcademicClassStatus" role="status" aria-live="polite"></div><div class="nalvi-academic-live-entry"><b>¿La actividad ya comenzó?</b><div class="nalvi-academic-pin-row"><input id="nalviAcademicLivePin" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="PIN de 6 números" aria-label="PIN de la actividad"><button class="mini-btn" id="nalviAcademicJoinLive" type="button">Entrar en vivo</button></div><div class="gesa-form-status" id="nalviAcademicJoinStatus" role="status" aria-live="polite"></div></div></div></article></section><section class="nalvi-student-class-section" id="nalviStudentClassSection" hidden><div class="gesa-section-head"><div><h3>Mis clases</h3><p>Solo aparecen las clases a las que te uniste.</p></div></div><div class="nalvi-student-class-list" id="nalviStudentClassList"></div></section>`;
  }

  function installPublicHub(){
    const page=$("#institutions");if(!page)return;
    $("#gesaPilotJump",page)?.remove();$("#gesaPilotCard",page)?.remove();
    const hero=$(".gesa-hero",page);
    if(hero){
      const tag=$(".tag",hero),title=$("h2",hero),intro=$("p",hero);
      if(tag){tag.removeAttribute("data-gesa");tag.textContent="GESTIÓN ACADÉMICA"}
      if(title){title.removeAttribute("data-gesa");title.textContent="Tu aula, en un solo lugar"}
      if(intro){intro.removeAttribute("data-gesa");intro.textContent="Crea una clase o entra con el código de tu profesor."}
      $(".gesa-hero-visual",hero)?.remove();
    }
    $$("#institutions .shell > .gesa-grid").forEach(grid=>grid.hidden=true);
    $("#nalviAcademicEntry")?.remove();$("#nalviStudentClassSection")?.remove();hero?.insertAdjacentHTML("afterend",publicHubMarkup());
    $("#nalviAcademicStart")?.addEventListener("click",startAcademicSpace);
    $("#nalviAcademicJoinClass")?.addEventListener("click",joinClassByCode);
    $("#nalviAcademicJoinLive")?.addEventListener("click",joinLiveByPin);
    $("#nalviAcademicClassCode")?.addEventListener("input",event=>{event.target.value=normalizeClassCode(event.target.value)});
    $("#nalviAcademicClassCode")?.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();joinClassByCode()}});
    $("#nalviAcademicLivePin")?.addEventListener("input",event=>{event.target.value=normalizeLivePin(event.target.value)});
    $("#nalviAcademicLivePin")?.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();joinLiveByPin()}});
    loadStudentClasses();
  }

  async function startAcademicSpace(){
    if(!signedIn()){requestLogin("teacher");return}
    if(canManage()){clearIntent();window.show?.("institutional",true);setTimeout(()=>$("#nalviAcademicQuickStart")?.scrollIntoView({behavior:"smooth",block:"start"}),0);return}
    const button=$("#nalviAcademicStart"),user=currentUser(),name=$("#nalviAcademicWorkspaceName")?.value.trim()||`Aula de ${user.displayName||"guaraní"}`;
    if(name.length<2){setStatus("#nalviAcademicStartStatus","Escribe un nombre para tu espacio.",true);return}
    button.disabled=true;setStatus("#nalviAcademicStartStatus","Creando tu espacio…");
    try{
      const id=`self__${user.uid}`,institutionRef=firebase.doc(firebase.db,"institutions",id),membershipRef=firebase.doc(firebase.db,"institutionMembers",`${id}__${user.uid}`),institutionSnapshot=await firebase.getDoc(institutionRef);
      if(!institutionSnapshot.exists())await firebase.setDoc(institutionRef,{name:name.slice(0,160),country:"",active:true,status:"active",ownerUid:user.uid,selfService:true,createdBy:user.uid,createdAt:firebase.serverTimestamp(),updatedAt:firebase.serverTimestamp()});
      const membershipSnapshot=await firebase.getDoc(membershipRef);
      if(!membershipSnapshot.exists())await firebase.setDoc(membershipRef,{institutionId:id,uid:user.uid,claimedUid:user.uid,email:String(user.email||"").trim().toLowerCase(),name:String(user.displayName||name).slice(0,120),role:"institution_manager",active:true,selfService:true,createdAt:firebase.serverTimestamp(),updatedAt:firebase.serverTimestamp()});
      rememberIntent("openDashboard");setStatus("#nalviAcademicStartStatus","Listo. Abriendo tu panel…");setTimeout(()=>location.reload(),350);
    }catch(error){console.error("NALVI_ACADEMIC_SETUP",error);setStatus("#nalviAcademicStartStatus","No se pudo crear. Revisa la conexión y vuelve a intentarlo.",true);button.disabled=false}
  }

  async function joinClassByCode(){
    const code=normalizeClassCode($("#nalviAcademicClassCode")?.value||readIntent()?.value||"");
    if(!/^GCA-[A-Z0-9]{6}$/.test(code)){setStatus("#nalviAcademicClassStatus","Escribe un código como GCA-ABC123.",true);return}
    if(!signedIn()){requestLogin("joinClass",code);return}
    const button=$("#nalviAcademicJoinClass");if(button)button.disabled=true;setStatus("#nalviAcademicClassStatus","Buscando tu clase…");
    try{
      const gesa=await waitForGesa(),joined=await gesa.joinGroupByCode(code,currentUser());
      if(!joined)throw new Error("invalid-class-code");
      clearIntent();setStatus("#nalviAcademicClassStatus","¡Listo! Ya estás dentro de la clase.");await loadStudentClasses();
      setTimeout(()=>$("#nalviStudentClassSection")?.scrollIntoView({behavior:"smooth",block:"start"}),100);
    }catch(error){console.error("NALVI_ACADEMIC_CLASS_JOIN",error);setStatus("#nalviAcademicClassStatus","No encontramos una clase activa con ese código.",true)}
    finally{if(button)button.disabled=false}
  }

  function joinLiveByPin(){
    const pin=normalizeLivePin($("#nalviAcademicLivePin")?.value||readIntent()?.value||"");
    if(pin.length!==6){setStatus("#nalviAcademicJoinStatus","Escribe los seis números del PIN.",true);return}
    if(!signedIn()){requestLogin("joinLive",pin);return}
    clearIntent();$("#gca68LiveHome")?.click();
    setTimeout(()=>{$("#gca68OpenJoin")?.click();setTimeout(()=>{const input=$("#gca68Pin");if(input){input.value=pin;input.focus()}},0)},0);
  }

  async function loadStudentClasses(){
    const section=$("#nalviStudentClassSection"),root=$("#nalviStudentClassList");if(!section||!root)return;
    if(!signedIn()){studentClasses=[];section.hidden=true;return}
    try{
      const email=String(currentUser().email||"").trim().toLowerCase();if(!email){section.hidden=true;return}
      const snapshot=await firebase.getDocs(firebase.query(firebase.collection(firebase.db,"enrollments"),firebase.where("studentEmail","==",email)));
      studentClasses=snapshot.docs.map(item=>({id:item.id,...item.data()})).filter(item=>item.active!==false);renderStudentClasses();
    }catch(error){console.info("NALVI_ACADEMIC_STUDENT_CLASSES",error?.code||error);section.hidden=true}
  }

  function renderStudentClasses(){
    const section=$("#nalviStudentClassSection"),root=$("#nalviStudentClassList");if(!section||!root)return;section.hidden=!studentClasses.length;
    root.innerHTML=studentClasses.map(item=>`<article class="nalvi-student-class"><span>📚</span><div><h4>${esc(item.groupName||"Clase de guaraní")}</h4><p>${esc(courseLabel(item.courseId))}${item.teacherName?` · ${esc(item.teacherName)}`:""}</p></div><button class="mini-btn" type="button" data-academic-class-open="${esc(item.groupId||"")}">Abrir</button></article>`).join("");
    $$("[data-academic-class-open]",root).forEach(button=>button.addEventListener("click",()=>window.show?.("progressHub",true)));
  }

  function toolsMarkup(){return `<section class="gesa-pane hide nalvi-academic-tools" data-gesa-pane="tools"><div class="gesa-section-head"><div><h3>Ruleta y preguntas</h3><p>Prepara actividades de texto para proyectar o compartir en clase.</p></div><button class="mini-btn" id="nalviOpenLiveFromTools" type="button">Crear actividad con PIN →</button></div><div class="nalvi-academic-tools-grid"><article class="gesa-card nalvi-wheel-card"><span class="gesa-status active">RULETA</span><h3>Ruleta editable</h3><p>Carga nombres, palabras, frases o preguntas, una por línea.</p><form class="gesa-form" id="nalviWheelForm"><label>Título<input name="title" maxlength="120" required value="Ruleta de la clase"></label><label>Opciones<textarea name="content" maxlength="8000" required placeholder="Mba’éichapa reime?&#10;Che réra…&#10;Moõgua nde?"></textarea></label><div class="gesa-inline-actions"><button class="mini-btn" type="submit">Guardar ruleta</button><button class="btn" id="nalviSpinWheel" type="button">Girar →</button></div><div class="gesa-form-status" id="nalviWheelStatus"></div></form><div class="nalvi-wheel-stage"><div class="nalvi-wheel" id="nalviWheel" aria-hidden="true"><span>Ñ</span></div><div class="nalvi-wheel-pointer">▼</div><strong id="nalviWheelResult">Agrega al menos dos opciones.</strong></div></article><article class="gesa-card"><span class="gesa-status active">PREGUNTAS</span><h3>Banco de preguntas</h3><p>Escribe una pregunta y su respuesta por línea, separadas por <b>|</b>.</p><form class="gesa-form" id="nalviAssessmentBuilder"><label>Título<input name="title" maxlength="120" required value="Preguntas de la clase"></label><label>Preguntas y respuestas<textarea name="content" maxlength="8000" required placeholder="¿Qué significa Maitei? | Saludo&#10;¿Cómo dices nos vemos? | Jajoechata"></textarea></label><button class="btn" type="submit">Guardar preguntas</button><div class="gesa-form-status" id="nalviAssessmentBuilderStatus"></div></form></article></div><div class="gesa-section-head"><div><h3>Actividades guardadas</h3><p>Puedes volver a abrirlas, editarlas o eliminarlas.</p></div><button class="mini-btn" id="nalviReloadActivities" type="button">↻ Actualizar</button></div><div class="gesa-list" id="nalviAcademicSaved"><div class="gesa-state">Todavía no hay actividades guardadas.</div></div></section>`}

  function installTools(){
    const management=$("#institutional[data-gesa-installed='true']");if(!management||!canManage()||$("[data-gesa-tab='tools']",management))return;
    const liveTab=$("[data-gesa-tab='live']",management);liveTab?.insertAdjacentHTML("afterend",'<button class="gesa-tab" data-gesa-tab="tools">🎡 Ruleta</button>');
    const certificates=$("[data-gesa-pane='certificates']",management);certificates?.insertAdjacentHTML("beforebegin",toolsMarkup());
    $("[data-gesa-tab='tools']",management)?.addEventListener("click",()=>openTool("tools"));
    $("#nalviWheelForm",management)?.addEventListener("submit",event=>saveActivity(event,"wheel"));
    $("#nalviAssessmentBuilder",management)?.addEventListener("submit",event=>saveActivity(event,"assessment"));
    $("#nalviSpinWheel",management)?.addEventListener("click",spinWheel);
    $("#nalviReloadActivities",management)?.addEventListener("click",loadActivities);
    $("#nalviOpenLiveFromTools",management)?.addEventListener("click",()=>openTool("live"));
    $("#nalviAcademicSaved",management)?.addEventListener("click",handleSavedAction);
  }

  function dashboardMarkup(){return `<section class="nalvi-academic-quick-start" id="nalviAcademicQuickStart"><div class="gesa-section-head"><div><h3>¿Qué quieres hacer?</h3><p>Elige una opción. Puedes volver aquí cuando quieras.</p></div></div><div class="nalvi-academic-quick-grid"><button type="button" data-academic-quick="groups"><span>👥</span><b>Crear una clase</b><small>Comparte un código con tus alumnos.</small></button><button type="button" data-academic-quick="tools"><span>🎡</span><b>Abrir la ruleta</b><small>Carga nombres, palabras o preguntas.</small></button><button type="button" data-academic-quick="live"><span>🎯</span><b>Actividad con PIN</b><small>Inicia una práctica en vivo.</small></button><button type="button" data-academic-quick="summary"><span>📈</span><b>Ver el avance</b><small>Revisa el progreso de cada alumno.</small></button><button type="button" data-academic-quick="assignments"><span>📝</span><b>Asignar una tarea</b><small>Elige clase, lección y fecha.</small></button></div></section>`}

  function installDashboard(){
    const management=$("#institutional[data-gesa-installed='true']");if(!management||!canManage())return;
    const hero=$(".staff-hero",management);
    if(hero){const tag=$(".tag",hero),title=$("h2",hero),intro=$("p",hero);if(tag)tag.textContent="🏫 MI ESPACIO DOCENTE";if(title)title.textContent="Gestión académica";if(intro)intro.textContent="Tus clases, actividades y alumnos organizados de forma sencilla."}
    const toolbar=$(".gesa-management-toolbar",management);if(toolbar&&!$("#nalviAcademicQuickStart",management))toolbar.insertAdjacentHTML("afterend",dashboardMarkup());
    const security=$(".gesa-note.security",management);if(security)security.textContent="🔐 Cada clase y su progreso están protegidos por la cuenta y el código de acceso.";
    const labels={summary:"🏠 Inicio",groups:"👥 Mis clases",assignments:"📝 Tareas",assessments:"📈 Progreso",live:"🎯 Actividad con PIN",certificates:"🏅 Certificados",institution:"🏫 Mi espacio",tools:"🎡 Ruleta"};
    $$("[data-gesa-tab]",management).forEach(button=>{if(labels[button.dataset.gesaTab])button.textContent=labels[button.dataset.gesaTab]});
    const groupPane=$("[data-gesa-pane='groups']",management),groupHeading=$(".gesa-card h3",groupPane),groupIntro=$(".gesa-card p",groupPane),studentField=$("textarea[name='studentEmails']",groupPane)?.closest("label");
    if(groupHeading)groupHeading.textContent="Crear una clase";
    if(groupIntro)groupIntro.textContent="Ponle un nombre y comparte el código. No necesitas agregar alumnos uno por uno.";
    if(studentField?.firstChild)studentField.firstChild.textContent="Correos de alumnos (opcional)";
    if(!management.dataset.nalviAcademicQuickBound){management.dataset.nalviAcademicQuickBound="true";management.addEventListener("click",event=>{const button=event.target.closest?.("[data-academic-quick]");if(!button)return;openTool(button.dataset.academicQuick);if(button.dataset.academicQuick==="groups")setTimeout(()=>$("#gesaGroupForm input[name='name']")?.focus(),0)})}
  }

  function openTool(name){
    const management=$("#institutional[data-gesa-installed='true']");if(!management)return;
    $$("[data-gesa-tab]",management).forEach(button=>button.classList.toggle("active",button.dataset.gesaTab===name));
    $$("[data-gesa-pane]",management).forEach(pane=>pane.classList.toggle("hide",pane.dataset.gesaPane!==name));
    if(name==="tools")loadActivities();
    setTimeout(()=>$("[data-gesa-pane='"+name+"']",management)?.scrollIntoView({behavior:"smooth",block:"start"}),0);
  }

  async function loadActivities(){
    const root=$("#nalviAcademicSaved"),id=institutionId();if(!root||!id)return;
    root.innerHTML='<div class="gesa-state"><div><div class="spinner"></div>Cargando actividades…</div></div>';
    try{const snapshot=await firebase.getDocs(firebase.query(firebase.collection(firebase.db,"academicActivities"),firebase.where("institutionId","==",id)));savedActivities=snapshot.docs.map(item=>({id:item.id,...item.data()})).sort((a,b)=>String(a.title).localeCompare(String(b.title)));renderActivities()}catch(error){console.error("NALVI_ACADEMIC_LOAD",error);root.innerHTML='<div class="gesa-state error">No pudimos cargar las actividades.</div>'}
  }

  function renderActivities(){const root=$("#nalviAcademicSaved");if(!root)return;root.innerHTML=savedActivities.length?savedActivities.map(item=>`<article class="gesa-list-item"><div><span class="gesa-status active">${item.activityType==="wheel"?"🎡 Ruleta":"🎓 Preguntas"}</span><h4>${esc(item.title)}</h4><small>${cleanLines(item.content).length} elemento${cleanLines(item.content).length===1?"":"s"}</small></div><div class="actions"><button class="mini-btn" data-academic-edit="${esc(item.id)}">Editar</button><button class="mini-btn" data-academic-delete="${esc(item.id)}">Eliminar</button></div></article>`).join(""):'<div class="gesa-state">Todavía no hay actividades guardadas.</div>'}

  async function saveActivity(event,type){
    event.preventDefault();const form=event.currentTarget,button=event.submitter,fd=new FormData(form),title=String(fd.get("title")||"").trim(),content=cleanLines(fd.get("content"),type==="wheel"?60:40).join("\n"),status=type==="wheel"?"#nalviWheelStatus":"#nalviAssessmentBuilderStatus";
    if(title.length<2||!content){setStatus(status,"Completa el título y el contenido.",true);return}
    if(type==="wheel"&&cleanLines(content).length<2){setStatus(status,"La ruleta necesita al menos dos opciones.",true);return}
    if(type==="assessment"&&cleanLines(content,40).some(line=>!line.includes("|"))){setStatus(status,"Cada línea debe tener: Pregunta | Respuesta",true);return}
    button.disabled=true;setStatus(status,"Guardando…");
    try{const payload={institutionId:institutionId(),ownerUid:currentUser().uid,activityType:type,title:title.slice(0,120),content,updatedAt:firebase.serverTimestamp()},id=editing[type];if(id){await firebase.setDoc(firebase.doc(firebase.db,"academicActivities",id),payload,{merge:true});editing[type]=""}else await firebase.addDoc(firebase.collection(firebase.db,"academicActivities"),{...payload,createdAt:firebase.serverTimestamp()});form.reset();setStatus(status,"Actividad guardada.");await loadActivities()}catch(error){console.error("NALVI_ACADEMIC_SAVE",error);setStatus(status,"No se pudo guardar. Revisa la conexión.",true)}finally{button.disabled=false}
  }

  function handleSavedAction(event){const id=event.target.dataset.academicEdit||event.target.dataset.academicDelete;if(!id)return;const item=savedActivities.find(row=>row.id===id);if(!item)return;if(event.target.dataset.academicEdit){const form=item.activityType==="wheel"?$("#nalviWheelForm"):$("#nalviAssessmentBuilder");if(!form)return;form.elements.title.value=item.title;form.elements.content.value=item.content;editing[item.activityType]=item.id;form.scrollIntoView({behavior:"smooth",block:"center"});form.elements.title.focus();return}if(!confirm(`¿Eliminar “${item.title}”?`))return;event.target.disabled=true;firebase.deleteDoc(firebase.doc(firebase.db,"academicActivities",id)).then(loadActivities).catch(error=>{console.error(error);event.target.disabled=false})}

  function spinWheel(){const form=$("#nalviWheelForm"),items=cleanLines(form?.elements.content.value);if(items.length<2){setStatus("#nalviWheelStatus","La ruleta necesita al menos dos opciones.",true);return}const random=window.crypto?.getRandomValues?(window.crypto.getRandomValues(new Uint32Array(1))[0]/4294967296):Math.random(),index=Math.floor(random*items.length),wheel=$("#nalviWheel"),result=$("#nalviWheelResult");wheelRotation+=1440+(360-index*(360/items.length));if(wheel){wheel.style.setProperty("--wheel-segments",String(items.length));wheel.style.transform=`rotate(${wheelRotation}deg)`}if(result)result.textContent="Girando…";setTimeout(()=>{if(result)result.textContent=items[index]},1250)}

  async function restorePendingIntent(source){
    const intent=readIntent();if(!intent||restoringIntent||!signedIn())return;restoringIntent=true;
    try{
      window.show?.("institutions",true);
      if(intent.kind==="joinClass"){const input=$("#nalviAcademicClassCode");if(input)input.value=normalizeClassCode(intent.value);await joinClassByCode()}
      else if(intent.kind==="joinLive"){const input=$("#nalviAcademicLivePin");if(input)input.value=normalizeLivePin(intent.value);joinLiveByPin()}
      else if(intent.kind==="openDashboard"&&canManage()){clearIntent();window.show?.("institutional",true)}
      else if(intent.kind==="teacher"&&source==="role"){if(canManage()){clearIntent();window.show?.("institutional",true)}else await startAcademicSpace()}
    }finally{restoringIntent=false}
  }

  function refresh(){installPublicHub();installTools();installDashboard();const nav=$(".bottom-nav [data-institution-entry] i");if(nav)nav.textContent="Gestión académica"}
  async function init(){
    try{
      firebase=await waitForFirebase();refresh();
      window.addEventListener("nalvi:auth-known",()=>setTimeout(()=>{refresh();restorePendingIntent("auth")},100));
      window.addEventListener("nalvi:role-known",()=>setTimeout(()=>{refresh();restorePendingIntent("role")},100));
      document.addEventListener("change",event=>{if(event.target.matches?.("#headerLang,#lang"))setTimeout(refresh,0)},true);
      for(let attempt=0;attempt<40&&!$("#institutional[data-gesa-installed='true']");attempt++)await new Promise(resolve=>setTimeout(resolve,100));
      installTools();installDashboard();restorePendingIntent("role");
      document.documentElement.dataset.nalviAcademicStudio=VERSION;
      window.dispatchEvent(new CustomEvent("nalvi:academic-studio-ready",{detail:{version:VERSION}}));
    }catch(error){console.error("NALVI_ACADEMIC_STUDIO_INIT",error)}
  }

  window.NALVI_ACADEMIC_STUDIO={VERSION,refresh,loadActivities,loadStudentClasses,normalizeClassCode,normalizeLivePin};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
