(() => {
  let started = false;
  let observer;

  const ready = () => document.querySelector('script[data-extension="trade-sync-dashboard"][data-loaded="true"]');
  const begin = () => {
    if (started || !ready()) return;
    started = true;
    observer?.disconnect();
    init();
  };

  if (ready()) begin();
  else {
    observer = new MutationObserver(begin);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-loaded"]
    });
  }

  function init() {
    const START = "2026-08-20T00:00:00-04:00";
    const START_LABEL = "20 AGO 2026";
    const LABEL = "Override";
    const KEY = "spriteVaultAssistScope";
    const HELP = new Set(["gifted_sprite", "index_help", "community_help"]);
    const WEIGHT = { gifted_sprite: 3, index_help: 1, community_help: 1, safe_exchange: 0 };
    const ROLES = [
      { points: 15, icon: "💻", name: "Iniciado de la Red" },
      { points: 50, icon: "🧩", name: "Programador" },
      { points: 110, icon: "⚙️", name: "Operador" },
      { points: 190, icon: "🖥️", name: "Ingeniero del Código" },
      { points: 290, icon: "🧬", name: "Arquitecto del Código" },
      { points: 400, icon: "👑", name: "Override del Sistema" }
    ];

    let scope = sessionStorage.getItem(KEY) === "history" ? "history" : "season";
    let events = [];
    let loading = null;
    let search = "";

    const base = {
      loadData,
      applySearch,
      renderStats,
      renderChampion,
      renderBreakdown,
      renderRoleProgress,
      renderPodium,
      renderLeaderboard,
      renderActivity,
      openMemberProfile
    };

    styles();
    switcher();

    renderStats = () => scope === "history" ? historyStats() : seasonStats();
    renderChampion = () => scope === "history" ? historyChampion() : seasonChampion();
    renderBreakdown = () => scope === "history" ? base.renderBreakdown() : seasonBreakdown();
    renderRoleProgress = () => roleProgress();
    renderPodium = () => scope === "history" ? historyPodium() : seasonPodium();
    renderLeaderboard = () => scope === "history" ? historyLeaderboard() : seasonLeaderboard();
    renderActivity = () => scope === "history" ? base.renderActivity() : seasonActivity();
    openMemberProfile = (id) => {
      base.openMemberProfile(id);
      decorateProfile(id);
    };
    applySearch = (q) => {
      search = String(q || "").trim().toLocaleLowerCase("es");
      if (scope === "history") state.filteredMembers = filteredHistoryMembers();
      renderLeaderboard();
    };
    loadData = async () => {
      await base.loadData();
      await loadSeason(true);
      renderScope();
    };

    loadSeason()
      .catch((error) => console.warn("No se pudo cargar Override:", error))
      .finally(renderScope);

    async function loadSeason(force = false) {
      if (loading) return loading;
      if (!force && events.length) return;

      loading = (async () => {
        if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
          events = (state.events || []).map(norm).filter(inSeason);
          return;
        }

        const rows = [];
        const start = encodeURIComponent(START);
        for (let offset = 0; offset < 10000; offset += 1000) {
          let page;
          try {
            page = await supabaseGet(`/rest/v1/assist_events?select=id,helper_id,helper_name,giver_id,giver_name,reason,quantity,created_at&created_at=gte.${start}&order=created_at.desc&limit=1000&offset=${offset}`);
          } catch {
            page = await supabaseGet(`/rest/v1/assist_events?select=id,helper_id,helper_name,giver_id,giver_name,reason,created_at&created_at=gte.${start}&order=created_at.desc&limit=1000&offset=${offset}`);
          }
          rows.push(...page);
          if (page.length < 1000) break;
        }

        events = rows
          .map(norm)
          .filter(inSeason)
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      })();

      try {
        await loading;
      } finally {
        loading = null;
      }
    }

    function norm(row) {
      const quantity = Number(row.quantity ?? 1);
      return {
        id: row.id,
        helper_id: String(row.helper_id || ""),
        helper_name: row.helper_name || "Miembro",
        giver_id: String(row.giver_id || ""),
        giver_name: row.giver_name || "Otro miembro",
        reason: row.reason || "community_help",
        quantity: Number.isInteger(quantity) && quantity > 0 ? quantity : 1,
        created_at: row.created_at || new Date().toISOString()
      };
    }

    function inSeason(event) {
      return new Date(event.created_at) >= new Date(START);
    }

    function blank() {
      return { points: 0, actions: 0, gifts: 0, indexes: 0, people: new Set(), last: null };
    }

    function point(event) {
      return (WEIGHT[event.reason] || 0) * event.quantity;
    }

    function helpEvents() {
      return events.filter((event) => HELP.has(event.reason));
    }

    function mapStats() {
      const map = new Map();
      helpEvents().forEach((event) => {
        if (!event.helper_id) return;
        const stats = map.get(event.helper_id) || blank();
        stats.points += point(event);
        stats.actions += event.quantity;
        if (event.reason === "gifted_sprite") stats.gifts += event.quantity;
        if (event.reason === "index_help") stats.indexes += event.quantity;
        const giverName = String(event.giver_name || "Otro miembro").trim().toLocaleLowerCase("es");
        stats.people.add(event.giver_id || `name:${giverName}`);
        if (!stats.last || new Date(event.created_at) > new Date(stats.last)) stats.last = event.created_at;
        map.set(event.helper_id, stats);
      });
      return map;
    }

    function ranking() {
      const map = mapStats();
      return (state.members || [])
        .map((member) => ({ member, stats: map.get(member.discord_user_id) || blank() }))
        .filter(({ stats }) => stats.actions > 0 || stats.points > 0)
        .sort((a, b) =>
          b.stats.points - a.stats.points ||
          b.stats.people.size - a.stats.people.size ||
          b.stats.actions - a.stats.actions ||
          new Date(b.stats.last || 0) - new Date(a.stats.last || 0)
        );
    }

    function historyRanking() {
      const map = mapStats();
      return [...(state.members || [])]
        .sort((a, b) => b.assist_points - a.assist_points || a.display_name.localeCompare(b.display_name))
        .map((member) => ({ member, stats: map.get(member.discord_user_id) || blank() }));
    }

    function filteredHistoryMembers() {
      const all = historyRanking().map(({ member }) => member);
      return !search
        ? all
        : all.filter((member) => `${member.display_name} ${member.username}`.toLocaleLowerCase("es").includes(search));
    }

    function roleFor(points) {
      const unlocked = ROLES.filter((role) => points >= role.points);
      return unlocked[unlocked.length - 1] || { points: 0, icon: "◈", name: "Sin rango Override" };
    }

    function nextRole(points) {
      return ROLES.find((role) => points < role.points) || null;
    }

    function unlockedRoles(points) {
      return ROLES.filter((role) => points >= role.points);
    }

    function seasonStats() {
      const map = mapStats();
      const rank = ranking();
      const totalPoints = [...map.values()].reduce((sum, stats) => sum + stats.points, 0);
      const active = [...map.values()].filter((stats) => stats.actions > 0).length;
      const weeklyPoints = helpEvents()
        .filter((event) => isWithinDays(event.created_at, 7))
        .reduce((sum, event) => sum + point(event), 0);

      animateNumber(els.totalAssists, totalPoints);
      animateNumber(els.activeHelpers, active);
      animateNumber(els.weeklyAssists, weeklyPoints);
      els.topHelper.textContent = rank[0]?.member.display_name || "—";
      els.topHelperPoints.textContent = rank[0]
        ? `${formatNumber(rank[0].stats.points)} puntos Override`
        : "La temporada acaba de comenzar";
    }

    function historyStats() {
      base.renderStats();
      const top = historyRanking()[0];
      if (top) {
        els.topHelper.textContent = top.member.display_name;
        els.topHelperPoints.textContent = `${formatNumber(top.member.assist_points)} puntos históricos`;
      }
    }

    function seasonChampion() {
      const ids = new Set((state.members || []).map((member) => member.discord_user_id));
      const scores = new Map();

      helpEvents()
        .filter((event) => ids.has(event.helper_id) && isWithinDays(event.created_at, 7))
        .forEach((event) => {
          const stats = scores.get(event.helper_id) || { points: 0, actions: 0, last: event.created_at };
          stats.points += point(event);
          stats.actions += event.quantity;
          if (new Date(event.created_at) > new Date(stats.last)) stats.last = event.created_at;
          scores.set(event.helper_id, stats);
        });

      const best = [...scores.entries()].sort((a, b) =>
        b[1].points - a[1].points ||
        b[1].actions - a[1].actions ||
        new Date(b[1].last) - new Date(a[1].last)
      )[0];
      const member = best && (state.members || []).find((item) => item.discord_user_id === best[0]);

      if (!member) {
        els.championName.textContent = "Nueva temporada";
        els.championHandle.textContent = "@spritevault";
        els.championSummary.textContent = "El próximo Assist puede abrir el liderazgo de Override.";
        els.championRole.textContent = "Override activo";
        els.championWeekStat.textContent = "0 puntos esta semana";
        els.championAvatar.textContent = "SV";
        return;
      }

      const currentRole = roleFor(mapStats().get(member.discord_user_id)?.points || 0);
      els.championName.textContent = member.display_name;
      els.championHandle.textContent = `@${member.username}`;
      els.championSummary.textContent = `${member.display_name} lidera la semana de Override con ${formatNumber(best[1].points)} puntos.`;
      els.championRole.textContent = `${currentRole.icon} ${currentRole.name}`;
      els.championWeekStat.textContent = `${formatNumber(best[1].points)} puntos · ${formatNumber(best[1].actions)} ayudas`;
      els.championAvatar.innerHTML = member.avatar_url
        ? `<img src="${escapeAttribute(member.avatar_url)}" alt="" loading="lazy" />`
        : getInitials(member.display_name);
    }

    function historyChampion() {
      const weeklyEvents = (state.events || []).filter((event) => isWithinDays(event.created_at, 7));
      const scores = new Map();
      weeklyEvents.forEach((event) => {
        if (!event.helper_id) return;
        const current = scores.get(event.helper_id) || { count: 0, last: event.created_at };
        current.count += 1;
        if (new Date(event.created_at) > new Date(current.last)) current.last = event.created_at;
        scores.set(event.helper_id, current);
      });

      const ranked = [...scores.entries()].sort((a, b) =>
        b[1].count - a[1].count || new Date(b[1].last) - new Date(a[1].last)
      );
      const championId = ranked[0]?.[0] || historyRanking()[0]?.member.discord_user_id;
      const member = (state.members || []).find((item) => item.discord_user_id === championId) || historyRanking()[0]?.member;
      if (!member) return;

      const weekCount = ranked[0]?.[1]?.count || 0;
      const seasonPoints = mapStats().get(member.discord_user_id)?.points || 0;
      const currentRole = roleFor(seasonPoints);
      els.championName.textContent = member.display_name;
      els.championHandle.textContent = `@${member.username}`;
      els.championSummary.textContent = weekCount
        ? `${member.display_name} lidera la actividad semanal y conserva ${formatNumber(member.assist_points)} puntos de legado histórico.`
        : `${member.display_name} mantiene el mayor legado histórico de la Bóveda.`;
      els.championRole.textContent = `${currentRole.icon} ${currentRole.name}`;
      els.championWeekStat.textContent = weekCount ? `${weekCount} registros esta semana` : `${formatNumber(member.assist_points)} puntos históricos`;
      els.championAvatar.innerHTML = member.avatar_url
        ? `<img src="${escapeAttribute(member.avatar_url)}" alt="" loading="lazy" />`
        : getInitials(member.display_name);
    }

    function seasonBreakdown() {
      const counts = { gifted_sprite: 0, index_help: 0, safe_exchange: 0 };
      events.forEach((event) => {
        if (event.reason in counts) counts[event.reason] += event.quantity;
      });
      const max = Math.max(counts.gifted_sprite, counts.index_help, counts.safe_exchange, 1);
      updateBreakdownItem(els.breakdownGiftedBar, els.breakdownGiftedValue, counts.gifted_sprite, max);
      updateBreakdownItem(els.breakdownIndexBar, els.breakdownIndexValue, counts.index_help, max);
      updateBreakdownItem(els.breakdownTradeBar, els.breakdownTradeValue, counts.safe_exchange, max);
    }

    function roleProgress() {
      const panel = document.querySelector(".role-progress-panel");
      if (!panel) return;
      const header = panel.querySelector(".panel-header > div");
      const grid = panel.querySelector(".role-progress-grid");
      const line = panel.querySelector(".role-progress-line");
      if (!header || !grid) return;

      if (scope === "season") {
        const map = mapStats();
        header.innerHTML = `
          <span class="eyebrow"><span></span> RANGOS OVERRIDE</span>
          <h2>Progresión de temporada</h2>
          <p>Los rangos se acumulan. Cada rol ganado queda visible durante Override.</p>
        `;
        if (line) line.hidden = true;
        grid.classList.add("override-role-grid");
        grid.classList.remove("history-summary-grid");
        grid.innerHTML = ROLES.map((role, index) => {
          const count = [...map.values()].filter((stats) => stats.points >= role.points).length;
          return `
            <article class="role-card override-role-card ${index === ROLES.length - 1 ? "is-final" : ""}">
              <span class="role-card-icon">${role.icon}</span>
              <span class="override-tier">NIVEL ${index + 1}</span>
              <strong>${escapeHtml(role.name)}</strong>
              <small>${formatNumber(role.points)}+ puntos Override</small>
              <span class="role-count">${count} miembro${count === 1 ? "" : "s"} lo alcanzaron</span>
            </article>
          `;
        }).join("");
        return;
      }

      const rank = historyRanking();
      const total = rank.reduce((sum, item) => sum + item.member.assist_points, 0);
      const leader = rank[0]?.member;
      header.innerHTML = `
        <span class="eyebrow"><span></span> HISTÓRICO</span>
        <h2>Legado permanente</h2>
        <p>Estos puntos no se reinician. Representan toda la ayuda registrada desde que cada miembro entró al Vault.</p>
      `;
      if (line) line.hidden = true;
      grid.classList.remove("override-role-grid");
      grid.classList.add("history-summary-grid");
      grid.innerHTML = `
        <article class="role-card history-summary-card">
          <span class="role-card-icon">🏛️</span>
          <span class="override-tier">DE POR VIDA</span>
          <strong>${formatNumber(total)}</strong>
          <small>Puntos históricos acumulados</small>
          <span class="role-count">Nunca se reinician</span>
        </article>
        <article class="role-card history-summary-card">
          <span class="role-card-icon">👥</span>
          <span class="override-tier">COMUNIDAD</span>
          <strong>${formatNumber(rank.length)}</strong>
          <small>Contribuidores con historial</small>
          <span class="role-count">Registro permanente</span>
        </article>
        <article class="role-card history-summary-card is-legacy-leader">
          <span class="role-card-icon">♛</span>
          <span class="override-tier">MAYOR LEGADO</span>
          <strong>${leader ? escapeHtml(leader.display_name) : "—"}</strong>
          <small>${leader ? `${formatNumber(leader.assist_points)} puntos históricos` : "Sin datos"}</small>
          <span class="role-count">Top histórico de la Bóveda</span>
        </article>
      `;
    }

    function seasonPodium() {
      const top = ranking().slice(0, 3);
      const classes = ["first", "second", "third"];
      if (!top.length) {
        els.podium.innerHTML = `<div class="season-empty"><strong>Nueva temporada, nueva carrera.</strong><small>El próximo Assist abrirá el Top 3 de Override.</small></div>`;
        return;
      }

      els.podium.innerHTML = top.map(({ member, stats }, index) => {
        const role = roleFor(stats.points);
        return `
          <button class="podium-card ${classes[index]}" type="button" data-user-id="${escapeHtml(member.discord_user_id)}">
            <span class="podium-glow"></span>
            <span class="rank-badge">${index + 1}</span>
            <span class="podium-flair">${index ? "✦" : "♛"}</span>
            ${avatarMarkup(member)}
            <strong>${escapeHtml(member.display_name)}</strong>
            <small>@${escapeHtml(member.username)}</small>
            <span class="podium-role">${role.icon} ${escapeHtml(role.name)}</span>
            <div class="podium-points">${formatNumber(stats.points)} pts Override</div>
            <span class="podium-impact">Histórico · ${formatNumber(member.assist_points)}</span>
            <span class="podium-label">${index ? `Top ${index + 1}` : "Líder"} · Override</span>
          </button>
        `;
      }).join("");
      bind(els.podium);
    }

    function historyPodium() {
      const top = historyRanking().slice(0, 3);
      const classes = ["first", "second", "third"];
      if (!top.length) {
        els.podium.innerHTML = `<div class="season-empty"><strong>Aún no hay historial.</strong><small>Los próximos Assists construirán el legado de la Bóveda.</small></div>`;
        return;
      }

      els.podium.innerHTML = top.map(({ member, stats }, index) => {
        const role = roleFor(stats.points);
        return `
          <button class="podium-card ${classes[index]} history-podium" type="button" data-user-id="${escapeHtml(member.discord_user_id)}">
            <span class="podium-glow"></span>
            <span class="rank-badge">${index + 1}</span>
            <span class="podium-flair">${index ? "✦" : "♛"}</span>
            ${avatarMarkup(member)}
            <strong>${escapeHtml(member.display_name)}</strong>
            <small>@${escapeHtml(member.username)}</small>
            <span class="podium-role">${role.icon} ${escapeHtml(role.name)}</span>
            <div class="podium-points">${formatNumber(member.assist_points)} pts históricos</div>
            <span class="podium-impact">Override · ${formatNumber(stats.points)}</span>
            <span class="podium-label">${index ? `Top ${index + 1}` : "Mayor legado"}</span>
          </button>
        `;
      }).join("");
      bind(els.podium);
    }

    function seasonLeaderboard() {
      const all = ranking();
      const visible = all.filter(({ member }) => !search || `${member.display_name} ${member.username}`.toLocaleLowerCase("es").includes(search));
      const header = document.querySelector(".table-header");
      if (header) header.innerHTML = `<span>Posición</span><span>Miembro</span><span>Rango Override</span><span>Override</span><span>Histórico</span>`;

      els.leaderboardList.innerHTML = visible.map(({ member, stats }) => {
        const position = all.findIndex((item) => item.member.discord_user_id === member.discord_user_id) + 1;
        const role = roleFor(stats.points);
        return `
          <button class="leaderboard-row dual-points-row" type="button" data-user-id="${escapeHtml(member.discord_user_id)}">
            <span class="position">#${position}</span>
            <span class="member-cell">
              ${avatarMarkup(member)}
              <span class="member-meta">
                <strong>${escapeHtml(member.display_name)}</strong>
                <small>@${escapeHtml(member.username)}</small>
                <small class="season-last">${stats.last ? `Última ayuda ${formatRelativeTime(stats.last)}` : "Sin actividad"}</small>
              </span>
            </span>
            <span class="role-pill override-role-pill">${role.icon} ${escapeHtml(role.name)}</span>
            <span class="points-stack override-points"><strong>${formatNumber(stats.points)}</strong><small>temporada</small></span>
            <span class="points-stack history-points"><strong>${formatNumber(member.assist_points)}</strong><small>de por vida</small></span>
          </button>
        `;
      }).join("");

      els.emptyState.hidden = visible.length > 0;
      if (!visible.length) {
        els.emptyState.querySelector("strong").textContent = search ? "Ese miembro aún no aparece en Override." : "Aún no hay puntos Override.";
        els.emptyState.querySelector("p").textContent = search ? "Cambia a Histórico para consultar su legado general." : "La clasificación comenzará con la próxima ayuda registrada.";
      }
      bind(els.leaderboardList);
    }

    function historyLeaderboard() {
      const all = historyRanking();
      const visible = all.filter(({ member }) => !search || `${member.display_name} ${member.username}`.toLocaleLowerCase("es").includes(search));
      const header = document.querySelector(".table-header");
      if (header) header.innerHTML = `<span>Posición</span><span>Miembro</span><span>Histórico</span><span>Override</span><span>Rango Override</span>`;

      els.leaderboardList.innerHTML = visible.map(({ member, stats }) => {
        const position = all.findIndex((item) => item.member.discord_user_id === member.discord_user_id) + 1;
        const role = roleFor(stats.points);
        return `
          <button class="leaderboard-row dual-points-row history-row" type="button" data-user-id="${escapeHtml(member.discord_user_id)}">
            <span class="position">#${position}</span>
            <span class="member-cell">
              ${avatarMarkup(member)}
              <span class="member-meta">
                <strong>${escapeHtml(member.display_name)}</strong>
                <small>@${escapeHtml(member.username)}</small>
                <small class="season-last">${stats.points ? `${formatNumber(stats.points)} puntos en Override` : "Sin puntos Override"}</small>
              </span>
            </span>
            <span class="points-stack history-points is-primary"><strong>${formatNumber(member.assist_points)}</strong><small>de por vida</small></span>
            <span class="points-stack override-points"><strong>${formatNumber(stats.points)}</strong><small>temporada</small></span>
            <span class="role-pill override-role-pill">${role.icon} ${escapeHtml(role.name)}</span>
          </button>
        `;
      }).join("");

      state.filteredMembers = visible.map(({ member }) => member);
      els.emptyState.hidden = visible.length > 0;
      if (!visible.length) {
        els.emptyState.querySelector("strong").textContent = "No encontramos ese miembro en el histórico.";
        els.emptyState.querySelector("p").textContent = "Prueba con otro nombre o usuario de Discord.";
      }
      bind(els.leaderboardList);
    }

    function seasonActivity() {
      const old = state.events;
      try {
        state.events = events.slice(0, Number(CONFIG.RECENT_ACTIVITY_LIMIT || 8));
        base.renderActivity();
      } finally {
        state.events = old;
      }
    }

    function bind(root) {
      root?.querySelectorAll("[data-user-id]").forEach((button) => {
        button.addEventListener("click", () => openMemberProfile(button.dataset.userId));
      });
    }

    function decorateProfile(id) {
      const member = (state.members || []).find((item) => item.discord_user_id === String(id));
      if (!member) return;

      const stats = mapStats().get(member.discord_user_id) || blank();
      const seasonRank = ranking();
      const historyRank = historyRanking();
      const seasonPosition = seasonRank.findIndex((item) => item.member.discord_user_id === member.discord_user_id) + 1;
      const historyPosition = historyRank.findIndex((item) => item.member.discord_user_id === member.discord_user_id) + 1;
      const current = roleFor(stats.points);
      const next = nextRole(stats.points);
      const unlocked = unlockedRoles(stats.points);
      const previousThreshold = current.points || 0;
      const progress = next ? Math.max(0, Math.min(100, ((stats.points - previousThreshold) / Math.max(1, next.points - previousThreshold)) * 100)) : 100;

      const dialogStats = els.dialogProfile.querySelector(".dialog-stats");
      if (dialogStats) {
        dialogStats.innerHTML = `
          <div class="dialog-stat scope-stat override-scope-stat"><small>Puntos Override</small><strong>${formatNumber(stats.points)}</strong><span>${seasonPosition > 0 ? `#${seasonPosition} esta temporada` : "Sin posición todavía"}</span></div>
          <div class="dialog-stat scope-stat history-scope-stat"><small>Puntos históricos</small><strong>${formatNumber(member.assist_points)}</strong><span>#${historyPosition} de por vida</span></div>
          <div class="dialog-stat"><small>Rango Override</small><strong>${current.icon} ${escapeHtml(current.name)}</strong></div>
          <div class="dialog-stat"><small>Ayudas Override</small><strong>${formatNumber(stats.actions)}</strong></div>
        `;
      }

      els.dialogProfile.querySelector(".dual-profile-progress")?.remove();
      const progressCard = document.createElement("section");
      progressCard.className = "dual-profile-progress";
      progressCard.innerHTML = `
        <div class="profile-scope-head">
          <div><small>PROGRESO OVERRIDE</small><strong>${current.icon} ${escapeHtml(current.name)}</strong></div>
          <span>${next ? `${formatNumber(stats.points)} / ${formatNumber(next.points)}` : "400+ · COMPLETADO"}</span>
        </div>
        <div class="profile-progress-track"><span style="width:${progress.toFixed(1)}%"></span></div>
        <div class="profile-progress-copy">
          <span>${next ? `Faltan ${formatNumber(Math.max(0, next.points - stats.points))} puntos para ${next.name}` : "Has alcanzado Override del Sistema"}</span>
          <span>Histórico: ${formatNumber(member.assist_points)}</span>
        </div>
        <div class="unlocked-role-strip">
          ${unlocked.length ? unlocked.map((role) => `<span title="${escapeAttribute(role.name)}">${role.icon} ${escapeHtml(role.name)}</span>`).join("") : `<span class="locked-role">◈ Primer rango a los 15 puntos</span>`}
        </div>
      `;
      els.dialogProfile.querySelector(".dialog-stats")?.after(progressCard);

      const note = els.dialogProfile.querySelector(".dialog-note");
      if (note) note.textContent = "Override muestra el progreso de la temporada actual y se reinicia al cambiar de temporada. El Histórico conserva permanentemente toda la ayuda acumulada.";
    }

    function setScope(next) {
      if (next !== "season" && next !== "history") return;
      scope = next;
      sessionStorage.setItem(KEY, scope);
      search = String(els.searchInput?.value || "").trim().toLocaleLowerCase("es");

      if (scope === "history") {
        const days = document.querySelector("#activityDaysFilter");
        const type = document.querySelector("#activityTypeFilter");
        if (days) {
          days.value = "0";
          days.dispatchEvent(new Event("change", { bubbles: true }));
        }
        if (type) {
          type.value = "all";
          type.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
      renderScope();
    }

    function renderScope() {
      document.documentElement.dataset.assistScope = scope;
      document.querySelectorAll("#seasonScopeBar [data-scope]").forEach((button) => {
        const active = button.dataset.scope === scope;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });

      const staff = document.querySelector("#staffActivityFilters");
      if (staff) staff.hidden = scope === "season";
      const founder = document.querySelector("#founderSection");
      if (founder) founder.hidden = scope === "season";

      copy();
      updateSwitcherMetrics();
      renderAll();
    }

    function switcher() {
      if (document.querySelector("#seasonScopeBar")) return;
      const intro = document.querySelector(".section-intro");
      if (!intro) return;

      const bar = document.createElement("section");
      bar.id = "seasonScopeBar";
      bar.className = "scope-hub panel";
      bar.innerHTML = `
        <div class="scope-hub-head">
          <div>
            <span class="eyebrow"><span></span> DOS PROGRESOS · UNA HISTORIA</span>
            <h2>Override y Histórico ahora están separados.</h2>
            <p>Override mide esta temporada. Histórico conserva todo lo que cada miembro ha aportado desde siempre.</p>
          </div>
          <span class="scope-legend">Override se reinicia · Histórico permanece</span>
        </div>
        <div class="scope-card-grid">
          <button class="scope-card scope-override" type="button" data-scope="season" aria-pressed="false">
            <div class="scope-card-top"><span class="scope-kicker">TEMPORADA ACTUAL</span><span class="scope-badge live">ACTIVA</span></div>
            <div class="scope-card-title"><span class="scope-icon">⌁</span><div><strong>${LABEL}</strong><small>Desde ${START_LABEL}</small></div></div>
            <p>Puntos que comienzan desde cero y desbloquean los 6 rangos tecnológicos de esta temporada.</p>
            <div class="scope-card-metrics"><span><strong id="scopeSeasonPoints">0</strong><small>puntos</small></span><span><strong id="scopeSeasonMembers">0</strong><small>miembros</small></span></div>
          </button>
          <button class="scope-card scope-history" type="button" data-scope="history" aria-pressed="false">
            <div class="scope-card-top"><span class="scope-kicker">DE POR VIDA</span><span class="scope-badge permanent">PERMANENTE</span></div>
            <div class="scope-card-title"><span class="scope-icon">∞</span><div><strong>Histórico</strong><small>Desde el inicio del Vault</small></div></div>
            <p>Todo el reconocimiento acumulado. Estos puntos nunca se borran cuando empieza una nueva temporada.</p>
            <div class="scope-card-metrics"><span><strong id="scopeHistoryPoints">0</strong><small>puntos</small></span><span><strong id="scopeHistoryMembers">0</strong><small>miembros</small></span></div>
          </button>
        </div>
      `;
      intro.parentNode.insertBefore(bar, intro);
      bar.querySelectorAll("[data-scope]").forEach((button) => {
        button.addEventListener("click", () => setScope(button.dataset.scope));
      });
    }

    function updateSwitcherMetrics() {
      const seasonMap = mapStats();
      const seasonTotal = [...seasonMap.values()].reduce((sum, stats) => sum + stats.points, 0);
      const seasonMembers = [...seasonMap.values()].filter((stats) => stats.actions > 0).length;
      const historyTotal = (state.members || []).reduce((sum, member) => sum + member.assist_points, 0);
      const historyMembers = (state.members || []).length;

      const seasonPoints = document.querySelector("#scopeSeasonPoints");
      const seasonMemberCount = document.querySelector("#scopeSeasonMembers");
      const historyPoints = document.querySelector("#scopeHistoryPoints");
      const historyMemberCount = document.querySelector("#scopeHistoryMembers");
      if (seasonPoints) seasonPoints.textContent = formatNumber(seasonTotal);
      if (seasonMemberCount) seasonMemberCount.textContent = formatNumber(seasonMembers);
      if (historyPoints) historyPoints.textContent = formatNumber(historyTotal);
      if (historyMemberCount) historyMemberCount.textContent = formatNumber(historyMembers);
    }

    function copy() {
      const isSeason = scope === "season";
      const intro = document.querySelector(".section-intro");
      const leaderboardHead = document.querySelector(".leaderboard-panel .panel-header > div:first-child");
      const activity = document.querySelector(".activity-panel .panel-header > div:first-child");
      const breakdown = document.querySelector(".contribution-breakdown-panel .panel-header > div:first-child");
      const contribution = document.querySelector(".contribution-panel .panel-header > div:first-child");
      const cards = document.querySelectorAll(".stats-grid .stat-card");

      if (intro) {
        intro.querySelector(".eyebrow").innerHTML = isSeason ? `<span></span> TEMPORADA OVERRIDE` : `<span></span> HISTÓRICO PERMANENTE`;
        intro.querySelector("h2").textContent = isSeason ? "Progreso de Override" : "Legado de la comunidad";
        intro.querySelector(":scope > p").textContent = isSeason
          ? "Solo puntos de la temporada actual. Este marcador se reinicia cuando cambie la temporada."
          : "Puntos acumulados de por vida. Este historial nunca se reinicia.";
      }

      if (leaderboardHead) {
        leaderboardHead.innerHTML = isSeason
          ? `<span class="eyebrow"><span></span> CLASIFICACIÓN OVERRIDE</span><h2>Top de la temporada</h2><p>El ranking actual usa solo puntos Override. El histórico aparece separado para conservar el contexto.</p>`
          : `<span class="eyebrow"><span></span> CLASIFICACIÓN HISTÓRICA</span><h2>Legado de la Bóveda</h2><p>Ranking de por vida. Los puntos Override aparecen aparte y no alteran el historial acumulado.</p>`;
      }

      if (activity) {
        activity.querySelector("h2").textContent = isSeason ? "Actividad de Override" : "Actividad histórica";
        activity.querySelector("p").textContent = isSeason ? "Movimientos registrados desde el inicio de Override." : "Movimientos recientes del historial general.";
      }

      if (breakdown) {
        breakdown.querySelector("h2").textContent = isSeason ? "Actividad de esta temporada" : "Actividad registrada";
        breakdown.querySelector("p").textContent = isSeason ? "Sprites regalados, indexaciones e intercambios registrados durante Override." : "Desglose de la actividad disponible en el historial.";
      }

      if (contribution) {
        contribution.querySelector(".eyebrow").innerHTML = `<span></span> SISTEMA DE PUNTOS`;
        contribution.querySelector("h2").textContent = isSeason ? "Cómo suma Override" : "Cómo se construye el historial";
        contribution.querySelector("p").textContent = isSeason
          ? "Regalos e indexación suman puntos Override; los intercambios se registran por separado."
          : "La ayuda reconocida se conserva permanentemente en los puntos históricos.";
      }

      if (cards[0]) {
        cards[0].querySelector(".trend").textContent = isSeason ? "OVERRIDE" : "HISTÓRICO";
        cards[0].querySelector("small").textContent = isSeason ? "Puntos Override" : "Puntos de por vida";
        cards[0].querySelector(":scope > span:last-child").textContent = isSeason ? "Se reinician al terminar la temporada" : "Nunca se reinician";
      }
      if (cards[1]) {
        cards[1].querySelector(".trend").textContent = isSeason ? "ACTIVOS" : "MIEMBROS";
        cards[1].querySelector("small").textContent = isSeason ? "Participantes Override" : "Contribuidores históricos";
        cards[1].querySelector(":scope > span:last-child").textContent = isSeason ? "Con actividad esta temporada" : "Con Assist registrado";
      }
      if (cards[2]) {
        cards[2].querySelector("small").textContent = isSeason ? "Puntos últimos 7 días" : "Actividad últimos 7 días";
        cards[2].querySelector(":scope > span:last-child").textContent = isSeason ? "Ritmo reciente de Override" : "Registros recientes del Vault";
      }
      if (cards[3]) cards[3].querySelector("small").textContent = isSeason ? "Líder de Override" : "Mayor legado";
    }

    function styles() {
      if (document.querySelector("#seasonDashboardStyles")) return;
      const style = document.createElement("style");
      style.id = "seasonDashboardStyles";
      style.textContent = `
        .scope-hub{margin:0 0 28px;padding:22px;border-color:rgba(167,139,250,.22);background:linear-gradient(145deg,rgba(124,58,237,.12),rgba(13,8,23,.94) 48%,rgba(56,189,248,.05))}
        .scope-hub-head{display:flex;align-items:end;justify-content:space-between;gap:18px;margin-bottom:18px}.scope-hub-head h2{margin:8px 0 6px;font-size:25px;letter-spacing:-.035em}.scope-hub-head p{margin:0;max-width:680px;color:#a99dbb;font-size:13px;line-height:1.6}.scope-legend{flex:0 0 auto;padding:8px 11px;border:1px solid rgba(255,255,255,.08);border-radius:999px;background:rgba(255,255,255,.035);color:#9f93af;font-size:10px;font-weight:800}
        .scope-card-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.scope-card{position:relative;display:grid;gap:14px;min-height:220px;padding:18px;text-align:left;border:1px solid rgba(255,255,255,.09);border-radius:20px;background:rgba(255,255,255,.025);color:inherit;cursor:pointer;overflow:hidden;transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease,background .18s ease}.scope-card:before{content:"";position:absolute;inset:auto -18% -48% 28%;height:150px;border-radius:50%;filter:blur(36px);opacity:.16;pointer-events:none}.scope-override:before{background:#8b5cf6}.scope-history:before{background:#38bdf8}.scope-card:hover{transform:translateY(-2px);border-color:rgba(255,255,255,.18)}.scope-card.is-active{border-color:rgba(196,181,253,.48);box-shadow:0 18px 46px rgba(76,29,149,.2),inset 0 1px 0 rgba(255,255,255,.08);background:linear-gradient(145deg,rgba(124,58,237,.14),rgba(255,255,255,.035))}.scope-history.is-active{border-color:rgba(125,211,252,.35);box-shadow:0 18px 46px rgba(14,116,144,.12),inset 0 1px 0 rgba(255,255,255,.08);background:linear-gradient(145deg,rgba(14,116,144,.1),rgba(255,255,255,.03))}.scope-card-top{display:flex;align-items:center;justify-content:space-between;gap:10px}.scope-kicker{color:#9d8daf;font-size:9px;font-weight:900;letter-spacing:.14em}.scope-badge{padding:6px 8px;border-radius:999px;font-size:9px;font-weight:900;letter-spacing:.08em}.scope-badge.live{color:#e8ddff;background:rgba(139,92,246,.16);border:1px solid rgba(167,139,250,.22)}.scope-badge.permanent{color:#d9f5ff;background:rgba(56,189,248,.1);border:1px solid rgba(125,211,252,.18)}.scope-card-title{display:flex;align-items:center;gap:12px}.scope-card-title>div{display:grid;gap:2px}.scope-card-title strong{font-size:23px;letter-spacing:-.03em}.scope-card-title small{color:#8f829f;font-size:10px}.scope-icon{width:46px;height:46px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.04);font-size:22px;font-weight:900}.scope-card p{margin:0;color:#a99dbb;font-size:12px;line-height:1.55}.scope-card-metrics{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:auto}.scope-card-metrics>span{padding:10px 12px;border:1px solid rgba(255,255,255,.065);border-radius:13px;background:rgba(0,0,0,.12)}.scope-card-metrics strong,.scope-card-metrics small{display:block}.scope-card-metrics strong{font-size:20px}.scope-card-metrics small{margin-top:2px;color:#887c97;font-size:9px;text-transform:uppercase;letter-spacing:.08em}
        .season-empty{grid-column:1/-1;display:grid;place-items:center;gap:6px;min-height:150px;border:1px dashed rgba(167,139,250,.2);border-radius:20px;color:#9f8dbb}.season-empty strong{color:#eee7f9}.season-last{color:#8c7ba4!important}.podium-impact{display:block;margin-top:7px;color:#9b8dab;font-size:10px;font-weight:750}.history-podium .podium-points{color:#dff5ff}
        .override-role-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.override-role-card{min-height:178px}.override-role-card .override-tier,.history-summary-card .override-tier{position:absolute;top:20px;right:18px;color:#867694;font-size:8px;font-weight:900;letter-spacing:.12em}.override-role-card.is-final{border-color:rgba(248,200,91,.22);background:linear-gradient(145deg,rgba(248,200,91,.08),rgba(255,255,255,.025))}.history-summary-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.history-summary-card{min-height:178px}.history-summary-card>strong{font-size:25px}.history-summary-card.is-legacy-leader{border-color:rgba(56,189,248,.16)}
        [data-assist-scope] .table-header,[data-assist-scope] .leaderboard-row.dual-points-row{grid-template-columns:72px minmax(195px,1.45fr) minmax(145px,.95fr) 100px 105px}.points-stack{display:grid;gap:2px;justify-items:end;text-align:right}.points-stack strong{font-size:18px;font-weight:900}.points-stack small{color:#82748f;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}.override-points strong{color:#e8ddff}.history-points strong{color:#dff5ff}.history-points.is-primary strong{font-size:20px}.override-role-pill{max-width:160px}.history-row .override-role-pill{justify-self:start}
        .dual-profile-progress{display:grid;gap:11px;margin-top:14px;padding:16px;border:1px solid rgba(167,139,250,.18);border-radius:16px;background:linear-gradient(145deg,rgba(124,58,237,.11),rgba(255,255,255,.025))}.profile-scope-head{display:flex;align-items:end;justify-content:space-between;gap:14px}.profile-scope-head>div{display:grid;gap:4px}.profile-scope-head small{color:#9d8caf;font-size:8px;font-weight:900;letter-spacing:.12em}.profile-scope-head strong{font-size:16px}.profile-scope-head>span{color:#cbbbe4;font-size:10px;font-weight:850}.profile-progress-track{height:9px;border-radius:999px;background:rgba(255,255,255,.06);overflow:hidden}.profile-progress-track>span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#7c3aed,#d946ef);box-shadow:0 0 18px rgba(139,92,246,.35)}.profile-progress-copy{display:flex;justify-content:space-between;gap:10px;color:#8f819f;font-size:9px}.unlocked-role-strip{display:flex;gap:6px;flex-wrap:wrap;padding-top:2px}.unlocked-role-strip>span{padding:6px 8px;border:1px solid rgba(255,255,255,.07);border-radius:999px;background:rgba(255,255,255,.035);color:#c9bdd8;font-size:8px;font-weight:750}.unlocked-role-strip .locked-role{color:#82758f}.scope-stat span{display:block;margin-top:5px;color:#81758e;font-size:9px}.override-scope-stat{border-color:rgba(167,139,250,.18)}.history-scope-stat{border-color:rgba(125,211,252,.13)}
        [data-assist-scope="season"] #staffActivityFilters{display:none!important}
        @media(max-width:900px){.scope-card-grid{grid-template-columns:1fr}.scope-hub-head{align-items:start;flex-direction:column}.override-role-grid,.history-summary-grid{grid-template-columns:1fr 1fr}[data-assist-scope] .table-header{display:none!important}[data-assist-scope] .leaderboard-row.dual-points-row{grid-template-columns:42px minmax(0,1fr) 82px;gap:10px}.dual-points-row .role-pill{grid-column:2/3;grid-row:2;max-width:100%}.dual-points-row .override-points{grid-column:3;grid-row:1}.dual-points-row .history-points{grid-column:3;grid-row:2}.history-row .history-points{grid-column:3;grid-row:1}.history-row .override-points{grid-column:3;grid-row:2}.history-row .override-role-pill{grid-column:2;grid-row:2}.season-last{display:none!important}}
        @media(max-width:620px){.scope-hub{padding:16px}.scope-hub-head h2{font-size:21px}.scope-legend{white-space:normal}.override-role-grid,.history-summary-grid{grid-template-columns:1fr}.scope-card{min-height:200px}.profile-progress-copy{flex-direction:column}.unlocked-role-strip>span{font-size:7.5px}[data-assist-scope] .leaderboard-row.dual-points-row{padding:13px 12px}}
      `;
      document.head.appendChild(style);
    }
  }
})();
