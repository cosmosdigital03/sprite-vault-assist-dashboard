(() => {
  const HISTORY_PAGE_SIZE = 1000;
  const HISTORY_MAX_ROWS = 10000;
  let fullAssistEvents = [];
  let historyLoading = null;

  injectHelpedProfileStyles();
  patchLeaderboardHeader();

  const originalLoadData = loadData;
  const originalRenderStats = renderStats;

  renderStats = renderStatsWithQuantities;
  renderChampion = renderChampionWithQuantities;
  renderBreakdown = renderBreakdownWithQuantities;
  renderPodium = renderPodiumWithPeopleHelped;
  renderLeaderboard = renderLeaderboardWithPeopleHelped;
  openMemberProfile = openExpandedMemberProfile;

  loadData = async function loadDataWithHelpHistory() {
    await originalLoadData();
    await refreshFullAssistHistory();
    renderStats();
    renderChampion();
    renderBreakdown();
    renderPodium();
    renderLeaderboard();
  };

  refreshFullAssistHistory()
    .catch((error) => console.warn("No se pudo cargar el historial completo de Assist:", error))
    .finally(() => {
      patchLeaderboardHeader();
      renderStats();
      renderChampion();
      renderBreakdown();
      renderPodium();
      renderLeaderboard();
    });

  function patchLeaderboardHeader() {
    const header = document.querySelector(".table-header");
    if (!header) return;
    header.innerHTML = `
      <span>Posición</span>
      <span>Miembro</span>
      <span>Personas ayudadas</span>
      <span>Rol</span>
      <span>Assists</span>
    `;
  }

  async function refreshFullAssistHistory() {
    if (historyLoading) return historyLoading;

    historyLoading = (async () => {
      if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
        fullAssistEvents = normalizeFullEvents(state.events);
        return;
      }

      const rows = [];
      for (let offset = 0; offset < HISTORY_MAX_ROWS; offset += HISTORY_PAGE_SIZE) {
        const path = `/rest/v1/assist_events?select=id,helper_id,helper_name,giver_id,giver_name,reason,quantity,created_at&order=created_at.desc&limit=${HISTORY_PAGE_SIZE}&offset=${offset}`;
        const page = await supabaseGet(path);
        rows.push(...page);
        if (page.length < HISTORY_PAGE_SIZE) break;
      }

      fullAssistEvents = normalizeFullEvents(rows);
    })();

    try {
      await historyLoading;
    } finally {
      historyLoading = null;
    }
  }

  function normalizeFullEvents(rows) {
    return [...(rows || [])]
      .map((row) => ({
        id: row.id,
        helper_id: String(row.helper_id || ""),
        helper_name: row.helper_name || "Un miembro",
        giver_id: String(row.giver_id || ""),
        giver_name: row.giver_name || "Otro miembro",
        reason: row.reason || "community_help",
        quantity: normalizeQuantity(row.quantity),
        created_at: row.created_at || new Date().toISOString()
      }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  function normalizeQuantity(value) {
    const quantity = Number(value ?? 1);
    return Number.isInteger(quantity) && quantity > 0 ? quantity : 1;
  }

  function getHistoryEvents() {
    return fullAssistEvents.length ? fullAssistEvents : normalizeFullEvents(state.events);
  }

  function getMemberEvents(userId) {
    return getHistoryEvents().filter((event) => event.helper_id === String(userId));
  }

  function totalQuantity(events) {
    return events.reduce((sum, event) => sum + event.quantity, 0);
  }

  function buildPeopleHelped(userId) {
    const people = new Map();

    getMemberEvents(userId).forEach((event) => {
      const normalizedName = String(event.giver_name || "Otro miembro").trim();
      const key = event.giver_id || `name:${normalizedName.toLocaleLowerCase("es")}`;
      const current = people.get(key) || {
        id: event.giver_id || "",
        name: normalizedName || "Otro miembro",
        count: 0,
        gifted: 0,
        indexed: 0,
        exchanged: 0,
        community: 0,
        lastHelpedAt: event.created_at
      };

      current.count += event.quantity;
      if (event.reason === "gifted_sprite") current.gifted += event.quantity;
      else if (event.reason === "index_help") current.indexed += event.quantity;
      else if (event.reason === "safe_exchange") current.exchanged += event.quantity;
      else current.community += event.quantity;

      if (new Date(event.created_at) > new Date(current.lastHelpedAt)) {
        current.lastHelpedAt = event.created_at;
      }

      people.set(key, current);
    });

    return [...people.values()].sort((a, b) =>
      b.count - a.count || new Date(b.lastHelpedAt) - new Date(a.lastHelpedAt) || a.name.localeCompare(b.name, "es")
    );
  }

  function peopleHelpedCount(userId) {
    return buildPeopleHelped(userId).length;
  }

  function renderStatsWithQuantities() {
    originalRenderStats();
    const weekly = totalQuantity(
      getHistoryEvents().filter((event) => isWithinDays(event.created_at, 7))
    );
    animateNumber(els.weeklyAssists, weekly);
  }

  function renderChampionWithQuantities() {
    const weeklyEvents = getHistoryEvents().filter((event) => isWithinDays(event.created_at, 7));
    const scores = new Map();

    weeklyEvents.forEach((event) => {
      const current = scores.get(event.helper_id) || { count: 0, last: event.created_at };
      current.count += event.quantity;
      if (new Date(event.created_at) > new Date(current.last)) current.last = event.created_at;
      scores.set(event.helper_id, current);
    });

    const ranked = [...scores.entries()].sort(
      (a, b) => b[1].count - a[1].count || new Date(b[1].last) - new Date(a[1].last)
    );
    const championId = ranked[0]?.[0] || state.members[0]?.discord_user_id;
    const champion = state.members.find((member) => member.discord_user_id === championId) || state.members[0];
    const weekCount = ranked[0]?.[1]?.count || 0;

    if (!champion) return;

    els.championName.textContent = champion.display_name;
    els.championHandle.textContent = `@${champion.username}`;
    els.championSummary.textContent = weekCount
      ? `${champion.display_name} lidera la semana con ${weekCount} Assist${weekCount === 1 ? "" : "s"} registrados recientemente.`
      : `${champion.display_name} se mantiene como la referencia principal de la comunidad.`;
    els.championRole.textContent = champion.role_name;
    els.championWeekStat.textContent = weekCount ? `${weekCount} esta semana` : `${champion.assist_points} Assist totales`;
    els.championAvatar.innerHTML = champion.avatar_url
      ? `<img src="${escapeAttribute(champion.avatar_url)}" alt="" loading="lazy" />`
      : getInitials(champion.display_name);
  }

  function renderBreakdownWithQuantities() {
    const counts = {
      gifted_sprite: 0,
      index_help: 0,
      safe_exchange: 0
    };

    getHistoryEvents().forEach((event) => {
      if (event.reason === "gifted_sprite") counts.gifted_sprite += event.quantity;
      else if (event.reason === "index_help") counts.index_help += event.quantity;
      else if (event.reason === "safe_exchange") counts.safe_exchange += event.quantity;
    });

    const max = Math.max(counts.gifted_sprite, counts.index_help, counts.safe_exchange, 1);
    updateBreakdownItem(els.breakdownGiftedBar, els.breakdownGiftedValue, counts.gifted_sprite, max);
    updateBreakdownItem(els.breakdownIndexBar, els.breakdownIndexValue, counts.index_help, max);
    updateBreakdownItem(els.breakdownTradeBar, els.breakdownTradeValue, counts.safe_exchange, max);
  }

  function renderPodiumWithPeopleHelped() {
    const topThree = state.members.slice(0, 3);
    const placementTheme = {
      1: { className: "first", icon: "♛", label: "Campeón" },
      2: { className: "second", icon: "✦", label: "Subcampeón" },
      3: { className: "third", icon: "✦", label: "Top 3" }
    };

    els.podium.innerHTML = topThree.map((member, index) => {
      const placement = index + 1;
      const theme = placementTheme[placement];
      const peopleCount = peopleHelpedCount(member.discord_user_id);
      return `
        <button class="podium-card ${theme.className}" type="button" data-user-id="${escapeHtml(member.discord_user_id)}">
          <span class="podium-glow"></span>
          <span class="rank-badge">${placement}</span>
          <span class="podium-flair" aria-hidden="true">${theme.icon}</span>
          ${avatarMarkup(member)}
          <strong>${escapeHtml(member.display_name)}</strong>
          <small>@${escapeHtml(member.username)}</small>
          <span class="podium-role">${escapeHtml(member.role_name)}</span>
          <div class="podium-points">${formatNumber(member.assist_points)} Assist</div>
          <span class="podium-impact">👥 ${formatNumber(peopleCount)} ${peopleCount === 1 ? "persona ayudada" : "personas ayudadas"}</span>
          <span class="podium-label">${theme.label}</span>
        </button>
      `;
    }).join("");

    bindProfileButtons(els.podium);
  }

  function renderLeaderboardWithPeopleHelped() {
    patchLeaderboardHeader();

    els.leaderboardList.innerHTML = state.filteredMembers.map((member) => {
      const position = state.members.findIndex((candidate) => candidate.discord_user_id === member.discord_user_id) + 1;
      const peopleCount = peopleHelpedCount(member.discord_user_id);

      return `
        <button class="leaderboard-row" type="button" data-user-id="${escapeHtml(member.discord_user_id)}">
          <span class="position">#${position}</span>
          <span class="member-cell">
            ${avatarMarkup(member)}
            <span class="member-meta">
              <strong>${escapeHtml(member.display_name)}</strong>
              <small>@${escapeHtml(member.username)}</small>
            </span>
          </span>
          <span class="people-helped-cell"><strong>${formatNumber(peopleCount)}</strong><small>${peopleCount === 1 ? "persona" : "personas"}</small></span>
          <span class="role-pill">${escapeHtml(member.role_name)}</span>
          <span class="points-cell">${formatNumber(member.assist_points)}</span>
        </button>
      `;
    }).join("");

    els.emptyState.hidden = state.filteredMembers.length > 0;
    bindProfileButtons(els.leaderboardList);
  }

  function openExpandedMemberProfile(userId) {
    const member = state.members.find((item) => item.discord_user_id === String(userId));
    if (!member) return;

    const position = state.members.findIndex((item) => item.discord_user_id === String(userId)) + 1;
    const events = getMemberEvents(userId);
    const recentCount = totalQuantity(events.filter((event) => isWithinDays(event.created_at, 30)));
    const totalHelps = totalQuantity(events);
    const counts = events.reduce((acc, event) => {
      if (event.reason === "gifted_sprite") acc.gifted += event.quantity;
      else if (event.reason === "index_help") acc.indexed += event.quantity;
      else acc.community += event.quantity;
      return acc;
    }, { gifted: 0, indexed: 0, community: 0 });
    const people = buildPeopleHelped(userId);

    els.dialogProfile.innerHTML = `
      <div class="dialog-profile-head">
        ${avatarMarkup(member)}
        <div class="dialog-profile-identity">
          <h3>${escapeHtml(member.display_name)}</h3>
          <p>@${escapeHtml(member.username)}</p>
          <span class="role-pill dialog-profile-role">${escapeHtml(member.role_name)}</span>
        </div>
      </div>

      <div class="dialog-stats dialog-stats-impact">
        <div class="dialog-stat"><small>Posición general</small><strong>#${position}</strong></div>
        <div class="dialog-stat"><small>Puntos de Assist</small><strong>${formatNumber(member.assist_points)}</strong></div>
        <div class="dialog-stat highlight-stat"><small>Personas ayudadas</small><strong>${formatNumber(people.length)}</strong></div>
        <div class="dialog-stat"><small>Ayudas registradas</small><strong>${formatNumber(totalHelps)}</strong></div>
      </div>

      <div class="dialog-breakdown">
        <div class="dialog-break-item"><span>🎁</span><div><small>Regalos registrados</small><strong>${formatNumber(counts.gifted)}</strong></div></div>
        <div class="dialog-break-item"><span>📁</span><div><small>Indexaciones</small><strong>${formatNumber(counts.indexed)}</strong></div></div>
        <div class="dialog-break-item"><span>↗</span><div><small>Actividad 30 días</small><strong>${formatNumber(recentCount)}</strong></div></div>
      </div>

      <section class="helped-people-section" aria-labelledby="helpedPeopleTitle">
        <div class="helped-people-header">
          <div>
            <small>IMPACTO EN LA COMUNIDAD</small>
            <h4 id="helpedPeopleTitle">Personas que ha ayudado</h4>
          </div>
          <span>${formatNumber(people.length)}</span>
        </div>
        ${renderHelpedPeopleList(people)}
      </section>

      <p class="dialog-note">Selecciona una persona para ver cada vez que usó <strong>/assist</strong>, la fecha, la razón y la cantidad recibida.</p>
    `;

    bindHelpedPersonButtons(member, people);
    if (!els.memberDialog.open) els.memberDialog.showModal();
  }

  function renderHelpedPeopleList(people) {
    if (!people.length) {
      return `
        <div class="helped-people-empty">
          <span>👥</span>
          <strong>Aún no hay personas registradas.</strong>
          <p>Los próximos regalos e indexaciones aparecerán aquí.</p>
        </div>
      `;
    }

    return `<div class="helped-people-list">${people.map((person, index) => {
      const linkedMember = person.id && state.members.find((member) => member.discord_user_id === person.id);
      const identity = linkedMember ? `@${escapeHtml(linkedMember.username)}` : "Miembro ayudado";
      const breakdown = [
        person.gifted ? `🎁 ${person.gifted}` : "",
        person.indexed ? `📁 ${person.indexed}` : "",
        person.exchanged ? `🤝 ${person.exchanged}` : "",
        person.community ? `⭐ ${person.community}` : ""
      ].filter(Boolean).join(" · ");

      return `
        <button class="helped-person-row" type="button" data-helped-person-index="${index}">
          <span class="helped-person-avatar">${getInitials(person.name)}</span>
          <span class="helped-person-copy">
            <strong>${escapeHtml(person.name)}</strong>
            <small>${identity} · última ayuda ${formatRelativeTime(person.lastHelpedAt)}</small>
          </span>
          <span class="helped-person-metrics">
            <strong>${formatNumber(person.count)} ${person.count === 1 ? "ayuda" : "ayudas"}</strong>
            <small>${breakdown || "⭐ Ayuda comunitaria"}</small>
          </span>
          <span class="helped-person-arrow" aria-hidden="true">→</span>
        </button>
      `;
    }).join("")}</div>`;
  }

  function bindHelpedPersonButtons(helper, people) {
    els.dialogProfile.querySelectorAll("[data-helped-person-index]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.helpedPersonIndex);
        const person = people[index];
        if (person) openRelationshipHistory(helper, person);
      });
    });
  }

  function getEventsForPerson(helperId, person) {
    const personName = normalizeName(person.name);
    return getMemberEvents(helperId).filter((event) => {
      const sameId = Boolean(person.id && event.giver_id && person.id === event.giver_id);
      const sameName = normalizeName(event.giver_name) === personName;
      return sameId || sameName;
    });
  }

  function normalizeName(value) {
    return String(value || "").trim().toLocaleLowerCase("es");
  }

  function openRelationshipHistory(helper, person) {
    const events = getEventsForPerson(helper.discord_user_id, person);
    const total = totalQuantity(events);
    const counts = events.reduce((acc, event) => {
      if (event.reason === "gifted_sprite") acc.gifted += event.quantity;
      else if (event.reason === "index_help") acc.indexed += event.quantity;
      else if (event.reason === "safe_exchange") acc.exchanged += event.quantity;
      else acc.community += event.quantity;
      return acc;
    }, { gifted: 0, indexed: 0, exchanged: 0, community: 0 });

    const linkedMember = person.id && state.members.find((member) => member.discord_user_id === person.id);
    const identity = linkedMember ? `@${escapeHtml(linkedMember.username)}` : "Miembro ayudado";

    els.dialogProfile.innerHTML = `
      <button class="relationship-back" type="button" data-back-helper="${escapeHtml(helper.discord_user_id)}">← Volver al perfil de ${escapeHtml(helper.display_name)}</button>

      <div class="relationship-head">
        <span class="relationship-avatar">${getInitials(person.name)}</span>
        <div>
          <small>HISTORIAL DETALLADO DE AYUDA</small>
          <h3>${escapeHtml(person.name)}</h3>
          <p>${identity} · ayudas recibidas de <strong>${escapeHtml(helper.display_name)}</strong></p>
        </div>
      </div>

      <div class="relationship-summary">
        <div><small>Comandos /assist</small><strong>${formatNumber(events.length)}</strong></div>
        <div><small>Total recibido</small><strong>${formatNumber(total)}</strong></div>
        <div><small>Regalos</small><strong>${formatNumber(counts.gifted)}</strong></div>
        <div><small>Indexaciones</small><strong>${formatNumber(counts.indexed)}</strong></div>
      </div>

      <section class="assist-history-section" aria-labelledby="assistHistoryTitle">
        <div class="assist-history-title">
          <div>
            <small>REGISTRO DE COMANDOS</small>
            <h4 id="assistHistoryTitle">Cada uso de /assist</h4>
          </div>
          <span>${formatNumber(events.length)}</span>
        </div>
        ${renderAssistHistory(events)}
      </section>

      <p class="dialog-note">Cada fila representa una vez que esta persona usó el comando. El sistema guarda el tipo de ayuda y la cantidad, pero no los nombres específicos de los Sprites.</p>
    `;

    const backButton = els.dialogProfile.querySelector("[data-back-helper]");
    backButton?.addEventListener("click", () => openExpandedMemberProfile(helper.discord_user_id));
    if (!els.memberDialog.open) els.memberDialog.showModal();
  }

  function renderAssistHistory(events) {
    if (!events.length) {
      return `<div class="helped-people-empty"><span>📋</span><strong>No hay comandos registrados.</strong></div>`;
    }

    return `
      <div class="assist-history-table">
        <div class="assist-history-header">
          <span>Fecha y hora</span>
          <span>Tipo de ayuda</span>
          <span>Cantidad recibida</span>
        </div>
        <div class="assist-history-body">
          ${events.map((event, index) => {
            const meta = reasonMeta(event.reason, event.quantity);
            return `
              <article class="assist-history-row">
                <time datetime="${escapeAttribute(event.created_at)}">
                  <strong>${escapeHtml(formatEventDate(event.created_at))}</strong>
                  <small>Comando #${events.length - index}</small>
                </time>
                <span class="assist-history-reason">
                  <i aria-hidden="true">${meta.icon}</i>
                  <span><strong>${meta.label}</strong><small>/assist</small></span>
                </span>
                <span class="assist-history-quantity"><strong>${formatNumber(event.quantity)}</strong><small>${meta.unit}</small></span>
              </article>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }

  function reasonMeta(reason, quantity) {
    const plural = quantity === 1 ? "Sprite" : "Sprites";
    if (reason === "gifted_sprite") return { icon: "🎁", label: "Sprite regalado", unit: plural };
    if (reason === "index_help") return { icon: "📁", label: "Ayuda de indexación", unit: plural };
    if (reason === "safe_exchange") return { icon: "🤝", label: "Intercambio seguro", unit: quantity === 1 ? "intercambio" : "intercambios" };
    return { icon: "⭐", label: "Ayuda comunitaria", unit: quantity === 1 ? "ayuda" : "ayudas" };
  }

  function formatEventDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Fecha desconocida";
    return new Intl.DateTimeFormat("es", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  }

  function injectHelpedProfileStyles() {
    if (document.querySelector("#helpedProfilesStyles")) return;

    const style = document.createElement("style");
    style.id = "helpedProfilesStyles";
    style.textContent = `
      .table-header,
      .leaderboard-row {
        grid-template-columns: 72px minmax(180px, 1.35fr) 118px minmax(120px, .9fr) 82px;
      }
      .people-helped-cell {
        display: flex;
        align-items: baseline;
        gap: 6px;
        color: #efe7ff;
      }
      .people-helped-cell strong { font-size: 18px; font-weight: 900; }
      .people-helped-cell small { color: var(--muted); font-size: 11px; }
      .podium-impact {
        display: block;
        width: fit-content;
        max-width: 100%;
        margin: 8px auto 0;
        padding: 6px 9px;
        border: 1px solid rgba(139,92,246,.2);
        border-radius: 999px;
        background: rgba(139,92,246,.1);
        color: #dfd2ff;
        font-size: 10px;
        font-weight: 800;
        white-space: nowrap;
      }
      .member-dialog { width: min(820px, calc(100% - 28px)); }
      .dialog-card { max-height: min(88vh, 900px); overflow-y: auto; }
      .dialog-profile-identity { min-width: 0; }
      .dialog-profile-role { margin-top: 10px; }
      .dialog-stats-impact { grid-template-columns: repeat(4, 1fr); }
      .highlight-stat {
        background: linear-gradient(135deg, rgba(139,92,246,.18), rgba(217,70,239,.08));
        border-color: rgba(139,92,246,.28);
      }
      .helped-people-section,
      .assist-history-section {
        margin-top: 18px;
        border: 1px solid var(--border);
        border-radius: 18px;
        overflow: hidden;
        background: rgba(255,255,255,.025);
      }
      .helped-people-header,
      .assist-history-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        padding: 17px 18px;
        border-bottom: 1px solid var(--border);
      }
      .helped-people-header small,
      .assist-history-title small,
      .relationship-head small {
        color: #bda9dc;
        font-size: 10px;
        font-weight: 850;
        letter-spacing: .12em;
      }
      .helped-people-header h4,
      .assist-history-title h4 { margin: 4px 0 0; font-size: 18px; }
      .helped-people-header > span,
      .assist-history-title > span {
        min-width: 38px;
        height: 38px;
        display: grid;
        place-items: center;
        border-radius: 12px;
        background: rgba(139,92,246,.14);
        color: #eee6ff;
        font-weight: 900;
      }
      .helped-people-list { max-height: 330px; overflow-y: auto; padding: 5px 16px 10px; }
      .helped-person-row {
        width: 100%;
        display: grid;
        grid-template-columns: 42px minmax(0, 1fr) auto 18px;
        align-items: center;
        gap: 11px;
        padding: 13px 2px;
        border: 0;
        border-bottom: 1px solid rgba(255,255,255,.06);
        background: transparent;
        color: inherit;
        text-align: left;
        cursor: pointer;
      }
      .helped-person-row:hover { background: rgba(139,92,246,.07); }
      .helped-person-row:last-child { border-bottom: 0; }
      .helped-person-avatar,
      .relationship-avatar {
        width: 40px;
        height: 40px;
        display: grid;
        place-items: center;
        border-radius: 50%;
        background: linear-gradient(135deg, rgba(139,92,246,.75), rgba(217,70,239,.45));
        border: 1px solid rgba(255,255,255,.14);
        font-size: 12px;
        font-weight: 900;
      }
      .helped-person-copy,
      .helped-person-metrics { min-width: 0; }
      .helped-person-copy strong,
      .helped-person-copy small,
      .helped-person-metrics strong,
      .helped-person-metrics small { display: block; }
      .helped-person-copy small,
      .helped-person-metrics small { margin-top: 3px; color: var(--muted); font-size: 11px; }
      .helped-person-metrics { text-align: right; }
      .helped-person-metrics strong { font-size: 13px; }
      .helped-person-arrow { color: #bda9dc; font-size: 18px; }
      .helped-people-empty { padding: 30px 18px; text-align: center; }
      .helped-people-empty > span { font-size: 28px; }
      .helped-people-empty strong { display: block; margin: 8px 0 4px; }
      .helped-people-empty p { margin: 0; color: var(--muted); font-size: 13px; }

      .relationship-back {
        margin: 4px 0 18px;
        padding: 8px 12px;
        border: 1px solid rgba(139,92,246,.24);
        border-radius: 10px;
        background: rgba(139,92,246,.08);
        color: #ded2f5;
        font: inherit;
        font-size: 12px;
        font-weight: 750;
        cursor: pointer;
      }
      .relationship-back:hover { background: rgba(139,92,246,.16); }
      .relationship-head {
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .relationship-avatar { width: 58px; height: 58px; font-size: 16px; flex: 0 0 auto; }
      .relationship-head h3 { margin: 5px 0 3px; font-size: 24px; }
      .relationship-head p { margin: 0; color: var(--muted); font-size: 13px; }
      .relationship-summary {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 10px;
        margin-top: 18px;
      }
      .relationship-summary > div {
        min-width: 0;
        padding: 14px;
        border: 1px solid var(--border);
        border-radius: 14px;
        background: rgba(255,255,255,.025);
      }
      .relationship-summary small,
      .relationship-summary strong { display: block; }
      .relationship-summary small { color: var(--muted); font-size: 11px; }
      .relationship-summary strong { margin-top: 6px; font-size: 22px; }

      .assist-history-table { overflow: hidden; }
      .assist-history-header,
      .assist-history-row {
        display: grid;
        grid-template-columns: minmax(150px, 1fr) minmax(180px, 1.2fr) 120px;
        align-items: center;
        gap: 14px;
      }
      .assist-history-header {
        padding: 10px 18px;
        background: rgba(255,255,255,.035);
        color: #a999c1;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: .06em;
        text-transform: uppercase;
      }
      .assist-history-body { max-height: 360px; overflow-y: auto; }
      .assist-history-row {
        padding: 14px 18px;
        border-top: 1px solid rgba(255,255,255,.055);
      }
      .assist-history-row:first-child { border-top: 0; }
      .assist-history-row time strong,
      .assist-history-row time small,
      .assist-history-reason strong,
      .assist-history-reason small,
      .assist-history-quantity strong,
      .assist-history-quantity small { display: block; }
      .assist-history-row time strong { font-size: 12px; }
      .assist-history-row time small,
      .assist-history-reason small,
      .assist-history-quantity small { margin-top: 3px; color: var(--muted); font-size: 10px; }
      .assist-history-reason { display: flex; align-items: center; gap: 10px; }
      .assist-history-reason i {
        width: 34px;
        height: 34px;
        display: grid;
        place-items: center;
        border-radius: 10px;
        background: rgba(139,92,246,.1);
        font-style: normal;
      }
      .assist-history-reason strong { font-size: 12px; }
      .assist-history-quantity { text-align: right; }
      .assist-history-quantity strong { font-size: 18px; }

      @media (max-width: 860px) {
        .dialog-stats-impact,
        .relationship-summary { grid-template-columns: repeat(2, 1fr); }
      }

      @media (max-width: 680px) {
        .leaderboard-row { grid-template-columns: 40px minmax(0, 1fr) 64px; }
        .leaderboard-row .position { grid-column: 1; grid-row: 1; }
        .leaderboard-row .member-cell { grid-column: 2; grid-row: 1; }
        .leaderboard-row .points-cell { grid-column: 3; grid-row: 1; }
        .leaderboard-row .people-helped-cell {
          grid-column: 2 / 4;
          grid-row: 2;
          margin-left: 49px;
        }
        .leaderboard-row .role-pill {
          grid-column: 2 / 4;
          grid-row: 3;
          margin-left: 49px;
        }
        .podium-impact { white-space: normal; line-height: 1.35; }
        .dialog-stats-impact,
        .relationship-summary { grid-template-columns: 1fr 1fr; }
        .helped-person-row { grid-template-columns: 38px minmax(0, 1fr) 18px; }
        .helped-person-metrics {
          grid-column: 2 / 4;
          padding-left: 0;
          text-align: left;
        }
        .assist-history-header { display: none; }
        .assist-history-row {
          grid-template-columns: 1fr auto;
          gap: 10px;
        }
        .assist-history-row time { grid-column: 1 / 3; }
        .assist-history-quantity { text-align: right; }
      }
    `;
    document.head.appendChild(style);
  }
})();
