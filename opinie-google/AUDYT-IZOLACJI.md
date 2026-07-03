# 🔍 Audyt izolacji danych — wynik (Fable, 3.07.2026)

> Zadanie A z PROMPT-FABLE-KM1: wrogi użytkownik konta A próbuje dobrać się do danych konta B.
> Audytowane: `db/001_schema.sql`, `db/002_rls.sql` (wersja Opusa) + **zderzenie z istniejącym CRM**.
> Wszystkie poprawki wprowadzone w plikach v2. Dowód: `tests/test-izolacja.sql` (14 testów).

## Znaleziska i co z nimi zrobiono

| # | Waga | Dziura | Skutek gdyby weszło na produkcję | Fix |
|---|---|---|---|---|
| **F1** | 🔴 KRYTYCZNE | Produkt miał dzielić projekt Supabase z CRM. Polityki CRM = `to authenticated using (true)` — **każdy zalogowany w tym projekcie widzi i edytuje cały CRM**. Dziś bezpieczne (pula logowań = tylko zespół, rejestracja zamknięta), ale dodanie abonentów do tej samej puli = obcy czytają cały lejek sprzedaży. | Abonent za 79 zł/mies czyta nazwiska, numery i notatki wszystkich Waszych leadów. | **Osobny projekt Supabase dla produktu** (druga darmowa instancja): osobna pula logowań, osobne klucze, awaria/włamanie jednego nie dotyka drugiego. Decyzja operacyjna — patrz README. |
| **F2** | 🔴 Wysokie | `og_review_requests.customer_id` mógł wskazywać klienta **cudzego** konta (`with check` pilnował tylko `account_id`). | Worker wysyła SMS-y do klientów innego abonenta; mieszanie danych między tenantami. | Klucz złożony: `unique(id, account_id)` na `og_customers` + FK `(customer_id, account_id)` — baza fizycznie nie przyjmie prośby wskazującej cudzego klienta. |
| **F3** | 🔴 Wysokie | UPDATE `og_accounts` bez ograniczenia kolumn — abonent mógł zmienić `sms_sender_name`, `place_id`, `plan_price`, `status`. | **Podszywanie się w SMS-ach pod dowolną firmę** (nadawca!), celowanie prośbami w cudzą wizytówkę, samodzielna zmiana ceny. | Granty kolumnowe: front edytuje TYLKO `message_template` i `wa_number`. Reszta = operator (service_role). |
| **F4** | 🔴 Wysokie | `og_review_requests` FOR ALL z frontu — wstawianie/edycja/kasowanie próśb. | Obejście throttlingu i limitu przypomnień (spam), fałszowanie historii, kasowanie **dowodu Omnibus** (prośba = realne zlecenie). | Front tylko SELECT. Każdy zapis przez Edge Functions (walidacja + timing po stronie serwera). |
| **F5** | 🟠 Średnie | UPDATE `og_reviews` bez ograniczeń — edycja treści/oceny/autora opinii, ustawianie `published_at`, statusu `published`. | Fałszowanie treści opinii w naszej bazie; „opublikowane" bez publikacji. | Granty kolumnowe (`status`, `final_reply`) + `with check status in (accepted, edited, skipped)` — `published` ustawia tylko operator. |
| **F6** | 🟠 Średnie | Brak jawnych REVOKE — Supabase domyślnie nadaje szerokie prawa rolom `anon`/`authenticated` na nowych tabelach. | Obrona tylko jedną warstwą (RLS); literówka w polityce = dziura. | `revoke all` na start, potem granty minimalne. Dwie niezależne warstwy: granty + RLS. |
| **F7** | 🟠 Średnie | Abonent mógł UPDATE-ować `opted_out` swojego klienta. | „Odznaczenie" STOP-u = wysyłka do kogoś, kto zablokował — ryzyko prawne (RODO/nękanie). | `opted_out` zmienia tylko worker; front na `og_customers` edytuje tylko `name`. |
| **F8** | 🟡 Niskie | Seed testowy bez `owner_auth_id` — „testy izolacji" nie testowałyby nic (konta-widma). | Fałszywe poczucie bezpieczeństwa. | Test tworzy prawdziwych userów auth + pełny cykl w transakcji z rollbackiem (`tests/test-izolacja.sql`). |
| F9 | ℹ️ Info | `og_current_account_id()`: SECURITY DEFINER ok (pinned `search_path`, filtr po `auth.uid()` działa niezależnie od BYPASSRLS ownera), ale exec był dla wszystkich. | — | `revoke from public/anon`, grant tylko `authenticated`/`service_role`. |
| F10 | ℹ️ Info | Realtime: CRM dodaje tabele do `supabase_realtime`. | Przy skopiowaniu wzorca og_* wyciekałyby zdarzenia. | Jawny komentarz w 001: og_* NIE dodajemy do realtime. |

## Werdykt
Schemat v2 + RLS v2 są gotowe do zaaplikowania — **ale wyłącznie na osobnym projekcie Supabase (F1)**. Bramka: `tests/test-izolacja.sql` musi przejść na zielono (14 testów, w tym 2 „pozytywne" sprawdzające, że nie zablokowaliśmy za dużo). Dopiero potem podłączamy workery.

## Co pozostaje otwarte (świadomie)
- Test przez realne REST API (prawdziwe JWT przez GoTrue) — mocniejszy dowód niż symulacja SQL; do zrobienia po utworzeniu projektu (5 min, opisany w tests/).
- Opt-out klienta końcowego: nadawca alfanumeryczny SMS nie przyjmuje odpowiedzi „STOP" — w MVP opt-out zgłasza fachowiec przez bota; przy skali dodać link rezygnacji w treści.
- Rate-limit per konto na wysyłkę (żeby jeden abonent nie wysłał 10 000 SMS-ów na nasz koszt) — limit dzienny w `og-dispatch` (wpisany w kod, domyślnie 30/dzień/konto).
