import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const testEnv = await initializeTestEnvironment({
  projectId: "demo-nalvi-paso-6",
  firestore: { rules: readFileSync(join(here, "firestore-PASO-6.rules"), "utf8") }
});
const results = [];

async function check(name, action) {
  try {
    await action();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error: String(error?.message || error) });
  }
}

try {
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, "staff", "admin@example.com"), { email: "admin@example.com", role: "admin", active: true });
    await setDoc(doc(db, "institutionMembers", "instA__teacherA"), { institutionId: "instA", uid: "teacherA", email: "teachera@example.com", role: "teacher", active: true });
    await setDoc(doc(db, "institutionMembers", "instB__teacherB"), { institutionId: "instB", uid: "teacherB", email: "teacherb@example.com", role: "teacher", active: true });
    await setDoc(doc(db, "users", "studentA"), { uid: "studentA", email: "studenta@example.com", displayName: "Estudiante A", role: "student", primaryInstitutionId: "instA", institutionIds: ["instA"], teacherEmails: ["teachera@example.com"] });
    await setDoc(doc(db, "users", "studentB"), { uid: "studentB", email: "studentb@example.com", displayName: "Estudiante B", role: "student", primaryInstitutionId: "instB", institutionIds: ["instB"], teacherEmails: ["teacherb@example.com"] });
    await setDoc(doc(db, "users", "studentA", "learningEvents", "event-1"), { userId: "studentA", conceptId: "GG-C-001", masteryAfter: 35 });
    await setDoc(doc(db, "users", "studentA", "mastery", "GG-C-001"), { userId: "studentA", conceptId: "GG-C-001", masteryScore: 35, status: "LEARNING" });
    await setDoc(doc(db, "users", "studentA", "baselines", "guarani-general"), { userId: "studentA", routeId: "guarani-general" });
    await setDoc(doc(db, "users", "studentA", "reviewSchedule", "GG-C-001"), { userId: "studentA", conceptId: "GG-C-001" });
  });

  const studentA = testEnv.authenticatedContext("studentA", { email: "studenta@example.com" }).firestore();
  const studentB = testEnv.authenticatedContext("studentB", { email: "studentb@example.com" }).firestore();
  const teacherA = testEnv.authenticatedContext("teacherA", { email: "teachera@example.com" }).firestore();
  const teacherB = testEnv.authenticatedContext("teacherB", { email: "teacherb@example.com" }).firestore();
  const admin = testEnv.authenticatedContext("admin", { email: "admin@example.com" }).firestore();

  await check("Estudiante puede leer su propia memoria pedagógica", async () => {
    await assertSucceeds(getDoc(doc(studentA, "users", "studentA", "mastery", "GG-C-001")));
    await assertSucceeds(getDoc(doc(studentA, "users", "studentA", "learningEvents", "event-1")));
  });

  await check("Estudiante no puede leer la memoria de otro estudiante", async () => {
    await assertFails(getDoc(doc(studentB, "users", "studentA", "mastery", "GG-C-001")));
  });

  await check("Docente autorizado puede leer y docente ajeno no", async () => {
    await assertSucceeds(getDoc(doc(teacherA, "users", "studentA", "mastery", "GG-C-001")));
    await assertFails(getDoc(doc(teacherB, "users", "studentA", "mastery", "GG-C-001")));
  });

  await check("Cliente no puede fabricar eventos, mastery, baseline ni repaso", async () => {
    await assertFails(setDoc(doc(studentA, "users", "studentA", "learningEvents", "fake"), { masteryAfter: 100 }));
    await assertFails(setDoc(doc(studentA, "users", "studentA", "mastery", "GG-C-001"), { masteryScore: 100 }));
    await assertFails(setDoc(doc(studentA, "users", "studentA", "baselines", "fake"), { score: 100 }));
    await assertFails(setDoc(doc(studentA, "users", "studentA", "reviewSchedule", "GG-C-001"), { nextReviewAt: null }));
    await assertFails(setDoc(doc(admin, "users", "studentA", "mastery", "GG-C-001"), { masteryScore: 100 }));
  });

  await check("Estudiante no puede elevar su rol pero conserva progreso heredado", async () => {
    await assertFails(setDoc(doc(studentA, "users", "studentA"), { uid: "studentA", email: "studenta@example.com", role: "teacher", primaryInstitutionId: "instA" }, { merge: true }));
    await assertSucceeds(setDoc(doc(studentA, "users", "studentA"), { uid: "studentA", email: "studenta@example.com", role: "student", xp: 25, lives: 5 }, { merge: true }));
  });

  await check("Docente con membresía confiable puede conservar su rol de perfil", async () => {
    await assertSucceeds(setDoc(doc(teacherA, "users", "teacherA"), { uid: "teacherA", email: "teachera@example.com", role: "teacher", primaryInstitutionId: "instA", displayName: "Docente A" }));
  });

  await check("Cliente no puede aprobar conocimiento ni emitir certificados", async () => {
    await assertFails(setDoc(doc(studentA, "linguisticKnowledge", "fake"), { expertVerified: true, allowedForGeneration: true }));
    await assertFails(setDoc(doc(studentA, "certificates", "fake"), { studentId: "studentA", status: "approved" }));
  });
} finally {
  await testEnv.cleanup();
}

for (const result of results) console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}${result.error ? `: ${result.error}` : ""}`);
if (results.some(result => !result.ok)) process.exitCode = 1;
