const serversElement = document.getElementById("servers");
let currentPort = null;
let allServers = [];
let loadFailed = false;
let loadVersion = 0;
let language = resolveLanguage("auto");
const t = (key, ...args) => translate(language, key, ...args);

function applyLanguage(setting) {
  language = resolveLanguage(setting);
  document.documentElement.lang = language;
  for (const element of document.querySelectorAll("[data-i18n]")) element.textContent = t(element.dataset.i18n);
  document.getElementById("search").placeholder = t("searchPlaceholder");
}

function emptyMessage(...lines) {
  const empty = document.createElement("div");
  empty.className = "empty";
  empty.append(...lines.flatMap((line, index) => (index ? [document.createElement("br"), line] : [line])));
  serversElement.replaceChildren(empty);
}

function serverRow(info) {
  const row = document.createElement("div");
  row.className = `server${info.port === currentPort ? " current" : ""}`;
  const state = [info.dirty ? t("dirty") : "", info.ahead ? `↑${info.ahead}` : "", info.behind ? `↓${info.behind}` : ""].filter(Boolean).join(" ");
  row.innerHTML = `<button class="open"><span class="port">:${info.port}</span><span><div class="folder"></div><div class="branch"></div></span><span class="state"></span></button><button class="kill"></button>`;
  row.querySelector(".kill").title = t("stopTitle");
  row.querySelector(".kill").textContent = t("stop");
  row.querySelector(".folder").textContent = info.worktree;
  row.querySelector(".branch").textContent = info.branch;
  row.querySelector(".state").textContent = state;
  row.querySelector(".open").title = info.cwd;
  row.querySelector(".open").addEventListener("click", () => chrome.runtime.sendMessage({ type: "OPEN_SERVER", port: info.port }));
  row.querySelector(".kill").addEventListener("click", async () => {
    if (!confirm(t("confirmStop", info.port, info.branch))) return;
    const result = await chrome.runtime.sendMessage({ type: "KILL_SERVER", port: info.port, pid: info.pid });
    if (!result?.ok) alert(result?.error || t("stopFailed"));
    await new Promise((resolve) => setTimeout(resolve, 500));
    loadServers();
  });
  const metrics = document.createElement("div");
  metrics.className = "metrics";
  metrics.textContent = t("metrics", info.pid, info.uptime || "-", info.cpuPercent ?? "-", info.memoryMb ?? "-");
  row.append(metrics);

  const actions = document.createElement("div");
  actions.className = "actions";
  for (const [action, label, errorMessage] of [
    ["editor", t("openEditor"), t("editorFailed")],
    ["terminal", t("openTerminal"), t("terminalFailed")],
    ["finder", t("openFolder"), t("folderFailed")],
  ]) {
    const button = document.createElement("button");
    button.className = "action";
    button.textContent = label;
    button.addEventListener("click", async () => {
      const result = await chrome.runtime.sendMessage({ type: "LOCAL_ACTION", action, port: info.port, pid: info.pid });
      if (!result?.ok) alert(result?.error || errorMessage);
    });
    actions.append(button);
  }
  const copy = document.createElement("button");
  copy.className = "action";
  copy.textContent = t("copyPath");
  copy.addEventListener("click", async () => {
    await navigator.clipboard.writeText(info.cwd);
    copy.textContent = t("copied");
    setTimeout(() => copy.textContent = t("copyPath"), 1000);
  });
  actions.append(copy);
  row.append(actions);
  if (info.duplicate) {
    const warning = document.createElement("div");
    warning.className = "warning";
    warning.textContent = t("duplicate", info.duplicatePorts);
    row.append(warning);
  }
  return row;
}

async function loadServers({ showLoading = false } = {}) {
  const version = ++loadVersion;
  if (showLoading) emptyMessage(t("loading"));
  const result = await chrome.runtime.sendMessage({ type: "GET_SERVERS" });
  if (version !== loadVersion) return;
  if (!result?.error || !allServers.length) allServers = result?.servers || [];
  loadFailed = Boolean(result?.error && !allServers.length);
  renderServers();
}

function renderServers() {
  const query = document.getElementById("search").value.trim().toLowerCase();
  const servers = allServers.filter((info) => `${info.port} ${info.repository} ${info.worktree} ${info.branch} ${info.cwd}`.toLowerCase().includes(query));
  serversElement.replaceChildren();
  if (!servers.length) {
    if (loadFailed) emptyMessage(t("loadFailed"), t("loadFailedHint"));
    else emptyMessage(t(query ? "noResults" : "noServers"));
    return;
  }
  for (const info of servers) serversElement.append(serverRow(info));
}

async function initialize() {
  const stored = await chrome.storage.sync.get({ language: "auto" });
  applyLanguage(stored.language);
  document.getElementById("language").value = stored.language;
  emptyMessage(t("loading"));
  const currentPromise = chrome.runtime.sendMessage({ type: "GET_TAB_INFO" });
  const cached = await chrome.runtime.sendMessage({ type: "GET_CACHED_SERVERS" });
  allServers = cached?.servers || [];
  if (allServers.length) renderServers();

  const current = await currentPromise;
  currentPort = current?.info?.port || null;
  for (const key of ["overlay", "watermark", "title", "autoGroup"]) document.getElementById(key).checked = current.config[key];
  document.getElementById("badge").value = current.config.badge;
  document.getElementById("language").value = current.config.language;
  if (allServers.length) renderServers();
  await loadServers({ showLoading: !allServers.length });
}

for (const key of ["overlay", "watermark", "title", "autoGroup", "badge", "language"]) {
  document.getElementById(key).addEventListener("change", async () => {
    const settings = {
      overlay: document.getElementById("overlay").checked,
      watermark: document.getElementById("watermark").checked,
      title: document.getElementById("title").checked,
      autoGroup: document.getElementById("autoGroup").checked,
      badge: document.getElementById("badge").value,
      language: document.getElementById("language").value,
    };
    if (key === "language") {
      applyLanguage(settings.language);
      renderServers();
    }
    await chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings });
  });
}
document.getElementById("refresh").addEventListener("click", () => loadServers());
document.getElementById("search").addEventListener("input", renderServers);
initialize();
