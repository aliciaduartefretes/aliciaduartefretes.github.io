/* NALVI Community service · Sprint 1 demo adapter. */
(function(){
  "use strict";

  const VERSION="NALVI-COMMUNITY-SERVICE-1";
  const WRITES_ENABLED=false;
  const initialPosts=[
    {id:"announcement",category:1,initials:"NA",author:"Equipo NALVI",role:"Anuncio",date:"Hoy",pinned:true,body:"Bienvenidos al nuevo espacio institucional. Aquí cada conversación puede acompañar un curso, una lección, una tarea o un grupo.",links:["Guaraní general","Grupo inicial"],likes:18,comments:4,commentPreview:{author:"Ana P.",text:"Usaremos este anuncio como punto de encuentro del grupo."}},
    {id:"question",category:2,initials:"MF",author:"María F.",role:"Estudiante",date:"Hace 2 h",body:"¿Dónde puedo volver a practicar los verbos de la unidad?",links:["Lección · Verbos en presente"],likes:7,comments:3,commentPreview:{author:"Ana P.",text:"Está dentro de Guaraní general, en la sección de verbos."}},
    {id:"resource",category:4,initials:"AP",author:"Ana P.",role:"Docente",date:"Ayer",body:"Dejé una guía breve para preparar la próxima actividad en vivo.",links:["Tarea · Práctica semanal","Grupo A"],likes:12,comments:2,commentPreview:{author:"Jorge L.",text:"Gracias, ya pude abrir la tarea."}}
  ];
  const clone=value=>JSON.parse(JSON.stringify(value));
  let posts=initialPosts.map(post=>clone(post));
  const normalizeBody=value=>String(value??"").trim().slice(0,700);

  function listPosts(){return clone(posts)}
  function previewPost(body){const text=normalizeBody(body);if(!text)throw new TypeError("EMPTY_COMMUNITY_POST");const post={id:`draft-${Date.now()}`,category:3,initials:"YO",author:"Vista previa",role:"Borrador local",date:"Ahora",body:text,links:["Grupo demo"],likes:0,comments:0};posts=[post,...posts];return clone(post)}
  function toggleReaction(id,active){const post=posts.find(item=>item.id===id);if(!post)return null;post.likes=Math.max(0,post.likes+(active?1:-1));return clone(post)}
  function createRemotePost(){const error=new Error("COMMUNITY_WRITES_DISABLED");error.code="COMMUNITY_WRITES_DISABLED";throw error}
  function resetDemo(){posts=initialPosts.map(post=>clone(post));return listPosts()}

  window.NALVI_COMMUNITY_SERVICE=Object.freeze({VERSION,WRITES_ENABLED,listPosts,previewPost,toggleReaction,createRemotePost,resetDemo});
})();
