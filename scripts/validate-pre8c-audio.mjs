import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_VERSION = "NALVI_RECORDED_AUDIO_V1";
const EXPECTED_COUNT = 99;
const EXPECTED_TOTAL_BYTES = 1_548_150;
const AUDIO_BASE_PATH = "assets/audio/guarani/ali-2026";
const SAFE_ID = /^NALVI-AUDIO-(\d{3})$/;
const SAFE_FILE = /^(\d{3})-[a-z0-9]+(?:-[a-z0-9]+)*\.m4a$/;

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const audioDirectory = resolve(repositoryRoot, AUDIO_BASE_PATH);
const manifestPath = resolve(audioDirectory, "manifest.json");
const recoveryChecksumsPath = resolve(repositoryRoot, "RECOVERY-PRE-8C-SHA256SUMS.txt");

const sha256 = value => createHash("sha256").update(value).digest("hex");
const normalizeText = value => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[‘’`´ʼʹʻ]/g, "'")
  .replace(/[¿?¡!.,;:()\[\]{}]/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .toLocaleLowerCase("es");

function duplicateValues(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value, count]) => ({ value, count }));
}

function duplicateAliases(recordings) {
  const idsByAlias = new Map();
  for (const recording of recordings) {
    const aliases = new Set([
      recording.label,
      recording.sourceFile.replace(/\.m4a$/i, ""),
      recording.label.split("(")[0]
    ].map(normalizeText).filter(Boolean));
    for (const alias of aliases) {
      if (!idsByAlias.has(alias)) idsByAlias.set(alias, new Set());
      idsByAlias.get(alias).add(recording.id);
    }
  }
  return [...idsByAlias.entries()]
    .filter(([, ids]) => ids.size > 1)
    .map(([value, ids]) => ({ value, ids: [...ids].sort() }));
}

function recoveryChecksums() {
  const entries = new Map();
  for (const line of readFileSync(recoveryChecksumsPath, "utf8").split(/\r?\n/)) {
    const match = /^([0-9a-f]{64})  \.\/(assets\/audio\/guarani\/ali-2026\/[^/]+\.m4a)$/.exec(line);
    if (match) entries.set(match[2], match[1]);
  }
  return entries;
}

const errors = [];
const check = (condition, message) => {
  if (!condition) errors.push(message);
};

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const checksumByPath = recoveryChecksums();
const directoryRealPath = realpathSync(audioDirectory);
const physicalFiles = readdirSync(audioDirectory, { withFileTypes: true })
  .filter(entry => entry.name.toLocaleLowerCase().endsWith(".m4a"))
  .map(entry => entry.name)
  .sort();
const rows = [];

check(manifest.version === EXPECTED_VERSION, `Versión inesperada: ${manifest.version}`);
check(manifest.count === EXPECTED_COUNT, `Conteo declarado inesperado: ${manifest.count}`);
check(Array.isArray(manifest.recordings), "recordings no es un arreglo");
check(manifest.recordings?.length === EXPECTED_COUNT, `El manifiesto contiene ${manifest.recordings?.length ?? 0} registros`);
check(physicalFiles.length === EXPECTED_COUNT, `Hay ${physicalFiles.length} archivos físicos .m4a`);
check(checksumByPath.size === EXPECTED_COUNT, `Hay ${checksumByPath.size} checksums de recuperación para el corpus`);

for (const [index, recording] of (manifest.recordings || []).entries()) {
  const ordinal = String(index + 1).padStart(3, "0");
  const id = String(recording?.id || "");
  const label = String(recording?.label || "");
  const sourceFile = String(recording?.sourceFile || "");
  const file = String(recording?.file || "");
  const canonicalPath = `${AUDIO_BASE_PATH}/${file}`;
  const idMatch = SAFE_ID.exec(id);
  const fileMatch = SAFE_FILE.exec(file);
  check(idMatch?.[1] === ordinal, `ID inválido o fuera de secuencia en ${ordinal}: ${id}`);
  check(fileMatch?.[1] === ordinal, `Archivo inválido o fuera de secuencia en ${ordinal}: ${file}`);
  check(label === label.normalize("NFC") && Boolean(label.trim()), `Etiqueta inválida en ${id}`);
  check(sourceFile === sourceFile.normalize("NFC") && sourceFile === `${label}.m4a`, `sourceFile no corresponde a label en ${id}`);
  check(recording.format === "audio/mp4", `Formato inválido en ${id}`);
  check(recording.humanRecorded === true, `humanRecorded no es true en ${id}`);
  check(recording.authorizedForPlayback === true, `authorizedForPlayback no es true en ${id}`);

  const candidatePath = resolve(directoryRealPath, file);
  check(dirname(candidatePath) === directoryRealPath, `Ruta fuera del corpus en ${id}`);
  try {
    const linkStats = lstatSync(candidatePath);
    check(!linkStats.isSymbolicLink(), `Enlace simbólico rechazado en ${id}`);
    const realPath = realpathSync(candidatePath);
    check(dirname(realPath) === directoryRealPath, `realpath fuera del corpus en ${id}`);
    const stats = statSync(realPath);
    const bytes = readFileSync(realPath);
    const hash = sha256(bytes);
    const recoveryHash = checksumByPath.get(canonicalPath) || "";
    check(stats.isFile() && stats.size > 0, `Archivo no regular o vacío en ${id}`);
    check(bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp", `Firma M4A inválida en ${id}`);
    check(Boolean(recoveryHash), `Falta checksum de recuperación para ${id}`);
    check(hash === recoveryHash, `SHA-256 no coincide con recuperación en ${id}`);
    rows.push({ id, label, sourceFile, file, canonicalPath, bytes: stats.size, sha256: hash, recoveryMatch: hash === recoveryHash });
  } catch (error) {
    errors.push(`Archivo físico inválido en ${id}: ${String(error?.code || error?.message || error)}`);
    rows.push({ id, label, sourceFile, file, canonicalPath, bytes: 0, sha256: "", recoveryMatch: false });
  }
}

const manifestFiles = new Set(rows.map(row => row.file));
const missingFiles = [...manifestFiles].filter(file => !physicalFiles.includes(file)).sort();
const extraFiles = physicalFiles.filter(file => !manifestFiles.has(file)).sort();
const duplicateIds = duplicateValues(rows.map(row => row.id));
const duplicateFiles = duplicateValues(rows.map(row => row.file));
const duplicateSourceFiles = duplicateValues(rows.map(row => row.sourceFile.normalize("NFC").toLocaleLowerCase("es")));
const duplicateLabels = duplicateValues(rows.map(row => normalizeText(row.label)));
const duplicateTextAliases = duplicateAliases(rows);
const duplicateHashes = duplicateValues(rows.map(row => row.sha256).filter(Boolean));
const totalBytes = rows.reduce((sum, row) => sum + row.bytes, 0);

check(missingFiles.length === 0, `Archivos ausentes: ${missingFiles.join(", ")}`);
check(extraFiles.length === 0, `Archivos extra: ${extraFiles.join(", ")}`);
check(duplicateIds.length === 0, `IDs duplicados: ${JSON.stringify(duplicateIds)}`);
check(duplicateFiles.length === 0, `Rutas duplicadas: ${JSON.stringify(duplicateFiles)}`);
check(duplicateSourceFiles.length === 0, `sourceFile duplicados: ${JSON.stringify(duplicateSourceFiles)}`);
check(duplicateLabels.length === 0, `Etiquetas normalizadas duplicadas: ${JSON.stringify(duplicateLabels)}`);
check(duplicateTextAliases.length === 0, `Aliases de texto ambiguos: ${JSON.stringify(duplicateTextAliases)}`);
check(duplicateHashes.length === 0, `Contenido binario duplicado: ${JSON.stringify(duplicateHashes)}`);
check(totalBytes === EXPECTED_TOTAL_BYTES, `Tamaño total inesperado: ${totalBytes}`);

const summary = {
  ok: errors.length === 0,
  version: manifest.version,
  expectedRecordings: EXPECTED_COUNT,
  manifestRecordings: manifest.recordings?.length || 0,
  physicalRecordings: physicalFiles.length,
  recoveryChecksums: checksumByPath.size,
  checksumMatches: rows.filter(row => row.recoveryMatch).length,
  totalBytes,
  missingFiles,
  extraFiles,
  duplicateIds,
  duplicateFiles,
  duplicateSourceFiles,
  duplicateLabels,
  duplicateTextAliases,
  duplicateHashes,
  errors
};

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify({ summary, recordings: rows }, null, 2)}\n`);
} else if (process.argv.includes("--table")) {
  process.stdout.write("| ID | Etiqueta | sourceFile | Ruta canónica | Bytes | SHA-256 |\n");
  process.stdout.write("|---|---|---|---|---:|---|\n");
  for (const row of rows) {
    const cells = [row.id, row.label, row.sourceFile, row.canonicalPath, row.bytes, row.sha256]
      .map(value => String(value).replace(/\|/g, "\\|"));
    process.stdout.write(`| ${cells.join(" | ")} |\n`);
  }
  process.stdout.write(`\nResumen: ${JSON.stringify(summary)}\n`);
} else {
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (errors.length) process.exitCode = 1;
