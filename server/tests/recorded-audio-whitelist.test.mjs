import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildDeterministicFallbackCandidates } from "../../progression-engine/fallback-intervention.mjs";
import {
  bundledRecordedAudioIndexAudit,
  bundledRecordedAudioRecords
} from "../../progression-engine/recorded-audio-manifest-index.mjs";
import { ADAPTIVE_TUTOR_PLAN_SCHEMA } from "../adaptive-tutor-schema.mjs";
import {
  createAdaptiveTutorOrchestrator,
  createProfessionalFallbackPlan,
  determineLinguisticMode,
  toRenderable,
  validateActivityAgainstApprovedMaterial
} from "../adaptive-tutor-orchestrator.mjs";
import { normalizeInterventionRequest, sanitizeApprovedActivityMaterial } from "../intervention-service.mjs";
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

test("el índice síncrono del fallback corresponde exactamente a las 99 entradas del manifiesto", () => {
  assert.deepEqual(bundledRecordedAudioIndexAudit(), {
    version: manifest.version,
    count: 99,
    basePath: "assets/audio/guarani/ali-2026",
    exactIdPathTextRequired: true,
    playbackReady: false
  });
  assert.deepEqual(
    bundledRecordedAudioRecords.map(recording => ({
      id: recording.audioId,
      path: recording.audioPath,
      label: recording.audioText
    })),
    manifest.recordings.map(recording => ({
      id: recording.id,
      path: canonicalRecordedAudioPath(recording.file),
      label: recording.label.normalize("NFC")
    }))
  );
});

function requestWithAudio(audio, overrides = {}) {
  const activityAudio = audio && typeof audio === "object" ? Object.fromEntries([
    "audioId", "audioPath", "audioText", "audioAuthorized", "humanRecorded", "audioSource"
  ].filter(key => Object.hasOwn(audio, key)).map(key => [key, audio[key]])) : {};
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
      id: "server-rich-jagua",
      conceptId: "catalog-jagua",
      conceptIds: ["catalog-jagua"],
      learningObjectiveId: "catalog-audio",
      type: "listening",
      activityType: "listening",
      skill: "listening",
      difficulty: "foundation-1",
      prompt: "Escucha.",
      instruction: "Elige.",
      options: [
        { id: "jagua", label: "Jagua" },
        { id: "guyra", label: "Guyra" },
        { id: "mbarakaja", label: "Mbarakaja" }
      ],
      correctOptionId: "jagua",
      lexemeIds: [],
      grammarRuleIds: [],
      sourceIds: [],
      ...activityAudio
    },
    authorizedAudio: audio,
    approvedActivityMaterial: {
      options: [
        { id: "jagua", text: "Jagua", authorized: true },
        { id: "guyra", text: "Guyra", authorized: true },
        { id: "mbarakaja", text: "Mbarakaja", authorized: true }
      ],
      correctOptionId: "jagua",
      correctAnswer: "Jagua",
      acceptedAnswers: ["Jagua"],
      audio
    },
    aiPolicy: { allowInterventionAI: true, AI_TUTOR_ON_EVERY_INCORRECT_ANSWER: true },
    ...overrides
  };
}

const CANONICAL_AUDIO = Object.freeze({
  audioId: "NALVI-AUDIO-096",
  audioPath: "assets/audio/guarani/ali-2026/096-jagua.m4a",
  audioText: "Jagua",
  audioAuthorized: true,
  humanRecorded: true,
  audioSource: "manifest-human-recording"
});

const TEST_ACTIVITIES = [
  {
    id: "server-rich-jagua",
    learningObjectiveId: "catalog-audio",
    conceptIds: ["catalog-jagua"],
    lexemeIds: [],
    grammarRuleIds: [],
    skill: "listening",
    difficulty: "foundation-1",
    activityType: "listening",
    type: "listening",
    contentValidationStatus: "unreviewed",
    allowedForMastery: false,
    prompt: { es: "Elige Jagua.", en: "Choose Jagua." },
    options: [
      { id: "jagua", label: "Jagua" },
      { id: "guyra", label: "Guyra" },
      { id: "mbarakaja", label: "Mbarakaja" }
    ],
    correctOptionId: "jagua",
    semanticPair: { target: "Jagua", meaning: "perro", adaptiveReuseAuthorized: true },
    approvedContexts: [{ text: { es: "Contexto aprobado", en: "Approved context" }, authorized: true }],
    adaptiveCategories: [
      { id: "animals", label: "Animales", authorized: true },
      { id: "other", label: "Otros", authorized: true }
    ],
    adaptiveCategoryItems: [
      { id: "item-1", text: "Jagua", categoryId: "animals", authorized: true },
      { id: "item-2", text: "Guyra", categoryId: "animals", authorized: true },
      { id: "item-3", text: "Mbarakaja", categoryId: "animals", authorized: true },
      { id: "item-4", text: "Óga", categoryId: "other", authorized: true },
      { id: "item-5", text: "Y", categoryId: "other", authorized: true },
      { id: "item-6", text: "Tape", categoryId: "other", authorized: true }
    ],
    adaptiveDialogue: {
      authorized: true,
      sourceContentId: "server-dialogue-jagua",
      turns: [
        { id: "turn-1", speaker: "A", text: "¿Rehecha jagua?", authorized: true },
        { id: "turn-2", speaker: "B", text: "Héẽ, ahecha.", authorized: true }
      ],
      options: [
        { id: "jagua", text: "Jagua", authorized: true },
        { id: "guyra", text: "Guyra", authorized: true },
        { id: "mbarakaja", text: "Mbarakaja", authorized: true }
      ],
      correctOptionId: "jagua",
      correctAnswer: "Jagua"
    }
  },
  {
    id: "server-rich-guyra",
    learningObjectiveId: "catalog-audio",
    conceptIds: ["catalog-jagua"],
    skill: "vocabulary",
    difficulty: "foundation-1",
    activityType: "multiple-choice",
    type: "multiple-choice",
    options: [{ id: "guyra", label: "Guyra" }],
    correctOptionId: "guyra",
    semanticPair: { target: "Guyra", meaning: "pájaro", adaptiveReuseAuthorized: true }
  },
  {
    id: "server-rich-mbarakaja",
    learningObjectiveId: "catalog-audio",
    conceptIds: ["catalog-jagua"],
    skill: "vocabulary",
    difficulty: "foundation-1",
    activityType: "multiple-choice",
    type: "multiple-choice",
    options: [{ id: "mbarakaja", label: "Mbarakaja" }],
    correctOptionId: "mbarakaja",
    semanticPair: { target: "Mbarakaja", meaning: "gato", adaptiveReuseAuthorized: true }
  }
];
const testLocalize = (value, locale = "es") => value && typeof value === "object" && !Array.isArray(value)
  ? String(value[locale] ?? value.es ?? value.en ?? "")
  : String(value ?? "");
function testAuthorityDescriptor(raw, locale = "es") {
  const options = (raw.options || []).map(option => ({
    id: String(option.id),
    text: testLocalize(option.label ?? option.text, locale),
    authorized: true
  }));
  const correctAnswer = options.find(option => option.id === raw.correctOptionId)?.text || "";
  const adaptiveDialogue = raw.adaptiveDialogue;
  const dialogueOptions = (adaptiveDialogue?.options || []).map(option => ({
    id: String(option.id), text: testLocalize(option.text, locale), authorized: true
  }));
  const sourceActivity = {
    id: raw.id,
    conceptId: raw.conceptIds[0],
    conceptIds: [...raw.conceptIds],
    learningObjectiveId: raw.learningObjectiveId,
    type: raw.type,
    activityType: raw.activityType,
    skill: raw.skill,
    difficulty: raw.difficulty,
    prompt: testLocalize(raw.prompt, locale),
    instruction: testLocalize(raw.instruction ?? raw.prompt, locale),
    options: options.map(option => ({ id: option.id, label: option.text })),
    correctOptionId: raw.correctOptionId,
    acceptedAnswers: [correctAnswer],
    requiresStudentResponse: true,
    lexemeIds: [...(raw.lexemeIds || [])],
    grammarRuleIds: [...(raw.grammarRuleIds || [])],
    sourceIds: [...(raw.sourceIds || [])],
    contentValidationStatus: raw.contentValidationStatus || "unreviewed",
    allowedForMastery: raw.allowedForMastery === true,
    literalReuseOnly: true,
    lessonContext: { sourceActivityId: raw.id, sourceAnswer: correctAnswer }
  };
  return {
    sourceActivity,
    correctAnswer,
    knowledgeIds: [...sourceActivity.grammarRuleIds, ...sourceActivity.lexemeIds],
    approvedActivityMaterial: {
      options,
      correctOptionId: raw.correctOptionId,
      correctAnswer,
      acceptedAnswers: [correctAnswer],
      pairs: TEST_ACTIVITIES.map(activity => ({
        id: activity.id,
        left: testLocalize(activity.semanticPair?.target, locale),
        right: testLocalize(activity.semanticPair?.meaning, locale),
        authorized: true
      })),
      contexts: (raw.approvedContexts || []).map(item => ({ text: testLocalize(item.text, locale), authorized: true })),
      categories: (raw.adaptiveCategories || []).map(item => ({ id: item.id, label: testLocalize(item.label, locale), authorized: true })),
      items: (raw.adaptiveCategoryItems || []).map(item => ({ id: item.id, text: testLocalize(item.text, locale), categoryId: item.categoryId, authorized: true })),
      dialogue: (adaptiveDialogue?.turns || []).map(turn => ({ ...turn })),
      dialogueOptions,
      dialogueCorrectOptionId: adaptiveDialogue?.correctOptionId || "",
      dialogueCorrectAnswer: adaptiveDialogue?.correctAnswer || "",
      dialogueSourceContentId: adaptiveDialogue?.sourceContentId || "",
      audio: null
    }
  };
}
const TEST_ACTIVITY_AUTHORITY = Object.freeze({
  resolve({ activityId, uiLocale = "es" } = {}) {
    const raw = TEST_ACTIVITIES.find(activity => activity.id === activityId);
    return raw ? clone(testAuthorityDescriptor(raw, uiLocale)) : null;
  },
  listByLearningObjective({ learningObjectiveId, uiLocale = "es" } = {}) {
    return TEST_ACTIVITIES.filter(activity => activity.learningObjectiveId === learningObjectiveId)
      .map(activity => clone(testAuthorityDescriptor(activity, uiLocale).sourceActivity));
  },
  audit: () => ({ ready: true, source: "test-only-closed-authority" })
});
const normalizeTestRequest = input => normalizeInterventionRequest(input, { activityAuthority: TEST_ACTIVITY_AUTHORITY });
const createTestOrchestrator = options => createAdaptiveTutorOrchestrator({ ...options, activityAuthority: TEST_ACTIVITY_AUTHORITY });

function richApprovedMaterial(audio = claimFor(manifest.recordings[95])) {
  const options = [
    { id: "jagua", text: "Jagua", authorized: true },
    { id: "guyra", text: "Guyra", authorized: true },
    { id: "mbarakaja", text: "Mbarakaja", authorized: true }
  ];
  return {
    options,
    correctOptionId: "jagua",
    correctAnswer: "Jagua",
    acceptedAnswers: ["Jagua"],
    pairs: [
      { id: "pair-jagua", left: "Jagua", right: "perro", authorized: true },
      { id: "pair-guyra", left: "Guyra", right: "pájaro", authorized: true },
      { id: "pair-mbarakaja", left: "Mbarakaja", right: "gato", authorized: true }
    ],
    contexts: [{ text: { es: "Contexto aprobado", en: "Approved context" }, authorized: true }],
    categories: [
      { id: "animals", label: "Animales", authorized: true },
      { id: "other", label: "Otros", authorized: true }
    ],
    items: Array.from({ length: 6 }, (_, index) => ({
      id: `item-${index + 1}`,
      text: `elemento ${index + 1}`,
      categoryId: index < 3 ? "animals" : "other",
      authorized: true
    })),
    dialogue: [
      { id: "turn-1", speaker: "A", text: "¿Rehecha jagua?", authorized: true },
      { id: "turn-2", speaker: "B", text: "Héẽ, ahecha.", authorized: true }
    ],
    dialogueOptions: options,
    dialogueCorrectOptionId: "jagua",
    dialogueCorrectAnswer: "Jagua",
    dialogueSourceContentId: "fixture-dialogue-source",
    audio
  };
}

function richContext(overrides = {}) {
  return normalizeTestRequest(requestWithAudio(claimFor(manifest.recordings[95]), {
    approvedActivityMaterial: richApprovedMaterial(),
    ...overrides
  }));
}

function plannerPlan(context, candidate, overrides = {}) {
  const errorType = candidate.errorType || "SEMANTIC_CONFUSION";
  return {
    planVersion: "NALVI-TUTOR-CATALOG-1",
    planId: `plan-${candidate.activityType.toLocaleLowerCase()}`,
    conceptId: context.conceptId,
    linguisticMode: "LESSON_BOUNDED",
    diagnosis: { errorType, likelyDifficulty: "test", confidence: 0.9, prerequisiteGap: null, skillAffected: context.currentSkill },
    pedagogicalGoal: "Select approved material.",
    strategy: { primaryStrategy: "CHANGE_MODALITY", secondaryStrategy: null, reasonCode: "approved-test" },
    studentFeedback: { locale: context.uiLocale, shortMessage: "texto del Planner" },
    candidateActivities: [candidate],
    progressionPolicy: { onIncorrect: "BLOCK_AND_INTERVENE", onGuidedCorrect: "CONTINUE_PRACTICE", requiresIndependentRetest: true, maxInterventionsBeforeDefer: 4 },
    fallbackPolicy: { strategy: "OFFICIAL_CATALOG_LOCAL_FALLBACK", reason: "test" },
    validationMetadata: { sourceIds: [], knowledgeIds: [], claimedRiskLevel: "GREEN" },
    ...overrides
  };
}

const response = value => ({
  ok: true,
  json: async () => ({ output_text: JSON.stringify(value), usage: { input_tokens: 1, output_tokens: 1 } })
});

async function runPlannerCandidate(context, candidate, planOverrides = {}) {
  const plan = plannerPlan(context, candidate, planOverrides);
  const service = createTestOrchestrator({
    fetchImpl: async () => response(plan),
    env: { OPENAI_API_KEY: "server-secret", AI_TUTOR_CRITIC_ENABLED: "false", AI_TUTOR_MAX_REVISION_ATTEMPTS: "0" }
  });
  return service.orchestrateAdaptiveTutoring(context);
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
  const rawClaim = richClaimFor(manifest.recordings[95]);
  const context = normalizeTestRequest(requestWithAudio(rawClaim));

  assert.deepEqual(context.approvedActivityMaterial.audio, {
    audioId: "NALVI-AUDIO-096",
    audioPath: "assets/audio/guarani/ali-2026/096-jagua.m4a",
    audioText: "Jagua",
    audioSource: "manifest-human-recording",
    audioAuthorized: true,
    humanRecorded: true
  });
  assert.equal(context.activity.audioId, "NALVI-AUDIO-096");
  assert.equal(context.activity.audioAuthorized, true);
  assert.equal(context.activity.humanRecorded, true);
});

test("el material aprobado se localiza, conserva completo y nunca fabrica contenido", () => {
  const approved = richApprovedMaterial(richClaimFor(manifest.recordings[95]));
  approved.options.push({ text: "sin id", authorized: true });
  approved.contexts.push(
    { text: "No autorizado", authorized: false },
    { text: "Booleano falso", authorized: "true" },
    { arbitrary: "Nunca convertir este objeto", authorized: true }
  );
  const material = sanitizeApprovedActivityMaterial(approved, "Jagua", "en");

  assert.deepEqual(material.contexts, [{ text: "Approved context", authorized: true }]);
  assert.deepEqual(material.options.map(({ id, text }) => ({ id, text })), [
    { id: "jagua", text: "Jagua" },
    { id: "guyra", text: "Guyra" },
    { id: "mbarakaja", text: "Mbarakaja" }
  ]);
  assert.equal(material.correctOptionId, "jagua");
  assert.equal(material.correctAnswer, "Jagua");
  assert.deepEqual(material.acceptedAnswers, ["Jagua"]);
  assert.equal(material.pairs.length, 3);
  assert.equal(material.categories.length, 2);
  assert.equal(material.items.length, 6);
  assert.equal(material.dialogue.length, 2);
  assert.equal(material.dialogueOptions.length, 3);
  assert.equal(material.dialogueCorrectOptionId, "jagua");
  assert.equal(material.dialogueCorrectAnswer, "Jagua");
  assert.equal(material.dialogueSourceContentId, "fixture-dialogue-source");
  assert.deepEqual(material.audio, CANONICAL_AUDIO);
  assert.doesNotMatch(JSON.stringify(material), /\[object Object\]|sin id|No autorizado|Booleano falso|Nunca convertir/);
});

test("IDs duplicados o ausentes no se sustituyen dentro del material aprobado", () => {
  const approved = richApprovedMaterial();
  approved.options = [
    { id: "duplicate", text: "Jagua", authorized: true },
    { id: "duplicate", text: "Guyra", authorized: true },
    { text: "Mbarakaja", authorized: true }
  ];
  approved.correctOptionId = "duplicate";
  const material = sanitizeApprovedActivityMaterial(approved, "Jagua", "es");

  assert.deepEqual(material.options, []);
  assert.equal(material.correctOptionId, "");
  assert.doesNotMatch(JSON.stringify(material), /approved-option|option-[0-9]/);
});

test("activity.id nunca puede suplantar audioId durante normalización", () => {
  const audio = claimFor(manifest.recordings[95]);
  const raw = requestWithAudio(audio);
  raw.activity = { ...raw.activity, id: audio.audioId, audioId: "" };
  assert.throws(() => normalizeTestRequest(raw), /UNAPPROVED_ACTIVITY_ID/);
});

test("una ruta no listada se elimina antes del planner y del fallback", async () => {
  const invalid = { ...claimFor(manifest.recordings[95]), audioPath: "assets/audio/guarani/ali-2026/096-no-existe.m4a", audioAuthorized: true };
  const context = normalizeTestRequest(requestWithAudio(invalid));
  assert.equal(context.approvedActivityMaterial.audio, null);
  assert.equal(context.authorizedAudio, null);
  assert.equal(context.activity.audioAuthorized, false);

  const candidates = buildDeterministicFallbackCandidates(context, 1, "LISTENING_CONFUSION");
  assert.equal(candidates.some(candidate => candidate.activityType === "AUDIO_SELECT"), false);

  const service = createTestOrchestrator({ env: {} });
  const result = await service.orchestrateAdaptiveTutoring(context);
  assert.equal(result.adaptiveInterventionPlan.activities.some(activity => activity.activityType === "AUDIO_SELECT"), false);
});

test("el builder público rechaza una pareja audio ID/ruta con ordinales cruzados", () => {
  const crossed = {
    ...CANONICAL_AUDIO,
    audioId: "NALVI-AUDIO-007"
  };
  const candidates = buildDeterministicFallbackCandidates(requestWithAudio(crossed), 1, "LISTENING_CONFUSION");
  assert.equal(candidates.some(candidate => candidate.activityType === "AUDIO_SELECT"), false);
});

test("el builder público rechaza una ruta inexistente aunque conserve el ordinal", () => {
  const sameOrdinalFake = {
    ...CANONICAL_AUDIO,
    audioPath: "assets/audio/guarani/ali-2026/096-no-existe.m4a"
  };
  const candidates = buildDeterministicFallbackCandidates(requestWithAudio(sameOrdinalFake), 1, "LISTENING_CONFUSION");
  assert.equal(candidates.some(candidate => candidate.activityType === "AUDIO_SELECT"), false);
});

test("el builder público falla cerrado ante colecciones aprobadas malformadas", () => {
  for (const field of ["options", "pairs", "contexts"]) {
    const context = requestWithAudio(CANONICAL_AUDIO);
    context.approvedActivityMaterial[field] = {};
    let candidates;
    assert.doesNotThrow(() => { candidates = buildDeterministicFallbackCandidates(context, 1, "LISTENING_CONFUSION"); }, field);
    assert.ok(Array.isArray(candidates), field);
    if (field === "options") assert.equal(candidates.some(candidate => candidate.activityType === "AUDIO_SELECT"), false);
  }
});

test("el builder rich12 rechaza un sufijo textual no incluido en el manifiesto", () => {
  const recording = manifest.recordings.find(item => item.label.includes("("));
  const rich = richClaimFor(recording);
  const target = recording.label.split("(")[0].trim();
  rich.text = `${target} (CLIENT_EVIL)`;
  const context = {
    correctAnswer: target,
    approvedActivityMaterial: {
      audio: rich,
      options: [
        { id: "correct", text: target, authorized: true },
        { id: "other-1", text: "Ambue", authorized: true },
        { id: "other-2", text: "Nahániri", authorized: true }
      ],
      correctOptionId: "correct"
    }
  };
  const candidates = buildDeterministicFallbackCandidates(context, 1, "LISTENING_CONFUSION");
  assert.equal(candidates.some(candidate => candidate.activityType === "AUDIO_SELECT"), false);
});

test("el builder público exige consenso entre approved audio y authorizedAudio", () => {
  const context = requestWithAudio(CANONICAL_AUDIO);
  context.authorizedAudio = {
    ...CANONICAL_AUDIO,
    audioId: "NALVI-AUDIO-007",
    audioPath: "assets/audio/guarani/ali-2026/007-aguyje.m4a"
  };
  const candidates = buildDeterministicFallbackCandidates(context, 1, "LISTENING_CONFUSION");
  assert.equal(candidates.some(candidate => candidate.activityType === "AUDIO_SELECT"), false);
});

test("una grabación válida no puede asociarse a otro objetivo o respuesta", () => {
  const adioForJagua = normalizeTestRequest(requestWithAudio(claimFor(manifest.recordings[0])));
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
      const authorized = authorizeRecordedAudioForTarget(audio, target);
      assert.ok(authorized, `${recording.id} debe aceptar target ${target}`);
      assert.equal(authorized.audioId, recording.id);
    }
  }
});

test("AUDIO_SELECT conserva ID/ruta/autorización/origen humano hasta toRenderable", async () => {
  const context = normalizeTestRequest(requestWithAudio(claimFor(manifest.recordings[95])));
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

  const service = createTestOrchestrator({ env: {} });
  const result = await service.orchestrateAdaptiveTutoring(context);
  const serverActivity = result.adaptiveInterventionPlan.activities[0];
  assert.equal(serverActivity.activityType, "AUDIO_SELECT");
  assert.equal(serverActivity.audioId, "NALVI-AUDIO-096");
  assert.equal(serverActivity.audioPath, "assets/audio/guarani/ali-2026/096-jagua.m4a");
  assert.equal(serverActivity.audioAuthorized, true);
  assert.equal(serverActivity.humanRecorded, true);
});

test("toRenderable falla cerrado si el planner altera ID o ruta", () => {
  const context = normalizeTestRequest(requestWithAudio(claimFor(manifest.recordings[95])));
  const candidate = buildDeterministicFallbackCandidates(context, 1, "LISTENING_CONFUSION")
    .find(item => item.activityType === "AUDIO_SELECT").activity;
  const renderable = toRenderable({ ...candidate, audioPath: "assets/audio/guarani/ali-2026/095-itati.m4a", audioAuthorized: true }, context, "tampered", 0);

  assert.equal(renderable.audioId, "");
  assert.equal(renderable.audioPath, "");
  assert.equal(renderable.audioAuthorized, false);
  assert.equal(renderable.humanRecorded, false);
});

test("toRenderable vincula audio con correctAnswer y correctOptionId del candidato", () => {
  const context = normalizeTestRequest(requestWithAudio(claimFor(manifest.recordings[95])));
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
