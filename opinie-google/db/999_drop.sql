-- ============================================================
-- Opinie Google — COFNIĘCIE (odwracalność fundamentu)
-- Usuwa wszystkie tabele/funkcje og_*. NIE dotyka CRM.
-- Użyj, jeśli chcesz zacząć schemat od zera. Bezpieczne — to osobne tabele.
-- ============================================================
drop function if exists og_current_account_id() cascade;
drop table if exists og_wa_sessions cascade;
drop table if exists og_reviews cascade;
drop table if exists og_metrics_snapshots cascade;
drop table if exists og_review_requests cascade;
drop table if exists og_customers cascade;
drop table if exists og_accounts cascade;
