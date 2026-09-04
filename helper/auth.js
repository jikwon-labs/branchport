export const EXTENSION_ORIGIN = "chrome-extension://gclkmofklkhonlkneebngbdiblebeekk";
export const EXTENSION_TOKEN = "branchport-v1";

// Only a real CORS preflight reaches this check, and a preflight always carries an Origin.
export function extensionOrigin(headers) {
  const origin = headers.origin || "";
  return origin === EXTENSION_ORIGIN ? origin : null;
}

// Chrome omits Origin when the extension service worker fetches a host granted through
// host_permissions, because that request is privileged rather than cross-origin. Requiring
// an Origin therefore rejected every extension request. A web page cannot exploit the gap:
// page fetches always carry their own Origin, and the custom token header forces a preflight
// that extensionOrigin() rejects for anything but the extension.
export function isExtensionRequest(headers) {
  const origin = headers.origin;
  return (!origin || origin === EXTENSION_ORIGIN)
    && headers["x-localhost-worktree-token"] === EXTENSION_TOKEN;
}
