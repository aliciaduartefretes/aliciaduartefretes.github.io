import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import assert from "node:assert/strict";
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
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
  const post=doc(alicia,"communityPosts","welcome");

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
  await assertSucceeds(updateDoc(aliciaProfile,{bio:"Docente de guaraní",updatedAt:serverTimestamp()}));
  await assertSucceeds(updateDoc(aliciaProfile,{avatarPath:"communityMedia/alicia/profile/avatar",coverPath:"communityMedia/alicia/profile/cover",updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(aliciaProfile,{avatarPath:"communityMedia/marcelo/profile/avatar",updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(doc(marcelo,"communityProfiles","alicia"),{bio:"Perfil ajeno",updatedAt:serverTimestamp()}));

  const follow=doc(marcelo,"communityProfiles","alicia","followers","marcelo");
  await assertSucceeds(setDoc(follow,{createdAt:serverTimestamp()}));
  await assertSucceeds(getDocs(collection(guest,"communityProfiles","alicia","followers")));
  await assertFails(setDoc(doc(alicia,"communityProfiles","alicia","followers","alicia"),{createdAt:serverTimestamp()}));
  await assertFails(setDoc(doc(marcelo,"communityProfiles","alicia","followers","alicia"),{createdAt:serverTimestamp()}));
  await assertSucceeds(deleteDoc(follow));

  await assertSucceeds(setDoc(post,postData("alicia","Alicia Duarte")));
  await assertSucceeds(setDoc(doc(alicia,"communityPosts","resource"),{...postData("alicia","Alicia Duarte","Material para practicar"),category:"resources",mediaPath:"communityMedia/alicia/posts/123456789abc",mediaType:"image",resourceTitle:"Guía",resourceUrl:"https://example.com/guia"}));
  await assertFails(setDoc(doc(alicia,"communityPosts","wrong-media"),{...postData("alicia","Alicia Duarte"),mediaPath:"communityMedia/marcelo/posts/123456789abc",mediaType:"image"}));
  await assertFails(setDoc(doc(alicia,"communityPosts","unsafe-link"),{...postData("alicia","Alicia Duarte"),category:"resources",resourceUrl:"javascript:alert(1)"}));
  await assertFails(setDoc(doc(alicia,"communityPosts","misplaced-link"),{...postData("alicia","Alicia Duarte"),resourceTitle:"No corresponde",resourceUrl:"https://example.com"}));
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
  console.log("PASS comunidad pública, participación autenticada y métricas únicas protegidas");
}finally{
  await testEnv.cleanup();
}
