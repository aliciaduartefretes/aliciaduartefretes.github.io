import { createHash } from "node:crypto";

export const REINFORCEMENT_VERSION = "NALVI-P7B-REINFORCEMENT-1";
export const INTERFACE_LANGUAGES = Object.freeze(["es", "en", "pt", "fr", "it", "de"]);
export const RENDERABLE_ACTIVITY_TYPES = Object.freeze([
  "multiple-choice",
  "listening",
  "order-sentence",
  "fill-blank",
  "writing",
  "matching"
]);

const ALLOWED_SKILLS = new Set([
  "listening", "reading", "writing", "speaking", "vocabulary", "grammar", "application",
  "comprehension", "construction", "interaction", "grammar-awareness", "pronunciation-awareness"
]);
const BLOCKED_STATUSES = new Set(["unreviewed", "sourceVerified", "conflict", "rejected", "deprecated"]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
const FORBIDDEN_GENERATED_TEXT = /<\/?[a-z][^>]*>|```|<!doctype|\b(?:firebase\s+rules|function\s*\(|const\s+|let\s+|var\s+|import\s+|export\s+|<script|<style)\b/i;

const localizedTextSchema = {
  type: "object",
  additionalProperties: false,
  required: [...INTERFACE_LANGUAGES],
  properties: Object.fromEntries(INTERFACE_LANGUAGES.map(language => [language, { type: "string", minLength: 1, maxLength: 420 }]))
};

export const REINFORCEMENT_ACTIVITY_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "type", "courseId", "learningObjectiveId", "conceptIds", "knowledgeIds", "skill", "difficulty",
    "prompt", "instruction", "options", "correctOptionId", "audioText", "tokens", "correctOrder",
    "template", "acceptedAnswers", "pairs"
  ],
  properties: {
    type: { type: "string", enum: [...RENDERABLE_ACTIVITY_TYPES] },
    courseId: { type: "string", minLength: 1, maxLength: 64 },
    learningObjectiveId: { type: "string", minLength: 1, maxLength: 96 },
    conceptIds: { type: "array", minItems: 1, maxItems: 8, items: { type: "string", minLength: 1, maxLength: 96 } },
    knowledgeIds: { type: "array", minItems: 1, maxItems: 16, items: { type: "string", minLength: 1, maxLength: 96 } },
    skill: { type: "string", enum: [...ALLOWED_SKILLS] },
    difficulty: { type: "string", minLength: 1, maxLength: 64 },
    prompt: localizedTextSchema,
    instruction: localizedTextSchema,
    options: {
      type: "array", maxItems: 8,
      items: {
        type: "object", additionalProperties: false, required: ["id", "label"],
        properties: { id: { type: "string", minLength: 1, maxLength: 48 }, label: localizedTextSchema }
      }
    },
    correctOptionId: { type: "string", maxLength: 48 },
    audioText: { type: "string", maxLength: 240 },
    tokens: {
      type: "array", maxItems: 16,
      items: {
        type: "object", additionalProperties: false, required: ["id", "label"],
        properties: { id: { type: "string", minLength: 1, maxLength: 48 }, label: { type: "string", minLength: 1, maxLength: 80 } }
      }
    },
    correctOrder: { type: "array", maxItems: 16, items: { type: "string", minLength: 1, maxLength: 48 } },
    template: localizedTextSchema,
    acceptedAnswers: { type: "array", maxItems: 12, items: { type: "string", minLength: 1, maxLength: 240 } },
    pairs: {
      type: "array", maxItems: 10,
      items: {
        type: "object", additionalProperties: false, required: ["id", "left", "right"],
        properties: {
          id: { type: "string", minLength: 1, maxLength: 48 },
          left: { type: "string", minLength: 1, maxLength: 120 },
          right: localizedTextSchema
        }
      }
    }
  }
});

function safeId(value, field, { optional = false } = {}) {
  const normalized = String(value || "").trim();
  if (!normalized && optional) return "";
  if (!SAFE_ID.test(normalized)) throw new TypeError(`${field} no es un identificador válido.`);
  return normalized;
}

function uniqueIds(values, field, max = 16) {
  const list = [...new Set((Array.isArray(values) ? values : []).map(value => safeId(value, field)))];
  if (list.length > max) throw new RangeError(`${field} supera el máximo permitido.`);
  return list;
}

export function normalizeReinforcementRequest(input = {}) {
  const courseId = safeId(input.courseId || "general", "courseId");
  const learningObjectiveId = safeId(input.learningObjectiveId, "learningObjectiveId");
  const conceptIds = uniqueIds(input.conceptIds, "conceptIds", 8);
  if (!conceptIds.length) throw new TypeError("Se requiere al menos un conceptId.");
  const skill = String(input.skill || "").trim();
  if (!ALLOWED_SKILLS.has(skill)) throw new TypeError("skill no está autorizado.");
  const difficulty = safeId(input.difficulty || "foundation-1", "difficulty");
  const preferredActivityTypes = [...new Set((Array.isArray(input.preferredActivityTypes) ? input.preferredActivityTypes : [])
    .map(value => String(value || "").trim())
    .filter(value => RENDERABLE_ACTIVITY_TYPES.includes(value)))].slice(0, RENDERABLE_ACTIVITY_TYPES.length);
  const locale = INTERFACE_LANGUAGES.includes(input.locale) ? input.locale : "es";
  const adaptiveDecision = ["REVIEW", "REPEAT", "SIMPLIFY", "CHALLENGE", "REVIEW_LATER"].includes(input.adaptiveDecision)
    ? input.adaptiveDecision
    : "REVIEW";
  return Object.freeze({
    courseId,
    languageVariant: input.languageVariant === "gug-PY" ? "gug-PY" : "gug-PY",
    learningObjectiveId,
    conceptIds,
    knowledgeIds: uniqueIds(input.knowledgeIds, "knowledgeIds", 16),
    skill,
    difficulty,
    preferredActivityTypes,
    excludeActivityIds: uniqueIds(input.excludeActivityIds, "excludeActivityIds", 64),
    locale,
    adaptiveDecision
  });
}

export function filterAllowedKnowledge(records = [], requestedKnowledgeIds = []) {
  const requested = new Set(requestedKnowledgeIds);
  if (!requested.size) return [];
  return (Array.isArray(records) ? records : []).filter(record => {
    const id = String(record?.id || "");
    return requested.has(id)
      && record?.validationStatus === "expertVerified"
      && record?.allowedForGeneration === true
      && !BLOCKED_STATUSES.has(record?.validationStatus)
      && !record?.needsHumanReview
      && !record?.automaticUseBlocked
      && !(Array.isArray(record?.conflictIds) && record.conflictIds.length);
  });
}

function sanitizeKnowledgeRecord(record) {
  const selectedKeys = [
    "id", "recordType", "languageVariant", "name", "title", "description", "lemma", "lexeme",
    "underlyingForm", "surfaceForm", "forms", "morphemes", "rule", "rules", "examples",
    "restrictions", "constraints", "patternId", "person", "oralVariant", "nasalVariant"
  ];
  return Object.fromEntries(selectedKeys.filter(key => record[key] !== undefined).map(key => [key, record[key]]));
}

export function findExistingResolution(request, activities = []) {
  const excluded = new Set(request.excludeActivityIds || []);
  const preferred = new Set(request.preferredActivityTypes || []);
  const candidates = (Array.isArray(activities) ? activities : []).filter(activity => {
    if (!activity || excluded.has(activity.id) || activity.courseId !== request.courseId) return false;
    const objectiveMatches = activity.learningObjectiveId === request.learningObjectiveId;
    const conceptMatches = (activity.conceptIds || []).some(id => request.conceptIds.includes(id));
    return objectiveMatches || conceptMatches;
  }).map(activity => {
    let score = 0;
    if (activity.learningObjectiveId === request.learningObjectiveId) score += 8;
    score += (activity.conceptIds || []).filter(id => request.conceptIds.includes(id)).length * 4;
    if (activity.skill === request.skill) score += 3;
    if (activity.difficulty === request.difficulty) score += 2;
    if (!preferred.size || preferred.has(activity.type || activity.activityType)) score += 2;
    return { activity, score };
  }).sort((left, right) => right.score - left.score || String(left.activity.id).localeCompare(String(right.activity.id)));
  return candidates[0]?.activity || null;
}

function allStrings(value, output = []) {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) value.forEach(item => allStrings(item, output));
  else if (value && typeof value === "object") Object.values(value).forEach(item => allStrings(item, output));
  return output;
}

function localizedObjectIsValid(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    && INTERFACE_LANGUAGES.every(language => typeof value[language] === "string" && value[language].trim());
}

export function validateGeneratedActivity(activity, request, allowedKnowledge) {
  if (!activity || typeof activity !== "object" || Array.isArray(activity)) return { valid: false, reason: "INVALID_OBJECT" };
  const allowedKnowledgeIds = new Set(allowedKnowledge.map(record => record.id));
  const knowledgeIds = Array.isArray(activity.knowledgeIds) ? activity.knowledgeIds : [];
  const baseValid = RENDERABLE_ACTIVITY_TYPES.includes(activity.type)
    && activity.courseId === request.courseId
    && activity.learningObjectiveId === request.learningObjectiveId
    && Array.isArray(activity.conceptIds)
    && activity.conceptIds.length > 0
    && activity.conceptIds.every(id => request.conceptIds.includes(id))
    && knowledgeIds.length > 0
    && knowledgeIds.every(id => allowedKnowledgeIds.has(id))
    && activity.skill === request.skill
    && activity.difficulty === request.difficulty
    && localizedObjectIsValid(activity.prompt)
    && localizedObjectIsValid(activity.instruction);
  if (!baseValid) return { valid: false, reason: "TARGET_OR_AUTHORITY_MISMATCH" };
  if (allStrings(activity).some(value => FORBIDDEN_GENERATED_TEXT.test(value))) return { valid: false, reason: "FORBIDDEN_OUTPUT" };

  if (["multiple-choice", "listening"].includes(activity.type)) {
    const ids = (activity.options || []).map(option => option?.id);
    if (ids.length < 2 || new Set(ids).size !== ids.length || !ids.includes(activity.correctOptionId)) return { valid: false, reason: "INVALID_OPTIONS" };
    if (activity.type === "listening" && !String(activity.audioText || "").trim()) return { valid: false, reason: "MISSING_AUDIO_TEXT" };
  }
  if (activity.type === "order-sentence") {
    const tokenIds = (activity.tokens || []).map(token => token?.id);
    if (tokenIds.length < 2 || activity.correctOrder?.length !== tokenIds.length || activity.correctOrder.some(id => !tokenIds.includes(id))) return { valid: false, reason: "INVALID_ORDER" };
  }
  if (["fill-blank", "writing"].includes(activity.type)) {
    if (!Array.isArray(activity.acceptedAnswers) || !activity.acceptedAnswers.length) return { valid: false, reason: "MISSING_ACCEPTED_ANSWERS" };
    if (activity.type === "fill-blank" && !INTERFACE_LANGUAGES.every(language => String(activity.template?.[language] || "").includes("{{blank}}"))) return { valid: false, reason: "INVALID_TEMPLATE" };
  }
  if (activity.type === "matching" && (!Array.isArray(activity.pairs) || activity.pairs.length < 2)) return { valid: false, reason: "INVALID_PAIRS" };
  return { valid: true, reason: "VALID" };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function hash(value) {
  return createHash("sha256").update(typeof value === "string" ? value : stableJson(value)).digest("hex");
}

function extractOutputText(response) {
  if (typeof response?.output_text === "string") return response.output_text;
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return "";
}

export class ReinforcementCache {
  constructor({ maxEntries = 200, ttlMs = 24 * 60 * 60 * 1000, now = () => Date.now() } = {}) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
    this.now = now;
    this.entries = new Map();
  }
  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) { this.entries.delete(key); return null; }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return structuredClone(entry.value);
  }
  set(key, value) {
    this.entries.delete(key);
    this.entries.set(key, { expiresAt: this.now() + this.ttlMs, value: structuredClone(value) });
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value);
  }
}

function fallback(reason, detail = {}) {
  return { ok: true, mode: "fallback", canResolveWithoutAI: false, reason, fallbackAction: "continue-existing-route", activity: null, ...detail };
}

export function buildOpenAIRequest({ model, request, allowedKnowledge, safetyIdentifier }) {
  const permittedKnowledge = allowedKnowledge.map(sanitizeKnowledgeRecord);
  const instructions = [
    "You are the private reinforcement-activity generator inside NALVI.",
    "Return exactly one JSON activity matching the supplied JSON Schema.",
    "Use only the permitted expert-verified knowledge in the input. Never add a Guarani form, rule, answer, example, or translation from memory.",
    "Do not output HTML, CSS, code, Firebase Rules, navigation, markdown, explanations, or chat text.",
    "All answer keys must be fully supported by the permitted knowledge IDs and the activity must target the supplied objective, concepts, skill, and difficulty.",
    "Use all six interface-language fields for interface instructions. Keep Guarani learning material unchanged across locales when translation would alter the linguistic evidence."
  ].join(" ");
  return {
    model,
    store: false,
    instructions,
    input: JSON.stringify({
      task: "generateReinforcementActivity",
      target: request,
      permittedKnowledge
    }),
    max_output_tokens: 1800,
    text: {
      format: {
        type: "json_schema",
        name: "nalvi_reinforcement_activity",
        strict: true,
        schema: REINFORCEMENT_ACTIVITY_SCHEMA
      }
    },
    prompt_cache_key: `nalvi-p7b-${hash(permittedKnowledge).slice(0, 32)}`,
    safety_identifier: safetyIdentifier
  };
}

export function createReinforcementService({
  corpusRecords = [],
  existingActivities = [],
  fetchImpl = globalThis.fetch,
  env = process.env,
  cache = new ReinforcementCache(),
  timeoutMs = 12000
} = {}) {
  let openAICallCount = 0;

  async function generateReinforcementActivity(rawRequest, { verifiedUserId = "" } = {}) {
    let request;
    try { request = normalizeReinforcementRequest(rawRequest); }
    catch (error) { return { ok: false, mode: "rejected", canResolveWithoutAI: true, reason: "INVALID_REQUEST", message: error.message }; }

    const existing = findExistingResolution(request, existingActivities);
    if (existing) {
      return {
        ok: true,
        mode: "existing",
        canResolveWithoutAI: true,
        reason: "EXISTING_ACTIVITY_AVAILABLE",
        existingActivityId: existing.id,
        activity: null
      };
    }

    const allowedKnowledge = filterAllowedKnowledge(corpusRecords, request.knowledgeIds);
    if (!allowedKnowledge.length) return fallback("NO_EXPERT_VERIFIED_GENERATION_KNOWLEDGE");
    if (!verifiedUserId) return fallback("AUTH_REQUIRED");
    if (!env.OPENAI_API_KEY || !env.OPENAI_MODEL) return fallback("OPENAI_NOT_CONFIGURED");

    const cacheKey = hash({ version: REINFORCEMENT_VERSION, request, knowledge: allowedKnowledge.map(record => record.id) });
    const cached = cache.get(cacheKey);
    if (cached) return { ok: true, mode: "generated", canResolveWithoutAI: false, cacheHit: true, activity: cached };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      openAICallCount += 1;
      const response = await fetchImpl("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Authorization": `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildOpenAIRequest({
          model: env.OPENAI_MODEL,
          request,
          allowedKnowledge,
          safetyIdentifier: hash(`nalvi:${verifiedUserId}`).slice(0, 64)
        })),
        signal: controller.signal
      });
      if (!response.ok) return fallback("OPENAI_REQUEST_FAILED", { upstreamStatus: response.status });
      const raw = await response.json();
      const text = extractOutputText(raw);
      let activity;
      try { activity = JSON.parse(text); }
      catch { return fallback("OPENAI_INVALID_JSON"); }
      const validation = validateGeneratedActivity(activity, request, allowedKnowledge);
      if (!validation.valid) return fallback("OPENAI_OUTPUT_REJECTED", { validationReason: validation.reason });
      const finalActivity = {
        ...activity,
        id: `ai-reinforcement-${cacheKey.slice(0, 16)}`,
        activityType: activity.type,
        source: "openai-controlled-reinforcement",
        aiGenerated: true,
        generationVersion: REINFORCEMENT_VERSION,
        validationStatus: "machineValidatedAgainstExpertKnowledge",
        allowedForMastery: false
      };
      cache.set(cacheKey, finalActivity);
      return { ok: true, mode: "generated", canResolveWithoutAI: false, cacheHit: false, activity: finalActivity };
    } catch (error) {
      return fallback(error?.name === "AbortError" ? "OPENAI_TIMEOUT" : "OPENAI_UNAVAILABLE");
    } finally {
      clearTimeout(timeout);
    }
  }

  return Object.freeze({
    generateReinforcementActivity,
    audit: () => ({
      version: REINFORCEMENT_VERSION,
      authorizedFunction: "generateReinforcementActivity",
      corpusRecords: corpusRecords.length,
      expertGenerationRecords: corpusRecords.filter(record => record?.validationStatus === "expertVerified" && record?.allowedForGeneration === true).length,
      existingActivities: existingActivities.length,
      openAICallCount,
      apiKeyExposedToClient: false
    })
  });
}
