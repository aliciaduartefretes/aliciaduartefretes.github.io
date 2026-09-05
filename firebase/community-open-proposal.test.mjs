import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import assert from "node:assert/strict";
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here=dirname(fileURLToPath(import.meta.url));
const proposedRules=readFileSync(join(here,"proposals/REGLAS-FIRESTORE-COMUNIDAD-PARA-COPIAR.rules"),"utf8");
const activeRules=readFileSync(join(here,"firestore-PASO-6.rules"),"utf8");
const communitySnippet=readFileSync(join(here,"proposals/community-open-authenticated.rules.snippet"),"utf8").trim().split("\n").map(line=>line?`    ${line}`:line).join("\n");
const marker="    // Cualquier colección no declarada queda denegada.";
assert.equal(proposedRules,activeRules.replace(marker,`${communitySnippet}\n\n${marker}`),"La propuesta debe conservar cada byte de las reglas actuales fuera del bloque Comunidad");
const testEnv=await initializeTestEnvironment({projectId:"demo-nalvi-community-open",firestore:{rules:proposedRules}});

const token=(name,email,picture="")=>({name,email,picture,firebase:{sign_in_provider:"google.com"}});
const postData=(authorId,authorName,body="Mba’éichapa reime?")=>({authorId,authorName,body,category:"community",pinned:false,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
const profileData=(userId,displayName,photoURL="")=>({userId,displayName,photoURL,bio:"",createdAt:serverTimestamp(),updatedAt:serverTimestamp()});

try{
  const guest=testEnv.unauthenticatedContext().firestore();
  const anonymous=testEnv.authenticatedContext("anonymous",{name:"Invitado",firebase:{sign_in_provider:"anonymous"}}).firestore();
  const alicia=testEnv.authenticatedContext("alicia",token("Alicia Duarte","alicia@example.com","https://example.com/alicia.jpg")).firestore();
  const marcelo=testEnv.authenticatedContext("marcelo",token("Marcelo Benítez","marcelo@example.com")).firestore();
  const sofia=testEnv.authenticatedContext("sofia",token("Sofía Vera","sofia@example.com")).firestore();
  const platform=testEnv.authenticatedContext("platform",token("Administración","admin@example.com")).firestore();
  const post=doc(alicia,"communityPosts","welcome");

  await testEnv.withSecurityRulesDisabled(async context=>{
    const database=context.firestore();
    await setDoc(doc(database,"staff","admin@example.com"),{role:"admin",active:true});
    await setDoc(doc(database,"users","rene"),{uid:"rene",displayName:"René Murillo",email:"rene@example.com",xp:900});
    await setDoc(doc(database,"users","rene-wrong-name"),{uid:"rene-wrong-name",displayName:"René Murillo",email:"private@example.com"});
    await setDoc(doc(database,"users","rene-private"),{uid:"rene-private",displayName:"René Murillo",email:"private@example.com"});
  });

  await assertSucceeds(getDoc(doc(guest,"communityPosts","welcome")));
  await assertSucceeds(getDocs(collection(guest,"communityPosts")));
  await assertFails(setDoc(doc(guest,"communityPosts","guest-post"),postData("guest","Visitante")));
  await assertFails(setDoc(doc(anonymous,"communityPosts","anonymous-post"),postData("anonymous","Invitado")));

  const aliciaProfile=doc(alicia,"communityProfiles","alicia");
  const marceloProfile=doc(marcelo,"communityProfiles","marcelo");
  await assertSucceeds(getDoc(doc(guest,"communityProfiles","alicia")));
  await assertFails(setDoc(doc(anonymous,"communityProfiles","anonymous"),profileData("anonymous","Invitado")));
  await assertSucceeds(setDoc(aliciaProfile,profileData("alicia","Alicia Duarte","https://example.com/alicia.jpg")));
  await assertSucceeds(setDoc(marceloProfile,profileData("marcelo","Marcelo Benítez")));
  await assertFails(setDoc(doc(alicia,"communityProfiles","spoofed"),profileData("spoofed","Alicia Duarte","https://example.com/alicia.jpg")));
  await assertFails(setDoc(doc(alicia,"communityProfiles","wrong-photo"),profileData("alicia","Alicia Duarte","https://example.com/other.jpg")));
  await assertSucceeds(setDoc(doc(platform,"communityProfiles","rene"),profileData("rene","René Murillo")));
  await assertFails(setDoc(doc(platform,"communityProfiles","rene-wrong-name"),profileData("rene-wrong-name","Otro nombre")));
  await assertFails(setDoc(doc(platform,"communityProfiles","rene-private"),{...profileData("rene-private","René Murillo"),email:"rene@example.com"}));
  await assertFails(setDoc(doc(marcelo,"communityProfiles","rene-other"),profileData("rene-other","René Murillo")));
  await assertSucceeds(updateDoc(aliciaProfile,{bio:"Docente de guaraní",updatedAt:serverTimestamp()}));
  await assertSucceeds(updateDoc(aliciaProfile,{displayName:"Alicia Ñe’ẽ",updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(aliciaProfile,{email:"otra@example.com",updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(doc(marcelo,"communityProfiles","alicia"),{bio:"Perfil ajeno",updatedAt:serverTimestamp()}));

  const follow=doc(marcelo,"communityProfiles","alicia","followers","marcelo");
  await assertSucceeds(setDoc(follow,{createdAt:serverTimestamp()}));
  await assertSucceeds(getDocs(collection(guest,"communityProfiles","alicia","followers")));
  await assertFails(setDoc(doc(alicia,"communityProfiles","alicia","followers","alicia"),{createdAt:serverTimestamp()}));
  await assertFails(setDoc(doc(marcelo,"communityProfiles","alicia","followers","alicia"),{createdAt:serverTimestamp()}));
  await assertSucceeds(deleteDoc(follow));

  const conversation=doc(alicia,"communityConversations","dm__alicia__marcelo");
  const firstMessage=doc(alicia,"communityConversations","dm__alicia__marcelo","messages","message-1");
  const firstBatch=writeBatch(alicia);
  firstBatch.set(conversation,{participantIds:["alicia","marcelo"],lastMessage:"Mba’éichapa reime?",lastSenderId:"alicia",createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  firstBatch.set(firstMessage,{authorId:"alicia",body:"Mba’éichapa reime?",createdAt:serverTimestamp()});
  await assertSucceeds(firstBatch.commit());
  await assertSucceeds(getDoc(doc(marcelo,"communityConversations","dm__alicia__marcelo")));
  await assertSucceeds(getDocs(query(collection(alicia,"communityConversations"),where("participantIds","array-contains","alicia"))));
  await assertFails(getDoc(doc(sofia,"communityConversations","dm__alicia__marcelo")));
  await assertSucceeds(getDocs(collection(marcelo,"communityConversations","dm__alicia__marcelo","messages")));
  await assertFails(getDocs(collection(sofia,"communityConversations","dm__alicia__marcelo","messages")));
  await assertFails(setDoc(doc(sofia,"communityConversations","dm__alicia__marcelo","messages","spoofed"),{authorId:"sofia",body:"Mensaje ajeno",createdAt:serverTimestamp()}));
  await assertFails(setDoc(doc(alicia,"communityConversations","leaky"),{participantIds:["alicia","marcelo"],participantEmails:["alicia@example.com"],lastMessage:"Dato privado",lastSenderId:"alicia",createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
  const responseBatch=writeBatch(marcelo),response=doc(marcelo,"communityConversations","dm__alicia__marcelo","messages","message-2");
  responseBatch.update(doc(marcelo,"communityConversations","dm__alicia__marcelo"),{lastMessage:"Aime porã, ¿ha nde?",lastSenderId:"marcelo",updatedAt:serverTimestamp()});
  responseBatch.set(response,{authorId:"marcelo",body:"Aime porã, ¿ha nde?",createdAt:serverTimestamp()});
  await assertSucceeds(responseBatch.commit());
  await assertFails(updateDoc(doc(sofia,"communityConversations","dm__alicia__marcelo"),{lastMessage:"Interferencia",lastSenderId:"sofia",updatedAt:serverTimestamp()}));

  await assertSucceeds(setDoc(post,postData("alicia","Alicia Ñe’ẽ")));
  await assertFails(setDoc(doc(alicia,"communityPosts","resource"),{...postData("alicia","Alicia Ñe’ẽ","Material para practicar"),category:"resources"}));
  await assertFails(setDoc(doc(alicia,"communityPosts","media"),{...postData("alicia","Alicia Ñe’ẽ"),mediaPath:"communityMedia/alicia/posts/123456789abc",mediaType:"image"}));
  await assertFails(setDoc(doc(alicia,"communityPosts","external"),{...postData("alicia","Alicia Ñe’ẽ"),resourceUrl:"https://example.com"}));
  await assertSucceeds(getDoc(doc(marcelo,"communityPosts","welcome")));
  await assertFails(setDoc(doc(marcelo,"communityPosts","spoofed"),postData("marcelo","Otra persona")));
  await assertFails(setDoc(doc(marcelo,"communityPosts","announcement"),{...postData("marcelo","Marcelo Benítez"),category:"announcements"}));
  await assertFails(updateDoc(doc(marcelo,"communityPosts","welcome"),{body:"Cambio de otra persona",updatedAt:serverTimestamp()}));
  await assertFails(deleteDoc(doc(marcelo,"communityPosts","welcome")));
  await assertSucceeds(updateDoc(post,{body:"Conversación actualizada",category:"questions",updatedAt:serverTimestamp()}));

  const reply=doc(marcelo,"communityPosts","welcome","comments","reply-1");
  await assertSucceeds(setDoc(reply,{authorId:"marcelo",authorName:"Marcelo Benítez",body:"Aime porã, ¿ha nde?",parentCommentId:"",createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
  await assertSucceeds(getDocs(collection(guest,"communityPosts","welcome","comments")));
  await assertFails(setDoc(doc(alicia,"communityPosts","welcome","comments","spoofed"),{authorId:"alicia",authorName:"Marcelo Benítez",body:"Nombre falso",parentCommentId:"",createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));

  const reaction=doc(marcelo,"communityPosts","welcome","reactions","marcelo");
  await assertSucceeds(setDoc(reaction,{type:"like",createdAt:serverTimestamp()}));
  await assertSucceeds(getDocs(collection(guest,"communityPosts","welcome","reactions")));
  await assertFails(setDoc(doc(marcelo,"communityPosts","welcome","reactions","alicia"),{type:"like",createdAt:serverTimestamp()}));
  await assertFails(updateDoc(reaction,{createdAt:serverTimestamp()}));
  await assertSucceeds(deleteDoc(reaction));

  const view=doc(alicia,"communityPosts","welcome","views","alicia");
  await assertSucceeds(setDoc(view,{createdAt:serverTimestamp()}));
  await assertSucceeds(getDocs(collection(guest,"communityPosts","welcome","views")));
  await assertFails(updateDoc(view,{createdAt:serverTimestamp()}));
  await assertFails(setDoc(doc(marcelo,"communityPosts","welcome","views","alicia"),{createdAt:serverTimestamp()}));

  await assertSucceeds(deleteDoc(post));

  const selfInstitution=doc(alicia,"institutions","self__alicia");
  await assertSucceeds(setDoc(selfInstitution,{name:"Aula de Alicia",country:"",active:true,status:"active",ownerUid:"alicia",selfService:true,createdBy:"alicia",createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(anonymous,"institutions","self__anonymous"),{name:"Aula anónima",country:"",active:true,status:"active",ownerUid:"anonymous",selfService:true,createdBy:"anonymous",createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(alicia,"institutions","self__otra"),{name:"Aula ajena",country:"",active:true,status:"active",ownerUid:"alicia",selfService:true,createdBy:"alicia",createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
  const selfMembership=doc(alicia,"institutionMembers","self__alicia__alicia");
  await assertSucceeds(setDoc(selfMembership,{institutionId:"self__alicia",uid:"alicia",claimedUid:"alicia",email:"alicia@example.com",name:"Alicia Duarte",role:"institution_manager",active:true,selfService:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(marcelo,"institutionMembers","self__alicia__marcelo"),{institutionId:"self__alicia",uid:"marcelo",claimedUid:"marcelo",email:"marcelo@example.com",name:"Marcelo",role:"institution_manager",active:true,selfService:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
  const classRef=doc(alicia,"groups","class-1");
  await assertSucceeds(setDoc(classRef,{name:"Guaraní inicial",courseId:"general",institutionId:"self__alicia",teacherId:"alicia",teacherEmail:"alicia@example.com",teacherName:"Alicia Duarte",studentEmails:[],code:"GCA-ABC123",status:"active",archived:false,createdBy:"alicia",createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
  await assertSucceeds(setDoc(doc(alicia,"courseAccess","code__GCA-ABC123"),{type:"group_invite",code:"GCA-ABC123",groupId:"class-1",groupName:"Guaraní inicial",courseId:"general",institutionId:"self__alicia",teacherId:"alicia",teacherEmail:"alicia@example.com",active:true,createdAt:serverTimestamp()}));
  await assertSucceeds(getDoc(doc(marcelo,"courseAccess","code__GCA-ABC123")));
  await assertSucceeds(setDoc(doc(marcelo,"enrollments","class-1__marcelo@example.com"),{groupId:"class-1",groupName:"Guaraní inicial",courseId:"general",institutionId:"self__alicia",studentId:"marcelo",studentEmail:"marcelo@example.com",teacherId:"alicia",teacherEmail:"alicia@example.com",inviteCode:"GCA-ABC123",active:true,joinedByCode:true,updatedAt:serverTimestamp()}));
  const teacherAddedEnrollment=doc(alicia,"enrollments","class-1__sofia@example.com");
  await assertSucceeds(setDoc(classRef,{studentEmails:["marcelo@example.com","sofia@example.com"],updatedAt:serverTimestamp()},{merge:true}));
  await assertSucceeds(setDoc(teacherAddedEnrollment,{groupId:"class-1",groupName:"Guaraní inicial",courseId:"general",institutionId:"self__alicia",studentEmail:"sofia@example.com",teacherId:"alicia",teacherEmail:"alicia@example.com",active:true,addedBy:"alicia",updatedAt:serverTimestamp()}));
  await assertSucceeds(setDoc(classRef,{studentEmails:["marcelo@example.com"],updatedAt:serverTimestamp()},{merge:true}));
  await assertSucceeds(setDoc(teacherAddedEnrollment,{active:false,removedBy:"alicia",updatedAt:serverTimestamp()},{merge:true}));
  await assertSucceeds(getDocs(query(collection(marcelo,"enrollments"),where("studentEmail","==","marcelo@example.com"))));
  await assertFails(getDocs(query(collection(sofia,"enrollments"),where("studentEmail","==","marcelo@example.com"))));
  await assertSucceeds(getDoc(doc(marcelo,"groups","class-1")));
  await assertFails(getDoc(doc(sofia,"groups","class-1")));
  await assertFails(getDoc(doc(sofia,"enrollments","class-1__marcelo@example.com")));
  const progress=doc(marcelo,"progress","marcelo__general");
  await assertSucceeds(setDoc(progress,{type:"course",courseId:"general",studentId:"marcelo",studentEmail:"marcelo@example.com",institutionId:"self__alicia",groupId:"class-1",percent:25,attempts:3,accuracy:80,updatedAt:serverTimestamp()}));
  await assertSucceeds(getDoc(doc(alicia,"progress","marcelo__general")));
  await assertFails(getDoc(doc(sofia,"progress","marcelo__general")));
  const wheel=doc(alicia,"academicActivities","wheel-1");
  await assertSucceeds(setDoc(wheel,{institutionId:"self__alicia",ownerUid:"alicia",activityType:"wheel",title:"Ruleta de verbos",content:"Aha\nReho\nOho",createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(marcelo,"academicActivities","foreign"),{institutionId:"self__alicia",ownerUid:"marcelo",activityType:"wheel",title:"Ruleta ajena",content:"A\nB",createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
  console.log("PASS comunidad pública, participación autenticada y métricas únicas protegidas");
}finally{
  await testEnv.cleanup();
}
