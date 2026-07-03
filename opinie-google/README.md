# Opinie Google — produkt abonamentowy

Wieloklientowy system zbierania i obsługi opinii Google dla lokalnych fachowców. Upsell po sprzedaży strony.

- **Plan biznesowy + research:** [`../docs/PRD-opinie-google.md`](../docs/PRD-opinie-google.md)
- **Plan budowy (moduł po module):** [`../docs/BLUEPRINT-opinie-google.md`](../docs/BLUEPRINT-opinie-google.md)
- **Zadanie startowe dla Fable:** [`PROMPT-FABLE-KM1.md`](PROMPT-FABLE-KM1.md)

## Status
| Element | Stan |
|---|---|
| Blueprint techniczny | ✅ gotowy (Opus, 3.07) |
| Schemat bazy `og_*` (`db/001`) | ✅ napisany (Opus) — czeka na audyt Fable |
| Polityki izolacji RLS (`db/002`) | ✅ napisane (Opus) — ⭐ Fable audytuje PRZED apply |
| Seed testowy A/B (`db/003`) | ✅ napisany |
| Apply na Supabase | ⏳ świadomie, po audycie Fable |
| Workery (snapshoty, SMS, WhatsApp, monitoring) | ⏳ Fable — Moduły 2-4 |
| Panel + widget | ⏳ Opus/Sonnet — Moduł 5 |

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

## Jak zastosować schemat (dopiero po audycie Fable)
Kolejność: `001_schema.sql` → (poprawki Fable) → `002_rls.sql` → `003_seed_test.sql`.
Baza: projekt Supabase CRM (`zngfubfinbojfgaxdrbf`), osobne tabele `og_*` — **NIE dotyka CRM**.
Cofnięcie w każdej chwili: `999_drop.sql` (usuwa tylko `og_*`).

## Zasady (jak w całym New Beginning)
- Osobna gałąź `feat/opinie-google`, nie na żywym CRM.
- Sekrety (Places, SMSAPI, WhatsApp, Claude API) → Supabase Vault / env, **nigdy w repo, nigdy we froncie**.
- `service_role` (omija RLS) tylko po stronie workera/Edge Function.
- ⛔ Nigdy bot klikający w panelu Google (naraża wizytówkę klienta). Publikacja = człowiek lub Business Profile API po approval.
