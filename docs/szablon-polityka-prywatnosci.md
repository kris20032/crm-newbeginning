# Dokumenty prywatności do strony klienta - gotowy zestaw szablonów

> Zestaw do wielokrotnego użytku. Wstawiasz na docelową (płatną) stronę klienta i uzupełniasz pola `[DO UZUPEŁNIENIA: ...]`. Napisane prostym językiem, zgodnie z RODO i polskim Prawem komunikacji elektronicznej (PKE).

---

## CZĘŚĆ 0. INSTRUKCJA - przeczytaj zanim wstawisz

### Kto jest administratorem danych

**Administratorem danych jest zawsze KLIENT** - firma, do której należy strona (ten hydraulik, stolarz, salon itd.). To jego nazwa, adres, NIP i e-mail wpisujesz w dokumenty. Wykonawca strony nie jest administratorem i nie wpisujemy tu żadnej innej firmy w roli administratora.

### Którą część kiedy stosować

| Sytuacja na stronie | Co wstawiasz |
|---|---|
| Strona ma tylko formularz kontaktowy, lokalne (własne) czcionki, brak analityki, map i innych zewnętrznych wstawek | Część 1 (klauzula pod formularz) + Część 2 (polityka prywatności). Część 3 (cookies) i baner zgody NIE są wymagane. |
| Strona dodatkowo ma Google Maps, Google Analytics, piksel reklamowy lub inną zewnętrzną wstawkę | Część 1 + Część 2 + Część 3 (polityka cookies) + baner zgody na cookies + odpowiednie fragmenty z Części 4. |
| Klient chce newsletter / zapisy mailowe | Dodatkowo fragment z Części 4 o newsletterze (osobny, niezaznaczony checkbox + double opt-in). |

Reguła w jednym zdaniu: **jeśli strona niczego nie śledzi i nie ładuje treści z zewnętrznych serwerów (poza samym hostingiem), wystarczą Część 1 i 2.** Mapy, analityka, piksele i newsletter dokładają obowiązki - wtedy dochodzą Część 3 i 4.

### Lista danych do zebrania od klienta (uzupełnij wszystkie `[DO UZUPEŁNIENIA]`)

Podstawowe (zawsze):
- Pełna nazwa firmy (dokładnie jak w rejestrze, np. "Jan Kowalski Usługi Hydrauliczne")
- Adres siedziby / prowadzenia działalności
- NIP (i REGON, jeśli klient chce podać)
- E-mail kontaktowy do spraw danych osobowych (może być ten sam, co ogólny kontakt)
- Telefon kontaktowy (opcjonalnie)
- Adres strony (domena)

Dodatkowe (tylko jeśli występują):
- Czy jest Google Maps? (tak/nie)
- Czy jest Google Analytics lub inna analityka? (tak/nie, jaka)
- Czy jest piksel reklamowy (np. Meta/Facebook)? (tak/nie)
- Czy jest newsletter / zapis na maile? (tak/nie, jaka usługa)
- Nazwa dostawcy formularza kontaktowego (jeśli formularz wysyła dane przez zewnętrzną usługę, a nie wprost na e-mail)
- Nazwa firmy hostingowej (przy GitHub Pages: GitHub, Inc.)
- Data ostatniej aktualizacji dokumentu

### Dwie twarde zasady zgód (żeby było zgodnie z prawem)

1. **Przy zwykłym formularzu kontaktowym nie dajemy checkboxa zgody.** Odpowiedź na zapytanie opieramy na uzasadnionym interesie i na krokach do zawarcia umowy (art. 6 ust. 1 lit. f oraz lit. b RODO). Dodatkowy checkbox "wyrażam zgodę na przetwarzanie" jest tu zbędny i bywa wręcz błędny.
2. **Żadna zgoda nie może być zaznaczona z góry.** Checkbox domyślnie odhaczony jest nieważny (wyrok TSUE w sprawie Planet49, C-673/17). Dotyczy to newslettera i cookies innych niż niezbędne.

---

## CZĘŚĆ 1. KLAUZULA INFORMACYJNA POD FORMULARZ

> Wstaw drobnym, ale czytelnym tekstem bezpośrednio pod polami formularza (nad lub pod przyciskiem "Wyślij"). Nie dodawaj tu checkboxa zgody.

```
Administratorem Twoich danych jest [DO UZUPEŁNIENIA: pełna nazwa firmy],
[DO UZUPEŁNIENIA: adres], NIP [DO UZUPEŁNIENIA: NIP].
Dane z formularza (imię, e-mail, telefon, treść wiadomości) przetwarzamy
po to, aby odpowiedzieć na Twoje zapytanie i ewentualnie przygotować ofertę
lub umowę. Podstawą jest nasz uzasadniony interes w udzieleniu odpowiedzi
(art. 6 ust. 1 lit. f RODO) oraz podjęcie działań przed zawarciem umowy na
Twoje żądanie (art. 6 ust. 1 lit. b RODO). Podanie danych jest dobrowolne,
ale bez nich nie odpowiemy na wiadomość. Masz prawo dostępu do danych, ich
sprostowania, usunięcia, ograniczenia, wniesienia sprzeciwu oraz prawo
wniesienia skargi do Prezesa Urzędu Ochrony Danych Osobowych. Szczegóły
w naszej Polityce prywatności: [DO UZUPEŁNIENIA: link do polityki].
```

Wersja skrócona (gdy bardzo mało miejsca, np. na telefonie):

```
Wysyłając formularz, przekazujesz swoje dane firmie
[DO UZUPEŁNIENIA: nazwa firmy], która użyje ich wyłącznie do odpowiedzi na
Twoje zapytanie (art. 6 ust. 1 lit. f i b RODO). Podanie danych jest
dobrowolne. Pełna informacja o Twoich prawach i o tym, jak chronimy dane,
znajduje się w Polityce prywatności: [DO UZUPEŁNIENIA: link].
```

---

## CZĘŚĆ 2. POLITYKA PRYWATNOŚCI

> Pełna treść spełniająca obowiązek informacyjny z art. 13 RODO (dane zbieramy bezpośrednio od osoby, której dotyczą). Umieść na osobnej podstronie (np. /polityka-prywatnosci) i podlinkuj w stopce oraz pod formularzem.

# Polityka prywatności

**Data ostatniej aktualizacji:** [DO UZUPEŁNIENIA: data]

### 1. Kto jest administratorem Twoich danych

Administratorem Twoich danych osobowych, czyli podmiotem, który decyduje o tym, jak i po co są one wykorzystywane, jest:

- **[DO UZUPEŁNIENIA: pełna nazwa firmy]**
- Adres: [DO UZUPEŁNIENIA: adres]
- NIP: [DO UZUPEŁNIENIA: NIP]
- E-mail w sprawach danych osobowych: [DO UZUPEŁNIENIA: e-mail]
- Telefon: [DO UZUPEŁNIENIA: telefon - opcjonalnie]

W sprawach dotyczących Twoich danych możesz kontaktować się z nami pod powyższym adresem e-mail.

### 2. Jakie dane zbieramy i w jakim celu

Zbieramy tylko te dane, które są nam potrzebne. W zależności od tego, jak korzystasz ze strony, mogą to być:

- **Dane z formularza kontaktowego:** imię (lub nazwa), adres e-mail, numer telefonu oraz treść wiadomości.
  Cel: udzielenie odpowiedzi na Twoje zapytanie, kontakt zwrotny, przygotowanie oferty albo umowy.
- **Dane przesłane bezpośrednio w mailu lub telefonicznie**, jeśli sam(a) napiszesz lub zadzwonisz na podane na stronie dane.
  Cel: obsługa Twojej sprawy.
- **Dane techniczne związane z odwiedzeniem strony** (np. adres IP, informacje o przeglądarce) - w zakresie, w jakim są przetwarzane przez naszego dostawcę hostingu w celu zapewnienia działania i bezpieczeństwa strony.

Nie zbieramy danych "na zapas" i nie prosimy o dane, które nie są nam potrzebne do obsługi Twojej sprawy.

### 3. Na jakiej podstawie prawnej przetwarzamy dane

- **Odpowiedź na zapytanie z formularza, maila lub telefonu:** nasz uzasadniony interes polegający na komunikacji z osobami zainteresowanymi naszą ofertą (art. 6 ust. 1 lit. f RODO) oraz podjęcie działań przed zawarciem umowy na Twoje żądanie (art. 6 ust. 1 lit. b RODO).
- **Zawarcie i wykonanie umowy**, jeśli zostaniesz naszym klientem: art. 6 ust. 1 lit. b RODO.
- **Obowiązki wynikające z przepisów**, np. podatkowe i księgowe: art. 6 ust. 1 lit. c RODO.
- **Ewentualne ustalenie lub dochodzenie roszczeń albo obrona przed nimi:** nasz uzasadniony interes (art. 6 ust. 1 lit. f RODO).

[DO UZUPEŁNIENIA - wstaw tylko jeśli jest newsletter:]
- **Wysyłka newslettera lub informacji marketingowych:** Twoja dobrowolna zgoda (art. 6 ust. 1 lit. a RODO). Zgodę możesz wycofać w każdej chwili.

### 4. Komu przekazujemy dane (odbiorcy danych)

Twoich danych nie sprzedajemy. Możemy je powierzać zaufanym podmiotom, które pomagają nam prowadzić działalność i robią to na nasze zlecenie:

- **Dostawca hostingu strony:** [DO UZUPEŁNIENIA: nazwa dostawcy hostingu, przy GitHub Pages: GitHub, Inc.] - przechowuje stronę i zapewnia jej działanie.
- **Dostawca obsługi formularza / poczty:** [DO UZUPEŁNIENIA: nazwa - jeśli formularz wysyła dane przez zewnętrzną usługę; jeśli wiadomości trafiają wprost na e-mail, wpisz dostawcę poczty].
- **Biuro rachunkowe / księgowość:** jeśli zostaniesz naszym klientem i wystawimy dokumenty rozliczeniowe.
- **Podmioty uprawnione na podstawie przepisów prawa**, np. organy państwowe, jeśli wystąpią z takim żądaniem.

[DO UZUPEŁNIENIA - wstaw tylko jeśli jest Google Maps, Google Analytics lub piksel:]
- **Google** (np. Google Maps, Google Analytics) - w zakresie opisanym w Polityce cookies.
- **[DO UZUPEŁNIENIA: dostawca piksela reklamowego, np. Meta Platforms]** - jeśli korzystamy z piksela reklamowego.

### 5. Przekazywanie danych poza Europejski Obszar Gospodarczy (EOG)

Niektórzy nasi dostawcy usług (np. dostawca hostingu, narzędzia Google, dostawca formularza) mogą mieć siedzibę lub serwery w Stanach Zjednoczonych, czyli poza EOG. Takie przekazanie danych odbywa się zgodnie z rozdziałem V RODO i jest zabezpieczone jednym z poniższych mechanizmów:

- **decyzją Komisji Europejskiej o odpowiednim stopniu ochrony** w ramach programu EU-US Data Privacy Framework - o ile dany dostawca jest w tym programie certyfikowany, albo
- **standardowymi klauzulami umownymi** zatwierdzonymi przez Komisję Europejską, jeśli dostawca nie jest objęty powyższą decyzją.

Na żądanie udostępnimy Ci więcej informacji o stosowanych zabezpieczeniach.

### 6. Jak długo przechowujemy dane

- **Korespondencja i dane z zapytań, które nie zakończyły się współpracą:** do czasu zakończenia sprawy, a następnie przez okres potrzebny do ewentualnej obrony przed roszczeniami, nie dłużej niż [DO UZUPEŁNIENIA: np. 1 rok] od ostatniego kontaktu.
- **Dane klientów i dokumenty rozliczeniowe:** przez okres trwania umowy oraz przez czas wymagany przepisami podatkowymi i rachunkowymi (co do zasady 5 lat licząc od końca roku, w którym wystawiono dokument).
- **Dane przetwarzane na podstawie zgody (np. newsletter):** do czasu wycofania zgody.

### 7. Twoje prawa

W związku z przetwarzaniem Twoich danych masz prawo do:

- **dostępu** do swoich danych i otrzymania ich kopii,
- **sprostowania** (poprawienia) danych,
- **usunięcia** danych ("prawo do bycia zapomnianym"),
- **ograniczenia** przetwarzania,
- **wniesienia sprzeciwu** wobec przetwarzania opartego na naszym uzasadnionym interesie,
- **przenoszenia** danych (otrzymania ich w powszechnie używanym formacie),
- **cofnięcia zgody** w dowolnym momencie, jeśli przetwarzanie odbywa się na podstawie zgody (cofnięcie nie wpływa na zgodność z prawem przetwarzania sprzed cofnięcia).

Aby skorzystać z tych praw, napisz do nas na adres: [DO UZUPEŁNIENIA: e-mail].

Masz również prawo **wniesienia skargi do organu nadzorczego** - Prezesa Urzędu Ochrony Danych Osobowych (ul. Stawki 2, 00-193 Warszawa), jeśli uznasz, że przetwarzamy Twoje dane niezgodnie z prawem.

### 8. Dobrowolność podania danych

Podanie danych jest dobrowolne. Bez podania danych kontaktowych nie będziemy jednak w stanie odpowiedzieć na Twoje zapytanie ani przygotować oferty. W przypadku zawarcia umowy część danych może być potrzebna do jej wykonania oraz do spełnienia obowiązków wynikających z przepisów (np. wystawienia dokumentu rozliczeniowego).

### 9. Automatyczne podejmowanie decyzji i profilowanie

Nie podejmujemy wobec Ciebie decyzji w sposób w pełni automatyczny i nie profilujemy Twoich danych w sposób, który wywoływałby wobec Ciebie skutki prawne lub w podobny sposób istotnie na Ciebie wpływał.

[DO UZUPEŁNIENIA - jeśli na stronie działa analityka lub reklamy, zamień zdanie powyżej na:]
> Korzystamy z narzędzi analitycznych i reklamowych opisanych w Polityce cookies. Mogą one tworzyć statystyki i dopasowywać wyświetlane treści, ale nie podejmujemy na ich podstawie zautomatyzowanych decyzji wywołujących wobec Ciebie skutki prawne ani podobnie istotnych.

### 10. Bezpieczeństwo danych

Stosujemy odpowiednie środki techniczne i organizacyjne chroniące Twoje dane (art. 32 RODO). Połączenie z naszą stroną jest szyfrowane (protokół HTTPS), co zabezpiecza dane przesyłane przez formularz w trakcie transmisji.

### 11. Zmiany polityki

Możemy aktualizować tę politykę, na przykład gdy zmienią się nasze narzędzia lub przepisy. Aktualna wersja zawsze znajduje się na tej stronie, a datę ostatniej zmiany podajemy na górze dokumentu.

---

## CZĘŚĆ 3. POLITYKA COOKIES

> **WAŻNE - przeczytaj zanim wstawisz:** Jeśli strona ma TYLKO elementy niezbędne (lokalne, własne czcionki; brak analityki, map i zewnętrznych wstawek; formularz bez śledzenia), to ta polityka cookies oraz baner zgody NIE są wymagane. Pliki technicznie niezbędne do działania strony nie wymagają zgody (art. 399 PKE - wyjątek dla plików niezbędnych do świadczenia usługi żądanej przez użytkownika). Wstawiaj tę część dopiero, gdy strona ładuje analitykę, mapy, piksele lub inne treści śledzące.

# Polityka cookies

**Data ostatniej aktualizacji:** [DO UZUPEŁNIENIA: data]

### 1. Czym są pliki cookies

Cookies to niewielkie pliki tekstowe zapisywane na Twoim urządzeniu (komputerze, telefonie) podczas korzystania ze strony. Pozwalają one stronie działać poprawnie, a niektóre z nich pomagają nam zrozumieć, jak strona jest używana, lub służą celom reklamowym.

### 2. Podstawa prawna

Korzystanie z plików cookies oraz podobnych technologii reguluje w Polsce ustawa Prawo komunikacji elektronicznej (PKE):

- pliki **technicznie niezbędne** do działania strony nie wymagają Twojej zgody (art. 399 PKE),
- pozostałe pliki (analityczne, marketingowe) zapisujemy i odczytujemy **tylko za Twoją zgodą**, którą możesz w każdej chwili wycofać.

Zgoda nigdy nie jest zaznaczona z góry - decyzję podejmujesz samodzielnie (zgodnie z wyrokiem Trybunału Sprawiedliwości UE w sprawie Planet49, C-673/17).

### 3. Z jakich cookies korzystamy

| Kategoria | Po co | Przykładowi dostawcy | Przykładowy czas życia | Zgoda |
|---|---|---|---|---|
| **Niezbędne** | Zapewnienie działania strony, zapamiętanie wyboru z banera cookies, bezpieczeństwo | [DO UZUPEŁNIENIA: np. dostawca hostingu] | Sesja lub do 12 miesięcy | Nie jest wymagana |
| **Analityczne** | Statystyki odwiedzin, sprawdzenie, które podstrony są popularne | [DO UZUPEŁNIENIA: np. Google Analytics] | Do 24 miesięcy | Wymagana |
| **Marketingowe** | Dopasowanie reklam, mierzenie skuteczności kampanii | [DO UZUPEŁNIENIA: np. Meta / piksel reklamowy] | Do 12 miesięcy | Wymagana |

> Tabelę uzupełnij wyłącznie o te kategorie i dostawców, którzy faktycznie działają na stronie. Jeśli na stronie nie ma cookies marketingowych - usuń ten wiersz. Jeśli nie ma analitycznych - usuń tamten.

### 4. Osadzone treści zewnętrzne

[DO UZUPEŁNIENIA - wstaw tylko jeśli strona osadza takie treści:]
Na stronie mogą znajdować się treści ładowane z serwisów zewnętrznych, na przykład mapa Google. Otwierając podstronę z taką treścią, możesz przekazywać dane (np. adres IP) do dostawcy tej usługi. Treści te ładujemy zgodnie z Twoimi ustawieniami zgody.

### 5. Jak zarządzać zgodą i cofnąć ją

- Przy pierwszej wizycie wyświetlamy baner, w którym możesz zaakceptować lub odrzucić cookies inne niż niezbędne.
- Możesz **w każdej chwili zmienić lub wycofać zgodę**, klikając [DO UZUPEŁNIENIA: nazwa linku lub przycisku, np. "Ustawienia cookies" w stopce strony].
- Pliki cookies możesz też usuwać i blokować w ustawieniach swojej przeglądarki. Ograniczenie cookies niezbędnych może wpłynąć na działanie strony.

### 6. Jak powinien działać nasz baner cookies (informacja o standardzie)

Stosujemy baner zgody zgodny z przepisami, co oznacza, że:

- przycisk **"Odrzuć"** jest równorzędny i tak samo łatwo dostępny jak przycisk "Akceptuję",
- **żadna zgoda nie jest zaznaczona domyślnie** - musisz ją aktywnie wyrazić,
- skrypty analityczne i marketingowe **uruchamiają się dopiero po wyrażeniu zgody**, a nie przed nią,
- masz możliwość wyrażenia zgody wybiórczo (np. tylko analityka, bez marketingu),
- wycofanie zgody jest równie proste jak jej udzielenie.

---

## CZĘŚĆ 4. WARIANTY I PRZEŁĄCZNIKI (wstawiaj zależnie od narzędzi)

> Te fragmenty dokładasz tylko wtedy, gdy dane narzędzie faktycznie jest na stronie. Jeśli go nie ma - pomiń cały blok.

### A. Wstaw TYLKO jeśli jest Google Analytics

Do Polityki prywatności (sekcja "Odbiorcy danych") i do tabeli cookies dodaj:

```
Korzystamy z Google Analytics, narzędzia firmy Google do tworzenia
statystyk odwiedzin (dostawca: Google Ireland Limited oraz Google LLC
w USA). Narzędzie to uruchamiamy wyłącznie po wyrażeniu przez Ciebie zgody
na cookies analityczne. Dane mogą być przekazywane do USA na podstawie
decyzji o odpowiednim stopniu ochrony (EU-US Data Privacy Framework) lub
standardowych klauzul umownych - zgodnie z rozdziałem V RODO. Zgodę możesz
wycofać w ustawieniach cookies.
```

### B. Wstaw TYLKO jeśli jest Google Maps

Do Polityki cookies (sekcja "Osadzone treści zewnętrzne") dodaj:

```
Na stronie osadzamy mapę Google Maps (dostawca: Google Ireland Limited oraz
Google LLC w USA), aby ułatwić Ci dotarcie do nas. Po wyświetleniu mapy
Twoje dane (m.in. adres IP) mogą zostać przekazane do Google, w tym do USA,
na podstawie decyzji o odpowiednim stopniu ochrony (EU-US Data Privacy
Framework) lub standardowych klauzul umownych (rozdział V RODO). Mapę
ładujemy zgodnie z Twoimi ustawieniami zgody na cookies.
```

### C. Wstaw TYLKO jeśli jest piksel reklamowy (np. Meta / Facebook)

Do Polityki prywatności i tabeli cookies (kategoria marketingowe) dodaj:

```
Korzystamy z piksela [DO UZUPEŁNIENIA: nazwa, np. Meta] - narzędzia, które
mierzy skuteczność naszych reklam i pomaga docierać do osób potencjalnie
zainteresowanych ofertą (dostawca: [DO UZUPEŁNIENIA: np. Meta Platforms
Ireland Limited]). Piksel uruchamiamy wyłącznie po wyrażeniu przez Ciebie
zgody na cookies marketingowe. Dane mogą być przekazywane poza EOG na
podstawie decyzji o odpowiednim stopniu ochrony lub standardowych klauzul
umownych (rozdział V RODO). Zgodę możesz wycofać w ustawieniach cookies.
```

### D. Wstaw TYLKO jeśli jest newsletter / zapis na maile

**Pole zapisu (przy formularzu newslettera) - osobny, niezaznaczony checkbox:**

```
[ ] Chcę otrzymywać newsletter na podany adres e-mail i wyrażam zgodę na
    przesyłanie informacji marketingowych drogą elektroniczną.
```

> Checkbox musi być pusty (niezaznaczony) z góry. Zgoda na newsletter jest osobna od zgody dotyczącej zwykłego formularza kontaktowego - nie łącz ich w jeden checkbox.

**Klauzula pod polem zapisu na newsletter:**

```
Administratorem Twoich danych jest [DO UZUPEŁNIENIA: nazwa firmy]. Adres
e-mail przetwarzamy w celu wysyłki newslettera na podstawie Twojej zgody
(art. 6 ust. 1 lit. a RODO). Przesyłanie informacji marketingowych drogą
elektroniczną odbywa się za Twoją zgodą zgodnie z art. 398 Prawa
komunikacji elektronicznej. Zgodę możesz wycofać w każdej chwili, klikając
link "Wypisz się" w każdej wiadomości lub pisząc na
[DO UZUPEŁNIENIA: e-mail]. Wycofanie zgody nie wpływa na zgodność z prawem
wysyłek sprzed wycofania. Twoje prawa opisujemy w Polityce prywatności:
[DO UZUPEŁNIENIA: link].
```

**Potwierdzenie zapisu (double opt-in) - wymagane:**

Po zapisaniu się wysyłaj wiadomość z linkiem potwierdzającym. Dopiero kliknięcie w ten link aktywuje subskrypcję. Dzięki temu masz dowód, że to właściciel adresu wyraził zgodę, i unikasz zapisywania osób bez ich wiedzy. Treść maila potwierdzającego:

```
Cześć,
ktoś (mamy nadzieję, że Ty) zapisał ten adres e-mail do newslettera
[DO UZUPEŁNIENIA: nazwa firmy]. Aby potwierdzić zapis i zacząć otrzymywać
wiadomości, kliknij poniższy link:

[DO UZUPEŁNIENIA: link potwierdzający]

Jeśli to nie Ty - zignoruj tę wiadomość, nie zapiszemy Cię.
```

### E. Wstaw TYLKO jeśli formularz korzysta z zewnętrznego dostawcy

Jeśli formularz nie wysyła wiadomości wprost na skrzynkę, lecz przez zewnętrzną usługę (np. usługę obsługi formularzy), w Polityce prywatności (sekcja "Odbiorcy danych") dodaj:

```
Do obsługi formularza kontaktowego korzystamy z usługi
[DO UZUPEŁNIENIA: nazwa dostawcy], która w naszym imieniu odbiera i
przekazuje nam wiadomości wysłane przez formularz. Jeśli dostawca przetwarza
dane poza EOG, odbywa się to na podstawie decyzji o odpowiednim stopniu
ochrony (EU-US Data Privacy Framework) lub standardowych klauzul umownych
(rozdział V RODO).
```

---

*Dokument przygotowany jako szablon. Po uzupełnieniu pól `[DO UZUPEŁNIENIA]` i dopasowaniu wariantów do faktycznych narzędzi strony zalecane jest, aby klient (administrator danych) zweryfikował treść pod kątem swojej konkretnej działalności.*
