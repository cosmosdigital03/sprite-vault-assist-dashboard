const CONFIG = window.SPRITE_VAULT_CONFIG || {};

const demoMembers = [
  { discord_user_id: "1001", display_name: "John", username: "vault034", avatar_url: "", assist_points: 28, role_name: "Crystal Guardian", updated_at: isoDaysAgo(0) },
  { discord_user_id: "1002", display_name: "Luna", username: "luna.vault", avatar_url: "", assist_points: 24, role_name: "Sprite Keeper", updated_at: isoDaysAgo(1) },
  { discord_user_id: "1003", display_name: "Nova", username: "nova_sprite", avatar_url: "", assist_points: 19, role_name: "Sprite Keeper", updated_at: isoDaysAgo(2) },
  { discord_user_id: "1004", display_name: "Maya", username: "maya.rift", avatar_url: "", assist_points: 14, role_name: "Sprite Keeper", updated_at: isoDaysAgo(0) },
  { discord_user_id: "1005", display_name: "Carlos", username: "carlos_vault", avatar_url: "", assist_points: 11, role_name: "Sprite Keeper", updated_at: isoDaysAgo(4) },
  { discord_user_id: "1006", display_name: "Sofi", username: "sofi.sprite", avatar_url: "", assist_points: 9, role_name: "Vault Contributor", updated_at: isoDaysAgo(3) },
  { discord_user_id: "1007", display_name: "Rafa", username: "rafa_rift", avatar_url: "", assist_points: 7, role_name: "Vault Contributor", updated_at: isoDaysAgo(7) },
  { discord_user_id: "1008", display_name: "Nico", username: "nico.vault", avatar_url: "", assist_points: 5, role_name: "Vault Contributor", updated_at: isoDaysAgo(10) }
];

const demoEvents = [
  { id: 1, helper_id: "1001", helper_name: "John", giver_name: "Luna", reason: "gifted_sprite", created_at: isoHoursAgo(2) },
  { id: 2, helper_id: "1004", helper_name: "Maya", giver_name: "Nova", reason: "safe_exchange", created_at: isoHoursAgo(7) },
  { id: 3, helper_id: "1002", helper_name: "Luna", giver_name: "Carlos", reason: "index_help", created_at: isoHoursAgo(17) },
  { id: 4, helper_id: "1003", helper_name: "Nova", giver_name: "Sofi", reason: "gifted_sprite", created_at: isoDaysAgo(2) },
  { id: 5, helper_id: "1006", helper_name: "Sofi", giver_name: "Rafa", reason: "safe_exchange", created_at: isoDaysAgo(3) },
  { id: 6, helper_id: "1005", helper_name: "Carlos", giver_name: "Maya", reason: "index_help", created_at: isoDaysAgo(4) },
  { id: 7, helper_id: "1001", helper_name: "John", giver_name: "Nico", reason: "gifted_sprite", created_at: isoDaysAgo(1) },
  { id: 8, helper_id: "1001", helper_name: "John", giver_name: "Rafa", reason: "index_help", created_at: isoDaysAgo(5) },
  { id: 9, helper_id: "1002", helper_name: "Luna", giver_name: "John", reason: "gifted_sprite", created_at: isoDaysAgo(2) }
];

const spotlightSprites = [
  { name: "Ember", rarity: "Épico", tier: "epic", symbol: "🔥", description: "Brilla con energía intensa y un aura legendaria dentro de la colección." },
  { name: "Nova", rarity: "Mítico", tier: "mythic", symbol: "🌌", description: "Un Sprite de presencia cósmica que eleva cualquier colección al siguiente nivel." },
  { name: "Frostbite", rarity: "Raro", tier: "rare", symbol: "❄️", description: "Frío, limpio y elegante; perfecto para un showcase con identidad fuerte." },
  { name: "Volt", rarity: "Legendario", tier: "legendary", symbol: "⚡", description: "Electricidad pura y presencia dominante para el centro del dashboard." },
  { name: "Bloom", rarity: "Común", tier: "common", symbol: "🌿", description: "Simple, fresco y esencial: una pieza que mantiene viva la esencia de la Bóveda." }
];

const state = {
  members: [],
  events: [],
  filteredMembers: [],
  mode: "demo",
  spotlightIndex: 0,
  spotlightTimer: null
};

const els = {
  totalAssists: document.querySelector("#totalAssists"),
  activeHelpers: document.querySelector("#activeHelpers"),
  weeklyAssists: document.querySelector("#weeklyAssists"),
  topHelper: document.querySelector("#topHelper"),
  topHelperPoints: document.querySelector("#topHelperPoints"),
  podium: document.querySelector("#podium"),
  leaderboardList: document.querySelector("#leaderboardList"),
  activityList: document.querySelector("#activityList"),
  searchInput: document.querySelector("#searchInput"),
  emptyState: document.querySelector("#emptyState"),
  systemStatus: document.querySelector("#systemStatus"),
  lastUpdated: document.querySelector("#lastUpdated"),
  headerLivePill: document.querySelector("#headerLivePill"),
  refreshButton: document.querySelector("#refreshButton"),
  discordButton: document.querySelector("#discordButton"),
  openMyProgress: document.querySelector("#openMyProgress"),
  memberDialog: document.querySelector("#memberDialog"),
  dialogProfile: document.querySelector("#dialogProfile"),
  footerYear: document.querySelector("#footerYear"),
  spotlightCard: document.querySelector("#spotlightCard"),
  spotlightName: document.querySelector("#spotlightName"),
  spotlightRarity: document.querySelector("#spotlightRarity"),
  spotlightSprite: document.querySelector("#spotlightSprite"),
  spotlightDescription: document.querySelector("#spotlightDescription"),
  championName: document.querySelector("#championName"),
  championHandle: document.querySelector("#championHandle"),
  championSummary: document.querySelector("#championSummary"),
  championRole: document.querySelector("#championRole"),
  championWeekStat: document.querySelector("#championWeekStat"),
  championAvatar: document.querySelector("#championAvatar"),
  breakdownGiftedBar: document.querySelector("#breakdownGiftedBar"),
  breakdownGiftedValue: document.querySelector("#breakdownGiftedValue"),
  breakdownIndexBar: document.querySelector("#breakdownIndexBar"),
  breakdownIndexValue: document.querySelector("#breakdownIndexValue"),
  breakdownTradeBar: document.querySelector("#breakdownTradeBar"),
  breakdownTradeValue: document.querySelector("#breakdownTradeValue"),
  contributorsCount: document.querySelector("#contributorsCount"),
  keepersCount: document.querySelector("#keepersCount"),
  guardiansCount: document.querySelector("#guardiansCount")
};

init();

async function init() {
  els.footerYear.textContent = `© ${new Date().getFullYear()} Sprite Vault`;
  els.discordButton.href = CONFIG.DISCORD_INVITE_URL || "https://discord.com/";
  bindEvents();
  setLoadingState();
  startSpotlightRotation();
  await loadData();
}

function bindEvents() {
  els.searchInput.addEventListener("input", (event) => applySearch(event.target.value));
  els.refreshButton.addEventListener("click", async () => {
    els.refreshButton.disabled = true;
    els.refreshButton.textContent = "…";
    await loadData();
    els.refreshButton.disabled = false;
    els.refreshButton.textContent = "↻";
  });
  els.openMyProgress.addEventListener("click", () => {
    els.searchInput.focus();
    document.querySelector("#clasificacion").scrollIntoView({ behavior: "smooth" });
  });
}

async function loadData() {
  try {
    if (isSupabaseConfigured()) {
      const [members, events] = await Promise.all([fetchMembers(), fetchEvents()]);
      state.members = normalizeMembers(members);
      state.events = normalizeEvents(events);
      state.mode = "live";
    } else {
      useDemoData();
    }
  } catch (error) {
    console.error("No se pudieron cargar los datos en vivo:", error);
    useDemoData();
    state.mode = "fallback";
  }

  state.filteredMembers = [...state.members];
  renderAll();
}

function isSupabaseConfigured() {
  return Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
}

async function fetchMembers() {
  const limit = Number(CONFIG.LEADERBOARD_LIMIT || 100);
  return supabaseGet(`/rest/v1/assist_members?select=*&order=assist_points.desc&limit=${limit}`);
}

async function fetchEvents() {
  const limit = Number(CONFIG.RECENT_ACTIVITY_LIMIT || 8) * 8;
  return supabaseGet(`/rest/v1/assist_events?select=*&order=created_at.desc&limit=${limit}`);
}

async function supabaseGet(path) {
  const response = await fetch(`${CONFIG.SUPABASE_URL}${path}`, {
    headers: {
      apikey: CONFIG.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
    },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Supabase respondió ${response.status}`);
  return response.json();
}

function useDemoData() {
  state.members = normalizeMembers(demoMembers);
  state.events = normalizeEvents(demoEvents);
  state.mode = "demo";
}

function normalizeMembers(rows) {
  return [...rows]
    .map((row) => ({
      discord_user_id: String(row.discord_user_id ?? row.user_id ?? ""),
      display_name: row.display_name || row.username || "Miembro",
      username: row.username || "usuario",
      avatar_url: row.avatar_url || "",
      assist_points: Number(row.assist_points ?? row.points ?? 0),
      role_name: row.role_name || inferRole(Number(row.assist_points ?? row.points ?? 0)),
      updated_at: row.updated_at || row.last_assist_at || new Date().toISOString()
    }))
    .sort((a, b) => b.assist_points - a.assist_points || a.display_name.localeCompare(b.display_name));
}

function normalizeEvents(rows) {
  return [...rows]
    .map((row) => ({
      id: row.id,
      helper_id: String(row.helper_id || ""),
      helper_name: row.helper_name || "Un miembro",
      giver_name: row.giver_name || "Otro miembro",
      reason: row.reason || "community_help",
      created_at: row.created_at || new Date().toISOString()
    }))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function inferRole(points) {
  if (points >= 25) return "Crystal Guardian";
  if (points >= 10) return "Sprite Keeper";
  if (points >= 3) return "Vault Contributor";
  return "Miembro de la Bóveda";
}

function renderAll() {
  renderStatus();
  renderStats();
  renderChampion();
  renderBreakdown();
  renderRoleProgress();
  renderPodium();
  renderLeaderboard();
  renderActivity();
}

function renderStatus() {
  const labels = {
    live: "Datos conectados",
    demo: "Modo demostración",
    fallback: "Datos de demostración"
  };
  const pillCopy = {
    live: "En vivo",
    demo: "Demo",
    fallback: "Fallback"
  };
  els.systemStatus.textContent = labels[state.mode] || labels.demo;
  els.lastUpdated.textContent = `Actualizado ${formatRelativeTime(new Date().toISOString())}`;
  els.headerLivePill.lastElementChild.textContent = pillCopy[state.mode] || pillCopy.demo;
}

function renderStats() {
  const total = state.members.reduce((sum, member) => sum + member.assist_points, 0);
  const weekly = state.events.filter((event) => isWithinDays(event.created_at, 7)).length;
  const top = state.members[0];

  animateNumber(els.totalAssists, total);
  animateNumber(els.activeHelpers, state.members.length);
  animateNumber(els.weeklyAssists, weekly);
  els.topHelper.textContent = top?.display_name || "—";
  els.topHelperPoints.textContent = top ? `${top.assist_points} puntos de Assist` : "Sin datos";
}

function renderChampion() {
  const weeklyEvents = state.events.filter((event) => isWithinDays(event.created_at, 7));
  const scores = new Map();

  weeklyEvents.forEach((event) => {
    const current = scores.get(event.helper_id) || { count: 0, last: event.created_at };
    current.count += 1;
    if (new Date(event.created_at) > new Date(current.last)) current.last = event.created_at;
    scores.set(event.helper_id, current);
  });

  const ranked = [...scores.entries()].sort((a, b) => b[1].count - a[1].count || new Date(b[1].last) - new Date(a[1].last));
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

function renderBreakdown() {
  const counts = {
    gifted_sprite: 0,
    index_help: 0,
    safe_exchange: 0
  };

  state.events.forEach((event) => {
    if (event.reason === "gifted_sprite") counts.gifted_sprite += 1;
    else if (event.reason === "index_help") counts.index_help += 1;
    else if (event.reason === "safe_exchange") counts.safe_exchange += 1;
  });

  const max = Math.max(counts.gifted_sprite, counts.index_help, counts.safe_exchange, 1);
  updateBreakdownItem(els.breakdownGiftedBar, els.breakdownGiftedValue, counts.gifted_sprite, max);
  updateBreakdownItem(els.breakdownIndexBar, els.breakdownIndexValue, counts.index_help, max);
  updateBreakdownItem(els.breakdownTradeBar, els.breakdownTradeValue, counts.safe_exchange, max);
}

function renderRoleProgress() {
  const contributors = state.members.filter((member) => member.assist_points >= 3 && member.assist_points < 10).length;
  const keepers = state.members.filter((member) => member.assist_points >= 10 && member.assist_points < 25).length;
  const guardians = state.members.filter((member) => member.assist_points >= 25).length;

  els.contributorsCount.textContent = `${contributors} miembro${contributors === 1 ? "" : "s"}`;
  els.keepersCount.textContent = `${keepers} miembro${keepers === 1 ? "" : "s"}`;
  els.guardiansCount.textContent = `${guardians} miembro${guardians === 1 ? "" : "s"}`;
}

function renderPodium() {
  const topThree = state.members.slice(0, 3);
  const placementTheme = {
    1: { className: "first", icon: "♛", label: "Campeón" },
    2: { className: "second", icon: "✦", label: "Subcampeón" },
    3: { className: "third", icon: "✦", label: "Top 3" }
  };

  els.podium.innerHTML = topThree.map((member, index) => {
    const placement = index + 1;
    const theme = placementTheme[placement];
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
        <span class="podium-label">${theme.label}</span>
      </button>
    `;
  }).join("");
  bindProfileButtons(els.podium);
}

function renderLeaderboard() {
  els.leaderboardList.innerHTML = state.filteredMembers.map((member) => {
    const position = state.members.findIndex((candidate) => candidate.discord_user_id === member.discord_user_id) + 1;
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
        <span class="role-pill">${escapeHtml(member.role_name)}</span>
        <span class="points-cell">${formatNumber(member.assist_points)}</span>
      </button>
    `;
  }).join("");

  els.emptyState.hidden = state.filteredMembers.length > 0;
  bindProfileButtons(els.leaderboardList);
}

function renderActivity() {
  const limit = Number(CONFIG.RECENT_ACTIVITY_LIMIT || 8);
  const events = state.events.slice(0, limit);

  if (!events.length) {
    els.activityList.innerHTML = `<div class="empty-state"><strong>Aún no hay actividad.</strong><p>Los próximos Assists aparecerán aquí.</p></div>`;
    return;
  }

  els.activityList.innerHTML = events.map((event) => {
    const detail = reasonCopy(event.reason, event.helper_name, event.giver_name);
    return `
      <article class="activity-item">
        <span class="activity-icon" aria-hidden="true">${detail.icon}</span>
        <div>
          <p>${detail.text}</p>
          <small>${formatRelativeTime(event.created_at)}</small>
        </div>
      </article>
    `;
  }).join("");
}

function applySearch(query) {
  const normalized = query.trim().toLocaleLowerCase("es");
  state.filteredMembers = !normalized
    ? [...state.members]
    : state.members.filter((member) =>
        `${member.display_name} ${member.username}`.toLocaleLowerCase("es").includes(normalized)
      );
  renderLeaderboard();
}

function bindProfileButtons(container) {
  container.querySelectorAll("[data-user-id]").forEach((button) => {
    button.addEventListener("click", () => openMemberProfile(button.dataset.userId));
  });
}

function openMemberProfile(userId) {
  const member = state.members.find((item) => item.discord_user_id === userId);
  if (!member) return;
  const position = state.members.findIndex((item) => item.discord_user_id === userId) + 1;
  const recentCount = state.events.filter((event) => event.helper_id === userId && isWithinDays(event.created_at, 30)).length;
  const counts = memberContributionCounts(userId);

  els.dialogProfile.innerHTML = `
    <div class="dialog-profile-head">
      ${avatarMarkup(member)}
      <div>
        <h3>${escapeHtml(member.display_name)}</h3>
        <p>@${escapeHtml(member.username)}</p>
      </div>
    </div>
    <div class="dialog-stats">
      <div class="dialog-stat"><small>Posición general</small><strong>#${position}</strong></div>
      <div class="dialog-stat"><small>Puntos de Assist</small><strong>${formatNumber(member.assist_points)}</strong></div>
      <div class="dialog-stat"><small>Rol actual</small><strong>${escapeHtml(member.role_name)}</strong></div>
      <div class="dialog-stat"><small>Actividad 30 días</small><strong>${recentCount}</strong></div>
    </div>
    <div class="dialog-breakdown">
      <div class="dialog-break-item"><span>🎁</span><div><small>Sprites regalados</small><strong>${counts.gifted_sprite}</strong></div></div>
      <div class="dialog-break-item"><span>📁</span><div><small>Ayuda de indexación</small><strong>${counts.index_help}</strong></div></div>
      <div class="dialog-break-item"><span>🤝</span><div><small>Intercambios seguros</small><strong>${counts.safe_exchange}</strong></div></div>
    </div>
    <p class="dialog-note">Este perfil reconoce la ayuda registrada por Sprite Vault. Los requisitos internos de los roles no se muestran públicamente.</p>
  `;
  els.memberDialog.showModal();
}

function memberContributionCounts(userId) {
  return state.events.reduce((acc, event) => {
    if (event.helper_id !== userId) return acc;
    if (event.reason === "gifted_sprite") acc.gifted_sprite += 1;
    else if (event.reason === "index_help") acc.index_help += 1;
    else if (event.reason === "safe_exchange") acc.safe_exchange += 1;
    return acc;
  }, { gifted_sprite: 0, index_help: 0, safe_exchange: 0 });
}

function avatarMarkup(member) {
  if (member.avatar_url) {
    return `<span class="avatar"><img src="${escapeAttribute(member.avatar_url)}" alt="" loading="lazy" /></span>`;
  }
  return `<span class="avatar">${getInitials(member.display_name)}</span>`;
}

function getInitials(name) {
  return String(name || "SV")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function reasonCopy(reason, helperName, giverName) {
  const safeHelper = escapeHtml(helperName);
  const safeGiver = escapeHtml(giverName);
  const copy = {
    gifted_sprite: {
      icon: "🎁",
      text: `<strong>${safeHelper}</strong> ayudó a <strong>${safeGiver}</strong> regalando un Sprite.`
    },
    index_help: {
      icon: "📁",
      text: `<strong>${safeHelper}</strong> ayudó a <strong>${safeGiver}</strong> con el indexado.`
    },
    safe_exchange: {
      icon: "🤝",
      text: `<strong>${safeHelper}</strong> completó un intercambio seguro con <strong>${safeGiver}</strong>.`
    },
    community_help: {
      icon: "⭐",
      text: `<strong>${safeHelper}</strong> ayudó a <strong>${safeGiver}</strong> dentro de la comunidad.`
    }
  };
  return copy[reason] || copy.community_help;
}

function updateBreakdownItem(barEl, valueEl, value, max) {
  valueEl.textContent = formatNumber(value);
  requestAnimationFrame(() => {
    barEl.style.width = `${Math.max((value / max) * 100, value ? 14 : 0)}%`;
  });
}

function startSpotlightRotation() {
  renderSpotlight(spotlightSprites[state.spotlightIndex]);
  if (state.spotlightTimer) clearInterval(state.spotlightTimer);
  state.spotlightTimer = setInterval(() => {
    state.spotlightIndex = (state.spotlightIndex + 1) % spotlightSprites.length;
    renderSpotlight(spotlightSprites[state.spotlightIndex]);
  }, 6000);
}

function renderSpotlight(sprite) {
  if (!sprite) return;
  els.spotlightCard.className = `spotlight-card rarity-${sprite.tier}`;
  els.spotlightName.textContent = sprite.name;
  els.spotlightRarity.textContent = sprite.rarity;
  els.spotlightSprite.textContent = sprite.symbol;
  els.spotlightDescription.textContent = sprite.description;
}

function animateNumber(element, value) {
  const start = Number(element.dataset.value || 0);
  const end = Number(value || 0);
  const duration = 700;
  const startedAt = performance.now();

  function frame(now) {
    const progress = Math.min((now - startedAt) / duration, 1);
    const current = Math.round(start + (end - start) * easeOutCubic(progress));
    element.textContent = formatNumber(current);
    if (progress < 1) requestAnimationFrame(frame);
    else element.dataset.value = String(end);
  }

  requestAnimationFrame(frame);
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function setLoadingState() {
  [
    els.totalAssists,
    els.activeHelpers,
    els.weeklyAssists,
    els.topHelper,
    els.topHelperPoints,
    els.systemStatus,
    els.lastUpdated,
    els.championName,
    els.championSummary,
    els.championRole,
    els.championWeekStat
  ].forEach((node) => node?.classList.add("skeleton"));

  window.setTimeout(() => {
    document.querySelectorAll(".skeleton").forEach((node) => node.classList.remove("skeleton"));
  }, 900);
}

function formatRelativeTime(dateInput) {
  const date = new Date(dateInput);
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  const ranges = [
    { max: 60, value: 1, unit: "second" },
    { max: 3600, value: 60, unit: "minute" },
    { max: 86400, value: 3600, unit: "hour" },
    { max: 604800, value: 86400, unit: "day" },
    { max: 2629800, value: 604800, unit: "week" },
    { max: 31557600, value: 2629800, unit: "month" },
    { max: Infinity, value: 31557600, unit: "year" }
  ];
  const range = ranges.find((item) => Math.abs(seconds) < item.max) || ranges[ranges.length - 1];
  return formatter.format(Math.round(seconds / range.value), range.unit);
}

function isWithinDays(dateInput, days) {
  return Date.now() - new Date(dateInput).getTime() <= days * 24 * 60 * 60 * 1000;
}

function formatNumber(value) {
  return new Intl.NumberFormat("es-ES").format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function isoHoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}
