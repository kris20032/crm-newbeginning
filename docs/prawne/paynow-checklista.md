# Checklista: czego Paynow (mBank) wymaga od naszej strony

Dokument roboczy, nie idzie do klienta. Służy do sprawdzenia KAŻDEJ wersji impulseo.pl przed weryfikacją banku.

**Stan na:** 26.07.2026
**Podstawa:** Regulamin usługi Integratora Płatności Paynow dla firm w ramach bankowości detalicznej mBanku S.A., **obowiązuje od 14.12.2023** (to wersja aktualna, potwierdzone na liście dokumentów mBanku).

Źródła:
- Regulamin (PDF): https://static.paynow.pl/docs/regulamin_uslugi_integratora_platnosci_paynow_dla_firm_od_14122023.pdf
- Lista dokumentów i archiwum wersji: https://www.mbank.pl/pomoc/dokumenty/firmy/konta/konta/paynow/
- Towary i usługi zakazane: https://www.mbank.pl/pdf/firmy/inne/towary-i-uslugi-zakazane-paynow.pdf
- FAQ o uruchomieniu usługi: https://faq.paynow.pl/docs/jak-skorzystac-z-uslugi-paynow

> Uwaga na pułapkę: pod adresem `mbank.pl/pdf/firmy/inne/regulamin-uslugi-integratora-platnosci-paynow-dla-firm.pdf` leży wersja z **1.02.2020**. To nie jest obowiązujący dokument, nie opierać się na nim.

---

## A. Co musi być na stronie (pkt 4 ust. 5 regulaminu)

Bank wylicza to punkt po punkcie. Brak któregokolwiek elementu jest w pkt 7 ust. 1 lit. g wymieniony wprost jako **podstawa wypowiedzenia umowy przez bank**.

| # | Wymóg (litera w regulaminie) | Gdzie to u nas będzie | Status |
|---|---|---|---|
| 1 | Wyczerpujący i prawdziwy opis usług **z cenami** (lit. a) | strona główna, sekcja pakietów + regulamin §3 | do sprawdzenia w nowej wersji |
| 2 | Procedura składania i rozpatrywania **reklamacji** (lit. b) | regulamin, osobny paragraf | do napisania |
| 3 | **Polityka zwrotu**, w tym okres zwrotu (lit. c) | regulamin, osobny paragraf | do napisania |
| 4 | Zasady, na jakich kupujący **otrzyma zwrot płatności** (lit. d) | regulamin, ten sam paragraf | częściowo jest w wersji live |
| 5 | **Dane kontaktowe** do obsługi kupujących: e-mail lub telefon (lit. e) | stopka + regulamin: biuro@impulseo.pl, +48 604 850 488 | jest |
| 6 | **Pełny adres stałej siedziby** (lit. f) | stopka: ul. Szafarnia 11 lok. F8, 80-755 Gdańsk | jest w starej wersji, sprawdzić w nowej |
| 7 | **Waluta płatności** (lit. g) | regulamin: wszystkie ceny w PLN | jest |
| 8 | **Ograniczenia eksportowe i prawne**, jeśli je znamy (lit. h) | regulamin: usługi świadczymy na terenie Polski, w języku polskim | do napisania |
| 9 | Polityka sprzedaży i dostaw (lit. i), a w niej: | | |
| 9a | zasady **aktywowania zakupionych usług** | regulamin: kiedy startuje realizacja i kiedy startuje abonament | do napisania |
| 9b | polityka **ochrony danych osobowych i prywatności** | /polityka-prywatnosci | jest w starej wersji, do przepisania |
| 9c | polityka **reklamacji zakupionych towarów i usług** | regulamin | do napisania |
| 9d | informacje wymagane przepisami prawa | dane rejestrowe spółki, informacja o odstąpieniu | częściowo |

## B. Możliwość zakupu (pkt 4 ust. 7 lit. b)

Strona **nie może** być stroną, która „nie zawiera produktów lub usług oraz możliwości ich zakupu". W praktyce: sam cennik plus formularz „zapytaj o wycenę" jest ryzykowny, bo klient nie ma jak kupić.

Do decyzji zespołu: realny przycisk zamówienia z płatnością (rekomendowane) albo świadome ryzyko przy weryfikacji. To pytanie leży w issue #12.

## C. Znak Paynow na stronie głównej (pkt 10 ust. 4)

Logo serwisu ma być umieszczone **na stronie głównej** każdego sklepu, w którym można zapłacić przez Paynow. Materiały graficzne: https://faq.paynow.pl/docs/materialy-graficzne-1

## D. Nasze usługi a lista zakazanych

Projektowanie i wykonanie stron internetowych **nie jest** na liście wyłączonych kategorii. Jedno miejsce wymaga ostrożności w opisie: punkt 9 listy wyłącza „adresy stron internetowych i serwerów FTP (...) oraz usługi z nimi związane". To celuje w handel dostępami i domenami, nie w wykonanie strony na zamówienie, ale **opisujmy się konsekwentnie jako „projektowanie, wykonanie i utrzymanie strony internetowej"**, nigdy jako „sprzedaż stron" czy „sprzedaż domen".

Punkt 10 listy wyłącza usługi marketingowe polegające na sprzedaży polubień, obserwujących, komentarzy i wyświetleń. Nas nie dotyczy, ale gdyby kiedyś doszła oferta „social media", trzeba to opisać ostrożnie.

## E. Obowiązki poza samą stroną

- **Dokumentacja wykonania usługi przez 3 lata** (pkt 4 ust. 4). Bank może zażądać potwierdzenia, że dostarczyliśmy to, za co dostaliśmy płatność. Trzymamy: podpisaną umowę, protokół lub mail z odbioru, korespondencję. Termin liczy się od wykonania umowy i obowiązuje też **3 lata po** rozwiązaniu umowy z bankiem.
- **Zwroty** (pkt 9). Zwrot zlecamy w serwisie transakcyjnym, bank realizuje do 7 dni roboczych, wyłącznie tą samą drogą, którą przyszła płatność. Prowizji za pierwotną płatność bank nie oddaje. To ma się zgadzać z tym, co obiecujemy w regulaminie.
- **Weryfikacja okresowa** (pkt 4 ust. 6). Bank sprawdza stronę **nie rzadziej niż raz w roku**, nie tylko na starcie. Strona nie może być nieaktywna ani przekierowywać pod inny adres.
- **Odpowiedź na pismo banku w 14 dni** (pkt 4 ust. 7). Brak odpowiedzi = podstawa wypowiedzenia (pkt 7 ust. 1 lit. m). Adres e-mail podany bankowi musi być czytany.
- **Aktualne adresy sklepów** (pkt 4 ust. 2 lit. b). Usługa działa tylko dla adresów zgłoszonych we wniosku. Zmiana domeny albo dołożenie drugiej strony wymaga zgłoszenia.

## F. Proces i terminy

- Weryfikacja wstępna: **do 5 dni roboczych**, zwykle krócej.
- Odrzucenie: **30-dniowa przerwa** przed ponownym podejściem, więc lepiej podejść raz a dobrze.
- Karty płatnicze i Google Pay wymagają **odrębnej umowy** z Autopay S.A. (pkt 8 regulaminu). BLIK i szybkie przelewy są w podstawowej usłudze.

## G. Rzeczy do pilnowania po naszej stronie (nie wymóg banku, ale zepsuje weryfikację)

- **Przełączenie domeny na nową wersję strony bez podstron prawnych** = strona z dnia na dzień przestaje spełniać sekcję A. To dziś główne ryzyko.
- **Status VAT.** Ceny na stronie muszą odpowiadać rzeczywistemu statusowi spółki (VAT-R złożony 24.07, czekamy na przetworzenie). Jeśli podajemy „netto + 23% VAT", to musi być prawdą w dniu sprzedaży.
- **Skrzynka biuro@impulseo.pl** to obecnie przekierowanie na prywatnego Gmaila, działa tylko do odbioru. Do obsługi kupujących wystarcza, ale odpowiedź „jako biuro@" nie wyjdzie.
