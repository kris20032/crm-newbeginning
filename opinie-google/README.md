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
| **Osobny projekt Supabase (F1)** | ✅ **`opinie-google` ref `uzccwsmzmzcsijddbtzn`** (3.07, Frankfurt; slot po pauzie martwego bita-crm) |
| **Schemat + RLS na żywej bazie** | ✅ zaaplikowane 3.07 (SQL Editor) |
| **Test izolacji (`tests/test-izolacja.sql`)** | ✅ **PRZESZEDŁ 14/14 na żywej bazie (3.07)** |
| Moduł 2 — funkcje (onboard, request, dispatch, snapshot) | ✅ kod gotowy (`functions/`) — ⏳ deploy (wymaga kluczy: Places, SMSAPI) |
| Harmonogram cronów (`db/004`) | ✅ szablon — ⏳ po deployu funkcji |
| Moduł 3 (bot WhatsApp) + Moduł 4 (monitoring+AI) | ⏳ następna tura Fable |
| Panel + widget (Moduł 5) | ⏳ Opus/Sonnet po 7.07 |

## Struktura
```
opinie-google/
  db/
    001_schema.sql     — tabele og_* (Moduł 1)
    002_rls.sql        — izolacja danych (RLS) ⭐ serce bezpieczeństwa
    003_seed_test.sql  — 2 konta A/B do testów izolacji
    999_drop.sql       — cofnięcie (odwracalność)
  functions/           — (Fable) Edge Functions: snapshoty, wysyłka SMS, webhook WhatsApp, monitoring
  README.md            — ten plik
  PROMPT-FABLE-KM1.md  — zadanie startowe dla Fable
```

## Jak uruchomić
Cała ścieżka krok po kroku: [`SETUP.md`](SETUP.md).
⚠️ **Baza: OSOBNY projekt Supabase** (wynik audytu F1 — NIE projekt CRM: jego polityki dają każdemu zalogowanemu pełny wgląd, więc abonenci nie mogą dzielić z nim puli logowań).
Kolejność SQL: `001_schema.sql` → `002_rls.sql` → **bramka** `tests/test-izolacja.sql` (musi być ✅) → `004_cron.sql`.
Cofnięcie w każdej chwili: `999_drop.sql` (usuwa tylko `og_*`).

## Zasady (jak w całym New Beginning)
- Osobna gałąź `feat/opinie-google`, nie na żywym CRM.
- Sekrety (Places, SMSAPI, WhatsApp, Claude API) → Supabase Vault / env, **nigdy w repo, nigdy we froncie**.
- `service_role` (omija RLS) tylko po stronie workera/Edge Function.
- ⛔ Nigdy bot klikający w panelu Google (naraża wizytówkę klienta). Publikacja = człowiek lub Business Profile API po approval.
