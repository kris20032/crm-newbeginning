// ============================================================
//  Edge Function: umowa-generuj — przyjmuje formularz umowy z karty klienta
//
//  Robi dwie rzeczy i nic więcej:
//    1. zapisuje wiersz w tabeli contracts — KLUCZEM ZALOGOWANEGO, więc to
//       baza (RLS z schema-umowy.sql) decyduje, czy wolno mu tworzyć umowę
//       na tej karcie. Ta funkcja niczego nie „przepuszcza obok" uprawnień;
//    2. budzi automat, który składa PDF (repository_dispatch na prywatne
//       repo Impulseo-pl/newbeginning-automaty).
//
//  DLACZEGO PRZEZ FUNKCJĘ, A NIE PROSTO Z PRZEGLĄDARKI:
//  do zbudzenia automatu potrzebny jest token GitHuba. Token nie może
//  wylądować w statycznej stronie (repo CRM jest publiczne) — więc mieszka
//  jako sekret tutaj, na serwerze.
//
//  DO AUTOMATU LECI TYLKO NUMER UMOWY — żadnych danych klienta. Automat
//  dociąga je sam z bazy kluczem serwisowym. Dzięki temu nazwa firmy, NIP
//  ani kwoty nie trafiają do logów GitHuba.
//
//  API (POST JSON): pola formularza (patrz umowa.js) → { ok: true, id }
//
//  WDROŻENIE (jednorazowo, wymaga Supabase CLI):
//    supabase login
//    supabase link --project-ref zngfubfinbojfgaxdrbf
//    supabase secrets set GH_TOKEN=<token GitHuba z prawem zapisu do repo automatów>
//    supabase functions deploy umowa-generuj
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const REPO_AUTOMATOW = "Impulseo-pl/newbeginning-automaty";

const cors = {
  "Access-Control-Allow-Origin": "https://kris20032.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const WARIANTY = ["rok_zgory", "rok_mies", "polrok_mies"];
const PODPISY = ["krzysztof", "marceli"];

const tekst = (v: unknown) => (typeof v === "string" ? v.trim() : "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Tylko POST" }, 405);

  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Brak zalogowania" }, 401);

  // Klient „w imieniu zalogowanego" — wszystkie zapytania przechodzą przez RLS,
  // dokładnie tak, jakby robił je jego CRM. Zero omijania uprawnień.
  const jako = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${jwt}` } } },
  );

  const { data: { user }, error: authErr } = await jako.auth.getUser();
  if (authErr || !user) return json({ error: "Sesja wygasła — zaloguj się jeszcze raz" }, 401);

  let d: Record<string, unknown>;
  try {
    d = await req.json();
  } catch {
    return json({ error: "Nieczytelne dane formularza" }, 400);
  }

  // ---- sprawdzenie danych (to samo, co formularz, ale tu już nikt tego nie ominie) ----
  const nazwa = tekst(d.klient_nazwa), adres = tekst(d.klient_adres);
  const nip = tekst(d.klient_nip).replace(/[\s-]/g, ""), email = tekst(d.klient_email);
  const clientId = tekst(d.client_id);
  const kwotaStrona = Number(d.kwota_strona), kwotaAbon = Number(d.kwota_abon);

  if (!clientId) return json({ error: "Brak numeru karty klienta" }, 400);
  if (!nazwa || !adres || !email) return json({ error: "Uzupełnij nazwę, adres i e-mail klienta" }, 400);
  if (!/^\d{10}$/.test(nip)) return json({ error: "NIP ma mieć 10 cyfr" }, 400);
  if (!Number.isFinite(kwotaStrona) || kwotaStrona <= 0) return json({ error: "Kwota za stronę musi być większa od zera" }, 400);
  if (!Number.isFinite(kwotaAbon) || kwotaAbon < 0) return json({ error: "Kwota abonamentu jest nieprawidłowa" }, 400);
  if (!WARIANTY.includes(tekst(d.abonament))) return json({ error: "Nieznany wariant abonamentu" }, 400);
  if (!PODPISY.includes(tekst(d.nasz_repr))) return json({ error: "Wybierz, kto podpisuje po naszej stronie" }, 400);

  // imię handlowca — takim samym podpisują się komentarze na karcie
  const { data: me } = await jako.from("team_members").select("name").eq("email", user.email!).maybeSingle();
  if (!me?.name) return json({ error: "Twoje konto nie jest w zespole" }, 403);

  // ---- zapis umowy (RLS sprawdzi uprawnienie i to, czy karta jest jego) ----
  const { data: umowa, error: insErr } = await jako.from("contracts").insert({
    client_id:    clientId,
    created_by:   me.name,
    klient_nazwa: nazwa,
    klient_adres: adres,
    klient_nip:   nip,
    klient_krs:   tekst(d.klient_krs).replace(/[\s-]/g, "") || null,
    klient_email: email,
    klient_repr:  tekst(d.klient_repr) || null,
    kwota_strona: kwotaStrona,
    kwota_abon:   kwotaAbon,
    abonament:    tekst(d.abonament),
    nasz_repr:    tekst(d.nasz_repr),
  }).select("id").single();

  if (insErr) {
    const brakTabeli = insErr.code === "42P01";
    return json({
      error: brakTabeli
        ? "Umowy nie są jeszcze wdrożone w bazie (schema-umowy.sql)"
        : "Nie udało się zapisać umowy: " + insErr.message,
    }, brakTabeli ? 501 : 403);
  }

  // ---- zbudzenie automatu ----
  // Umowa JEST już zapisana. Gdy budzenie padnie, nie kasujemy jej — oznaczamy
  // błąd, żeby handlowiec zobaczył konkret zamiast kręcącego się kółka,
  // a dane dało się użyć ponownie bez wpisywania od zera.
  const ghToken = Deno.env.get("GH_TOKEN");
  const oznaczBlad = async (powod: string) => {
    const adminem = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await adminem.from("contracts").update({ status: "error", error_msg: powod }).eq("id", umowa.id);
  };

  if (!ghToken) {
    await oznaczBlad("Brak sekretu GH_TOKEN — automat składania PDF nie jest podpięty.");
    return json({ ok: true, id: umowa.id, warning: "Umowa zapisana, ale automat nie jest podpięty." });
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${REPO_AUTOMATOW}/dispatches`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ghToken}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      // celowo TYLKO id — dane klienta automat dociąga z bazy, nie z logów GitHuba
      body: JSON.stringify({ event_type: "umowa", client_payload: { id: umowa.id } }),
    });
    if (!res.ok) {
      const tresc = await res.text();
      await oznaczBlad(`GitHub odmówił (${res.status}): ${tresc.slice(0, 200)}`);
      return json({ ok: true, id: umowa.id, warning: "Umowa zapisana, automatu nie udało się zbudzić." });
    }
  } catch (e) {
    await oznaczBlad("Nie udało się połączyć z automatem: " + String(e));
    return json({ ok: true, id: umowa.id, warning: "Umowa zapisana, automatu nie udało się zbudzić." });
  }

  return json({ ok: true, id: umowa.id });
});
