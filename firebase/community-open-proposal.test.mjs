import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here=dirname(fileURLToPath(import.meta.url));
const proposedRules=readFileSync(join(here,"proposals/REGLAS-FIRESTORE-COMUNIDAD-PARA-COPIAR.rules"),"utf8");
const testEnv=await initializeTestEnvironment({projectId:"demo-nalvi-community-open",firestore:{rules:proposedRules}});

const token=(name,email)=>({name,email,firebase:{sign_in_provider:"google.com"}});
const postData=(authorId,authorName,body="Mba’éichapa reime?")=>({authorId,authorName,body,category:"community",pinned:false,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});

try{
  const guest=testEnv.unauthenticatedContext().firestore();
  const anonymous=testEnv.authenticatedContext("anonymous",{name:"Invitado",firebase:{sign_in_provider:"anonymous"}}).firestore();
  const alicia=testEnv.authenticatedContext("alicia",token("Alicia Duarte","alicia@example.com")).firestore();
  const marcelo=testEnv.authenticatedContext("marcelo",token("Marcelo Benítez","marcelo@example.com")).firestore();
  const post=doc(alicia,"communityPosts","welcome");

  await assertSucceeds(getDoc(doc(guest,"communityPosts","welcome")));
  await assertSucceeds(getDocs(collection(guest,"communityPosts")));
  await assertFails(setDoc(doc(guest,"communityPosts","guest-post"),postData("guest","Visitante")));
  await assertFails(setDoc(doc(anonymous,"communityPosts","anonymous-post"),postData("anonymous","Invitado")));

  await assertSucceeds(setDoc(post,postData("alicia","Alicia Duarte")));
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
