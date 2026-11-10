(()=>{
  "use strict";
  const API="/api/premium-academy?operation=live-courses",ADMIN_EMAILS=new Set(["aliciaduartefretes@gmail.com"]);
  const $=selector=>document.querySelector(selector);
  const dialog=$("#nalviLiveCourseDialog"),form=$("#nalviLiveCourseForm"),status=$("#nalviLiveCourseStatus"),success=$("#nalviLiveCourseSuccess"),formView=$("#nalviLiveCourseFormView");
  if(!dialog||!form)return;
  const escapeHtml=value=>String(value??"").replace(/[&<>'"]/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[character]));
  const firebaseReady=()=>window.GCA_FIREBASE_LIVE?Promise.resolve(window.GCA_FIREBASE_LIVE):new Promise(resolve=>{const timer=setTimeout(()=>resolve(null),2500);window.addEventListener("gca:firebase-live-ready",()=>{clearTimeout(timer);resolve(window.GCA_FIREBASE_LIVE)},{once:true})});
  const currentUser=async()=>{try{return(await firebaseReady())?.auth?.currentUser||null}catch{return null}};
  const authHeaders=async()=>{const user=await currentUser();return user&&!user.isAnonymous?{Authorization:`Bearer ${await user.getIdToken()}`}:{}};
  const setStatus=(message,error=false)=>{if(!status)return;status.textContent=message||"";status.classList.toggle("error",error)};
  const formatSchedule=value=>({"weekday-evenings":"Entre semana por la tarde/noche","saturday-mornings":"Sábados por la mañana","flexible":"Horario flexible","other":"Otro horario"}[value]||value||"Sin preferencia");
  const formatLevel=value=>({new:"Empieza desde cero",beginner:"Ya conoce lo básico",intermediate:"Nivel intermedio"}[value]||value||"—");

  async function prefill(){
    const user=await currentUser();
    if(user&&!user.isAnonymous){
      if(!form.elements.name.value)form.elements.name.value=user.displayName||"";
      if(!form.elements.email.value)form.elements.email.value=user.email||"";
      const email=String(user.email||"").toLowerCase(),admin=$("#nalviLiveAdmin");
      if(admin)admin.hidden=!ADMIN_EMAILS.has(email);
    }
  }

  function resetView(){formView.hidden=false;success.hidden=true;setStatus("");form.querySelector("button[type=submit]").disabled=false}

  async function openDialog(){
    resetView();
    form.dataset.startedAt=String(Date.now());
    form.elements.timezone.value=Intl.DateTimeFormat().resolvedOptions().timeZone||"";
    await prefill();
    if(typeof dialog.showModal==="function"&&!dialog.open)dialog.showModal();else dialog.setAttribute("open","");
    requestAnimationFrame(()=>form.elements.name?.focus());
    window.courseAnalytics?.("live_course_interest_opened",{course_id:"guarani-live-founders-2026",source:"home_banner"});
  }

  function closeDialog(){if(typeof dialog.close==="function"&&dialog.open)dialog.close();else dialog.removeAttribute("open")}

  document.querySelectorAll("[data-live-course-open]").forEach(button=>button.addEventListener("click",openDialog));
  dialog.querySelectorAll("[data-live-course-close]").forEach(button=>button.addEventListener("click",closeDialog));
  dialog.addEventListener("click",event=>{if(event.target===dialog)closeDialog()});

  form.addEventListener("submit",async event=>{
    event.preventDefault();
    const button=form.querySelector("button[type=submit]");button.disabled=true;setStatus("Guardando tu lugar…");
    const data=new FormData(form),body=Object.fromEntries(data.entries());
    body.consent=data.get("consent")==="on";body.marketingConsent=data.get("marketingConsent")==="on";body.locale=document.documentElement.lang||"es";body.source="home-live-course-banner";body.formStartedAt=Number(form.dataset.startedAt||Date.now());
    try{
      const headers={"Content-Type":"application/json",...await authHeaders()};
      const response=await fetch(`${API}&action=interest`,{method:"POST",headers,body:JSON.stringify(body)}),payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.reason||"REGISTRATION_FAILED");
      formView.hidden=true;success.hidden=false;
      const title=$("#nalviLiveSuccessTitle"),copy=$("#nalviLiveSuccessCopy");
      if(payload.status==="already_registered"){title.textContent="Tu lugar ya estaba reservado";copy.textContent="Encontramos tu inscripción anterior. No duplicamos tus datos y conservamos tu lugar en la lista prioritaria."}
      else{title.textContent="¡Tu lugar quedó reservado!";copy.textContent="Te contactaremos para confirmar horario, docente y forma de pago antes de abrir la cohorte."}
      window.courseAnalytics?.("live_course_interest_registered",{course_id:"guarani-live-founders-2026",status:payload.status||"registered"});
      window.showToast?.("Tu inscripción fue recibida.");
    }catch(error){
      console.error("NALVI_LIVE_COURSE_INTEREST",error);button.disabled=false;
      const messages={NAME_REQUIRED:"Escribe tu nombre.",VALID_EMAIL_REQUIRED:"Revisa tu correo electrónico.",COUNTRY_REQUIRED:"Indica tu país.",SCHEDULE_REQUIRED:"Elige el horario que te conviene.",LEVEL_REQUIRED:"Indica tu nivel actual.",CONSENT_REQUIRED:"Necesitamos tu autorización para contactarte."};
      setStatus(messages[error.message]||"No pudimos guardar tu lugar. Inténtalo nuevamente.",true);
    }
  });

  $("#nalviLiveAdminButton")?.addEventListener("click",async event=>{
    const button=event.currentTarget,panel=$("#nalviLiveAdminPanel");button.disabled=true;panel.innerHTML='<p class="nalvi-live-admin-summary">Cargando inscripciones…</p>';
    try{
      const response=await fetch(`${API}&action=admin-list`,{headers:await authHeaders()}),payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.reason||"ADMIN_LIST_FAILED");
      const interests=Array.isArray(payload.interests)?payload.interests:[];
      panel.innerHTML=`<p class="nalvi-live-admin-summary"><b>${interests.length}</b> ${interests.length===1?"persona inscrita":"personas inscritas"}</p><div class="nalvi-live-admin-list">${interests.length?interests.map(item=>`<article class="nalvi-live-admin-lead"><b>${escapeHtml(item.name)}</b><span>${escapeHtml(item.email)}${item.whatsapp?` · ${escapeHtml(item.whatsapp)}`:""}</span><small>${escapeHtml(item.country)} · ${escapeHtml(formatSchedule(item.schedule))} · ${escapeHtml(formatLevel(item.level))}${item.goal?`<br>${escapeHtml(item.goal)}`:""}</small></article>`).join(""):'<p class="nalvi-live-admin-summary">Todavía no hay inscripciones.</p>'}</div>`;
    }catch{panel.innerHTML='<p class="nalvi-live-admin-summary">No pudimos cargar la lista. Actualiza e inténtalo otra vez.</p>'}finally{button.disabled=false}
  });

  window.NALVI_LIVE_COURSES={open:openDialog};
})();
