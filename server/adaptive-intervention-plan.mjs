import { createHash } from "node:crypto";
import { createActivityFingerprint } from "../intervention-engine/intervention-engine.mjs";
import { ERROR_TYPES, STRATEGIES } from "../intervention-engine/intervention-config.mjs";
import { filterAllowedKnowledge } from "./reinforcement-engine.mjs";

export const ADAPTIVE_PLAN_VERSION = "NALVI-P8B-ADAPTIVE-PLAN-1";
export const ADAPTIVE_PLAN_LOCALES = Object.freeze(["es", "en", "pt", "fr", "it", "de"]);
export const ADAPTIVE_PLAN_ACTIVITY_TYPES = Object.freeze([
  "multiple-choice", "listening", "order-sentence", "fill-blank", "writing", "matching", "speaking", "scenario"
]);
export const ADAPTIVE_PLAN_RISK_LEVELS = Object.freeze(["GREEN", "YELLOW", "RED"]);

const ALLOWED_SKILLS = new Set(["listening", "reading", "writing", "speaking", "vocabulary", "grammar", "application", "comprehension", "construction", "interaction"]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
const FORBIDDEN_OUTPUT = /<\/?[a-z][^>]*>|```|<!doctype|<script|<style|\b(?:firebase\s+rules|function\s*\(|const\s+|let\s+|var\s+|import\s+|export\s+)\b/i;
const TARGET_CLAIM_TYPES = new Set(["exactKnowledgeForm", "validatedExample", "grammarEngineOutput", "authorizedTemplate"]);

const hash = value => createHash("sha256").update(typeof value === "string" ? value : stableJson(value)).digest("hex");
const stableJson = value => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
const normalized = value => String(value ?? "").normalize("NFC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
const safeId = value => SAFE_ID.test(String(value || "").trim()) ? String(value).trim() : "";
const ids = value => [...new Set((Array.isArray(value) ? value : []).map(safeId).filter(Boolean))];
const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
const allStrings = (value, output = []) => {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) value.forEach(item => allStrings(item, output));
  else if (value && typeof value === "object") Object.values(value).forEach(item => allStrings(item, output));
  return output;
};

const feedbackFallback = Object.freeze({
  es: "Vamos a practicar el mismo concepto de otra manera.",
  en: "Let’s practice the same concept in a different way.",
  pt: "Vamos praticar o mesmo conceito de outra maneira.",
  fr: "Pratiquons le même concept d’une autre manière.",
  it: "Esercitiamoci sullo stesso concetto in un altro modo.",
  de: "Wir üben dasselbe Konzept auf eine andere Weise."
});

const optionSchema = {
  type: "object", additionalProperties: false,
  required: ["id", "text", "contentLanguage", "pairId", "sourceIds"],
  properties: {
    id: { type: "string", minLength: 1, maxLength: 48 },
    text: { type: "string", minLength: 1, maxLength: 180 },
    contentLanguage: { type: "string", enum: ["target", "interface"] },
    pairId: { type: "string", maxLength: 48 },
    sourceIds: { type: "array", maxItems: 8, items: { type: "string", minLength: 1, maxLength: 96 } }
  }
};

const targetClaimSchema = {
  type: "object", additionalProperties: false,
  required: ["text", "recordId", "sourceId", "claimType"],
  properties: {
    text: { type: "string", minLength: 1, maxLength: 240 },
    recordId: { type: "string", minLength: 1, maxLength: 96 },
    sourceId: { type: "string", minLength: 1, maxLength: 96 },
    claimType: { type: "string", enum: [...TARGET_CLAIM_TYPES] }
  }
};

const grammarClaimSchema = {
  type: "object", additionalProperties: false,
  required: ["kind", "expectedText", "verbId", "grammaticalPerson", "oralNasal", "constructionType", "ruleId", "constituentRoles"],
  properties: {
    kind: { type: "string", enum: ["verbForm", "sentenceStructure"] },
    expectedText: { type: "string", minLength: 1, maxLength: 240 },
    verbId: { type: "string", maxLength: 96 },
    grammaticalPerson: { type: "string", maxLength: 32 },
    oralNasal: { type: "string", enum: ["", "oral", "nasal"] },
    constructionType: { type: "string", maxLength: 96 },
    ruleId: { type: "string", maxLength: 96 },
    constituentRoles: { type: "array", maxItems: 16, items: { type: "string", minLength: 1, maxLength: 64 } }
  }
};

const activitySchema = {
  type: "object", additionalProperties: false,
  required: [
    "activityType", "skill", "difficulty", "instruction", "prompt", "options", "correctAnswer", "answerLanguage",
    "hints", "explanation", "conceptIds", "lexemeIds", "grammarRuleIds", "sourceIds", "targetLanguageClaims",
    "grammarEngineClaims", "media"
  ],
  properties: {
    activityType: { type: "string", enum: [...ADAPTIVE_PLAN_ACTIVITY_TYPES] },
    skill: { type: "string", enum: [...ALLOWED_SKILLS] },
    difficulty: { type: "string", minLength: 1, maxLength: 64 },
    instruction: { type: "string", minLength: 1, maxLength: 360 },
    prompt: { type: "string", minLength: 1, maxLength: 420 },
    options: { type: "array", maxItems: 10, items: optionSchema },
    correctAnswer: { type: "string", maxLength: 240 },
    answerLanguage: { type: "string", enum: ["target", "interface"] },
    hints: { type: "array", maxItems: 4, items: { type: "string", minLength: 1, maxLength: 240 } },
    explanation: { type: "string", minLength: 1, maxLength: 420 },
    conceptIds: { type: "array", minItems: 1, maxItems: 8, items: { type: "string", minLength: 1, maxLength: 96 } },
    lexemeIds: { type: "array", maxItems: 16, items: { type: "string", minLength: 1, maxLength: 96 } },
    grammarRuleIds: { type: "array", maxItems: 16, items: { type: "string", minLength: 1, maxLength: 96 } },
    sourceIds: { type: "array", minItems: 1, maxItems: 16, items: { type: "string", minLength: 1, maxLength: 96 } },
    targetLanguageClaims: { type: "array", minItems: 1, maxItems: 24, items: targetClaimSchema },
    grammarEngineClaims: { type: "array", maxItems: 8, items: grammarClaimSchema },
    media: {
      type: "object", additionalProperties: false, required: ["type", "sourceId", "value", "alt"],
      properties: {
        type: { type: "string", enum: ["none", "image", "audio"] },
        sourceId: { type: "string", maxLength: 96 },
        value: { type: "string", maxLength: 320 },
        alt: { type: "string", maxLength: 180 }
      }
    }
  }
};

export const ADAPTIVE_INTERVENTION_PLAN_SCHEMA = Object.freeze({
  type: "object", additionalProperties: false,
  required: [
    "planId", "conceptId", "diagnosis", "diagnosisConfidence", "strategy", "studentFeedback", "internalRationale",
    "activities", "retestPolicy", "masteryRecommendation", "validationMetadata"
  ],
  properties: {
    planId: { type: "string", minLength: 1, maxLength: 96 },
    conceptId: { type: "string", minLength: 1, maxLength: 96 },
    diagnosis: { type: "string", enum: [...ERROR_TYPES] },
    diagnosisConfidence: { type: "number", minimum: 0, maximum: 1 },
    strategy: { type: "string", enum: [...STRATEGIES] },
    studentFeedback: { type: "string", minLength: 1, maxLength: 420 },
    internalRationale: { type: "string", minLength: 1, maxLength: 520 },
    activities: { type: "array", minItems: 1, maxItems: 4, items: activitySchema },
    retestPolicy: { type: "string", enum: ["after-plan", "delayed", "after-independent-success", "none"] },
    masteryRecommendation: { type: "string", enum: ["KEEP", "MARK_WEAK", "SCHEDULE_REVIEW", "REDUCE_GUIDED_EVIDENCE", "AWAIT_RETEST"] },
    validationMetadata: {
      type: "object", additionalProperties: false, required: ["claimedRiskLevel", "sourceIds"],
      properties: {
        claimedRiskLevel: { type: "string", enum: [...ADAPTIVE_PLAN_RISK_LEVELS] },
        sourceIds: { type: "array", minItems: 1, maxItems: 24, items: { type: "string", minLength: 1, maxLength: 96 } }
      }
    }
  }
});

function sourceIdsFor(record) {
  return ids((record?.sourceReferences || []).map(reference => reference?.sourceId));
}

function linguisticInventory(record) {
  const output = new Set();
  const collect = value => {
    if (typeof value === "string") { if (value.trim()) output.add(normalized(value)); return; }
    if (Array.isArray(value)) { value.forEach(collect); return; }
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      if (["form", "text", "lemma", "lexeme", "surfaceForm", "underlyingForm", "targetText", "example"].includes(key)) collect(item);
    }
  };
  [record?.lemma, record?.lexeme, record?.normalizedForm, record?.sourceForms, record?.surfaceForm, record?.underlyingForm, record?.forms, record?.examples, record?.validatedForms, record?.authorizedTemplates].forEach(collect);
  return output;
}

function activityShapeIsValid(activity) {
  if (!activity || typeof activity !== "object" || Array.isArray(activity)) return false;
  if (!ADAPTIVE_PLAN_ACTIVITY_TYPES.includes(activity.activityType) || !ALLOWED_SKILLS.has(activity.skill)) return false;
  if (!String(activity.instruction || "").trim() || !String(activity.prompt || "").trim()) return false;
  if (!Array.isArray(activity.options) || !Array.isArray(activity.hints) || !Array.isArray(activity.targetLanguageClaims)) return false;
  if (!Array.isArray(activity.conceptIds) || !activity.conceptIds.length || !Array.isArray(activity.sourceIds) || !activity.sourceIds.length) return false;
  if (!["target", "interface"].includes(activity.answerLanguage)) return false;
  return true;
}

export function validateAdaptivePlanShape(plan) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return { valid: false, reason: "INVALID_PLAN_OBJECT" };
  if (!SAFE_ID.test(String(plan.planId || "")) || !SAFE_ID.test(String(plan.conceptId || ""))) return { valid: false, reason: "INVALID_PLAN_ID" };
  if (!ERROR_TYPES.includes(plan.diagnosis) || !STRATEGIES.includes(plan.strategy)) return { valid: false, reason: "INVALID_DIAGNOSIS_OR_STRATEGY" };
  if (finite(plan.diagnosisConfidence) == null || Number(plan.diagnosisConfidence) < 0 || Number(plan.diagnosisConfidence) > 1) return { valid: false, reason: "INVALID_CONFIDENCE" };
  if (!Array.isArray(plan.activities) || plan.activities.length < 1 || plan.activities.length > 4 || !plan.activities.every(activityShapeIsValid)) return { valid: false, reason: "INVALID_ACTIVITY_SEQUENCE" };
  if (!String(plan.studentFeedback || "").trim() || !String(plan.internalRationale || "").trim()) return { valid: false, reason: "MISSING_FEEDBACK_OR_RATIONALE" };
  if (allStrings(plan).some(value => FORBIDDEN_OUTPUT.test(value))) return { valid: false, reason: "FORBIDDEN_OUTPUT" };
  return { valid: true, reason: "VALID" };
}

function validateGrammarClaims(activity, grammarEngine) {
  let yellow = false;
  for (const claim of activity.grammarEngineClaims || []) {
    if (!grammarEngine) return { valid: false, reason: "GRAMMAR_ENGINE_UNAVAILABLE" };
    if (claim.kind === "verbForm") {
      const result = grammarEngine.getValidatedVerbForm(claim.verbId, claim.grammaticalPerson, { oralNasal: claim.oralNasal || undefined });
      if (result?.status !== "available" || normalized(result.form) !== normalized(claim.expectedText)) return { valid: false, reason: "GRAMMAR_ENGINE_FORM_REJECTED" };
      yellow = true;
    } else if (claim.kind === "sentenceStructure") {
      const result = grammarEngine.validateSentenceStructure({
        constructionType: claim.constructionType,
        ruleId: claim.ruleId || undefined,
        constituents: (claim.constituentRoles || []).map(role => ({ role })),
        tokensValidated: true
      });
      if (result?.status !== "valid") return { valid: false, reason: "GRAMMAR_ENGINE_STRUCTURE_REJECTED" };
      yellow = true;
    } else return { valid: false, reason: "UNSUPPORTED_GRAMMAR_CLAIM" };
  }
  return { valid: true, yellow };
}

function activityTypeValidation(activity) {
  const options = activity.options || [];
  if (["multiple-choice", "listening"].includes(activity.activityType)) {
    if (options.length < 2 || new Set(options.map(option => option.id)).size !== options.length) return { valid: false, reason: "INVALID_OPTIONS" };
    if (!options.some(option => normalized(option.text) === normalized(activity.correctAnswer))) return { valid: false, reason: "ANSWER_NOT_IN_OPTIONS" };
  }
  if (activity.activityType === "listening" && activity.media?.type !== "audio") return { valid: false, reason: "LISTENING_REQUIRES_APPROVED_AUDIO" };
  if (["fill-blank", "writing", "order-sentence"].includes(activity.activityType) && !String(activity.correctAnswer || "").trim()) return { valid: false, reason: "MISSING_CORRECT_ANSWER" };
  if (activity.activityType === "matching") {
    const groups = new Map();
    for (const option of options) {
      if (!option.pairId) return { valid: false, reason: "MATCHING_REQUIRES_PAIR_IDS" };
      if (!groups.has(option.pairId)) groups.set(option.pairId, []);
      groups.get(option.pairId).push(option);
    }
    if (groups.size < 2) return { valid: false, reason: "MATCHING_REQUIRES_PAIRS" };
    for (const pair of groups.values()) {
      if (pair.length !== 2 || new Set(pair.map(option => option.contentLanguage)).size !== 2) {
        return { valid: false, reason: "INVALID_MATCHING_PAIR" };
      }
    }
  }
  return { valid: true, reason: "VALID" };
}

function toRenderableActivity(activity, { planId, index, locale }) {
  const options = (activity.options || []).map(option => ({ id: option.id, label: option.text }));
  const correct = options.find(option => normalized(option.label) === normalized(activity.correctAnswer));
  const base = {
    id: `adaptive-${safeId(planId) || hash(planId).slice(0, 12)}-${index + 1}`,
    source: "openai-controlled-adaptive-plan",
    aiGenerated: true,
    generationVersion: ADAPTIVE_PLAN_VERSION,
    adaptivePlanId: planId,
    adaptivePlanIndex: index,
    validationStatus: "machineValidatedAgainstAuthorizedKnowledge",
    allowedForMastery: false,
    type: activity.activityType,
    activityType: activity.activityType,
    skill: activity.skill,
    difficulty: activity.difficulty,
    instruction: activity.instruction,
    prompt: activity.prompt,
    options,
    correctOptionId: correct?.id || "",
    acceptedAnswers: activity.correctAnswer ? [activity.correctAnswer] : [],
    audioText: activity.media?.type === "audio" ? activity.media.value : "",
    audio: activity.media?.type === "audio" ? activity.media.value : "",
    image: activity.media?.type === "image" ? activity.media.value : "",
    imageAlt: activity.media?.alt || "",
    hints: activity.hints,
    explanation: activity.explanation,
    conceptId: activity.conceptIds[0],
    conceptIds: activity.conceptIds,
    lexemeIds: activity.lexemeIds || [],
    grammarRuleIds: activity.grammarRuleIds || [],
    sourceIds: activity.sourceIds || [],
    context: `adaptive-plan:${planId}:${index + 1}:${locale}`
  };
  if (activity.activityType === "order-sentence") {
    base.tokens = options.map(option => ({ id: option.id, label: option.text }));
    const remaining = [...options];
    base.correctOrder = activity.correctAnswer.split(/\s+/).map(word => {
      const optionIndex = remaining.findIndex(option => normalized(option.label) === normalized(word));
      if (optionIndex < 0) return "";
      return remaining.splice(optionIndex, 1)[0].id;
    }).filter(Boolean);
  }
  if (activity.activityType === "fill-blank") base.template = activity.prompt.includes("{{blank}}") ? activity.prompt : `${activity.prompt} {{blank}}`;
  if (activity.activityType === "matching") {
    const groups = new Map();
    for (const option of activity.options) {
      if (!groups.has(option.pairId)) groups.set(option.pairId, []);
      groups.get(option.pairId).push(option);
    }
    base.pairs = [...groups].map(([pairId, pair]) => ({
      id: pairId,
      left: pair.find(option => option.contentLanguage === "target")?.text || "",
      right: pair.find(option => option.contentLanguage === "interface")?.text || ""
    }));
  }
  return base;
}

export function validateAdaptiveInterventionPlan(plan, {
  request,
  allowedKnowledge,
  grammarEngine,
  recentFingerprints = [],
  allowYellow = false
} = {}) {
  const shape = validateAdaptivePlanShape(plan);
  if (!shape.valid) return { valid: false, riskLevel: "RED", reason: shape.reason };
  if (plan.conceptId !== request.conceptId) return { valid: false, riskLevel: "RED", reason: "CONCEPT_MISMATCH" };
  const records = new Map(allowedKnowledge.map(record => [record.id, record]));
  const allowedSources = new Set(allowedKnowledge.flatMap(sourceIdsFor));
  if (!plan.validationMetadata || ids(plan.validationMetadata.sourceIds).some(id => !allowedSources.has(id))) {
    return { valid: false, riskLevel: "RED", reason: "PLAN_SOURCE_REFERENCE_REJECTED" };
  }
  const recent = new Set(recentFingerprints);
  if (request.previousFingerprint) recent.add(request.previousFingerprint);
  let riskLevel = "GREEN";
  const rendered = [];

  for (let index = 0; index < plan.activities.length; index += 1) {
    const activity = plan.activities[index];
    if (!activity.conceptIds.includes(request.conceptId) || activity.conceptIds.some(id => !request.allowedConceptIds.includes(id))) return { valid: false, riskLevel: "RED", reason: "ACTIVITY_CONCEPT_MISMATCH" };
    const referenceIds = [...ids(activity.lexemeIds), ...ids(activity.grammarRuleIds)];
    if (!referenceIds.length || referenceIds.some(id => !records.has(id))) return { valid: false, riskLevel: "RED", reason: "KNOWLEDGE_REFERENCE_REJECTED" };
    if (ids(activity.sourceIds).some(id => !allowedSources.has(id))) return { valid: false, riskLevel: "RED", reason: "SOURCE_REFERENCE_REJECTED" };
    const typeResult = activityTypeValidation(activity);
    if (!typeResult.valid) return { valid: false, riskLevel: "RED", reason: typeResult.reason };

    const claimTexts = new Set();
    for (const claim of activity.targetLanguageClaims) {
      if (!TARGET_CLAIM_TYPES.has(claim.claimType)) return { valid: false, riskLevel: "RED", reason: "INVALID_TARGET_CLAIM" };
      const record = records.get(claim.recordId);
      if (!record || !sourceIdsFor(record).includes(claim.sourceId)) return { valid: false, riskLevel: "RED", reason: "TARGET_CLAIM_AUTHORITY_REJECTED" };
      const inventory = linguisticInventory(record);
      if (["exactKnowledgeForm", "validatedExample"].includes(claim.claimType) && !inventory.has(normalized(claim.text))) return { valid: false, riskLevel: "RED", reason: "UNKNOWN_TARGET_LANGUAGE_CONTENT" };
      if (claim.claimType === "authorizedTemplate") {
        if (!inventory.has(normalized(claim.text))) return { valid: false, riskLevel: "RED", reason: "UNAUTHORIZED_TEMPLATE" };
        riskLevel = "YELLOW";
      }
      if (claim.claimType === "grammarEngineOutput") riskLevel = "YELLOW";
      claimTexts.add(normalized(claim.text));
    }

    if (activity.answerLanguage === "target" && !claimTexts.has(normalized(activity.correctAnswer))) return { valid: false, riskLevel: "RED", reason: "TARGET_ANSWER_NOT_VALIDATED" };
    for (const option of activity.options) {
      if (option.contentLanguage === "target" && !claimTexts.has(normalized(option.text))) return { valid: false, riskLevel: "RED", reason: "TARGET_OPTION_NOT_VALIDATED" };
      if (ids(option.sourceIds).some(id => !allowedSources.has(id))) return { valid: false, riskLevel: "RED", reason: "OPTION_SOURCE_REJECTED" };
    }
    if (activity.media?.type !== "none") {
      if (!allowedSources.has(activity.media.sourceId)) return { valid: false, riskLevel: "RED", reason: "UNAPPROVED_MEDIA_SOURCE" };
      if (activity.media.type === "audio" && !claimTexts.has(normalized(activity.media.value))) return { valid: false, riskLevel: "RED", reason: "UNAPPROVED_AUDIO_CONTENT" };
    }
    const grammarResult = validateGrammarClaims(activity, grammarEngine);
    if (!grammarResult.valid) return { valid: false, riskLevel: "RED", reason: grammarResult.reason };
    if (grammarResult.yellow) riskLevel = "YELLOW";

    const renderable = toRenderableActivity(activity, { planId: plan.planId, index, locale: request.uiLocale });
    const fingerprint = createActivityFingerprint(renderable, { uiLocale: request.uiLocale });
    if (recent.has(fingerprint)) return { valid: false, riskLevel: "RED", reason: "DUPLICATE_ACTIVITY" };
    recent.add(fingerprint);
    rendered.push({ ...renderable, fingerprint });
    if (index === 0 && renderable.type === request.activityType) riskLevel = "YELLOW";
  }

  if (riskLevel === "YELLOW" && !allowYellow) return { valid: false, riskLevel: "YELLOW", reason: "YELLOW_POLICY_NOT_ENABLED" };
  return {
    valid: true,
    riskLevel,
    reason: "VALIDATED",
    plan: {
      ...plan,
      version: ADAPTIVE_PLAN_VERSION,
      activities: rendered,
      validationMetadata: {
        ...plan.validationMetadata,
        riskLevel,
        validatedAt: new Date().toISOString(),
        validationPipeline: ["jsonSchema", "knowledgeBase", "grammarEngine", "activityTypeRules", "duplicateChecker", "allowedContent"]
      }
    }
  };
}

function sanitizeKnowledge(record) {
  const authorizedSenseIds = new Set(record?.normativeVerification?.authorizedSenseIds || []);
  const senses = Array.isArray(record?.senses)
    ? record.senses.filter(sense => record.validationStatus !== "normativeVerified" || authorizedSenseIds.has(sense.id))
    : undefined;
  return {
    id: record.id,
    recordType: record.recordType,
    validationStatus: record.validationStatus,
    lemma: record.lemma,
    lexeme: record.lexeme,
    normalizedForm: record.normalizedForm,
    sourceForms: record.sourceForms,
    forms: record.forms,
    senses,
    examples: record.examples,
    rule: record.rule,
    restrictions: record.restrictions,
    sourceIds: sourceIdsFor(record)
  };
}

function extractOutputText(response) {
  if (typeof response?.output_text === "string") return response.output_text;
  for (const item of response?.output || []) for (const content of item?.content || []) {
    if (content?.type === "output_text" && typeof content.text === "string") return content.text;
  }
  return "";
}

function profileSignature(request) {
  return hash({
    skill: request.currentSkill,
    difficulty: request.difficulty,
    diagnosis: request.localPlan?.errorType,
    attemptBucket: Math.min(3, request.attemptNumber),
    modalities: request.modalitiesAlreadyUsed.slice(-4),
    errorTypes: request.recentErrors.slice(-4).map(item => item.errorType),
    locale: request.uiLocale
  }).slice(0, 20);
}

export class AdaptivePlanCache {
  constructor({ maxEntries = 120, ttlMs = 6 * 60 * 60 * 1000, now = () => Date.now() } = {}) {
    this.maxEntries = maxEntries; this.ttlMs = ttlMs; this.now = now; this.entries = new Map();
  }
  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) { this.entries.delete(key); return null; }
    this.entries.delete(key); this.entries.set(key, entry); return structuredClone(entry.value);
  }
  set(key, value) {
    this.entries.delete(key); this.entries.set(key, { expiresAt: this.now() + this.ttlMs, value: structuredClone(value) });
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value);
  }
}

export function buildAdaptivePlanOpenAIRequest({ request, allowedKnowledge, model, safetyIdentifier }) {
  const activityCountGuidance = request.attemptNumber <= 1 ? "Prefer 1 or 2 activities unless the diagnosis clearly needs more." : "Use 2 or 3 activities for repeated errors; use 4 only for a clear prerequisite gap.";
  return {
    model,
    store: false,
    instructions: [
      "You are NALVI's private adaptive intervention planner, not a chatbot.",
      "The answer was already scored locally. Produce a short coherent plan of 1 to 4 activities; never award points or change mastery directly.",
      activityCountGuidance,
      "Use only the supplied normativeVerified or expertVerified knowledge with allowedForGeneration. For normativeVerified records use only the supplied concrete sense. Never invent Guarani forms, sentences, translations, audio, examples, or rules.",
      "Every Guarani fragment must appear in targetLanguageClaims and be traceable to one supplied record and source.",
      "Use grammarEngineClaims for computed forms or sentence structures; do not claim that validation has already passed.",
      "The first activity must differ from the failed activity in fingerprint and preferably in modality. The sequence must not contain duplicates.",
      `Write studentFeedback, instructions, hints, and explanations in UI locale ${request.uiLocale}. Keep them brief and pedagogical.`,
      "Do not output HTML, CSS, code, Firebase Rules, navigation, markdown, personal data, email, name, or institution."
    ].join(" "),
    input: JSON.stringify({
      task: "generateAdaptiveInterventionPlan",
      pedagogicalContext: {
        conceptId: request.conceptId,
        learningObjectiveId: request.learningObjectiveId,
        currentSkill: request.currentSkill,
        activityType: request.activityType,
        difficulty: request.difficulty,
        studentAnswer: request.studentAnswer,
        correctAnswer: request.correctAnswer,
        attemptNumber: request.attemptNumber,
        recentErrors: request.recentErrors,
        recentActivityFingerprints: request.recentActivityFingerprints,
        modalitiesAlreadyUsed: request.modalitiesAlreadyUsed,
        hintHistory: request.hintHistory,
        retentionHistory: request.retentionHistory,
        uiLocale: request.uiLocale,
        grammarRuleIds: request.grammarRuleIds,
        lexemeIds: request.lexemeIds,
        localDiagnosis: request.localPlan?.errorType,
        localStrategy: request.localPlan?.strategy
      },
      permittedKnowledge: allowedKnowledge.map(sanitizeKnowledge)
    }),
    max_output_tokens: 5000,
    text: { format: { type: "json_schema", name: "nalvi_adaptive_intervention_plan", strict: true, schema: ADAPTIVE_INTERVENTION_PLAN_SCHEMA } },
    prompt_cache_key: `nalvi-p8b-${hash(allowedKnowledge.map(record => record.id)).slice(0, 28)}`,
    safety_identifier: safetyIdentifier
  };
}

function fallbackPlan(request, reason) {
  const local = request.localPlan;
  const activities = local?.nextActivity ? [{ ...local.nextActivity, fingerprint: local.nextFingerprint }] : [];
  return {
    ok: true,
    mode: "fallback",
    usedAI: false,
    reason,
    adaptiveInterventionPlan: {
      version: ADAPTIVE_PLAN_VERSION,
      planId: `local-${hash({ conceptId: request.conceptId, reason, fingerprint: local?.nextFingerprint }).slice(0, 16)}`,
      conceptId: request.conceptId,
      diagnosis: local?.errorType || "UNKNOWN_ERROR",
      diagnosisConfidence: finite(local?.diagnosis?.confidence) ?? 0,
      strategy: local?.strategy || "CHANGE_MODALITY",
      studentFeedback: feedbackFallback[request.uiLocale] || feedbackFallback.es,
      internalRationale: reason,
      activities,
      retestPolicy: activities.length ? "after-plan" : "delayed",
      masteryRecommendation: request.attemptNumber > 1 ? "MARK_WEAK" : "AWAIT_RETEST",
      validationMetadata: { riskLevel: "GREEN", sourceIds: [], fallback: true, validationPipeline: ["localValidatedActivity", "duplicateChecker"] }
    }
  };
}

function costEstimate(usage, env) {
  const inputPrice = Number(env.OPENAI_INPUT_COST_PER_1M), outputPrice = Number(env.OPENAI_OUTPUT_COST_PER_1M);
  if (!Number.isFinite(inputPrice) || !Number.isFinite(outputPrice)) return { estimatedCostUsd: null, costEstimateStatus: "modelPricingNotConfigured" };
  return {
    estimatedCostUsd: (Number(usage?.input_tokens || 0) * inputPrice + Number(usage?.output_tokens || 0) * outputPrice) / 1_000_000,
    costEstimateStatus: "estimatedFromConfiguredRates"
  };
}

export function createAdaptivePlanEvent({ userId, request, result, telemetry }) {
  const plan = result.adaptiveInterventionPlan;
  return {
    eventKind: "adaptiveInterventionPlan",
    logicalCollection: "interventionEvents",
    userId,
    planId: plan.planId,
    conceptId: request.conceptId,
    learningObjectiveId: request.learningObjectiveId,
    diagnosis: plan.diagnosis,
    strategy: plan.strategy,
    activityCount: plan.activities.length,
    activityTypes: plan.activities.map(activity => activity.type || activity.activityType),
    activityFingerprints: plan.activities.map(activity => activity.fingerprint || createActivityFingerprint(activity, { uiLocale: request.uiLocale })),
    validationRiskLevel: plan.validationMetadata?.riskLevel || "GREEN",
    usedAI: result.usedAI,
    cacheHit: Boolean(result.cacheHit),
    uiLocale: request.uiLocale,
    attemptNumber: request.attemptNumber,
    masteryBefore: finite(request.masteryBefore),
    masteryAfter: finite(request.masteryAfter),
    aiCallCount: Number(telemetry.callCount || 0),
    aiInputTokens: Number(telemetry.inputTokens || 0),
    aiOutputTokens: Number(telemetry.outputTokens || 0),
    aiLatencyMs: Number(telemetry.latencyMs || 0),
    aiErrors: Number(telemetry.errors || 0),
    estimatedCostUsd: finite(telemetry.estimatedCostUsd),
    costEstimateStatus: telemetry.costEstimateStatus || "notApplicable",
    timestamp: new Date().toISOString()
  };
}

export function createAdaptiveInterventionPlanService({
  corpusRecords = [],
  grammarEngine = null,
  fetchImpl = globalThis.fetch,
  env = process.env,
  cache = new AdaptivePlanCache(),
  persistEvent = async () => ({ status: "skipped", reason: "PERSISTENCE_NOT_CONFIGURED" }),
  timeoutMs = 14_000
} = {}) {
  const counters = { requests: 0, aiCalls: 0, aiErrors: 0, cacheHits: 0, rejected: 0, persisted: 0 };

  async function generateAdaptiveInterventionPlan(request, { verifiedUserId = "" } = {}) {
    counters.requests += 1;
    const telemetry = { callCount: 0, inputTokens: 0, outputTokens: 0, latencyMs: 0, errors: 0, estimatedCostUsd: null, costEstimateStatus: "notApplicable" };
    const allowedKnowledge = filterAllowedKnowledge(corpusRecords, request.knowledgeIds);
    let result;
    if (!request.wouldAIImproveIntervention) result = fallbackPlan(request, "LOCAL_INTERVENTION_SUFFICIENT");
    else if (!allowedKnowledge.length) result = fallbackPlan(request, "NO_AUTHORIZED_GENERATION_KNOWLEDGE");
    else if (!verifiedUserId) result = fallbackPlan(request, "AUTH_REQUIRED");
    else if (!env.OPENAI_API_KEY) result = fallbackPlan(request, "OPENAI_NOT_CONFIGURED");
    else {
      const cacheKey = hash({
        version: ADAPTIVE_PLAN_VERSION,
        conceptId: request.conceptId,
        objective: request.learningObjectiveId,
        knowledgeIds: allowedKnowledge.map(record => record.id),
        profile: profileSignature(request),
        previous: request.previousFingerprint
      });
      const cached = cache.get(cacheKey);
      if (cached) {
        counters.cacheHits += 1;
        result = { ok: true, mode: "generated", usedAI: true, cacheHit: true, reason: "VALIDATED_CACHE_HIT", adaptiveInterventionPlan: cached };
      } else {
        telemetry.callCount = 1; counters.aiCalls += 1;
        const controller = new AbortController(), started = Date.now(), timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetchImpl("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify(buildAdaptivePlanOpenAIRequest({
              request,
              allowedKnowledge,
              model: env.OPENAI_MODEL || "gpt-4.1-mini",
              safetyIdentifier: hash(`nalvi:${verifiedUserId}`).slice(0, 64)
            })),
            signal: controller.signal
          });
          if (!response.ok) throw new Error(`OPENAI_HTTP_${response.status}`);
          const payload = await response.json();
          telemetry.inputTokens = Number(payload.usage?.input_tokens || 0);
          telemetry.outputTokens = Number(payload.usage?.output_tokens || 0);
          Object.assign(telemetry, costEstimate(payload.usage, env));
          let candidate;
          try { candidate = JSON.parse(extractOutputText(payload)); }
          catch { counters.rejected += 1; result = fallbackPlan(request, "OPENAI_INVALID_JSON"); }
          if (candidate) {
            const validation = validateAdaptiveInterventionPlan(candidate, {
              request,
              allowedKnowledge,
              grammarEngine,
              recentFingerprints: request.recentActivityFingerprints,
              allowYellow: env.NALVI_ALLOW_YELLOW_PLANS === "true"
            });
            if (!validation.valid) {
              counters.rejected += 1;
              result = fallbackPlan(request, `OPENAI_PLAN_REJECTED:${validation.riskLevel}:${validation.reason}`);
            } else {
              cache.set(cacheKey, validation.plan);
              result = { ok: true, mode: "generated", usedAI: true, cacheHit: false, reason: "VALIDATED_ADAPTIVE_PLAN", adaptiveInterventionPlan: validation.plan };
            }
          }
        } catch (error) {
          telemetry.errors = 1; counters.aiErrors += 1;
          result = fallbackPlan(request, error?.name === "AbortError" ? "OPENAI_TIMEOUT" : "OPENAI_UNAVAILABLE");
        } finally {
          clearTimeout(timer); telemetry.latencyMs = Date.now() - started;
        }
      }
    }

    const event = createAdaptivePlanEvent({ userId: verifiedUserId, request, result, telemetry });
    let persistence;
    try {
      persistence = await persistEvent({ userId: verifiedUserId, event });
      if (persistence?.status === "persisted") counters.persisted += 1;
    } catch { persistence = { status: "failed", reason: "PERSISTENCE_ERROR" }; }
    return { ...result, telemetry, persistence, event: { ...event, userId: undefined } };
  }

  return Object.freeze({
    generateAdaptiveInterventionPlan,
    audit: () => ({ ...counters, version: ADAPTIVE_PLAN_VERSION, apiKeyExposedToClient: false })
  });
}
