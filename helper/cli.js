#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = "Usage: branchport <install|uninstall|start>";
const RUNTIME_FILES = [
  "auth.js", "git-info.js", "platform.js", "server.js",
  "install-launch-agent.sh", "uninstall-launch-agent.sh",
  "install-systemd-user.sh", "uninstall-systemd-user.sh",
  "install-scheduled-task.ps1", "uninstall-scheduled-task.ps1",
];

const action = process.argv[2];
const sourceDir = path.dirname(fileURLToPath(import.meta.url));

// npx runs the package from a temporary cache that npm may clear at any time, so the
// service must point at a stable copy of the helper rather than at this directory.
function installDir() {
  if (process.env.BRANCHPORT_HOME) return path.resolve(process.env.BRANCHPORT_HOME);
  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Branchport");
  }
  return path.join(os.homedir(), ".branchport");
}

function copyRuntime(target) {
  const helperDir = path.join(target, "helper");
  fs.rmSync(helperDir, { recursive: true, force: true });
  fs.mkdirSync(helperDir, { recursive: true });
  for (const file of RUNTIME_FILES) fs.copyFileSync(path.join(sourceDir, file), path.join(helperDir, file));
  // The helper uses ES module syntax, which Node only honors under a "type": "module" package.
  fs.writeFileSync(path.join(target, "package.json"), `${JSON.stringify({ private: true, type: "module" }, null, 2)}\n`);
  return helperDir;
}

function runServiceScript(name, helperDir) {
  const scripts = {
    darwin: ["bash", [path.join(helperDir, `${name}-launch-agent.sh`)]],
    linux: ["bash", [path.join(helperDir, `${name}-systemd-user.sh`)]],
    win32: ["powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(helperDir, `${name}-scheduled-task.ps1`)]],
  };
  const selected = scripts[process.platform];
  if (!selected) throw new Error(`Unsupported platform: ${process.platform}`);
  const result = spawnSync(selected[0], selected[1], { stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (action === "install") {
  const target = installDir();
  const status = runServiceScript("install", copyRuntime(target));
  if (status === 0) console.log(`Helper files: ${target}`);
  process.exit(status);
} else if (action === "uninstall") {
  const target = installDir();
  // Uninstall scripts only need the service name, so the bundled copies work even if
  // the installed copy is already gone.
  const status = runServiceScript("uninstall", sourceDir);
  if (status === 0) fs.rmSync(target, { recursive: true, force: true });
  process.exit(status);
} else if (action === "start") {
  await import("./server.js");
} else {
  console.error(USAGE);
  process.exit(1);
}
