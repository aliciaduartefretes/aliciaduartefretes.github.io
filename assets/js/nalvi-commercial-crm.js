/* NALVI Commercial CRM · admin-only live course lead management. */
(()=>{
  "use strict";

  const VERSION="NALVI-COMMERCIAL-CRM-2";
  const API="/api/premium-academy?operation=live-courses";
  const STATUSES={
    waitlist:"Nuevo · por contactar",
    contacted:"Contactado",
    payment_pending:"Pago pendiente",
    enrolled:"Inscrito",
    active:"Cursando",
    completed:"Finalizado",
    not_interested:"No interesado"
  };
  const EMAIL_TEMPLATES={
    cohort_details:"Información del programa",
    payment_instructions:"Siguiente paso de inscripción",
    welcome_enrolled:"Bienvenida al programa",
    course_news:"Novedades de NALVI"
  };
  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const esc=value=>String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]);
  const normalize=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
  let interests=[];
  let metrics={total:0,marketingEligible:0,pendingContact:0,customers:0,byStatus:{}};
  let registeredUsers=0;
  let loading=false;

  function isAdmin(){return window.GESA_CONTEXT?.role==="platform_admin"}
  async function currentUser(){
    if(window.GCA_FIREBASE_LIVE?.auth?.currentUser)return window.GCA_FIREBASE_LIVE.auth.currentUser;
    return new Promise(resolve=>{const timer=setTimeout(()=>resolve(null),2500);window.addEventListener("gca:firebase-live-ready",()=>{clearTimeout(timer);resolve(window.GCA_FIREBASE_LIVE?.auth?.currentUser||null)},{once:true})});
  }
  async function authHeaders(){const user=await currentUser();return user&&!user.isAnonymous?{Authorization:`Bearer ${await user.getIdToken()}`}:{} }
  const dateText=value=>{if(!value)return"Sin fecha";const parsed=new Date(value);return Number.isNaN(parsed.getTime())?String(value):parsed.toLocaleDateString("es-PY",{day:"2-digit",month:"short",year:"numeric"})};
  const scheduleText=value=>({"weekday-evenings":"Entre semana tarde/noche","saturday-mornings":"Sábado por la mañana",flexible:"Flexible",other:"Otro"}[value]||"Sin preferencia");
  const levelText=value=>({new:"Desde cero",beginner:"Básico",intermediate:"Intermedio"}[value]||"Sin nivel");
  const paymentText=value=>({full:"Pago completo",monthly:"Mensual"}[value]||"Sin preferencia");
  const phoneUrl=value=>{const digits=String(value||"").replace(/\D/g,"");return digits.length>=7?`https://wa.me/${digits}`:""};

  function installStyles(){
    if($("#nalviCommercialCrmStyles"))return;
    document.head.insertAdjacentHTML("beforeend",`<style id="nalviCommercialCrmStyles">
      .nalvi-commercial-crm{display:grid;gap:18px}.nalvi-commercial-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.nalvi-commercial-head h3{margin:5px 0}.nalvi-commercial-head p{margin:0;color:var(--muted);max-width:720px}.nalvi-commercial-actions{display:flex;gap:9px;flex-wrap:wrap}
      .nalvi-commercial-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.nalvi-commercial-metric{padding:16px;border:2px solid #e1daeb;border-radius:17px;background:#fff}.nalvi-commercial-metric b{display:block;font-size:28px;line-height:1;color:#5940b7}.nalvi-commercial-metric span{display:block;margin-top:7px;color:var(--muted);font-size:12px;font-weight:900}
      .nalvi-commercial-consent{padding:13px 15px;border:1px solid #d8d0e7;border-radius:14px;background:#faf8ff;color:var(--muted);font-weight:800}.nalvi-commercial-sender{display:block;margin-top:7px;color:#4f3e9f}.nalvi-commercial-tools{display:grid;grid-template-columns:minmax(220px,1fr) 210px 210px;gap:10px}.nalvi-commercial-tools input,.nalvi-commercial-tools select,.nalvi-commercial-lead select,.nalvi-commercial-lead textarea,.nalvi-commercial-lead input[type=date]{width:100%;min-height:44px;border:2px solid #e1daeb;border-radius:13px;background:#fff;padding:10px 12px;color:var(--ink);font:800 14px/1.2 inherit}
      .nalvi-commercial-list{display:grid;gap:12px}.nalvi-commercial-lead{padding:17px;border:2px solid #e3dcec;border-radius:18px;background:#fff}.nalvi-commercial-lead[hidden]{display:none!important}.nalvi-commercial-lead-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.nalvi-commercial-lead h4{margin:0 0 3px}.nalvi-commercial-lead p{margin:5px 0;color:var(--muted)}.nalvi-commercial-badges{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}.nalvi-commercial-badge{display:inline-flex;padding:5px 8px;border-radius:999px;background:#f1edfb;color:#5940a9;font-size:11px;font-weight:950}.nalvi-commercial-badge.allowed{background:#e4f7ef;color:#12684f}.nalvi-commercial-badge.blocked{background:#f4f1f6;color:#756d80}.nalvi-commercial-lead-grid{display:grid;grid-template-columns:180px minmax(220px,1fr) 160px;gap:10px;align-items:end;margin-top:12px}.nalvi-commercial-lead label{display:grid;gap:5px;color:var(--muted);font-size:12px;font-weight:900}.nalvi-commercial-lead textarea{min-height:76px;resize:vertical}.nalvi-commercial-email{display:grid;grid-template-columns:minmax(240px,360px) auto;gap:8px;align-items:end;margin-top:12px;padding-top:12px;border-top:1px solid #ece7f2}.nalvi-commercial-email small{grid-column:1/-1;color:var(--muted);font-weight:800}.nalvi-commercial-lead-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.nalvi-commercial-empty{padding:28px;border:2px dashed #ddd4e9;border-radius:17px;text-align:center;color:var(--muted);font-weight:850}.nalvi-commercial-status{min-height:20px;color:#1a795d;font-weight:850}.nalvi-commercial-status.error{color:#b43752}
      @media(max-width:1000px){.nalvi-commercial-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.nalvi-commercial-tools,.nalvi-commercial-lead-grid,.nalvi-commercial-email{grid-template-columns:1fr}}
      @media(max-width:680px){.nalvi-commercial-head,.nalvi-commercial-lead-head{flex-direction:column}.nalvi-commercial-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.nalvi-commercial-actions>*{flex:1}.nalvi-commercial-lead-actions>*{width:100%;text-align:center}}
    </style>`);
  }

  function paneMarkup(){
    return `<section class="gesa-pane hide nalvi-commercial-crm" data-gesa-pane="commercial-crm" data-platform-only role="tabpanel" aria-hidden="true">
      <header class="nalvi-commercial-head"><div><span class="tag">GESTIÓN COMERCIAL</span><h3>Personas interesadas y alumnos</h3><p>Gestiona desde el primer contacto hasta la inscripción. Los permisos de contacto y de marketing se mantienen separados.</p></div><div class="nalvi-commercial-actions"><button class="mini-btn" id="nalviCommercialRefresh" type="button">Actualizar</button><button class="mini-btn" id="nalviCommercialExport" type="button">Exportar con permiso</button></div></header>
      <div class="nalvi-commercial-metrics" id="nalviCommercialMetrics"></div>
      <div class="nalvi-commercial-consent">Email marketing: solo se incluyen las personas que marcaron “recibir noticias”. Las demás pueden recibir únicamente mensajes relacionados con la cohorte que solicitaron.<span class="nalvi-commercial-sender">Remitente profesional: <b>NALVI · Equipo Académico &lt;cursos@correo.idiomaguarani.com.py&gt;</b>. Las respuestas llegan a <b>aliciaduartefretes@gmail.com</b>.</span></div>
      <div class="nalvi-commercial-tools"><input id="nalviCommercialSearch" type="search" placeholder="Buscar por nombre, correo, país o WhatsApp" aria-label="Buscar personas"><select id="nalviCommercialStatusFilter" aria-label="Filtrar por estado"><option value="">Todos los estados</option>${Object.entries(STATUSES).map(([value,label])=>`<option value="${value}">${esc(label)}</option>`).join("")}</select><select id="nalviCommercialMarketingFilter" aria-label="Filtrar por permiso de marketing"><option value="">Todos los permisos</option><option value="yes">Aceptó novedades</option><option value="no">No aceptó novedades</option></select></div>
      <div class="nalvi-commercial-status" id="nalviCommercialStatus" role="status" aria-live="polite"></div>
      <div class="nalvi-commercial-list" id="nalviCommercialList"><div class="nalvi-commercial-empty">Abre este panel para cargar las inscripciones.</div></div>
    </section>`;
  }

  function install(){
    if(!isAdmin())return false;
    const management=$("#institutional[data-gesa-installed='true']"),tabs=$(".gesa-tabs",management),workspace=$(".nalvi-academic-workspace",management);
    if(!management||!tabs||!workspace)return false;
    if(!$("[data-gesa-tab='commercial-crm']",management)){
      const adminTab=$("[data-gesa-tab='admin-overview']",tabs);
      const button=document.createElement("button");button.className="gesa-tab";button.type="button";button.dataset.gesaTab="commercial-crm";button.dataset.platformOnly="";button.innerHTML='<span class="nalvi-academic-nav-icon" aria-hidden="true">📋</span><span class="nalvi-academic-nav-copy"><b>Comercial</b><small>Inscritos y seguimiento</small></span>';
      adminTab?.insertAdjacentElement("afterend",button);if(!adminTab)tabs.prepend(button);
      workspace.insertAdjacentHTML("beforeend",paneMarkup());
      button.addEventListener("click",()=>open());
      $("#nalviCommercialRefresh",management)?.addEventListener("click",()=>load(true));
      $("#nalviCommercialExport",management)?.addEventListener("click",exportMarketingContacts);
      ["#nalviCommercialSearch","#nalviCommercialStatusFilter","#nalviCommercialMarketingFilter"].forEach(selector=>$(selector,management)?.addEventListener(selector.includes("Search")?"input":"change",filter));
      $("#nalviCommercialList",management)?.addEventListener("click",handleListClick);
    }
    registeredUsers=Array.isArray(window.GESA_DATA?.users)?window.GESA_DATA.users.length:registeredUsers;
    renderMetrics();
    return true;
  }

  function setStatus(message="",error=false){const node=$("#nalviCommercialStatus");if(node){node.textContent=message;node.classList.toggle("error",error)}}

  function renderMetrics(){
    const root=$("#nalviCommercialMetrics");if(!root)return;
    const rows=[[registeredUsers,"Usuarios totales"],[metrics.total||interests.length,"Interesados"],[metrics.pendingContact||0,"Por contactar"],[metrics.marketingEligible||0,"Aceptan novedades"],[metrics.customers||0,"Inscritos/clientes"]];
    root.innerHTML=rows.map(([value,label])=>`<article class="nalvi-commercial-metric"><b>${Number(value)||0}</b><span>${esc(label)}</span></article>`).join("");
  }

  function leadMarkup(item){
    const status=STATUSES[item.status]?item.status:"waitlist",whatsapp=phoneUrl(item.whatsapp);
    const templates=Object.entries(EMAIL_TEMPLATES).filter(([value])=>value!=="course_news"||item.marketingConsent===true);
    const search=normalize(`${item.name} ${item.email} ${item.whatsapp} ${item.country} ${item.goal}`);
    return `<article class="nalvi-commercial-lead" data-commercial-id="${esc(item.id)}" data-commercial-search="${esc(search)}" data-commercial-status="${esc(status)}" data-commercial-marketing="${item.marketingConsent===true?"yes":"no"}">
      <div class="nalvi-commercial-lead-head"><div><h4>${esc(item.name||"Sin nombre")}</h4><p>${esc(item.email||"")}${item.whatsapp?` · ${esc(item.whatsapp)}`:""}</p></div><small>Registrado: ${esc(dateText(item.createdAt))}</small></div>
      <div class="nalvi-commercial-badges"><span class="nalvi-commercial-badge">${esc(item.country||"Sin país")}</span><span class="nalvi-commercial-badge">${esc(levelText(item.level))}</span><span class="nalvi-commercial-badge">${esc(scheduleText(item.schedule))}</span><span class="nalvi-commercial-badge">${esc(paymentText(item.paymentPreference))}</span><span class="nalvi-commercial-badge ${item.marketingConsent===true?"allowed":"blocked"}">${item.marketingConsent===true?"✓ Aceptó novedades":"Sin permiso de marketing"}</span></div>
      ${item.goal?`<p><b>Objetivo:</b> ${esc(item.goal)}</p>`:""}
      <div class="nalvi-commercial-lead-grid"><label>Estado<select data-commercial-field="status">${Object.entries(STATUSES).map(([value,label])=>`<option value="${value}" ${value===status?"selected":""}>${esc(label)}</option>`).join("")}</select></label><label>Notas internas<textarea data-commercial-field="notes" maxlength="1200" placeholder="Qué conversaron y próximo paso">${esc(item.notes||"")}</textarea></label><label>Próximo seguimiento<input data-commercial-field="followUpAt" type="date" value="${esc(String(item.followUpAt||"").slice(0,10))}"></label></div>
      <div class="nalvi-commercial-email"><label>Correo profesional<select data-commercial-field="emailTemplate">${templates.map(([value,label])=>`<option value="${value}">${esc(label)}</option>`).join("")}</select></label><button class="mini-btn" type="button" data-commercial-email>Enviar desde NALVI</button><small>${item.lastEmailAt?`Último correo: ${esc(EMAIL_TEMPLATES[item.lastEmailType]||item.lastEmailType)} · ${esc(dateText(item.lastEmailAt))}`:"Todavía no se envió un correo manual desde el CRM."}</small></div>
      <div class="nalvi-commercial-lead-actions"><button class="btn" type="button" data-commercial-save>Guardar seguimiento</button>${whatsapp?`<a class="mini-btn" href="${esc(whatsapp)}" target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>`:""}</div>
    </article>`;
  }

  function render(){
    const root=$("#nalviCommercialList");if(!root)return;
    root.innerHTML=interests.length?interests.map(leadMarkup).join(""):'<div class="nalvi-commercial-empty">Todavía no hay personas inscritas en esta cohorte.</div>';
    renderMetrics();filter();
  }

  function filter(){
    const query=normalize($("#nalviCommercialSearch")?.value),status=$("#nalviCommercialStatusFilter")?.value||"",marketing=$("#nalviCommercialMarketingFilter")?.value||"";
    $$("[data-commercial-id]").forEach(row=>{row.hidden=Boolean(query&&!row.dataset.commercialSearch.includes(query)||status&&row.dataset.commercialStatus!==status||marketing&&row.dataset.commercialMarketing!==marketing)});
  }

  async function load(force=false){
    if(loading||interests.length&&!force)return;
    loading=true;setStatus("Cargando información comercial…");
    try{
      const response=await fetch(`${API}&action=admin-list`,{headers:await authHeaders()}),payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.reason||"ADMIN_LIST_FAILED");
      interests=Array.isArray(payload.interests)?payload.interests:[];metrics=payload.metrics||{};render();setStatus(`Actualizado: ${new Date().toLocaleTimeString("es-PY",{hour:"2-digit",minute:"2-digit"})}`);
    }catch(error){console.error("NALVI_COMMERCIAL_LOAD",error);setStatus("No pudimos cargar el panel comercial. Actualiza e inténtalo nuevamente.",true)}finally{loading=false}
  }

  async function saveCard(card,button){
    const id=card.dataset.commercialId,body={id,status:$("[data-commercial-field='status']",card)?.value,notes:$("[data-commercial-field='notes']",card)?.value,followUpAt:$("[data-commercial-field='followUpAt']",card)?.value};
    button.disabled=true;button.textContent="Guardando…";setStatus("");
    try{
      const response=await fetch(`${API}&action=admin-update`,{method:"POST",headers:{"Content-Type":"application/json",...await authHeaders()},body:JSON.stringify(body)}),payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.reason||"ADMIN_UPDATE_FAILED");
      const index=interests.findIndex(item=>item.id===id);if(index>=0)interests[index]=payload.interest;await load(true);setStatus(`Seguimiento de ${payload.interest.name||"la persona"} guardado.`);window.showToast?.("Seguimiento guardado.");
    }catch(error){console.error("NALVI_COMMERCIAL_UPDATE",error);setStatus("No se pudo guardar el seguimiento. Inténtalo nuevamente.",true);button.disabled=false;button.textContent="Guardar seguimiento"}
  }

  async function sendCardEmail(card,button){
    const id=card.dataset.commercialId,template=$("[data-commercial-field='emailTemplate']",card)?.value;
    if(!id||!template)return;
    button.disabled=true;button.textContent="Enviando…";setStatus("");
    try{
      const response=await fetch(`${API}&action=admin-send-email`,{method:"POST",headers:{"Content-Type":"application/json",...await authHeaders()},body:JSON.stringify({id,template})}),payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.reason||"EMAIL_SEND_FAILED");
      const index=interests.findIndex(item=>item.id===id);if(index>=0)interests[index]=payload.interest;
      render();setStatus(`Correo profesional enviado a ${payload.interest.email}.`);window.showToast?.("Correo enviado desde NALVI.");
    }catch(error){console.error("NALVI_COMMERCIAL_EMAIL",error);const reason=String(error?.message||"");setStatus(reason==="MARKETING_CONSENT_REQUIRED"?"Esta persona no autorizó recibir novedades.":"No se pudo enviar el correo. Revisa la configuración e inténtalo nuevamente.",true);button.disabled=false;button.textContent="Enviar desde NALVI"}
  }

  function handleListClick(event){
    const saveButton=event.target.closest?.("[data-commercial-save]"),emailButton=event.target.closest?.("[data-commercial-email]"),button=saveButton||emailButton;
    if(!button)return;const card=button.closest("[data-commercial-id]");if(!card)return;
    if(saveButton)saveCard(card,button);else sendCardEmail(card,button);
  }

  function exportMarketingContacts(){
    const allowed=interests.filter(item=>item.marketingConsent===true);
    if(!allowed.length){setStatus("Todavía no hay contactos con permiso para recibir novedades.",true);return}
    const csvCell=value=>`"${String(value??"").replace(/"/g,'""')}"`;
    const rows=[["nombre","correo","whatsapp","pais","nivel","estado","fecha_registro"],...allowed.map(item=>[item.name,item.email,item.whatsapp,item.country,levelText(item.level),STATUSES[item.status]||item.status,item.createdAt])];
    const blob=new Blob(["\ufeff",rows.map(row=>row.map(csvCell).join(",")).join("\n")],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=`nalvi-contactos-con-permiso-${new Date().toISOString().slice(0,10)}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setStatus(`${allowed.length} contactos con permiso exportados.`);
  }

  function open(){
    if(!install())return;
    window.show?.("institutional",true);
    window.NALVI_ACADEMIC_STUDIO?.openTool?.("commercial-crm");
    load();
  }

  function refreshUsers(data={}){if(Array.isArray(data.users)){registeredUsers=data.users.length;renderMetrics()}}
  function init(){
    installStyles();install();
    window.addEventListener("nalvi:role-known",()=>setTimeout(install,100));
    window.addEventListener("nalvi:academic-studio-ready",()=>setTimeout(install,100));
    window.addEventListener("nalvi:academic-data",event=>{refreshUsers(event.detail||{});setTimeout(install,0)});
  }

  window.NALVI_COMMERCIAL_CRM={VERSION,open,load};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
