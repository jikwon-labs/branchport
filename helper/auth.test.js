import test from "node:test";
import assert from "node:assert/strict";
import { EXTENSION_ORIGIN, extensionOrigin, isExtensionRequest } from "./auth.js";

const token = { "x-localhost-worktree-token": "branchport-v1" };

test("accepts an extension request that omits Origin", () => {
  assert.equal(isExtensionRequest({ ...token }), true);
});

test("accepts an extension request that sends the extension origin", () => {
  assert.equal(isExtensionRequest({ ...token, origin: EXTENSION_ORIGIN }), true);
});

test("rejects a web page origin", () => {
  assert.equal(isExtensionRequest({ ...token, origin: "http://localhost:3000" }), false);
  assert.equal(isExtensionRequest({ ...token, origin: "chrome-extension://aaaabbbbccccddddeeeeffffgggghhhh" }), false);
});

test("rejects a missing or wrong token", () => {
  assert.equal(isExtensionRequest({}), false);
  assert.equal(isExtensionRequest({ "x-localhost-worktree-token": "wrong" }), false);
});

test("keeps the preflight origin check strict", () => {
  assert.equal(extensionOrigin({ origin: EXTENSION_ORIGIN }), EXTENSION_ORIGIN);
  assert.equal(extensionOrigin({}), null);
  assert.equal(extensionOrigin({ origin: "http://localhost:3000" }), null);
});
