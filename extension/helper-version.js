// Raise this when the extension starts relying on a newer helper API. The extension updates
// itself from the Chrome Web Store, but the helper only updates when the user reinstalls it.
const MIN_HELPER_API_VERSION = 1;

// Maps a /health response (or null when the helper could not be reached) to a status.
// Helpers that predate the version check answer { ok: true } with no apiVersion.
function helperStatus(health, minApiVersion = MIN_HELPER_API_VERSION) {
  if (!health?.ok) return "unreachable";
  return Number.isInteger(health.apiVersion) && health.apiVersion >= minApiVersion ? "ok" : "outdated";
}
