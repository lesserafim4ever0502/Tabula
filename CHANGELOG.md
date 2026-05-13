# CHANGELOG.md

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **Odin Sync Preview & Details**: Added Odin connection status, dry-run preview, result details, and selectable bookmark sync scopes in Settings → Data & Backup.
- **Odin Local Sync**: Added a Data & Backup action that syncs Tabula bookmarks and aliases to Odin through the local `127.0.0.1:29000` API.
- **Bookmark Health Check**: Added a drawer-level health action that reports invalid URLs, missing titles, duplicate URLs, and duplicate aliases without external network calls.
- **Recent Usage Ranking**: Added `lastUsedAt` bookmark metadata so recently opened bookmarks can rank ahead of older frequency ties.
- **Vector Icon System (v3.0)**: Implemented a pure CSS/SVG icon infrastructure using CSS Masks.
  - New icons: `i-bookmark`, `i-folder`, `i-close`, `i-search`, `i-link`.
  - Shared `getIconHTML` engine in `search.js` & `drawer.js`.
- **Dynamic Theming Support**: Icons now inherit `currentColor`, enabling synchronous glow/theme effects.
- **Multi-bookmark Open**: Supports opening multiple bookmarks at once by separating search terms with commas (e.g., `x,yt,bi`).
  - Automatically splits the input by `,` or `，`.
  - Opens the top-ranked match for each term in a new background tab.
  - Incrementally updates access frequency for all opened items.

### Changed
- **Odin Sync Scope Picker**: Replaced the browser-native sync scope select with a custom animated glass-style dropdown to match the Settings UI.
- **Extension Local API Permission**: Added localhost host permissions and CSP `connect-src` entries required for Odin-only local sync.
- **Drawer Action Visual Hierarchy**: Gave Health, Export, Import, and Clear distinct semantic color treatments.
- **Bookmark Ranking**: Search results and drawer filtering now preserve match-score priority, then prefer recent usage before frequency.
- **Drawer Actions Layout**: Expanded the drawer data action row to include the new Health action alongside Export, Import, and Clear.
- **Background Layer Model**: Split the solid layer color from the wallpaper layer so layer color remains editable without clearing or covering an uploaded wallpaper.
- **UI Decoupling**: Replaced all hardcoded Emoji icons (📌, ✕) with vector drawings.
- **Storage Defaults**: Updated `TabulaStorage.add` to use `i-bookmark` as the default identifier.
- **Visual Polish**: Replaced character-based close buttons in `index.html` with vector counterparts.

### Fixed
- **Odin Sync Scope Select Contrast**: Adjusted the sync scope dropdown for dark UI contrast so option text remains readable.
- **Search Submit Flash**: Fixed a transient empty dropdown panel flashing above the search box when pressing Enter to open a bookmark or search target.
- **Wallpaper IDB Recovery**: Fixed uploaded wallpapers flashing briefly on refresh and then being covered by a solid color when the preload cache resolved empty after Chrome reinstall or IndexedDB store loss.
- **Platform Inconsistency**: Emojis now render identically across Windows/macOS/Linux via CSS drawings.
- **Bookmark Drawer Layout**: Fixed uneven horizontal gaps in the edit form by unifying padding and implementing a card-based aesthetic.

## [2026-04-02] - Refinement & Extended Vectorization

### Added
- **Extended Vector Icon Library**: Added `i-export`, `i-import`, and `i-trash` SVG paths to `style.css`.
- **Drawer Action UI Vectorization**: Successfully replaced all data management emojis with `.t-icon` components.

### Changed
- **Search Algorithm Correction**: Re-engineered the filtering engine to implement "In-result Frequency Priority".
  - Search results are now instantly sorted by `frequency` (DESC) after the initial query filter.
  - Ensured the highest-frequency bookmark in the current result set is always the default target for Enter-triggered navigation.
- **Match Weight Ranking (v3.2)**: Implemented "Custom Priority over URL" sorting logic.
  - Matches in Title or Alias (Level 2) now strictly rank higher than matches found only in URLs (Level 1).
  - Effectively eliminated noise from long URLs containing common characters.
- **Search State Persistence (v3.3)**: Fixed a critical UX issue where the drawer list would reset on any action (Edit/Save/Cancel).
  - Implemented an "Auto-sensing" engine in `renderList`.
  - Filtered view is now strictly maintained during and after bookmark modifications.
- **Semantic Search Upgrade (v3.1)**: Integrated Pinyin and Subsequence fuzzy matching for titles and aliases.
  - Added `js/pinyin_match.js` as a lightweight matching engine.
  - Implemented tiered strictness: Strict matching for URLs, Subsequence/Pinyin matching for names and aliases.
  - Synchronized search logic between the main search bar and the drawer sidebar.
- **Bookmark Edit Card Refactor**: Completely redesigned the bookmark editor in the drawer.
  - Unified horizontal padding (12px 16px) for perfect symmetry with view items.
  - Implemented a "Floating Card" aesthetic with consistent glassmorphism and box shadows.
  - Decoupled template structure in `drawer.js` from inline styles.
