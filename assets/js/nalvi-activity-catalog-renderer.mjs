import {
  ACTIVITY_TYPES,
  NALVI_ACTIVITY_CATALOG_V1,
  catalogAudit,
  isEnabledActivityType
} from "../../activity-catalog/nalvi-activity-catalog.mjs";
import { ANSWER_STATUSES, evaluateAnswer, normalizeAnswerSurface } from "../../assessment/nalvi-answer-evaluator.mjs";

const VERSION = "NALVI-ACTIVITY-CATALOG-RENDERER-4";
const LOCALES = new Set(["es", "en", "pt", "fr", "it", "de"]);
const COPY = Object.freeze({
  es: { check: "Comprobar", reset: "Reiniciar", select: "Selecciona una respuesta", listen: "Escucha y selecciona", playAudio: "Escuchar audio", match: "Relaciona cada elemento", sort: "Clasifica las tarjetas", buildWord: "Construye la palabra", buildSentence: "Construye la expresión", findError: "Encuentra la parte que necesita corrección", chooseCorrection: "Elige la corrección", dialogue: "Observa la conversación", nextTurn: "¿Qué respuesta tendría sentido ahora?", orderDialogue: "Ordena la conversación", recall: "Escribe tu respuesta", step: "Paso", correct: "¡Bien!", wrong: "No del todo. Probemos de otra forma.", hint: "Ver pista", explanation: "Ver explicación", near: "Casi correcto. Revisa la forma.", equivalent: "¡Correcto! Esta forma también es válida.", review: "Vamos a practicar con una forma ya validada." },
  en: { check: "Check", reset: "Reset", select: "Choose an answer", listen: "Listen and choose", playAudio: "Play audio", match: "Match each item", sort: "Sort the cards", buildWord: "Build the word", buildSentence: "Build the expression", findError: "Find the part that needs correction", chooseCorrection: "Choose the correction", dialogue: "Read the conversation", nextTurn: "What response makes sense now?", orderDialogue: "Put the conversation in order", recall: "Write your answer", step: "Step", correct: "Well done!", wrong: "Not quite. Let’s try another way.", hint: "View hint", explanation: "View explanation", near: "Almost right. Check the form.", equivalent: "Correct! This form is also valid.", review: "Let’s practise with an already validated form." },
  pt: { check: "Verificar", reset: "Reiniciar", select: "Selecione uma resposta", listen: "Ouça e selecione", playAudio: "Ouvir áudio", match: "Relacione cada elemento", sort: "Classifique os cartões", buildWord: "Construa a palavra", buildSentence: "Construa a expressão", findError: "Encontre a parte que precisa de correção", chooseCorrection: "Escolha a correção", dialogue: "Observe a conversa", nextTurn: "Qual resposta faz sentido agora?", orderDialogue: "Ordene a conversa", recall: "Escreva sua resposta", step: "Passo", correct: "Muito bem!", wrong: "Ainda não. Vamos tentar de outra forma.", hint: "Ver pista", explanation: "Ver explicação", near: "Quase certo. Revise a forma.", equivalent: "Correto! Esta forma também é válida.", review: "Vamos praticar com uma forma já validada." },
  fr: { check: "Vérifier", reset: "Recommencer", select: "Choisissez une réponse", listen: "Écoutez et choisissez", playAudio: "Écouter l’audio", match: "Associez chaque élément", sort: "Classez les cartes", buildWord: "Construisez le mot", buildSentence: "Construisez l’expression", findError: "Trouvez la partie à corriger", chooseCorrection: "Choisissez la correction", dialogue: "Lisez la conversation", nextTurn: "Quelle réponse convient maintenant ?", orderDialogue: "Remettez la conversation dans l’ordre", recall: "Écrivez votre réponse", step: "Étape", correct: "Très bien !", wrong: "Pas tout à fait. Essayons autrement.", hint: "Voir l’indice", explanation: "Voir l’explication", near: "Presque correct. Vérifiez la forme.", equivalent: "Correct ! Cette forme est également valable.", review: "Pratiquons avec une forme déjà validée." },
  it: { check: "Controlla", reset: "Ricomincia", select: "Scegli una risposta", listen: "Ascolta e scegli", playAudio: "Ascolta l’audio", match: "Associa ogni elemento", sort: "Classifica le schede", buildWord: "Costruisci la parola", buildSentence: "Costruisci l’espressione", findError: "Trova la parte da correggere", chooseCorrection: "Scegli la correzione", dialogue: "Leggi la conversazione", nextTurn: "Quale risposta ha senso adesso?", orderDialogue: "Metti in ordine la conversazione", recall: "Scrivi la tua risposta", step: "Passaggio", correct: "Molto bene!", wrong: "Non proprio. Proviamo in un altro modo.", hint: "Vedi indizio", explanation: "Vedi spiegazione", near: "Quasi corretto. Controlla la forma.", equivalent: "Corretto! Anche questa forma è valida.", review: "Esercitiamoci con una forma già convalidata." },
  de: { check: "Prüfen", reset: "Neu starten", select: "Wähle eine Antwort", listen: "Höre zu und wähle", playAudio: "Audio abspielen", match: "Ordne die Elemente zu", sort: "Sortiere die Karten", buildWord: "Bilde das Wort", buildSentence: "Bilde den Ausdruck", findError: "Finde den Teil, der korrigiert werden muss", chooseCorrection: "Wähle die Korrektur", dialogue: "Lies den Dialog", nextTurn: "Welche Antwort passt jetzt?", orderDialogue: "Bringe den Dialog in die richtige Reihenfolge", recall: "Schreibe deine Antwort", step: "Schritt", correct: "Sehr gut!", wrong: "Noch nicht ganz. Versuchen wir es anders.", hint: "Hinweis anzeigen", explanation: "Erklärung anzeigen", near: "Fast richtig. Prüfe die Form.", equivalent: "Richtig! Diese Form ist ebenfalls gültig.", review: "Üben wir mit einer bereits geprüften Form." }
});

const engine = window.KUAA_ACTIVITY_ENGINE;
if (!engine?.registerActivityRenderer || !engine?.submitActivityResult) throw new Error("NALVI_ACTIVITY_ENGINE_UNAVAILABLE");
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
const localeFor = value => LOCALES.has(value) ? value : "es";
const localize = (value, locale) => value && typeof value === "object" && !Array.isArray(value) ? String(value[locale] ?? value.es ?? value.en ?? Object.values(value)[0] ?? "") : String(value ?? "");
const normalize = normalizeAnswerSurface;
const optionValue = (option, locale) => localize(option?.text ?? option?.label ?? option?.value ?? option, locale);
const optionId = (option, index) => String(option?.id ?? `option-${index}`);
const shuffled = values => [...values].map((value, index) => ({ value, sort: `${String(value?.id ?? value?.text ?? value)}-${(index * 7 + 3) % 11}` })).sort((a, b) => a.sort.localeCompare(b.sort)).map(item => item.value);

function submit(target, activity, context, result) {
  let assessed = result;
  if (typeof result.value === "string") {
    const options = activity.options || [];
    const correctOption = options.find((option, index) => optionId(option, index) === String(activity.correctOptionId));
    const canonicalAnswers = [
      ...(activity.acceptedAnswers || []),
      activity.correctAnswer,
      activity.answer,
      correctOption ? optionValue(correctOption, localeFor(context.language)) : ""
    ].filter(Boolean);
    const evaluation = evaluateAnswer({
      studentAnswer: result.value,
      canonicalAnswers,
      approvedEquivalents: activity.approvedEquivalents || [],
      approvedVariants: activity.approvedVariants || [],
      activity,
      context: { learningObjectiveId: activity.learningObjectiveId, conceptId: activity.conceptId || activity.conceptIds?.[0] },
      allowPendingReview: activity.activityType === ACTIVITY_TYPES.INDEPENDENT_RECALL || activity.allowPendingReview === true
    });
    if (evaluation.reviewRecord) window.NALVI_ANSWER_EVALUATOR?.queueReview?.(evaluation.reviewRecord);
    assessed = { ...result, ...evaluation, correct: result.correct === true || evaluation.correct === true };
  }
  return engine.submitActivityResult(target, activity, context, assessed);
}

function shell(target, activity, context, body, instructionFallback) {
  const locale = localeFor(context.language), copy = COPY[locale], instruction = localize(activity.instruction, locale) || instructionFallback || copy.select;
  target.dataset.nalviActivityStartedAt = String(Date.now());
  target.dataset.nalviSubmissionLocked = "false";
  const prompt = localize(activity.prompt, locale).trim();
  const visibleInstruction = normalize(instruction) === normalize(prompt) ? "" : instruction;
  const visibleHint = Number(activity.helpLevel || 0) > 0 ? localize(activity.hints?.[0], locale) : "";
  const explanation = localize(activity.explanation, locale).trim();
  const disclosure = [
    visibleHint ? `<details class="nalvi-progressive-disclosure"><summary>${escapeHtml(copy.hint)}</summary><p>${escapeHtml(visibleHint)}</p></details>` : "",
    explanation ? `<details class="nalvi-progressive-disclosure"><summary>${escapeHtml(copy.explanation)}</summary><p>${escapeHtml(explanation)}</p></details>` : ""
  ].join("");
  target.innerHTML = `<section class="kuaa-activity nalvi-catalog-activity" data-catalog-type="${escapeHtml(activity.activityType || activity.type)}">${visibleInstruction ? `<small class="kuaa-activity-kicker"><span class="kuaa-activity-mark" aria-hidden="true"></span>${escapeHtml(visibleInstruction)}</small>` : ""}${prompt ? `<h3>${escapeHtml(prompt)}</h3>` : ""}${localize(activity.contextText ?? activity.scenario, locale) ? `<div class="nalvi-context-card">${escapeHtml(localize(activity.contextText ?? activity.scenario, locale))}</div>` : ""}${disclosure}<div class="nalvi-catalog-stage">${body}</div><div id="feedback" aria-live="polite"></div></section>`;
  return { locale, copy };
}

function actions(copy, disabled = true) {
  return `<div class="quiz-actions nalvi-catalog-actions"><button class="btn nalvi-secondary" type="button" data-catalog-reset>${escapeHtml(copy.reset)}</button><button class="btn" type="button" data-catalog-check ${disabled ? "disabled" : ""}>${escapeHtml(copy.check)}</button></div>`;
}

function renderChoice(target, activity, context, { image = false, dialogue = false, audio = false } = {}) {
  const locale = localeFor(context.language), copy = COPY[locale], options = activity.options || [];
  const dialogueHtml = dialogue ? renderDialogueBubbles(activity.dialogue || activity.turns || [], locale) : "";
  const audioHtml = audio ? `<div class="nalvi-audio-card"><button type="button" data-catalog-audio data-audio-state="loading" aria-label="${escapeHtml(copy.playAudio)}" aria-pressed="false" disabled><span aria-hidden="true">🔊</span><span>${escapeHtml(copy.playAudio)}</span></button></div>` : "";
  const body = `${dialogueHtml}${audioHtml}<div class="nalvi-choice-grid ${image ? "nalvi-image-choice" : ""}">${options.map((option, index) => `<button type="button" class="nalvi-choice-card" data-choice="${escapeHtml(optionId(option, index))}">${image ? `<img src="${escapeHtml(option.image || option.imageUrl)}" alt="${escapeHtml(localize(option.alt || "", locale))}" loading="lazy">` : ""}<span>${escapeHtml(optionValue(option, locale))}</span></button>`).join("")}</div>${actions(copy)}`;
  shell(target, activity, context, body, audio ? copy.listen : copy.select);
  if (audio) {
    const playButton = target.querySelector("[data-catalog-audio]");
    const registry = window.NALVI_RECORDED_AUDIO;
    const selection = {
      audioId: String(activity.audioId || "").trim(),
      audioPath: String(activity.audioPath || "").trim(),
      audioText: String(activity.audioText || "").trim(),
      audioAuthorized: activity.audioAuthorized === true,
      humanRecorded: activity.humanRecorded === true,
      audioSource: String(activity.audioSource || "").trim()
    };
    const updateAudioAvailability = () => {
      const authorized = registry?.authorize?.(selection);
      if (!playButton) return;
      playButton.disabled = !authorized;
      playButton.dataset.audioState = authorized ? "ready" : "unavailable";
      playButton.setAttribute("aria-disabled", String(!authorized));
    };
    if (registry?.ready?.then) registry.ready.then(updateAudioAvailability, updateAudioAvailability);
    else updateAudioAvailability();
    playButton?.addEventListener("click", async () => {
      if (playButton.disabled || !registry?.playSelection) return;
      const played = await registry.playSelection(selection, playButton);
      if (!played && playButton.getAttribute?.("aria-pressed") !== "true") {
        playButton.dataset.audioState = "unavailable";
        playButton.disabled = true;
        playButton.setAttribute("aria-disabled", "true");
      }
    });
  }
  let selected = "";
  const check = target.querySelector("[data-catalog-check]");
  target.querySelectorAll("[data-choice]").forEach(button => button.addEventListener("click", () => {
    target.querySelectorAll("[data-choice]").forEach(node => node.classList.remove("is-selected"));
    button.classList.add("is-selected"); selected = button.dataset.choice; check.disabled = false;
  }));
  target.querySelector("[data-catalog-reset]")?.addEventListener("click", () => { selected = ""; check.disabled = true; target.querySelectorAll("[data-choice]").forEach(node => node.classList.remove("is-selected")); });
  check.addEventListener("click", () => {
    const chosen = options.find((option, index) => optionId(option, index) === selected);
    submit(target, activity, context, { value: optionValue(chosen, locale), optionId: selected, correct: selected === String(activity.correctOptionId) || normalize(optionValue(chosen, locale)) === normalize(activity.correctAnswer) });
  });
}

function renderDialogueBubbles(turns, locale) {
  return `<div class="nalvi-dialogue" aria-label="${escapeHtml(COPY[locale].dialogue)}">${turns.map((turn, index) => `<div class="nalvi-dialogue-turn ${index % 2 ? "is-right" : "is-left"}"><b>${escapeHtml(localize(turn.speaker, locale) || (index % 2 ? "B" : "A"))}</b><p>${escapeHtml(localize(turn.text, locale))}</p></div>`).join("")}</div>`;
}

function renderArrowMatch(target, activity, context) {
  const locale = localeFor(context.language), copy = COPY[locale], pairs = activity.pairs || [], right = shuffled(pairs);
  const body = `<div class="nalvi-arrow-match"><div class="nalvi-match-column">${pairs.map((pair, index) => `<button type="button" data-match-left="${escapeHtml(String(pair.id ?? index))}">${escapeHtml(localize(pair.left, locale))}</button>`).join("")}</div><div class="nalvi-match-links" aria-hidden="true"></div><div class="nalvi-match-column">${right.map((pair, index) => `<button type="button" data-match-right="${escapeHtml(String(pair.id ?? index))}">${escapeHtml(localize(pair.right, locale))}</button>`).join("")}</div></div><p class="nalvi-match-progress" aria-live="polite">0 / ${pairs.length}</p>`;
  shell(target, activity, context, body, copy.match);
  let left = null, mistakes = 0; const matched = new Set(), links = target.querySelector(".nalvi-match-links"), progress = target.querySelector(".nalvi-match-progress");
  target.querySelectorAll("[data-match-left]").forEach(button => button.addEventListener("click", () => { if (matched.has(button.dataset.matchLeft)) return; target.querySelectorAll("[data-match-left]").forEach(node => node.classList.remove("is-selected")); button.classList.add("is-selected"); left = button; }));
  target.querySelectorAll("[data-match-right]").forEach(button => button.addEventListener("click", () => {
    if (!left || matched.has(button.dataset.matchRight)) return;
    const ok = left.dataset.matchLeft === button.dataset.matchRight;
    if (!ok) { mistakes += 1; button.classList.add("is-wrong"); setTimeout(() => button.classList.remove("is-wrong"), 420); return; }
    matched.add(button.dataset.matchRight); left.classList.remove("is-selected"); left.classList.add("is-matched"); button.classList.add("is-matched"); links.insertAdjacentHTML("beforeend", "<span>→</span>"); left = null; progress.textContent = `${matched.size} / ${pairs.length}`;
    if (matched.size === pairs.length) submit(target, activity, context, { value: [...matched], correct: mistakes === 0, completedPairs: matched.size, mistakes });
  }));
}

function renderCategorySort(target, activity, context) {
  const locale = localeFor(context.language), copy = COPY[locale], categories = activity.categories || [], items = shuffled(activity.items || []);
  const body = `<div class="nalvi-sort-bank">${items.map((item, index) => `<button type="button" data-sort-item="${escapeHtml(String(item.id ?? index))}">${escapeHtml(localize(item.text ?? item.label, locale))}</button>`).join("")}</div><div class="nalvi-sort-categories">${categories.map(category => `<section data-sort-category="${escapeHtml(String(category.id))}"><h4>${escapeHtml(localize(category.label, locale))}</h4><div></div></section>`).join("")}</div>${actions(copy)}`;
  shell(target, activity, context, body, copy.sort);
  const assignments = new Map(); let selected = ""; const check = target.querySelector("[data-catalog-check]");
  const repaint = () => {
    target.querySelectorAll("[data-sort-item]").forEach(button => { button.classList.toggle("is-selected", button.dataset.sortItem === selected); button.hidden = assignments.has(button.dataset.sortItem); });
    target.querySelectorAll("[data-sort-category]").forEach(section => { const id = section.dataset.sortCategory; section.querySelector("div").innerHTML = [...assignments].filter(([, categoryId]) => categoryId === id).map(([itemId]) => { const item = items.find((value, index) => String(value.id ?? index) === itemId); return `<button type="button" data-unsort-item="${escapeHtml(itemId)}">${escapeHtml(localize(item?.text ?? item?.label, locale))}</button>`; }).join(""); });
    check.disabled = assignments.size !== items.length;
    target.querySelectorAll("[data-unsort-item]").forEach(button => button.addEventListener("click", () => { assignments.delete(button.dataset.unsortItem); repaint(); }));
  };
  target.querySelectorAll("[data-sort-item]").forEach(button => button.addEventListener("click", () => { selected = button.dataset.sortItem; repaint(); }));
  target.querySelectorAll("[data-sort-category]").forEach(section => section.addEventListener("click", event => { if (event.target.closest("[data-unsort-item]") || !selected) return; assignments.set(selected, section.dataset.sortCategory); selected = ""; repaint(); }));
  target.querySelector("[data-catalog-reset]")?.addEventListener("click", () => { assignments.clear(); selected = ""; repaint(); });
  check.addEventListener("click", () => submit(target, activity, context, { value: Object.fromEntries(assignments), correct: items.every((item, index) => assignments.get(String(item.id ?? index)) === String(item.categoryId)) }));
}

function renderTileBuilder(target, activity, context, { dialogue = false } = {}) {
  const locale = localeFor(context.language), copy = COPY[locale], source = dialogue ? (activity.dialogue || activity.turns || []) : (activity.tiles || activity.tokens || []);
  const tiles = shuffled(source.map((item, index) => ({ ...item, id: String(item.id ?? index), text: localize(item.text ?? item.label, locale), speaker: localize(item.speaker, locale) })));
  const expected = (activity.correctOrder || []).map(String), selected = [];
  const body = `<div class="nalvi-build-zone" data-build-zone aria-live="polite"></div><div class="nalvi-tile-bank">${tiles.map(tile => `<button type="button" data-tile="${escapeHtml(tile.id)}">${dialogue && tile.speaker ? `<b>${escapeHtml(tile.speaker)}:</b> ` : ""}${escapeHtml(tile.text)}</button>`).join("")}</div>${actions(copy)}`;
  shell(target, activity, context, body, dialogue ? copy.orderDialogue : (activity.activityType === ACTIVITY_TYPES.WORD_TILE_BUILDER ? copy.buildWord : copy.buildSentence));
  const zone = target.querySelector("[data-build-zone]"), check = target.querySelector("[data-catalog-check]");
  const repaint = () => { zone.innerHTML = selected.map(id => { const tile = tiles.find(item => item.id === id); return `<button type="button" data-remove-tile="${escapeHtml(id)}">${escapeHtml(tile?.text || "")}</button>`; }).join(""); target.querySelectorAll("[data-tile]").forEach(button => button.disabled = selected.includes(button.dataset.tile)); check.disabled = selected.length === 0; zone.querySelectorAll("[data-remove-tile]").forEach(button => button.addEventListener("click", () => { selected.splice(selected.lastIndexOf(button.dataset.removeTile), 1); repaint(); })); };
  target.querySelectorAll("[data-tile]").forEach(button => button.addEventListener("click", () => { selected.push(button.dataset.tile); repaint(); }));
  target.querySelector("[data-catalog-reset]")?.addEventListener("click", () => { selected.splice(0); repaint(); });
  check.addEventListener("click", () => submit(target, activity, context, { value: selected.map(id => tiles.find(tile => tile.id === id)?.text).join(" "), order: [...selected], correct: selected.length === expected.length && expected.every((id, index) => id === selected[index]) }));
}

function renderErrorSpotting(target, activity, context) {
  const locale = localeFor(context.language), copy = COPY[locale], segments = activity.segments || [], corrections = activity.corrections || activity.options || [];
  const body = `<div class="nalvi-error-segments">${segments.map((segment, index) => `<button type="button" data-error-segment="${escapeHtml(String(segment.id ?? index))}">${escapeHtml(localize(segment.text, locale))}</button>`).join("")}</div><div class="nalvi-correction-options" hidden>${corrections.map((option, index) => `<button type="button" data-correction="${escapeHtml(optionId(option, index))}">${escapeHtml(optionValue(option, locale))}</button>`).join("")}</div>${actions(copy)}`;
  shell(target, activity, context, body, copy.findError);
  let segmentId = "", correctionId = ""; const check = target.querySelector("[data-catalog-check]"), box = target.querySelector(".nalvi-correction-options");
  target.querySelectorAll("[data-error-segment]").forEach(button => button.addEventListener("click", () => { target.querySelectorAll("[data-error-segment]").forEach(node => node.classList.remove("is-selected")); button.classList.add("is-selected"); segmentId = button.dataset.errorSegment; box.hidden = false; }));
  target.querySelectorAll("[data-correction]").forEach(button => button.addEventListener("click", () => { target.querySelectorAll("[data-correction]").forEach(node => node.classList.remove("is-selected")); button.classList.add("is-selected"); correctionId = button.dataset.correction; check.disabled = !segmentId; }));
  target.querySelector("[data-catalog-reset]")?.addEventListener("click", () => { segmentId = correctionId = ""; check.disabled = true; box.hidden = true; target.querySelectorAll(".is-selected").forEach(node => node.classList.remove("is-selected")); });
  check.addEventListener("click", () => { const segment = segments.find((value, index) => String(value.id ?? index) === segmentId), correction = corrections.find((value, index) => optionId(value, index) === correctionId); submit(target, activity, context, { value: { segmentId, correction: optionValue(correction, locale) }, correct: segment?.isIncorrect === true && (correctionId === String(activity.correctCorrectionId) || normalize(optionValue(correction, locale)) === normalize(activity.correctAnswer)) }); });
}

function renderDialogueComprehension(target, activity, context) {
  const question = activity.questions?.[0] || activity;
  renderChoice(target, { ...activity, prompt: question.prompt || activity.prompt, options: question.options || activity.options, correctOptionId: question.correctOptionId || activity.correctOptionId, correctAnswer: question.correctAnswer || activity.correctAnswer }, context, { dialogue: true });
}

function renderIndependentRecall(target, activity, context) {
  const locale = localeFor(context.language), copy = COPY[locale];
  const body = `<label class="nalvi-recall-field"><span>${escapeHtml(copy.recall)}</span><textarea rows="3" data-recall-input autocomplete="off"></textarea></label>${actions(copy)}`;
  shell(target, activity, context, body, copy.recall);
  const input = target.querySelector("[data-recall-input]"), check = target.querySelector("[data-catalog-check]");
  input.addEventListener("input", () => check.disabled = !input.value.trim());
  target.querySelector("[data-catalog-reset]")?.addEventListener("click", () => { input.value = ""; check.disabled = true; });
  check.addEventListener("click", () => { const accepted = (activity.acceptedAnswers?.length ? activity.acceptedAnswers : [activity.correctAnswer]).map(normalize); submit(target, activity, context, { value: input.value.trim(), correct: accepted.includes(normalize(input.value)) }); });
}

function renderTwoStep(target, activity, context) {
  const locale = localeFor(context.language), copy = COPY[locale], steps = activity.steps || [], answers = [];
  let stepIndex = 0;
  const renderStep = () => {
    const step = steps[stepIndex]; if (!step) return;
    const options = step.options || [];
    const body = `<p class="nalvi-step-label">${escapeHtml(copy.step)} ${stepIndex + 1} / 2</p><h4>${escapeHtml(localize(step.prompt, locale))}</h4><div class="nalvi-choice-grid">${options.map((option, index) => `<button type="button" data-step-option="${escapeHtml(optionId(option, index))}">${escapeHtml(optionValue(option, locale))}</button>`).join("")}</div>${actions(copy)}`;
    shell(target, { ...activity, prompt: "" }, context, body, copy.select);
    let selected = ""; const check = target.querySelector("[data-catalog-check]");
    target.querySelectorAll("[data-step-option]").forEach(button => button.addEventListener("click", () => { target.querySelectorAll("[data-step-option]").forEach(node => node.classList.remove("is-selected")); button.classList.add("is-selected"); selected = button.dataset.stepOption; check.disabled = false; }));
    target.querySelector("[data-catalog-reset]")?.addEventListener("click", () => renderStep());
    check.addEventListener("click", () => { const selectedOption = options.find((option, index) => optionId(option, index) === selected); answers.push({ step: stepIndex + 1, value: optionValue(selectedOption, locale), correct: selected === String(step.correctOptionId) }); if (stepIndex === 0) { stepIndex = 1; renderStep(); } else submit(target, activity, context, { value: answers, stepResults: answers, correct: answers.every(answer => answer.correct) }); });
  };
  renderStep();
}

const renderers = {
  [ACTIVITY_TYPES.CONTEXT_CHOICE]: (target, activity, context) => renderChoice(target, activity, context),
  [ACTIVITY_TYPES.ARROW_MATCH]: renderArrowMatch,
  [ACTIVITY_TYPES.CATEGORY_SORT]: renderCategorySort,
  [ACTIVITY_TYPES.DIALOGUE_NEXT_TURN]: (target, activity, context) => renderChoice(target, activity, context, { dialogue: true }),
  [ACTIVITY_TYPES.AUDIO_SELECT]: (target, activity, context) => renderChoice(target, activity, context, { audio: true }),
  [ACTIVITY_TYPES.INDEPENDENT_RECALL]: renderIndependentRecall
};

for (const [type, renderer] of Object.entries(renderers)) if (isEnabledActivityType(type)) engine.registerActivityRenderer(type, renderer);

window.NALVI_ACTIVITY_CATALOG = Object.freeze({
  version: VERSION,
  definition: NALVI_ACTIVITY_CATALOG_V1,
  audit: () => ({ ...catalogAudit(), registeredRendererTypes: Object.keys(renderers).filter(isEnabledActivityType) })
});
