import {
  canScoreWithoutAI,
  createActivityFingerprint,
  planPedagogicalIntervention,
  wouldAIImproveIntervention
} from "../../intervention-engine/intervention-engine.mjs?v=NALVI-PRE8C-PROGRESSION-3";
import { buildDeterministicFallbackActivity } from "../../progression-engine/fallback-intervention.mjs?v=NALVI-PRE8C-PROGRESSION-3";

const VERSION = "NALVI-PRE8C-ADAPTIVE-PLAN-CLIENT-2";
const HISTORY_KEY = "nalvi.intervention.history.v2";
const ATTEMPT_KEY = "nalvi.intervention.attempts.v1";
const LANGUAGES = new Set(["es", "en", "pt", "fr", "it", "de"]);
const activeRequests = new WeakMap();
const activeSequences = new WeakMap();
const COPY = {
  es: { title: "Vamos a enseñarlo de otra forma", feedback: "La respuesta no fue correcta. Cambiamos la estrategia para ayudarte a comprender.", action: "Empezar refuerzo", local: "Intervención local segura", ai: "Plan adaptativo validado", noRepeat: "Actividad diferente preparada", loading: "Preparando un plan breve…", sequence: "Actividad {current} de {total}", complete: "Refuerzo completado" },
  en: { title: "Let's teach it in a different way", feedback: "That answer was not correct. We changed the strategy to help you understand.", action: "Start reinforcement", local: "Safe local intervention", ai: "Validated adaptive plan", noRepeat: "A different activity is ready", loading: "Preparing a short plan…", sequence: "Activity {current} of {total}", complete: "Reinforcement completed" },
  pt: { title: "Vamos ensinar de outra forma", feedback: "A resposta não estava correta. Mudamos a estratégia para ajudar você a compreender.", action: "Iniciar reforço", local: "Intervenção local segura", ai: "Plano adaptativo validado", noRepeat: "Uma atividade diferente está pronta", loading: "Preparando um plano breve…", sequence: "Atividade {current} de {total}", complete: "Reforço concluído" },
  fr: { title: "Essayons une autre manière d’apprendre", feedback: "La réponse n’était pas correcte. Nous changeons de stratégie pour vous aider à comprendre.", action: "Commencer le renforcement", local: "Intervention locale sûre", ai: "Plan adaptatif validé", noRepeat: "Une activité différente est prête", loading: "Préparation d’un plan court…", sequence: "Activité {current} sur {total}", complete: "Renforcement terminé" },
  it: { title: "Proviamo a insegnarlo in un altro modo", feedback: "La risposta non era corretta. Cambiamo strategia per aiutarti a capire.", action: "Inizia il rinforzo", local: "Intervento locale sicuro", ai: "Piano adattivo convalidato", noRepeat: "È pronta un’attività diversa", loading: "Preparazione di un piano breve…", sequence: "Attività {current} di {total}", complete: "Rinforzo completato" },
  de: { title: "Wir erklären es auf eine andere Weise", feedback: "Die Antwort war nicht richtig. Wir wechseln die Strategie, damit du es besser verstehst.", action: "Verstärkung starten", local: "Sichere lokale Intervention", ai: "Validierter adaptiver Plan", noRepeat: "Eine andere Aktivität ist bereit", loading: "Ein kurzer Plan wird vorbereitet…", sequence: "Aktivität {current} von {total}", complete: "Verstärkung abgeschlossen" }
};

const locale = value => LANGUAGES.has(value) ? value : "es";
const localize = (value, language) => {
  if (value == null) return "";
  if (typeof value !== "object" || Array.isArray(value)) return String(value);
  return String(value[language] ?? value.es ?? value.en ?? Object.values(value)[0] ?? "");
};
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
const readJson = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; } };
const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* anonymous/offline fallback remains in memory */ } };
const activityCatalog = () => (window.KUAA_GENERAL_ACTIVITY_DATA?.activities || []).map(activity => ({ ...activity, conceptId: activity.conceptId || activity.conceptIds?.[0] || "" }));
const sequenceLabel = (text, current, total) => text.replace("{current}", String(current)).replace("{total}", String(total));

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
  return readJson(HISTORY_KEY, []).filter(item => item && item.fingerprint).slice(-16);
}

function nextAttempt(activity) {
  const attempts = readJson(ATTEMPT_KEY, {}), key = activity.id || activity.conceptId || "activity";
  attempts[key] = Math.min(12, Math.max(0, Number(attempts[key]) || 0) + 1);
  writeJson(ATTEMPT_KEY, attempts);
  return attempts[key];
}

function remember(context, plan) {
  const current = history();
  for (const activity of plan.activities || []) current.push({
    conceptId: context.conceptId,
    fingerprint: activity.fingerprint || createActivityFingerprint(activity, { uiLocale: context.uiLocale }),
    activityType: activity.type || activity.activityType,
    errorType: plan.diagnosis || context.localPlan?.errorType,
    strategy: plan.strategy,
    timestamp: new Date().toISOString()
  });
  writeJson(HISTORY_KEY, current.slice(-16));
}

function rememberFailedActivity(context) {
  const current = history();
  if (current.some(item => item.fingerprint === context.previousActivityFingerprint)) return;
  current.push({
    conceptId: context.conceptId,
    fingerprint: context.previousActivityFingerprint,
    activityType: context.activityType,
    errorType: "UNCLASSIFIED_ATTEMPT",
    strategy: "OBSERVED_ERROR",
    timestamp: new Date().toISOString()
  });
  writeJson(HISTORY_KEY, current.slice(-16));
}

function localAdaptivePlan(context, localPlan, reason = "LOCAL_FALLBACK") {
  let activity = localPlan?.nextActivity;
  let fingerprint = localPlan?.nextFingerprint || (activity ? createActivityFingerprint(activity, { uiLocale: context.uiLocale }) : "");
  if (!activity || fingerprint === context.previousActivityFingerprint || context.recentActivityFingerprints.includes(fingerprint)) {
    activity = buildDeterministicFallbackActivity(context, context.attemptNumber);
    fingerprint = activity ? createActivityFingerprint(activity, { uiLocale: context.uiLocale }) : "";
  }
  return {
    ok: true,
    mode: "fallback",
    usedAI: false,
    reason,
    adaptiveInterventionPlan: {
      planId: `local-${context.conceptId}-${Date.now()}`,
      conceptId: context.conceptId,
      diagnosis: localPlan?.errorType || "UNKNOWN_ERROR",
      diagnosisConfidence: Number(localPlan?.diagnosis?.confidence || 0),
      strategy: localPlan?.strategy || "CHANGE_MODALITY",
      studentFeedback: (COPY[context.uiLocale] || COPY.es).feedback,
      activities: activity ? [{ ...activity, nalviGuided: true, fingerprint }] : [],
      retestPolicy: activity ? "after-plan" : "delayed",
      masteryRecommendation: context.attemptNumber > 1 ? "MARK_WEAK" : "AWAIT_RETEST",
      validationMetadata: { riskLevel: "GREEN", fallback: true }
    },
    persistence: { status: "skipped", reason }
  };
}

async function serverAdaptivePlan(context, localPlan) {
  const user = window.GCA_FIREBASE_LIVE?.auth?.currentUser;
  if (!user) return localAdaptivePlan(context, localPlan, "AUTH_REQUIRED_LOCAL_FALLBACK");
  try {
    const idToken = await user.getIdToken();
    const response = await fetch("/api/generate-adaptive-intervention-plan", {
      method: "POST",
      credentials: "same-origin",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(context)
    });
    if (!response.ok) return localAdaptivePlan(context, localPlan, `SERVER_${response.status}_LOCAL_FALLBACK`);
    const payload = await response.json();
    if (!payload?.ok || !payload.adaptiveInterventionPlan) return localAdaptivePlan(context, localPlan, payload?.reason || "INVALID_SERVER_PLAN");
    return payload;
  } catch {
    return localAdaptivePlan(context, localPlan, "SERVER_UNAVAILABLE_LOCAL_FALLBACK");
  }
}

function renderSequenceActivity(target, state, index) {
  const activity = state.plan.activities[index];
  if (!activity || typeof window.renderActivity !== "function") return;
  state.index = index;
  activeSequences.set(target, state);
  window.renderActivity({
    ...activity,
    nalviGuided: true,
    adaptivePlanId: state.plan.planId,
    adaptivePlanIndex: index,
    adaptivePlanLength: state.plan.activities.length
  }, { target, language: state.language });
  const card = target.querySelector(".kuaa-activity");
  if (card) {
    const text = COPY[state.language] || COPY.es;
    const progress = document.createElement("div");
    progress.className = "nalvi-adaptive-sequence";
    progress.textContent = sequenceLabel(text.sequence, index + 1, state.plan.activities.length);
    card.prepend(progress);
  }
  window.NALVI_PROGRESSION?.diagnostic?.("INTERVENTION_RENDERED", {
    activityId: activity.id,
    conceptId: activity.conceptId || activity.conceptIds?.[0],
    correct: false,
    strategy: state.plan.strategy,
    usedAI: Boolean(state.usedAI),
    progressionDecision: "BLOCK_AND_INTERVENE",
    fingerprint: activity.fingerprint || createActivityFingerprint(activity, { uiLocale: state.language })
  });
}

function showPanel(target, context, response, { loading = false, requestState = null } = {}) {
  const language = context.uiLocale, text = COPY[language] || COPY.es, plan = response.adaptiveInterventionPlan;
  target.querySelector("[data-nalvi-intervention]")?.remove();
  const panel = document.createElement("section");
  panel.className = `nalvi-intervention${loading ? " is-loading" : ""}`;
  panel.dataset.nalviIntervention = loading ? "loading" : "planned";
  panel.setAttribute("aria-live", "polite");
  const activities = plan?.activities || [], feedback = plan?.studentFeedback || text.feedback;
  panel.innerHTML = `<div class="nalvi-intervention__icon" aria-hidden="true">↗</div><div class="nalvi-intervention__copy"><small>${escapeHtml(response.usedAI ? text.ai : text.local)}</small><h4>${escapeHtml(text.title)}</h4><p>${escapeHtml(feedback)}</p><span>${escapeHtml(loading ? text.loading : `${text.noRepeat} · ${plan?.strategy || "CHANGE_MODALITY"}`)}</span>${loading ? '<i class="nalvi-intervention__skeleton" aria-hidden="true"></i>' : ""}</div>${activities.length ? `<button type="button" class="btn nalvi-intervention__action">${escapeHtml(text.action)}</button>` : ""}`;
  target.append(panel);
  panel.querySelector(".nalvi-intervention__action")?.addEventListener("click", () => {
    if (!activities.length) return;
    if (requestState) requestState.consumed = true;
    renderSequenceActivity(target, {
      plan,
      language,
      index: 0,
      usedAI: Boolean(response.usedAI),
      sourceActivityId: context.activity?.id || ""
    }, 0);
  });
  return panel;
}

function buildContext(detail) {
  const activity = detail.activity || {}, language = locale(detail.uiLocale || document.documentElement.lang), attemptNumber = nextAttempt(activity);
  const recent = history(), previousFingerprint = createActivityFingerprint(activity, { uiLocale: language });
  return {
    correct: false,
    conceptId: activity.conceptId || activity.conceptIds?.[0] || "GG-C-001",
    learningObjectiveId: activity.learningObjectiveId || "GG-LO-001",
    currentSkill: activity.skill || "vocabulary",
    activityType: activity.type || activity.activityType || "multiple-choice",
    difficulty: activity.difficulty || "foundation-1",
    studentAnswer: typeof detail.result?.value === "string" ? detail.result.value : "",
    correctAnswer: answerFor(activity, language),
    attemptNumber,
    recentErrors: recent.filter(item => item.conceptId === (activity.conceptId || activity.conceptIds?.[0])).map(item => ({ conceptId: item.conceptId, errorType: item.errorType })),
    recentActivities: [],
    recentActivityFingerprints: recent.map(item => item.fingerprint),
    modalitiesAlreadyUsed: recent.map(item => item.activityType),
    recentInterventions: recent.map(item => ({ strategy: item.strategy, errorType: item.errorType })),
    hintHistory: [],
    retentionHistory: [],
    uiLocale: language,
    grammarRuleIds: activity.grammarRuleIds || [],
    lexemeIds: activity.lexemeIds || [],
    knowledgeIds: [...(activity.grammarRuleIds || []), ...(activity.lexemeIds || [])],
    activity: { ...activity, conceptId: activity.conceptId || activity.conceptIds?.[0] || "" },
    availableActivities: activityCatalog(),
    previousActivityFingerprint: previousFingerprint,
    aiPolicy: { allowAdaptivePlanAfterFirstError: true }
  };
}

async function handleIncorrect(detail, target) {
  const context = buildContext(detail), localPlan = planPedagogicalIntervention(context);
  context.localPlan = localPlan;
  rememberFailedActivity(context);
  window.NALVI_PROGRESSION?.diagnostic?.("INTERVENTION_REQUESTED", {
    activityId: context.activity.id,
    conceptId: context.conceptId,
    correct: false,
    strategy: localPlan?.strategy || "CHANGE_MODALITY",
    usedAI: false,
    progressionDecision: detail.progression?.decision || "BLOCK_AND_INTERVENE",
    fingerprint: context.previousActivityFingerprint
  });
  activeSequences.delete(target);
  const requestState = { id: `${Date.now()}-${Math.random()}`, consumed: false };
  activeRequests.set(target, requestState);
  const localResponse = localAdaptivePlan(context, localPlan, "IMMEDIATE_LOCAL_FEEDBACK");
  const mayUseServer = Boolean(window.GCA_FIREBASE_LIVE?.auth?.currentUser);
  showPanel(target, context, localResponse, { loading: mayUseServer, requestState });
  const response = mayUseServer ? await serverAdaptivePlan(context, localPlan) : localResponse;
  if (activeRequests.get(target) !== requestState || requestState.consumed) return;
  const plan = response.adaptiveInterventionPlan || localResponse.adaptiveInterventionPlan;
  const previous = context.previousActivityFingerprint;
  if ((plan.activities || []).some(activity => (activity.fingerprint || createActivityFingerprint(activity, { uiLocale: context.uiLocale })) === previous)) {
    console.error("NALVI_ADAPTIVE_PLAN_DUPLICATE_BLOCKED", previous);
    return;
  }
  remember(context, plan);
  showPanel(target, context, { ...response, adaptiveInterventionPlan: plan }, { requestState });
  window.dispatchEvent(new CustomEvent("nalvi:adaptive-plan-ready", { detail: { plan, persistence: response.persistence, usedAI: Boolean(response.usedAI), telemetry: response.telemetry } }));
}

function continueSequence(detail, target) {
  const activity = detail.activity || {}, state = activeSequences.get(target);
  if (!state || !activity.adaptivePlanId || activity.adaptivePlanId !== state.plan.planId) return false;
  if (detail.result?.correct !== true) return false;
  const nextIndex = Number(activity.adaptivePlanIndex ?? state.index) + 1;
  if (nextIndex < state.plan.activities.length) {
    setTimeout(() => renderSequenceActivity(target, state, nextIndex), 180);
  } else {
    activeSequences.delete(target);
    const text = COPY[state.language] || COPY.es;
    window.dispatchEvent(new CustomEvent("nalvi:adaptive-plan-completed", { detail: { planId: state.plan.planId, activityCount: state.plan.activities.length } }));
    const feedback = target.querySelector("#feedback");
    if (feedback) feedback.textContent = text.complete;
    const excludedActivityIds = [...new Set([
      state.sourceActivityId,
      ...(state.plan.activities || []).map(item => item?.id)
    ].filter(Boolean))];
    setTimeout(() => window.dispatchEvent(new CustomEvent("nalvi:resume-objective-practice", { detail: {
      courseId: "general",
      planId: state.plan.planId,
      conceptId: activity.conceptId || activity.conceptIds?.[0] || state.plan.conceptId,
      completionIsMastery: false,
      excludedActivityIds
    } })), 220);
  }
  return true;
}

document.addEventListener("nalvi:activity-scored", event => {
  window.NALVI_PROGRESSION?.diagnostic?.("INTERVENTION_EVENT_RECEIVED", {
    activityId: event.detail?.activity?.id,
    conceptId: event.detail?.activity?.conceptId || event.detail?.activity?.conceptIds?.[0],
    correct: event.detail?.result?.correct,
    progressionDecision: event.detail?.progression?.decision
  });
  const target = event.target instanceof Element ? event.target : document.querySelector("#lessonBody");
  if (!target) return;
  if (continueSequence(event.detail || {}, target)) return;
  if (event.detail?.result?.correct === false) handleIncorrect(event.detail, target);
});

window.addEventListener("nalvi:legacy-answer-scored", event => {
  if (event.detail?.result?.correct !== false) return;
  const target = document.querySelector(event.detail.target || "#lessonBody");
  if (target) handleIncorrect(event.detail, target);
});

window.NALVI_INTERVENTION = Object.freeze({
  version: VERSION,
  canScoreWithoutAI,
  wouldAIImproveIntervention,
  createActivityFingerprint,
  planPedagogicalIntervention,
  clearLocalHistory: () => { localStorage.removeItem(HISTORY_KEY); localStorage.removeItem(ATTEMPT_KEY); },
  audit: () => ({
    version: VERSION,
    canScoreWithoutAISeparated: true,
    wouldAIImproveInterventionSeparated: true,
    exactRepeatBlocked: true,
    adaptivePlanSequence: { min: 1, max: 4 },
    immediateLocalFeedback: true,
    backgroundGeneration: true,
    endpoint: "/api/generate-adaptive-intervention-plan",
    interfaceLanguages: [...LANGUAGES],
    clientApiKeyPresent: false,
    firestoreClientWrite: false
  })
});

window.NALVI_PROGRESSION?.diagnostic?.("INTERVENTION_CLIENT_READY", {
  version: VERSION,
  event: "nalvi:activity-scored"
});
