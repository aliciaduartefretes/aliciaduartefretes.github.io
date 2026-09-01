import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createActivityFingerprint, planPedagogicalIntervention } from "../intervention-engine/intervention-engine.mjs";

const root = new URL("../", import.meta.url);
const [html, client, renderer, policy, vercel, rules] = await Promise.all([
  readFile(new URL("index.html", root), "utf8"),
  readFile(new URL("assets/js/nalvi-intervention-client.mjs", root), "utf8"),
  readFile(new URL("assets/js/kuaa-activity-renderer.js", root), "utf8"),
  readFile(new URL("policies/ai-usage-policy.json", root), "utf8").then(JSON.parse),
  readFile(new URL("vercel.json", root), "utf8").then(JSON.parse),
  readFile(new URL("firebase/firestore-PASO-6.rules", root), "utf8")
]);

assert.match(html, /nalvi-intervention-client\.mjs/);
assert.doesNotMatch(html, /generalQueue\.push\(sourceIndex\)/);
assert.match(renderer, /nalvi:activity-scored/);
assert.match(client, /\/api\/generate-adaptive-intervention-plan/);
assert.match(policy.policyVersion, /^2\.(?:[2-9]|[1-9]\d+)\.\d+$/);
assert.equal(policy.decisionGates.scoring.field, "canScoreWithoutAI");
assert.equal(policy.decisionGates.postErrorIntervention.field, "wouldAIImproveIntervention");
assert.ok(vercel.functions["api/plan-pedagogical-intervention.js"]);
assert.match(rules, /match \/learningEvents\/\{eventId\}/);
assert.doesNotMatch(client, /OPENAI_API_KEY|sk-[A-Za-z0-9]/);

const base = { id: "a", conceptId: "c", learningObjectiveId: "o", type: "multiple-choice", skill: "vocabulary", difficulty: "foundation-1", prompt: "¿Cómo se dice mamá?", options: [{ id: "x", label: "Ru" }, { id: "y", label: "Sy" }], correctOptionId: "y" };
const next = { ...base, id: "b", type: "listening", prompt: "Escucha y elige", audioText: "Sy" };
const plan = planPedagogicalIntervention({ correct: false, conceptId: "c", learningObjectiveId: "o", currentSkill: "vocabulary", activityType: base.type, difficulty: base.difficulty, studentAnswer: "Ru", correctAnswer: "Sy", attemptNumber: 1, uiLocale: "es", activity: base, availableActivities: [base, next] });
assert.notEqual(plan.previousFingerprint, plan.nextFingerprint);
assert.equal(plan.nextFingerprint, createActivityFingerprint(next, { uiLocale: "es" }));

console.log(JSON.stringify({ ok: true, step: 8, exactRepeatBlocked: true, firebaseRulesChanged: false, languages: policy.uiLocales, endpoint: "/api/generate-adaptive-intervention-plan" }, null, 2));
