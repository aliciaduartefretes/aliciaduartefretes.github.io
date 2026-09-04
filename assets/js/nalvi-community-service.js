/* NALVI Community service · protected adapter for the social feed. */
(function(){
  "use strict";

  const VERSION="NALVI-COMMUNITY-SERVICE-2";
  const WRITES_ENABLED=window.GCA_FEATURES?.communityWrites===true||window.NALVI_FEATURES?.communityWrites===true;
  const initialPosts=[
    {id:"announcement",category:1,initials:"NA",author:"Equipo NALVI",handle:"@nalvi",role:"Anuncio",date:"Hoy",pinned:true,body:"¡Bienvenidos a Comunidad NALVI! Un lugar para preguntar, compartir lo que aprendemos y encontrarnos alrededor del guaraní.",links:["Guaraní general","Comunidad"],likes:18,comments:4,commentPreview:{author:"Ana P.",text:"Qué lindo contar con este punto de encuentro."}},
    {id:"question",category:2,initials:"MF",author:"María F.",handle:"@mariaf",role:"Estudiante",date:"Hace 2 h",body:"¿Dónde puedo volver a practicar los verbos de la unidad?",links:["Verbos en presente"],likes:7,comments:3,commentPreview:{author:"Ana P.",text:"Está dentro de Guaraní general, en la sección de verbos."}},
    {id:"resource",category:4,initials:"AP",author:"Ana P.",handle:"@anap",role:"Docente",date:"Ayer",body:"Compartí una guía breve para preparar la próxima práctica. ¿Qué verbo quieren repasar primero?",links:["Práctica semanal","Recursos"],likes:12,comments:2,commentPreview:{author:"Jorge L.",text:"Quiero repasar los verbos de movimiento."}}
  ];
  const clone=value=>JSON.parse(JSON.stringify(value));
  let posts=initialPosts.map(post=>clone(post));
  const normalizeBody=value=>String(value??"").trim().slice(0,700);

  function listPosts(){return clone(posts)}
  function previewPost(body){const text=normalizeBody(body);if(!text)throw new TypeError("EMPTY_COMMUNITY_POST");const post={id:`draft-${Date.now()}`,category:3,initials:"YO",author:"Vista previa",role:"Borrador local",date:"Ahora",body:text,links:["Grupo demo"],likes:0,comments:0};posts=[post,...posts];return clone(post)}
  function toggleReaction(id,active){const post=posts.find(item=>item.id===id);if(!post)return null;post.likes=Math.max(0,post.likes+(active?1:-1));return clone(post)}
  function createRemotePost(){const error=new Error(WRITES_ENABLED?"COMMUNITY_SERVICE_NOT_CONNECTED":"COMMUNITY_WRITES_DISABLED");error.code=error.message;throw error}
  function resetDemo(){posts=initialPosts.map(post=>clone(post));return listPosts()}

  window.NALVI_COMMUNITY_SERVICE=Object.freeze({VERSION,WRITES_ENABLED,listPosts,previewPost,toggleReaction,createRemotePost,resetDemo});
})();
