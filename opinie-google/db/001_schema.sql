-- ============================================================
-- Opinie Google — schemat bazy (Moduł 1: Fundament)
-- Prefiks og_ = "opinie google". Osobne tabele, NIE dotyka CRM.
-- Autor schematu: Opus (3.07). Audyt izolacji + budowa workerów: Fable.
-- Apply: świadomie na projekcie Supabase (zngfubfinbojfgaxdrbf), odwracalne przez 999_drop.sql.
-- ============================================================

-- Rozszerzenia (idempotentnie)
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ------------------------------------------------------------
-- og_accounts — tenant = fachowiec-abonent (np. "Janek")
-- ------------------------------------------------------------
create table if not exists og_accounts (
  id              uuid primary key default gen_random_uuid(),
  owner_auth_id   uuid unique references auth.users(id) on delete set null, -- logowanie do panelu
  business_name   text not null,                 -- nazwa firmy (też nadawca SMS)
  city            text,
  place_id        text,                           -- Google Place ID (cache bezterminowy — dozwolone)
  review_link     text,                           -- https://search.google.com/local/writereview?placeid=...
  wa_number       text,                           -- prywatny WhatsApp fachowca (kanał powiadomień), E.164
  sms_sender_name text,                           -- zarejestrowana nazwa nadawcy SMS (≤11 znaków)
  message_template text default 'Cześć {imie}! Dziękujemy za skorzystanie z naszych usług. Będzie nam miło, jeśli ocenisz nas w Google: {link}',
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
  opted_out   boolean not null default false,      -- STOP → już nie wysyłamy
  created_at  timestamptz not null default now()
);
create index if not exists og_customers_account on og_customers(account_id);
create unique index if not exists og_customers_account_phone on og_customers(account_id, phone);

-- ------------------------------------------------------------
-- og_review_requests — każda wysłana/zaplanowana prośba
-- ------------------------------------------------------------
create table if not exists og_review_requests (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references og_accounts(id) on delete cascade,
  customer_id    uuid not null references og_customers(id) on delete cascade,
  channel        text not null default 'sms' check (channel in ('sms','wa')),
  status         text not null default 'queued'
                 check (status in ('queued','scheduled','sent','delivered','failed','opted_out')),
  scheduled_at   timestamptz,                       -- silnik timingu (nie „od razu")
  sent_at        timestamptz,
  provider_msg_id text,                             -- id od SMSAPI (status doręczenia)
  reminder_count smallint not null default 0,       -- max 1 przypomnienie (anty-spam)
  created_at     timestamptz not null default now()
);
create index if not exists og_requests_account on og_review_requests(account_id);
create index if not exists og_requests_due on og_review_requests(status, scheduled_at);

-- ------------------------------------------------------------
-- og_metrics_snapshots — dzienny snapshot z Places API (licznik postępu)
-- ------------------------------------------------------------
create table if not exists og_metrics_snapshots (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references og_accounts(id) on delete cascade,
  snapshot_date     date not null,
  rating            numeric(2,1),                   -- np. 4.8
  user_rating_count integer,
  created_at        timestamptz not null default now(),
  unique(account_id, snapshot_date)
);
create index if not exists og_snapshots_account on og_metrics_snapshots(account_id, snapshot_date);

-- ------------------------------------------------------------
-- og_reviews — opinie wykryte w monitoringu (Filar 2)
-- UWAGA zgodność Places: treść (text) przechowujemy MAX 30 dni → purge_after + cron czyszczący.
-- ------------------------------------------------------------
create table if not exists og_reviews (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references og_accounts(id) on delete cascade,
  fingerprint   text not null,                      -- hash(author+time+text) — detekcja „nowej" bez stabilnego ID
  author_name   text,
  rating        smallint,
  text          text,
  review_time   timestamptz,                        -- czas opinii wg Google
  detected_at   timestamptz not null default now(),
  status        text not null default 'new'
                check (status in ('new','draft_sent','accepted','edited','skipped','published')),
  ai_reply_draft text,
  final_reply   text,                               -- to, co idzie do publikacji
  published_at  timestamptz,
  published_by  text,
  purge_after   timestamptz not null default (now() + interval '30 days'),
  unique(account_id, fingerprint)
);
create index if not exists og_reviews_account on og_reviews(account_id, status);
create index if not exists og_reviews_purge on og_reviews(purge_after);

-- ------------------------------------------------------------
-- og_wa_sessions — stan rozmowy WhatsApp z fachowcem (opt-in + przyciski)
-- ------------------------------------------------------------
create table if not exists og_wa_sessions (
  account_id          uuid primary key references og_accounts(id) on delete cascade,
  wa_number           text not null,
  opted_in_at         timestamptz,                  -- kiedy napisał pierwsze „cześć" (opt-in)
  last_interaction_at timestamptz,                  -- pilnowanie okna 24h WhatsApp
  conversation_state  jsonb not null default '{}'::jsonb
);
