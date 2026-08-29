import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ADAPTIVE_INTERVENTION_PLAN_SCHEMA, ADAPTIVE_PLAN_LOCALES } from "../server/adaptive-intervention-plan.mjs";

const root = new URL("../", import.meta.url);
const [html, client, server, endpoint, policy, vercel, firestoreLayout, corpus] = await Promise.all([
  readFile(new URL("index.html", root), "utf8"),
  readFile(new URL("assets/js/nalvi-intervention-client.mjs", root), "utf8"),
  readFile(new URL("server/adaptive-intervention-plan.mjs", root), "utf8"),
  readFile(new URL("api/generate-adaptive-intervention-plan.js", root), "utf8"),
  readFile(new URL("policies/ai-usage-policy.json", root), "utf8").then(JSON.parse),
  readFile(new URL("vercel.json", root), "utf8").then(JSON.parse),
  readFile(new URL("mastery-engine/firestore-layout.json", root), "utf8").then(JSON.parse),
  readFile(new URL("knowledge-base/pilot-corpus.json", root), "utf8").then(JSON.parse)
]);

assert.match(html, /nalvi-intervention-client\.mjs/);
assert.match(client, /\/api\/generate-adaptive-intervention-plan/);
assert.match(client, /IMMEDIATE_LOCAL_FEEDBACK/);
assert.match(client, /nalvi:adaptive-plan-ready/);
assert.match(client, /nalvi:adaptive-plan-completed/);
assert.match(client, /adaptivePlanSequence:\s*\{ min: 1, max: 4 \}/);
assert.doesNotMatch(client, /OPENAI_API_KEY|sk-[A-Za-z0-9]/);
assert.match(server, /jsonSchema.*knowledgeBase.*grammarEngine.*activityTypeRules.*duplicateChecker.*allowedContent/s);
assert.match(server, /YELLOW_POLICY_NOT_ENABLED/);
assert.match(server, /UNKNOWN_TARGET_LANGUAGE_CONTENT/);
assert.match(server, /OPENAI_INVALID_JSON/);
assert.match(server, /OPENAI_UNAVAILABLE/);
assert.match(server, /filterAllowedKnowledge/);
assert.match(endpoint, /verifyFirebaseIdToken/);
assert.match(endpoint, /persistInterventionEvent/);
assert.ok(vercel.functions["api/generate-adaptive-intervention-plan.js"]);
assert.ok(policy.authorizedFunctions.includes("generateAdaptiveInterventionPlan"));
assert.deepEqual(policy.uiLocales, ADAPTIVE_PLAN_LOCALES);
assert.equal(policy.adaptivePlan.minimumActivities, 1);
assert.equal(policy.adaptivePlan.maximumActivities, 4);
assert.equal(policy.adaptivePlan.riskPolicy.RED, "neverShow");
assert.equal(ADAPTIVE_INTERVENTION_PLAN_SCHEMA.properties.activities.minItems, 1);
assert.equal(ADAPTIVE_INTERVENTION_PLAN_SCHEMA.properties.activities.maxItems, 4);
assert.ok(JSON.stringify(firestoreLayout).includes("learningEvents"));
assert.equal((corpus.records || []).filter(record => record.validationStatus === "normativeVerified" && record.allowedForGeneration === true).length, 20);
assert.equal((corpus.records || []).filter(record => record.validationStatus === "expertVerified" && record.allowedForGeneration === true).length, 0);

console.log(JSON.stringify({
  ok: true,
  step: "8B",
  endpoint: "/api/generate-adaptive-intervention-plan",
  sequenceLength: { min: 1, max: 4 },
  validationPipeline: policy.adaptivePlan.validationPipeline,
  riskPolicy: policy.adaptivePlan.riskPolicy,
  uiLocales: policy.uiLocales,
  firebaseRulesChanged: false,
  currentRealCorpusGenerationRecords: 20,
  normativeVerifiedRecords: 20,
  expertVerifiedRecords: 0
}, null, 2));
