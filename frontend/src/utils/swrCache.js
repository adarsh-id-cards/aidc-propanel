/**
 * Lightweight, robust SWR (Stale-While-Revalidate) Cache.
 * Provides instantaneous (0ms) data retrieval from memory with sessionStorage persistence.
 * Eliminates layout flashing, blank loading states, and waterfalls on navigation.
 */

const memoryStore = new Map();
const TTL_DEFAULT = 5 * 60 * 1000; // 5 minutes default

export const swrCache = {
  get(key) {
    if (!key) return null;
    // 1. Check in-memory Map (synchronous 0ms)
    if (memoryStore.has(key)) {
      const entry = memoryStore.get(key);
      return entry?.data !== undefined ? entry.data : null;
    }
    // 2. Fallback to sessionStorage
    try {
      const stored = sessionStorage.getItem(`cf_swr_${key}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.data !== undefined) {
          memoryStore.set(key, parsed);
          return parsed.data;
        }
      }
    } catch (_) {}
    return null;
  },

  isStale(key, ttl = TTL_DEFAULT) {
    if (!key) return true;
    let entry = memoryStore.get(key);
    if (!entry) {
      try {
        const stored = sessionStorage.getItem(`cf_swr_${key}`);
        if (stored) entry = JSON.parse(stored);
      } catch (_) {}
    }
    if (!entry || !entry.timestamp) return true;
    return Date.now() - entry.timestamp > ttl;
  },

  set(key, data, ttl = TTL_DEFAULT) {
    if (!key || data === undefined) return;
    const entry = {
      data,
      timestamp: Date.now(),
      ttl,
    };
    memoryStore.set(key, entry);
    try {
      sessionStorage.setItem(`cf_swr_${key}`, JSON.stringify(entry));
    } catch (_) {
      try {
        // Quota safety: evict older cf_swr_ items if storage is full
        Object.keys(sessionStorage).forEach((k) => {
          if (k.startsWith('cf_swr_') && k !== `cf_swr_${key}`) {
            sessionStorage.removeItem(k);
          }
        });
        sessionStorage.setItem(`cf_swr_${key}`, JSON.stringify(entry));
      } catch (_) {}
    }
  },

  invalidate(key) {
    if (!key) return;
    memoryStore.delete(key);
    try {
      sessionStorage.removeItem(`cf_swr_${key}`);
    } catch (_) {}
  },

  invalidatePattern(pattern) {
    if (!pattern) return;
    const re = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    for (const key of Array.from(memoryStore.keys())) {
      if (re.test(key)) {
        memoryStore.delete(key);
      }
    }
    try {
      Object.keys(sessionStorage).forEach((k) => {
        if (k.startsWith('cf_swr_') && re.test(k.replace('cf_swr_', ''))) {
          sessionStorage.removeItem(k);
        }
      });
    } catch (_) {}
  },

  clear() {
    memoryStore.clear();
    try {
      Object.keys(sessionStorage).forEach((k) => {
        if (k.startsWith('cf_swr_')) {
          sessionStorage.removeItem(k);
        }
      });
    } catch (_) {}
  },
};

export default swrCache;

