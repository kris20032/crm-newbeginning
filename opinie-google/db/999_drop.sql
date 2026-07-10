-- ============================================================
-- Opinie Google - COFNIĘCIE (odwracalność fundamentu)
-- Usuwa wszystkie obiekty og_* (schemat 001, kolejka 005, poprawki 006,
-- crony 004). NIE dotyka CRM. Bezpieczne - to osobne tabele/obiekty.
-- Kolejność: najpierw crony/widoki/funkcje, potem tabele.
-- ============================================================

-- --- CRONY (004) - każdy w osobnym bloku, by brak crona nie wywalił reszty ---
do $$ begin perform cron.unschedule('og-dispatch'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('og-snapshot'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('og-monitor');  exception when others then null; end $$;

-- --- WIDOKI (005) ---
drop view if exists og_publish_queue cascade;

-- --- FUNKCJE (004 + 002) ---
drop function if exists og_call_edge(text) cascade;
drop function if exists og_current_account_id() cascade;

-- --- TABELE (001 + 005 + 006) ---
drop table if exists og_wa_processed cascade;      -- 006: idempotencja webhooka
drop table if exists og_outbox cascade;            -- 005: skrzynka nadawcza (tryb na sucho)
drop table if exists og_wa_sessions cascade;
drop table if exists og_reviews cascade;
drop table if exists og_metrics_snapshots cascade;
drop table if exists og_review_requests cascade;
drop table if exists og_customers cascade;
drop table if exists og_accounts cascade;
