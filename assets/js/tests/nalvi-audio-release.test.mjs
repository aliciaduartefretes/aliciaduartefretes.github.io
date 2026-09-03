import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const manifest = JSON.parse(readFileSync(new URL("../../audio/guarani/ali-2026/manifest.json", import.meta.url), "utf8"));
const galleryHtml = readFileSync(new URL("../../../debug/activity-catalog.html", import.meta.url), "utf8");

test("las muestras inicial, media y final son M4A trackeados con content type audio/mp4", () => {
  for (const index of [0, 49, 98]) {
    const recording = manifest.recordings[index];
    const relativePath = `assets/audio/guarani/ali-2026/${recording.file}`;
    const trackedPath = execFileSync("git", ["ls-files", "--error-unmatch", relativePath], {
      cwd: root,
      encoding: "utf8"
    }).trim();
    const bytes = readFileSync(new URL(`../../audio/guarani/ali-2026/${recording.file}`, import.meta.url));

    assert.equal(trackedPath, relativePath, recording.id);
    assert.equal(recording.format, "audio/mp4", recording.id);
    assert.equal(recording.humanRecorded, true, recording.id);
    assert.equal(recording.authorizedForPlayback, true, recording.id);
    assert.ok(bytes.length > 12, recording.id);
    assert.equal(bytes.subarray(4, 8).toString("ascii"), "ftyp", recording.id);
  }
});

test("la galería declara superficies focales de escritorio y móvil para los 99 controles", () => {
  assert.match(galleryHtml, /<meta name="viewport" content="width=device-width,initial-scale=1">/);
  assert.match(galleryHtml, /99 audios humanos autorizados/);
  assert.match(galleryHtml, /recorded-audio-library__grid\{display:grid;grid-template-columns:repeat\(3/);
  assert.match(galleryHtml, /@media\(max-width:840px\)[\s\S]*recorded-audio-library__grid\{grid-template-columns:1fr/);
  assert.match(galleryHtml, /min-height:48px/);
  assert.match(galleryHtml, /una sola pista activa · sin síntesis/);
});
