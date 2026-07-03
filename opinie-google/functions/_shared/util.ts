// Wspólne narzędzia Edge Functions produktu Opinie Google (Deno / Supabase).
// Sekrety WYŁĄCZNIE przez env (Supabase secrets) — nigdy w kodzie/repo.
//
// TRYB NA SUCHO (dry): gdy OG_DRY_MODE=1 ALBO brakuje tokenu danego kanału,
// wysyłka NIE idzie w świat, tylko ląduje w tabeli og_outbox (status 'dry').
// Dzięki temu całą maszynę testujemy bez żadnych kont zewnętrznych; realny
// start = ustawienie sekretów + OG_DRY_MODE=0. Zero zmian w kodzie.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { fillTemplate, computeScheduledAt, normalizePhonePL, fallbackReplyDraft } from "./pure.mjs";
export * from "./pure.mjs";

export function serviceClient(): SupabaseClient {
  // service_role — omija RLS. TYLKO tutaj, po stronie serwera.
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Autoryzacja wywołań operatorskich/cronowych: nagłówek x-og-service-key.
export function requireServiceKey(req: Request): Response | null {
  const key = req.headers.get("x-og-service-key");
  if (!key || key !== Deno.env.get("OG_SERVICE_KEY")) {
    return json({ error: "unauthorized" }, 401);
  }
  return null;
}

const dryMode = () => Deno.env.get("OG_DRY_MODE") === "1";

async function toOutbox(db: SupabaseClient, channel: string, recipient: string, payload: unknown, status = "dry", error: string | null = null) {
  await db.from("og_outbox").insert({ channel, recipient, payload, status, error });
}

// ------------------------------------------------------------
// SMS (SMSAPI.pl). Nadawca musi być zarejestrowany w panelu SMSAPI.
// ------------------------------------------------------------
export async function sendSms(db: SupabaseClient, to: string, from: string, message: string): Promise<{ ok: boolean; id?: string | null; dry?: boolean; error?: string }> {
  const token = Deno.env.get("SMSAPI_TOKEN");
  if (dryMode() || !token) {
    await toOutbox(db, "sms", to, { from, message });
    return { ok: true, dry: true, id: null };
  }
  const params = new URLSearchParams({ to, from, message, format: "json", encoding: "utf-8" });
  if (Deno.env.get("SMS_TEST_MODE") === "1") params.set("test", "1");
  const res = await fetch("https://api.smsapi.pl/sms.do", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: params,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.error) {
    const error = data?.message ?? `HTTP ${res.status}`;
    await toOutbox(db, "sms", to, { from, message }, "failed", error);
    return { ok: false, error };
  }
  await toOutbox(db, "sms", to, { from, message }, "sent");
  return { ok: true, id: data.list?.[0]?.id ?? null };
}

// ------------------------------------------------------------
// WhatsApp Business Platform (Meta Cloud API) — nasz 1 numer firmowy.
// payload wg typu: text | interactive(3 przyciski) | template.
// ------------------------------------------------------------
function waNumber(to: string) { return to.replace(/^\+/, ""); } // Meta bez plusa

export async function sendWa(db: SupabaseClient, to: string, payload: Record<string, unknown>): Promise<{ ok: boolean; dry?: boolean; error?: string }> {
  const token = Deno.env.get("WA_TOKEN");
  const phoneId = Deno.env.get("WA_PHONE_NUMBER_ID");
  if (dryMode() || !token || !phoneId) {
    await toOutbox(db, "wa", to, payload);
    return { ok: true, dry: true };
  }
  const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: waNumber(to), ...payload }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error = data?.error?.message ?? `HTTP ${res.status}`;
    await toOutbox(db, "wa", to, payload, "failed", error);
    return { ok: false, error };
  }
  await toOutbox(db, "wa", to, payload, "sent");
  return { ok: true };
}

export const waText = (body: string) => ({ type: "text", text: { body } });
export function waButtons(body: string, buttons: Array<{ id: string; title: string }>) {
  return {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body.slice(0, 1024) },
      action: { buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: b.title.slice(0, 20) } })) },
    },
  };
}

// ------------------------------------------------------------
// Szkic odpowiedzi AI (Claude Haiku). Brak klucza / dry → szablon zapasowy.
// ------------------------------------------------------------
export async function aiReplyDraft(businessName: string, review: { author_name?: string | null; rating?: number | null; text?: string | null }): Promise<string> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key || dryMode()) {
    return fallbackReplyDraft(businessName, review.rating ?? 5, review.author_name);
  }
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: `Piszesz krótkie odpowiedzi na opinie Google w imieniu lokalnej polskiej firmy "${businessName}". Zasady: po polsku, 1-3 zdania, naturalnie i konkretnie, bez frazesów i wykrzykników na siłę, bez emoji. Na negatywne: spokojnie, rzeczowo, zaproszenie do kontaktu, zero wymówek. Nigdy nie obiecuj rekompensat. Zwróć SAMĄ odpowiedź.`,
        messages: [{ role: "user", content: `Opinia (${review.rating}/5) od ${review.author_name ?? "klienta"}: ${review.text ?? "(bez tekstu)"}` }],
      }),
    });
    const data = await res.json();
    const text = data?.content?.[0]?.text?.trim();
    return text || fallbackReplyDraft(businessName, review.rating ?? 5, review.author_name);
  } catch {
    return fallbackReplyDraft(businessName, review.rating ?? 5, review.author_name);
  }
}

// ------------------------------------------------------------
// Wspólna logika kolejkowania prośby o opinię (używana przez og-request-review
// ORAZ bota WhatsApp) — jedna ścieżka walidacji: STOP, throttle 30 dni, timing.
// ------------------------------------------------------------
export async function queueReviewRequest(db: SupabaseClient, accountId: string, rawPhone: string, name: string | null): Promise<{ queued: boolean; reason?: string; scheduled_at?: string }> {
  const { data: account } = await db.from("og_accounts")
    .select("id, status, timezone, review_link").eq("id", accountId).single();
  if (!account) return { queued: false, reason: "konto nie istnieje" };
  if (account.status !== "active") return { queued: false, reason: "konto wstrzymane" };
  if (!account.review_link) return { queued: false, reason: "konto bez review_link (dokończ onboarding)" };

  const phone = normalizePhonePL(rawPhone);
  if (!phone) return { queued: false, reason: "to nie wygląda na polski numer (9 cyfr lub +48...)" };

  const { data: customer, error: custErr } = await db.from("og_customers")
    .upsert({ account_id: accountId, phone, ...(name ? { name } : {}) }, { onConflict: "account_id,phone" })
    .select("id, opted_out").single();
  if (custErr) return { queued: false, reason: custErr.message };
  if (customer.opted_out) return { queued: false, reason: "ten numer wypisał się (STOP) - nie wyślemy" };

  const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  const { count: recent } = await db.from("og_review_requests")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId).eq("customer_id", customer.id)
    .in("status", ["queued", "scheduled", "sent", "delivered"])
    .gte("created_at", since);
  if ((recent ?? 0) > 0) return { queued: false, reason: "ten numer dostał już prośbę w ciągu 30 dni - nie spamujemy" };

  const scheduledAt = computeScheduledAt(account.timezone);
  const { data: request, error: reqErr } = await db.from("og_review_requests").insert({
    account_id: accountId,
    customer_id: customer.id,
    channel: "sms",
    status: "scheduled",
    scheduled_at: scheduledAt.toISOString(),
  }).select("scheduled_at").single();
  if (reqErr) return { queued: false, reason: reqErr.message };
  return { queued: true, scheduled_at: request.scheduled_at };
}

// ------------------------------------------------------------
// Google Places API (New)
// ------------------------------------------------------------
const PLACES_KEY = () => Deno.env.get("GOOGLE_PLACES_KEY")!;

export async function placesSearchText(query: string) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": PLACES_KEY(),
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount",
    },
    body: JSON.stringify({ textQuery: query, languageCode: "pl", regionCode: "PL" }),
  });
  if (!res.ok) throw new Error(`Places searchText HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()).places ?? [];
}

export async function placesDetails(placeId: string, fields = "rating,userRatingCount") {
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    { headers: { "X-Goog-Api-Key": PLACES_KEY(), "X-Goog-FieldMask": fields } },
  );
  if (!res.ok) throw new Error(`Places details HTTP ${res.status}: ${await res.text()}`);
  return await res.json();
}

export const reviewLink = (placeId: string) =>
  `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;

export { fillTemplate };
