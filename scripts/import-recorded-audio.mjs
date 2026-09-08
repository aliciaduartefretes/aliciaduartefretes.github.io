import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

const [sourceRoot, outputRoot, mode] = process.argv.slice(2);
const append = mode === "--append";
if (!sourceRoot || !outputRoot) {
  throw new Error("Usage: node scripts/import-recorded-audio.mjs <source-directory> <output-directory> [--append]");
}

async function collectAudioFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectAudioFiles(path));
    else if (entry.isFile() && extname(entry.name).toLocaleLowerCase() === ".m4a") files.push(path);
  }
  return files;
}

function slug(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'‘`´]/g, "-")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "audio";
}

const sourceFiles = (await collectAudioFiles(sourceRoot)).sort((left, right) =>
  left.normalize("NFC").localeCompare(right.normalize("NFC"), "es", { sensitivity: "base" })
);
if (!sourceFiles.length) throw new Error("No .m4a recordings found");

let recordings = [];
if (append) {
  const manifestPath = join(outputRoot, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!Array.isArray(manifest.recordings) || manifest.recordings.length !== manifest.count) {
    throw new Error("Existing manifest is invalid");
  }
  recordings = manifest.recordings;
} else {
  try {
    await stat(outputRoot);
    throw new Error(`Output directory already exists: ${outputRoot}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await mkdir(outputRoot, { recursive: true });
}

const existingLabels = new Set(recordings.map(recording => recording.label.normalize("NFC").toLocaleLowerCase("es")));
const pending = sourceFiles.map(sourcePath => {
  const sourceFile = basename(sourcePath).normalize("NFC");
  const label = basename(sourceFile, extname(sourceFile)).normalize("NFC").trim();
  return { sourcePath, sourceFile, label };
});
const duplicateLabels = pending
  .map(item => item.label.toLocaleLowerCase("es"))
  .filter((label, index, labels) => existingLabels.has(label) || labels.indexOf(label) !== index);
if (duplicateLabels.length) throw new Error(`Duplicate labels: ${[...new Set(duplicateLabels)].join(", ")}`);

const imported = [];
for (const item of pending) {
  const ordinal = recordings.length + 1;
  const file = `${String(ordinal).padStart(3, "0")}-${slug(item.label)}.m4a`;
  await copyFile(item.sourcePath, join(outputRoot, file));
  const recording = {
    id: `NALVI-AUDIO-${String(ordinal).padStart(3, "0")}`,
    label: item.label,
    sourceFile: item.sourceFile,
    file,
    format: "audio/mp4",
    humanRecorded: true,
    authorizedForPlayback: true
  };
  recordings.push(recording);
  imported.push(recording);
}

const manifest = {
  version: "NALVI_RECORDED_AUDIO_V2",
  importedAt: new Date().toISOString().slice(0, 10),
  source: "APP GUARANÍ AUDIOS ALI · LOTES ACUMULADOS",
  count: recordings.length,
  recordings
};
await writeFile(join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ outputRoot, imported: imported.length, count: recordings.length })}\n`);
