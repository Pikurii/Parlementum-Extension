# Parlementum Auto Worker

<div align="center">

[![Version](https://img.shields.io/badge/version-5.12.2-blue.svg?style=for-the-badge)](https://github.com/Pikurii/Parlementum-Extension)
[![Manifest](https://img.shields.io/badge/manifest-v3-purple.svg?style=for-the-badge)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Tests](https://img.shields.io/badge/tests-17%20passed-success.svg?style=for-the-badge)](tests/)
[![Browsers](https://img.shields.io/badge/browsers-Chrome%20%7C%20Opera%20GX%20%7C%20Brave%20%7C%20Edge-orange.svg?style=for-the-badge)](https://github.com/Pikurii/Parlementum-Extension)
[![License](https://img.shields.io/badge/license-MIT-green.svg?style=for-the-badge)](LICENSE)

**Next-Gen Autonomous Worker, Multi-Stat Trainer & Energy Automation Suite for [Parlementum.org](https://parlamentum.org).**

*Designed for high efficiency, seamless background execution, zero-cost tab idling, and natural human-like behavioral stealth.*

</div>

---

## 📖 Overview

**Parlamentum Auto Worker** is an ultra-lightweight, high-performance browser extension (Manifest V3) engineered specifically for the geopolitical strategy game [Parlementum.org](https://parlamentum.org).

It eliminates repetitive dashboard babysitting by tracking ground-truth energy recovery, computing complex regional infrastructure buffs, autonomously performing production shifts, training your character stats (Strength, Education, Economy), and maintaining daily bread quotas—all while operating in the background with near-zero CPU and memory overhead.

---

## ⚡ Key Features

### 1. ⚙️ Intelligent Energy & Work Automation
- **Ground-Truth Network Interception**: Hooks into `/api/player/work` responses within the main-world context to capture authoritative server numbers for energy, XP, and production outputs.
- **Fail-Safe DOM Execution**: When direct API calls cannot be dispatched, falls back gracefully to synthetic human clicks on the verified `data-testid="work"` button.
- **Dynamic Energy Threshold Jitter**: Applies subtle Gaussian random variations ($\pm 3$ EN) to work execution thresholds to avoid rigid, detectable patterns.
- **Daily Golden Hour Flush (Jam Emas 00:00 UTC)**: Dynamically lowers energy thresholds in the 45 minutes preceding daily server rollover to ensure every bit of energy is converted into XP and production before reset.
- **Accurate Region Regen Modeling**: Reads real-time regional infrastructure, Crown Index health bonuses (e.g. West Java $+50\%$ regen), and displays exact countdowns to target shifts and full capacity.

### 2. 🏋️ Autonomous 3-Stat Training Suite
- **100% In-Game Progress Synchronization**: Directly reads the rendered progress bar percentage (`style="width: X%"`) from the game's active training card (`dash-training`), ensuring an exact 1:1 match between the extension and the game dashboard.
- **Configurable Stat Targets**: Independently set level caps for **Strength (STR)**, **Education (EDU)**, and **Economy (EKO)**.
- **Smart Rotation & Priorities**: Choose between focused progression (`Pendidikan`, `Ekonomi`, `Kekuatan`) or `Seimbang` (trains the lowest stat first).
- **Gold Safety Guard**: Built-in arithmetic progression calculator computes total gold costs for multi-level training runs and protects your reserve (`Min Gold Reserve`).

### 3. 🥖 Auto-Synced Food & Bread Quota
- **100% Automatic Synchronization**: Automatically detects standard ($10$ slots) or premium ($20$ slots) daily quota directly from server responses and DOM state.
- **Clean & Spacious Design**: Eliminates cluttered manual `[-]`, `[+]`, and `[Max]` buttons in favor of an elegant, real-time status badge (`17/20 Slot • 3 sisa`).
- **Reset Reminders**: Emits visual alerts when unconsumed food slots remain close to the 00:00 UTC daily reset.

### 4. 🛡️ Advanced Stealth & Humanized Behavior
- **Organic Micro-Breaks**: Periodically triggers randomized rest intervals (default every 4 hours for 8–15 minutes) mimicking realistic human pauses away from the keyboard.
- **Human Click Physics**: Simulates organic cursor placement within button bounds using bounded Gaussian jitter rather than robotic, dead-center clicks.
- **Adaptive Exponential Backoff**: Automatically handles server maintenance, Cloudflare challenges, and HTTP 502/503/504 errors by scaling retry intervals progressively (from 45s up to 8 minutes) with human-like jitter.
- **Circuit Breaker Protection**: Detects verification prompts, captchas, and authentication expiration, halting operations safely to protect your account.

### 5. 🍃 Eco-Mode & Zero-Cost Background Tabs
- **GPU & Animation Suspension (`.aw-tab-hidden`)**: Listens to tab visibility events (`visibilitychange`). When the tab is in the background or minimized, CSS gradient shimmers and pulse animations are frozen, reducing compositor GPU/CPU load to near-zero.
- **Passive Math Projection**: Energy recovery during background execution relies on timestamp delta mathematics rather than expensive continuous DOM polling.
- **Multi-Tab Mutex Coordination**: Employs `BroadcastChannel` with atomic leader locks so that opening multiple Parlamentum tabs will never trigger double work shifts or race conditions.

### 6. 🧪 Automated Unit Test Suite
- **17 Native Unit Tests**: Powered by Node.js native test runner (`node --test tests/**/*.test.js`) with zero external runtime dependencies.
- **Validated Formulas**: Verifies arithmetic gold progression, official exponential training durations, bounded Gaussian distributions, exponential backoff scales, and DOM progress priority.

---

## 🖥️ User Interface Surfaces

| Surface | Description |
| :--- | :--- |
| **Surface A: Floating HUD (356px)** | Draggable, pinnable in-game widget featuring live energy shimmer bars, UTC reset timers, quick stat pills, and immediate action buttons (`[Kerja]`, `[Jeda Bot]`, `[Log Bot]`). |
| **Surface B: Toolbar Popup (380px)** | Standalone browser action window providing full dashboard metrics, token health, and live countdowns across all tabs without navigating to the game. |
| **Surface C: Desktop Settings Modal (620px)** | Spacious 5-tab configuration center (`Kerja`, `Stats & Emas`, `Stealth & Humanizer`, `Suara & Notifikasi`, `Pintasan Keyboard`) with instant auto-save. |
| **Activity Logger** | Searchable in-game log viewer with category filters (`Semua`, `Sukses`, `Peringatan`, `Error`, `Info`), contextual micro-tags, and copy-to-clipboard functionality. |

---

## ⌨️ Keyboard Shortcuts

When on the Parlamentum dashboard, the following default shortcuts are available (customizable in Settings):

| Shortcut | Action | Description |
| :--- | :--- | :--- |
| `Ctrl + Shift + A` | **Toggle Floating Panel** | Show or hide the in-game HUD |
| `Alt + Shift + W` | **Work Now** | Trigger an immediate manual shift |
| `Alt + Shift + P` | **Pause / Resume** | Toggle the autonomous worker state |
| `Ctrl + Shift + L` | **Activity Log** | Open the searchable activity log viewer |
| `Ctrl + Shift + S` | **Settings Modal** | Open the 620px configuration dialog |

---

## 📦 Installation Guide

### Option A: Using the Pre-Built ZIP (Recommended)

1. Download [`parlementum-auto-worker-v5.12.2.zip`](https://github.com/Pikurii/Parlementum-Extension/raw/main/parlementum-auto-worker-v5.12.2.zip).
2. Extract the archive into a dedicated folder on your computer.
3. Open your browser extension management page:
   - **Google Chrome**: `chrome://extensions`
   - **Opera GX / Opera**: `opera://extensions`
   - **Brave**: `brave://extensions`
   - **Microsoft Edge**: `edge://extensions`
4. Enable **Developer mode** (toggle in the top-right corner).
5. Click **Load unpacked** (top-left) and select the extracted folder (the directory containing `manifest.json`).
6. Navigate to [parlamentum.org/dashboard](https://parlamentum.org/dashboard). The floating HUD will appear automatically.

### Option B: From Cloned Source

If you clone this repository directly, load the pre-built `extension-parlementum-release/` directory directly into your browser via **Load unpacked**.

---

## 🛠️ Local Development & Testing

### Prerequisites
- [Node.js](https://nodejs.org) (v18 or higher recommended)
- `npm`

### Setup & Commands
```bash
# Clone the repository
git clone https://github.com/Pikurii/Parlementum-Extension.git
cd Parlementum-Extension/extension-parlementum

# Install development dependencies
npm install

# Run the automated test suite (17 unit tests)
npm test

# Build for development with live watch mode
npm run dev

# Compile production bundle and sync release folder
npm run release

# Generate a distributable release ZIP archive
npm run zip
```

---

## 📁 Repository Structure

```text
Parlementum-Extension/
├── extension-parlementum/              # Core source codebase (ES Modules)
│   ├── src/
│   │   ├── main.js                    # Primary orchestrator & worker loop
│   │   ├── work.js                    # Shift execution & DOM triggers
│   │   ├── energy.js                  # Energy math, regen modeling & bread quota
│   │   ├── training.js                # Autonomous STR/EDU/EKO training & gold formulas
│   │   ├── humanizer.js               # Micro-breaks, Gaussian jitter & organic clicks
│   │   ├── broadcast.js               # Multi-tab BroadcastChannel & leader mutex
│   │   ├── interceptor-client.js      # Main-world to isolated-world event bridge
│   │   ├── config.js                  # Configuration schema & validation bounds
│   │   ├── state.js                   # Reactive state store & local storage sync
│   │   ├── logger.js                  # Ring-buffer activity logging engine
│   │   ├── notifications.js           # Audio alerts & desktop notifications
│   │   ├── token.js                   # JWT session decoding & expiry monitor
│   │   └── ui/
│   │       ├── panel.js               # Surface A (In-Game Floating HUD)
│   │       ├── settings.js            # Surface C (620px Desktop Settings Modal)
│   │       ├── logviewer.js           # Searchable Activity Log Modal
│   │       └── icons.js               # 100% Vector SVG icon library (Zero Emoji)
│   ├── popup/                         # Surface B (Browser Toolbar Popup)
│   │   ├── popup.html
│   │   └── popup.js
│   ├── tests/                         # Automated unit test suite
│   │   ├── config.test.js
│   │   ├── energy.test.js
│   │   ├── humanizer.test.js
│   │   └── training.test.js
│   ├── interceptor.js                 # Main-world fetch/XHR network hook
│   ├── background.js                  # Manifest V3 service worker & alarms
│   ├── sync-release.cjs               # Release synchronization & packaging script
│   ├── package.json                   # Project metadata & npm scripts
│   └── vite.config.js                 # Bundler configuration
│
├── extension-parlementum-release/      # Standalone compiled release folder
├── parlementum-auto-worker-v5.12.2.zip # Standalone distributable release archive
├── ROADMAP.md                         # Detailed technical specification & changelog
├── LICENSE                            # MIT License
└── README.md                          # Project documentation
```

---

## 💬 Frequently Asked Questions (FAQ)

**Q: Does the browser tab need to stay active in the foreground?**  
**A:** No. You can minimize the window or keep the tab in the background. The extension's Eco Mode suspends expensive CSS animations, relying on timestamp delta calculations to track energy passively while consuming virtually zero resources.

**Q: Can I use this on multiple tabs simultaneously?**  
**A:** Yes. The extension features a built-in `BroadcastChannel` mutex lock. Only the active leader tab executes work and training shifts; all other tabs listen and reflect state changes in real-time.

**Q: How does the bot avoid detection?**  
**A:** Unlike basic bots that trigger actions at rigid, robotic intervals, Parlementum Auto Worker incorporates Gaussian threshold jitter, organic randomized micro-breaks (8–15 minutes every few hours), natural click coordinate distributions, and adaptive exponential backoff on server anomalies.

---

## ⚖️ Disclaimer

This project is developed for personal automation, quality-of-life convenience, and educational purposes. Please use it responsibly and in accordance with the game's community guidelines. The developers assume no responsibility for any unintended consequences or account actions resulting from third-party automation tools.

---

## 📜 License

Distributed under the [MIT License](LICENSE). Free for personal use, modification, and contribution.
