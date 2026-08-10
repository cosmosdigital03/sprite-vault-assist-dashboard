(() => {
  const PAGE_SIZE = 1000;
  const MAX_ROWS = 10000;
  const FILTER_TYPES = {
    all: () => true,
    help: (event) => ["gifted_sprite", "index_help", "community_help"].includes(event.reason),
    trade: (event) => event.reason === "safe_exchange",
    gift: (event) => event.reason === "gifted_sprite",
    index: (event) => event.reason === "index_help"
  };

  let activityDays = 14;
  let activityType = "all";
  let searchText = "";
  let allEvents = [];
  let memberTradeMeta = new Map();
  let loadingEvents = null;

  const originalApplySearch = applySearch;
  const originalRenderLeaderboard = renderLeaderboard;
  const originalLoadData = loadData;

  installStyles();
  installControls();

  applySearch = function staffApplySearch(query) {
    searchText = String(query || "").trim().toLocaleLowerCase("es");
    applyStaffFilters();
    originalRenderLeaderboard();
    decorateRows();
    renderFilterSummary();
  };

  renderLeaderboard = function staffRenderLeaderboard() {
    applyStaffFilters();
    originalRenderLeaderboard();
    decorateRows();
    renderFilterSummary();
  };

  loadData = async function staffLoadData() {
    await originalLoadData();
    await refreshAllEvents();
    renderLeaderboard();
  };

  refreshAllEvents()
    .catch((error) => console.warn("No se pudo cargar el historial para filtros:", error))
    .finally(() => renderLeaderboard());

  async function refreshAllEvents() {
    if (loadingEvents) return loadingEvents;

    loadingEvents = (async () => {
      if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
        allEvents = [...(state.events || [])];
        return;
      }

      const [eventRows, memberRows] = await Promise.all([
        fetchAllEvents(),
        fetchTradeMetadata()
      ]);

      allEvents = normalizeFilterEvents(eventRows);
      memberTradeMeta = new Map(
        memberRows.map((row) => [
          String(row.discord_user_id || ""),
          {
            trade_count_base: normalizeNonNegativeInt(row.trade_count_base),
            trade_synced_at: row.trade_synced_at || null
          }
        ])
      );
    })();

    try {
      await loadingEvents;
    } finally {
      loadingEvents = null;
    }
  }

  async function fetchAllEvents() {
    const rows = [];
    for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
      const path =
        `/rest/v1/assist_events?select=id,helper_id,helper_name,giver_id,giver_name,reason,quantity,created_at` +
        `&order=created_at.desc&limit=${PAGE_SIZE}&offset=${offset}`;
      const page = await supabaseGet(path);
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
    return rows;
  }

  async function fetchTradeMetadata() {
    const rows = [];
    for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
      const path =
        `/rest/v1/assist_members?select=discord_user_id,trade_count_base,trade_synced_at` +
        `&limit=${PAGE_SIZE}&offset=${offset}`;
      const page = await supabaseGet(path);
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
    return rows;
  }

  function normalizeFilterEvents(rows) {
    return [...(rows || [])]
      .map((row) => ({
        id: row.id,
        helper_id: String(row.helper_id || ""),
        helper_name: row.helper_name || "Miembro",
        giver_id: String(row.giver_id || ""),
        giver_name: row.giver_name || "Otro miembro",
        reason: row.reason || "community_help",
        quantity: normalizePositiveInt(row.quantity),
        created_at: row.created_at || new Date().toISOString()
      }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  function eventsSource() {
    return allEvents.length ? allEvents : normalizeFilterEvents(state.events);
  }

  function eventMatches(event) {
    const typeMatcher = FILTER_TYPES[activityType] || FILTER_TYPES.all;
    if (!typeMatcher(event)) return false;
    if (activityDays === 0) return true;
    return isWithinDays(event.created_at, activityDays);
  }

  function applyStaffFilters() {
    const activeIds = new Set(eventsSource().filter(eventMatches).map((event) => event.helper_id));

    if (activityDays === 0 && activityType === "trade") {
      memberTradeMeta.forEach((meta, id) => {
        if (meta.trade_count_base > 0) activeIds.add(id);
      });
    }

    state.filteredMembers = (state.members || []).filter((member) => {
      const matchesSearch = !searchText ||
        `${member.display_name} ${member.username}`.toLocaleLowerCase("es").includes(searchText);

      const showEveryoneForAllHistory = activityDays === 0 && activityType === "all";
      const matchesActivity = showEveryoneForAllHistory ? true : activeIds.has(member.discord_user_id);
      return matchesSearch && matchesActivity;
    });
  }

  function totalTradesForMember(userId) {
    const id = String(userId || "");
    const meta = memberTradeMeta.get(id) || { trade_count_base: 0, trade_synced_at: null };
    const cutoff = meta.trade_synced_at ? new Date(meta.trade_synced_at).getTime() : null;

    const newTradeQuantity = eventsSource().reduce((sum, event) => {
      if (event.helper_id !== id || event.reason !== "safe_exchange") return sum;
      if (cutoff !== null && new Date(event.created_at).getTime() <= cutoff) return sum;
      return sum + event.quantity;
    }, 0);

    return meta.trade_count_base + newTradeQuantity;
  }

  function installControls() {
    const header = document.querySelector(".leaderboard-panel .panel-header");
    const searchWrap = header?.querySelector(".search-wrap");
    if (!header || !searchWrap || document.querySelector("#staffActivityFilters")) return;

    const controls = document.createElement("div");
    controls.id = "staffActivityFilters";
    controls.className = "staff-activity-filters";
    controls.innerHTML = `
      <label>
        <span>Actividad</span>
        <select id="activityDaysFilter" aria-label="Filtrar por actividad reciente">
          <option value="7">Últimos 7 días</option>
          <option value="14" selected>Últimos 14 días</option>
          <option value="30">Últimos 30 días</option>
          <option value="0">Todo el historial</option>
        </select>
      </label>
      <label>
        <span>Tipo</span>
        <select id="activityTypeFilter" aria-label="Filtrar por tipo de actividad">
          <option value="all">Toda actividad</option>
          <option value="help">Ayuda (sin trades)</option>
          <option value="trade">Trades</option>
          <option value="gift">Regalos</option>
          <option value="index">Indexación</option>
        </select>
      </label>
      <div id="staffFilterSummary" class="staff-filter-summary"></div>
    `;

    header.insertBefore(controls, searchWrap);

    controls.querySelector("#activityDaysFilter")?.addEventListener("change", (event) => {
      activityDays = Number(event.target.value || 14);
      renderLeaderboard();
    });

    controls.querySelector("#activityTypeFilter")?.addEventListener("change", (event) => {
      activityType = event.target.value || "all";
      renderLeaderboard();
    });
  }

  function decorateRows() {
    document.querySelectorAll("#leaderboardList [data-user-id]").forEach((row) => {
      const id = row.dataset.userId;
      const meta = row.querySelector(".member-meta");
      if (!id || !meta) return;

      meta.querySelector(".staff-last-activity")?.remove();

      const memberEvents = eventsSource()
        .filter((event) => event.helper_id === id)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const last = memberEvents[0];
      const active14 = last ? isWithinDays(last.created_at, 14) : false;
      const trades = totalTradesForMember(id);

      const line = document.createElement("small");
      line.className = `staff-last-activity ${active14 ? "is-active" : "is-inactive"}`;
      line.textContent = last
        ? `${active14 ? "● Activo" : "○ Inactivo"} · última actividad ${formatRelativeTime(last.created_at)} · ${trades} trade${trades === 1 ? "" : "s"}`
        : trades
          ? `○ Sin actividad reciente · ${trades} trade${trades === 1 ? "" : "s"} históricos`
          : "○ Sin actividad registrada";
      meta.appendChild(line);
    });
  }

  function renderFilterSummary() {
    const summary = document.querySelector("#staffFilterSummary");
    if (!summary) return;

    const labels = {
      all: "toda actividad",
      help: "ayuda",
      trade: "trades",
      gift: "regalos",
      index: "indexación"
    };
    const period = activityDays ? `${activityDays} días` : "todo el historial";
    summary.textContent = `${state.filteredMembers.length} de ${state.members.length} miembros · ${labels[activityType]} · ${period}`;
  }

  function normalizePositiveInt(value) {
    const number = Number(value ?? 1);
    return Number.isInteger(number) && number > 0 ? number : 1;
  }

  function normalizeNonNegativeInt(value) {
    const number = Number(value ?? 0);
    return Number.isInteger(number) && number >= 0 ? number : 0;
  }

  function installStyles() {
    if (document.querySelector("#staffActivityFilterStyles")) return;
    const style = document.createElement("style");
    style.id = "staffActivityFilterStyles";
    style.textContent = `
      .staff-activity-filters {
        display: flex;
        gap: 10px;
        align-items: end;
        flex-wrap: wrap;
        margin-left: auto;
      }
      .staff-activity-filters label {
        display: grid;
        gap: 5px;
        min-width: 150px;
      }
      .staff-activity-filters label > span {
        font-size: 10px;
        font-weight: 800;
        letter-spacing: .12em;
        text-transform: uppercase;
        opacity: .62;
      }
      .staff-activity-filters select {
        appearance: none;
        border: 1px solid rgba(255,255,255,.12);
        background: rgba(13,9,26,.88);
        color: inherit;
        border-radius: 12px;
        padding: 10px 34px 10px 12px;
        font: inherit;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
      }
      .staff-filter-summary {
        width: 100%;
        font-size: 11px;
        opacity: .66;
        text-align: right;
      }
      .staff-last-activity {
        display: block;
        margin-top: 4px;
        font-size: 10px !important;
        opacity: .9 !important;
      }
      .staff-last-activity.is-active { color: #8ef7b2; }
      .staff-last-activity.is-inactive { color: #ffb0b8; }
      @media (max-width: 920px) {
        .staff-activity-filters {
          order: 3;
          width: 100%;
          margin-left: 0;
        }
        .staff-activity-filters label { flex: 1 1 150px; }
        .staff-filter-summary { text-align: left; }
      }
    `;
    document.head.appendChild(style);
  }
})();
