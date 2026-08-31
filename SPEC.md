# Spec: Omnibox Bookmark Launcher
**Status**: APPROVED
**Date**: 2026-08-31

## 1. Problem
Chrome gives keyboard focus to the omnibox when a new tab opens, so Tabula cannot reliably focus its page search input after `Ctrl+T`. Users need a browser-supported keyboard route into Tabula's bookmark launcher without competing for focus.

## 2. Solution
Register the fixed omnibox keyword `t` in the Manifest V3 extension. After the user types `t` and presses `Space`, a background service worker will read the existing `tabula_bookmarks` data, show ranked bookmark suggestions, and open the selected or highest-ranked result.

Extract the page's existing title, alias, URL, pinyin, recency, and frequency ranking into a worker-safe shared module so the page search and omnibox return consistent results. Preserve Tabula's existing comma-separated multi-open behavior and `/query` web-search command in the omnibox entry point.

## 3. Scope
- **In Scope**:
  - Fixed omnibox keyword: `t`.
  - Up to five ranked bookmark suggestions.
  - Enter opens the selected suggestion or the best match.
  - Comma-separated terms open each term's best bookmark match.
  - `/query` opens the configured web search engine.
  - Existing bookmark frequency and last-used ranking are updated after omnibox launches.
  - English and Chinese usage documentation.
- **Out of Scope**:
  - Moving focus from Chrome's omnibox into the new-tab page.
  - A configurable omnibox keyword UI; Chrome declares the keyword in `manifest.json`.
  - Browser-driven visual automation or Chrome Web Store publishing.
  - Changes to bookmark storage shape or permissions beyond the omnibox/background declarations.

## 4. Tasks
- [x] Register the omnibox keyword and MV3 service worker -> `manifest.json` (`omnibox`, `background.service_worker`).
- [x] Expose pinyin matching in page and worker contexts -> `js/pinyin_match.js` (`globalThis.PinyinMatch`).
- [x] Add a worker-safe shared ranking engine -> `js/bookmark_match.js` (`matchBookmarks`, `matchBestPerQuery`, `splitQueries`).
- [x] Reuse the shared ranking engine in the new-tab page -> `js/search.js` (`handleInput`, `executeAction`).
- [x] Load the shared matcher before page search -> `index.html` (script order near `js/pinyin_match.js`).
- [x] Implement suggestions and launch behavior -> `js/background.js` (`onInputChanged`, `onInputEntered`, storage and tab helpers).
- [x] Document `t` + `Space`, multi-open, and `/query` -> `README.md`, `README-CN.md`.
- [x] Add a dependency-free mocked Chrome smoke test -> `tests/omnibox.smoke.js` (suggestions, best match, multi-open, web search, frequency update).

## 5. Decisions
- Use `t` because it is short, mnemonic, and matches the Tabula product name.
- Keep the keyword fixed because Chrome omnibox keywords are manifest metadata and cannot be changed dynamically at runtime.
- Share only pure matching logic. The service worker will access `chrome.storage.local` directly because `js/storage.js` depends on page globals and localStorage fallback behavior.
- Use the existing ranking order: match score, then `lastUsedAt`, then `frequency`.
- Honor Chrome's omnibox disposition: current tab, foreground tab, or background tab. Multi-open uses the requested disposition for the first result and background tabs for remaining results.
- Escape suggestion descriptions before passing them to the Chrome omnibox API.

## 6. Questions ❓
- Approval confirms the fixed keyword `t` and the behaviors listed above. No additional product decision is required before implementation.

## 7. Verification
- `node --check js/pinyin_match.js`
- `node --check js/bookmark_match.js`
- `node --check js/background.js`
- `node --check js/search.js`
- `node tests/omnibox.smoke.js`
- Inspect `git diff --check` and the final manifest diff.
- Manual follow-up after reloading the unpacked extension: open a new tab, type `t`, press `Space`, enter an alias, review suggestions, and press Enter.
