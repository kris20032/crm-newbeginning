# 🏗️ BLUEPRINT techniczny — produkt „Opinie Google"

> **Co to jest:** plan budowy moduł-po-module. Powstał z [`PRD-opinie-google.md`](PRD-opinie-google.md) (biznes + research API) i pamięci `project_fable5_okno_atak`. PRD mówi *co* i *dlaczego*; ten plik mówi *jak zbudować i w jakiej kolejności*.
> **Kto pisze / kto buduje:** blueprint = Opus (3.07). Rdzeń (Moduły 1, 2, 4 + audyt izolacji) = **Fable** w oknie 5-7.07. UI/proza/dopięcia (część Modułów 3, 5, 6) = Opus/Sonnet po 7.07.
> **Gałąź:** osobna (`feat/opinie-google`), NIE na żywym CRM. Sekrety poza repo. Nadzór nad Fable: effort high, nie ultra (potrafi się zapętlić).

---

## 0. ZASADA NADRZĘDNA — izolacja danych (twarde kryterium)

Produkt jest **wieloklientowy (multi-tenant):** jeden system, wielu fachowców-abonentów, każdy widzi **wyłącznie swoje** dane. To jedyne kryterium, które nie podlega negocjacji: **żaden endpoint, zapytanie ani widok panelu nie może zwrócić danych innego konta.** Cała reszta (UI, timing, kanały) jest wymienna — izolacja nie.

- Każda tabela z danymi klienta ma kolumnę `account_id` i **RLS (Row Level Security) per `account_id`**.
- Klucz `service_role` (omija RLS) żyje **tylko po stronie workera/backendu**, NIGDY we froncie.
- Front łączy się jako `anon` + sesja użytkownika → RLS wymusza `account_id = auth.uid()`-owe mapowanie.
- **To jest pierwsza rzecz, którą audytuje Fable** (§8) — zanim cokolwiek zbuduje.

---

## 1. Stos technologiczny (spójny z CRM, zero nowych zależności bez powodu)

| Warstwa | Wybór | Uzasadnienie |
|---|---|---|
| Baza + Auth | **Supabase** (ten sam projekt co CRM, osobne tabele z prefiksem `og_`) | jedno miejsce, RLS, już to znamy |
| Backend automatów | **Supabase Edge Functions** (Deno) + **pg_cron** na crony | bez osobnego serwera; sekrety w Supabase Vault |
| Front (panel) | **HTML/JS + GitHub Pages** (jak CRM) | spójne, tanie, statyczne |
| SMS do klienta końcowego | **SMSAPI.pl** (nadawca = nazwa firmy fachowca) | dociera zawsze, grosze/szt, polski dostawca |
| Kanał z fachowcem | **WhatsApp Business Platform (Cloud API, Meta)** — 1 numer firmowy | bot jako dymek na prywatnym WA fachowca |
| Monitoring opinii | **Google Places API (New)** — `rating`, `userRatingCount`, 5 najnowszych opinii | oficjalne, legalne, bez approval |
| Szkice odpowiedzi | **Claude Haiku 4.5** przez API (tani) | koszt groszowy, jakość wystarcza |
| (Później) auto-publikacja | **Business Profile API v4** — po approval Google | opcja, NIE fundament |

Sekrety (SMSAPI, Places, WhatsApp token, Claude API, Business Profile OAuth) → **Supabase Vault / env Edge Functions**, nigdy w repo, nigdy we froncie.

---

## 2. Model danych (schemat — Fable audytuje i domyka RLS)

Prefiks `og_` = „opinie google". Wszystkie tabele danych klienta: `account_id NOT NULL` + RLS.

```
og_accounts              -- tenant = fachowiec-abonent (Janek)
  id (uuid, pk)
  owner_auth_id (uuid)   -- mapowanie na Supabase auth user (logowanie do panelu)
  business_name          -- nazwa firmy Janka (też nadawca SMS)
  city
  place_id               -- Google Place ID (cache bezterminowy - dozwolone)
  review_link            -- https://search.google.com/local/writereview?placeid=...
  wa_number              -- prywatny WhatsApp Janka (kanał powiadomień)
  sms_sender_name        -- zarejestrowana nazwa nadawcy SMS (≤11 znaków, patrz §3 ryzyko)
  message_template       -- edytowalny szablon prośby o opinię
  plan_price             -- 49/79/99 (na start informacyjnie, faktura ręczna)
  timezone               -- do silnika timingu (domyślnie Europe/Warsaw)
  status                 -- active / paused
  created_at

og_customers             -- klienci końcowi Janka (do których idzie SMS z prośbą)
  id, account_id (fk)
  phone                  -- E.164
  name                   -- opcjonalnie (personalizacja imieniem)
  opted_out (bool)       -- STOP = true, już nie wysyłamy
  created_at

og_review_requests       -- każda wysłana / zaplanowana prośba
  id, account_id (fk), customer_id (fk)
  channel                -- 'sms' (start) | 'wa' (później)
  status                 -- queued | scheduled | sent | delivered | failed | opted_out
  scheduled_at           -- silnik timingu (nie „od razu", patrz Moduł 2)
  sent_at
  provider_msg_id        -- id od SMSAPI (do statusu doręczenia)
  reminder_count         -- 0 lub 1 (max 1 przypomnienie, anty-spam)
  created_at

og_metrics_snapshots     -- dzienny snapshot z Places API
  id, account_id (fk)
  snapshot_date (date)
  rating (numeric)
  user_rating_count (int)
  created_at
  UNIQUE(account_id, snapshot_date)

og_reviews               -- opinie wykryte w monitoringu (Filar 2)
  id, account_id (fk)
  fingerprint            -- hash(author+time+text) - detekcja „nowej" bez stabilnego ID z Places
  author_name
  rating (int)
  text
  review_time            -- czas opinii wg Google
  detected_at
  status                 -- new | draft_sent | accepted | edited | skipped | published
  ai_reply_draft
  final_reply            -- to, co idzie do publikacji (po Akceptuj/Edytuj)
  published_at, published_by
  purge_after            -- detected_at + 30 dni (polityka Places: treść max 30 dni)

og_wa_sessions           -- stan rozmowy WhatsApp z fachowcem (opt-in + interakcja przyciskami)
  account_id (fk)
  wa_number
  opted_in_at            -- kiedy napisał pierwsze „cześć" (opt-in)
  last_interaction_at    -- pilnowanie okna 24h WhatsApp
  conversation_state (jsonb) -- np. „czekam aż Janek wpisze własną wersję odpowiedzi do review X"
```

**Uwaga zgodności (Places API):** treść opinii (`og_reviews.text`) wolno przechowywać **max 30 dni** (polityka Google — tylko `place_id` bezterminowo). Stąd `purge_after` + cron czyszczący. Fable ma to wbudować, nie „na później".

---

## 3. MODUŁ 1 — Fundament: multi-tenant + izolacja + onboarding  ⭐ FABLE

**Cel:** szkielet, na którym stoi wszystko. Baza + RLS + logowanie + założenie konta fachowca.

**Zawartość:**
1. Migracja bazy: wszystkie tabele `og_*` z §2, klucze obce, indeksy (`account_id`, `snapshot_date`, `status`).
2. **RLS na każdej tabeli** — polityki `select/insert/update/delete` ograniczone do `account_id` powiązanego z `auth.uid()` (przez `og_accounts.owner_auth_id`). Worker używa `service_role` (omija RLS) świadomie i tylko po stronie serwera.
3. **Onboarding fachowca (robimy my, ~30 min raz):** funkcja, która z `nazwa + miasto` → znajduje **Place ID** (Places API Find Place / Text Search) → generuje `review_link` + kod QR → zakłada `og_accounts` + konto auth do panelu.
4. Seed danych testowych: min. **2 konta** (A i B) z danymi — potrzebne do testów izolacji.

**Zależności:** brak (to jest fundament).

**Kryteria akceptacji:**
- [ ] Konto A zalogowane w panelu **nie widzi żadnego rekordu** konta B — sprawdzone automatycznym testem na każdej tabeli `og_*`.
- [ ] Żadne zapytanie z frontu (rola `anon`/user) nie zwraca cudzych danych nawet przy podmianie `account_id` w zapytaniu (RLS blokuje, nie tylko filtr aplikacyjny).
- [ ] `service_role` nie występuje w żadnym pliku frontu ani w repo (grep czysty).
- [ ] Onboarding: podaję „Hydraulika JB, Rzeszów" → dostaję poprawny Place ID + działający review link (klik otwiera okno pisania opinii dla właściwej firmy).

**Ryzyka do rozstrzygnięcia w kodzie:** poprawność Place ID (walidacja — pokazać nazwę+adres do potwierdzenia człowiekowi przed zapisem, żeby nie podpiąć złej firmy).

---

## 4. MODUŁ 2 — Pętla 1: zbieranie opinii (Place ID → SMS → licznik)  ⭐ FABLE

**Cel:** fachowiec jednym ruchem uruchamia prośbę o opinię do swojego klienta; system pokazuje wzrost. To **samowystarczalny, sprzedawalny MVP** (bez Filaru 2).

**Zawartość:**
1. **Wejście numeru** (na start przez WA bota — Moduł 3; fallback: prosty formularz): Janek podaje numer klienta → `og_customers` + `og_review_requests(status=queued)`.
2. **Silnik timingu** (nauka z konkurencji, PRD §8): prośby **nie od razu i nie losowo** — planowane na okno **2-4 h po zleceniu** lub wieczór 17-20 / sobota rano. `scheduled_at` liczony wg `timezone` konta. Cron (pg_cron) co ~15 min wypuszcza dojrzałe prośby.
3. **Wysyłka SMS** (SMSAPI): nadawca = `sms_sender_name`, treść z `message_template` (personalizacja imieniem, krótko, **bezpośredni** review link, treść NEUTRALNA — „oceń nas", NIGDY „daj 5 gwiazdek"). Zapis `provider_msg_id`, aktualizacja `status`.
4. **Anty-spam + opt-out:** throttling (nie 2× ten sam numer w krótkim czasie), obsługa STOP → `opted_out=true`, **max 1 przypomnienie** (`reminder_count`), potem cisza.
5. **Licznik postępu:** cron dzienny odpytuje Places API (`rating` + `userRatingCount`) → `og_metrics_snapshots`. Z tego trend „było 12 / 4.6 ⭐ → jest 18 / 4.8 ⭐".

**Zależności:** Moduł 1 (konta + izolacja). Do wejścia numeru wygodnie Moduł 3, ale działa też z formularzem.

**Kryteria akceptacji:**
- [ ] Podanie numeru → SMS realnie dochodzi z nadawcą = nazwa firmy, link otwiera właściwe okno opinii.
- [ ] Prośba wychodzi w oknie czasowym, nie natychmiast; nie wychodzi dwa razy; STOP działa; przypomnienie max 1.
- [ ] Snapshot dzienny zapisuje się raz/dzień/konto; panel liczy trend z dwóch snapshotów.
- [ ] Treść wiadomości nie zawiera proszenia wyłącznie o pozytywy (compliance).

**Ryzyko (do zaadresowania, nie-techniczne ale blokujące):** **rejestracja alfanumerycznego nadawcy SMS** (nazwa firmy jako pole „od") w SMSAPI/u operatorów PL wymaga zgłoszenia i bywa 1-3 dni per nazwa. Na starcie: albo wspólny zweryfikowany nadawca, albo rejestracja per klient przy onboardingu. Fable: zbudować tak, by `sms_sender_name` był konfigurowalny per konto; samą rejestrację robimy operacyjnie.

---

## 5. MODUŁ 3 — Bot WhatsApp (kanał z fachowcem: numer + powiadomienia + 3 przyciski)  🟡 FABLE rdzeń / Opus dopięcia

**Cel:** cały kontakt z fachowcem idzie przez **jego prywatny WhatsApp** — bot jako dymek (jak InPost/bank). Klient **nic nie instaluje**.

**Zawartość:**
1. **Webhook WhatsApp Cloud API** (Edge Function): odbiór wiadomości + statusów. Weryfikacja podpisu Meta.
2. **Opt-in:** pierwszy raz Janek pisze „cześć" → `og_wa_sessions.opted_in_at`, powiązanie `wa_number` z kontem. Otwiera to kanał (wymóg WhatsApp).
3. **Pętla 1 wejście:** Janek wysyła numer klienta w czacie → parsujemy → `og_customers` + kolejka prośby (Moduł 2).
4. **Pętla 2 powiadomienie:** nowa opinia (z Modułu 4) → **template message** (bo poza oknem 24 h) z podglądem opinii + szkicem AI + **3 przyciski quick-reply:**
   - **Akceptuj** → `og_reviews.status=accepted`, `final_reply=ai_reply_draft`, do kolejki publikacji.
   - **Edytuj** → `conversation_state` = „czekam na wersję Janka"; następna wiadomość Janka → `final_reply`, `status=edited`.
   - **Pomiń** → `status=skipped` (NIE „usuń" — Google nie pozwala usuwać cudzych opinii).
5. **Zarządzanie oknem 24 h WhatsApp** i szablonami (business-initiated wymaga zatwierdzonych template'ów Meta).

**Zależności:** Moduł 1. Współpracuje z 2 (wejście numeru) i 4 (powiadomienia o opiniach).

**Kryteria akceptacji:**
- [ ] Nowy fachowiec pisze „cześć" → dostaje powitanie, konto połączone.
- [ ] Wysłanie numeru w czacie → prośba trafia do kolejki właściwego konta (nie cudzego!).
- [ ] Powiadomienie o opinii pokazuje 3 działające przyciski; każdy zmienia stan poprawnie; „Edytuj" przechwytuje kolejną wiadomość jako treść odpowiedzi.

**Ryzyka:** zatwierdzenie **message templates** przez Meta (dni); weryfikacja numeru firmowego WhatsApp Business Platform (setup jednorazowy). Interaktywne przyciski w template — sprawdzić limit 3 quick-reply.

---

## 6. MODUŁ 4 — Pętla 2: monitoring + szkice AI + kolejka publikacji  ⭐ FABLE

**Cel:** wyłapać nową opinię, napisać za fachowca odpowiedź, dostarczyć mu ją do 1 kliknięcia, przygotować do publikacji. **Bez approval Google** (legalne obejście: czytamy Places API, publikujemy ręcznie jako menedżer wizytówki).

**Zawartość:**
1. **Detekcja nowych opinii:** cron (np. co 6-12 h) odpytuje Places API (5 najnowszych opinii z treścią) → porównanie `fingerprint` z `og_reviews` → nowe zapisujemy (`status=new`).
2. **Szkic odpowiedzi AI** (Claude Haiku): ton pod branżę fachowca, krótko, po polsku, bez frazesów; negatywna opinia → spokojna, rzeczowa. `ai_reply_draft`.
3. **Wypchnięcie do fachowca** przez Moduł 3 (WhatsApp + 3 przyciski).
4. **Kolejka publikacji:** `status=accepted/edited` → widok „do wklejenia dziś" (Moduł 5) z deep-linkiem do opinii + kopiowaniem do schowka. Publikuje **człowiek (my) jako menedżer wizytówki**. Po `published` → `published_at/by`.
5. **Retencja:** cron czyści `og_reviews.text` po `purge_after` (30 dni — polityka Places).

**Zależności:** Moduł 1 (izolacja), Moduł 3 (kanał).

**Kryteria akceptacji:**
- [ ] Nowa opinia na wizytówce testowej pojawia się w `og_reviews` (bez duplikatów przy powtórnym cronie).
- [ ] Szkic AI jest sensowny i po polsku; negatyw dostaje stonowaną odpowiedź.
- [ ] Ścieżka Akceptuj/Edytuj/Pomiń zmienia stan i zasila kolejkę publikacji.
- [ ] Treść opinii znika po 30 dniach.

**⛔ TWARDE OGRANICZENIE (z PRD §0.5):** **NIGDY bot/Chrome MCP/automat klikający w panelu Google.** Publikacja = człowiek, albo legalny automat Business Profile API **dopiero po approval**. Trzeciej drogi nie ma — automatyzacja klikania naraża wizytówkę KLIENTA na karę. Fable: kolejka publikacji kończy się na „gotowe do wklejenia przez człowieka", kropka.

---

## 7. MODUŁ 5 — Panel + widget opinii na stronę  🟡 Opus/Sonnet (po 7.07)

**Cel:** (a) fachowiec widzi swój wzrost; (b) my mamy ekran do hurtowej publikacji; (c) **nasza przewaga** — żywy pasek opinii na stronie, którą klientowi zrobiliśmy.

**Zawartość:**
1. **Panel fachowca** (izolowany, logowanie): ocena, liczba opinii, trend, wysłane prośby vs „dojrzałe", opinie bez odpowiedzi. Agregaty (Google nie wiąże opinii 1:1 z numerem → pokazujemy „wysłano X, przybyło Y", nie „kto wystawił").
2. **Panel operatora (nasz):** lista „do wklejenia dziś" ze wszystkich kont, deep-link + kopiuj-do-schowka (cel: ~10-15 min / 10 klientów).
3. **Widget na stronę klienta** ⭐: lekki wstawiany pasek najnowszych opinii Google (auto-update z Places), wpinany w strony robione skillem `strona-klienta`. Synergia „strona + opinie w jednym" — czego konkurencja nie ma.

**Zależności:** Moduły 1-4 (dane).

**Kryteria akceptacji:**
- [ ] Panel A pokazuje tylko dane A (test izolacji z frontu).
- [ ] Widget renderuje się na stronie demo i odświeża ocenę/opinie bez ręcznej ingerencji.

---

## 8. MODUŁ 6 — Domknięcie: zgodność + jakość + audyt  ⭐ FABLE audytuje, Opus spina

**Cel:** żeby produkt był „technicznie bezbłędny" i **czysty wobec Google/prawa** (argument sprzedażowy: „nie ryzykujesz wizytówką").

**Zawartość / checklista:**
- [ ] **Audyt izolacji danych (Fable, PRZED budową i po):** każda droga wycieku między kontami wskazana i zamknięta + automatyczny test wieloklientowy (konto A ↛ konto B).
- [ ] **NIE review gating** — prosimy WSZYSTKICH klientów, treść neutralna. Zero ścieżki „dobre→Google, złe→prywatnie" (Google karze: usunięcie opinii + zawieszenie wizytówki + FTC/Omnibus).
- [ ] **Zero fake/generowanych opinii** — tylko prawdziwi klienci (tylko fachowiec podaje numery realnych zleceń).
- [ ] **Zgodność Omnibus** — prośba tylko po realnym zleceniu (ślad w `og_review_requests` = dowód realnego klienta).
- [ ] **Anty-spam** — throttling + max 1 przypomnienie + opt-out (STOP).
- [ ] **Retencja treści opinii 30 dni** (polityka Places).
- [ ] **Sekrety** poza repo/frontem; `service_role` tylko serwer.

---

## 9. KOLEJNOŚĆ BUDOWY (kamienie milowe)

```
KM1  Fundament + izolacja        [Moduł 1]          ← Fable NAJPIERW audytuje schemat, potem buduje
KM2  Pętla 1 działa end-to-end   [Moduł 2 (+3 wej.)] ← SAMOWYSTARCZALNY MVP do sprzedaży
KM3  WhatsApp bot pełny          [Moduł 3]
KM4  Pętla 2 + kolejka publikacji[Moduł 4]
KM5  Panel + widget              [Moduł 5]           ← Opus/Sonnet po 7.07
KM6  Domknięcie zgodności + audyt[Moduł 6]           ← Fable audyt izolacji na koniec
```

**Po KM2 mamy co sprzedawać.** Reszta to podnoszenie wartości. Filar 2 (Moduł 4) daje „wow", ale KM2 sam się broni.

---

## 10. PODZIAŁ OPUS ↔ FABLE (i kiedy przełączyć)

| Robota | Model | Kiedy |
|---|---|---|
| Ten blueprint, prompty dla Fable, przegląd między iteracjami, proza, UI panelu, widget | **Opus/Sonnet** | teraz + po 7.07 |
| **Audyt izolacji danych** (KM1, KM6) | **Fable** | okno 5-7.07 |
| **Budowa rdzenia** (Moduły 1, 2, 4 — baza, RLS, worker, crony, pipeline) | **Fable** | okno 5-7.07 (świeża pula od 5.07) |
| WhatsApp webhook rdzeń (Moduł 3) | **Fable**, dopięcia Opus | okno + po |

**Sygnał przełączenia (Krzysztof klika `/model`):** zostajemy na Opusie póki (a) blueprint gotowy ✅, (b) prompt dla Fable na KM1 przygotowany. **Wtedy powiem „przełącz na Fable"** — Fable robi audyt izolacji + rdzeń. Gdy skończy trudne, „wróć na Opus/Sonnet" na UI i dopięcia (nie palić drogiego Fable na prozę).

---

## 11. Sekrety i konfiguracja (jednorazowy setup, nie per klient)

- **Google Cloud:** projekt + klucz **Places API (New)** (restrykcja po IP/referrer).
- **SMSAPI.pl:** konto + token + rejestracja nadawcy (nazwa firmy — patrz Moduł 2 ryzyko).
- **WhatsApp Business Platform (Meta):** numer firmowy zweryfikowany + token + zatwierdzone message templates.
- **Claude API:** klucz (Haiku) na szkice odpowiedzi.
- **(Później) Business Profile API:** OAuth consent screen + wniosek approval — Filar 2, po tym jak powstanie firma+wizytówka (§ PRD 6.1).
- Wszystko w **Supabase Vault / env Edge Functions**. Zero w repo.

---

## 12. Otwarte punkty (do rozstrzygnięcia w budowie / z Krzysztofem)

**Techniczne (rozstrzyga Fable/Opus w kodzie):**
- Fingerprint opinii bez stabilnego ID z Places — jak odporny na drobne zmiany tekstu (edycja opinii przez autora).
- Template'y WhatsApp: ile realnie przejdzie przez zatwierdzenie Meta; limit 3 przycisków.
- pg_cron vs zewnętrzny scheduler dla crona co 15 min.

**Biznesowe (Krzysztof/Marceli — z PRD §6, NIE blokują KM1-KM2):**
- Kanał na start: **SMS** (rekomendacja — pewny) vs WhatsApp do klienta końcowego.
- Cena: 49 / 79 / 99 zł.
- Klient pilotażowy (najlepiej fachowiec z żywą wizytówką + regularne zlecenia — kandydat: Hydraulika JB).
- Na czym oprzeć wniosek approval (Filar 2) — wizytówka pilotażowego klienta jako droga (b).
