const LEVEL_RANK = {
  verbose: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  silent: 100,
};

const DB_CACHE_TTL_MS = 60_000;
const runtimeSettingsCache = {
  expiresAt: 0,
  values: {},
  inflight: null,
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

async function fetchRuntimeSettingsFromDb(keys) {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    try {
      const rows = await prisma.runtimeSetting.findMany({
        where: {
          key: { in: keys },
        },
        select: {
          key: true,
          value: true,
        },
      });

      const map = {};
      for (const row of rows) {
        map[row.key] = row.value;
      }
      return map;
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    return {};
  }
}

function refreshRuntimeSettings(keys) {
  if (runtimeSettingsCache.inflight) {
    return runtimeSettingsCache.inflight;
  }

  runtimeSettingsCache.inflight = fetchRuntimeSettingsFromDb(keys)
    .then((values) => {
      runtimeSettingsCache.values = values;
      runtimeSettingsCache.expiresAt = Date.now() + DB_CACHE_TTL_MS;
    })
    .finally(() => {
      runtimeSettingsCache.inflight = null;
    });

  return runtimeSettingsCache.inflight;
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

  if (Date.now() > runtimeSettingsCache.expiresAt) {
    void refreshRuntimeSettings(envKeys);
  }

  for (const key of envKeys) {
    const runtimeValue = runtimeSettingsCache.values[key];
    if (runtimeValue) {
      return normalizeLevel(runtimeValue, fallback);
    }
  }

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
