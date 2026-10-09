import os from "node:os";
import path from "node:path";
import { HELPER_PORT } from "./constants.js";
import { inspectAllPorts } from "./git-info.js";

const COLUMNS = ["PORT", "BRANCH", "STATUS", "WORKTREE", "PID", "UPTIME"];
const ANSI = {
  bold: "1",
  dim: "2",
  red: "31",
  orange: "38;5;208",
  blue: "34",
  purple: "35",
};

// Mirrors colorFor in extension/content.js so the terminal and the page label agree.
export function branchColor(info) {
  if (info.dirty) return "orange";
  if (/^(main|master|production)$/.test(info.branch)) return "red";
  if (/^(fix|hotfix)\//.test(info.branch)) return "orange";
  if (/^(feat|feature)\//.test(info.branch)) return "blue";
  return "purple";
}

export function shouldUseColor({ isTTY, env }) {
  return Boolean(isTTY) && !env.NO_COLOR;
}

export function paint(text, style, color) {
  return color && style ? `\x1b[${ANSI[style]}m${text}\x1b[0m` : text;
}

export function formatStatus(info) {
  const parts = [];
  if (info.dirty) parts.push("●");
  if (info.ahead) parts.push(`↑${info.ahead}`);
  if (info.behind) parts.push(`↓${info.behind}`);
  return parts.join(" ") || "-";
}

export function shortenPath(value, home = os.homedir(), sep = path.sep) {
  if (!value || !home) return value || "-";
  if (value === home) return "~";
  return value.startsWith(home + sep) ? `~${value.slice(home.length)}` : value;
}

// Docker ports have no app PID, so the column names the Compose service instead.
export function formatPid(info) {
  if (info.source === "docker") return `docker:${info.container?.service || info.container?.name || "?"}`;
  return String(info.pid ?? "-");
}

// Pads before painting so escape codes never count toward column widths.
export function formatTable(servers, { color = false, home, sep } = {}) {
  const rows = servers.map((info) => [
    { text: String(info.port) },
    { text: info.branch, style: branchColor(info) },
    { text: formatStatus(info), style: info.dirty ? "orange" : null },
    { text: shortenPath(info.root, home, sep) },
    { text: formatPid(info) },
    { text: info.uptime || "-" },
  ]);
  const header = COLUMNS.map((text) => ({ text, style: "bold" }));
  const widths = COLUMNS.map((_, index) => Math.max(...[header, ...rows].map((row) => row[index].text.length)));
  return [header, ...rows].map((row) => row.map((cell, index) => {
    const text = index === row.length - 1 ? cell.text : cell.text.padEnd(widths[index]);
    return paint(text, cell.style, color);
  }).join("  ")).join("\n");
}

export function formatDetail(info, { color = false, home, sep } = {}) {
  const fields = [
    ["Port", String(info.port)],
    ["Repository", info.repository],
    ["Branch", paint(info.branch, branchColor(info), color)],
    ["Status", paint(formatStatus(info), info.dirty ? "orange" : null, color)],
    ["Commit", info.commit],
    ["Worktree", shortenPath(info.root, home, sep)],
    ["Cwd", shortenPath(info.cwd, home, sep)],
    ...(info.source === "docker" ? [
      ["Container", info.container?.name || "-"],
      ["Service", info.container?.service || "-"],
      ["Image", info.container?.image || "-"],
      ["Uptime", info.uptime || "-"],
    ] : [
      ["PID", String(info.pid ?? "-")],
      ["Uptime", info.uptime || "-"],
      ["CPU", info.cpuPercent == null ? "-" : `${info.cpuPercent}%`],
      ["Memory", info.memoryMb == null ? "-" : `${info.memoryMb} MB`],
      ["Command", info.command || "-"],
    ]),
  ];
  if (info.duplicate) fields.push(["Also on", info.duplicatePorts.join(", ")]);
  const width = Math.max(...fields.map(([label]) => label.length));
  return fields.map(([label, value]) => `${paint(label.padEnd(width), "dim", color)}  ${value}`).join("\n");
}

export function parseLsArgs(args) {
  const options = { json: false, port: null };
  for (const arg of args) {
    if (arg === "--json") {
      options.json = true;
    } else if (/^\d+$/.test(arg) && options.port === null) {
      const port = Number(arg);
      if (port < 1 || port > 65535) throw new Error(`Invalid port: ${arg}`);
      options.port = port;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  return options;
}

// Reads ports directly instead of calling the helper's /servers endpoint, which is
// reserved for the extension, so this works whether or not the service is running.
export async function runLs(args, { stdout = process.stdout, stderr = process.stderr, env = process.env } = {}) {
  let options;
  try {
    options = parseLsArgs(args);
  } catch (error) {
    stderr.write(`${error.message}\nUsage: branchport ls [port] [--json]\n`);
    return 1;
  }

  const color = shouldUseColor({ isTTY: stdout.isTTY, env });
  const servers = await inspectAllPorts(HELPER_PORT);

  if (options.port !== null) {
    const server = servers.find((item) => item.port === options.port);
    if (!server) {
      stderr.write(`No Git-backed server is listening on port ${options.port}.\n`);
      return 1;
    }
    stdout.write(`${options.json ? JSON.stringify(server, null, 2) : formatDetail(server, { color })}\n`);
    return 0;
  }

  if (options.json) {
    stdout.write(`${JSON.stringify(servers, null, 2)}\n`);
  } else if (servers.length === 0) {
    stdout.write("No Git-backed localhost servers found.\n");
  } else {
    stdout.write(`${formatTable(servers, { color })}\n`);
  }
  return 0;
}
