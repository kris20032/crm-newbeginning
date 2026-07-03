-- ============================================================
--  CRM New Beginning — RBAC, CZĘŚĆ A (BEZPIECZNA / ADDYTYWNA)
--  Role i uprawnienia: tabele + funkcje + strażnik team_members.
--  Wklej całość w Supabase -> SQL Editor -> Run.
--
--  ✅ BEZPIECZNE — można wykonać W KAŻDEJ CHWILI, także wielokrotnie:
--     wszystko jest addytywne i idempotentne (if not exists /
--     on conflict do nothing / create or replace / drop if exists + create).
--  ✅ NIE zmienia zachowania żywego CRM z brancha `main`:
--     - polityki RLS na clients / comments / team_members / demo_requests
--       zostają STARE (otwarte `using (true)`) — zaostrza je dopiero
--       CZĘŚĆ B (schema-rbac-enforce.sql), wykonywana przy wdrożeniu;
--     - trigger-strażnik na team_members NIGDY nie rzuca wyjątku —
--       złe wartości po cichu koryguje, więc upsert({email,name})
--       robiony przez żywy front przy każdym logowaniu działa jak dotąd.
--
--  ↩️ JAK COFNĄĆ (w tej kolejności — FK i zależności):
--     drop trigger  if exists trg_team_members_guard on public.team_members;
--     drop function if exists public.team_members_guard();
--     drop function if exists public.authorize(text);
--     drop function if exists public.my_name();
--     drop function if exists public.my_role();
--     drop function if exists public.my_member();
--     alter table public.team_members drop column if exists role;    -- przed dropem roles (FK)
--     alter table public.team_members drop column if exists active;
--     alter table public.team_members drop column if exists user_id;
--     drop table if exists public.role_permissions;                  -- polityki znikają razem z tabelami
--     drop table if exists public.permissions;
--     drop table if exists public.roles;
--     alter table public.clients drop column if exists services;     -- UWAGA: skasuje zapisane usługi z kart
--     alter table public.clients drop column if exists partner_since; -- UWAGA: skasuje tokeny partnera
--     alter table public.clients drop column if exists checklist;     -- UWAGA: skasuje odpowiedzi checklisty
-- ============================================================

begin;

-- ============================================================
--  1. Domknięcie z handovera lejka: kolumny na karcie klienta
--     - services: zakładka „Usługi" zapisuje tu jsonb (bez kolumny zapis by się wywalał)
--     - partner_since: TOKEN PARTNERA — znacznik „przeszedł przez etap Umowa podpisana";
--       front nadaje go przy pierwszym wejściu na ten etap (lub dalszy) i już NIGDY nie
--       zdejmuje, niezależnie od późniejszych etapów (zielony znaczek przy imieniu)
-- ============================================================
alter table clients add column if not exists services jsonb;
alter table clients add column if not exists partner_since timestamptz;
-- CHECKLISTA wdrożeniowa (zakładka na karcie): { paid, materials, notes: {…} }
alter table clients add column if not exists checklist jsonb;

-- ============================================================
--  2. ROLE — słownik ról zespołu (panel admina będzie mógł dodawać własne)
-- ============================================================
create table if not exists roles (
  key      text primary key,        -- identyfikator w kodzie, np. 'sprzedawca'
  label    text not null,           -- nazwa pokazywana w UI
  editable boolean default true     -- false = rola systemowa (admin): panel nie pozwala jej edytować/usunąć
);

-- seed — `do nothing`, żeby ponowne wklejenie nie nadpisało zmian zrobionych w panelu
insert into roles (key, label, editable) values
  ('admin',      'Administrator', false),
  ('sprzedawca', 'Sprzedawca',    true),
  ('developer',  'Developer',     true),
  ('retencja',   'Retencja',      true)
on conflict (key) do nothing;

-- ============================================================
--  3. UPRAWNIENIA — słownik możliwych uprawnień (checkboxy w panelu admina)
-- ============================================================
create table if not exists permissions (
  key   text primary key,   -- identyfikator w kodzie, np. 'clients.view_all'
  label text not null,      -- opis po polsku (do panelu)
  grp   text not null,      -- grupa w UI: 'Klienci' | 'Sekcje' | 'Zespół'
  ord   int default 0       -- kolejność wyświetlania w grupie
);

insert into permissions (key, label, grp, ord) values
  ('clients.view_all',    'Widzi klientów całego zespołu',           'Klienci', 10),
  ('clients.edit_all',    'Edytuje cudze karty',                     'Klienci', 20),
  ('clients.hard_delete', 'Usuwa trwale z archiwum',                 'Klienci', 30),
  ('partners.revoke',     'Zdejmuje token partnera (Baza partnerów)','Klienci', 40),
  ('section.klienci',     'Sekcja Baza partnerów (podpisani)',       'Sekcje',  10),
  ('section.admin',       'Panel admina',                            'Sekcje',  20),
  ('stages.dev',          'Widzi szczegóły etapów realizacji (dev)', 'Sekcje',  30),
  ('team.manage',         'Zarządza użytkownikami i rolami',         'Zespół',  10)
on conflict (key) do nothing;

-- ============================================================
--  4. ROLA ↔ UPRAWNIENIE — co która rola może
--     UWAGA: 'admin' celowo NIE ma tu wpisów — ma wszystko niejawnie
--     w funkcji authorize(). 'retencja' startuje bez żadnych uprawnień.
-- ============================================================
create table if not exists role_permissions (
  role_key text references roles(key)       on delete cascade,
  perm_key text references permissions(key) on delete cascade,
  primary key (role_key, perm_key)
);

insert into role_permissions (role_key, perm_key) values
  ('sprzedawca', 'section.klienci'),
  ('developer',  'clients.view_all'),
  ('developer',  'section.klienci'),
  ('developer',  'stages.dev')
on conflict do nothing;

-- ============================================================
--  5. team_members — nowe kolumny
--     (kolejność w tym pliku ma znaczenie: rola 'sprzedawca' musi już
--     istnieć w roles, zanim dodamy kolumnę z defaultem i FK)
-- ============================================================
alter table team_members add column if not exists user_id uuid unique;  -- mapowanie na konto logowania (auth.users.id); uzupełnia się samo przy logowaniach (strażnik niżej)
alter table team_members add column if not exists role text not null default 'sprzedawca' references roles(key);  -- FK przy okazji broni przed skasowaniem roli będącej w użyciu
alter table team_members add column if not exists active boolean not null default true;  -- false = konto zdezaktywowane → authorize() zawsze false

-- ============================================================
--  6. Bootstrap adminów — Krzysztof i Marceli dostają rolę admin
--     (idempotentne: ponowne wykonanie ustawia tę samą wartość)
-- ============================================================
update team_members set role = 'admin'
 where lower(email) in ('krzychu.brzezi@gmail.com', 'kozakiewicz.marceli@gmail.com');

-- ============================================================
--  7. FUNKCJE POMOCNICZE
--     security definer = działają z prawami właściciela, z pominięciem RLS —
--     dzięki temu polityki mogą pytać o team_members/role_permissions bez
--     rekurencji. `set search_path = ''` + pełne nazwy public.* = nikt nie
--     podmieni nam tabel przez manipulację search_path.
-- ============================================================

-- Wiersz team_members ZALOGOWANEGO: najpierw po user_id = auth.uid(),
-- awaryjnie po e-mailu (konta sprzed RBAC nie mają jeszcze user_id).
-- Gdy brak wpisu — zwraca rekord z samymi NULL-ami.
create or replace function public.my_member()
returns public.team_members
language plpgsql stable security definer set search_path = ''
as $$
declare m public.team_members;
begin
  select * into m from public.team_members t
   where t.user_id = auth.uid()
   limit 1;
  if not found then
    select * into m from public.team_members t
     where lower(t.email) = lower(auth.email())
     order by t.created_at asc
     limit 1;
  end if;
  return m;
end;
$$;

-- Rola zalogowanego: 'admin' | 'sprzedawca' | ... | null (gdy brak wpisu).
create or replace function public.my_role()
returns text
language sql stable security definer set search_path = ''
as $$ select (public.my_member()).role; $$;

-- Imię zalogowanego — to samo, które karty trzymają w clients.owner/opiekun,
-- a komentarze w comments.author. Używane przez polityki CZĘŚCI B.
create or replace function public.my_name()
returns text
language sql stable security definer set search_path = ''
as $$ select (public.my_member()).name; $$;

-- Czy zalogowany ma dane uprawnienie?
--  - brak wpisu w team_members albo active=false → zawsze NIE;
--  - rola 'admin' (aktywna) → zawsze TAK (bez wpisów w role_permissions);
--  - inni → sprawdzenie wpisu w role_permissions dla ich roli.
create or replace function public.authorize(perm text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare m public.team_members;
begin
  m := public.my_member();
  if m.id is null or m.active is distinct from true then
    return false;
  end if;
  if m.role = 'admin' then
    return true;
  end if;
  return exists (
    select 1 from public.role_permissions rp
    where rp.role_key = m.role and rp.perm_key = perm
  );
end;
$$;

-- ============================================================
--  8. RLS na NOWYCH tabelach — od razu ostre (nie kolidują z żywym
--     frontem, bo ten w ogóle ich nie używa):
--     odczyt = każdy zalogowany (front musi umieć policzyć swoje uprawnienia),
--     zapis  = tylko uprawnienie 'team.manage' (czyli admin lub rola, której je nadano).
--     `(select ...)` wokół funkcji = Postgres liczy ją raz na zapytanie, nie per wiersz.
-- ============================================================
alter table roles            enable row level security;
alter table permissions      enable row level security;
alter table role_permissions enable row level security;

drop policy if exists "rbac_odczyt_roles" on roles;
create policy "rbac_odczyt_roles" on roles for select to authenticated using (true);
drop policy if exists "rbac_zapis_roles" on roles;
create policy "rbac_zapis_roles" on roles for all to authenticated
  using ((select public.authorize('team.manage')))
  with check ((select public.authorize('team.manage')));

drop policy if exists "rbac_odczyt_permissions" on permissions;
create policy "rbac_odczyt_permissions" on permissions for select to authenticated using (true);
drop policy if exists "rbac_zapis_permissions" on permissions;
create policy "rbac_zapis_permissions" on permissions for all to authenticated
  using ((select public.authorize('team.manage')))
  with check ((select public.authorize('team.manage')));

drop policy if exists "rbac_odczyt_role_permissions" on role_permissions;
create policy "rbac_odczyt_role_permissions" on role_permissions for select to authenticated using (true);
drop policy if exists "rbac_zapis_role_permissions" on role_permissions;
create policy "rbac_zapis_role_permissions" on role_permissions for all to authenticated
  using ((select public.authorize('team.manage')))
  with check ((select public.authorize('team.manage')));

-- ============================================================
--  9. STRAŻNIK team_members — ochrona przed podszywaniem się, OD RAZU.
--     Żywy front (main) przy KAŻDYM logowaniu robi
--     upsert({email, name}, onConflict: 'email') — dlatego strażnik NIGDY
--     nie rzuca wyjątku: złe wartości po cichu koryguje, a cudze wiersze
--     zostawia bez zmian. Bonus: przy okazji logowań sam uzupełnia
--     mapowanie user_id ↔ e-mail (samonaprawa starych kont).
--     Pomijany, gdy nie ma zalogowanego użytkownika (SQL Editor,
--     service_role z Edge Function) albo gdy wołający ma 'team.manage'.
--     Uwaga: przy upsercie BEFORE INSERT odpala się także na ścieżce
--     konfliktu (a potem BEFORE UPDATE) — obie ścieżki są tu obsłużone.
-- ============================================================
create or replace function public.team_members_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- pełne prawa: SQL Editor / service_role (brak auth.uid()) albo admin zespołu
  if auth.uid() is null or public.authorize('team.manage') then
    -- samonaprawa: własny wiersz (po e-mailu) bez user_id → dopisz uid z sesji
    if new.user_id is null and auth.uid() is not null
       and lower(new.email) = lower(auth.email()) then
      new.user_id := auth.uid();
    end if;
    return new;
  end if;

  -- zwykły użytkownik — INSERT: może dopisać wyłącznie SIEBIE,
  -- zawsze jako aktywnego sprzedawcę (żadnych ról/kont „w prezencie")
  if tg_op = 'INSERT' then
    if auth.email() is not null then
      new.email := auth.email();
    end if;
    new.role    := 'sprzedawca';
    new.active  := true;
    new.user_id := auth.uid();
    return new;
  end if;

  -- zwykły użytkownik — UPDATE CUDZEGO wiersza (ani uid, ani e-mail się nie
  -- zgadzają) → po cichu zachowaj WSZYSTKIE stare wartości (zero wyjątków)
  if old.user_id is distinct from auth.uid()
     and lower(old.email) is distinct from lower(auth.email()) then
    return old;
  end if;

  -- zwykły użytkownik — UPDATE WŁASNEGO wiersza: imię wolno zmienić,
  -- reszta pod kontrolą (rola/aktywność/e-mail zostają stare)
  new.email  := old.email;
  new.role   := old.role;
  new.active := old.active;
  if old.user_id is null then
    new.user_id := auth.uid();   -- wolno tylko UZUPEŁNIĆ własny uid (samonaprawa)
  else
    new.user_id := old.user_id;  -- raz ustawionego uid nie zmieniamy
  end if;
  return new;
end;
$$;

drop trigger if exists trg_team_members_guard on team_members;
create trigger trg_team_members_guard
  before insert or update on team_members
  for each row execute function public.team_members_guard();

commit;
