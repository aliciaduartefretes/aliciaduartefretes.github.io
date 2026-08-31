const COPY = Object.freeze({
  es: { listen: "Escucha y elige la expresión correcta.", choose: "Elige la respuesta que corresponde.", complete: "Completa el significado.", missing: "Escribe solo la palabra que falta.", recall: "Ahora escribe la respuesta completa.", cue: "Pista:", context: "Estamos practicando esta pregunta:" },
  en: { listen: "Listen and choose the correct expression.", choose: "Choose the matching answer.", complete: "Complete the meaning.", missing: "Write only the missing word.", recall: "Now write the complete answer.", cue: "Hint:", context: "We are practising this question:" },
  pt: { listen: "Ouça e escolha a expressão correta.", choose: "Escolha a resposta correspondente.", complete: "Complete o significado.", missing: "Escreva apenas a palavra que falta.", recall: "Agora escreva a resposta completa.", cue: "Pista:", context: "Estamos praticando esta pergunta:" },
  fr: { listen: "Écoutez et choisissez l’expression correcte.", choose: "Choisissez la réponse correspondante.", complete: "Complétez le sens.", missing: "Écrivez uniquement le mot manquant.", recall: "Écrivez maintenant la réponse complète.", cue: "Indice :", context: "Nous travaillons cette question :" },
  it: { listen: "Ascolta e scegli l’espressione corretta.", choose: "Scegli la risposta corrispondente.", complete: "Completa il significato.", missing: "Scrivi solo la parola mancante.", recall: "Ora scrivi la risposta completa.", cue: "Indizio:", context: "Stiamo esercitando questa domanda:" },
  de: { listen: "Höre zu und wähle den richtigen Ausdruck.", choose: "Wähle die passende Antwort.", complete: "Vervollständige die Bedeutung.", missing: "Schreibe nur das fehlende Wort.", recall: "Schreibe jetzt die vollständige Antwort.", cue: "Hinweis:", context: "Wir üben diese Frage:" }
});

const localize = (value, locale) => value && typeof value === "object" && !Array.isArray(value) ? String(value[locale] ?? value.es ?? value.en ?? Object.values(value)[0] ?? "") : String(value ?? "");
const normalize = value => String(value ?? "").normalize("NFC").trim().toLocaleLowerCase();
const firstLetter = value => String(value || "").match(/[\p{L}\p{N}]/u)?.[0] || "";
const quotedFocus = value => {
  const match = String(value || "").match(/[«“„\"]([^»”“\"]+)[»”"“]/);
  return match?.[1]?.trim() || "";
};
const guidedCompletion = (answer, focus) => {
  const parts = String(answer || "").trim().split(/\s+/), raw = parts.pop() || "";
  const match = raw.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}'’\-]+)([^\p{L}\p{N}]*)$/u);
  const word = match?.[2] || raw, masked = `${match?.[1] || ""}${"_".repeat(Math.max(4, Array.from(word).length))}${match?.[3] || ""}`;
  const visible = [...parts, masked].join(" ");
  return { missing: word, template: `${focus ? `“${focus}” = ` : ""}${visible}`.trim() };
};

export function buildDeterministicFallbackActivity(context = {}, attempt = 1) {
  const locale = COPY[context.uiLocale] ? context.uiLocale : "es", copy = COPY[locale], source = context.activity || {};
  const answer = String(context.correctAnswer || "").trim();
  if (!answer) return null;
  const sourcePrompt = localize(source.lessonContext?.sourcePrompt || source.prompt || source.instruction, locale).trim();
  const focus = quotedFocus(sourcePrompt) || sourcePrompt;
  const sourceOptions = source.lessonContext?.sourceOptions || source.options || [];
  const options = sourceOptions.map((option, index) => ({ id: String(option?.id ?? `option-${index}`), label: localize(option?.label ?? option?.value ?? option, locale) })).filter(option => option.label);
  const hasAnswerOption = options.some(option => normalize(option.label) === normalize(answer));
  const lessonContext = {
    ...(source.lessonContext || {}),
    sourcePrompt,
    sourceInstruction: localize(source.lessonContext?.sourceInstruction || source.instruction, locale),
    sourceAnswer: localize(source.lessonContext?.sourceAnswer || answer, locale),
    sourceOptions,
    sourceCorrectOptionId: source.lessonContext?.sourceCorrectOptionId || source.correctOptionId || ""
  };
  const base = {
    id: `fallback-${context.conceptId || "concept"}-${attempt}-${Date.now()}`,
    conceptId: context.conceptId, conceptIds: [context.conceptId].filter(Boolean), learningObjectiveId: context.learningObjectiveId,
    skill: context.currentSkill || "vocabulary", difficulty: context.difficulty || "foundation-1",
    lexemeIds: context.lexemeIds || [], grammarRuleIds: context.grammarRuleIds || [],
    nalviGuided: true, deterministicFallback: true, requiresStudentResponse: true,
    answerExposure: attempt > 1 ? "PARTIAL_HINT" : "HIDDEN", helpLevel: Math.min(2, Math.max(1, attempt)),
    acceptedAnswers: [answer], answer, lessonContext
  };
  if (attempt <= 2 && answer) {
    const completion = guidedCompletion(answer, attempt === 1 ? focus : "");
    const cue = firstLetter(completion.missing);
    return { ...base, type: "fill-blank", activityType: "fill-blank", skill: "writing", prompt: copy.complete,
      instruction: copy.missing, template: completion.template, acceptedAnswers: [completion.missing, answer],
      hints: cue ? [`${cue}…`] : [], helpLevel: 2, answerExposure: "PARTIAL_HINT" };
  }
  if (attempt % 2 === 1) {
    return { ...base, type: "writing", activityType: "writing", skill: "writing", instruction: copy.recall,
      prompt: sourcePrompt || copy.recall, helpLevel: 0, answerExposure: "HIDDEN", independentRetest: true };
  }
  if (options.length >= 2 && hasAnswerOption) {
    const shifted = [...options.slice(2), ...options.slice(0, 2)];
    const correct = shifted.find(option => normalize(option.label) === normalize(answer));
    return { ...base, type: "listening", activityType: "listening", skill: "listening", instruction: copy.listen, prompt: copy.listen,
      options: shifted, correctOptionId: correct?.id || "", audioText: answer, audio: answer, helpLevel: 0, answerExposure: "HIDDEN", independentRetest: true };
  }
  return { ...base, type: "fill-blank", activityType: "fill-blank", skill: "writing", instruction: copy.recall,
    prompt: sourcePrompt || copy.recall, template: `${sourcePrompt || copy.context} → {{blank}}`,
    helpLevel: 0, answerExposure: "HIDDEN", independentRetest: true };
}

export default buildDeterministicFallbackActivity;
