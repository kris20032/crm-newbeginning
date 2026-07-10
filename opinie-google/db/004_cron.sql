-- ============================================================
-- Opinie Google - harmonogram (pg_cron + pg_net wywołują Edge Functions)
-- SZABLON: przed uruchomieniem podmień <PROJECT_REF> na ref NOWEGO projektu
-- i zapisz DWA sekrety w Vault (raz każdy):
--   select vault.create_secret('<WARTOSC_OG_SERVICE_KEY>', 'og_service_key');
--   select vault.create_secret('<ANON_KEY>', 'og_anon_key');
-- Wymaga rozszerzeń: pg_cron, pg_net (Supabase: Database -> Extensions).
--
-- ⚠️ KOLEJNOŚĆ: funkcje MUSZĄ być wcześniej zdeployowane (SETUP Krok 3)
--    ZANIM odpalisz ten plik (SETUP Krok 4) - inaczej crony walą w puste URL-e.
--
-- Autoryzacja wywołań (dwutorowo, defensywnie):
--   1) x-og-service-key - nasz własny klucz, sprawdza go requireServiceKey()
--      w kodzie każdej funkcji (to jest właściwa bramka).
--   2) Authorization: Bearer <anon_key> - awaryjnie, na wypadek gdyby
--      supabase/config.toml (verify_jwt=false) nie zadziałał: anon key
--      przechodzi domyślną bramkę JWT Supabase. Anon key jest publiczny
--      z natury (używa go front), ale i tak trzymamy go w Vault, bo jest
--      specyficzny dla projektu.
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
declare svc text; anon text;
begin
  select decrypted_secret into svc  from vault.decrypted_secrets where name = 'og_service_key';
  select decrypted_secret into anon from vault.decrypted_secrets where name = 'og_anon_key';
  perform net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/' || fn,
    headers := jsonb_build_object(
                 'x-og-service-key', svc,
                 'Authorization',    'Bearer ' || anon,
                 'content-type',     'application/json'),
    body    := '{}'::jsonb
  );
end $$;
revoke all on function og_call_edge(text) from public, anon, authenticated;

-- Wysyłka dojrzałych próśb + przypomnienia: co 15 minut.
select cron.schedule('og-dispatch', '*/15 * * * *', $$select og_call_edge('og-dispatch')$$);

-- Snapshot metryk + retencja treści opinii: codziennie 06:10 UTC (=8:10 PL latem).
select cron.schedule('og-snapshot', '10 6 * * *', $$select og_call_edge('og-snapshot')$$);

-- Monitoring nowych opinii + szkice AI + powiadomienia WA: co 6 h.
select cron.schedule('og-monitor', '20 5,11,17,23 * * *', $$select og_call_edge('og-monitor')$$);

-- Podgląd/wyłączenie:
--   select * from cron.job;
--   select cron.unschedule('og-dispatch'); select cron.unschedule('og-snapshot'); select cron.unschedule('og-monitor');
