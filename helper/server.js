import http from "node:http";
import { inspectAllPorts, inspectPort } from "./git-info.js";
import { openLocalAction } from "./platform.js";
import { extensionOrigin, isExtensionRequest } from "./auth.js";

const HOST = "127.0.0.1";
const HELPER_PORT = Number(process.env.LOCAL_WORKTREE_HELPER_PORT || 32190);
const lookupCache = new Map();
const LOOKUP_CACHE_MS = 2000;
const serversCache = new Map();

async function readBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 8192) throw new Error("Request too large");
  }
  return JSON.parse(body);
}

function sendJson(request, response, status, body) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Localhost-Worktree-Token",
    "Cache-Control": "no-store",
  };
  const origin = extensionOrigin(request.headers);
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  response.writeHead(status, headers);
  response.end(JSON.stringify(body));
}

// Results differ with the extension's Docker setting, so it is part of each cache key.
function inspectPortCached(port, docker) {
  const now = Date.now();
  for (const [key, entry] of lookupCache) {
    if (entry.settled && entry.expiresAt <= now) lookupCache.delete(key);
  }
  const key = `${port}:${docker}`;
  const cached = lookupCache.get(key);
  if (cached && (!cached.settled || cached.expiresAt > now)) return cached.promise;
  const entry = { expiresAt: Infinity, settled: false, promise: null };
  const promise = inspectPort(port, { docker }).catch((error) => {
    lookupCache.delete(key);
    throw error;
  }).finally(() => {
    entry.settled = true;
    entry.expiresAt = Date.now() + LOOKUP_CACHE_MS;
  });
  entry.promise = promise;
  lookupCache.set(key, entry);
  return promise;
}

function inspectAllPortsCached(docker) {
  const now = Date.now();
  const cached = serversCache.get(docker);
  if (cached && (!cached.settled || cached.expiresAt > now)) return cached.promise;
  const entry = { expiresAt: Infinity, settled: false, promise: null };
  entry.promise = inspectAllPorts(HELPER_PORT, { docker }).catch((error) => {
    if (serversCache.get(docker) === entry) serversCache.delete(docker);
    throw error;
  }).finally(() => {
    entry.settled = true;
    entry.expiresAt = Date.now() + LOOKUP_CACHE_MS;
  });
  serversCache.set(docker, entry);
  return entry.promise;
}

const server = http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    return extensionOrigin(request.headers)
      ? sendJson(request, response, 204, {})
      : sendJson(request, response, 403, { error: "Only the extension may access this helper" });
  }

  const url = new URL(request.url, `http://${HOST}:${HELPER_PORT}`);

  if (url.pathname === "/kill" && request.method === "POST") {
    if (!isExtensionRequest(request.headers)) {
      return sendJson(request, response, 403, { error: "Only the extension may stop a server" });
    }

    try {
      const { port, pid } = await readBody(request);
      const current = await inspectPort(Number(port));
      // Docker ports belong to docker-proxy or Docker Desktop, never the app itself.
      if (current?.source === "docker") {
        return sendJson(request, response, 409, { error: "Docker containers can't be stopped from Branchport" });
      }
      if (!current || current.pid !== Number(pid) || current.pid === process.pid) {
        return sendJson(request, response, 409, { error: "The process no longer matches this port" });
      }
      process.kill(current.pid, "SIGTERM");
      for (const key of lookupCache.keys()) if (key.startsWith(`${current.port}:`)) lookupCache.delete(key);
      return sendJson(request, response, 200, { ok: true, port: current.port, pid: current.pid });
    } catch (error) {
      return sendJson(request, response, 400, { error: error.message });
    }
  }

  if (url.pathname === "/action" && request.method === "POST") {
    if (!isExtensionRequest(request.headers)) {
      return sendJson(request, response, 403, { error: "Only the extension may open local apps" });
    }

    try {
      const { port, pid, container, action } = await readBody(request);
      const current = await inspectPort(Number(port));
      const matches = current?.source === "docker"
        ? current.container.id === container
        : current?.pid === Number(pid);
      if (!matches) {
        return sendJson(request, response, 409, { error: "The process no longer matches this port" });
      }
      if (!["finder", "terminal", "editor"].includes(action)) {
        return sendJson(request, response, 400, { error: "Unknown action" });
      }
      await openLocalAction(action, current.cwd);
      return sendJson(request, response, 200, { ok: true });
    } catch (error) {
      return sendJson(request, response, 400, { error: error.message });
    }
  }

  if (request.method !== "GET") return sendJson(request, response, 405, { error: "Method not allowed" });

  if (url.pathname === "/health") return sendJson(request, response, 200, { ok: true });

  if (!isExtensionRequest(request.headers)) {
    return sendJson(request, response, 403, { error: "Only the extension may access this helper" });
  }

  // Older extensions omit the parameter, so Docker lookups stay on unless docker=0.
  const docker = url.searchParams.get("docker") !== "0";

  if (url.pathname === "/servers") {
    try {
      return sendJson(request, response, 200, { servers: await inspectAllPortsCached(docker) });
    } catch (error) {
      return sendJson(request, response, 500, { error: error.message });
    }
  }

  if (url.pathname === "/lookup") {
    const port = Number(url.searchParams.get("port"));
    if (!Number.isInteger(port) || port < 1 || port > 65535 || port === HELPER_PORT) {
      return sendJson(request, response, 400, { error: "A valid localhost port is required" });
    }

    try {
      const result = await inspectPortCached(port, docker);
      return result
        ? sendJson(request, response, 200, result)
        : sendJson(request, response, 404, { error: "No Git worktree found for this port" });
    } catch (error) {
      return sendJson(request, response, 500, { error: error.message });
    }
  }

  return sendJson(request, response, 404, { error: "Not found" });
});

server.listen(HELPER_PORT, HOST, () => {
  console.log(`Branchport helper: http://${HOST}:${HELPER_PORT}`);
});

function shutdown(signal) {
  console.log(`Received ${signal}; shutting down localhost worktree helper`);
  server.close(() => process.exit(0));
  server.closeIdleConnections?.();
  setTimeout(() => process.exit(1), 5000).unref();
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
