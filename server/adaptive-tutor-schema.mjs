const stringArray = { type: "array", items: { type: "string" }, maxItems: 24 };
const nullableString = { type: ["string", "null"] };

export const ADAPTIVE_TUTOR_PLAN_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["planVersion", "planId", "conceptId", "linguisticMode", "diagnosis", "pedagogicalGoal", "strategy", "studentFeedback", "activities", "progressionPolicy", "fallbackPolicy", "validationMetadata"],
  properties: {
    planVersion: { type: "string", const: "NALVI-TUTOR-1" },
    planId: { type: "string", minLength: 4, maxLength: 96 },
    conceptId: { type: "string", minLength: 1, maxLength: 96 },
    linguisticMode: { type: "string", enum: ["NORMATIVE_GENERATIVE", "LESSON_BOUNDED", "BLOCKED"] },
    diagnosis: {
      type: "object", additionalProperties: false,
      required: ["errorType", "likelyDifficulty", "confidence", "prerequisiteGap", "skillAffected"],
      properties: {
        errorType: { type: "string" }, likelyDifficulty: { type: "string", maxLength: 160 },
        confidence: { type: "number", minimum: 0, maximum: 1 }, prerequisiteGap: nullableString,
        skillAffected: { type: "string", maxLength: 48 }
      }
    },
    pedagogicalGoal: { type: "string", minLength: 1, maxLength: 220 },
    strategy: {
      type: "object", additionalProperties: false,
      required: ["primaryStrategy", "secondaryStrategy", "reasonCode"],
      properties: { primaryStrategy: { type: "string" }, secondaryStrategy: nullableString, reasonCode: { type: "string", minLength: 1, maxLength: 120 } }
    },
    studentFeedback: {
      type: "object", additionalProperties: false, required: ["locale", "shortMessage"],
      properties: { locale: { type: "string", enum: ["es", "en", "pt", "fr", "it", "de"] }, shortMessage: { type: "string", minLength: 1, maxLength: 220 } }
    },
    activities: {
      type: "array", minItems: 1, maxItems: 4,
      items: {
        type: "object", additionalProperties: false,
        required: ["id", "activityType", "skill", "difficulty", "helpLevel", "answerExposure", "requiresStudentResponse", "instruction", "prompt", "options", "pairs", "tokens", "media", "hints", "explanation", "correctAnswer", "conceptIds", "lexemeIds", "grammarRuleIds", "sourceIds", "fingerprintSeed"],
        properties: {
          id: { type: "string", minLength: 1, maxLength: 96 },
          activityType: { type: "string", enum: ["multiple-choice", "listening", "order-sentence", "fill-blank", "writing", "matching"] },
          skill: { type: "string", maxLength: 48 }, difficulty: { type: "string", maxLength: 48 },
          helpLevel: { type: "integer", minimum: 0, maximum: 4 },
          answerExposure: { type: "string", enum: ["HIDDEN", "PARTIAL_HINT", "WORKED_EXAMPLE", "EXPLICIT_SOLUTION"] },
          requiresStudentResponse: { type: "boolean" }, instruction: { type: "string", maxLength: 260 }, prompt: { type: "string", maxLength: 320 },
          options: { type: "array", maxItems: 8, items: { type: "object", additionalProperties: false, required: ["id", "text"], properties: { id: { type: "string" }, text: { type: "string" } } } },
          pairs: { type: "array", maxItems: 8, items: { type: "object", additionalProperties: false, required: ["id", "left", "right"], properties: { id: { type: "string" }, left: { type: "string" }, right: { type: "string" } } } },
          tokens: { type: "array", maxItems: 16, items: { type: "object", additionalProperties: false, required: ["id", "text"], properties: { id: { type: "string" }, text: { type: "string" } } } },
          media: { type: "object", additionalProperties: false, required: ["type", "value", "alt", "sourceId"], properties: { type: { type: "string", enum: ["none", "audio", "image"] }, value: { type: "string" }, alt: { type: "string" }, sourceId: { type: "string" } } },
          hints: stringArray, explanation: { type: "string", maxLength: 360 }, correctAnswer: { type: "string", maxLength: 240 },
          conceptIds: stringArray, lexemeIds: stringArray, grammarRuleIds: stringArray, sourceIds: stringArray,
          fingerprintSeed: { type: "string", minLength: 1, maxLength: 180 }
        }
      }
    },
    progressionPolicy: {
      type: "object", additionalProperties: false, required: ["onIncorrect", "onGuidedCorrect", "requiresIndependentRetest", "maxInterventionsBeforeDefer"],
      properties: { onIncorrect: { type: "string" }, onGuidedCorrect: { type: "string" }, requiresIndependentRetest: { type: "boolean" }, maxInterventionsBeforeDefer: { type: "integer", minimum: 1, maximum: 6 } }
    },
    fallbackPolicy: { type: "object", additionalProperties: false, required: ["strategy", "reason"], properties: { strategy: { type: "string" }, reason: { type: "string" } } },
    validationMetadata: { type: "object", additionalProperties: false, required: ["sourceIds", "knowledgeIds", "claimedRiskLevel"], properties: { sourceIds: stringArray, knowledgeIds: stringArray, claimedRiskLevel: { type: "string", enum: ["GREEN", "YELLOW", "RED"] } } }
  }
});

export const ADAPTIVE_TUTOR_CRITIC_SCHEMA = Object.freeze({
  type: "object", additionalProperties: false, required: ["accepted", "reasonCodes", "summary", "revisionInstruction"],
  properties: {
    accepted: { type: "boolean" },
    reasonCodes: { type: "array", maxItems: 12, items: { type: "string" } },
    summary: { type: "string", maxLength: 320 }, revisionInstruction: { type: "string", maxLength: 520 }
  }
});
