export const INTERVENTION_VERSION = "NALVI-P8-INTERVENTION-1";

export const ERROR_TYPES = Object.freeze([
  "SEMANTIC_CONFUSION",
  "SPELLING_ERROR",
  "LISTENING_CONFUSION",
  "RECALL_FAILURE",
  "WORD_ORDER_ERROR",
  "MORPHOLOGY_ERROR",
  "CONJUGATION_PERSON_ERROR",
  "POSSESSIVE_ERROR",
  "NEGATION_ERROR",
  "NASALITY_ERROR",
  "CONTEXT_APPLICATION_ERROR",
  "PREREQUISITE_GAP",
  "UNKNOWN_ERROR"
]);

export const STRATEGIES = Object.freeze([
  "CHANGE_MODALITY",
  "REPHRASE",
  "DECOMPOSE",
  "SHOW_WORKED_EXAMPLE",
  "GUIDED_COMPLETION",
  "CONTRAST_CONCEPTS",
  "USE_IMAGE",
  "USE_AUDIO",
  "USE_CONTEXT",
  "REVIEW_PREREQUISITE",
  "SIMPLIFY",
  "EXPLAIN_RULE",
  "RETRIEVAL_CUE",
  "DELAYED_RETEST",
  "INCREASE_CHALLENGE"
]);

export const INTERVENTION_CONFIG = Object.freeze({
  uiLocales: ["es", "en", "pt", "fr", "it", "de"],
  fingerprintHistoryLimit: 16,
  recentActivityLimit: 12,
  repeatedErrorThreshold: 2,
  weakConceptThreshold: 2,
  evidence: {
    guidedRecoveryMultiplier: 0.35,
    independentRecoveryMultiplier: 0.8,
    delayedRetentionMultiplier: 1
  },
  strategyByError: {
    SEMANTIC_CONFUSION: ["CONTRAST_CONCEPTS", "USE_CONTEXT", "CHANGE_MODALITY"],
    SPELLING_ERROR: ["GUIDED_COMPLETION", "DECOMPOSE", "REPHRASE"],
    LISTENING_CONFUSION: ["USE_IMAGE", "USE_AUDIO", "CHANGE_MODALITY"],
    RECALL_FAILURE: ["RETRIEVAL_CUE", "SHOW_WORKED_EXAMPLE", "CHANGE_MODALITY"],
    WORD_ORDER_ERROR: ["DECOMPOSE", "GUIDED_COMPLETION", "SHOW_WORKED_EXAMPLE"],
    MORPHOLOGY_ERROR: ["EXPLAIN_RULE", "DECOMPOSE", "GUIDED_COMPLETION"],
    CONJUGATION_PERSON_ERROR: ["CONTRAST_CONCEPTS", "EXPLAIN_RULE", "GUIDED_COMPLETION"],
    POSSESSIVE_ERROR: ["CONTRAST_CONCEPTS", "SHOW_WORKED_EXAMPLE", "GUIDED_COMPLETION"],
    NEGATION_ERROR: ["EXPLAIN_RULE", "DECOMPOSE", "USE_CONTEXT"],
    NASALITY_ERROR: ["USE_AUDIO", "CONTRAST_CONCEPTS", "GUIDED_COMPLETION"],
    CONTEXT_APPLICATION_ERROR: ["USE_CONTEXT", "SHOW_WORKED_EXAMPLE", "CHANGE_MODALITY"],
    PREREQUISITE_GAP: ["REVIEW_PREREQUISITE", "SIMPLIFY", "DECOMPOSE"],
    UNKNOWN_ERROR: ["CHANGE_MODALITY", "REPHRASE", "SIMPLIFY"]
  },
  modalityTransitions: {
    "multiple-choice": ["listening", "matching", "fill-blank", "writing"],
    listening: ["matching", "fill-blank", "multiple-choice", "writing"],
    matching: ["fill-blank", "listening", "writing", "multiple-choice"],
    "order-sentence": ["fill-blank", "matching", "writing", "listening"],
    "fill-blank": ["matching", "listening", "writing", "multiple-choice"],
    writing: ["guided-fill", "matching", "listening", "multiple-choice"],
    speaking: ["listening", "guided-fill", "matching", "scenario"],
    scenario: ["guided-fill", "matching", "listening", "multiple-choice"]
  },
  skillRecoveryModalities: {
    listening: ["matching", "multiple-choice", "fill-blank", "writing"],
    reading: ["listening", "matching", "fill-blank", "multiple-choice"],
    writing: ["listening", "matching", "multiple-choice", "fill-blank"],
    speaking: ["listening", "guided-fill", "matching", "scenario"],
    vocabulary: ["listening", "matching", "fill-blank", "writing"],
    grammar: ["guided-fill", "matching", "writing", "listening"],
    application: ["scenario", "guided-fill", "matching", "listening"]
  }
});
