-- ============================================================
-- Opinie Google — schemat bazy (Moduł 1: Fundament)  v2 po audycie Fable
-- Prefiks og_ = "opinie google".
-- ⚠️ ARCHITEKTURA (znalezisko F1 audytu): aplikować na OSOBNYM projekcie
--    Supabase (nie tym od CRM) — CRM ma polityki "każdy zalogowany widzi
--    wszystko" (słusznie dla zespołu), więc abonenci NIE mogą dzielić z nim
--    puli logowań. Osobny projekt = osobna pula auth + własne klucze.
-- Odwracalność: 999_drop.sql.
-- Zmiany v2 (audyt): composite FK og_review_requests→og_customers (F2),
--    kolumny error/cancelled, komentarze bezpieczeństwa.
-- ============================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ------------------------------------------------------------
-- og_accounts — tenant = fachowiec-abonent (np. "Janek")
-- ------------------------------------------------------------
create table if not exists og_accounts (
  id              uuid primary key default gen_random_uuid(),
  owner_auth_id   uuid unique references auth.users(id) on delete set null, -- logowanie do panelu
  business_name   text not null,                 -- nazwa firmy
  city            text,
  place_id        text,                           -- Google Place ID (cache bezterminowy — dozwolone)
  review_link     text,                           -- https://search.google.com/local/writereview?placeid=...
  wa_number       text,                           -- prywatny WhatsApp fachowca, E.164
  sms_sender_name text,                           -- zarejestrowany nadawca SMS (≤11 znaków) — ZMIENIA TYLKO OPERATOR (F3)
  message_template text default 'Czesc {imie}! Dziekujemy za skorzystanie z naszych uslug. Bedzie nam milo, jesli ocenisz nas w Google: {link}',
  -- ^ celowo BEZ polskich znaków: SMS z diakrytykami = 70 zn./segment (UCS-2) vs 160 (GSM-7) → 2x koszt
  plan_price      integer,                         -- 49/79/99 (informacyjnie, faktura ręczna)
  timezone        text not null default 'Europe/Warsaw',
  status          text not null default 'active' check (status in ('active','paused')),
  created_at      timestamptz not null default now()
);

-- ------------------------------------------------------------
-- og_customers — klienci końcowi fachowca (odbiorcy prośby o opinię)
-- ------------------------------------------------------------
create table if not exists og_customers (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references og_accounts(id) on delete cascade,
  phone       text not null,                       -- E.164
  name        text,                                -- personalizacja imieniem
  opted_out   boolean not null default false,      -- STOP → już nie wysyłamy; ZMIENIA TYLKO WORKER (F7)
  created_at  timestamptz not null default now(),
  unique (id, account_id)                          -- cel composite FK (F2): wymusza spójność tenant↔klient
);
create index if not exists og_customers_account on og_customers(account_id);
create unique index if not exists og_customers_account_phone on og_customers(account_id, phone);

-- ------------------------------------------------------------
-- og_review_requests — każda wysłana/zaplanowana prośba
-- Zapis WYŁĄCZNIE przez workera (service_role) — front tylko czyta (F4).
-- To też nasz dowód Omnibus (prośba = realne zlecenie) — nieusuwalny z frontu.
-- ------------------------------------------------------------
create table if not exists og_review_requests (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references og_accounts(id) on delete cascade,
  customer_id    uuid not null,
  channel        text not null default 'sms' check (channel in ('sms','wa')),
  status         text not null default 'queued'
                 check (status in ('queued','scheduled','sent','delivered','failed','cancelled','opted_out')),
  scheduled_at   timestamptz,                       -- silnik timingu (nie „od razu")
  sent_at        timestamptz,
  provider_msg_id text,                             -- id od SMSAPI (status doręczenia)
  reminder_count smallint not null default 0,       -- max 1 przypomnienie (anty-spam)
  error          text,                              -- powód failed/cancelled (np. throttled)
  created_at     timestamptz not null default now(),
  -- F2: composite FK — klient MUSI należeć do tego samego konta co prośba.
  foreign key (customer_id, account_id) references og_customers(id, account_id) on delete cascade
);
create index if not exists og_requests_account on og_review_requests(account_id);
create index if not exists og_requests_due on og_review_requests(status, scheduled_at);

-- ------------------------------------------------------------
-- og_metrics_snapshots — dzienny snapshot z Places API (licznik postępu)
-- Zapis: tylko worker. Front: odczyt swoich.
-- ------------------------------------------------------------
create table if not exists og_metrics_snapshots (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references og_accounts(id) on delete cascade,
  snapshot_date     date not null,
  rating            numeric(2,1),
  user_rating_count integer,
  created_at        timestamptz not null default now(),
  unique(account_id, snapshot_date)
);
create index if not exists og_snapshots_account on og_metrics_snapshots(account_id, snapshot_date);

-- ------------------------------------------------------------
-- og_reviews — opinie wykryte w monitoringu (Filar 2)
-- Zgodność Places: treść (text) MAX 30 dni → purge_after + cron czyszczący.
-- Front zmienia TYLKO status (bez 'published') i final_reply (F5).
-- ------------------------------------------------------------
create table if not exists og_reviews (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references og_accounts(id) on delete cascade,
  fingerprint   text not null,                      -- hash(author+time+text) — detekcja „nowej"
  author_name   text,
  rating        smallint,
  text          text,
  review_time   timestamptz,
  detected_at   timestamptz not null default now(),
  status        text not null default 'new'
                check (status in ('new','draft_sent','accepted','edited','skipped','published')),
  ai_reply_draft text,
  final_reply   text,
  published_at  timestamptz,                        -- ustawia TYLKO operator (service_role)
  published_by  text,
  purge_after   timestamptz not null default (now() + interval '30 days'),
  unique(account_id, fingerprint)
);
create index if not exists og_reviews_account on og_reviews(account_id, status);
create index if not exists og_reviews_purge on og_reviews(purge_after);

-- ------------------------------------------------------------
-- og_wa_sessions — stan rozmowy WhatsApp z fachowcem (opt-in + przyciski)
-- Zapis: tylko worker (webhook WhatsApp).
-- ------------------------------------------------------------
create table if not exists og_wa_sessions (
  account_id          uuid primary key references og_accounts(id) on delete cascade,
  wa_number           text not null,
  opted_in_at         timestamptz,
  last_interaction_at timestamptz,                  -- pilnowanie okna 24h WhatsApp
  conversation_state  jsonb not null default '{}'::jsonb
);

-- ⚠️ CELOWO: żadnej tabeli og_* NIE dodajemy do publication supabase_realtime.
