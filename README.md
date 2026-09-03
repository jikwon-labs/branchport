# Branchport

Branchport is a Chrome extension for macOS that shows which Git worktree and branch is serving each localhost port.

It adds a small label to localhost pages, prefixes tab titles with the current branch, groups tabs by worktree, and provides a popup for inspecting and managing local development servers.

## Features

- Shows the repository, worktree, branch, dirty state, commit, and upstream divergence
- Lists localhost servers with PID, uptime, CPU, and memory usage
- Groups Chrome tabs by worktree and warns about duplicate servers
- Opens a server folder in Cursor or VS Code, Terminal, or Finder
- Stops a server only after revalidating its port and PID
- Reduces background work with request coalescing, short-lived caching, and visibility-aware polling

## Requirements

- macOS
- Google Chrome
- Node.js 20 or newer
- `git` and `lsof`, included with the expected macOS development environment

## Install

```bash
git clone https://github.com/wlrnjs/branchport.git
cd branchport
pnpm helper:install
```

Then install the extension:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the repository's `extension` directory.

The manifest public key keeps the extension ID fixed at `gclkmofklkhonlkneebngbdiblebeekk`, allowing the helper to accept requests only from Branchport. Reload existing localhost tabs after installation.

## Usage

Open any `localhost` or `127.0.0.1` page. The page label shows the worktree and branch; clicking it copies the working directory.

The popup lists every detected Git-backed localhost server. Its settings control the page label, watermark, title prefix, automatic tab grouping, and toolbar badge.

- `●`: uncommitted changes
- `↑2`: two commits ahead of upstream
- `↓1`: one commit behind upstream
- Red: `main`, `master`, or `production`
- Orange: dirty state, `fix/*`, or `hotfix/*`
- Blue: `feat/*` or `feature/*`

The popup shortcut can be configured at `chrome://extensions/shortcuts`. The suggested shortcut is `Control+Shift+L`.

## Helper commands

```bash
pnpm start            # Run the helper in the foreground
pnpm helper:install   # Install or update the macOS LaunchAgent
pnpm helper:uninstall # Remove the LaunchAgent
pnpm test             # Run unit tests
```

## How it works

The helper binds only to `127.0.0.1:32190`. It uses `lsof` to map listening ports to processes, reads each process's working directory, and queries Git without modifying the detected project.

Visible tabs refresh every 5 seconds and hidden tabs every 30 seconds. Concurrent requests for the same port share one lookup, while full server scans reuse process and Git results with bounded concurrency.

All data and actions stay on the local machine. The helper exposes only `/health` publicly; repository and process endpoints require the fixed Branchport Chrome extension origin and request token.

## Limitations

- Only macOS is currently supported.
- Servers running outside a Git worktree are not listed.
- A server whose listening process has a different working directory may not be detected.
- The helper port is currently fixed at `32190` in both the helper and extension.

## License

No license has been granted yet.
