/* NALVI Accessibility · persistent, user-controlled access preferences. */
(function(){
  "use strict";

  const VERSION="NALVI-ACCESSIBILITY-1";
  const STORAGE_KEY="nalviAccessibility.v1";
  const defaults={accessibleGames:false,largeText:false,highContrast:false,reducedMotion:window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches===true};
  let settings=readSettings();
  let lastGamePrompt="";
  let gameFocusTimer=0;

  function readSettings(){try{return{...defaults,...JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}")}}catch{return{...defaults}}}
  function saveSettings(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(settings))}catch{}}
  function announce(message){const live=document.querySelector("#nalviAccessibilityLive");if(!live)return;live.textContent="";setTimeout(()=>{live.textContent=message},20)}
  function applySettings({notify=false}={}){
    const root=document.documentElement;
    root.dataset.nalviAccessibleGames=String(!!settings.accessibleGames);
    root.classList.toggle("nalvi-large-text",!!settings.largeText);
    root.classList.toggle("nalvi-high-contrast",!!settings.highContrast);
    root.classList.toggle("nalvi-reduced-motion",!!settings.reducedMotion);
    document.querySelectorAll("[data-nalvi-accessibility-setting]").forEach(input=>{input.checked=!!settings[input.dataset.nalviAccessibilitySetting]});
    saveSettings();
    if(notify)announce("Preferencias de accesibilidad guardadas.");
  }

  function markup(){return `<a class="nalvi-skip-link" href="#nalviMain">Saltar al contenido principal</a><div class="nalvi-sr-only" id="nalviAccessibilityLive" role="status" aria-live="polite" aria-atomic="true"></div><dialog class="nalvi-accessibility-dialog" id="nalviAccessibilityDialog" aria-labelledby="nalviAccessibilityTitle"><form method="dialog" class="nalvi-accessibility-card"><header><div><small>ACCESIBILIDAD</small><h2 id="nalviAccessibilityTitle">Ajusta NALVI a tus necesidades</h2></div><button type="submit" value="close" aria-label="Cerrar opciones de accesibilidad">×</button></header><p>Estas preferencias quedan guardadas en este dispositivo.</p><label><input type="checkbox" data-nalvi-accessibility-setting="accessibleGames"><span><b>Juegos accesibles</b><small>Usa actividades con botones y teclado en lugar del mundo visual 3D.</small></span></label><label><input type="checkbox" data-nalvi-accessibility-setting="largeText"><span><b>Texto más grande</b><small>Aumenta el tamaño de lectura en toda la plataforma.</small></span></label><label><input type="checkbox" data-nalvi-accessibility-setting="highContrast"><span><b>Alto contraste</b><small>Refuerza colores, bordes y controles.</small></span></label><label><input type="checkbox" data-nalvi-accessibility-setting="reducedMotion"><span><b>Reducir movimiento</b><small>Evita animaciones y desplazamientos innecesarios.</small></span></label><button class="btn nalvi-accessibility-done" type="submit" value="close">Listo</button></form></dialog>`}

  function installControls(){
    const main=document.querySelector("main");if(main&&!main.id)main.id="nalviMain";
    if(!document.querySelector("#nalviAccessibilityDialog"))document.body.insertAdjacentHTML("afterbegin",markup());
    const tools=document.querySelector("header .header-tools");
    if(tools&&!document.querySelector("#nalviAccessibilityButton"))tools.insertAdjacentHTML("afterbegin",`<button class="nalvi-accessibility-button" id="nalviAccessibilityButton" type="button" aria-label="Opciones de accesibilidad" aria-haspopup="dialog" title="Accesibilidad"><span aria-hidden="true">♿</span><i>Accesibilidad</i></button>`);
    document.querySelector("#nalviAccessibilityButton")?.addEventListener("click",()=>{applySettings();document.querySelector("#nalviAccessibilityDialog")?.showModal();setTimeout(()=>document.querySelector("#nalviAccessibilityDialog input")?.focus(),0)});
    document.querySelectorAll("[data-nalvi-accessibility-setting]").forEach(input=>input.addEventListener("change",()=>{settings[input.dataset.nalviAccessibilitySetting]=input.checked;applySettings({notify:true})}));
    document.querySelector("#nalviAccessibilityDialog")?.addEventListener("close",()=>document.querySelector("#nalviAccessibilityButton")?.focus());
  }

  function enhanceGame(){
    const body=document.querySelector("#kidsGameBody");if(!body)return;
    body.setAttribute("role","region");body.setAttribute("aria-label","Actividad del juego");
    const feedback=body.querySelector("#kidFeedback");if(feedback){feedback.setAttribute("role","status");feedback.setAttribute("aria-live","polite");feedback.setAttribute("aria-atomic","true")}
    const drop=body.querySelector("#kidDropZone");if(drop){drop.tabIndex=0;drop.setAttribute("role","button");drop.setAttribute("aria-label","Confirmar el dibujo seleccionado");drop.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();drop.click()}})}
    body.querySelectorAll("[draggable='true']").forEach(node=>node.setAttribute("aria-describedby","nalviAccessibleGameHint"));
    if(settings.accessibleGames&&!body.querySelector("#nalviAccessibleGameHint"))body.insertAdjacentHTML("afterbegin",'<p class="nalvi-accessible-game-hint" id="nalviAccessibleGameHint">Puedes completar esta actividad con Tab, Enter y las flechas del teclado.</p>');
    const heading=body.querySelector("h2"),prompt=heading?.textContent?.trim()||"";
    if(settings.accessibleGames&&heading&&prompt&&prompt!==lastGamePrompt){lastGamePrompt=prompt;heading.tabIndex=-1;clearTimeout(gameFocusTimer);gameFocusTimer=setTimeout(()=>{heading.focus({preventScroll:false});announce(`Nueva actividad: ${prompt}`)},80)}
  }

  function observeGames(){const body=document.querySelector("#kidsGameBody");if(!body)return;enhanceGame();new MutationObserver(()=>enhanceGame()).observe(body,{childList:true,subtree:true})}
  function init(){installControls();applySettings();observeGames();document.documentElement.dataset.nalviAccessibility=VERSION;window.NALVI_ACCESSIBILITY={VERSION,getSettings:()=>({...settings}),applySettings}}

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
