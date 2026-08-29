import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const index = read("index.html");
const client = read("assets/js/nalvi-reinforcement-client.js");
const server = read("server/reinforcement-engine.mjs");
const endpoint = read("api/generate-reinforcement-activity.js");
const policy = JSON.parse(read("policies/ai-usage-policy.json"));
const corpus = JSON.parse(read("knowledge-base/pilot-corpus.json"));

assert.match(index, /assets\/js\/nalvi-reinforcement-client\.js/);
assert.match(client, /generateReinforcementActivity/);
assert.match(client, /canResolveWithoutAI/);
assert.match(client, /\/api\/generate-reinforcement-activity/);
assert.doesNotMatch(index + client, /OPENAI_API_KEY|sk-[A-Za-z0-9_-]{12,}/);
assert.match(server, /AUTHORIZED_STATUSES/);
assert.ok(policy.linguisticGenerationGate.allowedValidationStatuses.includes("normativeVerified"));
assert.ok(policy.linguisticGenerationGate.allowedValidationStatuses.includes("expertVerified"));
assert.match(server, /allowedForGeneration === true/);
for (const status of ["unreviewed", "sourceVerified", "conflict", "rejected", "deprecated"]) assert.ok(policy.linguisticGenerationGate.blockedStatuses.includes(status));
assert.equal(policy.authorizedFunction, "generateReinforcementActivity");
assert.equal(policy.clientSideApiKeyAllowed, false);
assert.match(endpoint, /identitytoolkit\.googleapis\.com/);
assert.match(endpoint, /sameOrigin/);
assert.match(endpoint, /RATE_LIMIT/);
assert.match(server, /OPENAI_NOT_CONFIGURED/);
assert.match(server, /OPENAI_OUTPUT_REJECTED/);
assert.match(server, /OPENAI_UNAVAILABLE/);
assert.match(server, /mode: "fallback"/);
assert.match(server, /prompt_cache_key/);
assert.match(client, /localStorage/);
assert.equal((corpus.records || []).filter(record => record.validationStatus === "normativeVerified" && record.allowedForGeneration === true).length, 20);
for (const language of ["es", "en", "pt", "fr", "it", "de"]) assert.match(client, new RegExp(`\\"${language}\\"`));

for (const file of ["assets/js/nalvi-reinforcement-client.js", "api/generate-reinforcement-activity.js", "server/reinforcement-engine.mjs"]) {
  const result = spawnSync(process.execPath, ["--check", new URL(file, root).pathname], { encoding: "utf8" });
  assert.equal(result.status, 0, `${file}: ${result.stderr}`);
}

const tests = spawnSync(process.execPath, ["--test", new URL("ai/tests/reinforcement-engine.test.mjs", root).pathname], { encoding: "utf8" });
assert.equal(tests.status, 0, tests.stdout + tests.stderr);

console.log(JSON.stringify({
  step: "7B",
  status: "PASS",
  authorizedFunction: policy.authorizedFunction,
  currentNormativeGenerationRecords: 20,
  currentExpertGenerationRecords: 0,
  mockedOpenAICallsDuringValidation: 1,
  openAICallsAgainstRealService: 0,
  interfaceLanguages: ["es", "en", "pt", "fr", "it", "de"],
  tests: 8
}, null, 2));
