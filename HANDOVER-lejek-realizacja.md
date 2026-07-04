# HANDOVER — rozbudowa lejka CRM „realizacja/usługi" (branch `feat/lejek-realizacja`)

> Dla: **kto kontynuuje** (Marceli lub Krzysztof — i jego Claude). Data: 2026-07-02, zaktualizowano 2026-07-04. Autorzy: Krzysztof + Marceli + Claude.
> **Najpierw powiedz swojemu Claude: „przeczytaj HANDOVER-lejek-realizacja.md i kontynuuj według niego".**

## 🟢 WDROŻONE NA ŻYWO 2026-07-04 (Opus + Supabase MCP) — TEN HANDOVER JEST JUŻ ZREALIZOWANY
- **Wariant PEŁNY wdrożony:** `feat/lejek-realizacja` **zmergowany do `main`** (commit `a763551`, front v92 LIVE na Pages) + backend Fazy 1–4 wykonane na żywej bazie: część A (`schema-rbac.sql`), katalog usług (`schema-uslugi.sql`), Edge Function `admin-users` (deploy przez MCP, ACTIVE), część B OSTRA (`schema-rbac-enforce.sql` — izolacja RLS + bramki lejka + unik. indeks imion).
- **Decyzje K.:** admini = Krzysztof + Marceli; reszta (Szymon, Piotrek/Pcebulski, Patryk, Bartek) = sprzedawca; cennik jak jest (Obsługa 49 zł/mies).
- **Weryfikacja izolacji (symulacja jwt na żywych politykach):** sprzedawca (Szymon) widzi tylko swoje 22 karty, admin (Krzysztof) widzi 150. Pre-flight był czysty (0 duplikatów imion, 0 sierot owner/opiekun). Backup przed wdrożeniem: `~/CRM-backups/crm-backup-2026-07-04_1115.json`.
- **ROLLBACK Fazy 4** (gdyby coś): odkomentuj sekcję `-- ROLLBACK` na końcu `schema-rbac-enforce.sql` i uruchom → wraca „każdy widzi wszystko”.
- **ZOSTAŁO TYLKO Faza 5** (panel Supabase, ręcznie — patrz niżej): rejestracja OFF (pewnie już z 2.07), MFA adminów, leaked-password ON, rate limits, CORS EF z `*` → origin Pages. + opcjonalny test na drugim koncie.

## ⏸️ STAN NA KONIEC SESJI 2026-07-04 — (historyczny, sprzed wdrożenia)
- Branch = v92, wszystko wypchnięte, working tree czysty. Zrobione Kroki 1–8 + **audyt bezpieczeństwa i naprawy** (Krok 9 niżej).
- **Żywa baza NIETKNIĘTA** — Krzysztof świadomie wstrzymał wdrożenie plików SQL. Gdy da zgodę → sekcja „⚠️ BACKEND" niżej (kolejność 1→4). Uwaga: `schema-rbac.sql` (część A) urósł — dodaje teraz też kolumny `clients.partner_since` i `clients.checklist` oraz uprawnienia `partners.revoke` i `stages.realizacja`.
- **NASTĘPNE ZADANIE: Krzysztof poda listę realnych usług agencji** (nazwa, rozliczenie jednorazowo/miesięcznie, cena stała albo wpisywana + minimum/rekomendowana, widoczna/ukryta). Dwie drogi: (a) wypisze na czacie → dopisać do seedu `schema-uslugi.sql` + mocków `DEMO_SERVICE_CATALOG` w `app.js`; (b) po wdrożeniu backendu wyklika w Panel admina → Oferta na prawdziwym logowaniu → wtedy ściągnąć je z bazy do seedu (żeby plik odtwarzał katalog 1:1).
- Podgląd DEMO: instrukcja niżej („Jak odpalić PODGLĄD"); serwer z tej sesji już nie działa.

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

**Krok 6 (2026-07-03) — KATALOG USŁUG (zakładka „Oferta" w panelu admina).** Jedno źródło prawdy o usługach: tabela **`service_catalog`** (`schema-uslugi.sql` — bezpieczny, addytywny; wymaga wcześniej części A RBAC).
- **Panel admina → „Oferta":** lista usług, „+ Dodaj usługę", edycja, **Ukryj/Pokaż** (ukryta = handlowiec nie zaznaczy jej nowo, ale karty z już zaznaczoną dalej ją pokazują z dopiskiem „wycofana z oferty"). **Celowo bez usuwania** — stare karty trzymają klucze w `clients.services`. Zarządzanie = uprawnienie `services.manage` (admin niejawnie).
- **Ustawienia usługi:** rozliczenie (jednorazowo / miesięcznie × okres 6 mies./1 rok/2 lata), tryb ceny: **stała** (np. hosting) albo **wpisywana przez handlowca** z opcjonalnym **minimum** (nigdzie nie widać; wpis poniżej świeci pole na czerwono z limitem „minimalnie X zł" i NIE zapisuje się) i **rekomendowaną** (szary placeholder w polu kwoty).
- **Karta klienta** (zakładka Usługi) renderuje katalog dynamicznie — wygląd/zapis bez zmian (`clients.services` jsonb, klucze `strona`/`obsluga` kompatybilne wstecz). Bez tabeli w bazie: tryb zgodności = wbudowane strona+obsluga jak dotąd, a „Oferta" pokazuje baner-instrukcję.
- ⚠️ Kruczek: cena **stała** liczy się z katalogu w momencie wyświetlenia — zmiana ceny stałej w Ofercie zmieni „Razem" także na starych/zamrożonych kartach (tak działało i dotąd z ceną 49 zł w kodzie). Jeśli kiedyś ma być inaczej → snapshot ceny do `clients.services` przy zamrożeniu (roadmap).

**Krok 7 (2026-07-03/04) — REDESIGN KARTY KLIENTA.**
- **Nagłówek w jednej linii:** imię (input dopasowuje szerokość do treści — `wireNameAutosize`) + **znaczek partnera** tuż przy nazwisku, po prawej gwiazdki oceny i **stepper etapu** `‹ Status ›` (strzałki ±1 etap, `wireStageArrows`).
- **Pola na ikonach liniowych** (teczka/słuchawka/koperta/pinezka/osoba/tarcza/monitor — `CARD_ICON`, tooltip z nazwą pola), dwie kolumny rozdzielone cienką linią, bez nagłówków „KONTAKT/USTALENIA".
- **Telefon**: auto-format `+48 XXX XXX XXX` przy wpisywaniu/wklejaniu (`formatPhonePL` — obsługa 0048/48/myślników, 9 cyfr).
- **Follow-up = belka nad czatem** (`fu-bar`): klik rozwija (data + godzina + notatka auto-zapis), pomarańczowa gdy ustawiony, badge dziś/zaległe, ✓ = wykonany (trwały wpis w komentarzach), Enter zatwierdza i zwija. Notatka pod datą, ikonka wyrównana do linii daty. Sekcja „Przypomnienia" w feedzie USUNIĘTA — belka to jedyne miejsce follow-upu.
- Przyciski w wierszach karty ujednolicone (jeden rozmiar); „Poproś o demo" stonowany do szarości.
- **FIX (demo-only, siedział od dawna):** czat w DEMO nie pokazywał dodanych komentarzy — demo `getComments` zwracał statyczne seedy i `sendComment` nadpisywał nimi stan. Naprawione: demo `getComments` czyta bieżący stan.

**Krok 8 (2026-07-04) — TOKEN PARTNERA + BRAMKI LEJKA + CHECKLISTA.**
- **Token** (`clients.partner_since`) = JEDYNE źródło prawdy o partnerstwie. Zielony znaczek weryfikacyjny przy imieniu (karta, kafelki, tabele). Klik na karcie → popover z zawartością tokena (od kiedy partner + sprzedane usługi z kwotami/datami). **Samonaprawa przy starcie** (`showApp`): karty już na „Umowa podpisana"+ dostają token i stemple automatycznie (pokryje też żywe dane po wdrożeniu).
- **Sprzedane usługi**: `services[key].sold_at` — stemplowane przez `markServicesSold` przy KAŻDYM wejściu na „Umowa podpisana"+ (kolejna sprzedaż = kolejna porcja). Sprzedana usługa = trwale zielona z plakietką „aktywna", nie do odznaczenia na żadnym etapie (retencja). Zakładki Usługi i Checklista widoczne dla partnera na każdym etapie, dla reszty od „Sprzedaży".
- **Bramki lejka** (`stageChangeBlocked` — pilnuje selecta, strzałek, drag&drop i tworzenia karty w kolumnie; każda reguła = PRZEKROCZENIE progu, cofanie zawsze wolne): (1) próg „Umowa wysłana" — min. 1 zaznaczona usługa; (2) próg „Umowa podpisana" — **WYŁĄCZNIE przycisk „Nadaj token"** (zielony, na karcie z etapem „Umowa wysłana", widzi go tylko admin; `bypassGate` w `saveField`), NIKT ręcznie — także admin; (3) próg „Checklista gotowa" — tylko z KOMPLETNIE wypełnioną checklistą (`checklistComplete`; dotyczy każdego, admina też); (4) etapy realizacji („W trakcie realizacji"+) — tylko admin albo rola z uprawnieniem **`stages.realizacja`** (checkbox w matrycy; przyszłościowo np. developer).
- **Baza partnerów**: kolumny Klient/Telefon/Etap/Zespół/**Rejestracja** (=data tokena) + **⚙ menu** (doklejane do body — tabela ma overflow:hidden) z opcją **„Zdejmij token"** wymagającą 2 potwierdzeń; zdjęcie czyści token + stemple (usługi wracają do edycji), zablokowane gdy karta stoi na „Umowa podpisana"+ (najpierw cofnij etap). Nowe uprawnienie **`partners.revoke`** w matrycy (admin niejawnie; seed w SQL i demo).
- **Checklista (roadmap #1 ZROBIONY):** „Klient zapłacił" = ptaszek, po zaznaczeniu wysuwa się po prawej segment (pełna kwota / zadatek / inne; drugi klik odznacza, odznaczenie ptaszka czyści wybór) + „Komplet materiałów dotarł" (ptaszek) + 9 pytań (dane kontaktowe, oferta, social, domena / podstrony, najważniejsze usługi, wyróżniki, „O nas", preferencje). Pod KAŻDĄ pozycją auto-rosnąca linijka odpowiedzi (textarea, auto-grow). Zapis do `clients.checklist` (jsonb), auto-zapis z debounce. Na dole (tylko etap „Umowa podpisana") przycisk **„Checklista gotowa"** — aktywny dopiero przy kompletnej checkliście, klik przenosi kartę na etap „Checklista gotowa".

**Krok 9 (2026-07-04) — AUDYT BEZPIECZEŃSTWA + NAPRAWY (2 agentów: front + backend/SQL).**
- **FIX KRYTYCZNY (front) — stale closures otwartego modala = cicha utrata danych.** `refreshData` (realtime / `visibilitychange` / backstop co 60 s) podmieniał `state.clients` na nowe obiekty, a closury modala (usługi/checklista/follow-up/strzałki) trzymały stary `c` → wpisy do checklisty/usług po odświeżeniu NIE trafiały do bazy. Naprawione: przy otwartej karcie zachowujemy IDENTYCZNOŚĆ jej obiektu (`Object.assign` świeżych pól do zachowanego obiektu). Ten jeden fix leczy wszystkie closury modala. Zweryfikowane headless (5/5).
- Pozostałe naprawy front: drop&drop stemplował `sold_at`/token PRZED zapisem statusu (zostawały na cofniętej karcie) → teraz po udanym await; „Przywróć kartę" z Archiwum tylko dla `canEdit` (było: każdy oglądający); restore odtwarza token/stemple (samonaprawa pomija zarchiwizowane); strzałki etapu liczą `idx` świeżo (nie zamrożony — po realtime skakały o kilka etapów); próg „Umowa wysłana" wymaga NOWEJ usługi (`on && !sold_at`) — partner na retencji nie przejdzie na starych sprzedanych; belka follow-upu odświeża się w `refreshData` (zmiana terminu przez innego); `genPassword` na `crypto` (był `Math.random`); usunięty martwy kod (`fmtDate`/`FU_ICON`/`EDIT_ICON`). **XSS: brak — `esc()` trzyma wszędzie (sprawdzone 34 miejsca innerHTML, w tym edytowalny katalog usług).**
- **BACKEND — reguły lejka DOPISANE do części B (`schema-rbac-enforce.sql`).** Audyt wykazał: sama część B egzekwowała tylko WŁASNOŚĆ; wszystkie reguły biznesowe (usługa/nadaj token/checklista/realizacja/token/sold_at) żyły TYLKO we froncie → sprzedawca omijał je jednym PATCH-em REST na anon key. Dodany **trigger `clients_guard()`** (+`stage_rank()`): progi etapów, nadawanie tokena tylko admin, zdejmowanie tylko `partners.revoke`, `sold_at` niezmienialny. Domknięte też podszywanie: **unikalne imiona** (`uq_team_members_name_ci`) + zwykły user nie zmienia własnego imienia (własność kart = tekstowe `owner`/`opiekun`). ⚠️ SQL NIE był uruchamiany (brak lokalnego Postgresa) — **przetestować na backupie/staging przy wdrożeniu**; jeśli unikalny indeks wywali się na duplikatach imion → najpierw ujednolić `team_members`.
- **Znane, świadomie NIEtknięte:** `saveServices/saveChecklist` bez rollbacku przy błędzie zapisu (fix stale-closures dociąga prawdę przy następnym refreshu, a twardą bramkę egzekwuje trigger); `COMPAT_PERMS` daje `clients.hard_delete` każdemu w trybie zgodności (zachowanie sprzed ról — do decyzji Krzysztofa); latentna eskalacja przez `team.manage` (nikt go nie ma; strażnik i tak blokuje zmianę roli zwykłemu userowi); bootstrap-admini w EF działają też po RBAC (świadomy trade-off).

Aktualna wersja cache: **v92** (w `index.html` przy `styles.css`/`config.js`/`app.js` — **przy każdej zmianie front podbij numer**, żeby zespół nie miał starej wersji z cache).

## ⚠️ BACKEND — kolejność wdrażania (gdy idziemy na żywo)
1. **`schema-rbac.sql` (część A)** — bezpieczne w KAŻDEJ chwili, także przed merge do main: tylko dodaje (kolumny `clients.services` / `clients.partner_since` / `clients.checklist`, uprawnienia `partners.revoke` i `stages.realizacja` oraz tabele ról + strażnika). Wkleić całość w Supabase → SQL Editor. Idempotentne (można wielokrotnie). **Najpierw świeży backup** (auto-backup u Krzysztofa — potwierdzić).
2. **`schema-uslugi.sql`** — katalog usług (zakładka „Oferta"); bezpieczny/addytywny jak część A, ale wymaga jej wykonania wcześniej (sam się zatrzyma, jeśli brak). Bez niego karta działa w trybie zgodności (wbudowane strona+obsluga).
3. **Edge Function `admin-users`** — `supabase login && supabase link --project-ref zngfubfinbojfgaxdrbf && supabase functions deploy admin-users`. Bez niej panel działa, ale akcje na kontach (dodaj/zablokuj/usuń/zmiana roli) pokazują toast z instrukcją; reset hasła działa od razu.
4. **`schema-rbac-enforce.sql` (część B) — DOPIERO przy wdrożeniu, ZA WYRAŹNĄ ZGODĄ KRZYSZTOFA.** Zmienia zachowanie bazy natychmiast, RÓWNIEŻ dla starego frontu z main (sprzedawcy przestaną widzieć cudze karty). Wymagania i kruczki — w nagłówku pliku; najważniejsze:
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
1. ~~**Treść checklisty**~~ — **ZROBIONE w Kroku 8** (płatność-segment, materiały-ptaszek, 11 pytań z auto-rosnącymi polami odpowiedzi; zapis w `clients.checklist`).
2. ~~**Więcej usług** w zakładce Usługi + ceny (minimalna / rekomendowana)~~ — **mechanizm ZROBIONY w Kroku 6** (katalog + panel Oferta); zostało **wprowadzenie realnej listy usług od Krzysztofa** (patrz „STAN NA KONIEC SESJI" na górze).
3. **Pod-etapy „development"** widoczne tylko dla nas (zarząd), handlowiec widzi jeden etap „W trakcie realizacji".
4. ~~**ROLE + panel admina**~~ — **ZROBIONE w Kroku 4** (front + pliki backendu na tym branchu; do wdrożenia wg sekcji „⚠️ BACKEND" wyżej).
5. Retencja / upsell, Google Drive na pliki klienta, archiwum umów.

## Kontekst techniczny (skrót)
- Front: `index.html` + `app.js` + `styles.css` + `config.js`. Backend: Supabase (projekt `crm-newbeginning`, ref `zngfubfinbojfgaxdrbf`).
- Etapy lejka są zdefiniowane WYŁĄCZNIE we froncie (`STATUSES` w `app.js`) — baza trzyma `clients.status` jako zwykły tekst, więc nowe etapy nie wymagały zmian w bazie.
- ⚠️ Uwaga historyczna: etykiety etapów `zainteresowany`/`umowiony` są „odwrócone" względem kluczy (swap z 26.06) — przy czytaniu `status` z bazy o tym pamiętaj. Ta rozbudowa tego nie tyka.
</content>
