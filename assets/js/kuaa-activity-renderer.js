/*
 * KUAA · Paso 1
 * Motor de presentación para actividades basadas en objetos de datos.
 *
 * Este archivo no contiene lecciones. Recibe un objeto `activity` y delega
 * su presentación al componente registrado para `activity.type`.
 */
(() => {
  "use strict";

  const VERSION = "KUAA-P1-RENDERER-1";
  if (window.KUAA_ACTIVITY_ENGINE?.version === VERSION) return;

  const COPY = {
    es: { activity: "Actividad", check: "Comprobar", listen: "Escuchar expresión", correct: "¡Excelente! Respuesta correcta.", wrong: "Todavía no. Inténtalo nuevamente.", write: "Escribe tu respuesta", fill: "Completa la respuesta", match: "Relaciona cada elemento", order: "Ordena la frase", learningContext: "Estamos practicando", hint: "Pista", unavailable: "Este tipo de actividad se habilitará en una etapa posterior.", speaking: "Práctica oral", scenario: "Escenario conversacional" },
    en: { activity: "Activity", check: "Check", listen: "Listen to the expression", correct: "Excellent! Correct answer.", wrong: "Not yet. Try again.", write: "Write your answer", fill: "Complete the answer", match: "Match each item", order: "Order the sentence", learningContext: "We are practising", hint: "Hint", unavailable: "This activity type will be enabled in a later stage.", speaking: "Speaking practice", scenario: "Conversation scenario" },
    pt: { activity: "Atividade", check: "Verificar", listen: "Ouvir a expressão", correct: "Excelente! Resposta correta.", wrong: "Ainda não. Tente novamente.", write: "Escreva sua resposta", fill: "Complete a resposta", match: "Relacione cada elemento", order: "Ordene a frase", learningContext: "Estamos praticando", hint: "Pista", unavailable: "Este tipo de atividade será habilitado em uma etapa posterior.", speaking: "Prática oral", scenario: "Cenário de conversação" },
    fr: { activity: "Activité", check: "Vérifier", listen: "Écouter l’expression", correct: "Excellent ! Bonne réponse.", wrong: "Pas encore. Réessayez.", write: "Écrivez votre réponse", fill: "Complétez la réponse", match: "Associez chaque élément", order: "Remettez la phrase dans l’ordre", learningContext: "Nous travaillons", hint: "Indice", unavailable: "Ce type d’activité sera activé lors d’une étape ultérieure.", speaking: "Pratique orale", scenario: "Scénario de conversation" },
    it: { activity: "Attività", check: "Controlla", listen: "Ascolta l’espressione", correct: "Eccellente! Risposta corretta.", wrong: "Non ancora. Riprova.", write: "Scrivi la tua risposta", fill: "Completa la risposta", match: "Associa ogni elemento", order: "Ordina la frase", learningContext: "Stiamo esercitando", hint: "Indizio", unavailable: "Questo tipo di attività sarà abilitato in una fase successiva.", speaking: "Pratica orale", scenario: "Scenario di conversazione" },
    de: { activity: "Aktivität", check: "Prüfen", listen: "Ausdruck anhören", correct: "Ausgezeichnet! Richtige Antwort.", wrong: "Noch nicht. Versuche es erneut.", write: "Schreibe deine Antwort", fill: "Vervollständige die Antwort", match: "Ordne die Elemente zu", order: "Ordne den Satz", learningContext: "Wir üben", hint: "Hinweis", unavailable: "Dieser Aktivitätstyp wird in einer späteren Phase aktiviert.", speaking: "Sprechübung", scenario: "Gesprächsszenario" }
  };

  const TYPE_ALIASES = new Map([
    ["multiple-choice", "multiple-choice"], ["multiple_choice", "multiple-choice"], ["multiple choice", "multiple-choice"],
    ["listening", "listening"], ["escuchar", "listening"],
    ["order-sentence", "order-sentence"], ["ordering", "order-sentence"], ["ordenar-frase", "order-sentence"], ["ordenar frase", "order-sentence"],
    ["fill-blank", "fill-blank"], ["complete", "fill-blank"], ["completar", "fill-blank"],
    ["writing", "writing"], ["escritura", "writing"],
    ["matching", "matching"], ["association", "matching"], ["asociacion", "matching"], ["asociación", "matching"],
    ["speaking", "speaking"], ["scenario", "scenario"]
  ]);
  const renderers = new Map();

  const normalizeType = type => TYPE_ALIASES.get(String(type || "").trim().toLowerCase()) || String(type || "").trim().toLowerCase();
  const currentLanguage = requested => ["es", "en", "pt", "fr", "it", "de"].includes(requested) ? requested : "es";
  const localize = (value, language) => {
    if (value == null) return "";
    if (typeof value !== "object" || Array.isArray(value)) return String(value);
    return String(value[language] ?? value.es ?? value.en ?? Object.values(value)[0] ?? "");
  };
  const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
  const normalizeAnswer = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
  const resolveTarget = target => typeof target === "string" ? document.querySelector(target) : target;
  const copyFor = language => COPY[language] || COPY.es;
  const activityOptions = (activity, language) => (activity.options || []).map((option, index) => typeof option === "object" ? { id: String(option.id ?? index), label: localize(option.label, language), value: localize(option.value ?? option.label, language) } : { id: String(index), label: String(option), value: String(option) });
  const acceptedAnswers = (activity, language) => {
    const source = activity.acceptedAnswers ?? activity.answers ?? activity.answer ?? [];
    const list = Array.isArray(source) ? source : [source];
    return list.map(item => localize(item, language)).filter(Boolean);
  };

  function learningSupport(activity, language) {
    const copy = copyFor(language), prompt = localize(activity.prompt, language);
    const sourcePrompt = localize(activity.lessonContext?.sourcePrompt, language).trim();
    const template = localize(activity.template, language);
    const explanation = localize(activity.explanation, language).trim();
    const hints = (activity.hints || []).map(item => localize(item, language).trim()).filter(Boolean);
    const contextAlreadyInTemplate = sourcePrompt && normalizeAnswer(template).includes(normalizeAnswer(sourcePrompt));
    const showContext = sourcePrompt && !contextAlreadyInTemplate && normalizeAnswer(sourcePrompt) !== normalizeAnswer(prompt);
    if (!showContext && !explanation && !hints.length) return "";
    return `<aside class="kuaa-learning-support" aria-label="${escapeHtml(copy.learningContext)}">${showContext ? `<span>${escapeHtml(copy.learningContext)}</span><p>${escapeHtml(sourcePrompt)}</p>` : ""}${explanation ? `<p class="kuaa-learning-support__explanation">${escapeHtml(explanation)}</p>` : ""}${hints.length ? `<p class="kuaa-learning-support__hint"><b>${escapeHtml(copy.hint)}:</b> ${escapeHtml(hints.join(" · "))}</p>` : ""}</aside>`;
  }

  function shell(target, activity, language, body, typeLabel) {
    const copy = copyFor(language);
    delete target.dataset.nalviSubmissionLocked;
    target.dataset.nalviActivityStartedAt = String(Date.now());
    target.innerHTML = `<div class="quiz kuaa-activity" data-kuaa-activity="${escapeHtml(activity.id || "activity")}" data-activity-type="${escapeHtml(normalizeType(activity.type))}"><small class="kuaa-activity-kicker"><span class="kuaa-activity-mark" aria-hidden="true"></span>${escapeHtml(typeLabel || copy.activity)}</small><h3>${escapeHtml(localize(activity.prompt, language))}</h3>${activity.instruction ? `<p class="kuaa-activity-instruction">${escapeHtml(localize(activity.instruction, language))}</p>` : ""}${learningSupport(activity, language)}${body}<div id="feedback" aria-live="polite"></div></div>`;
    return target.querySelector(".kuaa-activity");
  }

  function defaultResult(target, result, language) {
    const feedback = target.querySelector("#feedback"), copy = copyFor(language);
    if (!feedback) return;
    feedback.className = `feedback ${result.correct ? "ok" : "no"}`;
    feedback.textContent = result.correct ? copy.correct : copy.wrong;
  }

  function submit(target, activity, context, result) {
    if (target.dataset.nalviSubmissionLocked === "true") return { ignored: true, reason: "SUBMISSION_ALREADY_EVALUATED" };
    target.dataset.nalviSubmissionLocked = "true";
    const responseTime = Math.max(0, Date.now() - Number(target.dataset.nalviActivityStartedAt || Date.now()));
    const scoredResult = { ...result, responseTime };
    const progression = window.NALVI_PROGRESSION?.evaluateActivityResult({
      activity,
      result: scoredResult,
      uiLocale: context.language,
      atObjectiveBoundary: Boolean(activity.objectiveBoundary)
    }) || {
      decision: scoredResult.correct ? "CONTINUE_PRACTICE" : "BLOCK_AND_INTERVENE",
      canAdvance: scoredResult.correct === true,
      canComplete: false,
      reason: scoredResult.correct ? "progressionClientUnavailableSafePractice" : "progressionClientUnavailableSafeBlock"
    };
    const outcome = typeof context.onSubmit === "function"
      ? context.onSubmit({ ...scoredResult, progression }, activity)
      : (defaultResult(target, scoredResult, context.language), scoredResult);
    const adaptiveSubmitHandled = typeof context.onAdaptiveSubmit === "function";
    if (adaptiveSubmitHandled) {
      context.onAdaptiveSubmit({ ...scoredResult, progression }, activity);
    }
    target.dispatchEvent(new CustomEvent("nalvi:activity-scored", {
      bubbles: true,
      detail: {
        activity,
        result: { ...scoredResult },
        progression,
        uiLocale: context.language,
        scoredLocally: true,
        canScoreWithoutAI: true,
        adaptiveSubmitHandled
      }
    }));
    return { outcome, progression };
  }

  function renderChoice(target, activity, context, prelude = "") {
    const { language } = context, copy = copyFor(language), options = activityOptions(activity, language);
    const body = `${prelude}<div class="answers">${options.map(option => `<button class="answer" type="button" data-kuaa-option="${escapeHtml(option.id)}" data-a="${escapeHtml(option.value)}">${escapeHtml(option.label)}</button>`).join("")}</div><div class="quiz-actions"><button class="btn" id="check" type="button" disabled>${escapeHtml(copy.check)}</button></div>`;
    shell(target, activity, language, body, copy.activity);
    let selectedOption = null;
    const check = target.querySelector("#check");
    target.querySelectorAll("[data-kuaa-option]").forEach(button => button.addEventListener("click", () => {
      target.querySelectorAll("[data-kuaa-option]").forEach(option => option.classList.remove("selected"));
      button.classList.add("selected");
      selectedOption = options.find(option => option.id === button.dataset.kuaaOption) || null;
      check.disabled = !selectedOption;
    }));
    check.addEventListener("click", () => {
      if (!selectedOption) return;
      submit(target, activity, context, { value: selectedOption.value, optionId: selectedOption.id, correct: selectedOption.id === String(activity.correctOptionId) });
    });
  }

  function renderMultipleChoice(target, activity, context) {
    renderChoice(target, activity, context);
  }

  function renderListening(target, activity, context) {
    const copy = copyFor(context.language);
    const prelude = `<div class="kuaa-listen"><button type="button" data-kuaa-listen aria-label="${escapeHtml(copy.listen)}">🔊</button><span>${escapeHtml(copy.listen)}</span></div>`;
    renderChoice(target, activity, context, prelude);
    target.querySelector("[data-kuaa-listen]")?.addEventListener("click", event => {
      const phrase = localize(activity.audioText || activity.answer, context.language);
      if (typeof window.playPronunciation === "function") return window.playPronunciation(phrase, event.currentTarget);
      if (!("speechSynthesis" in window) || !phrase) return;
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(phrase);
      utterance.lang = "gn-PY";
      speechSynthesis.speak(utterance);
    });
  }

  function renderOrderSentence(target, activity, context) {
    const language = context.language, copy = copyFor(language);
    const tokens = (activity.tokens || []).map((token, index) => typeof token === "object" ? { id: String(token.id ?? index), label: localize(token.label, language) } : { id: String(index), label: String(token) });
    const body = `<div class="kuaa-order-bank">${tokens.map(token => `<button class="kuaa-order-chip" type="button" data-kuaa-token="${escapeHtml(token.id)}">${escapeHtml(token.label)}</button>`).join("")}</div><div class="kuaa-order-result" data-kuaa-order-result></div><div class="quiz-actions"><button class="btn" id="check" type="button" disabled>${escapeHtml(copy.check)}</button></div>`;
    shell(target, activity, language, body, copy.order);
    const selected = [], result = target.querySelector("[data-kuaa-order-result]"), check = target.querySelector("#check");
    const repaint = () => {
      result.innerHTML = selected.map(id => { const token = tokens.find(item => item.id === id); return `<button class="kuaa-order-chip" type="button" data-kuaa-remove-token="${escapeHtml(id)}">${escapeHtml(token?.label || "")}</button>`; }).join("");
      target.querySelectorAll("[data-kuaa-token]").forEach(button => button.disabled = selected.includes(button.dataset.kuaaToken));
      check.disabled = !selected.length;
      result.querySelectorAll("[data-kuaa-remove-token]").forEach(button => button.addEventListener("click", () => { selected.splice(selected.indexOf(button.dataset.kuaaRemoveToken), 1); repaint(); }));
    };
    target.querySelectorAll("[data-kuaa-token]").forEach(button => button.addEventListener("click", () => { selected.push(button.dataset.kuaaToken); repaint(); }));
    check.addEventListener("click", () => {
      const expected = (activity.correctOrder || []).map(String), correct = expected.length === selected.length && expected.every((id, index) => id === selected[index]);
      submit(target, activity, context, { value: selected.map(id => tokens.find(token => token.id === id)?.label || "").join(" "), order: [...selected], correct });
    });
  }

  function renderFillBlank(target, activity, context) {
    const language = context.language, copy = copyFor(language), rawTemplate = localize(activity.template, language);
    const sourcePrompt = localize(activity.lessonContext?.sourcePrompt, language).trim();
    const safeTemplate = rawTemplate.replace(/\{\{blank\}\}|_+/g, "").trim() ? rawTemplate : `${sourcePrompt || copy.fill}: {{blank}}`;
    const template = safeTemplate.replace(/\{\{blank\}\}/g, "______");
    const body = `<div class="kuaa-fill-line">${escapeHtml(template)}</div><input class="kuaa-fill-answer" data-kuaa-input autocomplete="off" placeholder="${escapeHtml(copy.fill)}"><div class="quiz-actions"><button class="btn" id="check" type="button" disabled>${escapeHtml(copy.check)}</button></div>`;
    shell(target, activity, language, body, copy.fill);
    bindTextAnswer(target, activity, context);
  }

  function renderWriting(target, activity, context) {
    const language = context.language, copy = copyFor(language);
    const body = `<textarea class="kuaa-text-answer" data-kuaa-input rows="3" placeholder="${escapeHtml(localize(activity.placeholder, language) || copy.write)}"></textarea><div class="quiz-actions"><button class="btn" id="check" type="button" disabled>${escapeHtml(copy.check)}</button></div>`;
    shell(target, activity, language, body, copy.write);
    bindTextAnswer(target, activity, context);
  }

  function bindTextAnswer(target, activity, context) {
    const input = target.querySelector("[data-kuaa-input]"), check = target.querySelector("#check"), answers = acceptedAnswers(activity, context.language).map(normalizeAnswer);
    input.addEventListener("input", () => check.disabled = !input.value.trim());
    check.addEventListener("click", () => { const value = input.value.trim(); submit(target, activity, context, { value, correct: answers.includes(normalizeAnswer(value)) }); });
  }

  function renderMatching(target, activity, context) {
    const language = context.language, copy = copyFor(language), pairs = (activity.pairs || []).map((pair, index) => ({ id: String(pair.id ?? index), left: localize(pair.left, language), right: localize(pair.right, language) }));
    const shuffledRight = [...pairs].sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true })).reverse();
    const body = `<div class="kuaa-match-grid"><div class="kuaa-match-column">${pairs.map(pair => `<button class="kuaa-match-option" type="button" data-kuaa-left="${escapeHtml(pair.id)}">${escapeHtml(pair.left)}</button>`).join("")}</div><div class="kuaa-match-column">${shuffledRight.map(pair => `<button class="kuaa-match-option" type="button" data-kuaa-right="${escapeHtml(pair.id)}">${escapeHtml(pair.right)}</button>`).join("")}</div></div>`;
    shell(target, activity, language, body, copy.match);
    let left = null; const matched = new Set();
    target.querySelectorAll("[data-kuaa-left]").forEach(button => button.addEventListener("click", () => { if (matched.has(button.dataset.kuaaLeft)) return; target.querySelectorAll("[data-kuaa-left]").forEach(node => node.classList.remove("selected")); button.classList.add("selected"); left = button; }));
    target.querySelectorAll("[data-kuaa-right]").forEach(button => button.addEventListener("click", () => {
      if (!left || matched.has(button.dataset.kuaaRight)) return;
      const correct = left.dataset.kuaaLeft === button.dataset.kuaaRight;
      if (!correct) return submit(target, activity, context, { value: { left: left.dataset.kuaaLeft, right: button.dataset.kuaaRight }, correct: false });
      matched.add(button.dataset.kuaaRight); left.classList.remove("selected"); left.classList.add("matched"); button.classList.add("matched"); left = null;
      if (matched.size === pairs.length) submit(target, activity, context, { value: [...matched], correct: true });
    }));
  }

  function renderPlaceholder(target, activity, context, kind) {
    const copy = copyFor(context.language), label = kind === "speaking" ? copy.speaking : copy.scenario, icon = kind === "speaking" ? "🎙️" : "💬";
    const body = `<div class="kuaa-placeholder"><div><span>${icon}</span><b>${escapeHtml(label)}</b><p>${escapeHtml(localize(activity.placeholder, context.language) || copy.unavailable)}</p></div></div>`;
    shell(target, activity, context.language, body, label);
  }

  function registerActivityRenderer(type, renderer) {
    const normalized = normalizeType(type);
    if (!normalized || typeof renderer !== "function") throw new TypeError("El componente de actividad no es válido.");
    renderers.set(normalized, renderer);
  }

  function renderActivity(activity, options = {}) {
    if (!activity || typeof activity !== "object") throw new TypeError("renderActivity(activity) necesita un objeto de actividad.");
    const target = resolveTarget(options.target || "#lessonBody"), language = currentLanguage(options.language || document.documentElement.lang);
    if (!target) throw new Error("No se encontró el contenedor de la actividad.");
    const type = normalizeType(activity.type), renderer = renderers.get(type);
    if (!renderer) {
      target.innerHTML = `<div class="kuaa-activity-error"><b>Actividad no disponible:</b> ${escapeHtml(type || "sin tipo")}</div>`;
      return { activity, type, target, rendered: false };
    }
    renderer(target, activity, { ...options, language, type });
    target.dispatchEvent(new CustomEvent("kuaa:activity-rendered", { detail: { id: activity.id || "", type } }));
    return { activity, type, target, rendered: true };
  }

  registerActivityRenderer("multiple-choice", renderMultipleChoice);
  registerActivityRenderer("listening", renderListening);
  registerActivityRenderer("order-sentence", renderOrderSentence);
  registerActivityRenderer("fill-blank", renderFillBlank);
  registerActivityRenderer("writing", renderWriting);
  registerActivityRenderer("matching", renderMatching);
  registerActivityRenderer("speaking", (target, activity, context) => renderPlaceholder(target, activity, context, "speaking"));
  registerActivityRenderer("scenario", (target, activity, context) => renderPlaceholder(target, activity, context, "scenario"));

  const activityData = window.KUAA_GENERAL_ACTIVITY_DATA;
  const migrated = new Map((activityData?.activities || []).map(activity => [`${activity.legacy?.unit}:${activity.legacy?.question}`, activity]));
  const legacyRenderQuiz = typeof renderQuiz === "function" ? renderQuiz : null;

  function compatibleWithLegacy(activity, legacyQuestion, language) {
    if (!Array.isArray(legacyQuestion) || !Array.isArray(legacyQuestion[2])) return false;
    const options = activityOptions(activity, language).map(option => option.value);
    return options.length === legacyQuestion[2].length && options.every((value, index) => value === legacyQuestion[2][index]);
  }

  if (legacyRenderQuiz) {
    renderQuiz = function (...args) {
      const result = legacyRenderQuiz.apply(this, args);
      const activity = migrated.get(`${unit}:${step}`);
      if (!activity) return result;
      const language = currentLanguage(typeof lang === "string" ? lang : document.documentElement.lang), legacyQuestion = quizData(unit)?.[step];
      if (!compatibleWithLegacy(activity, legacyQuestion, language)) {
        console.warn("KUAA_ACTIVITY_LEGACY_MISMATCH", activity.id, language);
        return result;
      }
      renderActivity(activity, {
        target: "#lessonBody",
        language,
        onSubmit: answer => {
          selected = answer.value;
          checked = false;
          checkAnswer(answer.progression, { fromDynamicActivity: true });
        }
      });
      return result;
    };
  }

  const audit = () => ({
    version: VERSION,
    dataVersion: activityData?.version || null,
    rendererTypes: [...renderers.keys()],
    migratedActivityIds: [...migrated.values()].map(activity => activity.id),
    migratedCount: migrated.size,
    legacyQuizConnected: Boolean(legacyRenderQuiz),
    firebaseRulesChanged: false,
    artificialIntelligenceAdded: false
  });

  window.renderActivity = renderActivity;
  window.KUAA_ACTIVITY_ENGINE = Object.freeze({
    version: VERSION,
    renderActivity,
    registerActivityRenderer,
    submitActivityResult: submit,
    getRendererTypes: () => [...renderers.keys()],
    audit
  });
})();
