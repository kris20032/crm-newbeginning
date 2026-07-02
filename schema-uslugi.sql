-- ============================================================
--  CRM New Beginning — KATALOG USŁUG (zakładka „Oferta" w panelu admina)
--  Jedno źródło prawdy o usługach: karta klienta (zakładka „Usługi")
--  renderuje ten katalog, a panel admina nim zarządza (dodawanie,
--  ukrywanie, ceny: stała / wpisywana z minimum i rekomendacją).
--  Wklej całość w Supabase -> SQL Editor -> Run.
--
--  ✅ BEZPIECZNE — addytywne i idempotentne (można wielokrotnie).
--     NIE zmienia zachowania żywego CRM z main (stary front tej tabeli
--     w ogóle nie czyta; nowy front bez tej tabeli ma tryb zgodności =
--     wbudowane 2 usługi jak dotąd).
--  ⚠️ WYMAGA wcześniejszego schema-rbac.sql (część A) — RLS używa
--     public.authorize(), a uprawnienie wpada do tabeli permissions
--     (plik sam się zatrzyma, jeśli części A nie ma).
--
--  ↩️ JAK COFNĄĆ:
--     drop table if exists public.service_catalog;
--     delete from public.role_permissions where perm_key = 'services.manage';
--     delete from public.permissions where key = 'services.manage';
--     (Zapisane wybory na kartach zostają — mieszkają w clients.services.)
-- ============================================================

begin;

-- Bezpiecznik: bez części A RBAC zatrzymaj się teraz (transakcja się wycofa).
do $$
begin
  if to_regprocedure('public.authorize(text)') is null
     or to_regclass('public.permissions') is null then
    raise exception 'Najpierw wykonaj schema-rbac.sql (część A) — brak public.authorize()/tabeli permissions.';
  end if;
end;
$$;

-- ============================================================
--  1. KATALOG USŁUG
--     Karta klienta zapisuje wybory w clients.services (jsonb) pod kluczem
--     usługi: { "<key>": { on, price?, period? } } — dlatego 'key' jest
--     stały (nie zmieniać po utworzeniu), a usług się NIE usuwa, tylko
--     ukrywa (visible=false): stare karty muszą umieć odczytać swój wybór.
-- ============================================================
create table if not exists service_catalog (
  key         text primary key,                -- identyfikator w clients.services, np. 'strona' (slug, bez zmian po utworzeniu)
  label       text not null,                   -- nazwa pokazywana handlowcowi i w panelu
  visible     boolean not null default true,   -- false = ukryta: handlowiec nie zaznaczy jej NOWO (już zaznaczone na kartach zostają widoczne)
  price_mode  text not null default 'custom' check (price_mode in ('fixed', 'custom')),  -- 'fixed' = cena z góry (np. hosting) | 'custom' = wpisuje handlowiec
  price_fixed numeric,                         -- cena przy 'fixed'
  price_min   numeric,                         -- dolna granica przy 'custom' (null = brak); appka przycina wpis poniżej minimum
  price_rec   numeric,                         -- cena rekomendowana przy 'custom' (null = brak) — podpowiedź/prefill dla handlowca
  billing     text not null default 'one_time' check (billing in ('one_time', 'monthly')),  -- 'monthly' = cena × wybrany okres (6 mies. / 1 rok / 2 lata, jak obsługa)
  ord         int default 0,                   -- kolejność na karcie i w panelu
  created_at  timestamptz default now()
);

-- seed = dokładnie dzisiejsze zachowanie karty (klucze 'strona'/'obsluga'
-- muszą zostać — zapisane karty już ich używają w clients.services)
insert into service_catalog (key, label, visible, price_mode, price_fixed, price_min, price_rec, billing, ord) values
  ('strona',  'Strona internetowa', true, 'custom', null, null, null, 'one_time', 10),
  ('obsluga', 'Obsługa techniczna', true, 'fixed',  49,   null, null, 'monthly',  20)
on conflict (key) do nothing;

-- ============================================================
--  2. UPRAWNIENIE do zarządzania ofertą (checkbox w matrycy panelu admina;
--     admin ma je niejawnie — jak wszystko)
-- ============================================================
insert into permissions (key, label, grp, ord) values
  ('services.manage', 'Zarządza ofertą usług', 'Zespół', 20)
on conflict (key) do nothing;

-- ============================================================
--  3. RLS — odczyt: każdy zalogowany (karta musi renderować usługi,
--     w tym ukryte-a-zaznaczone na starych kartach; „ukryta" to kwestia
--     listowania w UI, nie tajemnica). Zapis: 'services.manage' (admin niejawnie).
-- ============================================================
alter table service_catalog enable row level security;

drop policy if exists "uslugi_odczyt" on service_catalog;
create policy "uslugi_odczyt" on service_catalog for select to authenticated using (true);
drop policy if exists "uslugi_zapis" on service_catalog;
create policy "uslugi_zapis" on service_catalog for all to authenticated
  using ((select public.authorize('services.manage')))
  with check ((select public.authorize('services.manage')));

commit;
