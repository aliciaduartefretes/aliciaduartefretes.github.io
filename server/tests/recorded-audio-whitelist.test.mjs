import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildDeterministicFallbackCandidates } from "../../progression-engine/fallback-intervention.mjs";
import { ADAPTIVE_TUTOR_PLAN_SCHEMA } from "../adaptive-tutor-schema.mjs";
import { createAdaptiveTutorOrchestrator, toRenderable } from "../adaptive-tutor-orchestrator.mjs";
import { normalizeInterventionRequest } from "../intervention-service.mjs";
import {
  authorizeRecordedAudioForTarget,
  canonicalRecordedAudioPath,
  createRecordedAudioAuthority,
  recordedAudioWhitelistAudit,
  resolveRecordedAudioPlayback
} from "../recorded-audio-authority.mjs";

const manifestUrl = new URL("../../assets/audio/guarani/ali-2026/manifest.json", import.meta.url);
const audioDirectoryUrl = new URL("../../assets/audio/guarani/ali-2026/", import.meta.url);
const manifest = JSON.parse(readFileSync(manifestUrl, "utf8"));
const inspectOk = () => ({ present: true, regularFile: true, signatureValid: true, size: 1 });

const clone = value => JSON.parse(JSON.stringify(value));
const claimFor = recording => ({
  audioId: recording.id,
  audioPath: canonicalRecordedAudioPath(recording.file),
  audioText: recording.label,
  audioAuthorized: true,
  humanRecorded: true
});

function requestWithAudio(audio, overrides = {}) {
  return {
    correct: false,
    conceptId: "catalog-jagua",
    learningObjectiveId: "catalog-audio",
    currentSkill: "listening",
    activityType: "listening",
    difficulty: "foundation-1",
    studentAnswer: "guyra",
    correctAnswer: "Jagua",
    attemptNumber: 1,
    recentErrors: [],
    recentActivities: [],
    recentActivityFingerprints: [],
    modalitiesAlreadyUsed: ["listening"],
    uiLocale: "es",
    grammarRuleIds: [],
    lexemeIds: [],
    knowledgeIds: [],
    activity: {
      id: "source-listening",
      conceptId: "catalog-jagua",
      learningObjectiveId: "catalog-audio",
      type: "listening",
      skill: "listening",
      difficulty: "foundation-1",
      prompt: "Escucha.",
      instruction: "Elige.",
      ...audio
    },
    authorizedAudio: audio,
    approvedActivityMaterial: {
      options: [
        { id: "jagua", text: "Jagua", authorized: true },
        { id: "guyra", text: "Guyra", authorized: true },
        { id: "mbarakaja", text: "Mbarakaja", authorized: true }
      ],
      audio
    },
    aiPolicy: { allowInterventionAI: true, AI_TUTOR_ON_EVERY_INCORRECT_ANSWER: true },
    ...overrides
  };
}

test("la whitelist default deriva 99 entradas presentes del manifiesto físico", () => {
  const audit = recordedAudioWhitelistAudit();
  assert.equal(audit.ready, true);
  assert.equal(audit.manifestRecordings, 99);
  assert.equal(audit.authorizedRecordings, 99);
  assert.equal(audit.rejectedRecordings, 0);
  assert.equal(audit.verifiesPhysicalFiles, true);
  assert.equal(audit.verifiesRecoveryChecksums, true);
  assert.equal(audit.recoveryChecksumRecords, 99);
  assert.equal(audit.playbackAuthorizationIsLinguisticApproval, false);

  for (const recording of manifest.recordings) {
    const authorized = resolveRecordedAudioPlayback(claimFor(recording));
    assert.equal(authorized.audioId, recording.id);
    assert.equal(authorized.audioPath, canonicalRecordedAudioPath(recording.file));
    assert.equal(authorized.audioAuthorized, true);
    assert.equal(authorized.humanRecorded, true);
  }
});

test("audioAuthorized del cliente no concede autorización", () => {
  assert.equal(resolveRecordedAudioPlayback({ audioAuthorized: true, humanRecorded: true }), null);
  assert.equal(resolveRecordedAudioPlayback({
    audioAuthorized: true,
    humanRecorded: true,
    audioPath: "assets/audio/guarani/ali-2026/096-jagua.m4a",
    audioText: "Jagua"
  }), null);

  const serverRebuilt = resolveRecordedAudioPlayback({ ...claimFor(manifest.recordings[95]), audioAuthorized: false, humanRecorded: false });
  assert.equal(serverRebuilt.audioAuthorized, true);
  assert.equal(serverRebuilt.humanRecorded, true);
});

test("ID, ruta relativa y texto deben corresponder a la misma entrada", () => {
  const jagua = claimFor(manifest.recordings[95]);
  assert.ok(resolveRecordedAudioPlayback(jagua));
  assert.equal(resolveRecordedAudioPlayback({ ...jagua, audioId: "NALVI-AUDIO-095" }), null);
  assert.equal(resolveRecordedAudioPlayback({ ...jagua, audioPath: "assets/audio/guarani/ali-2026/095-itati.m4a" }), null);
  assert.equal(resolveRecordedAudioPlayback({ ...jagua, audioText: "Guavira" }), null);
  assert.equal(resolveRecordedAudioPlayback({ ...jagua, audioPath: "https://nalvi.test/assets/audio/guarani/ali-2026/096-jagua.m4a" }), null);
  assert.equal(authorizeRecordedAudioForTarget(jagua, "Jagua")?.audioId, "NALVI-AUDIO-096");
  assert.equal(authorizeRecordedAudioForTarget(jagua, "Guyra"), null);
  assert.equal(authorizeRecordedAudioForTarget(jagua, ""), null);
});

test("un archivo inexistente o una entrada no autorizada queda fuera de la whitelist", () => {
  const missingAuthority = createRecordedAudioAuthority({
    manifest,
    audioDirectoryUrl,
    inspectFile: recording => recording.id === "NALVI-AUDIO-050"
      ? { present: false, regularFile: false, signatureValid: false, size: 0 }
      : inspectOk()
  });
  assert.equal(missingAuthority.audit().authorizedRecordings, 98);
  assert.equal(missingAuthority.resolve(claimFor(manifest.recordings[49])), null);

  const unauthorizedManifest = clone(manifest);
  unauthorizedManifest.recordings[49].authorizedForPlayback = false;
  const unauthorizedAuthority = createRecordedAudioAuthority({ manifest: unauthorizedManifest, audioDirectoryUrl, inspectFile: inspectOk });
  assert.equal(unauthorizedAuthority.audit().authorizedRecordings, 98);
  assert.equal(unauthorizedAuthority.resolve(claimFor(unauthorizedManifest.recordings[49])), null);

  const expectedChecksums = new Map(manifest.recordings.map(recording => [canonicalRecordedAudioPath(recording.file), "a".repeat(64)]));
  const checksumAuthority = createRecordedAudioAuthority({
    manifest,
    audioDirectoryUrl,
    expectedChecksums,
    inspectFile: recording => ({ ...inspectOk(), sha256: recording.id === "NALVI-AUDIO-050" ? "b".repeat(64) : "a".repeat(64) })
  });
  assert.equal(checksumAuthority.audit().authorizedRecordings, 98);
  assert.equal(checksumAuthority.resolve(claimFor(manifest.recordings[49])), null);
  assert.match(checksumAuthority.audit().rejected[0].reason, /RECOVERY_CHECKSUM_MISMATCH/);
});

test("duplicados estructurales y aliases ambiguos invalidan la whitelist", () => {
  const duplicate = clone(manifest);
  duplicate.recordings[1].label = duplicate.recordings[0].label;
  duplicate.recordings[1].sourceFile = duplicate.recordings[0].sourceFile;
  assert.throws(
    () => createRecordedAudioAuthority({ manifest: duplicate, audioDirectoryUrl, inspectFile: inspectOk }),
    /AUDIO_MANIFEST_DUPLICATE_SOURCEFILE/
  );

  const aliasCollision = clone(manifest);
  aliasCollision.recordings[1].label = `${aliasCollision.recordings[0].label} (variante)`;
  aliasCollision.recordings[1].sourceFile = `${aliasCollision.recordings[1].label}.m4a`;
  assert.throws(
    () => createRecordedAudioAuthority({ manifest: aliasCollision, audioDirectoryUrl, inspectFile: inspectOk }),
    /AUDIO_MANIFEST_DUPLICATE_ALIAS/
  );
});

test("normalización server-side sustituye claims por el contrato canónico", () => {
  const rawClaim = { ...claimFor(manifest.recordings[95]), audioAuthorized: false, humanRecorded: false };
  const context = normalizeInterventionRequest(requestWithAudio(rawClaim));

  assert.deepEqual(context.approvedActivityMaterial.audio, {
    id: "NALVI-AUDIO-096",
    audioId: "NALVI-AUDIO-096",
    path: "assets/audio/guarani/ali-2026/096-jagua.m4a",
    audioPath: "assets/audio/guarani/ali-2026/096-jagua.m4a",
    text: "Jagua",
    audioText: "Jagua",
    source: "manifest-human-recording",
    audioSource: "manifest-human-recording",
    authorized: true,
    audioAuthorized: true,
    humanRecorded: true
  });
  assert.equal(context.activity.audioId, "NALVI-AUDIO-096");
  assert.equal(context.activity.audioAuthorized, true);
  assert.equal(context.activity.humanRecorded, true);
});

test("una ruta no listada se elimina antes del planner y del fallback", async () => {
  const invalid = { ...claimFor(manifest.recordings[95]), audioPath: "assets/audio/guarani/ali-2026/no-existe.m4a", audioAuthorized: true };
  const context = normalizeInterventionRequest(requestWithAudio(invalid));
  assert.equal(context.approvedActivityMaterial.audio, null);
  assert.equal(context.authorizedAudio, null);
  assert.equal(context.activity.audioAuthorized, false);

  const candidates = buildDeterministicFallbackCandidates(context, 1, "LISTENING_CONFUSION");
  assert.equal(candidates.some(candidate => candidate.activityType === "AUDIO_SELECT"), false);

  const service = createAdaptiveTutorOrchestrator({ env: {} });
  const result = await service.orchestrateAdaptiveTutoring(context);
  assert.equal(result.adaptiveInterventionPlan.activities.some(activity => activity.activityType === "AUDIO_SELECT"), false);
});

test("una grabación válida no puede asociarse a otro objetivo o respuesta", () => {
  const adioForJagua = normalizeInterventionRequest(requestWithAudio(claimFor(manifest.recordings[0])));
  assert.equal(adioForJagua.activity.audioAuthorized, false);
  assert.equal(adioForJagua.authorizedAudio, null);
  assert.equal(adioForJagua.approvedActivityMaterial.audio, null);
  assert.equal(
    buildDeterministicFallbackCandidates(adioForJagua, 1, "LISTENING_CONFUSION")
      .some(candidate => candidate.activityType === "AUDIO_SELECT"),
    false
  );
});

test("los targets completos y base de las cuatro etiquetas parentéticas permanecen autorizables", () => {
  for (const recording of manifest.recordings.filter(item => item.label.includes("("))) {
    const audio = claimFor(recording);
    for (const target of [recording.label, recording.label.split("(")[0].trim()]) {
      const request = requestWithAudio(audio, {
        correctAnswer: target,
        approvedActivityMaterial: {
          options: [
            { id: "correct", text: target, authorized: true },
            { id: "other-1", text: "Jagua", authorized: true },
            { id: "other-2", text: "Guavira", authorized: true }
          ],
          audio
        }
      });
      const context = normalizeInterventionRequest(request);
      const candidate = buildDeterministicFallbackCandidates(context, 1, "LISTENING_CONFUSION")
        .find(item => item.activityType === "AUDIO_SELECT");
      assert.ok(candidate, `${recording.id} debe aceptar target ${target}`);
      assert.equal(candidate.activity.audioId, recording.id);
    }
  }
});

test("AUDIO_SELECT conserva ID/ruta/autorización/origen humano hasta toRenderable", async () => {
  const context = normalizeInterventionRequest(requestWithAudio(claimFor(manifest.recordings[95])));
  const candidates = buildDeterministicFallbackCandidates(context, 1, "LISTENING_CONFUSION");
  const audioCandidate = candidates.find(candidate => candidate.activityType === "AUDIO_SELECT");
  assert.ok(audioCandidate);
  assert.equal(audioCandidate.activity.audioId, "NALVI-AUDIO-096");
  assert.equal(audioCandidate.activity.audioPath, "assets/audio/guarani/ali-2026/096-jagua.m4a");
  assert.equal(audioCandidate.activity.audioAuthorized, true);
  assert.equal(audioCandidate.activity.humanRecorded, true);

  const renderable = toRenderable(audioCandidate.activity, context, "audio-plan", 0);
  assert.equal(renderable.audioId, "NALVI-AUDIO-096");
  assert.equal(renderable.audioPath, "assets/audio/guarani/ali-2026/096-jagua.m4a");
  assert.equal(renderable.audioAuthorized, true);
  assert.equal(renderable.humanRecorded, true);

  const service = createAdaptiveTutorOrchestrator({ env: {} });
  const result = await service.orchestrateAdaptiveTutoring(context);
  const serverActivity = result.adaptiveInterventionPlan.activities[0];
  assert.equal(serverActivity.activityType, "AUDIO_SELECT");
  assert.equal(serverActivity.audioId, "NALVI-AUDIO-096");
  assert.equal(serverActivity.audioPath, "assets/audio/guarani/ali-2026/096-jagua.m4a");
  assert.equal(serverActivity.audioAuthorized, true);
  assert.equal(serverActivity.humanRecorded, true);
});

test("toRenderable falla cerrado si el planner altera ID o ruta", () => {
  const context = normalizeInterventionRequest(requestWithAudio(claimFor(manifest.recordings[95])));
  const candidate = buildDeterministicFallbackCandidates(context, 1, "LISTENING_CONFUSION")
    .find(item => item.activityType === "AUDIO_SELECT").activity;
  const renderable = toRenderable({ ...candidate, audioPath: "assets/audio/guarani/ali-2026/095-itati.m4a", audioAuthorized: true }, context, "tampered", 0);

  assert.equal(renderable.audioId, "");
  assert.equal(renderable.audioPath, "");
  assert.equal(renderable.audioAuthorized, false);
  assert.equal(renderable.humanRecorded, false);
});

test("toRenderable vincula audio con correctAnswer y correctOptionId del candidato", () => {
  const context = normalizeInterventionRequest(requestWithAudio(claimFor(manifest.recordings[95])));
  const candidate = buildDeterministicFallbackCandidates(context, 1, "LISTENING_CONFUSION")
    .find(item => item.activityType === "AUDIO_SELECT").activity;

  const changedAnswer = toRenderable({ ...candidate, correctAnswer: "Guyra", correctOptionId: "guyra" }, context, "tampered-answer", 0);
  assert.equal(changedAnswer.audioAuthorized, false);
  assert.equal(changedAnswer.audioPath, "");

  const changedOption = toRenderable({ ...candidate, correctOptionId: "guyra" }, context, "tampered-option", 0);
  assert.equal(changedOption.audioAuthorized, false);
  assert.equal(changedOption.audioPath, "");
});

test("el schema discrimina AUDIO_SELECT completo de actividades no-audio vacías", () => {
  const activitySchema = ADAPTIVE_TUTOR_PLAN_SCHEMA.properties.candidateActivities.items.properties.activity;
  const fields = ["audioId", "audioPath", "audioText", "audioAuthorized", "humanRecorded", "audioSource"];
  assert.equal(activitySchema.anyOf.length, 2);
  const audioBranch = activitySchema.anyOf.find(branch => branch.properties.activityType.const === "AUDIO_SELECT");
  const nonAudioBranch = activitySchema.anyOf.find(branch => branch.properties.activityType.enum);

  for (const branch of [audioBranch, nonAudioBranch]) {
    assert.equal(branch.additionalProperties, false);
    for (const field of fields) assert.ok(branch.required.includes(field), `${field} debe ser obligatorio`);
  }
  assert.equal(audioBranch.properties.audioId.minLength, 1);
  assert.equal(audioBranch.properties.audioPath.minLength, 1);
  assert.equal(audioBranch.properties.audioText.minLength, 1);
  assert.equal(audioBranch.properties.audioAuthorized.const, true);
  assert.equal(audioBranch.properties.humanRecorded.const, true);
  assert.equal(audioBranch.properties.audioSource.const, "manifest-human-recording");
  assert.equal(nonAudioBranch.properties.activityType.enum.includes("AUDIO_SELECT"), false);
  assert.equal(nonAudioBranch.properties.audioId.const, "");
  assert.equal(nonAudioBranch.properties.audioPath.const, "");
  assert.equal(nonAudioBranch.properties.audioText.const, "");
  assert.equal(nonAudioBranch.properties.audioAuthorized.const, false);
  assert.equal(nonAudioBranch.properties.humanRecorded.const, false);
  assert.equal(nonAudioBranch.properties.audioSource.const, "");

  const satisfiesAudioContract = (branch, value) => ["activityType", ...fields].every(field => {
    const rule = branch.properties[field];
    if (Object.hasOwn(rule, "const") && value[field] !== rule.const) return false;
    if (rule.enum && !rule.enum.includes(value[field])) return false;
    if (rule.minLength && String(value[field] || "").length < rule.minLength) return false;
    return true;
  });
  const validAudio = {
    activityType: "AUDIO_SELECT",
    audioId: "NALVI-AUDIO-096",
    audioPath: "assets/audio/guarani/ali-2026/096-jagua.m4a",
    audioText: "Jagua",
    audioAuthorized: true,
    humanRecorded: true,
    audioSource: "manifest-human-recording"
  };
  const validNonAudio = {
    activityType: "INDEPENDENT_RECALL",
    audioId: "",
    audioPath: "",
    audioText: "",
    audioAuthorized: false,
    humanRecorded: false,
    audioSource: ""
  };
  assert.equal(satisfiesAudioContract(audioBranch, validAudio), true);
  assert.equal(satisfiesAudioContract(audioBranch, { ...validAudio, audioPath: "" }), false);
  assert.equal(satisfiesAudioContract(audioBranch, { ...validAudio, audioAuthorized: false }), false);
  assert.equal(satisfiesAudioContract(nonAudioBranch, validNonAudio), true);
  assert.equal(satisfiesAudioContract(nonAudioBranch, { ...validNonAudio, audioId: validAudio.audioId }), false);
  assert.equal(satisfiesAudioContract(nonAudioBranch, { ...validNonAudio, humanRecorded: true }), false);
});
