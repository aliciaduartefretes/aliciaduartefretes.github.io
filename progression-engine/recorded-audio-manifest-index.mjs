// Generated, reviewable projection of
// assets/audio/guarani/ali-2026/manifest.json. Playback still requires the
// runtime registry; this synchronous index only lets shared fallback code
// reject claims that are not an exact member of the recovered manifest.
const LABELS = Object.freeze([
  "ADIÓ", "Ág̃aite", "Ag̃ave", "Age", "Aguará’i", "Aguigua", "Aguyje", "Aguyjeve", "Ahe", "Ahoja",
  "Ahy’o", "Ahy’o’api", "Ahy’opa’ã", "Ai", "Ãicha", "Aichejáranga", "Aína", "Aipo", "Aje", "Aju’y",
  "Ajukue", "Ajúri", "Ajuvyso", "Akã guasu", "Akã", "Akã’o", "Akãchara", "Akãguapy (en lugar de akãpyta)",
  "Akãhatã", "Akãhoja", "Akãmambu", "Akãmbota", "Akãnga’u", "Akãngatu", "Akãnunduro’y", "Akãpete",
  "Akãpicha", "Akãratī", "Akãsã", "Akatúa", "Ake (duermo)", "Akekē", "Akói", "Aku", "Akuã (Veloz)",
  "Akue", "Akymba", "Akytã", "Ama", "Amamo’ãha", "Ambue", "Angirū", "Añuã", "Apopy", "Apyka",
  "Arapapaha", "Ava", "Chae", "Chavi", "Che réra", "Chejupe", "Cherejápe", "Chi’õ (mezquino)",
  "Chokokue", "Chororī", "Churi", "Denuka", "Deprovécho", "Eja", "Eja’e’ỹva", "Ekoporã", "Guarara",
  "Guata", "Guavira", "Gueteri", "Guyguy", "Ha", "Ha’etegua", "Haihára", "Hakua", "Hasakuaa’ỹva",
  "Hekombo’e", "Hembevo", "Hendu", "Hepyme’ēva", "Hesakã", "Ichupe", "Ikatu", "Ikatúpa", "Ikatupáva",
  "Imo’ãporãva", "Inimbe’i", "Iporã", "Iporupy", "Itati", "Jagua", "Jaho’i’o", "Japyhy", "Nahániri"
]);

const BASE_PATH = "assets/audio/guarani/ali-2026";
const normalizeTarget = value => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[‘’`´ʼʹʻ]/g, "'")
  .replace(/[¿?¡!.,;:()\[\]{}]/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .toLocaleLowerCase("es");
const slug = value => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("es")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

const RECORDINGS = Object.freeze(LABELS.map((label, index) => {
  const ordinal = String(index + 1).padStart(3, "0");
  return Object.freeze({
    audioId: `NALVI-AUDIO-${ordinal}`,
    audioPath: `${BASE_PATH}/${ordinal}-${slug(label)}.m4a`,
    audioText: label.normalize("NFC")
  });
}));
const BY_ID = new Map(RECORDINGS.map(recording => [recording.audioId, recording]));
const AUTHORITY_CLAIM_KEYS = Object.freeze(["audioId", "audioPath", "audioText"]);
const RESERVED_AUDIO_CLAIM_KEYS = Object.freeze([
  ...AUTHORITY_CLAIM_KEYS, "id", "recordingId", "path", "url", "text", "source", "authorized",
  "audioSource", "audioAuthorized", "humanRecorded"
]);

export function authorizeBundledRecordedAudio(claim = {}, targetText = "") {
  try {
    if (!claim || typeof claim !== "object" || Array.isArray(claim) || typeof targetText !== "string") return null;
    const prototype = Object.getPrototypeOf(claim);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const ownKeys = Reflect.ownKeys(claim);
    if (ownKeys.length !== AUTHORITY_CLAIM_KEYS.length
      || ownKeys.some(key => typeof key !== "string")
      || JSON.stringify([...ownKeys].sort()) !== JSON.stringify([...AUTHORITY_CLAIM_KEYS].sort())
      || (prototype === Object.prototype
        && RESERVED_AUDIO_CLAIM_KEYS.some(key => Object.prototype.hasOwnProperty.call(prototype, key)))) return null;
    const descriptors = Object.fromEntries(AUTHORITY_CLAIM_KEYS
      .map(key => [key, Object.getOwnPropertyDescriptor(claim, key)]));
    if (AUTHORITY_CLAIM_KEYS.some(key => !descriptors[key] || !("value" in descriptors[key])
      || descriptors[key].enumerable !== true)) return null;

    const audioId = typeof descriptors.audioId.value === "string" ? descriptors.audioId.value : "";
    const audioPath = typeof descriptors.audioPath.value === "string" ? descriptors.audioPath.value : "";
    const audioText = typeof descriptors.audioText.value === "string"
      ? descriptors.audioText.value.normalize("NFC") : "";
    const recording = BY_ID.get(audioId);
    if (!recording || audioPath !== recording.audioPath || audioText !== recording.audioText) return null;
    const normalizedTarget = normalizeTarget(targetText);
    const aliases = [recording.audioText, recording.audioText.split("(")[0]]
      .map(normalizeTarget)
      .filter(Boolean);
    if (!normalizedTarget || !aliases.includes(normalizedTarget)) return null;
    return Object.freeze({
      audioId: recording.audioId,
      audioPath: recording.audioPath,
      audioText: recording.audioText,
      audioAuthorized: true,
      humanRecorded: true,
      audioSource: "manifest-human-recording"
    });
  } catch {
    return null;
  }
}

export function bundledRecordedAudioIndexAudit() {
  return Object.freeze({
    version: "NALVI_RECORDED_AUDIO_V1",
    count: RECORDINGS.length,
    basePath: BASE_PATH,
    exactIdPathTextRequired: true,
    playbackReady: false
  });
}

export const bundledRecordedAudioRecords = RECORDINGS;
