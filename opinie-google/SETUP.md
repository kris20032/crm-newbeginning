# 🚀 SETUP — uruchomienie od zera (checklista operacyjna)

> Kolejność ma znaczenie. Kroki „👤 K." = klik Krzysztofa/Marcelego (nietechniczne, z instrukcją). Reszta = Claude.

## ✅ Krok 0 — OSOBNY projekt Supabase (WYKONANE 3.07, Claude przez Chrome)
- Projekt **`opinie-google`**, ref: **`uzccwsmzmzcsijddbtzn`**, region eu-central-1 (Frankfurt), org krzychu.brzezi (obok CRM). **Całkowicie świeży projekt, dedykowany wyłącznie temu produktowi** — nie współdzieli niczego z żadnym starym systemem.
- (Slot darmowego planu zwolniono usypiając stary, nieużywany projekt z archiwum — szczegół operacyjny poza tym produktem, zapisany w pamięci archiwum.)
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
- **WhatsApp Business Platform (Meta):** numer firmowy + token + `WA_VERIFY_TOKEN`/`WA_APP_SECRET` (webhook) + **message template** na powiadomienie o opinii (Meta zatwierdza szablony business-initiated poza oknem 24 h — złożyć przy konfiguracji). Do czasu skonfigurowania bot działa w trybie na sucho (outbox).
- **Anthropic API (Claude Haiku):** klucz do szkiców odpowiedzi. Bez klucza działa szablon zapasowy (sensowny, ale sztywny).

## Krok 3 — Sekrety i deploy funkcji (Claude, wymaga `supabase` CLI: `brew install supabase/tap/supabase`)
> ⚠️ WYMAGANE PRZED DEPLOYEM: plik `supabase/config.toml` (wyłącza bramkę logowania `verify_jwt` dla wszystkich 6 funkcji, żeby crony i webhook Meta w ogóle weszły - autoryzacji i tak pilnuje nasz kod). Jest już w repo, nic nie trzeba tworzyć - CLI podłącza go sam podczas deployu.
```bash
supabase login                       # 👤 K. klika autoryzację raz
supabase link --project-ref uzccwsmzmzcsijddbtzn
# Tryb na sucho jest DOMYŚLNY - NIE ustawiamy OG_DRY_MODE (brak zmiennej = na sucho, bezpiecznie).
supabase secrets set OG_SERVICE_KEY=$(openssl rand -hex 32)   # start NA SUCHO (nic nie idzie w świat)
# realne klucze dokładamy stopniowo (każdy brakujący = dany kanał zostaje na sucho):
#   GOOGLE_PLACES_KEY=...  SMSAPI_TOKEN=...  SMS_TEST_MODE=1
#   WA_TOKEN=... WA_PHONE_NUMBER_ID=... WA_VERIFY_TOKEN=... WA_APP_SECRET=...
#   ANTHROPIC_API_KEY=...
cd opinie-google && supabase functions deploy og-onboard og-request-review og-dispatch og-snapshot og-monitor og-wa-webhook
# realny start (MOKRO, wysyłki idą w świat) = dopiero po teście na sucho ustaw jawnie:
#   supabase secrets set OG_DRY_MODE=0
```
> Sekret `og_anon_key` dla cronów (drugie zabezpieczenie wywołań) ustawia się w bazie w Kroku 4.

## Krok 4 — Crony (Claude, SQL Editor)
Wymaga, by funkcje były już zdeployowane (Krok 3). W `db/004_cron.sql`:
1. Podmienić `<PROJECT_REF>` na ref projektu (`uzccwsmzmzcsijddbtzn`).
2. Zapisać DWA sekrety w Vault (raz każdy; komendy są w nagłówku pliku):
   - `select vault.create_secret('<WARTOSC_OG_SERVICE_KEY>', 'og_service_key');` - ten sam klucz co `OG_SERVICE_KEY` z Kroku 3.
   - `select vault.create_secret('<ANON_KEY>', 'og_anon_key');` - anon key projektu (Settings → API → Project API keys → `anon public`).
3. Uruchomić cały plik (Run).

## Krok 5 - Test end-to-end na sucho (domyślny tryb na sucho: nic nie idzie w świat, wysyłki lądują w tabeli `og_outbox`)
1. `og-onboard` z `{"query":"<nazwa firmy pilota> <miasto>"}` → wybrać właściwego kandydata → `confirm`.
2. `og-request-review` z numerem testowym (własnym) → w bazie pojawia się prośba ze statusem `scheduled` i `scheduled_at` USTAWIONYM ~3 h w przyszłość (silnik timingu celuje w okno 9-21, żeby realny SMS nie szedł w nocy).
3. ⚠️ Dlatego ręczne `og-dispatch` teraz NIC nie wyśle - żadna prośba nie jest jeszcze „dojrzała". Do testu przestaw termin na TERAZ (SQL Editor):
   ```sql
   update og_review_requests set scheduled_at = now() where status = 'scheduled';
   ```
   (Albo po prostu poczekaj do zaplanowanej godziny - do testu szybciej przestawić ręcznie.)
4. Teraz ręcznie wywołać `og-dispatch` → prośba przechodzi dalej, a wiadomość ląduje w `og_outbox` ze statusem `dry` (tryb na sucho). `select * from og_outbox order by created_at desc;` - powinna tam być.
5. `og-snapshot` → wiersz w `og_metrics_snapshots` ze świeżym ratingiem.

> ⚠️ ZANIM przełączysz na MOKRO (`supabase secrets set OG_DRY_MODE=0`) - OBOWIĄZKOWO wyczyść testowe prośby, inaczej po włączeniu realnych wysyłek pójdą naprawdę / zablokują throttle (limit 30 dni na numer):
> ```sql
> update og_review_requests set status = 'cancelled' where status in ('queued','scheduled','sending');
> ```
> Dopiero po tym: `OG_DRY_MODE=0` (mokro), a jeśli chcesz najpierw sprawdzić samo połączenie z SMSAPI bez kosztu - `SMS_TEST_MODE=1` (SMSAPI przyjmuje, nie wysyła, nie kosztuje), potem `SMS_TEST_MODE=0` i prawdziwy SMS na własny numer.

## Krok 6 — Pilot
Kandydat: **Hydraulika JB (Jakub)** — nasz płatny klient, żywa wizytówka, regularne zlecenia.
Do ustalenia z nim: zgoda + nadawca SMS „HydraulikaJB" (rejestracja w SMSAPI od razu).
