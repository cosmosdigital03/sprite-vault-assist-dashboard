import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedReasons = new Set(["gifted_sprite", "index_help", "safe_exchange", "community_help"]);

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const expectedSecret = Deno.env.get("BOTGHOST_SECRET");
  const providedSecret = request.headers.get("x-botghost-secret");
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const helperId = text(payload.helper_id);
  const helperName = text(payload.helper_name) || "Miembro";
  const helperUsername = text(payload.helper_username) || helperName;
  const helperAvatar = text(payload.helper_avatar);
  const giverId = text(payload.giver_id);
  const giverName = text(payload.giver_name) || "Otro miembro";
  const eventId = text(payload.event_id) || crypto.randomUUID();
  const requestedReason = text(payload.reason);
  const reason = allowedReasons.has(requestedReason) ? requestedReason : "community_help";
  const newPoints = Number(payload.new_points);

  if (!helperId || !Number.isInteger(newPoints) || newPoints < 0) {
    return json({ error: "helper_id and a non-negative integer new_points are required" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Server configuration is incomplete" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const now = new Date().toISOString();
  const roleName = roleForPoints(newPoints);

  const { error: memberError } = await supabase
    .from("assist_members")
    .upsert({
      discord_user_id: helperId,
      display_name: helperName,
      username: helperUsername,
      avatar_url: helperAvatar,
      assist_points: newPoints,
      role_name: roleName,
      last_assist_at: now,
      updated_at: now
    }, { onConflict: "discord_user_id" });

  if (memberError) {
    console.error(memberError);
    return json({ error: "Could not update member" }, 500);
  }

  const { error: eventError } = await supabase
    .from("assist_events")
    .upsert({
      external_event_id: eventId,
      helper_id: helperId,
      helper_name: helperName,
      giver_id: giverId || null,
      giver_name: giverName,
      reason,
      created_at: now
    }, { onConflict: "external_event_id", ignoreDuplicates: true });

  if (eventError) {
    console.error(eventError);
    return json({ error: "Member updated, but event could not be recorded" }, 500);
  }

  return json({ ok: true, helper_id: helperId, assist_points: newPoints, role_name: roleName }, 200);
});

function roleForPoints(points: number): string {
  if (points >= 25) return "Crystal Guardian";
  if (points >= 10) return "Sprite Keeper";
  if (points >= 3) return "Vault Contributor";
  return "Miembro de la Bóveda";
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
