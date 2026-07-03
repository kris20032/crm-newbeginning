// og-snapshot — dzienny cron: licznik postępu + higiena danych.
// 1) Dla każdego aktywnego konta z place_id: Places API → rating + liczba opinii
//    → upsert do og_metrics_snapshots (raz dziennie, unikat na (konto, data)).
// 2) Retencja: czyści treść opinii starszych niż purge_after (polityka Places: max 30 dni).
// Autoryzacja: x-og-service-key.
import { serviceClient, json, requireServiceKey, placesDetails } from "../_shared/util.ts";

Deno.serve(async (req) => {
  const denied = requireServiceKey(req);
  if (denied) return denied;
  const db = serviceClient();
  const today = new Date().toISOString().slice(0, 10);
  const report = { snapshots: 0, errors: 0, purged: 0, details: [] as string[] };

  // ---------- 1. Snapshoty metryk ----------
  const { data: accounts } = await db.from("og_accounts")
    .select("id, business_name, place_id").eq("status", "active").not("place_id", "is", null);

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

  // ---------- 2. Retencja treści opinii (30 dni — zgodność Places) ----------
  const { data: purged } = await db.from("og_reviews")
    .update({ text: null, author_name: null }) // metadane (rating, status, odpowiedź) zostają
    .lte("purge_after", new Date().toISOString())
    .not("text", "is", null)
    .select("id");
  report.purged = purged?.length ?? 0;

  return json(report);
});
