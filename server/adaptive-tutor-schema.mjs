import { catalogAudit, COGNITIVE_DEMAND } from "../activity-catalog/nalvi-activity-catalog.mjs";

const enabledTypes = catalogAudit().enabledTypes;
const strings = { type: "array", items: { type: "string" } };
const option = {
  type: "object", additionalProperties: false,
  required: ["id", "text", "image", "imageAlt", "authorized"],
  properties: { id: { type: "string" }, text: { type: "string" }, image: { type: "string" }, imageAlt: { type: "string" }, authorized: { type: "boolean" } }
};
const pair = {
  type: "object", additionalProperties: false,
  required: ["id", "left", "right", "authorized"],
  properties: { id: { type: "string" }, left: { type: "string" }, right: { type: "string" }, authorized: { type: "boolean" } }
};
const tile = {
  type: "object", additionalProperties: false,
  required: ["id", "text", "authorized"],
  properties: { id: { type: "string" }, text: { type: "string" }, authorized: { type: "boolean" } }
};
const category = {
  type: "object", additionalProperties: false,
  required: ["id", "label", "authorized"], properties: { id: { type: "string" }, label: { type: "string" }, authorized: { type: "boolean" } }
};
const sortItem = {
  type: "object", additionalProperties: false,
  required: ["id", "text", "categoryId", "authorized"],
  properties: { id: { type: "string" }, text: { type: "string" }, categoryId: { type: "string" }, authorized: { type: "boolean" } }
};
const segment = {
  type: "object", additionalProperties: false,
  required: ["id", "text", "isIncorrect"], properties: { id: { type: "string" }, text: { type: "string" }, isIncorrect: { type: "boolean" } }
};
const correction = {
  type: "object", additionalProperties: false,
  required: ["id", "text"], properties: { id: { type: "string" }, text: { type: "string" } }
};
const turn = {
  type: "object", additionalProperties: false,
  required: ["id", "speaker", "text", "authorized"], properties: { id: { type: "string" }, speaker: { type: "string" }, text: { type: "string" }, authorized: { type: "boolean" } }
};
const question = {
  type: "object", additionalProperties: false,
  required: ["prompt", "options", "correctOptionId", "correctAnswer"],
  properties: { prompt: { type: "string" }, options: { type: "array", items: option }, correctOptionId: { type: "string" }, correctAnswer: { type: "string" } }
};
const step = {
  type: "object", additionalProperties: false,
  required: ["activityType", "prompt", "options", "correctOptionId", "correctAnswer"],
  properties: { activityType: { type: "string", enum: enabledTypes }, prompt: { type: "string" }, options: { type: "array", items: option }, correctOptionId: { type: "string" }, correctAnswer: { type: "string" } }
};
const media = {
  type: "object", additionalProperties: false,
  required: ["type", "value", "alt", "sourceId", "authorized"],
  properties: { type: { type: "string", enum: ["none", "image", "audio"] }, value: { type: "string" }, alt: { type: "string" }, sourceId: { type: "string" }, authorized: { type: "boolean" } }
};

const activity = {
  type: "object", additionalProperties: false,
  required: ["id", "activityType", "skill", "difficulty", "helpLevel", "answerExposure", "requiresStudentResponse", "instruction", "prompt", "contextText", "contextAuthorized", "audioPath", "audioText", "audioAuthorized", "dialogueAuthorized", "options", "pairs", "tiles", "categories", "items", "segments", "corrections", "correctedSentence", "dialogue", "questions", "steps", "template", "correctOrder", "media", "hints", "explanation", "correctAnswer", "correctOptionId", "correctCorrectionId", "acceptedAnswers", "conceptIds", "lexemeIds", "grammarRuleIds", "sourceIds", "conflictIds", "hasOpenConflict", "distractorQuality", "fingerprintSeed"],
  properties: {
    id: { type: "string" }, activityType: { type: "string", enum: enabledTypes }, skill: { type: "string" }, difficulty: { type: "string" },
    helpLevel: { type: "integer", minimum: 0, maximum: 4 }, answerExposure: { type: "string", enum: ["HIDDEN", "PARTIAL_HINT", "WORKED_EXAMPLE", "EXPLICIT_SOLUTION"] }, requiresStudentResponse: { type: "boolean" },
    instruction: { type: "string" }, prompt: { type: "string" }, contextText: { type: "string" }, contextAuthorized: { type: "boolean" }, audioPath: { type: "string" }, audioText: { type: "string" }, audioAuthorized: { type: "boolean" }, dialogueAuthorized: { type: "boolean" }, options: { type: "array", items: option }, pairs: { type: "array", items: pair }, tiles: { type: "array", items: tile }, categories: { type: "array", items: category }, items: { type: "array", items: sortItem }, segments: { type: "array", items: segment }, corrections: { type: "array", items: correction }, correctedSentence: { type: "string" }, dialogue: { type: "array", items: turn }, questions: { type: "array", items: question }, steps: { type: "array", items: step }, template: { type: "string" }, correctOrder: strings,
    media, hints: strings, explanation: { type: "string" }, correctAnswer: { type: "string" }, correctOptionId: { type: "string" }, correctCorrectionId: { type: "string" }, acceptedAnswers: strings, conceptIds: strings, lexemeIds: strings, grammarRuleIds: strings, sourceIds: strings, conflictIds: strings, hasOpenConflict: { type: "boolean" }, distractorQuality: { type: "string", enum: ["PLAUSIBLE"] }, fingerprintSeed: { type: "string" }
  }
};

const candidate = {
  type: "object", additionalProperties: false,
  required: ["activityType", "pedagogicalGoal", "errorType", "helpLevel", "reasonCode", "estimatedCognitiveDemand", "requiresIndependentRetest", "activity"],
  properties: {
    activityType: { type: "string", enum: enabledTypes }, pedagogicalGoal: { type: "string" }, errorType: { type: "string" }, helpLevel: { type: "integer", minimum: 0, maximum: 4 }, reasonCode: { type: "string" }, estimatedCognitiveDemand: { type: "string", enum: Object.values(COGNITIVE_DEMAND) }, requiresIndependentRetest: { type: "boolean" }, activity
  }
};

export const ADAPTIVE_TUTOR_PLAN_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["planVersion", "planId", "conceptId", "linguisticMode", "diagnosis", "pedagogicalGoal", "strategy", "studentFeedback", "candidateActivities", "progressionPolicy", "fallbackPolicy", "validationMetadata"],
  properties: {
    planVersion: { type: "string", const: "NALVI-TUTOR-CATALOG-1" }, planId: { type: "string" }, conceptId: { type: "string" }, linguisticMode: { type: "string", enum: ["NORMATIVE_GENERATIVE", "LESSON_BOUNDED"] },
    diagnosis: { type: "object", additionalProperties: false, required: ["errorType", "likelyDifficulty", "confidence", "prerequisiteGap", "skillAffected"], properties: { errorType: { type: "string" }, likelyDifficulty: { type: "string" }, confidence: { type: "number", minimum: 0, maximum: 1 }, prerequisiteGap: { type: ["string", "null"] }, skillAffected: { type: "string" } } },
    pedagogicalGoal: { type: "string" }, strategy: { type: "object", additionalProperties: false, required: ["primaryStrategy", "secondaryStrategy", "reasonCode"], properties: { primaryStrategy: { type: "string" }, secondaryStrategy: { type: ["string", "null"] }, reasonCode: { type: "string" } } },
    studentFeedback: { type: "object", additionalProperties: false, required: ["locale", "shortMessage"], properties: { locale: { type: "string", enum: ["es", "en", "pt", "fr", "it", "de"] }, shortMessage: { type: "string" } } },
    candidateActivities: { type: "array", minItems: 1, maxItems: 3, items: candidate },
    progressionPolicy: { type: "object", additionalProperties: false, required: ["onIncorrect", "onGuidedCorrect", "requiresIndependentRetest", "maxInterventionsBeforeDefer"], properties: { onIncorrect: { type: "string", const: "BLOCK_AND_INTERVENE" }, onGuidedCorrect: { type: "string", enum: ["CONTINUE_PRACTICE", "REVIEW_LATER"] }, requiresIndependentRetest: { type: "boolean" }, maxInterventionsBeforeDefer: { type: "integer", minimum: 1, maximum: 8 } } },
    fallbackPolicy: { type: "object", additionalProperties: false, required: ["strategy", "reason"], properties: { strategy: { type: "string" }, reason: { type: "string" } } },
    validationMetadata: { type: "object", additionalProperties: false, required: ["sourceIds", "knowledgeIds", "claimedRiskLevel"], properties: { sourceIds: strings, knowledgeIds: strings, claimedRiskLevel: { type: "string", enum: ["GREEN", "YELLOW", "RED"] } } }
  }
};

export const ADAPTIVE_TUTOR_CRITIC_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["accepted", "reasonCodes", "summary", "revisionInstruction"],
  properties: { accepted: { type: "boolean" }, reasonCodes: strings, summary: { type: "string" }, revisionInstruction: { type: "string" } }
};
