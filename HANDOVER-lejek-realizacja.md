# HANDOVER — rozbudowa lejka CRM „realizacja/usługi" (branch `feat/lejek-realizacja`)

> Dla: **Marceli** (i jego Claude). Data: 2026-07-02. Autor: Krzysztof + Claude.
> **Najpierw powiedz swojemu Claude: „przeczytaj HANDOVER-lejek-realizacja.md i kontynuuj według niego".**

## Co to jest
Rozbudowujemy nasz CRM (repo `kris20032/crm-newbeginning`, live na GitHub Pages z gałęzi `main`) o etapy realizacji zamówienia i wybór usług. Robimy to **MAŁYMI krokami, na osobnym branchu `feat/lejek-realizacja`** — żeby nic nie wpłynęło na żywy CRM zespołu, dopóki Krzysztof nie powie „puszczamy".

⚠️ **ZASADA #1: NIE mergować do `main` bez wyraźnej zgody Krzysztofa.** `main` = wersja, którą widzi cały zespół. Branch = poczekalnia.

## Stan na teraz (co już zrobione na tym branchu — front gotowy, NIE na żywo)

**Krok 1 — etapy lejka (9 zamiast 6).** W `app.js` (tablica `STATUSES`):
- „Konwersja" → przemianowana na **„Umowa podpisana"** (klucz `konwersja` bez zmian → istniejące karty zostają).
- Dodane 3 nowe: `checklista`=„Checklista gotowa", `w_realizacji`=„W trakcie realizacji", `zrealizowane`=„Realizacja ukończona".

**Krok 2 — zakładka Usługi na karcie klienta.** W karcie, nad polem notatek, jest teraz przełącznik **Notatki | Usługi**:
- Zakładka „Usługi" pojawia się **od etapu „Sprzedaż" (`po_spotkaniu`) w górę**.
- 2 usługi na start: **Strona internetowa** (checkbox + pole na kwotę wpisywaną przez handlowca) + **Obsługa techniczna** (wymagana, stała 49 zł, stała `OBSLUGA_CENA` w kodzie).
- Zaznaczony checkbox **świeci się na pomarańczowo** (`#e8843c`).
- Kod: funkcje `servicesHTML()` i `saveServices()` w `app.js`; style `.notes-tabs` / `.svc-*` w `styles.css`.
- Zapis do kolumny `clients.services` (jsonb). W trybie DEMO trzymane w pamięci przeglądarki.

Aktualna wersja cache: **v70** (w `index.html` przy `styles.css`/`config.js`/`app.js` jest `?v=70` — **przy każdej zmianie front trzeba podbić numer**, np. na v71, żeby zespół nie miał starej wersji z cache).

## ⚠️ BACKEND — jedna rzecz do zrobienia przed puszczeniem na żywo
Zakładka Usługi zapisuje dane do kolumny **`clients.services` (typ jsonb)** — a tej kolumny **jeszcze nie ma w bazie**. W DEMO działa bez bazy, ale na żywej wersji zapis by się wywalił (Supabase odrzuca nieznaną kolumnę).

**Do wykonania (bezpieczne, odwracalne), gdy będziemy szli na żywo** — przez Supabase MCP (`/mcp` → supabase → Authenticate, jeśli połączenie wygasło) albo panel Supabase → SQL:
```sql
alter table clients add column if not exists services jsonb;
```
Cofnięcie: `alter table clients drop column services;`. To dodaje puste pole, nie rusza istniejących danych. **Najpierw świeży backup** (auto-backup leci u Krzysztofa; jak pracujesz sam, poproś go o potwierdzenie kopii albo zrób eksport).

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
1. **Treść checklisty** na etapie „Umowa podpisana" (płatność / umowa / dane / wybór produktu / domena) — handlowiec odhacza, potem karta idzie do „Checklista gotowa".
2. **Więcej usług** w zakładce Usługi + ceny (minimalna / rekomendowana).
3. **Pod-etapy „development"** widoczne tylko dla nas (zarząd), handlowiec widzi jeden etap „W trakcie realizacji".
4. **ROLE + panel admina** (handlowiec widzi TYLKO swoich klientów; my wszystkich) — to wymaga prawdziwej roboty w backendzie (RLS w Supabase) i jest najważniejsze dla bezpieczeństwa PRZED wpuszczeniem większej liczby ludzi.
5. Retencja / upsell, Google Drive na pliki klienta, archiwum umów.

## Kontekst techniczny (skrót)
- Front: `index.html` + `app.js` + `styles.css` + `config.js`. Backend: Supabase (projekt `crm-newbeginning`, ref `zngfubfinbojfgaxdrbf`).
- Etapy lejka są zdefiniowane WYŁĄCZNIE we froncie (`STATUSES` w `app.js`) — baza trzyma `clients.status` jako zwykły tekst, więc nowe etapy nie wymagały zmian w bazie.
- ⚠️ Uwaga historyczna: etykiety etapów `zainteresowany`/`umowiony` są „odwrócone" względem kluczy (swap z 26.06) — przy czytaniu `status` z bazy o tym pamiętaj. Ta rozbudowa tego nie tyka.
</content>
