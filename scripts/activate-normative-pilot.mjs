import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dossierPath = path.join(root, "human-review/paso-8b-5-corpus-piloto-candidatos.json");
const corpusPath = path.join(root, "knowledge-base/pilot-corpus.json");
const dossier = JSON.parse(fs.readFileSync(dossierPath, "utf8"));
const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8"));
const verifiedAt = "2026-08-29T04:36:01Z";

const authorized = new Map(Object.entries({
  "LEX-PILOT-AKA-001": { glossEs: "cabeza", partOfSpeech: "noun" },
  "LEX-PILOT-AO-001": { glossEs: "ropa", partOfSpeech: "noun" },
  "LEX-PILOT-APYKA-001": { glossEs: "asiento", partOfSpeech: "noun" },
  "LEX-PILOT-ARANDUKA-001": { glossEs: "libro", partOfSpeech: "noun" },
  "LEX-PILOT-AVATI-001": { glossEs: "maíz", partOfSpeech: "noun" },
  "LEX-PILOT-GUYRA-001": { glossEs: "ave", partOfSpeech: "noun" },
  "LEX-PILOT-IRUNDY-001": { glossEs: "cuatro", partOfSpeech: "numeral" },
  "LEX-PILOT-JAGUA-001": { glossEs: "perro", partOfSpeech: "noun" },
  "LEX-PILOT-JASY-001": { glossEs: "luna", partOfSpeech: "noun" },
  "LEX-PILOT-JURU-001": { glossEs: "boca", partOfSpeech: "noun" },
  "LEX-PILOT-KUARAHY-001": { glossEs: "sol", partOfSpeech: "noun" },
  "LEX-PILOT-MANDIO-001": { glossEs: "mandioca", partOfSpeech: "noun" },
  "LEX-PILOT-MITA-001": { glossEs: "niño", partOfSpeech: "noun" },
  "LEX-PILOT-MOKOI-001": { glossEs: "dos", partOfSpeech: "numeral" },
  "LEX-PILOT-MBARAKAJA-001": { glossEs: "gato", partOfSpeech: "noun" },
  "LEX-PILOT-MBOHAPY-001": { glossEs: "tres", partOfSpeech: "numeral" },
  "LEX-PILOT-PANAMBI-001": { glossEs: "mariposa", partOfSpeech: "noun" },
  "LEX-PILOT-PETEI-001": { glossEs: "uno", partOfSpeech: "numeral" },
  "LEX-PILOT-PY-001": { glossEs: "pie", partOfSpeech: "noun" },
  "LEX-PILOT-PYHARE-001": { glossEs: "noche", partOfSpeech: "noun" }
}));

const deferred = new Set([
  "LEX-PILOT-ARA-001",
  "LEX-PILOT-JARYI-001",
  "LEX-PILOT-KUMANDA-001",
  "LEX-PILOT-PIRA-001",
  "LEX-PILOT-SY-001"
]);

if (dossier.readyForHumanReview.length !== authorized.size + deferred.size) {
  throw new Error("El expediente READY_FOR_HUMAN_REVIEW cambió: se detiene para evitar seleccionar candidatos nuevos.");
}
if (dossier.readyForHumanReview.some(item => !authorized.has(item.id) && !deferred.has(item.id))) {
  throw new Error("El expediente contiene un candidato no clasificado por este ajuste.");
}

const source = dossier.sources.find(item => item.id === "S-002");
if (!source) throw new Error("Falta la fuente normativa S-002 documentada.");

const makeVerification = item => ({
  method: "direct-normative-source-check",
  sourceAuthorityLevel: "A",
  sourceId: item.sourceId,
  sourcePage: item.sourcePage,
  verifiedAt,
  verifiedByProcess: "NALVI normative source audit",
  humanExpertReview: false,
  authorizedSenseIds: ["sense-1"],
  authorizedUses: ["recognition", "exactRecall", "matching", "controlledWriting"],
  openConflictIds: [],
  sentenceGeneration: false,
  exampleGeneration: false,
  conjugationGeneration: false,
  notes: "Autoriza únicamente la forma y la acepción concreta registradas. No autoriza ejemplos, oraciones, conjugaciones ni acepciones adicionales."
});

const corpusIds = new Set(corpus.records.map(record => record.id));
for (const item of dossier.readyForHumanReview) {
  if (authorized.has(item.id)) {
    if (item.riesgo !== "bajo") throw new Error(`${item.id}: solo se permite promoción automática del subconjunto ya clasificado como riesgo bajo.`);
    if (item.sourceId !== "S-002" || !item.sourcePage || item.conflictosRelacionados.length) {
      throw new Error(`${item.id}: no cumple procedencia normativa exacta y ausencia de conflicto.`);
    }
    const scope = authorized.get(item.id);
    const normativeVerification = makeVerification(item);
    const record = {
      id: item.id,
      recordType: "lexeme",
      languageVariant: "gug-PY",
      validationStatus: "normativeVerified",
      allowedForGeneration: true,
      sourceReferences: [{
        sourceId: source.id,
        sourceTitle: source.sourceTitle,
        sourceAuthor: source.sourceAuthor,
        sourceInstitution: source.sourceInstitution,
        sourceYear: source.sourceYear,
        sourceURL: item.sourceURL,
        sourcePage: item.sourcePage,
        sourceEdition: source.sourceEdition,
        sourceLocatorType: "webPage",
        sourceForm: item.forma,
        validationStatus: "sourceVerified"
      }],
      normativeVerification,
      version: "1.0.0-normative",
      createdAt: verifiedAt,
      updatedAt: verifiedAt,
      changeHistory: [{
        date: verifiedAt,
        summary: "Acepción concreta habilitada como normativeVerified mediante comprobación directa de fuente Nivel A; sin revisión experta humana.",
        reviewerId: null
      }],
      normalizedForm: item.forma,
      sourceForms: [item.forma],
      partOfSpeech: [scope.partOfSpeech],
      senses: [{
        id: "sense-1",
        definitionGuarani: null,
        glossEs: scope.glossEs,
        register: ["neutral"],
        contexts: ["pilotNormativeExactSense"],
        professionalDomains: [],
        exampleIds: []
      }],
      pedagogicalLevel: "starter",
      variants: [],
      frequency: {
        status: "unmeasured",
        method: null,
        corpusId: null,
        queryDate: null,
        rawCount: null,
        normalizedRate: null,
        coverageWarning: "La habilitación normativa no implica una medición de frecuencia."
      },
      verbData: null,
      termStatus: "attested"
    };

    const existingIndex = corpus.records.findIndex(candidate => candidate.id === item.id);
    if (existingIndex >= 0) {
      const existing = corpus.records[existingIndex];
      if (existing.validationStatus !== "normativeVerified") {
        throw new Error(`${item.id}: ya existe con otro estado; no se sobrescribe.`);
      }
      corpus.records[existingIndex] = record;
    } else {
      corpus.records.push(record);
      corpusIds.add(item.id);
    }

    Object.assign(item, {
      validationStatusActual: "normativeVerified",
      allowedForGeneration: true,
      normativeDecision: "AUTHORIZED_EXACT_SENSE_ONLY",
      authorizedSense: { id: "sense-1", glossEs: scope.glossEs },
      normativeVerification
    });
  } else {
    Object.assign(item, {
      allowedForGeneration: false,
      normativeDecision: "DEFERRED_SCOPE_AMBIGUITY",
      normativeDecisionNote: "Permanece sin importar y sin autorización por riesgo bajo-medio o amplitud semántica."
    });
  }
}

dossier.phase = "normative-pilot-activation-complete";
dossier.adjustedAt = verifiedAt;
dossier.policy = {
  ...dossier.policy,
  statusesChanged: true,
  applicationChanged: true,
  expertVerifiedGranted: false,
  normativeVerifiedGranted: true,
  allowedForGenerationGranted: true,
  note: "Se habilitó únicamente el subconjunto de riesgo bajo con acepción exacta. normativeVerified no equivale a revisión experta humana."
};
dossier.normativeAdjustment = {
  readyReviewed: dossier.readyForHumanReview.length,
  normativeVerified: authorized.size,
  deferred: deferred.size,
  expertVerified: 0,
  allowedForGeneration: authorized.size,
  newCandidatesSearched: 0,
  needsMoreEvidenceModified: false,
  blockedModified: false,
  grammarRulesPromoted: 0,
  conjugationGenerationEnabled: false,
  authorizedIds: [...authorized.keys()],
  deferredIds: [...deferred]
};

fs.writeFileSync(corpusPath, `${JSON.stringify(corpus, null, 2)}\n`, "utf8");
fs.writeFileSync(dossierPath, `${JSON.stringify(dossier, null, 2)}\n`, "utf8");
console.log(JSON.stringify(dossier.normativeAdjustment, null, 2));
