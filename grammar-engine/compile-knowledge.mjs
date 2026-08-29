import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {compileKnowledgeBase} from "./grammar-engine.mjs";

const engineRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(engineRoot, "..");
const readJson = relativePath => JSON.parse(
  fs.readFileSync(path.join(projectRoot, relativePath), "utf8")
);

const corpus = readJson("knowledge-base/pilot-corpus.json");
const governance = readJson("knowledge-base/governance.json");
const compiled = compileKnowledgeBase({corpus, governance});
const outputPath = path.join(engineRoot, "compiled-knowledge.json");

fs.writeFileSync(outputPath, `${JSON.stringify(compiled, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  status: "COMPILED",
  output: path.basename(outputPath),
  patterns: compiled.conjugationPatterns.length,
  lexemes: compiled.lexemes.length,
  rules: compiled.linguisticRules.length,
  normativeVerified: [...compiled.lexemes, ...compiled.linguisticRules, ...compiled.conjugationPatterns].filter(record => record.validationStatus === "normativeVerified").length,
  expertVerified: [...compiled.lexemes, ...compiled.linguisticRules, ...compiled.conjugationPatterns].filter(record => record.validationStatus === "expertVerified").length,
  allowedForGeneration: [...compiled.lexemes, ...compiled.linguisticRules, ...compiled.conjugationPatterns].filter(record => record.allowedForGeneration).length,
  productivePatterns: compiled.conjugationPatterns.filter(pattern => pattern.allowedForGeneration).length,
  blockedConflicts: compiled.blockedConflicts,
  openAIConnected: compiled.openAIConnected
}, null, 2));
