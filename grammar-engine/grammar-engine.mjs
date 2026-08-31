const VALIDATION_STATUSES = new Set([
  "unreviewed",
  "sourceVerified",
  "normativeVerified",
  "expertVerified",
  "conflict",
  "rejected",
  "deprecated"
]);

const PRODUCTIVE_STATUSES = new Set(["normativeVerified", "expertVerified"]);
const DEFAULT_PRODUCTIVE_STATUSES = [...PRODUCTIVE_STATUSES];

const hasNormativeVerification = record => {
  if (record?.validationStatus !== "normativeVerified") return true;
  const verification = record?.normativeVerification;
  const scope = verification?.verificationScope ||
    (record?.recordType === "lexeme" ? "lexicalSense" : null);
  const scopeIsAuthorized =
    (scope === "lexicalSense" &&
      Array.isArray(verification?.authorizedSenseIds) &&
      verification.authorizedSenseIds.length > 0) ||
    (scope === "conjugationPattern" &&
      Array.isArray(verification?.authorizedPatternComponents) &&
      verification.authorizedPatternComponents.length > 0) ||
    (scope === "linguisticRule" &&
      Array.isArray(verification?.authorizedRuleComponents) &&
      verification.authorizedRuleComponents.length > 0);
  return verification?.method === "direct-normative-source-check" &&
    verification?.sourceAuthorityLevel === "A" &&
    typeof verification?.sourceId === "string" && verification.sourceId.length > 0 &&
    typeof verification?.sourcePage === "string" && verification.sourcePage.length > 0 &&
    verification?.humanExpertReview === false &&
    Array.isArray(verification?.openConflictIds) && verification.openConflictIds.length === 0 &&
    Array.isArray(verification?.authorizedUses) && verification.authorizedUses.length > 0 &&
    scopeIsAuthorized;
};

const productiveValidationStatus = record =>
  PRODUCTIVE_STATUSES.has(record?.validationStatus) && hasNormativeVerification(record);

const uniqueReferences = references => {
  const seen = new Set();
  return (references || []).filter(reference => {
    const key = `${reference.sourceId || ""}:${reference.sourcePage || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const unavailableResult = (reason, extra = {}) => ({
  status: "unavailable",
  form: null,
  lemma: null,
  person: null,
  pattern: null,
  appliedRule: null,
  source: [],
  validationStatus: null,
  canResolveWithoutAI: false,
  aiPermitted: false,
  reason,
  ...extra
});

const reviewResult = (record, reason, extra = {}) => ({
  status: "reviewRequired",
  form: null,
  lemma: null,
  person: null,
  pattern: null,
  appliedRule: null,
  source: uniqueReferences(record?.sourceReferences),
  validationStatus: record?.validationStatus || "unreviewed",
  canResolveWithoutAI: false,
  aiPermitted: false,
  reason,
  ...extra
});

const conflictResult = (record, conflictIds, extra = {}) => ({
  status: "conflict",
  form: null,
  lemma: null,
  person: null,
  pattern: null,
  appliedRule: null,
  source: uniqueReferences(record?.sourceReferences),
  validationStatus: "conflict",
  canResolveWithoutAI: false,
  aiPermitted: false,
  reason: "openConflict",
  conflictIds,
  needsHumanReview: true,
  ...extra
});

const normalizePerson = grammaticalPerson => {
  if (typeof grammaticalPerson === "string") {
    const match = grammaticalPerson.match(/^([123])(sg|pl)(?:-(inclusive|exclusive))?$/);
    if (!match) return null;
    return {
      person: match[1],
      number: match[2] === "sg" ? "singular" : "plural",
      clusivity: match[3] || null
    };
  }

  if (!grammaticalPerson || typeof grammaticalPerson !== "object") return null;
  const normalized = {
    person: String(grammaticalPerson.person || ""),
    number: grammaticalPerson.number || null,
    clusivity: grammaticalPerson.clusivity || null
  };
  if (!["1", "2", "3"].includes(normalized.person)) return null;
  if (!["singular", "plural"].includes(normalized.number)) return null;
  if (normalized.clusivity && !["inclusive", "exclusive"].includes(normalized.clusivity)) return null;
  if (normalized.clusivity && !(normalized.person === "1" && normalized.number === "plural")) return null;
  if (normalized.person === "1" && normalized.number === "plural" && !normalized.clusivity) return null;
  return normalized;
};

const personMatches = (entry, person) =>
  entry.person === person.person &&
  entry.number === person.number &&
  (entry.clusivity || null) === (person.clusivity || null);

const conditionMatches = (conditions = {}, person, options) => {
  const checks = {
    person: person.person,
    number: person.number,
    clusivity: person.clusivity || null,
    oralNasal: options.oralNasal || null,
    polarity: options.polarity || "affirmative",
    mode: options.mode || "indicative"
  };
  return Object.entries(conditions).every(([key, expected]) => {
    if (expected === null || expected === undefined) return true;
    const accepted = Array.isArray(expected) ? expected : [expected];
    return accepted.includes(checks[key]);
  });
};

const sourceStatusResult = (record, openConflictIds = []) => {
  if (!record) return {status: "unavailable", reason: "missingRecord"};
  if (!VALIDATION_STATUSES.has(record.validationStatus)) {
    return {status: "reviewRequired", reason: "unknownValidationStatus"};
  }
  if (record.validationStatus === "conflict" || openConflictIds.length) {
    return {status: "conflict", reason: "openConflict"};
  }
  if (["rejected", "deprecated"].includes(record.validationStatus)) {
    return {status: "unavailable", reason: record.validationStatus};
  }
  if (!productiveValidationStatus(record)) {
    return {status: "reviewRequired", reason: `validationStatus:${record.validationStatus}`};
  }
  if (record.allowedForGeneration !== true) {
    return {status: "reviewRequired", reason: "generationNotAllowed"};
  }
  return {status: "available", reason: null};
};

const validatedSubrecord = record =>
  productiveValidationStatus(record) &&
  record?.allowedForGeneration === true &&
  Array.isArray(record?.sourceReferences) &&
  record.sourceReferences.length > 0;

const applyExplicitTransformations = (surface, transformations = []) => {
  let value = surface;
  for (const transformation of transformations) {
    if (!validatedSubrecord(transformation)) {
      return {status: "reviewRequired", reason: "transformationNotValidated"};
    }
    if (transformation.type === "replaceExact") {
      if (value !== transformation.from) continue;
      value = transformation.to;
    } else if (transformation.type === "replacePrefix") {
      if (value.startsWith(transformation.from)) {
        value = `${transformation.to}${value.slice(transformation.from.length)}`;
      }
    } else if (transformation.type === "replaceSuffix") {
      if (value.endsWith(transformation.from)) {
        value = `${value.slice(0, -transformation.from.length)}${transformation.to}`;
      }
    } else {
      return {status: "unavailable", reason: "unsupportedTransformation"};
    }
  }
  return {status: "available", value};
};

const realizeMorphemes = ({rule, marker, verbData}) => {
  if (!validatedSubrecord(rule)) {
    return {status: "reviewRequired", reason: "realizationRuleNotValidated"};
  }
  if (rule.operation?.type !== "orderedMorphemes" || !Array.isArray(rule.operation.order)) {
    return {status: "unavailable", reason: "missingComputableRealizationRule"};
  }

  const inventory = {
    personMarker: {
      id: "personMarker",
      form: marker,
      function: "personIndex",
      position: "prefix"
    },
    stem: verbData?.underlyingForm
      ? {id: "stem", form: verbData.underlyingForm, function: "lexicalRoot", position: "root"}
      : null
  };

  for (const morpheme of verbData?.morphemes || []) {
    inventory[morpheme.id] = morpheme;
  }

  const ordered = [];
  for (const slotId of rule.operation.order) {
    const morpheme = inventory[slotId];
    if (!morpheme || typeof morpheme.form !== "string") {
      return {status: "unavailable", reason: `missingMorpheme:${slotId}`};
    }
    ordered.push(morpheme);
  }

  const underlying = ordered.map(morpheme => morpheme.form).join(rule.operation.separator || "");
  const transformed = applyExplicitTransformations(underlying, rule.transformations || []);
  if (transformed.status !== "available") return transformed;

  return {
    status: "available",
    form: transformed.value,
    underlyingForm: underlying,
    morphemes: ordered
  };
};

export const normalizeConjugationPattern = record => ({
  id: record.id,
  name: record.officialLabel,
  description: record.stemBehavior,
  persons: (record.personMarkers || []).map(marker => ({
    person: marker.person,
    number: marker.number,
    clusivity: marker.clusivity || null
  })),
  prefixes: (record.personMarkers || []).map(marker => ({
    person: marker.person,
    number: marker.number,
    clusivity: marker.clusivity || null,
    underlyingMarker: marker.marker,
    oralVariant: marker.oralVariant || null,
    nasalVariant: marker.nasalVariant || null,
    function: "personIndex"
  })),
  inclusiveExclusive: {
    inclusive: (record.personMarkers || []).some(marker => marker.clusivity === "inclusive"),
    exclusive: (record.personMarkers || []).some(marker => marker.clusivity === "exclusive")
  },
  oralVariant: (record.personMarkers || []).some(marker => marker.oralVariant),
  nasalVariant: (record.personMarkers || []).some(marker => marker.nasalVariant),
  restrictions: [record.stemBehavior, `negativePattern:${record.negativePattern?.status || "unavailable"}`],
  exceptions: record.exceptions || [],
  references: uniqueReferences(record.sourceReferences),
  validationStatus: record.validationStatus,
  normativeVerification: record.normativeVerification || null,
  verifiedComponents: record.normativeVerification?.authorizedPatternComponents || [],
  conjugationGenerationAuthorized: record.normativeVerification?.conjugationGeneration === true,
  allowedForGeneration: record.allowedForGeneration === true,
  conflictIds: record.conflictIds || [],
  morphemeSlots: record.morphemeSlots || [],
  realizationRules: record.realizationRules || []
});

export const compileKnowledgeBase = ({corpus, governance}) => {
  if (!corpus || !Array.isArray(corpus.records)) throw new TypeError("Corpus inválido.");
  const patternRecords = corpus.records.filter(record => record.recordType === "conjugationPattern");
  const lexemeRecords = corpus.records.filter(record => record.recordType === "lexeme");
  const productivePatternIds = new Set(patternRecords.filter(record =>
    productiveValidationStatus(record) &&
    record.allowedForGeneration === true &&
    !(record.conflictIds || []).length &&
    record.normativeVerification?.conjugationGeneration !== false
  ).map(record => record.id));
  const productiveVerbLemmas = lexemeRecords.filter(record =>
    record.partOfSpeech?.includes("verb") &&
    record.verbData &&
    productiveValidationStatus(record) &&
    record.allowedForGeneration === true &&
    !(record.conflictIds || []).length &&
    productivePatternIds.has(record.verbData.patternId)
  );
  return {
    engineSchemaVersion: "1.0.0",
    languageVariant: corpus.languageVariant,
    validationPolicy: {
      allowedValidationStatuses: governance?.generationGate?.allowedValidationStatuses || DEFAULT_PRODUCTIVE_STATUSES,
      requiresAllowedForGeneration: governance?.generationGate?.requiresAllowedForGeneration !== false,
      requiresNoOpenConflict: governance?.generationGate?.requiresNoOpenConflict !== false,
      unknownDataPolicy: governance?.unknownDataPolicy || "No inventar."
    },
    conjugationPatterns: patternRecords.map(normalizeConjugationPattern),
    lexemes: lexemeRecords,
    linguisticRules: corpus.records.filter(record => record.recordType === "linguisticRule"),
    conflicts: corpus.records.filter(record => record.recordType === "conflict"),
    authorizationSummary: {
      normativeVerified: corpus.records.filter(record => record.validationStatus === "normativeVerified").length,
      expertVerified: corpus.records.filter(record => record.validationStatus === "expertVerified").length,
      allowedForGeneration: corpus.records.filter(record =>
        productiveValidationStatus(record) &&
        record.allowedForGeneration === true &&
        !(record.conflictIds || []).length
      ).length
    },
    grammarReadiness: {
      normativeVerifiedConjugationPatterns: patternRecords.filter(record =>
        record.validationStatus === "normativeVerified" && hasNormativeVerification(record)
      ).length,
      expertVerifiedConjugationPatterns: patternRecords.filter(record =>
        record.validationStatus === "expertVerified"
      ).length,
      productiveConjugationPatterns: productivePatternIds.size,
      productiveVerbLemmas: productiveVerbLemmas.length,
      realVerbFormsAvailable: 0,
      paso8CMayStart: false,
      blockingReason: "No hay lemas verbales productivos ni reglas de realización normativa autorizadas."
    },
    inventories: {
      affirmation: {status: "unavailable", ruleIds: []},
      negation: {status: "unavailable", ruleIds: []},
      interrogation: {status: "unavailable", ruleIds: []},
      mandate: {status: "unavailable", ruleIds: []},
      possession: {
        status: corpus.records.some(record => record.id === "RULE-POSSESSION-001") ? "reviewRequired" : "unavailable",
        ruleIds: corpus.records.filter(record => record.appliesTo?.includes("possession")).map(record => record.id)
      },
      oralNasalMorphophonology: {status: "unavailable", ruleIds: []},
      nominalClasses: {status: "unavailable", ruleIds: []}
    },
    supportedFutureVerbClasses: [
      "areal",
      "aireal",
      "hareal",
      "verbalizedOrChendal",
      "regular",
      "specialBehavior",
      "defective",
      "unipersonal",
      "intransitive",
      "transitive",
      "bitransitive"
    ],
    blockedConflicts: [...(governance?.blockedConflicts || [])],
    openAIConnected: false
  };
};

export const createGrammarEngine = ({corpus, governance}) => {
  const compiled = compileKnowledgeBase({corpus, governance});
  const records = new Map(corpus.records.map(record => [record.id, record]));
  const patterns = new Map(
    corpus.records
      .filter(record => record.recordType === "conjugationPattern")
      .map(record => [record.id, record])
  );
  const rules = corpus.records.filter(record => record.recordType === "linguisticRule");

  const openConflicts = record => (record?.conflictIds || []).filter(conflictId => {
    const conflict = records.get(conflictId);
    return conflict?.recordType === "conflict" &&
      conflict.needsHumanReview === true &&
      conflict.automaticUseBlocked === true &&
      !conflict.resolution;
  });

  const resolveMarker = (pattern, person, options) => {
    const entry = pattern.personMarkers?.find(candidate => personMatches(candidate, person));
    if (!entry) return {status: "unavailable", reason: "personNotCovered"};
    const oralNasal = options.oralNasal || null;
    if (oralNasal === "oral" && entry.oralVariant) return {status: "available", marker: entry.oralVariant, entry};
    if (oralNasal === "nasal" && entry.nasalVariant) return {status: "available", marker: entry.nasalVariant, entry};
    if (entry.marker.includes("/") && !oralNasal) return {status: "unavailable", reason: "oralNasalRequired"};
    if (entry.marker.includes("/") && oralNasal) return {status: "unavailable", reason: "requestedVariantUnavailable"};
    return {status: "available", marker: entry.marker, entry};
  };

  const getValidatedVerbForm = (verbId, grammaticalPerson, options = {}) => {
    const person = normalizePerson(grammaticalPerson);
    if (!person) return unavailableResult("invalidGrammaticalPerson");
    if (options.oralNasal && !["oral", "nasal"].includes(options.oralNasal)) {
      return unavailableResult("invalidOralNasalOption");
    }

    const verb = records.get(verbId);
    if (!verb) return unavailableResult("verbNotFound", {verbId});
    const lemma = verb.normalizedForm || null;
    if (verb.recordType !== "lexeme" || !verb.partOfSpeech?.includes("verb") || !verb.verbData) {
      const gate = sourceStatusResult(verb, openConflicts(verb));
      if (gate.status === "conflict") return conflictResult(verb, openConflicts(verb), {verbId, lemma, person});
      if (gate.status === "reviewRequired") return reviewResult(verb, gate.reason, {verbId, lemma, person});
      return unavailableResult("recordIsNotComputableVerb", {
        verbId,
        lemma,
        person,
        validationStatus: verb.validationStatus,
        source: uniqueReferences(verb.sourceReferences)
      });
    }

    const pattern = patterns.get(verb.verbData.patternId);
    if (!pattern) return unavailableResult("patternNotFound", {verbId, patternId: verb.verbData.patternId});
    const patternDescriptor = {id: pattern.id, name: pattern.officialLabel};
    const conflictIds = [...new Set([...openConflicts(verb), ...openConflicts(pattern)])];
    if (conflictIds.length) {
      return conflictResult(pattern, conflictIds, {verbId, lemma, person, pattern: patternDescriptor, patternId: pattern.id});
    }

    const verbGate = sourceStatusResult(verb);
    if (verbGate.status === "conflict") return conflictResult(verb, openConflicts(verb), {verbId, lemma, person, pattern: patternDescriptor});
    if (verbGate.status === "reviewRequired") return reviewResult(verb, verbGate.reason, {verbId, lemma, person, pattern: patternDescriptor});
    if (verbGate.status === "unavailable") return unavailableResult(verbGate.reason, {verbId});

    const patternGate = sourceStatusResult(pattern);
    if (patternGate.status === "conflict") return conflictResult(pattern, openConflicts(pattern), {verbId, patternId: pattern.id});
    if (patternGate.status === "reviewRequired") return reviewResult(pattern, patternGate.reason, {verbId, patternId: pattern.id});
    if (patternGate.status === "unavailable") return unavailableResult(patternGate.reason, {verbId, patternId: pattern.id});

    const markerResult = resolveMarker(pattern, person, options);
    if (markerResult.status !== "available") {
      return unavailableResult(markerResult.reason, {verbId, patternId: pattern.id});
    }

    const exactForms = [
      ...(verb.verbData.exceptions || []),
      ...(verb.verbData.validatedForms || []),
      ...(verb.verbData.irregularForms || [])
    ];
    const exact = exactForms.find(form =>
      personMatches(form, person) &&
      (!form.oralNasal || form.oralNasal === (options.oralNasal || null))
    );
    if (exact) {
      if (!validatedSubrecord(exact)) return reviewResult(exact, "exactFormNotValidated", {verbId, patternId: pattern.id});
      return {
        status: "available",
        form: exact.form,
        lemma,
        person,
        pattern: patternDescriptor,
        underlyingForm: exact.underlyingForm || null,
        morphemes: exact.morphemes || [],
        appliedRule: exact.ruleId || "exactValidatedForm",
        source: uniqueReferences(exact.sourceReferences),
        validationStatus: exact.validationStatus,
        canResolveWithoutAI: true,
        aiPermitted: false,
        verbId,
        patternId: pattern.id
      };
    }

    const realizationRule = (pattern.realizationRules || []).find(rule =>
      conditionMatches(rule.conditions, person, options)
    );
    if (!realizationRule) return unavailableResult("missingComputableRealizationRule", {verbId, patternId: pattern.id});

    const realized = realizeMorphemes({
      rule: realizationRule,
      marker: markerResult.marker,
      verbData: verb.verbData
    });
    if (realized.status === "reviewRequired") return reviewResult(realizationRule, realized.reason, {verbId, patternId: pattern.id});
    if (realized.status !== "available") return unavailableResult(realized.reason, {verbId, patternId: pattern.id});

    return {
      status: "available",
      form: realized.form,
      lemma,
      person,
      pattern: patternDescriptor,
      underlyingForm: realized.underlyingForm,
      morphemes: realized.morphemes,
      appliedRule: realizationRule.id,
      source: uniqueReferences([
        ...verb.sourceReferences,
        ...pattern.sourceReferences,
        ...realizationRule.sourceReferences
      ]),
      validationStatus: realizationRule.validationStatus,
      canResolveWithoutAI: true,
      aiPermitted: false,
      verbId,
      patternId: pattern.id
    };
  };

  const validateSentenceStructure = sentenceData => {
    if (!sentenceData || typeof sentenceData !== "object") return unavailableResult("invalidSentenceData");
    if (typeof sentenceData.constructionType !== "string") return unavailableResult("missingConstructionType");
    if (!Array.isArray(sentenceData.constituents)) return unavailableResult("missingStructuredConstituents");

    const candidates = rules.filter(rule => rule.appliesTo?.includes(sentenceData.constructionType));
    if (!candidates.length) {
      return unavailableResult("validatedStructureRuleNotFound", {
        constructionType: sentenceData.constructionType,
        tokensValidated: sentenceData.tokensValidated === true
      });
    }

    const rule = sentenceData.ruleId
      ? candidates.find(candidate => candidate.id === sentenceData.ruleId)
      : candidates[0];
    if (!rule) return unavailableResult("requestedStructureRuleNotFound", {ruleId: sentenceData.ruleId});

    const conflicts = openConflicts(rule);
    const gate = sourceStatusResult(rule, conflicts);
    if (gate.status === "conflict") return conflictResult(rule, conflicts, {ruleId: rule.id});
    if (gate.status === "reviewRequired") return reviewResult(rule, gate.reason, {ruleId: rule.id});
    if (gate.status === "unavailable") return unavailableResult(gate.reason, {ruleId: rule.id});
    if (!Array.isArray(rule.morphemeOrder) || !rule.morphemeOrder.length) {
      return unavailableResult("ruleHasNoComputableOrder", {ruleId: rule.id});
    }

    const observedOrder = sentenceData.constituents.map(constituent => constituent.role);
    const valid = observedOrder.length === rule.morphemeOrder.length &&
      observedOrder.every((role, index) => role === rule.morphemeOrder[index]);
    return {
      status: valid ? "valid" : "invalid",
      valid,
      form: null,
      appliedRule: rule.id,
      source: uniqueReferences(rule.sourceReferences),
      validationStatus: rule.validationStatus,
      canResolveWithoutAI: true,
      aiPermitted: false,
      constructionType: sentenceData.constructionType,
      tokensValidated: sentenceData.tokensValidated === true,
      expectedOrder: [...rule.morphemeOrder],
      observedOrder
    };
  };

  const inspectConjugationPattern = patternId => {
    const pattern = patterns.get(patternId);
    if (!pattern) return unavailableResult("patternNotFound", {patternId});
    const conflicts = openConflicts(pattern);
    const gate = sourceStatusResult(pattern, conflicts);
    return {
      status: gate.status === "available" ? "available" : gate.status,
      reason: gate.reason,
      pattern: normalizeConjugationPattern(pattern),
      conflictIds: conflicts,
      canResolveWithoutAI: gate.status === "available",
      aiPermitted: false
    };
  };

  return Object.freeze({
    getValidatedVerbForm,
    validateSentenceStructure,
    inspectConjugationPattern,
    getCompiledKnowledge: () => structuredClone(compiled),
    policy: Object.freeze({
      openAIConnected: false,
      inventUnknownForms: false,
      productiveValidationStatuses: [...PRODUCTIVE_STATUSES],
      requiresAllowedForGeneration: true,
      conflictUseBlocked: true
    })
  });
};

export const grammarEngineStatuses = Object.freeze({
  available: "available",
  unavailable: "unavailable",
  conflict: "conflict",
  reviewRequired: "reviewRequired",
  valid: "valid",
  invalid: "invalid"
});
