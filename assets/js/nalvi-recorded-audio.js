(function installNalviRecordedAudio() {
  "use strict";

  const VERSION = "NALVI_RECORDED_AUDIO_CLIENT_V1";
  const MANIFEST_URL = "assets/audio/guarani/ali-2026/manifest.json";
  const byLabel = new Map();
  const byId = new Map();
  let recordings = [];

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

  function indexLabel(value, recording) {
    const key = normalize(value);
    if (key && !byLabel.has(key)) byLabel.set(key, recording);
  }

  function indexRecording(recording) {
    if (!recording?.id || !recording?.file || recording.authorizedForPlayback !== true) return;
    const item = Object.freeze({ ...recording });
    byId.set(item.id, item);
    indexLabel(item.label, item);
    indexLabel(item.sourceFile?.replace(/\.m4a$/i, ""), item);
    const baseLabel = String(item.label || "").split("(")[0].trim();
    if (baseLabel && baseLabel !== item.label) indexLabel(baseLabel, item);
  }

  const ready = fetch(MANIFEST_URL, { cache: "no-cache" })
    .then(response => {
      if (!response.ok) throw new Error(`AUDIO_MANIFEST_HTTP_${response.status}`);
      return response.json();
    })
    .then(manifest => {
      recordings = Array.isArray(manifest?.recordings) ? manifest.recordings : [];
      recordings.forEach(indexRecording);
      return { version: manifest?.version || "", count: recordings.length };
    })
    .catch(error => {
      console.warn("NALVI_RECORDED_AUDIO_MANIFEST_UNAVAILABLE", String(error?.message || error));
      return { version: "", count: 0, error: String(error?.message || error) };
    });

  function resolve(value) {
    const item = byId.get(String(value || "")) || byLabel.get(normalize(value));
    if (!item) return null;
    return {
      ...item,
      url: new URL(`assets/audio/guarani/ali-2026/${item.file}`, document.baseURI).href
    };
  }

  function setButtonState(button, playing) {
    if (!(button instanceof Element)) return;
    button.classList.toggle("is-playing", playing);
    button.setAttribute("aria-pressed", String(playing));
  }

  function playPath(path, button) {
    const source = String(path || "").trim();
    if (!source) return false;
    const audio = new Audio(source);
    setButtonState(button, true);
    audio.addEventListener("ended", () => setButtonState(button, false), { once: true });
    audio.addEventListener("error", () => setButtonState(button, false), { once: true });
    audio.play().catch(error => {
      setButtonState(button, false);
      console.info("NALVI_RECORDED_AUDIO_PLAYBACK", String(error?.message || error));
    });
    return true;
  }

  function play(value, button) {
    const recording = resolve(value);
    return recording ? playPath(recording.url, button) : false;
  }

  const legacyPlayPronunciation = typeof window.playPronunciation === "function"
    ? window.playPronunciation.bind(window)
    : null;

  // Los audios ya integrados conservan prioridad. El nuevo corpus se consulta
  // únicamente cuando la función histórica no encuentra una grabación.
  window.playPronunciation = function playPronunciationWithRecordedFallback(value, button) {
    if (legacyPlayPronunciation && legacyPlayPronunciation(value, button)) return true;
    return play(value, button);
  };

  window.NALVI_RECORDED_AUDIO = Object.freeze({
    version: VERSION,
    ready,
    resolve,
    has: value => Boolean(resolve(value)),
    play,
    playPath,
    audit: () => ({
      version: VERSION,
      manifest: MANIFEST_URL,
      importedRecordings: recordings.length,
      indexedLabels: byLabel.size,
      preservesExistingAudioPriority: true
    })
  });
})();
