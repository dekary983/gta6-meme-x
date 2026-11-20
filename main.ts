// Copies this entry's POST.json into the configured output directory.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const botDirectory = resolve(
  process.env.MAKEFUN_BOT_DIR ?? dirname(fileURLToPath(import.meta.url)),
);
const outputDirectory = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? "/output");
const sourcePath = resolve(botDirectory, "POST.json");
const destinationPath = resolve(outputDirectory, "POST.json");

try {
  if (!existsSync(sourcePath)) {
    throw new Error(`POST.json is missing: ${sourcePath}`);
  }

  mkdirSync(outputDirectory, { recursive: true });
  copyFileSync(sourcePath, destinationPath);
  console.log(`Copied POST.json to ${destinationPath}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
