import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { compileKnowledgeBase, createGrammarEngine } from "../grammar-engine/grammar-engine.mjs";
import { filterAllowedKnowledge } from "../server/reinforcement-engine.mjs";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");
const readJson = path => read(path).then(JSON.parse);
const [corpus, governance, policy, dossier, compiled, html, debugHtml] = await Promise.all([
  readJson("knowledge-base/pilot-corpus.json"),
  readJson("knowledge-base/governance.json"),
  readJson("policies/ai-usage-policy.json"),
  readJson("human-review/paso-8b-5-corpus-piloto-candidatos.json"),
  readJson("grammar-engine/compiled-knowledge.json"),
  read("index.html"),
  read("adaptive-intervention-plan/debug/index.html")
]);

const normative = corpus.records.filter(record => record.validationStatus === "normativeVerified");
const normativeLexical = normative.filter(record => record.recordType === "lexeme");
const normativeGrammar = normative.filter(record => record.recordType === "conjugationPattern" || record.recordType === "linguisticRule");
const expert = corpus.records.filter(record => record.validationStatus === "expertVerified");
const authorized = filterAllowedKnowledge(corpus.records, corpus.records.map(record => record.id));
assert.equal(normativeLexical.length, 20);
assert.equal(normativeGrammar.length, 1);
assert.equal(expert.length, 0);
assert.equal(authorized.length, 20);
assert.ok(authorized.every(record => record.allowedForGeneration === true));
assert.deepEqual(policy.linguisticGenerationGate.allowedValidationStatuses, ["normativeVerified", "expertVerified"]);
assert.deepEqual(governance.generationGate.allowedValidationStatuses, ["normativeVerified", "expertVerified"]);
assert.equal(governance.normativeVerifiedIsHumanExpertReview, false);

for (const record of normativeLexical) {
  const verification = record.normativeVerification;
  assert.equal(verification.method, "direct-normative-source-check");
  assert.equal(verification.sourceAuthorityLevel, "A");
  assert.equal(verification.humanExpertReview, false);
  assert.ok(verification.sourceId && verification.sourcePage);
  assert.deepEqual(verification.openConflictIds, []);
  assert.deepEqual(verification.authorizedSenseIds, ["sense-1"]);
  assert.equal(verification.sentenceGeneration, false);
  assert.equal(verification.exampleGeneration, false);
  assert.equal(verification.conjugationGeneration, false);
  assert.equal(record.senses.length, 1);
  assert.equal(record.sourceReferences[0].sourcePage, verification.sourcePage);
  assert.equal(record.review, undefined, "No debe fingirse revisión experta humana.");
}

assert.equal(dossier.normativeAdjustment.readyReviewed, 25);
assert.equal(dossier.normativeAdjustment.normativeVerified, 20);
assert.equal(dossier.normativeAdjustment.deferred, 5);
assert.equal(dossier.normativeAdjustment.newCandidatesSearched, 0);
assert.equal(dossier.normativeAdjustment.needsMoreEvidenceModified, false);
assert.equal(dossier.normativeAdjustment.blockedModified, false);
for (const id of dossier.normativeAdjustment.deferredIds) {
  assert.equal(corpus.records.some(record => record.id === id), false, `${id} no debía importarse.`);
}

for (const conflictId of ["C-001", "C-002"]) {
  const conflict = corpus.records.find(record => record.id === conflictId);
  assert.equal(conflict.validationStatus, "conflict");
  assert.equal(conflict.allowedForGeneration, false);
  assert.equal(filterAllowedKnowledge(corpus.records, [conflictId]).length, 0);
}
for (const id of ["CP-AREAL-001", "RULE-POSSESSION-001", "LEX-CANDIDATE-AGUYJE", "NO-EXISTE"]) {
  assert.equal(filterAllowedKnowledge(corpus.records, [id]).length, 0, `${id} debe permanecer bloqueado.`);
}

const rebuilt = compileKnowledgeBase({ corpus, governance });
assert.deepEqual(compiled, rebuilt);
assert.deepEqual(compiled.authorizationSummary, { normativeVerified: 21, expertVerified: 0, allowedForGeneration: 20 });
assert.equal(compiled.conjugationPatterns.filter(pattern => pattern.allowedForGeneration).length, 0);
const engine = createGrammarEngine({ corpus, governance });
assert.deepEqual(engine.policy.productiveValidationStatuses, ["normativeVerified", "expertVerified"]);
assert.equal(engine.getValidatedVerbForm("LEX-PILOT-ARANDUKA-001", "1sg").status, "unavailable");
assert.equal(engine.getValidatedVerbForm("CP-AIREAL-001", "1sg").status, "conflict");

for (const language of ["es", "en", "pt", "fr", "it", "de"]) {
  assert.match(html, new RegExp(`<option value=["']${language}["']`));
  assert.match(debugHtml, new RegExp(`<option>${language}</option>`));
}
assert.doesNotMatch(html, /sk-[A-Za-z0-9_-]{16,}/);
assert.match(debugHtml, /LEX-PILOT-ARANDUKA-001/);
assert.match(debugHtml, /type:"matching"/);
assert.match(debugHtml, /type:"writing"/);

for (const file of [
  "grammar-engine/grammar-engine.mjs",
  "server/reinforcement-engine.mjs",
  "server/intervention-service.mjs",
  "server/adaptive-intervention-plan.mjs",
  "scripts/activate-normative-pilot.mjs"
]) {
  const result = spawnSync(process.execPath, ["--check", new URL(file, root).pathname], { encoding: "utf8" });
  assert.equal(result.status, 0, `${file}: ${result.stderr}`);
}

for (const suite of [
  "ai/tests/reinforcement-engine.test.mjs",
  "intervention-engine/tests/intervention-engine.test.mjs",
  "server/tests/adaptive-intervention-plan.test.mjs",
  "server/tests/normative-pilot-activation.test.mjs"
]) {
  const result = spawnSync(process.execPath, ["--test", new URL(suite, root).pathname], { encoding: "utf8" });
  assert.equal(result.status, 0, `${suite}:\n${result.stdout}${result.stderr}`);
}

console.log(JSON.stringify({
  step: "8B.5-normative-adjustment",
  status: "PASS",
  normativeVerifiedLexical: normativeLexical.length,
  normativeVerifiedGrammar: normativeGrammar.length,
  expertVerified: expert.length,
  allowedForGeneration: authorized.length,
  deferred: dossier.normativeAdjustment.deferred,
  grammarRulesPromoted: 0,
  conjugationEnabled: false,
  openConflictsBlocked: ["C-001", "C-002"],
  uiLocales: ["es", "en", "pt", "fr", "it", "de"],
  liveOpenAICall: false,
  structuredProviderResponseSimulated: true,
  firebaseChanged: false,
  indexModified: false
}, null, 2));
