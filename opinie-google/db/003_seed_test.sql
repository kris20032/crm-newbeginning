-- ============================================================
-- Opinie Google — dane testowe (2 konta A i B do testów izolacji)
-- Cel: udowodnić, że konto A NIE widzi danych konta B.
-- NIE aplikować na tych samych danych co produkcja klientów — to fikcyjne konta.
-- Wyczyścić przez 999_drop.sql albo delete where business_name like 'TEST %'.
-- ============================================================

-- Konto A
insert into og_accounts (id, business_name, city, place_id, review_link, sms_sender_name, plan_price)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'TEST Firma A', 'Rzeszów', 'PLACE_A', 'https://search.google.com/local/writereview?placeid=PLACE_A', 'FirmaA', 79)
on conflict (id) do nothing;

-- Konto B
insert into og_accounts (id, business_name, city, place_id, review_link, sms_sender_name, plan_price)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        'TEST Firma B', 'Kraków', 'PLACE_B', 'https://search.google.com/local/writereview?placeid=PLACE_B', 'FirmaB', 49)
on conflict (id) do nothing;

-- Klienci końcowi
insert into og_customers (account_id, phone, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '+48111111111', 'Klient A1'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '+48222222222', 'Klient B1')
on conflict do nothing;

-- Snapshoty (żeby panel miał trend)
insert into og_metrics_snapshots (account_id, snapshot_date, rating, user_rating_count) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_date - 7, 4.6, 12),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_date,     4.8, 18),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', current_date - 7, 4.2, 5),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', current_date,     4.4, 9)
on conflict (account_id, snapshot_date) do nothing;

-- ============================================================
-- TEST IZOLACJI (Fable rozbuduje w automatyczny test):
--  1. Zaloguj się jako owner konta A → select * from og_customers → widzisz TYLKO Klient A1.
--  2. select * from og_customers where account_id = '...B...' → 0 wierszy (RLS blokuje).
--  3. Próba insert do og_customers z account_id konta B jako user A → odrzucone (with check).
-- ============================================================
