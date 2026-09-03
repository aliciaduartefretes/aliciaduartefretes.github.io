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
    "Mba’éichapa, Ana?",
    "Iporã, aguyje. Ha nde?"
  ]);
  assert.equal(dialogue.correctOptionId, "greeting-close");
  assert.equal(dialogue.correctAnswer, "Iporã avei. Jajotopata!");
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
  assert.match(html, /assets\/js\/kuaa-general-activities\.js\?v=NALVI-GENERAL-ACTIVITIES-2/);
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

  const audio = structuredClone(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.AUDIO_SELECT));
  const arrow = structuredClone(CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.ARROW_MATCH));
  const coherentAudioContext = {
    ...context,
    correctAnswer: "jagua",
    activity: { ...context.activity, correctOptionId: "jagua", options: audio.options },
    approvedActivityMaterial: {
      ...context.approvedActivityMaterial,
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
