import test from "node:test";
import assert from "node:assert/strict";
import {
  createTeacherTaskOrganizer,
  TEACHER_TASK_TEMPLATE_SCHEMA,
  validateTeacherTaskTemplate
} from "../teacher-task-organizer.mjs";

const USER = "teacher-verified-1";
const organizer = createTeacherTaskOrganizer();

const material = (overrides = {}) => ({
  title: "Ñe’ẽporandu mbo’esyry rehegua",
  questions: [
    {
      order: 1,
      question: "¿Mba’éichapa reime?",
      answer: "Aime porã, aguyje.",
      options: ["Aime porã, aguyje.", "Che réra Ana.", "Jajoechata."]
    },
    {
      order: 2,
      question: "Ehai: ¿Moõgua nde?\nEmbohovái ndejehegui.",
      answer: "Che ha’e Paraguaygua."
    }
  ],
  ...overrides
});

test("conserva literalmente preguntas, respuestas, opciones y Unicode del docente", async () => {
  const source = material();
  const result = await organizer.organizeDraft(source, { verifiedUserId: USER });

  assert.equal(result.ok, true);
  assert.equal(result.persistence, "not_performed");
  assert.equal(result.template.schemaVersion, TEACHER_TASK_TEMPLATE_SCHEMA);
  assert.equal(result.template.title, source.title);
  assert.deepEqual(result.template.cards.map(card => ({
    order: card.order,
    question: card.question,
    answer: card.answer,
    options: card.options
  })), source.questions.map(question => ({
    order: question.order,
    question: question.question,
    answer: question.answer,
    options: question.options ?? null
  })));
  assert.deepEqual(result.template.cards.map(card => card.activityType), ["CONTEXT_CHOICE", "INDEPENDENT_RECALL"]);
  assert.equal(result.template.canPublish, false);
  assert.equal(result.template.canAssign, false);
  assert.equal(result.template.masteryEligible, false);
});

test("usa exclusivamente el orden explícito y conserva el orden de las opciones", async () => {
  const source = material({
    questions: [
      { order: 2, question: "Mokõi", answer: "B", options: ["C", "B", "A"] },
      { order: 1, question: "Peteĩ", answer: "A", options: ["A", "C", "B"] }
    ]
  });
  const result = await organizer.organizeDraft(source, { verifiedUserId: USER });

  assert.deepEqual(result.template.cards.map(card => card.question), ["Peteĩ", "Mokõi"]);
  assert.deepEqual(result.template.cards[0].options, ["A", "C", "B"]);
  assert.deepEqual(result.template.cards[1].options, ["C", "B", "A"]);
});

test("no inventa una opción cuando la respuesta no está entre las provistas", async () => {
  const source = material({
    questions: [{ order: 1, question: "Eiporavo", answer: "Mbohovái añeteguáva", options: ["Peteĩ", "Mokõi"] }]
  });
  const result = await organizer.organizeDraft(source, { verifiedUserId: USER });

  assert.equal(result.ok, true);
  assert.equal(result.template.status, "needs_manual_review");
  assert.equal(result.template.cards[0].activityType, null);
  assert.deepEqual(result.template.cards[0].options, source.questions[0].options);
  assert.equal(result.template.cards[0].options.includes(source.questions[0].answer), false);
  assert.deepEqual(result.template.review.items, [{ order: 1, reasons: ["ANSWER_NOT_IN_OPTIONS"] }]);
});

test("opciones insuficientes o duplicadas quedan para revisión sin completar contenido", async () => {
  const result = await organizer.organizeDraft(material({
    questions: [
      { order: 1, question: "Peteĩ", answer: "A", options: ["A"] },
      { order: 2, question: "Mokõi", answer: "B", options: ["B", "B"] }
    ]
  }), { verifiedUserId: USER });

  assert.equal(result.template.status, "needs_manual_review");
  assert.deepEqual(result.template.cards[0].options, ["A"]);
  assert.deepEqual(result.template.cards[1].options, ["B", "B"]);
  assert.deepEqual(result.template.review.items, [
    { order: 1, reasons: ["AT_LEAST_TWO_OPTIONS_REQUIRED"] },
    { order: 2, reasons: ["DUPLICATE_OPTIONS"] }
  ]);
});

test("el modelo mantiene identidad reusable, revisión y versiones consecutivas", async () => {
  const first = await organizer.organizeDraft(material(), { verifiedUserId: USER });
  const second = await organizer.organizeDraft(material({
    templateId: first.template.templateId,
    previousVersion: first.template.version
  }), { verifiedUserId: USER });

  assert.equal(first.template.version, 1);
  assert.equal(second.template.version, 2);
  assert.equal(second.template.previousVersion, 1);
  assert.equal(second.template.templateId, first.template.templateId);
  assert.equal(second.template.reusable, true);
  assert.equal(second.template.review.required, true);
  assert.deepEqual(validateTeacherTaskTemplate(second.template, { expectedOwnerUserId: USER }), { ok: true });
});

test("el validador detecta modificación posterior de cualquier contenido", async () => {
  const result = await organizer.organizeDraft(material(), { verifiedUserId: USER });
  const tampered = structuredClone(result.template);
  tampered.cards[0].question = "Pregunta cambiada";

  assert.deepEqual(validateTeacherTaskTemplate(tampered, { expectedOwnerUserId: USER }), {
    ok: false,
    reason: "TEMPLATE_INTEGRITY_MISMATCH"
  });
  assert.deepEqual(validateTeacherTaskTemplate(result.template, { expectedOwnerUserId: "other-teacher" }), {
    ok: false,
    reason: "OWNER_MISMATCH"
  });
});

test("rechaza entradas malformadas, campos adicionales y órdenes ambiguos", async () => {
  const arrayWithHiddenClaim = [{ order: 1, question: "Q", answer: "A" }];
  Object.defineProperty(arrayWithHiddenClaim, "publish", { value: true });
  const invalid = [
    null,
    { title: "T", questions: [], inventedInstruction: "Agregá algo" },
    material({ questions: [{ order: 1, question: "Q", answer: "A", hint: "invented" }] }),
    material({ questions: [{ order: 1, question: "Q1", answer: "A1" }, { order: 1, question: "Q2", answer: "A2" }] }),
    material({ questions: [{ order: 2, question: "Q", answer: "A" }] }),
    material({ questions: [{ order: 1, question: "   ", answer: "A" }] }),
    material({ questions: [{ order: 1, question: "Q", answer: "A", options: {} }] }),
    material({ questions: arrayWithHiddenClaim })
  ];
  for (const input of invalid) {
    const result = await organizer.organizeDraft(input, { verifiedUserId: USER });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "INVALID_TASK_MATERIAL");
  }
});

test("rechaza límites excesivos sin truncar ni perder preguntas", async () => {
  const tooMany = Array.from({ length: 51 }, (_, index) => ({
    order: index + 1,
    question: `Pregunta ${index + 1}`,
    answer: `Respuesta ${index + 1}`
  }));
  const result = await organizer.organizeDraft(material({ questions: tooMany }), { verifiedUserId: USER });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "TASK_LIMIT_EXCEEDED");

  const tooLong = await organizer.organizeDraft(material({
    questions: [{ order: 1, question: "a".repeat(4_001), answer: "A" }]
  }), { verifiedUserId: USER });
  assert.equal(tooLong.ok, false);
  assert.equal(tooLong.reason, "INVALID_TASK_MATERIAL");
});

test("requiere identidad autenticada no anónima", async () => {
  assert.deepEqual(await organizer.organizeDraft(material(), {}), { ok: false, reason: "AUTH_REQUIRED" });
  assert.deepEqual(await organizer.organizeDraft(material(), { verifiedUserId: USER, isAnonymous: true }), {
    ok: false,
    reason: "ANONYMOUS_NOT_ALLOWED"
  });
});

test("auditoría declara ausencia de IA, persistencia, publicación y asignación automáticas", () => {
  assert.deepEqual(organizer.audit(), {
    deterministicOnly: true,
    aiUsed: false,
    exactTeacherTextPreserved: true,
    automaticPersistence: false,
    automaticPublishing: false,
    automaticAssignment: false,
    teacherReviewRequired: true,
    maximumQuestions: 50,
    maximumOptionsPerQuestion: 8,
    schemaVersion: TEACHER_TASK_TEMPLATE_SCHEMA
  });
});
