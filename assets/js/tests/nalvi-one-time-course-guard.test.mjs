import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../nalvi-one-time-course.js", import.meta.url), "utf8");

test("checkout starts only after the server confirms that access is available but unpaid", () => {
  assert.match(source, /catch\(error\).*NALVI_ONE_TIME_ACCESS.*return null/s);
  assert.match(source, /const purchased=await checkAccess\(\);if\(purchased===false\)await startCheckout\(\)/);
  assert.doesNotMatch(source, /if\(!purchased\)await startCheckout\(\)/);
});
