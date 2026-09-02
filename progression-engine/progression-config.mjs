export const PROGRESSION_CONFIG = Object.freeze({
  version: "NALVI-PRE8C-PROGRESSION-CONFIG-2",
  decisions: [
    "BLOCK_AND_INTERVENE",
    "CONTINUE_PRACTICE",
    "COMPLETE_OBJECTIVE",
    "REVIEW_LATER",
    "EXIT_WITHOUT_COMPLETION"
  ],
  completion: {
    requiredMasteryStatus: "MASTERED",
    allowImmediatePracticeCheckpoint: true,
    minimumIndependentCorrectEvents: 1,
    minimumDistinctActivityTypes: 1,
    pendingRetestMustBeResolved: true,
    guidedRecoveryCanCompleteObjective: false,
    leavingCanCompleteObjective: false,
    incorrectCanCompleteObjective: false
  },
  evidence: {
    guidedRecoveryHintUsed: true,
    independentRecoveryHintUsed: false
  },
  diagnosticEvents: [
    "ANSWER_EVALUATED",
    "PROGRESSION_BLOCKED",
    "INTERVENTION_REQUESTED",
    "INTERVENTION_RENDERED",
    "OBJECTIVE_COMPLETED",
    "NEXT_OBJECTIVE_UNLOCKED"
  ]
});

export default PROGRESSION_CONFIG;
