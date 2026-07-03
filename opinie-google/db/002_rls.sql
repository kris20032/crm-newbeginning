-- ============================================================
-- Opinie Google — Row Level Security (izolacja danych między kontami)
-- ⭐ TO JEST SERCE BEZPIECZEŃSTWA. Fable audytuje ten plik PRZED budową i po.
--
-- Zasada: front loguje się jako zalogowany użytkownik (auth.uid()).
--   Użytkownik → jego og_accounts.owner_auth_id → jedno account_id.
--   Widzi/zmienia TYLKO rekordy z tym account_id. Zero dostępu do cudzych.
-- Worker (Edge Function) używa service_role → omija RLS ŚWIADOMIE, tylko serwer.
-- ============================================================

-- Helper: zwraca account_id zalogowanego użytkownika (SECURITY DEFINER, stabilny).
create or replace function og_current_account_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from og_accounts where owner_auth_id = auth.uid()
$$;

-- Włącz RLS na wszystkich tabelach danych.
alter table og_accounts          enable row level security;
alter table og_customers         enable row level security;
alter table og_review_requests   enable row level security;
alter table og_metrics_snapshots enable row level security;
alter table og_reviews           enable row level security;
alter table og_wa_sessions       enable row level security;

-- WYMUSZENIE także na właścicielu tabeli (nie ufamy nawet ownerowi roli).
alter table og_accounts          force row level security;
alter table og_customers         force row level security;
alter table og_review_requests   force row level security;
alter table og_metrics_snapshots force row level security;
alter table og_reviews           force row level security;
alter table og_wa_sessions       force row level security;

-- ------------------------------------------------------------
-- og_accounts: użytkownik widzi/zmienia TYLKO swoje konto.
-- ------------------------------------------------------------
drop policy if exists og_accounts_sel on og_accounts;
create policy og_accounts_sel on og_accounts for select
  using (owner_auth_id = auth.uid());
drop policy if exists og_accounts_upd on og_accounts;
create policy og_accounts_upd on og_accounts for update
  using (owner_auth_id = auth.uid())
  with check (owner_auth_id = auth.uid());
-- INSERT/DELETE kont robi wyłącznie onboarding po stronie serwera (service_role) — brak polityki = brak dostępu z frontu.

-- ------------------------------------------------------------
-- Tabele podrzędne: dostęp tylko gdy account_id = konto użytkownika.
-- Wzorzec identyczny dla każdej — SELECT/INSERT/UPDATE/DELETE ograniczone.
-- ------------------------------------------------------------

-- og_customers
drop policy if exists og_customers_all on og_customers;
create policy og_customers_all on og_customers for all
  using (account_id = og_current_account_id())
  with check (account_id = og_current_account_id());

-- og_review_requests
drop policy if exists og_requests_all on og_review_requests;
create policy og_requests_all on og_review_requests for all
  using (account_id = og_current_account_id())
  with check (account_id = og_current_account_id());

-- og_metrics_snapshots (front tylko czyta; zapis robi worker service_role)
drop policy if exists og_snapshots_sel on og_metrics_snapshots;
create policy og_snapshots_sel on og_metrics_snapshots for select
  using (account_id = og_current_account_id());

-- og_reviews (front czyta + zmienia status/treść odpowiedzi; detekcję robi worker)
drop policy if exists og_reviews_sel on og_reviews;
create policy og_reviews_sel on og_reviews for select
  using (account_id = og_current_account_id());
drop policy if exists og_reviews_upd on og_reviews;
create policy og_reviews_upd on og_reviews for update
  using (account_id = og_current_account_id())
  with check (account_id = og_current_account_id());

-- og_wa_sessions (stan techniczny — zwykle tylko worker; front może czytać swój)
drop policy if exists og_wa_sel on og_wa_sessions;
create policy og_wa_sel on og_wa_sessions for select
  using (account_id = og_current_account_id());

-- ============================================================
-- ⚠️ DLA FABLE — punkty do zaudytowania (nie kasować, to checklista):
--  1. Czy og_current_account_id() nie da się oszukać (SECURITY DEFINER + search_path ustawiony).
--  2. Czy anon (niezalogowany) NIE widzi niczego (brak polityki dla anon = deny).
--  3. Czy INSERT z podmienionym account_id jest blokowany przez with check (nie tylko using).
--  4. Czy service_role używany jest WYŁĄCZNIE w Edge Functions, nigdy we froncie (grep repo).
--  5. Czy nie ma widoku/funkcji SECURITY DEFINER, która wycieka dane w poprzek kont.
-- ============================================================
