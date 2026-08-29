import test from "node:test";
import assert from "node:assert/strict";
import { createMasteryAttemptService } from "../mastery-attempt-service.mjs";

test("el servidor deriva Mastery y no acepta score, rol ni userId del cliente", async () => {
  let stored = null;
  const service = createMasteryAttemptService({
    readProfile: async () => ({ status: "missing", profile: null }),
    persistTransition: async transition => { stored = transition; return { status: "persisted" }; }
  });
  const result = await service.recordAttempt({
    userId: "attacker",
    role: "admin",
    masteryScore: 100,
    expertVerified: true,
    conceptId: "family-mother",
    learningObjectiveId: "GG-LO-FAMILY",
    activityId: "mother-question",
    activityType: "multiple-choice",
    skill: "vocabulary",
    difficulty: "foundation-1",
    correct: false,
    responseTime: 1200,
    hintUsed: false,
    uiLocale: "es"
  }, { verifiedUserId: "verified-user" });
  assert.equal(result.ok, true);
  assert.equal(stored.userId, "verified-user");
  assert.equal(stored.event.userId, "verified-user");
  assert.equal(stored.event.correct, false);
  assert.notEqual(stored.profile.masteryScore, 100);
  assert.equal("role" in stored.profile, false);
  assert.equal("expertVerified" in stored.profile, false);
});

test("sin sesión verificada no se registra evidencia", async () => {
  const service = createMasteryAttemptService();
  assert.deepEqual(await service.recordAttempt({}, { verifiedUserId: "" }), { ok: false, reason: "AUTH_REQUIRED" });
});
