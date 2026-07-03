// og-request-review — przyjęcie prośby o opinię (Pętla 1, wejście).
// Wywołania: (a) worker/bot WhatsApp lub operator z x-og-service-key + account_id,
//            (b) później panel fachowca z JWT (konto wyprowadzane z auth, NIE z body).
// Robi: normalizacja numeru → upsert klienta → walidacje (STOP, throttle 30 dni)
//       → wyliczenie okna wysyłki (silnik timingu) → prośba status=scheduled.
// SMS-a fizycznie wysyła og-dispatch (cron) — tu tylko kolejkujemy.
import { createClient } from "npm:@supabase/supabase-js@2";
import { serviceClient, json, computeScheduledAt, normalizePhonePL } from "../_shared/util.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const body = await req.json().catch(() => null);
  if (!body?.phone) return json({ error: "brak pola phone" }, 400);

  const db = serviceClient();

  // --- Ustal konto: service key + account_id ALBO JWT fachowca ---
  let accountId: string | null = null;
  const svcKey = req.headers.get("x-og-service-key");
  if (svcKey && svcKey === Deno.env.get("OG_SERVICE_KEY")) {
    accountId = body.account_id ?? null;
  } else {
    // JWT z panelu: konto TYLKO z tożsamości auth — body.account_id ignorowane (izolacja).
    const authHeader = req.headers.get("authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { authorization: authHeader } }, auth: { persistSession: false } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);
    const { data: acc } = await db.from("og_accounts").select("id").eq("owner_auth_id", user.id).single();
    accountId = acc?.id ?? null;
  }
  if (!accountId) return json({ error: "nie znaleziono konta" }, 404);

  const { data: account } = await db.from("og_accounts")
    .select("id, status, timezone, place_id, review_link").eq("id", accountId).single();
  if (!account) return json({ error: "konto nie istnieje" }, 404);
  if (account.status !== "active") return json({ error: "konto wstrzymane (paused)" }, 409);
  if (!account.review_link) return json({ error: "konto bez review_link (dokończ onboarding)" }, 409);

  const phone = normalizePhonePL(String(body.phone));
  if (!phone) return json({ error: "numer nie wygląda na polski (podaj 9 cyfr lub +48...)" }, 400);

  // --- Upsert klienta końcowego ---
  const { data: customer, error: custErr } = await db.from("og_customers")
    .upsert(
      { account_id: accountId, phone, name: body.name ?? null },
      { onConflict: "account_id,phone", ignoreDuplicates: false },
    )
    .select("id, opted_out").single();
  if (custErr) return json({ error: custErr.message }, 500);

  // --- Walidacje anty-spam ---
  if (customer.opted_out) {
    return json({ queued: false, reason: "Ten numer wypisał się z wiadomości (STOP) - nie wyślemy." }, 200);
  }
  const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  const { count: recent } = await db.from("og_review_requests")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId).eq("customer_id", customer.id)
    .in("status", ["queued", "scheduled", "sent", "delivered"])
    .gte("created_at", since);
  if ((recent ?? 0) > 0) {
    return json({ queued: false, reason: "Ten numer dostał już prośbę w ciągu 30 dni - nie spamujemy." }, 200);
  }

  // --- Kolejkowanie z oknem czasowym ---
  const scheduledAt = computeScheduledAt(account.timezone);
  const { data: request, error: reqErr } = await db.from("og_review_requests").insert({
    account_id: accountId,
    customer_id: customer.id,
    channel: "sms",
    status: "scheduled",
    scheduled_at: scheduledAt.toISOString(),
  }).select("id, scheduled_at").single();
  if (reqErr) return json({ error: reqErr.message }, 500);

  return json({ queued: true, request_id: request.id, scheduled_at: request.scheduled_at });
});
