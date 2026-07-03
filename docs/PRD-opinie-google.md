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

**Konsekwencja:** MVP sprzedażowy = **Filar 1** (samowystarczalny, pełnowartościowy, buduje Fable w oknie 5–7.07). Filar 2 = Faza 2, odblokowuje się po zatwierdzeniu wniosku przez Google. **Nie da się tego kupić tokenami ani Fablem — to proces administracyjny Google.** Dlatego wniosek składamy **jak najszybciej, równolegle** do budowy Filaru 1.

---

## 1. Ustalenia techniczne z researchu (2026-07-03)

### 1a. Zbieranie opinii (Filar 1) — łatwe, zero blockerów
- **Link do wystawienia opinii:** `https://search.google.com/local/writereview?placeid=PLACE_ID` — otwiera od razu okno pisania opinii. Działa dla **każdej** wizytówki, bez zgody właściciela, bez API.
- **Place ID:** darmowy, **można cache'ować bezterminowo** (wyjęty z ograniczeń cache Places API). Zdobycie: Places API (Find Place / Text Search) po nazwie+mieście, albo z URL Map.
- **Licznik postępu bez żadnego approval:** Places API (New) zwraca `rating` (średnia) + `userRatingCount` (liczba opinii). Odpytujemy raz dziennie, robimy snapshot → pokazujemy „było 12 opinii / 4.6 ⭐ → jest 18 / 4.8 ⭐". To **wystarcza na panel i dowód wartości**, bez Business Profile API.

### 1b. Czytanie treści + odpowiadanie (Filar 2) — mocne, ale za bramką approval
- **Business Profile API** (`mybusiness.googleapis.com/v4`, „review-data") jest **aktywne w 2026 i DARMOWE** (brak opłat per wywołanie). Umie: listować opinie z wielu lokalizacji, czytać ocenę+treść, **odpowiadać programowo**, usuwać odpowiedzi, media, status odpowiedzi.
- **Bramka approval (twarda):** nowy projekt Google Cloud startuje z **zero quota**. Trzeba złożyć formalny wniosek o dostęp, uzasadnić use-case (zarządzanie własnymi/klienckimi wizytówkami), mieć **zweryfikowaną wizytówkę GBP aktywną 60+ dni** + **stronę firmową**. Akceptacja ręczna, **od kilku dni do kilku tygodni**.
- **Per klient:** fachowiec musi być właścicielem/menedżerem swojej wizytówki i **przez logowanie Google (OAuth) dać nam dostęp** do zarządzania nią.

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

1. **Wniosek approval — czym się weryfikujemy?** Business Profile API wymaga **zweryfikowanej wizytówki Google 60+ dni + strony firmowej**. Czy „New Beginning" ma własną wizytówkę Google (60+ dni)? Jeśli nie — użyjemy wizytówki wspólnika/pierwszego klienta, czy najpierw zakładamy własną? **To warunek startu zegara approval — im szybciej, tym lepiej.**
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
