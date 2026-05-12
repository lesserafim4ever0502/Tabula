# CODEMAP.md

## 🧱 Project Structure

```mermaid
graph TD
    A[index.html] --> B[css/style.css]
    A --> C[js/search.js]
    A --> D[js/settings.js]
    A --> E[js/drawer.js]
    C --> F[js/storage.js]
    E --> F
```

## 🎨 Core Design Systems

### 1. Premium Glassmorphism
- **Context**: Centered search box with adaptive background blurring.
- **Variables**: `--search-top`, `--search-left`, `--glass-blur`, `--wallpaper-blur`.
- **Transitions**: Smooth layout initialization via `preload.js` to prevent FOUC.
- **Background Layers**: `#bg-color-layer` owns the solid transition color, while `#bg-layer` owns only wallpaper imagery above it.

### 2. Tabula Icon Engine (v3.0)
- **Tech Stack**: CSS Masks + Multi-browser compatible inline SVGs.
- **Logic**: Shared `getIconHTML` engine (JS) for dynamic lists and static CSS classes (HTML) for global data actions.
- **Inheritance**: Icons automatically inherit the parent's `color` and `opacity`.

## ⚙️ Core Modules

- **js/search.js**: Handles command extraction (`/`), multi-term delimiter splitting (`,`), frequency-scored bookmark retrieval, and spatial-aware dropdown flipping.
- **js/storage.js**: Adapts to `chrome.storage.local` with fallback to `localStorage`.
- **js/settings.js**: Owns visual settings, backup/restore, and the local-only Odin bookmark sync action through `127.0.0.1:29000`. / 负责视觉设置、备份恢复，以及通过 `127.0.0.1:29000` 执行仅本机访问的 Odin 书签同步。
- **js/drawer.js**: High-performance bookmark management & full data backup (Export/Import).
