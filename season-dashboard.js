(() => {
  let started = false, observer;
  const ready = () => document.querySelector('script[data-extension="trade-sync-dashboard"][data-loaded="true"]');
  const begin = () => { if (started || !ready()) return; started = true; observer?.disconnect(); init(); };
  if (ready()) begin();
  else { observer = new MutationObserver(begin); observer.observe(document.documentElement, { childList:true, subtree:true, attributes:true, attributeFilter:["data-loaded"] }); }

  function init() {
    const START = "2026-08-20T00:00:00-04:00";
    const LABEL = "Override";
    const KEY = "spriteVaultAssistScope";
    const HELP = new Set(["gifted_sprite", "index_help", "community_help"]);
    const WEIGHT = { gifted_sprite:3, index_help:1, community_help:1, safe_exchange:0 };
    let scope = sessionStorage.getItem(KEY) === "history" ? "history" : "season";
    let events = [], loading = null, search = "";
    const base = { loadData, applySearch, renderStats, renderChampion, renderBreakdown, renderPodium, renderLeaderboard, renderActivity, openMemberProfile };

    styles();
    switcher();

    renderStats = () => scope === "history" ? base.renderStats() : seasonStats();
    renderChampion = () => scope === "history" ? base.renderChampion() : seasonChampion();
    renderBreakdown = () => scope === "history" ? base.renderBreakdown() : seasonBreakdown();
    renderPodium = () => scope === "history" ? base.renderPodium() : seasonPodium();
    renderLeaderboard = () => scope === "history" ? base.renderLeaderboard() : seasonLeaderboard();
    renderActivity = () => scope === "history" ? base.renderActivity() : seasonActivity();
    openMemberProfile = (id) => {
      base.openMemberProfile(id);
      if (scope === "season") decorateProfile(id);
    };
    applySearch = (q) => {
      if (scope === "history") return base.applySearch(q);
      search = String(q || "").trim().toLocaleLowerCase("es");
      seasonLeaderboard();
    };
    loadData = async () => { await base.loadData(); await loadSeason(true); renderScope(); };

    loadSeason().catch((e) => console.warn("No se pudo cargar Override:", e)).finally(renderScope);

    async function loadSeason(force=false) {
      if (loading) return loading;
      if (!force && events.length) return;
      loading = (async () => {
        if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) { events = (state.events || []).map(norm).filter(inSeason); return; }
        const rows = [], start = encodeURIComponent(START);
        for (let offset=0; offset<10000; offset+=1000) {
          let page;
          try { page = await supabaseGet(`/rest/v1/assist_events?select=id,helper_id,helper_name,giver_id,giver_name,reason,quantity,created_at&created_at=gte.${start}&order=created_at.desc&limit=1000&offset=${offset}`); }
          catch { page = await supabaseGet(`/rest/v1/assist_events?select=id,helper_id,helper_name,giver_id,giver_name,reason,created_at&created_at=gte.${start}&order=created_at.desc&limit=1000&offset=${offset}`); }
          rows.push(...page); if (page.length < 1000) break;
        }
        events = rows.map(norm).filter(inSeason).sort((a,b) => new Date(b.created_at)-new Date(a.created_at));
      })();
      try { await loading; } finally { loading = null; }
    }

    function norm(r) {
      const q = Number(r.quantity ?? 1);
      return { id:r.id, helper_id:String(r.helper_id||""), helper_name:r.helper_name||"Miembro", giver_id:String(r.giver_id||""), giver_name:r.giver_name||"Otro miembro", reason:r.reason||"community_help", quantity:Number.isInteger(q)&&q>0?q:1, created_at:r.created_at||new Date().toISOString() };
    }
    function inSeason(e) { return new Date(e.created_at) >= new Date(START); }
    function blank() { return { points:0, actions:0, gifts:0, indexes:0, people:new Set(), last:null }; }
    function point(e) { return (WEIGHT[e.reason]||0)*e.quantity; }
    function helpEvents() { return events.filter((e) => HELP.has(e.reason)); }

    function mapStats() {
      const map = new Map();
      helpEvents().forEach((e) => {
        if (!e.helper_id) return;
        const s = map.get(e.helper_id) || blank();
        s.points += point(e); s.actions += e.quantity;
        if (e.reason === "gifted_sprite") s.gifts += e.quantity;
        if (e.reason === "index_help") s.indexes += e.quantity;
        const name = String(e.giver_name||"Otro miembro").trim().toLocaleLowerCase("es");
        s.people.add(e.giver_id || `name:${name}`);
        if (!s.last || new Date(e.created_at) > new Date(s.last)) s.last = e.created_at;
        map.set(e.helper_id, s);
      });
      return map;
    }

    function ranking() {
      const map = mapStats();
      return (state.members||[]).map((member) => ({member, stats:map.get(member.discord_user_id)||blank()}))
        .filter((x) => x.stats.actions>0)
        .sort((a,b) => b.stats.points-a.stats.points || b.stats.people.size-a.stats.people.size || b.stats.actions-a.stats.actions || new Date(b.stats.last||0)-new Date(a.stats.last||0));
    }

    function seasonStats() {
      const map = mapStats(), rank = ranking();
      animateNumber(els.totalAssists, [...map.values()].reduce((n,s)=>n+s.points,0));
      animateNumber(els.activeHelpers, [...map.values()].filter((s)=>s.actions).length);
      animateNumber(els.weeklyAssists, helpEvents().filter((e)=>isWithinDays(e.created_at,7)).reduce((n,e)=>n+e.quantity,0));
      els.topHelper.textContent = rank[0]?.member.display_name || "—";
      els.topHelperPoints.textContent = rank[0] ? `${formatNumber(rank[0].stats.points)} Assist de temporada` : "Todos comienzan de cero";
    }

    function seasonChampion() {
      const ids = new Set((state.members||[]).map((m)=>m.discord_user_id)), scores = new Map();
      helpEvents().filter((e)=>ids.has(e.helper_id)&&isWithinDays(e.created_at,7)).forEach((e)=>{
        const s=scores.get(e.helper_id)||{points:0,actions:0,last:e.created_at}; s.points+=point(e); s.actions+=e.quantity;
        if(new Date(e.created_at)>new Date(s.last))s.last=e.created_at; scores.set(e.helper_id,s);
      });
      const best=[...scores.entries()].sort((a,b)=>b[1].points-a[1].points||b[1].actions-a[1].actions||new Date(b[1].last)-new Date(a[1].last))[0];
      const m=best&&(state.members||[]).find((x)=>x.discord_user_id===best[0]);
      if(!m){els.championName.textContent="Nueva temporada";els.championHandle.textContent="@spritevault";els.championSummary.textContent="El próximo Assist puede crear al primer líder de Override.";els.championRole.textContent="Temporada activa";els.championWeekStat.textContent="0 esta semana";els.championAvatar.textContent="SV";return;}
      els.championName.textContent=m.display_name;els.championHandle.textContent=`@${m.username}`;els.championSummary.textContent=`${m.display_name} lidera la semana con ${formatNumber(best[1].points)} Assist de temporada.`;els.championRole.textContent=m.role_name;els.championWeekStat.textContent=`${formatNumber(best[1].points)} puntos · ${formatNumber(best[1].actions)} ayudas`;els.championAvatar.innerHTML=m.avatar_url?`<img src="${escapeAttribute(m.avatar_url)}" alt="" loading="lazy" />`:getInitials(m.display_name);
    }

    function seasonBreakdown() {
      const c={gifted_sprite:0,index_help:0,safe_exchange:0}; events.forEach((e)=>{if(e.reason in c)c[e.reason]+=e.quantity;});
      const max=Math.max(c.gifted_sprite,c.index_help,c.safe_exchange,1);
      updateBreakdownItem(els.breakdownGiftedBar,els.breakdownGiftedValue,c.gifted_sprite,max);updateBreakdownItem(els.breakdownIndexBar,els.breakdownIndexValue,c.index_help,max);updateBreakdownItem(els.breakdownTradeBar,els.breakdownTradeValue,c.safe_exchange,max);
    }

    function seasonPodium() {
      const top=ranking().slice(0,3), cls=["first","second","third"];
      if(!top.length){els.podium.innerHTML=`<div class="season-empty"><strong>Nueva temporada, nueva carrera.</strong><small>El próximo Assist abrirá el Top 3.</small></div>`;return;}
      els.podium.innerHTML=top.map(({member,stats},i)=>`<button class="podium-card ${cls[i]}" type="button" data-user-id="${escapeHtml(member.discord_user_id)}"><span class="podium-glow"></span><span class="rank-badge">${i+1}</span><span class="podium-flair">${i?"✦":"♛"}</span>${avatarMarkup(member)}<strong>${escapeHtml(member.display_name)}</strong><small>@${escapeHtml(member.username)}</small><span class="podium-role">${escapeHtml(member.role_name)}</span><div class="podium-points">${formatNumber(stats.points)} Assist</div><span class="podium-impact">👥 ${formatNumber(stats.people.size)} ${stats.people.size===1?"persona ayudada":"personas ayudadas"}</span><span class="podium-label">${i?`Top ${i+1}`:"Líder"} · Override</span></button>`).join("");
      bind(els.podium);
    }

    function seasonLeaderboard() {
      const all=ranking(), visible=all.filter(({member})=>!search||`${member.display_name} ${member.username}`.toLocaleLowerCase("es").includes(search));
      const h=document.querySelector(".table-header");if(h)h.innerHTML=`<span>Posición</span><span>Miembro</span><span>Personas ayudadas</span><span>Rol general</span><span>Temporada</span>`;
      els.leaderboardList.innerHTML=visible.map(({member,stats})=>`<button class="leaderboard-row" type="button" data-user-id="${escapeHtml(member.discord_user_id)}"><span class="position">#${all.findIndex((x)=>x.member.discord_user_id===member.discord_user_id)+1}</span><span class="member-cell">${avatarMarkup(member)}<span class="member-meta"><strong>${escapeHtml(member.display_name)}</strong><small>@${escapeHtml(member.username)}</small><small class="season-last">${stats.last?`Última ayuda ${formatRelativeTime(stats.last)}`:"Sin actividad"}</small></span></span><span class="people-helped-cell"><strong>${formatNumber(stats.people.size)}</strong><small>${stats.people.size===1?"persona":"personas"}</small></span><span class="role-pill" title="El rol general no se reinicia">${escapeHtml(member.role_name)}</span><span class="points-cell season-points"><strong>${formatNumber(stats.points)}</strong><small>Assist</small></span></button>`).join("");
      els.emptyState.hidden=visible.length>0;if(!visible.length){els.emptyState.querySelector("strong").textContent=search?"Ese miembro aún no aparece esta temporada.":"Aún no hay Assist esta temporada.";els.emptyState.querySelector("p").textContent=search?"Cambia a Histórico para ver su total general.":"La clasificación comenzará con la próxima ayuda registrada.";}bind(els.leaderboardList);
    }

    function seasonActivity(){const old=state.events;try{state.events=events.slice(0,Number(CONFIG.RECENT_ACTIVITY_LIMIT||8));base.renderActivity();}finally{state.events=old;}}
    function bind(root){root?.querySelectorAll("[data-user-id]").forEach((b)=>b.addEventListener("click",()=>openMemberProfile(b.dataset.userId)));}

    function decorateProfile(id) {
      const member=(state.members||[]).find((m)=>m.discord_user_id===String(id));if(!member)return;
      const rank=ranking(), pos=rank.findIndex((x)=>x.member.discord_user_id===member.discord_user_id)+1, s=mapStats().get(member.discord_user_id)||blank();
      els.dialogProfile.querySelector(".season-profile-banner")?.remove();
      const banner=document.createElement("div");banner.className="season-profile-banner";banner.innerHTML=`<span>✦ OVERRIDE · TEMPORADA ACTUAL</span><strong>${pos>0?`#${pos} · `:""}${formatNumber(s.points)} Assist · ${formatNumber(s.people.size)} ${s.people.size===1?"persona ayudada":"personas ayudadas"}</strong><small>${formatNumber(s.actions)} ayudas registradas esta temporada · Total histórico: ${formatNumber(member.assist_points)}</small>`;
      els.dialogProfile.querySelector(".dialog-profile-head")?.after(banner);
    }

    function setScope(next) {
      if(next!=="season"&&next!=="history")return;scope=next;sessionStorage.setItem(KEY,scope);search=String(els.searchInput?.value||"").trim().toLocaleLowerCase("es");
      if(scope==="history"){const d=document.querySelector("#activityDaysFilter"),t=document.querySelector("#activityTypeFilter");if(d){d.value="0";d.dispatchEvent(new Event("change",{bubbles:true}));}if(t){t.value="all";t.dispatchEvent(new Event("change",{bubbles:true}));}}
      renderScope();
    }

    function renderScope() {
      document.documentElement.dataset.assistScope=scope;document.querySelectorAll("#seasonScopeBar [data-scope]").forEach((b)=>{const a=b.dataset.scope===scope;b.classList.toggle("is-active",a);b.setAttribute("aria-pressed",String(a));});
      const staff=document.querySelector("#staffActivityFilters");if(staff)staff.hidden=scope==="season";copy();renderAll();const founder=document.querySelector("#founderSection");if(founder&&scope==="season")founder.hidden=true;
    }

    function switcher() {
      if(document.querySelector("#seasonScopeBar"))return;const intro=document.querySelector(".section-intro");if(!intro)return;const bar=document.createElement("section");bar.id="seasonScopeBar";bar.className="season-scope-bar panel";bar.innerHTML=`<div><small>NUEVA TEMPORADA</small><strong>${LABEL}</strong><span>El ranking empieza de cero sin borrar el historial.</span></div><div class="season-scope-actions"><button type="button" data-scope="season">Temporada</button><button type="button" data-scope="history">Histórico</button></div>`;intro.parentNode.insertBefore(bar,intro);bar.querySelectorAll("[data-scope]").forEach((b)=>b.addEventListener("click",()=>setScope(b.dataset.scope)));
    }

    function copy() {
      const s=scope==="season",intro=document.querySelector(".section-intro"),lead=document.querySelector(".leaderboard-panel .panel-header > div:first-child"),activity=document.querySelector(".activity-panel .panel-header > div:first-child"),cards=document.querySelectorAll(".stats-grid .stat-card");
      if(intro){intro.querySelector("h2").textContent=s?"Estado de Override":"Estado de la comunidad";intro.querySelector(":scope > p").textContent=s?"La vista principal muestra solo la ayuda de la nueva temporada.":"Métricas rápidas para entender la actividad actual de Sprite Vault.";}
      if(lead)lead.innerHTML=s?`<span class="eyebrow"><span></span> CLASIFICACIÓN DE TEMPORADA</span><h2>Top de Override</h2><p>Todos comienzan de cero aquí. Cambia a Histórico cuando quieras ver el total general.</p>`:`<span class="eyebrow"><span></span> CLASIFICACIÓN GENERAL</span><h2>Top de la Bóveda</h2><p>Selecciona un miembro para ver su perfil detallado.</p>`;
      if(activity){activity.querySelector("h2").textContent=s?"Últimos Assists de temporada":"Últimos Assists";activity.querySelector("p").textContent=s?"Solo actividad nueva de Override.":"Movimientos recientes dentro de la comunidad.";}
      if(cards[0]){cards[0].querySelector(".trend").textContent=s?"TEMPORADA":"TOTAL";cards[0].querySelector("small").textContent=s?"Assists de temporada":"Assists acumulados";cards[0].querySelector(":scope > span:last-child").textContent=s?"Desde 20 ago 2026":"Ayuda reconocida históricamente";}if(cards[1])cards[1].querySelector("small").textContent=s?"Contribuyentes activos":"Contribuyentes";if(cards[3])cards[3].querySelector("small").textContent=s?"Líder de temporada":"Ayudante destacado";
    }

    function styles(){if(document.querySelector("#seasonDashboardStyles"))return;const st=document.createElement("style");st.id="seasonDashboardStyles";st.textContent=`.season-scope-bar{display:flex;align-items:center;justify-content:space-between;gap:20px;margin:0 0 28px;padding:17px 20px;border-color:rgba(167,139,250,.24);background:linear-gradient(135deg,rgba(124,58,237,.14),rgba(18,10,30,.92),rgba(217,70,239,.08))}.season-scope-bar>div:first-child{display:grid;gap:2px}.season-scope-bar small{color:#9d87bf;font-size:9px;font-weight:900;letter-spacing:.13em}.season-scope-bar strong{font-size:16px}.season-scope-bar span{color:#9e92af;font-size:11px}.season-scope-actions{display:flex;padding:4px;border:1px solid rgba(196,181,253,.16);border-radius:14px;background:rgba(7,4,13,.55)}.season-scope-actions button{min-height:36px;padding:0 15px;border:0;border-radius:10px;background:transparent;color:#9185a3;font:inherit;font-size:11px;font-weight:850;cursor:pointer}.season-scope-actions button.is-active{background:linear-gradient(135deg,#7c3aed,#9333ea);color:#fff}.season-empty{grid-column:1/-1;display:grid;place-items:center;gap:6px;min-height:150px;border:1px dashed rgba(167,139,250,.2);border-radius:20px;color:#9f8dbb}.season-empty strong{color:#eee7f9}.season-last{color:#8c7ba4!important}.season-points{display:grid!important;justify-items:end}.season-points small{font-size:9px;color:#8f7fa5}.season-profile-banner{display:grid;gap:3px;margin:14px 0;padding:13px 15px;border:1px solid rgba(167,139,250,.2);border-radius:14px;background:rgba(124,58,237,.12)}.season-profile-banner span{color:#bda7df;font-size:9px;font-weight:900}.season-profile-banner small{color:#887b99;font-size:10px}[data-assist-scope="season"] #staffActivityFilters{display:none!important}@media(max-width:760px){.season-scope-bar{align-items:stretch;flex-direction:column}.season-scope-actions{display:grid;grid-template-columns:1fr 1fr}.season-scope-actions button{width:100%}}`;document.head.appendChild(st);}
  }
})();
