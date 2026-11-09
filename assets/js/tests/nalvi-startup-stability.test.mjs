import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

const index = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
const loader = readFileSync(new URL("../nalvi-3d-loader.js", import.meta.url), "utf8");

test("the fictitious payment course is no longer mounted in the public app", () => {
  assert.doesNotMatch(index, /nalvi-one-time-course\.(?:js|css)/);
});

test("the initial document stays compact and defers the heavy 3D engine", () => {
  assert.ok(statSync(new URL("../../../index.html", import.meta.url)).size < 1_200_000);
  assert.match(index, /nalvi-3d-loader\.js/);
  assert.doesNotMatch(index, /three-r152\.min\.js/);
  assert.match(loader, /ensureGame/);
  assert.match(loader, /nalvi-children-3d\.js/);
});

test("general lessons recover if an intervention never replaces the hidden answer button", () => {
  assert.match(index, /lesson_watchdog_recovered/);
  assert.match(index, /document\.body\.contains\(button\)/);
  assert.match(index, /restartGeneralPractice\(sourceIndex\)/);
});
