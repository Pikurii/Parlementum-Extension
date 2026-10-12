(function() {
  "use strict";
  const _cache = {};
  async function initStorage() {
    const data = await chrome.storage.local.get(null);
    Object.assign(_cache, data);
  }
  function getValue(key, defaultVal = null) {
    return key in _cache ? _cache[key] : defaultVal;
  }
  function setValue(key, value) {
    _cache[key] = value;
    if (!chrome.runtime?.id) return;
    try {
      chrome.storage.local.set({ [key]: value }).catch((err) => {
        if (err?.message?.includes("Extension context invalidated")) return;
        console.error("[Storage] setValue failed:", key, err);
      });
    } catch {
    }
  }
  function onStorageChanged(callback) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      for (const [key, { newValue }] of Object.entries(changes)) {
        if (newValue !== void 0) _cache[key] = newValue;
        else delete _cache[key];
        callback(key, newValue);
      }
    });
  }
  const DEFAULT_CONFIG = {
    sendNotification: true,
    tokenRefreshInterval: 36e5,
    tokenExpiryThreshold: 3e5,
    panelDefaultX: 10,
    panelDefaultY: 10,
    soundNotificationEnabled: true,
    soundNotificationVolume: 0.3,
    energyFullAlertSoundEnabled: true,
    energyFullAlertVolume: 0.3,
    panelPinned: false,
    panelFollowViewport: true,
    panelReturnToOriginal: false,
    panelDashboardOnly: true,
    panelLeaderOnly: true,
    maxLogEntries: 200,
    quietModeEnabled: true,
    quietModeInterval: 12e4,
    energyThreshold: 10,
    energyFullAlertEnabled: true,
    historyMaxDays: 30,
    stealthJitterEnabled: true,
    sleepScheduleEnabled: false,
    sleepStartHour: 1,
    sleepEndHour: 6,
    autoReloginEnabled: false,
    ecoModeEnabled: true,
    shortcuts: {
      showHide: { keys: ["Control", "Shift", "KeyA"], display: "Ctrl+Shift+A" },
      workNow: { keys: ["Alt", "Shift", "KeyW"], display: "Alt+Shift+W" },
      pauseResume: { keys: ["Alt", "Shift", "KeyP"], display: "Alt+Shift+P" },
      openLog: { keys: ["Control", "Shift", "KeyL"], display: "Ctrl+Shift+L" },
      openSettings: { keys: ["Control", "Shift", "KeyS"], display: "Ctrl+Shift+S" }
    }
  };
  const NUMERIC_BOUNDS = {
    tokenRefreshInterval: [1e3, 864e5],
    tokenExpiryThreshold: [0, 864e5],
    panelDefaultX: [0, 1e4],
    panelDefaultY: [0, 1e4],
    soundNotificationVolume: [0, 1],
    energyFullAlertVolume: [0, 1],
    maxLogEntries: [1, 1e3],
    quietModeInterval: [1e3, 864e5],
    energyThreshold: [10, 100],
    historyMaxDays: [1, 365],
    sleepStartHour: [0, 23],
    sleepEndHour: [0, 23]
  };
  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
  function normalizeConfig(candidate, strict = false) {
    if (!isPlainObject(candidate)) {
      return strict ? null : { ...DEFAULT_CONFIG, shortcuts: { ...DEFAULT_CONFIG.shortcuts } };
    }
    const config = { ...DEFAULT_CONFIG, shortcuts: { ...DEFAULT_CONFIG.shortcuts } };
    for (const [key, value] of Object.entries(candidate)) {
      if (key === "shortcuts" || value === void 0) continue;
      if (typeof DEFAULT_CONFIG[key] === "boolean") {
        if (typeof value === "boolean") config[key] = value;
        else if (strict) return null;
        continue;
      }
      const bounds = NUMERIC_BOUNDS[key];
      if (bounds) {
        const valid = typeof value === "number" && Number.isFinite(value) && value >= bounds[0] && value <= bounds[1];
        if (valid) config[key] = value;
        else if (strict) return null;
      }
    }
    if (candidate.shortcuts !== void 0) {
      if (!isPlainObject(candidate.shortcuts)) {
        if (strict) return null;
      } else {
        for (const [action, shortcut] of Object.entries(candidate.shortcuts)) {
          if (!Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG.shortcuts, action)) continue;
          const valid = isPlainObject(shortcut) && Array.isArray(shortcut.keys) && shortcut.keys.length >= 1 && shortcut.keys.length <= 3 && shortcut.keys.every((k) => typeof k === "string" && /^[A-Za-z][A-Za-z0-9]*$/.test(k)) && typeof shortcut.display === "string" && /^[A-Za-z0-9+ ]{1,64}$/.test(shortcut.display);
          if (valid) config.shortcuts[action] = { keys: [...shortcut.keys], display: shortcut.display };
          else if (strict) return null;
        }
      }
    }
    return config;
  }
  function loadConfig() {
    const saved = getValue("aw_config", null);
    if (!saved) return normalizeConfig(DEFAULT_CONFIG);
    try {
      const parsed = typeof saved === "string" ? JSON.parse(saved) : saved;
      return normalizeConfig(parsed);
    } catch (e) {
      console.error("[Config] Failed to parse config:", e);
      return normalizeConfig(DEFAULT_CONFIG);
    }
  }
  function saveConfig(config) {
    setValue("aw_config", config);
  }
  function getStoredInteger(key, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
    const raw = getValue(key, fallback.toString());
    const value = Number(raw);
    return Number.isSafeInteger(value) && value >= min && value <= max ? value : fallback;
  }
  function createInitialState(CONFIG, savedStartTime, hasUncertainWorkResult) {
    return {
      running: !hasUncertainWorkResult,
      totalWorked: getStoredInteger("totalWorked", 0),
      totalWorkXP: getStoredInteger("totalWorkXP", 0),
      workToday: getStoredInteger("workToday", 0),
      xpToday: getStoredInteger("xpToday", 0),
      lastWorkDate: getValue("lastWorkDate", (/* @__PURE__ */ new Date()).toDateString()),
      lastWorkTime: getValue("lastWorkTime", "Belum pernah"),
      currentToken: null,
      tokenExpiry: null,
      storedTokenValue: "",
      pausedForToken: false,
      tokenExpired: false,
      currentEnergy: 0,
      maxEnergy: 100,
      energyFullAlertActive: false,
      energySyncBase: null,
      workInFlight: false,
      workResultUncertain: hasUncertainWorkResult,
      uncertainReconciliation: hasUncertainWorkResult ? "pending" : "none",
      playerLevel: 1,
      regionName: "",
      regionHealthBonusPercent: 0,
      panelMinimized: getValue("panelMinimized", "false") === "true",
      panelVisible: getValue("panelVisible", "true") === "true",
      userManuallyToggledPanel: false,
      panelX: getStoredInteger("panelX", CONFIG.panelDefaultX, 0, 1e4),
      panelY: getStoredInteger("panelY", CONFIG.panelDefaultY, 0, 1e4),
      originalPanelX: getStoredInteger("panelX", CONFIG.panelDefaultX, 0, 1e4),
      originalPanelY: getStoredInteger("panelY", CONFIG.panelDefaultY, 0, 1e4),
      logs: [],
      settingsOpen: false,
      lastLowEnergyLogTime: 0,
      scriptStartTime: Date.now(),
      sessionStartTime: savedStartTime,
      nextWorkTimestamp: 0,
      isTabLockOwner: false,
      tabLockManaged: false,
      waitedForTabLock: false,
      totalEnergySpent: getStoredInteger("totalEnergySpent", 0),
      totalActualEnergySpent: getStoredInteger("totalActualEnergySpent", 0),
      totalEstimatedEnergySpent: getStoredInteger("totalEstimatedEnergySpent", 0)
    };
  }
  function saveState(state) {
    const entries = {
      totalWorked: state.totalWorked.toString(),
      workToday: state.workToday.toString(),
      totalWorkXP: state.totalWorkXP.toString(),
      xpToday: state.xpToday.toString(),
      totalEnergySpent: state.totalEnergySpent.toString(),
      totalActualEnergySpent: state.totalActualEnergySpent.toString(),
      totalEstimatedEnergySpent: state.totalEstimatedEnergySpent.toString(),
      lastWorkTime: state.lastWorkTime,
      lastWorkDate: state.lastWorkDate
    };
    for (const [k, v] of Object.entries(entries)) setValue(k, v);
  }
  let _lastLiveStatusJson = "";
  let _lastLiveStatusAt = 0;
  function getLiveStatusSummary(state, CONFIG = null) {
    const lastLog = state.lastLogMessage || (state.logs && state.logs.length > 0 ? state.logs[0].message : "");
    const isExpired = Boolean(
      state.tokenExpired || state.pausedForToken || !state.currentToken || state.tokenExpiry && Number(state.tokenExpiry) <= Date.now()
    );
    const threshold = CONFIG?.energyThreshold ?? 10;
    const curEnergy = state.currentEnergy ?? 0;
    let nextTimestamp = state.nextWorkTimestamp ?? 0;
    if (!nextTimestamp && curEnergy < threshold) {
      const rate = state.regenRate || 1;
      const neededMins = Math.max(1, (threshold - curEnergy) / rate);
      nextTimestamp = Date.now() + Math.round(neededMins * 6e4);
      state.nextWorkTimestamp = nextTimestamp;
    }
    return {
      running: Boolean(state.running),
      currentEnergy: curEnergy,
      maxEnergy: state.maxEnergy ?? 100,
      nextWorkTimestamp: nextTimestamp,
      workToday: state.workToday ?? 0,
      xpToday: state.xpToday ?? 0,
      totalWorked: state.totalWorked ?? 0,
      totalWorkXP: state.totalWorkXP ?? 0,
      hasToken: Boolean(state.currentToken),
      tokenExpiry: state.tokenExpiry ? new Date(state.tokenExpiry).getTime() : null,
      tokenExpired: isExpired,
      pausedForToken: Boolean(state.pausedForToken),
      lastWorkTime: state.lastWorkTime || "Belum pernah",
      energyThreshold: threshold,
      playerLevel: state.playerLevel || 1,
      regionName: state.regionName || "",
      regionHealthBonusPercent: state.regionHealthBonusPercent || 0,
      regenRate: state.regenRate || 1,
      lastLogMessage: lastLog,
      isTabLockOwner: Boolean(state.isTabLockOwner),
      updatedAt: Date.now()
    };
  }
  function saveLiveStatus(state, CONFIG = null, force = false) {
    const summary = getLiveStatusSummary(state, CONFIG);
    if (!force && state.tabLockManaged && !state.isTabLockOwner && document.hidden) {
      return summary;
    }
    const nextWorkBucket = Math.round((summary.nextWorkTimestamp || 0) / 3e3);
    const keyFields = `${summary.running}|${summary.currentEnergy}|${summary.maxEnergy}|${summary.workToday}|${summary.hasToken}|${summary.tokenExpired}|${summary.energyThreshold}|${nextWorkBucket}|${summary.lastLogMessage}`;
    const now = Date.now();
    if (!force && keyFields === _lastLiveStatusJson && now - _lastLiveStatusAt < 3e3) {
      return summary;
    }
    _lastLiveStatusJson = keyFields;
    _lastLiveStatusAt = now;
    setValue("aw_live_status", summary);
    return summary;
  }
  function reloadStateFromStorage(state, loadWorkHistory2) {
    state.totalWorked = getStoredInteger("totalWorked", 0);
    state.totalWorkXP = getStoredInteger("totalWorkXP", 0);
    state.workToday = getStoredInteger("workToday", 0);
    state.xpToday = getStoredInteger("xpToday", 0);
    state.totalEnergySpent = getStoredInteger("totalEnergySpent", 0);
    state.totalActualEnergySpent = getStoredInteger("totalActualEnergySpent", 0);
    state.totalEstimatedEnergySpent = getStoredInteger("totalEstimatedEnergySpent", 0);
    state.lastWorkDate = getValue("lastWorkDate", (/* @__PURE__ */ new Date()).toDateString());
    state.lastWorkTime = getValue("lastWorkTime", "Belum pernah");
    loadWorkHistory2();
  }
  function pruneOldHistory(history2, maxDays = 30) {
    const cutoff = /* @__PURE__ */ new Date();
    cutoff.setDate(cutoff.getDate() - (maxDays || 30));
    let pruned = false;
    for (const key of Object.keys(history2)) {
      if (new Date(key) < cutoff) {
        delete history2[key];
        pruned = true;
      }
    }
    return pruned;
  }
  function normalizeWorkHistory(candidate) {
    if (!isPlainObject(candidate)) return null;
    const normalized = /* @__PURE__ */ Object.create(null);
    for (const [key, entry] of Object.entries(candidate)) {
      const date = new Date(key);
      if (Number.isNaN(date.getTime()) || date.toDateString() !== key || !isPlainObject(entry) || !Number.isSafeInteger(entry.shifts) || entry.shifts < 0 || !Number.isSafeInteger(entry.xp) || entry.xp < 0) return null;
      const hasEnergyData = ["energySpent", "estimatedEnergySpent", "energyDataShifts"].some((f) => Object.prototype.hasOwnProperty.call(entry, f));
      if (hasEnergyData && (!Number.isSafeInteger(entry.energySpent) || entry.energySpent < 0 || !Number.isSafeInteger(entry.estimatedEnergySpent) || entry.estimatedEnergySpent < 0 || !Number.isSafeInteger(entry.energyDataShifts) || entry.energyDataShifts < 0 || entry.energyDataShifts > entry.shifts)) return null;
      normalized[key] = { shifts: entry.shifts, xp: entry.xp };
      if (hasEnergyData) {
        normalized[key].energySpent = entry.energySpent;
        normalized[key].estimatedEnergySpent = entry.estimatedEnergySpent;
        normalized[key].energyDataShifts = entry.energyDataShifts;
      }
    }
    return normalized;
  }
  function migrateLegacyEnergyHistory(history2) {
    for (const entry of Object.values(history2)) {
      if (Object.prototype.hasOwnProperty.call(entry, "energySpent")) {
        entry.energySpent = Math.max(0, entry.energySpent - entry.estimatedEnergySpent);
      }
    }
    return history2;
  }
  function loadWorkHistory(state = {}, CONFIG = {}) {
    try {
      const raw = getValue("aw_workHistory", null);
      const parsed = raw ? typeof raw === "string" ? JSON.parse(raw) : raw : {};
      let history2 = normalizeWorkHistory(parsed) || /* @__PURE__ */ Object.create(null);
      if (getStoredInteger("aw_energySchemaVersion", 1, 1, 2) < 2) {
        migrateLegacyEnergyHistory(history2);
        setValue("aw_energySchemaVersion", "2");
        setValue("aw_workHistory", JSON.stringify(history2));
      }
      const workToday = getStoredInteger("workToday", 0);
      const xpToday = getStoredInteger("xpToday", 0);
      const todayKey = (/* @__PURE__ */ new Date()).toDateString();
      const maxDays = CONFIG?.historyMaxDays || 30;
      if (!history2[todayKey] || history2[todayKey].shifts !== workToday || history2[todayKey].xp !== xpToday) {
        history2[todayKey] = { shifts: workToday, xp: xpToday };
        pruneOldHistory(history2, maxDays);
        setValue("aw_workHistory", JSON.stringify(history2));
      } else if (pruneOldHistory(history2, maxDays)) {
        setValue("aw_workHistory", JSON.stringify(history2));
      }
      return history2;
    } catch (e) {
      console.error("[History] Failed to load:", e);
      return {};
    }
  }
  function saveWorkHistory(history2) {
    setValue("aw_workHistory", JSON.stringify(history2));
  }
  const recentRepeatedLogs = /* @__PURE__ */ new Map();
  let onLogUpdate = null;
  function setLogUpdateCallback(fn) {
    onLogUpdate = fn;
  }
  function log(state, CONFIG, message, type = "info", toActivityLog = true) {
    const now = (/* @__PURE__ */ new Date()).toLocaleTimeString("id-ID");
    const prefix = type === "error" ? "[ERROR]" : type === "success" ? "[OK]" : type === "warn" ? "[WARN]" : "[INFO]";
    if (toActivityLog && type === "warn" && /(?:Energi (?:belum|tidak) cukup|Server menolak kerja|Shift tidak menghasilkan unit)/i.test(message) && CONFIG.quietModeEnabled) {
      const nowMs = Date.now();
      if (nowMs - state.lastLowEnergyLogTime < CONFIG.quietModeInterval) return;
      state.lastLowEnergyLogTime = nowMs;
    }
    if (toActivityLog && (type === "warn" || type === "error")) {
      const throttleKey = /^Retry dalam /i.test(message) ? `${type}:retry` : `${type}:${message}`;
      const nowMs = Date.now();
      const previous = recentRepeatedLogs.get(throttleKey);
      if (previous && nowMs - previous.time < 3e4) {
        previous.suppressed++;
        return;
      }
      if (previous?.suppressed > 0) {
        message += ` (${previous.suppressed} pesan serupa disembunyikan)`;
      }
      recentRepeatedLogs.set(throttleKey, { time: nowMs, suppressed: 0 });
      if (recentRepeatedLogs.size > 100) {
        recentRepeatedLogs.delete(recentRepeatedLogs.keys().next().value);
      }
    }
    console.log(`[${now}] ${prefix} ${message}`);
    state.lastLogMessage = `[${now}] ${message}`;
    state.lastLogTime = now;
    if (!toActivityLog) return;
    state.logs.unshift({ time: now, type, message });
    if (state.logs.length > CONFIG.maxLogEntries) {
      state.logs = state.logs.slice(0, CONFIG.maxLogEntries);
    }
    _persistLogs(state.logs);
    onLogUpdate?.();
  }
  let _persistTimer = null;
  function _persistLogs(logs) {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return;
    if (_persistTimer) clearTimeout(_persistTimer);
    _persistTimer = setTimeout(() => {
      _persistTimer = null;
      try {
        const trimmed = logs.slice(0, 80);
        setValue("aw_recent_logs", trimmed);
      } catch {
      }
    }, 300);
  }
  function clearStoredLogs$1() {
    if (_persistTimer) {
      clearTimeout(_persistTimer);
      _persistTimer = null;
    }
    recentRepeatedLogs.clear();
    setValue("aw_recent_logs", []);
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      try {
        chrome.storage.local.set({ aw_recent_logs: [] }).catch(() => {
        });
      } catch {
      }
    }
  }
  function parseJwt(rawToken) {
    if (!rawToken || typeof rawToken !== "string") return null;
    try {
      let clean = rawToken.trim();
      if (clean.startsWith('"') && clean.endsWith('"') || clean.startsWith("'") && clean.endsWith("'")) {
        try {
          clean = JSON.parse(clean);
        } catch {
          clean = clean.slice(1, -1).trim();
        }
      }
      clean = clean.replace(/^Bearer\s+/i, "").trim();
      if (clean.startsWith("{")) {
        try {
          const obj = JSON.parse(clean);
          clean = obj.token || obj.access_token || obj.jwt || obj.value || clean;
        } catch {
        }
      }
      const parts = clean.split(".");
      if (parts.length !== 3) return null;
      let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      while (base64.length % 4 !== 0) base64 += "=";
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const payload = JSON.parse(new TextDecoder("utf-8").decode(bytes));
      const expiry = payload.exp ? new Date(payload.exp * 1e3) : null;
      return { payload, cleanToken: clean, expiry, isExpired: expiry ? expiry < /* @__PURE__ */ new Date() : false };
    } catch (err) {
      console.error("[JWT] Failed to parse:", err);
      return null;
    }
  }
  function handleNewToken(state, logFn, wakePendingWork, rawCandidate, source = "storage", onResume = null, onUpdate = null) {
    if (!rawCandidate) return false;
    const parsed = parseJwt(rawCandidate);
    if (!parsed) return false;
    const { cleanToken, expiry, isExpired } = parsed;
    if (isExpired) {
      console.warn(`[Token] Token dari ${source} sudah EXPIRED pada ${expiry?.toLocaleString("id-ID")}`);
      return false;
    }
    if (cleanToken === state.storedTokenValue && state.currentToken) return true;
    state.storedTokenValue = cleanToken;
    state.currentToken = `Bearer ${cleanToken}`;
    state.tokenExpiry = expiry;
    try {
      setValue("aw_auth_token", cleanToken);
      setValue("aw_auth_token_expiry", expiry ? expiry.getTime().toString() : "");
    } catch {
    }
    const diff = expiry ? Math.floor((expiry - Date.now()) / 1e3) : null;
    const timeStr = expiry ? `${expiry.toLocaleTimeString("id-ID")} (${Math.floor(diff / 3600)}h ${Math.floor(diff % 3600 / 60)}m)` : "Tidak ada exp";
    logFn(`Token valid via ${source}! Exp: ${timeStr}`, "success");
    state.tokenExpired = false;
    if (state.pausedForToken || !state.running) {
      state.running = true;
      state.pausedForToken = false;
      logFn("Sesi diperbarui. Script dilanjutkan otomatis.", "success");
      onResume?.();
      wakePendingWork?.();
    }
    onUpdate?.();
    return true;
  }
  function getTokenFromStorage(state, handleNewTokenFn) {
    const shouldLog = Date.now() - (getTokenFromStorage._lastDiagAt || 0) >= 3e4;
    if (shouldLog) {
      console.log("[Token] Memindai storage...");
      getTokenFromStorage._lastDiagAt = Date.now();
    }
    const storages = [];
    try {
      if (window.localStorage) storages.push({ name: "localStorage", store: window.localStorage });
    } catch {
    }
    try {
      const pw = window;
      if (pw?.localStorage && pw.localStorage !== window.localStorage) {
        storages.push({ name: "pw.localStorage", store: pw.localStorage });
      }
    } catch {
    }
    try {
      if (window.sessionStorage) storages.push({ name: "sessionStorage", store: window.sessionStorage });
    } catch {
    }
    const commonKeys = [
      "token",
      "auth_token",
      "authToken",
      "access_token",
      "jwt",
      "session",
      "parlamentum_token",
      "sb-token",
      "sb-access-token",
      "user_token"
    ];
    for (const { name, store } of storages) {
      for (const key of commonKeys) {
        const val = store.getItem(key);
        if (val && handleNewTokenFn(val, `${name}[${key}]`)) return state.currentToken;
      }
    }
    for (const { name, store } of storages) {
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (!key) continue;
        const val = store.getItem(key);
        if (val && typeof val === "string" && (val.includes("eyJ") || val.startsWith("{"))) {
          if (handleNewTokenFn(val, `${name}[auto:${key}]`)) return state.currentToken;
        }
      }
    }
    if (shouldLog) {
      console.warn("[Token] Tidak ditemukan. Keys tersedia:");
      for (const { name, store } of storages) {
        try {
          console.log(`  ${name}:`, Object.keys(store));
        } catch {
        }
      }
    }
    return null;
  }
  function getTimeUntilExpiry(state) {
    if (!state.tokenExpiry) return "N/A";
    const diff = state.tokenExpiry - Date.now();
    if (diff <= 0) return "EXPIRED";
    return `${Math.floor(diff / 36e5)}h ${Math.floor(diff % 36e5 / 6e4)}m`;
  }
  function startTokenWatcher(state, handleNewTokenFn, getTokenFn) {
    window.addEventListener("storage", ({ newValue, key }) => {
      if (newValue) handleNewTokenFn(newValue, `storage-event[${key}]`);
    });
    try {
      const origFetch = window.fetch;
      window.fetch = function(...args) {
        try {
          const [input, config] = args;
          let auth = null;
          if (config?.headers) {
            auth = config.headers instanceof Headers ? config.headers.get("Authorization") || config.headers.get("authorization") : config.headers["Authorization"] || config.headers["authorization"];
          }
          if (!auth && input instanceof Request) {
            auth = input.headers?.get("Authorization") || input.headers?.get("authorization");
          }
          if (auth?.includes("Bearer ")) handleNewTokenFn(auth, "fetch-intercept");
        } catch {
        }
        return origFetch.apply(this, args);
      };
    } catch {
    }
    setInterval(() => {
      if (!state.currentToken || state.tokenExpiry && state.tokenExpiry < /* @__PURE__ */ new Date()) {
        getTokenFn();
      }
    }, 8e3);
  }
  function getCurrentEnergy$1() {
    try {
      const isExcluded = (el) => Boolean(
        el.closest("#aw-panel, #aw-settings-modal, #aw-analytics-modal, #aw-log-modal, #aw-notification-toast")
      );
      const topCandidates = document.querySelectorAll('header, nav, [role="banner"], [class*="nav" i], [class*="header" i], [class*="topbar" i], [class*="navbar" i]');
      for (const container of topCandidates) {
        if (isExcluded(container)) continue;
        const els = container.querySelectorAll("*");
        const matches2 = [];
        for (const el of els) {
          if (isExcluded(el)) continue;
          const text = (el.textContent || "").trim();
          if (!text.includes("/")) continue;
          if (text.length > 30) continue;
          const m = text.match(/(?:⚡|\b)(\d+)\s*\/\s*(\d+)\b/);
          if (m) {
            const current = parseInt(m[1], 10), max = parseInt(m[2], 10);
            if (max >= 50 && max <= 350 && current <= max) {
              matches2.push({ current, max, len: text.length });
            }
          }
        }
        if (matches2.length > 0) {
          matches2.sort((a, b) => a.len - b.len);
          return { current: matches2[0].current, max: matches2[0].max };
        }
      }
      const energyHeaders = document.querySelectorAll("h1, h2, h3, h4, h5, h6, span, div, p");
      for (const h of energyHeaders) {
        if (isExcluded(h)) continue;
        const t = (h.textContent || "").trim();
        if (/^⚡?\s*(?:ENERGI|ENERGY)\b/i.test(t) && t.length <= 30) {
          let card = h.parentElement;
          for (let level = 0; level < 4 && card && card !== document.body; level++) {
            const innerEls = card.querySelectorAll("*");
            for (const el of innerEls) {
              if (isExcluded(el)) continue;
              const txt = (el.textContent || "").trim();
              if (!txt.includes("/") || txt.length > 25) continue;
              const m2 = txt.match(/(?:⚡|\b)(\d+)\s*\/\s*(\d+)/);
              if (m2) {
                const current = parseInt(m2[1], 10), max = parseInt(m2[2], 10);
                if (max >= 50 && max <= 350 && current <= max) {
                  return { current, max };
                }
              }
            }
            const cardText = (card.textContent || "").trim();
            const m = cardText.match(/(\d+)\s*\/\s*(\d+)/);
            if (m) {
              const current = parseInt(m[1], 10), max = parseInt(m[2], 10);
              if (max >= 50 && max <= 350 && current <= max) {
                return { current, max };
              }
            }
            card = card.parentElement;
          }
        }
      }
      const allCandidates = document.querySelectorAll('div, span, p, a, button, [role="status"]');
      const matches = [];
      for (const el of allCandidates) {
        if (isExcluded(el)) continue;
        const text = (el.textContent || "").trim();
        if (!text.includes("/")) continue;
        if (text.length > 35) continue;
        const m = text.match(/(?:⚡|\b)(\d+)\s*\/\s*(\d+)\b/);
        if (m) {
          const current = parseInt(m[1], 10), max = parseInt(m[2], 10);
          if (max >= 50 && max <= 350 && current <= max) {
            const hasIcon = text.includes("⚡") || Boolean(el.querySelector("svg"));
            matches.push({ current, max, len: text.length, hasIcon });
          }
        }
      }
      if (matches.length > 0) {
        matches.sort((a, b) => (b.hasIcon ? 1 : 0) - (a.hasIcon ? 1 : 0) || a.len - b.len);
        return { current: matches[0].current, max: matches[0].max };
      }
      const slashEls = document.querySelectorAll("span, div");
      for (const el of slashEls) {
        if (isExcluded(el)) continue;
        if ((el.textContent || "").trim() === "/") {
          const prev = el.previousElementSibling;
          const next = el.nextElementSibling;
          if (prev && next) {
            const current = parseInt((prev.textContent || "").trim(), 10);
            const max = parseInt((next.textContent || "").trim(), 10);
            if (Number.isSafeInteger(current) && Number.isSafeInteger(max) && max >= 50 && max <= 350 && current <= max) {
              return { current, max };
            }
          }
        }
      }
    } catch {
    }
    return null;
  }
  function waitForEnergyElement(maxWaitMs = 15e3) {
    return new Promise((resolve) => {
      const immediate = getCurrentEnergy$1();
      if (immediate) return resolve(immediate);
      const deadline = Date.now() + maxWaitMs;
      const observer = new MutationObserver(() => {
        const result = getCurrentEnergy$1();
        if (result) {
          observer.disconnect();
          resolve(result);
        } else if (Date.now() >= deadline) {
          observer.disconnect();
          resolve(null);
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => {
        observer.disconnect();
        resolve(getCurrentEnergy$1());
      }, maxWaitMs);
    });
  }
  function getSyncedEnergy(state) {
    const isHidden = typeof document !== "undefined" && document.hidden;
    const now = Date.now();
    if (isHidden && state.energySyncBase && typeof state.energySyncBase.current === "number") {
      const syncBase2 = state.energySyncBase;
      const max = syncBase2.max || state.maxEnergy || 115;
      const elapsedMins = syncBase2.updatedAt ? (now - syncBase2.updatedAt) / 6e4 : 0;
      const regenRate = state.regenRate || 1;
      const gained = Math.floor(elapsedMins * regenRate);
      const calculated = Math.min(max, syncBase2.current + Math.max(0, gained));
      return { current: calculated, max };
    }
    const pageEnergy = getCurrentEnergy$1();
    if (pageEnergy && !isHidden) {
      state.domEnergyStale = false;
      state.currentEnergy = pageEnergy.current;
      state.maxEnergy = pageEnergy.max;
      state.energySyncBase = { current: pageEnergy.current, max: pageEnergy.max, updatedAt: now };
      return pageEnergy;
    }
    const syncBase = state.energySyncBase;
    if (syncBase && typeof syncBase.current === "number") {
      const max = syncBase.max || state.maxEnergy || 115;
      const elapsedMins = syncBase.updatedAt ? (now - syncBase.updatedAt) / 6e4 : 0;
      const regenRate = state.regenRate || getRegionHealthBonus() || 1;
      const gained = Math.floor(elapsedMins * regenRate);
      const calculated = Math.min(max, syncBase.current + Math.max(0, gained));
      return { current: calculated, max };
    }
    if (pageEnergy) {
      return pageEnergy;
    }
    return { current: state.currentEnergy || 0, max: state.maxEnergy || 115 };
  }
  function isSleepTime(CONFIG) {
    if (!CONFIG?.sleepScheduleEnabled) return false;
    const now = /* @__PURE__ */ new Date();
    const currentHour = now.getHours();
    const start = CONFIG.sleepStartHour ?? 1;
    const end = CONFIG.sleepEndHour ?? 6;
    if (start < end) {
      return currentHour >= start && currentHour < end;
    } else {
      return currentHour >= start || currentHour < end;
    }
  }
  let _cachedRegionDetails = null;
  let _lastRegionScanTime = 0;
  function getGameEnergyFullText() {
    try {
      const isExcluded = (el) => Boolean(
        el.closest("#aw-panel, #aw-settings-modal, #aw-analytics-modal, #aw-log-modal, #aw-notification-toast")
      );
      const energyHeaders = document.querySelectorAll("h1, h2, h3, h4, h5, h6, span, div, p");
      for (const h of energyHeaders) {
        if (isExcluded(h)) continue;
        const t = (h.textContent || "").trim();
        if (/^⚡?\s*(?:ENERGI|ENERGY)\b/i.test(t) && t.length <= 25) {
          let card = h.parentElement;
          for (let level = 0; level < 4 && card && card !== document.body; level++) {
            const txt = card.innerText || card.textContent || "";
            const m2 = txt.match(/Penuh\s+dalam\s+([0-9\sA-Za-z<]+?)(?:\n|$|\.|\()/i);
            if (m2 && m2[1]) {
              const raw = m2[1].trim();
              if (raw.length > 0 && raw.length <= 15) return raw;
            }
            card = card.parentElement;
          }
        }
      }
      const bodyText = document.body ? document.body.innerText || "" : "";
      const m = bodyText.match(/Penuh\s+dalam\s+([0-9\sA-Za-z<]+?)(?:\n|$|\.|\()/i);
      if (m && m[1]) {
        const raw = m[1].trim();
        if (raw.length > 0 && raw.length <= 15) return raw;
      }
    } catch {
    }
    return null;
  }
  function getRegionDetails(force = false) {
    if (typeof document === "undefined") {
      return { name: "Wilayah", level: 0, bonusPercent: 0, bonusMultiplier: 1 };
    }
    const now = Date.now();
    if (!force && _cachedRegionDetails && now - _lastRegionScanTime < 1e4) {
      return _cachedRegionDetails;
    }
    let name = "";
    let level = 0;
    let bonusPercent = 0;
    let scrapedRate = 0;
    let bodyText = "";
    try {
      const textParts = [];
      if (document.body) textParts.push(document.body.innerText || "");
      const tooltips = document.querySelectorAll('[role="tooltip"], [data-radix-popper-content-wrapper], [class*="tooltip" i], [class*="popover" i]');
      for (const tip of tooltips) {
        textParts.push(tip.innerText || tip.textContent || "");
      }
      bodyText = textParts.join("\n");
      const kamuMatch = bodyText.match(/Kamu\s+di\s+sini\s*[—–-]\s*([A-Za-zÀ-ÿ\s]{2,30})/i);
      if (kamuMatch && kamuMatch[1]) {
        name = kamuMatch[1].trim();
      }
      if (!name) {
        const ditempatkanMatch = bodyText.match(/DITEMPATKAN\s+DI[^\n]*\n+([A-Za-zÀ-ÿ\s]{2,30})\n/i);
        if (ditempatkanMatch && ditempatkanMatch[1]) {
          const cand = ditempatkanMatch[1].trim();
          if (!/^(?:DI\s+PETA|PETA|MAP)\b/i.test(cand)) {
            name = cand;
          }
        }
      }
      if (!name) {
        const nkriMatch = bodyText.match(/(?:Negara\s+Kesatuan\s+Republik\s+Indonesia|NKRI)[^\n]*\n+([A-Za-zÀ-ÿ\s]{2,30})\n/i);
        if (nkriMatch && nkriMatch[1]) {
          name = nkriMatch[1].trim();
        }
      }
      if (!name) {
        const topMatch = bodyText.match(/\d\d:\d\d\s+UTC\s*\n*([A-Za-zÀ-ÿ\s]{2,30})/i);
        if (topMatch && topMatch[1]) {
          name = topMatch[1].trim();
        }
      }
      if (name) {
        name = name.split("\n")[0].trim();
        name = name.toLowerCase().replace(/\b[a-zÀ-ÿ]/g, (c) => c.toUpperCase());
      }
      const rateMatch = bodyText.match(/(?:REGENERASI\s+ENERGI[^\n\d]*)?\+([0-9.]+)\s*\/\s*(?:mnt|min)/i);
      if (rateMatch && rateMatch[1]) {
        const val = parseFloat(rateMatch[1]);
        if (val >= 0.5 && val <= 10) {
          scrapedRate = val;
        }
      }
      const tipMatch = bodyText.match(/Kesehatan\s*(?:kota|wilayah)?\s*:\s*\+?(\d+)%/i);
      if (tipMatch && tipMatch[1]) {
        bonusPercent = parseInt(tipMatch[1], 10);
        level = Math.round(bonusPercent / 5);
      }
      let crownMult = 1;
      const crownMatch = bodyText.match(/BONUS\s+INDEKS[^\d\n]*(\d+(?:\.\d+)?)/i);
      if (crownMatch && crownMatch[1]) {
        const parsedCrown = parseFloat(crownMatch[1]);
        if (parsedCrown >= 1 && parsedCrown <= 2) {
          crownMult = parsedCrown;
        }
      }
      if (!level && !bonusPercent) {
        const kesMatch = bodyText.match(/\bKESEHATAN\b[^\d\n]*(\d+)/i);
        if (kesMatch && kesMatch[1]) {
          level = parseInt(kesMatch[1], 10);
          bonusPercent = Math.round(level * 5 * crownMult);
        }
      }
      if (!level && !bonusPercent) {
        const el = document.querySelector('[data-testid="region-index-health"]');
        if (el) {
          const aria = el.querySelector('[aria-label*="Kesehatan"]')?.getAttribute("aria-label");
          const m = aria?.match(/Kesehatan\s+(\d+)/i);
          if (m) {
            level = parseInt(m[1], 10);
            bonusPercent = Math.round(level * 5 * crownMult);
          }
        }
      }
    } catch (err) {
      console.error("[getRegionDetails] Error:", err);
    }
    if (scrapedRate > 0 && !bonusPercent) {
      bonusPercent = Math.round((scrapedRate - 1) * 100);
    }
    if (bonusPercent > 0 && !scrapedRate) {
      const mult = 1 + bonusPercent / 100;
      const tickSec = Math.round(60 / mult);
      scrapedRate = Math.round(60 / tickSec * 100) / 100;
    }
    level = Math.max(0, Math.min(15, level || Math.round(bonusPercent / 5)));
    if (!bonusPercent && level > 0) {
      bonusPercent = level * 5;
    }
    if (_cachedRegionDetails && _cachedRegionDetails.name === (name || _cachedRegionDetails.name)) {
      if (_cachedRegionDetails.bonusPercent > bonusPercent && !bodyText.includes("Kesehatan")) {
        bonusPercent = _cachedRegionDetails.bonusPercent;
      }
      if (_cachedRegionDetails.bonusMultiplier > scrapedRate && !bodyText.includes("/mnt")) {
        scrapedRate = _cachedRegionDetails.bonusMultiplier;
      }
    }
    const finalMultiplier = scrapedRate > 0 ? scrapedRate : 1 + bonusPercent / 100;
    const result = {
      name: name || _cachedRegionDetails?.name || "Jawa Barat",
      level,
      bonusPercent: bonusPercent || _cachedRegionDetails?.bonusPercent || 0,
      bonusMultiplier: finalMultiplier || 1
    };
    if (name || level > 0 || bonusPercent > 0 || scrapedRate > 0) {
      _cachedRegionDetails = result;
      _lastRegionScanTime = now;
    }
    return result;
  }
  function getRegionHealthBonus() {
    return getRegionDetails().bonusMultiplier;
  }
  function getMsUntilSleepEnd(CONFIG) {
    const now = /* @__PURE__ */ new Date();
    const end = /* @__PURE__ */ new Date();
    end.setHours(CONFIG.sleepEndHour ?? 6, 0, 0, 0);
    if (end <= now) end.setDate(end.getDate() + 1);
    return Math.max(1e3, end.getTime() - now.getTime());
  }
  function getNextWorkDelay(state, CONFIG) {
    if (isSleepTime(CONFIG)) {
      return getMsUntilSleepEnd(CONFIG);
    }
    let threshold = CONFIG.energyThreshold;
    if (CONFIG.stealthJitterEnabled) {
      const variance = Math.floor(Math.random() * 4) - 1;
      threshold = Math.min(100, Math.max(10, threshold + variance));
    }
    if (state.currentEnergy >= threshold) return 3e3;
    const energyNeeded = threshold - state.currentEnergy;
    const regenRate = state.regenRate || getRegionHealthBonus() || 1;
    state.regenRate = regenRate;
    const msNeeded = energyNeeded / regenRate * 6e4;
    const jitter = Math.floor(Math.random() * 7e3) + 3e3;
    return Math.round(msNeeded + jitter);
  }
  function getLiveCountdown(state, CONFIG) {
    if (isSleepTime(CONFIG)) return "Tidur";
    const threshold = CONFIG.energyThreshold || 10;
    const curEnergy = state.currentEnergy ?? 0;
    if (curEnergy >= threshold) return "Now!";
    let remaining = (state.nextWorkTimestamp || 0) - Date.now();
    if (!state.nextWorkTimestamp && curEnergy < threshold) {
      const regenRate = state.regenRate || 1;
      remaining = Math.max(1, (threshold - curEnergy) / regenRate) * 6e4;
    }
    if (remaining <= 0) return "Menunggu energi...";
    const total = Math.ceil(remaining / 1e3);
    return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, "0")}s`;
  }
  function getTimeToFullEnergy(state) {
    const maxE = Math.max(50, state.maxEnergy || 115);
    const curE = Math.max(0, state.currentEnergy ?? 0);
    const needed = Math.max(0, maxE - curE);
    if (needed <= 0) return "Penuh!";
    const regenRate = Math.max(0.5, state.regenRate || 1);
    const exactMinutes = Math.max(1, Math.round(needed / regenRate));
    if (exactMinutes < 60) {
      return `~${exactMinutes} mnt`;
    }
    const h = Math.max(0, Math.floor(exactMinutes / 60));
    const m = Math.max(0, exactMinutes % 60);
    if (m === 0) return `~${h} j`;
    if (h < 24) return `~${h} j ${m} mnt`;
    const d = Math.floor(h / 24);
    return `~${d} hari ${h % 24} j`;
  }
  let _playerLevelLastScan = 0;
  function getPlayerLevel(state) {
    if (Date.now() - _playerLevelLastScan < 1e4) return state.playerLevel;
    _playerLevelLastScan = Date.now();
    try {
      const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
      let node;
      while (node = walker.nextNode()) {
        const m = node.textContent.trim().match(/^Level\s+(\d+)$/i);
        if (m) return parseInt(m[1], 10);
      }
    } catch {
    }
    return state.playerLevel;
  }
  function getMaxEnergyForLevel(level) {
    return Math.min(300, 100 + 5 * (level - 1));
  }
  let _lastPatchedCurrent = null;
  let _lastPatchedMax = null;
  let _lastPatchTime = 0;
  function patchPageVisualEnergy(current, max, force = false) {
    if (typeof document === "undefined") return;
    try {
      let patchTextInElement = function(el) {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node;
        let patched = false;
        while (node = walker.nextNode()) {
          const val = node.nodeValue || "";
          if (val.includes("/") && /\d+\s*\/\s*\d+/.test(val)) {
            node.nodeValue = val.replace(/(\d+)(\s*\/\s*)(\d+)/, (match, p1, p2, p3) => {
              const mMax = parseInt(p3, 10);
              if (mMax >= 50 && mMax <= 350) {
                patched = true;
                return `${safeCurrent}${p2}${safeMax || mMax}`;
              }
              return match;
            });
          }
        }
        if (!patched) {
          const text = (el.textContent || "").trim();
          const m = text.match(/^(\d+)(\s*\/\s*)(\d+)$/);
          if (m) {
            const mMax = parseInt(m[3], 10);
            if (mMax >= 50 && mMax <= 350) {
              const walker2 = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
              let firstTextNode = walker2.nextNode();
              if (firstTextNode && /^\d+$/.test(firstTextNode.nodeValue?.trim() || "")) {
                firstTextNode.nodeValue = String(safeCurrent);
              }
            }
          }
        }
      };
      const safeCurrent = Math.max(0, Math.round(current));
      const safeMax = typeof max === "number" && max > 0 ? Math.round(max) : 115;
      const now = Date.now();
      if (!force && safeCurrent === _lastPatchedCurrent && safeMax === _lastPatchedMax && now - _lastPatchTime < 1e3) {
        return;
      }
      _lastPatchedCurrent = safeCurrent;
      _lastPatchedMax = safeMax;
      _lastPatchTime = now;
      const pct = Math.min(100, Math.max(0, safeCurrent / safeMax * 100)).toFixed(1);
      const FORBIDDEN_WORDS = /(?:SKOR\s+KOTA|KAPASITAS\s+WILAYAH|PETA\s+LANGSUNG|INFRASTRUKTUR)/i;
      const isExcluded = (el) => {
        if (!el) return true;
        if (el.closest("#aw-panel, #aw-settings-modal, #aw-analytics-modal, #aw-log-modal, #aw-notification-toast")) return true;
        const container = el.closest("div, section, article");
        if (container) {
          const text = container.textContent || "";
          if (FORBIDDEN_WORDS.test(text) && !/^\s*⚡?\s*ENERGI\b/i.test(text)) {
            return true;
          }
        }
        return false;
      };
      const energyHeaders = document.querySelectorAll("h1, h2, h3, h4, h5, h6, span, div, p");
      for (const h of energyHeaders) {
        if (isExcluded(h)) continue;
        const t = (h.textContent || "").trim();
        if (/^⚡?\s*(?:ENERGI|ENERGY)\b/i.test(t) && t.length <= 15) {
          let card = h.parentElement;
          let depth = 0;
          while (card && card !== document.body && depth < 5) {
            const cardText = (card.textContent || "").trim();
            if (FORBIDDEN_WORDS.test(cardText)) break;
            if (cardText.includes("/") && /\d+\s*\/\s*\d+/.test(cardText)) {
              const innerEls = card.querySelectorAll("*");
              for (const el of innerEls) {
                if (isExcluded(el)) continue;
                const txt = (el.textContent || "").trim();
                if (txt.includes("/") && txt.length <= 25 && /\d+\s*\/\s*\d+/.test(txt)) {
                  patchTextInElement(el);
                }
              }
              const bars = card.querySelectorAll('[role="progressbar"], div[style*="width"], span[style*="width"], [class*="bg-cyan" i], [class*="bg-teal" i], [class*="bg-emerald" i]');
              for (const bar of bars) {
                if (isExcluded(bar)) continue;
                bar.style.width = `${pct}%`;
                if (bar.hasAttribute("aria-valuenow")) bar.setAttribute("aria-valuenow", String(safeCurrent));
                if (bar.hasAttribute("aria-valuemax")) bar.setAttribute("aria-valuemax", String(safeMax));
              }
              if (bars.length > 0) break;
            }
            card = card.parentElement;
            depth++;
          }
        }
      }
      const navCandidates = document.querySelectorAll('header, nav, footer, [role="banner"], [class*="nav" i], [class*="header" i], [class*="topbar" i], [class*="navbar" i], [class*="bottom" i]');
      for (const container of navCandidates) {
        if (isExcluded(container)) continue;
        const els = container.querySelectorAll("*");
        for (const el of els) {
          if (isExcluded(el)) continue;
          const txt = (el.textContent || "").trim();
          if (txt.includes("/") && txt.length <= 30 && /\d+\s*\/\s*\d+/.test(txt)) {
            patchTextInElement(el);
          }
        }
      }
      const buttons = document.querySelectorAll("button");
      for (const btn of buttons) {
        if (isExcluded(btn)) continue;
        const btnText = (btn.textContent || "").trim();
        if (/KERJAKAN\s+SATU\s+GILIRAN/i.test(btnText)) {
          const walker = document.createTreeWalker(btn, NodeFilter.SHOW_TEXT);
          let node;
          while (node = walker.nextNode()) {
            const val = node.nodeValue || "";
            if (/⚡?\s*\d+/.test(val)) {
              node.nodeValue = val.replace(/(⚡?\s*)(\d+)/, `$1${safeCurrent}`);
            }
          }
          if (safeCurrent < 10) {
            btn.style.opacity = "0.55";
            btn.style.filter = "grayscale(0.6)";
            btn.title = `Energi saat ini ${safeCurrent}/${safeMax} EN (butuh minimal 10 EN untuk giliran kerja)`;
          } else {
            btn.style.opacity = "1";
            btn.style.filter = "none";
            btn.title = "";
          }
        }
      }
    } catch {
    }
  }
  let toastTimer = null;
  function showInPageNotification(title, message) {
    if (!document.body) return;
    let toast = document.getElementById("aw-notification-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "aw-notification-toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      toast.style.cssText = [
        "position:fixed",
        "top:16px",
        "right:16px",
        "z-index:100010",
        "display:none",
        "width:min(360px,calc(100vw - 32px))",
        "padding:12px 14px",
        "background:rgba(10,10,20,.97)",
        "border:1px solid #00aaff",
        "border-left:4px solid #00e99a",
        "border-radius:6px",
        "box-shadow:0 6px 24px rgba(0,0,0,.55)",
        "color:#eee",
        "font:12px/1.45 Segoe UI,Tahoma,sans-serif",
        "pointer-events:none"
      ].join(";");
      document.body.appendChild(toast);
    }
    const heading = document.createElement("div");
    heading.textContent = title;
    heading.style.cssText = "font-weight:700;color:#00e99a;margin-bottom:3px;";
    const detail = document.createElement("div");
    detail.textContent = message;
    detail.style.color = "#ddd";
    toast.replaceChildren(heading, detail);
    toast.style.display = "block";
    if (toastTimer !== null) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.style.display = "none";
      toastTimer = null;
    }, 6e3);
  }
  function sendNotification(arg1, arg2, arg3) {
    let CONFIG = null, title = "", message = "";
    if (typeof arg1 === "object" && arg1 !== null) {
      CONFIG = arg1;
      title = typeof arg2 === "string" ? arg2 : String(arg2 || "");
      message = typeof arg3 === "string" ? arg3 : String(arg3 || "");
    } else {
      title = typeof arg1 === "string" ? arg1 : String(arg1 || "");
      message = typeof arg2 === "string" ? arg2 : String(arg2 || "");
    }
    if (CONFIG && !CONFIG.sendNotification) return;
    showInPageNotification(title, message);
    try {
      const isCritical = /expired|401|habis|kadaluarsa|dijeda|login/i.test(`${title} ${message}`);
      chrome.runtime.sendMessage({
        type: "NOTIFY",
        title,
        message,
        priority: isCritical ? 2 : 1,
        requireInteraction: isCritical
      });
    } catch {
    }
  }
  function playNotificationSound(arg1, arg2) {
    let CONFIG = null, type = "success";
    if (typeof arg1 === "object" && arg1 !== null) {
      CONFIG = arg1;
      type = typeof arg2 === "string" ? arg2 : "success";
    } else if (typeof arg1 === "string") {
      type = arg1;
      if (typeof arg2 === "object" && arg2 !== null) {
        CONFIG = arg2;
      }
    }
    if (CONFIG && !CONFIG.soundNotificationEnabled) return;
    if (typeof document !== "undefined" && document.hidden) return;
    const volume = CONFIG?.soundNotificationVolume != null ? CONFIG.soundNotificationVolume : 0.3;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    let ctx = null;
    try {
      ctx = new AudioCtx();
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {
        });
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.value = volume;
      if (type === "success") {
        osc.frequency.value = 800;
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
        setTimeout(() => {
          try {
            const o2 = ctx.createOscillator(), g2 = ctx.createGain();
            o2.connect(g2);
            g2.connect(ctx.destination);
            g2.gain.value = volume;
            o2.frequency.value = 1e3;
            o2.start();
            o2.stop(ctx.currentTime + 0.1);
            setTimeout(() => ctx.close().catch(() => {
            }), 150);
          } catch {
            try {
              ctx.close().catch(() => {
              });
            } catch {
            }
          }
        }, 100);
      } else {
        osc.frequency.value = 200;
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
        setTimeout(() => ctx.close().catch(() => {
        }), 400);
      }
    } catch {
      try {
        ctx?.close().catch(() => {
        });
      } catch {
      }
    }
  }
  function playEnergyFullAlarm(CONFIG = null) {
    if (CONFIG && !CONFIG.energyFullAlertSoundEnabled) return;
    if (typeof document !== "undefined" && document.hidden) return;
    const volume = CONFIG?.energyFullAlertVolume != null ? CONFIG.energyFullAlertVolume : 0.3;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    let ctx = null;
    try {
      ctx = new AudioCtx();
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {
        });
      }
      const start = ctx.currentTime;
      [660, 880, 1100].forEach((freq, i) => {
        const osc = ctx.createOscillator(), g = ctx.createGain();
        const t = start + i * 0.18;
        osc.type = "sine";
        osc.frequency.value = freq;
        g.gain.value = volume;
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.13);
      });
      setTimeout(() => ctx.close().catch(() => {
      }), 800);
    } catch {
      try {
        ctx?.close().catch(() => {
        });
      } catch {
      }
    }
  }
  function getSavedCredentials() {
    const raw = getValue("aw_login_creds", null);
    if (!raw) return null;
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed.email === "string" && typeof parsed.password === "string") {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }
  function saveCredentials(email, password) {
    const creds = {
      email: email.trim(),
      password,
      savedAt: Date.now()
    };
    setValue("aw_login_creds", JSON.stringify(creds));
    return creds;
  }
  function clearCredentials() {
    setValue("aw_login_creds", "");
  }
  function setReactInputValue(input, value) {
    if (!input) return;
    try {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(input, value);
      } else {
        input.value = value;
      }
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    } catch (e) {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  function setupLoginCapture(logFn) {
    if (!/^\/(login|register|signup)/i.test(window.location.pathname)) return;
    function handleCapture() {
      try {
        const inputs = Array.from(document.querySelectorAll("input")).filter(
          (el) => !el.closest("#aw-panel, #aw-settings-modal, #aw-log-modal, #aw-analytics-modal")
        );
        const emailInput = inputs.find((el) => el.type === "email" || /email|username/i.test(el.name || el.placeholder || "")) || inputs.find((el) => el.type === "text" && /@/i.test(el.placeholder || ""));
        const passInput = inputs.find((el) => el.type === "password");
        if (emailInput?.value && passInput?.value) {
          saveCredentials(emailInput.value, passInput.value);
          console.log("[Auto Worker] Kredensial login berhasil disimpan otomatis untuk Auto Re-Login.");
          logFn?.("Kredensial login berhasil diperbarui otomatis.", "info");
        }
      } catch {
      }
    }
    document.addEventListener("submit", handleCapture, true);
    document.addEventListener("click", (e) => {
      try {
        const btn = e.target?.closest?.("button");
        if (btn && /masuk|login|sign in|enter/i.test(btn.textContent || "")) {
          handleCapture();
        }
      } catch {
      }
    }, true);
  }
  function waitForLoginInputs(timeoutMs = 12e3) {
    return new Promise((resolve) => {
      const find = () => {
        const inputs = Array.from(document.querySelectorAll("input")).filter(
          (el) => !el.closest("#aw-panel, #aw-settings-modal, #aw-log-modal, #aw-analytics-modal")
        );
        const emailInput = inputs.find((el) => el.type === "email" || /email|username/i.test(el.name || el.placeholder || "")) || inputs.find((el) => el.type === "text" && /@/i.test(el.placeholder || ""));
        const passInput = inputs.find((el) => el.type === "password");
        const buttons = Array.from(document.querySelectorAll("button")).filter(
          (el) => !el.closest("#aw-panel, #aw-settings-modal, #aw-log-modal, #aw-analytics-modal")
        );
        const submitBtn = buttons.find((b) => /masuk|login|sign in|enter/i.test(b.textContent || "")) || document.querySelector('button[type="submit"]') || buttons.find((b) => b.offsetWidth > 100);
        if (emailInput && passInput && submitBtn) {
          return { emailInput, passInput, submitBtn };
        }
        return null;
      };
      const immediate = find();
      if (immediate) return resolve(immediate);
      const start = Date.now();
      const interval = setInterval(() => {
        const found = find();
        if (found) {
          clearInterval(interval);
          resolve(found);
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(interval);
          resolve(null);
        }
      }, 350);
    });
  }
  async function tryAutoLogin(CONFIG, logFn, sendNotificationFn) {
    if (!/^\/login/i.test(window.location.pathname)) {
      try {
        sessionStorage.removeItem("aw_login_attempts");
      } catch {
      }
      return false;
    }
    if (!CONFIG?.autoReloginEnabled) return false;
    const creds = getSavedCredentials();
    if (!creds?.email || !creds?.password) {
      console.log("[Auto Worker] Auto Re-Login aktif tetapi belum ada email & kata sandi tersimpan.");
      logFn?.("Auto Re-Login aktif tetapi belum ada email & kata sandi tersimpan. Silakan isi di Settings atau login manual.", "info");
      return false;
    }
    let attempts = 0;
    try {
      attempts = parseInt(sessionStorage.getItem("aw_login_attempts") || "0", 10);
    } catch {
    }
    if (attempts >= 2) {
      console.warn("[Auto Worker] Auto Re-Login dihentikan sementara: telah mencoba 2x.");
      logFn?.("Auto Re-Login dihentikan sementara: telah mencoba 2x. Silakan login manual untuk verifikasi akun.", "error");
      sendNotificationFn?.(CONFIG, "Auto Re-Login Dihentikan", "Mencapai batas 2x percobaan. Silakan periksa akun.");
      return false;
    }
    console.log("[Auto Worker] Halaman login terdeteksi. Mempersiapkan Auto Re-Login...");
    logFn?.("Halaman login terdeteksi. Memulai Auto Re-Login dalam 1.5 detik...", "info");
    await new Promise((r) => setTimeout(r, 1200));
    const elements = await waitForLoginInputs(1e4);
    if (!elements) {
      console.warn("[Auto Worker] Elemen form login tidak ditemukan dalam 10 detik.");
      logFn?.("Elemen form login tidak ditemukan dalam 10 detik.", "warn");
      return false;
    }
    const { emailInput, passInput, submitBtn } = elements;
    try {
      sessionStorage.setItem("aw_login_attempts", (attempts + 1).toString());
    } catch {
    }
    await new Promise((r) => setTimeout(r, 600));
    setReactInputValue(emailInput, creds.email);
    await new Promise((r) => setTimeout(r, 450));
    setReactInputValue(passInput, creds.password);
    await new Promise((r) => setTimeout(r, 600));
    console.log(`[Auto Worker] Mengirim login otomatis untuk ${creds.email}...`);
    logFn?.(`Mengirim login otomatis untuk ${creds.email}...`, "info");
    sendNotificationFn?.(CONFIG, "Auto Re-Login", `Mencoba masuk otomatis sebagai ${creds.email}...`);
    submitBtn.click();
    return true;
  }
  async function doWork(ctx, manual = false) {
    const { state, CONFIG, workHistory, log: log2, setRunningUI: setRunningUI2, sendNotification: sendNotification2, playNotificationSound: playNotificationSound2, updatePanel: updatePanel2, wakePendingWork } = ctx;
    if (!manual && state.tabLockManaged && !state.isTabLockOwner) return "standby";
    if (state.workResultUncertain) {
      log2("Hasil request kerja sebelumnya belum pasti. Muat ulang halaman untuk sinkronisasi sebelum mencoba lagi.", "error");
      return "paused";
    }
    if (state.workInFlight) {
      if (Date.now() - (state.workInFlightAt || 0) > 15e3) {
        state.workInFlight = false;
      } else {
        return "busy";
      }
    }
    if (!state.running && !manual) return "paused";
    if (manual) {
      log2("Menjalankan shift kerja manual...", "info");
    }
    const energy = getSyncedEnergy(state);
    if (!energy) {
      log2("Gagal membaca energi dari halaman. Mencoba lagi dalam 5 detik.", "warn");
      state.nextWorkTimestamp = Date.now() + 5e3;
      return "retrySoon";
    }
    state.currentEnergy = energy.current;
    state.maxEnergy = energy.max;
    if (!manual && isSleepTime(CONFIG)) {
      const msUntilWake = getMsUntilSleepEnd(CONFIG);
      const wakeHour = String(CONFIG.sleepEndHour ?? 6).padStart(2, "0") + ":00";
      log2(`Jam istirahat aktif (${CONFIG.sleepStartHour ?? 1}:00 - ${CONFIG.sleepEndHour ?? 6}:00 WIB). Auto Worker istirahat sampai pukul ${wakeHour}...`, "info");
      state.nextWorkTimestamp = Date.now() + msUntilWake;
      updatePanel2();
      return "waiting";
    }
    if (state.currentEnergy < 10 && manual) {
      log2(`Energi saat ini (${state.currentEnergy}/${state.maxEnergy} EN) belum cukup! Butuh minimal 10 EN untuk giliran kerja.`, "warn");
      return "waiting";
    }
    if (state.currentEnergy < CONFIG.energyThreshold && !manual) {
      log2(`Energi belum cukup (${state.currentEnergy}/${CONFIG.energyThreshold})`, "warn");
      state.nextWorkTimestamp = Date.now() + getNextWorkDelay(state, CONFIG);
      return "waiting";
    }
    const energyBefore = getCurrentEnergy$1() || energy;
    const domBtn = _getDomWorkButton();
    if (domBtn && _isButtonUsable(domBtn)) {
      state.workTriggeredViaDom = true;
      state.workInFlight = true;
      state.workInFlightAt = Date.now();
      const workCompletionPromise = new Promise((resolve) => {
        const onMsg = (event) => {
          if (event?.data?.source === "PARLAMENTUM_INTERCEPTOR") {
            if (event.data.type === "WORK_SUCCESS" || event.data.type === "WORK_REJECTED") {
              window.removeEventListener("message", onMsg);
              resolve(event.data);
            }
          }
        };
        window.addEventListener("message", onMsg);
        setTimeout(() => {
          window.removeEventListener("message", onMsg);
          resolve(null);
        }, 6e3);
      });
      _triggerDomWorkClick(domBtn);
      if (manual) {
        log2("Shift kerja manual dikirim via tombol game...", "info");
      }
      await workCompletionPromise;
      state.workInFlight = false;
      state.workTriggeredViaDom = false;
      state.nextWorkTimestamp = Date.now() + getNextWorkDelay(state, CONFIG);
      updatePanel2?.();
      return "worked";
    }
    state.workTriggeredViaDom = false;
    state.workInFlight = true;
    state.workInFlightAt = Date.now();
    let timeoutId = null;
    try {
      if (!state.currentToken) {
        getTokenFromStorage(state, (raw, src) => {
          return ctx.handleNewToken(raw, src);
        });
        if (!state.currentToken) {
          log2("Token tidak ditemukan! Pastikan sudah login di akun Parlementum.", "error");
          return "retry";
        }
      }
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 15e3);
      const response = await fetch("https://parlamentum.org/api/player/work", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": state.currentToken,
          "Accept": "*/*"
        },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({})
      });
      if (response.ok) {
        return _handleSuccess(ctx, response, energy, energyBefore);
      } else if (response.status === 401) {
        return _handleUnauthorized(ctx);
      } else if (response.status === 400 || response.status === 422) {
        return _handleRejected(ctx, response);
      } else if (response.status === 404 || response.status === 405) {
        const clicked = _clickDomWorkButton();
        if (clicked) {
          log2("Endpoint API tidak merespon (HTTP 404), mengeksekusi klik tombol kerja di halaman...", "info");
          return "worked";
        }
        log2(`Error HTTP: ${response.status}`, "error");
        return "retry";
      } else {
        log2(`Error HTTP: ${response.status}`, "error");
        return "retry";
      }
    } catch (error) {
      if (error.name === "AbortError") {
        return _handleTimeout(ctx, energyBefore);
      }
      console.error("[doWork] Error:", error);
      const clicked = _clickDomWorkButton();
      if (clicked) {
        log2("Mengeksekusi klik tombol kerja di halaman (fallback)...", "info");
        return "worked";
      }
      log2(`Gagal koneksi: ${error.message}`, "error");
      return "retry";
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
      state.workInFlight = false;
    }
  }
  function _getDomWorkButton() {
    if (typeof document === "undefined") return null;
    const testIdBtn = document.querySelector('button[data-testid="work"], button[data-tutorial-target="work"]');
    if (testIdBtn) return testIdBtn;
    const buttons = document.querySelectorAll("button");
    for (const btn of buttons) {
      const txt = (btn.textContent || "").trim();
      if (/KERJAKAN\s+SATU\s+GILIRAN/i.test(txt)) {
        return btn;
      }
    }
    const candidates = document.querySelectorAll('button, [role="button"]');
    for (const el of candidates) {
      const label = (el.getAttribute("aria-label") || el.getAttribute("title") || "").trim();
      if (/KERJAKAN\s+SATU\s+GILIRAN/i.test(label)) {
        return el;
      }
    }
    return null;
  }
  function _isButtonUsable(btn) {
    if (!btn) return false;
    if (btn.disabled) return false;
    if (btn.getAttribute("aria-disabled") === "true") return false;
    if (btn.classList.contains("disabled")) return false;
    if (btn.style.pointerEvents === "none") return false;
    return true;
  }
  function _triggerDomWorkClick(btn) {
    if (!btn) return false;
    try {
      btn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      btn.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      btn.click();
      return true;
    } catch {
      btn.click();
      return true;
    }
  }
  function _clickDomWorkButton() {
    const btn = _getDomWorkButton();
    if (btn && _isButtonUsable(btn)) {
      return _triggerDomWorkClick(btn);
    }
    return false;
  }
  async function _handleSuccess(ctx, response, energy, energyBefore) {
    const { state, CONFIG, workHistory, log: log2, sendNotification: sendNotification2, playNotificationSound: playNotificationSound2, updatePanel: updatePanel2, wakePendingWork } = ctx;
    let data = null;
    try {
      data = await response.json();
    } catch (e) {
      if (e.name === "AbortError") throw e;
      log2("Respons kerja sukses, tetapi data tidak terbaca; memakai nilai fallback.", "warn");
    }
    const parsedEnergyUsed = data?.energyUsed != null ? Number(data.energyUsed) : NaN;
    const isReportedZeroEnergy = Number.isSafeInteger(parsedEnergyUsed) && parsedEnergyUsed === 0;
    const hasReportedEnergy = Number.isSafeInteger(parsedEnergyUsed) && parsedEnergyUsed >= 10 && parsedEnergyUsed <= 350;
    const parsedXp = data?.xpEarned != null ? Number(data.xpEarned) : NaN;
    const isReportedZeroXp = Number.isSafeInteger(parsedXp) && parsedXp === 0;
    if (isReportedZeroEnergy || isReportedZeroXp || data?.error || typeof data?.message === "string" && /energy|unit/i.test(data.message)) {
      const fresh = getCurrentEnergy$1();
      if (fresh) {
        state.currentEnergy = fresh.current;
        state.maxEnergy = fresh.max;
        state.energySyncBase = { current: fresh.current, max: fresh.max, updatedAt: Date.now() };
      } else {
        state.currentEnergy = 0;
        state.energySyncBase = { current: 0, max: state.maxEnergy || 115, updatedAt: Date.now() };
      }
      const waitMs = Math.max(10 * 6e4, getNextWorkDelay(state, CONFIG));
      log2(`Shift selesai tapi menghasilkan 0 XP (energi game saat ini: ${state.currentEnergy}/${state.maxEnergy} EN). Menunggu energi pulih...`, "warn");
      state.nextWorkTimestamp = Date.now() + waitMs;
      updatePanel2();
      return "waiting";
    }
    const startingEnergy = energyBefore && typeof energyBefore.current === "number" ? energyBefore.current : energy && typeof energy.current === "number" ? energy.current : state.currentEnergy || 0;
    const available = Math.floor(startingEnergy / 10) * 10;
    const energySpent = hasReportedEnergy ? parsedEnergyUsed : available > 0 ? available : 10;
    const calculatedXp = Math.max(4, Math.floor(energySpent / 10) * 4);
    const xpGained = Number.isSafeInteger(parsedXp) && parsedXp > 0 ? parsedXp : calculatedXp;
    const units = Number(data?.workerUnits) || Number(data?.produced) || 0;
    if (xpGained <= 0) {
      log2(`Shift tidak menghasilkan XP. Energi saat ini: ${state.currentEnergy}/${state.maxEnergy} EN.`, "warn");
      updatePanel2();
      return "waiting";
    }
    state.totalWorked++;
    state.workToday++;
    state.totalWorkXP += xpGained;
    state.xpToday += xpGained;
    state.totalEnergySpent += energySpent;
    state.totalActualEnergySpent += hasReportedEnergy ? parsedEnergyUsed : 0;
    state.totalEstimatedEnergySpent += hasReportedEnergy ? 0 : energySpent;
    state.lastWorkTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("id-ID");
    const todayKey = (/* @__PURE__ */ new Date()).toDateString();
    let history2 = workHistory || ctx?.workHistory;
    if (typeof history2 === "string") {
      try {
        history2 = JSON.parse(history2);
      } catch {
        history2 = {};
      }
    }
    if (!history2 || typeof history2 !== "object") history2 = {};
    if (!history2[todayKey]) history2[todayKey] = { shifts: 0, xp: 0 };
    const today = history2[todayKey];
    today.shifts = (today.shifts || 0) + 1;
    today.xp = (today.xp || 0) + xpGained;
    today.energySpent = (today.energySpent || 0) + (hasReportedEnergy ? energySpent : 0);
    today.estimatedEnergySpent = (today.estimatedEnergySpent || 0) + (hasReportedEnergy ? 0 : energySpent);
    today.energyDataShifts = (today.energyDataShifts || 0) + (hasReportedEnergy ? 1 : 0);
    saveWorkHistory(history2);
    if (ctx) ctx.workHistory = history2;
    if (data?.energy != null && typeof data.energy === "number") {
      state.currentEnergy = Math.max(0, Math.round(data.energy));
    } else {
      state.currentEnergy = Math.max(0, startingEnergy - energySpent);
    }
    state.energySyncBase = { current: state.currentEnergy, max: state.maxEnergy, updatedAt: Date.now() };
    state.lastWorkTimestamp = Date.now();
    state.domEnergyStale = true;
    patchPageVisualEnergy(state.currentEnergy, state.maxEnergy, true);
    try {
      window.dispatchEvent(new Event("focus"));
    } catch {
    }
    setTimeout(() => {
      const fresh = getCurrentEnergy$1();
      if (fresh) {
        state.currentEnergy = fresh.current;
        state.maxEnergy = fresh.max;
        state.energySyncBase = { current: fresh.current, max: fresh.max, updatedAt: Date.now() };
        state.domEnergyStale = false;
        updatePanel2?.();
      }
    }, 600);
    saveState(state);
    const unitsPart = units > 0 ? ` | +${units} unit` : "";
    log2(`Kerja sukses! +${xpGained} XP${unitsPart} | Sisa: ${state.currentEnergy}/${state.maxEnergy} EN`, "success");
    playNotificationSound2(CONFIG, "success");
    sendNotification2(CONFIG, "Parlamentum", `Kerja sukses! +${xpGained} XP${unitsPart}`);
    state.nextWorkTimestamp = Date.now() + getNextWorkDelay(state, CONFIG);
    updatePanel2();
    wakePendingWork?.();
    return "worked";
  }
  function _handleUnauthorized(ctx) {
    const { state, CONFIG, log: log2, setRunningUI: setRunningUI2, sendNotification: sendNotification2, playNotificationSound: playNotificationSound2, updatePanel: updatePanel2 } = ctx;
    log2("Sesi token kedaluwarsa (401). Me-reload tab game dalam 2 detik untuk memperbarui token...", "warn");
    state.pausedForToken = true;
    setTimeout(() => {
      window.location.reload();
    }, 2e3);
    return "paused";
  }
  async function _handleRejected(ctx, response) {
    const { state, CONFIG, log: log2, setRunningUI: setRunningUI2, sendNotification: sendNotification2, updatePanel: updatePanel2 } = ctx;
    const errorText = await response.text();
    let serverMessage = "";
    try {
      const parsed = JSON.parse(errorText);
      if (typeof parsed === "string") serverMessage = parsed;
      else if (parsed && typeof parsed === "object") {
        serverMessage = [parsed.message, parsed.error, parsed.detail, parsed.reason].find((v) => typeof v === "string") || "";
      }
    } catch {
    }
    if (!serverMessage) serverMessage = errorText.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    serverMessage = serverMessage.slice(0, 240);
    const combined = `${errorText} ${serverMessage}`;
    if (/wallet|wage/i.test(combined)) {
      log2("Majikan Kehabisan Saldo! Kas perusahaan tidak cukup untuk membayar upah. Script dijeda.", "error");
      state.running = false;
      setRunningUI2(false);
      sendNotification2(CONFIG, "Parlamentum", "Kas majikan habis! Pindah lowongan di Job Board.");
      return "paused";
    }
    if (/region|wilayah|transit|travel|penerbangan/i.test(combined)) {
      log2(`${serverMessage || "Anda harus berada di wilayah perusahaan untuk bekerja (sedang dalam perjalanan)"}. Menunggu 3 menit...`, "warn");
      state.nextWorkTimestamp = Date.now() + 3 * 6e4;
      updatePanel2();
      return "waiting";
    }
    const isEnergyError = /(insufficient[_ ]energy|not enough energy|energi.{0,40}(?:tidak|belum|kurang)|produce even one unit)/i.test(combined);
    if (isEnergyError) {
      const curEnergy = Math.max(0, Number(state.currentEnergy) || 0);
      const needed = Math.max(1, (CONFIG.energyThreshold || 90) - curEnergy);
      const rate = state.regenRate || 1;
      const waitMs = Math.max(6e4, Math.round(needed / rate * 6e4));
      const waitMins = Math.round(waitMs / 6e4);
      log2(`Server menolak kerja (HTTP ${response.status}): ${serverMessage || "Energi di server belum cukup"}. Menunggu target ${CONFIG.energyThreshold} EN (~${waitMins} mnt)...`, "warn");
      state.nextWorkTimestamp = Date.now() + waitMs;
      saveState(state);
      saveLiveStatus(state, CONFIG, true);
      updatePanel2();
      return "waiting";
    }
    log2(`Server menolak kerja (HTTP ${response.status})${serverMessage ? `: ${serverMessage}` : ""}`, "error");
    state.running = false;
    setRunningUI2(false);
    saveState(state);
    saveLiveStatus(state, CONFIG, true);
    updatePanel2();
    sendNotification2(CONFIG, "Parlamentum Auto Worker dijeda", serverMessage || `Server menolak (HTTP ${response.status}).`);
    return "paused";
  }
  function _handleTimeout(ctx, energyBefore) {
    const { state, log: log2, setRunningUI: setRunningUI2, updatePanel: updatePanel2, setValue: setValue2 } = ctx;
    state.workResultUncertain = true;
    state.uncertainReconciliation = "pending";
    ctx.uncertainEnergyBefore = energyBefore;
    setValue2("aw_workResultUncertain", "true");
    setValue2("aw_uncertainEnergyBefore", JSON.stringify(energyBefore));
    state.running = false;
    setRunningUI2(false);
    log2("Request kerja timeout (15 detik). Hasil belum pasti; script dijeda. Muat ulang halaman setelah memeriksa status kerja.", "error");
    ctx.reconcileUncertainWork?.();
    updatePanel2();
    return "uncertain";
  }
  const ICONS = {
    minimize: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`,
    expand: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>`,
    lockOpen: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`,
    lockClosed: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`,
    settings: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 4.6a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
    close: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    robot: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line></svg>`,
    play: `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`,
    pause: `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`,
    zap: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`,
    mapPin: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`,
    shield: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`,
    key: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-1.5 1.5L14 9l-1.5-1.5-3 3 1.5 1.5L9 14l-1.5-1.5-3 3 1.5 1.5L3 20l1 1 5-5-1.5-1.5 2-2 1.5 1.5 3-3-1.5-1.5 3.5-3.5a5 5 0 1 0-7-7z"></path></svg>`,
    fileText: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`,
    clock: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
    search: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
    trash: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
    copy: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`,
    bell: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>`,
    monitor: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`,
    check: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    alert: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`
  };
  const HEADER_BTN_STYLE = `
    background: transparent; border: none; cursor: pointer; padding: 0;
    border-radius: 6px; display: flex; align-items: center; justify-content: center;
    width: 24px; height: 24px; min-width: 24px; max-width: 24px; flex-shrink: 0 !important;
    transition: all 0.15s ease; color: #8892b0; line-height: 1; box-sizing: border-box;
`;
  function _injectPanelStyles() {
    if (typeof document === "undefined" || document.getElementById("aw-panel-styles")) return;
    const style = document.createElement("style");
    style.id = "aw-panel-styles";
    style.textContent = `
        @keyframes aw-pulse-glow {
            0% {
                box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55), 0 0 10px rgba(0, 255, 136, 0.25);
                border-color: rgba(0, 255, 136, 0.45);
            }
            50% {
                box-shadow: 0 16px 44px rgba(0, 0, 0, 0.65), 0 0 20px rgba(0, 255, 136, 0.65);
                border-color: rgba(0, 255, 136, 0.85);
            }
            100% {
                box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55), 0 0 10px rgba(0, 255, 136, 0.25);
                border-color: rgba(0, 255, 136, 0.45);
            }
        }
        @keyframes aw-pill-pulse-glow {
            0% {
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.65), 0 0 8px rgba(0, 255, 136, 0.3);
                border-color: rgba(0, 255, 136, 0.45);
            }
            50% {
                box-shadow: 0 10px 28px rgba(0, 0, 0, 0.75), 0 0 18px rgba(0, 255, 136, 0.75);
                border-color: rgba(0, 255, 136, 0.9);
            }
            100% {
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.65), 0 0 8px rgba(0, 255, 136, 0.3);
                border-color: rgba(0, 255, 136, 0.45);
            }
        }
        .aw-ready-glow {
            animation: aw-pulse-glow 2.2s infinite ease-in-out !important;
        }
        #aw-pill-container.aw-ready-glow {
            animation: aw-pill-pulse-glow 2.2s infinite ease-in-out !important;
        }
        .aw-btn-action {
            transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1) !important;
            outline: none !important;
            user-select: none !important;
        }
        .aw-btn-action:hover:not(:disabled) {
            filter: brightness(1.15) !important;
            transform: translateY(-1.5px) !important;
        }
        .aw-btn-action:active:not(:disabled) {
            transform: translateY(0.5px) scale(0.97) !important;
            filter: brightness(0.92) !important;
        }
        .aw-header-btn {
            transition: all 0.15s ease !important;
            border-radius: 6px !important;
        }
        .aw-header-btn:hover {
            background: rgba(255, 255, 255, 0.1) !important;
            color: #fff !important;
        }
        .aw-pill-btn {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            cursor: pointer !important;
            outline: none !important;
            transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1) !important;
            user-select: none !important;
            padding: 0 !important;
        }
        .aw-pill-btn:hover:not(:disabled) {
            filter: brightness(1.2) !important;
            transform: scale(1.08) !important;
        }
        .aw-pill-btn:active:not(:disabled) {
            transform: scale(0.94) !important;
        }
        .aw-pill-box:hover {
            border-color: rgba(255, 255, 255, 0.25) !important;
            box-shadow: 0 12px 34px rgba(0, 0, 0, 0.75), 0 0 14px rgba(0, 217, 255, 0.22) !important;
        }
    `;
    document.head.appendChild(style);
  }
  function isDashboardPage() {
    if (typeof window === "undefined") return true;
    const pathname = window.location.pathname || "";
    const cleanPath = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
    return cleanPath === "/dashboard" || cleanPath.startsWith("/dashboard/") || cleanPath === "/" || cleanPath === "";
  }
  function shouldPanelBeVisible(state, CONFIG) {
    if (CONFIG.panelDashboardOnly && !isDashboardPage()) {
      return false;
    }
    if (CONFIG.panelLeaderOnly && state.tabLockManaged && !state.isTabLockOwner) {
      if (typeof document !== "undefined" && document.hidden) {
        return false;
      }
    }
    if (state.panelVisible === false) {
      return false;
    }
    return true;
  }
  function updatePanelVisibility(state, CONFIG) {
    const panel = document.getElementById("aw-panel");
    if (!panel) return;
    const visible = state.userManuallyToggledPanel ? Boolean(state.panelVisible) : shouldPanelBeVisible(state, CONFIG);
    panel.style.display = visible ? "block" : "none";
  }
  function createPanel(state, CONFIG, ctx) {
    const old = document.getElementById("aw-panel");
    if (old) old.remove();
    _injectPanelStyles();
    state.userManuallyToggledPanel = false;
    if (CONFIG.panelDashboardOnly && isDashboardPage()) {
      state.panelVisible = true;
      setValue("panelVisible", "true");
    }
    setTimeout(() => {
      const panel = document.createElement("div");
      panel.id = "aw-panel";
      panel.style.cssText = `
            position: fixed; top: ${state.panelY}px; left: ${state.panelX}px;
            color: #e0e0e0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            font-size: 12px;
            z-index: 99999;
            box-sizing: border-box;
            user-select: none;
            transition: border-color 0.3s ease, box-shadow 0.3s ease;
            overflow: visible;
            display: ${shouldPanelBeVisible(state, CONFIG) ? "block" : "none"};
        `;
      panel.innerHTML = _buildPanelHTML(state, CONFIG);
      document.body.appendChild(panel);
      applyPanelMode(state, Boolean(state.panelMinimized));
      _setupDragAndDrop(panel, state, CONFIG);
      _setupPanelControls(panel, state, CONFIG, ctx);
      _setupResponsiveBehavior(panel, state, CONFIG);
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
          ctx.updatePanel?.();
        }
      });
      ctx.log("Panel v5.11.0 siap!", "success");
    }, 250);
  }
  function updatePanel(state, CONFIG, workHistory, ctx) {
    if (!chrome.runtime?.id) return;
    const { getSyncedEnergy: getSyncedEnergy2, getPlayerLevel: getPlayerLevel2, getMaxEnergyForLevel: getMaxEnergyForLevel2 } = ctx;
    if (!state.userManuallyToggledPanel) {
      updatePanelVisibility(state, CONFIG);
    }
    if (state.tabLockManaged && !state.isTabLockOwner) {
      const now = Date.now();
      if (now - (updatePanel._lastStandby || 0) >= 3e3) {
        ctx.reloadStateFromStorage?.();
        updatePanel._lastStandby = now;
      }
    }
    const energy = ctx.getSyncedEnergy(state);
    if (energy) {
      state.currentEnergy = energy.current;
      state.maxEnergy = energy.max;
      if (state.domEnergyStale) {
        patchPageVisualEnergy(state.currentEnergy, state.maxEnergy);
      }
    }
    if (state.currentEnergy < CONFIG.energyThreshold) {
      const rate = state.regenRate || 1;
      const neededMs = Math.max(1, (CONFIG.energyThreshold - state.currentEnergy) / rate) * 6e4;
      if (!state.nextWorkTimestamp) {
        state.nextWorkTimestamp = Date.now() + neededMs;
      } else if (state.nextWorkTimestamp > Date.now()) {
        const remaining = state.nextWorkTimestamp - Date.now();
        if (Math.abs(remaining - neededMs) > 12e4) {
          state.nextWorkTimestamp = Date.now() + neededMs;
        }
      }
    } else if (state.running && state.isTabLockOwner && !state.workInFlight && !state.workResultUncertain) {
      if (!state.nextWorkTimestamp || Date.now() >= state.nextWorkTimestamp) {
        state.nextWorkTimestamp = Date.now();
        ctx.wakePendingWork?.();
      }
    }
    const newLevel = ctx.getPlayerLevel(state);
    if (newLevel !== state.playerLevel) {
      state.playerLevel = newLevel;
      if (!energy) {
        const max = getMaxEnergyForLevel2(newLevel);
        if (max !== state.maxEnergy) state.maxEnergy = max;
      }
    }
    const energyFull = state.maxEnergy > 0 && state.currentEnergy >= state.maxEnergy;
    if (!energyFull) {
      state.energyFullAlertActive = false;
    } else if (CONFIG.energyFullAlertEnabled && !state.energyFullAlertActive) {
      state.energyFullAlertActive = true;
      if (!state.tabLockManaged || state.isTabLockOwner) {
        ctx.log(`Energi penuh (${state.currentEnergy}/${state.maxEnergy})! Mengeksekusi shift...`, "warn");
        ctx.playEnergyFullAlarm?.(CONFIG);
        ctx.sendNotification?.(CONFIG, "Energi Penuh", `Energi ${state.currentEnergy}/${state.maxEnergy}. Siap bekerja.`);
      }
      if (state.running && state.isTabLockOwner && !state.workInFlight && !state.workResultUncertain) {
        if (!state.nextWorkTimestamp || Date.now() >= state.nextWorkTimestamp) {
          state.nextWorkTimestamp = Date.now();
          ctx.wakePendingWork?.();
        }
      }
    }
    if (ctx.getRegionDetails) {
      const reg = ctx.getRegionDetails();
      if (reg) {
        if (reg.name && reg.name !== state.regionName) {
          state.regionName = reg.name;
        }
        if (reg.bonusPercent !== state.regionHealthBonusPercent) {
          state.regionHealthBonusPercent = reg.bonusPercent;
        }
        if (reg.bonusMultiplier && Math.abs(reg.bonusMultiplier - (state.regenRate || 1)) > 0.01) {
          state.regenRate = reg.bonusMultiplier;
          if (state.currentEnergy < CONFIG.energyThreshold) {
            const neededMs = Math.max(1, (CONFIG.energyThreshold - state.currentEnergy) / state.regenRate) * 6e4;
            state.nextWorkTimestamp = Date.now() + neededMs;
          }
        }
        _patchEl("aw-region-name", (el) => el.textContent = state.regionName || "Wilayah");
        _patchEl("aw-region-buff", (el) => {
          el.textContent = state.regionHealthBonusPercent > 0 ? `+${state.regionHealthBonusPercent}% Regen` : "Normal (1.0x)";
        });
      }
    }
    const isHidden = typeof document !== "undefined" && document.hidden;
    if (CONFIG.ecoModeEnabled !== false && isHidden) {
      if (!state.tabLockManaged || state.isTabLockOwner) {
        saveLiveStatus(state, CONFIG);
      }
      return;
    }
    const threshold = CONFIG.energyThreshold || 10;
    const isReadyToWork = state.currentEnergy >= threshold;
    const panelEl = document.getElementById("aw-panel");
    const pillEl = document.getElementById("aw-pill-container");
    if (panelEl) {
      if (isReadyToWork && state.running && !state.workInFlight) {
        panelEl.classList.add("aw-ready-glow");
        if (pillEl) pillEl.classList.add("aw-ready-glow");
      } else {
        panelEl.classList.remove("aw-ready-glow");
        if (pillEl) pillEl.classList.remove("aw-ready-glow");
      }
    }
    const safeMax = state.maxEnergy && state.maxEnergy > 0 ? state.maxEnergy : 110;
    const energyPct = Math.max(0, Math.min(100, state.currentEnergy / safeMax * 100));
    _patchEl("aw-energy-text", (el) => el.textContent = `${state.currentEnergy}/${state.maxEnergy}`);
    _patchEl("aw-energy-bar", (el) => el.style.width = `${energyPct}%`);
    const liveCountdown = getLiveCountdown(state, CONFIG);
    _patchEl("aw-next-work", (el) => {
      el.textContent = liveCountdown;
      el.style.color = isReadyToWork ? "#00ff88" : "#00d9ff";
    });
    _patchEl("aw-full-energy", (el) => el.textContent = getTimeToFullEnergy(state));
    _patchEl("aw-pill-energy", (el) => el.textContent = `${state.currentEnergy}/${state.maxEnergy}`);
    _patchEl("aw-pill-countdown", (el) => {
      el.textContent = isReadyToWork ? "Siap" : liveCountdown;
      el.style.color = isReadyToWork ? "#00ff88" : "#00d9ff";
    });
    _patchEl("aw-pill-countdown-icon", (el) => {
      el.innerHTML = isReadyToWork ? ICONS.zap : ICONS.clock;
    });
    _patchEl("aw-pill-status-dot", (el) => {
      const dotColor = state.workResultUncertain ? "#ffaa00" : state.running ? "#00ff88" : "#ff4757";
      el.style.background = dotColor;
      el.style.boxShadow = `0 0 8px ${dotColor}`;
    });
    _patchEl("aw-pill-container", (el) => {
      const statusText = state.workResultUncertain ? "Hasil kerja belum pasti" : state.running ? "Sedang Berjalan" : "Dijeda";
      el.title = `Auto Worker: ${statusText}
Energi: ${state.currentEnergy}/${state.maxEnergy}
Giliran: ${liveCountdown}

(Seret untuk geser • Klik 2x untuk perbesar)`;
    });
    _patchEl("aw-next-wrap", (el) => {
      if (isReadyToWork) {
        el.title = "Energi sudah mencapai target. Siap bekerja.";
      } else if (state.nextWorkTimestamp && state.nextWorkTimestamp > Date.now()) {
        const d = new Date(state.nextWorkTimestamp);
        const timeStr = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        el.title = `Estimasi giliran kerja: pk. ${timeStr} WIB`;
      } else {
        el.title = "Menunggu energi pulih...";
      }
    });
    _patchEl("aw-full-wrap", (el) => {
      const needed = (state.maxEnergy || 115) - (state.currentEnergy || 0);
      if (needed <= 0) {
        el.title = "Energi sudah 100% penuh.";
      } else {
        const rate = state.regenRate || 1;
        const fullMs = Math.round(needed / rate * 6e4);
        const d = new Date(Date.now() + fullMs);
        const timeStr = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
        const gameText = getGameEnergyFullText();
        const gameNote = gameText ? ` | Sesuai game: Penuh dalam ${gameText}` : "";
        el.title = `Estimasi energi 100% penuh: pk. ${timeStr} WIB (~${Math.round(needed / rate)} mnt @ ${rate} EN/mnt)${gameNote}`;
      }
    });
    _patchEl("aw-mode-title", (el) => {
      el.textContent = state.running ? "Auto Kerja: AKTIF" : "Auto Kerja: DIJEDA";
      el.style.color = state.running ? "#00ff88" : "#ff7777";
    });
    _patchEl("aw-mode-icon", (el) => {
      el.innerHTML = state.running ? ICONS.zap : ICONS.pause;
      el.style.color = state.running ? "#00ff88" : "#ff7777";
    });
    _patchEl("aw-target-threshold", (el) => {
      el.textContent = String(CONFIG.energyThreshold || 10);
    });
    _patchEl("aw-shift-countdown", (el) => {
      el.textContent = isReadyToWork ? "Siap Kerja" : liveCountdown;
      el.style.color = isReadyToWork ? "#00ff88" : "#00d9ff";
    });
    _patchEl("aw-token-status", (el) => {
      const isExpired = Boolean(
        state.tokenExpired || state.pausedForToken || state.tokenExpiry && Number(state.tokenExpiry) <= Date.now()
      );
      if (isExpired) {
        el.textContent = "EXPIRED";
        el.style.color = "#ff4444";
      } else if (state.currentToken) {
        el.textContent = "VALID";
        el.style.color = "#00ff88";
      } else {
        el.textContent = "NOT FOUND";
        el.style.color = "#ffaa00";
      }
    });
    _patchEl("aw-token-expiry", (el) => el.textContent = getTimeUntilExpiry(state));
    _patchEl("aw-uncertain-banner", (el) => el.style.display = state.workResultUncertain ? "block" : "none");
    _patchEl("aw-reconciliation-status", (el) => {
      el.textContent = state.uncertainReconciliation === "energy_changed" ? "Status rekonsiliasi: perubahan energi terdeteksi; konfirmasi manual tetap diperlukan." : "Status rekonsiliasi: menunggu pembacaan energi.";
    });
    const blocked = state.workResultUncertain || state.tabLockManaged && !state.isTabLockOwner;
    _patchEl("aw-work-now", (el) => el.disabled = blocked);
    _patchEl("aw-toggle", (el) => el.disabled = blocked);
    _patchEl("aw-pill-toggle", (el) => el.disabled = blocked);
    if (!state.tabLockManaged || state.isTabLockOwner || !document.hidden) {
      saveLiveStatus(state, CONFIG);
    }
  }
  function setRunningUI(running) {
    _patchEl("aw-toggle", (el) => {
      el.innerHTML = running ? `<span style="display:inline-flex;align-items:center;justify-content:center;gap:4px;">${ICONS.pause} Jeda</span>` : `<span style="display:inline-flex;align-items:center;justify-content:center;gap:4px;">${ICONS.play} Lanjut</span>`;
      el.style.background = running ? "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)" : "linear-gradient(135deg, #10b981 0%, #059669 100%)";
      el.style.boxShadow = `0 2px 8px ${running ? "rgba(239,68,68,0.3)" : "rgba(16,185,129,0.3)"}`;
    });
    _patchEl("aw-status-dot", (el) => {
      el.style.background = running ? "#00ff88" : "#ff4757";
      el.style.boxShadow = `0 0 8px ${running ? "#00ff88" : "#ff4757"}`;
    });
    _patchEl("aw-pill-toggle", (el) => {
      el.innerHTML = running ? ICONS.pause : ICONS.play;
      el.title = running ? "Jeda Worker" : "Lanjutkan Worker";
      el.style.background = running ? "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)" : "linear-gradient(135deg, #10b981 0%, #059669 100%)";
      el.style.boxShadow = `0 2px 6px ${running ? "rgba(239,68,68,0.35)" : "rgba(16,185,129,0.35)"}`;
    });
    _patchEl("aw-pill-status-dot", (el) => {
      el.style.background = running ? "#00ff88" : "#ff4757";
      el.style.boxShadow = `0 0 8px ${running ? "#00ff88" : "#ff4757"}`;
    });
  }
  function togglePanelVisibility(state, CONFIG) {
    const panel = document.getElementById("aw-panel");
    if (!panel) return;
    const isCurrentlyVisible = panel.style.display !== "none";
    state.panelVisible = !isCurrentlyVisible;
    state.userManuallyToggledPanel = true;
    panel.style.display = state.panelVisible ? "block" : "none";
    setValue("panelVisible", state.panelVisible.toString());
  }
  function _patchEl(id, fn) {
    const el = document.getElementById(id);
    if (el) fn(el);
  }
  function applyPanelMode(state, isMin) {
    state.panelMinimized = Boolean(isMin);
    setValue("panelMinimized", state.panelMinimized.toString());
    const panel = document.getElementById("aw-panel");
    const fullContainer = document.getElementById("aw-full-container");
    const pillContainer = document.getElementById("aw-pill-container");
    const minimizeBtn = document.getElementById("aw-minimize");
    if (!panel) return;
    if (state.panelMinimized) {
      if (fullContainer) fullContainer.style.display = "none";
      if (pillContainer) pillContainer.style.display = "flex";
      panel.style.width = "auto";
      panel.style.minWidth = "0";
      panel.style.maxWidth = "none";
      panel.style.background = "transparent";
      panel.style.backdropFilter = "none";
      panel.style.webkitBackdropFilter = "none";
      panel.style.border = "none";
      panel.style.boxShadow = "none";
      panel.style.borderRadius = "999px";
      panel.style.padding = "0";
      panel.style.overflow = "visible";
      if (minimizeBtn) {
        minimizeBtn.innerHTML = ICONS.expand;
        minimizeBtn.title = "Perbesar Panel";
      }
    } else {
      const maxX = window.innerWidth - 305;
      if (state.panelX > maxX && maxX > 0) {
        state.panelX = Math.max(10, maxX);
        panel.style.left = state.panelX + "px";
        setValue("panelX", state.panelX.toString());
      }
      if (fullContainer) fullContainer.style.display = "block";
      if (pillContainer) pillContainer.style.display = "none";
      panel.style.width = "285px";
      panel.style.minWidth = "285px";
      panel.style.maxWidth = "295px";
      panel.style.background = "rgba(18, 22, 34, 0.92)";
      panel.style.backdropFilter = "blur(14px)";
      panel.style.webkitBackdropFilter = "blur(14px)";
      panel.style.border = "1px solid rgba(255, 255, 255, 0.08)";
      panel.style.borderRadius = "12px";
      panel.style.boxShadow = "0 16px 40px rgba(0, 0, 0, 0.55), 0 0 1px rgba(255, 255, 255, 0.15)";
      panel.style.padding = "0";
      panel.style.overflow = "visible";
      if (minimizeBtn) {
        minimizeBtn.innerHTML = ICONS.minimize;
        minimizeBtn.title = "Mode Ringkas (Pill)";
      }
    }
  }
  function _buildPanelHTML(state, CONFIG) {
    const isMin = Boolean(state.panelMinimized);
    const isPinned = CONFIG.panelPinned;
    const running = state.running;
    return `
        <!-- Full Panel View -->
        <div id="aw-full-container" style="display: ${isMin ? "none" : "block"}; width: 100%;">
            <div id="aw-header" style="
                background: linear-gradient(135deg, rgba(26, 32, 53, 0.98) 0%, rgba(18, 22, 34, 0.98) 100%);
                padding: 10px 12px; cursor: ${isPinned ? "default" : "move"};
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                display: flex; justify-content: space-between; align-items: center;
                border-radius: 12px 12px 0 0;
                gap: 8px; box-sizing: border-box; width: 100%;
            ">
                <div style="display:flex;align-items:center;gap:7px;flex-shrink:0;min-width:0;">
                    <span style="color:#38bdf8;display:flex;align-items:center;flex-shrink:0;">${ICONS.robot}</span>
                    <span style="font-weight:700;color:#fff;font-size:12px;letter-spacing:0.5px;text-transform:uppercase;white-space:nowrap;">Auto Worker</span>
                    <span id="aw-status-dot" style="
                        width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0;
                        background:${running ? "#00ff88" : "#ff4757"};
                        box-shadow:0 0 8px ${running ? "#00ff88" : "#ff4757"};
                    "></span>
                </div>
                <div style="display:flex;align-items:center;gap:2px;flex-shrink:0;">
                    <button id="aw-minimize"  class="aw-header-btn" title="Mode Ringkas (Pill)" style="${HEADER_BTN_STYLE}">${ICONS.minimize}</button>
                    <button id="aw-pin"       class="aw-header-btn" title="${isPinned ? "Unpin" : "Pin"}" style="${HEADER_BTN_STYLE} background:${isPinned ? "rgba(0, 136, 255, 0.2)" : "transparent"};color:${isPinned ? "#00d9ff" : "#8892b0"};border:${isPinned ? "1px solid rgba(0, 136, 255, 0.4)" : "none"};">${isPinned ? ICONS.lockClosed : ICONS.lockOpen}</button>
                    <button id="aw-settings"  class="aw-header-btn" title="Pengaturan" style="${HEADER_BTN_STYLE}">${ICONS.settings}</button>
                    <button id="aw-hide"      class="aw-header-btn" title="Sembunyikan (${CONFIG.shortcuts.showHide.display})" style="${HEADER_BTN_STYLE}color:#ff5252;margin-left:2px;">${ICONS.close}</button>
                </div>
            </div>
            <div id="aw-body" style="padding: 12px; display: block;">
                <div id="aw-uncertain-banner" style="display:${state.workResultUncertain ? "block" : "none"};margin-bottom:10px;padding:9px;background:rgba(255,68,68,0.12);border:1px solid rgba(255,68,68,0.55);border-radius:6px;color:#ffb3b3;font-size:11px;line-height:1.4;">
                    <div style="display:flex;align-items:center;gap:6px;font-weight:700;color:#ff7777;margin-bottom:4px;">
                        <span style="display:flex;align-items:center;">${ICONS.alert}</span> Hasil kerja belum pasti
                    </div>
                    <div>Periksa halaman game sebelum melanjutkan.</div>
                    <div id="aw-reconciliation-status" style="margin-top:4px;color:#ffd166;">Status rekonsiliasi: menunggu pembacaan energi.</div>
                    <button id="aw-confirm-uncertain" style="margin-top:7px;padding:5px 8px;background:#8f3030;color:#fff;border:1px solid #b44;border-radius:4px;cursor:pointer;font-size:10px;">Saya sudah memeriksa, lanjutkan</button>
                </div>

                <!-- Region & Buff Badge -->
                <div id="aw-region-badge" style="
                    display: flex; align-items: center; justify-content: space-between;
                    background: linear-gradient(135deg, rgba(56, 189, 248, 0.08) 0%, rgba(16, 185, 129, 0.05) 100%);
                    border: 1px solid rgba(56, 189, 248, 0.2);
                    border-radius: 8px;
                    padding: 6px 10px;
                    margin-bottom: 9px;
                    font-size: 11px;
                ">
                    <div style="display:flex;align-items:center;gap:6px;overflow:hidden;">
                        <span style="color:#38bdf8;display:flex;align-items:center;">${ICONS.mapPin}</span>
                        <span id="aw-region-name" style="font-weight:600;color:#f1f5f9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:130px;">${state.regionName || "Memuat wilayah..."}</span>
                    </div>
                    <span id="aw-region-buff" style="
                        background: rgba(16, 185, 129, 0.14);
                        color: #10b981;
                        border: 1px solid rgba(16, 185, 129, 0.3);
                        padding: 1px 7px;
                        border-radius: 4px;
                        font-weight: 700;
                        font-size: 9.5px;
                        white-space: nowrap;
                    ">${state.regionHealthBonusPercent ? `+${state.regionHealthBonusPercent}% Regen` : "Normal (1.0x)"}</span>
                </div>

                <!-- Energy Card -->
                <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);padding:10px 12px;border-radius:9px;margin-bottom:9px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:11px;">
                        <span style="display:flex;align-items:center;gap:5px;color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;">
                            <span style="color:#00ff88;display:flex;align-items:center;">${ICONS.zap}</span> Energi
                        </span>
                        <span id="aw-energy-text" style="color:#00ff88;font-weight:700;letter-spacing:0.3px;font-family:ui-monospace,Menlo,monospace;">${state.currentEnergy}/${state.maxEnergy}</span>
                    </div>
                    <div style="background:rgba(0,0,0,0.5);height:7px;border-radius:999px;overflow:hidden;border:1px solid rgba(255,255,255,0.07);padding:1px;">
                        <div id="aw-energy-bar" style="height:100%;width:${state.currentEnergy / state.maxEnergy * 100}%;background:linear-gradient(90deg, #38bdf8, #10b981);border-radius:999px;transition:width 0.3s ease;box-shadow:0 0 8px rgba(0,255,136,0.35);"></div>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:10px;color:#718096;margin-top:6px;">
                        <span id="aw-next-wrap" style="cursor:help;">Next: <span id="aw-next-work" style="color:#00ff88;font-weight:600;">Now</span></span>
                        <span id="aw-full-wrap" style="cursor:help;">Full: <span id="aw-full-energy" style="color:#38bdf8;font-weight:500;">${getTimeToFullEnergy(state)}</span></span>
                    </div>
                </div>

                <!-- Focused Auto Work Status Section -->
                <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);padding:8px 10px;border-radius:8px;margin-bottom:9px;display:flex;align-items:center;justify-content:space-between;font-size:11px;">
                    <div style="display:flex;align-items:center;gap:7px;">
                        <span id="aw-mode-icon" style="color:${running ? "#00ff88" : "#ff7777"};display:flex;align-items:center;">${running ? ICONS.zap : ICONS.pause}</span>
                        <div>
                            <div id="aw-mode-title" style="font-weight:700;color:${running ? "#00ff88" : "#ff7777"};font-size:11px;">${running ? "Auto Kerja: AKTIF" : "Auto Kerja: DIJEDA"}</div>
                            <div style="font-size:9.5px;color:#718096;">Target: ≥ <span id="aw-target-threshold">${CONFIG.energyThreshold || 10}</span> EN</div>
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div id="aw-shift-countdown" style="font-weight:700;color:#38bdf8;font-size:11px;">${getLiveCountdown(state, CONFIG)}</div>
                        <div style="font-size:9px;color:#718096;">Countdown</div>
                    </div>
                </div>

                <!-- Token & Expiry Row -->
                <div style="font-size:10.5px;color:#718096;margin-bottom:9px;padding:6px 9px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04);border-radius:6px;display:flex;justify-content:space-between;align-items:center;">
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span style="color:#38bdf8;display:flex;align-items:center;">${ICONS.shield}</span>
                        <span style="color:#a0aec0;">Sesi Auth:</span>
                        <span id="aw-token-status" style="font-weight:700;color:#00ff88;">VALID</span>
                    </div>
                    <span id="aw-token-expiry" style="font-size:10px;color:#718096;">N/A</span>
                </div>

                <!-- Action Buttons -->
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">
                    <button id="aw-work-now" class="aw-btn-action" style="
                        background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
                        color: #fff; border: 1px solid rgba(255,255,255,0.15);
                        padding: 8px 0; border-radius: 7px; cursor: pointer;
                        font-weight: 600; font-size: 11px; box-shadow: 0 2px 6px rgba(2,132,199,0.25);
                    "><span style="display:inline-flex;align-items:center;justify-content:center;gap:4px;">${ICONS.zap} Kerja</span></button>
                    <button id="aw-toggle" class="aw-btn-action" style="
                        background: ${running ? "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)" : "linear-gradient(135deg, #10b981 0%, #059669 100%)"};
                        color: #fff; border: 1px solid rgba(255,255,255,0.15);
                        padding: 8px 0; border-radius: 7px; cursor: pointer;
                        font-weight: 600; font-size: 11px;
                        box-shadow: 0 2px 6px ${running ? "rgba(239,68,68,0.25)" : "rgba(16,185,129,0.25)"};
                    "><span style="display:inline-flex;align-items:center;justify-content:center;gap:4px;">${running ? ICONS.pause + " Jeda" : ICONS.play + " Lanjut"}</span></button>
                    <button id="aw-logs" class="aw-btn-action" style="
                        background: linear-gradient(135deg, #475569 0%, #334155 100%);
                        color: #fff; border: 1px solid rgba(255,255,255,0.15);
                        padding: 8px 0; border-radius: 7px; cursor: pointer;
                        font-weight: 600; font-size: 11px; box-shadow: 0 2px 6px rgba(71,85,105,0.25);
                    "><span style="display:inline-flex;align-items:center;justify-content:center;gap:4px;">${ICONS.fileText} Log</span></button>
                </div>
            </div>
        </div>

        <!-- Mini Floating Pill Container (Mode Ringkas) -->
        <div id="aw-pill-container" class="aw-pill-box" style="
            display: ${isMin ? "flex" : "none"};
            align-items: center;
            gap: 7px;
            background: linear-gradient(135deg, rgba(20, 25, 42, 0.95) 0%, rgba(13, 16, 26, 0.98) 100%);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 999px;
            padding: 4px 8px 4px 10px;
            box-shadow: 0 10px 28px rgba(0, 0, 0, 0.65), 0 0 1px rgba(255, 255, 255, 0.2);
            cursor: ${isPinned ? "default" : "move"};
            transition: border-color 0.2s ease, box-shadow 0.2s ease;
            box-sizing: border-box;
            white-space: nowrap;
        " title="Auto Worker • Seret untuk pindah • Klik 2x untuk perbesar">

            <!-- Robot Icon & Live Status Dot -->
            <div style="display: flex; align-items: center; gap: 5px; flex-shrink: 0;">
                <span style="color: #38bdf8; display: flex; align-items: center;">${ICONS.robot}</span>
                <span id="aw-pill-status-dot" style="
                    width: 7px; height: 7px; border-radius: 50%; display: inline-block; flex-shrink: 0;
                    background: ${running ? "#00ff88" : "#ff4757"};
                    box-shadow: 0 0 8px ${running ? "#00ff88" : "#ff4757"};
                "></span>
            </div>

            <!-- Energy Badge -->
            <div id="aw-pill-energy-badge" style="
                display: flex; align-items: center; gap: 4px;
                background: rgba(0, 255, 136, 0.08);
                border: 1px solid rgba(0, 255, 136, 0.22);
                border-radius: 6px;
                padding: 2px 7px;
                font-size: 11px;
                font-weight: 700;
                color: #00ff88;
                letter-spacing: 0.2px;
                flex-shrink: 0;
            " title="Energi Saat Ini">
                <span style="display: flex; align-items: center;">${ICONS.zap}</span>
                <span id="aw-pill-energy">${state.currentEnergy || 0}/${state.maxEnergy || 110}</span>
            </div>

            <!-- Next Work / Countdown Badge -->
            <div id="aw-pill-countdown-badge" style="
                display: flex; align-items: center; gap: 4px;
                background: rgba(56, 189, 248, 0.08);
                border: 1px solid rgba(56, 189, 248, 0.22);
                border-radius: 6px;
                padding: 2px 7px;
                font-size: 11px;
                font-weight: 700;
                color: #38bdf8;
                letter-spacing: 0.2px;
                flex-shrink: 0;
            " title="Countdown Giliran Kerja">
                <span id="aw-pill-countdown-icon" style="display: flex; align-items: center;">${ICONS.clock}</span>
                <span id="aw-pill-countdown">Memuat...</span>
            </div>

            <!-- Subtle Divider -->
            <div style="width: 1px; height: 16px; background: rgba(255, 255, 255, 0.12); flex-shrink: 0; margin: 0 1px;"></div>

            <!-- Mini Quick Actions -->
            <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
                <button id="aw-pill-toggle" class="aw-pill-btn" style="
                    width: 22px; height: 22px; border-radius: 50%; border: none;
                    background: ${running ? "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)" : "linear-gradient(135deg, #10b981 0%, #059669 100%)"};
                    color: #fff; font-size: 9.5px; font-weight: 700;
                    box-shadow: 0 2px 6px ${running ? "rgba(239,68,68,0.35)" : "rgba(16,185,129,0.35)"};
                " title="${running ? "Jeda Worker" : "Lanjutkan Worker"}">${running ? ICONS.pause : ICONS.play}</button>

                <button id="aw-pill-expand" class="aw-pill-btn" style="
                    width: 22px; height: 22px; border-radius: 50%;
                    background: rgba(255, 255, 255, 0.08);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    color: #cbd5e1;
                " title="Perbesar ke Panel Penuh">${ICONS.expand}</button>
            </div>
        </div>
    `;
  }
  function _setupDragAndDrop(panel, state, CONFIG) {
    let dragging = false, startX = 0, startY = 0, origX = 0, origY = 0;
    const onMouseDown = (e) => {
      if (CONFIG.panelPinned) return;
      if (e.target.closest("button")) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      origX = state.panelX;
      origY = state.panelY;
      e.preventDefault();
    };
    const header = document.getElementById("aw-header");
    const pill = document.getElementById("aw-pill-container");
    if (header) header.addEventListener("mousedown", onMouseDown);
    if (pill) pill.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      state.panelX = Math.max(0, origX + e.clientX - startX);
      state.panelY = Math.max(0, origY + e.clientY - startY);
      panel.style.left = state.panelX + "px";
      panel.style.top = state.panelY + "px";
    });
    document.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      setValue("panelX", state.panelX.toString());
      setValue("panelY", state.panelY.toString());
    });
  }
  function _setupPanelControls(panel, state, CONFIG, ctx) {
    const { openSettings: openSettings2, openLogViewer: openLogViewer2, doWork: doWork2 } = ctx;
    const minimizeBtn = document.getElementById("aw-minimize");
    const pinBtn = document.getElementById("aw-pin");
    const hideBtn = document.getElementById("aw-hide");
    const toggleBtn = document.getElementById("aw-toggle");
    const workNowBtn = document.getElementById("aw-work-now");
    const logsBtn = document.getElementById("aw-logs");
    const settingsBtn = document.getElementById("aw-settings");
    const confirmBtn = document.getElementById("aw-confirm-uncertain");
    const pillExpandBtn = document.getElementById("aw-pill-expand");
    const pillToggleBtn = document.getElementById("aw-pill-toggle");
    const header = document.getElementById("aw-header");
    const pill = document.getElementById("aw-pill-container");
    panel.querySelectorAll(".aw-header-btn").forEach((btn) => {
      btn.addEventListener("mouseenter", () => {
        btn.style.background = "rgba(255,255,255,0.12)";
        btn.style.color = "#fff";
      });
      btn.addEventListener("mouseleave", () => {
        if (btn.id === "aw-pin" && CONFIG.panelPinned) {
          btn.style.background = "rgba(0, 136, 255, 0.2)";
          btn.style.color = "#00d9ff";
        } else if (btn.id === "aw-hide") {
          btn.style.background = "transparent";
          btn.style.color = "#ff5252";
        } else {
          btn.style.background = "transparent";
          btn.style.color = "#8892b0";
        }
      });
    });
    minimizeBtn?.addEventListener("click", () => {
      applyPanelMode(state, !state.panelMinimized);
      ctx.updatePanel?.();
    });
    pillExpandBtn?.addEventListener("click", () => {
      applyPanelMode(state, false);
      ctx.updatePanel?.();
    });
    header?.addEventListener("dblclick", (e) => {
      if (e.target.closest("button")) return;
      applyPanelMode(state, true);
      ctx.updatePanel?.();
    });
    pill?.addEventListener("dblclick", (e) => {
      if (e.target.closest("button")) return;
      applyPanelMode(state, false);
      ctx.updatePanel?.();
    });
    pinBtn?.addEventListener("click", () => {
      CONFIG.panelPinned = !CONFIG.panelPinned;
      ctx.saveConfig?.(CONFIG);
      const hdr = document.getElementById("aw-header");
      const pillEl = document.getElementById("aw-pill-container");
      if (hdr) hdr.style.cursor = CONFIG.panelPinned ? "default" : "move";
      if (pillEl) pillEl.style.cursor = CONFIG.panelPinned ? "default" : "move";
      if (pinBtn) {
        pinBtn.style.background = CONFIG.panelPinned ? "rgba(0, 136, 255, 0.2)" : "transparent";
        pinBtn.style.color = CONFIG.panelPinned ? "#00d9ff" : "#8892b0";
        pinBtn.style.border = CONFIG.panelPinned ? "1px solid rgba(0, 136, 255, 0.4)" : "none";
        pinBtn.title = CONFIG.panelPinned ? "Unpin" : "Pin";
      }
    });
    function toggleRunningState() {
      state.running = !state.running;
      setRunningUI(state.running);
      ctx.log(state.running ? "Script dilanjutkan" : "Script di-pause", "info");
      if (state.running) ctx.wakePendingWork?.();
      saveState(state);
      const summary = saveLiveStatus(state, CONFIG, true);
      ctx.updatePanel?.();
      try {
        if (chrome?.runtime?.id) {
          chrome.storage.local.set({ aw_live_status: summary });
          chrome.runtime.sendMessage({
            type: "POPUP_TO_TAB",
            action: "toggleRunning",
            value: state.running
          }).catch(() => {
          });
        }
      } catch {
      }
    }
    pillToggleBtn?.addEventListener("click", toggleRunningState);
    settingsBtn?.addEventListener("click", () => ctx.openSettings?.());
    hideBtn?.addEventListener("click", () => togglePanelVisibility(state));
    toggleBtn?.addEventListener("click", toggleRunningState);
    workNowBtn?.addEventListener("click", () => {
      ctx.log("Manual work triggered!", "info");
      ctx.doWork?.(true);
    });
    logsBtn?.addEventListener("click", () => ctx.openLogViewer?.());
    confirmBtn?.addEventListener("click", () => {
      if (!state.workResultUncertain || !state.isTabLockOwner) return;
      if (!confirm("Pastikan sudah memeriksa halaman game. Lanjutkan worker?")) return;
      state.workResultUncertain = false;
      state.uncertainReconciliation = "none";
      ctx.uncertainEnergyBefore = null;
      setValue("aw_workResultUncertain", "false");
      setValue("aw_uncertainEnergyBefore", "");
      state.energySyncBase = null;
      const e = getCurrentEnergy();
      if (e) {
        state.currentEnergy = e.current;
        state.maxEnergy = e.max;
      }
      state.running = true;
      ctx.log("Worker dilanjutkan setelah hasil timeout diperiksa manual.", "warn");
      ctx.updatePanel?.();
      ctx.wakePendingWork?.();
    });
    document.removeEventListener("keydown", panel._keyHandler, true);
    panel._keyHandler = _makeKeyHandler(state, CONFIG, ctx, toggleRunningState);
    document.addEventListener("keydown", panel._keyHandler, true);
  }
  function _makeKeyHandler(state, CONFIG, ctx, toggleRunningState) {
    return function handleGlobalKeydown(e) {
      if (state.settingsOpen) return;
      const target = e.target;
      if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName)) return;
      for (const [action, shortcut] of Object.entries(CONFIG.shortcuts)) {
        if (!shortcut?.keys || shortcut.keys.length === 0) continue;
        const reqCtrl = shortcut.keys.includes("Control");
        const reqShift = shortcut.keys.includes("Shift");
        const reqAlt = shortcut.keys.includes("Alt");
        if (Boolean(e.ctrlKey) !== reqCtrl) continue;
        if (Boolean(e.shiftKey) !== reqShift) continue;
        if (Boolean(e.altKey) !== reqAlt) continue;
        if (e.metaKey) continue;
        const nonModifierKeys = shortcut.keys.filter((k) => k !== "Control" && k !== "Shift" && k !== "Alt");
        if (nonModifierKeys.length > 0 && !nonModifierKeys.includes(e.code)) continue;
        if (action === "pauseResume" && state.tabLockManaged && !state.isTabLockOwner) return;
        e.preventDefault();
        e.stopPropagation();
        if (action === "showHide") togglePanelVisibility(state);
        else if (action === "workNow") {
          ctx.log("Manual work!", "info");
          ctx.doWork?.(true);
        } else if (action === "pauseResume") toggleRunningState();
        else if (action === "openLog") ctx.openLogViewer?.();
        else if (action === "openSettings") ctx.openSettings?.();
        return;
      }
    };
  }
  function _setupResponsiveBehavior(panel, state, CONFIG) {
    if (!CONFIG.panelFollowViewport) return;
    window.addEventListener("resize", () => {
      const maxX = window.innerWidth - panel.offsetWidth - 10;
      const maxY = window.innerHeight - panel.offsetHeight - 10;
      if (state.panelX > maxX || state.panelY > maxY) {
        if (CONFIG.panelReturnToOriginal) {
          state.panelX = state.originalPanelX;
          state.panelY = state.originalPanelY;
        } else {
          state.panelX = Math.max(0, Math.min(state.panelX, maxX));
          state.panelY = Math.max(0, Math.min(state.panelY, maxY));
        }
        panel.style.left = state.panelX + "px";
        panel.style.top = state.panelY + "px";
      }
    });
  }
  function ensureSettingsStyles() {
    if (document.getElementById("aw-settings-styles")) return;
    const style = document.createElement("style");
    style.id = "aw-settings-styles";
    style.textContent = `
        /* Modal & Container */
        #aw-settings-modal {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #e2e8f0;
        }

        /* Modern Tabs Navigation */
        .aw-tab-nav {
            display: flex;
            gap: 5px;
            padding: 8px 14px;
            background: rgba(12, 16, 26, 0.7);
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            overflow-x: auto;
            scrollbar-width: none;
            scroll-behavior: smooth;
        }
        .aw-tab-nav::-webkit-scrollbar {
            display: none;
        }
        .aw-tab-btn {
            flex: 1 1 auto;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            padding: 7px 10px;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.07);
            border-radius: 8px;
            color: #8b9bb4;
            font-size: 11.5px;
            font-weight: 500;
            cursor: pointer;
            white-space: nowrap;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            user-select: none;
        }
        .aw-tab-btn:hover {
            color: #ffffff;
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(255, 255, 255, 0.15);
        }
        .aw-tab-btn.active {
            color: #00ff88;
            background: linear-gradient(135deg, rgba(0, 255, 136, 0.14), rgba(0, 180, 216, 0.09));
            border-color: rgba(0, 255, 136, 0.5);
            font-weight: 600;
            box-shadow: 0 2px 10px rgba(0, 255, 136, 0.15);
        }

        /* Tab Content Animation */
        .aw-tab-pane {
            display: none;
            animation: awTabFade 0.22s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .aw-tab-pane.active {
            display: block;
        }
        @keyframes awTabFade {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* Setting Cards */
        .aw-card {
            background: rgba(22, 27, 42, 0.55);
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 10px;
            padding: 12px 14px;
            margin-bottom: 10px;
            transition: all 0.2s;
        }
        .aw-card:hover {
            border-color: rgba(255, 255, 255, 0.12);
            background: rgba(28, 35, 54, 0.65);
        }
        .aw-card-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 14px;
        }
        .aw-card-info {
            flex: 1;
            min-width: 0;
        }
        .aw-card-title {
            font-size: 13px;
            font-weight: 600;
            color: #f1f5f9;
            margin-bottom: 3px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .aw-card-desc {
            font-size: 11px;
            color: #8b9bb4;
            line-height: 1.45;
        }

        /* Modern iOS/Fluent Toggle Switch */
        .aw-switch {
            position: relative;
            display: inline-block;
            width: 44px;
            height: 24px;
            flex-shrink: 0;
            margin: 0;
            cursor: pointer;
        }
        .aw-switch input {
            opacity: 0;
            width: 0;
            height: 0;
            position: absolute;
        }
        .aw-switch .aw-slider {
            position: absolute;
            cursor: pointer;
            top: 0; left: 0; right: 0; bottom: 0;
            background: #1e2436;
            border: 1px solid #373f59;
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            border-radius: 24px;
        }
        .aw-switch .aw-slider:before {
            position: absolute;
            content: "";
            height: 18px;
            width: 18px;
            left: 2px;
            bottom: 2px;
            background-color: #94a3b8;
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            border-radius: 50%;
            box-shadow: 0 2px 4px rgba(0,0,0,0.4);
        }
        .aw-switch input:checked + .aw-slider {
            background: linear-gradient(135deg, #00ff88, #00cc66);
            border-color: #00ff88;
            box-shadow: 0 0 12px rgba(0, 255, 136, 0.35);
        }
        .aw-switch input:checked + .aw-slider:before {
            transform: translateX(20px);
            background-color: #ffffff;
        }
        .aw-switch:hover .aw-slider {
            border-color: #505c80;
        }

        /* Range Slider & Inputs */
        .aw-range-slider {
            flex: 1;
            height: 6px;
            border-radius: 3px;
            background: #252c42;
            outline: none;
            accent-color: #00ff88;
            cursor: pointer;
        }
        .aw-num-badge {
            width: 58px;
            background: #141826;
            color: #00ff88;
            border: 1px solid #2e3752;
            border-radius: 6px;
            padding: 5px 6px;
            font-size: 13px;
            font-weight: 700;
            text-align: center;
            transition: border-color 0.2s;
        }
        .aw-num-badge:focus {
            border-color: #00ff88;
            outline: none;
            box-shadow: 0 0 0 2px rgba(0, 255, 136, 0.2);
        }
        .aw-select-box {
            background: #141826;
            color: #00ff88;
            border: 1px solid #2e3752;
            border-radius: 6px;
            padding: 5px 10px;
            font-size: 12px;
            font-weight: 600;
            outline: none;
            cursor: pointer;
            transition: border-color 0.2s;
        }
        .aw-select-box:focus {
            border-color: #00ff88;
        }

        /* Quick Preset Chips */
        .aw-preset-btn {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #94a3b8;
            border-radius: 6px;
            padding: 3px 9px;
            font-size: 11px;
            cursor: pointer;
            transition: all 0.15s;
        }
        .aw-preset-btn:hover {
            background: rgba(0, 255, 136, 0.12);
            color: #00ff88;
            border-color: rgba(0, 255, 136, 0.4);
        }

        /* Custom Scrollbar */
        #aw-settings-content::-webkit-scrollbar {
            width: 6px;
        }
        #aw-settings-content::-webkit-scrollbar-track {
            background: transparent;
        }
        #aw-settings-content::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.14);
            border-radius: 4px;
        }
        #aw-settings-content::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.28);
        }
    `;
    document.head.appendChild(style);
  }
  function createSettingsModal(CONFIG, ctx) {
    ensureSettingsStyles();
    const savedCreds = getSavedCredentials();
    const old = document.getElementById("aw-settings-modal");
    if (old) old.remove();
    const modal = document.createElement("div");
    modal.id = "aw-settings-modal";
    modal.style.cssText = `
        display: none;
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(4, 7, 14, 0.78);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        z-index: 100001;
        justify-content: center;
        align-items: center;
    `;
    const shortcutActions = [
      { id: "showHide", label: "Tampilkan/Sembunyikan Panel" },
      { id: "workNow", label: "Kerja Sekarang (Work Now)" },
      { id: "pauseResume", label: "Jeda/Lanjutkan (Pause/Resume)" },
      { id: "openLog", label: "Buka Activity Log" },
      { id: "openSettings", label: "Buka Menu Pengaturan" }
    ];
    const shortcutInputsHTML = shortcutActions.map((action) => {
      const shortcut = CONFIG.shortcuts[action.id] || { display: "" };
      return `
            <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 10px; background: rgba(255,255,255,0.02); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                <span style="color: #cbd5e1; font-size: 12px; flex: 1; font-weight: 500;">${action.label}</span>
                <div style="display: flex; gap: 8px; align-items: center; flex: 0 0 210px;">
                    <button id="record-${action.id}" style="
                        background: #252c40; color: #fff; border: 1px solid #3b4563;
                        padding: 6px 10px; border-radius: 6px; cursor: pointer;
                        font-size: 11px; min-width: 76px; font-weight: 500; transition: background 0.15s;
                    ">Rekam</button>
                    <input type="text" id="shortcut-${action.id}" value="${shortcut.display}"
                        readonly
                        style="width: 110px; background: #121624; color: #00d4ff; border: 1px solid #28334e; border-radius: 6px; padding: 6px 8px; font-size: 11px; font-weight: 700; text-align: center;">
                </div>
            </div>
        `;
    }).join("");
    modal.innerHTML = `
        <div style="
            background: linear-gradient(180deg, #131724 0%, #0d101a 100%);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 16px;
            width: 95%;
            max-width: 680px;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 60px rgba(0,0,0,0.8), 0 0 1px 1px rgba(255,255,255,0.05);
            overflow: hidden;
        ">
            <!-- Modal Header -->
            <div style="
                padding: 16px 20px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: linear-gradient(135deg, rgba(26, 33, 54, 0.8) 0%, rgba(18, 22, 36, 0.95) 100%);
            ">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="
                        width: 32px; height: 32px; border-radius: 8px;
                        background: linear-gradient(135deg, rgba(0,255,136,0.2), rgba(0,180,216,0.2));
                        border: 1px solid rgba(0,255,136,0.3);
                        display: flex; align-items: center; justify-content: center;
                        color: #00ff88;
                    ">${ICONS.settings}</div>
                    <div>
                        <div style="font-weight: 700; color: #fff; font-size: 14.5px; letter-spacing: 0.3px;">Pengaturan Bot</div>
                        <div style="font-size: 11px; color: #8b9bb4;">Sesuaikan jadwal, threshold, notifikasi & keamanan</div>
                    </div>
                </div>
                <button id="aw-close-settings" style="
                    background: rgba(255, 255, 255, 0.05); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.12);
                    padding: 6px 12px; border-radius: 8px; cursor: pointer;
                    font-size: 12px; font-weight: 600; transition: all 0.15s;
                ">Tutup</button>
            </div>

            <!-- Segmented Category Tabs -->
            <div class="aw-tab-nav">
                <button class="aw-tab-btn active" data-tab="tab-work">${ICONS.zap} Kerja & Energi</button>
                <button class="aw-tab-btn" data-tab="tab-stealth">${ICONS.shield} Stealth & Jadwal</button>
                <button class="aw-tab-btn" data-tab="tab-notif">${ICONS.bell} Notifikasi & Suara</button>
                <button class="aw-tab-btn" data-tab="tab-ui">${ICONS.monitor} Tampilan & Pintasan</button>
                <button class="aw-tab-btn" data-tab="tab-account">${ICONS.key} Akun & Sistem</button>
            </div>

            <!-- Scrollable Content Body -->
            <div id="aw-settings-content" style="
                padding: 18px 20px;
                overflow-y: auto;
                flex: 1;
                overscroll-behavior: contain;
            ">
                <!-- TAB 1: KERJA & ENERGI -->
                <div id="tab-work" class="aw-tab-pane active">
                    <div class="aw-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <div class="aw-card-title">Batas Energi Sebelum Kerja</div>
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <input type="number" id="setting-energy-threshold-num" min="10" max="100" step="5" value="${CONFIG.energyThreshold}" class="aw-num-badge">
                                <span style="color: #00ff88; font-size: 11px; font-weight: 700;">EN</span>
                            </div>
                        </div>
                        <div class="aw-card-desc" style="margin-bottom: 12px;">
                            Bot hanya akan mengeksekusi shift kerja saat energi akun mencapai angka ini.
                        </div>
                        <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 12px;">
                            <input type="range" id="setting-energy-threshold" min="10" max="100" step="5" value="${CONFIG.energyThreshold}" class="aw-range-slider">
                        </div>
                        <!-- Quick Presets -->
                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                            <span style="font-size: 11px; color: #64748b; margin-right: 4px;">Pilihan Cepat:</span>
                            <button type="button" class="aw-preset-btn" data-val="10">10 EN</button>
                            <button type="button" class="aw-preset-btn" data-val="25">25 EN</button>
                            <button type="button" class="aw-preset-btn" data-val="50">50 EN</button>
                            <button type="button" class="aw-preset-btn" data-val="80">80 EN</button>
                            <button type="button" class="aw-preset-btn" data-val="100">100 EN</button>
                        </div>
                    </div>

                    <!-- Formula Sleep Info Card -->
                    <div style="background: rgba(0, 255, 136, 0.04); border: 1px solid rgba(0, 255, 136, 0.15); border-radius: 10px; padding: 14px; margin-top: 14px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <span style="color: #00ff88; font-size: 12px; font-weight: 600;">Rumus Timer Pemulihan</span>
                            <span style="color: #94a3b8; font-size: 11px; font-family: monospace;">(Threshold - Sisa) × 60s + Jitter</span>
                        </div>
                        <div style="font-size: 11px; color: #94a3b8; line-height: 1.5;">
                            • <b>Buff Wilayah:</b> Jika tinggal di wilayah berfasilitas (seperti Jawa Barat), pemulihan energi otomatis dipercepat hingga +50% (40 detik per energi).<br>
                            • <b>Optimistic Decrement:</b> Energi langsung terpotong seketika shift dikirimkan, mencegah tabrakan permintaan ganda (0 race conditions).
                        </div>
                    </div>
                </div>

                <!-- TAB 2: STEALTH & JADWAL -->
                <div id="tab-stealth" class="aw-tab-pane">
                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Threshold Jitter (Anti-Pola)</div>
                                <div class="aw-card-desc">Mengacak sedikit ambang batas energi (±2 EN) di setiap siklus agar interval kerja tidak terbaca kaku dan terdeteksi bot oleh server.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-stealth-jitter" ${CONFIG.stealthJitterEnabled ? "checked" : ""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row" style="margin-bottom: 10px;">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Jadwal Istirahat Malam</div>
                                <div class="aw-card-desc">Bot otomatis berhenti kerja pada rentang jam istirahat malam layaknya pola hidup manusia normal.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-sleep-schedule" ${CONFIG.sleepScheduleEnabled ? "checked" : ""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                        <div style="display: flex; gap: 8px; align-items: center; background: rgba(0,0,0,0.25); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.04);">
                            <span style="font-size: 12px; color: #94a3b8;">Jam Istirahat:</span>
                            <select id="setting-sleep-start" class="aw-select-box">
                                ${Array.from({ length: 24 }, (_, i) => `<option value="${i}" ${(CONFIG.sleepStartHour ?? 1) === i ? "selected" : ""}>${String(i).padStart(2, "0")}:00</option>`).join("")}
                            </select>
                            <span style="font-size: 12px; color: #64748b;">s/d</span>
                            <select id="setting-sleep-end" class="aw-select-box">
                                ${Array.from({ length: 24 }, (_, i) => `<option value="${i}" ${(CONFIG.sleepEndHour ?? 6) === i ? "selected" : ""}>${String(i).padStart(2, "0")}:00</option>`).join("")}
                            </select>
                            <span style="font-size: 11px; color: #64748b; margin-left: auto;">WIB</span>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Peredam Log Energi Rendah (Quiet Mode)</div>
                                <div class="aw-card-desc">Membatasi log "Energi tidak cukup" maksimal 1x per 2 menit agar Activity Log tetap bersih dan mudah dibaca.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-quiet-mode" ${CONFIG.quietModeEnabled ? "checked" : ""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>
                </div>

                <!-- TAB 3: NOTIFIKASI & SUARA -->
                <div id="tab-notif" class="aw-tab-pane">
                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Notifikasi Pop-up Browser</div>
                                <div class="aw-card-desc">Menampilkan banner notifikasi desktop browser ketika shift berhasil dikerjakan.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-notifications" ${CONFIG.sendNotification ? "checked" : ""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Alert Desktop Saat Energi Penuh</div>
                                <div class="aw-card-desc">Kirim notifikasi desktop segera setelah energi mencapai batas maksimal agar tidak terbuang.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-energy-full-alert" ${CONFIG.energyFullAlertEnabled ? "checked" : ""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row" style="margin-bottom: 8px;">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Suara Notifikasi Kerja</div>
                                <div class="aw-card-desc">Putar efek audio halus saat selesai bekerja atau terjadi kesalahan.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-sound-notification-enabled" ${CONFIG.soundNotificationEnabled ? "checked" : ""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                        <div style="display: flex; gap: 10px; align-items: center; margin-top: 6px;">
                            <span style="font-size: 11px; color: #94a3b8; width: 50px;">Volume:</span>
                            <input type="range" id="setting-sound-notification-volume" min="0" max="100" value="${Math.round(CONFIG.soundNotificationVolume * 100)}" class="aw-range-slider">
                            <input type="number" id="setting-sound-notification-volume-num" min="0" max="100" value="${Math.round(CONFIG.soundNotificationVolume * 100)}" class="aw-num-badge" style="color: #00d4ff;">
                            <span style="color: #64748b; font-size: 12px;">%</span>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row" style="margin-bottom: 8px;">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Alarm Suara Energi Penuh</div>
                                <div class="aw-card-desc">Putar alarm khusus saat energi akun sudah menyentuh kapasitas maksimal.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-energy-full-sound-enabled" ${CONFIG.energyFullAlertSoundEnabled ? "checked" : ""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                        <div style="display: flex; gap: 10px; align-items: center; margin-top: 6px;">
                            <span style="font-size: 11px; color: #94a3b8; width: 50px;">Volume:</span>
                            <input type="range" id="setting-energy-full-volume" min="0" max="100" value="${Math.round(CONFIG.energyFullAlertVolume * 100)}" class="aw-range-slider">
                            <input type="number" id="setting-energy-full-volume-num" min="0" max="100" value="${Math.round(CONFIG.energyFullAlertVolume * 100)}" class="aw-num-badge" style="color: #00d4ff;">
                            <span style="color: #64748b; font-size: 12px;">%</span>
                        </div>
                    </div>

                    <button id="aw-test-notification-sound" style="
                        background: rgba(255, 255, 255, 0.05); color: #fff; border: 1px solid rgba(255, 255, 255, 0.12);
                        padding: 9px 16px; border-radius: 8px; cursor: pointer;
                        font-size: 12px; width: 100%; font-weight: 600; margin-top: 4px;
                        transition: all 0.15s;
                    ">Uji Coba Bunyi Suara (Test Sound)</button>
                </div>

                <!-- TAB 4: TAMPILAN & SHORTCUT -->
                <div id="tab-ui" class="aw-tab-pane">
                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Hanya Tampilkan di Dashboard (/dashboard)</div>
                                <div class="aw-card-desc">Otomatis sembunyikan panel jika membuka halaman lain (misal: /map, /market). Bot tetap aktif di background.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-panel-dashboard-only" ${CONFIG.panelDashboardOnly ? "checked" : ""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Hanya Tampilkan di Tab Utama (Standby Hidden)</div>
                                <div class="aw-card-desc">Jika membuka banyak tab game bersamaan, panel hanya melayang di tab utama yang memimpin kerja.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-panel-leader-only" ${CONFIG.panelLeaderOnly ? "checked" : ""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row" style="margin-bottom: 8px;">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Sesuaikan dengan Ukuran Jendela Browser</div>
                                <div class="aw-card-desc">Mencegah panel keluar layar saat ukuran browser diperkecil.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-follow-viewport" ${CONFIG.panelFollowViewport ? "checked" : ""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Kembali ke Posisi Semula Saat Browser Dibesarkan</div>
                                <div class="aw-card-desc">Mengembalikan panel ke koordinat asal saat ruang layar kembali lega.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-return-original" ${CONFIG.panelReturnToOriginal ? "checked" : ""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <button id="aw-reset-position" style="
                        background: rgba(255, 255, 255, 0.05); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.1);
                        padding: 8px 16px; border-radius: 8px; cursor: pointer;
                        font-size: 12px; width: 100%; margin-bottom: 16px; font-weight: 500;
                        transition: all 0.15s;
                    ">Atur Ulang Posisi Panel ke Pojok Kanan</button>

                    <!-- Keyboard Shortcuts Sub-Section -->
                    <div style="margin-top: 10px;">
                        <div style="font-size: 13px; font-weight: 600; color: #fff; margin-bottom: 4px;">Pintasan Keyboard (Shortcuts)</div>
                        <div style="font-size: 11px; color: #8b9bb4; margin-bottom: 10px;">
                            Klik <b>Rekam</b> lalu tekan 1–3 kombinasi tombol. Tekan <kbd style="background:#222;padding:1px 4px;border-radius:3px;">Enter</kbd> untuk simpan, <kbd style="background:#222;padding:1px 4px;border-radius:3px;">Esc</kbd> untuk batalkan.
                        </div>
                        ${shortcutInputsHTML}
                        <div id="shortcut-error" style="color: #ff4444; font-size: 11px; margin-top: 8px; display: none;"></div>
                    </div>
                </div>

                <!-- TAB 5: AKUN & SISTEM -->
                <div id="tab-account" class="aw-tab-pane">
                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Mode Eco (Hemat RAM & CPU)</div>
                                <div class="aw-card-desc">Menghentikan render visual DOM saat tab ditinggal di latar belakang dan men-cache pembacaan wilayah. Timer dan giliran kerja tetap berjalan 100% presisi tanpa tertunda.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-eco-mode" ${CONFIG.ecoModeEnabled !== false ? "checked" : ""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                    </div>

                    <div class="aw-card">
                        <div class="aw-card-row" style="margin-bottom: 10px;">
                            <div class="aw-card-info">
                                <div class="aw-card-title">Masuk Otomatis (Auto Re-Login)</div>
                                <div class="aw-card-desc">Jika sesi/token game habis (HTTP 401), bot akan otomatis login kembali ke akun Anda dan melanjutkan kerja. Data disimpan aman 100% lokal di browser.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-auto-relogin" ${CONFIG.autoReloginEnabled ? "checked" : ""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>

                        <div id="aw-autologin-fields" style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); margin-top: 8px;">
                            <div style="margin-bottom: 10px;">
                                <label style="display: block; font-size: 11px; color: #94a3b8; margin-bottom: 4px; font-weight: 500;">Email Akun Game</label>
                                <input type="email" id="setting-login-email" autocomplete="off" data-lpignore="true" data-form-type="other" placeholder="nama@email.com" value="${savedCreds?.email || ""}" style="width: 100%; box-sizing: border-box; background: #131724; color: #fff; border: 1px solid #2d364f; border-radius: 6px; padding: 8px 10px; font-size: 12px;">
                            </div>
                            <div style="margin-bottom: 12px;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                    <label style="font-size: 11px; color: #94a3b8; font-weight: 500;">Kata Sandi</label>
                                    <span id="aw-toggle-pwd-vis" style="font-size: 11px; color: #00d4ff; cursor: pointer; user-select: none;">Lihat</span>
                                </div>
                                <input type="password" id="setting-login-pwd" autocomplete="off" data-lpignore="true" data-form-type="other" placeholder="Kata sandi akunmu" value="${savedCreds?.password || ""}" style="width: 100%; box-sizing: border-box; background: #131724; color: #fff; border: 1px solid #2d364f; border-radius: 6px; padding: 8px 10px; font-size: 12px;">
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <button id="aw-save-login-creds" style="flex: 1; background: linear-gradient(135deg, #0284c7, #0369a1); color: #fff; border: none; padding: 8px; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 600;">Simpan Kredensial</button>
                                <button id="aw-clear-login-creds" style="background: rgba(255,255,255,0.05); color: #ff5555; border: 1px solid rgba(255,85,85,0.3); padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 500;">Hapus</button>
                            </div>
                            <div id="aw-login-creds-msg" style="font-size: 11px; margin-top: 8px; display: none;"></div>
                        </div>
                    </div>

                    <div class="aw-card" style="margin-top: 14px; border-color: rgba(255, 85, 85, 0.2);">
                        <div class="aw-card-title" style="color: #ff6b6b; margin-bottom: 6px;">Zona Bahaya (Reset Total)</div>
                        <div class="aw-card-desc" style="margin-bottom: 12px;">
                            Mengembalikan seluruh preferensi, batas energi, pintasan keyboard, dan posisi panel ke pengaturan awal pabrik.
                        </div>
                        <button id="aw-restore-defaults" style="
                            background: linear-gradient(135deg, rgba(255, 107, 107, 0.2), rgba(204, 0, 0, 0.3));
                            color: #ff8888; border: 1px solid rgba(255, 107, 107, 0.4); padding: 9px;
                            border-radius: 6px; cursor: pointer; font-weight: 600;
                            font-size: 12px; width: 100%; transition: all 0.15s;
                        ">Pulihkan Semua Pengaturan ke Default</button>
                    </div>
                </div>
            </div>

            <!-- Sticky Modal Footer -->
            <div id="aw-settings-footer" style="
                padding: 12px 20px;
                border-top: 1px solid rgba(255, 255, 255, 0.08);
                display: flex;
                gap: 12px;
                justify-content: space-between;
                align-items: center;
                background: linear-gradient(135deg, #131724 0%, #0d101a 100%);
            ">
                <div id="aw-settings-status" style="font-size: 12px; color: #00ff88; font-weight: 600; display: none;"></div>
                <div style="display: flex; gap: 8px; margin-left: auto;">
                    <button id="aw-cancel-settings" style="
                        background: transparent; color: #94a3b8; border: 1px solid rgba(255, 255, 255, 0.15);
                        padding: 8px 16px; border-radius: 8px; cursor: pointer;
                        font-size: 12px; font-weight: 600; transition: all 0.15s;
                    ">Batal</button>
                    <button id="aw-save-settings" style="
                        background: linear-gradient(135deg, #00ff88, #00cc66);
                        color: #050a14; border: none; padding: 9px 24px;
                        border-radius: 8px; cursor: pointer; font-weight: 700;
                        font-size: 13px; box-shadow: 0 4px 14px rgba(0,255,136,0.3);
                        transition: transform 0.15s, box-shadow 0.15s;
                    ">Simpan Pengaturan</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const tabNav = modal.querySelector(".aw-tab-nav");
    const tabBtns = modal.querySelectorAll(".aw-tab-btn");
    const tabPanes = modal.querySelectorAll(".aw-tab-pane");
    tabBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = btn.dataset.tab;
        tabBtns.forEach((b) => b.classList.remove("active"));
        tabPanes.forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        btn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        const targetPane = modal.querySelector(`#${targetId}`);
        if (targetPane) targetPane.classList.add("active");
      });
    });
    tabNav?.addEventListener("wheel", (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        tabNav.scrollLeft += e.deltaY;
      }
    }, { passive: false });
    let statusTimer = null;
    function applyAndSaveSettings(explicit = false) {
      const sliderEl = document.getElementById("setting-energy-threshold");
      const numEl = document.getElementById("setting-energy-threshold-num");
      const sVal = parseInt(sliderEl?.value ?? "", 10);
      const nVal = parseInt(numEl?.value ?? "", 10);
      const chosenThreshold = !isNaN(nVal) && nVal >= 10 && nVal <= 100 ? nVal : !isNaN(sVal) ? sVal : CONFIG.energyThreshold;
      if (chosenThreshold >= 10 && chosenThreshold <= 100) {
        CONFIG.energyThreshold = chosenThreshold;
        if (sliderEl && sliderEl.value !== String(chosenThreshold)) sliderEl.value = chosenThreshold;
        if (numEl && numEl.value !== String(chosenThreshold)) numEl.value = chosenThreshold;
      }
      const quietEl = document.getElementById("setting-quiet-mode");
      if (quietEl) CONFIG.quietModeEnabled = quietEl.checked;
      const dashOnlyEl = document.getElementById("setting-panel-dashboard-only");
      if (dashOnlyEl) CONFIG.panelDashboardOnly = dashOnlyEl.checked;
      const leaderOnlyEl = document.getElementById("setting-panel-leader-only");
      if (leaderOnlyEl) CONFIG.panelLeaderOnly = leaderOnlyEl.checked;
      const followEl = document.getElementById("setting-follow-viewport");
      if (followEl) CONFIG.panelFollowViewport = followEl.checked;
      const returnEl = document.getElementById("setting-return-original");
      if (returnEl) CONFIG.panelReturnToOriginal = returnEl.checked;
      const soundEnabledEl = document.getElementById("setting-sound-notification-enabled");
      if (soundEnabledEl) CONFIG.soundNotificationEnabled = soundEnabledEl.checked;
      const soundVolEl = document.getElementById("setting-sound-notification-volume");
      if (soundVolEl) {
        const vol = Math.max(0, Math.min(100, parseInt(soundVolEl.value || "30", 10)));
        CONFIG.soundNotificationVolume = vol / 100;
      }
      const fullSoundEl = document.getElementById("setting-energy-full-sound-enabled");
      if (fullSoundEl) CONFIG.energyFullAlertSoundEnabled = fullSoundEl.checked;
      const fullVolEl = document.getElementById("setting-energy-full-volume");
      if (fullVolEl) {
        const vol = Math.max(0, Math.min(100, parseInt(fullVolEl.value || "30", 10)));
        CONFIG.energyFullAlertVolume = vol / 100;
      }
      const notifEl = document.getElementById("setting-notifications");
      if (notifEl) CONFIG.sendNotification = notifEl.checked;
      const fullAlertEl = document.getElementById("setting-energy-full-alert");
      if (fullAlertEl) CONFIG.energyFullAlertEnabled = fullAlertEl.checked;
      const stealthEl = document.getElementById("setting-stealth-jitter");
      if (stealthEl) CONFIG.stealthJitterEnabled = stealthEl.checked;
      const sleepEl = document.getElementById("setting-sleep-schedule");
      if (sleepEl) CONFIG.sleepScheduleEnabled = sleepEl.checked;
      const sleepStartEl = document.getElementById("setting-sleep-start");
      if (sleepStartEl) CONFIG.sleepStartHour = parseInt(sleepStartEl.value, 10);
      const sleepEndEl = document.getElementById("setting-sleep-end");
      if (sleepEndEl) CONFIG.sleepEndHour = parseInt(sleepEndEl.value, 10);
      const autoReloginEl = document.getElementById("setting-auto-relogin");
      if (autoReloginEl) CONFIG.autoReloginEnabled = autoReloginEl.checked;
      const ecoEl = document.getElementById("setting-eco-mode");
      if (ecoEl) CONFIG.ecoModeEnabled = ecoEl.checked;
      if (explicit) {
        const newShortcuts = {};
        shortcutActions.forEach((action) => {
          const inp = document.getElementById(`shortcut-${action.id}`);
          const display = inp?.value.trim() ?? "";
          const parts = display.split("+").filter(Boolean);
          const keys = parts.map((p) => {
            if (p === "Ctrl") return "Control";
            if (p === "Shift") return "Shift";
            if (p === "Alt") return "Alt";
            if (p === "Space") return "Space";
            if (p.length === 1 && /[A-Z]/.test(p)) return `Key${p}`;
            if (/^\d$/.test(p)) return `Digit${p}`;
            return p;
          });
          newShortcuts[action.id] = { keys, display };
        });
        const validated = normalizeConfig({ shortcuts: newShortcuts }, true);
        const hasModifier = Object.values(newShortcuts).every((s) => s.keys.some((k) => k === "Control" || k === "Alt"));
        const displays = Object.values(newShortcuts).map((s) => s.display);
        const uniqueKeys = new Set(displays).size === displays.length;
        if (validated && hasModifier && uniqueKeys) {
          CONFIG.shortcuts = newShortcuts;
          const errEl = document.getElementById("shortcut-error");
          if (errEl) errEl.style.display = "none";
        }
      }
      saveConfig(CONFIG);
      ctx.updatePanelVisibility?.(CONFIG);
      ctx.updatePanel?.();
      const statusEl = document.getElementById("aw-settings-status");
      if (statusEl) {
        if (statusTimer) clearTimeout(statusTimer);
        if (explicit) {
          statusEl.textContent = `Tersimpan! Batas energi: ${CONFIG.energyThreshold} EN`;
          statusEl.style.color = "#00ff88";
          statusEl.style.display = "block";
        } else {
          statusEl.textContent = `Disimpan otomatis (Batas: ${CONFIG.energyThreshold} EN)`;
          statusEl.style.color = "#00e99a";
          statusEl.style.display = "block";
          statusTimer = setTimeout(() => {
            if (statusEl) statusEl.style.display = "none";
          }, 2500);
        }
      }
    }
    function setupDualVolumeControl(sliderId, numberId) {
      const slider = document.getElementById(sliderId);
      const num = document.getElementById(numberId);
      if (!slider || !num) return;
      const syncAndSave = (sourceVal) => {
        let v = parseInt(sourceVal, 10);
        if (isNaN(v) || v < 0) v = 0;
        if (v > 100) v = 100;
        slider.value = v;
        num.value = v;
        applyAndSaveSettings(false);
      };
      slider.addEventListener("input", (e) => syncAndSave(e.target.value));
      slider.addEventListener("change", (e) => syncAndSave(e.target.value));
      num.addEventListener("input", (e) => syncAndSave(e.target.value));
      num.addEventListener("change", (e) => syncAndSave(e.target.value));
      num.addEventListener("blur", (e) => syncAndSave(e.target.value));
    }
    setupDualVolumeControl("setting-sound-notification-volume", "setting-sound-notification-volume-num");
    setupDualVolumeControl("setting-energy-full-volume", "setting-energy-full-volume-num");
    const thresholdSlider = document.getElementById("setting-energy-threshold");
    const thresholdNum = document.getElementById("setting-energy-threshold-num");
    if (thresholdSlider && thresholdNum) {
      const syncThreshold = (val) => {
        let v = parseInt(val, 10);
        if (isNaN(v) || v < 10) v = 10;
        if (v > 100) v = 100;
        thresholdSlider.value = v;
        thresholdNum.value = v;
        applyAndSaveSettings(false);
      };
      thresholdSlider.addEventListener("input", (e) => syncThreshold(e.target.value));
      thresholdSlider.addEventListener("change", (e) => syncThreshold(e.target.value));
      thresholdNum.addEventListener("input", (e) => syncThreshold(e.target.value));
      thresholdNum.addEventListener("change", (e) => syncThreshold(e.target.value));
      thresholdNum.addEventListener("blur", (e) => syncThreshold(e.target.value));
    }
    modal.querySelectorAll(".aw-preset-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = parseInt(btn.dataset.val, 10);
        if (!isNaN(val)) {
          if (thresholdSlider) thresholdSlider.value = val;
          if (thresholdNum) thresholdNum.value = val;
          applyAndSaveSettings(false);
        }
      });
    });
    [
      "setting-quiet-mode",
      "setting-panel-dashboard-only",
      "setting-panel-leader-only",
      "setting-follow-viewport",
      "setting-return-original",
      "setting-sound-notification-enabled",
      "setting-energy-full-sound-enabled",
      "setting-notifications",
      "setting-energy-full-alert",
      "setting-stealth-jitter",
      "setting-sleep-schedule",
      "setting-sleep-start",
      "setting-sleep-end",
      "setting-auto-relogin",
      "setting-eco-mode"
    ].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", () => applyAndSaveSettings(false));
    });
    const pwdInput = document.getElementById("setting-login-pwd");
    const togglePwdBtn = document.getElementById("aw-toggle-pwd-vis");
    togglePwdBtn?.addEventListener("click", () => {
      if (!pwdInput) return;
      if (pwdInput.type === "password") {
        pwdInput.type = "text";
        togglePwdBtn.textContent = "Sembunyikan";
      } else {
        pwdInput.type = "password";
        togglePwdBtn.textContent = "Lihat";
      }
    });
    const saveCredsBtn = document.getElementById("aw-save-login-creds");
    const clearCredsBtn = document.getElementById("aw-clear-login-creds");
    const credsMsg = document.getElementById("aw-login-creds-msg");
    const emailInp = document.getElementById("setting-login-email");
    saveCredsBtn?.addEventListener("click", () => {
      const email = emailInp?.value.trim() || "";
      const pwd = pwdInput?.value || "";
      if (!email || !pwd) {
        if (credsMsg) {
          credsMsg.textContent = "Harap isi email dan kata sandi!";
          credsMsg.style.color = "#ff6b6b";
          credsMsg.style.display = "block";
        }
        return;
      }
      saveCredentials(email, pwd);
      CONFIG.autoReloginEnabled = true;
      const chk = document.getElementById("setting-auto-relogin");
      if (chk) chk.checked = true;
      saveConfig(CONFIG);
      if (credsMsg) {
        credsMsg.textContent = `Kredensial untuk ${email} tersimpan! Auto Re-Login AKTIF.`;
        credsMsg.style.color = "#00ff88";
        credsMsg.style.display = "block";
      }
      ctx.log?.("Kredensial Auto Re-Login berhasil disimpan.", "success");
    });
    clearCredsBtn?.addEventListener("click", () => {
      clearCredentials();
      if (emailInp) emailInp.value = "";
      if (pwdInput) pwdInput.value = "";
      CONFIG.autoReloginEnabled = false;
      const chk = document.getElementById("setting-auto-relogin");
      if (chk) chk.checked = false;
      saveConfig(CONFIG);
      if (credsMsg) {
        credsMsg.textContent = "Kredensial telah dihapus dari browser.";
        credsMsg.style.color = "#ffaa00";
        credsMsg.style.display = "block";
      }
      ctx.log?.("Kredensial Auto Re-Login dihapus.", "info");
    });
    const recordingState = {};
    shortcutActions.forEach((action) => {
      const btn = document.getElementById(`record-${action.id}`);
      const inp = document.getElementById(`shortcut-${action.id}`);
      if (btn && inp) {
        btn.addEventListener("click", () => {
          recordingState[action.id] = { keys: [], recording: true };
          btn.textContent = "Tekan tombol...";
          btn.style.background = "#0284c7";
          inp.value = "Menunggu input...";
          inp.style.color = "#38bdf8";
        });
      }
    });
    const recordHandler = (e) => {
      if (e.type !== "keydown") return;
      let handled = false;
      shortcutActions.forEach((action) => {
        if (!recordingState[action.id]?.recording) return;
        e.preventDefault();
        e.stopPropagation();
        const rec = recordingState[action.id];
        const btn = document.getElementById(`record-${action.id}`);
        const inp = document.getElementById(`shortcut-${action.id}`);
        const key = e.code;
        if (key === "Escape") {
          rec.recording = false;
          if (inp) inp.value = CONFIG.shortcuts[action.id]?.display ?? "";
          if (btn) {
            btn.textContent = "Rekam";
            btn.style.background = "#252c40";
          }
          handled = true;
          return;
        }
        if (key === "Enter") {
          if (rec.keys.length > 0) {
            rec.recording = false;
            if (btn) {
              btn.textContent = "Selesai";
              btn.style.background = "#00ff88";
              btn.style.color = "#000";
              setTimeout(() => {
                btn.textContent = "Rekam";
                btn.style.background = "#252c40";
                btn.style.color = "#fff";
              }, 1500);
            }
          }
          handled = true;
          return;
        }
        if (e.repeat) {
          handled = true;
          return;
        }
        if (!rec.keys.includes(key)) rec.keys.push(key);
        const display = rec.keys.map((k) => {
          if (k === "ControlLeft" || k === "ControlRight") return "Ctrl";
          if (k === "ShiftLeft" || k === "ShiftRight") return "Shift";
          if (k === "AltLeft" || k === "AltRight") return "Alt";
          if (k.startsWith("Key")) return k.replace("Key", "");
          if (k.startsWith("Digit")) return k.replace("Digit", "");
          if (k === "Space") return "Space";
          return k;
        }).join("+");
        if (inp) {
          inp.value = display;
          inp.style.color = "#00ff88";
        }
        if (rec.keys.length >= 3) {
          rec.recording = false;
          if (btn) {
            btn.textContent = "Selesai";
            btn.style.background = "#00ff88";
            btn.style.color = "#000";
            setTimeout(() => {
              btn.textContent = "Rekam";
              btn.style.background = "#252c40";
              btn.style.color = "#fff";
            }, 1500);
          }
        }
        handled = true;
      });
      if (handled) return false;
    };
    function handleEscapeKey(e) {
      if (e.key === "Escape" && modal.style.display === "flex") closeModal(true);
    }
    function closeModal(saveOnClose = true) {
      if (saveOnClose) applyAndSaveSettings(false);
      modal.style.display = "none";
      if (ctx.state) ctx.state.settingsOpen = false;
      document.removeEventListener("keydown", recordHandler, true);
      document.removeEventListener("keydown", handleEscapeKey);
    }
    modal.closeModalSafely = closeModal;
    modal.recordHandler = recordHandler;
    modal.handleEscapeKey = handleEscapeKey;
    document.getElementById("aw-close-settings")?.addEventListener("click", () => closeModal(true));
    document.getElementById("aw-cancel-settings")?.addEventListener("click", () => {
      openSettings(CONFIG, ctx);
      closeModal(false);
    });
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal(true);
    });
    document.addEventListener("keydown", handleEscapeKey);
    document.getElementById("aw-test-notification-sound")?.addEventListener("click", () => {
      const volVal = parseInt(document.getElementById("setting-sound-notification-volume")?.value ?? "70", 10);
      const testVol = isNaN(volVal) ? 0.7 : Math.max(0, Math.min(100, volVal)) / 100;
      ctx.sendNotification?.("Parlamentum Auto Worker", "Tes notifikasi suara berhasil.");
      ctx.playNotificationSound?.({ soundNotificationEnabled: true, soundNotificationVolume: testVol }, "success");
    });
    document.getElementById("aw-reset-position")?.addEventListener("click", () => {
      if (!ctx.state) return;
      ctx.state.panelX = CONFIG.panelDefaultX;
      ctx.state.panelY = CONFIG.panelDefaultY;
      const panel = document.getElementById("aw-panel");
      if (panel) {
        panel.style.left = ctx.state.panelX + "px";
        panel.style.top = ctx.state.panelY + "px";
      }
      setValue("panelX", ctx.state.panelX.toString());
      setValue("panelY", ctx.state.panelY.toString());
      ctx.log?.("Posisi panel berhasil di-reset ke default", "success");
      const statusEl = document.getElementById("aw-settings-status");
      if (statusEl) {
        statusEl.textContent = "Posisi panel di-reset ke default";
        statusEl.style.color = "#0088ff";
        statusEl.style.display = "block";
        setTimeout(() => {
          if (statusEl) statusEl.style.display = "none";
        }, 2500);
      }
    });
    document.getElementById("aw-restore-defaults")?.addEventListener("click", () => {
      if (!confirm("Yakin ingin mengembalikan SEMUA pengaturan ke default?\n\nIni akan:\n- Reset keyboard shortcuts\n- Reset batas energi ke 10 EN\n- Reset semua preferensi\n- Reset posisi panel\n\nKonfigurasi yang tersimpan akan dihapus.")) return;
      setValue("aw_config", null);
      setValue("panelX", (CONFIG.panelDefaultX ?? 20).toString());
      setValue("panelY", (CONFIG.panelDefaultY ?? 20).toString());
      ctx.log?.("Semua pengaturan berhasil di-reset ke default! Refresh halaman untuk menerapkan.", "success");
      setTimeout(() => {
        if (confirm("Pengaturan sudah di-reset. Refresh halaman sekarang?")) location.reload();
      }, 500);
    });
    document.getElementById("aw-save-settings")?.addEventListener("click", () => {
      applyAndSaveSettings(true);
      if (CONFIG.sendNotification && "Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {
        });
      }
      const hideBtn = document.getElementById("aw-hide");
      if (hideBtn) hideBtn.title = `Hide (${CONFIG.shortcuts.showHide?.display ?? ""})`;
      ctx.log?.(`Pengaturan disimpan! Batas energi sebelum kerja: ${CONFIG.energyThreshold} EN`, "success");
      ctx.playNotificationSound?.("success");
      setTimeout(() => closeModal(false), 700);
    });
  }
  function openSettings(CONFIG, ctx) {
    const modal = document.getElementById("aw-settings-modal");
    if (!modal) return;
    const thresholdSlider = document.getElementById("setting-energy-threshold");
    const thresholdNum = document.getElementById("setting-energy-threshold-num");
    if (thresholdSlider) thresholdSlider.value = CONFIG.energyThreshold;
    if (thresholdNum) thresholdNum.value = CONFIG.energyThreshold;
    const quietCb = document.getElementById("setting-quiet-mode");
    if (quietCb) quietCb.checked = Boolean(CONFIG.quietModeEnabled);
    const dashCb = document.getElementById("setting-panel-dashboard-only");
    if (dashCb) dashCb.checked = Boolean(CONFIG.panelDashboardOnly);
    const leaderCb = document.getElementById("setting-panel-leader-only");
    if (leaderCb) leaderCb.checked = Boolean(CONFIG.panelLeaderOnly);
    const followCb = document.getElementById("setting-follow-viewport");
    if (followCb) followCb.checked = Boolean(CONFIG.panelFollowViewport);
    const returnCb = document.getElementById("setting-return-original");
    if (returnCb) returnCb.checked = Boolean(CONFIG.panelReturnToOriginal);
    const soundCb = document.getElementById("setting-sound-notification-enabled");
    if (soundCb) soundCb.checked = Boolean(CONFIG.soundNotificationEnabled);
    const soundVolSlider = document.getElementById("setting-sound-notification-volume");
    const soundVolNum = document.getElementById("setting-sound-notification-volume-num");
    if (soundVolSlider) soundVolSlider.value = Math.round(CONFIG.soundNotificationVolume * 100);
    if (soundVolNum) soundVolNum.value = Math.round(CONFIG.soundNotificationVolume * 100);
    const fullSoundCb = document.getElementById("setting-energy-full-sound-enabled");
    if (fullSoundCb) fullSoundCb.checked = Boolean(CONFIG.energyFullAlertSoundEnabled);
    const fullVolSlider = document.getElementById("setting-energy-full-volume");
    const fullVolNum = document.getElementById("setting-energy-full-volume-num");
    if (fullVolSlider) fullVolSlider.value = Math.round(CONFIG.energyFullAlertVolume * 100);
    if (fullVolNum) fullVolNum.value = Math.round(CONFIG.energyFullAlertVolume * 100);
    const notifCb = document.getElementById("setting-notifications");
    if (notifCb) notifCb.checked = Boolean(CONFIG.sendNotification);
    const fullAlertCb = document.getElementById("setting-energy-full-alert");
    if (fullAlertCb) fullAlertCb.checked = Boolean(CONFIG.energyFullAlertEnabled);
    const stealthCb = document.getElementById("setting-stealth-jitter");
    if (stealthCb) stealthCb.checked = Boolean(CONFIG.stealthJitterEnabled);
    const sleepCb = document.getElementById("setting-sleep-schedule");
    if (sleepCb) sleepCb.checked = Boolean(CONFIG.sleepScheduleEnabled);
    const sleepStartSel = document.getElementById("setting-sleep-start");
    if (sleepStartSel) sleepStartSel.value = String(CONFIG.sleepStartHour ?? 1);
    const sleepEndSel = document.getElementById("setting-sleep-end");
    if (sleepEndSel) sleepEndSel.value = String(CONFIG.sleepEndHour ?? 6);
    ["showHide", "workNow", "pauseResume", "openLog", "openSettings"].forEach((actionId) => {
      const inp = document.getElementById(`shortcut-${actionId}`);
      if (inp && CONFIG.shortcuts[actionId]) {
        inp.value = CONFIG.shortcuts[actionId].display || "";
        inp.style.color = "#00d4ff";
      }
    });
    const statusEl = document.getElementById("aw-settings-status");
    if (statusEl) statusEl.style.display = "none";
    modal.style.display = "flex";
    if (ctx?.state) ctx.state.settingsOpen = true;
    const activeTab = modal.querySelector(".aw-tab-btn.active");
    if (activeTab) {
      setTimeout(() => activeTab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" }), 60);
    }
    if (modal.recordHandler) {
      document.removeEventListener("keydown", modal.recordHandler, true);
      document.addEventListener("keydown", modal.recordHandler, true);
    }
    if (modal.handleEscapeKey) {
      document.removeEventListener("keydown", modal.handleEscapeKey);
      document.addEventListener("keydown", modal.handleEscapeKey);
    }
  }
  function ensureLogViewerStyles() {
    if (document.getElementById("aw-log-styles")) return;
    const style = document.createElement("style");
    style.id = "aw-log-styles";
    style.textContent = `
        #aw-log-modal {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #e2e8f0;
        }

        /* Filter Pills */
        .aw-log-filter-pill {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 11px;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.07);
            border-radius: 8px;
            color: #8b9bb4;
            font-size: 11.5px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            user-select: none;
            white-space: nowrap;
        }
        .aw-log-filter-pill:hover {
            color: #ffffff;
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(255, 255, 255, 0.14);
        }
        .aw-log-filter-pill.active {
            color: #00ff88;
            background: linear-gradient(135deg, rgba(0, 255, 136, 0.14), rgba(0, 180, 216, 0.09));
            border-color: rgba(0, 255, 136, 0.5);
            font-weight: 600;
            box-shadow: 0 2px 10px rgba(0, 255, 136, 0.15);
        }
        .aw-log-filter-count {
            font-size: 10px;
            font-weight: 700;
            padding: 1px 6px;
            border-radius: 10px;
            background: rgba(255, 255, 255, 0.08);
            color: #94a3b8;
            transition: all 0.2s;
        }
        .aw-log-filter-pill.active .aw-log-filter-count {
            background: rgba(0, 255, 136, 0.2);
            color: #00ff88;
        }

        /* Type Badges */
        .aw-log-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.3px;
            white-space: nowrap;
            flex-shrink: 0;
        }
        .aw-log-badge-success {
            background: rgba(0, 255, 136, 0.12);
            color: #00ff88;
            border: 1px solid rgba(0, 255, 136, 0.25);
        }
        .aw-log-badge-warn {
            background: rgba(255, 209, 102, 0.12);
            color: #ffd166;
            border: 1px solid rgba(255, 209, 102, 0.25);
        }
        .aw-log-badge-error {
            background: rgba(255, 107, 107, 0.12);
            color: #ff6b6b;
            border: 1px solid rgba(255, 107, 107, 0.25);
        }
        .aw-log-badge-info {
            background: rgba(0, 212, 255, 0.12);
            color: #00d4ff;
            border: 1px solid rgba(0, 212, 255, 0.25);
        }

        /* Log Row */
        .aw-log-row {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            padding: 8px 10px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.04);
            border-radius: 6px;
            transition: background 0.15s;
            position: relative;
        }
        .aw-log-row:hover {
            background: rgba(255, 255, 255, 0.04);
        }
        .aw-log-row:last-child {
            border-bottom: none;
        }
        .aw-log-time {
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 11px;
            color: #64748b;
            white-space: nowrap;
            padding-top: 1px;
            flex-shrink: 0;
        }
        .aw-log-msg {
            flex: 1;
            font-size: 12px;
            line-height: 1.45;
            word-break: break-word;
            color: #cbd5e1;
        }
        .aw-log-copy-btn {
            opacity: 0;
            transition: opacity 0.15s, background 0.15s;
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.12);
            color: #94a3b8;
            border-radius: 4px;
            padding: 2px 7px;
            font-size: 10px;
            cursor: pointer;
            margin-left: auto;
            flex-shrink: 0;
        }
        .aw-log-row:hover .aw-log-copy-btn {
            opacity: 1;
        }
        .aw-log-copy-btn:hover {
            background: rgba(0, 255, 136, 0.15);
            color: #00ff88;
            border-color: rgba(0, 255, 136, 0.4);
        }

        /* Custom Scrollbars */
        #aw-log-entries::-webkit-scrollbar {
            width: 6px;
        }
        #aw-log-entries::-webkit-scrollbar-track {
            background: transparent;
        }
        #aw-log-entries::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.14);
            border-radius: 4px;
        }
        #aw-log-entries::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.28);
        }

        .aw-log-pills-container::-webkit-scrollbar {
            display: none;
        }
    `;
    document.head.appendChild(style);
  }
  function createLogViewer(state, CONFIG) {
    ensureLogViewerStyles();
    const old = document.getElementById("aw-log-modal");
    if (old) old.remove();
    const modal = document.createElement("div");
    modal.id = "aw-log-modal";
    modal.style.cssText = `
        display: none;
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(4, 7, 14, 0.78);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        z-index: 100003;
        justify-content: center;
        align-items: center;
    `;
    modal.innerHTML = `
        <div style="
            background: linear-gradient(180deg, #131724 0%, #0d101a 100%);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 16px;
            width: 95%;
            max-width: 680px;
            height: 620px;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 60px rgba(0,0,0,0.8), 0 0 1px 1px rgba(255,255,255,0.05);
            overflow: hidden;
        ">
            <!-- Modal Header -->
            <div style="
                padding: 16px 20px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: linear-gradient(135deg, rgba(26, 33, 54, 0.8) 0%, rgba(18, 22, 36, 0.95) 100%);
            ">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="
                        width: 32px; height: 32px; border-radius: 8px;
                        background: linear-gradient(135deg, rgba(56, 189, 248, 0.15), rgba(2, 132, 199, 0.2));
                        border: 1px solid rgba(56, 189, 248, 0.3);
                        display: flex; align-items: center; justify-content: center;
                        color: #38bdf8;
                    ">${ICONS.fileText}</div>
                    <div>
                        <div style="font-weight: 700; color: #fff; font-size: 14.5px; letter-spacing: 0.3px;">Activity Log</div>
                        <div style="font-size: 11px; color: #8b9bb4;">Riwayat aktivitas & status kerja bot secara real-time</div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button id="aw-copy-all-log" style="
                        background: rgba(255, 255, 255, 0.05); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.12);
                        padding: 6px 12px; border-radius: 8px; cursor: pointer;
                        font-size: 11.5px; font-weight: 600; transition: all 0.15s;
                        display: inline-flex; align-items: center; gap: 5px;
                    "><span style="display:flex;align-items:center;">${ICONS.copy}</span> Salin Log</button>
                    <button id="aw-clear-log" style="
                        background: rgba(255, 255, 255, 0.05); color: #ff6b6b; border: 1px solid rgba(255, 107, 107, 0.25);
                        padding: 6px 12px; border-radius: 8px; cursor: pointer;
                        font-size: 11.5px; font-weight: 600; transition: all 0.15s;
                        display: inline-flex; align-items: center; gap: 5px;
                    "><span style="display:flex;align-items:center;">${ICONS.trash}</span> Bersihkan</button>
                    <button id="aw-close-log" style="
                        background: rgba(255, 255, 255, 0.05); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.12);
                        padding: 6px 12px; border-radius: 8px; cursor: pointer;
                        font-size: 12px; font-weight: 600; transition: all 0.15s;
                    ">Tutup</button>
                </div>
            </div>

            <!-- Toolbar: Filter Pills & Search Input -->
            <div style="
                padding: 10px 18px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.06);
                background: rgba(12, 16, 26, 0.6);
                display: flex;
                gap: 12px;
                align-items: center;
                flex-wrap: wrap;
            ">
                <!-- Category Filter Pills -->
                <div class="aw-log-pills-container" style="display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none;">
                    <button type="button" class="aw-log-filter-pill active" data-type="all">
                        Semua <span class="aw-log-filter-count" id="aw-count-all">0</span>
                    </button>
                    <button type="button" class="aw-log-filter-pill" data-type="success">
                        <span style="width:6px;height:6px;border-radius:50%;background:#00ff88;display:inline-block;"></span> Sukses <span class="aw-log-filter-count" id="aw-count-success">0</span>
                    </button>
                    <button type="button" class="aw-log-filter-pill" data-type="warn">
                        <span style="width:6px;height:6px;border-radius:50%;background:#ffd166;display:inline-block;"></span> Peringatan <span class="aw-log-filter-count" id="aw-count-warn">0</span>
                    </button>
                    <button type="button" class="aw-log-filter-pill" data-type="error">
                        <span style="width:6px;height:6px;border-radius:50%;background:#ff6b6b;display:inline-block;"></span> Error <span class="aw-log-filter-count" id="aw-count-error">0</span>
                    </button>
                    <button type="button" class="aw-log-filter-pill" data-type="info">
                        <span style="width:6px;height:6px;border-radius:50%;background:#38bdf8;display:inline-block;"></span> Info <span class="aw-log-filter-count" id="aw-count-info">0</span>
                    </button>
                </div>

                <!-- Hidden select for backward compatibility -->
                <select id="aw-log-filter-type" style="display: none;">
                    <option value="all">Semua</option>
                    <option value="success">Success</option>
                    <option value="warn">Warn</option>
                    <option value="error">Error</option>
                    <option value="info">Info</option>
                </select>

                <!-- Search Input -->
                <div style="flex: 1; min-width: 170px; position: relative; display: flex; align-items: center;">
                    <span style="position: absolute; left: 10px; color: #64748b; pointer-events: none; display: flex; align-items: center;">${ICONS.search}</span>
                    <input id="aw-log-filter-text" type="text" placeholder="Cari aktivitas (shift, energi, buff)..." style="
                        width: 100%; box-sizing: border-box;
                        background: #141826; color: #fff;
                        border: 1px solid #28334e; border-radius: 8px;
                        padding: 6px 12px 6px 30px; font-size: 11.5px;
                        outline: none; transition: border-color 0.2s;
                    ">
                </div>
            </div>

            <!-- Scrollable Log Entries -->
            <div id="aw-log-entries" style="
                flex: 1;
                overflow-y: auto;
                padding: 12px 18px;
                overscroll-behavior: contain;
                background: rgba(8, 11, 18, 0.4);
            "></div>

            <!-- Sticky Modal Footer -->
            <div style="
                padding: 10px 18px;
                border-top: 1px solid rgba(255, 255, 255, 0.08);
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: linear-gradient(135deg, #131724 0%, #0d101a 100%);
                font-size: 11.5px;
                color: #8b9bb4;
            ">
                <div id="aw-log-status" style="display: flex; align-items: center; gap: 8px;">
                    <span style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #00ff88; box-shadow: 0 0 8px #00ff88;"></span>
                    <span id="aw-log-summary">Stream aktif • 0 riwayat tersimpan</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button id="aw-export-log-btn" style="
                        background: rgba(255, 255, 255, 0.05); color: #94a3b8; border: 1px solid rgba(255, 255, 255, 0.1);
                        padding: 5px 12px; border-radius: 6px; cursor: pointer;
                        font-size: 11px; font-weight: 500; transition: all 0.15s;
                    ">Ekspor .txt</button>
                    <button id="aw-close-log-footer" style="
                        background: transparent; color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.12);
                        padding: 5px 14px; border-radius: 6px; cursor: pointer;
                        font-size: 11px; font-weight: 600;
                    ">Tutup</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    function closeLog() {
      modal.style.display = "none";
    }
    document.getElementById("aw-close-log")?.addEventListener("click", closeLog);
    document.getElementById("aw-close-log-footer")?.addEventListener("click", closeLog);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeLog();
    });
    let filterType = "all", filterText = "";
    const filterPills = modal.querySelectorAll(".aw-log-filter-pill");
    const hiddenSelect = document.getElementById("aw-log-filter-type");
    filterPills.forEach((pill) => {
      pill.addEventListener("click", () => {
        filterPills.forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        filterType = pill.dataset.type || "all";
        if (hiddenSelect) hiddenSelect.value = filterType;
        renderLogs(state, filterType, filterText);
      });
    });
    hiddenSelect?.addEventListener("change", (e) => {
      filterType = e.target.value;
      filterPills.forEach((p) => p.classList.toggle("active", p.dataset.type === filterType));
      renderLogs(state, filterType, filterText);
    });
    document.getElementById("aw-log-filter-text")?.addEventListener("input", (e) => {
      filterText = e.target.value.toLowerCase();
      renderLogs(state, filterType, filterText);
    });
    document.getElementById("aw-clear-log")?.addEventListener("click", () => {
      if (!confirm("Yakin ingin membersihkan semua riwayat Activity Log?")) return;
      state.logs = [];
      clearStoredLogs$1();
      renderLogs(state, filterType, filterText);
    });
    document.getElementById("aw-copy-all-log")?.addEventListener("click", () => {
      if (!state.logs || state.logs.length === 0) return;
      const textToCopy = state.logs.map((e) => `[${e.time}] [${e.type.toUpperCase()}] ${e.message}`).join("\n");
      navigator.clipboard.writeText(textToCopy).then(() => {
        const btn = document.getElementById("aw-copy-all-log");
        if (btn) {
          const orig = btn.innerHTML;
          btn.innerHTML = `<span style="display:inline-flex;align-items:center;gap:4px;color:#00ff88;">${ICONS.check} Tersalin</span>`;
          setTimeout(() => {
            btn.innerHTML = orig;
          }, 1500);
        }
      }).catch(() => {
      });
    });
    document.getElementById("aw-export-log-btn")?.addEventListener("click", () => {
      if (!state.logs || state.logs.length === 0) {
        alert("Tidak ada riwayat log untuk diekspor.");
        return;
      }
      const textContent = [
        `=== PARLAMENTUM AUTO WORKER ACTIVITY LOG ===`,
        `Diekspor pada: ${(/* @__PURE__ */ new Date()).toLocaleString("id-ID")}`,
        `Total log: ${state.logs.length}`,
        `============================================
`,
        ...state.logs.map((e) => `[${e.time}] [${e.type.toUpperCase()}] ${e.message}`)
      ].join("\n");
      const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const dateStr = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      a.download = `parlementum-log-${dateStr}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }
  function openLogViewer(state, CONFIG) {
    const modal = document.getElementById("aw-log-modal");
    if (!modal) return;
    modal.style.display = "flex";
    updateLogViewer(state);
  }
  function updateLogViewer(state, CONFIG) {
    if (document.getElementById("aw-log-modal")?.style.display !== "flex") return;
    const filterType = document.getElementById("aw-log-filter-type")?.value || "all";
    const filterText = (document.getElementById("aw-log-filter-text")?.value || "").toLowerCase();
    renderLogs(state, filterType, filterText);
  }
  function renderLogs(state, filterType, filterText) {
    const container = document.getElementById("aw-log-entries");
    if (!container) return;
    const allLogs = state.logs || [];
    const countAll = allLogs.length;
    let countSuccess = 0, countWarn = 0, countError = 0, countInfo = 0;
    allLogs.forEach((l) => {
      if (l.type === "success") countSuccess++;
      else if (l.type === "warn") countWarn++;
      else if (l.type === "error") countError++;
      else if (l.type === "info") countInfo++;
    });
    const elAll = document.getElementById("aw-count-all");
    const elSuccess = document.getElementById("aw-count-success");
    const elWarn = document.getElementById("aw-count-warn");
    const elError = document.getElementById("aw-count-error");
    const elInfo = document.getElementById("aw-count-info");
    if (elAll) elAll.textContent = countAll;
    if (elSuccess) elSuccess.textContent = countSuccess;
    if (elWarn) elWarn.textContent = countWarn;
    if (elError) elError.textContent = countError;
    if (elInfo) elInfo.textContent = countInfo;
    const filtered = allLogs.filter(
      (e) => (filterType === "all" || e.type === filterType) && (!filterText || e.message.toLowerCase().includes(filterText))
    );
    const summaryEl = document.getElementById("aw-log-summary");
    if (summaryEl) {
      summaryEl.textContent = `Menampilkan ${filtered.length} dari ${countAll} riwayat log`;
    }
    if (filtered.length === 0) {
      container.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #64748b; padding: 40px 20px; text-align: center;">
                <span style="color: #475569; margin-bottom: 12px; display: flex; transform: scale(1.6);">${ICONS.fileText}</span>
                <span style="font-size: 13.5px; font-weight: 600; color: #94a3b8; margin-bottom: 4px;">Tidak ada riwayat aktivitas</span>
                <span style="font-size: 11.5px; color: #64748b;">${countAll === 0 ? "Belum ada aktivitas yang dicatat." : "Tidak ada log yang cocok dengan filter atau kata kunci."}</span>
            </div>
        `;
      return;
    }
    const BADGE_CONFIG = {
      success: { text: "SUKSES", cls: "aw-log-badge-success", dot: "#00ff88" },
      warn: { text: "WARN", cls: "aw-log-badge-warn", dot: "#ffd166" },
      error: { text: "ERROR", cls: "aw-log-badge-error", dot: "#ff6b6b" },
      info: { text: "INFO", cls: "aw-log-badge-info", dot: "#38bdf8" }
    };
    container.replaceChildren(...filtered.map((entry) => {
      const row = document.createElement("div");
      row.className = "aw-log-row";
      const time = document.createElement("span");
      time.className = "aw-log-time";
      time.textContent = entry.time || "--:--:--";
      const badge = document.createElement("span");
      const bConf = BADGE_CONFIG[entry.type] || BADGE_CONFIG.info;
      badge.className = `aw-log-badge ${bConf.cls}`;
      badge.innerHTML = `<span style="width:5px;height:5px;border-radius:50%;background:${bConf.dot};display:inline-block;margin-right:4px;"></span>${bConf.text}`;
      const msg = document.createElement("span");
      msg.className = "aw-log-msg";
      msg.textContent = entry.message;
      const copyBtn = document.createElement("button");
      copyBtn.className = "aw-log-copy-btn";
      copyBtn.textContent = "Salin";
      copyBtn.title = "Salin baris log ini";
      copyBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(`[${entry.time}] ${entry.message}`).then(() => {
          copyBtn.textContent = "Tersalin";
          copyBtn.style.color = "#00ff88";
          setTimeout(() => {
            copyBtn.textContent = "Salin";
            copyBtn.style.color = "#94a3b8";
          }, 1200);
        }).catch(() => {
        });
      });
      row.append(time, badge, msg, copyBtn);
      return row;
    }));
  }
  const MSG_SOURCE = "PARLAMENTUM_INTERCEPTOR";
  const EXT_SOURCE = "PARLAMENTUM_EXTENSION";
  function initInterceptorClient(state, CONFIG, ctx) {
    if (state._interceptorClientInitialized) return;
    state._interceptorClientInitialized = true;
    window.addEventListener("message", (event) => {
      if (!event || event.source !== window) return;
      const msg = event.data;
      if (!msg || msg.source !== MSG_SOURCE) return;
      switch (msg.type) {
        case "READY":
        case "PONG":
          state.interceptorActive = true;
          break;
        case "AUTH_TOKEN":
          if (msg.token && typeof msg.token === "string" && msg.token !== state.currentToken) {
            if (ctx?.handleNewToken) {
              ctx.handleNewToken(msg.token, "network_interceptor");
            }
          }
          break;
        case "ENERGY_SYNC":
          _handleEnergySync(state, msg, ctx);
          break;
        case "WORK_SUCCESS":
          _handleWorkSuccess(state, msg, ctx);
          break;
        case "WORK_REJECTED":
          _handleWorkRejected(state, msg, ctx);
          break;
      }
    });
    try {
      window.postMessage({ source: EXT_SOURCE, action: "PING" }, "*");
    } catch {
    }
    setTimeout(() => {
      if (!state.interceptorActive && chrome.runtime?.getURL) {
        try {
          const script = document.createElement("script");
          script.src = chrome.runtime.getURL("interceptor.js");
          script.async = false;
          (document.head || document.documentElement).appendChild(script);
          script.onload = () => script.remove();
        } catch {
        }
      }
    }, 350);
  }
  function _handleEnergySync(state, msg, ctx) {
    const curRaw = msg.currentEnergy;
    const maxRaw = msg.maxEnergy;
    let updated = false;
    if (typeof curRaw === "number" && Number.isFinite(curRaw)) {
      const cur = Math.max(0, Math.round(curRaw));
      state.currentEnergy = cur;
      updated = true;
    }
    if (typeof maxRaw === "number" && Number.isFinite(maxRaw) && maxRaw > 0) {
      state.maxEnergy = Math.round(maxRaw);
      updated = true;
    }
    if (updated) {
      state.energySyncBase = {
        current: state.currentEnergy,
        max: state.maxEnergy || 110,
        updatedAt: Date.now()
      };
      ctx?.updatePanel?.();
    }
  }
  function _handleWorkSuccess(state, msg, ctx) {
    const rawUsed = Number(msg.energyUsed) || Number(msg.raw?.energyUsed) || 0;
    const used = rawUsed >= 10 ? rawUsed : 10;
    const calculatedXp = Math.max(4, Math.floor(used / 10) * 4);
    const xp = Number(msg.xpEarned) > 0 ? Number(msg.xpEarned) : calculatedXp;
    const units = Number(msg.workerUnits) || Number(msg.produced) || Number(msg.raw?.workerUnits) || Number(msg.raw?.produced) || 0;
    if (state.workInFlight && !state.workTriggeredViaDom) {
      return;
    }
    const wasDomTriggered = Boolean(state.workTriggeredViaDom);
    state.workTriggeredViaDom = false;
    state.workInFlight = false;
    if (msg.remainingEnergy != null && typeof msg.remainingEnergy === "number") {
      state.currentEnergy = Math.max(0, Math.round(msg.remainingEnergy));
    } else {
      state.currentEnergy = Math.max(0, (state.currentEnergy || 0) - used);
    }
    state.energySyncBase = {
      current: state.currentEnergy,
      max: state.maxEnergy || 110,
      updatedAt: Date.now()
    };
    const nowStr = (/* @__PURE__ */ new Date()).toLocaleTimeString("id-ID");
    state.workToday = (state.workToday || 0) + 1;
    state.totalWorked = (state.totalWorked || 0) + 1;
    state.xpToday = (state.xpToday || 0) + xp;
    state.totalWorkXP = (state.totalWorkXP || 0) + xp;
    state.lastWorkTime = nowStr;
    state.lastWorkTimestamp = Date.now();
    if (ctx?.getNextWorkDelay) {
      state.nextWorkTimestamp = Date.now() + ctx.getNextWorkDelay(state);
    }
    ctx?.setValue?.("workToday", state.workToday);
    ctx?.setValue?.("totalWorked", state.totalWorked);
    ctx?.setValue?.("xpToday", state.xpToday);
    ctx?.setValue?.("totalWorkXP", state.totalWorkXP);
    const unitsPart = units > 0 ? ` | +${units} unit` : "";
    const logMsg = wasDomTriggered ? `Kerja sukses! +${xp} XP${unitsPart} | Sisa: ${state.currentEnergy}/${state.maxEnergy} EN` : `Shift di game terdeteksi: +${xp} XP${unitsPart} | Sisa: ${state.currentEnergy} EN`;
    ctx?.log?.(logMsg, "success");
    ctx?.updatePanel?.();
    setTimeout(() => {
      const fresh = ctx?.getCurrentEnergy?.();
      if (fresh && fresh.current !== state.currentEnergy) {
        state.currentEnergy = fresh.current;
        state.maxEnergy = fresh.max;
        state.energySyncBase = { current: fresh.current, max: fresh.max, updatedAt: Date.now() };
        ctx?.updatePanel?.();
      }
    }, 600);
  }
  function _handleWorkRejected(state, msg, ctx) {
    const errorMsg = String(msg.message || msg.raw?.message || "");
    if (/not enough energy|energi tidak cukup|kurang/i.test(errorMsg)) {
      state.currentEnergy = 0;
      state.energySyncBase = {
        current: 0,
        max: state.maxEnergy || 110,
        updatedAt: Date.now()
      };
      patchPageVisualEnergy(0, state.maxEnergy, true);
      ctx?.updatePanel?.();
    }
  }
  (async function bootstrap() {
    await initStorage();
    const CONFIG = loadConfig();
    const todayStr = (/* @__PURE__ */ new Date()).toDateString();
    const savedStartDay = getValue("sessionStartDay", "");
    let savedStartTime = getStoredInteger("sessionStartTime", Date.now(), 1);
    if (savedStartDay !== todayStr) {
      savedStartTime = Date.now();
      setValue("sessionStartTime", savedStartTime.toString());
      setValue("sessionStartDay", todayStr);
    }
    const hasUncertainWorkResult = getValue("aw_workResultUncertain", "false") === "true";
    let uncertainEnergyBefore = null;
    try {
      const raw = getValue("aw_uncertainEnergyBefore", "");
      uncertainEnergyBefore = raw ? JSON.parse(raw) : null;
    } catch {
    }
    const state = createInitialState(CONFIG, savedStartTime, hasUncertainWorkResult);
    let workHistory = loadWorkHistory(state, CONFIG);
    _runMigrations(state);
    const log$1 = (msg, type, toLog) => log(state, CONFIG, msg, type, toLog);
    const handleNewToken$1 = (raw, src) => handleNewToken(state, log$1, () => wakePendingWork?.(), raw, src, () => setRunningUI(true), () => updatePanel$1());
    const getTokenFn = () => getTokenFromStorage(state, handleNewToken$1);
    const ctx = {
      state,
      CONFIG,
      get workHistory() {
        return workHistory;
      },
      set workHistory(val) {
        workHistory = val;
      },
      log: log$1,
      handleNewToken: handleNewToken$1,
      setRunningUI: (running) => setRunningUI(running),
      sendNotification: (arg1, arg2, arg3) => sendNotification(arg1 === CONFIG ? arg2 : arg1, arg1 === CONFIG ? arg3 : arg2),
      playNotificationSound: (arg1, arg2) => playNotificationSound(arg1, arg2),
      playEnergyFullAlarm: (cfg) => playEnergyFullAlarm(cfg || CONFIG),
      updatePanel: () => updatePanel$1(),
      updatePanelVisibility: (cfg) => updatePanelVisibility(state, cfg || CONFIG),
      wakePendingWork: () => wakePendingWork?.(),
      setValue,
      get uncertainEnergyBefore() {
        return uncertainEnergyBefore;
      },
      set uncertainEnergyBefore(val) {
        uncertainEnergyBefore = val;
      },
      reconcileUncertainWork,
      // Energy helpers expected by panel.js
      getSyncedEnergy: (st) => getSyncedEnergy(st),
      getPlayerLevel: (st) => getPlayerLevel(st),
      getMaxEnergyForLevel: (lvl) => getMaxEnergyForLevel(lvl),
      getLiveCountdown: (st) => getLiveCountdown(st, CONFIG),
      getTimeToFullEnergy: (st) => getTimeToFullEnergy(st),
      getNextWorkDelay: (st) => getNextWorkDelay(st, CONFIG),
      getRegionDetails: (force = false) => getRegionDetails(force),
      // Action helpers expected by panel.js
      doWork: (manual = false) => doWork(ctx, manual),
      openSettings: () => openSettings(CONFIG, ctx),
      openLogViewer: () => openLogViewer(state),
      saveConfig: (cfg) => saveConfig(cfg),
      reloadStateFromStorage: () => reloadStateFromStorage(state, () => {
        workHistory = loadWorkHistory(state, CONFIG);
      }),
      patchPageVisualEnergy: (cur, max, force) => patchPageVisualEnergy(cur, max, force)
    };
    initInterceptorClient(state, CONFIG, ctx);
    setLogUpdateCallback(() => updateLogViewer(state));
    function updatePanel$1() {
      updatePanel(state, CONFIG, workHistory, ctx);
    }
    function checkDailyReset() {
      if (!chrome.runtime?.id) return;
      const today = (/* @__PURE__ */ new Date()).toDateString();
      if (state.lastWorkDate === today) return;
      state.workToday = 0;
      state.xpToday = 0;
      state.lastWorkDate = today;
      state.sessionStartTime = Date.now();
      setValue("sessionStartTime", state.sessionStartTime.toString());
      setValue("sessionStartDay", today);
      if (!workHistory[today]) workHistory[today] = { shifts: 0, xp: 0 };
      setValue("workToday", "0");
      setValue("xpToday", "0");
      setValue("lastWorkDate", today);
      saveWorkHistory(workHistory);
      log$1("Hari berganti. Counter & sesi di-reset.", "info");
      updatePanel$1();
    }
    function reconcileUncertainWork() {
      if (!chrome.runtime?.id) return;
      if (!state.workResultUncertain || !uncertainEnergyBefore) return;
      const curr = getCurrentEnergy$1();
      if (!curr) return;
      if (curr.current < uncertainEnergyBefore.current) {
        if (state.uncertainReconciliation !== "energy_changed") {
          state.uncertainReconciliation = "energy_changed";
          log$1(`Perubahan energi terdeteksi (${uncertainEnergyBefore.current} → ${curr.current}). Shift mungkin diproses.`, "warn");
        }
      } else if (state.uncertainReconciliation === "energy_changed") {
        state.uncertainReconciliation = "pending";
      }
      updatePanel$1();
    }
    ctx.reconcileUncertainWork = reconcileUncertainWork;
    let wakePendingWork = null;
    let pendingWorkTimer = null;
    let bgTimerWorker = null;
    try {
      const blob = new Blob([`
            let t = null;
            self.onmessage = e => {
                if (t !== null) clearTimeout(t);
                t = setTimeout(() => self.postMessage('wake'), Math.max(10, e.data));
            };
        `], { type: "application/javascript" });
      bgTimerWorker = new Worker(URL.createObjectURL(blob));
    } catch {
      bgTimerWorker = null;
    }
    function waitForScheduledWork(delay) {
      return new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          if (pendingWorkTimer !== null) clearTimeout(pendingWorkTimer);
          pendingWorkTimer = null;
          wakePendingWork = null;
          if (bgTimerWorker) bgTimerWorker.onmessage = null;
          resolve();
        };
        wakePendingWork = finish;
        if (bgTimerWorker) {
          bgTimerWorker.onmessage = finish;
          bgTimerWorker.postMessage(Math.max(10, delay));
        }
        pendingWorkTimer = setTimeout(finish, delay);
      });
    }
    ctx.wakePendingWork = () => wakePendingWork?.();
    const isAuthRoute = (path = window.location.pathname) => /^\/(login|register|signup|forgot-password|reset-password)/i.test(path);
    if (isAuthRoute()) {
      console.log(`[Auto Worker] Halaman autentikasi terdeteksi (${window.location.pathname}). Isolasi aktif: DOM tidak dimodifikasi agar form login tetap utuh.`);
      setupLoginCapture(log$1);
      tryAutoLogin(CONFIG, log$1, sendNotification);
      _watchSpaNavigation(() => {
        if (!isAuthRoute()) {
          console.log(`[Auto Worker] Navigasi ke halaman game terdeteksi (${window.location.pathname}). Memuat lingkungan game...`);
          window.location.reload();
        }
      });
      return;
    }
    state.tabLockManaged = Boolean(navigator?.locks?.request);
    state.isTabLockOwner = !state.tabLockManaged;
    _logStartup(log$1, CONFIG, state);
    getTokenFn();
    createPanel(state, CONFIG, ctx);
    const cachedLogs = getValue("aw_recent_logs");
    if (Array.isArray(cachedLogs)) {
      state.logs = [...cachedLogs];
    }
    createLogViewer(state);
    createSettingsModal(CONFIG, ctx);
    startTokenWatcher(state, handleNewToken$1, getTokenFn);
    _watchSpaNavigation(() => {
      if (isAuthRoute()) {
        console.log(`[Auto Worker] Logout / Navigasi ke auth page terdeteksi (${window.location.pathname}). Mengalihkan ke mode isolasi...`);
        window.location.reload();
      }
      state.userManuallyToggledPanel = false;
      const path = window.location.pathname || "";
      const isDash = path === "/dashboard" || path.startsWith("/dashboard/") || path === "/" || path === "";
      if (CONFIG.panelDashboardOnly && isDash) {
        state.panelVisible = true;
        setValue("panelVisible", "true");
      }
      getRegionDetails(true);
      updatePanelVisibility(state, CONFIG);
    });
    document.addEventListener("click", (e) => {
      const btn = e.target?.closest?.("button");
      if (!btn) return;
      const txt = (btn.textContent || "").trim();
      if (/KERJAKAN\s+SATU\s+GILIRAN/i.test(txt)) {
        if (state.currentEnergy != null && state.currentEnergy < 10) {
          e.preventDefault();
          e.stopPropagation();
          log$1(`Energi saat ini ${state.currentEnergy}/${state.maxEnergy} EN (butuh minimal 10 EN). Menunggu energi pulih.`, "warn");
          showInPageNotification(`Energi belum cukup (${state.currentEnergy}/${state.maxEnergy} EN). Butuh minimal 10 EN untuk giliran kerja.`, "warn");
        }
      }
    }, true);
    const cachedLive = getValue("aw_live_status");
    if (cachedLive && cachedLive.currentEnergy != null) {
      const maxE = cachedLive.maxEnergy || state.maxEnergy || 110;
      state.maxEnergy = maxE;
      state.currentEnergy = Math.min(maxE, cachedLive.currentEnergy);
      state.energySyncBase = { current: state.currentEnergy, max: maxE, updatedAt: cachedLive.updatedAt || Date.now() };
    }
    waitForEnergyElement(15e3).then((energy) => {
      if (energy) {
        state.currentEnergy = energy.current;
        state.maxEnergy = energy.max;
        state.domEnergyStale = false;
        state.lastWorkTimestamp = 0;
        state.energySyncBase = { current: energy.current, max: energy.max, updatedAt: Date.now() };
        const regDetails = getRegionDetails(true);
        const healthBuff = regDetails.bonusMultiplier || 1;
        state.regenRate = healthBuff;
        state.regionHealthBonusPercent = regDetails.bonusPercent || 0;
        if (state.regionHealthBonusPercent > 0 || healthBuff > 1) {
          const bonusPct = state.regionHealthBonusPercent || Math.round((healthBuff - 1) * 100);
          log$1(`Buff Kota: Kesehatan +${bonusPct}% pemulihan energi pasif (${healthBuff}x / mnt)`, "info");
        }
        log$1(`Energi terbaca: ${energy.current}/${energy.max}`, "info");
        saveLiveStatus(state, CONFIG);
        updatePanel$1();
      } else {
        log$1("Elemen energi tidak ditemukan dalam 15 detik. Energi akan terbaca saat panel update.", "warn");
      }
    });
    setInterval(() => {
      if (state.running) _checkAndRefreshToken(state, CONFIG, log$1, ctx);
    }, Math.min(CONFIG.tokenRefreshInterval, 6e4));
    setInterval(checkDailyReset, 6e4);
    setInterval(updatePanel$1, 1e3);
    setInterval(reconcileUncertainWork, 1e4);
    try {
      chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg?.type === "POPUP_COMMAND") {
          if (msg.action === "toggleRunning") {
            const newRunning = msg.value != null ? Boolean(msg.value) : !state.running;
            state.running = newRunning;
            setRunningUI(newRunning);
            updatePanel$1();
            saveLiveStatus(state, CONFIG, true);
            log$1(`Auto Worker ${newRunning ? "dilanjutkan" : "dijeda"} via Popup toolbar.`, "info");
            if (newRunning) wakePendingWork?.();
            sendResponse({ ok: true, running: state.running });
            return true;
          }
          if (msg.action === "workNow") {
            log$1("Manual work dipicu via Popup toolbar.", "info");
            if (state.tokenExpired || state.pausedForToken || !state.currentToken) {
              sendResponse({ ok: false, error: "token_expired" });
              return true;
            }
            doWork(ctx, true).then((result) => {
              saveLiveStatus(state, CONFIG, true);
              updatePanel$1();
              if (result === "worked") {
                sendResponse({ ok: true, isLockOwner: state.isTabLockOwner, result });
              } else if (result === "paused" && (state.pausedForToken || state.tokenExpired)) {
                sendResponse({ ok: false, error: "token_expired" });
              } else if (result === "waiting" && state.currentEnergy < 10) {
                sendResponse({ ok: false, error: "insufficient_energy" });
              } else {
                sendResponse({ ok: false, error: result || "work_failed" });
              }
            }).catch((err) => {
              sendResponse({ ok: false, error: err.message });
            });
            return true;
          }
          if (msg.action === "getStatus") {
            const synced = getSyncedEnergy(state);
            if (synced) {
              state.currentEnergy = synced.current;
              state.maxEnergy = synced.max;
            }
            sendResponse({ ok: true, status: saveLiveStatus(state, CONFIG, true) });
            return true;
          }
          if (msg.action === "getLogs") {
            sendResponse({ ok: true, logs: state.logs || [] });
            return true;
          }
          if (msg.action === "clearLogs") {
            state.logs = [];
            clearStoredLogs();
            updateLogViewer(state, CONFIG);
            sendResponse({ ok: true });
            return true;
          }
        }
        if (msg?.type === "STORAGE_SYNC" && msg.action === "backgroundWorkDone") {
          if (msg.energy != null) {
            state.currentEnergy = msg.energy;
            state.postShiftEnergy = msg.energy;
            state.lastWorkTimestamp = Date.now();
            state.domEnergyStale = true;
            state.energySyncBase = {
              current: msg.energy,
              max: msg.maxEnergy || state.maxEnergy || 110,
              updatedAt: Date.now()
            };
          }
          if (msg.status) {
            if (msg.status.workToday != null) state.workToday = msg.status.workToday;
            if (msg.status.xpToday != null) state.xpToday = msg.status.xpToday;
            if (msg.status.totalWorked != null) state.totalWorked = msg.status.totalWorked;
            if (msg.status.totalWorkXP != null) state.totalWorkXP = msg.status.totalWorkXP;
            if (msg.status.lastWorkTime) state.lastWorkTime = msg.status.lastWorkTime;
            if (msg.status.nextWorkTimestamp != null) state.nextWorkTimestamp = msg.status.nextWorkTimestamp;
          }
          state.workInFlight = false;
          state.workResultUncertain = false;
          state.energyFullAlertActive = false;
          updatePanel$1();
          sendResponse({ ok: true });
          return true;
        }
        if (msg?.type === "EXECUTE_WORK_NOW") {
          (async () => {
            try {
              if (!state.running && !msg.manual) {
                sendResponse({ ok: false, result: "paused" });
                return;
              }
              if (state.workInFlight) {
                if (Date.now() - (state.workInFlightAt || 0) > 15e3) {
                  state.workInFlight = false;
                } else {
                  sendResponse({ ok: false, result: "busy" });
                  return;
                }
              }
              if (state.tokenExpired || state.pausedForToken || !state.currentToken) {
                sendResponse({ ok: false, result: "token_expired" });
                return;
              }
              if (state.tabLockManaged && !state.isTabLockOwner) {
                sendResponse({ ok: false, result: "standby" });
                return;
              }
              const synced = getSyncedEnergy(state);
              if (synced) {
                state.currentEnergy = synced.current;
                state.maxEnergy = synced.max;
              }
              if (!msg.manual && state.currentEnergy < CONFIG.energyThreshold) {
                sendResponse({ ok: true, result: "waiting", energy: state.currentEnergy });
                return;
              }
              log$1("Trigger background: Menjalankan shift kerja otomatis...", "info");
              const result = await doWork(ctx, Boolean(msg.manual));
              saveLiveStatus(state, CONFIG, true);
              updatePanel$1();
              sendResponse({
                ok: result === "worked",
                result,
                energy: state.currentEnergy,
                isLockOwner: Boolean(state.isTabLockOwner)
              });
            } catch (err) {
              sendResponse({ ok: false, error: err?.message || String(err) });
            }
          })();
          return true;
        }
        if (msg?.type === "WAKE_WORKER") {
          (async () => {
            try {
              const latestLive = getValue("aw_live_status");
              if (latestLive) {
                if (latestLive.lastWorkTimestamp && latestLive.lastWorkTimestamp > (state.lastWorkTimestamp || 0)) {
                  state.lastWorkTimestamp = latestLive.lastWorkTimestamp;
                  state.currentEnergy = latestLive.currentEnergy;
                  state.postShiftEnergy = latestLive.currentEnergy;
                  state.domEnergyStale = true;
                  state.energySyncBase = {
                    current: latestLive.currentEnergy,
                    max: latestLive.maxEnergy || state.maxEnergy || 115,
                    updatedAt: latestLive.updatedAt || latestLive.lastWorkTimestamp
                  };
                }
                if (latestLive.nextWorkTimestamp) state.nextWorkTimestamp = latestLive.nextWorkTimestamp;
                if (latestLive.workToday != null) state.workToday = latestLive.workToday;
                if (latestLive.xpToday != null) state.xpToday = latestLive.xpToday;
                if (latestLive.totalWorked != null) state.totalWorked = latestLive.totalWorked;
                if (latestLive.totalWorkXP != null) state.totalWorkXP = latestLive.totalWorkXP;
              }
              if (state.running) {
                const energy = getSyncedEnergy(state);
                if (energy) {
                  state.currentEnergy = energy.current;
                  state.maxEnergy = energy.max;
                }
                const isCooldownActive = state.nextWorkTimestamp && Date.now() < state.nextWorkTimestamp - 5e3;
                const hasRecentWork = state.lastWorkTimestamp && Date.now() - state.lastWorkTimestamp < 45e3;
                if (state.isTabLockOwner && state.currentEnergy >= CONFIG.energyThreshold && !isCooldownActive && !hasRecentWork && !state.workInFlight && !state.workResultUncertain) {
                  log$1("Background wake: Energi target tercapai, mengeksekusi shift kerja...", "info");
                  const result = await doWork({ ...ctx }, false);
                  saveLiveStatus(state, CONFIG);
                  updatePanel$1();
                  sendResponse({
                    handled: true,
                    isLockOwner: true,
                    energy: state.currentEnergy,
                    worked: result === "worked",
                    result
                  });
                  return;
                }
              }
              updatePanel$1();
              saveLiveStatus(state, CONFIG);
              sendResponse({
                handled: true,
                isLockOwner: Boolean(state.isTabLockOwner),
                energy: state.currentEnergy,
                worked: false
              });
            } catch (err) {
              sendResponse({ handled: false, error: err?.message });
            }
          })();
          return true;
        }
      });
    } catch {
    }
    onStorageChanged((key, newValue) => {
      if (key === "aw_live_status" && newValue) {
        const isBackgroundShift = Boolean(
          newValue.lastWorkTime && newValue.lastWorkTime !== state.lastWorkTime && (newValue.totalWorked || 0) > (state.totalWorked || 0)
        );
        if (!state.isTabLockOwner || isBackgroundShift) {
          if (newValue.workToday != null) state.workToday = newValue.workToday;
          if (newValue.xpToday != null) state.xpToday = newValue.xpToday;
          if (newValue.totalWorked != null) state.totalWorked = newValue.totalWorked;
          if (newValue.totalWorkXP != null) state.totalWorkXP = newValue.totalWorkXP;
          if (newValue.lastWorkTime) state.lastWorkTime = newValue.lastWorkTime;
          if (newValue.nextWorkTimestamp != null) state.nextWorkTimestamp = newValue.nextWorkTimestamp;
          if (isBackgroundShift && newValue.currentEnergy != null) {
            state.currentEnergy = newValue.currentEnergy;
            state.lastWorkTimestamp = newValue.updatedAt || Date.now();
            state.domEnergyStale = true;
            state.energySyncBase = {
              current: newValue.currentEnergy,
              max: newValue.maxEnergy || state.maxEnergy || 110,
              updatedAt: newValue.updatedAt || Date.now()
            };
          }
          if (newValue.maxEnergy != null) state.maxEnergy = newValue.maxEnergy;
        }
        updatePanel$1();
      }
      if (key === "aw_config" && newValue) {
        try {
          Object.assign(CONFIG, typeof newValue === "string" ? JSON.parse(newValue) : newValue);
          updatePanel$1();
        } catch {
        }
      }
      if (key === "aw_recent_logs") {
        state.logs = Array.isArray(newValue) ? [...newValue] : [];
        updateLogViewer(state);
      }
    });
    document.addEventListener("visibilitychange", _handleForegroundReturn);
    window.addEventListener("focus", _handleForegroundReturn);
    function _handleForegroundReturn() {
      if (!chrome.runtime?.id) return;
      if (document.visibilityState === "hidden") return;
      state.lastForegroundReturnTime = Date.now();
      updatePanelVisibility(state, CONFIG);
      patchPageVisualEnergy(state.currentEnergy, state.maxEnergy, true);
      saveLiveStatus(state, CONFIG);
      chrome.storage.local.get(["aw_live_status"], (data) => {
        const live = data?.aw_live_status;
        if (live) {
          const isNewerShift = Boolean(
            live.lastWorkTime && live.lastWorkTime !== state.lastWorkTime && (live.totalWorked || 0) > (state.totalWorked || 0)
          );
          if (isNewerShift) {
            if (live.currentEnergy != null) {
              state.currentEnergy = live.currentEnergy;
              state.lastWorkTimestamp = live.updatedAt || Date.now();
              state.domEnergyStale = true;
              state.energySyncBase = {
                current: live.currentEnergy,
                max: live.maxEnergy || state.maxEnergy || 110,
                updatedAt: live.updatedAt || Date.now()
              };
            }
            if (live.workToday != null) state.workToday = live.workToday;
            if (live.xpToday != null) state.xpToday = live.xpToday;
            if (live.totalWorked != null) state.totalWorked = live.totalWorked;
            if (live.totalWorkXP != null) state.totalWorkXP = live.totalWorkXP;
            if (live.lastWorkTime) state.lastWorkTime = live.lastWorkTime;
            if (live.nextWorkTimestamp != null) state.nextWorkTimestamp = live.nextWorkTimestamp;
          }
        }
        reloadStateFromStorage(state, () => {
          workHistory = loadWorkHistory(state, CONFIG);
        });
        const synced = getSyncedEnergy(state);
        if (synced) {
          state.currentEnergy = synced.current;
          state.maxEnergy = synced.max;
          if (state.domEnergyStale) {
            patchPageVisualEnergy(synced.current, synced.max, true);
          }
        }
        updatePanel$1();
        updatePanelVisibility(state, CONFIG);
        if (state.running && state.isTabLockOwner && state.currentEnergy >= CONFIG.energyThreshold) {
          wakePendingWork?.();
        }
      });
    }
    async function runWorkerLoop() {
      let errCount = 0;
      while (true) {
        try {
          if (!chrome.runtime?.id) {
            console.warn("[Auto Worker] Ekstensi telah di-reload. Loop dihentikan bersih. Silakan refresh tab game (F5).");
            return;
          }
          checkDailyReset();
          if (state.running) {
            const result = await doWork(ctx);
            if (result === "retrySoon") {
              await waitForScheduledWork(5e3);
            } else if (result === "retry") {
              errCount++;
              const backoff = Math.min(3e5, 1e4 * Math.pow(2, errCount - 1));
              log$1(`⏳ Retry dalam ${(backoff / 1e3).toFixed(0)}s (percobaan ke-${errCount})...`, "warn");
              await waitForScheduledWork(backoff);
            } else if (result === "waiting" || result === "worked") {
              errCount = 0;
              const delay = Math.max(1e3, state.nextWorkTimestamp - Date.now());
              await waitForScheduledWork(delay);
            } else {
              await waitForScheduledWork(1e4);
            }
          } else {
            await waitForScheduledWork(1e4);
          }
        } catch (error) {
          if (error?.message?.includes("Extension context invalidated") || !chrome.runtime?.id) {
            console.warn("[Auto Worker] Ekstensi telah di-reload. Loop dihentikan bersih.");
            return;
          }
          console.error("[MainLoop]", error);
          log$1(`Main loop error: ${error.message}`, "error");
          errCount++;
          const backoff = Math.min(3e5, 1e4 * Math.pow(2, errCount - 1));
          await waitForScheduledWork(backoff);
        }
      }
    }
    if (!state.tabLockManaged) {
      log$1("Web Locks tidak tersedia; perlindungan multi-tab tidak aktif.", "warn");
      await runWorkerLoop();
      return;
    }
    _setTabLockOwner(state, false, ctx);
    while (true) {
      let acquired = false;
      try {
        await navigator.locks.request("parlamentum-auto-worker", { ifAvailable: true }, async (lock) => {
          if (!lock) return;
          acquired = true;
          reloadStateFromStorage(state, () => {
            workHistory = loadWorkHistory(state, CONFIG);
          });
          if (getValue("aw_workResultUncertain", "false") === "true") {
            state.workResultUncertain = true;
            state.running = false;
            updatePanel$1();
          }
          _setTabLockOwner(state, true, ctx);
          state.waitedForTabLock = false;
          await runWorkerLoop();
        });
      } catch (error) {
        log$1(`Web Locks gagal: ${error.message}. Worker dijeda.`, "error");
        state.running = false;
        _setTabLockOwner(state, false, ctx);
        return;
      }
      if (!acquired) {
        state.waitedForTabLock = true;
        _setTabLockOwner(state, false, ctx);
        await new Promise((r) => setTimeout(r, 5e3));
      }
    }
  })();
  function _runMigrations(state, CONFIG, workHistory) {
    const version = getStoredInteger("aw_energySchemaVersion", 1, 1, 2);
    if (version >= 2) return;
    if (state.totalWorkXP < state.totalWorked * 3 && state.totalWorked > 0) {
      state.totalWorkXP = state.totalWorked * 10 / 10 * 4;
      setValue("totalWorkXP", state.totalWorkXP.toString());
    }
    if (state.totalEnergySpent < state.totalWorked * 5 && state.totalWorked > 0) {
      state.totalEnergySpent = state.totalWorked * 10;
      setValue("totalEnergySpent", state.totalEnergySpent.toString());
      console.log("[Init] Estimasi energi masa lalu diterapkan (migrasi sekali jalan).");
    }
    setValue("aw_energySchemaVersion", "2");
  }
  function _checkAndRefreshToken(state, CONFIG, log2, ctx = null) {
    if (!chrome.runtime?.id) return;
    if (!state.currentToken) return;
    if (!state.tokenExpiry) return;
    const remaining = state.tokenExpiry - Date.now();
    if (remaining <= 0) {
      if (!state.pausedForToken) {
        log2("Token sesi kedaluwarsa. Me-reload tab otomatis untuk memperbarui token...", "warn");
        state.pausedForToken = true;
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      }
      return;
    }
    if (remaining < CONFIG.tokenExpiryThreshold) {
      log2(`Token akan expired dalam ${Math.round(remaining / 1e3)} detik!`, "warn");
      log2("Token tidak auto-refresh. Login ulang jika expired.", "warn");
    }
  }
  function _setTabLockOwner(state, isOwner, ctx) {
    state.isTabLockOwner = isOwner;
    if (ctx?.CONFIG) {
      updatePanelVisibility(state, ctx.CONFIG);
    }
    ctx.updatePanel?.();
  }
  function _logStartup(log2, CONFIG, state) {
    const uptime = Math.floor((Date.now() - state.scriptStartTime) / 1e3);
    log2("Auto Worker v5.11.0 (Network Interceptor) aktif.", "success");
    log2(`Energy Threshold: ${CONFIG.energyThreshold} EN`, "info");
    log2(`History: simpan ${CONFIG.historyMaxDays} hari terakhir`, "info");
    log2(`Quiet mode: ${CONFIG.quietModeEnabled ? "ON" : "OFF"}`, "info");
    log2(`Shortcuts: ${Object.values(CONFIG.shortcuts).map((s) => s.display).join(", ")}`, "info");
    log2(`Script uptime: ${uptime}s`, "info");
  }
  function _watchSpaNavigation(onRouteChanged) {
    let lastPath = window.location.pathname;
    const check = () => {
      if (window.location.pathname !== lastPath) {
        lastPath = window.location.pathname;
        onRouteChanged?.();
      }
    };
    try {
      const origPushState = history.pushState;
      history.pushState = function(...args) {
        origPushState.apply(this, args);
        check();
      };
      const origReplaceState = history.replaceState;
      history.replaceState = function(...args) {
        origReplaceState.apply(this, args);
        check();
      };
    } catch {
    }
    window.addEventListener("popstate", check);
    setInterval(check, 1e3);
  }
})();
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGVudC5qcyIsInNvdXJjZXMiOlsiLi4vc3JjL3N0b3JhZ2UuanMiLCIuLi9zcmMvY29uZmlnLmpzIiwiLi4vc3JjL3N0YXRlLmpzIiwiLi4vc3JjL2hpc3RvcnkuanMiLCIuLi9zcmMvbG9nZ2VyLmpzIiwiLi4vc3JjL3Rva2VuLmpzIiwiLi4vc3JjL2VuZXJneS5qcyIsIi4uL3NyYy9ub3RpZmljYXRpb25zLmpzIiwiLi4vc3JjL2F1dG9sb2dpbi5qcyIsIi4uL3NyYy93b3JrLmpzIiwiLi4vc3JjL3VpL2ljb25zLmpzIiwiLi4vc3JjL3VpL3BhbmVsLmpzIiwiLi4vc3JjL3VpL3NldHRpbmdzLmpzIiwiLi4vc3JjL3VpL2xvZ3ZpZXdlci5qcyIsIi4uL3NyYy9pbnRlcmNlcHRvci1jbGllbnQuanMiLCIuLi9zcmMvbWFpbi5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIHN0b3JhZ2UuanMg4oCUIENocm9tZSBzdG9yYWdlIHdyYXBwZXIgd2l0aCBzeW5jaHJvbm91cyBjYWNoZVxuICpcbiAqIFJlcGxhY2VzIGFsbCBHTV9nZXRWYWx1ZSAvIEdNX3NldFZhbHVlIGNhbGxzLlxuICogT24gaW5pdCwgbG9hZHMgYWxsIGRhdGEgaW50byBfY2FjaGUgc28gdGhlIHJlc3Qgb2YgdGhlIGNvZGViYXNlXG4gKiBjYW4gY2FsbCBnZXRWYWx1ZS9zZXRWYWx1ZSBzeW5jaHJvbm91c2x5IChzYW1lIEFQSSBhcyBHTV8pLlxuICogV3JpdGVzIGFyZSBhc3luYyBmaXJlLWFuZC1mb3JnZXQgdG8gY2hyb21lLnN0b3JhZ2UubG9jYWwuXG4gKi9cblxuY29uc3QgX2NhY2hlID0ge307XG5cbi8qKlxuICogTXVzdCBiZSBhd2FpdGVkIG9uY2UgYXQgc3RhcnR1cCBiZWZvcmUgYW55dGhpbmcgcmVhZHMgc3RvcmFnZS5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGluaXRTdG9yYWdlKCkge1xuICAgIGNvbnN0IGRhdGEgPSBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQobnVsbCk7XG4gICAgT2JqZWN0LmFzc2lnbihfY2FjaGUsIGRhdGEpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0VmFsdWUoa2V5LCBkZWZhdWx0VmFsID0gbnVsbCkge1xuICAgIHJldHVybiBrZXkgaW4gX2NhY2hlID8gX2NhY2hlW2tleV0gOiBkZWZhdWx0VmFsO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2V0VmFsdWUoa2V5LCB2YWx1ZSkge1xuICAgIF9jYWNoZVtrZXldID0gdmFsdWU7XG4gICAgaWYgKCFjaHJvbWUucnVudGltZT8uaWQpIHJldHVybjtcbiAgICB0cnkge1xuICAgICAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBba2V5XTogdmFsdWUgfSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgIGlmIChlcnI/Lm1lc3NhZ2U/LmluY2x1ZGVzKCdFeHRlbnNpb24gY29udGV4dCBpbnZhbGlkYXRlZCcpKSByZXR1cm47XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdbU3RvcmFnZV0gc2V0VmFsdWUgZmFpbGVkOicsIGtleSwgZXJyKTtcbiAgICAgICAgfSk7XG4gICAgfSBjYXRjaCB7IC8qIGNvbnRleHQgaW52YWxpZGF0ZWQgKi8gfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlVmFsdWUoa2V5KSB7XG4gICAgZGVsZXRlIF9jYWNoZVtrZXldO1xuICAgIGlmICghY2hyb21lLnJ1bnRpbWU/LmlkKSByZXR1cm47XG4gICAgdHJ5IHtcbiAgICAgICAgY2hyb21lLnN0b3JhZ2UubG9jYWwucmVtb3ZlKGtleSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgIGlmIChlcnI/Lm1lc3NhZ2U/LmluY2x1ZGVzKCdFeHRlbnNpb24gY29udGV4dCBpbnZhbGlkYXRlZCcpKSByZXR1cm47XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdbU3RvcmFnZV0gcmVtb3ZlVmFsdWUgZmFpbGVkOicsIGtleSwgZXJyKTtcbiAgICAgICAgfSk7XG4gICAgfSBjYXRjaCB7IC8qIGNvbnRleHQgaW52YWxpZGF0ZWQgKi8gfVxufVxuXG4vKipcbiAqIExpc3RlbiBmb3Igc3RvcmFnZSBjaGFuZ2VzIGZyb20gb3RoZXIgdGFicyBvciB0aGUgYmFja2dyb3VuZCBzZXJ2aWNlIHdvcmtlci5cbiAqIGNhbGxiYWNrKGtleSwgbmV3VmFsdWUpIOKAlCBuZXdWYWx1ZSBpcyB1bmRlZmluZWQgaWYga2V5IHdhcyBkZWxldGVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gb25TdG9yYWdlQ2hhbmdlZChjYWxsYmFjaykge1xuICAgIGNocm9tZS5zdG9yYWdlLm9uQ2hhbmdlZC5hZGRMaXN0ZW5lcigoY2hhbmdlcywgYXJlYSkgPT4ge1xuICAgICAgICBpZiAoYXJlYSAhPT0gJ2xvY2FsJykgcmV0dXJuO1xuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHsgbmV3VmFsdWUgfV0gb2YgT2JqZWN0LmVudHJpZXMoY2hhbmdlcykpIHtcbiAgICAgICAgICAgIGlmIChuZXdWYWx1ZSAhPT0gdW5kZWZpbmVkKSBfY2FjaGVba2V5XSA9IG5ld1ZhbHVlO1xuICAgICAgICAgICAgZWxzZSBkZWxldGUgX2NhY2hlW2tleV07XG4gICAgICAgICAgICBjYWxsYmFjayhrZXksIG5ld1ZhbHVlKTtcbiAgICAgICAgfVxuICAgIH0pO1xufVxuIiwiLyoqXG4gKiBjb25maWcuanMg4oCUIEV4dGVuc2lvbiBjb25maWd1cmF0aW9uIHdpdGggdmFsaWRhdGlvblxuICovXG5cbmltcG9ydCB7IGdldFZhbHVlLCBzZXRWYWx1ZSB9IGZyb20gJy4vc3RvcmFnZS5qcyc7XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX0NPTkZJRyA9IHtcbiAgICBzZW5kTm90aWZpY2F0aW9uOiB0cnVlLFxuICAgIHRva2VuUmVmcmVzaEludGVydmFsOiAzNjAwMDAwLFxuICAgIHRva2VuRXhwaXJ5VGhyZXNob2xkOiAzMDAwMDAsXG4gICAgcGFuZWxEZWZhdWx0WDogMTAsXG4gICAgcGFuZWxEZWZhdWx0WTogMTAsXG4gICAgc291bmROb3RpZmljYXRpb25FbmFibGVkOiB0cnVlLFxuICAgIHNvdW5kTm90aWZpY2F0aW9uVm9sdW1lOiAwLjMsXG4gICAgZW5lcmd5RnVsbEFsZXJ0U291bmRFbmFibGVkOiB0cnVlLFxuICAgIGVuZXJneUZ1bGxBbGVydFZvbHVtZTogMC4zLFxuICAgIHBhbmVsUGlubmVkOiBmYWxzZSxcbiAgICBwYW5lbEZvbGxvd1ZpZXdwb3J0OiB0cnVlLFxuICAgIHBhbmVsUmV0dXJuVG9PcmlnaW5hbDogZmFsc2UsXG4gICAgcGFuZWxEYXNoYm9hcmRPbmx5OiB0cnVlLFxuICAgIHBhbmVsTGVhZGVyT25seTogdHJ1ZSxcbiAgICBtYXhMb2dFbnRyaWVzOiAyMDAsXG4gICAgcXVpZXRNb2RlRW5hYmxlZDogdHJ1ZSxcbiAgICBxdWlldE1vZGVJbnRlcnZhbDogMTIwMDAwLFxuICAgIGVuZXJneVRocmVzaG9sZDogMTAsXG4gICAgZW5lcmd5RnVsbEFsZXJ0RW5hYmxlZDogdHJ1ZSxcbiAgICBoaXN0b3J5TWF4RGF5czogMzAsXG4gICAgc3RlYWx0aEppdHRlckVuYWJsZWQ6IHRydWUsXG4gICAgc2xlZXBTY2hlZHVsZUVuYWJsZWQ6IGZhbHNlLFxuICAgIHNsZWVwU3RhcnRIb3VyOiAxLFxuICAgIHNsZWVwRW5kSG91cjogNixcbiAgICBhdXRvUmVsb2dpbkVuYWJsZWQ6IGZhbHNlLFxuICAgIGVjb01vZGVFbmFibGVkOiB0cnVlLFxuICAgIHNob3J0Y3V0czoge1xuICAgICAgICBzaG93SGlkZTogICAgIHsga2V5czogWydDb250cm9sJywgJ1NoaWZ0JywgJ0tleUEnXSwgZGlzcGxheTogJ0N0cmwrU2hpZnQrQScgfSxcbiAgICAgICAgd29ya05vdzogICAgICB7IGtleXM6IFsnQWx0JywgJ1NoaWZ0JywgJ0tleVcnXSwgICAgZGlzcGxheTogJ0FsdCtTaGlmdCtXJyB9LFxuICAgICAgICBwYXVzZVJlc3VtZTogIHsga2V5czogWydBbHQnLCAnU2hpZnQnLCAnS2V5UCddLCAgICBkaXNwbGF5OiAnQWx0K1NoaWZ0K1AnIH0sXG4gICAgICAgIG9wZW5Mb2c6ICAgICAgeyBrZXlzOiBbJ0NvbnRyb2wnLCAnU2hpZnQnLCAnS2V5TCddLCBkaXNwbGF5OiAnQ3RybCtTaGlmdCtMJyB9LFxuICAgICAgICBvcGVuU2V0dGluZ3M6IHsga2V5czogWydDb250cm9sJywgJ1NoaWZ0JywgJ0tleVMnXSwgZGlzcGxheTogJ0N0cmwrU2hpZnQrUycgfVxuICAgIH1cbn07XG5cbmNvbnN0IE5VTUVSSUNfQk9VTkRTID0ge1xuICAgIHRva2VuUmVmcmVzaEludGVydmFsOiAgICAgIFsxMDAwLCA4NjQwMDAwMF0sXG4gICAgdG9rZW5FeHBpcnlUaHJlc2hvbGQ6ICAgICAgWzAsICAgIDg2NDAwMDAwXSxcbiAgICBwYW5lbERlZmF1bHRYOiAgICAgICAgICAgICBbMCwgICAgMTAwMDBdLFxuICAgIHBhbmVsRGVmYXVsdFk6ICAgICAgICAgICAgIFswLCAgICAxMDAwMF0sXG4gICAgc291bmROb3RpZmljYXRpb25Wb2x1bWU6ICAgWzAsICAgIDFdLFxuICAgIGVuZXJneUZ1bGxBbGVydFZvbHVtZTogICAgIFswLCAgICAxXSxcbiAgICBtYXhMb2dFbnRyaWVzOiAgICAgICAgICAgICBbMSwgICAgMTAwMF0sXG4gICAgcXVpZXRNb2RlSW50ZXJ2YWw6ICAgICAgICAgWzEwMDAsIDg2NDAwMDAwXSxcbiAgICBlbmVyZ3lUaHJlc2hvbGQ6ICAgICAgICAgICBbMTAsICAgMTAwXSxcbiAgICBoaXN0b3J5TWF4RGF5czogICAgICAgICAgICBbMSwgICAgMzY1XSxcbiAgICBzbGVlcFN0YXJ0SG91cjogICAgICAgICAgICBbMCwgICAgMjNdLFxuICAgIHNsZWVwRW5kSG91cjogICAgICAgICAgICAgIFswLCAgICAyM11cbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1BsYWluT2JqZWN0KHZhbHVlKSB7XG4gICAgcmV0dXJuIHZhbHVlICE9PSBudWxsICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgIUFycmF5LmlzQXJyYXkodmFsdWUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplQ29uZmlnKGNhbmRpZGF0ZSwgc3RyaWN0ID0gZmFsc2UpIHtcbiAgICBpZiAoIWlzUGxhaW5PYmplY3QoY2FuZGlkYXRlKSkge1xuICAgICAgICByZXR1cm4gc3RyaWN0ID8gbnVsbCA6IHsgLi4uREVGQVVMVF9DT05GSUcsIHNob3J0Y3V0czogeyAuLi5ERUZBVUxUX0NPTkZJRy5zaG9ydGN1dHMgfSB9O1xuICAgIH1cblxuICAgIGNvbnN0IGNvbmZpZyA9IHsgLi4uREVGQVVMVF9DT05GSUcsIHNob3J0Y3V0czogeyAuLi5ERUZBVUxUX0NPTkZJRy5zaG9ydGN1dHMgfSB9O1xuXG4gICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoY2FuZGlkYXRlKSkge1xuICAgICAgICBpZiAoa2V5ID09PSAnc2hvcnRjdXRzJyB8fCB2YWx1ZSA9PT0gdW5kZWZpbmVkKSBjb250aW51ZTtcblxuICAgICAgICBpZiAodHlwZW9mIERFRkFVTFRfQ09ORklHW2tleV0gPT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSBjb25maWdba2V5XSA9IHZhbHVlO1xuICAgICAgICAgICAgZWxzZSBpZiAoc3RyaWN0KSByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgYm91bmRzID0gTlVNRVJJQ19CT1VORFNba2V5XTtcbiAgICAgICAgaWYgKGJvdW5kcykge1xuICAgICAgICAgICAgY29uc3QgdmFsaWQgPSB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInICYmIE51bWJlci5pc0Zpbml0ZSh2YWx1ZSlcbiAgICAgICAgICAgICAgICAmJiB2YWx1ZSA+PSBib3VuZHNbMF0gJiYgdmFsdWUgPD0gYm91bmRzWzFdO1xuICAgICAgICAgICAgaWYgKHZhbGlkKSBjb25maWdba2V5XSA9IHZhbHVlO1xuICAgICAgICAgICAgZWxzZSBpZiAoc3RyaWN0KSByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChjYW5kaWRhdGUuc2hvcnRjdXRzICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgaWYgKCFpc1BsYWluT2JqZWN0KGNhbmRpZGF0ZS5zaG9ydGN1dHMpKSB7XG4gICAgICAgICAgICBpZiAoc3RyaWN0KSByZXR1cm4gbnVsbDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgW2FjdGlvbiwgc2hvcnRjdXRdIG9mIE9iamVjdC5lbnRyaWVzKGNhbmRpZGF0ZS5zaG9ydGN1dHMpKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoREVGQVVMVF9DT05GSUcuc2hvcnRjdXRzLCBhY3Rpb24pKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICBjb25zdCB2YWxpZCA9IGlzUGxhaW5PYmplY3Qoc2hvcnRjdXQpXG4gICAgICAgICAgICAgICAgICAgICYmIEFycmF5LmlzQXJyYXkoc2hvcnRjdXQua2V5cylcbiAgICAgICAgICAgICAgICAgICAgJiYgc2hvcnRjdXQua2V5cy5sZW5ndGggPj0gMSAmJiBzaG9ydGN1dC5rZXlzLmxlbmd0aCA8PSAzXG4gICAgICAgICAgICAgICAgICAgICYmIHNob3J0Y3V0LmtleXMuZXZlcnkoayA9PiB0eXBlb2YgayA9PT0gJ3N0cmluZycgJiYgL15bQS1aYS16XVtBLVphLXowLTldKiQvLnRlc3QoaykpXG4gICAgICAgICAgICAgICAgICAgICYmIHR5cGVvZiBzaG9ydGN1dC5kaXNwbGF5ID09PSAnc3RyaW5nJyAmJiAvXltBLVphLXowLTkrIF17MSw2NH0kLy50ZXN0KHNob3J0Y3V0LmRpc3BsYXkpO1xuICAgICAgICAgICAgICAgIGlmICh2YWxpZCkgY29uZmlnLnNob3J0Y3V0c1thY3Rpb25dID0geyBrZXlzOiBbLi4uc2hvcnRjdXQua2V5c10sIGRpc3BsYXk6IHNob3J0Y3V0LmRpc3BsYXkgfTtcbiAgICAgICAgICAgICAgICBlbHNlIGlmIChzdHJpY3QpIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGNvbmZpZztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxvYWRDb25maWcoKSB7XG4gICAgY29uc3Qgc2F2ZWQgPSBnZXRWYWx1ZSgnYXdfY29uZmlnJywgbnVsbCk7XG4gICAgaWYgKCFzYXZlZCkgcmV0dXJuIG5vcm1hbGl6ZUNvbmZpZyhERUZBVUxUX0NPTkZJRyk7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcGFyc2VkID0gdHlwZW9mIHNhdmVkID09PSAnc3RyaW5nJyA/IEpTT04ucGFyc2Uoc2F2ZWQpIDogc2F2ZWQ7XG4gICAgICAgIHJldHVybiBub3JtYWxpemVDb25maWcocGFyc2VkKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ1tDb25maWddIEZhaWxlZCB0byBwYXJzZSBjb25maWc6JywgZSk7XG4gICAgICAgIHJldHVybiBub3JtYWxpemVDb25maWcoREVGQVVMVF9DT05GSUcpO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNhdmVDb25maWcoY29uZmlnKSB7XG4gICAgc2V0VmFsdWUoJ2F3X2NvbmZpZycsIGNvbmZpZyk7XG59XG5cbiIsIi8qKlxuICogc3RhdGUuanMg4oCUIENlbnRyYWwgbXV0YWJsZSBhcHBsaWNhdGlvbiBzdGF0ZVxuICpcbiAqIE9uZSBzaW5nbGUgb2JqZWN0LCBpbXBvcnRlZCBieSByZWZlcmVuY2UgZXZlcnl3aGVyZS5cbiAqIEluaXRpYWxpemVkIGluIG1haW4uanMgYWZ0ZXIgc3RvcmFnZSBpcyByZWFkeS5cbiAqL1xuXG5pbXBvcnQgeyBnZXRWYWx1ZSwgc2V0VmFsdWUgfSBmcm9tICcuL3N0b3JhZ2UuanMnO1xuXG4vKiogQHBhcmFtIHtzdHJpbmd9IGtleSBAcGFyYW0ge251bWJlcn0gZmFsbGJhY2sgQHBhcmFtIHtudW1iZXJ9IG1pbiBAcGFyYW0ge251bWJlcn0gbWF4ICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0U3RvcmVkSW50ZWdlcihrZXksIGZhbGxiYWNrLCBtaW4gPSAwLCBtYXggPSBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUikge1xuICAgIGNvbnN0IHJhdyA9IGdldFZhbHVlKGtleSwgZmFsbGJhY2sudG9TdHJpbmcoKSk7XG4gICAgY29uc3QgdmFsdWUgPSBOdW1iZXIocmF3KTtcbiAgICByZXR1cm4gTnVtYmVyLmlzU2FmZUludGVnZXIodmFsdWUpICYmIHZhbHVlID49IG1pbiAmJiB2YWx1ZSA8PSBtYXggPyB2YWx1ZSA6IGZhbGxiYWNrO1xufVxuXG4vKipcbiAqIENyZWF0ZXMgdGhlIGluaXRpYWwgc3RhdGUgZnJvbSBwZXJzaXN0ZWQgc3RvcmFnZSB2YWx1ZXMuXG4gKiBDYWxsIEFGVEVSIGluaXRTdG9yYWdlKCkgYW5kIEFGVEVSIG1pZ3JhdGlvbiBjaGVja3MgaW4gbWFpbi5qcy5cbiAqIEBwYXJhbSB7b2JqZWN0fSBDT05GSUdcbiAqIEBwYXJhbSB7bnVtYmVyfSBzYXZlZFN0YXJ0VGltZVxuICogQHBhcmFtIHtib29sZWFufSBoYXNVbmNlcnRhaW5Xb3JrUmVzdWx0XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVJbml0aWFsU3RhdGUoQ09ORklHLCBzYXZlZFN0YXJ0VGltZSwgaGFzVW5jZXJ0YWluV29ya1Jlc3VsdCkge1xuICAgIHJldHVybiB7XG4gICAgICAgIHJ1bm5pbmc6ICFoYXNVbmNlcnRhaW5Xb3JrUmVzdWx0LFxuICAgICAgICB0b3RhbFdvcmtlZDogICAgZ2V0U3RvcmVkSW50ZWdlcigndG90YWxXb3JrZWQnLCAwKSxcbiAgICAgICAgdG90YWxXb3JrWFA6ICAgIGdldFN0b3JlZEludGVnZXIoJ3RvdGFsV29ya1hQJywgMCksXG4gICAgICAgIHdvcmtUb2RheTogICAgICBnZXRTdG9yZWRJbnRlZ2VyKCd3b3JrVG9kYXknLCAwKSxcbiAgICAgICAgeHBUb2RheTogICAgICAgIGdldFN0b3JlZEludGVnZXIoJ3hwVG9kYXknLCAwKSxcbiAgICAgICAgbGFzdFdvcmtEYXRlOiAgIGdldFZhbHVlKCdsYXN0V29ya0RhdGUnLCBuZXcgRGF0ZSgpLnRvRGF0ZVN0cmluZygpKSxcbiAgICAgICAgbGFzdFdvcmtUaW1lOiAgIGdldFZhbHVlKCdsYXN0V29ya1RpbWUnLCAnQmVsdW0gcGVybmFoJyksXG5cbiAgICAgICAgY3VycmVudFRva2VuOiAgIG51bGwsXG4gICAgICAgIHRva2VuRXhwaXJ5OiAgICBudWxsLFxuICAgICAgICBzdG9yZWRUb2tlblZhbHVlOiAnJyxcbiAgICAgICAgcGF1c2VkRm9yVG9rZW46IGZhbHNlLFxuICAgICAgICB0b2tlbkV4cGlyZWQ6ICAgZmFsc2UsXG5cbiAgICAgICAgY3VycmVudEVuZXJneTogIDAsXG4gICAgICAgIG1heEVuZXJneTogICAgICAxMDAsXG4gICAgICAgIGVuZXJneUZ1bGxBbGVydEFjdGl2ZTogZmFsc2UsXG4gICAgICAgIGVuZXJneVN5bmNCYXNlOiBudWxsLFxuXG4gICAgICAgIHdvcmtJbkZsaWdodDogICBmYWxzZSxcbiAgICAgICAgd29ya1Jlc3VsdFVuY2VydGFpbjogaGFzVW5jZXJ0YWluV29ya1Jlc3VsdCxcbiAgICAgICAgdW5jZXJ0YWluUmVjb25jaWxpYXRpb246IGhhc1VuY2VydGFpbldvcmtSZXN1bHQgPyAncGVuZGluZycgOiAnbm9uZScsXG5cbiAgICAgICAgcGxheWVyTGV2ZWw6ICAgIDEsXG4gICAgICAgIHJlZ2lvbk5hbWU6ICAgICAnJyxcbiAgICAgICAgcmVnaW9uSGVhbHRoQm9udXNQZXJjZW50OiAwLFxuXG4gICAgICAgIHBhbmVsTWluaW1pemVkOiBnZXRWYWx1ZSgncGFuZWxNaW5pbWl6ZWQnLCAnZmFsc2UnKSA9PT0gJ3RydWUnLFxuICAgICAgICBwYW5lbFZpc2libGU6ICAgZ2V0VmFsdWUoJ3BhbmVsVmlzaWJsZScsICd0cnVlJykgPT09ICd0cnVlJyxcbiAgICAgICAgdXNlck1hbnVhbGx5VG9nZ2xlZFBhbmVsOiBmYWxzZSxcbiAgICAgICAgcGFuZWxYOiAgICAgICAgIGdldFN0b3JlZEludGVnZXIoJ3BhbmVsWCcsIENPTkZJRy5wYW5lbERlZmF1bHRYLCAwLCAxMDAwMCksXG4gICAgICAgIHBhbmVsWTogICAgICAgICBnZXRTdG9yZWRJbnRlZ2VyKCdwYW5lbFknLCBDT05GSUcucGFuZWxEZWZhdWx0WSwgMCwgMTAwMDApLFxuICAgICAgICBvcmlnaW5hbFBhbmVsWDogZ2V0U3RvcmVkSW50ZWdlcigncGFuZWxYJywgQ09ORklHLnBhbmVsRGVmYXVsdFgsIDAsIDEwMDAwKSxcbiAgICAgICAgb3JpZ2luYWxQYW5lbFk6IGdldFN0b3JlZEludGVnZXIoJ3BhbmVsWScsIENPTkZJRy5wYW5lbERlZmF1bHRZLCAwLCAxMDAwMCksXG5cbiAgICAgICAgbG9nczogICAgICAgICAgIFtdLFxuICAgICAgICBzZXR0aW5nc09wZW46ICAgZmFsc2UsXG5cbiAgICAgICAgbGFzdExvd0VuZXJneUxvZ1RpbWU6IDAsXG4gICAgICAgIHNjcmlwdFN0YXJ0VGltZTogRGF0ZS5ub3coKSxcbiAgICAgICAgc2Vzc2lvblN0YXJ0VGltZTogc2F2ZWRTdGFydFRpbWUsXG5cbiAgICAgICAgbmV4dFdvcmtUaW1lc3RhbXA6IDAsXG5cbiAgICAgICAgaXNUYWJMb2NrT3duZXI6IGZhbHNlLFxuICAgICAgICB0YWJMb2NrTWFuYWdlZDogZmFsc2UsXG4gICAgICAgIHdhaXRlZEZvclRhYkxvY2s6IGZhbHNlLFxuXG4gICAgICAgIHRvdGFsRW5lcmd5U3BlbnQ6ICAgICAgICAgIGdldFN0b3JlZEludGVnZXIoJ3RvdGFsRW5lcmd5U3BlbnQnLCAwKSxcbiAgICAgICAgdG90YWxBY3R1YWxFbmVyZ3lTcGVudDogICAgZ2V0U3RvcmVkSW50ZWdlcigndG90YWxBY3R1YWxFbmVyZ3lTcGVudCcsIDApLFxuICAgICAgICB0b3RhbEVzdGltYXRlZEVuZXJneVNwZW50OiBnZXRTdG9yZWRJbnRlZ2VyKCd0b3RhbEVzdGltYXRlZEVuZXJneVNwZW50JywgMCksXG4gICAgfTtcbn1cblxuLyoqXG4gKiBCYXRjaC13cml0ZXMgYWxsIGNvdW50ZXIgZmllbGRzIHRvIHN0b3JhZ2UuXG4gKiBAcGFyYW0ge29iamVjdH0gc3RhdGVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNhdmVTdGF0ZShzdGF0ZSkge1xuICAgIGNvbnN0IGVudHJpZXMgPSB7XG4gICAgICAgIHRvdGFsV29ya2VkOiAgICAgICAgICAgICAgIHN0YXRlLnRvdGFsV29ya2VkLnRvU3RyaW5nKCksXG4gICAgICAgIHdvcmtUb2RheTogICAgICAgICAgICAgICAgIHN0YXRlLndvcmtUb2RheS50b1N0cmluZygpLFxuICAgICAgICB0b3RhbFdvcmtYUDogICAgICAgICAgICAgICBzdGF0ZS50b3RhbFdvcmtYUC50b1N0cmluZygpLFxuICAgICAgICB4cFRvZGF5OiAgICAgICAgICAgICAgICAgICBzdGF0ZS54cFRvZGF5LnRvU3RyaW5nKCksXG4gICAgICAgIHRvdGFsRW5lcmd5U3BlbnQ6ICAgICAgICAgIHN0YXRlLnRvdGFsRW5lcmd5U3BlbnQudG9TdHJpbmcoKSxcbiAgICAgICAgdG90YWxBY3R1YWxFbmVyZ3lTcGVudDogICAgc3RhdGUudG90YWxBY3R1YWxFbmVyZ3lTcGVudC50b1N0cmluZygpLFxuICAgICAgICB0b3RhbEVzdGltYXRlZEVuZXJneVNwZW50OiBzdGF0ZS50b3RhbEVzdGltYXRlZEVuZXJneVNwZW50LnRvU3RyaW5nKCksXG4gICAgICAgIGxhc3RXb3JrVGltZTogICAgICAgICAgICAgIHN0YXRlLmxhc3RXb3JrVGltZSxcbiAgICAgICAgbGFzdFdvcmtEYXRlOiAgICAgICAgICAgICAgc3RhdGUubGFzdFdvcmtEYXRlLFxuICAgIH07XG4gICAgZm9yIChjb25zdCBbaywgdl0gb2YgT2JqZWN0LmVudHJpZXMoZW50cmllcykpIHNldFZhbHVlKGssIHYpO1xufVxuXG4vKipcbiAqIFJlbG9hZHMgY291bnRlciBmaWVsZHMgZnJvbSBzdG9yYWdlICh1c2VkIGJ5IHN0YW5kYnkgdGFicykuXG4gKiBAcGFyYW0ge29iamVjdH0gc3RhdGVcbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGxvYWRXb3JrSGlzdG9yeVxuICovXG5sZXQgX2xhc3RMaXZlU3RhdHVzSnNvbiA9ICcnO1xubGV0IF9sYXN0TGl2ZVN0YXR1c0F0ID0gMDtcblxuLyoqXG4gKiBHZW5lcmF0ZXMgbGl2ZSBzdGF0dXMgc3VtbWFyeSBvYmplY3QgcmVwcmVzZW50aW5nIGN1cnJlbnQgZXh0ZW5zaW9uIHN0YXRlLlxuICogQHBhcmFtIHtvYmplY3R9IHN0YXRlXG4gKiBAcGFyYW0ge29iamVjdHxudWxsfSBDT05GSUdcbiAqIEByZXR1cm5zIHtvYmplY3R9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRMaXZlU3RhdHVzU3VtbWFyeShzdGF0ZSwgQ09ORklHID0gbnVsbCkge1xuICAgIGNvbnN0IGxhc3RMb2cgPSBzdGF0ZS5sYXN0TG9nTWVzc2FnZSB8fCAoc3RhdGUubG9ncyAmJiBzdGF0ZS5sb2dzLmxlbmd0aCA+IDAgPyBzdGF0ZS5sb2dzWzBdLm1lc3NhZ2UgOiAnJyk7XG4gICAgY29uc3QgaXNFeHBpcmVkID0gQm9vbGVhbihcbiAgICAgICAgc3RhdGUudG9rZW5FeHBpcmVkIHx8XG4gICAgICAgIHN0YXRlLnBhdXNlZEZvclRva2VuIHx8XG4gICAgICAgICFzdGF0ZS5jdXJyZW50VG9rZW4gfHxcbiAgICAgICAgKHN0YXRlLnRva2VuRXhwaXJ5ICYmIE51bWJlcihzdGF0ZS50b2tlbkV4cGlyeSkgPD0gRGF0ZS5ub3coKSlcbiAgICApO1xuXG4gICAgY29uc3QgdGhyZXNob2xkID0gQ09ORklHPy5lbmVyZ3lUaHJlc2hvbGQgPz8gMTA7XG4gICAgY29uc3QgY3VyRW5lcmd5ID0gc3RhdGUuY3VycmVudEVuZXJneSA/PyAwO1xuICAgIGxldCBuZXh0VGltZXN0YW1wID0gc3RhdGUubmV4dFdvcmtUaW1lc3RhbXAgPz8gMDtcblxuICAgIC8vIE9ubHkgaW5pdGlhbGl6ZSBuZXh0V29ya1RpbWVzdGFtcCBpZiBpdCB3YXMgbmV2ZXIgc2V0ICgwKVxuICAgIGlmICghbmV4dFRpbWVzdGFtcCAmJiBjdXJFbmVyZ3kgPCB0aHJlc2hvbGQpIHtcbiAgICAgICAgY29uc3QgcmF0ZSA9IHN0YXRlLnJlZ2VuUmF0ZSB8fCAxLjA7XG4gICAgICAgIGNvbnN0IG5lZWRlZE1pbnMgPSBNYXRoLm1heCgxLCAodGhyZXNob2xkIC0gY3VyRW5lcmd5KSAvIHJhdGUpO1xuICAgICAgICBuZXh0VGltZXN0YW1wID0gRGF0ZS5ub3coKSArIE1hdGgucm91bmQobmVlZGVkTWlucyAqIDYwMDAwKTtcbiAgICAgICAgc3RhdGUubmV4dFdvcmtUaW1lc3RhbXAgPSBuZXh0VGltZXN0YW1wO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIHJ1bm5pbmc6IEJvb2xlYW4oc3RhdGUucnVubmluZyksXG4gICAgICAgIGN1cnJlbnRFbmVyZ3k6IGN1ckVuZXJneSxcbiAgICAgICAgbWF4RW5lcmd5OiBzdGF0ZS5tYXhFbmVyZ3kgPz8gMTAwLFxuICAgICAgICBuZXh0V29ya1RpbWVzdGFtcDogbmV4dFRpbWVzdGFtcCxcbiAgICAgICAgd29ya1RvZGF5OiBzdGF0ZS53b3JrVG9kYXkgPz8gMCxcbiAgICAgICAgeHBUb2RheTogc3RhdGUueHBUb2RheSA/PyAwLFxuICAgICAgICB0b3RhbFdvcmtlZDogc3RhdGUudG90YWxXb3JrZWQgPz8gMCxcbiAgICAgICAgdG90YWxXb3JrWFA6IHN0YXRlLnRvdGFsV29ya1hQID8/IDAsXG4gICAgICAgIGhhc1Rva2VuOiBCb29sZWFuKHN0YXRlLmN1cnJlbnRUb2tlbiksXG4gICAgICAgIHRva2VuRXhwaXJ5OiBzdGF0ZS50b2tlbkV4cGlyeSA/IG5ldyBEYXRlKHN0YXRlLnRva2VuRXhwaXJ5KS5nZXRUaW1lKCkgOiBudWxsLFxuICAgICAgICB0b2tlbkV4cGlyZWQ6IGlzRXhwaXJlZCxcbiAgICAgICAgcGF1c2VkRm9yVG9rZW46IEJvb2xlYW4oc3RhdGUucGF1c2VkRm9yVG9rZW4pLFxuICAgICAgICBsYXN0V29ya1RpbWU6IHN0YXRlLmxhc3RXb3JrVGltZSB8fCAnQmVsdW0gcGVybmFoJyxcbiAgICAgICAgZW5lcmd5VGhyZXNob2xkOiB0aHJlc2hvbGQsXG4gICAgICAgIHBsYXllckxldmVsOiBzdGF0ZS5wbGF5ZXJMZXZlbCB8fCAxLFxuICAgICAgICByZWdpb25OYW1lOiBzdGF0ZS5yZWdpb25OYW1lIHx8ICcnLFxuICAgICAgICByZWdpb25IZWFsdGhCb251c1BlcmNlbnQ6IHN0YXRlLnJlZ2lvbkhlYWx0aEJvbnVzUGVyY2VudCB8fCAwLFxuICAgICAgICByZWdlblJhdGU6IHN0YXRlLnJlZ2VuUmF0ZSB8fCAxLjAsXG4gICAgICAgIGxhc3RMb2dNZXNzYWdlOiBsYXN0TG9nLFxuICAgICAgICBpc1RhYkxvY2tPd25lcjogQm9vbGVhbihzdGF0ZS5pc1RhYkxvY2tPd25lciksXG4gICAgICAgIHVwZGF0ZWRBdDogRGF0ZS5ub3coKVxuICAgIH07XG59XG5cbi8qKlxuICogU2F2ZXMgbGl2ZSBzdGF0dXMgc3VtbWFyeSBmb3IgcG9wdXAgYW5kIGJhY2tncm91bmQgYmFkZ2UuXG4gKiBBbHdheXMgcmV0dXJucyB0aGUgZnJlc2ggc3VtbWFyeSBvYmplY3QuXG4gKiBAcGFyYW0ge29iamVjdH0gc3RhdGVcbiAqIEBwYXJhbSB7b2JqZWN0fG51bGx9IENPTkZJR1xuICogQHBhcmFtIHtib29sZWFufSBbZm9yY2U9ZmFsc2VdXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzYXZlTGl2ZVN0YXR1cyhzdGF0ZSwgQ09ORklHID0gbnVsbCwgZm9yY2UgPSBmYWxzZSkge1xuICAgIGNvbnN0IHN1bW1hcnkgPSBnZXRMaXZlU3RhdHVzU3VtbWFyeShzdGF0ZSwgQ09ORklHKTtcblxuICAgIC8vIE11bHRpLXRhYiBwcm90ZWN0aW9uOiBzdGFuZGJ5IHRhYnMgbXVzdCBOT1Qgb3ZlcndyaXRlIGxlYWRlcidzIHN0b3JhZ2UgdW5sZXNzIGFjdGl2ZSBpbiBmb3JlZ3JvdW5kIG9yIGZvcmNlZFxuICAgIGlmICghZm9yY2UgJiYgc3RhdGUudGFiTG9ja01hbmFnZWQgJiYgIXN0YXRlLmlzVGFiTG9ja093bmVyICYmIGRvY3VtZW50LmhpZGRlbikge1xuICAgICAgICByZXR1cm4gc3VtbWFyeTtcbiAgICB9XG5cbiAgICBjb25zdCBuZXh0V29ya0J1Y2tldCA9IE1hdGgucm91bmQoKHN1bW1hcnkubmV4dFdvcmtUaW1lc3RhbXAgfHwgMCkgLyAzMDAwKTtcbiAgICBjb25zdCBrZXlGaWVsZHMgPSBgJHtzdW1tYXJ5LnJ1bm5pbmd9fCR7c3VtbWFyeS5jdXJyZW50RW5lcmd5fXwke3N1bW1hcnkubWF4RW5lcmd5fXwke3N1bW1hcnkud29ya1RvZGF5fXwke3N1bW1hcnkuaGFzVG9rZW59fCR7c3VtbWFyeS50b2tlbkV4cGlyZWR9fCR7c3VtbWFyeS5lbmVyZ3lUaHJlc2hvbGR9fCR7bmV4dFdvcmtCdWNrZXR9fCR7c3VtbWFyeS5sYXN0TG9nTWVzc2FnZX1gO1xuICAgIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gICAgaWYgKCFmb3JjZSAmJiBrZXlGaWVsZHMgPT09IF9sYXN0TGl2ZVN0YXR1c0pzb24gJiYgKG5vdyAtIF9sYXN0TGl2ZVN0YXR1c0F0IDwgMzAwMCkpIHtcbiAgICAgICAgcmV0dXJuIHN1bW1hcnk7XG4gICAgfVxuXG4gICAgX2xhc3RMaXZlU3RhdHVzSnNvbiA9IGtleUZpZWxkcztcbiAgICBfbGFzdExpdmVTdGF0dXNBdCA9IG5vdztcbiAgICBzZXRWYWx1ZSgnYXdfbGl2ZV9zdGF0dXMnLCBzdW1tYXJ5KTtcbiAgICByZXR1cm4gc3VtbWFyeTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbG9hZFN0YXRlRnJvbVN0b3JhZ2Uoc3RhdGUsIGxvYWRXb3JrSGlzdG9yeSkge1xuICAgIHN0YXRlLnRvdGFsV29ya2VkID0gICAgZ2V0U3RvcmVkSW50ZWdlcigndG90YWxXb3JrZWQnLCAwKTtcbiAgICBzdGF0ZS50b3RhbFdvcmtYUCA9ICAgIGdldFN0b3JlZEludGVnZXIoJ3RvdGFsV29ya1hQJywgMCk7XG4gICAgc3RhdGUud29ya1RvZGF5ID0gICAgICBnZXRTdG9yZWRJbnRlZ2VyKCd3b3JrVG9kYXknLCAwKTtcbiAgICBzdGF0ZS54cFRvZGF5ID0gICAgICAgIGdldFN0b3JlZEludGVnZXIoJ3hwVG9kYXknLCAwKTtcbiAgICBzdGF0ZS50b3RhbEVuZXJneVNwZW50ID0gICAgICAgICAgZ2V0U3RvcmVkSW50ZWdlcigndG90YWxFbmVyZ3lTcGVudCcsIDApO1xuICAgIHN0YXRlLnRvdGFsQWN0dWFsRW5lcmd5U3BlbnQgPSAgICBnZXRTdG9yZWRJbnRlZ2VyKCd0b3RhbEFjdHVhbEVuZXJneVNwZW50JywgMCk7XG4gICAgc3RhdGUudG90YWxFc3RpbWF0ZWRFbmVyZ3lTcGVudCA9IGdldFN0b3JlZEludGVnZXIoJ3RvdGFsRXN0aW1hdGVkRW5lcmd5U3BlbnQnLCAwKTtcbiAgICBzdGF0ZS5sYXN0V29ya0RhdGUgPSBnZXRWYWx1ZSgnbGFzdFdvcmtEYXRlJywgbmV3IERhdGUoKS50b0RhdGVTdHJpbmcoKSk7XG4gICAgc3RhdGUubGFzdFdvcmtUaW1lID0gZ2V0VmFsdWUoJ2xhc3RXb3JrVGltZScsICdCZWx1bSBwZXJuYWgnKTtcbiAgICBsb2FkV29ya0hpc3RvcnkoKTtcbn1cbiIsIi8qKlxuICogaGlzdG9yeS5qcyDigJQgRGFpbHkgd29yayBoaXN0b3J5IHN0b3JhZ2UgYW5kIG1hbmFnZW1lbnRcbiAqL1xuXG5pbXBvcnQgeyBnZXRWYWx1ZSwgc2V0VmFsdWUgfSBmcm9tICcuL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgaXNQbGFpbk9iamVjdCB9IGZyb20gJy4vY29uZmlnLmpzJztcbmltcG9ydCB7IGdldFN0b3JlZEludGVnZXIgfSBmcm9tICcuL3N0YXRlLmpzJztcblxuLyoqIEBwYXJhbSB7b2JqZWN0fSBoaXN0b3J5IEBwYXJhbSB7bnVtYmVyfSBtYXhEYXlzICovXG5leHBvcnQgZnVuY3Rpb24gcHJ1bmVPbGRIaXN0b3J5KGhpc3RvcnksIG1heERheXMgPSAzMCkge1xuICAgIGNvbnN0IGN1dG9mZiA9IG5ldyBEYXRlKCk7XG4gICAgY3V0b2ZmLnNldERhdGUoY3V0b2ZmLmdldERhdGUoKSAtIChtYXhEYXlzIHx8IDMwKSk7XG4gICAgbGV0IHBydW5lZCA9IGZhbHNlO1xuICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGhpc3RvcnkpKSB7XG4gICAgICAgIGlmIChuZXcgRGF0ZShrZXkpIDwgY3V0b2ZmKSB7XG4gICAgICAgICAgICBkZWxldGUgaGlzdG9yeVtrZXldO1xuICAgICAgICAgICAgcHJ1bmVkID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcHJ1bmVkO1xufVxuXG4vKiogQHBhcmFtIHt1bmtub3dufSBjYW5kaWRhdGUgQHJldHVybnMge29iamVjdHxudWxsfSAqL1xuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZVdvcmtIaXN0b3J5KGNhbmRpZGF0ZSkge1xuICAgIGlmICghaXNQbGFpbk9iamVjdChjYW5kaWRhdGUpKSByZXR1cm4gbnVsbDtcblxuICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuICAgIGZvciAoY29uc3QgW2tleSwgZW50cnldIG9mIE9iamVjdC5lbnRyaWVzKGNhbmRpZGF0ZSkpIHtcbiAgICAgICAgY29uc3QgZGF0ZSA9IG5ldyBEYXRlKGtleSk7XG4gICAgICAgIGlmIChcbiAgICAgICAgICAgIE51bWJlci5pc05hTihkYXRlLmdldFRpbWUoKSkgfHwgZGF0ZS50b0RhdGVTdHJpbmcoKSAhPT0ga2V5IHx8XG4gICAgICAgICAgICAhaXNQbGFpbk9iamVjdChlbnRyeSkgfHxcbiAgICAgICAgICAgICFOdW1iZXIuaXNTYWZlSW50ZWdlcihlbnRyeS5zaGlmdHMpIHx8IGVudHJ5LnNoaWZ0cyA8IDAgfHxcbiAgICAgICAgICAgICFOdW1iZXIuaXNTYWZlSW50ZWdlcihlbnRyeS54cCkgICAgIHx8IGVudHJ5LnhwIDwgMFxuICAgICAgICApIHJldHVybiBudWxsO1xuXG4gICAgICAgIGNvbnN0IGhhc0VuZXJneURhdGEgPSBbJ2VuZXJneVNwZW50JywgJ2VzdGltYXRlZEVuZXJneVNwZW50JywgJ2VuZXJneURhdGFTaGlmdHMnXVxuICAgICAgICAgICAgLnNvbWUoZiA9PiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZW50cnksIGYpKTtcblxuICAgICAgICBpZiAoaGFzRW5lcmd5RGF0YSAmJiAoXG4gICAgICAgICAgICAhTnVtYmVyLmlzU2FmZUludGVnZXIoZW50cnkuZW5lcmd5U3BlbnQpICAgICAgICAgIHx8IGVudHJ5LmVuZXJneVNwZW50IDwgMCB8fFxuICAgICAgICAgICAgIU51bWJlci5pc1NhZmVJbnRlZ2VyKGVudHJ5LmVzdGltYXRlZEVuZXJneVNwZW50KSB8fCBlbnRyeS5lc3RpbWF0ZWRFbmVyZ3lTcGVudCA8IDAgfHxcbiAgICAgICAgICAgICFOdW1iZXIuaXNTYWZlSW50ZWdlcihlbnRyeS5lbmVyZ3lEYXRhU2hpZnRzKSAgICAgfHwgZW50cnkuZW5lcmd5RGF0YVNoaWZ0cyA8IDAgfHxcbiAgICAgICAgICAgIGVudHJ5LmVuZXJneURhdGFTaGlmdHMgPiBlbnRyeS5zaGlmdHNcbiAgICAgICAgKSkgcmV0dXJuIG51bGw7XG5cbiAgICAgICAgbm9ybWFsaXplZFtrZXldID0geyBzaGlmdHM6IGVudHJ5LnNoaWZ0cywgeHA6IGVudHJ5LnhwIH07XG4gICAgICAgIGlmIChoYXNFbmVyZ3lEYXRhKSB7XG4gICAgICAgICAgICBub3JtYWxpemVkW2tleV0uZW5lcmd5U3BlbnQgICAgICAgICAgPSBlbnRyeS5lbmVyZ3lTcGVudDtcbiAgICAgICAgICAgIG5vcm1hbGl6ZWRba2V5XS5lc3RpbWF0ZWRFbmVyZ3lTcGVudCA9IGVudHJ5LmVzdGltYXRlZEVuZXJneVNwZW50O1xuICAgICAgICAgICAgbm9ybWFsaXplZFtrZXldLmVuZXJneURhdGFTaGlmdHMgICAgID0gZW50cnkuZW5lcmd5RGF0YVNoaWZ0cztcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbm9ybWFsaXplZDtcbn1cblxuLyoqIE1pZ3JhdGVzIHByZS01LjkuOCBoaXN0b3J5IHdoZXJlIGVuZXJneVNwZW50IGluY2x1ZGVkIGVzdGltYXRlZCBhbW91bnRzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1pZ3JhdGVMZWdhY3lFbmVyZ3lIaXN0b3J5KGhpc3RvcnkpIHtcbiAgICBmb3IgKGNvbnN0IGVudHJ5IG9mIE9iamVjdC52YWx1ZXMoaGlzdG9yeSkpIHtcbiAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChlbnRyeSwgJ2VuZXJneVNwZW50JykpIHtcbiAgICAgICAgICAgIGVudHJ5LmVuZXJneVNwZW50ID0gTWF0aC5tYXgoMCwgZW50cnkuZW5lcmd5U3BlbnQgLSBlbnRyeS5lc3RpbWF0ZWRFbmVyZ3lTcGVudCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGhpc3Rvcnk7XG59XG5cbi8qKlxuICogTG9hZHMgd29yayBoaXN0b3J5IGZyb20gc3RvcmFnZSwgcnVucyBtaWdyYXRpb24gaWYgbmVlZGVkLCBzeW5jcyB0b2RheSdzIGNvdW50ZXJzLlxuICogQHBhcmFtIHtvYmplY3R9IHN0YXRlXG4gKiBAcGFyYW0ge29iamVjdH0gQ09ORklHXG4gKiBAcmV0dXJucyB7b2JqZWN0fSBoaXN0b3J5XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBsb2FkV29ya0hpc3Rvcnkoc3RhdGUgPSB7fSwgQ09ORklHID0ge30pIHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCByYXcgPSBnZXRWYWx1ZSgnYXdfd29ya0hpc3RvcnknLCBudWxsKTtcbiAgICAgICAgY29uc3QgcGFyc2VkID0gcmF3ID8gKHR5cGVvZiByYXcgPT09ICdzdHJpbmcnID8gSlNPTi5wYXJzZShyYXcpIDogcmF3KSA6IHt9O1xuICAgICAgICBsZXQgaGlzdG9yeSA9IG5vcm1hbGl6ZVdvcmtIaXN0b3J5KHBhcnNlZCkgfHwgT2JqZWN0LmNyZWF0ZShudWxsKTtcblxuICAgICAgICBpZiAoZ2V0U3RvcmVkSW50ZWdlcignYXdfZW5lcmd5U2NoZW1hVmVyc2lvbicsIDEsIDEsIDIpIDwgMikge1xuICAgICAgICAgICAgbWlncmF0ZUxlZ2FjeUVuZXJneUhpc3RvcnkoaGlzdG9yeSk7XG4gICAgICAgICAgICBzZXRWYWx1ZSgnYXdfZW5lcmd5U2NoZW1hVmVyc2lvbicsICcyJyk7XG4gICAgICAgICAgICBzZXRWYWx1ZSgnYXdfd29ya0hpc3RvcnknLCBKU09OLnN0cmluZ2lmeShoaXN0b3J5KSk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB3b3JrVG9kYXkgPSBnZXRTdG9yZWRJbnRlZ2VyKCd3b3JrVG9kYXknLCAwKTtcbiAgICAgICAgY29uc3QgeHBUb2RheSAgID0gZ2V0U3RvcmVkSW50ZWdlcigneHBUb2RheScsIDApO1xuICAgICAgICBjb25zdCB0b2RheUtleSAgPSBuZXcgRGF0ZSgpLnRvRGF0ZVN0cmluZygpO1xuICAgICAgICBjb25zdCBtYXhEYXlzICAgPSBDT05GSUc/Lmhpc3RvcnlNYXhEYXlzIHx8IDMwO1xuXG4gICAgICAgIGlmICghaGlzdG9yeVt0b2RheUtleV0gfHwgaGlzdG9yeVt0b2RheUtleV0uc2hpZnRzICE9PSB3b3JrVG9kYXkgfHwgaGlzdG9yeVt0b2RheUtleV0ueHAgIT09IHhwVG9kYXkpIHtcbiAgICAgICAgICAgIGhpc3RvcnlbdG9kYXlLZXldID0geyBzaGlmdHM6IHdvcmtUb2RheSwgeHA6IHhwVG9kYXkgfTtcbiAgICAgICAgICAgIHBydW5lT2xkSGlzdG9yeShoaXN0b3J5LCBtYXhEYXlzKTtcbiAgICAgICAgICAgIHNldFZhbHVlKCdhd193b3JrSGlzdG9yeScsIEpTT04uc3RyaW5naWZ5KGhpc3RvcnkpKTtcbiAgICAgICAgfSBlbHNlIGlmIChwcnVuZU9sZEhpc3RvcnkoaGlzdG9yeSwgbWF4RGF5cykpIHtcbiAgICAgICAgICAgIHNldFZhbHVlKCdhd193b3JrSGlzdG9yeScsIEpTT04uc3RyaW5naWZ5KGhpc3RvcnkpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBoaXN0b3J5O1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignW0hpc3RvcnldIEZhaWxlZCB0byBsb2FkOicsIGUpO1xuICAgICAgICByZXR1cm4ge307XG4gICAgfVxufVxuXG4vKiogUGVyc2lzdHMgdGhlIGhpc3Rvcnkgb2JqZWN0IHRvIHN0b3JhZ2UuIEBwYXJhbSB7b2JqZWN0fSBoaXN0b3J5ICovXG5leHBvcnQgZnVuY3Rpb24gc2F2ZVdvcmtIaXN0b3J5KGhpc3RvcnkpIHtcbiAgICBzZXRWYWx1ZSgnYXdfd29ya0hpc3RvcnknLCBKU09OLnN0cmluZ2lmeShoaXN0b3J5KSk7XG59XG4iLCIvKipcbiAqIGxvZ2dlci5qcyDigJQgSW4tbWVtb3J5IGFjdGl2aXR5IGxvZyB3aXRoIHRocm90dGxpbmcgYW5kIHF1aWV0IG1vZGVcbiAqL1xuXG5pbXBvcnQgeyBzZXRWYWx1ZSB9IGZyb20gJy4vc3RvcmFnZS5qcyc7XG5cbmNvbnN0IHJlY2VudFJlcGVhdGVkTG9ncyA9IG5ldyBNYXAoKTtcblxuLyoqIEB0eXBlIHtmdW5jdGlvbnxudWxsfSBDYWxsZWQgYWZ0ZXIgZWFjaCBsb2cgZW50cnkgdG8gcmVmcmVzaCB0aGUgbG9nIHZpZXdlciBVSSAqL1xuZXhwb3J0IGxldCBvbkxvZ1VwZGF0ZSA9IG51bGw7XG5leHBvcnQgZnVuY3Rpb24gc2V0TG9nVXBkYXRlQ2FsbGJhY2soZm4pIHsgb25Mb2dVcGRhdGUgPSBmbjsgfVxuXG4vKipcbiAqIEBwYXJhbSB7b2JqZWN0fSBzdGF0ZVxuICogQHBhcmFtIHtvYmplY3R9IENPTkZJR1xuICogQHBhcmFtIHtzdHJpbmd9IG1lc3NhZ2VcbiAqIEBwYXJhbSB7J2luZm8nfCdzdWNjZXNzJ3wnd2Fybid8J2Vycm9yJ30gdHlwZVxuICogQHBhcmFtIHtib29sZWFufSB0b0FjdGl2aXR5TG9nXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBsb2coc3RhdGUsIENPTkZJRywgbWVzc2FnZSwgdHlwZSA9ICdpbmZvJywgdG9BY3Rpdml0eUxvZyA9IHRydWUpIHtcbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLnRvTG9jYWxlVGltZVN0cmluZygnaWQtSUQnKTtcbiAgICBjb25zdCBwcmVmaXggPSB0eXBlID09PSAnZXJyb3InID8gJ1tFUlJPUl0nIDogdHlwZSA9PT0gJ3N1Y2Nlc3MnID8gJ1tPS10nIDogdHlwZSA9PT0gJ3dhcm4nID8gJ1tXQVJOXScgOiAnW0lORk9dJztcblxuICAgIC8vIFF1aWV0IG1vZGU6IHN1cHByZXNzIHJlcGVhdGVkIGxvdy1lbmVyZ3kgd2FybmluZ3NcbiAgICBpZiAodG9BY3Rpdml0eUxvZyAmJiB0eXBlID09PSAnd2FybidcbiAgICAgICAgJiYgLyg/OkVuZXJnaSAoPzpiZWx1bXx0aWRhaykgY3VrdXB8U2VydmVyIG1lbm9sYWsga2VyamF8U2hpZnQgdGlkYWsgbWVuZ2hhc2lsa2FuIHVuaXQpL2kudGVzdChtZXNzYWdlKVxuICAgICAgICAmJiBDT05GSUcucXVpZXRNb2RlRW5hYmxlZFxuICAgICkge1xuICAgICAgICBjb25zdCBub3dNcyA9IERhdGUubm93KCk7XG4gICAgICAgIGlmIChub3dNcyAtIHN0YXRlLmxhc3RMb3dFbmVyZ3lMb2dUaW1lIDwgQ09ORklHLnF1aWV0TW9kZUludGVydmFsKSByZXR1cm47XG4gICAgICAgIHN0YXRlLmxhc3RMb3dFbmVyZ3lMb2dUaW1lID0gbm93TXM7XG4gICAgfVxuXG4gICAgLy8gVGhyb3R0bGUgcmVwZWF0ZWQgd2Fybi9lcnJvciBtZXNzYWdlc1xuICAgIGlmICh0b0FjdGl2aXR5TG9nICYmICh0eXBlID09PSAnd2FybicgfHwgdHlwZSA9PT0gJ2Vycm9yJykpIHtcbiAgICAgICAgY29uc3QgdGhyb3R0bGVLZXkgPSAvXlJldHJ5IGRhbGFtIC9pLnRlc3QobWVzc2FnZSkgPyBgJHt0eXBlfTpyZXRyeWAgOiBgJHt0eXBlfToke21lc3NhZ2V9YDtcbiAgICAgICAgY29uc3Qgbm93TXMgPSBEYXRlLm5vdygpO1xuICAgICAgICBjb25zdCBwcmV2aW91cyA9IHJlY2VudFJlcGVhdGVkTG9ncy5nZXQodGhyb3R0bGVLZXkpO1xuICAgICAgICBpZiAocHJldmlvdXMgJiYgbm93TXMgLSBwcmV2aW91cy50aW1lIDwgMzAwMDApIHtcbiAgICAgICAgICAgIHByZXZpb3VzLnN1cHByZXNzZWQrKztcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBpZiAocHJldmlvdXM/LnN1cHByZXNzZWQgPiAwKSB7XG4gICAgICAgICAgICBtZXNzYWdlICs9IGAgKCR7cHJldmlvdXMuc3VwcHJlc3NlZH0gcGVzYW4gc2VydXBhIGRpc2VtYnVueWlrYW4pYDtcbiAgICAgICAgfVxuICAgICAgICByZWNlbnRSZXBlYXRlZExvZ3Muc2V0KHRocm90dGxlS2V5LCB7IHRpbWU6IG5vd01zLCBzdXBwcmVzc2VkOiAwIH0pO1xuICAgICAgICBpZiAocmVjZW50UmVwZWF0ZWRMb2dzLnNpemUgPiAxMDApIHtcbiAgICAgICAgICAgIHJlY2VudFJlcGVhdGVkTG9ncy5kZWxldGUocmVjZW50UmVwZWF0ZWRMb2dzLmtleXMoKS5uZXh0KCkudmFsdWUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coYFske25vd31dICR7cHJlZml4fSAke21lc3NhZ2V9YCk7XG4gICAgc3RhdGUubGFzdExvZ01lc3NhZ2UgPSBgWyR7bm93fV0gJHttZXNzYWdlfWA7XG4gICAgc3RhdGUubGFzdExvZ1RpbWUgPSBub3c7XG4gICAgaWYgKCF0b0FjdGl2aXR5TG9nKSByZXR1cm47XG5cbiAgICBzdGF0ZS5sb2dzLnVuc2hpZnQoeyB0aW1lOiBub3csIHR5cGUsIG1lc3NhZ2UgfSk7XG4gICAgaWYgKHN0YXRlLmxvZ3MubGVuZ3RoID4gQ09ORklHLm1heExvZ0VudHJpZXMpIHtcbiAgICAgICAgc3RhdGUubG9ncyA9IHN0YXRlLmxvZ3Muc2xpY2UoMCwgQ09ORklHLm1heExvZ0VudHJpZXMpO1xuICAgIH1cbiAgICBfcGVyc2lzdExvZ3Moc3RhdGUubG9ncyk7XG4gICAgb25Mb2dVcGRhdGU/LigpO1xufVxuXG5sZXQgX3BlcnNpc3RUaW1lciA9IG51bGw7XG5mdW5jdGlvbiBfcGVyc2lzdExvZ3MobG9ncykge1xuICAgIGlmICh0eXBlb2YgY2hyb21lID09PSAndW5kZWZpbmVkJyB8fCAhY2hyb21lLnN0b3JhZ2U/LmxvY2FsKSByZXR1cm47XG4gICAgaWYgKF9wZXJzaXN0VGltZXIpIGNsZWFyVGltZW91dChfcGVyc2lzdFRpbWVyKTtcbiAgICBfcGVyc2lzdFRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIF9wZXJzaXN0VGltZXIgPSBudWxsO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgdHJpbW1lZCA9IGxvZ3Muc2xpY2UoMCwgODApO1xuICAgICAgICAgICAgc2V0VmFsdWUoJ2F3X3JlY2VudF9sb2dzJywgdHJpbW1lZCk7XG4gICAgICAgIH0gY2F0Y2ggeyAvKiBjb250ZXh0IGludmFsaWRhdGVkICovIH1cbiAgICB9LCAzMDApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xlYXJTdG9yZWRMb2dzKCkge1xuICAgIGlmIChfcGVyc2lzdFRpbWVyKSB7XG4gICAgICAgIGNsZWFyVGltZW91dChfcGVyc2lzdFRpbWVyKTtcbiAgICAgICAgX3BlcnNpc3RUaW1lciA9IG51bGw7XG4gICAgfVxuICAgIHJlY2VudFJlcGVhdGVkTG9ncy5jbGVhcigpO1xuICAgIHNldFZhbHVlKCdhd19yZWNlbnRfbG9ncycsIFtdKTtcbiAgICBpZiAodHlwZW9mIGNocm9tZSAhPT0gJ3VuZGVmaW5lZCcgJiYgY2hyb21lLnN0b3JhZ2U/LmxvY2FsKSB7XG4gICAgICAgIHRyeSB7IGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IGF3X3JlY2VudF9sb2dzOiBbXSB9KS5jYXRjaCgoKSA9PiB7fSk7IH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuICAgIH1cbn1cbiIsIi8qKlxuICogdG9rZW4uanMg4oCUIEpXVCBwYXJzaW5nLCBkZXRlY3Rpb24sIGFuZCBzdG9yYWdlIHdhdGNoaW5nXG4gKi9cblxuaW1wb3J0IHsgc2V0VmFsdWUgfSBmcm9tICcuL3N0b3JhZ2UuanMnO1xuXG4vKiogQHBhcmFtIHtzdHJpbmd9IHJhd1Rva2VuIEByZXR1cm5zIHt7IHBheWxvYWQsIGNsZWFuVG9rZW4sIGV4cGlyeSwgaXNFeHBpcmVkIH18bnVsbH0gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUp3dChyYXdUb2tlbikge1xuICAgIGlmICghcmF3VG9rZW4gfHwgdHlwZW9mIHJhd1Rva2VuICE9PSAnc3RyaW5nJykgcmV0dXJuIG51bGw7XG4gICAgdHJ5IHtcbiAgICAgICAgbGV0IGNsZWFuID0gcmF3VG9rZW4udHJpbSgpO1xuXG4gICAgICAgIC8vIEhhbmRsZSBxdW90ZWQgc3RyaW5nc1xuICAgICAgICBpZiAoKGNsZWFuLnN0YXJ0c1dpdGgoJ1wiJykgJiYgY2xlYW4uZW5kc1dpdGgoJ1wiJykpIHx8IChjbGVhbi5zdGFydHNXaXRoKFwiJ1wiKSAmJiBjbGVhbi5lbmRzV2l0aChcIidcIikpKSB7XG4gICAgICAgICAgICB0cnkgeyBjbGVhbiA9IEpTT04ucGFyc2UoY2xlYW4pOyB9IGNhdGNoIHsgY2xlYW4gPSBjbGVhbi5zbGljZSgxLCAtMSkudHJpbSgpOyB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBTdHJpcCBCZWFyZXIgcHJlZml4XG4gICAgICAgIGNsZWFuID0gY2xlYW4ucmVwbGFjZSgvXkJlYXJlclxccysvaSwgJycpLnRyaW0oKTtcblxuICAgICAgICAvLyBIYW5kbGUgSlNPTiBvYmplY3QgY29udGFpbmluZyB0b2tlblxuICAgICAgICBpZiAoY2xlYW4uc3RhcnRzV2l0aCgneycpKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IG9iaiA9IEpTT04ucGFyc2UoY2xlYW4pO1xuICAgICAgICAgICAgICAgIGNsZWFuID0gb2JqLnRva2VuIHx8IG9iai5hY2Nlc3NfdG9rZW4gfHwgb2JqLmp3dCB8fCBvYmoudmFsdWUgfHwgY2xlYW47XG4gICAgICAgICAgICB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHBhcnRzID0gY2xlYW4uc3BsaXQoJy4nKTtcbiAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCAhPT0gMykgcmV0dXJuIG51bGw7XG5cbiAgICAgICAgLy8gQmFzZTY0VVJMIOKGkiBCYXNlNjQgd2l0aCBwYWRkaW5nXG4gICAgICAgIGxldCBiYXNlNjQgPSBwYXJ0c1sxXS5yZXBsYWNlKC8tL2csICcrJykucmVwbGFjZSgvXy9nLCAnLycpO1xuICAgICAgICB3aGlsZSAoYmFzZTY0Lmxlbmd0aCAlIDQgIT09IDApIGJhc2U2NCArPSAnPSc7XG5cbiAgICAgICAgY29uc3QgYnl0ZXMgPSBVaW50OEFycmF5LmZyb20oYXRvYihiYXNlNjQpLCBjID0+IGMuY2hhckNvZGVBdCgwKSk7XG4gICAgICAgIGNvbnN0IHBheWxvYWQgPSBKU09OLnBhcnNlKG5ldyBUZXh0RGVjb2RlcigndXRmLTgnKS5kZWNvZGUoYnl0ZXMpKTtcbiAgICAgICAgY29uc3QgZXhwaXJ5ID0gcGF5bG9hZC5leHAgPyBuZXcgRGF0ZShwYXlsb2FkLmV4cCAqIDEwMDApIDogbnVsbDtcblxuICAgICAgICByZXR1cm4geyBwYXlsb2FkLCBjbGVhblRva2VuOiBjbGVhbiwgZXhwaXJ5LCBpc0V4cGlyZWQ6IGV4cGlyeSA/IGV4cGlyeSA8IG5ldyBEYXRlKCkgOiBmYWxzZSB9O1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdbSldUXSBGYWlsZWQgdG8gcGFyc2U6JywgZXJyKTtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxufVxuXG4vKipcbiAqIEF0dGVtcHRzIHRvIGFjY2VwdCBhIG5ldyByYXcgdG9rZW4gY2FuZGlkYXRlIGludG8gc3RhdGUuXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gdHJ1ZSBpZiB0b2tlbiB3YXMgdmFsaWQgYW5kIGFjY2VwdGVkXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBoYW5kbGVOZXdUb2tlbihzdGF0ZSwgbG9nRm4sIHdha2VQZW5kaW5nV29yaywgcmF3Q2FuZGlkYXRlLCBzb3VyY2UgPSAnc3RvcmFnZScsIG9uUmVzdW1lID0gbnVsbCwgb25VcGRhdGUgPSBudWxsKSB7XG4gICAgaWYgKCFyYXdDYW5kaWRhdGUpIHJldHVybiBmYWxzZTtcblxuICAgIGNvbnN0IHBhcnNlZCA9IHBhcnNlSnd0KHJhd0NhbmRpZGF0ZSk7XG4gICAgaWYgKCFwYXJzZWQpIHJldHVybiBmYWxzZTtcblxuICAgIGNvbnN0IHsgY2xlYW5Ub2tlbiwgZXhwaXJ5LCBpc0V4cGlyZWQgfSA9IHBhcnNlZDtcbiAgICBpZiAoaXNFeHBpcmVkKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihgW1Rva2VuXSBUb2tlbiBkYXJpICR7c291cmNlfSBzdWRhaCBFWFBJUkVEIHBhZGEgJHtleHBpcnk/LnRvTG9jYWxlU3RyaW5nKCdpZC1JRCcpfWApO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgaWYgKGNsZWFuVG9rZW4gPT09IHN0YXRlLnN0b3JlZFRva2VuVmFsdWUgJiYgc3RhdGUuY3VycmVudFRva2VuKSByZXR1cm4gdHJ1ZTsgLy8gc3VkYWggc2lua3JvblxuXG4gICAgc3RhdGUuc3RvcmVkVG9rZW5WYWx1ZSA9IGNsZWFuVG9rZW47XG4gICAgc3RhdGUuY3VycmVudFRva2VuICAgICA9IGBCZWFyZXIgJHtjbGVhblRva2VufWA7XG4gICAgc3RhdGUudG9rZW5FeHBpcnkgICAgICA9IGV4cGlyeTtcblxuICAgIHRyeSB7XG4gICAgICAgIHNldFZhbHVlKCdhd19hdXRoX3Rva2VuJywgY2xlYW5Ub2tlbik7XG4gICAgICAgIHNldFZhbHVlKCdhd19hdXRoX3Rva2VuX2V4cGlyeScsIGV4cGlyeSA/IGV4cGlyeS5nZXRUaW1lKCkudG9TdHJpbmcoKSA6ICcnKTtcbiAgICB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblxuICAgIGNvbnN0IGRpZmYgICA9IGV4cGlyeSA/IE1hdGguZmxvb3IoKGV4cGlyeSAtIERhdGUubm93KCkpIC8gMTAwMCkgOiBudWxsO1xuICAgIGNvbnN0IHRpbWVTdHIgPSBleHBpcnlcbiAgICAgICAgPyBgJHtleHBpcnkudG9Mb2NhbGVUaW1lU3RyaW5nKCdpZC1JRCcpfSAoJHtNYXRoLmZsb29yKGRpZmYgLyAzNjAwKX1oICR7TWF0aC5mbG9vcigoZGlmZiAlIDM2MDApIC8gNjApfW0pYFxuICAgICAgICA6ICdUaWRhayBhZGEgZXhwJztcblxuICAgIGxvZ0ZuKGBUb2tlbiB2YWxpZCB2aWEgJHtzb3VyY2V9ISBFeHA6ICR7dGltZVN0cn1gLCAnc3VjY2VzcycpO1xuXG4gICAgc3RhdGUudG9rZW5FeHBpcmVkICAgICA9IGZhbHNlO1xuXG4gICAgaWYgKHN0YXRlLnBhdXNlZEZvclRva2VuIHx8ICFzdGF0ZS5ydW5uaW5nKSB7XG4gICAgICAgIHN0YXRlLnJ1bm5pbmcgPSB0cnVlO1xuICAgICAgICBzdGF0ZS5wYXVzZWRGb3JUb2tlbiA9IGZhbHNlO1xuICAgICAgICBsb2dGbignU2VzaSBkaXBlcmJhcnVpLiBTY3JpcHQgZGlsYW5qdXRrYW4gb3RvbWF0aXMuJywgJ3N1Y2Nlc3MnKTtcbiAgICAgICAgb25SZXN1bWU/LigpO1xuICAgICAgICB3YWtlUGVuZGluZ1dvcms/LigpO1xuICAgIH1cblxuICAgIG9uVXBkYXRlPy4oKTtcbiAgICByZXR1cm4gdHJ1ZTtcbn1cblxuLyoqXG4gKiBTY2FucyB3aW5kb3cubG9jYWxTdG9yYWdlLCBzZXNzaW9uU3RvcmFnZSwgYW5kIHVuc2FmZVdpbmRvdy5sb2NhbFN0b3JhZ2UgZm9yIGEgdmFsaWQgSldULlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0VG9rZW5Gcm9tU3RvcmFnZShzdGF0ZSwgaGFuZGxlTmV3VG9rZW5Gbikge1xuICAgIGNvbnN0IHNob3VsZExvZyA9IERhdGUubm93KCkgLSAoZ2V0VG9rZW5Gcm9tU3RvcmFnZS5fbGFzdERpYWdBdCB8fCAwKSA+PSAzMDAwMDtcbiAgICBpZiAoc2hvdWxkTG9nKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCdbVG9rZW5dIE1lbWluZGFpIHN0b3JhZ2UuLi4nKTtcbiAgICAgICAgZ2V0VG9rZW5Gcm9tU3RvcmFnZS5fbGFzdERpYWdBdCA9IERhdGUubm93KCk7XG4gICAgfVxuXG4gICAgY29uc3Qgc3RvcmFnZXMgPSBbXTtcbiAgICB0cnkgeyBpZiAod2luZG93LmxvY2FsU3RvcmFnZSkgc3RvcmFnZXMucHVzaCh7IG5hbWU6ICdsb2NhbFN0b3JhZ2UnLCBzdG9yZTogd2luZG93LmxvY2FsU3RvcmFnZSB9KTsgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcHcgPSB3aW5kb3c7IC8vIEluIE1WMyBjb250ZW50IHNjcmlwdHMsIHdpbmRvdyBJUyB0aGUgcGFnZSB3aW5kb3dcbiAgICAgICAgaWYgKHB3Py5sb2NhbFN0b3JhZ2UgJiYgcHcubG9jYWxTdG9yYWdlICE9PSB3aW5kb3cubG9jYWxTdG9yYWdlKSB7XG4gICAgICAgICAgICBzdG9yYWdlcy5wdXNoKHsgbmFtZTogJ3B3LmxvY2FsU3RvcmFnZScsIHN0b3JlOiBwdy5sb2NhbFN0b3JhZ2UgfSk7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cbiAgICB0cnkgeyBpZiAod2luZG93LnNlc3Npb25TdG9yYWdlKSBzdG9yYWdlcy5wdXNoKHsgbmFtZTogJ3Nlc3Npb25TdG9yYWdlJywgc3RvcmU6IHdpbmRvdy5zZXNzaW9uU3RvcmFnZSB9KTsgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG5cbiAgICBjb25zdCBjb21tb25LZXlzID0gWyd0b2tlbicsICdhdXRoX3Rva2VuJywgJ2F1dGhUb2tlbicsICdhY2Nlc3NfdG9rZW4nLCAnand0JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICdzZXNzaW9uJywgJ3BhcmxhbWVudHVtX3Rva2VuJywgJ3NiLXRva2VuJywgJ3NiLWFjY2Vzcy10b2tlbicsICd1c2VyX3Rva2VuJ107XG5cbiAgICBmb3IgKGNvbnN0IHsgbmFtZSwgc3RvcmUgfSBvZiBzdG9yYWdlcykge1xuICAgICAgICBmb3IgKGNvbnN0IGtleSBvZiBjb21tb25LZXlzKSB7XG4gICAgICAgICAgICBjb25zdCB2YWwgPSBzdG9yZS5nZXRJdGVtKGtleSk7XG4gICAgICAgICAgICBpZiAodmFsICYmIGhhbmRsZU5ld1Rva2VuRm4odmFsLCBgJHtuYW1lfVske2tleX1dYCkpIHJldHVybiBzdGF0ZS5jdXJyZW50VG9rZW47XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IHsgbmFtZSwgc3RvcmUgfSBvZiBzdG9yYWdlcykge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHN0b3JlLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBrZXkgPSBzdG9yZS5rZXkoaSk7XG4gICAgICAgICAgICBpZiAoIWtleSkgY29udGludWU7XG4gICAgICAgICAgICBjb25zdCB2YWwgPSBzdG9yZS5nZXRJdGVtKGtleSk7XG4gICAgICAgICAgICBpZiAodmFsICYmIHR5cGVvZiB2YWwgPT09ICdzdHJpbmcnICYmICh2YWwuaW5jbHVkZXMoJ2V5SicpIHx8IHZhbC5zdGFydHNXaXRoKCd7JykpKSB7XG4gICAgICAgICAgICAgICAgaWYgKGhhbmRsZU5ld1Rva2VuRm4odmFsLCBgJHtuYW1lfVthdXRvOiR7a2V5fV1gKSkgcmV0dXJuIHN0YXRlLmN1cnJlbnRUb2tlbjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChzaG91bGRMb2cpIHtcbiAgICAgICAgY29uc29sZS53YXJuKCdbVG9rZW5dIFRpZGFrIGRpdGVtdWthbi4gS2V5cyB0ZXJzZWRpYTonKTtcbiAgICAgICAgZm9yIChjb25zdCB7IG5hbWUsIHN0b3JlIH0gb2Ygc3RvcmFnZXMpIHtcbiAgICAgICAgICAgIHRyeSB7IGNvbnNvbGUubG9nKGAgICR7bmFtZX06YCwgT2JqZWN0LmtleXMoc3RvcmUpKTsgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG59XG5cbi8qKlxuICogUmV0dXJucyBhIGh1bWFuLXJlYWRhYmxlIHN0cmluZyBvZiB0aW1lIHJlbWFpbmluZyB1bnRpbCB0b2tlbiBleHBpcnkuXG4gKiBAcGFyYW0ge29iamVjdH0gc3RhdGVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldFRpbWVVbnRpbEV4cGlyeShzdGF0ZSkge1xuICAgIGlmICghc3RhdGUudG9rZW5FeHBpcnkpIHJldHVybiAnTi9BJztcbiAgICBjb25zdCBkaWZmID0gc3RhdGUudG9rZW5FeHBpcnkgLSBEYXRlLm5vdygpO1xuICAgIGlmIChkaWZmIDw9IDApIHJldHVybiAnRVhQSVJFRCc7XG4gICAgcmV0dXJuIGAke01hdGguZmxvb3IoZGlmZiAvIDM2MDAwMDApfWggJHtNYXRoLmZsb29yKChkaWZmICUgMzYwMDAwMCkgLyA2MDAwMCl9bWA7XG59XG5cbi8qKlxuICogU2V0cyB1cCAwbXMgdG9rZW4gaW50ZXJjZXB0aW9uIHZpYSBzdG9yYWdlIGV2ZW50cyArIGZldGNoIHNuaWZmZXIgKyBpbnRlcnZhbCBmYWxsYmFjay5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN0YXJ0VG9rZW5XYXRjaGVyKHN0YXRlLCBoYW5kbGVOZXdUb2tlbkZuLCBnZXRUb2tlbkZuKSB7XG4gICAgLy8gMS4gQ3Jvc3MtdGFiIHN0b3JhZ2UgZXZlbnRzIChjYXRjaGVzIGxvZ2luIGluIGFub3RoZXIgdGFiKVxuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdzdG9yYWdlJywgKHsgbmV3VmFsdWUsIGtleSB9KSA9PiB7XG4gICAgICAgIGlmIChuZXdWYWx1ZSkgaGFuZGxlTmV3VG9rZW5GbihuZXdWYWx1ZSwgYHN0b3JhZ2UtZXZlbnRbJHtrZXl9XWApO1xuICAgIH0pO1xuXG4gICAgLy8gMi4gRmV0Y2ggc25pZmZlciDigJQgaW50ZXJjZXB0cyBBdXRob3JpemF0aW9uIEJlYXJlciBmcm9tIGxpdmUgcGFnZSByZXF1ZXN0c1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IG9yaWdGZXRjaCA9IHdpbmRvdy5mZXRjaDtcbiAgICAgICAgd2luZG93LmZldGNoID0gZnVuY3Rpb24oLi4uYXJncykge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBbaW5wdXQsIGNvbmZpZ10gPSBhcmdzO1xuICAgICAgICAgICAgICAgIGxldCBhdXRoID0gbnVsbDtcbiAgICAgICAgICAgICAgICBpZiAoY29uZmlnPy5oZWFkZXJzKSB7XG4gICAgICAgICAgICAgICAgICAgIGF1dGggPSBjb25maWcuaGVhZGVycyBpbnN0YW5jZW9mIEhlYWRlcnNcbiAgICAgICAgICAgICAgICAgICAgICAgID8gY29uZmlnLmhlYWRlcnMuZ2V0KCdBdXRob3JpemF0aW9uJykgfHwgY29uZmlnLmhlYWRlcnMuZ2V0KCdhdXRob3JpemF0aW9uJylcbiAgICAgICAgICAgICAgICAgICAgICAgIDogY29uZmlnLmhlYWRlcnNbJ0F1dGhvcml6YXRpb24nXSB8fCBjb25maWcuaGVhZGVyc1snYXV0aG9yaXphdGlvbiddO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoIWF1dGggJiYgaW5wdXQgaW5zdGFuY2VvZiBSZXF1ZXN0KSB7XG4gICAgICAgICAgICAgICAgICAgIGF1dGggPSBpbnB1dC5oZWFkZXJzPy5nZXQoJ0F1dGhvcml6YXRpb24nKSB8fCBpbnB1dC5oZWFkZXJzPy5nZXQoJ2F1dGhvcml6YXRpb24nKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGF1dGg/LmluY2x1ZGVzKCdCZWFyZXIgJykpIGhhbmRsZU5ld1Rva2VuRm4oYXV0aCwgJ2ZldGNoLWludGVyY2VwdCcpO1xuICAgICAgICAgICAgfSBjYXRjaCB7IC8qIG5ldmVyIGJyZWFrIHRoZSBwYWdlICovIH1cbiAgICAgICAgICAgIHJldHVybiBvcmlnRmV0Y2guYXBwbHkodGhpcywgYXJncyk7XG4gICAgICAgIH07XG4gICAgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG5cbiAgICAvLyAzLiBJbnRlcnZhbCBmYWxsYmFjayDigJQgcmVzY2FucyBpZiB0b2tlbiBpcyBtaXNzaW5nIG9yIGV4cGlyZWRcbiAgICBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgICAgIGlmICghc3RhdGUuY3VycmVudFRva2VuIHx8IChzdGF0ZS50b2tlbkV4cGlyeSAmJiBzdGF0ZS50b2tlbkV4cGlyeSA8IG5ldyBEYXRlKCkpKSB7XG4gICAgICAgICAgICBnZXRUb2tlbkZuKCk7XG4gICAgICAgIH1cbiAgICB9LCA4MDAwKTtcbn1cbiIsIi8qKlxuICogZW5lcmd5LmpzIOKAlCBET00gZW5lcmd5IHNjcmFwaW5nIGFuZCB0aW1lLWJhc2VkIHN5bmMgZXN0aW1hdGlvblxuICovXG5cbi8qKiBAcmV0dXJucyB7eyBjdXJyZW50OiBudW1iZXIsIG1heDogbnVtYmVyIH18bnVsbH0gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRDdXJyZW50RW5lcmd5KCkge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGlzRXhjbHVkZWQgPSBlbCA9PiBCb29sZWFuKFxuICAgICAgICAgICAgZWwuY2xvc2VzdCgnI2F3LXBhbmVsLCAjYXctc2V0dGluZ3MtbW9kYWwsICNhdy1hbmFseXRpY3MtbW9kYWwsICNhdy1sb2ctbW9kYWwsICNhdy1ub3RpZmljYXRpb24tdG9hc3QnKVxuICAgICAgICApO1xuXG4gICAgICAgIC8vIOKUgOKUgCBQcmlvcml0eSAxOiBUb3AgTmF2aWdhdGlvbiBCYXIgU3BhdGlhbCBTZWFyY2ggKEZhc3Rlc3Q6IDwgMC4ybXMpIOKUgOKUgFxuICAgICAgICAvLyBUb3AgaGVhZGVyIHJlbmRlcnMgdGhlIGNvbXBhY3QgcGlsbCB3aXRoIFvimqEgNDQvMTEwXSBhY3Jvc3MgYWxsIHBhZ2VzXG4gICAgICAgIGNvbnN0IHRvcENhbmRpZGF0ZXMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdoZWFkZXIsIG5hdiwgW3JvbGU9XCJiYW5uZXJcIl0sIFtjbGFzcyo9XCJuYXZcIiBpXSwgW2NsYXNzKj1cImhlYWRlclwiIGldLCBbY2xhc3MqPVwidG9wYmFyXCIgaV0sIFtjbGFzcyo9XCJuYXZiYXJcIiBpXScpO1xuICAgICAgICBmb3IgKGNvbnN0IGNvbnRhaW5lciBvZiB0b3BDYW5kaWRhdGVzKSB7XG4gICAgICAgICAgICBpZiAoaXNFeGNsdWRlZChjb250YWluZXIpKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IGVscyA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcqJyk7XG4gICAgICAgICAgICBjb25zdCBtYXRjaGVzID0gW107XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGVsIG9mIGVscykge1xuICAgICAgICAgICAgICAgIGlmIChpc0V4Y2x1ZGVkKGVsKSkgY29udGludWU7XG4gICAgICAgICAgICAgICAgY29uc3QgdGV4dCA9IChlbC50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpO1xuICAgICAgICAgICAgICAgIGlmICghdGV4dC5pbmNsdWRlcygnLycpKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICBpZiAodGV4dC5sZW5ndGggPiAzMCkgY29udGludWU7IC8vIG11c3QgYmUgYSBjb21wYWN0IHBpbGwvbGFiZWxcbiAgICAgICAgICAgICAgICBjb25zdCBtID0gdGV4dC5tYXRjaCgvKD864pqhfFxcYikoXFxkKylcXHMqXFwvXFxzKihcXGQrKVxcYi8pO1xuICAgICAgICAgICAgICAgIGlmIChtKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1cnJlbnQgPSBwYXJzZUludChtWzFdLCAxMCksIG1heCA9IHBhcnNlSW50KG1bMl0sIDEwKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1heCA+PSA1MCAmJiBtYXggPD0gMzUwICYmIGN1cnJlbnQgPD0gbWF4KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBtYXRjaGVzLnB1c2goeyBjdXJyZW50LCBtYXgsIGxlbjogdGV4dC5sZW5ndGggfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAobWF0Y2hlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgbWF0Y2hlcy5zb3J0KChhLCBiKSA9PiBhLmxlbiAtIGIubGVuKTtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBjdXJyZW50OiBtYXRjaGVzWzBdLmN1cnJlbnQsIG1heDogbWF0Y2hlc1swXS5tYXggfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIOKUgOKUgCBQcmlvcml0eSAyOiBEZWRpY2F0ZWQgRGFzaGJvYXJkIFwiRU5FUkdJXCIgQ2FyZCDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgICAgICAgLy8gT24gcGFybGFtZW50dW0ub3JnL2Rhc2hib2FyZCwgdGhlIG1haW4gZW5lcmd5IGNhcmQgaGFzIGEgaGVhZGluZyB3aXRoIFwiRU5FUkdJXCJcbiAgICAgICAgY29uc3QgZW5lcmd5SGVhZGVycyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2gxLCBoMiwgaDMsIGg0LCBoNSwgaDYsIHNwYW4sIGRpdiwgcCcpO1xuICAgICAgICBmb3IgKGNvbnN0IGggb2YgZW5lcmd5SGVhZGVycykge1xuICAgICAgICAgICAgaWYgKGlzRXhjbHVkZWQoaCkpIGNvbnRpbnVlO1xuICAgICAgICAgICAgY29uc3QgdCA9IChoLnRleHRDb250ZW50IHx8ICcnKS50cmltKCk7XG4gICAgICAgICAgICBpZiAoL17imqE/XFxzKig/OkVORVJHSXxFTkVSR1kpXFxiL2kudGVzdCh0KSAmJiB0Lmxlbmd0aCA8PSAzMCkge1xuICAgICAgICAgICAgICAgIC8vIFNlYXJjaCBpbiBwYXJlbnQgY2FyZCAodXAgdG8gNCBsZXZlbHMgdXApXG4gICAgICAgICAgICAgICAgbGV0IGNhcmQgPSBoLnBhcmVudEVsZW1lbnQ7XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgbGV2ZWwgPSAwOyBsZXZlbCA8IDQgJiYgY2FyZCAmJiBjYXJkICE9PSBkb2N1bWVudC5ib2R5OyBsZXZlbCsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGlubmVyRWxzID0gY2FyZC5xdWVyeVNlbGVjdG9yQWxsKCcqJyk7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgZWwgb2YgaW5uZXJFbHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpc0V4Y2x1ZGVkKGVsKSkgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB0eHQgPSAoZWwudGV4dENvbnRlbnQgfHwgJycpLnRyaW0oKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghdHh0LmluY2x1ZGVzKCcvJykgfHwgdHh0Lmxlbmd0aCA+IDI1KSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG0gPSB0eHQubWF0Y2goLyg/OuKaoXxcXGIpKFxcZCspXFxzKlxcL1xccyooXFxkKykvKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChtKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY3VycmVudCA9IHBhcnNlSW50KG1bMV0sIDEwKSwgbWF4ID0gcGFyc2VJbnQobVsyXSwgMTApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChtYXggPj0gNTAgJiYgbWF4IDw9IDM1MCAmJiBjdXJyZW50IDw9IG1heCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBjdXJyZW50LCBtYXggfTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY2FyZFRleHQgPSAoY2FyZC50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtID0gY2FyZFRleHQubWF0Y2goLyhcXGQrKVxccypcXC9cXHMqKFxcZCspLyk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChtKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjdXJyZW50ID0gcGFyc2VJbnQobVsxXSwgMTApLCBtYXggPSBwYXJzZUludChtWzJdLCAxMCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobWF4ID49IDUwICYmIG1heCA8PSAzNTAgJiYgY3VycmVudCA8PSBtYXgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBjdXJyZW50LCBtYXggfTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjYXJkID0gY2FyZC5wYXJlbnRFbGVtZW50O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIOKUgOKUgCBQcmlvcml0eSAzOiBJbm5lcm1vc3QgRWxlbWVudHMgaW4gRG9jdW1lbnQgd2l0aCBcXGQrL1xcZCsg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gICAgICAgIGNvbnN0IGFsbENhbmRpZGF0ZXMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdkaXYsIHNwYW4sIHAsIGEsIGJ1dHRvbiwgW3JvbGU9XCJzdGF0dXNcIl0nKTtcbiAgICAgICAgY29uc3QgbWF0Y2hlcyA9IFtdO1xuICAgICAgICBmb3IgKGNvbnN0IGVsIG9mIGFsbENhbmRpZGF0ZXMpIHtcbiAgICAgICAgICAgIGlmIChpc0V4Y2x1ZGVkKGVsKSkgY29udGludWU7XG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gKGVsLnRleHRDb250ZW50IHx8ICcnKS50cmltKCk7XG4gICAgICAgICAgICBpZiAoIXRleHQuaW5jbHVkZXMoJy8nKSkgY29udGludWU7XG4gICAgICAgICAgICBpZiAodGV4dC5sZW5ndGggPiAzNSkgY29udGludWU7XG4gICAgICAgICAgICBjb25zdCBtID0gdGV4dC5tYXRjaCgvKD864pqhfFxcYikoXFxkKylcXHMqXFwvXFxzKihcXGQrKVxcYi8pO1xuICAgICAgICAgICAgaWYgKG0pIHtcbiAgICAgICAgICAgICAgICBjb25zdCBjdXJyZW50ID0gcGFyc2VJbnQobVsxXSwgMTApLCBtYXggPSBwYXJzZUludChtWzJdLCAxMCk7XG4gICAgICAgICAgICAgICAgaWYgKG1heCA+PSA1MCAmJiBtYXggPD0gMzUwICYmIGN1cnJlbnQgPD0gbWF4KSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGhhc0ljb24gPSB0ZXh0LmluY2x1ZGVzKCfimqEnKSB8fCBCb29sZWFuKGVsLnF1ZXJ5U2VsZWN0b3IoJ3N2ZycpKTtcbiAgICAgICAgICAgICAgICAgICAgbWF0Y2hlcy5wdXNoKHsgY3VycmVudCwgbWF4LCBsZW46IHRleHQubGVuZ3RoLCBoYXNJY29uIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChtYXRjaGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIG1hdGNoZXMuc29ydCgoYSwgYikgPT4gKGIuaGFzSWNvbiA/IDEgOiAwKSAtIChhLmhhc0ljb24gPyAxIDogMCkgfHwgYS5sZW4gLSBiLmxlbik7XG4gICAgICAgICAgICByZXR1cm4geyBjdXJyZW50OiBtYXRjaGVzWzBdLmN1cnJlbnQsIG1heDogbWF0Y2hlc1swXS5tYXggfTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIOKUgOKUgCBQcmlvcml0eSA0OiBTcGxpdCBSZWFjdCBTcGFucyAoPHNwYW4gY3VycmVudD4gLyA8c3BhbiBtYXg+KSDilIDilIDilIDilIDilIDilIBcbiAgICAgICAgY29uc3Qgc2xhc2hFbHMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdzcGFuLCBkaXYnKTtcbiAgICAgICAgZm9yIChjb25zdCBlbCBvZiBzbGFzaEVscykge1xuICAgICAgICAgICAgaWYgKGlzRXhjbHVkZWQoZWwpKSBjb250aW51ZTtcbiAgICAgICAgICAgIGlmICgoZWwudGV4dENvbnRlbnQgfHwgJycpLnRyaW0oKSA9PT0gJy8nKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcHJldiA9IGVsLnByZXZpb3VzRWxlbWVudFNpYmxpbmc7XG4gICAgICAgICAgICAgICAgY29uc3QgbmV4dCA9IGVsLm5leHRFbGVtZW50U2libGluZztcbiAgICAgICAgICAgICAgICBpZiAocHJldiAmJiBuZXh0KSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1cnJlbnQgPSBwYXJzZUludCgocHJldi50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpLCAxMCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG1heCA9IHBhcnNlSW50KChuZXh0LnRleHRDb250ZW50IHx8ICcnKS50cmltKCksIDEwKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKE51bWJlci5pc1NhZmVJbnRlZ2VyKGN1cnJlbnQpICYmIE51bWJlci5pc1NhZmVJbnRlZ2VyKG1heCkgJiYgbWF4ID49IDUwICYmIG1heCA8PSAzNTAgJiYgY3VycmVudCA8PSBtYXgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7IGN1cnJlbnQsIG1heCB9O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG4gICAgcmV0dXJuIG51bGw7XG59XG5cbi8qKlxuICogV2FpdHMgKHVwIHRvIG1heFdhaXRNcykgZm9yIHRoZSBlbmVyZ3kgZWxlbWVudCB0byBhcHBlYXIgaW4gdGhlIERPTS5cbiAqIFVzZWZ1bCBvbiBSZWFjdCBTUEFzIHdoZXJlIGVsZW1lbnRzIHJlbmRlciBhZnRlciBkb2N1bWVudF9pZGxlLlxuICogQHBhcmFtIHtudW1iZXJ9IG1heFdhaXRNc1xuICogQHJldHVybnMge1Byb21pc2U8e2N1cnJlbnQ6bnVtYmVyLG1heDpudW1iZXJ9fG51bGw+fVxuICovXG5leHBvcnQgZnVuY3Rpb24gd2FpdEZvckVuZXJneUVsZW1lbnQobWF4V2FpdE1zID0gMTUwMDApIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICAgIGNvbnN0IGltbWVkaWF0ZSA9IGdldEN1cnJlbnRFbmVyZ3koKTtcbiAgICAgICAgaWYgKGltbWVkaWF0ZSkgcmV0dXJuIHJlc29sdmUoaW1tZWRpYXRlKTtcblxuICAgICAgICBjb25zdCBkZWFkbGluZSA9IERhdGUubm93KCkgKyBtYXhXYWl0TXM7XG4gICAgICAgIGNvbnN0IG9ic2VydmVyID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gZ2V0Q3VycmVudEVuZXJneSgpO1xuICAgICAgICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgIG9ic2VydmVyLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKERhdGUubm93KCkgPj0gZGVhZGxpbmUpIHtcbiAgICAgICAgICAgICAgICBvYnNlcnZlci5kaXNjb25uZWN0KCk7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShudWxsKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIG9ic2VydmVyLm9ic2VydmUoZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LCB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSB9KTtcblxuICAgICAgICAvLyBTYWZldHkgdGltZW91dCBpbiBjYXNlIE11dGF0aW9uT2JzZXJ2ZXIgZG9lc24ndCBmaXJlXG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgb2JzZXJ2ZXIuZGlzY29ubmVjdCgpO1xuICAgICAgICAgICAgcmVzb2x2ZShnZXRDdXJyZW50RW5lcmd5KCkpO1xuICAgICAgICB9LCBtYXhXYWl0TXMpO1xuICAgIH0pO1xufVxuXG4vKipcbiAqIEludGVudGlvbmFsbHkgbm8tb3A6IG5ldmVyIG11dGF0ZSBSZWFjdCBob3N0IFNQQSBET00gbm9kZXMgZGlyZWN0bHksXG4gKiBhcyBkb2luZyBzbyB3aXBlcyBvdXQgY2hpbGQgZWxlbWVudHMsIHN0eWxpbmcsIGFuZCBicmVha3MgUmVhY3QgdmlydHVhbCBET00uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVQYWdlRW5lcmd5RE9NKGN1cnJlbnQsIG1heCkge1xuICAgIHJldHVybiBmYWxzZTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIGVuZXJneSB1c2luZyBwYWdlIERPTSB3aGVuIHZpc2libGUsIG9yIHRpbWUtYmFzZWQgZXN0aW1hdGlvbiB3aGVuIHRhYiBpcyBpbiBiYWNrZ3JvdW5kLlxuICogQHBhcmFtIHtvYmplY3R9IHN0YXRlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRTeW5jZWRFbmVyZ3koc3RhdGUpIHtcbiAgICBjb25zdCBpc0hpZGRlbiA9IHR5cGVvZiBkb2N1bWVudCAhPT0gJ3VuZGVmaW5lZCcgJiYgZG9jdW1lbnQuaGlkZGVuO1xuICAgIGNvbnN0IG5vdyAgICAgID0gRGF0ZS5ub3coKTtcblxuICAgIC8vIDEuIEVjbyBNb2RlIC8gQmFja2dyb3VuZCBUYWI6IFVzZSBPKDEpIG1hdGhlbWF0aWNhbCBjYWxjdWxhdGlvbiB3aGVuIGludmlzaWJsZVxuICAgIC8vIEVsaW1pbmF0ZXMgcmVkdW5kYW50IERPTSB0cmF2ZXJzYWwgd2hpbGUgcnVubmluZyBzbW9vdGhseSBpbiBiYWNrZ3JvdW5kIVxuICAgIGlmIChpc0hpZGRlbiAmJiBzdGF0ZS5lbmVyZ3lTeW5jQmFzZSAmJiB0eXBlb2Ygc3RhdGUuZW5lcmd5U3luY0Jhc2UuY3VycmVudCA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgY29uc3Qgc3luY0Jhc2UgPSBzdGF0ZS5lbmVyZ3lTeW5jQmFzZTtcbiAgICAgICAgY29uc3QgbWF4ID0gc3luY0Jhc2UubWF4IHx8IHN0YXRlLm1heEVuZXJneSB8fCAxMTU7XG4gICAgICAgIGNvbnN0IGVsYXBzZWRNaW5zID0gc3luY0Jhc2UudXBkYXRlZEF0ID8gKG5vdyAtIHN5bmNCYXNlLnVwZGF0ZWRBdCkgLyA2MDAwMCA6IDA7XG4gICAgICAgIGNvbnN0IHJlZ2VuUmF0ZSA9IHN0YXRlLnJlZ2VuUmF0ZSB8fCAxLjA7XG4gICAgICAgIGNvbnN0IGdhaW5lZCA9IE1hdGguZmxvb3IoZWxhcHNlZE1pbnMgKiByZWdlblJhdGUpO1xuICAgICAgICBjb25zdCBjYWxjdWxhdGVkID0gTWF0aC5taW4obWF4LCBzeW5jQmFzZS5jdXJyZW50ICsgTWF0aC5tYXgoMCwgZ2FpbmVkKSk7XG4gICAgICAgIHJldHVybiB7IGN1cnJlbnQ6IGNhbGN1bGF0ZWQsIG1heCB9O1xuICAgIH1cblxuICAgIGNvbnN0IHBhZ2VFbmVyZ3kgPSBnZXRDdXJyZW50RW5lcmd5KCk7XG5cbiAgICAvLyAxLiBWaXNpYmxlIERPTSBpcyBBTFdBWVMgZ3JvdW5kIHRydXRoIHdoZW4gdGFiIGlzIGluIGZvcmVncm91bmQhXG4gICAgaWYgKHBhZ2VFbmVyZ3kgJiYgIWlzSGlkZGVuKSB7XG4gICAgICAgIHN0YXRlLmRvbUVuZXJneVN0YWxlID0gZmFsc2U7XG4gICAgICAgIHN0YXRlLmN1cnJlbnRFbmVyZ3kgPSBwYWdlRW5lcmd5LmN1cnJlbnQ7XG4gICAgICAgIHN0YXRlLm1heEVuZXJneSA9IHBhZ2VFbmVyZ3kubWF4O1xuICAgICAgICBzdGF0ZS5lbmVyZ3lTeW5jQmFzZSA9IHsgY3VycmVudDogcGFnZUVuZXJneS5jdXJyZW50LCBtYXg6IHBhZ2VFbmVyZ3kubWF4LCB1cGRhdGVkQXQ6IG5vdyB9O1xuICAgICAgICByZXR1cm4gcGFnZUVuZXJneTtcbiAgICB9XG5cbiAgICAvLyAyLiBFY28gTW9kZSAvIEJhY2tncm91bmQgVGFiOiBVc2UgTygxKSBtYXRoZW1hdGljYWwgY2FsY3VsYXRpb24gd2hlbiBpbnZpc2libGUgb3IgdHJhbnNpdGlvbmluZ1xuICAgIGNvbnN0IHN5bmNCYXNlID0gc3RhdGUuZW5lcmd5U3luY0Jhc2U7XG4gICAgaWYgKHN5bmNCYXNlICYmIHR5cGVvZiBzeW5jQmFzZS5jdXJyZW50ID09PSAnbnVtYmVyJykge1xuICAgICAgICBjb25zdCBtYXggPSBzeW5jQmFzZS5tYXggfHwgc3RhdGUubWF4RW5lcmd5IHx8IDExNTtcbiAgICAgICAgY29uc3QgZWxhcHNlZE1pbnMgPSBzeW5jQmFzZS51cGRhdGVkQXQgPyAobm93IC0gc3luY0Jhc2UudXBkYXRlZEF0KSAvIDYwMDAwIDogMDtcbiAgICAgICAgY29uc3QgcmVnZW5SYXRlID0gc3RhdGUucmVnZW5SYXRlIHx8IGdldFJlZ2lvbkhlYWx0aEJvbnVzKCkgfHwgMS4wO1xuICAgICAgICBjb25zdCBnYWluZWQgPSBNYXRoLmZsb29yKGVsYXBzZWRNaW5zICogcmVnZW5SYXRlKTtcbiAgICAgICAgY29uc3QgY2FsY3VsYXRlZCA9IE1hdGgubWluKG1heCwgc3luY0Jhc2UuY3VycmVudCArIE1hdGgubWF4KDAsIGdhaW5lZCkpO1xuICAgICAgICByZXR1cm4geyBjdXJyZW50OiBjYWxjdWxhdGVkLCBtYXggfTtcbiAgICB9XG5cbiAgICBpZiAocGFnZUVuZXJneSkge1xuICAgICAgICByZXR1cm4gcGFnZUVuZXJneTtcbiAgICB9XG5cbiAgICByZXR1cm4geyBjdXJyZW50OiBzdGF0ZS5jdXJyZW50RW5lcmd5IHx8IDAsIG1heDogc3RhdGUubWF4RW5lcmd5IHx8IDExNSB9O1xufVxuXG4vKiogQ2hlY2tzIGlmIGN1cnJlbnQgbG9jYWwgdGltZSBpcyB3aXRoaW4gY29uZmlndXJlZCBzbGVlcCBob3VycyAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzU2xlZXBUaW1lKENPTkZJRykge1xuICAgIGlmICghQ09ORklHPy5zbGVlcFNjaGVkdWxlRW5hYmxlZCkgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XG4gICAgY29uc3QgY3VycmVudEhvdXIgPSBub3cuZ2V0SG91cnMoKTtcbiAgICBjb25zdCBzdGFydCA9IENPTkZJRy5zbGVlcFN0YXJ0SG91ciA/PyAxO1xuICAgIGNvbnN0IGVuZCA9IENPTkZJRy5zbGVlcEVuZEhvdXIgPz8gNjtcblxuICAgIGlmIChzdGFydCA8IGVuZCkge1xuICAgICAgICByZXR1cm4gY3VycmVudEhvdXIgPj0gc3RhcnQgJiYgY3VycmVudEhvdXIgPCBlbmQ7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGN1cnJlbnRIb3VyID49IHN0YXJ0IHx8IGN1cnJlbnRIb3VyIDwgZW5kO1xuICAgIH1cbn1cblxubGV0IF9jYWNoZWRSZWdpb25EZXRhaWxzID0gbnVsbDtcbmxldCBfbGFzdFJlZ2lvblNjYW5UaW1lID0gMDtcblxuLyoqXG4gKiBTY3JhcGVzIHRoZSBjaXR5L3JlZ2lvbiBIZWFsdGggaW5kZXggKEtlc2VoYXRhbikgYW5kIHJlZ2lvbiBuYW1lIGZyb20gdGhlIGRhc2hib2FyZCBET00uXG4gKiBDYWNoZWQgZm9yIDMwcyBpbiBFY28tTW9kZSB0byBlbGltaW5hdGUgcmVwZXRpdGl2ZSBET00gcXVlcnlpbmcgZXZlcnkgc2Vjb25kLlxuICogQHBhcmFtIHtib29sZWFufSBbZm9yY2U9ZmFsc2VdXG4gKiBAcmV0dXJucyB7eyBuYW1lOiBzdHJpbmcsIGxldmVsOiBudW1iZXIsIGJvbnVzUGVyY2VudDogbnVtYmVyLCBib251c011bHRpcGxpZXI6IG51bWJlciB9fVxuICovXG4vKipcbiAqIFJlYWRzIHRoZSBhdXRob3JpdGF0aXZlIFwiUGVudWggZGFsYW0gPHRpbWU+XCIgc3RyaW5nIGRpcmVjdGx5IGZyb20gdGhlIGdhbWUncyBkYXNoYm9hcmQgRE9NLlxuICogQHJldHVybnMge3N0cmluZ3xudWxsfSBlLmcuIFwiMSBqXCIsIFwiNDUgbW50XCIsIFwiMSBqIDE1IG1udFwiXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRHYW1lRW5lcmd5RnVsbFRleHQoKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgaXNFeGNsdWRlZCA9IGVsID0+IEJvb2xlYW4oXG4gICAgICAgICAgICBlbC5jbG9zZXN0KCcjYXctcGFuZWwsICNhdy1zZXR0aW5ncy1tb2RhbCwgI2F3LWFuYWx5dGljcy1tb2RhbCwgI2F3LWxvZy1tb2RhbCwgI2F3LW5vdGlmaWNhdGlvbi10b2FzdCcpXG4gICAgICAgICk7XG4gICAgICAgIGNvbnN0IGVuZXJneUhlYWRlcnMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdoMSwgaDIsIGgzLCBoNCwgaDUsIGg2LCBzcGFuLCBkaXYsIHAnKTtcbiAgICAgICAgZm9yIChjb25zdCBoIG9mIGVuZXJneUhlYWRlcnMpIHtcbiAgICAgICAgICAgIGlmIChpc0V4Y2x1ZGVkKGgpKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IHQgPSAoaC50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpO1xuICAgICAgICAgICAgaWYgKC9e4pqhP1xccyooPzpFTkVSR0l8RU5FUkdZKVxcYi9pLnRlc3QodCkgJiYgdC5sZW5ndGggPD0gMjUpIHtcbiAgICAgICAgICAgICAgICBsZXQgY2FyZCA9IGgucGFyZW50RWxlbWVudDtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBsZXZlbCA9IDA7IGxldmVsIDwgNCAmJiBjYXJkICYmIGNhcmQgIT09IGRvY3VtZW50LmJvZHk7IGxldmVsKyspIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdHh0ID0gY2FyZC5pbm5lclRleHQgfHwgY2FyZC50ZXh0Q29udGVudCB8fCAnJztcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbSA9IHR4dC5tYXRjaCgvUGVudWhcXHMrZGFsYW1cXHMrKFswLTlcXHNBLVphLXo8XSs/KSg/OlxcbnwkfFxcLnxcXCgpL2kpO1xuICAgICAgICAgICAgICAgICAgICBpZiAobSAmJiBtWzFdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByYXcgPSBtWzFdLnRyaW0oKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyYXcubGVuZ3RoID4gMCAmJiByYXcubGVuZ3RoIDw9IDE1KSByZXR1cm4gcmF3O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNhcmQgPSBjYXJkLnBhcmVudEVsZW1lbnQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGJvZHlUZXh0ID0gZG9jdW1lbnQuYm9keSA/IChkb2N1bWVudC5ib2R5LmlubmVyVGV4dCB8fCAnJykgOiAnJztcbiAgICAgICAgY29uc3QgbSA9IGJvZHlUZXh0Lm1hdGNoKC9QZW51aFxccytkYWxhbVxccysoWzAtOVxcc0EtWmEtejxdKz8pKD86XFxufCR8XFwufFxcKCkvaSk7XG4gICAgICAgIGlmIChtICYmIG1bMV0pIHtcbiAgICAgICAgICAgIGNvbnN0IHJhdyA9IG1bMV0udHJpbSgpO1xuICAgICAgICAgICAgaWYgKHJhdy5sZW5ndGggPiAwICYmIHJhdy5sZW5ndGggPD0gMTUpIHJldHVybiByYXc7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFJlZ2lvbkRldGFpbHMoZm9yY2UgPSBmYWxzZSkge1xuICAgIGlmICh0eXBlb2YgZG9jdW1lbnQgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHJldHVybiB7IG5hbWU6ICdXaWxheWFoJywgbGV2ZWw6IDAsIGJvbnVzUGVyY2VudDogMCwgYm9udXNNdWx0aXBsaWVyOiAxLjAgfTtcbiAgICB9XG4gICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcbiAgICBpZiAoIWZvcmNlICYmIF9jYWNoZWRSZWdpb25EZXRhaWxzICYmIChub3cgLSBfbGFzdFJlZ2lvblNjYW5UaW1lIDwgMTAwMDApKSB7XG4gICAgICAgIHJldHVybiBfY2FjaGVkUmVnaW9uRGV0YWlscztcbiAgICB9XG4gICAgbGV0IG5hbWUgPSAnJztcbiAgICBsZXQgbGV2ZWwgPSAwO1xuICAgIGxldCBib251c1BlcmNlbnQgPSAwO1xuICAgIGxldCBzY3JhcGVkUmF0ZSA9IDA7XG4gICAgbGV0IGJvZHlUZXh0ID0gJyc7XG5cbiAgICB0cnkge1xuICAgICAgICAvLyBDb2xsZWN0IHRleHQgZnJvbSBkb2N1bWVudC5ib2R5IEFORCBhbnkgYWN0aXZlIG9yIG1vdW50ZWQgdG9vbHRpcHNcbiAgICAgICAgY29uc3QgdGV4dFBhcnRzID0gW107XG4gICAgICAgIGlmIChkb2N1bWVudC5ib2R5KSB0ZXh0UGFydHMucHVzaChkb2N1bWVudC5ib2R5LmlubmVyVGV4dCB8fCAnJyk7XG4gICAgICAgIGNvbnN0IHRvb2x0aXBzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW3JvbGU9XCJ0b29sdGlwXCJdLCBbZGF0YS1yYWRpeC1wb3BwZXItY29udGVudC13cmFwcGVyXSwgW2NsYXNzKj1cInRvb2x0aXBcIiBpXSwgW2NsYXNzKj1cInBvcG92ZXJcIiBpXScpO1xuICAgICAgICBmb3IgKGNvbnN0IHRpcCBvZiB0b29sdGlwcykge1xuICAgICAgICAgICAgdGV4dFBhcnRzLnB1c2godGlwLmlubmVyVGV4dCB8fCB0aXAudGV4dENvbnRlbnQgfHwgJycpO1xuICAgICAgICB9XG4gICAgICAgIGJvZHlUZXh0ID0gdGV4dFBhcnRzLmpvaW4oJ1xcbicpO1xuXG4gICAgICAgIC8vIDEuIFJlZ2lvbiBOYW1lIFByaW9yaXR5IEE6IFwiS2FtdSBkaSBzaW5pIOKAlCA8V2lsYXlhaD5cIlxuICAgICAgICBjb25zdCBrYW11TWF0Y2ggPSBib2R5VGV4dC5tYXRjaCgvS2FtdVxccytkaVxccytzaW5pXFxzKlvigJTigJMtXVxccyooW0EtWmEtesOALcO/XFxzXXsyLDMwfSkvaSk7XG4gICAgICAgIGlmIChrYW11TWF0Y2ggJiYga2FtdU1hdGNoWzFdKSB7XG4gICAgICAgICAgICBuYW1lID0ga2FtdU1hdGNoWzFdLnRyaW0oKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFByaW9yaXR5IEI6IFwiRElURU1QQVRLQU4gREkgXFxuIDxXaWxheWFoPlwiXG4gICAgICAgIGlmICghbmFtZSkge1xuICAgICAgICAgICAgY29uc3QgZGl0ZW1wYXRrYW5NYXRjaCA9IGJvZHlUZXh0Lm1hdGNoKC9ESVRFTVBBVEtBTlxccytESVteXFxuXSpcXG4rKFtBLVphLXrDgC3Dv1xcc117MiwzMH0pXFxuL2kpO1xuICAgICAgICAgICAgaWYgKGRpdGVtcGF0a2FuTWF0Y2ggJiYgZGl0ZW1wYXRrYW5NYXRjaFsxXSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNhbmQgPSBkaXRlbXBhdGthbk1hdGNoWzFdLnRyaW0oKTtcbiAgICAgICAgICAgICAgICBpZiAoIS9eKD86RElcXHMrUEVUQXxQRVRBfE1BUClcXGIvaS50ZXN0KGNhbmQpKSB7XG4gICAgICAgICAgICAgICAgICAgIG5hbWUgPSBjYW5kO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFByaW9yaXR5IEM6IFwiTmVnYXJhIEtlc2F0dWFuIFJlcHVibGlrIEluZG9uZXNpYSBcXG4gPFdpbGF5YWg+XCJcbiAgICAgICAgaWYgKCFuYW1lKSB7XG4gICAgICAgICAgICBjb25zdCBua3JpTWF0Y2ggPSBib2R5VGV4dC5tYXRjaCgvKD86TmVnYXJhXFxzK0tlc2F0dWFuXFxzK1JlcHVibGlrXFxzK0luZG9uZXNpYXxOS1JJKVteXFxuXSpcXG4rKFtBLVphLXrDgC3Dv1xcc117MiwzMH0pXFxuL2kpO1xuICAgICAgICAgICAgaWYgKG5rcmlNYXRjaCAmJiBua3JpTWF0Y2hbMV0pIHtcbiAgICAgICAgICAgICAgICBuYW1lID0gbmtyaU1hdGNoWzFdLnRyaW0oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFByaW9yaXR5IEQ6IFRvcGJhciBoZWFkZXJcbiAgICAgICAgaWYgKCFuYW1lKSB7XG4gICAgICAgICAgICBjb25zdCB0b3BNYXRjaCA9IGJvZHlUZXh0Lm1hdGNoKC9cXGRcXGQ6XFxkXFxkXFxzK1VUQ1xccypcXG4qKFtBLVphLXrDgC3Dv1xcc117MiwzMH0pL2kpO1xuICAgICAgICAgICAgaWYgKHRvcE1hdGNoICYmIHRvcE1hdGNoWzFdKSB7XG4gICAgICAgICAgICAgICAgbmFtZSA9IHRvcE1hdGNoWzFdLnRyaW0oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENsZWFuIGFuZCBmb3JtYXQgbmFtZSB0byBUaXRsZSBDYXNlXG4gICAgICAgIGlmIChuYW1lKSB7XG4gICAgICAgICAgICBuYW1lID0gbmFtZS5zcGxpdCgnXFxuJylbMF0udHJpbSgpO1xuICAgICAgICAgICAgbmFtZSA9IG5hbWUudG9Mb3dlckNhc2UoKS5yZXBsYWNlKC9cXGJbYS16w4Atw79dL2csIGMgPT4gYy50b1VwcGVyQ2FzZSgpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIDIuIEhlYWx0aCBMZXZlbCAvIFJlZ2VuIEJvbnVzICYgUmF0ZSBEZXRlY3Rpb25cbiAgICAgICAgLy8gUHJpb3JpdHkgQTogU2NyYXBlIGV4YWN0IHJhdGUgZnJvbSBnYW1lIHRvb2x0aXA6IFwiKzEuNTQgLyBtbnRcIiBvciBcIisxLjUgLyBtbnRcIlxuICAgICAgICBjb25zdCByYXRlTWF0Y2ggPSBib2R5VGV4dC5tYXRjaCgvKD86UkVHRU5FUkFTSVxccytFTkVSR0lbXlxcblxcZF0qKT9cXCsoWzAtOS5dKylcXHMqXFwvXFxzKig/Om1udHxtaW4pL2kpO1xuICAgICAgICBpZiAocmF0ZU1hdGNoICYmIHJhdGVNYXRjaFsxXSkge1xuICAgICAgICAgICAgY29uc3QgdmFsID0gcGFyc2VGbG9hdChyYXRlTWF0Y2hbMV0pO1xuICAgICAgICAgICAgaWYgKHZhbCA+PSAwLjUgJiYgdmFsIDw9IDEwLjApIHtcbiAgICAgICAgICAgICAgICBzY3JhcGVkUmF0ZSA9IHZhbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFByaW9yaXR5IEI6IENoZWNrIGZvciBleHBsaWNpdCB0b29sdGlwIFwiS2VzZWhhdGFuIGtvdGE6ICs1NSVcIiBvciBcIis1MCVcIlxuICAgICAgICBjb25zdCB0aXBNYXRjaCA9IGJvZHlUZXh0Lm1hdGNoKC9LZXNlaGF0YW5cXHMqKD86a290YXx3aWxheWFoKT9cXHMqOlxccypcXCs/KFxcZCspJS9pKTtcbiAgICAgICAgaWYgKHRpcE1hdGNoICYmIHRpcE1hdGNoWzFdKSB7XG4gICAgICAgICAgICBib251c1BlcmNlbnQgPSBwYXJzZUludCh0aXBNYXRjaFsxXSwgMTApO1xuICAgICAgICAgICAgbGV2ZWwgPSBNYXRoLnJvdW5kKGJvbnVzUGVyY2VudCAvIDUpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUHJpb3JpdHkgQzogQ2hlY2sgZm9yIENyb3duIEJvbnVzIG11bHRpcGxpZXI6IGUuZy4gXCJCT05VUyBJTkRFS1MgKjEuMTBcIiBvciBcIkJPTlVTIElOREVLUyDDlzEuMTBcIlxuICAgICAgICBsZXQgY3Jvd25NdWx0ID0gMS4wO1xuICAgICAgICBjb25zdCBjcm93bk1hdGNoID0gYm9keVRleHQubWF0Y2goL0JPTlVTXFxzK0lOREVLU1teXFxkXFxuXSooXFxkKyg/OlxcLlxcZCspPykvaSk7XG4gICAgICAgIGlmIChjcm93bk1hdGNoICYmIGNyb3duTWF0Y2hbMV0pIHtcbiAgICAgICAgICAgIGNvbnN0IHBhcnNlZENyb3duID0gcGFyc2VGbG9hdChjcm93bk1hdGNoWzFdKTtcbiAgICAgICAgICAgIGlmIChwYXJzZWRDcm93biA+PSAxLjAgJiYgcGFyc2VkQ3Jvd24gPD0gMi4wKSB7XG4gICAgICAgICAgICAgICAgY3Jvd25NdWx0ID0gcGFyc2VkQ3Jvd247XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBQcmlvcml0eSBEOiBDaGVjayBmb3IgXCJLRVNFSEFUQU4gMTBcIiBpbiB0aGUgaW5kZXggY2FyZFxuICAgICAgICBpZiAoIWxldmVsICYmICFib251c1BlcmNlbnQpIHtcbiAgICAgICAgICAgIGNvbnN0IGtlc01hdGNoID0gYm9keVRleHQubWF0Y2goL1xcYktFU0VIQVRBTlxcYlteXFxkXFxuXSooXFxkKykvaSk7XG4gICAgICAgICAgICBpZiAoa2VzTWF0Y2ggJiYga2VzTWF0Y2hbMV0pIHtcbiAgICAgICAgICAgICAgICBsZXZlbCA9IHBhcnNlSW50KGtlc01hdGNoWzFdLCAxMCk7XG4gICAgICAgICAgICAgICAgLy8gSGVhbHRoIGJvbnVzID0gNSAqIGxldmVsICogY3Jvd25NdWx0IChlLmcuIDEwICogNSAqIDEuMTAgPSA1NSUpXG4gICAgICAgICAgICAgICAgYm9udXNQZXJjZW50ID0gTWF0aC5yb3VuZChsZXZlbCAqIDUgKiBjcm93bk11bHQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gUHJpb3JpdHkgRTogQ2hlY2sgZm9yIGRhdGEtdGVzdGlkIGFzIGZhbGxiYWNrXG4gICAgICAgIGlmICghbGV2ZWwgJiYgIWJvbnVzUGVyY2VudCkge1xuICAgICAgICAgICAgY29uc3QgZWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbZGF0YS10ZXN0aWQ9XCJyZWdpb24taW5kZXgtaGVhbHRoXCJdJyk7XG4gICAgICAgICAgICBpZiAoZWwpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBhcmlhID0gZWwucXVlcnlTZWxlY3RvcignW2FyaWEtbGFiZWwqPVwiS2VzZWhhdGFuXCJdJyk/LmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpO1xuICAgICAgICAgICAgICAgIGNvbnN0IG0gPSBhcmlhPy5tYXRjaCgvS2VzZWhhdGFuXFxzKyhcXGQrKS9pKTtcbiAgICAgICAgICAgICAgICBpZiAobSkge1xuICAgICAgICAgICAgICAgICAgICBsZXZlbCA9IHBhcnNlSW50KG1bMV0sIDEwKTtcbiAgICAgICAgICAgICAgICAgICAgYm9udXNQZXJjZW50ID0gTWF0aC5yb3VuZChsZXZlbCAqIDUgKiBjcm93bk11bHQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdbZ2V0UmVnaW9uRGV0YWlsc10gRXJyb3I6JywgZXJyKTtcbiAgICB9XG5cbiAgICAvLyBNYXRoZW1hdGljYWwgY2FsaWJyYXRpb24gYmV0d2VlbiBib251c1BlcmNlbnQgYW5kIHNjcmFwZWRSYXRlXG4gICAgaWYgKHNjcmFwZWRSYXRlID4gMCAmJiAhYm9udXNQZXJjZW50KSB7XG4gICAgICAgIGJvbnVzUGVyY2VudCA9IE1hdGgucm91bmQoKHNjcmFwZWRSYXRlIC0gMSkgKiAxMDApO1xuICAgIH1cbiAgICBpZiAoYm9udXNQZXJjZW50ID4gMCAmJiAhc2NyYXBlZFJhdGUpIHtcbiAgICAgICAgLy8gUGFybGFtZW50dW0gZm9ybXVsYTogdGljayBpbnRlcnZhbCA9IHJvdW5kKDYwIC8gKDEgKyBib251cy8xMDApKSwgcmF0ZSA9IDYwIC8gdGlja1NlY1xuICAgICAgICBjb25zdCBtdWx0ID0gMSArIChib251c1BlcmNlbnQgLyAxMDApO1xuICAgICAgICBjb25zdCB0aWNrU2VjID0gTWF0aC5yb3VuZCg2MCAvIG11bHQpO1xuICAgICAgICBzY3JhcGVkUmF0ZSA9IE1hdGgucm91bmQoKDYwIC8gdGlja1NlYykgKiAxMDApIC8gMTAwO1xuICAgIH1cblxuICAgIGxldmVsID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oMTUsIGxldmVsIHx8IE1hdGgucm91bmQoYm9udXNQZXJjZW50IC8gNSkpKTtcbiAgICBpZiAoIWJvbnVzUGVyY2VudCAmJiBsZXZlbCA+IDApIHtcbiAgICAgICAgYm9udXNQZXJjZW50ID0gbGV2ZWwgKiA1O1xuICAgIH1cblxuICAgIC8vIFByZXNlcnZlIHByZXZpb3VzbHkgY29uZmlybWVkIGhpZ2hlciB2YWx1ZXMgZm9yIHRoZSBzYW1lIHJlZ2lvbiAocHJldmVudHMgZHJvcCBpZiB0b29sdGlwIHVubW91bnRzKVxuICAgIGlmIChfY2FjaGVkUmVnaW9uRGV0YWlscyAmJiBfY2FjaGVkUmVnaW9uRGV0YWlscy5uYW1lID09PSAobmFtZSB8fCBfY2FjaGVkUmVnaW9uRGV0YWlscy5uYW1lKSkge1xuICAgICAgICBpZiAoX2NhY2hlZFJlZ2lvbkRldGFpbHMuYm9udXNQZXJjZW50ID4gYm9udXNQZXJjZW50ICYmICFib2R5VGV4dC5pbmNsdWRlcygnS2VzZWhhdGFuJykpIHtcbiAgICAgICAgICAgIGJvbnVzUGVyY2VudCA9IF9jYWNoZWRSZWdpb25EZXRhaWxzLmJvbnVzUGVyY2VudDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoX2NhY2hlZFJlZ2lvbkRldGFpbHMuYm9udXNNdWx0aXBsaWVyID4gc2NyYXBlZFJhdGUgJiYgIWJvZHlUZXh0LmluY2x1ZGVzKCcvbW50JykpIHtcbiAgICAgICAgICAgIHNjcmFwZWRSYXRlID0gX2NhY2hlZFJlZ2lvbkRldGFpbHMuYm9udXNNdWx0aXBsaWVyO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgZmluYWxNdWx0aXBsaWVyID0gc2NyYXBlZFJhdGUgPiAwID8gc2NyYXBlZFJhdGUgOiAoMSArIChib251c1BlcmNlbnQgLyAxMDApKTtcblxuICAgIGNvbnN0IHJlc3VsdCA9IHtcbiAgICAgICAgbmFtZTogbmFtZSB8fCAoX2NhY2hlZFJlZ2lvbkRldGFpbHM/Lm5hbWUpIHx8ICdKYXdhIEJhcmF0JyxcbiAgICAgICAgbGV2ZWwsXG4gICAgICAgIGJvbnVzUGVyY2VudDogYm9udXNQZXJjZW50IHx8IChfY2FjaGVkUmVnaW9uRGV0YWlscz8uYm9udXNQZXJjZW50KSB8fCAwLFxuICAgICAgICBib251c011bHRpcGxpZXI6IGZpbmFsTXVsdGlwbGllciB8fCAxLjBcbiAgICB9O1xuXG4gICAgaWYgKG5hbWUgfHwgbGV2ZWwgPiAwIHx8IGJvbnVzUGVyY2VudCA+IDAgfHwgc2NyYXBlZFJhdGUgPiAwKSB7XG4gICAgICAgIF9jYWNoZWRSZWdpb25EZXRhaWxzID0gcmVzdWx0O1xuICAgICAgICBfbGFzdFJlZ2lvblNjYW5UaW1lID0gbm93O1xuICAgIH1cblxuICAgIHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogU2NyYXBlcyB0aGUgY2l0eS9yZWdpb24gSGVhbHRoIGluZGV4IChLZXNlaGF0YW4pIGZyb20gdGhlIGRhc2hib2FyZCBET00uXG4gKiBFYWNoIGxldmVsIG9mIEhlYWx0aCBnaXZlcyArNSUgcGFzc2l2ZSBlbmVyZ3kgcmVjb3ZlcnkuXG4gKiBFLmcuLCBMZXZlbCA5LzEwIGluIEpha2FydGEgZ2l2ZXMgKzQ1JSBib251cyAtPiBtdWx0aXBsaWVyIDEuNDUuXG4gKiBAcmV0dXJucyB7bnVtYmVyfSBNdWx0aXBsaWVyIChlLmcuIDEuNDUsIG9yIDEuMCBpZiBub3QgZm91bmQpXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZWdpb25IZWFsdGhCb251cygpIHtcbiAgICByZXR1cm4gZ2V0UmVnaW9uRGV0YWlscygpLmJvbnVzTXVsdGlwbGllcjtcbn1cblxuLyoqIE1pbGxpc2Vjb25kcyByZW1haW5pbmcgdW50aWwgc2xlZXAgaG91cnMgY29uY2x1ZGUgKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRNc1VudGlsU2xlZXBFbmQoQ09ORklHKSB7XG4gICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKTtcbiAgICBjb25zdCBlbmQgPSBuZXcgRGF0ZSgpO1xuICAgIGVuZC5zZXRIb3VycyhDT05GSUcuc2xlZXBFbmRIb3VyID8/IDYsIDAsIDAsIDApO1xuICAgIGlmIChlbmQgPD0gbm93KSBlbmQuc2V0RGF0ZShlbmQuZ2V0RGF0ZSgpICsgMSk7XG4gICAgcmV0dXJuIE1hdGgubWF4KDEwMDAsIGVuZC5nZXRUaW1lKCkgLSBub3cuZ2V0VGltZSgpKTtcbn1cblxuLyoqIEBwYXJhbSB7b2JqZWN0fSBzdGF0ZSBAcGFyYW0ge29iamVjdH0gQ09ORklHIEByZXR1cm5zIHtudW1iZXJ9IG1pbGxpc2Vjb25kcyB0byB3YWl0ICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0TmV4dFdvcmtEZWxheShzdGF0ZSwgQ09ORklHKSB7XG4gICAgaWYgKGlzU2xlZXBUaW1lKENPTkZJRykpIHtcbiAgICAgICAgcmV0dXJuIGdldE1zVW50aWxTbGVlcEVuZChDT05GSUcpO1xuICAgIH1cblxuICAgIGxldCB0aHJlc2hvbGQgPSBDT05GSUcuZW5lcmd5VGhyZXNob2xkO1xuICAgIGlmIChDT05GSUcuc3RlYWx0aEppdHRlckVuYWJsZWQpIHtcbiAgICAgICAgLy8gSHVtYW5pemVyOiB2YXJpYXNpIGFjYWsgLTEgcy9kICsyIGVuZXJnaVxuICAgICAgICBjb25zdCB2YXJpYW5jZSA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDQpIC0gMTtcbiAgICAgICAgdGhyZXNob2xkID0gTWF0aC5taW4oMTAwLCBNYXRoLm1heCgxMCwgdGhyZXNob2xkICsgdmFyaWFuY2UpKTtcbiAgICB9XG5cbiAgICBpZiAoc3RhdGUuY3VycmVudEVuZXJneSA+PSB0aHJlc2hvbGQpIHJldHVybiAzMDAwO1xuICAgIGNvbnN0IGVuZXJneU5lZWRlZCA9IHRocmVzaG9sZCAtIHN0YXRlLmN1cnJlbnRFbmVyZ3k7XG4gICAgY29uc3QgcmVnZW5SYXRlID0gc3RhdGUucmVnZW5SYXRlIHx8IGdldFJlZ2lvbkhlYWx0aEJvbnVzKCkgfHwgMS4wO1xuICAgIHN0YXRlLnJlZ2VuUmF0ZSA9IHJlZ2VuUmF0ZTtcbiAgICBjb25zdCBtc05lZWRlZCA9IChlbmVyZ3lOZWVkZWQgLyByZWdlblJhdGUpICogNjAwMDA7XG4gICAgY29uc3Qgaml0dGVyID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogNzAwMCkgKyAzMDAwO1xuICAgIHJldHVybiBNYXRoLnJvdW5kKG1zTmVlZGVkICsgaml0dGVyKTtcbn1cblxuLyoqIEBwYXJhbSB7b2JqZWN0fSBzdGF0ZSBAcGFyYW0ge29iamVjdH0gQ09ORklHIEByZXR1cm5zIHtzdHJpbmd9ICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0TGl2ZUNvdW50ZG93bihzdGF0ZSwgQ09ORklHKSB7XG4gICAgaWYgKGlzU2xlZXBUaW1lKENPTkZJRykpIHJldHVybiAnVGlkdXInO1xuICAgIGNvbnN0IHRocmVzaG9sZCA9IENPTkZJRy5lbmVyZ3lUaHJlc2hvbGQgfHwgMTA7XG4gICAgY29uc3QgY3VyRW5lcmd5ID0gc3RhdGUuY3VycmVudEVuZXJneSA/PyAwO1xuICAgIGlmIChjdXJFbmVyZ3kgPj0gdGhyZXNob2xkKSByZXR1cm4gJ05vdyEnO1xuICAgIGxldCByZW1haW5pbmcgPSAoc3RhdGUubmV4dFdvcmtUaW1lc3RhbXAgfHwgMCkgLSBEYXRlLm5vdygpO1xuICAgIGlmICghc3RhdGUubmV4dFdvcmtUaW1lc3RhbXAgJiYgY3VyRW5lcmd5IDwgdGhyZXNob2xkKSB7XG4gICAgICAgIGNvbnN0IHJlZ2VuUmF0ZSA9IHN0YXRlLnJlZ2VuUmF0ZSB8fCAxLjA7XG4gICAgICAgIHJlbWFpbmluZyA9IE1hdGgubWF4KDEsICh0aHJlc2hvbGQgLSBjdXJFbmVyZ3kpIC8gcmVnZW5SYXRlKSAqIDYwMDAwO1xuICAgIH1cbiAgICBpZiAocmVtYWluaW5nIDw9IDApIHJldHVybiAnTWVudW5nZ3UgZW5lcmdpLi4uJztcbiAgICBjb25zdCB0b3RhbCA9IE1hdGguY2VpbChyZW1haW5pbmcgLyAxMDAwKTtcbiAgICByZXR1cm4gYCR7TWF0aC5mbG9vcih0b3RhbCAvIDYwKX1tICR7U3RyaW5nKHRvdGFsICUgNjApLnBhZFN0YXJ0KDIsICcwJyl9c2A7XG59XG5cbi8qKiBAcGFyYW0ge29iamVjdH0gc3RhdGUgQHJldHVybnMge3N0cmluZ30gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRUaW1lVG9GdWxsRW5lcmd5KHN0YXRlKSB7XG4gICAgY29uc3QgbWF4RSA9IE1hdGgubWF4KDUwLCBzdGF0ZS5tYXhFbmVyZ3kgfHwgMTE1KTtcbiAgICBjb25zdCBjdXJFID0gTWF0aC5tYXgoMCwgc3RhdGUuY3VycmVudEVuZXJneSA/PyAwKTtcbiAgICBjb25zdCBuZWVkZWQgPSBNYXRoLm1heCgwLCBtYXhFIC0gY3VyRSk7XG4gICAgaWYgKG5lZWRlZCA8PSAwKSByZXR1cm4gJ1BlbnVoISc7XG5cbiAgICBjb25zdCByZWdlblJhdGUgPSBNYXRoLm1heCgwLjUsIHN0YXRlLnJlZ2VuUmF0ZSB8fCAxLjApO1xuICAgIGNvbnN0IGV4YWN0TWludXRlcyA9IE1hdGgubWF4KDEsIE1hdGgucm91bmQobmVlZGVkIC8gcmVnZW5SYXRlKSk7XG5cbiAgICBpZiAoZXhhY3RNaW51dGVzIDwgNjApIHtcbiAgICAgICAgcmV0dXJuIGB+JHtleGFjdE1pbnV0ZXN9IG1udGA7XG4gICAgfVxuICAgIGNvbnN0IGggPSBNYXRoLm1heCgwLCBNYXRoLmZsb29yKGV4YWN0TWludXRlcyAvIDYwKSk7XG4gICAgY29uc3QgbSA9IE1hdGgubWF4KDAsIGV4YWN0TWludXRlcyAlIDYwKTtcbiAgICBpZiAobSA9PT0gMCkgcmV0dXJuIGB+JHtofSBqYDtcbiAgICBpZiAoaCA8IDI0KSByZXR1cm4gYH4ke2h9IGogJHttfSBtbnRgO1xuICAgIGNvbnN0IGQgPSBNYXRoLmZsb29yKGggLyAyNCk7XG4gICAgcmV0dXJuIGB+JHtkfSBoYXJpICR7aCAlIDI0fSBqYDtcbn1cblxubGV0IF9wbGF5ZXJMZXZlbExhc3RTY2FuID0gMDtcblxuLyoqIEBwYXJhbSB7b2JqZWN0fSBzdGF0ZSBAcmV0dXJucyB7bnVtYmVyfSAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldFBsYXllckxldmVsKHN0YXRlKSB7XG4gICAgaWYgKERhdGUubm93KCkgLSBfcGxheWVyTGV2ZWxMYXN0U2NhbiA8IDEwMDAwKSByZXR1cm4gc3RhdGUucGxheWVyTGV2ZWw7XG4gICAgX3BsYXllckxldmVsTGFzdFNjYW4gPSBEYXRlLm5vdygpO1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHdhbGtlciA9IGRvY3VtZW50LmNyZWF0ZVRyZWVXYWxrZXIoZG9jdW1lbnQuYm9keSB8fCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQsIE5vZGVGaWx0ZXIuU0hPV19URVhUKTtcbiAgICAgICAgbGV0IG5vZGU7XG4gICAgICAgIHdoaWxlICgobm9kZSA9IHdhbGtlci5uZXh0Tm9kZSgpKSkge1xuICAgICAgICAgICAgY29uc3QgbSA9IG5vZGUudGV4dENvbnRlbnQudHJpbSgpLm1hdGNoKC9eTGV2ZWxcXHMrKFxcZCspJC9pKTtcbiAgICAgICAgICAgIGlmIChtKSByZXR1cm4gcGFyc2VJbnQobVsxXSwgMTApO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG4gICAgcmV0dXJuIHN0YXRlLnBsYXllckxldmVsO1xufVxuXG4vKiogQHBhcmFtIHtudW1iZXJ9IGxldmVsIEByZXR1cm5zIHtudW1iZXJ9ICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0TWF4RW5lcmd5Rm9yTGV2ZWwobGV2ZWwpIHtcbiAgICByZXR1cm4gTWF0aC5taW4oMzAwLCAxMDAgKyA1ICogKGxldmVsIC0gMSkpO1xufVxuXG5sZXQgX2xhc3RQYXRjaGVkQ3VycmVudCA9IG51bGw7XG5sZXQgX2xhc3RQYXRjaGVkTWF4ID0gbnVsbDtcbmxldCBfbGFzdFBhdGNoVGltZSA9IDA7XG5cbi8qKlxuICogU2FmZWx5IHVwZGF0ZXMgdGhlIHZpc3VhbCBlbmVyZ3kgaW5kaWNhdG9ycyBvbiB0aGUgaG9zdCBwYWdlICh0b3AgbmF2aWdhdGlvbiBwaWxsLFxuICogZGFzaGJvYXJkIFwiRU5FUkdJXCIgY2FyZCwgcHJvZ3Jlc3MgYmFyLCBhbmQgXCJLRVJKQUtBTiBTQVRVIEdJTElSQU5cIiBidXR0b24gc3RhdGUpLlxuICogXG4gKiBNb2RpZmllcyB0ZXh0IHZhbHVlcyB2aWEgZXhpc3RpbmcgdGV4dCBub2RlcyAobm9kZS5ub2RlVmFsdWUpIGFuZCBlbGVtZW50IHN0eWxlc1xuICogd2l0aG91dCBkZXN0cm95aW5nIG9yIHJlcGxhY2luZyBSZWFjdCBET00gZWxlbWVudHMuXG4gKiBcbiAqIEBwYXJhbSB7bnVtYmVyfSBjdXJyZW50XG4gKiBAcGFyYW0ge251bWJlcn0gW21heF1cbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW2ZvcmNlPWZhbHNlXVxuICovXG5leHBvcnQgZnVuY3Rpb24gcGF0Y2hQYWdlVmlzdWFsRW5lcmd5KGN1cnJlbnQsIG1heCwgZm9yY2UgPSBmYWxzZSkge1xuICAgIGlmICh0eXBlb2YgZG9jdW1lbnQgPT09ICd1bmRlZmluZWQnKSByZXR1cm47XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgc2FmZUN1cnJlbnQgPSBNYXRoLm1heCgwLCBNYXRoLnJvdW5kKGN1cnJlbnQpKTtcbiAgICAgICAgY29uc3Qgc2FmZU1heCA9ICh0eXBlb2YgbWF4ID09PSAnbnVtYmVyJyAmJiBtYXggPiAwKSA/IE1hdGgucm91bmQobWF4KSA6IDExNTtcbiAgICAgICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblxuICAgICAgICAvLyBUaHJvdHRsZSByZWR1bmRhbnQgY2FsbHMgaWYgZW5lcmd5IGhhc24ndCBjaGFuZ2VkIHdpdGhpbiAxMDAwbXNcbiAgICAgICAgaWYgKCFmb3JjZSAmJiBzYWZlQ3VycmVudCA9PT0gX2xhc3RQYXRjaGVkQ3VycmVudCAmJiBzYWZlTWF4ID09PSBfbGFzdFBhdGNoZWRNYXggJiYgKG5vdyAtIF9sYXN0UGF0Y2hUaW1lIDwgMTAwMCkpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBfbGFzdFBhdGNoZWRDdXJyZW50ID0gc2FmZUN1cnJlbnQ7XG4gICAgICAgIF9sYXN0UGF0Y2hlZE1heCA9IHNhZmVNYXg7XG4gICAgICAgIF9sYXN0UGF0Y2hUaW1lID0gbm93O1xuXG4gICAgICAgIGNvbnN0IHBjdCA9IE1hdGgubWluKDEwMCwgTWF0aC5tYXgoMCwgKHNhZmVDdXJyZW50IC8gc2FmZU1heCkgKiAxMDApKS50b0ZpeGVkKDEpO1xuXG4gICAgICAgIGNvbnN0IEZPUkJJRERFTl9XT1JEUyA9IC8oPzpTS09SXFxzK0tPVEF8S0FQQVNJVEFTXFxzK1dJTEFZQUh8UEVUQVxccytMQU5HU1VOR3xJTkZSQVNUUlVLVFVSKS9pO1xuXG4gICAgICAgIGNvbnN0IGlzRXhjbHVkZWQgPSBlbCA9PiB7XG4gICAgICAgICAgICBpZiAoIWVsKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIGlmIChlbC5jbG9zZXN0KCcjYXctcGFuZWwsICNhdy1zZXR0aW5ncy1tb2RhbCwgI2F3LWFuYWx5dGljcy1tb2RhbCwgI2F3LWxvZy1tb2RhbCwgI2F3LW5vdGlmaWNhdGlvbi10b2FzdCcpKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRhaW5lciA9IGVsLmNsb3Nlc3QoJ2Rpdiwgc2VjdGlvbiwgYXJ0aWNsZScpO1xuICAgICAgICAgICAgaWYgKGNvbnRhaW5lcikge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRleHQgPSBjb250YWluZXIudGV4dENvbnRlbnQgfHwgJyc7XG4gICAgICAgICAgICAgICAgaWYgKEZPUkJJRERFTl9XT1JEUy50ZXN0KHRleHQpICYmICEvXlxccyrimqE/XFxzKkVORVJHSVxcYi9pLnRlc3QodGV4dCkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9O1xuXG4gICAgICAgIGZ1bmN0aW9uIHBhdGNoVGV4dEluRWxlbWVudChlbCkge1xuICAgICAgICAgICAgY29uc3Qgd2Fsa2VyID0gZG9jdW1lbnQuY3JlYXRlVHJlZVdhbGtlcihlbCwgTm9kZUZpbHRlci5TSE9XX1RFWFQpO1xuICAgICAgICAgICAgbGV0IG5vZGU7XG4gICAgICAgICAgICBsZXQgcGF0Y2hlZCA9IGZhbHNlO1xuICAgICAgICAgICAgd2hpbGUgKChub2RlID0gd2Fsa2VyLm5leHROb2RlKCkpKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdmFsID0gbm9kZS5ub2RlVmFsdWUgfHwgJyc7XG4gICAgICAgICAgICAgICAgaWYgKHZhbC5pbmNsdWRlcygnLycpICYmIC9cXGQrXFxzKlxcL1xccypcXGQrLy50ZXN0KHZhbCkpIHtcbiAgICAgICAgICAgICAgICAgICAgbm9kZS5ub2RlVmFsdWUgPSB2YWwucmVwbGFjZSgvKFxcZCspKFxccypcXC9cXHMqKShcXGQrKS8sIChtYXRjaCwgcDEsIHAyLCBwMykgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbU1heCA9IHBhcnNlSW50KHAzLCAxMCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobU1heCA+PSA1MCAmJiBtTWF4IDw9IDM1MCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhdGNoZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBgJHtzYWZlQ3VycmVudH0ke3AyfSR7c2FmZU1heCB8fCBtTWF4fWA7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gbWF0Y2g7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghcGF0Y2hlZCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRleHQgPSAoZWwudGV4dENvbnRlbnQgfHwgJycpLnRyaW0oKTtcbiAgICAgICAgICAgICAgICBjb25zdCBtID0gdGV4dC5tYXRjaCgvXihcXGQrKShcXHMqXFwvXFxzKikoXFxkKykkLyk7XG4gICAgICAgICAgICAgICAgaWYgKG0pIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbU1heCA9IHBhcnNlSW50KG1bM10sIDEwKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1NYXggPj0gNTAgJiYgbU1heCA8PSAzNTApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHdhbGtlcjIgPSBkb2N1bWVudC5jcmVhdGVUcmVlV2Fsa2VyKGVsLCBOb2RlRmlsdGVyLlNIT1dfVEVYVCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgZmlyc3RUZXh0Tm9kZSA9IHdhbGtlcjIubmV4dE5vZGUoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChmaXJzdFRleHROb2RlICYmIC9eXFxkKyQvLnRlc3QoZmlyc3RUZXh0Tm9kZS5ub2RlVmFsdWU/LnRyaW0oKSB8fCAnJykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaXJzdFRleHROb2RlLm5vZGVWYWx1ZSA9IFN0cmluZyhzYWZlQ3VycmVudCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyAxLiBEYXNoYm9hcmQgXCJFTkVSR0lcIiBjYXJkIE9OTFlcbiAgICAgICAgY29uc3QgZW5lcmd5SGVhZGVycyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2gxLCBoMiwgaDMsIGg0LCBoNSwgaDYsIHNwYW4sIGRpdiwgcCcpO1xuICAgICAgICBmb3IgKGNvbnN0IGggb2YgZW5lcmd5SGVhZGVycykge1xuICAgICAgICAgICAgaWYgKGlzRXhjbHVkZWQoaCkpIGNvbnRpbnVlO1xuICAgICAgICAgICAgY29uc3QgdCA9IChoLnRleHRDb250ZW50IHx8ICcnKS50cmltKCk7XG4gICAgICAgICAgICBpZiAoL17imqE/XFxzKig/OkVORVJHSXxFTkVSR1kpXFxiL2kudGVzdCh0KSAmJiB0Lmxlbmd0aCA8PSAxNSkge1xuICAgICAgICAgICAgICAgIGxldCBjYXJkID0gaC5wYXJlbnRFbGVtZW50O1xuICAgICAgICAgICAgICAgIGxldCBkZXB0aCA9IDA7XG4gICAgICAgICAgICAgICAgd2hpbGUgKGNhcmQgJiYgY2FyZCAhPT0gZG9jdW1lbnQuYm9keSAmJiBkZXB0aCA8IDUpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY2FyZFRleHQgPSAoY2FyZC50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoRk9SQklEREVOX1dPUkRTLnRlc3QoY2FyZFRleHQpKSBicmVhaztcblxuICAgICAgICAgICAgICAgICAgICBpZiAoY2FyZFRleHQuaW5jbHVkZXMoJy8nKSAmJiAvXFxkK1xccypcXC9cXHMqXFxkKy8udGVzdChjYXJkVGV4dCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFBhdGNoIHRleHQgbm9kZXMgaW4gY2FyZFxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaW5uZXJFbHMgPSBjYXJkLnF1ZXJ5U2VsZWN0b3JBbGwoJyonKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgZWwgb2YgaW5uZXJFbHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoaXNFeGNsdWRlZChlbCkpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHR4dCA9IChlbC50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eHQuaW5jbHVkZXMoJy8nKSAmJiB0eHQubGVuZ3RoIDw9IDI1ICYmIC9cXGQrXFxzKlxcL1xccypcXGQrLy50ZXN0KHR4dCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGF0Y2hUZXh0SW5FbGVtZW50KGVsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFBhdGNoIHByb2dyZXNzIGJhciB3aWR0aCBpbiB0aGlzIGNvbnRhaW5lciBvciBhbnkgY2hpbGQvc2libGluZ1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYmFycyA9IGNhcmQucXVlcnlTZWxlY3RvckFsbCgnW3JvbGU9XCJwcm9ncmVzc2JhclwiXSwgZGl2W3N0eWxlKj1cIndpZHRoXCJdLCBzcGFuW3N0eWxlKj1cIndpZHRoXCJdLCBbY2xhc3MqPVwiYmctY3lhblwiIGldLCBbY2xhc3MqPVwiYmctdGVhbFwiIGldLCBbY2xhc3MqPVwiYmctZW1lcmFsZFwiIGldJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGJhciBvZiBiYXJzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGlzRXhjbHVkZWQoYmFyKSkgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYmFyLnN0eWxlLndpZHRoID0gYCR7cGN0fSVgO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChiYXIuaGFzQXR0cmlidXRlKCdhcmlhLXZhbHVlbm93JykpIGJhci5zZXRBdHRyaWJ1dGUoJ2FyaWEtdmFsdWVub3cnLCBTdHJpbmcoc2FmZUN1cnJlbnQpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoYmFyLmhhc0F0dHJpYnV0ZSgnYXJpYS12YWx1ZW1heCcpKSBiYXIuc2V0QXR0cmlidXRlKCdhcmlhLXZhbHVlbWF4JywgU3RyaW5nKHNhZmVNYXgpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGJhcnMubGVuZ3RoID4gMCkgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY2FyZCA9IGNhcmQucGFyZW50RWxlbWVudDtcbiAgICAgICAgICAgICAgICAgICAgZGVwdGgrKztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyAyLiBOYXZpZ2F0aW9uIGJhciBlbmVyZ3kgcGlsbHMgKFRvcCBoZWFkZXIgYW5kIGJvdHRvbSBiYXIpXG4gICAgICAgIGNvbnN0IG5hdkNhbmRpZGF0ZXMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdoZWFkZXIsIG5hdiwgZm9vdGVyLCBbcm9sZT1cImJhbm5lclwiXSwgW2NsYXNzKj1cIm5hdlwiIGldLCBbY2xhc3MqPVwiaGVhZGVyXCIgaV0sIFtjbGFzcyo9XCJ0b3BiYXJcIiBpXSwgW2NsYXNzKj1cIm5hdmJhclwiIGldLCBbY2xhc3MqPVwiYm90dG9tXCIgaV0nKTtcbiAgICAgICAgZm9yIChjb25zdCBjb250YWluZXIgb2YgbmF2Q2FuZGlkYXRlcykge1xuICAgICAgICAgICAgaWYgKGlzRXhjbHVkZWQoY29udGFpbmVyKSkgY29udGludWU7XG4gICAgICAgICAgICBjb25zdCBlbHMgPSBjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnKicpO1xuICAgICAgICAgICAgZm9yIChjb25zdCBlbCBvZiBlbHMpIHtcbiAgICAgICAgICAgICAgICBpZiAoaXNFeGNsdWRlZChlbCkpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIGNvbnN0IHR4dCA9IChlbC50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpO1xuICAgICAgICAgICAgICAgIGlmICh0eHQuaW5jbHVkZXMoJy8nKSAmJiB0eHQubGVuZ3RoIDw9IDMwICYmIC9cXGQrXFxzKlxcL1xccypcXGQrLy50ZXN0KHR4dCkpIHtcbiAgICAgICAgICAgICAgICAgICAgcGF0Y2hUZXh0SW5FbGVtZW50KGVsKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyAzLiBXb3JrIGJ1dHRvbiB2aXN1YWwgc3RhdGVcbiAgICAgICAgY29uc3QgYnV0dG9ucyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2J1dHRvbicpO1xuICAgICAgICBmb3IgKGNvbnN0IGJ0biBvZiBidXR0b25zKSB7XG4gICAgICAgICAgICBpZiAoaXNFeGNsdWRlZChidG4pKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IGJ0blRleHQgPSAoYnRuLnRleHRDb250ZW50IHx8ICcnKS50cmltKCk7XG4gICAgICAgICAgICBpZiAoL0tFUkpBS0FOXFxzK1NBVFVcXHMrR0lMSVJBTi9pLnRlc3QoYnRuVGV4dCkpIHtcbiAgICAgICAgICAgICAgICAvLyBVcGRhdGUg4pqhIG51bWJlciBpbnNpZGUgYnV0dG9uIGlmIHByZXNlbnRcbiAgICAgICAgICAgICAgICBjb25zdCB3YWxrZXIgPSBkb2N1bWVudC5jcmVhdGVUcmVlV2Fsa2VyKGJ0biwgTm9kZUZpbHRlci5TSE9XX1RFWFQpO1xuICAgICAgICAgICAgICAgIGxldCBub2RlO1xuICAgICAgICAgICAgICAgIHdoaWxlICgobm9kZSA9IHdhbGtlci5uZXh0Tm9kZSgpKSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB2YWwgPSBub2RlLm5vZGVWYWx1ZSB8fCAnJztcbiAgICAgICAgICAgICAgICAgICAgaWYgKC/imqE/XFxzKlxcZCsvLnRlc3QodmFsKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbm9kZS5ub2RlVmFsdWUgPSB2YWwucmVwbGFjZSgvKOKaoT9cXHMqKShcXGQrKS8sIGAkMSR7c2FmZUN1cnJlbnR9YCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHNhZmVDdXJyZW50IDwgMTApIHtcbiAgICAgICAgICAgICAgICAgICAgYnRuLnN0eWxlLm9wYWNpdHkgPSAnMC41NSc7XG4gICAgICAgICAgICAgICAgICAgIGJ0bi5zdHlsZS5maWx0ZXIgPSAnZ3JheXNjYWxlKDAuNiknO1xuICAgICAgICAgICAgICAgICAgICBidG4udGl0bGUgPSBgRW5lcmdpIHNhYXQgaW5pICR7c2FmZUN1cnJlbnR9LyR7c2FmZU1heH0gRU4gKGJ1dHVoIG1pbmltYWwgMTAgRU4gdW50dWsgZ2lsaXJhbiBrZXJqYSlgO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGJ0bi5zdHlsZS5vcGFjaXR5ID0gJzEnO1xuICAgICAgICAgICAgICAgICAgICBidG4uc3R5bGUuZmlsdGVyID0gJ25vbmUnO1xuICAgICAgICAgICAgICAgICAgICBidG4udGl0bGUgPSAnJztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cbn1cbiIsIi8qKlxuICogbm90aWZpY2F0aW9ucy5qcyDigJQgU291bmQgYWxlcnRzLCB0b2FzdCBub3RpZmljYXRpb25zLCBhbmQgYnJvd3NlciBub3RpZmljYXRpb25zXG4gKlxuICogUmVwbGFjZXMgR01fbm90aWZpY2F0aW9uIHdpdGggY2hyb21lLm5vdGlmaWNhdGlvbnMgQVBJLlxuICovXG5cbmxldCB0b2FzdFRpbWVyID0gbnVsbDtcblxuLyoqIENyZWF0ZXMgb3IgdXBkYXRlcyB0aGUgdG9hc3Qgbm90aWZpY2F0aW9uIGVsZW1lbnQuICovXG5leHBvcnQgZnVuY3Rpb24gc2hvd0luUGFnZU5vdGlmaWNhdGlvbih0aXRsZSwgbWVzc2FnZSkge1xuICAgIGlmICghZG9jdW1lbnQuYm9keSkgcmV0dXJuO1xuICAgIGxldCB0b2FzdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1ub3RpZmljYXRpb24tdG9hc3QnKTtcbiAgICBpZiAoIXRvYXN0KSB7XG4gICAgICAgIHRvYXN0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgIHRvYXN0LmlkID0gJ2F3LW5vdGlmaWNhdGlvbi10b2FzdCc7XG4gICAgICAgIHRvYXN0LnNldEF0dHJpYnV0ZSgncm9sZScsICdzdGF0dXMnKTtcbiAgICAgICAgdG9hc3Quc2V0QXR0cmlidXRlKCdhcmlhLWxpdmUnLCAncG9saXRlJyk7XG4gICAgICAgIHRvYXN0LnN0eWxlLmNzc1RleHQgPSBbXG4gICAgICAgICAgICAncG9zaXRpb246Zml4ZWQnLCAndG9wOjE2cHgnLCAncmlnaHQ6MTZweCcsICd6LWluZGV4OjEwMDAxMCcsXG4gICAgICAgICAgICAnZGlzcGxheTpub25lJywgJ3dpZHRoOm1pbigzNjBweCxjYWxjKDEwMHZ3IC0gMzJweCkpJywgJ3BhZGRpbmc6MTJweCAxNHB4JyxcbiAgICAgICAgICAgICdiYWNrZ3JvdW5kOnJnYmEoMTAsMTAsMjAsLjk3KScsICdib3JkZXI6MXB4IHNvbGlkICMwMGFhZmYnLFxuICAgICAgICAgICAgJ2JvcmRlci1sZWZ0OjRweCBzb2xpZCAjMDBlOTlhJywgJ2JvcmRlci1yYWRpdXM6NnB4JyxcbiAgICAgICAgICAgICdib3gtc2hhZG93OjAgNnB4IDI0cHggcmdiYSgwLDAsMCwuNTUpJywgJ2NvbG9yOiNlZWUnLFxuICAgICAgICAgICAgJ2ZvbnQ6MTJweC8xLjQ1IFNlZ29lIFVJLFRhaG9tYSxzYW5zLXNlcmlmJywgJ3BvaW50ZXItZXZlbnRzOm5vbmUnXG4gICAgICAgIF0uam9pbignOycpO1xuICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHRvYXN0KTtcbiAgICB9XG5cbiAgICBjb25zdCBoZWFkaW5nID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgaGVhZGluZy50ZXh0Q29udGVudCA9IHRpdGxlO1xuICAgIGhlYWRpbmcuc3R5bGUuY3NzVGV4dCA9ICdmb250LXdlaWdodDo3MDA7Y29sb3I6IzAwZTk5YTttYXJnaW4tYm90dG9tOjNweDsnO1xuICAgIGNvbnN0IGRldGFpbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIGRldGFpbC50ZXh0Q29udGVudCA9IG1lc3NhZ2U7XG4gICAgZGV0YWlsLnN0eWxlLmNvbG9yID0gJyNkZGQnO1xuICAgIHRvYXN0LnJlcGxhY2VDaGlsZHJlbihoZWFkaW5nLCBkZXRhaWwpO1xuICAgIHRvYXN0LnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuXG4gICAgaWYgKHRvYXN0VGltZXIgIT09IG51bGwpIGNsZWFyVGltZW91dCh0b2FzdFRpbWVyKTtcbiAgICB0b2FzdFRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7IHRvYXN0LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7IHRvYXN0VGltZXIgPSBudWxsOyB9LCA2MDAwKTtcbn1cblxuLyoqXG4gKiBTZW5kcyBhIHRvYXN0ICsgY2hyb21lLm5vdGlmaWNhdGlvbnMgKHJlcGxhY2VzIEdNX25vdGlmaWNhdGlvbikuXG4gKiBTdXBwb3J0cyBib3RoIHNlbmROb3RpZmljYXRpb24oQ09ORklHLCB0aXRsZSwgbWVzc2FnZSkgYW5kIHNlbmROb3RpZmljYXRpb24odGl0bGUsIG1lc3NhZ2UpLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2VuZE5vdGlmaWNhdGlvbihhcmcxLCBhcmcyLCBhcmczKSB7XG4gICAgbGV0IENPTkZJRyA9IG51bGwsIHRpdGxlID0gJycsIG1lc3NhZ2UgPSAnJztcbiAgICBpZiAodHlwZW9mIGFyZzEgPT09ICdvYmplY3QnICYmIGFyZzEgIT09IG51bGwpIHtcbiAgICAgICAgQ09ORklHID0gYXJnMTtcbiAgICAgICAgdGl0bGUgPSB0eXBlb2YgYXJnMiA9PT0gJ3N0cmluZycgPyBhcmcyIDogU3RyaW5nKGFyZzIgfHwgJycpO1xuICAgICAgICBtZXNzYWdlID0gdHlwZW9mIGFyZzMgPT09ICdzdHJpbmcnID8gYXJnMyA6IFN0cmluZyhhcmczIHx8ICcnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aXRsZSA9IHR5cGVvZiBhcmcxID09PSAnc3RyaW5nJyA/IGFyZzEgOiBTdHJpbmcoYXJnMSB8fCAnJyk7XG4gICAgICAgIG1lc3NhZ2UgPSB0eXBlb2YgYXJnMiA9PT0gJ3N0cmluZycgPyBhcmcyIDogU3RyaW5nKGFyZzIgfHwgJycpO1xuICAgIH1cblxuICAgIGlmIChDT05GSUcgJiYgIUNPTkZJRy5zZW5kTm90aWZpY2F0aW9uKSByZXR1cm47XG4gICAgc2hvd0luUGFnZU5vdGlmaWNhdGlvbih0aXRsZSwgbWVzc2FnZSk7XG5cbiAgICB0cnkge1xuICAgICAgICBjb25zdCBpc0NyaXRpY2FsID0gL2V4cGlyZWR8NDAxfGhhYmlzfGthZGFsdWFyc2F8ZGlqZWRhfGxvZ2luL2kudGVzdChgJHt0aXRsZX0gJHttZXNzYWdlfWApO1xuICAgICAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgICAgICB0eXBlOiAnTk9USUZZJyxcbiAgICAgICAgICAgIHRpdGxlLFxuICAgICAgICAgICAgbWVzc2FnZSxcbiAgICAgICAgICAgIHByaW9yaXR5OiBpc0NyaXRpY2FsID8gMiA6IDEsXG4gICAgICAgICAgICByZXF1aXJlSW50ZXJhY3Rpb246IGlzQ3JpdGljYWxcbiAgICAgICAgfSk7XG4gICAgfSBjYXRjaCB7IC8qIGV4dGVuc2lvbiBjb250ZXh0IG1heSBiZSBpbnZhbGlkYXRlZCAqLyB9XG59XG5cbi8qKlxuICogUGxheXMgc291bmQgZmVlZGJhY2sgZm9yIHN1Y2Nlc3Mgb3IgZXJyb3IuXG4gKiBTdXBwb3J0cyBib3RoIHBsYXlOb3RpZmljYXRpb25Tb3VuZChDT05GSUcsIHR5cGUpIGFuZCBwbGF5Tm90aWZpY2F0aW9uU291bmQodHlwZSkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwbGF5Tm90aWZpY2F0aW9uU291bmQoYXJnMSwgYXJnMikge1xuICAgIGxldCBDT05GSUcgPSBudWxsLCB0eXBlID0gJ3N1Y2Nlc3MnO1xuICAgIGlmICh0eXBlb2YgYXJnMSA9PT0gJ29iamVjdCcgJiYgYXJnMSAhPT0gbnVsbCkge1xuICAgICAgICBDT05GSUcgPSBhcmcxO1xuICAgICAgICB0eXBlID0gdHlwZW9mIGFyZzIgPT09ICdzdHJpbmcnID8gYXJnMiA6ICdzdWNjZXNzJztcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBhcmcxID09PSAnc3RyaW5nJykge1xuICAgICAgICB0eXBlID0gYXJnMTtcbiAgICAgICAgaWYgKHR5cGVvZiBhcmcyID09PSAnb2JqZWN0JyAmJiBhcmcyICE9PSBudWxsKSB7XG4gICAgICAgICAgICBDT05GSUcgPSBhcmcyO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKENPTkZJRyAmJiAhQ09ORklHLnNvdW5kTm90aWZpY2F0aW9uRW5hYmxlZCkgcmV0dXJuO1xuICAgIC8vIEF2b2lkIHRyaWdnZXJpbmcgQXVkaW9Db250ZXh0IG9uIGhpZGRlbiBiYWNrZ3JvdW5kIHRhYnMgdG8gcmVzcGVjdCBicm93c2VyIGF1dG9wbGF5IHBvbGljeVxuICAgIGlmICh0eXBlb2YgZG9jdW1lbnQgIT09ICd1bmRlZmluZWQnICYmIGRvY3VtZW50LmhpZGRlbikgcmV0dXJuO1xuXG4gICAgY29uc3Qgdm9sdW1lID0gQ09ORklHPy5zb3VuZE5vdGlmaWNhdGlvblZvbHVtZSAhPSBudWxsID8gQ09ORklHLnNvdW5kTm90aWZpY2F0aW9uVm9sdW1lIDogMC4zO1xuXG4gICAgY29uc3QgQXVkaW9DdHggPSB3aW5kb3cuQXVkaW9Db250ZXh0IHx8IHdpbmRvdy53ZWJraXRBdWRpb0NvbnRleHQ7XG4gICAgaWYgKCFBdWRpb0N0eCkgcmV0dXJuO1xuXG4gICAgbGV0IGN0eCA9IG51bGw7XG4gICAgdHJ5IHtcbiAgICAgICAgY3R4ID0gbmV3IEF1ZGlvQ3R4KCk7XG4gICAgICAgIGlmIChjdHguc3RhdGUgPT09ICdzdXNwZW5kZWQnKSB7XG4gICAgICAgICAgICBjdHgucmVzdW1lKCkuY2F0Y2goKCkgPT4ge30pO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3Qgb3NjID0gY3R4LmNyZWF0ZU9zY2lsbGF0b3IoKTtcbiAgICAgICAgY29uc3QgZ2FpbiA9IGN0eC5jcmVhdGVHYWluKCk7XG4gICAgICAgIG9zYy5jb25uZWN0KGdhaW4pO1xuICAgICAgICBnYWluLmNvbm5lY3QoY3R4LmRlc3RpbmF0aW9uKTtcbiAgICAgICAgZ2Fpbi5nYWluLnZhbHVlID0gdm9sdW1lO1xuXG4gICAgICAgIGlmICh0eXBlID09PSAnc3VjY2VzcycpIHtcbiAgICAgICAgICAgIG9zYy5mcmVxdWVuY3kudmFsdWUgPSA4MDA7XG4gICAgICAgICAgICBvc2Muc3RhcnQoKTtcbiAgICAgICAgICAgIG9zYy5zdG9wKGN0eC5jdXJyZW50VGltZSArIDAuMSk7XG4gICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBvMiA9IGN0eC5jcmVhdGVPc2NpbGxhdG9yKCksIGcyID0gY3R4LmNyZWF0ZUdhaW4oKTtcbiAgICAgICAgICAgICAgICAgICAgbzIuY29ubmVjdChnMik7IGcyLmNvbm5lY3QoY3R4LmRlc3RpbmF0aW9uKTtcbiAgICAgICAgICAgICAgICAgICAgZzIuZ2Fpbi52YWx1ZSA9IHZvbHVtZTtcbiAgICAgICAgICAgICAgICAgICAgbzIuZnJlcXVlbmN5LnZhbHVlID0gMTAwMDtcbiAgICAgICAgICAgICAgICAgICAgbzIuc3RhcnQoKTsgbzIuc3RvcChjdHguY3VycmVudFRpbWUgKyAwLjEpO1xuICAgICAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IGN0eC5jbG9zZSgpLmNhdGNoKCgpID0+IHt9KSwgMTUwKTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIHsgdHJ5IHsgY3R4LmNsb3NlKCkuY2F0Y2goKCkgPT4ge30pOyB9IGNhdGNoIHsgLyogaWdub3JlICovIH0gfVxuICAgICAgICAgICAgfSwgMTAwKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIG9zYy5mcmVxdWVuY3kudmFsdWUgPSAyMDA7XG4gICAgICAgICAgICBvc2Muc3RhcnQoKTsgb3NjLnN0b3AoY3R4LmN1cnJlbnRUaW1lICsgMC4zKTtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4gY3R4LmNsb3NlKCkuY2F0Y2goKCkgPT4ge30pLCA0MDApO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIHRyeSB7IGN0eD8uY2xvc2UoKS5jYXRjaCgoKSA9PiB7fSk7IH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuICAgIH1cbn1cblxuLyoqXG4gKiBQbGF5cyB0aGUgZnVsbC1lbmVyZ3kgY2hpbWUgc2VxdWVuY2UuXG4gKiBTdXBwb3J0cyBib3RoIHBsYXlFbmVyZ3lGdWxsQWxhcm0oQ09ORklHKSBhbmQgcGxheUVuZXJneUZ1bGxBbGFybSgpLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcGxheUVuZXJneUZ1bGxBbGFybShDT05GSUcgPSBudWxsKSB7XG4gICAgaWYgKENPTkZJRyAmJiAhQ09ORklHLmVuZXJneUZ1bGxBbGVydFNvdW5kRW5hYmxlZCkgcmV0dXJuO1xuICAgIGlmICh0eXBlb2YgZG9jdW1lbnQgIT09ICd1bmRlZmluZWQnICYmIGRvY3VtZW50LmhpZGRlbikgcmV0dXJuO1xuXG4gICAgY29uc3Qgdm9sdW1lID0gQ09ORklHPy5lbmVyZ3lGdWxsQWxlcnRWb2x1bWUgIT0gbnVsbCA/IENPTkZJRy5lbmVyZ3lGdWxsQWxlcnRWb2x1bWUgOiAwLjM7XG5cbiAgICBjb25zdCBBdWRpb0N0eCA9IHdpbmRvdy5BdWRpb0NvbnRleHQgfHwgd2luZG93LndlYmtpdEF1ZGlvQ29udGV4dDtcbiAgICBpZiAoIUF1ZGlvQ3R4KSByZXR1cm47XG5cbiAgICBsZXQgY3R4ID0gbnVsbDtcbiAgICB0cnkge1xuICAgICAgICBjdHggPSBuZXcgQXVkaW9DdHgoKTtcbiAgICAgICAgaWYgKGN0eC5zdGF0ZSA9PT0gJ3N1c3BlbmRlZCcpIHtcbiAgICAgICAgICAgIGN0eC5yZXN1bWUoKS5jYXRjaCgoKSA9PiB7fSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgc3RhcnQgPSBjdHguY3VycmVudFRpbWU7XG4gICAgICAgIFs2NjAsIDg4MCwgMTEwMF0uZm9yRWFjaCgoZnJlcSwgaSkgPT4ge1xuICAgICAgICAgICAgY29uc3Qgb3NjID0gY3R4LmNyZWF0ZU9zY2lsbGF0b3IoKSwgZyA9IGN0eC5jcmVhdGVHYWluKCk7XG4gICAgICAgICAgICBjb25zdCB0ID0gc3RhcnQgKyBpICogMC4xODtcbiAgICAgICAgICAgIG9zYy50eXBlID0gJ3NpbmUnOyBvc2MuZnJlcXVlbmN5LnZhbHVlID0gZnJlcTtcbiAgICAgICAgICAgIGcuZ2Fpbi52YWx1ZSA9IHZvbHVtZTtcbiAgICAgICAgICAgIG9zYy5jb25uZWN0KGcpOyBnLmNvbm5lY3QoY3R4LmRlc3RpbmF0aW9uKTtcbiAgICAgICAgICAgIG9zYy5zdGFydCh0KTsgb3NjLnN0b3AodCArIDAuMTMpO1xuICAgICAgICB9KTtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiBjdHguY2xvc2UoKS5jYXRjaCgoKSA9PiB7fSksIDgwMCk7XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIHRyeSB7IGN0eD8uY2xvc2UoKS5jYXRjaCgoKSA9PiB7fSk7IH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuICAgIH1cbn1cbiIsIi8qKlxuICogYXV0b2xvZ2luLmpzIOKAlCBBdXRvbWF0ZWQgY3JlZGVudGlhbCBtYW5hZ2VtZW50IGFuZCBSZWFjdC1zYWZlIHJlLWxvZ2luIGV4ZWN1dGlvblxuICovXG5cbmltcG9ydCB7IGdldFZhbHVlLCBzZXRWYWx1ZSB9IGZyb20gJy4vc3RvcmFnZS5qcyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRTYXZlZENyZWRlbnRpYWxzKCkge1xuICAgIGNvbnN0IHJhdyA9IGdldFZhbHVlKCdhd19sb2dpbl9jcmVkcycsIG51bGwpO1xuICAgIGlmICghcmF3KSByZXR1cm4gbnVsbDtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBwYXJzZWQgPSB0eXBlb2YgcmF3ID09PSAnc3RyaW5nJyA/IEpTT04ucGFyc2UocmF3KSA6IHJhdztcbiAgICAgICAgaWYgKHBhcnNlZCAmJiB0eXBlb2YgcGFyc2VkLmVtYWlsID09PSAnc3RyaW5nJyAmJiB0eXBlb2YgcGFyc2VkLnBhc3N3b3JkID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgcmV0dXJuIHBhcnNlZDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9IGNhdGNoIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc2F2ZUNyZWRlbnRpYWxzKGVtYWlsLCBwYXNzd29yZCkge1xuICAgIGNvbnN0IGNyZWRzID0ge1xuICAgICAgICBlbWFpbDogZW1haWwudHJpbSgpLFxuICAgICAgICBwYXNzd29yZDogcGFzc3dvcmQsXG4gICAgICAgIHNhdmVkQXQ6IERhdGUubm93KClcbiAgICB9O1xuICAgIHNldFZhbHVlKCdhd19sb2dpbl9jcmVkcycsIEpTT04uc3RyaW5naWZ5KGNyZWRzKSk7XG4gICAgcmV0dXJuIGNyZWRzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xlYXJDcmVkZW50aWFscygpIHtcbiAgICBzZXRWYWx1ZSgnYXdfbG9naW5fY3JlZHMnLCAnJyk7XG59XG5cbi8qKlxuICogUmVhY3QgU1BBIGlucHV0cyBpZ25vcmUgZGlyZWN0IGVsZW1lbnQudmFsdWUgYXNzaWdubWVudHMgYmVjYXVzZSBSZWFjdCB0cmFja3MgdmFsdWUgc3RhdGUgdmlhIGludGVybmFsIGRlc2NyaXB0b3IuXG4gKiBXZSBtdXN0IGludm9rZSB0aGUgbmF0aXZlIHByb3RvdHlwZSBzZXR0ZXIgYW5kIGRpc3BhdGNoIHN5bnRoZXRpYyAnaW5wdXQnICsgJ2NoYW5nZScgZXZlbnRzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2V0UmVhY3RJbnB1dFZhbHVlKGlucHV0LCB2YWx1ZSkge1xuICAgIGlmICghaW5wdXQpIHJldHVybjtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBuYXRpdmVJbnB1dFZhbHVlU2V0dGVyID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcih3aW5kb3cuSFRNTElucHV0RWxlbWVudC5wcm90b3R5cGUsICd2YWx1ZScpPy5zZXQ7XG4gICAgICAgIGlmIChuYXRpdmVJbnB1dFZhbHVlU2V0dGVyKSB7XG4gICAgICAgICAgICBuYXRpdmVJbnB1dFZhbHVlU2V0dGVyLmNhbGwoaW5wdXQsIHZhbHVlKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlucHV0LnZhbHVlID0gdmFsdWU7XG4gICAgICAgIH1cbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBpbnB1dC52YWx1ZSA9IHZhbHVlO1xuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuICAgIH1cbn1cblxuLyoqXG4gKiBBdXRvbWF0aWNhbGx5IGNhcHR1cmVzIGNyZWRlbnRpYWxzIHdoZW4gdXNlciBtYW51YWxseSBzdWJtaXRzIG9uIHRoZSAvbG9naW4gcGFnZS5cbiAqIFVzZXMgcGFzc2l2ZS9zYWZlIGV2ZW50IGxpc3RlbmluZyBhbmQgZmlsdGVycyBvdXQgZXh0ZW5zaW9uIGVsZW1lbnRzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2V0dXBMb2dpbkNhcHR1cmUobG9nRm4pIHtcbiAgICBpZiAoIS9eXFwvKGxvZ2lufHJlZ2lzdGVyfHNpZ251cCkvaS50ZXN0KHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZSkpIHJldHVybjtcblxuICAgIGZ1bmN0aW9uIGhhbmRsZUNhcHR1cmUoKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBpbnB1dHMgPSBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0JykpLmZpbHRlcihlbCA9PlxuICAgICAgICAgICAgICAgICFlbC5jbG9zZXN0KCcjYXctcGFuZWwsICNhdy1zZXR0aW5ncy1tb2RhbCwgI2F3LWxvZy1tb2RhbCwgI2F3LWFuYWx5dGljcy1tb2RhbCcpXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgY29uc3QgZW1haWxJbnB1dCA9IGlucHV0cy5maW5kKGVsID0+IGVsLnR5cGUgPT09ICdlbWFpbCcgfHwgL2VtYWlsfHVzZXJuYW1lL2kudGVzdChlbC5uYW1lIHx8IGVsLnBsYWNlaG9sZGVyIHx8ICcnKSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB8fCBpbnB1dHMuZmluZChlbCA9PiBlbC50eXBlID09PSAndGV4dCcgJiYgL0AvaS50ZXN0KGVsLnBsYWNlaG9sZGVyIHx8ICcnKSk7XG4gICAgICAgICAgICBjb25zdCBwYXNzSW5wdXQgID0gaW5wdXRzLmZpbmQoZWwgPT4gZWwudHlwZSA9PT0gJ3Bhc3N3b3JkJyk7XG5cbiAgICAgICAgICAgIGlmIChlbWFpbElucHV0Py52YWx1ZSAmJiBwYXNzSW5wdXQ/LnZhbHVlKSB7XG4gICAgICAgICAgICAgICAgc2F2ZUNyZWRlbnRpYWxzKGVtYWlsSW5wdXQudmFsdWUsIHBhc3NJbnB1dC52YWx1ZSk7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ1tBdXRvIFdvcmtlcl0gS3JlZGVuc2lhbCBsb2dpbiBiZXJoYXNpbCBkaXNpbXBhbiBvdG9tYXRpcyB1bnR1ayBBdXRvIFJlLUxvZ2luLicpO1xuICAgICAgICAgICAgICAgIGxvZ0ZuPy4oJ0tyZWRlbnNpYWwgbG9naW4gYmVyaGFzaWwgZGlwZXJiYXJ1aSBvdG9tYXRpcy4nLCAnaW5mbycpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cbiAgICB9XG5cbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdzdWJtaXQnLCBoYW5kbGVDYXB0dXJlLCB0cnVlKTtcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBidG4gPSBlLnRhcmdldD8uY2xvc2VzdD8uKCdidXR0b24nKTtcbiAgICAgICAgICAgIGlmIChidG4gJiYgL21hc3VrfGxvZ2lufHNpZ24gaW58ZW50ZXIvaS50ZXN0KGJ0bi50ZXh0Q29udGVudCB8fCAnJykpIHtcbiAgICAgICAgICAgICAgICBoYW5kbGVDYXB0dXJlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuICAgIH0sIHRydWUpO1xufVxuXG4vKipcbiAqIFNlYXJjaGVzIGZvciBsb2dpbiBpbnB1dHMgYW5kIHN1Ym1pdCBidXR0b24gb24gL2xvZ2luLlxuICogRXhwbGljaXRseSBpZ25vcmVzIGV4dGVuc2lvbiBVSSBub2RlcyB0byBhdm9pZCBhbnkgY29sbGlzaW9uLlxuICovXG5mdW5jdGlvbiB3YWl0Rm9yTG9naW5JbnB1dHModGltZW91dE1zID0gMTIwMDApIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICAgIGNvbnN0IGZpbmQgPSAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBpbnB1dHMgPSBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0JykpLmZpbHRlcihlbCA9PlxuICAgICAgICAgICAgICAgICFlbC5jbG9zZXN0KCcjYXctcGFuZWwsICNhdy1zZXR0aW5ncy1tb2RhbCwgI2F3LWxvZy1tb2RhbCwgI2F3LWFuYWx5dGljcy1tb2RhbCcpXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgY29uc3QgZW1haWxJbnB1dCA9IGlucHV0cy5maW5kKGVsID0+IGVsLnR5cGUgPT09ICdlbWFpbCcgfHwgL2VtYWlsfHVzZXJuYW1lL2kudGVzdChlbC5uYW1lIHx8IGVsLnBsYWNlaG9sZGVyIHx8ICcnKSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB8fCBpbnB1dHMuZmluZChlbCA9PiBlbC50eXBlID09PSAndGV4dCcgJiYgL0AvaS50ZXN0KGVsLnBsYWNlaG9sZGVyIHx8ICcnKSk7XG4gICAgICAgICAgICBjb25zdCBwYXNzSW5wdXQgID0gaW5wdXRzLmZpbmQoZWwgPT4gZWwudHlwZSA9PT0gJ3Bhc3N3b3JkJyk7XG4gICAgICAgICAgICBjb25zdCBidXR0b25zICAgID0gQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdidXR0b24nKSkuZmlsdGVyKGVsID0+XG4gICAgICAgICAgICAgICAgIWVsLmNsb3Nlc3QoJyNhdy1wYW5lbCwgI2F3LXNldHRpbmdzLW1vZGFsLCAjYXctbG9nLW1vZGFsLCAjYXctYW5hbHl0aWNzLW1vZGFsJylcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBjb25zdCBzdWJtaXRCdG4gID0gYnV0dG9ucy5maW5kKGIgPT4gL21hc3VrfGxvZ2lufHNpZ24gaW58ZW50ZXIvaS50ZXN0KGIudGV4dENvbnRlbnQgfHwgJycpKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHx8IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2J1dHRvblt0eXBlPVwic3VibWl0XCJdJylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB8fCBidXR0b25zLmZpbmQoYiA9PiBiLm9mZnNldFdpZHRoID4gMTAwKTtcblxuICAgICAgICAgICAgaWYgKGVtYWlsSW5wdXQgJiYgcGFzc0lucHV0ICYmIHN1Ym1pdEJ0bikge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IGVtYWlsSW5wdXQsIHBhc3NJbnB1dCwgc3VibWl0QnRuIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBpbW1lZGlhdGUgPSBmaW5kKCk7XG4gICAgICAgIGlmIChpbW1lZGlhdGUpIHJldHVybiByZXNvbHZlKGltbWVkaWF0ZSk7XG5cbiAgICAgICAgY29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xuICAgICAgICBjb25zdCBpbnRlcnZhbCA9IHNldEludGVydmFsKCgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGZvdW5kID0gZmluZCgpO1xuICAgICAgICAgICAgaWYgKGZvdW5kKSB7XG4gICAgICAgICAgICAgICAgY2xlYXJJbnRlcnZhbChpbnRlcnZhbCk7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmb3VuZCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKERhdGUubm93KCkgLSBzdGFydCA+IHRpbWVvdXRNcykge1xuICAgICAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwoaW50ZXJ2YWwpO1xuICAgICAgICAgICAgICAgIHJlc29sdmUobnVsbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIDM1MCk7XG4gICAgfSk7XG59XG5cbi8qKlxuICogRXhlY3V0ZXMgYXV0b21hdGVkIGxvZ2luIGlmIGVuYWJsZWQgYW5kIG9uIC9sb2dpbiBwYWdlLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdHJ5QXV0b0xvZ2luKENPTkZJRywgbG9nRm4sIHNlbmROb3RpZmljYXRpb25Gbikge1xuICAgIGlmICghL15cXC9sb2dpbi9pLnRlc3Qod2luZG93LmxvY2F0aW9uLnBhdGhuYW1lKSkge1xuICAgICAgICAvLyBXaGVuIHVzZXIgaXMgc3VjY2Vzc2Z1bGx5IHBhc3QgbG9naW4gKGUuZy4gb24gL2Rhc2hib2FyZCksIHJlc2V0IGF0dGVtcHQgY291bnRlclxuICAgICAgICB0cnkgeyBzZXNzaW9uU3RvcmFnZS5yZW1vdmVJdGVtKCdhd19sb2dpbl9hdHRlbXB0cycpOyB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGlmICghQ09ORklHPy5hdXRvUmVsb2dpbkVuYWJsZWQpIHJldHVybiBmYWxzZTtcblxuICAgIGNvbnN0IGNyZWRzID0gZ2V0U2F2ZWRDcmVkZW50aWFscygpO1xuICAgIGlmICghY3JlZHM/LmVtYWlsIHx8ICFjcmVkcz8ucGFzc3dvcmQpIHtcbiAgICAgICAgY29uc29sZS5sb2coJ1tBdXRvIFdvcmtlcl0gQXV0byBSZS1Mb2dpbiBha3RpZiB0ZXRhcGkgYmVsdW0gYWRhIGVtYWlsICYga2F0YSBzYW5kaSB0ZXJzaW1wYW4uJyk7XG4gICAgICAgIGxvZ0ZuPy4oJ0F1dG8gUmUtTG9naW4gYWt0aWYgdGV0YXBpIGJlbHVtIGFkYSBlbWFpbCAmIGthdGEgc2FuZGkgdGVyc2ltcGFuLiBTaWxha2FuIGlzaSBkaSBTZXR0aW5ncyBhdGF1IGxvZ2luIG1hbnVhbC4nLCAnaW5mbycpO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgLy8gQW50aS1sb2Nrb3V0IGd1YXJkOiBsaW1pdCB0byAyIGNvbnNlY3V0aXZlIGF0dGVtcHRzIHBlciBzZXNzaW9uXG4gICAgbGV0IGF0dGVtcHRzID0gMDtcbiAgICB0cnkge1xuICAgICAgICBhdHRlbXB0cyA9IHBhcnNlSW50KHNlc3Npb25TdG9yYWdlLmdldEl0ZW0oJ2F3X2xvZ2luX2F0dGVtcHRzJykgfHwgJzAnLCAxMCk7XG4gICAgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG5cbiAgICBpZiAoYXR0ZW1wdHMgPj0gMikge1xuICAgICAgICBjb25zb2xlLndhcm4oJ1tBdXRvIFdvcmtlcl0gQXV0byBSZS1Mb2dpbiBkaWhlbnRpa2FuIHNlbWVudGFyYTogdGVsYWggbWVuY29iYSAyeC4nKTtcbiAgICAgICAgbG9nRm4/LignQXV0byBSZS1Mb2dpbiBkaWhlbnRpa2FuIHNlbWVudGFyYTogdGVsYWggbWVuY29iYSAyeC4gU2lsYWthbiBsb2dpbiBtYW51YWwgdW50dWsgdmVyaWZpa2FzaSBha3VuLicsICdlcnJvcicpO1xuICAgICAgICBzZW5kTm90aWZpY2F0aW9uRm4/LihDT05GSUcsICdBdXRvIFJlLUxvZ2luIERpaGVudGlrYW4nLCAnTWVuY2FwYWkgYmF0YXMgMnggcGVyY29iYWFuLiBTaWxha2FuIHBlcmlrc2EgYWt1bi4nKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGNvbnNvbGUubG9nKCdbQXV0byBXb3JrZXJdIEhhbGFtYW4gbG9naW4gdGVyZGV0ZWtzaS4gTWVtcGVyc2lhcGthbiBBdXRvIFJlLUxvZ2luLi4uJyk7XG4gICAgbG9nRm4/LignSGFsYW1hbiBsb2dpbiB0ZXJkZXRla3NpLiBNZW11bGFpIEF1dG8gUmUtTG9naW4gZGFsYW0gMS41IGRldGlrLi4uJywgJ2luZm8nKTtcblxuICAgIC8vIEdpdmUgUmVhY3QgU1BBIDEuMnMgdG8gZmluaXNoIGh5ZHJhdGluZyBpdHMgY29tcG9uZW50IHRyZWVcbiAgICBhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMTIwMCkpO1xuXG4gICAgY29uc3QgZWxlbWVudHMgPSBhd2FpdCB3YWl0Rm9yTG9naW5JbnB1dHMoMTAwMDApO1xuICAgIGlmICghZWxlbWVudHMpIHtcbiAgICAgICAgY29uc29sZS53YXJuKCdbQXV0byBXb3JrZXJdIEVsZW1lbiBmb3JtIGxvZ2luIHRpZGFrIGRpdGVtdWthbiBkYWxhbSAxMCBkZXRpay4nKTtcbiAgICAgICAgbG9nRm4/LignRWxlbWVuIGZvcm0gbG9naW4gdGlkYWsgZGl0ZW11a2FuIGRhbGFtIDEwIGRldGlrLicsICd3YXJuJyk7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBjb25zdCB7IGVtYWlsSW5wdXQsIHBhc3NJbnB1dCwgc3VibWl0QnRuIH0gPSBlbGVtZW50cztcblxuICAgIHRyeSB7XG4gICAgICAgIHNlc3Npb25TdG9yYWdlLnNldEl0ZW0oJ2F3X2xvZ2luX2F0dGVtcHRzJywgKGF0dGVtcHRzICsgMSkudG9TdHJpbmcoKSk7XG4gICAgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG5cbiAgICAvLyBIdW1hbi1saWtlIHR5cGluZyBkZWxheSB0byBwcmV2ZW50IGFudGktYm90IGRldGVjdGlvblxuICAgIGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCA2MDApKTtcbiAgICBzZXRSZWFjdElucHV0VmFsdWUoZW1haWxJbnB1dCwgY3JlZHMuZW1haWwpO1xuXG4gICAgYXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDQ1MCkpO1xuICAgIHNldFJlYWN0SW5wdXRWYWx1ZShwYXNzSW5wdXQsIGNyZWRzLnBhc3N3b3JkKTtcblxuICAgIGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCA2MDApKTtcblxuICAgIGNvbnNvbGUubG9nKGBbQXV0byBXb3JrZXJdIE1lbmdpcmltIGxvZ2luIG90b21hdGlzIHVudHVrICR7Y3JlZHMuZW1haWx9Li4uYCk7XG4gICAgbG9nRm4/LihgTWVuZ2lyaW0gbG9naW4gb3RvbWF0aXMgdW50dWsgJHtjcmVkcy5lbWFpbH0uLi5gLCAnaW5mbycpO1xuICAgIHNlbmROb3RpZmljYXRpb25Gbj8uKENPTkZJRywgJ0F1dG8gUmUtTG9naW4nLCBgTWVuY29iYSBtYXN1ayBvdG9tYXRpcyBzZWJhZ2FpICR7Y3JlZHMuZW1haWx9Li4uYCk7XG5cbiAgICBzdWJtaXRCdG4uY2xpY2soKTtcbiAgICByZXR1cm4gdHJ1ZTtcbn1cbiIsIi8qKlxuICogd29yay5qcyDigJQgQ29yZSBkb1dvcmsoKSBhY3Rpb246IGNhbGxzIHRoZSBQYXJsYW1lbnR1bSBBUEkgYW5kIHVwZGF0ZXMgc3RhdGVcbiAqL1xuXG5pbXBvcnQgeyBnZXRDdXJyZW50RW5lcmd5LCBnZXRTeW5jZWRFbmVyZ3ksIGdldE5leHRXb3JrRGVsYXksIGlzU2xlZXBUaW1lLCBnZXRNc1VudGlsU2xlZXBFbmQsIHBhdGNoUGFnZVZpc3VhbEVuZXJneSB9IGZyb20gJy4vZW5lcmd5LmpzJztcbmltcG9ydCB7IGdldFRva2VuRnJvbVN0b3JhZ2UgfSBmcm9tICcuL3Rva2VuLmpzJztcbmltcG9ydCB7IHNhdmVTdGF0ZSwgc2F2ZUxpdmVTdGF0dXMgfSBmcm9tICcuL3N0YXRlLmpzJztcbmltcG9ydCB7IHNhdmVXb3JrSGlzdG9yeSB9IGZyb20gJy4vaGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBzZXRWYWx1ZSB9IGZyb20gJy4vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBnZXRTYXZlZENyZWRlbnRpYWxzIH0gZnJvbSAnLi9hdXRvbG9naW4uanMnO1xuXG4vKipcbiAqIEBwYXJhbSB7b2JqZWN0fSBjdHggLSB7IHN0YXRlLCBDT05GSUcsIHdvcmtIaXN0b3J5LCBsb2csIHNldFJ1bm5pbmdVSSwgc2VuZE5vdGlmaWNhdGlvbiwgcGxheU5vdGlmaWNhdGlvblNvdW5kLCB1cGRhdGVQYW5lbCwgd2FrZVBlbmRpbmdXb3JrIH1cbiAqIEBwYXJhbSB7Ym9vbGVhbn0gbWFudWFsXG4gKiBAcmV0dXJucyB7UHJvbWlzZTwnd29ya2VkJ3wnd2FpdGluZyd8J3BhdXNlZCd8J3JldHJ5J3wncmV0cnlTb29uJ3wnYnVzeSd8J3VuY2VydGFpbid8J3N0YW5kYnknPn1cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGRvV29yayhjdHgsIG1hbnVhbCA9IGZhbHNlKSB7XG4gICAgY29uc3QgeyBzdGF0ZSwgQ09ORklHLCB3b3JrSGlzdG9yeSwgbG9nLCBzZXRSdW5uaW5nVUksIHNlbmROb3RpZmljYXRpb24sIHBsYXlOb3RpZmljYXRpb25Tb3VuZCwgdXBkYXRlUGFuZWwsIHdha2VQZW5kaW5nV29yayB9ID0gY3R4O1xuXG4gICAgaWYgKCFtYW51YWwgJiYgc3RhdGUudGFiTG9ja01hbmFnZWQgJiYgIXN0YXRlLmlzVGFiTG9ja093bmVyKSByZXR1cm4gJ3N0YW5kYnknO1xuICAgIGlmIChzdGF0ZS53b3JrUmVzdWx0VW5jZXJ0YWluKSB7XG4gICAgICAgIGxvZygnSGFzaWwgcmVxdWVzdCBrZXJqYSBzZWJlbHVtbnlhIGJlbHVtIHBhc3RpLiBNdWF0IHVsYW5nIGhhbGFtYW4gdW50dWsgc2lua3JvbmlzYXNpIHNlYmVsdW0gbWVuY29iYSBsYWdpLicsICdlcnJvcicpO1xuICAgICAgICByZXR1cm4gJ3BhdXNlZCc7XG4gICAgfVxuICAgIGlmIChzdGF0ZS53b3JrSW5GbGlnaHQpIHtcbiAgICAgICAgaWYgKERhdGUubm93KCkgLSAoc3RhdGUud29ya0luRmxpZ2h0QXQgfHwgMCkgPiAxNTAwMCkge1xuICAgICAgICAgICAgc3RhdGUud29ya0luRmxpZ2h0ID0gZmFsc2U7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gJ2J1c3knO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gR3VhcmQ6IGRvbid0IHNldCB3b3JrSW5GbGlnaHQgdW50aWwgYWZ0ZXIgYWxsIGNoZWFwIGNoZWNrc1xuICAgIGlmICghc3RhdGUucnVubmluZyAmJiAhbWFudWFsKSByZXR1cm4gJ3BhdXNlZCc7XG5cbiAgICBpZiAobWFudWFsKSB7XG4gICAgICAgIGxvZygnTWVuamFsYW5rYW4gc2hpZnQga2VyamEgbWFudWFsLi4uJywgJ2luZm8nKTtcbiAgICB9XG5cbiAgICBjb25zdCBlbmVyZ3kgPSBnZXRTeW5jZWRFbmVyZ3koc3RhdGUpO1xuICAgIGlmICghZW5lcmd5KSB7XG4gICAgICAgIGxvZygnR2FnYWwgbWVtYmFjYSBlbmVyZ2kgZGFyaSBoYWxhbWFuLiBNZW5jb2JhIGxhZ2kgZGFsYW0gNSBkZXRpay4nLCAnd2FybicpO1xuICAgICAgICBzdGF0ZS5uZXh0V29ya1RpbWVzdGFtcCA9IERhdGUubm93KCkgKyA1MDAwO1xuICAgICAgICByZXR1cm4gJ3JldHJ5U29vbic7XG4gICAgfVxuXG4gICAgc3RhdGUuY3VycmVudEVuZXJneSA9IGVuZXJneS5jdXJyZW50O1xuICAgIHN0YXRlLm1heEVuZXJneSAgICAgPSBlbmVyZ3kubWF4O1xuXG4gICAgaWYgKCFtYW51YWwgJiYgaXNTbGVlcFRpbWUoQ09ORklHKSkge1xuICAgICAgICBjb25zdCBtc1VudGlsV2FrZSA9IGdldE1zVW50aWxTbGVlcEVuZChDT05GSUcpO1xuICAgICAgICBjb25zdCB3YWtlSG91ciA9IFN0cmluZyhDT05GSUcuc2xlZXBFbmRIb3VyID8/IDYpLnBhZFN0YXJ0KDIsICcwJykgKyAnOjAwJztcbiAgICAgICAgbG9nKGBKYW0gaXN0aXJhaGF0IGFrdGlmICgke0NPTkZJRy5zbGVlcFN0YXJ0SG91ciA/PyAxfTowMCAtICR7Q09ORklHLnNsZWVwRW5kSG91ciA/PyA2fTowMCBXSUIpLiBBdXRvIFdvcmtlciBpc3RpcmFoYXQgc2FtcGFpIHB1a3VsICR7d2FrZUhvdXJ9Li4uYCwgJ2luZm8nKTtcbiAgICAgICAgc3RhdGUubmV4dFdvcmtUaW1lc3RhbXAgPSBEYXRlLm5vdygpICsgbXNVbnRpbFdha2U7XG4gICAgICAgIHVwZGF0ZVBhbmVsKCk7XG4gICAgICAgIHJldHVybiAnd2FpdGluZyc7XG4gICAgfVxuXG4gICAgaWYgKHN0YXRlLmN1cnJlbnRFbmVyZ3kgPCAxMCAmJiBtYW51YWwpIHtcbiAgICAgICAgbG9nKGBFbmVyZ2kgc2FhdCBpbmkgKCR7c3RhdGUuY3VycmVudEVuZXJneX0vJHtzdGF0ZS5tYXhFbmVyZ3l9IEVOKSBiZWx1bSBjdWt1cCEgQnV0dWggbWluaW1hbCAxMCBFTiB1bnR1ayBnaWxpcmFuIGtlcmphLmAsICd3YXJuJyk7XG4gICAgICAgIHJldHVybiAnd2FpdGluZyc7XG4gICAgfVxuXG4gICAgaWYgKHN0YXRlLmN1cnJlbnRFbmVyZ3kgPCBDT05GSUcuZW5lcmd5VGhyZXNob2xkICYmICFtYW51YWwpIHtcbiAgICAgICAgbG9nKGBFbmVyZ2kgYmVsdW0gY3VrdXAgKCR7c3RhdGUuY3VycmVudEVuZXJneX0vJHtDT05GSUcuZW5lcmd5VGhyZXNob2xkfSlgLCAnd2FybicpO1xuICAgICAgICBzdGF0ZS5uZXh0V29ya1RpbWVzdGFtcCA9IERhdGUubm93KCkgKyBnZXROZXh0V29ya0RlbGF5KHN0YXRlLCBDT05GSUcpO1xuICAgICAgICByZXR1cm4gJ3dhaXRpbmcnO1xuICAgIH1cblxuICAgIGNvbnN0IGVuZXJneUJlZm9yZSA9IGdldEN1cnJlbnRFbmVyZ3koKSB8fCBlbmVyZ3k7XG5cbiAgICAvLyAxLiBQcmltYXJ5IFdvcmsgTWV0aG9kIG9uIERhc2hib2FyZDogTmF0aXZlIFBhZ2UgQnV0dG9uIENsaWNrXG4gICAgLy8gQ2xpY2tpbmcgdGhlIGdhbWUncyBhY3R1YWwgYnV0dG9uIGxldHMgUmVhY3QgaGFuZGxlIGFuaW1hdGlvbnMsIFhQIHRvYXN0LCBuYXZiYXIsXG4gICAgLy8gcHJvZ3Jlc3MgYmFyLCBhbmQgY29tcG9uZW50IHN0YXRlcyBuYXRpdmVseSB3aXRoIHplcm8gRE9NIGdsaXRjaGVzIG9yIHZpcnR1YWwgRE9NIGRlc3luYyFcbiAgICBjb25zdCBkb21CdG4gPSBfZ2V0RG9tV29ya0J1dHRvbigpO1xuICAgIGlmIChkb21CdG4gJiYgX2lzQnV0dG9uVXNhYmxlKGRvbUJ0bikpIHtcbiAgICAgICAgc3RhdGUud29ya1RyaWdnZXJlZFZpYURvbSA9IHRydWU7XG4gICAgICAgIHN0YXRlLndvcmtJbkZsaWdodCA9IHRydWU7XG4gICAgICAgIHN0YXRlLndvcmtJbkZsaWdodEF0ID0gRGF0ZS5ub3coKTtcblxuICAgICAgICBjb25zdCB3b3JrQ29tcGxldGlvblByb21pc2UgPSBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG9uTXNnID0gKGV2ZW50KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGV2ZW50Py5kYXRhPy5zb3VyY2UgPT09ICdQQVJMQU1FTlRVTV9JTlRFUkNFUFRPUicpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGV2ZW50LmRhdGEudHlwZSA9PT0gJ1dPUktfU1VDQ0VTUycgfHwgZXZlbnQuZGF0YS50eXBlID09PSAnV09SS19SRUpFQ1RFRCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgb25Nc2cpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShldmVudC5kYXRhKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIG9uTXNnKTtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgb25Nc2cpO1xuICAgICAgICAgICAgICAgIHJlc29sdmUobnVsbCk7XG4gICAgICAgICAgICB9LCA2MDAwKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgX3RyaWdnZXJEb21Xb3JrQ2xpY2soZG9tQnRuKTtcbiAgICAgICAgaWYgKG1hbnVhbCkge1xuICAgICAgICAgICAgbG9nKCdTaGlmdCBrZXJqYSBtYW51YWwgZGlraXJpbSB2aWEgdG9tYm9sIGdhbWUuLi4nLCAnaW5mbycpO1xuICAgICAgICB9XG5cbiAgICAgICAgYXdhaXQgd29ya0NvbXBsZXRpb25Qcm9taXNlO1xuICAgICAgICBzdGF0ZS53b3JrSW5GbGlnaHQgPSBmYWxzZTtcbiAgICAgICAgc3RhdGUud29ya1RyaWdnZXJlZFZpYURvbSA9IGZhbHNlO1xuICAgICAgICBzdGF0ZS5uZXh0V29ya1RpbWVzdGFtcCA9IERhdGUubm93KCkgKyBnZXROZXh0V29ya0RlbGF5KHN0YXRlLCBDT05GSUcpO1xuICAgICAgICB1cGRhdGVQYW5lbD8uKCk7XG4gICAgICAgIHJldHVybiAnd29ya2VkJztcbiAgICB9XG5cbiAgICAvLyAyLiBGYWxsYmFjayBXb3JrIE1ldGhvZCAob2ZmLWRhc2hib2FyZCBvciBidXR0b24gdW5hdmFpbGFibGUpOiBEaXJlY3QgQVBJIGZldGNoXG4gICAgc3RhdGUud29ya1RyaWdnZXJlZFZpYURvbSA9IGZhbHNlO1xuICAgIHN0YXRlLndvcmtJbkZsaWdodCA9IHRydWU7XG4gICAgc3RhdGUud29ya0luRmxpZ2h0QXQgPSBEYXRlLm5vdygpO1xuICAgIGxldCB0aW1lb3V0SWQgPSBudWxsO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgaWYgKCFzdGF0ZS5jdXJyZW50VG9rZW4pIHtcbiAgICAgICAgICAgIGdldFRva2VuRnJvbVN0b3JhZ2Uoc3RhdGUsIChyYXcsIHNyYykgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBjdHguaGFuZGxlTmV3VG9rZW4ocmF3LCBzcmMpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBpZiAoIXN0YXRlLmN1cnJlbnRUb2tlbikge1xuICAgICAgICAgICAgICAgIGxvZygnVG9rZW4gdGlkYWsgZGl0ZW11a2FuISBQYXN0aWthbiBzdWRhaCBsb2dpbiBkaSBha3VuIFBhcmxlbWVudHVtLicsICdlcnJvcicpO1xuICAgICAgICAgICAgICAgIHJldHVybiAncmV0cnknO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgY29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcbiAgICAgICAgdGltZW91dElkID0gc2V0VGltZW91dCgoKSA9PiBjb250cm9sbGVyLmFib3J0KCksIDE1MDAwKTtcblxuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdodHRwczovL3BhcmxhbWVudHVtLm9yZy9hcGkvcGxheWVyL3dvcmsnLCB7XG4gICAgICAgICAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICAgICAgICdBdXRob3JpemF0aW9uJzogc3RhdGUuY3VycmVudFRva2VuLFxuICAgICAgICAgICAgICAgICdBY2NlcHQnOiAnKi8qJ1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGNyZWRlbnRpYWxzOiAnaW5jbHVkZScsXG4gICAgICAgICAgICBzaWduYWw6IGNvbnRyb2xsZXIuc2lnbmFsLFxuICAgICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe30pXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChyZXNwb25zZS5vaykge1xuICAgICAgICAgICAgcmV0dXJuIF9oYW5kbGVTdWNjZXNzKGN0eCwgcmVzcG9uc2UsIGVuZXJneSwgZW5lcmd5QmVmb3JlKTtcbiAgICAgICAgfSBlbHNlIGlmIChyZXNwb25zZS5zdGF0dXMgPT09IDQwMSkge1xuICAgICAgICAgICAgcmV0dXJuIF9oYW5kbGVVbmF1dGhvcml6ZWQoY3R4KTtcbiAgICAgICAgfSBlbHNlIGlmIChyZXNwb25zZS5zdGF0dXMgPT09IDQwMCB8fCByZXNwb25zZS5zdGF0dXMgPT09IDQyMikge1xuICAgICAgICAgICAgcmV0dXJuIF9oYW5kbGVSZWplY3RlZChjdHgsIHJlc3BvbnNlKTtcbiAgICAgICAgfSBlbHNlIGlmIChyZXNwb25zZS5zdGF0dXMgPT09IDQwNCB8fCByZXNwb25zZS5zdGF0dXMgPT09IDQwNSkge1xuICAgICAgICAgICAgY29uc3QgY2xpY2tlZCA9IF9jbGlja0RvbVdvcmtCdXR0b24oKTtcbiAgICAgICAgICAgIGlmIChjbGlja2VkKSB7XG4gICAgICAgICAgICAgICAgbG9nKCdFbmRwb2ludCBBUEkgdGlkYWsgbWVyZXNwb24gKEhUVFAgNDA0KSwgbWVuZ2Vrc2VrdXNpIGtsaWsgdG9tYm9sIGtlcmphIGRpIGhhbGFtYW4uLi4nLCAnaW5mbycpO1xuICAgICAgICAgICAgICAgIHJldHVybiAnd29ya2VkJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGxvZyhgRXJyb3IgSFRUUDogJHtyZXNwb25zZS5zdGF0dXN9YCwgJ2Vycm9yJyk7XG4gICAgICAgICAgICByZXR1cm4gJ3JldHJ5JztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxvZyhgRXJyb3IgSFRUUDogJHtyZXNwb25zZS5zdGF0dXN9YCwgJ2Vycm9yJyk7XG4gICAgICAgICAgICByZXR1cm4gJ3JldHJ5JztcbiAgICAgICAgfVxuXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgaWYgKGVycm9yLm5hbWUgPT09ICdBYm9ydEVycm9yJykge1xuICAgICAgICAgICAgcmV0dXJuIF9oYW5kbGVUaW1lb3V0KGN0eCwgZW5lcmd5QmVmb3JlKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zb2xlLmVycm9yKCdbZG9Xb3JrXSBFcnJvcjonLCBlcnJvcik7XG4gICAgICAgIGNvbnN0IGNsaWNrZWQgPSBfY2xpY2tEb21Xb3JrQnV0dG9uKCk7XG4gICAgICAgIGlmIChjbGlja2VkKSB7XG4gICAgICAgICAgICBsb2coJ01lbmdla3Nla3VzaSBrbGlrIHRvbWJvbCBrZXJqYSBkaSBoYWxhbWFuIChmYWxsYmFjaykuLi4nLCAnaW5mbycpO1xuICAgICAgICAgICAgcmV0dXJuICd3b3JrZWQnO1xuICAgICAgICB9XG4gICAgICAgIGxvZyhgR2FnYWwga29uZWtzaTogJHtlcnJvci5tZXNzYWdlfWAsICdlcnJvcicpO1xuICAgICAgICByZXR1cm4gJ3JldHJ5JztcbiAgICB9IGZpbmFsbHkge1xuICAgICAgICBpZiAodGltZW91dElkICE9PSBudWxsKSBjbGVhclRpbWVvdXQodGltZW91dElkKTtcbiAgICAgICAgc3RhdGUud29ya0luRmxpZ2h0ID0gZmFsc2U7XG4gICAgfVxufVxuXG4vLyDilIDilIDilIAgUHJpdmF0ZSBoZWxwZXJzIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG5mdW5jdGlvbiBfZ2V0RG9tV29ya0J1dHRvbigpIHtcbiAgICBpZiAodHlwZW9mIGRvY3VtZW50ID09PSAndW5kZWZpbmVkJykgcmV0dXJuIG51bGw7XG4gICAgLy8gUHJpb3JpdHkgMTogRXhhY3QgZGF0YS10ZXN0aWQgYXR0cmlidXRlIGZyb20gdGhlIGdhbWVcbiAgICBjb25zdCB0ZXN0SWRCdG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdidXR0b25bZGF0YS10ZXN0aWQ9XCJ3b3JrXCJdLCBidXR0b25bZGF0YS10dXRvcmlhbC10YXJnZXQ9XCJ3b3JrXCJdJyk7XG4gICAgaWYgKHRlc3RJZEJ0bikgcmV0dXJuIHRlc3RJZEJ0bjtcblxuICAgIC8vIFByaW9yaXR5IDI6IFRleHQgbWF0Y2hpbmdcbiAgICBjb25zdCBidXR0b25zID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnYnV0dG9uJyk7XG4gICAgZm9yIChjb25zdCBidG4gb2YgYnV0dG9ucykge1xuICAgICAgICBjb25zdCB0eHQgPSAoYnRuLnRleHRDb250ZW50IHx8ICcnKS50cmltKCk7XG4gICAgICAgIGlmICgvS0VSSkFLQU5cXHMrU0FUVVxccytHSUxJUkFOL2kudGVzdCh0eHQpKSB7XG4gICAgICAgICAgICByZXR1cm4gYnRuO1xuICAgICAgICB9XG4gICAgfVxuICAgIC8vIFByaW9yaXR5IDM6IGFyaWEtbGFiZWwgLyB0aXRsZVxuICAgIGNvbnN0IGNhbmRpZGF0ZXMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdidXR0b24sIFtyb2xlPVwiYnV0dG9uXCJdJyk7XG4gICAgZm9yIChjb25zdCBlbCBvZiBjYW5kaWRhdGVzKSB7XG4gICAgICAgIGNvbnN0IGxhYmVsID0gKGVsLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpIHx8IGVsLmdldEF0dHJpYnV0ZSgndGl0bGUnKSB8fCAnJykudHJpbSgpO1xuICAgICAgICBpZiAoL0tFUkpBS0FOXFxzK1NBVFVcXHMrR0lMSVJBTi9pLnRlc3QobGFiZWwpKSB7XG4gICAgICAgICAgICByZXR1cm4gZWw7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIF9pc0J1dHRvblVzYWJsZShidG4pIHtcbiAgICBpZiAoIWJ0bikgcmV0dXJuIGZhbHNlO1xuICAgIGlmIChidG4uZGlzYWJsZWQpIHJldHVybiBmYWxzZTtcbiAgICBpZiAoYnRuLmdldEF0dHJpYnV0ZSgnYXJpYS1kaXNhYmxlZCcpID09PSAndHJ1ZScpIHJldHVybiBmYWxzZTtcbiAgICBpZiAoYnRuLmNsYXNzTGlzdC5jb250YWlucygnZGlzYWJsZWQnKSkgcmV0dXJuIGZhbHNlO1xuICAgIGlmIChidG4uc3R5bGUucG9pbnRlckV2ZW50cyA9PT0gJ25vbmUnKSByZXR1cm4gZmFsc2U7XG4gICAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIF90cmlnZ2VyRG9tV29ya0NsaWNrKGJ0bikge1xuICAgIGlmICghYnRuKSByZXR1cm4gZmFsc2U7XG4gICAgdHJ5IHtcbiAgICAgICAgYnRuLmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNlZG93bicsIHsgYnViYmxlczogdHJ1ZSwgY2FuY2VsYWJsZTogdHJ1ZSB9KSk7XG4gICAgICAgIGJ0bi5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZXVwJywgeyBidWJibGVzOiB0cnVlLCBjYW5jZWxhYmxlOiB0cnVlIH0pKTtcbiAgICAgICAgYnRuLmNsaWNrKCk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gY2F0Y2gge1xuICAgICAgICBidG4uY2xpY2soKTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBfY2xpY2tEb21Xb3JrQnV0dG9uKCkge1xuICAgIGNvbnN0IGJ0biA9IF9nZXREb21Xb3JrQnV0dG9uKCk7XG4gICAgaWYgKGJ0biAmJiBfaXNCdXR0b25Vc2FibGUoYnRuKSkge1xuICAgICAgICByZXR1cm4gX3RyaWdnZXJEb21Xb3JrQ2xpY2soYnRuKTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufVxuXG5hc3luYyBmdW5jdGlvbiBfaGFuZGxlU3VjY2VzcyhjdHgsIHJlc3BvbnNlLCBlbmVyZ3ksIGVuZXJneUJlZm9yZSkge1xuICAgIGNvbnN0IHsgc3RhdGUsIENPTkZJRywgd29ya0hpc3RvcnksIGxvZywgc2VuZE5vdGlmaWNhdGlvbiwgcGxheU5vdGlmaWNhdGlvblNvdW5kLCB1cGRhdGVQYW5lbCwgd2FrZVBlbmRpbmdXb3JrIH0gPSBjdHg7XG5cbiAgICBsZXQgZGF0YSA9IG51bGw7XG4gICAgdHJ5IHsgZGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTsgfSBjYXRjaCAoZSkge1xuICAgICAgICBpZiAoZS5uYW1lID09PSAnQWJvcnRFcnJvcicpIHRocm93IGU7XG4gICAgICAgIGxvZygnUmVzcG9ucyBrZXJqYSBzdWtzZXMsIHRldGFwaSBkYXRhIHRpZGFrIHRlcmJhY2E7IG1lbWFrYWkgbmlsYWkgZmFsbGJhY2suJywgJ3dhcm4nKTtcbiAgICB9XG5cbiAgICBjb25zdCBwYXJzZWRFbmVyZ3lVc2VkID0gZGF0YT8uZW5lcmd5VXNlZCAhPSBudWxsID8gTnVtYmVyKGRhdGEuZW5lcmd5VXNlZCkgOiBOYU47XG4gICAgY29uc3QgaXNSZXBvcnRlZFplcm9FbmVyZ3kgPSBOdW1iZXIuaXNTYWZlSW50ZWdlcihwYXJzZWRFbmVyZ3lVc2VkKSAmJiBwYXJzZWRFbmVyZ3lVc2VkID09PSAwO1xuICAgIGNvbnN0IGhhc1JlcG9ydGVkRW5lcmd5ID0gTnVtYmVyLmlzU2FmZUludGVnZXIocGFyc2VkRW5lcmd5VXNlZCkgJiYgcGFyc2VkRW5lcmd5VXNlZCA+PSAxMCAmJiBwYXJzZWRFbmVyZ3lVc2VkIDw9IDM1MDtcblxuICAgIGNvbnN0IHBhcnNlZFhwID0gZGF0YT8ueHBFYXJuZWQgIT0gbnVsbCA/IE51bWJlcihkYXRhLnhwRWFybmVkKSA6IE5hTjtcbiAgICBjb25zdCBpc1JlcG9ydGVkWmVyb1hwID0gTnVtYmVyLmlzU2FmZUludGVnZXIocGFyc2VkWHApICYmIHBhcnNlZFhwID09PSAwO1xuXG4gICAgLy8gWmVyby1nYWluIHNoaWZ0OiBzZXJ2ZXIgZ2F2ZSAwIFhQIG9yIDAgZW5lcmd5IHVzZWQgKG5vdCBlbm91Z2ggZW5lcmd5IHRvIHByb2R1Y2UgMSB1bml0IG9yIHNlcnZlciBlbmVyZ3kgaXMgMClcbiAgICBpZiAoaXNSZXBvcnRlZFplcm9FbmVyZ3kgfHwgaXNSZXBvcnRlZFplcm9YcCB8fCBkYXRhPy5lcnJvciB8fCAodHlwZW9mIGRhdGE/Lm1lc3NhZ2UgPT09ICdzdHJpbmcnICYmIC9lbmVyZ3l8dW5pdC9pLnRlc3QoZGF0YS5tZXNzYWdlKSkpIHtcbiAgICAgICAgY29uc3QgZnJlc2ggPSBnZXRDdXJyZW50RW5lcmd5KCk7XG4gICAgICAgIGlmIChmcmVzaCkge1xuICAgICAgICAgICAgc3RhdGUuY3VycmVudEVuZXJneSA9IGZyZXNoLmN1cnJlbnQ7XG4gICAgICAgICAgICBzdGF0ZS5tYXhFbmVyZ3kgICAgID0gZnJlc2gubWF4O1xuICAgICAgICAgICAgc3RhdGUuZW5lcmd5U3luY0Jhc2UgPSB7IGN1cnJlbnQ6IGZyZXNoLmN1cnJlbnQsIG1heDogZnJlc2gubWF4LCB1cGRhdGVkQXQ6IERhdGUubm93KCkgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN0YXRlLmN1cnJlbnRFbmVyZ3kgPSAwO1xuICAgICAgICAgICAgc3RhdGUuZW5lcmd5U3luY0Jhc2UgPSB7IGN1cnJlbnQ6IDAsIG1heDogc3RhdGUubWF4RW5lcmd5IHx8IDExNSwgdXBkYXRlZEF0OiBEYXRlLm5vdygpIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgd2FpdE1zID0gTWF0aC5tYXgoMTAgKiA2MDAwMCwgZ2V0TmV4dFdvcmtEZWxheShzdGF0ZSwgQ09ORklHKSk7XG4gICAgICAgIGxvZyhgU2hpZnQgc2VsZXNhaSB0YXBpIG1lbmdoYXNpbGthbiAwIFhQIChlbmVyZ2kgZ2FtZSBzYWF0IGluaTogJHtzdGF0ZS5jdXJyZW50RW5lcmd5fS8ke3N0YXRlLm1heEVuZXJneX0gRU4pLiBNZW51bmdndSBlbmVyZ2kgcHVsaWguLi5gLCAnd2FybicpO1xuICAgICAgICBzdGF0ZS5uZXh0V29ya1RpbWVzdGFtcCA9IERhdGUubm93KCkgKyB3YWl0TXM7XG4gICAgICAgIHVwZGF0ZVBhbmVsKCk7XG4gICAgICAgIHJldHVybiAnd2FpdGluZyc7XG4gICAgfVxuXG4gICAgY29uc3Qgc3RhcnRpbmdFbmVyZ3kgPSAoZW5lcmd5QmVmb3JlICYmIHR5cGVvZiBlbmVyZ3lCZWZvcmUuY3VycmVudCA9PT0gJ251bWJlcicpXG4gICAgICAgID8gZW5lcmd5QmVmb3JlLmN1cnJlbnRcbiAgICAgICAgOiAoKGVuZXJneSAmJiB0eXBlb2YgZW5lcmd5LmN1cnJlbnQgPT09ICdudW1iZXInKSA/IGVuZXJneS5jdXJyZW50IDogKHN0YXRlLmN1cnJlbnRFbmVyZ3kgfHwgMCkpO1xuXG4gICAgY29uc3QgYXZhaWxhYmxlID0gTWF0aC5mbG9vcihzdGFydGluZ0VuZXJneSAvIDEwKSAqIDEwO1xuICAgIGNvbnN0IGVuZXJneVNwZW50ID0gaGFzUmVwb3J0ZWRFbmVyZ3lcbiAgICAgICAgPyBwYXJzZWRFbmVyZ3lVc2VkXG4gICAgICAgIDogKGF2YWlsYWJsZSA+IDAgPyBhdmFpbGFibGUgOiAxMCk7XG5cbiAgICBjb25zdCBjYWxjdWxhdGVkWHAgPSBNYXRoLm1heCg0LCBNYXRoLmZsb29yKGVuZXJneVNwZW50IC8gMTApICogNCk7XG4gICAgY29uc3QgeHBHYWluZWQgPSBOdW1iZXIuaXNTYWZlSW50ZWdlcihwYXJzZWRYcCkgJiYgcGFyc2VkWHAgPiAwXG4gICAgICAgID8gcGFyc2VkWHBcbiAgICAgICAgOiBjYWxjdWxhdGVkWHA7XG4gICAgY29uc3QgdW5pdHMgPSBOdW1iZXIoZGF0YT8ud29ya2VyVW5pdHMpIHx8IE51bWJlcihkYXRhPy5wcm9kdWNlZCkgfHwgMDtcblxuICAgIGlmICh4cEdhaW5lZCA8PSAwKSB7XG4gICAgICAgIGxvZyhgU2hpZnQgdGlkYWsgbWVuZ2hhc2lsa2FuIFhQLiBFbmVyZ2kgc2FhdCBpbmk6ICR7c3RhdGUuY3VycmVudEVuZXJneX0vJHtzdGF0ZS5tYXhFbmVyZ3l9IEVOLmAsICd3YXJuJyk7XG4gICAgICAgIHVwZGF0ZVBhbmVsKCk7XG4gICAgICAgIHJldHVybiAnd2FpdGluZyc7XG4gICAgfVxuXG4gICAgLy8gVXBkYXRlIGNvdW50ZXJzXG4gICAgc3RhdGUudG90YWxXb3JrZWQrKztcbiAgICBzdGF0ZS53b3JrVG9kYXkrKztcbiAgICBzdGF0ZS50b3RhbFdvcmtYUCAgKz0geHBHYWluZWQ7XG4gICAgc3RhdGUueHBUb2RheSAgICAgICs9IHhwR2FpbmVkO1xuICAgIHN0YXRlLnRvdGFsRW5lcmd5U3BlbnQgICAgICAgICAgKz0gZW5lcmd5U3BlbnQ7XG4gICAgc3RhdGUudG90YWxBY3R1YWxFbmVyZ3lTcGVudCAgICArPSBoYXNSZXBvcnRlZEVuZXJneSA/IHBhcnNlZEVuZXJneVVzZWQgOiAwO1xuICAgIHN0YXRlLnRvdGFsRXN0aW1hdGVkRW5lcmd5U3BlbnQgKz0gaGFzUmVwb3J0ZWRFbmVyZ3kgPyAwIDogZW5lcmd5U3BlbnQ7XG4gICAgc3RhdGUubGFzdFdvcmtUaW1lID0gbmV3IERhdGUoKS50b0xvY2FsZVRpbWVTdHJpbmcoJ2lkLUlEJyk7XG5cbiAgICAvLyBVcGRhdGUgZGFpbHkgaGlzdG9yeVxuICAgIGNvbnN0IHRvZGF5S2V5ID0gbmV3IERhdGUoKS50b0RhdGVTdHJpbmcoKTtcbiAgICBsZXQgaGlzdG9yeSA9IHdvcmtIaXN0b3J5IHx8IGN0eD8ud29ya0hpc3Rvcnk7XG4gICAgaWYgKHR5cGVvZiBoaXN0b3J5ID09PSAnc3RyaW5nJykge1xuICAgICAgICB0cnkgeyBoaXN0b3J5ID0gSlNPTi5wYXJzZShoaXN0b3J5KTsgfSBjYXRjaCB7IGhpc3RvcnkgPSB7fTsgfVxuICAgIH1cbiAgICBpZiAoIWhpc3RvcnkgfHwgdHlwZW9mIGhpc3RvcnkgIT09ICdvYmplY3QnKSBoaXN0b3J5ID0ge307XG4gICAgaWYgKCFoaXN0b3J5W3RvZGF5S2V5XSkgaGlzdG9yeVt0b2RheUtleV0gPSB7IHNoaWZ0czogMCwgeHA6IDAgfTtcbiAgICBjb25zdCB0b2RheSA9IGhpc3RvcnlbdG9kYXlLZXldO1xuICAgIHRvZGF5LnNoaWZ0cyA9ICh0b2RheS5zaGlmdHMgfHwgMCkgKyAxO1xuICAgIHRvZGF5LnhwICAgICA9ICh0b2RheS54cCB8fCAwKSArIHhwR2FpbmVkO1xuICAgIHRvZGF5LmVuZXJneVNwZW50ICAgICAgICAgICA9ICh0b2RheS5lbmVyZ3lTcGVudCB8fCAwKSArIChoYXNSZXBvcnRlZEVuZXJneSA/IGVuZXJneVNwZW50IDogMCk7XG4gICAgdG9kYXkuZXN0aW1hdGVkRW5lcmd5U3BlbnQgID0gKHRvZGF5LmVzdGltYXRlZEVuZXJneVNwZW50IHx8IDApICsgKGhhc1JlcG9ydGVkRW5lcmd5ID8gMCA6IGVuZXJneVNwZW50KTtcbiAgICB0b2RheS5lbmVyZ3lEYXRhU2hpZnRzICAgICAgPSAodG9kYXkuZW5lcmd5RGF0YVNoaWZ0cyB8fCAwKSArIChoYXNSZXBvcnRlZEVuZXJneSA/IDEgOiAwKTtcbiAgICBzYXZlV29ya0hpc3RvcnkoaGlzdG9yeSk7XG4gICAgaWYgKGN0eCkgY3R4LndvcmtIaXN0b3J5ID0gaGlzdG9yeTtcblxuICAgIC8vIE9wdGltaXN0aWMgZW5lcmd5IHVwZGF0ZSBiYXNlZCBvbiBzdGFydGluZ0VuZXJneSAobmV2ZXIgZG91YmxlIHN1YnRyYWN0ISlcbiAgICBpZiAoZGF0YT8uZW5lcmd5ICE9IG51bGwgJiYgdHlwZW9mIGRhdGEuZW5lcmd5ID09PSAnbnVtYmVyJykge1xuICAgICAgICBzdGF0ZS5jdXJyZW50RW5lcmd5ID0gTWF0aC5tYXgoMCwgTWF0aC5yb3VuZChkYXRhLmVuZXJneSkpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHN0YXRlLmN1cnJlbnRFbmVyZ3kgPSBNYXRoLm1heCgwLCBzdGFydGluZ0VuZXJneSAtIGVuZXJneVNwZW50KTtcbiAgICB9XG4gICAgc3RhdGUuZW5lcmd5U3luY0Jhc2UgPSB7IGN1cnJlbnQ6IHN0YXRlLmN1cnJlbnRFbmVyZ3ksIG1heDogc3RhdGUubWF4RW5lcmd5LCB1cGRhdGVkQXQ6IERhdGUubm93KCkgfTtcbiAgICBzdGF0ZS5sYXN0V29ya1RpbWVzdGFtcCA9IERhdGUubm93KCk7XG4gICAgc3RhdGUuZG9tRW5lcmd5U3RhbGUgPSB0cnVlO1xuXG4gICAgLy8gSW5zdGFudGx5IHBhdGNoIGhvc3QgcGFnZSB2aXN1YWwgRE9NIHNvIHVzZXIgZG9lc24ndCBzZWUgb2xkIHByZS1zaGlmdCBlbmVyZ3lcbiAgICBwYXRjaFBhZ2VWaXN1YWxFbmVyZ3koc3RhdGUuY3VycmVudEVuZXJneSwgc3RhdGUubWF4RW5lcmd5LCB0cnVlKTtcblxuICAgIC8vIFRyaWdnZXIgbmF0aXZlIHJldmFsaWRhdGlvbiBpbiBOZXh0LmpzIC8gU1dSIC8gUmVhY3QgUXVlcnlcbiAgICB0cnkge1xuICAgICAgICB3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2ZvY3VzJykpO1xuICAgIH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuXG4gICAgLy8gRnJlc2ggcmUtcmVhZCBvZiBncm91bmQtdHJ1dGggcGFnZSBlbmVyZ3kgYWZ0ZXIgVUkgdXBkYXRlc1xuICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICBjb25zdCBmcmVzaCA9IGdldEN1cnJlbnRFbmVyZ3koKTtcbiAgICAgICAgaWYgKGZyZXNoKSB7XG4gICAgICAgICAgICBzdGF0ZS5jdXJyZW50RW5lcmd5ID0gZnJlc2guY3VycmVudDtcbiAgICAgICAgICAgIHN0YXRlLm1heEVuZXJneSA9IGZyZXNoLm1heDtcbiAgICAgICAgICAgIHN0YXRlLmVuZXJneVN5bmNCYXNlID0geyBjdXJyZW50OiBmcmVzaC5jdXJyZW50LCBtYXg6IGZyZXNoLm1heCwgdXBkYXRlZEF0OiBEYXRlLm5vdygpIH07XG4gICAgICAgICAgICBzdGF0ZS5kb21FbmVyZ3lTdGFsZSA9IGZhbHNlO1xuICAgICAgICAgICAgdXBkYXRlUGFuZWw/LigpO1xuICAgICAgICB9XG4gICAgfSwgNjAwKTtcblxuICAgIHNhdmVTdGF0ZShzdGF0ZSk7XG4gICAgY29uc3QgdW5pdHNQYXJ0ID0gdW5pdHMgPiAwID8gYCB8ICske3VuaXRzfSB1bml0YCA6ICcnO1xuICAgIGxvZyhgS2VyamEgc3Vrc2VzISArJHt4cEdhaW5lZH0gWFAke3VuaXRzUGFydH0gfCBTaXNhOiAke3N0YXRlLmN1cnJlbnRFbmVyZ3l9LyR7c3RhdGUubWF4RW5lcmd5fSBFTmAsICdzdWNjZXNzJyk7XG4gICAgcGxheU5vdGlmaWNhdGlvblNvdW5kKENPTkZJRywgJ3N1Y2Nlc3MnKTtcbiAgICBzZW5kTm90aWZpY2F0aW9uKENPTkZJRywgJ1BhcmxhbWVudHVtJywgYEtlcmphIHN1a3NlcyEgKyR7eHBHYWluZWR9IFhQJHt1bml0c1BhcnR9YCk7XG4gICAgc3RhdGUubmV4dFdvcmtUaW1lc3RhbXAgPSBEYXRlLm5vdygpICsgZ2V0TmV4dFdvcmtEZWxheShzdGF0ZSwgQ09ORklHKTtcbiAgICB1cGRhdGVQYW5lbCgpO1xuICAgIHdha2VQZW5kaW5nV29yaz8uKCk7XG4gICAgcmV0dXJuICd3b3JrZWQnO1xufVxuXG5mdW5jdGlvbiBfaGFuZGxlVW5hdXRob3JpemVkKGN0eCkge1xuICAgIGNvbnN0IHsgc3RhdGUsIENPTkZJRywgbG9nLCBzZXRSdW5uaW5nVUksIHNlbmROb3RpZmljYXRpb24sIHBsYXlOb3RpZmljYXRpb25Tb3VuZCwgdXBkYXRlUGFuZWwgfSA9IGN0eDtcbiAgICBsb2coJ1Nlc2kgdG9rZW4ga2VkYWx1d2Fyc2EgKDQwMSkuIE1lLXJlbG9hZCB0YWIgZ2FtZSBkYWxhbSAyIGRldGlrIHVudHVrIG1lbXBlcmJhcnVpIHRva2VuLi4uJywgJ3dhcm4nKTtcbiAgICBzdGF0ZS5wYXVzZWRGb3JUb2tlbiA9IHRydWU7XG4gICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIHdpbmRvdy5sb2NhdGlvbi5yZWxvYWQoKTtcbiAgICB9LCAyMDAwKTtcbiAgICByZXR1cm4gJ3BhdXNlZCc7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIF9oYW5kbGVSZWplY3RlZChjdHgsIHJlc3BvbnNlKSB7XG4gICAgY29uc3QgeyBzdGF0ZSwgQ09ORklHLCBsb2csIHNldFJ1bm5pbmdVSSwgc2VuZE5vdGlmaWNhdGlvbiwgdXBkYXRlUGFuZWwgfSA9IGN0eDtcblxuICAgIGNvbnN0IGVycm9yVGV4dCA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcbiAgICBsZXQgc2VydmVyTWVzc2FnZSA9ICcnO1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UoZXJyb3JUZXh0KTtcbiAgICAgICAgaWYgKHR5cGVvZiBwYXJzZWQgPT09ICdzdHJpbmcnKSBzZXJ2ZXJNZXNzYWdlID0gcGFyc2VkO1xuICAgICAgICBlbHNlIGlmIChwYXJzZWQgJiYgdHlwZW9mIHBhcnNlZCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIHNlcnZlck1lc3NhZ2UgPSBbcGFyc2VkLm1lc3NhZ2UsIHBhcnNlZC5lcnJvciwgcGFyc2VkLmRldGFpbCwgcGFyc2VkLnJlYXNvbl1cbiAgICAgICAgICAgICAgICAuZmluZCh2ID0+IHR5cGVvZiB2ID09PSAnc3RyaW5nJykgfHwgJyc7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblxuICAgIGlmICghc2VydmVyTWVzc2FnZSkgc2VydmVyTWVzc2FnZSA9IGVycm9yVGV4dC5yZXBsYWNlKC88W14+XSo+L2csICcgJykucmVwbGFjZSgvXFxzKy9nLCAnICcpLnRyaW0oKTtcbiAgICBzZXJ2ZXJNZXNzYWdlID0gc2VydmVyTWVzc2FnZS5zbGljZSgwLCAyNDApO1xuXG4gICAgY29uc3QgY29tYmluZWQgPSBgJHtlcnJvclRleHR9ICR7c2VydmVyTWVzc2FnZX1gO1xuXG4gICAgaWYgKC93YWxsZXR8d2FnZS9pLnRlc3QoY29tYmluZWQpKSB7XG4gICAgICAgIGxvZygnTWFqaWthbiBLZWhhYmlzYW4gU2FsZG8hIEthcyBwZXJ1c2FoYWFuIHRpZGFrIGN1a3VwIHVudHVrIG1lbWJheWFyIHVwYWguIFNjcmlwdCBkaWplZGEuJywgJ2Vycm9yJyk7XG4gICAgICAgIHN0YXRlLnJ1bm5pbmcgPSBmYWxzZTtcbiAgICAgICAgc2V0UnVubmluZ1VJKGZhbHNlKTtcbiAgICAgICAgc2VuZE5vdGlmaWNhdGlvbihDT05GSUcsICdQYXJsYW1lbnR1bScsICdLYXMgbWFqaWthbiBoYWJpcyEgUGluZGFoIGxvd29uZ2FuIGRpIEpvYiBCb2FyZC4nKTtcbiAgICAgICAgcmV0dXJuICdwYXVzZWQnO1xuICAgIH1cblxuICAgIGlmICgvcmVnaW9ufHdpbGF5YWh8dHJhbnNpdHx0cmF2ZWx8cGVuZXJiYW5nYW4vaS50ZXN0KGNvbWJpbmVkKSkge1xuICAgICAgICBsb2coYCR7c2VydmVyTWVzc2FnZSB8fCAnQW5kYSBoYXJ1cyBiZXJhZGEgZGkgd2lsYXlhaCBwZXJ1c2FoYWFuIHVudHVrIGJla2VyamEgKHNlZGFuZyBkYWxhbSBwZXJqYWxhbmFuKSd9LiBNZW51bmdndSAzIG1lbml0Li4uYCwgJ3dhcm4nKTtcbiAgICAgICAgc3RhdGUubmV4dFdvcmtUaW1lc3RhbXAgPSBEYXRlLm5vdygpICsgMyAqIDYwMDAwO1xuICAgICAgICB1cGRhdGVQYW5lbCgpO1xuICAgICAgICByZXR1cm4gJ3dhaXRpbmcnO1xuICAgIH1cblxuICAgIGNvbnN0IGlzRW5lcmd5RXJyb3IgPSAvKGluc3VmZmljaWVudFtfIF1lbmVyZ3l8bm90IGVub3VnaCBlbmVyZ3l8ZW5lcmdpLnswLDQwfSg/OnRpZGFrfGJlbHVtfGt1cmFuZyl8cHJvZHVjZSBldmVuIG9uZSB1bml0KS9pLnRlc3QoY29tYmluZWQpO1xuXG4gICAgaWYgKGlzRW5lcmd5RXJyb3IpIHtcbiAgICAgICAgLy8gU2VydmVyIGluZGljYXRlcyBpbnN1ZmZpY2llbnQgZW5lcmd5IGZvciB1bml0IHByb2R1Y3Rpb25cbiAgICAgICAgY29uc3QgY3VyRW5lcmd5ID0gTWF0aC5tYXgoMCwgTnVtYmVyKHN0YXRlLmN1cnJlbnRFbmVyZ3kpIHx8IDApO1xuICAgICAgICBjb25zdCBuZWVkZWQgPSBNYXRoLm1heCgxLCAoQ09ORklHLmVuZXJneVRocmVzaG9sZCB8fCA5MCkgLSBjdXJFbmVyZ3kpO1xuICAgICAgICBjb25zdCByYXRlID0gc3RhdGUucmVnZW5SYXRlIHx8IDEuMDtcbiAgICAgICAgY29uc3Qgd2FpdE1zID0gTWF0aC5tYXgoNjAwMDAsIE1hdGgucm91bmQoKG5lZWRlZCAvIHJhdGUpICogNjAwMDApKTtcbiAgICAgICAgY29uc3Qgd2FpdE1pbnMgPSBNYXRoLnJvdW5kKHdhaXRNcyAvIDYwMDAwKTtcbiAgICAgICAgbG9nKGBTZXJ2ZXIgbWVub2xhayBrZXJqYSAoSFRUUCAke3Jlc3BvbnNlLnN0YXR1c30pOiAke3NlcnZlck1lc3NhZ2UgfHwgJ0VuZXJnaSBkaSBzZXJ2ZXIgYmVsdW0gY3VrdXAnfS4gTWVudW5nZ3UgdGFyZ2V0ICR7Q09ORklHLmVuZXJneVRocmVzaG9sZH0gRU4gKH4ke3dhaXRNaW5zfSBtbnQpLi4uYCwgJ3dhcm4nKTtcbiAgICAgICAgc3RhdGUubmV4dFdvcmtUaW1lc3RhbXAgPSBEYXRlLm5vdygpICsgd2FpdE1zO1xuICAgICAgICBzYXZlU3RhdGUoc3RhdGUpO1xuICAgICAgICBzYXZlTGl2ZVN0YXR1cyhzdGF0ZSwgQ09ORklHLCB0cnVlKTtcbiAgICAgICAgdXBkYXRlUGFuZWwoKTtcbiAgICAgICAgcmV0dXJuICd3YWl0aW5nJztcbiAgICB9XG5cbiAgICBsb2coYFNlcnZlciBtZW5vbGFrIGtlcmphIChIVFRQICR7cmVzcG9uc2Uuc3RhdHVzfSkke3NlcnZlck1lc3NhZ2UgPyBgOiAke3NlcnZlck1lc3NhZ2V9YCA6ICcnfWAsICdlcnJvcicpO1xuICAgIHN0YXRlLnJ1bm5pbmcgPSBmYWxzZTtcbiAgICBzZXRSdW5uaW5nVUkoZmFsc2UpO1xuICAgIHNhdmVTdGF0ZShzdGF0ZSk7XG4gICAgc2F2ZUxpdmVTdGF0dXMoc3RhdGUsIENPTkZJRywgdHJ1ZSk7XG4gICAgdXBkYXRlUGFuZWwoKTtcbiAgICBzZW5kTm90aWZpY2F0aW9uKENPTkZJRywgJ1BhcmxhbWVudHVtIEF1dG8gV29ya2VyIGRpamVkYScsIHNlcnZlck1lc3NhZ2UgfHwgYFNlcnZlciBtZW5vbGFrIChIVFRQICR7cmVzcG9uc2Uuc3RhdHVzfSkuYCk7XG4gICAgcmV0dXJuICdwYXVzZWQnO1xufVxuXG5mdW5jdGlvbiBfaGFuZGxlVGltZW91dChjdHgsIGVuZXJneUJlZm9yZSkge1xuICAgIGNvbnN0IHsgc3RhdGUsIGxvZywgc2V0UnVubmluZ1VJLCB1cGRhdGVQYW5lbCwgc2V0VmFsdWUgfSA9IGN0eDtcbiAgICBzdGF0ZS53b3JrUmVzdWx0VW5jZXJ0YWluICAgID0gdHJ1ZTtcbiAgICBzdGF0ZS51bmNlcnRhaW5SZWNvbmNpbGlhdGlvbiA9ICdwZW5kaW5nJztcbiAgICBjdHgudW5jZXJ0YWluRW5lcmd5QmVmb3JlICAgID0gZW5lcmd5QmVmb3JlO1xuICAgIHNldFZhbHVlKCdhd193b3JrUmVzdWx0VW5jZXJ0YWluJywgJ3RydWUnKTtcbiAgICBzZXRWYWx1ZSgnYXdfdW5jZXJ0YWluRW5lcmd5QmVmb3JlJywgSlNPTi5zdHJpbmdpZnkoZW5lcmd5QmVmb3JlKSk7XG4gICAgc3RhdGUucnVubmluZyA9IGZhbHNlO1xuICAgIHNldFJ1bm5pbmdVSShmYWxzZSk7XG4gICAgbG9nKCdSZXF1ZXN0IGtlcmphIHRpbWVvdXQgKDE1IGRldGlrKS4gSGFzaWwgYmVsdW0gcGFzdGk7IHNjcmlwdCBkaWplZGEuIE11YXQgdWxhbmcgaGFsYW1hbiBzZXRlbGFoIG1lbWVyaWtzYSBzdGF0dXMga2VyamEuJywgJ2Vycm9yJyk7XG4gICAgY3R4LnJlY29uY2lsZVVuY2VydGFpbldvcms/LigpO1xuICAgIHVwZGF0ZVBhbmVsKCk7XG4gICAgcmV0dXJuICd1bmNlcnRhaW4nO1xufVxuIiwiLyoqXG4gKiB1aS9pY29ucy5qcyDigJQgQ2xlYW4sIHByb2Zlc3Npb25hbCBpbmxpbmUgU1ZHIGljb24gc2V0IChMdWNpZGUvRmVhdGhlciBzdHlsZSlcbiAqIDEwMCUgdmVjdG9yIFNWRyBpY29ucyB3aXRoIHplcm8gZW1vamlzLlxuICovXG5cbmV4cG9ydCBjb25zdCBJQ09OUyA9IHtcbiAgICBtaW5pbWl6ZTogICBgPHN2ZyB3aWR0aD1cIjE0XCIgaGVpZ2h0PVwiMTRcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBvbHlsaW5lIHBvaW50cz1cIjYgOSAxMiAxNSAxOCA5XCI+PC9wb2x5bGluZT48L3N2Zz5gLFxuICAgIGV4cGFuZDogICAgIGA8c3ZnIHdpZHRoPVwiMTRcIiBoZWlnaHQ9XCIxNFwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cG9seWxpbmUgcG9pbnRzPVwiMTggMTUgMTIgOSA2IDE1XCI+PC9wb2x5bGluZT48L3N2Zz5gLFxuICAgIGxvY2tPcGVuOiAgIGA8c3ZnIHdpZHRoPVwiMTRcIiBoZWlnaHQ9XCIxNFwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cmVjdCB4PVwiM1wiIHk9XCIxMVwiIHdpZHRoPVwiMThcIiBoZWlnaHQ9XCIxMVwiIHJ4PVwiMlwiIHJ5PVwiMlwiPjwvcmVjdD48cGF0aCBkPVwiTTcgMTFWN2E1IDUgMCAwIDEgOS45LTFcIj48L3BhdGg+PC9zdmc+YCxcbiAgICBsb2NrQ2xvc2VkOiBgPHN2ZyB3aWR0aD1cIjE0XCIgaGVpZ2h0PVwiMTRcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHJlY3QgeD1cIjNcIiB5PVwiMTFcIiB3aWR0aD1cIjE4XCIgaGVpZ2h0PVwiMTFcIiByeD1cIjJcIiByeT1cIjJcIj48L3JlY3Q+PHBhdGggZD1cIk03IDExVjdhNSA1IDAgMCAxIDEwIDB2NFwiPjwvcGF0aD48L3N2Zz5gLFxuICAgIHNldHRpbmdzOiAgIGA8c3ZnIHdpZHRoPVwiMTRcIiBoZWlnaHQ9XCIxNFwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjEyXCIgcj1cIjNcIj48L2NpcmNsZT48cGF0aCBkPVwiTTE5LjQgMTVhMS42NSAxLjY1IDAgMCAwIC4zMyAxLjgybC4wNi4wNmEyIDIgMCAwIDEtMi44MyAyLjgzbC0uMDYtLjA2YTEuNjUgMS42NSAwIDAgMC0xLjgyLS4zMyAxLjY1IDEuNjUgMCAwIDAtMSAxLjUxVjIxYTIgMiAwIDAgMS00IDB2LS4wOUExLjY1IDEuNjUgMCAwIDAgOSAxOS40YTEuNjUgMS42NSAwIDAgMC0xLjgyLjMzbC0uMDYuMDZhMiAyIDAgMCAxLTIuODMtMi44M2wuMDYtLjA2QTEuNjUgMS42NSAwIDAgMCA0LjYgOWExLjY1IDEuNjUgMCAwIDAtMS41MS0xSDNhMiAyIDAgMCAxIDAtNGguMDlBMS42NSAxLjY1IDAgMCAwIDQuNiA0LjZhMS42NSAxLjY1IDAgMCAwLS4zMy0xLjgybC0uMDYtLjA2YTIgMiAwIDAgMSAyLjgzLTIuODNsLjA2LjA2QTEuNjUgMS42NSAwIDAgMCA5IDQuNmExLjY1IDEuNjUgMCAwIDAgMS0xLjUxVjNhMiAyIDAgMCAxIDQgMHYuMDlhMS42NSAxLjY1IDAgMCAwIDEgMS41MSAxLjY1IDEuNjUgMCAwIDAgMS44Mi0uMzNsLjA2LS4wNmEyIDIgMCAwIDEgMi44MyAyLjgzbC0uMDYuMDZBMS42NSAxLjY1IDAgMCAwIDE5LjQgOWExLjY1IDEuNjUgMCAwIDAgMS41MSAxSDIxYTIgMiAwIDAgMSAwIDRoLS4wOWExLjY1IDEuNjUgMCAwIDAtMS41MSAxelwiPjwvcGF0aD48L3N2Zz5gLFxuICAgIGNsb3NlOiAgICAgIGA8c3ZnIHdpZHRoPVwiMTRcIiBoZWlnaHQ9XCIxNFwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48bGluZSB4MT1cIjE4XCIgeTE9XCI2XCIgeDI9XCI2XCIgeTI9XCIxOFwiPjwvbGluZT48bGluZSB4MT1cIjZcIiB5MT1cIjZcIiB4Mj1cIjE4XCIgeTI9XCIxOFwiPjwvbGluZT48L3N2Zz5gLFxuICAgIHJvYm90OiAgICAgIGA8c3ZnIHdpZHRoPVwiMTVcIiBoZWlnaHQ9XCIxNVwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cmVjdCB4PVwiNFwiIHk9XCI0XCIgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgcng9XCIyXCI+PC9yZWN0PjxyZWN0IHg9XCI5XCIgeT1cIjlcIiB3aWR0aD1cIjZcIiBoZWlnaHQ9XCI2XCI+PC9yZWN0PjxsaW5lIHgxPVwiOVwiIHkxPVwiMVwiIHgyPVwiOVwiIHkyPVwiNFwiPjwvbGluZT48bGluZSB4MT1cIjE1XCIgeTE9XCIxXCIgeDI9XCIxNVwiIHkyPVwiNFwiPjwvbGluZT48bGluZSB4MT1cIjlcIiB5MT1cIjIwXCIgeDI9XCI5XCIgeTI9XCIyM1wiPjwvbGluZT48bGluZSB4MT1cIjE1XCIgeTE9XCIyMFwiIHgyPVwiMTVcIiB5Mj1cIjIzXCI+PC9saW5lPjxsaW5lIHgxPVwiMjBcIiB5MT1cIjlcIiB4Mj1cIjIzXCIgeTI9XCI5XCI+PC9saW5lPjxsaW5lIHgxPVwiMjBcIiB5MT1cIjE0XCIgeDI9XCIyM1wiIHkyPVwiMTRcIj48L2xpbmU+PGxpbmUgeDE9XCIxXCIgeTE9XCI5XCIgeDI9XCI0XCIgeTI9XCI5XCI+PC9saW5lPjxsaW5lIHgxPVwiMVwiIHkxPVwiMTRcIiB4Mj1cIjRcIiB5Mj1cIjE0XCI+PC9saW5lPjwvc3ZnPmAsXG4gICAgcGxheTogICAgICAgYDxzdmcgd2lkdGg9XCIxM1wiIGhlaWdodD1cIjEzXCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJjdXJyZW50Q29sb3JcIiBzdHJva2U9XCJub25lXCI+PHBvbHlnb24gcG9pbnRzPVwiNSAzIDE5IDEyIDUgMjEgNSAzXCI+PC9wb2x5Z29uPjwvc3ZnPmAsXG4gICAgcGF1c2U6ICAgICAgYDxzdmcgd2lkdGg9XCIxM1wiIGhlaWdodD1cIjEzXCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJjdXJyZW50Q29sb3JcIiBzdHJva2U9XCJub25lXCI+PHJlY3QgeD1cIjZcIiB5PVwiNFwiIHdpZHRoPVwiNFwiIGhlaWdodD1cIjE2XCI+PC9yZWN0PjxyZWN0IHg9XCIxNFwiIHk9XCI0XCIgd2lkdGg9XCI0XCIgaGVpZ2h0PVwiMTZcIj48L3JlY3Q+PC9zdmc+YCxcbiAgICB6YXA6ICAgICAgICBgPHN2ZyB3aWR0aD1cIjEzXCIgaGVpZ2h0PVwiMTNcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBvbHlnb24gcG9pbnRzPVwiMTMgMiAzIDE0IDEyIDE0IDExIDIyIDIxIDEwIDEyIDEwIDEzIDJcIj48L3BvbHlnb24+PC9zdmc+YCxcbiAgICBtYXBQaW46ICAgICBgPHN2ZyB3aWR0aD1cIjEzXCIgaGVpZ2h0PVwiMTNcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBhdGggZD1cIk0yMSAxMGMwIDctOSAxMy05IDEzcy05LTYtOS0xM2E5IDkgMCAwIDEgMTggMHpcIj48L3BhdGg+PGNpcmNsZSBjeD1cIjEyXCIgY3k9XCIxMFwiIHI9XCIzXCI+PC9jaXJjbGU+PC9zdmc+YCxcbiAgICBzaGllbGQ6ICAgICBgPHN2ZyB3aWR0aD1cIjEzXCIgaGVpZ2h0PVwiMTNcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBhdGggZD1cIk0xMiAyMnM4LTQgOC0xMFY1bC04LTMtOCAzdjdjMCA2IDggMTAgOCAxMHpcIj48L3BhdGg+PC9zdmc+YCxcbiAgICBrZXk6ICAgICAgICBgPHN2ZyB3aWR0aD1cIjEzXCIgaGVpZ2h0PVwiMTNcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBhdGggZD1cIk0yMSAybC0yIDJtLTEuNSAxLjVMMTQgOWwtMS41LTEuNS0zIDMgMS41IDEuNUw5IDE0bC0xLjUtMS41LTMgMyAxLjUgMS41TDMgMjBsMSAxIDUtNS0xLjUtMS41IDItMiAxLjUgMS41IDMtMy0xLjUtMS41IDMuNS0zLjVhNSA1IDAgMSAwLTctN3pcIj48L3BhdGg+PC9zdmc+YCxcbiAgICBmaWxlVGV4dDogICBgPHN2ZyB3aWR0aD1cIjEzXCIgaGVpZ2h0PVwiMTNcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBhdGggZD1cIk0xNCAySDZhMiAyIDAgMCAwLTIgMnYxNmEyIDIgMCAwIDAgMiAyaDEyYTIgMiAwIDAgMCAyLTJWOHpcIj48L3BhdGg+PHBvbHlsaW5lIHBvaW50cz1cIjE0IDIgMTQgOCAyMCA4XCI+PC9wb2x5bGluZT48bGluZSB4MT1cIjE2XCIgeTE9XCIxM1wiIHgyPVwiOFwiIHkyPVwiMTNcIj48L2xpbmU+PGxpbmUgeDE9XCIxNlwiIHkxPVwiMTdcIiB4Mj1cIjhcIiB5Mj1cIjE3XCI+PC9saW5lPjxwb2x5bGluZSBwb2ludHM9XCIxMCA5IDkgOSA4IDlcIj48L3BvbHlsaW5lPjwvc3ZnPmAsXG4gICAgY2xvY2s6ICAgICAgYDxzdmcgd2lkdGg9XCIxM1wiIGhlaWdodD1cIjEzXCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxjaXJjbGUgY3g9XCIxMlwiIGN5PVwiMTJcIiByPVwiMTBcIj48L2NpcmNsZT48cG9seWxpbmUgcG9pbnRzPVwiMTIgNiAxMiAxMiAxNiAxNFwiPjwvcG9seWxpbmU+PC9zdmc+YCxcbiAgICBzZWFyY2g6ICAgICBgPHN2ZyB3aWR0aD1cIjEzXCIgaGVpZ2h0PVwiMTNcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PGNpcmNsZSBjeD1cIjExXCIgY3k9XCIxMVwiIHI9XCI4XCI+PC9jaXJjbGU+PGxpbmUgeDE9XCIyMVwiIHkxPVwiMjFcIiB4Mj1cIjE2LjY1XCIgeTI9XCIxNi42NVwiPjwvbGluZT48L3N2Zz5gLFxuICAgIHRyYXNoOiAgICAgIGA8c3ZnIHdpZHRoPVwiMTNcIiBoZWlnaHQ9XCIxM1wiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cG9seWxpbmUgcG9pbnRzPVwiMyA2IDUgNiAyMSA2XCI+PC9wb2x5bGluZT48cGF0aCBkPVwiTTE5IDZ2MTRhMiAyIDAgMCAxLTIgMkg3YTIgMiAwIDAgMS0yLTJWNm0zIDBWNGEyIDIgMCAwIDEgMi0yaDRhMiAyIDAgMCAxIDIgMnYyXCI+PC9wYXRoPjwvc3ZnPmAsXG4gICAgY29weTogICAgICAgYDxzdmcgd2lkdGg9XCIxM1wiIGhlaWdodD1cIjEzXCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxyZWN0IHg9XCI5XCIgeT1cIjlcIiB3aWR0aD1cIjEzXCIgaGVpZ2h0PVwiMTNcIiByeD1cIjJcIiByeT1cIjJcIj48L3JlY3Q+PHBhdGggZD1cIk01IDE1SDRhMiAyIDAgMCAxLTItMlY0YTIgMiAwIDAgMSAyLTJoOWEyIDIgMCAwIDEgMiAydjFcIj48L3BhdGg+PC9zdmc+YCxcbiAgICBiZWxsOiAgICAgICBgPHN2ZyB3aWR0aD1cIjEzXCIgaGVpZ2h0PVwiMTNcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBhdGggZD1cIk0xOCA4QTYgNiAwIDAgMCA2IDhjMCA3LTMgOS0zIDloMThzLTMtMi0zLTlcIj48L3BhdGg+PHBhdGggZD1cIk0xMy43MyAyMWEyIDIgMCAwIDEtMy40NiAwXCI+PC9wYXRoPjwvc3ZnPmAsXG4gICAgbW9uaXRvcjogICAgYDxzdmcgd2lkdGg9XCIxM1wiIGhlaWdodD1cIjEzXCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxyZWN0IHg9XCIyXCIgeT1cIjNcIiB3aWR0aD1cIjIwXCIgaGVpZ2h0PVwiMTRcIiByeD1cIjJcIiByeT1cIjJcIj48L3JlY3Q+PGxpbmUgeDE9XCI4XCIgeTE9XCIyMVwiIHgyPVwiMTZcIiB5Mj1cIjIxXCI+PC9saW5lPjxsaW5lIHgxPVwiMTJcIiB5MT1cIjE3XCIgeDI9XCIxMlwiIHkyPVwiMjFcIj48L2xpbmU+PC9zdmc+YCxcbiAgICB1c2VyOiAgICAgICBgPHN2ZyB3aWR0aD1cIjEzXCIgaGVpZ2h0PVwiMTNcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBhdGggZD1cIk0yMCAyMXYtMmE0IDQgMCAwIDAtNC00SDhhNCA0IDAgMCAwLTQgNHYyXCI+PC9wYXRoPjxjaXJjbGUgY3g9XCIxMlwiIGN5PVwiN1wiIHI9XCI0XCI+PC9jaXJjbGU+PC9zdmc+YCxcbiAgICBjaGVjazogICAgICBgPHN2ZyB3aWR0aD1cIjEzXCIgaGVpZ2h0PVwiMTNcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyLjVcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cG9seWxpbmUgcG9pbnRzPVwiMjAgNiA5IDE3IDQgMTJcIj48L3BvbHlsaW5lPjwvc3ZnPmAsXG4gICAgYWxlcnQ6ICAgICAgYDxzdmcgd2lkdGg9XCIxM1wiIGhlaWdodD1cIjEzXCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxwYXRoIGQ9XCJNMTAuMjkgMy44NkwxLjgyIDE4YTIgMiAwIDAgMCAxLjcxIDNoMTYuOTRhMiAyIDAgMCAwIDEuNzEtM0wxMy43MSAzLjg2YTIgMiAwIDAgMC0zLjQyIDB6XCI+PC9wYXRoPjxsaW5lIHgxPVwiMTJcIiB5MT1cIjlcIiB4Mj1cIjEyXCIgeTI9XCIxM1wiPjwvbGluZT48bGluZSB4MT1cIjEyXCIgeTE9XCIxN1wiIHgyPVwiMTIuMDFcIiB5Mj1cIjE3XCI+PC9saW5lPjwvc3ZnPmAsXG4gICAgdm9sdW1lOiAgICAgYDxzdmcgd2lkdGg9XCIxM1wiIGhlaWdodD1cIjEzXCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxwb2x5Z29uIHBvaW50cz1cIjExIDUgNiA5IDIgOSAyIDE1IDYgMTUgMTEgMTkgMTEgNVwiPjwvcG9seWdvbj48cGF0aCBkPVwiTTE5LjA3IDQuOTNhMTAgMTAgMCAwIDEgMCAxNC4xNE0xNS41NCA4LjQ2YTUgNSAwIDAgMSAwIDcuMDdcIj48L3BhdGg+PC9zdmc+YCxcbiAgICBtb29uOiAgICAgICBgPHN2ZyB3aWR0aD1cIjEzXCIgaGVpZ2h0PVwiMTNcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyXCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBhdGggZD1cIk0yMSAxMi43OUE5IDkgMCAxIDEgMTEuMjEgMyA3IDcgMCAwIDAgMjEgMTIuNzl6XCI+PC9wYXRoPjwvc3ZnPmAsXG4gICAgcmVmcmVzaDogICAgYDxzdmcgd2lkdGg9XCIxM1wiIGhlaWdodD1cIjEzXCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxwb2x5bGluZSBwb2ludHM9XCIyMyA0IDIzIDEwIDE3IDEwXCI+PC9wb2x5bGluZT48cG9seWxpbmUgcG9pbnRzPVwiMSAyMCAxIDE0IDcgMTRcIj48L3BvbHlsaW5lPjxwYXRoIGQ9XCJNMy41MSA5YTkgOSAwIDAgMSAxNC44NS0zLjM2TDIzIDEwTTEgMTRsNC42NCA0LjM2QTkgOSAwIDAgMCAyMC40OSAxNVwiPjwvcGF0aD48L3N2Zz5gLFxuICAgIGV4dGVybmFsTGluazogYDxzdmcgd2lkdGg9XCIxM1wiIGhlaWdodD1cIjEzXCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMlwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2UtbGluZWpvaW49XCJyb3VuZFwiPjxwYXRoIGQ9XCJNMTggMTN2NmEyIDIgMCAwIDEtMiAySDVhMiAyIDAgMCAxLTItMlY4YTIgMiAwIDAgMSAyLTJoNlwiPjwvcGF0aD48cG9seWxpbmUgcG9pbnRzPVwiMTUgMyAyMSAzIDIxIDlcIj48L3BvbHlsaW5lPjxsaW5lIHgxPVwiMTBcIiB5MT1cIjE0XCIgeDI9XCIyMVwiIHkyPVwiM1wiPjwvbGluZT48L3N2Zz5gXG59O1xuIiwiLyoqXG4gKiB1aS9wYW5lbC5qcyDigJQgTWFpbiBmbG9hdGluZyBwYW5lbCBpbmplY3RlZCBpbnRvIHRoZSBwYWdlXG4gKlxuICogRXh0cmFjdGVkIGZyb20gY3JlYXRlUGFuZWwoKSwgdXBkYXRlUGFuZWwoKSwgc2V0dXBEcmFnQW5kRHJvcCgpLFxuICogc2V0dXBQYW5lbENvbnRyb2xzKCksIHNldHVwUmVzcG9uc2l2ZUJlaGF2aW9yKCkgaW4gRXh0ZW5zaW9uLmpzLlxuICogQWxsIGxvZ2ljIGlzIGlkZW50aWNhbCDigJQgb25seSBpbXBvcnRzIHJlcGxhY2UgZ2xvYmFsIHZhcmlhYmxlIHJlZmVyZW5jZXMuXG4gKi9cblxuaW1wb3J0IHsgZ2V0TGl2ZUNvdW50ZG93biwgZ2V0VGltZVRvRnVsbEVuZXJneSwgZ2V0VGltZVRvRnVsbEVuZXJneSBhcyB0dGZlLCBwYXRjaFBhZ2VWaXN1YWxFbmVyZ3ksIGdldEdhbWVFbmVyZ3lGdWxsVGV4dCB9IGZyb20gJy4uL2VuZXJneS5qcyc7XG5pbXBvcnQgeyBnZXRUaW1lVW50aWxFeHBpcnkgfSBmcm9tICcuLi90b2tlbi5qcyc7XG5pbXBvcnQgeyBnZXRWYWx1ZSwgc2V0VmFsdWUgfSBmcm9tICcuLi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IHNhdmVTdGF0ZSwgc2F2ZUxpdmVTdGF0dXMgfSBmcm9tICcuLi9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBJQ09OUyB9IGZyb20gJy4vaWNvbnMuanMnO1xuXG5jb25zdCBIRUFERVJfQlROX1NUWUxFID0gYFxuICAgIGJhY2tncm91bmQ6IHRyYW5zcGFyZW50OyBib3JkZXI6IG5vbmU7IGN1cnNvcjogcG9pbnRlcjsgcGFkZGluZzogMDtcbiAgICBib3JkZXItcmFkaXVzOiA2cHg7IGRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGp1c3RpZnktY29udGVudDogY2VudGVyO1xuICAgIHdpZHRoOiAyNHB4OyBoZWlnaHQ6IDI0cHg7IG1pbi13aWR0aDogMjRweDsgbWF4LXdpZHRoOiAyNHB4OyBmbGV4LXNocmluazogMCAhaW1wb3J0YW50O1xuICAgIHRyYW5zaXRpb246IGFsbCAwLjE1cyBlYXNlOyBjb2xvcjogIzg4OTJiMDsgbGluZS1oZWlnaHQ6IDE7IGJveC1zaXppbmc6IGJvcmRlci1ib3g7XG5gO1xuXG5mdW5jdGlvbiBfaW5qZWN0UGFuZWxTdHlsZXMoKSB7XG4gICAgaWYgKHR5cGVvZiBkb2N1bWVudCA9PT0gJ3VuZGVmaW5lZCcgfHwgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LXBhbmVsLXN0eWxlcycpKSByZXR1cm47XG4gICAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuICAgIHN0eWxlLmlkID0gJ2F3LXBhbmVsLXN0eWxlcyc7XG4gICAgc3R5bGUudGV4dENvbnRlbnQgPSBgXG4gICAgICAgIEBrZXlmcmFtZXMgYXctcHVsc2UtZ2xvdyB7XG4gICAgICAgICAgICAwJSB7XG4gICAgICAgICAgICAgICAgYm94LXNoYWRvdzogMCAxNnB4IDQwcHggcmdiYSgwLCAwLCAwLCAwLjU1KSwgMCAwIDEwcHggcmdiYSgwLCAyNTUsIDEzNiwgMC4yNSk7XG4gICAgICAgICAgICAgICAgYm9yZGVyLWNvbG9yOiByZ2JhKDAsIDI1NSwgMTM2LCAwLjQ1KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIDUwJSB7XG4gICAgICAgICAgICAgICAgYm94LXNoYWRvdzogMCAxNnB4IDQ0cHggcmdiYSgwLCAwLCAwLCAwLjY1KSwgMCAwIDIwcHggcmdiYSgwLCAyNTUsIDEzNiwgMC42NSk7XG4gICAgICAgICAgICAgICAgYm9yZGVyLWNvbG9yOiByZ2JhKDAsIDI1NSwgMTM2LCAwLjg1KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIDEwMCUge1xuICAgICAgICAgICAgICAgIGJveC1zaGFkb3c6IDAgMTZweCA0MHB4IHJnYmEoMCwgMCwgMCwgMC41NSksIDAgMCAxMHB4IHJnYmEoMCwgMjU1LCAxMzYsIDAuMjUpO1xuICAgICAgICAgICAgICAgIGJvcmRlci1jb2xvcjogcmdiYSgwLCAyNTUsIDEzNiwgMC40NSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgQGtleWZyYW1lcyBhdy1waWxsLXB1bHNlLWdsb3cge1xuICAgICAgICAgICAgMCUge1xuICAgICAgICAgICAgICAgIGJveC1zaGFkb3c6IDAgOHB4IDI0cHggcmdiYSgwLCAwLCAwLCAwLjY1KSwgMCAwIDhweCByZ2JhKDAsIDI1NSwgMTM2LCAwLjMpO1xuICAgICAgICAgICAgICAgIGJvcmRlci1jb2xvcjogcmdiYSgwLCAyNTUsIDEzNiwgMC40NSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICA1MCUge1xuICAgICAgICAgICAgICAgIGJveC1zaGFkb3c6IDAgMTBweCAyOHB4IHJnYmEoMCwgMCwgMCwgMC43NSksIDAgMCAxOHB4IHJnYmEoMCwgMjU1LCAxMzYsIDAuNzUpO1xuICAgICAgICAgICAgICAgIGJvcmRlci1jb2xvcjogcmdiYSgwLCAyNTUsIDEzNiwgMC45KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIDEwMCUge1xuICAgICAgICAgICAgICAgIGJveC1zaGFkb3c6IDAgOHB4IDI0cHggcmdiYSgwLCAwLCAwLCAwLjY1KSwgMCAwIDhweCByZ2JhKDAsIDI1NSwgMTM2LCAwLjMpO1xuICAgICAgICAgICAgICAgIGJvcmRlci1jb2xvcjogcmdiYSgwLCAyNTUsIDEzNiwgMC40NSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLmF3LXJlYWR5LWdsb3cge1xuICAgICAgICAgICAgYW5pbWF0aW9uOiBhdy1wdWxzZS1nbG93IDIuMnMgaW5maW5pdGUgZWFzZS1pbi1vdXQgIWltcG9ydGFudDtcbiAgICAgICAgfVxuICAgICAgICAjYXctcGlsbC1jb250YWluZXIuYXctcmVhZHktZ2xvdyB7XG4gICAgICAgICAgICBhbmltYXRpb246IGF3LXBpbGwtcHVsc2UtZ2xvdyAyLjJzIGluZmluaXRlIGVhc2UtaW4tb3V0ICFpbXBvcnRhbnQ7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LWJ0bi1hY3Rpb24ge1xuICAgICAgICAgICAgdHJhbnNpdGlvbjogYWxsIDAuMThzIGN1YmljLWJlemllcigwLjQsIDAsIDAuMiwgMSkgIWltcG9ydGFudDtcbiAgICAgICAgICAgIG91dGxpbmU6IG5vbmUgIWltcG9ydGFudDtcbiAgICAgICAgICAgIHVzZXItc2VsZWN0OiBub25lICFpbXBvcnRhbnQ7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LWJ0bi1hY3Rpb246aG92ZXI6bm90KDpkaXNhYmxlZCkge1xuICAgICAgICAgICAgZmlsdGVyOiBicmlnaHRuZXNzKDEuMTUpICFpbXBvcnRhbnQ7XG4gICAgICAgICAgICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoLTEuNXB4KSAhaW1wb3J0YW50O1xuICAgICAgICB9XG4gICAgICAgIC5hdy1idG4tYWN0aW9uOmFjdGl2ZTpub3QoOmRpc2FibGVkKSB7XG4gICAgICAgICAgICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoMC41cHgpIHNjYWxlKDAuOTcpICFpbXBvcnRhbnQ7XG4gICAgICAgICAgICBmaWx0ZXI6IGJyaWdodG5lc3MoMC45MikgIWltcG9ydGFudDtcbiAgICAgICAgfVxuICAgICAgICAuYXctaGVhZGVyLWJ0biB7XG4gICAgICAgICAgICB0cmFuc2l0aW9uOiBhbGwgMC4xNXMgZWFzZSAhaW1wb3J0YW50O1xuICAgICAgICAgICAgYm9yZGVyLXJhZGl1czogNnB4ICFpbXBvcnRhbnQ7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LWhlYWRlci1idG46aG92ZXIge1xuICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjEpICFpbXBvcnRhbnQ7XG4gICAgICAgICAgICBjb2xvcjogI2ZmZiAhaW1wb3J0YW50O1xuICAgICAgICB9XG4gICAgICAgIC5hdy1waWxsLWJ0biB7XG4gICAgICAgICAgICBkaXNwbGF5OiBpbmxpbmUtZmxleCAhaW1wb3J0YW50O1xuICAgICAgICAgICAgYWxpZ24taXRlbXM6IGNlbnRlciAhaW1wb3J0YW50O1xuICAgICAgICAgICAganVzdGlmeS1jb250ZW50OiBjZW50ZXIgIWltcG9ydGFudDtcbiAgICAgICAgICAgIGN1cnNvcjogcG9pbnRlciAhaW1wb3J0YW50O1xuICAgICAgICAgICAgb3V0bGluZTogbm9uZSAhaW1wb3J0YW50O1xuICAgICAgICAgICAgdHJhbnNpdGlvbjogYWxsIDAuMThzIGN1YmljLWJlemllcigwLjQsIDAsIDAuMiwgMSkgIWltcG9ydGFudDtcbiAgICAgICAgICAgIHVzZXItc2VsZWN0OiBub25lICFpbXBvcnRhbnQ7XG4gICAgICAgICAgICBwYWRkaW5nOiAwICFpbXBvcnRhbnQ7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LXBpbGwtYnRuOmhvdmVyOm5vdCg6ZGlzYWJsZWQpIHtcbiAgICAgICAgICAgIGZpbHRlcjogYnJpZ2h0bmVzcygxLjIpICFpbXBvcnRhbnQ7XG4gICAgICAgICAgICB0cmFuc2Zvcm06IHNjYWxlKDEuMDgpICFpbXBvcnRhbnQ7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LXBpbGwtYnRuOmFjdGl2ZTpub3QoOmRpc2FibGVkKSB7XG4gICAgICAgICAgICB0cmFuc2Zvcm06IHNjYWxlKDAuOTQpICFpbXBvcnRhbnQ7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LXBpbGwtYm94OmhvdmVyIHtcbiAgICAgICAgICAgIGJvcmRlci1jb2xvcjogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjI1KSAhaW1wb3J0YW50O1xuICAgICAgICAgICAgYm94LXNoYWRvdzogMCAxMnB4IDM0cHggcmdiYSgwLCAwLCAwLCAwLjc1KSwgMCAwIDE0cHggcmdiYSgwLCAyMTcsIDI1NSwgMC4yMikgIWltcG9ydGFudDtcbiAgICAgICAgfVxuICAgIGA7XG4gICAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChzdHlsZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0Rhc2hib2FyZFBhZ2UoKSB7XG4gICAgaWYgKHR5cGVvZiB3aW5kb3cgPT09ICd1bmRlZmluZWQnKSByZXR1cm4gdHJ1ZTtcbiAgICBjb25zdCBwYXRobmFtZSA9IHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZSB8fCAnJztcbiAgICBjb25zdCBjbGVhblBhdGggPSBwYXRobmFtZS5sZW5ndGggPiAxICYmIHBhdGhuYW1lLmVuZHNXaXRoKCcvJykgPyBwYXRobmFtZS5zbGljZSgwLCAtMSkgOiBwYXRobmFtZTtcbiAgICByZXR1cm4gY2xlYW5QYXRoID09PSAnL2Rhc2hib2FyZCcgfHwgY2xlYW5QYXRoLnN0YXJ0c1dpdGgoJy9kYXNoYm9hcmQvJykgfHwgY2xlYW5QYXRoID09PSAnLycgfHwgY2xlYW5QYXRoID09PSAnJztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNob3VsZFBhbmVsQmVWaXNpYmxlKHN0YXRlLCBDT05GSUcpIHtcbiAgICBpZiAoQ09ORklHLnBhbmVsRGFzaGJvYXJkT25seSAmJiAhaXNEYXNoYm9hcmRQYWdlKCkpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBpZiAoQ09ORklHLnBhbmVsTGVhZGVyT25seSAmJiBzdGF0ZS50YWJMb2NrTWFuYWdlZCAmJiAhc3RhdGUuaXNUYWJMb2NrT3duZXIpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBkb2N1bWVudCAhPT0gJ3VuZGVmaW5lZCcgJiYgZG9jdW1lbnQuaGlkZGVuKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKHN0YXRlLnBhbmVsVmlzaWJsZSA9PT0gZmFsc2UpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZVBhbmVsVmlzaWJpbGl0eShzdGF0ZSwgQ09ORklHKSB7XG4gICAgY29uc3QgcGFuZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctcGFuZWwnKTtcbiAgICBpZiAoIXBhbmVsKSByZXR1cm47XG4gICAgY29uc3QgdmlzaWJsZSA9IHN0YXRlLnVzZXJNYW51YWxseVRvZ2dsZWRQYW5lbCA/IEJvb2xlYW4oc3RhdGUucGFuZWxWaXNpYmxlKSA6IHNob3VsZFBhbmVsQmVWaXNpYmxlKHN0YXRlLCBDT05GSUcpO1xuICAgIHBhbmVsLnN0eWxlLmRpc3BsYXkgPSB2aXNpYmxlID8gJ2Jsb2NrJyA6ICdub25lJztcbn1cblxuLyoqIEBwYXJhbSB7b2JqZWN0fSBzdGF0ZSBAcGFyYW0ge29iamVjdH0gQ09ORklHIEBwYXJhbSB7b2JqZWN0fSBjdHggKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVQYW5lbChzdGF0ZSwgQ09ORklHLCBjdHgpIHtcbiAgICBjb25zdCBvbGQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctcGFuZWwnKTtcbiAgICBpZiAob2xkKSBvbGQucmVtb3ZlKCk7XG5cbiAgICBfaW5qZWN0UGFuZWxTdHlsZXMoKTtcblxuICAgIHN0YXRlLnVzZXJNYW51YWxseVRvZ2dsZWRQYW5lbCA9IGZhbHNlO1xuICAgIGlmIChDT05GSUcucGFuZWxEYXNoYm9hcmRPbmx5ICYmIGlzRGFzaGJvYXJkUGFnZSgpKSB7XG4gICAgICAgIHN0YXRlLnBhbmVsVmlzaWJsZSA9IHRydWU7XG4gICAgICAgIHNldFZhbHVlKCdwYW5lbFZpc2libGUnLCAndHJ1ZScpO1xuICAgIH1cblxuICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICBjb25zdCBwYW5lbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICBwYW5lbC5pZCA9ICdhdy1wYW5lbCc7XG4gICAgICAgIHBhbmVsLnN0eWxlLmNzc1RleHQgPSBgXG4gICAgICAgICAgICBwb3NpdGlvbjogZml4ZWQ7IHRvcDogJHtzdGF0ZS5wYW5lbFl9cHg7IGxlZnQ6ICR7c3RhdGUucGFuZWxYfXB4O1xuICAgICAgICAgICAgY29sb3I6ICNlMGUwZTA7XG4gICAgICAgICAgICBmb250LWZhbWlseTogLWFwcGxlLXN5c3RlbSwgQmxpbmtNYWNTeXN0ZW1Gb250LCAnU2Vnb2UgVUknLCBSb2JvdG8sIEhlbHZldGljYSwgQXJpYWwsIHNhbnMtc2VyaWY7XG4gICAgICAgICAgICBmb250LXNpemU6IDEycHg7XG4gICAgICAgICAgICB6LWluZGV4OiA5OTk5OTtcbiAgICAgICAgICAgIGJveC1zaXppbmc6IGJvcmRlci1ib3g7XG4gICAgICAgICAgICB1c2VyLXNlbGVjdDogbm9uZTtcbiAgICAgICAgICAgIHRyYW5zaXRpb246IGJvcmRlci1jb2xvciAwLjNzIGVhc2UsIGJveC1zaGFkb3cgMC4zcyBlYXNlO1xuICAgICAgICAgICAgb3ZlcmZsb3c6IHZpc2libGU7XG4gICAgICAgICAgICBkaXNwbGF5OiAke3Nob3VsZFBhbmVsQmVWaXNpYmxlKHN0YXRlLCBDT05GSUcpID8gJ2Jsb2NrJyA6ICdub25lJ307XG4gICAgICAgIGA7XG4gICAgICAgIHBhbmVsLmlubmVySFRNTCA9IF9idWlsZFBhbmVsSFRNTChzdGF0ZSwgQ09ORklHKTtcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChwYW5lbCk7XG4gICAgICAgIGFwcGx5UGFuZWxNb2RlKHN0YXRlLCBCb29sZWFuKHN0YXRlLnBhbmVsTWluaW1pemVkKSk7XG4gICAgICAgIF9zZXR1cERyYWdBbmREcm9wKHBhbmVsLCBzdGF0ZSwgQ09ORklHKTtcbiAgICAgICAgX3NldHVwUGFuZWxDb250cm9scyhwYW5lbCwgc3RhdGUsIENPTkZJRywgY3R4KTtcbiAgICAgICAgX3NldHVwUmVzcG9uc2l2ZUJlaGF2aW9yKHBhbmVsLCBzdGF0ZSwgQ09ORklHKTtcblxuICAgICAgICAvLyBFY28tTW9kZSBXYWtldXA6IGluc3RhbnRseSByZS1yZW5kZXIgVUkgd2hlbiB0YWIgaXMgYnJvdWdodCB0byBmb3JlZ3JvdW5kXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ3Zpc2liaWxpdHljaGFuZ2UnLCAoKSA9PiB7XG4gICAgICAgICAgICBpZiAoIWRvY3VtZW50LmhpZGRlbikge1xuICAgICAgICAgICAgICAgIGN0eC51cGRhdGVQYW5lbD8uKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGN0eC5sb2coJ1BhbmVsIHY1LjExLjAgc2lhcCEnLCAnc3VjY2VzcycpO1xuICAgIH0sIDI1MCk7XG59XG5cbi8qKiBAcGFyYW0ge29iamVjdH0gc3RhdGUgQHBhcmFtIHtvYmplY3R9IENPTkZJRyBAcGFyYW0ge29iamVjdH0gd29ya0hpc3RvcnkgQHBhcmFtIHtvYmplY3R9IGN0eCAqL1xuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZVBhbmVsKHN0YXRlLCBDT05GSUcsIHdvcmtIaXN0b3J5LCBjdHgpIHtcbiAgICBpZiAoIWNocm9tZS5ydW50aW1lPy5pZCkgcmV0dXJuO1xuICAgIGNvbnN0IHsgZ2V0U3luY2VkRW5lcmd5LCBnZXRQbGF5ZXJMZXZlbCwgZ2V0TWF4RW5lcmd5Rm9yTGV2ZWwgfSA9IGN0eDtcblxuICAgIGlmICghc3RhdGUudXNlck1hbnVhbGx5VG9nZ2xlZFBhbmVsKSB7XG4gICAgICAgIHVwZGF0ZVBhbmVsVmlzaWJpbGl0eShzdGF0ZSwgQ09ORklHKTtcbiAgICB9XG5cbiAgICAvLyBSZWxvYWQgc3RhdGUgaW4gc3RhbmRieSB0YWJzXG4gICAgaWYgKHN0YXRlLnRhYkxvY2tNYW5hZ2VkICYmICFzdGF0ZS5pc1RhYkxvY2tPd25lcikge1xuICAgICAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICAgICAgICBpZiAobm93IC0gKHVwZGF0ZVBhbmVsLl9sYXN0U3RhbmRieSB8fCAwKSA+PSAzMDAwKSB7XG4gICAgICAgICAgICBjdHgucmVsb2FkU3RhdGVGcm9tU3RvcmFnZT8uKCk7XG4gICAgICAgICAgICB1cGRhdGVQYW5lbC5fbGFzdFN0YW5kYnkgPSBub3c7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBlbmVyZ3kgPSBjdHguZ2V0U3luY2VkRW5lcmd5KHN0YXRlKTtcbiAgICBpZiAoZW5lcmd5KSB7XG4gICAgICAgIHN0YXRlLmN1cnJlbnRFbmVyZ3kgPSBlbmVyZ3kuY3VycmVudDtcbiAgICAgICAgc3RhdGUubWF4RW5lcmd5ID0gZW5lcmd5Lm1heDtcbiAgICAgICAgaWYgKHN0YXRlLmRvbUVuZXJneVN0YWxlKSB7XG4gICAgICAgICAgICBwYXRjaFBhZ2VWaXN1YWxFbmVyZ3koc3RhdGUuY3VycmVudEVuZXJneSwgc3RhdGUubWF4RW5lcmd5KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIEtlZXAgbmV4dCB3b3JrIHNjaGVkdWxlIGFjY3VyYXRlbHkgc3luY2hyb25pemVkIHdpdGggY3VycmVudCBlbmVyZ3lcbiAgICBpZiAoc3RhdGUuY3VycmVudEVuZXJneSA8IENPTkZJRy5lbmVyZ3lUaHJlc2hvbGQpIHtcbiAgICAgICAgY29uc3QgcmF0ZSA9IHN0YXRlLnJlZ2VuUmF0ZSB8fCAxLjA7XG4gICAgICAgIGNvbnN0IG5lZWRlZE1zID0gTWF0aC5tYXgoMSwgKENPTkZJRy5lbmVyZ3lUaHJlc2hvbGQgLSBzdGF0ZS5jdXJyZW50RW5lcmd5KSAvIHJhdGUpICogNjAwMDA7XG4gICAgICAgIGlmICghc3RhdGUubmV4dFdvcmtUaW1lc3RhbXApIHtcbiAgICAgICAgICAgIHN0YXRlLm5leHRXb3JrVGltZXN0YW1wID0gRGF0ZS5ub3coKSArIG5lZWRlZE1zO1xuICAgICAgICB9IGVsc2UgaWYgKHN0YXRlLm5leHRXb3JrVGltZXN0YW1wID4gRGF0ZS5ub3coKSkge1xuICAgICAgICAgICAgY29uc3QgcmVtYWluaW5nID0gc3RhdGUubmV4dFdvcmtUaW1lc3RhbXAgLSBEYXRlLm5vdygpO1xuICAgICAgICAgICAgaWYgKE1hdGguYWJzKHJlbWFpbmluZyAtIG5lZWRlZE1zKSA+IDEyMDAwMCkge1xuICAgICAgICAgICAgICAgIHN0YXRlLm5leHRXb3JrVGltZXN0YW1wID0gRGF0ZS5ub3coKSArIG5lZWRlZE1zO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBlbHNlIGlmIChzdGF0ZS5ydW5uaW5nICYmIHN0YXRlLmlzVGFiTG9ja093bmVyICYmICFzdGF0ZS53b3JrSW5GbGlnaHQgJiYgIXN0YXRlLndvcmtSZXN1bHRVbmNlcnRhaW4pIHtcbiAgICAgICAgaWYgKCFzdGF0ZS5uZXh0V29ya1RpbWVzdGFtcCB8fCBEYXRlLm5vdygpID49IHN0YXRlLm5leHRXb3JrVGltZXN0YW1wKSB7XG4gICAgICAgICAgICBzdGF0ZS5uZXh0V29ya1RpbWVzdGFtcCA9IERhdGUubm93KCk7XG4gICAgICAgICAgICBjdHgud2FrZVBlbmRpbmdXb3JrPy4oKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IG5ld0xldmVsID0gY3R4LmdldFBsYXllckxldmVsKHN0YXRlKTtcbiAgICBpZiAobmV3TGV2ZWwgIT09IHN0YXRlLnBsYXllckxldmVsKSB7XG4gICAgICAgIHN0YXRlLnBsYXllckxldmVsID0gbmV3TGV2ZWw7XG4gICAgICAgIGlmICghZW5lcmd5KSB7XG4gICAgICAgICAgICBjb25zdCBtYXggPSBnZXRNYXhFbmVyZ3lGb3JMZXZlbChuZXdMZXZlbCk7XG4gICAgICAgICAgICBpZiAobWF4ICE9PSBzdGF0ZS5tYXhFbmVyZ3kpIHN0YXRlLm1heEVuZXJneSA9IG1heDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGVuZXJneUZ1bGwgPSBzdGF0ZS5tYXhFbmVyZ3kgPiAwICYmIHN0YXRlLmN1cnJlbnRFbmVyZ3kgPj0gc3RhdGUubWF4RW5lcmd5O1xuICAgIGlmICghZW5lcmd5RnVsbCkge1xuICAgICAgICBzdGF0ZS5lbmVyZ3lGdWxsQWxlcnRBY3RpdmUgPSBmYWxzZTtcbiAgICB9IGVsc2UgaWYgKENPTkZJRy5lbmVyZ3lGdWxsQWxlcnRFbmFibGVkICYmICFzdGF0ZS5lbmVyZ3lGdWxsQWxlcnRBY3RpdmUpIHtcbiAgICAgICAgc3RhdGUuZW5lcmd5RnVsbEFsZXJ0QWN0aXZlID0gdHJ1ZTtcbiAgICAgICAgaWYgKCFzdGF0ZS50YWJMb2NrTWFuYWdlZCB8fCBzdGF0ZS5pc1RhYkxvY2tPd25lcikge1xuICAgICAgICAgICAgY3R4LmxvZyhgRW5lcmdpIHBlbnVoICgke3N0YXRlLmN1cnJlbnRFbmVyZ3l9LyR7c3RhdGUubWF4RW5lcmd5fSkhIE1lbmdla3Nla3VzaSBzaGlmdC4uLmAsICd3YXJuJyk7XG4gICAgICAgICAgICBjdHgucGxheUVuZXJneUZ1bGxBbGFybT8uKENPTkZJRyk7XG4gICAgICAgICAgICBjdHguc2VuZE5vdGlmaWNhdGlvbj8uKENPTkZJRywgJ0VuZXJnaSBQZW51aCcsIGBFbmVyZ2kgJHtzdGF0ZS5jdXJyZW50RW5lcmd5fS8ke3N0YXRlLm1heEVuZXJneX0uIFNpYXAgYmVrZXJqYS5gKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoc3RhdGUucnVubmluZyAmJiBzdGF0ZS5pc1RhYkxvY2tPd25lciAmJiAhc3RhdGUud29ya0luRmxpZ2h0ICYmICFzdGF0ZS53b3JrUmVzdWx0VW5jZXJ0YWluKSB7XG4gICAgICAgICAgICBpZiAoIXN0YXRlLm5leHRXb3JrVGltZXN0YW1wIHx8IERhdGUubm93KCkgPj0gc3RhdGUubmV4dFdvcmtUaW1lc3RhbXApIHtcbiAgICAgICAgICAgICAgICBzdGF0ZS5uZXh0V29ya1RpbWVzdGFtcCA9IERhdGUubm93KCk7XG4gICAgICAgICAgICAgICAgY3R4Lndha2VQZW5kaW5nV29yaz8uKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBSZWdpb24gJiBCdWZmIGF1dG8tZGV0ZWN0aW9uXG4gICAgaWYgKGN0eC5nZXRSZWdpb25EZXRhaWxzKSB7XG4gICAgICAgIGNvbnN0IHJlZyA9IGN0eC5nZXRSZWdpb25EZXRhaWxzKCk7XG4gICAgICAgIGlmIChyZWcpIHtcbiAgICAgICAgICAgIGlmIChyZWcubmFtZSAmJiByZWcubmFtZSAhPT0gc3RhdGUucmVnaW9uTmFtZSkge1xuICAgICAgICAgICAgICAgIHN0YXRlLnJlZ2lvbk5hbWUgPSByZWcubmFtZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyZWcuYm9udXNQZXJjZW50ICE9PSBzdGF0ZS5yZWdpb25IZWFsdGhCb251c1BlcmNlbnQpIHtcbiAgICAgICAgICAgICAgICBzdGF0ZS5yZWdpb25IZWFsdGhCb251c1BlcmNlbnQgPSByZWcuYm9udXNQZXJjZW50O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJlZy5ib251c011bHRpcGxpZXIgJiYgTWF0aC5hYnMocmVnLmJvbnVzTXVsdGlwbGllciAtIChzdGF0ZS5yZWdlblJhdGUgfHwgMS4wKSkgPiAwLjAxKSB7XG4gICAgICAgICAgICAgICAgc3RhdGUucmVnZW5SYXRlID0gcmVnLmJvbnVzTXVsdGlwbGllcjtcbiAgICAgICAgICAgICAgICBpZiAoc3RhdGUuY3VycmVudEVuZXJneSA8IENPTkZJRy5lbmVyZ3lUaHJlc2hvbGQpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbmVlZGVkTXMgPSBNYXRoLm1heCgxLCAoQ09ORklHLmVuZXJneVRocmVzaG9sZCAtIHN0YXRlLmN1cnJlbnRFbmVyZ3kpIC8gc3RhdGUucmVnZW5SYXRlKSAqIDYwMDAwO1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZS5uZXh0V29ya1RpbWVzdGFtcCA9IERhdGUubm93KCkgKyBuZWVkZWRNcztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBfcGF0Y2hFbCgnYXctcmVnaW9uLW5hbWUnLCBlbCA9PiBlbC50ZXh0Q29udGVudCA9IHN0YXRlLnJlZ2lvbk5hbWUgfHwgJ1dpbGF5YWgnKTtcbiAgICAgICAgICAgIF9wYXRjaEVsKCdhdy1yZWdpb24tYnVmZicsIGVsID0+IHtcbiAgICAgICAgICAgICAgICBlbC50ZXh0Q29udGVudCA9IHN0YXRlLnJlZ2lvbkhlYWx0aEJvbnVzUGVyY2VudCA+IDBcbiAgICAgICAgICAgICAgICAgICAgPyBgKyR7c3RhdGUucmVnaW9uSGVhbHRoQm9udXNQZXJjZW50fSUgUmVnZW5gXG4gICAgICAgICAgICAgICAgICAgIDogJ05vcm1hbCAoMS4weCknO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBFY28tTW9kZTogU2tpcCBhbGwgdmlzdWFsIERPTSBtb2RpZmljYXRpb25zIGlmIHRhYiBpcyBpbiB0aGUgYmFja2dyb3VuZFxuICAgIC8vIENvbnNlcnZlcyBSQU0gYW5kIENQVSB3aGlsZSBrZWVwaW5nIHRpbWVycyBhbmQgd29yayBzY2hlZHVsZXIgMTAwJSBhY2N1cmF0ZVxuICAgIGNvbnN0IGlzSGlkZGVuID0gdHlwZW9mIGRvY3VtZW50ICE9PSAndW5kZWZpbmVkJyAmJiBkb2N1bWVudC5oaWRkZW47XG4gICAgaWYgKENPTkZJRy5lY29Nb2RlRW5hYmxlZCAhPT0gZmFsc2UgJiYgaXNIaWRkZW4pIHtcbiAgICAgICAgaWYgKCFzdGF0ZS50YWJMb2NrTWFuYWdlZCB8fCBzdGF0ZS5pc1RhYkxvY2tPd25lcikge1xuICAgICAgICAgICAgc2F2ZUxpdmVTdGF0dXMoc3RhdGUsIENPTkZJRyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHRocmVzaG9sZCA9IENPTkZJRy5lbmVyZ3lUaHJlc2hvbGQgfHwgMTA7XG4gICAgY29uc3QgaXNSZWFkeVRvV29yayA9IHN0YXRlLmN1cnJlbnRFbmVyZ3kgPj0gdGhyZXNob2xkO1xuXG4gICAgLy8gRHluYW1pYyBnbG93IG9uIHBhbmVsICYgcGlsbCB3aGVuIHJlYWR5IHRvIHdvcmtcbiAgICBjb25zdCBwYW5lbEVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LXBhbmVsJyk7XG4gICAgY29uc3QgcGlsbEVsICA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1waWxsLWNvbnRhaW5lcicpO1xuICAgIGlmIChwYW5lbEVsKSB7XG4gICAgICAgIGlmIChpc1JlYWR5VG9Xb3JrICYmIHN0YXRlLnJ1bm5pbmcgJiYgIXN0YXRlLndvcmtJbkZsaWdodCkge1xuICAgICAgICAgICAgcGFuZWxFbC5jbGFzc0xpc3QuYWRkKCdhdy1yZWFkeS1nbG93Jyk7XG4gICAgICAgICAgICBpZiAocGlsbEVsKSBwaWxsRWwuY2xhc3NMaXN0LmFkZCgnYXctcmVhZHktZ2xvdycpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcGFuZWxFbC5jbGFzc0xpc3QucmVtb3ZlKCdhdy1yZWFkeS1nbG93Jyk7XG4gICAgICAgICAgICBpZiAocGlsbEVsKSBwaWxsRWwuY2xhc3NMaXN0LnJlbW92ZSgnYXctcmVhZHktZ2xvdycpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gRE9NIHVwZGF0ZXNcbiAgICBjb25zdCBzYWZlTWF4ID0gKHN0YXRlLm1heEVuZXJneSAmJiBzdGF0ZS5tYXhFbmVyZ3kgPiAwKSA/IHN0YXRlLm1heEVuZXJneSA6IDExMDtcbiAgICBjb25zdCBlbmVyZ3lQY3QgPSBNYXRoLm1heCgwLCBNYXRoLm1pbigxMDAsIChzdGF0ZS5jdXJyZW50RW5lcmd5IC8gc2FmZU1heCkgKiAxMDApKTtcbiAgICBfcGF0Y2hFbCgnYXctZW5lcmd5LXRleHQnLCAgIGVsID0+IGVsLnRleHRDb250ZW50ID0gYCR7c3RhdGUuY3VycmVudEVuZXJneX0vJHtzdGF0ZS5tYXhFbmVyZ3l9YCk7XG4gICAgX3BhdGNoRWwoJ2F3LWVuZXJneS1iYXInLCAgICBlbCA9PiBlbC5zdHlsZS53aWR0aCAgPSBgJHtlbmVyZ3lQY3R9JWApO1xuICAgIGNvbnN0IGxpdmVDb3VudGRvd24gPSBnZXRMaXZlQ291bnRkb3duKHN0YXRlLCBDT05GSUcpO1xuICAgIF9wYXRjaEVsKCdhdy1uZXh0LXdvcmsnLCAgICAgZWwgPT4ge1xuICAgICAgICBlbC50ZXh0Q29udGVudCA9IGxpdmVDb3VudGRvd247XG4gICAgICAgIGVsLnN0eWxlLmNvbG9yID0gaXNSZWFkeVRvV29yayA/ICcjMDBmZjg4JyA6ICcjMDBkOWZmJztcbiAgICB9KTtcbiAgICBfcGF0Y2hFbCgnYXctZnVsbC1lbmVyZ3knLCAgIGVsID0+IGVsLnRleHRDb250ZW50ICA9IGdldFRpbWVUb0Z1bGxFbmVyZ3koc3RhdGUpKTtcblxuICAgIC8vIFBpbGwgbGl2ZSB1cGRhdGVzXG4gICAgX3BhdGNoRWwoJ2F3LXBpbGwtZW5lcmd5JywgZWwgPT4gZWwudGV4dENvbnRlbnQgPSBgJHtzdGF0ZS5jdXJyZW50RW5lcmd5fS8ke3N0YXRlLm1heEVuZXJneX1gKTtcbiAgICBfcGF0Y2hFbCgnYXctcGlsbC1jb3VudGRvd24nLCBlbCA9PiB7XG4gICAgICAgIGVsLnRleHRDb250ZW50ID0gaXNSZWFkeVRvV29yayA/ICdTaWFwJyA6IGxpdmVDb3VudGRvd247XG4gICAgICAgIGVsLnN0eWxlLmNvbG9yID0gaXNSZWFkeVRvV29yayA/ICcjMDBmZjg4JyA6ICcjMDBkOWZmJztcbiAgICB9KTtcbiAgICBfcGF0Y2hFbCgnYXctcGlsbC1jb3VudGRvd24taWNvbicsIGVsID0+IHtcbiAgICAgICAgZWwuaW5uZXJIVE1MID0gaXNSZWFkeVRvV29yayA/IElDT05TLnphcCA6IElDT05TLmNsb2NrO1xuICAgIH0pO1xuICAgIF9wYXRjaEVsKCdhdy1waWxsLXN0YXR1cy1kb3QnLCBlbCA9PiB7XG4gICAgICAgIGNvbnN0IGRvdENvbG9yID0gc3RhdGUud29ya1Jlc3VsdFVuY2VydGFpbiA/ICcjZmZhYTAwJyA6IChzdGF0ZS5ydW5uaW5nID8gJyMwMGZmODgnIDogJyNmZjQ3NTcnKTtcbiAgICAgICAgZWwuc3R5bGUuYmFja2dyb3VuZCA9IGRvdENvbG9yO1xuICAgICAgICBlbC5zdHlsZS5ib3hTaGFkb3cgID0gYDAgMCA4cHggJHtkb3RDb2xvcn1gO1xuICAgIH0pO1xuICAgIF9wYXRjaEVsKCdhdy1waWxsLWNvbnRhaW5lcicsIGVsID0+IHtcbiAgICAgICAgY29uc3Qgc3RhdHVzVGV4dCA9IHN0YXRlLndvcmtSZXN1bHRVbmNlcnRhaW5cbiAgICAgICAgICAgID8gJ0hhc2lsIGtlcmphIGJlbHVtIHBhc3RpJ1xuICAgICAgICAgICAgOiAoc3RhdGUucnVubmluZyA/ICdTZWRhbmcgQmVyamFsYW4nIDogJ0RpamVkYScpO1xuICAgICAgICBlbC50aXRsZSA9IGBBdXRvIFdvcmtlcjogJHtzdGF0dXNUZXh0fVxcbkVuZXJnaTogJHtzdGF0ZS5jdXJyZW50RW5lcmd5fS8ke3N0YXRlLm1heEVuZXJneX1cXG5HaWxpcmFuOiAke2xpdmVDb3VudGRvd259XFxuXFxuKFNlcmV0IHVudHVrIGdlc2VyIOKAoiBLbGlrIDJ4IHVudHVrIHBlcmJlc2FyKWA7XG4gICAgfSk7XG5cbiAgICAvLyBDbG9jayB0aW1lIHRvb2x0aXBzIChIb3ZlciB0byBzZWUgZXhhY3QgdGltZSlcbiAgICBfcGF0Y2hFbCgnYXctbmV4dC13cmFwJywgZWwgPT4ge1xuICAgICAgICBpZiAoaXNSZWFkeVRvV29yaykge1xuICAgICAgICAgICAgZWwudGl0bGUgPSAnRW5lcmdpIHN1ZGFoIG1lbmNhcGFpIHRhcmdldC4gU2lhcCBiZWtlcmphLic7XG4gICAgICAgIH0gZWxzZSBpZiAoc3RhdGUubmV4dFdvcmtUaW1lc3RhbXAgJiYgc3RhdGUubmV4dFdvcmtUaW1lc3RhbXAgPiBEYXRlLm5vdygpKSB7XG4gICAgICAgICAgICBjb25zdCBkID0gbmV3IERhdGUoc3RhdGUubmV4dFdvcmtUaW1lc3RhbXApO1xuICAgICAgICAgICAgY29uc3QgdGltZVN0ciA9IGQudG9Mb2NhbGVUaW1lU3RyaW5nKCdpZC1JRCcsIHsgaG91cjogJzItZGlnaXQnLCBtaW51dGU6ICcyLWRpZ2l0Jywgc2Vjb25kOiAnMi1kaWdpdCcgfSk7XG4gICAgICAgICAgICBlbC50aXRsZSA9IGBFc3RpbWFzaSBnaWxpcmFuIGtlcmphOiBway4gJHt0aW1lU3RyfSBXSUJgO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZWwudGl0bGUgPSAnTWVudW5nZ3UgZW5lcmdpIHB1bGloLi4uJztcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgX3BhdGNoRWwoJ2F3LWZ1bGwtd3JhcCcsIGVsID0+IHtcbiAgICAgICAgY29uc3QgbmVlZGVkID0gKHN0YXRlLm1heEVuZXJneSB8fCAxMTUpIC0gKHN0YXRlLmN1cnJlbnRFbmVyZ3kgfHwgMCk7XG4gICAgICAgIGlmIChuZWVkZWQgPD0gMCkge1xuICAgICAgICAgICAgZWwudGl0bGUgPSAnRW5lcmdpIHN1ZGFoIDEwMCUgcGVudWguJztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IHJhdGUgPSBzdGF0ZS5yZWdlblJhdGUgfHwgMS4wO1xuICAgICAgICAgICAgY29uc3QgZnVsbE1zID0gTWF0aC5yb3VuZCgobmVlZGVkIC8gcmF0ZSkgKiA2MDAwMCk7XG4gICAgICAgICAgICBjb25zdCBkID0gbmV3IERhdGUoRGF0ZS5ub3coKSArIGZ1bGxNcyk7XG4gICAgICAgICAgICBjb25zdCB0aW1lU3RyID0gZC50b0xvY2FsZVRpbWVTdHJpbmcoJ2lkLUlEJywgeyBob3VyOiAnMi1kaWdpdCcsIG1pbnV0ZTogJzItZGlnaXQnIH0pO1xuICAgICAgICAgICAgY29uc3QgZ2FtZVRleHQgPSBnZXRHYW1lRW5lcmd5RnVsbFRleHQoKTtcbiAgICAgICAgICAgIGNvbnN0IGdhbWVOb3RlID0gZ2FtZVRleHQgPyBgIHwgU2VzdWFpIGdhbWU6IFBlbnVoIGRhbGFtICR7Z2FtZVRleHR9YCA6ICcnO1xuICAgICAgICAgICAgZWwudGl0bGUgPSBgRXN0aW1hc2kgZW5lcmdpIDEwMCUgcGVudWg6IHBrLiAke3RpbWVTdHJ9IFdJQiAofiR7TWF0aC5yb3VuZChuZWVkZWQgLyByYXRlKX0gbW50IEAgJHtyYXRlfSBFTi9tbnQpJHtnYW1lTm90ZX1gO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBfcGF0Y2hFbCgnYXctbW9kZS10aXRsZScsIGVsID0+IHtcbiAgICAgICAgZWwudGV4dENvbnRlbnQgPSBzdGF0ZS5ydW5uaW5nID8gJ0F1dG8gS2VyamE6IEFLVElGJyA6ICdBdXRvIEtlcmphOiBESUpFREEnO1xuICAgICAgICBlbC5zdHlsZS5jb2xvciA9IHN0YXRlLnJ1bm5pbmcgPyAnIzAwZmY4OCcgOiAnI2ZmNzc3Nyc7XG4gICAgfSk7XG4gICAgX3BhdGNoRWwoJ2F3LW1vZGUtaWNvbicsIGVsID0+IHtcbiAgICAgICAgZWwuaW5uZXJIVE1MID0gc3RhdGUucnVubmluZyA/IElDT05TLnphcCA6IElDT05TLnBhdXNlO1xuICAgICAgICBlbC5zdHlsZS5jb2xvciA9IHN0YXRlLnJ1bm5pbmcgPyAnIzAwZmY4OCcgOiAnI2ZmNzc3Nyc7XG4gICAgfSk7XG4gICAgX3BhdGNoRWwoJ2F3LXRhcmdldC10aHJlc2hvbGQnLCBlbCA9PiB7XG4gICAgICAgIGVsLnRleHRDb250ZW50ID0gU3RyaW5nKENPTkZJRy5lbmVyZ3lUaHJlc2hvbGQgfHwgMTApO1xuICAgIH0pO1xuICAgIF9wYXRjaEVsKCdhdy1zaGlmdC1jb3VudGRvd24nLCBlbCA9PiB7XG4gICAgICAgIGVsLnRleHRDb250ZW50ID0gaXNSZWFkeVRvV29yayA/ICdTaWFwIEtlcmphJyA6IGxpdmVDb3VudGRvd247XG4gICAgICAgIGVsLnN0eWxlLmNvbG9yID0gaXNSZWFkeVRvV29yayA/ICcjMDBmZjg4JyA6ICcjMDBkOWZmJztcbiAgICB9KTtcbiAgICBfcGF0Y2hFbCgnYXctdG9rZW4tc3RhdHVzJywgIGVsID0+IHtcbiAgICAgICAgY29uc3QgaXNFeHBpcmVkID0gQm9vbGVhbihcbiAgICAgICAgICAgIHN0YXRlLnRva2VuRXhwaXJlZCB8fFxuICAgICAgICAgICAgc3RhdGUucGF1c2VkRm9yVG9rZW4gfHxcbiAgICAgICAgICAgIChzdGF0ZS50b2tlbkV4cGlyeSAmJiBOdW1iZXIoc3RhdGUudG9rZW5FeHBpcnkpIDw9IERhdGUubm93KCkpXG4gICAgICAgICk7XG4gICAgICAgIGlmIChpc0V4cGlyZWQpIHtcbiAgICAgICAgICAgIGVsLnRleHRDb250ZW50ID0gJ0VYUElSRUQnO1xuICAgICAgICAgICAgZWwuc3R5bGUuY29sb3IgPSAnI2ZmNDQ0NCc7XG4gICAgICAgIH0gZWxzZSBpZiAoc3RhdGUuY3VycmVudFRva2VuKSB7XG4gICAgICAgICAgICBlbC50ZXh0Q29udGVudCA9ICdWQUxJRCc7XG4gICAgICAgICAgICBlbC5zdHlsZS5jb2xvciA9ICcjMDBmZjg4JztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGVsLnRleHRDb250ZW50ID0gJ05PVCBGT1VORCc7XG4gICAgICAgICAgICBlbC5zdHlsZS5jb2xvciA9ICcjZmZhYTAwJztcbiAgICAgICAgfVxuICAgIH0pO1xuICAgIF9wYXRjaEVsKCdhdy10b2tlbi1leHBpcnknLCAgZWwgPT4gZWwudGV4dENvbnRlbnQgPSBnZXRUaW1lVW50aWxFeHBpcnkoc3RhdGUpKTtcbiAgICBfcGF0Y2hFbCgnYXctdW5jZXJ0YWluLWJhbm5lcicsIGVsID0+IGVsLnN0eWxlLmRpc3BsYXkgPSBzdGF0ZS53b3JrUmVzdWx0VW5jZXJ0YWluID8gJ2Jsb2NrJyA6ICdub25lJyk7XG4gICAgX3BhdGNoRWwoJ2F3LXJlY29uY2lsaWF0aW9uLXN0YXR1cycsIGVsID0+IHtcbiAgICAgICAgZWwudGV4dENvbnRlbnQgPSBzdGF0ZS51bmNlcnRhaW5SZWNvbmNpbGlhdGlvbiA9PT0gJ2VuZXJneV9jaGFuZ2VkJ1xuICAgICAgICAgICAgPyAnU3RhdHVzIHJla29uc2lsaWFzaTogcGVydWJhaGFuIGVuZXJnaSB0ZXJkZXRla3NpOyBrb25maXJtYXNpIG1hbnVhbCB0ZXRhcCBkaXBlcmx1a2FuLidcbiAgICAgICAgICAgIDogJ1N0YXR1cyByZWtvbnNpbGlhc2k6IG1lbnVuZ2d1IHBlbWJhY2FhbiBlbmVyZ2kuJztcbiAgICB9KTtcblxuICAgIGNvbnN0IGJsb2NrZWQgPSBzdGF0ZS53b3JrUmVzdWx0VW5jZXJ0YWluIHx8IChzdGF0ZS50YWJMb2NrTWFuYWdlZCAmJiAhc3RhdGUuaXNUYWJMb2NrT3duZXIpO1xuICAgIF9wYXRjaEVsKCdhdy13b3JrLW5vdycsIGVsID0+IGVsLmRpc2FibGVkID0gYmxvY2tlZCk7XG4gICAgX3BhdGNoRWwoJ2F3LXRvZ2dsZScsICAgZWwgPT4gZWwuZGlzYWJsZWQgPSBibG9ja2VkKTtcbiAgICBfcGF0Y2hFbCgnYXctcGlsbC10b2dnbGUnLCBlbCA9PiBlbC5kaXNhYmxlZCA9IGJsb2NrZWQpO1xuXG4gICAgaWYgKCFzdGF0ZS50YWJMb2NrTWFuYWdlZCB8fCBzdGF0ZS5pc1RhYkxvY2tPd25lciB8fCAhZG9jdW1lbnQuaGlkZGVuKSB7XG4gICAgICAgIHNhdmVMaXZlU3RhdHVzKHN0YXRlLCBDT05GSUcpO1xuICAgIH1cbn1cblxuLyoqIFVwZGF0ZXMgb25seSB0aGUgcnVubmluZyBpbmRpY2F0b3IgYnV0dG9ucyDigJQgY2FsbGVkIGZyb20gZG9Xb3JrIG9uIHBhdXNlL3Jlc3VtZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXRSdW5uaW5nVUkocnVubmluZykge1xuICAgIF9wYXRjaEVsKCdhdy10b2dnbGUnLCBlbCA9PiB7XG4gICAgICAgIGVsLmlubmVySFRNTCA9IHJ1bm5pbmdcbiAgICAgICAgICAgID8gYDxzcGFuIHN0eWxlPVwiZGlzcGxheTppbmxpbmUtZmxleDthbGlnbi1pdGVtczpjZW50ZXI7anVzdGlmeS1jb250ZW50OmNlbnRlcjtnYXA6NHB4O1wiPiR7SUNPTlMucGF1c2V9IEplZGE8L3NwYW4+YFxuICAgICAgICAgICAgOiBgPHNwYW4gc3R5bGU9XCJkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtqdXN0aWZ5LWNvbnRlbnQ6Y2VudGVyO2dhcDo0cHg7XCI+JHtJQ09OUy5wbGF5fSBMYW5qdXQ8L3NwYW4+YDtcbiAgICAgICAgZWwuc3R5bGUuYmFja2dyb3VuZCA9IHJ1bm5pbmdcbiAgICAgICAgICAgID8gJ2xpbmVhci1ncmFkaWVudCgxMzVkZWcsICNlZjQ0NDQgMCUsICNiOTFjMWMgMTAwJSknXG4gICAgICAgICAgICA6ICdsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjMTBiOTgxIDAlLCAjMDU5NjY5IDEwMCUpJztcbiAgICAgICAgZWwuc3R5bGUuYm94U2hhZG93ID0gYDAgMnB4IDhweCAke3J1bm5pbmcgPyAncmdiYSgyMzksNjgsNjgsMC4zKScgOiAncmdiYSgxNiwxODUsMTI5LDAuMyknfWA7XG4gICAgfSk7XG4gICAgX3BhdGNoRWwoJ2F3LXN0YXR1cy1kb3QnLCBlbCA9PiB7XG4gICAgICAgIGVsLnN0eWxlLmJhY2tncm91bmQgPSBydW5uaW5nID8gJyMwMGZmODgnIDogJyNmZjQ3NTcnO1xuICAgICAgICBlbC5zdHlsZS5ib3hTaGFkb3cgID0gYDAgMCA4cHggJHtydW5uaW5nID8gJyMwMGZmODgnIDogJyNmZjQ3NTcnfWA7XG4gICAgfSk7XG4gICAgX3BhdGNoRWwoJ2F3LXBpbGwtdG9nZ2xlJywgZWwgPT4ge1xuICAgICAgICBlbC5pbm5lckhUTUwgPSBydW5uaW5nID8gSUNPTlMucGF1c2UgOiBJQ09OUy5wbGF5O1xuICAgICAgICBlbC50aXRsZSA9IHJ1bm5pbmcgPyAnSmVkYSBXb3JrZXInIDogJ0xhbmp1dGthbiBXb3JrZXInO1xuICAgICAgICBlbC5zdHlsZS5iYWNrZ3JvdW5kID0gcnVubmluZ1xuICAgICAgICAgICAgPyAnbGluZWFyLWdyYWRpZW50KDEzNWRlZywgI2VmNDQ0NCAwJSwgI2I5MWMxYyAxMDAlKSdcbiAgICAgICAgICAgIDogJ2xpbmVhci1ncmFkaWVudCgxMzVkZWcsICMxMGI5ODEgMCUsICMwNTk2NjkgMTAwJSknO1xuICAgICAgICBlbC5zdHlsZS5ib3hTaGFkb3cgPSBgMCAycHggNnB4ICR7cnVubmluZyA/ICdyZ2JhKDIzOSw2OCw2OCwwLjM1KScgOiAncmdiYSgxNiwxODUsMTI5LDAuMzUpJ31gO1xuICAgIH0pO1xuICAgIF9wYXRjaEVsKCdhdy1waWxsLXN0YXR1cy1kb3QnLCBlbCA9PiB7XG4gICAgICAgIGVsLnN0eWxlLmJhY2tncm91bmQgPSBydW5uaW5nID8gJyMwMGZmODgnIDogJyNmZjQ3NTcnO1xuICAgICAgICBlbC5zdHlsZS5ib3hTaGFkb3cgID0gYDAgMCA4cHggJHtydW5uaW5nID8gJyMwMGZmODgnIDogJyNmZjQ3NTcnfWA7XG4gICAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXRUYWJMb2NrT3duZXIoc3RhdGUsIGlzT3duZXIsIGN0eCkge1xuICAgIHN0YXRlLmlzVGFiTG9ja093bmVyID0gaXNPd25lcjtcbiAgICBpZiAoY3R4Py5DT05GSUcpIHtcbiAgICAgICAgdXBkYXRlUGFuZWxWaXNpYmlsaXR5KHN0YXRlLCBjdHguQ09ORklHKTtcbiAgICB9XG4gICAgY3R4Py51cGRhdGVQYW5lbD8uKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b2dnbGVQYW5lbFZpc2liaWxpdHkoc3RhdGUsIENPTkZJRykge1xuICAgIGNvbnN0IHBhbmVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LXBhbmVsJyk7XG4gICAgaWYgKCFwYW5lbCkgcmV0dXJuO1xuICAgIGNvbnN0IGlzQ3VycmVudGx5VmlzaWJsZSA9IHBhbmVsLnN0eWxlLmRpc3BsYXkgIT09ICdub25lJztcbiAgICBzdGF0ZS5wYW5lbFZpc2libGUgPSAhaXNDdXJyZW50bHlWaXNpYmxlO1xuICAgIHN0YXRlLnVzZXJNYW51YWxseVRvZ2dsZWRQYW5lbCA9IHRydWU7XG4gICAgcGFuZWwuc3R5bGUuZGlzcGxheSA9IHN0YXRlLnBhbmVsVmlzaWJsZSA/ICdibG9jaycgOiAnbm9uZSc7XG4gICAgc2V0VmFsdWUoJ3BhbmVsVmlzaWJsZScsIHN0YXRlLnBhbmVsVmlzaWJsZS50b1N0cmluZygpKTtcbn1cblxuLy8g4pSA4pSA4pSAIFByaXZhdGUg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbmZ1bmN0aW9uIF9wYXRjaEVsKGlkLCBmbikge1xuICAgIGNvbnN0IGVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoaWQpO1xuICAgIGlmIChlbCkgZm4oZWwpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYXBwbHlQYW5lbE1vZGUoc3RhdGUsIGlzTWluKSB7XG4gICAgc3RhdGUucGFuZWxNaW5pbWl6ZWQgPSBCb29sZWFuKGlzTWluKTtcbiAgICBzZXRWYWx1ZSgncGFuZWxNaW5pbWl6ZWQnLCBzdGF0ZS5wYW5lbE1pbmltaXplZC50b1N0cmluZygpKTtcblxuICAgIGNvbnN0IHBhbmVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LXBhbmVsJyk7XG4gICAgY29uc3QgZnVsbENvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1mdWxsLWNvbnRhaW5lcicpO1xuICAgIGNvbnN0IHBpbGxDb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctcGlsbC1jb250YWluZXInKTtcbiAgICBjb25zdCBtaW5pbWl6ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1taW5pbWl6ZScpO1xuXG4gICAgaWYgKCFwYW5lbCkgcmV0dXJuO1xuXG4gICAgaWYgKHN0YXRlLnBhbmVsTWluaW1pemVkKSB7XG4gICAgICAgIGlmIChmdWxsQ29udGFpbmVyKSBmdWxsQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgICAgIGlmIChwaWxsQ29udGFpbmVyKSBwaWxsQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG4gICAgICAgIHBhbmVsLnN0eWxlLndpZHRoID0gJ2F1dG8nO1xuICAgICAgICBwYW5lbC5zdHlsZS5taW5XaWR0aCA9ICcwJztcbiAgICAgICAgcGFuZWwuc3R5bGUubWF4V2lkdGggPSAnbm9uZSc7XG4gICAgICAgIHBhbmVsLnN0eWxlLmJhY2tncm91bmQgPSAndHJhbnNwYXJlbnQnO1xuICAgICAgICBwYW5lbC5zdHlsZS5iYWNrZHJvcEZpbHRlciA9ICdub25lJztcbiAgICAgICAgcGFuZWwuc3R5bGUud2Via2l0QmFja2Ryb3BGaWx0ZXIgPSAnbm9uZSc7XG4gICAgICAgIHBhbmVsLnN0eWxlLmJvcmRlciA9ICdub25lJztcbiAgICAgICAgcGFuZWwuc3R5bGUuYm94U2hhZG93ID0gJ25vbmUnO1xuICAgICAgICBwYW5lbC5zdHlsZS5ib3JkZXJSYWRpdXMgPSAnOTk5cHgnO1xuICAgICAgICBwYW5lbC5zdHlsZS5wYWRkaW5nID0gJzAnO1xuICAgICAgICBwYW5lbC5zdHlsZS5vdmVyZmxvdyA9ICd2aXNpYmxlJztcbiAgICAgICAgaWYgKG1pbmltaXplQnRuKSB7XG4gICAgICAgICAgICBtaW5pbWl6ZUJ0bi5pbm5lckhUTUwgPSBJQ09OUy5leHBhbmQ7XG4gICAgICAgICAgICBtaW5pbWl6ZUJ0bi50aXRsZSA9ICdQZXJiZXNhciBQYW5lbCc7XG4gICAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgICAvLyBQcmV2ZW50IG92ZXJmbG93aW5nIHRoZSByaWdodCB2aWV3cG9ydCBlZGdlIHdoZW4gZXhwYW5kaW5nXG4gICAgICAgIGNvbnN0IG1heFggPSB3aW5kb3cuaW5uZXJXaWR0aCAtIDMwNTtcbiAgICAgICAgaWYgKHN0YXRlLnBhbmVsWCA+IG1heFggJiYgbWF4WCA+IDApIHtcbiAgICAgICAgICAgIHN0YXRlLnBhbmVsWCA9IE1hdGgubWF4KDEwLCBtYXhYKTtcbiAgICAgICAgICAgIHBhbmVsLnN0eWxlLmxlZnQgPSBzdGF0ZS5wYW5lbFggKyAncHgnO1xuICAgICAgICAgICAgc2V0VmFsdWUoJ3BhbmVsWCcsIHN0YXRlLnBhbmVsWC50b1N0cmluZygpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChmdWxsQ29udGFpbmVyKSBmdWxsQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuICAgICAgICBpZiAocGlsbENvbnRhaW5lcikgcGlsbENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICBwYW5lbC5zdHlsZS53aWR0aCA9ICcyODVweCc7XG4gICAgICAgIHBhbmVsLnN0eWxlLm1pbldpZHRoID0gJzI4NXB4JztcbiAgICAgICAgcGFuZWwuc3R5bGUubWF4V2lkdGggPSAnMjk1cHgnO1xuICAgICAgICBwYW5lbC5zdHlsZS5iYWNrZ3JvdW5kID0gJ3JnYmEoMTgsIDIyLCAzNCwgMC45MiknO1xuICAgICAgICBwYW5lbC5zdHlsZS5iYWNrZHJvcEZpbHRlciA9ICdibHVyKDE0cHgpJztcbiAgICAgICAgcGFuZWwuc3R5bGUud2Via2l0QmFja2Ryb3BGaWx0ZXIgPSAnYmx1cigxNHB4KSc7XG4gICAgICAgIHBhbmVsLnN0eWxlLmJvcmRlciA9ICcxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjA4KSc7XG4gICAgICAgIHBhbmVsLnN0eWxlLmJvcmRlclJhZGl1cyA9ICcxMnB4JztcbiAgICAgICAgcGFuZWwuc3R5bGUuYm94U2hhZG93ID0gJzAgMTZweCA0MHB4IHJnYmEoMCwgMCwgMCwgMC41NSksIDAgMCAxcHggcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjE1KSc7XG4gICAgICAgIHBhbmVsLnN0eWxlLnBhZGRpbmcgPSAnMCc7XG4gICAgICAgIHBhbmVsLnN0eWxlLm92ZXJmbG93ID0gJ3Zpc2libGUnO1xuICAgICAgICBpZiAobWluaW1pemVCdG4pIHtcbiAgICAgICAgICAgIG1pbmltaXplQnRuLmlubmVySFRNTCA9IElDT05TLm1pbmltaXplO1xuICAgICAgICAgICAgbWluaW1pemVCdG4udGl0bGUgPSAnTW9kZSBSaW5na2FzIChQaWxsKSc7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIF9idWlsZFBhbmVsSFRNTChzdGF0ZSwgQ09ORklHKSB7XG4gICAgY29uc3QgaXNNaW4gICAgPSBCb29sZWFuKHN0YXRlLnBhbmVsTWluaW1pemVkKTtcbiAgICBjb25zdCBpc1Bpbm5lZCA9IENPTkZJRy5wYW5lbFBpbm5lZDtcbiAgICBjb25zdCBydW5uaW5nICA9IHN0YXRlLnJ1bm5pbmc7XG5cbiAgICByZXR1cm4gYFxuICAgICAgICA8IS0tIEZ1bGwgUGFuZWwgVmlldyAtLT5cbiAgICAgICAgPGRpdiBpZD1cImF3LWZ1bGwtY29udGFpbmVyXCIgc3R5bGU9XCJkaXNwbGF5OiAke2lzTWluID8gJ25vbmUnIDogJ2Jsb2NrJ307IHdpZHRoOiAxMDAlO1wiPlxuICAgICAgICAgICAgPGRpdiBpZD1cImF3LWhlYWRlclwiIHN0eWxlPVwiXG4gICAgICAgICAgICAgICAgYmFja2dyb3VuZDogbGluZWFyLWdyYWRpZW50KDEzNWRlZywgcmdiYSgyNiwgMzIsIDUzLCAwLjk4KSAwJSwgcmdiYSgxOCwgMjIsIDM0LCAwLjk4KSAxMDAlKTtcbiAgICAgICAgICAgICAgICBwYWRkaW5nOiAxMHB4IDEycHg7IGN1cnNvcjogJHtpc1Bpbm5lZCA/ICdkZWZhdWx0JyA6ICdtb3ZlJ307XG4gICAgICAgICAgICAgICAgYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkIHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4wOCk7XG4gICAgICAgICAgICAgICAgZGlzcGxheTogZmxleDsganVzdGlmeS1jb250ZW50OiBzcGFjZS1iZXR3ZWVuOyBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAgICAgICAgICAgIGJvcmRlci1yYWRpdXM6IDEycHggMTJweCAwIDA7XG4gICAgICAgICAgICAgICAgZ2FwOiA4cHg7IGJveC1zaXppbmc6IGJvcmRlci1ib3g7IHdpZHRoOiAxMDAlO1xuICAgICAgICAgICAgXCI+XG4gICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjdweDtmbGV4LXNocmluazowO21pbi13aWR0aDowO1wiPlxuICAgICAgICAgICAgICAgICAgICA8c3BhbiBzdHlsZT1cImNvbG9yOiMzOGJkZjg7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtmbGV4LXNocmluazowO1wiPiR7SUNPTlMucm9ib3R9PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8c3BhbiBzdHlsZT1cImZvbnQtd2VpZ2h0OjcwMDtjb2xvcjojZmZmO2ZvbnQtc2l6ZToxMnB4O2xldHRlci1zcGFjaW5nOjAuNXB4O3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTt3aGl0ZS1zcGFjZTpub3dyYXA7XCI+QXV0byBXb3JrZXI8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIGlkPVwiYXctc3RhdHVzLWRvdFwiIHN0eWxlPVwiXG4gICAgICAgICAgICAgICAgICAgICAgICB3aWR0aDo3cHg7aGVpZ2h0OjdweDtib3JkZXItcmFkaXVzOjUwJTtkaXNwbGF5OmlubGluZS1ibG9jaztmbGV4LXNocmluazowO1xuICAgICAgICAgICAgICAgICAgICAgICAgYmFja2dyb3VuZDoke3J1bm5pbmcgPyAnIzAwZmY4OCcgOiAnI2ZmNDc1Nyd9O1xuICAgICAgICAgICAgICAgICAgICAgICAgYm94LXNoYWRvdzowIDAgOHB4ICR7cnVubmluZyA/ICcjMDBmZjg4JyA6ICcjZmY0NzU3J307XG4gICAgICAgICAgICAgICAgICAgIFwiPjwvc3Bhbj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6MnB4O2ZsZXgtc2hyaW5rOjA7XCI+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJhdy1taW5pbWl6ZVwiICBjbGFzcz1cImF3LWhlYWRlci1idG5cIiB0aXRsZT1cIk1vZGUgUmluZ2thcyAoUGlsbClcIiBzdHlsZT1cIiR7SEVBREVSX0JUTl9TVFlMRX1cIj4ke0lDT05TLm1pbmltaXplfTwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGlkPVwiYXctcGluXCIgICAgICAgY2xhc3M9XCJhdy1oZWFkZXItYnRuXCIgdGl0bGU9XCIke2lzUGlubmVkID8gJ1VucGluJyA6ICdQaW4nfVwiIHN0eWxlPVwiJHtIRUFERVJfQlROX1NUWUxFfSBiYWNrZ3JvdW5kOiR7aXNQaW5uZWQgPyAncmdiYSgwLCAxMzYsIDI1NSwgMC4yKScgOiAndHJhbnNwYXJlbnQnfTtjb2xvcjoke2lzUGlubmVkID8gJyMwMGQ5ZmYnIDogJyM4ODkyYjAnfTtib3JkZXI6JHtpc1Bpbm5lZCA/ICcxcHggc29saWQgcmdiYSgwLCAxMzYsIDI1NSwgMC40KScgOiAnbm9uZSd9O1wiPiR7aXNQaW5uZWQgPyBJQ09OUy5sb2NrQ2xvc2VkIDogSUNPTlMubG9ja09wZW59PC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJhdy1zZXR0aW5nc1wiICBjbGFzcz1cImF3LWhlYWRlci1idG5cIiB0aXRsZT1cIlBlbmdhdHVyYW5cIiBzdHlsZT1cIiR7SEVBREVSX0JUTl9TVFlMRX1cIj4ke0lDT05TLnNldHRpbmdzfTwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGlkPVwiYXctaGlkZVwiICAgICAgY2xhc3M9XCJhdy1oZWFkZXItYnRuXCIgdGl0bGU9XCJTZW1idW55aWthbiAoJHtDT05GSUcuc2hvcnRjdXRzLnNob3dIaWRlLmRpc3BsYXl9KVwiIHN0eWxlPVwiJHtIRUFERVJfQlROX1NUWUxFfWNvbG9yOiNmZjUyNTI7bWFyZ2luLWxlZnQ6MnB4O1wiPiR7SUNPTlMuY2xvc2V9PC9idXR0b24+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgaWQ9XCJhdy1ib2R5XCIgc3R5bGU9XCJwYWRkaW5nOiAxMnB4OyBkaXNwbGF5OiBibG9jaztcIj5cbiAgICAgICAgICAgICAgICA8ZGl2IGlkPVwiYXctdW5jZXJ0YWluLWJhbm5lclwiIHN0eWxlPVwiZGlzcGxheToke3N0YXRlLndvcmtSZXN1bHRVbmNlcnRhaW4gPyAnYmxvY2snIDogJ25vbmUnfTttYXJnaW4tYm90dG9tOjEwcHg7cGFkZGluZzo5cHg7YmFja2dyb3VuZDpyZ2JhKDI1NSw2OCw2OCwwLjEyKTtib3JkZXI6MXB4IHNvbGlkIHJnYmEoMjU1LDY4LDY4LDAuNTUpO2JvcmRlci1yYWRpdXM6NnB4O2NvbG9yOiNmZmIzYjM7Zm9udC1zaXplOjExcHg7bGluZS1oZWlnaHQ6MS40O1wiPlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4O2ZvbnQtd2VpZ2h0OjcwMDtjb2xvcjojZmY3Nzc3O21hcmdpbi1ib3R0b206NHB4O1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO1wiPiR7SUNPTlMuYWxlcnR9PC9zcGFuPiBIYXNpbCBrZXJqYSBiZWx1bSBwYXN0aVxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdj5QZXJpa3NhIGhhbGFtYW4gZ2FtZSBzZWJlbHVtIG1lbGFuanV0a2FuLjwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGlkPVwiYXctcmVjb25jaWxpYXRpb24tc3RhdHVzXCIgc3R5bGU9XCJtYXJnaW4tdG9wOjRweDtjb2xvcjojZmZkMTY2O1wiPlN0YXR1cyByZWtvbnNpbGlhc2k6IG1lbnVuZ2d1IHBlbWJhY2FhbiBlbmVyZ2kuPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJhdy1jb25maXJtLXVuY2VydGFpblwiIHN0eWxlPVwibWFyZ2luLXRvcDo3cHg7cGFkZGluZzo1cHggOHB4O2JhY2tncm91bmQ6IzhmMzAzMDtjb2xvcjojZmZmO2JvcmRlcjoxcHggc29saWQgI2I0NDtib3JkZXItcmFkaXVzOjRweDtjdXJzb3I6cG9pbnRlcjtmb250LXNpemU6MTBweDtcIj5TYXlhIHN1ZGFoIG1lbWVyaWtzYSwgbGFuanV0a2FuPC9idXR0b24+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICAgICAgICA8IS0tIFJlZ2lvbiAmIEJ1ZmYgQmFkZ2UgLS0+XG4gICAgICAgICAgICAgICAgPGRpdiBpZD1cImF3LXJlZ2lvbi1iYWRnZVwiIHN0eWxlPVwiXG4gICAgICAgICAgICAgICAgICAgIGRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjtcbiAgICAgICAgICAgICAgICAgICAgYmFja2dyb3VuZDogbGluZWFyLWdyYWRpZW50KDEzNWRlZywgcmdiYSg1NiwgMTg5LCAyNDgsIDAuMDgpIDAlLCByZ2JhKDE2LCAxODUsIDEyOSwgMC4wNSkgMTAwJSk7XG4gICAgICAgICAgICAgICAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoNTYsIDE4OSwgMjQ4LCAwLjIpO1xuICAgICAgICAgICAgICAgICAgICBib3JkZXItcmFkaXVzOiA4cHg7XG4gICAgICAgICAgICAgICAgICAgIHBhZGRpbmc6IDZweCAxMHB4O1xuICAgICAgICAgICAgICAgICAgICBtYXJnaW4tYm90dG9tOiA5cHg7XG4gICAgICAgICAgICAgICAgICAgIGZvbnQtc2l6ZTogMTFweDtcbiAgICAgICAgICAgICAgICBcIj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjZweDtvdmVyZmxvdzpoaWRkZW47XCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBzdHlsZT1cImNvbG9yOiMzOGJkZjg7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtcIj4ke0lDT05TLm1hcFBpbn08L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBpZD1cImF3LXJlZ2lvbi1uYW1lXCIgc3R5bGU9XCJmb250LXdlaWdodDo2MDA7Y29sb3I6I2YxZjVmOTt3aGl0ZS1zcGFjZTpub3dyYXA7b3ZlcmZsb3c6aGlkZGVuO3RleHQtb3ZlcmZsb3c6ZWxsaXBzaXM7bWF4LXdpZHRoOjEzMHB4O1wiPiR7c3RhdGUucmVnaW9uTmFtZSB8fCAnTWVtdWF0IHdpbGF5YWguLi4nfTwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIGlkPVwiYXctcmVnaW9uLWJ1ZmZcIiBzdHlsZT1cIlxuICAgICAgICAgICAgICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgxNiwgMTg1LCAxMjksIDAuMTQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29sb3I6ICMxMGI5ODE7XG4gICAgICAgICAgICAgICAgICAgICAgICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDE2LCAxODUsIDEyOSwgMC4zKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhZGRpbmc6IDFweCA3cHg7XG4gICAgICAgICAgICAgICAgICAgICAgICBib3JkZXItcmFkaXVzOiA0cHg7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb250LXdlaWdodDogNzAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9udC1zaXplOiA5LjVweDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdoaXRlLXNwYWNlOiBub3dyYXA7XG4gICAgICAgICAgICAgICAgICAgIFwiPiR7c3RhdGUucmVnaW9uSGVhbHRoQm9udXNQZXJjZW50ID8gYCske3N0YXRlLnJlZ2lvbkhlYWx0aEJvbnVzUGVyY2VudH0lIFJlZ2VuYCA6ICdOb3JtYWwgKDEuMHgpJ308L3NwYW4+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICAgICAgICA8IS0tIEVuZXJneSBDYXJkIC0tPlxuICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJiYWNrZ3JvdW5kOnJnYmEoMjU1LDI1NSwyNTUsMC4wMyk7Ym9yZGVyOjFweCBzb2xpZCByZ2JhKDI1NSwyNTUsMjU1LDAuMDcpO3BhZGRpbmc6MTBweCAxMnB4O2JvcmRlci1yYWRpdXM6OXB4O21hcmdpbi1ib3R0b206OXB4O1wiPlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTpmbGV4O2p1c3RpZnktY29udGVudDpzcGFjZS1iZXR3ZWVuO2FsaWduLWl0ZW1zOmNlbnRlcjttYXJnaW4tYm90dG9tOjZweDtmb250LXNpemU6MTFweDtcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NXB4O2NvbG9yOiM5NGEzYjg7Zm9udC1zaXplOjEwcHg7Zm9udC13ZWlnaHQ6NzAwO2xldHRlci1zcGFjaW5nOjAuNXB4O3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBzdHlsZT1cImNvbG9yOiMwMGZmODg7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtcIj4ke0lDT05TLnphcH08L3NwYW4+IEVuZXJnaVxuICAgICAgICAgICAgICAgICAgICAgICAgPC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gaWQ9XCJhdy1lbmVyZ3ktdGV4dFwiIHN0eWxlPVwiY29sb3I6IzAwZmY4ODtmb250LXdlaWdodDo3MDA7bGV0dGVyLXNwYWNpbmc6MC4zcHg7Zm9udC1mYW1pbHk6dWktbW9ub3NwYWNlLE1lbmxvLG1vbm9zcGFjZTtcIj4ke3N0YXRlLmN1cnJlbnRFbmVyZ3l9LyR7c3RhdGUubWF4RW5lcmd5fTwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJiYWNrZ3JvdW5kOnJnYmEoMCwwLDAsMC41KTtoZWlnaHQ6N3B4O2JvcmRlci1yYWRpdXM6OTk5cHg7b3ZlcmZsb3c6aGlkZGVuO2JvcmRlcjoxcHggc29saWQgcmdiYSgyNTUsMjU1LDI1NSwwLjA3KTtwYWRkaW5nOjFweDtcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgaWQ9XCJhdy1lbmVyZ3ktYmFyXCIgc3R5bGU9XCJoZWlnaHQ6MTAwJTt3aWR0aDokeyhzdGF0ZS5jdXJyZW50RW5lcmd5IC8gc3RhdGUubWF4RW5lcmd5KSAqIDEwMH0lO2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDkwZGVnLCAjMzhiZGY4LCAjMTBiOTgxKTtib3JkZXItcmFkaXVzOjk5OXB4O3RyYW5zaXRpb246d2lkdGggMC4zcyBlYXNlO2JveC1zaGFkb3c6MCAwIDhweCByZ2JhKDAsMjU1LDEzNiwwLjM1KTtcIj48L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OmZsZXg7anVzdGlmeS1jb250ZW50OnNwYWNlLWJldHdlZW47Zm9udC1zaXplOjEwcHg7Y29sb3I6IzcxODA5NjttYXJnaW4tdG9wOjZweDtcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGlkPVwiYXctbmV4dC13cmFwXCIgc3R5bGU9XCJjdXJzb3I6aGVscDtcIj5OZXh0OiA8c3BhbiBpZD1cImF3LW5leHQtd29ya1wiIHN0eWxlPVwiY29sb3I6IzAwZmY4ODtmb250LXdlaWdodDo2MDA7XCI+Tm93PC9zcGFuPjwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGlkPVwiYXctZnVsbC13cmFwXCIgc3R5bGU9XCJjdXJzb3I6aGVscDtcIj5GdWxsOiA8c3BhbiBpZD1cImF3LWZ1bGwtZW5lcmd5XCIgc3R5bGU9XCJjb2xvcjojMzhiZGY4O2ZvbnQtd2VpZ2h0OjUwMDtcIj4ke2dldFRpbWVUb0Z1bGxFbmVyZ3koc3RhdGUpfTwvc3Bhbj48L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgICAgICAgPCEtLSBGb2N1c2VkIEF1dG8gV29yayBTdGF0dXMgU2VjdGlvbiAtLT5cbiAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiYmFja2dyb3VuZDpyZ2JhKDI1NSwyNTUsMjU1LDAuMDIpO2JvcmRlcjoxcHggc29saWQgcmdiYSgyNTUsMjU1LDI1NSwwLjA2KTtwYWRkaW5nOjhweCAxMHB4O2JvcmRlci1yYWRpdXM6OHB4O21hcmdpbi1ib3R0b206OXB4O2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7anVzdGlmeS1jb250ZW50OnNwYWNlLWJldHdlZW47Zm9udC1zaXplOjExcHg7XCI+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo3cHg7XCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBpZD1cImF3LW1vZGUtaWNvblwiIHN0eWxlPVwiY29sb3I6JHtydW5uaW5nID8gJyMwMGZmODgnIDogJyNmZjc3NzcnfTtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO1wiPiR7cnVubmluZyA/IElDT05TLnphcCA6IElDT05TLnBhdXNlfTwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBpZD1cImF3LW1vZGUtdGl0bGVcIiBzdHlsZT1cImZvbnQtd2VpZ2h0OjcwMDtjb2xvcjoke3J1bm5pbmcgPyAnIzAwZmY4OCcgOiAnI2ZmNzc3Nyd9O2ZvbnQtc2l6ZToxMXB4O1wiPiR7cnVubmluZyA/ICdBdXRvIEtlcmphOiBBS1RJRicgOiAnQXV0byBLZXJqYTogRElKRURBJ308L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZm9udC1zaXplOjkuNXB4O2NvbG9yOiM3MTgwOTY7XCI+VGFyZ2V0OiDiiaUgPHNwYW4gaWQ9XCJhdy10YXJnZXQtdGhyZXNob2xkXCI+JHtDT05GSUcuZW5lcmd5VGhyZXNob2xkIHx8IDEwfTwvc3Bhbj4gRU48L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cInRleHQtYWxpZ246cmlnaHQ7XCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGlkPVwiYXctc2hpZnQtY291bnRkb3duXCIgc3R5bGU9XCJmb250LXdlaWdodDo3MDA7Y29sb3I6IzM4YmRmODtmb250LXNpemU6MTFweDtcIj4ke2dldExpdmVDb3VudGRvd24oc3RhdGUsIENPTkZJRyl9PC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZm9udC1zaXplOjlweDtjb2xvcjojNzE4MDk2O1wiPkNvdW50ZG93bjwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgICAgIDwhLS0gVG9rZW4gJiBFeHBpcnkgUm93IC0tPlxuICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJmb250LXNpemU6MTAuNXB4O2NvbG9yOiM3MTgwOTY7bWFyZ2luLWJvdHRvbTo5cHg7cGFkZGluZzo2cHggOXB4O2JhY2tncm91bmQ6cmdiYSgyNTUsMjU1LDI1NSwwLjAyKTtib3JkZXI6MXB4IHNvbGlkIHJnYmEoMjU1LDI1NSwyNTUsMC4wNCk7Ym9yZGVyLXJhZGl1czo2cHg7ZGlzcGxheTpmbGV4O2p1c3RpZnktY29udGVudDpzcGFjZS1iZXR3ZWVuO2FsaWduLWl0ZW1zOmNlbnRlcjtcIj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjZweDtcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiY29sb3I6IzM4YmRmODtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO1wiPiR7SUNPTlMuc2hpZWxkfTwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiY29sb3I6I2EwYWVjMDtcIj5TZXNpIEF1dGg6PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gaWQ9XCJhdy10b2tlbi1zdGF0dXNcIiBzdHlsZT1cImZvbnQtd2VpZ2h0OjcwMDtjb2xvcjojMDBmZjg4O1wiPlZBTElEPC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPHNwYW4gaWQ9XCJhdy10b2tlbi1leHBpcnlcIiBzdHlsZT1cImZvbnQtc2l6ZToxMHB4O2NvbG9yOiM3MTgwOTY7XCI+Ti9BPC9zcGFuPlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgICAgICAgPCEtLSBBY3Rpb24gQnV0dG9ucyAtLT5cbiAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczoxZnIgMWZyIDFmcjtnYXA6NnB4O1wiPlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGlkPVwiYXctd29yay1ub3dcIiBjbGFzcz1cImF3LWJ0bi1hY3Rpb25cIiBzdHlsZT1cIlxuICAgICAgICAgICAgICAgICAgICAgICAgYmFja2dyb3VuZDogbGluZWFyLWdyYWRpZW50KDEzNWRlZywgIzAyODRjNyAwJSwgIzAzNjlhMSAxMDAlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbG9yOiAjZmZmOyBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDI1NSwyNTUsMjU1LDAuMTUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcGFkZGluZzogOHB4IDA7IGJvcmRlci1yYWRpdXM6IDdweDsgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9udC13ZWlnaHQ6IDYwMDsgZm9udC1zaXplOiAxMXB4OyBib3gtc2hhZG93OiAwIDJweCA2cHggcmdiYSgyLDEzMiwxOTksMC4yNSk7XG4gICAgICAgICAgICAgICAgICAgIFwiPjxzcGFuIHN0eWxlPVwiZGlzcGxheTppbmxpbmUtZmxleDthbGlnbi1pdGVtczpjZW50ZXI7anVzdGlmeS1jb250ZW50OmNlbnRlcjtnYXA6NHB4O1wiPiR7SUNPTlMuemFwfSBLZXJqYTwvc3Bhbj48L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBpZD1cImF3LXRvZ2dsZVwiIGNsYXNzPVwiYXctYnRuLWFjdGlvblwiIHN0eWxlPVwiXG4gICAgICAgICAgICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiAke3J1bm5pbmcgPyAnbGluZWFyLWdyYWRpZW50KDEzNWRlZywgI2VmNDQ0NCAwJSwgI2I5MWMxYyAxMDAlKScgOiAnbGluZWFyLWdyYWRpZW50KDEzNWRlZywgIzEwYjk4MSAwJSwgIzA1OTY2OSAxMDAlKSd9O1xuICAgICAgICAgICAgICAgICAgICAgICAgY29sb3I6ICNmZmY7IGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMjU1LDI1NSwyNTUsMC4xNSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBwYWRkaW5nOiA4cHggMDsgYm9yZGVyLXJhZGl1czogN3B4OyBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb250LXdlaWdodDogNjAwOyBmb250LXNpemU6IDExcHg7XG4gICAgICAgICAgICAgICAgICAgICAgICBib3gtc2hhZG93OiAwIDJweCA2cHggJHtydW5uaW5nID8gJ3JnYmEoMjM5LDY4LDY4LDAuMjUpJyA6ICdyZ2JhKDE2LDE4NSwxMjksMC4yNSknfTtcbiAgICAgICAgICAgICAgICAgICAgXCI+PHNwYW4gc3R5bGU9XCJkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtqdXN0aWZ5LWNvbnRlbnQ6Y2VudGVyO2dhcDo0cHg7XCI+JHtydW5uaW5nID8gSUNPTlMucGF1c2UgKyAnIEplZGEnIDogSUNPTlMucGxheSArICcgTGFuanV0J308L3NwYW4+PC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJhdy1sb2dzXCIgY2xhc3M9XCJhdy1idG4tYWN0aW9uXCIgc3R5bGU9XCJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsICM0NzU1NjkgMCUsICMzMzQxNTUgMTAwJSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb2xvcjogI2ZmZjsgYm9yZGVyOiAxcHggc29saWQgcmdiYSgyNTUsMjU1LDI1NSwwLjE1KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhZGRpbmc6IDhweCAwOyBib3JkZXItcmFkaXVzOiA3cHg7IGN1cnNvcjogcG9pbnRlcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbnQtd2VpZ2h0OiA2MDA7IGZvbnQtc2l6ZTogMTFweDsgYm94LXNoYWRvdzogMCAycHggNnB4IHJnYmEoNzEsODUsMTA1LDAuMjUpO1xuICAgICAgICAgICAgICAgICAgICBcIj48c3BhbiBzdHlsZT1cImRpc3BsYXk6aW5saW5lLWZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2p1c3RpZnktY29udGVudDpjZW50ZXI7Z2FwOjRweDtcIj4ke0lDT05TLmZpbGVUZXh0fSBMb2c8L3NwYW4+PC9idXR0b24+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgPCEtLSBNaW5pIEZsb2F0aW5nIFBpbGwgQ29udGFpbmVyIChNb2RlIFJpbmdrYXMpIC0tPlxuICAgICAgICA8ZGl2IGlkPVwiYXctcGlsbC1jb250YWluZXJcIiBjbGFzcz1cImF3LXBpbGwtYm94XCIgc3R5bGU9XCJcbiAgICAgICAgICAgIGRpc3BsYXk6ICR7aXNNaW4gPyAnZmxleCcgOiAnbm9uZSd9O1xuICAgICAgICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICAgICAgICAgIGdhcDogN3B4O1xuICAgICAgICAgICAgYmFja2dyb3VuZDogbGluZWFyLWdyYWRpZW50KDEzNWRlZywgcmdiYSgyMCwgMjUsIDQyLCAwLjk1KSAwJSwgcmdiYSgxMywgMTYsIDI2LCAwLjk4KSAxMDAlKTtcbiAgICAgICAgICAgIGJhY2tkcm9wLWZpbHRlcjogYmx1cigxNHB4KTtcbiAgICAgICAgICAgIC13ZWJraXQtYmFja2Ryb3AtZmlsdGVyOiBibHVyKDE0cHgpO1xuICAgICAgICAgICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjEyKTtcbiAgICAgICAgICAgIGJvcmRlci1yYWRpdXM6IDk5OXB4O1xuICAgICAgICAgICAgcGFkZGluZzogNHB4IDhweCA0cHggMTBweDtcbiAgICAgICAgICAgIGJveC1zaGFkb3c6IDAgMTBweCAyOHB4IHJnYmEoMCwgMCwgMCwgMC42NSksIDAgMCAxcHggcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjIpO1xuICAgICAgICAgICAgY3Vyc29yOiAke2lzUGlubmVkID8gJ2RlZmF1bHQnIDogJ21vdmUnfTtcbiAgICAgICAgICAgIHRyYW5zaXRpb246IGJvcmRlci1jb2xvciAwLjJzIGVhc2UsIGJveC1zaGFkb3cgMC4ycyBlYXNlO1xuICAgICAgICAgICAgYm94LXNpemluZzogYm9yZGVyLWJveDtcbiAgICAgICAgICAgIHdoaXRlLXNwYWNlOiBub3dyYXA7XG4gICAgICAgIFwiIHRpdGxlPVwiQXV0byBXb3JrZXIg4oCiIFNlcmV0IHVudHVrIHBpbmRhaCDigKIgS2xpayAyeCB1bnR1ayBwZXJiZXNhclwiPlxuXG4gICAgICAgICAgICA8IS0tIFJvYm90IEljb24gJiBMaXZlIFN0YXR1cyBEb3QgLS0+XG4gICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTogZmxleDsgYWxpZ24taXRlbXM6IGNlbnRlcjsgZ2FwOiA1cHg7IGZsZXgtc2hyaW5rOiAwO1wiPlxuICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiY29sb3I6ICMzOGJkZjg7IGRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7XCI+JHtJQ09OUy5yb2JvdH08L3NwYW4+XG4gICAgICAgICAgICAgICAgPHNwYW4gaWQ9XCJhdy1waWxsLXN0YXR1cy1kb3RcIiBzdHlsZT1cIlxuICAgICAgICAgICAgICAgICAgICB3aWR0aDogN3B4OyBoZWlnaHQ6IDdweDsgYm9yZGVyLXJhZGl1czogNTAlOyBkaXNwbGF5OiBpbmxpbmUtYmxvY2s7IGZsZXgtc2hyaW5rOiAwO1xuICAgICAgICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiAke3J1bm5pbmcgPyAnIzAwZmY4OCcgOiAnI2ZmNDc1Nyd9O1xuICAgICAgICAgICAgICAgICAgICBib3gtc2hhZG93OiAwIDAgOHB4ICR7cnVubmluZyA/ICcjMDBmZjg4JyA6ICcjZmY0NzU3J307XG4gICAgICAgICAgICAgICAgXCI+PC9zcGFuPlxuICAgICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICAgIDwhLS0gRW5lcmd5IEJhZGdlIC0tPlxuICAgICAgICAgICAgPGRpdiBpZD1cImF3LXBpbGwtZW5lcmd5LWJhZGdlXCIgc3R5bGU9XCJcbiAgICAgICAgICAgICAgICBkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBnYXA6IDRweDtcbiAgICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiByZ2JhKDAsIDI1NSwgMTM2LCAwLjA4KTtcbiAgICAgICAgICAgICAgICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDAsIDI1NSwgMTM2LCAwLjIyKTtcbiAgICAgICAgICAgICAgICBib3JkZXItcmFkaXVzOiA2cHg7XG4gICAgICAgICAgICAgICAgcGFkZGluZzogMnB4IDdweDtcbiAgICAgICAgICAgICAgICBmb250LXNpemU6IDExcHg7XG4gICAgICAgICAgICAgICAgZm9udC13ZWlnaHQ6IDcwMDtcbiAgICAgICAgICAgICAgICBjb2xvcjogIzAwZmY4ODtcbiAgICAgICAgICAgICAgICBsZXR0ZXItc3BhY2luZzogMC4ycHg7XG4gICAgICAgICAgICAgICAgZmxleC1zaHJpbms6IDA7XG4gICAgICAgICAgICBcIiB0aXRsZT1cIkVuZXJnaSBTYWF0IEluaVwiPlxuICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiZGlzcGxheTogZmxleDsgYWxpZ24taXRlbXM6IGNlbnRlcjtcIj4ke0lDT05TLnphcH08L3NwYW4+XG4gICAgICAgICAgICAgICAgPHNwYW4gaWQ9XCJhdy1waWxsLWVuZXJneVwiPiR7c3RhdGUuY3VycmVudEVuZXJneSB8fCAwfS8ke3N0YXRlLm1heEVuZXJneSB8fCAxMTB9PC9zcGFuPlxuICAgICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICAgIDwhLS0gTmV4dCBXb3JrIC8gQ291bnRkb3duIEJhZGdlIC0tPlxuICAgICAgICAgICAgPGRpdiBpZD1cImF3LXBpbGwtY291bnRkb3duLWJhZGdlXCIgc3R5bGU9XCJcbiAgICAgICAgICAgICAgICBkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBnYXA6IDRweDtcbiAgICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiByZ2JhKDU2LCAxODksIDI0OCwgMC4wOCk7XG4gICAgICAgICAgICAgICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSg1NiwgMTg5LCAyNDgsIDAuMjIpO1xuICAgICAgICAgICAgICAgIGJvcmRlci1yYWRpdXM6IDZweDtcbiAgICAgICAgICAgICAgICBwYWRkaW5nOiAycHggN3B4O1xuICAgICAgICAgICAgICAgIGZvbnQtc2l6ZTogMTFweDtcbiAgICAgICAgICAgICAgICBmb250LXdlaWdodDogNzAwO1xuICAgICAgICAgICAgICAgIGNvbG9yOiAjMzhiZGY4O1xuICAgICAgICAgICAgICAgIGxldHRlci1zcGFjaW5nOiAwLjJweDtcbiAgICAgICAgICAgICAgICBmbGV4LXNocmluazogMDtcbiAgICAgICAgICAgIFwiIHRpdGxlPVwiQ291bnRkb3duIEdpbGlyYW4gS2VyamFcIj5cbiAgICAgICAgICAgICAgICA8c3BhbiBpZD1cImF3LXBpbGwtY291bnRkb3duLWljb25cIiBzdHlsZT1cImRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7XCI+JHtJQ09OUy5jbG9ja308L3NwYW4+XG4gICAgICAgICAgICAgICAgPHNwYW4gaWQ9XCJhdy1waWxsLWNvdW50ZG93blwiPk1lbXVhdC4uLjwvc3Bhbj5cbiAgICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgICA8IS0tIFN1YnRsZSBEaXZpZGVyIC0tPlxuICAgICAgICAgICAgPGRpdiBzdHlsZT1cIndpZHRoOiAxcHg7IGhlaWdodDogMTZweDsgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjEyKTsgZmxleC1zaHJpbms6IDA7IG1hcmdpbjogMCAxcHg7XCI+PC9kaXY+XG5cbiAgICAgICAgICAgIDwhLS0gTWluaSBRdWljayBBY3Rpb25zIC0tPlxuICAgICAgICAgICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGdhcDogNHB4OyBmbGV4LXNocmluazogMDtcIj5cbiAgICAgICAgICAgICAgICA8YnV0dG9uIGlkPVwiYXctcGlsbC10b2dnbGVcIiBjbGFzcz1cImF3LXBpbGwtYnRuXCIgc3R5bGU9XCJcbiAgICAgICAgICAgICAgICAgICAgd2lkdGg6IDIycHg7IGhlaWdodDogMjJweDsgYm9yZGVyLXJhZGl1czogNTAlOyBib3JkZXI6IG5vbmU7XG4gICAgICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6ICR7cnVubmluZyA/ICdsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjZWY0NDQ0IDAlLCAjYjkxYzFjIDEwMCUpJyA6ICdsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjMTBiOTgxIDAlLCAjMDU5NjY5IDEwMCUpJ307XG4gICAgICAgICAgICAgICAgICAgIGNvbG9yOiAjZmZmOyBmb250LXNpemU6IDkuNXB4OyBmb250LXdlaWdodDogNzAwO1xuICAgICAgICAgICAgICAgICAgICBib3gtc2hhZG93OiAwIDJweCA2cHggJHtydW5uaW5nID8gJ3JnYmEoMjM5LDY4LDY4LDAuMzUpJyA6ICdyZ2JhKDE2LDE4NSwxMjksMC4zNSknfTtcbiAgICAgICAgICAgICAgICBcIiB0aXRsZT1cIiR7cnVubmluZyA/ICdKZWRhIFdvcmtlcicgOiAnTGFuanV0a2FuIFdvcmtlcid9XCI+JHtydW5uaW5nID8gSUNPTlMucGF1c2UgOiBJQ09OUy5wbGF5fTwvYnV0dG9uPlxuXG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBpZD1cImF3LXBpbGwtZXhwYW5kXCIgY2xhc3M9XCJhdy1waWxsLWJ0blwiIHN0eWxlPVwiXG4gICAgICAgICAgICAgICAgICAgIHdpZHRoOiAyMnB4OyBoZWlnaHQ6IDIycHg7IGJvcmRlci1yYWRpdXM6IDUwJTtcbiAgICAgICAgICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjA4KTtcbiAgICAgICAgICAgICAgICAgICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjE1KTtcbiAgICAgICAgICAgICAgICAgICAgY29sb3I6ICNjYmQ1ZTE7XG4gICAgICAgICAgICAgICAgXCIgdGl0bGU9XCJQZXJiZXNhciBrZSBQYW5lbCBQZW51aFwiPiR7SUNPTlMuZXhwYW5kfTwvYnV0dG9uPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgIDwvZGl2PlxuICAgIGA7XG59XG5cbmZ1bmN0aW9uIF9zZXR1cERyYWdBbmREcm9wKHBhbmVsLCBzdGF0ZSwgQ09ORklHKSB7XG4gICAgbGV0IGRyYWdnaW5nID0gZmFsc2UsIHN0YXJ0WCA9IDAsIHN0YXJ0WSA9IDAsIG9yaWdYID0gMCwgb3JpZ1kgPSAwO1xuXG4gICAgY29uc3Qgb25Nb3VzZURvd24gPSBlID0+IHtcbiAgICAgICAgaWYgKENPTkZJRy5wYW5lbFBpbm5lZCkgcmV0dXJuO1xuICAgICAgICBpZiAoZS50YXJnZXQuY2xvc2VzdCgnYnV0dG9uJykpIHJldHVybjtcbiAgICAgICAgZHJhZ2dpbmcgPSB0cnVlO1xuICAgICAgICBzdGFydFggPSBlLmNsaWVudFg7IHN0YXJ0WSA9IGUuY2xpZW50WTtcbiAgICAgICAgb3JpZ1ggID0gc3RhdGUucGFuZWxYOyBvcmlnWSAgPSBzdGF0ZS5wYW5lbFk7XG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICB9O1xuXG4gICAgY29uc3QgaGVhZGVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LWhlYWRlcicpO1xuICAgIGNvbnN0IHBpbGwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctcGlsbC1jb250YWluZXInKTtcblxuICAgIGlmIChoZWFkZXIpIGhlYWRlci5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCBvbk1vdXNlRG93bik7XG4gICAgaWYgKHBpbGwpIHBpbGwuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgb25Nb3VzZURvd24pO1xuXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgZSA9PiB7XG4gICAgICAgIGlmICghZHJhZ2dpbmcpIHJldHVybjtcbiAgICAgICAgc3RhdGUucGFuZWxYID0gTWF0aC5tYXgoMCwgb3JpZ1ggKyBlLmNsaWVudFggLSBzdGFydFgpO1xuICAgICAgICBzdGF0ZS5wYW5lbFkgPSBNYXRoLm1heCgwLCBvcmlnWSArIGUuY2xpZW50WSAtIHN0YXJ0WSk7XG4gICAgICAgIHBhbmVsLnN0eWxlLmxlZnQgPSBzdGF0ZS5wYW5lbFggKyAncHgnO1xuICAgICAgICBwYW5lbC5zdHlsZS50b3AgID0gc3RhdGUucGFuZWxZICsgJ3B4JztcbiAgICB9KTtcblxuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNldXAnLCAoKSA9PiB7XG4gICAgICAgIGlmICghZHJhZ2dpbmcpIHJldHVybjtcbiAgICAgICAgZHJhZ2dpbmcgPSBmYWxzZTtcbiAgICAgICAgc2V0VmFsdWUoJ3BhbmVsWCcsIHN0YXRlLnBhbmVsWC50b1N0cmluZygpKTtcbiAgICAgICAgc2V0VmFsdWUoJ3BhbmVsWScsIHN0YXRlLnBhbmVsWS50b1N0cmluZygpKTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gX3NldHVwUGFuZWxDb250cm9scyhwYW5lbCwgc3RhdGUsIENPTkZJRywgY3R4KSB7XG4gICAgY29uc3QgeyBvcGVuU2V0dGluZ3MsIG9wZW5Mb2dWaWV3ZXIsIGRvV29yayB9ID0gY3R4O1xuXG4gICAgY29uc3QgbWluaW1pemVCdG4gICA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1taW5pbWl6ZScpO1xuICAgIGNvbnN0IHBpbkJ0biAgICAgICAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctcGluJyk7XG4gICAgY29uc3QgaGlkZUJ0biAgICAgICA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1oaWRlJyk7XG4gICAgY29uc3QgdG9nZ2xlQnRuICAgICA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy10b2dnbGUnKTtcbiAgICBjb25zdCB3b3JrTm93QnRuICAgID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LXdvcmstbm93Jyk7XG4gICAgY29uc3QgbG9nc0J0biAgICAgICA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1sb2dzJyk7XG4gICAgY29uc3Qgc2V0dGluZ3NCdG4gICA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1zZXR0aW5ncycpO1xuICAgIGNvbnN0IGNvbmZpcm1CdG4gICAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctY29uZmlybS11bmNlcnRhaW4nKTtcbiAgICBjb25zdCBwaWxsRXhwYW5kQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LXBpbGwtZXhwYW5kJyk7XG4gICAgY29uc3QgcGlsbFRvZ2dsZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1waWxsLXRvZ2dsZScpO1xuICAgIGNvbnN0IGhlYWRlciAgICAgICAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctaGVhZGVyJyk7XG4gICAgY29uc3QgcGlsbCAgICAgICAgICA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1waWxsLWNvbnRhaW5lcicpO1xuXG4gICAgLy8gSG92ZXIgZWZmZWN0cyBvbiBoZWFkZXIgYnV0dG9uc1xuICAgIHBhbmVsLnF1ZXJ5U2VsZWN0b3JBbGwoJy5hdy1oZWFkZXItYnRuJykuZm9yRWFjaChidG4gPT4ge1xuICAgICAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcignbW91c2VlbnRlcicsICgpID0+IHtcbiAgICAgICAgICAgIGJ0bi5zdHlsZS5iYWNrZ3JvdW5kID0gJ3JnYmEoMjU1LDI1NSwyNTUsMC4xMiknO1xuICAgICAgICAgICAgYnRuLnN0eWxlLmNvbG9yID0gJyNmZmYnO1xuICAgICAgICB9KTtcbiAgICAgICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbGVhdmUnLCAoKSA9PiB7XG4gICAgICAgICAgICBpZiAoYnRuLmlkID09PSAnYXctcGluJyAmJiBDT05GSUcucGFuZWxQaW5uZWQpIHtcbiAgICAgICAgICAgICAgICBidG4uc3R5bGUuYmFja2dyb3VuZCA9ICdyZ2JhKDAsIDEzNiwgMjU1LCAwLjIpJztcbiAgICAgICAgICAgICAgICBidG4uc3R5bGUuY29sb3IgPSAnIzAwZDlmZic7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGJ0bi5pZCA9PT0gJ2F3LWhpZGUnKSB7XG4gICAgICAgICAgICAgICAgYnRuLnN0eWxlLmJhY2tncm91bmQgPSAndHJhbnNwYXJlbnQnO1xuICAgICAgICAgICAgICAgIGJ0bi5zdHlsZS5jb2xvciA9ICcjZmY1MjUyJztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgYnRuLnN0eWxlLmJhY2tncm91bmQgPSAndHJhbnNwYXJlbnQnO1xuICAgICAgICAgICAgICAgIGJ0bi5zdHlsZS5jb2xvciA9ICcjODg5MmIwJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICAvLyBNaW5pbWl6ZSAmIEV4cGFuZCBoYW5kbGVyc1xuICAgIG1pbmltaXplQnRuPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgYXBwbHlQYW5lbE1vZGUoc3RhdGUsICFzdGF0ZS5wYW5lbE1pbmltaXplZCk7XG4gICAgICAgIGN0eC51cGRhdGVQYW5lbD8uKCk7XG4gICAgfSk7XG5cbiAgICBwaWxsRXhwYW5kQnRuPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgYXBwbHlQYW5lbE1vZGUoc3RhdGUsIGZhbHNlKTtcbiAgICAgICAgY3R4LnVwZGF0ZVBhbmVsPy4oKTtcbiAgICB9KTtcblxuICAgIC8vIERvdWJsZS1jbGljayB0byB0b2dnbGUgbW9kZTogZGJsY2xpY2sgb24gaGVhZGVyIG1pbmltaXplcywgZGJsY2xpY2sgb24gcGlsbCBleHBhbmRzXG4gICAgaGVhZGVyPy5hZGRFdmVudExpc3RlbmVyKCdkYmxjbGljaycsIGUgPT4ge1xuICAgICAgICBpZiAoZS50YXJnZXQuY2xvc2VzdCgnYnV0dG9uJykpIHJldHVybjtcbiAgICAgICAgYXBwbHlQYW5lbE1vZGUoc3RhdGUsIHRydWUpO1xuICAgICAgICBjdHgudXBkYXRlUGFuZWw/LigpO1xuICAgIH0pO1xuXG4gICAgcGlsbD8uYWRkRXZlbnRMaXN0ZW5lcignZGJsY2xpY2snLCBlID0+IHtcbiAgICAgICAgaWYgKGUudGFyZ2V0LmNsb3Nlc3QoJ2J1dHRvbicpKSByZXR1cm47XG4gICAgICAgIGFwcGx5UGFuZWxNb2RlKHN0YXRlLCBmYWxzZSk7XG4gICAgICAgIGN0eC51cGRhdGVQYW5lbD8uKCk7XG4gICAgfSk7XG5cbiAgICBwaW5CdG4/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICBDT05GSUcucGFuZWxQaW5uZWQgPSAhQ09ORklHLnBhbmVsUGlubmVkO1xuICAgICAgICBjdHguc2F2ZUNvbmZpZz8uKENPTkZJRyk7XG4gICAgICAgIGNvbnN0IGhkciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1oZWFkZXInKTtcbiAgICAgICAgY29uc3QgcGlsbEVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LXBpbGwtY29udGFpbmVyJyk7XG4gICAgICAgIGlmIChoZHIpIGhkci5zdHlsZS5jdXJzb3IgPSBDT05GSUcucGFuZWxQaW5uZWQgPyAnZGVmYXVsdCcgOiAnbW92ZSc7XG4gICAgICAgIGlmIChwaWxsRWwpIHBpbGxFbC5zdHlsZS5jdXJzb3IgPSBDT05GSUcucGFuZWxQaW5uZWQgPyAnZGVmYXVsdCcgOiAnbW92ZSc7XG4gICAgICAgIGlmIChwaW5CdG4pIHtcbiAgICAgICAgICAgIHBpbkJ0bi5zdHlsZS5iYWNrZ3JvdW5kID0gQ09ORklHLnBhbmVsUGlubmVkID8gJ3JnYmEoMCwgMTM2LCAyNTUsIDAuMiknIDogJ3RyYW5zcGFyZW50JztcbiAgICAgICAgICAgIHBpbkJ0bi5zdHlsZS5jb2xvciA9IENPTkZJRy5wYW5lbFBpbm5lZCA/ICcjMDBkOWZmJyA6ICcjODg5MmIwJztcbiAgICAgICAgICAgIHBpbkJ0bi5zdHlsZS5ib3JkZXIgPSBDT05GSUcucGFuZWxQaW5uZWQgPyAnMXB4IHNvbGlkIHJnYmEoMCwgMTM2LCAyNTUsIDAuNCknIDogJ25vbmUnO1xuICAgICAgICAgICAgcGluQnRuLnRpdGxlID0gQ09ORklHLnBhbmVsUGlubmVkID8gJ1VucGluJyA6ICdQaW4nO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBmdW5jdGlvbiB0b2dnbGVSdW5uaW5nU3RhdGUoKSB7XG4gICAgICAgIHN0YXRlLnJ1bm5pbmcgPSAhc3RhdGUucnVubmluZztcbiAgICAgICAgc2V0UnVubmluZ1VJKHN0YXRlLnJ1bm5pbmcpO1xuICAgICAgICBjdHgubG9nKHN0YXRlLnJ1bm5pbmcgPyAnU2NyaXB0IGRpbGFuanV0a2FuJyA6ICdTY3JpcHQgZGktcGF1c2UnLCAnaW5mbycpO1xuICAgICAgICBpZiAoc3RhdGUucnVubmluZykgY3R4Lndha2VQZW5kaW5nV29yaz8uKCk7XG4gICAgICAgIHNhdmVTdGF0ZShzdGF0ZSk7XG4gICAgICAgIGNvbnN0IHN1bW1hcnkgPSBzYXZlTGl2ZVN0YXR1cyhzdGF0ZSwgQ09ORklHLCB0cnVlKTtcbiAgICAgICAgY3R4LnVwZGF0ZVBhbmVsPy4oKTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKGNocm9tZT8ucnVudGltZT8uaWQpIHtcbiAgICAgICAgICAgICAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBhd19saXZlX3N0YXR1czogc3VtbWFyeSB9KTtcbiAgICAgICAgICAgICAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgICAgICAgICAgICAgIHR5cGU6ICdQT1BVUF9UT19UQUInLFxuICAgICAgICAgICAgICAgICAgICBhY3Rpb246ICd0b2dnbGVSdW5uaW5nJyxcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHN0YXRlLnJ1bm5pbmdcbiAgICAgICAgICAgICAgICB9KS5jYXRjaCgoKSA9PiB7fSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggeyAvKiBjb250ZXh0IGludmFsaWRhdGVkICovIH1cbiAgICB9XG5cbiAgICAvLyBRdWljayBwYXVzZS9yZXN1bWUgZnJvbSBwaWxsXG4gICAgcGlsbFRvZ2dsZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0b2dnbGVSdW5uaW5nU3RhdGUpO1xuXG4gICAgc2V0dGluZ3NCdG4/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gY3R4Lm9wZW5TZXR0aW5ncz8uKCkpO1xuICAgIGhpZGVCdG4/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gdG9nZ2xlUGFuZWxWaXNpYmlsaXR5KHN0YXRlLCBDT05GSUcpKTtcblxuICAgIHRvZ2dsZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0b2dnbGVSdW5uaW5nU3RhdGUpO1xuXG4gICAgd29ya05vd0J0bj8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7IGN0eC5sb2coJ01hbnVhbCB3b3JrIHRyaWdnZXJlZCEnLCAnaW5mbycpOyBjdHguZG9Xb3JrPy4odHJ1ZSk7IH0pO1xuICAgIGxvZ3NCdG4/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gY3R4Lm9wZW5Mb2dWaWV3ZXI/LigpKTtcblxuICAgIGNvbmZpcm1CdG4/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICBpZiAoIXN0YXRlLndvcmtSZXN1bHRVbmNlcnRhaW4gfHwgIXN0YXRlLmlzVGFiTG9ja093bmVyKSByZXR1cm47XG4gICAgICAgIGlmICghY29uZmlybSgnUGFzdGlrYW4gc3VkYWggbWVtZXJpa3NhIGhhbGFtYW4gZ2FtZS4gTGFuanV0a2FuIHdvcmtlcj8nKSkgcmV0dXJuO1xuICAgICAgICBzdGF0ZS53b3JrUmVzdWx0VW5jZXJ0YWluID0gZmFsc2U7XG4gICAgICAgIHN0YXRlLnVuY2VydGFpblJlY29uY2lsaWF0aW9uID0gJ25vbmUnO1xuICAgICAgICBjdHgudW5jZXJ0YWluRW5lcmd5QmVmb3JlID0gbnVsbDtcbiAgICAgICAgc2V0VmFsdWUoJ2F3X3dvcmtSZXN1bHRVbmNlcnRhaW4nLCAnZmFsc2UnKTtcbiAgICAgICAgc2V0VmFsdWUoJ2F3X3VuY2VydGFpbkVuZXJneUJlZm9yZScsICcnKTtcbiAgICAgICAgc3RhdGUuZW5lcmd5U3luY0Jhc2UgPSBudWxsO1xuICAgICAgICBjb25zdCBlID0gZ2V0Q3VycmVudEVuZXJneSgpO1xuICAgICAgICBpZiAoZSkgeyBzdGF0ZS5jdXJyZW50RW5lcmd5ID0gZS5jdXJyZW50OyBzdGF0ZS5tYXhFbmVyZ3kgPSBlLm1heDsgfVxuICAgICAgICBzdGF0ZS5ydW5uaW5nID0gdHJ1ZTtcbiAgICAgICAgY3R4LmxvZygnV29ya2VyIGRpbGFuanV0a2FuIHNldGVsYWggaGFzaWwgdGltZW91dCBkaXBlcmlrc2EgbWFudWFsLicsICd3YXJuJyk7XG4gICAgICAgIGN0eC51cGRhdGVQYW5lbD8uKCk7XG4gICAgICAgIGN0eC53YWtlUGVuZGluZ1dvcms/LigpO1xuICAgIH0pO1xuXG4gICAgLy8gS2V5Ym9hcmQgc2hvcnRjdXRzXG4gICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHBhbmVsLl9rZXlIYW5kbGVyLCB0cnVlKTtcbiAgICBwYW5lbC5fa2V5SGFuZGxlciA9IF9tYWtlS2V5SGFuZGxlcihzdGF0ZSwgQ09ORklHLCBjdHgsIHRvZ2dsZVJ1bm5pbmdTdGF0ZSk7XG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHBhbmVsLl9rZXlIYW5kbGVyLCB0cnVlKTtcbn1cblxuZnVuY3Rpb24gX21ha2VLZXlIYW5kbGVyKHN0YXRlLCBDT05GSUcsIGN0eCwgdG9nZ2xlUnVubmluZ1N0YXRlKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uIGhhbmRsZUdsb2JhbEtleWRvd24oZSkge1xuICAgICAgICBpZiAoc3RhdGUuc2V0dGluZ3NPcGVuKSByZXR1cm47XG4gICAgICAgIGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0O1xuICAgICAgICBpZiAodGFyZ2V0Py5pc0NvbnRlbnRFZGl0YWJsZSB8fCAvXihJTlBVVHxURVhUQVJFQXxTRUxFQ1QpJC8udGVzdCh0YXJnZXQ/LnRhZ05hbWUpKSByZXR1cm47XG5cbiAgICAgICAgZm9yIChjb25zdCBbYWN0aW9uLCBzaG9ydGN1dF0gb2YgT2JqZWN0LmVudHJpZXMoQ09ORklHLnNob3J0Y3V0cykpIHtcbiAgICAgICAgICAgIGlmICghc2hvcnRjdXQ/LmtleXMgfHwgc2hvcnRjdXQua2V5cy5sZW5ndGggPT09IDApIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICBjb25zdCByZXFDdHJsICA9IHNob3J0Y3V0LmtleXMuaW5jbHVkZXMoJ0NvbnRyb2wnKTtcbiAgICAgICAgICAgIGNvbnN0IHJlcVNoaWZ0ID0gc2hvcnRjdXQua2V5cy5pbmNsdWRlcygnU2hpZnQnKTtcbiAgICAgICAgICAgIGNvbnN0IHJlcUFsdCAgID0gc2hvcnRjdXQua2V5cy5pbmNsdWRlcygnQWx0Jyk7XG5cbiAgICAgICAgICAgIC8vIEV4YWN0IG1vZGlmaWVyIG1hdGNoaW5nIOKAlCBwcmV2ZW50cyBmYWxzZSB0cmlnZ2VycyB3aGVuIGV4dHJhIG1vZGlmaWVycyBhcmUgaGVsZFxuICAgICAgICAgICAgaWYgKEJvb2xlYW4oZS5jdHJsS2V5KSAhPT0gcmVxQ3RybCkgY29udGludWU7XG4gICAgICAgICAgICBpZiAoQm9vbGVhbihlLnNoaWZ0S2V5KSAhPT0gcmVxU2hpZnQpIGNvbnRpbnVlO1xuICAgICAgICAgICAgaWYgKEJvb2xlYW4oZS5hbHRLZXkpICE9PSByZXFBbHQpIGNvbnRpbnVlO1xuICAgICAgICAgICAgaWYgKGUubWV0YUtleSkgY29udGludWU7IC8vIE5ldmVyIGhpamFjayBPUy9NZXRhIGtleXNcblxuICAgICAgICAgICAgY29uc3Qgbm9uTW9kaWZpZXJLZXlzID0gc2hvcnRjdXQua2V5cy5maWx0ZXIoayA9PiBrICE9PSAnQ29udHJvbCcgJiYgayAhPT0gJ1NoaWZ0JyAmJiBrICE9PSAnQWx0Jyk7XG4gICAgICAgICAgICBpZiAobm9uTW9kaWZpZXJLZXlzLmxlbmd0aCA+IDAgJiYgIW5vbk1vZGlmaWVyS2V5cy5pbmNsdWRlcyhlLmNvZGUpKSBjb250aW51ZTtcblxuICAgICAgICAgICAgaWYgKGFjdGlvbiA9PT0gJ3BhdXNlUmVzdW1lJyAmJiBzdGF0ZS50YWJMb2NrTWFuYWdlZCAmJiAhc3RhdGUuaXNUYWJMb2NrT3duZXIpIHJldHVybjtcbiAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTsgZS5zdG9wUHJvcGFnYXRpb24oKTtcblxuICAgICAgICAgICAgaWYgKGFjdGlvbiA9PT0gJ3Nob3dIaWRlJykgICAgICAgICB0b2dnbGVQYW5lbFZpc2liaWxpdHkoc3RhdGUsIENPTkZJRyk7XG4gICAgICAgICAgICBlbHNlIGlmIChhY3Rpb24gPT09ICd3b3JrTm93JykgICAgIHsgY3R4LmxvZygnTWFudWFsIHdvcmshJywgJ2luZm8nKTsgY3R4LmRvV29yaz8uKHRydWUpOyB9XG4gICAgICAgICAgICBlbHNlIGlmIChhY3Rpb24gPT09ICdwYXVzZVJlc3VtZScpIHRvZ2dsZVJ1bm5pbmdTdGF0ZSgpO1xuICAgICAgICAgICAgZWxzZSBpZiAoYWN0aW9uID09PSAnb3BlbkxvZycpICAgICBjdHgub3BlbkxvZ1ZpZXdlcj8uKCk7XG4gICAgICAgICAgICBlbHNlIGlmIChhY3Rpb24gPT09ICdvcGVuU2V0dGluZ3MnKSBjdHgub3BlblNldHRpbmdzPy4oKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgIH07XG59XG5cbmZ1bmN0aW9uIF9zZXR1cFJlc3BvbnNpdmVCZWhhdmlvcihwYW5lbCwgc3RhdGUsIENPTkZJRykge1xuICAgIGlmICghQ09ORklHLnBhbmVsRm9sbG93Vmlld3BvcnQpIHJldHVybjtcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgKCkgPT4ge1xuICAgICAgICBjb25zdCBtYXhYID0gd2luZG93LmlubmVyV2lkdGggIC0gcGFuZWwub2Zmc2V0V2lkdGggIC0gMTA7XG4gICAgICAgIGNvbnN0IG1heFkgPSB3aW5kb3cuaW5uZXJIZWlnaHQgLSBwYW5lbC5vZmZzZXRIZWlnaHQgLSAxMDtcbiAgICAgICAgaWYgKHN0YXRlLnBhbmVsWCA+IG1heFggfHwgc3RhdGUucGFuZWxZID4gbWF4WSkge1xuICAgICAgICAgICAgaWYgKENPTkZJRy5wYW5lbFJldHVyblRvT3JpZ2luYWwpIHtcbiAgICAgICAgICAgICAgICBzdGF0ZS5wYW5lbFggPSBzdGF0ZS5vcmlnaW5hbFBhbmVsWDtcbiAgICAgICAgICAgICAgICBzdGF0ZS5wYW5lbFkgPSBzdGF0ZS5vcmlnaW5hbFBhbmVsWTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgc3RhdGUucGFuZWxYID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oc3RhdGUucGFuZWxYLCBtYXhYKSk7XG4gICAgICAgICAgICAgICAgc3RhdGUucGFuZWxZID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oc3RhdGUucGFuZWxZLCBtYXhZKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBwYW5lbC5zdHlsZS5sZWZ0ID0gc3RhdGUucGFuZWxYICsgJ3B4JztcbiAgICAgICAgICAgIHBhbmVsLnN0eWxlLnRvcCAgPSBzdGF0ZS5wYW5lbFkgKyAncHgnO1xuICAgICAgICB9XG4gICAgfSk7XG59XG4iLCIvKipcbiAqIHVpL3NldHRpbmdzLmpzIOKAlCBTZXR0aW5ncyBtb2RhbFxuICogTW9kZXJuaXplZCB3aXRoIGNhdGVnb3JpemVkIHRhYnMsIGlPUy1zdHlsZSBhbmltYXRlZCBzd2l0Y2hlcyxcbiAqIHByZXNldCBjaGlwcywgYW5kIGRhcmsgZ2xhc3Ntb3JwaGljIHN0eWxpbmcuXG4gKiBHTV9zZXRWYWx1ZSDihpIgc2V0VmFsdWUsIHNlbmROb3RpZmljYXRpb24vbG9nIOKGkiBjdHgsIHNhdmVDb25maWcgZnJvbSBjb25maWcuanMuXG4gKi9cblxuaW1wb3J0IHsgZ2V0VmFsdWUsIHNldFZhbHVlIH0gZnJvbSAnLi4vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBub3JtYWxpemVDb25maWcsIHNhdmVDb25maWcgfSBmcm9tICcuLi9jb25maWcuanMnO1xuaW1wb3J0IHsgZ2V0U2F2ZWRDcmVkZW50aWFscywgc2F2ZUNyZWRlbnRpYWxzLCBjbGVhckNyZWRlbnRpYWxzIH0gZnJvbSAnLi4vYXV0b2xvZ2luLmpzJztcbmltcG9ydCB7IElDT05TIH0gZnJvbSAnLi9pY29ucy5qcyc7XG5cbi8vIEluamVjdCBtb2Rlcm4gc2V0dGluZ3Mgc3R5bGVzaGVldCBvbmNlXG5mdW5jdGlvbiBlbnN1cmVTZXR0aW5nc1N0eWxlcygpIHtcbiAgICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LXNldHRpbmdzLXN0eWxlcycpKSByZXR1cm47XG4gICAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuICAgIHN0eWxlLmlkID0gJ2F3LXNldHRpbmdzLXN0eWxlcyc7XG4gICAgc3R5bGUudGV4dENvbnRlbnQgPSBgXG4gICAgICAgIC8qIE1vZGFsICYgQ29udGFpbmVyICovXG4gICAgICAgICNhdy1zZXR0aW5ncy1tb2RhbCB7XG4gICAgICAgICAgICBmb250LWZhbWlseTogLWFwcGxlLXN5c3RlbSwgQmxpbmtNYWNTeXN0ZW1Gb250LCBcIlNlZ29lIFVJXCIsIFJvYm90bywgXCJIZWx2ZXRpY2EgTmV1ZVwiLCBBcmlhbCwgc2Fucy1zZXJpZjtcbiAgICAgICAgICAgIGNvbG9yOiAjZTJlOGYwO1xuICAgICAgICB9XG5cbiAgICAgICAgLyogTW9kZXJuIFRhYnMgTmF2aWdhdGlvbiAqL1xuICAgICAgICAuYXctdGFiLW5hdiB7XG4gICAgICAgICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgICAgICAgZ2FwOiA1cHg7XG4gICAgICAgICAgICBwYWRkaW5nOiA4cHggMTRweDtcbiAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMTIsIDE2LCAyNiwgMC43KTtcbiAgICAgICAgICAgIGJvcmRlci1ib3R0b206IDFweCBzb2xpZCByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMDgpO1xuICAgICAgICAgICAgb3ZlcmZsb3cteDogYXV0bztcbiAgICAgICAgICAgIHNjcm9sbGJhci13aWR0aDogbm9uZTtcbiAgICAgICAgICAgIHNjcm9sbC1iZWhhdmlvcjogc21vb3RoO1xuICAgICAgICB9XG4gICAgICAgIC5hdy10YWItbmF2Ojotd2Via2l0LXNjcm9sbGJhciB7XG4gICAgICAgICAgICBkaXNwbGF5OiBub25lO1xuICAgICAgICB9XG4gICAgICAgIC5hdy10YWItYnRuIHtcbiAgICAgICAgICAgIGZsZXg6IDEgMSBhdXRvO1xuICAgICAgICAgICAgZGlzcGxheTogaW5saW5lLWZsZXg7XG4gICAgICAgICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAgICAgICAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7XG4gICAgICAgICAgICBnYXA6IDVweDtcbiAgICAgICAgICAgIHBhZGRpbmc6IDdweCAxMHB4O1xuICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjAzKTtcbiAgICAgICAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4wNyk7XG4gICAgICAgICAgICBib3JkZXItcmFkaXVzOiA4cHg7XG4gICAgICAgICAgICBjb2xvcjogIzhiOWJiNDtcbiAgICAgICAgICAgIGZvbnQtc2l6ZTogMTEuNXB4O1xuICAgICAgICAgICAgZm9udC13ZWlnaHQ6IDUwMDtcbiAgICAgICAgICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICAgICAgICAgIHdoaXRlLXNwYWNlOiBub3dyYXA7XG4gICAgICAgICAgICB0cmFuc2l0aW9uOiBhbGwgMC4ycyBjdWJpYy1iZXppZXIoMC40LCAwLCAwLjIsIDEpO1xuICAgICAgICAgICAgdXNlci1zZWxlY3Q6IG5vbmU7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LXRhYi1idG46aG92ZXIge1xuICAgICAgICAgICAgY29sb3I6ICNmZmZmZmY7XG4gICAgICAgICAgICBiYWNrZ3JvdW5kOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMDgpO1xuICAgICAgICAgICAgYm9yZGVyLWNvbG9yOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMTUpO1xuICAgICAgICB9XG4gICAgICAgIC5hdy10YWItYnRuLmFjdGl2ZSB7XG4gICAgICAgICAgICBjb2xvcjogIzAwZmY4ODtcbiAgICAgICAgICAgIGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsIHJnYmEoMCwgMjU1LCAxMzYsIDAuMTQpLCByZ2JhKDAsIDE4MCwgMjE2LCAwLjA5KSk7XG4gICAgICAgICAgICBib3JkZXItY29sb3I6IHJnYmEoMCwgMjU1LCAxMzYsIDAuNSk7XG4gICAgICAgICAgICBmb250LXdlaWdodDogNjAwO1xuICAgICAgICAgICAgYm94LXNoYWRvdzogMCAycHggMTBweCByZ2JhKDAsIDI1NSwgMTM2LCAwLjE1KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8qIFRhYiBDb250ZW50IEFuaW1hdGlvbiAqL1xuICAgICAgICAuYXctdGFiLXBhbmUge1xuICAgICAgICAgICAgZGlzcGxheTogbm9uZTtcbiAgICAgICAgICAgIGFuaW1hdGlvbjogYXdUYWJGYWRlIDAuMjJzIGN1YmljLWJlemllcigwLjQsIDAsIDAuMiwgMSk7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LXRhYi1wYW5lLmFjdGl2ZSB7XG4gICAgICAgICAgICBkaXNwbGF5OiBibG9jaztcbiAgICAgICAgfVxuICAgICAgICBAa2V5ZnJhbWVzIGF3VGFiRmFkZSB7XG4gICAgICAgICAgICBmcm9tIHsgb3BhY2l0eTogMDsgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKDRweCk7IH1cbiAgICAgICAgICAgIHRvIHsgb3BhY2l0eTogMTsgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKDApOyB9XG4gICAgICAgIH1cblxuICAgICAgICAvKiBTZXR0aW5nIENhcmRzICovXG4gICAgICAgIC5hdy1jYXJkIHtcbiAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMjIsIDI3LCA0MiwgMC41NSk7XG4gICAgICAgICAgICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMDYpO1xuICAgICAgICAgICAgYm9yZGVyLXJhZGl1czogMTBweDtcbiAgICAgICAgICAgIHBhZGRpbmc6IDEycHggMTRweDtcbiAgICAgICAgICAgIG1hcmdpbi1ib3R0b206IDEwcHg7XG4gICAgICAgICAgICB0cmFuc2l0aW9uOiBhbGwgMC4ycztcbiAgICAgICAgfVxuICAgICAgICAuYXctY2FyZDpob3ZlciB7XG4gICAgICAgICAgICBib3JkZXItY29sb3I6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4xMik7XG4gICAgICAgICAgICBiYWNrZ3JvdW5kOiByZ2JhKDI4LCAzNSwgNTQsIDAuNjUpO1xuICAgICAgICB9XG4gICAgICAgIC5hdy1jYXJkLXJvdyB7XG4gICAgICAgICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgICAgICAganVzdGlmeS1jb250ZW50OiBzcGFjZS1iZXR3ZWVuO1xuICAgICAgICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICAgICAgICAgIGdhcDogMTRweDtcbiAgICAgICAgfVxuICAgICAgICAuYXctY2FyZC1pbmZvIHtcbiAgICAgICAgICAgIGZsZXg6IDE7XG4gICAgICAgICAgICBtaW4td2lkdGg6IDA7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LWNhcmQtdGl0bGUge1xuICAgICAgICAgICAgZm9udC1zaXplOiAxM3B4O1xuICAgICAgICAgICAgZm9udC13ZWlnaHQ6IDYwMDtcbiAgICAgICAgICAgIGNvbG9yOiAjZjFmNWY5O1xuICAgICAgICAgICAgbWFyZ2luLWJvdHRvbTogM3B4O1xuICAgICAgICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgICAgICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgICAgICAgICBnYXA6IDZweDtcbiAgICAgICAgfVxuICAgICAgICAuYXctY2FyZC1kZXNjIHtcbiAgICAgICAgICAgIGZvbnQtc2l6ZTogMTFweDtcbiAgICAgICAgICAgIGNvbG9yOiAjOGI5YmI0O1xuICAgICAgICAgICAgbGluZS1oZWlnaHQ6IDEuNDU7XG4gICAgICAgIH1cblxuICAgICAgICAvKiBNb2Rlcm4gaU9TL0ZsdWVudCBUb2dnbGUgU3dpdGNoICovXG4gICAgICAgIC5hdy1zd2l0Y2gge1xuICAgICAgICAgICAgcG9zaXRpb246IHJlbGF0aXZlO1xuICAgICAgICAgICAgZGlzcGxheTogaW5saW5lLWJsb2NrO1xuICAgICAgICAgICAgd2lkdGg6IDQ0cHg7XG4gICAgICAgICAgICBoZWlnaHQ6IDI0cHg7XG4gICAgICAgICAgICBmbGV4LXNocmluazogMDtcbiAgICAgICAgICAgIG1hcmdpbjogMDtcbiAgICAgICAgICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICAgICAgfVxuICAgICAgICAuYXctc3dpdGNoIGlucHV0IHtcbiAgICAgICAgICAgIG9wYWNpdHk6IDA7XG4gICAgICAgICAgICB3aWR0aDogMDtcbiAgICAgICAgICAgIGhlaWdodDogMDtcbiAgICAgICAgICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgICAgICAgfVxuICAgICAgICAuYXctc3dpdGNoIC5hdy1zbGlkZXIge1xuICAgICAgICAgICAgcG9zaXRpb246IGFic29sdXRlO1xuICAgICAgICAgICAgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgICAgICAgdG9wOiAwOyBsZWZ0OiAwOyByaWdodDogMDsgYm90dG9tOiAwO1xuICAgICAgICAgICAgYmFja2dyb3VuZDogIzFlMjQzNjtcbiAgICAgICAgICAgIGJvcmRlcjogMXB4IHNvbGlkICMzNzNmNTk7XG4gICAgICAgICAgICB0cmFuc2l0aW9uOiBhbGwgMC4yNXMgY3ViaWMtYmV6aWVyKDAuNCwgMCwgMC4yLCAxKTtcbiAgICAgICAgICAgIGJvcmRlci1yYWRpdXM6IDI0cHg7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LXN3aXRjaCAuYXctc2xpZGVyOmJlZm9yZSB7XG4gICAgICAgICAgICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gICAgICAgICAgICBjb250ZW50OiBcIlwiO1xuICAgICAgICAgICAgaGVpZ2h0OiAxOHB4O1xuICAgICAgICAgICAgd2lkdGg6IDE4cHg7XG4gICAgICAgICAgICBsZWZ0OiAycHg7XG4gICAgICAgICAgICBib3R0b206IDJweDtcbiAgICAgICAgICAgIGJhY2tncm91bmQtY29sb3I6ICM5NGEzYjg7XG4gICAgICAgICAgICB0cmFuc2l0aW9uOiBhbGwgMC4yNXMgY3ViaWMtYmV6aWVyKDAuNCwgMCwgMC4yLCAxKTtcbiAgICAgICAgICAgIGJvcmRlci1yYWRpdXM6IDUwJTtcbiAgICAgICAgICAgIGJveC1zaGFkb3c6IDAgMnB4IDRweCByZ2JhKDAsMCwwLDAuNCk7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LXN3aXRjaCBpbnB1dDpjaGVja2VkICsgLmF3LXNsaWRlciB7XG4gICAgICAgICAgICBiYWNrZ3JvdW5kOiBsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjMDBmZjg4LCAjMDBjYzY2KTtcbiAgICAgICAgICAgIGJvcmRlci1jb2xvcjogIzAwZmY4ODtcbiAgICAgICAgICAgIGJveC1zaGFkb3c6IDAgMCAxMnB4IHJnYmEoMCwgMjU1LCAxMzYsIDAuMzUpO1xuICAgICAgICB9XG4gICAgICAgIC5hdy1zd2l0Y2ggaW5wdXQ6Y2hlY2tlZCArIC5hdy1zbGlkZXI6YmVmb3JlIHtcbiAgICAgICAgICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlWCgyMHB4KTtcbiAgICAgICAgICAgIGJhY2tncm91bmQtY29sb3I6ICNmZmZmZmY7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LXN3aXRjaDpob3ZlciAuYXctc2xpZGVyIHtcbiAgICAgICAgICAgIGJvcmRlci1jb2xvcjogIzUwNWM4MDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8qIFJhbmdlIFNsaWRlciAmIElucHV0cyAqL1xuICAgICAgICAuYXctcmFuZ2Utc2xpZGVyIHtcbiAgICAgICAgICAgIGZsZXg6IDE7XG4gICAgICAgICAgICBoZWlnaHQ6IDZweDtcbiAgICAgICAgICAgIGJvcmRlci1yYWRpdXM6IDNweDtcbiAgICAgICAgICAgIGJhY2tncm91bmQ6ICMyNTJjNDI7XG4gICAgICAgICAgICBvdXRsaW5lOiBub25lO1xuICAgICAgICAgICAgYWNjZW50LWNvbG9yOiAjMDBmZjg4O1xuICAgICAgICAgICAgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgICB9XG4gICAgICAgIC5hdy1udW0tYmFkZ2Uge1xuICAgICAgICAgICAgd2lkdGg6IDU4cHg7XG4gICAgICAgICAgICBiYWNrZ3JvdW5kOiAjMTQxODI2O1xuICAgICAgICAgICAgY29sb3I6ICMwMGZmODg7XG4gICAgICAgICAgICBib3JkZXI6IDFweCBzb2xpZCAjMmUzNzUyO1xuICAgICAgICAgICAgYm9yZGVyLXJhZGl1czogNnB4O1xuICAgICAgICAgICAgcGFkZGluZzogNXB4IDZweDtcbiAgICAgICAgICAgIGZvbnQtc2l6ZTogMTNweDtcbiAgICAgICAgICAgIGZvbnQtd2VpZ2h0OiA3MDA7XG4gICAgICAgICAgICB0ZXh0LWFsaWduOiBjZW50ZXI7XG4gICAgICAgICAgICB0cmFuc2l0aW9uOiBib3JkZXItY29sb3IgMC4ycztcbiAgICAgICAgfVxuICAgICAgICAuYXctbnVtLWJhZGdlOmZvY3VzIHtcbiAgICAgICAgICAgIGJvcmRlci1jb2xvcjogIzAwZmY4ODtcbiAgICAgICAgICAgIG91dGxpbmU6IG5vbmU7XG4gICAgICAgICAgICBib3gtc2hhZG93OiAwIDAgMCAycHggcmdiYSgwLCAyNTUsIDEzNiwgMC4yKTtcbiAgICAgICAgfVxuICAgICAgICAuYXctc2VsZWN0LWJveCB7XG4gICAgICAgICAgICBiYWNrZ3JvdW5kOiAjMTQxODI2O1xuICAgICAgICAgICAgY29sb3I6ICMwMGZmODg7XG4gICAgICAgICAgICBib3JkZXI6IDFweCBzb2xpZCAjMmUzNzUyO1xuICAgICAgICAgICAgYm9yZGVyLXJhZGl1czogNnB4O1xuICAgICAgICAgICAgcGFkZGluZzogNXB4IDEwcHg7XG4gICAgICAgICAgICBmb250LXNpemU6IDEycHg7XG4gICAgICAgICAgICBmb250LXdlaWdodDogNjAwO1xuICAgICAgICAgICAgb3V0bGluZTogbm9uZTtcbiAgICAgICAgICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICAgICAgICAgIHRyYW5zaXRpb246IGJvcmRlci1jb2xvciAwLjJzO1xuICAgICAgICB9XG4gICAgICAgIC5hdy1zZWxlY3QtYm94OmZvY3VzIHtcbiAgICAgICAgICAgIGJvcmRlci1jb2xvcjogIzAwZmY4ODtcbiAgICAgICAgfVxuXG4gICAgICAgIC8qIFF1aWNrIFByZXNldCBDaGlwcyAqL1xuICAgICAgICAuYXctcHJlc2V0LWJ0biB7XG4gICAgICAgICAgICBiYWNrZ3JvdW5kOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMDUpO1xuICAgICAgICAgICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjEpO1xuICAgICAgICAgICAgY29sb3I6ICM5NGEzYjg7XG4gICAgICAgICAgICBib3JkZXItcmFkaXVzOiA2cHg7XG4gICAgICAgICAgICBwYWRkaW5nOiAzcHggOXB4O1xuICAgICAgICAgICAgZm9udC1zaXplOiAxMXB4O1xuICAgICAgICAgICAgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgICAgICAgdHJhbnNpdGlvbjogYWxsIDAuMTVzO1xuICAgICAgICB9XG4gICAgICAgIC5hdy1wcmVzZXQtYnRuOmhvdmVyIHtcbiAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMCwgMjU1LCAxMzYsIDAuMTIpO1xuICAgICAgICAgICAgY29sb3I6ICMwMGZmODg7XG4gICAgICAgICAgICBib3JkZXItY29sb3I6IHJnYmEoMCwgMjU1LCAxMzYsIDAuNCk7XG4gICAgICAgIH1cblxuICAgICAgICAvKiBDdXN0b20gU2Nyb2xsYmFyICovXG4gICAgICAgICNhdy1zZXR0aW5ncy1jb250ZW50Ojotd2Via2l0LXNjcm9sbGJhciB7XG4gICAgICAgICAgICB3aWR0aDogNnB4O1xuICAgICAgICB9XG4gICAgICAgICNhdy1zZXR0aW5ncy1jb250ZW50Ojotd2Via2l0LXNjcm9sbGJhci10cmFjayB7XG4gICAgICAgICAgICBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDtcbiAgICAgICAgfVxuICAgICAgICAjYXctc2V0dGluZ3MtY29udGVudDo6LXdlYmtpdC1zY3JvbGxiYXItdGh1bWIge1xuICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjE0KTtcbiAgICAgICAgICAgIGJvcmRlci1yYWRpdXM6IDRweDtcbiAgICAgICAgfVxuICAgICAgICAjYXctc2V0dGluZ3MtY29udGVudDo6LXdlYmtpdC1zY3JvbGxiYXItdGh1bWI6aG92ZXIge1xuICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjI4KTtcbiAgICAgICAgfVxuICAgIGA7XG4gICAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChzdHlsZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVTZXR0aW5nc01vZGFsKENPTkZJRywgY3R4KSB7XG4gICAgZW5zdXJlU2V0dGluZ3NTdHlsZXMoKTtcblxuICAgIGNvbnN0IHNhdmVkQ3JlZHMgPSBnZXRTYXZlZENyZWRlbnRpYWxzKCk7XG4gICAgY29uc3Qgb2xkID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LXNldHRpbmdzLW1vZGFsJyk7XG4gICAgaWYgKG9sZCkgb2xkLnJlbW92ZSgpO1xuXG4gICAgY29uc3QgbW9kYWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBtb2RhbC5pZCA9ICdhdy1zZXR0aW5ncy1tb2RhbCc7XG4gICAgbW9kYWwuc3R5bGUuY3NzVGV4dCA9IGBcbiAgICAgICAgZGlzcGxheTogbm9uZTtcbiAgICAgICAgcG9zaXRpb246IGZpeGVkO1xuICAgICAgICB0b3A6IDA7IGxlZnQ6IDA7IHJpZ2h0OiAwOyBib3R0b206IDA7XG4gICAgICAgIGJhY2tncm91bmQ6IHJnYmEoNCwgNywgMTQsIDAuNzgpO1xuICAgICAgICBiYWNrZHJvcC1maWx0ZXI6IGJsdXIoOHB4KTtcbiAgICAgICAgLXdlYmtpdC1iYWNrZHJvcC1maWx0ZXI6IGJsdXIoOHB4KTtcbiAgICAgICAgei1pbmRleDogMTAwMDAxO1xuICAgICAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcbiAgICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICBgO1xuXG4gICAgY29uc3Qgc2hvcnRjdXRBY3Rpb25zID0gW1xuICAgICAgICB7IGlkOiAnc2hvd0hpZGUnLCAgICAgbGFiZWw6ICdUYW1waWxrYW4vU2VtYnVueWlrYW4gUGFuZWwnIH0sXG4gICAgICAgIHsgaWQ6ICd3b3JrTm93JywgICAgICBsYWJlbDogJ0tlcmphIFNla2FyYW5nIChXb3JrIE5vdyknIH0sXG4gICAgICAgIHsgaWQ6ICdwYXVzZVJlc3VtZScsICBsYWJlbDogJ0plZGEvTGFuanV0a2FuIChQYXVzZS9SZXN1bWUpJyB9LFxuICAgICAgICB7IGlkOiAnb3BlbkxvZycsICAgICAgbGFiZWw6ICdCdWthIEFjdGl2aXR5IExvZycgfSxcbiAgICAgICAgeyBpZDogJ29wZW5TZXR0aW5ncycsIGxhYmVsOiAnQnVrYSBNZW51IFBlbmdhdHVyYW4nIH1cbiAgICBdO1xuXG4gICAgY29uc3Qgc2hvcnRjdXRJbnB1dHNIVE1MID0gc2hvcnRjdXRBY3Rpb25zLm1hcChhY3Rpb24gPT4ge1xuICAgICAgICBjb25zdCBzaG9ydGN1dCA9IENPTkZJRy5zaG9ydGN1dHNbYWN0aW9uLmlkXSB8fCB7IGRpc3BsYXk6ICcnIH07XG4gICAgICAgIHJldHVybiBgXG4gICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTogZmxleDsgZ2FwOiAxMHB4OyBhbGlnbi1pdGVtczogY2VudGVyOyBtYXJnaW4tYm90dG9tOiAxMHB4OyBiYWNrZ3JvdW5kOiByZ2JhKDI1NSwyNTUsMjU1LDAuMDIpOyBwYWRkaW5nOiA4cHggMTJweDsgYm9yZGVyLXJhZGl1czogOHB4OyBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDI1NSwyNTUsMjU1LDAuMDUpO1wiPlxuICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiY29sb3I6ICNjYmQ1ZTE7IGZvbnQtc2l6ZTogMTJweDsgZmxleDogMTsgZm9udC13ZWlnaHQ6IDUwMDtcIj4ke2FjdGlvbi5sYWJlbH08L3NwYW4+XG4gICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6IGZsZXg7IGdhcDogOHB4OyBhbGlnbi1pdGVtczogY2VudGVyOyBmbGV4OiAwIDAgMjEwcHg7XCI+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJyZWNvcmQtJHthY3Rpb24uaWR9XCIgc3R5bGU9XCJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6ICMyNTJjNDA7IGNvbG9yOiAjZmZmOyBib3JkZXI6IDFweCBzb2xpZCAjM2I0NTYzO1xuICAgICAgICAgICAgICAgICAgICAgICAgcGFkZGluZzogNnB4IDEwcHg7IGJvcmRlci1yYWRpdXM6IDZweDsgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9udC1zaXplOiAxMXB4OyBtaW4td2lkdGg6IDc2cHg7IGZvbnQtd2VpZ2h0OiA1MDA7IHRyYW5zaXRpb246IGJhY2tncm91bmQgMC4xNXM7XG4gICAgICAgICAgICAgICAgICAgIFwiPlJla2FtPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwidGV4dFwiIGlkPVwic2hvcnRjdXQtJHthY3Rpb24uaWR9XCIgdmFsdWU9XCIke3Nob3J0Y3V0LmRpc3BsYXl9XCJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlYWRvbmx5XG4gICAgICAgICAgICAgICAgICAgICAgICBzdHlsZT1cIndpZHRoOiAxMTBweDsgYmFja2dyb3VuZDogIzEyMTYyNDsgY29sb3I6ICMwMGQ0ZmY7IGJvcmRlcjogMXB4IHNvbGlkICMyODMzNGU7IGJvcmRlci1yYWRpdXM6IDZweDsgcGFkZGluZzogNnB4IDhweDsgZm9udC1zaXplOiAxMXB4OyBmb250LXdlaWdodDogNzAwOyB0ZXh0LWFsaWduOiBjZW50ZXI7XCI+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgYDtcbiAgICB9KS5qb2luKCcnKTtcblxuICAgIG1vZGFsLmlubmVySFRNTCA9IGBcbiAgICAgICAgPGRpdiBzdHlsZT1cIlxuICAgICAgICAgICAgYmFja2dyb3VuZDogbGluZWFyLWdyYWRpZW50KDE4MGRlZywgIzEzMTcyNCAwJSwgIzBkMTAxYSAxMDAlKTtcbiAgICAgICAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4xMik7XG4gICAgICAgICAgICBib3JkZXItcmFkaXVzOiAxNnB4O1xuICAgICAgICAgICAgd2lkdGg6IDk1JTtcbiAgICAgICAgICAgIG1heC13aWR0aDogNjgwcHg7XG4gICAgICAgICAgICBtYXgtaGVpZ2h0OiA5MHZoO1xuICAgICAgICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgICAgICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG4gICAgICAgICAgICBib3gtc2hhZG93OiAwIDIwcHggNjBweCByZ2JhKDAsMCwwLDAuOCksIDAgMCAxcHggMXB4IHJnYmEoMjU1LDI1NSwyNTUsMC4wNSk7XG4gICAgICAgICAgICBvdmVyZmxvdzogaGlkZGVuO1xuICAgICAgICBcIj5cbiAgICAgICAgICAgIDwhLS0gTW9kYWwgSGVhZGVyIC0tPlxuICAgICAgICAgICAgPGRpdiBzdHlsZT1cIlxuICAgICAgICAgICAgICAgIHBhZGRpbmc6IDE2cHggMjBweDtcbiAgICAgICAgICAgICAgICBib3JkZXItYm90dG9tOiAxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjA4KTtcbiAgICAgICAgICAgICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgICAgICAgICAgIGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjtcbiAgICAgICAgICAgICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsIHJnYmEoMjYsIDMzLCA1NCwgMC44KSAwJSwgcmdiYSgxOCwgMjIsIDM2LCAwLjk1KSAxMDAlKTtcbiAgICAgICAgICAgIFwiPlxuICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBnYXA6IDEwcHg7XCI+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJcbiAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoOiAzMnB4OyBoZWlnaHQ6IDMycHg7IGJvcmRlci1yYWRpdXM6IDhweDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsIHJnYmEoMCwyNTUsMTM2LDAuMiksIHJnYmEoMCwxODAsMjE2LDAuMikpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSgwLDI1NSwxMzYsMC4zKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGp1c3RpZnktY29udGVudDogY2VudGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29sb3I6ICMwMGZmODg7XG4gICAgICAgICAgICAgICAgICAgIFwiPiR7SUNPTlMuc2V0dGluZ3N9PC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDxkaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZm9udC13ZWlnaHQ6IDcwMDsgY29sb3I6ICNmZmY7IGZvbnQtc2l6ZTogMTQuNXB4OyBsZXR0ZXItc3BhY2luZzogMC4zcHg7XCI+UGVuZ2F0dXJhbiBCb3Q8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJmb250LXNpemU6IDExcHg7IGNvbG9yOiAjOGI5YmI0O1wiPlNlc3VhaWthbiBqYWR3YWwsIHRocmVzaG9sZCwgbm90aWZpa2FzaSAmIGtlYW1hbmFuPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJhdy1jbG9zZS1zZXR0aW5nc1wiIHN0eWxlPVwiXG4gICAgICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4wNSk7IGNvbG9yOiAjY2JkNWUxOyBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMTIpO1xuICAgICAgICAgICAgICAgICAgICBwYWRkaW5nOiA2cHggMTJweDsgYm9yZGVyLXJhZGl1czogOHB4OyBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICAgICAgICAgICAgICAgIGZvbnQtc2l6ZTogMTJweDsgZm9udC13ZWlnaHQ6IDYwMDsgdHJhbnNpdGlvbjogYWxsIDAuMTVzO1xuICAgICAgICAgICAgICAgIFwiPlR1dHVwPC9idXR0b24+XG4gICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgPCEtLSBTZWdtZW50ZWQgQ2F0ZWdvcnkgVGFicyAtLT5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy10YWItbmF2XCI+XG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImF3LXRhYi1idG4gYWN0aXZlXCIgZGF0YS10YWI9XCJ0YWItd29ya1wiPiR7SUNPTlMuemFwfSBLZXJqYSAmIEVuZXJnaTwvYnV0dG9uPlxuICAgICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJhdy10YWItYnRuXCIgZGF0YS10YWI9XCJ0YWItc3RlYWx0aFwiPiR7SUNPTlMuc2hpZWxkfSBTdGVhbHRoICYgSmFkd2FsPC9idXR0b24+XG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImF3LXRhYi1idG5cIiBkYXRhLXRhYj1cInRhYi1ub3RpZlwiPiR7SUNPTlMuYmVsbH0gTm90aWZpa2FzaSAmIFN1YXJhPC9idXR0b24+XG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImF3LXRhYi1idG5cIiBkYXRhLXRhYj1cInRhYi11aVwiPiR7SUNPTlMubW9uaXRvcn0gVGFtcGlsYW4gJiBQaW50YXNhbjwvYnV0dG9uPlxuICAgICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJhdy10YWItYnRuXCIgZGF0YS10YWI9XCJ0YWItYWNjb3VudFwiPiR7SUNPTlMua2V5fSBBa3VuICYgU2lzdGVtPC9idXR0b24+XG4gICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgPCEtLSBTY3JvbGxhYmxlIENvbnRlbnQgQm9keSAtLT5cbiAgICAgICAgICAgIDxkaXYgaWQ9XCJhdy1zZXR0aW5ncy1jb250ZW50XCIgc3R5bGU9XCJcbiAgICAgICAgICAgICAgICBwYWRkaW5nOiAxOHB4IDIwcHg7XG4gICAgICAgICAgICAgICAgb3ZlcmZsb3cteTogYXV0bztcbiAgICAgICAgICAgICAgICBmbGV4OiAxO1xuICAgICAgICAgICAgICAgIG92ZXJzY3JvbGwtYmVoYXZpb3I6IGNvbnRhaW47XG4gICAgICAgICAgICBcIj5cbiAgICAgICAgICAgICAgICA8IS0tIFRBQiAxOiBLRVJKQSAmIEVORVJHSSAtLT5cbiAgICAgICAgICAgICAgICA8ZGl2IGlkPVwidGFiLXdvcmtcIiBjbGFzcz1cImF3LXRhYi1wYW5lIGFjdGl2ZVwiPlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6IGZsZXg7IGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjsgYWxpZ24taXRlbXM6IGNlbnRlcjsgbWFyZ2luLWJvdHRvbTogOHB4O1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLXRpdGxlXCI+QmF0YXMgRW5lcmdpIFNlYmVsdW0gS2VyamE8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTogZmxleDsgYWxpZ24taXRlbXM6IGNlbnRlcjsgZ2FwOiA0cHg7XCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwibnVtYmVyXCIgaWQ9XCJzZXR0aW5nLWVuZXJneS10aHJlc2hvbGQtbnVtXCIgbWluPVwiMTBcIiBtYXg9XCIxMDBcIiBzdGVwPVwiNVwiIHZhbHVlPVwiJHtDT05GSUcuZW5lcmd5VGhyZXNob2xkfVwiIGNsYXNzPVwiYXctbnVtLWJhZGdlXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiY29sb3I6ICMwMGZmODg7IGZvbnQtc2l6ZTogMTFweDsgZm9udC13ZWlnaHQ6IDcwMDtcIj5FTjwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmQtZGVzY1wiIHN0eWxlPVwibWFyZ2luLWJvdHRvbTogMTJweDtcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBCb3QgaGFueWEgYWthbiBtZW5nZWtzZWt1c2kgc2hpZnQga2VyamEgc2FhdCBlbmVyZ2kgYWt1biBtZW5jYXBhaSBhbmdrYSBpbmkuXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBnYXA6IDEwcHg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IG1hcmdpbi1ib3R0b206IDEycHg7XCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJyYW5nZVwiIGlkPVwic2V0dGluZy1lbmVyZ3ktdGhyZXNob2xkXCIgbWluPVwiMTBcIiBtYXg9XCIxMDBcIiBzdGVwPVwiNVwiIHZhbHVlPVwiJHtDT05GSUcuZW5lcmd5VGhyZXNob2xkfVwiIGNsYXNzPVwiYXctcmFuZ2Utc2xpZGVyXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwhLS0gUXVpY2sgUHJlc2V0cyAtLT5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBnYXA6IDZweDsgZmxleC13cmFwOiB3cmFwO1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiZm9udC1zaXplOiAxMXB4OyBjb2xvcjogIzY0NzQ4YjsgbWFyZ2luLXJpZ2h0OiA0cHg7XCI+UGlsaWhhbiBDZXBhdDo8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3M9XCJhdy1wcmVzZXQtYnRuXCIgZGF0YS12YWw9XCIxMFwiPjEwIEVOPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3M9XCJhdy1wcmVzZXQtYnRuXCIgZGF0YS12YWw9XCIyNVwiPjI1IEVOPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3M9XCJhdy1wcmVzZXQtYnRuXCIgZGF0YS12YWw9XCI1MFwiPjUwIEVOPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3M9XCJhdy1wcmVzZXQtYnRuXCIgZGF0YS12YWw9XCI4MFwiPjgwIEVOPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3M9XCJhdy1wcmVzZXQtYnRuXCIgZGF0YS12YWw9XCIxMDBcIj4xMDAgRU48L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgICAgICAgICA8IS0tIEZvcm11bGEgU2xlZXAgSW5mbyBDYXJkIC0tPlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiYmFja2dyb3VuZDogcmdiYSgwLCAyNTUsIDEzNiwgMC4wNCk7IGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMCwgMjU1LCAxMzYsIDAuMTUpOyBib3JkZXItcmFkaXVzOiAxMHB4OyBwYWRkaW5nOiAxNHB4OyBtYXJnaW4tdG9wOiAxNHB4O1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6IGZsZXg7IGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjsgYWxpZ24taXRlbXM6IGNlbnRlcjsgbWFyZ2luLWJvdHRvbTogOHB4O1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiY29sb3I6ICMwMGZmODg7IGZvbnQtc2l6ZTogMTJweDsgZm9udC13ZWlnaHQ6IDYwMDtcIj5SdW11cyBUaW1lciBQZW11bGloYW48L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJjb2xvcjogIzk0YTNiODsgZm9udC1zaXplOiAxMXB4OyBmb250LWZhbWlseTogbW9ub3NwYWNlO1wiPihUaHJlc2hvbGQgLSBTaXNhKSDDlyA2MHMgKyBKaXR0ZXI8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJmb250LXNpemU6IDExcHg7IGNvbG9yOiAjOTRhM2I4OyBsaW5lLWhlaWdodDogMS41O1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIOKAoiA8Yj5CdWZmIFdpbGF5YWg6PC9iPiBKaWthIHRpbmdnYWwgZGkgd2lsYXlhaCBiZXJmYXNpbGl0YXMgKHNlcGVydGkgSmF3YSBCYXJhdCksIHBlbXVsaWhhbiBlbmVyZ2kgb3RvbWF0aXMgZGlwZXJjZXBhdCBoaW5nZ2EgKzUwJSAoNDAgZGV0aWsgcGVyIGVuZXJnaSkuPGJyPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIOKAoiA8Yj5PcHRpbWlzdGljIERlY3JlbWVudDo8L2I+IEVuZXJnaSBsYW5nc3VuZyB0ZXJwb3Rvbmcgc2VrZXRpa2Egc2hpZnQgZGlraXJpbWthbiwgbWVuY2VnYWggdGFicmFrYW4gcGVybWludGFhbiBnYW5kYSAoMCByYWNlIGNvbmRpdGlvbnMpLlxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgICAgICAgPCEtLSBUQUIgMjogU1RFQUxUSCAmIEpBRFdBTCAtLT5cbiAgICAgICAgICAgICAgICA8ZGl2IGlkPVwidGFiLXN0ZWFsdGhcIiBjbGFzcz1cImF3LXRhYi1wYW5lXCI+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC1yb3dcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC1pbmZvXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLXRpdGxlXCI+VGhyZXNob2xkIEppdHRlciAoQW50aS1Qb2xhKTwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC1kZXNjXCI+TWVuZ2FjYWsgc2VkaWtpdCBhbWJhbmcgYmF0YXMgZW5lcmdpICjCsTIgRU4pIGRpIHNldGlhcCBzaWtsdXMgYWdhciBpbnRlcnZhbCBrZXJqYSB0aWRhayB0ZXJiYWNhIGtha3UgZGFuIHRlcmRldGVrc2kgYm90IG9sZWggc2VydmVyLjwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbCBjbGFzcz1cImF3LXN3aXRjaFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgaWQ9XCJzZXR0aW5nLXN0ZWFsdGgtaml0dGVyXCIgJHtDT05GSUcuc3RlYWx0aEppdHRlckVuYWJsZWQgPyAnY2hlY2tlZCcgOiAnJ30+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwiYXctc2xpZGVyXCI+PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvbGFiZWw+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmRcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLXJvd1wiIHN0eWxlPVwibWFyZ2luLWJvdHRvbTogMTBweDtcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC1pbmZvXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLXRpdGxlXCI+SmFkd2FsIElzdGlyYWhhdCBNYWxhbTwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC1kZXNjXCI+Qm90IG90b21hdGlzIGJlcmhlbnRpIGtlcmphIHBhZGEgcmVudGFuZyBqYW0gaXN0aXJhaGF0IG1hbGFtIGxheWFrbnlhIHBvbGEgaGlkdXAgbWFudXNpYSBub3JtYWwuPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzPVwiYXctc3dpdGNoXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBpZD1cInNldHRpbmctc2xlZXAtc2NoZWR1bGVcIiAke0NPTkZJRy5zbGVlcFNjaGVkdWxlRW5hYmxlZCA/ICdjaGVja2VkJyA6ICcnfT5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJhdy1zbGlkZXJcIj48L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9sYWJlbD5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6IGZsZXg7IGdhcDogOHB4OyBhbGlnbi1pdGVtczogY2VudGVyOyBiYWNrZ3JvdW5kOiByZ2JhKDAsMCwwLDAuMjUpOyBwYWRkaW5nOiA4cHggMTJweDsgYm9yZGVyLXJhZGl1czogOHB4OyBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDI1NSwyNTUsMjU1LDAuMDQpO1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiZm9udC1zaXplOiAxMnB4OyBjb2xvcjogIzk0YTNiODtcIj5KYW0gSXN0aXJhaGF0Ojwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c2VsZWN0IGlkPVwic2V0dGluZy1zbGVlcC1zdGFydFwiIGNsYXNzPVwiYXctc2VsZWN0LWJveFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAke0FycmF5LmZyb20oe2xlbmd0aDogMjR9LCAoXywgaSkgPT4gYDxvcHRpb24gdmFsdWU9XCIke2l9XCIgJHsoQ09ORklHLnNsZWVwU3RhcnRIb3VyID8/IDEpID09PSBpID8gJ3NlbGVjdGVkJyA6ICcnfT4ke1N0cmluZyhpKS5wYWRTdGFydCgyLCAnMCcpfTowMDwvb3B0aW9uPmApLmpvaW4oJycpfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvc2VsZWN0PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiZm9udC1zaXplOiAxMnB4OyBjb2xvcjogIzY0NzQ4YjtcIj5zL2Q8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPHNlbGVjdCBpZD1cInNldHRpbmctc2xlZXAtZW5kXCIgY2xhc3M9XCJhdy1zZWxlY3QtYm94XCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICR7QXJyYXkuZnJvbSh7bGVuZ3RoOiAyNH0sIChfLCBpKSA9PiBgPG9wdGlvbiB2YWx1ZT1cIiR7aX1cIiAkeyhDT05GSUcuc2xlZXBFbmRIb3VyID8/IDYpID09PSBpID8gJ3NlbGVjdGVkJyA6ICcnfT4ke1N0cmluZyhpKS5wYWRTdGFydCgyLCAnMCcpfTowMDwvb3B0aW9uPmApLmpvaW4oJycpfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvc2VsZWN0PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiZm9udC1zaXplOiAxMXB4OyBjb2xvcjogIzY0NzQ4YjsgbWFyZ2luLWxlZnQ6IGF1dG87XCI+V0lCPC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC1yb3dcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC1pbmZvXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLXRpdGxlXCI+UGVyZWRhbSBMb2cgRW5lcmdpIFJlbmRhaCAoUXVpZXQgTW9kZSk8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmQtZGVzY1wiPk1lbWJhdGFzaSBsb2cgXCJFbmVyZ2kgdGlkYWsgY3VrdXBcIiBtYWtzaW1hbCAxeCBwZXIgMiBtZW5pdCBhZ2FyIEFjdGl2aXR5IExvZyB0ZXRhcCBiZXJzaWggZGFuIG11ZGFoIGRpYmFjYS48L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgY2xhc3M9XCJhdy1zd2l0Y2hcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJjaGVja2JveFwiIGlkPVwic2V0dGluZy1xdWlldC1tb2RlXCIgJHtDT05GSUcucXVpZXRNb2RlRW5hYmxlZCA/ICdjaGVja2VkJyA6ICcnfT5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJhdy1zbGlkZXJcIj48L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9sYWJlbD5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgICAgIDwhLS0gVEFCIDM6IE5PVElGSUtBU0kgJiBTVUFSQSAtLT5cbiAgICAgICAgICAgICAgICA8ZGl2IGlkPVwidGFiLW5vdGlmXCIgY2xhc3M9XCJhdy10YWItcGFuZVwiPlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmQtcm93XCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmQtaW5mb1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC10aXRsZVwiPk5vdGlmaWthc2kgUG9wLXVwIEJyb3dzZXI8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmQtZGVzY1wiPk1lbmFtcGlsa2FuIGJhbm5lciBub3RpZmlrYXNpIGRlc2t0b3AgYnJvd3NlciBrZXRpa2Egc2hpZnQgYmVyaGFzaWwgZGlrZXJqYWthbi48L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgY2xhc3M9XCJhdy1zd2l0Y2hcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJjaGVja2JveFwiIGlkPVwic2V0dGluZy1ub3RpZmljYXRpb25zXCIgJHtDT05GSUcuc2VuZE5vdGlmaWNhdGlvbiA/ICdjaGVja2VkJyA6ICcnfT5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJhdy1zbGlkZXJcIj48L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9sYWJlbD5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmQtcm93XCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmQtaW5mb1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC10aXRsZVwiPkFsZXJ0IERlc2t0b3AgU2FhdCBFbmVyZ2kgUGVudWg8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmQtZGVzY1wiPktpcmltIG5vdGlmaWthc2kgZGVza3RvcCBzZWdlcmEgc2V0ZWxhaCBlbmVyZ2kgbWVuY2FwYWkgYmF0YXMgbWFrc2ltYWwgYWdhciB0aWRhayB0ZXJidWFuZy48L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgY2xhc3M9XCJhdy1zd2l0Y2hcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJjaGVja2JveFwiIGlkPVwic2V0dGluZy1lbmVyZ3ktZnVsbC1hbGVydFwiICR7Q09ORklHLmVuZXJneUZ1bGxBbGVydEVuYWJsZWQgPyAnY2hlY2tlZCcgOiAnJ30+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwiYXctc2xpZGVyXCI+PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvbGFiZWw+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmRcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLXJvd1wiIHN0eWxlPVwibWFyZ2luLWJvdHRvbTogOHB4O1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLWluZm9cIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmQtdGl0bGVcIj5TdWFyYSBOb3RpZmlrYXNpIEtlcmphPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLWRlc2NcIj5QdXRhciBlZmVrIGF1ZGlvIGhhbHVzIHNhYXQgc2VsZXNhaSBiZWtlcmphIGF0YXUgdGVyamFkaSBrZXNhbGFoYW4uPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzPVwiYXctc3dpdGNoXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBpZD1cInNldHRpbmctc291bmQtbm90aWZpY2F0aW9uLWVuYWJsZWRcIiAke0NPTkZJRy5zb3VuZE5vdGlmaWNhdGlvbkVuYWJsZWQgPyAnY2hlY2tlZCcgOiAnJ30+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwiYXctc2xpZGVyXCI+PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvbGFiZWw+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBnYXA6IDEwcHg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IG1hcmdpbi10b3A6IDZweDtcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBzdHlsZT1cImZvbnQtc2l6ZTogMTFweDsgY29sb3I6ICM5NGEzYjg7IHdpZHRoOiA1MHB4O1wiPlZvbHVtZTo8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJyYW5nZVwiIGlkPVwic2V0dGluZy1zb3VuZC1ub3RpZmljYXRpb24tdm9sdW1lXCIgbWluPVwiMFwiIG1heD1cIjEwMFwiIHZhbHVlPVwiJHtNYXRoLnJvdW5kKENPTkZJRy5zb3VuZE5vdGlmaWNhdGlvblZvbHVtZSAqIDEwMCl9XCIgY2xhc3M9XCJhdy1yYW5nZS1zbGlkZXJcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cIm51bWJlclwiIGlkPVwic2V0dGluZy1zb3VuZC1ub3RpZmljYXRpb24tdm9sdW1lLW51bVwiIG1pbj1cIjBcIiBtYXg9XCIxMDBcIiB2YWx1ZT1cIiR7TWF0aC5yb3VuZChDT05GSUcuc291bmROb3RpZmljYXRpb25Wb2x1bWUgKiAxMDApfVwiIGNsYXNzPVwiYXctbnVtLWJhZGdlXCIgc3R5bGU9XCJjb2xvcjogIzAwZDRmZjtcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBzdHlsZT1cImNvbG9yOiAjNjQ3NDhiOyBmb250LXNpemU6IDEycHg7XCI+JTwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmQtcm93XCIgc3R5bGU9XCJtYXJnaW4tYm90dG9tOiA4cHg7XCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmQtaW5mb1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC10aXRsZVwiPkFsYXJtIFN1YXJhIEVuZXJnaSBQZW51aDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC1kZXNjXCI+UHV0YXIgYWxhcm0ga2h1c3VzIHNhYXQgZW5lcmdpIGFrdW4gc3VkYWggbWVueWVudHVoIGthcGFzaXRhcyBtYWtzaW1hbC48L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgY2xhc3M9XCJhdy1zd2l0Y2hcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJjaGVja2JveFwiIGlkPVwic2V0dGluZy1lbmVyZ3ktZnVsbC1zb3VuZC1lbmFibGVkXCIgJHtDT05GSUcuZW5lcmd5RnVsbEFsZXJ0U291bmRFbmFibGVkID8gJ2NoZWNrZWQnIDogJyd9PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz1cImF3LXNsaWRlclwiPjwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2xhYmVsPlxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTogZmxleDsgZ2FwOiAxMHB4OyBhbGlnbi1pdGVtczogY2VudGVyOyBtYXJnaW4tdG9wOiA2cHg7XCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJmb250LXNpemU6IDExcHg7IGNvbG9yOiAjOTRhM2I4OyB3aWR0aDogNTBweDtcIj5Wb2x1bWU6PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwicmFuZ2VcIiBpZD1cInNldHRpbmctZW5lcmd5LWZ1bGwtdm9sdW1lXCIgbWluPVwiMFwiIG1heD1cIjEwMFwiIHZhbHVlPVwiJHtNYXRoLnJvdW5kKENPTkZJRy5lbmVyZ3lGdWxsQWxlcnRWb2x1bWUgKiAxMDApfVwiIGNsYXNzPVwiYXctcmFuZ2Utc2xpZGVyXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJudW1iZXJcIiBpZD1cInNldHRpbmctZW5lcmd5LWZ1bGwtdm9sdW1lLW51bVwiIG1pbj1cIjBcIiBtYXg9XCIxMDBcIiB2YWx1ZT1cIiR7TWF0aC5yb3VuZChDT05GSUcuZW5lcmd5RnVsbEFsZXJ0Vm9sdW1lICogMTAwKX1cIiBjbGFzcz1cImF3LW51bS1iYWRnZVwiIHN0eWxlPVwiY29sb3I6ICMwMGQ0ZmY7XCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJjb2xvcjogIzY0NzQ4YjsgZm9udC1zaXplOiAxMnB4O1wiPiU8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBpZD1cImF3LXRlc3Qtbm90aWZpY2F0aW9uLXNvdW5kXCIgc3R5bGU9XCJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4wNSk7IGNvbG9yOiAjZmZmOyBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMTIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcGFkZGluZzogOXB4IDE2cHg7IGJvcmRlci1yYWRpdXM6IDhweDsgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9udC1zaXplOiAxMnB4OyB3aWR0aDogMTAwJTsgZm9udC13ZWlnaHQ6IDYwMDsgbWFyZ2luLXRvcDogNHB4O1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJhbnNpdGlvbjogYWxsIDAuMTVzO1xuICAgICAgICAgICAgICAgICAgICBcIj5VamkgQ29iYSBCdW55aSBTdWFyYSAoVGVzdCBTb3VuZCk8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgICAgIDwhLS0gVEFCIDQ6IFRBTVBJTEFOICYgU0hPUlRDVVQgLS0+XG4gICAgICAgICAgICAgICAgPGRpdiBpZD1cInRhYi11aVwiIGNsYXNzPVwiYXctdGFiLXBhbmVcIj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmRcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLXJvd1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLWluZm9cIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmQtdGl0bGVcIj5IYW55YSBUYW1waWxrYW4gZGkgRGFzaGJvYXJkICgvZGFzaGJvYXJkKTwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC1kZXNjXCI+T3RvbWF0aXMgc2VtYnVueWlrYW4gcGFuZWwgamlrYSBtZW1idWthIGhhbGFtYW4gbGFpbiAobWlzYWw6IC9tYXAsIC9tYXJrZXQpLiBCb3QgdGV0YXAgYWt0aWYgZGkgYmFja2dyb3VuZC48L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgY2xhc3M9XCJhdy1zd2l0Y2hcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJjaGVja2JveFwiIGlkPVwic2V0dGluZy1wYW5lbC1kYXNoYm9hcmQtb25seVwiICR7Q09ORklHLnBhbmVsRGFzaGJvYXJkT25seSA/ICdjaGVja2VkJyA6ICcnfT5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJhdy1zbGlkZXJcIj48L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9sYWJlbD5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmQtcm93XCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmQtaW5mb1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC10aXRsZVwiPkhhbnlhIFRhbXBpbGthbiBkaSBUYWIgVXRhbWEgKFN0YW5kYnkgSGlkZGVuKTwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC1kZXNjXCI+SmlrYSBtZW1idWthIGJhbnlhayB0YWIgZ2FtZSBiZXJzYW1hYW4sIHBhbmVsIGhhbnlhIG1lbGF5YW5nIGRpIHRhYiB1dGFtYSB5YW5nIG1lbWltcGluIGtlcmphLjwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbCBjbGFzcz1cImF3LXN3aXRjaFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgaWQ9XCJzZXR0aW5nLXBhbmVsLWxlYWRlci1vbmx5XCIgJHtDT05GSUcucGFuZWxMZWFkZXJPbmx5ID8gJ2NoZWNrZWQnIDogJyd9PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz1cImF3LXNsaWRlclwiPjwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2xhYmVsPlxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC1yb3dcIiBzdHlsZT1cIm1hcmdpbi1ib3R0b206IDhweDtcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC1pbmZvXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLXRpdGxlXCI+U2VzdWFpa2FuIGRlbmdhbiBVa3VyYW4gSmVuZGVsYSBCcm93c2VyPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLWRlc2NcIj5NZW5jZWdhaCBwYW5lbCBrZWx1YXIgbGF5YXIgc2FhdCB1a3VyYW4gYnJvd3NlciBkaXBlcmtlY2lsLjwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbCBjbGFzcz1cImF3LXN3aXRjaFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgaWQ9XCJzZXR0aW5nLWZvbGxvdy12aWV3cG9ydFwiICR7Q09ORklHLnBhbmVsRm9sbG93Vmlld3BvcnQgPyAnY2hlY2tlZCcgOiAnJ30+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwiYXctc2xpZGVyXCI+PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvbGFiZWw+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLXJvd1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLWluZm9cIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmQtdGl0bGVcIj5LZW1iYWxpIGtlIFBvc2lzaSBTZW11bGEgU2FhdCBCcm93c2VyIERpYmVzYXJrYW48L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmQtZGVzY1wiPk1lbmdlbWJhbGlrYW4gcGFuZWwga2Uga29vcmRpbmF0IGFzYWwgc2FhdCBydWFuZyBsYXlhciBrZW1iYWxpIGxlZ2EuPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzPVwiYXctc3dpdGNoXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBpZD1cInNldHRpbmctcmV0dXJuLW9yaWdpbmFsXCIgJHtDT05GSUcucGFuZWxSZXR1cm5Ub09yaWdpbmFsID8gJ2NoZWNrZWQnIDogJyd9PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz1cImF3LXNsaWRlclwiPjwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2xhYmVsPlxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJhdy1yZXNldC1wb3NpdGlvblwiIHN0eWxlPVwiXG4gICAgICAgICAgICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMDUpOyBjb2xvcjogI2NiZDVlMTsgYm9yZGVyOiAxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcGFkZGluZzogOHB4IDE2cHg7IGJvcmRlci1yYWRpdXM6IDhweDsgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9udC1zaXplOiAxMnB4OyB3aWR0aDogMTAwJTsgbWFyZ2luLWJvdHRvbTogMTZweDsgZm9udC13ZWlnaHQ6IDUwMDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyYW5zaXRpb246IGFsbCAwLjE1cztcbiAgICAgICAgICAgICAgICAgICAgXCI+QXR1ciBVbGFuZyBQb3Npc2kgUGFuZWwga2UgUG9qb2sgS2FuYW48L2J1dHRvbj5cblxuICAgICAgICAgICAgICAgICAgICA8IS0tIEtleWJvYXJkIFNob3J0Y3V0cyBTdWItU2VjdGlvbiAtLT5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cIm1hcmdpbi10b3A6IDEwcHg7XCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZm9udC1zaXplOiAxM3B4OyBmb250LXdlaWdodDogNjAwOyBjb2xvcjogI2ZmZjsgbWFyZ2luLWJvdHRvbTogNHB4O1wiPlBpbnRhc2FuIEtleWJvYXJkIChTaG9ydGN1dHMpPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZm9udC1zaXplOiAxMXB4OyBjb2xvcjogIzhiOWJiNDsgbWFyZ2luLWJvdHRvbTogMTBweDtcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBLbGlrIDxiPlJla2FtPC9iPiBsYWx1IHRla2FuIDHigJMzIGtvbWJpbmFzaSB0b21ib2wuIFRla2FuIDxrYmQgc3R5bGU9XCJiYWNrZ3JvdW5kOiMyMjI7cGFkZGluZzoxcHggNHB4O2JvcmRlci1yYWRpdXM6M3B4O1wiPkVudGVyPC9rYmQ+IHVudHVrIHNpbXBhbiwgPGtiZCBzdHlsZT1cImJhY2tncm91bmQ6IzIyMjtwYWRkaW5nOjFweCA0cHg7Ym9yZGVyLXJhZGl1czozcHg7XCI+RXNjPC9rYmQ+IHVudHVrIGJhdGFsa2FuLlxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAke3Nob3J0Y3V0SW5wdXRzSFRNTH1cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgaWQ9XCJzaG9ydGN1dC1lcnJvclwiIHN0eWxlPVwiY29sb3I6ICNmZjQ0NDQ7IGZvbnQtc2l6ZTogMTFweDsgbWFyZ2luLXRvcDogOHB4OyBkaXNwbGF5OiBub25lO1wiPjwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgICAgIDwhLS0gVEFCIDU6IEFLVU4gJiBTSVNURU0gLS0+XG4gICAgICAgICAgICAgICAgPGRpdiBpZD1cInRhYi1hY2NvdW50XCIgY2xhc3M9XCJhdy10YWItcGFuZVwiPlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmQtcm93XCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmQtaW5mb1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC10aXRsZVwiPk1vZGUgRWNvIChIZW1hdCBSQU0gJiBDUFUpPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLWRlc2NcIj5NZW5naGVudGlrYW4gcmVuZGVyIHZpc3VhbCBET00gc2FhdCB0YWIgZGl0aW5nZ2FsIGRpIGxhdGFyIGJlbGFrYW5nIGRhbiBtZW4tY2FjaGUgcGVtYmFjYWFuIHdpbGF5YWguIFRpbWVyIGRhbiBnaWxpcmFuIGtlcmphIHRldGFwIGJlcmphbGFuIDEwMCUgcHJlc2lzaSB0YW5wYSB0ZXJ0dW5kYS48L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgY2xhc3M9XCJhdy1zd2l0Y2hcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJjaGVja2JveFwiIGlkPVwic2V0dGluZy1lY28tbW9kZVwiICR7Q09ORklHLmVjb01vZGVFbmFibGVkICE9PSBmYWxzZSA/ICdjaGVja2VkJyA6ICcnfT5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJhdy1zbGlkZXJcIj48L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9sYWJlbD5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmQtcm93XCIgc3R5bGU9XCJtYXJnaW4tYm90dG9tOiAxMHB4O1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLWluZm9cIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmQtdGl0bGVcIj5NYXN1ayBPdG9tYXRpcyAoQXV0byBSZS1Mb2dpbik8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmQtZGVzY1wiPkppa2Egc2VzaS90b2tlbiBnYW1lIGhhYmlzIChIVFRQIDQwMSksIGJvdCBha2FuIG90b21hdGlzIGxvZ2luIGtlbWJhbGkga2UgYWt1biBBbmRhIGRhbiBtZWxhbmp1dGthbiBrZXJqYS4gRGF0YSBkaXNpbXBhbiBhbWFuIDEwMCUgbG9rYWwgZGkgYnJvd3Nlci48L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgY2xhc3M9XCJhdy1zd2l0Y2hcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJjaGVja2JveFwiIGlkPVwic2V0dGluZy1hdXRvLXJlbG9naW5cIiAke0NPTkZJRy5hdXRvUmVsb2dpbkVuYWJsZWQgPyAnY2hlY2tlZCcgOiAnJ30+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwiYXctc2xpZGVyXCI+PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvbGFiZWw+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBpZD1cImF3LWF1dG9sb2dpbi1maWVsZHNcIiBzdHlsZT1cImJhY2tncm91bmQ6IHJnYmEoMCwwLDAsMC4zKTsgcGFkZGluZzogMTJweDsgYm9yZGVyLXJhZGl1czogOHB4OyBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDI1NSwyNTUsMjU1LDAuMDUpOyBtYXJnaW4tdG9wOiA4cHg7XCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cIm1hcmdpbi1ib3R0b206IDEwcHg7XCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbCBzdHlsZT1cImRpc3BsYXk6IGJsb2NrOyBmb250LXNpemU6IDExcHg7IGNvbG9yOiAjOTRhM2I4OyBtYXJnaW4tYm90dG9tOiA0cHg7IGZvbnQtd2VpZ2h0OiA1MDA7XCI+RW1haWwgQWt1biBHYW1lPC9sYWJlbD5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJlbWFpbFwiIGlkPVwic2V0dGluZy1sb2dpbi1lbWFpbFwiIGF1dG9jb21wbGV0ZT1cIm9mZlwiIGRhdGEtbHBpZ25vcmU9XCJ0cnVlXCIgZGF0YS1mb3JtLXR5cGU9XCJvdGhlclwiIHBsYWNlaG9sZGVyPVwibmFtYUBlbWFpbC5jb21cIiB2YWx1ZT1cIiR7c2F2ZWRDcmVkcz8uZW1haWwgfHwgJyd9XCIgc3R5bGU9XCJ3aWR0aDogMTAwJTsgYm94LXNpemluZzogYm9yZGVyLWJveDsgYmFja2dyb3VuZDogIzEzMTcyNDsgY29sb3I6ICNmZmY7IGJvcmRlcjogMXB4IHNvbGlkICMyZDM2NGY7IGJvcmRlci1yYWRpdXM6IDZweDsgcGFkZGluZzogOHB4IDEwcHg7IGZvbnQtc2l6ZTogMTJweDtcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwibWFyZ2luLWJvdHRvbTogMTJweDtcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6IGZsZXg7IGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjsgbWFyZ2luLWJvdHRvbTogNHB4O1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsIHN0eWxlPVwiZm9udC1zaXplOiAxMXB4OyBjb2xvcjogIzk0YTNiODsgZm9udC13ZWlnaHQ6IDUwMDtcIj5LYXRhIFNhbmRpPC9sYWJlbD5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGlkPVwiYXctdG9nZ2xlLXB3ZC12aXNcIiBzdHlsZT1cImZvbnQtc2l6ZTogMTFweDsgY29sb3I6ICMwMGQ0ZmY7IGN1cnNvcjogcG9pbnRlcjsgdXNlci1zZWxlY3Q6IG5vbmU7XCI+TGloYXQ8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cInBhc3N3b3JkXCIgaWQ9XCJzZXR0aW5nLWxvZ2luLXB3ZFwiIGF1dG9jb21wbGV0ZT1cIm9mZlwiIGRhdGEtbHBpZ25vcmU9XCJ0cnVlXCIgZGF0YS1mb3JtLXR5cGU9XCJvdGhlclwiIHBsYWNlaG9sZGVyPVwiS2F0YSBzYW5kaSBha3VubXVcIiB2YWx1ZT1cIiR7c2F2ZWRDcmVkcz8ucGFzc3dvcmQgfHwgJyd9XCIgc3R5bGU9XCJ3aWR0aDogMTAwJTsgYm94LXNpemluZzogYm9yZGVyLWJveDsgYmFja2dyb3VuZDogIzEzMTcyNDsgY29sb3I6ICNmZmY7IGJvcmRlcjogMXB4IHNvbGlkICMyZDM2NGY7IGJvcmRlci1yYWRpdXM6IDZweDsgcGFkZGluZzogOHB4IDEwcHg7IGZvbnQtc2l6ZTogMTJweDtcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTogZmxleDsgZ2FwOiA4cHg7XCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJhdy1zYXZlLWxvZ2luLWNyZWRzXCIgc3R5bGU9XCJmbGV4OiAxOyBiYWNrZ3JvdW5kOiBsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjMDI4NGM3LCAjMDM2OWExKTsgY29sb3I6ICNmZmY7IGJvcmRlcjogbm9uZTsgcGFkZGluZzogOHB4OyBib3JkZXItcmFkaXVzOiA2cHg7IGN1cnNvcjogcG9pbnRlcjsgZm9udC1zaXplOiAxMXB4OyBmb250LXdlaWdodDogNjAwO1wiPlNpbXBhbiBLcmVkZW5zaWFsPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJhdy1jbGVhci1sb2dpbi1jcmVkc1wiIHN0eWxlPVwiYmFja2dyb3VuZDogcmdiYSgyNTUsMjU1LDI1NSwwLjA1KTsgY29sb3I6ICNmZjU1NTU7IGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMjU1LDg1LDg1LDAuMyk7IHBhZGRpbmc6IDhweCAxMnB4OyBib3JkZXItcmFkaXVzOiA2cHg7IGN1cnNvcjogcG9pbnRlcjsgZm9udC1zaXplOiAxMXB4OyBmb250LXdlaWdodDogNTAwO1wiPkhhcHVzPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBpZD1cImF3LWxvZ2luLWNyZWRzLW1zZ1wiIHN0eWxlPVwiZm9udC1zaXplOiAxMXB4OyBtYXJnaW4tdG9wOiA4cHg7IGRpc3BsYXk6IG5vbmU7XCI+PC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmRcIiBzdHlsZT1cIm1hcmdpbi10b3A6IDE0cHg7IGJvcmRlci1jb2xvcjogcmdiYSgyNTUsIDg1LCA4NSwgMC4yKTtcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLXRpdGxlXCIgc3R5bGU9XCJjb2xvcjogI2ZmNmI2YjsgbWFyZ2luLWJvdHRvbTogNnB4O1wiPlpvbmEgQmFoYXlhIChSZXNldCBUb3RhbCk8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLWRlc2NcIiBzdHlsZT1cIm1hcmdpbi1ib3R0b206IDEycHg7XCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgTWVuZ2VtYmFsaWthbiBzZWx1cnVoIHByZWZlcmVuc2ksIGJhdGFzIGVuZXJnaSwgcGludGFzYW4ga2V5Ym9hcmQsIGRhbiBwb3Npc2kgcGFuZWwga2UgcGVuZ2F0dXJhbiBhd2FsIHBhYnJpay5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBpZD1cImF3LXJlc3RvcmUtZGVmYXVsdHNcIiBzdHlsZT1cIlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsIHJnYmEoMjU1LCAxMDcsIDEwNywgMC4yKSwgcmdiYSgyMDQsIDAsIDAsIDAuMykpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbG9yOiAjZmY4ODg4OyBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDI1NSwgMTA3LCAxMDcsIDAuNCk7IHBhZGRpbmc6IDlweDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBib3JkZXItcmFkaXVzOiA2cHg7IGN1cnNvcjogcG9pbnRlcjsgZm9udC13ZWlnaHQ6IDYwMDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb250LXNpemU6IDEycHg7IHdpZHRoOiAxMDAlOyB0cmFuc2l0aW9uOiBhbGwgMC4xNXM7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIj5QdWxpaGthbiBTZW11YSBQZW5nYXR1cmFuIGtlIERlZmF1bHQ8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgPCEtLSBTdGlja3kgTW9kYWwgRm9vdGVyIC0tPlxuICAgICAgICAgICAgPGRpdiBpZD1cImF3LXNldHRpbmdzLWZvb3RlclwiIHN0eWxlPVwiXG4gICAgICAgICAgICAgICAgcGFkZGluZzogMTJweCAyMHB4O1xuICAgICAgICAgICAgICAgIGJvcmRlci10b3A6IDFweCBzb2xpZCByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMDgpO1xuICAgICAgICAgICAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICAgICAgICAgICAgZ2FwOiAxMnB4O1xuICAgICAgICAgICAgICAgIGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjtcbiAgICAgICAgICAgICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsICMxMzE3MjQgMCUsICMwZDEwMWEgMTAwJSk7XG4gICAgICAgICAgICBcIj5cbiAgICAgICAgICAgICAgICA8ZGl2IGlkPVwiYXctc2V0dGluZ3Mtc3RhdHVzXCIgc3R5bGU9XCJmb250LXNpemU6IDEycHg7IGNvbG9yOiAjMDBmZjg4OyBmb250LXdlaWdodDogNjAwOyBkaXNwbGF5OiBub25lO1wiPjwvZGl2PlxuICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBnYXA6IDhweDsgbWFyZ2luLWxlZnQ6IGF1dG87XCI+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJhdy1jYW5jZWwtc2V0dGluZ3NcIiBzdHlsZT1cIlxuICAgICAgICAgICAgICAgICAgICAgICAgYmFja2dyb3VuZDogdHJhbnNwYXJlbnQ7IGNvbG9yOiAjOTRhM2I4OyBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMTUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcGFkZGluZzogOHB4IDE2cHg7IGJvcmRlci1yYWRpdXM6IDhweDsgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9udC1zaXplOiAxMnB4OyBmb250LXdlaWdodDogNjAwOyB0cmFuc2l0aW9uOiBhbGwgMC4xNXM7XG4gICAgICAgICAgICAgICAgICAgIFwiPkJhdGFsPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJhdy1zYXZlLXNldHRpbmdzXCIgc3R5bGU9XCJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsICMwMGZmODgsICMwMGNjNjYpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29sb3I6ICMwNTBhMTQ7IGJvcmRlcjogbm9uZTsgcGFkZGluZzogOXB4IDI0cHg7XG4gICAgICAgICAgICAgICAgICAgICAgICBib3JkZXItcmFkaXVzOiA4cHg7IGN1cnNvcjogcG9pbnRlcjsgZm9udC13ZWlnaHQ6IDcwMDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbnQtc2l6ZTogMTNweDsgYm94LXNoYWRvdzogMCA0cHggMTRweCByZ2JhKDAsMjU1LDEzNiwwLjMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJhbnNpdGlvbjogdHJhbnNmb3JtIDAuMTVzLCBib3gtc2hhZG93IDAuMTVzO1xuICAgICAgICAgICAgICAgICAgICBcIj5TaW1wYW4gUGVuZ2F0dXJhbjwvYnV0dG9uPlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgIDwvZGl2PlxuICAgIGA7XG5cbiAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKG1vZGFsKTtcblxuICAgIC8vIOKUgOKUgCBUYWIgU3dpdGNoaW5nIExvZ2ljIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuICAgIGNvbnN0IHRhYk5hdiA9IG1vZGFsLnF1ZXJ5U2VsZWN0b3IoJy5hdy10YWItbmF2Jyk7XG4gICAgY29uc3QgdGFiQnRucyA9IG1vZGFsLnF1ZXJ5U2VsZWN0b3JBbGwoJy5hdy10YWItYnRuJyk7XG4gICAgY29uc3QgdGFiUGFuZXMgPSBtb2RhbC5xdWVyeVNlbGVjdG9yQWxsKCcuYXctdGFiLXBhbmUnKTtcbiAgICB0YWJCdG5zLmZvckVhY2goYnRuID0+IHtcbiAgICAgICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgdGFyZ2V0SWQgPSBidG4uZGF0YXNldC50YWI7XG4gICAgICAgICAgICB0YWJCdG5zLmZvckVhY2goYiA9PiBiLmNsYXNzTGlzdC5yZW1vdmUoJ2FjdGl2ZScpKTtcbiAgICAgICAgICAgIHRhYlBhbmVzLmZvckVhY2gocCA9PiBwLmNsYXNzTGlzdC5yZW1vdmUoJ2FjdGl2ZScpKTtcbiAgICAgICAgICAgIGJ0bi5jbGFzc0xpc3QuYWRkKCdhY3RpdmUnKTtcbiAgICAgICAgICAgIGJ0bi5zY3JvbGxJbnRvVmlldyh7IGJlaGF2aW9yOiAnc21vb3RoJywgYmxvY2s6ICduZWFyZXN0JywgaW5saW5lOiAnY2VudGVyJyB9KTtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldFBhbmUgPSBtb2RhbC5xdWVyeVNlbGVjdG9yKGAjJHt0YXJnZXRJZH1gKTtcbiAgICAgICAgICAgIGlmICh0YXJnZXRQYW5lKSB0YXJnZXRQYW5lLmNsYXNzTGlzdC5hZGQoJ2FjdGl2ZScpO1xuICAgICAgICB9KTtcbiAgICB9KTtcblxuICAgIC8vIER1a3VuZ2FuIHNjcm9sbCBob3Jpem9udGFsIG1lbmdndW5ha2FuIG1vdXNlIHdoZWVsIGRpIGJhciB0YWJcbiAgICB0YWJOYXY/LmFkZEV2ZW50TGlzdGVuZXIoJ3doZWVsJywgZSA9PiB7XG4gICAgICAgIGlmIChlLmRlbHRhWSAhPT0gMCkge1xuICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgdGFiTmF2LnNjcm9sbExlZnQgKz0gZS5kZWx0YVk7XG4gICAgICAgIH1cbiAgICB9LCB7IHBhc3NpdmU6IGZhbHNlIH0pO1xuXG4gICAgLy8g4pSA4pSAIFVuaXZlcnNhbCBTZXR0aW5ncyBDb2xsZWN0b3IgJiBTYXZlciDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgICBsZXQgc3RhdHVzVGltZXIgPSBudWxsO1xuICAgIGZ1bmN0aW9uIGFwcGx5QW5kU2F2ZVNldHRpbmdzKGV4cGxpY2l0ID0gZmFsc2UpIHtcbiAgICAgICAgLy8gMS4gQmF0YXMgRW5lcmdpXG4gICAgICAgIGNvbnN0IHNsaWRlckVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldHRpbmctZW5lcmd5LXRocmVzaG9sZCcpO1xuICAgICAgICBjb25zdCBudW1FbCAgICA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5nLWVuZXJneS10aHJlc2hvbGQtbnVtJyk7XG4gICAgICAgIGNvbnN0IHNWYWwgPSBwYXJzZUludChzbGlkZXJFbD8udmFsdWUgPz8gJycsIDEwKTtcbiAgICAgICAgY29uc3QgblZhbCA9IHBhcnNlSW50KG51bUVsPy52YWx1ZSA/PyAnJywgMTApO1xuICAgICAgICBjb25zdCBjaG9zZW5UaHJlc2hvbGQgPSAhaXNOYU4oblZhbCkgJiYgblZhbCA+PSAxMCAmJiBuVmFsIDw9IDEwMCA/IG5WYWwgOiAoIWlzTmFOKHNWYWwpID8gc1ZhbCA6IENPTkZJRy5lbmVyZ3lUaHJlc2hvbGQpO1xuICAgICAgICBpZiAoY2hvc2VuVGhyZXNob2xkID49IDEwICYmIGNob3NlblRocmVzaG9sZCA8PSAxMDApIHtcbiAgICAgICAgICAgIENPTkZJRy5lbmVyZ3lUaHJlc2hvbGQgPSBjaG9zZW5UaHJlc2hvbGQ7XG4gICAgICAgICAgICBpZiAoc2xpZGVyRWwgJiYgc2xpZGVyRWwudmFsdWUgIT09IFN0cmluZyhjaG9zZW5UaHJlc2hvbGQpKSBzbGlkZXJFbC52YWx1ZSA9IGNob3NlblRocmVzaG9sZDtcbiAgICAgICAgICAgIGlmIChudW1FbCAmJiBudW1FbC52YWx1ZSAhPT0gU3RyaW5nKGNob3NlblRocmVzaG9sZCkpIG51bUVsLnZhbHVlID0gY2hvc2VuVGhyZXNob2xkO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gMi4gUXVpZXQgTW9kZVxuICAgICAgICBjb25zdCBxdWlldEVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldHRpbmctcXVpZXQtbW9kZScpO1xuICAgICAgICBpZiAocXVpZXRFbCkgQ09ORklHLnF1aWV0TW9kZUVuYWJsZWQgPSBxdWlldEVsLmNoZWNrZWQ7XG5cbiAgICAgICAgLy8gMy4gVGFtcGlsYW4gUGFuZWxcbiAgICAgICAgY29uc3QgZGFzaE9ubHlFbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5nLXBhbmVsLWRhc2hib2FyZC1vbmx5Jyk7XG4gICAgICAgIGlmIChkYXNoT25seUVsKSBDT05GSUcucGFuZWxEYXNoYm9hcmRPbmx5ID0gZGFzaE9ubHlFbC5jaGVja2VkO1xuICAgICAgICBjb25zdCBsZWFkZXJPbmx5RWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZy1wYW5lbC1sZWFkZXItb25seScpO1xuICAgICAgICBpZiAobGVhZGVyT25seUVsKSBDT05GSUcucGFuZWxMZWFkZXJPbmx5ID0gbGVhZGVyT25seUVsLmNoZWNrZWQ7XG4gICAgICAgIGNvbnN0IGZvbGxvd0VsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldHRpbmctZm9sbG93LXZpZXdwb3J0Jyk7XG4gICAgICAgIGlmIChmb2xsb3dFbCkgQ09ORklHLnBhbmVsRm9sbG93Vmlld3BvcnQgPSBmb2xsb3dFbC5jaGVja2VkO1xuICAgICAgICBjb25zdCByZXR1cm5FbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5nLXJldHVybi1vcmlnaW5hbCcpO1xuICAgICAgICBpZiAocmV0dXJuRWwpIENPTkZJRy5wYW5lbFJldHVyblRvT3JpZ2luYWwgPSByZXR1cm5FbC5jaGVja2VkO1xuXG4gICAgICAgIC8vIDQuIFN1YXJhIE5vdGlmaWthc2kgJiBWb2x1bWVcbiAgICAgICAgY29uc3Qgc291bmRFbmFibGVkRWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZy1zb3VuZC1ub3RpZmljYXRpb24tZW5hYmxlZCcpO1xuICAgICAgICBpZiAoc291bmRFbmFibGVkRWwpIENPTkZJRy5zb3VuZE5vdGlmaWNhdGlvbkVuYWJsZWQgPSBzb3VuZEVuYWJsZWRFbC5jaGVja2VkO1xuXG4gICAgICAgIGNvbnN0IHNvdW5kVm9sRWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZy1zb3VuZC1ub3RpZmljYXRpb24tdm9sdW1lJyk7XG4gICAgICAgIGlmIChzb3VuZFZvbEVsKSB7XG4gICAgICAgICAgICBjb25zdCB2b2wgPSBNYXRoLm1heCgwLCBNYXRoLm1pbigxMDAsIHBhcnNlSW50KHNvdW5kVm9sRWwudmFsdWUgfHwgJzMwJywgMTApKSk7XG4gICAgICAgICAgICBDT05GSUcuc291bmROb3RpZmljYXRpb25Wb2x1bWUgPSB2b2wgLyAxMDA7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBmdWxsU291bmRFbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5nLWVuZXJneS1mdWxsLXNvdW5kLWVuYWJsZWQnKTtcbiAgICAgICAgaWYgKGZ1bGxTb3VuZEVsKSBDT05GSUcuZW5lcmd5RnVsbEFsZXJ0U291bmRFbmFibGVkID0gZnVsbFNvdW5kRWwuY2hlY2tlZDtcblxuICAgICAgICBjb25zdCBmdWxsVm9sRWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZy1lbmVyZ3ktZnVsbC12b2x1bWUnKTtcbiAgICAgICAgaWYgKGZ1bGxWb2xFbCkge1xuICAgICAgICAgICAgY29uc3Qgdm9sID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oMTAwLCBwYXJzZUludChmdWxsVm9sRWwudmFsdWUgfHwgJzMwJywgMTApKSk7XG4gICAgICAgICAgICBDT05GSUcuZW5lcmd5RnVsbEFsZXJ0Vm9sdW1lID0gdm9sIC8gMTAwO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gNS4gQnJvd3NlciBOb3RpZmlrYXNpXG4gICAgICAgIGNvbnN0IG5vdGlmRWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZy1ub3RpZmljYXRpb25zJyk7XG4gICAgICAgIGlmIChub3RpZkVsKSBDT05GSUcuc2VuZE5vdGlmaWNhdGlvbiA9IG5vdGlmRWwuY2hlY2tlZDtcblxuICAgICAgICBjb25zdCBmdWxsQWxlcnRFbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5nLWVuZXJneS1mdWxsLWFsZXJ0Jyk7XG4gICAgICAgIGlmIChmdWxsQWxlcnRFbCkgQ09ORklHLmVuZXJneUZ1bGxBbGVydEVuYWJsZWQgPSBmdWxsQWxlcnRFbC5jaGVja2VkO1xuXG4gICAgICAgIC8vIDYuIFN0ZWFsdGggJiBKYW0gVGlkdXIgTWFsYW1cbiAgICAgICAgY29uc3Qgc3RlYWx0aEVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldHRpbmctc3RlYWx0aC1qaXR0ZXInKTtcbiAgICAgICAgaWYgKHN0ZWFsdGhFbCkgQ09ORklHLnN0ZWFsdGhKaXR0ZXJFbmFibGVkID0gc3RlYWx0aEVsLmNoZWNrZWQ7XG5cbiAgICAgICAgY29uc3Qgc2xlZXBFbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5nLXNsZWVwLXNjaGVkdWxlJyk7XG4gICAgICAgIGlmIChzbGVlcEVsKSBDT05GSUcuc2xlZXBTY2hlZHVsZUVuYWJsZWQgPSBzbGVlcEVsLmNoZWNrZWQ7XG5cbiAgICAgICAgY29uc3Qgc2xlZXBTdGFydEVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldHRpbmctc2xlZXAtc3RhcnQnKTtcbiAgICAgICAgaWYgKHNsZWVwU3RhcnRFbCkgQ09ORklHLnNsZWVwU3RhcnRIb3VyID0gcGFyc2VJbnQoc2xlZXBTdGFydEVsLnZhbHVlLCAxMCk7XG5cbiAgICAgICAgY29uc3Qgc2xlZXBFbmRFbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5nLXNsZWVwLWVuZCcpO1xuICAgICAgICBpZiAoc2xlZXBFbmRFbCkgQ09ORklHLnNsZWVwRW5kSG91ciA9IHBhcnNlSW50KHNsZWVwRW5kRWwudmFsdWUsIDEwKTtcblxuICAgICAgICAvLyA3LiBBdXRvIFJlLUxvZ2luXG4gICAgICAgIGNvbnN0IGF1dG9SZWxvZ2luRWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZy1hdXRvLXJlbG9naW4nKTtcbiAgICAgICAgaWYgKGF1dG9SZWxvZ2luRWwpIENPTkZJRy5hdXRvUmVsb2dpbkVuYWJsZWQgPSBhdXRvUmVsb2dpbkVsLmNoZWNrZWQ7XG5cbiAgICAgICAgY29uc3QgZWNvRWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZy1lY28tbW9kZScpO1xuICAgICAgICBpZiAoZWNvRWwpIENPTkZJRy5lY29Nb2RlRW5hYmxlZCA9IGVjb0VsLmNoZWNrZWQ7XG5cbiAgICAgICAgLy8gOC4gU2hvcnRjdXRzIChoYW55YSBkaXZhbGlkYXNpIHBhZGEgZXhwbGljaXQgc2F2ZSlcbiAgICAgICAgaWYgKGV4cGxpY2l0KSB7XG4gICAgICAgICAgICBjb25zdCBuZXdTaG9ydGN1dHMgPSB7fTtcbiAgICAgICAgICAgIHNob3J0Y3V0QWN0aW9ucy5mb3JFYWNoKGFjdGlvbiA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgaW5wICAgICA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGBzaG9ydGN1dC0ke2FjdGlvbi5pZH1gKTtcbiAgICAgICAgICAgICAgICBjb25zdCBkaXNwbGF5ID0gaW5wPy52YWx1ZS50cmltKCkgPz8gJyc7XG4gICAgICAgICAgICAgICAgY29uc3QgcGFydHMgICA9IGRpc3BsYXkuc3BsaXQoJysnKS5maWx0ZXIoQm9vbGVhbik7XG4gICAgICAgICAgICAgICAgY29uc3Qga2V5cyAgICA9IHBhcnRzLm1hcChwID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHAgPT09ICdDdHJsJykgIHJldHVybiAnQ29udHJvbCc7XG4gICAgICAgICAgICAgICAgICAgIGlmIChwID09PSAnU2hpZnQnKSByZXR1cm4gJ1NoaWZ0JztcbiAgICAgICAgICAgICAgICAgICAgaWYgKHAgPT09ICdBbHQnKSAgIHJldHVybiAnQWx0JztcbiAgICAgICAgICAgICAgICAgICAgaWYgKHAgPT09ICdTcGFjZScpIHJldHVybiAnU3BhY2UnO1xuICAgICAgICAgICAgICAgICAgICBpZiAocC5sZW5ndGggPT09IDEgJiYgL1tBLVpdLy50ZXN0KHApKSByZXR1cm4gYEtleSR7cH1gO1xuICAgICAgICAgICAgICAgICAgICBpZiAoL15cXGQkLy50ZXN0KHApKSByZXR1cm4gYERpZ2l0JHtwfWA7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBwO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIG5ld1Nob3J0Y3V0c1thY3Rpb24uaWRdID0geyBrZXlzLCBkaXNwbGF5IH07XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgY29uc3QgdmFsaWRhdGVkICAgPSBub3JtYWxpemVDb25maWcoeyBzaG9ydGN1dHM6IG5ld1Nob3J0Y3V0cyB9LCB0cnVlKTtcbiAgICAgICAgICAgIGNvbnN0IGhhc01vZGlmaWVyID0gT2JqZWN0LnZhbHVlcyhuZXdTaG9ydGN1dHMpLmV2ZXJ5KHMgPT4gcy5rZXlzLnNvbWUoayA9PiBrID09PSAnQ29udHJvbCcgfHwgayA9PT0gJ0FsdCcpKTtcbiAgICAgICAgICAgIGNvbnN0IGRpc3BsYXlzICAgID0gT2JqZWN0LnZhbHVlcyhuZXdTaG9ydGN1dHMpLm1hcChzID0+IHMuZGlzcGxheSk7XG4gICAgICAgICAgICBjb25zdCB1bmlxdWVLZXlzICA9IG5ldyBTZXQoZGlzcGxheXMpLnNpemUgPT09IGRpc3BsYXlzLmxlbmd0aDtcblxuICAgICAgICAgICAgaWYgKHZhbGlkYXRlZCAmJiBoYXNNb2RpZmllciAmJiB1bmlxdWVLZXlzKSB7XG4gICAgICAgICAgICAgICAgQ09ORklHLnNob3J0Y3V0cyA9IG5ld1Nob3J0Y3V0cztcbiAgICAgICAgICAgICAgICBjb25zdCBlcnJFbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaG9ydGN1dC1lcnJvcicpO1xuICAgICAgICAgICAgICAgIGlmIChlcnJFbCkgZXJyRWwuc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNpbXBhbiBrZSBjaHJvbWUuc3RvcmFnZS5sb2NhbFxuICAgICAgICBzYXZlQ29uZmlnKENPTkZJRyk7XG4gICAgICAgIGN0eC51cGRhdGVQYW5lbFZpc2liaWxpdHk/LihDT05GSUcpO1xuICAgICAgICBjdHgudXBkYXRlUGFuZWw/LigpO1xuXG4gICAgICAgIGNvbnN0IHN0YXR1c0VsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LXNldHRpbmdzLXN0YXR1cycpO1xuICAgICAgICBpZiAoc3RhdHVzRWwpIHtcbiAgICAgICAgICAgIGlmIChzdGF0dXNUaW1lcikgY2xlYXJUaW1lb3V0KHN0YXR1c1RpbWVyKTtcbiAgICAgICAgICAgIGlmIChleHBsaWNpdCkge1xuICAgICAgICAgICAgICAgIHN0YXR1c0VsLnRleHRDb250ZW50ID0gYFRlcnNpbXBhbiEgQmF0YXMgZW5lcmdpOiAke0NPTkZJRy5lbmVyZ3lUaHJlc2hvbGR9IEVOYDtcbiAgICAgICAgICAgICAgICBzdGF0dXNFbC5zdHlsZS5jb2xvciA9ICcjMDBmZjg4JztcbiAgICAgICAgICAgICAgICBzdGF0dXNFbC5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgc3RhdHVzRWwudGV4dENvbnRlbnQgPSBgRGlzaW1wYW4gb3RvbWF0aXMgKEJhdGFzOiAke0NPTkZJRy5lbmVyZ3lUaHJlc2hvbGR9IEVOKWA7XG4gICAgICAgICAgICAgICAgc3RhdHVzRWwuc3R5bGUuY29sb3IgPSAnIzAwZTk5YSc7XG4gICAgICAgICAgICAgICAgc3RhdHVzRWwuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG4gICAgICAgICAgICAgICAgc3RhdHVzVGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHsgaWYgKHN0YXR1c0VsKSBzdGF0dXNFbC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnOyB9LCAyNTAwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIOKUgOKUgCBEdWFsLXN5bmMgcmFuZ2Ug4oaUIG51bWJlciBjb250cm9scyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgICBmdW5jdGlvbiBzZXR1cER1YWxWb2x1bWVDb250cm9sKHNsaWRlcklkLCBudW1iZXJJZCkge1xuICAgICAgICBjb25zdCBzbGlkZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChzbGlkZXJJZCk7XG4gICAgICAgIGNvbnN0IG51bSAgICA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKG51bWJlcklkKTtcbiAgICAgICAgaWYgKCFzbGlkZXIgfHwgIW51bSkgcmV0dXJuO1xuICAgICAgICBjb25zdCBzeW5jQW5kU2F2ZSA9IChzb3VyY2VWYWwpID0+IHtcbiAgICAgICAgICAgIGxldCB2ID0gcGFyc2VJbnQoc291cmNlVmFsLCAxMCk7XG4gICAgICAgICAgICBpZiAoaXNOYU4odikgfHwgdiA8IDApIHYgPSAwO1xuICAgICAgICAgICAgaWYgKHYgPiAxMDApIHYgPSAxMDA7XG4gICAgICAgICAgICBzbGlkZXIudmFsdWUgPSB2O1xuICAgICAgICAgICAgbnVtLnZhbHVlID0gdjtcbiAgICAgICAgICAgIGFwcGx5QW5kU2F2ZVNldHRpbmdzKGZhbHNlKTtcbiAgICAgICAgfTtcbiAgICAgICAgc2xpZGVyLmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgZSA9PiBzeW5jQW5kU2F2ZShlLnRhcmdldC52YWx1ZSkpO1xuICAgICAgICBzbGlkZXIuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgZSA9PiBzeW5jQW5kU2F2ZShlLnRhcmdldC52YWx1ZSkpO1xuICAgICAgICBudW0uYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCBlID0+IHN5bmNBbmRTYXZlKGUudGFyZ2V0LnZhbHVlKSk7XG4gICAgICAgIG51bS5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBlID0+IHN5bmNBbmRTYXZlKGUudGFyZ2V0LnZhbHVlKSk7XG4gICAgICAgIG51bS5hZGRFdmVudExpc3RlbmVyKCdibHVyJywgZSA9PiBzeW5jQW5kU2F2ZShlLnRhcmdldC52YWx1ZSkpO1xuICAgIH1cbiAgICBzZXR1cER1YWxWb2x1bWVDb250cm9sKCdzZXR0aW5nLXNvdW5kLW5vdGlmaWNhdGlvbi12b2x1bWUnLCAgICAgJ3NldHRpbmctc291bmQtbm90aWZpY2F0aW9uLXZvbHVtZS1udW0nKTtcbiAgICBzZXR1cER1YWxWb2x1bWVDb250cm9sKCdzZXR0aW5nLWVuZXJneS1mdWxsLXZvbHVtZScsICAgICAgICAgICAgJ3NldHRpbmctZW5lcmd5LWZ1bGwtdm9sdW1lLW51bScpO1xuXG4gICAgLy8gRHVhbC1zeW5jIHVudHVrIHRocmVzaG9sZCBlbmVyZ2lcbiAgICBjb25zdCB0aHJlc2hvbGRTbGlkZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZy1lbmVyZ3ktdGhyZXNob2xkJyk7XG4gICAgY29uc3QgdGhyZXNob2xkTnVtICAgID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldHRpbmctZW5lcmd5LXRocmVzaG9sZC1udW0nKTtcbiAgICBpZiAodGhyZXNob2xkU2xpZGVyICYmIHRocmVzaG9sZE51bSkge1xuICAgICAgICBjb25zdCBzeW5jVGhyZXNob2xkID0gKHZhbCkgPT4ge1xuICAgICAgICAgICAgbGV0IHYgPSBwYXJzZUludCh2YWwsIDEwKTtcbiAgICAgICAgICAgIGlmIChpc05hTih2KSB8fCB2IDwgMTApIHYgPSAxMDtcbiAgICAgICAgICAgIGlmICh2ID4gMTAwKSB2ID0gMTAwO1xuICAgICAgICAgICAgdGhyZXNob2xkU2xpZGVyLnZhbHVlID0gdjtcbiAgICAgICAgICAgIHRocmVzaG9sZE51bS52YWx1ZSA9IHY7XG4gICAgICAgICAgICBhcHBseUFuZFNhdmVTZXR0aW5ncyhmYWxzZSk7XG4gICAgICAgIH07XG4gICAgICAgIHRocmVzaG9sZFNsaWRlci5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIGUgPT4gc3luY1RocmVzaG9sZChlLnRhcmdldC52YWx1ZSkpO1xuICAgICAgICB0aHJlc2hvbGRTbGlkZXIuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgZSA9PiBzeW5jVGhyZXNob2xkKGUudGFyZ2V0LnZhbHVlKSk7XG4gICAgICAgIHRocmVzaG9sZE51bS5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIGUgPT4gc3luY1RocmVzaG9sZChlLnRhcmdldC52YWx1ZSkpO1xuICAgICAgICB0aHJlc2hvbGROdW0uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgZSA9PiBzeW5jVGhyZXNob2xkKGUudGFyZ2V0LnZhbHVlKSk7XG4gICAgICAgIHRocmVzaG9sZE51bS5hZGRFdmVudExpc3RlbmVyKCdibHVyJywgZSA9PiBzeW5jVGhyZXNob2xkKGUudGFyZ2V0LnZhbHVlKSk7XG4gICAgfVxuXG4gICAgLy8gUXVpY2sgUHJlc2V0IGJ1dHRvbnMgaGFuZGxlclxuICAgIG1vZGFsLnF1ZXJ5U2VsZWN0b3JBbGwoJy5hdy1wcmVzZXQtYnRuJykuZm9yRWFjaChidG4gPT4ge1xuICAgICAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCB2YWwgPSBwYXJzZUludChidG4uZGF0YXNldC52YWwsIDEwKTtcbiAgICAgICAgICAgIGlmICghaXNOYU4odmFsKSkge1xuICAgICAgICAgICAgICAgIGlmICh0aHJlc2hvbGRTbGlkZXIpIHRocmVzaG9sZFNsaWRlci52YWx1ZSA9IHZhbDtcbiAgICAgICAgICAgICAgICBpZiAodGhyZXNob2xkTnVtKSB0aHJlc2hvbGROdW0udmFsdWUgPSB2YWw7XG4gICAgICAgICAgICAgICAgYXBwbHlBbmRTYXZlU2V0dGluZ3MoZmFsc2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9KTtcblxuICAgIC8vIEF1dG8tc2F2ZSBvbiBhbGwgc3dpdGNoZXMgJiBzZWxlY3RzXG4gICAgW1xuICAgICAgICAnc2V0dGluZy1xdWlldC1tb2RlJyxcbiAgICAgICAgJ3NldHRpbmctcGFuZWwtZGFzaGJvYXJkLW9ubHknLFxuICAgICAgICAnc2V0dGluZy1wYW5lbC1sZWFkZXItb25seScsXG4gICAgICAgICdzZXR0aW5nLWZvbGxvdy12aWV3cG9ydCcsXG4gICAgICAgICdzZXR0aW5nLXJldHVybi1vcmlnaW5hbCcsXG4gICAgICAgICdzZXR0aW5nLXNvdW5kLW5vdGlmaWNhdGlvbi1lbmFibGVkJyxcbiAgICAgICAgJ3NldHRpbmctZW5lcmd5LWZ1bGwtc291bmQtZW5hYmxlZCcsXG4gICAgICAgICdzZXR0aW5nLW5vdGlmaWNhdGlvbnMnLFxuICAgICAgICAnc2V0dGluZy1lbmVyZ3ktZnVsbC1hbGVydCcsXG4gICAgICAgICdzZXR0aW5nLXN0ZWFsdGgtaml0dGVyJyxcbiAgICAgICAgJ3NldHRpbmctc2xlZXAtc2NoZWR1bGUnLFxuICAgICAgICAnc2V0dGluZy1zbGVlcC1zdGFydCcsXG4gICAgICAgICdzZXR0aW5nLXNsZWVwLWVuZCcsXG4gICAgICAgICdzZXR0aW5nLWF1dG8tcmVsb2dpbicsXG4gICAgICAgICdzZXR0aW5nLWVjby1tb2RlJ1xuICAgIF0uZm9yRWFjaChpZCA9PiB7XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGlkKT8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKCkgPT4gYXBwbHlBbmRTYXZlU2V0dGluZ3MoZmFsc2UpKTtcbiAgICB9KTtcblxuICAgIC8vIOKUgOKUgCBBdXRvIFJlLUxvZ2luIENyZWRlbnRpYWxzIE1hbmFnZW1lbnQg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gICAgY29uc3QgcHdkSW5wdXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZy1sb2dpbi1wd2QnKTtcbiAgICBjb25zdCB0b2dnbGVQd2RCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctdG9nZ2xlLXB3ZC12aXMnKTtcbiAgICB0b2dnbGVQd2RCdG4/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICBpZiAoIXB3ZElucHV0KSByZXR1cm47XG4gICAgICAgIGlmIChwd2RJbnB1dC50eXBlID09PSAncGFzc3dvcmQnKSB7XG4gICAgICAgICAgICBwd2RJbnB1dC50eXBlID0gJ3RleHQnO1xuICAgICAgICAgICAgdG9nZ2xlUHdkQnRuLnRleHRDb250ZW50ID0gJ1NlbWJ1bnlpa2FuJztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHB3ZElucHV0LnR5cGUgPSAncGFzc3dvcmQnO1xuICAgICAgICAgICAgdG9nZ2xlUHdkQnRuLnRleHRDb250ZW50ID0gJ0xpaGF0JztcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgY29uc3Qgc2F2ZUNyZWRzQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LXNhdmUtbG9naW4tY3JlZHMnKTtcbiAgICBjb25zdCBjbGVhckNyZWRzQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LWNsZWFyLWxvZ2luLWNyZWRzJyk7XG4gICAgY29uc3QgY3JlZHNNc2cgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctbG9naW4tY3JlZHMtbXNnJyk7XG4gICAgY29uc3QgZW1haWxJbnAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZy1sb2dpbi1lbWFpbCcpO1xuXG4gICAgc2F2ZUNyZWRzQnRuPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgY29uc3QgZW1haWwgPSBlbWFpbElucD8udmFsdWUudHJpbSgpIHx8ICcnO1xuICAgICAgICBjb25zdCBwd2QgPSBwd2RJbnB1dD8udmFsdWUgfHwgJyc7XG4gICAgICAgIGlmICghZW1haWwgfHwgIXB3ZCkge1xuICAgICAgICAgICAgaWYgKGNyZWRzTXNnKSB7XG4gICAgICAgICAgICAgICAgY3JlZHNNc2cudGV4dENvbnRlbnQgPSAnSGFyYXAgaXNpIGVtYWlsIGRhbiBrYXRhIHNhbmRpISc7XG4gICAgICAgICAgICAgICAgY3JlZHNNc2cuc3R5bGUuY29sb3IgPSAnI2ZmNmI2Yic7XG4gICAgICAgICAgICAgICAgY3JlZHNNc2cuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgc2F2ZUNyZWRlbnRpYWxzKGVtYWlsLCBwd2QpO1xuICAgICAgICBDT05GSUcuYXV0b1JlbG9naW5FbmFibGVkID0gdHJ1ZTtcbiAgICAgICAgY29uc3QgY2hrID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldHRpbmctYXV0by1yZWxvZ2luJyk7XG4gICAgICAgIGlmIChjaGspIGNoay5jaGVja2VkID0gdHJ1ZTtcbiAgICAgICAgc2F2ZUNvbmZpZyhDT05GSUcpO1xuICAgICAgICBpZiAoY3JlZHNNc2cpIHtcbiAgICAgICAgICAgIGNyZWRzTXNnLnRleHRDb250ZW50ID0gYEtyZWRlbnNpYWwgdW50dWsgJHtlbWFpbH0gdGVyc2ltcGFuISBBdXRvIFJlLUxvZ2luIEFLVElGLmA7XG4gICAgICAgICAgICBjcmVkc01zZy5zdHlsZS5jb2xvciA9ICcjMDBmZjg4JztcbiAgICAgICAgICAgIGNyZWRzTXNnLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuICAgICAgICB9XG4gICAgICAgIGN0eC5sb2c/LignS3JlZGVuc2lhbCBBdXRvIFJlLUxvZ2luIGJlcmhhc2lsIGRpc2ltcGFuLicsICdzdWNjZXNzJyk7XG4gICAgfSk7XG5cbiAgICBjbGVhckNyZWRzQnRuPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgY2xlYXJDcmVkZW50aWFscygpO1xuICAgICAgICBpZiAoZW1haWxJbnApIGVtYWlsSW5wLnZhbHVlID0gJyc7XG4gICAgICAgIGlmIChwd2RJbnB1dCkgcHdkSW5wdXQudmFsdWUgPSAnJztcbiAgICAgICAgQ09ORklHLmF1dG9SZWxvZ2luRW5hYmxlZCA9IGZhbHNlO1xuICAgICAgICBjb25zdCBjaGsgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZy1hdXRvLXJlbG9naW4nKTtcbiAgICAgICAgaWYgKGNoaykgY2hrLmNoZWNrZWQgPSBmYWxzZTtcbiAgICAgICAgc2F2ZUNvbmZpZyhDT05GSUcpO1xuICAgICAgICBpZiAoY3JlZHNNc2cpIHtcbiAgICAgICAgICAgIGNyZWRzTXNnLnRleHRDb250ZW50ID0gJ0tyZWRlbnNpYWwgdGVsYWggZGloYXB1cyBkYXJpIGJyb3dzZXIuJztcbiAgICAgICAgICAgIGNyZWRzTXNnLnN0eWxlLmNvbG9yID0gJyNmZmFhMDAnO1xuICAgICAgICAgICAgY3JlZHNNc2cuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG4gICAgICAgIH1cbiAgICAgICAgY3R4LmxvZz8uKCdLcmVkZW5zaWFsIEF1dG8gUmUtTG9naW4gZGloYXB1cy4nLCAnaW5mbycpO1xuICAgIH0pO1xuXG4gICAgLy8g4pSA4pSAIEtleWJvYXJkIHNob3J0Y3V0IHJlY29yZGluZyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgICBjb25zdCByZWNvcmRpbmdTdGF0ZSA9IHt9O1xuICAgIHNob3J0Y3V0QWN0aW9ucy5mb3JFYWNoKGFjdGlvbiA9PiB7XG4gICAgICAgIGNvbnN0IGJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGByZWNvcmQtJHthY3Rpb24uaWR9YCk7XG4gICAgICAgIGNvbnN0IGlucCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGBzaG9ydGN1dC0ke2FjdGlvbi5pZH1gKTtcbiAgICAgICAgaWYgKGJ0biAmJiBpbnApIHtcbiAgICAgICAgICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgICAgICAgICByZWNvcmRpbmdTdGF0ZVthY3Rpb24uaWRdID0geyBrZXlzOiBbXSwgcmVjb3JkaW5nOiB0cnVlIH07XG4gICAgICAgICAgICAgICAgYnRuLnRleHRDb250ZW50ID0gJ1Rla2FuIHRvbWJvbC4uLic7XG4gICAgICAgICAgICAgICAgYnRuLnN0eWxlLmJhY2tncm91bmQgPSAnIzAyODRjNyc7XG4gICAgICAgICAgICAgICAgaW5wLnZhbHVlID0gJ01lbnVuZ2d1IGlucHV0Li4uJztcbiAgICAgICAgICAgICAgICBpbnAuc3R5bGUuY29sb3IgPSAnIzM4YmRmOCc7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgY29uc3QgcmVjb3JkSGFuZGxlciA9IGUgPT4ge1xuICAgICAgICBpZiAoZS50eXBlICE9PSAna2V5ZG93bicpIHJldHVybjtcbiAgICAgICAgbGV0IGhhbmRsZWQgPSBmYWxzZTtcbiAgICAgICAgc2hvcnRjdXRBY3Rpb25zLmZvckVhY2goYWN0aW9uID0+IHtcbiAgICAgICAgICAgIGlmICghcmVjb3JkaW5nU3RhdGVbYWN0aW9uLmlkXT8ucmVjb3JkaW5nKSByZXR1cm47XG4gICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7IGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICBjb25zdCByZWMgPSByZWNvcmRpbmdTdGF0ZVthY3Rpb24uaWRdO1xuICAgICAgICAgICAgY29uc3QgYnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoYHJlY29yZC0ke2FjdGlvbi5pZH1gKTtcbiAgICAgICAgICAgIGNvbnN0IGlucCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGBzaG9ydGN1dC0ke2FjdGlvbi5pZH1gKTtcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IGUuY29kZTtcblxuICAgICAgICAgICAgaWYgKGtleSA9PT0gJ0VzY2FwZScpIHtcbiAgICAgICAgICAgICAgICByZWMucmVjb3JkaW5nID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgaWYgKGlucCkgaW5wLnZhbHVlID0gQ09ORklHLnNob3J0Y3V0c1thY3Rpb24uaWRdPy5kaXNwbGF5ID8/ICcnO1xuICAgICAgICAgICAgICAgIGlmIChidG4pIHsgYnRuLnRleHRDb250ZW50ID0gJ1Jla2FtJzsgYnRuLnN0eWxlLmJhY2tncm91bmQgPSAnIzI1MmM0MCc7IH1cbiAgICAgICAgICAgICAgICBoYW5kbGVkID0gdHJ1ZTsgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGtleSA9PT0gJ0VudGVyJykge1xuICAgICAgICAgICAgICAgIGlmIChyZWMua2V5cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlYy5yZWNvcmRpbmcgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGJ0bikge1xuICAgICAgICAgICAgICAgICAgICAgICAgYnRuLnRleHRDb250ZW50ID0gJ1NlbGVzYWknOyBidG4uc3R5bGUuYmFja2dyb3VuZCA9ICcjMDBmZjg4JzsgYnRuLnN0eWxlLmNvbG9yID0gJyMwMDAnO1xuICAgICAgICAgICAgICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7IGJ0bi50ZXh0Q29udGVudCA9ICdSZWthbSc7IGJ0bi5zdHlsZS5iYWNrZ3JvdW5kID0gJyMyNTJjNDAnOyBidG4uc3R5bGUuY29sb3IgPSAnI2ZmZic7IH0sIDE1MDApO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGhhbmRsZWQgPSB0cnVlOyByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZS5yZXBlYXQpIHsgaGFuZGxlZCA9IHRydWU7IHJldHVybjsgfVxuICAgICAgICAgICAgaWYgKCFyZWMua2V5cy5pbmNsdWRlcyhrZXkpKSByZWMua2V5cy5wdXNoKGtleSk7XG4gICAgICAgICAgICBjb25zdCBkaXNwbGF5ID0gcmVjLmtleXMubWFwKGsgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChrID09PSAnQ29udHJvbExlZnQnIHx8IGsgPT09ICdDb250cm9sUmlnaHQnKSByZXR1cm4gJ0N0cmwnO1xuICAgICAgICAgICAgICAgIGlmIChrID09PSAnU2hpZnRMZWZ0JyAgIHx8IGsgPT09ICdTaGlmdFJpZ2h0JykgICByZXR1cm4gJ1NoaWZ0JztcbiAgICAgICAgICAgICAgICBpZiAoayA9PT0gJ0FsdExlZnQnICAgICB8fCBrID09PSAnQWx0UmlnaHQnKSAgICAgcmV0dXJuICdBbHQnO1xuICAgICAgICAgICAgICAgIGlmIChrLnN0YXJ0c1dpdGgoJ0tleScpKSAgIHJldHVybiBrLnJlcGxhY2UoJ0tleScsICcnKTtcbiAgICAgICAgICAgICAgICBpZiAoay5zdGFydHNXaXRoKCdEaWdpdCcpKSByZXR1cm4gay5yZXBsYWNlKCdEaWdpdCcsICcnKTtcbiAgICAgICAgICAgICAgICBpZiAoayA9PT0gJ1NwYWNlJykgcmV0dXJuICdTcGFjZSc7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGs7XG4gICAgICAgICAgICB9KS5qb2luKCcrJyk7XG4gICAgICAgICAgICBpZiAoaW5wKSB7IGlucC52YWx1ZSA9IGRpc3BsYXk7IGlucC5zdHlsZS5jb2xvciA9ICcjMDBmZjg4JzsgfVxuICAgICAgICAgICAgaWYgKHJlYy5rZXlzLmxlbmd0aCA+PSAzKSB7XG4gICAgICAgICAgICAgICAgcmVjLnJlY29yZGluZyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIGlmIChidG4pIHtcbiAgICAgICAgICAgICAgICAgICAgYnRuLnRleHRDb250ZW50ID0gJ1NlbGVzYWknOyBidG4uc3R5bGUuYmFja2dyb3VuZCA9ICcjMDBmZjg4JzsgYnRuLnN0eWxlLmNvbG9yID0gJyMwMDAnO1xuICAgICAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHsgYnRuLnRleHRDb250ZW50ID0gJ1Jla2FtJzsgYnRuLnN0eWxlLmJhY2tncm91bmQgPSAnIzI1MmM0MCc7IGJ0bi5zdHlsZS5jb2xvciA9ICcjZmZmJzsgfSwgMTUwMCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaGFuZGxlZCA9IHRydWU7XG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoaGFuZGxlZCkgcmV0dXJuIGZhbHNlO1xuICAgIH07XG5cbiAgICAvLyDilIDilIAgTW9kYWwgb3Blbi9jbG9zZSDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgICBmdW5jdGlvbiBoYW5kbGVFc2NhcGVLZXkoZSkge1xuICAgICAgICBpZiAoZS5rZXkgPT09ICdFc2NhcGUnICYmIG1vZGFsLnN0eWxlLmRpc3BsYXkgPT09ICdmbGV4JykgY2xvc2VNb2RhbCh0cnVlKTtcbiAgICB9XG4gICAgZnVuY3Rpb24gY2xvc2VNb2RhbChzYXZlT25DbG9zZSA9IHRydWUpIHtcbiAgICAgICAgaWYgKHNhdmVPbkNsb3NlKSBhcHBseUFuZFNhdmVTZXR0aW5ncyhmYWxzZSk7XG4gICAgICAgIG1vZGFsLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgICAgIGlmIChjdHguc3RhdGUpIGN0eC5zdGF0ZS5zZXR0aW5nc09wZW4gPSBmYWxzZTtcbiAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHJlY29yZEhhbmRsZXIsIHRydWUpO1xuICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXlkb3duJywgaGFuZGxlRXNjYXBlS2V5KTtcbiAgICB9XG4gICAgbW9kYWwuY2xvc2VNb2RhbFNhZmVseSA9IGNsb3NlTW9kYWw7XG4gICAgbW9kYWwucmVjb3JkSGFuZGxlciAgICA9IHJlY29yZEhhbmRsZXI7XG4gICAgbW9kYWwuaGFuZGxlRXNjYXBlS2V5ICA9IGhhbmRsZUVzY2FwZUtleTtcblxuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1jbG9zZS1zZXR0aW5ncycpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IGNsb3NlTW9kYWwodHJ1ZSkpO1xuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1jYW5jZWwtc2V0dGluZ3MnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIC8vIEJhdGFsOiByZXNldCBpbnB1dCB0YW1waWxhbiBkYXJpIENPTkZJRyBkYW4gdHV0dXAgdGFucGEgbWVueWltcGFuXG4gICAgICAgIG9wZW5TZXR0aW5ncyhDT05GSUcsIGN0eCk7XG4gICAgICAgIGNsb3NlTW9kYWwoZmFsc2UpO1xuICAgIH0pO1xuICAgIG1vZGFsLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZSA9PiB7IGlmIChlLnRhcmdldCA9PT0gbW9kYWwpIGNsb3NlTW9kYWwodHJ1ZSk7IH0pO1xuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBoYW5kbGVFc2NhcGVLZXkpO1xuXG4gICAgLy8g4pSA4pSAIEJ1dHRvbiBoYW5kbGVycyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctdGVzdC1ub3RpZmljYXRpb24tc291bmQnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHZvbFZhbCA9IHBhcnNlSW50KGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5nLXNvdW5kLW5vdGlmaWNhdGlvbi12b2x1bWUnKT8udmFsdWUgPz8gJzcwJywgMTApO1xuICAgICAgICBjb25zdCB0ZXN0Vm9sID0gaXNOYU4odm9sVmFsKSA/IDAuNyA6IE1hdGgubWF4KDAsIE1hdGgubWluKDEwMCwgdm9sVmFsKSkgLyAxMDA7XG4gICAgICAgIGN0eC5zZW5kTm90aWZpY2F0aW9uPy4oJ1BhcmxhbWVudHVtIEF1dG8gV29ya2VyJywgJ1RlcyBub3RpZmlrYXNpIHN1YXJhIGJlcmhhc2lsLicpO1xuICAgICAgICBjdHgucGxheU5vdGlmaWNhdGlvblNvdW5kPy4oeyBzb3VuZE5vdGlmaWNhdGlvbkVuYWJsZWQ6IHRydWUsIHNvdW5kTm90aWZpY2F0aW9uVm9sdW1lOiB0ZXN0Vm9sIH0sICdzdWNjZXNzJyk7XG4gICAgfSk7XG5cbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctcmVzZXQtcG9zaXRpb24nKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGlmICghY3R4LnN0YXRlKSByZXR1cm47XG4gICAgICAgIGN0eC5zdGF0ZS5wYW5lbFggPSBDT05GSUcucGFuZWxEZWZhdWx0WDtcbiAgICAgICAgY3R4LnN0YXRlLnBhbmVsWSA9IENPTkZJRy5wYW5lbERlZmF1bHRZO1xuICAgICAgICBjb25zdCBwYW5lbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1wYW5lbCcpO1xuICAgICAgICBpZiAocGFuZWwpIHsgcGFuZWwuc3R5bGUubGVmdCA9IGN0eC5zdGF0ZS5wYW5lbFggKyAncHgnOyBwYW5lbC5zdHlsZS50b3AgPSBjdHguc3RhdGUucGFuZWxZICsgJ3B4JzsgfVxuICAgICAgICBzZXRWYWx1ZSgncGFuZWxYJywgY3R4LnN0YXRlLnBhbmVsWC50b1N0cmluZygpKTtcbiAgICAgICAgc2V0VmFsdWUoJ3BhbmVsWScsIGN0eC5zdGF0ZS5wYW5lbFkudG9TdHJpbmcoKSk7XG4gICAgICAgIGN0eC5sb2c/LignUG9zaXNpIHBhbmVsIGJlcmhhc2lsIGRpLXJlc2V0IGtlIGRlZmF1bHQnLCAnc3VjY2VzcycpO1xuICAgICAgICBjb25zdCBzdGF0dXNFbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1zZXR0aW5ncy1zdGF0dXMnKTtcbiAgICAgICAgaWYgKHN0YXR1c0VsKSB7XG4gICAgICAgICAgICBzdGF0dXNFbC50ZXh0Q29udGVudCA9ICdQb3Npc2kgcGFuZWwgZGktcmVzZXQga2UgZGVmYXVsdCc7XG4gICAgICAgICAgICBzdGF0dXNFbC5zdHlsZS5jb2xvciA9ICcjMDA4OGZmJztcbiAgICAgICAgICAgIHN0YXR1c0VsLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7IGlmIChzdGF0dXNFbCkgc3RhdHVzRWwuc3R5bGUuZGlzcGxheSA9ICdub25lJzsgfSwgMjUwMCk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1yZXN0b3JlLWRlZmF1bHRzJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICBpZiAoIWNvbmZpcm0oJ1lha2luIGluZ2luIG1lbmdlbWJhbGlrYW4gU0VNVUEgcGVuZ2F0dXJhbiBrZSBkZWZhdWx0P1xcblxcbkluaSBha2FuOlxcbi0gUmVzZXQga2V5Ym9hcmQgc2hvcnRjdXRzXFxuLSBSZXNldCBiYXRhcyBlbmVyZ2kga2UgMTAgRU5cXG4tIFJlc2V0IHNlbXVhIHByZWZlcmVuc2lcXG4tIFJlc2V0IHBvc2lzaSBwYW5lbFxcblxcbktvbmZpZ3VyYXNpIHlhbmcgdGVyc2ltcGFuIGFrYW4gZGloYXB1cy4nKSkgcmV0dXJuO1xuICAgICAgICBzZXRWYWx1ZSgnYXdfY29uZmlnJywgbnVsbCk7XG4gICAgICAgIHNldFZhbHVlKCdwYW5lbFgnLCAoQ09ORklHLnBhbmVsRGVmYXVsdFggPz8gMjApLnRvU3RyaW5nKCkpO1xuICAgICAgICBzZXRWYWx1ZSgncGFuZWxZJywgKENPTkZJRy5wYW5lbERlZmF1bHRZID8/IDIwKS50b1N0cmluZygpKTtcbiAgICAgICAgY3R4LmxvZz8uKCdTZW11YSBwZW5nYXR1cmFuIGJlcmhhc2lsIGRpLXJlc2V0IGtlIGRlZmF1bHQhIFJlZnJlc2ggaGFsYW1hbiB1bnR1ayBtZW5lcmFwa2FuLicsICdzdWNjZXNzJyk7XG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgaWYgKGNvbmZpcm0oJ1BlbmdhdHVyYW4gc3VkYWggZGktcmVzZXQuIFJlZnJlc2ggaGFsYW1hbiBzZWthcmFuZz8nKSkgbG9jYXRpb24ucmVsb2FkKCk7XG4gICAgICAgIH0sIDUwMCk7XG4gICAgfSk7XG5cbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctc2F2ZS1zZXR0aW5ncycpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgYXBwbHlBbmRTYXZlU2V0dGluZ3ModHJ1ZSk7XG5cbiAgICAgICAgaWYgKENPTkZJRy5zZW5kTm90aWZpY2F0aW9uICYmICdOb3RpZmljYXRpb24nIGluIHdpbmRvdyAmJiBOb3RpZmljYXRpb24ucGVybWlzc2lvbiA9PT0gJ2RlZmF1bHQnKSB7XG4gICAgICAgICAgICBOb3RpZmljYXRpb24ucmVxdWVzdFBlcm1pc3Npb24oKS5jYXRjaCgoKSA9PiB7fSk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBoaWRlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LWhpZGUnKTtcbiAgICAgICAgaWYgKGhpZGVCdG4pIGhpZGVCdG4udGl0bGUgPSBgSGlkZSAoJHtDT05GSUcuc2hvcnRjdXRzLnNob3dIaWRlPy5kaXNwbGF5ID8/ICcnfSlgO1xuXG4gICAgICAgIGN0eC5sb2c/LihgUGVuZ2F0dXJhbiBkaXNpbXBhbiEgQmF0YXMgZW5lcmdpIHNlYmVsdW0ga2VyamE6ICR7Q09ORklHLmVuZXJneVRocmVzaG9sZH0gRU5gLCAnc3VjY2VzcycpO1xuICAgICAgICBjdHgucGxheU5vdGlmaWNhdGlvblNvdW5kPy4oJ3N1Y2Nlc3MnKTtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiBjbG9zZU1vZGFsKGZhbHNlKSwgNzAwKTtcbiAgICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG9wZW5TZXR0aW5ncyhDT05GSUcsIGN0eCkge1xuICAgIGNvbnN0IG1vZGFsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LXNldHRpbmdzLW1vZGFsJyk7XG4gICAgaWYgKCFtb2RhbCkgcmV0dXJuO1xuXG4gICAgLy8gU2lua3JvbmthbiBzZWx1cnVoIGlucHV0IERPTSBkYXJpIENPTkZJRyBha3RpZlxuICAgIGNvbnN0IHRocmVzaG9sZFNsaWRlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5nLWVuZXJneS10aHJlc2hvbGQnKTtcbiAgICBjb25zdCB0aHJlc2hvbGROdW0gICAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZy1lbmVyZ3ktdGhyZXNob2xkLW51bScpO1xuICAgIGlmICh0aHJlc2hvbGRTbGlkZXIpIHRocmVzaG9sZFNsaWRlci52YWx1ZSA9IENPTkZJRy5lbmVyZ3lUaHJlc2hvbGQ7XG4gICAgaWYgKHRocmVzaG9sZE51bSkgICAgdGhyZXNob2xkTnVtLnZhbHVlICAgID0gQ09ORklHLmVuZXJneVRocmVzaG9sZDtcblxuICAgIGNvbnN0IHF1aWV0Q2IgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZy1xdWlldC1tb2RlJyk7XG4gICAgaWYgKHF1aWV0Q2IpIHF1aWV0Q2IuY2hlY2tlZCA9IEJvb2xlYW4oQ09ORklHLnF1aWV0TW9kZUVuYWJsZWQpO1xuXG4gICAgY29uc3QgZGFzaENiID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldHRpbmctcGFuZWwtZGFzaGJvYXJkLW9ubHknKTtcbiAgICBpZiAoZGFzaENiKSBkYXNoQ2IuY2hlY2tlZCA9IEJvb2xlYW4oQ09ORklHLnBhbmVsRGFzaGJvYXJkT25seSk7XG5cbiAgICBjb25zdCBsZWFkZXJDYiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5nLXBhbmVsLWxlYWRlci1vbmx5Jyk7XG4gICAgaWYgKGxlYWRlckNiKSBsZWFkZXJDYi5jaGVja2VkID0gQm9vbGVhbihDT05GSUcucGFuZWxMZWFkZXJPbmx5KTtcblxuICAgIGNvbnN0IGZvbGxvd0NiID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldHRpbmctZm9sbG93LXZpZXdwb3J0Jyk7XG4gICAgaWYgKGZvbGxvd0NiKSBmb2xsb3dDYi5jaGVja2VkID0gQm9vbGVhbihDT05GSUcucGFuZWxGb2xsb3dWaWV3cG9ydCk7XG5cbiAgICBjb25zdCByZXR1cm5DYiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5nLXJldHVybi1vcmlnaW5hbCcpO1xuICAgIGlmIChyZXR1cm5DYikgcmV0dXJuQ2IuY2hlY2tlZCA9IEJvb2xlYW4oQ09ORklHLnBhbmVsUmV0dXJuVG9PcmlnaW5hbCk7XG5cbiAgICBjb25zdCBzb3VuZENiID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldHRpbmctc291bmQtbm90aWZpY2F0aW9uLWVuYWJsZWQnKTtcbiAgICBpZiAoc291bmRDYikgc291bmRDYi5jaGVja2VkID0gQm9vbGVhbihDT05GSUcuc291bmROb3RpZmljYXRpb25FbmFibGVkKTtcblxuICAgIGNvbnN0IHNvdW5kVm9sU2xpZGVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldHRpbmctc291bmQtbm90aWZpY2F0aW9uLXZvbHVtZScpO1xuICAgIGNvbnN0IHNvdW5kVm9sTnVtICAgID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldHRpbmctc291bmQtbm90aWZpY2F0aW9uLXZvbHVtZS1udW0nKTtcbiAgICBpZiAoc291bmRWb2xTbGlkZXIpIHNvdW5kVm9sU2xpZGVyLnZhbHVlID0gTWF0aC5yb3VuZChDT05GSUcuc291bmROb3RpZmljYXRpb25Wb2x1bWUgKiAxMDApO1xuICAgIGlmIChzb3VuZFZvbE51bSkgICAgc291bmRWb2xOdW0udmFsdWUgICAgPSBNYXRoLnJvdW5kKENPTkZJRy5zb3VuZE5vdGlmaWNhdGlvblZvbHVtZSAqIDEwMCk7XG5cbiAgICBjb25zdCBmdWxsU291bmRDYiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5nLWVuZXJneS1mdWxsLXNvdW5kLWVuYWJsZWQnKTtcbiAgICBpZiAoZnVsbFNvdW5kQ2IpIGZ1bGxTb3VuZENiLmNoZWNrZWQgPSBCb29sZWFuKENPTkZJRy5lbmVyZ3lGdWxsQWxlcnRTb3VuZEVuYWJsZWQpO1xuXG4gICAgY29uc3QgZnVsbFZvbFNsaWRlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5nLWVuZXJneS1mdWxsLXZvbHVtZScpO1xuICAgIGNvbnN0IGZ1bGxWb2xOdW0gICAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZy1lbmVyZ3ktZnVsbC12b2x1bWUtbnVtJyk7XG4gICAgaWYgKGZ1bGxWb2xTbGlkZXIpIGZ1bGxWb2xTbGlkZXIudmFsdWUgPSBNYXRoLnJvdW5kKENPTkZJRy5lbmVyZ3lGdWxsQWxlcnRWb2x1bWUgKiAxMDApO1xuICAgIGlmIChmdWxsVm9sTnVtKSAgICBmdWxsVm9sTnVtLnZhbHVlICAgID0gTWF0aC5yb3VuZChDT05GSUcuZW5lcmd5RnVsbEFsZXJ0Vm9sdW1lICogMTAwKTtcblxuICAgIGNvbnN0IG5vdGlmQ2IgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZy1ub3RpZmljYXRpb25zJyk7XG4gICAgaWYgKG5vdGlmQ2IpIG5vdGlmQ2IuY2hlY2tlZCA9IEJvb2xlYW4oQ09ORklHLnNlbmROb3RpZmljYXRpb24pO1xuXG4gICAgY29uc3QgZnVsbEFsZXJ0Q2IgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZy1lbmVyZ3ktZnVsbC1hbGVydCcpO1xuICAgIGlmIChmdWxsQWxlcnRDYikgZnVsbEFsZXJ0Q2IuY2hlY2tlZCA9IEJvb2xlYW4oQ09ORklHLmVuZXJneUZ1bGxBbGVydEVuYWJsZWQpO1xuXG4gICAgY29uc3Qgc3RlYWx0aENiID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldHRpbmctc3RlYWx0aC1qaXR0ZXInKTtcbiAgICBpZiAoc3RlYWx0aENiKSBzdGVhbHRoQ2IuY2hlY2tlZCA9IEJvb2xlYW4oQ09ORklHLnN0ZWFsdGhKaXR0ZXJFbmFibGVkKTtcblxuICAgIGNvbnN0IHNsZWVwQ2IgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZy1zbGVlcC1zY2hlZHVsZScpO1xuICAgIGlmIChzbGVlcENiKSBzbGVlcENiLmNoZWNrZWQgPSBCb29sZWFuKENPTkZJRy5zbGVlcFNjaGVkdWxlRW5hYmxlZCk7XG5cbiAgICBjb25zdCBzbGVlcFN0YXJ0U2VsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldHRpbmctc2xlZXAtc3RhcnQnKTtcbiAgICBpZiAoc2xlZXBTdGFydFNlbCkgc2xlZXBTdGFydFNlbC52YWx1ZSA9IFN0cmluZyhDT05GSUcuc2xlZXBTdGFydEhvdXIgPz8gMSk7XG5cbiAgICBjb25zdCBzbGVlcEVuZFNlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5nLXNsZWVwLWVuZCcpO1xuICAgIGlmIChzbGVlcEVuZFNlbCkgc2xlZXBFbmRTZWwudmFsdWUgPSBTdHJpbmcoQ09ORklHLnNsZWVwRW5kSG91ciA/PyA2KTtcblxuICAgIFsnc2hvd0hpZGUnLCAnd29ya05vdycsICdwYXVzZVJlc3VtZScsICdvcGVuTG9nJywgJ29wZW5TZXR0aW5ncyddLmZvckVhY2goYWN0aW9uSWQgPT4ge1xuICAgICAgICBjb25zdCBpbnAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChgc2hvcnRjdXQtJHthY3Rpb25JZH1gKTtcbiAgICAgICAgaWYgKGlucCAmJiBDT05GSUcuc2hvcnRjdXRzW2FjdGlvbklkXSkge1xuICAgICAgICAgICAgaW5wLnZhbHVlID0gQ09ORklHLnNob3J0Y3V0c1thY3Rpb25JZF0uZGlzcGxheSB8fCAnJztcbiAgICAgICAgICAgIGlucC5zdHlsZS5jb2xvciA9ICcjMDBkNGZmJztcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgY29uc3Qgc3RhdHVzRWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctc2V0dGluZ3Mtc3RhdHVzJyk7XG4gICAgaWYgKHN0YXR1c0VsKSBzdGF0dXNFbC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXG4gICAgbW9kYWwuc3R5bGUuZGlzcGxheSA9ICdmbGV4JztcbiAgICBpZiAoY3R4Py5zdGF0ZSkgY3R4LnN0YXRlLnNldHRpbmdzT3BlbiA9IHRydWU7XG5cbiAgICAvLyBQYXN0aWthbiB0YWIgYWt0aWYgb3RvbWF0aXMgdGVyLXNjcm9sbCBrZSB0ZW5nYWggYmlsYSBiZXJhZGEgZGkgbGF5YXIgc2VtcGl0XG4gICAgY29uc3QgYWN0aXZlVGFiID0gbW9kYWwucXVlcnlTZWxlY3RvcignLmF3LXRhYi1idG4uYWN0aXZlJyk7XG4gICAgaWYgKGFjdGl2ZVRhYikge1xuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IGFjdGl2ZVRhYi5zY3JvbGxJbnRvVmlldyh7IGJlaGF2aW9yOiAnc21vb3RoJywgYmxvY2s6ICduZWFyZXN0JywgaW5saW5lOiAnY2VudGVyJyB9KSwgNjApO1xuICAgIH1cbiAgICBpZiAobW9kYWwucmVjb3JkSGFuZGxlcikge1xuICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXlkb3duJywgbW9kYWwucmVjb3JkSGFuZGxlciwgdHJ1ZSk7XG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBtb2RhbC5yZWNvcmRIYW5kbGVyLCB0cnVlKTtcbiAgICB9XG4gICAgaWYgKG1vZGFsLmhhbmRsZUVzY2FwZUtleSkge1xuICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXlkb3duJywgbW9kYWwuaGFuZGxlRXNjYXBlS2V5KTtcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIG1vZGFsLmhhbmRsZUVzY2FwZUtleSk7XG4gICAgfVxufVxuIiwiLyoqXG4gKiB1aS9sb2d2aWV3ZXIuanMg4oCUIEFjdGl2aXR5IGxvZyB2aWV3ZXIgbW9kYWxcbiAqIE1vZGVybml6ZWQgd2l0aCBjYXRlZ29yeSBmaWx0ZXIgcGlsbHMsIGxpdmUgY291bnRlcnMsIHNlYXJjaCBiYXIsXG4gKiBjb3B5IHRvIGNsaXBib2FyZCwgZXhwb3J0IHRvIGZpbGUsIGFuZCBkYXJrIGdsYXNzbW9ycGhpYyBzdHlsaW5nLlxuICovXG5cbmltcG9ydCB7IGNsZWFyU3RvcmVkTG9ncyB9IGZyb20gJy4uL2xvZ2dlci5qcyc7XG5pbXBvcnQgeyBJQ09OUyB9IGZyb20gJy4vaWNvbnMuanMnO1xuXG4vLyBJbmplY3Qgc2NvcGVkIHN0eWxlc2hlZXQgb25jZVxuZnVuY3Rpb24gZW5zdXJlTG9nVmlld2VyU3R5bGVzKCkge1xuICAgIGlmIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctbG9nLXN0eWxlcycpKSByZXR1cm47XG4gICAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuICAgIHN0eWxlLmlkID0gJ2F3LWxvZy1zdHlsZXMnO1xuICAgIHN0eWxlLnRleHRDb250ZW50ID0gYFxuICAgICAgICAjYXctbG9nLW1vZGFsIHtcbiAgICAgICAgICAgIGZvbnQtZmFtaWx5OiAtYXBwbGUtc3lzdGVtLCBCbGlua01hY1N5c3RlbUZvbnQsIFwiU2Vnb2UgVUlcIiwgUm9ib3RvLCBcIkhlbHZldGljYSBOZXVlXCIsIEFyaWFsLCBzYW5zLXNlcmlmO1xuICAgICAgICAgICAgY29sb3I6ICNlMmU4ZjA7XG4gICAgICAgIH1cblxuICAgICAgICAvKiBGaWx0ZXIgUGlsbHMgKi9cbiAgICAgICAgLmF3LWxvZy1maWx0ZXItcGlsbCB7XG4gICAgICAgICAgICBkaXNwbGF5OiBpbmxpbmUtZmxleDtcbiAgICAgICAgICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgICAgICAgICBnYXA6IDZweDtcbiAgICAgICAgICAgIHBhZGRpbmc6IDZweCAxMXB4O1xuICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjAzKTtcbiAgICAgICAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4wNyk7XG4gICAgICAgICAgICBib3JkZXItcmFkaXVzOiA4cHg7XG4gICAgICAgICAgICBjb2xvcjogIzhiOWJiNDtcbiAgICAgICAgICAgIGZvbnQtc2l6ZTogMTEuNXB4O1xuICAgICAgICAgICAgZm9udC13ZWlnaHQ6IDUwMDtcbiAgICAgICAgICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICAgICAgICAgIHRyYW5zaXRpb246IGFsbCAwLjJzIGN1YmljLWJlemllcigwLjQsIDAsIDAuMiwgMSk7XG4gICAgICAgICAgICB1c2VyLXNlbGVjdDogbm9uZTtcbiAgICAgICAgICAgIHdoaXRlLXNwYWNlOiBub3dyYXA7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LWxvZy1maWx0ZXItcGlsbDpob3ZlciB7XG4gICAgICAgICAgICBjb2xvcjogI2ZmZmZmZjtcbiAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4wOCk7XG4gICAgICAgICAgICBib3JkZXItY29sb3I6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4xNCk7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LWxvZy1maWx0ZXItcGlsbC5hY3RpdmUge1xuICAgICAgICAgICAgY29sb3I6ICMwMGZmODg7XG4gICAgICAgICAgICBiYWNrZ3JvdW5kOiBsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCByZ2JhKDAsIDI1NSwgMTM2LCAwLjE0KSwgcmdiYSgwLCAxODAsIDIxNiwgMC4wOSkpO1xuICAgICAgICAgICAgYm9yZGVyLWNvbG9yOiByZ2JhKDAsIDI1NSwgMTM2LCAwLjUpO1xuICAgICAgICAgICAgZm9udC13ZWlnaHQ6IDYwMDtcbiAgICAgICAgICAgIGJveC1zaGFkb3c6IDAgMnB4IDEwcHggcmdiYSgwLCAyNTUsIDEzNiwgMC4xNSk7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LWxvZy1maWx0ZXItY291bnQge1xuICAgICAgICAgICAgZm9udC1zaXplOiAxMHB4O1xuICAgICAgICAgICAgZm9udC13ZWlnaHQ6IDcwMDtcbiAgICAgICAgICAgIHBhZGRpbmc6IDFweCA2cHg7XG4gICAgICAgICAgICBib3JkZXItcmFkaXVzOiAxMHB4O1xuICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjA4KTtcbiAgICAgICAgICAgIGNvbG9yOiAjOTRhM2I4O1xuICAgICAgICAgICAgdHJhbnNpdGlvbjogYWxsIDAuMnM7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LWxvZy1maWx0ZXItcGlsbC5hY3RpdmUgLmF3LWxvZy1maWx0ZXItY291bnQge1xuICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgwLCAyNTUsIDEzNiwgMC4yKTtcbiAgICAgICAgICAgIGNvbG9yOiAjMDBmZjg4O1xuICAgICAgICB9XG5cbiAgICAgICAgLyogVHlwZSBCYWRnZXMgKi9cbiAgICAgICAgLmF3LWxvZy1iYWRnZSB7XG4gICAgICAgICAgICBkaXNwbGF5OiBpbmxpbmUtZmxleDtcbiAgICAgICAgICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgICAgICAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcbiAgICAgICAgICAgIGdhcDogNHB4O1xuICAgICAgICAgICAgcGFkZGluZzogMnB4IDZweDtcbiAgICAgICAgICAgIGJvcmRlci1yYWRpdXM6IDRweDtcbiAgICAgICAgICAgIGZvbnQtc2l6ZTogMTBweDtcbiAgICAgICAgICAgIGZvbnQtd2VpZ2h0OiA3MDA7XG4gICAgICAgICAgICBsZXR0ZXItc3BhY2luZzogMC4zcHg7XG4gICAgICAgICAgICB3aGl0ZS1zcGFjZTogbm93cmFwO1xuICAgICAgICAgICAgZmxleC1zaHJpbms6IDA7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LWxvZy1iYWRnZS1zdWNjZXNzIHtcbiAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMCwgMjU1LCAxMzYsIDAuMTIpO1xuICAgICAgICAgICAgY29sb3I6ICMwMGZmODg7XG4gICAgICAgICAgICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDAsIDI1NSwgMTM2LCAwLjI1KTtcbiAgICAgICAgfVxuICAgICAgICAuYXctbG9nLWJhZGdlLXdhcm4ge1xuICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgyNTUsIDIwOSwgMTAyLCAwLjEyKTtcbiAgICAgICAgICAgIGNvbG9yOiAjZmZkMTY2O1xuICAgICAgICAgICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSgyNTUsIDIwOSwgMTAyLCAwLjI1KTtcbiAgICAgICAgfVxuICAgICAgICAuYXctbG9nLWJhZGdlLWVycm9yIHtcbiAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMjU1LCAxMDcsIDEwNywgMC4xMik7XG4gICAgICAgICAgICBjb2xvcjogI2ZmNmI2YjtcbiAgICAgICAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMjU1LCAxMDcsIDEwNywgMC4yNSk7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LWxvZy1iYWRnZS1pbmZvIHtcbiAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMCwgMjEyLCAyNTUsIDAuMTIpO1xuICAgICAgICAgICAgY29sb3I6ICMwMGQ0ZmY7XG4gICAgICAgICAgICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDAsIDIxMiwgMjU1LCAwLjI1KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8qIExvZyBSb3cgKi9cbiAgICAgICAgLmF3LWxvZy1yb3cge1xuICAgICAgICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgICAgICAgIGFsaWduLWl0ZW1zOiBmbGV4LXN0YXJ0O1xuICAgICAgICAgICAgZ2FwOiAxMHB4O1xuICAgICAgICAgICAgcGFkZGluZzogOHB4IDEwcHg7XG4gICAgICAgICAgICBib3JkZXItYm90dG9tOiAxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjA0KTtcbiAgICAgICAgICAgIGJvcmRlci1yYWRpdXM6IDZweDtcbiAgICAgICAgICAgIHRyYW5zaXRpb246IGJhY2tncm91bmQgMC4xNXM7XG4gICAgICAgICAgICBwb3NpdGlvbjogcmVsYXRpdmU7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LWxvZy1yb3c6aG92ZXIge1xuICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjA0KTtcbiAgICAgICAgfVxuICAgICAgICAuYXctbG9nLXJvdzpsYXN0LWNoaWxkIHtcbiAgICAgICAgICAgIGJvcmRlci1ib3R0b206IG5vbmU7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LWxvZy10aW1lIHtcbiAgICAgICAgICAgIGZvbnQtZmFtaWx5OiB1aS1tb25vc3BhY2UsIFNGTW9uby1SZWd1bGFyLCBNZW5sbywgTW9uYWNvLCBDb25zb2xhcywgbW9ub3NwYWNlO1xuICAgICAgICAgICAgZm9udC1zaXplOiAxMXB4O1xuICAgICAgICAgICAgY29sb3I6ICM2NDc0OGI7XG4gICAgICAgICAgICB3aGl0ZS1zcGFjZTogbm93cmFwO1xuICAgICAgICAgICAgcGFkZGluZy10b3A6IDFweDtcbiAgICAgICAgICAgIGZsZXgtc2hyaW5rOiAwO1xuICAgICAgICB9XG4gICAgICAgIC5hdy1sb2ctbXNnIHtcbiAgICAgICAgICAgIGZsZXg6IDE7XG4gICAgICAgICAgICBmb250LXNpemU6IDEycHg7XG4gICAgICAgICAgICBsaW5lLWhlaWdodDogMS40NTtcbiAgICAgICAgICAgIHdvcmQtYnJlYWs6IGJyZWFrLXdvcmQ7XG4gICAgICAgICAgICBjb2xvcjogI2NiZDVlMTtcbiAgICAgICAgfVxuICAgICAgICAuYXctbG9nLWNvcHktYnRuIHtcbiAgICAgICAgICAgIG9wYWNpdHk6IDA7XG4gICAgICAgICAgICB0cmFuc2l0aW9uOiBvcGFjaXR5IDAuMTVzLCBiYWNrZ3JvdW5kIDAuMTVzO1xuICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjA4KTtcbiAgICAgICAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4xMik7XG4gICAgICAgICAgICBjb2xvcjogIzk0YTNiODtcbiAgICAgICAgICAgIGJvcmRlci1yYWRpdXM6IDRweDtcbiAgICAgICAgICAgIHBhZGRpbmc6IDJweCA3cHg7XG4gICAgICAgICAgICBmb250LXNpemU6IDEwcHg7XG4gICAgICAgICAgICBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICAgICAgICBtYXJnaW4tbGVmdDogYXV0bztcbiAgICAgICAgICAgIGZsZXgtc2hyaW5rOiAwO1xuICAgICAgICB9XG4gICAgICAgIC5hdy1sb2ctcm93OmhvdmVyIC5hdy1sb2ctY29weS1idG4ge1xuICAgICAgICAgICAgb3BhY2l0eTogMTtcbiAgICAgICAgfVxuICAgICAgICAuYXctbG9nLWNvcHktYnRuOmhvdmVyIHtcbiAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMCwgMjU1LCAxMzYsIDAuMTUpO1xuICAgICAgICAgICAgY29sb3I6ICMwMGZmODg7XG4gICAgICAgICAgICBib3JkZXItY29sb3I6IHJnYmEoMCwgMjU1LCAxMzYsIDAuNCk7XG4gICAgICAgIH1cblxuICAgICAgICAvKiBDdXN0b20gU2Nyb2xsYmFycyAqL1xuICAgICAgICAjYXctbG9nLWVudHJpZXM6Oi13ZWJraXQtc2Nyb2xsYmFyIHtcbiAgICAgICAgICAgIHdpZHRoOiA2cHg7XG4gICAgICAgIH1cbiAgICAgICAgI2F3LWxvZy1lbnRyaWVzOjotd2Via2l0LXNjcm9sbGJhci10cmFjayB7XG4gICAgICAgICAgICBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDtcbiAgICAgICAgfVxuICAgICAgICAjYXctbG9nLWVudHJpZXM6Oi13ZWJraXQtc2Nyb2xsYmFyLXRodW1iIHtcbiAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4xNCk7XG4gICAgICAgICAgICBib3JkZXItcmFkaXVzOiA0cHg7XG4gICAgICAgIH1cbiAgICAgICAgI2F3LWxvZy1lbnRyaWVzOjotd2Via2l0LXNjcm9sbGJhci10aHVtYjpob3ZlciB7XG4gICAgICAgICAgICBiYWNrZ3JvdW5kOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMjgpO1xuICAgICAgICB9XG5cbiAgICAgICAgLmF3LWxvZy1waWxscy1jb250YWluZXI6Oi13ZWJraXQtc2Nyb2xsYmFyIHtcbiAgICAgICAgICAgIGRpc3BsYXk6IG5vbmU7XG4gICAgICAgIH1cbiAgICBgO1xuICAgIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTG9nVmlld2VyKHN0YXRlLCBDT05GSUcpIHtcbiAgICBlbnN1cmVMb2dWaWV3ZXJTdHlsZXMoKTtcblxuICAgIGNvbnN0IG9sZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1sb2ctbW9kYWwnKTtcbiAgICBpZiAob2xkKSBvbGQucmVtb3ZlKCk7XG5cbiAgICBjb25zdCBtb2RhbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIG1vZGFsLmlkID0gJ2F3LWxvZy1tb2RhbCc7XG4gICAgbW9kYWwuc3R5bGUuY3NzVGV4dCA9IGBcbiAgICAgICAgZGlzcGxheTogbm9uZTtcbiAgICAgICAgcG9zaXRpb246IGZpeGVkO1xuICAgICAgICB0b3A6IDA7IGxlZnQ6IDA7IHJpZ2h0OiAwOyBib3R0b206IDA7XG4gICAgICAgIGJhY2tncm91bmQ6IHJnYmEoNCwgNywgMTQsIDAuNzgpO1xuICAgICAgICBiYWNrZHJvcC1maWx0ZXI6IGJsdXIoOHB4KTtcbiAgICAgICAgLXdlYmtpdC1iYWNrZHJvcC1maWx0ZXI6IGJsdXIoOHB4KTtcbiAgICAgICAgei1pbmRleDogMTAwMDAzO1xuICAgICAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcbiAgICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICBgO1xuXG4gICAgbW9kYWwuaW5uZXJIVE1MID0gYFxuICAgICAgICA8ZGl2IHN0eWxlPVwiXG4gICAgICAgICAgICBiYWNrZ3JvdW5kOiBsaW5lYXItZ3JhZGllbnQoMTgwZGVnLCAjMTMxNzI0IDAlLCAjMGQxMDFhIDEwMCUpO1xuICAgICAgICAgICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjEyKTtcbiAgICAgICAgICAgIGJvcmRlci1yYWRpdXM6IDE2cHg7XG4gICAgICAgICAgICB3aWR0aDogOTUlO1xuICAgICAgICAgICAgbWF4LXdpZHRoOiA2ODBweDtcbiAgICAgICAgICAgIGhlaWdodDogNjIwcHg7XG4gICAgICAgICAgICBtYXgtaGVpZ2h0OiA5MHZoO1xuICAgICAgICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgICAgICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG4gICAgICAgICAgICBib3gtc2hhZG93OiAwIDIwcHggNjBweCByZ2JhKDAsMCwwLDAuOCksIDAgMCAxcHggMXB4IHJnYmEoMjU1LDI1NSwyNTUsMC4wNSk7XG4gICAgICAgICAgICBvdmVyZmxvdzogaGlkZGVuO1xuICAgICAgICBcIj5cbiAgICAgICAgICAgIDwhLS0gTW9kYWwgSGVhZGVyIC0tPlxuICAgICAgICAgICAgPGRpdiBzdHlsZT1cIlxuICAgICAgICAgICAgICAgIHBhZGRpbmc6IDE2cHggMjBweDtcbiAgICAgICAgICAgICAgICBib3JkZXItYm90dG9tOiAxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjA4KTtcbiAgICAgICAgICAgICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgICAgICAgICAgIGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjtcbiAgICAgICAgICAgICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsIHJnYmEoMjYsIDMzLCA1NCwgMC44KSAwJSwgcmdiYSgxOCwgMjIsIDM2LCAwLjk1KSAxMDAlKTtcbiAgICAgICAgICAgIFwiPlxuICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBnYXA6IDEwcHg7XCI+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJcbiAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoOiAzMnB4OyBoZWlnaHQ6IDMycHg7IGJvcmRlci1yYWRpdXM6IDhweDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsIHJnYmEoNTYsIDE4OSwgMjQ4LCAwLjE1KSwgcmdiYSgyLCAxMzIsIDE5OSwgMC4yKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDU2LCAxODksIDI0OCwgMC4zKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGp1c3RpZnktY29udGVudDogY2VudGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29sb3I6ICMzOGJkZjg7XG4gICAgICAgICAgICAgICAgICAgIFwiPiR7SUNPTlMuZmlsZVRleHR9PC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDxkaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZm9udC13ZWlnaHQ6IDcwMDsgY29sb3I6ICNmZmY7IGZvbnQtc2l6ZTogMTQuNXB4OyBsZXR0ZXItc3BhY2luZzogMC4zcHg7XCI+QWN0aXZpdHkgTG9nPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZm9udC1zaXplOiAxMXB4OyBjb2xvcjogIzhiOWJiNDtcIj5SaXdheWF0IGFrdGl2aXRhcyAmIHN0YXR1cyBrZXJqYSBib3Qgc2VjYXJhIHJlYWwtdGltZTwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTogZmxleDsgYWxpZ24taXRlbXM6IGNlbnRlcjsgZ2FwOiA4cHg7XCI+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJhdy1jb3B5LWFsbC1sb2dcIiBzdHlsZT1cIlxuICAgICAgICAgICAgICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjA1KTsgY29sb3I6ICNjYmQ1ZTE7IGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4xMik7XG4gICAgICAgICAgICAgICAgICAgICAgICBwYWRkaW5nOiA2cHggMTJweDsgYm9yZGVyLXJhZGl1czogOHB4OyBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb250LXNpemU6IDExLjVweDsgZm9udC13ZWlnaHQ6IDYwMDsgdHJhbnNpdGlvbjogYWxsIDAuMTVzO1xuICAgICAgICAgICAgICAgICAgICAgICAgZGlzcGxheTogaW5saW5lLWZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGdhcDogNXB4O1xuICAgICAgICAgICAgICAgICAgICBcIj48c3BhbiBzdHlsZT1cImRpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7XCI+JHtJQ09OUy5jb3B5fTwvc3Bhbj4gU2FsaW4gTG9nPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJhdy1jbGVhci1sb2dcIiBzdHlsZT1cIlxuICAgICAgICAgICAgICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjA1KTsgY29sb3I6ICNmZjZiNmI7IGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMjU1LCAxMDcsIDEwNywgMC4yNSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBwYWRkaW5nOiA2cHggMTJweDsgYm9yZGVyLXJhZGl1czogOHB4OyBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb250LXNpemU6IDExLjVweDsgZm9udC13ZWlnaHQ6IDYwMDsgdHJhbnNpdGlvbjogYWxsIDAuMTVzO1xuICAgICAgICAgICAgICAgICAgICAgICAgZGlzcGxheTogaW5saW5lLWZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGdhcDogNXB4O1xuICAgICAgICAgICAgICAgICAgICBcIj48c3BhbiBzdHlsZT1cImRpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7XCI+JHtJQ09OUy50cmFzaH08L3NwYW4+IEJlcnNpaGthbjwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGlkPVwiYXctY2xvc2UtbG9nXCIgc3R5bGU9XCJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4wNSk7IGNvbG9yOiAjY2JkNWUxOyBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMTIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcGFkZGluZzogNnB4IDEycHg7IGJvcmRlci1yYWRpdXM6IDhweDsgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9udC1zaXplOiAxMnB4OyBmb250LXdlaWdodDogNjAwOyB0cmFuc2l0aW9uOiBhbGwgMC4xNXM7XG4gICAgICAgICAgICAgICAgICAgIFwiPlR1dHVwPC9idXR0b24+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgPCEtLSBUb29sYmFyOiBGaWx0ZXIgUGlsbHMgJiBTZWFyY2ggSW5wdXQgLS0+XG4gICAgICAgICAgICA8ZGl2IHN0eWxlPVwiXG4gICAgICAgICAgICAgICAgcGFkZGluZzogMTBweCAxOHB4O1xuICAgICAgICAgICAgICAgIGJvcmRlci1ib3R0b206IDFweCBzb2xpZCByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMDYpO1xuICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMTIsIDE2LCAyNiwgMC42KTtcbiAgICAgICAgICAgICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgICAgICAgICAgIGdhcDogMTJweDtcbiAgICAgICAgICAgICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAgICAgICAgICAgIGZsZXgtd3JhcDogd3JhcDtcbiAgICAgICAgICAgIFwiPlxuICAgICAgICAgICAgICAgIDwhLS0gQ2F0ZWdvcnkgRmlsdGVyIFBpbGxzIC0tPlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1sb2ctcGlsbHMtY29udGFpbmVyXCIgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBnYXA6IDZweDsgb3ZlcmZsb3cteDogYXV0bzsgc2Nyb2xsYmFyLXdpZHRoOiBub25lO1wiPlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIHR5cGU9XCJidXR0b25cIiBjbGFzcz1cImF3LWxvZy1maWx0ZXItcGlsbCBhY3RpdmVcIiBkYXRhLXR5cGU9XCJhbGxcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIFNlbXVhIDxzcGFuIGNsYXNzPVwiYXctbG9nLWZpbHRlci1jb3VudFwiIGlkPVwiYXctY291bnQtYWxsXCI+MDwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gdHlwZT1cImJ1dHRvblwiIGNsYXNzPVwiYXctbG9nLWZpbHRlci1waWxsXCIgZGF0YS10eXBlPVwic3VjY2Vzc1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJ3aWR0aDo2cHg7aGVpZ2h0OjZweDtib3JkZXItcmFkaXVzOjUwJTtiYWNrZ3JvdW5kOiMwMGZmODg7ZGlzcGxheTppbmxpbmUtYmxvY2s7XCI+PC9zcGFuPiBTdWtzZXMgPHNwYW4gY2xhc3M9XCJhdy1sb2ctZmlsdGVyLWNvdW50XCIgaWQ9XCJhdy1jb3VudC1zdWNjZXNzXCI+MDwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gdHlwZT1cImJ1dHRvblwiIGNsYXNzPVwiYXctbG9nLWZpbHRlci1waWxsXCIgZGF0YS10eXBlPVwid2FyblwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJ3aWR0aDo2cHg7aGVpZ2h0OjZweDtib3JkZXItcmFkaXVzOjUwJTtiYWNrZ3JvdW5kOiNmZmQxNjY7ZGlzcGxheTppbmxpbmUtYmxvY2s7XCI+PC9zcGFuPiBQZXJpbmdhdGFuIDxzcGFuIGNsYXNzPVwiYXctbG9nLWZpbHRlci1jb3VudFwiIGlkPVwiYXctY291bnQtd2FyblwiPjA8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIHR5cGU9XCJidXR0b25cIiBjbGFzcz1cImF3LWxvZy1maWx0ZXItcGlsbFwiIGRhdGEtdHlwZT1cImVycm9yXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBzdHlsZT1cIndpZHRoOjZweDtoZWlnaHQ6NnB4O2JvcmRlci1yYWRpdXM6NTAlO2JhY2tncm91bmQ6I2ZmNmI2YjtkaXNwbGF5OmlubGluZS1ibG9jaztcIj48L3NwYW4+IEVycm9yIDxzcGFuIGNsYXNzPVwiYXctbG9nLWZpbHRlci1jb3VudFwiIGlkPVwiYXctY291bnQtZXJyb3JcIj4wPC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3M9XCJhdy1sb2ctZmlsdGVyLXBpbGxcIiBkYXRhLXR5cGU9XCJpbmZvXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBzdHlsZT1cIndpZHRoOjZweDtoZWlnaHQ6NnB4O2JvcmRlci1yYWRpdXM6NTAlO2JhY2tncm91bmQ6IzM4YmRmODtkaXNwbGF5OmlubGluZS1ibG9jaztcIj48L3NwYW4+IEluZm8gPHNwYW4gY2xhc3M9XCJhdy1sb2ctZmlsdGVyLWNvdW50XCIgaWQ9XCJhdy1jb3VudC1pbmZvXCI+MDwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICAgICAgICA8IS0tIEhpZGRlbiBzZWxlY3QgZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHkgLS0+XG4gICAgICAgICAgICAgICAgPHNlbGVjdCBpZD1cImF3LWxvZy1maWx0ZXItdHlwZVwiIHN0eWxlPVwiZGlzcGxheTogbm9uZTtcIj5cbiAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImFsbFwiPlNlbXVhPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJzdWNjZXNzXCI+U3VjY2Vzczwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwid2FyblwiPldhcm48L29wdGlvbj5cbiAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImVycm9yXCI+RXJyb3I8L29wdGlvbj5cbiAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImluZm9cIj5JbmZvPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgPC9zZWxlY3Q+XG5cbiAgICAgICAgICAgICAgICA8IS0tIFNlYXJjaCBJbnB1dCAtLT5cbiAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZmxleDogMTsgbWluLXdpZHRoOiAxNzBweDsgcG9zaXRpb246IHJlbGF0aXZlOyBkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyO1wiPlxuICAgICAgICAgICAgICAgICAgICA8c3BhbiBzdHlsZT1cInBvc2l0aW9uOiBhYnNvbHV0ZTsgbGVmdDogMTBweDsgY29sb3I6ICM2NDc0OGI7IHBvaW50ZXItZXZlbnRzOiBub25lOyBkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyO1wiPiR7SUNPTlMuc2VhcmNofTwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPGlucHV0IGlkPVwiYXctbG9nLWZpbHRlci10ZXh0XCIgdHlwZT1cInRleHRcIiBwbGFjZWhvbGRlcj1cIkNhcmkgYWt0aXZpdGFzIChzaGlmdCwgZW5lcmdpLCBidWZmKS4uLlwiIHN0eWxlPVwiXG4gICAgICAgICAgICAgICAgICAgICAgICB3aWR0aDogMTAwJTsgYm94LXNpemluZzogYm9yZGVyLWJveDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6ICMxNDE4MjY7IGNvbG9yOiAjZmZmO1xuICAgICAgICAgICAgICAgICAgICAgICAgYm9yZGVyOiAxcHggc29saWQgIzI4MzM0ZTsgYm9yZGVyLXJhZGl1czogOHB4O1xuICAgICAgICAgICAgICAgICAgICAgICAgcGFkZGluZzogNnB4IDEycHggNnB4IDMwcHg7IGZvbnQtc2l6ZTogMTEuNXB4O1xuICAgICAgICAgICAgICAgICAgICAgICAgb3V0bGluZTogbm9uZTsgdHJhbnNpdGlvbjogYm9yZGVyLWNvbG9yIDAuMnM7XG4gICAgICAgICAgICAgICAgICAgIFwiPlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICAgIDwhLS0gU2Nyb2xsYWJsZSBMb2cgRW50cmllcyAtLT5cbiAgICAgICAgICAgIDxkaXYgaWQ9XCJhdy1sb2ctZW50cmllc1wiIHN0eWxlPVwiXG4gICAgICAgICAgICAgICAgZmxleDogMTtcbiAgICAgICAgICAgICAgICBvdmVyZmxvdy15OiBhdXRvO1xuICAgICAgICAgICAgICAgIHBhZGRpbmc6IDEycHggMThweDtcbiAgICAgICAgICAgICAgICBvdmVyc2Nyb2xsLWJlaGF2aW9yOiBjb250YWluO1xuICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoOCwgMTEsIDE4LCAwLjQpO1xuICAgICAgICAgICAgXCI+PC9kaXY+XG5cbiAgICAgICAgICAgIDwhLS0gU3RpY2t5IE1vZGFsIEZvb3RlciAtLT5cbiAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJcbiAgICAgICAgICAgICAgICBwYWRkaW5nOiAxMHB4IDE4cHg7XG4gICAgICAgICAgICAgICAgYm9yZGVyLXRvcDogMXB4IHNvbGlkIHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4wOCk7XG4gICAgICAgICAgICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgICAgICAgICAgICBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47XG4gICAgICAgICAgICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiBsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjMTMxNzI0IDAlLCAjMGQxMDFhIDEwMCUpO1xuICAgICAgICAgICAgICAgIGZvbnQtc2l6ZTogMTEuNXB4O1xuICAgICAgICAgICAgICAgIGNvbG9yOiAjOGI5YmI0O1xuICAgICAgICAgICAgXCI+XG4gICAgICAgICAgICAgICAgPGRpdiBpZD1cImF3LWxvZy1zdGF0dXNcIiBzdHlsZT1cImRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGdhcDogOHB4O1wiPlxuICAgICAgICAgICAgICAgICAgICA8c3BhbiBzdHlsZT1cImRpc3BsYXk6IGlubGluZS1ibG9jazsgd2lkdGg6IDdweDsgaGVpZ2h0OiA3cHg7IGJvcmRlci1yYWRpdXM6IDUwJTsgYmFja2dyb3VuZDogIzAwZmY4ODsgYm94LXNoYWRvdzogMCAwIDhweCAjMDBmZjg4O1wiPjwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPHNwYW4gaWQ9XCJhdy1sb2ctc3VtbWFyeVwiPlN0cmVhbSBha3RpZiDigKIgMCByaXdheWF0IHRlcnNpbXBhbjwvc3Bhbj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTogZmxleDsgYWxpZ24taXRlbXM6IGNlbnRlcjsgZ2FwOiA4cHg7XCI+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJhdy1leHBvcnQtbG9nLWJ0blwiIHN0eWxlPVwiXG4gICAgICAgICAgICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMDUpOyBjb2xvcjogIzk0YTNiODsgYm9yZGVyOiAxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcGFkZGluZzogNXB4IDEycHg7IGJvcmRlci1yYWRpdXM6IDZweDsgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9udC1zaXplOiAxMXB4OyBmb250LXdlaWdodDogNTAwOyB0cmFuc2l0aW9uOiBhbGwgMC4xNXM7XG4gICAgICAgICAgICAgICAgICAgIFwiPkVrc3BvciAudHh0PC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJhdy1jbG9zZS1sb2ctZm9vdGVyXCIgc3R5bGU9XCJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6IHRyYW5zcGFyZW50OyBjb2xvcjogI2NiZDVlMTsgYm9yZGVyOiAxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjEyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhZGRpbmc6IDVweCAxNHB4OyBib3JkZXItcmFkaXVzOiA2cHg7IGN1cnNvcjogcG9pbnRlcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbnQtc2l6ZTogMTFweDsgZm9udC13ZWlnaHQ6IDYwMDtcbiAgICAgICAgICAgICAgICAgICAgXCI+VHV0dXA8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICA8L2Rpdj5cbiAgICBgO1xuXG4gICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChtb2RhbCk7XG5cbiAgICBmdW5jdGlvbiBjbG9zZUxvZygpIHsgbW9kYWwuc3R5bGUuZGlzcGxheSA9ICdub25lJzsgfVxuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1jbG9zZS1sb2cnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBjbG9zZUxvZyk7XG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LWNsb3NlLWxvZy1mb290ZXInKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBjbG9zZUxvZyk7XG4gICAgbW9kYWwuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBlID0+IHsgaWYgKGUudGFyZ2V0ID09PSBtb2RhbCkgY2xvc2VMb2coKTsgfSk7XG5cbiAgICBsZXQgZmlsdGVyVHlwZSA9ICdhbGwnLCBmaWx0ZXJUZXh0ID0gJyc7XG5cbiAgICAvLyBGaWx0ZXIgcGlsbHMgY2xpY2sgaGFuZGxpbmdcbiAgICBjb25zdCBmaWx0ZXJQaWxscyA9IG1vZGFsLnF1ZXJ5U2VsZWN0b3JBbGwoJy5hdy1sb2ctZmlsdGVyLXBpbGwnKTtcbiAgICBjb25zdCBoaWRkZW5TZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctbG9nLWZpbHRlci10eXBlJyk7XG4gICAgZmlsdGVyUGlsbHMuZm9yRWFjaChwaWxsID0+IHtcbiAgICAgICAgcGlsbC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgICAgIGZpbHRlclBpbGxzLmZvckVhY2gocCA9PiBwLmNsYXNzTGlzdC5yZW1vdmUoJ2FjdGl2ZScpKTtcbiAgICAgICAgICAgIHBpbGwuY2xhc3NMaXN0LmFkZCgnYWN0aXZlJyk7XG4gICAgICAgICAgICBmaWx0ZXJUeXBlID0gcGlsbC5kYXRhc2V0LnR5cGUgfHwgJ2FsbCc7XG4gICAgICAgICAgICBpZiAoaGlkZGVuU2VsZWN0KSBoaWRkZW5TZWxlY3QudmFsdWUgPSBmaWx0ZXJUeXBlO1xuICAgICAgICAgICAgcmVuZGVyTG9ncyhzdGF0ZSwgZmlsdGVyVHlwZSwgZmlsdGVyVGV4dCk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaGlkZGVuU2VsZWN0Py5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBlID0+IHtcbiAgICAgICAgZmlsdGVyVHlwZSA9IGUudGFyZ2V0LnZhbHVlO1xuICAgICAgICBmaWx0ZXJQaWxscy5mb3JFYWNoKHAgPT4gcC5jbGFzc0xpc3QudG9nZ2xlKCdhY3RpdmUnLCBwLmRhdGFzZXQudHlwZSA9PT0gZmlsdGVyVHlwZSkpO1xuICAgICAgICByZW5kZXJMb2dzKHN0YXRlLCBmaWx0ZXJUeXBlLCBmaWx0ZXJUZXh0KTtcbiAgICB9KTtcblxuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1sb2ctZmlsdGVyLXRleHQnKT8uYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCBlID0+IHtcbiAgICAgICAgZmlsdGVyVGV4dCA9IGUudGFyZ2V0LnZhbHVlLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIHJlbmRlckxvZ3Moc3RhdGUsIGZpbHRlclR5cGUsIGZpbHRlclRleHQpO1xuICAgIH0pO1xuXG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LWNsZWFyLWxvZycpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgaWYgKCFjb25maXJtKCdZYWtpbiBpbmdpbiBtZW1iZXJzaWhrYW4gc2VtdWEgcml3YXlhdCBBY3Rpdml0eSBMb2c/JykpIHJldHVybjtcbiAgICAgICAgc3RhdGUubG9ncyA9IFtdO1xuICAgICAgICBjbGVhclN0b3JlZExvZ3MoKTtcbiAgICAgICAgcmVuZGVyTG9ncyhzdGF0ZSwgZmlsdGVyVHlwZSwgZmlsdGVyVGV4dCk7XG4gICAgfSk7XG5cbiAgICAvLyBDb3B5IGFsbCBsb2dzIHRvIGNsaXBib2FyZFxuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1jb3B5LWFsbC1sb2cnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGlmICghc3RhdGUubG9ncyB8fCBzdGF0ZS5sb2dzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuICAgICAgICBjb25zdCB0ZXh0VG9Db3B5ID0gc3RhdGUubG9nc1xuICAgICAgICAgICAgLm1hcChlID0+IGBbJHtlLnRpbWV9XSBbJHtlLnR5cGUudG9VcHBlckNhc2UoKX1dICR7ZS5tZXNzYWdlfWApXG4gICAgICAgICAgICAuam9pbignXFxuJyk7XG4gICAgICAgIG5hdmlnYXRvci5jbGlwYm9hcmQud3JpdGVUZXh0KHRleHRUb0NvcHkpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgYnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LWNvcHktYWxsLWxvZycpO1xuICAgICAgICAgICAgaWYgKGJ0bikge1xuICAgICAgICAgICAgICAgIGNvbnN0IG9yaWcgPSBidG4uaW5uZXJIVE1MO1xuICAgICAgICAgICAgICAgIGJ0bi5pbm5lckhUTUwgPSBgPHNwYW4gc3R5bGU9XCJkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NHB4O2NvbG9yOiMwMGZmODg7XCI+JHtJQ09OUy5jaGVja30gVGVyc2FsaW48L3NwYW4+YDtcbiAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgYnRuLmlubmVySFRNTCA9IG9yaWc7XG4gICAgICAgICAgICAgICAgfSwgMTUwMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pLmNhdGNoKCgpID0+IHt9KTtcbiAgICB9KTtcblxuICAgIC8vIEV4cG9ydCBsb2dzIHRvIC50eHQgZmlsZVxuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1leHBvcnQtbG9nLWJ0bicpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgaWYgKCFzdGF0ZS5sb2dzIHx8IHN0YXRlLmxvZ3MubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICBhbGVydCgnVGlkYWsgYWRhIHJpd2F5YXQgbG9nIHVudHVrIGRpZWtzcG9yLicpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHRleHRDb250ZW50ID0gW1xuICAgICAgICAgICAgYD09PSBQQVJMQU1FTlRVTSBBVVRPIFdPUktFUiBBQ1RJVklUWSBMT0cgPT09YCxcbiAgICAgICAgICAgIGBEaWVrc3BvciBwYWRhOiAke25ldyBEYXRlKCkudG9Mb2NhbGVTdHJpbmcoJ2lkLUlEJyl9YCxcbiAgICAgICAgICAgIGBUb3RhbCBsb2c6ICR7c3RhdGUubG9ncy5sZW5ndGh9YCxcbiAgICAgICAgICAgIGA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxcbmAsXG4gICAgICAgICAgICAuLi5zdGF0ZS5sb2dzLm1hcChlID0+IGBbJHtlLnRpbWV9XSBbJHtlLnR5cGUudG9VcHBlckNhc2UoKX1dICR7ZS5tZXNzYWdlfWApXG4gICAgICAgIF0uam9pbignXFxuJyk7XG5cbiAgICAgICAgY29uc3QgYmxvYiA9IG5ldyBCbG9iKFt0ZXh0Q29udGVudF0sIHsgdHlwZTogJ3RleHQvcGxhaW47Y2hhcnNldD11dGYtOCcgfSk7XG4gICAgICAgIGNvbnN0IHVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG4gICAgICAgIGNvbnN0IGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG4gICAgICAgIGEuaHJlZiA9IHVybDtcbiAgICAgICAgY29uc3QgZGF0ZVN0ciA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKS5zbGljZSgwLCAxMCk7XG4gICAgICAgIGEuZG93bmxvYWQgPSBgcGFybGVtZW50dW0tbG9nLSR7ZGF0ZVN0cn0udHh0YDtcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChhKTtcbiAgICAgICAgYS5jbGljaygpO1xuICAgICAgICBkb2N1bWVudC5ib2R5LnJlbW92ZUNoaWxkKGEpO1xuICAgICAgICBVUkwucmV2b2tlT2JqZWN0VVJMKHVybCk7XG4gICAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBvcGVuTG9nVmlld2VyKHN0YXRlLCBDT05GSUcpIHtcbiAgICBjb25zdCBtb2RhbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1sb2ctbW9kYWwnKTtcbiAgICBpZiAoIW1vZGFsKSByZXR1cm47XG4gICAgbW9kYWwuc3R5bGUuZGlzcGxheSA9ICdmbGV4JztcbiAgICB1cGRhdGVMb2dWaWV3ZXIoc3RhdGUsIENPTkZJRyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVMb2dWaWV3ZXIoc3RhdGUsIENPTkZJRykge1xuICAgIGlmIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctbG9nLW1vZGFsJyk/LnN0eWxlLmRpc3BsYXkgIT09ICdmbGV4JykgcmV0dXJuO1xuICAgIGNvbnN0IGZpbHRlclR5cGUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctbG9nLWZpbHRlci10eXBlJyk/LnZhbHVlIHx8ICdhbGwnO1xuICAgIGNvbnN0IGZpbHRlclRleHQgPSAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LWxvZy1maWx0ZXItdGV4dCcpPy52YWx1ZSB8fCAnJykudG9Mb3dlckNhc2UoKTtcbiAgICByZW5kZXJMb2dzKHN0YXRlLCBmaWx0ZXJUeXBlLCBmaWx0ZXJUZXh0KTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyTG9ncyhzdGF0ZSwgZmlsdGVyVHlwZSwgZmlsdGVyVGV4dCkge1xuICAgIGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1sb2ctZW50cmllcycpO1xuICAgIGlmICghY29udGFpbmVyKSByZXR1cm47XG5cbiAgICBjb25zdCBhbGxMb2dzID0gc3RhdGUubG9ncyB8fCBbXTtcblxuICAgIC8vIFVwZGF0ZSBsaXZlIGNvdW50ZXJzXG4gICAgY29uc3QgY291bnRBbGwgPSBhbGxMb2dzLmxlbmd0aDtcbiAgICBsZXQgY291bnRTdWNjZXNzID0gMCwgY291bnRXYXJuID0gMCwgY291bnRFcnJvciA9IDAsIGNvdW50SW5mbyA9IDA7XG4gICAgYWxsTG9ncy5mb3JFYWNoKGwgPT4ge1xuICAgICAgICBpZiAobC50eXBlID09PSAnc3VjY2VzcycpIGNvdW50U3VjY2VzcysrO1xuICAgICAgICBlbHNlIGlmIChsLnR5cGUgPT09ICd3YXJuJykgY291bnRXYXJuKys7XG4gICAgICAgIGVsc2UgaWYgKGwudHlwZSA9PT0gJ2Vycm9yJykgY291bnRFcnJvcisrO1xuICAgICAgICBlbHNlIGlmIChsLnR5cGUgPT09ICdpbmZvJykgY291bnRJbmZvKys7XG4gICAgfSk7XG5cbiAgICBjb25zdCBlbEFsbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1jb3VudC1hbGwnKTtcbiAgICBjb25zdCBlbFN1Y2Nlc3MgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctY291bnQtc3VjY2VzcycpO1xuICAgIGNvbnN0IGVsV2FybiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1jb3VudC13YXJuJyk7XG4gICAgY29uc3QgZWxFcnJvciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1jb3VudC1lcnJvcicpO1xuICAgIGNvbnN0IGVsSW5mbyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1jb3VudC1pbmZvJyk7XG5cbiAgICBpZiAoZWxBbGwpIGVsQWxsLnRleHRDb250ZW50ID0gY291bnRBbGw7XG4gICAgaWYgKGVsU3VjY2VzcykgZWxTdWNjZXNzLnRleHRDb250ZW50ID0gY291bnRTdWNjZXNzO1xuICAgIGlmIChlbFdhcm4pIGVsV2Fybi50ZXh0Q29udGVudCA9IGNvdW50V2FybjtcbiAgICBpZiAoZWxFcnJvcikgZWxFcnJvci50ZXh0Q29udGVudCA9IGNvdW50RXJyb3I7XG4gICAgaWYgKGVsSW5mbykgZWxJbmZvLnRleHRDb250ZW50ID0gY291bnRJbmZvO1xuXG4gICAgY29uc3QgZmlsdGVyZWQgPSBhbGxMb2dzLmZpbHRlcihlID0+XG4gICAgICAgIChmaWx0ZXJUeXBlID09PSAnYWxsJyB8fCBlLnR5cGUgPT09IGZpbHRlclR5cGUpICYmXG4gICAgICAgICghZmlsdGVyVGV4dCB8fCBlLm1lc3NhZ2UudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhmaWx0ZXJUZXh0KSlcbiAgICApO1xuXG4gICAgY29uc3Qgc3VtbWFyeUVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LWxvZy1zdW1tYXJ5Jyk7XG4gICAgaWYgKHN1bW1hcnlFbCkge1xuICAgICAgICBzdW1tYXJ5RWwudGV4dENvbnRlbnQgPSBgTWVuYW1waWxrYW4gJHtmaWx0ZXJlZC5sZW5ndGh9IGRhcmkgJHtjb3VudEFsbH0gcml3YXlhdCBsb2dgO1xuICAgIH1cblxuICAgIGlmIChmaWx0ZXJlZC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgY29udGFpbmVyLmlubmVySFRNTCA9IGBcbiAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBmbGV4LWRpcmVjdGlvbjogY29sdW1uOyBhbGlnbi1pdGVtczogY2VudGVyOyBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjsgaGVpZ2h0OiAxMDAlOyBjb2xvcjogIzY0NzQ4YjsgcGFkZGluZzogNDBweCAyMHB4OyB0ZXh0LWFsaWduOiBjZW50ZXI7XCI+XG4gICAgICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJjb2xvcjogIzQ3NTU2OTsgbWFyZ2luLWJvdHRvbTogMTJweDsgZGlzcGxheTogZmxleDsgdHJhbnNmb3JtOiBzY2FsZSgxLjYpO1wiPiR7SUNPTlMuZmlsZVRleHR9PC9zcGFuPlxuICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiZm9udC1zaXplOiAxMy41cHg7IGZvbnQtd2VpZ2h0OiA2MDA7IGNvbG9yOiAjOTRhM2I4OyBtYXJnaW4tYm90dG9tOiA0cHg7XCI+VGlkYWsgYWRhIHJpd2F5YXQgYWt0aXZpdGFzPC9zcGFuPlxuICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiZm9udC1zaXplOiAxMS41cHg7IGNvbG9yOiAjNjQ3NDhiO1wiPiR7Y291bnRBbGwgPT09IDAgPyAnQmVsdW0gYWRhIGFrdGl2aXRhcyB5YW5nIGRpY2F0YXQuJyA6ICdUaWRhayBhZGEgbG9nIHlhbmcgY29jb2sgZGVuZ2FuIGZpbHRlciBhdGF1IGthdGEga3VuY2kuJ308L3NwYW4+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgYDtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IEJBREdFX0NPTkZJRyA9IHtcbiAgICAgICAgc3VjY2VzczogeyB0ZXh0OiAnU1VLU0VTJywgY2xzOiAnYXctbG9nLWJhZGdlLXN1Y2Nlc3MnLCBkb3Q6ICcjMDBmZjg4JyB9LFxuICAgICAgICB3YXJuOiAgICB7IHRleHQ6ICdXQVJOJywgICBjbHM6ICdhdy1sb2ctYmFkZ2Utd2FybicsICAgIGRvdDogJyNmZmQxNjYnIH0sXG4gICAgICAgIGVycm9yOiAgIHsgdGV4dDogJ0VSUk9SJywgIGNsczogJ2F3LWxvZy1iYWRnZS1lcnJvcicsICAgZG90OiAnI2ZmNmI2YicgfSxcbiAgICAgICAgaW5mbzogICAgeyB0ZXh0OiAnSU5GTycsICAgY2xzOiAnYXctbG9nLWJhZGdlLWluZm8nLCAgICBkb3Q6ICcjMzhiZGY4JyB9XG4gICAgfTtcblxuICAgIGNvbnRhaW5lci5yZXBsYWNlQ2hpbGRyZW4oLi4uZmlsdGVyZWQubWFwKGVudHJ5ID0+IHtcbiAgICAgICAgY29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgIHJvdy5jbGFzc05hbWUgPSAnYXctbG9nLXJvdyc7XG5cbiAgICAgICAgLy8gVGltZXN0YW1wXG4gICAgICAgIGNvbnN0IHRpbWUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG4gICAgICAgIHRpbWUuY2xhc3NOYW1lID0gJ2F3LWxvZy10aW1lJztcbiAgICAgICAgdGltZS50ZXh0Q29udGVudCA9IGVudHJ5LnRpbWUgfHwgJy0tOi0tOi0tJztcblxuICAgICAgICAvLyBCYWRnZVxuICAgICAgICBjb25zdCBiYWRnZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcbiAgICAgICAgY29uc3QgYkNvbmYgPSBCQURHRV9DT05GSUdbZW50cnkudHlwZV0gfHwgQkFER0VfQ09ORklHLmluZm87XG4gICAgICAgIGJhZGdlLmNsYXNzTmFtZSA9IGBhdy1sb2ctYmFkZ2UgJHtiQ29uZi5jbHN9YDtcbiAgICAgICAgYmFkZ2UuaW5uZXJIVE1MID0gYDxzcGFuIHN0eWxlPVwid2lkdGg6NXB4O2hlaWdodDo1cHg7Ym9yZGVyLXJhZGl1czo1MCU7YmFja2dyb3VuZDoke2JDb25mLmRvdH07ZGlzcGxheTppbmxpbmUtYmxvY2s7bWFyZ2luLXJpZ2h0OjRweDtcIj48L3NwYW4+JHtiQ29uZi50ZXh0fWA7XG5cbiAgICAgICAgLy8gTWVzc2FnZVxuICAgICAgICBjb25zdCBtc2cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG4gICAgICAgIG1zZy5jbGFzc05hbWUgPSAnYXctbG9nLW1zZyc7XG4gICAgICAgIG1zZy50ZXh0Q29udGVudCA9IGVudHJ5Lm1lc3NhZ2U7XG5cbiAgICAgICAgLy8gSW5kaXZpZHVhbCBjb3B5IGJ1dHRvbiBvbiBob3ZlclxuICAgICAgICBjb25zdCBjb3B5QnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG4gICAgICAgIGNvcHlCdG4uY2xhc3NOYW1lID0gJ2F3LWxvZy1jb3B5LWJ0bic7XG4gICAgICAgIGNvcHlCdG4udGV4dENvbnRlbnQgPSAnU2FsaW4nO1xuICAgICAgICBjb3B5QnRuLnRpdGxlID0gJ1NhbGluIGJhcmlzIGxvZyBpbmknO1xuICAgICAgICBjb3B5QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcbiAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICBuYXZpZ2F0b3IuY2xpcGJvYXJkLndyaXRlVGV4dChgWyR7ZW50cnkudGltZX1dICR7ZW50cnkubWVzc2FnZX1gKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICBjb3B5QnRuLnRleHRDb250ZW50ID0gJ1RlcnNhbGluJztcbiAgICAgICAgICAgICAgICBjb3B5QnRuLnN0eWxlLmNvbG9yID0gJyMwMGZmODgnO1xuICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb3B5QnRuLnRleHRDb250ZW50ID0gJ1NhbGluJztcbiAgICAgICAgICAgICAgICAgICAgY29weUJ0bi5zdHlsZS5jb2xvciA9ICcjOTRhM2I4JztcbiAgICAgICAgICAgICAgICB9LCAxMjAwKTtcbiAgICAgICAgICAgIH0pLmNhdGNoKCgpID0+IHt9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcm93LmFwcGVuZCh0aW1lLCBiYWRnZSwgbXNnLCBjb3B5QnRuKTtcbiAgICAgICAgcmV0dXJuIHJvdztcbiAgICB9KSk7XG59XG4iLCIvKipcbiAqIGludGVyY2VwdG9yLWNsaWVudC5qcyDigJQgQ29udGVudCBTY3JpcHQgQnJpZGdlIGZvciBNYWluLVdvcmxkIEludGVyY2VwdG9yXG4gKlxuICogUnVucyBpbiB0aGUgSVNPTEFURUQgd29ybGQgKGluc2lkZSBkaXN0L2NvbnRlbnQuanMpLlxuICogTGlzdGVucyBmb3IgbWVzc2FnZXMgZGlzcGF0Y2hlZCBieSBpbnRlcmNlcHRvci5qcyAoTUFJTiB3b3JsZCkuXG4gKiBEaXJlY3RseSB1cGRhdGVzIGVuZXJneSBzdGF0ZSwgdG9rZW5zLCBhbmQgd29yayBzdGF0cyBmcm9tIHJhdyBzZXJ2ZXIgSlNPTi5cbiAqL1xuXG5pbXBvcnQgeyBwYXRjaFBhZ2VWaXN1YWxFbmVyZ3kgfSBmcm9tICcuL2VuZXJneS5qcyc7XG5cbmNvbnN0IE1TR19TT1VSQ0UgPSAnUEFSTEFNRU5UVU1fSU5URVJDRVBUT1InO1xuY29uc3QgRVhUX1NPVVJDRSA9ICdQQVJMQU1FTlRVTV9FWFRFTlNJT04nO1xuXG5leHBvcnQgZnVuY3Rpb24gaW5pdEludGVyY2VwdG9yQ2xpZW50KHN0YXRlLCBDT05GSUcsIGN0eCkge1xuICAgIGlmIChzdGF0ZS5faW50ZXJjZXB0b3JDbGllbnRJbml0aWFsaXplZCkgcmV0dXJuO1xuICAgIHN0YXRlLl9pbnRlcmNlcHRvckNsaWVudEluaXRpYWxpemVkID0gdHJ1ZTtcblxuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgKGV2ZW50KSA9PiB7XG4gICAgICAgIGlmICghZXZlbnQgfHwgZXZlbnQuc291cmNlICE9PSB3aW5kb3cpIHJldHVybjtcbiAgICAgICAgY29uc3QgbXNnID0gZXZlbnQuZGF0YTtcbiAgICAgICAgaWYgKCFtc2cgfHwgbXNnLnNvdXJjZSAhPT0gTVNHX1NPVVJDRSkgcmV0dXJuO1xuXG4gICAgICAgIHN3aXRjaCAobXNnLnR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgJ1JFQURZJzpcbiAgICAgICAgICAgIGNhc2UgJ1BPTkcnOlxuICAgICAgICAgICAgICAgIHN0YXRlLmludGVyY2VwdG9yQWN0aXZlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAnQVVUSF9UT0tFTic6XG4gICAgICAgICAgICAgICAgaWYgKG1zZy50b2tlbiAmJiB0eXBlb2YgbXNnLnRva2VuID09PSAnc3RyaW5nJyAmJiBtc2cudG9rZW4gIT09IHN0YXRlLmN1cnJlbnRUb2tlbikge1xuICAgICAgICAgICAgICAgICAgICBpZiAoY3R4Py5oYW5kbGVOZXdUb2tlbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY3R4LmhhbmRsZU5ld1Rva2VuKG1zZy50b2tlbiwgJ25ldHdvcmtfaW50ZXJjZXB0b3InKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAnRU5FUkdZX1NZTkMnOlxuICAgICAgICAgICAgICAgIF9oYW5kbGVFbmVyZ3lTeW5jKHN0YXRlLCBtc2csIGN0eCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgJ1dPUktfU1VDQ0VTUyc6XG4gICAgICAgICAgICAgICAgX2hhbmRsZVdvcmtTdWNjZXNzKHN0YXRlLCBtc2csIGN0eCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgJ1dPUktfUkVKRUNURUQnOlxuICAgICAgICAgICAgICAgIF9oYW5kbGVXb3JrUmVqZWN0ZWQoc3RhdGUsIG1zZywgY3R4KTtcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gMS4gU2VuZCBQaW5nIHRvIGNoZWNrIGlmIGludGVyY2VwdG9yLmpzIGlzIGFscmVhZHkgcnVubmluZyBmcm9tIG1hbmlmZXN0IHdvcmxkOiBcIk1BSU5cIlxuICAgIHRyeSB7XG4gICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSh7IHNvdXJjZTogRVhUX1NPVVJDRSwgYWN0aW9uOiAnUElORycgfSwgJyonKTtcbiAgICB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblxuICAgIC8vIDIuIEZhbGxiYWNrOiBJZiBub3QgYWN0aXZlIGFmdGVyIDM1MG1zLCBkeW5hbWljYWxseSBpbmplY3QgaW50ZXJjZXB0b3IuanMgYXMgYSBzY3JpcHQgdGFnXG4gICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIGlmICghc3RhdGUuaW50ZXJjZXB0b3JBY3RpdmUgJiYgY2hyb21lLnJ1bnRpbWU/LmdldFVSTCkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBzY3JpcHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzY3JpcHQnKTtcbiAgICAgICAgICAgICAgICBzY3JpcHQuc3JjID0gY2hyb21lLnJ1bnRpbWUuZ2V0VVJMKCdpbnRlcmNlcHRvci5qcycpO1xuICAgICAgICAgICAgICAgIHNjcmlwdC5hc3luYyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIChkb2N1bWVudC5oZWFkIHx8IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCkuYXBwZW5kQ2hpbGQoc2NyaXB0KTtcbiAgICAgICAgICAgICAgICBzY3JpcHQub25sb2FkID0gKCkgPT4gc2NyaXB0LnJlbW92ZSgpO1xuICAgICAgICAgICAgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG4gICAgICAgIH1cbiAgICB9LCAzNTApO1xufVxuXG5mdW5jdGlvbiBfaGFuZGxlRW5lcmd5U3luYyhzdGF0ZSwgbXNnLCBjdHgpIHtcbiAgICBjb25zdCBjdXJSYXcgPSBtc2cuY3VycmVudEVuZXJneTtcbiAgICBjb25zdCBtYXhSYXcgPSBtc2cubWF4RW5lcmd5O1xuXG4gICAgbGV0IHVwZGF0ZWQgPSBmYWxzZTtcblxuICAgIGlmICh0eXBlb2YgY3VyUmF3ID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNGaW5pdGUoY3VyUmF3KSkge1xuICAgICAgICBjb25zdCBjdXIgPSBNYXRoLm1heCgwLCBNYXRoLnJvdW5kKGN1clJhdykpO1xuICAgICAgICBzdGF0ZS5jdXJyZW50RW5lcmd5ID0gY3VyO1xuICAgICAgICB1cGRhdGVkID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIG1heFJhdyA9PT0gJ251bWJlcicgJiYgTnVtYmVyLmlzRmluaXRlKG1heFJhdykgJiYgbWF4UmF3ID4gMCkge1xuICAgICAgICBzdGF0ZS5tYXhFbmVyZ3kgPSBNYXRoLnJvdW5kKG1heFJhdyk7XG4gICAgICAgIHVwZGF0ZWQgPSB0cnVlO1xuICAgIH1cblxuICAgIGlmICh1cGRhdGVkKSB7XG4gICAgICAgIHN0YXRlLmVuZXJneVN5bmNCYXNlID0ge1xuICAgICAgICAgICAgY3VycmVudDogc3RhdGUuY3VycmVudEVuZXJneSxcbiAgICAgICAgICAgIG1heDogc3RhdGUubWF4RW5lcmd5IHx8IDExMCxcbiAgICAgICAgICAgIHVwZGF0ZWRBdDogRGF0ZS5ub3coKVxuICAgICAgICB9O1xuICAgICAgICBjdHg/LnVwZGF0ZVBhbmVsPy4oKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIF9oYW5kbGVXb3JrU3VjY2VzcyhzdGF0ZSwgbXNnLCBjdHgpIHtcbiAgICBjb25zdCByYXdVc2VkID0gTnVtYmVyKG1zZy5lbmVyZ3lVc2VkKSB8fCBOdW1iZXIobXNnLnJhdz8uZW5lcmd5VXNlZCkgfHwgMDtcbiAgICBjb25zdCB1c2VkID0gcmF3VXNlZCA+PSAxMCA/IHJhd1VzZWQgOiAxMDtcbiAgICAvLyBJbiBQYXJsYW1lbnR1bSwgZWFjaCBibG9jayBvZiAxMCBlbmVyZ3kgeWllbGRzIDQgWFBcbiAgICBjb25zdCBjYWxjdWxhdGVkWHAgPSBNYXRoLm1heCg0LCBNYXRoLmZsb29yKHVzZWQgLyAxMCkgKiA0KTtcbiAgICBjb25zdCB4cCA9IE51bWJlcihtc2cueHBFYXJuZWQpID4gMCA/IE51bWJlcihtc2cueHBFYXJuZWQpIDogY2FsY3VsYXRlZFhwO1xuICAgIGNvbnN0IHVuaXRzID0gTnVtYmVyKG1zZy53b3JrZXJVbml0cykgfHwgTnVtYmVyKG1zZy5wcm9kdWNlZCkgfHwgTnVtYmVyKG1zZy5yYXc/LndvcmtlclVuaXRzKSB8fCBOdW1iZXIobXNnLnJhdz8ucHJvZHVjZWQpIHx8IDA7XG5cbiAgICAvLyBJZiBleHRlbnNpb24gaW5pdGlhdGVkIHRoZSBmZXRjaCBkaXJlY3RseSwgd29yay5qcyBhbHJlYWR5IG1hbmFnZXMgc3RhdGUgJiBsb2dnaW5nXG4gICAgaWYgKHN0YXRlLndvcmtJbkZsaWdodCAmJiAhc3RhdGUud29ya1RyaWdnZXJlZFZpYURvbSkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3Qgd2FzRG9tVHJpZ2dlcmVkID0gQm9vbGVhbihzdGF0ZS53b3JrVHJpZ2dlcmVkVmlhRG9tKTtcbiAgICBzdGF0ZS53b3JrVHJpZ2dlcmVkVmlhRG9tID0gZmFsc2U7XG4gICAgc3RhdGUud29ya0luRmxpZ2h0ID0gZmFsc2U7XG5cbiAgICBpZiAobXNnLnJlbWFpbmluZ0VuZXJneSAhPSBudWxsICYmIHR5cGVvZiBtc2cucmVtYWluaW5nRW5lcmd5ID09PSAnbnVtYmVyJykge1xuICAgICAgICBzdGF0ZS5jdXJyZW50RW5lcmd5ID0gTWF0aC5tYXgoMCwgTWF0aC5yb3VuZChtc2cucmVtYWluaW5nRW5lcmd5KSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgc3RhdGUuY3VycmVudEVuZXJneSA9IE1hdGgubWF4KDAsIChzdGF0ZS5jdXJyZW50RW5lcmd5IHx8IDApIC0gdXNlZCk7XG4gICAgfVxuXG4gICAgc3RhdGUuZW5lcmd5U3luY0Jhc2UgPSB7XG4gICAgICAgIGN1cnJlbnQ6IHN0YXRlLmN1cnJlbnRFbmVyZ3ksXG4gICAgICAgIG1heDogc3RhdGUubWF4RW5lcmd5IHx8IDExMCxcbiAgICAgICAgdXBkYXRlZEF0OiBEYXRlLm5vdygpXG4gICAgfTtcblxuICAgIGNvbnN0IG5vd1N0ciA9IG5ldyBEYXRlKCkudG9Mb2NhbGVUaW1lU3RyaW5nKCdpZC1JRCcpO1xuICAgIHN0YXRlLndvcmtUb2RheSA9IChzdGF0ZS53b3JrVG9kYXkgfHwgMCkgKyAxO1xuICAgIHN0YXRlLnRvdGFsV29ya2VkID0gKHN0YXRlLnRvdGFsV29ya2VkIHx8IDApICsgMTtcbiAgICBzdGF0ZS54cFRvZGF5ID0gKHN0YXRlLnhwVG9kYXkgfHwgMCkgKyB4cDtcbiAgICBzdGF0ZS50b3RhbFdvcmtYUCA9IChzdGF0ZS50b3RhbFdvcmtYUCB8fCAwKSArIHhwO1xuICAgIHN0YXRlLmxhc3RXb3JrVGltZSA9IG5vd1N0cjtcbiAgICBzdGF0ZS5sYXN0V29ya1RpbWVzdGFtcCA9IERhdGUubm93KCk7XG4gICAgaWYgKGN0eD8uZ2V0TmV4dFdvcmtEZWxheSkge1xuICAgICAgICBzdGF0ZS5uZXh0V29ya1RpbWVzdGFtcCA9IERhdGUubm93KCkgKyBjdHguZ2V0TmV4dFdvcmtEZWxheShzdGF0ZSk7XG4gICAgfVxuXG4gICAgY3R4Py5zZXRWYWx1ZT8uKCd3b3JrVG9kYXknLCBzdGF0ZS53b3JrVG9kYXkpO1xuICAgIGN0eD8uc2V0VmFsdWU/LigndG90YWxXb3JrZWQnLCBzdGF0ZS50b3RhbFdvcmtlZCk7XG4gICAgY3R4Py5zZXRWYWx1ZT8uKCd4cFRvZGF5Jywgc3RhdGUueHBUb2RheSk7XG4gICAgY3R4Py5zZXRWYWx1ZT8uKCd0b3RhbFdvcmtYUCcsIHN0YXRlLnRvdGFsV29ya1hQKTtcblxuICAgIGNvbnN0IHVuaXRzUGFydCA9IHVuaXRzID4gMCA/IGAgfCArJHt1bml0c30gdW5pdGAgOiAnJztcbiAgICBjb25zdCBsb2dNc2cgPSB3YXNEb21UcmlnZ2VyZWRcbiAgICAgICAgPyBgS2VyamEgc3Vrc2VzISArJHt4cH0gWFAke3VuaXRzUGFydH0gfCBTaXNhOiAke3N0YXRlLmN1cnJlbnRFbmVyZ3l9LyR7c3RhdGUubWF4RW5lcmd5fSBFTmBcbiAgICAgICAgOiBgU2hpZnQgZGkgZ2FtZSB0ZXJkZXRla3NpOiArJHt4cH0gWFAke3VuaXRzUGFydH0gfCBTaXNhOiAke3N0YXRlLmN1cnJlbnRFbmVyZ3l9IEVOYDtcbiAgICBjdHg/LmxvZz8uKGxvZ01zZywgJ3N1Y2Nlc3MnKTtcbiAgICBjdHg/LnVwZGF0ZVBhbmVsPy4oKTtcblxuICAgIC8vIEFmdGVyIDYwMG1zLCBzeW5jIGdyb3VuZC10cnV0aCBlbmVyZ3kgZnJvbSB0aGUgbmV3bHkgdXBkYXRlZCBwYWdlIERPTVxuICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICBjb25zdCBmcmVzaCA9IGN0eD8uZ2V0Q3VycmVudEVuZXJneT8uKCk7XG4gICAgICAgIGlmIChmcmVzaCAmJiBmcmVzaC5jdXJyZW50ICE9PSBzdGF0ZS5jdXJyZW50RW5lcmd5KSB7XG4gICAgICAgICAgICBzdGF0ZS5jdXJyZW50RW5lcmd5ID0gZnJlc2guY3VycmVudDtcbiAgICAgICAgICAgIHN0YXRlLm1heEVuZXJneSA9IGZyZXNoLm1heDtcbiAgICAgICAgICAgIHN0YXRlLmVuZXJneVN5bmNCYXNlID0geyBjdXJyZW50OiBmcmVzaC5jdXJyZW50LCBtYXg6IGZyZXNoLm1heCwgdXBkYXRlZEF0OiBEYXRlLm5vdygpIH07XG4gICAgICAgICAgICBjdHg/LnVwZGF0ZVBhbmVsPy4oKTtcbiAgICAgICAgfVxuICAgIH0sIDYwMCk7XG59XG5cbmZ1bmN0aW9uIF9oYW5kbGVXb3JrUmVqZWN0ZWQoc3RhdGUsIG1zZywgY3R4KSB7XG4gICAgY29uc3QgZXJyb3JNc2cgPSBTdHJpbmcobXNnLm1lc3NhZ2UgfHwgbXNnLnJhdz8ubWVzc2FnZSB8fCAnJyk7XG4gICAgaWYgKC9ub3QgZW5vdWdoIGVuZXJneXxlbmVyZ2kgdGlkYWsgY3VrdXB8a3VyYW5nL2kudGVzdChlcnJvck1zZykpIHtcbiAgICAgICAgc3RhdGUuY3VycmVudEVuZXJneSA9IDA7XG4gICAgICAgIHN0YXRlLmVuZXJneVN5bmNCYXNlID0ge1xuICAgICAgICAgICAgY3VycmVudDogMCxcbiAgICAgICAgICAgIG1heDogc3RhdGUubWF4RW5lcmd5IHx8IDExMCxcbiAgICAgICAgICAgIHVwZGF0ZWRBdDogRGF0ZS5ub3coKVxuICAgICAgICB9O1xuICAgICAgICBwYXRjaFBhZ2VWaXN1YWxFbmVyZ3koMCwgc3RhdGUubWF4RW5lcmd5LCB0cnVlKTtcbiAgICAgICAgY3R4Py51cGRhdGVQYW5lbD8uKCk7XG4gICAgfVxufVxuIiwiLyoqXG4gKiBtYWluLmpzIOKAlCBFbnRyeSBwb2ludCBmb3IgdGhlIENocm9tZSBFeHRlbnNpb24gY29udGVudCBzY3JpcHRcbiAqXG4gKiBXaXJlcyB0b2dldGhlciBhbGwgbW9kdWxlcyBhbmQgcnVucyB0aGUgbWFpbiB3b3JrZXIgbG9vcC5cbiAqIFZpdGUgYnVuZGxlcyB0aGlzICsgYWxsIGltcG9ydHMgaW50byBkaXN0L2NvbnRlbnQuanMuXG4gKi9cblxuaW1wb3J0IHsgaW5pdFN0b3JhZ2UsIGdldFZhbHVlLCBzZXRWYWx1ZSwgb25TdG9yYWdlQ2hhbmdlZCB9IGZyb20gJy4vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBsb2FkQ29uZmlnLCBzYXZlQ29uZmlnLCBub3JtYWxpemVDb25maWcgfSAgICAgICAgICAgZnJvbSAnLi9jb25maWcuanMnO1xuaW1wb3J0IHsgY3JlYXRlSW5pdGlhbFN0YXRlLCBzYXZlU3RhdGUsIHNhdmVMaXZlU3RhdHVzLCByZWxvYWRTdGF0ZUZyb21TdG9yYWdlLCBnZXRTdG9yZWRJbnRlZ2VyIH0gZnJvbSAnLi9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBsb2FkV29ya0hpc3RvcnksIHNhdmVXb3JrSGlzdG9yeSB9ICAgICAgICAgICAgICAgICAgIGZyb20gJy4vaGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBsb2cgYXMgX2xvZywgc2V0TG9nVXBkYXRlQ2FsbGJhY2sgfSAgICAgICAgICAgICAgICAgIGZyb20gJy4vbG9nZ2VyLmpzJztcbmltcG9ydCB7IHBhcnNlSnd0LCBoYW5kbGVOZXdUb2tlbiBhcyBfaGFuZGxlTmV3VG9rZW4sIGdldFRva2VuRnJvbVN0b3JhZ2UgYXMgX2dldFRva2VuRnJvbVN0b3JhZ2UsXG4gICAgICAgICBnZXRUaW1lVW50aWxFeHBpcnksIHN0YXJ0VG9rZW5XYXRjaGVyIH0gICAgICAgICAgICAgIGZyb20gJy4vdG9rZW4uanMnO1xuaW1wb3J0IHsgZ2V0U3luY2VkRW5lcmd5LCBnZXRDdXJyZW50RW5lcmd5LCB3YWl0Rm9yRW5lcmd5RWxlbWVudCwgZ2V0UGxheWVyTGV2ZWwsIGdldE1heEVuZXJneUZvckxldmVsLFxuICAgICAgICAgZ2V0TGl2ZUNvdW50ZG93biwgZ2V0VGltZVRvRnVsbEVuZXJneSwgZ2V0TmV4dFdvcmtEZWxheSwgcGF0Y2hQYWdlVmlzdWFsRW5lcmd5LCBnZXRSZWdpb25IZWFsdGhCb251cywgZ2V0UmVnaW9uRGV0YWlscyB9IGZyb20gJy4vZW5lcmd5LmpzJztcbmltcG9ydCB7IHNlbmROb3RpZmljYXRpb24sIHBsYXlOb3RpZmljYXRpb25Tb3VuZCwgcGxheUVuZXJneUZ1bGxBbGFybSwgc2hvd0luUGFnZU5vdGlmaWNhdGlvbiB9IGZyb20gJy4vbm90aWZpY2F0aW9ucy5qcyc7XG5pbXBvcnQgeyBkb1dvcmsgfSAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZyb20gJy4vd29yay5qcyc7XG5pbXBvcnQgeyBjcmVhdGVQYW5lbCwgdXBkYXRlUGFuZWwgYXMgX3VwZGF0ZVBhbmVsLCBzZXRSdW5uaW5nVUksIHVwZGF0ZVBhbmVsVmlzaWJpbGl0eSB9IGZyb20gJy4vdWkvcGFuZWwuanMnO1xuaW1wb3J0IHsgY3JlYXRlU2V0dGluZ3NNb2RhbCwgb3BlblNldHRpbmdzIH0gICAgICAgICAgICAgICAgICBmcm9tICcuL3VpL3NldHRpbmdzLmpzJztcbmltcG9ydCB7IGNyZWF0ZUxvZ1ZpZXdlciwgb3BlbkxvZ1ZpZXdlciwgdXBkYXRlTG9nVmlld2VyIH0gICAgZnJvbSAnLi91aS9sb2d2aWV3ZXIuanMnO1xuaW1wb3J0IHsgc2V0dXBMb2dpbkNhcHR1cmUsIHRyeUF1dG9Mb2dpbiwgZ2V0U2F2ZWRDcmVkZW50aWFscyB9IGZyb20gJy4vYXV0b2xvZ2luLmpzJztcbmltcG9ydCB7IGluaXRJbnRlcmNlcHRvckNsaWVudCB9ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZnJvbSAnLi9pbnRlcmNlcHRvci1jbGllbnQuanMnO1xuXG4vLyDilIDilIDilIAgQm9vdHN0cmFwIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG4oYXN5bmMgZnVuY3Rpb24gYm9vdHN0cmFwKCkge1xuICAgICd1c2Ugc3RyaWN0JztcblxuICAgIC8vIDEuIExvYWQgYWxsIHBlcnNpc3RlbnQgZGF0YSBzeW5jaHJvbm91c2x5IGludG8gY2FjaGVcbiAgICBhd2FpdCBpbml0U3RvcmFnZSgpO1xuXG4gICAgLy8gMi4gQ29uZmlnXG4gICAgY29uc3QgQ09ORklHID0gbG9hZENvbmZpZygpO1xuXG4gICAgLy8gMy4gU2Vzc2lvbiBzdGFydCB0aW1lIHBlcnNpc3RlbmNlXG4gICAgY29uc3QgdG9kYXlTdHIgPSBuZXcgRGF0ZSgpLnRvRGF0ZVN0cmluZygpO1xuICAgIGNvbnN0IHNhdmVkU3RhcnREYXkgPSBnZXRWYWx1ZSgnc2Vzc2lvblN0YXJ0RGF5JywgJycpO1xuICAgIGxldCBzYXZlZFN0YXJ0VGltZSAgPSBnZXRTdG9yZWRJbnRlZ2VyKCdzZXNzaW9uU3RhcnRUaW1lJywgRGF0ZS5ub3coKSwgMSk7XG5cbiAgICBpZiAoc2F2ZWRTdGFydERheSAhPT0gdG9kYXlTdHIpIHtcbiAgICAgICAgc2F2ZWRTdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuICAgICAgICBzZXRWYWx1ZSgnc2Vzc2lvblN0YXJ0VGltZScsIHNhdmVkU3RhcnRUaW1lLnRvU3RyaW5nKCkpO1xuICAgICAgICBzZXRWYWx1ZSgnc2Vzc2lvblN0YXJ0RGF5JywgdG9kYXlTdHIpO1xuICAgIH1cblxuICAgIC8vIDQuIFVuY2VydGFpbiB3b3JrIHN0YXRlIGZyb20gcHJldmlvdXMgc2Vzc2lvblxuICAgIGNvbnN0IGhhc1VuY2VydGFpbldvcmtSZXN1bHQgPSBnZXRWYWx1ZSgnYXdfd29ya1Jlc3VsdFVuY2VydGFpbicsICdmYWxzZScpID09PSAndHJ1ZSc7XG4gICAgbGV0IHVuY2VydGFpbkVuZXJneUJlZm9yZSA9IG51bGw7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmF3ID0gZ2V0VmFsdWUoJ2F3X3VuY2VydGFpbkVuZXJneUJlZm9yZScsICcnKTtcbiAgICAgICAgdW5jZXJ0YWluRW5lcmd5QmVmb3JlID0gcmF3ID8gSlNPTi5wYXJzZShyYXcpIDogbnVsbDtcbiAgICB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblxuICAgIC8vIDUuIFN0YXRlXG4gICAgY29uc3Qgc3RhdGUgPSBjcmVhdGVJbml0aWFsU3RhdGUoQ09ORklHLCBzYXZlZFN0YXJ0VGltZSwgaGFzVW5jZXJ0YWluV29ya1Jlc3VsdCk7XG4gICAgbGV0IHdvcmtIaXN0b3J5ID0gbG9hZFdvcmtIaXN0b3J5KHN0YXRlLCBDT05GSUcpO1xuXG4gICAgLy8gNi4gU2NoZW1hIG1pZ3JhdGlvbiAocnVuIG9uY2UgcGVyIGluc3RhbGwpXG4gICAgX3J1bk1pZ3JhdGlvbnMoc3RhdGUsIENPTkZJRywgd29ya0hpc3RvcnkpO1xuXG4gICAgLy8g4pSA4pSA4pSAIEJvdW5kIGhlbHBlcnMg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbiAgICBjb25zdCBsb2cgICAgICAgID0gKG1zZywgdHlwZSwgdG9Mb2cpID0+IF9sb2coc3RhdGUsIENPTkZJRywgbXNnLCB0eXBlLCB0b0xvZyk7XG4gICAgY29uc3QgaGFuZGxlTmV3VG9rZW4gPSAocmF3LCBzcmMpICAgID0+IF9oYW5kbGVOZXdUb2tlbihzdGF0ZSwgbG9nLCAoKSA9PiB3YWtlUGVuZGluZ1dvcms/LigpLCByYXcsIHNyYywgKCkgPT4gc2V0UnVubmluZ1VJKHRydWUpLCAoKSA9PiB1cGRhdGVQYW5lbCgpKTtcbiAgICBjb25zdCBnZXRUb2tlbkZuICAgICA9ICgpICAgICAgICAgICAgPT4gX2dldFRva2VuRnJvbVN0b3JhZ2Uoc3RhdGUsIGhhbmRsZU5ld1Rva2VuKTtcblxuICAgIC8vIENvbnRleHQgb2JqZWN0IHBhc3NlZCB0byBkb1dvcmsgYW5kIFVJIG1vZHVsZXNcbiAgICBjb25zdCBjdHggPSB7XG4gICAgICAgIHN0YXRlLCBDT05GSUcsXG4gICAgICAgIGdldCB3b3JrSGlzdG9yeSgpIHsgcmV0dXJuIHdvcmtIaXN0b3J5OyB9LFxuICAgICAgICBzZXQgd29ya0hpc3RvcnkodmFsKSB7IHdvcmtIaXN0b3J5ID0gdmFsOyB9LFxuICAgICAgICBsb2csXG4gICAgICAgIGhhbmRsZU5ld1Rva2VuLFxuICAgICAgICBzZXRSdW5uaW5nVUk6ICAgICAgKHJ1bm5pbmcpICAgICA9PiBzZXRSdW5uaW5nVUkocnVubmluZyksXG4gICAgICAgIHNlbmROb3RpZmljYXRpb246ICAgICAgKGFyZzEsIGFyZzIsIGFyZzMpID0+IHNlbmROb3RpZmljYXRpb24oYXJnMSA9PT0gQ09ORklHID8gYXJnMiA6IGFyZzEsIGFyZzEgPT09IENPTkZJRyA/IGFyZzMgOiBhcmcyKSxcbiAgICAgICAgcGxheU5vdGlmaWNhdGlvblNvdW5kOiAoYXJnMSwgYXJnMikgICAgICAgPT4gcGxheU5vdGlmaWNhdGlvblNvdW5kKGFyZzEsIGFyZzIpLFxuICAgICAgICBwbGF5RW5lcmd5RnVsbEFsYXJtOiAgIChjZmcpICAgICAgICAgICAgICA9PiBwbGF5RW5lcmd5RnVsbEFsYXJtKGNmZyB8fCBDT05GSUcpLFxuICAgICAgICB1cGRhdGVQYW5lbDogICAgICAgICAgICgpICAgICAgICAgICAgICAgICA9PiB1cGRhdGVQYW5lbCgpLFxuICAgICAgICB1cGRhdGVQYW5lbFZpc2liaWxpdHk6IChjZmcpICAgICAgICAgICAgICA9PiB1cGRhdGVQYW5lbFZpc2liaWxpdHkoc3RhdGUsIGNmZyB8fCBDT05GSUcpLFxuICAgICAgICB3YWtlUGVuZGluZ1dvcms6ICAgICAgICgpICAgICAgICAgICAgICAgICA9PiB3YWtlUGVuZGluZ1dvcms/LigpLFxuICAgICAgICBzZXRWYWx1ZSxcbiAgICAgICAgZ2V0IHVuY2VydGFpbkVuZXJneUJlZm9yZSgpIHsgcmV0dXJuIHVuY2VydGFpbkVuZXJneUJlZm9yZTsgfSxcbiAgICAgICAgc2V0IHVuY2VydGFpbkVuZXJneUJlZm9yZSh2YWwpIHsgdW5jZXJ0YWluRW5lcmd5QmVmb3JlID0gdmFsOyB9LFxuICAgICAgICByZWNvbmNpbGVVbmNlcnRhaW5Xb3JrLFxuICAgICAgICAvLyBFbmVyZ3kgaGVscGVycyBleHBlY3RlZCBieSBwYW5lbC5qc1xuICAgICAgICBnZXRTeW5jZWRFbmVyZ3k6ICAgICAgICAoc3QpICAgICA9PiBnZXRTeW5jZWRFbmVyZ3koc3QpLFxuICAgICAgICBnZXRQbGF5ZXJMZXZlbDogICAgICAgICAoc3QpICAgICA9PiBnZXRQbGF5ZXJMZXZlbChzdCksXG4gICAgICAgIGdldE1heEVuZXJneUZvckxldmVsOiAgIChsdmwpICAgID0+IGdldE1heEVuZXJneUZvckxldmVsKGx2bCksXG4gICAgICAgIGdldExpdmVDb3VudGRvd246ICAgICAgIChzdCkgICAgID0+IGdldExpdmVDb3VudGRvd24oc3QsIENPTkZJRyksXG4gICAgICAgIGdldFRpbWVUb0Z1bGxFbmVyZ3k6ICAgIChzdCkgICAgID0+IGdldFRpbWVUb0Z1bGxFbmVyZ3koc3QpLFxuICAgICAgICBnZXROZXh0V29ya0RlbGF5OiAgICAgICAoc3QpICAgICA9PiBnZXROZXh0V29ya0RlbGF5KHN0LCBDT05GSUcpLFxuICAgICAgICBnZXRSZWdpb25EZXRhaWxzOiAgICAgICAoZm9yY2UgPSBmYWxzZSkgPT4gZ2V0UmVnaW9uRGV0YWlscyhmb3JjZSksXG4gICAgICAgIC8vIEFjdGlvbiBoZWxwZXJzIGV4cGVjdGVkIGJ5IHBhbmVsLmpzXG4gICAgICAgIGRvV29yazogICAgICAgICAgICAobWFudWFsID0gZmFsc2UpID0+IGRvV29yayhjdHgsIG1hbnVhbCksXG4gICAgICAgIG9wZW5TZXR0aW5nczogICAgICAoKSAgICAgICAgICAgID0+IG9wZW5TZXR0aW5ncyhDT05GSUcsIGN0eCksXG4gICAgICAgIG9wZW5Mb2dWaWV3ZXI6ICAgICAoKSAgICAgICAgICAgID0+IG9wZW5Mb2dWaWV3ZXIoc3RhdGUsIENPTkZJRyksXG4gICAgICAgIHNhdmVDb25maWc6ICAgICAgICAoY2ZnKSAgICAgICAgID0+IHNhdmVDb25maWcoY2ZnKSxcbiAgICAgICAgcmVsb2FkU3RhdGVGcm9tU3RvcmFnZTogKCkgICAgICAgPT4gcmVsb2FkU3RhdGVGcm9tU3RvcmFnZShzdGF0ZSwgKCkgPT4geyB3b3JrSGlzdG9yeSA9IGxvYWRXb3JrSGlzdG9yeShzdGF0ZSwgQ09ORklHKTsgfSksXG4gICAgICAgIHBhdGNoUGFnZVZpc3VhbEVuZXJneTogIChjdXIsIG1heCwgZm9yY2UpID0+IHBhdGNoUGFnZVZpc3VhbEVuZXJneShjdXIsIG1heCwgZm9yY2UpLFxuICAgIH07XG5cbiAgICAvLyDilIDilIDilIAgTWFpbi1Xb3JsZCBOZXR3b3JrIEludGVyY2VwdG9yIEJyaWRnZSDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgICBpbml0SW50ZXJjZXB0b3JDbGllbnQoc3RhdGUsIENPTkZJRywgY3R4KTtcblxuICAgIC8vIOKUgOKUgOKUgCBVSSB3aXJpbmcg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbiAgICBzZXRMb2dVcGRhdGVDYWxsYmFjaygoKSA9PiB1cGRhdGVMb2dWaWV3ZXIoc3RhdGUsIENPTkZJRykpO1xuXG4gICAgZnVuY3Rpb24gdXBkYXRlUGFuZWwoKSB7XG4gICAgICAgIF91cGRhdGVQYW5lbChzdGF0ZSwgQ09ORklHLCB3b3JrSGlzdG9yeSwgY3R4KTtcbiAgICB9XG5cbiAgICAvLyDilIDilIDilIAgRGFpbHkgcmVzZXQg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbiAgICBmdW5jdGlvbiBjaGVja0RhaWx5UmVzZXQoKSB7XG4gICAgICAgIGlmICghY2hyb21lLnJ1bnRpbWU/LmlkKSByZXR1cm47XG4gICAgICAgIGNvbnN0IHRvZGF5ID0gbmV3IERhdGUoKS50b0RhdGVTdHJpbmcoKTtcbiAgICAgICAgaWYgKHN0YXRlLmxhc3RXb3JrRGF0ZSA9PT0gdG9kYXkpIHJldHVybjtcbiAgICAgICAgc3RhdGUud29ya1RvZGF5ICA9IDA7XG4gICAgICAgIHN0YXRlLnhwVG9kYXkgICAgPSAwO1xuICAgICAgICBzdGF0ZS5sYXN0V29ya0RhdGUgPSB0b2RheTtcbiAgICAgICAgc3RhdGUuc2Vzc2lvblN0YXJ0VGltZSA9IERhdGUubm93KCk7XG4gICAgICAgIHNldFZhbHVlKCdzZXNzaW9uU3RhcnRUaW1lJywgc3RhdGUuc2Vzc2lvblN0YXJ0VGltZS50b1N0cmluZygpKTtcbiAgICAgICAgc2V0VmFsdWUoJ3Nlc3Npb25TdGFydERheScsIHRvZGF5KTtcbiAgICAgICAgaWYgKCF3b3JrSGlzdG9yeVt0b2RheV0pIHdvcmtIaXN0b3J5W3RvZGF5XSA9IHsgc2hpZnRzOiAwLCB4cDogMCB9O1xuICAgICAgICBzZXRWYWx1ZSgnd29ya1RvZGF5JywgJzAnKTtcbiAgICAgICAgc2V0VmFsdWUoJ3hwVG9kYXknLCAnMCcpO1xuICAgICAgICBzZXRWYWx1ZSgnbGFzdFdvcmtEYXRlJywgdG9kYXkpO1xuICAgICAgICBzYXZlV29ya0hpc3Rvcnkod29ya0hpc3RvcnkpO1xuICAgICAgICBsb2coJ0hhcmkgYmVyZ2FudGkuIENvdW50ZXIgJiBzZXNpIGRpLXJlc2V0LicsICdpbmZvJyk7XG4gICAgICAgIHVwZGF0ZVBhbmVsKCk7XG4gICAgfVxuXG4gICAgLy8g4pSA4pSA4pSAIFVuY2VydGFpbiB3b3JrIHJlY29uY2lsaWF0aW9uIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG4gICAgZnVuY3Rpb24gcmVjb25jaWxlVW5jZXJ0YWluV29yaygpIHtcbiAgICAgICAgaWYgKCFjaHJvbWUucnVudGltZT8uaWQpIHJldHVybjtcbiAgICAgICAgaWYgKCFzdGF0ZS53b3JrUmVzdWx0VW5jZXJ0YWluIHx8ICF1bmNlcnRhaW5FbmVyZ3lCZWZvcmUpIHJldHVybjtcbiAgICAgICAgY29uc3QgY3VyciA9IGdldEN1cnJlbnRFbmVyZ3koKTtcbiAgICAgICAgaWYgKCFjdXJyKSByZXR1cm47XG4gICAgICAgIGlmIChjdXJyLmN1cnJlbnQgPCB1bmNlcnRhaW5FbmVyZ3lCZWZvcmUuY3VycmVudCkge1xuICAgICAgICAgICAgaWYgKHN0YXRlLnVuY2VydGFpblJlY29uY2lsaWF0aW9uICE9PSAnZW5lcmd5X2NoYW5nZWQnKSB7XG4gICAgICAgICAgICAgICAgc3RhdGUudW5jZXJ0YWluUmVjb25jaWxpYXRpb24gPSAnZW5lcmd5X2NoYW5nZWQnO1xuICAgICAgICAgICAgICAgIGxvZyhgUGVydWJhaGFuIGVuZXJnaSB0ZXJkZXRla3NpICgke3VuY2VydGFpbkVuZXJneUJlZm9yZS5jdXJyZW50fSDihpIgJHtjdXJyLmN1cnJlbnR9KS4gU2hpZnQgbXVuZ2tpbiBkaXByb3Nlcy5gLCAnd2FybicpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHN0YXRlLnVuY2VydGFpblJlY29uY2lsaWF0aW9uID09PSAnZW5lcmd5X2NoYW5nZWQnKSB7XG4gICAgICAgICAgICBzdGF0ZS51bmNlcnRhaW5SZWNvbmNpbGlhdGlvbiA9ICdwZW5kaW5nJztcbiAgICAgICAgfVxuICAgICAgICB1cGRhdGVQYW5lbCgpO1xuICAgIH1cblxuICAgIGN0eC5yZWNvbmNpbGVVbmNlcnRhaW5Xb3JrID0gcmVjb25jaWxlVW5jZXJ0YWluV29yaztcblxuICAgIC8vIOKUgOKUgOKUgCBTY2hlZHVsZWQgc2xlZXAgd2l0aCBXZWIgV29ya2VyIHRpbWVyIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG4gICAgbGV0IHdha2VQZW5kaW5nV29yayA9IG51bGw7XG4gICAgbGV0IHBlbmRpbmdXb3JrVGltZXIgPSBudWxsO1xuICAgIGxldCBiZ1RpbWVyV29ya2VyID0gbnVsbDtcblxuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGJsb2IgPSBuZXcgQmxvYihbYFxuICAgICAgICAgICAgbGV0IHQgPSBudWxsO1xuICAgICAgICAgICAgc2VsZi5vbm1lc3NhZ2UgPSBlID0+IHtcbiAgICAgICAgICAgICAgICBpZiAodCAhPT0gbnVsbCkgY2xlYXJUaW1lb3V0KHQpO1xuICAgICAgICAgICAgICAgIHQgPSBzZXRUaW1lb3V0KCgpID0+IHNlbGYucG9zdE1lc3NhZ2UoJ3dha2UnKSwgTWF0aC5tYXgoMTAsIGUuZGF0YSkpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgYF0sIHsgdHlwZTogJ2FwcGxpY2F0aW9uL2phdmFzY3JpcHQnIH0pO1xuICAgICAgICBiZ1RpbWVyV29ya2VyID0gbmV3IFdvcmtlcihVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpKTtcbiAgICB9IGNhdGNoIHsgYmdUaW1lcldvcmtlciA9IG51bGw7IH1cblxuICAgIGZ1bmN0aW9uIHdhaXRGb3JTY2hlZHVsZWRXb3JrKGRlbGF5KSB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcbiAgICAgICAgICAgIGxldCBkb25lID0gZmFsc2U7XG4gICAgICAgICAgICBjb25zdCBmaW5pc2ggPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGRvbmUpIHJldHVybjtcbiAgICAgICAgICAgICAgICBkb25lID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBpZiAocGVuZGluZ1dvcmtUaW1lciAhPT0gbnVsbCkgY2xlYXJUaW1lb3V0KHBlbmRpbmdXb3JrVGltZXIpO1xuICAgICAgICAgICAgICAgIHBlbmRpbmdXb3JrVGltZXIgPSBudWxsO1xuICAgICAgICAgICAgICAgIHdha2VQZW5kaW5nV29yayA9IG51bGw7XG4gICAgICAgICAgICAgICAgaWYgKGJnVGltZXJXb3JrZXIpIGJnVGltZXJXb3JrZXIub25tZXNzYWdlID0gbnVsbDtcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgd2FrZVBlbmRpbmdXb3JrID0gZmluaXNoO1xuICAgICAgICAgICAgaWYgKGJnVGltZXJXb3JrZXIpIHsgYmdUaW1lcldvcmtlci5vbm1lc3NhZ2UgPSBmaW5pc2g7IGJnVGltZXJXb3JrZXIucG9zdE1lc3NhZ2UoTWF0aC5tYXgoMTAsIGRlbGF5KSk7IH1cbiAgICAgICAgICAgIHBlbmRpbmdXb3JrVGltZXIgPSBzZXRUaW1lb3V0KGZpbmlzaCwgZGVsYXkpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBjdHgud2FrZVBlbmRpbmdXb3JrID0gKCkgPT4gd2FrZVBlbmRpbmdXb3JrPy4oKTtcblxuICAgIC8vIOKUgOKUgOKUgCBSb3V0ZSBHdWFyZDogSXNvbGF0ZWQgTW9kZSBvbiBBdXRoIFBhZ2VzIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuICAgIGNvbnN0IGlzQXV0aFJvdXRlID0gKHBhdGggPSB3aW5kb3cubG9jYXRpb24ucGF0aG5hbWUpID0+XG4gICAgICAgIC9eXFwvKGxvZ2lufHJlZ2lzdGVyfHNpZ251cHxmb3Jnb3QtcGFzc3dvcmR8cmVzZXQtcGFzc3dvcmQpL2kudGVzdChwYXRoKTtcblxuICAgIGlmIChpc0F1dGhSb3V0ZSgpKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGBbQXV0byBXb3JrZXJdIEhhbGFtYW4gYXV0ZW50aWthc2kgdGVyZGV0ZWtzaSAoJHt3aW5kb3cubG9jYXRpb24ucGF0aG5hbWV9KS4gSXNvbGFzaSBha3RpZjogRE9NIHRpZGFrIGRpbW9kaWZpa2FzaSBhZ2FyIGZvcm0gbG9naW4gdGV0YXAgdXR1aC5gKTtcbiAgICAgICAgc2V0dXBMb2dpbkNhcHR1cmUobG9nKTtcbiAgICAgICAgdHJ5QXV0b0xvZ2luKENPTkZJRywgbG9nLCBzZW5kTm90aWZpY2F0aW9uKTtcblxuICAgICAgICBfd2F0Y2hTcGFOYXZpZ2F0aW9uKCgpID0+IHtcbiAgICAgICAgICAgIGlmICghaXNBdXRoUm91dGUoKSkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBbQXV0byBXb3JrZXJdIE5hdmlnYXNpIGtlIGhhbGFtYW4gZ2FtZSB0ZXJkZXRla3NpICgke3dpbmRvdy5sb2NhdGlvbi5wYXRobmFtZX0pLiBNZW11YXQgbGluZ2t1bmdhbiBnYW1lLi4uYCk7XG4gICAgICAgICAgICAgICAgd2luZG93LmxvY2F0aW9uLnJlbG9hZCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuOyAvLyBTRUxFU0FJIFVOVFVLIEhBTEFNQU4gTE9HSU4hIFRpZGFrIGFkYSBwYW5lbCwgbW9kYWwsIGF0YXUgd29ya2VyIGxvb3AgeWFuZyBtZW5nZ2FuZ2d1IGxvZ2luIVxuICAgIH1cblxuICAgIC8vIOKUgOKUgOKUgCBNYWluIGxvb3AgKEhhbnlhIGJlcmphbGFuIGRpIGxpbmdrdW5nYW4gZ2FtZSkg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbiAgICBzdGF0ZS50YWJMb2NrTWFuYWdlZCA9IEJvb2xlYW4obmF2aWdhdG9yPy5sb2Nrcz8ucmVxdWVzdCk7XG4gICAgc3RhdGUuaXNUYWJMb2NrT3duZXIgPSAhc3RhdGUudGFiTG9ja01hbmFnZWQ7XG5cbiAgICBfbG9nU3RhcnR1cChsb2csIENPTkZJRywgc3RhdGUpO1xuXG4gICAgZ2V0VG9rZW5GbigpO1xuICAgIGNyZWF0ZVBhbmVsKHN0YXRlLCBDT05GSUcsIGN0eCk7XG4gICAgY29uc3QgY2FjaGVkTG9ncyA9IGdldFZhbHVlKCdhd19yZWNlbnRfbG9ncycpO1xuICAgIGlmIChBcnJheS5pc0FycmF5KGNhY2hlZExvZ3MpKSB7XG4gICAgICAgIHN0YXRlLmxvZ3MgPSBbLi4uY2FjaGVkTG9nc107XG4gICAgfVxuICAgIGNyZWF0ZUxvZ1ZpZXdlcihzdGF0ZSwgQ09ORklHKTtcbiAgICBjcmVhdGVTZXR0aW5nc01vZGFsKENPTkZJRywgY3R4KTtcbiAgICBzdGFydFRva2VuV2F0Y2hlcihzdGF0ZSwgaGFuZGxlTmV3VG9rZW4sIGdldFRva2VuRm4pO1xuXG4gICAgLy8gUGFudGF1IG5hdmlnYXNpIFNQQSBqaWthIHVzZXIgbG9nb3V0IGRpIGRhbGFtIGdhbWUgdGFucGEgcmVsb2FkIHBlbnVoIGF0YXUgcGluZGFoIGhhbGFtYW5cbiAgICBfd2F0Y2hTcGFOYXZpZ2F0aW9uKCgpID0+IHtcbiAgICAgICAgaWYgKGlzQXV0aFJvdXRlKCkpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBbQXV0byBXb3JrZXJdIExvZ291dCAvIE5hdmlnYXNpIGtlIGF1dGggcGFnZSB0ZXJkZXRla3NpICgke3dpbmRvdy5sb2NhdGlvbi5wYXRobmFtZX0pLiBNZW5nYWxpaGthbiBrZSBtb2RlIGlzb2xhc2kuLi5gKTtcbiAgICAgICAgICAgIHdpbmRvdy5sb2NhdGlvbi5yZWxvYWQoKTtcbiAgICAgICAgfVxuICAgICAgICBzdGF0ZS51c2VyTWFudWFsbHlUb2dnbGVkUGFuZWwgPSBmYWxzZTtcbiAgICAgICAgY29uc3QgcGF0aCA9IHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZSB8fCAnJztcbiAgICAgICAgY29uc3QgaXNEYXNoID0gcGF0aCA9PT0gJy9kYXNoYm9hcmQnIHx8IHBhdGguc3RhcnRzV2l0aCgnL2Rhc2hib2FyZC8nKSB8fCBwYXRoID09PSAnLycgfHwgcGF0aCA9PT0gJyc7XG4gICAgICAgIGlmIChDT05GSUcucGFuZWxEYXNoYm9hcmRPbmx5ICYmIGlzRGFzaCkge1xuICAgICAgICAgICAgc3RhdGUucGFuZWxWaXNpYmxlID0gdHJ1ZTtcbiAgICAgICAgICAgIHNldFZhbHVlKCdwYW5lbFZpc2libGUnLCAndHJ1ZScpO1xuICAgICAgICB9XG4gICAgICAgIGdldFJlZ2lvbkRldGFpbHModHJ1ZSk7XG4gICAgICAgIHVwZGF0ZVBhbmVsVmlzaWJpbGl0eShzdGF0ZSwgQ09ORklHKTtcbiAgICB9KTtcblxuICAgIC8vIEludGVyY2VwdCBjbGlja3Mgb24gZ2FtZSdzIFwiS0VSSkFLQU4gU0FUVSBHSUxJUkFOXCIgYnV0dG9uIHdoZW4gZW5lcmd5IDwgMTBcbiAgICAvLyBQcmV2ZW50cyBjb25mdXNpbmcgc2VydmVyIDQwMCBlcnJvciB0b2FzdHMgKFwiTm90IGVub3VnaCBlbmVyZ3kgdG8gcHJvZHVjZSBldmVuIG9uZSB1bml0XCIpXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgICAgICBjb25zdCBidG4gPSBlLnRhcmdldD8uY2xvc2VzdD8uKCdidXR0b24nKTtcbiAgICAgICAgaWYgKCFidG4pIHJldHVybjtcbiAgICAgICAgY29uc3QgdHh0ID0gKGJ0bi50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpO1xuICAgICAgICBpZiAoL0tFUkpBS0FOXFxzK1NBVFVcXHMrR0lMSVJBTi9pLnRlc3QodHh0KSkge1xuICAgICAgICAgICAgaWYgKHN0YXRlLmN1cnJlbnRFbmVyZ3kgIT0gbnVsbCAmJiBzdGF0ZS5jdXJyZW50RW5lcmd5IDwgMTApIHtcbiAgICAgICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICBsb2coYEVuZXJnaSBzYWF0IGluaSAke3N0YXRlLmN1cnJlbnRFbmVyZ3l9LyR7c3RhdGUubWF4RW5lcmd5fSBFTiAoYnV0dWggbWluaW1hbCAxMCBFTikuIE1lbnVuZ2d1IGVuZXJnaSBwdWxpaC5gLCAnd2FybicpO1xuICAgICAgICAgICAgICAgIHNob3dJblBhZ2VOb3RpZmljYXRpb24oYEVuZXJnaSBiZWx1bSBjdWt1cCAoJHtzdGF0ZS5jdXJyZW50RW5lcmd5fS8ke3N0YXRlLm1heEVuZXJneX0gRU4pLiBCdXR1aCBtaW5pbWFsIDEwIEVOIHVudHVrIGdpbGlyYW4ga2VyamEuYCwgJ3dhcm4nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0sIHRydWUpO1xuXG4gICAgLy8gUHJlLXNlZWQgZW5lcmd5IGZyb20gc3RvcmVkIGxpdmUgc3RhdHVzIGltbWVkaWF0ZWx5IHdoaWxlIFJlYWN0IFNQQSBpbml0aWFsaXplcyAobm8gcGhhbnRvbSB0aW1lIGFkZGl0aW9ucylcbiAgICBjb25zdCBjYWNoZWRMaXZlID0gZ2V0VmFsdWUoJ2F3X2xpdmVfc3RhdHVzJyk7XG4gICAgaWYgKGNhY2hlZExpdmUgJiYgY2FjaGVkTGl2ZS5jdXJyZW50RW5lcmd5ICE9IG51bGwpIHtcbiAgICAgICAgY29uc3QgbWF4RSA9IGNhY2hlZExpdmUubWF4RW5lcmd5IHx8IHN0YXRlLm1heEVuZXJneSB8fCAxMTA7XG4gICAgICAgIHN0YXRlLm1heEVuZXJneSA9IG1heEU7XG4gICAgICAgIHN0YXRlLmN1cnJlbnRFbmVyZ3kgPSBNYXRoLm1pbihtYXhFLCBjYWNoZWRMaXZlLmN1cnJlbnRFbmVyZ3kpO1xuICAgICAgICBzdGF0ZS5lbmVyZ3lTeW5jQmFzZSA9IHsgY3VycmVudDogc3RhdGUuY3VycmVudEVuZXJneSwgbWF4OiBtYXhFLCB1cGRhdGVkQXQ6IGNhY2hlZExpdmUudXBkYXRlZEF0IHx8IERhdGUubm93KCkgfTtcbiAgICB9XG5cbiAgICAvLyBQcmUtc2VlZCBlbmVyZ3kgZnJvbSBET00g4oCUIHdhaXQgZm9yIFJlYWN0IFNQQSB0byByZW5kZXIgdGhlIGVsZW1lbnQgKHVwIHRvIDE1cylcbiAgICB3YWl0Rm9yRW5lcmd5RWxlbWVudCgxNTAwMCkudGhlbihlbmVyZ3kgPT4ge1xuICAgICAgICBpZiAoZW5lcmd5KSB7XG4gICAgICAgICAgICBzdGF0ZS5jdXJyZW50RW5lcmd5ID0gZW5lcmd5LmN1cnJlbnQ7XG4gICAgICAgICAgICBzdGF0ZS5tYXhFbmVyZ3kgICAgID0gZW5lcmd5Lm1heDtcbiAgICAgICAgICAgIHN0YXRlLmRvbUVuZXJneVN0YWxlID0gZmFsc2U7XG4gICAgICAgICAgICBzdGF0ZS5sYXN0V29ya1RpbWVzdGFtcCA9IDA7IC8vIEZyZXNoIHBhZ2UgbG9hZDogRE9NIGlzIDEwMCUgYXV0aG9yaXRhdGl2ZSBncm91bmQgdHJ1dGghXG4gICAgICAgICAgICBzdGF0ZS5lbmVyZ3lTeW5jQmFzZSA9IHsgY3VycmVudDogZW5lcmd5LmN1cnJlbnQsIG1heDogZW5lcmd5Lm1heCwgdXBkYXRlZEF0OiBEYXRlLm5vdygpIH07XG5cbiAgICAgICAgICAgIGNvbnN0IHJlZ0RldGFpbHMgPSBnZXRSZWdpb25EZXRhaWxzKHRydWUpO1xuICAgICAgICAgICAgY29uc3QgaGVhbHRoQnVmZiA9IHJlZ0RldGFpbHMuYm9udXNNdWx0aXBsaWVyIHx8IDEuMDtcbiAgICAgICAgICAgIHN0YXRlLnJlZ2VuUmF0ZSA9IGhlYWx0aEJ1ZmY7XG4gICAgICAgICAgICBzdGF0ZS5yZWdpb25IZWFsdGhCb251c1BlcmNlbnQgPSByZWdEZXRhaWxzLmJvbnVzUGVyY2VudCB8fCAwO1xuICAgICAgICAgICAgaWYgKHN0YXRlLnJlZ2lvbkhlYWx0aEJvbnVzUGVyY2VudCA+IDAgfHwgaGVhbHRoQnVmZiA+IDEuMCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGJvbnVzUGN0ID0gc3RhdGUucmVnaW9uSGVhbHRoQm9udXNQZXJjZW50IHx8IE1hdGgucm91bmQoKGhlYWx0aEJ1ZmYgLSAxLjApICogMTAwKTtcbiAgICAgICAgICAgICAgICBsb2coYEJ1ZmYgS290YTogS2VzZWhhdGFuICske2JvbnVzUGN0fSUgcGVtdWxpaGFuIGVuZXJnaSBwYXNpZiAoJHtoZWFsdGhCdWZmfXggLyBtbnQpYCwgJ2luZm8nKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbG9nKGBFbmVyZ2kgdGVyYmFjYTogJHtlbmVyZ3kuY3VycmVudH0vJHtlbmVyZ3kubWF4fWAsICdpbmZvJyk7XG4gICAgICAgICAgICBzYXZlTGl2ZVN0YXR1cyhzdGF0ZSwgQ09ORklHKTtcbiAgICAgICAgICAgIHVwZGF0ZVBhbmVsKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsb2coJ0VsZW1lbiBlbmVyZ2kgdGlkYWsgZGl0ZW11a2FuIGRhbGFtIDE1IGRldGlrLiBFbmVyZ2kgYWthbiB0ZXJiYWNhIHNhYXQgcGFuZWwgdXBkYXRlLicsICd3YXJuJyk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIHNldEludGVydmFsKCgpID0+IHsgaWYgKHN0YXRlLnJ1bm5pbmcpIF9jaGVja0FuZFJlZnJlc2hUb2tlbihzdGF0ZSwgQ09ORklHLCBsb2csIGN0eCk7IH0sIE1hdGgubWluKENPTkZJRy50b2tlblJlZnJlc2hJbnRlcnZhbCwgNjAwMDApKTtcbiAgICBzZXRJbnRlcnZhbChjaGVja0RhaWx5UmVzZXQsIDYwMDAwKTtcbiAgICBzZXRJbnRlcnZhbCh1cGRhdGVQYW5lbCwgMTAwMCk7XG4gICAgc2V0SW50ZXJ2YWwocmVjb25jaWxlVW5jZXJ0YWluV29yaywgMTAwMDApO1xuXG4gICAgLy8g4pSA4pSAIENocm9tZSBFeHRlbnNpb24gUnVudGltZSBNZXNzYWdlIExpc3RlbmVyIChQb3B1cCAmIEJhY2tncm91bmQpIOKUgOKUgOKUgOKUgFxuICAgIHRyeSB7XG4gICAgICAgIGNocm9tZS5ydW50aW1lLm9uTWVzc2FnZS5hZGRMaXN0ZW5lcigobXNnLCBzZW5kZXIsIHNlbmRSZXNwb25zZSkgPT4ge1xuICAgICAgICAgICAgaWYgKG1zZz8udHlwZSA9PT0gJ1BPUFVQX0NPTU1BTkQnKSB7XG4gICAgICAgICAgICAgICAgaWYgKG1zZy5hY3Rpb24gPT09ICd0b2dnbGVSdW5uaW5nJykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBuZXdSdW5uaW5nID0gbXNnLnZhbHVlICE9IG51bGwgPyBCb29sZWFuKG1zZy52YWx1ZSkgOiAhc3RhdGUucnVubmluZztcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUucnVubmluZyA9IG5ld1J1bm5pbmc7XG4gICAgICAgICAgICAgICAgICAgIHNldFJ1bm5pbmdVSShuZXdSdW5uaW5nKTtcbiAgICAgICAgICAgICAgICAgICAgdXBkYXRlUGFuZWwoKTtcbiAgICAgICAgICAgICAgICAgICAgc2F2ZUxpdmVTdGF0dXMoc3RhdGUsIENPTkZJRywgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgIGxvZyhgQXV0byBXb3JrZXIgJHtuZXdSdW5uaW5nID8gJ2RpbGFuanV0a2FuJyA6ICdkaWplZGEnfSB2aWEgUG9wdXAgdG9vbGJhci5gLCAnaW5mbycpO1xuICAgICAgICAgICAgICAgICAgICBpZiAobmV3UnVubmluZykgd2FrZVBlbmRpbmdXb3JrPy4oKTtcbiAgICAgICAgICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IHRydWUsIHJ1bm5pbmc6IHN0YXRlLnJ1bm5pbmcgfSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAobXNnLmFjdGlvbiA9PT0gJ3dvcmtOb3cnKSB7XG4gICAgICAgICAgICAgICAgICAgIGxvZygnTWFudWFsIHdvcmsgZGlwaWN1IHZpYSBQb3B1cCB0b29sYmFyLicsICdpbmZvJyk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbkV4cGlyZWQgfHwgc3RhdGUucGF1c2VkRm9yVG9rZW4gfHwgIXN0YXRlLmN1cnJlbnRUb2tlbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IGZhbHNlLCBlcnJvcjogJ3Rva2VuX2V4cGlyZWQnIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZG9Xb3JrKGN0eCwgdHJ1ZSkudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2F2ZUxpdmVTdGF0dXMoc3RhdGUsIENPTkZJRywgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB1cGRhdGVQYW5lbCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdCA9PT0gJ3dvcmtlZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBvazogdHJ1ZSwgaXNMb2NrT3duZXI6IHN0YXRlLmlzVGFiTG9ja093bmVyLCByZXN1bHQgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHJlc3VsdCA9PT0gJ3BhdXNlZCcgJiYgKHN0YXRlLnBhdXNlZEZvclRva2VuIHx8IHN0YXRlLnRva2VuRXhwaXJlZCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBvazogZmFsc2UsIGVycm9yOiAndG9rZW5fZXhwaXJlZCcgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHJlc3VsdCA9PT0gJ3dhaXRpbmcnICYmIHN0YXRlLmN1cnJlbnRFbmVyZ3kgPCAxMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiBmYWxzZSwgZXJyb3I6ICdpbnN1ZmZpY2llbnRfZW5lcmd5JyB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IGZhbHNlLCBlcnJvcjogcmVzdWx0IHx8ICd3b3JrX2ZhaWxlZCcgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBvazogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAobXNnLmFjdGlvbiA9PT0gJ2dldFN0YXR1cycpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3luY2VkID0gZ2V0U3luY2VkRW5lcmd5KHN0YXRlKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN5bmNlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUuY3VycmVudEVuZXJneSA9IHN5bmNlZC5jdXJyZW50O1xuICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUubWF4RW5lcmd5ICAgICA9IHN5bmNlZC5tYXg7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IHRydWUsIHN0YXR1czogc2F2ZUxpdmVTdGF0dXMoc3RhdGUsIENPTkZJRywgdHJ1ZSkgfSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAobXNnLmFjdGlvbiA9PT0gJ2dldExvZ3MnKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiB0cnVlLCBsb2dzOiBzdGF0ZS5sb2dzIHx8IFtdIH0pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKG1zZy5hY3Rpb24gPT09ICdjbGVhckxvZ3MnKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXRlLmxvZ3MgPSBbXTtcbiAgICAgICAgICAgICAgICAgICAgY2xlYXJTdG9yZWRMb2dzKCk7XG4gICAgICAgICAgICAgICAgICAgIHVwZGF0ZUxvZ1ZpZXdlcihzdGF0ZSwgQ09ORklHKTtcbiAgICAgICAgICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChtc2c/LnR5cGUgPT09ICdTVE9SQUdFX1NZTkMnICYmIG1zZy5hY3Rpb24gPT09ICdiYWNrZ3JvdW5kV29ya0RvbmUnKSB7XG4gICAgICAgICAgICAgICAgaWYgKG1zZy5lbmVyZ3kgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZS5jdXJyZW50RW5lcmd5ID0gbXNnLmVuZXJneTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUucG9zdFNoaWZ0RW5lcmd5ID0gbXNnLmVuZXJneTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUubGFzdFdvcmtUaW1lc3RhbXAgPSBEYXRlLm5vdygpO1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZS5kb21FbmVyZ3lTdGFsZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIHN0YXRlLmVuZXJneVN5bmNCYXNlID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgY3VycmVudDogbXNnLmVuZXJneSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1heDogbXNnLm1heEVuZXJneSB8fCBzdGF0ZS5tYXhFbmVyZ3kgfHwgMTEwLFxuICAgICAgICAgICAgICAgICAgICAgICAgdXBkYXRlZEF0OiBEYXRlLm5vdygpXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChtc2cuc3RhdHVzKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChtc2cuc3RhdHVzLndvcmtUb2RheSAhPSBudWxsKSBzdGF0ZS53b3JrVG9kYXkgPSBtc2cuc3RhdHVzLndvcmtUb2RheTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1zZy5zdGF0dXMueHBUb2RheSAhPSBudWxsKSBzdGF0ZS54cFRvZGF5ID0gbXNnLnN0YXR1cy54cFRvZGF5O1xuICAgICAgICAgICAgICAgICAgICBpZiAobXNnLnN0YXR1cy50b3RhbFdvcmtlZCAhPSBudWxsKSBzdGF0ZS50b3RhbFdvcmtlZCA9IG1zZy5zdGF0dXMudG90YWxXb3JrZWQ7XG4gICAgICAgICAgICAgICAgICAgIGlmIChtc2cuc3RhdHVzLnRvdGFsV29ya1hQICE9IG51bGwpIHN0YXRlLnRvdGFsV29ya1hQID0gbXNnLnN0YXR1cy50b3RhbFdvcmtYUDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1zZy5zdGF0dXMubGFzdFdvcmtUaW1lKSBzdGF0ZS5sYXN0V29ya1RpbWUgPSBtc2cuc3RhdHVzLmxhc3RXb3JrVGltZTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1zZy5zdGF0dXMubmV4dFdvcmtUaW1lc3RhbXAgIT0gbnVsbCkgc3RhdGUubmV4dFdvcmtUaW1lc3RhbXAgPSBtc2cuc3RhdHVzLm5leHRXb3JrVGltZXN0YW1wO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBzdGF0ZS53b3JrSW5GbGlnaHQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBzdGF0ZS53b3JrUmVzdWx0VW5jZXJ0YWluID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgc3RhdGUuZW5lcmd5RnVsbEFsZXJ0QWN0aXZlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgdXBkYXRlUGFuZWwoKTtcbiAgICAgICAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBvazogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChtc2c/LnR5cGUgPT09ICdFWEVDVVRFX1dPUktfTk9XJykge1xuICAgICAgICAgICAgICAgIChhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXN0YXRlLnJ1bm5pbmcgJiYgIW1zZy5tYW51YWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBvazogZmFsc2UsIHJlc3VsdDogJ3BhdXNlZCcgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHN0YXRlLndvcmtJbkZsaWdodCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChEYXRlLm5vdygpIC0gKHN0YXRlLndvcmtJbkZsaWdodEF0IHx8IDApID4gMTUwMDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUud29ya0luRmxpZ2h0ID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IGZhbHNlLCByZXN1bHQ6ICdidXN5JyB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbkV4cGlyZWQgfHwgc3RhdGUucGF1c2VkRm9yVG9rZW4gfHwgIXN0YXRlLmN1cnJlbnRUb2tlbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiBmYWxzZSwgcmVzdWx0OiAndG9rZW5fZXhwaXJlZCcgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHN0YXRlLnRhYkxvY2tNYW5hZ2VkICYmICFzdGF0ZS5pc1RhYkxvY2tPd25lcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiBmYWxzZSwgcmVzdWx0OiAnc3RhbmRieScgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBzeW5jZWQgPSBnZXRTeW5jZWRFbmVyZ3koc3RhdGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHN5bmNlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLmN1cnJlbnRFbmVyZ3kgPSBzeW5jZWQuY3VycmVudDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5tYXhFbmVyZ3kgPSBzeW5jZWQubWF4O1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIW1zZy5tYW51YWwgJiYgc3RhdGUuY3VycmVudEVuZXJneSA8IENPTkZJRy5lbmVyZ3lUaHJlc2hvbGQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBvazogdHJ1ZSwgcmVzdWx0OiAnd2FpdGluZycsIGVuZXJneTogc3RhdGUuY3VycmVudEVuZXJneSB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGxvZygnVHJpZ2dlciBiYWNrZ3JvdW5kOiBNZW5qYWxhbmthbiBzaGlmdCBrZXJqYSBvdG9tYXRpcy4uLicsICdpbmZvJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBkb1dvcmsoY3R4LCBCb29sZWFuKG1zZy5tYW51YWwpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNhdmVMaXZlU3RhdHVzKHN0YXRlLCBDT05GSUcsIHRydWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdXBkYXRlUGFuZWwoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRSZXNwb25zZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb2s6IHJlc3VsdCA9PT0gJ3dvcmtlZCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVuZXJneTogc3RhdGUuY3VycmVudEVuZXJneSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc0xvY2tPd25lcjogQm9vbGVhbihzdGF0ZS5pc1RhYkxvY2tPd25lcilcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiBmYWxzZSwgZXJyb3I6IGVycj8ubWVzc2FnZSB8fCBTdHJpbmcoZXJyKSB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAobXNnPy50eXBlID09PSAnV0FLRV9XT1JLRVInKSB7XG4gICAgICAgICAgICAgICAgKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEFsd2F5cyBzeW5jIGxhdGVzdCBzdGF0ZSBmcm9tIHN0b3JhZ2UgZmlyc3QgKGluIGNhc2UgYmFja2dyb3VuZCB3b3JrZWQgd2hpbGUgdGFiIHNsZXB0KVxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbGF0ZXN0TGl2ZSA9IGdldFZhbHVlKCdhd19saXZlX3N0YXR1cycpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGxhdGVzdExpdmUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAobGF0ZXN0TGl2ZS5sYXN0V29ya1RpbWVzdGFtcCAmJiBsYXRlc3RMaXZlLmxhc3RXb3JrVGltZXN0YW1wID4gKHN0YXRlLmxhc3RXb3JrVGltZXN0YW1wIHx8IDApKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLmxhc3RXb3JrVGltZXN0YW1wID0gbGF0ZXN0TGl2ZS5sYXN0V29ya1RpbWVzdGFtcDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUuY3VycmVudEVuZXJneSA9IGxhdGVzdExpdmUuY3VycmVudEVuZXJneTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUucG9zdFNoaWZ0RW5lcmd5ID0gbGF0ZXN0TGl2ZS5jdXJyZW50RW5lcmd5O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5kb21FbmVyZ3lTdGFsZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLmVuZXJneVN5bmNCYXNlID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY3VycmVudDogbGF0ZXN0TGl2ZS5jdXJyZW50RW5lcmd5LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWF4OiBsYXRlc3RMaXZlLm1heEVuZXJneSB8fCBzdGF0ZS5tYXhFbmVyZ3kgfHwgMTE1LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdXBkYXRlZEF0OiBsYXRlc3RMaXZlLnVwZGF0ZWRBdCB8fCBsYXRlc3RMaXZlLmxhc3RXb3JrVGltZXN0YW1wXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChsYXRlc3RMaXZlLm5leHRXb3JrVGltZXN0YW1wKSBzdGF0ZS5uZXh0V29ya1RpbWVzdGFtcCA9IGxhdGVzdExpdmUubmV4dFdvcmtUaW1lc3RhbXA7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGxhdGVzdExpdmUud29ya1RvZGF5ICE9IG51bGwpIHN0YXRlLndvcmtUb2RheSA9IGxhdGVzdExpdmUud29ya1RvZGF5O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChsYXRlc3RMaXZlLnhwVG9kYXkgIT0gbnVsbCkgc3RhdGUueHBUb2RheSA9IGxhdGVzdExpdmUueHBUb2RheTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAobGF0ZXN0TGl2ZS50b3RhbFdvcmtlZCAhPSBudWxsKSBzdGF0ZS50b3RhbFdvcmtlZCA9IGxhdGVzdExpdmUudG90YWxXb3JrZWQ7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGxhdGVzdExpdmUudG90YWxXb3JrWFAgIT0gbnVsbCkgc3RhdGUudG90YWxXb3JrWFAgPSBsYXRlc3RMaXZlLnRvdGFsV29ya1hQO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoc3RhdGUucnVubmluZykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGVuZXJneSA9IGdldFN5bmNlZEVuZXJneShzdGF0ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGVuZXJneSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5jdXJyZW50RW5lcmd5ID0gZW5lcmd5LmN1cnJlbnQ7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLm1heEVuZXJneSA9IGVuZXJneS5tYXg7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGlzQ29vbGRvd25BY3RpdmUgPSBzdGF0ZS5uZXh0V29ya1RpbWVzdGFtcCAmJiAoRGF0ZS5ub3coKSA8IHN0YXRlLm5leHRXb3JrVGltZXN0YW1wIC0gNTAwMCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaGFzUmVjZW50V29yayA9IHN0YXRlLmxhc3RXb3JrVGltZXN0YW1wICYmIChEYXRlLm5vdygpIC0gc3RhdGUubGFzdFdvcmtUaW1lc3RhbXAgPCA0NTAwMCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHN0YXRlLmlzVGFiTG9ja093bmVyICYmIHN0YXRlLmN1cnJlbnRFbmVyZ3kgPj0gQ09ORklHLmVuZXJneVRocmVzaG9sZCAmJiAhaXNDb29sZG93bkFjdGl2ZSAmJiAhaGFzUmVjZW50V29yayAmJiAhc3RhdGUud29ya0luRmxpZ2h0ICYmICFzdGF0ZS53b3JrUmVzdWx0VW5jZXJ0YWluKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxvZygnQmFja2dyb3VuZCB3YWtlOiBFbmVyZ2kgdGFyZ2V0IHRlcmNhcGFpLCBtZW5nZWtzZWt1c2kgc2hpZnQga2VyamEuLi4nLCAnaW5mbycpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBkb1dvcmsoeyAuLi5jdHggfSwgZmFsc2UpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzYXZlTGl2ZVN0YXR1cyhzdGF0ZSwgQ09ORklHKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdXBkYXRlUGFuZWwoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhhbmRsZWQ6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc0xvY2tPd25lcjogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVuZXJneTogc3RhdGUuY3VycmVudEVuZXJneSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdvcmtlZDogcmVzdWx0ID09PSAnd29ya2VkJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHVwZGF0ZVBhbmVsKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBzYXZlTGl2ZVN0YXR1cyhzdGF0ZSwgQ09ORklHKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRSZXNwb25zZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaGFuZGxlZDogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc0xvY2tPd25lcjogQm9vbGVhbihzdGF0ZS5pc1RhYkxvY2tPd25lciksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZW5lcmd5OiBzdGF0ZS5jdXJyZW50RW5lcmd5LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdvcmtlZDogZmFsc2VcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRSZXNwb25zZSh7IGhhbmRsZWQ6IGZhbHNlLCBlcnJvcjogZXJyPy5tZXNzYWdlIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSkoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfSBjYXRjaCB7IC8qIGlnbm9yZSBpZiBjaHJvbWUucnVudGltZSBpcyB1bmF2YWlsYWJsZSAqLyB9XG5cbiAgICBvblN0b3JhZ2VDaGFuZ2VkKChrZXksIG5ld1ZhbHVlKSA9PiB7XG4gICAgICAgIGlmIChrZXkgPT09ICdhd19saXZlX3N0YXR1cycgJiYgbmV3VmFsdWUpIHtcbiAgICAgICAgICAgIGNvbnN0IGlzQmFja2dyb3VuZFNoaWZ0ID0gQm9vbGVhbihcbiAgICAgICAgICAgICAgICBuZXdWYWx1ZS5sYXN0V29ya1RpbWUgJiZcbiAgICAgICAgICAgICAgICBuZXdWYWx1ZS5sYXN0V29ya1RpbWUgIT09IHN0YXRlLmxhc3RXb3JrVGltZSAmJlxuICAgICAgICAgICAgICAgIChuZXdWYWx1ZS50b3RhbFdvcmtlZCB8fCAwKSA+IChzdGF0ZS50b3RhbFdvcmtlZCB8fCAwKVxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgaWYgKCFzdGF0ZS5pc1RhYkxvY2tPd25lciB8fCBpc0JhY2tncm91bmRTaGlmdCkge1xuICAgICAgICAgICAgICAgIGlmIChuZXdWYWx1ZS53b3JrVG9kYXkgIT0gbnVsbCkgc3RhdGUud29ya1RvZGF5ID0gbmV3VmFsdWUud29ya1RvZGF5O1xuICAgICAgICAgICAgICAgIGlmIChuZXdWYWx1ZS54cFRvZGF5ICE9IG51bGwpIHN0YXRlLnhwVG9kYXkgPSBuZXdWYWx1ZS54cFRvZGF5O1xuICAgICAgICAgICAgICAgIGlmIChuZXdWYWx1ZS50b3RhbFdvcmtlZCAhPSBudWxsKSBzdGF0ZS50b3RhbFdvcmtlZCA9IG5ld1ZhbHVlLnRvdGFsV29ya2VkO1xuICAgICAgICAgICAgICAgIGlmIChuZXdWYWx1ZS50b3RhbFdvcmtYUCAhPSBudWxsKSBzdGF0ZS50b3RhbFdvcmtYUCA9IG5ld1ZhbHVlLnRvdGFsV29ya1hQO1xuICAgICAgICAgICAgICAgIGlmIChuZXdWYWx1ZS5sYXN0V29ya1RpbWUpIHN0YXRlLmxhc3RXb3JrVGltZSA9IG5ld1ZhbHVlLmxhc3RXb3JrVGltZTtcbiAgICAgICAgICAgICAgICBpZiAobmV3VmFsdWUubmV4dFdvcmtUaW1lc3RhbXAgIT0gbnVsbCkgc3RhdGUubmV4dFdvcmtUaW1lc3RhbXAgPSBuZXdWYWx1ZS5uZXh0V29ya1RpbWVzdGFtcDtcbiAgICAgICAgICAgICAgICBpZiAoaXNCYWNrZ3JvdW5kU2hpZnQgJiYgbmV3VmFsdWUuY3VycmVudEVuZXJneSAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXRlLmN1cnJlbnRFbmVyZ3kgPSBuZXdWYWx1ZS5jdXJyZW50RW5lcmd5O1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZS5sYXN0V29ya1RpbWVzdGFtcCA9IG5ld1ZhbHVlLnVwZGF0ZWRBdCB8fCBEYXRlLm5vdygpO1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZS5kb21FbmVyZ3lTdGFsZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIHN0YXRlLmVuZXJneVN5bmNCYXNlID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgY3VycmVudDogbmV3VmFsdWUuY3VycmVudEVuZXJneSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1heDogbmV3VmFsdWUubWF4RW5lcmd5IHx8IHN0YXRlLm1heEVuZXJneSB8fCAxMTAsXG4gICAgICAgICAgICAgICAgICAgICAgICB1cGRhdGVkQXQ6IG5ld1ZhbHVlLnVwZGF0ZWRBdCB8fCBEYXRlLm5vdygpXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChuZXdWYWx1ZS5tYXhFbmVyZ3kgIT0gbnVsbCkgc3RhdGUubWF4RW5lcmd5ID0gbmV3VmFsdWUubWF4RW5lcmd5O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdXBkYXRlUGFuZWwoKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoa2V5ID09PSAnYXdfY29uZmlnJyAmJiBuZXdWYWx1ZSkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKENPTkZJRywgdHlwZW9mIG5ld1ZhbHVlID09PSAnc3RyaW5nJyA/IEpTT04ucGFyc2UobmV3VmFsdWUpIDogbmV3VmFsdWUpO1xuICAgICAgICAgICAgICAgIHVwZGF0ZVBhbmVsKCk7XG4gICAgICAgICAgICB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoa2V5ID09PSAnYXdfcmVjZW50X2xvZ3MnKSB7XG4gICAgICAgICAgICBzdGF0ZS5sb2dzID0gQXJyYXkuaXNBcnJheShuZXdWYWx1ZSkgPyBbLi4ubmV3VmFsdWVdIDogW107XG4gICAgICAgICAgICB1cGRhdGVMb2dWaWV3ZXIoc3RhdGUsIENPTkZJRyk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ3Zpc2liaWxpdHljaGFuZ2UnLCBfaGFuZGxlRm9yZWdyb3VuZFJldHVybik7XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2ZvY3VzJywgX2hhbmRsZUZvcmVncm91bmRSZXR1cm4pO1xuXG4gICAgZnVuY3Rpb24gX2hhbmRsZUZvcmVncm91bmRSZXR1cm4oKSB7XG4gICAgICAgIGlmICghY2hyb21lLnJ1bnRpbWU/LmlkKSByZXR1cm47XG4gICAgICAgIGlmIChkb2N1bWVudC52aXNpYmlsaXR5U3RhdGUgPT09ICdoaWRkZW4nKSByZXR1cm47XG4gICAgICAgIHN0YXRlLmxhc3RGb3JlZ3JvdW5kUmV0dXJuVGltZSA9IERhdGUubm93KCk7XG4gICAgICAgIHVwZGF0ZVBhbmVsVmlzaWJpbGl0eShzdGF0ZSwgQ09ORklHKTtcbiAgICAgICAgcGF0Y2hQYWdlVmlzdWFsRW5lcmd5KHN0YXRlLmN1cnJlbnRFbmVyZ3ksIHN0YXRlLm1heEVuZXJneSwgdHJ1ZSk7XG4gICAgICAgIHNhdmVMaXZlU3RhdHVzKHN0YXRlLCBDT05GSUcpO1xuXG4gICAgICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChbJ2F3X2xpdmVfc3RhdHVzJ10sIGRhdGEgPT4ge1xuICAgICAgICAgICAgY29uc3QgbGl2ZSA9IGRhdGE/LmF3X2xpdmVfc3RhdHVzO1xuICAgICAgICAgICAgaWYgKGxpdmUpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBpc05ld2VyU2hpZnQgPSBCb29sZWFuKFxuICAgICAgICAgICAgICAgICAgICBsaXZlLmxhc3RXb3JrVGltZSAmJlxuICAgICAgICAgICAgICAgICAgICBsaXZlLmxhc3RXb3JrVGltZSAhPT0gc3RhdGUubGFzdFdvcmtUaW1lICYmXG4gICAgICAgICAgICAgICAgICAgIChsaXZlLnRvdGFsV29ya2VkIHx8IDApID4gKHN0YXRlLnRvdGFsV29ya2VkIHx8IDApXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBpZiAoaXNOZXdlclNoaWZ0KSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChsaXZlLmN1cnJlbnRFbmVyZ3kgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUuY3VycmVudEVuZXJneSA9IGxpdmUuY3VycmVudEVuZXJneTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLmxhc3RXb3JrVGltZXN0YW1wID0gbGl2ZS51cGRhdGVkQXQgfHwgRGF0ZS5ub3coKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLmRvbUVuZXJneVN0YWxlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLmVuZXJneVN5bmNCYXNlID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGN1cnJlbnQ6IGxpdmUuY3VycmVudEVuZXJneSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXg6IGxpdmUubWF4RW5lcmd5IHx8IHN0YXRlLm1heEVuZXJneSB8fCAxMTAsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXBkYXRlZEF0OiBsaXZlLnVwZGF0ZWRBdCB8fCBEYXRlLm5vdygpXG4gICAgICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmIChsaXZlLndvcmtUb2RheSAhPSBudWxsKSBzdGF0ZS53b3JrVG9kYXkgPSBsaXZlLndvcmtUb2RheTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGxpdmUueHBUb2RheSAhPSBudWxsKSBzdGF0ZS54cFRvZGF5ID0gbGl2ZS54cFRvZGF5O1xuICAgICAgICAgICAgICAgICAgICBpZiAobGl2ZS50b3RhbFdvcmtlZCAhPSBudWxsKSBzdGF0ZS50b3RhbFdvcmtlZCA9IGxpdmUudG90YWxXb3JrZWQ7XG4gICAgICAgICAgICAgICAgICAgIGlmIChsaXZlLnRvdGFsV29ya1hQICE9IG51bGwpIHN0YXRlLnRvdGFsV29ya1hQID0gbGl2ZS50b3RhbFdvcmtYUDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGxpdmUubGFzdFdvcmtUaW1lKSBzdGF0ZS5sYXN0V29ya1RpbWUgPSBsaXZlLmxhc3RXb3JrVGltZTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGxpdmUubmV4dFdvcmtUaW1lc3RhbXAgIT0gbnVsbCkgc3RhdGUubmV4dFdvcmtUaW1lc3RhbXAgPSBsaXZlLm5leHRXb3JrVGltZXN0YW1wO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmVsb2FkU3RhdGVGcm9tU3RvcmFnZShzdGF0ZSwgKCkgPT4geyB3b3JrSGlzdG9yeSA9IGxvYWRXb3JrSGlzdG9yeShzdGF0ZSwgQ09ORklHKTsgfSk7XG5cbiAgICAgICAgICAgIGNvbnN0IHN5bmNlZCA9IGdldFN5bmNlZEVuZXJneShzdGF0ZSk7XG4gICAgICAgICAgICBpZiAoc3luY2VkKSB7XG4gICAgICAgICAgICAgICAgc3RhdGUuY3VycmVudEVuZXJneSA9IHN5bmNlZC5jdXJyZW50O1xuICAgICAgICAgICAgICAgIHN0YXRlLm1heEVuZXJneSA9IHN5bmNlZC5tYXg7XG4gICAgICAgICAgICAgICAgaWYgKHN0YXRlLmRvbUVuZXJneVN0YWxlKSB7XG4gICAgICAgICAgICAgICAgICAgIHBhdGNoUGFnZVZpc3VhbEVuZXJneShzeW5jZWQuY3VycmVudCwgc3luY2VkLm1heCwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB1cGRhdGVQYW5lbCgpO1xuICAgICAgICAgICAgdXBkYXRlUGFuZWxWaXNpYmlsaXR5KHN0YXRlLCBDT05GSUcpO1xuICAgICAgICAgICAgaWYgKHN0YXRlLnJ1bm5pbmcgJiYgc3RhdGUuaXNUYWJMb2NrT3duZXIgJiYgc3RhdGUuY3VycmVudEVuZXJneSA+PSBDT05GSUcuZW5lcmd5VGhyZXNob2xkKSB7XG4gICAgICAgICAgICAgICAgd2FrZVBlbmRpbmdXb3JrPy4oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgYXN5bmMgZnVuY3Rpb24gcnVuV29ya2VyTG9vcCgpIHtcbiAgICAgICAgbGV0IGVyckNvdW50ID0gMDtcbiAgICAgICAgd2hpbGUgKHRydWUpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgaWYgKCFjaHJvbWUucnVudGltZT8uaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdbQXV0byBXb3JrZXJdIEVrc3RlbnNpIHRlbGFoIGRpLXJlbG9hZC4gTG9vcCBkaWhlbnRpa2FuIGJlcnNpaC4gU2lsYWthbiByZWZyZXNoIHRhYiBnYW1lIChGNSkuJyk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2hlY2tEYWlseVJlc2V0KCk7XG4gICAgICAgICAgICAgICAgaWYgKHN0YXRlLnJ1bm5pbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZG9Xb3JrKGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQgPT09ICdyZXRyeVNvb24nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB3YWl0Rm9yU2NoZWR1bGVkV29yayg1MDAwKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChyZXN1bHQgPT09ICdyZXRyeScpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVyckNvdW50Kys7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBiYWNrb2ZmID0gTWF0aC5taW4oMzAwMDAwLCAxMDAwMCAqIE1hdGgucG93KDIsIGVyckNvdW50IC0gMSkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgbG9nKGDij7MgUmV0cnkgZGFsYW0gJHsoYmFja29mZiAvIDEwMDApLnRvRml4ZWQoMCl9cyAocGVyY29iYWFuIGtlLSR7ZXJyQ291bnR9KS4uLmAsICd3YXJuJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB3YWl0Rm9yU2NoZWR1bGVkV29yayhiYWNrb2ZmKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChyZXN1bHQgPT09ICd3YWl0aW5nJyB8fCByZXN1bHQgPT09ICd3b3JrZWQnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJDb3VudCA9IDA7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBkZWxheSA9IE1hdGgubWF4KDEwMDAsIHN0YXRlLm5leHRXb3JrVGltZXN0YW1wIC0gRGF0ZS5ub3coKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB3YWl0Rm9yU2NoZWR1bGVkV29yayhkZWxheSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB3YWl0Rm9yU2NoZWR1bGVkV29yaygxMDAwMCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCB3YWl0Rm9yU2NoZWR1bGVkV29yaygxMDAwMCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyb3I/Lm1lc3NhZ2U/LmluY2x1ZGVzKCdFeHRlbnNpb24gY29udGV4dCBpbnZhbGlkYXRlZCcpIHx8ICFjaHJvbWUucnVudGltZT8uaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdbQXV0byBXb3JrZXJdIEVrc3RlbnNpIHRlbGFoIGRpLXJlbG9hZC4gTG9vcCBkaWhlbnRpa2FuIGJlcnNpaC4nKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCdbTWFpbkxvb3BdJywgZXJyb3IpO1xuICAgICAgICAgICAgICAgIGxvZyhgTWFpbiBsb29wIGVycm9yOiAke2Vycm9yLm1lc3NhZ2V9YCwgJ2Vycm9yJyk7XG4gICAgICAgICAgICAgICAgZXJyQ291bnQrKztcbiAgICAgICAgICAgICAgICBjb25zdCBiYWNrb2ZmID0gTWF0aC5taW4oMzAwMDAwLCAxMDAwMCAqIE1hdGgucG93KDIsIGVyckNvdW50IC0gMSkpO1xuICAgICAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JTY2hlZHVsZWRXb3JrKGJhY2tvZmYpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKCFzdGF0ZS50YWJMb2NrTWFuYWdlZCkge1xuICAgICAgICBsb2coJ1dlYiBMb2NrcyB0aWRhayB0ZXJzZWRpYTsgcGVybGluZHVuZ2FuIG11bHRpLXRhYiB0aWRhayBha3RpZi4nLCAnd2FybicpO1xuICAgICAgICBhd2FpdCBydW5Xb3JrZXJMb29wKCk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBfc2V0VGFiTG9ja093bmVyKHN0YXRlLCBmYWxzZSwgY3R4KTtcbiAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgICBsZXQgYWNxdWlyZWQgPSBmYWxzZTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IG5hdmlnYXRvci5sb2Nrcy5yZXF1ZXN0KCdwYXJsYW1lbnR1bS1hdXRvLXdvcmtlcicsIHsgaWZBdmFpbGFibGU6IHRydWUgfSwgYXN5bmMgbG9jayA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKCFsb2NrKSByZXR1cm47XG4gICAgICAgICAgICAgICAgYWNxdWlyZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHJlbG9hZFN0YXRlRnJvbVN0b3JhZ2Uoc3RhdGUsICgpID0+IHsgd29ya0hpc3RvcnkgPSBsb2FkV29ya0hpc3Rvcnkoc3RhdGUsIENPTkZJRyk7IH0pO1xuICAgICAgICAgICAgICAgIGlmIChnZXRWYWx1ZSgnYXdfd29ya1Jlc3VsdFVuY2VydGFpbicsICdmYWxzZScpID09PSAndHJ1ZScpIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUud29ya1Jlc3VsdFVuY2VydGFpbiA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIHN0YXRlLnJ1bm5pbmcgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgdXBkYXRlUGFuZWwoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgX3NldFRhYkxvY2tPd25lcihzdGF0ZSwgdHJ1ZSwgY3R4KTtcbiAgICAgICAgICAgICAgICBzdGF0ZS53YWl0ZWRGb3JUYWJMb2NrID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgYXdhaXQgcnVuV29ya2VyTG9vcCgpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBsb2coYFdlYiBMb2NrcyBnYWdhbDogJHtlcnJvci5tZXNzYWdlfS4gV29ya2VyIGRpamVkYS5gLCAnZXJyb3InKTtcbiAgICAgICAgICAgIHN0YXRlLnJ1bm5pbmcgPSBmYWxzZTtcbiAgICAgICAgICAgIF9zZXRUYWJMb2NrT3duZXIoc3RhdGUsIGZhbHNlLCBjdHgpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGlmICghYWNxdWlyZWQpIHtcbiAgICAgICAgICAgIHN0YXRlLndhaXRlZEZvclRhYkxvY2sgPSB0cnVlO1xuICAgICAgICAgICAgX3NldFRhYkxvY2tPd25lcihzdGF0ZSwgZmFsc2UsIGN0eCk7XG4gICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgNTAwMCkpO1xuICAgICAgICB9XG4gICAgfVxufSkoKTtcblxuLy8g4pSA4pSA4pSAIFByaXZhdGUgdXRpbGl0aWVzIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG5mdW5jdGlvbiBfcnVuTWlncmF0aW9ucyhzdGF0ZSwgQ09ORklHLCB3b3JrSGlzdG9yeSkge1xuICAgIGNvbnN0IHZlcnNpb24gPSBnZXRTdG9yZWRJbnRlZ2VyKCdhd19lbmVyZ3lTY2hlbWFWZXJzaW9uJywgMSwgMSwgMik7XG4gICAgaWYgKHZlcnNpb24gPj0gMikgcmV0dXJuO1xuXG4gICAgaWYgKHN0YXRlLnRvdGFsV29ya1hQIDwgc3RhdGUudG90YWxXb3JrZWQgKiAzICYmIHN0YXRlLnRvdGFsV29ya2VkID4gMCkge1xuICAgICAgICBzdGF0ZS50b3RhbFdvcmtYUCA9IHN0YXRlLnRvdGFsV29ya2VkICogMTAgLyAxMCAqIDQ7IC8vIHJvdWdoIGVzdGltYXRlXG4gICAgICAgIHNldFZhbHVlKCd0b3RhbFdvcmtYUCcsIHN0YXRlLnRvdGFsV29ya1hQLnRvU3RyaW5nKCkpO1xuICAgIH1cbiAgICBpZiAoc3RhdGUudG90YWxFbmVyZ3lTcGVudCA8IHN0YXRlLnRvdGFsV29ya2VkICogNSAmJiBzdGF0ZS50b3RhbFdvcmtlZCA+IDApIHtcbiAgICAgICAgc3RhdGUudG90YWxFbmVyZ3lTcGVudCA9IHN0YXRlLnRvdGFsV29ya2VkICogMTA7XG4gICAgICAgIHNldFZhbHVlKCd0b3RhbEVuZXJneVNwZW50Jywgc3RhdGUudG90YWxFbmVyZ3lTcGVudC50b1N0cmluZygpKTtcbiAgICAgICAgY29uc29sZS5sb2coJ1tJbml0XSBFc3RpbWFzaSBlbmVyZ2kgbWFzYSBsYWx1IGRpdGVyYXBrYW4gKG1pZ3Jhc2kgc2VrYWxpIGphbGFuKS4nKTtcbiAgICB9XG4gICAgc2V0VmFsdWUoJ2F3X2VuZXJneVNjaGVtYVZlcnNpb24nLCAnMicpO1xufVxuXG5mdW5jdGlvbiBfY2hlY2tBbmRSZWZyZXNoVG9rZW4oc3RhdGUsIENPTkZJRywgbG9nLCBjdHggPSBudWxsKSB7XG4gICAgaWYgKCFjaHJvbWUucnVudGltZT8uaWQpIHJldHVybjtcbiAgICBpZiAoIXN0YXRlLmN1cnJlbnRUb2tlbikgcmV0dXJuO1xuICAgIGlmICghc3RhdGUudG9rZW5FeHBpcnkpIHJldHVybjtcbiAgICBjb25zdCByZW1haW5pbmcgPSBzdGF0ZS50b2tlbkV4cGlyeSAtIERhdGUubm93KCk7XG4gICAgaWYgKHJlbWFpbmluZyA8PSAwKSB7XG4gICAgICAgIGlmICghc3RhdGUucGF1c2VkRm9yVG9rZW4pIHtcbiAgICAgICAgICAgIGxvZygnVG9rZW4gc2VzaSBrZWRhbHV3YXJzYS4gTWUtcmVsb2FkIHRhYiBvdG9tYXRpcyB1bnR1ayBtZW1wZXJiYXJ1aSB0b2tlbi4uLicsICd3YXJuJyk7XG4gICAgICAgICAgICBzdGF0ZS5wYXVzZWRGb3JUb2tlbiA9IHRydWU7XG4gICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgICB3aW5kb3cubG9jYXRpb24ucmVsb2FkKCk7XG4gICAgICAgICAgICB9LCAxNTAwKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChyZW1haW5pbmcgPCBDT05GSUcudG9rZW5FeHBpcnlUaHJlc2hvbGQpIHtcbiAgICAgICAgbG9nKGBUb2tlbiBha2FuIGV4cGlyZWQgZGFsYW0gJHtNYXRoLnJvdW5kKHJlbWFpbmluZyAvIDEwMDApfSBkZXRpayFgLCAnd2FybicpO1xuICAgICAgICBsb2coJ1Rva2VuIHRpZGFrIGF1dG8tcmVmcmVzaC4gTG9naW4gdWxhbmcgamlrYSBleHBpcmVkLicsICd3YXJuJyk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBfc2V0VGFiTG9ja093bmVyKHN0YXRlLCBpc093bmVyLCBjdHgpIHtcbiAgICBzdGF0ZS5pc1RhYkxvY2tPd25lciA9IGlzT3duZXI7XG4gICAgaWYgKGN0eD8uQ09ORklHKSB7XG4gICAgICAgIHVwZGF0ZVBhbmVsVmlzaWJpbGl0eShzdGF0ZSwgY3R4LkNPTkZJRyk7XG4gICAgfVxuICAgIC8vIE5vdGlmeSBVSSBtb2R1bGVzIG9mIG93bmVyc2hpcCBjaGFuZ2VcbiAgICBjdHgudXBkYXRlUGFuZWw/LigpO1xufVxuXG5mdW5jdGlvbiBfbG9nU3RhcnR1cChsb2csIENPTkZJRywgc3RhdGUpIHtcbiAgICBjb25zdCB1cHRpbWUgPSBNYXRoLmZsb29yKChEYXRlLm5vdygpIC0gc3RhdGUuc2NyaXB0U3RhcnRUaW1lKSAvIDEwMDApO1xuICAgIGxvZygnQXV0byBXb3JrZXIgdjUuMTEuMCAoTmV0d29yayBJbnRlcmNlcHRvcikgYWt0aWYuJywgJ3N1Y2Nlc3MnKTtcbiAgICBsb2coYEVuZXJneSBUaHJlc2hvbGQ6ICR7Q09ORklHLmVuZXJneVRocmVzaG9sZH0gRU5gLCAnaW5mbycpO1xuICAgIGxvZyhgSGlzdG9yeTogc2ltcGFuICR7Q09ORklHLmhpc3RvcnlNYXhEYXlzfSBoYXJpIHRlcmFraGlyYCwgJ2luZm8nKTtcbiAgICBsb2coYFF1aWV0IG1vZGU6ICR7Q09ORklHLnF1aWV0TW9kZUVuYWJsZWQgPyAnT04nIDogJ09GRid9YCwgJ2luZm8nKTtcbiAgICBsb2coYFNob3J0Y3V0czogJHtPYmplY3QudmFsdWVzKENPTkZJRy5zaG9ydGN1dHMpLm1hcChzID0+IHMuZGlzcGxheSkuam9pbignLCAnKX1gLCAnaW5mbycpO1xuICAgIGxvZyhgU2NyaXB0IHVwdGltZTogJHt1cHRpbWV9c2AsICdpbmZvJyk7XG59XG5cbmZ1bmN0aW9uIF93YXRjaFNwYU5hdmlnYXRpb24ob25Sb3V0ZUNoYW5nZWQpIHtcbiAgICBsZXQgbGFzdFBhdGggPSB3aW5kb3cubG9jYXRpb24ucGF0aG5hbWU7XG4gICAgY29uc3QgY2hlY2sgPSAoKSA9PiB7XG4gICAgICAgIGlmICh3aW5kb3cubG9jYXRpb24ucGF0aG5hbWUgIT09IGxhc3RQYXRoKSB7XG4gICAgICAgICAgICBsYXN0UGF0aCA9IHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZTtcbiAgICAgICAgICAgIG9uUm91dGVDaGFuZ2VkPy4oKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgb3JpZ1B1c2hTdGF0ZSA9IGhpc3RvcnkucHVzaFN0YXRlO1xuICAgICAgICBoaXN0b3J5LnB1c2hTdGF0ZSA9IGZ1bmN0aW9uKC4uLmFyZ3MpIHtcbiAgICAgICAgICAgIG9yaWdQdXNoU3RhdGUuYXBwbHkodGhpcywgYXJncyk7XG4gICAgICAgICAgICBjaGVjaygpO1xuICAgICAgICB9O1xuICAgICAgICBjb25zdCBvcmlnUmVwbGFjZVN0YXRlID0gaGlzdG9yeS5yZXBsYWNlU3RhdGU7XG4gICAgICAgIGhpc3RvcnkucmVwbGFjZVN0YXRlID0gZnVuY3Rpb24oLi4uYXJncykge1xuICAgICAgICAgICAgb3JpZ1JlcGxhY2VTdGF0ZS5hcHBseSh0aGlzLCBhcmdzKTtcbiAgICAgICAgICAgIGNoZWNrKCk7XG4gICAgICAgIH07XG4gICAgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3BvcHN0YXRlJywgY2hlY2spO1xuICAgIHNldEludGVydmFsKGNoZWNrLCAxMDAwKTtcbn1cbiJdLCJuYW1lcyI6WyJsb2FkV29ya0hpc3RvcnkiLCJoaXN0b3J5IiwiY2xlYXJTdG9yZWRMb2dzIiwiZ2V0Q3VycmVudEVuZXJneSIsIm1hdGNoZXMiLCJtIiwic3luY0Jhc2UiLCJsb2ciLCJzZXRSdW5uaW5nVUkiLCJzZW5kTm90aWZpY2F0aW9uIiwicGxheU5vdGlmaWNhdGlvblNvdW5kIiwidXBkYXRlUGFuZWwiLCJzZXRWYWx1ZSIsImdldFN5bmNlZEVuZXJneSIsImdldFBsYXllckxldmVsIiwiZ2V0TWF4RW5lcmd5Rm9yTGV2ZWwiLCJvcGVuU2V0dGluZ3MiLCJvcGVuTG9nVmlld2VyIiwiZG9Xb3JrIiwiX2xvZyIsImhhbmRsZU5ld1Rva2VuIiwiX2hhbmRsZU5ld1Rva2VuIiwiX2dldFRva2VuRnJvbVN0b3JhZ2UiLCJfdXBkYXRlUGFuZWwiXSwibWFwcGluZ3MiOiI7O0FBU0EsUUFBTSxTQUFTLENBQUE7QUFLUixpQkFBZSxjQUFjO0FBQ2hDLFVBQU0sT0FBTyxNQUFNLE9BQU8sUUFB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
