# Tabula Privacy Policy

Effective date: October 12, 2026

Tabula replaces Chrome's new tab page with a search and bookmark workspace. It does not require an account and has no analytics or developer-operated server.

## Data stored on your device

Tabula stores bookmarks you add or import, their titles, URLs, aliases, icons, and usage counts; appearance and search settings; and wallpapers you choose. It uses Chrome local storage, browser local storage, and IndexedDB. This information stays in your browser profile unless you choose to export a backup or use the optional Odin integration.

## Network requests

- When you run a web search or open a bookmark, Chrome navigates to the destination you chose. The destination service receives the usual request for that navigation.
- When you choose to retrieve a bookmark icon, Tabula requests an icon using the bookmark's domain from Google Favicon, DuckDuckGo Icons, or the bookmarked website. These services may receive that domain and the usual network request information.
- If you choose to preview or run Odin synchronization, Tabula sends the selected bookmark titles, URLs, aliases, and usage information to an Odin service running on your own computer at `127.0.0.1:29000` or `localhost:29000`. Tabula does not send this information to a developer-operated server.

Tabula does not sell user data or use it for advertising. It does not execute remotely hosted code.

## Control and retention

You can edit or delete bookmarks and settings within Tabula. You can remove a chosen wallpaper in settings. Uninstalling the extension removes its Chrome extension storage according to Chrome's behavior; exported backup files and data you intentionally synchronized to Odin are managed separately by you.

## Changes

If Tabula's data handling changes, this policy will be updated before the changed version is submitted to the Chrome Web Store.
