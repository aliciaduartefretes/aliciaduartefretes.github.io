/* NALVI Community service · Firestore adapter with protected social writes. */
(function(){
  "use strict";

  const VERSION="NALVI-COMMUNITY-SERVICE-4";
  const WRITES_ENABLED=window.GCA_FEATURES?.communityWrites===true||window.NALVI_FEATURES?.communityWrites===true;
  const CATEGORY_KEYS=Object.freeze(["community","announcements","questions","learning","resources"]);
  const initialPosts=[
    {id:"announcement",category:1,categoryKey:"announcements",initials:"NA",author:"Equipo NALVI",authorId:"nalvi",handle:"@nalvi",date:"Hoy",pinned:true,body:"¡Bienvenidos a Comunidad NALVI! Un lugar para preguntar, compartir y encontrarnos alrededor del guaraní.",links:["Comunidad"],likes:18,comments:4,views:126,followers:84,commentPreview:{author:"Ana P.",text:"Qué lindo contar con este punto de encuentro."}},
    {id:"question",category:2,categoryKey:"questions",initials:"MF",author:"María F.",authorId:"mariaf",handle:"@mariaf",date:"Hace 2 h",body:"¿Dónde puedo volver a practicar los verbos de la unidad?",links:["Verbos en presente"],likes:7,comments:3,views:54,followers:16,commentPreview:{author:"Ana P.",text:"Está dentro de Guaraní general, en la sección de verbos."}},
    {id:"resource",category:4,categoryKey:"resources",initials:"AP",author:"Ana P.",authorId:"anap",handle:"@anap",date:"Ayer",body:"Compartí una guía breve para preparar la próxima práctica. ¿Qué verbo quieren repasar primero?",links:["Recursos"],likes:12,comments:2,views:83,followers:31,commentPreview:{author:"Jorge L.",text:"Quiero repasar los verbos de movimiento."}}
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
  let remoteUnsubscribe=null;
  const viewedThisSession=new Set();

  function listPosts(){return clone(posts)}
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
    const base={userId:user.uid,displayName:safeName(user.displayName),photoURL:safePhoto(user.photoURL),updatedAt:firebase.serverTimestamp()};
    if(!base.displayName)throw new TypeError("COMMUNITY_DISPLAY_NAME_REQUIRED");
    if(snapshot.exists())await firebase.setDoc(reference,base,{merge:true});
    else await firebase.setDoc(reference,{...base,bio:"",createdAt:firebase.serverTimestamp()});
    return reference;
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
    return {displayName:safeName(data.displayName),photoURL:safePhoto(data.photoURL),bio:normalizeBio(data.bio),followers:countResult(countResultValue),following:followingResult.status==="fulfilled"&&followingResult.value?.exists?.()===true};
  }
  async function hydratePost(firebase,snapshot){
    const post=fromDocument(snapshot),postRef=snapshot.ref,user=firebase.auth?.currentUser;
    const commentsQuery=firebase.query(firebase.collection(postRef,"comments"),firebase.orderBy("createdAt","desc"),firebase.limit(3));
    const tasks=[
      firebase.getCountFromServer(firebase.collection(postRef,"reactions")),firebase.getCountFromServer(firebase.collection(postRef,"comments")),firebase.getCountFromServer(firebase.collection(postRef,"views")),firebase.getDocs(commentsQuery),
      user&&!user.isAnonymous?firebase.getDoc(firebase.doc(postRef,"reactions",user.uid)):Promise.resolve(null)
    ];
    const [likes,comments,views,commentList,reaction]=await Promise.allSettled(tasks);
    post.likes=countResult(likes);post.comments=countResult(comments);post.views=countResult(views);
    if(commentList.status==="fulfilled")post.commentItems=commentList.value.docs.map(item=>{const data=item.data()||{};return{id:item.id,author:safeName(data.authorName)||"Miembro NALVI",text:normalizeComment(data.body),parentCommentId:String(data.parentCommentId||"")}}).reverse();
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
          const profileEntries=await Promise.all([...new Set(next.map(item=>item.authorId).filter(Boolean))].map(async userId=>[userId,await hydrateProfile(firebase,userId)]));
          const profiles=new Map(profileEntries);
          posts=next.map(post=>{const profile=profiles.get(post.authorId);return profile?{...post,author:profile.displayName||post.author,initials:initials(profile.displayName||post.author),photoURL:profile.photoURL,bio:profile.bio,followers:profile.followers,following:profile.following}:post});
          onPosts(listPosts());
        }catch(error){onError?.(error)}
      },error=>onError?.(error));
    }).catch(error=>onError?.(error));
    return()=>{cancelled=true;remoteUnsubscribe?.();remoteUnsubscribe=null};
  }
  async function createRemotePost(body,category="community"){
    requireEnabled();const text=normalizeBody(body);if(!text)throw new TypeError("EMPTY_COMMUNITY_POST");
    const categoryKey=CATEGORY_KEYS.includes(category)&&category!=="announcements"?category:"community";
    const firebase=await firebaseReady(),user=currentUser(firebase),authorName=safeName(user.displayName);if(!authorName)throw new TypeError("COMMUNITY_DISPLAY_NAME_REQUIRED");
    await ensureOwnProfile(firebase);
    const reference=await firebase.addDoc(firebase.collection(firebase.db,"communityPosts"),{authorId:user.uid,authorName,body:text,category:categoryKey,pinned:false,createdAt:firebase.serverTimestamp(),updatedAt:firebase.serverTimestamp()});
    return reference.id;
  }
  async function deleteRemotePost(postId){requireEnabled();const firebase=await firebaseReady();currentUser(firebase);await firebase.deleteDoc(firebase.doc(firebase.db,"communityPosts",String(postId)));return true}
  async function toggleReaction(postId){
    requireEnabled();const firebase=await firebaseReady(),user=currentUser(firebase),postRef=firebase.doc(firebase.db,"communityPosts",String(postId)),reactionRef=firebase.doc(postRef,"reactions",user.uid),snapshot=await firebase.getDoc(reactionRef);
    if(snapshot.exists()){await firebase.deleteDoc(reactionRef);return false}
    await firebase.setDoc(reactionRef,{type:"like",createdAt:firebase.serverTimestamp()});return true;
  }
  async function createComment(postId,body,parentCommentId=""){
    requireEnabled();const text=normalizeComment(body);if(!text)throw new TypeError("EMPTY_COMMUNITY_COMMENT");
    const firebase=await firebaseReady(),user=currentUser(firebase),authorName=safeName(user.displayName);if(!authorName)throw new TypeError("COMMUNITY_DISPLAY_NAME_REQUIRED");
    await ensureOwnProfile(firebase);
    const postRef=firebase.doc(firebase.db,"communityPosts",String(postId));
    const reference=await firebase.addDoc(firebase.collection(postRef,"comments"),{authorId:user.uid,authorName,body:text,parentCommentId:String(parentCommentId||"").slice(0,120),createdAt:firebase.serverTimestamp(),updatedAt:firebase.serverTimestamp()});
    return reference.id;
  }
  async function toggleFollow(userId){
    requireEnabled();const firebase=await firebaseReady(),user=currentUser(firebase),targetId=String(userId||"");if(!targetId||targetId===user.uid)throw new TypeError("COMMUNITY_INVALID_FOLLOW");
    await ensureOwnProfile(firebase);
    const target=firebase.doc(firebase.db,"communityProfiles",targetId),targetSnapshot=await firebase.getDoc(target);if(!targetSnapshot.exists())throw new TypeError("COMMUNITY_PROFILE_NOT_FOUND");
    const reference=firebase.doc(target,"followers",user.uid),snapshot=await firebase.getDoc(reference);
    if(snapshot.exists()){await firebase.deleteDoc(reference);return false}
    await firebase.setDoc(reference,{createdAt:firebase.serverTimestamp()});return true;
  }
  async function saveOwnProfile(bio){
    requireEnabled();const firebase=await firebaseReady(),user=currentUser(firebase),reference=await ensureOwnProfile(firebase);
    await firebase.setDoc(reference,{userId:user.uid,displayName:safeName(user.displayName),photoURL:safePhoto(user.photoURL),bio:normalizeBio(bio),updatedAt:firebase.serverTimestamp()},{merge:true});return true;
  }
  async function recordView(postId){
    if(!WRITES_ENABLED||viewedThisSession.has(postId))return false;
    const firebase=await firebaseReady(),user=firebase.auth?.currentUser;if(!user||user.isAnonymous)return false;
    viewedThisSession.add(postId);
    const postRef=firebase.doc(firebase.db,"communityPosts",String(postId)),viewRef=firebase.doc(postRef,"views",user.uid),snapshot=await firebase.getDoc(viewRef);
    if(snapshot.exists())return false;
    await firebase.setDoc(viewRef,{createdAt:firebase.serverTimestamp()});return true;
  }

  window.NALVI_COMMUNITY_SERVICE=Object.freeze({VERSION,WRITES_ENABLED,CATEGORY_KEYS,listPosts,previewPost,subscribePosts,createRemotePost,deleteRemotePost,toggleReaction,createComment,toggleFollow,saveOwnProfile,recordView,resetDemo});
})();
