import path from "node:path";
import { getListeningProcesses, getProcessCwdCandidates, getProcessInfo, parseLsofProcesses, run } from "./platform.js";

export function parsePids(output) {
  return [...new Set(output.split(/\s+/).filter(Boolean).map(Number).filter(Number.isInteger))];
}

export function parseLsofCwd(output) {
  const line = output.split("\n").find((value) => value.startsWith("n"));
  return line?.slice(1) || null;
}

export function parseListeningProcesses(output) {
  return parseLsofProcesses(output);
}

export async function findListeningPids(port) {
  try {
    return [...(await getListeningProcesses()).get(port) || []];
  } catch {
    return [];
  }
}

export async function findProcessCwd(pid) {
  return (await getProcessCwdCandidates(pid))[0] || null;
}

async function readGitInfo(cwd) {
  try {
    const root = await run("git", ["-C", cwd, "rev-parse", "--show-toplevel"]);
    let branch = await run("git", ["-C", cwd, "branch", "--show-current"]);
    const commit = await run("git", ["-C", cwd, "rev-parse", "--short", "HEAD"]);
    const commonDir = await run("git", ["-C", cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"]);
    const projectRoot = path.basename(commonDir) === ".git" ? path.dirname(commonDir) : root;
    if (!branch) branch = `detached@${commit}`;

    let dirty = false;
    try {
      dirty = Boolean(await run("git", ["-C", cwd, "status", "--porcelain"]));
    } catch {}

    let ahead = 0;
    let behind = 0;
    try {
      const divergence = await run("git", ["-C", cwd, "rev-list", "--left-right", "--count", "@{upstream}...HEAD"]);
      [behind, ahead] = divergence.split(/\s+/).map(Number);
    } catch {}

    return {
      cwd,
      root,
      projectRoot,
      repository: path.basename(projectRoot),
      worktree: path.basename(cwd),
      branch,
      commit,
      dirty,
      ahead,
      behind,
    };
  } catch {
    return null;
  }
}

async function readProcessInfo(pid) {
  return getProcessInfo(pid);
}

async function inspectPortWithContext(port, context = {}) {
  const pids = context.pids || await findListeningPids(port);

  for (const pid of pids) {
    let cwdPromise = context.cwdByPid?.get(pid);
    if (!cwdPromise) {
      cwdPromise = getProcessCwdCandidates(pid);
      context.cwdByPid?.set(pid, cwdPromise);
    }
    let git = null;
    for (const cwd of await cwdPromise) {
      let gitPromise = context.gitByCwd?.get(cwd);
      if (!gitPromise) {
        gitPromise = readGitInfo(cwd);
        context.gitByCwd?.set(cwd, gitPromise);
      }
      git = await gitPromise;
      if (git) break;
    }
    if (!git) continue;
    let processPromise = context.processByPid?.get(pid);
    if (!processPromise) {
      processPromise = readProcessInfo(pid);
      context.processByPid?.set(pid, processPromise);
    }
    return { port, pid, ...git, ...(await processPromise) };
  }

  return null;
}

export async function inspectPort(port) {
  return inspectPortWithContext(port);
}

export async function findListeningPorts() {
  try {
    return [...(await getListeningProcesses()).keys()].sort((a, b) => a - b);
  } catch {
    return [];
  }
}

async function findListeningProcesses() {
  try {
    return await getListeningProcesses();
  } catch {
    return new Map();
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function inspectAllPorts(excludedPort) {
  const listening = await findListeningProcesses();
  const ports = [...listening.keys()].filter((port) => port !== excludedPort).sort((a, b) => a - b);
  const context = { cwdByPid: new Map(), gitByCwd: new Map(), processByPid: new Map() };
  const results = await mapWithConcurrency(ports, 6, (port) => inspectPortWithContext(port, {
    ...context,
    pids: [...listening.get(port)],
  }));
  const servers = results.filter(Boolean).sort((a, b) => a.port - b.port);
  const byWorktree = new Map();
  for (const server of servers) {
    const entries = byWorktree.get(server.root) || [];
    entries.push(server);
    byWorktree.set(server.root, entries);
  }
  return servers.map((server) => {
    const duplicates = byWorktree.get(server.root) || [];
    return {
      ...server,
      duplicate: duplicates.length > 1,
      duplicatePorts: duplicates.filter((item) => item.port !== server.port).map((item) => item.port),
    };
  });
}
