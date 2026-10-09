import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDockerPortsCache, isDockerProcess, parseDockerInspect, parseDockerPs } from "./docker.js";
import { parseLsofProcesses, parseSsProcesses } from "./platform.js";

// Captured from Docker Desktop 29.3.1 on macOS with Compose 5.1.1 (home paths replaced).
const psOutput = readFileSync(new URL("./fixtures/docker-ps.txt", import.meta.url), "utf8");
const inspectOutput = readFileSync(new URL("./fixtures/docker-inspect.jsonl", import.meta.url), "utf8");

test("parseDockerPs keeps only containers that publish a host port", () => {
  assert.deepEqual(parseDockerPs(psOutput), ["12e8562e4155", "132f9d4e4a6a"]);
});

test("parseDockerPs ignores blank and malformed lines", () => {
  assert.deepEqual(parseDockerPs(""), []);
  assert.deepEqual(parseDockerPs('not json\n\n{"ID":"abc","Ports":"0.0.0.0:80->80/tcp"}\n'), ["abc"]);
});

test("parseDockerInspect maps host ports to Compose containers", () => {
  const ports = parseDockerInspect(inspectOutput);
  assert.deepEqual([...ports.keys()], [3100, 5003]);
  assert.deepEqual(ports.get(3100), {
    id: "12e8562e4155",
    name: "metabase-local",
    service: "metabase",
    project: "metabase-local",
    image: "metabase/metabase:latest",
    workingDir: "/Users/dev/metabase-local",
    startedAt: "2026-09-26T07:11:36.923555093Z",
  });
  // The IPv4 and IPv6 bindings of one port resolve to the same container.
  assert.equal(ports.get(5003).name, "docker-plugin_daemon-1");
  assert.equal(ports.get(5003).workingDir, "/Users/dev/Documents/playground/dify/docker");
});

test("parseDockerInspect skips UDP, unpublished ports, and missing labels", () => {
  const output = JSON.stringify({
    Id: "0123456789abcdef",
    Name: "/plain-run",
    State: { StartedAt: "2026-10-01T00:00:00Z" },
    Config: { Image: "nginx", Labels: null },
    NetworkSettings: { Ports: { "53/udp": [{ HostIp: "0.0.0.0", HostPort: "5353" }], "80/tcp": [{ HostIp: "0.0.0.0", HostPort: "8080" }], "443/tcp": null } },
  });
  const ports = parseDockerInspect(output);
  assert.deepEqual([...ports.keys()], [8080]);
  assert.equal(ports.get(8080).workingDir, null);
  assert.equal(ports.get(8080).service, null);
});

test("isDockerProcess recognizes the processes that publish container ports", () => {
  for (const name of ["docker-proxy", "com.docker.backend", "com.docker.backend.exe", "/usr/bin/docker-proxy", "vpnkit-bridge", "rootlessport"]) {
    assert.equal(isDockerProcess(name), true, name);
  }
  for (const name of ["node", "dockerd-helper-app", "python3", undefined, ""]) assert.equal(isDockerProcess(name), false, name);
});

test("listener parsers record process names", () => {
  const lsofNames = new Map();
  parseLsofProcesses("p35968\nccom.docker.backend\nf170\nn127.0.0.1:3100\np12\ncnode\nn*:5173", lsofNames);
  assert.deepEqual([...lsofNames], [[35968, "com.docker.backend"], [12, "node"]]);

  const ssNames = new Map();
  const ss = 'LISTEN 0 4096 0.0.0.0:3100 0.0.0.0:* users:(("docker-proxy",pid=2201,fd=7))\nLISTEN 0 511 *:5173 *:* users:(("node",pid=456,fd=21))';
  assert.deepEqual([...parseSsProcesses(ss, ssNames)], [[3100, new Set([2201])], [5173, new Set([456])]]);
  assert.deepEqual([...ssNames], [[2201, "docker-proxy"], [456, "node"]]);
});

test("createDockerPortsCache shares one in-flight read and reuses it for 2s", async () => {
  let clock = 0;
  let calls = 0;
  const getPorts = createDockerPortsCache(async () => { calls += 1; return new Map([[80, {}]]); }, () => clock);
  await Promise.all([getPorts(), getPorts(), getPorts()]);
  assert.equal(calls, 1);
  clock = 1999;
  await getPorts();
  assert.equal(calls, 1);
  clock = 2000;
  assert.equal((await getPorts()).size, 1);
  assert.equal(calls, 2);
});

test("createDockerPortsCache remembers a failed read for 30s", async () => {
  let clock = 0;
  let calls = 0;
  const getPorts = createDockerPortsCache(async () => { calls += 1; throw new Error("timeout"); }, () => clock);
  assert.equal((await getPorts()).size, 0);
  clock = 29999;
  await getPorts();
  assert.equal(calls, 1);
  clock = 30000;
  await getPorts();
  assert.equal(calls, 2);
});
