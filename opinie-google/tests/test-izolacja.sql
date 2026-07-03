-- ============================================================
-- TEST IZOLACJI (bramka do dalszej budowy) — konto A ↛ konto B
-- Uruchomienie: wklej CAŁOŚĆ w Supabase SQL Editor (lub psql/MCP) po
-- zaaplikowaniu 001+002. Skrypt sam tworzy dane testowe, symuluje
-- zalogowanych użytkowników i NA KOŃCU WYCOFUJE WSZYSTKO (rollback).
-- Wynik: NOTICE "IZOLACJA: WSZYSTKIE TESTY OK ✅" albo EXCEPTION z nazwą dziury.
-- ============================================================
begin;

-- ---------- SETUP (jako admin) ----------
insert into auth.users (id, email)
values ('11111111-1111-1111-1111-111111111111', 'test-og-a@example.com'),
       ('22222222-2222-2222-2222-222222222222', 'test-og-b@example.com');

insert into og_accounts (id, owner_auth_id, business_name, sms_sender_name, place_id, plan_price)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'TEST Firma A', 'FirmaA', 'PLACE_A', 79),
       ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'TEST Firma B', 'FirmaB', 'PLACE_B', 49);

insert into og_customers (id, account_id, phone, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '+48111111111', 'Klient A1'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '+48222222222', 'Klient B1');

insert into og_metrics_snapshots (account_id, snapshot_date, rating, user_rating_count) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_date, 4.8, 18),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', current_date, 4.4, 9);

insert into og_reviews (id, account_id, fingerprint, author_name, rating, text) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'fp-a1', 'Autor A', 5, 'Super robota'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'fp-b1', 'Autor B', 2, 'Slabo');

insert into og_review_requests (account_id, customer_id, status) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-0000-0000-000000000001', 'sent'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bbbbbbbb-0000-0000-0000-000000000001', 'sent');

-- ---------- TESTY jako UŻYTKOWNIK A ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare n int; ok boolean;
begin
  -- T1: widzę dokładnie 1 konto i jest moje
  select count(*) into n from og_accounts;
  if n <> 1 then raise exception 'T1 DZIURA: widze % kont zamiast 1', n; end if;
  select count(*) into n from og_accounts where business_name = 'TEST Firma B';
  if n <> 0 then raise exception 'T1 DZIURA: widze konto B'; end if;

  -- T2: klienci — tylko moi, nawet z jawnym filtrem na konto B
  select count(*) into n from og_customers;
  if n <> 1 then raise exception 'T2 DZIURA: widze % klientow zamiast 1', n; end if;
  select count(*) into n from og_customers where account_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if n <> 0 then raise exception 'T2 DZIURA: RLS przepuszcza klientow B'; end if;

  -- T3: INSERT klienta z cudzym account_id → musi być odrzucony
  ok := false;
  begin
    insert into og_customers (account_id, phone) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '+48999999999');
  exception when insufficient_privilege or check_violation then ok := true;
  end;
  if not ok then raise exception 'T3 DZIURA: wstawilem klienta na konto B'; end if;

  -- T4: zmiana nadawcy SMS (kolumna operatorska) → zabroniona
  ok := false;
  begin
    update og_accounts set sms_sender_name = 'Oszust';
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'T4 DZIURA: zmienilem sms_sender_name (podszywanie w SMS)'; end if;

  -- T5: zmiana własnego szablonu → DOZWOLONA (sanity check, nie wszystko blokujemy)
  update og_accounts set message_template = 'Nowy szablon {link}';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T5 BLAD: nie moge edytowac wlasnego szablonu (za ciasno)'; end if;

  -- T6: zapis do og_review_requests z frontu → zabroniony (anty-spam/Omnibus)
  ok := false;
  begin
    insert into og_review_requests (account_id, customer_id)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-0000-0000-000000000001');
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'T6 DZIURA: front pisze do og_review_requests'; end if;

  -- T7: odznaczenie STOP klienta → zabronione
  ok := false;
  begin
    update og_customers set opted_out = false where phone = '+48111111111';
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'T7 DZIURA: front zmienia opted_out (obejscie STOP)'; end if;

  -- T8: snapshoty — tylko moje
  select count(*) into n from og_metrics_snapshots;
  if n <> 1 then raise exception 'T8 DZIURA: widze % snapshotow zamiast 1', n; end if;

  -- T9: status 'published' z frontu → zabroniony (publikuje tylko operator)
  ok := false;
  begin
    update og_reviews set status = 'published' where fingerprint = 'fp-a1';
  exception when insufficient_privilege or check_violation then ok := true;
  end;
  if not ok then raise exception 'T9 DZIURA: front oznacza opinie jako published'; end if;

  -- T10: decyzja 'accepted' + własna odpowiedź → DOZWOLONA
  update og_reviews set status = 'accepted', final_reply = 'Dziekujemy!' where fingerprint = 'fp-a1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T10 BLAD: nie moge zaakceptowac wlasnej opinii (za ciasno)'; end if;

  -- T11: edycja TREŚCI cudzej… i własnej opinii (text/rating) → zabroniona
  ok := false;
  begin
    update og_reviews set text = 'sfalszowana' where fingerprint = 'fp-a1';
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'T11 DZIURA: front edytuje tresc opinii'; end if;

  -- T12: DELETE cudzego klienta → 0 wierszy (RLS wycina po cichu)
  delete from og_customers where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T12 DZIURA: skasowalem klienta konta B'; end if;

  raise notice 'Testy uzytkownika A: OK';
end $$;

-- ---------- TESTY jako ANON (niezalogowany) ----------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
declare ok boolean;
begin
  ok := false;
  begin
    perform * from og_accounts;
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'T13 DZIURA: anon czyta og_accounts'; end if;

  ok := false;
  begin
    perform * from og_customers;
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'T13 DZIURA: anon czyta og_customers'; end if;

  raise notice 'Testy anon: OK';
end $$;

-- ---------- KONTROLA KRZYŻOWA jako admin: dane B nietknięte ----------
reset role;
do $$
declare n int;
begin
  select count(*) into n from og_customers where account_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if n <> 1 then raise exception 'T14 DZIURA: dane konta B naruszone przez testy A'; end if;
  raise notice '============================================';
  raise notice 'IZOLACJA: WSZYSTKIE TESTY OK ✅ (14 testow)';
  raise notice '============================================';
end $$;

-- Zero śladu po teście:
rollback;
