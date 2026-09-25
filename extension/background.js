importScripts("i18n.js");

const HELPER = "http://127.0.0.1:32190";
const SERVERS_CACHE_KEY = "serversCache";
const cache = new Map();
const lookupRequests = new Map();
const lookupVersions = new Map();
const groupedTabs = new Map();
const defaults = { overlay: true, watermark: false, title: true, autoGroup: true, badge: "port", language: "auto" };
const settingKeys = new Set(Object.keys(defaults));
const helperHeaders = { "X-Localhost-Worktree-Token": "branchport-v1" };
let configCache = null;
let serversRequest = null;

function localhostPort(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) return null;
    return Number(url.port || (url.protocol === "https:" ? 443 : 80));
  } catch {
    return null;
  }
}

async function settings() {
  if (!configCache) configCache = { ...defaults, ...(await chrome.storage.sync.get(defaults)) };
  return configCache;
}

function branchColor(branch, dirty) {
  if (dirty) return "#d97706";
  if (/^(main|master|production)$/.test(branch)) return "#dc2626";
  if (/^(fix|hotfix)\//.test(branch)) return "#ea580c";
  if (/^(feat|feature)\//.test(branch)) return "#2563eb";
  return "#7c3aed";
}

async function updateTab(tabId, info) {
  const config = await settings();
  const text = info
    ? config.badge === "branch" ? info.branch.replace(/^.*\//, "").slice(0, 4) : String(info.port)
    : "";
  await chrome.action.setBadgeText({ tabId, text });
  if (info) await chrome.action.setBadgeBackgroundColor({ tabId, color: branchColor(info.branch, info.dirty) });
  chrome.tabs.sendMessage(tabId, { type: "WORKTREE_INFO", info, config }).catch(() => {});
  const groupKey = info ? `${info.repository}\0${info.worktree}` : null;
  if (info && config.autoGroup && groupedTabs.get(tabId) !== groupKey) {
    groupTab(tabId, info)
      .then(() => groupedTabs.set(tabId, groupKey))
      .catch(() => groupedTabs.delete(tabId));
  }
}

function groupColor(info) {
  if (/^(main|master|production)$/.test(info.branch)) return "red";
  if (/^(fix|hotfix)\//.test(info.branch)) return "orange";
  if (/^(feat|feature)\//.test(info.branch)) return "blue";
  return "purple";
}

async function groupTab(tabId, info) {
  const tab = await chrome.tabs.get(tabId);
  const title = `${info.repository} · ${info.worktree}`.slice(0, 80);
  const groups = await chrome.tabGroups.query({ windowId: tab.windowId });
  const existing = groups.find((group) => group.title === title);
  const groupId = await chrome.tabs.group(existing
    ? { groupId: existing.id, tabIds: [tabId] }
    : { createProperties: { windowId: tab.windowId }, tabIds: [tabId] });
  if (!existing) await chrome.tabGroups.update(groupId, { title, color: groupColor(info), collapsed: false });
}

function samePageInfo(previous, next) {
  return previous && ["port", "cwd", "branch", "commit", "dirty", "ahead", "behind"]
    .every((key) => previous[key] === next[key]);
}

function fetchPort(port) {
  if (!lookupRequests.has(port)) {
    const request = fetch(`${HELPER}/lookup?port=${port}`, {
      cache: "no-store",
      headers: helperHeaders,
      signal: AbortSignal.timeout(15000),
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Worktree not found")))
      .finally(() => lookupRequests.delete(port));
    lookupRequests.set(port, request);
  }
  return lookupRequests.get(port);
}

function fetchServers() {
  if (!serversRequest) {
    serversRequest = fetch(`${HELPER}/servers`, {
      cache: "no-store",
      headers: helperHeaders,
      signal: AbortSignal.timeout(30000),
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Server scan failed")))
      .finally(() => { serversRequest = null; });
  }
  return serversRequest;
}

async function lookup(tabId, url) {
  const port = localhostPort(url);
  if (!port || tabId == null) return null;
  const version = (lookupVersions.get(tabId) || 0) + 1;
  lookupVersions.set(tabId, version);
  try {
    const info = { ...(await fetchPort(port)) };
    if (lookupVersions.get(tabId) !== version) return null;
    const previous = cache.get(tabId);
    if (previous?.branch && previous.branch !== info.branch) info.branchChangedFrom = previous.branch;
    cache.set(tabId, info);
    if (!samePageInfo(previous, info) || info.branchChangedFrom) await updateTab(tabId, info);
    return info;
  } catch {
    if (lookupVersions.get(tabId) !== version) return null;
    const hadInfo = cache.has(tabId);
    cache.delete(tabId);
    groupedTabs.delete(tabId);
    if (hadInfo) await updateTab(tabId, null);
    return null;
  }
}

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.status === "complete" && tab.url) lookup(tabId, tab.url);
});
chrome.tabs.onRemoved.addListener((tabId) => {
  cache.delete(tabId);
  lookupVersions.delete(tabId);
  groupedTabs.delete(tabId);
});
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== "sync" || !Object.keys(changes).some((key) => settingKeys.has(key))) return;
  configCache = { ...defaults, ...(await chrome.storage.sync.get(defaults)) };
  groupedTabs.clear();
  await Promise.allSettled([...cache].map(([tabId, info]) => updateTab(tabId, info)));
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "LOOKUP_CURRENT") {
    lookup(sender.tab?.id, sender.tab?.url)
      .then(async (info) => sendResponse({ info, config: await settings() }));
    return true;
  }
  if (message.type === "GET_TAB_INFO") {
    chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
      const info = cache.get(tab?.id) || (tab?.url ? await lookup(tab.id, tab.url) : null);
      sendResponse({ info, config: await settings() });
    });
    return true;
  }
  if (message.type === "GET_SERVERS") {
    fetchServers()
      .then(async (result) => {
        await chrome.storage.session.set({
          [SERVERS_CACHE_KEY]: { servers: result.servers || [], updatedAt: Date.now() },
        }).catch(() => {});
        sendResponse(result);
      })
      .catch(() => sendResponse({ servers: [], error: true }));
    return true;
  }
  if (message.type === "GET_CACHED_SERVERS") {
    chrome.storage.session.get(SERVERS_CACHE_KEY)
      .then((result) => sendResponse(result[SERVERS_CACHE_KEY] || null));
    return true;
  }
  if (message.type === "OPEN_SERVER") chrome.tabs.create({ url: `http://localhost:${message.port}` });
  if (message.type === "KILL_SERVER") {
    fetch(`${HELPER}/kill`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...helperHeaders },
      body: JSON.stringify({ port: message.port, pid: message.pid }),
    })
      .then(async (response) => ({ ok: response.ok, ...(await response.json()) }))
      .then(sendResponse)
      .catch(async () => sendResponse({ ok: false, error: translate(resolveLanguage((await settings()).language), "helperUnreachable") }));
    return true;
  }
  if (message.type === "LOCAL_ACTION") {
    fetch(`${HELPER}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...helperHeaders },
      body: JSON.stringify({ port: message.port, pid: message.pid, action: message.action }),
    })
      .then(async (response) => ({ ok: response.ok, ...(await response.json()) }))
      .then(sendResponse)
      .catch(async () => sendResponse({ ok: false, error: translate(resolveLanguage((await settings()).language), "helperUnreachable") }));
    return true;
  }
  if (message.type === "SAVE_SETTINGS") {
    chrome.storage.sync.set(message.settings).then(() => sendResponse({ ok: true }));
    return true;
  }
});
