import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = readFileSync(new URL("../nalvi-audio-affordances.js", import.meta.url), "utf8");
const style = readFileSync(new URL("../../css/nalvi-audio-affordances.css", import.meta.url), "utf8");
const index = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
const ui = readFileSync(new URL("../nalvi-ui.js", import.meta.url), "utf8");

test("el registro humano alimenta diccionario y superficies de ejercicios", () => {
  assert.match(script, /const TEXT_TARGETS = \[/);
  assert.match(script, /\.dictionary-entry b/);
  assert.match(script, /\.nalvi-dialogue-turn p/);
  assert.match(script, /const BUTTON_TARGETS = \[/);
  for (const selector of ["button.answer", ".nalvi-choice-card", ".nalvi-match-column button", ".nalvi-sort-bank button", ".kuaa-order-chip"]) {
    assert.match(script, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(script, /registry\.list\(\)\.filter/);
  assert.match(script, /registry\.play\(audioId, button\)/);
  assert.match(script, /removeAttribute\("data-pronounce"\)/);
  assert.match(script, /observer\.observe\(document\.body/);
});

test("los controles públicos muestran solo un icono y ocultan datos internos", () => {
  assert.match(script, /className = "nalvi-inline-audio"/);
  assert.match(script, /data-audio-icon aria-hidden="true">🔊/);
  assert.doesNotMatch(script, /data-audio-label/);
  assert.doesNotMatch(script, /textContent\s*=\s*recording\.(?:audioId|audioPath|file|source)/);
  assert.match(ui, /\^Fuente\\s\+Ñe\['’\]ẽryru/);
  assert.match(index, /nalvi-ui\.js\?v=NALVI-UI-2/);
});

test("la página carga las affordances después del registro autorizado", () => {
  const registry = index.indexOf("nalvi-recorded-audio.js?v=NALVI-AUDIO-4");
  const affordances = index.indexOf("nalvi-audio-affordances.js?v=NALVI-AUDIO-AFFORDANCES-3");
  assert.ok(registry > 0);
  assert.ok(affordances > registry);
  assert.match(index, /nalvi-audio-affordances\.css\?v=NALVI-AUDIO-AFFORDANCES-3/);
});

test("la búsqueda española de sombrilla alcanza la entrada con audio autorizado", () => {
  assert.match(index, /umbrellaEntry\[1\] \+= ", sombrilla"/);
});
