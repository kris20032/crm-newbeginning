// og-dispatch - wysyłka dojrzałych próśb + przypomnienia (cron co ~15 min).
// Autoryzacja: x-og-service-key.
//
// ANTY-DOUBLE-SEND (audyt sms-stop-throttle-2): każdy wiersz jest ATOMOWO
// "zaklepywany" (status scheduled -> sending) PRZED wysyłką; wysyłamy tylko gdy
// claim trafił 1 wiersz. Crash/współbieżny run nie wyśle drugi raz (następny
// cron bierze tylko 'scheduled'). Przypomnienie: reminder_count 0->1 też atomowo.
//
// Bezpieczniki: STOP tuż przed wysyłką, walidacja szablonu (Google/Omnibus),
// dzienny limit per konto (liczony z realnego rejestru og_outbox, wraz z
// przypomnieniami), okno 9-21 czasu lokalnego, max 1 przypomnienie (po 3 dniach).
import { serviceClient, json, requireServiceKey, sendSms, computeScheduledAt, hourInTz, fillTemplate, validateTemplate } from "../_shared/util.ts";

const DAILY_LIMIT_PER_ACCOUNT = 30; // bezpiecznik kosztowy (rolling 24h)
const REMINDER_AFTER_DAYS = 3;

Deno.serve(async (req) => {
  const denied = requireServiceKey(req);
  if (denied) return denied;
  const db = serviceClient();
  const now = new Date();
  const report = { sent: 0, reminders: 0, skipped: 0, failed: 0, stuck: 0, details: [] as string[] };

  // Diagnostyka: wiersze utknięte w 'sending' >1h (crash w trakcie wysyłki).
  // NIE ponawiamy automatycznie (mogły zostać fizycznie wysłane) - do wglądu operatora.
  {
    const stuckBefore = new Date(now.getTime() - 3600_000).toISOString();
    const { count } = await db.from("og_review_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "sending").lte("created_at", stuckBefore);
    if ((count ?? 0) > 0) { report.stuck = count ?? 0; report.details.push(`${count} prośb utknęło w 'sending' >1h - do przeglądu`); }
  }

  // Dzienny limit z realnego rejestru wysyłek (og_outbox), per konto po nazwie
  // nadawcy (sms_sender_name unikalny per konto). Liczy pierwsze wysyłki I
  // przypomnienia I wysyłki na sucho - rolling 24h.
  const sentCache = new Map<string, number>();
  async function sentLast24h(senderName: string): Promise<number> {
    if (!senderName) return 0;
    if (!sentCache.has(senderName)) {
      const since = new Date(now.getTime() - 24 * 3600_000).toISOString();
      const { count } = await db.from("og_outbox")
        .select("id", { count: "exact", head: true })
        .eq("channel", "sms").gte("created_at", since)
        .filter("payload->>from", "eq", senderName);
      sentCache.set(senderName, count ?? 0);
    }
    return sentCache.get(senderName)!;
  }
  const bump = (senderName: string) => sentCache.set(senderName, (sentCache.get(senderName) ?? 0) + 1);

  // ---------- 1. Dojrzałe prośby ----------
  const { data: due } = await db.from("og_review_requests")
    .select("id, account_id, customer_id, reminder_count, og_customers(phone, name, opted_out), og_accounts(business_name, sms_sender_name, message_template, review_link, status, timezone)")
    .eq("status", "scheduled").lte("scheduled_at", now.toISOString())
    .order("scheduled_at").limit(200);

  for (const r of due ?? []) {
    try {
      const cust = r.og_customers as Record<string, any>;
      const acc = r.og_accounts as Record<string, any>;
      const fail = async (status: string, error: string) => {
        await db.from("og_review_requests").update({ status, error }).eq("id", r.id);
        report.skipped++; report.details.push(`${r.id}: ${error}`);
      };

      if (!cust || !acc) { await fail("failed", "brak danych klienta/konta"); continue; }
      if (acc.status !== "active") { await fail("cancelled", "konto paused"); continue; }
      if (cust.opted_out) { await fail("opted_out", "klient wypisany (STOP)"); continue; }
      if (!acc.sms_sender_name) { await fail("failed", "brak zarejestrowanego nadawcy SMS"); continue; }

      // Walidacja szablonu (Google/Omnibus) - fachowiec mógł go zmienić z panelu.
      const tplCheck = validateTemplate(acc.message_template ?? "{link}");
      if (!tplCheck.ok) { await fail("failed", `szablon odrzucony: ${tplCheck.reason}`); continue; }

      // Okno 9-21 czasu lokalnego (tz może być zatrute -> RangeError -> catch niżej).
      const h = hourInTz(now, acc.timezone);
      if (h < 9 || h >= 21) {
        const next = computeScheduledAt(acc.timezone, now);
        await db.from("og_review_requests").update({ scheduled_at: next.toISOString() }).eq("id", r.id);
        report.skipped++; report.details.push(`${r.id}: poza oknem 9-21, przesunięte`);
        continue;
      }

      // Dzienny limit -> przesuń na jutro rano (nie failuj).
      if ((await sentLast24h(acc.sms_sender_name)) >= DAILY_LIMIT_PER_ACCOUNT) {
        const tomorrow = computeScheduledAt(acc.timezone, new Date(now.getTime() + 20 * 3600_000));
        await db.from("og_review_requests").update({ scheduled_at: tomorrow.toISOString() }).eq("id", r.id);
        report.skipped++; report.details.push(`${r.id}: dzienny limit konta, przesunięte`);
        continue;
      }

      // ATOMOWE ZAKLEPANIE: scheduled -> sending. Tylko zwycięzca wysyła.
      const { data: claimed } = await db.from("og_review_requests")
        .update({ status: "sending" }).eq("id", r.id).eq("status", "scheduled").select("id");
      if (!claimed || claimed.length === 0) { continue; } // wziął inny run / już nie scheduled

      const msg = fillTemplate(acc.message_template ?? "Ocen nas w Google: {link}", cust.name, acc.review_link);
      const res = await sendSms(db, cust.phone, acc.sms_sender_name, msg);
      if (res.ok) {
        await db.from("og_review_requests").update({
          status: "sent", sent_at: new Date().toISOString(), provider_msg_id: res.id,
        }).eq("id", r.id);
        bump(acc.sms_sender_name);
        report.sent++;
      } else {
        await db.from("og_review_requests").update({ status: "failed", error: res.error }).eq("id", r.id);
        report.failed++; report.details.push(`${r.id}: SMS fail ${res.error}`);
      }
    } catch (e) {
      // Zatruty rekord (np. zła strefa czasowa) nie może wywalić całego przebiegu.
      await db.from("og_review_requests").update({ status: "failed", error: `wyjątek: ${(e as Error).message}` }).eq("id", r.id).in("status", ["scheduled", "sending"]);
      report.failed++; report.details.push(`${r.id}: wyjątek ${(e as Error).message}`);
    }
  }

  // ---------- 2. Przypomnienia (max 1, po 3 dniach) ----------
  const remindBefore = new Date(now.getTime() - REMINDER_AFTER_DAYS * 24 * 3600_000).toISOString();
  const { data: remindable } = await db.from("og_review_requests")
    .select("id, account_id, reminder_count, og_customers(phone, name, opted_out), og_accounts(sms_sender_name, message_template, review_link, status, timezone)")
    .in("status", ["sent", "delivered"]).eq("reminder_count", 0)
    .lte("sent_at", remindBefore).limit(100);

  for (const r of remindable ?? []) {
    try {
      const cust = r.og_customers as Record<string, any>;
      const acc = r.og_accounts as Record<string, any>;
      if (!cust || !acc || acc.status !== "active" || cust.opted_out || !acc.sms_sender_name) {
        await db.from("og_review_requests").update({ reminder_count: 1 }).eq("id", r.id); // nie ponawiaj
        continue;
      }
      const tplCheck = validateTemplate(acc.message_template ?? "{link}");
      if (!tplCheck.ok) { await db.from("og_review_requests").update({ reminder_count: 1, error: `reminder: ${tplCheck.reason}` }).eq("id", r.id); continue; }

      const h = hourInTz(now, acc.timezone);
      if (h < 9 || h >= 21) continue; // złapie następny cron w oknie
      if ((await sentLast24h(acc.sms_sender_name)) >= DAILY_LIMIT_PER_ACCOUNT) continue;

      // ATOMOWE: reminder_count 0 -> 1 PRZED wysyłką. Zwycięzca wysyła, reszta odpada.
      const { data: claimed } = await db.from("og_review_requests")
        .update({ reminder_count: 1 }).eq("id", r.id).eq("reminder_count", 0).select("id");
      if (!claimed || claimed.length === 0) continue;

      const msg = fillTemplate(
        "Przypominajka: " + (acc.message_template ?? "Ocen nas w Google: {link}"),
        cust.name, acc.review_link,
      );
      const res = await sendSms(db, cust.phone, acc.sms_sender_name, msg);
      if (res.ok) { report.reminders++; bump(acc.sms_sender_name); }
      else { await db.from("og_review_requests").update({ error: `reminder fail: ${res.error}` }).eq("id", r.id); }
    } catch (e) {
      report.details.push(`reminder ${r.id}: wyjątek ${(e as Error).message}`);
    }
  }

  return json(report);
});
