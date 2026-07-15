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
  { id: 6, helper_id: "1005", helper_name: "Carlos", giver_name: "Maya", reason: "index_help", created_at: isoDaysAgo(4) }
];

const state = {
  members: [],
  events: [],
  filteredMembers: [],
  mode: "demo"
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
  refreshButton: document.querySelector("#refreshButton"),
  discordButton: document.querySelector("#discordButton"),
  openMyProgress: document.querySelector("#openMyProgress"),
  memberDialog: document.querySelector("#memberDialog"),
  dialogProfile: document.querySelector("#dialogProfile"),
  footerYear: document.querySelector("#footerYear")
};

init();

async function init() {
  els.footerYear.textContent = `© ${new Date().getFullYear()} Sprite Vault`;
  els.discordButton.href = CONFIG.DISCORD_INVITE_URL || "https://discord.com/";
  bindEvents();
  setLoadingState();
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
  els.systemStatus.textContent = labels[state.mode] || labels.demo;
  els.lastUpdated.textContent = `Actualizado ${formatRelativeTime(new Date().toISOString())}`;
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

function renderPodium() {
  const topThree = state.members.slice(0, 3);
  els.podium.innerHTML = topThree.map((member, index) => {
    const placement = index + 1;
    const className = placement === 1 ? "first" : placement === 2 ? "second" : "third";
    return `
      <button class="podium-card ${className}" type="button" data-user-id="${escapeHtml(member.discord_user_id)}">
        <span class="rank-badge">${placement}</span>
        ${avatarMarkup(member)}
        <strong>${escapeHtml(member.display_name)}</strong>
        <small>@${escapeHtml(member.username)}</small>
        <div class="podium-points">${formatNumber(member.assist_points)} Assist</div>
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
      <div class="dialog-stat"><small>Actividad reciente</small><strong>${recentCount}</strong></div>
    </div>
    <p class="dialog-note">Este perfil reconoce la ayuda registrada por Sprite Vault. Los requisitos internos de los roles no se muestran públicamente.</p>
  `;
  els.memberDialog.showModal();
}

function avatarMarkup(member) {
  if (member.avatar_url) {
    return `<span class="avatar"><img src="${escapeAttribute(member.avatar_url)}" alt="" loading="lazy" /></span>`;
  }
  return `<span class="avatar" aria-hidden="true">${initials(member.display_name)}</span>`;
}

function initials(name) {
  return String(name || "SV").split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function reasonCopy(reason, helper, giver) {
  const safeHelper = escapeHtml(helper);
  const safeGiver = escapeHtml(giver);
  const map = {
    gifted_sprite: { icon: "🎁", text: `<strong>${safeHelper}</strong> recibió un Assist de ${safeGiver} por regalar un Sprite.` },
    index_help: { icon: "📁", text: `<strong>${safeHelper}</strong> recibió un Assist de ${safeGiver} por ayudar a indexar.` },
    safe_exchange: { icon: "🤝", text: `<strong>${safeHelper}</strong> recibió un Assist de ${safeGiver} por un intercambio seguro.` },
    community_help: { icon: "⭐", text: `<strong>${safeHelper}</strong> recibió un Assist de ${safeGiver}.` }
  };
  return map[reason] || map.community_help;
}

function isWithinDays(dateString, days) {
  const difference = Date.now() - new Date(dateString).getTime();
  return difference >= 0 && difference <= days * 86400000;
}

function formatRelativeTime(dateString) {
  const date = new Date(dateString);
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  const formatter = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  if (seconds < 60) return "ahora";
  if (seconds < 3600) return formatter.format(-Math.floor(seconds / 60), "minute");
  if (seconds < 86400) return formatter.format(-Math.floor(seconds / 3600), "hour");
  if (seconds < 2592000) return formatter.format(-Math.floor(seconds / 86400), "day");
  return new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function formatNumber(value) {
  return new Intl.NumberFormat("es").format(value);
}

function animateNumber(element, target) {
  const start = performance.now();
  const duration = 650;
  const initial = 0;
  function frame(now) {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = formatNumber(Math.round(initial + (target - initial) * eased));
    if (progress < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function setLoadingState() {
  [els.totalAssists, els.activeHelpers, els.weeklyAssists].forEach((element) => element.textContent = "…");
  els.topHelper.textContent = "Cargando…";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function isoHoursAgo(hours) {
  return new Date(Date.now() - hours * 3600000).toISOString();
}
