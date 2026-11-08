(()=>{
  "use strict";

  const ACADEMY_ROUTE="recordedAcademy";
  const STUDIO_ROUTE="premiumContentStudio";
  const API="/api/premium-academy";
  const MUX_API=API;
  const routeParams=new URLSearchParams(location.search);
  const studioRequested=location.hash===`#${STUDIO_ROUTE}`||routeParams.get("premiumStudio")==="1";
  const state={courses:[],access:{signedIn:false,administrator:false,premium:false},billing:{enabled:false,environment:"disabled",plans:[]},progress:{},reader:{course:null,access:"",lessonId:""},adminCourses:[],editing:null,loaded:false};
  const main=document.querySelector("main");
  if(!main)return;

  const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const clone=value=>JSON.parse(JSON.stringify(value));
  const firebaseReady=()=>window.GCA_FIREBASE_LIVE?Promise.resolve(window.GCA_FIREBASE_LIVE):new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("FIREBASE_TIMEOUT")),12000);window.addEventListener("gca:firebase-live-ready",()=>{clearTimeout(timer);resolve(window.GCA_FIREBASE_LIVE)},{once:true})});
  const currentUser=async()=>{try{return(await firebaseReady()).auth.currentUser}catch{return null}};
  const authHeaders=async()=>{const user=await currentUser();return user&&!user.isAnonymous?{Authorization:`Bearer ${await user.getIdToken()}`}:{}};
  function navigate(id,push=true){
    if(typeof window.show==="function")return window.show(id,push);
    document.querySelectorAll("main>section").forEach(section=>section.classList.toggle("hide",section.id!==id));
    document.querySelectorAll(".nav-btn").forEach(button=>button.classList.toggle("active",button.dataset.go===(id===ACADEMY_ROUTE||id===STUDIO_ROUTE?"catalog":id)));
    const hash=`#${id}`;if(push)history.pushState({view:id},"",hash);else history.replaceState({view:id},"",hash);
    window.scrollTo({top:0,behavior:"auto"});
  }

  async function api(operation,{courseId="",method="GET",body=null,auth=false}={}){
    const query=new URLSearchParams({operation});if(courseId)query.set("courseId",courseId);
    const response=await fetch(`${API}?${query}`,{method,headers:{...(auth?await authHeaders():{}),...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const payload=await response.json().catch(()=>({ok:false,reason:"INVALID_RESPONSE"}));
    return{response,payload};
  }

  async function muxApi(operation,{courseId="",lessonId="",uploadId="",method="GET",body=null,auth=true}={}){
    const query=new URLSearchParams({operation:`mux-${operation}`});
    if(courseId)query.set("courseId",courseId);
    if(lessonId)query.set("lessonId",lessonId);
    if(uploadId)query.set("uploadId",uploadId);
    const response=await fetch(`${MUX_API}?${query}`,{method,headers:{...(auth?await authHeaders():{}),...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const payload=await response.json().catch(()=>({ok:false,reason:"INVALID_RESPONSE"}));
    return{response,payload};
  }

  function registerRoutes(){try{if(Array.isArray(views)){if(!views.includes(ACADEMY_ROUTE))views.push(ACADEMY_ROUTE);if(!views.includes(STUDIO_ROUTE))views.push(STUDIO_ROUTE)}}catch{}}

  function install(){
    registerRoutes();
    const grid=document.querySelector("#catalog .course-grid");
    if(grid&&!grid.querySelector("[data-premium-academy-open]"))grid.insertAdjacentHTML("beforeend",`<article class="course-card nalvi-recorded-catalog"><div class="course-ribbon">NUEVO</div><div class="course-card-icon">🎬📚</div><h3>Cursos grabados</h3><p>Clases en video, explicaciones y e-books organizados por tema. Algunos recursos son gratuitos y otros forman parte de NALVI Plus.</p><div class="course-card-stats"><span>Acceso desde cualquier lugar</span><span>Biblioteca en crecimiento</span></div><button class="btn" type="button" data-premium-academy-open>Ver cursos grabados →</button></article>`);
    const account=document.querySelector("#accountMenu");
    if(account&&!account.querySelector("[data-premium-studio-open]"))account.querySelector("#logoutBtn")?.insertAdjacentHTML("beforebegin",`<button class="mini-btn nalvi-studio-account-entry" type="button" data-premium-studio-open hidden>🎬 Estudio de contenido</button>`);
    if(!document.querySelector(`#${ACADEMY_ROUTE}`))main.insertAdjacentHTML("beforeend",academyMarkup());
    if(!document.querySelector(`#${STUDIO_ROUTE}`))main.insertAdjacentHTML("beforeend",studioMarkup());
    bindEvents();
  }

  function academyMarkup(){return`<section id="${ACADEMY_ROUTE}" class="hide nalvi-premium-page" aria-labelledby="nalviPremiumTitle"><div class="nalvi-premium-shell"><button class="nalvi-premium-back" type="button" data-premium-back>← Volver a Aprender</button><header class="nalvi-premium-hero"><div><span>ACADEMIA NALVI</span><h2 id="nalviPremiumTitle">Cursos grabados y recursos para aprender a tu ritmo</h2><p>Explora clases en video, explicaciones y materiales descargables. Una sola suscripción NALVI Plus habilita todo el catálogo premium publicado.</p><div class="nalvi-premium-hero-actions" id="nalviPremiumHeroActions"></div></div><aside id="nalviPremiumAccessCard" aria-live="polite"><b>Comprobando acceso…</b><small>Estamos revisando tu cuenta.</small></aside></header><div class="nalvi-premium-toolbar"><div><h3>Cursos y biblioteca</h3><p>Los cursos gratuitos se identifican claramente. El contenido protegido nunca se entrega a una cuenta sin permiso.</p></div><button class="nalvi-premium-secondary" type="button" data-premium-studio-open hidden>Administrar contenido</button></div><div class="nalvi-premium-grid" id="nalviPremiumGrid" aria-live="polite"><div class="nalvi-premium-empty">Cargando contenido…</div></div><section class="nalvi-premium-reader" id="nalviPremiumReader" hidden></section></div></section>`}

  function studioMarkup(){return`<section id="${STUDIO_ROUTE}" class="hide nalvi-premium-page nalvi-studio-page" aria-labelledby="nalviStudioTitle"><div class="nalvi-premium-shell"><button class="nalvi-premium-back" type="button" data-studio-back>← Volver a la academia</button><header class="nalvi-studio-head"><div><span>ADMINISTRACIÓN PRIVADA</span><h2 id="nalviStudioTitle">Estudio de contenido</h2><p>Crea cursos grabados, organiza la biblioteca y agrega e-books o recursos. Los borradores nunca aparecen a los alumnos.</p></div><button class="nalvi-premium-primary" type="button" data-studio-new>+ Crear contenido</button></header><div class="nalvi-studio-layout"><aside class="nalvi-studio-list"><div class="nalvi-studio-list-head"><h3>Contenido</h3><button type="button" data-studio-refresh aria-label="Actualizar">↻</button></div><div id="nalviStudioCourseList"><div class="nalvi-premium-empty">Cargando…</div></div></aside><form class="nalvi-studio-editor" id="nalviStudioEditor"><div class="nalvi-studio-placeholder"><b>Selecciona un contenido o crea uno nuevo</b><p>Desde aquí podrás administrar el catálogo premium sin editar código.</p></div></form></div></div></section>`}

  async function loadAccess(){
    const headers=await authHeaders();
    const response=await fetch(`${API}?operation=access`,{headers});
    const payload=await response.json().catch(()=>({}));
    state.access=response.ok?payload:{signedIn:false,administrator:false,premium:false};
    document.querySelectorAll("[data-premium-studio-open]").forEach(button=>button.hidden=!state.access.administrator);
    renderAccess();
    return state.access;
  }

  async function loadBilling(){
    try{const response=await fetch("/api/billing?operation=catalog");const payload=await response.json();state.billing=response.ok?payload:{enabled:false,environment:"disabled",plans:[]}}catch{state.billing={enabled:false,environment:"disabled",plans:[]}}
  }

  async function loadCatalog(){
    const grid=document.querySelector("#nalviPremiumGrid");
    if(grid)grid.innerHTML='<div class="nalvi-premium-empty">Cargando cursos…</div>';
    try{const{response,payload}=await api("catalog");state.courses=response.ok&&Array.isArray(payload.courses)?payload.courses:[];renderCatalog()}catch{if(grid)grid.innerHTML='<div class="nalvi-premium-empty error">No pudimos cargar el catálogo. Inténtalo nuevamente.</div>'}
  }

  async function loadAcademy(){await Promise.all([loadAccess(),loadBilling()]);await loadCatalog();await loadCatalogProgress();state.loaded=true;renderAccess();renderCatalog()}

  async function loadProgress(courseId){
    if(!state.access.signedIn)return null;
    try{const{response,payload}=await api("progress",{courseId,auth:true});if(response.ok&&payload.progress){state.progress[courseId]=payload.progress;return payload.progress}}catch{}
    return null;
  }

  async function loadCatalogProgress(){
    if(!state.access.signedIn)return;
    const available=state.courses.filter(course=>course.contentType!=="library"&&(course.access==="free"||state.access.premium||state.access.administrator));
    await Promise.all(available.map(course=>loadProgress(course.courseId)));
  }

  function renderAccess(){
    const card=document.querySelector("#nalviPremiumAccessCard"),actions=document.querySelector("#nalviPremiumHeroActions");if(!card||!actions)return;
    if(state.access.administrator){card.innerHTML="<b>Acceso administrativo</b><small>Puedes revisar todos los cursos y administrar su publicación.</small>";card.dataset.kind="admin"}
    else if(state.access.premium){card.innerHTML="<b>✓ NALVI Plus activo</b><small>Todos los cursos premium publicados están habilitados para tu cuenta.</small>";card.dataset.kind="active"}
    else if(state.access.signedIn){card.innerHTML="<b>Plan gratuito</b><small>Puedes abrir los cursos gratuitos o activar NALVI Plus.</small>";card.dataset.kind="free"}
    else{card.innerHTML="<b>Explora el catálogo</b><small>Inicia sesión para conservar tu acceso y activar NALVI Plus.</small>";card.dataset.kind="free"}
    const plans=(state.billing.plans||[]).filter(plan=>plan.kind==="subscription"&&plan.unlocksPremiumCourses===true);
    const canOffer=state.billing.enabled&&(state.billing.environment==="live"||state.access.administrator);
    actions.innerHTML=`${!state.access.signedIn?'<button class="nalvi-premium-primary" type="button" data-premium-login>Iniciar sesión</button>':""}${!state.access.premium&&canOffer?plans.map(plan=>`<button class="nalvi-premium-primary" type="button" data-premium-subscribe="${escapeHtml(plan.planKey)}">${state.billing.environment==="test"?"Probar":"Activar"} ${escapeHtml(plan.displayName||"NALVI Plus")} ${plan.priceLabel?`· ${escapeHtml(plan.priceLabel)}`:""}</button>`).join(""):""}${!state.access.premium&&!canOffer?'<span class="nalvi-premium-coming">Suscripciones en preparación</span>':""}${state.access.administrator?'<button class="nalvi-premium-secondary" type="button" data-premium-studio-open>Estudio de contenido</button>':""}`;
  }

  function renderCatalog(){
    const grid=document.querySelector("#nalviPremiumGrid");if(!grid)return;
    if(!state.courses.length){grid.innerHTML=`<div class="nalvi-premium-empty"><b>El catálogo se está preparando</b><p>Los cursos grabados aparecerán aquí cuando la administración los publique.</p>${state.access.administrator?'<button class="nalvi-premium-primary" type="button" data-premium-studio-open>Crear el primer curso</button>':""}</div>`;return}
    grid.innerHTML=state.courses.map(course=>{const isLibrary=course.contentType==="library",unlocked=course.access==="free"||state.access.premium||state.access.administrator,progress=state.progress[course.courseId],percent=unlocked?Number(progress?.percent)||0:0;return`<article class="nalvi-premium-course-card${isLibrary?" nalvi-premium-library-card":""}" data-access="${escapeHtml(course.access)}" data-content-type="${isLibrary?"library":"course"}">${course.coverImageUrl?`<img src="${escapeHtml(course.coverImageUrl)}" alt="">`:`<div class="nalvi-premium-cover">${isLibrary?"📚":course.access==="free"?"▶":"✦"}</div>`}<div class="nalvi-premium-course-body"><div class="nalvi-premium-badges"><span>${course.access==="free"?"GRATUITO":"NALVI PLUS"}</span><span>${isLibrary?"BIBLIOTECA":escapeHtml(course.level||"CURSO")}</span></div><h4>${escapeHtml(course.title)}</h4><p>${escapeHtml(course.summary||course.description||"")}</p><div class="nalvi-premium-course-meta"><span>${Number(course.lessonCount)||0} ${isLibrary?"secciones":"lecciones"}</span>${!isLibrary?`<span>${Number(course.durationMinutes)||0} min</span>`:""}</div>${isLibrary?"":`<div class="nalvi-premium-course-progress" aria-label="${unlocked?`${percent}% completado`:"Curso bloqueado"}"><div><span style="width:${percent}%"></span></div><b>${unlocked?`${percent}%`:"🔒"}</b></div>`}<button class="${unlocked?"nalvi-premium-primary":"nalvi-premium-secondary"}" type="button" data-premium-course="${escapeHtml(course.courseId)}">${unlocked?(isLibrary?"Abrir biblioteca":percent?"Continuar curso":"Abrir curso"):"🔒 Ver acceso"}</button></div></article>`}).join("");
  }

  function youtubeId(value){const text=String(value||"").trim();if(/^[A-Za-z0-9_-]{6,20}$/.test(text))return text;try{const url=new URL(text);const candidate=url.hostname.includes("youtu.be")?url.pathname.slice(1):url.searchParams.get("v")||url.pathname.split("/").filter(Boolean).pop();return/^[A-Za-z0-9_-]{6,20}$/.test(candidate||"")?candidate:""}catch{return""}}
  function lessonMedia(courseId,lesson){
    if(lesson.videoProvider==="youtube"){const id=youtubeId(lesson.videoValue);return id?`<div class="nalvi-premium-video"><iframe src="https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1" title="${escapeHtml(lesson.title)}" loading="lazy" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`:""}
    if(lesson.videoProvider==="mux"&&/^[A-Za-z0-9_-]{6,180}$/.test(lesson.videoValue||""))return`<div class="nalvi-premium-video nalvi-premium-mux-player" data-mux-course="${escapeHtml(courseId)}" data-mux-lesson="${escapeHtml(lesson.lessonId)}" data-mux-title="${escapeHtml(lesson.title)}"><div class="nalvi-premium-video-loading">Preparando video protegido…</div></div>`;
    if(lesson.videoProvider==="external"&&String(lesson.videoValue||"").startsWith("https://")){const url=escapeHtml(lesson.videoValue);return/\.(?:mp4|webm)(?:\?|$)/i.test(lesson.videoValue)?`<video class="nalvi-premium-native-video" controls controlslist="nodownload" preload="metadata" src="${url}"></video>`:`<div class="nalvi-premium-video"><iframe src="${url}" title="${escapeHtml(lesson.title)}" loading="lazy" sandbox="allow-scripts allow-same-origin allow-presentation" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="no-referrer"></iframe></div>`}
    return"";
  }

  const materialIcon=type=>type==="ebook"||type==="pdf"?"📘":type==="audio"?"🎧":type==="link"?"🔗":"📎";

  function materialResourceMarkup(courseId,lessonId,material,className=""){
    const label=material.type==="ebook"||material.type==="pdf"?"Documento":material.type==="audio"?"Audio":"Recurso externo";
    if(material.privatePath)return`<button class="${className}" type="button" data-premium-private-material="${escapeHtml(material.materialId)}" data-premium-resource-course="${escapeHtml(courseId)}" data-premium-resource-lesson="${escapeHtml(lessonId)}"><span>${materialIcon(material.type)}</span><div><b>${escapeHtml(material.title)}</b><small>${label} protegido</small></div><i>Abrir →</i></button>`;
    if(!material.url)return"";
    return`<a class="${className}" href="${escapeHtml(material.url)}" target="_blank" rel="noopener noreferrer nofollow" referrerpolicy="no-referrer"><span>${materialIcon(material.type)}</span><div><b>${escapeHtml(material.title)}</b><small>${label}</small></div><i>Abrir →</i></a>`;
  }

  function renderLibraryReader(library,access,sectionId=""){
    const reader=document.querySelector("#nalviPremiumReader");if(!reader)return;
    document.querySelector(`#${ACADEMY_ROUTE}`)?.setAttribute("data-content-view","library");
    const sections=library.lessons||[],selected=sections.find(section=>section.lessonId===(sectionId||state.reader.lessonId))||sections[0];
    state.reader={course:library,access,lessonId:selected?.lessonId||""};
    const items=selected?.materials||[];
    reader.hidden=false;reader.innerHTML=`<button class="nalvi-premium-reader-return" type="button" data-premium-reader-close>← Volver a cursos y biblioteca</button><button class="nalvi-premium-reader-close" type="button" data-premium-reader-close aria-label="Cerrar biblioteca">×</button><header class="nalvi-premium-reader-heading"><div><span>${access==="administrator"?"VISTA ADMINISTRATIVA":"BIBLIOTECA NALVI PLUS"}</span><h3>${escapeHtml(library.title)}</h3><p>${escapeHtml(library.description||library.summary||"")}</p></div><b>${sections.length} secciones</b></header><div class="nalvi-premium-course-layout nalvi-premium-library-layout"><aside class="nalvi-premium-course-sidebar"><details class="nalvi-premium-index" open><summary><span>CONTENIDOS</span><i aria-hidden="true">⌄</i></summary><div>${sections.map((section,index)=>`<button type="button" class="${section.lessonId===selected?.lessonId?"active":""}" data-premium-library-section="${escapeHtml(section.lessonId)}"><span>${String(index+1).padStart(2,"0")}</span><b>${escapeHtml(section.title)}</b></button>`).join("")}</div></details></aside><article class="nalvi-premium-library-panel"><header><span>${materialIcon(items[0]?.type)}</span><div><h4>${escapeHtml(selected?.title||"Biblioteca")}</h4><p>${escapeHtml(selected?.summary||"")}</p></div></header><div class="nalvi-premium-library-grid">${items.length?items.map(material=>materialResourceMarkup(library.courseId,selected.lessonId,material,"nalvi-premium-library-resource")).join(""):'<div class="nalvi-premium-library-empty"><span>📚</span><b>Sección en preparación</b><small>Los recursos aparecerán aquí cuando estén revisados y publicados.</small></div>'}</div></article></div>`;
    window.scrollTo({top:0,behavior:"auto"});
  }

  function closeReader(){
    const reader=document.querySelector("#nalviPremiumReader"),academy=document.querySelector(`#${ACADEMY_ROUTE}`);
    if(reader)reader.hidden=true;
    academy?.removeAttribute("data-content-view");
    state.reader={course:null,access:"",lessonId:""};
    document.querySelector("#nalviPremiumGrid")?.scrollIntoView({behavior:"smooth",block:"start"});
  }

  function renderReader(course,access,lessonId=""){
    const reader=document.querySelector("#nalviPremiumReader");if(!reader)return;
    if(course.contentType==="library")return renderLibraryReader(course,access,lessonId);
    const lessons=course.lessons||[],progress=state.progress[course.courseId]||{completedLessonIds:[],percent:0},completed=new Set(progress.completedLessonIds||[]),selected=lessons.find(lesson=>lesson.lessonId===(lessonId||state.reader.lessonId||progress.lastLessonId))||lessons[0];
    state.reader={course,access,lessonId:selected?.lessonId||""};
    if(!selected){reader.hidden=false;reader.innerHTML=`<button class="nalvi-premium-reader-close" type="button" data-premium-reader-close>×</button><div class="nalvi-premium-empty">Este curso todavía no tiene lecciones publicadas.</div>`;return}
    const selectedIndex=lessons.findIndex(lesson=>lesson.lessonId===selected.lessonId),isComplete=completed.has(selected.lessonId),percent=Number(progress.percent)||0;
    reader.hidden=false;reader.innerHTML=`<button class="nalvi-premium-reader-close" type="button" data-premium-reader-close>×</button><header class="nalvi-premium-reader-heading"><div><span>${access==="free"?"CURSO GRATUITO":access==="administrator"?"VISTA ADMINISTRATIVA":"INCLUIDO EN NALVI PLUS"}</span><h3>${escapeHtml(course.title)}</h3><p>${escapeHtml(course.description||course.summary||"")}</p></div><b>${percent}% completado</b></header><div class="nalvi-premium-reader-progress"><span style="width:${percent}%"></span></div><div class="nalvi-premium-course-layout"><aside class="nalvi-premium-course-sidebar"><details class="nalvi-premium-index" open><summary><span>ÍNDICE</span><i aria-hidden="true">⌄</i></summary><div>${lessons.map((lesson,index)=>`<button type="button" class="${lesson.lessonId===selected.lessonId?"active":""}${completed.has(lesson.lessonId)?" completed":""}" data-premium-lesson="${escapeHtml(lesson.lessonId)}"><span>${completed.has(lesson.lessonId)?"✓":String(index+1).padStart(2,"0")}</span><b>${escapeHtml(lesson.title)}</b></button>`).join("")}</div></details></aside><article class="nalvi-premium-active-lesson"><div class="nalvi-premium-lesson-heading"><span>${String(selectedIndex+1).padStart(2,"0")}</span><div><h4>${escapeHtml(selected.title)}</h4><p>${escapeHtml(selected.summary||"")}</p></div><small>${Number(selected.durationMinutes)||0} min</small></div>${lessonMedia(course.courseId,selected)}${selected.body?`<div class="nalvi-premium-lesson-body">${escapeHtml(selected.body)}</div>`:""}${selected.materials?.length?`<div class="nalvi-premium-materials"><h5>Materiales de esta lección</h5>${selected.materials.map(material=>materialResourceMarkup(course.courseId,selected.lessonId,material)).join("")}</div>`:""}<footer><button class="nalvi-premium-complete ${isComplete?"done":""}" type="button" data-premium-complete="${escapeHtml(selected.lessonId)}" aria-pressed="${isComplete}">${isComplete?"✓ Clase completada":"Marcar clase como completada"}</button></footer></article></div>`;
    hydrateMuxPlayers(reader);
    reader.scrollIntoView({behavior:"smooth",block:"start"});
  }

  async function saveLessonProgress(lessonId,button){
    const course=state.reader.course;if(!course||!state.access.signedIn){window.courseGoogleLogin?.();return}
    const current=state.progress[course.courseId]||{completedLessonIds:[]},completed=!(current.completedLessonIds||[]).includes(lessonId);button.disabled=true;
    try{const{response,payload}=await api("progress-save",{courseId:course.courseId,method:"POST",body:{lessonId,completed},auth:true});if(!response.ok||!payload.progress)throw new Error(payload.reason||"PROGRESS_SAVE_FAILED");state.progress[course.courseId]=payload.progress;renderReader(course,state.reader.access,lessonId);renderCatalog();window.showToast?.(completed?"Clase marcada como completada.":"Clase marcada como pendiente.")}catch{button.disabled=false;window.showToast?.("No pudimos guardar tu avance.")}
  }

  async function hydrateMuxPlayers(container){
    for(const player of container.querySelectorAll(".nalvi-premium-mux-player")){
      const{response,payload}=await muxApi("playback-token",{courseId:player.dataset.muxCourse,lessonId:player.dataset.muxLesson});
      if(!response.ok||!payload.playbackId||!payload.token){player.innerHTML='<div class="nalvi-premium-video-loading error">No pudimos abrir este video protegido.</div>';continue}
      const frame=document.createElement("iframe");
      frame.src=`https://player.mux.com/${encodeURIComponent(payload.playbackId)}?playback-token=${encodeURIComponent(payload.token)}`;
      frame.title=player.dataset.muxTitle||"Video de la lección";
      frame.loading="lazy";
      frame.allow="autoplay; encrypted-media; picture-in-picture";
      frame.allowFullscreen=true;
      frame.referrerPolicy="no-referrer";
      player.replaceChildren(frame);
    }
  }

  async function openCourse(courseId){
    const reader=document.querySelector("#nalviPremiumReader");if(reader){reader.hidden=false;reader.innerHTML='<div class="nalvi-premium-empty">Verificando acceso…</div>';reader.scrollIntoView({behavior:"smooth",block:"start"})}
    const{response,payload}=await api("course",{courseId,auth:true});
    if(response.ok&&payload.course){await loadProgress(courseId);return renderReader(payload.course,payload.access)}
    if(response.status===401){if(reader)reader.innerHTML='<div class="nalvi-premium-lock"><b>Inicia sesión para continuar</b><p>El acceso debe quedar asociado a tu cuenta.</p><button class="nalvi-premium-primary" type="button" data-premium-login>Iniciar sesión con Google</button></div>';return}
    if(response.status===402){if(reader)reader.innerHTML='<div class="nalvi-premium-lock"><b>Este curso forma parte de NALVI Plus</b><p>Una sola suscripción habilita todos los cursos grabados premium publicados.</p><div class="nalvi-premium-hero-actions" data-premium-plan-actions></div></div>';renderAccess();const source=document.querySelector("#nalviPremiumHeroActions"),target=reader?.querySelector("[data-premium-plan-actions]");if(source&&target)target.innerHTML=source.innerHTML;return}
    if(reader)reader.innerHTML='<div class="nalvi-premium-empty error">No pudimos abrir este curso. Inténtalo nuevamente.</div>';
  }

  async function openPrivateMaterial(courseId,lessonId,materialId,button){
    button.disabled=true;
    const original=button.querySelector("i")?.textContent||"Abrir →";
    if(button.querySelector("i"))button.querySelector("i").textContent="Abriendo…";
    try{
      const query=new URLSearchParams({operation:"resource",courseId,lessonId,materialId});
      const response=await fetch(`${API}?${query}`,{headers:await authHeaders()});
      if(response.status===401){window.courseGoogleLogin?.();return}
      if(response.status===402){window.showToast?.("Este documento requiere NALVI Plus.");return}
      if(!response.ok)throw new Error(`RESOURCE_${response.status}`);
      const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement("a");
      link.href=url;link.target="_blank";link.rel="noopener noreferrer";document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),120000);
    }catch(error){console.error("NALVI_PRIVATE_RESOURCE",error);window.showToast?.("No pudimos abrir el documento. Inténtalo nuevamente.")}
    finally{button.disabled=false;if(button.querySelector("i"))button.querySelector("i").textContent=original}
  }

  async function startSubscription(planKey){
    const user=await currentUser();if(!user||user.isAnonymous){window.courseGoogleLogin?.();return}
    try{const response=await fetch("/api/billing?operation=checkout",{method:"POST",headers:{Authorization:`Bearer ${await user.getIdToken()}`,"Content-Type":"application/json"},body:JSON.stringify({planKey})});const payload=await response.json();if(!response.ok||!payload.checkoutUrl)throw new Error(payload.reason||"CHECKOUT_UNAVAILABLE");location.assign(payload.checkoutUrl)}catch(error){console.error("NALVI_PREMIUM_CHECKOUT",error);window.showToast?.("No pudimos abrir el pago. Inténtalo nuevamente.")}
  }

  function blankCourse(){return{courseId:"",title:"",summary:"",description:"",level:"",coverImageUrl:"",contentType:"course",access:"premium",status:"draft",order:0,lessons:[]}}
  function blankLesson(index,contentType="course"){return{lessonId:`lesson-${Date.now().toString(36)}-${index+1}`,title:`${contentType==="library"?"Sección":"Lección"} ${index+1}`,summary:"",body:"",durationMinutes:0,order:index,status:"published",videoProvider:"none",videoValue:"",materials:[]}}
  function blankMaterial(index){return{materialId:`material-${index+1}`,title:"",type:"ebook",url:"",privatePath:""}}

  async function openStudio(){
    await loadAccess();if(!state.access.administrator){window.showToast?.("Este espacio está reservado para la administración.");return}
    navigate(STUDIO_ROUTE,true);await loadAdminCourses();
  }

  async function loadAdminCourses(){
    const list=document.querySelector("#nalviStudioCourseList");if(list)list.innerHTML='<div class="nalvi-premium-empty">Cargando cursos…</div>';
    const{response,payload}=await api("admin-list",{auth:true});
    if(!response.ok){if(list)list.innerHTML='<div class="nalvi-premium-empty error">No pudimos cargar el estudio.</div>';return}
    state.adminCourses=payload.courses||[];renderStudioList();if(state.editing){const fresh=state.adminCourses.find(course=>course.courseId===state.editing.courseId);if(fresh)state.editing=clone(fresh);renderEditor()}
  }

  function renderStudioList(){
    const list=document.querySelector("#nalviStudioCourseList");if(!list)return;
    if(!state.adminCourses.length){list.innerHTML='<div class="nalvi-premium-empty"><b>No hay contenido todavía</b><p>Crea el primer curso o biblioteca para comenzar.</p></div>';return}
    list.innerHTML=state.adminCourses.map(course=>`<button type="button" class="nalvi-studio-course-item${state.editing?.courseId===course.courseId?" active":""}" data-studio-edit="${escapeHtml(course.courseId)}"><span>${course.status==="published"?"●":"○"}</span><b>${escapeHtml(course.title)}</b><small>${course.contentType==="library"?"Biblioteca":"Curso"} · ${course.access==="premium"?"NALVI Plus":"Gratuito"} · ${course.status}</small></button>`).join("");
  }

  function renderEditor(){
    const form=document.querySelector("#nalviStudioEditor"),course=state.editing;if(!form||!course)return;
    const isLibrary=course.contentType==="library";
    form.innerHTML=`<header><div><span>${course.courseId?"EDITAR CONTENIDO":"NUEVO CONTENIDO"}</span><h3>${escapeHtml(course.title||(isLibrary?"Biblioteca sin título":"Curso sin título"))}</h3></div><div><button class="nalvi-premium-secondary" type="button" data-studio-preview ${course.courseId?"":"disabled"}>Vista previa</button><button class="nalvi-premium-primary" type="submit">Guardar cambios</button></div></header><div class="nalvi-studio-fields"><label class="wide">Título<input name="title" required maxlength="180" value="${escapeHtml(course.title)}" placeholder="Ej.: Biblioteca NALVI Plus"></label><label>Tipo<select name="contentType"><option value="course" ${!isLibrary?"selected":""}>Curso</option><option value="library" ${isLibrary?"selected":""}>Biblioteca</option></select></label><label>ID estable<input name="courseId" maxlength="80" value="${escapeHtml(course.courseId)}" ${course.courseId?"readonly":""} placeholder="Se crea desde el título"></label><label>Nivel<input name="level" maxlength="80" value="${escapeHtml(course.level)}" placeholder="Inicial, intermedio…"></label><label class="wide">Resumen<textarea name="summary" maxlength="500" placeholder="Una explicación breve para la tarjeta">${escapeHtml(course.summary)}</textarea></label><label class="wide">Descripción completa<textarea name="description" maxlength="5000" placeholder="Qué contiene y para quién es">${escapeHtml(course.description)}</textarea></label><label class="wide">Portada (URL HTTPS)<input name="coverImageUrl" type="url" value="${escapeHtml(course.coverImageUrl)}" placeholder="https://…"></label><label>Acceso<select name="access"><option value="premium" ${course.access==="premium"?"selected":""}>NALVI Plus</option><option value="free" ${course.access==="free"?"selected":""}>Gratuito</option></select></label><label>Estado<select name="status"><option value="draft" ${course.status==="draft"?"selected":""}>Borrador</option><option value="published" ${course.status==="published"?"selected":""}>Publicado</option><option value="archived" ${course.status==="archived"?"selected":""}>Archivado</option></select></label><label>Orden<input name="order" type="number" min="0" max="10000" value="${Number(course.order)||0}"></label></div><section class="nalvi-studio-lessons"><div class="nalvi-studio-section-head"><div><h4>${isLibrary?"Secciones de la biblioteca":"Lecciones"}</h4><p>${isLibrary?"Organiza libros, películas, canciones y otros recursos por categoría.":"Agrega video, explicación y materiales a cada clase."}</p></div><button class="nalvi-premium-secondary" type="button" data-studio-add-lesson>+ ${isLibrary?"Agregar sección":"Agregar lección"}</button></div><div id="nalviStudioLessons">${course.lessons.map(lessonEditor).join("")||`<div class="nalvi-premium-empty">Todavía no agregaste ${isLibrary?"secciones":"lecciones"}.</div>`}</div></section><footer><span id="nalviStudioStatus" role="status"></span><button class="nalvi-premium-primary" type="submit">Guardar ${isLibrary?"biblioteca":"curso"}</button></footer>`;
  }

  function lessonEditor(lesson,index){const isLibrary=state.editing?.contentType==="library",itemName=isLibrary?"sección":"lección";return`<article class="nalvi-studio-lesson" data-lesson-index="${index}"><header><span>${String(index+1).padStart(2,"0")}</span><b>${escapeHtml(lesson.title||`${isLibrary?"Sección":"Lección"} ${index+1}`)}</b><button type="button" data-remove-lesson="${index}" aria-label="Eliminar ${itemName}">×</button></header><div class="nalvi-studio-fields"><label class="wide">Título de la ${itemName}<input data-lesson-field="title" maxlength="180" value="${escapeHtml(lesson.title)}"></label>${isLibrary?"":`<label>Duración en minutos<input data-lesson-field="durationMinutes" type="number" min="0" max="600" value="${Number(lesson.durationMinutes)||0}"></label>`}<label>Estado<select data-lesson-field="status"><option value="published" ${lesson.status!=="draft"?"selected":""}>Publicada</option><option value="draft" ${lesson.status==="draft"?"selected":""}>Borrador</option></select></label><label class="wide">Descripción breve<textarea data-lesson-field="summary" maxlength="600">${escapeHtml(lesson.summary)}</textarea></label>${isLibrary?"":`<label>Proveedor del video<select data-lesson-field="videoProvider"><option value="none" ${lesson.videoProvider==="none"?"selected":""}>Sin video</option><option value="youtube" ${lesson.videoProvider==="youtube"?"selected":""}>YouTube no listado</option><option value="mux" ${lesson.videoProvider==="mux"?"selected":""}>Mux protegido</option><option value="external" ${lesson.videoProvider==="external"?"selected":""}>Video externo HTTPS</option></select></label><label>Enlace o ID de reproducción<input data-lesson-field="videoValue" value="${escapeHtml(lesson.videoValue)}" placeholder="Se completa al subir a Mux"></label><div class="wide nalvi-studio-mux-upload"><input type="file" accept="video/*" data-mux-file="${index}" aria-label="Seleccionar video para Mux"><button class="nalvi-premium-secondary" type="button" data-mux-upload="${index}">Subir video protegido a Mux</button><span data-mux-status="${index}" role="status">${lesson.videoProvider==="mux"&&lesson.videoValue?"✓ Video protegido conectado":""}</span></div><label class="wide">Explicación de la lección<textarea data-lesson-field="body" maxlength="12000" rows="6">${escapeHtml(lesson.body)}</textarea></label>`}</div><div class="nalvi-studio-materials"><div class="nalvi-studio-section-head compact"><h5>${isLibrary?"Recursos de esta sección":"E-books y materiales"}</h5><button type="button" data-add-material="${index}">+ Agregar recurso</button></div>${(lesson.materials||[]).map((material,materialIndex)=>materialEditor(material,index,materialIndex)).join("")||'<p class="nalvi-studio-muted">Sin recursos.</p>'}</div></article>`}

  function materialEditor(material,lessonIndex,materialIndex){const key=`${lessonIndex}:${materialIndex}`;return`<div class="nalvi-studio-material" data-material-index="${materialIndex}"><input data-material-field="title" value="${escapeHtml(material.title)}" placeholder="Título del material"><select data-material-field="type"><option value="ebook" ${material.type==="ebook"?"selected":""}>E-book</option><option value="pdf" ${material.type==="pdf"?"selected":""}>PDF</option><option value="worksheet" ${material.type==="worksheet"?"selected":""}>Ficha</option><option value="audio" ${material.type==="audio"?"selected":""}>Audio</option><option value="link" ${material.type==="link"?"selected":""}>Enlace</option></select><input data-material-field="url" type="url" value="${escapeHtml(material.url)}" placeholder="Enlace HTTPS opcional"><button type="button" data-remove-material="${key}" aria-label="Eliminar material">×</button><div class="nalvi-studio-private-upload"><input type="file" accept="application/pdf,.pdf" data-private-material-file="${key}" aria-label="Seleccionar PDF protegido"><button class="nalvi-premium-secondary" type="button" data-private-material-upload="${key}">${material.privatePath?"Reemplazar PDF protegido":"Subir PDF protegido"}</button><span data-private-material-status="${key}" role="status">${material.privatePath?"✓ Documento privado conectado":""}</span><input data-material-field="privatePath" type="hidden" value="${escapeHtml(material.privatePath||"")}"></div></div>`}

  function collectEditor(){
    const form=document.querySelector("#nalviStudioEditor"),base=state.editing||blankCourse();if(!form)return base;
    const value=name=>form.elements[name]?.value??"";
    const course={...base,courseId:value("courseId").trim(),title:value("title").trim(),contentType:value("contentType")||"course",level:value("level").trim(),summary:value("summary").trim(),description:value("description").trim(),coverImageUrl:value("coverImageUrl").trim(),access:value("access"),status:value("status"),order:Number(value("order"))||0,lessons:[]};
    form.querySelectorAll(".nalvi-studio-lesson").forEach((node,index)=>{const field=name=>node.querySelector(`[data-lesson-field="${name}"]`)?.value??"";const lesson={...(base.lessons[index]||blankLesson(index,course.contentType)),title:field("title").trim(),summary:field("summary").trim(),body:field("body").trim(),durationMinutes:Number(field("durationMinutes"))||0,status:field("status"),videoProvider:field("videoProvider")||"none",videoValue:field("videoValue").trim(),order:index,materials:[]};node.querySelectorAll(".nalvi-studio-material").forEach((materialNode,materialIndex)=>{const materialField=name=>materialNode.querySelector(`[data-material-field="${name}"]`)?.value??"";lesson.materials.push({...(base.lessons[index]?.materials?.[materialIndex]||blankMaterial(materialIndex)),title:materialField("title").trim(),type:materialField("type"),url:materialField("url").trim(),privatePath:materialField("privatePath").trim()})});course.lessons.push(lesson)});
    return course;
  }

  const privateResourceSlug=value=>String(value||"documento").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,70)||"documento";

  async function uploadPrivateMaterial(lessonIndex,materialIndex,button){
    state.editing=collectEditor();
    const course=state.editing,lesson=course.lessons[lessonIndex],material=lesson?.materials?.[materialIndex],key=`${lessonIndex}:${materialIndex}`;
    const container=button.closest(".nalvi-studio-material"),file=container?.querySelector(`[data-private-material-file="${key}"]`)?.files?.[0],status=container?.querySelector(`[data-private-material-status="${key}"]`);
    if(!course.courseId){window.showToast?.("Guarda la biblioteca antes de subir documentos.");if(status)status.textContent="Guarda primero para crear el ID estable.";return}
    if(!material||!file){window.showToast?.("Selecciona un archivo PDF.");if(status)status.textContent="Selecciona un PDF para continuar.";return}
    if(file.type!=="application/pdf"&&!file.name.toLowerCase().endsWith(".pdf")){window.showToast?.("Solo se permiten archivos PDF.");return}
    if(typeof window.NALVI_UPLOAD_PRIVATE_BLOB!=="function"){window.showToast?.("El cargador privado todavía no está listo.");return}
    button.disabled=true;
    try{
      if(status)status.textContent="Preparando carga segura…";
      const pathname=`nalvi-plus/library/${privateResourceSlug(course.courseId)}/${privateResourceSlug(material.title||file.name)}.pdf`;
      await window.NALVI_UPLOAD_PRIVATE_BLOB(pathname,file,{headers:await authHeaders(),onProgress:event=>{const percent=Math.round(Number(event?.percentage)||0);if(status)status.textContent=`Subiendo documento… ${percent}%`}});
      material.privatePath=pathname;material.url="";material.type="pdf";state.editing=course;renderEditor();
      const updated=document.querySelector(`[data-private-material-status="${key}"]`);if(updated)updated.textContent="✓ Documento privado conectado. Guarda la biblioteca.";
      window.showToast?.("PDF protegido listo. Guarda la biblioteca para publicarlo.");
    }catch(error){console.error("NALVI_PRIVATE_UPLOAD",error);if(status)status.textContent="No pudimos completar la carga. Inténtalo nuevamente.";window.showToast?.("No pudimos subir el PDF protegido.")}
    finally{button.disabled=false}
  }

  function uploadFileToMux(uploadUrl,file,onProgress){
    return new Promise((resolve,reject)=>{
      const request=new XMLHttpRequest();
      request.open("PUT",uploadUrl,true);
      request.setRequestHeader("Content-Type",file.type||"application/octet-stream");
      request.upload.addEventListener("progress",event=>{if(event.lengthComputable)onProgress?.(Math.round(event.loaded/event.total*100))});
      request.addEventListener("load",()=>request.status>=200&&request.status<300?resolve():reject(new Error(`MUX_UPLOAD_${request.status}`)));
      request.addEventListener("error",()=>reject(new Error("MUX_UPLOAD_NETWORK")));
      request.send(file);
    });
  }

  async function waitForMuxAsset(uploadId,statusNode){
    for(let attempt=0;attempt<225;attempt+=1){
      const{response,payload}=await muxApi("upload-status",{uploadId});
      if(!response.ok)throw new Error(payload.reason||"MUX_STATUS_UNAVAILABLE");
      if(payload.error)throw new Error("MUX_VIDEO_PROCESSING_FAILED");
      if(payload.playbackId)return payload;
      statusNode.textContent=payload.assetStatus==="preparing"?"Procesando el video…":"Mux está preparando el video…";
      await new Promise(resolve=>setTimeout(resolve,4000));
    }
    throw new Error("MUX_PROCESSING_TIMEOUT");
  }

  async function uploadLessonVideo(index,button){
    state.editing=collectEditor();
    const course=state.editing,lesson=course.lessons[index];
    const container=button.closest(".nalvi-studio-lesson");
    const file=container?.querySelector(`[data-mux-file="${index}"]`)?.files?.[0];
    const status=container?.querySelector(`[data-mux-status="${index}"]`);
    if(!course.courseId){window.showToast?.("Guarda el curso antes de subir el video.");if(status)status.textContent="Guarda primero el curso para crear su ID.";return}
    if(!lesson||!file){window.showToast?.("Selecciona un archivo de video.");if(status)status.textContent="Selecciona un video para continuar.";return}
    button.disabled=true;
    try{
      if(status)status.textContent="Solicitando una carga segura…";
      const{response,payload}=await muxApi("create-upload",{method:"POST",body:{courseId:course.courseId,lessonId:lesson.lessonId}});
      if(!response.ok||!payload.uploadUrl||!payload.uploadId)throw new Error(payload.reason||"MUX_UPLOAD_UNAVAILABLE");
      await uploadFileToMux(payload.uploadUrl,file,percent=>{if(status)status.textContent=`Subiendo a Mux… ${percent}%`});
      if(status)status.textContent="Carga completa. Mux está procesando el video…";
      const ready=await waitForMuxAsset(payload.uploadId,status);
      lesson.videoProvider="mux";
      lesson.videoValue=ready.playbackId;
      if(ready.durationSeconds)lesson.durationMinutes=Math.max(1,Math.ceil(ready.durationSeconds/60));
      state.editing=course;
      renderEditor();
      document.querySelector(`[data-mux-status="${index}"]`).textContent="✓ Video protegido listo. Guarda el curso para publicarlo.";
      window.showToast?.("Video protegido listo en Mux.");
    }catch(error){console.error("NALVI_MUX_UPLOAD",error);if(status)status.textContent="No pudimos completar la carga. Inténtalo nuevamente.";window.showToast?.("No pudimos subir el video a Mux.")}
    finally{button.disabled=false}
  }

  async function saveEditor(){
    state.editing=collectEditor();const status=document.querySelector("#nalviStudioStatus");if(status)status.textContent="Guardando…";
    const{response,payload}=await api("admin-save",{method:"POST",body:{course:state.editing},auth:true});
    if(!response.ok){if(status)status.textContent=payload.reason==="COURSE_TITLE_REQUIRED"?"Escribe el título del curso.":payload.reason==="COURSE_TOO_LARGE"?"El curso supera el tamaño permitido. Divide el contenido.":"No pudimos guardar el curso.";return}
    state.editing=clone(payload.course);if(status)status.textContent="✓ Curso guardado correctamente.";await loadAdminCourses();await loadCatalog();window.showToast?.("Curso guardado correctamente.")
  }

  function bindEvents(){
    document.addEventListener("click",async event=>{
      const target=event.target.closest?.("button,a");if(!target)return;
      if(target.matches("[data-premium-academy-open]")){navigate(ACADEMY_ROUTE,true);await loadAcademy();window.scrollTo({top:0,behavior:"auto"})}
      else if(target.matches("[data-premium-back]")){navigate("catalog",true)}
      else if(target.matches("[data-premium-studio-open]")){await openStudio()}
      else if(target.matches("[data-studio-back]")){navigate(ACADEMY_ROUTE,true);await loadAcademy()}
      else if(target.matches("[data-premium-login]")){window.courseGoogleLogin?.()}
      else if(target.dataset.premiumSubscribe){await startSubscription(target.dataset.premiumSubscribe)}
      else if(target.dataset.premiumCourse){await openCourse(target.dataset.premiumCourse)}
      else if(target.dataset.premiumLesson){if(state.reader.course)renderReader(state.reader.course,state.reader.access,target.dataset.premiumLesson)}
      else if(target.dataset.premiumLibrarySection){if(state.reader.course)renderLibraryReader(state.reader.course,state.reader.access,target.dataset.premiumLibrarySection)}
      else if(target.dataset.premiumPrivateMaterial){await openPrivateMaterial(target.dataset.premiumResourceCourse,target.dataset.premiumResourceLesson,target.dataset.premiumPrivateMaterial,target)}
      else if(target.dataset.premiumComplete){await saveLessonProgress(target.dataset.premiumComplete,target)}
      else if(target.matches("[data-premium-reader-close]")){closeReader()}
      else if(target.matches("[data-studio-new]")){state.editing=blankCourse();renderStudioList();renderEditor()}
      else if(target.matches("[data-studio-refresh]")){await loadAdminCourses()}
      else if(target.dataset.studioEdit){const course=state.adminCourses.find(item=>item.courseId===target.dataset.studioEdit);if(course){state.editing=clone(course);renderStudioList();renderEditor()}}
      else if(target.matches("[data-studio-add-lesson]")){state.editing=collectEditor();state.editing.lessons.push(blankLesson(state.editing.lessons.length,state.editing.contentType));renderEditor()}
      else if(target.dataset.muxUpload!==undefined){await uploadLessonVideo(Number(target.dataset.muxUpload),target)}
      else if(target.dataset.privateMaterialUpload){const[lessonIndex,materialIndex]=target.dataset.privateMaterialUpload.split(":").map(Number);await uploadPrivateMaterial(lessonIndex,materialIndex,target)}
      else if(target.dataset.removeLesson!==undefined){state.editing=collectEditor();state.editing.lessons.splice(Number(target.dataset.removeLesson),1);renderEditor()}
      else if(target.dataset.addMaterial!==undefined){state.editing=collectEditor();const lesson=state.editing.lessons[Number(target.dataset.addMaterial)];if(lesson){lesson.materials.push(blankMaterial(lesson.materials.length));renderEditor()}}
      else if(target.dataset.removeMaterial){state.editing=collectEditor();const[lessonIndex,materialIndex]=target.dataset.removeMaterial.split(":").map(Number);state.editing.lessons[lessonIndex]?.materials.splice(materialIndex,1);renderEditor()}
      else if(target.matches("[data-studio-preview]")){const course=collectEditor();if(course.courseId)renderReader(course,"administrator");navigate(ACADEMY_ROUTE,true)}
    });
    document.querySelector("#nalviStudioEditor")?.addEventListener("submit",event=>{event.preventDefault();saveEditor()});
    document.querySelector("#nalviStudioEditor")?.addEventListener("change",event=>{if(event.target?.name==="contentType"){state.editing=collectEditor();renderEditor()}});
    window.addEventListener("nalvi:auth-known",async()=>{await loadAccess();if(studioRequested&&state.access.administrator&&document.querySelector(`#${STUDIO_ROUTE}`)?.classList.contains("hide")){navigate(STUDIO_ROUTE,false);await loadAdminCourses();return}if(!document.querySelector(`#${ACADEMY_ROUTE}`)?.classList.contains("hide"))await loadAcademy()});
  }

  install();
  setTimeout(loadAccess,0);
  if(location.hash===`#${ACADEMY_ROUTE}`||routeParams.get("premiumAcademy")==="1")setTimeout(()=>{navigate(ACADEMY_ROUTE,false);loadAcademy()},80);
  if(studioRequested&&window.NALVI_AUTH_SNAPSHOT)setTimeout(openStudio,80);
})();
