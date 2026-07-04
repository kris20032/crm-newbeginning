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
--  PONADTO ten plik zakłada STRAŻNIKA lejka na clients (trigger clients_guard),
--  który w bazie egzekwuje progi etapów (usługa → „Nadaj token" = admin →
--  kompletna checklista → etapy realizacji), nadawanie/zdejmowanie tokena
--  partnera i niezmienialność sprzedanych usług (sold_at). Domyka też
--  podszywanie się: imiona w team_members stają się UNIKALNE, a zwykły
--  użytkownik nie zmienia własnego imienia (własność kart = tekstowe owner).
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

-- ============================================================
--  STRAŻNIK CLIENTS — egzekwuje w BAZIE reguły lejka, które front tylko
--  „proponuje" (bez tego zwykły sprzedawca omija je jednym PATCH-em REST
--  na swojej karcie: status='konwersja', partner_since, sold_at itd.).
--  Etapy to zwykły text → rangę liczymy przez array_position (nieznany = 'lead',
--  jak normStatus we froncie). Progi pilnujemy tylko W PRZÓD (cofanie wolne).
--  Samonaprawki frontu (token/sold_at odpalane u KAŻDEGO w showApp) korygujemy
--  po cichu (nie raise) — inaczej zasypałyby konsole nie-adminów wyjątkami.
-- ============================================================
create or replace function public.stage_rank(s text) returns int
language sql immutable set search_path = '' as $$
  select coalesce(array_position(
    array['lead','zainteresowany','umowiony','po_spotkaniu','oferta',
          'konwersja','checklista','w_realizacji','zrealizowane'], s), 1)
$$;

create or replace function public.clients_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare o int; n int; k text; osv jsonb; nsv jsonb; is_admin boolean;
begin
  if auth.uid() is null then return new; end if;             -- SQL Editor / service_role: pełne prawa
  is_admin := (public.my_role() = 'admin');
  o := case when tg_op = 'INSERT' then 1 else public.stage_rank(old.status) end;
  n := public.stage_rank(new.status);
  osv := case when tg_op = 'INSERT' then '{}'::jsonb else coalesce(old.services, '{}'::jsonb) end;
  nsv := coalesce(new.services, '{}'::jsonb);

  -- PROGI (tylko gdy karta idzie W PRZÓD ponad próg) — twardo, bo to celowe obejście:
  if n > o then
    if n >= public.stage_rank('oferta') and o < public.stage_rank('oferta')
       and not exists (select 1 from jsonb_each(nsv) e
                       where coalesce((e.value->>'on')::boolean, false)
                         and (e.value->>'sold_at') is null) then
      raise exception 'Próg „Umowa wysłana": wymagana min. 1 nowa (niesprzedana) usługa';
    end if;
    if n >= public.stage_rank('konwersja') and o < public.stage_rank('konwersja')
       and not is_admin then
      raise exception 'Próg „Umowa podpisana": przenosi tylko admin (przycisk „Nadaj token")';
    end if;
    if n >= public.stage_rank('checklista') and o < public.stage_rank('checklista')
       and not ((new.checklist->>'paid') is not null
                and coalesce((new.checklist->>'materials')::boolean, false)) then
      raise exception 'Próg „Checklista gotowa": checklista niekompletna (płatność + materiały)';
    end if;
    if n >= public.stage_rank('w_realizacji')
       and not (select public.authorize('stages.realizacja')) then
      raise exception 'Etapy realizacji: wymagane uprawnienie „stages.realizacja" (albo admin)';
    end if;
  end if;

  -- TOKEN partnera: nadać może tylko admin; zdjąć (→ null) tylko „partners.revoke".
  -- Każdą inną zmianę partner_since cicho przywracamy do poprzedniej wartości.
  if new.partner_since is distinct from (case when tg_op = 'INSERT' then null else old.partner_since end) then
    if tg_op = 'UPDATE' and old.partner_since is not null and new.partner_since is null then
      if not (select public.authorize('partners.revoke')) then new.partner_since := old.partner_since; end if;
    elsif not is_admin then
      new.partner_since := case when tg_op = 'INSERT' then null else old.partner_since end;
    end if;
  end if;

  -- SOLD_AT: raz ostemplowana usługa jest niezmienialna i nie do odznaczenia
  -- (chyba że „partners.revoke" — zdejmowanie tokena czyści też stemple).
  if tg_op = 'UPDATE' and not (select public.authorize('partners.revoke')) then
    for k in select jsonb_object_keys(osv) loop
      if (osv->k->>'sold_at') is not null
         and ( (nsv->k->>'sold_at') is distinct from (osv->k->>'sold_at')
               or not coalesce((nsv->k->>'on')::boolean, false) ) then
        nsv := jsonb_set(nsv, array[k], (osv->k));           -- cicho przywróć sprzedany wiersz
      end if;
    end loop;
    new.services := nsv;
  end if;

  return new;
end $$;

drop trigger if exists trg_clients_guard on clients;
create trigger trg_clients_guard before insert or update on clients
  for each row execute function public.clients_guard();

-- ============================================================
--  MODEL WŁASNOŚCI = tekstowe owner/opiekun porównywane z my_name().
--  Bez tego sprzedawca zmienia SOBIE name na „Krzysztof" i przejmuje jego
--  karty + pisze komentarze jako on. Domknięcie: (1) imiona UNIKALNE,
--  (2) zwykły user nie zmienia własnego imienia (tylko team.manage / admin).
--  UWAGA: jeśli poniższy indeks wywali się na duplikatach — najpierw ujednolić
--  imiona w team_members, potem wykonać ten plik ponownie.
-- ============================================================
create unique index if not exists uq_team_members_name_ci on team_members (lower(name));

create or replace function public.team_members_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or public.authorize('team.manage') then
    if new.user_id is null and auth.uid() is not null
       and lower(new.email) = lower(auth.email()) then
      new.user_id := auth.uid();
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if auth.email() is not null then new.email := auth.email(); end if;
    new.role    := 'sprzedawca';
    new.active  := true;
    new.user_id := auth.uid();
    return new;
  end if;

  if old.user_id is distinct from auth.uid()
     and lower(old.email) is distinct from lower(auth.email()) then
    return old;
  end if;

  -- WŁASNY wiersz: e-mail/rola/aktywność/uid zamrożone, a TERAZ także imię —
  -- podszywanie się pod cudze imię było jedyną dziurą modelu własności.
  new.email  := old.email;
  new.role   := old.role;
  new.active := old.active;
  new.name   := old.name;
  new.user_id := coalesce(old.user_id, auth.uid());
  return new;
end $$;

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
-- drop trigger  if exists trg_clients_guard on clients;   -- strażnik lejka znika razem z egzekwowaniem
-- drop function if exists public.clients_guard();
-- drop function if exists public.stage_rank(text);
-- -- (indeks uq_team_members_name_ci i zaostrzony team_members_guard ZOSTAWIAMY —
-- --  są nieszkodliwe bez polityk, a chronią przed kolizją/podszywaniem imion)
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
