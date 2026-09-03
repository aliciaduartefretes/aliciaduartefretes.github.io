import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CATALOG_EXAMPLES } from "../catalog-examples.mjs";
import {
  ACTIVITY_TYPES,
  ENABLE_AUDIO_INTERVENTIONS,
  catalogAudit,
  isEnabledActivityType
} from "../nalvi-activity-catalog.mjs";
import {
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
    audio: {
      id: CANONICAL_AUDIO.audioId,
      recordingId: CANONICAL_AUDIO.audioId,
      path: CANONICAL_AUDIO.audioPath,
      text: CANONICAL_AUDIO.audioText,
      source: CANONICAL_AUDIO.audioSource,
      authorized: true,
      ...CANONICAL_AUDIO
    }
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
    const validation = validateCatalogActivity(activity, { uiLocale: "es", attemptNumber: 1 });
    assert.equal(validation.valid, true, `${activity.activityType}: ${validation.reasons.join(", ")}`);
  }
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
  const audio = CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.AUDIO_SELECT);
  assert.ok(audio);
  assert.equal(validateCatalogActivity(structuredClone(audio)).valid, true);
  assert.ok(validateCatalogActivity({ ...structuredClone(audio), audioAuthorized: false }).reasons.includes("UNAUTHORIZED_AUDIO"));
  assert.ok(validateCatalogActivity({ ...structuredClone(audio), audioId: "" }).reasons.includes("MISSING_AUDIO_SOURCE"));
  assert.ok(validateCatalogActivity({ ...structuredClone(audio), audioSource: "client-claim" }).reasons.includes("UNAUTHORIZED_AUDIO_SOURCE"));

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

test("detectAnswerLeakage bloquea respuesta en prompt, pista y etiqueta visual", () => {
  const result = detectAnswerLeakage({
    activityType: ACTIVITY_TYPES.CONTEXT_CHOICE,
    prompt: "Selecciona kuarahy",
    correctAnswer: "kuarahy",
    hints: ["La respuesta es kuarahy"],
    options: [{ id: "sun", text: "kuarahy", alt: "Imagen de kuarahy" }],
    correctOptionId: "sun"
  });
  assert.equal(result.leaked, true);
  assert.ok(result.codes.includes("ANSWER_IN_PROMPT"));
  assert.ok(result.codes.includes("ANSWER_IN_VISIBLE_HINT"));
  assert.ok(result.codes.includes("ANSWER_IN_IMAGE_LABEL"));
});

test("tres selecciones seguidas son rechazadas, pero la primera no", () => {
  const choice = CATALOG_EXAMPLES.find(activity => activity.activityType === ACTIVITY_TYPES.CONTEXT_CHOICE);
  assert.equal(validateCatalogActivity(structuredClone(choice), { attemptNumber: 1 }).valid, true);
  const validation = validateCatalogActivity(structuredClone(choice), {
    attemptNumber: 2,
    recentActivities: [{ activityType: ACTIVITY_TYPES.DIALOGUE_NEXT_TURN }, { activityType: ACTIVITY_TYPES.AUDIO_SELECT }]
  });
  assert.ok(validation.reasons.includes("THREE_SELECTION_ACTIVITIES_IN_A_ROW"));
});

test("cada error soportado conserva al menos un fallback habilitado, válido y autorizado", () => {
  for (const errorType of ERROR_TYPES) {
    const candidates = buildDeterministicFallbackCandidates(context, 1, errorType);
    const selected = selectFirstValidCandidate(candidates, { ...context, errorType });
    assert.equal(selected.accepted, true, `${errorType}: ${JSON.stringify(selected.rejected)}`);
    assert.ok(ENABLED_TYPES.includes(selected.candidate.activityType), errorType);
  }
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
