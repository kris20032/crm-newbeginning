// og-onboard — zakładanie konta fachowca (WYWOŁUJE TYLKO OPERATOR, nie klient).
// Dwustopniowo, żeby nie podpiąć złej firmy (ryzyko z blueprintu):
//   1) { query: "Hydraulika JB Rzeszów" }            → lista kandydatów (nazwa+adres+place_id)
//   2) { confirm: {...dane konta, place_id} }        → tworzy og_accounts + review_link
// Autoryzacja: nagłówek x-og-service-key (sekret OG_SERVICE_KEY).
import { serviceClient, json, requireServiceKey, placesSearchText, reviewLink, normalizePhonePL } from "../_shared/util.ts";

Deno.serve(async (req) => {
  const denied = requireServiceKey(req);
  if (denied) return denied;
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "bad json" }, 400);

  // Krok 1: szukanie wizytówki → kandydaci do ręcznego potwierdzenia.
  if (body.query) {
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
  }

  // Krok 2: potwierdzenie → założenie konta.
  if (body.confirm) {
    const c = body.confirm;
    for (const f of ["business_name", "place_id"]) {
      if (!c[f]) return json({ error: `brak pola ${f}` }, 400);
    }
    const wa = c.wa_number ? normalizePhonePL(String(c.wa_number)) : null;
    if (c.wa_number && !wa) return json({ error: "wa_number nie wygląda na polski numer" }, 400);

    const db = serviceClient();
    const { data, error } = await db.from("og_accounts").insert({
      business_name: c.business_name,
      city: c.city ?? null,
      place_id: c.place_id,
      review_link: reviewLink(c.place_id),
      wa_number: wa,
      sms_sender_name: c.sms_sender_name ?? null, // rejestrację nadawcy w SMSAPI robimy operacyjnie
      plan_price: c.plan_price ?? null,
      timezone: c.timezone ?? "Europe/Warsaw",
    }).select("id, business_name, place_id, review_link").single();
    if (error) return json({ error: error.message }, 500);
    return json({ created: data });
  }

  return json({ error: "podaj query (krok 1) albo confirm (krok 2)" }, 400);
});
