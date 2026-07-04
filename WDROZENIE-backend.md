# RUNBOOK — wdrożenie backendu Supabase (CRM New Beginning)

> Procedura krok po kroku do wykonania **przez Krzysztofa** (Claude nie ma dostępu do bazy).
> Projekt Supabase: `zngfubfinbojfgaxdrbf`. Wszystko wklejasz w **Supabase → SQL Editor** (albo CLI — patrz Faza 3).
> Zasada: po każdej fazie jest **PUNKT KONTROLNY** — nie idź dalej, dopóki się nie zgadza. Każda faza ma **ROLLBACK**.

---

## ⚠️ Zanim zaczniesz — przeczytaj

1. **Kolejność jest sztywna:** backup → warunki wstępne → Faza 1 (część A) → Faza 2 (usługi) → Faza 3 (Edge Function) → **decyzja o froncie** → Faza 4 (część B) → Faza 5 (hardening panelu).
2. **Faza 4 (część B) zmienia zachowanie bazy NATYCHMIAST, też dla starego frontu z `main`.** Trigger bramek lejka (`clients_guard`) zakłada **nowy front (v92)**. Jeśli zespół pracuje na starym froncie z `main`, a wdrożysz trigger — **dostaną błędy z bazy przy ruchach lejka**. Dlatego przed Fazą 4 jest wyraźna decyzja (patrz niżej).
3. **Fazy 1–3 są bezpieczne i niezależne od frontu** — można je wykonać kiedykolwiek, nie psują starego frontu. Faza 4 to ta „ostra".

---

## FAZA 0 — Backup + warunki wstępne (OBOWIĄZKOWE)

### 0a. Świeży backup
- Supabase → **Database → Backups**. Na planie Pro jest PITR/daily — potwierdź, że backup z dziś istnieje. Jeśli masz wątpliwości, zrób ręczny zrzut: **Database → Backups → „Create backup"** (lub `pg_dump` przez connection string z Settings → Database).
- **Nie idź dalej bez potwierdzonego backupu.** Fazy 1–3 są odwracalne, ale Faza 4 dotyka żywych danych zespołu.

### 0b. Sprawdź team_members (kluczowe dla Fazy 4 — izolacja działa po IMIENIU)
Wklej w SQL Editor:
```sql
-- 1) Czy każdy handlowiec ma wiersz z imieniem = temu, co karty mają w owner/opiekun?
select name, email, role, active from public.team_members order by name;

-- 2) Duplikaty imion (Faza 4 założy UNIKALNY indeks — duplikaty ją wywalą):
select lower(name) as imie, count(*) from public.team_members group by lower(name) having count(*) > 1;

-- 3) „Sieroty" — właściciele kart, których NIE ma w team_members (po Fazie 4 ich kart nikt nie zobaczy, dopóki nie dodasz wiersza):
select distinct owner from public.clients where owner is not null
  and lower(owner) not in (select lower(name) from public.team_members);
```
**PUNKT KONTROLNY 0:** zapytanie (2) zwraca **0 wierszy** (brak duplikatów). Zapytanie (3) zwraca **0 wierszy** (każdy właściciel jest w zespole). Jeśli nie — najpierw ujednolić imiona / dodać brakujące wiersze, **potem** dalej.

---

## FAZA 1 — Część A (bezpieczna, addytywna)

Plik: **`schema-rbac.sql`**. Dodaje kolumny (`services`, `partner_since`, `checklist`), tabele ról/uprawnień, funkcje, strażnika `team_members`, uprawnienia (w tym `partners.revoke`, `stages.realizacja`). **Nie zmienia żadnej istniejącej polityki RLS** — stary front działa dalej jak dotąd.

1. Otwórz `schema-rbac.sql`, skopiuj **całość**, wklej w SQL Editor, **Run**.
2. Idempotentny — jak przejdzie bez błędu, jest OK. Można puścić wielokrotnie.

**PUNKT KONTROLNY 1:**
```sql
select to_regprocedure('public.authorize(text)') is not null as ma_authorize,
       to_regprocedure('public.my_name()')       is not null as ma_my_name;
select column_name from information_schema.columns
  where table_name='clients' and column_name in ('services','partner_since','checklist');
select email, role from public.team_members where role='admin' order by email;
```
Oczekiwane: obie funkcje = `true`, trzy kolumny obecne, Krzysztof i Marceli mają `role='admin'` (jeśli mają wiersze — bootstrap adminów w części A to UPDATE, nie doda brakujących).

**ROLLBACK Fazy 1:** sekcja „JAK COFNĄĆ" w nagłówku `schema-rbac.sql` (drop trigger/funkcje/tabele/kolumny w podanej kolejności). Uwaga: drop kolumn `services`/`partner_since`/`checklist` kasuje zapisane dane — rób tylko, jeśli naprawdę cofasz całość.

---

## FAZA 2 — Katalog usług

Plik: **`schema-uslugi.sql`**. Tabela `service_catalog` + RLS (odczyt: zalogowani, zapis: `services.manage`/admin) + seed (strona, obsługa). Bezpieczny/addytywny, wymaga Fazy 1 (sam się zatrzyma, jeśli brak).

1. Skopiuj całość `schema-uslugi.sql`, wklej, **Run**.

**PUNKT KONTROLNY 2:**
```sql
select key, label, visible from public.service_catalog order by ord;
```
Oczekiwane: co najmniej `strona` i `obsluga`.

**ROLLBACK Fazy 2:** `drop table if exists public.service_catalog;` (kasuje katalog; karty z zapisanymi usługami działają dalej w trybie zgodności frontu).

---

## FAZA 3 — Edge Function `admin-users` (zakładanie/blokowanie kont z panelu)

Potrzebny **Supabase CLI** (nie ma go teraz na maszynie). Instalacja + deploy:
```bash
brew install supabase/tap/supabase      # instalacja CLI (macOS)
supabase login                          # otworzy przeglądarkę — zaloguj się
supabase link --project-ref zngfubfinbojfgaxdrbf
supabase functions deploy admin-users
```
`SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY` Supabase wstrzykuje automatycznie — nic nie konfigurujesz.

> W tej sesji możesz odpalić instalację/logowanie u siebie, wpisując `! brew install supabase/tap/supabase` itd. w polu promptu (prefiks `!`).

**PUNKT KONTROLNY 3:** w panelu admina (nowy front) → Użytkownicy → spróbuj zresetować hasło albo dodać testowe konto. Bez deployu akcje pokazują toast z instrukcją; po deployu działają. Reset hasła działa od razu (nie wymaga EF).

**ROLLBACK Fazy 3:** `supabase functions delete admin-users` (panel wraca do trybu „pokaż instrukcję").

---

## DECYZJA PRZED FAZĄ 4 — front

Faza 4 (część B) z triggerem bramek zakłada **nowy front v92**. Wybierz:

- **Wariant PEŁNY (front v92 na żywo):** najpierw zmerguj `feat/lejek-realizacja` → `main` (front v92 rusza dla całego zespołu), **potem** wykonaj Fazę 4. Wszystko spójne — bramki, token, checklista działają w UI i w bazie. To „idziemy na żywo z całością".
  - Merge robi Krzysztof: przejrzyj PR/diff, `git checkout main && git merge feat/lejek-realizacja && git push origin main` (GitHub Pages sam się odświeży). Podbita wersja cache (`?v=92`) wymusi świeży front u zespołu.

- **Wariant IZOLACJA (zostajemy na starym froncie):** wykonaj Fazę 4 **BEZ triggera bramek** — czyli z `schema-rbac-enforce.sql`, z którego **pominiesz sekcję „STRAŻNIK CLIENTS"** (trigger `clients_guard` + `stage_rank`). Reszta (polityki RLS izolacji własności + unikalność imion + zaostrzony strażnik team_members) domyka najpilniejszą dziurę „każdy widzi wszystko" i **nie psuje starego lejka**. Trigger bramek dołożysz później, razem z mergem nowego frontu.
  - Konkretnie: w `schema-rbac-enforce.sql` wykonaj plik, ale **nie kopiuj** bloku od `-- STRAŻNIK CLIENTS` do `create trigger trg_clients_guard ...` (zostaw resztę: polityki clients/comments/demo/team + indeks imion + `team_members_guard`).

---

## FAZA 4 — Część B (OSTRA — egzekwowanie)

Plik: **`schema-rbac-enforce.sql`**. Podmienia polityki `using(true)` na izolację po własności; dokłada trigger bramek (w wariancie PEŁNYM). Sam plik ma bezpiecznik na starcie (zatrzyma się bez Fazy 1).

**Skutki dla zwykłego sprzedawcy natychmiast:** widzi TYLKO swoje karty (owner/opiekun), cudzej nie zapisze (0 wierszy, bez błędu), nie przeciągnie cudzej. Osoba robiąca dema na cudzych kartach potrzebuje uprawnienia `clients.edit_all` (nadaj w matrycy panelu).

1. (Wariant wybrany wyżej) skopiuj `schema-rbac-enforce.sql` — całość albo bez sekcji STRAŻNIK CLIENTS — wklej, **Run**.

**PUNKT KONTROLNY 4** (zrób na DRUGIM koncie — testowy sprzedawca, nie admin):
- Zaloguj się jako sprzedawca → widzisz **tylko swoje** karty (nie całego zespołu).
- Spróbuj (stary lub nowy front) otworzyć/edytować cudzą kartę → zapis nie przechodzi.
- Jako admin (Krzysztof) → widzisz wszystko, panel admina działa.
- (Wariant PEŁNY) sprzedawca przeciąga kartę na „Umowa wysłana" bez usługi → baza odrzuca; z usługą → przechodzi; próg „Umowa podpisana" tylko przez „Nadaj token".
SQL kontrolny:
```sql
-- czy trigger bramek istnieje (tylko wariant PEŁNY):
select tgname from pg_trigger where tgrelid='public.clients'::regclass and not tgisinternal;
-- czy indeks unikalny imion powstał:
select indexname from pg_indexes where tablename='team_members' and indexname='uq_team_members_name_ci';
```

**ROLLBACK Fazy 4 (NAJWAŻNIEJSZY — miej pod ręką):** na końcu `schema-rbac-enforce.sql` jest zakomentowana sekcja `-- ROLLBACK`. Odkomentuj **całość** i uruchom — przywraca stare, otwarte polityki `using(true)` (stan sprzed egzekwowania) oraz zdejmuje trigger bramek. Indeks imion i zaostrzony strażnik zostają (nieszkodliwe). Po tym zespół wraca do „każdy widzi wszystko" — czyli jak dziś.

---

## FAZA 5 — Hardening panelu Supabase (standardy branżowe — poza kodem)

Do odklikania w dashboardzie (Claude nie ma jak tego zrobić ani sprawdzić):
- [ ] **Auth → Providers → Email → „Allow new users to sign up" = OFF** (KRYTYCZNE — inaczej ktoś obcy założy konto przez publiczny klucz i wejdzie jako sprzedawca).
- [ ] **Auth → Passwords:** leaked password protection (HaveIBeenPwned) = ON; min. długość ≥ 8 (zgraj z Edge Function).
- [ ] **MFA/TOTP** włączone i wymuszone dla kont admin (Krzysztof, Marceli).
- [ ] **Rate limits** Auth (logowanie, maile resetu) — ustaw rozsądne progi.
- [ ] **Backupy/PITR** potwierdzone + **alert na egress** (refetch przy dużej skali potrafi zjeść limit — patrz niżej).
- [ ] Potwierdź, że **RLS jest ON na WSZYSTKICH** tabelach: clients, comments, team_members, demo_requests, roles, permissions, role_permissions, service_catalog (w SQL wszystkie mają `enable row level security` — sprawdź w Table Editor, że żadna nie świeci „RLS disabled").
- [ ] Potwierdź, że **`service_role` key** nie wyciekł do repo/gita (w kodzie jest tylko publishable/anon — OK).
- [ ] (kod) Zawęź **CORS Edge Function** z `*` do origin GitHub Pages.

---

## Po wdrożeniu — pamiętaj o skali

Izolacja i egzekwowanie to jedno; **wydajność przy 20×1000 to osobny temat** (patrz audyt w rozmowie): dla ról z widokiem całości architektura „załaduj wszystko + przeładuj przy każdej zmianie" wymaga przebudowy (punktowy realtime z payloadu + leniwe ładowanie komentarzy + limit/paginacja klientów). To NIE blokuje wdrożenia bezpieczeństwa, ale zaplanuj przed realnym obciążeniem produkcyjnym. Sprzedawcy (RLS tnie im dane) działają OK od razu.

---

## Skrót kolejności (do wydruku)

```
0. Backup + sprawdź team_members (0 duplikatów, 0 sierot)
1. schema-rbac.sql            → PUNKT KONTROLNY 1
2. schema-uslugi.sql          → PUNKT KONTROLNY 2
3. supabase functions deploy admin-users → PUNKT KONTROLNY 3
   >>> DECYZJA: merge front v92 do main (wariant PEŁNY) albo zostań na starym (wariant IZOLACJA) <<<
4. schema-rbac-enforce.sql    → PUNKT KONTROLNY 4   (ROLLBACK na końcu pliku!)
5. Hardening panelu (rejestracja OFF, MFA, hasła, backup, CORS)
```
