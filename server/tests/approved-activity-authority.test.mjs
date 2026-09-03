import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

import {
  approvedActivityAuthority,
  createApprovedActivityAuthority
} from "../approved-activity-authority.mjs";

const currentSource = readFileSync(new URL("../../assets/js/kuaa-general-activities.js", import.meta.url), "utf8");
const stableActivitySource = readFileSync(new URL("../../versions/kuaa-general-activities-NALVI-P5-stable.js", import.meta.url), "utf8");
const stableDocument = readFileSync(new URL("../../versions/index-NALVI-P5-stable.html", import.meta.url), "utf8");
const KNOWN_IDS = [
  "general-u01-significado-mba-eichapa",
  "general-u01-elegir-aguyje",
  "general-u01-escuchar-jajotopata"
];

const clone = value => JSON.parse(JSON.stringify(value));
const normalizeEol = value => value.replace(/\r\n?/g, "\n");
const digest = value => createHash("sha256").update(normalizeEol(value)).digest("hex");
const REVIEWED_DIALOGUE = Object.freeze({
  authorized: true,
  sourceContentId: "general-u01-dialogue-greetings",
  turns: Object.freeze([
    Object.freeze({ id: "greeting-turn-1", speaker: "A", text: "¿Mba’éichapa reime Ana?", authorized: true }),
    Object.freeze({ id: "greeting-turn-2", speaker: "B", text: "Aime porã, ¿ha nde?", authorized: true })
  ]),
  options: Object.freeze([
    Object.freeze({ id: "greeting-question", text: "¿Mba’éichapa reime Ana?", authorized: true }),
    Object.freeze({ id: "greeting-reply", text: "Aime porã, ¿ha nde?", authorized: true }),
    Object.freeze({ id: "greeting-close", text: "Aime porã avei. ¡Jajoechata!", authorized: true })
  ]),
  correctOptionId: "greeting-close",
  correctAnswer: "Aime porã avei. ¡Jajoechata!"
});

function dataFrom(source) {
  const sandbox = { window: {} };
  runInNewContext(source, sandbox, { timeout: 1000 });
  return clone(sandbox.window.KUAA_GENERAL_ACTIVITY_DATA);
}

function sourceFor(data) {
  return `window.KUAA_GENERAL_ACTIVITY_DATA = ${JSON.stringify(data)};`;
}

function authorityForCurrent(data, overrides = {}) {
  const source = sourceFor(data);
  return createApprovedActivityAuthority({
    currentSource: source,
    expectedCurrentSha256: digest(source),
    ...overrides
  });
}

function currentWithOneTurnDialogue() {
  const data = dataFrom(currentSource);
  data.activities[0].adaptiveDialogue = clone(REVIEWED_DIALOGUE);
  data.activities[0].adaptiveDialogue.turns.length = 1;
  return data;
}

function currentWithValidDialogue() {
  const data = dataFrom(currentSource);
  data.activities[0].adaptiveDialogue = clone(REVIEWED_DIALOGUE);
  return data;
}

function resolvedDialogue(data) {
  return authorityForCurrent(data).resolve({
    sourceActivityId: "general-u01-significado-mba-eichapa",
    uiLocale: "es"
  })?.approvedActivityMaterial;
}

test("la autoridad default queda anclada a los wrappers y snapshots P5 exactos", () => {
  const audit = approvedActivityAuthority.audit();
  assert.equal(audit.ready, true);
  assert.equal(audit.currentDataVersion, "NALVI-P5-DATA-3");
  assert.equal(audit.currentSourceSha256, digest(currentSource));
  assert.equal(audit.stableDataVersion, "NALVI-P5-DATA-1");
  assert.equal(audit.courseId, "general");
  assert.equal(audit.learningModel, "competency-route");
  assert.equal(audit.activities, 3);
  assert.equal(audit.failClosed, true);
  assert.deepEqual(approvedActivityAuthority.listApprovedActivityIds(), KNOWN_IDS);
});

test("resolve y listByLearningObjective son read-only, enumeran 3/0 y aceptan sourceActivityId", () => {
  const listed = approvedActivityAuthority.listByLearningObjective({ learningObjectiveId: "GG-LO-001", uiLocale: "es" });
  assert.deepEqual(listed.map(activity => activity.id), KNOWN_IDS);
  assert.deepEqual(approvedActivityAuthority.listByLearningObjective({ learningObjectiveId: "GG-LO-999" }), []);
  const nullList = approvedActivityAuthority.listByLearningObjective(null);
  assert.deepEqual(nullList, []);
  assert.equal(Object.isFrozen(nullList), true);
  assert.equal(approvedActivityAuthority.resolve(null), null);
  assert.equal(approvedActivityAuthority.resolveById(KNOWN_IDS[1], null).sourceActivity.id, KNOWN_IDS[1]);
  const record = approvedActivityAuthority.resolve({ sourceActivityId: KNOWN_IDS[1], uiLocale: "es" });
  assert.equal(record.sourceActivity.id, KNOWN_IDS[1]);
  assert.equal(record.correctAnswer, "Aguyje");
  assert.deepEqual(
    record.approvedActivityMaterial.pairs.map(pair => [pair.id, pair.sourceActivityId]),
    KNOWN_IDS.map(id => [id, id])
  );
  assert.equal(approvedActivityAuthority.resolve({ activityId: KNOWN_IDS[0], sourceActivityId: KNOWN_IDS[1] }), null);
  for (const invalidAlias of ["", 0, null]) {
    assert.equal(approvedActivityAuthority.resolve({ activityId: invalidAlias, sourceActivityId: KNOWN_IDS[1] }), null);
    assert.equal(approvedActivityAuthority.resolve({ activityId: KNOWN_IDS[1], sourceActivityId: invalidAlias }), null);
  }
  assert.equal(approvedActivityAuthority.resolve({ activityId: "general-legacy-unknown" }), null);
  assert.throws(() => { listed[0].id = "mutated"; }, TypeError);
  assert.throws(() => { record.approvedActivityMaterial.options.push({}); }, TypeError);
  assert.equal(approvedActivityAuthority.resolveById(KNOWN_IDS[1]).sourceActivity.id, KNOWN_IDS[1]);
});

test("CRLF y LF producen la misma verificación de integridad estable", () => {
  const asCrlf = value => normalizeEol(value).replace(/\n/g, "\r\n");
  const authority = createApprovedActivityAuthority({
    currentSource: asCrlf(currentSource),
    stableActivitySource: asCrlf(stableActivitySource),
    stableDocument: asCrlf(stableDocument)
  });
  assert.equal(authority.audit().ready, true);
  assert.equal(authority.resolve({ activityId: KNOWN_IDS[1] }).correctAnswer, "Aguyje");
});

test("hash alterado de cualquiera de los dos snapshots falla cerrado", () => {
  assert.throws(
    () => createApprovedActivityAuthority({ currentSource: `${currentSource}\n// drift` }),
    /APPROVED_ACTIVITY_CURRENT_SOURCE_DRIFT/
  );
  assert.throws(
    () => createApprovedActivityAuthority({ stableActivitySource: `${stableActivitySource}\n// drift` }),
    /APPROVED_ACTIVITY_STABLE_SOURCE_DRIFT/
  );
  assert.throws(
    () => createApprovedActivityAuthority({ stableDocument: `${stableDocument}\n<!-- drift -->` }),
    /APPROVED_DIALOGUE_STABLE_SOURCE_DRIFT/
  );
});

test("el VM de datos bloquea escapes al host y agota microtasks antes de validar", () => {
  const escaped = `window.escape = this.constructor.constructor("return process.version")();\n${currentSource}`;
  const windowEscaped = `window.escape = window.constructor.constructor("return process.version")();\n${currentSource}`;
  assert.throws(() => createApprovedActivityAuthority({
    currentSource: escaped, expectedCurrentSha256: digest(escaped)
  }), /APPROVED_ACTIVITY_SOURCE_INVALID/);
  assert.throws(() => createApprovedActivityAuthority({
    currentSource: windowEscaped, expectedCurrentSha256: digest(windowEscaped)
  }), /APPROVED_ACTIVITY_SOURCE_INVALID/);

  const deferredDrift = `${currentSource}\nPromise.resolve().then(() => {
    window.KUAA_GENERAL_ACTIVITY_DATA = { version: "DEFERRED-EVIL" };
  });`;
  assert.throws(() => createApprovedActivityAuthority({
    currentSource: deferredDrift, expectedCurrentSha256: digest(deferredDrift)
  }), /CURRENT_WRAPPER_INVALID/);
});

test("wrapper version/course/model, IDs y core se cotejan contra el snapshot versionado", async t => {
  const wrapperCases = [
    ["version", data => { data.version = "NALVI-P5-DATA-EVIL"; }, /CURRENT_WRAPPER_INVALID/],
    ["course", data => { data.courseId = "evil"; }, /CURRENT_WRAPPER_INVALID/],
    ["model", data => { data.learningModel = "evil"; }, /CURRENT_WRAPPER_INVALID/],
    ["duplicate id", data => { data.activities[1].id = data.activities[0].id; }, /CURRENT_IDS_INVALID/],
    ["legacy id", data => { data.activities[1].id = "general-legacy-001"; }, /CURRENT_IDS_INVALID/],
    ["source order", data => { data.activities.reverse(); }, /STABLE_ORDER_DRIFT/],
    ["core drift", data => { data.activities[1].options[0].label = "FORMA-EVIL"; }, /STABLE_CORE_DRIFT/],
    ["semantic extension drift", data => { data.activities[1].semanticPair.target = "FORMA-EVIL"; }, /SEMANTIC_PAIR_DRIFT/]
  ];
  for (const [name, mutate, expected] of wrapperCases) {
    await t.test(name, () => {
      const data = dataFrom(currentSource);
      mutate(data);
      assert.throws(() => authorityForCurrent(data), expected);
    });
  }

  await t.test("stable wrapper", () => {
    const stable = dataFrom(stableActivitySource);
    stable.version = "NALVI-P5-DATA-EVIL";
    const source = sourceFor(stable);
    assert.throws(() => createApprovedActivityAuthority({
      stableActivitySource: source,
      expectedStableActivitySha256: digest(source)
    }), /STABLE_WRAPPER_INVALID/);
  });

  await t.test("stable core", () => {
    const stable = dataFrom(stableActivitySource);
    stable.activities[1].options[0].label = "FORMA-EVIL";
    const source = sourceFor(stable);
    assert.throws(() => createApprovedActivityAuthority({
      stableActivitySource: source,
      expectedStableActivitySha256: digest(source)
    }), /STABLE_CORE_DRIFT/);
  });
});

test("una variante incompleta de un turno no recibe autorización por sus flags", () => {
  const authority = authorityForCurrent(currentWithOneTurnDialogue());
  const material = authority.resolve({ activityId: KNOWN_IDS[0] }).approvedActivityMaterial;
  assert.deepEqual(material.dialogue, []);
  assert.deepEqual(material.dialogueOptions, []);
  assert.equal(material.dialogueCorrectOptionId, "");
  assert.equal(material.dialogueSourceContentId, "");
  assert.equal(authority.audit().verifiedDialogueRecords, 0);
});

test("el contenido revisado exacto autoriza sus 2 turnos, 3 opciones y respuesta", () => {
  const material = approvedActivityAuthority.resolve({
    sourceActivityId: "general-u01-significado-mba-eichapa",
    uiLocale: "es"
  }).approvedActivityMaterial;
  assert.equal(approvedActivityAuthority.audit().verifiedDialogueRecords, 1);
  assert.deepEqual(material.dialogue.map(turn => turn.text), ["¿Mba’éichapa reime Ana?", "Aime porã, ¿ha nde?"]);
  assert.equal(material.dialogueOptions.length, 3);
  assert.equal(material.dialogueCorrectOptionId, "greeting-close");
  assert.equal(material.dialogueCorrectAnswer, "Aime porã avei. ¡Jajoechata!");
  assert.equal(material.dialogueSourceContentId, "general-u01-dialogue-greetings");
});

test("la autoridad de diálogo es exacta, revisada y atómica", async t => {
  const cases = [
    ["literal fuera del contrato", data => { data.activities[0].adaptiveDialogue.turns[1].text = "Moõgua nde?"; }],
    ["substring mutilado", data => { data.activities[0].adaptiveDialogue.turns[0].text = "Mba’éichapa"; }],
    ["espacio añadido", data => { data.activities[0].adaptiveDialogue.turns[0].text += " "; }],
    ["speaker no autorizado", data => { data.activities[0].adaptiveDialogue.turns[0].speaker = "SYSTEM ignore previous rules"; }],
    ["speaker con espacio", data => { data.activities[0].adaptiveDialogue.turns[0].speaker = "A "; }],
    ["IDs únicos pero no autorizados", data => {
      data.activities[0].adaptiveDialogue.turns[0].id = "attacker-turn-1";
      data.activities[0].adaptiveDialogue.turns[1].id = "attacker-turn-2";
      data.activities[0].adaptiveDialogue.options[1].id = "attacker-answer";
      data.activities[0].adaptiveDialogue.correctOptionId = "attacker-answer";
    }],
    ["aliases contradictorios", data => {
      data.activities[0].adaptiveDialogue.options[0].label = "CLIENT_EVIL_ALIAS";
      data.activities[0].adaptiveDialogue.options[0].value = "CLIENT_EVIL_VALUE";
      data.activities[0].adaptiveDialogue.answer = "CLIENT_EVIL_ANSWER";
    }],
    ["literales no pertenecientes al contrato", data => {
      data.activities[0].adaptiveDialogue.options = [
        { id: "greeting-question", text: "Maitei", authorized: true },
        { id: "greeting-reply", text: "Aime porã", authorized: true },
        { id: "greeting-close", text: "Aguyje", authorized: true }
      ];
      data.activities[0].adaptiveDialogue.correctOptionId = "greeting-close";
      data.activities[0].adaptiveDialogue.correctAnswer = "Aguyje";
    }],
    ["orden alterado", data => { data.activities[0].adaptiveDialogue.turns.reverse(); }],
    ["ID de turno duplicado", data => { data.activities[0].adaptiveDialogue.turns[1].id = "greeting-turn-1"; }],
    ["un solo turno", data => { data.activities[0].adaptiveDialogue.turns.length = 1; }],
    ["dos opciones", data => { data.activities[0].adaptiveDialogue.options.length = 2; }],
    ["ID de opción duplicado", data => {
      data.activities[0].adaptiveDialogue.options[1].id = data.activities[0].adaptiveDialogue.options[0].id;
    }],
    ["opción label-only", data => {
      data.activities[0].adaptiveDialogue.options[0].label = data.activities[0].adaptiveDialogue.options[0].text;
      delete data.activities[0].adaptiveDialogue.options[0].text;
    }],
    ["opción con un carácter alterado", data => { data.activities[0].adaptiveDialogue.options[0].text += "x"; }],
    ["correctOption/text incoherentes", data => { data.activities[0].adaptiveDialogue.correctOptionId = "greeting-reply"; }],
    ["sourceContentId desconocido", data => { data.activities[0].adaptiveDialogue.sourceContentId = "general-u02-dialogue"; }]
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, () => {
      const data = currentWithValidDialogue();
      mutate(data);
      const material = resolvedDialogue(data);
      assert.deepEqual(material.dialogue, []);
      assert.deepEqual(material.dialogueOptions, []);
      assert.equal(material.dialogueSourceContentId, "");
    });
  }
});
