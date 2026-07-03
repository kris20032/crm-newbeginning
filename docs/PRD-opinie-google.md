# 📋 PRD — produkt abonamentowy „Opinie Google"

> **Status: PLAN (Faza 1 researchu zrobiona Opusem 2026-07-03).** Zielone światło zespołu: Krzysztof ✅ + Marceli ✅.
> Poprzedni dokument (uzasadnienie biznesowe): [`pomysl-produkt-opinie-google.md`](pomysl-produkt-opinie-google.md).
> Ten plik = spec techniczny + wynik researchu API + jednoznaczne zadania dla Fable.

---

## 0. WERDYKT BRAMKI (go / no-go) — IDZIEMY, ale w dwóch filarach

Produkt jest **wykonalny**. Kluczowe odkrycie: rozpada się na dwie części o **różnej gotowości**, bo Google inaczej traktuje *zbieranie* opinii i *czytanie* cudzych opinii.

| Filar | Co robi | Gotowość | Blocker |
|---|---|---|---|
| **Filar 1 — ZBIERANIE opinii** | prośba o opinię (link/QR) + licznik postępu (ocena, liczba opinii, trend) | ✅ **buduj od zaraz** | brak — zero zgód Google |
| **Filar 2 — MONITORING + AUTO-ODPOWIEDZI** | czytanie treści nowych/negatywnych opinii + szkic odpowiedzi + odpowiadanie z panelu | ⚠️ **wymaga approval Google** | wniosek do Google (dni–tygodnie), OAuth właściciela per klient |

**Konsekwencja (AKTUALIZACJA 3.07 - patrz §0.5):** MVP jest **PEŁNOWARTOŚCIOWY bez approval**. Odkryliśmy legalne obejście dla Filaru 2 (odpowiadanie): monitoring przez oficjalne Places API + publikacja odpowiedzi ręcznie (my jako menedżer wizytówki) lub automatem dopiero po approval. Approval Google przestaje być blokerem - staje się bonusem, który tylko usuwa nasze ręczne wklejanie. Pełna, ustalona mechanika MVP w **§0.5** niżej.

---

## 0.5 MECHANIKA MVP - jak produkt działa (ustalenia z Krzysztofem, 3.07)

> To jest sedno specyfikacji dla Fable. Wizualny one-pager (do pokazania Marcelemu): Artifact `https://claude.ai/code/artifact/bddaa58f-b933-4145-aa6d-b5b4973d3cbc`.

**PRZEŁOM - Filar 2 (odpowiadanie) DZIAŁA bez approval, legalnie:**
- **Czytanie/monitoring opinii** → oficjalne **Places API** (zwraca ocenę, liczbę i treść 5 najnowszych opinii; dla lokalnego fachowca z kilkunastoma opiniami rocznie łapie każdą nową).
- **Pisanie odpowiedzi** → nasze **AI**.
- **Publikacja odpowiedzi** → **człowiek (my) wkleja w panelu Google jako menedżer wizytówki klienta**, LUB automat po approval.
- ⛔ **NIGDY bot/Chrome MCP/automat klikający w panelu Google** - to obchodzenie zabezpieczeń Google, które **naraża wizytówkę KLIENTA na karę/zawieszenie** (odwrotność tego, co sprzedajemy). Odrzucone stanowczo, ta sama kategoria co scraping (SerpApi pozwany przez Google 12.2025). Publikacja jest albo ręczna (człowiek), albo automat legalnie po approval - trzeciej drogi nie ma.
- → **Produkt jest pełnowartościowy bez approval.** Approval usuwa tylko nasze ręczne wklejanie (bonus na potem).

**MODEL OBSŁUGI = B (my za klienta).** Model A (klient sam zatwierdza w panelu) ODRZUCONY - fachowcy są leniwi, nie będą klikać, opinie zostałyby bez odpowiedzi. Klient robi absolutne minimum.

**KANAŁ = bot WhatsApp (klucz całego UX):**
- **WhatsApp Business Platform (Cloud API) po NASZEJ stronie** - jeden numer firmowy obsługuje wszystkich klientów. Klient (Janek) **nic nie instaluje ani nie zakłada** - dostaje bota jako zwykły dymek na swoim **prywatnym WhatsAppie** (jak powiadomienia z InPostu/banku). Onboarding: raz pisze "cześć" do bota (to opt-in WhatsApp + otwarcie kanału). NIE mylić z aplikacją "WhatsApp Business" - tej klient NIE dotyka.
- **Pętla 1 (zbieranie):** Janek wrzuca numer swojego klienta na WhatsApp do bota → my wysyłamy temu klientowi **SMS** (z nazwą firmy Janka jako nadawcą, przez SMSAPI.pl) z linkiem do oceny Google. *Do klientów końcowych SMS, NIE WhatsApp* - wiadomość z obcego numeru WA psułaby konwersję.
- **Pętla 2 (odpowiadanie):** nowa opinia wykryta → **WhatsApp do Janka**: podgląd opinii + gotowa odpowiedź AI + 3 przyciski interaktywne:
  - **Akceptuj** → do kolejki publikacji (my hurtem wieczorem / automat po approval).
  - **Edytuj** → bot prosi o własną wersję, Janek wpisuje ją w czacie WhatsApp.
  - **Pomiń** → zostawiamy opinię bez odpowiedzi. ⚠️ To NIE "usuń opinię" (Google nie pozwala nikomu usuwać cudzych opinii) - stąd nazwa "Pomiń", nie "Usuń".

**KOSZTY I PRACA:**
- **Nasz koszt / klient / miesiąc: ~3-5 zł** (SMS prośby ~2-4 zł + Places API monitoring ~1-2 zł + WhatsApp powiadomienia <1 zł). Abonament 49-99 zł → marża prawie w całości.
- **Nasz czas:** publikacja zatwierdzonych odpowiedzi hurtem wieczorem = **~10-15 min na 10 klientów** (warunek: panel z listą wszystkich opinii + gotowe odpowiedzi + deep-link do opinii + kopiowanie do schowka). Rośnie z liczbą klientów → przy większej skali potrzebny approval (automat = 0 czasu). Zdejmuje to też z Krzysztofa Chrome MCP jako pomysł na publikację (odrzucony wyżej).
- **Setup jednorazowy (nie per klient):** WhatsApp Business Platform, Google Cloud + klucz Places API, konto SMSAPI. Po naszej stronie, klient nie dotyka.

**Panel/metryki:** ocena, liczba opinii, trend, wysłane prośby vs wystawione, opinie bez odpowiedzi. Uczciwość: Google nie wiąże opinii 1:1 z numerem klienta → pokazujemy agregaty (wysłano X, przybyło Y), nie "kto konkretnie wystawił".

**Timing budowy:** Krzysztof skłania się, by BUDOWAĆ rdzeń Fablem w oknie 5-7.07 (Fable reset limitu 5.07). Ostateczne "idź" jeszcze nie padło - do potwierdzenia z nim.

## 1. Ustalenia techniczne z researchu (2026-07-03)

### 1a. Zbieranie opinii (Filar 1) — łatwe, zero blockerów
- **Link do wystawienia opinii:** `https://search.google.com/local/writereview?placeid=PLACE_ID` — otwiera od razu okno pisania opinii. Działa dla **każdej** wizytówki, bez zgody właściciela, bez API.
- **Place ID:** darmowy, **można cache'ować bezterminowo** (wyjęty z ograniczeń cache Places API). Zdobycie: Places API (Find Place / Text Search) po nazwie+mieście, albo z URL Map.
- **Licznik postępu bez żadnego approval:** Places API (New) zwraca `rating` (średnia) + `userRatingCount` (liczba opinii). Odpytujemy raz dziennie, robimy snapshot → pokazujemy „było 12 opinii / 4.6 ⭐ → jest 18 / 4.8 ⭐". To **wystarcza na panel i dowód wartości**, bez Business Profile API.

### 1b. Czytanie treści + odpowiadanie (Filar 2) — mocne, ale za bramką approval
- **Business Profile API** (`mybusiness.googleapis.com/v4`) — aktywne 2026, DARMOWE. Umie: listować opinie z wielu lokalizacji, czytać ocenę+treść, **odpowiadać programowo**, status odpowiedzi.
- **KTO składa wniosek = MY, RAZ (NIE per klient).** Approval jest na poziomie **naszego** projektu Google Cloud — jeden wniosek dla całej apki. Potem każdy klient-fachowiec tylko **autoryzuje nas przez OAuth** („zaloguj Google → zezwól", ~10 s) lub dodaje nas jako managera swojej wizytówki. Klient NIE aplikuje do Google. To standardowy model SaaS/agencja („on-behalf-of-merchant" OAuth).
- **Bramka approval (twarda):** nowy projekt GCP = zero quota. Wniosek przez formularz kontaktowy GBP API, ocena ręczna Google. Wymóg: e-mail będący **ownerem/managerem zweryfikowanej wizytówki GBP 60+ dni** + **strona firmowa z domeną pasującą do e-maila** + konkretny opis produktu + skonfigurowany OAuth consent screen.
- **⚠️ Szansa i czas — realistycznie:** oficjalnie „do 14 dni", w praktyce raporty społeczności (2024–25): **~70% zgłasza opóźnienia >3 mies. lub odrzucenia** bez jasnego feedbacku. Da się przejść (realne uzasadnienie biznesowe bywa zatwierdzane; odrzucenie można poprawić i złożyć ponownie), ale **wniosek jest niepewny i potencjalnie wielomiesięczny → Filar 2 = opcja na przyszłość, NIE fundament sprzedaży.** Częste powody odrzuceń (do uniknięcia): domena≠e-mail, wątły use-case, wizytówka <60 dni, brak OAuth.
- **⛔ Blocker startowy u nas:** nie mamy ŻADNEJ wizytówki Google (firma nienazwana — [[project_nazwa_firmy_i_wizytowka]]) → wniosku **nie da się teraz nawet złożyć**. Rozwiązania w §6.1. Blokuje to WYŁĄCZNIE Filar 2.

### 1c. Droga NIE zalecana
- **Places API do treści opinii** — max **5 opinii** na miejsce, opinii **nie wolno długo cache'ować** (tylko place_id), płatne. Nie nadaje się ani do monitoringu, ani do panelu właściciela. Używamy Places **tylko** do Place ID + licznika (1a).
- **Scraping Map** — przeciw regulaminowi Google, ryzyko blokady. Odrzucone.

Źródła: [Business Profile API — review data (Google)](https://developers.google.com/my-business/content/review-data) · [ukryta bramka approval](https://xovionlabs.com/blog/google-business-profile-api-hidden-gate/) · [Places API — polityki/cache](https://developers.google.com/maps/documentation/places/web-service/policies) · [format review link + Place ID](https://embedsocial.com/blog/google-review-link/).

---

## 2. Zakres MVP (Filar 1) — co dokładnie wchodzi

**Cel MVP:** sprzedawalny produkt, który sam prosi o opinie i pokazuje wzrost — bez żadnej zależności od Google approval.

1. **Onboarding klienta (my, ~30 min raz):** wpisujemy nazwę+miasto firmy → system znajduje Place ID (Places API) → generuje jego review link + kod QR → zapisuje kartę klienta.
2. **Prośba o opinię (klient, ~10 s):** fachowiec po zleceniu wysyła numer swojego klienta (przez prosty formularz / wiadomość do bota) → system wysyła SMS lub WhatsApp z gotowym linkiem „wystaw opinię".
   - Szablon wiadomości edytowalny per klient. Throttling (nie spamować tego samego numeru). Prosty opt-out.
3. **Panel klienta (izolowany):** ocena, liczba opinii, trend w górę (z dziennego snapshotu Places), lista wysłanych próśb i ile z nich „dojrzało" w czasie.
4. **Multi-tenant + twarda izolacja danych:** każdy fachowiec widzi **tylko swoje** dane (Supabase RLS). ⭐ To miejsce, które **audytuje Fable** (patrz §5).

**Poza MVP (świadomie na później):** cały Filar 2 (treść opinii, alerty o negatywnych, auto-szkice odpowiedzi), płatności/subskrypcja (na start fakturujemy ręcznie), zaawansowane raporty.

---

## 3. Architektura (szkic — do potwierdzenia/audytu przez Fable)

- **Baza:** Supabase (jak CRM). Tabele: `gbp_accounts` (fachowcy-abonenci), `gbp_review_requests` (wysłane prośby: numer, kanał, status, timestamp), `gbp_metrics_snapshots` (dzienny rating+count per konto). Wszystko z **RLS per `account_id`**.
- **Backend automatu:** worker (Node/Deno lub Supabase Edge Functions) — cron dzienny na snapshoty metryk + obsługa wysyłki wiadomości. Sekrety (klucz Places, klucz SMS) poza kodem.
- **Wysyłka:** SMS — dostawca PL (np. SMSAPI.pl, ~0,06–0,12 zł/szt) **lub** WhatsApp (Meta Cloud API / Twilio). Do wyboru — patrz otwarte pytania §6.
- **Front:** prosty panel (stack jak CRM — HTML/JS + Pages, albo lekki panel na Supabase). Logowanie per klient.
- **Izolacja:** żaden zapytany endpoint nie może zwrócić danych innego konta. To jest twarde kryterium bezpieczeństwa.

---

## 4. Plan wykonania wg modelu (kto co robi — oszczędność tokenów)

```
DZIŚ (3.07):
  OPUS  → Faza 1: research (✅ ten dokument) + PRD
  FABLE → zajęty backendem CRM Marcelego (jego priorytet dziś)

RÓWNOLEGLE, ASAP (Krzysztof/Marceli, nietechniczne):
  → złożyć WNIOSEK o Business Profile API approval  ⏰ zegar tyka poza nami

OKNO 5–7.07 (Fable resetuje limit 5.07 = pełna pula na 2 dni):
  FABLE → budowa RDZENIA Filaru 1 wg tego PRD (multi-tenant + izolacja)
  OPUS  → przygotowanie zadań, przegląd między iteracjami, dopięcia

PO 7.07 (Opus/Sonnet, spokojnie):
  → panel UI, testy, podłączenie 1. klienta pilotażowego
  → Filar 2 gdy Google zatwierdzi approval
```

**Zasada podziału:** Opus pisze/planuje (tanio, dobrze). Fable robi to, w czym realnie bije: (a) **audyt architektury izolacji danych**, (b) autonomiczna budowa rdzenia. Fable NIE marnuje się na prozę/UI.

---

## 5. Co dokładnie zlecamy Fable (jednoznacznie)

1. **AUDYT + domknięcie architektury izolacji danych** (przed budową): przejrzeć model z §3, wskazać każdą drogę wycieku danych między kontami, zaproponować twarde RLS + testy izolacji. To jego przewaga (łapie wycieki, których inni nie widzą).
2. **Budowa rdzenia Filaru 1** wg §2–§3: schemat bazy + RLS, worker snapshotów metryk (Places API), pipeline wysyłki prośby (SMS/WA) z throttlingiem i opt-out, minimalny panel z metrykami.
3. **Testy izolacji** — dowód, że konto A nie widzi danych konta B (automatyczny test wieloklientowy).

Praca na osobnej gałęzi, nie na żywym CRM. Sekrety poza repo. Nadzór (Fable potrafi się zapętlić — effort high, nie ultra).

---

## 6. Otwarte pytania (do Krzysztofa/Marcelego — biznesowe, nie techniczne)

1. **Wniosek approval — na czym go oprzeć (blocker Filaru 2).** Firma nie ma jeszcze nazwy ani żadnej wizytówki Google ([[project_nazwa_firmy_i_wizytowka]]). Wniosek wymaga wizytówki 60+ dni + strony z pasującą domeną. Opcje: **(a)** poczekać aż powstanie firma+wizytówka i minie 60 dni (2+ mies.); **(b)** oprzeć wniosek na wizytówce **pierwszego klienta-fachowca**, który doda nas jako managera — szybsza droga, realny use-case; **(c)** czy któryś ze wspólników ma już starą wizytówkę Google 60+ dni z jakiejś działalności? Bez tego wniosku nie złożymy. **Blokuje TYLKO Filar 2 — Filar 1 (sprzedaż) rusza niezależnie.** Realizm: approval bywa wielomiesięczny i niepewny (§1b) — dlatego nie wieszamy na nim biznesu.
2. **Kanał wiadomości na start:** SMS (pewny, dociera zawsze, grosze/szt) czy WhatsApp (za darmo, ale nie każdy klient końcowy ma)? Rekomendacja: **SMS na start** (niezawodność), WA jako opcja później.
3. **Cena abonamentu:** 49 / 79 / 99 zł/mies? (Nie blokuje budowy — fakturujemy ręcznie na start.)
4. **Pierwszy klient pilotażowy:** który z obecnych klientów/leadów nadaje się na test (najlepiej fachowiec z żywą wizytówką i regularnymi zleceniami)?

---

## 7. Koszty (rząd wielkości)
- **Places API:** Place ID (raz) + dzienny snapshot rating/count per klient ≈ **grosze/klient/mies** przy dziesiątkach klientów.
- **SMS:** ~0,06–0,12 zł/szt (tylko gdy wysyłamy prośbę). WhatsApp/link = ~0.
- **Business Profile API:** darmowe (po approval).
- **Fable:** za darmo do 7.07 (rdzeń). Po 7.07 tylko utrzymanie Opus/Sonnet.

**Model:** koszt bliski zera przy przychodzie ~49–99 zł/klient/mies = wysoka marża, skaluje się bez proporcjonalnej pracy.
