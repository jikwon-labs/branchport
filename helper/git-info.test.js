import test from "node:test";
import assert from "node:assert/strict";
import { parseListeningProcesses, parseLsofCwd, parsePids } from "./git-info.js";

test("parsePids removes duplicates and empty lines", () => {
  assert.deepEqual(parsePids("123\n456\n123\n"), [123, 456]);
});

test("parseLsofCwd extracts a path", () => {
  assert.equal(parseLsofCwd("p123\nfcwd\nn/Users/me/project\n"), "/Users/me/project");
});

test("parseListeningProcesses groups unique pids by port", () => {
  const result = parseListeningProcesses([
    "p123", "n*:3000", "p456", "n127.0.0.1:3000", "n[::1]:4173", "p123", "n*:3000",
  ].join("\n"));
  assert.deepEqual([...result], [[3000, new Set([123, 456])], [4173, new Set([456])]]);
});
