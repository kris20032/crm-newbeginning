// og-wa-webhook - bot WhatsApp (Moduł 3). Jeden numer firmowy, wszyscy klienci.
// Fachowiec NIC nie instaluje: bot to dymek na jego prywatnym WhatsAppie.
//
// GET  = weryfikacja webhooka przez Meta (hub.challenge).
// POST = wiadomości przychodzące:
//   • pierwszy kontakt                → opt-in + powitanie (a numer w tej samej
//     wiadomości NIE ginie - przetwarzamy ją dalej normalnie)
//   • "STOP 600123456" / "wypisz ..." → wypisanie klienta końcowego (opted_out)
//   • wiadomość z numerem telefonu    → kolejka prośby o opinię (Pętla 1)
//   • klik przycisku Akceptuj/Edytuj/Pomiń → decyzja o odpowiedzi (Pętla 2)
//   • tekst w trybie "Edytuj" (TTL 1h) → własna odpowiedź fachowca
//
// Bezpieczeństwo i odporność (po audycie 10.07):
//   - podpis X-Hub-Signature-256 na SUROWYM body, porównanie stałoczasowe,
//     FAIL-CLOSED (brak sekretu = odrzucamy; wyjątek: tryb na sucho),
//   - idempotencja po msg.id (og_wa_processed) - retry Mety nie dubluje akcji,
//   - po poprawnym podpisie ZAWSZE odpowiadamy 200 (błąd w środku nie może
//     wywołać retry-storm i wyłączenia webhooka przez Metę),
//   - konto zawsze rozpoznawane po NUMERZE NADAWCY (nigdy z treści) → izolacja,
//   - przyciski działają tylko na opiniach w statusie decyzyjnym.
import { serviceClient, json, sendWa, waText, waButtons, buttonId, extractPhonePL, normalizePhonePL, parseButtonId, parseStopCommand, queueReviewRequest, timingSafeEqualHex } from "../_shared/util.ts";

const EDIT_TTL_MS = 60 * 60_000; // tryb "Edytuj" wygasa po 1h

async function verifySignature(req: Request, rawBody: string): Promise<boolean> {
  const secret = Deno.env.get("WA_APP_SECRET");
  // FAIL-CLOSED: bez sekretu odrzucamy. Jedyny wyjątek: jawny tryb na sucho
  // (OG_DRY_MODE nieustawione/[!="0"]) ORAZ brak sekretu = lokalne testy.
  if (!secret) return Deno.env.get("OG_DRY_MODE") !== "0";
  const sig = req.headers.get("x-hub-signature-256")?.replace("sha256=", "");
  if (!sig) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqualHex(hex, sig);
}

const POMOC = 'Jestem botem od opinii Google.\n\n• Wyślij mi NUMER TELEFONU swojego klienta po zleceniu - wyślę mu SMS z prośbą o opinię.\n• Gdy pojawi się nowa opinia, przyślę Ci ją z gotową odpowiedzią i przyciskami.\n• Klient nie chce SMS-ów? Napisz: STOP i jego numer.\n\nWażne: wysyłaj tylko numery klientów, którzy zgodzili się na SMS z prośbą o opinię.\n\nTo wszystko - resztą zajmujemy się my.';

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

  // Od tego miejsca ZAWSZE 200 (podpis OK = wiadomość autentyczna; nasz błąd
  // wewnętrzny nie może skłaniać Mety do retry/wyłączenia webhooka).
  let body: Record<string, any>;
  try { body = JSON.parse(rawBody); } catch { return json({ ok: false, error: "bad json" }); }

  const db = serviceClient();
  const handled: string[] = [];

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value?.messages ?? []) {
        try {
          // --- Idempotencja: każdy msg.id przetwarzamy dokładnie raz ---
          if (msg.id) {
            const { error: dupErr } = await db.from("og_wa_processed").insert({ msg_id: msg.id });
            if (dupErr) { handled.push(`${msg.id}: duplikat (retry Mety) - pominięte`); continue; }
          }

          const from = normalizePhonePL(msg.from); // Meta wysyła '48600...' bez plusa
          if (!from) continue;

          // --- Rozpoznaj konto WYŁĄCZNIE po numerze nadawcy (izolacja!) ---
          // .limit(2): wykrywamy też kolizję numeru (dwa konta = błąd konfiguracji).
          const { data: accounts } = await db.from("og_accounts")
            .select("id, business_name, status").eq("wa_number", from).limit(2);
          if ((accounts?.length ?? 0) > 1) {
            handled.push(`${from}: KOLIZJA wa_number (2 konta) - alarm operatora`);
            continue;
          }
          const account = accounts?.[0];
          if (!account) {
            await sendWa(db, from, waText("Nie rozpoznaję tego numeru. Jeśli jesteś naszym klientem, daj znać opiekunowi - podepniemy Cię."));
            handled.push(`${from}: nieznany numer`);
            continue;
          }

          // --- Sesja: opt-in + okno 24h ---
          const now = new Date().toISOString();
          const { data: session } = await db.from("og_wa_sessions")
            .select("account_id, opted_in_at, conversation_state").eq("account_id", account.id).maybeSingle();
          let state: Record<string, string> = {};
          if (!session) {
            await db.from("og_wa_sessions").insert({ account_id: account.id, wa_number: from, opted_in_at: now, last_interaction_at: now });
            await sendWa(db, from, waText(`Cześć! Tu bot opinii dla ${account.business_name}. ${POMOC}`));
            handled.push(`${from}: opt-in`);
            // NIE robimy continue: jeśli pierwsza wiadomość zawiera już numer
            // klienta, przetwarzamy ją normalnie (audyt wa-webhook-7).
          } else {
            await db.from("og_wa_sessions").update({ last_interaction_at: now }).eq("account_id", account.id);
            state = (session.conversation_state ?? {}) as Record<string, string>;
          }

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
            // Stary klik nie może ruszyć opinii już opublikowanej (audyt wa-webhook-4).
            const DECYZYJNE = ["new", "draft_sent", "notify_failed", "accepted", "edited", "skipped"];
            if (!DECYZYJNE.includes(review.status)) {
              await sendWa(db, from, waText("Ta opinia ma już opublikowaną odpowiedź - nic nie zmieniam."));
              handled.push(`${from}: klik na ${review.status} - odrzucone`);
              continue;
            }
            if (parsed.action === "accept") {
              await db.from("og_reviews").update({ status: "accepted", final_reply: review.ai_reply_draft }).eq("id", review.id).in("status", DECYZYJNE);
              await sendWa(db, from, waText("Przyjęte ✔ Odpowiedź pójdzie na Google przy najbliższej publikacji."));
            } else if (parsed.action === "skip") {
              await db.from("og_reviews").update({ status: "skipped" }).eq("id", review.id).in("status", DECYZYJNE);
              await sendWa(db, from, waText("OK, zostawiamy tę opinię bez odpowiedzi."));
            } else if (parsed.action === "edit") {
              await db.from("og_wa_sessions").update({ conversation_state: { awaiting_reply_for: review.id, awaiting_since: now } }).eq("account_id", account.id);
              await sendWa(db, from, waText("Napisz swoją wersję odpowiedzi (jedna wiadomość) - wyślę ją zamiast propozycji."));
            }
            handled.push(`${from}: ${parsed.action} ${review.id}`);
            continue;
          }

          // --- Tekst ---
          if (msg.type === "text") {
            const text = String(msg.text?.body ?? "").trim();

            // Tryb "Edytuj" z TTL: po godzinie tekst wraca do normalnej ścieżki.
            if (state.awaiting_reply_for) {
              const fresh = state.awaiting_since && (Date.now() - new Date(state.awaiting_since).getTime() < EDIT_TTL_MS);
              await db.from("og_wa_sessions").update({ conversation_state: {} }).eq("account_id", account.id);
              if (fresh) {
                const { data: review } = await db.from("og_reviews")
                  .select("id").eq("id", state.awaiting_reply_for).eq("account_id", account.id).maybeSingle();
                if (review && text) {
                  await db.from("og_reviews").update({ status: "edited", final_reply: text.slice(0, 1000) }).eq("id", review.id);
                  await sendWa(db, from, waText("Zapisane ✔ Twoja wersja pójdzie na Google przy najbliższej publikacji."));
                } else {
                  await sendWa(db, from, waText("Nie udało się zapisać - spróbuj jeszcze raz klikając Edytuj przy opinii."));
                }
                handled.push(`${from}: edited ${state.awaiting_reply_for}`);
                continue;
              }
              // wygasło -> lecimy dalej zwykłą ścieżką (STOP/numer/pomoc)
              handled.push(`${from}: tryb Edytuj wygasł`);
            }

            // STOP: fachowiec wypisuje swojego klienta (jedyna ścieżka opt-out w MVP).
            const stop = parseStopCommand(text);
            if (stop) {
              const { data: updated } = await db.from("og_customers")
                .update({ opted_out: true })
                .eq("account_id", account.id).eq("phone", stop.phone)
                .select("id");
              if (updated && updated.length > 0) {
                // Anuluj też zaplanowane prośby do tego numeru.
                await db.from("og_review_requests")
                  .update({ status: "opted_out", error: "STOP zgłoszony botem" })
                  .eq("account_id", account.id)
                  .in("status", ["queued", "scheduled"])
                  .in("customer_id", updated.map((u: Record<string, string>) => u.id));
                await sendWa(db, from, waText(`Zrobione ✔ Numer ${stop.phone} wypisany - nie dostanie już żadnych SMS-ów.`));
              } else {
                // Nieznany numer: tworzymy wpis z opted_out=true (żeby przyszłe
                // dodanie tego numeru też było zablokowane).
                await db.from("og_customers").upsert(
                  { account_id: account.id, phone: stop.phone, opted_out: true },
                  { onConflict: "account_id,phone" },
                );
                await sendWa(db, from, waText(`OK ✔ Numer ${stop.phone} zapisany jako wypisany - nie wyślemy mu SMS-ów.`));
              }
              handled.push(`${from}: STOP ${stop.phone}`);
              continue;
            }

            // Numer telefonu klienta → Pętla 1.
            const phone = extractPhonePL(text);
            if (phone) {
              // Imię: wszystko poza numerem (np. "Jan 600123456") - opcjonalne.
              const name = text.replace(/(?:\+?48[\s-]?)?(?:\d[\s-]?){9}/g, "").replace(/[,;:.-]/g, " ").trim() || null;
              const result = await queueReviewRequest(db, account.id, phone, name);
              if (result.queued) {
                const kiedy = new Date(result.scheduled_at!).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
                await sendWa(db, from, waText(`Gotowe ✔ SMS z prośbą o opinię do ${phone} pójdzie ${kiedy} (dobra pora = lepsza skuteczność).`));
              } else {
                await sendWa(db, from, waText(`Nie wysłano: ${result.reason}`));
              }
              handled.push(`${from}: queue ${phone} -> ${result.queued}`);
              continue;
            }

            // Fachowiec odpisał (np. na template "masz nową opinię") = okno 24h
            // otwarte -> doślij zaległe opinie z przyciskami OD RAZU (nie czekaj
            // na następny cron og-monitor).
            const { data: pending } = await db.from("og_reviews")
              .select("id, author_name, rating, text, ai_reply_draft")
              .eq("account_id", account.id).eq("status", "notify_failed")
              .not("ai_reply_draft", "is", null).limit(3);
            if (pending && pending.length > 0) {
              for (const p of pending) {
                const stars = "★".repeat(p.rating ?? 0) + "☆".repeat(Math.max(0, 5 - (p.rating ?? 0)));
                const bodyTxt = `Nowa opinia ${stars}\nod: ${p.author_name ?? "klient"}\n\n„${(p.text ?? "(bez tekstu)").slice(0, 400)}"\n\nProponowana odpowiedź:\n„${p.ai_reply_draft}"`;
                const res = await sendWa(db, from, waButtons(bodyTxt, [
                  { id: buttonId("accept", p.id), title: "Akceptuj" },
                  { id: buttonId("edit", p.id), title: "Edytuj" },
                  { id: buttonId("skip", p.id), title: "Pomiń" },
                ]));
                if (res.ok) await db.from("og_reviews").update({ status: "draft_sent" }).eq("id", p.id).eq("status", "notify_failed");
              }
              handled.push(`${from}: dosłano ${pending.length} zaległych opinii`);
              continue;
            }

            // Cokolwiek innego → pomoc.
            await sendWa(db, from, waText(POMOC));
            handled.push(`${from}: pomoc`);
          }
        } catch (e) {
          // Błąd jednej wiadomości nie może wywalić batcha ani zwrócić 5xx.
          handled.push(`błąd: ${(e as Error).message}`);
        }
      }
    }
  }

  return json({ ok: true, handled });
});
