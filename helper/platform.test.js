import test from "node:test";
import assert from "node:assert/strict";
import { parseLsofProcesses, parseSsProcesses, parseWindowsConnections } from "./platform.js";

test("parses lsof listeners", () => {
  assert.deepEqual([...parseLsofProcesses("p12\nn*:3000\np34\nn127.0.0.1:4173")], [[3000, new Set([12])], [4173, new Set([34])]]);
});

test("parses Linux ss listeners", () => {
  const output = 'LISTEN 0 511 *:3000 *:* users:(("node",pid=123,fd=20))\nLISTEN 0 511 [::1]:4173 [::]:* users:(("node",pid=456,fd=21))';
  assert.deepEqual([...parseSsProcesses(output)], [[3000, new Set([123])], [4173, new Set([456])]]);
});

test("parses Windows TCP connections", () => {
  const output = JSON.stringify([{ LocalPort: 3000, OwningProcess: 123 }, { LocalPort: 3000, OwningProcess: 123 }, { LocalPort: 4173, OwningProcess: 456 }]);
  assert.deepEqual([...parseWindowsConnections(output)], [[3000, new Set([123])], [4173, new Set([456])]]);
});
