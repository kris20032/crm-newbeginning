// og-wa-webhook — bot WhatsApp (Moduł 3). Jeden numer firmowy, wszyscy klienci.
// Fachowiec NIC nie instaluje: bot to dymek na jego prywatnym WhatsAppie.
//
// GET  = weryfikacja webhooka przez Meta (hub.challenge).
// POST = wiadomości przychodzące:
//   • pierwszy kontakt ("czesc")      → opt-in + powitanie
//   • wiadomość z numerem telefonu    → kolejka prośby o opinię (Pętla 1)
//   • klik przycisku Akceptuj/Edytuj/Pomiń → decyzja o odpowiedzi (Pętla 2)
//   • tekst w trybie "Edytuj"         → własna odpowiedź fachowca
//
// Bezpieczeństwo: podpis X-Hub-Signature-256 (WA_APP_SECRET); konto zawsze
// rozpoznawane po NUMERZE NADAWCY (nigdy z treści) → izolacja między klientami.
import { serviceClient, json, sendWa, waText, extractPhonePL, normalizePhonePL, parseButtonId, queueReviewRequest } from "../_shared/util.ts";

async function verifySignature(req: Request, rawBody: string): Promise<boolean> {
  const secret = Deno.env.get("WA_APP_SECRET");
  if (!secret) return Deno.env.get("OG_DRY_MODE") === "1"; // bez sekretu tylko w trybie na sucho
  const sig = req.headers.get("x-hub-signature-256")?.replace("sha256=", "");
  if (!sig) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === sig;
}

const POMOC = 'Jestem botem od opinii Google.\n\n• Wyślij mi NUMER TELEFONU swojego klienta po zleceniu - wyślę mu SMS z prośbą o opinię.\n• Gdy pojawi się nowa opinia, przyślę Ci ją z gotową odpowiedzią i przyciskami.\n\nTo wszystko - resztą zajmujemy się my.';

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // --- Weryfikacja webhooka (Meta wywołuje raz przy konfiguracji) ---
  if (req.method === "GET") {
    if (url.searchParams.get("hub.mode") === "subscribe" &&
        url.searchParams.get("hub.verify_token") === Deno.env.get("WA_VERIFY_TOKEN")) {
      return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const rawBody = await req.text();
  if (!(await verifySignature(req, rawBody))) return json({ error: "bad signature" }, 401);

  const body = JSON.parse(rawBody);
  const db = serviceClient();
  const handled: string[] = [];

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value?.messages ?? []) {
        const from = normalizePhonePL(msg.from); // Meta wysyła '48600...' bez plusa
        if (!from) continue;

        // --- Rozpoznaj konto WYŁĄCZNIE po numerze nadawcy (izolacja!) ---
        const { data: account } = await db.from("og_accounts")
          .select("id, business_name, status").eq("wa_number", from).maybeSingle();
        if (!account) {
          await sendWa(db, from, waText("Nie rozpoznaję tego numeru. Jeśli jesteś naszym klientem, daj znać opiekunowi - podepniemy Cię."));
          handled.push(`${from}: nieznany numer`);
          continue;
        }

        // --- Sesja: opt-in + okno 24h ---
        const now = new Date().toISOString();
        const { data: session } = await db.from("og_wa_sessions")
          .select("account_id, opted_in_at, conversation_state").eq("account_id", account.id).maybeSingle();
        if (!session) {
          await db.from("og_wa_sessions").insert({ account_id: account.id, wa_number: from, opted_in_at: now, last_interaction_at: now });
          await sendWa(db, from, waText(`Cześć! Tu bot opinii dla ${account.business_name}. ${POMOC}`));
          handled.push(`${from}: opt-in`);
          continue;
        }
        await db.from("og_wa_sessions").update({ last_interaction_at: now }).eq("account_id", account.id);
        const state = (session.conversation_state ?? {}) as Record<string, string>;

        // --- Przycisk: Akceptuj / Edytuj / Pomiń ---
        if (msg.type === "interactive" && msg.interactive?.button_reply) {
          const parsed = parseButtonId(msg.interactive.button_reply.id);
          if (!parsed) { handled.push(`${from}: nieznany przycisk`); continue; }
          // Izolacja: opinia MUSI należeć do konta tego numeru.
          const { data: review } = await db.from("og_reviews")
            .select("id, ai_reply_draft, status").eq("id", parsed.reviewId).eq("account_id", account.id).maybeSingle();
          if (!review) {
            await sendWa(db, from, waText("Nie znajduję tej opinii - możliwe, że już obsłużona."));
            continue;
          }
          if (parsed.action === "accept") {
            await db.from("og_reviews").update({ status: "accepted", final_reply: review.ai_reply_draft }).eq("id", review.id);
            await sendWa(db, from, waText("Przyjęte ✔ Odpowiedź pójdzie na Google przy najbliższej publikacji."));
          } else if (parsed.action === "skip") {
            await db.from("og_reviews").update({ status: "skipped" }).eq("id", review.id);
            await sendWa(db, from, waText("OK, zostawiamy tę opinię bez odpowiedzi."));
          } else if (parsed.action === "edit") {
            await db.from("og_wa_sessions").update({ conversation_state: { awaiting_reply_for: review.id } }).eq("account_id", account.id);
            await sendWa(db, from, waText("Napisz swoją wersję odpowiedzi (jedna wiadomość) - wyślę ją zamiast propozycji."));
          }
          handled.push(`${from}: ${parsed.action} ${review.id}`);
          continue;
        }

        // --- Tekst ---
        if (msg.type === "text") {
          const text = String(msg.text?.body ?? "").trim();

          // Tryb "Edytuj": ta wiadomość = własna odpowiedź fachowca.
          if (state.awaiting_reply_for) {
            const { data: review } = await db.from("og_reviews")
              .select("id").eq("id", state.awaiting_reply_for).eq("account_id", account.id).maybeSingle();
            await db.from("og_wa_sessions").update({ conversation_state: {} }).eq("account_id", account.id);
            if (review && text) {
              await db.from("og_reviews").update({ status: "edited", final_reply: text }).eq("id", review.id);
              await sendWa(db, from, waText("Zapisane ✔ Twoja wersja pójdzie na Google przy najbliższej publikacji."));
            } else {
              await sendWa(db, from, waText("Nie udało się zapisać - spróbuj jeszcze raz klikając Edytuj przy opinii."));
            }
            handled.push(`${from}: edited ${state.awaiting_reply_for}`);
            continue;
          }

          // Numer telefonu klienta → Pętla 1.
          const phone = extractPhonePL(text);
          if (phone) {
            // Imię: wszystko poza numerem (np. "Jan 600123456") — opcjonalne.
            const name = text.replace(/(?:\+?48[\s-]?)?(?:\d[\s-]?){9}/g, "").replace(/[,;:.-]/g, " ").trim() || null;
            const result = await queueReviewRequest(db, account.id, phone, name);
            if (result.queued) {
              const kiedy = new Date(result.scheduled_at!).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
              await sendWa(db, from, waText(`Gotowe ✔ SMS z prośbą o opinię pójdzie ${kiedy} (dobra pora = lepsza skuteczność).`));
            } else {
              await sendWa(db, from, waText(`Nie wysłano: ${result.reason}`));
            }
            handled.push(`${from}: queue ${phone} -> ${result.queued}`);
            continue;
          }

          // Cokolwiek innego → pomoc.
          await sendWa(db, from, waText(POMOC));
          handled.push(`${from}: pomoc`);
        }
      }
    }
  }

  return json({ ok: true, handled });
});
