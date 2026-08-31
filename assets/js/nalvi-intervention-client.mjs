import {
  canScoreWithoutAI,
  createActivityFingerprint,
  needsAdaptiveTutor,
  planPedagogicalIntervention,
  wouldAIImproveIntervention
} from "../../intervention-engine/intervention-engine.mjs?v=NALVI-TUTOR-4";
import { buildDeterministicFallbackActivity } from "../../progression-engine/fallback-intervention.mjs?v=NALVI-TUTOR-4";

const VERSION = "NALVI-TUTOR-CLIENT-7";
// Stable regression marker: scoring feedback is shown before any network result.
const IMMEDIATE_LOCAL_FEEDBACK = true;
const HISTORY_KEY = "nalvi.tutor.history.v2";
const ATTEMPT_KEY = "nalvi.tutor.attempts.v2";
const EFFECTIVENESS_KEY = "nalvi.tutor.strategy-effectiveness.v2";
const EXPOSURE_KEY = "nalvi.tutor.answer-exposure.v2";
const ATTEMPT_TTL_MS = 30 * 60 * 1000;
const LANGUAGES = new Set(["es", "en", "pt", "fr", "it", "de"]);
const activeRequests = new WeakMap();
const activeSequences = new WeakMap();
let sessionHistory = [];
const COPY = Object.freeze({
  es: { wrong: "No del todo. Probemos de otra forma.", loading: "Preparando otra forma de practicar…", complete: "Bien. Ahora seguiremos comprobando lo aprendido.", example: "Observa este ejemplo", deferred: "Guardamos este concepto para repasarlo más tarde." },
  en: { wrong: "Not quite. Let’s try another way.", loading: "Preparing another way to practise…", complete: "Good. We’ll keep checking what you learned.", example: "Study this example", deferred: "We saved this concept for a later review." },
  pt: { wrong: "Ainda não. Vamos tentar de outra forma.", loading: "Preparando outra forma de praticar…", complete: "Bem. Continuaremos verificando o que você aprendeu.", example: "Observe este exemplo", deferred: "Guardamos este conceito para revisar mais tarde." },
  fr: { wrong: "Pas tout à fait. Essayons autrement.", loading: "Préparation d’une autre façon de pratiquer…", complete: "Bien. Nous continuerons à vérifier vos acquis.", example: "Observez cet exemple", deferred: "Ce concept est prévu pour une révision ultérieure." },
  it: { wrong: "Non proprio. Proviamo in un altro modo.", loading: "Preparazione di un altro modo per esercitarsi…", complete: "Bene. Continueremo a verificare ciò che hai imparato.", example: "Osserva questo esempio", deferred: "Abbiamo salvato questo concetto per un ripasso successivo." },
  de: { wrong: "Noch nicht ganz. Versuchen wir es anders.", loading: "Eine andere Übungsform wird vorbereitet…", complete: "Gut. Wir überprüfen das Gelernte weiter.", example: "Sieh dir dieses Beispiel an", deferred: "Dieses Konzept wurde für eine spätere Wiederholung vorgemerkt." }
});

const locale = value => LANGUAGES.has(value) ? value : "es";
const localize = (value, language) => value && typeof value === "object" && !Array.isArray(value) ? String(value[language] ?? value.es ?? value.en ?? Object.values(value)[0] ?? "") : String(value ?? "");
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
const readJson = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; } };
const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* safe anonymous fallback */ } };
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const activityCatalog = () => (window.KUAA_GENERAL_ACTIVITY_DATA?.activities || []).map(activity => ({ ...activity, conceptId: activity.conceptId || activity.conceptIds?.[0] || "" }));

function answerFor(activity, language) {
  if (activity.correctOptionId != null) {
    const option = (activity.options || []).find(item => String(item.id) === String(activity.correctOptionId));
    return localize(option?.label ?? option?.value, language);
  }
  if (Array.isArray(activity.acceptedAnswers)) return localize(activity.acceptedAnswers[0], language);
  if (Array.isArray(activity.correctOrder)) return activity.correctOrder.join(" ");
  return localize(activity.answer, language);
}

function history() {
  const persisted = readJson(HISTORY_KEY, []).filter(item => item?.fingerprint);
  const combined = [...persisted, ...sessionHistory].filter((item, index, items) =>
    items.findIndex(candidate => candidate.fingerprint === item.fingerprint) === index);
  sessionHistory = combined.slice(-32);
  return sessionHistory;
}
function nextAttempt(activity) {
  const attempts = readJson(ATTEMPT_KEY, {}), key = activity.conceptId || activity.conceptIds?.[0] || activity.id || "activity";
  const now = Date.now(), stored = attempts[key];
  const previous = stored && typeof stored === "object" && now - Number(stored.updatedAt || 0) <= ATTEMPT_TTL_MS
    ? Math.max(0, Number(stored.count) || 0)
    : 0;
  const count = Math.min(12, previous + 1);
  attempts[key] = { count, updatedAt: now };
  writeJson(ATTEMPT_KEY, attempts); return count;
}

function hasVisibleFillContext(activity, language) {
  const template = localize(activity?.template, language).replace(/\{\{blank\}\}|_+/g, "").replace(/[→:;,.!?¿¡\s-]+/g, "").trim();
  return Boolean(template);
}

function normalizeRenderableActivity(activity = {}, context) {
  const language = context.uiLocale, type = activity.type || activity.activityType || "writing";
  const correctAnswer = localize(activity.correctAnswer || activity.answer || context.correctAnswer, language);
  const sourcePrompt = localize(activity.lessonContext?.sourcePrompt || context.activity?.lessonContext?.sourcePrompt || context.activity?.prompt || context.activity?.instruction, language).trim();
  const sourceInstruction = localize(activity.lessonContext?.sourceInstruction || context.activity?.lessonContext?.sourceInstruction || context.activity?.instruction, language).trim();
  const options = (activity.options || []).map((option, index) => {
    const label = localize(option?.label ?? option?.text ?? option?.value ?? option, language);
    return { ...option, id: String(option?.id ?? `option-${index}`), label, value: localize(option?.value ?? option?.text ?? option?.label ?? option, language) };
  }).filter(option => option.label);
  const correct = options.find(option => String(option.id) === String(activity.correctOptionId) || option.value.normalize("NFC").trim().toLocaleLowerCase() === correctAnswer.normalize("NFC").trim().toLocaleLowerCase());
  const tokens = (activity.tokens || []).map((token, index) => ({ ...token, id: String(token?.id ?? index), label: localize(token?.label ?? token?.text ?? token, language) }));
  let template = localize(activity.template, language);
  if (type === "fill-blank" && !hasVisibleFillContext({ template }, language)) template = `${sourcePrompt || localize(activity.prompt, language)} → {{blank}}`;
  return {
    ...activity, type, activityType: type, options, tokens, template,
    correctOptionId: activity.correctOptionId || correct?.id || "",
    acceptedAnswers: activity.acceptedAnswers?.length ? activity.acceptedAnswers : correctAnswer ? [correctAnswer] : [],
    answer: activity.answer || correctAnswer,
    audioText: activity.audioText || (activity.media?.type === "audio" ? activity.media.value : ""),
    audio: activity.audio || (activity.media?.type === "audio" ? activity.media.value : ""),
    image: activity.image || (activity.media?.type === "image" ? activity.media.value : ""),
    imageAlt: activity.imageAlt || activity.media?.alt || "",
    lessonContext: {
      ...(context.activity?.lessonContext || {}),
      ...(activity.lessonContext || {}),
      sourcePrompt,
      sourceInstruction,
      sourceAnswer: localize(activity.lessonContext?.sourceAnswer || context.activity?.lessonContext?.sourceAnswer || context.correctAnswer, language),
      sourceOptions: activity.lessonContext?.sourceOptions || context.activity?.lessonContext?.sourceOptions || context.activity?.options || [],
      sourceCorrectOptionId: activity.lessonContext?.sourceCorrectOptionId || context.activity?.lessonContext?.sourceCorrectOptionId || context.activity?.correctOptionId || ""
    }
  };
}

function normalizePlanForRenderer(plan, context) {
  return { ...plan, activities: (plan?.activities || []).map(activity => normalizeRenderableActivity(activity, context)) };
}

function isPedagogicallyClear(activity, language) {
  if (!activity) return false;
  if ((activity.type || activity.activityType) === "fill-blank" && !hasVisibleFillContext(activity, language)) return false;
  return Boolean(localize(activity.prompt || activity.instruction || activity.lessonContext?.sourcePrompt, language).trim());
}

function targetsFailedKnowledge(activity, context) {
  if (!activity) return false;
  const expected = localize(context.correctAnswer, context.uiLocale).normalize("NFC").trim().toLocaleLowerCase();
  const candidateConcepts = [activity.conceptId, ...(activity.conceptIds || [])].filter(Boolean).map(String);
  if (!expected) return Boolean(context.conceptId && candidateConcepts.includes(String(context.conceptId)));
  const candidateAnswers = [
    activity.correctAnswer,
    activity.answer,
    ...(activity.acceptedAnswers || [])
  ].map(value => localize(value, context.uiLocale).normalize("NFC").trim().toLocaleLowerCase()).filter(Boolean);
  return candidateAnswers.includes(expected);
}
function remember(context, plan) {
  const current = history();
  if (context.previousActivityFingerprint) current.push({
    conceptId: context.conceptId,
    fingerprint: context.previousActivityFingerprint,
    activityType: context.activityType,
    errorType: plan.diagnosis?.errorType || plan.diagnosis || "UNKNOWN_ERROR",
    strategy: "SOURCE_ACTIVITY_FAILED",
    answerExposure: "HIDDEN",
    timestamp: new Date().toISOString()
  });
  for (const activity of plan.activities || []) current.push({ conceptId: context.conceptId,
    fingerprint: activity.fingerprint || createActivityFingerprint(activity, { uiLocale: context.uiLocale }),
    activityType: activity.type || activity.activityType, errorType: plan.diagnosis?.errorType || plan.diagnosis || "UNKNOWN_ERROR",
    strategy: plan.strategy?.primaryStrategy || plan.strategy || "CHANGE_MODALITY", answerExposure: activity.answerExposure || "HIDDEN", timestamp: new Date().toISOString() });
  sessionHistory = current.filter((item, index, items) =>
    items.findIndex(candidate => candidate.fingerprint === item.fingerprint) === index).slice(-32);
  writeJson(HISTORY_KEY, sessionHistory);
  const exposure = readJson(EXPOSURE_KEY, []); exposure.push(...(plan.activities || []).map(activity => ({ conceptId: context.conceptId, answerExposure: activity.answerExposure || "HIDDEN", timestamp: new Date().toISOString() })));
  writeJson(EXPOSURE_KEY, exposure.slice(-32));
}

function updateStrategyEffectiveness(strategy, correct) {
  if (!strategy) return;
  const state = readJson(EFFECTIVENESS_KEY, {}), item = state[strategy] || { successes: 0, attempts: 0, score: 0.5 };
  item.attempts += 1; if (correct) item.successes += 1; item.score = item.successes / item.attempts; state[strategy] = item;
  writeJson(EFFECTIVENESS_KEY, state);
}

function professionalLocalPlan(context, localPlan, reason = "PROFESSIONAL_LOCAL_FALLBACK") {
  let activity = normalizeRenderableActivity(buildDeterministicFallbackActivity(context, context.attemptNumber), context);
  let fingerprint = activity ? createActivityFingerprint(activity, { uiLocale: context.uiLocale }) : "";
  const recent = new Set(context.recentActivityFingerprints || []); recent.add(context.previousActivityFingerprint);
  if (!targetsFailedKnowledge(activity, context) || !isPedagogicallyClear(activity, context.uiLocale) || recent.has(fingerprint)) {
    activity = normalizeRenderableActivity(buildDeterministicFallbackActivity(context, context.attemptNumber + 1), context);
    fingerprint = activity ? createActivityFingerprint(activity, { uiLocale: context.uiLocale }) : "";
  }
  const language = context.uiLocale, copy = COPY[language] || COPY.es;
  return { ok: true, usedAI: false, mode: "fallback", reason, adaptiveInterventionPlan: {
    planVersion: "NALVI-TUTOR-1", planId: `local-${context.conceptId}-${Date.now()}`, conceptId: context.conceptId, linguisticMode: "LESSON_BOUNDED",
    diagnosis: { errorType: localPlan?.errorType || "UNKNOWN_ERROR", likelyDifficulty: "local-rule", confidence: Number(localPlan?.diagnosis?.confidence || 0), prerequisiteGap: null, skillAffected: context.currentSkill },
    pedagogicalGoal: "Continue the same concept through a different exercise.",
    strategy: { primaryStrategy: localPlan?.strategy || "CHANGE_MODALITY", secondaryStrategy: null, reasonCode: `local-attempt-${context.attemptNumber}` },
    studentFeedback: { locale: language, shortMessage: copy.wrong }, activities: activity ? [{ ...activity, fingerprint }] : [],
    progressionPolicy: { onIncorrect: "BLOCK_AND_INTERVENE", onGuidedCorrect: "CONTINUE_PRACTICE", requiresIndependentRetest: true, maxInterventionsBeforeDefer: 4 },
    fallbackPolicy: { strategy: "PROFESSIONAL_LOCAL_TEMPLATE", reason }, validationMetadata: { sourceIds: [], knowledgeIds: context.knowledgeIds, claimedRiskLevel: "GREEN" }
  }};
}

async function serverPlan(context) {
  try {
    const user = window.GCA_FIREBASE_LIVE?.auth?.currentUser;
    const headers = { "Content-Type": "application/json" };
    if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
    const response = await fetch("/api/generate-adaptive-intervention-plan", { method: "POST", credentials: "same-origin", headers, body: JSON.stringify(context) });
    if (!response.ok) throw new Error(`SERVER_${response.status}`);
    const payload = await response.json();
    if (!payload?.ok || !payload.adaptiveInterventionPlan?.activities?.length) throw new Error(payload?.reason || "INVALID_SERVER_PLAN");
    return payload;
  } catch (error) { return { ok: false, reason: String(error?.message || "SERVER_UNAVAILABLE") }; }
}

function shortFeedback(target, language, message) {
  const feedback = target.querySelector("#feedback");
  if (!feedback) return;
  feedback.className = "feedback no reaction-pop nalvi-tutor-feedback";
  feedback.textContent = message || (COPY[language] || COPY.es).wrong;
  feedback.setAttribute("aria-live", "polite");
}

function loadingState(target, language) {
  const copy = COPY[language] || COPY.es;
  target.innerHTML = `<section class="nalvi-tutor-loading" aria-live="polite"><span class="nalvi-tutor-loading__mark" aria-hidden="true"></span><p>${escapeHtml(copy.loading)}</p><i aria-hidden="true"></i></section>`;
}

function scrollToActivity(target) {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  requestAnimationFrame(() => target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" }));
}

function renderPassiveExample(target, state, activity, index) {
  const copy = COPY[state.language] || COPY.es;
  target.innerHTML = `<section class="kuaa-activity nalvi-tutor-example" aria-live="polite"><small class="kuaa-activity-kicker"><span class="kuaa-activity-mark" aria-hidden="true"></span>${escapeHtml(copy.example)}</small><h3>${escapeHtml(activity.instruction || copy.example)}</h3><p>${escapeHtml(activity.explanation || "")}</p></section>`;
  scrollToActivity(target);
  setTimeout(() => {
    const next = index + 1;
    if (activeSequences.get(target) !== state) return;
    if (next < state.plan.activities.length) renderSequenceActivity(target, state, next);
    else finishSequence(target, state, activity);
  }, window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? 1800 : 1500);
}

function renderSequenceActivity(target, state, index) {
  const activity = state.plan.activities[index]; if (!activity) return finishSequence(target, state, null);
  state.index = index; activeSequences.set(target, state);
  if (activity.requiresStudentResponse === false) return renderPassiveExample(target, state, activity, index);
  const renderedActivity = { ...activity, nalviGuided: Number(activity.helpLevel || 0) > 0, adaptivePlanId: state.plan.planId, adaptivePlanIndex: index, adaptivePlanLength: state.plan.activities.length };
  window.renderActivity(renderedActivity, {
    target,
    language: state.language,
    onAdaptiveSubmit(result, submittedActivity) {
      const detail = { activity: submittedActivity, result, progression: result.progression, uiLocale: state.language };
      if (continueSequence(detail, target)) return;
      if (result.correct === false) handleIncorrect(detail, target);
    }
  });
  scrollToActivity(target);
  window.NALVI_PROGRESSION?.diagnostic?.("INTERVENTION_RENDERED", { activityId: activity.id, conceptId: activity.conceptId || activity.conceptIds?.[0], correct: false,
    strategy: state.plan.strategy?.primaryStrategy, usedAI: state.usedAI, progressionDecision: "BLOCK_AND_INTERVENE", fingerprint: activity.fingerprint || createActivityFingerprint(activity, { uiLocale: state.language }) });
}

function finishSequence(target, state, activity) {
  activeSequences.delete(target);
  updateStrategyEffectiveness(state.plan.strategy?.primaryStrategy, true);
  const copy = COPY[state.language] || COPY.es;
  const excludedActivityIds = [...new Set([state.sourceActivityId, ...(state.plan.activities || []).map(item => item.id)].filter(Boolean))];
  target.innerHTML = `<div class="feedback ok nalvi-tutor-feedback" aria-live="polite">${escapeHtml(copy.complete)}</div>`;
  window.dispatchEvent(new CustomEvent("nalvi:adaptive-plan-completed", { detail: {
    planId: state.plan.planId, conceptId: activity?.conceptId || activity?.conceptIds?.[0] || state.plan.conceptId,
    completionIsMastery: false, independentRetestRequired: true
  } }));
  setTimeout(() => window.dispatchEvent(new CustomEvent("nalvi:resume-objective-practice", { detail: { courseId: "general", planId: state.plan.planId,
    conceptId: activity?.conceptId || activity?.conceptIds?.[0] || state.plan.conceptId, completionIsMastery: false, excludedActivityIds,
    independentRetestRequired: true } })), 600);
}

function buildContext(detail) {
  const activity = detail.activity || {}, language = locale(detail.uiLocale || document.documentElement.lang), attemptNumber = nextAttempt(activity);
  const recent = history(), conceptId = activity.conceptId || activity.conceptIds?.[0] || "GG-C-001";
  const previousFingerprint = createActivityFingerprint(activity, { uiLocale: language });
  const semanticAnswer = localize(activity.lessonContext?.sourceAnswer, language).trim() || answerFor(activity, language);
  return { correct: false, conceptId, learningObjectiveId: activity.learningObjectiveId || "GG-LO-001", currentSkill: activity.skill || "vocabulary",
    activityType: activity.type || activity.activityType || "multiple-choice", difficulty: activity.difficulty || "foundation-1",
    studentAnswer: typeof detail.result?.value === "string" ? detail.result.value : JSON.stringify(detail.result?.value || ""), correctAnswer: semanticAnswer, attemptNumber,
    recentErrors: recent.filter(item => item.conceptId === conceptId).map(item => ({ conceptId, errorType: item.errorType })), recentActivities: [],
    recentActivityFingerprints: recent.map(item => item.fingerprint), modalitiesAlreadyUsed: recent.map(item => item.activityType),
    recentInterventions: recent.map(item => ({ strategy: item.strategy, errorType: item.errorType })), hintHistory: [], retentionHistory: [],
    answerExposureHistory: readJson(EXPOSURE_KEY, []).filter(item => item.conceptId === conceptId).map(item => item.answerExposure),
    strategyEffectiveness: Object.fromEntries(Object.entries(readJson(EFFECTIVENESS_KEY, {})).map(([key, value]) => [key, Number(value.score || 0)])),
    prerequisiteGaps: [], independentRetestQueue: [], uiLocale: language, grammarRuleIds: activity.grammarRuleIds || [], lexemeIds: activity.lexemeIds || [],
    knowledgeIds: [...(activity.grammarRuleIds || []), ...(activity.lexemeIds || [])], activity: { ...activity, conceptId }, availableActivities: activityCatalog(),
    previousActivityFingerprint: previousFingerprint, aiPolicy: { allowInterventionAI: true, AI_TUTOR_ON_EVERY_INCORRECT_ANSWER: true } };
}

async function handleIncorrect(detail, target) {
  const context = buildContext(detail);
  let localPlan;
  try {
    localPlan = planPedagogicalIntervention(context);
  } catch (error) {
    console.warn("NALVI_TUTOR_LOCAL_PLANNER_FALLBACK", String(error?.message || error));
    localPlan = { errorType: "UNKNOWN_ERROR", strategy: "CHANGE_MODALITY", diagnosis: { confidence: 0 } };
  }
  const localResponse = professionalLocalPlan(context, localPlan);
  activeSequences.delete(target);
  const requestState = { id: `${Date.now()}-${Math.random()}` }; activeRequests.set(target, requestState);
  shortFeedback(target, context.uiLocale, (COPY[context.uiLocale] || COPY.es).wrong);
  window.NALVI_PROGRESSION?.diagnostic?.("INTERVENTION_REQUESTED", { activityId: context.activity.id, conceptId: context.conceptId, correct: false,
    strategy: localPlan?.strategy || "CHANGE_MODALITY", usedAI: false, progressionDecision: detail.progression?.decision || "BLOCK_AND_INTERVENE", fingerprint: context.previousActivityFingerprint });
  const requestPromise = serverPlan(context);
  await sleep(750);
  if (activeRequests.get(target) !== requestState) return;
  loadingState(target, context.uiLocale);
  const winner = await Promise.race([requestPromise, sleep(1500).then(() => null)]);
  if (activeRequests.get(target) !== requestState) return;
  const response = winner?.ok ? winner : localResponse;
  response.adaptiveInterventionPlan = normalizePlanForRenderer(response.adaptiveInterventionPlan, context);
  let plan = response.adaptiveInterventionPlan;
  const fingerprints = (plan.activities || []).map(activity => activity.fingerprint || createActivityFingerprint(activity, { uiLocale: context.uiLocale }));
  const sourceBoundRequired = String(context.activity?.id || "").startsWith("legacy-general-") || !(context.knowledgeIds || []).length;
  const unrelated = sourceBoundRequired && (plan.activities || []).some(activity => activity.requiresStudentResponse !== false && !targetsFailedKnowledge(activity, context));
  if (unrelated || fingerprints.includes(context.previousActivityFingerprint) || new Set(fingerprints).size !== fingerprints.length) {
    console.warn(unrelated ? "NALVI_TUTOR_UNRELATED_ACTIVITY_BLOCKED" : "NALVI_TUTOR_DUPLICATE_BLOCKED");
    const safe = professionalLocalPlan({ ...context, attemptNumber: context.attemptNumber + 1 }, null, "DUPLICATE_BLOCKED");
    response.adaptiveInterventionPlan = normalizePlanForRenderer(safe.adaptiveInterventionPlan, context);
    plan = response.adaptiveInterventionPlan;
  }
  if (context.attemptNumber > 4) {
    remember(context, response.adaptiveInterventionPlan);
    target.innerHTML = `<div class="feedback no nalvi-tutor-feedback" aria-live="polite">${escapeHtml((COPY[context.uiLocale] || COPY.es).deferred)}</div>`;
    setTimeout(() => window.dispatchEvent(new CustomEvent("nalvi:resume-objective-practice", { detail: { courseId: "general", planId: response.adaptiveInterventionPlan.planId,
      conceptId: context.conceptId, completionIsMastery: false, excludedActivityIds: [context.activity.id].filter(Boolean), independentRetestRequired: true,
      markWeak: true, reviewDue: true } })), 900);
    return;
  }
  remember(context, response.adaptiveInterventionPlan);
  window.dispatchEvent(new CustomEvent("nalvi:adaptive-plan-ready", { detail: { plan: response.adaptiveInterventionPlan, persistence: response.persistence, usedAI: Boolean(response.usedAI), telemetry: response.telemetry } }));
  renderSequenceActivity(target, { plan: response.adaptiveInterventionPlan, language: context.uiLocale, index: 0, usedAI: Boolean(response.usedAI), sourceActivityId: context.activity.id || "" }, 0);
}

function continueSequence(detail, target) {
  const activity = detail.activity || {}, state = activeSequences.get(target);
  if (!state || !activity.adaptivePlanId || activity.adaptivePlanId !== state.plan.planId) return false;
  if (detail.result?.correct !== true) { updateStrategyEffectiveness(state.plan.strategy?.primaryStrategy, false); return false; }
  const next = Number(activity.adaptivePlanIndex ?? state.index) + 1;
  setTimeout(() => next < state.plan.activities.length ? renderSequenceActivity(target, state, next) : finishSequence(target, state, activity), 420);
  return true;
}

document.addEventListener("nalvi:activity-scored", event => {
  const target = event.target instanceof Element ? event.target : document.querySelector("#lessonBody"); if (!target) return;
  if (event.detail?.adaptiveSubmitHandled) return;
  if (continueSequence(event.detail || {}, target)) return;
  if (event.detail?.result?.correct === false) handleIncorrect(event.detail, target);
});
window.addEventListener("nalvi:legacy-answer-scored", event => {
  if (event.detail?.result?.correct !== false) return;
  const target = document.querySelector(event.detail.target || "#lessonBody"); if (target) handleIncorrect(event.detail, target);
});

window.NALVI_INTERVENTION = Object.freeze({
  version: VERSION, canScoreWithoutAI, needsAdaptiveTutor, wouldAIImproveIntervention, createActivityFingerprint, planPedagogicalIntervention,
  clearLocalHistory: () => {
    sessionHistory = [];
    [HISTORY_KEY, ATTEMPT_KEY, EFFECTIVENESS_KEY, EXPOSURE_KEY].forEach(key => localStorage.removeItem(key));
  },
  audit: () => ({ version: VERSION, automaticIntervention: true, technicalStudentUi: false, everyIncorrectRequestsTutor: true,
    immediateLocalFeedback: IMMEDIATE_LOCAL_FEEDBACK, adaptivePlanSequence: { min: 1, max: 4 }, exactRepeatBlocked: true,
    interfaceLanguages: [...LANGUAGES], endpoint: "/api/generate-adaptive-intervention-plan", clientApiKeyPresent: false, firestoreClientWrite: false })
});
window.NALVI_PROGRESSION?.diagnostic?.("INTERVENTION_CLIENT_READY", { version: VERSION, event: "nalvi:activity-scored" });
