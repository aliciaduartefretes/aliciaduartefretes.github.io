import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createActivityFingerprint, classifyError } from "../intervention-engine/intervention-engine.mjs";
import { INTERVENTION_CONFIG } from "../intervention-engine/intervention-config.mjs";
import { filterAllowedKnowledge } from "./reinforcement-engine.mjs";
import { ADAPTIVE_TUTOR_CRITIC_SCHEMA, ADAPTIVE_TUTOR_PLAN_SCHEMA } from "./adaptive-tutor-schema.mjs";
import { answerLeakageDetected, planMetrics, validatePedagogicalQuality } from "./adaptive-tutor-quality.mjs";

export const ADAPTIVE_TUTOR_VERSION = "NALVI-TUTOR-1";
const plannerPrompt = readFileSync(new URL("../prompts/nalvi-tutor-planner-v1.md", import.meta.url), "utf8");
const criticPrompt = readFileSync(new URL("../prompts/nalvi-tutor-critic-v1.md", import.meta.url), "utf8");
const LOCALES = new Set(["es", "en", "pt", "fr", "it", "de"]);
const hash = value => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const normalize = value => String(value ?? "").normalize("NFC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
const localize = (value, locale) => value && typeof value === "object" && !Array.isArray(value) ? String(value[locale] ?? value.es ?? value.en ?? Object.values(value)[0] ?? "") : String(value ?? "");
const localizedCopy = Object.freeze({
  es: { feedback: "No del todo. Probemos de otra forma.", loading: "Preparando otra forma de practicar…", listen: "Escucha y elige la expresión correcta.", choose: "Elige la respuesta que corresponde.", complete: "Completa el significado.", missing: "Escribe solo la palabra que falta.", recall: "Ahora escribe la respuesta completa.", partial: "Pista:", context: "Estamos practicando esta pregunta:", example: "Observa este ejemplo antes de volver a intentarlo.", retest: "Ahora responde de forma independiente." },
  en: { feedback: "Not quite. Let’s try another way.", loading: "Preparing another way to practise…", listen: "Listen and choose the correct expression.", choose: "Choose the matching answer.", complete: "Complete the meaning.", missing: "Write only the missing word.", recall: "Now write the complete answer.", partial: "Hint:", context: "We are practising this question:", example: "Study this example before trying independently.", retest: "Now answer independently." },
  pt: { feedback: "Ainda não. Vamos tentar de outra forma.", loading: "Preparando outra forma de praticar…", listen: "Ouça e escolha a expressão correta.", choose: "Escolha a resposta correspondente.", complete: "Complete o significado.", missing: "Escreva apenas a palavra que falta.", recall: "Agora escreva a resposta completa.", partial: "Pista:", context: "Estamos praticando esta pergunta:", example: "Observe este exemplo antes de tentar sozinho.", retest: "Agora responda de forma independente." },
  fr: { feedback: "Pas tout à fait. Essayons autrement.", loading: "Préparation d’une autre façon de pratiquer…", listen: "Écoutez et choisissez l’expression correcte.", choose: "Choisissez la réponse correspondante.", complete: "Complétez le sens.", missing: "Écrivez uniquement le mot manquant.", recall: "Écrivez maintenant la réponse complète.", partial: "Indice :", context: "Nous travaillons cette question :", example: "Observez cet exemple avant de réessayer seul.", retest: "Répondez maintenant sans aide." },
  it: { feedback: "Non proprio. Proviamo in un altro modo.", loading: "Preparazione di un altro modo per esercitarsi…", listen: "Ascolta e scegli l’espressione corretta.", choose: "Scegli la risposta corrispondente.", complete: "Completa il significato.", missing: "Scrivi solo la parola mancante.", recall: "Ora scrivi la risposta completa.", partial: "Indizio:", context: "Stiamo esercitando questa domanda:", example: "Osserva questo esempio prima di riprovare da solo.", retest: "Ora rispondi senza aiuto." },
  de: { feedback: "Noch nicht ganz. Versuchen wir es anders.", loading: "Eine andere Übungsform wird vorbereitet…", listen: "Höre zu und wähle den richtigen Ausdruck.", choose: "Wähle die passende Antwort.", complete: "Vervollständige die Bedeutung.", missing: "Schreibe nur das fehlende Wort.", recall: "Schreibe jetzt die vollständige Antwort.", partial: "Hinweis:", context: "Wir üben diese Frage:", example: "Sieh dir dieses Beispiel an, bevor du es selbst versuchst.", retest: "Antworte jetzt selbstständig." }
});

const sourceIdsFor = record => [...new Set((record?.sourceReferences || []).map(item => item.sourceId).filter(Boolean))];
function knowledgeInventory(records) {
  const values = new Set();
  for (const record of records) {
    const forms = Array.isArray(record.forms) ? record.forms : Object.values(record.forms || {});
    const sourceForms = Array.isArray(record.sourceForms) ? record.sourceForms : Object.values(record.sourceForms || {});
    [record.lemma, record.lexeme, record.normalizedForm, ...forms, ...sourceForms].forEach(value => value && values.add(normalize(value)));
    for (const sense of record.senses || []) {
      [sense.form, sense.glossEs, sense.definitionGuarani, ...Object.values(sense.glosses || {}), ...Object.values(sense.meanings || {})].forEach(value => value && values.add(normalize(value)));
    }
    for (const example of record.examples || []) [example.text, example.gu, example.target].forEach(value => value && values.add(normalize(value)));
  }
  return values;
}

function lessonInventory(context) {
  const activity = context.activity || {}, values = new Set();
  [context.correctAnswer, activity.audioText, activity.answer, activity.prompt, activity.instruction, activity.template].forEach(value => {
    const localized = localize(value, context.uiLocale); if (localized) values.add(normalize(localized));
  });
  for (const option of activity.options || []) {
    const value = localize(option?.label ?? option?.value ?? option, context.uiLocale); if (value) values.add(normalize(value));
  }
  return values;
}

export function determineLinguisticMode(context, allowedKnowledge) {
  if (allowedKnowledge.length) return "NORMATIVE_GENERATIVE";
  const inventory = lessonInventory(context);
  if (normalize(context.correctAnswer) && inventory.has(normalize(context.correctAnswer))) return "LESSON_BOUNDED";
  return "BLOCKED";
}

function pseudonymizedContext(context, mode) {
  return {
    conceptId: context.conceptId, learningObjectiveId: context.learningObjectiveId,
    currentSkill: context.currentSkill, activityType: context.activityType, difficulty: context.difficulty,
    studentAnswer: context.studentAnswer, correctAnswer: context.correctAnswer,
    attemptNumber: context.attemptNumber, recentErrors: context.recentErrors,
    recentActivityFingerprints: context.recentActivityFingerprints,
    modalitiesAlreadyUsed: context.modalitiesAlreadyUsed, hintHistory: context.hintHistory,
    retentionHistory: context.retentionHistory, strategyEffectiveness: context.strategyEffectiveness || {},
    uiLocale: context.uiLocale, grammarRuleIds: context.grammarRuleIds, lexemeIds: context.lexemeIds,
    previousActivityFingerprint: context.previousActivityFingerprint || context.previousFingerprint,
    linguisticMode: mode,
    lessonMaterial: mode === "LESSON_BOUNDED" ? {
      prompt: localize(context.activity?.prompt, context.uiLocale),
      instruction: localize(context.activity?.instruction, context.uiLocale),
      options: (context.activity?.options || []).map(option => localize(option?.label ?? option?.value ?? option, context.uiLocale)),
      audioText: context.activity?.audioText || "", correctAnswer: context.correctAnswer
    } : undefined
  };
}

function optionObjects(context) {
  const options = (context.activity?.options || []).map((option, index) => ({
    id: String(option?.id ?? `option-${index}`), text: localize(option?.label ?? option?.value ?? option, context.uiLocale)
  })).filter(option => option.text);
  if (!options.some(option => normalize(option.text) === normalize(context.correctAnswer)) && context.correctAnswer) options.push({ id: "target", text: context.correctAnswer });
  return options;
}

function rotate(values, amount) {
  if (values.length < 2) return values;
  const offset = Math.abs(amount) % values.length;
  return [...values.slice(offset), ...values.slice(0, offset)];
}

function quotedFocus(value) {
  const match = String(value || "").match(/[«“„\"]([^»”“\"]+)[»”"“]/);
  return match?.[1]?.trim() || "";
}

function guidedCompletion(answer, focus) {
  const parts = String(answer || "").trim().split(/\s+/), raw = parts.pop() || "";
  const match = raw.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}'’\-]+)([^\p{L}\p{N}]*)$/u);
  const word = match?.[2] || raw;
  const masked = `${match?.[1] || ""}${"_".repeat(Math.max(4, Array.from(word).length))}${match?.[3] || ""}`;
  return { missing: word, template: `${focus ? `“${focus}” = ` : ""}${[...parts, masked].join(" ")}`.trim() };
}

function baseActivity(context, index, overrides = {}) {
  return {
    id: `tutor-${context.conceptId}-${context.attemptNumber}-${index}`,
    activityType: "writing", skill: context.currentSkill || "vocabulary", difficulty: context.difficulty || "foundation-1",
    helpLevel: 0, answerExposure: "HIDDEN", requiresStudentResponse: true,
    instruction: "", prompt: "", options: [], pairs: [], tokens: [],
    media: { type: "none", value: "", alt: "", sourceId: "" }, hints: [], explanation: "",
    correctAnswer: context.correctAnswer, conceptIds: [context.conceptId], lexemeIds: context.lexemeIds || [],
    grammarRuleIds: context.grammarRuleIds || [], sourceIds: [], fingerprintSeed: `${context.conceptId}-${context.attemptNumber}-${index}`,
    ...overrides
  };
}

export function createProfessionalFallbackPlan(context, { reason = "PROFESSIONAL_LOCAL_FALLBACK", linguisticMode = "LESSON_BOUNDED" } = {}) {
  const locale = LOCALES.has(context.uiLocale) ? context.uiLocale : "es", copy = localizedCopy[locale], attempt = Math.max(1, Number(context.attemptNumber) || 1);
  const diagnosis = classifyError({ ...context, correct: false });
  const options = rotate(optionObjects(context), attempt);
  const sourcePrompt = localize(context.activity?.lessonContext?.sourcePrompt || context.activity?.prompt || context.activity?.instruction, locale).trim();
  const sourceInstruction = localize(context.activity?.lessonContext?.sourceInstruction || context.activity?.instruction, locale).trim();
  const lessonContext = { sourcePrompt, sourceInstruction };
  const activities = [];
  if (attempt === 1 && context.currentSkill === "writing" && options.length >= 2) {
    const cue = Array.from(String(context.correctAnswer || ""))[0] || "";
    activities.push(baseActivity(context, 1, {
      activityType: "multiple-choice", skill: "vocabulary", helpLevel: 1, answerExposure: "HIDDEN",
      instruction: copy.choose, prompt: sourcePrompt || copy.choose, options,
      hints: cue ? [`${cue}…`] : [], lessonContext,
      fingerprintSeed: `recognition-after-writing-${context.conceptId}-${attempt}`
    }));
  } else if (attempt <= 2 && context.correctAnswer) {
    const completion = guidedCompletion(context.correctAnswer, attempt === 1 ? (quotedFocus(sourcePrompt) || sourcePrompt) : "");
    const cue = Array.from(completion.missing)[0] || "";
    activities.push(baseActivity(context, 1, {
      activityType: "fill-blank", skill: "writing", helpLevel: 2, answerExposure: "PARTIAL_HINT",
      instruction: copy.missing, prompt: copy.complete, template: completion.template,
      acceptedAnswers: [completion.missing, context.correctAnswer], hints: cue ? [`${cue}…`] : [], lessonContext,
      fingerprintSeed: `guided-meaning-${context.conceptId}-${attempt}`
    }));
  } else {
    const exposure = attempt >= 4 ? "EXPLICIT_SOLUTION" : "WORKED_EXAMPLE";
    activities.push(baseActivity(context, 1, {
      activityType: "writing", skill: "vocabulary", helpLevel: attempt >= 4 ? 4 : 3,
      answerExposure: exposure, requiresStudentResponse: false,
      instruction: copy.example, prompt: copy.example,
      explanation: `${sourcePrompt} — ${context.correctAnswer}`,
      lessonContext,
      fingerprintSeed: `worked-example-${context.conceptId}-${attempt}`
    }));
    activities.push(baseActivity(context, 2, {
      activityType: context.currentSkill === "writing" && options.length >= 2 ? "listening" : "writing",
      skill: context.currentSkill === "writing" ? "listening" : "writing", helpLevel: 0,
      answerExposure: "HIDDEN", instruction: copy.retest, prompt: copy.retest,
      options: context.currentSkill === "writing" ? options : [],
      media: context.currentSkill === "writing" ? { type: "audio", value: context.correctAnswer, alt: copy.listen, sourceId: "lesson-bounded" } : { type: "none", value: "", alt: "", sourceId: "" },
      lessonContext,
      fingerprintSeed: `independent-retest-${context.conceptId}-${attempt}`
    }));
  }
  return {
    planVersion: ADAPTIVE_TUTOR_VERSION, planId: `fallback-${hash({ concept: context.conceptId, attempt, reason }).slice(0, 16)}`,
    conceptId: context.conceptId, linguisticMode,
    diagnosis: { errorType: diagnosis.errorType, likelyDifficulty: diagnosis.source, confidence: diagnosis.confidence, prerequisiteGap: attempt >= 3 ? "possible" : null, skillAffected: context.currentSkill || "vocabulary" },
    pedagogicalGoal: "Teach the same concept through a different, progressively supported retrieval task.",
    strategy: { primaryStrategy: attempt === 1 ? "CHANGE_MODALITY" : attempt === 2 ? "RETRIEVAL_CUE" : "SHOW_WORKED_EXAMPLE", secondaryStrategy: attempt >= 3 ? "DELAYED_RETEST" : null, reasonCode: `attempt-${attempt}-${context.currentSkill || "vocabulary"}` },
    studentFeedback: { locale, shortMessage: copy.feedback }, activities,
    progressionPolicy: { onIncorrect: "BLOCK_AND_INTERVENE", onGuidedCorrect: "CONTINUE_PRACTICE", requiresIndependentRetest: true, maxInterventionsBeforeDefer: INTERVENTION_CONFIG.maxInterventionsBeforeDefer },
    fallbackPolicy: { strategy: "PROFESSIONAL_LOCAL_TEMPLATE", reason },
    validationMetadata: { sourceIds: [], knowledgeIds: context.knowledgeIds || [], claimedRiskLevel: "GREEN" }
  };
}

function toRenderable(activity, context, planId, index) {
  const options = (activity.options || []).map((option, optionIndex) => {
    const value = localize(option?.text ?? option?.label ?? option?.value ?? option, context.uiLocale);
    return { id: String(option?.id || `option-${optionIndex}`), label: value, value };
  }).filter(option => option.label);
  const correct = options.find(option => normalize(option.value) === normalize(activity.correctAnswer));
  const type = activity.activityType;
  const sourcePrompt = localize(activity.lessonContext?.sourcePrompt || context.activity?.lessonContext?.sourcePrompt || context.activity?.prompt || context.activity?.instruction, context.uiLocale).trim();
  const sourceInstruction = localize(activity.lessonContext?.sourceInstruction || context.activity?.lessonContext?.sourceInstruction || context.activity?.instruction, context.uiLocale).trim();
  let template = type === "fill-blank" ? localize(activity.template, context.uiLocale) : "";
  const visibleFillContext = template.replace(/\{\{blank\}\}|_+/g, "").replace(/[→:;,.!?¿¡\s-]+/g, "").trim();
  if (type === "fill-blank" && !visibleFillContext) template = `${sourcePrompt || localizedCopy[context.uiLocale]?.context || localizedCopy.es.context} → {{blank}}`;
  return {
    ...activity, type, id: activity.id || `${planId}-activity-${index + 1}`,
    conceptId: activity.conceptIds?.[0] || context.conceptId, learningObjectiveId: context.learningObjectiveId,
    options, correctOptionId: correct?.id || "", acceptedAnswers: activity.acceptedAnswers?.length ? activity.acceptedAnswers : activity.correctAnswer ? [activity.correctAnswer] : [],
    pairs: activity.pairs || [], tokens: (activity.tokens || []).map(token => ({ id: token.id, label: token.text })),
    correctOrder: (activity.tokens || []).map(token => token.id),
    template, audioText: activity.media?.type === "audio" ? activity.media.value : "",
    audio: activity.media?.type === "audio" ? activity.media.value : "", image: activity.media?.type === "image" ? activity.media.value : "",
    imageAlt: activity.media?.alt || "", lessonContext: { sourcePrompt, sourceInstruction }, nalviGuided: Number(activity.helpLevel) > 0,
    independentRetest: Number(activity.helpLevel) === 0 && activity.answerExposure === "HIDDEN",
    context: `adaptive-tutor:${planId}:${index + 1}`
  };
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const output of payload?.output || []) for (const content of output.content || []) if (content.type === "output_text") return content.text;
  return "";
}

async function callResponses({ fetchImpl, apiKey, model, schema, schemaName, instructions, input, safetyIdentifier, timeoutMs }) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs), started = Date.now();
  try {
    const response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, signal: controller.signal,
      body: JSON.stringify({ model, store: false, instructions, input: JSON.stringify(input), max_output_tokens: 5200,
        text: { format: { type: "json_schema", name: schemaName, strict: true, schema } }, safety_identifier: safetyIdentifier })
    });
    if (!response.ok) throw new Error(`OPENAI_HTTP_${response.status}`);
    const payload = await response.json(), text = extractOutputText(payload);
    return { value: JSON.parse(text), usage: payload.usage || {}, latencyMs: Date.now() - started };
  } finally { clearTimeout(timer); }
}

export async function critiqueAdaptiveTutorPlan({ plan, context, permittedKnowledge, fetchImpl = globalThis.fetch, env = process.env, safetyIdentifier = "anonymous", timeoutMs = 9000 } = {}) {
  return callResponses({
    fetchImpl,
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_TUTOR_MODEL || env.OPENAI_MODEL || "gpt-4.1-mini",
    schema: ADAPTIVE_TUTOR_CRITIC_SCHEMA,
    schemaName: "nalvi_adaptive_tutor_critic",
    instructions: criticPrompt,
    input: {
      context,
      plan,
      deterministicValidation: { valid: true },
      permittedKnowledge
    },
    safetyIdentifier,
    timeoutMs
  });
}

function percentile(values, percentileValue) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1))];
}

function estimateCostUsd(telemetry, env) {
  const inputPerMillion = Math.max(0, Number(env.OPENAI_TUTOR_INPUT_USD_PER_MILLION) || 0);
  const outputPerMillion = Math.max(0, Number(env.OPENAI_TUTOR_OUTPUT_USD_PER_MILLION) || 0);
  return Number((((telemetry.inputTokens * inputPerMillion) + (telemetry.outputTokens * outputPerMillion)) / 1_000_000).toFixed(6));
}

function validateLinguisticContent(plan, context, mode, allowedKnowledge) {
  if (mode === "BLOCKED") return { valid: false, reason: "LINGUISTIC_MODE_BLOCKED" };
  const inventory = mode === "NORMATIVE_GENERATIVE" ? knowledgeInventory(allowedKnowledge) : lessonInventory(context);
  const sourceIds = new Set(allowedKnowledge.flatMap(sourceIdsFor));
  for (const activity of plan.activities || []) {
    if ((activity.lexemeIds || []).some(id => !allowedKnowledge.some(record => record.id === id)) && mode === "NORMATIVE_GENERATIVE") return { valid: false, reason: "UNAUTHORIZED_LEXEME" };
    if ((activity.sourceIds || []).some(id => !sourceIds.has(id)) && mode === "NORMATIVE_GENERATIVE") return { valid: false, reason: "UNAUTHORIZED_SOURCE" };
    const targetValues = [activity.correctAnswer, ...(activity.options || []).map(option => option.text), ...(activity.pairs || []).flatMap(pair => [pair.left, pair.right]), ...(activity.tokens || []).map(token => token.text), activity.media?.type === "audio" ? activity.media.value : ""].filter(Boolean);
    if (mode === "LESSON_BOUNDED" && targetValues.some(value => !inventory.has(normalize(value)))) return { valid: false, reason: "LESSON_BOUNDARY_EXCEEDED" };
    if (mode === "NORMATIVE_GENERATIVE" && normalize(activity.correctAnswer) && !inventory.has(normalize(activity.correctAnswer))) return { valid: false, reason: "INVALID_LINGUISTIC_CONTENT" };
  }
  return { valid: true, reason: "VALIDATED" };
}

function validateAndRender(plan, context, mode, allowedKnowledge) {
  if (!plan || plan.planVersion !== ADAPTIVE_TUTOR_VERSION || plan.conceptId !== context.conceptId || plan.linguisticMode !== mode) return { valid: false, reasons: ["INVALID_PLAN_SHAPE"] };
  const linguistic = validateLinguisticContent(plan, context, mode, allowedKnowledge);
  if (!linguistic.valid) return { valid: false, reasons: [linguistic.reason] };
  const rendered = plan.activities.map((activity, index) => toRenderable(activity, context, plan.planId, index));
  const candidate = { ...plan, activities: rendered };
  const quality = validatePedagogicalQuality(candidate, context);
  if (answerLeakageDetected(candidate, context)) quality.reasons.push("ANSWER_VISIBLE_TOO_EARLY");
  const reasons = [...new Set(quality.reasons)];
  if (reasons.length) return { valid: false, reasons };
  return { valid: true, plan: { ...candidate, validationMetadata: { ...candidate.validationMetadata, validatedAt: new Date().toISOString(), validationPipeline: ["strictStructuredOutput", "knowledgeBoundary", "pedagogicalQuality", "answerLeakage", "duplicateChecker"] } } };
}

export function createAdaptiveTutorOrchestrator({ corpusRecords = [], fetchImpl = globalThis.fetch, env = process.env, persistEvent = async () => ({ status: "skipped" }) } = {}) {
  const counters = { requests: 0, aiCalls: 0, criticCalls: 0, revisions: 0, fallbacks: 0, accepted: 0, rejected: 0, totalLatencyMs: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, totalPlanLength: 0, latencies: [], helpDistribution: {}, errorStrategyMatrix: {} };
  async function orchestrateAdaptiveTutoring(context, { verifiedUserId = "", requesterHash = "anonymous" } = {}) {
    counters.requests += 1;
    const allowedKnowledge = filterAllowedKnowledge(corpusRecords, context.knowledgeIds || []), mode = determineLinguisticMode(context, allowedKnowledge);
    const fallback = createProfessionalFallbackPlan(context, { linguisticMode: mode === "BLOCKED" ? "LESSON_BOUNDED" : mode });
    const telemetry = { callCount: 0, criticCallCount: 0, revisionCount: 0, inputTokens: 0, outputTokens: 0, latencyMs: 0, errors: 0, model: env.OPENAI_TUTOR_MODEL || env.OPENAI_MODEL || "gpt-4.1-mini" };
    const enabled = env.AI_TUTOR_ON_EVERY_INCORRECT_ANSWER !== "false" && context.correct === false;
    let finalPlan = { ...fallback, activities: fallback.activities.map((activity, index) => toRenderable(activity, context, fallback.planId, index)) }, usedAI = false, reason = "PROFESSIONAL_LOCAL_FALLBACK";
    if (enabled && mode !== "BLOCKED" && env.OPENAI_API_KEY) {
      const timeoutMs = Math.max(1500, Number(env.AI_TUTOR_TIMEOUT_MS) || 9000), maxRevision = Math.min(1, Math.max(0, Number(env.AI_TUTOR_MAX_REVISION_ATTEMPTS) || 1));
      const safetyIdentifier = hash(`nalvi-tutor:${verifiedUserId || requesterHash}`).slice(0, 64);
      const permittedKnowledge = allowedKnowledge.map(record => ({ id: record.id, recordType: record.recordType, lemma: record.lemma, lexeme: record.lexeme, forms: record.forms, senses: record.senses, sourceIds: sourceIdsFor(record), validationStatus: record.validationStatus }));
      let revisionInstruction = "";
      for (let attempt = 0; attempt <= maxRevision; attempt += 1) {
        try {
          counters.aiCalls += 1; telemetry.callCount += 1;
          const planner = await callResponses({ fetchImpl, apiKey: env.OPENAI_API_KEY, model: telemetry.model, schema: ADAPTIVE_TUTOR_PLAN_SCHEMA, schemaName: "nalvi_adaptive_tutor_plan", instructions: `${plannerPrompt}\n${revisionInstruction}`,
            input: { task: "orchestrateAdaptiveTutoring", context: pseudonymizedContext(context, mode), permittedKnowledge, strategyEffectiveness: context.strategyEffectiveness || {} }, safetyIdentifier, timeoutMs });
          telemetry.inputTokens += Number(planner.usage.input_tokens || 0); telemetry.outputTokens += Number(planner.usage.output_tokens || 0); telemetry.latencyMs += planner.latencyMs;
          const deterministic = validateAndRender(planner.value, context, mode, allowedKnowledge);
          let critic = { accepted: deterministic.valid, reasonCodes: deterministic.reasons || [], revisionInstruction: (deterministic.reasons || []).join(", ") };
          if (deterministic.valid && env.AI_TUTOR_CRITIC_ENABLED !== "false") {
            counters.criticCalls += 1; telemetry.criticCallCount += 1;
            const crit = await critiqueAdaptiveTutorPlan({ plan: planner.value, context: pseudonymizedContext(context, mode), permittedKnowledge, fetchImpl, env, safetyIdentifier, timeoutMs });
            telemetry.inputTokens += Number(crit.usage.input_tokens || 0); telemetry.outputTokens += Number(crit.usage.output_tokens || 0); telemetry.latencyMs += crit.latencyMs; critic = crit.value;
          }
          if (deterministic.valid && critic.accepted) { finalPlan = deterministic.plan; usedAI = true; reason = "AI_TUTOR_PLAN_VALIDATED"; counters.accepted += 1; break; }
          counters.rejected += 1;
          if (attempt < maxRevision) { counters.revisions += 1; telemetry.revisionCount += 1; revisionInstruction = `Revise once. Rejection reasons: ${(critic.reasonCodes || deterministic.reasons || []).join(", ")}. ${critic.revisionInstruction || ""}`; continue; }
        } catch (error) { telemetry.errors += 1; reason = error?.name === "AbortError" ? "AI_TUTOR_TIMEOUT" : "AI_TUTOR_UNAVAILABLE"; }
      }
    } else reason = !enabled ? "AI_TUTOR_POLICY_DISABLED" : mode === "BLOCKED" ? "LINGUISTIC_MODE_BLOCKED" : "OPENAI_NOT_CONFIGURED";
    if (!usedAI) counters.fallbacks += 1;
    telemetry.estimatedCostUsd = estimateCostUsd(telemetry, env);
    counters.totalLatencyMs += telemetry.latencyMs; counters.inputTokens += telemetry.inputTokens; counters.outputTokens += telemetry.outputTokens; counters.estimatedCostUsd += telemetry.estimatedCostUsd;
    counters.latencies.push(telemetry.latencyMs); counters.totalPlanLength += finalPlan.activities.length;
    for (const activity of finalPlan.activities) counters.helpDistribution[activity.helpLevel] = (counters.helpDistribution[activity.helpLevel] || 0) + 1;
    const matrixKey = `${finalPlan.diagnosis.errorType}:${finalPlan.strategy.primaryStrategy}`;
    counters.errorStrategyMatrix[matrixKey] = (counters.errorStrategyMatrix[matrixKey] || 0) + 1;
    const metrics = planMetrics(finalPlan, context);
    const event = { eventKind: "adaptiveTutorIntervention", logicalCollection: "interventionEvents", conceptId: context.conceptId, learningObjectiveId: context.learningObjectiveId, errorType: finalPlan.diagnosis.errorType,
      strategy: finalPlan.strategy.primaryStrategy, activityTypes: finalPlan.activities.map(activity => activity.type || activity.activityType), activityFingerprints: finalPlan.activities.map(activity => activity.fingerprint || createActivityFingerprint(activity, { uiLocale: context.uiLocale })),
      answerExposureHistory: finalPlan.activities.map(activity => activity.answerExposure), usedAI, linguisticMode: mode, attemptNumber: context.attemptNumber, uiLocale: context.uiLocale,
      telemetry: { ...telemetry }, metrics, timestamp: new Date().toISOString() };
    let persistence = { status: "skipped", reason: verifiedUserId ? "PERSISTENCE_NOT_CONFIGURED" : "ANONYMOUS_SESSION" };
    if (verifiedUserId) try { persistence = await persistEvent({ userId: verifiedUserId, event: { ...event, userId: verifiedUserId } }); } catch { persistence = { status: "failed", reason: "PERSISTENCE_ERROR" }; }
    return { ok: true, usedAI, mode: usedAI ? "adaptiveTutor" : "fallback", reason, linguisticMode: mode, adaptiveInterventionPlan: finalPlan, telemetry, metrics, persistence, event };
  }
  return Object.freeze({
    orchestrateAdaptiveTutoring,
    audit: () => ({
      requests: counters.requests,
      aiCalls: counters.aiCalls,
      criticCalls: counters.criticCalls,
      revisions: counters.revisions,
      fallbacks: counters.fallbacks,
      accepted: counters.accepted,
      rejected: counters.rejected,
      inputTokens: counters.inputTokens,
      outputTokens: counters.outputTokens,
      estimatedCostUsd: Number(counters.estimatedCostUsd.toFixed(6)),
      callsPerSession: counters.requests ? counters.aiCalls / counters.requests : 0,
      interventionAcceptanceRate: counters.requests ? counters.accepted / counters.requests : 0,
      fallbackRate: counters.requests ? counters.fallbacks / counters.requests : 0,
      criticRejectionRate: counters.criticCalls ? counters.rejected / counters.criticCalls : 0,
      revisionRate: counters.requests ? counters.revisions / counters.requests : 0,
      averagePlanLength: counters.requests ? counters.totalPlanLength / counters.requests : 0,
      latencyP95Ms: percentile(counters.latencies, 95),
      helpDistribution: { ...counters.helpDistribution },
      errorStrategyMatrix: { ...counters.errorStrategyMatrix },
      version: ADAPTIVE_TUTOR_VERSION,
      apiKeyExposedToClient: false,
      piiSentToModel: false
    })
  });
}
