# Tabula (MinimalTab) 🚀

A minimalist, **zero-latency**, **glassmorphism-styled** browser start page extension. Designed for power users, it replaces the native blank page with an immersive search and bookmark management experience.

## 🌟 Key Features

- **⚡ Zero-Latency Experience**: Leverages `preload.js` for synchronous rendering interception, completely eliminating the "white flash" (FOUC) when opening a new tab. Background colors and wallpapers load instantly.
- **🔮 Modern Aesthetics (Glassmorphism)**: Deep application of frosted glass effects, supporting customizable solid colors or Base64-compressed wallpapers.
- **⌨️ Keyboard-Centric (Vim-style)**:
    - `j/k` or `↑/↓`: Navigate bookmarks.
    - `/` or `Shift + Space`: Quickly focus and select the search bar.
    - `o`: Open bookmark in background.
    - `Enter/Delete`: Quick edit or remove.
- **🔍 Smart Search**:
    - Supports Google, Bing, Baidu, and **Custom URL Templates**.
    - Fuzzy matching logic based on Titles, URLs, and custom Aliases.
    - **Multi-bookmark Open**: Enter multiple terms separated by commas (e.g., `x,yt,bi`) to open the top results for each simultaneously.
- **📂 Minimalist Manager**: A sleek right-side drawer for bookmark management with real-time search filtering.

## 📸 Recent Updates (v1.x)

1. **Settings UI Overhaul**: Unified 32px height standard for all components, pixel-perfect alignment, and 100% color-swatch filling.
2. **Micro Gear Button**: Halved the radius of the floating settings button (24px) with a shrunk 14px SVG icon for a more refined look.
3. **Inset Pill Hover**: Redesigned the search dropdown hover state with an inset capsule style (12px radius) for better visual layering on glass surfaces.

## 🛠️ Installation & Usage

1. Open the Browser Extension Management page (`chrome://extensions`).
2. Enable "Developer Mode".
3. Click "Load unpacked" and select the project root directory.
4. Press `Ctrl/Cmd + ,` or click the bottom-left gear icon to enter Settings.

## 🏗️ Architecture

Refer to [docs/CODEMAP.md](./docs/CODEMAP.md) (Internal) for detailed module documentation.
