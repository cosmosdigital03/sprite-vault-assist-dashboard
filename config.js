window.SPRITE_VAULT_CONFIG = {
  SUPABASE_URL: "https://vaxwnrhspjjbsdxgzeqr.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_J2ehJ9XLxh98LrbB-za-Cg_G8F3eTas",

  DISCORD_INVITE_URL: "https://discord.gg/x8jVpZvMV",

  LEADERBOARD_LIMIT: 100,
  RECENT_ACTIVITY_LIMIT: 8
};

window.addEventListener("load", () => {
  if (document.querySelector("script[data-helped-profiles]")) return;

  const script = document.createElement("script");
  script.src = "helped-profiles.js?v=20260726";
  script.dataset.helpedProfiles = "true";
  document.body.appendChild(script);
});
