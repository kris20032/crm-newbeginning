// Wspólne narzędzia Edge Functions produktu Opinie Google (Deno / Supabase).
// Sekrety WYŁĄCZNIE przez env (Supabase secrets) — nigdy w kodzie/repo.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export function serviceClient(): SupabaseClient {
  // service_role — omija RLS. TYLKO tutaj, po stronie serwera.
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Autoryzacja wywołań operatorskich/cronowych: nagłówek x-og-service-key
// musi równać się sekretowi OG_SERVICE_KEY. (Cron pg_net i my; nie front.)
export function requireServiceKey(req: Request): Response | null {
  const key = req.headers.get("x-og-service-key");
  if (!key || key !== Deno.env.get("OG_SERVICE_KEY")) {
    return json({ error: "unauthorized" }, 401);
  }
  return null;
}

// ------------------------------------------------------------
// SILNIK TIMINGU (blueprint: nie „od razu", nie losowo)
// Reguła: prośba ~3h po zleceniu, jeśli wypada w oknie 9:00-21:00 czasu
// lokalnego fachowca; inaczej przesuwamy do najbliższego takiego okna.
// Dodatkowo lekki jitter (0-20 min), żeby wysyłki nie szły „równo".
// ------------------------------------------------------------
export function hourInTz(d: Date, tz: string): number {
  return parseInt(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: tz })
      .format(d),
    10,
  );
}

export function computeScheduledAt(tz: string, from: Date = new Date()): Date {
  const jitterMs = Math.floor(Math.random() * 20 * 60_000);
  let t = new Date(from.getTime() + 3 * 3600_000 + jitterMs);
  // Przesuwaj po 15 min aż trafisz w okno 9-21 lokalnie (max ~13h pętli).
  for (let i = 0; i < 96; i++) {
    const h = hourInTz(t, tz);
    if (h >= 9 && h < 21) return t;
    t = new Date(t.getTime() + 15 * 60_000);
  }
  return t; // teoretycznie nieosiągalne
}

// ------------------------------------------------------------
// SMSAPI.pl — wysyłka pojedynczego SMS-a.
// Nadawca (from) musi być wcześniej zarejestrowany w panelu SMSAPI.
// SMS_TEST_MODE=1 → tryb testowy SMSAPI (nie wysyła, nie kosztuje).
// ------------------------------------------------------------
export async function sendSms(to: string, from: string, message: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const params = new URLSearchParams({
    to,
    from,
    message,
    format: "json",
    encoding: "utf-8",
  });
  if (Deno.env.get("SMS_TEST_MODE") === "1") params.set("test", "1");
  const res = await fetch("https://api.smsapi.pl/sms.do", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("SMSAPI_TOKEN")}` },
    body: params,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.error) {
    return { ok: false, error: data?.message ?? `HTTP ${res.status}` };
  }
  return { ok: true, id: data.list?.[0]?.id ?? null };
}

// ------------------------------------------------------------
// Google Places API (New)
// ------------------------------------------------------------
const PLACES_KEY = () => Deno.env.get("GOOGLE_PLACES_KEY")!;

export async function placesSearchText(query: string) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": PLACES_KEY(),
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount",
    },
    body: JSON.stringify({ textQuery: query, languageCode: "pl", regionCode: "PL" }),
  });
  if (!res.ok) throw new Error(`Places searchText HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()).places ?? [];
}

export async function placesDetails(placeId: string, fields = "rating,userRatingCount") {
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    { headers: { "X-Goog-Api-Key": PLACES_KEY(), "X-Goog-FieldMask": fields } },
  );
  if (!res.ok) throw new Error(`Places details HTTP ${res.status}: ${await res.text()}`);
  return await res.json();
}

export const reviewLink = (placeId: string) =>
  `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;

// Normalizacja polskiego numeru do E.164 (+48...). Zwraca null gdy nie wygląda na numer.
export function normalizePhonePL(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  if (/^\+48\d{9}$/.test(digits)) return digits;
  if (/^48\d{9}$/.test(digits)) return `+${digits}`;
  if (/^\d{9}$/.test(digits)) return `+48${digits}`;
  return null;
}
