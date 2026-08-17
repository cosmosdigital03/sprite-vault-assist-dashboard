window.SPRITE_VAULT_CONFIG = {
  SUPABASE_URL: "https://vaxwnrhspjjbsdxgzeqr.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_J2ehJ9XLxh98LrbB-za-Cg_G8F3eTas",

  DISCORD_INVITE_URL: "https://discord.gg/x8jVpZvMV",

  LEADERBOARD_LIMIT: 100,
  RECENT_ACTIVITY_LIMIT: 8,

  // Password is stored as a SHA-256 digest instead of plain text.
  ACCESS_PASSWORD_HASH: "f7be4511edbcd33b965625d37441d79f69e1af947ed511e53c8b7153e23cc55e",
  ACCESS_SESSION_HOURS: 8
};

(() => {
  const CONFIG = window.SPRITE_VAULT_CONFIG;
  const SESSION_KEY = "spriteVaultAccessSession";
  const REMEMBER_KEY = "spriteVaultAccessRemembered";
  const nativeFetch = window.fetch.bind(window);
  const queuedSupabaseRequests = [];
  let accessGranted = hasValidAccess();
  let enhancementsStarted = false;
  let unlockInProgress = false;

  document.documentElement.classList.toggle("sv-locked", !accessGranted);
  installAccessStyles();
  installFetchGate();
  installAccessGate();

  if (accessGranted) {
    document.documentElement.classList.add("sv-unlocked");
    installLockButton();
  }

  window.addEventListener("load", () => {
    if (accessGranted) scheduleEnhancements();
  });

  function installFetchGate() {
    window.fetch = (...args) => {
      const target = getFetchUrl(args[0]);
      const isDashboardData = Boolean(
        CONFIG.SUPABASE_URL && target.startsWith(CONFIG.SUPABASE_URL)
      );

      if (accessGranted || !isDashboardData) {
        return nativeFetch(...args);
      }

      return new Promise((resolve, reject) => {
        queuedSupabaseRequests.push({ args, resolve, reject });
      });
    };
  }

  function getFetchUrl(input) {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    return String(input?.url || "");
  }

  function hasValidAccess() {
    const now = Date.now();
    const sessionExpiry = Number(sessionStorage.getItem(SESSION_KEY) || 0);
    const rememberedExpiry = Number(localStorage.getItem(REMEMBER_KEY) || 0);

    if (sessionExpiry > now || rememberedExpiry > now) return true;

    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(REMEMBER_KEY);
    return false;
  }

  function installAccessGate() {
    if (document.querySelector("#vaultAccessGate")) return;

    const gate = document.createElement("div");
    gate.id = "vaultAccessGate";
    gate.className = "vault-access-gate";
    gate.setAttribute("role", "dialog");
    gate.setAttribute("aria-modal", "true");
    gate.setAttribute("aria-labelledby", "vaultAccessTitle");
    gate.innerHTML = `
      <div class="vault-access-shell">
        <div class="vault-access-brand" aria-hidden="true">✦</div>
        <span class="vault-access-kicker">SPRITE VAULT · ACCESO PRIVADO</span>
        <h1 id="vaultAccessTitle">Entrar al Dashboard</h1>
        <p>Ingresa la clave de acceso para abrir el centro de Assist de Sprite Vault.</p>

        <form id="vaultAccessForm" class="vault-access-form" novalidate>
          <label for="vaultAccessPassword">Contraseña</label>
          <div class="vault-password-wrap">
            <span aria-hidden="true">⌁</span>
            <input
              id="vaultAccessPassword"
              name="password"
              type="password"
              inputmode="text"
              autocomplete="current-password"
              placeholder="Escribe la contraseña"
              required
            />
            <button id="vaultPasswordToggle" type="button" aria-label="Mostrar contraseña">Mostrar</button>
          </div>

          <label class="vault-remember-row">
            <input id="vaultRememberAccess" type="checkbox" />
            <span>Recordarme en este dispositivo por ${Number(CONFIG.ACCESS_SESSION_HOURS || 8)} horas</span>
          </label>

          <button id="vaultAccessSubmit" class="vault-access-submit" type="submit">
            <span>Desbloquear Dashboard</span>
            <span aria-hidden="true">→</span>
          </button>
          <p id="vaultAccessMessage" class="vault-access-message" aria-live="polite"></p>
        </form>

        <div class="vault-access-security">
          <span class="vault-security-dot" aria-hidden="true"></span>
          <span>La sesión se bloquea automáticamente al expirar.</span>
        </div>
      </div>
    `;

    document.body.appendChild(gate);

    const form = gate.querySelector("#vaultAccessForm");
    const input = gate.querySelector("#vaultAccessPassword");
    const toggle = gate.querySelector("#vaultPasswordToggle");
    const submit = gate.querySelector("#vaultAccessSubmit");
    const message = gate.querySelector("#vaultAccessMessage");
    const remember = gate.querySelector("#vaultRememberAccess");

    toggle?.addEventListener("click", () => {
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      toggle.textContent = showing ? "Mostrar" : "Ocultar";
      toggle.setAttribute("aria-label", showing ? "Mostrar contraseña" : "Ocultar contraseña");
      input.focus();
    });

    input?.addEventListener("keydown", (event) => {
      gate.classList.toggle("caps-lock", Boolean(event.getModifierState?.("CapsLock")));
    });

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (unlockInProgress) return;

      const password = String(input.value || "");
      if (!password) {
        showAccessMessage(message, "Escribe la contraseña para continuar.", true);
        input.focus();
        return;
      }

      unlockInProgress = true;
      submit.disabled = true;
      submit.classList.add("is-loading");
      submit.querySelector("span:first-child").textContent = "Verificando…";
      showAccessMessage(message, "", false);

      try {
        const digest = await sha256(password);
        if (!safeEqual(digest, String(CONFIG.ACCESS_PASSWORD_HASH || ""))) {
          gate.classList.remove("shake");
          void gate.offsetWidth;
          gate.classList.add("shake");
          showAccessMessage(message, "Contraseña incorrecta. Inténtalo otra vez.", true);
          input.select();
          return;
        }

        grantAccess(Boolean(remember?.checked));
        input.value = "";
        showAccessMessage(message, "Acceso confirmado. Abriendo la Bóveda…", false);
        gate.classList.add("is-unlocking");

        window.setTimeout(() => {
          document.documentElement.classList.remove("sv-locked");
          document.documentElement.classList.add("sv-unlocked");
          gate.remove();
          installLockButton();
          releaseQueuedRequests();
          scheduleEnhancements();
        }, 180);
      } catch (error) {
        console.error("No se pudo verificar el acceso:", error);
        showAccessMessage(message, "No se pudo verificar la contraseña en este navegador.", true);
      } finally {
        unlockInProgress = false;
        if (submit.isConnected) {
          submit.disabled = false;
          submit.classList.remove("is-loading");
          submit.querySelector("span:first-child").textContent = "Desbloquear Dashboard";
        }
      }
    });

    if (accessGranted) {
      gate.remove();
      return;
    }

    window.setTimeout(() => input?.focus(), 60);
  }

  function grantAccess(remember) {
    const hours = Math.max(1, Number(CONFIG.ACCESS_SESSION_HOURS || 8));
    const expiry = Date.now() + hours * 60 * 60 * 1000;

    accessGranted = true;
    sessionStorage.setItem(SESSION_KEY, String(expiry));
    if (remember) localStorage.setItem(REMEMBER_KEY, String(expiry));
    else localStorage.removeItem(REMEMBER_KEY);
  }

  function releaseQueuedRequests() {
    const queued = queuedSupabaseRequests.splice(0);
    queued.forEach(({ args, resolve, reject }) => {
      nativeFetch(...args).then(resolve, reject);
    });
  }

  function installLockButton() {
    const actions = document.querySelector(".header-actions");
    if (!actions || actions.querySelector("#vaultLockButton")) return;

    const button = document.createElement("button");
    button.id = "vaultLockButton";
    button.className = "icon-button vault-lock-button";
    button.type = "button";
    button.title = "Bloquear dashboard";
    button.setAttribute("aria-label", "Bloquear dashboard");
    button.textContent = "🔒";
    button.addEventListener("click", () => {
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(REMEMBER_KEY);
      location.reload();
    });

    actions.insertBefore(button, actions.firstChild);
  }

  function scheduleEnhancements() {
    if (enhancementsStarted || !accessGranted) return;
    enhancementsStarted = true;

    const start = () => loadEnhancements().catch((error) => {
      console.error("No se pudieron cargar las mejoras del dashboard:", error);
    });

    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(start, { timeout: 1400 });
    } else {
      window.setTimeout(start, 450);
    }
  }

  async function loadEnhancements() {
    const version = "20260814-access-performance";
    const scripts = [
      ["performance-core.js", "performance-core"],
      ["helped-profiles.js?v=20260802-history-details", "helped-profiles"],
      ["founder-dashboard.js?v=20260726-founder", "founder-dashboard"],
      ["staff-activity-filters.js?v=20260810-synced-trade-filters", "staff-activity-filters"],
      ["trade-sync-dashboard.js?v=20260810-synced-trades-v2", "trade-sync-dashboard"]
    ];

    scripts.forEach(([src, key]) => preloadScript(addVersion(src, version), key));

    for (const [src, key] of scripts) {
      await loadExtension(addVersion(src, version), key);
      await idleYield();
    }
  }

  function addVersion(src, version) {
    return `${src}${src.includes("?") ? "&" : "?"}core=${encodeURIComponent(version)}`;
  }

  function preloadScript(src, key) {
    if (document.querySelector(`link[data-extension-preload="${key}"]`)) return;
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "script";
    link.href = src;
    link.dataset.extensionPreload = key;
    document.head.appendChild(link);
  }

  function loadExtension(src, key) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-extension="${key}"]`);
      if (existing) {
        if (existing.dataset.loaded === "true") resolve();
        else existing.addEventListener("load", resolve, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = src;
      script.dataset.extension = key;
      script.addEventListener("load", () => {
        script.dataset.loaded = "true";
        resolve();
      }, { once: true });
      script.addEventListener("error", reject, { once: true });
      document.body.appendChild(script);
    });
  }

  function idleYield() {
    return new Promise((resolve) => {
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(() => resolve(), { timeout: 700 });
      } else {
        window.setTimeout(resolve, 35);
      }
    });
  }

  async function sha256(value) {
    const bytes = new TextEncoder().encode(value);
    const buffer = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function safeEqual(left, right) {
    if (left.length !== right.length) return false;
    let result = 0;
    for (let index = 0; index < left.length; index += 1) {
      result |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }
    return result === 0;
  }

  function showAccessMessage(element, text, isError) {
    if (!element) return;
    element.textContent = text;
    element.classList.toggle("is-error", Boolean(isError));
  }

  function installAccessStyles() {
    if (document.querySelector("#spriteVaultAccessStyles")) return;

    const style = document.createElement("style");
    style.id = "spriteVaultAccessStyles";
    style.textContent = `
      html.sv-locked { overflow: hidden; background: #07040d; }
      html.sv-locked body { overflow: hidden; }
      html.sv-locked body > :not(#vaultAccessGate) { visibility: hidden !important; }
      html.sv-locked #vaultAccessGate { visibility: visible !important; }

      .vault-access-gate {
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: grid;
        place-items: center;
        min-height: 100dvh;
        padding: 24px;
        overflow: auto;
        background:
          radial-gradient(circle at 20% 15%, rgba(124,58,237,.28), transparent 34%),
          radial-gradient(circle at 82% 76%, rgba(217,70,239,.18), transparent 36%),
          linear-gradient(145deg, #08040f 0%, #0d0718 52%, #07040d 100%);
        color: #f8f5ff;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .vault-access-gate::before {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        opacity: .2;
        background-image:
          linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px);
        background-size: 44px 44px;
        mask-image: linear-gradient(to bottom, #000, transparent 85%);
      }
      .vault-access-shell {
        position: relative;
        width: min(440px, 100%);
        padding: 34px;
        border: 1px solid rgba(196,181,253,.18);
        border-radius: 28px;
        background: linear-gradient(180deg, rgba(24,13,42,.94), rgba(12,7,22,.96));
        box-shadow: 0 34px 90px rgba(0,0,0,.48), inset 0 1px rgba(255,255,255,.055);
        backdrop-filter: blur(18px);
      }
      .vault-access-brand {
        display: grid;
        place-items: center;
        width: 54px;
        height: 54px;
        margin-bottom: 22px;
        border: 1px solid rgba(196,181,253,.24);
        border-radius: 17px;
        background: linear-gradient(135deg, rgba(124,58,237,.32), rgba(217,70,239,.16));
        color: #e9ddff;
        font-size: 24px;
        box-shadow: 0 16px 38px rgba(124,58,237,.16);
      }
      .vault-access-kicker {
        display: block;
        margin-bottom: 9px;
        color: #bca7dd;
        font-size: 11px;
        font-weight: 900;
        letter-spacing: .13em;
      }
      .vault-access-shell h1 {
        margin: 0;
        font-size: clamp(30px, 7vw, 42px);
        line-height: 1.02;
        letter-spacing: -.04em;
      }
      .vault-access-shell > p {
        margin: 13px 0 25px;
        color: #a99bbd;
        font-size: 14px;
        line-height: 1.65;
      }
      .vault-access-form > label:first-child {
        display: block;
        margin-bottom: 8px;
        color: #ddd3ec;
        font-size: 12px;
        font-weight: 800;
      }
      .vault-password-wrap {
        display: grid;
        grid-template-columns: 24px 1fr auto;
        align-items: center;
        gap: 8px;
        min-height: 52px;
        padding: 0 12px 0 14px;
        border: 1px solid rgba(196,181,253,.18);
        border-radius: 15px;
        background: rgba(255,255,255,.045);
        transition: border-color .18s ease, box-shadow .18s ease, background .18s ease;
      }
      .vault-password-wrap:focus-within {
        border-color: rgba(167,139,250,.72);
        background: rgba(255,255,255,.065);
        box-shadow: 0 0 0 4px rgba(124,58,237,.12);
      }
      .vault-password-wrap > span { color: #9f89c3; font-size: 18px; }
      .vault-password-wrap input {
        min-width: 0;
        height: 50px;
        border: 0;
        outline: 0;
        background: transparent;
        color: #fff;
        font: inherit;
        font-size: 15px;
      }
      .vault-password-wrap input::placeholder { color: #756984; }
      .vault-password-wrap button {
        border: 0;
        padding: 8px;
        background: transparent;
        color: #bca7dd;
        font-size: 11px;
        font-weight: 800;
        cursor: pointer;
      }
      .vault-remember-row {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        margin: 14px 1px 18px;
        color: #9f93b0;
        font-size: 11px;
        line-height: 1.45;
        cursor: pointer;
      }
      .vault-remember-row input { margin-top: 1px; accent-color: #8b5cf6; }
      .vault-access-submit {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        min-height: 52px;
        padding: 0 18px;
        border: 1px solid rgba(196,181,253,.18);
        border-radius: 15px;
        background: linear-gradient(135deg, #7c3aed, #9333ea 58%, #a21caf);
        color: #fff;
        font: inherit;
        font-size: 13px;
        font-weight: 900;
        cursor: pointer;
        box-shadow: 0 16px 32px rgba(124,58,237,.2);
        transition: transform .18s ease, filter .18s ease, box-shadow .18s ease;
      }
      .vault-access-submit:hover { transform: translateY(-1px); filter: brightness(1.06); box-shadow: 0 20px 38px rgba(124,58,237,.27); }
      .vault-access-submit:disabled { cursor: wait; opacity: .72; transform: none; }
      .vault-access-message {
        min-height: 18px;
        margin: 11px 2px 0;
        color: #a99bbd;
        font-size: 11px;
        font-weight: 700;
      }
      .vault-access-message.is-error { color: #fda4af; }
      .vault-access-security {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 22px;
        padding-top: 18px;
        border-top: 1px solid rgba(255,255,255,.065);
        color: #776b88;
        font-size: 10px;
      }
      .vault-security-dot {
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: #7c3aed;
        box-shadow: 0 0 16px rgba(139,92,246,.9);
      }
      .vault-access-gate.shake .vault-access-shell { animation: vaultGateShake .34s ease; }
      .vault-access-gate.is-unlocking { animation: vaultGateOut .2s ease forwards; }
      .vault-lock-button { font-size: 13px !important; }

      @keyframes vaultGateShake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-7px); }
        55% { transform: translateX(6px); }
        80% { transform: translateX(-3px); }
      }
      @keyframes vaultGateOut {
        to { opacity: 0; transform: scale(1.01); }
      }

      @supports (content-visibility: auto) {
        .section-intro,
        .stats-grid,
        .champion-banner,
        .insight-grid,
        .dashboard-grid,
        .site-footer {
          content-visibility: auto;
          contain-intrinsic-size: 1px 620px;
        }
      }

      @media (max-width: 720px) {
        .vault-access-gate { padding: 16px; }
        .vault-access-shell { padding: 27px 22px; border-radius: 23px; }
        .background-noise { display: none !important; }
        .background-orb { filter: blur(72px) !important; opacity: .5 !important; }
      }
      @media (prefers-reduced-motion: reduce) {
        .vault-access-gate *, .vault-access-gate *::before, .vault-access-gate *::after {
          scroll-behavior: auto !important;
          animation-duration: .001ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: .001ms !important;
        }
      }
    `;
    document.head.appendChild(style);
  }
})();
