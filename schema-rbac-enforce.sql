-- ============================================================
--  CRM New Beginning — RBAC, CZĘŚĆ B (OSTRA — EGZEKWOWANIE UPRAWNIEŃ)
--
--  ⚠️⚠️⚠️  STOP — NIE URUCHAMIAĆ „PRZY OKAZJI"  ⚠️⚠️⚠️
--  Ten plik PODMIENIA polityki RLS na clients / comments / team_members /
--  demo_requests i NATYCHMIAST zmienia zachowanie bazy — RÓWNIEŻ dla
--  STAREGO frontu z brancha `main`, którego zespół używa na co dzień!
--  Wykonać DOPIERO przy wdrożeniu, ZA WYRAŹNĄ ZGODĄ KRZYSZTOFA,
--  PO ŚWIEŻYM BACKUPIE bazy.
--
--  WYMAGANIA WSTĘPNE (inaczej plik sam się zatrzyma na starcie):
--   1. Wykonana CZĘŚĆ A (schema-rbac.sql) — muszą istnieć funkcje
--      public.authorize() i public.my_name() oraz kolumny role/active.
--   2. KAŻDY członek zespołu ma wiersz w team_members z poprawnym
--      imieniem (= to, co karty mają w owner/opiekun) — kto nie ma
--      wpisu albo ma active=false, PO TEJ ZMIANIE NIC NIE ZOBACZY.
--
--  CO SIĘ ZMIENIA dla zwykłego sprzedawcy (bez dodatkowych uprawnień):
--   - widzi TYLKO karty, gdzie jest owner albo opiekun (+ ich komentarze);
--   - nową kartę może dodać tylko z owner = własne imię;
--   - cudzej karty nie zapisze (UPDATE po cichu obejmie 0 wierszy — bez
--     błędu!), w tym: nie ustawi demo_url / nie zgasi demo_requested na
--     cudzej karcie po zrobieniu dema (potrzebne clients.edit_all albo
--     bycie ownerem/opiekunem) i nie przeciągnie cudzej karty na tablicy;
--   - przekazanie WŁASNEJ karty innej osobie (zmiana owner na kogoś
--     obcego, gdy nie jest się dalej opiekunem) zostanie ODRZUCONE
--     (with check) — takie ruchy robi osoba z clients.edit_all;
--   - „Usuń trwale" z archiwum wymaga clients.hard_delete (domyślnie
--     tylko admin) — dla innych skasuje 0 wierszy.
--
--  Na końcu pliku jest sekcja ROLLBACK przywracająca stare polityki.
-- ============================================================

begin;

-- Bezpiecznik: bez części A zatrzymaj się TERAZ (transakcja się wycofa),
-- zanim zdążymy skasować stare polityki.
do $$
begin
  if to_regprocedure('public.authorize(text)') is null
     or to_regprocedure('public.my_name()') is null then
    raise exception 'Najpierw wykonaj schema-rbac.sql (część A) — brak funkcji public.authorize()/public.my_name().';
  end if;
end;
$$;

-- ============================================================
--  CLIENTS — widoczność i edycja wg własności (owner/opiekun) + uprawnień.
--  `(select ...)` wokół funkcji = liczone raz na zapytanie, nie per wiersz.
-- ============================================================
drop policy if exists "zespol_odczyt_clients" on clients;   -- stare (schema.sql)
drop policy if exists "zespol_zapis_clients"  on clients;   -- stare (schema.sql)

drop policy if exists "rbac_odczyt_clients" on clients;
create policy "rbac_odczyt_clients" on clients for select to authenticated
  using (
    (select public.authorize('clients.view_all'))
    or owner   = (select public.my_name())
    or opiekun = (select public.my_name())
  );

drop policy if exists "rbac_wstaw_clients" on clients;
create policy "rbac_wstaw_clients" on clients for insert to authenticated
  with check (
    owner = (select public.my_name())
    or (select public.authorize('clients.edit_all'))
  );

drop policy if exists "rbac_edycja_clients" on clients;
create policy "rbac_edycja_clients" on clients for update to authenticated
  using (
    owner   = (select public.my_name())
    or opiekun = (select public.my_name())
    or (select public.authorize('clients.edit_all'))
  )
  with check (
    owner   = (select public.my_name())
    or opiekun = (select public.my_name())
    or (select public.authorize('clients.edit_all'))
  );

-- DELETE = tylko „Usuń trwale" z archiwum (zwykłe chowanie kart to soft-delete
-- przez kolumnę deleted_at, czyli UPDATE — patrz schema.sql v3)
drop policy if exists "rbac_usun_clients" on clients;
create policy "rbac_usun_clients" on clients for delete to authenticated
  using ((select public.authorize('clients.hard_delete')));

-- ============================================================
--  COMMENTS — widzisz komentarze tych kart, które widzisz:
--  podzapytanie do clients przechodzi przez RLS clients ZALOGOWANEGO,
--  więc samo się filtruje (bez duplikowania warunków własności).
-- ============================================================
drop policy if exists "zespol_odczyt_comments" on comments;  -- stare (schema.sql)
drop policy if exists "zespol_zapis_comments"  on comments;  -- stare (schema.sql)

drop policy if exists "rbac_odczyt_comments" on comments;
create policy "rbac_odczyt_comments" on comments for select to authenticated
  using (exists (select 1 from public.clients c where c.id = comments.client_id));

-- anty-podszywanie: komentarz tylko pod WŁASNYM imieniem i tylko pod kartą,
-- którą się widzi
drop policy if exists "rbac_wstaw_comments" on comments;
create policy "rbac_wstaw_comments" on comments for insert to authenticated
  with check (
    author = (select public.my_name())
    and exists (select 1 from public.clients c where c.id = comments.client_id)
  );

drop policy if exists "rbac_edycja_comments" on comments;
create policy "rbac_edycja_comments" on comments for update to authenticated
  using (
    author = (select public.my_name())
    or (select public.authorize('clients.edit_all'))
  )
  with check (
    author = (select public.my_name())
    or (select public.authorize('clients.edit_all'))
  );

drop policy if exists "rbac_usun_comments" on comments;
create policy "rbac_usun_comments" on comments for delete to authenticated
  using (
    author = (select public.my_name())
    or (select public.authorize('clients.edit_all'))
  );

-- ============================================================
--  DEMO_REQUESTS — księga próśb o demo: czytelna dla wszystkich,
--  prośbę składasz pod własnym imieniem, odhaczyć (status done) może
--  każdy zalogowany (robi to osoba wykonująca demo, nie autor prośby).
--  Celowo BRAK polityki DELETE — wpisów księgi nikt nie kasuje z aplikacji.
-- ============================================================
drop policy if exists "team_read_demo"  on demo_requests;   -- stare (schema.sql)
drop policy if exists "team_write_demo" on demo_requests;   -- stare (schema.sql)

drop policy if exists "rbac_odczyt_demo" on demo_requests;
create policy "rbac_odczyt_demo" on demo_requests for select to authenticated
  using (true);

drop policy if exists "rbac_wstaw_demo" on demo_requests;
create policy "rbac_wstaw_demo" on demo_requests for insert to authenticated
  with check (requested_by = (select public.my_name()));

drop policy if exists "rbac_edycja_demo" on demo_requests;
create policy "rbac_edycja_demo" on demo_requests for update to authenticated
  using (true)
  with check (true);

-- ============================================================
--  TEAM_MEMBERS — lista zespołu czytelna dla wszystkich (dropdowny
--  owner/opiekun); INSERT/UPDATE zostają otwarte, bo treść zapisu
--  pilnuje trigger-strażnik z części A (upsert przy logowaniu musi
--  dalej działać); DELETE tylko dla zarządzających zespołem.
-- ============================================================
drop policy if exists "zespol_odczyt_team" on team_members;  -- stare (schema.sql)
drop policy if exists "zespol_zapis_team"  on team_members;  -- stare (schema.sql)

drop policy if exists "rbac_odczyt_team" on team_members;
create policy "rbac_odczyt_team" on team_members for select to authenticated
  using (true);

drop policy if exists "rbac_wstaw_team" on team_members;
create policy "rbac_wstaw_team" on team_members for insert to authenticated
  with check (true);

drop policy if exists "rbac_edycja_team" on team_members;
create policy "rbac_edycja_team" on team_members for update to authenticated
  using (true)
  with check (true);

drop policy if exists "rbac_usun_team" on team_members;
create policy "rbac_usun_team" on team_members for delete to authenticated
  using ((select public.authorize('team.manage')));

commit;

-- ============================================================
--  ROLLBACK — powrót do stanu sprzed egzekwowania.
--  Odkomentuj CAŁOŚĆ poniżej i uruchom, żeby przywrócić DOKŁADNIE
--  stare, otwarte polityki ze schema.sql (tabele/kolumny/funkcje
--  z części A zostają — są nieszkodliwe bez tych polityk).
-- ============================================================
-- begin;
--
-- drop policy if exists "rbac_odczyt_clients"  on clients;
-- drop policy if exists "rbac_wstaw_clients"   on clients;
-- drop policy if exists "rbac_edycja_clients"  on clients;
-- drop policy if exists "rbac_usun_clients"    on clients;
-- drop policy if exists "rbac_odczyt_comments" on comments;
-- drop policy if exists "rbac_wstaw_comments"  on comments;
-- drop policy if exists "rbac_edycja_comments" on comments;
-- drop policy if exists "rbac_usun_comments"   on comments;
-- drop policy if exists "rbac_odczyt_demo"     on demo_requests;
-- drop policy if exists "rbac_wstaw_demo"      on demo_requests;
-- drop policy if exists "rbac_edycja_demo"     on demo_requests;
-- drop policy if exists "rbac_odczyt_team"     on team_members;
-- drop policy if exists "rbac_wstaw_team"      on team_members;
-- drop policy if exists "rbac_edycja_team"     on team_members;
-- drop policy if exists "rbac_usun_team"       on team_members;
--
-- -- stare polityki, 1:1 ze schema.sql:
-- create policy "zespol_odczyt_clients"  on clients      for select to authenticated using (true);
-- create policy "zespol_zapis_clients"   on clients      for all    to authenticated using (true) with check (true);
-- create policy "zespol_odczyt_comments" on comments     for select to authenticated using (true);
-- create policy "zespol_zapis_comments"  on comments     for all    to authenticated using (true) with check (true);
-- create policy "zespol_odczyt_team"     on team_members for select to authenticated using (true);
-- create policy "zespol_zapis_team"      on team_members for all    to authenticated using (true) with check (true);
-- create policy "team_read_demo"  on demo_requests for select to authenticated using (true);
-- create policy "team_write_demo" on demo_requests for all    to authenticated using (true) with check (true);
--
-- commit;
