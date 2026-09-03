import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { approvedActivityAuthority } from "../approved-activity-authority.mjs";
import { toRenderable } from "../adaptive-tutor-orchestrator.mjs";
import {
  normalizeInterventionRequest,
  sanitizeApprovedActivityMaterial,
  trustedRecordedAudio
} from "../intervention-service.mjs";
import {
  authorizeRecordedAudioForTarget,
  canonicalRecordedAudioPath,
  resolveRecordedAudioPlayback
} from "../recorded-audio-authority.mjs";

const manifest = JSON.parse(readFileSync(
  new URL("../../assets/audio/guarani/ali-2026/manifest.json", import.meta.url),
  "utf8"
));

const recordingFor = label => {
  const recording = manifest.recordings.find(item => item.label === label);
  assert.ok(recording, `Falta fixture de audio para ${label}`);
  return recording;
};

const claimFor = recording => ({
  audioId: recording.id,
  audioPath: canonicalRecordedAudioPath(recording.file),
  audioText: recording.label,
  audioAuthorized: true,
  humanRecorded: true,
  audioSource: "manifest-human-recording"
});

const richClaimFor = recording => {
  const canonical = claimFor(recording);
  return {
    id: canonical.audioId,
    audioId: canonical.audioId,
    recordingId: canonical.audioId,
    path: canonical.audioPath,
    audioPath: canonical.audioPath,
    text: canonical.audioText,
    audioText: canonical.audioText,
    source: canonical.audioSource,
    audioSource: canonical.audioSource,
    authorized: true,
    audioAuthorized: true,
    humanRecorded: true
  };
};

const AGUYJE = Object.freeze(claimFor(recordingFor("Aguyje")));
const ITATI = Object.freeze(claimFor(recordingFor("Itati")));
const PARENTHETICAL_RECORDING = manifest.recordings.find(item => item.label.includes("("));
const PARENTHETICAL = Object.freeze(claimFor(PARENTHETICAL_RECORDING));
const PARENTHETICAL_BASE = PARENTHETICAL.audioText.split("(")[0].trim();

const REAL_ACTIVITY_ID = "general-u01-elegir-aguyje";
const REAL_APPROVAL = approvedActivityAuthority.resolve({ activityId: REAL_ACTIVITY_ID, uiLocale: "es" });
assert.ok(REAL_APPROVAL, `La autoridad no resolvio ${REAL_ACTIVITY_ID}`);

function realAguyjeRequest({ activityAudio, approvedAudio, authorizedAudio, activityOverrides = {} } = {}) {
  const sourceActivity = REAL_APPROVAL.sourceActivity;
  const activity = {
    ...sourceActivity,
    ...activityOverrides
  };
  if (activityAudio && typeof activityAudio === "object") Object.assign(activity, activityAudio);

  const request = {
    correct: false,
    conceptId: sourceActivity.conceptId,
    learningObjectiveId: sourceActivity.learningObjectiveId,
    currentSkill: sourceActivity.skill,
    activityType: sourceActivity.activityType,
    difficulty: sourceActivity.difficulty,
    studentAnswer: "Maitei",
    correctAnswer: REAL_APPROVAL.correctAnswer,
    attemptNumber: 1,
    uiLocale: "es",
    lexemeIds: [...sourceActivity.lexemeIds],
    grammarRuleIds: [...sourceActivity.grammarRuleIds],
    knowledgeIds: [...REAL_APPROVAL.knowledgeIds],
    activity
  };
  if (approvedAudio !== undefined) request.approvedActivityMaterial = { audio: approvedAudio };
  if (authorizedAudio !== undefined) request.authorizedAudio = authorizedAudio;
  return request;
}

function audioSelectActivity(overrides = {}) {
  return {
    id: "audio-select-aguyje-consensus",
    type: "AUDIO_SELECT",
    activityType: "AUDIO_SELECT",
    conceptId: REAL_APPROVAL.sourceActivity.conceptId,
    conceptIds: [REAL_APPROVAL.sourceActivity.conceptId],
    learningObjectiveId: REAL_APPROVAL.sourceActivity.learningObjectiveId,
    skill: "listening",
    difficulty: "foundation-1",
    helpLevel: 0,
    answerExposure: "HIDDEN",
    requiresStudentResponse: true,
    options: REAL_APPROVAL.approvedActivityMaterial.options.map(option => ({ ...option })),
    correctOptionId: REAL_APPROVAL.approvedActivityMaterial.correctOptionId,
    correctAnswer: REAL_APPROVAL.correctAnswer,
    acceptedAnswers: [...REAL_APPROVAL.approvedActivityMaterial.acceptedAnswers],
    ...AGUYJE,
    ...overrides
  };
}

test("la autoridad directa rechaza contradicciones entre audioId, id y recordingId", () => {
  const allAliasesAgree = resolveRecordedAudioPlayback({
    ...AGUYJE,
    id: AGUYJE.audioId,
    recordingId: AGUYJE.audioId
  });
  assert.equal(allAliasesAgree?.audioId, AGUYJE.audioId);

  const contradictions = [
    { ...AGUYJE, id: ITATI.audioId },
    { ...AGUYJE, recordingId: ITATI.audioId },
    {
      id: AGUYJE.audioId,
      recordingId: ITATI.audioId,
      audioPath: AGUYJE.audioPath,
      audioText: AGUYJE.audioText
    }
  ];
  for (const claim of contradictions) assert.equal(resolveRecordedAudioPlayback(claim), null);
});

test("la autoridad directa exige consenso entre audioPath y path", () => {
  assert.equal(resolveRecordedAudioPlayback({
    ...AGUYJE,
    path: AGUYJE.audioPath
  })?.audioId, AGUYJE.audioId);
  assert.equal(resolveRecordedAudioPlayback({
    ...AGUYJE,
    path: ITATI.audioPath
  }), null);
});

test("texto completo y base parentetica son aliases legitimos del mismo audio", () => {
  assert.ok(PARENTHETICAL_RECORDING);
  const claim = {
    ...PARENTHETICAL,
    id: PARENTHETICAL.audioId,
    path: PARENTHETICAL.audioPath,
    text: PARENTHETICAL_BASE
  };
  assert.equal(
    authorizeRecordedAudioForTarget(claim, PARENTHETICAL_BASE)?.audioId,
    PARENTHETICAL.audioId
  );
  assert.equal(
    authorizeRecordedAudioForTarget(claim, PARENTHETICAL.audioText)?.audioId,
    PARENTHETICAL.audioId
  );
  assert.equal(authorizeRecordedAudioForTarget({ ...claim, text: "Aguyje" }, PARENTHETICAL_BASE), null);
});

test("la frontera rechaza contradicciones top contra authorizedAudio y audio", () => {
  const flatContradictions = [
    { ...AGUYJE, id: ITATI.audioId },
    { ...AGUYJE, recordingId: ITATI.audioId },
    { ...AGUYJE, path: ITATI.audioPath },
    { ...AGUYJE, text: ITATI.audioText }
  ];
  for (const claim of flatContradictions) {
    assert.equal(sanitizeApprovedActivityMaterial(claim, "Aguyje").audio, null);
  }

  for (const nestedKey of ["authorizedAudio", "audio"]) {
    const contradictory = sanitizeApprovedActivityMaterial({
      ...AGUYJE,
      [nestedKey]: ITATI
    }, "Aguyje");
    assert.equal(contradictory.audio, null, nestedKey);

    const agreeing = sanitizeApprovedActivityMaterial({ [nestedKey]: AGUYJE }, "Aguyje");
    assert.equal(agreeing.audio?.audioId, AGUYJE.audioId, nestedKey);
  }

  assert.equal(sanitizeApprovedActivityMaterial({
    authorizedAudio: AGUYJE,
    audio: ITATI
  }, "Aguyje").audio, null);
});

test("approvedActivityMaterial.audio y authorizedAudio deben alcanzar consenso", () => {
  const rejected = normalizeInterventionRequest(realAguyjeRequest({
    approvedAudio: AGUYJE,
    authorizedAudio: ITATI
  }));
  assert.equal(rejected.approvedActivityMaterial.audio, null);
  assert.equal(rejected.authorizedAudio, null);

  const accepted = normalizeInterventionRequest(realAguyjeRequest({
    approvedAudio: AGUYJE,
    authorizedAudio: AGUYJE
  }));
  assert.deepEqual(accepted.approvedActivityMaterial.audio, AGUYJE);
  assert.deepEqual(accepted.authorizedAudio, AGUYJE);
});

test("normalize elimina audio en todas las salidas si aliases top contradicen la tupla", () => {
  const normalized = normalizeInterventionRequest(realAguyjeRequest({
    activityAudio: AGUYJE,
    approvedAudio: AGUYJE,
    authorizedAudio: AGUYJE,
    activityOverrides: {
      recordingId: ITATI.audioId,
      path: ITATI.audioPath,
      text: ITATI.audioText,
      source: "manifest-human-recording",
      authorized: true
    }
  }));
  assert.equal(normalized.activity.audioId, "");
  assert.equal(normalized.activity.audioPath, "");
  assert.equal(normalized.activity.audioAuthorized, false);
  assert.equal(normalized.approvedActivityMaterial.audio, null);
  assert.equal(normalized.authorizedAudio, null);
});

test("defaults canonical6 vacíos de una actividad no-audio no invalidan audio aprobado separado", () => {
  const normalized = normalizeInterventionRequest(realAguyjeRequest({
    approvedAudio: AGUYJE,
    authorizedAudio: AGUYJE,
    activityOverrides: {
      audioId: "",
      audioPath: "",
      audioText: "",
      audioAuthorized: false,
      humanRecorded: false,
      audioSource: ""
    }
  }));
  assert.equal(normalized.activity.audioAuthorized, false);
  assert.deepEqual(normalized.approvedActivityMaterial.audio, AGUYJE);
  assert.deepEqual(normalized.authorizedAudio, AGUYJE);
});

test("activity.id nunca se interpreta como alias de audioId", () => {
  assert.equal(trustedRecordedAudio({
    id: AGUYJE.audioId,
    audioPath: AGUYJE.audioPath,
    audioText: AGUYJE.audioText
  }, "Aguyje", { activityClaim: true }), null);
  assert.equal(trustedRecordedAudio({
    id: AGUYJE.audioId,
    audioPath: AGUYJE.audioPath,
    audioText: AGUYJE.audioText
  }, "Aguyje"), null);
  assert.equal(trustedRecordedAudio(richClaimFor(recordingFor("Aguyje")), "Aguyje")?.audioId, AGUYJE.audioId);

  const normalized = normalizeInterventionRequest(realAguyjeRequest({
    activityOverrides: {
      audioPath: AGUYJE.audioPath,
      audioText: AGUYJE.audioText
    }
  }));
  assert.equal(normalized.activity.id, REAL_ACTIVITY_ID);
  assert.equal(normalized.activity.audioId, "");
  assert.equal(normalized.activity.audioPath, "");
  assert.equal(normalized.activity.audioAuthorized, false);
});

test("activityClaim exige consenso de todos los aliases top salvo activity.id", () => {
  const canonicalActivity = audioSelectActivity();
  const agreeingAliases = {
    recordingId: AGUYJE.audioId,
    path: AGUYJE.audioPath,
    text: AGUYJE.audioText,
    source: "manifest-human-recording",
    authorized: true
  };
  assert.equal(
    trustedRecordedAudio({ ...canonicalActivity, ...agreeingAliases }, "Aguyje", { activityClaim: true })?.audioId,
    AGUYJE.audioId
  );
  for (const contradiction of [
    { recordingId: ITATI.audioId },
    { path: ITATI.audioPath },
    { text: ITATI.audioText },
    { url: "https://evil.invalid/x.m4a" },
    { source: "client-claimed-source" },
    { authorized: false }
  ]) {
    assert.equal(
      trustedRecordedAudio({ ...canonicalActivity, ...agreeingAliases, ...contradiction }, "Aguyje", { activityClaim: true }),
      null
    );
  }
});

test("toRenderable elimina aliases anidados y falla cerrado ante cualquier contradiccion", () => {
  const context = normalizeInterventionRequest(realAguyjeRequest({
    approvedAudio: AGUYJE,
    authorizedAudio: AGUYJE
  }));
  const valid = toRenderable(audioSelectActivity({
    authorizedAudio: richClaimFor(recordingFor("Aguyje")),
    audio: AGUYJE
  }), context, "consensus-plan", 0);

  assert.equal(valid.audioId, AGUYJE.audioId);
  assert.equal(valid.audioAuthorized, true);
  assert.equal(Object.hasOwn(valid, "authorizedAudio"), false);
  assert.equal(Object.hasOwn(valid, "recordingId"), false);
  assert.equal(Object.hasOwn(valid, "path"), false);
  assert.equal(Object.hasOwn(valid, "text"), false);
  assert.equal(Object.hasOwn(valid, "source"), false);
  assert.equal(Object.hasOwn(valid, "authorized"), false);
  assert.equal(Object.hasOwn(valid, "url"), false);
  assert.equal(Object.hasOwn(valid, "audio"), false);
  assert.deepEqual(
    ["audioId", "audioPath", "audioText", "audioAuthorized", "humanRecorded", "audioSource"]
      .filter(key => Object.hasOwn(valid, key)),
    ["audioId", "audioPath", "audioText", "audioAuthorized", "humanRecorded", "audioSource"]
  );

  for (const nested of [
    { authorizedAudio: ITATI },
    { audio: ITATI },
    { authorizedAudio: AGUYJE, audio: ITATI }
  ]) {
    const rejected = toRenderable(audioSelectActivity(nested), context, "contradictory-plan", 0);
    assert.equal(rejected.audioId, "");
    assert.equal(rejected.audioPath, "");
    assert.equal(rejected.audioText, "");
    assert.equal(rejected.audioAuthorized, false);
    assert.equal(rejected.humanRecorded, false);
    assert.equal(rejected.audioSource, "");
    assert.equal(Object.hasOwn(rejected, "authorizedAudio"), false);
    assert.equal(Object.hasOwn(rejected, "audio"), false);
  }

  const topAliasConflict = toRenderable(audioSelectActivity({
    recordingId: ITATI.audioId,
    path: ITATI.audioPath,
    text: ITATI.audioText,
    source: "manifest-human-recording",
    authorized: true,
    url: "https://evil.invalid/x.m4a"
  }), context, "top-alias-conflict", 0);
  assert.equal(topAliasConflict.audioAuthorized, false);
  assert.equal(topAliasConflict.audioPath, "");
  assert.equal(Object.hasOwn(topAliasConflict, "source"), false);
  assert.equal(Object.hasOwn(topAliasConflict, "authorized"), false);
  assert.equal(Object.hasOwn(topAliasConflict, "url"), false);
});

test("toda intervencion inmediata llega como evidencia guiada, incluso INDEPENDENT_RECALL", () => {
  const context = normalizeInterventionRequest(realAguyjeRequest({
    approvedAudio: AGUYJE,
    authorizedAudio: AGUYJE
  }));
  const types = [
    "CONTEXT_CHOICE",
    "ARROW_MATCH",
    "CATEGORY_SORT",
    "DIALOGUE_NEXT_TURN",
    "AUDIO_SELECT",
    "INDEPENDENT_RECALL"
  ];

  for (const type of types) {
    const activity = type === "AUDIO_SELECT"
      ? audioSelectActivity()
      : {
          ...audioSelectActivity({
            audioId: "",
            audioPath: "",
            audioText: "",
            audioAuthorized: false,
            humanRecorded: false,
            audioSource: ""
          }),
          type,
          activityType: type
        };
    const renderable = toRenderable({
      ...activity,
      independentRetest: true,
      spacedRetest: true,
      evidenceMode: "independent",
      nalviGuided: false
    }, context, `immediate-${type.toLowerCase()}`, 0);

    assert.equal(renderable.independentRetest, false, type);
    assert.equal(renderable.spacedRetest, false, type);
    assert.equal(renderable.evidenceMode, "guided", type);
    assert.equal(renderable.nalviGuided, true, type);
  }
});
