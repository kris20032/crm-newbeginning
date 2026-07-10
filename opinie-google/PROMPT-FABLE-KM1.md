# 🔨 ZADANIE DLA FABLE — KM1 (Fundament + audyt izolacji) i dalej

> Wklej to jako pierwsze zadanie po `/model fable` (effort **high**, nie ultra). Pracujesz na gałęzi `feat/opinie-google` w repo `crm-newbeginning`. Cały kontekst produktu: `docs/PRD-opinie-google.md` + `docs/BLUEPRINT-opinie-google.md`. Schemat i RLS napisał Opus — Twoje pierwsze zadanie to je **rozwalić i naprawić**, potem budować.

## Kontekst w jednym akapicie
Budujemy wieloklientowy (multi-tenant) system „Opinie Google" dla lokalnych fachowców. Jeden system, wielu abonentów, **każdy widzi wyłącznie swoje dane**. Izolacja danych to jedyne twarde kryterium. Baza: **OSOBNY projekt Supabase `opinie-google` (ref `uzccwsmzmzcsijddbtzn`)** - NIE projekt CRM (decyzja z audytu izolacji F1). Osobne tabele `og_*`, całkowicie oddzielone od CRM.

## ZADANIE A — AUDYT IZOLACJI (najpierw, to Twoja przewaga)
Przejrzyj `opinie-google/db/001_schema.sql` i `002_rls.sql`. Załóż wrogiego użytkownika konta A, który próbuje dobrać się do danych konta B. Sprawdź m.in.:
1. Czy `og_current_account_id()` (SECURITY DEFINER) da się oszukać — search_path, wstrzyknięcie, brak `auth.uid()`.
2. Czy **każda** tabela `og_*` ma domknięte SELECT/INSERT/UPDATE/DELETE (nie tylko `using`, też `with check` na zapisach — inaczej user A wstawi rekord z `account_id` konta B).
3. Czy anon (niezalogowany) nie widzi niczego.
4. Czy nie zostawiłem dziury: tabela z RLS `enable` ale bez `force`, brakująca polityka, indeks ujawniający dane, funkcja/widok SECURITY DEFINER przeciekający w poprzek kont.
5. Czy `og_metrics_snapshots`/`og_reviews`/`og_wa_sessions` (zapisywane przez worker) mają poprawnie: front tylko czyta swoje, zapis wyłącznie service_role.

**Wynik A:** poprawiony `002_rls.sql` (i `001` jeśli trzeba) + krótka lista znalezionych dziur i jak je zamknąłeś. NIE aplikuj jeszcze na bazę — najpierw pokaż poprawki.

## ZADANIE B — TEST IZOLACJI (dowód, nie deklaracja)
Napisz **automatyczny test wieloklientowy** (na seedzie `003_seed_test.sql`, konta A i B): jako user A żadne zapytanie do żadnej tabeli `og_*` nie zwraca ani jednego wiersza konta B; próba insert/update z cudzym `account_id` jest odrzucona. Test ma się dać uruchomić jednym poleceniem i przejść na zielono. To bramka do dalszej budowy.

## ZADANIE C — RDZEŃ (dopiero po zielonym teście izolacji)
Buduj wg `BLUEPRINT-opinie-google.md` w tej kolejności — po KM2 mamy sprzedawalny MVP:

**Moduł 2 — Pętla zbierania (priorytet, samowystarczalny MVP):**
- Edge Function: onboarding — z `nazwa+miasto` znajdź Place ID (Places API New, Find Place/Text Search), zbuduj review link, zapisz `og_accounts`. Pokaż nazwę+adres do potwierdzenia (nie podpiąć złej firmy).
- Silnik timingu: prośby planowane na 2-4 h po zleceniu / wieczór 17-20 / sobota rano wg `timezone`, NIE od razu. pg_cron co ~15 min wypuszcza dojrzałe.
- Wysyłka SMS (SMSAPI.pl): nadawca=`sms_sender_name`, treść z `message_template` (personalizacja `{imie}`, neutralna — NIGDY „daj 5 gwiazdek"). Throttling + STOP→`opted_out` + max 1 przypomnienie.
- Cron dzienny: Places API `rating`+`userRatingCount` → `og_metrics_snapshots`.

**Moduł 4 — Monitoring + AI (po Module 2):**
- Cron 6-12 h: Places API 5 najnowszych opinii → fingerprint → nowe do `og_reviews(status=new)`.
- Szkic odpowiedzi Claude Haiku (po polsku, krótko, bez frazesów; negatyw stonowany) → `ai_reply_draft`.
- Kolejka publikacji: `accepted/edited` → widok „do wklejenia dziś". ⛔ NIGDY automat klikający w panelu Google — publikuje człowiek. Retencja treści opinii: cron czyści `text` po `purge_after` (30 dni).

**Moduł 3 — Webhook WhatsApp (może iść równolegle z 4):**
- Edge Function webhook (weryfikacja podpisu Meta), opt-in „cześć", wejście numeru klienta → kolejka, powiadomienie o opinii jako template z 3 przyciskami (Akceptuj/Edytuj/Pomiń), obsługa okna 24 h.

## Reguły twarde (nie łam)
- Sekrety (Places, SMSAPI, WhatsApp, Claude) → env Edge Functions / Supabase Vault. **Nigdy w repo, nigdy we froncie.** `service_role` tylko serwer.
- Nie aplikuj destrukcyjnych zmian na żywej bazie CRM. Tabele `og_*` są nowe; cofnięcie = `999_drop.sql`.
- Nie buduj review gating (filtrowania opinii), nie generuj fałszywych opinii.
- Effort high. Jak zaczynasz się zapętlać — zatrzymaj się i pokaż stan.

## Definicja „gotowe" dla tej tury
1. Audyt izolacji z listą dziur + poprawiony RLS. 2. Zielony automatyczny test A↛B. 3. Moduł 2 działa end-to-end na koncie testowym (numer → SMS w oknie czasowym → snapshot → trend). Reszta modułów w kolejnych turach.
