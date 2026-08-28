/*
 * NALVI · PASO 7B
 * Puente cliente selectivo para generateReinforcementActivity.
 *
 * No contiene claves, no se ejecuta automáticamente y no renderiza UI.
 * Primero busca una actividad local; solo si no existe solicita una actividad
 * al endpoint server-side. Toda falla vuelve a contenido local seguro.
 */
(() => {
  "use strict";

  const VERSION = "NALVI-P7B-CLIENT-1";
  const CACHE_KEY = "nalvi.reinforcement.cache.v1";
  const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  const TYPES = new Set(["multiple-choice", "listening", "order-sentence", "fill-blank", "writing", "matching"]);
  const LANGUAGES = new Set(["es", "en", "pt", "fr", "it", "de"]);

  const activities = () => window.KUAA_GENERAL_ACTIVITY_DATA?.activities || [];
  const curriculum = () => window.NALVI_GUARANI_GENERAL_CURRICULUM;
  const unique = values => [...new Set((values || []).filter(Boolean).map(String))];
  const localizeLanguage = value => LANGUAGES.has(value) ? value : "es";
  const stableJson = value => {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
    if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
    return JSON.stringify(value);
  };
  const quickHash = value => {
    let hash = 2166136261;
    for (const character of value) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(16).padStart(8, "0");
  };

  function normalizeRequest(input = {}) {
    const objective = curriculum()?.getLearningObjective?.(input.learningObjectiveId) || null;
    return {
      courseId: String(input.courseId || "general"),
      languageVariant: "gug-PY",
      learningObjectiveId: String(input.learningObjectiveId || objective?.id || ""),
      conceptIds: unique(input.conceptIds?.length ? input.conceptIds : objective?.conceptIds),
      knowledgeIds: unique(input.knowledgeIds?.length ? input.knowledgeIds : [...(objective?.lexemeIds || []), ...(objective?.grammarRuleIds || [])]),
      skill: String(input.skill || objective?.skills?.[0] || "comprehension"),
      difficulty: String(input.difficulty || objective?.difficulty || "foundation-1"),
      preferredActivityTypes: unique(input.preferredActivityTypes?.length ? input.preferredActivityTypes : objective?.activityTypes).filter(type => TYPES.has(type)),
      excludeActivityIds: unique(input.excludeActivityIds),
      locale: localizeLanguage(input.locale || document.documentElement.lang),
      adaptiveDecision: ["REVIEW", "REPEAT", "SIMPLIFY", "CHALLENGE", "REVIEW_LATER"].includes(input.adaptiveDecision) ? input.adaptiveDecision : "REVIEW"
    };
  }

  function rankExisting(request, { respectExclusions = true } = {}) {
    const excluded = new Set(respectExclusions ? request.excludeActivityIds : []);
    const preferred = new Set(request.preferredActivityTypes);
    return activities().filter(activity => {
      if (excluded.has(activity.id) || activity.courseId !== request.courseId) return false;
      return activity.learningObjectiveId === request.learningObjectiveId || (activity.conceptIds || []).some(id => request.conceptIds.includes(id));
    }).map(activity => {
      let score = activity.learningObjectiveId === request.learningObjectiveId ? 8 : 0;
      score += (activity.conceptIds || []).filter(id => request.conceptIds.includes(id)).length * 4;
      if (activity.skill === request.skill) score += 3;
      if (activity.difficulty === request.difficulty) score += 2;
      if (!preferred.size || preferred.has(activity.type)) score += 2;
      return { activity, score };
    }).sort((left, right) => right.score - left.score)[0]?.activity || null;
  }

  function canResolveWithoutAI(input) {
    const request = normalizeRequest(input);
    const activity = rankExisting(request);
    return Object.freeze({ canResolveWithoutAI: Boolean(activity), activity, request });
  }

  function renderCompatible(activity) {
    if (!activity || !TYPES.has(activity.type) || !activity.id || !activity.prompt) return false;
    if (["multiple-choice", "listening"].includes(activity.type)) {
      const ids = (activity.options || []).map(option => String(option.id));
      if (ids.length < 2 || !ids.includes(String(activity.correctOptionId))) return false;
    }
    if (activity.type === "order-sentence" && (!(activity.tokens || []).length || activity.correctOrder?.length !== activity.tokens.length)) return false;
    if (["fill-blank", "writing"].includes(activity.type) && !(activity.acceptedAnswers || []).length) return false;
    if (activity.type === "matching" && (activity.pairs || []).length < 2) return false;
    return true;
  }

  function loadCache() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch { return {}; }
  }

  function cachedActivity(request) {
    const key = quickHash(stableJson(request));
    const entry = loadCache()[key];
    if (!entry || entry.expiresAt <= Date.now() || !renderCompatible(entry.activity)) return null;
    return entry.activity;
  }

  function saveCache(request, activity) {
    if (!renderCompatible(activity) || activity.aiGenerated !== true) return;
    try {
      const cache = loadCache(), key = quickHash(stableJson(request));
      cache[key] = { expiresAt: Date.now() + CACHE_TTL_MS, activity };
      const validEntries = Object.entries(cache).filter(([, entry]) => entry?.expiresAt > Date.now()).slice(-40);
      localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(validEntries)));
    } catch { /* El estudio no depende de que localStorage esté disponible. */ }
  }

  function safeFallback(request, reason) {
    const activity = rankExisting(request, { respectExclusions: false });
    return { ok: true, mode: "fallback", canResolveWithoutAI: Boolean(activity), reason, fallbackAction: "continue-existing-route", activity };
  }

  async function generateReinforcementActivity(input = {}) {
    const local = canResolveWithoutAI(input);
    if (local.canResolveWithoutAI) {
      return { ok: true, mode: "existing", canResolveWithoutAI: true, reason: "EXISTING_ACTIVITY_AVAILABLE", activity: local.activity };
    }

    const cached = cachedActivity(local.request);
    if (cached) return { ok: true, mode: "generated", canResolveWithoutAI: false, cacheHit: true, activity: cached };

    const user = window.GCA_FIREBASE_LIVE?.auth?.currentUser;
    if (!user) return safeFallback(local.request, "AUTH_REQUIRED");

    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/generate-reinforcement-activity", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Authorization": `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(local.request)
      });
      if (!response.ok) return safeFallback(local.request, `SERVER_${response.status}`);
      const result = await response.json();
      if (result.mode === "existing" && result.existingActivityId) {
        const activity = activities().find(item => item.id === result.existingActivityId) || null;
        return activity ? { ...result, activity } : safeFallback(local.request, "EXISTING_ACTIVITY_NOT_FOUND_CLIENT_SIDE");
      }
      if (result.mode === "generated" && renderCompatible(result.activity)) {
        saveCache(local.request, result.activity);
        return result;
      }
      return safeFallback(local.request, result.reason || "SAFE_FALLBACK");
    } catch {
      return safeFallback(local.request, "SERVER_UNAVAILABLE");
    }
  }

  window.NALVI_REINFORCEMENT = Object.freeze({
    version: VERSION,
    canResolveWithoutAI,
    generateReinforcementActivity,
    audit: () => ({
      version: VERSION,
      authorizedFunction: "generateReinforcementActivity",
      automaticInvocation: false,
      chatbotAdded: false,
      clientApiKeyPresent: false,
      endpoint: "/api/generate-reinforcement-activity",
      renderActivityCompatibleTypes: [...TYPES],
      interfaceLanguages: [...LANGUAGES]
    })
  });
})();
