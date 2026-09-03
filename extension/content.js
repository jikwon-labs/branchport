const ID = "localhost-worktree-label";
const WATERMARK_ID = "localhost-worktree-watermark";
const NOTICE_ID = "localhost-worktree-notice";
let originalTitle = document.title;
let currentInfo = null;
let currentConfig = null;
let renderSignature = null;
let pollTimer = null;
let lookupInFlight = false;
let noticeTimer = null;
let copiedTimer = null;

function colorFor(info) {
  if (info.dirty) return "#d97706";
  if (/^(main|master|production)$/.test(info.branch)) return "#dc2626";
  if (/^(fix|hotfix)\//.test(info.branch)) return "#ea580c";
  if (/^(feat|feature)\//.test(info.branch)) return "#2563eb";
  return "#7c3aed";
}

function showBranchNotice(info) {
  document.getElementById(NOTICE_ID)?.remove();
  clearTimeout(noticeTimer);
  const notice = document.createElement("div");
  notice.id = NOTICE_ID;
  notice.textContent = `브랜치가 바뀌었어요 · ${info.branchChangedFrom} → ${info.branch}`;
  document.documentElement.append(notice);
  noticeTimer = setTimeout(() => notice.remove(), 7000);
}

function render(info, config) {
  currentInfo = info;
  currentConfig = config;
  const nextSignature = JSON.stringify({
    info: info && {
      cwd: info.cwd, worktree: info.worktree, repository: info.repository,
      branch: info.branch, commit: info.commit, dirty: info.dirty,
      ahead: info.ahead, behind: info.behind,
    },
    config,
  });
  if (nextSignature === renderSignature) {
    if (info?.branchChangedFrom) showBranchNotice(info);
    return;
  }
  renderSignature = nextSignature;
  document.getElementById(ID)?.remove();
  document.getElementById(WATERMARK_ID)?.remove();
  document.getElementById(NOTICE_ID)?.remove();
  clearTimeout(noticeTimer);
  clearTimeout(copiedTimer);
  const prefix = info ? `[${info.branch}${info.dirty ? "*" : ""}] ` : "";
  if (!document.title.startsWith("[")) originalTitle = document.title;
  document.title = info && config?.title ? prefix + originalTitle : originalTitle;
  if (info?.branchChangedFrom) {
    showBranchNotice(info);
  }
  if (info && config?.watermark) {
    const watermark = document.createElement("div");
    watermark.id = WATERMARK_ID;
    watermark.textContent = `${info.repository} · ${info.branch}${info.dirty ? " · DIRTY" : ""}`;
    document.documentElement.append(watermark);
  }
  if (!info || !config?.overlay) return;

  const sync = [info.ahead ? `↑${info.ahead}` : "", info.behind ? `↓${info.behind}` : ""].filter(Boolean).join(" ");
  const label = document.createElement("button");
  label.id = ID;
  label.type = "button";
  label.style.setProperty("--branch-color", colorFor(info));
  label.title = `${info.cwd}\n${info.branch} (${info.commit})\n클릭하면 경로가 복사돼요`;
  const folder = document.createElement("span");
  folder.className = "lwl-folder";
  folder.textContent = info.worktree;
  const branch = document.createElement("strong");
  branch.textContent = `${info.branch}${info.dirty ? " ●" : ""}`;
  label.append(folder, branch);
  if (sync) {
    const syncElement = document.createElement("span");
    syncElement.className = "lwl-sync";
    syncElement.textContent = sync;
    label.append(syncElement);
  }
  label.addEventListener("click", async () => {
    await navigator.clipboard.writeText(info.cwd);
    label.dataset.copied = "true";
    copiedTimer = setTimeout(() => delete label.dataset.copied, 1000);
  });
  document.documentElement.append(label);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "WORKTREE_INFO") render(message.info, message.config);
});
function syncTitle() {
  if (currentInfo && currentConfig?.title && !document.title.startsWith(`[${currentInfo.branch}`)) {
    originalTitle = document.title;
    document.title = `[${currentInfo.branch}${currentInfo.dirty ? "*" : ""}] ${originalTitle}`;
  }
}

async function poll() {
  if (lookupInFlight) return;
  lookupInFlight = true;
  try {
    const result = await chrome.runtime.sendMessage({ type: "LOOKUP_CURRENT" });
    render(result?.info || null, result?.config || currentConfig);
    syncTitle();
  } catch {
    // The helper may be unavailable while it is restarting.
  } finally {
    lookupInFlight = false;
    schedulePoll();
  }
}

function schedulePoll({ immediate = false } = {}) {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(poll, immediate ? 0 : document.hidden ? 30000 : 5000);
}

document.addEventListener("visibilitychange", () => schedulePoll({ immediate: !document.hidden }));
window.addEventListener("pagehide", () => {
  clearTimeout(pollTimer);
  clearTimeout(noticeTimer);
  clearTimeout(copiedTimer);
});
window.addEventListener("pageshow", () => schedulePoll({ immediate: true }));
schedulePoll({ immediate: true });
