/* NALVI Academic Studio · self-service workspace and lightweight classroom tools. */
(function(){
  "use strict";

  const VERSION="NALVI-ACADEMIC-STUDIO-2";
  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
  const cleanLines=(value,maximum=60)=>[...new Set(String(value||"").split(/\r?\n/).map(line=>line.trim()).filter(Boolean))].slice(0,maximum);
  let firebase=null;
  let savedActivities=[];
  let editing={wheel:"",assessment:""};
  let wheelRotation=0;

  function currentUser(){return firebase?.auth?.currentUser||window.GCA_FIREBASE_LIVE?.auth?.currentUser||null}
  function signedIn(){const user=currentUser();return !!user&&!user.isAnonymous}
  function canManage(){return window.GESA_CONTEXT?.canManage===true}
  function institutionId(){return String(window.GESA_CONTEXT?.institutionId||"")}
  function setStatus(selector,message,error=false){const node=$(selector);if(!node)return;node.textContent=message;node.classList.toggle("error",error);node.classList.toggle("ok",!!message&&!error)}
  function waitForFirebase(){if(window.GCA_FIREBASE_LIVE)return Promise.resolve(window.GCA_FIREBASE_LIVE);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("firebase-timeout")),12000);window.addEventListener("gca:firebase-live-ready",()=>{clearTimeout(timer);resolve(window.GCA_FIREBASE_LIVE)},{once:true})})}

  function publicHubMarkup(){
    const user=currentUser(),action=!signedIn()?"Entrar con Google":canManage()?"Abrir Gestión académica":"Crear mi espacio académico";
    return `<section class="nalvi-academic-entry" id="nalviAcademicEntry"><article class="nalvi-academic-entry-card teacher"><span class="nalvi-academic-entry-icon">🏫</span><div><small>PARA DOCENTES E INSTITUCIONES</small><h3>Tu espacio académico</h3><p>Crea grupos, asigna tareas, prepara evaluaciones y organiza actividades en vivo. Cada espacio mantiene sus datos separados.</p>${signedIn()&&!canManage()?`<label>Nombre de tu institución o aula<input id="nalviAcademicWorkspaceName" maxlength="160" value="Aula de ${esc(user?.displayName||"guaraní")}"></label>`:""}<button class="btn" id="nalviAcademicStart" type="button">${esc(action)} →</button><div class="gesa-form-status" id="nalviAcademicStartStatus" role="status"></div></div></article><article class="nalvi-academic-entry-card student"><span class="nalvi-academic-entry-icon">🎯</span><div><small>PARA ESTUDIANTES</small><h3>Entrar con PIN</h3><p>Usa el PIN de seis números compartido por tu profesor. No necesitas pedir acceso adicional.</p><div class="nalvi-academic-pin-row"><input id="nalviAcademicLivePin" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="123456" aria-label="PIN de la actividad"><button class="mini-btn" id="nalviAcademicJoinLive" type="button">Entrar →</button></div><div class="gesa-form-status" id="nalviAcademicJoinStatus" role="status"></div></div></article></section>`;
  }

  function installPublicHub(){
    const page=$("#institutions");if(!page)return;
    $("#gesaPilotJump",page)?.remove();$("#gesaPilotCard",page)?.remove();
    const hero=$(".gesa-hero",page);if(hero){const tag=$(".tag",hero),title=$("h2",hero),intro=$("p",hero);if(tag){tag.removeAttribute("data-gesa");tag.textContent="GESTIÓN ACADÉMICA ABIERTA"}if(title){title.removeAttribute("data-gesa");title.textContent="Enseña guaraní con tus propias aulas"}if(intro){intro.removeAttribute("data-gesa");intro.textContent="Todos los docentes e instituciones pueden organizar grupos, tareas, evaluaciones y actividades en vivo desde su cuenta."}}
    $("#nalviAcademicEntry")?.remove();hero?.insertAdjacentHTML("afterend",publicHubMarkup());
    $("#nalviAcademicStart")?.addEventListener("click",startAcademicSpace);
    $("#nalviAcademicJoinLive")?.addEventListener("click",joinLiveByPin);
  }

  async function startAcademicSpace(){
    if(!signedIn()){window.courseGoogleLogin?.();return}
    if(canManage()){window.show?.("institutional",true);return}
    const button=$("#nalviAcademicStart"),user=currentUser(),name=$("#nalviAcademicWorkspaceName")?.value.trim()||`Aula de ${user.displayName||"guaraní"}`;
    if(name.length<2){setStatus("#nalviAcademicStartStatus","Escribe un nombre para tu espacio.",true);return}
    button.disabled=true;setStatus("#nalviAcademicStartStatus","Creando tu espacio seguro…");
    try{
      const id=`self__${user.uid}`,institutionRef=firebase.doc(firebase.db,"institutions",id),membershipRef=firebase.doc(firebase.db,"institutionMembers",`${id}__${user.uid}`),institutionSnapshot=await firebase.getDoc(institutionRef);
      if(!institutionSnapshot.exists())await firebase.setDoc(institutionRef,{name:name.slice(0,160),country:"",active:true,status:"active",ownerUid:user.uid,selfService:true,createdBy:user.uid,createdAt:firebase.serverTimestamp(),updatedAt:firebase.serverTimestamp()});
      const membershipSnapshot=await firebase.getDoc(membershipRef);
      if(!membershipSnapshot.exists())await firebase.setDoc(membershipRef,{institutionId:id,uid:user.uid,claimedUid:user.uid,email:String(user.email||"").trim().toLowerCase(),name:String(user.displayName||name).slice(0,120),role:"institution_manager",active:true,selfService:true,createdAt:firebase.serverTimestamp(),updatedAt:firebase.serverTimestamp()});
      setStatus("#nalviAcademicStartStatus","Espacio creado. Abriendo Gestión académica…");
      setTimeout(()=>location.reload(),650);
    }catch(error){console.error("NALVI_ACADEMIC_SETUP",error);setStatus("#nalviAcademicStartStatus","No se pudo crear todavía. Verifica que las reglas nuevas de Firestore estén publicadas.",true);button.disabled=false}
  }

  function joinLiveByPin(){
    const pin=$("#nalviAcademicLivePin")?.value.replace(/\D/g,"").slice(0,6)||"";
    if(pin.length!==6){setStatus("#nalviAcademicJoinStatus","Escribe los seis números del PIN.",true);return}
    if(!signedIn()){window.courseGoogleLogin?.();return}
    $("#gca68LiveHome")?.click();setTimeout(()=>{$("#gca68OpenJoin")?.click();setTimeout(()=>{const input=$("#gca68Pin");if(input){input.value=pin;input.focus()}},0)},0);
  }

  function toolsMarkup(){return `<section class="gesa-pane hide nalvi-academic-tools" data-gesa-pane="tools"><div class="gesa-section-head"><div><h3>Herramientas para el aula</h3><p>Prepara actividades de texto sin cargar archivos ni enlaces externos.</p></div><button class="mini-btn" id="nalviOpenLiveFromTools" type="button">Actividad con PIN →</button></div><div class="nalvi-academic-tools-grid"><article class="gesa-card nalvi-wheel-card"><span class="gesa-status active">RULETA</span><h3>Ruleta editable</h3><p>Carga nombres, palabras, frases o preguntas, una por línea.</p><form class="gesa-form" id="nalviWheelForm"><label>Título<input name="title" maxlength="120" required value="Ruleta de la clase"></label><label>Opciones<textarea name="content" maxlength="8000" required placeholder="Mba’éichapa reime?&#10;Che réra…&#10;Moõgua nde?"></textarea></label><div class="gesa-inline-actions"><button class="mini-btn" type="submit">Guardar ruleta</button><button class="btn" id="nalviSpinWheel" type="button">Girar →</button></div><div class="gesa-form-status" id="nalviWheelStatus"></div></form><div class="nalvi-wheel-stage"><div class="nalvi-wheel" id="nalviWheel" aria-hidden="true"><span>Ñ</span></div><div class="nalvi-wheel-pointer">▼</div><strong id="nalviWheelResult">Agrega al menos dos opciones.</strong></div></article><article class="gesa-card"><span class="gesa-status active">EVALUACIONES</span><h3>Banco de preguntas</h3><p>Escribe una pregunta y su respuesta por línea, separadas por <b>|</b>.</p><form class="gesa-form" id="nalviAssessmentBuilder"><label>Título<input name="title" maxlength="120" required value="Evaluación de la clase"></label><label>Preguntas y respuestas<textarea name="content" maxlength="8000" required placeholder="¿Qué significa Maitei? | Saludo&#10;¿Cómo dices nos vemos? | Jajoechata"></textarea></label><button class="btn" type="submit">Guardar evaluación</button><div class="gesa-form-status" id="nalviAssessmentBuilderStatus"></div></form></article></div><div class="gesa-section-head"><div><h3>Actividades guardadas</h3><p>Puedes volver a abrirlas, editarlas o eliminarlas.</p></div><button class="mini-btn" id="nalviReloadActivities" type="button">↻ Actualizar</button></div><div class="gesa-list" id="nalviAcademicSaved"><div class="gesa-state">Todavía no hay actividades guardadas.</div></div></section>`}

  function installTools(){
    const management=$("#institutional[data-gesa-installed='true']");if(!management||!canManage()||$("[data-gesa-tab='tools']",management))return;
    const liveTab=$("[data-gesa-tab='live']",management);liveTab?.insertAdjacentHTML("afterend",'<button class="gesa-tab" data-gesa-tab="tools">🎡 Herramientas</button>');
    const certificates=$("[data-gesa-pane='certificates']",management);certificates?.insertAdjacentHTML("beforebegin",toolsMarkup());
    $("[data-gesa-tab='tools']",management)?.addEventListener("click",()=>{$$("[data-gesa-tab]",management).forEach(button=>button.classList.toggle("active",button.dataset.gesaTab==="tools"));$$("[data-gesa-pane]",management).forEach(pane=>pane.classList.toggle("hide",pane.dataset.gesaPane!=="tools"));loadActivities()});
    $("#nalviWheelForm",management)?.addEventListener("submit",event=>saveActivity(event,"wheel"));
    $("#nalviAssessmentBuilder",management)?.addEventListener("submit",event=>saveActivity(event,"assessment"));
    $("#nalviSpinWheel",management)?.addEventListener("click",spinWheel);
    $("#nalviReloadActivities",management)?.addEventListener("click",loadActivities);
    $("#nalviOpenLiveFromTools",management)?.addEventListener("click",()=>$("[data-gesa-tab='live']",management)?.click());
    $("#nalviAcademicSaved",management)?.addEventListener("click",handleSavedAction);
  }

  async function loadActivities(){
    const root=$("#nalviAcademicSaved"),id=institutionId();if(!root||!id)return;
    root.innerHTML='<div class="gesa-state"><div><div class="spinner"></div>Cargando actividades…</div></div>';
    try{const snapshot=await firebase.getDocs(firebase.query(firebase.collection(firebase.db,"academicActivities"),firebase.where("institutionId","==",id)));savedActivities=snapshot.docs.map(item=>({id:item.id,...item.data()})).sort((a,b)=>String(a.title).localeCompare(String(b.title)));renderActivities()}catch(error){console.error("NALVI_ACADEMIC_LOAD",error);root.innerHTML='<div class="gesa-state error">No pudimos cargar las actividades. Revisa las reglas de Firestore.</div>'}
  }

  function renderActivities(){const root=$("#nalviAcademicSaved");if(!root)return;root.innerHTML=savedActivities.length?savedActivities.map(item=>`<article class="gesa-list-item"><div><span class="gesa-status active">${item.activityType==="wheel"?"🎡 Ruleta":"🎓 Evaluación"}</span><h4>${esc(item.title)}</h4><small>${cleanLines(item.content).length} elemento${cleanLines(item.content).length===1?"":"s"}</small></div><div class="actions"><button class="mini-btn" data-academic-edit="${esc(item.id)}">Editar</button><button class="mini-btn" data-academic-delete="${esc(item.id)}">Eliminar</button></div></article>`).join(""):'<div class="gesa-state">Todavía no hay actividades guardadas.</div>'}

  async function saveActivity(event,type){
    event.preventDefault();const form=event.currentTarget,button=event.submitter,fd=new FormData(form),title=String(fd.get("title")||"").trim(),content=cleanLines(fd.get("content"),type==="wheel"?60:40).join("\n"),status=type==="wheel"?"#nalviWheelStatus":"#nalviAssessmentBuilderStatus";
    if(title.length<2||!content){setStatus(status,"Completa el título y el contenido.",true);return}
    if(type==="wheel"&&cleanLines(content).length<2){setStatus(status,"La ruleta necesita al menos dos opciones.",true);return}
    if(type==="assessment"&&cleanLines(content,40).some(line=>!line.includes("|"))){setStatus(status,"Cada línea debe tener: Pregunta | Respuesta",true);return}
    button.disabled=true;setStatus(status,"Guardando…");
    try{const payload={institutionId:institutionId(),ownerUid:currentUser().uid,activityType:type,title:title.slice(0,120),content,updatedAt:firebase.serverTimestamp()},id=editing[type];if(id){await firebase.setDoc(firebase.doc(firebase.db,"academicActivities",id),payload,{merge:true});editing[type]=""}else await firebase.addDoc(firebase.collection(firebase.db,"academicActivities"),{...payload,createdAt:firebase.serverTimestamp()});form.reset();setStatus(status,"Actividad guardada.");await loadActivities()}catch(error){console.error("NALVI_ACADEMIC_SAVE",error);setStatus(status,"No se pudo guardar. Revisa las reglas de Firestore.",true)}finally{button.disabled=false}
  }

  function handleSavedAction(event){const id=event.target.dataset.academicEdit||event.target.dataset.academicDelete;if(!id)return;const item=savedActivities.find(row=>row.id===id);if(!item)return;if(event.target.dataset.academicEdit){const form=item.activityType==="wheel"?$("#nalviWheelForm"):$("#nalviAssessmentBuilder");if(!form)return;form.elements.title.value=item.title;form.elements.content.value=item.content;editing[item.activityType]=item.id;form.scrollIntoView({behavior:"smooth",block:"center"});form.elements.title.focus();return}if(!confirm(`¿Eliminar “${item.title}”?`))return;event.target.disabled=true;firebase.deleteDoc(firebase.doc(firebase.db,"academicActivities",id)).then(loadActivities).catch(error=>{console.error(error);event.target.disabled=false})}

  function spinWheel(){const form=$("#nalviWheelForm"),items=cleanLines(form?.elements.content.value);if(items.length<2){setStatus("#nalviWheelStatus","La ruleta necesita al menos dos opciones.",true);return}const random=window.crypto?.getRandomValues?(window.crypto.getRandomValues(new Uint32Array(1))[0]/4294967296):Math.random(),index=Math.floor(random*items.length),wheel=$("#nalviWheel"),result=$("#nalviWheelResult");wheelRotation+=1440+(360-index*(360/items.length));if(wheel){wheel.style.setProperty("--wheel-segments",String(items.length));wheel.style.transform=`rotate(${wheelRotation}deg)`}if(result)result.textContent="Girando…";setTimeout(()=>{if(result)result.textContent=items[index]},1250)}

  function refresh(){installPublicHub();installTools();const nav=$(".bottom-nav [data-institution-entry] i");if(nav)nav.textContent="Gestión académica"}
  async function init(){try{firebase=await waitForFirebase();refresh();window.addEventListener("nalvi:auth-known",()=>setTimeout(refresh,100));window.addEventListener("nalvi:role-known",()=>setTimeout(refresh,100));document.addEventListener("change",event=>{if(event.target.matches?.("#headerLang,#lang"))setTimeout(refresh,0)},true);for(let attempt=0;attempt<40&&!$("#institutional[data-gesa-installed='true']");attempt++)await new Promise(resolve=>setTimeout(resolve,100));installTools();document.documentElement.dataset.nalviAcademicStudio=VERSION;window.dispatchEvent(new CustomEvent("nalvi:academic-studio-ready",{detail:{version:VERSION}}))}catch(error){console.error("NALVI_ACADEMIC_STUDIO_INIT",error)}}

  window.NALVI_ACADEMIC_STUDIO={VERSION,refresh,loadActivities};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
