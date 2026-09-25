import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// i18n.js is a classic extension script, so load it into a sandbox with a stubbed chrome.i18n.
function load(uiLanguage) {
  const context = { chrome: { i18n: { getUILanguage: () => uiLanguage } } };
  vm.runInNewContext(`${readFileSync(new URL("./i18n.js", import.meta.url), "utf8")}\nthis.api = { MESSAGES, resolveLanguage, translate };`, context);
  return context.api;
}

test("English and Korean define the same keys", () => {
  const { MESSAGES } = load("en");
  assert.deepEqual(Object.keys(MESSAGES.ko).sort(), Object.keys(MESSAGES.en).sort());
});

test("auto follows the Chrome UI language", () => {
  assert.equal(load("ko").resolveLanguage("auto"), "ko");
  assert.equal(load("ko-KR").resolveLanguage("auto"), "ko");
  assert.equal(load("en-US").resolveLanguage("auto"), "en");
  assert.equal(load("ja").resolveLanguage("auto"), "en");
});

test("an explicit language overrides the Chrome UI language", () => {
  assert.equal(load("ko").resolveLanguage("en"), "en");
  assert.equal(load("en").resolveLanguage("ko"), "ko");
});

test("translate formats messages that take arguments", () => {
  const { translate } = load("en");
  assert.equal(translate("en", "duplicate", [3000, 3001]), "This worktree is also open on :3000, :3001.");
  assert.equal(translate("ko", "stop"), "종료");
});
