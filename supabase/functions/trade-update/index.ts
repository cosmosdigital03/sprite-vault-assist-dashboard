import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const expectedSecret = Deno.env.get("BOTGHOST_SECRET") ?? "";
  const bodySecret = text(payload.botghost_secret);
  const headerSecret = text(request.headers.get("x-botghost-secret"));

  if (!expectedSecret || (bodySecret !== expectedSecret && headerSecret !== expectedSecret)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const traderId = text(payload.trader_id ?? payload.helper_id);
  const traderName = text(payload.trader_name ?? payload.helper_name) || "Miembro";
  const traderUsername = text(payload.trader_username ?? payload.helper_username) || traderName;
  const traderAvatar = text(payload.trader_avatar ?? payload.helper_avatar);
  const partnerId = text(payload.partner_id ?? payload.giver_id);
  const partnerName = text(payload.partner_name ?? payload.giver_name) || "Otro miembro";
  const eventId = text(payload.event_id) || crypto.randomUUID();

  const quantityText = text(payload.quantity);
  const quantity = quantityText === "" ? 1 : Number(quantityText);

  if (!traderId) {
    return json({ error: "trader_id is required" }, 400);
  }

  if (partnerId && partnerId === traderId) {
    return json({ error: "A member cannot trade with themselves" }, 400);
  }

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    return json({
      error: "Invalid quantity",
      quantity,
      minimum_quantity: 1,
      maximum_quantity: 10
    }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";

  let secretKeys: Record<string, string> = {};
  try {
    secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
  } catch {
    secretKeys = {};
  }

  const adminKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    secretKeys.default ||
    Object.values(secretKeys)[0] ||
    "";

  if (!supabaseUrl || !adminKey) {
    return json({ error: "Supabase server configuration is incomplete" }, 500);
  }

  const supabase = createClient(supabaseUrl, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const now = new Date().toISOString();

  const { data: existingMember, error: lookupError } = await supabase
    .from("assist_members")
    .select("discord_user_id")
    .eq("discord_user_id", traderId)
    .maybeSingle();

  if (lookupError) {
    console.error("Trade member lookup error:", lookupError);
    return json({ error: "Could not verify trader", details: lookupError.message }, 500);
  }

  if (!existingMember) {
    const { error: insertMemberError } = await supabase
      .from("assist_members")
      .insert({
        discord_user_id: traderId,
        display_name: traderName,
        username: traderUsername,
        avatar_url: traderAvatar,
        assist_points: 0,
        role_name: "Miembro de la Bóveda",
        updated_at: now
      });

    if (insertMemberError) {
      console.error("Trade member insert error:", insertMemberError);
      return json({ error: "Could not create trader profile", details: insertMemberError.message }, 500);
    }
  } else {
    const { error: updateMemberError } = await supabase
      .from("assist_members")
      .update({
        display_name: traderName,
        username: traderUsername,
        avatar_url: traderAvatar,
        updated_at: now
      })
      .eq("discord_user_id", traderId);

    if (updateMemberError) {
      console.error("Trade member update error:", updateMemberError);
      return json({ error: "Could not refresh trader profile", details: updateMemberError.message }, 500);
    }
  }

  const { error: eventError } = await supabase
    .from("assist_events")
    .upsert({
      external_event_id: eventId,
      helper_id: traderId,
      helper_name: traderName,
      giver_id: partnerId || null,
      giver_name: partnerName,
      reason: "safe_exchange",
      quantity,
      created_at: now
    }, { onConflict: "external_event_id", ignoreDuplicates: true });

  if (eventError) {
    console.error("Trade event error:", eventError);
    return json({ error: "Could not record trade", details: eventError.message }, 500);
  }

  const { count, error: countError } = await supabase
    .from("assist_events")
    .select("id", { count: "exact", head: true })
    .eq("helper_id", traderId)
    .eq("reason", "safe_exchange");

  if (countError) console.error("Trade count error:", countError);

  return json({
    ok: true,
    trader_id: traderId,
    trade_count: count ?? null,
    points_changed: false,
    reason: "safe_exchange",
    quantity
  }, 200);
});

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
