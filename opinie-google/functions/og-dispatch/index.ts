// og-dispatch — wysyłka dojrzałych próśb + przypomnienia (cron co ~15 min).
// Autoryzacja: x-og-service-key. Idempotentny: bierze tylko status=scheduled
// z scheduled_at<=now i od razu przestawia na 'sent'/'failed'.
// Bezpieczniki: STOP sprawdzany tuż przed wysyłką, dzienny limit per konto,
// max 1 przypomnienie (po 3 dniach), nadawca musi być ustawiony.
import { serviceClient, json, requireServiceKey, sendSms, computeScheduledAt } from "../_shared/util.ts";

const DAILY_LIMIT_PER_ACCOUNT = 30; // bezpiecznik kosztowy (F: rate-limit z audytu)
const REMINDER_AFTER_DAYS = 3;

function fillTemplate(tpl: string, name: string | null, link: string): string {
  return tpl
    .replaceAll("{imie}", name ? ` ${name}` : "")
    .replaceAll("{ imie}", name ? ` ${name}` : "") // odporność na spacje w szablonie
    .replaceAll("{link}", link)
    .replace(/\s+/g, " ").trim();
}

Deno.serve(async (req) => {
  const denied = requireServiceKey(req);
  if (denied) return denied;
  const db = serviceClient();
  const now = new Date();
  const report = { sent: 0, reminders: 0, skipped: 0, failed: 0, details: [] as string[] };

  // ---------- 1. Dojrzałe prośby ----------
  const { data: due } = await db.from("og_review_requests")
    .select("id, account_id, customer_id, reminder_count, og_customers(phone, name, opted_out), og_accounts(business_name, sms_sender_name, message_template, review_link, status, timezone)")
    .eq("status", "scheduled").lte("scheduled_at", now.toISOString())
    .order("scheduled_at").limit(200);

  const sentTodayCache = new Map<string, number>();
  async function sentToday(accountId: string): Promise<number> {
    if (!sentTodayCache.has(accountId)) {
      const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
      const { count } = await db.from("og_review_requests")
        .select("id", { count: "exact", head: true })
        .eq("account_id", accountId).eq("status", "sent")
        .gte("sent_at", midnight.toISOString());
      sentTodayCache.set(accountId, count ?? 0);
    }
    return sentTodayCache.get(accountId)!;
  }

  for (const r of due ?? []) {
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
    if ((await sentToday(r.account_id)) >= DAILY_LIMIT_PER_ACCOUNT) {
      // nie failujemy — przesuwamy na jutro rano (limit dzienny)
      const tomorrow = computeScheduledAt(acc.timezone, new Date(now.getTime() + 20 * 3600_000));
      await db.from("og_review_requests").update({ scheduled_at: tomorrow.toISOString() }).eq("id", r.id);
      report.skipped++; report.details.push(`${r.id}: dzienny limit konta, przesunięte`);
      continue;
    }

    const msg = fillTemplate(acc.message_template ?? "Ocen nas w Google: {link}", cust.name, acc.review_link);
    const res = await sendSms(cust.phone, acc.sms_sender_name, msg);
    if (res.ok) {
      await db.from("og_review_requests").update({
        status: "sent", sent_at: new Date().toISOString(), provider_msg_id: res.id,
      }).eq("id", r.id);
      sentTodayCache.set(r.account_id, (sentTodayCache.get(r.account_id) ?? 0) + 1);
      report.sent++;
    } else {
      await db.from("og_review_requests").update({ status: "failed", error: res.error }).eq("id", r.id);
      report.failed++; report.details.push(`${r.id}: SMS fail ${res.error}`);
    }
  }

  // ---------- 2. Przypomnienia (max 1, po 3 dniach) ----------
  const remindBefore = new Date(now.getTime() - REMINDER_AFTER_DAYS * 24 * 3600_000).toISOString();
  const { data: remindable } = await db.from("og_review_requests")
    .select("id, account_id, reminder_count, og_customers(phone, name, opted_out), og_accounts(sms_sender_name, message_template, review_link, status, timezone)")
    .in("status", ["sent", "delivered"]).eq("reminder_count", 0)
    .lte("sent_at", remindBefore).limit(100);

  for (const r of remindable ?? []) {
    const cust = r.og_customers as Record<string, any>;
    const acc = r.og_accounts as Record<string, any>;
    if (!cust || !acc || acc.status !== "active" || cust.opted_out || !acc.sms_sender_name) {
      await db.from("og_review_requests").update({ reminder_count: 1 }).eq("id", r.id); // nie ponawiaj
      continue;
    }
    // Przypomnienie tylko w dobrym oknie lokalnym (9-21) — inaczej złapie następny cron.
    const h = parseInt(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: acc.timezone }).format(now), 10);
    if (h < 9 || h >= 21) continue;
    if ((await sentToday(r.account_id)) >= DAILY_LIMIT_PER_ACCOUNT) continue;

    const msg = fillTemplate(
      "Przypominajka: " + (acc.message_template ?? "Ocen nas w Google: {link}"),
      cust.name, acc.review_link,
    );
    const res = await sendSms(cust.phone, acc.sms_sender_name, msg);
    // reminder_count=1 NIEZALEŻNIE od wyniku — nigdy nie próbujemy drugi raz (anty-spam).
    await db.from("og_review_requests").update({
      reminder_count: 1, ...(res.ok ? {} : { error: `reminder fail: ${res.error}` }),
    }).eq("id", r.id);
    if (res.ok) { report.reminders++; sentTodayCache.set(r.account_id, (sentTodayCache.get(r.account_id) ?? 0) + 1); }
  }

  return json(report);
});
