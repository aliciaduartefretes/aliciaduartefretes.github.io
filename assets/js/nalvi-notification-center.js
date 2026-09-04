/* NALVI global notification center · relevant Community interactions only. */
(function(){
  "use strict";

  const VERSION="NALVI-NOTIFICATION-CENTER-1";
  const COPY={
    es:{label:"Notificaciones",title:"Marandu · Notificaciones",empty:"Todavía no hay interacciones nuevas.",signIn:"Inicia sesión para ver tus notificaciones.",comment:"comentó en tu publicación",like:"marcó Me gusta en tu publicación",follow:"comenzó a seguirte",someone:"Alguien",open:"Abrir",close:"Cerrar"},
    en:{label:"Notifications",title:"Marandu · Notifications",empty:"There are no new interactions yet.",signIn:"Sign in to see your notifications.",comment:"commented on your post",like:"liked your post",follow:"started following you",someone:"Someone",open:"Open",close:"Close"},
    pt:{label:"Notificações",title:"Marandu · Notificações",empty:"Ainda não há novas interações.",signIn:"Entre para ver suas notificações.",comment:"comentou na sua publicação",like:"curtiu sua publicação",follow:"começou a seguir você",someone:"Alguém",open:"Abrir",close:"Fechar"},
    fr:{label:"Notifications",title:"Marandu · Notifications",empty:"Il n’y a pas encore de nouvelles interactions.",signIn:"Connectez-vous pour voir vos notifications.",comment:"a commenté votre publication",like:"a aimé votre publication",follow:"a commencé à vous suivre",someone:"Quelqu’un",open:"Ouvrir",close:"Fermer"},
    it:{label:"Notifiche",title:"Marandu · Notifiche",empty:"Non ci sono ancora nuove interazioni.",signIn:"Accedi per vedere le notifiche.",comment:"ha commentato il tuo post",like:"ha messo Mi piace al tuo post",follow:"ha iniziato a seguirti",someone:"Qualcuno",open:"Apri",close:"Chiudi"},
    de:{label:"Benachrichtigungen",title:"Marandu · Benachrichtigungen",empty:"Es gibt noch keine neuen Interaktionen.",signIn:"Melde dich an, um Benachrichtigungen zu sehen.",comment:"hat deinen Beitrag kommentiert",like:"gefällt dein Beitrag",follow:"folgt dir jetzt",someone:"Jemand",open:"Öffnen",close:"Schließen"}
  };
  const BELL='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path><path d="M10 21h4"></path></svg>';
  const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]);
  const state={items:[],open:false,unsubscribe:null,userId:"",seenAt:0};
  const locale=()=>{const raw=document.querySelector("#headerLang")?.value||document.documentElement.lang||"es",key=String(raw).toLowerCase().slice(0,2);return COPY[key]?key:"es"};
  const copy=()=>COPY[locale()];
  const currentUser=()=>window.GCA_FIREBASE_LIVE?.auth?.currentUser||null;
  const signedIn=()=>!!currentUser()&&!currentUser().isAnonymous;
  const storageKey=userId=>`nalviCommunityNotificationsSeen.v1.${userId}`;
  function readSeen(userId){try{return Math.max(0,Number(localStorage.getItem(storageKey(userId)))||0)}catch{return 0}}
  function saveSeen(){if(!state.userId)return;const latest=Math.max(Date.now(),...state.items.map(item=>Number(item.createdAt)||0));state.seenAt=latest;try{localStorage.setItem(storageKey(state.userId),String(latest))}catch{}}
  function itemCopy(item){const c=copy(),actor=escapeHtml(item.actorName||c.someone),action=escapeHtml(c[item.kind]||c.comment),body=item.kind==="comment"&&item.body?`<small>“${escapeHtml(item.body)}”</small>`:"",post=item.postBody?`<em>${escapeHtml(item.postBody)}</em>`:"";return `<span class="nalvi-notification-kind ${escapeHtml(item.kind)}" aria-hidden="true">${item.kind==="comment"?"💬":item.kind==="like"?"♥":"＋"}</span><span><strong>${actor} ${action}</strong>${body}${post}<time>${escapeHtml(item.date||"")}</time></span>`}
  function render(){
    const button=document.querySelector("#nalviNotificationButton"),badge=document.querySelector("#nalviNotificationBadge"),panel=document.querySelector("#nalviNotificationPanel"),list=document.querySelector("#nalviNotificationList"),title=document.querySelector("#nalviNotificationTitle"),close=document.querySelector("#nalviNotificationClose"),c=copy();if(!button||!badge||!panel||!list)return;
    const unread=state.items.filter(item=>(Number(item.createdAt)||0)>state.seenAt).length;
    button.setAttribute("aria-label",c.label);button.setAttribute("title",c.label);button.setAttribute("aria-expanded",String(state.open));badge.hidden=!unread;badge.textContent=unread>9?"9+":String(unread||"");title.textContent=c.title;close.setAttribute("aria-label",c.close);panel.hidden=!state.open;
    if(!signedIn())list.innerHTML=`<button class="nalvi-notification-empty sign-in" type="button" data-notification-sign-in>${escapeHtml(c.signIn)}</button>`;
    else if(!state.items.length)list.innerHTML=`<p class="nalvi-notification-empty">${escapeHtml(c.empty)}</p>`;
    else list.innerHTML=state.items.slice(0,30).map(item=>`<button class="nalvi-notification-item${(Number(item.createdAt)||0)>state.seenAt?" unread":""}" type="button" data-notification-id="${escapeHtml(item.id)}">${itemCopy(item)}<i>${escapeHtml(c.open)} →</i></button>`).join("");
  }
  function close(){state.open=false;render()}
  function toggle(){state.open=!state.open;if(state.open&&signedIn())saveSeen();render()}
  function connect(){
    state.unsubscribe?.();state.unsubscribe=null;const user=currentUser(),nextUserId=user&&!user.isAnonymous?String(user.uid||""):"";state.userId=nextUserId;state.seenAt=readSeen(nextUserId);state.items=[];render();
    if(!nextUserId)return;const service=window.NALVI_COMMUNITY_SERVICE;if(!service?.subscribeNotifications)return;
    state.unsubscribe=service.subscribeNotifications(items=>{state.items=Array.isArray(items)?items:[];render()},()=>{state.items=[];render()});
  }
  function install(){
    if(document.querySelector("#nalviNotificationButton"))return;
    const stats=document.querySelector("header .stats"),account=document.querySelector("#accountBtn");if(!stats)return;
    const shell=document.createElement("span");shell.className="nalvi-notification-shell";shell.innerHTML=`<button class="nalvi-notification-button" id="nalviNotificationButton" type="button" aria-haspopup="dialog" aria-controls="nalviNotificationPanel" aria-expanded="false">${BELL}<b id="nalviNotificationBadge" hidden></b></button>`;stats.insertBefore(shell,account||null);
    document.body.insertAdjacentHTML("beforeend",`<section class="nalvi-notification-panel" id="nalviNotificationPanel" role="dialog" aria-modal="false" aria-labelledby="nalviNotificationTitle" hidden><header><h2 id="nalviNotificationTitle"></h2><button id="nalviNotificationClose" type="button">×</button></header><div class="nalvi-notification-list" id="nalviNotificationList"></div></section>`);
    shell.querySelector("button")?.addEventListener("click",event=>{event.stopPropagation();toggle()});document.querySelector("#nalviNotificationClose")?.addEventListener("click",close);
    document.querySelector("#nalviNotificationPanel")?.addEventListener("click",event=>{event.stopPropagation();const signInButton=event.target.closest?.("[data-notification-sign-in]");if(signInButton){close();window.courseGoogleLogin?.();return}const itemButton=event.target.closest?.("[data-notification-id]");if(!itemButton)return;const item=state.items.find(candidate=>candidate.id===itemButton.dataset.notificationId);close();if(item?.postId)window.NALVI_INSTITUTIONAL_EXPERIENCE?.openPost?.(item.postId);else window.NALVI_INSTITUTIONAL_EXPERIENCE?.open?.()});
    document.addEventListener("click",event=>{if(state.open&&!event.target.closest?.("#nalviNotificationPanel,#nalviNotificationButton"))close()});document.addEventListener("keydown",event=>{if(event.key==="Escape"&&state.open)close()});
    document.addEventListener("change",event=>{if(event.target.matches?.("#headerLang,#lang"))render()},true);window.addEventListener("nalvi:auth-known",connect);connect();render();document.documentElement.dataset.nalviNotifications=VERSION;
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
})();
