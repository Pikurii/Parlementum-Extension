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
    const prefix = type === "error" ? "❌" : type === "success" ? "✅" : type === "warn" ? "⚠️" : "ℹ️";
    if (toActivityLog && type === "warn" && /(?:Energi (?:belum|tidak) cukup|Server menolak kerja|Shift tidak menghasilkan unit)/i.test(message) && CONFIG.quietModeEnabled) {
      const nowMs = Date.now();
      if (nowMs - state.lastLowEnergyLogTime < CONFIG.quietModeInterval) return;
      state.lastLowEnergyLogTime = nowMs;
    }
    if (toActivityLog && (type === "warn" || type === "error")) {
      const throttleKey = /^⏳ Retry dalam /.test(message) ? `${type}:retry` : `${type}:${message}`;
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
    logFn(`🔑 Token valid via ${source}! Exp: ${timeStr}`, "success");
    state.tokenExpired = false;
    if (state.pausedForToken || !state.running) {
      state.running = true;
      state.pausedForToken = false;
      logFn("▶️ Sesi diperbarui. Script dilanjutkan otomatis!", "success");
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
    if (state.lastWorkTimestamp && now - state.lastWorkTimestamp < 3e5) {
      const elapsedMins = Math.floor((now - state.lastWorkTimestamp) / 6e4);
      const postShiftEnergy = state.postShiftEnergy ?? 0;
      const theoreticalMax = Math.min(state.maxEnergy || 115, postShiftEnergy + elapsedMins);
      if (pageEnergy && pageEnergy.current > theoreticalMax + 2) {
        return { current: theoreticalMax, max: state.maxEnergy || 115 };
      }
    }
    if (pageEnergy && !isHidden && !state.domEnergyStale) {
      state.domEnergyStale = false;
      if (!state.energySyncBase || state.energySyncBase.current !== pageEnergy.current || state.energySyncBase.max !== pageEnergy.max) {
        state.energySyncBase = { current: pageEnergy.current, max: pageEnergy.max, updatedAt: now };
      }
      return pageEnergy;
    }
    const syncBase = state.energySyncBase;
    if (syncBase && typeof syncBase.current === "number") {
      const max = syncBase.max || state.maxEnergy || 115;
      const elapsedMins = syncBase.updatedAt ? (now - syncBase.updatedAt) / 6e4 : 0;
      const regenRate = state.regenRate || 1;
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
  function getRegionDetails(force = false) {
    if (typeof document === "undefined") {
      return { name: "Wilayah", level: 0, bonusPercent: 0, bonusMultiplier: 1 };
    }
    const now = Date.now();
    if (!force && _cachedRegionDetails && now - _lastRegionScanTime < 3e4) {
      return _cachedRegionDetails;
    }
    let name = "";
    let level = 0;
    try {
      const allHeadings = document.querySelectorAll("h1, h2, h3, h4, h5, h6, span, div, p");
      for (const h of allHeadings) {
        const txt = (h.textContent || "").trim();
        if (/^DITEMPATKAN\s+DI\b/i.test(txt) && txt.length < 30) {
          let next = h.nextElementSibling;
          if (!next && h.parentElement) {
            const children = Array.from(h.parentElement.children);
            const idx = children.indexOf(h);
            if (idx !== -1 && idx + 1 < children.length) {
              next = children[idx + 1];
            }
          }
          if (next) {
            const candidate = (next.textContent || "").trim();
            if (candidate && candidate.length < 40) {
              name = candidate;
              break;
            }
          }
        }
      }
      if (!name) {
        const topbar = document.querySelector('header, nav, [role="banner"]');
        if (topbar) {
          const subtext = topbar.querySelectorAll("span, div, p");
          for (const st of subtext) {
            const t = (st.textContent || "").trim();
            if (t.includes("Negara Kesatuan Republik") || t.includes("USD")) {
              const parts = t.split(/[,·]/);
              if (parts.length > 0 && parts[0].trim().length < 30) {
                name = parts[0].trim();
                break;
              }
            }
          }
        }
      }
      const el = document.querySelector('[data-testid="region-index-health"]');
      if (el) {
        const aria = el.querySelector('[aria-label*="Kesehatan"]')?.getAttribute("aria-label");
        const ariaMatch = aria?.match(/Kesehatan\s+(\d+)/i);
        if (ariaMatch) {
          level = parseInt(ariaMatch[1], 10);
        } else {
          const text = (el.textContent || "").trim();
          const matches = text.match(/\b([0-9]|10)\b/g);
          if (matches && matches.length > 0) {
            level = parseInt(matches[matches.length - 1], 10);
          }
        }
      }
    } catch {
    }
    level = Math.max(0, Math.min(10, level));
    const bonusPercent = level * 5;
    const bonusMultiplier = 1 + bonusPercent / 100;
    const result = {
      name: name || "Wilayah",
      level,
      bonusPercent,
      bonusMultiplier
    };
    _cachedRegionDetails = result;
    _lastRegionScanTime = now;
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
    if (isSleepTime(CONFIG)) return "🌙 Tidur";
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
    const needed = state.maxEnergy - state.currentEnergy;
    if (needed <= 0) return "Penuh!";
    const regenRate = state.regenRate || 1;
    const minutes = Math.ceil(needed / regenRate);
    if (minutes < 60) return `~${minutes}m`;
    const h = Math.floor(minutes / 60), m = minutes % 60;
    if (h < 24) return `~${h}h ${m}m`;
    const d = Math.floor(h / 24);
    return `~${d}d ${h % 24}h`;
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
      const FORBIDDEN_WORDS = /(?:KESEHATAN|PENDIDIKAN|MILITER|INDUSTRI|LISTRIK|KAPASITAS|MISI|KEMAJUAN|KEKUATAN|EKONOMI|KOTA|INFRASTRUKTUR|PASAR|BARANG)/i;
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
          while (card && card !== document.body) {
            const cardText = (card.textContent || "").trim();
            if (FORBIDDEN_WORDS.test(cardText)) break;
            if (cardText.includes("/") && /\d+\s*\/\s*\d+/.test(cardText) && cardText.length < 120) {
              const innerEls = card.querySelectorAll("*");
              for (const el of innerEls) {
                if (isExcluded(el)) continue;
                const txt = (el.textContent || "").trim();
                if (txt.includes("/") && txt.length <= 25 && /\d+\s*\/\s*\d+/.test(txt)) {
                  patchTextInElement(el);
                }
              }
              const bars = card.querySelectorAll('[role="progressbar"], div[style*="width"], span[style*="width"]');
              for (const bar of bars) {
                if (isExcluded(bar)) continue;
                if (bar.style.width && bar.style.width.includes("%")) {
                  bar.style.width = `${pct}%`;
                }
                if (bar.hasAttribute("aria-valuenow")) {
                  bar.setAttribute("aria-valuenow", String(safeCurrent));
                }
                if (bar.hasAttribute("aria-valuemax")) {
                  bar.setAttribute("aria-valuemax", String(safeMax));
                }
              }
              break;
            }
            card = card.parentElement;
          }
        }
      }
      const topCandidates = document.querySelectorAll('header, nav, [role="banner"], [class*="nav" i], [class*="header" i], [class*="topbar" i], [class*="navbar" i]');
      for (const container of topCandidates) {
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
          if (safeCurrent < 10) {
            btn.style.opacity = "0.55";
            btn.style.filter = "grayscale(0.6)";
            btn.title = `Energi saat ini ${safeCurrent}/${safeMax}⚡ (butuh minimal 10⚡ untuk giliran kerja)`;
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
          console.log("[Auto Worker] 🔐 Kredensial login berhasil disimpan otomatis untuk Auto Re-Login.");
          logFn?.("🔐 Kredensial login berhasil diperbarui otomatis!", "info");
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
      console.log("[Auto Worker] 🔐 Auto Re-Login aktif tetapi belum ada email & kata sandi tersimpan.");
      logFn?.("🔐 Auto Re-Login aktif tetapi belum ada email & kata sandi tersimpan. Silakan isi di Settings atau login manual sekali.", "info");
      return false;
    }
    let attempts = 0;
    try {
      attempts = parseInt(sessionStorage.getItem("aw_login_attempts") || "0", 10);
    } catch {
    }
    if (attempts >= 2) {
      console.warn("[Auto Worker] ⚠️ Auto Re-Login dihentikan sementara: telah mencoba 2x.");
      logFn?.("⚠️ Auto Re-Login dihentikan sementara: telah mencoba 2x. Silakan login manual untuk verifikasi akun.", "error");
      sendNotificationFn?.(CONFIG, "Auto Re-Login Dihentikan", "Mencapai batas 2x percobaan. Silakan periksa akun.");
      return false;
    }
    console.log("[Auto Worker] ⏳ Halaman login terdeteksi. Mempersiapkan Auto Re-Login...");
    logFn?.("⏳ Halaman login terdeteksi. Memulai Auto Re-Login dalam 1.5 detik...", "info");
    await new Promise((r) => setTimeout(r, 1200));
    const elements = await waitForLoginInputs(1e4);
    if (!elements) {
      console.warn("[Auto Worker] ⚠️ Elemen form login tidak ditemukan dalam 10 detik.");
      logFn?.("⚠️ Elemen form login tidak ditemukan dalam 10 detik.", "warn");
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
    console.log(`[Auto Worker] 🔑 Mengirim login otomatis untuk ${creds.email}...`);
    logFn?.(`🔑 Mengirim login otomatis untuk ${creds.email}...`, "info");
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
      log2("⚡ Menjalankan shift kerja manual...", "info");
    }
    state.workInFlight = true;
    state.workInFlightAt = Date.now();
    let timeoutId = null;
    let energyBefore = null;
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
        log2(`🌙 Jam istirahat aktif (${CONFIG.sleepStartHour ?? 1}:00 - ${CONFIG.sleepEndHour ?? 6}:00 WIB). Auto Worker tidur sampai pukul ${wakeHour}...`, "info");
        state.nextWorkTimestamp = Date.now() + msUntilWake;
        updatePanel2();
        return "waiting";
      }
      if (state.currentEnergy < 10 && manual) {
        log2(`⚠️ Energi saat ini (${state.currentEnergy}/${state.maxEnergy}⚡) belum cukup! Butuh minimal 10⚡ untuk giliran kerja.`, "warn");
        return "waiting";
      }
      if (state.currentEnergy < CONFIG.energyThreshold && !manual) {
        log2(`Energi belum cukup (${state.currentEnergy}/${CONFIG.energyThreshold})`, "warn");
        state.nextWorkTimestamp = Date.now() + getNextWorkDelay(state, CONFIG);
        return "waiting";
      }
      energyBefore = getCurrentEnergy$1() || energy;
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
        return _handleSuccess(ctx, response, energy);
      } else if (response.status === 401) {
        return _handleUnauthorized(ctx);
      } else if (response.status === 400 || response.status === 422) {
        return _handleRejected(ctx, response);
      } else {
        log2(`Error HTTP: ${response.status}`, "error");
        return "retry";
      }
    } catch (error) {
      if (error.name === "AbortError") {
        return _handleTimeout(ctx, energyBefore);
      }
      console.error("[doWork] Error:", error);
      log2(`Gagal koneksi: ${error.message}`, "error");
      return "retry";
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
      state.workInFlight = false;
    }
  }
  async function _handleSuccess(ctx, response, energy) {
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
      log2(`Shift selesai tapi menghasilkan 0 XP (energi game saat ini: ${state.currentEnergy}/${state.maxEnergy}⚡). Menunggu energi pulih...`, "warn");
      state.nextWorkTimestamp = Date.now() + waitMs;
      updatePanel2();
      return "waiting";
    }
    const available = Math.floor(state.currentEnergy / 10) * 10;
    const fallbackBlocks = Math.floor(available / 10);
    const xpGained = Number.isSafeInteger(parsedXp) && parsedXp > 0 ? parsedXp : hasReportedEnergy ? Math.floor(parsedEnergyUsed / 10) * 4 : fallbackBlocks * 4;
    if (xpGained <= 0) {
      log2(`Shift tidak menghasilkan XP. Energi saat ini: ${state.currentEnergy}/${state.maxEnergy}⚡.`, "warn");
      updatePanel2();
      return "waiting";
    }
    const energySpent = hasReportedEnergy ? parsedEnergyUsed : Math.max(10, available);
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
    state.currentEnergy = Math.max(0, state.currentEnergy - energySpent);
    state.energySyncBase = { current: state.currentEnergy, max: state.maxEnergy, updatedAt: Date.now() };
    state.lastWorkTimestamp = Date.now();
    state.domEnergyStale = true;
    patchPageVisualEnergy(state.currentEnergy, state.maxEnergy, true);
    try {
      window.dispatchEvent(new Event("focus"));
    } catch {
    }
    saveState(state);
    log2(`Kerja sukses! +${xpGained} XP | Sisa: ${state.currentEnergy}/${state.maxEnergy}⚡`, "success");
    playNotificationSound2(CONFIG, "success");
    sendNotification2(CONFIG, "Parlamentum", `Kerja sukses! +${xpGained} XP`);
    state.nextWorkTimestamp = Date.now() + getNextWorkDelay(state, CONFIG);
    updatePanel2();
    wakePendingWork?.();
    return "worked";
  }
  function _handleUnauthorized(ctx) {
    const { state, CONFIG, log: log2, setRunningUI: setRunningUI2, sendNotification: sendNotification2, playNotificationSound: playNotificationSound2, updatePanel: updatePanel2 } = ctx;
    log2("🔄 Sesi token kedaluwarsa (401). Me-reload tab game dalam 2 detik untuk memperbarui token via session cookie...", "warn");
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
      log2("❌ Majikan Kehabisan Saldo! Kas perusahaan tidak cukup untuk membayar upah. Script di-pause.", "error");
      state.running = false;
      setRunningUI2(false);
      sendNotification2(CONFIG, "Parlamentum", "Kas majikan habis! Pindah lowongan di Job Board.");
      return "paused";
    }
    if (/region|wilayah|transit|travel|penerbangan/i.test(combined)) {
      log2(`⚠️ ${serverMessage || "Anda harus berada di wilayah perusahaan untuk bekerja (sedang dalam perjalanan)"}. Menunggu 3 menit...`, "warn");
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
      log2(`Server menolak kerja (HTTP ${response.status}): ${serverMessage || "Energi di server belum cukup"}. Menunggu target ${CONFIG.energyThreshold}⚡ (~${waitMins} mnt)...`, "warn");
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
    minimize: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`,
    expand: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>`,
    lockOpen: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`,
    lockClosed: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`,
    settings: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 4.6a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
    close: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    robot: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><path d="M12 7v4"></path><line x1="8" y1="16" x2="8" y2="16"></line><line x1="16" y1="16" x2="16" y2="16"></line></svg>`,
    chart: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>`
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
        if (reg.bonusMultiplier && reg.bonusMultiplier !== state.regenRate) {
          state.regenRate = reg.bonusMultiplier;
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
      el.textContent = isReadyToWork ? "Siap!" : liveCountdown;
      el.style.color = isReadyToWork ? "#00ff88" : "#00d9ff";
    });
    _patchEl("aw-pill-countdown-icon", (el) => {
      el.textContent = isReadyToWork ? "⚡" : "⏳";
    });
    _patchEl("aw-pill-status-dot", (el) => {
      const dotColor = state.workResultUncertain ? "#ffaa00" : state.running ? "#00ff88" : "#ff4757";
      el.style.background = dotColor;
      el.style.boxShadow = `0 0 8px ${dotColor}`;
    });
    _patchEl("aw-pill-container", (el) => {
      const statusText = state.workResultUncertain ? "⚠️ Hasil kerja belum pasti!" : state.running ? "Sedang Berjalan" : "Di-pause";
      el.title = `Auto Worker: ${statusText}
⚡ Energi: ${state.currentEnergy}/${state.maxEnergy}
⏳ Giliran: ${liveCountdown}
📊 Hari ini: ${state.workToday}x (+${state.totalWorkXP} XP)

(Seret untuk geser posisi • Klik 2x untuk perbesar)`;
    });
    _patchEl("aw-next-wrap", (el) => {
      if (isReadyToWork) {
        el.title = "⚡ Energi sudah mencapai target! Siap bekerja.";
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
        el.title = "⚡ Energi sudah 100% penuh!";
      } else {
        const rate = state.regenRate || 1;
        const fullMs = Math.round(needed / rate * 6e4);
        const d = new Date(Date.now() + fullMs);
        const timeStr = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
        el.title = `Estimasi energi 100% penuh: pk. ${timeStr} WIB`;
      }
    });
    _patchEl("aw-today", (el) => el.textContent = `${state.workToday}x`);
    _patchEl("aw-worked", (el) => el.textContent = `${state.totalWorked}x`);
    _patchEl("aw-xp", (el) => el.textContent = `+${state.totalWorkXP} XP`);
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
      el.textContent = running ? "⏸ Pause" : "▶ Resume";
      el.style.background = running ? "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)" : "linear-gradient(135deg, #10b981 0%, #059669 100%)";
      el.style.boxShadow = `0 2px 8px ${running ? "rgba(239,68,68,0.3)" : "rgba(16,185,129,0.3)"}`;
    });
    _patchEl("aw-status-dot", (el) => {
      el.style.background = running ? "#00ff88" : "#ff4757";
      el.style.boxShadow = `0 0 8px ${running ? "#00ff88" : "#ff4757"}`;
    });
    _patchEl("aw-pill-toggle", (el) => {
      el.textContent = running ? "⏸" : "▶";
      el.title = running ? "Pause Worker" : "Resume Worker";
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
                padding: 9px 12px; cursor: ${isPinned ? "default" : "move"};
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                display: flex; justify-content: space-between; align-items: center;
                border-radius: 12px 12px 0 0;
                gap: 8px; box-sizing: border-box; width: 100%;
            ">
                <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;min-width:0;">
                    <span style="color:#00d9ff;display:flex;align-items:center;flex-shrink:0;">${ICONS.robot}</span>
                    <span style="font-weight:700;color:#fff;font-size:12.5px;letter-spacing:0.2px;white-space:nowrap;">Auto Worker</span>
                    <span id="aw-status-dot" style="
                        width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0;
                        background:${running ? "#00ff88" : "#ff4757"};
                        box-shadow:0 0 8px ${running ? "#00ff88" : "#ff4757"};
                    "></span>
                </div>
                <div style="display:flex;align-items:center;gap:2px;flex-shrink:0;">
                    <button id="aw-minimize"  class="aw-header-btn" title="Mode Ringkas (Pill)" style="${HEADER_BTN_STYLE}">${ICONS.minimize}</button>
                    <button id="aw-pin"       class="aw-header-btn" title="${isPinned ? "Unpin" : "Pin"}" style="${HEADER_BTN_STYLE} background:${isPinned ? "rgba(0, 136, 255, 0.2)" : "transparent"};color:${isPinned ? "#00d9ff" : "#8892b0"};border:${isPinned ? "1px solid rgba(0, 136, 255, 0.4)" : "none"};">${isPinned ? ICONS.lockClosed : ICONS.lockOpen}</button>
                    <button id="aw-analytics" class="aw-header-btn" title="Statistik & Riwayat" style="${HEADER_BTN_STYLE}">${ICONS.chart}</button>
                    <button id="aw-settings"  class="aw-header-btn" title="Pengaturan" style="${HEADER_BTN_STYLE}">${ICONS.settings}</button>
                    <button id="aw-hide"      class="aw-header-btn" title="Sembunyikan (${CONFIG.shortcuts.showHide.display})" style="${HEADER_BTN_STYLE}color:#ff5252;margin-left:2px;">${ICONS.close}</button>
                </div>
            </div>
            <div id="aw-body" style="padding: 12px; display: block;">
                <div id="aw-uncertain-banner" style="display:${state.workResultUncertain ? "block" : "none"};margin-bottom:10px;padding:9px;background:rgba(255,68,68,0.12);border:1px solid rgba(255,68,68,0.55);border-radius:6px;color:#ffb3b3;font-size:11px;line-height:1.4;">
                    <div style="font-weight:700;color:#ff7777;margin-bottom:4px;">Hasil kerja terakhir belum pasti</div>
                    <div>Periksa halaman game sebelum melanjutkan.</div>
                    <div id="aw-reconciliation-status" style="margin-top:4px;color:#ffd166;">Status rekonsiliasi: menunggu pembacaan energi.</div>
                    <button id="aw-confirm-uncertain" style="margin-top:7px;padding:5px 8px;background:#8f3030;color:#fff;border:1px solid #b44;border-radius:4px;cursor:pointer;font-size:10px;">Saya sudah memeriksa, lanjutkan</button>
                </div>

                <!-- Region & Buff Badge -->
                <div id="aw-region-badge" style="
                    display: flex; align-items: center; justify-content: space-between;
                    background: linear-gradient(135deg, rgba(0, 217, 255, 0.08) 0%, rgba(0, 255, 136, 0.05) 100%);
                    border: 1px solid rgba(0, 217, 255, 0.2);
                    border-radius: 8px;
                    padding: 5px 9px;
                    margin-bottom: 9px;
                    font-size: 11px;
                ">
                    <div style="display:flex;align-items:center;gap:5px;overflow:hidden;">
                        <span style="font-size:12px;">📍</span>
                        <span id="aw-region-name" style="font-weight:600;color:#e6edf3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:130px;">${state.regionName || "Memuat wilayah..."}</span>
                    </div>
                    <span id="aw-region-buff" style="
                        background: rgba(0, 255, 136, 0.12);
                        color: #00ff88;
                        border: 1px solid rgba(0, 255, 136, 0.25);
                        padding: 1px 6px;
                        border-radius: 4px;
                        font-weight: 700;
                        font-size: 9.5px;
                        white-space: nowrap;
                    ">${state.regionHealthBonusPercent ? `+${state.regionHealthBonusPercent}% Regen` : "Normal (1.0x)"}</span>
                </div>

                <!-- Energy Card -->
                <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);padding:9px 11px;border-radius:9px;margin-bottom:9px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:11px;">
                        <span style="color:#a0aec0;font-weight:600;">⚡ Energi</span>
                        <span id="aw-energy-text" style="color:#00ff88;font-weight:700;letter-spacing:0.3px;">${state.currentEnergy}/${state.maxEnergy}</span>
                    </div>
                    <div style="background:rgba(0,0,0,0.5);height:7px;border-radius:999px;overflow:hidden;border:1px solid rgba(255,255,255,0.07);padding:1px;">
                        <div id="aw-energy-bar" style="height:100%;width:${state.currentEnergy / state.maxEnergy * 100}%;background:linear-gradient(90deg, #00d9ff, #00ff88);border-radius:999px;transition:width 0.3s ease;box-shadow:0 0 8px rgba(0,255,136,0.35);"></div>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:10px;color:#718096;margin-top:6px;">
                        <span id="aw-next-wrap" style="cursor:help;">Next: <span id="aw-next-work" style="color:#00ff88;font-weight:600;">Now!</span></span>
                        <span id="aw-full-wrap" style="cursor:help;">Full: <span id="aw-full-energy" style="color:#00d9ff;font-weight:500;">${getTimeToFullEnergy(state)}</span></span>
                    </div>
                </div>

                <!-- Stats 3-Col Grid -->
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:9px;">
                    <div style="background:rgba(255,255,255,0.03);padding:7px 5px;border-radius:8px;border:1px solid rgba(255,255,255,0.06);text-align:center;">
                        <div style="font-size:9px;color:#718096;margin-bottom:2px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Hari Ini</div>
                        <div id="aw-today" style="font-size:13.5px;font-weight:700;color:#00d9ff;">${state.workToday}x</div>
                    </div>
                    <div style="background:rgba(255,255,255,0.03);padding:7px 5px;border-radius:8px;border:1px solid rgba(255,255,255,0.06);text-align:center;">
                        <div style="font-size:9px;color:#718096;margin-bottom:2px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Total Shift</div>
                        <div id="aw-worked" style="font-size:13.5px;font-weight:700;color:#f7fafc;">${state.totalWorked}x</div>
                    </div>
                    <div style="background:rgba(255,255,255,0.03);padding:7px 5px;border-radius:8px;border:1px solid rgba(255,255,255,0.06);text-align:center;">
                        <div style="font-size:9px;color:#718096;margin-bottom:2px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Work XP</div>
                        <div id="aw-xp" style="font-size:13.5px;font-weight:700;color:#00ff88;">+${state.totalWorkXP} XP</div>
                    </div>
                </div>

                <!-- Token & Expiry Row -->
                <div style="font-size:10.5px;color:#718096;margin-bottom:9px;padding:6px 9px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04);border-radius:6px;display:flex;justify-content:space-between;align-items:center;">
                    <div style="display:flex;align-items:center;gap:5px;">
                        <span>🔑</span>
                        <span style="color:#a0aec0;">Token:</span>
                        <span id="aw-token-status" style="font-weight:700;color:#00ff88;">VALID</span>
                    </div>
                    <span id="aw-token-expiry" style="font-size:10px;color:#718096;">N/A</span>
                </div>

                <!-- Action Buttons -->
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">
                    <button id="aw-work-now" class="aw-btn-action" style="
                        background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
                        color: #fff; border: 1px solid rgba(255,255,255,0.15);
                        padding: 8px 0; border-radius: 7px; cursor: pointer;
                        font-weight: 600; font-size: 11px; box-shadow: 0 2px 6px rgba(245,158,11,0.25);
                    ">⚡ Work</button>
                    <button id="aw-toggle" class="aw-btn-action" style="
                        background: ${running ? "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)" : "linear-gradient(135deg, #10b981 0%, #059669 100%)"};
                        color: #fff; border: 1px solid rgba(255,255,255,0.15);
                        padding: 8px 0; border-radius: 7px; cursor: pointer;
                        font-weight: 600; font-size: 11px;
                        box-shadow: 0 2px 6px ${running ? "rgba(239,68,68,0.25)" : "rgba(16,185,129,0.25)"};
                    ">${running ? "⏸ Pause" : "▶ Resume"}</button>
                    <button id="aw-logs" class="aw-btn-action" style="
                        background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
                        color: #fff; border: 1px solid rgba(255,255,255,0.15);
                        padding: 8px 0; border-radius: 7px; cursor: pointer;
                        font-weight: 600; font-size: 11px; box-shadow: 0 2px 6px rgba(99,102,241,0.25);
                    ">📋 Log</button>
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
                <span style="color: #00d9ff; display: flex; align-items: center;">${ICONS.robot}</span>
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
                <span style="font-size: 11px;">⚡</span>
                <span id="aw-pill-energy">${state.currentEnergy || 0}/${state.maxEnergy || 110}</span>
            </div>

            <!-- Next Work / Countdown Badge -->
            <div id="aw-pill-countdown-badge" style="
                display: flex; align-items: center; gap: 4px;
                background: rgba(0, 217, 255, 0.08);
                border: 1px solid rgba(0, 217, 255, 0.22);
                border-radius: 6px;
                padding: 2px 7px;
                font-size: 11px;
                font-weight: 700;
                color: #00d9ff;
                letter-spacing: 0.2px;
                flex-shrink: 0;
            " title="Countdown Giliran Kerja">
                <span id="aw-pill-countdown-icon" style="font-size: 11px;">⏳</span>
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
                " title="${running ? "Pause Worker" : "Resume Worker"}">${running ? "⏸" : "▶"}</button>

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
    const { openSettings: openSettings2, openAnalytics: openAnalytics2, openLogViewer: openLogViewer2, doWork: doWork2 } = ctx;
    const minimizeBtn = document.getElementById("aw-minimize");
    const pinBtn = document.getElementById("aw-pin");
    const hideBtn = document.getElementById("aw-hide");
    const toggleBtn = document.getElementById("aw-toggle");
    const workNowBtn = document.getElementById("aw-work-now");
    const logsBtn = document.getElementById("aw-logs");
    const analyticsBtn = document.getElementById("aw-analytics");
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
    analyticsBtn?.addEventListener("click", () => ctx.openAnalytics?.());
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
                    ">🎯 Record</button>
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
                        font-size: 16px;
                    ">⚙️</div>
                    <div>
                        <div style="font-weight: 700; color: #fff; font-size: 15px; letter-spacing: 0.3px;">Pengaturan Bot</div>
                        <div style="font-size: 11px; color: #8b9bb4;">Sesuaikan jadwal, threshold, notifikasi & keamanan</div>
                    </div>
                </div>
                <button id="aw-close-settings" style="
                    background: rgba(255, 255, 255, 0.05); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.12);
                    padding: 6px 12px; border-radius: 8px; cursor: pointer;
                    font-size: 12px; font-weight: 600; transition: all 0.15s;
                ">✕ Tutup</button>
            </div>

            <!-- Segmented Category Tabs -->
            <div class="aw-tab-nav">
                <button class="aw-tab-btn active" data-tab="tab-work">⚡ Kerja & Energi</button>
                <button class="aw-tab-btn" data-tab="tab-stealth">🛡️ Stealth & Jadwal</button>
                <button class="aw-tab-btn" data-tab="tab-notif">🔔 Notifikasi & Suara</button>
                <button class="aw-tab-btn" data-tab="tab-ui">🖥️ Tampilan & Tombol</button>
                <button class="aw-tab-btn" data-tab="tab-account">🔐 Akun & Sistem</button>
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
                            <div class="aw-card-title">⚡ Batas Energi Sebelum Kerja</div>
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <input type="number" id="setting-energy-threshold-num" min="10" max="100" step="5" value="${CONFIG.energyThreshold}" class="aw-num-badge">
                                <span style="color: #00ff88; font-size: 13px; font-weight: 700;">⚡</span>
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
                            <button type="button" class="aw-preset-btn" data-val="10">10⚡ Cepat</button>
                            <button type="button" class="aw-preset-btn" data-val="25">25⚡ Sedang</button>
                            <button type="button" class="aw-preset-btn" data-val="50">50⚡ Hemat</button>
                            <button type="button" class="aw-preset-btn" data-val="80">80⚡ Santai</button>
                            <button type="button" class="aw-preset-btn" data-val="100">100⚡ Penuh</button>
                        </div>
                    </div>

                    <!-- Formula Sleep Info Card -->
                    <div style="background: rgba(0, 255, 136, 0.04); border: 1px solid rgba(0, 255, 136, 0.15); border-radius: 10px; padding: 14px; margin-top: 14px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <span style="color: #00ff88; font-size: 12px; font-weight: 600;">⚡ Rumus Timer Pemulihan</span>
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
                                <div class="aw-card-title">🎲 Humanizer Threshold Jitter</div>
                                <div class="aw-card-desc">Mengacak sedikit ambang batas energi (±2⚡) di setiap siklus agar interval kerja tidak terbaca kaku dan terdeteksi bot oleh server.</div>
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
                                <div class="aw-card-title">🌙 Jam Istirahat / Tidur Malam</div>
                                <div class="aw-card-desc">Bot otomatis berhenti kerja pada rentang jam istirahat malam layaknya pola hidup manusia normal.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-sleep-schedule" ${CONFIG.sleepScheduleEnabled ? "checked" : ""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                        <div style="display: flex; gap: 8px; align-items: center; background: rgba(0,0,0,0.25); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.04);">
                            <span style="font-size: 12px; color: #94a3b8;">Jam Tidur:</span>
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
                                <div class="aw-card-title">🔇 Meredam Log Energi Rendah (Quiet Mode)</div>
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
                                <div class="aw-card-title">📱 Notifikasi Pop-up Browser</div>
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
                                <div class="aw-card-title">⚡ Alert Desktop Saat Energi Penuh</div>
                                <div class="aw-card-desc">Kirim notifikasi desktop segera setelah energi mencapai batas maksimal (100⚡) agar tidak mubazir.</div>
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
                                <div class="aw-card-title">🔔 Suara Notifikasi Kerja</div>
                                <div class="aw-card-desc">Putar efek suara halus saat selesai bekerja atau terjadi kesalahan.</div>
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
                                <div class="aw-card-title">🚨 Bunyi Alarm Energi Penuh</div>
                                <div class="aw-card-desc">Putar alarm khusus saat energi akun sudah menyentuh 100⚡.</div>
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
                    ">🔊 Uji Coba Bunyi Suara (Test Sound)</button>
                </div>

                <!-- TAB 4: TAMPILAN & SHORTCUT -->
                <div id="tab-ui" class="aw-tab-pane">
                    <div class="aw-card">
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">🏠 Hanya Tampilkan di Dashboard (/dashboard)</div>
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
                                <div class="aw-card-title">👑 Hanya Tampilkan di Tab Utama (Standby Hidden)</div>
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
                                <div class="aw-card-title">📐 Sesuaikan dengan Ukuran Jendela Browser</div>
                                <div class="aw-card-desc">Mencegah panel keluar layar saat ukuran browser diperkecil.</div>
                            </div>
                            <label class="aw-switch">
                                <input type="checkbox" id="setting-follow-viewport" ${CONFIG.panelFollowViewport ? "checked" : ""}>
                                <span class="aw-slider"></span>
                            </label>
                        </div>
                        <div class="aw-card-row">
                            <div class="aw-card-info">
                                <div class="aw-card-title">↩️ Kembali ke Posisi Awal Saat Browser Dibesarkan</div>
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
                    ">🔄 Atur Ulang Koordinat Posisi Panel ke Pojok Kanan</button>

                    <!-- Keyboard Shortcuts Sub-Section -->
                    <div style="margin-top: 10px;">
                        <div style="font-size: 13px; font-weight: 600; color: #fff; margin-bottom: 4px;">⌨️ Pintasan Keyboard (Shortcuts)</div>
                        <div style="font-size: 11px; color: #8b9bb4; margin-bottom: 10px;">
                            Klik <b>Record</b> lalu tekan 1–3 kombinasi tombol. Tekan <kbd style="background:#222;padding:1px 4px;border-radius:3px;">Enter</kbd> untuk simpan, <kbd style="background:#222;padding:1px 4px;border-radius:3px;">Esc</kbd> untuk batalkan.
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
                                <div class="aw-card-title">🍃 Mode Eco (Hemat RAM & CPU)</div>
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
                                <div class="aw-card-title">🔐 Auto Re-Login (Masuk Otomatis)</div>
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
                                    <span id="aw-toggle-pwd-vis" style="font-size: 11px; color: #00d4ff; cursor: pointer; user-select: none;">👁️ Lihat</span>
                                </div>
                                <input type="password" id="setting-login-pwd" autocomplete="off" data-lpignore="true" data-form-type="other" placeholder="Kata sandi akunmu" value="${savedCreds?.password || ""}" style="width: 100%; box-sizing: border-box; background: #131724; color: #fff; border: 1px solid #2d364f; border-radius: 6px; padding: 8px 10px; font-size: 12px;">
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <button id="aw-save-login-creds" style="flex: 1; background: linear-gradient(135deg, #0088ff, #0055cc); color: #fff; border: none; padding: 8px; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 600;">💾 Simpan Kredensial</button>
                                <button id="aw-clear-login-creds" style="background: rgba(255,255,255,0.05); color: #ff5555; border: 1px solid rgba(255,85,85,0.3); padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 500;">🗑️ Hapus</button>
                            </div>
                            <div id="aw-login-creds-msg" style="font-size: 11px; margin-top: 8px; display: none;"></div>
                        </div>
                    </div>

                    <div class="aw-card" style="margin-top: 14px; border-color: rgba(255, 85, 85, 0.2);">
                        <div class="aw-card-title" style="color: #ff6b6b; margin-bottom: 6px;">⚠️ Zona Bahaya (Reset Total)</div>
                        <div class="aw-card-desc" style="margin-bottom: 12px;">
                            Mengembalikan seluruh preferensi, batas energi, pintasan keyboard, dan posisi panel ke pengaturan awal pabrik.
                        </div>
                        <button id="aw-restore-defaults" style="
                            background: linear-gradient(135deg, rgba(255, 107, 107, 0.2), rgba(204, 0, 0, 0.3));
                            color: #ff8888; border: 1px solid rgba(255, 107, 107, 0.4); padding: 9px;
                            border-radius: 6px; cursor: pointer; font-weight: 600;
                            font-size: 12px; width: 100%; transition: all 0.15s;
                        ">🔄 Pulihkan Semua Pengaturan ke Default</button>
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
                    ">💾 Simpan Pengaturan</button>
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
          statusEl.textContent = `✅ Tersimpan! Batas energi: ${CONFIG.energyThreshold}⚡`;
          statusEl.style.color = "#00ff88";
          statusEl.style.display = "block";
        } else {
          statusEl.textContent = `💾 Disimpan otomatis (Batas: ${CONFIG.energyThreshold}⚡)`;
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
        togglePwdBtn.textContent = "🙈 Sembunyikan";
      } else {
        pwdInput.type = "password";
        togglePwdBtn.textContent = "👁️ Lihat";
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
          credsMsg.textContent = "⚠️ Harap isi email dan kata sandi!";
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
        credsMsg.textContent = `✅ Kredensial untuk ${email} tersimpan! Auto Re-Login AKTIF.`;
        credsMsg.style.color = "#00ff88";
        credsMsg.style.display = "block";
      }
      ctx.log?.("🔐 Kredensial Auto Re-Login berhasil disimpan.", "success");
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
        credsMsg.textContent = "🗑️ Kredensial telah dihapus dari browser.";
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
          btn.textContent = "⏳ Tekan tombol...";
          btn.style.background = "#ff9500";
          inp.value = "Menunggu input...";
          inp.style.color = "#ff9500";
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
            btn.textContent = "🎯 Record";
            btn.style.background = "#252c40";
          }
          handled = true;
          return;
        }
        if (key === "Enter") {
          if (rec.keys.length > 0) {
            rec.recording = false;
            if (btn) {
              btn.textContent = "✅ Done";
              btn.style.background = "#00ff88";
              btn.style.color = "#000";
              setTimeout(() => {
                btn.textContent = "🎯 Record";
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
            btn.textContent = "✅ Done";
            btn.style.background = "#00ff88";
            btn.style.color = "#000";
            setTimeout(() => {
              btn.textContent = "🎯 Record";
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
        statusEl.textContent = "📍 Posisi panel di-reset ke default";
        statusEl.style.color = "#0088ff";
        statusEl.style.display = "block";
        setTimeout(() => {
          if (statusEl) statusEl.style.display = "none";
        }, 2500);
      }
    });
    document.getElementById("aw-restore-defaults")?.addEventListener("click", () => {
      if (!confirm("⚠️ Yakin ingin mengembalikan SEMUA pengaturan ke default?\n\nIni akan:\n- Reset keyboard shortcuts ke Ctrl+Shift+A/L/S dan Alt+Shift+W/P\n- Reset batas energi ke 10⚡\n- Reset semua checkbox dan slider\n- Reset posisi panel\n\nKonfigurasi yang tersimpan akan dihapus!")) return;
      setValue("aw_config", null);
      setValue("panelX", (CONFIG.panelDefaultX ?? 20).toString());
      setValue("panelY", (CONFIG.panelDefaultY ?? 20).toString());
      ctx.log?.("🔄 Semua pengaturan berhasil di-reset ke default! Refresh halaman untuk menerapkan.", "success");
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
      ctx.log?.(`Pengaturan disimpan! Batas energi sebelum kerja: ${CONFIG.energyThreshold}⚡`, "success");
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
  function ensureAnalyticsStyles() {
    if (document.getElementById("aw-analytics-styles")) return;
    const style = document.createElement("style");
    style.id = "aw-analytics-styles";
    style.textContent = `
        #aw-analytics-modal {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #e2e8f0;
        }

        /* KPI Metric Cards Grid */
        .aw-kpi-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
            margin-bottom: 14px;
        }
        @media (max-width: 600px) {
            .aw-kpi-grid {
                grid-template-columns: repeat(2, 1fr);
            }
        }
        .aw-kpi-card {
            background: rgba(22, 27, 42, 0.6);
            border: 1px solid rgba(255, 255, 255, 0.07);
            border-radius: 10px;
            padding: 12px 14px;
            display: flex;
            flex-direction: column;
            gap: 3px;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .aw-kpi-card:hover {
            background: rgba(28, 35, 54, 0.75);
            border-color: rgba(255, 255, 255, 0.14);
            transform: translateY(-1px);
        }
        .aw-kpi-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 11px;
            color: #8b9bb4;
            font-weight: 500;
        }
        .aw-kpi-value {
            font-size: 19px;
            font-weight: 700;
            letter-spacing: -0.3px;
            line-height: 1.25;
            margin-top: 2px;
        }
        .aw-kpi-sub {
            font-size: 10.5px;
            color: #64748b;
            margin-top: 2px;
            line-height: 1.35;
        }

        /* Analytics Section Cards */
        .aw-analytics-section {
            background: rgba(22, 27, 42, 0.55);
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 12px;
            transition: all 0.2s;
        }
        .aw-analytics-section:hover {
            border-color: rgba(255, 255, 255, 0.1);
        }
        .aw-section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }
        .aw-section-title {
            font-size: 13px;
            font-weight: 600;
            color: #f1f5f9;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .aw-section-subtitle {
            font-size: 11px;
            color: #8b9bb4;
        }

        /* Bar Graph Styling */
        .aw-graph-container {
            background: rgba(12, 16, 26, 0.6);
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: 10px;
            padding: 14px 10px 10px;
            margin-bottom: 12px;
            position: relative;
        }
        .aw-graph-bar {
            border-radius: 3px 3px 0 0;
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            cursor: pointer;
        }
        .aw-graph-bar:hover {
            filter: brightness(1.25);
            transform: scaleY(1.03);
            transform-origin: bottom;
        }

        /* Custom Scrollbar */
        #aw-analytics-content::-webkit-scrollbar {
            width: 6px;
        }
        #aw-analytics-content::-webkit-scrollbar-track {
            background: transparent;
        }
        #aw-analytics-content::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.14);
            border-radius: 4px;
        }
        #aw-analytics-content::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.28);
        }
    `;
    document.head.appendChild(style);
  }
  function createAnalyticsDashboard(state, CONFIG, workHistory, ctx) {
    ensureAnalyticsStyles();
    const old = document.getElementById("aw-analytics-modal");
    if (old) old.remove();
    const modal = document.createElement("div");
    modal.id = "aw-analytics-modal";
    modal.style.cssText = `
        display: none;
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(4, 7, 14, 0.78);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        z-index: 100002;
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
            height: 640px;
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
                        background: linear-gradient(135deg, rgba(0,212,255,0.2), rgba(0,255,136,0.2));
                        border: 1px solid rgba(0,212,255,0.3);
                        display: flex; align-items: center; justify-content: center;
                        font-size: 16px;
                    ">📊</div>
                    <div>
                        <div style="font-weight: 700; color: #fff; font-size: 15px; letter-spacing: 0.3px;">Statistik & Efisiensi Kerja</div>
                        <div style="font-size: 11px; color: #8b9bb4;">Pantau performa shift, perolehan XP, dan konsumsi energi</div>
                    </div>
                </div>
                <button id="aw-close-analytics" style="
                    background: rgba(255, 255, 255, 0.05); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.12);
                    padding: 6px 12px; border-radius: 8px; cursor: pointer;
                    font-size: 12px; font-weight: 600; transition: all 0.15s;
                ">✕ Tutup</button>
            </div>

            <!-- Scrollable Content Body -->
            <div id="aw-analytics-content" style="
                padding: 18px 20px;
                overflow-y: auto;
                flex: 1;
                overscroll-behavior: contain;
            ">
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    function closeAnalytics() {
      modal.style.display = "none";
    }
    document.getElementById("aw-close-analytics")?.addEventListener("click", closeAnalytics);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeAnalytics();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.style.display === "flex") {
        closeAnalytics();
      }
    });
  }
  function openAnalytics(state, CONFIG, workHistory, ctx) {
    const modal = document.getElementById("aw-analytics-modal");
    if (!modal) return;
    updateAnalyticsView(state, CONFIG, workHistory, ctx);
    modal.style.display = "flex";
  }
  function getExportData(state, CONFIG, workHistory) {
    return {
      version: "5.11.0",
      exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
      exportedAtLocal: (/* @__PURE__ */ new Date()).toLocaleString("id-ID"),
      stats: {
        totalWorked: state.totalWorked,
        totalWorkXP: state.totalWorkXP,
        workToday: state.workToday,
        xpToday: state.xpToday,
        totalEnergySpent: state.totalEnergySpent,
        totalActualEnergySpent: state.totalActualEnergySpent,
        totalEstimatedEnergySpent: state.totalEstimatedEnergySpent,
        lastWorkDate: state.lastWorkDate,
        lastWorkTime: state.lastWorkTime,
        sessionStartTime: state.sessionStartTime,
        currentEnergy: state.currentEnergy,
        maxEnergy: state.maxEnergy,
        playerLevel: state.playerLevel
      },
      workHistory: loadWorkHistory(state, CONFIG),
      config: CONFIG
    };
  }
  function copyExportToClipboard(btnElement, state, CONFIG, workHistory, ctx) {
    try {
      const dataStr = JSON.stringify(getExportData(state, CONFIG, workHistory), null, 2);
      navigator.clipboard.writeText(dataStr).then(() => {
        if (btnElement) {
          const originalText = btnElement.innerHTML;
          btnElement.innerHTML = "✅ Berhasil Disalin!";
          btnElement.style.background = "linear-gradient(135deg, #00ff88, #00aa55)";
          btnElement.style.color = "#000";
          setTimeout(() => {
            btnElement.innerHTML = originalText;
            btnElement.style.background = "linear-gradient(135deg, #0088ff, #0055cc)";
            btnElement.style.color = "#fff";
          }, 2e3);
        }
        ctx?.log?.("📋 Data bot berhasil diexport dan disalin ke clipboard.", "success");
      }).catch(() => {
        prompt("Salin data JSON berikut secara manual:", dataStr);
      });
    } catch (e) {
      console.error("Failed to export data:", e);
      ctx?.log?.("Gagal export data: " + e.message, "error");
    }
  }
  function downloadExportFile(state, CONFIG, workHistory, ctx) {
    try {
      const dataStr = JSON.stringify(getExportData(state, CONFIG, workHistory), null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const dateStr = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      a.href = url;
      a.download = `parlamentum_bot_backup_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      ctx?.log?.("💾 File backup JSON berhasil didownload.", "success");
    } catch (e) {
      console.error("Failed to download backup:", e);
    }
  }
  function importDataFromJSON(jsonString, state, CONFIG, workHistory, ctx) {
    try {
      if (!jsonString || !jsonString.trim()) {
        alert("⚠️ Silakan paste kode JSON backup terlebih dahulu.");
        return false;
      }
      const parsed = JSON.parse(jsonString.trim());
      if (!isPlainObject(parsed)) throw new Error("Format JSON tidak valid");
      const updates = [];
      const stateUpdates = {};
      if (parsed.stats !== void 0) {
        if (!isPlainObject(parsed.stats)) throw new Error("Format statistik tidak valid");
        const numericStats = ["totalWorked", "totalWorkXP", "workToday", "xpToday", "totalEnergySpent", "totalActualEnergySpent", "totalEstimatedEnergySpent"];
        for (const key of numericStats) {
          if (parsed.stats[key] === void 0) continue;
          if (!Number.isSafeInteger(parsed.stats[key]) || parsed.stats[key] < 0) throw new Error(`Nilai ${key} tidak valid`);
          updates.push([key, parsed.stats[key].toString()]);
          stateUpdates[key] = parsed.stats[key];
        }
        if (parsed.stats.lastWorkDate !== void 0) {
          const date = parsed.stats.lastWorkDate;
          if (typeof date !== "string" || new Date(date).toDateString() !== date) throw new Error("Tanggal kerja tidak valid");
          updates.push(["lastWorkDate", date]);
          stateUpdates.lastWorkDate = date;
        }
        if (parsed.stats.lastWorkTime !== void 0) {
          if (typeof parsed.stats.lastWorkTime !== "string" || parsed.stats.lastWorkTime.length > 100) throw new Error("Waktu kerja tidak valid");
          updates.push(["lastWorkTime", parsed.stats.lastWorkTime]);
          stateUpdates.lastWorkTime = parsed.stats.lastWorkTime;
        }
        if (parsed.stats.sessionStartTime !== void 0) {
          if (!Number.isSafeInteger(parsed.stats.sessionStartTime) || parsed.stats.sessionStartTime <= 0) throw new Error("Waktu sesi tidak valid");
          updates.push(["sessionStartTime", parsed.stats.sessionStartTime.toString()]);
          stateUpdates.sessionStartTime = parsed.stats.sessionStartTime;
        }
        const nextStats = { ...state, ...stateUpdates };
        if (nextStats.workToday > nextStats.totalWorked || nextStats.xpToday > nextStats.totalWorkXP) {
          throw new Error("Counter harian tidak boleh melebihi akumulasi total");
        }
      }
      let importedHistory;
      if (parsed.workHistory !== void 0) {
        importedHistory = normalizeWorkHistory(parsed.workHistory);
        if (!importedHistory) throw new Error("Format history kerja tidak valid");
        const importedVersionParts = String(parsed.version ?? "").split(".").map(Number);
        const [importedMajor, importedMinor, importedPatch] = importedVersionParts;
        const isLegacyImport = !Number.isSafeInteger(importedMajor) || !Number.isSafeInteger(importedMinor) || !Number.isSafeInteger(importedPatch) || importedMajor < 5 || importedMajor === 5 && (importedMinor < 9 || importedMinor === 9 && importedPatch < 8);
        if (isLegacyImport) {
          migrateLegacyEnergyHistory(importedHistory);
        }
        pruneOldHistory(importedHistory, CONFIG.historyMaxDays);
        updates.push(["aw_workHistory", JSON.stringify(importedHistory)]);
        updates.push(["aw_energySchemaVersion", "2"]);
      }
      if (parsed.stats !== void 0 && importedHistory) {
        const todayKey = (/* @__PURE__ */ new Date()).toDateString();
        const importedToday = importedHistory[todayKey];
        if (importedToday && (importedToday.shifts !== (stateUpdates.workToday ?? state.workToday) || importedToday.xp !== (stateUpdates.xpToday ?? state.xpToday))) {
          throw new Error("History hari ini tidak cocok dengan counter statistik");
        }
      }
      let importedConfig;
      if (parsed.config !== void 0) {
        importedConfig = normalizeConfig(parsed.config, true);
        if (!importedConfig) throw new Error("Format konfigurasi tidak valid");
        updates.push(["aw_config", JSON.stringify(importedConfig)]);
      }
      if (updates.length === 0) throw new Error("Tidak ada data statistik atau konfigurasi yang valid ditemukan dalam JSON.");
      updates.forEach(([key, value]) => setValue(key, value));
      Object.assign(state, stateUpdates);
      if (importedHistory && workHistory) {
        Object.keys(workHistory).forEach((k) => delete workHistory[k]);
        Object.assign(workHistory, importedHistory);
      }
      ctx?.log?.("✅ Data berhasil di-import dan disinkronkan! Halaman akan di-refresh...", "success");
      alert("✅ Berhasil Import & Sinkronisasi Data!\n\nHalaman akan di-refresh untuk menerapkan data baru.");
      location.reload();
      return true;
    } catch (e) {
      alert("❌ Gagal Import Data: Format JSON tidak valid.\n\nDetail: " + e.message);
      return false;
    }
  }
  function updateAnalyticsView(state, CONFIG, workHistory, ctx) {
    const content = document.getElementById("aw-analytics-content");
    if (!content) return;
    const activeHistory = loadWorkHistory(state, CONFIG);
    if (workHistory) {
      Object.keys(workHistory).forEach((k) => delete workHistory[k]);
      Object.assign(workHistory, activeHistory);
    }
    const avgXPPerWork = state.totalWorked > 0 ? (state.totalWorkXP / state.totalWorked).toFixed(1) : "0.0";
    const currentTodayStr = (/* @__PURE__ */ new Date()).toDateString();
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = /* @__PURE__ */ new Date();
      d.setDate(d.getDate() - i);
      const key = d.toDateString();
      const dateLabel = d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit" });
      const dayName = d.toLocaleDateString("id-ID", { weekday: "short" });
      const dayData = activeHistory[key] || { shifts: 0, xp: 0 };
      last7Days.push({
        key,
        dateLabel,
        dayName,
        shifts: dayData.shifts || 0,
        xp: dayData.xp || 0,
        energySpent: Number.isSafeInteger(dayData.energySpent) ? dayData.energySpent : null,
        estimatedEnergySpent: Number.isSafeInteger(dayData.estimatedEnergySpent) ? dayData.estimatedEnergySpent : 0,
        energyDataShifts: Number.isSafeInteger(dayData.energyDataShifts) ? dayData.energyDataShifts : 0
      });
    }
    const todayData = last7Days[last7Days.length - 1];
    const previousDayData = last7Days[last7Days.length - 2];
    const shiftsComparedToYesterday = todayData.shifts - previousDayData.shifts;
    const xpComparedToYesterday = todayData.xp - previousDayData.xp;
    const todayAverageXPPerWork = state.workToday > 0 ? (state.xpToday / state.workToday).toFixed(1) : "0.0";
    const last7DayTotals = last7Days.reduce((totals, day) => ({
      shifts: totals.shifts + day.shifts,
      xp: totals.xp + day.xp,
      energySpent: totals.energySpent + (day.energySpent || 0),
      estimatedEnergySpent: totals.estimatedEnergySpent + day.estimatedEnergySpent,
      energyDataShifts: totals.energyDataShifts + day.energyDataShifts
    }), { shifts: 0, xp: 0, energySpent: 0, estimatedEnergySpent: 0, energyDataShifts: 0 });
    const averageShiftsPerDay = (last7DayTotals.shifts / last7Days.length).toFixed(1);
    const averageXPPerDay = Math.round(last7DayTotals.xp / last7Days.length);
    const maxShifts = Math.max(1, ...last7Days.map((d) => d.shifts));
    const maxXp = Math.max(1, ...last7Days.map((d) => d.xp));
    const maxEnergySpent = Math.max(1, ...last7Days.map((d) => d.energySpent || 0));
    let graphHTML = `<div class="aw-graph-container">`;
    graphHTML += `<div style="display: flex; justify-content: space-between; align-items: flex-end; height: 140px; gap: 8px; padding: 10px 4px 6px; border-bottom: 1px solid rgba(255,255,255,0.08); margin-bottom: 10px;">`;
    last7Days.forEach((day, index) => {
      const shiftHeight = Math.max(day.shifts > 0 ? 8 : 2, Math.round(day.shifts / maxShifts * 100));
      const xpHeight = Math.max(day.xp > 0 ? 8 : 2, Math.round(day.xp / maxXp * 100));
      const energyHeight = day.energySpent === null || day.energySpent === 0 && day.estimatedEnergySpent > 0 ? 0 : Math.max(day.energySpent > 0 ? 8 : 2, Math.round(day.energySpent / maxEnergySpent * 100));
      const isToday = day.key === currentTodayStr;
      graphHTML += `
            <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; ${isToday ? "background: rgba(0, 255, 136, 0.05); border: 1px solid rgba(0, 255, 136, 0.2); border-radius: 8px; padding: 4px 0;" : ""}"
                 id="graph-day-${index}">
                <div style="width: 100%; display: flex; gap: 3px; align-items: flex-end; height: 95px; justify-content: center;">
                    <div class="aw-graph-bar" data-day-index="${index}" data-type="shift" data-value="${day.shifts}" style="width: 28%; max-width: 12px; background: ${isToday ? "linear-gradient(180deg, #00d4ff, #0066cc)" : "#25354d"};
                         height: ${shiftHeight}%; box-shadow: ${isToday ? "0 0 8px rgba(0, 212, 255, 0.3)" : "none"};"></div>
                    <div class="aw-graph-bar" data-day-index="${index}" data-type="xp" data-value="${day.xp}" style="width: 28%; max-width: 12px; background: ${isToday ? "linear-gradient(180deg, #00ff88, #00aa55)" : "#1e4033"};
                         height: ${xpHeight}%; box-shadow: ${isToday ? "0 0 8px rgba(0, 255, 136, 0.3)" : "none"};"></div>
                    <div class="aw-graph-bar" data-day-index="${index}" data-type="energy" data-value="${day.energySpent === null ? "null" : day.energySpent}" style="width: 28%; max-width: 12px; background: ${isToday ? "linear-gradient(180deg, #ffb547, #d97706)" : "#4a3820"};
                         height: ${energyHeight}%; cursor: ${day.energySpent === null ? "default" : "pointer"}; box-shadow: ${isToday ? "0 0 8px rgba(255, 181, 71, 0.3)" : "none"};"></div>
                </div>
                <div style="font-size: 10px; color: ${isToday ? "#00ff88" : "#cbd5e1"}; font-weight: ${isToday ? "700" : "500"}; margin-top: 4px;">${day.dateLabel}</div>
                <div style="font-size: 9.5px; color: ${isToday ? "#94a3b8" : "#64748b"};">${day.shifts}x</div>
            </div>
        `;
    });
    graphHTML += `</div>`;
    graphHTML += `
        <div id="graph-tooltip" style="
            position: absolute;
            background: rgba(10, 14, 24, 0.96);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 8px;
            padding: 10px 14px;
            font-size: 11.5px;
            color: #fff;
            pointer-events: none;
            display: none;
            z-index: 9999;
            box-shadow: 0 10px 30px rgba(0,0,0,0.8);
            white-space: nowrap;
        "></div>
        <div style="display: flex; flex-wrap: wrap; gap: 16px; justify-content: center; font-size: 11px; margin-top: 6px;">
            <span style="display: flex; align-items: center; gap: 6px; color: #cbd5e1;"><span style="width: 10px; height: 10px; background: linear-gradient(135deg, #00d4ff, #0066cc); border-radius: 3px; display: inline-block;"></span> Shift Kerja</span>
            <span style="display: flex; align-items: center; gap: 6px; color: #cbd5e1;"><span style="width: 10px; height: 10px; background: linear-gradient(135deg, #00ff88, #00aa55); border-radius: 3px; display: inline-block;"></span> Work XP</span>
            <span style="display: flex; align-items: center; gap: 6px; color: #cbd5e1;"><span style="width: 10px; height: 10px; background: linear-gradient(135deg, #ffb547, #d97706); border-radius: 3px; display: inline-block;"></span> Energi Digunakan</span>
        </div>
    </div>`;
    const formatDiff = (diff, unit) => {
      if (diff > 0) return `<span style="color: #00ff88; font-weight: 600;">+${diff} ${unit}</span>`;
      if (diff < 0) return `<span style="color: #ff6b6b; font-weight: 600;">${diff} ${unit}</span>`;
      return `<span style="color: #8b9bb4;">Sama dgn kemarin</span>`;
    };
    content.innerHTML = `
        <!-- Top KPI Grid: 4 Metric Cards -->
        <div class="aw-kpi-grid">
            <div class="aw-kpi-card">
                <div class="aw-kpi-header">
                    <span>Shift Hari Ini</span>
                    <span>🎯</span>
                </div>
                <div class="aw-kpi-value" style="color: #00d4ff;">${state.workToday}x</div>
                <div class="aw-kpi-sub">${formatDiff(shiftsComparedToYesterday, "shift")}</div>
            </div>

            <div class="aw-kpi-card">
                <div class="aw-kpi-header">
                    <span>XP Hari Ini</span>
                    <span>⭐</span>
                </div>
                <div class="aw-kpi-value" style="color: #00ff88;">+${state.xpToday}</div>
                <div class="aw-kpi-sub">${formatDiff(xpComparedToYesterday, "XP")}</div>
            </div>

            <div class="aw-kpi-card">
                <div class="aw-kpi-header">
                    <span>Rata-rata XP</span>
                    <span>⚡</span>
                </div>
                <div class="aw-kpi-value" style="color: #f1f5f9;">${todayAverageXPPerWork}</div>
                <div class="aw-kpi-sub">XP per satu shift</div>
            </div>

            <div class="aw-kpi-card">
                <div class="aw-kpi-header">
                    <span>Total Shift</span>
                    <span>🏆</span>
                </div>
                <div class="aw-kpi-value" style="color: #a855f7;">${state.totalWorked}x</div>
                <div class="aw-kpi-sub">+${state.totalWorkXP} XP total</div>
            </div>
        </div>

        <!-- 7-Day Trend Chart Section -->
        <div class="aw-analytics-section">
            <div class="aw-section-header">
                <div>
                    <div class="aw-section-title">📈 Tren Aktivitas 7 Hari Terakhir</div>
                    <div class="aw-section-subtitle">Visualisasi jumlah shift, XP kerja, dan konsumsi energi</div>
                </div>
                <div style="font-size: 11px; color: #00ff88; font-weight: 600;">Rata-rata ${averageShiftsPerDay} shift/hari</div>
            </div>
            ${graphHTML}
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 8px; font-size: 11.5px; background: rgba(0,0,0,0.25); padding: 10px 14px; border-radius: 8px;">
                <div>
                    <span style="color: #8b9bb4; font-size: 10.5px;">Akumulasi 7 Hari:</span><br>
                    <strong style="color: #00d4ff;">${last7DayTotals.shifts} shift</strong> · <strong style="color: #00ff88;">+${last7DayTotals.xp} XP</strong>
                </div>
                <div>
                    <span style="color: #8b9bb4; font-size: 10.5px;">Rata-rata Harian:</span><br>
                    <strong style="color: #00d4ff;">${averageShiftsPerDay} shift</strong> · <strong style="color: #00ff88;">+${averageXPPerDay} XP</strong>
                </div>
                <div>
                    <span style="color: #8b9bb4; font-size: 10.5px;">Total Energi 7 Hari:</span><br>
                    <strong style="color: #ffb547;">${last7DayTotals.energySpent} ⚡</strong>
                </div>
            </div>
        </div>

        <!-- Lifetime Accumulation Section -->
        <div class="aw-analytics-section">
            <div class="aw-section-header">
                <div>
                    <div class="aw-section-title">🌐 Akumulasi Sepanjang Waktu</div>
                    <div class="aw-section-subtitle">Rekor pencapaian sejak bot pertama kali diaktifkan</div>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 12px;">
                <div style="background: rgba(255,255,255,0.02); padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.04);">
                    <div style="color: #8b9bb4; font-size: 11px; margin-bottom: 2px;">Total Shift Sukses</div>
                    <div style="font-size: 16px; font-weight: 700; color: #00d4ff;">${state.totalWorked} Shift</div>
                    <div style="color: #64748b; font-size: 10.5px; margin-top: 2px;">Rata-rata: ${avgXPPerWork} XP/shift</div>
                </div>
                <div style="background: rgba(255,255,255,0.02); padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.04);">
                    <div style="color: #8b9bb4; font-size: 11px; margin-bottom: 2px;">Total XP Dikumpulkan</div>
                    <div style="font-size: 16px; font-weight: 700; color: #00ff88;">+${state.totalWorkXP} XP</div>
                    <div style="color: #64748b; font-size: 10.5px; margin-top: 2px;">Energi terverifikasi: ${state.totalActualEnergySpent} ⚡</div>
                </div>
            </div>
        </div>

        <!-- Backup & Data Recovery Section -->
        <div class="aw-analytics-section" style="margin-bottom: 0;">
            <div class="aw-section-header" style="margin-bottom: 8px;">
                <div>
                    <div class="aw-section-title">💾 Backup & Pemulihan Data</div>
                    <div class="aw-section-subtitle">Simpan atau pulihkan konfigurasi bot & riwayat shift ke file JSON</div>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                <button id="aw-btn-export-copy" style="
                    background: linear-gradient(135deg, #0088ff, #0055cc); color: #fff; border: none;
                    padding: 9px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 12px;
                    transition: all 0.15s;
                ">📋 Salin JSON</button>
                <button id="aw-btn-export-download" style="
                    background: rgba(0, 255, 136, 0.1); color: #00ff88; border: 1px solid rgba(0, 255, 136, 0.3);
                    padding: 9px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 12px;
                    transition: all 0.15s;
                ">💾 Unduh File Backup</button>
            </div>
            <div style="display: flex; gap: 8px;">
                <button id="aw-btn-toggle-import" style="
                    flex: 1; background: rgba(255, 255, 255, 0.04); border: 1px dashed rgba(255, 255, 255, 0.15);
                    color: #cbd5e1; padding: 7px 10px; border-radius: 6px; cursor: pointer; font-size: 11px;
                    transition: all 0.15s;
                ">📥 Impor / Pulihkan Backup</button>
                <button id="aw-btn-reset-stats" style="
                    background: rgba(255, 107, 107, 0.1); border: 1px solid rgba(255, 107, 107, 0.25);
                    color: #ff8888; padding: 7px 12px; border-radius: 6px; cursor: pointer; font-size: 11px;
                    transition: all 0.15s;
                ">🗑️ Reset Statistik</button>
            </div>
            <div id="aw-import-section" style="display: none; margin-top: 12px; background: rgba(0,0,0,0.3); padding: 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
                <textarea id="aw-import-input" placeholder="Tempel data backup JSON di sini..." style="
                    width: 100%; height: 75px; background: #131724; color: #00ff88;
                    border: 1px solid #28334e; border-radius: 6px; padding: 8px;
                    font-size: 11px; font-family: monospace; box-sizing: border-box; resize: vertical;
                "></textarea>
                <button id="aw-btn-apply-import" style="
                    background: linear-gradient(135deg, #00ff88, #00aa55); color: #050a14;
                    border: none; padding: 9px; border-radius: 6px; cursor: pointer;
                    font-weight: 700; font-size: 12px; width: 100%; margin-top: 8px;
                ">Terapkan Backup</button>
            </div>
        </div>
    `;
    const showFn = function(dayIndex, type, value) {
      const tooltip = document.getElementById("graph-tooltip");
      const dayData = last7Days[dayIndex];
      if (!tooltip || !dayData) return;
      const labelText = type === "shift" ? "Shift Kerja" : type === "xp" ? "Work XP" : "Energi digunakan";
      const valueText = type === "shift" ? `${value}x shift` : type === "xp" ? `+${value} XP` : `${value} ⚡`;
      const color = type === "shift" ? "#00d4ff" : type === "xp" ? "#00ff88" : "#ffb547";
      tooltip.innerHTML = `
            <div style="font-weight: 700; margin-bottom: 4px; color: ${color}; font-size: 12px;">${dayData.dayName}, ${dayData.dateLabel}</div>
            <div style="margin-bottom: 2px;">${labelText}: <span style="color: ${color}; font-weight: 700;">${valueText}</span></div>
            <div style="color: #ffb547; font-size: 10.5px;">Energi aktual: ${dayData.energySpent === null ? "belum tercatat" : `${dayData.energySpent} ⚡`}${dayData.estimatedEnergySpent ? ` (${dayData.estimatedEnergySpent} ⚡ est)` : ""}</div>
            <div style="color: #64748b; font-size: 10px; margin-top: 2px;">${Math.max(0, dayData.shifts - dayData.energyDataShifts)} shift tanpa data energi</div>
        `;
      tooltip.style.display = "block";
    };
    const moveFn = function(event) {
      const tooltip = document.getElementById("graph-tooltip");
      if (!tooltip || tooltip.style.display === "none") return;
      const wrapper = tooltip.parentElement;
      if (!wrapper) return;
      const wrapperRect = wrapper.getBoundingClientRect();
      let left = event.clientX - wrapperRect.left + 12;
      let top = event.clientY - wrapperRect.top - 60;
      const tooltipWidth = tooltip.offsetWidth || 140;
      if (left + tooltipWidth > wrapperRect.width - 4) {
        left = event.clientX - wrapperRect.left - tooltipWidth - 12;
      }
      if (top < 4) top = 4;
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    };
    const hideFn = function() {
      const tooltip = document.getElementById("graph-tooltip");
      if (tooltip) tooltip.style.display = "none";
    };
    content.querySelectorAll(".aw-graph-bar").forEach((bar) => {
      const dayIndex = Number(bar.dataset.dayIndex);
      const type = bar.dataset.type;
      const rawVal = bar.dataset.value;
      const value = rawVal === "null" ? null : Number(rawVal);
      if (type === "energy" && value === null) return;
      bar.addEventListener("mouseenter", () => showFn(dayIndex, type, value));
      bar.addEventListener("mouseleave", hideFn);
      bar.addEventListener("mousemove", moveFn);
    });
    document.getElementById("aw-btn-export-copy")?.addEventListener("click", function() {
      copyExportToClipboard(this, state, CONFIG, workHistory, ctx);
    });
    document.getElementById("aw-btn-export-download")?.addEventListener("click", () => {
      downloadExportFile(state, CONFIG, workHistory, ctx);
    });
    document.getElementById("aw-btn-reset-stats")?.addEventListener("click", () => {
      if (state.workInFlight) {
        alert("Tunggu request kerja yang sedang berjalan selesai sebelum mereset statistik.");
        return;
      }
      if (state.workResultUncertain) {
        alert("Hasil request kerja sebelumnya belum pasti. Periksa statusnya di game dan selesaikan banner timeout sebelum mereset.");
        return;
      }
      if (!confirm("Hapus total shift, XP kerja, energi, dan seluruh history lokal? Pengaturan, token, dan Activity Log tidak dihapus. Tindakan ini tidak dapat dibatalkan.")) return;
      const resetDate = (/* @__PURE__ */ new Date()).toDateString();
      state.totalWorked = 0;
      state.totalWorkXP = 0;
      state.workToday = 0;
      state.xpToday = 0;
      state.totalEnergySpent = 0;
      state.totalActualEnergySpent = 0;
      state.totalEstimatedEnergySpent = 0;
      state.lastWorkDate = resetDate;
      state.lastWorkTime = "Belum pernah";
      state.sessionStartTime = Date.now();
      state.energySyncBase = null;
      state.nextWorkTimestamp = Date.now() + 3e3;
      const newHistory = /* @__PURE__ */ Object.create(null);
      newHistory[resetDate] = {
        shifts: 0,
        xp: 0,
        energySpent: 0,
        estimatedEnergySpent: 0,
        energyDataShifts: 0
      };
      setValue("sessionStartTime", state.sessionStartTime.toString());
      setValue("sessionStartDay", resetDate);
      setValue("aw_workHistory", JSON.stringify(newHistory));
      if (workHistory) {
        Object.keys(workHistory).forEach((k) => delete workHistory[k]);
        Object.assign(workHistory, newHistory);
      }
      saveState(state);
      ctx.updatePanel?.();
      updateAnalyticsView(state, CONFIG, workHistory, ctx);
      ctx.log?.("Statistik kerja dan history lokal berhasil direset.", "success");
      if (state.running && ctx.wakePendingWork) ctx.wakePendingWork();
    });
    const btnToggleImport = document.getElementById("aw-btn-toggle-import");
    const importSection = document.getElementById("aw-import-section");
    if (btnToggleImport && importSection) {
      btnToggleImport.addEventListener("click", () => {
        const isHidden = importSection.style.display === "none";
        importSection.style.display = isHidden ? "block" : "none";
        btnToggleImport.textContent = isHidden ? "▲ Tutup Kolom Import" : "📥 Punya kode backup? Klik untuk Import / Restore Data";
      });
    }
    const btnApplyImport = document.getElementById("aw-btn-apply-import");
    const importInput = document.getElementById("aw-import-input");
    if (btnApplyImport && importInput) {
      btnApplyImport.addEventListener("click", () => {
        importDataFromJSON(importInput.value, state, CONFIG, workHistory, ctx);
      });
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
                        background: linear-gradient(135deg, rgba(0,212,255,0.2), rgba(0,102,255,0.2));
                        border: 1px solid rgba(0,212,255,0.3);
                        display: flex; align-items: center; justify-content: center;
                        font-size: 16px;
                    ">📋</div>
                    <div>
                        <div style="font-weight: 700; color: #fff; font-size: 15px; letter-spacing: 0.3px;">Activity Log</div>
                        <div style="font-size: 11px; color: #8b9bb4;">Riwayat aktivitas & status kerja bot secara real-time</div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button id="aw-copy-all-log" style="
                        background: rgba(255, 255, 255, 0.05); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.12);
                        padding: 6px 12px; border-radius: 8px; cursor: pointer;
                        font-size: 11.5px; font-weight: 600; transition: all 0.15s;
                    ">📋 Salin Log</button>
                    <button id="aw-clear-log" style="
                        background: rgba(255, 255, 255, 0.05); color: #ff6b6b; border: 1px solid rgba(255, 107, 107, 0.25);
                        padding: 6px 12px; border-radius: 8px; cursor: pointer;
                        font-size: 11.5px; font-weight: 600; transition: all 0.15s;
                    ">🗑️ Bersihkan</button>
                    <button id="aw-close-log" style="
                        background: rgba(255, 255, 255, 0.05); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.12);
                        padding: 6px 12px; border-radius: 8px; cursor: pointer;
                        font-size: 12px; font-weight: 600; transition: all 0.15s;
                    ">✕ Tutup</button>
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
                        ✅ Sukses <span class="aw-log-filter-count" id="aw-count-success">0</span>
                    </button>
                    <button type="button" class="aw-log-filter-pill" data-type="warn">
                        ⚠️ Peringatan <span class="aw-log-filter-count" id="aw-count-warn">0</span>
                    </button>
                    <button type="button" class="aw-log-filter-pill" data-type="error">
                        ❌ Error <span class="aw-log-filter-count" id="aw-count-error">0</span>
                    </button>
                    <button type="button" class="aw-log-filter-pill" data-type="info">
                        ℹ️ Info <span class="aw-log-filter-count" id="aw-count-info">0</span>
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
                    <span style="position: absolute; left: 10px; font-size: 12px; color: #64748b; pointer-events: none;">🔍</span>
                    <input id="aw-log-filter-text" type="text" placeholder="Cari log (shift, energi, buff)..." style="
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
                    ">💾 Ekspor .txt</button>
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
          const orig = btn.textContent;
          btn.textContent = "✅ Tersalin!";
          btn.style.color = "#00ff88";
          setTimeout(() => {
            btn.textContent = orig;
            btn.style.color = "#cbd5e1";
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
                <span style="font-size: 34px; margin-bottom: 10px; opacity: 0.7;">📋</span>
                <span style="font-size: 14px; font-weight: 600; color: #94a3b8; margin-bottom: 4px;">Tidak ada riwayat aktivitas</span>
                <span style="font-size: 12px; color: #64748b;">${countAll === 0 ? "Belum ada aktivitas yang dicatat." : "Tidak ada log yang cocok dengan filter atau kata kunci pencarian."}</span>
            </div>
        `;
      return;
    }
    const BADGE_CONFIG = {
      success: { text: "SUKSES", cls: "aw-log-badge-success", icon: "✅" },
      warn: { text: "WARN", cls: "aw-log-badge-warn", icon: "⚠️" },
      error: { text: "ERROR", cls: "aw-log-badge-error", icon: "❌" },
      info: { text: "INFO", cls: "aw-log-badge-info", icon: "ℹ️" }
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
      badge.textContent = `${bConf.icon} ${bConf.text}`;
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
          copyBtn.textContent = "✓";
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
    const used = Number(msg.energyUsed) || 10;
    const xp = Number(msg.xpEarned) || 0;
    if (state.workInFlight) {
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
      patchPageVisualEnergy(state.currentEnergy, state.maxEnergy, true);
      return;
    }
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
    ctx?.setValue?.("workToday", state.workToday);
    ctx?.setValue?.("totalWorked", state.totalWorked);
    ctx?.setValue?.("xpToday", state.xpToday);
    ctx?.setValue?.("totalWorkXP", state.totalWorkXP);
    ctx?.log?.(`⚡ Shift di game terdeteksi (Anti-Desync): +${xp} XP | Sisa: ${state.currentEnergy}⚡`, "success");
    ctx?.updatePanel?.();
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
      openAnalytics: () => openAnalytics(state, CONFIG, workHistory, ctx),
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
      log$1("🌙 Hari berganti! Counter & Sesi di-reset.", "info");
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
    createAnalyticsDashboard();
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
          log$1(`⚡ Energi saat ini ${state.currentEnergy}/${state.maxEnergy}⚡ (butuh minimal 10⚡). Menunggu energi pulih.`, "warn");
          showInPageNotification(`⚡ Energi belum cukup (${state.currentEnergy}/${state.maxEnergy}⚡). Butuh minimal 10⚡ untuk giliran kerja.`, "warn");
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
        const healthBuff = getRegionHealthBonus();
        state.regenRate = healthBuff;
        if (healthBuff > 1) {
          const bonusPct = Math.round((healthBuff - 1) * 100);
          log$1(`🏥 Buff Kota: Kesehatan +${bonusPct}% pemulihan energi pasif (${healthBuff}x)`, "info");
        }
        log$1(`⚡ Energi terbaca: ${energy.current}/${energy.max}`, "info");
        saveLiveStatus(state, CONFIG);
        updatePanel$1();
      } else {
        log$1("⚠️ Elemen energi tidak ditemukan dalam 15 detik. Energi akan terbaca saat panel pertama update.", "warn");
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
            log$1("⚡ Manual work dipicu via Popup toolbar!", "info");
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
              log$1("⚡ Trigger background: Menjalankan shift kerja otomatis...", "info");
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
                  log$1("⚡ Background wake: Energi target tercapai, mengeksekusi shift kerja...", "info");
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
      console.log("[Init] 🔧 Estimasi energi masa lalu diterapkan (migrasi sekali jalan).");
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
        log2("🔄 Token sesi kedaluwarsa. Me-reload tab otomatis untuk memperbarui token via session cookie...", "warn");
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
    log2("🚀 Auto Worker v5.11.0 HARDENED (Network Interceptor) aktif!", "success");
    log2(`⚡ Energy Threshold: ${CONFIG.energyThreshold} (ubah di Settings)`, "info");
    log2(`🗓️ History: simpan ${CONFIG.historyMaxDays} hari terakhir`, "info");
    log2(`🔇 Quiet mode: ${CONFIG.quietModeEnabled ? "ON" : "OFF"}`, "info");
    log2(`⌨️ Shortcuts: ${Object.values(CONFIG.shortcuts).map((s) => s.display).join(", ")}`, "info");
    log2(`⏱️ Script uptime: ${uptime}s`, "info");
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGVudC5qcyIsInNvdXJjZXMiOlsiLi4vc3JjL3N0b3JhZ2UuanMiLCIuLi9zcmMvY29uZmlnLmpzIiwiLi4vc3JjL3N0YXRlLmpzIiwiLi4vc3JjL2hpc3RvcnkuanMiLCIuLi9zcmMvbG9nZ2VyLmpzIiwiLi4vc3JjL3Rva2VuLmpzIiwiLi4vc3JjL2VuZXJneS5qcyIsIi4uL3NyYy9ub3RpZmljYXRpb25zLmpzIiwiLi4vc3JjL2F1dG9sb2dpbi5qcyIsIi4uL3NyYy93b3JrLmpzIiwiLi4vc3JjL3VpL2ljb25zLmpzIiwiLi4vc3JjL3VpL3BhbmVsLmpzIiwiLi4vc3JjL3VpL3NldHRpbmdzLmpzIiwiLi4vc3JjL3VpL2FuYWx5dGljcy5qcyIsIi4uL3NyYy91aS9sb2d2aWV3ZXIuanMiLCIuLi9zcmMvaW50ZXJjZXB0b3ItY2xpZW50LmpzIiwiLi4vc3JjL21haW4uanMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBzdG9yYWdlLmpzIOKAlCBDaHJvbWUgc3RvcmFnZSB3cmFwcGVyIHdpdGggc3luY2hyb25vdXMgY2FjaGVcbiAqXG4gKiBSZXBsYWNlcyBhbGwgR01fZ2V0VmFsdWUgLyBHTV9zZXRWYWx1ZSBjYWxscy5cbiAqIE9uIGluaXQsIGxvYWRzIGFsbCBkYXRhIGludG8gX2NhY2hlIHNvIHRoZSByZXN0IG9mIHRoZSBjb2RlYmFzZVxuICogY2FuIGNhbGwgZ2V0VmFsdWUvc2V0VmFsdWUgc3luY2hyb25vdXNseSAoc2FtZSBBUEkgYXMgR01fKS5cbiAqIFdyaXRlcyBhcmUgYXN5bmMgZmlyZS1hbmQtZm9yZ2V0IHRvIGNocm9tZS5zdG9yYWdlLmxvY2FsLlxuICovXG5cbmNvbnN0IF9jYWNoZSA9IHt9O1xuXG4vKipcbiAqIE11c3QgYmUgYXdhaXRlZCBvbmNlIGF0IHN0YXJ0dXAgYmVmb3JlIGFueXRoaW5nIHJlYWRzIHN0b3JhZ2UuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBpbml0U3RvcmFnZSgpIHtcbiAgICBjb25zdCBkYXRhID0gYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KG51bGwpO1xuICAgIE9iamVjdC5hc3NpZ24oX2NhY2hlLCBkYXRhKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFZhbHVlKGtleSwgZGVmYXVsdFZhbCA9IG51bGwpIHtcbiAgICByZXR1cm4ga2V5IGluIF9jYWNoZSA/IF9jYWNoZVtrZXldIDogZGVmYXVsdFZhbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNldFZhbHVlKGtleSwgdmFsdWUpIHtcbiAgICBfY2FjaGVba2V5XSA9IHZhbHVlO1xuICAgIGlmICghY2hyb21lLnJ1bnRpbWU/LmlkKSByZXR1cm47XG4gICAgdHJ5IHtcbiAgICAgICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgW2tleV06IHZhbHVlIH0pLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICBpZiAoZXJyPy5tZXNzYWdlPy5pbmNsdWRlcygnRXh0ZW5zaW9uIGNvbnRleHQgaW52YWxpZGF0ZWQnKSkgcmV0dXJuO1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignW1N0b3JhZ2VdIHNldFZhbHVlIGZhaWxlZDonLCBrZXksIGVycik7XG4gICAgICAgIH0pO1xuICAgIH0gY2F0Y2ggeyAvKiBjb250ZXh0IGludmFsaWRhdGVkICovIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZVZhbHVlKGtleSkge1xuICAgIGRlbGV0ZSBfY2FjaGVba2V5XTtcbiAgICBpZiAoIWNocm9tZS5ydW50aW1lPy5pZCkgcmV0dXJuO1xuICAgIHRyeSB7XG4gICAgICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLnJlbW92ZShrZXkpLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICBpZiAoZXJyPy5tZXNzYWdlPy5pbmNsdWRlcygnRXh0ZW5zaW9uIGNvbnRleHQgaW52YWxpZGF0ZWQnKSkgcmV0dXJuO1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignW1N0b3JhZ2VdIHJlbW92ZVZhbHVlIGZhaWxlZDonLCBrZXksIGVycik7XG4gICAgICAgIH0pO1xuICAgIH0gY2F0Y2ggeyAvKiBjb250ZXh0IGludmFsaWRhdGVkICovIH1cbn1cblxuLyoqXG4gKiBMaXN0ZW4gZm9yIHN0b3JhZ2UgY2hhbmdlcyBmcm9tIG90aGVyIHRhYnMgb3IgdGhlIGJhY2tncm91bmQgc2VydmljZSB3b3JrZXIuXG4gKiBjYWxsYmFjayhrZXksIG5ld1ZhbHVlKSDigJQgbmV3VmFsdWUgaXMgdW5kZWZpbmVkIGlmIGtleSB3YXMgZGVsZXRlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG9uU3RvcmFnZUNoYW5nZWQoY2FsbGJhY2spIHtcbiAgICBjaHJvbWUuc3RvcmFnZS5vbkNoYW5nZWQuYWRkTGlzdGVuZXIoKGNoYW5nZXMsIGFyZWEpID0+IHtcbiAgICAgICAgaWYgKGFyZWEgIT09ICdsb2NhbCcpIHJldHVybjtcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCB7IG5ld1ZhbHVlIH1dIG9mIE9iamVjdC5lbnRyaWVzKGNoYW5nZXMpKSB7XG4gICAgICAgICAgICBpZiAobmV3VmFsdWUgIT09IHVuZGVmaW5lZCkgX2NhY2hlW2tleV0gPSBuZXdWYWx1ZTtcbiAgICAgICAgICAgIGVsc2UgZGVsZXRlIF9jYWNoZVtrZXldO1xuICAgICAgICAgICAgY2FsbGJhY2soa2V5LCBuZXdWYWx1ZSk7XG4gICAgICAgIH1cbiAgICB9KTtcbn1cbiIsIi8qKlxuICogY29uZmlnLmpzIOKAlCBFeHRlbnNpb24gY29uZmlndXJhdGlvbiB3aXRoIHZhbGlkYXRpb25cbiAqL1xuXG5pbXBvcnQgeyBnZXRWYWx1ZSwgc2V0VmFsdWUgfSBmcm9tICcuL3N0b3JhZ2UuanMnO1xuXG5leHBvcnQgY29uc3QgREVGQVVMVF9DT05GSUcgPSB7XG4gICAgc2VuZE5vdGlmaWNhdGlvbjogdHJ1ZSxcbiAgICB0b2tlblJlZnJlc2hJbnRlcnZhbDogMzYwMDAwMCxcbiAgICB0b2tlbkV4cGlyeVRocmVzaG9sZDogMzAwMDAwLFxuICAgIHBhbmVsRGVmYXVsdFg6IDEwLFxuICAgIHBhbmVsRGVmYXVsdFk6IDEwLFxuICAgIHNvdW5kTm90aWZpY2F0aW9uRW5hYmxlZDogdHJ1ZSxcbiAgICBzb3VuZE5vdGlmaWNhdGlvblZvbHVtZTogMC4zLFxuICAgIGVuZXJneUZ1bGxBbGVydFNvdW5kRW5hYmxlZDogdHJ1ZSxcbiAgICBlbmVyZ3lGdWxsQWxlcnRWb2x1bWU6IDAuMyxcbiAgICBwYW5lbFBpbm5lZDogZmFsc2UsXG4gICAgcGFuZWxGb2xsb3dWaWV3cG9ydDogdHJ1ZSxcbiAgICBwYW5lbFJldHVyblRvT3JpZ2luYWw6IGZhbHNlLFxuICAgIHBhbmVsRGFzaGJvYXJkT25seTogdHJ1ZSxcbiAgICBwYW5lbExlYWRlck9ubHk6IHRydWUsXG4gICAgbWF4TG9nRW50cmllczogMjAwLFxuICAgIHF1aWV0TW9kZUVuYWJsZWQ6IHRydWUsXG4gICAgcXVpZXRNb2RlSW50ZXJ2YWw6IDEyMDAwMCxcbiAgICBlbmVyZ3lUaHJlc2hvbGQ6IDEwLFxuICAgIGVuZXJneUZ1bGxBbGVydEVuYWJsZWQ6IHRydWUsXG4gICAgaGlzdG9yeU1heERheXM6IDMwLFxuICAgIHN0ZWFsdGhKaXR0ZXJFbmFibGVkOiB0cnVlLFxuICAgIHNsZWVwU2NoZWR1bGVFbmFibGVkOiBmYWxzZSxcbiAgICBzbGVlcFN0YXJ0SG91cjogMSxcbiAgICBzbGVlcEVuZEhvdXI6IDYsXG4gICAgYXV0b1JlbG9naW5FbmFibGVkOiBmYWxzZSxcbiAgICBlY29Nb2RlRW5hYmxlZDogdHJ1ZSxcbiAgICBzaG9ydGN1dHM6IHtcbiAgICAgICAgc2hvd0hpZGU6ICAgICB7IGtleXM6IFsnQ29udHJvbCcsICdTaGlmdCcsICdLZXlBJ10sIGRpc3BsYXk6ICdDdHJsK1NoaWZ0K0EnIH0sXG4gICAgICAgIHdvcmtOb3c6ICAgICAgeyBrZXlzOiBbJ0FsdCcsICdTaGlmdCcsICdLZXlXJ10sICAgIGRpc3BsYXk6ICdBbHQrU2hpZnQrVycgfSxcbiAgICAgICAgcGF1c2VSZXN1bWU6ICB7IGtleXM6IFsnQWx0JywgJ1NoaWZ0JywgJ0tleVAnXSwgICAgZGlzcGxheTogJ0FsdCtTaGlmdCtQJyB9LFxuICAgICAgICBvcGVuTG9nOiAgICAgIHsga2V5czogWydDb250cm9sJywgJ1NoaWZ0JywgJ0tleUwnXSwgZGlzcGxheTogJ0N0cmwrU2hpZnQrTCcgfSxcbiAgICAgICAgb3BlblNldHRpbmdzOiB7IGtleXM6IFsnQ29udHJvbCcsICdTaGlmdCcsICdLZXlTJ10sIGRpc3BsYXk6ICdDdHJsK1NoaWZ0K1MnIH1cbiAgICB9XG59O1xuXG5jb25zdCBOVU1FUklDX0JPVU5EUyA9IHtcbiAgICB0b2tlblJlZnJlc2hJbnRlcnZhbDogICAgICBbMTAwMCwgODY0MDAwMDBdLFxuICAgIHRva2VuRXhwaXJ5VGhyZXNob2xkOiAgICAgIFswLCAgICA4NjQwMDAwMF0sXG4gICAgcGFuZWxEZWZhdWx0WDogICAgICAgICAgICAgWzAsICAgIDEwMDAwXSxcbiAgICBwYW5lbERlZmF1bHRZOiAgICAgICAgICAgICBbMCwgICAgMTAwMDBdLFxuICAgIHNvdW5kTm90aWZpY2F0aW9uVm9sdW1lOiAgIFswLCAgICAxXSxcbiAgICBlbmVyZ3lGdWxsQWxlcnRWb2x1bWU6ICAgICBbMCwgICAgMV0sXG4gICAgbWF4TG9nRW50cmllczogICAgICAgICAgICAgWzEsICAgIDEwMDBdLFxuICAgIHF1aWV0TW9kZUludGVydmFsOiAgICAgICAgIFsxMDAwLCA4NjQwMDAwMF0sXG4gICAgZW5lcmd5VGhyZXNob2xkOiAgICAgICAgICAgWzEwLCAgIDEwMF0sXG4gICAgaGlzdG9yeU1heERheXM6ICAgICAgICAgICAgWzEsICAgIDM2NV0sXG4gICAgc2xlZXBTdGFydEhvdXI6ICAgICAgICAgICAgWzAsICAgIDIzXSxcbiAgICBzbGVlcEVuZEhvdXI6ICAgICAgICAgICAgICBbMCwgICAgMjNdXG59O1xuXG5leHBvcnQgZnVuY3Rpb24gaXNQbGFpbk9iamVjdCh2YWx1ZSkge1xuICAgIHJldHVybiB2YWx1ZSAhPT0gbnVsbCAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmICFBcnJheS5pc0FycmF5KHZhbHVlKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZUNvbmZpZyhjYW5kaWRhdGUsIHN0cmljdCA9IGZhbHNlKSB7XG4gICAgaWYgKCFpc1BsYWluT2JqZWN0KGNhbmRpZGF0ZSkpIHtcbiAgICAgICAgcmV0dXJuIHN0cmljdCA/IG51bGwgOiB7IC4uLkRFRkFVTFRfQ09ORklHLCBzaG9ydGN1dHM6IHsgLi4uREVGQVVMVF9DT05GSUcuc2hvcnRjdXRzIH0gfTtcbiAgICB9XG5cbiAgICBjb25zdCBjb25maWcgPSB7IC4uLkRFRkFVTFRfQ09ORklHLCBzaG9ydGN1dHM6IHsgLi4uREVGQVVMVF9DT05GSUcuc2hvcnRjdXRzIH0gfTtcblxuICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGNhbmRpZGF0ZSkpIHtcbiAgICAgICAgaWYgKGtleSA9PT0gJ3Nob3J0Y3V0cycgfHwgdmFsdWUgPT09IHVuZGVmaW5lZCkgY29udGludWU7XG5cbiAgICAgICAgaWYgKHR5cGVvZiBERUZBVUxUX0NPTkZJR1trZXldID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJykgY29uZmlnW2tleV0gPSB2YWx1ZTtcbiAgICAgICAgICAgIGVsc2UgaWYgKHN0cmljdCkgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGJvdW5kcyA9IE5VTUVSSUNfQk9VTkRTW2tleV07XG4gICAgICAgIGlmIChib3VuZHMpIHtcbiAgICAgICAgICAgIGNvbnN0IHZhbGlkID0gdHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNGaW5pdGUodmFsdWUpXG4gICAgICAgICAgICAgICAgJiYgdmFsdWUgPj0gYm91bmRzWzBdICYmIHZhbHVlIDw9IGJvdW5kc1sxXTtcbiAgICAgICAgICAgIGlmICh2YWxpZCkgY29uZmlnW2tleV0gPSB2YWx1ZTtcbiAgICAgICAgICAgIGVsc2UgaWYgKHN0cmljdCkgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoY2FuZGlkYXRlLnNob3J0Y3V0cyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGlmICghaXNQbGFpbk9iamVjdChjYW5kaWRhdGUuc2hvcnRjdXRzKSkge1xuICAgICAgICAgICAgaWYgKHN0cmljdCkgcmV0dXJuIG51bGw7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IFthY3Rpb24sIHNob3J0Y3V0XSBvZiBPYmplY3QuZW50cmllcyhjYW5kaWRhdGUuc2hvcnRjdXRzKSkge1xuICAgICAgICAgICAgICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKERFRkFVTFRfQ09ORklHLnNob3J0Y3V0cywgYWN0aW9uKSkgY29udGludWU7XG4gICAgICAgICAgICAgICAgY29uc3QgdmFsaWQgPSBpc1BsYWluT2JqZWN0KHNob3J0Y3V0KVxuICAgICAgICAgICAgICAgICAgICAmJiBBcnJheS5pc0FycmF5KHNob3J0Y3V0LmtleXMpXG4gICAgICAgICAgICAgICAgICAgICYmIHNob3J0Y3V0LmtleXMubGVuZ3RoID49IDEgJiYgc2hvcnRjdXQua2V5cy5sZW5ndGggPD0gM1xuICAgICAgICAgICAgICAgICAgICAmJiBzaG9ydGN1dC5rZXlzLmV2ZXJ5KGsgPT4gdHlwZW9mIGsgPT09ICdzdHJpbmcnICYmIC9eW0EtWmEtel1bQS1aYS16MC05XSokLy50ZXN0KGspKVxuICAgICAgICAgICAgICAgICAgICAmJiB0eXBlb2Ygc2hvcnRjdXQuZGlzcGxheSA9PT0gJ3N0cmluZycgJiYgL15bQS1aYS16MC05KyBdezEsNjR9JC8udGVzdChzaG9ydGN1dC5kaXNwbGF5KTtcbiAgICAgICAgICAgICAgICBpZiAodmFsaWQpIGNvbmZpZy5zaG9ydGN1dHNbYWN0aW9uXSA9IHsga2V5czogWy4uLnNob3J0Y3V0LmtleXNdLCBkaXNwbGF5OiBzaG9ydGN1dC5kaXNwbGF5IH07XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoc3RyaWN0KSByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBjb25maWc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsb2FkQ29uZmlnKCkge1xuICAgIGNvbnN0IHNhdmVkID0gZ2V0VmFsdWUoJ2F3X2NvbmZpZycsIG51bGwpO1xuICAgIGlmICghc2F2ZWQpIHJldHVybiBub3JtYWxpemVDb25maWcoREVGQVVMVF9DT05GSUcpO1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHBhcnNlZCA9IHR5cGVvZiBzYXZlZCA9PT0gJ3N0cmluZycgPyBKU09OLnBhcnNlKHNhdmVkKSA6IHNhdmVkO1xuICAgICAgICByZXR1cm4gbm9ybWFsaXplQ29uZmlnKHBhcnNlZCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdbQ29uZmlnXSBGYWlsZWQgdG8gcGFyc2UgY29uZmlnOicsIGUpO1xuICAgICAgICByZXR1cm4gbm9ybWFsaXplQ29uZmlnKERFRkFVTFRfQ09ORklHKTtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzYXZlQ29uZmlnKGNvbmZpZykge1xuICAgIHNldFZhbHVlKCdhd19jb25maWcnLCBjb25maWcpO1xufVxuXG4iLCIvKipcbiAqIHN0YXRlLmpzIOKAlCBDZW50cmFsIG11dGFibGUgYXBwbGljYXRpb24gc3RhdGVcbiAqXG4gKiBPbmUgc2luZ2xlIG9iamVjdCwgaW1wb3J0ZWQgYnkgcmVmZXJlbmNlIGV2ZXJ5d2hlcmUuXG4gKiBJbml0aWFsaXplZCBpbiBtYWluLmpzIGFmdGVyIHN0b3JhZ2UgaXMgcmVhZHkuXG4gKi9cblxuaW1wb3J0IHsgZ2V0VmFsdWUsIHNldFZhbHVlIH0gZnJvbSAnLi9zdG9yYWdlLmpzJztcblxuLyoqIEBwYXJhbSB7c3RyaW5nfSBrZXkgQHBhcmFtIHtudW1iZXJ9IGZhbGxiYWNrIEBwYXJhbSB7bnVtYmVyfSBtaW4gQHBhcmFtIHtudW1iZXJ9IG1heCAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldFN0b3JlZEludGVnZXIoa2V5LCBmYWxsYmFjaywgbWluID0gMCwgbWF4ID0gTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpIHtcbiAgICBjb25zdCByYXcgPSBnZXRWYWx1ZShrZXksIGZhbGxiYWNrLnRvU3RyaW5nKCkpO1xuICAgIGNvbnN0IHZhbHVlID0gTnVtYmVyKHJhdyk7XG4gICAgcmV0dXJuIE51bWJlci5pc1NhZmVJbnRlZ2VyKHZhbHVlKSAmJiB2YWx1ZSA+PSBtaW4gJiYgdmFsdWUgPD0gbWF4ID8gdmFsdWUgOiBmYWxsYmFjaztcbn1cblxuLyoqXG4gKiBDcmVhdGVzIHRoZSBpbml0aWFsIHN0YXRlIGZyb20gcGVyc2lzdGVkIHN0b3JhZ2UgdmFsdWVzLlxuICogQ2FsbCBBRlRFUiBpbml0U3RvcmFnZSgpIGFuZCBBRlRFUiBtaWdyYXRpb24gY2hlY2tzIGluIG1haW4uanMuXG4gKiBAcGFyYW0ge29iamVjdH0gQ09ORklHXG4gKiBAcGFyYW0ge251bWJlcn0gc2F2ZWRTdGFydFRpbWVcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gaGFzVW5jZXJ0YWluV29ya1Jlc3VsdFxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlSW5pdGlhbFN0YXRlKENPTkZJRywgc2F2ZWRTdGFydFRpbWUsIGhhc1VuY2VydGFpbldvcmtSZXN1bHQpIHtcbiAgICByZXR1cm4ge1xuICAgICAgICBydW5uaW5nOiAhaGFzVW5jZXJ0YWluV29ya1Jlc3VsdCxcbiAgICAgICAgdG90YWxXb3JrZWQ6ICAgIGdldFN0b3JlZEludGVnZXIoJ3RvdGFsV29ya2VkJywgMCksXG4gICAgICAgIHRvdGFsV29ya1hQOiAgICBnZXRTdG9yZWRJbnRlZ2VyKCd0b3RhbFdvcmtYUCcsIDApLFxuICAgICAgICB3b3JrVG9kYXk6ICAgICAgZ2V0U3RvcmVkSW50ZWdlcignd29ya1RvZGF5JywgMCksXG4gICAgICAgIHhwVG9kYXk6ICAgICAgICBnZXRTdG9yZWRJbnRlZ2VyKCd4cFRvZGF5JywgMCksXG4gICAgICAgIGxhc3RXb3JrRGF0ZTogICBnZXRWYWx1ZSgnbGFzdFdvcmtEYXRlJywgbmV3IERhdGUoKS50b0RhdGVTdHJpbmcoKSksXG4gICAgICAgIGxhc3RXb3JrVGltZTogICBnZXRWYWx1ZSgnbGFzdFdvcmtUaW1lJywgJ0JlbHVtIHBlcm5haCcpLFxuXG4gICAgICAgIGN1cnJlbnRUb2tlbjogICBudWxsLFxuICAgICAgICB0b2tlbkV4cGlyeTogICAgbnVsbCxcbiAgICAgICAgc3RvcmVkVG9rZW5WYWx1ZTogJycsXG4gICAgICAgIHBhdXNlZEZvclRva2VuOiBmYWxzZSxcbiAgICAgICAgdG9rZW5FeHBpcmVkOiAgIGZhbHNlLFxuXG4gICAgICAgIGN1cnJlbnRFbmVyZ3k6ICAwLFxuICAgICAgICBtYXhFbmVyZ3k6ICAgICAgMTAwLFxuICAgICAgICBlbmVyZ3lGdWxsQWxlcnRBY3RpdmU6IGZhbHNlLFxuICAgICAgICBlbmVyZ3lTeW5jQmFzZTogbnVsbCxcblxuICAgICAgICB3b3JrSW5GbGlnaHQ6ICAgZmFsc2UsXG4gICAgICAgIHdvcmtSZXN1bHRVbmNlcnRhaW46IGhhc1VuY2VydGFpbldvcmtSZXN1bHQsXG4gICAgICAgIHVuY2VydGFpblJlY29uY2lsaWF0aW9uOiBoYXNVbmNlcnRhaW5Xb3JrUmVzdWx0ID8gJ3BlbmRpbmcnIDogJ25vbmUnLFxuXG4gICAgICAgIHBsYXllckxldmVsOiAgICAxLFxuICAgICAgICByZWdpb25OYW1lOiAgICAgJycsXG4gICAgICAgIHJlZ2lvbkhlYWx0aEJvbnVzUGVyY2VudDogMCxcblxuICAgICAgICBwYW5lbE1pbmltaXplZDogZ2V0VmFsdWUoJ3BhbmVsTWluaW1pemVkJywgJ2ZhbHNlJykgPT09ICd0cnVlJyxcbiAgICAgICAgcGFuZWxWaXNpYmxlOiAgIGdldFZhbHVlKCdwYW5lbFZpc2libGUnLCAndHJ1ZScpID09PSAndHJ1ZScsXG4gICAgICAgIHVzZXJNYW51YWxseVRvZ2dsZWRQYW5lbDogZmFsc2UsXG4gICAgICAgIHBhbmVsWDogICAgICAgICBnZXRTdG9yZWRJbnRlZ2VyKCdwYW5lbFgnLCBDT05GSUcucGFuZWxEZWZhdWx0WCwgMCwgMTAwMDApLFxuICAgICAgICBwYW5lbFk6ICAgICAgICAgZ2V0U3RvcmVkSW50ZWdlcigncGFuZWxZJywgQ09ORklHLnBhbmVsRGVmYXVsdFksIDAsIDEwMDAwKSxcbiAgICAgICAgb3JpZ2luYWxQYW5lbFg6IGdldFN0b3JlZEludGVnZXIoJ3BhbmVsWCcsIENPTkZJRy5wYW5lbERlZmF1bHRYLCAwLCAxMDAwMCksXG4gICAgICAgIG9yaWdpbmFsUGFuZWxZOiBnZXRTdG9yZWRJbnRlZ2VyKCdwYW5lbFknLCBDT05GSUcucGFuZWxEZWZhdWx0WSwgMCwgMTAwMDApLFxuXG4gICAgICAgIGxvZ3M6ICAgICAgICAgICBbXSxcbiAgICAgICAgc2V0dGluZ3NPcGVuOiAgIGZhbHNlLFxuXG4gICAgICAgIGxhc3RMb3dFbmVyZ3lMb2dUaW1lOiAwLFxuICAgICAgICBzY3JpcHRTdGFydFRpbWU6IERhdGUubm93KCksXG4gICAgICAgIHNlc3Npb25TdGFydFRpbWU6IHNhdmVkU3RhcnRUaW1lLFxuXG4gICAgICAgIG5leHRXb3JrVGltZXN0YW1wOiAwLFxuXG4gICAgICAgIGlzVGFiTG9ja093bmVyOiBmYWxzZSxcbiAgICAgICAgdGFiTG9ja01hbmFnZWQ6IGZhbHNlLFxuICAgICAgICB3YWl0ZWRGb3JUYWJMb2NrOiBmYWxzZSxcblxuICAgICAgICB0b3RhbEVuZXJneVNwZW50OiAgICAgICAgICBnZXRTdG9yZWRJbnRlZ2VyKCd0b3RhbEVuZXJneVNwZW50JywgMCksXG4gICAgICAgIHRvdGFsQWN0dWFsRW5lcmd5U3BlbnQ6ICAgIGdldFN0b3JlZEludGVnZXIoJ3RvdGFsQWN0dWFsRW5lcmd5U3BlbnQnLCAwKSxcbiAgICAgICAgdG90YWxFc3RpbWF0ZWRFbmVyZ3lTcGVudDogZ2V0U3RvcmVkSW50ZWdlcigndG90YWxFc3RpbWF0ZWRFbmVyZ3lTcGVudCcsIDApLFxuICAgIH07XG59XG5cbi8qKlxuICogQmF0Y2gtd3JpdGVzIGFsbCBjb3VudGVyIGZpZWxkcyB0byBzdG9yYWdlLlxuICogQHBhcmFtIHtvYmplY3R9IHN0YXRlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzYXZlU3RhdGUoc3RhdGUpIHtcbiAgICBjb25zdCBlbnRyaWVzID0ge1xuICAgICAgICB0b3RhbFdvcmtlZDogICAgICAgICAgICAgICBzdGF0ZS50b3RhbFdvcmtlZC50b1N0cmluZygpLFxuICAgICAgICB3b3JrVG9kYXk6ICAgICAgICAgICAgICAgICBzdGF0ZS53b3JrVG9kYXkudG9TdHJpbmcoKSxcbiAgICAgICAgdG90YWxXb3JrWFA6ICAgICAgICAgICAgICAgc3RhdGUudG90YWxXb3JrWFAudG9TdHJpbmcoKSxcbiAgICAgICAgeHBUb2RheTogICAgICAgICAgICAgICAgICAgc3RhdGUueHBUb2RheS50b1N0cmluZygpLFxuICAgICAgICB0b3RhbEVuZXJneVNwZW50OiAgICAgICAgICBzdGF0ZS50b3RhbEVuZXJneVNwZW50LnRvU3RyaW5nKCksXG4gICAgICAgIHRvdGFsQWN0dWFsRW5lcmd5U3BlbnQ6ICAgIHN0YXRlLnRvdGFsQWN0dWFsRW5lcmd5U3BlbnQudG9TdHJpbmcoKSxcbiAgICAgICAgdG90YWxFc3RpbWF0ZWRFbmVyZ3lTcGVudDogc3RhdGUudG90YWxFc3RpbWF0ZWRFbmVyZ3lTcGVudC50b1N0cmluZygpLFxuICAgICAgICBsYXN0V29ya1RpbWU6ICAgICAgICAgICAgICBzdGF0ZS5sYXN0V29ya1RpbWUsXG4gICAgICAgIGxhc3RXb3JrRGF0ZTogICAgICAgICAgICAgIHN0YXRlLmxhc3RXb3JrRGF0ZSxcbiAgICB9O1xuICAgIGZvciAoY29uc3QgW2ssIHZdIG9mIE9iamVjdC5lbnRyaWVzKGVudHJpZXMpKSBzZXRWYWx1ZShrLCB2KTtcbn1cblxuLyoqXG4gKiBSZWxvYWRzIGNvdW50ZXIgZmllbGRzIGZyb20gc3RvcmFnZSAodXNlZCBieSBzdGFuZGJ5IHRhYnMpLlxuICogQHBhcmFtIHtvYmplY3R9IHN0YXRlXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBsb2FkV29ya0hpc3RvcnlcbiAqL1xubGV0IF9sYXN0TGl2ZVN0YXR1c0pzb24gPSAnJztcbmxldCBfbGFzdExpdmVTdGF0dXNBdCA9IDA7XG5cbi8qKlxuICogR2VuZXJhdGVzIGxpdmUgc3RhdHVzIHN1bW1hcnkgb2JqZWN0IHJlcHJlc2VudGluZyBjdXJyZW50IGV4dGVuc2lvbiBzdGF0ZS5cbiAqIEBwYXJhbSB7b2JqZWN0fSBzdGF0ZVxuICogQHBhcmFtIHtvYmplY3R8bnVsbH0gQ09ORklHXG4gKiBAcmV0dXJucyB7b2JqZWN0fVxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0TGl2ZVN0YXR1c1N1bW1hcnkoc3RhdGUsIENPTkZJRyA9IG51bGwpIHtcbiAgICBjb25zdCBsYXN0TG9nID0gc3RhdGUubGFzdExvZ01lc3NhZ2UgfHwgKHN0YXRlLmxvZ3MgJiYgc3RhdGUubG9ncy5sZW5ndGggPiAwID8gc3RhdGUubG9nc1swXS5tZXNzYWdlIDogJycpO1xuICAgIGNvbnN0IGlzRXhwaXJlZCA9IEJvb2xlYW4oXG4gICAgICAgIHN0YXRlLnRva2VuRXhwaXJlZCB8fFxuICAgICAgICBzdGF0ZS5wYXVzZWRGb3JUb2tlbiB8fFxuICAgICAgICAhc3RhdGUuY3VycmVudFRva2VuIHx8XG4gICAgICAgIChzdGF0ZS50b2tlbkV4cGlyeSAmJiBOdW1iZXIoc3RhdGUudG9rZW5FeHBpcnkpIDw9IERhdGUubm93KCkpXG4gICAgKTtcblxuICAgIGNvbnN0IHRocmVzaG9sZCA9IENPTkZJRz8uZW5lcmd5VGhyZXNob2xkID8/IDEwO1xuICAgIGNvbnN0IGN1ckVuZXJneSA9IHN0YXRlLmN1cnJlbnRFbmVyZ3kgPz8gMDtcbiAgICBsZXQgbmV4dFRpbWVzdGFtcCA9IHN0YXRlLm5leHRXb3JrVGltZXN0YW1wID8/IDA7XG5cbiAgICAvLyBPbmx5IGluaXRpYWxpemUgbmV4dFdvcmtUaW1lc3RhbXAgaWYgaXQgd2FzIG5ldmVyIHNldCAoMClcbiAgICBpZiAoIW5leHRUaW1lc3RhbXAgJiYgY3VyRW5lcmd5IDwgdGhyZXNob2xkKSB7XG4gICAgICAgIGNvbnN0IHJhdGUgPSBzdGF0ZS5yZWdlblJhdGUgfHwgMS4wO1xuICAgICAgICBjb25zdCBuZWVkZWRNaW5zID0gTWF0aC5tYXgoMSwgKHRocmVzaG9sZCAtIGN1ckVuZXJneSkgLyByYXRlKTtcbiAgICAgICAgbmV4dFRpbWVzdGFtcCA9IERhdGUubm93KCkgKyBNYXRoLnJvdW5kKG5lZWRlZE1pbnMgKiA2MDAwMCk7XG4gICAgICAgIHN0YXRlLm5leHRXb3JrVGltZXN0YW1wID0gbmV4dFRpbWVzdGFtcDtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBydW5uaW5nOiBCb29sZWFuKHN0YXRlLnJ1bm5pbmcpLFxuICAgICAgICBjdXJyZW50RW5lcmd5OiBjdXJFbmVyZ3ksXG4gICAgICAgIG1heEVuZXJneTogc3RhdGUubWF4RW5lcmd5ID8/IDEwMCxcbiAgICAgICAgbmV4dFdvcmtUaW1lc3RhbXA6IG5leHRUaW1lc3RhbXAsXG4gICAgICAgIHdvcmtUb2RheTogc3RhdGUud29ya1RvZGF5ID8/IDAsXG4gICAgICAgIHhwVG9kYXk6IHN0YXRlLnhwVG9kYXkgPz8gMCxcbiAgICAgICAgdG90YWxXb3JrZWQ6IHN0YXRlLnRvdGFsV29ya2VkID8/IDAsXG4gICAgICAgIHRvdGFsV29ya1hQOiBzdGF0ZS50b3RhbFdvcmtYUCA/PyAwLFxuICAgICAgICBoYXNUb2tlbjogQm9vbGVhbihzdGF0ZS5jdXJyZW50VG9rZW4pLFxuICAgICAgICB0b2tlbkV4cGlyeTogc3RhdGUudG9rZW5FeHBpcnkgPyBuZXcgRGF0ZShzdGF0ZS50b2tlbkV4cGlyeSkuZ2V0VGltZSgpIDogbnVsbCxcbiAgICAgICAgdG9rZW5FeHBpcmVkOiBpc0V4cGlyZWQsXG4gICAgICAgIHBhdXNlZEZvclRva2VuOiBCb29sZWFuKHN0YXRlLnBhdXNlZEZvclRva2VuKSxcbiAgICAgICAgbGFzdFdvcmtUaW1lOiBzdGF0ZS5sYXN0V29ya1RpbWUgfHwgJ0JlbHVtIHBlcm5haCcsXG4gICAgICAgIGVuZXJneVRocmVzaG9sZDogdGhyZXNob2xkLFxuICAgICAgICBwbGF5ZXJMZXZlbDogc3RhdGUucGxheWVyTGV2ZWwgfHwgMSxcbiAgICAgICAgcmVnaW9uTmFtZTogc3RhdGUucmVnaW9uTmFtZSB8fCAnJyxcbiAgICAgICAgcmVnaW9uSGVhbHRoQm9udXNQZXJjZW50OiBzdGF0ZS5yZWdpb25IZWFsdGhCb251c1BlcmNlbnQgfHwgMCxcbiAgICAgICAgcmVnZW5SYXRlOiBzdGF0ZS5yZWdlblJhdGUgfHwgMS4wLFxuICAgICAgICBsYXN0TG9nTWVzc2FnZTogbGFzdExvZyxcbiAgICAgICAgaXNUYWJMb2NrT3duZXI6IEJvb2xlYW4oc3RhdGUuaXNUYWJMb2NrT3duZXIpLFxuICAgICAgICB1cGRhdGVkQXQ6IERhdGUubm93KClcbiAgICB9O1xufVxuXG4vKipcbiAqIFNhdmVzIGxpdmUgc3RhdHVzIHN1bW1hcnkgZm9yIHBvcHVwIGFuZCBiYWNrZ3JvdW5kIGJhZGdlLlxuICogQWx3YXlzIHJldHVybnMgdGhlIGZyZXNoIHN1bW1hcnkgb2JqZWN0LlxuICogQHBhcmFtIHtvYmplY3R9IHN0YXRlXG4gKiBAcGFyYW0ge29iamVjdHxudWxsfSBDT05GSUdcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW2ZvcmNlPWZhbHNlXVxuICovXG5leHBvcnQgZnVuY3Rpb24gc2F2ZUxpdmVTdGF0dXMoc3RhdGUsIENPTkZJRyA9IG51bGwsIGZvcmNlID0gZmFsc2UpIHtcbiAgICBjb25zdCBzdW1tYXJ5ID0gZ2V0TGl2ZVN0YXR1c1N1bW1hcnkoc3RhdGUsIENPTkZJRyk7XG5cbiAgICAvLyBNdWx0aS10YWIgcHJvdGVjdGlvbjogc3RhbmRieSB0YWJzIG11c3QgTk9UIG92ZXJ3cml0ZSBsZWFkZXIncyBzdG9yYWdlIHVubGVzcyBhY3RpdmUgaW4gZm9yZWdyb3VuZCBvciBmb3JjZWRcbiAgICBpZiAoIWZvcmNlICYmIHN0YXRlLnRhYkxvY2tNYW5hZ2VkICYmICFzdGF0ZS5pc1RhYkxvY2tPd25lciAmJiBkb2N1bWVudC5oaWRkZW4pIHtcbiAgICAgICAgcmV0dXJuIHN1bW1hcnk7XG4gICAgfVxuXG4gICAgY29uc3QgbmV4dFdvcmtCdWNrZXQgPSBNYXRoLnJvdW5kKChzdW1tYXJ5Lm5leHRXb3JrVGltZXN0YW1wIHx8IDApIC8gMzAwMCk7XG4gICAgY29uc3Qga2V5RmllbGRzID0gYCR7c3VtbWFyeS5ydW5uaW5nfXwke3N1bW1hcnkuY3VycmVudEVuZXJneX18JHtzdW1tYXJ5Lm1heEVuZXJneX18JHtzdW1tYXJ5LndvcmtUb2RheX18JHtzdW1tYXJ5Lmhhc1Rva2VufXwke3N1bW1hcnkudG9rZW5FeHBpcmVkfXwke3N1bW1hcnkuZW5lcmd5VGhyZXNob2xkfXwke25leHRXb3JrQnVja2V0fXwke3N1bW1hcnkubGFzdExvZ01lc3NhZ2V9YDtcbiAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICAgIGlmICghZm9yY2UgJiYga2V5RmllbGRzID09PSBfbGFzdExpdmVTdGF0dXNKc29uICYmIChub3cgLSBfbGFzdExpdmVTdGF0dXNBdCA8IDMwMDApKSB7XG4gICAgICAgIHJldHVybiBzdW1tYXJ5O1xuICAgIH1cblxuICAgIF9sYXN0TGl2ZVN0YXR1c0pzb24gPSBrZXlGaWVsZHM7XG4gICAgX2xhc3RMaXZlU3RhdHVzQXQgPSBub3c7XG4gICAgc2V0VmFsdWUoJ2F3X2xpdmVfc3RhdHVzJywgc3VtbWFyeSk7XG4gICAgcmV0dXJuIHN1bW1hcnk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWxvYWRTdGF0ZUZyb21TdG9yYWdlKHN0YXRlLCBsb2FkV29ya0hpc3RvcnkpIHtcbiAgICBzdGF0ZS50b3RhbFdvcmtlZCA9ICAgIGdldFN0b3JlZEludGVnZXIoJ3RvdGFsV29ya2VkJywgMCk7XG4gICAgc3RhdGUudG90YWxXb3JrWFAgPSAgICBnZXRTdG9yZWRJbnRlZ2VyKCd0b3RhbFdvcmtYUCcsIDApO1xuICAgIHN0YXRlLndvcmtUb2RheSA9ICAgICAgZ2V0U3RvcmVkSW50ZWdlcignd29ya1RvZGF5JywgMCk7XG4gICAgc3RhdGUueHBUb2RheSA9ICAgICAgICBnZXRTdG9yZWRJbnRlZ2VyKCd4cFRvZGF5JywgMCk7XG4gICAgc3RhdGUudG90YWxFbmVyZ3lTcGVudCA9ICAgICAgICAgIGdldFN0b3JlZEludGVnZXIoJ3RvdGFsRW5lcmd5U3BlbnQnLCAwKTtcbiAgICBzdGF0ZS50b3RhbEFjdHVhbEVuZXJneVNwZW50ID0gICAgZ2V0U3RvcmVkSW50ZWdlcigndG90YWxBY3R1YWxFbmVyZ3lTcGVudCcsIDApO1xuICAgIHN0YXRlLnRvdGFsRXN0aW1hdGVkRW5lcmd5U3BlbnQgPSBnZXRTdG9yZWRJbnRlZ2VyKCd0b3RhbEVzdGltYXRlZEVuZXJneVNwZW50JywgMCk7XG4gICAgc3RhdGUubGFzdFdvcmtEYXRlID0gZ2V0VmFsdWUoJ2xhc3RXb3JrRGF0ZScsIG5ldyBEYXRlKCkudG9EYXRlU3RyaW5nKCkpO1xuICAgIHN0YXRlLmxhc3RXb3JrVGltZSA9IGdldFZhbHVlKCdsYXN0V29ya1RpbWUnLCAnQmVsdW0gcGVybmFoJyk7XG4gICAgbG9hZFdvcmtIaXN0b3J5KCk7XG59XG4iLCIvKipcbiAqIGhpc3RvcnkuanMg4oCUIERhaWx5IHdvcmsgaGlzdG9yeSBzdG9yYWdlIGFuZCBtYW5hZ2VtZW50XG4gKi9cblxuaW1wb3J0IHsgZ2V0VmFsdWUsIHNldFZhbHVlIH0gZnJvbSAnLi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IGlzUGxhaW5PYmplY3QgfSBmcm9tICcuL2NvbmZpZy5qcyc7XG5pbXBvcnQgeyBnZXRTdG9yZWRJbnRlZ2VyIH0gZnJvbSAnLi9zdGF0ZS5qcyc7XG5cbi8qKiBAcGFyYW0ge29iamVjdH0gaGlzdG9yeSBAcGFyYW0ge251bWJlcn0gbWF4RGF5cyAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBydW5lT2xkSGlzdG9yeShoaXN0b3J5LCBtYXhEYXlzID0gMzApIHtcbiAgICBjb25zdCBjdXRvZmYgPSBuZXcgRGF0ZSgpO1xuICAgIGN1dG9mZi5zZXREYXRlKGN1dG9mZi5nZXREYXRlKCkgLSAobWF4RGF5cyB8fCAzMCkpO1xuICAgIGxldCBwcnVuZWQgPSBmYWxzZTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhoaXN0b3J5KSkge1xuICAgICAgICBpZiAobmV3IERhdGUoa2V5KSA8IGN1dG9mZikge1xuICAgICAgICAgICAgZGVsZXRlIGhpc3Rvcnlba2V5XTtcbiAgICAgICAgICAgIHBydW5lZCA9IHRydWU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHBydW5lZDtcbn1cblxuLyoqIEBwYXJhbSB7dW5rbm93bn0gY2FuZGlkYXRlIEByZXR1cm5zIHtvYmplY3R8bnVsbH0gKi9cbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVXb3JrSGlzdG9yeShjYW5kaWRhdGUpIHtcbiAgICBpZiAoIWlzUGxhaW5PYmplY3QoY2FuZGlkYXRlKSkgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zdCBub3JtYWxpemVkID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgICBmb3IgKGNvbnN0IFtrZXksIGVudHJ5XSBvZiBPYmplY3QuZW50cmllcyhjYW5kaWRhdGUpKSB7XG4gICAgICAgIGNvbnN0IGRhdGUgPSBuZXcgRGF0ZShrZXkpO1xuICAgICAgICBpZiAoXG4gICAgICAgICAgICBOdW1iZXIuaXNOYU4oZGF0ZS5nZXRUaW1lKCkpIHx8IGRhdGUudG9EYXRlU3RyaW5nKCkgIT09IGtleSB8fFxuICAgICAgICAgICAgIWlzUGxhaW5PYmplY3QoZW50cnkpIHx8XG4gICAgICAgICAgICAhTnVtYmVyLmlzU2FmZUludGVnZXIoZW50cnkuc2hpZnRzKSB8fCBlbnRyeS5zaGlmdHMgPCAwIHx8XG4gICAgICAgICAgICAhTnVtYmVyLmlzU2FmZUludGVnZXIoZW50cnkueHApICAgICB8fCBlbnRyeS54cCA8IDBcbiAgICAgICAgKSByZXR1cm4gbnVsbDtcblxuICAgICAgICBjb25zdCBoYXNFbmVyZ3lEYXRhID0gWydlbmVyZ3lTcGVudCcsICdlc3RpbWF0ZWRFbmVyZ3lTcGVudCcsICdlbmVyZ3lEYXRhU2hpZnRzJ11cbiAgICAgICAgICAgIC5zb21lKGYgPT4gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGVudHJ5LCBmKSk7XG5cbiAgICAgICAgaWYgKGhhc0VuZXJneURhdGEgJiYgKFxuICAgICAgICAgICAgIU51bWJlci5pc1NhZmVJbnRlZ2VyKGVudHJ5LmVuZXJneVNwZW50KSAgICAgICAgICB8fCBlbnRyeS5lbmVyZ3lTcGVudCA8IDAgfHxcbiAgICAgICAgICAgICFOdW1iZXIuaXNTYWZlSW50ZWdlcihlbnRyeS5lc3RpbWF0ZWRFbmVyZ3lTcGVudCkgfHwgZW50cnkuZXN0aW1hdGVkRW5lcmd5U3BlbnQgPCAwIHx8XG4gICAgICAgICAgICAhTnVtYmVyLmlzU2FmZUludGVnZXIoZW50cnkuZW5lcmd5RGF0YVNoaWZ0cykgICAgIHx8IGVudHJ5LmVuZXJneURhdGFTaGlmdHMgPCAwIHx8XG4gICAgICAgICAgICBlbnRyeS5lbmVyZ3lEYXRhU2hpZnRzID4gZW50cnkuc2hpZnRzXG4gICAgICAgICkpIHJldHVybiBudWxsO1xuXG4gICAgICAgIG5vcm1hbGl6ZWRba2V5XSA9IHsgc2hpZnRzOiBlbnRyeS5zaGlmdHMsIHhwOiBlbnRyeS54cCB9O1xuICAgICAgICBpZiAoaGFzRW5lcmd5RGF0YSkge1xuICAgICAgICAgICAgbm9ybWFsaXplZFtrZXldLmVuZXJneVNwZW50ICAgICAgICAgID0gZW50cnkuZW5lcmd5U3BlbnQ7XG4gICAgICAgICAgICBub3JtYWxpemVkW2tleV0uZXN0aW1hdGVkRW5lcmd5U3BlbnQgPSBlbnRyeS5lc3RpbWF0ZWRFbmVyZ3lTcGVudDtcbiAgICAgICAgICAgIG5vcm1hbGl6ZWRba2V5XS5lbmVyZ3lEYXRhU2hpZnRzICAgICA9IGVudHJ5LmVuZXJneURhdGFTaGlmdHM7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG5vcm1hbGl6ZWQ7XG59XG5cbi8qKiBNaWdyYXRlcyBwcmUtNS45LjggaGlzdG9yeSB3aGVyZSBlbmVyZ3lTcGVudCBpbmNsdWRlZCBlc3RpbWF0ZWQgYW1vdW50cy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtaWdyYXRlTGVnYWN5RW5lcmd5SGlzdG9yeShoaXN0b3J5KSB7XG4gICAgZm9yIChjb25zdCBlbnRyeSBvZiBPYmplY3QudmFsdWVzKGhpc3RvcnkpKSB7XG4gICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZW50cnksICdlbmVyZ3lTcGVudCcpKSB7XG4gICAgICAgICAgICBlbnRyeS5lbmVyZ3lTcGVudCA9IE1hdGgubWF4KDAsIGVudHJ5LmVuZXJneVNwZW50IC0gZW50cnkuZXN0aW1hdGVkRW5lcmd5U3BlbnQpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBoaXN0b3J5O1xufVxuXG4vKipcbiAqIExvYWRzIHdvcmsgaGlzdG9yeSBmcm9tIHN0b3JhZ2UsIHJ1bnMgbWlncmF0aW9uIGlmIG5lZWRlZCwgc3luY3MgdG9kYXkncyBjb3VudGVycy5cbiAqIEBwYXJhbSB7b2JqZWN0fSBzdGF0ZVxuICogQHBhcmFtIHtvYmplY3R9IENPTkZJR1xuICogQHJldHVybnMge29iamVjdH0gaGlzdG9yeVxuICovXG5leHBvcnQgZnVuY3Rpb24gbG9hZFdvcmtIaXN0b3J5KHN0YXRlID0ge30sIENPTkZJRyA9IHt9KSB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmF3ID0gZ2V0VmFsdWUoJ2F3X3dvcmtIaXN0b3J5JywgbnVsbCk7XG4gICAgICAgIGNvbnN0IHBhcnNlZCA9IHJhdyA/ICh0eXBlb2YgcmF3ID09PSAnc3RyaW5nJyA/IEpTT04ucGFyc2UocmF3KSA6IHJhdykgOiB7fTtcbiAgICAgICAgbGV0IGhpc3RvcnkgPSBub3JtYWxpemVXb3JrSGlzdG9yeShwYXJzZWQpIHx8IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cbiAgICAgICAgaWYgKGdldFN0b3JlZEludGVnZXIoJ2F3X2VuZXJneVNjaGVtYVZlcnNpb24nLCAxLCAxLCAyKSA8IDIpIHtcbiAgICAgICAgICAgIG1pZ3JhdGVMZWdhY3lFbmVyZ3lIaXN0b3J5KGhpc3RvcnkpO1xuICAgICAgICAgICAgc2V0VmFsdWUoJ2F3X2VuZXJneVNjaGVtYVZlcnNpb24nLCAnMicpO1xuICAgICAgICAgICAgc2V0VmFsdWUoJ2F3X3dvcmtIaXN0b3J5JywgSlNPTi5zdHJpbmdpZnkoaGlzdG9yeSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3Qgd29ya1RvZGF5ID0gZ2V0U3RvcmVkSW50ZWdlcignd29ya1RvZGF5JywgMCk7XG4gICAgICAgIGNvbnN0IHhwVG9kYXkgICA9IGdldFN0b3JlZEludGVnZXIoJ3hwVG9kYXknLCAwKTtcbiAgICAgICAgY29uc3QgdG9kYXlLZXkgID0gbmV3IERhdGUoKS50b0RhdGVTdHJpbmcoKTtcbiAgICAgICAgY29uc3QgbWF4RGF5cyAgID0gQ09ORklHPy5oaXN0b3J5TWF4RGF5cyB8fCAzMDtcblxuICAgICAgICBpZiAoIWhpc3RvcnlbdG9kYXlLZXldIHx8IGhpc3RvcnlbdG9kYXlLZXldLnNoaWZ0cyAhPT0gd29ya1RvZGF5IHx8IGhpc3RvcnlbdG9kYXlLZXldLnhwICE9PSB4cFRvZGF5KSB7XG4gICAgICAgICAgICBoaXN0b3J5W3RvZGF5S2V5XSA9IHsgc2hpZnRzOiB3b3JrVG9kYXksIHhwOiB4cFRvZGF5IH07XG4gICAgICAgICAgICBwcnVuZU9sZEhpc3RvcnkoaGlzdG9yeSwgbWF4RGF5cyk7XG4gICAgICAgICAgICBzZXRWYWx1ZSgnYXdfd29ya0hpc3RvcnknLCBKU09OLnN0cmluZ2lmeShoaXN0b3J5KSk7XG4gICAgICAgIH0gZWxzZSBpZiAocHJ1bmVPbGRIaXN0b3J5KGhpc3RvcnksIG1heERheXMpKSB7XG4gICAgICAgICAgICBzZXRWYWx1ZSgnYXdfd29ya0hpc3RvcnknLCBKU09OLnN0cmluZ2lmeShoaXN0b3J5KSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gaGlzdG9yeTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ1tIaXN0b3J5XSBGYWlsZWQgdG8gbG9hZDonLCBlKTtcbiAgICAgICAgcmV0dXJuIHt9O1xuICAgIH1cbn1cblxuLyoqIFBlcnNpc3RzIHRoZSBoaXN0b3J5IG9iamVjdCB0byBzdG9yYWdlLiBAcGFyYW0ge29iamVjdH0gaGlzdG9yeSAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNhdmVXb3JrSGlzdG9yeShoaXN0b3J5KSB7XG4gICAgc2V0VmFsdWUoJ2F3X3dvcmtIaXN0b3J5JywgSlNPTi5zdHJpbmdpZnkoaGlzdG9yeSkpO1xufVxuIiwiLyoqXG4gKiBsb2dnZXIuanMg4oCUIEluLW1lbW9yeSBhY3Rpdml0eSBsb2cgd2l0aCB0aHJvdHRsaW5nIGFuZCBxdWlldCBtb2RlXG4gKi9cblxuaW1wb3J0IHsgc2V0VmFsdWUgfSBmcm9tICcuL3N0b3JhZ2UuanMnO1xuXG5jb25zdCByZWNlbnRSZXBlYXRlZExvZ3MgPSBuZXcgTWFwKCk7XG5cbi8qKiBAdHlwZSB7ZnVuY3Rpb258bnVsbH0gQ2FsbGVkIGFmdGVyIGVhY2ggbG9nIGVudHJ5IHRvIHJlZnJlc2ggdGhlIGxvZyB2aWV3ZXIgVUkgKi9cbmV4cG9ydCBsZXQgb25Mb2dVcGRhdGUgPSBudWxsO1xuZXhwb3J0IGZ1bmN0aW9uIHNldExvZ1VwZGF0ZUNhbGxiYWNrKGZuKSB7IG9uTG9nVXBkYXRlID0gZm47IH1cblxuLyoqXG4gKiBAcGFyYW0ge29iamVjdH0gc3RhdGVcbiAqIEBwYXJhbSB7b2JqZWN0fSBDT05GSUdcbiAqIEBwYXJhbSB7c3RyaW5nfSBtZXNzYWdlXG4gKiBAcGFyYW0geydpbmZvJ3wnc3VjY2Vzcyd8J3dhcm4nfCdlcnJvcid9IHR5cGVcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gdG9BY3Rpdml0eUxvZ1xuICovXG5leHBvcnQgZnVuY3Rpb24gbG9nKHN0YXRlLCBDT05GSUcsIG1lc3NhZ2UsIHR5cGUgPSAnaW5mbycsIHRvQWN0aXZpdHlMb2cgPSB0cnVlKSB7XG4gICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKS50b0xvY2FsZVRpbWVTdHJpbmcoJ2lkLUlEJyk7XG4gICAgY29uc3QgcHJlZml4ID0gdHlwZSA9PT0gJ2Vycm9yJyA/ICfinYwnIDogdHlwZSA9PT0gJ3N1Y2Nlc3MnID8gJ+KchScgOiB0eXBlID09PSAnd2FybicgPyAn4pqg77iPJyA6ICfihLnvuI8nO1xuXG4gICAgLy8gUXVpZXQgbW9kZTogc3VwcHJlc3MgcmVwZWF0ZWQgbG93LWVuZXJneSB3YXJuaW5nc1xuICAgIGlmICh0b0FjdGl2aXR5TG9nICYmIHR5cGUgPT09ICd3YXJuJ1xuICAgICAgICAmJiAvKD86RW5lcmdpICg/OmJlbHVtfHRpZGFrKSBjdWt1cHxTZXJ2ZXIgbWVub2xhayBrZXJqYXxTaGlmdCB0aWRhayBtZW5naGFzaWxrYW4gdW5pdCkvaS50ZXN0KG1lc3NhZ2UpXG4gICAgICAgICYmIENPTkZJRy5xdWlldE1vZGVFbmFibGVkXG4gICAgKSB7XG4gICAgICAgIGNvbnN0IG5vd01zID0gRGF0ZS5ub3coKTtcbiAgICAgICAgaWYgKG5vd01zIC0gc3RhdGUubGFzdExvd0VuZXJneUxvZ1RpbWUgPCBDT05GSUcucXVpZXRNb2RlSW50ZXJ2YWwpIHJldHVybjtcbiAgICAgICAgc3RhdGUubGFzdExvd0VuZXJneUxvZ1RpbWUgPSBub3dNcztcbiAgICB9XG5cbiAgICAvLyBUaHJvdHRsZSByZXBlYXRlZCB3YXJuL2Vycm9yIG1lc3NhZ2VzXG4gICAgaWYgKHRvQWN0aXZpdHlMb2cgJiYgKHR5cGUgPT09ICd3YXJuJyB8fCB0eXBlID09PSAnZXJyb3InKSkge1xuICAgICAgICBjb25zdCB0aHJvdHRsZUtleSA9IC9e4o+zIFJldHJ5IGRhbGFtIC8udGVzdChtZXNzYWdlKSA/IGAke3R5cGV9OnJldHJ5YCA6IGAke3R5cGV9OiR7bWVzc2FnZX1gO1xuICAgICAgICBjb25zdCBub3dNcyA9IERhdGUubm93KCk7XG4gICAgICAgIGNvbnN0IHByZXZpb3VzID0gcmVjZW50UmVwZWF0ZWRMb2dzLmdldCh0aHJvdHRsZUtleSk7XG4gICAgICAgIGlmIChwcmV2aW91cyAmJiBub3dNcyAtIHByZXZpb3VzLnRpbWUgPCAzMDAwMCkge1xuICAgICAgICAgICAgcHJldmlvdXMuc3VwcHJlc3NlZCsrO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGlmIChwcmV2aW91cz8uc3VwcHJlc3NlZCA+IDApIHtcbiAgICAgICAgICAgIG1lc3NhZ2UgKz0gYCAoJHtwcmV2aW91cy5zdXBwcmVzc2VkfSBwZXNhbiBzZXJ1cGEgZGlzZW1idW55aWthbilgO1xuICAgICAgICB9XG4gICAgICAgIHJlY2VudFJlcGVhdGVkTG9ncy5zZXQodGhyb3R0bGVLZXksIHsgdGltZTogbm93TXMsIHN1cHByZXNzZWQ6IDAgfSk7XG4gICAgICAgIGlmIChyZWNlbnRSZXBlYXRlZExvZ3Muc2l6ZSA+IDEwMCkge1xuICAgICAgICAgICAgcmVjZW50UmVwZWF0ZWRMb2dzLmRlbGV0ZShyZWNlbnRSZXBlYXRlZExvZ3Mua2V5cygpLm5leHQoKS52YWx1ZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhgWyR7bm93fV0gJHtwcmVmaXh9ICR7bWVzc2FnZX1gKTtcbiAgICBzdGF0ZS5sYXN0TG9nTWVzc2FnZSA9IGBbJHtub3d9XSAke21lc3NhZ2V9YDtcbiAgICBzdGF0ZS5sYXN0TG9nVGltZSA9IG5vdztcbiAgICBpZiAoIXRvQWN0aXZpdHlMb2cpIHJldHVybjtcblxuICAgIHN0YXRlLmxvZ3MudW5zaGlmdCh7IHRpbWU6IG5vdywgdHlwZSwgbWVzc2FnZSB9KTtcbiAgICBpZiAoc3RhdGUubG9ncy5sZW5ndGggPiBDT05GSUcubWF4TG9nRW50cmllcykge1xuICAgICAgICBzdGF0ZS5sb2dzID0gc3RhdGUubG9ncy5zbGljZSgwLCBDT05GSUcubWF4TG9nRW50cmllcyk7XG4gICAgfVxuICAgIF9wZXJzaXN0TG9ncyhzdGF0ZS5sb2dzKTtcbiAgICBvbkxvZ1VwZGF0ZT8uKCk7XG59XG5cbmxldCBfcGVyc2lzdFRpbWVyID0gbnVsbDtcbmZ1bmN0aW9uIF9wZXJzaXN0TG9ncyhsb2dzKSB7XG4gICAgaWYgKHR5cGVvZiBjaHJvbWUgPT09ICd1bmRlZmluZWQnIHx8ICFjaHJvbWUuc3RvcmFnZT8ubG9jYWwpIHJldHVybjtcbiAgICBpZiAoX3BlcnNpc3RUaW1lcikgY2xlYXJUaW1lb3V0KF9wZXJzaXN0VGltZXIpO1xuICAgIF9wZXJzaXN0VGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgX3BlcnNpc3RUaW1lciA9IG51bGw7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB0cmltbWVkID0gbG9ncy5zbGljZSgwLCA4MCk7XG4gICAgICAgICAgICBzZXRWYWx1ZSgnYXdfcmVjZW50X2xvZ3MnLCB0cmltbWVkKTtcbiAgICAgICAgfSBjYXRjaCB7IC8qIGNvbnRleHQgaW52YWxpZGF0ZWQgKi8gfVxuICAgIH0sIDMwMCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjbGVhclN0b3JlZExvZ3MoKSB7XG4gICAgaWYgKF9wZXJzaXN0VGltZXIpIHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KF9wZXJzaXN0VGltZXIpO1xuICAgICAgICBfcGVyc2lzdFRpbWVyID0gbnVsbDtcbiAgICB9XG4gICAgcmVjZW50UmVwZWF0ZWRMb2dzLmNsZWFyKCk7XG4gICAgc2V0VmFsdWUoJ2F3X3JlY2VudF9sb2dzJywgW10pO1xuICAgIGlmICh0eXBlb2YgY2hyb21lICE9PSAndW5kZWZpbmVkJyAmJiBjaHJvbWUuc3RvcmFnZT8ubG9jYWwpIHtcbiAgICAgICAgdHJ5IHsgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgYXdfcmVjZW50X2xvZ3M6IFtdIH0pLmNhdGNoKCgpID0+IHt9KTsgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG4gICAgfVxufVxuIiwiLyoqXG4gKiB0b2tlbi5qcyDigJQgSldUIHBhcnNpbmcsIGRldGVjdGlvbiwgYW5kIHN0b3JhZ2Ugd2F0Y2hpbmdcbiAqL1xuXG5pbXBvcnQgeyBzZXRWYWx1ZSB9IGZyb20gJy4vc3RvcmFnZS5qcyc7XG5cbi8qKiBAcGFyYW0ge3N0cmluZ30gcmF3VG9rZW4gQHJldHVybnMge3sgcGF5bG9hZCwgY2xlYW5Ub2tlbiwgZXhwaXJ5LCBpc0V4cGlyZWQgfXxudWxsfSAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlSnd0KHJhd1Rva2VuKSB7XG4gICAgaWYgKCFyYXdUb2tlbiB8fCB0eXBlb2YgcmF3VG9rZW4gIT09ICdzdHJpbmcnKSByZXR1cm4gbnVsbDtcbiAgICB0cnkge1xuICAgICAgICBsZXQgY2xlYW4gPSByYXdUb2tlbi50cmltKCk7XG5cbiAgICAgICAgLy8gSGFuZGxlIHF1b3RlZCBzdHJpbmdzXG4gICAgICAgIGlmICgoY2xlYW4uc3RhcnRzV2l0aCgnXCInKSAmJiBjbGVhbi5lbmRzV2l0aCgnXCInKSkgfHwgKGNsZWFuLnN0YXJ0c1dpdGgoXCInXCIpICYmIGNsZWFuLmVuZHNXaXRoKFwiJ1wiKSkpIHtcbiAgICAgICAgICAgIHRyeSB7IGNsZWFuID0gSlNPTi5wYXJzZShjbGVhbik7IH0gY2F0Y2ggeyBjbGVhbiA9IGNsZWFuLnNsaWNlKDEsIC0xKS50cmltKCk7IH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFN0cmlwIEJlYXJlciBwcmVmaXhcbiAgICAgICAgY2xlYW4gPSBjbGVhbi5yZXBsYWNlKC9eQmVhcmVyXFxzKy9pLCAnJykudHJpbSgpO1xuXG4gICAgICAgIC8vIEhhbmRsZSBKU09OIG9iamVjdCBjb250YWluaW5nIHRva2VuXG4gICAgICAgIGlmIChjbGVhbi5zdGFydHNXaXRoKCd7JykpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgb2JqID0gSlNPTi5wYXJzZShjbGVhbik7XG4gICAgICAgICAgICAgICAgY2xlYW4gPSBvYmoudG9rZW4gfHwgb2JqLmFjY2Vzc190b2tlbiB8fCBvYmouand0IHx8IG9iai52YWx1ZSB8fCBjbGVhbjtcbiAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcGFydHMgPSBjbGVhbi5zcGxpdCgnLicpO1xuICAgICAgICBpZiAocGFydHMubGVuZ3RoICE9PSAzKSByZXR1cm4gbnVsbDtcblxuICAgICAgICAvLyBCYXNlNjRVUkwg4oaSIEJhc2U2NCB3aXRoIHBhZGRpbmdcbiAgICAgICAgbGV0IGJhc2U2NCA9IHBhcnRzWzFdLnJlcGxhY2UoLy0vZywgJysnKS5yZXBsYWNlKC9fL2csICcvJyk7XG4gICAgICAgIHdoaWxlIChiYXNlNjQubGVuZ3RoICUgNCAhPT0gMCkgYmFzZTY0ICs9ICc9JztcblxuICAgICAgICBjb25zdCBieXRlcyA9IFVpbnQ4QXJyYXkuZnJvbShhdG9iKGJhc2U2NCksIGMgPT4gYy5jaGFyQ29kZUF0KDApKTtcbiAgICAgICAgY29uc3QgcGF5bG9hZCA9IEpTT04ucGFyc2UobmV3IFRleHREZWNvZGVyKCd1dGYtOCcpLmRlY29kZShieXRlcykpO1xuICAgICAgICBjb25zdCBleHBpcnkgPSBwYXlsb2FkLmV4cCA/IG5ldyBEYXRlKHBheWxvYWQuZXhwICogMTAwMCkgOiBudWxsO1xuXG4gICAgICAgIHJldHVybiB7IHBheWxvYWQsIGNsZWFuVG9rZW46IGNsZWFuLCBleHBpcnksIGlzRXhwaXJlZDogZXhwaXJ5ID8gZXhwaXJ5IDwgbmV3IERhdGUoKSA6IGZhbHNlIH07XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ1tKV1RdIEZhaWxlZCB0byBwYXJzZTonLCBlcnIpO1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG59XG5cbi8qKlxuICogQXR0ZW1wdHMgdG8gYWNjZXB0IGEgbmV3IHJhdyB0b2tlbiBjYW5kaWRhdGUgaW50byBzdGF0ZS5cbiAqIEByZXR1cm5zIHtib29sZWFufSB0cnVlIGlmIHRva2VuIHdhcyB2YWxpZCBhbmQgYWNjZXB0ZWRcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGhhbmRsZU5ld1Rva2VuKHN0YXRlLCBsb2dGbiwgd2FrZVBlbmRpbmdXb3JrLCByYXdDYW5kaWRhdGUsIHNvdXJjZSA9ICdzdG9yYWdlJywgb25SZXN1bWUgPSBudWxsLCBvblVwZGF0ZSA9IG51bGwpIHtcbiAgICBpZiAoIXJhd0NhbmRpZGF0ZSkgcmV0dXJuIGZhbHNlO1xuXG4gICAgY29uc3QgcGFyc2VkID0gcGFyc2VKd3QocmF3Q2FuZGlkYXRlKTtcbiAgICBpZiAoIXBhcnNlZCkgcmV0dXJuIGZhbHNlO1xuXG4gICAgY29uc3QgeyBjbGVhblRva2VuLCBleHBpcnksIGlzRXhwaXJlZCB9ID0gcGFyc2VkO1xuICAgIGlmIChpc0V4cGlyZWQpIHtcbiAgICAgICAgY29uc29sZS53YXJuKGBbVG9rZW5dIFRva2VuIGRhcmkgJHtzb3VyY2V9IHN1ZGFoIEVYUElSRUQgcGFkYSAke2V4cGlyeT8udG9Mb2NhbGVTdHJpbmcoJ2lkLUlEJyl9YCk7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBpZiAoY2xlYW5Ub2tlbiA9PT0gc3RhdGUuc3RvcmVkVG9rZW5WYWx1ZSAmJiBzdGF0ZS5jdXJyZW50VG9rZW4pIHJldHVybiB0cnVlOyAvLyBzdWRhaCBzaW5rcm9uXG5cbiAgICBzdGF0ZS5zdG9yZWRUb2tlblZhbHVlID0gY2xlYW5Ub2tlbjtcbiAgICBzdGF0ZS5jdXJyZW50VG9rZW4gICAgID0gYEJlYXJlciAke2NsZWFuVG9rZW59YDtcbiAgICBzdGF0ZS50b2tlbkV4cGlyeSAgICAgID0gZXhwaXJ5O1xuXG4gICAgdHJ5IHtcbiAgICAgICAgc2V0VmFsdWUoJ2F3X2F1dGhfdG9rZW4nLCBjbGVhblRva2VuKTtcbiAgICAgICAgc2V0VmFsdWUoJ2F3X2F1dGhfdG9rZW5fZXhwaXJ5JywgZXhwaXJ5ID8gZXhwaXJ5LmdldFRpbWUoKS50b1N0cmluZygpIDogJycpO1xuICAgIH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuXG4gICAgY29uc3QgZGlmZiAgID0gZXhwaXJ5ID8gTWF0aC5mbG9vcigoZXhwaXJ5IC0gRGF0ZS5ub3coKSkgLyAxMDAwKSA6IG51bGw7XG4gICAgY29uc3QgdGltZVN0ciA9IGV4cGlyeVxuICAgICAgICA/IGAke2V4cGlyeS50b0xvY2FsZVRpbWVTdHJpbmcoJ2lkLUlEJyl9ICgke01hdGguZmxvb3IoZGlmZiAvIDM2MDApfWggJHtNYXRoLmZsb29yKChkaWZmICUgMzYwMCkgLyA2MCl9bSlgXG4gICAgICAgIDogJ1RpZGFrIGFkYSBleHAnO1xuXG4gICAgbG9nRm4oYPCflJEgVG9rZW4gdmFsaWQgdmlhICR7c291cmNlfSEgRXhwOiAke3RpbWVTdHJ9YCwgJ3N1Y2Nlc3MnKTtcblxuICAgIHN0YXRlLnRva2VuRXhwaXJlZCAgICAgPSBmYWxzZTtcblxuICAgIGlmIChzdGF0ZS5wYXVzZWRGb3JUb2tlbiB8fCAhc3RhdGUucnVubmluZykge1xuICAgICAgICBzdGF0ZS5ydW5uaW5nID0gdHJ1ZTtcbiAgICAgICAgc3RhdGUucGF1c2VkRm9yVG9rZW4gPSBmYWxzZTtcbiAgICAgICAgbG9nRm4oJ+KWtu+4jyBTZXNpIGRpcGVyYmFydWkuIFNjcmlwdCBkaWxhbmp1dGthbiBvdG9tYXRpcyEnLCAnc3VjY2VzcycpO1xuICAgICAgICBvblJlc3VtZT8uKCk7XG4gICAgICAgIHdha2VQZW5kaW5nV29yaz8uKCk7XG4gICAgfVxuXG4gICAgb25VcGRhdGU/LigpO1xuICAgIHJldHVybiB0cnVlO1xufVxuXG4vKipcbiAqIFNjYW5zIHdpbmRvdy5sb2NhbFN0b3JhZ2UsIHNlc3Npb25TdG9yYWdlLCBhbmQgdW5zYWZlV2luZG93LmxvY2FsU3RvcmFnZSBmb3IgYSB2YWxpZCBKV1QuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRUb2tlbkZyb21TdG9yYWdlKHN0YXRlLCBoYW5kbGVOZXdUb2tlbkZuKSB7XG4gICAgY29uc3Qgc2hvdWxkTG9nID0gRGF0ZS5ub3coKSAtIChnZXRUb2tlbkZyb21TdG9yYWdlLl9sYXN0RGlhZ0F0IHx8IDApID49IDMwMDAwO1xuICAgIGlmIChzaG91bGRMb2cpIHtcbiAgICAgICAgY29uc29sZS5sb2coJ1tUb2tlbl0gTWVtaW5kYWkgc3RvcmFnZS4uLicpO1xuICAgICAgICBnZXRUb2tlbkZyb21TdG9yYWdlLl9sYXN0RGlhZ0F0ID0gRGF0ZS5ub3coKTtcbiAgICB9XG5cbiAgICBjb25zdCBzdG9yYWdlcyA9IFtdO1xuICAgIHRyeSB7IGlmICh3aW5kb3cubG9jYWxTdG9yYWdlKSBzdG9yYWdlcy5wdXNoKHsgbmFtZTogJ2xvY2FsU3RvcmFnZScsIHN0b3JlOiB3aW5kb3cubG9jYWxTdG9yYWdlIH0pOyB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cbiAgICB0cnkge1xuICAgICAgICBjb25zdCBwdyA9IHdpbmRvdzsgLy8gSW4gTVYzIGNvbnRlbnQgc2NyaXB0cywgd2luZG93IElTIHRoZSBwYWdlIHdpbmRvd1xuICAgICAgICBpZiAocHc/LmxvY2FsU3RvcmFnZSAmJiBwdy5sb2NhbFN0b3JhZ2UgIT09IHdpbmRvdy5sb2NhbFN0b3JhZ2UpIHtcbiAgICAgICAgICAgIHN0b3JhZ2VzLnB1c2goeyBuYW1lOiAncHcubG9jYWxTdG9yYWdlJywgc3RvcmU6IHB3LmxvY2FsU3RvcmFnZSB9KTtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuICAgIHRyeSB7IGlmICh3aW5kb3cuc2Vzc2lvblN0b3JhZ2UpIHN0b3JhZ2VzLnB1c2goeyBuYW1lOiAnc2Vzc2lvblN0b3JhZ2UnLCBzdG9yZTogd2luZG93LnNlc3Npb25TdG9yYWdlIH0pOyB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblxuICAgIGNvbnN0IGNvbW1vbktleXMgPSBbJ3Rva2VuJywgJ2F1dGhfdG9rZW4nLCAnYXV0aFRva2VuJywgJ2FjY2Vzc190b2tlbicsICdqd3QnLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3Nlc3Npb24nLCAncGFybGFtZW50dW1fdG9rZW4nLCAnc2ItdG9rZW4nLCAnc2ItYWNjZXNzLXRva2VuJywgJ3VzZXJfdG9rZW4nXTtcblxuICAgIGZvciAoY29uc3QgeyBuYW1lLCBzdG9yZSB9IG9mIHN0b3JhZ2VzKSB7XG4gICAgICAgIGZvciAoY29uc3Qga2V5IG9mIGNvbW1vbktleXMpIHtcbiAgICAgICAgICAgIGNvbnN0IHZhbCA9IHN0b3JlLmdldEl0ZW0oa2V5KTtcbiAgICAgICAgICAgIGlmICh2YWwgJiYgaGFuZGxlTmV3VG9rZW5Gbih2YWwsIGAke25hbWV9WyR7a2V5fV1gKSkgcmV0dXJuIHN0YXRlLmN1cnJlbnRUb2tlbjtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgeyBuYW1lLCBzdG9yZSB9IG9mIHN0b3JhZ2VzKSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc3RvcmUubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IHN0b3JlLmtleShpKTtcbiAgICAgICAgICAgIGlmICgha2V5KSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IHZhbCA9IHN0b3JlLmdldEl0ZW0oa2V5KTtcbiAgICAgICAgICAgIGlmICh2YWwgJiYgdHlwZW9mIHZhbCA9PT0gJ3N0cmluZycgJiYgKHZhbC5pbmNsdWRlcygnZXlKJykgfHwgdmFsLnN0YXJ0c1dpdGgoJ3snKSkpIHtcbiAgICAgICAgICAgICAgICBpZiAoaGFuZGxlTmV3VG9rZW5Gbih2YWwsIGAke25hbWV9W2F1dG86JHtrZXl9XWApKSByZXR1cm4gc3RhdGUuY3VycmVudFRva2VuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHNob3VsZExvZykge1xuICAgICAgICBjb25zb2xlLndhcm4oJ1tUb2tlbl0gVGlkYWsgZGl0ZW11a2FuLiBLZXlzIHRlcnNlZGlhOicpO1xuICAgICAgICBmb3IgKGNvbnN0IHsgbmFtZSwgc3RvcmUgfSBvZiBzdG9yYWdlcykge1xuICAgICAgICAgICAgdHJ5IHsgY29uc29sZS5sb2coYCAgJHtuYW1lfTpgLCBPYmplY3Qua2V5cyhzdG9yZSkpOyB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIGEgaHVtYW4tcmVhZGFibGUgc3RyaW5nIG9mIHRpbWUgcmVtYWluaW5nIHVudGlsIHRva2VuIGV4cGlyeS5cbiAqIEBwYXJhbSB7b2JqZWN0fSBzdGF0ZVxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0VGltZVVudGlsRXhwaXJ5KHN0YXRlKSB7XG4gICAgaWYgKCFzdGF0ZS50b2tlbkV4cGlyeSkgcmV0dXJuICdOL0EnO1xuICAgIGNvbnN0IGRpZmYgPSBzdGF0ZS50b2tlbkV4cGlyeSAtIERhdGUubm93KCk7XG4gICAgaWYgKGRpZmYgPD0gMCkgcmV0dXJuICdFWFBJUkVEJztcbiAgICByZXR1cm4gYCR7TWF0aC5mbG9vcihkaWZmIC8gMzYwMDAwMCl9aCAke01hdGguZmxvb3IoKGRpZmYgJSAzNjAwMDAwKSAvIDYwMDAwKX1tYDtcbn1cblxuLyoqXG4gKiBTZXRzIHVwIDBtcyB0b2tlbiBpbnRlcmNlcHRpb24gdmlhIHN0b3JhZ2UgZXZlbnRzICsgZmV0Y2ggc25pZmZlciArIGludGVydmFsIGZhbGxiYWNrLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc3RhcnRUb2tlbldhdGNoZXIoc3RhdGUsIGhhbmRsZU5ld1Rva2VuRm4sIGdldFRva2VuRm4pIHtcbiAgICAvLyAxLiBDcm9zcy10YWIgc3RvcmFnZSBldmVudHMgKGNhdGNoZXMgbG9naW4gaW4gYW5vdGhlciB0YWIpXG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3N0b3JhZ2UnLCAoeyBuZXdWYWx1ZSwga2V5IH0pID0+IHtcbiAgICAgICAgaWYgKG5ld1ZhbHVlKSBoYW5kbGVOZXdUb2tlbkZuKG5ld1ZhbHVlLCBgc3RvcmFnZS1ldmVudFske2tleX1dYCk7XG4gICAgfSk7XG5cbiAgICAvLyAyLiBGZXRjaCBzbmlmZmVyIOKAlCBpbnRlcmNlcHRzIEF1dGhvcml6YXRpb24gQmVhcmVyIGZyb20gbGl2ZSBwYWdlIHJlcXVlc3RzXG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgb3JpZ0ZldGNoID0gd2luZG93LmZldGNoO1xuICAgICAgICB3aW5kb3cuZmV0Y2ggPSBmdW5jdGlvbiguLi5hcmdzKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IFtpbnB1dCwgY29uZmlnXSA9IGFyZ3M7XG4gICAgICAgICAgICAgICAgbGV0IGF1dGggPSBudWxsO1xuICAgICAgICAgICAgICAgIGlmIChjb25maWc/LmhlYWRlcnMpIHtcbiAgICAgICAgICAgICAgICAgICAgYXV0aCA9IGNvbmZpZy5oZWFkZXJzIGluc3RhbmNlb2YgSGVhZGVyc1xuICAgICAgICAgICAgICAgICAgICAgICAgPyBjb25maWcuaGVhZGVycy5nZXQoJ0F1dGhvcml6YXRpb24nKSB8fCBjb25maWcuaGVhZGVycy5nZXQoJ2F1dGhvcml6YXRpb24nKVxuICAgICAgICAgICAgICAgICAgICAgICAgOiBjb25maWcuaGVhZGVyc1snQXV0aG9yaXphdGlvbiddIHx8IGNvbmZpZy5oZWFkZXJzWydhdXRob3JpemF0aW9uJ107XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICghYXV0aCAmJiBpbnB1dCBpbnN0YW5jZW9mIFJlcXVlc3QpIHtcbiAgICAgICAgICAgICAgICAgICAgYXV0aCA9IGlucHV0LmhlYWRlcnM/LmdldCgnQXV0aG9yaXphdGlvbicpIHx8IGlucHV0LmhlYWRlcnM/LmdldCgnYXV0aG9yaXphdGlvbicpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoYXV0aD8uaW5jbHVkZXMoJ0JlYXJlciAnKSkgaGFuZGxlTmV3VG9rZW5GbihhdXRoLCAnZmV0Y2gtaW50ZXJjZXB0Jyk7XG4gICAgICAgICAgICB9IGNhdGNoIHsgLyogbmV2ZXIgYnJlYWsgdGhlIHBhZ2UgKi8gfVxuICAgICAgICAgICAgcmV0dXJuIG9yaWdGZXRjaC5hcHBseSh0aGlzLCBhcmdzKTtcbiAgICAgICAgfTtcbiAgICB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblxuICAgIC8vIDMuIEludGVydmFsIGZhbGxiYWNrIOKAlCByZXNjYW5zIGlmIHRva2VuIGlzIG1pc3Npbmcgb3IgZXhwaXJlZFxuICAgIHNldEludGVydmFsKCgpID0+IHtcbiAgICAgICAgaWYgKCFzdGF0ZS5jdXJyZW50VG9rZW4gfHwgKHN0YXRlLnRva2VuRXhwaXJ5ICYmIHN0YXRlLnRva2VuRXhwaXJ5IDwgbmV3IERhdGUoKSkpIHtcbiAgICAgICAgICAgIGdldFRva2VuRm4oKTtcbiAgICAgICAgfVxuICAgIH0sIDgwMDApO1xufVxuIiwiLyoqXG4gKiBlbmVyZ3kuanMg4oCUIERPTSBlbmVyZ3kgc2NyYXBpbmcgYW5kIHRpbWUtYmFzZWQgc3luYyBlc3RpbWF0aW9uXG4gKi9cblxuLyoqIEByZXR1cm5zIHt7IGN1cnJlbnQ6IG51bWJlciwgbWF4OiBudW1iZXIgfXxudWxsfSAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldEN1cnJlbnRFbmVyZ3koKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgaXNFeGNsdWRlZCA9IGVsID0+IEJvb2xlYW4oXG4gICAgICAgICAgICBlbC5jbG9zZXN0KCcjYXctcGFuZWwsICNhdy1zZXR0aW5ncy1tb2RhbCwgI2F3LWFuYWx5dGljcy1tb2RhbCwgI2F3LWxvZy1tb2RhbCwgI2F3LW5vdGlmaWNhdGlvbi10b2FzdCcpXG4gICAgICAgICk7XG5cbiAgICAgICAgLy8g4pSA4pSAIFByaW9yaXR5IDE6IFRvcCBOYXZpZ2F0aW9uIEJhciBTcGF0aWFsIFNlYXJjaCAoRmFzdGVzdDogPCAwLjJtcykg4pSA4pSAXG4gICAgICAgIC8vIFRvcCBoZWFkZXIgcmVuZGVycyB0aGUgY29tcGFjdCBwaWxsIHdpdGggW+KaoSA0NC8xMTBdIGFjcm9zcyBhbGwgcGFnZXNcbiAgICAgICAgY29uc3QgdG9wQ2FuZGlkYXRlcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2hlYWRlciwgbmF2LCBbcm9sZT1cImJhbm5lclwiXSwgW2NsYXNzKj1cIm5hdlwiIGldLCBbY2xhc3MqPVwiaGVhZGVyXCIgaV0sIFtjbGFzcyo9XCJ0b3BiYXJcIiBpXSwgW2NsYXNzKj1cIm5hdmJhclwiIGldJyk7XG4gICAgICAgIGZvciAoY29uc3QgY29udGFpbmVyIG9mIHRvcENhbmRpZGF0ZXMpIHtcbiAgICAgICAgICAgIGlmIChpc0V4Y2x1ZGVkKGNvbnRhaW5lcikpIGNvbnRpbnVlO1xuICAgICAgICAgICAgY29uc3QgZWxzID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJyonKTtcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoZXMgPSBbXTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgZWwgb2YgZWxzKSB7XG4gICAgICAgICAgICAgICAgaWYgKGlzRXhjbHVkZWQoZWwpKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICBjb25zdCB0ZXh0ID0gKGVsLnRleHRDb250ZW50IHx8ICcnKS50cmltKCk7XG4gICAgICAgICAgICAgICAgaWYgKCF0ZXh0LmluY2x1ZGVzKCcvJykpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIGlmICh0ZXh0Lmxlbmd0aCA+IDMwKSBjb250aW51ZTsgLy8gbXVzdCBiZSBhIGNvbXBhY3QgcGlsbC9sYWJlbFxuICAgICAgICAgICAgICAgIGNvbnN0IG0gPSB0ZXh0Lm1hdGNoKC8oPzrimqF8XFxiKShcXGQrKVxccypcXC9cXHMqKFxcZCspXFxiLyk7XG4gICAgICAgICAgICAgICAgaWYgKG0pIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY3VycmVudCA9IHBhcnNlSW50KG1bMV0sIDEwKSwgbWF4ID0gcGFyc2VJbnQobVsyXSwgMTApO1xuICAgICAgICAgICAgICAgICAgICBpZiAobWF4ID49IDUwICYmIG1heCA8PSAzNTAgJiYgY3VycmVudCA8PSBtYXgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1hdGNoZXMucHVzaCh7IGN1cnJlbnQsIG1heCwgbGVuOiB0ZXh0Lmxlbmd0aCB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChtYXRjaGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICBtYXRjaGVzLnNvcnQoKGEsIGIpID0+IGEubGVuIC0gYi5sZW4pO1xuICAgICAgICAgICAgICAgIHJldHVybiB7IGN1cnJlbnQ6IG1hdGNoZXNbMF0uY3VycmVudCwgbWF4OiBtYXRjaGVzWzBdLm1heCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8g4pSA4pSAIFByaW9yaXR5IDI6IERlZGljYXRlZCBEYXNoYm9hcmQgXCJFTkVSR0lcIiBDYXJkIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuICAgICAgICAvLyBPbiBwYXJsYW1lbnR1bS5vcmcvZGFzaGJvYXJkLCB0aGUgbWFpbiBlbmVyZ3kgY2FyZCBoYXMgYSBoZWFkaW5nIHdpdGggXCJFTkVSR0lcIlxuICAgICAgICBjb25zdCBlbmVyZ3lIZWFkZXJzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnaDEsIGgyLCBoMywgaDQsIGg1LCBoNiwgc3BhbiwgZGl2LCBwJyk7XG4gICAgICAgIGZvciAoY29uc3QgaCBvZiBlbmVyZ3lIZWFkZXJzKSB7XG4gICAgICAgICAgICBpZiAoaXNFeGNsdWRlZChoKSkgY29udGludWU7XG4gICAgICAgICAgICBjb25zdCB0ID0gKGgudGV4dENvbnRlbnQgfHwgJycpLnRyaW0oKTtcbiAgICAgICAgICAgIGlmICgvXuKaoT9cXHMqKD86RU5FUkdJfEVORVJHWSlcXGIvaS50ZXN0KHQpICYmIHQubGVuZ3RoIDw9IDMwKSB7XG4gICAgICAgICAgICAgICAgLy8gU2VhcmNoIGluIHBhcmVudCBjYXJkICh1cCB0byA0IGxldmVscyB1cClcbiAgICAgICAgICAgICAgICBsZXQgY2FyZCA9IGgucGFyZW50RWxlbWVudDtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBsZXZlbCA9IDA7IGxldmVsIDwgNCAmJiBjYXJkICYmIGNhcmQgIT09IGRvY3VtZW50LmJvZHk7IGxldmVsKyspIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaW5uZXJFbHMgPSBjYXJkLnF1ZXJ5U2VsZWN0b3JBbGwoJyonKTtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBlbCBvZiBpbm5lckVscykge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGlzRXhjbHVkZWQoZWwpKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHR4dCA9IChlbC50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCF0eHQuaW5jbHVkZXMoJy8nKSB8fCB0eHQubGVuZ3RoID4gMjUpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbSA9IHR4dC5tYXRjaCgvKD864pqhfFxcYikoXFxkKylcXHMqXFwvXFxzKihcXGQrKS8pO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjdXJyZW50ID0gcGFyc2VJbnQobVsxXSwgMTApLCBtYXggPSBwYXJzZUludChtWzJdLCAxMCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG1heCA+PSA1MCAmJiBtYXggPD0gMzUwICYmIGN1cnJlbnQgPD0gbWF4KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7IGN1cnJlbnQsIG1heCB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjYXJkVGV4dCA9IChjYXJkLnRleHRDb250ZW50IHx8ICcnKS50cmltKCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG0gPSBjYXJkVGV4dC5tYXRjaCgvKFxcZCspXFxzKlxcL1xccyooXFxkKykvKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1cnJlbnQgPSBwYXJzZUludChtWzFdLCAxMCksIG1heCA9IHBhcnNlSW50KG1bMl0sIDEwKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChtYXggPj0gNTAgJiYgbWF4IDw9IDM1MCAmJiBjdXJyZW50IDw9IG1heCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7IGN1cnJlbnQsIG1heCB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNhcmQgPSBjYXJkLnBhcmVudEVsZW1lbnQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8g4pSA4pSAIFByaW9yaXR5IDM6IElubmVybW9zdCBFbGVtZW50cyBpbiBEb2N1bWVudCB3aXRoIFxcZCsvXFxkKyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgICAgICAgY29uc3QgYWxsQ2FuZGlkYXRlcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2Rpdiwgc3BhbiwgcCwgYSwgYnV0dG9uLCBbcm9sZT1cInN0YXR1c1wiXScpO1xuICAgICAgICBjb25zdCBtYXRjaGVzID0gW107XG4gICAgICAgIGZvciAoY29uc3QgZWwgb2YgYWxsQ2FuZGlkYXRlcykge1xuICAgICAgICAgICAgaWYgKGlzRXhjbHVkZWQoZWwpKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IHRleHQgPSAoZWwudGV4dENvbnRlbnQgfHwgJycpLnRyaW0oKTtcbiAgICAgICAgICAgIGlmICghdGV4dC5pbmNsdWRlcygnLycpKSBjb250aW51ZTtcbiAgICAgICAgICAgIGlmICh0ZXh0Lmxlbmd0aCA+IDM1KSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IG0gPSB0ZXh0Lm1hdGNoKC8oPzrimqF8XFxiKShcXGQrKVxccypcXC9cXHMqKFxcZCspXFxiLyk7XG4gICAgICAgICAgICBpZiAobSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGN1cnJlbnQgPSBwYXJzZUludChtWzFdLCAxMCksIG1heCA9IHBhcnNlSW50KG1bMl0sIDEwKTtcbiAgICAgICAgICAgICAgICBpZiAobWF4ID49IDUwICYmIG1heCA8PSAzNTAgJiYgY3VycmVudCA8PSBtYXgpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaGFzSWNvbiA9IHRleHQuaW5jbHVkZXMoJ+KaoScpIHx8IEJvb2xlYW4oZWwucXVlcnlTZWxlY3Rvcignc3ZnJykpO1xuICAgICAgICAgICAgICAgICAgICBtYXRjaGVzLnB1c2goeyBjdXJyZW50LCBtYXgsIGxlbjogdGV4dC5sZW5ndGgsIGhhc0ljb24gfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG1hdGNoZXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgbWF0Y2hlcy5zb3J0KChhLCBiKSA9PiAoYi5oYXNJY29uID8gMSA6IDApIC0gKGEuaGFzSWNvbiA/IDEgOiAwKSB8fCBhLmxlbiAtIGIubGVuKTtcbiAgICAgICAgICAgIHJldHVybiB7IGN1cnJlbnQ6IG1hdGNoZXNbMF0uY3VycmVudCwgbWF4OiBtYXRjaGVzWzBdLm1heCB9O1xuICAgICAgICB9XG5cbiAgICAgICAgLy8g4pSA4pSAIFByaW9yaXR5IDQ6IFNwbGl0IFJlYWN0IFNwYW5zICg8c3BhbiBjdXJyZW50PiAvIDxzcGFuIG1heD4pIOKUgOKUgOKUgOKUgOKUgOKUgFxuICAgICAgICBjb25zdCBzbGFzaEVscyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ3NwYW4sIGRpdicpO1xuICAgICAgICBmb3IgKGNvbnN0IGVsIG9mIHNsYXNoRWxzKSB7XG4gICAgICAgICAgICBpZiAoaXNFeGNsdWRlZChlbCkpIGNvbnRpbnVlO1xuICAgICAgICAgICAgaWYgKChlbC50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpID09PSAnLycpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwcmV2ID0gZWwucHJldmlvdXNFbGVtZW50U2libGluZztcbiAgICAgICAgICAgICAgICBjb25zdCBuZXh0ID0gZWwubmV4dEVsZW1lbnRTaWJsaW5nO1xuICAgICAgICAgICAgICAgIGlmIChwcmV2ICYmIG5leHQpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY3VycmVudCA9IHBhcnNlSW50KChwcmV2LnRleHRDb250ZW50IHx8ICcnKS50cmltKCksIDEwKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbWF4ID0gcGFyc2VJbnQoKG5leHQudGV4dENvbnRlbnQgfHwgJycpLnRyaW0oKSwgMTApO1xuICAgICAgICAgICAgICAgICAgICBpZiAoTnVtYmVyLmlzU2FmZUludGVnZXIoY3VycmVudCkgJiYgTnVtYmVyLmlzU2FmZUludGVnZXIobWF4KSAmJiBtYXggPj0gNTAgJiYgbWF4IDw9IDM1MCAmJiBjdXJyZW50IDw9IG1heCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgY3VycmVudCwgbWF4IH07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuLyoqXG4gKiBXYWl0cyAodXAgdG8gbWF4V2FpdE1zKSBmb3IgdGhlIGVuZXJneSBlbGVtZW50IHRvIGFwcGVhciBpbiB0aGUgRE9NLlxuICogVXNlZnVsIG9uIFJlYWN0IFNQQXMgd2hlcmUgZWxlbWVudHMgcmVuZGVyIGFmdGVyIGRvY3VtZW50X2lkbGUuXG4gKiBAcGFyYW0ge251bWJlcn0gbWF4V2FpdE1zXG4gKiBAcmV0dXJucyB7UHJvbWlzZTx7Y3VycmVudDpudW1iZXIsbWF4Om51bWJlcn18bnVsbD59XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3YWl0Rm9yRW5lcmd5RWxlbWVudChtYXhXYWl0TXMgPSAxNTAwMCkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcbiAgICAgICAgY29uc3QgaW1tZWRpYXRlID0gZ2V0Q3VycmVudEVuZXJneSgpO1xuICAgICAgICBpZiAoaW1tZWRpYXRlKSByZXR1cm4gcmVzb2x2ZShpbW1lZGlhdGUpO1xuXG4gICAgICAgIGNvbnN0IGRlYWRsaW5lID0gRGF0ZS5ub3coKSArIG1heFdhaXRNcztcbiAgICAgICAgY29uc3Qgb2JzZXJ2ZXIgPSBuZXcgTXV0YXRpb25PYnNlcnZlcigoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBnZXRDdXJyZW50RW5lcmd5KCk7XG4gICAgICAgICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgb2JzZXJ2ZXIuZGlzY29ubmVjdCgpO1xuICAgICAgICAgICAgICAgIHJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoRGF0ZS5ub3coKSA+PSBkZWFkbGluZSkge1xuICAgICAgICAgICAgICAgIG9ic2VydmVyLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG51bGwpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgb2JzZXJ2ZXIub2JzZXJ2ZShkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQsIHsgY2hpbGRMaXN0OiB0cnVlLCBzdWJ0cmVlOiB0cnVlIH0pO1xuXG4gICAgICAgIC8vIFNhZmV0eSB0aW1lb3V0IGluIGNhc2UgTXV0YXRpb25PYnNlcnZlciBkb2Vzbid0IGZpcmVcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICBvYnNlcnZlci5kaXNjb25uZWN0KCk7XG4gICAgICAgICAgICByZXNvbHZlKGdldEN1cnJlbnRFbmVyZ3koKSk7XG4gICAgICAgIH0sIG1heFdhaXRNcyk7XG4gICAgfSk7XG59XG5cbi8qKlxuICogSW50ZW50aW9uYWxseSBuby1vcDogbmV2ZXIgbXV0YXRlIFJlYWN0IGhvc3QgU1BBIERPTSBub2RlcyBkaXJlY3RseSxcbiAqIGFzIGRvaW5nIHNvIHdpcGVzIG91dCBjaGlsZCBlbGVtZW50cywgc3R5bGluZywgYW5kIGJyZWFrcyBSZWFjdCB2aXJ0dWFsIERPTS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZVBhZ2VFbmVyZ3lET00oY3VycmVudCwgbWF4KSB7XG4gICAgcmV0dXJuIGZhbHNlO1xufVxuXG4vKipcbiAqIFJldHVybnMgZW5lcmd5IHVzaW5nIHBhZ2UgRE9NIHdoZW4gdmlzaWJsZSwgb3IgdGltZS1iYXNlZCBlc3RpbWF0aW9uIHdoZW4gdGFiIGlzIGluIGJhY2tncm91bmQuXG4gKiBAcGFyYW0ge29iamVjdH0gc3RhdGVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldFN5bmNlZEVuZXJneShzdGF0ZSkge1xuICAgIGNvbnN0IGlzSGlkZGVuID0gdHlwZW9mIGRvY3VtZW50ICE9PSAndW5kZWZpbmVkJyAmJiBkb2N1bWVudC5oaWRkZW47XG4gICAgY29uc3Qgbm93ICAgICAgPSBEYXRlLm5vdygpO1xuXG4gICAgLy8gMS4gRWNvIE1vZGUgLyBCYWNrZ3JvdW5kIFRhYjogVXNlIE8oMSkgbWF0aGVtYXRpY2FsIGNhbGN1bGF0aW9uIHdoZW4gaW52aXNpYmxlXG4gICAgLy8gRWxpbWluYXRlcyByZWR1bmRhbnQgRE9NIHRyYXZlcnNhbCB3aGlsZSBydW5uaW5nIHNtb290aGx5IGluIGJhY2tncm91bmQhXG4gICAgaWYgKGlzSGlkZGVuICYmIHN0YXRlLmVuZXJneVN5bmNCYXNlICYmIHR5cGVvZiBzdGF0ZS5lbmVyZ3lTeW5jQmFzZS5jdXJyZW50ID09PSAnbnVtYmVyJykge1xuICAgICAgICBjb25zdCBzeW5jQmFzZSA9IHN0YXRlLmVuZXJneVN5bmNCYXNlO1xuICAgICAgICBjb25zdCBtYXggPSBzeW5jQmFzZS5tYXggfHwgc3RhdGUubWF4RW5lcmd5IHx8IDExNTtcbiAgICAgICAgY29uc3QgZWxhcHNlZE1pbnMgPSBzeW5jQmFzZS51cGRhdGVkQXQgPyAobm93IC0gc3luY0Jhc2UudXBkYXRlZEF0KSAvIDYwMDAwIDogMDtcbiAgICAgICAgY29uc3QgcmVnZW5SYXRlID0gc3RhdGUucmVnZW5SYXRlIHx8IDEuMDtcbiAgICAgICAgY29uc3QgZ2FpbmVkID0gTWF0aC5mbG9vcihlbGFwc2VkTWlucyAqIHJlZ2VuUmF0ZSk7XG4gICAgICAgIGNvbnN0IGNhbGN1bGF0ZWQgPSBNYXRoLm1pbihtYXgsIHN5bmNCYXNlLmN1cnJlbnQgKyBNYXRoLm1heCgwLCBnYWluZWQpKTtcbiAgICAgICAgcmV0dXJuIHsgY3VycmVudDogY2FsY3VsYXRlZCwgbWF4IH07XG4gICAgfVxuXG4gICAgY29uc3QgcGFnZUVuZXJneSA9IGdldEN1cnJlbnRFbmVyZ3koKTtcblxuICAgIC8vIDIuIFN0YWxlIERPTSBwcm90ZWN0aW9uOiBJZiBhIHNoaWZ0IG9jY3VycmVkIHJlY2VudGx5ICh3aXRoaW4gNSBtaW51dGVzKSxcbiAgICAvLyBhbiB1bi1yZWZyZXNoZWQgYmFja2dyb3VuZCB0YWIgc3RpbGwgaGFzIHRoZSBvbGQgcHJlLXNoaWZ0IEhUTUwgaW4gbWVtb3J5LlxuICAgIGlmIChzdGF0ZS5sYXN0V29ya1RpbWVzdGFtcCAmJiAobm93IC0gc3RhdGUubGFzdFdvcmtUaW1lc3RhbXAgPCAzMDAwMDApKSB7XG4gICAgICAgIGNvbnN0IGVsYXBzZWRNaW5zID0gTWF0aC5mbG9vcigobm93IC0gc3RhdGUubGFzdFdvcmtUaW1lc3RhbXApIC8gNjAwMDApO1xuICAgICAgICBjb25zdCBwb3N0U2hpZnRFbmVyZ3kgPSBzdGF0ZS5wb3N0U2hpZnRFbmVyZ3kgPz8gMDtcbiAgICAgICAgY29uc3QgdGhlb3JldGljYWxNYXggPSBNYXRoLm1pbihzdGF0ZS5tYXhFbmVyZ3kgfHwgMTE1LCBwb3N0U2hpZnRFbmVyZ3kgKyBlbGFwc2VkTWlucyk7XG4gICAgICAgIGlmIChwYWdlRW5lcmd5ICYmIHBhZ2VFbmVyZ3kuY3VycmVudCA+IHRoZW9yZXRpY2FsTWF4ICsgMikge1xuICAgICAgICAgICAgLy8gRE9NIHN0aWxsIGRpc3BsYXlzIG9sZCBwcmUtc2hpZnQgbnVtYmVyLiBVc2UgbGVnaXRpbWF0ZSByZWdlbmVyYXRlZCBlbmVyZ3kuXG4gICAgICAgICAgICByZXR1cm4geyBjdXJyZW50OiB0aGVvcmV0aWNhbE1heCwgbWF4OiBzdGF0ZS5tYXhFbmVyZ3kgfHwgMTE1IH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyAzLiBWaXNpYmxlIERPTSBpcyBncm91bmQgdHJ1dGggd2hlbiBwYWdlIGlzIGFjdGl2ZSBhbmQgbm90IGhpZGRlblxuICAgIGlmIChwYWdlRW5lcmd5ICYmICFpc0hpZGRlbiAmJiAhc3RhdGUuZG9tRW5lcmd5U3RhbGUpIHtcbiAgICAgICAgc3RhdGUuZG9tRW5lcmd5U3RhbGUgPSBmYWxzZTtcbiAgICAgICAgaWYgKCFzdGF0ZS5lbmVyZ3lTeW5jQmFzZSB8fCBzdGF0ZS5lbmVyZ3lTeW5jQmFzZS5jdXJyZW50ICE9PSBwYWdlRW5lcmd5LmN1cnJlbnQgfHwgc3RhdGUuZW5lcmd5U3luY0Jhc2UubWF4ICE9PSBwYWdlRW5lcmd5Lm1heCkge1xuICAgICAgICAgICAgc3RhdGUuZW5lcmd5U3luY0Jhc2UgPSB7IGN1cnJlbnQ6IHBhZ2VFbmVyZ3kuY3VycmVudCwgbWF4OiBwYWdlRW5lcmd5Lm1heCwgdXBkYXRlZEF0OiBub3cgfTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcGFnZUVuZXJneTtcbiAgICB9XG5cbiAgICAvLyA0LiBGYWxsYmFjayBlc3RpbWF0aW9uIHdoZW4gRE9NIGlzIGVtcHR5IG9yIHRyYW5zaXRpb25pbmdcbiAgICBjb25zdCBzeW5jQmFzZSA9IHN0YXRlLmVuZXJneVN5bmNCYXNlO1xuICAgIGlmIChzeW5jQmFzZSAmJiB0eXBlb2Ygc3luY0Jhc2UuY3VycmVudCA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgY29uc3QgbWF4ID0gc3luY0Jhc2UubWF4IHx8IHN0YXRlLm1heEVuZXJneSB8fCAxMTU7XG4gICAgICAgIGNvbnN0IGVsYXBzZWRNaW5zID0gc3luY0Jhc2UudXBkYXRlZEF0ID8gKG5vdyAtIHN5bmNCYXNlLnVwZGF0ZWRBdCkgLyA2MDAwMCA6IDA7XG4gICAgICAgIGNvbnN0IHJlZ2VuUmF0ZSA9IHN0YXRlLnJlZ2VuUmF0ZSB8fCAxLjA7XG4gICAgICAgIGNvbnN0IGdhaW5lZCA9IE1hdGguZmxvb3IoZWxhcHNlZE1pbnMgKiByZWdlblJhdGUpO1xuICAgICAgICBjb25zdCBjYWxjdWxhdGVkID0gTWF0aC5taW4obWF4LCBzeW5jQmFzZS5jdXJyZW50ICsgTWF0aC5tYXgoMCwgZ2FpbmVkKSk7XG4gICAgICAgIHJldHVybiB7IGN1cnJlbnQ6IGNhbGN1bGF0ZWQsIG1heCB9O1xuICAgIH1cblxuICAgIGlmIChwYWdlRW5lcmd5KSB7XG4gICAgICAgIHJldHVybiBwYWdlRW5lcmd5O1xuICAgIH1cblxuICAgIHJldHVybiB7IGN1cnJlbnQ6IHN0YXRlLmN1cnJlbnRFbmVyZ3kgfHwgMCwgbWF4OiBzdGF0ZS5tYXhFbmVyZ3kgfHwgMTE1IH07XG59XG5cbi8qKiBDaGVja3MgaWYgY3VycmVudCBsb2NhbCB0aW1lIGlzIHdpdGhpbiBjb25maWd1cmVkIHNsZWVwIGhvdXJzICovXG5leHBvcnQgZnVuY3Rpb24gaXNTbGVlcFRpbWUoQ09ORklHKSB7XG4gICAgaWYgKCFDT05GSUc/LnNsZWVwU2NoZWR1bGVFbmFibGVkKSByZXR1cm4gZmFsc2U7XG4gICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKTtcbiAgICBjb25zdCBjdXJyZW50SG91ciA9IG5vdy5nZXRIb3VycygpO1xuICAgIGNvbnN0IHN0YXJ0ID0gQ09ORklHLnNsZWVwU3RhcnRIb3VyID8/IDE7XG4gICAgY29uc3QgZW5kID0gQ09ORklHLnNsZWVwRW5kSG91ciA/PyA2O1xuXG4gICAgaWYgKHN0YXJ0IDwgZW5kKSB7XG4gICAgICAgIHJldHVybiBjdXJyZW50SG91ciA+PSBzdGFydCAmJiBjdXJyZW50SG91ciA8IGVuZDtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gY3VycmVudEhvdXIgPj0gc3RhcnQgfHwgY3VycmVudEhvdXIgPCBlbmQ7XG4gICAgfVxufVxuXG5sZXQgX2NhY2hlZFJlZ2lvbkRldGFpbHMgPSBudWxsO1xubGV0IF9sYXN0UmVnaW9uU2NhblRpbWUgPSAwO1xuXG4vKipcbiAqIFNjcmFwZXMgdGhlIGNpdHkvcmVnaW9uIEhlYWx0aCBpbmRleCAoS2VzZWhhdGFuKSBhbmQgcmVnaW9uIG5hbWUgZnJvbSB0aGUgZGFzaGJvYXJkIERPTS5cbiAqIENhY2hlZCBmb3IgMzBzIGluIEVjby1Nb2RlIHRvIGVsaW1pbmF0ZSByZXBldGl0aXZlIERPTSBxdWVyeWluZyBldmVyeSBzZWNvbmQuXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtmb3JjZT1mYWxzZV1cbiAqIEByZXR1cm5zIHt7IG5hbWU6IHN0cmluZywgbGV2ZWw6IG51bWJlciwgYm9udXNQZXJjZW50OiBudW1iZXIsIGJvbnVzTXVsdGlwbGllcjogbnVtYmVyIH19XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZWdpb25EZXRhaWxzKGZvcmNlID0gZmFsc2UpIHtcbiAgICBpZiAodHlwZW9mIGRvY3VtZW50ID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICByZXR1cm4geyBuYW1lOiAnV2lsYXlhaCcsIGxldmVsOiAwLCBib251c1BlcmNlbnQ6IDAsIGJvbnVzTXVsdGlwbGllcjogMS4wIH07XG4gICAgfVxuICAgIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gICAgaWYgKCFmb3JjZSAmJiBfY2FjaGVkUmVnaW9uRGV0YWlscyAmJiAobm93IC0gX2xhc3RSZWdpb25TY2FuVGltZSA8IDMwMDAwKSkge1xuICAgICAgICByZXR1cm4gX2NhY2hlZFJlZ2lvbkRldGFpbHM7XG4gICAgfVxuICAgIGxldCBuYW1lID0gJyc7XG4gICAgbGV0IGxldmVsID0gMDtcbiAgICB0cnkge1xuICAgICAgICAvLyAxLiBDaGVjayBmb3IgXCJESVRFTVBBVEtBTiBESVwiIGNhcmQgaGVhZGluZ1xuICAgICAgICBjb25zdCBhbGxIZWFkaW5ncyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2gxLCBoMiwgaDMsIGg0LCBoNSwgaDYsIHNwYW4sIGRpdiwgcCcpO1xuICAgICAgICBmb3IgKGNvbnN0IGggb2YgYWxsSGVhZGluZ3MpIHtcbiAgICAgICAgICAgIGNvbnN0IHR4dCA9IChoLnRleHRDb250ZW50IHx8ICcnKS50cmltKCk7XG4gICAgICAgICAgICBpZiAoL15ESVRFTVBBVEtBTlxccytESVxcYi9pLnRlc3QodHh0KSAmJiB0eHQubGVuZ3RoIDwgMzApIHtcbiAgICAgICAgICAgICAgICBsZXQgbmV4dCA9IGgubmV4dEVsZW1lbnRTaWJsaW5nO1xuICAgICAgICAgICAgICAgIGlmICghbmV4dCAmJiBoLnBhcmVudEVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY2hpbGRyZW4gPSBBcnJheS5mcm9tKGgucGFyZW50RWxlbWVudC5jaGlsZHJlbik7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGlkeCA9IGNoaWxkcmVuLmluZGV4T2YoaCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChpZHggIT09IC0xICYmIGlkeCArIDEgPCBjaGlsZHJlbi5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5leHQgPSBjaGlsZHJlbltpZHggKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAobmV4dCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjYW5kaWRhdGUgPSAobmV4dC50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoY2FuZGlkYXRlICYmIGNhbmRpZGF0ZS5sZW5ndGggPCA0MCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZSA9IGNhbmRpZGF0ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gMi4gRmFsbGJhY2s6IGNoZWNrIHVzZXIgcHJvZmlsZSBzdWJ0aXRsZSB1bmRlciBhdmF0YXIgKGUuZy4gXCJKYWthcnRhLCBOZWdhcmEgS2VzYXR1YW4uLi5cIilcbiAgICAgICAgaWYgKCFuYW1lKSB7XG4gICAgICAgICAgICBjb25zdCB0b3BiYXIgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdoZWFkZXIsIG5hdiwgW3JvbGU9XCJiYW5uZXJcIl0nKTtcbiAgICAgICAgICAgIGlmICh0b3BiYXIpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBzdWJ0ZXh0ID0gdG9wYmFyLnF1ZXJ5U2VsZWN0b3JBbGwoJ3NwYW4sIGRpdiwgcCcpO1xuICAgICAgICAgICAgICAgIGZvciAoY29uc3Qgc3Qgb2Ygc3VidGV4dCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0ID0gKHN0LnRleHRDb250ZW50IHx8ICcnKS50cmltKCk7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0LmluY2x1ZGVzKCdOZWdhcmEgS2VzYXR1YW4gUmVwdWJsaWsnKSB8fCB0LmluY2x1ZGVzKCdVU0QnKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcGFydHMgPSB0LnNwbGl0KC9bLMK3XS8pO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+IDAgJiYgcGFydHNbMF0udHJpbSgpLmxlbmd0aCA8IDMwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZSA9IHBhcnRzWzBdLnRyaW0oKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIDMuIEhlYWx0aCBib251cyBsZXZlbFxuICAgICAgICBjb25zdCBlbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXRlc3RpZD1cInJlZ2lvbi1pbmRleC1oZWFsdGhcIl0nKTtcbiAgICAgICAgaWYgKGVsKSB7XG4gICAgICAgICAgICBjb25zdCBhcmlhID0gZWwucXVlcnlTZWxlY3RvcignW2FyaWEtbGFiZWwqPVwiS2VzZWhhdGFuXCJdJyk/LmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpO1xuICAgICAgICAgICAgY29uc3QgYXJpYU1hdGNoID0gYXJpYT8ubWF0Y2goL0tlc2VoYXRhblxccysoXFxkKykvaSk7XG4gICAgICAgICAgICBpZiAoYXJpYU1hdGNoKSB7XG4gICAgICAgICAgICAgICAgbGV2ZWwgPSBwYXJzZUludChhcmlhTWF0Y2hbMV0sIDEwKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdGV4dCA9IChlbC50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpO1xuICAgICAgICAgICAgICAgIGNvbnN0IG1hdGNoZXMgPSB0ZXh0Lm1hdGNoKC9cXGIoWzAtOV18MTApXFxiL2cpO1xuICAgICAgICAgICAgICAgIGlmIChtYXRjaGVzICYmIG1hdGNoZXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICBsZXZlbCA9IHBhcnNlSW50KG1hdGNoZXNbbWF0Y2hlcy5sZW5ndGggLSAxXSwgMTApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuXG4gICAgbGV2ZWwgPSBNYXRoLm1heCgwLCBNYXRoLm1pbigxMCwgbGV2ZWwpKTtcbiAgICBjb25zdCBib251c1BlcmNlbnQgPSBsZXZlbCAqIDU7XG4gICAgY29uc3QgYm9udXNNdWx0aXBsaWVyID0gMSArIChib251c1BlcmNlbnQgLyAxMDApO1xuXG4gICAgY29uc3QgcmVzdWx0ID0ge1xuICAgICAgICBuYW1lOiBuYW1lIHx8ICdXaWxheWFoJyxcbiAgICAgICAgbGV2ZWwsXG4gICAgICAgIGJvbnVzUGVyY2VudCxcbiAgICAgICAgYm9udXNNdWx0aXBsaWVyXG4gICAgfTtcbiAgICBfY2FjaGVkUmVnaW9uRGV0YWlscyA9IHJlc3VsdDtcbiAgICBfbGFzdFJlZ2lvblNjYW5UaW1lID0gbm93O1xuICAgIHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogU2NyYXBlcyB0aGUgY2l0eS9yZWdpb24gSGVhbHRoIGluZGV4IChLZXNlaGF0YW4pIGZyb20gdGhlIGRhc2hib2FyZCBET00uXG4gKiBFYWNoIGxldmVsIG9mIEhlYWx0aCBnaXZlcyArNSUgcGFzc2l2ZSBlbmVyZ3kgcmVjb3ZlcnkuXG4gKiBFLmcuLCBMZXZlbCA5LzEwIGluIEpha2FydGEgZ2l2ZXMgKzQ1JSBib251cyAtPiBtdWx0aXBsaWVyIDEuNDUuXG4gKiBAcmV0dXJucyB7bnVtYmVyfSBNdWx0aXBsaWVyIChlLmcuIDEuNDUsIG9yIDEuMCBpZiBub3QgZm91bmQpXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZWdpb25IZWFsdGhCb251cygpIHtcbiAgICByZXR1cm4gZ2V0UmVnaW9uRGV0YWlscygpLmJvbnVzTXVsdGlwbGllcjtcbn1cblxuLyoqIE1pbGxpc2Vjb25kcyByZW1haW5pbmcgdW50aWwgc2xlZXAgaG91cnMgY29uY2x1ZGUgKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRNc1VudGlsU2xlZXBFbmQoQ09ORklHKSB7XG4gICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKTtcbiAgICBjb25zdCBlbmQgPSBuZXcgRGF0ZSgpO1xuICAgIGVuZC5zZXRIb3VycyhDT05GSUcuc2xlZXBFbmRIb3VyID8/IDYsIDAsIDAsIDApO1xuICAgIGlmIChlbmQgPD0gbm93KSBlbmQuc2V0RGF0ZShlbmQuZ2V0RGF0ZSgpICsgMSk7XG4gICAgcmV0dXJuIE1hdGgubWF4KDEwMDAsIGVuZC5nZXRUaW1lKCkgLSBub3cuZ2V0VGltZSgpKTtcbn1cblxuLyoqIEBwYXJhbSB7b2JqZWN0fSBzdGF0ZSBAcGFyYW0ge29iamVjdH0gQ09ORklHIEByZXR1cm5zIHtudW1iZXJ9IG1pbGxpc2Vjb25kcyB0byB3YWl0ICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0TmV4dFdvcmtEZWxheShzdGF0ZSwgQ09ORklHKSB7XG4gICAgaWYgKGlzU2xlZXBUaW1lKENPTkZJRykpIHtcbiAgICAgICAgcmV0dXJuIGdldE1zVW50aWxTbGVlcEVuZChDT05GSUcpO1xuICAgIH1cblxuICAgIGxldCB0aHJlc2hvbGQgPSBDT05GSUcuZW5lcmd5VGhyZXNob2xkO1xuICAgIGlmIChDT05GSUcuc3RlYWx0aEppdHRlckVuYWJsZWQpIHtcbiAgICAgICAgLy8gSHVtYW5pemVyOiB2YXJpYXNpIGFjYWsgLTEgcy9kICsyIGVuZXJnaVxuICAgICAgICBjb25zdCB2YXJpYW5jZSA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDQpIC0gMTtcbiAgICAgICAgdGhyZXNob2xkID0gTWF0aC5taW4oMTAwLCBNYXRoLm1heCgxMCwgdGhyZXNob2xkICsgdmFyaWFuY2UpKTtcbiAgICB9XG5cbiAgICBpZiAoc3RhdGUuY3VycmVudEVuZXJneSA+PSB0aHJlc2hvbGQpIHJldHVybiAzMDAwO1xuICAgIGNvbnN0IGVuZXJneU5lZWRlZCA9IHRocmVzaG9sZCAtIHN0YXRlLmN1cnJlbnRFbmVyZ3k7XG4gICAgY29uc3QgcmVnZW5SYXRlID0gc3RhdGUucmVnZW5SYXRlIHx8IGdldFJlZ2lvbkhlYWx0aEJvbnVzKCkgfHwgMS4wO1xuICAgIHN0YXRlLnJlZ2VuUmF0ZSA9IHJlZ2VuUmF0ZTtcbiAgICBjb25zdCBtc05lZWRlZCA9IChlbmVyZ3lOZWVkZWQgLyByZWdlblJhdGUpICogNjAwMDA7XG4gICAgY29uc3Qgaml0dGVyID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogNzAwMCkgKyAzMDAwO1xuICAgIHJldHVybiBNYXRoLnJvdW5kKG1zTmVlZGVkICsgaml0dGVyKTtcbn1cblxuLyoqIEBwYXJhbSB7b2JqZWN0fSBzdGF0ZSBAcGFyYW0ge29iamVjdH0gQ09ORklHIEByZXR1cm5zIHtzdHJpbmd9ICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0TGl2ZUNvdW50ZG93bihzdGF0ZSwgQ09ORklHKSB7XG4gICAgaWYgKGlzU2xlZXBUaW1lKENPTkZJRykpIHJldHVybiAn8J+MmSBUaWR1cic7XG4gICAgY29uc3QgdGhyZXNob2xkID0gQ09ORklHLmVuZXJneVRocmVzaG9sZCB8fCAxMDtcbiAgICBjb25zdCBjdXJFbmVyZ3kgPSBzdGF0ZS5jdXJyZW50RW5lcmd5ID8/IDA7XG4gICAgaWYgKGN1ckVuZXJneSA+PSB0aHJlc2hvbGQpIHJldHVybiAnTm93ISc7XG4gICAgbGV0IHJlbWFpbmluZyA9IChzdGF0ZS5uZXh0V29ya1RpbWVzdGFtcCB8fCAwKSAtIERhdGUubm93KCk7XG4gICAgaWYgKCFzdGF0ZS5uZXh0V29ya1RpbWVzdGFtcCAmJiBjdXJFbmVyZ3kgPCB0aHJlc2hvbGQpIHtcbiAgICAgICAgY29uc3QgcmVnZW5SYXRlID0gc3RhdGUucmVnZW5SYXRlIHx8IDEuMDtcbiAgICAgICAgcmVtYWluaW5nID0gTWF0aC5tYXgoMSwgKHRocmVzaG9sZCAtIGN1ckVuZXJneSkgLyByZWdlblJhdGUpICogNjAwMDA7XG4gICAgfVxuICAgIGlmIChyZW1haW5pbmcgPD0gMCkgcmV0dXJuICdNZW51bmdndSBlbmVyZ2kuLi4nO1xuICAgIGNvbnN0IHRvdGFsID0gTWF0aC5jZWlsKHJlbWFpbmluZyAvIDEwMDApO1xuICAgIHJldHVybiBgJHtNYXRoLmZsb29yKHRvdGFsIC8gNjApfW0gJHtTdHJpbmcodG90YWwgJSA2MCkucGFkU3RhcnQoMiwgJzAnKX1zYDtcbn1cblxuLyoqIEBwYXJhbSB7b2JqZWN0fSBzdGF0ZSBAcmV0dXJucyB7c3RyaW5nfSAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldFRpbWVUb0Z1bGxFbmVyZ3koc3RhdGUpIHtcbiAgICBjb25zdCBuZWVkZWQgPSBzdGF0ZS5tYXhFbmVyZ3kgLSBzdGF0ZS5jdXJyZW50RW5lcmd5O1xuICAgIGlmIChuZWVkZWQgPD0gMCkgcmV0dXJuICdQZW51aCEnO1xuICAgIGNvbnN0IHJlZ2VuUmF0ZSA9IHN0YXRlLnJlZ2VuUmF0ZSB8fCAxLjA7XG4gICAgY29uc3QgbWludXRlcyA9IE1hdGguY2VpbChuZWVkZWQgLyByZWdlblJhdGUpO1xuICAgIGlmIChtaW51dGVzIDwgNjApIHJldHVybiBgfiR7bWludXRlc31tYDtcbiAgICBjb25zdCBoID0gTWF0aC5mbG9vcihtaW51dGVzIC8gNjApLCBtID0gbWludXRlcyAlIDYwO1xuICAgIGlmIChoIDwgMjQpIHJldHVybiBgfiR7aH1oICR7bX1tYDtcbiAgICBjb25zdCBkID0gTWF0aC5mbG9vcihoIC8gMjQpO1xuICAgIHJldHVybiBgfiR7ZH1kICR7aCAlIDI0fWhgO1xufVxuXG5sZXQgX3BsYXllckxldmVsTGFzdFNjYW4gPSAwO1xuXG4vKiogQHBhcmFtIHtvYmplY3R9IHN0YXRlIEByZXR1cm5zIHtudW1iZXJ9ICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0UGxheWVyTGV2ZWwoc3RhdGUpIHtcbiAgICBpZiAoRGF0ZS5ub3coKSAtIF9wbGF5ZXJMZXZlbExhc3RTY2FuIDwgMTAwMDApIHJldHVybiBzdGF0ZS5wbGF5ZXJMZXZlbDtcbiAgICBfcGxheWVyTGV2ZWxMYXN0U2NhbiA9IERhdGUubm93KCk7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgd2Fsa2VyID0gZG9jdW1lbnQuY3JlYXRlVHJlZVdhbGtlcihkb2N1bWVudC5ib2R5IHx8IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCwgTm9kZUZpbHRlci5TSE9XX1RFWFQpO1xuICAgICAgICBsZXQgbm9kZTtcbiAgICAgICAgd2hpbGUgKChub2RlID0gd2Fsa2VyLm5leHROb2RlKCkpKSB7XG4gICAgICAgICAgICBjb25zdCBtID0gbm9kZS50ZXh0Q29udGVudC50cmltKCkubWF0Y2goL15MZXZlbFxccysoXFxkKykkL2kpO1xuICAgICAgICAgICAgaWYgKG0pIHJldHVybiBwYXJzZUludChtWzFdLCAxMCk7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cbiAgICByZXR1cm4gc3RhdGUucGxheWVyTGV2ZWw7XG59XG5cbi8qKiBAcGFyYW0ge251bWJlcn0gbGV2ZWwgQHJldHVybnMge251bWJlcn0gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRNYXhFbmVyZ3lGb3JMZXZlbChsZXZlbCkge1xuICAgIHJldHVybiBNYXRoLm1pbigzMDAsIDEwMCArIDUgKiAobGV2ZWwgLSAxKSk7XG59XG5cbmxldCBfbGFzdFBhdGNoZWRDdXJyZW50ID0gbnVsbDtcbmxldCBfbGFzdFBhdGNoZWRNYXggPSBudWxsO1xubGV0IF9sYXN0UGF0Y2hUaW1lID0gMDtcblxuLyoqXG4gKiBTYWZlbHkgdXBkYXRlcyB0aGUgdmlzdWFsIGVuZXJneSBpbmRpY2F0b3JzIG9uIHRoZSBob3N0IHBhZ2UgKHRvcCBuYXZpZ2F0aW9uIHBpbGwsXG4gKiBkYXNoYm9hcmQgXCJFTkVSR0lcIiBjYXJkLCBwcm9ncmVzcyBiYXIsIGFuZCBcIktFUkpBS0FOIFNBVFUgR0lMSVJBTlwiIGJ1dHRvbiBzdGF0ZSkuXG4gKiBcbiAqIE1vZGlmaWVzIHRleHQgdmFsdWVzIHZpYSBleGlzdGluZyB0ZXh0IG5vZGVzIChub2RlLm5vZGVWYWx1ZSkgYW5kIGVsZW1lbnQgc3R5bGVzXG4gKiB3aXRob3V0IGRlc3Ryb3lpbmcgb3IgcmVwbGFjaW5nIFJlYWN0IERPTSBlbGVtZW50cy5cbiAqIFxuICogQHBhcmFtIHtudW1iZXJ9IGN1cnJlbnRcbiAqIEBwYXJhbSB7bnVtYmVyfSBbbWF4XVxuICogQHBhcmFtIHtib29sZWFufSBbZm9yY2U9ZmFsc2VdXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXRjaFBhZ2VWaXN1YWxFbmVyZ3koY3VycmVudCwgbWF4LCBmb3JjZSA9IGZhbHNlKSB7XG4gICAgaWYgKHR5cGVvZiBkb2N1bWVudCA9PT0gJ3VuZGVmaW5lZCcpIHJldHVybjtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBzYWZlQ3VycmVudCA9IE1hdGgubWF4KDAsIE1hdGgucm91bmQoY3VycmVudCkpO1xuICAgICAgICBjb25zdCBzYWZlTWF4ID0gKHR5cGVvZiBtYXggPT09ICdudW1iZXInICYmIG1heCA+IDApID8gTWF0aC5yb3VuZChtYXgpIDogMTE1O1xuICAgICAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXG4gICAgICAgIC8vIFRocm90dGxlIHJlZHVuZGFudCBjYWxscyBpZiBlbmVyZ3kgaGFzbid0IGNoYW5nZWQgd2l0aGluIDEwMDBtc1xuICAgICAgICBpZiAoIWZvcmNlICYmIHNhZmVDdXJyZW50ID09PSBfbGFzdFBhdGNoZWRDdXJyZW50ICYmIHNhZmVNYXggPT09IF9sYXN0UGF0Y2hlZE1heCAmJiAobm93IC0gX2xhc3RQYXRjaFRpbWUgPCAxMDAwKSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIF9sYXN0UGF0Y2hlZEN1cnJlbnQgPSBzYWZlQ3VycmVudDtcbiAgICAgICAgX2xhc3RQYXRjaGVkTWF4ID0gc2FmZU1heDtcbiAgICAgICAgX2xhc3RQYXRjaFRpbWUgPSBub3c7XG5cbiAgICAgICAgY29uc3QgcGN0ID0gTWF0aC5taW4oMTAwLCBNYXRoLm1heCgwLCAoc2FmZUN1cnJlbnQgLyBzYWZlTWF4KSAqIDEwMCkpLnRvRml4ZWQoMSk7XG5cbiAgICAgICAgY29uc3QgRk9SQklEREVOX1dPUkRTID0gLyg/OktFU0VIQVRBTnxQRU5ESURJS0FOfE1JTElURVJ8SU5EVVNUUkl8TElTVFJJS3xLQVBBU0lUQVN8TUlTSXxLRU1BSlVBTnxLRUtVQVRBTnxFS09OT01JfEtPVEF8SU5GUkFTVFJVS1RVUnxQQVNBUnxCQVJBTkcpL2k7XG5cbiAgICAgICAgY29uc3QgaXNFeGNsdWRlZCA9IGVsID0+IHtcbiAgICAgICAgICAgIGlmICghZWwpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgaWYgKGVsLmNsb3Nlc3QoJyNhdy1wYW5lbCwgI2F3LXNldHRpbmdzLW1vZGFsLCAjYXctYW5hbHl0aWNzLW1vZGFsLCAjYXctbG9nLW1vZGFsLCAjYXctbm90aWZpY2F0aW9uLXRvYXN0JykpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgY29uc3QgY29udGFpbmVyID0gZWwuY2xvc2VzdCgnZGl2LCBzZWN0aW9uLCBhcnRpY2xlJyk7XG4gICAgICAgICAgICBpZiAoY29udGFpbmVyKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdGV4dCA9IGNvbnRhaW5lci50ZXh0Q29udGVudCB8fCAnJztcbiAgICAgICAgICAgICAgICBpZiAoRk9SQklEREVOX1dPUkRTLnRlc3QodGV4dCkgJiYgIS9eXFxzKuKaoT9cXHMqRU5FUkdJXFxiL2kudGVzdCh0ZXh0KSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH07XG5cbiAgICAgICAgZnVuY3Rpb24gcGF0Y2hUZXh0SW5FbGVtZW50KGVsKSB7XG4gICAgICAgICAgICBjb25zdCB3YWxrZXIgPSBkb2N1bWVudC5jcmVhdGVUcmVlV2Fsa2VyKGVsLCBOb2RlRmlsdGVyLlNIT1dfVEVYVCk7XG4gICAgICAgICAgICBsZXQgbm9kZTtcbiAgICAgICAgICAgIGxldCBwYXRjaGVkID0gZmFsc2U7XG4gICAgICAgICAgICB3aGlsZSAoKG5vZGUgPSB3YWxrZXIubmV4dE5vZGUoKSkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB2YWwgPSBub2RlLm5vZGVWYWx1ZSB8fCAnJztcbiAgICAgICAgICAgICAgICBpZiAodmFsLmluY2x1ZGVzKCcvJykgJiYgL1xcZCtcXHMqXFwvXFxzKlxcZCsvLnRlc3QodmFsKSkge1xuICAgICAgICAgICAgICAgICAgICBub2RlLm5vZGVWYWx1ZSA9IHZhbC5yZXBsYWNlKC8oXFxkKykoXFxzKlxcL1xccyopKFxcZCspLywgKG1hdGNoLCBwMSwgcDIsIHAzKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtTWF4ID0gcGFyc2VJbnQocDMsIDEwKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChtTWF4ID49IDUwICYmIG1NYXggPD0gMzUwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGF0Y2hlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGAke3NhZmVDdXJyZW50fSR7cDJ9JHtzYWZlTWF4IHx8IG1NYXh9YDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBtYXRjaDtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFwYXRjaGVkKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdGV4dCA9IChlbC50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpO1xuICAgICAgICAgICAgICAgIGNvbnN0IG0gPSB0ZXh0Lm1hdGNoKC9eKFxcZCspKFxccypcXC9cXHMqKShcXGQrKSQvKTtcbiAgICAgICAgICAgICAgICBpZiAobSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtTWF4ID0gcGFyc2VJbnQobVszXSwgMTApO1xuICAgICAgICAgICAgICAgICAgICBpZiAobU1heCA+PSA1MCAmJiBtTWF4IDw9IDM1MCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgd2Fsa2VyMiA9IGRvY3VtZW50LmNyZWF0ZVRyZWVXYWxrZXIoZWwsIE5vZGVGaWx0ZXIuU0hPV19URVhUKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBmaXJzdFRleHROb2RlID0gd2Fsa2VyMi5uZXh0Tm9kZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGZpcnN0VGV4dE5vZGUgJiYgL15cXGQrJC8udGVzdChmaXJzdFRleHROb2RlLm5vZGVWYWx1ZT8udHJpbSgpIHx8ICcnKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZpcnN0VGV4dE5vZGUubm9kZVZhbHVlID0gU3RyaW5nKHNhZmVDdXJyZW50KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIDEuIERhc2hib2FyZCBcIkVORVJHSVwiIGNhcmQgT05MWSAoU3RyaWN0bHkgaXNvbGF0ZWQsIG5ldmVyIHRvdWNoaW5nIGFuY2VzdG9yIGNvbnRhaW5lcnMpXG4gICAgICAgIGNvbnN0IGVuZXJneUhlYWRlcnMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdoMSwgaDIsIGgzLCBoNCwgaDUsIGg2LCBzcGFuLCBkaXYsIHAnKTtcbiAgICAgICAgZm9yIChjb25zdCBoIG9mIGVuZXJneUhlYWRlcnMpIHtcbiAgICAgICAgICAgIGlmIChpc0V4Y2x1ZGVkKGgpKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IHQgPSAoaC50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpO1xuICAgICAgICAgICAgaWYgKC9e4pqhP1xccyooPzpFTkVSR0l8RU5FUkdZKVxcYi9pLnRlc3QodCkgJiYgdC5sZW5ndGggPD0gMTUpIHtcbiAgICAgICAgICAgICAgICBsZXQgY2FyZCA9IGgucGFyZW50RWxlbWVudDtcbiAgICAgICAgICAgICAgICB3aGlsZSAoY2FyZCAmJiBjYXJkICE9PSBkb2N1bWVudC5ib2R5KSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNhcmRUZXh0ID0gKGNhcmQudGV4dENvbnRlbnQgfHwgJycpLnRyaW0oKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gU1RPUCBpZiBpdCBibGVlZHMgaW50byBvdGhlciBkYXNoYm9hcmQgY2FyZHMgb3Igd2lkZ2V0cyFcbiAgICAgICAgICAgICAgICAgICAgaWYgKEZPUkJJRERFTl9XT1JEUy50ZXN0KGNhcmRUZXh0KSkgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gVGhlIHJlYWwgZW5lcmd5IGNhcmQgY29udGFpbnMgdGhlIGVuZXJneSBudW1iZXJzIChlLmcuIDc0LzExNSkgYW5kIGhhcyBzaG9ydCB0ZXh0ICg8IDEyMCBjaGFycylcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNhcmRUZXh0LmluY2x1ZGVzKCcvJykgJiYgL1xcZCtcXHMqXFwvXFxzKlxcZCsvLnRlc3QoY2FyZFRleHQpICYmIGNhcmRUZXh0Lmxlbmd0aCA8IDEyMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gUGF0Y2ggb25seSB0ZXh0IG5vZGVzIHdpdGggXFxkKy9cXGQrIGluc2lkZSB0aGlzIGV4YWN0IGVuZXJneSBjYXJkXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBpbm5lckVscyA9IGNhcmQucXVlcnlTZWxlY3RvckFsbCgnKicpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBlbCBvZiBpbm5lckVscykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpc0V4Y2x1ZGVkKGVsKSkgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdHh0ID0gKGVsLnRleHRDb250ZW50IHx8ICcnKS50cmltKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHR4dC5pbmNsdWRlcygnLycpICYmIHR4dC5sZW5ndGggPD0gMjUgJiYgL1xcZCtcXHMqXFwvXFxzKlxcZCsvLnRlc3QodHh0KSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXRjaFRleHRJbkVsZW1lbnQoZWwpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gUGF0Y2ggT05MWSB0aGUgcHJvZ3Jlc3MgYmFyIGluc2lkZSB0aGlzIGlzb2xhdGVkIGVuZXJneSBjYXJkXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBiYXJzID0gY2FyZC5xdWVyeVNlbGVjdG9yQWxsKCdbcm9sZT1cInByb2dyZXNzYmFyXCJdLCBkaXZbc3R5bGUqPVwid2lkdGhcIl0sIHNwYW5bc3R5bGUqPVwid2lkdGhcIl0nKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgYmFyIG9mIGJhcnMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoaXNFeGNsdWRlZChiYXIpKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoYmFyLnN0eWxlLndpZHRoICYmIGJhci5zdHlsZS53aWR0aC5pbmNsdWRlcygnJScpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJhci5zdHlsZS53aWR0aCA9IGAke3BjdH0lYDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGJhci5oYXNBdHRyaWJ1dGUoJ2FyaWEtdmFsdWVub3cnKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBiYXIuc2V0QXR0cmlidXRlKCdhcmlhLXZhbHVlbm93JywgU3RyaW5nKHNhZmVDdXJyZW50KSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChiYXIuaGFzQXR0cmlidXRlKCdhcmlhLXZhbHVlbWF4JykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYmFyLnNldEF0dHJpYnV0ZSgnYXJpYS12YWx1ZW1heCcsIFN0cmluZyhzYWZlTWF4KSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7IC8vIFN0b3AgaW1tZWRpYXRlbHkgYWZ0ZXIgcGF0Y2hpbmcgdGhlIGlzb2xhdGVkIGVuZXJneSBjYXJkXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY2FyZCA9IGNhcmQucGFyZW50RWxlbWVudDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyAyLiBUb3AgTmF2aWdhdGlvbiBCYXIgZW5lcmd5IHBpbGwgT05MWSAoVGV4dCBvbmx5LCBORVZFUiB0b3VjaCBwcm9ncmVzcyBiYXJzKVxuICAgICAgICBjb25zdCB0b3BDYW5kaWRhdGVzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnaGVhZGVyLCBuYXYsIFtyb2xlPVwiYmFubmVyXCJdLCBbY2xhc3MqPVwibmF2XCIgaV0sIFtjbGFzcyo9XCJoZWFkZXJcIiBpXSwgW2NsYXNzKj1cInRvcGJhclwiIGldLCBbY2xhc3MqPVwibmF2YmFyXCIgaV0nKTtcbiAgICAgICAgZm9yIChjb25zdCBjb250YWluZXIgb2YgdG9wQ2FuZGlkYXRlcykge1xuICAgICAgICAgICAgaWYgKGlzRXhjbHVkZWQoY29udGFpbmVyKSkgY29udGludWU7XG4gICAgICAgICAgICBjb25zdCBlbHMgPSBjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnKicpO1xuICAgICAgICAgICAgZm9yIChjb25zdCBlbCBvZiBlbHMpIHtcbiAgICAgICAgICAgICAgICBpZiAoaXNFeGNsdWRlZChlbCkpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIGNvbnN0IHR4dCA9IChlbC50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpO1xuICAgICAgICAgICAgICAgIGlmICh0eHQuaW5jbHVkZXMoJy8nKSAmJiB0eHQubGVuZ3RoIDw9IDMwICYmIC9cXGQrXFxzKlxcL1xccypcXGQrLy50ZXN0KHR4dCkpIHtcbiAgICAgICAgICAgICAgICAgICAgcGF0Y2hUZXh0SW5FbGVtZW50KGVsKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyAzLiBXb3JrIGJ1dHRvbiB2aXN1YWwgc3RhdGVcbiAgICAgICAgY29uc3QgYnV0dG9ucyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2J1dHRvbicpO1xuICAgICAgICBmb3IgKGNvbnN0IGJ0biBvZiBidXR0b25zKSB7XG4gICAgICAgICAgICBpZiAoaXNFeGNsdWRlZChidG4pKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IGJ0blRleHQgPSAoYnRuLnRleHRDb250ZW50IHx8ICcnKS50cmltKCk7XG4gICAgICAgICAgICBpZiAoL0tFUkpBS0FOXFxzK1NBVFVcXHMrR0lMSVJBTi9pLnRlc3QoYnRuVGV4dCkpIHtcbiAgICAgICAgICAgICAgICBpZiAoc2FmZUN1cnJlbnQgPCAxMCkge1xuICAgICAgICAgICAgICAgICAgICBidG4uc3R5bGUub3BhY2l0eSA9ICcwLjU1JztcbiAgICAgICAgICAgICAgICAgICAgYnRuLnN0eWxlLmZpbHRlciA9ICdncmF5c2NhbGUoMC42KSc7XG4gICAgICAgICAgICAgICAgICAgIGJ0bi50aXRsZSA9IGBFbmVyZ2kgc2FhdCBpbmkgJHtzYWZlQ3VycmVudH0vJHtzYWZlTWF4feKaoSAoYnV0dWggbWluaW1hbCAxMOKaoSB1bnR1ayBnaWxpcmFuIGtlcmphKWA7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgYnRuLnN0eWxlLm9wYWNpdHkgPSAnMSc7XG4gICAgICAgICAgICAgICAgICAgIGJ0bi5zdHlsZS5maWx0ZXIgPSAnbm9uZSc7XG4gICAgICAgICAgICAgICAgICAgIGJ0bi50aXRsZSA9ICcnO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxufVxuXG5cbiIsIi8qKlxuICogbm90aWZpY2F0aW9ucy5qcyDigJQgU291bmQgYWxlcnRzLCB0b2FzdCBub3RpZmljYXRpb25zLCBhbmQgYnJvd3NlciBub3RpZmljYXRpb25zXG4gKlxuICogUmVwbGFjZXMgR01fbm90aWZpY2F0aW9uIHdpdGggY2hyb21lLm5vdGlmaWNhdGlvbnMgQVBJLlxuICovXG5cbmxldCB0b2FzdFRpbWVyID0gbnVsbDtcblxuLyoqIENyZWF0ZXMgb3IgdXBkYXRlcyB0aGUgdG9hc3Qgbm90aWZpY2F0aW9uIGVsZW1lbnQuICovXG5leHBvcnQgZnVuY3Rpb24gc2hvd0luUGFnZU5vdGlmaWNhdGlvbih0aXRsZSwgbWVzc2FnZSkge1xuICAgIGlmICghZG9jdW1lbnQuYm9keSkgcmV0dXJuO1xuICAgIGxldCB0b2FzdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1ub3RpZmljYXRpb24tdG9hc3QnKTtcbiAgICBpZiAoIXRvYXN0KSB7XG4gICAgICAgIHRvYXN0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICAgIHRvYXN0LmlkID0gJ2F3LW5vdGlmaWNhdGlvbi10b2FzdCc7XG4gICAgICAgIHRvYXN0LnNldEF0dHJpYnV0ZSgncm9sZScsICdzdGF0dXMnKTtcbiAgICAgICAgdG9hc3Quc2V0QXR0cmlidXRlKCdhcmlhLWxpdmUnLCAncG9saXRlJyk7XG4gICAgICAgIHRvYXN0LnN0eWxlLmNzc1RleHQgPSBbXG4gICAgICAgICAgICAncG9zaXRpb246Zml4ZWQnLCAndG9wOjE2cHgnLCAncmlnaHQ6MTZweCcsICd6LWluZGV4OjEwMDAxMCcsXG4gICAgICAgICAgICAnZGlzcGxheTpub25lJywgJ3dpZHRoOm1pbigzNjBweCxjYWxjKDEwMHZ3IC0gMzJweCkpJywgJ3BhZGRpbmc6MTJweCAxNHB4JyxcbiAgICAgICAgICAgICdiYWNrZ3JvdW5kOnJnYmEoMTAsMTAsMjAsLjk3KScsICdib3JkZXI6MXB4IHNvbGlkICMwMGFhZmYnLFxuICAgICAgICAgICAgJ2JvcmRlci1sZWZ0OjRweCBzb2xpZCAjMDBlOTlhJywgJ2JvcmRlci1yYWRpdXM6NnB4JyxcbiAgICAgICAgICAgICdib3gtc2hhZG93OjAgNnB4IDI0cHggcmdiYSgwLDAsMCwuNTUpJywgJ2NvbG9yOiNlZWUnLFxuICAgICAgICAgICAgJ2ZvbnQ6MTJweC8xLjQ1IFNlZ29lIFVJLFRhaG9tYSxzYW5zLXNlcmlmJywgJ3BvaW50ZXItZXZlbnRzOm5vbmUnXG4gICAgICAgIF0uam9pbignOycpO1xuICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHRvYXN0KTtcbiAgICB9XG5cbiAgICBjb25zdCBoZWFkaW5nID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgaGVhZGluZy50ZXh0Q29udGVudCA9IHRpdGxlO1xuICAgIGhlYWRpbmcuc3R5bGUuY3NzVGV4dCA9ICdmb250LXdlaWdodDo3MDA7Y29sb3I6IzAwZTk5YTttYXJnaW4tYm90dG9tOjNweDsnO1xuICAgIGNvbnN0IGRldGFpbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIGRldGFpbC50ZXh0Q29udGVudCA9IG1lc3NhZ2U7XG4gICAgZGV0YWlsLnN0eWxlLmNvbG9yID0gJyNkZGQnO1xuICAgIHRvYXN0LnJlcGxhY2VDaGlsZHJlbihoZWFkaW5nLCBkZXRhaWwpO1xuICAgIHRvYXN0LnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuXG4gICAgaWYgKHRvYXN0VGltZXIgIT09IG51bGwpIGNsZWFyVGltZW91dCh0b2FzdFRpbWVyKTtcbiAgICB0b2FzdFRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7IHRvYXN0LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7IHRvYXN0VGltZXIgPSBudWxsOyB9LCA2MDAwKTtcbn1cblxuLyoqXG4gKiBTZW5kcyBhIHRvYXN0ICsgY2hyb21lLm5vdGlmaWNhdGlvbnMgKHJlcGxhY2VzIEdNX25vdGlmaWNhdGlvbikuXG4gKiBTdXBwb3J0cyBib3RoIHNlbmROb3RpZmljYXRpb24oQ09ORklHLCB0aXRsZSwgbWVzc2FnZSkgYW5kIHNlbmROb3RpZmljYXRpb24odGl0bGUsIG1lc3NhZ2UpLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2VuZE5vdGlmaWNhdGlvbihhcmcxLCBhcmcyLCBhcmczKSB7XG4gICAgbGV0IENPTkZJRyA9IG51bGwsIHRpdGxlID0gJycsIG1lc3NhZ2UgPSAnJztcbiAgICBpZiAodHlwZW9mIGFyZzEgPT09ICdvYmplY3QnICYmIGFyZzEgIT09IG51bGwpIHtcbiAgICAgICAgQ09ORklHID0gYXJnMTtcbiAgICAgICAgdGl0bGUgPSB0eXBlb2YgYXJnMiA9PT0gJ3N0cmluZycgPyBhcmcyIDogU3RyaW5nKGFyZzIgfHwgJycpO1xuICAgICAgICBtZXNzYWdlID0gdHlwZW9mIGFyZzMgPT09ICdzdHJpbmcnID8gYXJnMyA6IFN0cmluZyhhcmczIHx8ICcnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aXRsZSA9IHR5cGVvZiBhcmcxID09PSAnc3RyaW5nJyA/IGFyZzEgOiBTdHJpbmcoYXJnMSB8fCAnJyk7XG4gICAgICAgIG1lc3NhZ2UgPSB0eXBlb2YgYXJnMiA9PT0gJ3N0cmluZycgPyBhcmcyIDogU3RyaW5nKGFyZzIgfHwgJycpO1xuICAgIH1cblxuICAgIGlmIChDT05GSUcgJiYgIUNPTkZJRy5zZW5kTm90aWZpY2F0aW9uKSByZXR1cm47XG4gICAgc2hvd0luUGFnZU5vdGlmaWNhdGlvbih0aXRsZSwgbWVzc2FnZSk7XG5cbiAgICB0cnkge1xuICAgICAgICBjb25zdCBpc0NyaXRpY2FsID0gL2V4cGlyZWR8NDAxfGhhYmlzfGthZGFsdWFyc2F8ZGlqZWRhfGxvZ2luL2kudGVzdChgJHt0aXRsZX0gJHttZXNzYWdlfWApO1xuICAgICAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICAgICAgICB0eXBlOiAnTk9USUZZJyxcbiAgICAgICAgICAgIHRpdGxlLFxuICAgICAgICAgICAgbWVzc2FnZSxcbiAgICAgICAgICAgIHByaW9yaXR5OiBpc0NyaXRpY2FsID8gMiA6IDEsXG4gICAgICAgICAgICByZXF1aXJlSW50ZXJhY3Rpb246IGlzQ3JpdGljYWxcbiAgICAgICAgfSk7XG4gICAgfSBjYXRjaCB7IC8qIGV4dGVuc2lvbiBjb250ZXh0IG1heSBiZSBpbnZhbGlkYXRlZCAqLyB9XG59XG5cbi8qKlxuICogUGxheXMgc291bmQgZmVlZGJhY2sgZm9yIHN1Y2Nlc3Mgb3IgZXJyb3IuXG4gKiBTdXBwb3J0cyBib3RoIHBsYXlOb3RpZmljYXRpb25Tb3VuZChDT05GSUcsIHR5cGUpIGFuZCBwbGF5Tm90aWZpY2F0aW9uU291bmQodHlwZSkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwbGF5Tm90aWZpY2F0aW9uU291bmQoYXJnMSwgYXJnMikge1xuICAgIGxldCBDT05GSUcgPSBudWxsLCB0eXBlID0gJ3N1Y2Nlc3MnO1xuICAgIGlmICh0eXBlb2YgYXJnMSA9PT0gJ29iamVjdCcgJiYgYXJnMSAhPT0gbnVsbCkge1xuICAgICAgICBDT05GSUcgPSBhcmcxO1xuICAgICAgICB0eXBlID0gdHlwZW9mIGFyZzIgPT09ICdzdHJpbmcnID8gYXJnMiA6ICdzdWNjZXNzJztcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBhcmcxID09PSAnc3RyaW5nJykge1xuICAgICAgICB0eXBlID0gYXJnMTtcbiAgICAgICAgaWYgKHR5cGVvZiBhcmcyID09PSAnb2JqZWN0JyAmJiBhcmcyICE9PSBudWxsKSB7XG4gICAgICAgICAgICBDT05GSUcgPSBhcmcyO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKENPTkZJRyAmJiAhQ09ORklHLnNvdW5kTm90aWZpY2F0aW9uRW5hYmxlZCkgcmV0dXJuO1xuICAgIC8vIEF2b2lkIHRyaWdnZXJpbmcgQXVkaW9Db250ZXh0IG9uIGhpZGRlbiBiYWNrZ3JvdW5kIHRhYnMgdG8gcmVzcGVjdCBicm93c2VyIGF1dG9wbGF5IHBvbGljeVxuICAgIGlmICh0eXBlb2YgZG9jdW1lbnQgIT09ICd1bmRlZmluZWQnICYmIGRvY3VtZW50LmhpZGRlbikgcmV0dXJuO1xuXG4gICAgY29uc3Qgdm9sdW1lID0gQ09ORklHPy5zb3VuZE5vdGlmaWNhdGlvblZvbHVtZSAhPSBudWxsID8gQ09ORklHLnNvdW5kTm90aWZpY2F0aW9uVm9sdW1lIDogMC4zO1xuXG4gICAgY29uc3QgQXVkaW9DdHggPSB3aW5kb3cuQXVkaW9Db250ZXh0IHx8IHdpbmRvdy53ZWJraXRBdWRpb0NvbnRleHQ7XG4gICAgaWYgKCFBdWRpb0N0eCkgcmV0dXJuO1xuXG4gICAgbGV0IGN0eCA9IG51bGw7XG4gICAgdHJ5IHtcbiAgICAgICAgY3R4ID0gbmV3IEF1ZGlvQ3R4KCk7XG4gICAgICAgIGlmIChjdHguc3RhdGUgPT09ICdzdXNwZW5kZWQnKSB7XG4gICAgICAgICAgICBjdHgucmVzdW1lKCkuY2F0Y2goKCkgPT4ge30pO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3Qgb3NjID0gY3R4LmNyZWF0ZU9zY2lsbGF0b3IoKTtcbiAgICAgICAgY29uc3QgZ2FpbiA9IGN0eC5jcmVhdGVHYWluKCk7XG4gICAgICAgIG9zYy5jb25uZWN0KGdhaW4pO1xuICAgICAgICBnYWluLmNvbm5lY3QoY3R4LmRlc3RpbmF0aW9uKTtcbiAgICAgICAgZ2Fpbi5nYWluLnZhbHVlID0gdm9sdW1lO1xuXG4gICAgICAgIGlmICh0eXBlID09PSAnc3VjY2VzcycpIHtcbiAgICAgICAgICAgIG9zYy5mcmVxdWVuY3kudmFsdWUgPSA4MDA7XG4gICAgICAgICAgICBvc2Muc3RhcnQoKTtcbiAgICAgICAgICAgIG9zYy5zdG9wKGN0eC5jdXJyZW50VGltZSArIDAuMSk7XG4gICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBvMiA9IGN0eC5jcmVhdGVPc2NpbGxhdG9yKCksIGcyID0gY3R4LmNyZWF0ZUdhaW4oKTtcbiAgICAgICAgICAgICAgICAgICAgbzIuY29ubmVjdChnMik7IGcyLmNvbm5lY3QoY3R4LmRlc3RpbmF0aW9uKTtcbiAgICAgICAgICAgICAgICAgICAgZzIuZ2Fpbi52YWx1ZSA9IHZvbHVtZTtcbiAgICAgICAgICAgICAgICAgICAgbzIuZnJlcXVlbmN5LnZhbHVlID0gMTAwMDtcbiAgICAgICAgICAgICAgICAgICAgbzIuc3RhcnQoKTsgbzIuc3RvcChjdHguY3VycmVudFRpbWUgKyAwLjEpO1xuICAgICAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IGN0eC5jbG9zZSgpLmNhdGNoKCgpID0+IHt9KSwgMTUwKTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIHsgdHJ5IHsgY3R4LmNsb3NlKCkuY2F0Y2goKCkgPT4ge30pOyB9IGNhdGNoIHsgLyogaWdub3JlICovIH0gfVxuICAgICAgICAgICAgfSwgMTAwKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIG9zYy5mcmVxdWVuY3kudmFsdWUgPSAyMDA7XG4gICAgICAgICAgICBvc2Muc3RhcnQoKTsgb3NjLnN0b3AoY3R4LmN1cnJlbnRUaW1lICsgMC4zKTtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4gY3R4LmNsb3NlKCkuY2F0Y2goKCkgPT4ge30pLCA0MDApO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIHRyeSB7IGN0eD8uY2xvc2UoKS5jYXRjaCgoKSA9PiB7fSk7IH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuICAgIH1cbn1cblxuLyoqXG4gKiBQbGF5cyB0aGUgZnVsbC1lbmVyZ3kgY2hpbWUgc2VxdWVuY2UuXG4gKiBTdXBwb3J0cyBib3RoIHBsYXlFbmVyZ3lGdWxsQWxhcm0oQ09ORklHKSBhbmQgcGxheUVuZXJneUZ1bGxBbGFybSgpLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcGxheUVuZXJneUZ1bGxBbGFybShDT05GSUcgPSBudWxsKSB7XG4gICAgaWYgKENPTkZJRyAmJiAhQ09ORklHLmVuZXJneUZ1bGxBbGVydFNvdW5kRW5hYmxlZCkgcmV0dXJuO1xuICAgIGlmICh0eXBlb2YgZG9jdW1lbnQgIT09ICd1bmRlZmluZWQnICYmIGRvY3VtZW50LmhpZGRlbikgcmV0dXJuO1xuXG4gICAgY29uc3Qgdm9sdW1lID0gQ09ORklHPy5lbmVyZ3lGdWxsQWxlcnRWb2x1bWUgIT0gbnVsbCA/IENPTkZJRy5lbmVyZ3lGdWxsQWxlcnRWb2x1bWUgOiAwLjM7XG5cbiAgICBjb25zdCBBdWRpb0N0eCA9IHdpbmRvdy5BdWRpb0NvbnRleHQgfHwgd2luZG93LndlYmtpdEF1ZGlvQ29udGV4dDtcbiAgICBpZiAoIUF1ZGlvQ3R4KSByZXR1cm47XG5cbiAgICBsZXQgY3R4ID0gbnVsbDtcbiAgICB0cnkge1xuICAgICAgICBjdHggPSBuZXcgQXVkaW9DdHgoKTtcbiAgICAgICAgaWYgKGN0eC5zdGF0ZSA9PT0gJ3N1c3BlbmRlZCcpIHtcbiAgICAgICAgICAgIGN0eC5yZXN1bWUoKS5jYXRjaCgoKSA9PiB7fSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgc3RhcnQgPSBjdHguY3VycmVudFRpbWU7XG4gICAgICAgIFs2NjAsIDg4MCwgMTEwMF0uZm9yRWFjaCgoZnJlcSwgaSkgPT4ge1xuICAgICAgICAgICAgY29uc3Qgb3NjID0gY3R4LmNyZWF0ZU9zY2lsbGF0b3IoKSwgZyA9IGN0eC5jcmVhdGVHYWluKCk7XG4gICAgICAgICAgICBjb25zdCB0ID0gc3RhcnQgKyBpICogMC4xODtcbiAgICAgICAgICAgIG9zYy50eXBlID0gJ3NpbmUnOyBvc2MuZnJlcXVlbmN5LnZhbHVlID0gZnJlcTtcbiAgICAgICAgICAgIGcuZ2Fpbi52YWx1ZSA9IHZvbHVtZTtcbiAgICAgICAgICAgIG9zYy5jb25uZWN0KGcpOyBnLmNvbm5lY3QoY3R4LmRlc3RpbmF0aW9uKTtcbiAgICAgICAgICAgIG9zYy5zdGFydCh0KTsgb3NjLnN0b3AodCArIDAuMTMpO1xuICAgICAgICB9KTtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiBjdHguY2xvc2UoKS5jYXRjaCgoKSA9PiB7fSksIDgwMCk7XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIHRyeSB7IGN0eD8uY2xvc2UoKS5jYXRjaCgoKSA9PiB7fSk7IH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuICAgIH1cbn1cbiIsIi8qKlxuICogYXV0b2xvZ2luLmpzIOKAlCBBdXRvbWF0ZWQgY3JlZGVudGlhbCBtYW5hZ2VtZW50IGFuZCBSZWFjdC1zYWZlIHJlLWxvZ2luIGV4ZWN1dGlvblxuICovXG5cbmltcG9ydCB7IGdldFZhbHVlLCBzZXRWYWx1ZSB9IGZyb20gJy4vc3RvcmFnZS5qcyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRTYXZlZENyZWRlbnRpYWxzKCkge1xuICAgIGNvbnN0IHJhdyA9IGdldFZhbHVlKCdhd19sb2dpbl9jcmVkcycsIG51bGwpO1xuICAgIGlmICghcmF3KSByZXR1cm4gbnVsbDtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBwYXJzZWQgPSB0eXBlb2YgcmF3ID09PSAnc3RyaW5nJyA/IEpTT04ucGFyc2UocmF3KSA6IHJhdztcbiAgICAgICAgaWYgKHBhcnNlZCAmJiB0eXBlb2YgcGFyc2VkLmVtYWlsID09PSAnc3RyaW5nJyAmJiB0eXBlb2YgcGFyc2VkLnBhc3N3b3JkID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgcmV0dXJuIHBhcnNlZDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9IGNhdGNoIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc2F2ZUNyZWRlbnRpYWxzKGVtYWlsLCBwYXNzd29yZCkge1xuICAgIGNvbnN0IGNyZWRzID0ge1xuICAgICAgICBlbWFpbDogZW1haWwudHJpbSgpLFxuICAgICAgICBwYXNzd29yZDogcGFzc3dvcmQsXG4gICAgICAgIHNhdmVkQXQ6IERhdGUubm93KClcbiAgICB9O1xuICAgIHNldFZhbHVlKCdhd19sb2dpbl9jcmVkcycsIEpTT04uc3RyaW5naWZ5KGNyZWRzKSk7XG4gICAgcmV0dXJuIGNyZWRzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xlYXJDcmVkZW50aWFscygpIHtcbiAgICBzZXRWYWx1ZSgnYXdfbG9naW5fY3JlZHMnLCAnJyk7XG59XG5cbi8qKlxuICogUmVhY3QgU1BBIGlucHV0cyBpZ25vcmUgZGlyZWN0IGVsZW1lbnQudmFsdWUgYXNzaWdubWVudHMgYmVjYXVzZSBSZWFjdCB0cmFja3MgdmFsdWUgc3RhdGUgdmlhIGludGVybmFsIGRlc2NyaXB0b3IuXG4gKiBXZSBtdXN0IGludm9rZSB0aGUgbmF0aXZlIHByb3RvdHlwZSBzZXR0ZXIgYW5kIGRpc3BhdGNoIHN5bnRoZXRpYyAnaW5wdXQnICsgJ2NoYW5nZScgZXZlbnRzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2V0UmVhY3RJbnB1dFZhbHVlKGlucHV0LCB2YWx1ZSkge1xuICAgIGlmICghaW5wdXQpIHJldHVybjtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBuYXRpdmVJbnB1dFZhbHVlU2V0dGVyID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcih3aW5kb3cuSFRNTElucHV0RWxlbWVudC5wcm90b3R5cGUsICd2YWx1ZScpPy5zZXQ7XG4gICAgICAgIGlmIChuYXRpdmVJbnB1dFZhbHVlU2V0dGVyKSB7XG4gICAgICAgICAgICBuYXRpdmVJbnB1dFZhbHVlU2V0dGVyLmNhbGwoaW5wdXQsIHZhbHVlKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlucHV0LnZhbHVlID0gdmFsdWU7XG4gICAgICAgIH1cbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcbiAgICAgICAgaW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NoYW5nZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBpbnB1dC52YWx1ZSA9IHZhbHVlO1xuICAgICAgICBpbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuICAgIH1cbn1cblxuLyoqXG4gKiBBdXRvbWF0aWNhbGx5IGNhcHR1cmVzIGNyZWRlbnRpYWxzIHdoZW4gdXNlciBtYW51YWxseSBzdWJtaXRzIG9uIHRoZSAvbG9naW4gcGFnZS5cbiAqIFVzZXMgcGFzc2l2ZS9zYWZlIGV2ZW50IGxpc3RlbmluZyBhbmQgZmlsdGVycyBvdXQgZXh0ZW5zaW9uIGVsZW1lbnRzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2V0dXBMb2dpbkNhcHR1cmUobG9nRm4pIHtcbiAgICBpZiAoIS9eXFwvKGxvZ2lufHJlZ2lzdGVyfHNpZ251cCkvaS50ZXN0KHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZSkpIHJldHVybjtcblxuICAgIGZ1bmN0aW9uIGhhbmRsZUNhcHR1cmUoKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBpbnB1dHMgPSBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0JykpLmZpbHRlcihlbCA9PlxuICAgICAgICAgICAgICAgICFlbC5jbG9zZXN0KCcjYXctcGFuZWwsICNhdy1zZXR0aW5ncy1tb2RhbCwgI2F3LWxvZy1tb2RhbCwgI2F3LWFuYWx5dGljcy1tb2RhbCcpXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgY29uc3QgZW1haWxJbnB1dCA9IGlucHV0cy5maW5kKGVsID0+IGVsLnR5cGUgPT09ICdlbWFpbCcgfHwgL2VtYWlsfHVzZXJuYW1lL2kudGVzdChlbC5uYW1lIHx8IGVsLnBsYWNlaG9sZGVyIHx8ICcnKSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB8fCBpbnB1dHMuZmluZChlbCA9PiBlbC50eXBlID09PSAndGV4dCcgJiYgL0AvaS50ZXN0KGVsLnBsYWNlaG9sZGVyIHx8ICcnKSk7XG4gICAgICAgICAgICBjb25zdCBwYXNzSW5wdXQgID0gaW5wdXRzLmZpbmQoZWwgPT4gZWwudHlwZSA9PT0gJ3Bhc3N3b3JkJyk7XG5cbiAgICAgICAgICAgIGlmIChlbWFpbElucHV0Py52YWx1ZSAmJiBwYXNzSW5wdXQ/LnZhbHVlKSB7XG4gICAgICAgICAgICAgICAgc2F2ZUNyZWRlbnRpYWxzKGVtYWlsSW5wdXQudmFsdWUsIHBhc3NJbnB1dC52YWx1ZSk7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ1tBdXRvIFdvcmtlcl0g8J+UkCBLcmVkZW5zaWFsIGxvZ2luIGJlcmhhc2lsIGRpc2ltcGFuIG90b21hdGlzIHVudHVrIEF1dG8gUmUtTG9naW4uJyk7XG4gICAgICAgICAgICAgICAgbG9nRm4/Lign8J+UkCBLcmVkZW5zaWFsIGxvZ2luIGJlcmhhc2lsIGRpcGVyYmFydWkgb3RvbWF0aXMhJywgJ2luZm8nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG4gICAgfVxuXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignc3VibWl0JywgaGFuZGxlQ2FwdHVyZSwgdHJ1ZSk7XG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgYnRuID0gZS50YXJnZXQ/LmNsb3Nlc3Q/LignYnV0dG9uJyk7XG4gICAgICAgICAgICBpZiAoYnRuICYmIC9tYXN1a3xsb2dpbnxzaWduIGlufGVudGVyL2kudGVzdChidG4udGV4dENvbnRlbnQgfHwgJycpKSB7XG4gICAgICAgICAgICAgICAgaGFuZGxlQ2FwdHVyZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cbiAgICB9LCB0cnVlKTtcbn1cblxuLyoqXG4gKiBTZWFyY2hlcyBmb3IgbG9naW4gaW5wdXRzIGFuZCBzdWJtaXQgYnV0dG9uIG9uIC9sb2dpbi5cbiAqIEV4cGxpY2l0bHkgaWdub3JlcyBleHRlbnNpb24gVUkgbm9kZXMgdG8gYXZvaWQgYW55IGNvbGxpc2lvbi5cbiAqL1xuZnVuY3Rpb24gd2FpdEZvckxvZ2luSW5wdXRzKHRpbWVvdXRNcyA9IDEyMDAwKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuICAgICAgICBjb25zdCBmaW5kID0gKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgaW5wdXRzID0gQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdpbnB1dCcpKS5maWx0ZXIoZWwgPT5cbiAgICAgICAgICAgICAgICAhZWwuY2xvc2VzdCgnI2F3LXBhbmVsLCAjYXctc2V0dGluZ3MtbW9kYWwsICNhdy1sb2ctbW9kYWwsICNhdy1hbmFseXRpY3MtbW9kYWwnKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGNvbnN0IGVtYWlsSW5wdXQgPSBpbnB1dHMuZmluZChlbCA9PiBlbC50eXBlID09PSAnZW1haWwnIHx8IC9lbWFpbHx1c2VybmFtZS9pLnRlc3QoZWwubmFtZSB8fCBlbC5wbGFjZWhvbGRlciB8fCAnJykpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfHwgaW5wdXRzLmZpbmQoZWwgPT4gZWwudHlwZSA9PT0gJ3RleHQnICYmIC9AL2kudGVzdChlbC5wbGFjZWhvbGRlciB8fCAnJykpO1xuICAgICAgICAgICAgY29uc3QgcGFzc0lucHV0ICA9IGlucHV0cy5maW5kKGVsID0+IGVsLnR5cGUgPT09ICdwYXNzd29yZCcpO1xuICAgICAgICAgICAgY29uc3QgYnV0dG9ucyAgICA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnYnV0dG9uJykpLmZpbHRlcihlbCA9PlxuICAgICAgICAgICAgICAgICFlbC5jbG9zZXN0KCcjYXctcGFuZWwsICNhdy1zZXR0aW5ncy1tb2RhbCwgI2F3LWxvZy1tb2RhbCwgI2F3LWFuYWx5dGljcy1tb2RhbCcpXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgY29uc3Qgc3VibWl0QnRuICA9IGJ1dHRvbnMuZmluZChiID0+IC9tYXN1a3xsb2dpbnxzaWduIGlufGVudGVyL2kudGVzdChiLnRleHRDb250ZW50IHx8ICcnKSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB8fCBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdidXR0b25bdHlwZT1cInN1Ym1pdFwiXScpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfHwgYnV0dG9ucy5maW5kKGIgPT4gYi5vZmZzZXRXaWR0aCA+IDEwMCk7XG5cbiAgICAgICAgICAgIGlmIChlbWFpbElucHV0ICYmIHBhc3NJbnB1dCAmJiBzdWJtaXRCdG4pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBlbWFpbElucHV0LCBwYXNzSW5wdXQsIHN1Ym1pdEJ0biB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgaW1tZWRpYXRlID0gZmluZCgpO1xuICAgICAgICBpZiAoaW1tZWRpYXRlKSByZXR1cm4gcmVzb2x2ZShpbW1lZGlhdGUpO1xuXG4gICAgICAgIGNvbnN0IHN0YXJ0ID0gRGF0ZS5ub3coKTtcbiAgICAgICAgY29uc3QgaW50ZXJ2YWwgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBmb3VuZCA9IGZpbmQoKTtcbiAgICAgICAgICAgIGlmIChmb3VuZCkge1xuICAgICAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwoaW50ZXJ2YWwpO1xuICAgICAgICAgICAgICAgIHJlc29sdmUoZm91bmQpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChEYXRlLm5vdygpIC0gc3RhcnQgPiB0aW1lb3V0TXMpIHtcbiAgICAgICAgICAgICAgICBjbGVhckludGVydmFsKGludGVydmFsKTtcbiAgICAgICAgICAgICAgICByZXNvbHZlKG51bGwpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LCAzNTApO1xuICAgIH0pO1xufVxuXG4vKipcbiAqIEV4ZWN1dGVzIGF1dG9tYXRlZCBsb2dpbiBpZiBlbmFibGVkIGFuZCBvbiAvbG9naW4gcGFnZS5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHRyeUF1dG9Mb2dpbihDT05GSUcsIGxvZ0ZuLCBzZW5kTm90aWZpY2F0aW9uRm4pIHtcbiAgICBpZiAoIS9eXFwvbG9naW4vaS50ZXN0KHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZSkpIHtcbiAgICAgICAgLy8gV2hlbiB1c2VyIGlzIHN1Y2Nlc3NmdWxseSBwYXN0IGxvZ2luIChlLmcuIG9uIC9kYXNoYm9hcmQpLCByZXNldCBhdHRlbXB0IGNvdW50ZXJcbiAgICAgICAgdHJ5IHsgc2Vzc2lvblN0b3JhZ2UucmVtb3ZlSXRlbSgnYXdfbG9naW5fYXR0ZW1wdHMnKTsgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBpZiAoIUNPTkZJRz8uYXV0b1JlbG9naW5FbmFibGVkKSByZXR1cm4gZmFsc2U7XG5cbiAgICBjb25zdCBjcmVkcyA9IGdldFNhdmVkQ3JlZGVudGlhbHMoKTtcbiAgICBpZiAoIWNyZWRzPy5lbWFpbCB8fCAhY3JlZHM/LnBhc3N3b3JkKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCdbQXV0byBXb3JrZXJdIPCflJAgQXV0byBSZS1Mb2dpbiBha3RpZiB0ZXRhcGkgYmVsdW0gYWRhIGVtYWlsICYga2F0YSBzYW5kaSB0ZXJzaW1wYW4uJyk7XG4gICAgICAgIGxvZ0ZuPy4oJ/CflJAgQXV0byBSZS1Mb2dpbiBha3RpZiB0ZXRhcGkgYmVsdW0gYWRhIGVtYWlsICYga2F0YSBzYW5kaSB0ZXJzaW1wYW4uIFNpbGFrYW4gaXNpIGRpIFNldHRpbmdzIGF0YXUgbG9naW4gbWFudWFsIHNla2FsaS4nLCAnaW5mbycpO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgLy8gQW50aS1sb2Nrb3V0IGd1YXJkOiBsaW1pdCB0byAyIGNvbnNlY3V0aXZlIGF0dGVtcHRzIHBlciBzZXNzaW9uXG4gICAgbGV0IGF0dGVtcHRzID0gMDtcbiAgICB0cnkge1xuICAgICAgICBhdHRlbXB0cyA9IHBhcnNlSW50KHNlc3Npb25TdG9yYWdlLmdldEl0ZW0oJ2F3X2xvZ2luX2F0dGVtcHRzJykgfHwgJzAnLCAxMCk7XG4gICAgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG5cbiAgICBpZiAoYXR0ZW1wdHMgPj0gMikge1xuICAgICAgICBjb25zb2xlLndhcm4oJ1tBdXRvIFdvcmtlcl0g4pqg77iPIEF1dG8gUmUtTG9naW4gZGloZW50aWthbiBzZW1lbnRhcmE6IHRlbGFoIG1lbmNvYmEgMnguJyk7XG4gICAgICAgIGxvZ0ZuPy4oJ+KaoO+4jyBBdXRvIFJlLUxvZ2luIGRpaGVudGlrYW4gc2VtZW50YXJhOiB0ZWxhaCBtZW5jb2JhIDJ4LiBTaWxha2FuIGxvZ2luIG1hbnVhbCB1bnR1ayB2ZXJpZmlrYXNpIGFrdW4uJywgJ2Vycm9yJyk7XG4gICAgICAgIHNlbmROb3RpZmljYXRpb25Gbj8uKENPTkZJRywgJ0F1dG8gUmUtTG9naW4gRGloZW50aWthbicsICdNZW5jYXBhaSBiYXRhcyAyeCBwZXJjb2JhYW4uIFNpbGFrYW4gcGVyaWtzYSBha3VuLicpO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coJ1tBdXRvIFdvcmtlcl0g4o+zIEhhbGFtYW4gbG9naW4gdGVyZGV0ZWtzaS4gTWVtcGVyc2lhcGthbiBBdXRvIFJlLUxvZ2luLi4uJyk7XG4gICAgbG9nRm4/Lign4o+zIEhhbGFtYW4gbG9naW4gdGVyZGV0ZWtzaS4gTWVtdWxhaSBBdXRvIFJlLUxvZ2luIGRhbGFtIDEuNSBkZXRpay4uLicsICdpbmZvJyk7XG5cbiAgICAvLyBHaXZlIFJlYWN0IFNQQSAxLjJzIHRvIGZpbmlzaCBoeWRyYXRpbmcgaXRzIGNvbXBvbmVudCB0cmVlXG4gICAgYXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDEyMDApKTtcblxuICAgIGNvbnN0IGVsZW1lbnRzID0gYXdhaXQgd2FpdEZvckxvZ2luSW5wdXRzKDEwMDAwKTtcbiAgICBpZiAoIWVsZW1lbnRzKSB7XG4gICAgICAgIGNvbnNvbGUud2FybignW0F1dG8gV29ya2VyXSDimqDvuI8gRWxlbWVuIGZvcm0gbG9naW4gdGlkYWsgZGl0ZW11a2FuIGRhbGFtIDEwIGRldGlrLicpO1xuICAgICAgICBsb2dGbj8uKCfimqDvuI8gRWxlbWVuIGZvcm0gbG9naW4gdGlkYWsgZGl0ZW11a2FuIGRhbGFtIDEwIGRldGlrLicsICd3YXJuJyk7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBjb25zdCB7IGVtYWlsSW5wdXQsIHBhc3NJbnB1dCwgc3VibWl0QnRuIH0gPSBlbGVtZW50cztcblxuICAgIHRyeSB7XG4gICAgICAgIHNlc3Npb25TdG9yYWdlLnNldEl0ZW0oJ2F3X2xvZ2luX2F0dGVtcHRzJywgKGF0dGVtcHRzICsgMSkudG9TdHJpbmcoKSk7XG4gICAgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG5cbiAgICAvLyBIdW1hbi1saWtlIHR5cGluZyBkZWxheSB0byBwcmV2ZW50IGFudGktYm90IGRldGVjdGlvblxuICAgIGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCA2MDApKTtcbiAgICBzZXRSZWFjdElucHV0VmFsdWUoZW1haWxJbnB1dCwgY3JlZHMuZW1haWwpO1xuXG4gICAgYXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDQ1MCkpO1xuICAgIHNldFJlYWN0SW5wdXRWYWx1ZShwYXNzSW5wdXQsIGNyZWRzLnBhc3N3b3JkKTtcblxuICAgIGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCA2MDApKTtcblxuICAgIGNvbnNvbGUubG9nKGBbQXV0byBXb3JrZXJdIPCflJEgTWVuZ2lyaW0gbG9naW4gb3RvbWF0aXMgdW50dWsgJHtjcmVkcy5lbWFpbH0uLi5gKTtcbiAgICBsb2dGbj8uKGDwn5SRIE1lbmdpcmltIGxvZ2luIG90b21hdGlzIHVudHVrICR7Y3JlZHMuZW1haWx9Li4uYCwgJ2luZm8nKTtcbiAgICBzZW5kTm90aWZpY2F0aW9uRm4/LihDT05GSUcsICdBdXRvIFJlLUxvZ2luJywgYE1lbmNvYmEgbWFzdWsgb3RvbWF0aXMgc2ViYWdhaSAke2NyZWRzLmVtYWlsfS4uLmApO1xuXG4gICAgc3VibWl0QnRuLmNsaWNrKCk7XG4gICAgcmV0dXJuIHRydWU7XG59XG4iLCIvKipcbiAqIHdvcmsuanMg4oCUIENvcmUgZG9Xb3JrKCkgYWN0aW9uOiBjYWxscyB0aGUgUGFybGFtZW50dW0gQVBJIGFuZCB1cGRhdGVzIHN0YXRlXG4gKi9cblxuaW1wb3J0IHsgZ2V0Q3VycmVudEVuZXJneSwgZ2V0U3luY2VkRW5lcmd5LCBnZXROZXh0V29ya0RlbGF5LCBpc1NsZWVwVGltZSwgZ2V0TXNVbnRpbFNsZWVwRW5kLCBwYXRjaFBhZ2VWaXN1YWxFbmVyZ3kgfSBmcm9tICcuL2VuZXJneS5qcyc7XG5pbXBvcnQgeyBnZXRUb2tlbkZyb21TdG9yYWdlIH0gZnJvbSAnLi90b2tlbi5qcyc7XG5pbXBvcnQgeyBzYXZlU3RhdGUsIHNhdmVMaXZlU3RhdHVzIH0gZnJvbSAnLi9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBzYXZlV29ya0hpc3RvcnkgfSBmcm9tICcuL2hpc3RvcnkuanMnO1xuaW1wb3J0IHsgc2V0VmFsdWUgfSBmcm9tICcuL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgZ2V0U2F2ZWRDcmVkZW50aWFscyB9IGZyb20gJy4vYXV0b2xvZ2luLmpzJztcblxuLyoqXG4gKiBAcGFyYW0ge29iamVjdH0gY3R4IC0geyBzdGF0ZSwgQ09ORklHLCB3b3JrSGlzdG9yeSwgbG9nLCBzZXRSdW5uaW5nVUksIHNlbmROb3RpZmljYXRpb24sIHBsYXlOb3RpZmljYXRpb25Tb3VuZCwgdXBkYXRlUGFuZWwsIHdha2VQZW5kaW5nV29yayB9XG4gKiBAcGFyYW0ge2Jvb2xlYW59IG1hbnVhbFxuICogQHJldHVybnMge1Byb21pc2U8J3dvcmtlZCd8J3dhaXRpbmcnfCdwYXVzZWQnfCdyZXRyeSd8J3JldHJ5U29vbid8J2J1c3knfCd1bmNlcnRhaW4nfCdzdGFuZGJ5Jz59XG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBkb1dvcmsoY3R4LCBtYW51YWwgPSBmYWxzZSkge1xuICAgIGNvbnN0IHsgc3RhdGUsIENPTkZJRywgd29ya0hpc3RvcnksIGxvZywgc2V0UnVubmluZ1VJLCBzZW5kTm90aWZpY2F0aW9uLCBwbGF5Tm90aWZpY2F0aW9uU291bmQsIHVwZGF0ZVBhbmVsLCB3YWtlUGVuZGluZ1dvcmsgfSA9IGN0eDtcblxuICAgIGlmICghbWFudWFsICYmIHN0YXRlLnRhYkxvY2tNYW5hZ2VkICYmICFzdGF0ZS5pc1RhYkxvY2tPd25lcikgcmV0dXJuICdzdGFuZGJ5JztcbiAgICBpZiAoc3RhdGUud29ya1Jlc3VsdFVuY2VydGFpbikge1xuICAgICAgICBsb2coJ0hhc2lsIHJlcXVlc3Qga2VyamEgc2ViZWx1bW55YSBiZWx1bSBwYXN0aS4gTXVhdCB1bGFuZyBoYWxhbWFuIHVudHVrIHNpbmtyb25pc2FzaSBzZWJlbHVtIG1lbmNvYmEgbGFnaS4nLCAnZXJyb3InKTtcbiAgICAgICAgcmV0dXJuICdwYXVzZWQnO1xuICAgIH1cbiAgICBpZiAoc3RhdGUud29ya0luRmxpZ2h0KSB7XG4gICAgICAgIGlmIChEYXRlLm5vdygpIC0gKHN0YXRlLndvcmtJbkZsaWdodEF0IHx8IDApID4gMTUwMDApIHtcbiAgICAgICAgICAgIHN0YXRlLndvcmtJbkZsaWdodCA9IGZhbHNlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuICdidXN5JztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIEd1YXJkOiBkb24ndCBzZXQgd29ya0luRmxpZ2h0IHVudGlsIGFmdGVyIGFsbCBjaGVhcCBjaGVja3NcbiAgICBpZiAoIXN0YXRlLnJ1bm5pbmcgJiYgIW1hbnVhbCkgcmV0dXJuICdwYXVzZWQnO1xuXG4gICAgaWYgKG1hbnVhbCkge1xuICAgICAgICBsb2coJ+KaoSBNZW5qYWxhbmthbiBzaGlmdCBrZXJqYSBtYW51YWwuLi4nLCAnaW5mbycpO1xuICAgIH1cblxuICAgIHN0YXRlLndvcmtJbkZsaWdodCA9IHRydWU7XG4gICAgc3RhdGUud29ya0luRmxpZ2h0QXQgPSBEYXRlLm5vdygpO1xuICAgIGxldCB0aW1lb3V0SWQgPSBudWxsO1xuICAgIGxldCBlbmVyZ3lCZWZvcmUgPSBudWxsO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgaWYgKCFzdGF0ZS5jdXJyZW50VG9rZW4pIHtcbiAgICAgICAgICAgIGdldFRva2VuRnJvbVN0b3JhZ2Uoc3RhdGUsIChyYXcsIHNyYykgPT4ge1xuICAgICAgICAgICAgICAgIC8vIEltcG9ydCBoYW5kbGVOZXdUb2tlbiBpbmxpbmUgdG8gYXZvaWQgY2lyY3VsYXIgaW1wb3J0XG4gICAgICAgICAgICAgICAgcmV0dXJuIGN0eC5oYW5kbGVOZXdUb2tlbihyYXcsIHNyYyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGlmICghc3RhdGUuY3VycmVudFRva2VuKSB7XG4gICAgICAgICAgICAgICAgbG9nKCdUb2tlbiB0aWRhayBkaXRlbXVrYW4hIFBhc3Rpa2FuIHN1ZGFoIGxvZ2luIGRpIGFrdW4gUGFybGVtZW50dW0uJywgJ2Vycm9yJyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuICdyZXRyeSc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBlbmVyZ3kgPSBnZXRTeW5jZWRFbmVyZ3koc3RhdGUpO1xuICAgICAgICBpZiAoIWVuZXJneSkge1xuICAgICAgICAgICAgbG9nKCdHYWdhbCBtZW1iYWNhIGVuZXJnaSBkYXJpIGhhbGFtYW4uIE1lbmNvYmEgbGFnaSBkYWxhbSA1IGRldGlrLicsICd3YXJuJyk7XG4gICAgICAgICAgICBzdGF0ZS5uZXh0V29ya1RpbWVzdGFtcCA9IERhdGUubm93KCkgKyA1MDAwO1xuICAgICAgICAgICAgcmV0dXJuICdyZXRyeVNvb24nO1xuICAgICAgICB9XG5cbiAgICAgICAgc3RhdGUuY3VycmVudEVuZXJneSA9IGVuZXJneS5jdXJyZW50O1xuICAgICAgICBzdGF0ZS5tYXhFbmVyZ3kgICAgID0gZW5lcmd5Lm1heDtcblxuICAgICAgICBpZiAoIW1hbnVhbCAmJiBpc1NsZWVwVGltZShDT05GSUcpKSB7XG4gICAgICAgICAgICBjb25zdCBtc1VudGlsV2FrZSA9IGdldE1zVW50aWxTbGVlcEVuZChDT05GSUcpO1xuICAgICAgICAgICAgY29uc3Qgd2FrZUhvdXIgPSBTdHJpbmcoQ09ORklHLnNsZWVwRW5kSG91ciA/PyA2KS5wYWRTdGFydCgyLCAnMCcpICsgJzowMCc7XG4gICAgICAgICAgICBsb2coYPCfjJkgSmFtIGlzdGlyYWhhdCBha3RpZiAoJHtDT05GSUcuc2xlZXBTdGFydEhvdXIgPz8gMX06MDAgLSAke0NPTkZJRy5zbGVlcEVuZEhvdXIgPz8gNn06MDAgV0lCKS4gQXV0byBXb3JrZXIgdGlkdXIgc2FtcGFpIHB1a3VsICR7d2FrZUhvdXJ9Li4uYCwgJ2luZm8nKTtcbiAgICAgICAgICAgIHN0YXRlLm5leHRXb3JrVGltZXN0YW1wID0gRGF0ZS5ub3coKSArIG1zVW50aWxXYWtlO1xuICAgICAgICAgICAgdXBkYXRlUGFuZWwoKTtcbiAgICAgICAgICAgIHJldHVybiAnd2FpdGluZyc7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3RhdGUuY3VycmVudEVuZXJneSA8IDEwICYmIG1hbnVhbCkge1xuICAgICAgICAgICAgbG9nKGDimqDvuI8gRW5lcmdpIHNhYXQgaW5pICgke3N0YXRlLmN1cnJlbnRFbmVyZ3l9LyR7c3RhdGUubWF4RW5lcmd5feKaoSkgYmVsdW0gY3VrdXAhIEJ1dHVoIG1pbmltYWwgMTDimqEgdW50dWsgZ2lsaXJhbiBrZXJqYS5gLCAnd2FybicpO1xuICAgICAgICAgICAgcmV0dXJuICd3YWl0aW5nJztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdGF0ZS5jdXJyZW50RW5lcmd5IDwgQ09ORklHLmVuZXJneVRocmVzaG9sZCAmJiAhbWFudWFsKSB7XG4gICAgICAgICAgICBsb2coYEVuZXJnaSBiZWx1bSBjdWt1cCAoJHtzdGF0ZS5jdXJyZW50RW5lcmd5fS8ke0NPTkZJRy5lbmVyZ3lUaHJlc2hvbGR9KWAsICd3YXJuJyk7XG4gICAgICAgICAgICBzdGF0ZS5uZXh0V29ya1RpbWVzdGFtcCA9IERhdGUubm93KCkgKyBnZXROZXh0V29ya0RlbGF5KHN0YXRlLCBDT05GSUcpO1xuICAgICAgICAgICAgcmV0dXJuICd3YWl0aW5nJztcbiAgICAgICAgfVxuXG4gICAgICAgIGVuZXJneUJlZm9yZSA9IGdldEN1cnJlbnRFbmVyZ3koKSB8fCBlbmVyZ3k7XG5cbiAgICAgICAgY29uc3QgY29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcbiAgICAgICAgdGltZW91dElkID0gc2V0VGltZW91dCgoKSA9PiBjb250cm9sbGVyLmFib3J0KCksIDE1MDAwKTtcblxuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdodHRwczovL3BhcmxhbWVudHVtLm9yZy9hcGkvcGxheWVyL3dvcmsnLCB7XG4gICAgICAgICAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICAgICAgICdBdXRob3JpemF0aW9uJzogc3RhdGUuY3VycmVudFRva2VuLFxuICAgICAgICAgICAgICAgICdBY2NlcHQnOiAnKi8qJ1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGNyZWRlbnRpYWxzOiAnaW5jbHVkZScsXG4gICAgICAgICAgICBzaWduYWw6IGNvbnRyb2xsZXIuc2lnbmFsLFxuICAgICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe30pXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChyZXNwb25zZS5vaykge1xuICAgICAgICAgICAgcmV0dXJuIF9oYW5kbGVTdWNjZXNzKGN0eCwgcmVzcG9uc2UsIGVuZXJneSk7XG4gICAgICAgIH0gZWxzZSBpZiAocmVzcG9uc2Uuc3RhdHVzID09PSA0MDEpIHtcbiAgICAgICAgICAgIHJldHVybiBfaGFuZGxlVW5hdXRob3JpemVkKGN0eCk7XG4gICAgICAgIH0gZWxzZSBpZiAocmVzcG9uc2Uuc3RhdHVzID09PSA0MDAgfHwgcmVzcG9uc2Uuc3RhdHVzID09PSA0MjIpIHtcbiAgICAgICAgICAgIHJldHVybiBfaGFuZGxlUmVqZWN0ZWQoY3R4LCByZXNwb25zZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsb2coYEVycm9yIEhUVFA6ICR7cmVzcG9uc2Uuc3RhdHVzfWAsICdlcnJvcicpO1xuICAgICAgICAgICAgcmV0dXJuICdyZXRyeSc7XG4gICAgICAgIH1cblxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGlmIChlcnJvci5uYW1lID09PSAnQWJvcnRFcnJvcicpIHtcbiAgICAgICAgICAgIHJldHVybiBfaGFuZGxlVGltZW91dChjdHgsIGVuZXJneUJlZm9yZSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc29sZS5lcnJvcignW2RvV29ya10gRXJyb3I6JywgZXJyb3IpO1xuICAgICAgICBsb2coYEdhZ2FsIGtvbmVrc2k6ICR7ZXJyb3IubWVzc2FnZX1gLCAnZXJyb3InKTtcbiAgICAgICAgcmV0dXJuICdyZXRyeSc7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgICAgaWYgKHRpbWVvdXRJZCAhPT0gbnVsbCkgY2xlYXJUaW1lb3V0KHRpbWVvdXRJZCk7XG4gICAgICAgIHN0YXRlLndvcmtJbkZsaWdodCA9IGZhbHNlO1xuICAgIH1cbn1cblxuLy8g4pSA4pSA4pSAIFByaXZhdGUgaGVscGVycyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuYXN5bmMgZnVuY3Rpb24gX2hhbmRsZVN1Y2Nlc3MoY3R4LCByZXNwb25zZSwgZW5lcmd5KSB7XG4gICAgY29uc3QgeyBzdGF0ZSwgQ09ORklHLCB3b3JrSGlzdG9yeSwgbG9nLCBzZW5kTm90aWZpY2F0aW9uLCBwbGF5Tm90aWZpY2F0aW9uU291bmQsIHVwZGF0ZVBhbmVsLCB3YWtlUGVuZGluZ1dvcmsgfSA9IGN0eDtcblxuICAgIGxldCBkYXRhID0gbnVsbDtcbiAgICB0cnkgeyBkYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpOyB9IGNhdGNoIChlKSB7XG4gICAgICAgIGlmIChlLm5hbWUgPT09ICdBYm9ydEVycm9yJykgdGhyb3cgZTtcbiAgICAgICAgbG9nKCdSZXNwb25zIGtlcmphIHN1a3NlcywgdGV0YXBpIGRhdGEgdGlkYWsgdGVyYmFjYTsgbWVtYWthaSBuaWxhaSBmYWxsYmFjay4nLCAnd2FybicpO1xuICAgIH1cblxuICAgIGNvbnN0IHBhcnNlZEVuZXJneVVzZWQgPSBkYXRhPy5lbmVyZ3lVc2VkICE9IG51bGwgPyBOdW1iZXIoZGF0YS5lbmVyZ3lVc2VkKSA6IE5hTjtcbiAgICBjb25zdCBpc1JlcG9ydGVkWmVyb0VuZXJneSA9IE51bWJlci5pc1NhZmVJbnRlZ2VyKHBhcnNlZEVuZXJneVVzZWQpICYmIHBhcnNlZEVuZXJneVVzZWQgPT09IDA7XG4gICAgY29uc3QgaGFzUmVwb3J0ZWRFbmVyZ3kgPSBOdW1iZXIuaXNTYWZlSW50ZWdlcihwYXJzZWRFbmVyZ3lVc2VkKSAmJiBwYXJzZWRFbmVyZ3lVc2VkID49IDEwICYmIHBhcnNlZEVuZXJneVVzZWQgPD0gMzUwO1xuXG4gICAgY29uc3QgcGFyc2VkWHAgPSBkYXRhPy54cEVhcm5lZCAhPSBudWxsID8gTnVtYmVyKGRhdGEueHBFYXJuZWQpIDogTmFOO1xuICAgIGNvbnN0IGlzUmVwb3J0ZWRaZXJvWHAgPSBOdW1iZXIuaXNTYWZlSW50ZWdlcihwYXJzZWRYcCkgJiYgcGFyc2VkWHAgPT09IDA7XG5cbiAgICAvLyBaZXJvLWdhaW4gc2hpZnQ6IHNlcnZlciBnYXZlIDAgWFAgb3IgMCBlbmVyZ3kgdXNlZCAobm90IGVub3VnaCBlbmVyZ3kgdG8gcHJvZHVjZSAxIHVuaXQgb3Igc2VydmVyIGVuZXJneSBpcyAwKVxuICAgIGlmIChpc1JlcG9ydGVkWmVyb0VuZXJneSB8fCBpc1JlcG9ydGVkWmVyb1hwIHx8IGRhdGE/LmVycm9yIHx8ICh0eXBlb2YgZGF0YT8ubWVzc2FnZSA9PT0gJ3N0cmluZycgJiYgL2VuZXJneXx1bml0L2kudGVzdChkYXRhLm1lc3NhZ2UpKSkge1xuICAgICAgICBjb25zdCBmcmVzaCA9IGdldEN1cnJlbnRFbmVyZ3koKTtcbiAgICAgICAgaWYgKGZyZXNoKSB7XG4gICAgICAgICAgICBzdGF0ZS5jdXJyZW50RW5lcmd5ID0gZnJlc2guY3VycmVudDtcbiAgICAgICAgICAgIHN0YXRlLm1heEVuZXJneSAgICAgPSBmcmVzaC5tYXg7XG4gICAgICAgICAgICBzdGF0ZS5lbmVyZ3lTeW5jQmFzZSA9IHsgY3VycmVudDogZnJlc2guY3VycmVudCwgbWF4OiBmcmVzaC5tYXgsIHVwZGF0ZWRBdDogRGF0ZS5ub3coKSB9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc3RhdGUuY3VycmVudEVuZXJneSA9IDA7XG4gICAgICAgICAgICBzdGF0ZS5lbmVyZ3lTeW5jQmFzZSA9IHsgY3VycmVudDogMCwgbWF4OiBzdGF0ZS5tYXhFbmVyZ3kgfHwgMTE1LCB1cGRhdGVkQXQ6IERhdGUubm93KCkgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB3YWl0TXMgPSBNYXRoLm1heCgxMCAqIDYwMDAwLCBnZXROZXh0V29ya0RlbGF5KHN0YXRlLCBDT05GSUcpKTtcbiAgICAgICAgY29uc3Qgd2FpdE1pbnMgPSBNYXRoLnJvdW5kKHdhaXRNcyAvIDYwMDAwKTtcbiAgICAgICAgbG9nKGBTaGlmdCBzZWxlc2FpIHRhcGkgbWVuZ2hhc2lsa2FuIDAgWFAgKGVuZXJnaSBnYW1lIHNhYXQgaW5pOiAke3N0YXRlLmN1cnJlbnRFbmVyZ3l9LyR7c3RhdGUubWF4RW5lcmd5feKaoSkuIE1lbnVuZ2d1IGVuZXJnaSBwdWxpaC4uLmAsICd3YXJuJyk7XG4gICAgICAgIHN0YXRlLm5leHRXb3JrVGltZXN0YW1wID0gRGF0ZS5ub3coKSArIHdhaXRNcztcbiAgICAgICAgdXBkYXRlUGFuZWwoKTtcbiAgICAgICAgcmV0dXJuICd3YWl0aW5nJztcbiAgICB9XG5cbiAgICBjb25zdCBhdmFpbGFibGUgPSBNYXRoLmZsb29yKHN0YXRlLmN1cnJlbnRFbmVyZ3kgLyAxMCkgKiAxMDtcbiAgICBjb25zdCBmYWxsYmFja0Jsb2NrcyA9IE1hdGguZmxvb3IoYXZhaWxhYmxlIC8gMTApO1xuICAgIGNvbnN0IHhwR2FpbmVkID0gTnVtYmVyLmlzU2FmZUludGVnZXIocGFyc2VkWHApICYmIHBhcnNlZFhwID4gMFxuICAgICAgICA/IHBhcnNlZFhwXG4gICAgICAgIDogKGhhc1JlcG9ydGVkRW5lcmd5ID8gTWF0aC5mbG9vcihwYXJzZWRFbmVyZ3lVc2VkIC8gMTApICogNCA6IGZhbGxiYWNrQmxvY2tzICogNCk7XG5cbiAgICBpZiAoeHBHYWluZWQgPD0gMCkge1xuICAgICAgICBsb2coYFNoaWZ0IHRpZGFrIG1lbmdoYXNpbGthbiBYUC4gRW5lcmdpIHNhYXQgaW5pOiAke3N0YXRlLmN1cnJlbnRFbmVyZ3l9LyR7c3RhdGUubWF4RW5lcmd5feKaoS5gLCAnd2FybicpO1xuICAgICAgICB1cGRhdGVQYW5lbCgpO1xuICAgICAgICByZXR1cm4gJ3dhaXRpbmcnO1xuICAgIH1cblxuICAgIGNvbnN0IGVuZXJneVNwZW50ICA9IGhhc1JlcG9ydGVkRW5lcmd5ID8gcGFyc2VkRW5lcmd5VXNlZCA6IE1hdGgubWF4KDEwLCBhdmFpbGFibGUpO1xuXG4gICAgLy8gVXBkYXRlIGNvdW50ZXJzXG4gICAgc3RhdGUudG90YWxXb3JrZWQrKztcbiAgICBzdGF0ZS53b3JrVG9kYXkrKztcbiAgICBzdGF0ZS50b3RhbFdvcmtYUCAgKz0geHBHYWluZWQ7XG4gICAgc3RhdGUueHBUb2RheSAgICAgICs9IHhwR2FpbmVkO1xuICAgIHN0YXRlLnRvdGFsRW5lcmd5U3BlbnQgICAgICAgICAgKz0gZW5lcmd5U3BlbnQ7XG4gICAgc3RhdGUudG90YWxBY3R1YWxFbmVyZ3lTcGVudCAgICArPSBoYXNSZXBvcnRlZEVuZXJneSA/IHBhcnNlZEVuZXJneVVzZWQgOiAwO1xuICAgIHN0YXRlLnRvdGFsRXN0aW1hdGVkRW5lcmd5U3BlbnQgKz0gaGFzUmVwb3J0ZWRFbmVyZ3kgPyAwIDogZW5lcmd5U3BlbnQ7XG4gICAgc3RhdGUubGFzdFdvcmtUaW1lID0gbmV3IERhdGUoKS50b0xvY2FsZVRpbWVTdHJpbmcoJ2lkLUlEJyk7XG5cbiAgICAvLyBVcGRhdGUgZGFpbHkgaGlzdG9yeVxuICAgIGNvbnN0IHRvZGF5S2V5ID0gbmV3IERhdGUoKS50b0RhdGVTdHJpbmcoKTtcbiAgICBsZXQgaGlzdG9yeSA9IHdvcmtIaXN0b3J5IHx8IGN0eD8ud29ya0hpc3Rvcnk7XG4gICAgaWYgKHR5cGVvZiBoaXN0b3J5ID09PSAnc3RyaW5nJykge1xuICAgICAgICB0cnkgeyBoaXN0b3J5ID0gSlNPTi5wYXJzZShoaXN0b3J5KTsgfSBjYXRjaCB7IGhpc3RvcnkgPSB7fTsgfVxuICAgIH1cbiAgICBpZiAoIWhpc3RvcnkgfHwgdHlwZW9mIGhpc3RvcnkgIT09ICdvYmplY3QnKSBoaXN0b3J5ID0ge307XG4gICAgaWYgKCFoaXN0b3J5W3RvZGF5S2V5XSkgaGlzdG9yeVt0b2RheUtleV0gPSB7IHNoaWZ0czogMCwgeHA6IDAgfTtcbiAgICBjb25zdCB0b2RheSA9IGhpc3RvcnlbdG9kYXlLZXldO1xuICAgIHRvZGF5LnNoaWZ0cyA9ICh0b2RheS5zaGlmdHMgfHwgMCkgKyAxO1xuICAgIHRvZGF5LnhwICAgICA9ICh0b2RheS54cCB8fCAwKSArIHhwR2FpbmVkO1xuICAgIHRvZGF5LmVuZXJneVNwZW50ICAgICAgICAgICA9ICh0b2RheS5lbmVyZ3lTcGVudCB8fCAwKSArIChoYXNSZXBvcnRlZEVuZXJneSA/IGVuZXJneVNwZW50IDogMCk7XG4gICAgdG9kYXkuZXN0aW1hdGVkRW5lcmd5U3BlbnQgID0gKHRvZGF5LmVzdGltYXRlZEVuZXJneVNwZW50IHx8IDApICsgKGhhc1JlcG9ydGVkRW5lcmd5ID8gMCA6IGVuZXJneVNwZW50KTtcbiAgICB0b2RheS5lbmVyZ3lEYXRhU2hpZnRzICAgICAgPSAodG9kYXkuZW5lcmd5RGF0YVNoaWZ0cyB8fCAwKSArIChoYXNSZXBvcnRlZEVuZXJneSA/IDEgOiAwKTtcbiAgICBzYXZlV29ya0hpc3RvcnkoaGlzdG9yeSk7XG4gICAgaWYgKGN0eCkgY3R4LndvcmtIaXN0b3J5ID0gaGlzdG9yeTtcblxuICAgIC8vIE9wdGltaXN0aWMgZW5lcmd5IHVwZGF0ZSAocHJldmVudHMgcmFjZSBjb25kaXRpb25zKVxuICAgIHN0YXRlLmN1cnJlbnRFbmVyZ3kgPSBNYXRoLm1heCgwLCBzdGF0ZS5jdXJyZW50RW5lcmd5IC0gZW5lcmd5U3BlbnQpO1xuICAgIHN0YXRlLmVuZXJneVN5bmNCYXNlID0geyBjdXJyZW50OiBzdGF0ZS5jdXJyZW50RW5lcmd5LCBtYXg6IHN0YXRlLm1heEVuZXJneSwgdXBkYXRlZEF0OiBEYXRlLm5vdygpIH07XG4gICAgc3RhdGUubGFzdFdvcmtUaW1lc3RhbXAgPSBEYXRlLm5vdygpO1xuICAgIHN0YXRlLmRvbUVuZXJneVN0YWxlID0gdHJ1ZTtcblxuICAgIC8vIEluc3RhbnRseSBwYXRjaCBob3N0IHBhZ2UgdmlzdWFsIERPTSBzbyB1c2VyIGRvZXNuJ3Qgc2VlIG9sZCBwcmUtc2hpZnQgZW5lcmd5XG4gICAgcGF0Y2hQYWdlVmlzdWFsRW5lcmd5KHN0YXRlLmN1cnJlbnRFbmVyZ3ksIHN0YXRlLm1heEVuZXJneSwgdHJ1ZSk7XG5cbiAgICAvLyBUcmlnZ2VyIG5hdGl2ZSByZXZhbGlkYXRpb24gaW4gTmV4dC5qcyAvIFNXUiAvIFJlYWN0IFF1ZXJ5XG4gICAgdHJ5IHtcbiAgICAgICAgd2luZG93LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdmb2N1cycpKTtcbiAgICB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblxuICAgIHNhdmVTdGF0ZShzdGF0ZSk7XG4gICAgbG9nKGBLZXJqYSBzdWtzZXMhICske3hwR2FpbmVkfSBYUCB8IFNpc2E6ICR7c3RhdGUuY3VycmVudEVuZXJneX0vJHtzdGF0ZS5tYXhFbmVyZ3l94pqhYCwgJ3N1Y2Nlc3MnKTtcbiAgICBwbGF5Tm90aWZpY2F0aW9uU291bmQoQ09ORklHLCAnc3VjY2VzcycpO1xuICAgIHNlbmROb3RpZmljYXRpb24oQ09ORklHLCAnUGFybGFtZW50dW0nLCBgS2VyamEgc3Vrc2VzISArJHt4cEdhaW5lZH0gWFBgKTtcbiAgICBzdGF0ZS5uZXh0V29ya1RpbWVzdGFtcCA9IERhdGUubm93KCkgKyBnZXROZXh0V29ya0RlbGF5KHN0YXRlLCBDT05GSUcpO1xuICAgIHVwZGF0ZVBhbmVsKCk7XG4gICAgd2FrZVBlbmRpbmdXb3JrPy4oKTtcbiAgICByZXR1cm4gJ3dvcmtlZCc7XG59XG5cbmZ1bmN0aW9uIF9oYW5kbGVVbmF1dGhvcml6ZWQoY3R4KSB7XG4gICAgY29uc3QgeyBzdGF0ZSwgQ09ORklHLCBsb2csIHNldFJ1bm5pbmdVSSwgc2VuZE5vdGlmaWNhdGlvbiwgcGxheU5vdGlmaWNhdGlvblNvdW5kLCB1cGRhdGVQYW5lbCB9ID0gY3R4O1xuICAgIGxvZygn8J+UhCBTZXNpIHRva2VuIGtlZGFsdXdhcnNhICg0MDEpLiBNZS1yZWxvYWQgdGFiIGdhbWUgZGFsYW0gMiBkZXRpayB1bnR1ayBtZW1wZXJiYXJ1aSB0b2tlbiB2aWEgc2Vzc2lvbiBjb29raWUuLi4nLCAnd2FybicpO1xuICAgIHN0YXRlLnBhdXNlZEZvclRva2VuID0gdHJ1ZTtcbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgd2luZG93LmxvY2F0aW9uLnJlbG9hZCgpO1xuICAgIH0sIDIwMDApO1xuICAgIHJldHVybiAncGF1c2VkJztcbn1cblxuYXN5bmMgZnVuY3Rpb24gX2hhbmRsZVJlamVjdGVkKGN0eCwgcmVzcG9uc2UpIHtcbiAgICBjb25zdCB7IHN0YXRlLCBDT05GSUcsIGxvZywgc2V0UnVubmluZ1VJLCBzZW5kTm90aWZpY2F0aW9uLCB1cGRhdGVQYW5lbCB9ID0gY3R4O1xuXG4gICAgY29uc3QgZXJyb3JUZXh0ID0gYXdhaXQgcmVzcG9uc2UudGV4dCgpO1xuICAgIGxldCBzZXJ2ZXJNZXNzYWdlID0gJyc7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShlcnJvclRleHQpO1xuICAgICAgICBpZiAodHlwZW9mIHBhcnNlZCA9PT0gJ3N0cmluZycpIHNlcnZlck1lc3NhZ2UgPSBwYXJzZWQ7XG4gICAgICAgIGVsc2UgaWYgKHBhcnNlZCAmJiB0eXBlb2YgcGFyc2VkID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgc2VydmVyTWVzc2FnZSA9IFtwYXJzZWQubWVzc2FnZSwgcGFyc2VkLmVycm9yLCBwYXJzZWQuZGV0YWlsLCBwYXJzZWQucmVhc29uXVxuICAgICAgICAgICAgICAgIC5maW5kKHYgPT4gdHlwZW9mIHYgPT09ICdzdHJpbmcnKSB8fCAnJztcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuXG4gICAgaWYgKCFzZXJ2ZXJNZXNzYWdlKSBzZXJ2ZXJNZXNzYWdlID0gZXJyb3JUZXh0LnJlcGxhY2UoLzxbXj5dKj4vZywgJyAnKS5yZXBsYWNlKC9cXHMrL2csICcgJykudHJpbSgpO1xuICAgIHNlcnZlck1lc3NhZ2UgPSBzZXJ2ZXJNZXNzYWdlLnNsaWNlKDAsIDI0MCk7XG5cbiAgICBjb25zdCBjb21iaW5lZCA9IGAke2Vycm9yVGV4dH0gJHtzZXJ2ZXJNZXNzYWdlfWA7XG5cbiAgICBpZiAoL3dhbGxldHx3YWdlL2kudGVzdChjb21iaW5lZCkpIHtcbiAgICAgICAgbG9nKCfinYwgTWFqaWthbiBLZWhhYmlzYW4gU2FsZG8hIEthcyBwZXJ1c2FoYWFuIHRpZGFrIGN1a3VwIHVudHVrIG1lbWJheWFyIHVwYWguIFNjcmlwdCBkaS1wYXVzZS4nLCAnZXJyb3InKTtcbiAgICAgICAgc3RhdGUucnVubmluZyA9IGZhbHNlO1xuICAgICAgICBzZXRSdW5uaW5nVUkoZmFsc2UpO1xuICAgICAgICBzZW5kTm90aWZpY2F0aW9uKENPTkZJRywgJ1BhcmxhbWVudHVtJywgJ0thcyBtYWppa2FuIGhhYmlzISBQaW5kYWggbG93b25nYW4gZGkgSm9iIEJvYXJkLicpO1xuICAgICAgICByZXR1cm4gJ3BhdXNlZCc7XG4gICAgfVxuXG4gICAgaWYgKC9yZWdpb258d2lsYXlhaHx0cmFuc2l0fHRyYXZlbHxwZW5lcmJhbmdhbi9pLnRlc3QoY29tYmluZWQpKSB7XG4gICAgICAgIGxvZyhg4pqg77iPICR7c2VydmVyTWVzc2FnZSB8fCAnQW5kYSBoYXJ1cyBiZXJhZGEgZGkgd2lsYXlhaCBwZXJ1c2FoYWFuIHVudHVrIGJla2VyamEgKHNlZGFuZyBkYWxhbSBwZXJqYWxhbmFuKSd9LiBNZW51bmdndSAzIG1lbml0Li4uYCwgJ3dhcm4nKTtcbiAgICAgICAgc3RhdGUubmV4dFdvcmtUaW1lc3RhbXAgPSBEYXRlLm5vdygpICsgMyAqIDYwMDAwO1xuICAgICAgICB1cGRhdGVQYW5lbCgpO1xuICAgICAgICByZXR1cm4gJ3dhaXRpbmcnO1xuICAgIH1cblxuICAgIGNvbnN0IGlzRW5lcmd5RXJyb3IgPSAvKGluc3VmZmljaWVudFtfIF1lbmVyZ3l8bm90IGVub3VnaCBlbmVyZ3l8ZW5lcmdpLnswLDQwfSg/OnRpZGFrfGJlbHVtfGt1cmFuZyl8cHJvZHVjZSBldmVuIG9uZSB1bml0KS9pLnRlc3QoY29tYmluZWQpO1xuXG4gICAgaWYgKGlzRW5lcmd5RXJyb3IpIHtcbiAgICAgICAgLy8gU2VydmVyIGluZGljYXRlcyBpbnN1ZmZpY2llbnQgZW5lcmd5IGZvciB1bml0IHByb2R1Y3Rpb25cbiAgICAgICAgY29uc3QgY3VyRW5lcmd5ID0gTWF0aC5tYXgoMCwgTnVtYmVyKHN0YXRlLmN1cnJlbnRFbmVyZ3kpIHx8IDApO1xuICAgICAgICBjb25zdCBuZWVkZWQgPSBNYXRoLm1heCgxLCAoQ09ORklHLmVuZXJneVRocmVzaG9sZCB8fCA5MCkgLSBjdXJFbmVyZ3kpO1xuICAgICAgICBjb25zdCByYXRlID0gc3RhdGUucmVnZW5SYXRlIHx8IDEuMDtcbiAgICAgICAgY29uc3Qgd2FpdE1zID0gTWF0aC5tYXgoNjAwMDAsIE1hdGgucm91bmQoKG5lZWRlZCAvIHJhdGUpICogNjAwMDApKTtcbiAgICAgICAgY29uc3Qgd2FpdE1pbnMgPSBNYXRoLnJvdW5kKHdhaXRNcyAvIDYwMDAwKTtcbiAgICAgICAgbG9nKGBTZXJ2ZXIgbWVub2xhayBrZXJqYSAoSFRUUCAke3Jlc3BvbnNlLnN0YXR1c30pOiAke3NlcnZlck1lc3NhZ2UgfHwgJ0VuZXJnaSBkaSBzZXJ2ZXIgYmVsdW0gY3VrdXAnfS4gTWVudW5nZ3UgdGFyZ2V0ICR7Q09ORklHLmVuZXJneVRocmVzaG9sZH3imqEgKH4ke3dhaXRNaW5zfSBtbnQpLi4uYCwgJ3dhcm4nKTtcbiAgICAgICAgc3RhdGUubmV4dFdvcmtUaW1lc3RhbXAgPSBEYXRlLm5vdygpICsgd2FpdE1zO1xuICAgICAgICBzYXZlU3RhdGUoc3RhdGUpO1xuICAgICAgICBzYXZlTGl2ZVN0YXR1cyhzdGF0ZSwgQ09ORklHLCB0cnVlKTtcbiAgICAgICAgdXBkYXRlUGFuZWwoKTtcbiAgICAgICAgcmV0dXJuICd3YWl0aW5nJztcbiAgICB9XG5cbiAgICBsb2coYFNlcnZlciBtZW5vbGFrIGtlcmphIChIVFRQICR7cmVzcG9uc2Uuc3RhdHVzfSkke3NlcnZlck1lc3NhZ2UgPyBgOiAke3NlcnZlck1lc3NhZ2V9YCA6ICcnfWAsICdlcnJvcicpO1xuICAgIHN0YXRlLnJ1bm5pbmcgPSBmYWxzZTtcbiAgICBzZXRSdW5uaW5nVUkoZmFsc2UpO1xuICAgIHNhdmVTdGF0ZShzdGF0ZSk7XG4gICAgc2F2ZUxpdmVTdGF0dXMoc3RhdGUsIENPTkZJRywgdHJ1ZSk7XG4gICAgdXBkYXRlUGFuZWwoKTtcbiAgICBzZW5kTm90aWZpY2F0aW9uKENPTkZJRywgJ1BhcmxhbWVudHVtIEF1dG8gV29ya2VyIGRpamVkYScsIHNlcnZlck1lc3NhZ2UgfHwgYFNlcnZlciBtZW5vbGFrIChIVFRQICR7cmVzcG9uc2Uuc3RhdHVzfSkuYCk7XG4gICAgcmV0dXJuICdwYXVzZWQnO1xufVxuXG5mdW5jdGlvbiBfaGFuZGxlVGltZW91dChjdHgsIGVuZXJneUJlZm9yZSkge1xuICAgIGNvbnN0IHsgc3RhdGUsIGxvZywgc2V0UnVubmluZ1VJLCB1cGRhdGVQYW5lbCwgc2V0VmFsdWUgfSA9IGN0eDtcbiAgICBzdGF0ZS53b3JrUmVzdWx0VW5jZXJ0YWluICAgID0gdHJ1ZTtcbiAgICBzdGF0ZS51bmNlcnRhaW5SZWNvbmNpbGlhdGlvbiA9ICdwZW5kaW5nJztcbiAgICBjdHgudW5jZXJ0YWluRW5lcmd5QmVmb3JlICAgID0gZW5lcmd5QmVmb3JlO1xuICAgIHNldFZhbHVlKCdhd193b3JrUmVzdWx0VW5jZXJ0YWluJywgJ3RydWUnKTtcbiAgICBzZXRWYWx1ZSgnYXdfdW5jZXJ0YWluRW5lcmd5QmVmb3JlJywgSlNPTi5zdHJpbmdpZnkoZW5lcmd5QmVmb3JlKSk7XG4gICAgc3RhdGUucnVubmluZyA9IGZhbHNlO1xuICAgIHNldFJ1bm5pbmdVSShmYWxzZSk7XG4gICAgbG9nKCdSZXF1ZXN0IGtlcmphIHRpbWVvdXQgKDE1IGRldGlrKS4gSGFzaWwgYmVsdW0gcGFzdGk7IHNjcmlwdCBkaWplZGEuIE11YXQgdWxhbmcgaGFsYW1hbiBzZXRlbGFoIG1lbWVyaWtzYSBzdGF0dXMga2VyamEuJywgJ2Vycm9yJyk7XG4gICAgY3R4LnJlY29uY2lsZVVuY2VydGFpbldvcms/LigpO1xuICAgIHVwZGF0ZVBhbmVsKCk7XG4gICAgcmV0dXJuICd1bmNlcnRhaW4nO1xufVxuIiwiLyoqXG4gKiB1aS9pY29ucy5qcyDigJQgSW5saW5lIFNWRyBpY29uIHNldFxuICovXG5cbmV4cG9ydCBjb25zdCBJQ09OUyA9IHtcbiAgICBtaW5pbWl6ZTogICBgPHN2ZyB3aWR0aD1cIjE0XCIgaGVpZ2h0PVwiMTRcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyLjVcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cG9seWxpbmUgcG9pbnRzPVwiNiA5IDEyIDE1IDE4IDlcIj48L3BvbHlsaW5lPjwvc3ZnPmAsXG4gICAgZXhwYW5kOiAgICAgYDxzdmcgd2lkdGg9XCIxNFwiIGhlaWdodD1cIjE0XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMi41XCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PHBvbHlsaW5lIHBvaW50cz1cIjE4IDE1IDEyIDkgNiAxNVwiPjwvcG9seWxpbmU+PC9zdmc+YCxcbiAgICBsb2NrT3BlbjogICBgPHN2ZyB3aWR0aD1cIjE0XCIgaGVpZ2h0PVwiMTRcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyLjVcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cmVjdCB4PVwiM1wiIHk9XCIxMVwiIHdpZHRoPVwiMThcIiBoZWlnaHQ9XCIxMVwiIHJ4PVwiMlwiIHJ5PVwiMlwiPjwvcmVjdD48cGF0aCBkPVwiTTcgMTFWN2E1IDUgMCAwIDEgOS45LTFcIj48L3BhdGg+PC9zdmc+YCxcbiAgICBsb2NrQ2xvc2VkOiBgPHN2ZyB3aWR0aD1cIjE0XCIgaGVpZ2h0PVwiMTRcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyLjVcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cmVjdCB4PVwiM1wiIHk9XCIxMVwiIHdpZHRoPVwiMThcIiBoZWlnaHQ9XCIxMVwiIHJ4PVwiMlwiIHJ5PVwiMlwiPjwvcmVjdD48cGF0aCBkPVwiTTcgMTFWN2E1IDUgMCAwIDEgMTAgMHY0XCI+PC9wYXRoPjwvc3ZnPmAsXG4gICAgc2V0dGluZ3M6ICAgYDxzdmcgd2lkdGg9XCIxNFwiIGhlaWdodD1cIjE0XCIgdmlld0JveD1cIjAgMCAyNCAyNFwiIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwiY3VycmVudENvbG9yXCIgc3Ryb2tlLXdpZHRoPVwiMi41XCIgc3Ryb2tlLWxpbmVjYXA9XCJyb3VuZFwiIHN0cm9rZS1saW5lam9pbj1cInJvdW5kXCI+PGNpcmNsZSBjeD1cIjEyXCIgY3k9XCIxMlwiIHI9XCIzXCI+PC9jaXJjbGU+PHBhdGggZD1cIk0xOS40IDE1YTEuNjUgMS42NSAwIDAgMCAuMzMgMS44MmwuMDYuMDZhMiAyIDAgMCAxLTIuODMgMi44M2wtLjA2LS4wNmExLjY1IDEuNjUgMCAwIDAtMS44Mi0uMzMgMS42NSAxLjY1IDAgMCAwLTEgMS41MVYyMWEyIDIgMCAwIDEtNCAwdi0uMDlBMS42NSAxLjY1IDAgMCAwIDkgMTkuNGExLjY1IDEuNjUgMCAwIDAtMS44Mi4zM2wtLjA2LjA2YTIgMiAwIDAgMS0yLjgzLTIuODNsLjA2LS4wNkExLjY1IDEuNjUgMCAwIDAgNC42IDlhMS42NSAxLjY1IDAgMCAwLTEuNTEtMUgzYTIgMiAwIDAgMSAwLTRoLjA5QTEuNjUgMS42NSAwIDAgMCA0LjYgNC42YTEuNjUgMS42NSAwIDAgMC0uMzMtMS44MmwtLjA2LS4wNmEyIDIgMCAwIDEgMi44My0yLjgzbC4wNi4wNkExLjY1IDEuNjUgMCAwIDAgOSA0LjZhMS42NSAxLjY1IDAgMCAwIDEtMS41MVYzYTIgMiAwIDAgMSA0IDB2LjA5YTEuNjUgMS42NSAwIDAgMCAxIDEuNTEgMS42NSAxLjY1IDAgMCAwIDEuODItLjMzbC4wNi0uMDZhMiAyIDAgMCAxIDIuODMgMi44M2wtLjA2LjA2QTEuNjUgMS42NSAwIDAgMCAxOS40IDlhMS42NSAxLjY1IDAgMCAwIDEuNTEgMUgyMWEyIDIgMCAwIDEgMCA0aC0uMDlhMS42NSAxLjY1IDAgMCAwLTEuNTEgMXpcIj48L3BhdGg+PC9zdmc+YCxcbiAgICBjbG9zZTogICAgICBgPHN2ZyB3aWR0aD1cIjE0XCIgaGVpZ2h0PVwiMTRcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyLjVcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48bGluZSB4MT1cIjE4XCIgeTE9XCI2XCIgeDI9XCI2XCIgeTI9XCIxOFwiPjwvbGluZT48bGluZSB4MT1cIjZcIiB5MT1cIjZcIiB4Mj1cIjE4XCIgeTI9XCIxOFwiPjwvbGluZT48L3N2Zz5gLFxuICAgIHJvYm90OiAgICAgIGA8c3ZnIHdpZHRoPVwiMTZcIiBoZWlnaHQ9XCIxNlwiIHZpZXdCb3g9XCIwIDAgMjQgMjRcIiBmaWxsPVwibm9uZVwiIHN0cm9rZT1cImN1cnJlbnRDb2xvclwiIHN0cm9rZS13aWR0aD1cIjJcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48cmVjdCB4PVwiM1wiIHk9XCIxMVwiIHdpZHRoPVwiMThcIiBoZWlnaHQ9XCIxMFwiIHJ4PVwiMlwiPjwvcmVjdD48Y2lyY2xlIGN4PVwiMTJcIiBjeT1cIjVcIiByPVwiMlwiPjwvY2lyY2xlPjxwYXRoIGQ9XCJNMTIgN3Y0XCI+PC9wYXRoPjxsaW5lIHgxPVwiOFwiIHkxPVwiMTZcIiB4Mj1cIjhcIiB5Mj1cIjE2XCI+PC9saW5lPjxsaW5lIHgxPVwiMTZcIiB5MT1cIjE2XCIgeDI9XCIxNlwiIHkyPVwiMTZcIj48L2xpbmU+PC9zdmc+YCxcbiAgICBjaGFydDogICAgICBgPHN2ZyB3aWR0aD1cIjE0XCIgaGVpZ2h0PVwiMTRcIiB2aWV3Qm94PVwiMCAwIDI0IDI0XCIgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJjdXJyZW50Q29sb3JcIiBzdHJva2Utd2lkdGg9XCIyLjVcIiBzdHJva2UtbGluZWNhcD1cInJvdW5kXCIgc3Ryb2tlLWxpbmVqb2luPVwicm91bmRcIj48bGluZSB4MT1cIjE4XCIgeTE9XCIyMFwiIHgyPVwiMThcIiB5Mj1cIjEwXCI+PC9saW5lPjxsaW5lIHgxPVwiMTJcIiB5MT1cIjIwXCIgeDI9XCIxMlwiIHkyPVwiNFwiPjwvbGluZT48bGluZSB4MT1cIjZcIiB5MT1cIjIwXCIgeDI9XCI2XCIgeTI9XCIxNFwiPjwvbGluZT48L3N2Zz5gXG59O1xuIiwiLyoqXG4gKiB1aS9wYW5lbC5qcyDigJQgTWFpbiBmbG9hdGluZyBwYW5lbCBpbmplY3RlZCBpbnRvIHRoZSBwYWdlXG4gKlxuICogRXh0cmFjdGVkIGZyb20gY3JlYXRlUGFuZWwoKSwgdXBkYXRlUGFuZWwoKSwgc2V0dXBEcmFnQW5kRHJvcCgpLFxuICogc2V0dXBQYW5lbENvbnRyb2xzKCksIHNldHVwUmVzcG9uc2l2ZUJlaGF2aW9yKCkgaW4gRXh0ZW5zaW9uLmpzLlxuICogQWxsIGxvZ2ljIGlzIGlkZW50aWNhbCDigJQgb25seSBpbXBvcnRzIHJlcGxhY2UgZ2xvYmFsIHZhcmlhYmxlIHJlZmVyZW5jZXMuXG4gKi9cblxuaW1wb3J0IHsgZ2V0TGl2ZUNvdW50ZG93biwgZ2V0VGltZVRvRnVsbEVuZXJneSwgZ2V0VGltZVRvRnVsbEVuZXJneSBhcyB0dGZlLCBwYXRjaFBhZ2VWaXN1YWxFbmVyZ3kgfSBmcm9tICcuLi9lbmVyZ3kuanMnO1xuaW1wb3J0IHsgZ2V0VGltZVVudGlsRXhwaXJ5IH0gZnJvbSAnLi4vdG9rZW4uanMnO1xuaW1wb3J0IHsgZ2V0VmFsdWUsIHNldFZhbHVlIH0gZnJvbSAnLi4vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBzYXZlU3RhdGUsIHNhdmVMaXZlU3RhdHVzIH0gZnJvbSAnLi4vc3RhdGUuanMnO1xuaW1wb3J0IHsgSUNPTlMgfSBmcm9tICcuL2ljb25zLmpzJztcblxuY29uc3QgSEVBREVSX0JUTl9TVFlMRSA9IGBcbiAgICBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDsgYm9yZGVyOiBub25lOyBjdXJzb3I6IHBvaW50ZXI7IHBhZGRpbmc6IDA7XG4gICAgYm9yZGVyLXJhZGl1czogNnB4OyBkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcbiAgICB3aWR0aDogMjRweDsgaGVpZ2h0OiAyNHB4OyBtaW4td2lkdGg6IDI0cHg7IG1heC13aWR0aDogMjRweDsgZmxleC1zaHJpbms6IDAgIWltcG9ydGFudDtcbiAgICB0cmFuc2l0aW9uOiBhbGwgMC4xNXMgZWFzZTsgY29sb3I6ICM4ODkyYjA7IGxpbmUtaGVpZ2h0OiAxOyBib3gtc2l6aW5nOiBib3JkZXItYm94O1xuYDtcblxuZnVuY3Rpb24gX2luamVjdFBhbmVsU3R5bGVzKCkge1xuICAgIGlmICh0eXBlb2YgZG9jdW1lbnQgPT09ICd1bmRlZmluZWQnIHx8IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1wYW5lbC1zdHlsZXMnKSkgcmV0dXJuO1xuICAgIGNvbnN0IHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3R5bGUnKTtcbiAgICBzdHlsZS5pZCA9ICdhdy1wYW5lbC1zdHlsZXMnO1xuICAgIHN0eWxlLnRleHRDb250ZW50ID0gYFxuICAgICAgICBAa2V5ZnJhbWVzIGF3LXB1bHNlLWdsb3cge1xuICAgICAgICAgICAgMCUge1xuICAgICAgICAgICAgICAgIGJveC1zaGFkb3c6IDAgMTZweCA0MHB4IHJnYmEoMCwgMCwgMCwgMC41NSksIDAgMCAxMHB4IHJnYmEoMCwgMjU1LCAxMzYsIDAuMjUpO1xuICAgICAgICAgICAgICAgIGJvcmRlci1jb2xvcjogcmdiYSgwLCAyNTUsIDEzNiwgMC40NSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICA1MCUge1xuICAgICAgICAgICAgICAgIGJveC1zaGFkb3c6IDAgMTZweCA0NHB4IHJnYmEoMCwgMCwgMCwgMC42NSksIDAgMCAyMHB4IHJnYmEoMCwgMjU1LCAxMzYsIDAuNjUpO1xuICAgICAgICAgICAgICAgIGJvcmRlci1jb2xvcjogcmdiYSgwLCAyNTUsIDEzNiwgMC44NSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAxMDAlIHtcbiAgICAgICAgICAgICAgICBib3gtc2hhZG93OiAwIDE2cHggNDBweCByZ2JhKDAsIDAsIDAsIDAuNTUpLCAwIDAgMTBweCByZ2JhKDAsIDI1NSwgMTM2LCAwLjI1KTtcbiAgICAgICAgICAgICAgICBib3JkZXItY29sb3I6IHJnYmEoMCwgMjU1LCAxMzYsIDAuNDUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIEBrZXlmcmFtZXMgYXctcGlsbC1wdWxzZS1nbG93IHtcbiAgICAgICAgICAgIDAlIHtcbiAgICAgICAgICAgICAgICBib3gtc2hhZG93OiAwIDhweCAyNHB4IHJnYmEoMCwgMCwgMCwgMC42NSksIDAgMCA4cHggcmdiYSgwLCAyNTUsIDEzNiwgMC4zKTtcbiAgICAgICAgICAgICAgICBib3JkZXItY29sb3I6IHJnYmEoMCwgMjU1LCAxMzYsIDAuNDUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgNTAlIHtcbiAgICAgICAgICAgICAgICBib3gtc2hhZG93OiAwIDEwcHggMjhweCByZ2JhKDAsIDAsIDAsIDAuNzUpLCAwIDAgMThweCByZ2JhKDAsIDI1NSwgMTM2LCAwLjc1KTtcbiAgICAgICAgICAgICAgICBib3JkZXItY29sb3I6IHJnYmEoMCwgMjU1LCAxMzYsIDAuOSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAxMDAlIHtcbiAgICAgICAgICAgICAgICBib3gtc2hhZG93OiAwIDhweCAyNHB4IHJnYmEoMCwgMCwgMCwgMC42NSksIDAgMCA4cHggcmdiYSgwLCAyNTUsIDEzNiwgMC4zKTtcbiAgICAgICAgICAgICAgICBib3JkZXItY29sb3I6IHJnYmEoMCwgMjU1LCAxMzYsIDAuNDUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC5hdy1yZWFkeS1nbG93IHtcbiAgICAgICAgICAgIGFuaW1hdGlvbjogYXctcHVsc2UtZ2xvdyAyLjJzIGluZmluaXRlIGVhc2UtaW4tb3V0ICFpbXBvcnRhbnQ7XG4gICAgICAgIH1cbiAgICAgICAgI2F3LXBpbGwtY29udGFpbmVyLmF3LXJlYWR5LWdsb3cge1xuICAgICAgICAgICAgYW5pbWF0aW9uOiBhdy1waWxsLXB1bHNlLWdsb3cgMi4ycyBpbmZpbml0ZSBlYXNlLWluLW91dCAhaW1wb3J0YW50O1xuICAgICAgICB9XG4gICAgICAgIC5hdy1idG4tYWN0aW9uIHtcbiAgICAgICAgICAgIHRyYW5zaXRpb246IGFsbCAwLjE4cyBjdWJpYy1iZXppZXIoMC40LCAwLCAwLjIsIDEpICFpbXBvcnRhbnQ7XG4gICAgICAgICAgICBvdXRsaW5lOiBub25lICFpbXBvcnRhbnQ7XG4gICAgICAgICAgICB1c2VyLXNlbGVjdDogbm9uZSAhaW1wb3J0YW50O1xuICAgICAgICB9XG4gICAgICAgIC5hdy1idG4tYWN0aW9uOmhvdmVyOm5vdCg6ZGlzYWJsZWQpIHtcbiAgICAgICAgICAgIGZpbHRlcjogYnJpZ2h0bmVzcygxLjE1KSAhaW1wb3J0YW50O1xuICAgICAgICAgICAgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKC0xLjVweCkgIWltcG9ydGFudDtcbiAgICAgICAgfVxuICAgICAgICAuYXctYnRuLWFjdGlvbjphY3RpdmU6bm90KDpkaXNhYmxlZCkge1xuICAgICAgICAgICAgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKDAuNXB4KSBzY2FsZSgwLjk3KSAhaW1wb3J0YW50O1xuICAgICAgICAgICAgZmlsdGVyOiBicmlnaHRuZXNzKDAuOTIpICFpbXBvcnRhbnQ7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LWhlYWRlci1idG4ge1xuICAgICAgICAgICAgdHJhbnNpdGlvbjogYWxsIDAuMTVzIGVhc2UgIWltcG9ydGFudDtcbiAgICAgICAgICAgIGJvcmRlci1yYWRpdXM6IDZweCAhaW1wb3J0YW50O1xuICAgICAgICB9XG4gICAgICAgIC5hdy1oZWFkZXItYnRuOmhvdmVyIHtcbiAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4xKSAhaW1wb3J0YW50O1xuICAgICAgICAgICAgY29sb3I6ICNmZmYgIWltcG9ydGFudDtcbiAgICAgICAgfVxuICAgICAgICAuYXctcGlsbC1idG4ge1xuICAgICAgICAgICAgZGlzcGxheTogaW5saW5lLWZsZXggIWltcG9ydGFudDtcbiAgICAgICAgICAgIGFsaWduLWl0ZW1zOiBjZW50ZXIgIWltcG9ydGFudDtcbiAgICAgICAgICAgIGp1c3RpZnktY29udGVudDogY2VudGVyICFpbXBvcnRhbnQ7XG4gICAgICAgICAgICBjdXJzb3I6IHBvaW50ZXIgIWltcG9ydGFudDtcbiAgICAgICAgICAgIG91dGxpbmU6IG5vbmUgIWltcG9ydGFudDtcbiAgICAgICAgICAgIHRyYW5zaXRpb246IGFsbCAwLjE4cyBjdWJpYy1iZXppZXIoMC40LCAwLCAwLjIsIDEpICFpbXBvcnRhbnQ7XG4gICAgICAgICAgICB1c2VyLXNlbGVjdDogbm9uZSAhaW1wb3J0YW50O1xuICAgICAgICAgICAgcGFkZGluZzogMCAhaW1wb3J0YW50O1xuICAgICAgICB9XG4gICAgICAgIC5hdy1waWxsLWJ0bjpob3Zlcjpub3QoOmRpc2FibGVkKSB7XG4gICAgICAgICAgICBmaWx0ZXI6IGJyaWdodG5lc3MoMS4yKSAhaW1wb3J0YW50O1xuICAgICAgICAgICAgdHJhbnNmb3JtOiBzY2FsZSgxLjA4KSAhaW1wb3J0YW50O1xuICAgICAgICB9XG4gICAgICAgIC5hdy1waWxsLWJ0bjphY3RpdmU6bm90KDpkaXNhYmxlZCkge1xuICAgICAgICAgICAgdHJhbnNmb3JtOiBzY2FsZSgwLjk0KSAhaW1wb3J0YW50O1xuICAgICAgICB9XG4gICAgICAgIC5hdy1waWxsLWJveDpob3ZlciB7XG4gICAgICAgICAgICBib3JkZXItY29sb3I6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4yNSkgIWltcG9ydGFudDtcbiAgICAgICAgICAgIGJveC1zaGFkb3c6IDAgMTJweCAzNHB4IHJnYmEoMCwgMCwgMCwgMC43NSksIDAgMCAxNHB4IHJnYmEoMCwgMjE3LCAyNTUsIDAuMjIpICFpbXBvcnRhbnQ7XG4gICAgICAgIH1cbiAgICBgO1xuICAgIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNEYXNoYm9hcmRQYWdlKCkge1xuICAgIGlmICh0eXBlb2Ygd2luZG93ID09PSAndW5kZWZpbmVkJykgcmV0dXJuIHRydWU7XG4gICAgY29uc3QgcGF0aG5hbWUgPSB3aW5kb3cubG9jYXRpb24ucGF0aG5hbWUgfHwgJyc7XG4gICAgY29uc3QgY2xlYW5QYXRoID0gcGF0aG5hbWUubGVuZ3RoID4gMSAmJiBwYXRobmFtZS5lbmRzV2l0aCgnLycpID8gcGF0aG5hbWUuc2xpY2UoMCwgLTEpIDogcGF0aG5hbWU7XG4gICAgcmV0dXJuIGNsZWFuUGF0aCA9PT0gJy9kYXNoYm9hcmQnIHx8IGNsZWFuUGF0aC5zdGFydHNXaXRoKCcvZGFzaGJvYXJkLycpIHx8IGNsZWFuUGF0aCA9PT0gJy8nIHx8IGNsZWFuUGF0aCA9PT0gJyc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzaG91bGRQYW5lbEJlVmlzaWJsZShzdGF0ZSwgQ09ORklHKSB7XG4gICAgaWYgKENPTkZJRy5wYW5lbERhc2hib2FyZE9ubHkgJiYgIWlzRGFzaGJvYXJkUGFnZSgpKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgaWYgKENPTkZJRy5wYW5lbExlYWRlck9ubHkgJiYgc3RhdGUudGFiTG9ja01hbmFnZWQgJiYgIXN0YXRlLmlzVGFiTG9ja093bmVyKSB7XG4gICAgICAgIGlmICh0eXBlb2YgZG9jdW1lbnQgIT09ICd1bmRlZmluZWQnICYmIGRvY3VtZW50LmhpZGRlbikge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuICAgIGlmIChzdGF0ZS5wYW5lbFZpc2libGUgPT09IGZhbHNlKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVQYW5lbFZpc2liaWxpdHkoc3RhdGUsIENPTkZJRykge1xuICAgIGNvbnN0IHBhbmVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LXBhbmVsJyk7XG4gICAgaWYgKCFwYW5lbCkgcmV0dXJuO1xuICAgIGNvbnN0IHZpc2libGUgPSBzdGF0ZS51c2VyTWFudWFsbHlUb2dnbGVkUGFuZWwgPyBCb29sZWFuKHN0YXRlLnBhbmVsVmlzaWJsZSkgOiBzaG91bGRQYW5lbEJlVmlzaWJsZShzdGF0ZSwgQ09ORklHKTtcbiAgICBwYW5lbC5zdHlsZS5kaXNwbGF5ID0gdmlzaWJsZSA/ICdibG9jaycgOiAnbm9uZSc7XG59XG5cbi8qKiBAcGFyYW0ge29iamVjdH0gc3RhdGUgQHBhcmFtIHtvYmplY3R9IENPTkZJRyBAcGFyYW0ge29iamVjdH0gY3R4ICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlUGFuZWwoc3RhdGUsIENPTkZJRywgY3R4KSB7XG4gICAgY29uc3Qgb2xkID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LXBhbmVsJyk7XG4gICAgaWYgKG9sZCkgb2xkLnJlbW92ZSgpO1xuXG4gICAgX2luamVjdFBhbmVsU3R5bGVzKCk7XG5cbiAgICBzdGF0ZS51c2VyTWFudWFsbHlUb2dnbGVkUGFuZWwgPSBmYWxzZTtcbiAgICBpZiAoQ09ORklHLnBhbmVsRGFzaGJvYXJkT25seSAmJiBpc0Rhc2hib2FyZFBhZ2UoKSkge1xuICAgICAgICBzdGF0ZS5wYW5lbFZpc2libGUgPSB0cnVlO1xuICAgICAgICBzZXRWYWx1ZSgncGFuZWxWaXNpYmxlJywgJ3RydWUnKTtcbiAgICB9XG5cbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgY29uc3QgcGFuZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgcGFuZWwuaWQgPSAnYXctcGFuZWwnO1xuICAgICAgICBwYW5lbC5zdHlsZS5jc3NUZXh0ID0gYFxuICAgICAgICAgICAgcG9zaXRpb246IGZpeGVkOyB0b3A6ICR7c3RhdGUucGFuZWxZfXB4OyBsZWZ0OiAke3N0YXRlLnBhbmVsWH1weDtcbiAgICAgICAgICAgIGNvbG9yOiAjZTBlMGUwO1xuICAgICAgICAgICAgZm9udC1mYW1pbHk6IC1hcHBsZS1zeXN0ZW0sIEJsaW5rTWFjU3lzdGVtRm9udCwgJ1NlZ29lIFVJJywgUm9ib3RvLCBIZWx2ZXRpY2EsIEFyaWFsLCBzYW5zLXNlcmlmO1xuICAgICAgICAgICAgZm9udC1zaXplOiAxMnB4O1xuICAgICAgICAgICAgei1pbmRleDogOTk5OTk7XG4gICAgICAgICAgICBib3gtc2l6aW5nOiBib3JkZXItYm94O1xuICAgICAgICAgICAgdXNlci1zZWxlY3Q6IG5vbmU7XG4gICAgICAgICAgICB0cmFuc2l0aW9uOiBib3JkZXItY29sb3IgMC4zcyBlYXNlLCBib3gtc2hhZG93IDAuM3MgZWFzZTtcbiAgICAgICAgICAgIG92ZXJmbG93OiB2aXNpYmxlO1xuICAgICAgICAgICAgZGlzcGxheTogJHtzaG91bGRQYW5lbEJlVmlzaWJsZShzdGF0ZSwgQ09ORklHKSA/ICdibG9jaycgOiAnbm9uZSd9O1xuICAgICAgICBgO1xuICAgICAgICBwYW5lbC5pbm5lckhUTUwgPSBfYnVpbGRQYW5lbEhUTUwoc3RhdGUsIENPTkZJRyk7XG4gICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQocGFuZWwpO1xuICAgICAgICBhcHBseVBhbmVsTW9kZShzdGF0ZSwgQm9vbGVhbihzdGF0ZS5wYW5lbE1pbmltaXplZCkpO1xuICAgICAgICBfc2V0dXBEcmFnQW5kRHJvcChwYW5lbCwgc3RhdGUsIENPTkZJRyk7XG4gICAgICAgIF9zZXR1cFBhbmVsQ29udHJvbHMocGFuZWwsIHN0YXRlLCBDT05GSUcsIGN0eCk7XG4gICAgICAgIF9zZXR1cFJlc3BvbnNpdmVCZWhhdmlvcihwYW5lbCwgc3RhdGUsIENPTkZJRyk7XG5cbiAgICAgICAgLy8gRWNvLU1vZGUgV2FrZXVwOiBpbnN0YW50bHkgcmUtcmVuZGVyIFVJIHdoZW4gdGFiIGlzIGJyb3VnaHQgdG8gZm9yZWdyb3VuZFxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCd2aXNpYmlsaXR5Y2hhbmdlJywgKCkgPT4ge1xuICAgICAgICAgICAgaWYgKCFkb2N1bWVudC5oaWRkZW4pIHtcbiAgICAgICAgICAgICAgICBjdHgudXBkYXRlUGFuZWw/LigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBjdHgubG9nKCdQYW5lbCB2NS4xMS4wIHNpYXAhJywgJ3N1Y2Nlc3MnKTtcbiAgICB9LCAyNTApO1xufVxuXG4vKiogQHBhcmFtIHtvYmplY3R9IHN0YXRlIEBwYXJhbSB7b2JqZWN0fSBDT05GSUcgQHBhcmFtIHtvYmplY3R9IHdvcmtIaXN0b3J5IEBwYXJhbSB7b2JqZWN0fSBjdHggKi9cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVQYW5lbChzdGF0ZSwgQ09ORklHLCB3b3JrSGlzdG9yeSwgY3R4KSB7XG4gICAgaWYgKCFjaHJvbWUucnVudGltZT8uaWQpIHJldHVybjtcbiAgICBjb25zdCB7IGdldFN5bmNlZEVuZXJneSwgZ2V0UGxheWVyTGV2ZWwsIGdldE1heEVuZXJneUZvckxldmVsIH0gPSBjdHg7XG5cbiAgICBpZiAoIXN0YXRlLnVzZXJNYW51YWxseVRvZ2dsZWRQYW5lbCkge1xuICAgICAgICB1cGRhdGVQYW5lbFZpc2liaWxpdHkoc3RhdGUsIENPTkZJRyk7XG4gICAgfVxuXG4gICAgLy8gUmVsb2FkIHN0YXRlIGluIHN0YW5kYnkgdGFic1xuICAgIGlmIChzdGF0ZS50YWJMb2NrTWFuYWdlZCAmJiAhc3RhdGUuaXNUYWJMb2NrT3duZXIpIHtcbiAgICAgICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcbiAgICAgICAgaWYgKG5vdyAtICh1cGRhdGVQYW5lbC5fbGFzdFN0YW5kYnkgfHwgMCkgPj0gMzAwMCkge1xuICAgICAgICAgICAgY3R4LnJlbG9hZFN0YXRlRnJvbVN0b3JhZ2U/LigpO1xuICAgICAgICAgICAgdXBkYXRlUGFuZWwuX2xhc3RTdGFuZGJ5ID0gbm93O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgZW5lcmd5ID0gY3R4LmdldFN5bmNlZEVuZXJneShzdGF0ZSk7XG4gICAgaWYgKGVuZXJneSkge1xuICAgICAgICBzdGF0ZS5jdXJyZW50RW5lcmd5ID0gZW5lcmd5LmN1cnJlbnQ7XG4gICAgICAgIHN0YXRlLm1heEVuZXJneSA9IGVuZXJneS5tYXg7XG4gICAgICAgIGlmIChzdGF0ZS5kb21FbmVyZ3lTdGFsZSkge1xuICAgICAgICAgICAgcGF0Y2hQYWdlVmlzdWFsRW5lcmd5KHN0YXRlLmN1cnJlbnRFbmVyZ3ksIHN0YXRlLm1heEVuZXJneSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBLZWVwIG5leHQgd29yayBzY2hlZHVsZSBhY2N1cmF0ZWx5IHN5bmNocm9uaXplZCB3aXRoIGN1cnJlbnQgZW5lcmd5XG4gICAgaWYgKHN0YXRlLmN1cnJlbnRFbmVyZ3kgPCBDT05GSUcuZW5lcmd5VGhyZXNob2xkKSB7XG4gICAgICAgIGNvbnN0IHJhdGUgPSBzdGF0ZS5yZWdlblJhdGUgfHwgMS4wO1xuICAgICAgICBjb25zdCBuZWVkZWRNcyA9IE1hdGgubWF4KDEsIChDT05GSUcuZW5lcmd5VGhyZXNob2xkIC0gc3RhdGUuY3VycmVudEVuZXJneSkgLyByYXRlKSAqIDYwMDAwO1xuICAgICAgICBpZiAoIXN0YXRlLm5leHRXb3JrVGltZXN0YW1wKSB7XG4gICAgICAgICAgICBzdGF0ZS5uZXh0V29ya1RpbWVzdGFtcCA9IERhdGUubm93KCkgKyBuZWVkZWRNcztcbiAgICAgICAgfSBlbHNlIGlmIChzdGF0ZS5uZXh0V29ya1RpbWVzdGFtcCA+IERhdGUubm93KCkpIHtcbiAgICAgICAgICAgIGNvbnN0IHJlbWFpbmluZyA9IHN0YXRlLm5leHRXb3JrVGltZXN0YW1wIC0gRGF0ZS5ub3coKTtcbiAgICAgICAgICAgIGlmIChNYXRoLmFicyhyZW1haW5pbmcgLSBuZWVkZWRNcykgPiAxMjAwMDApIHtcbiAgICAgICAgICAgICAgICBzdGF0ZS5uZXh0V29ya1RpbWVzdGFtcCA9IERhdGUubm93KCkgKyBuZWVkZWRNcztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gZWxzZSBpZiAoc3RhdGUucnVubmluZyAmJiBzdGF0ZS5pc1RhYkxvY2tPd25lciAmJiAhc3RhdGUud29ya0luRmxpZ2h0ICYmICFzdGF0ZS53b3JrUmVzdWx0VW5jZXJ0YWluKSB7XG4gICAgICAgIGlmICghc3RhdGUubmV4dFdvcmtUaW1lc3RhbXAgfHwgRGF0ZS5ub3coKSA+PSBzdGF0ZS5uZXh0V29ya1RpbWVzdGFtcCkge1xuICAgICAgICAgICAgc3RhdGUubmV4dFdvcmtUaW1lc3RhbXAgPSBEYXRlLm5vdygpO1xuICAgICAgICAgICAgY3R4Lndha2VQZW5kaW5nV29yaz8uKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBuZXdMZXZlbCA9IGN0eC5nZXRQbGF5ZXJMZXZlbChzdGF0ZSk7XG4gICAgaWYgKG5ld0xldmVsICE9PSBzdGF0ZS5wbGF5ZXJMZXZlbCkge1xuICAgICAgICBzdGF0ZS5wbGF5ZXJMZXZlbCA9IG5ld0xldmVsO1xuICAgICAgICBpZiAoIWVuZXJneSkge1xuICAgICAgICAgICAgY29uc3QgbWF4ID0gZ2V0TWF4RW5lcmd5Rm9yTGV2ZWwobmV3TGV2ZWwpO1xuICAgICAgICAgICAgaWYgKG1heCAhPT0gc3RhdGUubWF4RW5lcmd5KSBzdGF0ZS5tYXhFbmVyZ3kgPSBtYXg7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBlbmVyZ3lGdWxsID0gc3RhdGUubWF4RW5lcmd5ID4gMCAmJiBzdGF0ZS5jdXJyZW50RW5lcmd5ID49IHN0YXRlLm1heEVuZXJneTtcbiAgICBpZiAoIWVuZXJneUZ1bGwpIHtcbiAgICAgICAgc3RhdGUuZW5lcmd5RnVsbEFsZXJ0QWN0aXZlID0gZmFsc2U7XG4gICAgfSBlbHNlIGlmIChDT05GSUcuZW5lcmd5RnVsbEFsZXJ0RW5hYmxlZCAmJiAhc3RhdGUuZW5lcmd5RnVsbEFsZXJ0QWN0aXZlKSB7XG4gICAgICAgIHN0YXRlLmVuZXJneUZ1bGxBbGVydEFjdGl2ZSA9IHRydWU7XG4gICAgICAgIGlmICghc3RhdGUudGFiTG9ja01hbmFnZWQgfHwgc3RhdGUuaXNUYWJMb2NrT3duZXIpIHtcbiAgICAgICAgICAgIGN0eC5sb2coYEVuZXJnaSBwZW51aCAoJHtzdGF0ZS5jdXJyZW50RW5lcmd5fS8ke3N0YXRlLm1heEVuZXJneX0pISBNZW5nZWtzZWt1c2kgc2hpZnQuLi5gLCAnd2FybicpO1xuICAgICAgICAgICAgY3R4LnBsYXlFbmVyZ3lGdWxsQWxhcm0/LihDT05GSUcpO1xuICAgICAgICAgICAgY3R4LnNlbmROb3RpZmljYXRpb24/LihDT05GSUcsICdFbmVyZ2kgUGVudWgnLCBgRW5lcmdpICR7c3RhdGUuY3VycmVudEVuZXJneX0vJHtzdGF0ZS5tYXhFbmVyZ3l9LiBTaWFwIGJla2VyamEuYCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHN0YXRlLnJ1bm5pbmcgJiYgc3RhdGUuaXNUYWJMb2NrT3duZXIgJiYgIXN0YXRlLndvcmtJbkZsaWdodCAmJiAhc3RhdGUud29ya1Jlc3VsdFVuY2VydGFpbikge1xuICAgICAgICAgICAgaWYgKCFzdGF0ZS5uZXh0V29ya1RpbWVzdGFtcCB8fCBEYXRlLm5vdygpID49IHN0YXRlLm5leHRXb3JrVGltZXN0YW1wKSB7XG4gICAgICAgICAgICAgICAgc3RhdGUubmV4dFdvcmtUaW1lc3RhbXAgPSBEYXRlLm5vdygpO1xuICAgICAgICAgICAgICAgIGN0eC53YWtlUGVuZGluZ1dvcms/LigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gUmVnaW9uICYgQnVmZiBhdXRvLWRldGVjdGlvblxuICAgIGlmIChjdHguZ2V0UmVnaW9uRGV0YWlscykge1xuICAgICAgICBjb25zdCByZWcgPSBjdHguZ2V0UmVnaW9uRGV0YWlscygpO1xuICAgICAgICBpZiAocmVnKSB7XG4gICAgICAgICAgICBpZiAocmVnLm5hbWUgJiYgcmVnLm5hbWUgIT09IHN0YXRlLnJlZ2lvbk5hbWUpIHtcbiAgICAgICAgICAgICAgICBzdGF0ZS5yZWdpb25OYW1lID0gcmVnLm5hbWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocmVnLmJvbnVzUGVyY2VudCAhPT0gc3RhdGUucmVnaW9uSGVhbHRoQm9udXNQZXJjZW50KSB7XG4gICAgICAgICAgICAgICAgc3RhdGUucmVnaW9uSGVhbHRoQm9udXNQZXJjZW50ID0gcmVnLmJvbnVzUGVyY2VudDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyZWcuYm9udXNNdWx0aXBsaWVyICYmIHJlZy5ib251c011bHRpcGxpZXIgIT09IHN0YXRlLnJlZ2VuUmF0ZSkge1xuICAgICAgICAgICAgICAgIHN0YXRlLnJlZ2VuUmF0ZSA9IHJlZy5ib251c011bHRpcGxpZXI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBfcGF0Y2hFbCgnYXctcmVnaW9uLW5hbWUnLCBlbCA9PiBlbC50ZXh0Q29udGVudCA9IHN0YXRlLnJlZ2lvbk5hbWUgfHwgJ1dpbGF5YWgnKTtcbiAgICAgICAgICAgIF9wYXRjaEVsKCdhdy1yZWdpb24tYnVmZicsIGVsID0+IHtcbiAgICAgICAgICAgICAgICBlbC50ZXh0Q29udGVudCA9IHN0YXRlLnJlZ2lvbkhlYWx0aEJvbnVzUGVyY2VudCA+IDBcbiAgICAgICAgICAgICAgICAgICAgPyBgKyR7c3RhdGUucmVnaW9uSGVhbHRoQm9udXNQZXJjZW50fSUgUmVnZW5gXG4gICAgICAgICAgICAgICAgICAgIDogJ05vcm1hbCAoMS4weCknO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBFY28tTW9kZTogU2tpcCBhbGwgdmlzdWFsIERPTSBtb2RpZmljYXRpb25zIGlmIHRhYiBpcyBpbiB0aGUgYmFja2dyb3VuZFxuICAgIC8vIENvbnNlcnZlcyBSQU0gYW5kIENQVSB3aGlsZSBrZWVwaW5nIHRpbWVycyBhbmQgd29yayBzY2hlZHVsZXIgMTAwJSBhY2N1cmF0ZVxuICAgIGNvbnN0IGlzSGlkZGVuID0gdHlwZW9mIGRvY3VtZW50ICE9PSAndW5kZWZpbmVkJyAmJiBkb2N1bWVudC5oaWRkZW47XG4gICAgaWYgKENPTkZJRy5lY29Nb2RlRW5hYmxlZCAhPT0gZmFsc2UgJiYgaXNIaWRkZW4pIHtcbiAgICAgICAgaWYgKCFzdGF0ZS50YWJMb2NrTWFuYWdlZCB8fCBzdGF0ZS5pc1RhYkxvY2tPd25lcikge1xuICAgICAgICAgICAgc2F2ZUxpdmVTdGF0dXMoc3RhdGUsIENPTkZJRyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHRocmVzaG9sZCA9IENPTkZJRy5lbmVyZ3lUaHJlc2hvbGQgfHwgMTA7XG4gICAgY29uc3QgaXNSZWFkeVRvV29yayA9IHN0YXRlLmN1cnJlbnRFbmVyZ3kgPj0gdGhyZXNob2xkO1xuXG4gICAgLy8gRHluYW1pYyBnbG93IG9uIHBhbmVsICYgcGlsbCB3aGVuIHJlYWR5IHRvIHdvcmtcbiAgICBjb25zdCBwYW5lbEVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LXBhbmVsJyk7XG4gICAgY29uc3QgcGlsbEVsICA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1waWxsLWNvbnRhaW5lcicpO1xuICAgIGlmIChwYW5lbEVsKSB7XG4gICAgICAgIGlmIChpc1JlYWR5VG9Xb3JrICYmIHN0YXRlLnJ1bm5pbmcgJiYgIXN0YXRlLndvcmtJbkZsaWdodCkge1xuICAgICAgICAgICAgcGFuZWxFbC5jbGFzc0xpc3QuYWRkKCdhdy1yZWFkeS1nbG93Jyk7XG4gICAgICAgICAgICBpZiAocGlsbEVsKSBwaWxsRWwuY2xhc3NMaXN0LmFkZCgnYXctcmVhZHktZ2xvdycpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcGFuZWxFbC5jbGFzc0xpc3QucmVtb3ZlKCdhdy1yZWFkeS1nbG93Jyk7XG4gICAgICAgICAgICBpZiAocGlsbEVsKSBwaWxsRWwuY2xhc3NMaXN0LnJlbW92ZSgnYXctcmVhZHktZ2xvdycpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gRE9NIHVwZGF0ZXNcbiAgICBjb25zdCBzYWZlTWF4ID0gKHN0YXRlLm1heEVuZXJneSAmJiBzdGF0ZS5tYXhFbmVyZ3kgPiAwKSA/IHN0YXRlLm1heEVuZXJneSA6IDExMDtcbiAgICBjb25zdCBlbmVyZ3lQY3QgPSBNYXRoLm1heCgwLCBNYXRoLm1pbigxMDAsIChzdGF0ZS5jdXJyZW50RW5lcmd5IC8gc2FmZU1heCkgKiAxMDApKTtcbiAgICBfcGF0Y2hFbCgnYXctZW5lcmd5LXRleHQnLCAgIGVsID0+IGVsLnRleHRDb250ZW50ID0gYCR7c3RhdGUuY3VycmVudEVuZXJneX0vJHtzdGF0ZS5tYXhFbmVyZ3l9YCk7XG4gICAgX3BhdGNoRWwoJ2F3LWVuZXJneS1iYXInLCAgICBlbCA9PiBlbC5zdHlsZS53aWR0aCAgPSBgJHtlbmVyZ3lQY3R9JWApO1xuICAgIGNvbnN0IGxpdmVDb3VudGRvd24gPSBnZXRMaXZlQ291bnRkb3duKHN0YXRlLCBDT05GSUcpO1xuICAgIF9wYXRjaEVsKCdhdy1uZXh0LXdvcmsnLCAgICAgZWwgPT4ge1xuICAgICAgICBlbC50ZXh0Q29udGVudCA9IGxpdmVDb3VudGRvd247XG4gICAgICAgIGVsLnN0eWxlLmNvbG9yID0gaXNSZWFkeVRvV29yayA/ICcjMDBmZjg4JyA6ICcjMDBkOWZmJztcbiAgICB9KTtcbiAgICBfcGF0Y2hFbCgnYXctZnVsbC1lbmVyZ3knLCAgIGVsID0+IGVsLnRleHRDb250ZW50ICA9IGdldFRpbWVUb0Z1bGxFbmVyZ3koc3RhdGUpKTtcblxuICAgIC8vIFBpbGwgbGl2ZSB1cGRhdGVzXG4gICAgX3BhdGNoRWwoJ2F3LXBpbGwtZW5lcmd5JywgZWwgPT4gZWwudGV4dENvbnRlbnQgPSBgJHtzdGF0ZS5jdXJyZW50RW5lcmd5fS8ke3N0YXRlLm1heEVuZXJneX1gKTtcbiAgICBfcGF0Y2hFbCgnYXctcGlsbC1jb3VudGRvd24nLCBlbCA9PiB7XG4gICAgICAgIGVsLnRleHRDb250ZW50ID0gaXNSZWFkeVRvV29yayA/ICdTaWFwIScgOiBsaXZlQ291bnRkb3duO1xuICAgICAgICBlbC5zdHlsZS5jb2xvciA9IGlzUmVhZHlUb1dvcmsgPyAnIzAwZmY4OCcgOiAnIzAwZDlmZic7XG4gICAgfSk7XG4gICAgX3BhdGNoRWwoJ2F3LXBpbGwtY291bnRkb3duLWljb24nLCBlbCA9PiB7XG4gICAgICAgIGVsLnRleHRDb250ZW50ID0gaXNSZWFkeVRvV29yayA/ICfimqEnIDogJ+KPsyc7XG4gICAgfSk7XG4gICAgX3BhdGNoRWwoJ2F3LXBpbGwtc3RhdHVzLWRvdCcsIGVsID0+IHtcbiAgICAgICAgY29uc3QgZG90Q29sb3IgPSBzdGF0ZS53b3JrUmVzdWx0VW5jZXJ0YWluID8gJyNmZmFhMDAnIDogKHN0YXRlLnJ1bm5pbmcgPyAnIzAwZmY4OCcgOiAnI2ZmNDc1NycpO1xuICAgICAgICBlbC5zdHlsZS5iYWNrZ3JvdW5kID0gZG90Q29sb3I7XG4gICAgICAgIGVsLnN0eWxlLmJveFNoYWRvdyAgPSBgMCAwIDhweCAke2RvdENvbG9yfWA7XG4gICAgfSk7XG4gICAgX3BhdGNoRWwoJ2F3LXBpbGwtY29udGFpbmVyJywgZWwgPT4ge1xuICAgICAgICBjb25zdCBzdGF0dXNUZXh0ID0gc3RhdGUud29ya1Jlc3VsdFVuY2VydGFpblxuICAgICAgICAgICAgPyAn4pqg77iPIEhhc2lsIGtlcmphIGJlbHVtIHBhc3RpISdcbiAgICAgICAgICAgIDogKHN0YXRlLnJ1bm5pbmcgPyAnU2VkYW5nIEJlcmphbGFuJyA6ICdEaS1wYXVzZScpO1xuICAgICAgICBlbC50aXRsZSA9IGBBdXRvIFdvcmtlcjogJHtzdGF0dXNUZXh0fVxcbuKaoSBFbmVyZ2k6ICR7c3RhdGUuY3VycmVudEVuZXJneX0vJHtzdGF0ZS5tYXhFbmVyZ3l9XFxu4o+zIEdpbGlyYW46ICR7bGl2ZUNvdW50ZG93bn1cXG7wn5OKIEhhcmkgaW5pOiAke3N0YXRlLndvcmtUb2RheX14ICgrJHtzdGF0ZS50b3RhbFdvcmtYUH0gWFApXFxuXFxuKFNlcmV0IHVudHVrIGdlc2VyIHBvc2lzaSDigKIgS2xpayAyeCB1bnR1ayBwZXJiZXNhcilgO1xuICAgIH0pO1xuXG4gICAgLy8gQ2xvY2sgdGltZSB0b29sdGlwcyAoSG92ZXIgdG8gc2VlIGV4YWN0IHRpbWUpXG4gICAgX3BhdGNoRWwoJ2F3LW5leHQtd3JhcCcsIGVsID0+IHtcbiAgICAgICAgaWYgKGlzUmVhZHlUb1dvcmspIHtcbiAgICAgICAgICAgIGVsLnRpdGxlID0gJ+KaoSBFbmVyZ2kgc3VkYWggbWVuY2FwYWkgdGFyZ2V0ISBTaWFwIGJla2VyamEuJztcbiAgICAgICAgfSBlbHNlIGlmIChzdGF0ZS5uZXh0V29ya1RpbWVzdGFtcCAmJiBzdGF0ZS5uZXh0V29ya1RpbWVzdGFtcCA+IERhdGUubm93KCkpIHtcbiAgICAgICAgICAgIGNvbnN0IGQgPSBuZXcgRGF0ZShzdGF0ZS5uZXh0V29ya1RpbWVzdGFtcCk7XG4gICAgICAgICAgICBjb25zdCB0aW1lU3RyID0gZC50b0xvY2FsZVRpbWVTdHJpbmcoJ2lkLUlEJywgeyBob3VyOiAnMi1kaWdpdCcsIG1pbnV0ZTogJzItZGlnaXQnLCBzZWNvbmQ6ICcyLWRpZ2l0JyB9KTtcbiAgICAgICAgICAgIGVsLnRpdGxlID0gYEVzdGltYXNpIGdpbGlyYW4ga2VyamE6IHBrLiAke3RpbWVTdHJ9IFdJQmA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBlbC50aXRsZSA9ICdNZW51bmdndSBlbmVyZ2kgcHVsaWguLi4nO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBfcGF0Y2hFbCgnYXctZnVsbC13cmFwJywgZWwgPT4ge1xuICAgICAgICBjb25zdCBuZWVkZWQgPSAoc3RhdGUubWF4RW5lcmd5IHx8IDExNSkgLSAoc3RhdGUuY3VycmVudEVuZXJneSB8fCAwKTtcbiAgICAgICAgaWYgKG5lZWRlZCA8PSAwKSB7XG4gICAgICAgICAgICBlbC50aXRsZSA9ICfimqEgRW5lcmdpIHN1ZGFoIDEwMCUgcGVudWghJztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IHJhdGUgPSBzdGF0ZS5yZWdlblJhdGUgfHwgMS4wO1xuICAgICAgICAgICAgY29uc3QgZnVsbE1zID0gTWF0aC5yb3VuZCgobmVlZGVkIC8gcmF0ZSkgKiA2MDAwMCk7XG4gICAgICAgICAgICBjb25zdCBkID0gbmV3IERhdGUoRGF0ZS5ub3coKSArIGZ1bGxNcyk7XG4gICAgICAgICAgICBjb25zdCB0aW1lU3RyID0gZC50b0xvY2FsZVRpbWVTdHJpbmcoJ2lkLUlEJywgeyBob3VyOiAnMi1kaWdpdCcsIG1pbnV0ZTogJzItZGlnaXQnIH0pO1xuICAgICAgICAgICAgZWwudGl0bGUgPSBgRXN0aW1hc2kgZW5lcmdpIDEwMCUgcGVudWg6IHBrLiAke3RpbWVTdHJ9IFdJQmA7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIF9wYXRjaEVsKCdhdy10b2RheScsICAgICAgICAgZWwgPT4gZWwudGV4dENvbnRlbnQgID0gYCR7c3RhdGUud29ya1RvZGF5fXhgKTtcbiAgICBfcGF0Y2hFbCgnYXctd29ya2VkJywgICAgICAgIGVsID0+IGVsLnRleHRDb250ZW50ICA9IGAke3N0YXRlLnRvdGFsV29ya2VkfXhgKTtcbiAgICBfcGF0Y2hFbCgnYXcteHAnLCAgICAgICAgICAgIGVsID0+IGVsLnRleHRDb250ZW50ICA9IGArJHtzdGF0ZS50b3RhbFdvcmtYUH0gWFBgKTtcbiAgICBfcGF0Y2hFbCgnYXctdG9rZW4tc3RhdHVzJywgIGVsID0+IHtcbiAgICAgICAgY29uc3QgaXNFeHBpcmVkID0gQm9vbGVhbihcbiAgICAgICAgICAgIHN0YXRlLnRva2VuRXhwaXJlZCB8fFxuICAgICAgICAgICAgc3RhdGUucGF1c2VkRm9yVG9rZW4gfHxcbiAgICAgICAgICAgIChzdGF0ZS50b2tlbkV4cGlyeSAmJiBOdW1iZXIoc3RhdGUudG9rZW5FeHBpcnkpIDw9IERhdGUubm93KCkpXG4gICAgICAgICk7XG4gICAgICAgIGlmIChpc0V4cGlyZWQpIHtcbiAgICAgICAgICAgIGVsLnRleHRDb250ZW50ID0gJ0VYUElSRUQnO1xuICAgICAgICAgICAgZWwuc3R5bGUuY29sb3IgPSAnI2ZmNDQ0NCc7XG4gICAgICAgIH0gZWxzZSBpZiAoc3RhdGUuY3VycmVudFRva2VuKSB7XG4gICAgICAgICAgICBlbC50ZXh0Q29udGVudCA9ICdWQUxJRCc7XG4gICAgICAgICAgICBlbC5zdHlsZS5jb2xvciA9ICcjMDBmZjg4JztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGVsLnRleHRDb250ZW50ID0gJ05PVCBGT1VORCc7XG4gICAgICAgICAgICBlbC5zdHlsZS5jb2xvciA9ICcjZmZhYTAwJztcbiAgICAgICAgfVxuICAgIH0pO1xuICAgIF9wYXRjaEVsKCdhdy10b2tlbi1leHBpcnknLCAgZWwgPT4gZWwudGV4dENvbnRlbnQgPSBnZXRUaW1lVW50aWxFeHBpcnkoc3RhdGUpKTtcbiAgICBfcGF0Y2hFbCgnYXctdW5jZXJ0YWluLWJhbm5lcicsIGVsID0+IGVsLnN0eWxlLmRpc3BsYXkgPSBzdGF0ZS53b3JrUmVzdWx0VW5jZXJ0YWluID8gJ2Jsb2NrJyA6ICdub25lJyk7XG4gICAgX3BhdGNoRWwoJ2F3LXJlY29uY2lsaWF0aW9uLXN0YXR1cycsIGVsID0+IHtcbiAgICAgICAgZWwudGV4dENvbnRlbnQgPSBzdGF0ZS51bmNlcnRhaW5SZWNvbmNpbGlhdGlvbiA9PT0gJ2VuZXJneV9jaGFuZ2VkJ1xuICAgICAgICAgICAgPyAnU3RhdHVzIHJla29uc2lsaWFzaTogcGVydWJhaGFuIGVuZXJnaSB0ZXJkZXRla3NpOyBrb25maXJtYXNpIG1hbnVhbCB0ZXRhcCBkaXBlcmx1a2FuLidcbiAgICAgICAgICAgIDogJ1N0YXR1cyByZWtvbnNpbGlhc2k6IG1lbnVuZ2d1IHBlbWJhY2FhbiBlbmVyZ2kuJztcbiAgICB9KTtcblxuICAgIGNvbnN0IGJsb2NrZWQgPSBzdGF0ZS53b3JrUmVzdWx0VW5jZXJ0YWluIHx8IChzdGF0ZS50YWJMb2NrTWFuYWdlZCAmJiAhc3RhdGUuaXNUYWJMb2NrT3duZXIpO1xuICAgIF9wYXRjaEVsKCdhdy13b3JrLW5vdycsIGVsID0+IGVsLmRpc2FibGVkID0gYmxvY2tlZCk7XG4gICAgX3BhdGNoRWwoJ2F3LXRvZ2dsZScsICAgZWwgPT4gZWwuZGlzYWJsZWQgPSBibG9ja2VkKTtcbiAgICBfcGF0Y2hFbCgnYXctcGlsbC10b2dnbGUnLCBlbCA9PiBlbC5kaXNhYmxlZCA9IGJsb2NrZWQpO1xuXG4gICAgaWYgKCFzdGF0ZS50YWJMb2NrTWFuYWdlZCB8fCBzdGF0ZS5pc1RhYkxvY2tPd25lciB8fCAhZG9jdW1lbnQuaGlkZGVuKSB7XG4gICAgICAgIHNhdmVMaXZlU3RhdHVzKHN0YXRlLCBDT05GSUcpO1xuICAgIH1cbn1cblxuLyoqIFVwZGF0ZXMgb25seSB0aGUgcnVubmluZyBpbmRpY2F0b3IgYnV0dG9ucyDigJQgY2FsbGVkIGZyb20gZG9Xb3JrIG9uIHBhdXNlL3Jlc3VtZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXRSdW5uaW5nVUkocnVubmluZykge1xuICAgIF9wYXRjaEVsKCdhdy10b2dnbGUnLCBlbCA9PiB7XG4gICAgICAgIGVsLnRleHRDb250ZW50ID0gcnVubmluZyA/ICfij7ggUGF1c2UnIDogJ+KWtiBSZXN1bWUnO1xuICAgICAgICBlbC5zdHlsZS5iYWNrZ3JvdW5kID0gcnVubmluZ1xuICAgICAgICAgICAgPyAnbGluZWFyLWdyYWRpZW50KDEzNWRlZywgI2VmNDQ0NCAwJSwgI2I5MWMxYyAxMDAlKSdcbiAgICAgICAgICAgIDogJ2xpbmVhci1ncmFkaWVudCgxMzVkZWcsICMxMGI5ODEgMCUsICMwNTk2NjkgMTAwJSknO1xuICAgICAgICBlbC5zdHlsZS5ib3hTaGFkb3cgPSBgMCAycHggOHB4ICR7cnVubmluZyA/ICdyZ2JhKDIzOSw2OCw2OCwwLjMpJyA6ICdyZ2JhKDE2LDE4NSwxMjksMC4zKSd9YDtcbiAgICB9KTtcbiAgICBfcGF0Y2hFbCgnYXctc3RhdHVzLWRvdCcsIGVsID0+IHtcbiAgICAgICAgZWwuc3R5bGUuYmFja2dyb3VuZCA9IHJ1bm5pbmcgPyAnIzAwZmY4OCcgOiAnI2ZmNDc1Nyc7XG4gICAgICAgIGVsLnN0eWxlLmJveFNoYWRvdyAgPSBgMCAwIDhweCAke3J1bm5pbmcgPyAnIzAwZmY4OCcgOiAnI2ZmNDc1Nyd9YDtcbiAgICB9KTtcbiAgICBfcGF0Y2hFbCgnYXctcGlsbC10b2dnbGUnLCBlbCA9PiB7XG4gICAgICAgIGVsLnRleHRDb250ZW50ID0gcnVubmluZyA/ICfij7gnIDogJ+KWtic7XG4gICAgICAgIGVsLnRpdGxlID0gcnVubmluZyA/ICdQYXVzZSBXb3JrZXInIDogJ1Jlc3VtZSBXb3JrZXInO1xuICAgICAgICBlbC5zdHlsZS5iYWNrZ3JvdW5kID0gcnVubmluZ1xuICAgICAgICAgICAgPyAnbGluZWFyLWdyYWRpZW50KDEzNWRlZywgI2VmNDQ0NCAwJSwgI2I5MWMxYyAxMDAlKSdcbiAgICAgICAgICAgIDogJ2xpbmVhci1ncmFkaWVudCgxMzVkZWcsICMxMGI5ODEgMCUsICMwNTk2NjkgMTAwJSknO1xuICAgICAgICBlbC5zdHlsZS5ib3hTaGFkb3cgPSBgMCAycHggNnB4ICR7cnVubmluZyA/ICdyZ2JhKDIzOSw2OCw2OCwwLjM1KScgOiAncmdiYSgxNiwxODUsMTI5LDAuMzUpJ31gO1xuICAgIH0pO1xuICAgIF9wYXRjaEVsKCdhdy1waWxsLXN0YXR1cy1kb3QnLCBlbCA9PiB7XG4gICAgICAgIGVsLnN0eWxlLmJhY2tncm91bmQgPSBydW5uaW5nID8gJyMwMGZmODgnIDogJyNmZjQ3NTcnO1xuICAgICAgICBlbC5zdHlsZS5ib3hTaGFkb3cgID0gYDAgMCA4cHggJHtydW5uaW5nID8gJyMwMGZmODgnIDogJyNmZjQ3NTcnfWA7XG4gICAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXRUYWJMb2NrT3duZXIoc3RhdGUsIGlzT3duZXIsIGN0eCkge1xuICAgIHN0YXRlLmlzVGFiTG9ja093bmVyID0gaXNPd25lcjtcbiAgICBpZiAoY3R4Py5DT05GSUcpIHtcbiAgICAgICAgdXBkYXRlUGFuZWxWaXNpYmlsaXR5KHN0YXRlLCBjdHguQ09ORklHKTtcbiAgICB9XG4gICAgY3R4Py51cGRhdGVQYW5lbD8uKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b2dnbGVQYW5lbFZpc2liaWxpdHkoc3RhdGUsIENPTkZJRykge1xuICAgIGNvbnN0IHBhbmVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LXBhbmVsJyk7XG4gICAgaWYgKCFwYW5lbCkgcmV0dXJuO1xuICAgIGNvbnN0IGlzQ3VycmVudGx5VmlzaWJsZSA9IHBhbmVsLnN0eWxlLmRpc3BsYXkgIT09ICdub25lJztcbiAgICBzdGF0ZS5wYW5lbFZpc2libGUgPSAhaXNDdXJyZW50bHlWaXNpYmxlO1xuICAgIHN0YXRlLnVzZXJNYW51YWxseVRvZ2dsZWRQYW5lbCA9IHRydWU7XG4gICAgcGFuZWwuc3R5bGUuZGlzcGxheSA9IHN0YXRlLnBhbmVsVmlzaWJsZSA/ICdibG9jaycgOiAnbm9uZSc7XG4gICAgc2V0VmFsdWUoJ3BhbmVsVmlzaWJsZScsIHN0YXRlLnBhbmVsVmlzaWJsZS50b1N0cmluZygpKTtcbn1cblxuLy8g4pSA4pSA4pSAIFByaXZhdGUg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbmZ1bmN0aW9uIF9wYXRjaEVsKGlkLCBmbikge1xuICAgIGNvbnN0IGVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoaWQpO1xuICAgIGlmIChlbCkgZm4oZWwpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYXBwbHlQYW5lbE1vZGUoc3RhdGUsIGlzTWluKSB7XG4gICAgc3RhdGUucGFuZWxNaW5pbWl6ZWQgPSBCb29sZWFuKGlzTWluKTtcbiAgICBzZXRWYWx1ZSgncGFuZWxNaW5pbWl6ZWQnLCBzdGF0ZS5wYW5lbE1pbmltaXplZC50b1N0cmluZygpKTtcblxuICAgIGNvbnN0IHBhbmVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LXBhbmVsJyk7XG4gICAgY29uc3QgZnVsbENvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1mdWxsLWNvbnRhaW5lcicpO1xuICAgIGNvbnN0IHBpbGxDb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctcGlsbC1jb250YWluZXInKTtcbiAgICBjb25zdCBtaW5pbWl6ZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1taW5pbWl6ZScpO1xuXG4gICAgaWYgKCFwYW5lbCkgcmV0dXJuO1xuXG4gICAgaWYgKHN0YXRlLnBhbmVsTWluaW1pemVkKSB7XG4gICAgICAgIGlmIChmdWxsQ29udGFpbmVyKSBmdWxsQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgICAgIGlmIChwaWxsQ29udGFpbmVyKSBwaWxsQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG4gICAgICAgIHBhbmVsLnN0eWxlLndpZHRoID0gJ2F1dG8nO1xuICAgICAgICBwYW5lbC5zdHlsZS5taW5XaWR0aCA9ICcwJztcbiAgICAgICAgcGFuZWwuc3R5bGUubWF4V2lkdGggPSAnbm9uZSc7XG4gICAgICAgIHBhbmVsLnN0eWxlLmJhY2tncm91bmQgPSAndHJhbnNwYXJlbnQnO1xuICAgICAgICBwYW5lbC5zdHlsZS5iYWNrZHJvcEZpbHRlciA9ICdub25lJztcbiAgICAgICAgcGFuZWwuc3R5bGUud2Via2l0QmFja2Ryb3BGaWx0ZXIgPSAnbm9uZSc7XG4gICAgICAgIHBhbmVsLnN0eWxlLmJvcmRlciA9ICdub25lJztcbiAgICAgICAgcGFuZWwuc3R5bGUuYm94U2hhZG93ID0gJ25vbmUnO1xuICAgICAgICBwYW5lbC5zdHlsZS5ib3JkZXJSYWRpdXMgPSAnOTk5cHgnO1xuICAgICAgICBwYW5lbC5zdHlsZS5wYWRkaW5nID0gJzAnO1xuICAgICAgICBwYW5lbC5zdHlsZS5vdmVyZmxvdyA9ICd2aXNpYmxlJztcbiAgICAgICAgaWYgKG1pbmltaXplQnRuKSB7XG4gICAgICAgICAgICBtaW5pbWl6ZUJ0bi5pbm5lckhUTUwgPSBJQ09OUy5leHBhbmQ7XG4gICAgICAgICAgICBtaW5pbWl6ZUJ0bi50aXRsZSA9ICdQZXJiZXNhciBQYW5lbCc7XG4gICAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgICAvLyBQcmV2ZW50IG92ZXJmbG93aW5nIHRoZSByaWdodCB2aWV3cG9ydCBlZGdlIHdoZW4gZXhwYW5kaW5nXG4gICAgICAgIGNvbnN0IG1heFggPSB3aW5kb3cuaW5uZXJXaWR0aCAtIDMwNTtcbiAgICAgICAgaWYgKHN0YXRlLnBhbmVsWCA+IG1heFggJiYgbWF4WCA+IDApIHtcbiAgICAgICAgICAgIHN0YXRlLnBhbmVsWCA9IE1hdGgubWF4KDEwLCBtYXhYKTtcbiAgICAgICAgICAgIHBhbmVsLnN0eWxlLmxlZnQgPSBzdGF0ZS5wYW5lbFggKyAncHgnO1xuICAgICAgICAgICAgc2V0VmFsdWUoJ3BhbmVsWCcsIHN0YXRlLnBhbmVsWC50b1N0cmluZygpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChmdWxsQ29udGFpbmVyKSBmdWxsQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuICAgICAgICBpZiAocGlsbENvbnRhaW5lcikgcGlsbENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICBwYW5lbC5zdHlsZS53aWR0aCA9ICcyODVweCc7XG4gICAgICAgIHBhbmVsLnN0eWxlLm1pbldpZHRoID0gJzI4NXB4JztcbiAgICAgICAgcGFuZWwuc3R5bGUubWF4V2lkdGggPSAnMjk1cHgnO1xuICAgICAgICBwYW5lbC5zdHlsZS5iYWNrZ3JvdW5kID0gJ3JnYmEoMTgsIDIyLCAzNCwgMC45MiknO1xuICAgICAgICBwYW5lbC5zdHlsZS5iYWNrZHJvcEZpbHRlciA9ICdibHVyKDE0cHgpJztcbiAgICAgICAgcGFuZWwuc3R5bGUud2Via2l0QmFja2Ryb3BGaWx0ZXIgPSAnYmx1cigxNHB4KSc7XG4gICAgICAgIHBhbmVsLnN0eWxlLmJvcmRlciA9ICcxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjA4KSc7XG4gICAgICAgIHBhbmVsLnN0eWxlLmJvcmRlclJhZGl1cyA9ICcxMnB4JztcbiAgICAgICAgcGFuZWwuc3R5bGUuYm94U2hhZG93ID0gJzAgMTZweCA0MHB4IHJnYmEoMCwgMCwgMCwgMC41NSksIDAgMCAxcHggcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjE1KSc7XG4gICAgICAgIHBhbmVsLnN0eWxlLnBhZGRpbmcgPSAnMCc7XG4gICAgICAgIHBhbmVsLnN0eWxlLm92ZXJmbG93ID0gJ3Zpc2libGUnO1xuICAgICAgICBpZiAobWluaW1pemVCdG4pIHtcbiAgICAgICAgICAgIG1pbmltaXplQnRuLmlubmVySFRNTCA9IElDT05TLm1pbmltaXplO1xuICAgICAgICAgICAgbWluaW1pemVCdG4udGl0bGUgPSAnTW9kZSBSaW5na2FzIChQaWxsKSc7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIF9idWlsZFBhbmVsSFRNTChzdGF0ZSwgQ09ORklHKSB7XG4gICAgY29uc3QgaXNNaW4gICAgPSBCb29sZWFuKHN0YXRlLnBhbmVsTWluaW1pemVkKTtcbiAgICBjb25zdCBpc1Bpbm5lZCA9IENPTkZJRy5wYW5lbFBpbm5lZDtcbiAgICBjb25zdCBydW5uaW5nICA9IHN0YXRlLnJ1bm5pbmc7XG5cbiAgICByZXR1cm4gYFxuICAgICAgICA8IS0tIEZ1bGwgUGFuZWwgVmlldyAtLT5cbiAgICAgICAgPGRpdiBpZD1cImF3LWZ1bGwtY29udGFpbmVyXCIgc3R5bGU9XCJkaXNwbGF5OiAke2lzTWluID8gJ25vbmUnIDogJ2Jsb2NrJ307IHdpZHRoOiAxMDAlO1wiPlxuICAgICAgICAgICAgPGRpdiBpZD1cImF3LWhlYWRlclwiIHN0eWxlPVwiXG4gICAgICAgICAgICAgICAgYmFja2dyb3VuZDogbGluZWFyLWdyYWRpZW50KDEzNWRlZywgcmdiYSgyNiwgMzIsIDUzLCAwLjk4KSAwJSwgcmdiYSgxOCwgMjIsIDM0LCAwLjk4KSAxMDAlKTtcbiAgICAgICAgICAgICAgICBwYWRkaW5nOiA5cHggMTJweDsgY3Vyc29yOiAke2lzUGlubmVkID8gJ2RlZmF1bHQnIDogJ21vdmUnfTtcbiAgICAgICAgICAgICAgICBib3JkZXItYm90dG9tOiAxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjA4KTtcbiAgICAgICAgICAgICAgICBkaXNwbGF5OiBmbGV4OyBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47IGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgICAgICAgICAgICAgYm9yZGVyLXJhZGl1czogMTJweCAxMnB4IDAgMDtcbiAgICAgICAgICAgICAgICBnYXA6IDhweDsgYm94LXNpemluZzogYm9yZGVyLWJveDsgd2lkdGg6IDEwMCU7XG4gICAgICAgICAgICBcIj5cbiAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4O2ZsZXgtc2hyaW5rOjA7bWluLXdpZHRoOjA7XCI+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiY29sb3I6IzAwZDlmZjtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2ZsZXgtc2hyaW5rOjA7XCI+JHtJQ09OUy5yb2JvdH08L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiZm9udC13ZWlnaHQ6NzAwO2NvbG9yOiNmZmY7Zm9udC1zaXplOjEyLjVweDtsZXR0ZXItc3BhY2luZzowLjJweDt3aGl0ZS1zcGFjZTpub3dyYXA7XCI+QXV0byBXb3JrZXI8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIGlkPVwiYXctc3RhdHVzLWRvdFwiIHN0eWxlPVwiXG4gICAgICAgICAgICAgICAgICAgICAgICB3aWR0aDo3cHg7aGVpZ2h0OjdweDtib3JkZXItcmFkaXVzOjUwJTtkaXNwbGF5OmlubGluZS1ibG9jaztmbGV4LXNocmluazowO1xuICAgICAgICAgICAgICAgICAgICAgICAgYmFja2dyb3VuZDoke3J1bm5pbmcgPyAnIzAwZmY4OCcgOiAnI2ZmNDc1Nyd9O1xuICAgICAgICAgICAgICAgICAgICAgICAgYm94LXNoYWRvdzowIDAgOHB4ICR7cnVubmluZyA/ICcjMDBmZjg4JyA6ICcjZmY0NzU3J307XG4gICAgICAgICAgICAgICAgICAgIFwiPjwvc3Bhbj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6MnB4O2ZsZXgtc2hyaW5rOjA7XCI+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJhdy1taW5pbWl6ZVwiICBjbGFzcz1cImF3LWhlYWRlci1idG5cIiB0aXRsZT1cIk1vZGUgUmluZ2thcyAoUGlsbClcIiBzdHlsZT1cIiR7SEVBREVSX0JUTl9TVFlMRX1cIj4ke0lDT05TLm1pbmltaXplfTwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGlkPVwiYXctcGluXCIgICAgICAgY2xhc3M9XCJhdy1oZWFkZXItYnRuXCIgdGl0bGU9XCIke2lzUGlubmVkID8gJ1VucGluJyA6ICdQaW4nfVwiIHN0eWxlPVwiJHtIRUFERVJfQlROX1NUWUxFfSBiYWNrZ3JvdW5kOiR7aXNQaW5uZWQgPyAncmdiYSgwLCAxMzYsIDI1NSwgMC4yKScgOiAndHJhbnNwYXJlbnQnfTtjb2xvcjoke2lzUGlubmVkID8gJyMwMGQ5ZmYnIDogJyM4ODkyYjAnfTtib3JkZXI6JHtpc1Bpbm5lZCA/ICcxcHggc29saWQgcmdiYSgwLCAxMzYsIDI1NSwgMC40KScgOiAnbm9uZSd9O1wiPiR7aXNQaW5uZWQgPyBJQ09OUy5sb2NrQ2xvc2VkIDogSUNPTlMubG9ja09wZW59PC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJhdy1hbmFseXRpY3NcIiBjbGFzcz1cImF3LWhlYWRlci1idG5cIiB0aXRsZT1cIlN0YXRpc3RpayAmIFJpd2F5YXRcIiBzdHlsZT1cIiR7SEVBREVSX0JUTl9TVFlMRX1cIj4ke0lDT05TLmNoYXJ0fTwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGlkPVwiYXctc2V0dGluZ3NcIiAgY2xhc3M9XCJhdy1oZWFkZXItYnRuXCIgdGl0bGU9XCJQZW5nYXR1cmFuXCIgc3R5bGU9XCIke0hFQURFUl9CVE5fU1RZTEV9XCI+JHtJQ09OUy5zZXR0aW5nc308L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBpZD1cImF3LWhpZGVcIiAgICAgIGNsYXNzPVwiYXctaGVhZGVyLWJ0blwiIHRpdGxlPVwiU2VtYnVueWlrYW4gKCR7Q09ORklHLnNob3J0Y3V0cy5zaG93SGlkZS5kaXNwbGF5fSlcIiBzdHlsZT1cIiR7SEVBREVSX0JUTl9TVFlMRX1jb2xvcjojZmY1MjUyO21hcmdpbi1sZWZ0OjJweDtcIj4ke0lDT05TLmNsb3NlfTwvYnV0dG9uPlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGlkPVwiYXctYm9keVwiIHN0eWxlPVwicGFkZGluZzogMTJweDsgZGlzcGxheTogYmxvY2s7XCI+XG4gICAgICAgICAgICAgICAgPGRpdiBpZD1cImF3LXVuY2VydGFpbi1iYW5uZXJcIiBzdHlsZT1cImRpc3BsYXk6JHtzdGF0ZS53b3JrUmVzdWx0VW5jZXJ0YWluID8gJ2Jsb2NrJyA6ICdub25lJ307bWFyZ2luLWJvdHRvbToxMHB4O3BhZGRpbmc6OXB4O2JhY2tncm91bmQ6cmdiYSgyNTUsNjgsNjgsMC4xMik7Ym9yZGVyOjFweCBzb2xpZCByZ2JhKDI1NSw2OCw2OCwwLjU1KTtib3JkZXItcmFkaXVzOjZweDtjb2xvcjojZmZiM2IzO2ZvbnQtc2l6ZToxMXB4O2xpbmUtaGVpZ2h0OjEuNDtcIj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cImZvbnQtd2VpZ2h0OjcwMDtjb2xvcjojZmY3Nzc3O21hcmdpbi1ib3R0b206NHB4O1wiPkhhc2lsIGtlcmphIHRlcmFraGlyIGJlbHVtIHBhc3RpPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDxkaXY+UGVyaWtzYSBoYWxhbWFuIGdhbWUgc2ViZWx1bSBtZWxhbmp1dGthbi48L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBpZD1cImF3LXJlY29uY2lsaWF0aW9uLXN0YXR1c1wiIHN0eWxlPVwibWFyZ2luLXRvcDo0cHg7Y29sb3I6I2ZmZDE2NjtcIj5TdGF0dXMgcmVrb25zaWxpYXNpOiBtZW51bmdndSBwZW1iYWNhYW4gZW5lcmdpLjwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGlkPVwiYXctY29uZmlybS11bmNlcnRhaW5cIiBzdHlsZT1cIm1hcmdpbi10b3A6N3B4O3BhZGRpbmc6NXB4IDhweDtiYWNrZ3JvdW5kOiM4ZjMwMzA7Y29sb3I6I2ZmZjtib3JkZXI6MXB4IHNvbGlkICNiNDQ7Ym9yZGVyLXJhZGl1czo0cHg7Y3Vyc29yOnBvaW50ZXI7Zm9udC1zaXplOjEwcHg7XCI+U2F5YSBzdWRhaCBtZW1lcmlrc2EsIGxhbmp1dGthbjwvYnV0dG9uPlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgICAgICAgPCEtLSBSZWdpb24gJiBCdWZmIEJhZGdlIC0tPlxuICAgICAgICAgICAgICAgIDxkaXYgaWQ9XCJhdy1yZWdpb24tYmFkZ2VcIiBzdHlsZT1cIlxuICAgICAgICAgICAgICAgICAgICBkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47XG4gICAgICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsIHJnYmEoMCwgMjE3LCAyNTUsIDAuMDgpIDAlLCByZ2JhKDAsIDI1NSwgMTM2LCAwLjA1KSAxMDAlKTtcbiAgICAgICAgICAgICAgICAgICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSgwLCAyMTcsIDI1NSwgMC4yKTtcbiAgICAgICAgICAgICAgICAgICAgYm9yZGVyLXJhZGl1czogOHB4O1xuICAgICAgICAgICAgICAgICAgICBwYWRkaW5nOiA1cHggOXB4O1xuICAgICAgICAgICAgICAgICAgICBtYXJnaW4tYm90dG9tOiA5cHg7XG4gICAgICAgICAgICAgICAgICAgIGZvbnQtc2l6ZTogMTFweDtcbiAgICAgICAgICAgICAgICBcIj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjVweDtvdmVyZmxvdzpoaWRkZW47XCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBzdHlsZT1cImZvbnQtc2l6ZToxMnB4O1wiPvCfk408L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBpZD1cImF3LXJlZ2lvbi1uYW1lXCIgc3R5bGU9XCJmb250LXdlaWdodDo2MDA7Y29sb3I6I2U2ZWRmMzt3aGl0ZS1zcGFjZTpub3dyYXA7b3ZlcmZsb3c6aGlkZGVuO3RleHQtb3ZlcmZsb3c6ZWxsaXBzaXM7bWF4LXdpZHRoOjEzMHB4O1wiPiR7c3RhdGUucmVnaW9uTmFtZSB8fCAnTWVtdWF0IHdpbGF5YWguLi4nfTwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIGlkPVwiYXctcmVnaW9uLWJ1ZmZcIiBzdHlsZT1cIlxuICAgICAgICAgICAgICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgwLCAyNTUsIDEzNiwgMC4xMik7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb2xvcjogIzAwZmY4ODtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMCwgMjU1LCAxMzYsIDAuMjUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcGFkZGluZzogMXB4IDZweDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJvcmRlci1yYWRpdXM6IDRweDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbnQtd2VpZ2h0OiA3MDA7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb250LXNpemU6IDkuNXB4O1xuICAgICAgICAgICAgICAgICAgICAgICAgd2hpdGUtc3BhY2U6IG5vd3JhcDtcbiAgICAgICAgICAgICAgICAgICAgXCI+JHtzdGF0ZS5yZWdpb25IZWFsdGhCb251c1BlcmNlbnQgPyBgKyR7c3RhdGUucmVnaW9uSGVhbHRoQm9udXNQZXJjZW50fSUgUmVnZW5gIDogJ05vcm1hbCAoMS4weCknfTwvc3Bhbj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgICAgIDwhLS0gRW5lcmd5IENhcmQgLS0+XG4gICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cImJhY2tncm91bmQ6cmdiYSgyNTUsMjU1LDI1NSwwLjAzKTtib3JkZXI6MXB4IHNvbGlkIHJnYmEoMjU1LDI1NSwyNTUsMC4wNyk7cGFkZGluZzo5cHggMTFweDtib3JkZXItcmFkaXVzOjlweDttYXJnaW4tYm90dG9tOjlweDtcIj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6ZmxleDtqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2VlbjttYXJnaW4tYm90dG9tOjZweDtmb250LXNpemU6MTFweDtcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiY29sb3I6I2EwYWVjMDtmb250LXdlaWdodDo2MDA7XCI+4pqhIEVuZXJnaTwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGlkPVwiYXctZW5lcmd5LXRleHRcIiBzdHlsZT1cImNvbG9yOiMwMGZmODg7Zm9udC13ZWlnaHQ6NzAwO2xldHRlci1zcGFjaW5nOjAuM3B4O1wiPiR7c3RhdGUuY3VycmVudEVuZXJneX0vJHtzdGF0ZS5tYXhFbmVyZ3l9PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cImJhY2tncm91bmQ6cmdiYSgwLDAsMCwwLjUpO2hlaWdodDo3cHg7Ym9yZGVyLXJhZGl1czo5OTlweDtvdmVyZmxvdzpoaWRkZW47Ym9yZGVyOjFweCBzb2xpZCByZ2JhKDI1NSwyNTUsMjU1LDAuMDcpO3BhZGRpbmc6MXB4O1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBpZD1cImF3LWVuZXJneS1iYXJcIiBzdHlsZT1cImhlaWdodDoxMDAlO3dpZHRoOiR7KHN0YXRlLmN1cnJlbnRFbmVyZ3kgLyBzdGF0ZS5tYXhFbmVyZ3kpICogMTAwfSU7YmFja2dyb3VuZDpsaW5lYXItZ3JhZGllbnQoOTBkZWcsICMwMGQ5ZmYsICMwMGZmODgpO2JvcmRlci1yYWRpdXM6OTk5cHg7dHJhbnNpdGlvbjp3aWR0aCAwLjNzIGVhc2U7Ym94LXNoYWRvdzowIDAgOHB4IHJnYmEoMCwyNTUsMTM2LDAuMzUpO1wiPjwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6ZmxleDtqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2Vlbjtmb250LXNpemU6MTBweDtjb2xvcjojNzE4MDk2O21hcmdpbi10b3A6NnB4O1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gaWQ9XCJhdy1uZXh0LXdyYXBcIiBzdHlsZT1cImN1cnNvcjpoZWxwO1wiPk5leHQ6IDxzcGFuIGlkPVwiYXctbmV4dC13b3JrXCIgc3R5bGU9XCJjb2xvcjojMDBmZjg4O2ZvbnQtd2VpZ2h0OjYwMDtcIj5Ob3chPC9zcGFuPjwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGlkPVwiYXctZnVsbC13cmFwXCIgc3R5bGU9XCJjdXJzb3I6aGVscDtcIj5GdWxsOiA8c3BhbiBpZD1cImF3LWZ1bGwtZW5lcmd5XCIgc3R5bGU9XCJjb2xvcjojMDBkOWZmO2ZvbnQtd2VpZ2h0OjUwMDtcIj4ke2dldFRpbWVUb0Z1bGxFbmVyZ3koc3RhdGUpfTwvc3Bhbj48L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgICAgICAgPCEtLSBTdGF0cyAzLUNvbCBHcmlkIC0tPlxuICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OmdyaWQ7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjFmciAxZnIgMWZyO2dhcDo2cHg7bWFyZ2luLWJvdHRvbTo5cHg7XCI+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJiYWNrZ3JvdW5kOnJnYmEoMjU1LDI1NSwyNTUsMC4wMyk7cGFkZGluZzo3cHggNXB4O2JvcmRlci1yYWRpdXM6OHB4O2JvcmRlcjoxcHggc29saWQgcmdiYSgyNTUsMjU1LDI1NSwwLjA2KTt0ZXh0LWFsaWduOmNlbnRlcjtcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJmb250LXNpemU6OXB4O2NvbG9yOiM3MTgwOTY7bWFyZ2luLWJvdHRvbToycHg7Zm9udC13ZWlnaHQ6NjAwO3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtsZXR0ZXItc3BhY2luZzowLjVweDtcIj5IYXJpIEluaTwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBpZD1cImF3LXRvZGF5XCIgc3R5bGU9XCJmb250LXNpemU6MTMuNXB4O2ZvbnQtd2VpZ2h0OjcwMDtjb2xvcjojMDBkOWZmO1wiPiR7c3RhdGUud29ya1RvZGF5fXg8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJiYWNrZ3JvdW5kOnJnYmEoMjU1LDI1NSwyNTUsMC4wMyk7cGFkZGluZzo3cHggNXB4O2JvcmRlci1yYWRpdXM6OHB4O2JvcmRlcjoxcHggc29saWQgcmdiYSgyNTUsMjU1LDI1NSwwLjA2KTt0ZXh0LWFsaWduOmNlbnRlcjtcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJmb250LXNpemU6OXB4O2NvbG9yOiM3MTgwOTY7bWFyZ2luLWJvdHRvbToycHg7Zm9udC13ZWlnaHQ6NjAwO3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtsZXR0ZXItc3BhY2luZzowLjVweDtcIj5Ub3RhbCBTaGlmdDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBpZD1cImF3LXdvcmtlZFwiIHN0eWxlPVwiZm9udC1zaXplOjEzLjVweDtmb250LXdlaWdodDo3MDA7Y29sb3I6I2Y3ZmFmYztcIj4ke3N0YXRlLnRvdGFsV29ya2VkfXg8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJiYWNrZ3JvdW5kOnJnYmEoMjU1LDI1NSwyNTUsMC4wMyk7cGFkZGluZzo3cHggNXB4O2JvcmRlci1yYWRpdXM6OHB4O2JvcmRlcjoxcHggc29saWQgcmdiYSgyNTUsMjU1LDI1NSwwLjA2KTt0ZXh0LWFsaWduOmNlbnRlcjtcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJmb250LXNpemU6OXB4O2NvbG9yOiM3MTgwOTY7bWFyZ2luLWJvdHRvbToycHg7Zm9udC13ZWlnaHQ6NjAwO3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtsZXR0ZXItc3BhY2luZzowLjVweDtcIj5Xb3JrIFhQPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGlkPVwiYXcteHBcIiBzdHlsZT1cImZvbnQtc2l6ZToxMy41cHg7Zm9udC13ZWlnaHQ6NzAwO2NvbG9yOiMwMGZmODg7XCI+KyR7c3RhdGUudG90YWxXb3JrWFB9IFhQPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgICAgICAgPCEtLSBUb2tlbiAmIEV4cGlyeSBSb3cgLS0+XG4gICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cImZvbnQtc2l6ZToxMC41cHg7Y29sb3I6IzcxODA5NjttYXJnaW4tYm90dG9tOjlweDtwYWRkaW5nOjZweCA5cHg7YmFja2dyb3VuZDpyZ2JhKDI1NSwyNTUsMjU1LDAuMDIpO2JvcmRlcjoxcHggc29saWQgcmdiYSgyNTUsMjU1LDI1NSwwLjA0KTtib3JkZXItcmFkaXVzOjZweDtkaXNwbGF5OmZsZXg7anVzdGlmeS1jb250ZW50OnNwYWNlLWJldHdlZW47YWxpZ24taXRlbXM6Y2VudGVyO1wiPlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NXB4O1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4+8J+UkTwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiY29sb3I6I2EwYWVjMDtcIj5Ub2tlbjo8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBpZD1cImF3LXRva2VuLXN0YXR1c1wiIHN0eWxlPVwiZm9udC13ZWlnaHQ6NzAwO2NvbG9yOiMwMGZmODg7XCI+VkFMSUQ8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8c3BhbiBpZD1cImF3LXRva2VuLWV4cGlyeVwiIHN0eWxlPVwiZm9udC1zaXplOjEwcHg7Y29sb3I6IzcxODA5NjtcIj5OL0E8L3NwYW4+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICAgICAgICA8IS0tIEFjdGlvbiBCdXR0b25zIC0tPlxuICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OmdyaWQ7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjFmciAxZnIgMWZyO2dhcDo2cHg7XCI+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJhdy13b3JrLW5vd1wiIGNsYXNzPVwiYXctYnRuLWFjdGlvblwiIHN0eWxlPVwiXG4gICAgICAgICAgICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiBsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjZjU5ZTBiIDAlLCAjZDk3NzA2IDEwMCUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29sb3I6ICNmZmY7IGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMjU1LDI1NSwyNTUsMC4xNSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBwYWRkaW5nOiA4cHggMDsgYm9yZGVyLXJhZGl1czogN3B4OyBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb250LXdlaWdodDogNjAwOyBmb250LXNpemU6IDExcHg7IGJveC1zaGFkb3c6IDAgMnB4IDZweCByZ2JhKDI0NSwxNTgsMTEsMC4yNSk7XG4gICAgICAgICAgICAgICAgICAgIFwiPuKaoSBXb3JrPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJhdy10b2dnbGVcIiBjbGFzcz1cImF3LWJ0bi1hY3Rpb25cIiBzdHlsZT1cIlxuICAgICAgICAgICAgICAgICAgICAgICAgYmFja2dyb3VuZDogJHtydW5uaW5nID8gJ2xpbmVhci1ncmFkaWVudCgxMzVkZWcsICNlZjQ0NDQgMCUsICNiOTFjMWMgMTAwJSknIDogJ2xpbmVhci1ncmFkaWVudCgxMzVkZWcsICMxMGI5ODEgMCUsICMwNTk2NjkgMTAwJSknfTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbG9yOiAjZmZmOyBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDI1NSwyNTUsMjU1LDAuMTUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcGFkZGluZzogOHB4IDA7IGJvcmRlci1yYWRpdXM6IDdweDsgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9udC13ZWlnaHQ6IDYwMDsgZm9udC1zaXplOiAxMXB4O1xuICAgICAgICAgICAgICAgICAgICAgICAgYm94LXNoYWRvdzogMCAycHggNnB4ICR7cnVubmluZyA/ICdyZ2JhKDIzOSw2OCw2OCwwLjI1KScgOiAncmdiYSgxNiwxODUsMTI5LDAuMjUpJ307XG4gICAgICAgICAgICAgICAgICAgIFwiPiR7cnVubmluZyA/ICfij7ggUGF1c2UnIDogJ+KWtiBSZXN1bWUnfTwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGlkPVwiYXctbG9nc1wiIGNsYXNzPVwiYXctYnRuLWFjdGlvblwiIHN0eWxlPVwiXG4gICAgICAgICAgICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiBsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjNjM2NmYxIDAlLCAjNGY0NmU1IDEwMCUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29sb3I6ICNmZmY7IGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMjU1LDI1NSwyNTUsMC4xNSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBwYWRkaW5nOiA4cHggMDsgYm9yZGVyLXJhZGl1czogN3B4OyBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb250LXdlaWdodDogNjAwOyBmb250LXNpemU6IDExcHg7IGJveC1zaGFkb3c6IDAgMnB4IDZweCByZ2JhKDk5LDEwMiwyNDEsMC4yNSk7XG4gICAgICAgICAgICAgICAgICAgIFwiPvCfk4sgTG9nPC9idXR0b24+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgPCEtLSBNaW5pIEZsb2F0aW5nIFBpbGwgQ29udGFpbmVyIChNb2RlIFJpbmdrYXMpIC0tPlxuICAgICAgICA8ZGl2IGlkPVwiYXctcGlsbC1jb250YWluZXJcIiBjbGFzcz1cImF3LXBpbGwtYm94XCIgc3R5bGU9XCJcbiAgICAgICAgICAgIGRpc3BsYXk6ICR7aXNNaW4gPyAnZmxleCcgOiAnbm9uZSd9O1xuICAgICAgICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICAgICAgICAgIGdhcDogN3B4O1xuICAgICAgICAgICAgYmFja2dyb3VuZDogbGluZWFyLWdyYWRpZW50KDEzNWRlZywgcmdiYSgyMCwgMjUsIDQyLCAwLjk1KSAwJSwgcmdiYSgxMywgMTYsIDI2LCAwLjk4KSAxMDAlKTtcbiAgICAgICAgICAgIGJhY2tkcm9wLWZpbHRlcjogYmx1cigxNHB4KTtcbiAgICAgICAgICAgIC13ZWJraXQtYmFja2Ryb3AtZmlsdGVyOiBibHVyKDE0cHgpO1xuICAgICAgICAgICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjEyKTtcbiAgICAgICAgICAgIGJvcmRlci1yYWRpdXM6IDk5OXB4O1xuICAgICAgICAgICAgcGFkZGluZzogNHB4IDhweCA0cHggMTBweDtcbiAgICAgICAgICAgIGJveC1zaGFkb3c6IDAgMTBweCAyOHB4IHJnYmEoMCwgMCwgMCwgMC42NSksIDAgMCAxcHggcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjIpO1xuICAgICAgICAgICAgY3Vyc29yOiAke2lzUGlubmVkID8gJ2RlZmF1bHQnIDogJ21vdmUnfTtcbiAgICAgICAgICAgIHRyYW5zaXRpb246IGJvcmRlci1jb2xvciAwLjJzIGVhc2UsIGJveC1zaGFkb3cgMC4ycyBlYXNlO1xuICAgICAgICAgICAgYm94LXNpemluZzogYm9yZGVyLWJveDtcbiAgICAgICAgICAgIHdoaXRlLXNwYWNlOiBub3dyYXA7XG4gICAgICAgIFwiIHRpdGxlPVwiQXV0byBXb3JrZXIg4oCiIFNlcmV0IHVudHVrIHBpbmRhaCDigKIgS2xpayAyeCB1bnR1ayBwZXJiZXNhclwiPlxuXG4gICAgICAgICAgICA8IS0tIFJvYm90IEljb24gJiBMaXZlIFN0YXR1cyBEb3QgLS0+XG4gICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTogZmxleDsgYWxpZ24taXRlbXM6IGNlbnRlcjsgZ2FwOiA1cHg7IGZsZXgtc2hyaW5rOiAwO1wiPlxuICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiY29sb3I6ICMwMGQ5ZmY7IGRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7XCI+JHtJQ09OUy5yb2JvdH08L3NwYW4+XG4gICAgICAgICAgICAgICAgPHNwYW4gaWQ9XCJhdy1waWxsLXN0YXR1cy1kb3RcIiBzdHlsZT1cIlxuICAgICAgICAgICAgICAgICAgICB3aWR0aDogN3B4OyBoZWlnaHQ6IDdweDsgYm9yZGVyLXJhZGl1czogNTAlOyBkaXNwbGF5OiBpbmxpbmUtYmxvY2s7IGZsZXgtc2hyaW5rOiAwO1xuICAgICAgICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiAke3J1bm5pbmcgPyAnIzAwZmY4OCcgOiAnI2ZmNDc1Nyd9O1xuICAgICAgICAgICAgICAgICAgICBib3gtc2hhZG93OiAwIDAgOHB4ICR7cnVubmluZyA/ICcjMDBmZjg4JyA6ICcjZmY0NzU3J307XG4gICAgICAgICAgICAgICAgXCI+PC9zcGFuPlxuICAgICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICAgIDwhLS0gRW5lcmd5IEJhZGdlIC0tPlxuICAgICAgICAgICAgPGRpdiBpZD1cImF3LXBpbGwtZW5lcmd5LWJhZGdlXCIgc3R5bGU9XCJcbiAgICAgICAgICAgICAgICBkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBnYXA6IDRweDtcbiAgICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiByZ2JhKDAsIDI1NSwgMTM2LCAwLjA4KTtcbiAgICAgICAgICAgICAgICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDAsIDI1NSwgMTM2LCAwLjIyKTtcbiAgICAgICAgICAgICAgICBib3JkZXItcmFkaXVzOiA2cHg7XG4gICAgICAgICAgICAgICAgcGFkZGluZzogMnB4IDdweDtcbiAgICAgICAgICAgICAgICBmb250LXNpemU6IDExcHg7XG4gICAgICAgICAgICAgICAgZm9udC13ZWlnaHQ6IDcwMDtcbiAgICAgICAgICAgICAgICBjb2xvcjogIzAwZmY4ODtcbiAgICAgICAgICAgICAgICBsZXR0ZXItc3BhY2luZzogMC4ycHg7XG4gICAgICAgICAgICAgICAgZmxleC1zaHJpbms6IDA7XG4gICAgICAgICAgICBcIiB0aXRsZT1cIkVuZXJnaSBTYWF0IEluaVwiPlxuICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiZm9udC1zaXplOiAxMXB4O1wiPuKaoTwvc3Bhbj5cbiAgICAgICAgICAgICAgICA8c3BhbiBpZD1cImF3LXBpbGwtZW5lcmd5XCI+JHtzdGF0ZS5jdXJyZW50RW5lcmd5IHx8IDB9LyR7c3RhdGUubWF4RW5lcmd5IHx8IDExMH08L3NwYW4+XG4gICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgPCEtLSBOZXh0IFdvcmsgLyBDb3VudGRvd24gQmFkZ2UgLS0+XG4gICAgICAgICAgICA8ZGl2IGlkPVwiYXctcGlsbC1jb3VudGRvd24tYmFkZ2VcIiBzdHlsZT1cIlxuICAgICAgICAgICAgICAgIGRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGdhcDogNHB4O1xuICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMCwgMjE3LCAyNTUsIDAuMDgpO1xuICAgICAgICAgICAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMCwgMjE3LCAyNTUsIDAuMjIpO1xuICAgICAgICAgICAgICAgIGJvcmRlci1yYWRpdXM6IDZweDtcbiAgICAgICAgICAgICAgICBwYWRkaW5nOiAycHggN3B4O1xuICAgICAgICAgICAgICAgIGZvbnQtc2l6ZTogMTFweDtcbiAgICAgICAgICAgICAgICBmb250LXdlaWdodDogNzAwO1xuICAgICAgICAgICAgICAgIGNvbG9yOiAjMDBkOWZmO1xuICAgICAgICAgICAgICAgIGxldHRlci1zcGFjaW5nOiAwLjJweDtcbiAgICAgICAgICAgICAgICBmbGV4LXNocmluazogMDtcbiAgICAgICAgICAgIFwiIHRpdGxlPVwiQ291bnRkb3duIEdpbGlyYW4gS2VyamFcIj5cbiAgICAgICAgICAgICAgICA8c3BhbiBpZD1cImF3LXBpbGwtY291bnRkb3duLWljb25cIiBzdHlsZT1cImZvbnQtc2l6ZTogMTFweDtcIj7ij7M8L3NwYW4+XG4gICAgICAgICAgICAgICAgPHNwYW4gaWQ9XCJhdy1waWxsLWNvdW50ZG93blwiPk1lbXVhdC4uLjwvc3Bhbj5cbiAgICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgICA8IS0tIFN1YnRsZSBEaXZpZGVyIC0tPlxuICAgICAgICAgICAgPGRpdiBzdHlsZT1cIndpZHRoOiAxcHg7IGhlaWdodDogMTZweDsgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjEyKTsgZmxleC1zaHJpbms6IDA7IG1hcmdpbjogMCAxcHg7XCI+PC9kaXY+XG5cbiAgICAgICAgICAgIDwhLS0gTWluaSBRdWljayBBY3Rpb25zIC0tPlxuICAgICAgICAgICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGdhcDogNHB4OyBmbGV4LXNocmluazogMDtcIj5cbiAgICAgICAgICAgICAgICA8YnV0dG9uIGlkPVwiYXctcGlsbC10b2dnbGVcIiBjbGFzcz1cImF3LXBpbGwtYnRuXCIgc3R5bGU9XCJcbiAgICAgICAgICAgICAgICAgICAgd2lkdGg6IDIycHg7IGhlaWdodDogMjJweDsgYm9yZGVyLXJhZGl1czogNTAlOyBib3JkZXI6IG5vbmU7XG4gICAgICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6ICR7cnVubmluZyA/ICdsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjZWY0NDQ0IDAlLCAjYjkxYzFjIDEwMCUpJyA6ICdsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjMTBiOTgxIDAlLCAjMDU5NjY5IDEwMCUpJ307XG4gICAgICAgICAgICAgICAgICAgIGNvbG9yOiAjZmZmOyBmb250LXNpemU6IDkuNXB4OyBmb250LXdlaWdodDogNzAwO1xuICAgICAgICAgICAgICAgICAgICBib3gtc2hhZG93OiAwIDJweCA2cHggJHtydW5uaW5nID8gJ3JnYmEoMjM5LDY4LDY4LDAuMzUpJyA6ICdyZ2JhKDE2LDE4NSwxMjksMC4zNSknfTtcbiAgICAgICAgICAgICAgICBcIiB0aXRsZT1cIiR7cnVubmluZyA/ICdQYXVzZSBXb3JrZXInIDogJ1Jlc3VtZSBXb3JrZXInfVwiPiR7cnVubmluZyA/ICfij7gnIDogJ+KWtid9PC9idXR0b24+XG5cbiAgICAgICAgICAgICAgICA8YnV0dG9uIGlkPVwiYXctcGlsbC1leHBhbmRcIiBjbGFzcz1cImF3LXBpbGwtYnRuXCIgc3R5bGU9XCJcbiAgICAgICAgICAgICAgICAgICAgd2lkdGg6IDIycHg7IGhlaWdodDogMjJweDsgYm9yZGVyLXJhZGl1czogNTAlO1xuICAgICAgICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMDgpO1xuICAgICAgICAgICAgICAgICAgICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMTUpO1xuICAgICAgICAgICAgICAgICAgICBjb2xvcjogI2NiZDVlMTtcbiAgICAgICAgICAgICAgICBcIiB0aXRsZT1cIlBlcmJlc2FyIGtlIFBhbmVsIFBlbnVoXCI+JHtJQ09OUy5leHBhbmR9PC9idXR0b24+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG4gICAgYDtcbn1cblxuZnVuY3Rpb24gX3NldHVwRHJhZ0FuZERyb3AocGFuZWwsIHN0YXRlLCBDT05GSUcpIHtcbiAgICBsZXQgZHJhZ2dpbmcgPSBmYWxzZSwgc3RhcnRYID0gMCwgc3RhcnRZID0gMCwgb3JpZ1ggPSAwLCBvcmlnWSA9IDA7XG5cbiAgICBjb25zdCBvbk1vdXNlRG93biA9IGUgPT4ge1xuICAgICAgICBpZiAoQ09ORklHLnBhbmVsUGlubmVkKSByZXR1cm47XG4gICAgICAgIGlmIChlLnRhcmdldC5jbG9zZXN0KCdidXR0b24nKSkgcmV0dXJuO1xuICAgICAgICBkcmFnZ2luZyA9IHRydWU7XG4gICAgICAgIHN0YXJ0WCA9IGUuY2xpZW50WDsgc3RhcnRZID0gZS5jbGllbnRZO1xuICAgICAgICBvcmlnWCAgPSBzdGF0ZS5wYW5lbFg7IG9yaWdZICA9IHN0YXRlLnBhbmVsWTtcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIH07XG5cbiAgICBjb25zdCBoZWFkZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctaGVhZGVyJyk7XG4gICAgY29uc3QgcGlsbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1waWxsLWNvbnRhaW5lcicpO1xuXG4gICAgaWYgKGhlYWRlcikgaGVhZGVyLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIG9uTW91c2VEb3duKTtcbiAgICBpZiAocGlsbCkgcGlsbC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCBvbk1vdXNlRG93bik7XG5cbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCBlID0+IHtcbiAgICAgICAgaWYgKCFkcmFnZ2luZykgcmV0dXJuO1xuICAgICAgICBzdGF0ZS5wYW5lbFggPSBNYXRoLm1heCgwLCBvcmlnWCArIGUuY2xpZW50WCAtIHN0YXJ0WCk7XG4gICAgICAgIHN0YXRlLnBhbmVsWSA9IE1hdGgubWF4KDAsIG9yaWdZICsgZS5jbGllbnRZIC0gc3RhcnRZKTtcbiAgICAgICAgcGFuZWwuc3R5bGUubGVmdCA9IHN0YXRlLnBhbmVsWCArICdweCc7XG4gICAgICAgIHBhbmVsLnN0eWxlLnRvcCAgPSBzdGF0ZS5wYW5lbFkgKyAncHgnO1xuICAgIH0pO1xuXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2V1cCcsICgpID0+IHtcbiAgICAgICAgaWYgKCFkcmFnZ2luZykgcmV0dXJuO1xuICAgICAgICBkcmFnZ2luZyA9IGZhbHNlO1xuICAgICAgICBzZXRWYWx1ZSgncGFuZWxYJywgc3RhdGUucGFuZWxYLnRvU3RyaW5nKCkpO1xuICAgICAgICBzZXRWYWx1ZSgncGFuZWxZJywgc3RhdGUucGFuZWxZLnRvU3RyaW5nKCkpO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBfc2V0dXBQYW5lbENvbnRyb2xzKHBhbmVsLCBzdGF0ZSwgQ09ORklHLCBjdHgpIHtcbiAgICBjb25zdCB7IG9wZW5TZXR0aW5ncywgb3BlbkFuYWx5dGljcywgb3BlbkxvZ1ZpZXdlciwgZG9Xb3JrIH0gPSBjdHg7XG5cbiAgICBjb25zdCBtaW5pbWl6ZUJ0biAgID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LW1pbmltaXplJyk7XG4gICAgY29uc3QgcGluQnRuICAgICAgICA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1waW4nKTtcbiAgICBjb25zdCBoaWRlQnRuICAgICAgID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LWhpZGUnKTtcbiAgICBjb25zdCB0b2dnbGVCdG4gICAgID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LXRvZ2dsZScpO1xuICAgIGNvbnN0IHdvcmtOb3dCdG4gICAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctd29yay1ub3cnKTtcbiAgICBjb25zdCBsb2dzQnRuICAgICAgID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LWxvZ3MnKTtcbiAgICBjb25zdCBhbmFseXRpY3NCdG4gID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LWFuYWx5dGljcycpO1xuICAgIGNvbnN0IHNldHRpbmdzQnRuICAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctc2V0dGluZ3MnKTtcbiAgICBjb25zdCBjb25maXJtQnRuICAgID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LWNvbmZpcm0tdW5jZXJ0YWluJyk7XG4gICAgY29uc3QgcGlsbEV4cGFuZEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1waWxsLWV4cGFuZCcpO1xuICAgIGNvbnN0IHBpbGxUb2dnbGVCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctcGlsbC10b2dnbGUnKTtcbiAgICBjb25zdCBoZWFkZXIgICAgICAgID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LWhlYWRlcicpO1xuICAgIGNvbnN0IHBpbGwgICAgICAgICAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctcGlsbC1jb250YWluZXInKTtcblxuICAgIC8vIEhvdmVyIGVmZmVjdHMgb24gaGVhZGVyIGJ1dHRvbnNcbiAgICBwYW5lbC5xdWVyeVNlbGVjdG9yQWxsKCcuYXctaGVhZGVyLWJ0bicpLmZvckVhY2goYnRuID0+IHtcbiAgICAgICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZW50ZXInLCAoKSA9PiB7XG4gICAgICAgICAgICBidG4uc3R5bGUuYmFja2dyb3VuZCA9ICdyZ2JhKDI1NSwyNTUsMjU1LDAuMTIpJztcbiAgICAgICAgICAgIGJ0bi5zdHlsZS5jb2xvciA9ICcjZmZmJztcbiAgICAgICAgfSk7XG4gICAgICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWxlYXZlJywgKCkgPT4ge1xuICAgICAgICAgICAgaWYgKGJ0bi5pZCA9PT0gJ2F3LXBpbicgJiYgQ09ORklHLnBhbmVsUGlubmVkKSB7XG4gICAgICAgICAgICAgICAgYnRuLnN0eWxlLmJhY2tncm91bmQgPSAncmdiYSgwLCAxMzYsIDI1NSwgMC4yKSc7XG4gICAgICAgICAgICAgICAgYnRuLnN0eWxlLmNvbG9yID0gJyMwMGQ5ZmYnO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChidG4uaWQgPT09ICdhdy1oaWRlJykge1xuICAgICAgICAgICAgICAgIGJ0bi5zdHlsZS5iYWNrZ3JvdW5kID0gJ3RyYW5zcGFyZW50JztcbiAgICAgICAgICAgICAgICBidG4uc3R5bGUuY29sb3IgPSAnI2ZmNTI1Mic7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGJ0bi5zdHlsZS5iYWNrZ3JvdW5kID0gJ3RyYW5zcGFyZW50JztcbiAgICAgICAgICAgICAgICBidG4uc3R5bGUuY29sb3IgPSAnIzg4OTJiMCc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgLy8gTWluaW1pemUgJiBFeHBhbmQgaGFuZGxlcnNcbiAgICBtaW5pbWl6ZUJ0bj8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGFwcGx5UGFuZWxNb2RlKHN0YXRlLCAhc3RhdGUucGFuZWxNaW5pbWl6ZWQpO1xuICAgICAgICBjdHgudXBkYXRlUGFuZWw/LigpO1xuICAgIH0pO1xuXG4gICAgcGlsbEV4cGFuZEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGFwcGx5UGFuZWxNb2RlKHN0YXRlLCBmYWxzZSk7XG4gICAgICAgIGN0eC51cGRhdGVQYW5lbD8uKCk7XG4gICAgfSk7XG5cbiAgICAvLyBEb3VibGUtY2xpY2sgdG8gdG9nZ2xlIG1vZGU6IGRibGNsaWNrIG9uIGhlYWRlciBtaW5pbWl6ZXMsIGRibGNsaWNrIG9uIHBpbGwgZXhwYW5kc1xuICAgIGhlYWRlcj8uYWRkRXZlbnRMaXN0ZW5lcignZGJsY2xpY2snLCBlID0+IHtcbiAgICAgICAgaWYgKGUudGFyZ2V0LmNsb3Nlc3QoJ2J1dHRvbicpKSByZXR1cm47XG4gICAgICAgIGFwcGx5UGFuZWxNb2RlKHN0YXRlLCB0cnVlKTtcbiAgICAgICAgY3R4LnVwZGF0ZVBhbmVsPy4oKTtcbiAgICB9KTtcblxuICAgIHBpbGw/LmFkZEV2ZW50TGlzdGVuZXIoJ2RibGNsaWNrJywgZSA9PiB7XG4gICAgICAgIGlmIChlLnRhcmdldC5jbG9zZXN0KCdidXR0b24nKSkgcmV0dXJuO1xuICAgICAgICBhcHBseVBhbmVsTW9kZShzdGF0ZSwgZmFsc2UpO1xuICAgICAgICBjdHgudXBkYXRlUGFuZWw/LigpO1xuICAgIH0pO1xuXG4gICAgcGluQnRuPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgQ09ORklHLnBhbmVsUGlubmVkID0gIUNPTkZJRy5wYW5lbFBpbm5lZDtcbiAgICAgICAgY3R4LnNhdmVDb25maWc/LihDT05GSUcpO1xuICAgICAgICBjb25zdCBoZHIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctaGVhZGVyJyk7XG4gICAgICAgIGNvbnN0IHBpbGxFbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1waWxsLWNvbnRhaW5lcicpO1xuICAgICAgICBpZiAoaGRyKSBoZHIuc3R5bGUuY3Vyc29yID0gQ09ORklHLnBhbmVsUGlubmVkID8gJ2RlZmF1bHQnIDogJ21vdmUnO1xuICAgICAgICBpZiAocGlsbEVsKSBwaWxsRWwuc3R5bGUuY3Vyc29yID0gQ09ORklHLnBhbmVsUGlubmVkID8gJ2RlZmF1bHQnIDogJ21vdmUnO1xuICAgICAgICBpZiAocGluQnRuKSB7XG4gICAgICAgICAgICBwaW5CdG4uc3R5bGUuYmFja2dyb3VuZCA9IENPTkZJRy5wYW5lbFBpbm5lZCA/ICdyZ2JhKDAsIDEzNiwgMjU1LCAwLjIpJyA6ICd0cmFuc3BhcmVudCc7XG4gICAgICAgICAgICBwaW5CdG4uc3R5bGUuY29sb3IgPSBDT05GSUcucGFuZWxQaW5uZWQgPyAnIzAwZDlmZicgOiAnIzg4OTJiMCc7XG4gICAgICAgICAgICBwaW5CdG4uc3R5bGUuYm9yZGVyID0gQ09ORklHLnBhbmVsUGlubmVkID8gJzFweCBzb2xpZCByZ2JhKDAsIDEzNiwgMjU1LCAwLjQpJyA6ICdub25lJztcbiAgICAgICAgICAgIHBpbkJ0bi50aXRsZSA9IENPTkZJRy5wYW5lbFBpbm5lZCA/ICdVbnBpbicgOiAnUGluJztcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgZnVuY3Rpb24gdG9nZ2xlUnVubmluZ1N0YXRlKCkge1xuICAgICAgICBzdGF0ZS5ydW5uaW5nID0gIXN0YXRlLnJ1bm5pbmc7XG4gICAgICAgIHNldFJ1bm5pbmdVSShzdGF0ZS5ydW5uaW5nKTtcbiAgICAgICAgY3R4LmxvZyhzdGF0ZS5ydW5uaW5nID8gJ1NjcmlwdCBkaWxhbmp1dGthbicgOiAnU2NyaXB0IGRpLXBhdXNlJywgJ2luZm8nKTtcbiAgICAgICAgaWYgKHN0YXRlLnJ1bm5pbmcpIGN0eC53YWtlUGVuZGluZ1dvcms/LigpO1xuICAgICAgICBzYXZlU3RhdGUoc3RhdGUpO1xuICAgICAgICBjb25zdCBzdW1tYXJ5ID0gc2F2ZUxpdmVTdGF0dXMoc3RhdGUsIENPTkZJRywgdHJ1ZSk7XG4gICAgICAgIGN0eC51cGRhdGVQYW5lbD8uKCk7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmIChjaHJvbWU/LnJ1bnRpbWU/LmlkKSB7XG4gICAgICAgICAgICAgICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgYXdfbGl2ZV9zdGF0dXM6IHN1bW1hcnkgfSk7XG4gICAgICAgICAgICAgICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiAnUE9QVVBfVE9fVEFCJyxcbiAgICAgICAgICAgICAgICAgICAgYWN0aW9uOiAndG9nZ2xlUnVubmluZycsXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlOiBzdGF0ZS5ydW5uaW5nXG4gICAgICAgICAgICAgICAgfSkuY2F0Y2goKCkgPT4ge30pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIHsgLyogY29udGV4dCBpbnZhbGlkYXRlZCAqLyB9XG4gICAgfVxuXG4gICAgLy8gUXVpY2sgcGF1c2UvcmVzdW1lIGZyb20gcGlsbFxuICAgIHBpbGxUb2dnbGVCdG4/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgdG9nZ2xlUnVubmluZ1N0YXRlKTtcblxuICAgIHNldHRpbmdzQnRuPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IGN0eC5vcGVuU2V0dGluZ3M/LigpKTtcbiAgICBhbmFseXRpY3NCdG4/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gY3R4Lm9wZW5BbmFseXRpY3M/LigpKTtcbiAgICBoaWRlQnRuPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHRvZ2dsZVBhbmVsVmlzaWJpbGl0eShzdGF0ZSwgQ09ORklHKSk7XG5cbiAgICB0b2dnbGVCdG4/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgdG9nZ2xlUnVubmluZ1N0YXRlKTtcblxuICAgIHdvcmtOb3dCdG4/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4geyBjdHgubG9nKCdNYW51YWwgd29yayB0cmlnZ2VyZWQhJywgJ2luZm8nKTsgY3R4LmRvV29yaz8uKHRydWUpOyB9KTtcbiAgICBsb2dzQnRuPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IGN0eC5vcGVuTG9nVmlld2VyPy4oKSk7XG5cbiAgICBjb25maXJtQnRuPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgaWYgKCFzdGF0ZS53b3JrUmVzdWx0VW5jZXJ0YWluIHx8ICFzdGF0ZS5pc1RhYkxvY2tPd25lcikgcmV0dXJuO1xuICAgICAgICBpZiAoIWNvbmZpcm0oJ1Bhc3Rpa2FuIHN1ZGFoIG1lbWVyaWtzYSBoYWxhbWFuIGdhbWUuIExhbmp1dGthbiB3b3JrZXI/JykpIHJldHVybjtcbiAgICAgICAgc3RhdGUud29ya1Jlc3VsdFVuY2VydGFpbiA9IGZhbHNlO1xuICAgICAgICBzdGF0ZS51bmNlcnRhaW5SZWNvbmNpbGlhdGlvbiA9ICdub25lJztcbiAgICAgICAgY3R4LnVuY2VydGFpbkVuZXJneUJlZm9yZSA9IG51bGw7XG4gICAgICAgIHNldFZhbHVlKCdhd193b3JrUmVzdWx0VW5jZXJ0YWluJywgJ2ZhbHNlJyk7XG4gICAgICAgIHNldFZhbHVlKCdhd191bmNlcnRhaW5FbmVyZ3lCZWZvcmUnLCAnJyk7XG4gICAgICAgIHN0YXRlLmVuZXJneVN5bmNCYXNlID0gbnVsbDtcbiAgICAgICAgY29uc3QgZSA9IGdldEN1cnJlbnRFbmVyZ3koKTtcbiAgICAgICAgaWYgKGUpIHsgc3RhdGUuY3VycmVudEVuZXJneSA9IGUuY3VycmVudDsgc3RhdGUubWF4RW5lcmd5ID0gZS5tYXg7IH1cbiAgICAgICAgc3RhdGUucnVubmluZyA9IHRydWU7XG4gICAgICAgIGN0eC5sb2coJ1dvcmtlciBkaWxhbmp1dGthbiBzZXRlbGFoIGhhc2lsIHRpbWVvdXQgZGlwZXJpa3NhIG1hbnVhbC4nLCAnd2FybicpO1xuICAgICAgICBjdHgudXBkYXRlUGFuZWw/LigpO1xuICAgICAgICBjdHgud2FrZVBlbmRpbmdXb3JrPy4oKTtcbiAgICB9KTtcblxuICAgIC8vIEtleWJvYXJkIHNob3J0Y3V0c1xuICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBwYW5lbC5fa2V5SGFuZGxlciwgdHJ1ZSk7XG4gICAgcGFuZWwuX2tleUhhbmRsZXIgPSBfbWFrZUtleUhhbmRsZXIoc3RhdGUsIENPTkZJRywgY3R4LCB0b2dnbGVSdW5uaW5nU3RhdGUpO1xuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBwYW5lbC5fa2V5SGFuZGxlciwgdHJ1ZSk7XG59XG5cbmZ1bmN0aW9uIF9tYWtlS2V5SGFuZGxlcihzdGF0ZSwgQ09ORklHLCBjdHgsIHRvZ2dsZVJ1bm5pbmdTdGF0ZSkge1xuICAgIHJldHVybiBmdW5jdGlvbiBoYW5kbGVHbG9iYWxLZXlkb3duKGUpIHtcbiAgICAgICAgaWYgKHN0YXRlLnNldHRpbmdzT3BlbikgcmV0dXJuO1xuICAgICAgICBjb25zdCB0YXJnZXQgPSBlLnRhcmdldDtcbiAgICAgICAgaWYgKHRhcmdldD8uaXNDb250ZW50RWRpdGFibGUgfHwgL14oSU5QVVR8VEVYVEFSRUF8U0VMRUNUKSQvLnRlc3QodGFyZ2V0Py50YWdOYW1lKSkgcmV0dXJuO1xuXG4gICAgICAgIGZvciAoY29uc3QgW2FjdGlvbiwgc2hvcnRjdXRdIG9mIE9iamVjdC5lbnRyaWVzKENPTkZJRy5zaG9ydGN1dHMpKSB7XG4gICAgICAgICAgICBpZiAoIXNob3J0Y3V0Py5rZXlzIHx8IHNob3J0Y3V0LmtleXMubGVuZ3RoID09PSAwKSBjb250aW51ZTtcblxuICAgICAgICAgICAgY29uc3QgcmVxQ3RybCAgPSBzaG9ydGN1dC5rZXlzLmluY2x1ZGVzKCdDb250cm9sJyk7XG4gICAgICAgICAgICBjb25zdCByZXFTaGlmdCA9IHNob3J0Y3V0LmtleXMuaW5jbHVkZXMoJ1NoaWZ0Jyk7XG4gICAgICAgICAgICBjb25zdCByZXFBbHQgICA9IHNob3J0Y3V0LmtleXMuaW5jbHVkZXMoJ0FsdCcpO1xuXG4gICAgICAgICAgICAvLyBFeGFjdCBtb2RpZmllciBtYXRjaGluZyDigJQgcHJldmVudHMgZmFsc2UgdHJpZ2dlcnMgd2hlbiBleHRyYSBtb2RpZmllcnMgYXJlIGhlbGRcbiAgICAgICAgICAgIGlmIChCb29sZWFuKGUuY3RybEtleSkgIT09IHJlcUN0cmwpIGNvbnRpbnVlO1xuICAgICAgICAgICAgaWYgKEJvb2xlYW4oZS5zaGlmdEtleSkgIT09IHJlcVNoaWZ0KSBjb250aW51ZTtcbiAgICAgICAgICAgIGlmIChCb29sZWFuKGUuYWx0S2V5KSAhPT0gcmVxQWx0KSBjb250aW51ZTtcbiAgICAgICAgICAgIGlmIChlLm1ldGFLZXkpIGNvbnRpbnVlOyAvLyBOZXZlciBoaWphY2sgT1MvTWV0YSBrZXlzXG5cbiAgICAgICAgICAgIGNvbnN0IG5vbk1vZGlmaWVyS2V5cyA9IHNob3J0Y3V0LmtleXMuZmlsdGVyKGsgPT4gayAhPT0gJ0NvbnRyb2wnICYmIGsgIT09ICdTaGlmdCcgJiYgayAhPT0gJ0FsdCcpO1xuICAgICAgICAgICAgaWYgKG5vbk1vZGlmaWVyS2V5cy5sZW5ndGggPiAwICYmICFub25Nb2RpZmllcktleXMuaW5jbHVkZXMoZS5jb2RlKSkgY29udGludWU7XG5cbiAgICAgICAgICAgIGlmIChhY3Rpb24gPT09ICdwYXVzZVJlc3VtZScgJiYgc3RhdGUudGFiTG9ja01hbmFnZWQgJiYgIXN0YXRlLmlzVGFiTG9ja093bmVyKSByZXR1cm47XG4gICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7IGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cbiAgICAgICAgICAgIGlmIChhY3Rpb24gPT09ICdzaG93SGlkZScpICAgICAgICAgdG9nZ2xlUGFuZWxWaXNpYmlsaXR5KHN0YXRlLCBDT05GSUcpO1xuICAgICAgICAgICAgZWxzZSBpZiAoYWN0aW9uID09PSAnd29ya05vdycpICAgICB7IGN0eC5sb2coJ01hbnVhbCB3b3JrIScsICdpbmZvJyk7IGN0eC5kb1dvcms/Lih0cnVlKTsgfVxuICAgICAgICAgICAgZWxzZSBpZiAoYWN0aW9uID09PSAncGF1c2VSZXN1bWUnKSB0b2dnbGVSdW5uaW5nU3RhdGUoKTtcbiAgICAgICAgICAgIGVsc2UgaWYgKGFjdGlvbiA9PT0gJ29wZW5Mb2cnKSAgICAgY3R4Lm9wZW5Mb2dWaWV3ZXI/LigpO1xuICAgICAgICAgICAgZWxzZSBpZiAoYWN0aW9uID09PSAnb3BlblNldHRpbmdzJykgY3R4Lm9wZW5TZXR0aW5ncz8uKCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICB9O1xufVxuXG5mdW5jdGlvbiBfc2V0dXBSZXNwb25zaXZlQmVoYXZpb3IocGFuZWwsIHN0YXRlLCBDT05GSUcpIHtcbiAgICBpZiAoIUNPTkZJRy5wYW5lbEZvbGxvd1ZpZXdwb3J0KSByZXR1cm47XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsICgpID0+IHtcbiAgICAgICAgY29uc3QgbWF4WCA9IHdpbmRvdy5pbm5lcldpZHRoICAtIHBhbmVsLm9mZnNldFdpZHRoICAtIDEwO1xuICAgICAgICBjb25zdCBtYXhZID0gd2luZG93LmlubmVySGVpZ2h0IC0gcGFuZWwub2Zmc2V0SGVpZ2h0IC0gMTA7XG4gICAgICAgIGlmIChzdGF0ZS5wYW5lbFggPiBtYXhYIHx8IHN0YXRlLnBhbmVsWSA+IG1heFkpIHtcbiAgICAgICAgICAgIGlmIChDT05GSUcucGFuZWxSZXR1cm5Ub09yaWdpbmFsKSB7XG4gICAgICAgICAgICAgICAgc3RhdGUucGFuZWxYID0gc3RhdGUub3JpZ2luYWxQYW5lbFg7XG4gICAgICAgICAgICAgICAgc3RhdGUucGFuZWxZID0gc3RhdGUub3JpZ2luYWxQYW5lbFk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHN0YXRlLnBhbmVsWCA9IE1hdGgubWF4KDAsIE1hdGgubWluKHN0YXRlLnBhbmVsWCwgbWF4WCkpO1xuICAgICAgICAgICAgICAgIHN0YXRlLnBhbmVsWSA9IE1hdGgubWF4KDAsIE1hdGgubWluKHN0YXRlLnBhbmVsWSwgbWF4WSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcGFuZWwuc3R5bGUubGVmdCA9IHN0YXRlLnBhbmVsWCArICdweCc7XG4gICAgICAgICAgICBwYW5lbC5zdHlsZS50b3AgID0gc3RhdGUucGFuZWxZICsgJ3B4JztcbiAgICAgICAgfVxuICAgIH0pO1xufVxuIiwiLyoqXG4gKiB1aS9zZXR0aW5ncy5qcyDigJQgU2V0dGluZ3MgbW9kYWxcbiAqIE1vZGVybml6ZWQgd2l0aCBjYXRlZ29yaXplZCB0YWJzLCBpT1Mtc3R5bGUgYW5pbWF0ZWQgc3dpdGNoZXMsXG4gKiBwcmVzZXQgY2hpcHMsIGFuZCBkYXJrIGdsYXNzbW9ycGhpYyBzdHlsaW5nLlxuICogR01fc2V0VmFsdWUg4oaSIHNldFZhbHVlLCBzZW5kTm90aWZpY2F0aW9uL2xvZyDihpIgY3R4LCBzYXZlQ29uZmlnIGZyb20gY29uZmlnLmpzLlxuICovXG5cbmltcG9ydCB7IGdldFZhbHVlLCBzZXRWYWx1ZSB9IGZyb20gJy4uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgbm9ybWFsaXplQ29uZmlnLCBzYXZlQ29uZmlnIH0gZnJvbSAnLi4vY29uZmlnLmpzJztcbmltcG9ydCB7IGdldFNhdmVkQ3JlZGVudGlhbHMsIHNhdmVDcmVkZW50aWFscywgY2xlYXJDcmVkZW50aWFscyB9IGZyb20gJy4uL2F1dG9sb2dpbi5qcyc7XG5cbi8vIEluamVjdCBtb2Rlcm4gc2V0dGluZ3Mgc3R5bGVzaGVldCBvbmNlXG5mdW5jdGlvbiBlbnN1cmVTZXR0aW5nc1N0eWxlcygpIHtcbiAgICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LXNldHRpbmdzLXN0eWxlcycpKSByZXR1cm47XG4gICAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuICAgIHN0eWxlLmlkID0gJ2F3LXNldHRpbmdzLXN0eWxlcyc7XG4gICAgc3R5bGUudGV4dENvbnRlbnQgPSBgXG4gICAgICAgIC8qIE1vZGFsICYgQ29udGFpbmVyICovXG4gICAgICAgICNhdy1zZXR0aW5ncy1tb2RhbCB7XG4gICAgICAgICAgICBmb250LWZhbWlseTogLWFwcGxlLXN5c3RlbSwgQmxpbmtNYWNTeXN0ZW1Gb250LCBcIlNlZ29lIFVJXCIsIFJvYm90bywgXCJIZWx2ZXRpY2EgTmV1ZVwiLCBBcmlhbCwgc2Fucy1zZXJpZjtcbiAgICAgICAgICAgIGNvbG9yOiAjZTJlOGYwO1xuICAgICAgICB9XG5cbiAgICAgICAgLyogTW9kZXJuIFRhYnMgTmF2aWdhdGlvbiAqL1xuICAgICAgICAuYXctdGFiLW5hdiB7XG4gICAgICAgICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgICAgICAgZ2FwOiA1cHg7XG4gICAgICAgICAgICBwYWRkaW5nOiA4cHggMTRweDtcbiAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMTIsIDE2LCAyNiwgMC43KTtcbiAgICAgICAgICAgIGJvcmRlci1ib3R0b206IDFweCBzb2xpZCByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMDgpO1xuICAgICAgICAgICAgb3ZlcmZsb3cteDogYXV0bztcbiAgICAgICAgICAgIHNjcm9sbGJhci13aWR0aDogbm9uZTtcbiAgICAgICAgICAgIHNjcm9sbC1iZWhhdmlvcjogc21vb3RoO1xuICAgICAgICB9XG4gICAgICAgIC5hdy10YWItbmF2Ojotd2Via2l0LXNjcm9sbGJhciB7XG4gICAgICAgICAgICBkaXNwbGF5OiBub25lO1xuICAgICAgICB9XG4gICAgICAgIC5hdy10YWItYnRuIHtcbiAgICAgICAgICAgIGZsZXg6IDEgMSBhdXRvO1xuICAgICAgICAgICAgZGlzcGxheTogaW5saW5lLWZsZXg7XG4gICAgICAgICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAgICAgICAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7XG4gICAgICAgICAgICBnYXA6IDVweDtcbiAgICAgICAgICAgIHBhZGRpbmc6IDdweCAxMHB4O1xuICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjAzKTtcbiAgICAgICAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4wNyk7XG4gICAgICAgICAgICBib3JkZXItcmFkaXVzOiA4cHg7XG4gICAgICAgICAgICBjb2xvcjogIzhiOWJiNDtcbiAgICAgICAgICAgIGZvbnQtc2l6ZTogMTEuNXB4O1xuICAgICAgICAgICAgZm9udC13ZWlnaHQ6IDUwMDtcbiAgICAgICAgICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICAgICAgICAgIHdoaXRlLXNwYWNlOiBub3dyYXA7XG4gICAgICAgICAgICB0cmFuc2l0aW9uOiBhbGwgMC4ycyBjdWJpYy1iZXppZXIoMC40LCAwLCAwLjIsIDEpO1xuICAgICAgICAgICAgdXNlci1zZWxlY3Q6IG5vbmU7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LXRhYi1idG46aG92ZXIge1xuICAgICAgICAgICAgY29sb3I6ICNmZmZmZmY7XG4gICAgICAgICAgICBiYWNrZ3JvdW5kOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMDgpO1xuICAgICAgICAgICAgYm9yZGVyLWNvbG9yOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMTUpO1xuICAgICAgICB9XG4gICAgICAgIC5hdy10YWItYnRuLmFjdGl2ZSB7XG4gICAgICAgICAgICBjb2xvcjogIzAwZmY4ODtcbiAgICAgICAgICAgIGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsIHJnYmEoMCwgMjU1LCAxMzYsIDAuMTQpLCByZ2JhKDAsIDE4MCwgMjE2LCAwLjA5KSk7XG4gICAgICAgICAgICBib3JkZXItY29sb3I6IHJnYmEoMCwgMjU1LCAxMzYsIDAuNSk7XG4gICAgICAgICAgICBmb250LXdlaWdodDogNjAwO1xuICAgICAgICAgICAgYm94LXNoYWRvdzogMCAycHggMTBweCByZ2JhKDAsIDI1NSwgMTM2LCAwLjE1KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8qIFRhYiBDb250ZW50IEFuaW1hdGlvbiAqL1xuICAgICAgICAuYXctdGFiLXBhbmUge1xuICAgICAgICAgICAgZGlzcGxheTogbm9uZTtcbiAgICAgICAgICAgIGFuaW1hdGlvbjogYXdUYWJGYWRlIDAuMjJzIGN1YmljLWJlemllcigwLjQsIDAsIDAuMiwgMSk7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LXRhYi1wYW5lLmFjdGl2ZSB7XG4gICAgICAgICAgICBkaXNwbGF5OiBibG9jaztcbiAgICAgICAgfVxuICAgICAgICBAa2V5ZnJhbWVzIGF3VGFiRmFkZSB7XG4gICAgICAgICAgICBmcm9tIHsgb3BhY2l0eTogMDsgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKDRweCk7IH1cbiAgICAgICAgICAgIHRvIHsgb3BhY2l0eTogMTsgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKDApOyB9XG4gICAgICAgIH1cblxuICAgICAgICAvKiBTZXR0aW5nIENhcmRzICovXG4gICAgICAgIC5hdy1jYXJkIHtcbiAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMjIsIDI3LCA0MiwgMC41NSk7XG4gICAgICAgICAgICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMDYpO1xuICAgICAgICAgICAgYm9yZGVyLXJhZGl1czogMTBweDtcbiAgICAgICAgICAgIHBhZGRpbmc6IDEycHggMTRweDtcbiAgICAgICAgICAgIG1hcmdpbi1ib3R0b206IDEwcHg7XG4gICAgICAgICAgICB0cmFuc2l0aW9uOiBhbGwgMC4ycztcbiAgICAgICAgfVxuICAgICAgICAuYXctY2FyZDpob3ZlciB7XG4gICAgICAgICAgICBib3JkZXItY29sb3I6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4xMik7XG4gICAgICAgICAgICBiYWNrZ3JvdW5kOiByZ2JhKDI4LCAzNSwgNTQsIDAuNjUpO1xuICAgICAgICB9XG4gICAgICAgIC5hdy1jYXJkLXJvdyB7XG4gICAgICAgICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgICAgICAganVzdGlmeS1jb250ZW50OiBzcGFjZS1iZXR3ZWVuO1xuICAgICAgICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICAgICAgICAgIGdhcDogMTRweDtcbiAgICAgICAgfVxuICAgICAgICAuYXctY2FyZC1pbmZvIHtcbiAgICAgICAgICAgIGZsZXg6IDE7XG4gICAgICAgICAgICBtaW4td2lkdGg6IDA7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LWNhcmQtdGl0bGUge1xuICAgICAgICAgICAgZm9udC1zaXplOiAxM3B4O1xuICAgICAgICAgICAgZm9udC13ZWlnaHQ6IDYwMDtcbiAgICAgICAgICAgIGNvbG9yOiAjZjFmNWY5O1xuICAgICAgICAgICAgbWFyZ2luLWJvdHRvbTogM3B4O1xuICAgICAgICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgICAgICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgICAgICAgICBnYXA6IDZweDtcbiAgICAgICAgfVxuICAgICAgICAuYXctY2FyZC1kZXNjIHtcbiAgICAgICAgICAgIGZvbnQtc2l6ZTogMTFweDtcbiAgICAgICAgICAgIGNvbG9yOiAjOGI5YmI0O1xuICAgICAgICAgICAgbGluZS1oZWlnaHQ6IDEuNDU7XG4gICAgICAgIH1cblxuICAgICAgICAvKiBNb2Rlcm4gaU9TL0ZsdWVudCBUb2dnbGUgU3dpdGNoICovXG4gICAgICAgIC5hdy1zd2l0Y2gge1xuICAgICAgICAgICAgcG9zaXRpb246IHJlbGF0aXZlO1xuICAgICAgICAgICAgZGlzcGxheTogaW5saW5lLWJsb2NrO1xuICAgICAgICAgICAgd2lkdGg6IDQ0cHg7XG4gICAgICAgICAgICBoZWlnaHQ6IDI0cHg7XG4gICAgICAgICAgICBmbGV4LXNocmluazogMDtcbiAgICAgICAgICAgIG1hcmdpbjogMDtcbiAgICAgICAgICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICAgICAgfVxuICAgICAgICAuYXctc3dpdGNoIGlucHV0IHtcbiAgICAgICAgICAgIG9wYWNpdHk6IDA7XG4gICAgICAgICAgICB3aWR0aDogMDtcbiAgICAgICAgICAgIGhlaWdodDogMDtcbiAgICAgICAgICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgICAgICAgfVxuICAgICAgICAuYXctc3dpdGNoIC5hdy1zbGlkZXIge1xuICAgICAgICAgICAgcG9zaXRpb246IGFic29sdXRlO1xuICAgICAgICAgICAgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgICAgICAgdG9wOiAwOyBsZWZ0OiAwOyByaWdodDogMDsgYm90dG9tOiAwO1xuICAgICAgICAgICAgYmFja2dyb3VuZDogIzFlMjQzNjtcbiAgICAgICAgICAgIGJvcmRlcjogMXB4IHNvbGlkICMzNzNmNTk7XG4gICAgICAgICAgICB0cmFuc2l0aW9uOiBhbGwgMC4yNXMgY3ViaWMtYmV6aWVyKDAuNCwgMCwgMC4yLCAxKTtcbiAgICAgICAgICAgIGJvcmRlci1yYWRpdXM6IDI0cHg7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LXN3aXRjaCAuYXctc2xpZGVyOmJlZm9yZSB7XG4gICAgICAgICAgICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gICAgICAgICAgICBjb250ZW50OiBcIlwiO1xuICAgICAgICAgICAgaGVpZ2h0OiAxOHB4O1xuICAgICAgICAgICAgd2lkdGg6IDE4cHg7XG4gICAgICAgICAgICBsZWZ0OiAycHg7XG4gICAgICAgICAgICBib3R0b206IDJweDtcbiAgICAgICAgICAgIGJhY2tncm91bmQtY29sb3I6ICM5NGEzYjg7XG4gICAgICAgICAgICB0cmFuc2l0aW9uOiBhbGwgMC4yNXMgY3ViaWMtYmV6aWVyKDAuNCwgMCwgMC4yLCAxKTtcbiAgICAgICAgICAgIGJvcmRlci1yYWRpdXM6IDUwJTtcbiAgICAgICAgICAgIGJveC1zaGFkb3c6IDAgMnB4IDRweCByZ2JhKDAsMCwwLDAuNCk7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LXN3aXRjaCBpbnB1dDpjaGVja2VkICsgLmF3LXNsaWRlciB7XG4gICAgICAgICAgICBiYWNrZ3JvdW5kOiBsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjMDBmZjg4LCAjMDBjYzY2KTtcbiAgICAgICAgICAgIGJvcmRlci1jb2xvcjogIzAwZmY4ODtcbiAgICAgICAgICAgIGJveC1zaGFkb3c6IDAgMCAxMnB4IHJnYmEoMCwgMjU1LCAxMzYsIDAuMzUpO1xuICAgICAgICB9XG4gICAgICAgIC5hdy1zd2l0Y2ggaW5wdXQ6Y2hlY2tlZCArIC5hdy1zbGlkZXI6YmVmb3JlIHtcbiAgICAgICAgICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlWCgyMHB4KTtcbiAgICAgICAgICAgIGJhY2tncm91bmQtY29sb3I6ICNmZmZmZmY7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LXN3aXRjaDpob3ZlciAuYXctc2xpZGVyIHtcbiAgICAgICAgICAgIGJvcmRlci1jb2xvcjogIzUwNWM4MDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8qIFJhbmdlIFNsaWRlciAmIElucHV0cyAqL1xuICAgICAgICAuYXctcmFuZ2Utc2xpZGVyIHtcbiAgICAgICAgICAgIGZsZXg6IDE7XG4gICAgICAgICAgICBoZWlnaHQ6IDZweDtcbiAgICAgICAgICAgIGJvcmRlci1yYWRpdXM6IDNweDtcbiAgICAgICAgICAgIGJhY2tncm91bmQ6ICMyNTJjNDI7XG4gICAgICAgICAgICBvdXRsaW5lOiBub25lO1xuICAgICAgICAgICAgYWNjZW50LWNvbG9yOiAjMDBmZjg4O1xuICAgICAgICAgICAgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgICB9XG4gICAgICAgIC5hdy1udW0tYmFkZ2Uge1xuICAgICAgICAgICAgd2lkdGg6IDU4cHg7XG4gICAgICAgICAgICBiYWNrZ3JvdW5kOiAjMTQxODI2O1xuICAgICAgICAgICAgY29sb3I6ICMwMGZmODg7XG4gICAgICAgICAgICBib3JkZXI6IDFweCBzb2xpZCAjMmUzNzUyO1xuICAgICAgICAgICAgYm9yZGVyLXJhZGl1czogNnB4O1xuICAgICAgICAgICAgcGFkZGluZzogNXB4IDZweDtcbiAgICAgICAgICAgIGZvbnQtc2l6ZTogMTNweDtcbiAgICAgICAgICAgIGZvbnQtd2VpZ2h0OiA3MDA7XG4gICAgICAgICAgICB0ZXh0LWFsaWduOiBjZW50ZXI7XG4gICAgICAgICAgICB0cmFuc2l0aW9uOiBib3JkZXItY29sb3IgMC4ycztcbiAgICAgICAgfVxuICAgICAgICAuYXctbnVtLWJhZGdlOmZvY3VzIHtcbiAgICAgICAgICAgIGJvcmRlci1jb2xvcjogIzAwZmY4ODtcbiAgICAgICAgICAgIG91dGxpbmU6IG5vbmU7XG4gICAgICAgICAgICBib3gtc2hhZG93OiAwIDAgMCAycHggcmdiYSgwLCAyNTUsIDEzNiwgMC4yKTtcbiAgICAgICAgfVxuICAgICAgICAuYXctc2VsZWN0LWJveCB7XG4gICAgICAgICAgICBiYWNrZ3JvdW5kOiAjMTQxODI2O1xuICAgICAgICAgICAgY29sb3I6ICMwMGZmODg7XG4gICAgICAgICAgICBib3JkZXI6IDFweCBzb2xpZCAjMmUzNzUyO1xuICAgICAgICAgICAgYm9yZGVyLXJhZGl1czogNnB4O1xuICAgICAgICAgICAgcGFkZGluZzogNXB4IDEwcHg7XG4gICAgICAgICAgICBmb250LXNpemU6IDEycHg7XG4gICAgICAgICAgICBmb250LXdlaWdodDogNjAwO1xuICAgICAgICAgICAgb3V0bGluZTogbm9uZTtcbiAgICAgICAgICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICAgICAgICAgIHRyYW5zaXRpb246IGJvcmRlci1jb2xvciAwLjJzO1xuICAgICAgICB9XG4gICAgICAgIC5hdy1zZWxlY3QtYm94OmZvY3VzIHtcbiAgICAgICAgICAgIGJvcmRlci1jb2xvcjogIzAwZmY4ODtcbiAgICAgICAgfVxuXG4gICAgICAgIC8qIFF1aWNrIFByZXNldCBDaGlwcyAqL1xuICAgICAgICAuYXctcHJlc2V0LWJ0biB7XG4gICAgICAgICAgICBiYWNrZ3JvdW5kOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMDUpO1xuICAgICAgICAgICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjEpO1xuICAgICAgICAgICAgY29sb3I6ICM5NGEzYjg7XG4gICAgICAgICAgICBib3JkZXItcmFkaXVzOiA2cHg7XG4gICAgICAgICAgICBwYWRkaW5nOiAzcHggOXB4O1xuICAgICAgICAgICAgZm9udC1zaXplOiAxMXB4O1xuICAgICAgICAgICAgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgICAgICAgdHJhbnNpdGlvbjogYWxsIDAuMTVzO1xuICAgICAgICB9XG4gICAgICAgIC5hdy1wcmVzZXQtYnRuOmhvdmVyIHtcbiAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMCwgMjU1LCAxMzYsIDAuMTIpO1xuICAgICAgICAgICAgY29sb3I6ICMwMGZmODg7XG4gICAgICAgICAgICBib3JkZXItY29sb3I6IHJnYmEoMCwgMjU1LCAxMzYsIDAuNCk7XG4gICAgICAgIH1cblxuICAgICAgICAvKiBDdXN0b20gU2Nyb2xsYmFyICovXG4gICAgICAgICNhdy1zZXR0aW5ncy1jb250ZW50Ojotd2Via2l0LXNjcm9sbGJhciB7XG4gICAgICAgICAgICB3aWR0aDogNnB4O1xuICAgICAgICB9XG4gICAgICAgICNhdy1zZXR0aW5ncy1jb250ZW50Ojotd2Via2l0LXNjcm9sbGJhci10cmFjayB7XG4gICAgICAgICAgICBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDtcbiAgICAgICAgfVxuICAgICAgICAjYXctc2V0dGluZ3MtY29udGVudDo6LXdlYmtpdC1zY3JvbGxiYXItdGh1bWIge1xuICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjE0KTtcbiAgICAgICAgICAgIGJvcmRlci1yYWRpdXM6IDRweDtcbiAgICAgICAgfVxuICAgICAgICAjYXctc2V0dGluZ3MtY29udGVudDo6LXdlYmtpdC1zY3JvbGxiYXItdGh1bWI6aG92ZXIge1xuICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjI4KTtcbiAgICAgICAgfVxuICAgIGA7XG4gICAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChzdHlsZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVTZXR0aW5nc01vZGFsKENPTkZJRywgY3R4KSB7XG4gICAgZW5zdXJlU2V0dGluZ3NTdHlsZXMoKTtcblxuICAgIGNvbnN0IHNhdmVkQ3JlZHMgPSBnZXRTYXZlZENyZWRlbnRpYWxzKCk7XG4gICAgY29uc3Qgb2xkID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LXNldHRpbmdzLW1vZGFsJyk7XG4gICAgaWYgKG9sZCkgb2xkLnJlbW92ZSgpO1xuXG4gICAgY29uc3QgbW9kYWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBtb2RhbC5pZCA9ICdhdy1zZXR0aW5ncy1tb2RhbCc7XG4gICAgbW9kYWwuc3R5bGUuY3NzVGV4dCA9IGBcbiAgICAgICAgZGlzcGxheTogbm9uZTtcbiAgICAgICAgcG9zaXRpb246IGZpeGVkO1xuICAgICAgICB0b3A6IDA7IGxlZnQ6IDA7IHJpZ2h0OiAwOyBib3R0b206IDA7XG4gICAgICAgIGJhY2tncm91bmQ6IHJnYmEoNCwgNywgMTQsIDAuNzgpO1xuICAgICAgICBiYWNrZHJvcC1maWx0ZXI6IGJsdXIoOHB4KTtcbiAgICAgICAgLXdlYmtpdC1iYWNrZHJvcC1maWx0ZXI6IGJsdXIoOHB4KTtcbiAgICAgICAgei1pbmRleDogMTAwMDAxO1xuICAgICAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcbiAgICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICBgO1xuXG4gICAgY29uc3Qgc2hvcnRjdXRBY3Rpb25zID0gW1xuICAgICAgICB7IGlkOiAnc2hvd0hpZGUnLCAgICAgbGFiZWw6ICdUYW1waWxrYW4vU2VtYnVueWlrYW4gUGFuZWwnIH0sXG4gICAgICAgIHsgaWQ6ICd3b3JrTm93JywgICAgICBsYWJlbDogJ0tlcmphIFNla2FyYW5nIChXb3JrIE5vdyknIH0sXG4gICAgICAgIHsgaWQ6ICdwYXVzZVJlc3VtZScsICBsYWJlbDogJ0plZGEvTGFuanV0a2FuIChQYXVzZS9SZXN1bWUpJyB9LFxuICAgICAgICB7IGlkOiAnb3BlbkxvZycsICAgICAgbGFiZWw6ICdCdWthIEFjdGl2aXR5IExvZycgfSxcbiAgICAgICAgeyBpZDogJ29wZW5TZXR0aW5ncycsIGxhYmVsOiAnQnVrYSBNZW51IFBlbmdhdHVyYW4nIH1cbiAgICBdO1xuXG4gICAgY29uc3Qgc2hvcnRjdXRJbnB1dHNIVE1MID0gc2hvcnRjdXRBY3Rpb25zLm1hcChhY3Rpb24gPT4ge1xuICAgICAgICBjb25zdCBzaG9ydGN1dCA9IENPTkZJRy5zaG9ydGN1dHNbYWN0aW9uLmlkXSB8fCB7IGRpc3BsYXk6ICcnIH07XG4gICAgICAgIHJldHVybiBgXG4gICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTogZmxleDsgZ2FwOiAxMHB4OyBhbGlnbi1pdGVtczogY2VudGVyOyBtYXJnaW4tYm90dG9tOiAxMHB4OyBiYWNrZ3JvdW5kOiByZ2JhKDI1NSwyNTUsMjU1LDAuMDIpOyBwYWRkaW5nOiA4cHggMTJweDsgYm9yZGVyLXJhZGl1czogOHB4OyBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDI1NSwyNTUsMjU1LDAuMDUpO1wiPlxuICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiY29sb3I6ICNjYmQ1ZTE7IGZvbnQtc2l6ZTogMTJweDsgZmxleDogMTsgZm9udC13ZWlnaHQ6IDUwMDtcIj4ke2FjdGlvbi5sYWJlbH08L3NwYW4+XG4gICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6IGZsZXg7IGdhcDogOHB4OyBhbGlnbi1pdGVtczogY2VudGVyOyBmbGV4OiAwIDAgMjEwcHg7XCI+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJyZWNvcmQtJHthY3Rpb24uaWR9XCIgc3R5bGU9XCJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6ICMyNTJjNDA7IGNvbG9yOiAjZmZmOyBib3JkZXI6IDFweCBzb2xpZCAjM2I0NTYzO1xuICAgICAgICAgICAgICAgICAgICAgICAgcGFkZGluZzogNnB4IDEwcHg7IGJvcmRlci1yYWRpdXM6IDZweDsgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9udC1zaXplOiAxMXB4OyBtaW4td2lkdGg6IDc2cHg7IGZvbnQtd2VpZ2h0OiA1MDA7IHRyYW5zaXRpb246IGJhY2tncm91bmQgMC4xNXM7XG4gICAgICAgICAgICAgICAgICAgIFwiPvCfjq8gUmVjb3JkPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwidGV4dFwiIGlkPVwic2hvcnRjdXQtJHthY3Rpb24uaWR9XCIgdmFsdWU9XCIke3Nob3J0Y3V0LmRpc3BsYXl9XCJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlYWRvbmx5XG4gICAgICAgICAgICAgICAgICAgICAgICBzdHlsZT1cIndpZHRoOiAxMTBweDsgYmFja2dyb3VuZDogIzEyMTYyNDsgY29sb3I6ICMwMGQ0ZmY7IGJvcmRlcjogMXB4IHNvbGlkICMyODMzNGU7IGJvcmRlci1yYWRpdXM6IDZweDsgcGFkZGluZzogNnB4IDhweDsgZm9udC1zaXplOiAxMXB4OyBmb250LXdlaWdodDogNzAwOyB0ZXh0LWFsaWduOiBjZW50ZXI7XCI+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgYDtcbiAgICB9KS5qb2luKCcnKTtcblxuICAgIG1vZGFsLmlubmVySFRNTCA9IGBcbiAgICAgICAgPGRpdiBzdHlsZT1cIlxuICAgICAgICAgICAgYmFja2dyb3VuZDogbGluZWFyLWdyYWRpZW50KDE4MGRlZywgIzEzMTcyNCAwJSwgIzBkMTAxYSAxMDAlKTtcbiAgICAgICAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4xMik7XG4gICAgICAgICAgICBib3JkZXItcmFkaXVzOiAxNnB4O1xuICAgICAgICAgICAgd2lkdGg6IDk1JTtcbiAgICAgICAgICAgIG1heC13aWR0aDogNjgwcHg7XG4gICAgICAgICAgICBtYXgtaGVpZ2h0OiA5MHZoO1xuICAgICAgICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgICAgICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG4gICAgICAgICAgICBib3gtc2hhZG93OiAwIDIwcHggNjBweCByZ2JhKDAsMCwwLDAuOCksIDAgMCAxcHggMXB4IHJnYmEoMjU1LDI1NSwyNTUsMC4wNSk7XG4gICAgICAgICAgICBvdmVyZmxvdzogaGlkZGVuO1xuICAgICAgICBcIj5cbiAgICAgICAgICAgIDwhLS0gTW9kYWwgSGVhZGVyIC0tPlxuICAgICAgICAgICAgPGRpdiBzdHlsZT1cIlxuICAgICAgICAgICAgICAgIHBhZGRpbmc6IDE2cHggMjBweDtcbiAgICAgICAgICAgICAgICBib3JkZXItYm90dG9tOiAxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjA4KTtcbiAgICAgICAgICAgICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgICAgICAgICAgIGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjtcbiAgICAgICAgICAgICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsIHJnYmEoMjYsIDMzLCA1NCwgMC44KSAwJSwgcmdiYSgxOCwgMjIsIDM2LCAwLjk1KSAxMDAlKTtcbiAgICAgICAgICAgIFwiPlxuICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBnYXA6IDEwcHg7XCI+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJcbiAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoOiAzMnB4OyBoZWlnaHQ6IDMycHg7IGJvcmRlci1yYWRpdXM6IDhweDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsIHJnYmEoMCwyNTUsMTM2LDAuMiksIHJnYmEoMCwxODAsMjE2LDAuMikpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSgwLDI1NSwxMzYsMC4zKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGp1c3RpZnktY29udGVudDogY2VudGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9udC1zaXplOiAxNnB4O1xuICAgICAgICAgICAgICAgICAgICBcIj7impnvuI88L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJmb250LXdlaWdodDogNzAwOyBjb2xvcjogI2ZmZjsgZm9udC1zaXplOiAxNXB4OyBsZXR0ZXItc3BhY2luZzogMC4zcHg7XCI+UGVuZ2F0dXJhbiBCb3Q8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJmb250LXNpemU6IDExcHg7IGNvbG9yOiAjOGI5YmI0O1wiPlNlc3VhaWthbiBqYWR3YWwsIHRocmVzaG9sZCwgbm90aWZpa2FzaSAmIGtlYW1hbmFuPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJhdy1jbG9zZS1zZXR0aW5nc1wiIHN0eWxlPVwiXG4gICAgICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4wNSk7IGNvbG9yOiAjY2JkNWUxOyBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMTIpO1xuICAgICAgICAgICAgICAgICAgICBwYWRkaW5nOiA2cHggMTJweDsgYm9yZGVyLXJhZGl1czogOHB4OyBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICAgICAgICAgICAgICAgIGZvbnQtc2l6ZTogMTJweDsgZm9udC13ZWlnaHQ6IDYwMDsgdHJhbnNpdGlvbjogYWxsIDAuMTVzO1xuICAgICAgICAgICAgICAgIFwiPuKclSBUdXR1cDwvYnV0dG9uPlxuICAgICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICAgIDwhLS0gU2VnbWVudGVkIENhdGVnb3J5IFRhYnMgLS0+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctdGFiLW5hdlwiPlxuICAgICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJhdy10YWItYnRuIGFjdGl2ZVwiIGRhdGEtdGFiPVwidGFiLXdvcmtcIj7imqEgS2VyamEgJiBFbmVyZ2k8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYXctdGFiLWJ0blwiIGRhdGEtdGFiPVwidGFiLXN0ZWFsdGhcIj7wn5uh77iPIFN0ZWFsdGggJiBKYWR3YWw8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYXctdGFiLWJ0blwiIGRhdGEtdGFiPVwidGFiLW5vdGlmXCI+8J+UlCBOb3RpZmlrYXNpICYgU3VhcmE8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYXctdGFiLWJ0blwiIGRhdGEtdGFiPVwidGFiLXVpXCI+8J+Wpe+4jyBUYW1waWxhbiAmIFRvbWJvbDwvYnV0dG9uPlxuICAgICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJhdy10YWItYnRuXCIgZGF0YS10YWI9XCJ0YWItYWNjb3VudFwiPvCflJAgQWt1biAmIFNpc3RlbTwvYnV0dG9uPlxuICAgICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICAgIDwhLS0gU2Nyb2xsYWJsZSBDb250ZW50IEJvZHkgLS0+XG4gICAgICAgICAgICA8ZGl2IGlkPVwiYXctc2V0dGluZ3MtY29udGVudFwiIHN0eWxlPVwiXG4gICAgICAgICAgICAgICAgcGFkZGluZzogMThweCAyMHB4O1xuICAgICAgICAgICAgICAgIG92ZXJmbG93LXk6IGF1dG87XG4gICAgICAgICAgICAgICAgZmxleDogMTtcbiAgICAgICAgICAgICAgICBvdmVyc2Nyb2xsLWJlaGF2aW9yOiBjb250YWluO1xuICAgICAgICAgICAgXCI+XG4gICAgICAgICAgICAgICAgPCEtLSBUQUIgMTogS0VSSkEgJiBFTkVSR0kgLS0+XG4gICAgICAgICAgICAgICAgPGRpdiBpZD1cInRhYi13b3JrXCIgY2xhc3M9XCJhdy10YWItcGFuZSBhY3RpdmVcIj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmRcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47IGFsaWduLWl0ZW1zOiBjZW50ZXI7IG1hcmdpbi1ib3R0b206IDhweDtcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC10aXRsZVwiPuKaoSBCYXRhcyBFbmVyZ2kgU2ViZWx1bSBLZXJqYTwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBnYXA6IDRweDtcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJudW1iZXJcIiBpZD1cInNldHRpbmctZW5lcmd5LXRocmVzaG9sZC1udW1cIiBtaW49XCIxMFwiIG1heD1cIjEwMFwiIHN0ZXA9XCI1XCIgdmFsdWU9XCIke0NPTkZJRy5lbmVyZ3lUaHJlc2hvbGR9XCIgY2xhc3M9XCJhdy1udW0tYmFkZ2VcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJjb2xvcjogIzAwZmY4ODsgZm9udC1zaXplOiAxM3B4OyBmb250LXdlaWdodDogNzAwO1wiPuKaoTwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmQtZGVzY1wiIHN0eWxlPVwibWFyZ2luLWJvdHRvbTogMTJweDtcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBCb3QgaGFueWEgYWthbiBtZW5nZWtzZWt1c2kgc2hpZnQga2VyamEgc2FhdCBlbmVyZ2kgYWt1biBtZW5jYXBhaSBhbmdrYSBpbmkuXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBnYXA6IDEwcHg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IG1hcmdpbi1ib3R0b206IDEycHg7XCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJyYW5nZVwiIGlkPVwic2V0dGluZy1lbmVyZ3ktdGhyZXNob2xkXCIgbWluPVwiMTBcIiBtYXg9XCIxMDBcIiBzdGVwPVwiNVwiIHZhbHVlPVwiJHtDT05GSUcuZW5lcmd5VGhyZXNob2xkfVwiIGNsYXNzPVwiYXctcmFuZ2Utc2xpZGVyXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwhLS0gUXVpY2sgUHJlc2V0cyAtLT5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBnYXA6IDZweDsgZmxleC13cmFwOiB3cmFwO1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiZm9udC1zaXplOiAxMXB4OyBjb2xvcjogIzY0NzQ4YjsgbWFyZ2luLXJpZ2h0OiA0cHg7XCI+UGlsaWhhbiBDZXBhdDo8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3M9XCJhdy1wcmVzZXQtYnRuXCIgZGF0YS12YWw9XCIxMFwiPjEw4pqhIENlcGF0PC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3M9XCJhdy1wcmVzZXQtYnRuXCIgZGF0YS12YWw9XCIyNVwiPjI14pqhIFNlZGFuZzwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxidXR0b24gdHlwZT1cImJ1dHRvblwiIGNsYXNzPVwiYXctcHJlc2V0LWJ0blwiIGRhdGEtdmFsPVwiNTBcIj41MOKaoSBIZW1hdDwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxidXR0b24gdHlwZT1cImJ1dHRvblwiIGNsYXNzPVwiYXctcHJlc2V0LWJ0blwiIGRhdGEtdmFsPVwiODBcIj44MOKaoSBTYW50YWk8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIHR5cGU9XCJidXR0b25cIiBjbGFzcz1cImF3LXByZXNldC1idG5cIiBkYXRhLXZhbD1cIjEwMFwiPjEwMOKaoSBQZW51aDwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgICAgICAgICAgIDwhLS0gRm9ybXVsYSBTbGVlcCBJbmZvIENhcmQgLS0+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJiYWNrZ3JvdW5kOiByZ2JhKDAsIDI1NSwgMTM2LCAwLjA0KTsgYm9yZGVyOiAxcHggc29saWQgcmdiYSgwLCAyNTUsIDEzNiwgMC4xNSk7IGJvcmRlci1yYWRpdXM6IDEwcHg7IHBhZGRpbmc6IDE0cHg7IG1hcmdpbi10b3A6IDE0cHg7XCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTogZmxleDsganVzdGlmeS1jb250ZW50OiBzcGFjZS1iZXR3ZWVuOyBhbGlnbi1pdGVtczogY2VudGVyOyBtYXJnaW4tYm90dG9tOiA4cHg7XCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJjb2xvcjogIzAwZmY4ODsgZm9udC1zaXplOiAxMnB4OyBmb250LXdlaWdodDogNjAwO1wiPuKaoSBSdW11cyBUaW1lciBQZW11bGloYW48L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJjb2xvcjogIzk0YTNiODsgZm9udC1zaXplOiAxMXB4OyBmb250LWZhbWlseTogbW9ub3NwYWNlO1wiPihUaHJlc2hvbGQgLSBTaXNhKSDDlyA2MHMgKyBKaXR0ZXI8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJmb250LXNpemU6IDExcHg7IGNvbG9yOiAjOTRhM2I4OyBsaW5lLWhlaWdodDogMS41O1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIOKAoiA8Yj5CdWZmIFdpbGF5YWg6PC9iPiBKaWthIHRpbmdnYWwgZGkgd2lsYXlhaCBiZXJmYXNpbGl0YXMgKHNlcGVydGkgSmF3YSBCYXJhdCksIHBlbXVsaWhhbiBlbmVyZ2kgb3RvbWF0aXMgZGlwZXJjZXBhdCBoaW5nZ2EgKzUwJSAoNDAgZGV0aWsgcGVyIGVuZXJnaSkuPGJyPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIOKAoiA8Yj5PcHRpbWlzdGljIERlY3JlbWVudDo8L2I+IEVuZXJnaSBsYW5nc3VuZyB0ZXJwb3Rvbmcgc2VrZXRpa2Egc2hpZnQgZGlraXJpbWthbiwgbWVuY2VnYWggdGFicmFrYW4gcGVybWludGFhbiBnYW5kYSAoMCByYWNlIGNvbmRpdGlvbnMpLlxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgICAgICAgPCEtLSBUQUIgMjogU1RFQUxUSCAmIEpBRFdBTCAtLT5cbiAgICAgICAgICAgICAgICA8ZGl2IGlkPVwidGFiLXN0ZWFsdGhcIiBjbGFzcz1cImF3LXRhYi1wYW5lXCI+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC1yb3dcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC1pbmZvXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLXRpdGxlXCI+8J+OsiBIdW1hbml6ZXIgVGhyZXNob2xkIEppdHRlcjwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC1kZXNjXCI+TWVuZ2FjYWsgc2VkaWtpdCBhbWJhbmcgYmF0YXMgZW5lcmdpICjCsTLimqEpIGRpIHNldGlhcCBzaWtsdXMgYWdhciBpbnRlcnZhbCBrZXJqYSB0aWRhayB0ZXJiYWNhIGtha3UgZGFuIHRlcmRldGVrc2kgYm90IG9sZWggc2VydmVyLjwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbCBjbGFzcz1cImF3LXN3aXRjaFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgaWQ9XCJzZXR0aW5nLXN0ZWFsdGgtaml0dGVyXCIgJHtDT05GSUcuc3RlYWx0aEppdHRlckVuYWJsZWQgPyAnY2hlY2tlZCcgOiAnJ30+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwiYXctc2xpZGVyXCI+PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvbGFiZWw+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmRcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLXJvd1wiIHN0eWxlPVwibWFyZ2luLWJvdHRvbTogMTBweDtcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC1pbmZvXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLXRpdGxlXCI+8J+MmSBKYW0gSXN0aXJhaGF0IC8gVGlkdXIgTWFsYW08L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmQtZGVzY1wiPkJvdCBvdG9tYXRpcyBiZXJoZW50aSBrZXJqYSBwYWRhIHJlbnRhbmcgamFtIGlzdGlyYWhhdCBtYWxhbSBsYXlha255YSBwb2xhIGhpZHVwIG1hbnVzaWEgbm9ybWFsLjwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbCBjbGFzcz1cImF3LXN3aXRjaFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgaWQ9XCJzZXR0aW5nLXNsZWVwLXNjaGVkdWxlXCIgJHtDT05GSUcuc2xlZXBTY2hlZHVsZUVuYWJsZWQgPyAnY2hlY2tlZCcgOiAnJ30+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwiYXctc2xpZGVyXCI+PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvbGFiZWw+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBnYXA6IDhweDsgYWxpZ24taXRlbXM6IGNlbnRlcjsgYmFja2dyb3VuZDogcmdiYSgwLDAsMCwwLjI1KTsgcGFkZGluZzogOHB4IDEycHg7IGJvcmRlci1yYWRpdXM6IDhweDsgYm9yZGVyOiAxcHggc29saWQgcmdiYSgyNTUsMjU1LDI1NSwwLjA0KTtcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBzdHlsZT1cImZvbnQtc2l6ZTogMTJweDsgY29sb3I6ICM5NGEzYjg7XCI+SmFtIFRpZHVyOjwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c2VsZWN0IGlkPVwic2V0dGluZy1zbGVlcC1zdGFydFwiIGNsYXNzPVwiYXctc2VsZWN0LWJveFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAke0FycmF5LmZyb20oe2xlbmd0aDogMjR9LCAoXywgaSkgPT4gYDxvcHRpb24gdmFsdWU9XCIke2l9XCIgJHsoQ09ORklHLnNsZWVwU3RhcnRIb3VyID8/IDEpID09PSBpID8gJ3NlbGVjdGVkJyA6ICcnfT4ke1N0cmluZyhpKS5wYWRTdGFydCgyLCAnMCcpfTowMDwvb3B0aW9uPmApLmpvaW4oJycpfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvc2VsZWN0PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiZm9udC1zaXplOiAxMnB4OyBjb2xvcjogIzY0NzQ4YjtcIj5zL2Q8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPHNlbGVjdCBpZD1cInNldHRpbmctc2xlZXAtZW5kXCIgY2xhc3M9XCJhdy1zZWxlY3QtYm94XCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICR7QXJyYXkuZnJvbSh7bGVuZ3RoOiAyNH0sIChfLCBpKSA9PiBgPG9wdGlvbiB2YWx1ZT1cIiR7aX1cIiAkeyhDT05GSUcuc2xlZXBFbmRIb3VyID8/IDYpID09PSBpID8gJ3NlbGVjdGVkJyA6ICcnfT4ke1N0cmluZyhpKS5wYWRTdGFydCgyLCAnMCcpfTowMDwvb3B0aW9uPmApLmpvaW4oJycpfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvc2VsZWN0PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiZm9udC1zaXplOiAxMXB4OyBjb2xvcjogIzY0NzQ4YjsgbWFyZ2luLWxlZnQ6IGF1dG87XCI+V0lCPC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC1yb3dcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC1pbmZvXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLXRpdGxlXCI+8J+UhyBNZXJlZGFtIExvZyBFbmVyZ2kgUmVuZGFoIChRdWlldCBNb2RlKTwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC1kZXNjXCI+TWVtYmF0YXNpIGxvZyBcIkVuZXJnaSB0aWRhayBjdWt1cFwiIG1ha3NpbWFsIDF4IHBlciAyIG1lbml0IGFnYXIgQWN0aXZpdHkgTG9nIHRldGFwIGJlcnNpaCBkYW4gbXVkYWggZGliYWNhLjwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbCBjbGFzcz1cImF3LXN3aXRjaFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgaWQ9XCJzZXR0aW5nLXF1aWV0LW1vZGVcIiAke0NPTkZJRy5xdWlldE1vZGVFbmFibGVkID8gJ2NoZWNrZWQnIDogJyd9PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz1cImF3LXNsaWRlclwiPjwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2xhYmVsPlxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgICAgICAgPCEtLSBUQUIgMzogTk9USUZJS0FTSSAmIFNVQVJBIC0tPlxuICAgICAgICAgICAgICAgIDxkaXYgaWQ9XCJ0YWItbm90aWZcIiBjbGFzcz1cImF3LXRhYi1wYW5lXCI+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC1yb3dcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC1pbmZvXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLXRpdGxlXCI+8J+TsSBOb3RpZmlrYXNpIFBvcC11cCBCcm93c2VyPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLWRlc2NcIj5NZW5hbXBpbGthbiBiYW5uZXIgbm90aWZpa2FzaSBkZXNrdG9wIGJyb3dzZXIga2V0aWthIHNoaWZ0IGJlcmhhc2lsIGRpa2VyamFrYW4uPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzPVwiYXctc3dpdGNoXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBpZD1cInNldHRpbmctbm90aWZpY2F0aW9uc1wiICR7Q09ORklHLnNlbmROb3RpZmljYXRpb24gPyAnY2hlY2tlZCcgOiAnJ30+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwiYXctc2xpZGVyXCI+PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvbGFiZWw+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmRcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLXJvd1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLWluZm9cIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmQtdGl0bGVcIj7imqEgQWxlcnQgRGVza3RvcCBTYWF0IEVuZXJnaSBQZW51aDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC1kZXNjXCI+S2lyaW0gbm90aWZpa2FzaSBkZXNrdG9wIHNlZ2VyYSBzZXRlbGFoIGVuZXJnaSBtZW5jYXBhaSBiYXRhcyBtYWtzaW1hbCAoMTAw4pqhKSBhZ2FyIHRpZGFrIG11YmF6aXIuPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzPVwiYXctc3dpdGNoXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBpZD1cInNldHRpbmctZW5lcmd5LWZ1bGwtYWxlcnRcIiAke0NPTkZJRy5lbmVyZ3lGdWxsQWxlcnRFbmFibGVkID8gJ2NoZWNrZWQnIDogJyd9PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz1cImF3LXNsaWRlclwiPjwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2xhYmVsPlxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC1yb3dcIiBzdHlsZT1cIm1hcmdpbi1ib3R0b206IDhweDtcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC1pbmZvXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLXRpdGxlXCI+8J+UlCBTdWFyYSBOb3RpZmlrYXNpIEtlcmphPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLWRlc2NcIj5QdXRhciBlZmVrIHN1YXJhIGhhbHVzIHNhYXQgc2VsZXNhaSBiZWtlcmphIGF0YXUgdGVyamFkaSBrZXNhbGFoYW4uPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzPVwiYXctc3dpdGNoXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBpZD1cInNldHRpbmctc291bmQtbm90aWZpY2F0aW9uLWVuYWJsZWRcIiAke0NPTkZJRy5zb3VuZE5vdGlmaWNhdGlvbkVuYWJsZWQgPyAnY2hlY2tlZCcgOiAnJ30+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwiYXctc2xpZGVyXCI+PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvbGFiZWw+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBnYXA6IDEwcHg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IG1hcmdpbi10b3A6IDZweDtcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBzdHlsZT1cImZvbnQtc2l6ZTogMTFweDsgY29sb3I6ICM5NGEzYjg7IHdpZHRoOiA1MHB4O1wiPlZvbHVtZTo8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJyYW5nZVwiIGlkPVwic2V0dGluZy1zb3VuZC1ub3RpZmljYXRpb24tdm9sdW1lXCIgbWluPVwiMFwiIG1heD1cIjEwMFwiIHZhbHVlPVwiJHtNYXRoLnJvdW5kKENPTkZJRy5zb3VuZE5vdGlmaWNhdGlvblZvbHVtZSAqIDEwMCl9XCIgY2xhc3M9XCJhdy1yYW5nZS1zbGlkZXJcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cIm51bWJlclwiIGlkPVwic2V0dGluZy1zb3VuZC1ub3RpZmljYXRpb24tdm9sdW1lLW51bVwiIG1pbj1cIjBcIiBtYXg9XCIxMDBcIiB2YWx1ZT1cIiR7TWF0aC5yb3VuZChDT05GSUcuc291bmROb3RpZmljYXRpb25Wb2x1bWUgKiAxMDApfVwiIGNsYXNzPVwiYXctbnVtLWJhZGdlXCIgc3R5bGU9XCJjb2xvcjogIzAwZDRmZjtcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBzdHlsZT1cImNvbG9yOiAjNjQ3NDhiOyBmb250LXNpemU6IDEycHg7XCI+JTwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmQtcm93XCIgc3R5bGU9XCJtYXJnaW4tYm90dG9tOiA4cHg7XCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmQtaW5mb1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC10aXRsZVwiPvCfmqggQnVueWkgQWxhcm0gRW5lcmdpIFBlbnVoPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLWRlc2NcIj5QdXRhciBhbGFybSBraHVzdXMgc2FhdCBlbmVyZ2kgYWt1biBzdWRhaCBtZW55ZW50dWggMTAw4pqhLjwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbCBjbGFzcz1cImF3LXN3aXRjaFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgaWQ9XCJzZXR0aW5nLWVuZXJneS1mdWxsLXNvdW5kLWVuYWJsZWRcIiAke0NPTkZJRy5lbmVyZ3lGdWxsQWxlcnRTb3VuZEVuYWJsZWQgPyAnY2hlY2tlZCcgOiAnJ30+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwiYXctc2xpZGVyXCI+PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvbGFiZWw+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBnYXA6IDEwcHg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IG1hcmdpbi10b3A6IDZweDtcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBzdHlsZT1cImZvbnQtc2l6ZTogMTFweDsgY29sb3I6ICM5NGEzYjg7IHdpZHRoOiA1MHB4O1wiPlZvbHVtZTo8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJyYW5nZVwiIGlkPVwic2V0dGluZy1lbmVyZ3ktZnVsbC12b2x1bWVcIiBtaW49XCIwXCIgbWF4PVwiMTAwXCIgdmFsdWU9XCIke01hdGgucm91bmQoQ09ORklHLmVuZXJneUZ1bGxBbGVydFZvbHVtZSAqIDEwMCl9XCIgY2xhc3M9XCJhdy1yYW5nZS1zbGlkZXJcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cIm51bWJlclwiIGlkPVwic2V0dGluZy1lbmVyZ3ktZnVsbC12b2x1bWUtbnVtXCIgbWluPVwiMFwiIG1heD1cIjEwMFwiIHZhbHVlPVwiJHtNYXRoLnJvdW5kKENPTkZJRy5lbmVyZ3lGdWxsQWxlcnRWb2x1bWUgKiAxMDApfVwiIGNsYXNzPVwiYXctbnVtLWJhZGdlXCIgc3R5bGU9XCJjb2xvcjogIzAwZDRmZjtcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBzdHlsZT1cImNvbG9yOiAjNjQ3NDhiOyBmb250LXNpemU6IDEycHg7XCI+JTwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGlkPVwiYXctdGVzdC1ub3RpZmljYXRpb24tc291bmRcIiBzdHlsZT1cIlxuICAgICAgICAgICAgICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjA1KTsgY29sb3I6ICNmZmY7IGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4xMik7XG4gICAgICAgICAgICAgICAgICAgICAgICBwYWRkaW5nOiA5cHggMTZweDsgYm9yZGVyLXJhZGl1czogOHB4OyBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb250LXNpemU6IDEycHg7IHdpZHRoOiAxMDAlOyBmb250LXdlaWdodDogNjAwOyBtYXJnaW4tdG9wOiA0cHg7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cmFuc2l0aW9uOiBhbGwgMC4xNXM7XG4gICAgICAgICAgICAgICAgICAgIFwiPvCflIogVWppIENvYmEgQnVueWkgU3VhcmEgKFRlc3QgU291bmQpPC9idXR0b24+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICAgICAgICA8IS0tIFRBQiA0OiBUQU1QSUxBTiAmIFNIT1JUQ1VUIC0tPlxuICAgICAgICAgICAgICAgIDxkaXYgaWQ9XCJ0YWItdWlcIiBjbGFzcz1cImF3LXRhYi1wYW5lXCI+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC1yb3dcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC1pbmZvXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLXRpdGxlXCI+8J+PoCBIYW55YSBUYW1waWxrYW4gZGkgRGFzaGJvYXJkICgvZGFzaGJvYXJkKTwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC1kZXNjXCI+T3RvbWF0aXMgc2VtYnVueWlrYW4gcGFuZWwgamlrYSBtZW1idWthIGhhbGFtYW4gbGFpbiAobWlzYWw6IC9tYXAsIC9tYXJrZXQpLiBCb3QgdGV0YXAgYWt0aWYgZGkgYmFja2dyb3VuZC48L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgY2xhc3M9XCJhdy1zd2l0Y2hcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJjaGVja2JveFwiIGlkPVwic2V0dGluZy1wYW5lbC1kYXNoYm9hcmQtb25seVwiICR7Q09ORklHLnBhbmVsRGFzaGJvYXJkT25seSA/ICdjaGVja2VkJyA6ICcnfT5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJhdy1zbGlkZXJcIj48L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9sYWJlbD5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmQtcm93XCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmQtaW5mb1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC10aXRsZVwiPvCfkZEgSGFueWEgVGFtcGlsa2FuIGRpIFRhYiBVdGFtYSAoU3RhbmRieSBIaWRkZW4pPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLWRlc2NcIj5KaWthIG1lbWJ1a2EgYmFueWFrIHRhYiBnYW1lIGJlcnNhbWFhbiwgcGFuZWwgaGFueWEgbWVsYXlhbmcgZGkgdGFiIHV0YW1hIHlhbmcgbWVtaW1waW4ga2VyamEuPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzPVwiYXctc3dpdGNoXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBpZD1cInNldHRpbmctcGFuZWwtbGVhZGVyLW9ubHlcIiAke0NPTkZJRy5wYW5lbExlYWRlck9ubHkgPyAnY2hlY2tlZCcgOiAnJ30+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwiYXctc2xpZGVyXCI+PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvbGFiZWw+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmRcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLXJvd1wiIHN0eWxlPVwibWFyZ2luLWJvdHRvbTogOHB4O1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLWluZm9cIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmQtdGl0bGVcIj7wn5OQIFNlc3VhaWthbiBkZW5nYW4gVWt1cmFuIEplbmRlbGEgQnJvd3NlcjwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC1kZXNjXCI+TWVuY2VnYWggcGFuZWwga2VsdWFyIGxheWFyIHNhYXQgdWt1cmFuIGJyb3dzZXIgZGlwZXJrZWNpbC48L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgY2xhc3M9XCJhdy1zd2l0Y2hcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJjaGVja2JveFwiIGlkPVwic2V0dGluZy1mb2xsb3ctdmlld3BvcnRcIiAke0NPTkZJRy5wYW5lbEZvbGxvd1ZpZXdwb3J0ID8gJ2NoZWNrZWQnIDogJyd9PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz1cImF3LXNsaWRlclwiPjwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2xhYmVsPlxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC1yb3dcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC1pbmZvXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLXRpdGxlXCI+4oap77iPIEtlbWJhbGkga2UgUG9zaXNpIEF3YWwgU2FhdCBCcm93c2VyIERpYmVzYXJrYW48L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmQtZGVzY1wiPk1lbmdlbWJhbGlrYW4gcGFuZWwga2Uga29vcmRpbmF0IGFzYWwgc2FhdCBydWFuZyBsYXlhciBrZW1iYWxpIGxlZ2EuPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzPVwiYXctc3dpdGNoXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBpZD1cInNldHRpbmctcmV0dXJuLW9yaWdpbmFsXCIgJHtDT05GSUcucGFuZWxSZXR1cm5Ub09yaWdpbmFsID8gJ2NoZWNrZWQnIDogJyd9PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz1cImF3LXNsaWRlclwiPjwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2xhYmVsPlxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJhdy1yZXNldC1wb3NpdGlvblwiIHN0eWxlPVwiXG4gICAgICAgICAgICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMDUpOyBjb2xvcjogI2NiZDVlMTsgYm9yZGVyOiAxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcGFkZGluZzogOHB4IDE2cHg7IGJvcmRlci1yYWRpdXM6IDhweDsgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9udC1zaXplOiAxMnB4OyB3aWR0aDogMTAwJTsgbWFyZ2luLWJvdHRvbTogMTZweDsgZm9udC13ZWlnaHQ6IDUwMDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyYW5zaXRpb246IGFsbCAwLjE1cztcbiAgICAgICAgICAgICAgICAgICAgXCI+8J+UhCBBdHVyIFVsYW5nIEtvb3JkaW5hdCBQb3Npc2kgUGFuZWwga2UgUG9qb2sgS2FuYW48L2J1dHRvbj5cblxuICAgICAgICAgICAgICAgICAgICA8IS0tIEtleWJvYXJkIFNob3J0Y3V0cyBTdWItU2VjdGlvbiAtLT5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cIm1hcmdpbi10b3A6IDEwcHg7XCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZm9udC1zaXplOiAxM3B4OyBmb250LXdlaWdodDogNjAwOyBjb2xvcjogI2ZmZjsgbWFyZ2luLWJvdHRvbTogNHB4O1wiPuKMqO+4jyBQaW50YXNhbiBLZXlib2FyZCAoU2hvcnRjdXRzKTwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cImZvbnQtc2l6ZTogMTFweDsgY29sb3I6ICM4YjliYjQ7IG1hcmdpbi1ib3R0b206IDEwcHg7XCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgS2xpayA8Yj5SZWNvcmQ8L2I+IGxhbHUgdGVrYW4gMeKAkzMga29tYmluYXNpIHRvbWJvbC4gVGVrYW4gPGtiZCBzdHlsZT1cImJhY2tncm91bmQ6IzIyMjtwYWRkaW5nOjFweCA0cHg7Ym9yZGVyLXJhZGl1czozcHg7XCI+RW50ZXI8L2tiZD4gdW50dWsgc2ltcGFuLCA8a2JkIHN0eWxlPVwiYmFja2dyb3VuZDojMjIyO3BhZGRpbmc6MXB4IDRweDtib3JkZXItcmFkaXVzOjNweDtcIj5Fc2M8L2tiZD4gdW50dWsgYmF0YWxrYW4uXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICR7c2hvcnRjdXRJbnB1dHNIVE1MfVxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBpZD1cInNob3J0Y3V0LWVycm9yXCIgc3R5bGU9XCJjb2xvcjogI2ZmNDQ0NDsgZm9udC1zaXplOiAxMXB4OyBtYXJnaW4tdG9wOiA4cHg7IGRpc3BsYXk6IG5vbmU7XCI+PC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgICAgICAgPCEtLSBUQUIgNTogQUtVTiAmIFNJU1RFTSAtLT5cbiAgICAgICAgICAgICAgICA8ZGl2IGlkPVwidGFiLWFjY291bnRcIiBjbGFzcz1cImF3LXRhYi1wYW5lXCI+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC1yb3dcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC1pbmZvXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLXRpdGxlXCI+8J+NgyBNb2RlIEVjbyAoSGVtYXQgUkFNICYgQ1BVKTwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC1kZXNjXCI+TWVuZ2hlbnRpa2FuIHJlbmRlciB2aXN1YWwgRE9NIHNhYXQgdGFiIGRpdGluZ2dhbCBkaSBsYXRhciBiZWxha2FuZyBkYW4gbWVuLWNhY2hlIHBlbWJhY2FhbiB3aWxheWFoLiBUaW1lciBkYW4gZ2lsaXJhbiBrZXJqYSB0ZXRhcCBiZXJqYWxhbiAxMDAlIHByZXNpc2kgdGFucGEgdGVydHVuZGEuPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzPVwiYXctc3dpdGNoXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBpZD1cInNldHRpbmctZWNvLW1vZGVcIiAke0NPTkZJRy5lY29Nb2RlRW5hYmxlZCAhPT0gZmFsc2UgPyAnY2hlY2tlZCcgOiAnJ30+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwiYXctc2xpZGVyXCI+PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvbGFiZWw+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmRcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLXJvd1wiIHN0eWxlPVwibWFyZ2luLWJvdHRvbTogMTBweDtcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC1pbmZvXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLXRpdGxlXCI+8J+UkCBBdXRvIFJlLUxvZ2luIChNYXN1ayBPdG9tYXRpcyk8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmQtZGVzY1wiPkppa2Egc2VzaS90b2tlbiBnYW1lIGhhYmlzIChIVFRQIDQwMSksIGJvdCBha2FuIG90b21hdGlzIGxvZ2luIGtlbWJhbGkga2UgYWt1biBBbmRhIGRhbiBtZWxhbmp1dGthbiBrZXJqYS4gRGF0YSBkaXNpbXBhbiBhbWFuIDEwMCUgbG9rYWwgZGkgYnJvd3Nlci48L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgY2xhc3M9XCJhdy1zd2l0Y2hcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJjaGVja2JveFwiIGlkPVwic2V0dGluZy1hdXRvLXJlbG9naW5cIiAke0NPTkZJRy5hdXRvUmVsb2dpbkVuYWJsZWQgPyAnY2hlY2tlZCcgOiAnJ30+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwiYXctc2xpZGVyXCI+PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvbGFiZWw+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBpZD1cImF3LWF1dG9sb2dpbi1maWVsZHNcIiBzdHlsZT1cImJhY2tncm91bmQ6IHJnYmEoMCwwLDAsMC4zKTsgcGFkZGluZzogMTJweDsgYm9yZGVyLXJhZGl1czogOHB4OyBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDI1NSwyNTUsMjU1LDAuMDUpOyBtYXJnaW4tdG9wOiA4cHg7XCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cIm1hcmdpbi1ib3R0b206IDEwcHg7XCI+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbCBzdHlsZT1cImRpc3BsYXk6IGJsb2NrOyBmb250LXNpemU6IDExcHg7IGNvbG9yOiAjOTRhM2I4OyBtYXJnaW4tYm90dG9tOiA0cHg7IGZvbnQtd2VpZ2h0OiA1MDA7XCI+RW1haWwgQWt1biBHYW1lPC9sYWJlbD5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJlbWFpbFwiIGlkPVwic2V0dGluZy1sb2dpbi1lbWFpbFwiIGF1dG9jb21wbGV0ZT1cIm9mZlwiIGRhdGEtbHBpZ25vcmU9XCJ0cnVlXCIgZGF0YS1mb3JtLXR5cGU9XCJvdGhlclwiIHBsYWNlaG9sZGVyPVwibmFtYUBlbWFpbC5jb21cIiB2YWx1ZT1cIiR7c2F2ZWRDcmVkcz8uZW1haWwgfHwgJyd9XCIgc3R5bGU9XCJ3aWR0aDogMTAwJTsgYm94LXNpemluZzogYm9yZGVyLWJveDsgYmFja2dyb3VuZDogIzEzMTcyNDsgY29sb3I6ICNmZmY7IGJvcmRlcjogMXB4IHNvbGlkICMyZDM2NGY7IGJvcmRlci1yYWRpdXM6IDZweDsgcGFkZGluZzogOHB4IDEwcHg7IGZvbnQtc2l6ZTogMTJweDtcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwibWFyZ2luLWJvdHRvbTogMTJweDtcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6IGZsZXg7IGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjsgbWFyZ2luLWJvdHRvbTogNHB4O1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsIHN0eWxlPVwiZm9udC1zaXplOiAxMXB4OyBjb2xvcjogIzk0YTNiODsgZm9udC13ZWlnaHQ6IDUwMDtcIj5LYXRhIFNhbmRpPC9sYWJlbD5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGlkPVwiYXctdG9nZ2xlLXB3ZC12aXNcIiBzdHlsZT1cImZvbnQtc2l6ZTogMTFweDsgY29sb3I6ICMwMGQ0ZmY7IGN1cnNvcjogcG9pbnRlcjsgdXNlci1zZWxlY3Q6IG5vbmU7XCI+8J+Rge+4jyBMaWhhdDwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwicGFzc3dvcmRcIiBpZD1cInNldHRpbmctbG9naW4tcHdkXCIgYXV0b2NvbXBsZXRlPVwib2ZmXCIgZGF0YS1scGlnbm9yZT1cInRydWVcIiBkYXRhLWZvcm0tdHlwZT1cIm90aGVyXCIgcGxhY2Vob2xkZXI9XCJLYXRhIHNhbmRpIGFrdW5tdVwiIHZhbHVlPVwiJHtzYXZlZENyZWRzPy5wYXNzd29yZCB8fCAnJ31cIiBzdHlsZT1cIndpZHRoOiAxMDAlOyBib3gtc2l6aW5nOiBib3JkZXItYm94OyBiYWNrZ3JvdW5kOiAjMTMxNzI0OyBjb2xvcjogI2ZmZjsgYm9yZGVyOiAxcHggc29saWQgIzJkMzY0ZjsgYm9yZGVyLXJhZGl1czogNnB4OyBwYWRkaW5nOiA4cHggMTBweDsgZm9udC1zaXplOiAxMnB4O1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBnYXA6IDhweDtcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBpZD1cImF3LXNhdmUtbG9naW4tY3JlZHNcIiBzdHlsZT1cImZsZXg6IDE7IGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsICMwMDg4ZmYsICMwMDU1Y2MpOyBjb2xvcjogI2ZmZjsgYm9yZGVyOiBub25lOyBwYWRkaW5nOiA4cHg7IGJvcmRlci1yYWRpdXM6IDZweDsgY3Vyc29yOiBwb2ludGVyOyBmb250LXNpemU6IDExcHg7IGZvbnQtd2VpZ2h0OiA2MDA7XCI+8J+SviBTaW1wYW4gS3JlZGVuc2lhbDwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGlkPVwiYXctY2xlYXItbG9naW4tY3JlZHNcIiBzdHlsZT1cImJhY2tncm91bmQ6IHJnYmEoMjU1LDI1NSwyNTUsMC4wNSk7IGNvbG9yOiAjZmY1NTU1OyBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDI1NSw4NSw4NSwwLjMpOyBwYWRkaW5nOiA4cHggMTJweDsgYm9yZGVyLXJhZGl1czogNnB4OyBjdXJzb3I6IHBvaW50ZXI7IGZvbnQtc2l6ZTogMTFweDsgZm9udC13ZWlnaHQ6IDUwMDtcIj7wn5eR77iPIEhhcHVzPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBpZD1cImF3LWxvZ2luLWNyZWRzLW1zZ1wiIHN0eWxlPVwiZm9udC1zaXplOiAxMXB4OyBtYXJnaW4tdG9wOiA4cHg7IGRpc3BsYXk6IG5vbmU7XCI+PC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWNhcmRcIiBzdHlsZT1cIm1hcmdpbi10b3A6IDE0cHg7IGJvcmRlci1jb2xvcjogcmdiYSgyNTUsIDg1LCA4NSwgMC4yKTtcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1jYXJkLXRpdGxlXCIgc3R5bGU9XCJjb2xvcjogI2ZmNmI2YjsgbWFyZ2luLWJvdHRvbTogNnB4O1wiPuKaoO+4jyBab25hIEJhaGF5YSAoUmVzZXQgVG90YWwpPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctY2FyZC1kZXNjXCIgc3R5bGU9XCJtYXJnaW4tYm90dG9tOiAxMnB4O1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIE1lbmdlbWJhbGlrYW4gc2VsdXJ1aCBwcmVmZXJlbnNpLCBiYXRhcyBlbmVyZ2ksIHBpbnRhc2FuIGtleWJvYXJkLCBkYW4gcG9zaXNpIHBhbmVsIGtlIHBlbmdhdHVyYW4gYXdhbCBwYWJyaWsuXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJhdy1yZXN0b3JlLWRlZmF1bHRzXCIgc3R5bGU9XCJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiBsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCByZ2JhKDI1NSwgMTA3LCAxMDcsIDAuMiksIHJnYmEoMjA0LCAwLCAwLCAwLjMpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb2xvcjogI2ZmODg4ODsgYm9yZGVyOiAxcHggc29saWQgcmdiYSgyNTUsIDEwNywgMTA3LCAwLjQpOyBwYWRkaW5nOiA5cHg7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYm9yZGVyLXJhZGl1czogNnB4OyBjdXJzb3I6IHBvaW50ZXI7IGZvbnQtd2VpZ2h0OiA2MDA7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9udC1zaXplOiAxMnB4OyB3aWR0aDogMTAwJTsgdHJhbnNpdGlvbjogYWxsIDAuMTVzO1xuICAgICAgICAgICAgICAgICAgICAgICAgXCI+8J+UhCBQdWxpaGthbiBTZW11YSBQZW5nYXR1cmFuIGtlIERlZmF1bHQ8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgPCEtLSBTdGlja3kgTW9kYWwgRm9vdGVyIC0tPlxuICAgICAgICAgICAgPGRpdiBpZD1cImF3LXNldHRpbmdzLWZvb3RlclwiIHN0eWxlPVwiXG4gICAgICAgICAgICAgICAgcGFkZGluZzogMTJweCAyMHB4O1xuICAgICAgICAgICAgICAgIGJvcmRlci10b3A6IDFweCBzb2xpZCByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMDgpO1xuICAgICAgICAgICAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICAgICAgICAgICAgZ2FwOiAxMnB4O1xuICAgICAgICAgICAgICAgIGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjtcbiAgICAgICAgICAgICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsICMxMzE3MjQgMCUsICMwZDEwMWEgMTAwJSk7XG4gICAgICAgICAgICBcIj5cbiAgICAgICAgICAgICAgICA8ZGl2IGlkPVwiYXctc2V0dGluZ3Mtc3RhdHVzXCIgc3R5bGU9XCJmb250LXNpemU6IDEycHg7IGNvbG9yOiAjMDBmZjg4OyBmb250LXdlaWdodDogNjAwOyBkaXNwbGF5OiBub25lO1wiPjwvZGl2PlxuICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBnYXA6IDhweDsgbWFyZ2luLWxlZnQ6IGF1dG87XCI+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJhdy1jYW5jZWwtc2V0dGluZ3NcIiBzdHlsZT1cIlxuICAgICAgICAgICAgICAgICAgICAgICAgYmFja2dyb3VuZDogdHJhbnNwYXJlbnQ7IGNvbG9yOiAjOTRhM2I4OyBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMTUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcGFkZGluZzogOHB4IDE2cHg7IGJvcmRlci1yYWRpdXM6IDhweDsgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9udC1zaXplOiAxMnB4OyBmb250LXdlaWdodDogNjAwOyB0cmFuc2l0aW9uOiBhbGwgMC4xNXM7XG4gICAgICAgICAgICAgICAgICAgIFwiPkJhdGFsPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJhdy1zYXZlLXNldHRpbmdzXCIgc3R5bGU9XCJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsICMwMGZmODgsICMwMGNjNjYpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29sb3I6ICMwNTBhMTQ7IGJvcmRlcjogbm9uZTsgcGFkZGluZzogOXB4IDI0cHg7XG4gICAgICAgICAgICAgICAgICAgICAgICBib3JkZXItcmFkaXVzOiA4cHg7IGN1cnNvcjogcG9pbnRlcjsgZm9udC13ZWlnaHQ6IDcwMDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbnQtc2l6ZTogMTNweDsgYm94LXNoYWRvdzogMCA0cHggMTRweCByZ2JhKDAsMjU1LDEzNiwwLjMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJhbnNpdGlvbjogdHJhbnNmb3JtIDAuMTVzLCBib3gtc2hhZG93IDAuMTVzO1xuICAgICAgICAgICAgICAgICAgICBcIj7wn5K+IFNpbXBhbiBQZW5nYXR1cmFuPC9idXR0b24+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG4gICAgYDtcblxuICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQobW9kYWwpO1xuXG4gICAgLy8g4pSA4pSAIFRhYiBTd2l0Y2hpbmcgTG9naWMg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gICAgY29uc3QgdGFiTmF2ID0gbW9kYWwucXVlcnlTZWxlY3RvcignLmF3LXRhYi1uYXYnKTtcbiAgICBjb25zdCB0YWJCdG5zID0gbW9kYWwucXVlcnlTZWxlY3RvckFsbCgnLmF3LXRhYi1idG4nKTtcbiAgICBjb25zdCB0YWJQYW5lcyA9IG1vZGFsLnF1ZXJ5U2VsZWN0b3JBbGwoJy5hdy10YWItcGFuZScpO1xuICAgIHRhYkJ0bnMuZm9yRWFjaChidG4gPT4ge1xuICAgICAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCB0YXJnZXRJZCA9IGJ0bi5kYXRhc2V0LnRhYjtcbiAgICAgICAgICAgIHRhYkJ0bnMuZm9yRWFjaChiID0+IGIuY2xhc3NMaXN0LnJlbW92ZSgnYWN0aXZlJykpO1xuICAgICAgICAgICAgdGFiUGFuZXMuZm9yRWFjaChwID0+IHAuY2xhc3NMaXN0LnJlbW92ZSgnYWN0aXZlJykpO1xuICAgICAgICAgICAgYnRuLmNsYXNzTGlzdC5hZGQoJ2FjdGl2ZScpO1xuICAgICAgICAgICAgYnRuLnNjcm9sbEludG9WaWV3KHsgYmVoYXZpb3I6ICdzbW9vdGgnLCBibG9jazogJ25lYXJlc3QnLCBpbmxpbmU6ICdjZW50ZXInIH0pO1xuICAgICAgICAgICAgY29uc3QgdGFyZ2V0UGFuZSA9IG1vZGFsLnF1ZXJ5U2VsZWN0b3IoYCMke3RhcmdldElkfWApO1xuICAgICAgICAgICAgaWYgKHRhcmdldFBhbmUpIHRhcmdldFBhbmUuY2xhc3NMaXN0LmFkZCgnYWN0aXZlJyk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgLy8gRHVrdW5nYW4gc2Nyb2xsIGhvcml6b250YWwgbWVuZ2d1bmFrYW4gbW91c2Ugd2hlZWwgZGkgYmFyIHRhYlxuICAgIHRhYk5hdj8uYWRkRXZlbnRMaXN0ZW5lcignd2hlZWwnLCBlID0+IHtcbiAgICAgICAgaWYgKGUuZGVsdGFZICE9PSAwKSB7XG4gICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICB0YWJOYXYuc2Nyb2xsTGVmdCArPSBlLmRlbHRhWTtcbiAgICAgICAgfVxuICAgIH0sIHsgcGFzc2l2ZTogZmFsc2UgfSk7XG5cbiAgICAvLyDilIDilIAgVW5pdmVyc2FsIFNldHRpbmdzIENvbGxlY3RvciAmIFNhdmVyIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuICAgIGxldCBzdGF0dXNUaW1lciA9IG51bGw7XG4gICAgZnVuY3Rpb24gYXBwbHlBbmRTYXZlU2V0dGluZ3MoZXhwbGljaXQgPSBmYWxzZSkge1xuICAgICAgICAvLyAxLiBCYXRhcyBFbmVyZ2lcbiAgICAgICAgY29uc3Qgc2xpZGVyRWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZy1lbmVyZ3ktdGhyZXNob2xkJyk7XG4gICAgICAgIGNvbnN0IG51bUVsICAgID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldHRpbmctZW5lcmd5LXRocmVzaG9sZC1udW0nKTtcbiAgICAgICAgY29uc3Qgc1ZhbCA9IHBhcnNlSW50KHNsaWRlckVsPy52YWx1ZSA/PyAnJywgMTApO1xuICAgICAgICBjb25zdCBuVmFsID0gcGFyc2VJbnQobnVtRWw/LnZhbHVlID8/ICcnLCAxMCk7XG4gICAgICAgIGNvbnN0IGNob3NlblRocmVzaG9sZCA9ICFpc05hTihuVmFsKSAmJiBuVmFsID49IDEwICYmIG5WYWwgPD0gMTAwID8gblZhbCA6ICghaXNOYU4oc1ZhbCkgPyBzVmFsIDogQ09ORklHLmVuZXJneVRocmVzaG9sZCk7XG4gICAgICAgIGlmIChjaG9zZW5UaHJlc2hvbGQgPj0gMTAgJiYgY2hvc2VuVGhyZXNob2xkIDw9IDEwMCkge1xuICAgICAgICAgICAgQ09ORklHLmVuZXJneVRocmVzaG9sZCA9IGNob3NlblRocmVzaG9sZDtcbiAgICAgICAgICAgIGlmIChzbGlkZXJFbCAmJiBzbGlkZXJFbC52YWx1ZSAhPT0gU3RyaW5nKGNob3NlblRocmVzaG9sZCkpIHNsaWRlckVsLnZhbHVlID0gY2hvc2VuVGhyZXNob2xkO1xuICAgICAgICAgICAgaWYgKG51bUVsICYmIG51bUVsLnZhbHVlICE9PSBTdHJpbmcoY2hvc2VuVGhyZXNob2xkKSkgbnVtRWwudmFsdWUgPSBjaG9zZW5UaHJlc2hvbGQ7XG4gICAgICAgIH1cblxuICAgICAgICAvLyAyLiBRdWlldCBNb2RlXG4gICAgICAgIGNvbnN0IHF1aWV0RWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZy1xdWlldC1tb2RlJyk7XG4gICAgICAgIGlmIChxdWlldEVsKSBDT05GSUcucXVpZXRNb2RlRW5hYmxlZCA9IHF1aWV0RWwuY2hlY2tlZDtcblxuICAgICAgICAvLyAzLiBUYW1waWxhbiBQYW5lbFxuICAgICAgICBjb25zdCBkYXNoT25seUVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldHRpbmctcGFuZWwtZGFzaGJvYXJkLW9ubHknKTtcbiAgICAgICAgaWYgKGRhc2hPbmx5RWwpIENPTkZJRy5wYW5lbERhc2hib2FyZE9ubHkgPSBkYXNoT25seUVsLmNoZWNrZWQ7XG4gICAgICAgIGNvbnN0IGxlYWRlck9ubHlFbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5nLXBhbmVsLWxlYWRlci1vbmx5Jyk7XG4gICAgICAgIGlmIChsZWFkZXJPbmx5RWwpIENPTkZJRy5wYW5lbExlYWRlck9ubHkgPSBsZWFkZXJPbmx5RWwuY2hlY2tlZDtcbiAgICAgICAgY29uc3QgZm9sbG93RWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZy1mb2xsb3ctdmlld3BvcnQnKTtcbiAgICAgICAgaWYgKGZvbGxvd0VsKSBDT05GSUcucGFuZWxGb2xsb3dWaWV3cG9ydCA9IGZvbGxvd0VsLmNoZWNrZWQ7XG4gICAgICAgIGNvbnN0IHJldHVybkVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldHRpbmctcmV0dXJuLW9yaWdpbmFsJyk7XG4gICAgICAgIGlmIChyZXR1cm5FbCkgQ09ORklHLnBhbmVsUmV0dXJuVG9PcmlnaW5hbCA9IHJldHVybkVsLmNoZWNrZWQ7XG5cbiAgICAgICAgLy8gNC4gU3VhcmEgTm90aWZpa2FzaSAmIFZvbHVtZVxuICAgICAgICBjb25zdCBzb3VuZEVuYWJsZWRFbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5nLXNvdW5kLW5vdGlmaWNhdGlvbi1lbmFibGVkJyk7XG4gICAgICAgIGlmIChzb3VuZEVuYWJsZWRFbCkgQ09ORklHLnNvdW5kTm90aWZpY2F0aW9uRW5hYmxlZCA9IHNvdW5kRW5hYmxlZEVsLmNoZWNrZWQ7XG5cbiAgICAgICAgY29uc3Qgc291bmRWb2xFbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5nLXNvdW5kLW5vdGlmaWNhdGlvbi12b2x1bWUnKTtcbiAgICAgICAgaWYgKHNvdW5kVm9sRWwpIHtcbiAgICAgICAgICAgIGNvbnN0IHZvbCA9IE1hdGgubWF4KDAsIE1hdGgubWluKDEwMCwgcGFyc2VJbnQoc291bmRWb2xFbC52YWx1ZSB8fCAnMzAnLCAxMCkpKTtcbiAgICAgICAgICAgIENPTkZJRy5zb3VuZE5vdGlmaWNhdGlvblZvbHVtZSA9IHZvbCAvIDEwMDtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGZ1bGxTb3VuZEVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldHRpbmctZW5lcmd5LWZ1bGwtc291bmQtZW5hYmxlZCcpO1xuICAgICAgICBpZiAoZnVsbFNvdW5kRWwpIENPTkZJRy5lbmVyZ3lGdWxsQWxlcnRTb3VuZEVuYWJsZWQgPSBmdWxsU291bmRFbC5jaGVja2VkO1xuXG4gICAgICAgIGNvbnN0IGZ1bGxWb2xFbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5nLWVuZXJneS1mdWxsLXZvbHVtZScpO1xuICAgICAgICBpZiAoZnVsbFZvbEVsKSB7XG4gICAgICAgICAgICBjb25zdCB2b2wgPSBNYXRoLm1heCgwLCBNYXRoLm1pbigxMDAsIHBhcnNlSW50KGZ1bGxWb2xFbC52YWx1ZSB8fCAnMzAnLCAxMCkpKTtcbiAgICAgICAgICAgIENPTkZJRy5lbmVyZ3lGdWxsQWxlcnRWb2x1bWUgPSB2b2wgLyAxMDA7XG4gICAgICAgIH1cblxuICAgICAgICAvLyA1LiBCcm93c2VyIE5vdGlmaWthc2lcbiAgICAgICAgY29uc3Qgbm90aWZFbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5nLW5vdGlmaWNhdGlvbnMnKTtcbiAgICAgICAgaWYgKG5vdGlmRWwpIENPTkZJRy5zZW5kTm90aWZpY2F0aW9uID0gbm90aWZFbC5jaGVja2VkO1xuXG4gICAgICAgIGNvbnN0IGZ1bGxBbGVydEVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldHRpbmctZW5lcmd5LWZ1bGwtYWxlcnQnKTtcbiAgICAgICAgaWYgKGZ1bGxBbGVydEVsKSBDT05GSUcuZW5lcmd5RnVsbEFsZXJ0RW5hYmxlZCA9IGZ1bGxBbGVydEVsLmNoZWNrZWQ7XG5cbiAgICAgICAgLy8gNi4gU3RlYWx0aCAmIEphbSBUaWR1ciBNYWxhbVxuICAgICAgICBjb25zdCBzdGVhbHRoRWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZy1zdGVhbHRoLWppdHRlcicpO1xuICAgICAgICBpZiAoc3RlYWx0aEVsKSBDT05GSUcuc3RlYWx0aEppdHRlckVuYWJsZWQgPSBzdGVhbHRoRWwuY2hlY2tlZDtcblxuICAgICAgICBjb25zdCBzbGVlcEVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldHRpbmctc2xlZXAtc2NoZWR1bGUnKTtcbiAgICAgICAgaWYgKHNsZWVwRWwpIENPTkZJRy5zbGVlcFNjaGVkdWxlRW5hYmxlZCA9IHNsZWVwRWwuY2hlY2tlZDtcblxuICAgICAgICBjb25zdCBzbGVlcFN0YXJ0RWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZy1zbGVlcC1zdGFydCcpO1xuICAgICAgICBpZiAoc2xlZXBTdGFydEVsKSBDT05GSUcuc2xlZXBTdGFydEhvdXIgPSBwYXJzZUludChzbGVlcFN0YXJ0RWwudmFsdWUsIDEwKTtcblxuICAgICAgICBjb25zdCBzbGVlcEVuZEVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldHRpbmctc2xlZXAtZW5kJyk7XG4gICAgICAgIGlmIChzbGVlcEVuZEVsKSBDT05GSUcuc2xlZXBFbmRIb3VyID0gcGFyc2VJbnQoc2xlZXBFbmRFbC52YWx1ZSwgMTApO1xuXG4gICAgICAgIC8vIDcuIEF1dG8gUmUtTG9naW5cbiAgICAgICAgY29uc3QgYXV0b1JlbG9naW5FbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5nLWF1dG8tcmVsb2dpbicpO1xuICAgICAgICBpZiAoYXV0b1JlbG9naW5FbCkgQ09ORklHLmF1dG9SZWxvZ2luRW5hYmxlZCA9IGF1dG9SZWxvZ2luRWwuY2hlY2tlZDtcblxuICAgICAgICBjb25zdCBlY29FbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5nLWVjby1tb2RlJyk7XG4gICAgICAgIGlmIChlY29FbCkgQ09ORklHLmVjb01vZGVFbmFibGVkID0gZWNvRWwuY2hlY2tlZDtcblxuICAgICAgICAvLyA4LiBTaG9ydGN1dHMgKGhhbnlhIGRpdmFsaWRhc2kgcGFkYSBleHBsaWNpdCBzYXZlKVxuICAgICAgICBpZiAoZXhwbGljaXQpIHtcbiAgICAgICAgICAgIGNvbnN0IG5ld1Nob3J0Y3V0cyA9IHt9O1xuICAgICAgICAgICAgc2hvcnRjdXRBY3Rpb25zLmZvckVhY2goYWN0aW9uID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBpbnAgICAgID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoYHNob3J0Y3V0LSR7YWN0aW9uLmlkfWApO1xuICAgICAgICAgICAgICAgIGNvbnN0IGRpc3BsYXkgPSBpbnA/LnZhbHVlLnRyaW0oKSA/PyAnJztcbiAgICAgICAgICAgICAgICBjb25zdCBwYXJ0cyAgID0gZGlzcGxheS5zcGxpdCgnKycpLmZpbHRlcihCb29sZWFuKTtcbiAgICAgICAgICAgICAgICBjb25zdCBrZXlzICAgID0gcGFydHMubWFwKHAgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAocCA9PT0gJ0N0cmwnKSAgcmV0dXJuICdDb250cm9sJztcbiAgICAgICAgICAgICAgICAgICAgaWYgKHAgPT09ICdTaGlmdCcpIHJldHVybiAnU2hpZnQnO1xuICAgICAgICAgICAgICAgICAgICBpZiAocCA9PT0gJ0FsdCcpICAgcmV0dXJuICdBbHQnO1xuICAgICAgICAgICAgICAgICAgICBpZiAocCA9PT0gJ1NwYWNlJykgcmV0dXJuICdTcGFjZSc7XG4gICAgICAgICAgICAgICAgICAgIGlmIChwLmxlbmd0aCA9PT0gMSAmJiAvW0EtWl0vLnRlc3QocCkpIHJldHVybiBgS2V5JHtwfWA7XG4gICAgICAgICAgICAgICAgICAgIGlmICgvXlxcZCQvLnRlc3QocCkpIHJldHVybiBgRGlnaXQke3B9YDtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHA7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgbmV3U2hvcnRjdXRzW2FjdGlvbi5pZF0gPSB7IGtleXMsIGRpc3BsYXkgfTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBjb25zdCB2YWxpZGF0ZWQgICA9IG5vcm1hbGl6ZUNvbmZpZyh7IHNob3J0Y3V0czogbmV3U2hvcnRjdXRzIH0sIHRydWUpO1xuICAgICAgICAgICAgY29uc3QgaGFzTW9kaWZpZXIgPSBPYmplY3QudmFsdWVzKG5ld1Nob3J0Y3V0cykuZXZlcnkocyA9PiBzLmtleXMuc29tZShrID0+IGsgPT09ICdDb250cm9sJyB8fCBrID09PSAnQWx0JykpO1xuICAgICAgICAgICAgY29uc3QgZGlzcGxheXMgICAgPSBPYmplY3QudmFsdWVzKG5ld1Nob3J0Y3V0cykubWFwKHMgPT4gcy5kaXNwbGF5KTtcbiAgICAgICAgICAgIGNvbnN0IHVuaXF1ZUtleXMgID0gbmV3IFNldChkaXNwbGF5cykuc2l6ZSA9PT0gZGlzcGxheXMubGVuZ3RoO1xuXG4gICAgICAgICAgICBpZiAodmFsaWRhdGVkICYmIGhhc01vZGlmaWVyICYmIHVuaXF1ZUtleXMpIHtcbiAgICAgICAgICAgICAgICBDT05GSUcuc2hvcnRjdXRzID0gbmV3U2hvcnRjdXRzO1xuICAgICAgICAgICAgICAgIGNvbnN0IGVyckVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Nob3J0Y3V0LWVycm9yJyk7XG4gICAgICAgICAgICAgICAgaWYgKGVyckVsKSBlcnJFbC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gU2ltcGFuIGtlIGNocm9tZS5zdG9yYWdlLmxvY2FsXG4gICAgICAgIHNhdmVDb25maWcoQ09ORklHKTtcbiAgICAgICAgY3R4LnVwZGF0ZVBhbmVsVmlzaWJpbGl0eT8uKENPTkZJRyk7XG4gICAgICAgIGN0eC51cGRhdGVQYW5lbD8uKCk7XG5cbiAgICAgICAgY29uc3Qgc3RhdHVzRWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctc2V0dGluZ3Mtc3RhdHVzJyk7XG4gICAgICAgIGlmIChzdGF0dXNFbCkge1xuICAgICAgICAgICAgaWYgKHN0YXR1c1RpbWVyKSBjbGVhclRpbWVvdXQoc3RhdHVzVGltZXIpO1xuICAgICAgICAgICAgaWYgKGV4cGxpY2l0KSB7XG4gICAgICAgICAgICAgICAgc3RhdHVzRWwudGV4dENvbnRlbnQgPSBg4pyFIFRlcnNpbXBhbiEgQmF0YXMgZW5lcmdpOiAke0NPTkZJRy5lbmVyZ3lUaHJlc2hvbGR94pqhYDtcbiAgICAgICAgICAgICAgICBzdGF0dXNFbC5zdHlsZS5jb2xvciA9ICcjMDBmZjg4JztcbiAgICAgICAgICAgICAgICBzdGF0dXNFbC5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgc3RhdHVzRWwudGV4dENvbnRlbnQgPSBg8J+SviBEaXNpbXBhbiBvdG9tYXRpcyAoQmF0YXM6ICR7Q09ORklHLmVuZXJneVRocmVzaG9sZH3imqEpYDtcbiAgICAgICAgICAgICAgICBzdGF0dXNFbC5zdHlsZS5jb2xvciA9ICcjMDBlOTlhJztcbiAgICAgICAgICAgICAgICBzdGF0dXNFbC5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcbiAgICAgICAgICAgICAgICBzdGF0dXNUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4geyBpZiAoc3RhdHVzRWwpIHN0YXR1c0VsLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7IH0sIDI1MDApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8g4pSA4pSAIER1YWwtc3luYyByYW5nZSDihpQgbnVtYmVyIGNvbnRyb2xzIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuICAgIGZ1bmN0aW9uIHNldHVwRHVhbFZvbHVtZUNvbnRyb2woc2xpZGVySWQsIG51bWJlcklkKSB7XG4gICAgICAgIGNvbnN0IHNsaWRlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKHNsaWRlcklkKTtcbiAgICAgICAgY29uc3QgbnVtICAgID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQobnVtYmVySWQpO1xuICAgICAgICBpZiAoIXNsaWRlciB8fCAhbnVtKSByZXR1cm47XG4gICAgICAgIGNvbnN0IHN5bmNBbmRTYXZlID0gKHNvdXJjZVZhbCkgPT4ge1xuICAgICAgICAgICAgbGV0IHYgPSBwYXJzZUludChzb3VyY2VWYWwsIDEwKTtcbiAgICAgICAgICAgIGlmIChpc05hTih2KSB8fCB2IDwgMCkgdiA9IDA7XG4gICAgICAgICAgICBpZiAodiA+IDEwMCkgdiA9IDEwMDtcbiAgICAgICAgICAgIHNsaWRlci52YWx1ZSA9IHY7XG4gICAgICAgICAgICBudW0udmFsdWUgPSB2O1xuICAgICAgICAgICAgYXBwbHlBbmRTYXZlU2V0dGluZ3MoZmFsc2UpO1xuICAgICAgICB9O1xuICAgICAgICBzbGlkZXIuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCBlID0+IHN5bmNBbmRTYXZlKGUudGFyZ2V0LnZhbHVlKSk7XG4gICAgICAgIHNsaWRlci5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBlID0+IHN5bmNBbmRTYXZlKGUudGFyZ2V0LnZhbHVlKSk7XG4gICAgICAgIG51bS5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIGUgPT4gc3luY0FuZFNhdmUoZS50YXJnZXQudmFsdWUpKTtcbiAgICAgICAgbnVtLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGUgPT4gc3luY0FuZFNhdmUoZS50YXJnZXQudmFsdWUpKTtcbiAgICAgICAgbnVtLmFkZEV2ZW50TGlzdGVuZXIoJ2JsdXInLCBlID0+IHN5bmNBbmRTYXZlKGUudGFyZ2V0LnZhbHVlKSk7XG4gICAgfVxuICAgIHNldHVwRHVhbFZvbHVtZUNvbnRyb2woJ3NldHRpbmctc291bmQtbm90aWZpY2F0aW9uLXZvbHVtZScsICAgICAnc2V0dGluZy1zb3VuZC1ub3RpZmljYXRpb24tdm9sdW1lLW51bScpO1xuICAgIHNldHVwRHVhbFZvbHVtZUNvbnRyb2woJ3NldHRpbmctZW5lcmd5LWZ1bGwtdm9sdW1lJywgICAgICAgICAgICAnc2V0dGluZy1lbmVyZ3ktZnVsbC12b2x1bWUtbnVtJyk7XG5cbiAgICAvLyBEdWFsLXN5bmMgdW50dWsgdGhyZXNob2xkIGVuZXJnaVxuICAgIGNvbnN0IHRocmVzaG9sZFNsaWRlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5nLWVuZXJneS10aHJlc2hvbGQnKTtcbiAgICBjb25zdCB0aHJlc2hvbGROdW0gICAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZy1lbmVyZ3ktdGhyZXNob2xkLW51bScpO1xuICAgIGlmICh0aHJlc2hvbGRTbGlkZXIgJiYgdGhyZXNob2xkTnVtKSB7XG4gICAgICAgIGNvbnN0IHN5bmNUaHJlc2hvbGQgPSAodmFsKSA9PiB7XG4gICAgICAgICAgICBsZXQgdiA9IHBhcnNlSW50KHZhbCwgMTApO1xuICAgICAgICAgICAgaWYgKGlzTmFOKHYpIHx8IHYgPCAxMCkgdiA9IDEwO1xuICAgICAgICAgICAgaWYgKHYgPiAxMDApIHYgPSAxMDA7XG4gICAgICAgICAgICB0aHJlc2hvbGRTbGlkZXIudmFsdWUgPSB2O1xuICAgICAgICAgICAgdGhyZXNob2xkTnVtLnZhbHVlID0gdjtcbiAgICAgICAgICAgIGFwcGx5QW5kU2F2ZVNldHRpbmdzKGZhbHNlKTtcbiAgICAgICAgfTtcbiAgICAgICAgdGhyZXNob2xkU2xpZGVyLmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgZSA9PiBzeW5jVGhyZXNob2xkKGUudGFyZ2V0LnZhbHVlKSk7XG4gICAgICAgIHRocmVzaG9sZFNsaWRlci5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBlID0+IHN5bmNUaHJlc2hvbGQoZS50YXJnZXQudmFsdWUpKTtcbiAgICAgICAgdGhyZXNob2xkTnVtLmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgZSA9PiBzeW5jVGhyZXNob2xkKGUudGFyZ2V0LnZhbHVlKSk7XG4gICAgICAgIHRocmVzaG9sZE51bS5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBlID0+IHN5bmNUaHJlc2hvbGQoZS50YXJnZXQudmFsdWUpKTtcbiAgICAgICAgdGhyZXNob2xkTnVtLmFkZEV2ZW50TGlzdGVuZXIoJ2JsdXInLCBlID0+IHN5bmNUaHJlc2hvbGQoZS50YXJnZXQudmFsdWUpKTtcbiAgICB9XG5cbiAgICAvLyBRdWljayBQcmVzZXQgYnV0dG9ucyBoYW5kbGVyXG4gICAgbW9kYWwucXVlcnlTZWxlY3RvckFsbCgnLmF3LXByZXNldC1idG4nKS5mb3JFYWNoKGJ0biA9PiB7XG4gICAgICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHZhbCA9IHBhcnNlSW50KGJ0bi5kYXRhc2V0LnZhbCwgMTApO1xuICAgICAgICAgICAgaWYgKCFpc05hTih2YWwpKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRocmVzaG9sZFNsaWRlcikgdGhyZXNob2xkU2xpZGVyLnZhbHVlID0gdmFsO1xuICAgICAgICAgICAgICAgIGlmICh0aHJlc2hvbGROdW0pIHRocmVzaG9sZE51bS52YWx1ZSA9IHZhbDtcbiAgICAgICAgICAgICAgICBhcHBseUFuZFNhdmVTZXR0aW5ncyhmYWxzZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgLy8gQXV0by1zYXZlIG9uIGFsbCBzd2l0Y2hlcyAmIHNlbGVjdHNcbiAgICBbXG4gICAgICAgICdzZXR0aW5nLXF1aWV0LW1vZGUnLFxuICAgICAgICAnc2V0dGluZy1wYW5lbC1kYXNoYm9hcmQtb25seScsXG4gICAgICAgICdzZXR0aW5nLXBhbmVsLWxlYWRlci1vbmx5JyxcbiAgICAgICAgJ3NldHRpbmctZm9sbG93LXZpZXdwb3J0JyxcbiAgICAgICAgJ3NldHRpbmctcmV0dXJuLW9yaWdpbmFsJyxcbiAgICAgICAgJ3NldHRpbmctc291bmQtbm90aWZpY2F0aW9uLWVuYWJsZWQnLFxuICAgICAgICAnc2V0dGluZy1lbmVyZ3ktZnVsbC1zb3VuZC1lbmFibGVkJyxcbiAgICAgICAgJ3NldHRpbmctbm90aWZpY2F0aW9ucycsXG4gICAgICAgICdzZXR0aW5nLWVuZXJneS1mdWxsLWFsZXJ0JyxcbiAgICAgICAgJ3NldHRpbmctc3RlYWx0aC1qaXR0ZXInLFxuICAgICAgICAnc2V0dGluZy1zbGVlcC1zY2hlZHVsZScsXG4gICAgICAgICdzZXR0aW5nLXNsZWVwLXN0YXJ0JyxcbiAgICAgICAgJ3NldHRpbmctc2xlZXAtZW5kJyxcbiAgICAgICAgJ3NldHRpbmctYXV0by1yZWxvZ2luJyxcbiAgICAgICAgJ3NldHRpbmctZWNvLW1vZGUnXG4gICAgXS5mb3JFYWNoKGlkID0+IHtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoaWQpPy5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCAoKSA9PiBhcHBseUFuZFNhdmVTZXR0aW5ncyhmYWxzZSkpO1xuICAgIH0pO1xuXG4gICAgLy8g4pSA4pSAIEF1dG8gUmUtTG9naW4gQ3JlZGVudGlhbHMgTWFuYWdlbWVudCDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgICBjb25zdCBwd2RJbnB1dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5nLWxvZ2luLXB3ZCcpO1xuICAgIGNvbnN0IHRvZ2dsZVB3ZEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy10b2dnbGUtcHdkLXZpcycpO1xuICAgIHRvZ2dsZVB3ZEJ0bj8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGlmICghcHdkSW5wdXQpIHJldHVybjtcbiAgICAgICAgaWYgKHB3ZElucHV0LnR5cGUgPT09ICdwYXNzd29yZCcpIHtcbiAgICAgICAgICAgIHB3ZElucHV0LnR5cGUgPSAndGV4dCc7XG4gICAgICAgICAgICB0b2dnbGVQd2RCdG4udGV4dENvbnRlbnQgPSAn8J+ZiCBTZW1idW55aWthbic7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwd2RJbnB1dC50eXBlID0gJ3Bhc3N3b3JkJztcbiAgICAgICAgICAgIHRvZ2dsZVB3ZEJ0bi50ZXh0Q29udGVudCA9ICfwn5GB77iPIExpaGF0JztcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgY29uc3Qgc2F2ZUNyZWRzQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LXNhdmUtbG9naW4tY3JlZHMnKTtcbiAgICBjb25zdCBjbGVhckNyZWRzQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LWNsZWFyLWxvZ2luLWNyZWRzJyk7XG4gICAgY29uc3QgY3JlZHNNc2cgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctbG9naW4tY3JlZHMtbXNnJyk7XG4gICAgY29uc3QgZW1haWxJbnAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZy1sb2dpbi1lbWFpbCcpO1xuXG4gICAgc2F2ZUNyZWRzQnRuPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgY29uc3QgZW1haWwgPSBlbWFpbElucD8udmFsdWUudHJpbSgpIHx8ICcnO1xuICAgICAgICBjb25zdCBwd2QgPSBwd2RJbnB1dD8udmFsdWUgfHwgJyc7XG4gICAgICAgIGlmICghZW1haWwgfHwgIXB3ZCkge1xuICAgICAgICAgICAgaWYgKGNyZWRzTXNnKSB7XG4gICAgICAgICAgICAgICAgY3JlZHNNc2cudGV4dENvbnRlbnQgPSAn4pqg77iPIEhhcmFwIGlzaSBlbWFpbCBkYW4ga2F0YSBzYW5kaSEnO1xuICAgICAgICAgICAgICAgIGNyZWRzTXNnLnN0eWxlLmNvbG9yID0gJyNmZjZiNmInO1xuICAgICAgICAgICAgICAgIGNyZWRzTXNnLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHNhdmVDcmVkZW50aWFscyhlbWFpbCwgcHdkKTtcbiAgICAgICAgQ09ORklHLmF1dG9SZWxvZ2luRW5hYmxlZCA9IHRydWU7XG4gICAgICAgIGNvbnN0IGNoayA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5nLWF1dG8tcmVsb2dpbicpO1xuICAgICAgICBpZiAoY2hrKSBjaGsuY2hlY2tlZCA9IHRydWU7XG4gICAgICAgIHNhdmVDb25maWcoQ09ORklHKTtcbiAgICAgICAgaWYgKGNyZWRzTXNnKSB7XG4gICAgICAgICAgICBjcmVkc01zZy50ZXh0Q29udGVudCA9IGDinIUgS3JlZGVuc2lhbCB1bnR1ayAke2VtYWlsfSB0ZXJzaW1wYW4hIEF1dG8gUmUtTG9naW4gQUtUSUYuYDtcbiAgICAgICAgICAgIGNyZWRzTXNnLnN0eWxlLmNvbG9yID0gJyMwMGZmODgnO1xuICAgICAgICAgICAgY3JlZHNNc2cuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG4gICAgICAgIH1cbiAgICAgICAgY3R4LmxvZz8uKCfwn5SQIEtyZWRlbnNpYWwgQXV0byBSZS1Mb2dpbiBiZXJoYXNpbCBkaXNpbXBhbi4nLCAnc3VjY2VzcycpO1xuICAgIH0pO1xuXG4gICAgY2xlYXJDcmVkc0J0bj8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGNsZWFyQ3JlZGVudGlhbHMoKTtcbiAgICAgICAgaWYgKGVtYWlsSW5wKSBlbWFpbElucC52YWx1ZSA9ICcnO1xuICAgICAgICBpZiAocHdkSW5wdXQpIHB3ZElucHV0LnZhbHVlID0gJyc7XG4gICAgICAgIENPTkZJRy5hdXRvUmVsb2dpbkVuYWJsZWQgPSBmYWxzZTtcbiAgICAgICAgY29uc3QgY2hrID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldHRpbmctYXV0by1yZWxvZ2luJyk7XG4gICAgICAgIGlmIChjaGspIGNoay5jaGVja2VkID0gZmFsc2U7XG4gICAgICAgIHNhdmVDb25maWcoQ09ORklHKTtcbiAgICAgICAgaWYgKGNyZWRzTXNnKSB7XG4gICAgICAgICAgICBjcmVkc01zZy50ZXh0Q29udGVudCA9ICfwn5eR77iPIEtyZWRlbnNpYWwgdGVsYWggZGloYXB1cyBkYXJpIGJyb3dzZXIuJztcbiAgICAgICAgICAgIGNyZWRzTXNnLnN0eWxlLmNvbG9yID0gJyNmZmFhMDAnO1xuICAgICAgICAgICAgY3JlZHNNc2cuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG4gICAgICAgIH1cbiAgICAgICAgY3R4LmxvZz8uKCdLcmVkZW5zaWFsIEF1dG8gUmUtTG9naW4gZGloYXB1cy4nLCAnaW5mbycpO1xuICAgIH0pO1xuXG4gICAgLy8g4pSA4pSAIEtleWJvYXJkIHNob3J0Y3V0IHJlY29yZGluZyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgICBjb25zdCByZWNvcmRpbmdTdGF0ZSA9IHt9O1xuICAgIHNob3J0Y3V0QWN0aW9ucy5mb3JFYWNoKGFjdGlvbiA9PiB7XG4gICAgICAgIGNvbnN0IGJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGByZWNvcmQtJHthY3Rpb24uaWR9YCk7XG4gICAgICAgIGNvbnN0IGlucCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGBzaG9ydGN1dC0ke2FjdGlvbi5pZH1gKTtcbiAgICAgICAgaWYgKGJ0biAmJiBpbnApIHtcbiAgICAgICAgICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgICAgICAgICByZWNvcmRpbmdTdGF0ZVthY3Rpb24uaWRdID0geyBrZXlzOiBbXSwgcmVjb3JkaW5nOiB0cnVlIH07XG4gICAgICAgICAgICAgICAgYnRuLnRleHRDb250ZW50ID0gJ+KPsyBUZWthbiB0b21ib2wuLi4nO1xuICAgICAgICAgICAgICAgIGJ0bi5zdHlsZS5iYWNrZ3JvdW5kID0gJyNmZjk1MDAnO1xuICAgICAgICAgICAgICAgIGlucC52YWx1ZSA9ICdNZW51bmdndSBpbnB1dC4uLic7XG4gICAgICAgICAgICAgICAgaW5wLnN0eWxlLmNvbG9yID0gJyNmZjk1MDAnO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbnN0IHJlY29yZEhhbmRsZXIgPSBlID0+IHtcbiAgICAgICAgaWYgKGUudHlwZSAhPT0gJ2tleWRvd24nKSByZXR1cm47XG4gICAgICAgIGxldCBoYW5kbGVkID0gZmFsc2U7XG4gICAgICAgIHNob3J0Y3V0QWN0aW9ucy5mb3JFYWNoKGFjdGlvbiA9PiB7XG4gICAgICAgICAgICBpZiAoIXJlY29yZGluZ1N0YXRlW2FjdGlvbi5pZF0/LnJlY29yZGluZykgcmV0dXJuO1xuICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpOyBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgY29uc3QgcmVjID0gcmVjb3JkaW5nU3RhdGVbYWN0aW9uLmlkXTtcbiAgICAgICAgICAgIGNvbnN0IGJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGByZWNvcmQtJHthY3Rpb24uaWR9YCk7XG4gICAgICAgICAgICBjb25zdCBpbnAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChgc2hvcnRjdXQtJHthY3Rpb24uaWR9YCk7XG4gICAgICAgICAgICBjb25zdCBrZXkgPSBlLmNvZGU7XG5cbiAgICAgICAgICAgIGlmIChrZXkgPT09ICdFc2NhcGUnKSB7XG4gICAgICAgICAgICAgICAgcmVjLnJlY29yZGluZyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIGlmIChpbnApIGlucC52YWx1ZSA9IENPTkZJRy5zaG9ydGN1dHNbYWN0aW9uLmlkXT8uZGlzcGxheSA/PyAnJztcbiAgICAgICAgICAgICAgICBpZiAoYnRuKSB7IGJ0bi50ZXh0Q29udGVudCA9ICfwn46vIFJlY29yZCc7IGJ0bi5zdHlsZS5iYWNrZ3JvdW5kID0gJyMyNTJjNDAnOyB9XG4gICAgICAgICAgICAgICAgaGFuZGxlZCA9IHRydWU7IHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChrZXkgPT09ICdFbnRlcicpIHtcbiAgICAgICAgICAgICAgICBpZiAocmVjLmtleXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICByZWMucmVjb3JkaW5nID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIGlmIChidG4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJ0bi50ZXh0Q29udGVudCA9ICfinIUgRG9uZSc7IGJ0bi5zdHlsZS5iYWNrZ3JvdW5kID0gJyMwMGZmODgnOyBidG4uc3R5bGUuY29sb3IgPSAnIzAwMCc7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHsgYnRuLnRleHRDb250ZW50ID0gJ/Cfjq8gUmVjb3JkJzsgYnRuLnN0eWxlLmJhY2tncm91bmQgPSAnIzI1MmM0MCc7IGJ0bi5zdHlsZS5jb2xvciA9ICcjZmZmJzsgfSwgMTUwMCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaGFuZGxlZCA9IHRydWU7IHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChlLnJlcGVhdCkgeyBoYW5kbGVkID0gdHJ1ZTsgcmV0dXJuOyB9XG4gICAgICAgICAgICBpZiAoIXJlYy5rZXlzLmluY2x1ZGVzKGtleSkpIHJlYy5rZXlzLnB1c2goa2V5KTtcbiAgICAgICAgICAgIGNvbnN0IGRpc3BsYXkgPSByZWMua2V5cy5tYXAoayA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGsgPT09ICdDb250cm9sTGVmdCcgfHwgayA9PT0gJ0NvbnRyb2xSaWdodCcpIHJldHVybiAnQ3RybCc7XG4gICAgICAgICAgICAgICAgaWYgKGsgPT09ICdTaGlmdExlZnQnICAgfHwgayA9PT0gJ1NoaWZ0UmlnaHQnKSAgIHJldHVybiAnU2hpZnQnO1xuICAgICAgICAgICAgICAgIGlmIChrID09PSAnQWx0TGVmdCcgICAgIHx8IGsgPT09ICdBbHRSaWdodCcpICAgICByZXR1cm4gJ0FsdCc7XG4gICAgICAgICAgICAgICAgaWYgKGsuc3RhcnRzV2l0aCgnS2V5JykpICAgcmV0dXJuIGsucmVwbGFjZSgnS2V5JywgJycpO1xuICAgICAgICAgICAgICAgIGlmIChrLnN0YXJ0c1dpdGgoJ0RpZ2l0JykpIHJldHVybiBrLnJlcGxhY2UoJ0RpZ2l0JywgJycpO1xuICAgICAgICAgICAgICAgIGlmIChrID09PSAnU3BhY2UnKSByZXR1cm4gJ1NwYWNlJztcbiAgICAgICAgICAgICAgICByZXR1cm4gaztcbiAgICAgICAgICAgIH0pLmpvaW4oJysnKTtcbiAgICAgICAgICAgIGlmIChpbnApIHsgaW5wLnZhbHVlID0gZGlzcGxheTsgaW5wLnN0eWxlLmNvbG9yID0gJyMwMGZmODgnOyB9XG4gICAgICAgICAgICBpZiAocmVjLmtleXMubGVuZ3RoID49IDMpIHtcbiAgICAgICAgICAgICAgICByZWMucmVjb3JkaW5nID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgaWYgKGJ0bikge1xuICAgICAgICAgICAgICAgICAgICBidG4udGV4dENvbnRlbnQgPSAn4pyFIERvbmUnOyBidG4uc3R5bGUuYmFja2dyb3VuZCA9ICcjMDBmZjg4JzsgYnRuLnN0eWxlLmNvbG9yID0gJyMwMDAnO1xuICAgICAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHsgYnRuLnRleHRDb250ZW50ID0gJ/Cfjq8gUmVjb3JkJzsgYnRuLnN0eWxlLmJhY2tncm91bmQgPSAnIzI1MmM0MCc7IGJ0bi5zdHlsZS5jb2xvciA9ICcjZmZmJzsgfSwgMTUwMCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaGFuZGxlZCA9IHRydWU7XG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoaGFuZGxlZCkgcmV0dXJuIGZhbHNlO1xuICAgIH07XG5cbiAgICAvLyDilIDilIAgTW9kYWwgb3Blbi9jbG9zZSDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgICBmdW5jdGlvbiBoYW5kbGVFc2NhcGVLZXkoZSkge1xuICAgICAgICBpZiAoZS5rZXkgPT09ICdFc2NhcGUnICYmIG1vZGFsLnN0eWxlLmRpc3BsYXkgPT09ICdmbGV4JykgY2xvc2VNb2RhbCh0cnVlKTtcbiAgICB9XG4gICAgZnVuY3Rpb24gY2xvc2VNb2RhbChzYXZlT25DbG9zZSA9IHRydWUpIHtcbiAgICAgICAgaWYgKHNhdmVPbkNsb3NlKSBhcHBseUFuZFNhdmVTZXR0aW5ncyhmYWxzZSk7XG4gICAgICAgIG1vZGFsLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgICAgIGlmIChjdHguc3RhdGUpIGN0eC5zdGF0ZS5zZXR0aW5nc09wZW4gPSBmYWxzZTtcbiAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHJlY29yZEhhbmRsZXIsIHRydWUpO1xuICAgICAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXlkb3duJywgaGFuZGxlRXNjYXBlS2V5KTtcbiAgICB9XG4gICAgbW9kYWwuY2xvc2VNb2RhbFNhZmVseSA9IGNsb3NlTW9kYWw7XG4gICAgbW9kYWwucmVjb3JkSGFuZGxlciAgICA9IHJlY29yZEhhbmRsZXI7XG4gICAgbW9kYWwuaGFuZGxlRXNjYXBlS2V5ICA9IGhhbmRsZUVzY2FwZUtleTtcblxuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1jbG9zZS1zZXR0aW5ncycpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IGNsb3NlTW9kYWwodHJ1ZSkpO1xuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1jYW5jZWwtc2V0dGluZ3MnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIC8vIEJhdGFsOiByZXNldCBpbnB1dCB0YW1waWxhbiBkYXJpIENPTkZJRyBkYW4gdHV0dXAgdGFucGEgbWVueWltcGFuXG4gICAgICAgIG9wZW5TZXR0aW5ncyhDT05GSUcsIGN0eCk7XG4gICAgICAgIGNsb3NlTW9kYWwoZmFsc2UpO1xuICAgIH0pO1xuICAgIG1vZGFsLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZSA9PiB7IGlmIChlLnRhcmdldCA9PT0gbW9kYWwpIGNsb3NlTW9kYWwodHJ1ZSk7IH0pO1xuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBoYW5kbGVFc2NhcGVLZXkpO1xuXG4gICAgLy8g4pSA4pSAIEJ1dHRvbiBoYW5kbGVycyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctdGVzdC1ub3RpZmljYXRpb24tc291bmQnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHZvbFZhbCA9IHBhcnNlSW50KGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5nLXNvdW5kLW5vdGlmaWNhdGlvbi12b2x1bWUnKT8udmFsdWUgPz8gJzcwJywgMTApO1xuICAgICAgICBjb25zdCB0ZXN0Vm9sID0gaXNOYU4odm9sVmFsKSA/IDAuNyA6IE1hdGgubWF4KDAsIE1hdGgubWluKDEwMCwgdm9sVmFsKSkgLyAxMDA7XG4gICAgICAgIGN0eC5zZW5kTm90aWZpY2F0aW9uPy4oJ1BhcmxhbWVudHVtIEF1dG8gV29ya2VyJywgJ1RlcyBub3RpZmlrYXNpIHN1YXJhIGJlcmhhc2lsLicpO1xuICAgICAgICBjdHgucGxheU5vdGlmaWNhdGlvblNvdW5kPy4oeyBzb3VuZE5vdGlmaWNhdGlvbkVuYWJsZWQ6IHRydWUsIHNvdW5kTm90aWZpY2F0aW9uVm9sdW1lOiB0ZXN0Vm9sIH0sICdzdWNjZXNzJyk7XG4gICAgfSk7XG5cbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctcmVzZXQtcG9zaXRpb24nKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGlmICghY3R4LnN0YXRlKSByZXR1cm47XG4gICAgICAgIGN0eC5zdGF0ZS5wYW5lbFggPSBDT05GSUcucGFuZWxEZWZhdWx0WDtcbiAgICAgICAgY3R4LnN0YXRlLnBhbmVsWSA9IENPTkZJRy5wYW5lbERlZmF1bHRZO1xuICAgICAgICBjb25zdCBwYW5lbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1wYW5lbCcpO1xuICAgICAgICBpZiAocGFuZWwpIHsgcGFuZWwuc3R5bGUubGVmdCA9IGN0eC5zdGF0ZS5wYW5lbFggKyAncHgnOyBwYW5lbC5zdHlsZS50b3AgPSBjdHguc3RhdGUucGFuZWxZICsgJ3B4JzsgfVxuICAgICAgICBzZXRWYWx1ZSgncGFuZWxYJywgY3R4LnN0YXRlLnBhbmVsWC50b1N0cmluZygpKTtcbiAgICAgICAgc2V0VmFsdWUoJ3BhbmVsWScsIGN0eC5zdGF0ZS5wYW5lbFkudG9TdHJpbmcoKSk7XG4gICAgICAgIGN0eC5sb2c/LignUG9zaXNpIHBhbmVsIGJlcmhhc2lsIGRpLXJlc2V0IGtlIGRlZmF1bHQnLCAnc3VjY2VzcycpO1xuICAgICAgICBjb25zdCBzdGF0dXNFbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1zZXR0aW5ncy1zdGF0dXMnKTtcbiAgICAgICAgaWYgKHN0YXR1c0VsKSB7XG4gICAgICAgICAgICBzdGF0dXNFbC50ZXh0Q29udGVudCA9ICfwn5ONIFBvc2lzaSBwYW5lbCBkaS1yZXNldCBrZSBkZWZhdWx0JztcbiAgICAgICAgICAgIHN0YXR1c0VsLnN0eWxlLmNvbG9yID0gJyMwMDg4ZmYnO1xuICAgICAgICAgICAgc3RhdHVzRWwuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG4gICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHsgaWYgKHN0YXR1c0VsKSBzdGF0dXNFbC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnOyB9LCAyNTAwKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LXJlc3RvcmUtZGVmYXVsdHMnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGlmICghY29uZmlybSgn4pqg77iPIFlha2luIGluZ2luIG1lbmdlbWJhbGlrYW4gU0VNVUEgcGVuZ2F0dXJhbiBrZSBkZWZhdWx0P1xcblxcbkluaSBha2FuOlxcbi0gUmVzZXQga2V5Ym9hcmQgc2hvcnRjdXRzIGtlIEN0cmwrU2hpZnQrQS9ML1MgZGFuIEFsdCtTaGlmdCtXL1BcXG4tIFJlc2V0IGJhdGFzIGVuZXJnaSBrZSAxMOKaoVxcbi0gUmVzZXQgc2VtdWEgY2hlY2tib3ggZGFuIHNsaWRlclxcbi0gUmVzZXQgcG9zaXNpIHBhbmVsXFxuXFxuS29uZmlndXJhc2kgeWFuZyB0ZXJzaW1wYW4gYWthbiBkaWhhcHVzIScpKSByZXR1cm47XG4gICAgICAgIHNldFZhbHVlKCdhd19jb25maWcnLCBudWxsKTtcbiAgICAgICAgc2V0VmFsdWUoJ3BhbmVsWCcsIChDT05GSUcucGFuZWxEZWZhdWx0WCA/PyAyMCkudG9TdHJpbmcoKSk7XG4gICAgICAgIHNldFZhbHVlKCdwYW5lbFknLCAoQ09ORklHLnBhbmVsRGVmYXVsdFkgPz8gMjApLnRvU3RyaW5nKCkpO1xuICAgICAgICBjdHgubG9nPy4oJ/CflIQgU2VtdWEgcGVuZ2F0dXJhbiBiZXJoYXNpbCBkaS1yZXNldCBrZSBkZWZhdWx0ISBSZWZyZXNoIGhhbGFtYW4gdW50dWsgbWVuZXJhcGthbi4nLCAnc3VjY2VzcycpO1xuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgIGlmIChjb25maXJtKCdQZW5nYXR1cmFuIHN1ZGFoIGRpLXJlc2V0LiBSZWZyZXNoIGhhbGFtYW4gc2VrYXJhbmc/JykpIGxvY2F0aW9uLnJlbG9hZCgpO1xuICAgICAgICB9LCA1MDApO1xuICAgIH0pO1xuXG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LXNhdmUtc2V0dGluZ3MnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGFwcGx5QW5kU2F2ZVNldHRpbmdzKHRydWUpO1xuXG4gICAgICAgIGlmIChDT05GSUcuc2VuZE5vdGlmaWNhdGlvbiAmJiAnTm90aWZpY2F0aW9uJyBpbiB3aW5kb3cgJiYgTm90aWZpY2F0aW9uLnBlcm1pc3Npb24gPT09ICdkZWZhdWx0Jykge1xuICAgICAgICAgICAgTm90aWZpY2F0aW9uLnJlcXVlc3RQZXJtaXNzaW9uKCkuY2F0Y2goKCkgPT4ge30pO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgaGlkZUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1oaWRlJyk7XG4gICAgICAgIGlmIChoaWRlQnRuKSBoaWRlQnRuLnRpdGxlID0gYEhpZGUgKCR7Q09ORklHLnNob3J0Y3V0cy5zaG93SGlkZT8uZGlzcGxheSA/PyAnJ30pYDtcblxuICAgICAgICBjdHgubG9nPy4oYFBlbmdhdHVyYW4gZGlzaW1wYW4hIEJhdGFzIGVuZXJnaSBzZWJlbHVtIGtlcmphOiAke0NPTkZJRy5lbmVyZ3lUaHJlc2hvbGR94pqhYCwgJ3N1Y2Nlc3MnKTtcbiAgICAgICAgY3R4LnBsYXlOb3RpZmljYXRpb25Tb3VuZD8uKCdzdWNjZXNzJyk7XG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4gY2xvc2VNb2RhbChmYWxzZSksIDcwMCk7XG4gICAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBvcGVuU2V0dGluZ3MoQ09ORklHLCBjdHgpIHtcbiAgICBjb25zdCBtb2RhbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1zZXR0aW5ncy1tb2RhbCcpO1xuICAgIGlmICghbW9kYWwpIHJldHVybjtcblxuICAgIC8vIFNpbmtyb25rYW4gc2VsdXJ1aCBpbnB1dCBET00gZGFyaSBDT05GSUcgYWt0aWZcbiAgICBjb25zdCB0aHJlc2hvbGRTbGlkZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZy1lbmVyZ3ktdGhyZXNob2xkJyk7XG4gICAgY29uc3QgdGhyZXNob2xkTnVtICAgID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldHRpbmctZW5lcmd5LXRocmVzaG9sZC1udW0nKTtcbiAgICBpZiAodGhyZXNob2xkU2xpZGVyKSB0aHJlc2hvbGRTbGlkZXIudmFsdWUgPSBDT05GSUcuZW5lcmd5VGhyZXNob2xkO1xuICAgIGlmICh0aHJlc2hvbGROdW0pICAgIHRocmVzaG9sZE51bS52YWx1ZSAgICA9IENPTkZJRy5lbmVyZ3lUaHJlc2hvbGQ7XG5cbiAgICBjb25zdCBxdWlldENiID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldHRpbmctcXVpZXQtbW9kZScpO1xuICAgIGlmIChxdWlldENiKSBxdWlldENiLmNoZWNrZWQgPSBCb29sZWFuKENPTkZJRy5xdWlldE1vZGVFbmFibGVkKTtcblxuICAgIGNvbnN0IGRhc2hDYiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5nLXBhbmVsLWRhc2hib2FyZC1vbmx5Jyk7XG4gICAgaWYgKGRhc2hDYikgZGFzaENiLmNoZWNrZWQgPSBCb29sZWFuKENPTkZJRy5wYW5lbERhc2hib2FyZE9ubHkpO1xuXG4gICAgY29uc3QgbGVhZGVyQ2IgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZy1wYW5lbC1sZWFkZXItb25seScpO1xuICAgIGlmIChsZWFkZXJDYikgbGVhZGVyQ2IuY2hlY2tlZCA9IEJvb2xlYW4oQ09ORklHLnBhbmVsTGVhZGVyT25seSk7XG5cbiAgICBjb25zdCBmb2xsb3dDYiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5nLWZvbGxvdy12aWV3cG9ydCcpO1xuICAgIGlmIChmb2xsb3dDYikgZm9sbG93Q2IuY2hlY2tlZCA9IEJvb2xlYW4oQ09ORklHLnBhbmVsRm9sbG93Vmlld3BvcnQpO1xuXG4gICAgY29uc3QgcmV0dXJuQ2IgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZy1yZXR1cm4tb3JpZ2luYWwnKTtcbiAgICBpZiAocmV0dXJuQ2IpIHJldHVybkNiLmNoZWNrZWQgPSBCb29sZWFuKENPTkZJRy5wYW5lbFJldHVyblRvT3JpZ2luYWwpO1xuXG4gICAgY29uc3Qgc291bmRDYiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5nLXNvdW5kLW5vdGlmaWNhdGlvbi1lbmFibGVkJyk7XG4gICAgaWYgKHNvdW5kQ2IpIHNvdW5kQ2IuY2hlY2tlZCA9IEJvb2xlYW4oQ09ORklHLnNvdW5kTm90aWZpY2F0aW9uRW5hYmxlZCk7XG5cbiAgICBjb25zdCBzb3VuZFZvbFNsaWRlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5nLXNvdW5kLW5vdGlmaWNhdGlvbi12b2x1bWUnKTtcbiAgICBjb25zdCBzb3VuZFZvbE51bSAgICA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5nLXNvdW5kLW5vdGlmaWNhdGlvbi12b2x1bWUtbnVtJyk7XG4gICAgaWYgKHNvdW5kVm9sU2xpZGVyKSBzb3VuZFZvbFNsaWRlci52YWx1ZSA9IE1hdGgucm91bmQoQ09ORklHLnNvdW5kTm90aWZpY2F0aW9uVm9sdW1lICogMTAwKTtcbiAgICBpZiAoc291bmRWb2xOdW0pICAgIHNvdW5kVm9sTnVtLnZhbHVlICAgID0gTWF0aC5yb3VuZChDT05GSUcuc291bmROb3RpZmljYXRpb25Wb2x1bWUgKiAxMDApO1xuXG4gICAgY29uc3QgZnVsbFNvdW5kQ2IgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZy1lbmVyZ3ktZnVsbC1zb3VuZC1lbmFibGVkJyk7XG4gICAgaWYgKGZ1bGxTb3VuZENiKSBmdWxsU291bmRDYi5jaGVja2VkID0gQm9vbGVhbihDT05GSUcuZW5lcmd5RnVsbEFsZXJ0U291bmRFbmFibGVkKTtcblxuICAgIGNvbnN0IGZ1bGxWb2xTbGlkZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZy1lbmVyZ3ktZnVsbC12b2x1bWUnKTtcbiAgICBjb25zdCBmdWxsVm9sTnVtICAgID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldHRpbmctZW5lcmd5LWZ1bGwtdm9sdW1lLW51bScpO1xuICAgIGlmIChmdWxsVm9sU2xpZGVyKSBmdWxsVm9sU2xpZGVyLnZhbHVlID0gTWF0aC5yb3VuZChDT05GSUcuZW5lcmd5RnVsbEFsZXJ0Vm9sdW1lICogMTAwKTtcbiAgICBpZiAoZnVsbFZvbE51bSkgICAgZnVsbFZvbE51bS52YWx1ZSAgICA9IE1hdGgucm91bmQoQ09ORklHLmVuZXJneUZ1bGxBbGVydFZvbHVtZSAqIDEwMCk7XG5cbiAgICBjb25zdCBub3RpZkNiID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldHRpbmctbm90aWZpY2F0aW9ucycpO1xuICAgIGlmIChub3RpZkNiKSBub3RpZkNiLmNoZWNrZWQgPSBCb29sZWFuKENPTkZJRy5zZW5kTm90aWZpY2F0aW9uKTtcblxuICAgIGNvbnN0IGZ1bGxBbGVydENiID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldHRpbmctZW5lcmd5LWZ1bGwtYWxlcnQnKTtcbiAgICBpZiAoZnVsbEFsZXJ0Q2IpIGZ1bGxBbGVydENiLmNoZWNrZWQgPSBCb29sZWFuKENPTkZJRy5lbmVyZ3lGdWxsQWxlcnRFbmFibGVkKTtcblxuICAgIGNvbnN0IHN0ZWFsdGhDYiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5nLXN0ZWFsdGgtaml0dGVyJyk7XG4gICAgaWYgKHN0ZWFsdGhDYikgc3RlYWx0aENiLmNoZWNrZWQgPSBCb29sZWFuKENPTkZJRy5zdGVhbHRoSml0dGVyRW5hYmxlZCk7XG5cbiAgICBjb25zdCBzbGVlcENiID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldHRpbmctc2xlZXAtc2NoZWR1bGUnKTtcbiAgICBpZiAoc2xlZXBDYikgc2xlZXBDYi5jaGVja2VkID0gQm9vbGVhbihDT05GSUcuc2xlZXBTY2hlZHVsZUVuYWJsZWQpO1xuXG4gICAgY29uc3Qgc2xlZXBTdGFydFNlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5nLXNsZWVwLXN0YXJ0Jyk7XG4gICAgaWYgKHNsZWVwU3RhcnRTZWwpIHNsZWVwU3RhcnRTZWwudmFsdWUgPSBTdHJpbmcoQ09ORklHLnNsZWVwU3RhcnRIb3VyID8/IDEpO1xuXG4gICAgY29uc3Qgc2xlZXBFbmRTZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZy1zbGVlcC1lbmQnKTtcbiAgICBpZiAoc2xlZXBFbmRTZWwpIHNsZWVwRW5kU2VsLnZhbHVlID0gU3RyaW5nKENPTkZJRy5zbGVlcEVuZEhvdXIgPz8gNik7XG5cbiAgICBbJ3Nob3dIaWRlJywgJ3dvcmtOb3cnLCAncGF1c2VSZXN1bWUnLCAnb3BlbkxvZycsICdvcGVuU2V0dGluZ3MnXS5mb3JFYWNoKGFjdGlvbklkID0+IHtcbiAgICAgICAgY29uc3QgaW5wID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoYHNob3J0Y3V0LSR7YWN0aW9uSWR9YCk7XG4gICAgICAgIGlmIChpbnAgJiYgQ09ORklHLnNob3J0Y3V0c1thY3Rpb25JZF0pIHtcbiAgICAgICAgICAgIGlucC52YWx1ZSA9IENPTkZJRy5zaG9ydGN1dHNbYWN0aW9uSWRdLmRpc3BsYXkgfHwgJyc7XG4gICAgICAgICAgICBpbnAuc3R5bGUuY29sb3IgPSAnIzAwZDRmZic7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbnN0IHN0YXR1c0VsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LXNldHRpbmdzLXN0YXR1cycpO1xuICAgIGlmIChzdGF0dXNFbCkgc3RhdHVzRWwuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblxuICAgIG1vZGFsLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG4gICAgaWYgKGN0eD8uc3RhdGUpIGN0eC5zdGF0ZS5zZXR0aW5nc09wZW4gPSB0cnVlO1xuXG4gICAgLy8gUGFzdGlrYW4gdGFiIGFrdGlmIG90b21hdGlzIHRlci1zY3JvbGwga2UgdGVuZ2FoIGJpbGEgYmVyYWRhIGRpIGxheWFyIHNlbXBpdFxuICAgIGNvbnN0IGFjdGl2ZVRhYiA9IG1vZGFsLnF1ZXJ5U2VsZWN0b3IoJy5hdy10YWItYnRuLmFjdGl2ZScpO1xuICAgIGlmIChhY3RpdmVUYWIpIHtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiBhY3RpdmVUYWIuc2Nyb2xsSW50b1ZpZXcoeyBiZWhhdmlvcjogJ3Ntb290aCcsIGJsb2NrOiAnbmVhcmVzdCcsIGlubGluZTogJ2NlbnRlcicgfSksIDYwKTtcbiAgICB9XG4gICAgaWYgKG1vZGFsLnJlY29yZEhhbmRsZXIpIHtcbiAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIG1vZGFsLnJlY29yZEhhbmRsZXIsIHRydWUpO1xuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgbW9kYWwucmVjb3JkSGFuZGxlciwgdHJ1ZSk7XG4gICAgfVxuICAgIGlmIChtb2RhbC5oYW5kbGVFc2NhcGVLZXkpIHtcbiAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIG1vZGFsLmhhbmRsZUVzY2FwZUtleSk7XG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBtb2RhbC5oYW5kbGVFc2NhcGVLZXkpO1xuICAgIH1cbn1cbiIsIi8qKlxuICogdWkvYW5hbHl0aWNzLmpzIOKAlCBBbmFseXRpY3MgJiB3b3JrIGhpc3RvcnkgZGFzaGJvYXJkXG4gKiBNb2Rlcm5pemVkIHdpdGggS1BJIG1ldHJpYyBjYXJkcywgZ2xvd2luZyA3LWRheSBiYXIgY2hhcnRzLFxuICogaW50ZXJhY3RpdmUgdG9vbHRpcHMsIGFuZCBzbGVlayBnbGFzc21vcnBoaWMgc3R5bGluZy5cbiAqL1xuXG5pbXBvcnQgeyBsb2FkV29ya0hpc3RvcnksIHNhdmVXb3JrSGlzdG9yeSwgbm9ybWFsaXplV29ya0hpc3RvcnksIG1pZ3JhdGVMZWdhY3lFbmVyZ3lIaXN0b3J5LCBwcnVuZU9sZEhpc3RvcnkgfSBmcm9tICcuLi9oaXN0b3J5LmpzJztcbmltcG9ydCB7IGlzUGxhaW5PYmplY3QsIG5vcm1hbGl6ZUNvbmZpZyB9IGZyb20gJy4uL2NvbmZpZy5qcyc7XG5pbXBvcnQgeyBzZXRWYWx1ZSB9IGZyb20gJy4uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgc2F2ZVN0YXRlIH0gZnJvbSAnLi4vc3RhdGUuanMnO1xuXG4vLyBJbmplY3Qgc2NvcGVkIHN0eWxlc2hlZXQgb25jZVxuZnVuY3Rpb24gZW5zdXJlQW5hbHl0aWNzU3R5bGVzKCkge1xuICAgIGlmIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctYW5hbHl0aWNzLXN0eWxlcycpKSByZXR1cm47XG4gICAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuICAgIHN0eWxlLmlkID0gJ2F3LWFuYWx5dGljcy1zdHlsZXMnO1xuICAgIHN0eWxlLnRleHRDb250ZW50ID0gYFxuICAgICAgICAjYXctYW5hbHl0aWNzLW1vZGFsIHtcbiAgICAgICAgICAgIGZvbnQtZmFtaWx5OiAtYXBwbGUtc3lzdGVtLCBCbGlua01hY1N5c3RlbUZvbnQsIFwiU2Vnb2UgVUlcIiwgUm9ib3RvLCBcIkhlbHZldGljYSBOZXVlXCIsIEFyaWFsLCBzYW5zLXNlcmlmO1xuICAgICAgICAgICAgY29sb3I6ICNlMmU4ZjA7XG4gICAgICAgIH1cblxuICAgICAgICAvKiBLUEkgTWV0cmljIENhcmRzIEdyaWQgKi9cbiAgICAgICAgLmF3LWtwaS1ncmlkIHtcbiAgICAgICAgICAgIGRpc3BsYXk6IGdyaWQ7XG4gICAgICAgICAgICBncmlkLXRlbXBsYXRlLWNvbHVtbnM6IHJlcGVhdCg0LCAxZnIpO1xuICAgICAgICAgICAgZ2FwOiAxMHB4O1xuICAgICAgICAgICAgbWFyZ2luLWJvdHRvbTogMTRweDtcbiAgICAgICAgfVxuICAgICAgICBAbWVkaWEgKG1heC13aWR0aDogNjAwcHgpIHtcbiAgICAgICAgICAgIC5hdy1rcGktZ3JpZCB7XG4gICAgICAgICAgICAgICAgZ3JpZC10ZW1wbGF0ZS1jb2x1bW5zOiByZXBlYXQoMiwgMWZyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAuYXcta3BpLWNhcmQge1xuICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgyMiwgMjcsIDQyLCAwLjYpO1xuICAgICAgICAgICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjA3KTtcbiAgICAgICAgICAgIGJvcmRlci1yYWRpdXM6IDEwcHg7XG4gICAgICAgICAgICBwYWRkaW5nOiAxMnB4IDE0cHg7XG4gICAgICAgICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgICAgICAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcbiAgICAgICAgICAgIGdhcDogM3B4O1xuICAgICAgICAgICAgdHJhbnNpdGlvbjogYWxsIDAuMnMgY3ViaWMtYmV6aWVyKDAuNCwgMCwgMC4yLCAxKTtcbiAgICAgICAgfVxuICAgICAgICAuYXcta3BpLWNhcmQ6aG92ZXIge1xuICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgyOCwgMzUsIDU0LCAwLjc1KTtcbiAgICAgICAgICAgIGJvcmRlci1jb2xvcjogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjE0KTtcbiAgICAgICAgICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlWSgtMXB4KTtcbiAgICAgICAgfVxuICAgICAgICAuYXcta3BpLWhlYWRlciB7XG4gICAgICAgICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICAgICAgICAgIGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjtcbiAgICAgICAgICAgIGZvbnQtc2l6ZTogMTFweDtcbiAgICAgICAgICAgIGNvbG9yOiAjOGI5YmI0O1xuICAgICAgICAgICAgZm9udC13ZWlnaHQ6IDUwMDtcbiAgICAgICAgfVxuICAgICAgICAuYXcta3BpLXZhbHVlIHtcbiAgICAgICAgICAgIGZvbnQtc2l6ZTogMTlweDtcbiAgICAgICAgICAgIGZvbnQtd2VpZ2h0OiA3MDA7XG4gICAgICAgICAgICBsZXR0ZXItc3BhY2luZzogLTAuM3B4O1xuICAgICAgICAgICAgbGluZS1oZWlnaHQ6IDEuMjU7XG4gICAgICAgICAgICBtYXJnaW4tdG9wOiAycHg7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LWtwaS1zdWIge1xuICAgICAgICAgICAgZm9udC1zaXplOiAxMC41cHg7XG4gICAgICAgICAgICBjb2xvcjogIzY0NzQ4YjtcbiAgICAgICAgICAgIG1hcmdpbi10b3A6IDJweDtcbiAgICAgICAgICAgIGxpbmUtaGVpZ2h0OiAxLjM1O1xuICAgICAgICB9XG5cbiAgICAgICAgLyogQW5hbHl0aWNzIFNlY3Rpb24gQ2FyZHMgKi9cbiAgICAgICAgLmF3LWFuYWx5dGljcy1zZWN0aW9uIHtcbiAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMjIsIDI3LCA0MiwgMC41NSk7XG4gICAgICAgICAgICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMDYpO1xuICAgICAgICAgICAgYm9yZGVyLXJhZGl1czogMTJweDtcbiAgICAgICAgICAgIHBhZGRpbmc6IDE2cHg7XG4gICAgICAgICAgICBtYXJnaW4tYm90dG9tOiAxMnB4O1xuICAgICAgICAgICAgdHJhbnNpdGlvbjogYWxsIDAuMnM7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LWFuYWx5dGljcy1zZWN0aW9uOmhvdmVyIHtcbiAgICAgICAgICAgIGJvcmRlci1jb2xvcjogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjEpO1xuICAgICAgICB9XG4gICAgICAgIC5hdy1zZWN0aW9uLWhlYWRlciB7XG4gICAgICAgICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgICAgICAganVzdGlmeS1jb250ZW50OiBzcGFjZS1iZXR3ZWVuO1xuICAgICAgICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICAgICAgICAgIG1hcmdpbi1ib3R0b206IDEycHg7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LXNlY3Rpb24tdGl0bGUge1xuICAgICAgICAgICAgZm9udC1zaXplOiAxM3B4O1xuICAgICAgICAgICAgZm9udC13ZWlnaHQ6IDYwMDtcbiAgICAgICAgICAgIGNvbG9yOiAjZjFmNWY5O1xuICAgICAgICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgICAgICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgICAgICAgICBnYXA6IDZweDtcbiAgICAgICAgfVxuICAgICAgICAuYXctc2VjdGlvbi1zdWJ0aXRsZSB7XG4gICAgICAgICAgICBmb250LXNpemU6IDExcHg7XG4gICAgICAgICAgICBjb2xvcjogIzhiOWJiNDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8qIEJhciBHcmFwaCBTdHlsaW5nICovXG4gICAgICAgIC5hdy1ncmFwaC1jb250YWluZXIge1xuICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgxMiwgMTYsIDI2LCAwLjYpO1xuICAgICAgICAgICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjA1KTtcbiAgICAgICAgICAgIGJvcmRlci1yYWRpdXM6IDEwcHg7XG4gICAgICAgICAgICBwYWRkaW5nOiAxNHB4IDEwcHggMTBweDtcbiAgICAgICAgICAgIG1hcmdpbi1ib3R0b206IDEycHg7XG4gICAgICAgICAgICBwb3NpdGlvbjogcmVsYXRpdmU7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LWdyYXBoLWJhciB7XG4gICAgICAgICAgICBib3JkZXItcmFkaXVzOiAzcHggM3B4IDAgMDtcbiAgICAgICAgICAgIHRyYW5zaXRpb246IGFsbCAwLjI1cyBjdWJpYy1iZXppZXIoMC40LCAwLCAwLjIsIDEpO1xuICAgICAgICAgICAgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgICB9XG4gICAgICAgIC5hdy1ncmFwaC1iYXI6aG92ZXIge1xuICAgICAgICAgICAgZmlsdGVyOiBicmlnaHRuZXNzKDEuMjUpO1xuICAgICAgICAgICAgdHJhbnNmb3JtOiBzY2FsZVkoMS4wMyk7XG4gICAgICAgICAgICB0cmFuc2Zvcm0tb3JpZ2luOiBib3R0b207XG4gICAgICAgIH1cblxuICAgICAgICAvKiBDdXN0b20gU2Nyb2xsYmFyICovXG4gICAgICAgICNhdy1hbmFseXRpY3MtY29udGVudDo6LXdlYmtpdC1zY3JvbGxiYXIge1xuICAgICAgICAgICAgd2lkdGg6IDZweDtcbiAgICAgICAgfVxuICAgICAgICAjYXctYW5hbHl0aWNzLWNvbnRlbnQ6Oi13ZWJraXQtc2Nyb2xsYmFyLXRyYWNrIHtcbiAgICAgICAgICAgIGJhY2tncm91bmQ6IHRyYW5zcGFyZW50O1xuICAgICAgICB9XG4gICAgICAgICNhdy1hbmFseXRpY3MtY29udGVudDo6LXdlYmtpdC1zY3JvbGxiYXItdGh1bWIge1xuICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjE0KTtcbiAgICAgICAgICAgIGJvcmRlci1yYWRpdXM6IDRweDtcbiAgICAgICAgfVxuICAgICAgICAjYXctYW5hbHl0aWNzLWNvbnRlbnQ6Oi13ZWJraXQtc2Nyb2xsYmFyLXRodW1iOmhvdmVyIHtcbiAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4yOCk7XG4gICAgICAgIH1cbiAgICBgO1xuICAgIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQW5hbHl0aWNzRGFzaGJvYXJkKHN0YXRlLCBDT05GSUcsIHdvcmtIaXN0b3J5LCBjdHgpIHtcbiAgICBlbnN1cmVBbmFseXRpY3NTdHlsZXMoKTtcblxuICAgIGNvbnN0IG9sZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1hbmFseXRpY3MtbW9kYWwnKTtcbiAgICBpZiAob2xkKSBvbGQucmVtb3ZlKCk7XG5cbiAgICBjb25zdCBtb2RhbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIG1vZGFsLmlkID0gJ2F3LWFuYWx5dGljcy1tb2RhbCc7XG4gICAgbW9kYWwuc3R5bGUuY3NzVGV4dCA9IGBcbiAgICAgICAgZGlzcGxheTogbm9uZTtcbiAgICAgICAgcG9zaXRpb246IGZpeGVkO1xuICAgICAgICB0b3A6IDA7IGxlZnQ6IDA7IHJpZ2h0OiAwOyBib3R0b206IDA7XG4gICAgICAgIGJhY2tncm91bmQ6IHJnYmEoNCwgNywgMTQsIDAuNzgpO1xuICAgICAgICBiYWNrZHJvcC1maWx0ZXI6IGJsdXIoOHB4KTtcbiAgICAgICAgLXdlYmtpdC1iYWNrZHJvcC1maWx0ZXI6IGJsdXIoOHB4KTtcbiAgICAgICAgei1pbmRleDogMTAwMDAyO1xuICAgICAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcbiAgICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICBgO1xuXG4gICAgbW9kYWwuaW5uZXJIVE1MID0gYFxuICAgICAgICA8ZGl2IHN0eWxlPVwiXG4gICAgICAgICAgICBiYWNrZ3JvdW5kOiBsaW5lYXItZ3JhZGllbnQoMTgwZGVnLCAjMTMxNzI0IDAlLCAjMGQxMDFhIDEwMCUpO1xuICAgICAgICAgICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjEyKTtcbiAgICAgICAgICAgIGJvcmRlci1yYWRpdXM6IDE2cHg7XG4gICAgICAgICAgICB3aWR0aDogOTUlO1xuICAgICAgICAgICAgbWF4LXdpZHRoOiA2ODBweDtcbiAgICAgICAgICAgIGhlaWdodDogNjQwcHg7XG4gICAgICAgICAgICBtYXgtaGVpZ2h0OiA5MHZoO1xuICAgICAgICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgICAgICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG4gICAgICAgICAgICBib3gtc2hhZG93OiAwIDIwcHggNjBweCByZ2JhKDAsMCwwLDAuOCksIDAgMCAxcHggMXB4IHJnYmEoMjU1LDI1NSwyNTUsMC4wNSk7XG4gICAgICAgICAgICBvdmVyZmxvdzogaGlkZGVuO1xuICAgICAgICBcIj5cbiAgICAgICAgICAgIDwhLS0gTW9kYWwgSGVhZGVyIC0tPlxuICAgICAgICAgICAgPGRpdiBzdHlsZT1cIlxuICAgICAgICAgICAgICAgIHBhZGRpbmc6IDE2cHggMjBweDtcbiAgICAgICAgICAgICAgICBib3JkZXItYm90dG9tOiAxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjA4KTtcbiAgICAgICAgICAgICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgICAgICAgICAgIGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjtcbiAgICAgICAgICAgICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsIHJnYmEoMjYsIDMzLCA1NCwgMC44KSAwJSwgcmdiYSgxOCwgMjIsIDM2LCAwLjk1KSAxMDAlKTtcbiAgICAgICAgICAgIFwiPlxuICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBnYXA6IDEwcHg7XCI+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJcbiAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoOiAzMnB4OyBoZWlnaHQ6IDMycHg7IGJvcmRlci1yYWRpdXM6IDhweDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsIHJnYmEoMCwyMTIsMjU1LDAuMiksIHJnYmEoMCwyNTUsMTM2LDAuMikpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSgwLDIxMiwyNTUsMC4zKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGp1c3RpZnktY29udGVudDogY2VudGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9udC1zaXplOiAxNnB4O1xuICAgICAgICAgICAgICAgICAgICBcIj7wn5OKPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDxkaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZm9udC13ZWlnaHQ6IDcwMDsgY29sb3I6ICNmZmY7IGZvbnQtc2l6ZTogMTVweDsgbGV0dGVyLXNwYWNpbmc6IDAuM3B4O1wiPlN0YXRpc3RpayAmIEVmaXNpZW5zaSBLZXJqYTwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cImZvbnQtc2l6ZTogMTFweDsgY29sb3I6ICM4YjliYjQ7XCI+UGFudGF1IHBlcmZvcm1hIHNoaWZ0LCBwZXJvbGVoYW4gWFAsIGRhbiBrb25zdW1zaSBlbmVyZ2k8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBpZD1cImF3LWNsb3NlLWFuYWx5dGljc1wiIHN0eWxlPVwiXG4gICAgICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4wNSk7IGNvbG9yOiAjY2JkNWUxOyBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMTIpO1xuICAgICAgICAgICAgICAgICAgICBwYWRkaW5nOiA2cHggMTJweDsgYm9yZGVyLXJhZGl1czogOHB4OyBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICAgICAgICAgICAgICAgIGZvbnQtc2l6ZTogMTJweDsgZm9udC13ZWlnaHQ6IDYwMDsgdHJhbnNpdGlvbjogYWxsIDAuMTVzO1xuICAgICAgICAgICAgICAgIFwiPuKclSBUdXR1cDwvYnV0dG9uPlxuICAgICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICAgIDwhLS0gU2Nyb2xsYWJsZSBDb250ZW50IEJvZHkgLS0+XG4gICAgICAgICAgICA8ZGl2IGlkPVwiYXctYW5hbHl0aWNzLWNvbnRlbnRcIiBzdHlsZT1cIlxuICAgICAgICAgICAgICAgIHBhZGRpbmc6IDE4cHggMjBweDtcbiAgICAgICAgICAgICAgICBvdmVyZmxvdy15OiBhdXRvO1xuICAgICAgICAgICAgICAgIGZsZXg6IDE7XG4gICAgICAgICAgICAgICAgb3ZlcnNjcm9sbC1iZWhhdmlvcjogY29udGFpbjtcbiAgICAgICAgICAgIFwiPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgIDwvZGl2PlxuICAgIGA7XG5cbiAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKG1vZGFsKTtcblxuICAgIGZ1bmN0aW9uIGNsb3NlQW5hbHl0aWNzKCkge1xuICAgICAgICBtb2RhbC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgIH1cblxuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1jbG9zZS1hbmFseXRpY3MnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBjbG9zZUFuYWx5dGljcyk7XG4gICAgbW9kYWwuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBlID0+IHtcbiAgICAgICAgaWYgKGUudGFyZ2V0ID09PSBtb2RhbCkgY2xvc2VBbmFseXRpY3MoKTtcbiAgICB9KTtcblxuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBlID0+IHtcbiAgICAgICAgaWYgKGUua2V5ID09PSAnRXNjYXBlJyAmJiBtb2RhbC5zdHlsZS5kaXNwbGF5ID09PSAnZmxleCcpIHtcbiAgICAgICAgICAgIGNsb3NlQW5hbHl0aWNzKCk7XG4gICAgICAgIH1cbiAgICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG9wZW5BbmFseXRpY3Moc3RhdGUsIENPTkZJRywgd29ya0hpc3RvcnksIGN0eCkge1xuICAgIGNvbnN0IG1vZGFsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LWFuYWx5dGljcy1tb2RhbCcpO1xuICAgIGlmICghbW9kYWwpIHJldHVybjtcbiAgICB1cGRhdGVBbmFseXRpY3NWaWV3KHN0YXRlLCBDT05GSUcsIHdvcmtIaXN0b3J5LCBjdHgpO1xuICAgIG1vZGFsLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG59XG5cbi8vIOKUgOKUgOKUgCBEYXRhIEV4cG9ydCAmIFN5bmMg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbmZ1bmN0aW9uIGdldEV4cG9ydERhdGEoc3RhdGUsIENPTkZJRywgd29ya0hpc3RvcnkpIHtcbiAgICByZXR1cm4ge1xuICAgICAgICB2ZXJzaW9uOiAnNS4xMS4wJyxcbiAgICAgICAgZXhwb3J0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICBleHBvcnRlZEF0TG9jYWw6IG5ldyBEYXRlKCkudG9Mb2NhbGVTdHJpbmcoJ2lkLUlEJyksXG4gICAgICAgIHN0YXRzOiB7XG4gICAgICAgICAgICB0b3RhbFdvcmtlZDogc3RhdGUudG90YWxXb3JrZWQsXG4gICAgICAgICAgICB0b3RhbFdvcmtYUDogc3RhdGUudG90YWxXb3JrWFAsXG4gICAgICAgICAgICB3b3JrVG9kYXk6IHN0YXRlLndvcmtUb2RheSxcbiAgICAgICAgICAgIHhwVG9kYXk6IHN0YXRlLnhwVG9kYXksXG4gICAgICAgICAgICB0b3RhbEVuZXJneVNwZW50OiBzdGF0ZS50b3RhbEVuZXJneVNwZW50LFxuICAgICAgICAgICAgdG90YWxBY3R1YWxFbmVyZ3lTcGVudDogc3RhdGUudG90YWxBY3R1YWxFbmVyZ3lTcGVudCxcbiAgICAgICAgICAgIHRvdGFsRXN0aW1hdGVkRW5lcmd5U3BlbnQ6IHN0YXRlLnRvdGFsRXN0aW1hdGVkRW5lcmd5U3BlbnQsXG4gICAgICAgICAgICBsYXN0V29ya0RhdGU6IHN0YXRlLmxhc3RXb3JrRGF0ZSxcbiAgICAgICAgICAgIGxhc3RXb3JrVGltZTogc3RhdGUubGFzdFdvcmtUaW1lLFxuICAgICAgICAgICAgc2Vzc2lvblN0YXJ0VGltZTogc3RhdGUuc2Vzc2lvblN0YXJ0VGltZSxcbiAgICAgICAgICAgIGN1cnJlbnRFbmVyZ3k6IHN0YXRlLmN1cnJlbnRFbmVyZ3ksXG4gICAgICAgICAgICBtYXhFbmVyZ3k6IHN0YXRlLm1heEVuZXJneSxcbiAgICAgICAgICAgIHBsYXllckxldmVsOiBzdGF0ZS5wbGF5ZXJMZXZlbFxuICAgICAgICB9LFxuICAgICAgICB3b3JrSGlzdG9yeTogbG9hZFdvcmtIaXN0b3J5KHN0YXRlLCBDT05GSUcpLFxuICAgICAgICBjb25maWc6IENPTkZJR1xuICAgIH07XG59XG5cbmZ1bmN0aW9uIGNvcHlFeHBvcnRUb0NsaXBib2FyZChidG5FbGVtZW50LCBzdGF0ZSwgQ09ORklHLCB3b3JrSGlzdG9yeSwgY3R4KSB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgZGF0YVN0ciA9IEpTT04uc3RyaW5naWZ5KGdldEV4cG9ydERhdGEoc3RhdGUsIENPTkZJRywgd29ya0hpc3RvcnkpLCBudWxsLCAyKTtcbiAgICAgICAgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQoZGF0YVN0cikudGhlbigoKSA9PiB7XG4gICAgICAgICAgICBpZiAoYnRuRWxlbWVudCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IG9yaWdpbmFsVGV4dCA9IGJ0bkVsZW1lbnQuaW5uZXJIVE1MO1xuICAgICAgICAgICAgICAgIGJ0bkVsZW1lbnQuaW5uZXJIVE1MID0gJ+KchSBCZXJoYXNpbCBEaXNhbGluISc7XG4gICAgICAgICAgICAgICAgYnRuRWxlbWVudC5zdHlsZS5iYWNrZ3JvdW5kID0gJ2xpbmVhci1ncmFkaWVudCgxMzVkZWcsICMwMGZmODgsICMwMGFhNTUpJztcbiAgICAgICAgICAgICAgICBidG5FbGVtZW50LnN0eWxlLmNvbG9yID0gJyMwMDAnO1xuICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBidG5FbGVtZW50LmlubmVySFRNTCA9IG9yaWdpbmFsVGV4dDtcbiAgICAgICAgICAgICAgICAgICAgYnRuRWxlbWVudC5zdHlsZS5iYWNrZ3JvdW5kID0gJ2xpbmVhci1ncmFkaWVudCgxMzVkZWcsICMwMDg4ZmYsICMwMDU1Y2MpJztcbiAgICAgICAgICAgICAgICAgICAgYnRuRWxlbWVudC5zdHlsZS5jb2xvciA9ICcjZmZmJztcbiAgICAgICAgICAgICAgICB9LCAyMDAwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGN0eD8ubG9nPy4oJ/Cfk4sgRGF0YSBib3QgYmVyaGFzaWwgZGlleHBvcnQgZGFuIGRpc2FsaW4ga2UgY2xpcGJvYXJkLicsICdzdWNjZXNzJyk7XG4gICAgICAgIH0pLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAgIHByb21wdCgnU2FsaW4gZGF0YSBKU09OIGJlcmlrdXQgc2VjYXJhIG1hbnVhbDonLCBkYXRhU3RyKTtcbiAgICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gZXhwb3J0IGRhdGE6JywgZSk7XG4gICAgICAgIGN0eD8ubG9nPy4oJ0dhZ2FsIGV4cG9ydCBkYXRhOiAnICsgZS5tZXNzYWdlLCAnZXJyb3InKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGRvd25sb2FkRXhwb3J0RmlsZShzdGF0ZSwgQ09ORklHLCB3b3JrSGlzdG9yeSwgY3R4KSB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgZGF0YVN0ciA9IEpTT04uc3RyaW5naWZ5KGdldEV4cG9ydERhdGEoc3RhdGUsIENPTkZJRywgd29ya0hpc3RvcnkpLCBudWxsLCAyKTtcbiAgICAgICAgY29uc3QgYmxvYiA9IG5ldyBCbG9iKFtkYXRhU3RyXSwgeyB0eXBlOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgICAgIGNvbnN0IHVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG4gICAgICAgIGNvbnN0IGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG4gICAgICAgIGNvbnN0IGRhdGVTdHIgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkuc2xpY2UoMCwgMTApO1xuICAgICAgICBhLmhyZWYgPSB1cmw7XG4gICAgICAgIGEuZG93bmxvYWQgPSBgcGFybGFtZW50dW1fYm90X2JhY2t1cF8ke2RhdGVTdHJ9Lmpzb25gO1xuICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGEpO1xuICAgICAgICBhLmNsaWNrKCk7XG4gICAgICAgIGRvY3VtZW50LmJvZHkucmVtb3ZlQ2hpbGQoYSk7XG4gICAgICAgIFVSTC5yZXZva2VPYmplY3RVUkwodXJsKTtcbiAgICAgICAgY3R4Py5sb2c/Lign8J+SviBGaWxlIGJhY2t1cCBKU09OIGJlcmhhc2lsIGRpZG93bmxvYWQuJywgJ3N1Y2Nlc3MnKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBkb3dubG9hZCBiYWNrdXA6JywgZSk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBpbXBvcnREYXRhRnJvbUpTT04oanNvblN0cmluZywgc3RhdGUsIENPTkZJRywgd29ya0hpc3RvcnksIGN0eCkge1xuICAgIHRyeSB7XG4gICAgICAgIGlmICghanNvblN0cmluZyB8fCAhanNvblN0cmluZy50cmltKCkpIHtcbiAgICAgICAgICAgIGFsZXJ0KCfimqDvuI8gU2lsYWthbiBwYXN0ZSBrb2RlIEpTT04gYmFja3VwIHRlcmxlYmloIGRhaHVsdS4nKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKGpzb25TdHJpbmcudHJpbSgpKTtcbiAgICAgICAgaWYgKCFpc1BsYWluT2JqZWN0KHBhcnNlZCkpIHRocm93IG5ldyBFcnJvcignRm9ybWF0IEpTT04gdGlkYWsgdmFsaWQnKTtcblxuICAgICAgICBjb25zdCB1cGRhdGVzID0gW107XG4gICAgICAgIGNvbnN0IHN0YXRlVXBkYXRlcyA9IHt9O1xuICAgICAgICBpZiAocGFyc2VkLnN0YXRzICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGlmICghaXNQbGFpbk9iamVjdChwYXJzZWQuc3RhdHMpKSB0aHJvdyBuZXcgRXJyb3IoJ0Zvcm1hdCBzdGF0aXN0aWsgdGlkYWsgdmFsaWQnKTtcbiAgICAgICAgICAgIGNvbnN0IG51bWVyaWNTdGF0cyA9IFsndG90YWxXb3JrZWQnLCAndG90YWxXb3JrWFAnLCAnd29ya1RvZGF5JywgJ3hwVG9kYXknLCAndG90YWxFbmVyZ3lTcGVudCcsICd0b3RhbEFjdHVhbEVuZXJneVNwZW50JywgJ3RvdGFsRXN0aW1hdGVkRW5lcmd5U3BlbnQnXTtcbiAgICAgICAgICAgIGZvciAoY29uc3Qga2V5IG9mIG51bWVyaWNTdGF0cykge1xuICAgICAgICAgICAgICAgIGlmIChwYXJzZWQuc3RhdHNba2V5XSA9PT0gdW5kZWZpbmVkKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICBpZiAoIU51bWJlci5pc1NhZmVJbnRlZ2VyKHBhcnNlZC5zdGF0c1trZXldKSB8fCBwYXJzZWQuc3RhdHNba2V5XSA8IDApIHRocm93IG5ldyBFcnJvcihgTmlsYWkgJHtrZXl9IHRpZGFrIHZhbGlkYCk7XG4gICAgICAgICAgICAgICAgdXBkYXRlcy5wdXNoKFtrZXksIHBhcnNlZC5zdGF0c1trZXldLnRvU3RyaW5nKCldKTtcbiAgICAgICAgICAgICAgICBzdGF0ZVVwZGF0ZXNba2V5XSA9IHBhcnNlZC5zdGF0c1trZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHBhcnNlZC5zdGF0cy5sYXN0V29ya0RhdGUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGRhdGUgPSBwYXJzZWQuc3RhdHMubGFzdFdvcmtEYXRlO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgZGF0ZSAhPT0gJ3N0cmluZycgfHwgbmV3IERhdGUoZGF0ZSkudG9EYXRlU3RyaW5nKCkgIT09IGRhdGUpIHRocm93IG5ldyBFcnJvcignVGFuZ2dhbCBrZXJqYSB0aWRhayB2YWxpZCcpO1xuICAgICAgICAgICAgICAgIHVwZGF0ZXMucHVzaChbJ2xhc3RXb3JrRGF0ZScsIGRhdGVdKTtcbiAgICAgICAgICAgICAgICBzdGF0ZVVwZGF0ZXMubGFzdFdvcmtEYXRlID0gZGF0ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChwYXJzZWQuc3RhdHMubGFzdFdvcmtUaW1lICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHBhcnNlZC5zdGF0cy5sYXN0V29ya1RpbWUgIT09ICdzdHJpbmcnIHx8IHBhcnNlZC5zdGF0cy5sYXN0V29ya1RpbWUubGVuZ3RoID4gMTAwKSB0aHJvdyBuZXcgRXJyb3IoJ1dha3R1IGtlcmphIHRpZGFrIHZhbGlkJyk7XG4gICAgICAgICAgICAgICAgdXBkYXRlcy5wdXNoKFsnbGFzdFdvcmtUaW1lJywgcGFyc2VkLnN0YXRzLmxhc3RXb3JrVGltZV0pO1xuICAgICAgICAgICAgICAgIHN0YXRlVXBkYXRlcy5sYXN0V29ya1RpbWUgPSBwYXJzZWQuc3RhdHMubGFzdFdvcmtUaW1lO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHBhcnNlZC5zdGF0cy5zZXNzaW9uU3RhcnRUaW1lICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBpZiAoIU51bWJlci5pc1NhZmVJbnRlZ2VyKHBhcnNlZC5zdGF0cy5zZXNzaW9uU3RhcnRUaW1lKSB8fCBwYXJzZWQuc3RhdHMuc2Vzc2lvblN0YXJ0VGltZSA8PSAwKSB0aHJvdyBuZXcgRXJyb3IoJ1dha3R1IHNlc2kgdGlkYWsgdmFsaWQnKTtcbiAgICAgICAgICAgICAgICB1cGRhdGVzLnB1c2goWydzZXNzaW9uU3RhcnRUaW1lJywgcGFyc2VkLnN0YXRzLnNlc3Npb25TdGFydFRpbWUudG9TdHJpbmcoKV0pO1xuICAgICAgICAgICAgICAgIHN0YXRlVXBkYXRlcy5zZXNzaW9uU3RhcnRUaW1lID0gcGFyc2VkLnN0YXRzLnNlc3Npb25TdGFydFRpbWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBuZXh0U3RhdHMgPSB7IC4uLnN0YXRlLCAuLi5zdGF0ZVVwZGF0ZXMgfTtcbiAgICAgICAgICAgIGlmIChuZXh0U3RhdHMud29ya1RvZGF5ID4gbmV4dFN0YXRzLnRvdGFsV29ya2VkIHx8IG5leHRTdGF0cy54cFRvZGF5ID4gbmV4dFN0YXRzLnRvdGFsV29ya1hQKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDb3VudGVyIGhhcmlhbiB0aWRhayBib2xlaCBtZWxlYmloaSBha3VtdWxhc2kgdG90YWwnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBpbXBvcnRlZEhpc3Rvcnk7XG4gICAgICAgIGlmIChwYXJzZWQud29ya0hpc3RvcnkgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgaW1wb3J0ZWRIaXN0b3J5ID0gbm9ybWFsaXplV29ya0hpc3RvcnkocGFyc2VkLndvcmtIaXN0b3J5KTtcbiAgICAgICAgICAgIGlmICghaW1wb3J0ZWRIaXN0b3J5KSB0aHJvdyBuZXcgRXJyb3IoJ0Zvcm1hdCBoaXN0b3J5IGtlcmphIHRpZGFrIHZhbGlkJyk7XG4gICAgICAgICAgICBjb25zdCBpbXBvcnRlZFZlcnNpb25QYXJ0cyA9IFN0cmluZyhwYXJzZWQudmVyc2lvbiA/PyAnJykuc3BsaXQoJy4nKS5tYXAoTnVtYmVyKTtcbiAgICAgICAgICAgIGNvbnN0IFtpbXBvcnRlZE1ham9yLCBpbXBvcnRlZE1pbm9yLCBpbXBvcnRlZFBhdGNoXSA9IGltcG9ydGVkVmVyc2lvblBhcnRzO1xuICAgICAgICAgICAgY29uc3QgaXNMZWdhY3lJbXBvcnQgPSAhTnVtYmVyLmlzU2FmZUludGVnZXIoaW1wb3J0ZWRNYWpvcikgfHxcbiAgICAgICAgICAgICAgICAhTnVtYmVyLmlzU2FmZUludGVnZXIoaW1wb3J0ZWRNaW5vcikgfHxcbiAgICAgICAgICAgICAgICAhTnVtYmVyLmlzU2FmZUludGVnZXIoaW1wb3J0ZWRQYXRjaCkgfHxcbiAgICAgICAgICAgICAgICBpbXBvcnRlZE1ham9yIDwgNSB8fFxuICAgICAgICAgICAgICAgIChpbXBvcnRlZE1ham9yID09PSA1ICYmIChpbXBvcnRlZE1pbm9yIDwgOSB8fCAoaW1wb3J0ZWRNaW5vciA9PT0gOSAmJiBpbXBvcnRlZFBhdGNoIDwgOCkpKTtcbiAgICAgICAgICAgIGlmIChpc0xlZ2FjeUltcG9ydCkge1xuICAgICAgICAgICAgICAgIG1pZ3JhdGVMZWdhY3lFbmVyZ3lIaXN0b3J5KGltcG9ydGVkSGlzdG9yeSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBwcnVuZU9sZEhpc3RvcnkoaW1wb3J0ZWRIaXN0b3J5LCBDT05GSUcuaGlzdG9yeU1heERheXMpO1xuICAgICAgICAgICAgdXBkYXRlcy5wdXNoKFsnYXdfd29ya0hpc3RvcnknLCBKU09OLnN0cmluZ2lmeShpbXBvcnRlZEhpc3RvcnkpXSk7XG4gICAgICAgICAgICB1cGRhdGVzLnB1c2goWydhd19lbmVyZ3lTY2hlbWFWZXJzaW9uJywgJzInXSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocGFyc2VkLnN0YXRzICE9PSB1bmRlZmluZWQgJiYgaW1wb3J0ZWRIaXN0b3J5KSB7XG4gICAgICAgICAgICBjb25zdCB0b2RheUtleSA9IG5ldyBEYXRlKCkudG9EYXRlU3RyaW5nKCk7XG4gICAgICAgICAgICBjb25zdCBpbXBvcnRlZFRvZGF5ID0gaW1wb3J0ZWRIaXN0b3J5W3RvZGF5S2V5XTtcbiAgICAgICAgICAgIGlmIChpbXBvcnRlZFRvZGF5ICYmIChcbiAgICAgICAgICAgICAgICBpbXBvcnRlZFRvZGF5LnNoaWZ0cyAhPT0gKHN0YXRlVXBkYXRlcy53b3JrVG9kYXkgPz8gc3RhdGUud29ya1RvZGF5KSB8fFxuICAgICAgICAgICAgICAgIGltcG9ydGVkVG9kYXkueHAgIT09IChzdGF0ZVVwZGF0ZXMueHBUb2RheSA/PyBzdGF0ZS54cFRvZGF5KVxuICAgICAgICAgICAgKSkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignSGlzdG9yeSBoYXJpIGluaSB0aWRhayBjb2NvayBkZW5nYW4gY291bnRlciBzdGF0aXN0aWsnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBpbXBvcnRlZENvbmZpZztcbiAgICAgICAgaWYgKHBhcnNlZC5jb25maWcgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgaW1wb3J0ZWRDb25maWcgPSBub3JtYWxpemVDb25maWcocGFyc2VkLmNvbmZpZywgdHJ1ZSk7XG4gICAgICAgICAgICBpZiAoIWltcG9ydGVkQ29uZmlnKSB0aHJvdyBuZXcgRXJyb3IoJ0Zvcm1hdCBrb25maWd1cmFzaSB0aWRhayB2YWxpZCcpO1xuICAgICAgICAgICAgdXBkYXRlcy5wdXNoKFsnYXdfY29uZmlnJywgSlNPTi5zdHJpbmdpZnkoaW1wb3J0ZWRDb25maWcpXSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodXBkYXRlcy5sZW5ndGggPT09IDApIHRocm93IG5ldyBFcnJvcignVGlkYWsgYWRhIGRhdGEgc3RhdGlzdGlrIGF0YXUga29uZmlndXJhc2kgeWFuZyB2YWxpZCBkaXRlbXVrYW4gZGFsYW0gSlNPTi4nKTtcblxuICAgICAgICB1cGRhdGVzLmZvckVhY2goKFtrZXksIHZhbHVlXSkgPT4gc2V0VmFsdWUoa2V5LCB2YWx1ZSkpO1xuICAgICAgICBPYmplY3QuYXNzaWduKHN0YXRlLCBzdGF0ZVVwZGF0ZXMpO1xuICAgICAgICBpZiAoaW1wb3J0ZWRIaXN0b3J5ICYmIHdvcmtIaXN0b3J5KSB7XG4gICAgICAgICAgICBPYmplY3Qua2V5cyh3b3JrSGlzdG9yeSkuZm9yRWFjaChrID0+IGRlbGV0ZSB3b3JrSGlzdG9yeVtrXSk7XG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKHdvcmtIaXN0b3J5LCBpbXBvcnRlZEhpc3RvcnkpO1xuICAgICAgICB9XG5cbiAgICAgICAgY3R4Py5sb2c/Lign4pyFIERhdGEgYmVyaGFzaWwgZGktaW1wb3J0IGRhbiBkaXNpbmtyb25rYW4hIEhhbGFtYW4gYWthbiBkaS1yZWZyZXNoLi4uJywgJ3N1Y2Nlc3MnKTtcbiAgICAgICAgYWxlcnQoJ+KchSBCZXJoYXNpbCBJbXBvcnQgJiBTaW5rcm9uaXNhc2kgRGF0YSFcXG5cXG5IYWxhbWFuIGFrYW4gZGktcmVmcmVzaCB1bnR1ayBtZW5lcmFwa2FuIGRhdGEgYmFydS4nKTtcbiAgICAgICAgbG9jYXRpb24ucmVsb2FkKCk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgYWxlcnQoJ+KdjCBHYWdhbCBJbXBvcnQgRGF0YTogRm9ybWF0IEpTT04gdGlkYWsgdmFsaWQuXFxuXFxuRGV0YWlsOiAnICsgZS5tZXNzYWdlKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbn1cblxuLy8g4pSA4pSA4pSAIEFuYWx5dGljcyBWaWV3IFJlbmRlcmluZyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZUFuYWx5dGljc1ZpZXcoc3RhdGUsIENPTkZJRywgd29ya0hpc3RvcnksIGN0eCkge1xuICAgIGNvbnN0IGNvbnRlbnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctYW5hbHl0aWNzLWNvbnRlbnQnKTtcbiAgICBpZiAoIWNvbnRlbnQpIHJldHVybjtcblxuICAgIC8vIFJlbG9hZCBmcmVzaCBoaXN0b3J5IHNldGlhcCBrYWxpIGFuYWx5dGljcyBkaWJ1a2FcbiAgICBjb25zdCBhY3RpdmVIaXN0b3J5ID0gbG9hZFdvcmtIaXN0b3J5KHN0YXRlLCBDT05GSUcpO1xuICAgIGlmICh3b3JrSGlzdG9yeSkge1xuICAgICAgICBPYmplY3Qua2V5cyh3b3JrSGlzdG9yeSkuZm9yRWFjaChrID0+IGRlbGV0ZSB3b3JrSGlzdG9yeVtrXSk7XG4gICAgICAgIE9iamVjdC5hc3NpZ24od29ya0hpc3RvcnksIGFjdGl2ZUhpc3RvcnkpO1xuICAgIH1cblxuICAgIGNvbnN0IGF2Z1hQUGVyV29yayA9IHN0YXRlLnRvdGFsV29ya2VkID4gMFxuICAgICAgICA/IChzdGF0ZS50b3RhbFdvcmtYUCAvIHN0YXRlLnRvdGFsV29ya2VkKS50b0ZpeGVkKDEpXG4gICAgICAgIDogJzAuMCc7XG5cbiAgICAvLyDwn4yfIEdFTkVSQVRFIDctREFZIEhJU1RPUlkgR1JBUEggREFUQVxuICAgIGNvbnN0IGN1cnJlbnRUb2RheVN0ciA9IG5ldyBEYXRlKCkudG9EYXRlU3RyaW5nKCk7XG4gICAgY29uc3QgbGFzdDdEYXlzID0gW107XG4gICAgZm9yIChsZXQgaSA9IDY7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgIGNvbnN0IGQgPSBuZXcgRGF0ZSgpO1xuICAgICAgICBkLnNldERhdGUoZC5nZXREYXRlKCkgLSBpKTtcbiAgICAgICAgY29uc3Qga2V5ID0gZC50b0RhdGVTdHJpbmcoKTtcbiAgICAgICAgY29uc3QgZGF0ZUxhYmVsID0gZC50b0xvY2FsZURhdGVTdHJpbmcoJ2lkLUlEJywgeyBkYXk6ICcyLWRpZ2l0JywgbW9udGg6ICcyLWRpZ2l0JyB9KTtcbiAgICAgICAgY29uc3QgZGF5TmFtZSA9IGQudG9Mb2NhbGVEYXRlU3RyaW5nKCdpZC1JRCcsIHsgd2Vla2RheTogJ3Nob3J0JyB9KTtcbiAgICAgICAgY29uc3QgZGF5RGF0YSA9IGFjdGl2ZUhpc3Rvcnlba2V5XSB8fCB7IHNoaWZ0czogMCwgeHA6IDAgfTtcbiAgICAgICAgbGFzdDdEYXlzLnB1c2goe1xuICAgICAgICAgICAga2V5LFxuICAgICAgICAgICAgZGF0ZUxhYmVsLFxuICAgICAgICAgICAgZGF5TmFtZSxcbiAgICAgICAgICAgIHNoaWZ0czogZGF5RGF0YS5zaGlmdHMgfHwgMCxcbiAgICAgICAgICAgIHhwOiBkYXlEYXRhLnhwIHx8IDAsXG4gICAgICAgICAgICBlbmVyZ3lTcGVudDogTnVtYmVyLmlzU2FmZUludGVnZXIoZGF5RGF0YS5lbmVyZ3lTcGVudCkgPyBkYXlEYXRhLmVuZXJneVNwZW50IDogbnVsbCxcbiAgICAgICAgICAgIGVzdGltYXRlZEVuZXJneVNwZW50OiBOdW1iZXIuaXNTYWZlSW50ZWdlcihkYXlEYXRhLmVzdGltYXRlZEVuZXJneVNwZW50KSA/IGRheURhdGEuZXN0aW1hdGVkRW5lcmd5U3BlbnQgOiAwLFxuICAgICAgICAgICAgZW5lcmd5RGF0YVNoaWZ0czogTnVtYmVyLmlzU2FmZUludGVnZXIoZGF5RGF0YS5lbmVyZ3lEYXRhU2hpZnRzKSA/IGRheURhdGEuZW5lcmd5RGF0YVNoaWZ0cyA6IDBcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgdG9kYXlEYXRhID0gbGFzdDdEYXlzW2xhc3Q3RGF5cy5sZW5ndGggLSAxXTtcbiAgICBjb25zdCBwcmV2aW91c0RheURhdGEgPSBsYXN0N0RheXNbbGFzdDdEYXlzLmxlbmd0aCAtIDJdO1xuICAgIGNvbnN0IHNoaWZ0c0NvbXBhcmVkVG9ZZXN0ZXJkYXkgPSB0b2RheURhdGEuc2hpZnRzIC0gcHJldmlvdXNEYXlEYXRhLnNoaWZ0cztcbiAgICBjb25zdCB4cENvbXBhcmVkVG9ZZXN0ZXJkYXkgPSB0b2RheURhdGEueHAgLSBwcmV2aW91c0RheURhdGEueHA7XG4gICAgY29uc3QgdG9kYXlBdmVyYWdlWFBQZXJXb3JrID0gc3RhdGUud29ya1RvZGF5ID4gMFxuICAgICAgICA/IChzdGF0ZS54cFRvZGF5IC8gc3RhdGUud29ya1RvZGF5KS50b0ZpeGVkKDEpXG4gICAgICAgIDogJzAuMCc7XG4gICAgY29uc3QgbGFzdDdEYXlUb3RhbHMgPSBsYXN0N0RheXMucmVkdWNlKCh0b3RhbHMsIGRheSkgPT4gKHtcbiAgICAgICAgc2hpZnRzOiB0b3RhbHMuc2hpZnRzICsgZGF5LnNoaWZ0cyxcbiAgICAgICAgeHA6IHRvdGFscy54cCArIGRheS54cCxcbiAgICAgICAgZW5lcmd5U3BlbnQ6IHRvdGFscy5lbmVyZ3lTcGVudCArIChkYXkuZW5lcmd5U3BlbnQgfHwgMCksXG4gICAgICAgIGVzdGltYXRlZEVuZXJneVNwZW50OiB0b3RhbHMuZXN0aW1hdGVkRW5lcmd5U3BlbnQgKyBkYXkuZXN0aW1hdGVkRW5lcmd5U3BlbnQsXG4gICAgICAgIGVuZXJneURhdGFTaGlmdHM6IHRvdGFscy5lbmVyZ3lEYXRhU2hpZnRzICsgZGF5LmVuZXJneURhdGFTaGlmdHNcbiAgICB9KSwgeyBzaGlmdHM6IDAsIHhwOiAwLCBlbmVyZ3lTcGVudDogMCwgZXN0aW1hdGVkRW5lcmd5U3BlbnQ6IDAsIGVuZXJneURhdGFTaGlmdHM6IDAgfSk7XG4gICAgY29uc3QgYXZlcmFnZVNoaWZ0c1BlckRheSA9IChsYXN0N0RheVRvdGFscy5zaGlmdHMgLyBsYXN0N0RheXMubGVuZ3RoKS50b0ZpeGVkKDEpO1xuICAgIGNvbnN0IGF2ZXJhZ2VYUFBlckRheSA9IE1hdGgucm91bmQobGFzdDdEYXlUb3RhbHMueHAgLyBsYXN0N0RheXMubGVuZ3RoKTtcblxuICAgIGNvbnN0IG1heFNoaWZ0cyA9IE1hdGgubWF4KDEsIC4uLmxhc3Q3RGF5cy5tYXAoZCA9PiBkLnNoaWZ0cykpO1xuICAgIGNvbnN0IG1heFhwID0gTWF0aC5tYXgoMSwgLi4ubGFzdDdEYXlzLm1hcChkID0+IGQueHApKTtcbiAgICBjb25zdCBtYXhFbmVyZ3lTcGVudCA9IE1hdGgubWF4KDEsIC4uLmxhc3Q3RGF5cy5tYXAoZCA9PiBkLmVuZXJneVNwZW50IHx8IDApKTtcblxuICAgIC8vIPCfjJ8gR1JBUEggREVOR0FOIE1PREVSTiBHTE9XIEJBUlMgJiBUT09MVElQXG4gICAgbGV0IGdyYXBoSFRNTCA9IGA8ZGl2IGNsYXNzPVwiYXctZ3JhcGgtY29udGFpbmVyXCI+YDtcbiAgICBncmFwaEhUTUwgKz0gYDxkaXYgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47IGFsaWduLWl0ZW1zOiBmbGV4LWVuZDsgaGVpZ2h0OiAxNDBweDsgZ2FwOiA4cHg7IHBhZGRpbmc6IDEwcHggNHB4IDZweDsgYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkIHJnYmEoMjU1LDI1NSwyNTUsMC4wOCk7IG1hcmdpbi1ib3R0b206IDEwcHg7XCI+YDtcblxuICAgIGxhc3Q3RGF5cy5mb3JFYWNoKChkYXksIGluZGV4KSA9PiB7XG4gICAgICAgIGNvbnN0IHNoaWZ0SGVpZ2h0ID0gTWF0aC5tYXgoZGF5LnNoaWZ0cyA+IDAgPyA4IDogMiwgTWF0aC5yb3VuZCgoZGF5LnNoaWZ0cyAvIG1heFNoaWZ0cykgKiAxMDApKTtcbiAgICAgICAgY29uc3QgeHBIZWlnaHQgPSBNYXRoLm1heChkYXkueHAgPiAwID8gOCA6IDIsIE1hdGgucm91bmQoKGRheS54cCAvIG1heFhwKSAqIDEwMCkpO1xuICAgICAgICBjb25zdCBlbmVyZ3lIZWlnaHQgPSBkYXkuZW5lcmd5U3BlbnQgPT09IG51bGwgfHwgKGRheS5lbmVyZ3lTcGVudCA9PT0gMCAmJiBkYXkuZXN0aW1hdGVkRW5lcmd5U3BlbnQgPiAwKVxuICAgICAgICAgICAgPyAwXG4gICAgICAgICAgICA6IE1hdGgubWF4KGRheS5lbmVyZ3lTcGVudCA+IDAgPyA4IDogMiwgTWF0aC5yb3VuZCgoZGF5LmVuZXJneVNwZW50IC8gbWF4RW5lcmd5U3BlbnQpICogMTAwKSk7XG4gICAgICAgIGNvbnN0IGlzVG9kYXkgPSBkYXkua2V5ID09PSBjdXJyZW50VG9kYXlTdHI7XG5cbiAgICAgICAgZ3JhcGhIVE1MICs9IGBcbiAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJmbGV4OiAxOyBkaXNwbGF5OiBmbGV4OyBmbGV4LWRpcmVjdGlvbjogY29sdW1uOyBhbGlnbi1pdGVtczogY2VudGVyOyBnYXA6IDRweDsgbWluLXdpZHRoOiAwOyAke2lzVG9kYXkgPyAnYmFja2dyb3VuZDogcmdiYSgwLCAyNTUsIDEzNiwgMC4wNSk7IGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMCwgMjU1LCAxMzYsIDAuMik7IGJvcmRlci1yYWRpdXM6IDhweDsgcGFkZGluZzogNHB4IDA7JyA6ICcnfVwiXG4gICAgICAgICAgICAgICAgIGlkPVwiZ3JhcGgtZGF5LSR7aW5kZXh9XCI+XG4gICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cIndpZHRoOiAxMDAlOyBkaXNwbGF5OiBmbGV4OyBnYXA6IDNweDsgYWxpZ24taXRlbXM6IGZsZXgtZW5kOyBoZWlnaHQ6IDk1cHg7IGp1c3RpZnktY29udGVudDogY2VudGVyO1wiPlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctZ3JhcGgtYmFyXCIgZGF0YS1kYXktaW5kZXg9XCIke2luZGV4fVwiIGRhdGEtdHlwZT1cInNoaWZ0XCIgZGF0YS12YWx1ZT1cIiR7ZGF5LnNoaWZ0c31cIiBzdHlsZT1cIndpZHRoOiAyOCU7IG1heC13aWR0aDogMTJweDsgYmFja2dyb3VuZDogJHtpc1RvZGF5ID8gJ2xpbmVhci1ncmFkaWVudCgxODBkZWcsICMwMGQ0ZmYsICMwMDY2Y2MpJyA6ICcjMjUzNTRkJ307XG4gICAgICAgICAgICAgICAgICAgICAgICAgaGVpZ2h0OiAke3NoaWZ0SGVpZ2h0fSU7IGJveC1zaGFkb3c6ICR7aXNUb2RheSA/ICcwIDAgOHB4IHJnYmEoMCwgMjEyLCAyNTUsIDAuMyknIDogJ25vbmUnfTtcIj48L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWdyYXBoLWJhclwiIGRhdGEtZGF5LWluZGV4PVwiJHtpbmRleH1cIiBkYXRhLXR5cGU9XCJ4cFwiIGRhdGEtdmFsdWU9XCIke2RheS54cH1cIiBzdHlsZT1cIndpZHRoOiAyOCU7IG1heC13aWR0aDogMTJweDsgYmFja2dyb3VuZDogJHtpc1RvZGF5ID8gJ2xpbmVhci1ncmFkaWVudCgxODBkZWcsICMwMGZmODgsICMwMGFhNTUpJyA6ICcjMWU0MDMzJ307XG4gICAgICAgICAgICAgICAgICAgICAgICAgaGVpZ2h0OiAke3hwSGVpZ2h0fSU7IGJveC1zaGFkb3c6ICR7aXNUb2RheSA/ICcwIDAgOHB4IHJnYmEoMCwgMjU1LCAxMzYsIDAuMyknIDogJ25vbmUnfTtcIj48L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWdyYXBoLWJhclwiIGRhdGEtZGF5LWluZGV4PVwiJHtpbmRleH1cIiBkYXRhLXR5cGU9XCJlbmVyZ3lcIiBkYXRhLXZhbHVlPVwiJHtkYXkuZW5lcmd5U3BlbnQgPT09IG51bGwgPyAnbnVsbCcgOiBkYXkuZW5lcmd5U3BlbnR9XCIgc3R5bGU9XCJ3aWR0aDogMjglOyBtYXgtd2lkdGg6IDEycHg7IGJhY2tncm91bmQ6ICR7aXNUb2RheSA/ICdsaW5lYXItZ3JhZGllbnQoMTgwZGVnLCAjZmZiNTQ3LCAjZDk3NzA2KScgOiAnIzRhMzgyMCd9O1xuICAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodDogJHtlbmVyZ3lIZWlnaHR9JTsgY3Vyc29yOiAke2RheS5lbmVyZ3lTcGVudCA9PT0gbnVsbCA/ICdkZWZhdWx0JyA6ICdwb2ludGVyJ307IGJveC1zaGFkb3c6ICR7aXNUb2RheSA/ICcwIDAgOHB4IHJnYmEoMjU1LCAxODEsIDcxLCAwLjMpJyA6ICdub25lJ307XCI+PC9kaXY+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cImZvbnQtc2l6ZTogMTBweDsgY29sb3I6ICR7aXNUb2RheSA/ICcjMDBmZjg4JyA6ICcjY2JkNWUxJ307IGZvbnQtd2VpZ2h0OiAke2lzVG9kYXkgPyAnNzAwJyA6ICc1MDAnfTsgbWFyZ2luLXRvcDogNHB4O1wiPiR7ZGF5LmRhdGVMYWJlbH08L2Rpdj5cbiAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZm9udC1zaXplOiA5LjVweDsgY29sb3I6ICR7aXNUb2RheSA/ICcjOTRhM2I4JyA6ICcjNjQ3NDhiJ307XCI+JHtkYXkuc2hpZnRzfXg8L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICBgO1xuICAgIH0pO1xuXG4gICAgZ3JhcGhIVE1MICs9IGA8L2Rpdj5gO1xuXG4gICAgLy8gVG9vbHRpcCBjb250YWluZXJcbiAgICBncmFwaEhUTUwgKz0gYFxuICAgICAgICA8ZGl2IGlkPVwiZ3JhcGgtdG9vbHRpcFwiIHN0eWxlPVwiXG4gICAgICAgICAgICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gICAgICAgICAgICBiYWNrZ3JvdW5kOiByZ2JhKDEwLCAxNCwgMjQsIDAuOTYpO1xuICAgICAgICAgICAgYmFja2Ryb3AtZmlsdGVyOiBibHVyKDEwcHgpO1xuICAgICAgICAgICAgLXdlYmtpdC1iYWNrZHJvcC1maWx0ZXI6IGJsdXIoMTBweCk7XG4gICAgICAgICAgICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMTUpO1xuICAgICAgICAgICAgYm9yZGVyLXJhZGl1czogOHB4O1xuICAgICAgICAgICAgcGFkZGluZzogMTBweCAxNHB4O1xuICAgICAgICAgICAgZm9udC1zaXplOiAxMS41cHg7XG4gICAgICAgICAgICBjb2xvcjogI2ZmZjtcbiAgICAgICAgICAgIHBvaW50ZXItZXZlbnRzOiBub25lO1xuICAgICAgICAgICAgZGlzcGxheTogbm9uZTtcbiAgICAgICAgICAgIHotaW5kZXg6IDk5OTk7XG4gICAgICAgICAgICBib3gtc2hhZG93OiAwIDEwcHggMzBweCByZ2JhKDAsMCwwLDAuOCk7XG4gICAgICAgICAgICB3aGl0ZS1zcGFjZTogbm93cmFwO1xuICAgICAgICBcIj48L2Rpdj5cbiAgICAgICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6IGZsZXg7IGZsZXgtd3JhcDogd3JhcDsgZ2FwOiAxNnB4OyBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjsgZm9udC1zaXplOiAxMXB4OyBtYXJnaW4tdG9wOiA2cHg7XCI+XG4gICAgICAgICAgICA8c3BhbiBzdHlsZT1cImRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGdhcDogNnB4OyBjb2xvcjogI2NiZDVlMTtcIj48c3BhbiBzdHlsZT1cIndpZHRoOiAxMHB4OyBoZWlnaHQ6IDEwcHg7IGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsICMwMGQ0ZmYsICMwMDY2Y2MpOyBib3JkZXItcmFkaXVzOiAzcHg7IGRpc3BsYXk6IGlubGluZS1ibG9jaztcIj48L3NwYW4+IFNoaWZ0IEtlcmphPC9zcGFuPlxuICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBnYXA6IDZweDsgY29sb3I6ICNjYmQ1ZTE7XCI+PHNwYW4gc3R5bGU9XCJ3aWR0aDogMTBweDsgaGVpZ2h0OiAxMHB4OyBiYWNrZ3JvdW5kOiBsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjMDBmZjg4LCAjMDBhYTU1KTsgYm9yZGVyLXJhZGl1czogM3B4OyBkaXNwbGF5OiBpbmxpbmUtYmxvY2s7XCI+PC9zcGFuPiBXb3JrIFhQPC9zcGFuPlxuICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBnYXA6IDZweDsgY29sb3I6ICNjYmQ1ZTE7XCI+PHNwYW4gc3R5bGU9XCJ3aWR0aDogMTBweDsgaGVpZ2h0OiAxMHB4OyBiYWNrZ3JvdW5kOiBsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjZmZiNTQ3LCAjZDk3NzA2KTsgYm9yZGVyLXJhZGl1czogM3B4OyBkaXNwbGF5OiBpbmxpbmUtYmxvY2s7XCI+PC9zcGFuPiBFbmVyZ2kgRGlndW5ha2FuPC9zcGFuPlxuICAgICAgICA8L2Rpdj5cbiAgICA8L2Rpdj5gO1xuXG4gICAgY29uc3QgZm9ybWF0RGlmZiA9IChkaWZmLCB1bml0KSA9PiB7XG4gICAgICAgIGlmIChkaWZmID4gMCkgcmV0dXJuIGA8c3BhbiBzdHlsZT1cImNvbG9yOiAjMDBmZjg4OyBmb250LXdlaWdodDogNjAwO1wiPiske2RpZmZ9ICR7dW5pdH08L3NwYW4+YDtcbiAgICAgICAgaWYgKGRpZmYgPCAwKSByZXR1cm4gYDxzcGFuIHN0eWxlPVwiY29sb3I6ICNmZjZiNmI7IGZvbnQtd2VpZ2h0OiA2MDA7XCI+JHtkaWZmfSAke3VuaXR9PC9zcGFuPmA7XG4gICAgICAgIHJldHVybiBgPHNwYW4gc3R5bGU9XCJjb2xvcjogIzhiOWJiNDtcIj5TYW1hIGRnbiBrZW1hcmluPC9zcGFuPmA7XG4gICAgfTtcblxuICAgIGNvbnRlbnQuaW5uZXJIVE1MID0gYFxuICAgICAgICA8IS0tIFRvcCBLUEkgR3JpZDogNCBNZXRyaWMgQ2FyZHMgLS0+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJhdy1rcGktZ3JpZFwiPlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWtwaS1jYXJkXCI+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWtwaS1oZWFkZXJcIj5cbiAgICAgICAgICAgICAgICAgICAgPHNwYW4+U2hpZnQgSGFyaSBJbmk8L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuPvCfjq88L3NwYW4+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWtwaS12YWx1ZVwiIHN0eWxlPVwiY29sb3I6ICMwMGQ0ZmY7XCI+JHtzdGF0ZS53b3JrVG9kYXl9eDwvZGl2PlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1rcGktc3ViXCI+JHtmb3JtYXREaWZmKHNoaWZ0c0NvbXBhcmVkVG9ZZXN0ZXJkYXksICdzaGlmdCcpfTwvZGl2PlxuICAgICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1rcGktY2FyZFwiPlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1rcGktaGVhZGVyXCI+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuPlhQIEhhcmkgSW5pPC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8c3Bhbj7irZA8L3NwYW4+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LWtwaS12YWx1ZVwiIHN0eWxlPVwiY29sb3I6ICMwMGZmODg7XCI+KyR7c3RhdGUueHBUb2RheX08L2Rpdj5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXcta3BpLXN1YlwiPiR7Zm9ybWF0RGlmZih4cENvbXBhcmVkVG9ZZXN0ZXJkYXksICdYUCcpfTwvZGl2PlxuICAgICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1rcGktY2FyZFwiPlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1rcGktaGVhZGVyXCI+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuPlJhdGEtcmF0YSBYUDwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPHNwYW4+4pqhPC9zcGFuPlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1rcGktdmFsdWVcIiBzdHlsZT1cImNvbG9yOiAjZjFmNWY5O1wiPiR7dG9kYXlBdmVyYWdlWFBQZXJXb3JrfTwvZGl2PlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1rcGktc3ViXCI+WFAgcGVyIHNhdHUgc2hpZnQ8L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXcta3BpLWNhcmRcIj5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXcta3BpLWhlYWRlclwiPlxuICAgICAgICAgICAgICAgICAgICA8c3Bhbj5Ub3RhbCBTaGlmdDwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPHNwYW4+8J+Phjwvc3Bhbj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXcta3BpLXZhbHVlXCIgc3R5bGU9XCJjb2xvcjogI2E4NTVmNztcIj4ke3N0YXRlLnRvdGFsV29ya2VkfXg8L2Rpdj5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXcta3BpLXN1YlwiPiske3N0YXRlLnRvdGFsV29ya1hQfSBYUCB0b3RhbDwvZGl2PlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgIDwvZGl2PlxuXG4gICAgICAgIDwhLS0gNy1EYXkgVHJlbmQgQ2hhcnQgU2VjdGlvbiAtLT5cbiAgICAgICAgPGRpdiBjbGFzcz1cImF3LWFuYWx5dGljcy1zZWN0aW9uXCI+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctc2VjdGlvbi1oZWFkZXJcIj5cbiAgICAgICAgICAgICAgICA8ZGl2PlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXctc2VjdGlvbi10aXRsZVwiPvCfk4ggVHJlbiBBa3Rpdml0YXMgNyBIYXJpIFRlcmFraGlyPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1zZWN0aW9uLXN1YnRpdGxlXCI+VmlzdWFsaXNhc2kganVtbGFoIHNoaWZ0LCBYUCBrZXJqYSwgZGFuIGtvbnN1bXNpIGVuZXJnaTwvZGl2PlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJmb250LXNpemU6IDExcHg7IGNvbG9yOiAjMDBmZjg4OyBmb250LXdlaWdodDogNjAwO1wiPlJhdGEtcmF0YSAke2F2ZXJhZ2VTaGlmdHNQZXJEYXl9IHNoaWZ0L2hhcmk8L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgJHtncmFwaEhUTUx9XG4gICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTogZ3JpZDsgZ3JpZC10ZW1wbGF0ZS1jb2x1bW5zOiByZXBlYXQoMywgMWZyKTsgZ2FwOiAxMHB4OyBtYXJnaW4tdG9wOiA4cHg7IGZvbnQtc2l6ZTogMTEuNXB4OyBiYWNrZ3JvdW5kOiByZ2JhKDAsMCwwLDAuMjUpOyBwYWRkaW5nOiAxMHB4IDE0cHg7IGJvcmRlci1yYWRpdXM6IDhweDtcIj5cbiAgICAgICAgICAgICAgICA8ZGl2PlxuICAgICAgICAgICAgICAgICAgICA8c3BhbiBzdHlsZT1cImNvbG9yOiAjOGI5YmI0OyBmb250LXNpemU6IDEwLjVweDtcIj5Ba3VtdWxhc2kgNyBIYXJpOjwvc3Bhbj48YnI+XG4gICAgICAgICAgICAgICAgICAgIDxzdHJvbmcgc3R5bGU9XCJjb2xvcjogIzAwZDRmZjtcIj4ke2xhc3Q3RGF5VG90YWxzLnNoaWZ0c30gc2hpZnQ8L3N0cm9uZz4gwrcgPHN0cm9uZyBzdHlsZT1cImNvbG9yOiAjMDBmZjg4O1wiPiske2xhc3Q3RGF5VG90YWxzLnhwfSBYUDwvc3Ryb25nPlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIDxkaXY+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiY29sb3I6ICM4YjliYjQ7IGZvbnQtc2l6ZTogMTAuNXB4O1wiPlJhdGEtcmF0YSBIYXJpYW46PC9zcGFuPjxicj5cbiAgICAgICAgICAgICAgICAgICAgPHN0cm9uZyBzdHlsZT1cImNvbG9yOiAjMDBkNGZmO1wiPiR7YXZlcmFnZVNoaWZ0c1BlckRheX0gc2hpZnQ8L3N0cm9uZz4gwrcgPHN0cm9uZyBzdHlsZT1cImNvbG9yOiAjMDBmZjg4O1wiPiske2F2ZXJhZ2VYUFBlckRheX0gWFA8L3N0cm9uZz5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICA8ZGl2PlxuICAgICAgICAgICAgICAgICAgICA8c3BhbiBzdHlsZT1cImNvbG9yOiAjOGI5YmI0OyBmb250LXNpemU6IDEwLjVweDtcIj5Ub3RhbCBFbmVyZ2kgNyBIYXJpOjwvc3Bhbj48YnI+XG4gICAgICAgICAgICAgICAgICAgIDxzdHJvbmcgc3R5bGU9XCJjb2xvcjogI2ZmYjU0NztcIj4ke2xhc3Q3RGF5VG90YWxzLmVuZXJneVNwZW50fSDimqE8L3N0cm9uZz5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICA8L2Rpdj5cblxuICAgICAgICA8IS0tIExpZmV0aW1lIEFjY3VtdWxhdGlvbiBTZWN0aW9uIC0tPlxuICAgICAgICA8ZGl2IGNsYXNzPVwiYXctYW5hbHl0aWNzLXNlY3Rpb25cIj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1zZWN0aW9uLWhlYWRlclwiPlxuICAgICAgICAgICAgICAgIDxkaXY+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1zZWN0aW9uLXRpdGxlXCI+8J+MkCBBa3VtdWxhc2kgU2VwYW5qYW5nIFdha3R1PC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1zZWN0aW9uLXN1YnRpdGxlXCI+UmVrb3IgcGVuY2FwYWlhbiBzZWphayBib3QgcGVydGFtYSBrYWxpIGRpYWt0aWZrYW48L2Rpdj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6IGdyaWQ7IGdyaWQtdGVtcGxhdGUtY29sdW1uczogMWZyIDFmcjsgZ2FwOiAxMnB4OyBmb250LXNpemU6IDEycHg7XCI+XG4gICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cImJhY2tncm91bmQ6IHJnYmEoMjU1LDI1NSwyNTUsMC4wMik7IHBhZGRpbmc6IDEwcHggMTJweDsgYm9yZGVyLXJhZGl1czogOHB4OyBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDI1NSwyNTUsMjU1LDAuMDQpO1wiPlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiY29sb3I6ICM4YjliYjQ7IGZvbnQtc2l6ZTogMTFweDsgbWFyZ2luLWJvdHRvbTogMnB4O1wiPlRvdGFsIFNoaWZ0IFN1a3NlczwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZm9udC1zaXplOiAxNnB4OyBmb250LXdlaWdodDogNzAwOyBjb2xvcjogIzAwZDRmZjtcIj4ke3N0YXRlLnRvdGFsV29ya2VkfSBTaGlmdDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiY29sb3I6ICM2NDc0OGI7IGZvbnQtc2l6ZTogMTAuNXB4OyBtYXJnaW4tdG9wOiAycHg7XCI+UmF0YS1yYXRhOiAke2F2Z1hQUGVyV29ya30gWFAvc2hpZnQ8L2Rpdj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiYmFja2dyb3VuZDogcmdiYSgyNTUsMjU1LDI1NSwwLjAyKTsgcGFkZGluZzogMTBweCAxMnB4OyBib3JkZXItcmFkaXVzOiA4cHg7IGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMjU1LDI1NSwyNTUsMC4wNCk7XCI+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJjb2xvcjogIzhiOWJiNDsgZm9udC1zaXplOiAxMXB4OyBtYXJnaW4tYm90dG9tOiAycHg7XCI+VG90YWwgWFAgRGlrdW1wdWxrYW48L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cImZvbnQtc2l6ZTogMTZweDsgZm9udC13ZWlnaHQ6IDcwMDsgY29sb3I6ICMwMGZmODg7XCI+KyR7c3RhdGUudG90YWxXb3JrWFB9IFhQPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJjb2xvcjogIzY0NzQ4YjsgZm9udC1zaXplOiAxMC41cHg7IG1hcmdpbi10b3A6IDJweDtcIj5FbmVyZ2kgdGVydmVyaWZpa2FzaTogJHtzdGF0ZS50b3RhbEFjdHVhbEVuZXJneVNwZW50fSDimqE8L2Rpdj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICA8L2Rpdj5cblxuICAgICAgICA8IS0tIEJhY2t1cCAmIERhdGEgUmVjb3ZlcnkgU2VjdGlvbiAtLT5cbiAgICAgICAgPGRpdiBjbGFzcz1cImF3LWFuYWx5dGljcy1zZWN0aW9uXCIgc3R5bGU9XCJtYXJnaW4tYm90dG9tOiAwO1wiPlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LXNlY3Rpb24taGVhZGVyXCIgc3R5bGU9XCJtYXJnaW4tYm90dG9tOiA4cHg7XCI+XG4gICAgICAgICAgICAgICAgPGRpdj5cbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImF3LXNlY3Rpb24tdGl0bGVcIj7wn5K+IEJhY2t1cCAmIFBlbXVsaWhhbiBEYXRhPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1zZWN0aW9uLXN1YnRpdGxlXCI+U2ltcGFuIGF0YXUgcHVsaWhrYW4ga29uZmlndXJhc2kgYm90ICYgcml3YXlhdCBzaGlmdCBrZSBmaWxlIEpTT048L2Rpdj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6IGdyaWQ7IGdyaWQtdGVtcGxhdGUtY29sdW1uczogMWZyIDFmcjsgZ2FwOiAxMHB4OyBtYXJnaW4tYm90dG9tOiAxMHB4O1wiPlxuICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJhdy1idG4tZXhwb3J0LWNvcHlcIiBzdHlsZT1cIlxuICAgICAgICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiBsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjMDA4OGZmLCAjMDA1NWNjKTsgY29sb3I6ICNmZmY7IGJvcmRlcjogbm9uZTtcbiAgICAgICAgICAgICAgICAgICAgcGFkZGluZzogOXB4OyBib3JkZXItcmFkaXVzOiA4cHg7IGN1cnNvcjogcG9pbnRlcjsgZm9udC13ZWlnaHQ6IDYwMDsgZm9udC1zaXplOiAxMnB4O1xuICAgICAgICAgICAgICAgICAgICB0cmFuc2l0aW9uOiBhbGwgMC4xNXM7XG4gICAgICAgICAgICAgICAgXCI+8J+TiyBTYWxpbiBKU09OPC9idXR0b24+XG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBpZD1cImF3LWJ0bi1leHBvcnQtZG93bmxvYWRcIiBzdHlsZT1cIlxuICAgICAgICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiByZ2JhKDAsIDI1NSwgMTM2LCAwLjEpOyBjb2xvcjogIzAwZmY4ODsgYm9yZGVyOiAxcHggc29saWQgcmdiYSgwLCAyNTUsIDEzNiwgMC4zKTtcbiAgICAgICAgICAgICAgICAgICAgcGFkZGluZzogOXB4OyBib3JkZXItcmFkaXVzOiA4cHg7IGN1cnNvcjogcG9pbnRlcjsgZm9udC13ZWlnaHQ6IDYwMDsgZm9udC1zaXplOiAxMnB4O1xuICAgICAgICAgICAgICAgICAgICB0cmFuc2l0aW9uOiBhbGwgMC4xNXM7XG4gICAgICAgICAgICAgICAgXCI+8J+SviBVbmR1aCBGaWxlIEJhY2t1cDwvYnV0dG9uPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZGlzcGxheTogZmxleDsgZ2FwOiA4cHg7XCI+XG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBpZD1cImF3LWJ0bi10b2dnbGUtaW1wb3J0XCIgc3R5bGU9XCJcbiAgICAgICAgICAgICAgICAgICAgZmxleDogMTsgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjA0KTsgYm9yZGVyOiAxcHggZGFzaGVkIHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4xNSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbG9yOiAjY2JkNWUxOyBwYWRkaW5nOiA3cHggMTBweDsgYm9yZGVyLXJhZGl1czogNnB4OyBjdXJzb3I6IHBvaW50ZXI7IGZvbnQtc2l6ZTogMTFweDtcbiAgICAgICAgICAgICAgICAgICAgdHJhbnNpdGlvbjogYWxsIDAuMTVzO1xuICAgICAgICAgICAgICAgIFwiPvCfk6UgSW1wb3IgLyBQdWxpaGthbiBCYWNrdXA8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICA8YnV0dG9uIGlkPVwiYXctYnRuLXJlc2V0LXN0YXRzXCIgc3R5bGU9XCJcbiAgICAgICAgICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgyNTUsIDEwNywgMTA3LCAwLjEpOyBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDI1NSwgMTA3LCAxMDcsIDAuMjUpO1xuICAgICAgICAgICAgICAgICAgICBjb2xvcjogI2ZmODg4ODsgcGFkZGluZzogN3B4IDEycHg7IGJvcmRlci1yYWRpdXM6IDZweDsgY3Vyc29yOiBwb2ludGVyOyBmb250LXNpemU6IDExcHg7XG4gICAgICAgICAgICAgICAgICAgIHRyYW5zaXRpb246IGFsbCAwLjE1cztcbiAgICAgICAgICAgICAgICBcIj7wn5eR77iPIFJlc2V0IFN0YXRpc3RpazwvYnV0dG9uPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGlkPVwiYXctaW1wb3J0LXNlY3Rpb25cIiBzdHlsZT1cImRpc3BsYXk6IG5vbmU7IG1hcmdpbi10b3A6IDEycHg7IGJhY2tncm91bmQ6IHJnYmEoMCwwLDAsMC4zKTsgcGFkZGluZzogMTJweDsgYm9yZGVyLXJhZGl1czogOHB4OyBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDI1NSwyNTUsMjU1LDAuMDYpO1wiPlxuICAgICAgICAgICAgICAgIDx0ZXh0YXJlYSBpZD1cImF3LWltcG9ydC1pbnB1dFwiIHBsYWNlaG9sZGVyPVwiVGVtcGVsIGRhdGEgYmFja3VwIEpTT04gZGkgc2luaS4uLlwiIHN0eWxlPVwiXG4gICAgICAgICAgICAgICAgICAgIHdpZHRoOiAxMDAlOyBoZWlnaHQ6IDc1cHg7IGJhY2tncm91bmQ6ICMxMzE3MjQ7IGNvbG9yOiAjMDBmZjg4O1xuICAgICAgICAgICAgICAgICAgICBib3JkZXI6IDFweCBzb2xpZCAjMjgzMzRlOyBib3JkZXItcmFkaXVzOiA2cHg7IHBhZGRpbmc6IDhweDtcbiAgICAgICAgICAgICAgICAgICAgZm9udC1zaXplOiAxMXB4OyBmb250LWZhbWlseTogbW9ub3NwYWNlOyBib3gtc2l6aW5nOiBib3JkZXItYm94OyByZXNpemU6IHZlcnRpY2FsO1xuICAgICAgICAgICAgICAgIFwiPjwvdGV4dGFyZWE+XG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBpZD1cImF3LWJ0bi1hcHBseS1pbXBvcnRcIiBzdHlsZT1cIlxuICAgICAgICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiBsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjMDBmZjg4LCAjMDBhYTU1KTsgY29sb3I6ICMwNTBhMTQ7XG4gICAgICAgICAgICAgICAgICAgIGJvcmRlcjogbm9uZTsgcGFkZGluZzogOXB4OyBib3JkZXItcmFkaXVzOiA2cHg7IGN1cnNvcjogcG9pbnRlcjtcbiAgICAgICAgICAgICAgICAgICAgZm9udC13ZWlnaHQ6IDcwMDsgZm9udC1zaXplOiAxMnB4OyB3aWR0aDogMTAwJTsgbWFyZ2luLXRvcDogOHB4O1xuICAgICAgICAgICAgICAgIFwiPlRlcmFwa2FuIEJhY2t1cDwvYnV0dG9uPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgIDwvZGl2PlxuICAgIGA7XG5cbiAgICAvLyBUb29sdGlwIGhhbmRsZXJzXG4gICAgY29uc3Qgc2hvd0ZuID0gZnVuY3Rpb24oZGF5SW5kZXgsIHR5cGUsIHZhbHVlKSB7XG4gICAgICAgIGNvbnN0IHRvb2x0aXAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ3JhcGgtdG9vbHRpcCcpO1xuICAgICAgICBjb25zdCBkYXlEYXRhID0gbGFzdDdEYXlzW2RheUluZGV4XTtcbiAgICAgICAgaWYgKCF0b29sdGlwIHx8ICFkYXlEYXRhKSByZXR1cm47XG5cbiAgICAgICAgY29uc3QgbGFiZWxUZXh0ID0gdHlwZSA9PT0gJ3NoaWZ0JyA/ICdTaGlmdCBLZXJqYScgOiB0eXBlID09PSAneHAnID8gJ1dvcmsgWFAnIDogJ0VuZXJnaSBkaWd1bmFrYW4nO1xuICAgICAgICBjb25zdCB2YWx1ZVRleHQgPSB0eXBlID09PSAnc2hpZnQnID8gYCR7dmFsdWV9eCBzaGlmdGAgOiB0eXBlID09PSAneHAnID8gYCske3ZhbHVlfSBYUGAgOiBgJHt2YWx1ZX0g4pqhYDtcbiAgICAgICAgY29uc3QgY29sb3IgPSB0eXBlID09PSAnc2hpZnQnID8gJyMwMGQ0ZmYnIDogdHlwZSA9PT0gJ3hwJyA/ICcjMDBmZjg4JyA6ICcjZmZiNTQ3JztcblxuICAgICAgICB0b29sdGlwLmlubmVySFRNTCA9IGBcbiAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJmb250LXdlaWdodDogNzAwOyBtYXJnaW4tYm90dG9tOiA0cHg7IGNvbG9yOiAke2NvbG9yfTsgZm9udC1zaXplOiAxMnB4O1wiPiR7ZGF5RGF0YS5kYXlOYW1lfSwgJHtkYXlEYXRhLmRhdGVMYWJlbH08L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJtYXJnaW4tYm90dG9tOiAycHg7XCI+JHtsYWJlbFRleHR9OiA8c3BhbiBzdHlsZT1cImNvbG9yOiAke2NvbG9yfTsgZm9udC13ZWlnaHQ6IDcwMDtcIj4ke3ZhbHVlVGV4dH08L3NwYW4+PC9kaXY+XG4gICAgICAgICAgICA8ZGl2IHN0eWxlPVwiY29sb3I6ICNmZmI1NDc7IGZvbnQtc2l6ZTogMTAuNXB4O1wiPkVuZXJnaSBha3R1YWw6ICR7ZGF5RGF0YS5lbmVyZ3lTcGVudCA9PT0gbnVsbCA/ICdiZWx1bSB0ZXJjYXRhdCcgOiBgJHtkYXlEYXRhLmVuZXJneVNwZW50fSDimqFgfSR7ZGF5RGF0YS5lc3RpbWF0ZWRFbmVyZ3lTcGVudCA/IGAgKCR7ZGF5RGF0YS5lc3RpbWF0ZWRFbmVyZ3lTcGVudH0g4pqhIGVzdClgIDogJyd9PC9kaXY+XG4gICAgICAgICAgICA8ZGl2IHN0eWxlPVwiY29sb3I6ICM2NDc0OGI7IGZvbnQtc2l6ZTogMTBweDsgbWFyZ2luLXRvcDogMnB4O1wiPiR7TWF0aC5tYXgoMCwgZGF5RGF0YS5zaGlmdHMgLSBkYXlEYXRhLmVuZXJneURhdGFTaGlmdHMpfSBzaGlmdCB0YW5wYSBkYXRhIGVuZXJnaTwvZGl2PlxuICAgICAgICBgO1xuICAgICAgICB0b29sdGlwLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuICAgIH07XG5cbiAgICBjb25zdCBtb3ZlRm4gPSBmdW5jdGlvbihldmVudCkge1xuICAgICAgICBjb25zdCB0b29sdGlwID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dyYXBoLXRvb2x0aXAnKTtcbiAgICAgICAgaWYgKCF0b29sdGlwIHx8IHRvb2x0aXAuc3R5bGUuZGlzcGxheSA9PT0gJ25vbmUnKSByZXR1cm47XG5cbiAgICAgICAgY29uc3Qgd3JhcHBlciA9IHRvb2x0aXAucGFyZW50RWxlbWVudDtcbiAgICAgICAgaWYgKCF3cmFwcGVyKSByZXR1cm47XG4gICAgICAgIGNvbnN0IHdyYXBwZXJSZWN0ID0gd3JhcHBlci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblxuICAgICAgICBsZXQgbGVmdCA9IGV2ZW50LmNsaWVudFggLSB3cmFwcGVyUmVjdC5sZWZ0ICsgMTI7XG4gICAgICAgIGxldCB0b3AgPSBldmVudC5jbGllbnRZIC0gd3JhcHBlclJlY3QudG9wIC0gNjA7XG5cbiAgICAgICAgY29uc3QgdG9vbHRpcFdpZHRoID0gdG9vbHRpcC5vZmZzZXRXaWR0aCB8fCAxNDA7XG4gICAgICAgIGlmIChsZWZ0ICsgdG9vbHRpcFdpZHRoID4gd3JhcHBlclJlY3Qud2lkdGggLSA0KSB7XG4gICAgICAgICAgICBsZWZ0ID0gZXZlbnQuY2xpZW50WCAtIHdyYXBwZXJSZWN0LmxlZnQgLSB0b29sdGlwV2lkdGggLSAxMjtcbiAgICAgICAgfVxuICAgICAgICBpZiAodG9wIDwgNCkgdG9wID0gNDtcblxuICAgICAgICB0b29sdGlwLnN0eWxlLmxlZnQgPSBgJHtsZWZ0fXB4YDtcbiAgICAgICAgdG9vbHRpcC5zdHlsZS50b3AgPSBgJHt0b3B9cHhgO1xuICAgIH07XG5cbiAgICBjb25zdCBoaWRlRm4gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgY29uc3QgdG9vbHRpcCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdncmFwaC10b29sdGlwJyk7XG4gICAgICAgIGlmICh0b29sdGlwKSB0b29sdGlwLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgfTtcblxuICAgIGNvbnRlbnQucXVlcnlTZWxlY3RvckFsbCgnLmF3LWdyYXBoLWJhcicpLmZvckVhY2goYmFyID0+IHtcbiAgICAgICAgY29uc3QgZGF5SW5kZXggPSBOdW1iZXIoYmFyLmRhdGFzZXQuZGF5SW5kZXgpO1xuICAgICAgICBjb25zdCB0eXBlID0gYmFyLmRhdGFzZXQudHlwZTtcbiAgICAgICAgY29uc3QgcmF3VmFsID0gYmFyLmRhdGFzZXQudmFsdWU7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gcmF3VmFsID09PSAnbnVsbCcgPyBudWxsIDogTnVtYmVyKHJhd1ZhbCk7XG4gICAgICAgIGlmICh0eXBlID09PSAnZW5lcmd5JyAmJiB2YWx1ZSA9PT0gbnVsbCkgcmV0dXJuO1xuXG4gICAgICAgIGJhci5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWVudGVyJywgKCkgPT4gc2hvd0ZuKGRheUluZGV4LCB0eXBlLCB2YWx1ZSkpO1xuICAgICAgICBiYXIuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VsZWF2ZScsIGhpZGVGbik7XG4gICAgICAgIGJhci5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCBtb3ZlRm4pO1xuICAgIH0pO1xuXG4gICAgLy8gRXhwb3J0ICYgSW1wb3J0IGxpc3RlbmVyc1xuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1idG4tZXhwb3J0LWNvcHknKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBmdW5jdGlvbigpIHtcbiAgICAgICAgY29weUV4cG9ydFRvQ2xpcGJvYXJkKHRoaXMsIHN0YXRlLCBDT05GSUcsIHdvcmtIaXN0b3J5LCBjdHgpO1xuICAgIH0pO1xuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1idG4tZXhwb3J0LWRvd25sb2FkJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICBkb3dubG9hZEV4cG9ydEZpbGUoc3RhdGUsIENPTkZJRywgd29ya0hpc3RvcnksIGN0eCk7XG4gICAgfSk7XG5cbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctYnRuLXJlc2V0LXN0YXRzJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICBpZiAoc3RhdGUud29ya0luRmxpZ2h0KSB7XG4gICAgICAgICAgICBhbGVydCgnVHVuZ2d1IHJlcXVlc3Qga2VyamEgeWFuZyBzZWRhbmcgYmVyamFsYW4gc2VsZXNhaSBzZWJlbHVtIG1lcmVzZXQgc3RhdGlzdGlrLicpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzdGF0ZS53b3JrUmVzdWx0VW5jZXJ0YWluKSB7XG4gICAgICAgICAgICBhbGVydCgnSGFzaWwgcmVxdWVzdCBrZXJqYSBzZWJlbHVtbnlhIGJlbHVtIHBhc3RpLiBQZXJpa3NhIHN0YXR1c255YSBkaSBnYW1lIGRhbiBzZWxlc2Fpa2FuIGJhbm5lciB0aW1lb3V0IHNlYmVsdW0gbWVyZXNldC4nKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIWNvbmZpcm0oJ0hhcHVzIHRvdGFsIHNoaWZ0LCBYUCBrZXJqYSwgZW5lcmdpLCBkYW4gc2VsdXJ1aCBoaXN0b3J5IGxva2FsPyBQZW5nYXR1cmFuLCB0b2tlbiwgZGFuIEFjdGl2aXR5IExvZyB0aWRhayBkaWhhcHVzLiBUaW5kYWthbiBpbmkgdGlkYWsgZGFwYXQgZGliYXRhbGthbi4nKSkgcmV0dXJuO1xuXG4gICAgICAgIGNvbnN0IHJlc2V0RGF0ZSA9IG5ldyBEYXRlKCkudG9EYXRlU3RyaW5nKCk7XG4gICAgICAgIHN0YXRlLnRvdGFsV29ya2VkID0gMDtcbiAgICAgICAgc3RhdGUudG90YWxXb3JrWFAgPSAwO1xuICAgICAgICBzdGF0ZS53b3JrVG9kYXkgPSAwO1xuICAgICAgICBzdGF0ZS54cFRvZGF5ID0gMDtcbiAgICAgICAgc3RhdGUudG90YWxFbmVyZ3lTcGVudCA9IDA7XG4gICAgICAgIHN0YXRlLnRvdGFsQWN0dWFsRW5lcmd5U3BlbnQgPSAwO1xuICAgICAgICBzdGF0ZS50b3RhbEVzdGltYXRlZEVuZXJneVNwZW50ID0gMDtcbiAgICAgICAgc3RhdGUubGFzdFdvcmtEYXRlID0gcmVzZXREYXRlO1xuICAgICAgICBzdGF0ZS5sYXN0V29ya1RpbWUgPSAnQmVsdW0gcGVybmFoJztcbiAgICAgICAgc3RhdGUuc2Vzc2lvblN0YXJ0VGltZSA9IERhdGUubm93KCk7XG4gICAgICAgIHN0YXRlLmVuZXJneVN5bmNCYXNlID0gbnVsbDtcbiAgICAgICAgc3RhdGUubmV4dFdvcmtUaW1lc3RhbXAgPSBEYXRlLm5vdygpICsgMzAwMDtcblxuICAgICAgICBjb25zdCBuZXdIaXN0b3J5ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgICAgICAgbmV3SGlzdG9yeVtyZXNldERhdGVdID0ge1xuICAgICAgICAgICAgc2hpZnRzOiAwLFxuICAgICAgICAgICAgeHA6IDAsXG4gICAgICAgICAgICBlbmVyZ3lTcGVudDogMCxcbiAgICAgICAgICAgIGVzdGltYXRlZEVuZXJneVNwZW50OiAwLFxuICAgICAgICAgICAgZW5lcmd5RGF0YVNoaWZ0czogMFxuICAgICAgICB9O1xuXG4gICAgICAgIHNldFZhbHVlKCdzZXNzaW9uU3RhcnRUaW1lJywgc3RhdGUuc2Vzc2lvblN0YXJ0VGltZS50b1N0cmluZygpKTtcbiAgICAgICAgc2V0VmFsdWUoJ3Nlc3Npb25TdGFydERheScsIHJlc2V0RGF0ZSk7XG4gICAgICAgIHNldFZhbHVlKCdhd193b3JrSGlzdG9yeScsIEpTT04uc3RyaW5naWZ5KG5ld0hpc3RvcnkpKTtcbiAgICAgICAgaWYgKHdvcmtIaXN0b3J5KSB7XG4gICAgICAgICAgICBPYmplY3Qua2V5cyh3b3JrSGlzdG9yeSkuZm9yRWFjaChrID0+IGRlbGV0ZSB3b3JrSGlzdG9yeVtrXSk7XG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKHdvcmtIaXN0b3J5LCBuZXdIaXN0b3J5KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHNhdmVTdGF0ZShzdGF0ZSk7XG4gICAgICAgIGN0eC51cGRhdGVQYW5lbD8uKCk7XG4gICAgICAgIHVwZGF0ZUFuYWx5dGljc1ZpZXcoc3RhdGUsIENPTkZJRywgd29ya0hpc3RvcnksIGN0eCk7XG4gICAgICAgIGN0eC5sb2c/LignU3RhdGlzdGlrIGtlcmphIGRhbiBoaXN0b3J5IGxva2FsIGJlcmhhc2lsIGRpcmVzZXQuJywgJ3N1Y2Nlc3MnKTtcbiAgICAgICAgaWYgKHN0YXRlLnJ1bm5pbmcgJiYgY3R4Lndha2VQZW5kaW5nV29yaykgY3R4Lndha2VQZW5kaW5nV29yaygpO1xuICAgIH0pO1xuXG4gICAgY29uc3QgYnRuVG9nZ2xlSW1wb3J0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LWJ0bi10b2dnbGUtaW1wb3J0Jyk7XG4gICAgY29uc3QgaW1wb3J0U2VjdGlvbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1pbXBvcnQtc2VjdGlvbicpO1xuICAgIGlmIChidG5Ub2dnbGVJbXBvcnQgJiYgaW1wb3J0U2VjdGlvbikge1xuICAgICAgICBidG5Ub2dnbGVJbXBvcnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBpc0hpZGRlbiA9IGltcG9ydFNlY3Rpb24uc3R5bGUuZGlzcGxheSA9PT0gJ25vbmUnO1xuICAgICAgICAgICAgaW1wb3J0U2VjdGlvbi5zdHlsZS5kaXNwbGF5ID0gaXNIaWRkZW4gPyAnYmxvY2snIDogJ25vbmUnO1xuICAgICAgICAgICAgYnRuVG9nZ2xlSW1wb3J0LnRleHRDb250ZW50ID0gaXNIaWRkZW5cbiAgICAgICAgICAgICAgICA/ICfilrIgVHV0dXAgS29sb20gSW1wb3J0J1xuICAgICAgICAgICAgICAgIDogJ/Cfk6UgUHVueWEga29kZSBiYWNrdXA/IEtsaWsgdW50dWsgSW1wb3J0IC8gUmVzdG9yZSBEYXRhJztcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgYnRuQXBwbHlJbXBvcnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctYnRuLWFwcGx5LWltcG9ydCcpO1xuICAgIGNvbnN0IGltcG9ydElucHV0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LWltcG9ydC1pbnB1dCcpO1xuICAgIGlmIChidG5BcHBseUltcG9ydCAmJiBpbXBvcnRJbnB1dCkge1xuICAgICAgICBidG5BcHBseUltcG9ydC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgICAgIGltcG9ydERhdGFGcm9tSlNPTihpbXBvcnRJbnB1dC52YWx1ZSwgc3RhdGUsIENPTkZJRywgd29ya0hpc3RvcnksIGN0eCk7XG4gICAgICAgIH0pO1xuICAgIH1cbn1cbiIsIi8qKlxuICogdWkvbG9ndmlld2VyLmpzIOKAlCBBY3Rpdml0eSBsb2cgdmlld2VyIG1vZGFsXG4gKiBNb2Rlcm5pemVkIHdpdGggY2F0ZWdvcnkgZmlsdGVyIHBpbGxzLCBsaXZlIGNvdW50ZXJzLCBzZWFyY2ggYmFyLFxuICogY29weSB0byBjbGlwYm9hcmQsIGV4cG9ydCB0byBmaWxlLCBhbmQgZGFyayBnbGFzc21vcnBoaWMgc3R5bGluZy5cbiAqL1xuXG5pbXBvcnQgeyBjbGVhclN0b3JlZExvZ3MgfSBmcm9tICcuLi9sb2dnZXIuanMnO1xuXG4vLyBJbmplY3Qgc2NvcGVkIHN0eWxlc2hlZXQgb25jZVxuZnVuY3Rpb24gZW5zdXJlTG9nVmlld2VyU3R5bGVzKCkge1xuICAgIGlmIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctbG9nLXN0eWxlcycpKSByZXR1cm47XG4gICAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuICAgIHN0eWxlLmlkID0gJ2F3LWxvZy1zdHlsZXMnO1xuICAgIHN0eWxlLnRleHRDb250ZW50ID0gYFxuICAgICAgICAjYXctbG9nLW1vZGFsIHtcbiAgICAgICAgICAgIGZvbnQtZmFtaWx5OiAtYXBwbGUtc3lzdGVtLCBCbGlua01hY1N5c3RlbUZvbnQsIFwiU2Vnb2UgVUlcIiwgUm9ib3RvLCBcIkhlbHZldGljYSBOZXVlXCIsIEFyaWFsLCBzYW5zLXNlcmlmO1xuICAgICAgICAgICAgY29sb3I6ICNlMmU4ZjA7XG4gICAgICAgIH1cblxuICAgICAgICAvKiBGaWx0ZXIgUGlsbHMgKi9cbiAgICAgICAgLmF3LWxvZy1maWx0ZXItcGlsbCB7XG4gICAgICAgICAgICBkaXNwbGF5OiBpbmxpbmUtZmxleDtcbiAgICAgICAgICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgICAgICAgICBnYXA6IDZweDtcbiAgICAgICAgICAgIHBhZGRpbmc6IDZweCAxMXB4O1xuICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjAzKTtcbiAgICAgICAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4wNyk7XG4gICAgICAgICAgICBib3JkZXItcmFkaXVzOiA4cHg7XG4gICAgICAgICAgICBjb2xvcjogIzhiOWJiNDtcbiAgICAgICAgICAgIGZvbnQtc2l6ZTogMTEuNXB4O1xuICAgICAgICAgICAgZm9udC13ZWlnaHQ6IDUwMDtcbiAgICAgICAgICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICAgICAgICAgIHRyYW5zaXRpb246IGFsbCAwLjJzIGN1YmljLWJlemllcigwLjQsIDAsIDAuMiwgMSk7XG4gICAgICAgICAgICB1c2VyLXNlbGVjdDogbm9uZTtcbiAgICAgICAgICAgIHdoaXRlLXNwYWNlOiBub3dyYXA7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LWxvZy1maWx0ZXItcGlsbDpob3ZlciB7XG4gICAgICAgICAgICBjb2xvcjogI2ZmZmZmZjtcbiAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4wOCk7XG4gICAgICAgICAgICBib3JkZXItY29sb3I6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4xNCk7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LWxvZy1maWx0ZXItcGlsbC5hY3RpdmUge1xuICAgICAgICAgICAgY29sb3I6ICMwMGZmODg7XG4gICAgICAgICAgICBiYWNrZ3JvdW5kOiBsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCByZ2JhKDAsIDI1NSwgMTM2LCAwLjE0KSwgcmdiYSgwLCAxODAsIDIxNiwgMC4wOSkpO1xuICAgICAgICAgICAgYm9yZGVyLWNvbG9yOiByZ2JhKDAsIDI1NSwgMTM2LCAwLjUpO1xuICAgICAgICAgICAgZm9udC13ZWlnaHQ6IDYwMDtcbiAgICAgICAgICAgIGJveC1zaGFkb3c6IDAgMnB4IDEwcHggcmdiYSgwLCAyNTUsIDEzNiwgMC4xNSk7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LWxvZy1maWx0ZXItY291bnQge1xuICAgICAgICAgICAgZm9udC1zaXplOiAxMHB4O1xuICAgICAgICAgICAgZm9udC13ZWlnaHQ6IDcwMDtcbiAgICAgICAgICAgIHBhZGRpbmc6IDFweCA2cHg7XG4gICAgICAgICAgICBib3JkZXItcmFkaXVzOiAxMHB4O1xuICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjA4KTtcbiAgICAgICAgICAgIGNvbG9yOiAjOTRhM2I4O1xuICAgICAgICAgICAgdHJhbnNpdGlvbjogYWxsIDAuMnM7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LWxvZy1maWx0ZXItcGlsbC5hY3RpdmUgLmF3LWxvZy1maWx0ZXItY291bnQge1xuICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgwLCAyNTUsIDEzNiwgMC4yKTtcbiAgICAgICAgICAgIGNvbG9yOiAjMDBmZjg4O1xuICAgICAgICB9XG5cbiAgICAgICAgLyogVHlwZSBCYWRnZXMgKi9cbiAgICAgICAgLmF3LWxvZy1iYWRnZSB7XG4gICAgICAgICAgICBkaXNwbGF5OiBpbmxpbmUtZmxleDtcbiAgICAgICAgICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgICAgICAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcbiAgICAgICAgICAgIGdhcDogNHB4O1xuICAgICAgICAgICAgcGFkZGluZzogMnB4IDZweDtcbiAgICAgICAgICAgIGJvcmRlci1yYWRpdXM6IDRweDtcbiAgICAgICAgICAgIGZvbnQtc2l6ZTogMTBweDtcbiAgICAgICAgICAgIGZvbnQtd2VpZ2h0OiA3MDA7XG4gICAgICAgICAgICBsZXR0ZXItc3BhY2luZzogMC4zcHg7XG4gICAgICAgICAgICB3aGl0ZS1zcGFjZTogbm93cmFwO1xuICAgICAgICAgICAgZmxleC1zaHJpbms6IDA7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LWxvZy1iYWRnZS1zdWNjZXNzIHtcbiAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMCwgMjU1LCAxMzYsIDAuMTIpO1xuICAgICAgICAgICAgY29sb3I6ICMwMGZmODg7XG4gICAgICAgICAgICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDAsIDI1NSwgMTM2LCAwLjI1KTtcbiAgICAgICAgfVxuICAgICAgICAuYXctbG9nLWJhZGdlLXdhcm4ge1xuICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgyNTUsIDIwOSwgMTAyLCAwLjEyKTtcbiAgICAgICAgICAgIGNvbG9yOiAjZmZkMTY2O1xuICAgICAgICAgICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSgyNTUsIDIwOSwgMTAyLCAwLjI1KTtcbiAgICAgICAgfVxuICAgICAgICAuYXctbG9nLWJhZGdlLWVycm9yIHtcbiAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMjU1LCAxMDcsIDEwNywgMC4xMik7XG4gICAgICAgICAgICBjb2xvcjogI2ZmNmI2YjtcbiAgICAgICAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMjU1LCAxMDcsIDEwNywgMC4yNSk7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LWxvZy1iYWRnZS1pbmZvIHtcbiAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMCwgMjEyLCAyNTUsIDAuMTIpO1xuICAgICAgICAgICAgY29sb3I6ICMwMGQ0ZmY7XG4gICAgICAgICAgICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDAsIDIxMiwgMjU1LCAwLjI1KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8qIExvZyBSb3cgKi9cbiAgICAgICAgLmF3LWxvZy1yb3cge1xuICAgICAgICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgICAgICAgIGFsaWduLWl0ZW1zOiBmbGV4LXN0YXJ0O1xuICAgICAgICAgICAgZ2FwOiAxMHB4O1xuICAgICAgICAgICAgcGFkZGluZzogOHB4IDEwcHg7XG4gICAgICAgICAgICBib3JkZXItYm90dG9tOiAxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjA0KTtcbiAgICAgICAgICAgIGJvcmRlci1yYWRpdXM6IDZweDtcbiAgICAgICAgICAgIHRyYW5zaXRpb246IGJhY2tncm91bmQgMC4xNXM7XG4gICAgICAgICAgICBwb3NpdGlvbjogcmVsYXRpdmU7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LWxvZy1yb3c6aG92ZXIge1xuICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjA0KTtcbiAgICAgICAgfVxuICAgICAgICAuYXctbG9nLXJvdzpsYXN0LWNoaWxkIHtcbiAgICAgICAgICAgIGJvcmRlci1ib3R0b206IG5vbmU7XG4gICAgICAgIH1cbiAgICAgICAgLmF3LWxvZy10aW1lIHtcbiAgICAgICAgICAgIGZvbnQtZmFtaWx5OiB1aS1tb25vc3BhY2UsIFNGTW9uby1SZWd1bGFyLCBNZW5sbywgTW9uYWNvLCBDb25zb2xhcywgbW9ub3NwYWNlO1xuICAgICAgICAgICAgZm9udC1zaXplOiAxMXB4O1xuICAgICAgICAgICAgY29sb3I6ICM2NDc0OGI7XG4gICAgICAgICAgICB3aGl0ZS1zcGFjZTogbm93cmFwO1xuICAgICAgICAgICAgcGFkZGluZy10b3A6IDFweDtcbiAgICAgICAgICAgIGZsZXgtc2hyaW5rOiAwO1xuICAgICAgICB9XG4gICAgICAgIC5hdy1sb2ctbXNnIHtcbiAgICAgICAgICAgIGZsZXg6IDE7XG4gICAgICAgICAgICBmb250LXNpemU6IDEycHg7XG4gICAgICAgICAgICBsaW5lLWhlaWdodDogMS40NTtcbiAgICAgICAgICAgIHdvcmQtYnJlYWs6IGJyZWFrLXdvcmQ7XG4gICAgICAgICAgICBjb2xvcjogI2NiZDVlMTtcbiAgICAgICAgfVxuICAgICAgICAuYXctbG9nLWNvcHktYnRuIHtcbiAgICAgICAgICAgIG9wYWNpdHk6IDA7XG4gICAgICAgICAgICB0cmFuc2l0aW9uOiBvcGFjaXR5IDAuMTVzLCBiYWNrZ3JvdW5kIDAuMTVzO1xuICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjA4KTtcbiAgICAgICAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4xMik7XG4gICAgICAgICAgICBjb2xvcjogIzk0YTNiODtcbiAgICAgICAgICAgIGJvcmRlci1yYWRpdXM6IDRweDtcbiAgICAgICAgICAgIHBhZGRpbmc6IDJweCA3cHg7XG4gICAgICAgICAgICBmb250LXNpemU6IDEwcHg7XG4gICAgICAgICAgICBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICAgICAgICBtYXJnaW4tbGVmdDogYXV0bztcbiAgICAgICAgICAgIGZsZXgtc2hyaW5rOiAwO1xuICAgICAgICB9XG4gICAgICAgIC5hdy1sb2ctcm93OmhvdmVyIC5hdy1sb2ctY29weS1idG4ge1xuICAgICAgICAgICAgb3BhY2l0eTogMTtcbiAgICAgICAgfVxuICAgICAgICAuYXctbG9nLWNvcHktYnRuOmhvdmVyIHtcbiAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMCwgMjU1LCAxMzYsIDAuMTUpO1xuICAgICAgICAgICAgY29sb3I6ICMwMGZmODg7XG4gICAgICAgICAgICBib3JkZXItY29sb3I6IHJnYmEoMCwgMjU1LCAxMzYsIDAuNCk7XG4gICAgICAgIH1cblxuICAgICAgICAvKiBDdXN0b20gU2Nyb2xsYmFycyAqL1xuICAgICAgICAjYXctbG9nLWVudHJpZXM6Oi13ZWJraXQtc2Nyb2xsYmFyIHtcbiAgICAgICAgICAgIHdpZHRoOiA2cHg7XG4gICAgICAgIH1cbiAgICAgICAgI2F3LWxvZy1lbnRyaWVzOjotd2Via2l0LXNjcm9sbGJhci10cmFjayB7XG4gICAgICAgICAgICBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDtcbiAgICAgICAgfVxuICAgICAgICAjYXctbG9nLWVudHJpZXM6Oi13ZWJraXQtc2Nyb2xsYmFyLXRodW1iIHtcbiAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4xNCk7XG4gICAgICAgICAgICBib3JkZXItcmFkaXVzOiA0cHg7XG4gICAgICAgIH1cbiAgICAgICAgI2F3LWxvZy1lbnRyaWVzOjotd2Via2l0LXNjcm9sbGJhci10aHVtYjpob3ZlciB7XG4gICAgICAgICAgICBiYWNrZ3JvdW5kOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMjgpO1xuICAgICAgICB9XG5cbiAgICAgICAgLmF3LWxvZy1waWxscy1jb250YWluZXI6Oi13ZWJraXQtc2Nyb2xsYmFyIHtcbiAgICAgICAgICAgIGRpc3BsYXk6IG5vbmU7XG4gICAgICAgIH1cbiAgICBgO1xuICAgIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTG9nVmlld2VyKHN0YXRlLCBDT05GSUcpIHtcbiAgICBlbnN1cmVMb2dWaWV3ZXJTdHlsZXMoKTtcblxuICAgIGNvbnN0IG9sZCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1sb2ctbW9kYWwnKTtcbiAgICBpZiAob2xkKSBvbGQucmVtb3ZlKCk7XG5cbiAgICBjb25zdCBtb2RhbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIG1vZGFsLmlkID0gJ2F3LWxvZy1tb2RhbCc7XG4gICAgbW9kYWwuc3R5bGUuY3NzVGV4dCA9IGBcbiAgICAgICAgZGlzcGxheTogbm9uZTtcbiAgICAgICAgcG9zaXRpb246IGZpeGVkO1xuICAgICAgICB0b3A6IDA7IGxlZnQ6IDA7IHJpZ2h0OiAwOyBib3R0b206IDA7XG4gICAgICAgIGJhY2tncm91bmQ6IHJnYmEoNCwgNywgMTQsIDAuNzgpO1xuICAgICAgICBiYWNrZHJvcC1maWx0ZXI6IGJsdXIoOHB4KTtcbiAgICAgICAgLXdlYmtpdC1iYWNrZHJvcC1maWx0ZXI6IGJsdXIoOHB4KTtcbiAgICAgICAgei1pbmRleDogMTAwMDAzO1xuICAgICAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcbiAgICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICBgO1xuXG4gICAgbW9kYWwuaW5uZXJIVE1MID0gYFxuICAgICAgICA8ZGl2IHN0eWxlPVwiXG4gICAgICAgICAgICBiYWNrZ3JvdW5kOiBsaW5lYXItZ3JhZGllbnQoMTgwZGVnLCAjMTMxNzI0IDAlLCAjMGQxMDFhIDEwMCUpO1xuICAgICAgICAgICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjEyKTtcbiAgICAgICAgICAgIGJvcmRlci1yYWRpdXM6IDE2cHg7XG4gICAgICAgICAgICB3aWR0aDogOTUlO1xuICAgICAgICAgICAgbWF4LXdpZHRoOiA2ODBweDtcbiAgICAgICAgICAgIGhlaWdodDogNjIwcHg7XG4gICAgICAgICAgICBtYXgtaGVpZ2h0OiA5MHZoO1xuICAgICAgICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgICAgICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG4gICAgICAgICAgICBib3gtc2hhZG93OiAwIDIwcHggNjBweCByZ2JhKDAsMCwwLDAuOCksIDAgMCAxcHggMXB4IHJnYmEoMjU1LDI1NSwyNTUsMC4wNSk7XG4gICAgICAgICAgICBvdmVyZmxvdzogaGlkZGVuO1xuICAgICAgICBcIj5cbiAgICAgICAgICAgIDwhLS0gTW9kYWwgSGVhZGVyIC0tPlxuICAgICAgICAgICAgPGRpdiBzdHlsZT1cIlxuICAgICAgICAgICAgICAgIHBhZGRpbmc6IDE2cHggMjBweDtcbiAgICAgICAgICAgICAgICBib3JkZXItYm90dG9tOiAxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjA4KTtcbiAgICAgICAgICAgICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgICAgICAgICAgIGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjtcbiAgICAgICAgICAgICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsIHJnYmEoMjYsIDMzLCA1NCwgMC44KSAwJSwgcmdiYSgxOCwgMjIsIDM2LCAwLjk1KSAxMDAlKTtcbiAgICAgICAgICAgIFwiPlxuICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBnYXA6IDEwcHg7XCI+XG4gICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJcbiAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoOiAzMnB4OyBoZWlnaHQ6IDMycHg7IGJvcmRlci1yYWRpdXM6IDhweDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsIHJnYmEoMCwyMTIsMjU1LDAuMiksIHJnYmEoMCwxMDIsMjU1LDAuMikpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSgwLDIxMiwyNTUsMC4zKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGp1c3RpZnktY29udGVudDogY2VudGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9udC1zaXplOiAxNnB4O1xuICAgICAgICAgICAgICAgICAgICBcIj7wn5OLPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgIDxkaXY+XG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiZm9udC13ZWlnaHQ6IDcwMDsgY29sb3I6ICNmZmY7IGZvbnQtc2l6ZTogMTVweDsgbGV0dGVyLXNwYWNpbmc6IDAuM3B4O1wiPkFjdGl2aXR5IExvZzwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cImZvbnQtc2l6ZTogMTFweDsgY29sb3I6ICM4YjliYjQ7XCI+Uml3YXlhdCBha3Rpdml0YXMgJiBzdGF0dXMga2VyamEgYm90IHNlY2FyYSByZWFsLXRpbWU8L2Rpdj5cbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGdhcDogOHB4O1wiPlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGlkPVwiYXctY29weS1hbGwtbG9nXCIgc3R5bGU9XCJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4wNSk7IGNvbG9yOiAjY2JkNWUxOyBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMTIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcGFkZGluZzogNnB4IDEycHg7IGJvcmRlci1yYWRpdXM6IDhweDsgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9udC1zaXplOiAxMS41cHg7IGZvbnQtd2VpZ2h0OiA2MDA7IHRyYW5zaXRpb246IGFsbCAwLjE1cztcbiAgICAgICAgICAgICAgICAgICAgXCI+8J+TiyBTYWxpbiBMb2c8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBpZD1cImF3LWNsZWFyLWxvZ1wiIHN0eWxlPVwiXG4gICAgICAgICAgICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMDUpOyBjb2xvcjogI2ZmNmI2YjsgYm9yZGVyOiAxcHggc29saWQgcmdiYSgyNTUsIDEwNywgMTA3LCAwLjI1KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhZGRpbmc6IDZweCAxMnB4OyBib3JkZXItcmFkaXVzOiA4cHg7IGN1cnNvcjogcG9pbnRlcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbnQtc2l6ZTogMTEuNXB4OyBmb250LXdlaWdodDogNjAwOyB0cmFuc2l0aW9uOiBhbGwgMC4xNXM7XG4gICAgICAgICAgICAgICAgICAgIFwiPvCfl5HvuI8gQmVyc2loa2FuPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gaWQ9XCJhdy1jbG9zZS1sb2dcIiBzdHlsZT1cIlxuICAgICAgICAgICAgICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjA1KTsgY29sb3I6ICNjYmQ1ZTE7IGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4xMik7XG4gICAgICAgICAgICAgICAgICAgICAgICBwYWRkaW5nOiA2cHggMTJweDsgYm9yZGVyLXJhZGl1czogOHB4OyBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb250LXNpemU6IDEycHg7IGZvbnQtd2VpZ2h0OiA2MDA7IHRyYW5zaXRpb246IGFsbCAwLjE1cztcbiAgICAgICAgICAgICAgICAgICAgXCI+4pyVIFR1dHVwPC9idXR0b24+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgPCEtLSBUb29sYmFyOiBGaWx0ZXIgUGlsbHMgJiBTZWFyY2ggSW5wdXQgLS0+XG4gICAgICAgICAgICA8ZGl2IHN0eWxlPVwiXG4gICAgICAgICAgICAgICAgcGFkZGluZzogMTBweCAxOHB4O1xuICAgICAgICAgICAgICAgIGJvcmRlci1ib3R0b206IDFweCBzb2xpZCByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMDYpO1xuICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMTIsIDE2LCAyNiwgMC42KTtcbiAgICAgICAgICAgICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgICAgICAgICAgIGdhcDogMTJweDtcbiAgICAgICAgICAgICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAgICAgICAgICAgIGZsZXgtd3JhcDogd3JhcDtcbiAgICAgICAgICAgIFwiPlxuICAgICAgICAgICAgICAgIDwhLS0gQ2F0ZWdvcnkgRmlsdGVyIFBpbGxzIC0tPlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJhdy1sb2ctcGlsbHMtY29udGFpbmVyXCIgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBnYXA6IDZweDsgb3ZlcmZsb3cteDogYXV0bzsgc2Nyb2xsYmFyLXdpZHRoOiBub25lO1wiPlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIHR5cGU9XCJidXR0b25cIiBjbGFzcz1cImF3LWxvZy1maWx0ZXItcGlsbCBhY3RpdmVcIiBkYXRhLXR5cGU9XCJhbGxcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIFNlbXVhIDxzcGFuIGNsYXNzPVwiYXctbG9nLWZpbHRlci1jb3VudFwiIGlkPVwiYXctY291bnQtYWxsXCI+MDwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gdHlwZT1cImJ1dHRvblwiIGNsYXNzPVwiYXctbG9nLWZpbHRlci1waWxsXCIgZGF0YS10eXBlPVwic3VjY2Vzc1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAg4pyFIFN1a3NlcyA8c3BhbiBjbGFzcz1cImF3LWxvZy1maWx0ZXItY291bnRcIiBpZD1cImF3LWNvdW50LXN1Y2Nlc3NcIj4wPC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3M9XCJhdy1sb2ctZmlsdGVyLXBpbGxcIiBkYXRhLXR5cGU9XCJ3YXJuXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICDimqDvuI8gUGVyaW5nYXRhbiA8c3BhbiBjbGFzcz1cImF3LWxvZy1maWx0ZXItY291bnRcIiBpZD1cImF3LWNvdW50LXdhcm5cIj4wPC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3M9XCJhdy1sb2ctZmlsdGVyLXBpbGxcIiBkYXRhLXR5cGU9XCJlcnJvclwiPlxuICAgICAgICAgICAgICAgICAgICAgICAg4p2MIEVycm9yIDxzcGFuIGNsYXNzPVwiYXctbG9nLWZpbHRlci1jb3VudFwiIGlkPVwiYXctY291bnQtZXJyb3JcIj4wPC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3M9XCJhdy1sb2ctZmlsdGVyLXBpbGxcIiBkYXRhLXR5cGU9XCJpbmZvXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICDihLnvuI8gSW5mbyA8c3BhbiBjbGFzcz1cImF3LWxvZy1maWx0ZXItY291bnRcIiBpZD1cImF3LWNvdW50LWluZm9cIj4wPC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgICAgIDwhLS0gSGlkZGVuIHNlbGVjdCBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eSAtLT5cbiAgICAgICAgICAgICAgICA8c2VsZWN0IGlkPVwiYXctbG9nLWZpbHRlci10eXBlXCIgc3R5bGU9XCJkaXNwbGF5OiBub25lO1wiPlxuICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiYWxsXCI+U2VtdWE8L29wdGlvbj5cbiAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cInN1Y2Nlc3NcIj5TdWNjZXNzPC9vcHRpb24+XG4gICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJ3YXJuXCI+V2Fybjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZXJyb3JcIj5FcnJvcjwvb3B0aW9uPlxuICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiaW5mb1wiPkluZm88L29wdGlvbj5cbiAgICAgICAgICAgICAgICA8L3NlbGVjdD5cblxuICAgICAgICAgICAgICAgIDwhLS0gU2VhcmNoIElucHV0IC0tPlxuICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJmbGV4OiAxOyBtaW4td2lkdGg6IDE3MHB4OyBwb3NpdGlvbjogcmVsYXRpdmU7IGRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7XCI+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwicG9zaXRpb246IGFic29sdXRlOyBsZWZ0OiAxMHB4OyBmb250LXNpemU6IDEycHg7IGNvbG9yOiAjNjQ3NDhiOyBwb2ludGVyLWV2ZW50czogbm9uZTtcIj7wn5SNPC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8aW5wdXQgaWQ9XCJhdy1sb2ctZmlsdGVyLXRleHRcIiB0eXBlPVwidGV4dFwiIHBsYWNlaG9sZGVyPVwiQ2FyaSBsb2cgKHNoaWZ0LCBlbmVyZ2ksIGJ1ZmYpLi4uXCIgc3R5bGU9XCJcbiAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoOiAxMDAlOyBib3gtc2l6aW5nOiBib3JkZXItYm94O1xuICAgICAgICAgICAgICAgICAgICAgICAgYmFja2dyb3VuZDogIzE0MTgyNjsgY29sb3I6ICNmZmY7XG4gICAgICAgICAgICAgICAgICAgICAgICBib3JkZXI6IDFweCBzb2xpZCAjMjgzMzRlOyBib3JkZXItcmFkaXVzOiA4cHg7XG4gICAgICAgICAgICAgICAgICAgICAgICBwYWRkaW5nOiA2cHggMTJweCA2cHggMzBweDsgZm9udC1zaXplOiAxMS41cHg7XG4gICAgICAgICAgICAgICAgICAgICAgICBvdXRsaW5lOiBub25lOyB0cmFuc2l0aW9uOiBib3JkZXItY29sb3IgMC4ycztcbiAgICAgICAgICAgICAgICAgICAgXCI+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgPCEtLSBTY3JvbGxhYmxlIExvZyBFbnRyaWVzIC0tPlxuICAgICAgICAgICAgPGRpdiBpZD1cImF3LWxvZy1lbnRyaWVzXCIgc3R5bGU9XCJcbiAgICAgICAgICAgICAgICBmbGV4OiAxO1xuICAgICAgICAgICAgICAgIG92ZXJmbG93LXk6IGF1dG87XG4gICAgICAgICAgICAgICAgcGFkZGluZzogMTJweCAxOHB4O1xuICAgICAgICAgICAgICAgIG92ZXJzY3JvbGwtYmVoYXZpb3I6IGNvbnRhaW47XG4gICAgICAgICAgICAgICAgYmFja2dyb3VuZDogcmdiYSg4LCAxMSwgMTgsIDAuNCk7XG4gICAgICAgICAgICBcIj48L2Rpdj5cblxuICAgICAgICAgICAgPCEtLSBTdGlja3kgTW9kYWwgRm9vdGVyIC0tPlxuICAgICAgICAgICAgPGRpdiBzdHlsZT1cIlxuICAgICAgICAgICAgICAgIHBhZGRpbmc6IDEwcHggMThweDtcbiAgICAgICAgICAgICAgICBib3JkZXItdG9wOiAxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjA4KTtcbiAgICAgICAgICAgICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgICAgICAgICAgIGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjtcbiAgICAgICAgICAgICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsICMxMzE3MjQgMCUsICMwZDEwMWEgMTAwJSk7XG4gICAgICAgICAgICAgICAgZm9udC1zaXplOiAxMS41cHg7XG4gICAgICAgICAgICAgICAgY29sb3I6ICM4YjliYjQ7XG4gICAgICAgICAgICBcIj5cbiAgICAgICAgICAgICAgICA8ZGl2IGlkPVwiYXctbG9nLXN0YXR1c1wiIHN0eWxlPVwiZGlzcGxheTogZmxleDsgYWxpZ24taXRlbXM6IGNlbnRlcjsgZ2FwOiA4cHg7XCI+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiZGlzcGxheTogaW5saW5lLWJsb2NrOyB3aWR0aDogN3B4OyBoZWlnaHQ6IDdweDsgYm9yZGVyLXJhZGl1czogNTAlOyBiYWNrZ3JvdW5kOiAjMDBmZjg4OyBib3gtc2hhZG93OiAwIDAgOHB4ICMwMGZmODg7XCI+PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8c3BhbiBpZD1cImF3LWxvZy1zdW1tYXJ5XCI+U3RyZWFtIGFrdGlmIOKAoiAwIHJpd2F5YXQgdGVyc2ltcGFuPC9zcGFuPlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBnYXA6IDhweDtcIj5cbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBpZD1cImF3LWV4cG9ydC1sb2ctYnRuXCIgc3R5bGU9XCJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4wNSk7IGNvbG9yOiAjOTRhM2I4OyBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBwYWRkaW5nOiA1cHggMTJweDsgYm9yZGVyLXJhZGl1czogNnB4OyBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb250LXNpemU6IDExcHg7IGZvbnQtd2VpZ2h0OiA1MDA7IHRyYW5zaXRpb246IGFsbCAwLjE1cztcbiAgICAgICAgICAgICAgICAgICAgXCI+8J+SviBFa3Nwb3IgLnR4dDwvYnV0dG9uPlxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGlkPVwiYXctY2xvc2UtbG9nLWZvb3RlclwiIHN0eWxlPVwiXG4gICAgICAgICAgICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDsgY29sb3I6ICNjYmQ1ZTE7IGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4xMik7XG4gICAgICAgICAgICAgICAgICAgICAgICBwYWRkaW5nOiA1cHggMTRweDsgYm9yZGVyLXJhZGl1czogNnB4OyBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb250LXNpemU6IDExcHg7IGZvbnQtd2VpZ2h0OiA2MDA7XG4gICAgICAgICAgICAgICAgICAgIFwiPlR1dHVwPC9idXR0b24+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG4gICAgYDtcblxuICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQobW9kYWwpO1xuXG4gICAgZnVuY3Rpb24gY2xvc2VMb2coKSB7IG1vZGFsLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7IH1cbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctY2xvc2UtbG9nJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgY2xvc2VMb2cpO1xuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1jbG9zZS1sb2ctZm9vdGVyJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgY2xvc2VMb2cpO1xuICAgIG1vZGFsLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZSA9PiB7IGlmIChlLnRhcmdldCA9PT0gbW9kYWwpIGNsb3NlTG9nKCk7IH0pO1xuXG4gICAgbGV0IGZpbHRlclR5cGUgPSAnYWxsJywgZmlsdGVyVGV4dCA9ICcnO1xuXG4gICAgLy8gRmlsdGVyIHBpbGxzIGNsaWNrIGhhbmRsaW5nXG4gICAgY29uc3QgZmlsdGVyUGlsbHMgPSBtb2RhbC5xdWVyeVNlbGVjdG9yQWxsKCcuYXctbG9nLWZpbHRlci1waWxsJyk7XG4gICAgY29uc3QgaGlkZGVuU2VsZWN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LWxvZy1maWx0ZXItdHlwZScpO1xuICAgIGZpbHRlclBpbGxzLmZvckVhY2gocGlsbCA9PiB7XG4gICAgICAgIHBpbGwuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICAgICBmaWx0ZXJQaWxscy5mb3JFYWNoKHAgPT4gcC5jbGFzc0xpc3QucmVtb3ZlKCdhY3RpdmUnKSk7XG4gICAgICAgICAgICBwaWxsLmNsYXNzTGlzdC5hZGQoJ2FjdGl2ZScpO1xuICAgICAgICAgICAgZmlsdGVyVHlwZSA9IHBpbGwuZGF0YXNldC50eXBlIHx8ICdhbGwnO1xuICAgICAgICAgICAgaWYgKGhpZGRlblNlbGVjdCkgaGlkZGVuU2VsZWN0LnZhbHVlID0gZmlsdGVyVHlwZTtcbiAgICAgICAgICAgIHJlbmRlckxvZ3Moc3RhdGUsIGZpbHRlclR5cGUsIGZpbHRlclRleHQpO1xuICAgICAgICB9KTtcbiAgICB9KTtcblxuICAgIGhpZGRlblNlbGVjdD8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgZSA9PiB7XG4gICAgICAgIGZpbHRlclR5cGUgPSBlLnRhcmdldC52YWx1ZTtcbiAgICAgICAgZmlsdGVyUGlsbHMuZm9yRWFjaChwID0+IHAuY2xhc3NMaXN0LnRvZ2dsZSgnYWN0aXZlJywgcC5kYXRhc2V0LnR5cGUgPT09IGZpbHRlclR5cGUpKTtcbiAgICAgICAgcmVuZGVyTG9ncyhzdGF0ZSwgZmlsdGVyVHlwZSwgZmlsdGVyVGV4dCk7XG4gICAgfSk7XG5cbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctbG9nLWZpbHRlci10ZXh0Jyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgZSA9PiB7XG4gICAgICAgIGZpbHRlclRleHQgPSBlLnRhcmdldC52YWx1ZS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICByZW5kZXJMb2dzKHN0YXRlLCBmaWx0ZXJUeXBlLCBmaWx0ZXJUZXh0KTtcbiAgICB9KTtcblxuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1jbGVhci1sb2cnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgIGlmICghY29uZmlybSgnWWFraW4gaW5naW4gbWVtYmVyc2loa2FuIHNlbXVhIHJpd2F5YXQgQWN0aXZpdHkgTG9nPycpKSByZXR1cm47XG4gICAgICAgIHN0YXRlLmxvZ3MgPSBbXTtcbiAgICAgICAgY2xlYXJTdG9yZWRMb2dzKCk7XG4gICAgICAgIHJlbmRlckxvZ3Moc3RhdGUsIGZpbHRlclR5cGUsIGZpbHRlclRleHQpO1xuICAgIH0pO1xuXG4gICAgLy8gQ29weSBhbGwgbG9ncyB0byBjbGlwYm9hcmRcbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctY29weS1hbGwtbG9nJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICBpZiAoIXN0YXRlLmxvZ3MgfHwgc3RhdGUubG9ncy5sZW5ndGggPT09IDApIHJldHVybjtcbiAgICAgICAgY29uc3QgdGV4dFRvQ29weSA9IHN0YXRlLmxvZ3NcbiAgICAgICAgICAgIC5tYXAoZSA9PiBgWyR7ZS50aW1lfV0gWyR7ZS50eXBlLnRvVXBwZXJDYXNlKCl9XSAke2UubWVzc2FnZX1gKVxuICAgICAgICAgICAgLmpvaW4oJ1xcbicpO1xuICAgICAgICBuYXZpZ2F0b3IuY2xpcGJvYXJkLndyaXRlVGV4dCh0ZXh0VG9Db3B5KS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1jb3B5LWFsbC1sb2cnKTtcbiAgICAgICAgICAgIGlmIChidG4pIHtcbiAgICAgICAgICAgICAgICBjb25zdCBvcmlnID0gYnRuLnRleHRDb250ZW50O1xuICAgICAgICAgICAgICAgIGJ0bi50ZXh0Q29udGVudCA9ICfinIUgVGVyc2FsaW4hJztcbiAgICAgICAgICAgICAgICBidG4uc3R5bGUuY29sb3IgPSAnIzAwZmY4OCc7XG4gICAgICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGJ0bi50ZXh0Q29udGVudCA9IG9yaWc7XG4gICAgICAgICAgICAgICAgICAgIGJ0bi5zdHlsZS5jb2xvciA9ICcjY2JkNWUxJztcbiAgICAgICAgICAgICAgICB9LCAxNTAwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSkuY2F0Y2goKCkgPT4ge30pO1xuICAgIH0pO1xuXG4gICAgLy8gRXhwb3J0IGxvZ3MgdG8gLnR4dCBmaWxlXG4gICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LWV4cG9ydC1sb2ctYnRuJyk/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICBpZiAoIXN0YXRlLmxvZ3MgfHwgc3RhdGUubG9ncy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIGFsZXJ0KCdUaWRhayBhZGEgcml3YXlhdCBsb2cgdW50dWsgZGlla3Nwb3IuJyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgdGV4dENvbnRlbnQgPSBbXG4gICAgICAgICAgICBgPT09IFBBUkxBTUVOVFVNIEFVVE8gV09SS0VSIEFDVElWSVRZIExPRyA9PT1gLFxuICAgICAgICAgICAgYERpZWtzcG9yIHBhZGE6ICR7bmV3IERhdGUoKS50b0xvY2FsZVN0cmluZygnaWQtSUQnKX1gLFxuICAgICAgICAgICAgYFRvdGFsIGxvZzogJHtzdGF0ZS5sb2dzLmxlbmd0aH1gLFxuICAgICAgICAgICAgYD09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XFxuYCxcbiAgICAgICAgICAgIC4uLnN0YXRlLmxvZ3MubWFwKGUgPT4gYFske2UudGltZX1dIFske2UudHlwZS50b1VwcGVyQ2FzZSgpfV0gJHtlLm1lc3NhZ2V9YClcbiAgICAgICAgXS5qb2luKCdcXG4nKTtcblxuICAgICAgICBjb25zdCBibG9iID0gbmV3IEJsb2IoW3RleHRDb250ZW50XSwgeyB0eXBlOiAndGV4dC9wbGFpbjtjaGFyc2V0PXV0Zi04JyB9KTtcbiAgICAgICAgY29uc3QgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcbiAgICAgICAgY29uc3QgYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcbiAgICAgICAgYS5ocmVmID0gdXJsO1xuICAgICAgICBjb25zdCBkYXRlU3RyID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpLnNsaWNlKDAsIDEwKTtcbiAgICAgICAgYS5kb3dubG9hZCA9IGBwYXJsZW1lbnR1bS1sb2ctJHtkYXRlU3RyfS50eHRgO1xuICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGEpO1xuICAgICAgICBhLmNsaWNrKCk7XG4gICAgICAgIGRvY3VtZW50LmJvZHkucmVtb3ZlQ2hpbGQoYSk7XG4gICAgICAgIFVSTC5yZXZva2VPYmplY3RVUkwodXJsKTtcbiAgICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG9wZW5Mb2dWaWV3ZXIoc3RhdGUsIENPTkZJRykge1xuICAgIGNvbnN0IG1vZGFsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LWxvZy1tb2RhbCcpO1xuICAgIGlmICghbW9kYWwpIHJldHVybjtcbiAgICBtb2RhbC5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuICAgIHVwZGF0ZUxvZ1ZpZXdlcihzdGF0ZSwgQ09ORklHKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZUxvZ1ZpZXdlcihzdGF0ZSwgQ09ORklHKSB7XG4gICAgaWYgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1sb2ctbW9kYWwnKT8uc3R5bGUuZGlzcGxheSAhPT0gJ2ZsZXgnKSByZXR1cm47XG4gICAgY29uc3QgZmlsdGVyVHlwZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1sb2ctZmlsdGVyLXR5cGUnKT8udmFsdWUgfHwgJ2FsbCc7XG4gICAgY29uc3QgZmlsdGVyVGV4dCA9IChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctbG9nLWZpbHRlci10ZXh0Jyk/LnZhbHVlIHx8ICcnKS50b0xvd2VyQ2FzZSgpO1xuICAgIHJlbmRlckxvZ3Moc3RhdGUsIGZpbHRlclR5cGUsIGZpbHRlclRleHQpO1xufVxuXG5mdW5jdGlvbiByZW5kZXJMb2dzKHN0YXRlLCBmaWx0ZXJUeXBlLCBmaWx0ZXJUZXh0KSB7XG4gICAgY29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LWxvZy1lbnRyaWVzJyk7XG4gICAgaWYgKCFjb250YWluZXIpIHJldHVybjtcblxuICAgIGNvbnN0IGFsbExvZ3MgPSBzdGF0ZS5sb2dzIHx8IFtdO1xuXG4gICAgLy8gVXBkYXRlIGxpdmUgY291bnRlcnNcbiAgICBjb25zdCBjb3VudEFsbCA9IGFsbExvZ3MubGVuZ3RoO1xuICAgIGxldCBjb3VudFN1Y2Nlc3MgPSAwLCBjb3VudFdhcm4gPSAwLCBjb3VudEVycm9yID0gMCwgY291bnRJbmZvID0gMDtcbiAgICBhbGxMb2dzLmZvckVhY2gobCA9PiB7XG4gICAgICAgIGlmIChsLnR5cGUgPT09ICdzdWNjZXNzJykgY291bnRTdWNjZXNzKys7XG4gICAgICAgIGVsc2UgaWYgKGwudHlwZSA9PT0gJ3dhcm4nKSBjb3VudFdhcm4rKztcbiAgICAgICAgZWxzZSBpZiAobC50eXBlID09PSAnZXJyb3InKSBjb3VudEVycm9yKys7XG4gICAgICAgIGVsc2UgaWYgKGwudHlwZSA9PT0gJ2luZm8nKSBjb3VudEluZm8rKztcbiAgICB9KTtcblxuICAgIGNvbnN0IGVsQWxsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LWNvdW50LWFsbCcpO1xuICAgIGNvbnN0IGVsU3VjY2VzcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdy1jb3VudC1zdWNjZXNzJyk7XG4gICAgY29uc3QgZWxXYXJuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LWNvdW50LXdhcm4nKTtcbiAgICBjb25zdCBlbEVycm9yID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LWNvdW50LWVycm9yJyk7XG4gICAgY29uc3QgZWxJbmZvID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F3LWNvdW50LWluZm8nKTtcblxuICAgIGlmIChlbEFsbCkgZWxBbGwudGV4dENvbnRlbnQgPSBjb3VudEFsbDtcbiAgICBpZiAoZWxTdWNjZXNzKSBlbFN1Y2Nlc3MudGV4dENvbnRlbnQgPSBjb3VudFN1Y2Nlc3M7XG4gICAgaWYgKGVsV2FybikgZWxXYXJuLnRleHRDb250ZW50ID0gY291bnRXYXJuO1xuICAgIGlmIChlbEVycm9yKSBlbEVycm9yLnRleHRDb250ZW50ID0gY291bnRFcnJvcjtcbiAgICBpZiAoZWxJbmZvKSBlbEluZm8udGV4dENvbnRlbnQgPSBjb3VudEluZm87XG5cbiAgICBjb25zdCBmaWx0ZXJlZCA9IGFsbExvZ3MuZmlsdGVyKGUgPT5cbiAgICAgICAgKGZpbHRlclR5cGUgPT09ICdhbGwnIHx8IGUudHlwZSA9PT0gZmlsdGVyVHlwZSkgJiZcbiAgICAgICAgKCFmaWx0ZXJUZXh0IHx8IGUubWVzc2FnZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKGZpbHRlclRleHQpKVxuICAgICk7XG5cbiAgICBjb25zdCBzdW1tYXJ5RWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXctbG9nLXN1bW1hcnknKTtcbiAgICBpZiAoc3VtbWFyeUVsKSB7XG4gICAgICAgIHN1bW1hcnlFbC50ZXh0Q29udGVudCA9IGBNZW5hbXBpbGthbiAke2ZpbHRlcmVkLmxlbmd0aH0gZGFyaSAke2NvdW50QWxsfSByaXdheWF0IGxvZ2A7XG4gICAgfVxuXG4gICAgaWYgKGZpbHRlcmVkLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICBjb250YWluZXIuaW5uZXJIVE1MID0gYFxuICAgICAgICAgICAgPGRpdiBzdHlsZT1cImRpc3BsYXk6IGZsZXg7IGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGp1c3RpZnktY29udGVudDogY2VudGVyOyBoZWlnaHQ6IDEwMCU7IGNvbG9yOiAjNjQ3NDhiOyBwYWRkaW5nOiA0MHB4IDIwcHg7IHRleHQtYWxpZ246IGNlbnRlcjtcIj5cbiAgICAgICAgICAgICAgICA8c3BhbiBzdHlsZT1cImZvbnQtc2l6ZTogMzRweDsgbWFyZ2luLWJvdHRvbTogMTBweDsgb3BhY2l0eTogMC43O1wiPvCfk4s8L3NwYW4+XG4gICAgICAgICAgICAgICAgPHNwYW4gc3R5bGU9XCJmb250LXNpemU6IDE0cHg7IGZvbnQtd2VpZ2h0OiA2MDA7IGNvbG9yOiAjOTRhM2I4OyBtYXJnaW4tYm90dG9tOiA0cHg7XCI+VGlkYWsgYWRhIHJpd2F5YXQgYWt0aXZpdGFzPC9zcGFuPlxuICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPVwiZm9udC1zaXplOiAxMnB4OyBjb2xvcjogIzY0NzQ4YjtcIj4ke2NvdW50QWxsID09PSAwID8gJ0JlbHVtIGFkYSBha3Rpdml0YXMgeWFuZyBkaWNhdGF0LicgOiAnVGlkYWsgYWRhIGxvZyB5YW5nIGNvY29rIGRlbmdhbiBmaWx0ZXIgYXRhdSBrYXRhIGt1bmNpIHBlbmNhcmlhbi4nfTwvc3Bhbj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICBgO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgQkFER0VfQ09ORklHID0ge1xuICAgICAgICBzdWNjZXNzOiB7IHRleHQ6ICdTVUtTRVMnLCBjbHM6ICdhdy1sb2ctYmFkZ2Utc3VjY2VzcycsIGljb246ICfinIUnIH0sXG4gICAgICAgIHdhcm46ICAgIHsgdGV4dDogJ1dBUk4nLCAgIGNsczogJ2F3LWxvZy1iYWRnZS13YXJuJywgICAgaWNvbjogJ+KaoO+4jycgfSxcbiAgICAgICAgZXJyb3I6ICAgeyB0ZXh0OiAnRVJST1InLCAgY2xzOiAnYXctbG9nLWJhZGdlLWVycm9yJywgICBpY29uOiAn4p2MJyB9LFxuICAgICAgICBpbmZvOiAgICB7IHRleHQ6ICdJTkZPJywgICBjbHM6ICdhdy1sb2ctYmFkZ2UtaW5mbycsICAgIGljb246ICfihLnvuI8nIH1cbiAgICB9O1xuXG4gICAgY29udGFpbmVyLnJlcGxhY2VDaGlsZHJlbiguLi5maWx0ZXJlZC5tYXAoZW50cnkgPT4ge1xuICAgICAgICBjb25zdCByb3cgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgcm93LmNsYXNzTmFtZSA9ICdhdy1sb2ctcm93JztcblxuICAgICAgICAvLyBUaW1lc3RhbXBcbiAgICAgICAgY29uc3QgdGltZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcbiAgICAgICAgdGltZS5jbGFzc05hbWUgPSAnYXctbG9nLXRpbWUnO1xuICAgICAgICB0aW1lLnRleHRDb250ZW50ID0gZW50cnkudGltZSB8fCAnLS06LS06LS0nO1xuXG4gICAgICAgIC8vIEJhZGdlXG4gICAgICAgIGNvbnN0IGJhZGdlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuICAgICAgICBjb25zdCBiQ29uZiA9IEJBREdFX0NPTkZJR1tlbnRyeS50eXBlXSB8fCBCQURHRV9DT05GSUcuaW5mbztcbiAgICAgICAgYmFkZ2UuY2xhc3NOYW1lID0gYGF3LWxvZy1iYWRnZSAke2JDb25mLmNsc31gO1xuICAgICAgICBiYWRnZS50ZXh0Q29udGVudCA9IGAke2JDb25mLmljb259ICR7YkNvbmYudGV4dH1gO1xuXG4gICAgICAgIC8vIE1lc3NhZ2VcbiAgICAgICAgY29uc3QgbXNnID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuICAgICAgICBtc2cuY2xhc3NOYW1lID0gJ2F3LWxvZy1tc2cnO1xuICAgICAgICBtc2cudGV4dENvbnRlbnQgPSBlbnRyeS5tZXNzYWdlO1xuXG4gICAgICAgIC8vIEluZGl2aWR1YWwgY29weSBidXR0b24gb24gaG92ZXJcbiAgICAgICAgY29uc3QgY29weUJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xuICAgICAgICBjb3B5QnRuLmNsYXNzTmFtZSA9ICdhdy1sb2ctY29weS1idG4nO1xuICAgICAgICBjb3B5QnRuLnRleHRDb250ZW50ID0gJ1NhbGluJztcbiAgICAgICAgY29weUJ0bi50aXRsZSA9ICdTYWxpbiBiYXJpcyBsb2cgaW5pJztcbiAgICAgICAgY29weUJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQoYFske2VudHJ5LnRpbWV9XSAke2VudHJ5Lm1lc3NhZ2V9YCkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgY29weUJ0bi50ZXh0Q29udGVudCA9ICfinJMnO1xuICAgICAgICAgICAgICAgIGNvcHlCdG4uc3R5bGUuY29sb3IgPSAnIzAwZmY4OCc7XG4gICAgICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvcHlCdG4udGV4dENvbnRlbnQgPSAnU2FsaW4nO1xuICAgICAgICAgICAgICAgICAgICBjb3B5QnRuLnN0eWxlLmNvbG9yID0gJyM5NGEzYjgnO1xuICAgICAgICAgICAgICAgIH0sIDEyMDApO1xuICAgICAgICAgICAgfSkuY2F0Y2goKCkgPT4ge30pO1xuICAgICAgICB9KTtcblxuICAgICAgICByb3cuYXBwZW5kKHRpbWUsIGJhZGdlLCBtc2csIGNvcHlCdG4pO1xuICAgICAgICByZXR1cm4gcm93O1xuICAgIH0pKTtcbn1cbiIsIi8qKlxuICogaW50ZXJjZXB0b3ItY2xpZW50LmpzIOKAlCBDb250ZW50IFNjcmlwdCBCcmlkZ2UgZm9yIE1haW4tV29ybGQgSW50ZXJjZXB0b3JcbiAqXG4gKiBSdW5zIGluIHRoZSBJU09MQVRFRCB3b3JsZCAoaW5zaWRlIGRpc3QvY29udGVudC5qcykuXG4gKiBMaXN0ZW5zIGZvciBtZXNzYWdlcyBkaXNwYXRjaGVkIGJ5IGludGVyY2VwdG9yLmpzIChNQUlOIHdvcmxkKS5cbiAqIERpcmVjdGx5IHVwZGF0ZXMgZW5lcmd5IHN0YXRlLCB0b2tlbnMsIGFuZCB3b3JrIHN0YXRzIGZyb20gcmF3IHNlcnZlciBKU09OLlxuICovXG5cbmltcG9ydCB7IHBhdGNoUGFnZVZpc3VhbEVuZXJneSB9IGZyb20gJy4vZW5lcmd5LmpzJztcblxuY29uc3QgTVNHX1NPVVJDRSA9ICdQQVJMQU1FTlRVTV9JTlRFUkNFUFRPUic7XG5jb25zdCBFWFRfU09VUkNFID0gJ1BBUkxBTUVOVFVNX0VYVEVOU0lPTic7XG5cbmV4cG9ydCBmdW5jdGlvbiBpbml0SW50ZXJjZXB0b3JDbGllbnQoc3RhdGUsIENPTkZJRywgY3R4KSB7XG4gICAgaWYgKHN0YXRlLl9pbnRlcmNlcHRvckNsaWVudEluaXRpYWxpemVkKSByZXR1cm47XG4gICAgc3RhdGUuX2ludGVyY2VwdG9yQ2xpZW50SW5pdGlhbGl6ZWQgPSB0cnVlO1xuXG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCAoZXZlbnQpID0+IHtcbiAgICAgICAgaWYgKCFldmVudCB8fCBldmVudC5zb3VyY2UgIT09IHdpbmRvdykgcmV0dXJuO1xuICAgICAgICBjb25zdCBtc2cgPSBldmVudC5kYXRhO1xuICAgICAgICBpZiAoIW1zZyB8fCBtc2cuc291cmNlICE9PSBNU0dfU09VUkNFKSByZXR1cm47XG5cbiAgICAgICAgc3dpdGNoIChtc2cudHlwZSkge1xuICAgICAgICAgICAgY2FzZSAnUkVBRFknOlxuICAgICAgICAgICAgY2FzZSAnUE9ORyc6XG4gICAgICAgICAgICAgICAgc3RhdGUuaW50ZXJjZXB0b3JBY3RpdmUgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlICdBVVRIX1RPS0VOJzpcbiAgICAgICAgICAgICAgICBpZiAobXNnLnRva2VuICYmIHR5cGVvZiBtc2cudG9rZW4gPT09ICdzdHJpbmcnICYmIG1zZy50b2tlbiAhPT0gc3RhdGUuY3VycmVudFRva2VuKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjdHg/LmhhbmRsZU5ld1Rva2VuKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjdHguaGFuZGxlTmV3VG9rZW4obXNnLnRva2VuLCAnbmV0d29ya19pbnRlcmNlcHRvcicpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlICdFTkVSR1lfU1lOQyc6XG4gICAgICAgICAgICAgICAgX2hhbmRsZUVuZXJneVN5bmMoc3RhdGUsIG1zZywgY3R4KTtcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAnV09SS19TVUNDRVNTJzpcbiAgICAgICAgICAgICAgICBfaGFuZGxlV29ya1N1Y2Nlc3Moc3RhdGUsIG1zZywgY3R4KTtcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAnV09SS19SRUpFQ1RFRCc6XG4gICAgICAgICAgICAgICAgX2hhbmRsZVdvcmtSZWplY3RlZChzdGF0ZSwgbXNnLCBjdHgpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyAxLiBTZW5kIFBpbmcgdG8gY2hlY2sgaWYgaW50ZXJjZXB0b3IuanMgaXMgYWxyZWFkeSBydW5uaW5nIGZyb20gbWFuaWZlc3Qgd29ybGQ6IFwiTUFJTlwiXG4gICAgdHJ5IHtcbiAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKHsgc291cmNlOiBFWFRfU09VUkNFLCBhY3Rpb246ICdQSU5HJyB9LCAnKicpO1xuICAgIH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuXG4gICAgLy8gMi4gRmFsbGJhY2s6IElmIG5vdCBhY3RpdmUgYWZ0ZXIgMzUwbXMsIGR5bmFtaWNhbGx5IGluamVjdCBpbnRlcmNlcHRvci5qcyBhcyBhIHNjcmlwdCB0YWdcbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgaWYgKCFzdGF0ZS5pbnRlcmNlcHRvckFjdGl2ZSAmJiBjaHJvbWUucnVudGltZT8uZ2V0VVJMKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHNjcmlwdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NjcmlwdCcpO1xuICAgICAgICAgICAgICAgIHNjcmlwdC5zcmMgPSBjaHJvbWUucnVudGltZS5nZXRVUkwoJ2ludGVyY2VwdG9yLmpzJyk7XG4gICAgICAgICAgICAgICAgc2NyaXB0LmFzeW5jID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgKGRvY3VtZW50LmhlYWQgfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50KS5hcHBlbmRDaGlsZChzY3JpcHQpO1xuICAgICAgICAgICAgICAgIHNjcmlwdC5vbmxvYWQgPSAoKSA9PiBzY3JpcHQucmVtb3ZlKCk7XG4gICAgICAgICAgICB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cbiAgICAgICAgfVxuICAgIH0sIDM1MCk7XG59XG5cbmZ1bmN0aW9uIF9oYW5kbGVFbmVyZ3lTeW5jKHN0YXRlLCBtc2csIGN0eCkge1xuICAgIGNvbnN0IGN1clJhdyA9IG1zZy5jdXJyZW50RW5lcmd5O1xuICAgIGNvbnN0IG1heFJhdyA9IG1zZy5tYXhFbmVyZ3k7XG5cbiAgICBsZXQgdXBkYXRlZCA9IGZhbHNlO1xuXG4gICAgaWYgKHR5cGVvZiBjdXJSYXcgPT09ICdudW1iZXInICYmIE51bWJlci5pc0Zpbml0ZShjdXJSYXcpKSB7XG4gICAgICAgIGNvbnN0IGN1ciA9IE1hdGgubWF4KDAsIE1hdGgucm91bmQoY3VyUmF3KSk7XG4gICAgICAgIHN0YXRlLmN1cnJlbnRFbmVyZ3kgPSBjdXI7XG4gICAgICAgIHVwZGF0ZWQgPSB0cnVlO1xuICAgIH1cblxuICAgIGlmICh0eXBlb2YgbWF4UmF3ID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNGaW5pdGUobWF4UmF3KSAmJiBtYXhSYXcgPiAwKSB7XG4gICAgICAgIHN0YXRlLm1heEVuZXJneSA9IE1hdGgucm91bmQobWF4UmF3KTtcbiAgICAgICAgdXBkYXRlZCA9IHRydWU7XG4gICAgfVxuXG4gICAgaWYgKHVwZGF0ZWQpIHtcbiAgICAgICAgc3RhdGUuZW5lcmd5U3luY0Jhc2UgPSB7XG4gICAgICAgICAgICBjdXJyZW50OiBzdGF0ZS5jdXJyZW50RW5lcmd5LFxuICAgICAgICAgICAgbWF4OiBzdGF0ZS5tYXhFbmVyZ3kgfHwgMTEwLFxuICAgICAgICAgICAgdXBkYXRlZEF0OiBEYXRlLm5vdygpXG4gICAgICAgIH07XG4gICAgICAgIGN0eD8udXBkYXRlUGFuZWw/LigpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gX2hhbmRsZVdvcmtTdWNjZXNzKHN0YXRlLCBtc2csIGN0eCkge1xuICAgIGNvbnN0IHVzZWQgPSBOdW1iZXIobXNnLmVuZXJneVVzZWQpIHx8IDEwO1xuICAgIGNvbnN0IHhwID0gTnVtYmVyKG1zZy54cEVhcm5lZCkgfHwgMDtcblxuICAgIC8vIElmIGV4dGVuc2lvbiBpbml0aWF0ZWQgdGhlIHdvcmssIHdvcmsuanMgYWxyZWFkeSBoYW5kbGVzIHN0YXRlIGFuZCBsb2dnaW5nXG4gICAgaWYgKHN0YXRlLndvcmtJbkZsaWdodCkge1xuICAgICAgICBpZiAobXNnLnJlbWFpbmluZ0VuZXJneSAhPSBudWxsICYmIHR5cGVvZiBtc2cucmVtYWluaW5nRW5lcmd5ID09PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgc3RhdGUuY3VycmVudEVuZXJneSA9IE1hdGgubWF4KDAsIE1hdGgucm91bmQobXNnLnJlbWFpbmluZ0VuZXJneSkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc3RhdGUuY3VycmVudEVuZXJneSA9IE1hdGgubWF4KDAsIChzdGF0ZS5jdXJyZW50RW5lcmd5IHx8IDApIC0gdXNlZCk7XG4gICAgICAgIH1cbiAgICAgICAgc3RhdGUuZW5lcmd5U3luY0Jhc2UgPSB7XG4gICAgICAgICAgICBjdXJyZW50OiBzdGF0ZS5jdXJyZW50RW5lcmd5LFxuICAgICAgICAgICAgbWF4OiBzdGF0ZS5tYXhFbmVyZ3kgfHwgMTEwLFxuICAgICAgICAgICAgdXBkYXRlZEF0OiBEYXRlLm5vdygpXG4gICAgICAgIH07XG4gICAgICAgIHBhdGNoUGFnZVZpc3VhbEVuZXJneShzdGF0ZS5jdXJyZW50RW5lcmd5LCBzdGF0ZS5tYXhFbmVyZ3ksIHRydWUpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gRXh0ZXJuYWwgd29yayBzaGlmdCAoZS5nLiB1c2VyIGNsaWNrZWQgYnV0dG9uIG1hbnVhbGx5IG9uIHdlYiBwYWdlKVxuICAgIGlmIChtc2cucmVtYWluaW5nRW5lcmd5ICE9IG51bGwgJiYgdHlwZW9mIG1zZy5yZW1haW5pbmdFbmVyZ3kgPT09ICdudW1iZXInKSB7XG4gICAgICAgIHN0YXRlLmN1cnJlbnRFbmVyZ3kgPSBNYXRoLm1heCgwLCBNYXRoLnJvdW5kKG1zZy5yZW1haW5pbmdFbmVyZ3kpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBzdGF0ZS5jdXJyZW50RW5lcmd5ID0gTWF0aC5tYXgoMCwgKHN0YXRlLmN1cnJlbnRFbmVyZ3kgfHwgMCkgLSB1c2VkKTtcbiAgICB9XG5cbiAgICBzdGF0ZS5lbmVyZ3lTeW5jQmFzZSA9IHtcbiAgICAgICAgY3VycmVudDogc3RhdGUuY3VycmVudEVuZXJneSxcbiAgICAgICAgbWF4OiBzdGF0ZS5tYXhFbmVyZ3kgfHwgMTEwLFxuICAgICAgICB1cGRhdGVkQXQ6IERhdGUubm93KClcbiAgICB9O1xuXG4gICAgY29uc3Qgbm93U3RyID0gbmV3IERhdGUoKS50b0xvY2FsZVRpbWVTdHJpbmcoJ2lkLUlEJyk7XG4gICAgc3RhdGUud29ya1RvZGF5ID0gKHN0YXRlLndvcmtUb2RheSB8fCAwKSArIDE7XG4gICAgc3RhdGUudG90YWxXb3JrZWQgPSAoc3RhdGUudG90YWxXb3JrZWQgfHwgMCkgKyAxO1xuICAgIHN0YXRlLnhwVG9kYXkgPSAoc3RhdGUueHBUb2RheSB8fCAwKSArIHhwO1xuICAgIHN0YXRlLnRvdGFsV29ya1hQID0gKHN0YXRlLnRvdGFsV29ya1hQIHx8IDApICsgeHA7XG4gICAgc3RhdGUubGFzdFdvcmtUaW1lID0gbm93U3RyO1xuICAgIHN0YXRlLmxhc3RXb3JrVGltZXN0YW1wID0gRGF0ZS5ub3coKTtcblxuICAgIGN0eD8uc2V0VmFsdWU/Lignd29ya1RvZGF5Jywgc3RhdGUud29ya1RvZGF5KTtcbiAgICBjdHg/LnNldFZhbHVlPy4oJ3RvdGFsV29ya2VkJywgc3RhdGUudG90YWxXb3JrZWQpO1xuICAgIGN0eD8uc2V0VmFsdWU/LigneHBUb2RheScsIHN0YXRlLnhwVG9kYXkpO1xuICAgIGN0eD8uc2V0VmFsdWU/LigndG90YWxXb3JrWFAnLCBzdGF0ZS50b3RhbFdvcmtYUCk7XG5cbiAgICBjdHg/LmxvZz8uKGDimqEgU2hpZnQgZGkgZ2FtZSB0ZXJkZXRla3NpIChBbnRpLURlc3luYyk6ICske3hwfSBYUCB8IFNpc2E6ICR7c3RhdGUuY3VycmVudEVuZXJneX3imqFgLCAnc3VjY2VzcycpO1xuICAgIGN0eD8udXBkYXRlUGFuZWw/LigpO1xufVxuXG5mdW5jdGlvbiBfaGFuZGxlV29ya1JlamVjdGVkKHN0YXRlLCBtc2csIGN0eCkge1xuICAgIGNvbnN0IGVycm9yTXNnID0gU3RyaW5nKG1zZy5tZXNzYWdlIHx8IG1zZy5yYXc/Lm1lc3NhZ2UgfHwgJycpO1xuICAgIGlmICgvbm90IGVub3VnaCBlbmVyZ3l8ZW5lcmdpIHRpZGFrIGN1a3VwfGt1cmFuZy9pLnRlc3QoZXJyb3JNc2cpKSB7XG4gICAgICAgIHN0YXRlLmN1cnJlbnRFbmVyZ3kgPSAwO1xuICAgICAgICBzdGF0ZS5lbmVyZ3lTeW5jQmFzZSA9IHtcbiAgICAgICAgICAgIGN1cnJlbnQ6IDAsXG4gICAgICAgICAgICBtYXg6IHN0YXRlLm1heEVuZXJneSB8fCAxMTAsXG4gICAgICAgICAgICB1cGRhdGVkQXQ6IERhdGUubm93KClcbiAgICAgICAgfTtcbiAgICAgICAgcGF0Y2hQYWdlVmlzdWFsRW5lcmd5KDAsIHN0YXRlLm1heEVuZXJneSwgdHJ1ZSk7XG4gICAgICAgIGN0eD8udXBkYXRlUGFuZWw/LigpO1xuICAgIH1cbn1cbiIsIi8qKlxuICogbWFpbi5qcyDigJQgRW50cnkgcG9pbnQgZm9yIHRoZSBDaHJvbWUgRXh0ZW5zaW9uIGNvbnRlbnQgc2NyaXB0XG4gKlxuICogV2lyZXMgdG9nZXRoZXIgYWxsIG1vZHVsZXMgYW5kIHJ1bnMgdGhlIG1haW4gd29ya2VyIGxvb3AuXG4gKiBWaXRlIGJ1bmRsZXMgdGhpcyArIGFsbCBpbXBvcnRzIGludG8gZGlzdC9jb250ZW50LmpzLlxuICovXG5cbmltcG9ydCB7IGluaXRTdG9yYWdlLCBnZXRWYWx1ZSwgc2V0VmFsdWUsIG9uU3RvcmFnZUNoYW5nZWQgfSBmcm9tICcuL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgbG9hZENvbmZpZywgc2F2ZUNvbmZpZywgbm9ybWFsaXplQ29uZmlnIH0gICAgICAgICAgIGZyb20gJy4vY29uZmlnLmpzJztcbmltcG9ydCB7IGNyZWF0ZUluaXRpYWxTdGF0ZSwgc2F2ZVN0YXRlLCBzYXZlTGl2ZVN0YXR1cywgcmVsb2FkU3RhdGVGcm9tU3RvcmFnZSwgZ2V0U3RvcmVkSW50ZWdlciB9IGZyb20gJy4vc3RhdGUuanMnO1xuaW1wb3J0IHsgbG9hZFdvcmtIaXN0b3J5LCBzYXZlV29ya0hpc3RvcnkgfSAgICAgICAgICAgICAgICAgICBmcm9tICcuL2hpc3RvcnkuanMnO1xuaW1wb3J0IHsgbG9nIGFzIF9sb2csIHNldExvZ1VwZGF0ZUNhbGxiYWNrIH0gICAgICAgICAgICAgICAgICBmcm9tICcuL2xvZ2dlci5qcyc7XG5pbXBvcnQgeyBwYXJzZUp3dCwgaGFuZGxlTmV3VG9rZW4gYXMgX2hhbmRsZU5ld1Rva2VuLCBnZXRUb2tlbkZyb21TdG9yYWdlIGFzIF9nZXRUb2tlbkZyb21TdG9yYWdlLFxuICAgICAgICAgZ2V0VGltZVVudGlsRXhwaXJ5LCBzdGFydFRva2VuV2F0Y2hlciB9ICAgICAgICAgICAgICBmcm9tICcuL3Rva2VuLmpzJztcbmltcG9ydCB7IGdldFN5bmNlZEVuZXJneSwgZ2V0Q3VycmVudEVuZXJneSwgd2FpdEZvckVuZXJneUVsZW1lbnQsIGdldFBsYXllckxldmVsLCBnZXRNYXhFbmVyZ3lGb3JMZXZlbCxcbiAgICAgICAgIGdldExpdmVDb3VudGRvd24sIGdldFRpbWVUb0Z1bGxFbmVyZ3ksIGdldE5leHRXb3JrRGVsYXksIHBhdGNoUGFnZVZpc3VhbEVuZXJneSwgZ2V0UmVnaW9uSGVhbHRoQm9udXMsIGdldFJlZ2lvbkRldGFpbHMgfSBmcm9tICcuL2VuZXJneS5qcyc7XG5pbXBvcnQgeyBzZW5kTm90aWZpY2F0aW9uLCBwbGF5Tm90aWZpY2F0aW9uU291bmQsIHBsYXlFbmVyZ3lGdWxsQWxhcm0sIHNob3dJblBhZ2VOb3RpZmljYXRpb24gfSBmcm9tICcuL25vdGlmaWNhdGlvbnMuanMnO1xuaW1wb3J0IHsgZG9Xb3JrIH0gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmcm9tICcuL3dvcmsuanMnO1xuaW1wb3J0IHsgY3JlYXRlUGFuZWwsIHVwZGF0ZVBhbmVsIGFzIF91cGRhdGVQYW5lbCwgc2V0UnVubmluZ1VJLCB1cGRhdGVQYW5lbFZpc2liaWxpdHkgfSBmcm9tICcuL3VpL3BhbmVsLmpzJztcbmltcG9ydCB7IGNyZWF0ZVNldHRpbmdzTW9kYWwsIG9wZW5TZXR0aW5ncyB9ICAgICAgICAgICAgICAgICAgZnJvbSAnLi91aS9zZXR0aW5ncy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVBbmFseXRpY3NEYXNoYm9hcmQsIG9wZW5BbmFseXRpY3MgfSAgICAgICAgICAgIGZyb20gJy4vdWkvYW5hbHl0aWNzLmpzJztcbmltcG9ydCB7IGNyZWF0ZUxvZ1ZpZXdlciwgb3BlbkxvZ1ZpZXdlciwgdXBkYXRlTG9nVmlld2VyIH0gICAgZnJvbSAnLi91aS9sb2d2aWV3ZXIuanMnO1xuaW1wb3J0IHsgc2V0dXBMb2dpbkNhcHR1cmUsIHRyeUF1dG9Mb2dpbiwgZ2V0U2F2ZWRDcmVkZW50aWFscyB9IGZyb20gJy4vYXV0b2xvZ2luLmpzJztcbmltcG9ydCB7IGluaXRJbnRlcmNlcHRvckNsaWVudCB9ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZnJvbSAnLi9pbnRlcmNlcHRvci1jbGllbnQuanMnO1xuXG4vLyDilIDilIDilIAgQm9vdHN0cmFwIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG4oYXN5bmMgZnVuY3Rpb24gYm9vdHN0cmFwKCkge1xuICAgICd1c2Ugc3RyaWN0JztcblxuICAgIC8vIDEuIExvYWQgYWxsIHBlcnNpc3RlbnQgZGF0YSBzeW5jaHJvbm91c2x5IGludG8gY2FjaGVcbiAgICBhd2FpdCBpbml0U3RvcmFnZSgpO1xuXG4gICAgLy8gMi4gQ29uZmlnXG4gICAgY29uc3QgQ09ORklHID0gbG9hZENvbmZpZygpO1xuXG4gICAgLy8gMy4gU2Vzc2lvbiBzdGFydCB0aW1lIHBlcnNpc3RlbmNlXG4gICAgY29uc3QgdG9kYXlTdHIgPSBuZXcgRGF0ZSgpLnRvRGF0ZVN0cmluZygpO1xuICAgIGNvbnN0IHNhdmVkU3RhcnREYXkgPSBnZXRWYWx1ZSgnc2Vzc2lvblN0YXJ0RGF5JywgJycpO1xuICAgIGxldCBzYXZlZFN0YXJ0VGltZSAgPSBnZXRTdG9yZWRJbnRlZ2VyKCdzZXNzaW9uU3RhcnRUaW1lJywgRGF0ZS5ub3coKSwgMSk7XG5cbiAgICBpZiAoc2F2ZWRTdGFydERheSAhPT0gdG9kYXlTdHIpIHtcbiAgICAgICAgc2F2ZWRTdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuICAgICAgICBzZXRWYWx1ZSgnc2Vzc2lvblN0YXJ0VGltZScsIHNhdmVkU3RhcnRUaW1lLnRvU3RyaW5nKCkpO1xuICAgICAgICBzZXRWYWx1ZSgnc2Vzc2lvblN0YXJ0RGF5JywgdG9kYXlTdHIpO1xuICAgIH1cblxuICAgIC8vIDQuIFVuY2VydGFpbiB3b3JrIHN0YXRlIGZyb20gcHJldmlvdXMgc2Vzc2lvblxuICAgIGNvbnN0IGhhc1VuY2VydGFpbldvcmtSZXN1bHQgPSBnZXRWYWx1ZSgnYXdfd29ya1Jlc3VsdFVuY2VydGFpbicsICdmYWxzZScpID09PSAndHJ1ZSc7XG4gICAgbGV0IHVuY2VydGFpbkVuZXJneUJlZm9yZSA9IG51bGw7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmF3ID0gZ2V0VmFsdWUoJ2F3X3VuY2VydGFpbkVuZXJneUJlZm9yZScsICcnKTtcbiAgICAgICAgdW5jZXJ0YWluRW5lcmd5QmVmb3JlID0gcmF3ID8gSlNPTi5wYXJzZShyYXcpIDogbnVsbDtcbiAgICB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblxuICAgIC8vIDUuIFN0YXRlXG4gICAgY29uc3Qgc3RhdGUgPSBjcmVhdGVJbml0aWFsU3RhdGUoQ09ORklHLCBzYXZlZFN0YXJ0VGltZSwgaGFzVW5jZXJ0YWluV29ya1Jlc3VsdCk7XG4gICAgbGV0IHdvcmtIaXN0b3J5ID0gbG9hZFdvcmtIaXN0b3J5KHN0YXRlLCBDT05GSUcpO1xuXG4gICAgLy8gNi4gU2NoZW1hIG1pZ3JhdGlvbiAocnVuIG9uY2UgcGVyIGluc3RhbGwpXG4gICAgX3J1bk1pZ3JhdGlvbnMoc3RhdGUsIENPTkZJRywgd29ya0hpc3RvcnkpO1xuXG4gICAgLy8g4pSA4pSA4pSAIEJvdW5kIGhlbHBlcnMg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbiAgICBjb25zdCBsb2cgICAgICAgID0gKG1zZywgdHlwZSwgdG9Mb2cpID0+IF9sb2coc3RhdGUsIENPTkZJRywgbXNnLCB0eXBlLCB0b0xvZyk7XG4gICAgY29uc3QgaGFuZGxlTmV3VG9rZW4gPSAocmF3LCBzcmMpICAgID0+IF9oYW5kbGVOZXdUb2tlbihzdGF0ZSwgbG9nLCAoKSA9PiB3YWtlUGVuZGluZ1dvcms/LigpLCByYXcsIHNyYywgKCkgPT4gc2V0UnVubmluZ1VJKHRydWUpLCAoKSA9PiB1cGRhdGVQYW5lbCgpKTtcbiAgICBjb25zdCBnZXRUb2tlbkZuICAgICA9ICgpICAgICAgICAgICAgPT4gX2dldFRva2VuRnJvbVN0b3JhZ2Uoc3RhdGUsIGhhbmRsZU5ld1Rva2VuKTtcblxuICAgIC8vIENvbnRleHQgb2JqZWN0IHBhc3NlZCB0byBkb1dvcmsgYW5kIFVJIG1vZHVsZXNcbiAgICBjb25zdCBjdHggPSB7XG4gICAgICAgIHN0YXRlLCBDT05GSUcsXG4gICAgICAgIGdldCB3b3JrSGlzdG9yeSgpIHsgcmV0dXJuIHdvcmtIaXN0b3J5OyB9LFxuICAgICAgICBzZXQgd29ya0hpc3RvcnkodmFsKSB7IHdvcmtIaXN0b3J5ID0gdmFsOyB9LFxuICAgICAgICBsb2csXG4gICAgICAgIGhhbmRsZU5ld1Rva2VuLFxuICAgICAgICBzZXRSdW5uaW5nVUk6ICAgICAgKHJ1bm5pbmcpICAgICA9PiBzZXRSdW5uaW5nVUkocnVubmluZyksXG4gICAgICAgIHNlbmROb3RpZmljYXRpb246ICAgICAgKGFyZzEsIGFyZzIsIGFyZzMpID0+IHNlbmROb3RpZmljYXRpb24oYXJnMSA9PT0gQ09ORklHID8gYXJnMiA6IGFyZzEsIGFyZzEgPT09IENPTkZJRyA/IGFyZzMgOiBhcmcyKSxcbiAgICAgICAgcGxheU5vdGlmaWNhdGlvblNvdW5kOiAoYXJnMSwgYXJnMikgICAgICAgPT4gcGxheU5vdGlmaWNhdGlvblNvdW5kKGFyZzEsIGFyZzIpLFxuICAgICAgICBwbGF5RW5lcmd5RnVsbEFsYXJtOiAgIChjZmcpICAgICAgICAgICAgICA9PiBwbGF5RW5lcmd5RnVsbEFsYXJtKGNmZyB8fCBDT05GSUcpLFxuICAgICAgICB1cGRhdGVQYW5lbDogICAgICAgICAgICgpICAgICAgICAgICAgICAgICA9PiB1cGRhdGVQYW5lbCgpLFxuICAgICAgICB1cGRhdGVQYW5lbFZpc2liaWxpdHk6IChjZmcpICAgICAgICAgICAgICA9PiB1cGRhdGVQYW5lbFZpc2liaWxpdHkoc3RhdGUsIGNmZyB8fCBDT05GSUcpLFxuICAgICAgICB3YWtlUGVuZGluZ1dvcms6ICAgICAgICgpICAgICAgICAgICAgICAgICA9PiB3YWtlUGVuZGluZ1dvcms/LigpLFxuICAgICAgICBzZXRWYWx1ZSxcbiAgICAgICAgZ2V0IHVuY2VydGFpbkVuZXJneUJlZm9yZSgpIHsgcmV0dXJuIHVuY2VydGFpbkVuZXJneUJlZm9yZTsgfSxcbiAgICAgICAgc2V0IHVuY2VydGFpbkVuZXJneUJlZm9yZSh2YWwpIHsgdW5jZXJ0YWluRW5lcmd5QmVmb3JlID0gdmFsOyB9LFxuICAgICAgICByZWNvbmNpbGVVbmNlcnRhaW5Xb3JrLFxuICAgICAgICAvLyBFbmVyZ3kgaGVscGVycyBleHBlY3RlZCBieSBwYW5lbC5qc1xuICAgICAgICBnZXRTeW5jZWRFbmVyZ3k6ICAgICAgICAoc3QpICAgICA9PiBnZXRTeW5jZWRFbmVyZ3koc3QpLFxuICAgICAgICBnZXRQbGF5ZXJMZXZlbDogICAgICAgICAoc3QpICAgICA9PiBnZXRQbGF5ZXJMZXZlbChzdCksXG4gICAgICAgIGdldE1heEVuZXJneUZvckxldmVsOiAgIChsdmwpICAgID0+IGdldE1heEVuZXJneUZvckxldmVsKGx2bCksXG4gICAgICAgIGdldExpdmVDb3VudGRvd246ICAgICAgIChzdCkgICAgID0+IGdldExpdmVDb3VudGRvd24oc3QsIENPTkZJRyksXG4gICAgICAgIGdldFRpbWVUb0Z1bGxFbmVyZ3k6ICAgIChzdCkgICAgID0+IGdldFRpbWVUb0Z1bGxFbmVyZ3koc3QpLFxuICAgICAgICBnZXROZXh0V29ya0RlbGF5OiAgICAgICAoc3QpICAgICA9PiBnZXROZXh0V29ya0RlbGF5KHN0LCBDT05GSUcpLFxuICAgICAgICBnZXRSZWdpb25EZXRhaWxzOiAgICAgICAoZm9yY2UgPSBmYWxzZSkgPT4gZ2V0UmVnaW9uRGV0YWlscyhmb3JjZSksXG4gICAgICAgIC8vIEFjdGlvbiBoZWxwZXJzIGV4cGVjdGVkIGJ5IHBhbmVsLmpzXG4gICAgICAgIGRvV29yazogICAgICAgICAgICAobWFudWFsID0gZmFsc2UpID0+IGRvV29yayhjdHgsIG1hbnVhbCksXG4gICAgICAgIG9wZW5TZXR0aW5nczogICAgICAoKSAgICAgICAgICAgID0+IG9wZW5TZXR0aW5ncyhDT05GSUcsIGN0eCksXG4gICAgICAgIG9wZW5BbmFseXRpY3M6ICAgICAoKSAgICAgICAgICAgID0+IG9wZW5BbmFseXRpY3Moc3RhdGUsIENPTkZJRywgd29ya0hpc3RvcnksIGN0eCksXG4gICAgICAgIG9wZW5Mb2dWaWV3ZXI6ICAgICAoKSAgICAgICAgICAgID0+IG9wZW5Mb2dWaWV3ZXIoc3RhdGUsIENPTkZJRyksXG4gICAgICAgIHNhdmVDb25maWc6ICAgICAgICAoY2ZnKSAgICAgICAgID0+IHNhdmVDb25maWcoY2ZnKSxcbiAgICAgICAgcmVsb2FkU3RhdGVGcm9tU3RvcmFnZTogKCkgICAgICAgPT4gcmVsb2FkU3RhdGVGcm9tU3RvcmFnZShzdGF0ZSwgKCkgPT4geyB3b3JrSGlzdG9yeSA9IGxvYWRXb3JrSGlzdG9yeShzdGF0ZSwgQ09ORklHKTsgfSksXG4gICAgICAgIHBhdGNoUGFnZVZpc3VhbEVuZXJneTogIChjdXIsIG1heCwgZm9yY2UpID0+IHBhdGNoUGFnZVZpc3VhbEVuZXJneShjdXIsIG1heCwgZm9yY2UpLFxuICAgIH07XG5cbiAgICAvLyDilIDilIDilIAgTWFpbi1Xb3JsZCBOZXR3b3JrIEludGVyY2VwdG9yIEJyaWRnZSDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgICBpbml0SW50ZXJjZXB0b3JDbGllbnQoc3RhdGUsIENPTkZJRywgY3R4KTtcblxuICAgIC8vIOKUgOKUgOKUgCBVSSB3aXJpbmcg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbiAgICBzZXRMb2dVcGRhdGVDYWxsYmFjaygoKSA9PiB1cGRhdGVMb2dWaWV3ZXIoc3RhdGUsIENPTkZJRykpO1xuXG4gICAgZnVuY3Rpb24gdXBkYXRlUGFuZWwoKSB7XG4gICAgICAgIF91cGRhdGVQYW5lbChzdGF0ZSwgQ09ORklHLCB3b3JrSGlzdG9yeSwgY3R4KTtcbiAgICB9XG5cbiAgICAvLyDilIDilIDilIAgRGFpbHkgcmVzZXQg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbiAgICBmdW5jdGlvbiBjaGVja0RhaWx5UmVzZXQoKSB7XG4gICAgICAgIGlmICghY2hyb21lLnJ1bnRpbWU/LmlkKSByZXR1cm47XG4gICAgICAgIGNvbnN0IHRvZGF5ID0gbmV3IERhdGUoKS50b0RhdGVTdHJpbmcoKTtcbiAgICAgICAgaWYgKHN0YXRlLmxhc3RXb3JrRGF0ZSA9PT0gdG9kYXkpIHJldHVybjtcbiAgICAgICAgc3RhdGUud29ya1RvZGF5ICA9IDA7XG4gICAgICAgIHN0YXRlLnhwVG9kYXkgICAgPSAwO1xuICAgICAgICBzdGF0ZS5sYXN0V29ya0RhdGUgPSB0b2RheTtcbiAgICAgICAgc3RhdGUuc2Vzc2lvblN0YXJ0VGltZSA9IERhdGUubm93KCk7XG4gICAgICAgIHNldFZhbHVlKCdzZXNzaW9uU3RhcnRUaW1lJywgc3RhdGUuc2Vzc2lvblN0YXJ0VGltZS50b1N0cmluZygpKTtcbiAgICAgICAgc2V0VmFsdWUoJ3Nlc3Npb25TdGFydERheScsIHRvZGF5KTtcbiAgICAgICAgaWYgKCF3b3JrSGlzdG9yeVt0b2RheV0pIHdvcmtIaXN0b3J5W3RvZGF5XSA9IHsgc2hpZnRzOiAwLCB4cDogMCB9O1xuICAgICAgICBzZXRWYWx1ZSgnd29ya1RvZGF5JywgJzAnKTtcbiAgICAgICAgc2V0VmFsdWUoJ3hwVG9kYXknLCAnMCcpO1xuICAgICAgICBzZXRWYWx1ZSgnbGFzdFdvcmtEYXRlJywgdG9kYXkpO1xuICAgICAgICBzYXZlV29ya0hpc3Rvcnkod29ya0hpc3RvcnkpO1xuICAgICAgICBsb2coJ/CfjJkgSGFyaSBiZXJnYW50aSEgQ291bnRlciAmIFNlc2kgZGktcmVzZXQuJywgJ2luZm8nKTtcbiAgICAgICAgdXBkYXRlUGFuZWwoKTtcbiAgICB9XG5cbiAgICAvLyDilIDilIDilIAgVW5jZXJ0YWluIHdvcmsgcmVjb25jaWxpYXRpb24g4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbiAgICBmdW5jdGlvbiByZWNvbmNpbGVVbmNlcnRhaW5Xb3JrKCkge1xuICAgICAgICBpZiAoIWNocm9tZS5ydW50aW1lPy5pZCkgcmV0dXJuO1xuICAgICAgICBpZiAoIXN0YXRlLndvcmtSZXN1bHRVbmNlcnRhaW4gfHwgIXVuY2VydGFpbkVuZXJneUJlZm9yZSkgcmV0dXJuO1xuICAgICAgICBjb25zdCBjdXJyID0gZ2V0Q3VycmVudEVuZXJneSgpO1xuICAgICAgICBpZiAoIWN1cnIpIHJldHVybjtcbiAgICAgICAgaWYgKGN1cnIuY3VycmVudCA8IHVuY2VydGFpbkVuZXJneUJlZm9yZS5jdXJyZW50KSB7XG4gICAgICAgICAgICBpZiAoc3RhdGUudW5jZXJ0YWluUmVjb25jaWxpYXRpb24gIT09ICdlbmVyZ3lfY2hhbmdlZCcpIHtcbiAgICAgICAgICAgICAgICBzdGF0ZS51bmNlcnRhaW5SZWNvbmNpbGlhdGlvbiA9ICdlbmVyZ3lfY2hhbmdlZCc7XG4gICAgICAgICAgICAgICAgbG9nKGBQZXJ1YmFoYW4gZW5lcmdpIHRlcmRldGVrc2kgKCR7dW5jZXJ0YWluRW5lcmd5QmVmb3JlLmN1cnJlbnR9IOKGkiAke2N1cnIuY3VycmVudH0pLiBTaGlmdCBtdW5na2luIGRpcHJvc2VzLmAsICd3YXJuJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoc3RhdGUudW5jZXJ0YWluUmVjb25jaWxpYXRpb24gPT09ICdlbmVyZ3lfY2hhbmdlZCcpIHtcbiAgICAgICAgICAgIHN0YXRlLnVuY2VydGFpblJlY29uY2lsaWF0aW9uID0gJ3BlbmRpbmcnO1xuICAgICAgICB9XG4gICAgICAgIHVwZGF0ZVBhbmVsKCk7XG4gICAgfVxuXG4gICAgY3R4LnJlY29uY2lsZVVuY2VydGFpbldvcmsgPSByZWNvbmNpbGVVbmNlcnRhaW5Xb3JrO1xuXG4gICAgLy8g4pSA4pSA4pSAIFNjaGVkdWxlZCBzbGVlcCB3aXRoIFdlYiBXb3JrZXIgdGltZXIg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbiAgICBsZXQgd2FrZVBlbmRpbmdXb3JrID0gbnVsbDtcbiAgICBsZXQgcGVuZGluZ1dvcmtUaW1lciA9IG51bGw7XG4gICAgbGV0IGJnVGltZXJXb3JrZXIgPSBudWxsO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgYmxvYiA9IG5ldyBCbG9iKFtgXG4gICAgICAgICAgICBsZXQgdCA9IG51bGw7XG4gICAgICAgICAgICBzZWxmLm9ubWVzc2FnZSA9IGUgPT4ge1xuICAgICAgICAgICAgICAgIGlmICh0ICE9PSBudWxsKSBjbGVhclRpbWVvdXQodCk7XG4gICAgICAgICAgICAgICAgdCA9IHNldFRpbWVvdXQoKCkgPT4gc2VsZi5wb3N0TWVzc2FnZSgnd2FrZScpLCBNYXRoLm1heCgxMCwgZS5kYXRhKSk7XG4gICAgICAgICAgICB9O1xuICAgICAgICBgXSwgeyB0eXBlOiAnYXBwbGljYXRpb24vamF2YXNjcmlwdCcgfSk7XG4gICAgICAgIGJnVGltZXJXb3JrZXIgPSBuZXcgV29ya2VyKFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYikpO1xuICAgIH0gY2F0Y2ggeyBiZ1RpbWVyV29ya2VyID0gbnVsbDsgfVxuXG4gICAgZnVuY3Rpb24gd2FpdEZvclNjaGVkdWxlZFdvcmsoZGVsYXkpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuICAgICAgICAgICAgbGV0IGRvbmUgPSBmYWxzZTtcbiAgICAgICAgICAgIGNvbnN0IGZpbmlzaCA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZG9uZSkgcmV0dXJuO1xuICAgICAgICAgICAgICAgIGRvbmUgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGlmIChwZW5kaW5nV29ya1RpbWVyICE9PSBudWxsKSBjbGVhclRpbWVvdXQocGVuZGluZ1dvcmtUaW1lcik7XG4gICAgICAgICAgICAgICAgcGVuZGluZ1dvcmtUaW1lciA9IG51bGw7XG4gICAgICAgICAgICAgICAgd2FrZVBlbmRpbmdXb3JrID0gbnVsbDtcbiAgICAgICAgICAgICAgICBpZiAoYmdUaW1lcldvcmtlcikgYmdUaW1lcldvcmtlci5vbm1lc3NhZ2UgPSBudWxsO1xuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICB3YWtlUGVuZGluZ1dvcmsgPSBmaW5pc2g7XG4gICAgICAgICAgICBpZiAoYmdUaW1lcldvcmtlcikgeyBiZ1RpbWVyV29ya2VyLm9ubWVzc2FnZSA9IGZpbmlzaDsgYmdUaW1lcldvcmtlci5wb3N0TWVzc2FnZShNYXRoLm1heCgxMCwgZGVsYXkpKTsgfVxuICAgICAgICAgICAgcGVuZGluZ1dvcmtUaW1lciA9IHNldFRpbWVvdXQoZmluaXNoLCBkZWxheSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGN0eC53YWtlUGVuZGluZ1dvcmsgPSAoKSA9PiB3YWtlUGVuZGluZ1dvcms/LigpO1xuXG4gICAgLy8g4pSA4pSA4pSAIFJvdXRlIEd1YXJkOiBJc29sYXRlZCBNb2RlIG9uIEF1dGggUGFnZXMg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gICAgY29uc3QgaXNBdXRoUm91dGUgPSAocGF0aCA9IHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZSkgPT5cbiAgICAgICAgL15cXC8obG9naW58cmVnaXN0ZXJ8c2lnbnVwfGZvcmdvdC1wYXNzd29yZHxyZXNldC1wYXNzd29yZCkvaS50ZXN0KHBhdGgpO1xuXG4gICAgaWYgKGlzQXV0aFJvdXRlKCkpIHtcbiAgICAgICAgY29uc29sZS5sb2coYFtBdXRvIFdvcmtlcl0gSGFsYW1hbiBhdXRlbnRpa2FzaSB0ZXJkZXRla3NpICgke3dpbmRvdy5sb2NhdGlvbi5wYXRobmFtZX0pLiBJc29sYXNpIGFrdGlmOiBET00gdGlkYWsgZGltb2RpZmlrYXNpIGFnYXIgZm9ybSBsb2dpbiB0ZXRhcCB1dHVoLmApO1xuICAgICAgICBzZXR1cExvZ2luQ2FwdHVyZShsb2cpO1xuICAgICAgICB0cnlBdXRvTG9naW4oQ09ORklHLCBsb2csIHNlbmROb3RpZmljYXRpb24pO1xuXG4gICAgICAgIF93YXRjaFNwYU5hdmlnYXRpb24oKCkgPT4ge1xuICAgICAgICAgICAgaWYgKCFpc0F1dGhSb3V0ZSgpKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYFtBdXRvIFdvcmtlcl0gTmF2aWdhc2kga2UgaGFsYW1hbiBnYW1lIHRlcmRldGVrc2kgKCR7d2luZG93LmxvY2F0aW9uLnBhdGhuYW1lfSkuIE1lbXVhdCBsaW5na3VuZ2FuIGdhbWUuLi5gKTtcbiAgICAgICAgICAgICAgICB3aW5kb3cubG9jYXRpb24ucmVsb2FkKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm47IC8vIFNFTEVTQUkgVU5UVUsgSEFMQU1BTiBMT0dJTiEgVGlkYWsgYWRhIHBhbmVsLCBtb2RhbCwgYXRhdSB3b3JrZXIgbG9vcCB5YW5nIG1lbmdnYW5nZ3UgbG9naW4hXG4gICAgfVxuXG4gICAgLy8g4pSA4pSA4pSAIE1haW4gbG9vcCAoSGFueWEgYmVyamFsYW4gZGkgbGluZ2t1bmdhbiBnYW1lKSDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcblxuICAgIHN0YXRlLnRhYkxvY2tNYW5hZ2VkID0gQm9vbGVhbihuYXZpZ2F0b3I/LmxvY2tzPy5yZXF1ZXN0KTtcbiAgICBzdGF0ZS5pc1RhYkxvY2tPd25lciA9ICFzdGF0ZS50YWJMb2NrTWFuYWdlZDtcblxuICAgIF9sb2dTdGFydHVwKGxvZywgQ09ORklHLCBzdGF0ZSk7XG5cbiAgICBnZXRUb2tlbkZuKCk7XG4gICAgY3JlYXRlUGFuZWwoc3RhdGUsIENPTkZJRywgY3R4KTtcbiAgICBjb25zdCBjYWNoZWRMb2dzID0gZ2V0VmFsdWUoJ2F3X3JlY2VudF9sb2dzJyk7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoY2FjaGVkTG9ncykpIHtcbiAgICAgICAgc3RhdGUubG9ncyA9IFsuLi5jYWNoZWRMb2dzXTtcbiAgICB9XG4gICAgY3JlYXRlTG9nVmlld2VyKHN0YXRlLCBDT05GSUcpO1xuICAgIGNyZWF0ZVNldHRpbmdzTW9kYWwoQ09ORklHLCBjdHgpO1xuICAgIGNyZWF0ZUFuYWx5dGljc0Rhc2hib2FyZChzdGF0ZSwgQ09ORklHLCB3b3JrSGlzdG9yeSwgY3R4KTtcbiAgICBzdGFydFRva2VuV2F0Y2hlcihzdGF0ZSwgaGFuZGxlTmV3VG9rZW4sIGdldFRva2VuRm4pO1xuXG4gICAgLy8gUGFudGF1IG5hdmlnYXNpIFNQQSBqaWthIHVzZXIgbG9nb3V0IGRpIGRhbGFtIGdhbWUgdGFucGEgcmVsb2FkIHBlbnVoIGF0YXUgcGluZGFoIGhhbGFtYW5cbiAgICBfd2F0Y2hTcGFOYXZpZ2F0aW9uKCgpID0+IHtcbiAgICAgICAgaWYgKGlzQXV0aFJvdXRlKCkpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBbQXV0byBXb3JrZXJdIExvZ291dCAvIE5hdmlnYXNpIGtlIGF1dGggcGFnZSB0ZXJkZXRla3NpICgke3dpbmRvdy5sb2NhdGlvbi5wYXRobmFtZX0pLiBNZW5nYWxpaGthbiBrZSBtb2RlIGlzb2xhc2kuLi5gKTtcbiAgICAgICAgICAgIHdpbmRvdy5sb2NhdGlvbi5yZWxvYWQoKTtcbiAgICAgICAgfVxuICAgICAgICBzdGF0ZS51c2VyTWFudWFsbHlUb2dnbGVkUGFuZWwgPSBmYWxzZTtcbiAgICAgICAgY29uc3QgcGF0aCA9IHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZSB8fCAnJztcbiAgICAgICAgY29uc3QgaXNEYXNoID0gcGF0aCA9PT0gJy9kYXNoYm9hcmQnIHx8IHBhdGguc3RhcnRzV2l0aCgnL2Rhc2hib2FyZC8nKSB8fCBwYXRoID09PSAnLycgfHwgcGF0aCA9PT0gJyc7XG4gICAgICAgIGlmIChDT05GSUcucGFuZWxEYXNoYm9hcmRPbmx5ICYmIGlzRGFzaCkge1xuICAgICAgICAgICAgc3RhdGUucGFuZWxWaXNpYmxlID0gdHJ1ZTtcbiAgICAgICAgICAgIHNldFZhbHVlKCdwYW5lbFZpc2libGUnLCAndHJ1ZScpO1xuICAgICAgICB9XG4gICAgICAgIGdldFJlZ2lvbkRldGFpbHModHJ1ZSk7XG4gICAgICAgIHVwZGF0ZVBhbmVsVmlzaWJpbGl0eShzdGF0ZSwgQ09ORklHKTtcbiAgICB9KTtcblxuICAgIC8vIEludGVyY2VwdCBjbGlja3Mgb24gZ2FtZSdzIFwiS0VSSkFLQU4gU0FUVSBHSUxJUkFOXCIgYnV0dG9uIHdoZW4gZW5lcmd5IDwgMTBcbiAgICAvLyBQcmV2ZW50cyBjb25mdXNpbmcgc2VydmVyIDQwMCBlcnJvciB0b2FzdHMgKFwiTm90IGVub3VnaCBlbmVyZ3kgdG8gcHJvZHVjZSBldmVuIG9uZSB1bml0XCIpXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgICAgICBjb25zdCBidG4gPSBlLnRhcmdldD8uY2xvc2VzdD8uKCdidXR0b24nKTtcbiAgICAgICAgaWYgKCFidG4pIHJldHVybjtcbiAgICAgICAgY29uc3QgdHh0ID0gKGJ0bi50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpO1xuICAgICAgICBpZiAoL0tFUkpBS0FOXFxzK1NBVFVcXHMrR0lMSVJBTi9pLnRlc3QodHh0KSkge1xuICAgICAgICAgICAgaWYgKHN0YXRlLmN1cnJlbnRFbmVyZ3kgIT0gbnVsbCAmJiBzdGF0ZS5jdXJyZW50RW5lcmd5IDwgMTApIHtcbiAgICAgICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICBsb2coYOKaoSBFbmVyZ2kgc2FhdCBpbmkgJHtzdGF0ZS5jdXJyZW50RW5lcmd5fS8ke3N0YXRlLm1heEVuZXJneX3imqEgKGJ1dHVoIG1pbmltYWwgMTDimqEpLiBNZW51bmdndSBlbmVyZ2kgcHVsaWguYCwgJ3dhcm4nKTtcbiAgICAgICAgICAgICAgICBzaG93SW5QYWdlTm90aWZpY2F0aW9uKGDimqEgRW5lcmdpIGJlbHVtIGN1a3VwICgke3N0YXRlLmN1cnJlbnRFbmVyZ3l9LyR7c3RhdGUubWF4RW5lcmd5feKaoSkuIEJ1dHVoIG1pbmltYWwgMTDimqEgdW50dWsgZ2lsaXJhbiBrZXJqYS5gLCAnd2FybicpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSwgdHJ1ZSk7XG5cbiAgICAvLyBQcmUtc2VlZCBlbmVyZ3kgZnJvbSBzdG9yZWQgbGl2ZSBzdGF0dXMgaW1tZWRpYXRlbHkgd2hpbGUgUmVhY3QgU1BBIGluaXRpYWxpemVzIChubyBwaGFudG9tIHRpbWUgYWRkaXRpb25zKVxuICAgIGNvbnN0IGNhY2hlZExpdmUgPSBnZXRWYWx1ZSgnYXdfbGl2ZV9zdGF0dXMnKTtcbiAgICBpZiAoY2FjaGVkTGl2ZSAmJiBjYWNoZWRMaXZlLmN1cnJlbnRFbmVyZ3kgIT0gbnVsbCkge1xuICAgICAgICBjb25zdCBtYXhFID0gY2FjaGVkTGl2ZS5tYXhFbmVyZ3kgfHwgc3RhdGUubWF4RW5lcmd5IHx8IDExMDtcbiAgICAgICAgc3RhdGUubWF4RW5lcmd5ID0gbWF4RTtcbiAgICAgICAgc3RhdGUuY3VycmVudEVuZXJneSA9IE1hdGgubWluKG1heEUsIGNhY2hlZExpdmUuY3VycmVudEVuZXJneSk7XG4gICAgICAgIHN0YXRlLmVuZXJneVN5bmNCYXNlID0geyBjdXJyZW50OiBzdGF0ZS5jdXJyZW50RW5lcmd5LCBtYXg6IG1heEUsIHVwZGF0ZWRBdDogY2FjaGVkTGl2ZS51cGRhdGVkQXQgfHwgRGF0ZS5ub3coKSB9O1xuICAgIH1cblxuICAgIC8vIFByZS1zZWVkIGVuZXJneSBmcm9tIERPTSDigJQgd2FpdCBmb3IgUmVhY3QgU1BBIHRvIHJlbmRlciB0aGUgZWxlbWVudCAodXAgdG8gMTVzKVxuICAgIHdhaXRGb3JFbmVyZ3lFbGVtZW50KDE1MDAwKS50aGVuKGVuZXJneSA9PiB7XG4gICAgICAgIGlmIChlbmVyZ3kpIHtcbiAgICAgICAgICAgIHN0YXRlLmN1cnJlbnRFbmVyZ3kgPSBlbmVyZ3kuY3VycmVudDtcbiAgICAgICAgICAgIHN0YXRlLm1heEVuZXJneSAgICAgPSBlbmVyZ3kubWF4O1xuICAgICAgICAgICAgc3RhdGUuZG9tRW5lcmd5U3RhbGUgPSBmYWxzZTtcbiAgICAgICAgICAgIHN0YXRlLmxhc3RXb3JrVGltZXN0YW1wID0gMDsgLy8gRnJlc2ggcGFnZSBsb2FkOiBET00gaXMgMTAwJSBhdXRob3JpdGF0aXZlIGdyb3VuZCB0cnV0aCFcbiAgICAgICAgICAgIHN0YXRlLmVuZXJneVN5bmNCYXNlID0geyBjdXJyZW50OiBlbmVyZ3kuY3VycmVudCwgbWF4OiBlbmVyZ3kubWF4LCB1cGRhdGVkQXQ6IERhdGUubm93KCkgfTtcblxuICAgICAgICAgICAgY29uc3QgaGVhbHRoQnVmZiA9IGdldFJlZ2lvbkhlYWx0aEJvbnVzKCk7XG4gICAgICAgICAgICBzdGF0ZS5yZWdlblJhdGUgPSBoZWFsdGhCdWZmO1xuICAgICAgICAgICAgaWYgKGhlYWx0aEJ1ZmYgPiAxLjApIHtcbiAgICAgICAgICAgICAgICBjb25zdCBib251c1BjdCA9IE1hdGgucm91bmQoKGhlYWx0aEJ1ZmYgLSAxLjApICogMTAwKTtcbiAgICAgICAgICAgICAgICBsb2coYPCfj6UgQnVmZiBLb3RhOiBLZXNlaGF0YW4gKyR7Ym9udXNQY3R9JSBwZW11bGloYW4gZW5lcmdpIHBhc2lmICgke2hlYWx0aEJ1ZmZ9eClgLCAnaW5mbycpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBsb2coYOKaoSBFbmVyZ2kgdGVyYmFjYTogJHtlbmVyZ3kuY3VycmVudH0vJHtlbmVyZ3kubWF4fWAsICdpbmZvJyk7XG4gICAgICAgICAgICBzYXZlTGl2ZVN0YXR1cyhzdGF0ZSwgQ09ORklHKTtcbiAgICAgICAgICAgIHVwZGF0ZVBhbmVsKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsb2coJ+KaoO+4jyBFbGVtZW4gZW5lcmdpIHRpZGFrIGRpdGVtdWthbiBkYWxhbSAxNSBkZXRpay4gRW5lcmdpIGFrYW4gdGVyYmFjYSBzYWF0IHBhbmVsIHBlcnRhbWEgdXBkYXRlLicsICd3YXJuJyk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIHNldEludGVydmFsKCgpID0+IHsgaWYgKHN0YXRlLnJ1bm5pbmcpIF9jaGVja0FuZFJlZnJlc2hUb2tlbihzdGF0ZSwgQ09ORklHLCBsb2csIGN0eCk7IH0sIE1hdGgubWluKENPTkZJRy50b2tlblJlZnJlc2hJbnRlcnZhbCwgNjAwMDApKTtcbiAgICBzZXRJbnRlcnZhbChjaGVja0RhaWx5UmVzZXQsIDYwMDAwKTtcbiAgICBzZXRJbnRlcnZhbCh1cGRhdGVQYW5lbCwgMTAwMCk7XG4gICAgc2V0SW50ZXJ2YWwocmVjb25jaWxlVW5jZXJ0YWluV29yaywgMTAwMDApO1xuXG4gICAgLy8g4pSA4pSAIENocm9tZSBFeHRlbnNpb24gUnVudGltZSBNZXNzYWdlIExpc3RlbmVyIChQb3B1cCAmIEJhY2tncm91bmQpIOKUgOKUgOKUgOKUgFxuICAgIHRyeSB7XG4gICAgICAgIGNocm9tZS5ydW50aW1lLm9uTWVzc2FnZS5hZGRMaXN0ZW5lcigobXNnLCBzZW5kZXIsIHNlbmRSZXNwb25zZSkgPT4ge1xuICAgICAgICAgICAgaWYgKG1zZz8udHlwZSA9PT0gJ1BPUFVQX0NPTU1BTkQnKSB7XG4gICAgICAgICAgICAgICAgaWYgKG1zZy5hY3Rpb24gPT09ICd0b2dnbGVSdW5uaW5nJykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBuZXdSdW5uaW5nID0gbXNnLnZhbHVlICE9IG51bGwgPyBCb29sZWFuKG1zZy52YWx1ZSkgOiAhc3RhdGUucnVubmluZztcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUucnVubmluZyA9IG5ld1J1bm5pbmc7XG4gICAgICAgICAgICAgICAgICAgIHNldFJ1bm5pbmdVSShuZXdSdW5uaW5nKTtcbiAgICAgICAgICAgICAgICAgICAgdXBkYXRlUGFuZWwoKTtcbiAgICAgICAgICAgICAgICAgICAgc2F2ZUxpdmVTdGF0dXMoc3RhdGUsIENPTkZJRywgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgIGxvZyhgQXV0byBXb3JrZXIgJHtuZXdSdW5uaW5nID8gJ2RpbGFuanV0a2FuJyA6ICdkaWplZGEnfSB2aWEgUG9wdXAgdG9vbGJhci5gLCAnaW5mbycpO1xuICAgICAgICAgICAgICAgICAgICBpZiAobmV3UnVubmluZykgd2FrZVBlbmRpbmdXb3JrPy4oKTtcbiAgICAgICAgICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IHRydWUsIHJ1bm5pbmc6IHN0YXRlLnJ1bm5pbmcgfSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAobXNnLmFjdGlvbiA9PT0gJ3dvcmtOb3cnKSB7XG4gICAgICAgICAgICAgICAgICAgIGxvZygn4pqhIE1hbnVhbCB3b3JrIGRpcGljdSB2aWEgUG9wdXAgdG9vbGJhciEnLCAnaW5mbycpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5FeHBpcmVkIHx8IHN0YXRlLnBhdXNlZEZvclRva2VuIHx8ICFzdGF0ZS5jdXJyZW50VG9rZW4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiBmYWxzZSwgZXJyb3I6ICd0b2tlbl9leHBpcmVkJyB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGRvV29yayhjdHgsIHRydWUpLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNhdmVMaXZlU3RhdHVzKHN0YXRlLCBDT05GSUcsIHRydWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdXBkYXRlUGFuZWwoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQgPT09ICd3b3JrZWQnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IHRydWUsIGlzTG9ja093bmVyOiBzdGF0ZS5pc1RhYkxvY2tPd25lciwgcmVzdWx0IH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChyZXN1bHQgPT09ICdwYXVzZWQnICYmIChzdGF0ZS5wYXVzZWRGb3JUb2tlbiB8fCBzdGF0ZS50b2tlbkV4cGlyZWQpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IGZhbHNlLCBlcnJvcjogJ3Rva2VuX2V4cGlyZWQnIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChyZXN1bHQgPT09ICd3YWl0aW5nJyAmJiBzdGF0ZS5jdXJyZW50RW5lcmd5IDwgMTApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBvazogZmFsc2UsIGVycm9yOiAnaW5zdWZmaWNpZW50X2VuZXJneScgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiBmYWxzZSwgZXJyb3I6IHJlc3VsdCB8fCAnd29ya19mYWlsZWQnIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KS5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IGZhbHNlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKG1zZy5hY3Rpb24gPT09ICdnZXRTdGF0dXMnKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN5bmNlZCA9IGdldFN5bmNlZEVuZXJneShzdGF0ZSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzeW5jZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLmN1cnJlbnRFbmVyZ3kgPSBzeW5jZWQuY3VycmVudDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLm1heEVuZXJneSAgICAgPSBzeW5jZWQubWF4O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiB0cnVlLCBzdGF0dXM6IHNhdmVMaXZlU3RhdHVzKHN0YXRlLCBDT05GSUcsIHRydWUpIH0pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKG1zZy5hY3Rpb24gPT09ICdnZXRMb2dzJykge1xuICAgICAgICAgICAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBvazogdHJ1ZSwgbG9nczogc3RhdGUubG9ncyB8fCBbXSB9KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChtc2cuYWN0aW9uID09PSAnY2xlYXJMb2dzJykge1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZS5sb2dzID0gW107XG4gICAgICAgICAgICAgICAgICAgIGNsZWFyU3RvcmVkTG9ncygpO1xuICAgICAgICAgICAgICAgICAgICB1cGRhdGVMb2dWaWV3ZXIoc3RhdGUsIENPTkZJRyk7XG4gICAgICAgICAgICAgICAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAobXNnPy50eXBlID09PSAnU1RPUkFHRV9TWU5DJyAmJiBtc2cuYWN0aW9uID09PSAnYmFja2dyb3VuZFdvcmtEb25lJykge1xuICAgICAgICAgICAgICAgIGlmIChtc2cuZW5lcmd5ICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUuY3VycmVudEVuZXJneSA9IG1zZy5lbmVyZ3k7XG4gICAgICAgICAgICAgICAgICAgIHN0YXRlLnBvc3RTaGlmdEVuZXJneSA9IG1zZy5lbmVyZ3k7XG4gICAgICAgICAgICAgICAgICAgIHN0YXRlLmxhc3RXb3JrVGltZXN0YW1wID0gRGF0ZS5ub3coKTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUuZG9tRW5lcmd5U3RhbGUgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZS5lbmVyZ3lTeW5jQmFzZSA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGN1cnJlbnQ6IG1zZy5lbmVyZ3ksXG4gICAgICAgICAgICAgICAgICAgICAgICBtYXg6IG1zZy5tYXhFbmVyZ3kgfHwgc3RhdGUubWF4RW5lcmd5IHx8IDExMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHVwZGF0ZWRBdDogRGF0ZS5ub3coKVxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAobXNnLnN0YXR1cykge1xuICAgICAgICAgICAgICAgICAgICBpZiAobXNnLnN0YXR1cy53b3JrVG9kYXkgIT0gbnVsbCkgc3RhdGUud29ya1RvZGF5ID0gbXNnLnN0YXR1cy53b3JrVG9kYXk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChtc2cuc3RhdHVzLnhwVG9kYXkgIT0gbnVsbCkgc3RhdGUueHBUb2RheSA9IG1zZy5zdGF0dXMueHBUb2RheTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1zZy5zdGF0dXMudG90YWxXb3JrZWQgIT0gbnVsbCkgc3RhdGUudG90YWxXb3JrZWQgPSBtc2cuc3RhdHVzLnRvdGFsV29ya2VkO1xuICAgICAgICAgICAgICAgICAgICBpZiAobXNnLnN0YXR1cy50b3RhbFdvcmtYUCAhPSBudWxsKSBzdGF0ZS50b3RhbFdvcmtYUCA9IG1zZy5zdGF0dXMudG90YWxXb3JrWFA7XG4gICAgICAgICAgICAgICAgICAgIGlmIChtc2cuc3RhdHVzLmxhc3RXb3JrVGltZSkgc3RhdGUubGFzdFdvcmtUaW1lID0gbXNnLnN0YXR1cy5sYXN0V29ya1RpbWU7XG4gICAgICAgICAgICAgICAgICAgIGlmIChtc2cuc3RhdHVzLm5leHRXb3JrVGltZXN0YW1wICE9IG51bGwpIHN0YXRlLm5leHRXb3JrVGltZXN0YW1wID0gbXNnLnN0YXR1cy5uZXh0V29ya1RpbWVzdGFtcDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgc3RhdGUud29ya0luRmxpZ2h0ID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgc3RhdGUud29ya1Jlc3VsdFVuY2VydGFpbiA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHN0YXRlLmVuZXJneUZ1bGxBbGVydEFjdGl2ZSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHVwZGF0ZVBhbmVsKCk7XG4gICAgICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAobXNnPy50eXBlID09PSAnRVhFQ1VURV9XT1JLX05PVycpIHtcbiAgICAgICAgICAgICAgICAoYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFzdGF0ZS5ydW5uaW5nICYmICFtc2cubWFudWFsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IGZhbHNlLCByZXN1bHQ6ICdwYXVzZWQnIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzdGF0ZS53b3JrSW5GbGlnaHQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoRGF0ZS5ub3coKSAtIChzdGF0ZS53b3JrSW5GbGlnaHRBdCB8fCAwKSA+IDE1MDAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLndvcmtJbkZsaWdodCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiBmYWxzZSwgcmVzdWx0OiAnYnVzeScgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5FeHBpcmVkIHx8IHN0YXRlLnBhdXNlZEZvclRva2VuIHx8ICFzdGF0ZS5jdXJyZW50VG9rZW4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBvazogZmFsc2UsIHJlc3VsdDogJ3Rva2VuX2V4cGlyZWQnIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzdGF0ZS50YWJMb2NrTWFuYWdlZCAmJiAhc3RhdGUuaXNUYWJMb2NrT3duZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBvazogZmFsc2UsIHJlc3VsdDogJ3N0YW5kYnknIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3luY2VkID0gZ2V0U3luY2VkRW5lcmd5KHN0YXRlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzeW5jZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5jdXJyZW50RW5lcmd5ID0gc3luY2VkLmN1cnJlbnQ7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUubWF4RW5lcmd5ID0gc3luY2VkLm1heDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFtc2cubWFudWFsICYmIHN0YXRlLmN1cnJlbnRFbmVyZ3kgPCBDT05GSUcuZW5lcmd5VGhyZXNob2xkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IHRydWUsIHJlc3VsdDogJ3dhaXRpbmcnLCBlbmVyZ3k6IHN0YXRlLmN1cnJlbnRFbmVyZ3kgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICBsb2coJ+KaoSBUcmlnZ2VyIGJhY2tncm91bmQ6IE1lbmphbGFua2FuIHNoaWZ0IGtlcmphIG90b21hdGlzLi4uJywgJ2luZm8nKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRvV29yayhjdHgsIEJvb2xlYW4obXNnLm1hbnVhbCkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgc2F2ZUxpdmVTdGF0dXMoc3RhdGUsIENPTkZJRywgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB1cGRhdGVQYW5lbCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBvazogcmVzdWx0ID09PSAnd29ya2VkJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZW5lcmd5OiBzdGF0ZS5jdXJyZW50RW5lcmd5LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzTG9ja093bmVyOiBCb29sZWFuKHN0YXRlLmlzVGFiTG9ja093bmVyKVxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IGZhbHNlLCBlcnJvcjogZXJyPy5tZXNzYWdlIHx8IFN0cmluZyhlcnIpIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSkoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChtc2c/LnR5cGUgPT09ICdXQUtFX1dPUktFUicpIHtcbiAgICAgICAgICAgICAgICAoYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQWx3YXlzIHN5bmMgbGF0ZXN0IHN0YXRlIGZyb20gc3RvcmFnZSBmaXJzdCAoaW4gY2FzZSBiYWNrZ3JvdW5kIHdvcmtlZCB3aGlsZSB0YWIgc2xlcHQpXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBsYXRlc3RMaXZlID0gZ2V0VmFsdWUoJ2F3X2xpdmVfc3RhdHVzJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobGF0ZXN0TGl2ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChsYXRlc3RMaXZlLmxhc3RXb3JrVGltZXN0YW1wICYmIGxhdGVzdExpdmUubGFzdFdvcmtUaW1lc3RhbXAgPiAoc3RhdGUubGFzdFdvcmtUaW1lc3RhbXAgfHwgMCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUubGFzdFdvcmtUaW1lc3RhbXAgPSBsYXRlc3RMaXZlLmxhc3RXb3JrVGltZXN0YW1wO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5jdXJyZW50RW5lcmd5ID0gbGF0ZXN0TGl2ZS5jdXJyZW50RW5lcmd5O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5wb3N0U2hpZnRFbmVyZ3kgPSBsYXRlc3RMaXZlLmN1cnJlbnRFbmVyZ3k7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLmRvbUVuZXJneVN0YWxlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUuZW5lcmd5U3luY0Jhc2UgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjdXJyZW50OiBsYXRlc3RMaXZlLmN1cnJlbnRFbmVyZ3ksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXg6IGxhdGVzdExpdmUubWF4RW5lcmd5IHx8IHN0YXRlLm1heEVuZXJneSB8fCAxMTUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1cGRhdGVkQXQ6IGxhdGVzdExpdmUudXBkYXRlZEF0IHx8IGxhdGVzdExpdmUubGFzdFdvcmtUaW1lc3RhbXBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGxhdGVzdExpdmUubmV4dFdvcmtUaW1lc3RhbXApIHN0YXRlLm5leHRXb3JrVGltZXN0YW1wID0gbGF0ZXN0TGl2ZS5uZXh0V29ya1RpbWVzdGFtcDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAobGF0ZXN0TGl2ZS53b3JrVG9kYXkgIT0gbnVsbCkgc3RhdGUud29ya1RvZGF5ID0gbGF0ZXN0TGl2ZS53b3JrVG9kYXk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGxhdGVzdExpdmUueHBUb2RheSAhPSBudWxsKSBzdGF0ZS54cFRvZGF5ID0gbGF0ZXN0TGl2ZS54cFRvZGF5O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChsYXRlc3RMaXZlLnRvdGFsV29ya2VkICE9IG51bGwpIHN0YXRlLnRvdGFsV29ya2VkID0gbGF0ZXN0TGl2ZS50b3RhbFdvcmtlZDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAobGF0ZXN0TGl2ZS50b3RhbFdvcmtYUCAhPSBudWxsKSBzdGF0ZS50b3RhbFdvcmtYUCA9IGxhdGVzdExpdmUudG90YWxXb3JrWFA7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzdGF0ZS5ydW5uaW5nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZW5lcmd5ID0gZ2V0U3luY2VkRW5lcmd5KHN0YXRlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZW5lcmd5KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLmN1cnJlbnRFbmVyZ3kgPSBlbmVyZ3kuY3VycmVudDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUubWF4RW5lcmd5ID0gZW5lcmd5Lm1heDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNDb29sZG93bkFjdGl2ZSA9IHN0YXRlLm5leHRXb3JrVGltZXN0YW1wICYmIChEYXRlLm5vdygpIDwgc3RhdGUubmV4dFdvcmtUaW1lc3RhbXAgLSA1MDAwKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBoYXNSZWNlbnRXb3JrID0gc3RhdGUubGFzdFdvcmtUaW1lc3RhbXAgJiYgKERhdGUubm93KCkgLSBzdGF0ZS5sYXN0V29ya1RpbWVzdGFtcCA8IDQ1MDAwKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoc3RhdGUuaXNUYWJMb2NrT3duZXIgJiYgc3RhdGUuY3VycmVudEVuZXJneSA+PSBDT05GSUcuZW5lcmd5VGhyZXNob2xkICYmICFpc0Nvb2xkb3duQWN0aXZlICYmICFoYXNSZWNlbnRXb3JrICYmICFzdGF0ZS53b3JrSW5GbGlnaHQgJiYgIXN0YXRlLndvcmtSZXN1bHRVbmNlcnRhaW4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbG9nKCfimqEgQmFja2dyb3VuZCB3YWtlOiBFbmVyZ2kgdGFyZ2V0IHRlcmNhcGFpLCBtZW5nZWtzZWt1c2kgc2hpZnQga2VyamEuLi4nLCAnaW5mbycpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBkb1dvcmsoeyAuLi5jdHggfSwgZmFsc2UpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzYXZlTGl2ZVN0YXR1cyhzdGF0ZSwgQ09ORklHKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdXBkYXRlUGFuZWwoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhhbmRsZWQ6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc0xvY2tPd25lcjogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVuZXJneTogc3RhdGUuY3VycmVudEVuZXJneSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdvcmtlZDogcmVzdWx0ID09PSAnd29ya2VkJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHVwZGF0ZVBhbmVsKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBzYXZlTGl2ZVN0YXR1cyhzdGF0ZSwgQ09ORklHKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRSZXNwb25zZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaGFuZGxlZDogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc0xvY2tPd25lcjogQm9vbGVhbihzdGF0ZS5pc1RhYkxvY2tPd25lciksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZW5lcmd5OiBzdGF0ZS5jdXJyZW50RW5lcmd5LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdvcmtlZDogZmFsc2VcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbmRSZXNwb25zZSh7IGhhbmRsZWQ6IGZhbHNlLCBlcnJvcjogZXJyPy5tZXNzYWdlIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSkoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfSBjYXRjaCB7IC8qIGlnbm9yZSBpZiBjaHJvbWUucnVudGltZSBpcyB1bmF2YWlsYWJsZSAqLyB9XG5cbiAgICBvblN0b3JhZ2VDaGFuZ2VkKChrZXksIG5ld1ZhbHVlKSA9PiB7XG4gICAgICAgIGlmIChrZXkgPT09ICdhd19saXZlX3N0YXR1cycgJiYgbmV3VmFsdWUpIHtcbiAgICAgICAgICAgIGNvbnN0IGlzQmFja2dyb3VuZFNoaWZ0ID0gQm9vbGVhbihcbiAgICAgICAgICAgICAgICBuZXdWYWx1ZS5sYXN0V29ya1RpbWUgJiZcbiAgICAgICAgICAgICAgICBuZXdWYWx1ZS5sYXN0V29ya1RpbWUgIT09IHN0YXRlLmxhc3RXb3JrVGltZSAmJlxuICAgICAgICAgICAgICAgIChuZXdWYWx1ZS50b3RhbFdvcmtlZCB8fCAwKSA+IChzdGF0ZS50b3RhbFdvcmtlZCB8fCAwKVxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgaWYgKCFzdGF0ZS5pc1RhYkxvY2tPd25lciB8fCBpc0JhY2tncm91bmRTaGlmdCkge1xuICAgICAgICAgICAgICAgIGlmIChuZXdWYWx1ZS53b3JrVG9kYXkgIT0gbnVsbCkgc3RhdGUud29ya1RvZGF5ID0gbmV3VmFsdWUud29ya1RvZGF5O1xuICAgICAgICAgICAgICAgIGlmIChuZXdWYWx1ZS54cFRvZGF5ICE9IG51bGwpIHN0YXRlLnhwVG9kYXkgPSBuZXdWYWx1ZS54cFRvZGF5O1xuICAgICAgICAgICAgICAgIGlmIChuZXdWYWx1ZS50b3RhbFdvcmtlZCAhPSBudWxsKSBzdGF0ZS50b3RhbFdvcmtlZCA9IG5ld1ZhbHVlLnRvdGFsV29ya2VkO1xuICAgICAgICAgICAgICAgIGlmIChuZXdWYWx1ZS50b3RhbFdvcmtYUCAhPSBudWxsKSBzdGF0ZS50b3RhbFdvcmtYUCA9IG5ld1ZhbHVlLnRvdGFsV29ya1hQO1xuICAgICAgICAgICAgICAgIGlmIChuZXdWYWx1ZS5sYXN0V29ya1RpbWUpIHN0YXRlLmxhc3RXb3JrVGltZSA9IG5ld1ZhbHVlLmxhc3RXb3JrVGltZTtcbiAgICAgICAgICAgICAgICBpZiAobmV3VmFsdWUubmV4dFdvcmtUaW1lc3RhbXAgIT0gbnVsbCkgc3RhdGUubmV4dFdvcmtUaW1lc3RhbXAgPSBuZXdWYWx1ZS5uZXh0V29ya1RpbWVzdGFtcDtcbiAgICAgICAgICAgICAgICBpZiAoaXNCYWNrZ3JvdW5kU2hpZnQgJiYgbmV3VmFsdWUuY3VycmVudEVuZXJneSAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXRlLmN1cnJlbnRFbmVyZ3kgPSBuZXdWYWx1ZS5jdXJyZW50RW5lcmd5O1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZS5sYXN0V29ya1RpbWVzdGFtcCA9IG5ld1ZhbHVlLnVwZGF0ZWRBdCB8fCBEYXRlLm5vdygpO1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZS5kb21FbmVyZ3lTdGFsZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIHN0YXRlLmVuZXJneVN5bmNCYXNlID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgY3VycmVudDogbmV3VmFsdWUuY3VycmVudEVuZXJneSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1heDogbmV3VmFsdWUubWF4RW5lcmd5IHx8IHN0YXRlLm1heEVuZXJneSB8fCAxMTAsXG4gICAgICAgICAgICAgICAgICAgICAgICB1cGRhdGVkQXQ6IG5ld1ZhbHVlLnVwZGF0ZWRBdCB8fCBEYXRlLm5vdygpXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChuZXdWYWx1ZS5tYXhFbmVyZ3kgIT0gbnVsbCkgc3RhdGUubWF4RW5lcmd5ID0gbmV3VmFsdWUubWF4RW5lcmd5O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdXBkYXRlUGFuZWwoKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoa2V5ID09PSAnYXdfY29uZmlnJyAmJiBuZXdWYWx1ZSkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKENPTkZJRywgdHlwZW9mIG5ld1ZhbHVlID09PSAnc3RyaW5nJyA/IEpTT04ucGFyc2UobmV3VmFsdWUpIDogbmV3VmFsdWUpO1xuICAgICAgICAgICAgICAgIHVwZGF0ZVBhbmVsKCk7XG4gICAgICAgICAgICB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoa2V5ID09PSAnYXdfcmVjZW50X2xvZ3MnKSB7XG4gICAgICAgICAgICBzdGF0ZS5sb2dzID0gQXJyYXkuaXNBcnJheShuZXdWYWx1ZSkgPyBbLi4ubmV3VmFsdWVdIDogW107XG4gICAgICAgICAgICB1cGRhdGVMb2dWaWV3ZXIoc3RhdGUsIENPTkZJRyk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ3Zpc2liaWxpdHljaGFuZ2UnLCBfaGFuZGxlRm9yZWdyb3VuZFJldHVybik7XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2ZvY3VzJywgX2hhbmRsZUZvcmVncm91bmRSZXR1cm4pO1xuXG4gICAgZnVuY3Rpb24gX2hhbmRsZUZvcmVncm91bmRSZXR1cm4oKSB7XG4gICAgICAgIGlmICghY2hyb21lLnJ1bnRpbWU/LmlkKSByZXR1cm47XG4gICAgICAgIGlmIChkb2N1bWVudC52aXNpYmlsaXR5U3RhdGUgPT09ICdoaWRkZW4nKSByZXR1cm47XG4gICAgICAgIHN0YXRlLmxhc3RGb3JlZ3JvdW5kUmV0dXJuVGltZSA9IERhdGUubm93KCk7XG4gICAgICAgIHVwZGF0ZVBhbmVsVmlzaWJpbGl0eShzdGF0ZSwgQ09ORklHKTtcbiAgICAgICAgcGF0Y2hQYWdlVmlzdWFsRW5lcmd5KHN0YXRlLmN1cnJlbnRFbmVyZ3ksIHN0YXRlLm1heEVuZXJneSwgdHJ1ZSk7XG4gICAgICAgIHNhdmVMaXZlU3RhdHVzKHN0YXRlLCBDT05GSUcpO1xuXG4gICAgICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChbJ2F3X2xpdmVfc3RhdHVzJ10sIGRhdGEgPT4ge1xuICAgICAgICAgICAgY29uc3QgbGl2ZSA9IGRhdGE/LmF3X2xpdmVfc3RhdHVzO1xuICAgICAgICAgICAgaWYgKGxpdmUpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBpc05ld2VyU2hpZnQgPSBCb29sZWFuKFxuICAgICAgICAgICAgICAgICAgICBsaXZlLmxhc3RXb3JrVGltZSAmJlxuICAgICAgICAgICAgICAgICAgICBsaXZlLmxhc3RXb3JrVGltZSAhPT0gc3RhdGUubGFzdFdvcmtUaW1lICYmXG4gICAgICAgICAgICAgICAgICAgIChsaXZlLnRvdGFsV29ya2VkIHx8IDApID4gKHN0YXRlLnRvdGFsV29ya2VkIHx8IDApXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBpZiAoaXNOZXdlclNoaWZ0KSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChsaXZlLmN1cnJlbnRFbmVyZ3kgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUuY3VycmVudEVuZXJneSA9IGxpdmUuY3VycmVudEVuZXJneTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLmxhc3RXb3JrVGltZXN0YW1wID0gbGl2ZS51cGRhdGVkQXQgfHwgRGF0ZS5ub3coKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLmRvbUVuZXJneVN0YWxlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLmVuZXJneVN5bmNCYXNlID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGN1cnJlbnQ6IGxpdmUuY3VycmVudEVuZXJneSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXg6IGxpdmUubWF4RW5lcmd5IHx8IHN0YXRlLm1heEVuZXJneSB8fCAxMTAsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXBkYXRlZEF0OiBsaXZlLnVwZGF0ZWRBdCB8fCBEYXRlLm5vdygpXG4gICAgICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmIChsaXZlLndvcmtUb2RheSAhPSBudWxsKSBzdGF0ZS53b3JrVG9kYXkgPSBsaXZlLndvcmtUb2RheTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGxpdmUueHBUb2RheSAhPSBudWxsKSBzdGF0ZS54cFRvZGF5ID0gbGl2ZS54cFRvZGF5O1xuICAgICAgICAgICAgICAgICAgICBpZiAobGl2ZS50b3RhbFdvcmtlZCAhPSBudWxsKSBzdGF0ZS50b3RhbFdvcmtlZCA9IGxpdmUudG90YWxXb3JrZWQ7XG4gICAgICAgICAgICAgICAgICAgIGlmIChsaXZlLnRvdGFsV29ya1hQICE9IG51bGwpIHN0YXRlLnRvdGFsV29ya1hQID0gbGl2ZS50b3RhbFdvcmtYUDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGxpdmUubGFzdFdvcmtUaW1lKSBzdGF0ZS5sYXN0V29ya1RpbWUgPSBsaXZlLmxhc3RXb3JrVGltZTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGxpdmUubmV4dFdvcmtUaW1lc3RhbXAgIT0gbnVsbCkgc3RhdGUubmV4dFdvcmtUaW1lc3RhbXAgPSBsaXZlLm5leHRXb3JrVGltZXN0YW1wO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmVsb2FkU3RhdGVGcm9tU3RvcmFnZShzdGF0ZSwgKCkgPT4geyB3b3JrSGlzdG9yeSA9IGxvYWRXb3JrSGlzdG9yeShzdGF0ZSwgQ09ORklHKTsgfSk7XG5cbiAgICAgICAgICAgIGNvbnN0IHN5bmNlZCA9IGdldFN5bmNlZEVuZXJneShzdGF0ZSk7XG4gICAgICAgICAgICBpZiAoc3luY2VkKSB7XG4gICAgICAgICAgICAgICAgc3RhdGUuY3VycmVudEVuZXJneSA9IHN5bmNlZC5jdXJyZW50O1xuICAgICAgICAgICAgICAgIHN0YXRlLm1heEVuZXJneSA9IHN5bmNlZC5tYXg7XG4gICAgICAgICAgICAgICAgaWYgKHN0YXRlLmRvbUVuZXJneVN0YWxlKSB7XG4gICAgICAgICAgICAgICAgICAgIHBhdGNoUGFnZVZpc3VhbEVuZXJneShzeW5jZWQuY3VycmVudCwgc3luY2VkLm1heCwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB1cGRhdGVQYW5lbCgpO1xuICAgICAgICAgICAgdXBkYXRlUGFuZWxWaXNpYmlsaXR5KHN0YXRlLCBDT05GSUcpO1xuICAgICAgICAgICAgaWYgKHN0YXRlLnJ1bm5pbmcgJiYgc3RhdGUuaXNUYWJMb2NrT3duZXIgJiYgc3RhdGUuY3VycmVudEVuZXJneSA+PSBDT05GSUcuZW5lcmd5VGhyZXNob2xkKSB7XG4gICAgICAgICAgICAgICAgd2FrZVBlbmRpbmdXb3JrPy4oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgYXN5bmMgZnVuY3Rpb24gcnVuV29ya2VyTG9vcCgpIHtcbiAgICAgICAgbGV0IGVyckNvdW50ID0gMDtcbiAgICAgICAgd2hpbGUgKHRydWUpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgaWYgKCFjaHJvbWUucnVudGltZT8uaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdbQXV0byBXb3JrZXJdIEVrc3RlbnNpIHRlbGFoIGRpLXJlbG9hZC4gTG9vcCBkaWhlbnRpa2FuIGJlcnNpaC4gU2lsYWthbiByZWZyZXNoIHRhYiBnYW1lIChGNSkuJyk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2hlY2tEYWlseVJlc2V0KCk7XG4gICAgICAgICAgICAgICAgaWYgKHN0YXRlLnJ1bm5pbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZG9Xb3JrKGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQgPT09ICdyZXRyeVNvb24nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB3YWl0Rm9yU2NoZWR1bGVkV29yayg1MDAwKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChyZXN1bHQgPT09ICdyZXRyeScpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVyckNvdW50Kys7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBiYWNrb2ZmID0gTWF0aC5taW4oMzAwMDAwLCAxMDAwMCAqIE1hdGgucG93KDIsIGVyckNvdW50IC0gMSkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgbG9nKGDij7MgUmV0cnkgZGFsYW0gJHsoYmFja29mZiAvIDEwMDApLnRvRml4ZWQoMCl9cyAocGVyY29iYWFuIGtlLSR7ZXJyQ291bnR9KS4uLmAsICd3YXJuJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB3YWl0Rm9yU2NoZWR1bGVkV29yayhiYWNrb2ZmKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChyZXN1bHQgPT09ICd3YWl0aW5nJyB8fCByZXN1bHQgPT09ICd3b3JrZWQnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJDb3VudCA9IDA7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBkZWxheSA9IE1hdGgubWF4KDEwMDAsIHN0YXRlLm5leHRXb3JrVGltZXN0YW1wIC0gRGF0ZS5ub3coKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB3YWl0Rm9yU2NoZWR1bGVkV29yayhkZWxheSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB3YWl0Rm9yU2NoZWR1bGVkV29yaygxMDAwMCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCB3YWl0Rm9yU2NoZWR1bGVkV29yaygxMDAwMCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyb3I/Lm1lc3NhZ2U/LmluY2x1ZGVzKCdFeHRlbnNpb24gY29udGV4dCBpbnZhbGlkYXRlZCcpIHx8ICFjaHJvbWUucnVudGltZT8uaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdbQXV0byBXb3JrZXJdIEVrc3RlbnNpIHRlbGFoIGRpLXJlbG9hZC4gTG9vcCBkaWhlbnRpa2FuIGJlcnNpaC4nKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCdbTWFpbkxvb3BdJywgZXJyb3IpO1xuICAgICAgICAgICAgICAgIGxvZyhgTWFpbiBsb29wIGVycm9yOiAke2Vycm9yLm1lc3NhZ2V9YCwgJ2Vycm9yJyk7XG4gICAgICAgICAgICAgICAgZXJyQ291bnQrKztcbiAgICAgICAgICAgICAgICBjb25zdCBiYWNrb2ZmID0gTWF0aC5taW4oMzAwMDAwLCAxMDAwMCAqIE1hdGgucG93KDIsIGVyckNvdW50IC0gMSkpO1xuICAgICAgICAgICAgICAgIGF3YWl0IHdhaXRGb3JTY2hlZHVsZWRXb3JrKGJhY2tvZmYpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKCFzdGF0ZS50YWJMb2NrTWFuYWdlZCkge1xuICAgICAgICBsb2coJ1dlYiBMb2NrcyB0aWRhayB0ZXJzZWRpYTsgcGVybGluZHVuZ2FuIG11bHRpLXRhYiB0aWRhayBha3RpZi4nLCAnd2FybicpO1xuICAgICAgICBhd2FpdCBydW5Xb3JrZXJMb29wKCk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBfc2V0VGFiTG9ja093bmVyKHN0YXRlLCBmYWxzZSwgY3R4KTtcbiAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgICBsZXQgYWNxdWlyZWQgPSBmYWxzZTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IG5hdmlnYXRvci5sb2Nrcy5yZXF1ZXN0KCdwYXJsYW1lbnR1bS1hdXRvLXdvcmtlcicsIHsgaWZBdmFpbGFibGU6IHRydWUgfSwgYXN5bmMgbG9jayA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKCFsb2NrKSByZXR1cm47XG4gICAgICAgICAgICAgICAgYWNxdWlyZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHJlbG9hZFN0YXRlRnJvbVN0b3JhZ2Uoc3RhdGUsICgpID0+IHsgd29ya0hpc3RvcnkgPSBsb2FkV29ya0hpc3Rvcnkoc3RhdGUsIENPTkZJRyk7IH0pO1xuICAgICAgICAgICAgICAgIGlmIChnZXRWYWx1ZSgnYXdfd29ya1Jlc3VsdFVuY2VydGFpbicsICdmYWxzZScpID09PSAndHJ1ZScpIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUud29ya1Jlc3VsdFVuY2VydGFpbiA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIHN0YXRlLnJ1bm5pbmcgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgdXBkYXRlUGFuZWwoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgX3NldFRhYkxvY2tPd25lcihzdGF0ZSwgdHJ1ZSwgY3R4KTtcbiAgICAgICAgICAgICAgICBzdGF0ZS53YWl0ZWRGb3JUYWJMb2NrID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgYXdhaXQgcnVuV29ya2VyTG9vcCgpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBsb2coYFdlYiBMb2NrcyBnYWdhbDogJHtlcnJvci5tZXNzYWdlfS4gV29ya2VyIGRpamVkYS5gLCAnZXJyb3InKTtcbiAgICAgICAgICAgIHN0YXRlLnJ1bm5pbmcgPSBmYWxzZTtcbiAgICAgICAgICAgIF9zZXRUYWJMb2NrT3duZXIoc3RhdGUsIGZhbHNlLCBjdHgpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGlmICghYWNxdWlyZWQpIHtcbiAgICAgICAgICAgIHN0YXRlLndhaXRlZEZvclRhYkxvY2sgPSB0cnVlO1xuICAgICAgICAgICAgX3NldFRhYkxvY2tPd25lcihzdGF0ZSwgZmFsc2UsIGN0eCk7XG4gICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgNTAwMCkpO1xuICAgICAgICB9XG4gICAgfVxufSkoKTtcblxuLy8g4pSA4pSA4pSAIFByaXZhdGUgdXRpbGl0aWVzIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuXG5mdW5jdGlvbiBfcnVuTWlncmF0aW9ucyhzdGF0ZSwgQ09ORklHLCB3b3JrSGlzdG9yeSkge1xuICAgIGNvbnN0IHZlcnNpb24gPSBnZXRTdG9yZWRJbnRlZ2VyKCdhd19lbmVyZ3lTY2hlbWFWZXJzaW9uJywgMSwgMSwgMik7XG4gICAgaWYgKHZlcnNpb24gPj0gMikgcmV0dXJuO1xuXG4gICAgaWYgKHN0YXRlLnRvdGFsV29ya1hQIDwgc3RhdGUudG90YWxXb3JrZWQgKiAzICYmIHN0YXRlLnRvdGFsV29ya2VkID4gMCkge1xuICAgICAgICBzdGF0ZS50b3RhbFdvcmtYUCA9IHN0YXRlLnRvdGFsV29ya2VkICogMTAgLyAxMCAqIDQ7IC8vIHJvdWdoIGVzdGltYXRlXG4gICAgICAgIHNldFZhbHVlKCd0b3RhbFdvcmtYUCcsIHN0YXRlLnRvdGFsV29ya1hQLnRvU3RyaW5nKCkpO1xuICAgIH1cbiAgICBpZiAoc3RhdGUudG90YWxFbmVyZ3lTcGVudCA8IHN0YXRlLnRvdGFsV29ya2VkICogNSAmJiBzdGF0ZS50b3RhbFdvcmtlZCA+IDApIHtcbiAgICAgICAgc3RhdGUudG90YWxFbmVyZ3lTcGVudCA9IHN0YXRlLnRvdGFsV29ya2VkICogMTA7XG4gICAgICAgIHNldFZhbHVlKCd0b3RhbEVuZXJneVNwZW50Jywgc3RhdGUudG90YWxFbmVyZ3lTcGVudC50b1N0cmluZygpKTtcbiAgICAgICAgY29uc29sZS5sb2coJ1tJbml0XSDwn5SnIEVzdGltYXNpIGVuZXJnaSBtYXNhIGxhbHUgZGl0ZXJhcGthbiAobWlncmFzaSBzZWthbGkgamFsYW4pLicpO1xuICAgIH1cbiAgICBzZXRWYWx1ZSgnYXdfZW5lcmd5U2NoZW1hVmVyc2lvbicsICcyJyk7XG59XG5cbmZ1bmN0aW9uIF9jaGVja0FuZFJlZnJlc2hUb2tlbihzdGF0ZSwgQ09ORklHLCBsb2csIGN0eCA9IG51bGwpIHtcbiAgICBpZiAoIWNocm9tZS5ydW50aW1lPy5pZCkgcmV0dXJuO1xuICAgIGlmICghc3RhdGUuY3VycmVudFRva2VuKSByZXR1cm47XG4gICAgaWYgKCFzdGF0ZS50b2tlbkV4cGlyeSkgcmV0dXJuO1xuICAgIGNvbnN0IHJlbWFpbmluZyA9IHN0YXRlLnRva2VuRXhwaXJ5IC0gRGF0ZS5ub3coKTtcbiAgICBpZiAocmVtYWluaW5nIDw9IDApIHtcbiAgICAgICAgaWYgKCFzdGF0ZS5wYXVzZWRGb3JUb2tlbikge1xuICAgICAgICAgICAgbG9nKCfwn5SEIFRva2VuIHNlc2kga2VkYWx1d2Fyc2EuIE1lLXJlbG9hZCB0YWIgb3RvbWF0aXMgdW50dWsgbWVtcGVyYmFydWkgdG9rZW4gdmlhIHNlc3Npb24gY29va2llLi4uJywgJ3dhcm4nKTtcbiAgICAgICAgICAgIHN0YXRlLnBhdXNlZEZvclRva2VuID0gdHJ1ZTtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICAgIHdpbmRvdy5sb2NhdGlvbi5yZWxvYWQoKTtcbiAgICAgICAgICAgIH0sIDE1MDApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKHJlbWFpbmluZyA8IENPTkZJRy50b2tlbkV4cGlyeVRocmVzaG9sZCkge1xuICAgICAgICBsb2coYFRva2VuIGFrYW4gZXhwaXJlZCBkYWxhbSAke01hdGgucm91bmQocmVtYWluaW5nIC8gMTAwMCl9IGRldGlrIWAsICd3YXJuJyk7XG4gICAgICAgIGxvZygnVG9rZW4gdGlkYWsgYXV0by1yZWZyZXNoLiBMb2dpbiB1bGFuZyBqaWthIGV4cGlyZWQuJywgJ3dhcm4nKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIF9zZXRUYWJMb2NrT3duZXIoc3RhdGUsIGlzT3duZXIsIGN0eCkge1xuICAgIHN0YXRlLmlzVGFiTG9ja093bmVyID0gaXNPd25lcjtcbiAgICBpZiAoY3R4Py5DT05GSUcpIHtcbiAgICAgICAgdXBkYXRlUGFuZWxWaXNpYmlsaXR5KHN0YXRlLCBjdHguQ09ORklHKTtcbiAgICB9XG4gICAgLy8gTm90aWZ5IFVJIG1vZHVsZXMgb2Ygb3duZXJzaGlwIGNoYW5nZVxuICAgIGN0eC51cGRhdGVQYW5lbD8uKCk7XG59XG5cbmZ1bmN0aW9uIF9sb2dTdGFydHVwKGxvZywgQ09ORklHLCBzdGF0ZSkge1xuICAgIGNvbnN0IHVwdGltZSA9IE1hdGguZmxvb3IoKERhdGUubm93KCkgLSBzdGF0ZS5zY3JpcHRTdGFydFRpbWUpIC8gMTAwMCk7XG4gICAgbG9nKCfwn5qAIEF1dG8gV29ya2VyIHY1LjExLjAgSEFSREVORUQgKE5ldHdvcmsgSW50ZXJjZXB0b3IpIGFrdGlmIScsICdzdWNjZXNzJyk7XG4gICAgbG9nKGDimqEgRW5lcmd5IFRocmVzaG9sZDogJHtDT05GSUcuZW5lcmd5VGhyZXNob2xkfSAodWJhaCBkaSBTZXR0aW5ncylgLCAnaW5mbycpO1xuICAgIGxvZyhg8J+Xk++4jyBIaXN0b3J5OiBzaW1wYW4gJHtDT05GSUcuaGlzdG9yeU1heERheXN9IGhhcmkgdGVyYWtoaXJgLCAnaW5mbycpO1xuICAgIGxvZyhg8J+UhyBRdWlldCBtb2RlOiAke0NPTkZJRy5xdWlldE1vZGVFbmFibGVkID8gJ09OJyA6ICdPRkYnfWAsICdpbmZvJyk7XG4gICAgbG9nKGDijKjvuI8gU2hvcnRjdXRzOiAke09iamVjdC52YWx1ZXMoQ09ORklHLnNob3J0Y3V0cykubWFwKHMgPT4gcy5kaXNwbGF5KS5qb2luKCcsICcpfWAsICdpbmZvJyk7XG4gICAgbG9nKGDij7HvuI8gU2NyaXB0IHVwdGltZTogJHt1cHRpbWV9c2AsICdpbmZvJyk7XG59XG5cbmZ1bmN0aW9uIF93YXRjaFNwYU5hdmlnYXRpb24ob25Sb3V0ZUNoYW5nZWQpIHtcbiAgICBsZXQgbGFzdFBhdGggPSB3aW5kb3cubG9jYXRpb24ucGF0aG5hbWU7XG4gICAgY29uc3QgY2hlY2sgPSAoKSA9PiB7XG4gICAgICAgIGlmICh3aW5kb3cubG9jYXRpb24ucGF0aG5hbWUgIT09IGxhc3RQYXRoKSB7XG4gICAgICAgICAgICBsYXN0UGF0aCA9IHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZTtcbiAgICAgICAgICAgIG9uUm91dGVDaGFuZ2VkPy4oKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgb3JpZ1B1c2hTdGF0ZSA9IGhpc3RvcnkucHVzaFN0YXRlO1xuICAgICAgICBoaXN0b3J5LnB1c2hTdGF0ZSA9IGZ1bmN0aW9uKC4uLmFyZ3MpIHtcbiAgICAgICAgICAgIG9yaWdQdXNoU3RhdGUuYXBwbHkodGhpcywgYXJncyk7XG4gICAgICAgICAgICBjaGVjaygpO1xuICAgICAgICB9O1xuICAgICAgICBjb25zdCBvcmlnUmVwbGFjZVN0YXRlID0gaGlzdG9yeS5yZXBsYWNlU3RhdGU7XG4gICAgICAgIGhpc3RvcnkucmVwbGFjZVN0YXRlID0gZnVuY3Rpb24oLi4uYXJncykge1xuICAgICAgICAgICAgb3JpZ1JlcGxhY2VTdGF0ZS5hcHBseSh0aGlzLCBhcmdzKTtcbiAgICAgICAgICAgIGNoZWNrKCk7XG4gICAgICAgIH07XG4gICAgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3BvcHN0YXRlJywgY2hlY2spO1xuICAgIHNldEludGVydmFsKGNoZWNrLCAxMDAwKTtcbn1cbiJdLCJuYW1lcyI6WyJsb2FkV29ya0hpc3RvcnkiLCJoaXN0b3J5IiwiY2xlYXJTdG9yZWRMb2dzIiwiZ2V0Q3VycmVudEVuZXJneSIsIm1hdGNoZXMiLCJtIiwic3luY0Jhc2UiLCJsb2ciLCJzZXRSdW5uaW5nVUkiLCJzZW5kTm90aWZpY2F0aW9uIiwicGxheU5vdGlmaWNhdGlvblNvdW5kIiwidXBkYXRlUGFuZWwiLCJzZXRWYWx1ZSIsImdldFN5bmNlZEVuZXJneSIsImdldFBsYXllckxldmVsIiwiZ2V0TWF4RW5lcmd5Rm9yTGV2ZWwiLCJvcGVuU2V0dGluZ3MiLCJvcGVuQW5hbHl0aWNzIiwib3BlbkxvZ1ZpZXdlciIsImRvV29yayIsIl9sb2ciLCJoYW5kbGVOZXdUb2tlbiIsIl9oYW5kbGVOZXdUb2tlbiIsIl9nZXRUb2tlbkZyb21TdG9yYWdlIiwiX3VwZGF0ZVBhbmVsIl0sIm1hcHBpbmdzIjoiOztBQVNBLFFBQU0sU0FBUyxDQUFBO0FBS1IsaUJBQWUsY0FBYztBQUNoQyxVQUFNLE9BQU8sTUFBTSxPQUFPLFFBQVEsTUFBTSxJQUFJLElBQUk7QUFDaEQsV0FBTyxPQUFPLFFBQVEsSUFBSTtBQUFBLEVBQzlCO0FBRU8sV0FBUyxTQUFTLEtBQUssYUFBYSxNQUFNO0FBQzdDLFdBQU8sT0FBTyxTQUFTLE9BQU8sR0FBRyxJQUFJO0FBQUEsRUFDekM7QUFFTyxXQUFTLFNBQVMsS0FBSyxPQUFPO0FBQ2pDLFdBQU8sR0FBRyxJQUFJO0FBQ2QsUUFBSSxDQUFDLE9BQU8sU0FBUyxHQUFJO0FBQ3pCLFFBQUk7QUFDQSxhQUFPLFFBQVEsTUFBTSxJQUFJLEVBQUUsQ0FBQyxHQUFHLEdBQUcsTUFBSyxDQUFFLEVBQUUsTUFBTSxTQUFPO0FBQ3BELFlBQUksS0FBSyxTQUFTLFNBQVMsK0JBQStCLEVBQUc7QUFDN0QsZ0JBQVEsTUFBTSw4QkFBOEIsS0FBSyxHQUFHO0FBQUEsTUFDeEQsQ0FBQztBQUFBLElBQ0wsUUFBUTtBQUFBLElBQTRCO0FBQUEsRUFDeEM7QUFpQk8sV0FBUyxpQkFBaUIsVUFBVTtBQUN2QyxXQUFPLFFBQVEsVUFBVSxZ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QUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBNkpwQixhQUFTLEtBQUssWUFBWSxLQUFLO0FBQUEsRUFDbkM7QUFFTyxXQUFTLGdCQUFnQixPQUFPLFFBQVE7QUFDM0MsMEJBQXFCO0FBRXJCLFVBQU0sTUFBTSxTQUFTLGVBQWUsY0FBYztBQUNsRCxRQUFJLElBQUssS0FBSSxPQUFNO0FBRW5CLFVBQU0sUUFBUSxTQUFTLGNBQWMsS0FBSztBQUMxQyxVQUFNLEtBQUs7QUFDWCxVQUFNLE1BQU0sVUFBVTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBWXRCLFVBQU0sWUFBWTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQWtKbEIsYUFBUyxLQUFLLFlBQVksS0FBSztBQUUvQixhQUFTLFdBQVc7QUFBRSxZ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
