-- ============================================================
-- Opinie Google — 005: skrzynka nadawcza (tryb na sucho) + kolejka publikacji
-- ============================================================

-- og_outbox — KAŻDA wysyłka (SMS/WhatsApp) zostawia tu ślad.
-- W trybie na sucho (OG_DRY_MODE=1 / brak tokenów) wiadomości NIE idą w świat,
-- tylko lądują tutaj ze statusem 'dry' → pełny test bez kont zewnętrznych.
create table if not exists og_outbox (
  id         uuid primary key default gen_random_uuid(),
  channel    text not null check (channel in ('sms','wa')),
  recipient  text not null,
  payload    jsonb not null,
  status     text not null default 'dry' check (status in ('dry','sent','failed')),
  error      text,
  created_at timestamptz not null default now()
);
create index if not exists og_outbox_created on og_outbox(created_at desc);

-- Tylko worker (service_role). Front: zero dostępu (brak grantów + RLS bez polityk).
revoke all on og_outbox from anon, authenticated;
alter table og_outbox enable row level security;
alter table og_outbox force row level security;

-- Kolejka publikacji dla OPERATORA (my): odpowiedzi zatwierdzone/edytowane,
-- czekające na ręczne wklejenie w Google. Używana przez panel operatora
-- (service_role); security_invoker → zwykły user i tak nic tu nie zobaczy.
create or replace view og_publish_queue
with (security_invoker = true) as
select r.id,
       a.business_name,
       a.place_id,
       r.author_name,
       r.rating,
       r.text        as review_text,
       r.final_reply,
       r.status,
       r.detected_at
from og_reviews r
join og_accounts a on a.id = r.account_id
where r.status in ('accepted','edited')
order by r.detected_at;
