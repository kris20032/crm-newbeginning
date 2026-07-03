-- ============================================================
-- Opinie Google — harmonogram (pg_cron + pg_net wywołują Edge Functions)
-- SZABLON: przed uruchomieniem podmień <PROJECT_REF> na ref NOWEGO projektu
-- i zapisz sekret w Vault (raz):
--   select vault.create_secret('<WARTOSC_OG_SERVICE_KEY>', 'og_service_key');
-- Wymaga rozszerzeń: pg_cron, pg_net (Supabase: Database -> Extensions).
-- ============================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Helper: wywołanie funkcji brzegowej z kluczem serwisowym z Vault.
create or replace function og_call_edge(fn text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare svc text;
begin
  select decrypted_secret into svc from vault.decrypted_secrets where name = 'og_service_key';
  perform net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/' || fn,
    headers := jsonb_build_object('x-og-service-key', svc, 'content-type', 'application/json'),
    body    := '{}'::jsonb
  );
end $$;
revoke all on function og_call_edge(text) from public, anon, authenticated;

-- Wysyłka dojrzałych próśb + przypomnienia: co 15 minut.
select cron.schedule('og-dispatch', '*/15 * * * *', $$select og_call_edge('og-dispatch')$$);

-- Snapshot metryk + retencja treści opinii: codziennie 06:10 UTC (=8:10 PL latem).
select cron.schedule('og-snapshot', '10 6 * * *', $$select og_call_edge('og-snapshot')$$);

-- Podgląd/wyłączenie:
--   select * from cron.job;
--   select cron.unschedule('og-dispatch'); select cron.unschedule('og-snapshot');
