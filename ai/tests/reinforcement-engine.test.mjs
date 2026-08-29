import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildOpenAIRequest,
  createReinforcementService,
  filterAllowedKnowledge,
  normalizeReinforcementRequest,
  validateGeneratedActivity
} from "../../server/reinforcement-engine.mjs";

const localized = value => ({ es: value, en: value, pt: value, fr: value, it: value, de: value });
const baseRequest = {
  courseId: "general",
  languageVariant: "gug-PY",
  learningObjectiveId: "GG-LO-099",
  conceptIds: ["GG-C-099"],
  knowledgeIds: ["LEX-EXPERT-001"],
  skill: "writing",
  difficulty: "foundation-2",
  preferredActivityTypes: ["writing"],
  excludeActivityIds: [],
  locale: "es",
  adaptiveDecision: "REVIEW"
};
const expertKnowledge = {
  id: "LEX-EXPERT-001",
  recordType: "lexeme",
  languageVariant: "gug-PY",
  lemma: "aguyje",
  forms: ["Aguyje"],
  validationStatus: "expertVerified",
  allowedForGeneration: true,
  conflictIds: []
};
const validActivity = {
  type: "writing",
  courseId: "general",
  learningObjectiveId: "GG-LO-099",
  conceptIds: ["GG-C-099"],
  knowledgeIds: ["LEX-EXPERT-001"],
  skill: "writing",
  difficulty: "foundation-2",
  prompt: localized("Escribe la forma validada."),
  instruction: localized("Escribe una respuesta."),
  options: [],
  correctOptionId: "",
  audioText: "",
  tokens: [],
  correctOrder: [],
  template: localized("Forma validada"),
  acceptedAnswers: ["Aguyje"],
  pairs: []
};

test("la compuerta admite normativeVerified o expertVerified con autorización y sin conflictos", () => {
  const normative = {
    ...expertKnowledge,
    id: "LEX-NORMATIVE-001",
    validationStatus: "normativeVerified",
    normativeVerification: {
      method: "direct-normative-source-check",
      sourceAuthorityLevel: "A",
      sourceId: "S-002",
      sourcePage: "lexicon/01.htm#fixture",
      humanExpertReview: false,
      authorizedSenseIds: ["sense-1"],
      openConflictIds: []
    }
  };
  const variants = [
    expertKnowledge,
    normative,
    { ...expertKnowledge, id: "U", validationStatus: "unreviewed" },
    { ...expertKnowledge, id: "S", validationStatus: "sourceVerified" },
    { ...expertKnowledge, id: "C", validationStatus: "conflict" },
    { ...expertKnowledge, id: "R", validationStatus: "rejected" },
    { ...expertKnowledge, id: "D", validationStatus: "deprecated" },
    { ...expertKnowledge, id: "B", allowedForGeneration: false },
    { ...expertKnowledge, id: "H", needsHumanReview: true },
    { ...expertKnowledge, id: "X", conflictIds: ["C-1"] }
  ];
  assert.deepEqual(filterAllowedKnowledge(variants, variants.map(item => item.id)).map(item => item.id), ["LEX-EXPERT-001", "LEX-NORMATIVE-001"]);
});

test("una actividad existente hace canResolveWithoutAI=true y evita completamente fetch", async () => {
  let fetchCalls = 0;
  const service = createReinforcementService({
    corpusRecords: [expertKnowledge],
    existingActivities: [{ id: "existing-1", courseId: "general", learningObjectiveId: "GG-LO-099", conceptIds: ["GG-C-099"], skill: "writing", difficulty: "foundation-2", type: "writing" }],
    fetchImpl: async () => { fetchCalls += 1; throw new Error("no debe llamarse"); },
    env: { OPENAI_API_KEY: "server-secret", OPENAI_MODEL: "configured-model" }
  });
  const result = await service.generateReinforcementActivity(baseRequest, { verifiedUserId: "student-a" });
  assert.equal(result.mode, "existing");
  assert.equal(result.canResolveWithoutAI, true);
  assert.equal(result.existingActivityId, "existing-1");
  assert.equal(fetchCalls, 0);
});

test("sin conocimiento autorizado devuelve fallback y no llama OpenAI", async () => {
  let fetchCalls = 0;
  const service = createReinforcementService({
    corpusRecords: [{ ...expertKnowledge, validationStatus: "sourceVerified", allowedForGeneration: false }],
    existingActivities: [],
    fetchImpl: async () => { fetchCalls += 1; throw new Error("no debe llamarse"); },
    env: { OPENAI_API_KEY: "server-secret", OPENAI_MODEL: "configured-model" }
  });
  const result = await service.generateReinforcementActivity(baseRequest, { verifiedUserId: "student-a" });
  assert.equal(result.mode, "fallback");
  assert.equal(result.reason, "NO_AUTHORIZED_GENERATION_KNOWLEDGE");
  assert.equal(fetchCalls, 0);
});

test("sin configuración server-side devuelve fallback y no intenta la red", async () => {
  let fetchCalls = 0;
  const service = createReinforcementService({
    corpusRecords: [expertKnowledge],
    existingActivities: [],
    fetchImpl: async () => { fetchCalls += 1; throw new Error("no debe llamarse"); },
    env: {}
  });
  const result = await service.generateReinforcementActivity(baseRequest, { verifiedUserId: "student-a" });
  assert.equal(result.reason, "OPENAI_NOT_CONFIGURED");
  assert.equal(fetchCalls, 0);
});

test("una respuesta estructurada válida es compatible y se reutiliza desde cache", async () => {
  let fetchCalls = 0;
  const service = createReinforcementService({
    corpusRecords: [expertKnowledge],
    existingActivities: [],
    fetchImpl: async (_url, options) => {
      fetchCalls += 1;
      const requestBody = JSON.parse(options.body);
      assert.equal(requestBody.store, false);
      assert.equal(requestBody.text.format.type, "json_schema");
      assert.equal(requestBody.text.format.strict, true);
      return { ok: true, status: 200, json: async () => ({ output: [{ content: [{ type: "output_text", text: JSON.stringify(validActivity) }] }] }) };
    },
    env: { OPENAI_API_KEY: "server-secret", OPENAI_MODEL: "configured-model" }
  });
  const first = await service.generateReinforcementActivity(baseRequest, { verifiedUserId: "student-a" });
  const second = await service.generateReinforcementActivity(baseRequest, { verifiedUserId: "student-a" });
  assert.equal(first.mode, "generated");
  assert.equal(first.cacheHit, false);
  assert.equal(first.activity.type, "writing");
  assert.equal(first.activity.aiGenerated, true);
  assert.equal(second.cacheHit, true);
  assert.equal(fetchCalls, 1);
});

test("contenido con HTML o código es rechazado y cae a fallback", async () => {
  const unsafe = { ...validActivity, prompt: localized("<script>alert(1)</script>") };
  const request = normalizeReinforcementRequest(baseRequest);
  assert.equal(validateGeneratedActivity(unsafe, request, [expertKnowledge]).reason, "FORBIDDEN_OUTPUT");
});

test("el prompt del servidor prohíbe UI/código y usa Structured Outputs", () => {
  const payload = buildOpenAIRequest({
    model: "configured-model",
    request: normalizeReinforcementRequest(baseRequest),
    allowedKnowledge: [expertKnowledge],
    safetyIdentifier: "hashed-user"
  });
  assert.match(payload.instructions, /Do not output HTML, CSS, code, Firebase Rules, navigation/i);
  assert.equal(payload.text.format.name, "nalvi_reinforcement_activity");
  assert.equal(payload.store, false);
  assert.doesNotMatch(JSON.stringify(payload), /server-secret/);
});

test("el corpus real autoriza únicamente el piloto normativeVerified", () => {
  const corpus = JSON.parse(readFileSync(new URL("../../knowledge-base/pilot-corpus.json", import.meta.url), "utf8"));
  const authorized = filterAllowedKnowledge(corpus.records || [], (corpus.records || []).map(record => record.id));
  assert.equal(authorized.length, 20);
  assert.ok(authorized.every(record => record.validationStatus === "normativeVerified"));
});
