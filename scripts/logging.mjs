const LEVEL_RANK = {
  verbose: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  silent: 100,
};

function normalizeLevel(raw, fallback = "info") {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "warning") return "warn";
  if (Object.prototype.hasOwnProperty.call(LEVEL_RANK, value)) {
    return value;
  }
  return fallback;
}

function sanitizeScopeForEnv(scope) {
  return String(scope)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function resolveScriptLogLevel(scope, options = {}) {
  const fallback = normalizeLevel(options.defaultLevel ?? "info", "info");
  const extraEnvKeys = Array.isArray(options.envKeys) ? options.envKeys : [];
  const scopedKey = `${sanitizeScopeForEnv(scope)}_LOG_LEVEL`;
  const envKeys = [
    ...extraEnvKeys,
    scopedKey,
    "WORKER_LOG_LEVEL",
    "SCRIPT_LOG_LEVEL",
    "LOG_LEVEL",
  ];

  for (const key of envKeys) {
    const value = process.env[key];
    if (!value) continue;
    return normalizeLevel(value, fallback);
  }

  return fallback;
}

export function createScriptLogger(scope, options = {}) {
  const level = normalizeLevel(options.level ?? resolveScriptLogLevel(scope, options), "info");
  const threshold = LEVEL_RANK[level];

  function shouldLog(entryLevel) {
    return LEVEL_RANK[entryLevel] >= threshold;
  }

  function write(entryLevel, message, data = null) {
    if (!shouldLog(entryLevel)) return;

    const payload = {
      ts: new Date().toISOString(),
      level: entryLevel,
      scope,
      message,
    };

    if (data && typeof data === "object" && !Array.isArray(data)) {
      Object.assign(payload, data);
    } else if (data != null) {
      payload.data = data;
    }

    const line = JSON.stringify(payload);

    if (entryLevel === "error") {
      console.error(line);
      return;
    }

    if (entryLevel === "warn") {
      console.warn(line);
      return;
    }

    console.log(line);
  }

  return {
    level,
    shouldLog,
    verbose(message, data) {
      write("verbose", message, data);
    },
    debug(message, data) {
      write("debug", message, data);
    },
    info(message, data) {
      write("info", message, data);
    },
    warn(message, data) {
      write("warn", message, data);
    },
    error(message, data) {
      write("error", message, data);
    },
  };
}
