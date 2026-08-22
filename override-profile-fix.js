(() => {
  const START = "2026-08-20T00:00:00-04:00";
  const START_LABEL = "20 AGO 2026";
  const START_MS = new Date(START).getTime();
  const HELP_REASONS = new Set(["gifted_sprite", "index_help", "community_help"]);
  const WEIGHT = { gifted_sprite: 3, index_help: 1, community_help: 1, safe_exchange: 0 };
  const ROLES = [
    { points: 15, icon: "💻", name: "Iniciado de la Red" },
    { points: 50, icon: "🧩", name: "Programador" },
    { points: 110, icon: "⚙️", name: "Operador" },
    { points: 190, icon: "🖥️", name: "Ingeniero del Código" },
    { points: 290, icon: "🧬", name: "Arquitecto del Código" },
    { points: 400, icon: "👑", name: "Override del Sistema" }
  ];

  let installed = false;
  let originalOpenMemberProfile = null;
  let currentProfileId = null;
  let seasonEvents = [];
  let loading = null;
  let loadedAt = 0;
  let profileRefreshTimer = null;
  let surfaceRefreshTimer = null;

  const bootObserver = new MutationObserver(tryInstall);
  bootObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-assist-scope"]
  });
  tryInstall();

  function tryInstall() {
    if (installed) return;
    if (!document.documentElement.dataset.assistScope) return;
    if (typeof openMemberProfile !== "function") return;

    installed = true;
    bootObserver.disconnect();
    originalOpenMemberProfile = openMemberProfile;

    openMemberProfile = function openMemberProfileWithStrictOverride(userId) {
      currentProfileId = String(userId || "");
      const result = originalOpenMemberProfile(userId);
      if (isSeasonScope()) scheduleProfileRefresh(currentProfileId, true);
      return result;
    };

    const dialog = document.querySelector("#memberDialog");
    dialog?.addEventListener("close", () => {
      currentProfileId = null;
    });

    const dialogProfile = document.querySelector("#dialogProfile");
    if (dialogProfile) {
      const dialogObserver = new MutationObserver(() => {
        if (!isSeasonScope() || !currentProfileId) return;
        const breakdown = dialogProfile.querySelector(".dialog-breakdown");
        const people = dialogProfile.querySelector(".helped-people-section");
        const historicalTrade = dialogProfile.querySelector("[data-synced-trade-total]");
        if (
          historicalTrade ||
          breakdown?.dataset.overrideCutoff !== START ||
          people?.dataset.overrideCutoff !== START
        ) {
          scheduleProfileRefresh(currentProfileId, false);
        }
      });
      dialogObserver.observe(dialogProfile, { childList: true, subtree: true });
    }

    const leaderboard = document.querySelector("#leaderboardList");
    if (leaderboard) {
      const leaderboardObserver = new MutationObserver(() => scheduleSurfaceRefresh(false));
      leaderboardObserver.observe(leaderboard, { childList: true, subtree: true });
    }

    const tradeValue = document.querySelector("#breakdownTradeValue");
    if (tradeValue) {
      const tradeObserver = new MutationObserver(() => scheduleSurfaceRefresh(false));
      tradeObserver.observe(tradeValue, { childList: true, characterData: true, subtree: true });
    }

    const scopeObserver = new MutationObserver(() => {
      if (document.querySelector("#memberDialog")?.open && currentProfileId) {
        originalOpenMemberProfile(currentProfileId);
        if (isSeasonScope()) scheduleProfileRefresh(currentProfileId, true);
      }
      scheduleSurfaceRefresh(true);
    });
    scopeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-assist-scope"]
    });

    scheduleSurfaceRefresh(true);
  }

  function isSeasonScope() {
    return document.documentElement.dataset.assistScope === "season";
  }

  function normalizeQuantity(value) {
    const quantity = Number(value ?? 1);
    return Number.isInteger(quantity) && quantity > 0 ? quantity : 1;
  }

  function normalizeEvent(row) {
    return {
      id: row.id,
      helper_id: String(row.helper_id || ""),
      helper_name: row.helper_name || "Miembro",
      giver_id: String(row.giver_id || ""),
      giver_name: row.giver_name || "Otro miembro",
      reason: row.reason || "community_help",
      quantity: normalizeQuantity(row.quantity),
      created_at: row.created_at || new Date(0).toISOString()
    };
  }

  async function refreshSeasonEvents(force = false) {
    if (loading) return loading;
    if (!force && seasonEvents.length && Date.now() - loadedAt < 15_000) return seasonEvents;

    loading = (async () => {
      if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
        seasonEvents = (state.events || [])
          .map(normalizeEvent)
          .filter((event) => new Date(event.created_at).getTime() >= START_MS);
        loadedAt = Date.now();
        return seasonEvents;
      }

      const rows = [];
      const start = encodeURIComponent(START);
      for (let offset = 0; offset < 10000; offset += 1000) {
        const page = await supabaseGet(
          `/rest/v1/assist_events?select=id,helper_id,helper_name,giver_id,giver_name,reason,quantity,created_at&created_at=gte.${start}&order=created_at.desc&limit=1000&offset=${offset}`
        );
        rows.push(...page);
        if (page.length < 1000) break;
      }

      seasonEvents = rows
        .map(normalizeEvent)
        .filter((event) => new Date(event.created_at).getTime() >= START_MS)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      loadedAt = Date.now();
      return seasonEvents;
    })();

    try {
      return await loading;
    } finally {
      loading = null;
    }
  }

  function pointFor(event) {
    return (WEIGHT[event.reason] || 0) * event.quantity;
  }

  function strictStatsMap() {
    const map = new Map();
    seasonEvents.forEach((event) => {
      if (!event.helper_id || !HELP_REASONS.has(event.reason)) return;
      const giverName = String(event.giver_name || "Otro miembro").trim().toLocaleLowerCase("es");
      const current = map.get(event.helper_id) || {
        points: 0,
        actions: 0,
        gifts: 0,
        indexes: 0,
        people: new Set(),
        last: null
      };
      current.points += pointFor(event);
      current.actions += event.quantity;
      if (event.reason === "gifted_sprite") current.gifts += event.quantity;
      if (event.reason === "index_help") current.indexes += event.quantity;
      current.people.add(event.giver_id || `name:${giverName}`);
      if (!current.last || new Date(event.created_at) > new Date(current.last)) current.last = event.created_at;
      map.set(event.helper_id, current);
    });
    return map;
  }

  function roleFor(points) {
    const unlocked = ROLES.filter((role) => Number(points || 0) >= role.points);
    return unlocked[unlocked.length - 1] || { points: 0, icon: "◈", name: "Sin rango Override" };
  }

  function nextRole(points) {
    return ROLES.find((role) => Number(points || 0) < role.points) || null;
  }

  function unlockedRoles(points) {
    return ROLES.filter((role) => Number(points || 0) >= role.points);
  }

  function seasonRanking() {
    const map = strictStatsMap();
    return (state.members || [])
      .map((member) => ({
        member,
        stats: map.get(member.discord_user_id) || {
          points: 0,
          actions: 0,
          gifts: 0,
          indexes: 0,
          people: new Set(),
          last: null
        }
      }))
      .filter(({ stats }) => stats.points > 0 || stats.actions > 0)
      .sort((a, b) =>
        b.stats.points - a.stats.points ||
        b.stats.people.size - a.stats.people.size ||
        b.stats.actions - a.stats.actions ||
        new Date(b.stats.last || 0) - new Date(a.stats.last || 0)
      );
  }

  function buildSeasonPeople(userId) {
    const people = new Map();
    seasonEvents
      .filter((event) => event.helper_id === String(userId) && HELP_REASONS.has(event.reason))
      .forEach((event) => {
        const name = String(event.giver_name || "Otro miembro").trim() || "Otro miembro";
        const key = event.giver_id || `name:${name.toLocaleLowerCase("es")}`;
        const current = people.get(key) || {
          id: event.giver_id || "",
          name,
          count: 0,
          gifted: 0,
          indexed: 0,
          community: 0,
          lastHelpedAt: event.created_at
        };
        current.count += event.quantity;
        if (event.reason === "gifted_sprite") current.gifted += event.quantity;
        else if (event.reason === "index_help") current.indexed += event.quantity;
        else current.community += event.quantity;
        if (new Date(event.created_at) > new Date(current.lastHelpedAt)) current.lastHelpedAt = event.created_at;
        people.set(key, current);
      });

    return [...people.values()].sort((a, b) =>
      b.count - a.count || new Date(b.lastHelpedAt) - new Date(a.lastHelpedAt) || a.name.localeCompare(b.name, "es")
    );
  }

  function memberSeasonEvents(userId) {
    return seasonEvents.filter((event) => event.helper_id === String(userId));
  }

  function sumQuantity(events, reason = null) {
    return events.reduce((sum, event) => {
      if (reason && event.reason !== reason) return sum;
      return sum + event.quantity;
    }, 0);
  }

  function scheduleProfileRefresh(userId, forceFetch) {
    if (!userId) return;
    window.clearTimeout(profileRefreshTimer);
    profileRefreshTimer = window.setTimeout(async () => {
      try {
        await refreshSeasonEvents(Boolean(forceFetch));
        applyStrictSeasonProfile(userId);
        window.setTimeout(() => applyStrictSeasonProfile(userId), 120);
        window.setTimeout(() => applyStrictSeasonProfile(userId), 500);
      } catch (error) {
        console.warn("No se pudo aplicar el corte estricto de Override al perfil:", error);
      }
    }, 0);
  }

  function applyStrictSeasonProfile(userId) {
    if (!isSeasonScope()) return;
    if (!document.querySelector("#memberDialog")?.open) return;
    if (String(userId) !== String(currentProfileId)) return;

    const member = (state.members || []).find((item) => item.discord_user_id === String(userId));
    if (!member) return;

    const stats = strictStatsMap().get(String(userId)) || {
      points: 0,
      actions: 0,
      gifts: 0,
      indexes: 0,
      people: new Set(),
      last: null
    };
    const allEvents = memberSeasonEvents(userId);
    const people = buildSeasonPeople(userId);
    const trades = sumQuantity(allEvents, "safe_exchange");
    const allActivity = sumQuantity(allEvents);
    const ranking = seasonRanking();
    const seasonPosition = ranking.findIndex((item) => item.member.discord_user_id === String(userId)) + 1;
    const historyRanking = [...(state.members || [])].sort(
      (a, b) => Number(b.assist_points || 0) - Number(a.assist_points || 0) || a.display_name.localeCompare(b.display_name)
    );
    const historyPosition = historyRanking.findIndex((item) => item.discord_user_id === String(userId)) + 1;
    const current = roleFor(stats.points);
    const next = nextRole(stats.points);
    const unlocked = unlockedRoles(stats.points);
    const previousThreshold = current.points || 0;
    const progress = next
      ? Math.max(0, Math.min(100, ((stats.points - previousThreshold) / Math.max(1, next.points - previousThreshold)) * 100))
      : 100;

    const rolePill = els.dialogProfile.querySelector(".dialog-profile-role");
    if (rolePill) {
      rolePill.textContent = `${current.icon} ${current.name}`;
      rolePill.title = `Rango Override calculado solo desde ${START_LABEL}`;
    }

    const dialogStats = els.dialogProfile.querySelector(".dialog-stats");
    if (dialogStats && dialogStats.dataset.overrideCutoff !== START) {
      dialogStats.dataset.overrideCutoff = START;
    }
    if (dialogStats) {
      const expected = `${stats.points}|${member.assist_points}|${current.name}|${stats.actions}|${seasonPosition}|${historyPosition}`;
      if (dialogStats.dataset.overrideValues !== expected) {
        dialogStats.dataset.overrideValues = expected;
        dialogStats.innerHTML = `
          <div class="dialog-stat scope-stat override-scope-stat"><small>Puntos Override</small><strong>${formatNumber(stats.points)}</strong><span>${seasonPosition > 0 ? `#${seasonPosition} esta temporada` : "Sin posición todavía"}</span></div>
          <div class="dialog-stat scope-stat history-scope-stat"><small>Puntos históricos</small><strong>${formatNumber(member.assist_points)}</strong><span>#${historyPosition > 0 ? historyPosition : "—"} de por vida</span></div>
          <div class="dialog-stat"><small>Rango Override</small><strong>${current.icon} ${escapeHtml(current.name)}</strong></div>
          <div class="dialog-stat"><small>Ayudas Override</small><strong>${formatNumber(stats.actions)}</strong><span>Solo desde ${START_LABEL}</span></div>
        `;
      }
    }

    let progressCard = els.dialogProfile.querySelector(".dual-profile-progress");
    if (!progressCard) {
      progressCard = document.createElement("section");
      progressCard.className = "dual-profile-progress";
      els.dialogProfile.querySelector(".dialog-stats")?.after(progressCard);
    }
    const progressSignature = `${stats.points}|${next?.points || 0}|${current.name}`;
    if (progressCard.dataset.overrideValues !== progressSignature) {
      progressCard.dataset.overrideValues = progressSignature;
      progressCard.innerHTML = `
        <div class="profile-scope-head">
          <div><small>PROGRESO OVERRIDE · DESDE ${START_LABEL}</small><strong>${current.icon} ${escapeHtml(current.name)}</strong></div>
          <span>${next ? `${formatNumber(stats.points)} / ${formatNumber(next.points)}` : "400+ · COMPLETADO"}</span>
        </div>
        <div class="profile-progress-track"><span style="width:${progress.toFixed(1)}%"></span></div>
        <div class="profile-progress-copy">
          <span>${next ? `Faltan ${formatNumber(Math.max(0, next.points - stats.points))} puntos para ${escapeHtml(next.name)}` : "Has alcanzado Override del Sistema"}</span>
          <span>Histórico: ${formatNumber(member.assist_points)}</span>
        </div>
        <div class="unlocked-role-strip">
          ${unlocked.length ? unlocked.map((role) => `<span title="${escapeAttribute(role.name)}">${role.icon} ${escapeHtml(role.name)}</span>`).join("") : `<span class="locked-role">◈ Primer rango a los 15 puntos</span>`}
        </div>
      `;
    }

    const breakdown = els.dialogProfile.querySelector(".dialog-breakdown");
    if (breakdown) {
      const signature = `${stats.gifts}|${stats.indexes}|${allActivity}|${trades}`;
      if (breakdown.dataset.overrideValues !== signature || breakdown.querySelector("[data-synced-trade-total]")) {
        breakdown.dataset.overrideCutoff = START;
        breakdown.dataset.overrideValues = signature;
        breakdown.innerHTML = `
          <div class="dialog-break-item"><span>🎁</span><div><small>Regalos Override</small><strong>${formatNumber(stats.gifts)}</strong></div></div>
          <div class="dialog-break-item"><span>📁</span><div><small>Indexaciones Override</small><strong>${formatNumber(stats.indexes)}</strong></div></div>
          <div class="dialog-break-item"><span>↗</span><div><small>Actividad desde ${START_LABEL}</small><strong>${formatNumber(allActivity)}</strong></div></div>
          <div class="dialog-break-item"><span>🤝</span><div><small>Intercambios Override</small><strong>${formatNumber(trades)}</strong></div></div>
        `;
      } else {
        breakdown.dataset.overrideCutoff = START;
      }
    }

    const peopleSection = els.dialogProfile.querySelector(".helped-people-section");
    if (peopleSection) {
      const peopleSignature = people.map((person) => `${person.id}:${person.count}:${person.lastHelpedAt}`).join("|");
      if (peopleSection.dataset.overrideValues !== peopleSignature) {
        peopleSection.dataset.overrideCutoff = START;
        peopleSection.dataset.overrideValues = peopleSignature;
        peopleSection.innerHTML = renderSeasonPeople(people);
      } else {
        peopleSection.dataset.overrideCutoff = START;
      }
    }

    const note = els.dialogProfile.querySelector(".dialog-note");
    if (note) {
      note.textContent = `Override usa exclusivamente actividad registrada desde ${START_LABEL}. Los Puntos Históricos conservan todo lo anterior por separado.`;
    }
  }

  function renderSeasonPeople(people) {
    return `
      <div class="helped-people-header">
        <div>
          <small>IMPACTO OVERRIDE · DESDE ${START_LABEL}</small>
          <h4>Personas ayudadas en Override</h4>
        </div>
        <span>${formatNumber(people.length)}</span>
      </div>
      ${people.length ? `
        <div class="helped-people-list">
          ${people.map((person) => {
            const linked = person.id && (state.members || []).find((member) => member.discord_user_id === person.id);
            const identity = linked ? `@${escapeHtml(linked.username)}` : "Miembro ayudado";
            const breakdown = [
              person.gifted ? `🎁 ${formatNumber(person.gifted)}` : "",
              person.indexed ? `📁 ${formatNumber(person.indexed)}` : "",
              person.community ? `⭐ ${formatNumber(person.community)}` : ""
            ].filter(Boolean).join(" · ");
            return `
              <article class="helped-person-row override-helped-person-row">
                <span class="helped-person-avatar">${getInitials(person.name)}</span>
                <span class="helped-person-copy">
                  <strong>${escapeHtml(person.name)}</strong>
                  <small>${identity} · última ayuda ${formatRelativeTime(person.lastHelpedAt)}</small>
                </span>
                <span class="helped-person-metrics">
                  <strong>${formatNumber(person.count)} ${person.count === 1 ? "ayuda" : "ayudas"}</strong>
                  <small>${breakdown || "⭐ Ayuda comunitaria"}</small>
                </span>
                <span class="helped-person-arrow" aria-hidden="true">✓</span>
              </article>
            `;
          }).join("")}
        </div>
      ` : `
        <div class="helped-people-empty">
          <span>👥</span>
          <strong>Aún no tiene actividad Override.</strong>
          <p>Solo aparecerán ayudas registradas desde ${START_LABEL}.</p>
        </div>
      `}
    `;
  }

  function scheduleSurfaceRefresh(forceFetch) {
    window.clearTimeout(surfaceRefreshTimer);
    surfaceRefreshTimer = window.setTimeout(async () => {
      try {
        await refreshSeasonEvents(Boolean(forceFetch));
        applySeasonBreakdown();
        applySeasonLeaderboardTrades();
      } catch (error) {
        console.warn("No se pudo reforzar el corte de Override en el dashboard:", error);
      }
    }, 0);
  }

  function applySeasonBreakdown() {
    if (!isSeasonScope()) return;
    const counts = { gifted_sprite: 0, index_help: 0, safe_exchange: 0 };
    seasonEvents.forEach((event) => {
      if (event.reason in counts) counts[event.reason] += event.quantity;
    });

    const giftValue = document.querySelector("#breakdownGiftedValue");
    const indexValue = document.querySelector("#breakdownIndexValue");
    const tradeValue = document.querySelector("#breakdownTradeValue");
    const giftBar = document.querySelector("#breakdownGiftedBar");
    const indexBar = document.querySelector("#breakdownIndexBar");
    const tradeBar = document.querySelector("#breakdownTradeBar");
    if (!giftValue || !indexValue || !tradeValue || !giftBar || !indexBar || !tradeBar) return;

    const max = Math.max(counts.gifted_sprite, counts.index_help, counts.safe_exchange, 1);
    const expectedTrade = formatNumber(counts.safe_exchange);
    if (tradeValue.textContent !== expectedTrade || giftValue.textContent !== formatNumber(counts.gifted_sprite) || indexValue.textContent !== formatNumber(counts.index_help)) {
      updateBreakdownItem(giftBar, giftValue, counts.gifted_sprite, max);
      updateBreakdownItem(indexBar, indexValue, counts.index_help, max);
      updateBreakdownItem(tradeBar, tradeValue, counts.safe_exchange, max);
    }
  }

  function applySeasonLeaderboardTrades() {
    if (!isSeasonScope()) return;
    const trades = new Map();
    seasonEvents.forEach((event) => {
      if (event.reason !== "safe_exchange" || !event.helper_id) return;
      trades.set(event.helper_id, (trades.get(event.helper_id) || 0) + event.quantity);
    });

    document.querySelectorAll("#leaderboardList [data-user-id]").forEach((row) => {
      const id = String(row.dataset.userId || "");
      const meta = row.querySelector(".member-meta");
      if (!id || !meta) return;
      const total = trades.get(id) || 0;
      let line = meta.querySelector(".synced-trade-total");
      if (!total) {
        line?.remove();
        return;
      }
      if (!line) {
        line = document.createElement("small");
        line.className = "synced-trade-total";
        meta.appendChild(line);
      }
      const copy = `🤝 ${formatNumber(total)} intercambio${total === 1 ? "" : "s"} Override`;
      if (line.textContent !== copy) line.textContent = copy;
      line.title = `Solo intercambios registrados desde ${START_LABEL}.`;
    });
  }
})();
