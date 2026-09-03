import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { CATALOG_EXAMPLES } from "../catalog-examples.mjs";
import {
  ACTIVITY_TYPES,
  ENABLE_AUDIO_INTERVENTIONS,
  catalogAudit,
  isEnabledActivityType
} from "../nalvi-activity-catalog.mjs";
import {
  approvedAudioForTarget,
  catalogQualityMetrics,
  detectAnswerLeakage,
  selectFirstValidCandidate,
  validateCatalogActivity
} from "../nalvi-activity-quality.mjs";
import { ERROR_TYPES } from "../../intervention-engine/intervention-config.mjs";
import { buildDeterministicFallbackCandidates } from "../../progression-engine/fallback-intervention.mjs";

const ENABLED_TYPES = Object.freeze([
  "CONTEXT_CHOICE",
  "ARROW_MATCH",
  "CATEGORY_SORT",
  "DIALOGUE_NEXT_TURN",
  "INDEPENDENT_RECALL",
  "AUDIO_SELECT"
]);
const CANONICAL_AUDIO = Object.freeze({
  audioId: "NALVI-AUDIO-096",
  audioPath: "assets/audio/guarani/ali-2026/096-jagua.m4a",
  audioText: "Jagua",
  audioAuthorized: true,
  humanRecorded: true,
  audioSource: "manifest-human-recording"
});
const APPROVED_AUDIO = Object.freeze({
  id: CANONICAL_AUDIO.audioId,
  audioId: CANONICAL_AUDIO.audioId,
  recordingId: CANONICAL_AUDIO.audioId,
  path: CANONICAL_AUDIO.audioPath,
  audioPath: CANONICAL_AUDIO.audioPath,
  text: CANONICAL_AUDIO.audioText,
  audioText: CANONICAL_AUDIO.audioText,
  source: CANONICAL_AUDIO.audioSource,
  audioSource: CANONICAL_AUDIO.audioSource,
  authorized: true,
  audioAuthorized: true,
  humanRecorded: true
});
const DETERMINISTIC_COPY_ES = Object.freeze({
  [ACTIVITY_TYPES.CONTEXT_CHOICE]: "Elige la opción que corresponde a esta situación.",
  [ACTIVITY_TYPES.ARROW_MATCH]: "Relaciona cada elemento con su significado.",
  [ACTIVITY_TYPES.CATEGORY_SORT]: "Clasifica las tarjetas en la categoría correcta.",
  [ACTIVITY_TYPES.DIALOGUE_NEXT_TURN]: "Elige la respuesta que continúa la conversación.",
  [ACTIVITY_TYPES.INDEPENDENT_RECALL]: "Recuerda la expresión sin verla.",
  [ACTIVITY_TYPES.AUDIO_SELECT]: "Escucha y elige la opción correcta."
});

function canonicalApprovedCandidate(source) {
  const activity = structuredClone(source);
  const copy = DETERMINISTIC_COPY_ES[activity.activityType];
  activity.prompt = copy;
  activity.instruction = copy;
  activity.hints = [];
  activity.explanation = "";
  if (activity.activityType === ACTIVITY_TYPES.DIALOGUE_NEXT_TURN) {
    activity.dialogueSourceContentId ||= "fixture-dialogue-source";
  }
  return activity;
}

const context = {
  conceptId: "lexeme-family-mother",
  learningObjectiveId: "foundation-1",
  currentSkill: "vocabulary",
  activityType: "multiple-choice",
  difficulty: "foundation-1",
  correct: false,
  correctAnswer: "sy",
  studentAnswer: "túva",
  attemptNumber: 1,
  uiLocale: "es",
  previousActivityFingerprint: "old-fingerprint",
  recentActivityFingerprints: [],
  recentActivities: [],
  activity: {
    id: "mother-question",
    prompt: "¿Cómo se dice mamá?",
    options: [
      { id: "mother", label: "sy", value: "sy" },
      { id: "father", label: "túva", value: "túva" },
      { id: "child", label: "mitã", value: "mitã" }
    ],
    correctOptionId: "mother",
    semanticPair: { target: "sy", meaning: "mamá" },
    lessonContext: {
      sourcePrompt: "¿Cómo se dice mamá?",
      sourceOptions: [
        { id: "mother", label: "sy", value: "sy" },
        { id: "father", label: "túva", value: "túva" },
        { id: "child", label: "mitã", value: "mitã" }
      ],
      sourceAnswer: "sy"
    }
  },
  availableActivities: [],
  approvedActivityMaterial: {
    options: [
      { id: "mother", text: "sy", authorized: true },
      { id: "father", text: "túva", authorized: true },
      { id: "child", text: "mitã", authorized: true }
    ],
    correctOptionId: "mother",
    correctAnswer: "sy",
    acceptedAnswers: ["sy"],
    pairs: [
      { id: "mother", left: "sy", right: "mamá", authorized: true },
      { id: "father", left: "túva", right: "papá", authorized: true },
      { id: "child", left: "mitã", right: "niño", authorized: true }
    ],
    contexts: [{ text: "Una situación familiar documentada en la lección.", authorized: true }],
    categories: [
      { id: "people", label: "Personas", authorized: true },
      { id: "places", label: "Lugares", authorized: true }
    ],
    items: [
      { id: "mother-item", text: "sy", categoryId: "people", authorized: true },
      { id: "father-item", text: "túva", categoryId: "people", authorized: true },
      { id: "child-item", text: "mitã", categoryId: "people", authorized: true },
      { id: "home-item", text: "óga", categoryId: "places", authorized: true },
      { id: "school-item", text: "mbo'ehao", categoryId: "places", authorized: true },
      { id: "field-item", text: "kokue", categoryId: "places", authorized: true }
    ],
    dialogue: [
      { id: "turn-1", speaker: "A", text: "¿A quién buscas?", authorized: true },
      { id: "turn-2", speaker: "B", text: "Busco a una persona de mi familia.", authorized: true }
    ],
    dialogueOptions: [
      { id: "mother", text: "sy", authorized: true },
      { id: "father", text: "túva", authorized: true },
      { id: "child", text: "mitã", authorized: true }
    ],
    dialogueCorrectOptionId: "mother",
    dialogueCorrectAnswer: "sy",
    dialogueSourceContentId: "fixture-family-dialogue",
    audio: { ...APPROVED_AUDIO }
  }
};

function approvedMaterialForExample(activity) {
  return {
    sourceIds: structuredClone(activity.sourceIds || []),
    correctAnswer: activity.correctAnswer,
    acceptedAnswers: structuredClone(activity.acceptedAnswers || []),
    correctOptionId: activity.correctOptionId,
    contexts: activity.contextText
      ? [{ text: structuredClone(activity.contextText), authorized: true }]
      : [],
    options: structuredClone(activity.options || []),
    pairs: structuredClone(activity.pairs || []),
    categories: structuredClone(activity.categories || []),
    items: structuredClone(activity.items || []),
    dialogue: structuredClone(activity.dialogue || []),
    dialogueOptions: structuredClone(activity.options || []),
    dialogueCorrectOptionId: activity.correctOptionId,
    dialogueCorrectAnswer: activity.correctAnswer,
    dialogueSourceContentId: activity.dialogueSourceContentId || "fixture-dialogue-source",
    hints: [],
    tokens: [],
    tiles: []
  };
}

test("el contrato vigente habilita exactamente seis formatos y mantiene PASO 8C bloqueado", () => {
  const audit = catalogAudit();
  assert.deepEqual(audit.enabledTypes, ENABLED_TYPES);
  assert.equal(ENABLE_AUDIO_INTERVENTIONS, true);
  for (const type of Object.values(ACTIVITY_TYPES)) {
    assert.equal(isEnabledActivityType(type), ENABLED_TYPES.includes(type), type);
  }
  assert.equal(isEnabledActivityType(ACTIVITY_TYPES.MORPHEME_BUILDER), false);
  assert.equal(audit.paso8cStarted, false);
});

test("cada ejemplo habilitado pasa esquema, pedagogía y leakage", () => {
  assert.deepEqual(CATALOG_EXAMPLES.map(activity => activity.activityType), ENABLED_TYPES);
  for (const activity of CATALOG_EXAMPLES) {
    assert.equal(activity.requiresStudentResponse, true, activity.activityType);
    const validation = validateCatalogActivity(activity, { uiLocale: "es", attemptNumber: 1 });
    assert.equal(validation.valid, true, `${activity.activityType}: ${validation.reasons.join(", ")}`);
  }
  const contextual = CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.CONTEXT_CHOICE);
  assert.notEqual(contextual.prompt, contextual.contextText);
});

test("las siete métricas duras permanecen en cero", () => {
  assert.deepEqual(catalogQualityMetrics(CATALOG_EXAMPLES, { uiLocale: "es", attemptNumber: 1 }), {
    singlePairMatchingRate: 0,
    singleLetterCompletionRate: 0,
    firstErrorExplicitSolutionRate: 0,
    exactDuplicateAfterErrorRate: 0,
    technicalUIExposureRate: 0,
    unsupportedActivityTypeRate: 0,
    incorrectObjectiveCompletionRate: 0
  });
});

test("acepta solo audio humano canónico y rechaza todo formato retirado o inventado", () => {
  assert.deepEqual(context.approvedActivityMaterial.audio, APPROVED_AUDIO);
  const audio = CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.AUDIO_SELECT);
  assert.ok(audio);
  assert.equal(validateCatalogActivity(structuredClone(audio)).valid, true);
  assert.ok(validateCatalogActivity({ ...structuredClone(audio), audioAuthorized: false }).reasons.includes("UNAUTHORIZED_AUDIO"));
  assert.ok(validateCatalogActivity({ ...structuredClone(audio), audioId: "" }).reasons.includes("MISSING_AUDIO_SOURCE"));
  assert.ok(validateCatalogActivity({ ...structuredClone(audio), audioSource: "client-claim" }).reasons.includes("UNAUTHORIZED_AUDIO_SOURCE"));
  const wrongTarget = {
    ...structuredClone(audio),
    correctOptionId: "guyra",
    correctAnswer: "guyra",
    acceptedAnswers: ["guyra"]
  };
  assert.ok(validateCatalogActivity(wrongTarget).reasons.includes("AUDIO_TARGET_MISMATCH"));

  const crossLocaleAudio = {
    ...structuredClone(audio),
    audioText: { es: "Jagua", pt: "som" }
  };
  const crossLocaleValidation = validateCatalogActivity(crossLocaleAudio, { uiLocale: "es" });
  assert.equal(crossLocaleValidation.valid, false);
  assert.ok(crossLocaleValidation.reasons.includes("INVALID_AUDIO_DECLARATION"));

  const crossLocaleApproved = {
    ...context,
    correctAnswer: "jagua",
    approvedActivityMaterial: {
      ...context.approvedActivityMaterial,
      correctAnswer: "jagua",
      acceptedAnswers: ["jagua"],
      audio: { ...CANONICAL_AUDIO, audioText: { es: "Jagua", pt: "som" } }
    }
  };
  assert.equal(approvedAudioForTarget(crossLocaleApproved), null);
  assert.equal(approvedAudioForTarget({
    ...crossLocaleApproved,
    approvedActivityMaterial: {
      ...crossLocaleApproved.approvedActivityMaterial,
      audio: { ...APPROVED_AUDIO, text: { es: "Jagua", pt: "som" } }
    }
  }), null);

  const manifest = JSON.parse(readFileSync(new URL("../../assets/audio/guarani/ali-2026/manifest.json", import.meta.url), "utf8"));
  const recording = manifest.recordings.find(item => item.id === CANONICAL_AUDIO.audioId);
  assert.ok(recording);
  assert.equal(recording.file, "096-jagua.m4a");
  assert.equal(recording.humanRecorded, true);
  assert.equal(recording.authorizedForPlayback, true);

  for (const type of ["AI_MAGIC_QUIZ", ...Object.values(ACTIVITY_TYPES).filter(type => !ENABLED_TYPES.includes(type))]) {
    const validation = validateCatalogActivity({ activityType: type, type, correctAnswer: "x" });
    assert.equal(validation.valid, false);
  }
});

test("rechaza IDs de opción vacíos, duplicados o ambiguos antes de renderizar", () => {
  const audio = structuredClone(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.AUDIO_SELECT));
  const arrow = structuredClone(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.ARROW_MATCH));
  audio.options[1].id = audio.options[0].id;
  const duplicate = validateCatalogActivity(audio);
  assert.equal(duplicate.valid, false);
  assert.ok(duplicate.reasons.includes("DUPLICATE_OPTION_IDS"));
  assert.ok(duplicate.reasons.includes("CORRECT_OPTION_AMBIGUOUS"));

  const spacedDuplicate = structuredClone(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.AUDIO_SELECT));
  spacedDuplicate.options[1].id = ` ${spacedDuplicate.options[0].id} `;
  assert.ok(validateCatalogActivity(spacedDuplicate).reasons.includes("DUPLICATE_OPTION_IDS"));

  const missing = structuredClone(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.AUDIO_SELECT));
  missing.options[1].id = "";
  const missingValidation = validateCatalogActivity(missing);
  assert.equal(missingValidation.valid, false);
  assert.ok(missingValidation.reasons.includes("MISSING_OPTION_ID"));

  for (const type of [ACTIVITY_TYPES.CONTEXT_CHOICE, ACTIVITY_TYPES.DIALOGUE_NEXT_TURN, ACTIVITY_TYPES.AUDIO_SELECT]) {
    const emptyOption = structuredClone(CATALOG_EXAMPLES.find(activity => activity.activityType === type));
    emptyOption.options[1].text = "   ";
    assert.ok(validateCatalogActivity(emptyOption).reasons.includes("MISSING_OPTION_CONTENT"), type);
  }
  for (const type of [ACTIVITY_TYPES.CONTEXT_CHOICE, ACTIVITY_TYPES.AUDIO_SELECT]) {
    const ambiguousAnswer = structuredClone(CATALOG_EXAMPLES.find(activity => activity.activityType === type));
    ambiguousAnswer.acceptedAnswers = [ambiguousAnswer.correctAnswer, ambiguousAnswer.options[1].text];
    const ambiguousValidation = validateCatalogActivity(ambiguousAnswer);
    assert.ok(ambiguousValidation.reasons.includes("ANSWER_ALSO_IN_DISTRACTOR"), type);
    if (type === ACTIVITY_TYPES.AUDIO_SELECT) assert.ok(ambiguousValidation.reasons.includes("AUDIO_TARGET_MISMATCH"));
  }
  for (const marker of ["\u200B", "\u200C", "\u2060", "\u00AD", "\uFE0F", "\u0483", "\u{E0100}"]) {
    const visuallyDuplicate = structuredClone(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.AUDIO_SELECT));
    visuallyDuplicate.options[1].text = `ja${marker}gua`;
    const validation = validateCatalogActivity(visuallyDuplicate);
    assert.ok(validation.reasons.includes("DUPLICATE_OPTIONS"), `duplicate U+${marker.codePointAt(0).toString(16)}`);
    assert.ok(validation.reasons.includes("ANSWER_ALSO_IN_DISTRACTOR"), `distractor U+${marker.codePointAt(0).toString(16)}`);
  }
});

test("rechaza IDs ambiguos y referencias fantasma en estructuras manipuladas por el renderer", () => {
  const arrow = structuredClone(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.ARROW_MATCH));
  arrow.pairs[1].id = ` ${arrow.pairs[0].id} `;
  assert.ok(validateCatalogActivity(arrow).reasons.includes("DUPLICATE_PAIR_IDS"));
  const emptyPair = structuredClone(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.ARROW_MATCH));
  emptyPair.pairs[0].left = "";
  emptyPair.pairs[1].right = " ";
  assert.ok(validateCatalogActivity(emptyPair).reasons.includes("MISSING_PAIR_CONTENT"));
  const duplicatePair = structuredClone(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.ARROW_MATCH));
  duplicatePair.pairs[1].left = duplicatePair.pairs[0].left;
  duplicatePair.pairs[1].right = duplicatePair.pairs[0].right;
  const duplicatePairValidation = validateCatalogActivity(duplicatePair);
  assert.ok(duplicatePairValidation.reasons.includes("DUPLICATE_PAIRS"));
  assert.ok(duplicatePairValidation.reasons.includes("AMBIGUOUS_PAIR_MAPPING"));
  const ambiguousPair = structuredClone(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.ARROW_MATCH));
  ambiguousPair.pairs[1].left = ambiguousPair.pairs[0].left;
  assert.ok(validateCatalogActivity(ambiguousPair).reasons.includes("AMBIGUOUS_PAIR_MAPPING"));
  const trivialPair = structuredClone(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.ARROW_MATCH));
  trivialPair.pairs[0].right = trivialPair.pairs[0].left;
  assert.ok(validateCatalogActivity(trivialPair).reasons.includes("TRIVIAL_SELF_PAIR"));

  const sort = structuredClone(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.CATEGORY_SORT));
  sort.categories[1].id = ` ${sort.categories[0].id} `;
  sort.items[1].id = ` ${sort.items[0].id} `;
  sort.items[2].categoryId = "ghost";
  const sortValidation = validateCatalogActivity(sort);
  assert.ok(sortValidation.reasons.includes("DUPLICATE_CATEGORY_IDS"));
  assert.ok(sortValidation.reasons.includes("DUPLICATE_ITEM_IDS"));
  assert.ok(sortValidation.reasons.includes("INVALID_CATEGORY_REFERENCE"));
  const emptySortContent = structuredClone(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.CATEGORY_SORT));
  emptySortContent.categories[0].label = "";
  emptySortContent.items[0].text = "";
  const emptySortValidation = validateCatalogActivity(emptySortContent);
  assert.ok(emptySortValidation.reasons.includes("MISSING_CATEGORY_LABEL"));
  assert.ok(emptySortValidation.reasons.includes("MISSING_ITEM_CONTENT"));

  const dialogue = structuredClone(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.DIALOGUE_NEXT_TURN));
  dialogue.dialogue[1].id = ` ${dialogue.dialogue[0].id} `;
  assert.ok(validateCatalogActivity(dialogue).reasons.includes("DUPLICATE_DIALOGUE_TURN_IDS"));
  const emptyDialogue = structuredClone(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.DIALOGUE_NEXT_TURN));
  emptyDialogue.dialogue[0].speaker = "";
  emptyDialogue.dialogue[1].text = "";
  const emptyDialogueValidation = validateCatalogActivity(emptyDialogue);
  assert.ok(emptyDialogueValidation.reasons.includes("MISSING_DIALOGUE_SPEAKER"));
  assert.ok(emptyDialogueValidation.reasons.includes("MISSING_DIALOGUE_TEXT"));

  const emptyContext = structuredClone(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.CONTEXT_CHOICE));
  emptyContext.contextText = "";
  assert.ok(validateCatalogActivity(emptyContext).reasons.includes("MISSING_CONTEXT_CONTENT"));

  const emptyRecallPrompt = structuredClone(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.INDEPENDENT_RECALL));
  emptyRecallPrompt.instruction = "";
  emptyRecallPrompt.prompt = "";
  assert.ok(validateCatalogActivity(emptyRecallPrompt).reasons.includes("MISSING_ACTIVITY_PROMPT"));
});

test("rechaza matching trivial y mantiene GUIDED_GAP retirado", () => {
  const matching = validateCatalogActivity({
    activityType: ACTIVITY_TYPES.ARROW_MATCH,
    pairs: [{ id: "one", left: "iporã", right: "bien" }],
    correctAnswer: "iporã"
  });
  assert.ok(matching.reasons.includes("INVALID_PAIR_COUNT"));
  assert.ok(matching.reasons.includes("ANSWER_IN_SINGLE_PAIR"));
  const gap = validateCatalogActivity({
    activityType: ACTIVITY_TYPES.GUIDED_GAP,
    template: "m__",
    gapUnit: "LETTER",
    correctAnswer: "b",
    options: [{ id: "b", text: "b" }, { id: "p", text: "p" }, { id: "t", text: "t" }],
    correctOptionId: "b"
  });
  assert.ok(gap.reasons.includes("DEFECTIVE_ACTIVITY_TYPE_RETIRED"));
  assert.equal(isEnabledActivityType(ACTIVITY_TYPES.GUIDED_GAP), false);
});

test("SY nunca se convierte en WORD_TILE_BUILDER", () => {
  const candidates = buildDeterministicFallbackCandidates(context, 1, "RECALL_FAILURE");
  const wordTiles = candidates.find(candidate => candidate.activityType === ACTIVITY_TYPES.WORD_TILE_BUILDER);
  assert.equal(wordTiles, undefined);
  const selected = selectFirstValidCandidate(candidates, { ...context, errorType: "RECALL_FAILURE" });
  assert.equal(selected.accepted, true);
  assert.notEqual(selected.candidate.activityType, ACTIVITY_TYPES.WORD_TILE_BUILDER);
});

test("INDEPENDENT_RECALL sin ninguna respuesta aprobada falla cerrado", () => {
  const validation = validateCatalogActivity({
    activityType: ACTIVITY_TYPES.INDEPENDENT_RECALL,
    correctAnswer: "",
    acceptedAnswers: [],
    helpLevel: 0,
    answerExposure: "HIDDEN",
    hints: []
  });
  assert.equal(validation.valid, false);
  assert.ok(validation.reasons.includes("CORRECT_ANSWER_MISSING"));

  const aliasOnly = validateCatalogActivity({
    ...structuredClone(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.INDEPENDENT_RECALL)),
    correctAnswer: "",
    acceptedAnswers: ["aranduka"]
  });
  assert.ok(aliasOnly.reasons.includes("CORRECT_ANSWER_MISSING"));
});

test("el fallback de mamá cambia ejercicio y vuelve a variar en el segundo error", () => {
  const first = selectFirstValidCandidate(buildDeterministicFallbackCandidates(context, 1, "SEMANTIC_CONFUSION"), { ...context, errorType: "SEMANTIC_CONFUSION" });
  assert.equal(first.accepted, true);
  const secondContext = {
    ...context,
    attemptNumber: 2,
    previousActivityFingerprint: first.validation.fingerprint,
    recentActivityFingerprints: [first.validation.fingerprint],
    recentActivities: [{ activityType: first.candidate.activityType }]
  };
  const second = selectFirstValidCandidate(buildDeterministicFallbackCandidates(secondContext, 2, "SEMANTIC_CONFUSION"), { ...secondContext, errorType: "SEMANTIC_CONFUSION" });
  assert.equal(second.accepted, true);
  assert.notEqual(second.validation.fingerprint, first.validation.fingerprint);
  assert.notEqual(second.candidate.activityType, first.candidate.activityType);
});

test("detectAnswerLeakage bloquea respuesta en copy visible, pista y etiqueta visual", () => {
  const result = detectAnswerLeakage({
    activityType: ACTIVITY_TYPES.CONTEXT_CHOICE,
    prompt: "Selecciona kuarahy",
    instruction: "Identifica kuarahy",
    explanation: "Antes de responder, recuerda kuarahy.",
    correctAnswer: "kuarahy",
    hints: ["La respuesta es kuarahy"],
    options: [{ id: "sun", text: "kuarahy", alt: "Imagen de kuarahy" }],
    correctOptionId: "sun"
  });
  assert.equal(result.leaked, true);
  assert.ok(result.codes.includes("ANSWER_IN_PROMPT"));
  assert.ok(result.codes.includes("ANSWER_IN_INSTRUCTION"));
  assert.ok(result.codes.includes("ANSWER_IN_EXPLANATION"));
  assert.ok(result.codes.includes("ANSWER_IN_VISIBLE_HINT"));
  assert.ok(result.codes.includes("ANSWER_IN_IMAGE_LABEL"));
});

test("correctAnswer vacío no oculta acceptedAnswers al control de leakage y coherencia", () => {
  const validation = validateCatalogActivity({
    activityType: ACTIVITY_TYPES.CONTEXT_CHOICE,
    prompt: "Selecciona jagua.",
    contextText: "Elige la palabra practicada.",
    contextAuthorized: true,
    options: [
      { id: "dog", text: "jagua", authorized: true },
      { id: "cat", text: "mbarakaja", authorized: true },
      { id: "bird", text: "guyra", authorized: true }
    ],
    correctOptionId: "cat",
    correctAnswer: "",
    acceptedAnswers: ["jagua"]
  });

  assert.equal(validation.valid, false);
  assert.ok(validation.reasons.includes("ANSWER_IN_PROMPT"));
  assert.ok(validation.reasons.includes("CORRECT_OPTION_MISMATCH"));
});

test("detectAnswerLeakage evalúa cada respuesta aceptada sin confundir subcadenas", () => {
  const validation = validateCatalogActivity({
    activityType: ACTIVITY_TYPES.INDEPENDENT_RECALL,
    prompt: "Escribe jaguaite",
    correctAnswer: "jagua",
    acceptedAnswers: ["jagua", "jaguaite"],
    helpLevel: 0,
    answerExposure: "HIDDEN",
    hints: []
  });

  assert.equal(validation.valid, false);
  assert.ok(validation.reasons.includes("ANSWER_IN_PROMPT"));

  const boundaryOnly = detectAnswerLeakage({
    activityType: ACTIVITY_TYPES.INDEPENDENT_RECALL,
    prompt: "Escribe jaguaite",
    correctAnswer: "jagua",
    acceptedAnswers: ["jagua"],
    answerExposure: "HIDDEN"
  });
  assert.equal(boundaryOnly.leaked, false);

  const hiddenByEmptyContext = detectAnswerLeakage({
    activityType: ACTIVITY_TYPES.INDEPENDENT_RECALL,
    contextText: "",
    scenario: "Escribe jagua",
    correctAnswer: "jagua",
    acceptedAnswers: ["jagua"]
  });
  assert.ok(hiddenByEmptyContext.codes.includes("ANSWER_IN_CONTEXT"));

  const hiddenInAnotherLocale = detectAnswerLeakage({
    activityType: ACTIVITY_TYPES.INDEPENDENT_RECALL,
    contextText: [{ es: "", pt: "Escribe aranduka" }],
    correctAnswer: "aranduka",
    acceptedAnswers: ["aranduka"]
  }, { uiLocale: "es" });
  assert.ok(hiddenInAnotherLocale.codes.includes("ANSWER_IN_CONTEXT"));

  for (const [field, value] of [["prompt", 42], ["instruction", 42], ["contextText", 42]]) {
    const numericLeak = detectAnswerLeakage({
      activityType: ACTIVITY_TYPES.INDEPENDENT_RECALL,
      prompt: "Responde.",
      instruction: "Responde.",
      [field]: value,
      correctAnswer: "42",
      acceptedAnswers: ["42"]
    });
    const expectedCode = field === "prompt" ? "ANSWER_IN_PROMPT" : field === "instruction" ? "ANSWER_IN_INSTRUCTION" : "ANSWER_IN_CONTEXT";
    assert.ok(numericLeak.codes.includes(expectedCode), field);
  }

  const splitPhrase = detectAnswerLeakage({
    activityType: ACTIVITY_TYPES.INDEPENDENT_RECALL,
    prompt: { es: ["aran", "duka"] },
    correctAnswer: "aran duka",
    acceptedAnswers: ["aran duka"]
  });
  assert.ok(splitPhrase.codes.includes("ANSWER_IN_PROMPT"));

  for (const marker of ["\u200B", "\u200C", "\u200D", "\u2060", "\u00AD", "\uFE0E", "\uFE0F", "\u{E0100}"]) {
    const invisibleLeak = detectAnswerLeakage({
      activityType: ACTIVITY_TYPES.INDEPENDENT_RECALL,
      prompt: `Escribe aran${marker}duka`,
      correctAnswer: "aranduka",
      acceptedAnswers: ["aranduka"]
    });
    assert.ok(invisibleLeak.codes.includes("ANSWER_IN_PROMPT"), `U+${marker.codePointAt(0).toString(16).toUpperCase()}`);
  }

  const speakerLeak = detectAnswerLeakage({
    activityType: ACTIVITY_TYPES.DIALOGUE_NEXT_TURN,
    prompt: "Continúa el diálogo.",
    dialogue: [
      { id: "turn-1", speaker: "kuarahy", text: "Mba’éichapa?" },
      { id: "turn-2", speaker: "B", text: "Iporã." }
    ],
    correctAnswer: "kuarahy",
    acceptedAnswers: ["kuarahy"]
  });
  assert.ok(speakerLeak.codes.includes("ANSWER_IN_DIALOGUE"));
  const dialogueActivity = structuredClone(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.DIALOGUE_NEXT_TURN));
  dialogueActivity.dialogue[0].speaker = dialogueActivity.correctAnswer;
  const dialogueValidation = validateCatalogActivity(dialogueActivity);
  assert.equal(dialogueValidation.valid, false);
  assert.ok(dialogueValidation.reasons.includes("ANSWER_IN_DIALOGUE"));
  for (const dialogue of [
    [{ id: "turn-1", speaker: "aran", text: "duka" }],
    [{ id: "turn-1", speaker: "A", text: "aran" }, { id: "turn-2", speaker: "B", text: "duka" }]
  ]) {
    const splitDialogueLeak = detectAnswerLeakage({
      activityType: ACTIVITY_TYPES.DIALOGUE_NEXT_TURN,
      dialogue,
      correctAnswer: "aran duka",
      acceptedAnswers: ["aran duka"]
    });
    assert.ok(splitDialogueLeak.codes.includes("ANSWER_IN_DIALOGUE"), JSON.stringify(dialogue));
  }
});

test("conflictIds exige una lista plana y cualquier conflicto declarado bloquea", () => {
  const recall = structuredClone(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.INDEPENDENT_RECALL));
  assert.equal(validateCatalogActivity({ ...recall, conflictIds: [] }).valid, true);
  for (const conflictIds of ["C-001", { id: "C-001" }, [["C-001"]], [""], [42], [" C-001 "], ["C-003", "C-003"], ["C-\u200B001"], ["C-00\u00AD1"]]) {
    const validation = validateCatalogActivity({ ...recall, conflictIds });
    assert.equal(validation.valid, false, JSON.stringify(conflictIds));
    assert.ok(validation.reasons.includes("INVALID_CONFLICT_ID_DECLARATION"), JSON.stringify(conflictIds));
    if (!Array.isArray(conflictIds)) assert.ok(validation.reasons.includes("INVALID_COLLECTION_SHAPE"));
  }
  const open = validateCatalogActivity({ ...recall, conflictIds: ["C-001"] });
  assert.equal(open.valid, false);
  assert.ok(open.reasons.includes("OPEN_LINGUISTIC_CONFLICT"));
  const arbitraryOpen = validateCatalogActivity({ ...recall, conflictIds: ["C-003"] });
  assert.ok(arbitraryOpen.reasons.includes("OPEN_LINGUISTIC_CONFLICT"));
  for (const hasOpenConflict of ["true", 1, null]) {
    const invalidFlag = validateCatalogActivity({ ...recall, hasOpenConflict });
    assert.ok(invalidFlag.reasons.includes("INVALID_CONFLICT_DECLARATION"), String(hasOpenConflict));
  }
});

test("el diálogo autorizado de saludos conserva dos turnos previos y la tercera réplica oculta", () => {
  const sandbox = { window: {} };
  runInNewContext(readFileSync(new URL("../../assets/js/kuaa-general-activities.js", import.meta.url), "utf8"), sandbox);
  const activity = sandbox.window.KUAA_GENERAL_ACTIVITY_DATA.activities
    .find(candidate => candidate.id === "general-u01-significado-mba-eichapa");
  const dialogue = JSON.parse(JSON.stringify(activity.adaptiveDialogue));

  assert.equal(dialogue.authorized, true);
  assert.equal(dialogue.sourceContentId, "general-u01-dialogue-greetings");
  assert.ok(dialogue.turns.length >= 2 && dialogue.turns.length <= 4);
  assert.deepEqual(dialogue.turns.map(turn => turn.text), [
    "¿Mba’éichapa reime Ana?",
    "Aime porã, ¿ha nde?"
  ]);
  assert.equal(dialogue.correctOptionId, "greeting-close");
  assert.equal(dialogue.correctAnswer, "Aime porã avei. ¡Jajoechata!");
  assert.ok(dialogue.options.some(option => option.id === dialogue.correctOptionId && option.text === dialogue.correctAnswer));

  const validation = validateCatalogActivity({
    activityType: ACTIVITY_TYPES.DIALOGUE_NEXT_TURN,
    instruction: "Elige la respuesta que continúa la conversación.",
    prompt: "¿Qué respuesta sigue?",
    dialogue: dialogue.turns,
    dialogueAuthorized: dialogue.authorized,
    requiresStudentResponse: true,
    options: dialogue.options,
    correctOptionId: dialogue.correctOptionId,
    correctAnswer: dialogue.correctAnswer
  });
  assert.equal(validation.valid, true, validation.reasons.join(", "));
  assert.equal(validation.leakage.codes.includes("ANSWER_IN_DIALOGUE"), false);
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  assert.match(html, /assets\/js\/kuaa-general-activities\.js\?v=NALVI-GENERAL-ACTIVITIES-3/);
  assert.match(html, /assets\/js\/nalvi-intervention-client\.mjs\?v=NALVI-TUTOR-CLIENT-CATALOG-13/);
  const client = readFileSync(new URL("../../assets/js/nalvi-intervention-client.mjs", import.meta.url), "utf8");
  assert.match(client, /progression-engine\/fallback-intervention\.mjs\?v=NALVI-CATALOG-6/);
  assert.match(client, /nalvi-activity-catalog-renderer\.mjs\?v=NALVI-CATALOG-RENDERER-6/);
  assert.match(html, /nalvi-activity-catalog-renderer\.mjs\?v=NALVI-CATALOG-RENDERER-6/);
  for (const modulePath of ["../nalvi-activity-quality.mjs", "../catalog-examples.mjs"]) {
    const source = readFileSync(new URL(modulePath, import.meta.url), "utf8");
    assert.match(source, /\.\/nalvi-activity-catalog\.mjs\?v=NALVI-CATALOG-3/);
  }
});

test("tres selecciones seguidas son rechazadas, pero la primera no", () => {
  const choice = CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.CONTEXT_CHOICE);
  assert.equal(validateCatalogActivity(structuredClone(choice), { attemptNumber: 1 }).valid, true);
  const validation = validateCatalogActivity(structuredClone(choice), {
    attemptNumber: 2,
    recentActivities: [{ activityType: ACTIVITY_TYPES.DIALOGUE_NEXT_TURN }, { activityType: ACTIVITY_TYPES.AUDIO_SELECT }]
  });
  assert.ok(validation.reasons.includes("THREE_SELECTION_ACTIVITIES_IN_A_ROW"));
  const claimedJustification = validateCatalogActivity({ ...structuredClone(choice), reasonCode: "JUSTIFIED_FORGED" }, {
    recentActivities: [{ activityType: ACTIVITY_TYPES.CONTEXT_CHOICE }]
  });
  assert.ok(claimedJustification.reasons.includes("SAME_MODALITY_WITHOUT_REASON"));
});

test("los seis formatos exigen una respuesta activa y material aprobado exacto", () => {
  for (const example of CATALOG_EXAMPLES) {
    const passive = { ...structuredClone(example), requiresStudentResponse: false };
    assert.ok(validateCatalogActivity(passive).reasons.includes("STUDENT_RESPONSE_REQUIRED"), example.activityType);
  }

  const recall = structuredClone(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.INDEPENDENT_RECALL));
  recall.contextText = "";
  const exactContext = {
    correctAnswer: "aranduka",
    requireApprovedMaterial: true,
    approvedActivityMaterial: { correctAnswer: "aranduka", acceptedAnswers: ["aranduka", "aranduka-alias"], contexts: [] }
  };
  const subset = validateCatalogActivity(recall, exactContext);
  assert.ok(subset.reasons.includes("CONTENT_NOT_IN_APPROVED_MATERIAL"));
  const mismatchedContext = validateCatalogActivity({ ...recall, acceptedAnswers: ["aranduka", "aranduka-alias"] }, {
    ...exactContext,
    correctAnswer: "ambue"
  });
  assert.ok(mismatchedContext.reasons.includes("CONTENT_NOT_IN_APPROVED_MATERIAL"));
  const emptyAlias = validateCatalogActivity({ ...recall, acceptedAnswers: ["aranduka", ""] }, {
    ...exactContext,
    approvedActivityMaterial: { ...exactContext.approvedActivityMaterial, acceptedAnswers: ["aranduka"] }
  });
  assert.ok(emptyAlias.reasons.includes("CONTENT_NOT_IN_APPROVED_MATERIAL"));
  assert.ok(emptyAlias.reasons.includes("INVALID_ANSWER_DECLARATION"));
  const nestedAlias = validateCatalogActivity({ ...recall, acceptedAnswers: [["aranduka", ""]] }, {
    ...exactContext,
    approvedActivityMaterial: { ...exactContext.approvedActivityMaterial, acceptedAnswers: ["aranduka"] }
  });
  assert.ok(nestedAlias.reasons.includes("INVALID_ANSWER_DECLARATION"));
  assert.ok(nestedAlias.reasons.includes("CONTENT_NOT_IN_APPROVED_MATERIAL"));
  const forgedAnswerAlias = validateCatalogActivity({
    ...recall,
    acceptedAnswers: ["aranduka", "aranduka-alias"],
    answer: "ambue"
  }, exactContext);
  assert.ok(forgedAnswerAlias.reasons.includes("CONTENT_NOT_IN_APPROVED_MATERIAL"));

  const dialogue = structuredClone(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.DIALOGUE_NEXT_TURN));
  const dialogueMaterial = {
    correctAnswer: "kuarahy",
    acceptedAnswers: ["kuarahy"],
    contexts: [],
    dialogue: structuredClone(dialogue.dialogue),
    dialogueOptions: structuredClone(dialogue.options),
    dialogueCorrectOptionId: dialogue.correctOptionId,
    dialogueCorrectAnswer: dialogue.correctAnswer
  };
  const reversed = { ...dialogue, dialogue: [...dialogue.dialogue].reverse() };
  const reversedValidation = validateCatalogActivity(reversed, {
    correctAnswer: "kuarahy",
    requireApprovedMaterial: true,
    approvedActivityMaterial: dialogueMaterial
  });
  assert.ok(reversedValidation.reasons.includes("CONTENT_NOT_IN_APPROVED_MATERIAL"));

  const contextualLeak = { ...structuredClone(recall), contextText: "Contenido lingüístico inventado." };
  const contextualValidation = validateCatalogActivity(contextualLeak, exactContext);
  assert.ok(contextualValidation.reasons.includes("CONTENT_NOT_IN_APPROVED_MATERIAL"));

  const recallWithNestedAudio = { ...structuredClone(recall), audio: { id: "forged", path: "forged.m4a", authorized: true } };
  assert.ok(validateCatalogActivity(recallWithNestedAudio).reasons.includes("UNEXPECTED_AUDIO_MATERIAL"));
  for (const [key, value] of [
    ["audio", null], ["audio", ""], ["audio", false], ["audio", {}], ["audio", []],
    ["authorizedAudio", null], ["authorizedAudio", ""], ["authorizedAudio", false],
    ["authorizedAudio", {}], ["authorizedAudio", []],
    ["recordingId", ""], ["path", ""], ["text", ""], ["source", ""], ["authorized", false]
  ]) {
    const nestedPlaceholder = validateCatalogActivity({ ...structuredClone(recall), [key]: value });
    assert.equal(nestedPlaceholder.valid, false, `${key}:${JSON.stringify(value)}`);
    assert.ok(nestedPlaceholder.reasons.includes("UNEXPECTED_AUDIO_MATERIAL"));
  }
  const canonicalEmptyAudioPlaceholders = validateCatalogActivity({
    ...structuredClone(recall),
    audioId: "",
    audioPath: "",
    audioText: "",
    audioSource: "",
    audioAuthorized: false,
    humanRecorded: false
  });
  assert.equal(canonicalEmptyAudioPlaceholders.valid, true, JSON.stringify(canonicalEmptyAudioPlaceholders.reasons));
  const recallWithInactiveLocaleAudio = { ...structuredClone(recall), audioText: { es: "", pt: "som" } };
  assert.ok(validateCatalogActivity(recallWithInactiveLocaleAudio, { uiLocale: "es" }).reasons.includes("UNEXPECTED_AUDIO_MATERIAL"));
  const recallWithRichAudioAliases = {
    ...structuredClone(recall),
    recordingId: "forged",
    path: "forged.m4a",
    text: "aranduka",
    source: "manifest-human-recording",
    authorized: true
  };
  assert.ok(validateCatalogActivity(recallWithRichAudioAliases).reasons.includes("UNEXPECTED_AUDIO_MATERIAL"));
  const recallWithInactiveRichLocale = { ...structuredClone(recall), text: { es: "", pt: "som" } };
  assert.ok(validateCatalogActivity(recallWithInactiveRichLocale, { uiLocale: "es" }).reasons.includes("UNEXPECTED_AUDIO_MATERIAL"));
});

test("la copia visible de material aprobado se limita al copy pedagógico determinista", () => {
  for (const example of CATALOG_EXAMPLES) {
    const activity = canonicalApprovedCandidate(example);
    const material = approvedMaterialForExample(activity);
    const validationContext = {
      uiLocale: "es",
      correctAnswer: activity.correctAnswer,
      requireApprovedMaterial: true,
      approvedActivityMaterial: material
    };
    assert.equal(validateCatalogActivity(structuredClone(activity), validationContext).valid, true, activity.activityType);
    const wrongTypeCopy = structuredClone(activity);
    wrongTypeCopy.prompt = DETERMINISTIC_COPY_ES[activity.activityType === ACTIVITY_TYPES.CONTEXT_CHOICE
      ? ACTIVITY_TYPES.ARROW_MATCH : ACTIVITY_TYPES.CONTEXT_CHOICE];
    assert.ok(validateCatalogActivity(wrongTypeCopy, validationContext).reasons.includes("CONTENT_NOT_IN_APPROVED_MATERIAL"), activity.activityType);
  }

  const recall = canonicalApprovedCandidate(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.INDEPENDENT_RECALL));
  const material = approvedMaterialForExample(recall);
  const validationContext = {
    uiLocale: "es",
    correctAnswer: recall.correctAnswer,
    requireApprovedMaterial: true,
    approvedActivityMaterial: material
  };
  assert.equal(validateCatalogActivity(structuredClone(recall), validationContext).valid, true);
  const mutations = [
    activity => { activity.prompt = "Escribe una forma guaraní inventada."; },
    activity => { activity.instruction = "Usa una expresión guaraní no autorizada."; },
    activity => { activity.explanation = "Contenido lingüístico añadido por el Planner."; },
    activity => { activity.hints = ["Pista lingüística no aprobada."]; }
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(recall);
    mutate(candidate);
    const validation = validateCatalogActivity(candidate, validationContext);
    assert.equal(validation.valid, false);
    assert.ok(validation.reasons.includes("CONTENT_NOT_IN_APPROVED_MATERIAL"));
  }
});

test("DIALOGUE_NEXT_TURN exige la procedencia documental exacta del diálogo", () => {
  const dialogue = canonicalApprovedCandidate(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.DIALOGUE_NEXT_TURN));
  const material = approvedMaterialForExample(dialogue);
  const validationContext = {
    uiLocale: "es",
    correctAnswer: dialogue.correctAnswer,
    requireApprovedMaterial: true,
    approvedActivityMaterial: material
  };
  assert.equal(validateCatalogActivity(structuredClone(dialogue), validationContext).valid, true);
  for (const value of [undefined, " otro-dialogo ", "otro-dialogo", { forged: "fixture-dialogue-source" }]) {
    const candidate = structuredClone(dialogue);
    if (value === undefined) delete candidate.dialogueSourceContentId;
    else candidate.dialogueSourceContentId = value;
    const validation = validateCatalogActivity(candidate, validationContext);
    assert.equal(validation.valid, false, String(value));
    assert.ok(validation.reasons.includes("CONTENT_NOT_IN_APPROVED_MATERIAL"));
  }
  const recall = canonicalApprovedCandidate(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.INDEPENDENT_RECALL));
  const recallMaterial = approvedMaterialForExample(recall);
  const forgedNonDialogueSource = validateCatalogActivity({ ...recall, dialogueSourceContentId: "fixture-dialogue-source" }, {
    uiLocale: "es",
    correctAnswer: recall.correctAnswer,
    requireApprovedMaterial: true,
    approvedActivityMaterial: recallMaterial
  });
  assert.ok(forgedNonDialogueSource.reasons.includes("CONTENT_NOT_IN_APPROVED_MATERIAL"));
});

test("la procedencia declarada coincide exactamente con la autoridad aprobada", () => {
  const validateAgainst = (activity, material) => validateCatalogActivity(activity, {
    uiLocale: "es",
    correctAnswer: activity.correctAnswer,
    activity: { id: activity.id, sourceIds: structuredClone(activity.sourceIds || []) },
    requireApprovedMaterial: true,
    approvedActivityMaterial: material
  });

  for (const field of ["sourceActivityId", "sourceContentId"]) {
    const activity = canonicalApprovedCandidate(CATALOG_EXAMPLES.find(candidate => candidate.activityType === ACTIVITY_TYPES.INDEPENDENT_RECALL));
    const material = approvedMaterialForExample(activity);
    activity[field] = field === "sourceActivityId" ? activity.id : `approved-${field}`;
    material[field] = activity[field];
    assert.equal(validateAgainst(structuredClone(activity), structuredClone(material)).valid, true, `${field} positive`);
    for (const mutation of ["omit", "mismatch", "object"]) {
      const candidate = structuredClone(activity);
      const approved = structuredClone(material);
      if (mutation === "omit") delete candidate[field];
      if (mutation === "mismatch") candidate[field] = `different-${field}`;
      if (mutation === "object") approved[field] = { forged: activity[field] };
      assert.ok(validateAgainst(candidate, approved).reasons.includes("CONTENT_NOT_IN_APPROVED_MATERIAL"), `${field} ${mutation}`);
    }
  }

  const sourceActivity = canonicalApprovedCandidate(CATALOG_EXAMPLES.find(candidate => candidate.activityType === ACTIVITY_TYPES.INDEPENDENT_RECALL));
  sourceActivity.sourceIds = ["SRC-A", "SRC-B"];
  const sourceMaterial = approvedMaterialForExample(sourceActivity);
  sourceMaterial.sourceIds = ["SRC-B", "SRC-A"];
  assert.equal(validateAgainst(structuredClone(sourceActivity), structuredClone(sourceMaterial)).valid, true, "sourceIds set positive");
  for (const mutation of ["omit", "mismatch", "object"]) {
    const candidate = structuredClone(sourceActivity);
    const approved = structuredClone(sourceMaterial);
    if (mutation === "omit") delete candidate.sourceIds;
    if (mutation === "mismatch") candidate.sourceIds = ["SRC-A", "SRC-C"];
    if (mutation === "object") approved.sourceIds = [{ forged: "SRC-A" }];
    assert.ok(validateAgainst(candidate, approved).reasons.includes("CONTENT_NOT_IN_APPROVED_MATERIAL"), `sourceIds ${mutation}`);
  }
  for (const sourceIds of [["SRC-A"], ["SRC-A", "SRC-A"], ["SRC-A", " SRC-B"]]) {
    const candidate = { ...structuredClone(sourceActivity), sourceIds };
    assert.ok(validateAgainst(candidate, structuredClone(sourceMaterial)).reasons.includes("CONTENT_NOT_IN_APPROVED_MATERIAL"), JSON.stringify(sourceIds));
  }
  for (const marker of ["\u200B", "\n", "\uFE0F"]) {
    const hiddenSource = { ...structuredClone(sourceActivity), sourceIds: [`SRC${marker}-A`, "SRC-B"] };
    const hiddenMaterial = { ...structuredClone(sourceMaterial), sourceIds: [`SRC${marker}-A`, "SRC-B"] };
    assert.ok(validateAgainst(hiddenSource, hiddenMaterial).reasons.includes("CONTENT_NOT_IN_APPROVED_MATERIAL"), `source marker U+${marker.codePointAt(0).toString(16)}`);
  }
  const contradictoryTrustedSources = validateCatalogActivity(structuredClone(sourceActivity), {
    uiLocale: "es",
    correctAnswer: sourceActivity.correctAnswer,
    sourceIds: ["TRUSTED-SOURCE"],
    activity: { id: "trusted-source-activity", sourceIds: ["TRUSTED-SOURCE"] },
    requireApprovedMaterial: true,
    approvedActivityMaterial: structuredClone(sourceMaterial)
  });
  assert.ok(contradictoryTrustedSources.reasons.includes("CONTENT_NOT_IN_APPROVED_MATERIAL"));
  const emptyMaterialCannotHideTrustedSources = validateCatalogActivity({ ...structuredClone(sourceActivity), sourceIds: [] }, {
    uiLocale: "es",
    correctAnswer: sourceActivity.correctAnswer,
    activity: { id: "trusted-source-activity", sourceIds: ["TRUSTED-SOURCE"] },
    requireApprovedMaterial: true,
    approvedActivityMaterial: { ...structuredClone(sourceMaterial), sourceIds: [] }
  });
  assert.ok(emptyMaterialCannotHideTrustedSources.reasons.includes("CONTENT_NOT_IN_APPROVED_MATERIAL"));

  const recordCases = [
    [ACTIVITY_TYPES.CONTEXT_CHOICE, "options", "options"],
    [ACTIVITY_TYPES.ARROW_MATCH, "pairs", "pairs"],
    [ACTIVITY_TYPES.CATEGORY_SORT, "categories", "categories"],
    [ACTIVITY_TYPES.CATEGORY_SORT, "items", "items"],
    [ACTIVITY_TYPES.DIALOGUE_NEXT_TURN, "dialogue", "dialogue"],
    [ACTIVITY_TYPES.DIALOGUE_NEXT_TURN, "options", "dialogueOptions"]
  ];
  for (const [type, candidateKey, materialKey] of recordCases) {
    const activity = canonicalApprovedCandidate(CATALOG_EXAMPLES.find(candidate => candidate.activityType === type));
    const material = approvedMaterialForExample(activity);
    activity[candidateKey][0].sourceActivityId = "approved-record-source";
    material[materialKey][0].sourceActivityId = "approved-record-source";
    assert.equal(validateAgainst(structuredClone(activity), structuredClone(material)).valid, true, `${type}:${candidateKey} positive`);
    for (const mutation of ["omit", "mismatch", "object"]) {
      const candidate = structuredClone(activity);
      const approved = structuredClone(material);
      if (mutation === "omit") delete candidate[candidateKey][0].sourceActivityId;
      if (mutation === "mismatch") candidate[candidateKey][0].sourceActivityId = "different-record-source";
      if (mutation === "object") approved[materialKey][0].sourceActivityId = { forged: "approved-record-source" };
      assert.ok(validateAgainst(candidate, approved).reasons.includes("CONTENT_NOT_IN_APPROVED_MATERIAL"), `${type}:${candidateKey} ${mutation}`);
    }
    const duplicateRecordSources = structuredClone(activity);
    const approvedDuplicateRecordSources = structuredClone(material);
    duplicateRecordSources[candidateKey][0].sourceIds = ["SRC-RECORD", "SRC-RECORD"];
    approvedDuplicateRecordSources[materialKey][0].sourceIds = ["SRC-RECORD", "SRC-RECORD"];
    assert.ok(validateAgainst(duplicateRecordSources, approvedDuplicateRecordSources).reasons.includes("CONTENT_NOT_IN_APPROVED_MATERIAL"), `${type}:${candidateKey} duplicate sources`);
  }
});

test("la whitelist compara toda declaración localizada, no sólo la locale activa", () => {
  const cases = [
    [ACTIVITY_TYPES.CONTEXT_CHOICE, "options", "options", "text"],
    [ACTIVITY_TYPES.ARROW_MATCH, "pairs", "pairs", "left"],
    [ACTIVITY_TYPES.DIALOGUE_NEXT_TURN, "dialogue", "dialogue", "text"]
  ];
  for (const [type, candidateKey, materialKey, field] of cases) {
    const candidate = canonicalApprovedCandidate(CATALOG_EXAMPLES.find(activity => activity.activityType === type));
    const material = approvedMaterialForExample(candidate);
    const approvedText = candidate[candidateKey][0][field];
    candidate[candidateKey][0][field] = { es: approvedText, pt: "CONTEÚDO AUTORIZADO" };
    material[materialKey][0][field] = structuredClone(candidate[candidateKey][0][field]);
    const validationContext = {
      uiLocale: "es",
      correctAnswer: candidate.correctAnswer,
      requireApprovedMaterial: true,
      approvedActivityMaterial: material
    };
    assert.equal(validateCatalogActivity(structuredClone(candidate), validationContext).valid, true, `${type} localized positive`);
    const contradictoryMaterial = structuredClone(material);
    contradictoryMaterial[materialKey][0][field].pt = "OUTRO CONTEÚDO";
    const validation = validateCatalogActivity(candidate, {
      ...validationContext,
      approvedActivityMaterial: contradictoryMaterial
    });
    assert.ok(validation.reasons.includes("CONTENT_NOT_IN_APPROVED_MATERIAL"), type);
  }
});

test("cada error soportado conserva al menos un fallback habilitado, válido y autorizado", () => {
  for (const errorType of ERROR_TYPES) {
    const candidates = buildDeterministicFallbackCandidates(context, 1, errorType);
    const selected = selectFirstValidCandidate(candidates, { ...context, errorType });
    assert.equal(selected.accepted, true, `${errorType}: ${JSON.stringify(selected.rejected)}`);
    assert.ok(ENABLED_TYPES.includes(selected.candidate.activityType), errorType);
    if (errorType === "LISTENING_CONFUSION") {
      assert.notEqual(selected.candidate.activityType, ACTIVITY_TYPES.AUDIO_SELECT, "un audio Jagua no puede intervenir el objetivo sy");
    }
  }

  const audio = canonicalApprovedCandidate(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.AUDIO_SELECT));
  const arrow = canonicalApprovedCandidate(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.ARROW_MATCH));
  const coherentAudioContext = {
    ...context,
    correctAnswer: "jagua",
    sourceIds: [...audio.sourceIds],
    activity: { ...context.activity, correctOptionId: "jagua", options: audio.options, sourceIds: [...audio.sourceIds] },
    approvedActivityMaterial: {
      ...context.approvedActivityMaterial,
      sourceIds: [...audio.sourceIds],
      correctOptionId: "jagua",
      correctAnswer: "jagua",
      acceptedAnswers: ["jagua"],
      options: audio.options,
      pairs: arrow.pairs,
      audio: { ...APPROVED_AUDIO }
    },
    errorType: "LISTENING_CONFUSION"
  };
  const coherentAudio = selectFirstValidCandidate([{
    activityType: ACTIVITY_TYPES.AUDIO_SELECT,
    errorType: "LISTENING_CONFUSION",
    estimatedCognitiveDemand: audio.cognitiveDemand,
    reasonCode: "HUMAN_AUDIO_DISCRIMINATION",
    activity: audio
  }], coherentAudioContext);
  assert.equal(coherentAudio.accepted, true, JSON.stringify(coherentAudio.rejected));
  assert.equal(coherentAudio.candidate.activityType, ACTIVITY_TYPES.AUDIO_SELECT);
  assert.deepEqual({
    audioId: coherentAudio.candidate.activity.audioId,
    audioPath: coherentAudio.candidate.activity.audioPath,
    audioText: coherentAudio.candidate.activity.audioText,
    audioAuthorized: coherentAudio.candidate.activity.audioAuthorized,
    humanRecorded: coherentAudio.candidate.activity.humanRecorded,
    audioSource: coherentAudio.candidate.activity.audioSource
  }, CANONICAL_AUDIO);

  const coherentNestedAudio = {
    ...structuredClone(audio),
    authorizedAudio: { ...APPROVED_AUDIO }
  };
  assert.equal(selectFirstValidCandidate([{
    activityType: ACTIVITY_TYPES.AUDIO_SELECT,
    errorType: "LISTENING_CONFUSION",
    estimatedCognitiveDemand: coherentNestedAudio.cognitiveDemand,
    reasonCode: "HUMAN_AUDIO_DISCRIMINATION",
    activity: coherentNestedAudio
  }], coherentAudioContext).accepted, true);

  const akeCanonicalAudio = {
    audioId: "NALVI-AUDIO-041",
    audioPath: "assets/audio/guarani/ali-2026/041-ake-duermo.m4a",
    audioText: "Ake (duermo)",
    audioAuthorized: true,
    humanRecorded: true,
    audioSource: "manifest-human-recording"
  };
  const akeRichAudio = {
    id: akeCanonicalAudio.audioId,
    audioId: akeCanonicalAudio.audioId,
    recordingId: akeCanonicalAudio.audioId,
    path: akeCanonicalAudio.audioPath,
    audioPath: akeCanonicalAudio.audioPath,
    text: "Ake",
    audioText: akeCanonicalAudio.audioText,
    source: akeCanonicalAudio.audioSource,
    audioSource: akeCanonicalAudio.audioSource,
    authorized: true,
    audioAuthorized: true,
    humanRecorded: true
  };
  const akeActivity = {
    ...structuredClone(audio),
    ...akeCanonicalAudio,
    options: [
      { id: "ake", text: "Ake", authorized: true },
      { id: "jagua", text: "Jagua", authorized: true },
      { id: "guyra", text: "Guyra", authorized: true }
    ],
    correctOptionId: "ake",
    correctAnswer: "Ake",
    acceptedAnswers: ["Ake"],
    authorizedAudio: akeRichAudio
  };
  const akeContext = {
    ...coherentAudioContext,
    correctAnswer: "Ake",
    activity: {
      ...coherentAudioContext.activity,
      correctOptionId: "ake",
      correctAnswer: "Ake",
      acceptedAnswers: ["Ake"],
      options: akeActivity.options
    },
    approvedActivityMaterial: {
      ...coherentAudioContext.approvedActivityMaterial,
      correctOptionId: "ake",
      correctAnswer: "Ake",
      acceptedAnswers: ["Ake"],
      options: akeActivity.options,
      audio: akeRichAudio
    }
  };
  const akeNestedSelection = selectFirstValidCandidate([{
    activityType: ACTIVITY_TYPES.AUDIO_SELECT,
    errorType: "LISTENING_CONFUSION",
    estimatedCognitiveDemand: akeActivity.cognitiveDemand,
    reasonCode: "HUMAN_AUDIO_DISCRIMINATION",
    activity: akeActivity
  }], akeContext);
  assert.equal(akeNestedSelection.accepted, true, JSON.stringify(akeNestedSelection.rejected));
  assert.equal(akeNestedSelection.candidate.activity.audioText, "Ake (duermo)");
  const akeTopRichActivity = { ...structuredClone(akeActivity), recordingId: akeRichAudio.recordingId,
    path: akeRichAudio.path, text: akeRichAudio.text, source: akeRichAudio.source, authorized: true };
  delete akeTopRichActivity.authorizedAudio;
  assert.equal(selectFirstValidCandidate([{
    activityType: ACTIVITY_TYPES.AUDIO_SELECT,
    errorType: "LISTENING_CONFUSION",
    estimatedCognitiveDemand: akeTopRichActivity.cognitiveDemand,
    reasonCode: "HUMAN_AUDIO_DISCRIMINATION",
    activity: akeTopRichActivity
  }], akeContext).accepted, true);
  for (const mutation of [
    { authorizedAudio: { ...akeRichAudio, text: "Guyra" } },
    { recordingId: akeRichAudio.recordingId, path: akeRichAudio.path, text: "Guyra", source: akeRichAudio.source, authorized: true }
  ]) {
    const mismatchedAlias = { ...structuredClone(akeActivity), ...mutation };
    if (Object.prototype.hasOwnProperty.call(mutation, "recordingId")) delete mismatchedAlias.authorizedAudio;
    const rejectedAlias = selectFirstValidCandidate([{
      activityType: ACTIVITY_TYPES.AUDIO_SELECT,
      errorType: "LISTENING_CONFUSION",
      estimatedCognitiveDemand: mismatchedAlias.cognitiveDemand,
      reasonCode: "HUMAN_AUDIO_DISCRIMINATION",
      activity: mismatchedAlias
    }], akeContext);
    assert.equal(rejectedAlias.accepted, false, JSON.stringify(mutation));
    assert.ok(rejectedAlias.rejected[0].reasons.includes("AUDIO_NOT_AUTHORIZED_FOR_TARGET"));
  }

  for (const key of ["audio", "authorizedAudio"]) {
    const contradictory = {
      ...structuredClone(audio),
      [key]: {
        ...APPROVED_AUDIO,
        id: "NALVI-AUDIO-095",
        audioId: "NALVI-AUDIO-095",
        recordingId: "NALVI-AUDIO-095",
        path: "assets/audio/guarani/ali-2026/095-itati.m4a",
        audioPath: "assets/audio/guarani/ali-2026/095-itati.m4a",
        text: "Itatĩ",
        audioText: "Itatĩ"
      }
    };
    const rejected = selectFirstValidCandidate([{
      activityType: ACTIVITY_TYPES.AUDIO_SELECT,
      errorType: "LISTENING_CONFUSION",
      estimatedCognitiveDemand: contradictory.cognitiveDemand,
      reasonCode: "HUMAN_AUDIO_DISCRIMINATION",
      activity: contradictory
    }], coherentAudioContext);
    assert.equal(rejected.accepted, false, key);
    assert.ok(rejected.rejected[0].reasons.includes("AUDIO_NOT_AUTHORIZED_FOR_TARGET"), key);
  }

  const contradictoryTopAliases = {
    ...structuredClone(audio),
    recordingId: audio.audioId,
    path: "assets/audio/guarani/ali-2026/095-itati.m4a",
    text: audio.audioText,
    source: audio.audioSource,
    authorized: true
  };
  const topAliasSelection = selectFirstValidCandidate([{
    activityType: ACTIVITY_TYPES.AUDIO_SELECT,
    errorType: "LISTENING_CONFUSION",
    estimatedCognitiveDemand: contradictoryTopAliases.cognitiveDemand,
    reasonCode: "HUMAN_AUDIO_DISCRIMINATION",
    activity: contradictoryTopAliases
  }], coherentAudioContext);
  assert.equal(topAliasSelection.accepted, false);
  assert.ok(topAliasSelection.rejected[0].reasons.includes("AUDIO_NOT_AUTHORIZED_FOR_TARGET"));

  const canonicalSixContext = {
    ...coherentAudioContext,
    approvedActivityMaterial: { ...coherentAudioContext.approvedActivityMaterial, audio: { ...CANONICAL_AUDIO } }
  };
  assert.equal(selectFirstValidCandidate([{
    activityType: ACTIVITY_TYPES.AUDIO_SELECT,
    errorType: "LISTENING_CONFUSION",
    estimatedCognitiveDemand: audio.cognitiveDemand,
    reasonCode: "HUMAN_AUDIO_DISCRIMINATION",
    activity: audio
  }], canonicalSixContext).accepted, true);

  const partialRichContext = {
    ...coherentAudioContext,
    approvedActivityMaterial: {
      ...coherentAudioContext.approvedActivityMaterial,
      audio: { ...CANONICAL_AUDIO, id: CANONICAL_AUDIO.audioId }
    }
  };
  const partialRichSelection = selectFirstValidCandidate([{
    activityType: ACTIVITY_TYPES.AUDIO_SELECT,
    errorType: "LISTENING_CONFUSION",
    estimatedCognitiveDemand: audio.cognitiveDemand,
    reasonCode: "HUMAN_AUDIO_DISCRIMINATION",
    activity: audio
  }], partialRichContext);
  assert.equal(partialRichSelection.accepted, false);
  assert.ok(partialRichSelection.rejected[0].reasons.includes("AUDIO_NOT_AUTHORIZED_FOR_TARGET"));

  const invalidRichAliases = [
    ["id", ""], ["id", "OTHER-AUDIO"],
    ["recordingId", ""], ["recordingId", "OTHER-AUDIO"],
    ["path", ""], ["path", "assets/audio/other.m4a"],
    ["text", ""], ["text", "Guyra"],
    ["source", ""], ["source", "client-claim"],
    ["audioId", ""], ["audioId", "OTHER-AUDIO"],
    ["audioPath", ""], ["audioPath", "assets/audio/other.m4a"],
    ["audioText", ""], ["audioText", "Guyra"],
    ["audioSource", ""], ["audioSource", "client-claim"],
    ["authorized", false], ["audioAuthorized", false], ["humanRecorded", false]
  ];
  for (const [field, invalidValue] of invalidRichAliases) {
    const invalidContext = {
      ...coherentAudioContext,
      approvedActivityMaterial: {
        ...coherentAudioContext.approvedActivityMaterial,
        audio: { ...APPROVED_AUDIO, [field]: invalidValue }
      }
    };
    assert.equal(approvedAudioForTarget(invalidContext), null, `${field}:${String(invalidValue)}`);
  }
  const contradictoryTargets = {
    ...coherentAudioContext,
    approvedActivityMaterial: {
      ...coherentAudioContext.approvedActivityMaterial,
      correctAnswer: "guyra",
      acceptedAnswers: ["jagua", "guyra"]
    }
  };
  assert.equal(approvedAudioForTarget(contradictoryTargets), null);

  const arrowOnly = [{
    activityType: ACTIVITY_TYPES.ARROW_MATCH,
    errorType: "LISTENING_CONFUSION",
    estimatedCognitiveDemand: arrow.cognitiveDemand,
    reasonCode: "JUSTIFIED_FORGED",
    activity: arrow
  }];
  const omittedAuthorizedAudio = selectFirstValidCandidate(arrowOnly, coherentAudioContext);
  assert.equal(omittedAuthorizedAudio.accepted, false);
  assert.ok(omittedAuthorizedAudio.rejected[0].reasons.includes("TYPE_NOT_ALIGNED_WITH_ERROR"));

  const mismatchedErrorCandidate = selectFirstValidCandidate([{
    activityType: ACTIVITY_TYPES.AUDIO_SELECT,
    errorType: "SPELLING_ERROR",
    estimatedCognitiveDemand: audio.cognitiveDemand,
    reasonCode: "HUMAN_AUDIO_DISCRIMINATION",
    activity: audio
  }], coherentAudioContext);
  assert.equal(mismatchedErrorCandidate.accepted, false);
  assert.ok(mismatchedErrorCandidate.rejected[0].reasons.includes("CANDIDATE_ERROR_TYPE_MISMATCH"));

  const missingErrorContext = { ...coherentAudioContext };
  delete missingErrorContext.errorType;
  const missingTrustedError = selectFirstValidCandidate([{
    activityType: ACTIVITY_TYPES.AUDIO_SELECT,
    errorType: "LISTENING_CONFUSION",
    estimatedCognitiveDemand: audio.cognitiveDemand,
    reasonCode: "HUMAN_AUDIO_DISCRIMINATION",
    activity: audio
  }], missingErrorContext);
  assert.equal(missingTrustedError.accepted, false);
  assert.ok(missingTrustedError.rejected[0].reasons.includes("MISSING_TRUSTED_ERROR_TYPE"));

  const audioCandidate = {
    activityType: ACTIVITY_TYPES.AUDIO_SELECT,
    errorType: "LISTENING_CONFUSION",
    estimatedCognitiveDemand: audio.cognitiveDemand,
    reasonCode: "HUMAN_AUDIO_DISCRIMINATION",
    activity: audio
  };
  const arrowCandidate = {
    activityType: ACTIVITY_TYPES.ARROW_MATCH,
    errorType: "LISTENING_CONFUSION",
    estimatedCognitiveDemand: arrow.cognitiveDemand,
    reasonCode: "MULTI_PAIR_SEMANTIC_CONNECTION",
    activity: arrow
  };
  for (const recentActivities of [
    [{ activityType: ACTIVITY_TYPES.AUDIO_SELECT }],
    [{ activityType: ACTIVITY_TYPES.CONTEXT_CHOICE }, { activityType: ACTIVITY_TYPES.DIALOGUE_NEXT_TURN }]
  ]) {
    const historicalFallback = selectFirstValidCandidate([audioCandidate, arrowCandidate], {
      ...coherentAudioContext,
      recentActivities
    });
    assert.equal(historicalFallback.accepted, true, JSON.stringify(historicalFallback.rejected));
    assert.equal(historicalFallback.candidate.activityType, ACTIVITY_TYPES.ARROW_MATCH);
  }

  const nonCanonicalAudio = structuredClone(audio);
  nonCanonicalAudio.audioId = ` ${CANONICAL_AUDIO.audioId} `;
  assert.equal(selectFirstValidCandidate([{ ...audioCandidate, activity: nonCanonicalAudio }], coherentAudioContext).accepted, false);

  const inventedContextChoice = structuredClone(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.CONTEXT_CHOICE));
  const inventedSelection = selectFirstValidCandidate([{
    activityType: ACTIVITY_TYPES.CONTEXT_CHOICE,
    errorType: "SEMANTIC_CONFUSION",
    estimatedCognitiveDemand: inventedContextChoice.cognitiveDemand,
    reasonCode: "CONTEXTUAL_DISCRIMINATION",
    activity: inventedContextChoice
  }], { ...coherentAudioContext, errorType: "SEMANTIC_CONFUSION" });
  assert.equal(inventedSelection.accepted, false);
  assert.ok(inventedSelection.rejected[0].reasons.includes("CONTENT_NOT_IN_APPROVED_MATERIAL"));

  const noAudioContext = {
    ...context,
    approvedActivityMaterial: { ...context.approvedActivityMaterial, audio: null },
    errorType: "LISTENING_CONFUSION"
  };
  const authorizedNonAudio = buildDeterministicFallbackCandidates(noAudioContext, 1, "LISTENING_CONFUSION")
    .filter(candidate => [ACTIVITY_TYPES.ARROW_MATCH, ACTIVITY_TYPES.CONTEXT_CHOICE].includes(candidate.activityType));
  assert.ok(authorizedNonAudio.length > 0);
  assert.equal(selectFirstValidCandidate(authorizedNonAudio, noAudioContext).accepted, true);

  const forgedAudio = structuredClone(audio);
  forgedAudio.audioId = "FAKE-AUDIO";
  forgedAudio.audioPath = "assets/audio/fake.m4a";
  const forgedSelection = selectFirstValidCandidate([{
    activityType: ACTIVITY_TYPES.AUDIO_SELECT,
    errorType: "LISTENING_CONFUSION",
    estimatedCognitiveDemand: forgedAudio.cognitiveDemand,
    reasonCode: "JUSTIFIED_FORGED_AUDIO",
    activity: forgedAudio
  }], noAudioContext);
  assert.equal(forgedSelection.accepted, false);
  assert.ok(forgedSelection.rejected[0].reasons.includes("AUDIO_NOT_AUTHORIZED_FOR_TARGET"));
});

test("la detección no confunde una respuesta corta con parte de otra palabra ni serializa objetos", () => {
  const shortAnswer = detectAnswerLeakage({
    activityType: ACTIVITY_TYPES.INDEPENDENT_RECALL,
    prompt: "Escucha antes de responder.",
    correctAnswer: "ha",
    answerExposure: "HIDDEN"
  });
  assert.equal(shortAnswer.leaked, false);

  const localized = detectAnswerLeakage({
    activityType: ACTIVITY_TYPES.CONTEXT_CHOICE,
    prompt: { es: { arbitrary: "objeto sin texto autorizado" } },
    contextText: { es: { arbitrary: "otro objeto" } },
    correctAnswer: "sy"
  });
  assert.equal(localized.leaked, false);
  assert.doesNotMatch(JSON.stringify(localized), /\[object Object\]/);
});

test("rechaza contextos localizados que el renderer convertiría en objetos visibles", () => {
  const recall = structuredClone(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.INDEPENDENT_RECALL));
  const nestedContext = { es: { text: "Contexto autorizado" } };
  const nested = validateCatalogActivity({ ...recall, contextText: nestedContext }, {
    uiLocale: "es",
    correctAnswer: recall.correctAnswer,
    requireApprovedMaterial: true,
    approvedActivityMaterial: {
      correctAnswer: recall.correctAnswer,
      acceptedAnswers: structuredClone(recall.acceptedAnswers),
      contexts: [{ text: nestedContext, authorized: true }]
    }
  });
  assert.equal(nested.valid, false);
  assert.ok(nested.reasons.includes("INVALID_VISIBLE_TEXT_DECLARATION"));
  assert.ok(nested.reasons.includes("CONTENT_NOT_IN_APPROVED_MATERIAL"));

  const hiddenInAnotherLocale = validateCatalogActivity({
    ...recall,
    contextText: { es: "Contexto autorizado", pt: { text: "Contexto inseguro" } }
  });
  assert.ok(hiddenInAnotherLocale.reasons.includes("INVALID_VISIBLE_TEXT_DECLARATION"));
});

test("rechaza objetos localizados anidados en cada componente visible", () => {
  const cases = [
    ["option", ACTIVITY_TYPES.CONTEXT_CHOICE, activity => { activity.options[1].text = { es: { text: "Ambue" } }; }],
    ["pair", ACTIVITY_TYPES.ARROW_MATCH, activity => { activity.pairs[1].left = { es: { text: "Ambue" } }; }],
    ["category", ACTIVITY_TYPES.CATEGORY_SORT, activity => { activity.categories[1].label = { es: { text: "Ambue" } }; }],
    ["item", ACTIVITY_TYPES.CATEGORY_SORT, activity => { activity.items[1].text = { es: { text: "Ambue" } }; }],
    ["speaker", ACTIVITY_TYPES.DIALOGUE_NEXT_TURN, activity => { activity.dialogue[0].speaker = { es: { text: "A" } }; }],
    ["turn", ACTIVITY_TYPES.DIALOGUE_NEXT_TURN, activity => { activity.dialogue[0].text = { es: { text: "Saludo" } }; }],
    ["hint", ACTIVITY_TYPES.INDEPENDENT_RECALL, activity => {
      activity.helpLevel = 1;
      activity.hints = [{ es: { text: "Pista" } }];
    }]
  ];
  for (const [label, type, mutate] of cases) {
    const activity = canonicalApprovedCandidate(CATALOG_EXAMPLES.find(candidate => candidate.activityType === type));
    mutate(activity);
    assert.ok(validateCatalogActivity(activity).reasons.includes("INVALID_VISIBLE_TEXT_DECLARATION"), label);
  }
});

test("rechaza IDs estructurados antes de que String los vuelva ambiguos", () => {
  const option = structuredClone(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.CONTEXT_CHOICE));
  option.options[0].id = { x: "sun" };
  option.correctOptionId = "[object Object]";
  assert.ok(validateCatalogActivity(option).reasons.includes("MISSING_OPTION_ID"));

  const correctOption = structuredClone(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.CONTEXT_CHOICE));
  correctOption.correctOptionId = { x: "sun" };
  assert.ok(validateCatalogActivity(correctOption).reasons.includes("CORRECT_OPTION_MISSING"));

  const arrow = structuredClone(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.ARROW_MATCH));
  arrow.pairs[0].id = { x: "one" };
  assert.ok(validateCatalogActivity(arrow).reasons.includes("MISSING_PAIR_ID"));

  const sortCategory = structuredClone(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.CATEGORY_SORT));
  sortCategory.categories[0].id = { x: "category" };
  sortCategory.items[0].categoryId = "[object Object]";
  const categoryValidation = validateCatalogActivity(sortCategory);
  assert.ok(categoryValidation.reasons.includes("MISSING_CATEGORY_ID"));
  assert.ok(categoryValidation.reasons.includes("INVALID_CATEGORY_REFERENCE"));

  const sortItem = structuredClone(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.CATEGORY_SORT));
  sortItem.items[0].id = { x: "item" };
  assert.ok(validateCatalogActivity(sortItem).reasons.includes("MISSING_ITEM_ID"));

  const dialogue = structuredClone(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.DIALOGUE_NEXT_TURN));
  dialogue.dialogue[0].id = { x: "turn" };
  assert.ok(validateCatalogActivity(dialogue).reasons.includes("MISSING_DIALOGUE_TURN_ID"));
});

test("la autoridad exige IDs string sin coerción en cada estructura", () => {
  const validateAgainst = (activity, material) => validateCatalogActivity(activity, {
    uiLocale: "es",
    correctAnswer: activity.correctAnswer,
    requireApprovedMaterial: true,
    approvedActivityMaterial: material
  });
  const cases = [
    ["option", ACTIVITY_TYPES.CONTEXT_CHOICE, (activity, material) => {
      activity.options[0].id = "[object Object]";
      activity.correctOptionId = "[object Object]";
      material.options[0].id = { forged: "id" };
      material.correctOptionId = { forged: "id" };
    }],
    ["pair", ACTIVITY_TYPES.ARROW_MATCH, (activity, material) => {
      activity.pairs[0].id = "[object Object]";
      material.pairs[0].id = { forged: "id" };
    }],
    ["pair-source", ACTIVITY_TYPES.ARROW_MATCH, (activity, material) => {
      activity.pairs[0].sourceActivityId = "[object Object]";
      material.pairs[0].sourceActivityId = { forged: "source" };
    }],
    ["category", ACTIVITY_TYPES.CATEGORY_SORT, (activity, material) => {
      const originalId = activity.categories[0].id;
      activity.categories[0].id = "[object Object]";
      activity.items.filter(item => item.categoryId === originalId).forEach(item => { item.categoryId = "[object Object]"; });
      material.categories[0].id = { forged: "id" };
      material.items.filter(item => item.categoryId === originalId).forEach(item => { item.categoryId = "[object Object]"; });
    }],
    ["item", ACTIVITY_TYPES.CATEGORY_SORT, (activity, material) => {
      activity.items[0].id = "[object Object]";
      material.items[0].id = { forged: "id" };
    }],
    ["category-reference", ACTIVITY_TYPES.CATEGORY_SORT, (activity, material) => {
      const originalId = activity.categories[0].id;
      activity.categories[0].id = "[object Object]";
      material.categories[0].id = "[object Object]";
      activity.items.filter(item => item.categoryId === originalId).forEach(item => { item.categoryId = "[object Object]"; });
      material.items.filter(item => item.categoryId === originalId).forEach(item => { item.categoryId = { forged: "id" }; });
    }],
    ["turn", ACTIVITY_TYPES.DIALOGUE_NEXT_TURN, (activity, material) => {
      activity.dialogue[0].id = "[object Object]";
      material.dialogue[0].id = { forged: "id" };
    }],
    ["dialogue-option", ACTIVITY_TYPES.DIALOGUE_NEXT_TURN, (activity, material) => {
      activity.options[0].id = "[object Object]";
      activity.correctOptionId = "[object Object]";
      material.dialogueOptions[0].id = { forged: "id" };
      material.dialogueCorrectOptionId = { forged: "id" };
    }],
    ["dialogue-source", ACTIVITY_TYPES.DIALOGUE_NEXT_TURN, (_activity, material) => {
      material.dialogueSourceContentId = { forged: "source" };
    }],
    ["source-ids", ACTIVITY_TYPES.INDEPENDENT_RECALL, (activity, material) => {
      activity.sourceIds = ["[object Object]"];
      material.sourceIds = [{ forged: "source" }];
    }]
  ];

  for (const [label, type, mutate] of cases) {
    const activity = canonicalApprovedCandidate(CATALOG_EXAMPLES.find(candidate => candidate.activityType === type));
    const material = approvedMaterialForExample(activity);
    assert.equal(validateAgainst(structuredClone(activity), structuredClone(material)).valid, true, `${label} baseline`);
    mutate(activity, material);
    const validation = validateAgainst(activity, material);
    assert.equal(validation.valid, false, label);
    assert.ok(validation.reasons.includes("CONTENT_NOT_IN_APPROVED_MATERIAL"), label);
  }
});

test("colecciones malformadas fallan cerrado sin lanzar", () => {
  const candidateCases = [
    ["contexts", ACTIVITY_TYPES.INDEPENDENT_RECALL],
    ["options", ACTIVITY_TYPES.CONTEXT_CHOICE],
    ["pairs", ACTIVITY_TYPES.ARROW_MATCH],
    ["categories", ACTIVITY_TYPES.CATEGORY_SORT],
    ["items", ACTIVITY_TYPES.CATEGORY_SORT],
    ["dialogue", ACTIVITY_TYPES.DIALOGUE_NEXT_TURN],
    ["dialogueOptions", ACTIVITY_TYPES.DIALOGUE_NEXT_TURN],
    ["hints", ACTIVITY_TYPES.INDEPENDENT_RECALL],
    ["acceptedAnswers", ACTIVITY_TYPES.INDEPENDENT_RECALL],
    ["tokens", ACTIVITY_TYPES.INDEPENDENT_RECALL]
  ];
  for (const [key, type] of candidateCases) {
    const activity = structuredClone(CATALOG_EXAMPLES.find(candidate => candidate.activityType === type));
    activity[key] = {};
    const validation = validateCatalogActivity(activity);
    assert.equal(validation.valid, false, `candidate ${key}`);
    assert.ok(validation.reasons.includes("INVALID_COLLECTION_SHAPE"), `candidate ${key}`);
  }

  const approvedCases = [
    ["contexts", ACTIVITY_TYPES.CONTEXT_CHOICE],
    ["options", ACTIVITY_TYPES.CONTEXT_CHOICE],
    ["pairs", ACTIVITY_TYPES.ARROW_MATCH],
    ["categories", ACTIVITY_TYPES.CATEGORY_SORT],
    ["items", ACTIVITY_TYPES.CATEGORY_SORT],
    ["dialogue", ACTIVITY_TYPES.DIALOGUE_NEXT_TURN],
    ["dialogueOptions", ACTIVITY_TYPES.DIALOGUE_NEXT_TURN],
    ["acceptedAnswers", ACTIVITY_TYPES.INDEPENDENT_RECALL],
    ["hints", ACTIVITY_TYPES.INDEPENDENT_RECALL],
    ["tokens", ACTIVITY_TYPES.INDEPENDENT_RECALL]
  ];
  for (const [key, type] of approvedCases) {
    const activity = structuredClone(CATALOG_EXAMPLES.find(candidate => candidate.activityType === type));
    const material = approvedMaterialForExample(activity);
    material[key] = {};
    const validation = validateCatalogActivity(activity, {
      uiLocale: "es",
      correctAnswer: activity.correctAnswer,
      requireApprovedMaterial: true,
      approvedActivityMaterial: material
    });
    assert.equal(validation.valid, false, `approved ${key}`);
    assert.ok(validation.reasons.includes("CONTENT_NOT_IN_APPROVED_MATERIAL"), `approved ${key}`);
  }
});
