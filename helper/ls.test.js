import test from "node:test";
import assert from "node:assert/strict";
import { branchColor, formatDetail, formatStatus, formatTable, parseLsArgs, shortenPath, shouldUseColor } from "./ls.js";

const server = (overrides = {}) => ({
  port: 3000,
  pid: 4321,
  branch: "main",
  dirty: false,
  ahead: 0,
  behind: 0,
  root: "/Users/me/projects/app",
  cwd: "/Users/me/projects/app",
  repository: "app",
  commit: "abc1234",
  uptime: "01:02:03",
  duplicate: false,
  duplicatePorts: [],
  ...overrides,
});

test("branchColor follows the README color rules", () => {
  assert.equal(branchColor(server({ branch: "main" })), "red");
  assert.equal(branchColor(server({ branch: "master" })), "red");
  assert.equal(branchColor(server({ branch: "production" })), "red");
  assert.equal(branchColor(server({ branch: "fix/login" })), "orange");
  assert.equal(branchColor(server({ branch: "hotfix/crash" })), "orange");
  assert.equal(branchColor(server({ branch: "feat/ls" })), "blue");
  assert.equal(branchColor(server({ branch: "feature/ls" })), "blue");
  assert.equal(branchColor(server({ branch: "chore/deps" })), "purple");
  assert.equal(branchColor(server({ branch: "main-old" })), "purple");
});

test("branchColor treats a dirty worktree as orange regardless of branch", () => {
  assert.equal(branchColor(server({ branch: "main", dirty: true })), "orange");
  assert.equal(branchColor(server({ branch: "feat/ls", dirty: true })), "orange");
});

test("shouldUseColor requires a TTY and respects NO_COLOR", () => {
  assert.equal(shouldUseColor({ isTTY: true, env: {} }), true);
  assert.equal(shouldUseColor({ isTTY: false, env: {} }), false);
  assert.equal(shouldUseColor({ isTTY: undefined, env: {} }), false);
  assert.equal(shouldUseColor({ isTTY: true, env: { NO_COLOR: "1" } }), false);
  assert.equal(shouldUseColor({ isTTY: true, env: { NO_COLOR: "" } }), true);
});

test("formatStatus shows dirty state and upstream divergence", () => {
  assert.equal(formatStatus(server()), "-");
  assert.equal(formatStatus(server({ dirty: true })), "●");
  assert.equal(formatStatus(server({ dirty: true, ahead: 2, behind: 1 })), "● ↑2 ↓1");
  assert.equal(formatStatus(server({ behind: 3 })), "↓3");
});

test("shortenPath replaces the home directory with ~", () => {
  assert.equal(shortenPath("/Users/me/projects/app", "/Users/me", "/"), "~/projects/app");
  assert.equal(shortenPath("/Users/me", "/Users/me", "/"), "~");
  assert.equal(shortenPath("/Users/meow/app", "/Users/me", "/"), "/Users/meow/app");
  assert.equal(shortenPath("C:\\Users\\me\\app", "C:\\Users\\me", "\\"), "~\\app");
});

test("formatTable aligns columns without color", () => {
  const output = formatTable([
    server(),
    server({ port: 5173, pid: 99, branch: "feat/ls", dirty: true, ahead: 2, root: "/Users/me/projects/app-ls", uptime: "12:00" }),
  ], { home: "/Users/me", sep: "/" });
  assert.equal(output, [
    "PORT  BRANCH   STATUS  WORKTREE           PID   UPTIME",
    "3000  main     -       ~/projects/app     4321  01:02:03",
    "5173  feat/ls  ● ↑2    ~/projects/app-ls  99    12:00",
  ].join("\n"));
});

test("formatTable keeps alignment when colored", () => {
  const output = formatTable([server(), server({ port: 8080, branch: "feat/ls" })], { color: true, home: "/Users/me", sep: "/" });
  const stripped = output.replace(/\x1b\[[\d;]*m/g, "");
  assert.equal(stripped, formatTable([server(), server({ port: 8080, branch: "feat/ls" })], { home: "/Users/me", sep: "/" }));
  assert.match(output, /\x1b\[31mmain {3}\x1b\[0m/);
  assert.match(output, /\x1b\[34mfeat\/ls\x1b\[0m/);
});

test("formatDetail lists one server and its duplicates", () => {
  const output = formatDetail(server({ duplicate: true, duplicatePorts: [3001], cpuPercent: 0.5, memoryMb: 120 }), { home: "/Users/me", sep: "/" });
  assert.match(output, /^Port {8}3000$/m);
  assert.match(output, /^Worktree {4}~\/projects\/app$/m);
  assert.match(output, /^Memory {6}120 MB$/m);
  assert.match(output, /^Also on {5}3001$/m);
  assert.doesNotMatch(output, /\x1b/);
});

test("parseLsArgs accepts a port and --json in any order", () => {
  assert.deepEqual(parseLsArgs([]), { json: false, port: null });
  assert.deepEqual(parseLsArgs(["--json"]), { json: true, port: null });
  assert.deepEqual(parseLsArgs(["5173", "--json"]), { json: true, port: 5173 });
  assert.deepEqual(parseLsArgs(["--json", "5173"]), { json: true, port: 5173 });
});

test("parseLsArgs rejects invalid input", () => {
  assert.throws(() => parseLsArgs(["0"]), /Invalid port/);
  assert.throws(() => parseLsArgs(["70000"]), /Invalid port/);
  assert.throws(() => parseLsArgs(["--yaml"]), /Unexpected argument/);
  assert.throws(() => parseLsArgs(["3000", "4000"]), /Unexpected argument/);
});
