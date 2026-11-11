/* NALVI Live Classroom · private participant calendar and resources. */
(()=>{
  "use strict";

  const VERSION="NALVI-LIVE-CLASSROOM-1";
  const VIEW_ID="liveClassroom";
  const API="/api/premium-academy?operation=live-courses";
  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const esc=value=>String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]);
  const isAdmin=()=>window.GESA_CONTEXT?.role==="platform_admin";
  let state={loaded:false,allowed:false,administrator:false,course:null,classroom:null,error:""};

  async function currentUser(){
    if(window.GCA_FIREBASE_LIVE?.auth?.currentUser)return window.GCA_FIREBASE_LIVE.auth.currentUser;
    return new Promise(resolve=>{const timer=setTimeout(()=>resolve(null),2500);window.addEventListener("gca:firebase-live-ready",()=>{clearTimeout(timer);resolve(window.GCA_FIREBASE_LIVE?.auth?.currentUser||null)},{once:true})});
  }
  async function authHeaders(){const user=await currentUser();return user&&!user.isAnonymous?{Authorization:`Bearer ${await user.getIdToken()}`}:{} }
  const dateTime=value=>{const date=new Date(value);return Number.isNaN(date.getTime())?String(value||""):date.toLocaleString("es-PY",{weekday:"long",day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"})};
  const providerName=value=>({zoom:"Zoom","google-meet":"Google Meet",teams:"Microsoft Teams",other:"Videollamada"}[value]||"Videollamada");
  const resourceIcon=value=>({document:"📄",video:"🎬",audio:"🎧",exercise:"✍️",link:"🔗"}[value]||"🔗");

  function installStyles(){
    if($("#nalviLiveClassroomStyles"))return;
    document.head.insertAdjacentHTML("beforeend",`<style id="nalviLiveClassroomStyles">
      .nalvi-live-classroom{min-height:calc(100vh - 110px);padding:28px 0 150px;background:linear-gradient(135deg,#f8f6ff,#effbfb)}.nalvi-live-shell{display:grid;gap:18px}.nalvi-live-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:24px;border:2px solid #e1daeb;border-radius:24px;background:linear-gradient(135deg,#27185c,#5140c4 62%,#117e84);color:#fff}.nalvi-live-head h2{margin:4px 0 8px;color:#fff}.nalvi-live-head p{margin:0;max-width:760px;color:#fff}.nalvi-live-head-actions{display:flex;gap:9px;flex-wrap:wrap}.nalvi-live-grid{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(280px,.75fr);gap:18px}.nalvi-live-panel{padding:22px;border:2px solid #e1daeb;border-radius:22px;background:#fff;box-shadow:0 16px 38px rgba(49,31,100,.07)}.nalvi-live-panel h3{margin:0 0 5px}.nalvi-live-panel>p{margin:0 0 18px;color:var(--muted)}.nalvi-live-event-list,.nalvi-live-resource-list{display:grid;gap:11px}.nalvi-live-event{display:grid;grid-template-columns:64px minmax(0,1fr) auto;gap:14px;align-items:center;padding:15px;border:1px solid #ddd5e9;border-radius:17px;background:#fbfaff}.nalvi-live-date{display:grid;place-items:center;min-height:58px;border-radius:14px;background:#eee9ff;color:#4c38aa;font-size:22px;font-weight:950}.nalvi-live-event h4,.nalvi-live-resource h4{margin:0 0 5px}.nalvi-live-event p,.nalvi-live-resource p{margin:0;color:var(--muted);font-size:13px}.nalvi-live-resource{display:grid;grid-template-columns:48px minmax(0,1fr) auto;gap:12px;align-items:center;padding:13px;border:1px solid #ddd5e9;border-radius:15px}.nalvi-live-resource-icon{display:grid;place-items:center;width:44px;height:44px;border-radius:12px;background:#eafafa;font-size:22px}.nalvi-live-empty{padding:26px;border:2px dashed #ddd5e9;border-radius:17px;text-align:center;color:var(--muted);font-weight:800}.nalvi-live-admin{grid-column:1/-1}.nalvi-live-editor-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.nalvi-live-editor-list{display:grid;gap:9px}.nalvi-live-editor-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:12px;border:1px solid #ddd5e9;border-radius:14px;background:#faf9fe}.nalvi-live-editor-row input,.nalvi-live-editor-row select,.nalvi-live-editor-row textarea,.nalvi-live-basics input,.nalvi-live-basics textarea{width:100%;min-height:42px;border:1px solid #d8d0e7;border-radius:10px;padding:9px 10px;font:700 13px/1.25 inherit}.nalvi-live-editor-row textarea{grid-column:1/-1;resize:vertical}.nalvi-live-editor-row .danger{justify-self:end}.nalvi-live-basics{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}.nalvi-live-basics textarea{min-height:72px;resize:vertical}.nalvi-live-admin-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:14px}.nalvi-live-status{min-height:24px;margin-top:10px;color:#18725f;font-weight:900}.nalvi-live-status.error{color:#ad3453}@media(max-width:850px){.nalvi-live-grid,.nalvi-live-editor-grid{grid-template-columns:1fr}.nalvi-live-head{display:grid}.nalvi-live-event{grid-template-columns:54px minmax(0,1fr)}.nalvi-live-event>a{grid-column:1/-1}.nalvi-live-basics{grid-template-columns:1fr}}
    </style>`);
  }

  function installView(){
    if($("#liveClassroom"))return $("#liveClassroom");
    const nav=$(".bottom-nav");if(!nav)return null;
    nav.insertAdjacentHTML("beforebegin",`<section class="view nalvi-live-classroom" id="liveClassroom" aria-label="Mi programa en vivo"><div class="container nalvi-live-shell"><div class="nalvi-live-head"><div><small>PROGRAMA PRIVADO</small><h2>Mi programa en vivo</h2><p>Consulta tus próximas clases y accede a los recursos preparados para tu grupo.</p></div><div class="nalvi-live-head-actions"><button class="ghost-btn" type="button" data-live-refresh>Actualizar</button><button class="ghost-btn" type="button" data-live-close>Volver</button></div></div><div data-live-content></div></div></section>`);
    try{if(typeof views!=="undefined"&&!views.includes(VIEW_ID))views.push(VIEW_ID)}catch{}
    const view=$("#liveClassroom");
    view.addEventListener("click",handleClick);
    return view;
  }

  function installAccountEntry(){
    const menu=$("#accountMenu"),logout=$("#logoutBtn",menu);if(!menu||!logout)return null;
    let button=$("[data-live-classroom-entry]",menu);
    if(!button){button=document.createElement("button");button.type="button";button.className="mini-btn";button.dataset.liveClassroomEntry="";button.textContent="📅 Mi programa en vivo";button.hidden=true;menu.insertBefore(button,logout);button.addEventListener("click",open)}
    button.hidden=!state.allowed;
    return button;
  }

  function eventMarkup(event){
    const date=new Date(event.startsAt),day=Number.isNaN(date.getTime())?"•":String(date.getDate()).padStart(2,"0");
    return `<article class="nalvi-live-event"><div class="nalvi-live-date">${esc(day)}</div><div><h4>${esc(event.title)}</h4><p>${esc(dateTime(event.startsAt))} · ${esc(providerName(event.provider))}</p>${event.notes?`<p>${esc(event.notes)}</p>`:""}</div><a class="primary-btn" href="${esc(event.joinUrl)}" target="_blank" rel="noopener noreferrer">Entrar a la clase</a></article>`;
  }
  function resourceMarkup(resource){return `<article class="nalvi-live-resource"><div class="nalvi-live-resource-icon">${resourceIcon(resource.type)}</div><div><h4>${esc(resource.title)}</h4>${resource.description?`<p>${esc(resource.description)}</p>`:""}</div><a class="ghost-btn" href="${esc(resource.url)}" target="_blank" rel="noopener noreferrer">Abrir</a></article>`}

  function editorRow(kind,item={},index=0){
    if(kind==="event")return `<div class="nalvi-live-editor-row" data-live-event-editor><input aria-label="Título de la clase" data-field="title" value="${esc(item.title)}" placeholder="Título de la clase" required><input aria-label="Fecha y hora" data-field="startsAt" type="datetime-local" value="${esc(String(item.startsAt||"").slice(0,16))}" required><select aria-label="Plataforma" data-field="provider">${["zoom","google-meet","teams","other"].map(value=>`<option value="${value}"${item.provider===value?" selected":""}>${providerName(value)}</option>`).join("")}</select><input aria-label="Enlace HTTPS" data-field="joinUrl" type="url" value="${esc(item.joinUrl)}" placeholder="https://…" required><textarea aria-label="Notas" data-field="notes" placeholder="Indicaciones opcionales">${esc(item.notes)}</textarea><button class="mini-btn danger" type="button" data-live-remove>Eliminar</button><input type="hidden" data-field="id" value="${esc(item.id||`class-${index+1}`)}"></div>`;
    return `<div class="nalvi-live-editor-row" data-live-resource-editor><input aria-label="Título del recurso" data-field="title" value="${esc(item.title)}" placeholder="Título del recurso" required><select aria-label="Tipo de recurso" data-field="type">${["document","video","audio","exercise","link"].map(value=>`<option value="${value}"${item.type===value?" selected":""}>${esc(value)}</option>`).join("")}</select><input aria-label="Enlace HTTPS" data-field="url" type="url" value="${esc(item.url)}" placeholder="https://…" required><input aria-label="Descripción" data-field="description" value="${esc(item.description)}" placeholder="Descripción breve"><button class="mini-btn danger" type="button" data-live-remove>Eliminar</button><input type="hidden" data-field="id" value="${esc(item.id||`resource-${index+1}`)}"></div>`;
  }

  function render(){
    installView();installAccountEntry();
    const content=$("[data-live-content]");if(!content)return;
    if(!state.loaded){content.innerHTML=`<div class="nalvi-live-panel"><div class="nalvi-live-empty">Cargando tu programa…</div></div>`;return}
    if(!state.allowed){content.innerHTML=`<div class="nalvi-live-panel"><h3>Acceso todavía no habilitado</h3><p>Esta pantalla se activa automáticamente cuando se confirma tu inscripción y el pago del programa.</p></div>`;return}
    const classroom=state.classroom||{title:"Mi programa de Guaraní en vivo",welcome:"",events:[],resources:[]};
    const upcoming=(classroom.events||[]).filter(event=>Date.parse(event.startsAt)>=Date.now()-7_200_000);
    content.innerHTML=`<div class="nalvi-live-grid"><section class="nalvi-live-panel"><h3>Próximas clases</h3><p>${esc(classroom.welcome||"Aquí encontrarás tus próximos encuentros.")}</p><div class="nalvi-live-event-list">${upcoming.length?upcoming.map(eventMarkup).join(""):`<div class="nalvi-live-empty">Todavía no hay clases programadas. Te avisaremos cuando el calendario esté listo.</div>`}</div></section><aside class="nalvi-live-panel"><h3>Recursos del programa</h3><p>Materiales exclusivos para acompañar tus clases.</p><div class="nalvi-live-resource-list">${classroom.resources?.length?classroom.resources.map(resourceMarkup).join(""):`<div class="nalvi-live-empty">Los materiales aparecerán aquí.</div>`}</div></aside>${state.administrator?`<section class="nalvi-live-panel nalvi-live-admin"><h3>Administrar calendario y recursos</h3><p>Los enlaces guardados aquí solo se entregan a personas con acceso activo.</p><div class="nalvi-live-basics"><input data-live-title value="${esc(classroom.title)}" placeholder="Nombre del espacio"><textarea data-live-welcome placeholder="Mensaje para participantes">${esc(classroom.welcome)}</textarea></div><div class="nalvi-live-editor-grid"><div><h4>Clases</h4><div class="nalvi-live-editor-list" data-live-event-list>${(classroom.events||[]).map((item,index)=>editorRow("event",item,index)).join("")}</div><button class="mini-btn" type="button" data-live-add-event>+ Agregar clase</button></div><div><h4>Recursos</h4><div class="nalvi-live-editor-list" data-live-resource-list>${(classroom.resources||[]).map((item,index)=>editorRow("resource",item,index)).join("")}</div><button class="mini-btn" type="button" data-live-add-resource>+ Agregar recurso</button></div></div><div class="nalvi-live-admin-actions"><button class="primary-btn" type="button" data-live-save>Guardar programa</button></div><div class="nalvi-live-status" data-live-status aria-live="polite"></div></section>`:""}</div>`;
  }

  async function load({quiet=false}={}){
    if(!quiet){state.loaded=false;render()}
    try{
      const headers=await authHeaders();if(!headers.Authorization)throw new Error("AUTH_REQUIRED");
      const response=await fetch(`${API}&action=classroom`,{headers}),payload=await response.json().catch(()=>({}));
      if(response.status===403){state={loaded:true,allowed:false,administrator:false,course:null,classroom:null,error:""};render();return false}
      if(!response.ok)throw new Error(payload.reason||"CLASSROOM_UNAVAILABLE");
      state={loaded:true,allowed:true,administrator:payload.administrator===true,course:payload.course,classroom:payload.classroom,error:""};render();return true;
    }catch(error){state={...state,loaded:true,allowed:false,error:String(error?.message||"")};render();return false}
  }

  function collectRows(selector){return $$(selector).map(row=>Object.fromEntries($$("[data-field]",row).map(field=>[field.dataset.field,field.value.trim()]))) }
  async function save(button){
    button.disabled=true;const status=$("[data-live-status]");status.textContent="Guardando…";status.classList.remove("error");
    try{
      const response=await fetch(`${API}&action=admin-classroom-save`,{method:"POST",headers:{"Content-Type":"application/json",...await authHeaders()},body:JSON.stringify({title:$("[data-live-title]")?.value||"",welcome:$("[data-live-welcome]")?.value||"",events:collectRows("[data-live-event-editor]"),resources:collectRows("[data-live-resource-editor]")})}),payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.reason||"SAVE_FAILED");state.classroom=payload.classroom;render();window.showToast?.("Programa en vivo guardado.");
    }catch(error){button.disabled=false;status.textContent=String(error?.message||"")==="INVALID_CLASS_EVENT"?"Revisa que cada clase tenga título, fecha y un enlace HTTPS válido.":"No se pudo guardar. Revisa los datos e inténtalo de nuevo.";status.classList.add("error")}
  }

  function handleClick(event){
    if(event.target.closest("[data-live-close]")){window.show?.("home");return}
    if(event.target.closest("[data-live-refresh]")){load();return}
    const remove=event.target.closest("[data-live-remove]");if(remove){remove.closest("[data-live-event-editor],[data-live-resource-editor]")?.remove();return}
    if(event.target.closest("[data-live-add-event]")){$("[data-live-event-list]")?.insertAdjacentHTML("beforeend",editorRow("event",{},Date.now()));return}
    if(event.target.closest("[data-live-add-resource]")){$("[data-live-resource-list]")?.insertAdjacentHTML("beforeend",editorRow("resource",{},Date.now()));return}
    const saveButton=event.target.closest("[data-live-save]");if(saveButton)save(saveButton);
  }

  async function open(){installStyles();installView();window.show?.(VIEW_ID,true);await load()}
  function init(){installStyles();installView();installAccountEntry();setTimeout(()=>load({quiet:true}),600);window.addEventListener("gca:firebase-live-ready",()=>setTimeout(()=>load({quiet:true}),50));window.addEventListener("nalvi:role-known",()=>setTimeout(()=>load({quiet:true}),50));if(location.hash===`#${VIEW_ID}`)setTimeout(open,0)}
  window.NALVI_LIVE_CLASSROOM={VERSION,open,refresh:()=>load()};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
