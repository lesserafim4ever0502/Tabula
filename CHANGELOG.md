# CHANGELOG.md

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **Vector Icon System (v3.0)**: Implemented a pure CSS/SVG icon infrastructure using CSS Masks.
  - New icons: `i-bookmark`, `i-folder`, `i-close`, `i-search`, `i-link`.
  - Shared `getIconHTML` engine in `search.js` & `drawer.js`.
- **Dynamic Theming Support**: Icons now inherit `currentColor`, enabling synchronous glow/theme effects.
- **Multi-bookmark Open**: Supports opening multiple bookmarks at once by separating search terms with commas (e.g., `x,yt,bi`).
  - Automatically splits the input by `,` or `，`.
  - Opens the top-ranked match for each term in a new background tab.
  - Incrementally updates access frequency for all opened items.

### Changed
- **UI Decoupling**: Replaced all hardcoded Emoji icons (📌, ✕) with vector drawings.
- **Storage Defaults**: Updated `TabulaStorage.add` to use `i-bookmark` as the default identifier.
- **Visual Polish**: Replaced character-based close buttons in `index.html` with vector counterparts.

### Fixed
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
