# Opinie Google - zgodność prawna wysyłki SMS (zgoda, RODO, Omnibus, Google)

> Dokument dla zespołu New Beginning. Produkt "Opinie Google" wysyła w imieniu fachowca
> SMS do jego klienta końcowego z prośbą o opinię Google. **To MY jesteśmy technicznie
> wysyłającym** (nasze konto SMSAPI, nasz numer nadawcy), więc ryzyko prawne spada na nas,
> nie tylko na fachowca.
>
> ⚠️ **To nie jest porada prawna.** To należyta staranność techniczna. Docelową kwalifikację
> prawną (czy i jaka zgoda jest potrzebna, jak ją dokumentować) **skonsultować z prawnikiem
> PRZED pierwszym płatnym klientem.** Poniższe = bezpieczny punkt startu, nie ostateczna wykładnia.

---

## a) Ryzyko po ludzku - dlaczego to ważne

**Prosto:** w Polsce nie wolno wysłać SMS-a marketingowego (a prośba o opinię tak jest
traktowana) na numer osoby fizycznej bez jej wcześniejszej **zgody**. Zgoda musi być
uprzednia (przed wysyłką), dobrowolna i konkretna (odbiorca wie, na co się godzi).

Podstawy prawne (dla porządku, nie trzeba znać na pamięć):
- **art. 172 Prawa komunikacji elektronicznej** - zakaz kontaktu marketingowego bez zgody
  odbiorcy (dawniej art. 172 Prawa telekomunikacyjnego + art. 10 ustawy o świadczeniu usług
  drogą elektroniczną; PKE to scaliło).
- **RODO** - numer telefonu to dane osobowe; ich przetwarzanie (wysyłka SMS) wymaga
  podstawy prawnej. Przy marketingu tą podstawą jest zwykle właśnie zgoda.

**Kto odpowiada:** ponieważ SMS wychodzi z NASZEGO konta i NASZEGO nadawcy, to nas UKE
uzna za wysyłającego. Fachowiec dostarcza numery, ale narzędzie i wysyłkę zapewniamy my.
Dlatego potrzebujemy dwóch rzeczy naraz:
1. **umownego zabezpieczenia** - fachowiec bierze na siebie, że numery ma za zgodą (pkt b),
2. **udokumentowania** - że sami dołożyliśmy staranności i zapisujemy fakt zgody (pkt c).

**Co grozi (realnie):**
- **UKE** - kara administracyjna za wysyłkę bez zgody: **do 3% przychodu** ukaranego za
  poprzedni rok. To najgroźniejsza pozycja.
- **RODO / UODO** - roszczenia i skargi osób, które dostały SMS bez zgody; ryzyko kary za
  przetwarzanie bez podstawy.
- **Reputacja** - skargi na nadawcę u operatora SMS mogą doprowadzić do zablokowania
  naszego konta nadawczego (wywala CAŁY produkt, nie jednego klienta).

**Wniosek:** zgoda i jej dokumentowanie to nie formalność - to warunek, żeby ten produkt
w ogóle mógł działać bez wysadzenia nas w powietrze.

---

## b) Klauzula do umowy abonamentowej z fachowcem (gotowa do wklejenia)

> Wkleić jako osobny paragraf do wzoru umowy (wzór jest w crm/docs - tego dokumentu NIE
> edytujemy tutaj, dostarczamy tylko treść klauzuli). Numer paragrafu dopasować do umowy.

---

**§ ... Zgody klientów końcowych na kontakt SMS**

1. Usługa polega na wysyłaniu, w imieniu Zleceniodawcy, wiadomości SMS do jego klientów
   końcowych z prośbą o wystawienie opinii w Google. Numery telefonów tych klientów
   przekazuje Usługodawcy Zleceniodawca.

2. Zleceniodawca oświadcza, że będzie przekazywał Usługodawcy **wyłącznie numery telefonów
   tych klientów końcowych, którzy uprzednio wyrazili zgodę na kontakt SMS w sprawie
   wystawienia opinii.** Zleceniodawca nie przekaże numeru klienta, który takiej zgody
   nie wyraził lub ją wycofał.

3. Zleceniodawca zobowiązuje się posiadać i - na żądanie Usługodawcy, organu nadzorczego
   lub klienta końcowego - **okazać dowód uzyskania zgody** (np. potwierdzenie zapytania
   i zgody przy realizacji zlecenia). Zleceniodawca odpowiada za prawdziwość tego oświadczenia.

4. Zleceniodawca przyjmuje na siebie **pełną odpowiedzialność** za przekazanie numeru bez
   ważnej zgody klienta końcowego. Jeżeli w związku z przekazaniem przez Zleceniodawcę numeru
   bez zgody Usługodawca poniesie jakąkolwiek szkodę - w tym karę administracyjną (m.in.
   nałożoną przez Prezesa UKE lub organ ochrony danych), roszczenie osoby trzeciej, koszty
   obsługi prawnej lub skutki zablokowania konta nadawczego - **Zleceniodawca zwróci
   Usługodawcy (regres) całość tych kosztów** w terminie 14 dni od wezwania.

5. Usługodawca może w każdej chwili wstrzymać wysyłkę do numerów budzących wątpliwości co do
   zgody oraz zaprzestać świadczenia usługi w razie uzasadnionego podejrzenia naruszenia
   niniejszego paragrafu, bez odpowiedzialności z tego tytułu.

6. Każda wiadomość zawiera prostą możliwość rezygnacji (odpowiedź STOP), a Usługodawca po
   otrzymaniu rezygnacji trwale wstrzymuje wysyłkę do danego numeru.

---

## c) Rekomendacja operacyjna - jak zbierać i dokumentować zgodę

**Zasada:** zgoda ma być uzyskana przez fachowca u źródła (przy zleceniu), a my zapisujemy
**fakt jej istnienia** (atestację) w momencie przyjęcia numeru. To dwie warstwy: fachowiec
ma dowód "na papierze/ustnie u siebie", my mamy ślad techniczny "kiedy potwierdzono zgodę".

**W praktyce dla fachowca (prosty skrypt do powiedzenia klientowi):**
Po skończonym zleceniu, przy kliencie:
> "Czy mogę przekazać Pana/Pani numer, żeby dostał Pan/Pani jednego SMS-a z prośbą o opinię
> w Google? W każdej chwili można zrezygnować, odpisując STOP."

Klient mówi "tak" -> fachowiec dopiero wtedy wpisuje numer do bota WhatsApp. Klient nie chce
-> numeru nie przekazuje. Prosto, bez formularzy.

**Po naszej stronie (ślad techniczny - należyta staranność):**
- Bot WhatsApp na starcie i w komunikacie POMOC przypomina fachowcowi: "Wysyłaj tylko numery
  klientów, którzy zgodzili się na SMS z prośbą o opinię." (wdrożone w komunikacie bota).
- **Atestacja zgody:** w momencie przyjęcia numeru przez bota zapisujemy znacznik czasu
  potwierdzenia zgody - proponowana kolumna **`consent_attested_at`** (timestamptz) w tabeli
  `og_customers` (lub `og_review_requests`), wypełniana przez workera przy zakolejkowaniu
  prośby. Dzięki temu mamy dowód "dla każdego numeru istnieje potwierdzenie, że fachowiec
  oświadczył zgodę, i kiedy". (Sam schemat kolumny dodaje inny agent - tu tylko rekomendacja.)
- Rezygnacja (STOP) już obsłużona kolumną `opted_out` w `og_customers` - po STOP nie wysyłamy.

> ⚠️ **PRZED pierwszym płatnym klientem:** dać prawnikowi do sprawdzenia (1) czy model
> "zgoda u fachowca + nasza atestacja" wystarcza, czy potrzebna jest zgoda kierowana wprost
> do nas jako administratora/podmiotu przetwarzającego, (2) kto jest administratorem danych
> (fachowiec czy my, czy współadministrowanie) i czy potrzebna jest umowa powierzenia
> przetwarzania. To rozstrzyga prawnik, nie my.

---

## d) Zakaz review-gatingu i zachęt (Google + Omnibus/UOKiK)

Dwie niezależne zasady, obie trzeba trzymać w treści SMS i całej komunikacji:

**1. Google - zakaz "review gating".** Nie wolno:
- prosić o opinię **tylko** klientów zadowolonych ani filtrować, kto dostanie prośbę wg
  spodziewanej oceny (my wysyłamy do wszystkich przekazanych numerów - to jest OK),
- sugerować **jaką ocenę** wystawić ("daj 5 gwiazdek", "wystaw pozytywną opinię").

**2. Omnibus / UOKiK - zakaz zachęt majątkowych za opinię.** Nie wolno oferować korzyści
w zamian za wystawienie opinii:
- **rabat, zniżka, gratis, prezent, nagroda, zwrot** "za opinię" / "w zamian za opinię" - **zakazane.**

**Co WOLNO w treści SMS (neutralnie, bez wpływania na ocenę i bez zachęty):**
- "Będzie nam miło, jeśli **ocenisz nas** w Google: <link>"
- "Twoja opinia pomoże innym - **oceń nas** w Google: <link>"
- podziękowanie za skorzystanie z usługi + prośba o **opinię** (bez słowa o gwiazdkach,
  bez sugestii oceny, bez żadnej korzyści).

**Egzekwowanie w kodzie:** szablon SMS jest walidowany przed zapisem - deny-lista fraz
(gwiazdki, rabat, zniżka, gratis, prezent, "w zamian", "pozytywn", "docen"...) blokuje
zapis szablonu łamiącego te zasady, a szablon musi zawierać `{link}` do wizytówki.
(Lista i reguła - w kodzie walidacji `og-dispatch`.)
