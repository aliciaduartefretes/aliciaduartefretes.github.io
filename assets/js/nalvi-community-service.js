/* NALVI Community service · Firestore adapter with protected social writes. */
(function(){
  "use strict";

  const VERSION="NALVI-COMMUNITY-SERVICE-7";
  const WRITES_ENABLED=window.GCA_FEATURES?.communityWrites===true||window.NALVI_FEATURES?.communityWrites===true;
  const CATEGORY_KEYS=Object.freeze(["community","announcements","questions","learning","resources"]);
  const POST_COOLDOWN_MS=15000;
  const COMMENT_COOLDOWN_MS=5000;
  const initialPosts=[
    {id:"announcement",category:1,categoryKey:"announcements",initials:"NA",author:"Equipo NALVI",authorId:"nalvi",handle:"@nalvi",date:"Hoy",pinned:true,body:"¡Bienvenidos a Comunidad NALVI! Un lugar para preguntar, compartir y encontrarnos alrededor del guaraní.",links:["Comunidad"],likes:18,comments:4,views:126,followers:84,commentPreview:{author:"Ana P.",text:"Qué lindo contar con este punto de encuentro."}},
    {id:"question",category:2,categoryKey:"questions",initials:"MF",author:"María F.",authorId:"mariaf",handle:"@mariaf",date:"Hace 2 h",body:"¿Dónde puedo volver a practicar los verbos de la unidad?",links:["Verbos en presente"],likes:7,comments:3,views:54,followers:16,commentPreview:{author:"Ana P.",text:"Está dentro de Guaraní general, en la sección de verbos."}},
    {id:"resource",category:4,categoryKey:"resources",initials:"AP",author:"Ana P.",authorId:"anap",handle:"@anap",date:"Ayer",body:"Compartí una guía breve para preparar la próxima práctica. ¿Qué verbo quieren repasar primero?",resourceTitle:"Guía de práctica",links:["Pytyvõrã"],likes:12,comments:2,views:83,followers:31,commentPreview:{author:"Jorge L.",text:"Quiero repasar los verbos de movimiento."}}
  ];
  const clone=value=>JSON.parse(JSON.stringify(value));
  const normalizeBody=value=>String(value??"").trim().replace(/\s{3,}/g,"  ").slice(0,700);
  const normalizeComment=value=>String(value??"").trim().replace(/\s{3,}/g,"  ").slice(0,500);
  const normalizeBio=value=>String(value??"").trim().replace(/\s{3,}/g,"  ").slice(0,160);
  const normalizeTitle=value=>String(value??"").trim().replace(/\s{2,}/g," ").slice(0,100);
  const safeName=value=>String(value??"").trim().slice(0,80);
  const safePhoto=value=>{const text=String(value??"").trim();return /^https:\/\//.test(text)&&text.length<=500?text:""};
  const safeExternalUrl=value=>{const text=String(value??"").trim();return /^https:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:[/?#][^\s]*)?$/.test(text)&&text.length<=500?text:""};
  const safeMediaPath=(value,userId,scope)=>{const text=String(value??"").trim(),owner=String(userId??"").trim();return owner&&text.startsWith(`communityMedia/${owner}/${scope}/`)&&/^[A-Za-z0-9/_-]{1,240}$/.test(text)?text:""};
  const initials=value=>safeName(value).split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join("").toUpperCase()||"N";
  const categoryNumber=value=>Math.max(0,CATEGORY_KEYS.indexOf(value));
  const countResult=result=>result.status==="fulfilled"?Number(result.value.data().count)||0:0;
  let posts=initialPosts.map(post=>clone(post));
  let profilesById=new Map();
  let remoteUnsubscribe=null;
  let lastPostAt=0;
  let lastCommentAt=0;
  const viewedThisSession=new Set();

  function listPosts(){return clone(posts)}
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
  async function mediaUrl(firebase,path){
    if(!path||!firebase?.storage||typeof firebase.storageRef!=="function"||typeof firebase.getDownloadURL!=="function")return "";
    try{return safePhoto(await firebase.getDownloadURL(firebase.storageRef(firebase.storage,path)))}catch{return ""}
  }
  function fromDocument(snapshot){
    const data=snapshot.data()||{},author=safeName(data.authorName)||"Miembro NALVI";
    return {
      id:snapshot.id,remote:true,category:categoryNumber(data.category),categoryKey:CATEGORY_KEYS.includes(data.category)?data.category:"community",
      initials:initials(author),author,authorId:String(data.authorId||""),
      handle:`@${author.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"").slice(0,28)||"nalvi"}`,
      date:dateLabel(data.createdAt),pinned:data.pinned===true,body:normalizeBody(data.body),links:[],likes:0,comments:0,views:0,followers:0,following:false,likedByCurrent:false,photoURL:"",avatarURL:"",coverURL:"",bio:"",commentItems:[],
      mediaPath:safeMediaPath(data.mediaPath,data.authorId,"posts"),mediaType:data.mediaType==="image"?"image":"",mediaURL:"",resourceTitle:normalizeTitle(data.resourceTitle),resourceUrl:safeExternalUrl(data.resourceUrl)
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
    const data=profileResult.status==="fulfilled"&&profileResult.value.exists()?profileResult.value.data()||{}:{},avatarPath=safeMediaPath(data.avatarPath,userId,"profile"),coverPath=safeMediaPath(data.coverPath,userId,"profile");
    const [avatarResult,coverResult]=await Promise.allSettled([mediaUrl(firebase,avatarPath),mediaUrl(firebase,coverPath)]);
    return {userId,displayName:safeName(data.displayName),photoURL:safePhoto(data.photoURL),avatarPath,coverPath,avatarURL:avatarResult.status==="fulfilled"?avatarResult.value:"",coverURL:coverResult.status==="fulfilled"?coverResult.value:"",bio:normalizeBio(data.bio),followers:countResult(countResultValue),following:followingResult.status==="fulfilled"&&followingResult.value?.exists?.()===true};
  }
  async function hydratePost(firebase,snapshot){
    const post=fromDocument(snapshot),postRef=snapshot.ref,user=firebase.auth?.currentUser;
    const commentsQuery=firebase.query(firebase.collection(postRef,"comments"),firebase.orderBy("createdAt","desc"),firebase.limit(3));
    const tasks=[
      firebase.getCountFromServer(firebase.collection(postRef,"reactions")),firebase.getCountFromServer(firebase.collection(postRef,"comments")),firebase.getCountFromServer(firebase.collection(postRef,"views")),firebase.getDocs(commentsQuery),
      user&&!user.isAnonymous?firebase.getDoc(firebase.doc(postRef,"reactions",user.uid)):Promise.resolve(null),
      mediaUrl(firebase,post.mediaPath)
    ];
    const [likes,comments,views,commentList,reaction,media]=await Promise.allSettled(tasks);
    post.likes=countResult(likes);post.comments=countResult(comments);post.views=countResult(views);
    if(commentList.status==="fulfilled")post.commentItems=commentList.value.docs.map(item=>{const data=item.data()||{};return{id:item.id,author:safeName(data.authorName)||"Miembro NALVI",text:normalizeComment(data.body),parentCommentId:String(data.parentCommentId||"")}}).reverse();
    post.commentPreview=post.commentItems.at(-1)||null;
    post.likedByCurrent=reaction.status==="fulfilled"&&reaction.value?.exists?.()===true;
    post.mediaURL=media.status==="fulfilled"?media.value:"";
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
          profilesById=new Map(profileEntries);
          posts=next.map(post=>{const profile=profilesById.get(post.authorId);return profile?{...post,author:profile.displayName||post.author,initials:initials(profile.displayName||post.author),photoURL:profile.photoURL,avatarURL:profile.avatarURL,coverURL:profile.coverURL,bio:profile.bio,followers:profile.followers,following:profile.following}:post});
          onPosts(listPosts());
        }catch(error){onError?.(error)}
      },error=>onError?.(error));
    }).catch(error=>onError?.(error));
    return()=>{cancelled=true;remoteUnsubscribe?.();remoteUnsubscribe=null};
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
  function validImage(blob){return !!blob&&typeof blob.size==="number"&&blob.size>0&&blob.size<=5*1024*1024&&["image/jpeg","image/png","image/webp"].includes(blob.type)}
  async function uploadImage(firebase,user,blob,kind){
    if(!validImage(blob))throw new TypeError("COMMUNITY_INVALID_IMAGE");
    if(!firebase?.storage||typeof firebase.storageRef!=="function"||typeof firebase.uploadBytes!=="function")throw new Error("COMMUNITY_STORAGE_UNAVAILABLE");
    const path=kind==="avatar"||kind==="cover"?`communityMedia/${user.uid}/profile/${kind}`:`communityMedia/${user.uid}/posts/${window.crypto?.randomUUID?.().replace(/-/g,"")||`${Date.now()}${Math.random().toString(36).slice(2)}`}`;
    const reference=firebase.storageRef(firebase.storage,path);await firebase.uploadBytes(reference,blob,{contentType:blob.type,customMetadata:{ownerUid:user.uid,kind}});return{path,url:await mediaUrl(firebase,path)};
  }
  async function removeUploaded(firebase,path){try{if(path&&firebase?.deleteObject)await firebase.deleteObject(firebase.storageRef(firebase.storage,path))}catch{}}
  async function createRemotePost(body,category="community",extras={}){
    requireEnabled();const text=normalizeBody(body);if(!text)throw new TypeError("EMPTY_COMMUNITY_POST");
    const categoryKey=CATEGORY_KEYS.includes(category)&&category!=="announcements"?category:"community";
    const firebase=await firebaseReady(),user=currentUser(firebase),authorName=safeName(user.displayName);if(!authorName)throw new TypeError("COMMUNITY_DISPLAY_NAME_REQUIRED");
    const now=Date.now();if(now-lastPostAt<POST_COOLDOWN_MS)throw new Error("COMMUNITY_POST_COOLDOWN");
    if(posts.some(post=>post.authorId===user.uid&&normalizeBody(post.body).toLocaleLowerCase()===text.toLocaleLowerCase()))throw new Error("COMMUNITY_DUPLICATE_POST");
    await ensureOwnProfile(firebase);let uploaded=null;
    try{
      if(extras.imageBlob)uploaded=await uploadImage(firebase,user,extras.imageBlob,"post");
      const payload={authorId:user.uid,authorName,body:text,category:categoryKey,pinned:false,createdAt:firebase.serverTimestamp(),updatedAt:firebase.serverTimestamp()},resourceTitle=categoryKey==="resources"?normalizeTitle(extras.resourceTitle):"",resourceUrl=categoryKey==="resources"?safeExternalUrl(extras.resourceUrl):"";
      if(extras.resourceUrl&&!resourceUrl)throw new TypeError("COMMUNITY_INVALID_RESOURCE_URL");
      if(resourceTitle)payload.resourceTitle=resourceTitle;if(resourceUrl)payload.resourceUrl=resourceUrl;if(uploaded){payload.mediaPath=uploaded.path;payload.mediaType="image"}
      const reference=await firebase.addDoc(firebase.collection(firebase.db,"communityPosts"),payload);lastPostAt=Date.now();return reference.id;
    }catch(error){await removeUploaded(firebase,uploaded?.path);throw error}
  }
  async function deleteRemotePost(postId){requireEnabled();const firebase=await firebaseReady(),user=currentUser(firebase),id=String(postId),post=posts.find(item=>item.id===id&&item.authorId===user.uid);await firebase.deleteDoc(firebase.doc(firebase.db,"communityPosts",id));await removeUploaded(firebase,post?.mediaPath);return true}
  async function toggleReaction(postId){
    requireEnabled();const firebase=await firebaseReady(),user=currentUser(firebase),postRef=firebase.doc(firebase.db,"communityPosts",String(postId)),reactionRef=firebase.doc(postRef,"reactions",user.uid),snapshot=await firebase.getDoc(reactionRef);
    if(snapshot.exists()){await firebase.deleteDoc(reactionRef);return false}
    await firebase.setDoc(reactionRef,{type:"like",createdAt:firebase.serverTimestamp()});return true;
  }
  async function createComment(postId,body,parentCommentId=""){
    requireEnabled();const text=normalizeComment(body);if(!text)throw new TypeError("EMPTY_COMMUNITY_COMMENT");
    const firebase=await firebaseReady(),user=currentUser(firebase),authorName=safeName(user.displayName);if(!authorName)throw new TypeError("COMMUNITY_DISPLAY_NAME_REQUIRED");
    if(Date.now()-lastCommentAt<COMMENT_COOLDOWN_MS)throw new Error("COMMUNITY_COMMENT_COOLDOWN");
    await ensureOwnProfile(firebase);
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
    if(snapshot.exists()){await firebase.deleteDoc(reference);return false}
    await firebase.setDoc(reference,{createdAt:firebase.serverTimestamp()});return true;
  }
  async function saveOwnProfile(bio,images={}){
    requireEnabled();const firebase=await firebaseReady(),user=currentUser(firebase),reference=await ensureOwnProfile(firebase),payload={userId:user.uid,displayName:safeName(user.displayName),photoURL:safePhoto(user.photoURL),bio:normalizeBio(bio),updatedAt:firebase.serverTimestamp()},result={};
    if(images.avatarBlob){const uploaded=await uploadImage(firebase,user,images.avatarBlob,"avatar");payload.avatarPath=uploaded.path;result.avatarURL=uploaded.url;result.avatarPath=uploaded.path}
    if(images.coverBlob){const uploaded=await uploadImage(firebase,user,images.coverBlob,"cover");payload.coverPath=uploaded.path;result.coverURL=uploaded.url;result.coverPath=uploaded.path}
    await firebase.setDoc(reference,payload,{merge:true});profilesById.set(user.uid,{...(profilesById.get(user.uid)||{}),...payload,...result});return Object.keys(result).length?result:true;
  }
  async function recordView(postId){
    if(!WRITES_ENABLED||viewedThisSession.has(postId))return false;
    const firebase=await firebaseReady(),user=firebase.auth?.currentUser;if(!user||user.isAnonymous)return false;
    viewedThisSession.add(postId);
    const postRef=firebase.doc(firebase.db,"communityPosts",String(postId)),viewRef=firebase.doc(postRef,"views",user.uid),snapshot=await firebase.getDoc(viewRef);
    if(snapshot.exists())return false;
    await firebase.setDoc(viewRef,{createdAt:firebase.serverTimestamp()});return true;
  }

  window.NALVI_COMMUNITY_SERVICE=Object.freeze({VERSION,WRITES_ENABLED,CATEGORY_KEYS,listPosts,getProfile,previewPost,subscribePosts,subscribeNotifications,createRemotePost,deleteRemotePost,toggleReaction,createComment,toggleFollow,saveOwnProfile,recordView,resetDemo});
})();
