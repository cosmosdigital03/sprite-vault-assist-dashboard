(() => {
  if (window.__SPRITE_VAULT_PERFORMANCE_CORE__) return;
  window.__SPRITE_VAULT_PERFORMANCE_CORE__ = true;

  if (typeof supabaseGet !== "function") return;

  const baseSupabaseGet = supabaseGet;
  const cache = new Map();
  const HEAVY_TTL_MS = 60_000;

  supabaseGet = function cachedSupabaseGet(path) {
    const plan = canonicalPlan(path);
    if (!plan) return baseSupabaseGet(path);

    const now = Date.now();
    const existing = cache.get(plan.key);
    if (existing && now - existing.createdAt < HEAVY_TTL_MS) {
      return existing.promise;
    }

    const promise = baseSupabaseGet(plan.path).catch((error) => {
      if (cache.get(plan.key)?.promise === promise) cache.delete(plan.key);
      throw error;
    });

    cache.set(plan.key, { createdAt: now, promise });
    return promise;
  };

  window.SpriteVaultPerformance = {
    clearCache() {
      cache.clear();
    },
    get cachedRequests() {
      return cache.size;
    }
  };

  document.querySelector("#refreshButton")?.addEventListener("click", () => cache.clear(), { capture: true });

  function canonicalPlan(path) {
    let url;
    try {
      url = new URL(path, "https://sprite-vault.local");
    } catch {
      return null;
    }

    const pathname = url.pathname;
    const params = url.searchParams;
    const limit = Math.max(1, Number(params.get("limit") || 0));
    const offset = Math.max(0, Number(params.get("offset") || 0));
    const order = params.get("order") || "";
    const reason = params.get("reason") || "";

    if (pathname.endsWith("/rest/v1/assist_events") && limit >= 1000 && !reason) {
      const canonicalPath =
        "/rest/v1/assist_events" +
        "?select=id,helper_id,helper_name,giver_id,giver_name,reason,quantity,created_at" +
        `&order=${encodeURIComponent(order || "created_at.desc")}` +
        `&limit=${limit}&offset=${offset}`;
      return {
        key: `assist-events:all:${order || "created_at.desc"}:${limit}:${offset}`,
        path: canonicalPath
      };
    }

    if (
      pathname.endsWith("/rest/v1/assist_events") &&
      limit >= 1000 &&
      reason === "eq.safe_exchange"
    ) {
      const canonicalPath =
        "/rest/v1/assist_events" +
        "?select=id,helper_id,reason,quantity,created_at" +
        "&reason=eq.safe_exchange" +
        `&order=${encodeURIComponent(order || "created_at.asc")}` +
        `&limit=${limit}&offset=${offset}`;
      return {
        key: `assist-events:trades:${order || "created_at.asc"}:${limit}:${offset}`,
        path: canonicalPath
      };
    }

    if (pathname.endsWith("/rest/v1/assist_members") && limit >= 1000) {
      const select = params.get("select") || "";
      if (select.includes("trade_count_base") || select.includes("trade_synced_at")) {
        const canonicalPath =
          "/rest/v1/assist_members" +
          "?select=discord_user_id,trade_count_base,trade_synced_at" +
          `&limit=${limit}&offset=${offset}`;
        return {
          key: `assist-members:trade-meta:${limit}:${offset}`,
          path: canonicalPath
        };
      }
    }

    return null;
  }
})();
