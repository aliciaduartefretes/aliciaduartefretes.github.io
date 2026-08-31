const COPY = Object.freeze({
  es: { listen: "Escucha y reconoce la expresión de la lección.", recall: "Recupera la expresión sin opciones.", cue: "Completa con esta pista:" },
  en: { listen: "Listen and recognise the lesson expression.", recall: "Recall the expression without options.", cue: "Complete it with this cue:" },
  pt: { listen: "Ouça e reconheça a expressão da lição.", recall: "Recupere a expressão sem opções.", cue: "Complete com esta pista:" },
  fr: { listen: "Écoutez et reconnaissez l’expression de la leçon.", recall: "Retrouvez l’expression sans choix.", cue: "Complétez avec cet indice :" },
  it: { listen: "Ascolta e riconosci l’espressione della lezione.", recall: "Ricorda l’espressione senza opzioni.", cue: "Completa con questo indizio:" },
  de: { listen: "Höre zu und erkenne den Ausdruck aus der Lektion.", recall: "Rufe den Ausdruck ohne Auswahlmöglichkeiten ab.", cue: "Vervollständige mit diesem Hinweis:" }
});

const localize = (value, locale) => value && typeof value === "object" && !Array.isArray(value) ? String(value[locale] ?? value.es ?? value.en ?? Object.values(value)[0] ?? "") : String(value ?? "");
const normalize = value => String(value ?? "").normalize("NFC").trim().toLocaleLowerCase();

export function buildDeterministicFallbackActivity(context = {}, attempt = 1) {
  const locale = COPY[context.uiLocale] ? context.uiLocale : "es", copy = COPY[locale], source = context.activity || {};
  const answer = String(context.correctAnswer || "").trim();
  if (!answer) return null;
  const options = (source.options || []).map((option, index) => ({ id: String(option?.id ?? `option-${index}`), label: localize(option?.label ?? option?.value ?? option, locale) })).filter(option => option.label);
  const base = {
    id: `fallback-${context.conceptId || "concept"}-${attempt}-${Date.now()}`,
    conceptId: context.conceptId, conceptIds: [context.conceptId].filter(Boolean), learningObjectiveId: context.learningObjectiveId,
    skill: context.currentSkill || "vocabulary", difficulty: context.difficulty || "foundation-1",
    lexemeIds: context.lexemeIds || [], grammarRuleIds: context.grammarRuleIds || [],
    nalviGuided: true, deterministicFallback: true, requiresStudentResponse: true,
    answerExposure: attempt > 1 ? "PARTIAL_HINT" : "HIDDEN", helpLevel: Math.min(2, Math.max(1, attempt)),
    acceptedAnswers: [answer], answer
  };
  if (attempt === 1 && options.length >= 2 && options.some(option => normalize(option.label) === normalize(answer))) {
    const rotated = [...options.slice(1), options[0]];
    const correct = rotated.find(option => normalize(option.label) === normalize(answer));
    return { ...base, type: "listening", activityType: "listening", skill: "listening", instruction: copy.listen, prompt: copy.listen,
      options: rotated, correctOptionId: correct?.id || "", audioText: answer, audio: answer, helpLevel: 1, answerExposure: "HIDDEN" };
  }
  if (attempt === 2) {
    const cue = Array.from(answer)[0] || "";
    return { ...base, type: "fill-blank", activityType: "fill-blank", skill: "writing", instruction: `${copy.cue} ${cue}…`, prompt: copy.recall, template: "{{blank}}", hints: cue ? [`${cue}…`] : [] };
  }
  if (attempt % 2 === 1) {
    return { ...base, type: "writing", activityType: "writing", skill: "writing", instruction: copy.recall, prompt: copy.recall, helpLevel: 0, answerExposure: "HIDDEN", independentRetest: true };
  }
  if (options.length >= 2 && options.some(option => normalize(option.label) === normalize(answer))) {
    const shifted = [...options.slice(2), ...options.slice(0, 2)];
    const correct = shifted.find(option => normalize(option.label) === normalize(answer));
    return { ...base, type: "listening", activityType: "listening", skill: "listening", instruction: copy.listen, prompt: copy.listen,
      options: shifted, correctOptionId: correct?.id || "", audioText: answer, audio: answer, helpLevel: 0, answerExposure: "HIDDEN", independentRetest: true };
  }
  return { ...base, type: "fill-blank", activityType: "fill-blank", skill: "writing", instruction: copy.recall, prompt: copy.recall, template: "{{blank}}", helpLevel: 0, answerExposure: "HIDDEN", independentRetest: true };
}

export default buildDeterministicFallbackActivity;
