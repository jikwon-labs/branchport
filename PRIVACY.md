# Branchport Privacy Policy

Last updated: September 25, 2026

Branchport does not collect, sell, or share personal data. It has no analytics, no tracking, and no remote servers.

## What Branchport reads

- **Localhost tab URLs.** The extension reads the URL of `localhost` and `127.0.0.1` tabs to find their port. It does not read other websites.
- **Local process and Git information.** The Branchport helper, which runs on your computer, reads which process listens on each localhost port, that process's working directory, and Git details such as the repository, branch, and commit.

## Where that data goes

- The extension sends a port number to the helper at `127.0.0.1:32190`, and the helper returns the Git and process details. This traffic never leaves your computer.
- The helper accepts requests only from the Branchport extension.
- Nothing is sent to the developer or to any third party.

## What Branchport stores

- **Display settings** (such as the page label and language) are saved with `chrome.storage.sync`. If you use Chrome Sync, Chrome syncs these settings across your signed-in browsers.
- **A short-lived cache of the server list** is kept in `chrome.storage.session` and cleared when the browser closes.

## Clipboard

Branchport writes to the clipboard only when you click a copy button.

## Contact

Questions: https://github.com/jikwon-labs/branchport/issues
