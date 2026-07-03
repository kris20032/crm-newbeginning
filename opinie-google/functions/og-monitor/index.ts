// og-monitor — Pętla 2 (Moduł 4): wykrywanie nowych opinii + szkic AI +
// powiadomienie WhatsApp z przyciskami. Cron co 6-12h. Autoryzacja: x-og-service-key.
//
// Legalnie i bez approval Google: czytamy oficjalne Places API (5 najnowszych
// opinii z treścią). Publikacja odpowiedzi = człowiek (kolejka og_publish_queue)
// — NIGDY automat klikający w panelu Google.
//
// Pierwsze uruchomienie na koncie = BASELINE: istniejące opinie zapisujemy
// jako 'skipped' BEZ powiadomień (żeby nie zalać fachowca historią).
import { serviceClient, json, requireServiceKey, placesDetails, aiReplyDraft, reviewFingerprint, sendWa, waButtons, buttonId } from "../_shared/util.ts";

Deno.serve(async (req) => {
  const denied = requireServiceKey(req);
  if (denied) return denied;
  const db = serviceClient();
  const report = { accounts: 0, new_reviews: 0, notified: 0, baselined: 0, errors: [] as string[] };

  const { data: accounts } = await db.from("og_accounts")
    .select("id, business_name, place_id, status, og_wa_sessions(wa_number, opted_in_at)")
    .eq("status", "active").not("place_id", "is", null);

  for (const acc of accounts ?? []) {
    try {
      report.accounts++;
      const place = await placesDetails(acc.place_id, "rating,userRatingCount,reviews");
      const reviews: Record<string, any>[] = place.reviews ?? [];
      if (!reviews.length) continue;

      // Baseline? = konto nie ma jeszcze żadnych opinii w bazie.
      const { count: existing } = await db.from("og_reviews")
        .select("id", { count: "exact", head: true }).eq("account_id", acc.id);
      const isBaseline = (existing ?? 0) === 0;

      for (const r of reviews) {
        const fp = reviewFingerprint(r);
        const row = {
          account_id: acc.id,
          fingerprint: fp,
          author_name: r.authorAttribution?.displayName ?? null,
          rating: r.rating ?? null,
          text: r.text?.text ?? r.originalText?.text ?? null,
          review_time: r.publishTime ?? null,
          status: isBaseline ? "skipped" : "new",
        };
        // Dedup na unikacie (account_id, fingerprint): istniejąca → pomijamy.
        const { data: inserted, error } = await db.from("og_reviews")
          .upsert(row, { onConflict: "account_id,fingerprint", ignoreDuplicates: true })
          .select("id").maybeSingle();
        if (error) { report.errors.push(`${acc.business_name}: ${error.message}`); continue; }
        if (!inserted) continue; // duplikat = już znana opinia
        if (isBaseline) { report.baselined++; continue; }
        report.new_reviews++;

        // Szkic AI + powiadomienie z przyciskami.
        const draft = await aiReplyDraft(acc.business_name, row);
        await db.from("og_reviews").update({ ai_reply_draft: draft }).eq("id", inserted.id);

        const wa = (acc.og_wa_sessions as Record<string, any>)?.wa_number;
        const optedIn = (acc.og_wa_sessions as Record<string, any>)?.opted_in_at;
        if (wa && optedIn) {
          const stars = "★".repeat(row.rating ?? 0) + "☆".repeat(Math.max(0, 5 - (row.rating ?? 0)));
          const bodyTxt = `Nowa opinia ${stars}\nod: ${row.author_name ?? "klient"}\n\n„${(row.text ?? "(bez tekstu)").slice(0, 400)}"\n\nProponowana odpowiedź:\n„${draft}"`;
          const res = await sendWa(db, wa, waButtons(bodyTxt, [
            { id: buttonId("accept", inserted.id), title: "Akceptuj" },
            { id: buttonId("edit", inserted.id), title: "Edytuj" },
            { id: buttonId("skip", inserted.id), title: "Pomiń" },
          ]));
          if (res.ok) {
            await db.from("og_reviews").update({ status: "draft_sent" }).eq("id", inserted.id);
            report.notified++;
          }
          // ⚠️ Poza oknem 24h realny WhatsApp wymaga zatwierdzonego TEMPLATE —
          // w trybie na sucho outbox przyjmuje wszystko; przy realnym starcie
          // dodać fallback na template (udokumentowane w SETUP.md).
        }
        // Brak WhatsAppa → opinia zostaje 'new' + szkic w bazie (widok kolejki/panel).
      }
    } catch (e) {
      report.errors.push(`${acc.business_name}: ${(e as Error).message}`);
    }
  }

  return json(report);
});
