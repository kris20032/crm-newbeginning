// og-request-review - przyjęcie prośby o opinię (Pętla 1, wejście) + opt-out.
// Wywołania: (a) worker/operator z x-og-service-key + account_id,
//            (b) panel fachowca z JWT (konto wyprowadzane z auth, NIE z body).
// Akcje:  { phone }                → kolejka prośby (STOP, throttle 30 dni, timing
//                                     w queueReviewRequest - ta sama ścieżka co bot WA),
//         { phone, opt_out: true } → wypisanie numeru (opted_out=true) + anulowanie
//                                     zaplanowanych próśb (ścieżka STOP operatora).
import { createClient } from "npm:@supabase/supabase-js@2";
import { serviceClient, json, queueReviewRequest, normalizePhonePL } from "../_shared/util.ts";

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
    // JWT z panelu: konto TYLKO z tożsamości auth - body.account_id ignorowane (izolacja).
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

  // --- Opt-out (STOP): wypisanie numeru + anulowanie zaplanowanych próśb ---
  if (body.opt_out === true) {
    const phone = normalizePhonePL(String(body.phone));
    if (!phone) return json({ error: "to nie wygląda na polski numer" }, 400);
    const { data: cust } = await db.from("og_customers")
      .upsert({ account_id: accountId, phone, opted_out: true }, { onConflict: "account_id,phone" })
      .select("id").single();
    if (cust) {
      await db.from("og_review_requests")
        .update({ status: "opted_out", error: "STOP zgłoszony operatorsko" })
        .eq("account_id", accountId).eq("customer_id", cust.id)
        .in("status", ["queued", "scheduled"]);
    }
    return json({ opted_out: true, phone });
  }

  const result = await queueReviewRequest(db, accountId, String(body.phone), body.name ?? null);
  return json(result, result.queued ? 200 : 409);
});
