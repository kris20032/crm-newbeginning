# 🚀 SETUP — uruchomienie od zera (checklista operacyjna)

> Kolejność ma znaczenie. Kroki „👤 K." = klik Krzysztofa/Marcelego (nietechniczne, z instrukcją). Reszta = Claude.

## Krok 0 — OSOBNY projekt Supabase (wynik audytu F1 — obowiązkowe)
👤 K.: [supabase.com/dashboard](https://supabase.com/dashboard) → **New project** (ta sama organizacja co CRM):
- Name: `opinie-google` · Database password: wygeneruj i zapisz w menedżerze haseł · Region: EU (Frankfurt/Central).
- Po utworzeniu (2 min) podać Claude'owi: **Project ref** (z URL) + z Settings → API: **URL, anon key, service_role key**.
- Claude zapisze je do `~/Library/Application Support/newbeginning/opinie-google.env` (poza repo).
- (Auth → Settings: **wyłączyć self-signup** — konta panelowe zakłada tylko operator, jak w CRM.)

## Krok 1 — Schemat + izolacja (Claude, SQL Editor nowego projektu)
1. `db/001_schema.sql` → Run.
2. `db/002_rls.sql` → Run.
3. **BRAMKA:** `tests/test-izolacja.sql` → Run → musi wyjść `IZOLACJA: WSZYSTKIE TESTY OK ✅ (14 testow)`. Czerwone = STOP, nie idziemy dalej.

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
