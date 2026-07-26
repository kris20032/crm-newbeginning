# Umowy z karty klienta — co trzeba włączyć

Kod jest wgrany. Zostały cztery rzeczy do kliknięcia. Bez nich przycisk
„Stwórz umowę” albo się nie pokaże, albo powie wprost, czego brakuje —
nic się nie zepsuje po cichu.

Kolejność ma znaczenie: **1 → 2 → 3 → 4**.

---

## 1. Baza — tabela umów i miejsce na pliki

Supabase → **SQL Editor** → wklej całą zawartość `schema-umowy.sql` → **Run**.

Zakłada tabelę `contracts`, prywatny bucket `umowy` i reguły dostępu
(„każdy handlowiec do swoich klientów”). Można wykonać wielokrotnie,
nic nie nadpisze. Cofnięcie jest opisane na górze tego pliku.

Po tym kroku przycisk „Stwórz umowę” pojawia się na kartach.

---

## 2. GitHub — automat składania PDF

Automat mieszka w prywatnym repo **`kris20032/umowy-generator`**.

**a) dodaj plik automatu** (mój token nie miał do tego uprawnień):

```
gh auth refresh -s workflow
```

Potem daj znać — dołożę plik jedną komendą.

Alternatywa bez terminala: w repo `umowy-generator` jest katalog
`_workflow-do-dodania/`. Wystarczy przenieść z niego plik `umowa-pdf.yml`
do `.github/workflows/` przez stronę GitHuba (Add file → Create new file,
nazwa `.github/workflows/umowa-pdf.yml`, wklej treść).

**b) dodaj sekrety** — repo `umowy-generator` → Settings → Secrets and
variables → Actions → New repository secret:

| Nazwa | Wartość |
|---|---|
| `SUPABASE_URL` | `https://zngfubfinbojfgaxdrbf.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Supabase → Settings → API → `service_role` (ten długi, tajny) |

---

## 3. Supabase — funkcja przyjmująca formularz

Z terminala (jednorazowo, wymaga Supabase CLI):

```
supabase login
supabase link --project-ref zngfubfinbojfgaxdrbf
supabase secrets set GH_TOKEN=<token GitHuba>
supabase functions deploy umowa-generuj
```

`GH_TOKEN` to token GitHuba z prawem zapisu do repo `umowy-generator` —
tym funkcja budzi automat. Zrób go na
github.com/settings/personal-access-tokens: **Repository access →** tylko
`kris20032/umowy-generator`, **Permissions → Contents: Read and write**.

Token jest sekretem po stronie serwera. Nigdy nie trafia do przeglądarki —
dlatego formularz woła funkcję, a nie GitHuba wprost.

---

## 4. Sprawdzenie na żywo

1. Wejdź na dowolną swoją kartę klienta → pole **Umowa** → „Stwórz umowę”.
2. Formularz sam podstawi nazwę firmy, e-mail i kwoty z zakładki „Usługi”.
   Uzupełnij adres i NIP.
3. Wyślij. Po około minucie w polu **Umowa** na karcie pojawi się PDF.
4. Na kartę wpada komentarz z `@Krzysztof` — to jest powiadomienie (dzwonek).

Jeśli coś nie zagra, umowa dostaje status błędu z konkretnym powodem,
widocznym na karcie. Dane z formularza zostają w bazie, więc powtórzenie
nie wymaga wpisywania od nowa:
repo `umowy-generator` → Actions → „Złóż umowę (PDF)” → Run workflow → numer umowy.

---

## Co gdzie mieszka

| Rzecz | Miejsce |
|---|---|
| Formularz | `umowa.html` + `umowa.js` (to repo) |
| Przycisk i lista umów na karcie | `app.js`, funkcja `wypelnijUmowy` |
| Tabela, bucket, uprawnienia | `schema-umowy.sql` |
| Przyjęcie formularza | `supabase/functions/umowa-generuj/` |
| Składanie PDF | prywatne repo `kris20032/umowy-generator` |
| Zatwierdzony wzór umowy | `~/Desktop/UMOWA-Impulseo-WZOR-AKTUALNY-2026-07-26.docx` |

**Zmiana treści umowy** zaczyna się zawsze od wzoru na pulpicie, nie od
szablonu w repo automatu — inaczej wersja do ręcznego wypełniania
i wersja generowana się rozjadą. Instrukcja jest w README tamtego repo.
