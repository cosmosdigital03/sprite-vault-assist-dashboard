(() => {
  const PAGE_SIZE = 1000;
  const MAX_ROWS = 10000;

  let memberTradeMeta = new Map();
  let tradeEvents = [];
  let loading = null;

  const originalRenderBreakdown = renderBreakdown;
  const originalRenderLeaderboard = renderLeaderboard;
  const originalOpenMemberProfile = openMemberProfile;
  const originalLoadData = loadData;

  renderBreakdown = function renderBreakdownWithSyncedTrades() {
    originalRenderBreakdown();
    refreshTradeData()
      .then(renderSyncedTradeBreakdown)
      .catch((error) => console.warn("No se pudo actualizar el total de trades:", error));
  };

  renderLeaderboard = function renderLeaderboardWithSyncedTrades() {
    originalRenderLeaderboard();
    refreshTradeData()
      .then(decorateVisibleTradeTotals)
      .catch((error) => console.warn("No se pudieron decorar los trades:", error));
  };

  openMemberProfile = function openMemberProfileWithSyncedTrades(userId) {
    originalOpenMemberProfile(userId);
    refreshTradeData()
      .then(() => decorateProfileTradeTotal(String(userId)))
      .catch((error) => console.warn("No se pudo mostrar el total de trades del perfil:", error));
  };

  loadData = async function loadDataWithSyncedTrades() {
    await originalLoadData();
    await refreshTradeData(true);
    renderSyncedTradeBreakdown();
    decorateVisibleTradeTotals();
  };

  refreshTradeData(true)
    .then(() => {
      renderSyncedTradeBreakdown();
      decorateVisibleTradeTotals();
    })
    .catch((error) => console.warn("No se pudo cargar el historial de trades sincronizados:", error));

  async function refreshTradeData(force = false) {
    if (loading) return loading;
    if (!force && memberTradeMeta.size) return;

    loading = (async () => {
      if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) return;

      const memberRows = [];
      for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
        const path =
          `/rest/v1/assist_members?select=discord_user_id,trade_count_base,trade_synced_at` +
          `&limit=${PAGE_SIZE}&offset=${offset}`;
        const page = await supabaseGet(path);
        memberRows.push(...page);
        if (page.length < PAGE_SIZE) break;
      }

      memberTradeMeta = new Map(
        memberRows.map((row) => [
          String(row.discord_user_id || ""),
          {
            trade_count_base: normalizeNonNegativeInt(row.trade_count_base),
            trade_synced_at: row.trade_synced_at || null
          }
        ])
      );

      const rows = [];
      for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
        const path =
          `/rest/v1/assist_events?select=id,helper_id,reason,quantity,created_at` +
          `&reason=eq.safe_exchange&order=created_at.asc&limit=${PAGE_SIZE}&offset=${offset}`;
        const page = await supabaseGet(path);
        rows.push(...page);
        if (page.length < PAGE_SIZE) break;
      }

      tradeEvents = rows.map((row) => ({
        id: row.id,
        helper_id: String(row.helper_id || ""),
        quantity: normalizePositiveInt(row.quantity),
        created_at: row.created_at || new Date(0).toISOString()
      }));
    })();

    try {
      await loading;
    } finally {
      loading = null;
    }
  }

  function totalTradesForMember(userId) {
    const id = String(userId || "");
    const meta = memberTradeMeta.get(id) || {
      trade_count_base: 0,
      trade_synced_at: null
    };

    const cutoff = meta.trade_synced_at ? new Date(meta.trade_synced_at).getTime() : null;
    const eventQuantity = tradeEvents.reduce((sum, event) => {
      if (event.helper_id !== id) return sum;
      if (cutoff !== null && new Date(event.created_at).getTime() <= cutoff) return sum;
      return sum + event.quantity;
    }, 0);

    return meta.trade_count_base + eventQuantity;
  }

  function totalTradesCommunity() {
    const ids = new Set([
      ...memberTradeMeta.keys(),
      ...tradeEvents.map((event) => event.helper_id)
    ]);

    let total = 0;
    ids.forEach((id) => {
      total += totalTradesForMember(id);
    });
    return total;
  }

  function renderSyncedTradeBreakdown() {
    if (!els.breakdownTradeBar || !els.breakdownTradeValue) return;

    const tradeTotal = totalTradesCommunity();
    const gifted = parseDisplayedNumber(els.breakdownGiftedValue?.textContent);
    const indexed = parseDisplayedNumber(els.breakdownIndexValue?.textContent);
    const max = Math.max(gifted, indexed, tradeTotal, 1);

    updateBreakdownItem(
      els.breakdownTradeBar,
      els.breakdownTradeValue,
      tradeTotal,
      max
    );
  }

  function decorateVisibleTradeTotals() {
    document.querySelectorAll("#leaderboardList [data-user-id]").forEach((row) => {
      const id = row.dataset.userId;
      const meta = row.querySelector(".member-meta");
      if (!id || !meta) return;

      meta.querySelector(".synced-trade-total")?.remove();

      const total = totalTradesForMember(id);
      if (!total) return;

      const line = document.createElement("small");
      line.className = "synced-trade-total";
      line.textContent = `🤝 ${formatNumber(total)} trade${total === 1 ? "" : "s"} totales`;
      line.title = "Incluye el historial sincronizado de BotGhost y los trades nuevos registrados en Supabase.";
      meta.appendChild(line);
    });
  }

  function decorateProfileTradeTotal(userId) {
    if (!els.memberDialog?.open) return;
    const breakdown = els.dialogProfile?.querySelector(".dialog-breakdown");
    if (!breakdown) return;

    breakdown.querySelector("[data-synced-trade-total]")?.remove();

    const total = totalTradesForMember(userId);
    const item = document.createElement("div");
    item.className = "dialog-break-item";
    item.dataset.syncedTradeTotal = "true";
    item.innerHTML = `
      <span>🤝</span>
      <div>
        <small>Intercambios seguros</small>
        <strong>${formatNumber(total)}</strong>
      </div>
    `;
    breakdown.appendChild(item);
  }

  function normalizePositiveInt(value) {
    const number = Number(value ?? 1);
    return Number.isInteger(number) && number > 0 ? number : 1;
  }

  function normalizeNonNegativeInt(value) {
    const number = Number(value ?? 0);
    return Number.isInteger(number) && number >= 0 ? number : 0;
  }

  function parseDisplayedNumber(value) {
    const digits = String(value || "").replace(/[^0-9-]/g, "");
    return Number(digits || 0);
  }

  if (!document.querySelector("#tradeSyncDashboardStyles")) {
    const style = document.createElement("style");
    style.id = "tradeSyncDashboardStyles";
    style.textContent = `
      .synced-trade-total {
        display: block;
        margin-top: 3px;
        font-size: 10px !important;
        opacity: .82 !important;
      }
    `;
    document.head.appendChild(style);
  }
})();
