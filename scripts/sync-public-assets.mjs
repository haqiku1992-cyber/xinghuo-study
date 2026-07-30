import { copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await copyFile(
  path.join(root, "public", "data", "questions.json"),
  path.join(root, "public", "questions.json"),
);

console.log("Synced question bank to the production public root.");
