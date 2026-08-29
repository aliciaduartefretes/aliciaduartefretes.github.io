import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createAdaptiveInterventionPlanService } from "../adaptive-intervention-plan.mjs";
import { filterAllowedKnowledge } from "../reinforcement-engine.mjs";
import { createActivityFingerprint } from "../../intervention-engine/intervention-engine.mjs";

const corpus = JSON.parse(await readFile(new URL("../../knowledge-base/pilot-corpus.json", import.meta.url), "utf8"));
const records = corpus.records;
const book = records.find(record => record.id === "LEX-PILOT-ARANDUKA-001");
const clothing = records.find(record => record.id === "LEX-PILOT-AO-001");

const failedActivity = {
  id: "failed-book-choice",
  conceptId: "pilot-book",
  type: "multiple-choice",
  skill: "vocabulary",
  difficulty: "foundation-1",
  instruction: "Selecciona la respuesta.",
  prompt: "¿Cómo se dice libro?",
  options: [{ id: "book", label: "aranduka" }, { id: "clothing", label: "ao" }],
  correctOptionId: "book"
};

const previousFingerprint = createActivityFingerprint(failedActivity, { uiLocale: "es" });
const request = {
  correct: false,
  canScoreWithoutAI: true,
  wouldAIImproveIntervention: true,
  conceptId: "pilot-book",
  learningObjectiveId: "GG-LO-PILOT-LEXICON",
  currentSkill: "vocabulary",
  activityType: "multiple-choice",
  difficulty: "foundation-1",
  studentAnswer: "ao",
  correctAnswer: "aranduka",
  attemptNumber: 1,
  recentErrors: [],
  recentActivityFingerprints: [],
  modalitiesAlreadyUsed: ["multiple-choice"],
  hintHistory: [],
  retentionHistory: [],
  uiLocale: "es",
  grammarRuleIds: [],
  lexemeIds: [book.id, clothing.id],
  knowledgeIds: [book.id, clothing.id],
  allowedConceptIds: ["pilot-book"],
  previousFingerprint,
  masteryBefore: 0.18,
  masteryAfter: 0.12,
  localPlan: {
    errorType: "SEMANTIC_CONFUSION",
    strategy: "CHANGE_MODALITY",
    diagnosis: { confidence: 0.82 },
    nextActivity: {
      id: "local-safe-book-fill",
      conceptId: "pilot-book",
      learningObjectiveId: "GG-LO-PILOT-LEXICON",
      type: "fill-blank",
      skill: "writing",
      difficulty: "foundation-1",
      instruction: "Completa la forma.",
      prompt: "Libro: {{blank}}",
      acceptedAnswers: ["aranduka"]
    },
    nextFingerprint: "local-safe-book-fill-fingerprint"
  }
};

const targetClaim = (text, recordId) => ({ text, recordId, sourceId: "S-002", claimType: "exactKnowledgeForm" });
const option = (id, text, contentLanguage, pairId, sourceIds = []) => ({ id, text, contentLanguage, pairId, sourceIds });
const generatedPlan = {
  planId: "normative-book-intervention",
  conceptId: "pilot-book",
  diagnosis: "SEMANTIC_CONFUSION",
  diagnosisConfidence: 0.91,
  strategy: "CHANGE_MODALITY",
  studentFeedback: "Vamos a relacionar la forma con su significado antes de escribirla.",
  internalRationale: "Changes modality and uses only two exact normative senses.",
  activities: [
    {
      activityType: "matching",
      skill: "vocabulary",
      difficulty: "foundation-1",
      instruction: "Relaciona cada forma con su significado.",
      prompt: "Forma las dos parejas.",
      options: [
        option("target-book", "aranduka", "target", "pair-book", ["S-002"]),
        option("target-clothing", "ao", "target", "pair-clothing", ["S-002"]),
        option("interface-book", "libro", "interface", "pair-book"),
        option("interface-clothing", "ropa", "interface", "pair-clothing")
      ],
      correctAnswer: "aranduka",
      answerLanguage: "target",
      hints: ["Busca la forma que corresponde a libro."],
      explanation: "La relación usa únicamente las dos acepciones normativas autorizadas.",
      conceptIds: ["pilot-book"],
      lexemeIds: [book.id, clothing.id],
      grammarRuleIds: [],
      sourceIds: ["S-002"],
      targetLanguageClaims: [targetClaim("aranduka", book.id), targetClaim("ao", clothing.id)],
      grammarEngineClaims: [],
      media: { type: "none", sourceId: "", value: "", alt: "" }
    },
    {
      activityType: "writing",
      skill: "writing",
      difficulty: "foundation-1",
      instruction: "Ahora escribe la forma sin opciones.",
      prompt: "Escribe la palabra guaraní para libro.",
      options: [],
      correctAnswer: "aranduka",
      answerLanguage: "target",
      hints: ["Empieza con aran-."],
      explanation: "La respuesta autorizada es aranduka.",
      conceptIds: ["pilot-book"],
      lexemeIds: [book.id],
      grammarRuleIds: [],
      sourceIds: ["S-002"],
      targetLanguageClaims: [targetClaim("aranduka", book.id)],
      grammarEngineClaims: [],
      media: { type: "none", sourceId: "", value: "", alt: "" }
    }
  ],
  retestPolicy: "after-plan",
  masteryRecommendation: "AWAIT_RETEST",
  validationMetadata: { claimedRiskLevel: "GREEN", sourceIds: ["S-002"] }
};

test("la compuerta acepta normativeVerified íntegro y bloquea los demás estados", () => {
  assert.deepEqual(filterAllowedKnowledge(records, [book.id]).map(record => record.id), [book.id]);
  for (const blockedId of ["CP-AREAL-001", "LEX-CANDIDATE-AGUYJE", "C-001", "C-002", "NO-EXISTE"]) {
    assert.deepEqual(filterAllowedKnowledge(records, [blockedId]), [], `${blockedId} no fue bloqueado.`);
  }
  const tampered = structuredClone(book);
  delete tampered.normativeVerification.sourcePage;
  assert.deepEqual(filterAllowedKnowledge([tampered], [book.id]), [], "Se aceptó normativeVerified sin localizador exacto.");
});

test("primer error: corrección local seguida por plan diferente con corpus normativo real", async () => {
  let calls = 0;
  let persistedEvent = null;
  const service = createAdaptiveInterventionPlanService({
    corpusRecords: records,
    env: { OPENAI_API_KEY: "test-server-only", OPENAI_MODEL: "test-structured-model" },
    fetchImpl: async (_url, options) => {
      calls += 1;
      const body = JSON.parse(options.body);
      const input = JSON.parse(body.input);
      assert.equal(request.canScoreWithoutAI, true, "La respuesta debía corregirse localmente.");
      assert.equal(request.wouldAIImproveIntervention, true);
      assert.deepEqual(input.permittedKnowledge.map(item => item.id).sort(), [book.id, clothing.id].sort());
      assert.ok(input.permittedKnowledge.every(item => item.validationStatus === "normativeVerified"));
      assert.ok(input.permittedKnowledge.every(item => item.senses.length === 1));
      assert.doesNotMatch(body.input, /Alicia|@|institution|fullName/i);
      return {
        ok: true,
        status: 200,
        json: async () => ({ output_text: JSON.stringify(generatedPlan), usage: { input_tokens: 210, output_tokens: 330 } })
      };
    },
    persistEvent: async ({ event }) => {
      persistedEvent = event;
      return { status: "persisted", path: "users/pseudonymous/learningEvents/test" };
    }
  });

  const result = await service.generateAdaptiveInterventionPlan(request, { verifiedUserId: "pseudonymous-student" });
  assert.equal(calls, 1);
  assert.equal(result.mode, "generated");
  assert.equal(result.usedAI, true);
  assert.equal(result.telemetry.callCount, 1);
  assert.equal(result.persistence.status, "persisted");
  assert.equal(result.adaptiveInterventionPlan.activities[0].type, "matching");
  assert.equal(result.adaptiveInterventionPlan.activities[1].type, "writing");
  assert.notEqual(result.adaptiveInterventionPlan.activities[0].fingerprint, previousFingerprint);
  assert.ok(result.adaptiveInterventionPlan.activities.every(activity => activity.allowedForMastery === false));
  assert.deepEqual(result.adaptiveInterventionPlan.validationMetadata.validationPipeline, ["jsonSchema", "knowledgeBase", "grammarEngine", "activityTypeRules", "duplicateChecker", "allowedContent"]);
  assert.equal(persistedEvent.usedAI, true);
  assert.equal(persistedEvent.masteryBefore, 0.18);
  assert.equal(persistedEvent.masteryAfter, 0.12);
});

test("si OpenAI falla continúa con una actividad local distinta", async () => {
  const service = createAdaptiveInterventionPlanService({
    corpusRecords: records,
    env: { OPENAI_API_KEY: "test-server-only", OPENAI_MODEL: "test-structured-model" },
    fetchImpl: async () => { throw new Error("simulated outage"); }
  });
  const result = await service.generateAdaptiveInterventionPlan(request, { verifiedUserId: "pseudonymous-student" });
  assert.equal(result.mode, "fallback");
  assert.equal(result.usedAI, false);
  assert.notEqual(result.adaptiveInterventionPlan.activities[0].fingerprint, previousFingerprint);
  assert.equal(result.telemetry.errors, 1);
});
