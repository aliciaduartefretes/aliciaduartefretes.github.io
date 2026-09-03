import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

const [sourceRoot, outputRoot] = process.argv.slice(2);
if (!sourceRoot || !outputRoot) {
  throw new Error("Usage: node scripts/import-recorded-audio.mjs <source-directory> <output-directory>");
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

try {
  await stat(outputRoot);
  throw new Error(`Output directory already exists: ${outputRoot}`);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
await mkdir(outputRoot, { recursive: true });
const recordings = [];
for (const [index, sourcePath] of sourceFiles.entries()) {
  const sourceFile = basename(sourcePath).normalize("NFC");
  const label = basename(sourceFile, extname(sourceFile)).normalize("NFC").trim();
  const file = `${String(index + 1).padStart(3, "0")}-${slug(label)}.m4a`;
  await copyFile(sourcePath, join(outputRoot, file));
  recordings.push({
    id: `NALVI-AUDIO-${String(index + 1).padStart(3, "0")}`,
    label,
    sourceFile,
    file,
    format: "audio/mp4",
    humanRecorded: true,
    authorizedForPlayback: true
  });
}

const manifest = {
  version: "NALVI_RECORDED_AUDIO_V1",
  importedAt: "2026-09-02",
  source: "APP GUARANÍ AUDIOS ALI",
  count: recordings.length,
  recordings
};
await writeFile(join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ outputRoot, count: recordings.length })}\n`);
