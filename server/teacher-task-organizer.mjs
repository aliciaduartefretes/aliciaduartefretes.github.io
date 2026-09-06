import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

export const TEACHER_TASK_TEMPLATE_SCHEMA = "NALVI-TEACHER-TASK-TEMPLATE-1";

const MAX_QUESTIONS = 50;
const MAX_OPTIONS = 8;
const MAX_TITLE_BYTES = 240;
const MAX_QUESTION_BYTES = 4_000;
const MAX_ANSWER_BYTES = 2_000;
const MAX_OPTION_BYTES = 2_000;
const MAX_PREVIOUS_VERSION = 9_999;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const UNSAFE_CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const TOP_LEVEL_FIELDS = new Set(["title", "questions", "templateId", "previousVersion"]);
const QUESTION_FIELDS = new Set(["order", "question", "answer", "options"]);

function dataRecord(value, allowedFields) {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const output = Object.create(null);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || !allowedFields.has(key)) return null;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set) return null;
      output[key] = descriptor.value;
    }
    return output;
  } catch {
    return null;
  }
}

function dataArray(value, maximum) {
  try {
    if (!Array.isArray(value) || value.length > maximum) return null;
    if (Object.getPrototypeOf(value) !== Array.prototype) return null;
    for (const key of Reflect.ownKeys(value)) {
      if (key === "length") continue;
      if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key)) return null;
      const numericKey = Number(key);
      if (!Number.isSafeInteger(numericKey) || numericKey < 0 || numericKey >= value.length) return null;
    }
    const output = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set) return null;
      output.push(descriptor.value);
    }
    return output;
  } catch {
    return null;
  }
}

function exactVisibleText(value, maximumBytes) {
  if (typeof value !== "string" || value.trim().length === 0) return "";
  if (UNSAFE_CONTROL_CHARACTERS.test(value) || Buffer.byteLength(value, "utf8") > maximumBytes) return "";
  return value;
}

function issue(path, code) {
  return { path, code };
}

function validateInput(raw) {
  const input = dataRecord(raw, TOP_LEVEL_FIELDS);
  if (!input) return { ok: false, reason: "INVALID_TASK_MATERIAL", issues: [issue("$", "INVALID_OBJECT_SHAPE")] };

  const title = exactVisibleText(input.title, MAX_TITLE_BYTES);
  if (!title) return { ok: false, reason: "INVALID_TASK_MATERIAL", issues: [issue("title", "INVALID_TEXT")] };

  const templateId = input.templateId === undefined ? "" : exactVisibleText(input.templateId, 128);
  if (input.templateId !== undefined && (!templateId || !SAFE_ID.test(templateId))) {
    return { ok: false, reason: "INVALID_TASK_MATERIAL", issues: [issue("templateId", "INVALID_ID")] };
  }
  const previousVersion = input.previousVersion === undefined ? 0 : input.previousVersion;
  if (!Number.isSafeInteger(previousVersion) || previousVersion < 0 || previousVersion > MAX_PREVIOUS_VERSION) {
    return { ok: false, reason: "INVALID_TASK_MATERIAL", issues: [issue("previousVersion", "INVALID_VERSION")] };
  }

  const rawQuestions = dataArray(input.questions, MAX_QUESTIONS);
  if (!rawQuestions || rawQuestions.length === 0) {
    const code = Array.isArray(input.questions) && input.questions.length > MAX_QUESTIONS
      ? "QUESTION_LIMIT_EXCEEDED"
      : "QUESTIONS_REQUIRED";
    return { ok: false, reason: code === "QUESTION_LIMIT_EXCEEDED" ? "TASK_LIMIT_EXCEEDED" : "INVALID_TASK_MATERIAL", issues: [issue("questions", code)] };
  }

  const questions = [];
  const issues = [];
  for (let index = 0; index < rawQuestions.length; index += 1) {
    const path = `questions[${index}]`;
    const candidate = dataRecord(rawQuestions[index], QUESTION_FIELDS);
    if (!candidate) {
      issues.push(issue(path, "INVALID_OBJECT_SHAPE"));
      continue;
    }
    const order = candidate.order;
    const question = exactVisibleText(candidate.question, MAX_QUESTION_BYTES);
    const answer = exactVisibleText(candidate.answer, MAX_ANSWER_BYTES);
    if (!Number.isSafeInteger(order) || order < 1 || order > rawQuestions.length) issues.push(issue(`${path}.order`, "INVALID_ORDER"));
    if (!question) issues.push(issue(`${path}.question`, "INVALID_TEXT"));
    if (!answer) issues.push(issue(`${path}.answer`, "INVALID_TEXT"));

    let options = null;
    if (candidate.options !== undefined) {
      const rawOptions = dataArray(candidate.options, MAX_OPTIONS);
      if (!rawOptions) {
        issues.push(issue(`${path}.options`, Array.isArray(candidate.options) && candidate.options.length > MAX_OPTIONS ? "OPTION_LIMIT_EXCEEDED" : "INVALID_OPTIONS"));
      } else {
        options = [];
        for (let optionIndex = 0; optionIndex < rawOptions.length; optionIndex += 1) {
          const option = exactVisibleText(rawOptions[optionIndex], MAX_OPTION_BYTES);
          if (!option) issues.push(issue(`${path}.options[${optionIndex}]`, "INVALID_TEXT"));
          options.push(option);
        }
      }
    }
    questions.push({ order, question, answer, options });
  }
  if (issues.length > 0) return { ok: false, reason: "INVALID_TASK_MATERIAL", issues };

  const orders = questions.map(entry => entry.order);
  if (new Set(orders).size !== questions.length || !orders.every(order => order >= 1 && order <= questions.length)) {
    return { ok: false, reason: "INVALID_TASK_MATERIAL", issues: [issue("questions", "ORDERS_MUST_BE_UNIQUE_AND_CONTIGUOUS")] };
  }
  questions.sort((left, right) => left.order - right.order);
  return { ok: true, material: { title, templateId, previousVersion, questions } };
}

function materialFingerprint(ownerUserId, title, questions) {
  const canonical = JSON.stringify({
    ownerUserId,
    title,
    questions: questions.map(({ order, question, answer, options }) => ({ order, question, answer, options }))
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function reviewForQuestion(entry) {
  if (entry.options === null) return [];
  const reasons = [];
  if (entry.options.length < 2) reasons.push("AT_LEAST_TWO_OPTIONS_REQUIRED");
  if (new Set(entry.options).size !== entry.options.length) reasons.push("DUPLICATE_OPTIONS");
  if (!entry.options.includes(entry.answer)) reasons.push("ANSWER_NOT_IN_OPTIONS");
  return reasons;
}

function buildTemplate(material, ownerUserId) {
  const fingerprint = materialFingerprint(ownerUserId, material.title, material.questions);
  const templateId = material.templateId || `teacher-task-${fingerprint.slice(0, 24)}`;
  const version = material.previousVersion + 1;
  const reviewItems = [];
  const cards = material.questions.map(entry => {
    const reasons = reviewForQuestion(entry);
    if (reasons.length > 0) reviewItems.push({ order: entry.order, reasons });
    return {
      cardId: `${templateId}:v${version}:${entry.order}`,
      order: entry.order,
      activityType: entry.options === null
        ? "INDEPENDENT_RECALL"
        : reasons.length === 0
          ? "CONTEXT_CHOICE"
          : null,
      question: entry.question,
      answer: entry.answer,
      options: entry.options === null ? null : [...entry.options],
      contentSource: "teacher-provided"
    };
  });
  return {
    schemaVersion: TEACHER_TASK_TEMPLATE_SCHEMA,
    templateId,
    version,
    previousVersion: material.previousVersion,
    ownerUserId,
    title: material.title,
    status: reviewItems.length > 0 ? "needs_manual_review" : "draft",
    reusable: true,
    canPublish: false,
    canAssign: false,
    masteryEligible: false,
    contentPolicy: "exact-teacher-content-only",
    sourceFingerprint: fingerprint,
    review: {
      required: true,
      items: reviewItems
    },
    cards
  };
}

function organize(raw, context) {
  const ownerUserId = typeof context?.verifiedUserId === "string" && SAFE_ID.test(context.verifiedUserId)
    ? context.verifiedUserId
    : "";
  if (!ownerUserId) return { ok: false, reason: "AUTH_REQUIRED" };
  if (context?.isAnonymous === true) return { ok: false, reason: "ANONYMOUS_NOT_ALLOWED" };
  const validated = validateInput(raw);
  if (!validated.ok) return validated;
  return {
    ok: true,
    reason: "TEACHER_TASK_DRAFT_ORGANIZED",
    template: buildTemplate(validated.material, ownerUserId),
    persistence: "not_performed"
  };
}

export function validateTeacherTaskTemplate(template, { expectedOwnerUserId = "" } = {}) {
  try {
    if (!template || typeof template !== "object" || !Array.isArray(template.cards)) return { ok: false, reason: "INVALID_TEMPLATE" };
    const ownerUserId = expectedOwnerUserId || template.ownerUserId;
    if (!ownerUserId || template.ownerUserId !== ownerUserId) return { ok: false, reason: "OWNER_MISMATCH" };
    const source = {
      title: template.title,
      templateId: template.templateId,
      previousVersion: template.previousVersion,
      questions: template.cards.map(card => ({
        order: card.order,
        question: card.question,
        answer: card.answer,
        ...(card.options === null ? {} : { options: card.options })
      }))
    };
    const rebuilt = organize(source, { verifiedUserId: ownerUserId, isAnonymous: false });
    if (!rebuilt.ok || !isDeepStrictEqual(rebuilt.template, template)) return { ok: false, reason: "TEMPLATE_INTEGRITY_MISMATCH" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "INVALID_TEMPLATE" };
  }
}

export function createTeacherTaskOrganizer() {
  return {
    organizeDraft: async (raw, context) => organize(raw, context),
    validateTemplate: validateTeacherTaskTemplate,
    audit: () => ({
      deterministicOnly: true,
      aiUsed: false,
      exactTeacherTextPreserved: true,
      automaticPersistence: false,
      automaticPublishing: false,
      automaticAssignment: false,
      teacherReviewRequired: true,
      maximumQuestions: MAX_QUESTIONS,
      maximumOptionsPerQuestion: MAX_OPTIONS,
      schemaVersion: TEACHER_TASK_TEMPLATE_SCHEMA
    })
  };
}

export const __test = {
  validateInput,
  materialFingerprint,
  reviewForQuestion
};
