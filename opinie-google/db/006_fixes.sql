-- ============================================================
-- Opinie Google - 006: poprawki po audycie Fable (10.07.2026)
-- Migracja NAPRZOD (forward-only). Aplikowac PO 001+002+005, PRZED 004 (crony).
-- Cofniecie: 999_drop.sql (usuwa wszystkie obiekty og_*).
--
-- Co naprawia (numery z raportu AUDYT-OPINIE-GOOGLE-FABLE-2026-07-10.md):
--   * STOP: nowe statusy + brak - flaga opted_out ustawiana kodem (webhook/operator).
--   * double-send: status 'sending' (atomowe zaklepanie w og-dispatch).
--   * throttle race: czesciowy unikalny indeks na aktywne prosby per klient.
--   * wa_number jako klucz tozsamosci: unikalny + zabrany frontowi (tylko operator).
--   * Omnibus/zgoda: kolumna consent_attested_at (atestacja zgody klienta).
--   * monitor baseline: kolumna baselined_at (jawny stan baseline per konto).
--   * Petla 2 retry: status 'notify_failed' (powiadomienie WA nie doszlo).
--   * cofanie 'published': front nie moze ruszyc opublikowanej opinii.
--   * idempotencja webhooka: tabela og_wa_processed (dedup po msg.id od Mety).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Nowe statusy prosby (sending) i opinii (notify_failed)
-- ------------------------------------------------------------
alter table og_review_requests drop constraint if exists og_review_requests_status_check;
alter table og_review_requests add constraint og_review_requests_status_check
  check (status in ('queued','scheduled','sending','sent','delivered','failed','cancelled','opted_out'));

alter table og_reviews drop constraint if exists og_reviews_status_check;
alter table og_reviews add constraint og_reviews_status_check
  check (status in ('new','draft_sent','notify_failed','accepted','edited','skipped','published'));

-- ------------------------------------------------------------
-- 2. Throttle bez race: max 1 AKTYWNA prosba na klienta koncowego.
--    (30-dniowy throttle na juz wyslane pilnuje kod; tu blokujemy
--    rownolegle wstawienie drugiej aktywnej prosby - count-then-insert.)
-- ------------------------------------------------------------
create unique index if not exists og_review_requests_active_uq
  on og_review_requests (customer_id)
  where status in ('queued','scheduled','sending');

-- ------------------------------------------------------------
-- 3. wa_number = klucz tozsamosci konta w webhooku WhatsApp.
--    (a) unikalny (dwa konta z tym samym numerem = kolizja/DoS),
--    (b) zabrany frontowi - zmienia TYLKO operator (jak sms_sender_name, F3).
-- ------------------------------------------------------------
create unique index if not exists og_accounts_wa_number_uq
  on og_accounts (wa_number) where wa_number is not null;

revoke update (wa_number) on og_accounts from authenticated;
-- (message_template zostaje edytowalny z frontu, ale og-dispatch waliduje tresc
--  przed wysylka: wymog {link} + deny-lista fraz gating/zachet - patrz kod funkcji.)

-- ------------------------------------------------------------
-- 4. Zgodnosc: atestacja zgody klienta koncowego na SMS (art. 172 PKE / RODO).
--    Wypelniana przy przyjeciu numeru (bot WA / operator) = nasza nalezyta starannosc.
-- ------------------------------------------------------------
alter table og_customers add column if not exists consent_attested_at timestamptz;

-- ------------------------------------------------------------
-- 5. Monitor: jawny stan baseline per konto (zamiast kruchego count==0).
--    Ustawiany po pierwszym UDANYM pelnym przebiegu og-monitor dla konta.
-- ------------------------------------------------------------
alter table og_accounts add column if not exists baselined_at timestamptz;

-- Kursor odpytywania Places (og-monitor/og-snapshot iteruja porcjami po 50;
-- najdawniej odpytane konto idzie pierwsze - ogon listy nie jest glodzony).
alter table og_accounts add column if not exists last_polled_at timestamptz;
create index if not exists og_accounts_last_polled on og_accounts (last_polled_at nulls first);

-- ------------------------------------------------------------
-- 6. Front nie moze cofnac opublikowanej opinii (published -> accepted).
--    Odtwarzamy polityke UPDATE z dodatkowym warunkiem: wiersz 'published' poza zasiegiem.
-- ------------------------------------------------------------
drop policy if exists og_reviews_upd on og_reviews;
create policy og_reviews_upd on og_reviews for update to authenticated
  using (account_id = og_current_account_id() and status <> 'published')
  with check (account_id = og_current_account_id()
              and status in ('accepted','edited','skipped'));

-- ------------------------------------------------------------
-- 7. Idempotencja webhooka WhatsApp: Meta dostarcza >=1 raz i ponawia.
--    Kazdy msg.id przetwarzamy dokladnie raz (insert on conflict do nothing).
--    Tylko worker (service_role); front: zero dostepu.
-- ------------------------------------------------------------
create table if not exists og_wa_processed (
  msg_id       text primary key,
  processed_at timestamptz not null default now()
);
create index if not exists og_wa_processed_at on og_wa_processed (processed_at);
revoke all on og_wa_processed from anon, authenticated;
alter table og_wa_processed enable row level security;
alter table og_wa_processed force row level security;

-- ------------------------------------------------------------
-- 8. Retencja og_wa_processed i og_outbox (higiena; szczegoly czyszczenia w og-snapshot).
--    Indeks pod czyszczenie po dacie juz jest (og_outbox_created w 005).
-- ------------------------------------------------------------
-- (samo czyszczenie robi cron og-snapshot - patrz functions/og-snapshot/index.ts)

-- ------------------------------------------------------------
-- 9. Nowy domyslny szablon SMS: bez spacji przed {imie} (fillTemplate sam ja
--    wstawia) + informacja o rezygnacji (STOP) = wymog prawny (art. 172 PKE).
--    GSM-7 (bez polskich znakow diakrytycznych) = tanszy SMS.
-- ------------------------------------------------------------
alter table og_accounts alter column message_template set default
  'Czesc{imie}! Dziekujemy za skorzystanie z naszych uslug. Bedzie nam milo, jesli ocenisz nas w Google: {link} Nie chcesz takich wiadomosci? Odpisz STOP.';

-- Konta wciaz na STARYM domyslnym szablonie -> przenies na nowy (nie ruszamy
-- kont, ktore maja wlasny, spersonalizowany szablon).
update og_accounts set message_template =
  'Czesc{imie}! Dziekujemy za skorzystanie z naszych uslug. Bedzie nam milo, jesli ocenisz nas w Google: {link} Nie chcesz takich wiadomosci? Odpisz STOP.'
where message_template =
  'Czesc {imie}! Dziekujemy za skorzystanie z naszych uslug. Bedzie nam milo, jesli ocenisz nas w Google: {link}';
