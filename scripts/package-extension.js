import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "extension");
const manifest = JSON.parse(fs.readFileSync(path.join(source, "manifest.json"), "utf8"));

// The Chrome Web Store rejects uploads whose manifest carries a "key"; the store assigns
// the extension ID itself. The key stays in the repository so unpacked installs keep a fixed ID.
delete manifest.key;

const staging = fs.mkdtempSync(path.join(os.tmpdir(), "branchport-extension-"));
fs.cpSync(source, staging, { recursive: true, filter: (file) => !file.endsWith(".test.js") && path.basename(file) !== ".DS_Store" });
fs.writeFileSync(path.join(staging, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const outDir = path.join(root, "dist");
const zipPath = path.join(outDir, `branchport-extension-${manifest.version}.zip`);
fs.mkdirSync(outDir, { recursive: true });
fs.rmSync(zipPath, { force: true });
const result = spawnSync("zip", ["-qr", zipPath, "."], { cwd: staging, stdio: "inherit" });
fs.rmSync(staging, { recursive: true, force: true });
if (result.error || result.status !== 0) {
  console.error("zip failed. It requires the zip command (macOS and most Linux distributions ship it).");
  process.exit(1);
}
console.log(path.relative(root, zipPath));
