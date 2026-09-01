import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { catalogAudit } from "../activity-catalog/nalvi-activity-catalog.mjs";
import { selectFirstValidCandidate } from "../activity-catalog/nalvi-activity-quality.mjs";
import { buildDeterministicFallbackCandidates } from "../progression-engine/fallback-intervention.mjs";
import { createActivityFingerprint, classifyError } from "../intervention-engine/intervention-engine.mjs";
import { INTERVENTION_CONFIG } from "../intervention-engine/intervention-config.mjs";
import { filterAllowedKnowledge } from "./reinforcement-engine.mjs";
import { ADAPTIVE_TUTOR_CRITIC_SCHEMA, ADAPTIVE_TUTOR_PLAN_SCHEMA } from "./adaptive-tutor-schema.mjs";
import { planMetrics, validatePedagogicalQuality } from "./adaptive-tutor-quality.mjs";

export const ADAPTIVE_TUTOR_VERSION = "NALVI-TUTOR-CATALOG-1";
const plannerPrompt = readFileSync(new URL("../prompts/nalvi-tutor-planner-v1.md", import.meta.url), "utf8");
const criticPrompt = readFileSync(new URL("../prompts/nalvi-tutor-critic-v1.md", import.meta.url), "utf8");
const LOCALES = new Set(["es", "en", "pt", "fr", "it", "de"]);
const FEEDBACK = Object.freeze({
  es: "No del todo. Probemos de otra forma.", en: "Not quite. Let’s try another way.",
  pt: "Ainda não. Vamos tentar de outra forma.", fr: "Pas tout à fait. Essayons autrement.",
  it: "Non proprio. Proviamo in un altro modo.", de: "Noch nicht ganz. Versuchen wir es anders."
});
const hash = value => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const normalize = value => String(value ?? "").normalize("NFC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
const localize = (value, locale) => value && typeof value === "object" && !Array.isArray(value) ? String(value[locale] ?? value.es ?? value.en ?? Object.values(value)[0] ?? "") : String(value ?? "");
const sourceIdsFor = record => [...new Set((record?.sourceReferences || []).map(item => item.sourceId).filter(Boolean))];

function lessonInventory(context) {
  const values = new Set();
  const add = value => { const text = localize(value, context.uiLocale); if (text) values.add(normalize(text)); };
  add(context.correctAnswer);
  add(context.activity?.answer);
  add(context.activity?.lessonContext?.sourceAnswer);
  for (const option of context.activity?.lessonContext?.sourceOptions || context.activity?.options || []) add(option?.label ?? option?.text ?? option?.value ?? option);
  for (const activity of context.availableActivities || []) {
    add(activity?.answer); add(activity?.lessonContext?.sourceAnswer); add(activity?.semanticPair?.target); add(activity?.semanticPair?.meaning);
    for (const option of activity?.options || []) add(option?.label ?? option?.text ?? option?.value ?? option);
  }
  return values;
}

function knowledgeInventory(records) {
  const values = new Set();
  for (const record of records) {
    [record.lemma, record.lexeme, record.normalizedForm, ...Object.values(record.forms || {}), ...Object.values(record.sourceForms || {})].forEach(value => value && values.add(normalize(value)));
    for (const sense of record.senses || []) [sense.form, sense.glossEs, ...Object.values(sense.glosses || {}), ...Object.values(sense.meanings || {})].forEach(value => value && values.add(normalize(value)));
  }
  return values;
}

export function determineLinguisticMode(context, allowedKnowledge = []) {
  if (allowedKnowledge.length) return "NORMATIVE_GENERATIVE";
  return lessonInventory(context).has(normalize(context.correctAnswer)) && normalize(context.correctAnswer) ? "LESSON_BOUNDED" : "BLOCKED";
}

function pseudonymizedContext(context, mode, errorType) {
  return {
    conceptId: context.conceptId, learningObjectiveId: context.learningObjectiveId, currentSkill: context.currentSkill,
    activityType: context.activityType, difficulty: context.difficulty, studentAnswer: context.studentAnswer,
    correctAnswer: context.correctAnswer, attemptNumber: context.attemptNumber, recentErrors: context.recentErrors || [],
    recentActivities: (context.recentActivities || []).slice(-5), recentActivityFingerprints: (context.recentActivityFingerprints || []).slice(-5),
    modalitiesAlreadyUsed: (context.modalitiesAlreadyUsed || []).slice(-5), hintHistory: context.hintHistory || [],
    retentionHistory: context.retentionHistory || [], uiLocale: context.uiLocale, grammarRuleIds: context.grammarRuleIds || [],
    lexemeIds: context.lexemeIds || [], previousActivityFingerprint: context.previousActivityFingerprint || context.previousFingerprint,
    linguisticMode: mode, errorType, enabledActivityTypes: catalogAudit().enabledTypes,
    lessonMaterial: mode === "LESSON_BOUNDED" ? {
      prompt: localize(context.activity?.prompt, context.uiLocale),
      instruction: localize(context.activity?.instruction, context.uiLocale),
      options: (context.activity?.options || []).map(option => localize(option?.label ?? option?.text ?? option?.value ?? option, context.uiLocale)),
      correctAnswer: context.correctAnswer
    } : undefined
  };
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const output of payload?.output || []) for (const content of output.content || []) if (content.type === "output_text") return content.text;
  return "";
}

async function callResponses({ fetchImpl, apiKey, model, schema, schemaName, instructions, input, safetyIdentifier, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST", signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, store: false, instructions, input: JSON.stringify(input), max_output_tokens: 6200,
        text: { format: { type: "json_schema", name: schemaName, strict: true, schema } }, safety_identifier: safetyIdentifier })
    });
    if (!response.ok) throw new Error(`OPENAI_HTTP_${response.status}`);
    const payload = await response.json();
    return { value: JSON.parse(extractOutputText(payload)), usage: payload.usage || {}, latencyMs: Date.now() - started };
  } finally { clearTimeout(timer); }
}

export async function critiqueAdaptiveTutorPlan({ plan, context, permittedKnowledge, fetchImpl = globalThis.fetch, env = process.env, safetyIdentifier = "anonymous", timeoutMs = 9000 } = {}) {
  return callResponses({ fetchImpl, apiKey: env.OPENAI_API_KEY, model: env.OPENAI_TUTOR_MODEL || env.OPENAI_MODEL || "gpt-4.1-mini",
    schema: ADAPTIVE_TUTOR_CRITIC_SCHEMA, schemaName: "nalvi_adaptive_tutor_critic", instructions: criticPrompt,
    input: { context, plan, deterministicValidation: { valid: true }, permittedKnowledge }, safetyIdentifier, timeoutMs });
}

function validateLinguisticActivity(activity, context, mode, allowedKnowledge) {
  if (activity.hasOpenConflict || (activity.conflictIds || []).length) return "OPEN_LINGUISTIC_CONFLICT";
  if (mode === "BLOCKED") return "LINGUISTIC_MODE_BLOCKED";
  const inventory = mode === "NORMATIVE_GENERATIVE" ? knowledgeInventory(allowedKnowledge) : lessonInventory(context);
  if (normalize(activity.correctAnswer) && !inventory.has(normalize(activity.correctAnswer))) return mode === "LESSON_BOUNDED" ? "LESSON_BOUNDARY_EXCEEDED" : "INVALID_LINGUISTIC_CONTENT";
  if (mode === "NORMATIVE_GENERATIVE") {
    const ids = new Set(allowedKnowledge.map(record => record.id));
    const sources = new Set(allowedKnowledge.flatMap(sourceIdsFor));
    if ((activity.lexemeIds || []).some(id => !ids.has(id))) return "UNAUTHORIZED_LEXEME";
    if ((activity.sourceIds || []).some(id => !sources.has(id))) return "UNAUTHORIZED_SOURCE";
  }
  return "";
}

function toRenderable(activity, context, planId, index) {
  const type = activity.activityType || activity.type;
  const options = (activity.options || []).map((option, optionIndex) => ({
    ...option, id: String(option?.id || `option-${optionIndex + 1}`), label: localize(option?.text ?? option?.label ?? option?.value ?? option, context.uiLocale),
    value: localize(option?.text ?? option?.value ?? option?.label ?? option, context.uiLocale), image: option?.image || "", imageAlt: option?.imageAlt || ""
  }));
  const normalized = {
    ...activity, id: activity.id || `${planId}-activity-${index + 1}`, type, activityType: type,
    conceptId: activity.conceptIds?.[0] || context.conceptId, learningObjectiveId: context.learningObjectiveId,
    options, pairs: activity.pairs || [], tiles: activity.tiles || [], tokens: (activity.tiles || []).map(tile => ({ id: tile.id, label: tile.text })),
    categories: activity.categories || [], items: activity.items || [], segments: activity.segments || [], corrections: activity.corrections || [],
    dialogue: activity.dialogue || [], questions: activity.questions || [], steps: activity.steps || [], correctOrder: activity.correctOrder || [],
    acceptedAnswers: activity.acceptedAnswers?.length ? activity.acceptedAnswers : activity.correctAnswer ? [activity.correctAnswer] : [],
    answer: activity.correctAnswer, image: activity.media?.type === "image" ? activity.media.value : "", imageAlt: activity.media?.alt || "",
    audioText: "", audio: "", nalviGuided: Number(activity.helpLevel || 0) > 0,
    independentRetest: type === "INDEPENDENT_RECALL", context: `adaptive-tutor:${planId}:${index + 1}`
  };
  return { ...normalized, fingerprint: createActivityFingerprint(normalized, { uiLocale: context.uiLocale }) };
}

function selectValidatedCandidate(plan, context, mode, allowedKnowledge) {
  if (!plan || plan.planVersion !== ADAPTIVE_TUTOR_VERSION || plan.conceptId !== context.conceptId || plan.linguisticMode !== mode) return { valid: false, reasons: ["INVALID_PLAN_SHAPE"] };
  const selected = selectFirstValidCandidate(plan.candidateActivities || [], { ...context, errorType: plan.diagnosis?.errorType });
  if (!selected.accepted) return { valid: false, reasons: selected.rejected.flatMap(item => item.reasons) };
  const linguisticReason = validateLinguisticActivity(selected.candidate.activity, context, mode, allowedKnowledge);
  if (linguisticReason) return { valid: false, reasons: [linguisticReason] };
  const activity = toRenderable(selected.candidate.activity, context, plan.planId, 0);
  const candidate = { ...plan, candidateActivities: undefined, activities: [activity] };
  const quality = validatePedagogicalQuality(candidate, { ...context, errorType: plan.diagnosis.errorType });
  if (!quality.valid) return { valid: false, reasons: quality.reasons };
  return { valid: true, plan: { ...candidate, validationMetadata: { ...candidate.validationMetadata, selectedActivityType: activity.activityType,
    rejectedCandidates: selected.rejected, validatedAt: new Date().toISOString(), validationPipeline: ["strictStructuredOutput", "officialCatalog", "knowledgeBoundary", "grammarBoundary", "pedagogicalQuality", "answerLeakage", "duplicateChecker"] } } };
}

export function createProfessionalFallbackPlan(context, { reason = "PROFESSIONAL_LOCAL_FALLBACK", linguisticMode = "LESSON_BOUNDED" } = {}) {
  const locale = LOCALES.has(context.uiLocale) ? context.uiLocale : "es";
  const diagnosis = classifyError({ ...context, correct: false });
  const attempts = [Number(context.attemptNumber || 1), Number(context.attemptNumber || 1) + 1, Number(context.attemptNumber || 1) + 2];
  let selection = null;
  for (const attempt of attempts) {
    selection = selectFirstValidCandidate(buildDeterministicFallbackCandidates(context, attempt, diagnosis.errorType), { ...context, attemptNumber: attempt, errorType: diagnosis.errorType });
    if (selection.accepted) break;
  }
  const activity = selection?.accepted ? toRenderable(selection.candidate.activity, context, `fallback-${context.conceptId}`, 0) : null;
  return {
    planVersion: ADAPTIVE_TUTOR_VERSION, planId: `fallback-${hash({ conceptId: context.conceptId, attempt: context.attemptNumber, reason }).slice(0, 16)}`,
    conceptId: context.conceptId, linguisticMode,
    diagnosis: { errorType: diagnosis.errorType, likelyDifficulty: diagnosis.source, confidence: diagnosis.confidence, prerequisiteGap: diagnosis.errorType === "PREREQUISITE_GAP" ? "possible" : null, skillAffected: context.currentSkill || "vocabulary" },
    pedagogicalGoal: "Teach the same concept through a different official NALVI activity.",
    strategy: { primaryStrategy: selection?.candidate?.reasonCode || "CHANGE_MODALITY", secondaryStrategy: null, reasonCode: selection?.candidate?.reasonCode || reason },
    studentFeedback: { locale, shortMessage: FEEDBACK[locale] }, activities: activity ? [activity] : [],
    progressionPolicy: { onIncorrect: "BLOCK_AND_INTERVENE", onGuidedCorrect: "CONTINUE_PRACTICE", requiresIndependentRetest: true, maxInterventionsBeforeDefer: INTERVENTION_CONFIG.maxInterventionsBeforeDefer },
    fallbackPolicy: { strategy: "OFFICIAL_CATALOG_LOCAL_FALLBACK", reason },
    validationMetadata: { sourceIds: [], knowledgeIds: context.knowledgeIds || [], claimedRiskLevel: "GREEN", selectedActivityType: activity?.activityType || "", rejectedCandidates: selection?.rejected || [], validatedAt: new Date().toISOString(), validationPipeline: ["officialCatalog", "pedagogicalQuality", "answerLeakage", "duplicateChecker"] }
  };
}

function percentile(values, percentileValue) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(percentileValue / 100 * sorted.length) - 1))];
}
function estimateCostUsd(telemetry, env) {
  return Number((((telemetry.inputTokens * (Number(env.OPENAI_TUTOR_INPUT_USD_PER_MILLION) || 0)) + (telemetry.outputTokens * (Number(env.OPENAI_TUTOR_OUTPUT_USD_PER_MILLION) || 0))) / 1_000_000).toFixed(6));
}

export function createAdaptiveTutorOrchestrator({ corpusRecords = [], fetchImpl = globalThis.fetch, env = process.env, persistEvent = async () => ({ status: "skipped" }) } = {}) {
  const counters = { requests: 0, aiCalls: 0, criticCalls: 0, revisions: 0, fallbacks: 0, accepted: 0, rejected: 0, inputTokens: 0, outputTokens: 0, cost: 0, planLength: 0, latencies: [] };
  async function orchestrateAdaptiveTutoring(context, { verifiedUserId = "", requesterHash = "anonymous" } = {}) {
    counters.requests += 1;
    const allowedKnowledge = filterAllowedKnowledge(corpusRecords, context.knowledgeIds || []);
    const mode = determineLinguisticMode(context, allowedKnowledge);
    const diagnosis = classifyError({ ...context, correct: false });
    const fallback = createProfessionalFallbackPlan(context, { linguisticMode: mode === "BLOCKED" ? "LESSON_BOUNDED" : mode });
    const telemetry = { callCount: 0, criticCallCount: 0, revisionCount: 0, inputTokens: 0, outputTokens: 0, latencyMs: 0, errors: 0, model: env.OPENAI_TUTOR_MODEL || env.OPENAI_MODEL || "gpt-4.1-mini" };
    let finalPlan = fallback, usedAI = false, reason = "PROFESSIONAL_LOCAL_FALLBACK";
    const enabled = env.AI_TUTOR_ON_EVERY_INCORRECT_ANSWER !== "false" && context.correct === false;
    if (enabled && mode !== "BLOCKED" && env.OPENAI_API_KEY) {
      const timeoutMs = Math.max(1500, Number(env.AI_TUTOR_TIMEOUT_MS) || 9000);
      const maxRevision = Math.min(1, Math.max(0, Number(env.AI_TUTOR_MAX_REVISION_ATTEMPTS) || 1));
      const safetyIdentifier = hash(`nalvi-tutor:${verifiedUserId || requesterHash}`).slice(0, 64);
      const permittedKnowledge = allowedKnowledge.map(record => ({ id: record.id, recordType: record.recordType, lemma: record.lemma, lexeme: record.lexeme, forms: record.forms, senses: record.senses, sourceIds: sourceIdsFor(record), validationStatus: record.validationStatus }));
      let revisionInstruction = "";
      for (let attempt = 0; attempt <= maxRevision; attempt += 1) {
        try {
          counters.aiCalls += 1; telemetry.callCount += 1;
          const planner = await callResponses({ fetchImpl, apiKey: env.OPENAI_API_KEY, model: telemetry.model, schema: ADAPTIVE_TUTOR_PLAN_SCHEMA,
            schemaName: "nalvi_adaptive_tutor_plan", instructions: `${plannerPrompt}\n${revisionInstruction}`,
            input: { task: "selectOfficialCatalogCandidates", context: pseudonymizedContext(context, mode, diagnosis.errorType), permittedKnowledge, catalog: catalogAudit(), strategyEffectiveness: context.strategyEffectiveness || {} }, safetyIdentifier, timeoutMs });
          telemetry.inputTokens += Number(planner.usage.input_tokens || 0); telemetry.outputTokens += Number(planner.usage.output_tokens || 0); telemetry.latencyMs += planner.latencyMs;
          const deterministic = selectValidatedCandidate(planner.value, context, mode, allowedKnowledge);
          let critic = { accepted: deterministic.valid, reasonCodes: deterministic.reasons || [], revisionInstruction: "" };
          if (deterministic.valid && env.AI_TUTOR_CRITIC_ENABLED !== "false") {
            counters.criticCalls += 1; telemetry.criticCallCount += 1;
            const crit = await critiqueAdaptiveTutorPlan({ plan: planner.value, context: pseudonymizedContext(context, mode, diagnosis.errorType), permittedKnowledge, fetchImpl, env, safetyIdentifier, timeoutMs });
            telemetry.inputTokens += Number(crit.usage.input_tokens || 0); telemetry.outputTokens += Number(crit.usage.output_tokens || 0); telemetry.latencyMs += crit.latencyMs; critic = crit.value;
          }
          if (deterministic.valid && critic.accepted) { finalPlan = deterministic.plan; usedAI = true; reason = "AI_TUTOR_PLAN_VALIDATED"; counters.accepted += 1; break; }
          counters.rejected += 1;
          if (attempt < maxRevision) { counters.revisions += 1; telemetry.revisionCount += 1; revisionInstruction = `Revise once. Rejection reasons: ${(critic.reasonCodes || deterministic.reasons || []).join(", ")}. ${critic.revisionInstruction || ""}`; }
        } catch (error) { telemetry.errors += 1; reason = error?.name === "AbortError" ? "AI_TUTOR_TIMEOUT" : "AI_TUTOR_UNAVAILABLE"; }
      }
    } else reason = !enabled ? "AI_TUTOR_POLICY_DISABLED" : mode === "BLOCKED" ? "LINGUISTIC_MODE_BLOCKED" : "OPENAI_NOT_CONFIGURED";
    if (!usedAI) counters.fallbacks += 1;
    telemetry.estimatedCostUsd = estimateCostUsd(telemetry, env);
    counters.inputTokens += telemetry.inputTokens; counters.outputTokens += telemetry.outputTokens; counters.cost += telemetry.estimatedCostUsd; counters.planLength += finalPlan.activities.length; counters.latencies.push(telemetry.latencyMs);
    const metrics = planMetrics(finalPlan, context);
    const event = { eventKind: "adaptiveTutorIntervention", logicalCollection: "interventionEvents", conceptId: context.conceptId, learningObjectiveId: context.learningObjectiveId,
      errorType: finalPlan.diagnosis.errorType, strategy: finalPlan.strategy.primaryStrategy, activityTypes: finalPlan.activities.map(activity => activity.activityType),
      activityFingerprints: finalPlan.activities.map(activity => activity.fingerprint), usedAI, linguisticMode: mode, attemptNumber: context.attemptNumber, uiLocale: context.uiLocale, telemetry, metrics, timestamp: new Date().toISOString() };
    let persistence = { status: "skipped", reason: verifiedUserId ? "PERSISTENCE_NOT_CONFIGURED" : "ANONYMOUS_SESSION" };
    if (verifiedUserId) try { persistence = await persistEvent({ userId: verifiedUserId, event: { ...event, userId: verifiedUserId } }); } catch { persistence = { status: "failed", reason: "PERSISTENCE_ERROR" }; }
    return { ok: true, usedAI, mode: usedAI ? "adaptiveTutor" : "fallback", reason, linguisticMode: mode, adaptiveInterventionPlan: finalPlan, telemetry, metrics, persistence, event };
  }
  return Object.freeze({
    orchestrateAdaptiveTutoring,
    audit: () => ({ ...counters, estimatedCostUsd: Number(counters.cost.toFixed(6)), callsPerSession: counters.requests ? counters.aiCalls / counters.requests : 0,
      interventionAcceptanceRate: counters.requests ? counters.accepted / counters.requests : 0, fallbackRate: counters.requests ? counters.fallbacks / counters.requests : 0,
      averagePlanLength: counters.requests ? counters.planLength / counters.requests : 0, latencyP95Ms: percentile(counters.latencies, 95), version: ADAPTIVE_TUTOR_VERSION,
      officialActivityCatalog: catalogAudit(), apiKeyExposedToClient: false, piiSentToModel: false })
  });
}
