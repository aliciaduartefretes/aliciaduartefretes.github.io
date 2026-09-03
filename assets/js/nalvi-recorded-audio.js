(function installNalviRecordedAudio() {
  "use strict";

  const VERSION = "NALVI_RECORDED_AUDIO_CLIENT_V4";
  const MANIFEST_VERSION = "NALVI_RECORDED_AUDIO_V1";
  const MANIFEST_PATH = "assets/audio/guarani/ali-2026/manifest.json";
  const SCRIPT_URL = document.currentScript?.src ? new URL(document.currentScript.src, document.baseURI) : null;
  const EXPECTED_RECORDING_COUNT = 99;
  const MANIFEST_TIMEOUT_MS = 8000;
  const SAFE_ID = /^NALVI-AUDIO-(\d{3})$/;
  const SAFE_FILE = /^(\d{3})-[a-z0-9]+(?:-[a-z0-9]+)*\.m4a$/;
  const CANONICAL_AUDIO_KEYS = Object.freeze([
    "audioId", "audioPath", "audioText", "audioAuthorized", "humanRecorded", "audioSource"
  ]);
  const RICH_AUDIO_KEYS = Object.freeze([
    "id", "audioId", "recordingId", "path", "audioPath", "text", "audioText", "source", "audioSource",
    "authorized", "audioAuthorized", "humanRecorded"
  ]);
  const byLabel = new Map();
  const byId = new Map();
  const byPath = new Map();
  const byUrl = new Map();
  let recordings = [];
  let state = "loading";
  let manifestError = "";
  let activePlayback = null;
  let playbackToken = 0;

  const legacyPlayPronunciation = typeof window.playPronunciation === "function"
    ? window.playPronunciation.bind(window)
    : null;

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[‘’`´ʼʹʻ]/g, "'")
      .replace(/[¿?¡!.,;:()\[\]{}]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase("es");
  }

  function manifestUrl() {
    return SCRIPT_URL
      ? new URL("../audio/guarani/ali-2026/manifest.json", SCRIPT_URL)
      : new URL(`/${MANIFEST_PATH}`, document.baseURI);
  }

  function recordingUrl(file) {
    return new URL(file, manifestUrl());
  }

  function canonicalRequestedUrl(path) {
    try {
      const source = String(path || "").trim();
      if (/[\\\u0000-\u001f\u007f]/.test(source)) return "";
      if (!source.startsWith("/") && !/^https?:\/\//i.test(source)) return "";
      const url = new URL(source, manifestUrl());
      if (url.username || url.password || url.search || url.hash) return "";
      return url.href;
    } catch {
      return "";
    }
  }

  function duplicateError(field, value) {
    throw new Error(`AUDIO_MANIFEST_DUPLICATE_${field.toUpperCase()}:${value}`);
  }

  function validateManifest(manifest) {
    if (manifest?.version !== MANIFEST_VERSION) throw new Error("AUDIO_MANIFEST_VERSION_MISMATCH");
    if (manifest?.count !== EXPECTED_RECORDING_COUNT) throw new Error("AUDIO_MANIFEST_DECLARED_COUNT_MISMATCH");
    if (!Array.isArray(manifest.recordings) || manifest.recordings.length !== EXPECTED_RECORDING_COUNT) {
      throw new Error("AUDIO_MANIFEST_RECORDING_COUNT_MISMATCH");
    }

    const seenIds = new Set();
    const seenFiles = new Set();
    const seenSourceFiles = new Set();
    const seenLabels = new Set();

    return manifest.recordings.map((recording, index) => {
      const ordinal = String(index + 1).padStart(3, "0");
      const idMatch = SAFE_ID.exec(String(recording?.id || ""));
      const fileMatch = SAFE_FILE.exec(String(recording?.file || ""));
      const sourceFile = String(recording?.sourceFile || "").normalize("NFC").trim();
      const label = String(recording?.label || "").normalize("NFC").trim();
      const labelKey = normalize(label);
      const sourceKey = sourceFile.toLocaleLowerCase("es");

      if (!idMatch || idMatch[1] !== ordinal) throw new Error(`AUDIO_MANIFEST_INVALID_ID:${ordinal}`);
      if (!fileMatch || fileMatch[1] !== ordinal) throw new Error(`AUDIO_MANIFEST_INVALID_FILE:${ordinal}`);
      if (!label || !labelKey) throw new Error(`AUDIO_MANIFEST_INVALID_LABEL:${ordinal}`);
      if (!sourceFile || !/\.m4a$/i.test(sourceFile)) throw new Error(`AUDIO_MANIFEST_INVALID_SOURCE_FILE:${ordinal}`);
      if (sourceFile !== `${label}.m4a`) throw new Error(`AUDIO_MANIFEST_SOURCE_LABEL_MISMATCH:${ordinal}`);
      if (recording.format !== "audio/mp4") throw new Error(`AUDIO_MANIFEST_INVALID_FORMAT:${ordinal}`);
      if (recording.humanRecorded !== true || recording.authorizedForPlayback !== true) {
        throw new Error(`AUDIO_MANIFEST_UNAUTHORIZED_RECORDING:${ordinal}`);
      }
      if (seenIds.has(recording.id)) duplicateError("id", recording.id);
      if (seenFiles.has(recording.file)) duplicateError("file", recording.file);
      if (seenSourceFiles.has(sourceKey)) duplicateError("source_file", sourceFile);
      if (seenLabels.has(labelKey)) duplicateError("label", label);
      seenIds.add(recording.id);
      seenFiles.add(recording.file);
      seenSourceFiles.add(sourceKey);
      seenLabels.add(labelKey);

      const path = `${MANIFEST_PATH.slice(0, MANIFEST_PATH.lastIndexOf("/") + 1)}${recording.file}`;
      const url = recordingUrl(recording.file).href;
      return Object.freeze({
        id: recording.id,
        audioId: recording.id,
        label,
        sourceFile,
        file: recording.file,
        path,
        audioPath: path,
        text: label,
        audioText: label,
        url,
        format: "audio/mp4",
        source: "manifest-human-recording",
        audioSource: "manifest-human-recording",
        authorized: true,
        humanRecorded: true,
        authorizedForPlayback: true,
        audioAuthorized: true
      });
    });
  }

  function indexLabel(value, recording) {
    const key = normalize(value);
    if (!key) return;
    const existing = byLabel.get(key);
    if (existing && existing !== recording) duplicateError("alias", value);
    byLabel.set(key, recording);
  }

  function commitManifest(validatedRecordings) {
    validatedRecordings.forEach(recording => {
      byId.set(recording.id, recording);
      byPath.set(recording.path, recording);
      byUrl.set(recording.url, recording);
      indexLabel(recording.label, recording);
      indexLabel(recording.sourceFile.replace(/\.m4a$/i, ""), recording);
      const baseLabel = recording.label.split("(")[0].trim();
      if (baseLabel) indexLabel(baseLabel, recording);
    });
    recordings = Object.freeze([...validatedRecordings]);
  }

  function loadManifestWithTimeout() {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("AUDIO_MANIFEST_TIMEOUT")), MANIFEST_TIMEOUT_MS);
    });
    const request = Promise.resolve()
      .then(() => fetch(manifestUrl().href, { cache: "no-cache", credentials: "same-origin" }))
      .then(response => {
        if (!response.ok) throw new Error(`AUDIO_MANIFEST_HTTP_${response.status}`);
        return response.json();
      })
      .then(manifest => ({ manifest, validatedRecordings: validateManifest(manifest) }));
    return Promise.race([request, timeout]).finally(() => clearTimeout(timeoutId));
  }

  const ready = loadManifestWithTimeout()
    .then(({ manifest, validatedRecordings }) => {
      commitManifest(validatedRecordings);
      state = "ready";
      return Object.freeze({ ok: true, version: manifest.version, count: recordings.length });
    })
    .catch(error => {
      manifestError = String(error?.message || error);
      state = "failed";
      recordings = [];
      byId.clear();
      byLabel.clear();
      byPath.clear();
      byUrl.clear();
      console.warn("NALVI_RECORDED_AUDIO_MANIFEST_UNAVAILABLE", manifestError);
      return Object.freeze({ ok: false, version: "", count: 0, error: manifestError });
    });

  function publicRecording(item) {
    return item ? Object.freeze({ ...item }) : null;
  }

  function resolve(value) {
    try {
      if (state !== "ready" || (typeof value !== "string" && typeof value !== "number")) return null;
      const item = byId.get(String(value || "")) || byLabel.get(normalize(value));
      return publicRecording(item);
    } catch {
      return null;
    }
  }

  function list() {
    if (state !== "ready") return Object.freeze([]);
    return Object.freeze(recordings.map(publicRecording));
  }

  function authorize(selection = {}) {
    try {
      if (state !== "ready" || !selection || typeof selection !== "object" || Array.isArray(selection)) return null;
      const ownKeys = Reflect.ownKeys(selection);
      if (ownKeys.some(key => typeof key !== "string")) return null;
      const keys = [...ownKeys].sort();
      const exactShape = expected => keys.length === expected.length
        && JSON.stringify(keys) === JSON.stringify([...expected].sort());
      const rich = exactShape(RICH_AUDIO_KEYS);
      if (!rich && !exactShape(CANONICAL_AUDIO_KEYS)) return null;
      const expectedKeys = rich ? RICH_AUDIO_KEYS : CANONICAL_AUDIO_KEYS;
      const descriptors = Object.fromEntries(expectedKeys.map(key => [key, Object.getOwnPropertyDescriptor(selection, key)]));
      if (expectedKeys.some(key => !descriptors[key] || !("value" in descriptors[key]) || descriptors[key].enumerable !== true)) return null;
      const value = key => descriptors[key].value;
      if (value("audioAuthorized") !== true || value("humanRecorded") !== true
        || value("audioSource") !== "manifest-human-recording") return null;
      const audioId = typeof value("audioId") === "string" ? value("audioId").trim() : "";
      const audioPath = typeof value("audioPath") === "string" ? value("audioPath").trim() : "";
      const audioText = typeof value("audioText") === "string" ? value("audioText").trim() : "";
      if (rich && (value("authorized") !== true || value("source") !== "manifest-human-recording"
        || value("id") !== audioId || value("recordingId") !== audioId
        || value("path") !== audioPath || typeof value("text") !== "string" || !value("text").trim())) return null;
      if (!audioId || !audioPath || !audioText) return null;
      const byIdentifier = byId.get(audioId);
      const byCanonicalPath = byPath.get(audioPath);
      if (!byIdentifier || !byCanonicalPath || byIdentifier !== byCanonicalPath) return null;
      if (byLabel.get(normalize(audioText)) !== byIdentifier) return null;
      if (rich && byLabel.get(normalize(value("text"))) !== byIdentifier) return null;
      return publicRecording(byIdentifier);
    } catch {
      return null;
    }
  }

  const BUTTON_STATE_LABEL_KEYS = Object.freeze({
    loading: "audioLabelLoading",
    ready: "audioLabelReady",
    playing: "audioLabelPlaying",
    paused: "audioLabelPaused",
    error: "audioLabelError"
  });
  const BUTTON_STATE_ICONS = Object.freeze({ loading: "⏳", ready: "🔊", playing: "⏸", paused: "↻", error: "⚠️" });

  function isElement(value) {
    return typeof Element !== "undefined" && value instanceof Element;
  }

  function setButtonState(button, nextState) {
    if (!isElement(button) || !Object.hasOwn(BUTTON_STATE_LABEL_KEYS, nextState)) return;
    try {
      button.dataset.audioState = nextState;
      button.classList?.toggle?.("is-playing", nextState === "playing");
      button.classList?.toggle?.("is-paused", nextState === "paused");
      button.classList?.toggle?.("is-error", nextState === "error");
      button.setAttribute("aria-pressed", String(nextState === "playing"));
      button.setAttribute("aria-busy", String(nextState === "loading"));
      button.setAttribute("aria-disabled", String(nextState === "loading" || nextState === "error"));
      button.disabled = nextState === "loading" || nextState === "error";
      const label = button.dataset?.[BUTTON_STATE_LABEL_KEYS[nextState]] || "";
      const labelNode = button.querySelector?.("[data-audio-label]");
      const iconNode = button.querySelector?.("[data-audio-icon]");
      if (label) {
        button.setAttribute("aria-label", label);
        if (labelNode) labelNode.textContent = label;
      }
      if (iconNode) iconNode.textContent = BUTTON_STATE_ICONS[nextState];
    } catch {
      // El fallo visual de un control no puede romper ni autorizar reproducción.
    }
  }

  function releasePlayback(playback, nextState = "ready") {
    if (!playback) return false;
    if (activePlayback === playback) activePlayback = null;
    try { playback.audio.pause(); } catch {}
    try { playback.audio.currentTime = 0; } catch {}
    playback.status = nextState;
    setButtonState(playback.button, nextState);
    return true;
  }

  function stop() {
    return releasePlayback(activePlayback, "ready");
  }

  function pause() {
    const playback = activePlayback;
    if (!playback || playback.status !== "playing") return false;
    try {
      playback.audio.pause();
      playback.status = "paused";
      setButtonState(playback.button, "paused");
      return true;
    } catch (error) {
      releasePlayback(playback, "error");
      console.info("NALVI_RECORDED_AUDIO_PLAYBACK", String(error?.message || error));
      return false;
    }
  }

  async function startPlayback(playback, { restart = false } = {}) {
    if (restart) {
      try { playback.audio.currentTime = 0; } catch (error) {
        releasePlayback(playback, "error");
        console.info("NALVI_RECORDED_AUDIO_PLAYBACK", String(error?.message || error));
        return false;
      }
    }
    playback.status = "loading";
    setButtonState(playback.button, "loading");
    try {
      await playback.audio.play();
      if (activePlayback !== playback || playback.token !== playbackToken) return false;
      playback.status = "playing";
      setButtonState(playback.button, "playing");
      return true;
    } catch (error) {
      if (activePlayback === playback) releasePlayback(playback, "error");
      console.info("NALVI_RECORDED_AUDIO_PLAYBACK", String(error?.message || error));
      return false;
    }
  }

  async function restart() {
    const playback = activePlayback;
    if (!playback || playback.status !== "paused") return false;
    return startPlayback(playback, { restart: true });
  }

  async function playRecording(recording, button) {
    if (!recording || state !== "ready") {
      setButtonState(button, "error");
      return false;
    }
    const hasButton = isElement(button);
    if (activePlayback?.recording.id === recording.id && activePlayback.button === (hasButton ? button : null)) {
      if (activePlayback.status === "playing") return pause();
      if (activePlayback.status === "paused") return restart();
      if (activePlayback.status === "loading") return true;
    }
    stop();
    let audio;
    try {
      audio = new Audio(recording.url);
      audio.preload = "metadata";
    } catch (error) {
      setButtonState(button, "error");
      console.info("NALVI_RECORDED_AUDIO_PLAYBACK", String(error?.message || error));
      return false;
    }
    const playback = {
      audio,
      button: hasButton ? button : null,
      recording,
      status: "loading",
      token: ++playbackToken
    };
    activePlayback = playback;
    const end = () => {
      if (activePlayback === playback) releasePlayback(playback, "ready");
    };
    const fail = () => {
      if (activePlayback === playback) releasePlayback(playback, "error");
    };
    try {
      audio.addEventListener("ended", end, { once: true });
      audio.addEventListener("error", fail, { once: true });
    } catch (error) {
      releasePlayback(playback, "error");
      console.info("NALVI_RECORDED_AUDIO_PLAYBACK", String(error?.message || error));
      return false;
    }
    return startPlayback(playback);
  }

  async function playSelection(selection, button) {
    const status = await ready;
    if (!status.ok) {
      setButtonState(button, "error");
      return false;
    }
    const recording = authorize(selection);
    if (!recording) {
      setButtonState(button, "error");
      return false;
    }
    if (!isElement(button) && legacyPlayPronunciation) {
      try { if (legacyPlayPronunciation(recording.label, button)) return true; } catch {}
    }
    return playRecording(recording, button);
  }

  async function playPath(path, button, audioId, humanRecorded = false, audioAuthorized = false, audioText = "", audioSource = "") {
    return playSelection({ audioId, audioPath: path, audioText, humanRecorded, audioAuthorized, audioSource }, button);
  }

  async function play(value, button) {
    const status = await ready;
    if (!status.ok) {
      setButtonState(button, "error");
      return false;
    }
    const recording = resolve(value);
    if (!recording) {
      setButtonState(button, "error");
      return false;
    }
    return playRecording(recording, button);
  }

  // Los audios históricos ya integrados conservan prioridad. El corpus importado
  // solo se consulta después de que el manifiesto completo haya sido validado.
  window.playPronunciation = function playPronunciationWithRecordedFallback(value, button) {
    if (legacyPlayPronunciation) {
      try { if (legacyPlayPronunciation(value, button)) return true; } catch {}
    }
    return play(value, button);
  };

  window.NALVI_RECORDED_AUDIO = Object.freeze({
    version: VERSION,
    ready,
    resolve,
    list,
    authorize,
    has: value => Boolean(resolve(value)),
    play,
    playPath,
    playSelection,
    pause,
    restart,
    stop,
    audit: () => ({
      version: VERSION,
      manifestVersion: MANIFEST_VERSION,
      manifest: MANIFEST_PATH,
      state,
      ready: state === "ready",
      error: manifestError,
      expectedRecordings: EXPECTED_RECORDING_COUNT,
      manifestTimeoutMs: MANIFEST_TIMEOUT_MS,
      importedRecordings: recordings.length,
      indexedLabels: byLabel.size,
      indexedIds: byId.size,
      indexedCanonicalPaths: byPath.size,
      indexedPaths: byUrl.size,
      playbackState: activePlayback?.status || "idle",
      activeRecordingId: activePlayback?.recording.id || "",
      rejectsUnlistedPaths: true,
      requiresIdPathTextMatch: true,
      preservesExistingAudioPriority: true
    })
  });
})();
