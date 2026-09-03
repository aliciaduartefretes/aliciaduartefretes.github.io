import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  DECISIONS,
  STATUSES,
  applyLearningEvent,
  createBaseline,
  createMasteryProfile,
  deriveStatus,
  getAdaptiveDecision,
  normalizeRequiredSkills,
  selectRecommendedActivityType
} from "../mastery-engine.mjs";

const config = JSON.parse(await readFile(new URL("../mastery-config.json", import.meta.url), "utf8"));
const baseInput = {
  conceptId: "GG-C-001",
  learningObjectiveId: "GG-LO-001",
  activityId: "activity-1",
  activityType: "multiple-choice",
  skill: "vocabulary",
  difficulty: "foundation-1",
  correct: true,
  attemptNumber: 1,
  responseTime: 8000,
  hintUsed: false,
  timestamp: "2026-01-01T12:00:00.000Z"
};

const profileFor = (userId, requiredSkills = ["vocabulary", "writing", "application"]) => createMasteryProfile({
  userId,
  conceptId: baseInput.conceptId,
  learningObjectiveId: baseInput.learningObjectiveId,
  requiredSkills
}, config);

function run(profile, changes = {}) {
  return applyLearningEvent(profile, { ...baseInput, userId: profile.userId, ...changes }, config).profile;
}

test("la configuración central contiene las siete habilidades y todos los estados/decisiones", () => {
  assert.deepEqual(config.skills, ["listening", "reading", "writing", "speaking", "vocabulary", "grammar", "application"]);
  assert.deepEqual(STATUSES, ["NEW", "LEARNING", "PRACTICING", "MASTERED", "REVIEW_DUE", "WEAK"]);
  assert.deepEqual(DECISIONS, ["ADVANCE", "REVIEW", "REPEAT", "SIMPLIFY", "CHALLENGE", "REVIEW_LATER"]);
});

test("normaliza habilidades heredadas de PASO 5 sin mezclarlas en un único porcentaje", () => {
  assert.deepEqual(normalizeRequiredSkills(["comprehension", "construction", "interaction"], config), ["reading", "writing", "application"]);
});

test("cada intento produce un evento completo con mastery antes/después", () => {
  const initial = profileFor("student-a");
  const { profile, event } = applyLearningEvent(initial, { ...baseInput, userId: "student-a" }, config);
  for (const field of ["userId", "conceptId", "learningObjectiveId", "activityId", "activityType", "skill", "difficulty", "correct", "attemptNumber", "responseTime", "hintUsed", "timestamp", "evidenceWeight", "masteryBefore", "masteryAfter"]) {
    assert.ok(Object.hasOwn(event, field), `falta ${field}`);
  }
  assert.equal(event.masteryBefore, 0);
  assert.equal(event.masteryAfter, profile.masteryScore);
  assert.ok(profile.skills.vocabulary.score > 0);
  assert.equal(profile.skills.writing.score, 0);
});

test("el peso pedagógico es central y producción aporta más que reconocimiento", () => {
  const low = applyLearningEvent(profileFor("low"), { ...baseInput, userId: "low" }, config).event;
  const high = applyLearningEvent(profileFor("high"), { ...baseInput, userId: "high", activityType: "writing", skill: "writing" }, config).event;
  assert.ok(high.evidenceWeight > low.evidenceWeight);
});

test("intentos extra, pista y repetición inmediata reducen evidencia efectiva", () => {
  const clean = applyLearningEvent(profileFor("clean"), { ...baseInput, userId: "clean", activityType: "writing", skill: "writing" }, config).profile.skills.writing.score;
  let penalized = run(profileFor("penalized"), { activityType: "writing", skill: "writing", correct: false });
  penalized = run(penalized, { activityType: "writing", skill: "writing", attemptNumber: 3, hintUsed: true, timestamp: "2026-01-01T12:10:00.000Z" });
  assert.ok(penalized.skills.writing.score < clean);
  assert.equal(penalized.recurringErrors.hints, 1);
  assert.equal(penalized.recurringErrors.immediateRepeats, 1);
});

test("un alumno con reconocimiento fuerte pero producción débil no queda dominado", () => {
  let profile = profileFor("recognizer");
  for (let i = 0; i < 14; i += 1) {
    profile = run(profile, {
      activityId: `recognition-${i}`,
      activityType: i % 2 ? "matching" : "multiple-choice",
      skill: "vocabulary",
      timestamp: `2026-01-${String(i + 1).padStart(2, "0")}T12:00:00.000Z`
    });
  }
  assert.notEqual(profile.status, "MASTERED");
  const next = getAdaptiveDecision(profile, config, "2026-01-15T12:01:00.000Z");
  assert.equal(next.decision, "REVIEW");
  assert.equal(next.reason, "productionGap");
  assert.ok(["writing", "application"].includes(next.weakestSkill));
});

test("retención distingue práctica inmediata de recuerdo días después", () => {
  let profile = profileFor("retention", ["vocabulary"]);
  profile = run(profile);
  profile = run(profile, { activityId: "immediate", timestamp: "2026-01-01T12:20:00.000Z" });
  assert.equal(profile.retentionEvidence.delayedAttempts, 0);
  profile = run(profile, { activityId: "delayed", timestamp: "2026-01-08T12:20:00.000Z" });
  assert.equal(profile.retentionEvidence.delayedAttempts, 1);
  assert.equal(profile.retentionEvidence.delayedCorrect, 1);
  assert.ok(profile.retentionEvidence.score > 0);
});

test("dos estudiantes en la misma ruta generan perfiles y siguiente actividad diferentes", () => {
  let studentA = profileFor("student-a");
  let studentB = profileFor("student-b");
  for (let i = 0; i < 7; i += 1) {
    const timestamp = `2026-02-${String(i + 1).padStart(2, "0")}T12:00:00.000Z`;
    studentA = run(studentA, { activityId: `a-v-${i}`, skill: "vocabulary", activityType: "matching", timestamp });
    studentA = run(studentA, { activityId: `a-w-${i}`, skill: "writing", activityType: "writing", timestamp: timestamp.replace("12:00", "13:00") });
    studentA = run(studentA, { activityId: `a-app-${i}`, skill: "application", activityType: "scenario", timestamp: timestamp.replace("12:00", "14:00") });
    studentB = run(studentB, { activityId: `b-v-${i}`, skill: "vocabulary", activityType: "matching", timestamp });
    studentB = run(studentB, { activityId: `b-w-${i}`, skill: "writing", activityType: "writing", correct: false, timestamp: timestamp.replace("12:00", "13:00") });
  }
  assert.notEqual(studentA.masteryScore, studentB.masteryScore);
  assert.notDeepEqual(selectRecommendedActivityType(studentA, config), selectRecommendedActivityType(studentB, config));
  assert.notEqual(getAdaptiveDecision(studentA, config).decision, getAdaptiveDecision(studentB, config).decision);
});

test("errores consecutivos producen SIMPLIFY local sin OpenAI", () => {
  let profile = profileFor("struggling");
  profile = run(profile, { correct: false });
  profile = run(profile, { correct: false, activityId: "activity-2", timestamp: "2026-01-02T12:00:00.000Z" });
  assert.equal(getAdaptiveDecision(profile, config).decision, "SIMPLIFY");
});

test("la fecha de repaso convierte evidencia suficiente en REVIEW_DUE", () => {
  const profile = profileFor("due", ["vocabulary"]);
  profile.attempts = 5;
  profile.masteryScore = 70;
  profile.skills.vocabulary.score = 70;
  profile.skills.vocabulary.evidenceCount = 5;
  profile.nextReviewAt = "2026-01-02T00:00:00.000Z";
  assert.equal(deriveStatus(profile, config, "2026-01-03T00:00:00.000Z"), "REVIEW_DUE");
  assert.equal(getAdaptiveDecision(profile, config, "2026-01-03T00:00:00.000Z").decision, "REVIEW");
});

test("crea baseline antes/después sin depender del navegador", () => {
  const initial = profileFor("baseline", ["vocabulary"]);
  const practised = run(initial);
  const baseline = createBaseline({ userId: "baseline", routeId: "guarani-general", profiles: [practised], timestamp: "2026-01-01T13:00:00.000Z" });
  assert.equal(baseline.concepts[baseInput.conceptId].masteryScore, practised.masteryScore);
  assert.equal(baseline.concepts[baseInput.conceptId].skills.vocabulary, practised.skills.vocabulary.score);
});

test("rechaza tipos o dificultades no configurados en lugar de inventar", () => {
  assert.throws(() => applyLearningEvent(profileFor("bad"), { ...baseInput, userId: "bad", activityType: "unknown" }, config), /no configurado/);
  assert.throws(() => applyLearningEvent(profileFor("bad-2"), { ...baseInput, userId: "bad-2", difficulty: "unknown" }, config), /no configurada/);
});
