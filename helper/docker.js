import path from "node:path";
import { formatUptime, run } from "./platform.js";

const DOCKER_TIMEOUT_MS = 2000;
const DOCKER_CACHE_MS = 2000;
const DOCKER_FAILURE_CACHE_MS = 30000;
const WORKING_DIR_LABEL = "com.docker.compose.project.working_dir";

// Processes that publish container ports on the host: docker-proxy on Linux,
// rootlesskit/rootlessport for rootless Docker, and the Docker Desktop backend
// (com.docker.backend, older vpnkit builds) on macOS, Windows, and Linux.
const DOCKER_PROCESS = /^(docker-proxy|rootlessport|rootlesskit|com\.docker\.|vpnkit)/i;

export function isDockerProcess(command) {
  return Boolean(command) && DOCKER_PROCESS.test(path.basename(command));
}

// Services such as launchd start the helper with a minimal PATH that omits the
// usual Docker CLI locations.
const EXTRA_PATHS = {
  darwin: ["/usr/local/bin", "/opt/homebrew/bin", "/Applications/Docker.app/Contents/Resources/bin"],
  linux: ["/usr/local/bin", "/usr/bin", "/snap/bin"],
  win32: [],
};

function dockerEnv() {
  const extra = EXTRA_PATHS[process.platform] || [];
  const current = process.env.PATH || "";
  return { ...process.env, PATH: [current, ...extra].filter(Boolean).join(path.delimiter) };
}

// `docker ps --format '{{json .}}'` prints one object per line. Its Labels field
// is a comma-joined string that cannot be split reliably, so it is used only to
// pick containers that publish at least one host port.
export function parseDockerPs(output) {
  const ids = [];
  for (const line of output.split("\n")) {
    if (!line.trim()) continue;
    try {
      const container = JSON.parse(line);
      if (container.ID && /->/.test(container.Ports || "")) ids.push(container.ID);
    } catch {}
  }
  return ids;
}

// `docker inspect --format '{{json .}}'` prints one object per line. Maps each
// published TCP host port to the container that owns it.
export function parseDockerInspect(output) {
  const result = new Map();
  for (const line of output.split("\n")) {
    if (!line.trim()) continue;
    let container;
    try { container = JSON.parse(line); } catch { continue; }
    const labels = container.Config?.Labels || {};
    const info = {
      id: container.Id?.slice(0, 12) || null,
      name: container.Name?.replace(/^\//, "") || null,
      service: labels["com.docker.compose.service"] || null,
      project: labels["com.docker.compose.project"] || null,
      image: container.Config?.Image || null,
      workingDir: labels[WORKING_DIR_LABEL] || null,
      startedAt: container.State?.StartedAt || null,
    };
    for (const [containerPort, bindings] of Object.entries(container.NetworkSettings?.Ports || {})) {
      if (!containerPort.endsWith("/tcp")) continue;
      for (const binding of bindings || []) {
        const port = Number(binding.HostPort);
        if (Number.isInteger(port) && port > 0 && port <= 65535 && !result.has(port)) result.set(port, info);
      }
    }
  }
  return result;
}

async function readDockerPorts() {
  const options = { timeout: DOCKER_TIMEOUT_MS, env: dockerEnv() };
  const ids = parseDockerPs(await run("docker", ["ps", "--format", "{{json .}}"], options));
  if (!ids.length) return new Map();
  let output;
  try {
    output = await run("docker", ["inspect", "--format", "{{json .}}", ...ids], { ...options, maxBuffer: 16 * 1024 * 1024 });
  } catch (error) {
    // A container that stops between ps and inspect fails the command, but the
    // remaining containers are still printed.
    output = error.stdout || "";
  }
  return parseDockerInspect(output);
}

// One `docker ps` per scan: concurrent callers share the in-flight request and
// the result is reused briefly. A missing CLI or stopped daemon yields no ports.
// Failures are remembered longer: after Docker Desktop quits, its socket file stays
// behind and `docker ps` hangs until the timeout, which would otherwise delay every scan.
export function createDockerPortsCache(read, now = Date.now) {
  let cache = null;
  return function getPorts() {
    if (cache && (!cache.settled || cache.expiresAt > now())) return cache.promise;
    const entry = { expiresAt: Infinity, settled: false, promise: null };
    entry.promise = read().then(
      (ports) => ({ ports, ttl: DOCKER_CACHE_MS }),
      () => ({ ports: new Map(), ttl: DOCKER_FAILURE_CACHE_MS }),
    ).then(({ ports, ttl }) => {
      entry.settled = true;
      entry.expiresAt = now() + ttl;
      return ports;
    });
    cache = entry;
    return entry.promise;
  };
}

export const getDockerPorts = createDockerPortsCache(readDockerPorts);

export function dockerServerInfo(container) {
  return {
    source: "docker",
    pid: null,
    container: {
      id: container.id,
      name: container.name,
      service: container.service,
      project: container.project,
      image: container.image,
    },
    uptime: container.startedAt ? formatUptime(Date.now() - Date.parse(container.startedAt)) : undefined,
  };
}
