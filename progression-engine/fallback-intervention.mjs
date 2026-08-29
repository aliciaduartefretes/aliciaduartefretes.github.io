const COPY = Object.freeze({
  es: { match: "Relaciona la pregunta con la respuesta correcta.", fill: "Completa con la forma que acabas de revisar.", write: "Recupera la respuesta sin opciones." },
  en: { match: "Match the question with the correct answer.", fill: "Complete it with the form you just reviewed.", write: "Recall the answer without options." },
  pt: { match: "Relacione a pergunta com a resposta correta.", fill: "Complete com a forma que você acabou de revisar.", write: "Recupere a resposta sem opções." },
  fr: { match: "Associez la question à la bonne réponse.", fill: "Complétez avec la forme que vous venez de revoir.", write: "Retrouvez la réponse sans choix." },
  it: { match: "Associa la domanda alla risposta corretta.", fill: "Completa con la forma appena ripassata.", write: "Recupera la risposta senza opzioni." },
  de: { match: "Ordne die Frage der richtigen Antwort zu.", fill: "Ergänze die gerade wiederholte Form.", write: "Rufe die Antwort ohne Auswahlmöglichkeiten ab." }
});

const localized = (value, locale) => {
  if (value == null) return "";
  if (typeof value !== "object" || Array.isArray(value)) return String(value);
  return String(value[locale] ?? value.es ?? value.en ?? Object.values(value)[0] ?? "");
};

export function buildDeterministicFallbackActivity(context = {}, attempt = 1) {
  const locale = COPY[context.uiLocale] ? context.uiLocale : "es";
  const copy = COPY[locale];
  const source = context.activity || {};
  const answer = String(context.correctAnswer || "").trim();
  const prompt = localized(source.prompt, locale) || String(context.conceptId || "");
  if (!answer) return null;
  const base = {
    id: `fallback-${context.conceptId || "concept"}-${attempt}-${Date.now()}`,
    conceptId: context.conceptId,
    conceptIds: [context.conceptId].filter(Boolean),
    learningObjectiveId: context.learningObjectiveId,
    skill: context.currentSkill || "vocabulary",
    difficulty: context.difficulty || "foundation-1",
    lexemeIds: context.lexemeIds || [],
    grammarRuleIds: context.grammarRuleIds || [],
    nalviGuided: true,
    deterministicFallback: true
  };
  const modes = ["matching", "fill-blank", "writing"].filter(type => type !== context.activityType);
  const type = modes[(Math.max(1, attempt) - 1) % modes.length] || "fill-blank";
  if (type === "matching") return {
    ...base,
    type,
    activityType: type,
    prompt: copy.match,
    instruction: prompt,
    pairs: [{ id: "known-answer", left: prompt, right: answer }],
    answer
  };
  if (type === "writing") return {
    ...base,
    type,
    activityType: type,
    prompt: copy.write,
    instruction: prompt,
    acceptedAnswers: [answer],
    answer
  };
  return {
    ...base,
    type: "fill-blank",
    activityType: "fill-blank",
    prompt: copy.fill,
    instruction: prompt,
    template: "{{blank}}",
    acceptedAnswers: [answer],
    answer
  };
}

export default buildDeterministicFallbackActivity;
