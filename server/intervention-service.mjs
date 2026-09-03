import { createHash } from "node:crypto";
import { filterAllowedKnowledge } from "./reinforcement-engine.mjs";
import { ERROR_TYPES, STRATEGIES } from "../intervention-engine/intervention-config.mjs";
import {
  applyAISelection,
  canScoreWithoutAI,
  createInterventionEvent,
  planPedagogicalIntervention,
  wouldAIImproveIntervention
} from "../intervention-engine/intervention-engine.mjs";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
const UI_LOCALES = new Set(["es", "en", "pt", "fr", "it", "de"]);
const ALLOWED_ACTIVITY_TYPES = new Set([
  "multiple-choice", "listening", "order-sentence", "fill-blank", "writing", "matching", "speaking", "scenario",
  "CONTEXT_CHOICE", "ARROW_MATCH", "CATEGORY_SORT", "DIALOGUE_NEXT_TURN", "INDEPENDENT_RECALL", "AUDIO_SELECT"
]);

const safeId = (value, fallback = "") => {
  const normalized = String(value || "").trim();
  return SAFE_ID.test(normalized) ? normalized : fallback;
};
const truncate = (value, max = 320) => String(value ?? "").slice(0, max);
const arrayOfIds = (value, max = 16) => [...new Set((Array.isArray(value) ? value : []).map(item => safeId(item)).filter(Boolean))].slice(0, max);

function sanitizeActivity(activity = {}) {
  return {
    id: safeId(activity.id, "activity"),
    conceptId: safeId(activity.conceptId || activity.conceptIds?.[0]),
    learningObjectiveId: safeId(activity.learningObjectiveId),
    type: ALLOWED_ACTIVITY_TYPES.has(activity.type) ? activity.type : "multiple-choice",
    skill: safeId(activity.skill, "vocabulary"),
    difficulty: truncate(activity.difficulty || "foundation", 40),
    prompt: activity.prompt,
    instruction: activity.instruction,
    options: (activity.options || []).slice(0, 8).map(option => ({ id: safeId(option?.id, "option"), label: option?.label ?? option?.value ?? option })),
    correctOptionId: safeId(activity.correctOptionId),
    acceptedAnswers: (activity.acceptedAnswers || []).slice(0, 10).map(item => truncate(item, 160)),
    correctOrder: (activity.correctOrder || []).slice(0, 16).map(item => safeId(item)),
    audioText: truncate(activity.audioText, 200),
    audioPath: truncate(activity.audioPath || activity.authorizedAudio?.path || activity.authorizedAudio?.url, 300),
    audioAuthorized: activity.audioAuthorized === true || activity.authorizedAudio?.authorized === true,
    contextText: truncate(activity.contextText || activity.scenario || activity.lessonContext?.visibleContext, 500),
    contextAuthorized: activity.contextAuthorized === true,
    dialogueAuthorized: activity.dialogueAuthorized === true,
    image: truncate(activity.image || activity.imageUrl, 240),
    template: activity.template,
    context: activity.context
    ,pairs: (activity.pairs || []).slice(0, 5).map((pair, index) => ({ id: safeId(pair?.id, `pair-${index}`), left: truncate(pair?.left, 160), right: truncate(pair?.right, 160), authorized: pair?.authorized === true }))
    ,semanticPair: activity.semanticPair?.target && activity.semanticPair?.meaning ? { target: truncate(activity.semanticPair.target, 160), meaning: truncate(activity.semanticPair.meaning, 160), authorized: activity.semanticPair.authorized === true } : null
    ,categories: (activity.categories || []).slice(0, 3).map((category, index) => ({ id: safeId(category?.id, `category-${index}`), label: truncate(category?.label ?? category?.text ?? category, 120), authorized: category?.authorized === true }))
    ,items: (activity.items || []).slice(0, 10).map((item, index) => ({ id: safeId(item?.id, `item-${index}`), text: truncate(item?.text ?? item?.label ?? item, 120), categoryId: safeId(item?.categoryId), authorized: item?.authorized === true }))
    ,dialogue: (activity.dialogue || activity.turns || []).slice(0, 4).map((turn, index) => ({ id: safeId(turn?.id, `turn-${index}`), speaker: truncate(turn?.speaker || (index % 2 ? "B" : "A"), 40), text: truncate(turn?.text ?? turn, 240), authorized: turn?.authorized === true }))
    ,tokens: (activity.tokens || []).slice(0, 16).map((token, index) => ({ id: safeId(token?.id, `token-${index}`), label: truncate(token?.label ?? token?.text ?? token, 120) }))
    ,media: activity.media && typeof activity.media === "object" ? { type: truncate(activity.media.type, 12), value: truncate(activity.media.value, 240), alt: truncate(activity.media.alt, 200), sourceId: safeId(activity.media.sourceId) } : null
    ,helpLevel: Math.min(4, Math.max(0, Number(activity.helpLevel) || 0))
    ,answerExposure: ["HIDDEN", "PARTIAL_HINT", "WORKED_EXAMPLE", "EXPLICIT_SOLUTION"].includes(activity.answerExposure) ? activity.answerExposure : "HIDDEN"
  };
}

function sanitizeApprovedActivityMaterial(material = {}) {
  const authorized = item => item?.authorized === true;
  return {
    options: (material.options || []).filter(authorized).slice(0, 4).map((option, index) => ({
      id: safeId(option?.id, `approved-option-${index}`), text: truncate(option?.text ?? option?.label ?? option?.value, 160), authorized: true
    })).filter(option => option.text),
    pairs: (material.pairs || []).filter(authorized).slice(0, 5).map((pair, index) => ({
      id: safeId(pair?.id, `approved-pair-${index}`), left: truncate(pair?.left, 160), right: truncate(pair?.right, 160), authorized: true
    })).filter(pair => pair.left && pair.right),
    contexts: (material.contexts || []).slice(0, 4).map(value => truncate(value, 500)).filter(Boolean),
    categories: (material.categories || []).filter(authorized).slice(0, 3).map((category, index) => ({
      id: safeId(category?.id, `approved-category-${index}`), label: truncate(category?.label ?? category?.text, 120), authorized: true
    })).filter(category => category.label),
    items: (material.items || []).filter(authorized).slice(0, 10).map((item, index) => ({
      id: safeId(item?.id, `approved-item-${index}`), text: truncate(item?.text ?? item?.label, 120), categoryId: safeId(item?.categoryId), authorized: true
    })).filter(item => item.text && item.categoryId),
    dialogue: (material.dialogue || []).filter(authorized).slice(0, 4).map((turn, index) => ({
      id: safeId(turn?.id, `approved-turn-${index}`), speaker: truncate(turn?.speaker || (index % 2 ? "B" : "A"), 40), text: truncate(turn?.text, 240), authorized: true
    })).filter(turn => turn.text),
    audio: material.audio?.authorized === true ? {
      path: truncate(material.audio.path || material.audio.url, 300), text: truncate(material.audio.text, 200), source: truncate(material.audio.source, 80), authorized: true
    } : null
  };
}

export function normalizeInterventionRequest(input = {}) {
  const activity = sanitizeActivity(input.activity || {});
  const conceptId = safeId(input.conceptId || activity.conceptId);
  if (!conceptId) throw new TypeError("conceptId es obligatorio.");
  if (input.correct !== false) throw new TypeError("La intervención requiere una respuesta incorrecta ya corregida localmente.");
  return {
    correct: false,
    conceptId,
    learningObjectiveId: safeId(input.learningObjectiveId || activity.learningObjectiveId),
    currentSkill: safeId(input.currentSkill || activity.skill, "vocabulary"),
    activityType: activity.type,
    difficulty: truncate(input.difficulty || activity.difficulty, 40),
    studentAnswer: truncate(input.studentAnswer, 240),
    correctAnswer: truncate(input.correctAnswer, 240),
    attemptNumber: Math.min(12, Math.max(1, Number(input.attemptNumber) || 1)),
    recentErrors: (input.recentErrors || []).slice(-12).map(item => ({ conceptId: safeId(item.conceptId), errorType: ERROR_TYPES.includes(item.errorType) ? item.errorType : "UNKNOWN_ERROR" })),
    recentActivities: (input.recentActivities || []).slice(-12).map(sanitizeActivity),
    recentActivityFingerprints: (input.recentActivityFingerprints || []).slice(-16).map(item => truncate(item, 80)),
    modalitiesAlreadyUsed: (input.modalitiesAlreadyUsed || []).slice(-12).map(item => truncate(item, 40)),
    hintHistory: (input.hintHistory || []).slice(-12).map(item => truncate(item, 100)),
    retentionHistory: (input.retentionHistory || []).slice(-12).map(item => ({ result: truncate(item.result, 32), ageDays: Math.max(0, Number(item.ageDays) || 0) })),
    answerExposureHistory: (input.answerExposureHistory || []).slice(-12).map(item => truncate(item, 32)),
    strategyEffectiveness: Object.fromEntries(Object.entries(input.strategyEffectiveness || {}).slice(0, 24).map(([key, value]) => [truncate(key, 80), Math.max(0, Math.min(1, Number(value) || 0))])),
    prerequisiteGaps: arrayOfIds(input.prerequisiteGaps, 12),
    independentRetestQueue: arrayOfIds(input.independentRetestQueue, 12),
    recentInterventions: (input.recentInterventions || []).slice(-12).map(item => ({ strategy: STRATEGIES.includes(item.strategy) ? item.strategy : "", errorType: ERROR_TYPES.includes(item.errorType) ? item.errorType : "" })),
    uiLocale: UI_LOCALES.has(input.uiLocale) ? input.uiLocale : "es",
    grammarRuleIds: arrayOfIds(input.grammarRuleIds),
    lexemeIds: arrayOfIds(input.lexemeIds),
    knowledgeIds: arrayOfIds(input.knowledgeIds),
    masteryBefore: Number.isFinite(Number(input.masteryBefore)) ? Number(input.masteryBefore) : null,
    masteryAfter: Number.isFinite(Number(input.masteryAfter)) ? Number(input.masteryAfter) : null,
    activity,
    availableActivities: (input.availableActivities || []).slice(0, 24).map(sanitizeActivity),
    approvedActivityMaterial: sanitizeApprovedActivityMaterial(input.approvedActivityMaterial),
    previousActivityFingerprint: truncate(input.previousActivityFingerprint || input.previousFingerprint, 80),
    aiPolicy: {
      allowInterventionAI: input.aiPolicy?.allowInterventionAI !== false,
      AI_TUTOR_ON_EVERY_INCORRECT_ANSWER: input.aiPolicy?.AI_TUTOR_ON_EVERY_INCORRECT_ANSWER !== false
    }
  };
}

function allowedKnowledgeSummary(records) {
  return records.map(record => ({
    id: record.id,
    recordType: record.recordType,
    lemma: record.lemma,
    lexeme: record.lexeme,
    rule: record.rule,
    forms: record.forms,
    restrictions: record.restrictions
  }));
}

function extractOutputText(response) {
  if (typeof response?.output_text === "string") return response.output_text;
  for (const item of response?.output || []) for (const content of item?.content || []) {
    if (content?.type === "output_text" && typeof content.text === "string") return content.text;
  }
  return "";
}

function costEstimate(usage, env) {
  const inputPrice = Number(env.OPENAI_INPUT_COST_PER_1M), outputPrice = Number(env.OPENAI_OUTPUT_COST_PER_1M);
  if (!Number.isFinite(inputPrice) || !Number.isFinite(outputPrice)) return { estimatedCostUsd: null, costEstimateStatus: "modelPricingNotConfigured" };
  return {
    estimatedCostUsd: (Number(usage?.input_tokens || 0) * inputPrice + Number(usage?.output_tokens || 0) * outputPrice) / 1_000_000,
    costEstimateStatus: "estimatedFromConfiguredRates"
  };
}

function buildAIRequest({ context, plan, knowledge, model, userId }) {
  const schema = {
    type: "object", additionalProperties: false, required: ["errorType", "strategy", "rationale"],
    properties: {
      errorType: { type: "string", enum: ERROR_TYPES },
      strategy: { type: "string", enum: STRATEGIES },
      rationale: { type: "string", minLength: 1, maxLength: 320 }
    }
  };
  return {
    model,
    store: false,
    instructions: [
      "You are NALVI's private pedagogical intervention selector, not a chatbot.",
      "The response was already scored locally. Do not score it, change points, or invent Guarani.",
      "Select only an error type and pedagogical strategy from the schema.",
      "Use only the supplied normativeVerified or expertVerified knowledge authorized for generation. Do not output personal data, HTML, CSS, code, or navigation.",
      `Write rationale in interface locale ${context.uiLocale}.`
    ].join(" "),
    input: JSON.stringify({
      task: "improvePedagogicalIntervention",
      context: {
        conceptId: context.conceptId,
        learningObjectiveId: context.learningObjectiveId,
        currentSkill: context.currentSkill,
        activityType: context.activityType,
        difficulty: context.difficulty,
        studentAnswer: context.studentAnswer,
        correctAnswer: context.correctAnswer,
        attemptNumber: context.attemptNumber,
        recentErrors: context.recentErrors,
        modalitiesAlreadyUsed: context.modalitiesAlreadyUsed,
        grammarRuleIds: context.grammarRuleIds,
        lexemeIds: context.lexemeIds,
        uiLocale: context.uiLocale
      },
      localPlan: { errorType: plan.errorType, strategy: plan.strategy, nextActivityType: plan.nextActivityType },
      permittedKnowledge: allowedKnowledgeSummary(knowledge)
    }),
    max_output_tokens: 220,
    text: { format: { type: "json_schema", name: "nalvi_intervention_selection", strict: true, schema } },
    prompt_cache_key: `nalvi-p8-intervention-${createHash("sha256").update(JSON.stringify(knowledge.map(item => item.id))).digest("hex").slice(0, 24)}`,
    safety_identifier: userId ? createHash("sha256").update(`nalvi:${userId}`).digest("hex") : undefined
  };
}

export function createInterventionService({
  corpusRecords = [],
  fetchImpl = globalThis.fetch,
  env = process.env,
  persistEvent = async () => ({ status: "skipped", reason: "PERSISTENCE_NOT_CONFIGURED" }),
  timeoutMs = 10_000
} = {}) {
  const counters = { requests: 0, aiCalls: 0, aiErrors: 0, persisted: 0 };

  async function planIntervention(rawRequest, { verifiedUserId = "" } = {}) {
    counters.requests += 1;
    let context;
    try { context = normalizeInterventionRequest(rawRequest); }
    catch (error) { return { ok: false, reason: "INVALID_REQUEST", message: error.message }; }

    const scoreLocally = canScoreWithoutAI(context);
    let plan = planPedagogicalIntervention(context);
    const improveWithAI = wouldAIImproveIntervention(context, plan);
    const knowledge = filterAllowedKnowledge(corpusRecords, context.knowledgeIds);
    const telemetry = { callCount: 0, inputTokens: 0, outputTokens: 0, latencyMs: 0, errors: 0, estimatedCostUsd: null, costEstimateStatus: "notApplicable" };
    let aiReason = improveWithAI ? "AI_NOT_CALLED" : "LOCAL_PLAN_SUFFICIENT";

    if (improveWithAI && knowledge.length && verifiedUserId && env.OPENAI_API_KEY) {
      telemetry.callCount = 1; counters.aiCalls += 1;
      const started = Date.now(), controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify(buildAIRequest({ context, plan, knowledge, model: env.OPENAI_MODEL || "gpt-4.1-mini", userId: verifiedUserId })),
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`OPENAI_HTTP_${response.status}`);
        const payload = await response.json(), selection = JSON.parse(extractOutputText(payload));
        plan = applyAISelection(plan, selection);
        telemetry.inputTokens = Number(payload.usage?.input_tokens || 0);
        telemetry.outputTokens = Number(payload.usage?.output_tokens || 0);
        Object.assign(telemetry, costEstimate(payload.usage, env));
        aiReason = "VALIDATED_AI_SELECTION";
      } catch (error) {
        telemetry.errors = 1; counters.aiErrors += 1; aiReason = error?.name === "AbortError" ? "AI_TIMEOUT_LOCAL_FALLBACK" : "AI_FAILURE_LOCAL_FALLBACK";
      } finally {
        clearTimeout(timer); telemetry.latencyMs = Date.now() - started;
      }
    } else if (improveWithAI && !knowledge.length) aiReason = "NO_AUTHORIZED_KNOWLEDGE_LOCAL_FALLBACK";
    else if (improveWithAI && !verifiedUserId) aiReason = "ANONYMOUS_LOCAL_FALLBACK";
    else if (improveWithAI && !env.OPENAI_API_KEY) aiReason = "OPENAI_UNAVAILABLE_LOCAL_FALLBACK";

    const event = createInterventionEvent({ ...context, userId: verifiedUserId }, plan, telemetry);
    let persistence;
    try {
      persistence = await persistEvent({ userId: verifiedUserId, event });
      if (persistence?.status === "persisted") counters.persisted += 1;
    } catch {
      persistence = { status: "failed", reason: "PERSISTENCE_ERROR" };
    }
    return {
      ok: true,
      canScoreWithoutAI: scoreLocally,
      wouldAIImproveIntervention: improveWithAI,
      usedAI: Boolean(plan.usedAI),
      aiReason,
      plan,
      telemetry,
      persistence,
      event: { ...event, userId: undefined }
    };
  }

  return { planIntervention, audit: () => ({ ...counters }) };
}
