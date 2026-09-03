import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compileKnowledgeBase, createGrammarEngine } from "../grammar-engine/grammar-engine.mjs";

const root = new URL("../", import.meta.url);
const readJson = async relativePath => JSON.parse(await readFile(new URL(relativePath, root), "utf8"));
const [corpus, governance, compiled, readiness] = await Promise.all([
  readJson("knowledge-base/pilot-corpus.json"),
  readJson("knowledge-base/governance.json"),
  readJson("grammar-engine/compiled-knowledge.json"),
  readJson("human-review/pre-8c-grammar-readiness.json")
]);

const patterns = corpus.records.filter(record => record.recordType === "conjugationPattern");
const normativePatterns = patterns.filter(record => record.validationStatus === "normativeVerified");
const productivePatterns = patterns.filter(record =>
  ["normativeVerified", "expertVerified"].includes(record.validationStatus) &&
  record.allowedForGeneration === true &&
  !(record.conflictIds || []).length &&
  record.normativeVerification?.conjugationGeneration !== false
);
const productivePatternIds = new Set(productivePatterns.map(record => record.id));
const productiveVerbs = corpus.records.filter(record =>
  record.recordType === "lexeme" &&
  record.partOfSpeech?.includes("verb") &&
  record.verbData &&
  ["normativeVerified", "expertVerified"].includes(record.validationStatus) &&
  record.allowedForGeneration === true &&
  !(record.conflictIds || []).length &&
  productivePatternIds.has(record.verbData.patternId)
);

assert.equal(corpus.records.filter(record =>
  record.recordType === "lexeme" &&
  record.validationStatus === "normativeVerified" &&
  record.allowedForGeneration === true
).length, 20, "Los 20 sentidos léxicos habilitados no deben alterarse.");

assert.equal(normativePatterns.length, 1);
assert.equal(normativePatterns[0].id, "CP-AREAL-001");
assert.equal(normativePatterns[0].allowedForGeneration, false);
assert.equal(normativePatterns[0].normativeVerification.verificationScope, "conjugationPattern");
assert.deepEqual(normativePatterns[0].normativeVerification.authorizedPatternComponents, [
  "personMarkers",
  "inclusiveExclusive",
  "oralNasalInclusiveAlternation"
]);
assert.equal(normativePatterns[0].normativeVerification.conjugationGeneration, false);
assert.equal(normativePatterns[0].personMarkers.length, 7);
assert.deepEqual(normativePatterns[0].personMarkers.find(marker => marker.clusivity === "inclusive"), {
  person: "1",
  number: "plural",
  clusivity: "inclusive",
  marker: "ja-/ña-",
  oralVariant: "ja-",
  nasalVariant: "ña-"
});

assert.equal(productivePatterns.length, 0);
assert.equal(productiveVerbs.length, 0);
assert.equal(readiness.realVerbFormsAvailable, 0);
assert.equal(readiness.paso8CMayStart, false);
assert.deepEqual(readiness.dependencies.C001, "BLOCKED");
assert.deepEqual(readiness.dependencies.C002, "BLOCKED");

const rebuilt = compileKnowledgeBase({ corpus, governance });
assert.deepEqual(compiled, rebuilt, "compiled-knowledge.json debe corresponder al corpus actual.");
assert.deepEqual(compiled.grammarReadiness, {
  normativeVerifiedConjugationPatterns: 1,
  expertVerifiedConjugationPatterns: 0,
  productiveConjugationPatterns: 0,
  productiveVerbLemmas: 0,
  realVerbFormsAvailable: 0,
  paso8CMayStart: false,
  blockingReason: "No hay lemas verbales productivos ni reglas de realización normativa autorizadas."
});

const engine = createGrammarEngine({ corpus, governance });
const unreviewed = engine.getValidatedVerbForm("LEX-CANDIDATE-JAJOTOPATA", "1sg");
const missing = engine.getValidatedVerbForm("NO-EXISTE", "1sg");
const c001 = engine.getValidatedVerbForm("CP-HAREAL-001", "1sg");
const c002 = engine.getValidatedVerbForm("CP-AIREAL-001", "1sg");
assert.equal(unreviewed.status, "reviewRequired");
assert.equal(unreviewed.form, null);
assert.equal(missing.status, "unavailable");
assert.equal(missing.form, null);
assert.equal(c001.status, "conflict");
assert.deepEqual(c001.conflictIds, ["C-001"]);
assert.equal(c002.status, "conflict");
assert.deepEqual(c002.conflictIds, ["C-002"]);

console.log(JSON.stringify({
  step: "PRE-8C-grammar-readiness",
  status: "PASS_WITH_GATE_CLOSED",
  normativeVerifiedConjugationPatterns: normativePatterns.length,
  productiveConjugationPatterns: productivePatterns.length,
  productiveVerbLemmas: productiveVerbs.length,
  documentedPersonSlots: normativePatterns[0].personMarkers.length,
  oralNasalVariants: { scope: "1pl-inclusive-marker-only", oral: "ja-", nasal: "ña-" },
  realVerbFormsAvailable: 0,
  enabledCombinationsExecutedWithGetValidatedVerbForm: 0,
  blockedChecks: {
    unreviewed: unreviewed.status,
    missing: missing.status,
    C001: c001.status,
    C002: c002.status
  },
  paso8CMayStart: false,
  openAIUsed: false,
  firebaseChanged: false,
  lexicalPilotChanged: false
}, null, 2));
