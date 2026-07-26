(() => {
  const OWNER_USERNAME = "lykan0147";
  const PARKA_ORO_URL = "parka-oro.svg?v=20260726-founder";
  const HISTORY_PAGE_SIZE = 1000;
  const HISTORY_MAX_ROWS = 10000;

  let founderMember = null;
  let fullEvents = [];
  let loadingEvents = null;

  const baseNormalizeMembers = normalizeMembers;
  const baseLoadData = loadData;
  const baseRenderAll = renderAll;
  const regularOpenMemberProfile = openMemberProfile;

  loadStyles();
  replaceBrandMark();
  compactVaultNetwork();
  removeContributionButton();
  ensureFounderSection();
  installActivityHistory();

  normalizeMembers = function normalizeMembersWithoutFounder(rows) {
    const normalized = baseNormalizeMembers(rows);
    founderMember = normalized.find(isFounder) || null;
    return normalized.filter((member) => !isFounder(member));
  };

  renderStats = renderStatsWithoutFounder;
  renderChampion = renderChampionWithoutFounder;

  renderAll = function renderAllWithoutFounderCompetition() {
    extractFounderFromState();
    baseRenderAll();
    renderFounderCard();
  };

  loadData = async function loadDataWithoutFounderCompetition() {
    await baseLoadData();
    await refreshFullEvents();
    refreshViews();
  };

  extractFounderFromState();

  refreshFullEvents()
    .catch((error) => console.warn("No se pudo cargar toda la actividad:", error))
    .finally(refreshViews);

  function normalizeUsername(value) {
    return String(value || "")
      .trim()
      .replace(/^@/, "")
      .split("#")[0]
      .toLocaleLowerCase("en-US");
  }

  function isFounder(member) {
    return normalizeUsername(member?.username) === OWNER_USERNAME;
  }

  function extractFounderFromState() {
    const candidates = [...(state.members || []), ...(state.filteredMembers || [])];
    const found = candidates.find(isFounder);
    if (found) founderMember = found;

    state.members = (state.members || []).filter((member) => !isFounder(member));
    state.filteredMembers = (state.filteredMembers || []).filter((member) => !isFounder(member));
  }

  function refreshViews() {
    extractFounderFromState();
    renderStats();
    renderChampion();
    renderPodium();
    renderLeaderboard();
    renderFounderCard();
    renderActivityHistory();
  }

  async function refreshFullEvents() {
    if (loadingEvents) return loadingEvents;

    loadingEvents = (async () => {
      if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
        fullEvents = normalizeEventsForFounder(state.events);
        return;
      }

      const rows = [];

      for (let offset = 0; offset < HISTORY_MAX_ROWS; offset += HISTORY_PAGE_SIZE) {
        const path =
          `/rest/v1/assist_events?select=id,helper_id,helper_name,giver_id,giver_name,reason,created_at` +
          `&order=created_at.desc&limit=${HISTORY_PAGE_SIZE}&offset=${offset}`;
        const page = await supabaseGet(path);
        rows.push(...page);
        if (page.length < HISTORY_PAGE_SIZE) break;
      }

      fullEvents = normalizeEventsForFounder(rows);
    })();

    try {
      await loadingEvents;
    } finally {
      loadingEvents = null;
    }
  }

  function normalizeEventsForFounder(rows) {
    return [...(rows || [])]
      .map((row) => ({
        id: row.id,
        helper_id: String(row.helper_id || ""),
        helper_name: row.helper_name || "Un miembro",
        giver_id: String(row.giver_id || ""),
        giver_name: row.giver_name || "Otro miembro",
        reason: row.reason || "community_help",
        created_at: row.created_at || new Date().toISOString()
      }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  function historyEvents() {
    return fullEvents.length ? fullEvents : normalizeEventsForFounder(state.events);
  }

  function isHelpEvent(event) {
    return ["gifted_sprite", "index_help", "community_help"].includes(event.reason);
  }

  function founderEvents() {
    if (!founderMember) return [];
    return historyEvents().filter(
      (event) => event.helper_id === founderMember.discord_user_id && isHelpEvent(event)
    );
  }

  function founderPeople() {
    const people = new Map();

    founderEvents().forEach((event) => {
      const name = String(event.giver_name || "Otro miembro").trim() || "Otro miembro";
      const key = event.giver_id || `name:${name.toLocaleLowerCase("es")}`;
      const current = people.get(key) || {
        id: event.giver_id || "",
        name,
        count: 0,
        gifted: 0,
        indexed: 0,
        community: 0,
        last: event.created_at
      };

      current.count += 1;
      if (event.reason === "gifted_sprite") current.gifted += 1;
      else if (event.reason === "index_help") current.indexed += 1;
      else current.community += 1;

      if (new Date(event.created_at) > new Date(current.last)) {
        current.last = event.created_at;
      }

      people.set(key, current);
    });

    return [...people.values()].sort(
      (a, b) =>
        b.count - a.count ||
        new Date(b.last) - new Date(a.last) ||
        a.name.localeCompare(b.name, "es")
    );
  }

  function renderStatsWithoutFounder() {
    const allMembers = founderMember ? [...state.members, founderMember] : [...state.members];
    const total = allMembers.reduce((sum, member) => sum + member.assist_points, 0);
    const weekly = historyEvents().filter((event) => isWithinDays(event.created_at, 7)).length;
    const topRegular = state.members[0];

    animateNumber(els.totalAssists, total);
    animateNumber(els.activeHelpers, allMembers.length);
    animateNumber(els.weeklyAssists, weekly);

    els.topHelper.textContent = topRegular?.display_name || "—";
    els.topHelperPoints.textContent = topRegular
      ? `${formatNumber(topRegular.assist_points)} puntos de Assist`
      : "Sin datos";
  }

  function renderChampionWithoutFounder() {
    const regularIds = new Set(state.members.map((member) => member.discord_user_id));
    const scores = new Map();

    historyEvents()
      .filter(
        (event) =>
          regularIds.has(event.helper_id) &&
          isHelpEvent(event) &&
          isWithinDays(event.created_at, 7)
      )
      .forEach((event) => {
        const current = scores.get(event.helper_id) || { count: 0, last: event.created_at };
        current.count += 1;
        if (new Date(event.created_at) > new Date(current.last)) current.last = event.created_at;
        scores.set(event.helper_id, current);
      });

    const ranked = [...scores.entries()].sort(
      (a, b) =>
        b[1].count - a[1].count ||
        new Date(b[1].last) - new Date(a[1].last)
    );

    const championId = ranked[0]?.[0] || state.members[0]?.discord_user_id;
    const champion =
      state.members.find((member) => member.discord_user_id === championId) || state.members[0];
    const weekCount = champion ? scores.get(champion.discord_user_id)?.count || 0 : 0;

    if (!champion) {
      els.championName.textContent = "—";
      els.championHandle.textContent = "@spritevault";
      els.championSummary.textContent = "Aún no hay un campeón regular registrado.";
      els.championRole.textContent = "Sin datos";
      els.championWeekStat.textContent = "0 esta semana";
      els.championAvatar.textContent = "SV";
      return;
    }

    els.championName.textContent = champion.display_name;
    els.championHandle.textContent = `@${champion.username}`;
    els.championSummary.textContent = weekCount
      ? `${champion.display_name} lidera la semana con ${weekCount} Assist${weekCount === 1 ? "" : "s"} registrados recientemente.`
      : `${champion.display_name} se mantiene como la referencia principal entre los miembros de la comunidad.`;
    els.championRole.textContent = champion.role_name;
    els.championWeekStat.textContent = weekCount
      ? `${weekCount} esta semana`
      : `${formatNumber(champion.assist_points)} Assist totales`;
    els.championAvatar.innerHTML = champion.avatar_url
      ? `<img src="${escapeAttribute(champion.avatar_url)}" alt="" loading="lazy" />`
      : getInitials(champion.display_name);
  }

  function ensureFounderSection() {
    const leaderboard = document.querySelector("#clasificacion");
    if (!leaderboard) return null;

    let section = document.querySelector("#founderSection");

    if (!section) {
      section = document.createElement("section");
      section.id = "founderSection";
      section.className = "founder-section panel";
      section.hidden = true;
      leaderboard.parentNode.insertBefore(section, leaderboard);
    }

    return section;
  }

  function renderFounderCard() {
    const section = ensureFounderSection();
    if (!section) return;

    if (!founderMember) {
      section.hidden = true;
      section.innerHTML = "";
      return;
    }

    const peopleCount = founderPeople().length;

    section.hidden = false;
    section.innerHTML = `
      <button class="founder-card-button" type="button">
        <span class="founder-image-shell"><img src="${PARKA_ORO_URL}" alt="Parka Oro" /></span>
        <span class="founder-copy">
          <small>👑 FUNDADOR DEL VAULT</small>
          <strong>${OWNER_USERNAME}</strong>
          <span>Actividad realizada por el propietario del servidor.</span>
        </span>
        <span class="founder-metrics">
          <span><strong>${formatNumber(founderMember.assist_points)}</strong><small>Assist</small></span>
          <span><strong>${formatNumber(peopleCount)}</strong><small>${peopleCount === 1 ? "persona ayudada" : "personas ayudadas"}</small></span>
        </span>
        <span class="founder-open">Ver perfil →</span>
      </button>
    `;

    section.querySelector(".founder-card-button")?.addEventListener("click", showFounderProfile);
  }

  function showFounderProfile() {
    if (!founderMember) return;

    const events = founderEvents();
    const people = founderPeople();
    const gifts = events.filter((event) => event.reason === "gifted_sprite").length;
    const indexes = events.filter((event) => event.reason === "index_help").length;
    const recent = events.filter((event) => isWithinDays(event.created_at, 30)).length;

    els.dialogProfile.innerHTML = `
      <div class="dialog-profile-head">
        <span class="avatar founder-dialog-avatar"><img src="${PARKA_ORO_URL}" alt="" /></span>
        <div class="dialog-profile-identity">
          <h3>Lykan</h3>
          <p>@${OWNER_USERNAME}</p>
          <span class="role-pill dialog-profile-role">Fundador del Vault</span>
        </div>
      </div>

      <div class="dialog-stats dialog-stats-impact">
        <div class="dialog-stat"><small>Estatus</small><strong>Fundador</strong></div>
        <div class="dialog-stat"><small>Puntos de Assist</small><strong>${formatNumber(founderMember.assist_points)}</strong></div>
        <div class="dialog-stat highlight-stat"><small>Personas ayudadas</small><strong>${formatNumber(people.length)}</strong></div>
        <div class="dialog-stat"><small>Ayudas registradas</small><strong>${formatNumber(events.length)}</strong></div>
      </div>

      <div class="dialog-breakdown">
        <div class="dialog-break-item"><span>🎁</span><div><small>Regalos registrados</small><strong>${formatNumber(gifts)}</strong></div></div>
        <div class="dialog-break-item"><span>📁</span><div><small>Indexaciones</small><strong>${formatNumber(indexes)}</strong></div></div>
        <div class="dialog-break-item"><span>↗</span><div><small>Actividad 30 días</small><strong>${formatNumber(recent)}</strong></div></div>
      </div>

      <section class="helped-people-section">
        <div class="helped-people-header">
          <div><small>IMPACTO EN LA COMUNIDAD</small><h4>Personas que ha ayudado</h4></div>
          <span>${formatNumber(people.length)}</span>
        </div>
        ${renderFounderPeople(people)}
      </section>

      <p class="dialog-note">Este perfil muestra la actividad del propietario sin incluirlo en ninguna clasificación competitiva.</p>
    `;

    bindFounderPeopleLinks();
    els.memberDialog.showModal();
  }

  function renderFounderPeople(people) {
    if (!people.length) {
      return `<div class="helped-people-empty"><span>👥</span><strong>Aún no hay personas registradas.</strong><p>Los próximos regalos e indexaciones aparecerán aquí.</p></div>`;
    }

    return `<div class="helped-people-list">${people
      .map((person) => {
        const linked = person.id && state.members.find((member) => member.discord_user_id === person.id);
        const tag = linked ? "button" : "article";
        const target = linked
          ? ` type="button" data-founder-person="${escapeHtml(linked.discord_user_id)}"`
          : "";
        const identity = linked ? `@${escapeHtml(linked.username)}` : "Miembro ayudado";
        const breakdown = [
          person.gifted ? `🎁 ${person.gifted}` : "",
          person.indexed ? `📁 ${person.indexed}` : "",
          person.community ? `⭐ ${person.community}` : ""
        ]
          .filter(Boolean)
          .join(" · ");

        return `
          <${tag} class="helped-person-row"${target}>
            <span class="helped-person-avatar">${getInitials(person.name)}</span>
            <span class="helped-person-copy">
              <strong>${escapeHtml(person.name)}</strong>
              <small>${identity} · última ayuda ${formatRelativeTime(person.last)}</small>
            </span>
            <span class="helped-person-metrics">
              <strong>${formatNumber(person.count)} ${person.count === 1 ? "ayuda" : "ayudas"}</strong>
              <small>${breakdown || "⭐ Ayuda comunitaria"}</small>
            </span>
            ${linked ? `<span class="helped-person-arrow">→</span>` : ""}
          </${tag}>
        `;
      })
      .join("")}</div>`;
  }

  function bindFounderPeopleLinks() {
    els.dialogProfile.querySelectorAll("[data-founder-person]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.founderPerson;
        els.memberDialog.close();
        window.setTimeout(() => regularOpenMemberProfile(id), 120);
      });
    });
  }

  function installActivityHistory() {
    const panel = document.querySelector(".activity-panel");
    if (!panel) return;

    panel.classList.add("activity-panel-clickable");
    panel.tabIndex = 0;
    panel.setAttribute("role", "button");
    panel.setAttribute("aria-label", "Abrir todo el historial de actividad");

    const header = panel.querySelector(".panel-header");
    const pulse = header?.querySelector(".pulse-label");

    if (header && pulse && !header.querySelector(".activity-header-actions")) {
      const actions = document.createElement("div");
      actions.className = "activity-header-actions";
      pulse.replaceWith(actions);
      actions.appendChild(pulse);

      const hint = document.createElement("span");
      hint.className = "activity-open-hint";
      hint.textContent = "Ver todo →";
      actions.appendChild(hint);
    }

    let dialog = document.querySelector("#activityHistoryDialog");

    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "activityHistoryDialog";
      dialog.className = "activity-history-dialog";
      dialog.innerHTML = `
        <form method="dialog" class="activity-history-card">
          <button class="dialog-close" value="close" aria-label="Cerrar">×</button>
          <div class="activity-history-heading">
            <span class="eyebrow"><span></span> HISTORIAL COMPLETO</span>
            <h2>Toda la actividad de Assist</h2>
            <p>Registro completo de regalos, indexaciones, ayuda comunitaria e intercambios guardados.</p>
          </div>
          <div id="activityHistoryList" class="activity-history-list"></div>
        </form>
      `;
      document.body.appendChild(dialog);
    }

    const open = () => {
      renderActivityHistory();
      dialog.showModal();
    };

    panel.addEventListener("click", open);
    panel.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      open();
    });
  }

  function renderActivityHistory() {
    const list = document.querySelector("#activityHistoryList");
    if (!list) return;

    const events = historyEvents();

    if (!events.length) {
      list.innerHTML = `<div class="helped-people-empty"><span>↗</span><strong>Aún no hay actividad.</strong><p>Los próximos Assists aparecerán aquí.</p></div>`;
      return;
    }

    list.innerHTML = events
      .map((event) => {
        const detail = reasonCopy(event.reason, event.helper_name, event.giver_name);
        const regularMember = state.members.find((member) => member.discord_user_id === event.helper_id);
        const founderEvent = founderMember?.discord_user_id === event.helper_id;
        const linked = Boolean(regularMember || founderEvent);
        const tag = linked ? "button" : "article";
        const target = linked
          ? ` type="button" data-history-profile="${escapeHtml(event.helper_id)}"`
          : "";

        return `
          <${tag} class="activity-history-item"${target}>
            <span class="activity-icon">${detail.icon}</span>
            <span class="activity-history-copy">
              <span>${detail.text}</span>
              <small>${formatFullDate(event.created_at)} · ${formatRelativeTime(event.created_at)}</small>
            </span>
            ${linked ? `<span class="activity-history-arrow">→</span>` : ""}
          </${tag}>
        `;
      })
      .join("");

    list.querySelectorAll("[data-history-profile]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const id = button.dataset.historyProfile;
        document.querySelector("#activityHistoryDialog")?.close();

        window.setTimeout(() => {
          if (founderMember?.discord_user_id === id) showFounderProfile();
          else regularOpenMemberProfile(id);
        }, 120);
      });
    });
  }

  function formatFullDate(value) {
    return new Intl.DateTimeFormat("es-US", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  }

  function replaceBrandMark() {
    const mark = document.querySelector(".brand-mark");
    if (!mark) return;
    mark.classList.add("brand-mark-parka");
    mark.innerHTML = `<img src="${PARKA_ORO_URL}" alt="" />`;
  }

  function compactVaultNetwork() {
    const header = document.querySelector(".site-header");
    const card = document.querySelector(".vault-status-card");
    const actions = header?.querySelector(".header-actions");
    if (!header || !card || !actions) return;

    header.classList.add("has-compact-vault");
    card.classList.add("vault-status-compact");
    header.insertBefore(card, actions);
  }

  function removeContributionButton() {
    document.querySelector(".contribution-cta")?.remove();
  }

  function loadStyles() {
    if (document.querySelector('link[data-founder-dashboard-styles]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "founder-dashboard.css?v=20260726-founder";
    link.dataset.founderDashboardStyles = "true";
    document.head.appendChild(link);
  }
})();