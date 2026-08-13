const VERSION="gca-22";
const SHELL_CACHE=`${VERSION}-shell`;
const STATIC_CACHE=`${VERSION}-static`;
const APP_SHELL=[
  "/",
  "/index.html",
  "/offline.html",
  "/manifest.webmanifest",
  "/arami-aventura.webp",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png"
];

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(SHELL_CACHE).then(cache=>cache.addAll(APP_SHELL)));
});

self.addEventListener("activate",event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(key=>![SHELL_CACHE,STATIC_CACHE].includes(key)).map(key=>caches.delete(key)))),
    self.clients.claim()
  ]));
});

self.addEventListener("message",event=>{
  if(event.data?.type==="SKIP_WAITING")self.skipWaiting();
});

async function networkFirstNavigation(request){
  try{
    const response=await fetch(request);
    if(response.ok){
      const cache=await caches.open(SHELL_CACHE);
      cache.put("/index.html",response.clone());
    }
    return response;
  }catch(error){
    return await caches.match("/index.html")||await caches.match("/offline.html");
  }
}

async function staleWhileRevalidate(request){
  const cache=await caches.open(STATIC_CACHE);
  const cached=await cache.match(request);
  const fresh=fetch(request).then(response=>{
    if(response.ok)cache.put(request,response.clone());
    return response;
  }).catch(()=>null);
  return cached||await fresh||Response.error();
}

self.addEventListener("fetch",event=>{
  const {request}=event;
  if(request.method!=="GET")return;
  const url=new URL(request.url);
  if(request.mode==="navigate"){
    event.respondWith(networkFirstNavigation(request));
    return;
  }
  if(url.origin===self.location.origin&&["style","script","image","font","audio"].includes(request.destination)){
    event.respondWith(staleWhileRevalidate(request));
  }
});
