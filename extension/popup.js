const serversElement = document.getElementById("servers");
let currentPort = null;
let allServers = [];
let loadFailed = false;
let loadVersion = 0;

function serverRow(info) {
  const row = document.createElement("div");
  row.className = `server${info.port === currentPort ? " current" : ""}`;
  const state = [info.dirty ? "수정 있음" : "", info.ahead ? `↑${info.ahead}` : "", info.behind ? `↓${info.behind}` : ""].filter(Boolean).join(" ");
  row.innerHTML = `<button class="open"><span class="port">:${info.port}</span><span><div class="folder"></div><div class="branch"></div></span><span class="state"></span></button><button class="kill" title="이 서버 종료">종료</button>`;
  row.querySelector(".folder").textContent = info.worktree;
  row.querySelector(".branch").textContent = info.branch;
  row.querySelector(".state").textContent = state;
  row.querySelector(".open").title = info.cwd;
  row.querySelector(".open").addEventListener("click", () => chrome.runtime.sendMessage({ type: "OPEN_SERVER", port: info.port }));
  row.querySelector(".kill").addEventListener("click", async () => {
    if (!confirm(`:${info.port} · ${info.branch}\n이 서버를 종료할까요?`)) return;
    const result = await chrome.runtime.sendMessage({ type: "KILL_SERVER", port: info.port, pid: info.pid });
    if (!result?.ok) alert(result?.error || "서버를 종료하지 못했어요.");
    await new Promise((resolve) => setTimeout(resolve, 500));
    loadServers();
  });
  const metrics = document.createElement("div");
  metrics.className = "metrics";
  metrics.textContent = `PID ${info.pid} · 실행 ${info.uptime || "-"} · CPU ${info.cpuPercent ?? "-"}% · RAM ${info.memoryMb ?? "-"}MB`;
  row.append(metrics);

  const actions = document.createElement("div");
  actions.className = "actions";
  for (const [action, label, errorMessage] of [
    ["editor", "코드로 열기", "에디터를 열지 못했어요."],
    ["terminal", "터미널", "터미널을 열지 못했어요."],
    ["finder", "폴더", "폴더를 열지 못했어요."],
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
  copy.textContent = "경로 복사";
  copy.addEventListener("click", async () => {
    await navigator.clipboard.writeText(info.cwd);
    copy.textContent = "복사했어요";
    setTimeout(() => copy.textContent = "경로 복사", 1000);
  });
  actions.append(copy);
  row.append(actions);
  if (info.duplicate) {
    const warning = document.createElement("div");
    warning.className = "warning";
    warning.textContent = `같은 워크트리가 :${info.duplicatePorts.join(", :")}에도 열려 있어요.`;
    row.append(warning);
  }
  return row;
}

async function loadServers({ showLoading = false } = {}) {
  const version = ++loadVersion;
  if (showLoading) serversElement.innerHTML = '<div class="empty">서버 찾는 중…</div>';
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
    serversElement.innerHTML = loadFailed
      ? '<div class="empty">서버 목록을 불러오지 못했어요.<br>로컬 헬퍼가 실행 중인지 확인해 주세요.</div>'
      : query
        ? '<div class="empty">검색 결과가 없어요.</div>'
        : '<div class="empty">실행 중인 Git 프로젝트가 없어요.</div>';
    return;
  }
  for (const info of servers) serversElement.append(serverRow(info));
}

async function initialize() {
  const currentPromise = chrome.runtime.sendMessage({ type: "GET_TAB_INFO" });
  const cached = await chrome.runtime.sendMessage({ type: "GET_CACHED_SERVERS" });
  allServers = cached?.servers || [];
  if (allServers.length) renderServers();

  const current = await currentPromise;
  currentPort = current?.info?.port || null;
  for (const key of ["overlay", "watermark", "title", "autoGroup"]) document.getElementById(key).checked = current.config[key];
  document.getElementById("badge").value = current.config.badge;
  if (allServers.length) renderServers();
  await loadServers({ showLoading: !allServers.length });
}

for (const key of ["overlay", "watermark", "title", "autoGroup", "badge"]) {
  document.getElementById(key).addEventListener("change", async () => {
    const settings = {
      overlay: document.getElementById("overlay").checked,
      watermark: document.getElementById("watermark").checked,
      title: document.getElementById("title").checked,
      autoGroup: document.getElementById("autoGroup").checked,
      badge: document.getElementById("badge").value,
    };
    await chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings });
  });
}
document.getElementById("refresh").addEventListener("click", () => loadServers());
document.getElementById("search").addEventListener("input", renderServers);
initialize();
