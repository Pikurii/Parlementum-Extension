# Parlementum Auto Worker

[![Version](https://img.shields.io/badge/version-5.11.0-blue.svg)](https://github.com/Pikurii/Parlementum-Extension)
[![Manifest](https://img.shields.io/badge/manifest-v3-purple.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Browsers](https://img.shields.io/badge/browsers-Chrome%20%7C%20Opera%20GX%20%7C%20Brave%20%7C%20Edge-orange.svg)](https://github.com/Pikurii/Parlementum-Extension)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

A Manifest V3 browser extension built for the geopolitical browser game [Parlementum.org](https://parlamentum.org). It tracks your energy recovery, factors in regional buffs, and automatically performs work shifts when you hit your configured threshold.

I built this so you do not have to keep refreshing or babysitting the game dashboard all day. It runs quietly in the background, keeps CPU and memory footprints minimal, and syncs directly with the game state.

---

## Installation

### Option A: Using the Pre-Built ZIP (Recommended)

1. Download [`parlementum-auto-worker-v5.11.0.zip`](https://github.com/Pikurii/Parlementum-Extension/raw/main/parlementum-auto-worker-v5.11.0.zip).
2. Extract the archive into a folder on your computer.
3. Open your browser extensions page:
   - **Opera GX / Opera**: `opera://extensions`
   - **Google Chrome**: `chrome://extensions`
   - **Brave**: `brave://extensions`
   - **Microsoft Edge**: `edge://extensions`
4. Turn on **Developer mode** (toggle in the top-right corner).
5. Click **Load unpacked** (top-left) and select the extracted folder (the one containing `manifest.json`).
6. Navigate to [parlamentum.org/dashboard](https://parlamentum.org/dashboard). The floating worker panel will appear on the page.

### Option B: From the Repository

If you cloned this repository, you can directly load the `extension-parlementum-release` directory via **Load unpacked**.

---

## What It Does

- **Threshold-Based Work**: Automatically triggers work shifts when your energy reaches your configured target (default is 100 EN).
- **Network Interception & DOM Fallback**: Listens directly to `/api/player/work` responses in the main world context to get ground-truth energy and production numbers. If API requests cannot be dispatched directly, it falls back to native DOM clicks on the verified `data-testid="work"` button.
- **Accurate Region Regen Calculations**: Reads local region infrastructure data and Crown Index multipliers (such as West Java's +50% health regen) to calculate your true energy recovery rate and exact countdowns.
- **Low Resource Usage (Eco Mode)**: When the game tab is in the background, expensive DOM polling and animations are paused. Energy recovery relies on timestamp delta math rather than active polling loops, so leaving the tab open for days will not bog down your browser.
- **Timing Jitter**: Adds slight, randomized variations (around plus or minus 2 EN / random second offsets) to avoid robotic, perfectly fixed-interval work patterns.
- **Sleep Schedule**: Lets you define rest windows (e.g. 01:00 - 06:00) during which the worker stays paused.
- **Floating HUD & Toolbar Popup**: Check remaining energy, shift timers, and recent production from either the draggable in-game widget or the browser action popup.
- **Activity Log**: Built-in searchable log with filters (Success, Info, Warning, Error) to audit past shifts, XP gained, and items produced.
- **Session Auto-Refresh**: If a session token expires with a 401 response, the extension reloads the tab to pick up refreshed session cookies.

---

## Keyboard Shortcuts

When on the Parlamentum dashboard, the following shortcuts are available:

- `Ctrl + Shift + A` - Toggle the floating panel open or closed
- `Alt + Shift + W` - Trigger an immediate work shift manually
- `Alt + Shift + P` - Pause or resume the worker
- `Ctrl + Shift + L` - Open the Activity Log modal
- `Ctrl + Shift + S` - Open Settings

---

## Updating

When a new version is released:

1. Download the latest `.zip` archive or pull the latest repository changes.
2. Replace your existing extension folder with the new files.
3. Go to `opera://extensions` (or `chrome://extensions`).
4. Click the **Reload** button on the Parlamentum Auto Worker card, then refresh your game tab.

---

## Repository Structure

```text
Parlementum-Extension/
|-- extension-parlementum/              # Source files (ES modules)
|   |-- src/
|   |   |-- main.js                    # Core coordinator & worker loop
|   |   |-- work.js                    # Shift execution & DOM triggers
|   |   |-- energy.js                  # Regen formulas & region scrapers
|   |   |-- interceptor-client.js      # Isolated-world receiver
|   |   |-- ui/                        # Floating panel & log viewer
|   |-- interceptor.js                 # Main-world fetch/XHR hook
|   |-- background.js                  # Service worker
|   |-- package.json                   # Build tools (Vite)
|   +-- vite.config.js                 # Bundler config
|
|-- extension-parlementum-release/      # Compiled, ready-to-load extension
|-- parlementum-auto-worker-v5.11.0.zip # Standalone distributable archive
|-- ROADMAP.md
+-- README.md
```

---

## Local Development

If you want to modify the source code or contribute:

1. Clone the repository:
   ```bash
   git clone https://github.com/Pikurii/Parlementum-Extension.git
   cd Parlementum-Extension/extension-parlementum
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Make changes inside `extension-parlementum/src/`.
4. Build the release:
   ```bash
   npm run release
   ```
   This runs Vite to bundle `src/` into `dist/content.js`, copies all required assets into `extension-parlementum-release/`, and regenerates the distribution zip.

---

## Frequently Asked Questions

**Why is the panel not appearing?**  
Ensure you are logged in and on `https://parlamentum.org/dashboard`. If the page was open before you loaded the extension, do a hard refresh (Ctrl + F5).

**Does the browser tab need to stay open?**  
Yes, the tab needs to remain open for the content script to run. However, you can keep it in the background or minimized; Eco Mode ensures it uses minimal RAM and CPU.

**How does it calculate production and XP?**  
In Parlamentum, each 10 units of energy spent yield 4 XP, while produced goods depend on your company and regional bonuses. The extension reads the raw server response from `/api/player/work` to record exact figures.

---

## Disclaimer

This project is intended for personal automation and educational purposes. Use it responsibly and in accordance with the game platform terms. The author assumes no responsibility for any account actions resulting from the use of this tool.

## License

MIT License. See [LICENSE](LICENSE) for details.
