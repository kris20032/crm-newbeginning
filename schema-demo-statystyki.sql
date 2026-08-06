-- Widok demo_statystyki — licznik otwarć dem pokazywany na karcie klienta i na kanbanie.
-- Stan: 06.08.2026. Zmiana wobec pierwotnej wersji: filtr „tylko Polska” NIE wystarczał.
--
-- CO BYŁO ZŁE (case Waldemar / Remonty na Plus, 06.08.2026):
--   demo zbudowane 05.08 o 17:15, link wysłany klientowi mailem dopiero 06.08 o 9:53,
--   a karta pokazywała „1 otwarcie, ostatnie 05.08 17:33”. Tym „klientem” był skaner
--   z IP 159.26.110.105 (Warszawa, datacenter), który tego dnia obszedł 14 różnych dem.
--   Filtr country='PL' go przepuszczał, bo skanery stoją także w polskich serwerowniach.
--
-- CO ODSIEWAMY (warstwami, od najtańszej do najsprytniejszej):
--   1. kraj inny niż Polska (zagraniczne skanery, boty podglądu linku Facebooka),
--   2. user_agent narzędzi: headless (nasze zrzuty), „X11; Linux x86_64” (skanery
--      z datacenter podszywające się pod przeglądarkę), boty/crawlery/preview,
--   3. wejścia z KORZENIA naszej listy dem (kris20032.github.io / impulseo-pl.github.io)
--      oraz z CRM — tak wchodzi zespół, klient wchodzi z maila lub SMS-a,
--   4. IP, które tego samego DNIA otworzyło ≥3 różne dema = skaner albo ktoś z zespołu
--      (klient ogląda jedno demo — swoje),
--   5. IP, które w całej historii dotknęło ≥8 różnych dem = nasze urządzenie / urządzenie
--      zespołu (znacznik nb_team ze strony /zespol/ działa tylko na tej przeglądarce,
--      w której go kliknięto — telefony zespołu wciąż wpadały do licznika).
--
-- EFEKT NA DANYCH (06.08.2026): z 2362 wejść „z Polski” zostaje 882 realnych.
--   PecStal (najgorętszy lead, klient sam rozniósł link po Facebooku) zachowuje 94 otwarcia
--   z 96 — czyli filtr tnie szum, nie sygnał.
--
-- COFNIĘCIE: stara definicja leży w
--   ~/Developer/_archive/2026-08-06-licznik-otwarc/demo_statystyki-STARA-DEFINICJA.sql

create or replace view public.demo_statystyki as
with baza as (
  select lower(regexp_replace(regexp_replace(rtrim(demo_url,'/'),'/[a-z0-9_-]+\.html$',''),'^.*/','')) as slug,
         opened_at, city, referrer, ip, user_agent
  from demo_views
  where country = 'PL'
    and ip is not null
    and coalesce(user_agent,'') !~* '(headless|x11; linux|bot|crawl|spider|slurp|preview|scan|monitor|python-|curl/|wget|facebookexternalhit|phantom|puppeteer|playwright|lighthouse|pagespeed|uptime|pingdom)'
    and coalesce(referrer,'') !~* '^https?://(kris20032|impulseo-pl)\.github\.io/?$'
    and coalesce(referrer,'') !~* 'crm-newbeginning'
), skanery as (
  select ip, date(opened_at) as d from baza group by ip, date(opened_at) having count(distinct slug) >= 3
), nasze as (
  select ip from baza group by ip having count(distinct slug) >= 8
), wejscia as (
  select b.* from baza b
  where not exists (select 1 from skanery s where s.ip = b.ip and s.d = date(b.opened_at))
    and not exists (select 1 from nasze n where n.ip = b.ip)
)
select slug,
  count(*) as otwarcia,
  count(distinct ip) as osoby,
  count(*) filter (where referrer ilike '%facebook%') as z_facebooka,
  count(distinct city) as miasta,
  count(distinct date(opened_at)) as dni,
  min(opened_at) as pierwsze,
  max(opened_at) as ostatnie
from wejscia
where slug <> '' and slug not like '%.html' and slug not like 'localhost%' and slug not like '127.0.0.1%'
group by slug;
