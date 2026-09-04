import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root=join(dirname(fileURLToPath(import.meta.url)),"..");
const activePath=join(root,"firebase","firestore-PASO-6.rules");
const proposalPath=join(root,"firebase","proposals","community-open-authenticated.rules.snippet");
const outputPath=join(root,"firebase","proposals","REGLAS-FIRESTORE-COMUNIDAD-PARA-COPIAR.rules");
const marker="    // Cualquier colección no declarada queda denegada.";
const active=readFileSync(activePath,"utf8");
const proposal=readFileSync(proposalPath,"utf8").trim().split("\n").map(line=>line?`    ${line}`:line).join("\n");
if(!active.includes(marker))throw new Error("No se encontró el cierre fail-closed de Firestore");
const combined=active.replace(marker,`${proposal}\n\n${marker}`);
writeFileSync(outputPath,combined);
console.log(`PASS reglas completas generadas: ${outputPath}`);
