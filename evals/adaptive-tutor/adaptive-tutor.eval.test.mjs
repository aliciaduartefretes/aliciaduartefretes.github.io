import test from "node:test";
import assert from "node:assert/strict";
import { catalogAudit, isEnabledActivityType } from "../../activity-catalog/nalvi-activity-catalog.mjs";
import { createActivityFingerprint } from "../../intervention-engine/intervention-engine.mjs";
import { createProfessionalFallbackPlan } from "../../server/adaptive-tutor-orchestrator.mjs";
import { answerLeakageDetected, planMetrics, validatePedagogicalQuality } from "../../server/adaptive-tutor-quality.mjs";

const locales = ["es", "en", "pt", "fr", "it", "de"];
const enabledTypes = ["CONTEXT_CHOICE", "ARROW_MATCH", "CATEGORY_SORT", "DIALOGUE_NEXT_TURN", "INDEPENDENT_RECALL", "AUDIO_SELECT"];
const canonicalAudio = Object.freeze({
  audioId: "NALVI-AUDIO-096",
  audioPath: "assets/audio/guarani/ali-2026/096-jagua.m4a",
  audioText: "Jagua",
  audioAuthorized: true,
  humanRecorded: true,
  audioSource: "manifest-human-recording"
});
const approvedContexts = Object.freeze({
  es: "Una situación documentada de la lección.", en: "A documented lesson situation.",
  pt: "Uma situação documentada da lição.", fr: "Une situation documentée de la leçon.",
  it: "Una situazione documentata della lezione.", de: "Eine dokumentierte Unterrichtssituation."
});
const scenarios = [
  { id: "mother-semantic", conceptId: "family-mother", prompt: "¿Cómo se dice mamá?", answer: "sy", wrong: "ru", skill: "vocabulary", type: "multiple-choice", attempt: 1 },
  { id: "mother-listening", conceptId: "family-mother", prompt: "Escucha y reconoce mamá.", answer: "sy", wrong: "ru", skill: "listening", type: "listening", attempt: 1 },
  { id: "mother-writing", conceptId: "family-mother", prompt: "Escribe la palabra para mamá.", answer: "sy", wrong: "si", skill: "writing", type: "writing", attempt: 1 },
  { id: "ipora-semantic", conceptId: "quality-good", prompt: "Reconoce la expresión trabajada.", answer: "iporã", wrong: "vai", skill: "vocabulary", type: "multiple-choice", attempt: 1 },
  { id: "ipora-nasality", conceptId: "quality-good", prompt: "Escribe la expresión trabajada.", answer: "iporã", wrong: "ipora", skill: "writing", type: "writing", attempt: 1 },
  { id: "repeated-recall", conceptId: "family-mother", prompt: "Recupera la palabra de familia.", answer: "sy", wrong: "", skill: "writing", type: "fill-blank", attempt: 3 },
  { id: "repeated-listening", conceptId: "quality-good", prompt: "Escucha la expresión de cualidad.", answer: "iporã", wrong: "vai", skill: "listening", type: "listening", attempt: 3 },
  { id: "profile-application", conceptId: "quality-good", prompt: "Usa la expresión del objetivo.", answer: "iporã", wrong: "vai", skill: "application", type: "writing", attempt: 3 },
  { id: "jagua-listening", conceptId: "animal-dog", prompt: "Escucha y reconoce la palabra trabajada.", answer: "Jagua", wrong: "Sy", skill: "listening", type: "listening", attempt: 1 }
];

const textOf = option => String(option?.text ?? option?.label ?? option?.value ?? "");

function approvedMaterialFor(activity, scenario, uiLocale) {
  const options = activity.options.map((option, index) => ({
    id: String(option.id || `option-${index + 1}`),
    text: textOf(option),
    authorized: true
  }));
  return {
    options,
    correctOptionId: activity.correctOptionId,
    correctAnswer: scenario.answer,
    acceptedAnswers: [scenario.answer],
    pairs: options.map((option, index) => ({
      id: `pair-${index + 1}`,
      left: option.text,
      right: `meaning-${index + 1}`,
      authorized: true
    })),
    contexts: [{ text: approvedContexts[uiLocale], authorized: true }],
    categories: [
      { id: "known", label: "Known", authorized: true },
      { id: "contrast", label: "Contrast", authorized: true }
    ],
    items: Array.from({ length: 6 }, (_, index) => ({
      id: `item-${index + 1}`,
      text: `documented-item-${index + 1}`,
      categoryId: index < 3 ? "known" : "contrast",
      authorized: true
    })),
    dialogue: [
      { id: "turn-1", speaker: "A", text: "Documented turn one.", authorized: true },
      { id: "turn-2", speaker: "B", text: "Documented turn two.", authorized: true }
    ],
    dialogueOptions: options,
    dialogueCorrectOptionId: activity.correctOptionId,
    dialogueCorrectAnswer: scenario.answer,
    dialogueSourceContentId: `dialogue-${scenario.id}`,
    audio: scenario.answer === canonicalAudio.audioText ? { ...canonicalAudio } : null
  };
}

function contextFor(scenario, uiLocale) {
  const options = scenario.answer === "sy"
    ? [{ id: "sy", label: "sy" }, { id: "ru", label: "ru" }, { id: "oga", label: "óga" }]
    : scenario.answer === "Jagua"
      ? [{ id: "jagua", label: "Jagua" }, { id: "sy", label: "Sy" }, { id: "oga", label: "Óga" }]
      : [{ id: "ipora", label: "iporã" }, { id: "vai", label: "vai" }, { id: "puku", label: "puku" }];
  const activity = {
    id: `source-${scenario.id}-${uiLocale}`, conceptId: scenario.conceptId, type: scenario.type,
    skill: scenario.skill, difficulty: "foundation-1", instruction: scenario.prompt,
    prompt: scenario.prompt, options,
    correctOptionId: options.find(option => option.label === scenario.answer)?.id || "",
    acceptedAnswers: [scenario.answer], answer: scenario.answer,
    lessonContext: { sourcePrompt: scenario.prompt, sourceInstruction: scenario.prompt, sourceAnswer: scenario.answer }
  };
  return {
    correct: false, conceptId: scenario.conceptId, learningObjectiveId: `objective-${scenario.conceptId}`,
    currentSkill: scenario.skill, activityType: scenario.type, difficulty: "foundation-1",
    studentAnswer: scenario.wrong, correctAnswer: scenario.answer, attemptNumber: scenario.attempt,
    recentErrors: scenario.attempt > 1 ? [{ conceptId: scenario.conceptId, errorType: "RECALL_FAILURE" }] : [],
    recentActivityFingerprints: [], modalitiesAlreadyUsed: [scenario.type], recentInterventions: [],
    hintHistory: [], retentionHistory: [], answerExposureHistory: [], strategyEffectiveness: {},
    uiLocale, grammarRuleIds: [], lexemeIds: [], knowledgeIds: [], activity,
    approvedActivityMaterial: approvedMaterialFor(activity, scenario, uiLocale)
  };
}

const evalCases = scenarios.flatMap(scenario => locales.map(uiLocale => ({ scenario, uiLocale })));

test(`suite profesional: ${evalCases.length} casos en seis idiomas`, async t => {
  assert.ok(evalCases.length >= 40);
  assert.deepEqual(catalogAudit().enabledTypes, enabledTypes);
  for (const { scenario, uiLocale } of evalCases) {
    await t.test(`${scenario.id}-${uiLocale}`, () => {
      const context = contextFor(scenario, uiLocale);
      context.previousActivityFingerprint = createActivityFingerprint(context.activity, { uiLocale });
      const plan = createProfessionalFallbackPlan(context);
      const fingerprints = plan.activities.map(activity => createActivityFingerprint({ ...activity, type: activity.activityType }, { uiLocale }));
      const quality = validatePedagogicalQuality(plan, context);
      const metrics = planMetrics(plan, context);

      assert.equal(plan.studentFeedback.locale, uiLocale);
      assert.equal(plan.conceptId, scenario.conceptId);
      assert.equal(plan.progressionPolicy.onIncorrect, "BLOCK_AND_INTERVENE");
      assert.equal(plan.progressionPolicy.onGuidedCorrect, "CONTINUE_PRACTICE");
      assert.equal(plan.progressionPolicy.requiresIndependentRetest, true);
      assert.ok(plan.activities.length >= 1 && plan.activities.length <= 4);
      assert.ok(plan.activities.some(activity => activity.requiresStudentResponse !== false));
      assert.ok(plan.activities.every(activity => isEnabledActivityType(activity.activityType)));
      assert.ok(fingerprints.every(fingerprint => fingerprint !== context.previousActivityFingerprint));
      assert.equal(new Set(fingerprints).size, fingerprints.length);
      assert.equal(answerLeakageDetected(plan, context), false);
      assert.equal(metrics.answerLeakageRate, 0);
      assert.equal(metrics.duplicateRate, 0);
      assert.equal(metrics.firstErrorExplicitSolutionRate, 0);
      assert.equal(metrics.singlePairMatchingRate, 0);
      assert.equal(quality.valid, true, quality.reasons.join(", "));
      for (const activity of plan.activities) {
        assert.ok(enabledTypes.includes(activity.activityType));
        if (Number(activity.helpLevel || 0) > 0) {
          const support = [activity.contextText, activity.lessonContext?.sourcePrompt, activity.lessonContext?.sourceInstruction, activity.explanation, ...(activity.hints || [])].join(" ").trim();
          const mediaSupport = ["audio", "image"].includes(activity.media?.type) && activity.media?.value;
          assert.ok(support || mediaSupport, "guided activity must show learning support");
        }
        if (activity.activityType === "AUDIO_SELECT") {
          assert.deepEqual({
            audioId: activity.audioId,
            audioPath: activity.audioPath,
            audioText: activity.audioText,
            audioAuthorized: activity.audioAuthorized,
            humanRecorded: activity.humanRecorded,
            audioSource: activity.audioSource
          }, canonicalAudio);
        }
      }
      if (plan.activities.some(activity => ["WORKED_EXAMPLE", "EXPLICIT_SOLUTION"].includes(activity.answerExposure))) {
        assert.equal(metrics.independentRetestCoverage, 1);
      }
    });
  }
});

test("dos perfiles con el mismo concepto reciben modalidades diferentes", () => {
  const listener = contextFor(scenarios[1], "es");
  const writer = contextFor(scenarios[2], "es");
  const listenerPlan = createProfessionalFallbackPlan(listener);
  const writerPlan = createProfessionalFallbackPlan(writer);
  assert.notEqual(listenerPlan.activities[0].activityType, writerPlan.activities[0].activityType);
});

test("el validador rechaza los fallos de calidad críticos", () => {
  const context = contextFor(scenarios[0], "es");
  const badPlan = {
    studentFeedback: { shortMessage: "OpenAI strategy debug" }, strategy: { reasonCode: "" },
    activities: [{
      activityType: "ARROW_MATCH", requiresStudentResponse: true, helpLevel: 4,
      answerExposure: "EXPLICIT_SOLUTION", instruction: "sy", prompt: context.activity.prompt,
      pairs: [{ id: "one", left: "sy", right: "mamá" }], options: [], hints: [], explanation: "", correctAnswer: "sy"
    }],
    progressionPolicy: { onIncorrect: "BLOCK_AND_INTERVENE", requiresIndependentRetest: true }
  };
  const result = validatePedagogicalQuality(badPlan, context);
  assert.equal(result.valid, false);
  for (const reason of ["INVALID_PAIR_COUNT", "ANSWER_IN_SINGLE_PAIR", "FIRST_ERROR_EXPLICIT_SOLUTION"]) {
    assert.ok(result.reasons.includes(reason), reason);
  }
});

test("GUIDED_GAP permanece retirado y no puede reactivarse mediante una fixture", () => {
  const context = contextFor(scenarios[0], "es");
  const result = validatePedagogicalQuality({
    studentFeedback: { shortMessage: "Probemos de otra forma." },
    strategy: { reasonCode: "change-modality" },
    activities: [{
      activityType: "GUIDED_GAP", requiresStudentResponse: true, helpLevel: 2,
      answerExposure: "PARTIAL_HINT", instruction: "Completa.", prompt: "Completa.",
      template: "{{blank}}", options: [], hints: [], explanation: "", correctAnswer: "sy"
    }],
    progressionPolicy: { onIncorrect: "BLOCK_AND_INTERVENE", requiresIndependentRetest: true }
  }, context);
  assert.equal(result.valid, false);
  assert.equal(isEnabledActivityType("GUIDED_GAP"), false);
  assert.ok(result.reasons.includes("DEFECTIVE_ACTIVITY_TYPE_RETIRED"));
  assert.ok(!catalogAudit().enabledTypes.includes("GUIDED_GAP"));
});
