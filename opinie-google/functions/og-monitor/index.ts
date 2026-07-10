// og-monitor - Pętla 2 (Moduł 4): wykrywanie nowych opinii + szkic AI +
// powiadomienie WhatsApp z przyciskami. Cron co 6h. Autoryzacja: x-og-service-key.
//
// Legalnie i bez approval Google: czytamy oficjalne Places API (5 opinii
// "najbardziej trafnych" z treścią). Publikacja odpowiedzi = człowiek
// (kolejka og_publish_queue) - NIGDY automat klikający w panelu Google.
//
// Odporność (po audycie 10.07):
//   - BASELINE jawny: og_accounts.baselined_at ustawiane po pierwszym UDANYM
//     pełnym przebiegu (nie kruche count==0 - częściowy przebieg nie zaleje
//     fachowca historią przy kolejnym uruchomieniu),
//   - bramka czasu: Places zwraca "najtrafniejsze", nie najnowsze - opinia
//     opublikowana PRZED baseline nigdy nie jest zgłaszana jako nowa,
//   - okno 24h WhatsApp: poza oknem zwykła wiadomość by nie doszła - wysyłamy
//     zatwierdzony TEMPLATE Mety (env WA_REVIEW_TEMPLATE), a bez template'u
//     oznaczamy 'notify_failed' zamiast po cichu gubić,
//   - sweep: opinie 'new'/'notify_failed' (np. po padzie przebiegu) są
//     ponawiane w następnym cronie, nie znikają na zawsze,
//   - paginacja: konta w kolejności last_polled_at (najdawniej odpytane
//     najpierw), limit 50/przebieg - ogon nie jest głodzony przy wzroście.
import { serviceClient, json, requireServiceKey, placesDetails, aiReplyDraft, reviewFingerprint, sendWa, waButtons, buttonId, within24h } from "../_shared/util.ts";

const ACCOUNTS_PER_RUN = 50;

Deno.serve(async (req) => {
  const denied = requireServiceKey(req);
  if (denied) return denied;
  const db = serviceClient();
  const report = { accounts: 0, new_reviews: 0, notified: 0, baselined: 0, retried: 0, errors: [] as string[] };

  // Powiadomienie o opinii. Zwraca:
  //   'sent'     - pełna wiadomość z przyciskami doszła (okno 24h otwarte),
  //   'template' - poza oknem: poszedł zatwierdzony template Mety ("masz nową
  //                opinię, odpisz OK") - przyciski dośle webhook, gdy fachowiec
  //                odpisze (otworzy okno), albo sweep następnego przebiegu,
  //   'failed'   - nic nie doszło (brak WA/template'u/awaria).
  // allowTemplate=false w sweepie: template poszedł już przy detekcji, nie
  // spamujemy nim co 6h - czekamy aż fachowiec otworzy okno.
  async function notify(acc: Record<string, any>, review: { id: string; author_name: string | null; rating: number | null; text: string | null }, draft: string, allowTemplate: boolean): Promise<"sent" | "template" | "failed"> {
    const sess = acc.og_wa_sessions as Record<string, any> | null;
    const wa = sess?.wa_number;
    if (!wa || !sess?.opted_in_at) return "failed"; // brak WhatsAppa -> kolejka operatora
    if (within24h(sess?.last_interaction_at)) {
      const stars = "★".repeat(review.rating ?? 0) + "☆".repeat(Math.max(0, 5 - (review.rating ?? 0)));
      const bodyTxt = `Nowa opinia ${stars}\nod: ${review.author_name ?? "klient"}\n\n„${(review.text ?? "(bez tekstu)").slice(0, 400)}"\n\nProponowana odpowiedź:\n„${draft}"`;
      const res = await sendWa(db, wa, waButtons(bodyTxt, [
        { id: buttonId("accept", review.id), title: "Akceptuj" },
        { id: buttonId("edit", review.id), title: "Edytuj" },
        { id: buttonId("skip", review.id), title: "Pomiń" },
      ]));
      return res.ok ? "sent" : "failed";
    }
    // Poza oknem 24h: business-initiated wymaga zatwierdzonego template'u Mety.
    if (!allowTemplate) return "failed";
    const tpl = Deno.env.get("WA_REVIEW_TEMPLATE");
    if (!tpl) return "failed"; // brak template'u -> notify_failed (widoczne, ponawiane)
    const res = await sendWa(db, wa, {
      type: "template",
      template: {
        name: tpl,
        language: { code: "pl" },
        components: [{ type: "body", parameters: [{ type: "text", text: acc.business_name }] }],
      },
    });
    return res.ok ? "template" : "failed";
  }

  // Konta: najdawniej odpytane najpierw (kursor last_polled_at).
  const { data: accounts } = await db.from("og_accounts")
    .select("id, business_name, place_id, status, baselined_at, og_wa_sessions(wa_number, opted_in_at, last_interaction_at)")
    .eq("status", "active").not("place_id", "is", null)
    .order("last_polled_at", { ascending: true, nullsFirst: true })
    .limit(ACCOUNTS_PER_RUN);

  for (const acc of accounts ?? []) {
    try {
      report.accounts++;
      const isBaseline = !acc.baselined_at;

      // --- Sweep: opinie, które czekają na powiadomienie (pad/okno 24h/awaria WA).
      // Bez template'u (poszedł przy detekcji) - przyciski tylko gdy okno otwarte.
      if (!isBaseline) {
        const { data: pending } = await db.from("og_reviews")
          .select("id, author_name, rating, text, ai_reply_draft, status")
          .eq("account_id", acc.id).in("status", ["new", "notify_failed"]).limit(10);
        for (const p of pending ?? []) {
          const draft = p.ai_reply_draft ?? await aiReplyDraft(acc.business_name, p);
          if (!p.ai_reply_draft) await db.from("og_reviews").update({ ai_reply_draft: draft }).eq("id", p.id);
          const out = await notify(acc, p, draft, false);
          if (out === "sent") {
            await db.from("og_reviews").update({ status: "draft_sent" }).eq("id", p.id).in("status", ["new", "notify_failed"]);
            report.retried++;
          } else if (p.status === "new") {
            await db.from("og_reviews").update({ status: "notify_failed" }).eq("id", p.id).eq("status", "new");
          }
        }
      }

      // --- Świeży odczyt Places ---
      const place = await placesDetails(acc.place_id, "rating,userRatingCount,reviews");
      const reviews: Record<string, any>[] = place.reviews ?? [];

      for (const r of reviews) {
        const fp = reviewFingerprint(r);
        // Bramka czasu: opinia sprzed baseline NIGDY nie jest "nowa"
        // (Places sortuje po trafności - stara opinia może wskoczyć do topu).
        const isOld = !isBaseline && r.publishTime && acc.baselined_at &&
          new Date(r.publishTime).getTime() < new Date(acc.baselined_at).getTime();
        const row = {
          account_id: acc.id,
          fingerprint: fp,
          author_name: r.authorAttribution?.displayName ?? null,
          rating: r.rating ?? null,
          text: r.text?.text ?? r.originalText?.text ?? null,
          review_time: r.publishTime ?? null,
          status: (isBaseline || isOld) ? "skipped" : "new",
        };
        // Dedup na unikacie (account_id, fingerprint): istniejąca -> pomijamy.
        const { data: inserted, error } = await db.from("og_reviews")
          .upsert(row, { onConflict: "account_id,fingerprint", ignoreDuplicates: true })
          .select("id").maybeSingle();
        if (error) { report.errors.push(`${acc.business_name}: ${error.message}`); continue; }
        if (!inserted) continue; // duplikat = już znana opinia
        if (isBaseline || isOld) { report.baselined++; continue; }
        report.new_reviews++;

        // Szkic AI + powiadomienie z przyciskami (świeża opinia: template dozwolony).
        const draft = await aiReplyDraft(acc.business_name, row);
        await db.from("og_reviews").update({ ai_reply_draft: draft }).eq("id", inserted.id);
        const out = await notify(acc, { id: inserted.id, author_name: row.author_name, rating: row.rating, text: row.text }, draft, true);
        // 'template' = fachowiec dostał zajawkę; pełne przyciski dośle webhook
        // (gdy odpisze) albo sweep - status zostaje 'notify_failed' do domknięcia.
        await db.from("og_reviews").update({ status: out === "sent" ? "draft_sent" : "notify_failed" }).eq("id", inserted.id);
        if (out === "sent") report.notified++;
        // Brak WhatsAppa/template'u -> 'notify_failed': widoczne dla operatora,
        // ponawiane sweepem; szkic czeka w bazie (widok kolejki/panel).
      }

      // Pełny przebieg konta UDANY -> baseline ustawiony (także przy 0 opinii)
      // + kursor odpytania.
      const patch: Record<string, string> = { last_polled_at: new Date().toISOString() };
      if (isBaseline) patch.baselined_at = new Date().toISOString();
      await db.from("og_accounts").update(patch).eq("id", acc.id);
    } catch (e) {
      report.errors.push(`${acc.business_name}: ${(e as Error).message}`);
      // Kursor przesuwamy też po błędzie - jedno chore konto nie głodzi ogona.
      await db.from("og_accounts").update({ last_polled_at: new Date().toISOString() }).eq("id", acc.id);
    }
  }

  return json(report);
});
