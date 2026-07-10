# Opinie Google — produkt abonamentowy

Wieloklientowy system zbierania i obsługi opinii Google dla lokalnych fachowców. Upsell po sprzedaży strony.

- **Plan biznesowy + research:** [`../docs/PRD-opinie-google.md`](../docs/PRD-opinie-google.md)
- **Plan budowy (moduł po module):** [`../docs/BLUEPRINT-opinie-google.md`](../docs/BLUEPRINT-opinie-google.md)
- **Zadanie startowe dla Fable:** [`PROMPT-FABLE-KM1.md`](PROMPT-FABLE-KM1.md)

## Status (3.07, po turze Fable KM1+KM2-kod)
| Element | Stan |
|---|---|
| Blueprint techniczny | ✅ gotowy (Opus, 3.07) |
| **Audyt izolacji (Fable)** | ✅ zrobiony — 10 znalezisk, wszystkie fixy wprowadzone → [`AUDYT-IZOLACJI.md`](AUDYT-IZOLACJI.md) |
| Schemat bazy `og_*` (`db/001`) v2 | ✅ po audycie (composite FK, retencja, koszt SMS) |
| Izolacja: granty + RLS (`db/002`) v2 | ✅ po audycie (2 warstwy: granty kolumnowe + force RLS) |
| **Osobny projekt Supabase (F1)** | ✅ **`opinie-google` ref `uzccwsmzmzcsijddbtzn`** (3.07, Frankfurt; świeży, dedykowany produktowi) |
| **Schemat + RLS na żywej bazie** | ✅ zaaplikowane 3.07 (SQL Editor) |
| **Test izolacji (`tests/test-izolacja.sql`)** | ✅ **PRZESZEDŁ 14/14 na żywej bazie (3.07)** |
| Moduł 2 — funkcje (onboard, request, dispatch, snapshot) | ✅ kod gotowy (`functions/`) |
| **Moduł 3 — bot WhatsApp (`og-wa-webhook`)** | ✅ kod gotowy (3.07): opt-in, numer→kolejka, 3 przyciski, tryb Edytuj, podpis Meta |
| **Moduł 4 — monitoring+AI (`og-monitor`)** | ✅ kod gotowy (3.07): detekcja nowych (baseline bez spamu), szkic AI (Haiku + fallback), powiadomienie z przyciskami, retencja |
| **Tryb NA SUCHO (og_outbox)** | ✅ LIVE (005): bez kluczy każda wysyłka ląduje w skrzynce zamiast iść w świat — pełne testy bez kont |
| Kolejka publikacji (`og_publish_queue`) | ✅ LIVE (005) — przetestowana na żywej bazie |
| Testy: logika (Node) + baza | ✅ 31/31 pure.test + izolacja 14/14 + test Pętli 2 na żywo |
| Harmonogram cronów (`db/004`) | ✅ szablon (dispatch, snapshot, monitor) — ⏳ przy deployu |
| **Audyt maszyny (Fable, 10.07)** | ✅ zrobiony - 5 usterek wdrożeniowych znalezionych i zamkniętych |
| **Poprawki po audycie (`db/006` + hardening funkcji + `supabase/config.toml`)** | ✅ na gałęzi `feat/opinie-google` - ⏳ do zaaplikowania przy deployu |
| Deploy funkcji + klucze (Places, SMSAPI, WhatsApp, Anthropic) | ⏳ ostatni krok przed realnym startem (SETUP Krok 2-4) |
| Panel + widget (Moduł 5) | ⏳ Opus/Sonnet po 7.07 |

## Struktura
```
opinie-google/
  db/
    001_schema.sql       - tabele og_* (Moduł 1)
    002_rls.sql          - izolacja danych (RLS) ⭐ serce bezpieczeństwa
    003_seed_test.sql    - 2 konta A/B do testów izolacji
    004_cron.sql         - harmonogram (pg_cron wywołuje Edge Functions)
    005_outbox_queue.sql - skrzynka nadawcza (tryb na sucho) + kolejka publikacji
    006_fixes.sql        - poprawki po audycie 10.07 (m.in. idempotencja webhooka)
    999_drop.sql         - cofnięcie (pełna odwracalność)
  functions/             - (Fable) Edge Functions: onboarding, wysyłka SMS, webhook WhatsApp, monitoring
    _shared/             - wspólny kod funkcji (util.ts, pure.mjs)
  supabase/
    config.toml          - konfiguracja deployu (verify_jwt=false dla funkcji)
  tests/                 - testy: logika (Node) + izolacja (SQL)
  README.md              - ten plik
  SETUP.md               - checklista uruchomienia od zera
  AUDYT-IZOLACJI.md      - wynik audytu izolacji (Fable)
  PROMPT-FABLE-KM1.md    - zadanie startowe dla Fable
```

## Jak uruchomić
Cała ścieżka krok po kroku: [`SETUP.md`](SETUP.md).
⚠️ **Baza: OSOBNY projekt Supabase** (wynik audytu F1 — NIE projekt CRM: jego polityki dają każdemu zalogowanemu pełny wgląd, więc abonenci nie mogą dzielić z nim puli logowań).
Kolejność SQL: `001_schema.sql` → `002_rls.sql` → **bramka** `tests/test-izolacja.sql` (musi być ✅) → `005_outbox_queue.sql` → `006_fixes.sql` → `004_cron.sql` (crony na końcu, po deployu funkcji).
Cofnięcie w każdej chwili: `999_drop.sql` (usuwa tylko `og_*`).

## Zasady (jak w całym New Beginning)
- Osobna gałąź `feat/opinie-google`, nie na żywym CRM.
- Sekrety (Places, SMSAPI, WhatsApp, Claude API) → Supabase Vault / env, **nigdy w repo, nigdy we froncie**.
- `service_role` (omija RLS) tylko po stronie workera/Edge Function.
- ⛔ Nigdy bot klikający w panelu Google (naraża wizytówkę klienta). Publikacja = człowiek lub Business Profile API po approval.
