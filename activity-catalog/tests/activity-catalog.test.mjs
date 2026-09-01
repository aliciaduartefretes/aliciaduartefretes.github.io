import assert from "node:assert/strict";
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
import { buildDeterministicFallbackCandidates } from "../../progression-engine/fallback-intervention.mjs";

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
  availableActivities: []
};

test("el enum oficial expone 14 tipos habilitados y mantiene audio/8C apagados", () => {
  const audit = catalogAudit();
  assert.equal(audit.enabledTypes.length, 14);
  assert.equal(ENABLE_AUDIO_INTERVENTIONS, false);
  assert.equal(isEnabledActivityType(ACTIVITY_TYPES.MORPHEME_BUILDER), false);
  assert.equal(audit.paso8cStarted, false);
});

test("cada ejemplo habilitado pasa esquema, pedagogía y leakage", () => {
  assert.equal(CATALOG_EXAMPLES.length, 14);
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

test("rechaza tipos inventados, audio y morfemas de PASO 8C", () => {
  for (const type of ["AI_MAGIC_QUIZ", ACTIVITY_TYPES.AUDIO_SELECT, ACTIVITY_TYPES.MORPHEME_BUILDER]) {
    const validation = validateCatalogActivity({ activityType: type, type, correctAnswer: "x" });
    assert.equal(validation.valid, false);
  }
});

test("rechaza matching trivial y completar una sola letra", () => {
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
  assert.ok(gap.reasons.includes("SINGLE_LETTER_COMPLETION"));
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
    activityType: ACTIVITY_TYPES.IMAGE_CHOICE,
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
    recentActivities: [{ activityType: ACTIVITY_TYPES.IMAGE_CHOICE }, { activityType: ACTIVITY_TYPES.CONCEPT_CONTRAST }]
  });
  assert.ok(validation.reasons.includes("THREE_SELECTION_ACTIVITIES_IN_A_ROW"));
});
