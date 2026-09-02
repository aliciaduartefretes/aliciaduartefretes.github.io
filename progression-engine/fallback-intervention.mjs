import { ACTIVITY_TYPES, cognitiveDemandFor } from "../activity-catalog/nalvi-activity-catalog.mjs";

const COPY = Object.freeze({
  es: { context: "Dos personas se encuentran al comenzar una conversación.", contextQuestion: "¿Qué intención encaja mejor con la situación?", contrast: "Elige el significado que corresponde a la expresión trabajada.", match: "Relaciona cada expresión con su significado.", build: "Reconstruye la expresión con las piezas.", gap: "Completa la situación con la opción adecuada.", answer: "Respuesta", recall: "Recuerda la expresión sin verla.", person: "Una persona habla de alguien de su familia.", pronoun: "Una persona elige cómo referirse a sí misma o a otra persona." },
  en: { context: "Two people meet at the start of a conversation.", contextQuestion: "Which intention best fits the situation?", contrast: "Choose the meaning that matches the expression you studied.", match: "Match each expression with its meaning.", build: "Rebuild the expression with the tiles.", gap: "Complete the situation with the best option.", answer: "Answer", recall: "Recall the expression without seeing it.", person: "Someone is talking about a family member.", pronoun: "Someone chooses how to refer to themself or another person." },
  pt: { context: "Duas pessoas se encontram no início de uma conversa.", contextQuestion: "Qual intenção combina melhor com a situação?", contrast: "Escolha o significado correspondente à expressão estudada.", match: "Relacione cada expressão ao seu significado.", build: "Reconstrua a expressão com as peças.", gap: "Complete a situação com a opção adequada.", answer: "Resposta", recall: "Lembre a expressão sem vê-la.", person: "Uma pessoa fala de alguém da família.", pronoun: "Uma pessoa escolhe como se referir a si mesma ou a outra pessoa." },
  fr: { context: "Deux personnes se rencontrent au début d’une conversation.", contextQuestion: "Quelle intention convient le mieux à la situation ?", contrast: "Choisissez le sens correspondant à l’expression étudiée.", match: "Associez chaque expression à sa signification.", build: "Reconstituez l’expression avec les tuiles.", gap: "Complétez la situation avec l’option appropriée.", answer: "Réponse", recall: "Retrouvez l’expression sans la voir.", person: "Une personne parle d’un membre de sa famille.", pronoun: "Une personne choisit comment parler d’elle-même ou d’une autre personne." },
  it: { context: "Due persone si incontrano all’inizio di una conversazione.", contextQuestion: "Quale intenzione si adatta meglio alla situazione?", contrast: "Scegli il significato dell’espressione studiata.", match: "Abbina ogni espressione al suo significato.", build: "Ricostruisci l’espressione con le tessere.", gap: "Completa la situazione con l’opzione adatta.", answer: "Risposta", recall: "Ricorda l’espressione senza vederla.", person: "Una persona parla di un familiare.", pronoun: "Una persona sceglie come riferirsi a sé o a un’altra persona." },
  de: { context: "Zwei Personen treffen sich zu Beginn eines Gesprächs.", contextQuestion: "Welche Absicht passt am besten zur Situation?", contrast: "Wähle die Bedeutung des gelernten Ausdrucks.", match: "Ordne jedem Ausdruck seine Bedeutung zu.", build: "Setze den Ausdruck aus den Bausteinen zusammen.", gap: "Vervollständige die Situation mit der passenden Option.", answer: "Antwort", recall: "Erinnere dich an den Ausdruck, ohne ihn zu sehen.", person: "Eine Person spricht über ein Familienmitglied.", pronoun: "Eine Person wählt, wie sie auf sich selbst oder eine andere Person verweist." }
});

const localize = (value, locale) => value && typeof value === "object" && !Array.isArray(value)
  ? String(value[locale] ?? value.es ?? value.en ?? Object.values(value)[0] ?? "")
  : String(value ?? "");
const normalize = value => String(value ?? "").normalize("NFC").trim().toLocaleLowerCase();
const uniqueBy = (values, key) => values.filter((value, index, array) => array.findIndex(candidate => key(candidate) === key(value)) === index);
const optionText = (option, locale) => localize(option?.text ?? option?.label ?? option?.value ?? option, locale);

function lessonOptions(context, locale) {
  const source = context.activity || {};
  return uniqueBy((source.lessonContext?.sourceOptions || source.options || [])
    .map((option, index) => ({ id: String(option?.id ?? `option-${index + 1}`), text: optionText(option, locale), authorized: true }))
    .filter(option => option.text), option => normalize(option.text));
}

function semanticPairs(context, locale) {
  const answer = normalize(context.correctAnswer);
  const pairs = uniqueBy((context.availableActivities || [])
    .filter(activity => {
      if (!activity.semanticPair?.target || !activity.semanticPair?.meaning) return false;
      const sameObjective = context.learningObjectiveId && activity.learningObjectiveId === context.learningObjectiveId;
      const sameConcept = context.conceptId && [activity.conceptId, ...(activity.conceptIds || [])].filter(Boolean).includes(context.conceptId);
      return Boolean(sameObjective || sameConcept);
    })
    .map((activity, index) => ({
      id: String(activity.id || `pair-${index + 1}`),
      left: String(activity.semanticPair.target),
      right: localize(activity.semanticPair.meaning, locale),
      authorized: true
    }))
    .filter(pair => pair.left && pair.right), pair => `${normalize(pair.left)}:${normalize(pair.right)}`);
  if (answer && !pairs.some(pair => normalize(pair.left) === answer || normalize(pair.right) === answer)) return [];
  return pairs;
}

function shuffled(values, seed = 1) {
  return [...values].sort((left, right) => `${String(right.id)}-${seed}`.localeCompare(`${String(left.id)}-${seed}`));
}

function tileSegments(answer) {
  const graphemes = Array.from(String(answer || "").trim());
  if (graphemes.length < 4) return null;
  const size = graphemes.length >= 8 ? 2 : 1;
  const parts = [];
  for (let index = 0; index < graphemes.length; index += size) parts.push(graphemes.slice(index, index + size).join(""));
  if (parts.length < 2) return null;
  const entries = parts.map((text, index) => ({ id: `answer-${index + 1}`, text, authorized: true }));
  const distractors = ["a", "e", "i", "o", "u", "y", "m", "n"].filter(value => !parts.includes(value));
  while (entries.length < 6 && distractors.length) entries.push({ id: `distractor-${entries.length + 1}`, text: distractors.shift(), authorized: true });
  return { tiles: shuffled(entries, parts.length), correctOrder: parts.map((_, index) => `answer-${index + 1}`) };
}

function base(context, type, attempt, overrides = {}) {
  const correctAnswer = String(context.correctAnswer || "").trim();
  return {
    id: `catalog-${String(context.conceptId || "concept")}-${attempt}-${type.toLocaleLowerCase()}`,
    type,
    activityType: type,
    conceptId: context.conceptId,
    conceptIds: [context.conceptId].filter(Boolean),
    learningObjectiveId: context.learningObjectiveId,
    skill: context.currentSkill || "vocabulary",
    difficulty: context.difficulty || "foundation-1",
    helpLevel: Math.min(2, Math.max(0, attempt - 1)),
    answerExposure: "HIDDEN",
    requiresStudentResponse: true,
    instruction: "",
    prompt: "",
    contextText: "",
    options: [],
    pairs: [],
    tiles: [],
    categories: [],
    items: [],
    segments: [],
    corrections: [],
    dialogue: [],
    questions: [],
    steps: [],
    correctOrder: [],
    hints: [],
    explanation: "",
    correctAnswer,
    acceptedAnswers: correctAnswer ? [correctAnswer] : [],
    correctOptionId: "",
    correctCorrectionId: "",
    lexemeIds: context.lexemeIds || [],
    grammarRuleIds: context.grammarRuleIds || [],
    sourceIds: [],
    conflictIds: [],
    hasOpenConflict: false,
    distractorQuality: "PLAUSIBLE",
    cognitiveDemand: cognitiveDemandFor(type),
    lessonContext: {
      ...(context.activity?.lessonContext || {}),
      sourceActivityId: context.activity?.id || "",
      sourceAnswer: correctAnswer
    },
    deterministicFallback: true,
    ...overrides
  };
}

function candidate(activity, errorType, reasonCode, goal) {
  return {
    activityType: activity.activityType,
    pedagogicalGoal: goal,
    errorType,
    helpLevel: activity.helpLevel,
    reasonCode,
    estimatedCognitiveDemand: activity.cognitiveDemand,
    requiresIndependentRetest: activity.activityType !== ACTIVITY_TYPES.INDEPENDENT_RECALL,
    activity
  };
}

export function buildDeterministicFallbackCandidates(context = {}, attempt = 1, errorType = "UNKNOWN_ERROR") {
  const uiLocale = COPY[context.uiLocale] ? context.uiLocale : "es";
  const copy = COPY[uiLocale];
  const answer = String(context.correctAnswer || "").trim();
  if (!answer) return [];
  const options = lessonOptions(context, uiLocale);
  const correct = options.find(option => normalize(option.text) === normalize(answer));
  const pairs = semanticPairs(context, uiLocale);
  const candidates = [];

  if (pairs.length >= 3) {
    candidates.push(candidate(base(context, ACTIVITY_TYPES.ARROW_MATCH, attempt, {
      skill: "vocabulary",
      instruction: copy.match,
      prompt: copy.match,
      pairs: pairs.slice(0, 5),
      correctAnswer: answer,
      acceptedAnswers: [answer],
      reasonCode: "JUSTIFIED_INTERLEAVED_RETRIEVAL"
    }), errorType, "JUSTIFIED_INTERLEAVED_RETRIEVAL", "Connect several documented expressions instead of repeating the failed question."));
  }

  if (options.length >= 3 && correct) {
    const visiblePrompt = localize(context.activity?.prompt, uiLocale);
    const visualContext = /mam[aá]|mother|m[aã]e|m[eè]re|mutter/i.test(visiblePrompt)
      ? copy.person
      : /pronombre|pronoun|pronome|pronom|pronomen|«(?:yo|eu|je|io|ich)»/i.test(visiblePrompt)
        ? copy.pronoun
        : copy.context;
    const choiceType = errorType === "SEMANTIC_CONFUSION" ? ACTIVITY_TYPES.CONCEPT_CONTRAST : ACTIVITY_TYPES.CONTEXT_CHOICE;
    candidates.push(candidate(base(context, choiceType, attempt, {
      instruction: errorType === "SEMANTIC_CONFUSION" ? copy.contrast : copy.contextQuestion,
      prompt: errorType === "SEMANTIC_CONFUSION" ? copy.contrast : copy.contextQuestion,
      contextText: visualContext,
      options: shuffled(options, attempt),
      correctOptionId: correct.id,
      correctAnswer: answer
    }), errorType, "CONTEXTUAL_DISCRIMINATION", "Use a new situation and plausible lesson distractors."));

    candidates.push(candidate(base(context, ACTIVITY_TYPES.GUIDED_GAP, attempt, {
      instruction: copy.gap,
      prompt: copy.gap,
      contextText: visualContext,
      template: `${copy.answer}: {{blank}}`,
      options: shuffled(options, attempt + 1),
      correctOptionId: correct.id,
      correctAnswer: answer,
      reasonCode: "JUSTIFIED_CONTEXTUAL_RECONSTRUCTION"
    }), errorType, "JUSTIFIED_CONTEXTUAL_RECONSTRUCTION", "Reconstruct the meaning within a clear context."));
  }

  const segmented = tileSegments(answer);
  if (segmented && ["RECALL_FAILURE", "SPELLING_ERROR", "UNKNOWN_ERROR"].includes(errorType)) {
    candidates.push(candidate(base(context, ACTIVITY_TYPES.WORD_TILE_BUILDER, attempt, {
      skill: "writing",
      instruction: copy.build,
      prompt: copy.build,
      ...segmented,
      reasonCode: "ORTHOGRAPHIC_RECONSTRUCTION"
    }), errorType, "ORTHOGRAPHIC_RECONSTRUCTION", "Reconstruct the target with several pieces and distractors."));
  }

  candidates.push(candidate(base(context, ACTIVITY_TYPES.INDEPENDENT_RECALL, attempt, {
    skill: "writing",
    helpLevel: 0,
    instruction: copy.recall,
    prompt: copy.recall,
    contextText: copy.person,
    answerExposure: "HIDDEN",
    hints: [],
    reasonCode: "JUSTIFIED_INDEPENDENT_RETEST"
  }), errorType, "JUSTIFIED_INDEPENDENT_RETEST", "Check independent retrieval without showing the answer."));

  return uniqueBy(candidates, value => value.activityType).slice(0, 3);
}

export function buildDeterministicFallbackActivity(context = {}, attempt = 1, errorType = "UNKNOWN_ERROR") {
  return buildDeterministicFallbackCandidates(context, attempt, errorType)[0]?.activity || null;
}

export default buildDeterministicFallbackActivity;
