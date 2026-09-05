/* NALVI Community service · Firestore adapter with protected social writes. */
(function(){
  "use strict";

  const VERSION="NALVI-COMMUNITY-SERVICE-12";
  const WRITES_ENABLED=window.GCA_FEATURES?.communityWrites===true||window.NALVI_FEATURES?.communityWrites===true;
  const CATEGORY_KEYS=Object.freeze(["community","announcements","questions","learning"]);
  const POST_COOLDOWN_MS=15000;
  const COMMENT_COOLDOWN_MS=5000;
  const initialPosts=[
    {id:"announcement",category:1,categoryKey:"announcements",initials:"NA",author:"Equipo NALVI",authorId:"nalvi",handle:"@nalvi",date:"Hoy",pinned:true,body:"¡Bienvenidos a Comunidad NALVI! Un lugar para preguntar, compartir y encontrarnos alrededor del guaraní.",links:["Comunidad"],likes:18,comments:4,views:126,followers:84,commentPreview:{author:"Ana P.",text:"Qué lindo contar con este punto de encuentro."}},
    {id:"question",category:2,categoryKey:"questions",initials:"MF",author:"María F.",authorId:"mariaf",handle:"@mariaf",date:"Hace 2 h",body:"¿Dónde puedo volver a practicar los verbos de la unidad?",links:["Verbos en presente"],likes:7,comments:3,views:54,followers:16,commentPreview:{author:"Ana P.",text:"Está dentro de Guaraní general, en la sección de verbos."}}
  ];
  const clone=value=>JSON.parse(JSON.stringify(value));
  const normalizeBody=value=>String(value??"").trim().replace(/\s{3,}/g,"  ").slice(0,700);
  const normalizeComment=value=>String(value??"").trim().replace(/\s{3,}/g,"  ").slice(0,500);
  const normalizeBio=value=>String(value??"").trim().replace(/\s{3,}/g,"  ").slice(0,160);
  const safeName=value=>String(value??"").trim().slice(0,80);
  const safePhoto=value=>{const text=String(value??"").trim();return /^https:\/\//.test(text)&&text.length<=500?text:""};
  const initials=value=>safeName(value).split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join("").toUpperCase()||"N";
  const categoryNumber=value=>Math.max(0,CATEGORY_KEYS.indexOf(value));
  const countResult=result=>result.status==="fulfilled"?Number(result.value.data().count)||0:0;
  let posts=initialPosts.map(post=>clone(post));
  let profilesById=new Map();
  let remoteUnsubscribe=null;
  let profileUnsubscribe=null;
  let conversationUnsubscribe=null;
  let messageUnsubscribe=null;
  let directorySeedAttempted=false;
  let lastPostAt=0;
  let lastCommentAt=0;
  const viewedThisSession=new Set();
  const followStateCheckedIds=new Set();

  function listPosts(){return clone(posts)}
  function listProfiles(){return clone([...profilesById.values()])}
  function getProfile(userId){const value=profilesById.get(String(userId||""));return value?clone(value):null}
  function previewPost(body){
    const text=normalizeBody(body);
    if(!text)throw new TypeError("EMPTY_COMMUNITY_POST");
    const post={id:`draft-${Date.now()}`,category:0,categoryKey:"community",initials:"YO",author:"Tú",authorId:"local",date:"Ahora",body:text,links:[],likes:0,comments:0,views:0,followers:0};
    posts=[post,...posts];
    return clone(post);
  }
  function resetDemo(){posts=initialPosts.map(post=>clone(post));return listPosts()}
  function requireEnabled(){if(!WRITES_ENABLED){const error=new Error("COMMUNITY_WRITES_DISABLED");error.code=error.message;throw error}}
  function currentUser(firebase){
    const user=firebase?.auth?.currentUser;
    if(!user||user.isAnonymous){const error=new Error("COMMUNITY_SIGN_IN_REQUIRED");error.code=error.message;throw error}
    return user;
  }
  function firebaseReady(){
    if(window.GCA_FIREBASE_LIVE)return Promise.resolve(window.GCA_FIREBASE_LIVE);
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("COMMUNITY_FIREBASE_TIMEOUT")),12000);
      window.addEventListener("gca:firebase-live-ready",()=>{clearTimeout(timer);resolve(window.GCA_FIREBASE_LIVE)},{once:true});
    });
  }
  function dateLabel(value){
    try{
      const date=value?.toDate?.()||new Date(value);
      if(!date||Number.isNaN(date.getTime()))return "Ahora";
      return new Intl.DateTimeFormat(document.documentElement.lang||"es",{dateStyle:"medium"}).format(date);
    }catch{return "Ahora"}
  }
  function notificationTime(value){
    try{const milliseconds=Number(value?.toMillis?.()||new Date(value).getTime());return Number.isFinite(milliseconds)?milliseconds:0}catch{return 0}
  }
  function fromDocument(snapshot){
    const data=snapshot.data()||{},author=safeName(data.authorName)||"Miembro NALVI";
    return {
      id:snapshot.id,remote:true,category:categoryNumber(data.category),categoryKey:CATEGORY_KEYS.includes(data.category)?data.category:"community",
      initials:initials(author),author,authorId:String(data.authorId||""),
      handle:`@${author.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"").slice(0,28)||"nalvi"}`,
      date:dateLabel(data.createdAt),pinned:data.pinned===true,body:normalizeBody(data.body),links:[],likes:0,comments:0,views:0,followers:0,following:false,likedByCurrent:false,photoURL:"",bio:"",commentItems:[]
    };
  }
  async function ensureOwnProfile(firebase){
    const user=currentUser(firebase),reference=firebase.doc(firebase.db,"communityProfiles",user.uid),snapshot=await firebase.getDoc(reference);
    const current=snapshot.exists()?snapshot.data()||{}:{},displayName=safeName(current.displayName)||safeName(user.displayName),base={userId:user.uid,photoURL:safePhoto(user.photoURL),updatedAt:firebase.serverTimestamp()};
    if(!displayName)throw new TypeError("COMMUNITY_DISPLAY_NAME_REQUIRED");
    if(snapshot.exists())await firebase.setDoc(reference,base,{merge:true});
    else await firebase.setDoc(reference,{...base,displayName,bio:"",createdAt:firebase.serverTimestamp()});
    profilesById.set(user.uid,{...(profilesById.get(user.uid)||{}),...current,...base,displayName,userId:user.uid});
    return{reference,displayName};
  }
  async function hydrateProfile(firebase,userId){
    if(!userId)return null;
    const reference=firebase.doc(firebase.db,"communityProfiles",userId),user=firebase.auth?.currentUser;
    const tasks=[
      firebase.getDoc(reference),
      firebase.getCountFromServer(firebase.collection(reference,"followers")),
      user&&!user.isAnonymous&&user.uid!==userId?firebase.getDoc(firebase.doc(reference,"followers",user.uid)):Promise.resolve(null)
    ];
    const [profileResult,countResultValue,followingResult]=await Promise.allSettled(tasks);
    const data=profileResult.status==="fulfilled"&&profileResult.value.exists()?profileResult.value.data()||{}:{};
    return {userId,displayName:safeName(data.displayName),photoURL:safePhoto(data.photoURL),bio:normalizeBio(data.bio),followers:countResult(countResultValue),following:followingResult.status==="fulfilled"&&followingResult.value?.exists?.()===true};
  }
  async function hydratePost(firebase,snapshot){
    const post=fromDocument(snapshot),postRef=snapshot.ref,user=firebase.auth?.currentUser;
    const commentsQuery=firebase.query(firebase.collection(postRef,"comments"),firebase.orderBy("createdAt","desc"),firebase.limit(12));
    const tasks=[
      firebase.getCountFromServer(firebase.collection(postRef,"reactions")),firebase.getCountFromServer(firebase.collection(postRef,"comments")),firebase.getCountFromServer(firebase.collection(postRef,"views")),firebase.getDocs(commentsQuery),
      user&&!user.isAnonymous?firebase.getDoc(firebase.doc(postRef,"reactions",user.uid)):Promise.resolve(null)
    ];
    const [likes,comments,views,commentList,reaction]=await Promise.allSettled(tasks);
    post.likes=countResult(likes);post.comments=countResult(comments);post.views=countResult(views);
    if(commentList.status==="fulfilled")post.commentItems=commentList.value.docs.map(item=>{const data=item.data()||{};return{id:item.id,authorId:String(data.authorId||""),author:safeName(data.authorName)||"Miembro NALVI",text:normalizeComment(data.body),parentCommentId:String(data.parentCommentId||"")}}).reverse();
    post.commentPreview=post.commentItems.at(-1)||null;
    post.likedByCurrent=reaction.status==="fulfilled"&&reaction.value?.exists?.()===true;
    return post;
  }
  function subscribePosts(onPosts,onError){
    if(typeof onPosts!=="function")throw new TypeError("COMMUNITY_SUBSCRIBER_REQUIRED");
    remoteUnsubscribe?.();remoteUnsubscribe=null;
    if(!WRITES_ENABLED){onPosts(listPosts());return()=>{}}
    let cancelled=false;
    firebaseReady().then(async firebase=>{
      if(cancelled)return;
      const user=firebase.auth?.currentUser;
      if(user&&!user.isAnonymous)await ensureOwnProfile(firebase);
      const feed=firebase.query(firebase.collection(firebase.db,"communityPosts"),firebase.orderBy("createdAt","desc"),firebase.limit(40));
      remoteUnsubscribe=firebase.onSnapshot(feed,async snapshot=>{
        try{
          const next=await Promise.all(snapshot.docs.map(item=>hydratePost(firebase,item)));
          const profileIds=new Set(next.map(item=>item.authorId).filter(Boolean));if(user&&!user.isAnonymous)profileIds.add(user.uid);
          const profileEntries=await Promise.all([...profileIds].map(async userId=>[userId,await hydrateProfile(firebase,userId)]));
          profileEntries.forEach(([userId,profile])=>{if(profile)profilesById.set(userId,profile)});
          posts=next.map(post=>{const profile=profilesById.get(post.authorId);return profile?{...post,author:profile.displayName||post.author,initials:initials(profile.displayName||post.author),photoURL:profile.photoURL,bio:profile.bio,followers:profile.followers,following:profile.following}:post});
          onPosts(listPosts());
        }catch(error){onError?.(error)}
      },error=>onError?.(error));
    }).catch(error=>onError?.(error));
    return()=>{cancelled=true;remoteUnsubscribe?.();remoteUnsubscribe=null};
  }
  function subscribeProfiles(onProfiles,onError){
    if(typeof onProfiles!=="function")throw new TypeError("COMMUNITY_PROFILE_SUBSCRIBER_REQUIRED");
    profileUnsubscribe?.();profileUnsubscribe=null;
    if(!WRITES_ENABLED){onProfiles(listProfiles());return()=>{}}
    let cancelled=false;
    firebaseReady().then(firebase=>{
      if(cancelled)return;
      const directory=firebase.collection(firebase.db,"communityProfiles");
      profileUnsubscribe=firebase.onSnapshot(directory,snapshot=>{
        const next=snapshot.docs.map(item=>{const data=item.data()||{},previous=profilesById.get(item.id)||{};return{...previous,userId:item.id,displayName:safeName(data.displayName)||"Miembro NALVI",photoURL:safePhoto(data.photoURL),bio:normalizeBio(data.bio)}});
        next.forEach(profile=>profilesById.set(profile.userId,profile));onProfiles(listProfiles());
        seedRegisteredProfiles(firebase,new Set(snapshot.docs.map(item=>item.id))).catch(error=>console.warn("NALVI_COMMUNITY_DIRECTORY_SYNC",error));
      },error=>onError?.(error));
    }).catch(error=>onError?.(error));
    return()=>{cancelled=true;profileUnsubscribe?.();profileUnsubscribe=null};
  }
  async function hydrateFollowStates(userIds){
    if(!WRITES_ENABLED)return[];
    const firebase=await firebaseReady(),user=currentUser(firebase),targets=[...new Set((Array.isArray(userIds)?userIds:[]).map(value=>String(value||"")).filter(userId=>userId&&userId!==user.uid))].slice(0,12),unknown=targets.filter(userId=>!followStateCheckedIds.has(userId));
    const settled=await Promise.allSettled(unknown.map(async userId=>{
      const reference=firebase.doc(firebase.db,"communityProfiles",userId,"followers",user.uid),snapshot=await firebase.getDoc(reference),following=snapshot.exists()===true,previous=profilesById.get(userId)||{userId};
      profilesById.set(userId,{...previous,following});followStateCheckedIds.add(userId);return{userId,following};
    }));
    settled.forEach(result=>{if(result.status==="rejected")console.warn("NALVI_COMMUNITY_FOLLOW_STATE",result.reason)});
    return targets.map(userId=>({userId,following:profilesById.get(userId)?.following===true}));
  }
  async function seedRegisteredProfiles(firebase,existingProfileIds){
    const user=firebase.auth?.currentUser;if(directorySeedAttempted||!user||user.isAnonymous||window.GESA_CONTEXT?.role!=="platform_admin")return 0;
    directorySeedAttempted=true;
    try{
      const snapshot=await firebase.getDocs(firebase.collection(firebase.db,"users")),missing=snapshot.docs.map(item=>({userId:item.id,data:item.data()||{}})).filter(item=>!existingProfileIds.has(item.userId)&&safeName(item.data.displayName).length>=2);
      let written=0;
      for(let offset=0;offset<missing.length;offset+=400){
        const batch=firebase.writeBatch(firebase.db),chunk=missing.slice(offset,offset+400);
        chunk.forEach(item=>batch.set(firebase.doc(firebase.db,"communityProfiles",item.userId),{userId:item.userId,displayName:safeName(item.data.displayName),photoURL:"",bio:"",createdAt:firebase.serverTimestamp(),updatedAt:firebase.serverTimestamp()}));
        await batch.commit();written+=chunk.length;
      }
      return written;
    }catch(error){directorySeedAttempted=false;throw error}
  }
  function conversationIdFor(firstUserId,secondUserId){
    const ids=[String(firstUserId||""),String(secondUserId||"")].filter(Boolean).sort();
    if(ids.length!==2||ids[0]===ids[1])return"";
    return`dm__${ids[0]}__${ids[1]}`;
  }
  function conversationTime(value){
    try{return Number(value?.toMillis?.()||new Date(value).getTime())||0}catch{return 0}
  }
  function subscribeConversations(onConversations,onError){
    if(typeof onConversations!=="function")throw new TypeError("COMMUNITY_CONVERSATION_SUBSCRIBER_REQUIRED");
    conversationUnsubscribe?.();conversationUnsubscribe=null;
    if(!WRITES_ENABLED){onConversations([]);return()=>{}}
    let cancelled=false;
    firebaseReady().then(firebase=>{
      if(cancelled)return;const user=firebase.auth?.currentUser;if(!user||user.isAnonymous){onConversations([]);return}
      const inbox=firebase.query(firebase.collection(firebase.db,"communityConversations"),firebase.where("participantIds","array-contains",user.uid),firebase.limit(40));
      conversationUnsubscribe=firebase.onSnapshot(inbox,snapshot=>{
        const next=snapshot.docs.map(item=>{const data=item.data()||{},participantIds=Array.isArray(data.participantIds)?data.participantIds.map(String):[],readAtBy=data.readAtBy&&typeof data.readAtBy==="object"?Object.fromEntries(participantIds.map(userId=>[userId,conversationTime(data.readAtBy[userId])]).filter(([,value])=>value>0)):{};return{id:item.id,participantIds,otherUserId:participantIds.find(id=>id!==user.uid)||"",lastMessage:normalizeComment(data.lastMessage),lastSenderId:String(data.lastSenderId||""),updatedAt:conversationTime(data.updatedAt),readAtBy}}).filter(item=>item.otherUserId).sort((a,b)=>b.updatedAt-a.updatedAt);
        onConversations(clone(next));
      },error=>onError?.(error));
    }).catch(error=>onError?.(error));
    return()=>{cancelled=true;conversationUnsubscribe?.();conversationUnsubscribe=null};
  }
  function subscribeMessages(conversationId,onMessages,onError){
    if(typeof onMessages!=="function")throw new TypeError("COMMUNITY_MESSAGE_SUBSCRIBER_REQUIRED");
    messageUnsubscribe?.();messageUnsubscribe=null;
    if(!WRITES_ENABLED||!conversationId){onMessages([]);return()=>{}}
    let cancelled=false;
    firebaseReady().then(firebase=>{
      if(cancelled)return;currentUser(firebase);
      const reference=firebase.doc(firebase.db,"communityConversations",String(conversationId)),messages=firebase.query(firebase.collection(reference,"messages"),firebase.orderBy("createdAt","desc"),firebase.limit(80));
      messageUnsubscribe=firebase.onSnapshot(messages,snapshot=>{
        const next=snapshot.docs.map(item=>{const data=item.data()||{};return{id:item.id,authorId:String(data.authorId||""),body:normalizeComment(data.body),createdAt:conversationTime(data.createdAt),date:dateLabel(data.createdAt)}}).reverse();
        onMessages(clone(next));
      },error=>onError?.(error));
    }).catch(error=>onError?.(error));
    return()=>{cancelled=true;messageUnsubscribe?.();messageUnsubscribe=null};
  }
  async function sendDirectMessage(recipientId,body){
    requireEnabled();const text=normalizeComment(body);if(!text)throw new TypeError("EMPTY_COMMUNITY_MESSAGE");
    const firebase=await firebaseReady(),user=currentUser(firebase),targetId=String(recipientId||""),conversationId=conversationIdFor(user.uid,targetId);
    if(!conversationId)throw new TypeError("COMMUNITY_INVALID_RECIPIENT");
    await ensureOwnProfile(firebase);
    const targetProfile=await firebase.getDoc(firebase.doc(firebase.db,"communityProfiles",targetId));if(!targetProfile.exists())throw new TypeError("COMMUNITY_PROFILE_NOT_FOUND");
    const conversationRef=firebase.doc(firebase.db,"communityConversations",conversationId),messageRef=firebase.doc(firebase.collection(conversationRef,"messages")),batch=firebase.writeBatch(firebase.db),timestamp=firebase.serverTimestamp(),summary={participantIds:[user.uid,targetId].sort(),lastMessage:text,lastSenderId:user.uid,updatedAt:timestamp};
    batch.set(conversationRef,summary,{merge:true});
    batch.set(messageRef,{authorId:user.uid,body:text,createdAt:timestamp});
    await batch.commit();return conversationId;
  }
  async function markConversationRead(conversationId){
    requireEnabled();const firebase=await firebaseReady(),user=currentUser(firebase),id=String(conversationId||"");if(!id)throw new TypeError("COMMUNITY_INVALID_CONVERSATION");
    await firebase.updateDoc(firebase.doc(firebase.db,"communityConversations",id),{[`readAtBy.${user.uid}`]:firebase.serverTimestamp()});return true;
  }
  function subscribeNotifications(onNotifications,onError){
    if(typeof onNotifications!=="function")throw new TypeError("COMMUNITY_NOTIFICATION_SUBSCRIBER_REQUIRED");
    if(!WRITES_ENABLED){onNotifications([]);return()=>{}}
    let cancelled=false,generation=0,rootUnsubscribers=[],childUnsubscribers=[],buckets=new Map();
    const emit=()=>{if(cancelled)return;const next=[...buckets.values()].flat().filter(item=>item.createdAt>0).sort((a,b)=>b.createdAt-a.createdAt).slice(0,60);onNotifications(clone(next))};
    const stopChildren=()=>{childUnsubscribers.forEach(unsubscribe=>unsubscribe?.());childUnsubscribers=[];for(const key of [...buckets.keys()])if(key.startsWith("post:"))buckets.delete(key)};
    const listen=(firebase,key,queryReference,project,currentGeneration)=>{
      const unsubscribe=firebase.onSnapshot(queryReference,snapshot=>{
        if(cancelled||currentGeneration!==generation)return;
        buckets.set(key,snapshot.docs.map(item=>project(item)).filter(Boolean));emit();
      },error=>onError?.(error));
      childUnsubscribers.push(unsubscribe);
    };
    firebaseReady().then(firebase=>{
      if(cancelled)return;const user=firebase.auth?.currentUser;if(!user||user.isAnonymous){onNotifications([]);return}
      const profileRef=firebase.doc(firebase.db,"communityProfiles",user.uid),followersQuery=firebase.query(firebase.collection(profileRef,"followers"),firebase.orderBy("createdAt","desc"),firebase.limit(20));
      rootUnsubscribers.push(firebase.onSnapshot(followersQuery,snapshot=>{
        buckets.set("followers",snapshot.docs.filter(item=>item.id!==user.uid).map(item=>{const data=item.data()||{},profile=profilesById.get(item.id);return{id:`follow:${item.id}`,kind:"follow",actorId:item.id,actorName:safeName(profile?.displayName),postId:"",postBody:"",body:"",date:dateLabel(data.createdAt),createdAt:notificationTime(data.createdAt)}}));emit();
      },error=>onError?.(error)));
      const ownPosts=firebase.query(firebase.collection(firebase.db,"communityPosts"),firebase.where("authorId","==",user.uid),firebase.limit(12));
      rootUnsubscribers.push(firebase.onSnapshot(ownPosts,snapshot=>{
        generation+=1;const currentGeneration=generation;stopChildren();
        snapshot.docs.forEach(postSnapshot=>{
          const postData=postSnapshot.data()||{},postBody=normalizeBody(postData.body).slice(0,90),postRef=postSnapshot.ref;
          const commentsQuery=firebase.query(firebase.collection(postRef,"comments"),firebase.orderBy("createdAt","desc"),firebase.limit(20));
          const reactionsQuery=firebase.query(firebase.collection(postRef,"reactions"),firebase.orderBy("createdAt","desc"),firebase.limit(20));
          listen(firebase,`post:${postSnapshot.id}:comments`,commentsQuery,item=>{const data=item.data()||{};if(data.authorId===user.uid)return null;return{id:`comment:${postSnapshot.id}:${item.id}`,kind:"comment",actorId:String(data.authorId||""),actorName:safeName(data.authorName),postId:postSnapshot.id,postBody,body:normalizeComment(data.body).slice(0,140),date:dateLabel(data.createdAt),createdAt:notificationTime(data.createdAt)}},currentGeneration);
          listen(firebase,`post:${postSnapshot.id}:reactions`,reactionsQuery,item=>{if(item.id===user.uid)return null;const data=item.data()||{},profile=profilesById.get(item.id);return{id:`like:${postSnapshot.id}:${item.id}`,kind:"like",actorId:item.id,actorName:safeName(profile?.displayName),postId:postSnapshot.id,postBody,body:"",date:dateLabel(data.createdAt),createdAt:notificationTime(data.createdAt)}},currentGeneration);
        });
        emit();
      },error=>onError?.(error)));
    }).catch(error=>onError?.(error));
    return()=>{cancelled=true;generation+=1;stopChildren();rootUnsubscribers.forEach(unsubscribe=>unsubscribe?.());rootUnsubscribers=[]};
  }
  async function createRemotePost(body,category="community"){
    requireEnabled();const text=normalizeBody(body);if(!text)throw new TypeError("EMPTY_COMMUNITY_POST");
    const categoryKey=CATEGORY_KEYS.includes(category)&&category!=="announcements"?category:"community";
    const firebase=await firebaseReady(),user=currentUser(firebase);
    const now=Date.now();if(now-lastPostAt<POST_COOLDOWN_MS)throw new Error("COMMUNITY_POST_COOLDOWN");
    if(posts.some(post=>post.authorId===user.uid&&normalizeBody(post.body).toLocaleLowerCase()===text.toLocaleLowerCase()))throw new Error("COMMUNITY_DUPLICATE_POST");
    const {displayName:authorName}=await ensureOwnProfile(firebase);
    const payload={authorId:user.uid,authorName,body:text,category:categoryKey,pinned:false,createdAt:firebase.serverTimestamp(),updatedAt:firebase.serverTimestamp()};
    const reference=await firebase.addDoc(firebase.collection(firebase.db,"communityPosts"),payload);lastPostAt=Date.now();return reference.id;
  }
  async function deleteRemotePost(postId){requireEnabled();const firebase=await firebaseReady();currentUser(firebase);await firebase.deleteDoc(firebase.doc(firebase.db,"communityPosts",String(postId)));return true}
  async function toggleReaction(postId){
    requireEnabled();const firebase=await firebaseReady(),user=currentUser(firebase),postRef=firebase.doc(firebase.db,"communityPosts",String(postId)),reactionRef=firebase.doc(postRef,"reactions",user.uid),snapshot=await firebase.getDoc(reactionRef);
    if(snapshot.exists()){await firebase.deleteDoc(reactionRef);return false}
    await firebase.setDoc(reactionRef,{type:"like",createdAt:firebase.serverTimestamp()});return true;
  }
  async function createComment(postId,body,parentCommentId=""){
    requireEnabled();const text=normalizeComment(body);if(!text)throw new TypeError("EMPTY_COMMUNITY_COMMENT");
    const firebase=await firebaseReady(),user=currentUser(firebase);
    if(Date.now()-lastCommentAt<COMMENT_COOLDOWN_MS)throw new Error("COMMUNITY_COMMENT_COOLDOWN");
    const {displayName:authorName}=await ensureOwnProfile(firebase);
    const postRef=firebase.doc(firebase.db,"communityPosts",String(postId));
    const reference=await firebase.addDoc(firebase.collection(postRef,"comments"),{authorId:user.uid,authorName,body:text,parentCommentId:String(parentCommentId||"").slice(0,120),createdAt:firebase.serverTimestamp(),updatedAt:firebase.serverTimestamp()});
    lastCommentAt=Date.now();
    return reference.id;
  }
  async function toggleFollow(userId){
    requireEnabled();const firebase=await firebaseReady(),user=currentUser(firebase),targetId=String(userId||"");if(!targetId||targetId===user.uid)throw new TypeError("COMMUNITY_INVALID_FOLLOW");
    await ensureOwnProfile(firebase);
    const target=firebase.doc(firebase.db,"communityProfiles",targetId),targetSnapshot=await firebase.getDoc(target);if(!targetSnapshot.exists())throw new TypeError("COMMUNITY_PROFILE_NOT_FOUND");
    const reference=firebase.doc(target,"followers",user.uid),snapshot=await firebase.getDoc(reference);
    const active=!snapshot.exists();
    if(active)await firebase.setDoc(reference,{createdAt:firebase.serverTimestamp()});else await firebase.deleteDoc(reference);
    profilesById.set(targetId,{...(profilesById.get(targetId)||{userId:targetId}),following:active});followStateCheckedIds.add(targetId);return active;
  }
  async function saveOwnProfile(displayName,bio){
    requireEnabled();const firebase=await firebaseReady(),user=currentUser(firebase),name=safeName(displayName);if(name.length<2)throw new TypeError("COMMUNITY_DISPLAY_NAME_REQUIRED");
    const {reference}=await ensureOwnProfile(firebase),payload={displayName:name,bio:normalizeBio(bio),updatedAt:firebase.serverTimestamp()};
    await firebase.setDoc(reference,payload,{merge:true});profilesById.set(user.uid,{...(profilesById.get(user.uid)||{}),...payload,userId:user.uid});return true;
  }
  async function recordView(postId){
    if(!WRITES_ENABLED||viewedThisSession.has(postId))return false;
    const firebase=await firebaseReady(),user=firebase.auth?.currentUser;if(!user||user.isAnonymous)return false;
    viewedThisSession.add(postId);
    const postRef=firebase.doc(firebase.db,"communityPosts",String(postId)),viewRef=firebase.doc(postRef,"views",user.uid),snapshot=await firebase.getDoc(viewRef);
    if(snapshot.exists())return false;
    await firebase.setDoc(viewRef,{createdAt:firebase.serverTimestamp()});return true;
  }

  window.NALVI_COMMUNITY_SERVICE=Object.freeze({VERSION,WRITES_ENABLED,CATEGORY_KEYS,listPosts,listProfiles,getProfile,previewPost,subscribePosts,hydrateFollowStates,subscribeProfiles,subscribeConversations,subscribeMessages,conversationIdFor,sendDirectMessage,markConversationRead,subscribeNotifications,createRemotePost,deleteRemotePost,toggleReaction,createComment,toggleFollow,saveOwnProfile,recordView,resetDemo});
})();
