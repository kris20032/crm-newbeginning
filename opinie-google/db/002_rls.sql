-- ============================================================
-- Opinie Google — RLS + GRANTY (izolacja danych)  v2 po audycie Fable
-- ⭐ SERCE BEZPIECZEŃSTWA. Dwie warstwy:
--   1. GRANTY (kolumnowe) — czego front w ogóle nie może dotknąć,
--   2. RLS — z tego, co może, widzi/zmienia wyłącznie SWOJE konto.
--
-- Zasada: front (rola authenticated) = fachowiec w panelu. Worker (Edge
-- Function, service_role) omija RLS świadomie i tylko po stronie serwera.
--
-- Zmiany v2 (audyt): jawne REVOKE dla anon/authenticated (F6), granty
-- kolumnowe na og_accounts/og_customers/og_reviews (F3/F7/F5),
-- og_review_requests tylko-do-odczytu z frontu (F4), blokada statusu
-- 'published' z frontu (F5), twarde uprawnienia funkcji pomocniczej.
-- ============================================================

-- Helper: account_id zalogowanego użytkownika.
-- SECURITY DEFINER + przypięty search_path; bezpieczeństwo daje filtr po
-- auth.uid() (działa niezależnie od tego, czy owner roli omija RLS).
create or replace function og_current_account_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from og_accounts where owner_auth_id = auth.uid()
$$;
revoke all on function og_current_account_id() from public, anon;
grant execute on function og_current_account_id() to authenticated, service_role;

-- ------------------------------------------------------------
-- WARSTWA 1: GRANTY. Najpierw zabieramy wszystko, potem oddajemy minimum.
-- (Supabase domyślnie nadaje szerokie prawa rolom anon/authenticated — F6.)
-- ------------------------------------------------------------
revoke all on og_accounts, og_customers, og_review_requests,
              og_metrics_snapshots, og_reviews, og_wa_sessions
  from anon, authenticated;

-- og_accounts: fachowiec czyta swoje konto; edytuje TYLKO szablon wiadomości
-- (treść walidowana w og-dispatch: wymóg {link} + deny-lista gating/zachęt).
-- wa_number = klucz tożsamości konta w webhooku WhatsApp -> zmienia TYLKO
-- operator (audyt 10.07, analogicznie do sms_sender_name/F3). Nadawca SMS /
-- place_id / cena / status = tylko operator (F3).
grant select on og_accounts to authenticated;
grant update (message_template) on og_accounts to authenticated;

-- og_customers: fachowiec zarządza swoją listą klientów, ale opted_out (STOP)
-- zmienia wyłącznie worker — żeby abonent nie mógł „odznaczyć" STOP-u (F7).
grant select, insert, delete on og_customers to authenticated;
grant update (name) on og_customers to authenticated;

-- og_review_requests: front TYLKO czyta (F4). Zapis = Edge Functions.
grant select on og_review_requests to authenticated;

-- og_metrics_snapshots: front tylko czyta.
grant select on og_metrics_snapshots to authenticated;

-- og_reviews: front czyta; zmienia tylko decyzję (status) i własną odpowiedź (F5).
grant select on og_reviews to authenticated;
grant update (status, final_reply) on og_reviews to authenticated;

-- og_wa_sessions: front tylko czyta swój stan.
grant select on og_wa_sessions to authenticated;

-- ------------------------------------------------------------
-- WARSTWA 2: RLS. enable + FORCE (nie ufamy nawet ownerowi tabel).
-- Brak polityki dla danej operacji/roli = DENY (dot. m.in. anon: zero polityk).
-- ------------------------------------------------------------
alter table og_accounts          enable row level security;
alter table og_customers         enable row level security;
alter table og_review_requests   enable row level security;
alter table og_metrics_snapshots enable row level security;
alter table og_reviews           enable row level security;
alter table og_wa_sessions       enable row level security;

alter table og_accounts          force row level security;
alter table og_customers         force row level security;
alter table og_review_requests   force row level security;
alter table og_metrics_snapshots force row level security;
alter table og_reviews           force row level security;
alter table og_wa_sessions       force row level security;

-- og_accounts: widzisz/edytujesz tylko własny wiersz. INSERT/DELETE kont
-- wyłącznie serwerowo (brak polityk = deny).
drop policy if exists og_accounts_sel on og_accounts;
create policy og_accounts_sel on og_accounts for select to authenticated
  using (owner_auth_id = auth.uid());
drop policy if exists og_accounts_upd on og_accounts;
create policy og_accounts_upd on og_accounts for update to authenticated
  using (owner_auth_id = auth.uid())
  with check (owner_auth_id = auth.uid());

-- og_customers: pełna izolacja per konto; INSERT z cudzym account_id blokuje
-- with check (nie tylko using).
drop policy if exists og_customers_all on og_customers;
drop policy if exists og_customers_sel on og_customers;
create policy og_customers_sel on og_customers for select to authenticated
  using (account_id = og_current_account_id());
drop policy if exists og_customers_ins on og_customers;
create policy og_customers_ins on og_customers for insert to authenticated
  with check (account_id = og_current_account_id());
drop policy if exists og_customers_upd on og_customers;
create policy og_customers_upd on og_customers for update to authenticated
  using (account_id = og_current_account_id())
  with check (account_id = og_current_account_id());
drop policy if exists og_customers_del on og_customers;
create policy og_customers_del on og_customers for delete to authenticated
  using (account_id = og_current_account_id());

-- og_review_requests: front tylko SELECT swoich (zapis: worker, F4).
drop policy if exists og_requests_all on og_review_requests;
drop policy if exists og_requests_sel on og_review_requests;
create policy og_requests_sel on og_review_requests for select to authenticated
  using (account_id = og_current_account_id());

-- og_metrics_snapshots: front tylko SELECT swoich.
drop policy if exists og_snapshots_sel on og_metrics_snapshots;
create policy og_snapshots_sel on og_metrics_snapshots for select to authenticated
  using (account_id = og_current_account_id());

-- og_reviews: SELECT swoich; UPDATE tylko swoich i tylko do statusów
-- decyzyjnych — 'published' ustawia wyłącznie operator (F5).
drop policy if exists og_reviews_sel on og_reviews;
create policy og_reviews_sel on og_reviews for select to authenticated
  using (account_id = og_current_account_id());
drop policy if exists og_reviews_upd on og_reviews;
create policy og_reviews_upd on og_reviews for update to authenticated
  using (account_id = og_current_account_id())
  with check (account_id = og_current_account_id()
              and status in ('accepted','edited','skipped'));

-- og_wa_sessions: front tylko SELECT swojego stanu.
drop policy if exists og_wa_sel on og_wa_sessions;
create policy og_wa_sel on og_wa_sessions for select to authenticated
  using (account_id = og_current_account_id());

-- ============================================================
-- Checklista audytu (wykonany 3.07 przez Fable — wynik w AUDYT-IZOLACJI.md):
--  [x] og_current_account_id(): pinned search_path, filtr auth.uid(), exec tylko authenticated/service.
--  [x] anon: zero grantów + zero polityk = zero dostępu.
--  [x] with check na każdym zapisie (INSERT z cudzym account_id odrzucany).
--  [x] Granty kolumnowe: nadawca SMS / STOP / treść opinii / published poza zasięgiem frontu.
--  [x] Cross-tenant FK: composite (customer_id, account_id) w 001.
--  [x] service_role nieobecny we froncie (grep repo czysty).
--  [x] Osobny projekt Supabase (F1) — decyzja architektoniczna, patrz AUDYT-IZOLACJI.md.
-- ============================================================
