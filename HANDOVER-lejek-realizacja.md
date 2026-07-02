# HANDOVER — rozbudowa lejka CRM „realizacja/usługi" (branch `feat/lejek-realizacja`)

> Dla: **kto kontynuuje** (Marceli lub Krzysztof — i jego Claude). Data: 2026-07-02. Autorzy: Krzysztof + Marceli + Claude.
> **Najpierw powiedz swojemu Claude: „przeczytaj HANDOVER-lejek-realizacja.md i kontynuuj według niego".**

## Co to jest
Rozbudowujemy nasz CRM (repo `kris20032/crm-newbeginning`, live na GitHub Pages z gałęzi `main`) o etapy realizacji zamówienia i wybór usług. Robimy to **MAŁYMI krokami, na osobnym branchu `feat/lejek-realizacja`** — żeby nic nie wpłynęło na żywy CRM zespołu, dopóki Krzysztof nie powie „puszczamy".

⚠️ **ZASADA #1: NIE mergować do `main` bez wyraźnej zgody Krzysztofa.** `main` = wersja, którą widzi cały zespół. Branch = poczekalnia.

## Stan na teraz (co już zrobione na tym branchu — front gotowy, NIE na żywo)

**Krok 1 — etapy lejka (9 zamiast 6).** W `app.js` (tablica `STATUSES`):
- „Konwersja" → przemianowana na **„Umowa podpisana"** (klucz `konwersja` bez zmian → istniejące karty zostają).
- Dodane 3 nowe: `checklista`=„Checklista gotowa", `w_realizacji`=„W trakcie realizacji", `zrealizowane`=„Realizacja ukończona".

**Krok 2 — zakładka Usługi na karcie klienta.** W karcie, nad polem notatek, przełącznik **Notatki | Usługi | Checklista**:
- Zakładka „Usługi" pojawia się **od etapu „Sprzedaż" (`po_spotkaniu`) w górę**.
- 2 usługi: **Strona internetowa** (checkbox + kwota od handlowca) + **Obsługa techniczna** (**49 zł/mies.** × wybrany **okres**: 6 mies./1 rok/2 lata; `OBSLUGA_CENA`, `OKRESY` w kodzie).
- Na dole **suma „Razem"** (`svcTotal()`) = kwota strony + 49 × miesiące okresu; liczona tylko z zaznaczonych.
- Zaznaczona usługa świeci **na niebiesko** (`--accent`). **Od etapu „Umowa wysłana" (`oferta`) w górę usługi są zamrożone i zielone** (bez edycji/odklikania) — `svcLocked` w `renderCard`.
- Kod: `servicesHTML()`, `saveServices()`, `svcTotal()`/`updateSvcTotal()` w `app.js`; style `.notes-tabs` / `.svc-*` w `styles.css`.
- Zapis do kolumny `clients.services` (jsonb). W DEMO trzymane w pamięci przeglądarki.

**Krok 3 (ta sesja) — nawigacja + sekcja Klienci + kosmetyka lejka.**
- Etapy przemianowane: „Wysłane demo"→**„Demo wysłane"**, „Oferta/umowa"→**„Umowa wysłana"** (klucze bez zmian).
- Zakładka **Checklista** na karcie — pojawia się **od „Umowa podpisana" (`konwersja`) w górę**, na razie **pusty panel** (treść = roadmap #1).
- Zmiana statusu w karcie **przerysowuje kartę** (usługi zmieniają kolor na żywo) — `saveField` woła `openModal` przy zmianie `status`.
- **Topbar, prawy róg:** ikona **Konto** (ludzik → menu „Wyloguj") i **hamburger Sekcje** (menu: **Sprzedaż** / **Klienci**) — dwie rozwijane listy (`.pop-menu`, `closeTopMenus`); usunięto dawny napis nazwiska, przycisk „Wyloguj" i boczny drawer. „Błysk zapisano" jest teraz na ikonie konta.
- **Sekcja „Klienci"** (`showSection` / `renderKlienci` / `renderKlienciRows`): tabela klientów, którzy **przeszli przez „Umowa podpisana"** (są na nim lub dalej; archiwum wykluczone), reużywa `.crm-table`. Wiersze **klikalne → ta sama karta co w Sprzedaży** (`openModal`). Szukanie = **wspólna szukajka z topbaru** (per sekcja: `state.search` vs `state.klienciSearch`).

**Krok 4 (2026-07-02, wieczór) — PANEL ADMINA + ROLE (RBAC).** Decyzje Krzysztofa: admini na start = Krzysztof + Marceli; **sprzedawca widzi TYLKO swoich klientów** (owner/opiekun) i **nie ma** przełącznika „Pokaż: zespół"; konta tworzy admin z panelu (hasło startowe); „usuń" = dezaktywacja (blokada logowania, historia zostaje) + osobne „usuń trwale"; uprawnienia ról edytowalne w panelu (matryca).
- **Front:** hamburger → **„Panel admina"** (tylko z uprawnieniem `section.admin`): zakładka **Użytkownicy** (lista z rolami, dodawanie konta z generowanym hasłem startowym, reset hasła, blokada/odblokowanie, usuwanie z potwierdzeniem) + zakładka **Role i uprawnienia** (matryca checkboxów per rola; admin ma zawsze wszystko). Gating w appce: `can(perm)` + centralny filtr `rbacVisible()` (tablica, tabela, Na dziś, Archiwum, szukajka, liczniki, sekcja Klienci); `canEdit` rozszerzone o `clients.edit_all`; „Usuń trwale" tylko z `clients.hard_delete`. Front ma **tryb zgodności**: dopóki baza nie ma tabel RBAC, wszystko działa po staremu, a panel widzą bootstrap-admini (e-maile Krzyśka i Marcelego) z banerem-instrukcją. W DEMO panel działa na mockach.
- **Backend (pliki gotowe, NIC nie wykonane na żywej bazie):** `schema-rbac.sql` (część A — bezpieczna), `schema-rbac-enforce.sql` (część B — OSTRA), `supabase/functions/admin-users/index.ts` (Edge Function do kont; instrukcja deployu w nagłówku pliku).
- Architektura: tabele `roles`/`permissions`/`role_permissions` + `team_members.user_id/role/active`; funkcja `authorize()` czyta rolę **z tabeli** (świadomie BEZ auth hooka JWT — błędny hook zablokowałby logowanie całemu zespołowi na żywym main); trigger-strażnik na `team_members` blokuje podszywanie się (nie rzuca wyjątków — upsert z żywego frontu działa).

**Krok 5 (2026-07-03).** Sekcja „Klienci" przemianowana w UI na **„Baza partnerów"** (hamburger, pusty stan, etykieta uprawnienia w matrycy i w seedzie `schema-rbac.sql`). Klucze bez zmian: `section.klienci`, `#klienci-view`, `renderKlienci`, `state.klienciSearch`.

Aktualna wersja cache: **v86** (w `index.html` przy `styles.css`/`config.js`/`app.js` — **przy każdej zmianie front podbij numer**, żeby zespół nie miał starej wersji z cache).

## ⚠️ BACKEND — kolejność wdrażania (gdy idziemy na żywo)
1. **`schema-rbac.sql` (część A)** — bezpieczne w KAŻDEJ chwili, także przed merge do main: tylko dodaje (m.in. kolumnę `clients.services` dla zakładki Usługi — dawny pkt z tego handovera — oraz tabele ról + strażnika). Wkleić całość w Supabase → SQL Editor. Idempotentne (można wielokrotnie). **Najpierw świeży backup** (auto-backup u Krzysztofa — potwierdzić).
2. **Edge Function `admin-users`** — `supabase login && supabase link --project-ref zngfubfinbojfgaxdrbf && supabase functions deploy admin-users`. Bez niej panel działa, ale akcje na kontach (dodaj/zablokuj/usuń/zmiana roli) pokazują toast z instrukcją; reset hasła działa od razu.
3. **`schema-rbac-enforce.sql` (część B) — DOPIERO przy wdrożeniu, ZA WYRAŹNĄ ZGODĄ KRZYSZTOFA.** Zmienia zachowanie bazy natychmiast, RÓWNIEŻ dla starego frontu z main (sprzedawcy przestaną widzieć cudze karty). Wymagania i kruczki — w nagłówku pliku; najważniejsze:
   - każdy członek zespołu musi mieć wiersz w `team_members` z imieniem = dokładnie temu, co w `clients.owner`/`opiekun` (kto nie ma — nic nie zobaczy);
   - osoba robiąca dema (bez roli admin) potrzebuje `clients.edit_all`, żeby zapisać `demo_url` na cudzej karcie (checkbox w matrycy — seed developera go NIE ma, zgodnie z zasadą minimalnych uprawnień);
   - dezaktywacja tnie logowanie od razu, ale żywy token działa do ~1h (na własnych kartach);
   - Edge Function honoruje TYLKO rolę `admin` (celowo konserwatywnie — uprawnienie `team.manage` w matrycy daje zarządzanie rolami w tabelach, ale nie kontami).
   Rollback (powrót do otwartych polityk) jest na końcu pliku.

## Jak odpalić PODGLĄD u siebie (Twój własny „localhost")
`localhost` = serwer działający na TWOIM komputerze (nie zdalny link). Odpalasz go u siebie tak:

```bash
# 1. sklonuj repo (jeśli jeszcze nie masz) i wejdź w nie
git clone https://github.com/kris20032/crm-newbeginning.git
cd crm-newbeginning

# 2. pobierz i wejdź na nasz branch
git fetch origin
git checkout feat/lejek-realizacja

# 3a. PODGLĄD BEZPIECZNY (tryb DEMO — przykładowe karty, NIC nie dotyka prawdziwej bazy):
mkdir -p /tmp/crm-demo && cp index.html app.js styles.css config.js /tmp/crm-demo/
#     wyzeruj klucz, żeby ruszyło w trybie DEMO (bez logowania):
sed -i '' 's/SUPABASE_ANON_KEY: "[^"]*"/SUPABASE_ANON_KEY: ""/' /tmp/crm-demo/config.js
cd /tmp/crm-demo && python3 -m http.server 8899
#     otwórz w przeglądarce: http://localhost:8899/
#     karta na etapie „Sprzedaż" lub dalej (np. w DEMO „Fit Klub Active") → zakładka Usługi
```

- Żeby zobaczyć nowe etapy: na tablicy przewiń w prawo.
- Żeby zobaczyć Usługi: otwórz kartę na etapie Sprzedaż+ → kliknij zakładkę „Usługi".
- Podgląd na **prawdziwych danych** (Twój login, zapis do prod): serwuj repo bez zerowania klucza — ale wtedy uwaga, przeciągnięcie realnej karty do nowej kolumny zapisze się w bazie (a zespół na starym lejku zobaczy ją chwilowo w „Lead", dopóki nie zmergujemy). Do samego oglądania — spoko.

## Jak wprowadzać zmiany
1. Pracuj na branchu `feat/lejek-realizacja` (nie na `main`).
2. Zmiana we froncie → **podbij `?v=` w `index.html`** (v70 → v71…).
3. `git add ... && git commit ... && git push origin feat/lejek-realizacja`.
4. **Nie merguj do `main`** — to robi Krzysztof, gdy decydujemy „idziemy na żywo".

## Co dalej (roadmap z narady — po kolei, tylko gdy Krzysztof powie „robimy następny"):
1. **Treść checklisty** na etapie „Umowa podpisana" (płatność / umowa / dane / wybór produktu / domena) — handlowiec odhacza, potem karta idzie do „Checklista gotowa". *(Zakładka Checklista już istnieje — pusta; brakuje treści/pytań. Naturalny NASTĘPNY krok.)*
2. **Więcej usług** w zakładce Usługi + ceny (minimalna / rekomendowana).
3. **Pod-etapy „development"** widoczne tylko dla nas (zarząd), handlowiec widzi jeden etap „W trakcie realizacji".
4. ~~**ROLE + panel admina**~~ — **ZROBIONE w Kroku 4** (front + pliki backendu na tym branchu; do wdrożenia wg sekcji „⚠️ BACKEND" wyżej).
5. Retencja / upsell, Google Drive na pliki klienta, archiwum umów.

## Kontekst techniczny (skrót)
- Front: `index.html` + `app.js` + `styles.css` + `config.js`. Backend: Supabase (projekt `crm-newbeginning`, ref `zngfubfinbojfgaxdrbf`).
- Etapy lejka są zdefiniowane WYŁĄCZNIE we froncie (`STATUSES` w `app.js`) — baza trzyma `clients.status` jako zwykły tekst, więc nowe etapy nie wymagały zmian w bazie.
- ⚠️ Uwaga historyczna: etykiety etapów `zainteresowany`/`umowiony` są „odwrócone" względem kluczy (swap z 26.06) — przy czytaniu `status` z bazy o tym pamiętaj. Ta rozbudowa tego nie tyka.
</content>
