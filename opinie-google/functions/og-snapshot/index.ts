// og-snapshot - dzienny cron: licznik postępu + higiena danych.
// 1) Dla każdego aktywnego konta z place_id: Places API -> rating + liczba opinii
//    -> upsert do og_metrics_snapshots (raz dziennie, unikat na (konto, data)).
// 2) Retencja (polityka Places: treść max 30 dni + RODO minimalizacja):
//    - og_reviews: czyści text/author_name po purge_after,
//    - og_outbox: payloady starsze niż 30 dni (dry: 14 dni) - treści opinii
//      i numery klientów nie leżą bezterminowo (audyt dry-mode-6),
//    - og_wa_processed: wpisy idempotencji starsze niż 14 dni.
// Autoryzacja: x-og-service-key.
import { serviceClient, json, requireServiceKey, placesDetails } from "../_shared/util.ts";

const ACCOUNTS_PER_RUN = 200; // dzienny cron, porcja z kursorem (jak og-monitor)

Deno.serve(async (req) => {
  const denied = requireServiceKey(req);
  if (denied) return denied;
  const db = serviceClient();
  const today = new Date().toISOString().slice(0, 10);
  const report = { snapshots: 0, errors: 0, purged: 0, outbox_purged: 0, wa_processed_purged: 0, details: [] as string[] };

  // ---------- 1. Snapshoty metryk ----------
  const { data: accounts } = await db.from("og_accounts")
    .select("id, business_name, place_id").eq("status", "active").not("place_id", "is", null)
    .order("last_polled_at", { ascending: true, nullsFirst: true })
    .limit(ACCOUNTS_PER_RUN);

  for (const acc of accounts ?? []) {
    try {
      const place = await placesDetails(acc.place_id);
      const { error } = await db.from("og_metrics_snapshots").upsert({
        account_id: acc.id,
        snapshot_date: today,
        rating: place.rating ?? null,
        user_rating_count: place.userRatingCount ?? 0,
      }, { onConflict: "account_id,snapshot_date" });
      if (error) throw new Error(error.message);
      report.snapshots++;
    } catch (e) {
      report.errors++;
      report.details.push(`${acc.business_name}: ${(e as Error).message}`);
    }
  }

  // ---------- 2. Retencja treści opinii (30 dni - zgodność Places) ----------
  const { data: purged } = await db.from("og_reviews")
    .update({ text: null, author_name: null }) // metadane (rating, status, odpowiedź) zostają
    .lte("purge_after", new Date().toISOString())
    .not("text", "is", null)
    .select("id");
  report.purged = purged?.length ?? 0;

  // ---------- 3. Retencja og_outbox (audyt dry-mode-6) ----------
  // Kopie treści opinii/SMS-ów z numerami nie mogą żyć bezterminowo.
  const days30 = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  const days14 = new Date(Date.now() - 14 * 24 * 3600_000).toISOString();
  const { data: oldDry } = await db.from("og_outbox").delete()
    .eq("status", "dry").lte("created_at", days14).select("id");
  const { data: oldAny } = await db.from("og_outbox").delete()
    .lte("created_at", days30).select("id");
  report.outbox_purged = (oldDry?.length ?? 0) + (oldAny?.length ?? 0);

  // ---------- 4. Higiena idempotencji webhooka (14 dni wystarcza na retry Mety) ----------
  const { data: oldMsgs } = await db.from("og_wa_processed").delete()
    .lte("processed_at", days14).select("msg_id");
  report.wa_processed_purged = oldMsgs?.length ?? 0;

  return json(report);
});
