import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// helper-version.js is a classic extension script, so load it into a sandbox.
const context = {};
vm.runInNewContext(`${readFileSync(new URL("./helper-version.js", import.meta.url), "utf8")}\nthis.api = { MIN_HELPER_API_VERSION, helperStatus };`, context);
const { MIN_HELPER_API_VERSION, helperStatus } = context.api;

test("a helper at or above the minimum API version is ok", () => {
  assert.equal(helperStatus({ ok: true, version: "0.4.0", apiVersion: MIN_HELPER_API_VERSION }), "ok");
  assert.equal(helperStatus({ ok: true, apiVersion: 3 }, 2), "ok");
});

test("a helper below the minimum API version is outdated", () => {
  assert.equal(helperStatus({ ok: true, apiVersion: 1 }, 2), "outdated");
});

test("a helper that predates the version check is outdated", () => {
  assert.equal(helperStatus({ ok: true }), "outdated");
  assert.equal(helperStatus({ ok: true, apiVersion: "2" }), "outdated");
});

test("no response means the helper is unreachable", () => {
  assert.equal(helperStatus(null), "unreachable");
  assert.equal(helperStatus({}), "unreachable");
});
