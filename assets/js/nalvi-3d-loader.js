(()=>{
  "use strict";

  const THREE_URL="/assets/js/vendor/three-r152.min.js?v=NALVI-THREE-R152-1";
  const GAME_URL="/assets/js/nalvi-children-3d.js?v=NALVI-CHILDREN-3D-1";
  const fallback=typeof window.openKidMission==="function"?window.openKidMission:null;
  let loading=null;

  function loadScript(id,src){
    const existing=document.getElementById(id);
    if(existing?.dataset.loaded==="true")return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const script=existing||document.createElement("script");
      const timer=setTimeout(()=>reject(new Error(`TIMEOUT_${id}`)),20000);
      script.id=id;
      script.src=src;
      script.async=false;
      script.onload=()=>{clearTimeout(timer);script.dataset.loaded="true";resolve()};
      script.onerror=()=>{clearTimeout(timer);reject(new Error(`LOAD_FAILED_${id}`))};
      if(!existing)document.head.appendChild(script);
    });
  }

  async function ensureGame(){
    if(window.NALVI_VISUAL_KIDS_LAUNCH&&window.THREE)return;
    if(!loading)loading=(async()=>{
      if(!window.THREE)await loadScript("nalvi-three-runtime",THREE_URL);
      await loadScript("nalvi-children-3d-runtime",GAME_URL);
    })().catch(error=>{loading=null;throw error});
    await loading;
  }

  async function lazyOpen(world,mission){
    document.documentElement.dataset.nalviGameLoading="true";
    window.showToast?.("Preparando Mundo Guaraní 3D…");
    try{
      await ensureGame();
      const launch=window.openKidMission!==lazyOpen?window.openKidMission:window.NALVI_VISUAL_KIDS_LAUNCH;
      if(typeof launch!=="function")throw new Error("GAME_LAUNCHER_UNAVAILABLE");
      return launch(world,mission);
    }catch(error){
      console.error("NALVI_3D_LAZY_LOAD",error);
      window.showToast?.("No pudimos abrir el mundo 3D. Usaremos la práctica ligera.");
      if(fallback&&fallback!==lazyOpen)return fallback(world,mission);
    }finally{
      delete document.documentElement.dataset.nalviGameLoading;
    }
  }

  window.openKidMission=lazyOpen;
  window.NALVI_3D_LOADER=Object.freeze({load:ensureGame,isLoaded:()=>Boolean(window.THREE&&window.NALVI_VISUAL_KIDS_LAUNCH)});
})();
