// og-onboard - zakładanie konta fachowca (WYWOŁUJE TYLKO OPERATOR, nie klient).
// Dwustopniowo, żeby nie podpiąć złej firmy (ryzyko z blueprintu):
//   1) { query: "Hydraulika JB Rzeszów" }            → lista kandydatów (nazwa+adres+place_id)
//   2) { confirm: {...dane konta, place_id} }        → tworzy og_accounts + review_link
// Autoryzacja: nagłówek x-og-service-key (sekret OG_SERVICE_KEY).
import { serviceClient, json, requireServiceKey, placesSearchText, reviewLink, normalizePhonePL } from "../_shared/util.ts";

// Zła strefa czasowa = zatruty rekord (RangeError w Intl przy każdej wysyłce).
function validTimezone(tz: string): boolean {
  try { new Intl.DateTimeFormat("en-GB", { timeZone: tz }); return true; } catch { return false; }
}

Deno.serve(async (req) => {
  const denied = requireServiceKey(req);
  if (denied) return denied;
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "bad json" }, 400);

  // Krok 1: szukanie wizytówki → kandydaci do ręcznego potwierdzenia.
  if (body.query) {
    try {
      const places = await placesSearchText(String(body.query));
      return json({
        candidates: places.slice(0, 5).map((p: Record<string, any>) => ({
          place_id: p.id,
          name: p.displayName?.text,
          address: p.formattedAddress,
          rating: p.rating ?? null,
          review_count: p.userRatingCount ?? null,
        })),
      });
    } catch (e) {
      // Quota/awaria Places → czytelny błąd zamiast gołego 500.
      return json({ error: `Places niedostępne: ${(e as Error).message}` }, 502);
    }
  }

  // Krok 2: potwierdzenie → założenie konta.
  if (body.confirm) {
    const c = body.confirm;
    for (const f of ["business_name", "place_id"]) {
      if (!c[f]) return json({ error: `brak pola ${f}` }, 400);
    }
    const wa = c.wa_number ? normalizePhonePL(String(c.wa_number)) : null;
    if (c.wa_number && !wa) return json({ error: "wa_number nie wygląda na polski numer" }, 400);
    const tz = c.timezone ?? "Europe/Warsaw";
    if (!validTimezone(tz)) return json({ error: `nieznana strefa czasowa: ${tz}` }, 400);

    const db = serviceClient();
    const { data, error } = await db.from("og_accounts").insert({
      business_name: c.business_name,
      city: c.city ?? null,
      place_id: c.place_id,
      review_link: reviewLink(c.place_id),
      wa_number: wa,
      sms_sender_name: c.sms_sender_name ?? null, // rejestrację nadawcy w SMSAPI robimy operacyjnie
      plan_price: c.plan_price ?? null,
      timezone: tz,
    }).select("id, business_name, place_id, review_link").single();
    if (error) {
      // Unikalny indeks wa_number (006): kolizja = czytelny komunikat.
      if (error.message.includes("og_accounts_wa_number_uq")) {
        return json({ error: `numer WhatsApp ${wa} jest już przypisany do innego konta` }, 409);
      }
      return json({ error: error.message }, 500);
    }
    return json({ created: data });
  }

  return json({ error: "podaj query (krok 1) albo confirm (krok 2)" }, 400);
});
