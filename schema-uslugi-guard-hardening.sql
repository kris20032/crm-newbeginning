-- ============================================================
--  HARDENING STRAŻNIKA USŁUG (clients_guard) — do wykonania w Supabase SQL Editor
-- ------------------------------------------------------------
--  Domyka dwie rzeczy, które dotąd żyły tylko po stronie przeglądarki:
--
--  A) Sprzedana usługa (services[key].sold_at ustawione) jest dla NIE-admina
--     W CAŁOŚCI niezmienialna — także CENA i OKRES. Wcześniej strażnik pilnował
--     tylko sold_at + odznaczenia, więc zwykły sprzedawca mógł PATCH-em przez REST
--     podmienić cenę sprzedanej usługi (omijając zablokowany UI). Teraz baza cicho
--     przywraca cały sprzedany wiersz. ADMIN (lub rola z „partners.revoke") edytuje
--     bez ograniczeń — to jest serwerowe pokrycie przycisku „Edytuj usługi (admin)".
--
--  B) Próg „Umowa wysłana" (wymagana świeża, niesprzedana usługa) — ADMIN go pomija.
--     Bez tego karta partnera na retencji (same stare sprzedane usługi) nie dała się
--     przesunąć w lejku NAWET adminowi, bo blokada siedziała w bazie dla wszystkich.
--
--  Idempotentne: to samo `create or replace` co w schema-rbac-enforce.sql — można
--  puścić wielokrotnie. Trigger trg_clients_guard już istnieje i wskazuje tę funkcję,
--  więc podmiana samej funkcji wystarcza. ROLLBACK = wykonaj ponownie starą wersję
--  funkcji ze schema-rbac-enforce.sql sprzed tej zmiany.
-- ============================================================
begin;

create or replace function public.clients_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare o int; n int; k text; osv jsonb; nsv jsonb; is_admin boolean;
begin
  if auth.uid() is null then return new; end if;             -- SQL Editor / service_role: pełne prawa
  is_admin := (public.my_role() = 'admin');
  o := case when tg_op = 'INSERT' then 1 else public.stage_rank(old.status) end;
  n := public.stage_rank(new.status);
  osv := case when tg_op = 'INSERT' then '{}'::jsonb else coalesce(old.services, '{}'::jsonb) end;
  nsv := coalesce(new.services, '{}'::jsonb);

  -- PROGI (tylko gdy karta idzie W PRZÓD ponad próg) — twardo, bo to celowe obejście:
  if n > o then
    -- (B) próg „Umowa wysłana": wymagana świeża usługa — ADMIN pomija
    if n >= public.stage_rank('oferta') and o < public.stage_rank('oferta')
       and not is_admin
       and not exists (select 1 from jsonb_each(nsv) e
                       where coalesce((e.value->>'on')::boolean, false)
                         and (e.value->>'sold_at') is null) then
      raise exception 'Próg „Umowa wysłana": wymagana min. 1 nowa (niesprzedana) usługa';
    end if;
    if n >= public.stage_rank('konwersja') and o < public.stage_rank('konwersja')
       and not is_admin then
      raise exception 'Próg „Umowa podpisana": przenosi tylko admin (przycisk „Nadaj token")';
    end if;
    if n >= public.stage_rank('checklista') and o < public.stage_rank('checklista')
       and not ((new.checklist->>'paid') is not null
                and coalesce((new.checklist->>'materials')::boolean, false)) then
      raise exception 'Próg „Checklista gotowa": checklista niekompletna (płatność + materiały)';
    end if;
    if n >= public.stage_rank('w_realizacji')
       and not (select public.authorize('stages.realizacja')) then
      raise exception 'Etapy realizacji: wymagane uprawnienie „stages.realizacja" (albo admin)';
    end if;
  end if;

  -- TOKEN partnera: nadać może tylko admin; zdjąć (→ null) tylko „partners.revoke".
  if new.partner_since is distinct from (case when tg_op = 'INSERT' then null else old.partner_since end) then
    if tg_op = 'UPDATE' and old.partner_since is not null and new.partner_since is null then
      if not (select public.authorize('partners.revoke')) then new.partner_since := old.partner_since; end if;
    elsif not is_admin then
      new.partner_since := case when tg_op = 'INSERT' then null else old.partner_since end;
    end if;
  end if;

  -- (A) Usługi sprzedane: dla NIE-admina (bez „partners.revoke") sprzedany wiersz jest W CAŁOŚCI
  -- niezmienialny — także cena i okres. ADMIN edytuje bez ograniczeń.
  if tg_op = 'UPDATE' and not is_admin and not (select public.authorize('partners.revoke')) then
    for k in select jsonb_object_keys(osv) loop
      if (osv->k->>'sold_at') is not null
         and (nsv->k) is distinct from (osv->k) then
        nsv := jsonb_set(nsv, array[k], (osv->k));           -- cicho przywróć CAŁY sprzedany wiersz
      end if;
    end loop;
    new.services := nsv;
  end if;

  return new;
end $$;

commit;
