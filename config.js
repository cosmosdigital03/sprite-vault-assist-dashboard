window.SPRITE_VAULT_CONFIG = {
  SUPABASE_URL: "https://vaxwnrhspjjbsdxgzeqr.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_J2ehJ9XLxh98LrbB-za-Cg_G8F3eTas",

  DISCORD_INVITE_URL: "https://discord.gg/x8jVpZvMV",

  LEADERBOARD_LIMIT: 100,
  RECENT_ACTIVITY_LIMIT: 8
};

window.addEventListener("load", async () => {
  const loadExtension = (src, key) =>
    new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-extension="${key}"]`);
      if (existing) {
        resolve();
        return;
      }

      const script = document.createElement("script");
      script.src = src;
      script.dataset.extension = key;
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
    });

  try {
    await loadExtension(
      "helped-profiles.js?v=20260802-history-details",
      "helped-profiles"
    );
    await loadExtension(
      "founder-dashboard.js?v=20260726-founder",
      "founder-dashboard"
    );
  } catch (error) {
    console.error("No se pudieron cargar las mejoras del dashboard:", error);
  }
});