import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const experience = readFileSync(new URL("../nalvi-institutional-experience.js", import.meta.url), "utf8");
const notifications = readFileSync(new URL("../nalvi-notification-center.js", import.meta.url), "utf8");

test("community Firestore listeners start only when the Community view is visible", () => {
  assert.match(experience, /classList\.contains\("hide"\)\)return/);
  assert.match(experience, /function open\(push=true\).*connect\(\)/s);
  assert.doesNotMatch(experience, /installNavigation\(\);render\(\);connect\(\)/);
  assert.match(experience, /new MutationObserver\(\(\)=>\{if\(root\.classList\.contains\("hide"\)\)disconnect\(\);else connect\(\)\}\)/);
});

test("billing test route never starts Community or notification Firestore listeners", () => {
  assert.match(experience, /get\("billingTest"\)==="1"/);
  assert.match(notifications, /get\("billingTest"\)==="1"/);
});

test("notification listeners start when the user opens the bell, not at installation", () => {
  assert.match(notifications, /function toggle\(\).*state\.open=true;if\(signedIn\(\)\)connect\(\)/s);
  assert.doesNotMatch(notifications, /window\.addEventListener\("nalvi:auth-known",connect\)/);
  assert.doesNotMatch(notifications, /connect\(\);render\(\);document\.documentElement\.dataset\.nalviNotifications/);
});
