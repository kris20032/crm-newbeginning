# 🚀 SETUP — uruchomienie od zera (checklista operacyjna)

> Kolejność ma znaczenie. Kroki „👤 K." = klik Krzysztofa/Marcelego (nietechniczne, z instrukcją). Reszta = Claude.

## ✅ Krok 0 — OSOBNY projekt Supabase (WYKONANE 3.07, Claude przez Chrome)
- Projekt **`opinie-google`**, ref: **`uzccwsmzmzcsijddbtzn`**, region eu-central-1 (Frankfurt), org krzychu.brzezi (obok CRM).
- Slot darmowego planu zwolniony przez **pauzę martwego `bita-crm`** (org Marcelego; 0 realnego ruchu, tylko zapomniana karta). Odwracalne: Restore w dashboardzie. ⚠️ Po **~1.10.2026** (90 dni) wznowienie już nie 1-klik, tylko pobranie backupu — jeśli BITA ma być kiedyś wskrzeszona, wznowić przed tą datą.
- Ustawienia bezpieczeństwa przy tworzeniu: „Automatically expose new tables" **OFF**, „Enable automatic RLS" **ON**, self-signup **OFF** (konta zakłada tylko operator).
- Hasło DB: wygenerowane przez formularz, nie zapisywane (niepotrzebne przy pracy przez dashboard/API; reset w Settings → Database w razie potrzeby).
- ⏳ Klucze API (anon/service_role) — pobrać do `~/Library/Application Support/newbeginning/opinie-google.env` przy Kroku 3 (deploy funkcji).

## ✅ Krok 1 — Schemat + izolacja (WYKONANE 3.07, SQL Editor)
1. `db/001_schema.sql` → Run ✅
2. `db/002_rls.sql` → Run ✅
3. **BRAMKA:** `tests/test-izolacja.sql` → **`IZOLACJA: WSZYSTKIE 14 TESTOW OK` ✅** (3.07, po rollbacku zero śladu).

## Krok 2 — Klucze zewnętrzne (jednorazowo, nie per klient)
- **Google Places API (New):** 👤 K.: console.cloud.google.com → nowy projekt `opinie-google` → włączyć „Places API (New)" → klucz API (restrykcja: tylko Places API New). Uwaga: wymaga konta rozliczeniowego Google Cloud (darmowy kredyt $200/mies na Maps pokrywa nas z ogromnym zapasem).
- **SMSAPI.pl:** 👤 K.: założyć konto → doładować (np. 50 zł) → wygenerować token API (OAuth) → **zarejestrować pole nadawcy** (nazwa firmy pierwszego klienta; zatwierdzenie 1-3 dni robocze — zacząć od razu przy pilocie!).
- **WhatsApp Business Platform:** dopiero przy Module 3 (bot) — nie blokuje Pętli 1.

## Krok 3 — Sekrety i deploy funkcji (Claude, wymaga `supabase` CLI: `brew install supabase/tap/supabase`)
```bash
supabase login                       # 👤 K. klika autoryzację raz
supabase link --project-ref <REF>
supabase secrets set OG_SERVICE_KEY=$(openssl rand -hex 32) \
  GOOGLE_PLACES_KEY=... SMSAPI_TOKEN=... SMS_TEST_MODE=1     # najpierw tryb testowy!
cd opinie-google && supabase functions deploy og-onboard og-request-review og-dispatch og-snapshot
```

## Krok 4 — Crony (Claude, SQL Editor)
`db/004_cron.sql` — podmienić `<PROJECT_REF>`, zapisać `og_service_key` w Vault (komenda w pliku), Run.

## Krok 5 — Test end-to-end na sucho (SMS_TEST_MODE=1: SMSAPI przyjmuje, nie wysyła, nie kosztuje)
1. `og-onboard` z `{"query":"<nazwa firmy pilota> <miasto>"}` → wybrać właściwego kandydata → `confirm`.
2. `og-request-review` z numerem testowym (własnym) → sprawdzić `scheduled_at` (wpada w okno 9-21).
3. Ręcznie wywołać `og-dispatch` → status `sent`, w panelu SMSAPI widać wiadomość testową.
4. `og-snapshot` → wiersz w `og_metrics_snapshots` ze świeżym ratingiem.
5. Dopiero po zielonym: `SMS_TEST_MODE=0` i prawdziwy SMS na własny numer.

## Krok 6 — Pilot
Kandydat: **Hydraulika JB (Jakub)** — nasz płatny klient, żywa wizytówka, regularne zlecenia.
Do ustalenia z nim: zgoda + nadawca SMS „HydraulikaJB" (rejestracja w SMSAPI od razu).
