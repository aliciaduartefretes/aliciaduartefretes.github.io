import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const activeRules = readFileSync(join(here, "firestore-PASO-6.rules"), "utf8");
const proposal = readFileSync(join(here, "proposals/community-open-authenticated.rules.snippet"), "utf8");
const catchAll = "    // Cualquier colección no declarada queda denegada.";
const proposedRules = activeRules.replace(catchAll, `${proposal}\n\n${catchAll}`);

if (proposedRules === activeRules) throw new Error("No se pudo montar la propuesta antes del cierre fail-closed");

const testEnv = await initializeTestEnvironment({
  projectId: "demo-nalvi-community-open",
  firestore: { rules: proposedRules }
});

try {
  const guest = testEnv.unauthenticatedContext().firestore();
  const alicia = testEnv.authenticatedContext("alicia", { email: "alicia@example.com" }).firestore();
  const marcelo = testEnv.authenticatedContext("marcelo", { email: "marcelo@example.com" }).firestore();
  const post = doc(alicia, "communityPosts", "welcome");

  await assertFails(getDoc(doc(guest, "communityPosts", "welcome")));
  await assertSucceeds(setDoc(post, {
    authorId: "alicia",
    body: "Mba’éichapa reime?",
    category: "community",
    pinned: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }));
  await assertSucceeds(getDoc(doc(marcelo, "communityPosts", "welcome")));
  await assertFails(updateDoc(doc(marcelo, "communityPosts", "welcome"), {
    body: "Cambio de otra persona",
    updatedAt: serverTimestamp()
  }));
  await assertFails(deleteDoc(doc(marcelo, "communityPosts", "welcome")));
  await assertSucceeds(setDoc(doc(marcelo, "communityPosts", "welcome", "comments", "reply-1"), {
    authorId: "marcelo",
    body: "Aime porã, ¿ha nde?",
    parentCommentId: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }));
  await assertFails(setDoc(doc(marcelo, "communityPosts", "welcome", "reactions", "alicia"), {
    authorId: "alicia",
    type: "like",
    updatedAt: serverTimestamp()
  }));
  await assertSucceeds(setDoc(doc(marcelo, "communityPosts", "welcome", "reactions", "marcelo"), {
    authorId: "marcelo",
    type: "like",
    updatedAt: serverTimestamp()
  }));
  await assertSucceeds(deleteDoc(post));
  console.log("PASS comunidad abierta para cuentas autenticadas y escritura limitada al autor");
} finally {
  await testEnv.cleanup();
}
