/* NALVI Commercial CRM · admin-only live course lead management. */
(()=>{
  "use strict";

  const VERSION="NALVI-COMMERCIAL-CRM-7";
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
  let loading=false;
  let activeMetricMode="all";

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
      .nalvi-commercial-page{min-height:calc(100vh - 120px);padding:26px 0 150px;background:linear-gradient(135deg,#f8f6ff 0%,#f2fbfb 100%)}.nalvi-commercial-shell{display:grid;gap:18px}.nalvi-commercial-crm{display:grid;gap:18px;padding:22px;border:2px solid #e1daeb;border-radius:24px;background:#fff;box-shadow:0 18px 45px rgba(49,31,100,.08)}
      .nalvi-admin-area-head{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:20px 22px;border:2px solid #dfd7ea;border-radius:22px;background:#fff}.nalvi-admin-area-head h2{margin:4px 0 5px}.nalvi-admin-area-head p{margin:0;color:var(--muted);font-weight:750}.nalvi-admin-area-switcher{display:flex;gap:8px;padding:5px;border:1px solid #dcd4e9;border-radius:15px;background:#f8f6fd}.nalvi-admin-area-switcher button{min-height:42px;border:0;border-radius:11px;background:transparent;padding:9px 14px;color:var(--muted);font:900 13px/1.2 inherit;cursor:pointer}.nalvi-admin-area-switcher button.active{background:#4d3db5;color:#fff;box-shadow:0 6px 16px rgba(67,48,162,.2)}.nalvi-admin-area-switcher button:focus-visible{outline:3px solid #19856d;outline-offset:2px}
      .nalvi-academic-admin-switcher{margin:0 0 16px}.nalvi-commercial-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.nalvi-commercial-head h3{margin:5px 0}.nalvi-commercial-head p{margin:0;color:var(--muted);max-width:720px}.nalvi-commercial-actions{display:flex;gap:9px;flex-wrap:wrap}
      .nalvi-commercial-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.nalvi-commercial-metric{width:100%;padding:16px;border:2px solid #e1daeb;border-radius:17px;background:#fff;text-align:left}.nalvi-commercial-metric[data-commercial-metric]{cursor:pointer;font:inherit}.nalvi-commercial-metric[data-commercial-metric]:hover,.nalvi-commercial-metric.active{border-color:#6b52c7;background:#f6f2ff;transform:translateY(-1px)}.nalvi-commercial-metric:focus-visible{outline:3px solid #19856d;outline-offset:2px}.nalvi-commercial-metric b{display:block;font-size:28px;line-height:1;color:#5940b7}.nalvi-commercial-metric span{display:block;margin-top:7px;color:var(--muted);font-size:12px;font-weight:900}.nalvi-commercial-metric small{display:block;margin-top:7px;color:#5940b7;font-size:11px;font-weight:900}
      .nalvi-commercial-dialog{width:min(1120px,calc(100vw - 32px));max-width:none;max-height:calc(100vh - 32px);margin:auto;padding:0;border:0;border-radius:24px;background:#fff;box-shadow:0 30px 80px rgba(23,16,61,.32);color:var(--ink)}.nalvi-commercial-dialog::backdrop{background:rgba(22,15,52,.58);backdrop-filter:blur(4px)}.nalvi-commercial-dialog-shell{max-height:calc(100vh - 32px);overflow:auto;padding:24px}.nalvi-commercial-dialog-top{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding-bottom:16px;border-bottom:1px solid #e8e2ef}.nalvi-commercial-dialog-top h3{margin:4px 0 0}.nalvi-commercial-dialog-close{width:44px;height:44px;flex:0 0 auto;border:1px solid #ddd5e8;border-radius:50%;background:#f5f1fb;color:#392b76;font:900 26px/1 inherit;cursor:pointer}.nalvi-commercial-directory-actions{display:flex;gap:8px;flex-wrap:wrap}
      .nalvi-commercial-directory{display:grid;gap:14px;scroll-margin-top:130px}.nalvi-commercial-directory-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;padding-top:4px}.nalvi-commercial-directory-head h3{margin:0}.nalvi-commercial-directory-head p{margin:4px 0 0;color:var(--muted)}.nalvi-commercial-visible-count{display:inline-flex;min-width:34px;justify-content:center;padding:5px 9px;border-radius:999px;background:#eee8ff;color:#513baa;font-size:13px;vertical-align:middle}.nalvi-commercial-consent{border:1px solid #d8d0e7;border-radius:14px;background:#faf8ff;color:var(--muted);font-weight:800}.nalvi-commercial-consent summary{cursor:pointer;padding:12px 15px;color:#4f3e9f}.nalvi-commercial-consent>div{padding:0 15px 14px}.nalvi-commercial-sender{display:block;margin-top:7px;color:#4f3e9f}.nalvi-commercial-tools{display:grid;grid-template-columns:minmax(220px,1fr) 210px 210px;gap:10px}.nalvi-commercial-tools input,.nalvi-commercial-tools select,.nalvi-commercial-lead select,.nalvi-commercial-lead textarea,.nalvi-commercial-lead input[type=date]{width:100%;min-height:44px;border:2px solid #e1daeb;border-radius:13px;background:#fff;padding:10px 12px;color:var(--ink);font:800 14px/1.2 inherit}
      .nalvi-commercial-list{display:grid;gap:12px}.nalvi-commercial-lead{padding:17px;border:2px solid #e3dcec;border-radius:18px;background:#fff}.nalvi-commercial-lead[hidden]{display:none!important}.nalvi-commercial-lead-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.nalvi-commercial-lead h4{margin:0 0 3px}.nalvi-commercial-lead p{margin:5px 0;color:var(--muted)}.nalvi-commercial-badges{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}.nalvi-commercial-badge{display:inline-flex;padding:5px 8px;border-radius:999px;background:#f1edfb;color:#5940a9;font-size:11px;font-weight:950}.nalvi-commercial-badge.allowed{background:#e4f7ef;color:#12684f}.nalvi-commercial-badge.blocked{background:#f4f1f6;color:#756d80}.nalvi-commercial-lead-grid{display:grid;grid-template-columns:180px minmax(220px,1fr) 160px;gap:10px;align-items:end;margin-top:12px}.nalvi-commercial-lead label{display:grid;gap:5px;color:var(--muted);font-size:12px;font-weight:900}.nalvi-commercial-lead textarea{min-height:76px;resize:vertical}.nalvi-commercial-email{display:grid;grid-template-columns:minmax(240px,360px) auto;gap:8px;align-items:end;margin-top:12px;padding-top:12px;border-top:1px solid #ece7f2}.nalvi-commercial-email small{grid-column:1/-1;color:var(--muted);font-weight:800}.nalvi-commercial-lead-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.nalvi-commercial-empty{padding:28px;border:2px dashed #ddd4e9;border-radius:17px;text-align:center;color:var(--muted);font-weight:850}.nalvi-commercial-status{min-height:20px;color:#1a795d;font-weight:850}.nalvi-commercial-status.error{color:#b43752}
      @media(max-width:1000px){.nalvi-commercial-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.nalvi-commercial-tools,.nalvi-commercial-lead-grid,.nalvi-commercial-email{grid-template-columns:1fr}}
      @media(max-width:680px){.nalvi-commercial-page{padding-top:14px}.nalvi-admin-area-head,.nalvi-commercial-head,.nalvi-commercial-lead-head,.nalvi-commercial-directory-head,.nalvi-commercial-dialog-top{align-items:stretch;flex-direction:column}.nalvi-admin-area-switcher{display:grid;grid-template-columns:1fr 1fr}.nalvi-commercial-crm{padding:15px}.nalvi-commercial-dialog{width:calc(100vw - 16px);max-height:calc(100vh - 16px)}.nalvi-commercial-dialog-shell{max-height:calc(100vh - 16px);padding:16px}.nalvi-commercial-dialog-close{align-self:flex-end}.nalvi-commercial-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.nalvi-commercial-actions>*{flex:1}.nalvi-commercial-lead-actions>*{width:100%;text-align:center}}
    </style>`);
  }

  function areaSwitcher(active){
    return `<nav class="nalvi-admin-area-switcher" aria-label="Áreas de administración"><button type="button" data-open-admin-area="academic" class="${active==="academic"?"active":""}" ${active==="academic"?'aria-current="page"':""}>Gestión académica</button><button type="button" data-open-admin-area="commercial" class="${active==="commercial"?"active":""}" ${active==="commercial"?'aria-current="page"':""}>Gestión comercial</button></nav>`;
  }

  function pageMarkup(){
    return `<section id="commercial" class="hide nalvi-commercial-page" data-platform-only>
      <div class="shell nalvi-commercial-shell">
        <header class="nalvi-admin-area-head"><div><span class="tag">ADMINISTRACIÓN NALVI</span><h2>Gestión comercial</h2><p>Interesados, seguimiento, inscripciones y comunicaciones.</p></div>${areaSwitcher("commercial")}</header>
        <div class="nalvi-commercial-crm">
      <header class="nalvi-commercial-head"><div><span class="tag">PERSONAS INTERESADAS</span><h3>Seguimiento comercial</h3><p>Gestiona desde el primer contacto hasta la inscripción. Los permisos de contacto y de marketing se mantienen separados.</p></div><div class="nalvi-commercial-actions"><button class="mini-btn" id="nalviCommercialRefresh" type="button">Actualizar</button><button class="mini-btn" id="nalviCommercialExport" type="button">Exportar con permiso</button></div></header>
      <div class="nalvi-commercial-metrics" id="nalviCommercialMetrics"></div>
      <dialog class="nalvi-commercial-dialog" id="nalviCommercialDirectoryDialog"><div class="nalvi-commercial-dialog-shell"><header class="nalvi-commercial-dialog-top"><div><span class="tag">SEGUIMIENTO COMERCIAL</span><h3>Personas interesadas</h3></div><button class="nalvi-commercial-dialog-close" id="nalviCommercialDialogClose" type="button" aria-label="Cerrar lista">×</button></header>
      <section class="nalvi-commercial-directory" id="nalviCommercialDirectory"><div class="nalvi-commercial-directory-head"><div><h3>Contactos encontrados <span class="nalvi-commercial-visible-count" id="nalviCommercialVisibleCount">0</span></h3><p id="nalviCommercialDirectoryHint">Aquí puedes abrir y gestionar cada contacto.</p></div><div class="nalvi-commercial-directory-actions"><button class="mini-btn" id="nalviCommercialClearFilters" type="button">Ver todas</button></div></div>
      <div class="nalvi-commercial-tools"><input id="nalviCommercialSearch" type="search" placeholder="Buscar por nombre, correo, país o WhatsApp" aria-label="Buscar personas"><select id="nalviCommercialStatusFilter" aria-label="Filtrar por estado"><option value="">Todos los estados</option>${Object.entries(STATUSES).map(([value,label])=>`<option value="${value}">${esc(label)}</option>`).join("")}</select><select id="nalviCommercialMarketingFilter" aria-label="Filtrar por permiso de marketing"><option value="">Todos los permisos</option><option value="yes">Aceptó novedades</option><option value="no">No aceptó novedades</option></select></div>
      <div class="nalvi-commercial-status" id="nalviCommercialStatus" role="status" aria-live="polite"></div>
      <div class="nalvi-commercial-list" id="nalviCommercialList"><div class="nalvi-commercial-empty">Abre este panel para cargar las inscripciones.</div></div>
      <div class="nalvi-commercial-empty" id="nalviCommercialFilteredEmpty" hidden>No hay personas que coincidan con este filtro.</div></section></div></dialog>
      <details class="nalvi-commercial-consent"><summary>Permisos y remitente de los correos</summary><div>Email marketing: solo se incluyen las personas que marcaron “recibir noticias”. Las demás pueden recibir únicamente mensajes relacionados con el programa que solicitaron.<span class="nalvi-commercial-sender">Remitente profesional: <b>NALVI · Equipo Académico &lt;cursos@correo.idiomaguarani.com.py&gt;</b>. Las respuestas llegan a <b>aliciaduartefretes@gmail.com</b>.</span></div></details>
        </div>
      </div>
    </section>`;
  }

  function registerView(){try{if(typeof views!=="undefined"&&!views.includes("commercial"))views.push("commercial")}catch(error){console.info("NALVI_COMMERCIAL_VIEW",error?.message||error)}}

  function removeLegacyPane(){
    const management=$("#institutional");
    $("[data-gesa-tab='commercial-crm']",management)?.remove();
    $("[data-gesa-pane='commercial-crm']",management)?.remove();
  }

  function installAccountEntry(){
    const menu=$("#accountMenu"),logout=$("#logoutBtn",menu);if(!menu||!logout)return;
    let academic=$("#nalviAcademicAccountEntry",menu);
    if(!academic){academic=document.createElement("button");academic.id="nalviAcademicAccountEntry";academic.className="mini-btn nalvi-admin-account-entry";academic.type="button";academic.textContent="🏫 Gestión académica";logout.insertAdjacentElement("beforebegin",academic);academic.addEventListener("click",()=>{menu.classList.add("hide");window.show?.("institutional",true)})}
    let commercial=$("#nalviCommercialAccountEntry",menu);
    if(!commercial){commercial=document.createElement("button");commercial.id="nalviCommercialAccountEntry";commercial.className="mini-btn nalvi-admin-account-entry";commercial.type="button";commercial.textContent="📈 Gestión comercial";logout.insertAdjacentElement("beforebegin",commercial);commercial.addEventListener("click",()=>{menu.classList.add("hide");open()})}
    academic.hidden=!isAdmin();commercial.hidden=!isAdmin();
  }

  function installAcademicSwitcher(){
    const management=$("#institutional[data-gesa-installed='true']");if(!management)return;
    let host=$("#nalviAcademicAdminSwitcher",management);if(!isAdmin()){host?.remove();return}
    if(!host){host=document.createElement("div");host.id="nalviAcademicAdminSwitcher";host.className="nalvi-academic-admin-switcher";host.innerHTML=areaSwitcher("academic");const hero=$(".staff-hero",management),workspace=$(".nalvi-academic-workspace",management);if(hero)hero.insertAdjacentElement("afterend",host);else workspace?.insertAdjacentElement("beforebegin",host);bindAreaSwitcher(host)}
  }

  function bindAreaSwitcher(root){
    root?.addEventListener("click",event=>{const button=event.target.closest?.("[data-open-admin-area]");if(!button)return;if(button.dataset.openAdminArea==="commercial")open();else window.show?.("institutional",true)});
  }

  function install(){
    removeLegacyPane();registerView();installAccountEntry();installAcademicSwitcher();
    if(!isAdmin()){if(!$("#commercial")?.classList.contains("hide"))window.show?.("home",true);$("#commercial")?.remove();return false}
    if(!$("#commercial")){const bottomNav=$(".bottom-nav");bottomNav?.insertAdjacentHTML("beforebegin",pageMarkup());const page=$("#commercial"),dialog=$("#nalviCommercialDirectoryDialog",page);bindAreaSwitcher(page);$("#nalviCommercialRefresh",page)?.addEventListener("click",()=>load(true));$("#nalviCommercialExport",page)?.addEventListener("click",exportMarketingContacts);$("#nalviCommercialClearFilters",page)?.addEventListener("click",()=>applyMetric("all"));$("#nalviCommercialDialogClose",page)?.addEventListener("click",()=>dialog?.close());dialog?.addEventListener("click",event=>{if(event.target===dialog)dialog.close()});$("#nalviCommercialMetrics",page)?.addEventListener("click",event=>{const button=event.target.closest?.("[data-commercial-metric]");if(button)applyMetric(button.dataset.commercialMetric,true)});["#nalviCommercialSearch","#nalviCommercialStatusFilter","#nalviCommercialMarketingFilter"].forEach(selector=>$(selector,page)?.addEventListener(selector.includes("Search")?"input":"change",()=>{activeMetricMode="custom";renderMetrics();filter()}));$("#nalviCommercialList",page)?.addEventListener("click",handleListClick)}
    renderMetrics();
    return true;
  }

  function setStatus(message="",error=false){const node=$("#nalviCommercialStatus");if(node){node.textContent=message;node.classList.toggle("error",error)}}

  function renderMetrics(){
    const root=$("#nalviCommercialMetrics");if(!root)return;
    const rows=[[metrics.total||interests.length,"Interesados","all"],[metrics.pendingContact||0,"Por contactar","pending"],[metrics.marketingEligible||0,"Aceptan novedades","marketing"],[metrics.customers||0,"Inscritos/clientes","customers"]];
    root.innerHTML=rows.map(([value,label,mode])=>`<button class="nalvi-commercial-metric ${activeMetricMode===mode?"active":""}" type="button" data-commercial-metric="${mode}" aria-pressed="${activeMetricMode===mode}"><b>${Number(value)||0}</b><span>${esc(label)}</span><small>Ver personas →</small></button>`).join("");
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
    root.innerHTML=interests.length?interests.map(leadMarkup).join(""):'<div class="nalvi-commercial-empty">Todavía no hay personas inscritas en este programa.</div>';
    renderMetrics();filter();
  }

  function filter(){
    const query=normalize($("#nalviCommercialSearch")?.value),status=$("#nalviCommercialStatusFilter")?.value||"",marketing=$("#nalviCommercialMarketingFilter")?.value||"";
    let visible=0;$$('[data-commercial-id]').forEach(row=>{const customerMode=activeMetricMode==="customers"&&!['enrolled','active','completed'].includes(row.dataset.commercialStatus),hidden=Boolean(query&&!row.dataset.commercialSearch.includes(query)||status&&row.dataset.commercialStatus!==status||marketing&&row.dataset.commercialMarketing!==marketing||customerMode);row.hidden=hidden;if(!hidden)visible+=1});
    const count=$("#nalviCommercialVisibleCount"),empty=$("#nalviCommercialFilteredEmpty"),hint=$("#nalviCommercialDirectoryHint");if(count)count.textContent=String(visible);if(empty)empty.hidden=visible>0||interests.length===0;if(hint)hint.textContent=activeMetricMode==="pending"?`Mostrando ${visible} ${visible===1?"persona":"personas"} pendientes de contacto.`:activeMetricMode==="marketing"?`Mostrando ${visible} ${visible===1?"persona que aceptó":"personas que aceptaron"} recibir novedades.`:activeMetricMode==="customers"?`Mostrando ${visible} ${visible===1?"cliente":"clientes"} inscritos o activos.`:`Mostrando ${visible} de ${interests.length} personas interesadas.`;
  }

  function applyMetric(mode="all",showDialog=false){
    activeMetricMode=mode;const search=$("#nalviCommercialSearch"),status=$("#nalviCommercialStatusFilter"),marketing=$("#nalviCommercialMarketingFilter");if(search)search.value="";if(status)status.value=mode==="pending"?"waitlist":"";if(marketing)marketing.value=mode==="marketing"?"yes":"";renderMetrics();filter();if(showDialog){const dialog=$("#nalviCommercialDirectoryDialog");if(dialog&&!dialog.open){if(typeof dialog.showModal==="function")dialog.showModal();else dialog.setAttribute("open","")}}
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
    window.show?.("commercial",true);
    load();
  }

  function init(){
    installStyles();install();
    window.addEventListener("nalvi:role-known",()=>setTimeout(()=>{install();if(location.hash==="#commercial"&&isAdmin())open()},100));
    window.addEventListener("nalvi:academic-studio-ready",()=>setTimeout(install,100));
    window.addEventListener("nalvi:academic-data",()=>setTimeout(install,0));
    if(location.hash==="#commercial"&&isAdmin())setTimeout(open,0);
  }

  window.NALVI_COMMERCIAL_CRM={VERSION,open,load};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
