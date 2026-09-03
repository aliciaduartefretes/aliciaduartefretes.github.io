import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {compileKnowledgeBase, createGrammarEngine} from "../grammar-engine.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const corpus = JSON.parse(fs.readFileSync(path.join(root, "knowledge-base/pilot-corpus.json"), "utf8"));
const governance = JSON.parse(fs.readFileSync(path.join(root, "knowledge-base/governance.json"), "utf8"));
const productionEngine = createGrammarEngine({corpus, governance});

const reference = {
  sourceId: "TEST-SOURCE",
  sourceTitle: "Fuente ficticia exclusiva de pruebas técnicas",
  sourceAuthor: "NALVI test suite",
  sourceInstitution: "NALVI",
  sourceYear: 2026,
  sourceURL: "urn:nalvi:test-only",
  sourcePage: "fixture",
  sourceLocatorType: "section",
  validationStatus: "expertVerified"
};

const common = (id, recordType, overrides = {}) => ({
  id,
  recordType,
  languageVariant: "gug-PY",
  validationStatus: "expertVerified",
  allowedForGeneration: true,
  sourceReferences: [reference],
  createdAt: "2026-08-27T00:00:00Z",
  updatedAt: "2026-08-27T00:00:00Z",
  ...overrides
});

const testPattern = common("TEST-PATTERN", "conjugationPattern", {
  officialLabel: "TEST-ONLY",
  pedagogicalAliases: [],
  personMarkers: [
    {person: "1", number: "singular", clusivity: null, marker: "T1-", oralVariant: null, nasalVariant: null},
    {person: "1", number: "plural", clusivity: "inclusive", marker: "TO-/TN-", oralVariant: "TO-", nasalVariant: "TN-"},
    {person: "1", number: "plural", clusivity: "exclusive", marker: "TX-", oralVariant: null, nasalVariant: null}
  ],
  stemBehavior: "Fixture no lingüístico: verifica la composición explícita sin afirmar formas guaraníes.",
  negativePattern: {status: "unreviewed", ruleIds: []},
  voiceRuleIds: [],
  tenseAspectModeRuleIds: [],
  eligibleLexemeIds: ["TEST-VERB"],
  conflictIds: [],
  morphemeSlots: [
    {id: "personMarker", function: "personIndex", position: "prefix"},
    {id: "stem", function: "lexicalRoot", position: "root"}
  ],
  realizationRules: [
    {
      id: "TEST-RULE-CONCAT",
      validationStatus: "expertVerified",
      allowedForGeneration: true,
      sourceReferences: [reference],
      conditions: {},
      operation: {type: "orderedMorphemes", order: ["personMarker", "stem"], separator: ""},
      transformations: []
    }
  ]
});

const testVerb = common("TEST-VERB", "lexeme", {
  normalizedForm: "TEST-LEXEME-NOT-GUARANI",
  sourceForms: [],
  partOfSpeech: ["verb"],
  senses: [{id: "test", definitionGuarani: null, glossEs: "fixture", register: ["unknown"], contexts: ["testOnly"], professionalDomains: [], exampleIds: []}],
  pedagogicalLevel: "unassigned",
  variants: [],
  frequency: {status: "unmeasured", method: null, corpusId: null, queryDate: null, rawCount: null, normalizedRate: null, coverageWarning: "Solo prueba técnica."},
  verbData: {
    patternId: "TEST-PATTERN",
    transitivity: ["unknown"],
    stemBehavior: "invariable",
    oralNasal: "mixed",
    underlyingForm: "ROOT",
    morphemes: [],
    exceptions: [],
    validatedForms: [],
    irregularForms: [],
    allowedVoices: []
  },
  termStatus: null
});

const testOrderRule = common("TEST-RULE-ORDER", "linguisticRule", {
  domain: "syntax",
  topic: "Fixture de orden abstracto",
  statement: "A precede a B en esta prueba abstracta.",
  constraints: ["No representa una regla del guaraní."],
  appliesTo: ["test-order"],
  exceptions: [],
  oralNasalCondition: "notApplicable",
  morphemeOrder: ["A", "B"],
  exampleIds: [],
  conflictIds: []
});

const makeTestEngine = (extraRecords = []) => createGrammarEngine({
  corpus: {
    schemaVersion: "test-only",
    languageVariant: "gug-PY",
    records: [testPattern, testVerb, testOrderRule, ...extraRecords]
  },
  governance: {
    generationGate: {
      requiredValidationStatus: "expertVerified",
      requiresAllowedForGeneration: true,
      requiresNoOpenConflict: true
    },
    blockedConflicts: [],
    unknownDataPolicy: "No inventar."
  }
});

test("compila el inventario areal normativo sin habilitar conjugaciones", () => {
  const compiled = compileKnowledgeBase({corpus, governance});
  assert.deepEqual(compiled.conjugationPatterns.map(pattern => pattern.name), ["Areal", "Aireal", "Hareal"]);
  const areal = compiled.conjugationPatterns.find(pattern => pattern.id === "CP-AREAL-001");
  assert.equal(areal.validationStatus, "normativeVerified");
  assert.deepEqual(areal.verifiedComponents, ["personMarkers", "inclusiveExclusive", "oralNasalInclusiveAlternation"]);
  assert.equal(areal.conjugationGenerationAuthorized, false);
  assert.equal(areal.allowedForGeneration, false);
  assert.equal(compiled.conjugationPatterns.filter(pattern => pattern.allowedForGeneration).length, 0);
  assert.deepEqual(compiled.grammarReadiness, {
    normativeVerifiedConjugationPatterns: 1,
    expertVerifiedConjugationPatterns: 0,
    productiveConjugationPatterns: 0,
    productiveVerbLemmas: 0,
    realVerbFormsAvailable: 0,
    paso8CMayStart: false,
    blockingReason: "No hay lemas verbales productivos ni reglas de realización normativa autorizadas."
  });
  assert.equal(compiled.openAIConnected, false);
});

test("un verbo inexistente devuelve unavailable", () => {
  const result = productionEngine.getValidatedVerbForm("NO-EXISTE", "1sg");
  assert.equal(result.status, "unavailable");
  assert.equal(result.form, null);
  assert.equal(result.reason, "verbNotFound");
});

test("contenido pedagógico unreviewed exige revisión", () => {
  const result = productionEngine.getValidatedVerbForm("LEX-CANDIDATE-JAJOTOPATA", "1sg");
  assert.equal(result.status, "reviewRequired");
  assert.equal(result.form, null);
  assert.equal(result.validationStatus, "unreviewed");
});

test("un verbo areal sourceVerified no se vuelve productivo automáticamente", () => {
  const candidate = common("TEST-AREAL-CANDIDATE", "lexeme", {
    validationStatus: "sourceVerified",
    allowedForGeneration: false,
    normalizedForm: "TEST",
    partOfSpeech: ["verb"],
    senses: [{id: "test", glossEs: "fixture"}],
    variants: [],
    frequency: {status: "unmeasured", method: null, coverageWarning: "fixture"},
    verbData: {patternId: "CP-AREAL-001", transitivity: ["unknown"], stemBehavior: "requiresReview"}
  });
  const engine = createGrammarEngine({
    corpus: {...corpus, records: [...corpus.records, candidate]},
    governance
  });
  const result = engine.getValidatedVerbForm(candidate.id, "1sg");
  assert.equal(result.status, "reviewRequired");
  assert.equal(result.form, null);
});

test("la controversia aireal C-002 devuelve conflict", () => {
  const candidate = common("TEST-AIREAL-CANDIDATE", "lexeme", {
    normalizedForm: "TEST",
    partOfSpeech: ["verb"],
    senses: [{id: "test", glossEs: "fixture"}],
    variants: [],
    frequency: {status: "unmeasured", method: null, coverageWarning: "fixture"},
    verbData: {patternId: "CP-AIREAL-001", transitivity: ["unknown"], stemBehavior: "requiresReview"}
  });
  const engine = createGrammarEngine({corpus: {...corpus, records: [...corpus.records, candidate]}, governance});
  const result = engine.getValidatedVerbForm(candidate.id, "1sg");
  assert.equal(result.status, "conflict");
  assert.deepEqual(result.conflictIds, ["C-002"]);
  assert.equal(result.form, null);
});

test("la controversia de clasificación C-001 mantiene hareal bloqueado", () => {
  const candidate = common("TEST-HAREAL-CANDIDATE", "lexeme", {
    normalizedForm: "TEST",
    partOfSpeech: ["verb"],
    senses: [{id: "test", glossEs: "fixture"}],
    variants: [],
    frequency: {status: "unmeasured", method: null, coverageWarning: "fixture"},
    verbData: {patternId: "CP-HAREAL-001", transitivity: ["unknown"], stemBehavior: "requiresReview"}
  });
  const engine = createGrammarEngine({corpus: {...corpus, records: [...corpus.records, candidate]}, governance});
  const result = engine.getValidatedVerbForm(candidate.id, "1sg");
  assert.equal(result.status, "conflict");
  assert.deepEqual(result.conflictIds, ["C-001"]);
});

test("inclusivo oral y nasal usan variantes explícitas en una fixture no lingüística", () => {
  const engine = makeTestEngine();
  const oral = engine.getValidatedVerbForm("TEST-VERB", "1pl-inclusive", {oralNasal: "oral"});
  const nasal = engine.getValidatedVerbForm("TEST-VERB", "1pl-inclusive", {oralNasal: "nasal"});
  assert.equal(oral.status, "available");
  assert.equal(oral.form, "TO-ROOT");
  assert.equal(nasal.status, "available");
  assert.equal(nasal.form, "TN-ROOT");
  assert.equal(oral.lemma, "TEST-LEXEME-NOT-GUARANI");
  assert.deepEqual(oral.person, {person: "1", number: "plural", clusivity: "inclusive"});
  assert.deepEqual(oral.pattern, {id: "TEST-PATTERN", name: "TEST-ONLY"});
  assert.deepEqual(oral.morphemes.map(morpheme => morpheme.function), ["personIndex", "lexicalRoot"]);
});

test("exclusivo se distingue de inclusivo", () => {
  const result = makeTestEngine().getValidatedVerbForm("TEST-VERB", "1pl-exclusive", {oralNasal: "oral"});
  assert.equal(result.status, "available");
  assert.equal(result.form, "TX-ROOT");
});

test("el motor no concatena lexema y prefijo sin regla computable explícita", () => {
  const noRulePattern = {...testPattern, id: "TEST-PATTERN-NO-RULE", realizationRules: []};
  const noRuleVerb = {...testVerb, id: "TEST-VERB-NO-RULE", verbData: {...testVerb.verbData, patternId: noRulePattern.id}};
  const engine = makeTestEngine([noRulePattern, noRuleVerb]);
  const result = engine.getValidatedVerbForm(noRuleVerb.id, "1sg");
  assert.equal(result.status, "unavailable");
  assert.equal(result.reason, "missingComputableRealizationRule");
  assert.equal(result.form, null);
});

test("una persona gramatical inválida se rechaza sin inferencias", () => {
  const result = makeTestEngine().getValidatedVerbForm("TEST-VERB", "4sg");
  assert.equal(result.status, "unavailable");
  assert.equal(result.reason, "invalidGrammaticalPerson");
});

test("la posesión documentada pero no experta devuelve reviewRequired", () => {
  const result = productionEngine.validateSentenceStructure({
    constructionType: "possession",
    constituents: [{role: "possessor"}, {role: "possessed"}],
    tokensValidated: true
  });
  assert.equal(result.status, "reviewRequired");
  assert.equal(result.form, null);
});

test("negación, interrogación y mandato permanecen unavailable sin reglas validadas", () => {
  for (const constructionType of ["negation", "interrogation", "mandate"]) {
    const result = productionEngine.validateSentenceStructure({
      constructionType,
      constituents: [],
      tokensValidated: true
    });
    assert.equal(result.status, "unavailable");
    assert.equal(result.reason, "validatedStructureRuleNotFound");
  }
});

test("palabras correctas no vuelven correcta una estructura incorrecta", () => {
  const result = makeTestEngine().validateSentenceStructure({
    constructionType: "test-order",
    constituents: [{role: "B"}, {role: "A"}],
    tokensValidated: true
  });
  assert.equal(result.status, "invalid");
  assert.equal(result.valid, false);
  assert.equal(result.tokensValidated, true);
});

test("una estructura abstracta correcta se valida solo con una regla experta explícita", () => {
  const result = makeTestEngine().validateSentenceStructure({
    constructionType: "test-order",
    constituents: [{role: "A"}, {role: "B"}],
    tokensValidated: true
  });
  assert.equal(result.status, "valid");
  assert.equal(result.appliedRule, "TEST-RULE-ORDER");
  assert.equal(result.canResolveWithoutAI, true);
  assert.equal(result.aiPermitted, false);
});

test("el motor declara que OpenAI no está conectado", () => {
  assert.equal(productionEngine.policy.openAIConnected, false);
  assert.equal(productionEngine.policy.inventUnknownForms, false);
  assert.equal(productionEngine.policy.conflictUseBlocked, true);
});
