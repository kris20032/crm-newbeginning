// ============================================================
//  Edge Function: admin-users — zarządzanie kontami i rolami zespołu (RBAC)
//
//  Zakłada / dezaktywuje / reaktywuje / usuwa KONTA LOGOWANIA (Supabase Auth)
//  i ustawia role w team_members. Wymaga klucza service_role — dlatego działa
//  tu, na serwerze, a NIE w statycznym kliencie (service_role = pełny dostęp
//  do bazy; NIGDY nie trafia do przeglądarki).
//
//  AUTORYZACJA WOŁAJĄCEGO: wiersz w team_members (najpierw po user_id,
//  awaryjnie po e-mailu) z role='admin' ORAZ active=true. Gdy baza nie
//  przeszła jeszcze migracji RBAC (schema-rbac.sql; brak kolumny role) albo
//  wołający nie ma wiersza w team_members → awaryjny bootstrap: dopuszczamy
//  wyłącznie e-maile z BOOTSTRAP_ADMIN_EMAILS.
//
//  API (POST JSON):
//    { action: "create",     email, name, password, role }  → { ok, user_id }
//    { action: "deactivate", user_id | email }              → { ok, active: false }   (ban logowania + active=false)
//    { action: "reactivate", user_id | email }              → { ok, active: true }
//    { action: "remove",     user_id | email }              → { ok, removed_auth }    (karty klientów ZOSTAJĄ — owner to tekst)
//    { action: "set_role",   user_id | email, role }        → { ok, role }
//
//  WDROŻENIE (jednorazowo, ~5 min; wymaga Supabase CLI):
//    supabase login
//    supabase link --project-ref zngfubfinbojfgaxdrbf
//    supabase functions deploy admin-users
//  SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY Supabase wstrzykuje do funkcji
//  automatycznie — nie trzeba nic konfigurować. Klient woła ją pod
//  <SUPABASE_URL>/functions/v1/admin-users z nagłówkiem Authorization:
//  Bearer <jwt zalogowanego>. CORS włączony (front na GitHub Pages).
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Awaryjna lista adminów (bootstrap) — używana TYLKO, gdy w team_members nie ma
// wiersza wołającego albo baza jest sprzed migracji RBAC. Po wdrożeniu RBAC
// prawda mieszka w team_members.role — tu nic nie trzeba dopisywać.
const BOOTSTRAP_ADMIN_EMAILS = new Set([
  "krzychu.brzezi@gmail.com",
  "kozakiewicz.marceli@gmail.com",
]);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// „baza sprzed RBAC"? — 42703 = brak kolumny (role/active/user_id), 42P01 = brak tabeli (roles)
// deno-lint-ignore no-explicit-any
const isPreRbac = (error: any) => !!error && (error.code === "42703" || error.code === "42P01");

// e-mail do filtra .ilike() — % i _ to wildcardy, wyescapuj je
// (ilike bez wildcardów = porównanie bez rozróżniania wielkości liter)
const escLike = (s: string) => s.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");

// deno-lint-ignore no-explicit-any
type Db = any; // klient supabase-js z kluczem service_role

// ------------------------------------------------------------
//  Autoryzacja wołającego: admin wg team_members, z bootstrapem awaryjnym
// ------------------------------------------------------------
async function callerIsAdmin(db: Db, user: { id: string; email?: string | null }): Promise<boolean> {
  const email = (user.email || "").toLowerCase();

  // 1) docelowe mapowanie: po user_id
  const byId = await db.from("team_members").select("role, active").eq("user_id", user.id).limit(1);
  if (isPreRbac(byId.error)) return BOOTSTRAP_ADMIN_EMAILS.has(email); // baza sprzed RBAC
  if (byId.error) throw new Error(byId.error.message);
  let row = (byId.data || [])[0];

  // 2) awaryjnie po e-mailu (konta sprzed RBAC nie mają jeszcze user_id)
  if (!row && email) {
    const byMail = await db.from("team_members").select("role, active").ilike("email", escLike(email)).limit(1);
    if (isPreRbac(byMail.error)) return BOOTSTRAP_ADMIN_EMAILS.has(email);
    if (byMail.error) throw new Error(byMail.error.message);
    row = (byMail.data || [])[0];
  }

  if (!row) return BOOTSTRAP_ADMIN_EMAILS.has(email); // brak wiersza → tylko bootstrap
  return row.role === "admin" && row.active === true;
}

// ------------------------------------------------------------
//  Cel akcji: { id, email }. user_id ma pierwszeństwo; sam e-mail dociągamy
//  do konta auth przez listUsers (domyślnie do 50 kont — dla naszego zespołu
//  wystarczy; w razie wzrostu: paginacja).
// ------------------------------------------------------------
async function resolveTarget(db: Db, body: Record<string, unknown>): Promise<{ id: string | null; email: string | null }> {
  const id = typeof body.user_id === "string" && body.user_id.trim() ? body.user_id.trim() : null;
  const email = typeof body.email === "string" && body.email.trim() ? body.email.trim().toLowerCase() : null;
  if (id) return { id, email };
  if (!email) return { id: null, email: null };
  const { data, error } = await db.auth.admin.listUsers();
  if (error) throw new Error(error.message);
  // deno-lint-ignore no-explicit-any
  const hit = (data?.users || []).find((u: any) => (u.email || "").toLowerCase() === email);
  return { id: hit?.id ?? null, email };
}

// ------------------------------------------------------------
//  Walidacja roli: klucz musi istnieć w tabeli roles; inaczej fallback
//  (null = brak fallbacku → wołający dostanie błąd). Na bazie sprzed RBAC
//  (brak tabeli roles) też zwracamy fallback.
// ------------------------------------------------------------
async function resolveRole(db: Db, wanted: unknown, fallback: string | null): Promise<string | null> {
  const key = typeof wanted === "string" && wanted.trim() ? wanted.trim() : "";
  if (key) {
    const { data, error } = await db.from("roles").select("key").eq("key", key).limit(1);
    if (error && !isPreRbac(error)) throw new Error(error.message);
    if (!error && data && data.length) return key;
  }
  return fallback;
}

// ------------------------------------------------------------
//  Update wiersza team_members celu: najpierw po user_id, awaryjnie po
//  e-mailu (wtedy przy okazji uzupełnia user_id — samonaprawa mapowania).
//  Na bazie sprzed RBAC pomija po cichu (zwraca preRbac).
// ------------------------------------------------------------
async function updateTeam(
  db: Db,
  target: { id: string | null; email: string | null },
  patch: Record<string, unknown>,
): Promise<{ updated: number; preRbac?: boolean }> {
  if (target.id) {
    const r = await db.from("team_members").update(patch).eq("user_id", target.id).select("id");
    if (isPreRbac(r.error)) return { updated: 0, preRbac: true };
    if (r.error) throw new Error(r.error.message);
    if ((r.data || []).length) return { updated: r.data.length };
  }
  if (target.email) {
    const patch2 = target.id ? { ...patch, user_id: target.id } : patch;
    const r = await db.from("team_members").update(patch2).ilike("email", escLike(target.email)).select("id");
    if (isPreRbac(r.error)) return { updated: 0, preRbac: true };
    if (r.error) throw new Error(r.error.message);
    return { updated: (r.data || []).length };
  }
  return { updated: 0 };
}

// ------------------------------------------------------------
//  Akcje
// ------------------------------------------------------------
async function actionCreate(db: Db, body: Record<string, unknown>): Promise<Response> {
  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || "").trim() || email.split("@")[0];
  const password = String(body.password || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Podaj poprawny adres e-mail." }, 400);
  if (password.length < 8) return json({ error: "Hasło musi mieć min. 8 znaków." }, 400);
  const role = (await resolveRole(db, body.role, "sprzedawca"))!; // nieznana/pusta rola → 'sprzedawca'

  const { data: created, error } = await db.auth.admin.createUser({
    email, password, email_confirm: true, // konto od razu aktywne, bez maila potwierdzającego
  });
  if (error) return json({ error: error.message }, 400);
  const userId = created.user?.id ?? null;

  // wpis w katalogu zespołu — od razu widoczny w CRM, z rolą i mapowaniem uid↔e-mail
  let up = await db.from("team_members").upsert(
    { email, name, role, active: true, user_id: userId },
    { onConflict: "email" },
  );
  if (isPreRbac(up.error)) {
    // baza sprzed RBAC — zapisz chociaż e-mail + imię (jak w starym szkicu)
    up = await db.from("team_members").upsert({ email, name }, { onConflict: "email" });
  }
  if (up.error) return json({ error: `Konto logowania powstało, ale wpis w zespole się nie udał: ${up.error.message}` }, 500);
  return json({ ok: true, user_id: userId });
}

async function actionBan(db: Db, caller: { id: string }, body: Record<string, unknown>, deactivate: boolean): Promise<Response> {
  const target = await resolveTarget(db, body);
  if (!target.id) return json({ error: "Nie znaleziono konta — podaj user_id albo e-mail istniejącego konta." }, 404);
  if (deactivate && target.id === caller.id) return json({ error: "Nie możesz dezaktywować własnego konta." }, 400);

  // blokada logowania: ban na ~10 lat; reaktywacja = zdjęcie bana.
  // Uwaga: już wydany token dostępu działa do wygaśnięcia (~1h) — ale
  // team_members.active=false od razu ucina uprawnienia (authorize() = false).
  const { error } = await db.auth.admin.updateUserById(target.id, { ban_duration: deactivate ? "87600h" : "none" });
  if (error) return json({ error: error.message }, 400);

  await updateTeam(db, target, { active: !deactivate });
  return json({ ok: true, active: !deactivate });
}

async function actionRemove(db: Db, caller: { id: string; email?: string | null }, body: Record<string, unknown>): Promise<Response> {
  const target = await resolveTarget(db, body);
  if (!target.id && !target.email) return json({ error: "Wymagany user_id albo e-mail." }, 400);
  const self = target.id === caller.id ||
    (!!target.email && target.email === (caller.email || "").toLowerCase());
  if (self) return json({ error: "Nie możesz usunąć własnego konta." }, 400);

  // 1) konto logowania (jeśli istnieje)
  let removedAuth = false;
  if (target.id) {
    const { error } = await db.auth.admin.deleteUser(target.id);
    if (error) return json({ error: error.message }, 400);
    removedAuth = true;
  }
  // 2) wpis w zespole — po user_id, awaryjnie po e-mailu.
  //    Karty klientów ZOSTAJĄ — clients.owner to tekst z imieniem, nie FK.
  if (target.id) {
    const r = await db.from("team_members").delete().eq("user_id", target.id);
    if (r.error && !isPreRbac(r.error)) return json({ error: r.error.message }, 500);
  }
  if (target.email) {
    const r = await db.from("team_members").delete().ilike("email", escLike(target.email));
    if (r.error) return json({ error: r.error.message }, 500);
  }
  return json({ ok: true, removed_auth: removedAuth });
}

async function actionSetRole(db: Db, caller: { id: string; email?: string | null }, body: Record<string, unknown>): Promise<Response> {
  const target = await resolveTarget(db, body);
  if (!target.id && !target.email) return json({ error: "Wymagany user_id albo e-mail." }, 400);

  // rola musi istnieć w tabeli roles — tu BEZ fallbacku (cicha podmiana roli
  // na 'sprzedawca' przy literówce byłaby gorsza niż jasny błąd)
  const role = await resolveRole(db, body.role, null);
  if (!role) return json({ error: "Nieznana rola — nie ma jej w tabeli roles." }, 400);

  const self = target.id === caller.id ||
    (!!target.email && target.email === (caller.email || "").toLowerCase());
  if (self && role !== "admin") return json({ error: "Nie możesz odebrać sobie roli administratora." }, 400);

  const r = await updateTeam(db, target, { role });
  if (r.preRbac) return json({ error: "Baza nie ma jeszcze RBAC — najpierw wykonaj schema-rbac.sql." }, 409);
  if (!r.updated) return json({ error: "Nie znaleziono wpisu w zespole dla tego konta." }, 404);
  return json({ ok: true, role });
}

// ------------------------------------------------------------
//  Wejście
// ------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Tylko POST." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!; // wstrzykiwany automatycznie przez Supabase
    const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    // 1) Zweryfikuj wołającego z jego tokena (Authorization: Bearer <jwt zalogowanego>)
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Brak tokena logowania." }, 401);
    const { data: { user }, error: uErr } = await db.auth.getUser(token);
    if (uErr || !user) return json({ error: "Zła lub wygasła sesja." }, 401);

    // 2) Autoryzacja: admin wg team_members (role='admin' AND active=true),
    //    z awaryjnym bootstrapem po e-mailu (baza sprzed RBAC / brak wiersza)
    if (!(await callerIsAdmin(db, user))) return json({ error: "Brak uprawnień administratora." }, 403);

    // 3) Akcja
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Nieprawidłowy JSON w żądaniu." }, 400);
    }
    const action = String(body.action || "");

    if (action === "create")     return await actionCreate(db, body);
    if (action === "deactivate") return await actionBan(db, user, body, true);
    if (action === "reactivate") return await actionBan(db, user, body, false);
    if (action === "remove")     return await actionRemove(db, user, body);
    if (action === "set_role")   return await actionSetRole(db, user, body);
    return json({ error: "Nieznana akcja." }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
