import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const RECORDED_AUDIO_MANIFEST_VERSION = "NALVI_RECORDED_AUDIO_V1";
export const RECORDED_AUDIO_EXPECTED_COUNT = 99;
export const RECORDED_AUDIO_BASE_PATH = "assets/audio/guarani/ali-2026";

const DEFAULT_MANIFEST_URL = new URL("../assets/audio/guarani/ali-2026/manifest.json", import.meta.url);
const DEFAULT_AUDIO_DIRECTORY_URL = new URL("../assets/audio/guarani/ali-2026/", import.meta.url);
const DEFAULT_RECOVERY_CHECKSUMS_URL = new URL("../RECOVERY-PRE-8C-SHA256SUMS.txt", import.meta.url);
const SAFE_ID = /^NALVI-AUDIO-(\d{3})$/;
const SAFE_FILE = /^(\d{3})-[a-z0-9]+(?:-[a-z0-9]+)*\.m4a$/;

const normalizeText = value => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[‘’`´ʼʹʻ]/g, "'")
  .replace(/[¿?¡!.,;:()\[\]{}]/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .toLocaleLowerCase("es");

const frozenCopy = value => Object.freeze({ ...value });

export function canonicalRecordedAudioPath(file) {
  const name = String(file || "").trim();
  if (!SAFE_FILE.test(name)) return "";
  return `${RECORDED_AUDIO_BASE_PATH}/${name}`;
}

function inspectPhysicalRecording({ file, audioDirectoryPath }) {
  const baseRealPath = realpathSync(audioDirectoryPath);
  const candidatePath = resolve(baseRealPath, file);
  if (dirname(candidatePath) !== baseRealPath) throw new Error("AUDIO_FILE_OUTSIDE_DIRECTORY");
  if (lstatSync(candidatePath).isSymbolicLink()) throw new Error("AUDIO_FILE_SYMLINK_REJECTED");
  const realPath = realpathSync(candidatePath);
  if (!realPath.startsWith(`${baseRealPath}${sep}`)) throw new Error("AUDIO_FILE_REALPATH_REJECTED");
  const stats = statSync(realPath);
  if (!stats.isFile() || stats.size <= 0) throw new Error("AUDIO_FILE_NOT_REGULAR_NONEMPTY");
  const bytes = readFileSync(realPath);
  if (bytes.length < 12 || bytes.toString("ascii", 4, 8) !== "ftyp") throw new Error("AUDIO_FILE_SIGNATURE_REJECTED");
  return {
    present: true,
    regularFile: true,
    signatureValid: true,
    size: stats.size,
    sha256: createHash("sha256").update(bytes).digest("hex")
  };
}

function loadRecoveryChecksums() {
  const checksums = new Map();
  for (const line of readFileSync(DEFAULT_RECOVERY_CHECKSUMS_URL, "utf8").split(/\r?\n/)) {
    const match = /^([0-9a-f]{64})  \.\/(assets\/audio\/guarani\/ali-2026\/[^/]+\.m4a)$/.exec(line);
    if (match) checksums.set(match[2], match[1]);
  }
  if (checksums.size !== RECORDED_AUDIO_EXPECTED_COUNT) throw new Error("AUDIO_RECOVERY_CHECKSUM_COUNT_MISMATCH");
  return checksums;
}

function validateManifestShape(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error("AUDIO_MANIFEST_INVALID_OBJECT");
  if (manifest.version !== RECORDED_AUDIO_MANIFEST_VERSION) throw new Error("AUDIO_MANIFEST_VERSION_MISMATCH");
  if (manifest.count !== RECORDED_AUDIO_EXPECTED_COUNT) throw new Error("AUDIO_MANIFEST_DECLARED_COUNT_MISMATCH");
  if (!Array.isArray(manifest.recordings) || manifest.recordings.length !== RECORDED_AUDIO_EXPECTED_COUNT) {
    throw new Error("AUDIO_MANIFEST_RECORDING_COUNT_MISMATCH");
  }
}

function validateManifestRecord(recording, index, seen) {
  const ordinal = String(index + 1).padStart(3, "0");
  const id = String(recording?.id || "").trim();
  const file = String(recording?.file || "").trim();
  const label = String(recording?.label || "").normalize("NFC").trim();
  const sourceFile = String(recording?.sourceFile || "").normalize("NFC").trim();
  const idMatch = SAFE_ID.exec(id);
  const fileMatch = SAFE_FILE.exec(file);
  if (!idMatch || idMatch[1] !== ordinal) throw new Error(`AUDIO_MANIFEST_INVALID_ID:${ordinal}`);
  if (!fileMatch || fileMatch[1] !== ordinal) throw new Error(`AUDIO_MANIFEST_INVALID_FILE:${ordinal}`);
  if (!label || !normalizeText(label)) throw new Error(`AUDIO_MANIFEST_INVALID_LABEL:${ordinal}`);
  if (!sourceFile || !/\.m4a$/i.test(sourceFile)) throw new Error(`AUDIO_MANIFEST_INVALID_SOURCE_FILE:${ordinal}`);
  if (sourceFile !== `${label}.m4a`) throw new Error(`AUDIO_MANIFEST_SOURCE_LABEL_MISMATCH:${ordinal}`);
  if (recording.format !== "audio/mp4") throw new Error(`AUDIO_MANIFEST_INVALID_FORMAT:${ordinal}`);

  const uniqueValues = {
    id,
    file,
    sourceFile: sourceFile.toLocaleLowerCase("es"),
    label: normalizeText(label)
  };
  for (const [field, value] of Object.entries(uniqueValues)) {
    if (seen[field].has(value)) throw new Error(`AUDIO_MANIFEST_DUPLICATE_${field.toUpperCase()}:${value}`);
    seen[field].add(value);
  }
  return { id, file, label, sourceFile };
}

function textAliases(recording) {
  const sourceLabel = recording.sourceFile.replace(/\.m4a$/i, "");
  const parentheticalBase = recording.label.split("(")[0].trim();
  return new Set([recording.label, sourceLabel, parentheticalBase].map(normalizeText).filter(Boolean));
}

function canonicalOutput(recording) {
  return frozenCopy({
    id: recording.id,
    audioId: recording.id,
    file: recording.file,
    sourceFile: recording.sourceFile,
    label: recording.label,
    path: recording.path,
    audioPath: recording.path,
    text: recording.label,
    audioText: recording.label,
    format: "audio/mp4",
    source: "manifest-human-recording",
    audioSource: "manifest-human-recording",
    authorized: true,
    audioAuthorized: true,
    humanRecorded: true
  });
}

function unavailableAuthority(error) {
  const message = String(error?.message || error || "AUDIO_AUTHORITY_UNAVAILABLE");
  return Object.freeze({
    resolve: () => null,
    resolveForTarget: () => null,
    has: () => false,
    audit: () => Object.freeze({
      ready: false,
      error: message,
      manifestVersion: RECORDED_AUDIO_MANIFEST_VERSION,
      expectedRecordings: RECORDED_AUDIO_EXPECTED_COUNT,
      manifestRecordings: 0,
      authorizedRecordings: 0,
      rejectedRecordings: 0,
      requiresIdPathTextMatch: true,
      verifiesPhysicalFiles: true,
      verifiesRecoveryChecksums: true,
      playbackAuthorizationIsLinguisticApproval: false
    })
  });
}

export function createRecordedAudioAuthority({
  manifest,
  manifestUrl = DEFAULT_MANIFEST_URL,
  audioDirectoryUrl = DEFAULT_AUDIO_DIRECTORY_URL,
  inspectFile = inspectPhysicalRecording,
  expectedChecksums
} = {}) {
  const usesDefaultManifest = manifest === undefined;
  const parsedManifest = usesDefaultManifest ? JSON.parse(readFileSync(manifestUrl, "utf8")) : manifest;
  const checksumByPath = expectedChecksums === undefined
    ? (usesDefaultManifest ? loadRecoveryChecksums() : null)
    : expectedChecksums;
  validateManifestShape(parsedManifest);
  const audioDirectoryPath = fileURLToPath(audioDirectoryUrl);
  const seen = { id: new Set(), file: new Set(), sourceFile: new Set(), label: new Set() };
  const byId = new Map();
  const byPath = new Map();
  const rejected = [];
  const seenAliases = new Map();

  parsedManifest.recordings.forEach((rawRecording, index) => {
    const identity = validateManifestRecord(rawRecording, index, seen);
    const path = canonicalRecordedAudioPath(identity.file);
    const aliases = textAliases(identity);
    for (const alias of aliases) {
      const existingId = seenAliases.get(alias);
      if (existingId && existingId !== identity.id) throw new Error(`AUDIO_MANIFEST_DUPLICATE_ALIAS:${alias}`);
      seenAliases.set(alias, identity.id);
    }
    const recording = { ...identity, path, aliases };
    if (rawRecording.humanRecorded !== true || rawRecording.authorizedForPlayback !== true) {
      rejected.push({ id: identity.id, file: identity.file, reason: "NOT_AUTHORIZED_FOR_HUMAN_PLAYBACK" });
      return;
    }
    try {
      const inspection = inspectFile({ ...recording, audioDirectoryPath });
      if (!inspection?.present || !inspection?.regularFile || !inspection?.signatureValid || Number(inspection.size) <= 0) {
        throw new Error("AUDIO_FILE_INSPECTION_REJECTED");
      }
      if (checksumByPath) {
        const expectedHash = checksumByPath.get(path);
        if (!expectedHash || inspection.sha256 !== expectedHash) throw new Error("AUDIO_FILE_RECOVERY_CHECKSUM_MISMATCH");
      }
      const authorized = Object.freeze({ ...recording, size: Number(inspection.size) });
      byId.set(authorized.id, authorized);
      byPath.set(authorized.path, authorized);
    } catch (error) {
      rejected.push({ id: identity.id, file: identity.file, reason: String(error?.message || error) });
    }
  });

  function resolveAudio(claim = {}) {
    if (!claim || typeof claim !== "object" || Array.isArray(claim)) return null;
    const audioId = String(claim.audioId || claim.id || claim.recordingId || "").trim();
    const audioPath = String(claim.audioPath || claim.path || "").trim();
    const audioText = String(claim.audioText || claim.text || "").trim();
    const targetText = String(claim.targetText || "").trim();
    if (!audioId || !audioPath || !audioText) return null;
    const idRecording = byId.get(audioId);
    const pathRecording = byPath.get(audioPath);
    if (!idRecording || idRecording !== pathRecording || !idRecording.aliases.has(normalizeText(audioText))) return null;
    if (targetText && !idRecording.aliases.has(normalizeText(targetText))) return null;
    return canonicalOutput(idRecording);
  }

  function resolveForTarget(claim, targetText) {
    const target = String(targetText || "").trim();
    return target ? resolveAudio({ ...claim, targetText: target }) : null;
  }

  const auditSnapshot = Object.freeze({
    ready: true,
    error: "",
    manifestVersion: parsedManifest.version,
    expectedRecordings: RECORDED_AUDIO_EXPECTED_COUNT,
    manifestRecordings: parsedManifest.recordings.length,
    authorizedRecordings: byId.size,
    rejectedRecordings: rejected.length,
    rejected: Object.freeze(rejected.map(frozenCopy)),
    requiresIdPathTextMatch: true,
    ignoresClientAuthorizationBoolean: true,
    verifiesPhysicalFiles: true,
    verifiesRecoveryChecksums: Boolean(checksumByPath),
    recoveryChecksumRecords: checksumByPath?.size || 0,
    playbackAuthorizationIsLinguisticApproval: false
  });

  return Object.freeze({
    resolve: resolveAudio,
    resolveForTarget,
    has: claim => Boolean(resolveAudio(claim)),
    audit: () => auditSnapshot
  });
}

let defaultAuthority;
try {
  defaultAuthority = createRecordedAudioAuthority();
} catch (error) {
  defaultAuthority = unavailableAuthority(error);
}

// Resolución técnica de playback. No implica aprobación lingüística ni enlaza
// una grabación con un objetivo pedagógico; el flujo de producto debe usar
// authorizeRecordedAudioForTarget().
export const resolveRecordedAudioPlayback = claim => defaultAuthority.resolve(claim);
export const authorizeRecordedAudioForTarget = (claim, targetText) => defaultAuthority.resolveForTarget(claim, targetText);
export const recordedAudioWhitelistAudit = () => defaultAuthority.audit();

export default defaultAuthority;
