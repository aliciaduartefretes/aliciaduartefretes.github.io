(function installNalviAudioAffordances() {
  "use strict";

  const VERSION = "NALVI_AUDIO_AFFORDANCES_V3";
  const COPY = Object.freeze({
    es: { ready: "Escuchar audio", loading: "Cargando audio", playing: "Pausar audio", paused: "Reiniciar audio", error: "Audio no disponible" },
    en: { ready: "Play audio", loading: "Loading audio", playing: "Pause audio", paused: "Restart audio", error: "Audio unavailable" },
    pt: { ready: "Ouvir áudio", loading: "Carregando áudio", playing: "Pausar áudio", paused: "Reiniciar áudio", error: "Áudio indisponível" },
    fr: { ready: "Écouter l’audio", loading: "Chargement de l’audio", playing: "Mettre l’audio en pause", paused: "Recommencer l’audio", error: "Audio indisponible" },
    it: { ready: "Ascolta l’audio", loading: "Caricamento audio", playing: "Metti in pausa l’audio", paused: "Riavvia l’audio", error: "Audio non disponibile" },
    de: { ready: "Audio abspielen", loading: "Audio wird geladen", playing: "Audio pausieren", paused: "Audio neu starten", error: "Audio nicht verfügbar" }
  });
  const TEXT_TARGETS = [
    ".dictionary-entry b", ".vocab b", ".pronoun b", ".bubble2 b", ".phrase-row b",
    ".medical-phrase b", ".police-phrase b", ".nalvi-dialogue-turn p"
  ].join(",");
  const BUTTON_TARGETS = [
    "button.answer", "button.kid-option", ".nalvi-choice-card", ".nalvi-match-column button",
    ".nalvi-sort-bank button", ".nalvi-sort-categories button", ".nalvi-tile-bank button",
    ".kuaa-match-option", ".kuaa-order-chip", "[data-kuaa-option]"
  ].join(",");
  let registry = null;
  let recordings = [];

  function locale() {
    const code = String(document.documentElement.lang || "es").toLowerCase().split("-")[0];
    return COPY[code] ? code : "es";
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[‘’`´ʼʹʻ]/g, "'")
      .replace(/[¿?¡!.,;:()\[\]{}\/]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase("es");
  }

  function baseLabel(recording) {
    return String(recording?.audioText || recording?.label || "").split("(")[0].trim();
  }

  function matchesText(recording, visibleText) {
    const text = normalize(visibleText);
    const label = normalize(baseLabel(recording));
    if (!text || !label) return false;
    if (text === label) return true;
    if (label.length < 3) return false;
    return ` ${text} `.includes(` ${label} `);
  }

  function recordingsForText(text) {
    const found = [];
    const seen = new Set();
    for (const recording of recordings) {
      if (!matchesText(recording, text) || seen.has(recording.audioId)) continue;
      seen.add(recording.audioId);
      found.push(recording);
      if (found.length === 3) break;
    }
    return found;
  }

  function configureButton(button, recording) {
    const labels = COPY[locale()];
    button.removeAttribute("data-pronounce");
    button.dataset.recordedAudioId = recording.audioId;
    button.dataset.audioState = "ready";
    button.dataset.audioLabelReady = labels.ready;
    button.dataset.audioLabelLoading = labels.loading;
    button.dataset.audioLabelPlaying = labels.playing;
    button.dataset.audioLabelPaused = labels.paused;
    button.dataset.audioLabelError = labels.error;
    button.setAttribute("aria-label", labels.ready);
    button.setAttribute("aria-pressed", "false");
    button.querySelector?.(".pronounce-icon,.answer-audio")?.setAttribute("data-audio-icon", "");
    return button;
  }

  function buttonMarkup(recording) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "nalvi-inline-audio";
    configureButton(button, recording);
    button.innerHTML = '<span data-audio-icon aria-hidden="true">🔊</span>';
    return button;
  }

  function addTextControls(element, matches) {
    if (!matches.length || element.dataset.recordedAudioEnhanced === "true") return;
    const dictionaryEntry = element.closest?.(".dictionary-entry");
    const existing = element.querySelector?.("[data-pronounce],[data-recorded-audio-id]")
      || dictionaryEntry?.querySelector("[data-pronounce],[data-recorded-audio-id]");
    if (existing) {
      configureButton(existing, matches[0]);
      element.dataset.recordedAudioEnhanced = "true";
      return;
    }
    const buttons = matches.map(buttonMarkup);
    if (dictionaryEntry) {
      const detail = dictionaryEntry.querySelector("small");
      buttons.forEach(button => dictionaryEntry.insertBefore(button, detail));
    } else {
      buttons.reverse().forEach(button => element.insertAdjacentElement("afterend", button));
    }
    element.dataset.recordedAudioEnhanced = "true";
  }

  function addButtonControl(button, matches) {
    if (!matches.length || button.dataset.recordedAudioEnhanced === "true") return;
    const recording = matches[0];
    button.dataset.recordedAudioEnhanced = "true";
    configureButton(button, recording);
    const existingIcon = button.querySelector?.(".answer-audio,.nalvi-option-audio");
    if (existingIcon) existingIcon.setAttribute("data-audio-icon", "");
    else button.insertAdjacentHTML("beforeend", '<span class="nalvi-option-audio" data-audio-icon aria-hidden="true">🔊</span>');
  }

  function enhance(root = document) {
    root.querySelectorAll?.(TEXT_TARGETS).forEach(element => addTextControls(element, recordingsForText(element.textContent)));
    root.querySelectorAll?.(BUTTON_TARGETS).forEach(button => addButtonControl(button, recordingsForText(button.textContent)));
  }

  async function play(button) {
    const audioId = button?.dataset?.recordedAudioId;
    if (!audioId || typeof registry?.play !== "function") return false;
    return registry.play(audioId, button);
  }

  async function init() {
    registry = window.NALVI_RECORDED_AUDIO;
    const status = await registry?.ready;
    if (!status?.ok) return;
    recordings = registry.list().filter(recording => recording.audioAuthorized === true && recording.humanRecorded === true);
    enhance();
    const observer = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
      if (node.nodeType !== 1) return;
      enhance(node.matches?.(TEXT_TARGETS) || node.matches?.(BUTTON_TARGETS) ? node.parentElement : node);
    })));
    // NALVI reemplaza algunas superficies completas al cambiar de curso o lección.
    // Observar body mantiene el audio contextual activo también después de esos cambios.
    observer.observe(document.body, { childList: true, subtree: true });
    document.documentElement.dataset.nalviAudioAffordances = VERSION;
  }

  document.addEventListener("click", event => {
    const button = event.target.closest?.("[data-recorded-audio-id]");
    if (!button) return;
    if (button.classList.contains("nalvi-inline-audio")) {
      event.preventDefault();
      event.stopPropagation();
    }
    play(button);
  }, true);

  window.NALVI_AUDIO_AFFORDANCES = Object.freeze({ VERSION, enhance, recordingsForText, play });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
