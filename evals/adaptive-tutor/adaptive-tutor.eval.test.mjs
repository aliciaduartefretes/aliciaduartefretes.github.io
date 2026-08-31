import test from "node:test";
import assert from "node:assert/strict";
import { createActivityFingerprint } from "../../intervention-engine/intervention-engine.mjs";
import { createProfessionalFallbackPlan } from "../../server/adaptive-tutor-orchestrator.mjs";
import { answerLeakageDetected, planMetrics, validatePedagogicalQuality } from "../../server/adaptive-tutor-quality.mjs";

const locales = ["es", "en", "pt", "fr", "it", "de"];
const scenarios = [
  { id: "mother-semantic", conceptId: "family-mother", prompt: "¿Cómo se dice mamá?", answer: "sy", wrong: "ru", skill: "vocabulary", type: "multiple-choice", attempt: 1 },
  { id: "mother-listening", conceptId: "family-mother", prompt: "Escucha y reconoce mamá.", answer: "sy", wrong: "ru", skill: "listening", type: "listening", attempt: 1 },
  { id: "mother-writing", conceptId: "family-mother", prompt: "Escribe la palabra para mamá.", answer: "sy", wrong: "si", skill: "writing", type: "writing", attempt: 1 },
  { id: "ipora-semantic", conceptId: "quality-good", prompt: "Reconoce la expresión trabajada.", answer: "iporã", wrong: "vai", skill: "vocabulary", type: "multiple-choice", attempt: 1 },
  { id: "ipora-nasality", conceptId: "quality-good", prompt: "Escribe la expresión trabajada.", answer: "iporã", wrong: "ipora", skill: "writing", type: "writing", attempt: 1 },
  { id: "repeated-recall", conceptId: "family-mother", prompt: "Recupera la palabra de familia.", answer: "sy", wrong: "", skill: "writing", type: "fill-blank", attempt: 3 },
  { id: "repeated-listening", conceptId: "quality-good", prompt: "Escucha la expresión de cualidad.", answer: "iporã", wrong: "vai", skill: "listening", type: "listening", attempt: 3 },
  { id: "profile-application", conceptId: "quality-good", prompt: "Usa la expresión del objetivo.", answer: "iporã", wrong: "vai", skill: "application", type: "writing", attempt: 3 }
];

function contextFor(scenario, uiLocale) {
  const options = scenario.answer === "sy"
    ? [{ id: "sy", label: "sy" }, { id: "ru", label: "ru" }, { id: "oga", label: "óga" }]
    : [{ id: "ipora", label: "iporã" }, { id: "vai", label: "vai" }, { id: "puku", label: "puku" }];
  const activity = {
    id: `source-${scenario.id}-${uiLocale}`, conceptId: scenario.conceptId, type: scenario.type,
    skill: scenario.skill, difficulty: "foundation-1", instruction: scenario.prompt,
    prompt: scenario.prompt, options,
    correctOptionId: options.find(option => option.label === scenario.answer)?.id || "",
    acceptedAnswers: [scenario.answer], answer: scenario.answer
  };
  return {
    correct: false, conceptId: scenario.conceptId, learningObjectiveId: `objective-${scenario.conceptId}`,
    currentSkill: scenario.skill, activityType: scenario.type, difficulty: "foundation-1",
    studentAnswer: scenario.wrong, correctAnswer: scenario.answer, attemptNumber: scenario.attempt,
    recentErrors: scenario.attempt > 1 ? [{ conceptId: scenario.conceptId, errorType: "RECALL_FAILURE" }] : [],
    recentActivityFingerprints: [], modalitiesAlreadyUsed: [scenario.type], recentInterventions: [],
    hintHistory: [], retentionHistory: [], answerExposureHistory: [], strategyEffectiveness: {},
    uiLocale, grammarRuleIds: [], lexemeIds: [], knowledgeIds: [], activity
  };
}

const evalCases = scenarios.flatMap(scenario => locales.map(uiLocale => ({ scenario, uiLocale })));

test(`suite profesional: ${evalCases.length} casos en seis idiomas`, async t => {
  assert.ok(evalCases.length >= 40);
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
      assert.ok(fingerprints.every(fingerprint => fingerprint !== context.previousActivityFingerprint));
      assert.equal(new Set(fingerprints).size, fingerprints.length);
      assert.equal(answerLeakageDetected(plan, context), false);
      assert.equal(metrics.answerLeakageRate, 0);
      assert.equal(metrics.duplicateRate, 0);
      assert.equal(metrics.firstErrorExplicitSolutionRate, 0);
      assert.equal(metrics.singlePairMatchingRate, 0);
      assert.equal(quality.valid, true, quality.reasons.join(", "));
      for (const activity of plan.activities) {
        if (activity.activityType === "fill-blank") {
          const contextText = String(activity.template || "").replace(/\{\{blank\}\}|_+/g, "").replace(/[→:;,.!?¿¡\s-]+/g, "").trim();
          assert.ok(contextText, "fill-blank must show visible context");
        }
        if (Number(activity.helpLevel || 0) > 0) {
          const support = [activity.lessonContext?.sourcePrompt, activity.lessonContext?.sourceInstruction, activity.explanation, ...(activity.hints || [])].join(" ").trim();
          const mediaSupport = ["audio", "image"].includes(activity.media?.type) && activity.media?.value;
          assert.ok(support || mediaSupport, "guided activity must show learning support");
        }
      }
      if (scenario.attempt >= 3) assert.equal(metrics.independentRetestCoverage, 1);
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
      activityType: "matching", requiresStudentResponse: true, helpLevel: 4,
      answerExposure: "EXPLICIT_SOLUTION", instruction: "sy", prompt: context.activity.prompt,
      pairs: [{ id: "one", left: "sy", right: "mamá" }], options: [], hints: [], explanation: ""
    }]
  };
  const result = validatePedagogicalQuality(badPlan, context);
  assert.equal(result.valid, false);
  for (const reason of ["SINGLE_PAIR_MATCHING", "TECHNICAL_TEXT_VISIBLE", "ANSWER_VISIBLE_TOO_EARLY", "MISSING_INDEPENDENT_RETEST"]) {
    assert.ok(result.reasons.includes(reason), reason);
  }
});

test("el validador bloquea completar una frase sin contexto visible", () => {
  const context = contextFor(scenarios[0], "es");
  const result = validatePedagogicalQuality({
    studentFeedback: { shortMessage: "Probemos de otra forma." },
    strategy: { reasonCode: "change-modality" },
    activities: [{
      activityType: "fill-blank", requiresStudentResponse: true, helpLevel: 2,
      answerExposure: "PARTIAL_HINT", instruction: "Completa.", prompt: "Completa.",
      template: "{{blank}}", hints: [], explanation: ""
    }]
  }, context);
  assert.equal(result.valid, false);
  assert.ok(result.reasons.includes("EMPTY_FILL_TEMPLATE"));
  assert.ok(result.reasons.includes("MISSING_GUIDED_SUPPORT"));
});
