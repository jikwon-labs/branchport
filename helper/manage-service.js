import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const action = process.argv[2];
if (!["install", "uninstall"].includes(action)) throw new Error("Expected install or uninstall");

const directory = path.dirname(fileURLToPath(import.meta.url));
const scripts = {
  darwin: ["bash", [path.join(directory, `${action}-launch-agent.sh`)]],
  linux: ["bash", [path.join(directory, `${action}-systemd-user.sh`)]],
  win32: ["powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(directory, `${action}-scheduled-task.ps1`)]],
};
const selected = scripts[process.platform];
if (!selected) throw new Error(`Unsupported platform: ${process.platform}`);
const result = spawnSync(selected[0], selected[1], { stdio: "inherit", windowsHide: true });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
