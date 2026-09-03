import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function run(command, args, options = {}) {
  const { stdout } = await execFileAsync(command, args, {
    encoding: "utf8",
    timeout: 3000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
    ...options,
  });
  return stdout.trim();
}

function addProcess(map, port, pid) {
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isInteger(pid) || pid < 1) return;
  const pids = map.get(port) || new Set();
  pids.add(pid);
  map.set(port, pids);
}

export function parseLsofProcesses(output) {
  const result = new Map();
  let pid = null;
  for (const line of output.split("\n")) {
    if (line.startsWith("p")) {
      pid = Number(line.slice(1));
    } else if (pid && line.startsWith("n")) {
      const port = Number(line.match(/:(\d+)(?:$|\s)/)?.[1]);
      addProcess(result, port, pid);
    }
  }
  return result;
}

export function parseSsProcesses(output) {
  const result = new Map();
  for (const line of output.split("\n")) {
    const port = Number(line.match(/(?:\]|[^\s]):(\d+)\s/)?.[1]);
    for (const match of line.matchAll(/pid=(\d+)/g)) addProcess(result, port, Number(match[1]));
  }
  return result;
}

export function parseWindowsConnections(output) {
  const result = new Map();
  if (!output) return result;
  const parsed = JSON.parse(output);
  for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
    addProcess(result, Number(item.LocalPort), Number(item.OwningProcess));
  }
  return result;
}

async function powershell(script, timeout = 5000) {
  return run("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], { timeout });
}

export async function getListeningProcesses() {
  if (process.platform === "win32") {
    const output = await powershell("Get-NetTCPConnection -State Listen | Select-Object LocalPort,OwningProcess | ConvertTo-Json -Compress");
    return parseWindowsConnections(output);
  }
  if (process.platform === "linux") {
    try {
      return parseSsProcesses(await run("ss", ["-H", "-ltnp"]));
    } catch {
      // Some minimal distributions omit ss; lsof remains a supported fallback.
    }
  }
  return parseLsofProcesses(await run("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpn"]));
}

function commandPathCandidates(commandLine = "") {
  const candidates = [];
  for (const match of commandLine.matchAll(/"([^"]+)"|'([^']+)'|(\S+)/g)) {
    const token = (match[1] || match[2] || match[3]).replace(/^--?[^=]+=/, "");
    if (path.win32.isAbsolute(token)) candidates.push(token);
  }
  return candidates;
}

async function windowsProcessChain(pid) {
  const script = [
    `$id=${pid}; $items=@();`,
    "for($i=0;$i -lt 8 -and $id -gt 0;$i++){",
    "$p=Get-CimInstance Win32_Process -Filter \"ProcessId=$id\" -ErrorAction SilentlyContinue;",
    "if(!$p){break}; $items += $p | Select-Object ProcessId,ParentProcessId,CommandLine,ExecutablePath; $id=$p.ParentProcessId",
    "}; $items | ConvertTo-Json -Compress",
  ].join(" ");
  const output = await powershell(script);
  if (!output) return [];
  const parsed = JSON.parse(output);
  return Array.isArray(parsed) ? parsed : [parsed];
}

export async function getProcessCwdCandidates(pid) {
  if (process.platform === "linux") {
    try { return [await fs.readlink(`/proc/${pid}/cwd`)]; } catch { return []; }
  }
  if (process.platform === "darwin") {
    try {
      const output = await run("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]);
      const cwd = output.split("\n").find((line) => line.startsWith("n"))?.slice(1);
      return cwd ? [cwd] : [];
    } catch { return []; }
  }
  if (process.platform === "win32") {
    try {
      const candidates = [];
      for (const item of await windowsProcessChain(pid)) {
        candidates.push(...commandPathCandidates(item.CommandLine), item.ExecutablePath);
      }
      return [...new Set(candidates.filter(Boolean).flatMap((candidate) => {
        const normalized = path.win32.normalize(candidate);
        return [normalized, path.win32.dirname(normalized)];
      }))];
    } catch { return []; }
  }
  return [];
}

function formatUptime(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  return `${hours}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export async function getProcessInfo(pid) {
  try {
    if (process.platform === "win32") {
      const script = `$p=Get-Process -Id ${pid} -ErrorAction Stop; $c=Get-CimInstance Win32_Process -Filter \"ProcessId=${pid}\"; [pscustomobject]@{StartTime=$p.StartTime.ToUniversalTime().ToString('o');Memory=$p.WorkingSet64;Command=$c.CommandLine} | ConvertTo-Json -Compress`;
      const info = JSON.parse(await powershell(script));
      return {
        uptime: formatUptime(Date.now() - Date.parse(info.StartTime)),
        memoryMb: Math.round(Number(info.Memory) / 1024 / 1024),
        command: info.Command,
      };
    }
    const output = await run("ps", ["-p", String(pid), "-o", "etime=,rss=,%cpu=,command="]);
    const match = output.match(/^(\S+)\s+(\d+)\s+([\d.]+)\s+(.+)$/);
    return match ? { uptime: match[1], memoryMb: Math.round(Number(match[2]) / 1024), cpuPercent: Number(match[3]), command: match[4] } : {};
  } catch { return {}; }
}

async function tryCommands(commands) {
  let lastError;
  for (const [command, args] of commands) {
    try { await run(command, args, { timeout: 10000 }); return; } catch (error) { lastError = error; }
  }
  throw lastError;
}

export async function openLocalAction(action, cwd) {
  if (process.platform === "darwin") {
    if (action === "finder") return run("open", [cwd]);
    if (action === "terminal") return run("open", ["-a", "Terminal", cwd]);
    if (action === "editor") return tryCommands([["open", ["-a", "Cursor", cwd]], ["open", ["-a", "Visual Studio Code", cwd]]]);
  }
  if (process.platform === "linux") {
    if (action === "finder") return run("xdg-open", [cwd]);
    if (action === "terminal") return tryCommands([["x-terminal-emulator", ["--working-directory", cwd]], ["gnome-terminal", ["--working-directory", cwd]], ["konsole", ["--workdir", cwd]]]);
    if (action === "editor") return tryCommands([["cursor", [cwd]], ["code", [cwd]]]);
  }
  if (process.platform === "win32") {
    const quoted = cwd.replace(/'/g, "''");
    if (action === "finder") return powershell(`Start-Process explorer.exe -ArgumentList '${quoted}'`);
    if (action === "terminal") return powershell(`Start-Process wt.exe -WorkingDirectory '${quoted}'`);
    if (action === "editor") return powershell(`if(Get-Command cursor -ErrorAction SilentlyContinue){Start-Process cursor -ArgumentList '${quoted}'}else{Start-Process code -ArgumentList '${quoted}'}`);
  }
  throw new Error(`Unsupported platform or action: ${process.platform}/${action}`);
}
