(()=>{
  "use strict";
  const PLAN_KEY="nalvi_test_course_once";
  const ROUTE="paidCourseTest";
  const params=new URLSearchParams(location.search);
  const enabled=params.get("billingTest")==="1"||(params.get("billing")==="success"&&params.get("plan")===PLAN_KEY);
  if(!enabled)return;

  const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const main=document.querySelector("main");
  const grid=document.querySelector("#catalog .course-grid");
  if(!main)return;

  try{if(Array.isArray(views)&&!views.includes(ROUTE))views.push(ROUTE)}catch{}

  grid?.insertAdjacentHTML("beforeend",`<article class="course-card nalvi-paid-test-catalog"><div class="course-ribbon">PRUEBA · PAGO ÚNICO</div><div class="course-card-icon">🔐📘</div><h3>Curso ficticio de pago único</h3><p>Valida de forma segura que el contenido se desbloquee solamente después de una compra de prueba.</p><div class="course-card-stats"><span>🧪 Sin cobro real</span><span>🔒 Acceso individual</span></div><button class="btn" type="button" data-paid-test-open>Abrir prueba →</button></article>`);

  main.insertAdjacentHTML("beforeend",`<section id="${ROUTE}" class="hide" aria-labelledby="paidCourseTestTitle"><div class="nalvi-paid-test-shell"><button class="nalvi-paid-test-back" type="button" data-paid-test-back>← Volver a cursos</button><div class="nalvi-paid-test-hero"><article class="nalvi-paid-test-card"><span class="nalvi-paid-test-tag">🧪 ENTORNO DE PRUEBA · SIN COBRO REAL</span><h2 id="paidCourseTestTitle">Curso ficticio de pago único</h2><p>Esta pantalla comprueba el flujo completo de una compra individual: identidad, checkout, webhook firmado y permiso permanente.</p><div class="nalvi-paid-test-points"><span>✓ Producto específico</span><span>✓ Un solo pago</span><span>✓ Acceso por usuario</span></div></article><aside class="nalvi-paid-test-state"><div class="nalvi-paid-test-lock" id="paidCourseIcon">🔒</div><h3 id="paidCourseStateTitle">Contenido bloqueado</h3><p id="paidCourseStateCopy">Inicia sesión y realiza la compra de prueba para habilitar la lección.</p><button class="nalvi-paid-test-action" id="paidCourseAction" type="button">Comprobar acceso</button><button class="nalvi-paid-test-action nalvi-paid-test-secondary" id="paidCourseLogin" type="button" hidden>Iniciar sesión con Google</button><div class="nalvi-paid-test-notice" id="paidCourseNotice">Lemon Squeezy debe mostrar “Test mode”. Nunca uses una tarjeta real.</div></aside></div><section class="nalvi-paid-test-content" id="paidCourseContent" hidden aria-live="polite"></section></div></section>`);

  const $=selector=>document.querySelector(selector);
  const action=$("#paidCourseAction"),login=$("#paidCourseLogin"),notice=$("#paidCourseNotice"),content=$("#paidCourseContent");
  const setNotice=(message,kind="")=>{notice.textContent=message;notice.dataset.kind=kind};
  const firebaseReady=()=>window.GCA_FIREBASE_LIVE?Promise.resolve(window.GCA_FIREBASE_LIVE):new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("FIREBASE_TIMEOUT")),12000);window.addEventListener("gca:firebase-live-ready",()=>{clearTimeout(timer);resolve(window.GCA_FIREBASE_LIVE)},{once:true})});
  const currentUser=async()=>{const live=await firebaseReady();return live.auth.currentUser};
  const request=async(operation,user,options={})=>{
    const token=await user.getIdToken();
    const query=new URLSearchParams({operation,planKey:PLAN_KEY});
    const response=await fetch(`/api/billing?${query}`,{
      ...options,
      headers:{Authorization:`Bearer ${token}`,...(options.headers||{})}
    });
    const payload=await response.json().catch(()=>({ok:false,reason:"INVALID_RESPONSE"}));
    return{response,payload};
  };
  const renderCourse=course=>{
    const lessons=Array.isArray(course?.lessons)?course.lessons:[];
    content.innerHTML=`<header><div><h3>${escapeHtml(course?.title||"Curso habilitado")}</h3><p>${escapeHtml(course?.subtitle||"")}</p></div><span class="nalvi-paid-test-paid">✓ Compra verificada</span></header>${lessons.map(lesson=>`<article class="nalvi-paid-test-lesson"><h4>${escapeHtml(lesson.title)}</h4><p>${escapeHtml(lesson.summary)}</p><div class="nalvi-paid-test-words">${(lesson.vocabulary||[]).map(word=>`<div class="nalvi-paid-test-word"><b>${escapeHtml(word.guarani)}</b><small>${escapeHtml(word.spanish)}</small></div>`).join("")}</div></article>`).join("")}`;
    content.hidden=false;$("#paidCourseIcon").textContent="🔓";$("#paidCourseStateTitle").textContent="Curso habilitado";$("#paidCourseStateCopy").textContent="El webhook confirmó tu compra y este acceso queda asociado a tu cuenta.";action.textContent="Volver a comprobar";setNotice("Compra verificada. El contenido llegó desde el servidor.","ok");
  };
  const showSignedOut=()=>{login.hidden=false;action.hidden=true;setNotice("Inicia sesión con Google para asociar la compra a una cuenta.","error")};
  const checkAccess=async({poll=false}={})=>{
    action.disabled=true;setNotice(poll?"Esperando la confirmación segura del pago…":"Comprobando tu acceso…");
    try{
      const user=await currentUser();
      if(!user||user.isAnonymous)return showSignedOut();
      login.hidden=true;action.hidden=false;
      const attempts=poll?8:1;
      for(let index=0;index<attempts;index+=1){
        const {response,payload}=await request("course-content",user);
        if(response.ok&&payload.course){renderCourse(payload.course);return true}
        if(response.status!==402)throw new Error(payload.reason||"COURSE_ACCESS_UNAVAILABLE");
        if(index<attempts-1)await new Promise(resolve=>setTimeout(resolve,1500));
      }
      content.hidden=true;$("#paidCourseIcon").textContent="🔒";$("#paidCourseStateTitle").textContent="Contenido bloqueado";$("#paidCourseStateCopy").textContent="Todavía no existe una compra confirmada para esta cuenta.";action.textContent="Comprar en modo de prueba";setNotice("Acceso bloqueado correctamente. La prueba de compra no realiza cobros reales.");return false;
    }catch(error){setNotice("No pudimos comprobar el acceso. Inténtalo nuevamente.","error");console.error("NALVI_ONE_TIME_ACCESS",error);return false}
    finally{action.disabled=false}
  };
  const startCheckout=async()=>{
    action.disabled=true;setNotice("Creando un checkout de prueba vinculado a tu cuenta…");
    try{
      const user=await currentUser();
      if(!user||user.isAnonymous)return showSignedOut();
      const token=await user.getIdToken();
      const response=await fetch("/api/billing?operation=checkout",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({planKey:PLAN_KEY})});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok||payload.kind!=="one_time"||!payload.checkoutUrl)throw new Error(payload.reason||"CHECKOUT_UNAVAILABLE");
      location.assign(payload.checkoutUrl);
    }catch(error){setNotice("No pudimos abrir el checkout de prueba. Revisa la configuración del producto.","error");console.error("NALVI_ONE_TIME_CHECKOUT",error);action.disabled=false}
  };

  grid?.querySelector("[data-paid-test-open]")?.addEventListener("click",()=>window.show?.(ROUTE,true));
  $("[data-paid-test-back]")?.addEventListener("click",()=>window.show?.("catalog",true));
  login.addEventListener("click",()=>window.courseGoogleLogin?.());
  action.addEventListener("click",async()=>{const purchased=await checkAccess();if(!purchased)await startCheckout()});
  window.addEventListener("nalvi:auth-known",()=>{if(!$("#paidCourseTest")?.classList.contains("hide"))checkAccess()});

  if(location.hash===`#${ROUTE}`||params.get("billingTest")==="1"){
    window.show?.(ROUTE,false);
    window.scrollTo({top:0,behavior:"auto"});
    checkAccess({poll:params.get("billing")==="success"});
  }
})();
