# Umowy z karty klienta — jak to działa

**Wszystko jest włączone i przetestowane (ostatnio 29.07.2026). Nie ma nic do klikania.**

## Dla handlowca

Karta klienta → pole **Umowa** → **„Stwórz umowę”**. Formularz sam podstawia
z karty nazwę firmy, e-mail i kwoty z zakładki „Usługi”. Dopisujesz adres,
NIP, kwoty, liczbę podstron i wariant utrzymania. Wysyłasz — po kilkunastu
sekundach gotowe pliki pojawiają się na karcie.

**Kwoty wpisujesz jak chcesz: netto albo brutto.** Obok siebie są dwa pola i
przeliczają się nawzajem od razu (VAT 23%). Pod spodem widać podsumowanie:
ile wychodzi za rok z góry i ile klient płaci na start.

⚠️ Przy VAT 23% **nie każda okrągła kwota brutto jest osiągalna** — np. równe
3 000,00 zł brutto nie wychodzi z żadnej kwoty netto (najbliżej 2 999,99).
Formularz wtedy sam poprawi kwotę i o tym napisze. To nie błąd, tylko sposób,
w jaki działa zaokrąglanie VAT-u.

**Wychodzą dwa pliki:**
- **PDF** — to idzie do klienta i do Autenti,
- **DOCX** — do ewentualnych poprawek, otwiera się w Google Docs.

Wszystkie wartości, które wpisał handlowiec, są w umowie **pogrubione** — na
pierwszy rzut oka widać, co uzupełnił generator, a co jest stałą treścią wzoru.

Umowy widzisz przy swoich klientach. Cudzych nie — tak samo jak z kartami.

## Lista wszystkich umów

Menu (☰) → **Umowy** (`umowy.html`). Widać kto, kiedy i na jakich warunkach
wystawił umowę, można pobrać PDF i DOCX, wejść na kartę klienta albo kliknąć
**„Popraw i wygeneruj od nowa”**.

„Popraw” otwiera formularz z wypełnionymi danymi tamtej umowy i tworzy **nową
wersję**. Starej nigdy nie nadpisujemy — plik, który już gdzieś poszedł, ma
zostać taki, jaki był. Poprzednia wersja zostaje na liście jako „zastąpiona”.

## Co się dzieje pod spodem

```
formularz (umowa.html)
   │  zapis do tabeli contracts — to BAZA sprawdza, czy wolno
   ▼
automat na Macu Krzysztofa (co 60 s)
   │  1. składa DOCX ze wzoru, z niego PDF (LibreOffice)
   │  2. wrzuca OBA pliki do prywatnego bucketa 'umowy'
   │  3. status = ready
   │  4. komentarz @Krzysztof @Marceli na karcie = dzwonek w CRM
   │  5. dymek na Macu Krzysztofa + push na telefon (ntfy)
   ▼
gotowy PDF na karcie → Autenti → klient
```

Składanie trwa około pięciu sekund. Sprawdzone na żywo od początku do końca.

⚠️ **Automat chodzi na Macu Krzysztofa.** Gdy Mac jest wyłączony, umowa czeka
w kolejce ze statusem „składa się…” i zostanie zrobiona po włączeniu.
Nic nie ginie. Gdyby to zaczęło przeszkadzać, w repo `kris20032/umowy-generator`
leży gotowa wersja chmurowa (GitHub Actions) — do włączenia jednym poleceniem.

## Powiadomienia o wystawionej umowie

| Kanał | Kto dostaje | Skąd |
|---|---|---|
| Komentarz `@Krzysztof @Marceli` na karcie (dzwonek w CRM) | obaj, poza autorem umowy | `umowa_build.py` |
| Dymek na Macu | Krzysztof | apka „Dyżurny Demo” + kolejka `notify-queue.tsv` |
| Push na telefon | każdy, kto subskrybuje temat ntfy | `notify.conf` → `NTFY_TOPIC_UMOWY` |

Push jest wspólny dla Krzysztofa i Marcelego — wystarczy w apce **ntfy**
(App Store / Google Play) dodać subskrypcję tematu z `notify.conf`, albo
otworzyć `https://ntfy.sh/<temat>` w przeglądarce.

⚠️ ntfy.sh jest publiczne — kto zna nazwę tematu, widzi powiadomienia. Dlatego
w treści są **tylko nazwa firmy i kto wystawił**: zero kwot, NIP-ów i e-maili.

## Gdzie co mieszka

| Rzecz | Miejsce |
|---|---|
| Formularz | `umowa.html` + `umowa.js` (to repo) |
| Lista umów | `umowy.html` + `umowy.js` (to repo) |
| Przycisk i pliki na karcie | `app.js`, funkcja `wypelnijUmowy` |
| Tabela, bucket, uprawnienia | `schema-umowy.sql` (wykonane w bazie) |
| Automat | `~/Library/Application Support/newbeginning/scripts/umowa-watcher.sh` + `umowa_build.py` |
| Wzór z polami | tamże, `umowa-szablon.docx` |
| Warianty utrzymania, kwoty, pogrubienia | tamże, `umowa_wypelnij.py` |
| Zatwierdzony wzór (źródło) | `~/Desktop/UMOWA-Impulseo-WZOR-AKTUALNY-2026-07-29.docx` |

Skrypty automatu kopiują się same co pół godziny do prywatnego repo
`Impulseo-pl/newbeginning-automaty` — kopia zapasowa jest z automatu.

## Gdy coś nie wyjdzie

Umowa dostaje status błędu z konkretnym powodem, widocznym na karcie.
Dane z formularza zostają, więc powtórka nie wymaga wpisywania od nowa:

```
cd ~/Library/Application\ Support/newbeginning/scripts
bash umowa-watcher.sh <numer umowy>
```

Log: `~/Library/Application Support/newbeginning/umowa-watcher.log`

**Wyłączenie automatu** (odwracalne, formularz działa dalej — umowy się kolejkują):

```
bash ~/Library/Application\ Support/newbeginning/scripts/umowa-watcher-stop.sh
```

## Gdy zmieni się treść umowy

Kolejność jest jedna i trzeba jej pilnować, inaczej wersja do ręcznego
wypełniania i generowana się rozjadą:

1. popraw wzór na pulpicie (`UMOWA-Impulseo-WZOR-AKTUALNY-<data>.docx`),
2. tę samą zmianę wprowadź w `umowa-szablon.docx` (szablon generatora ma
   w tych miejscach pola `{{...}}`),
3. sprawdź na sucho jedną umową i **obejrzyj PDF** — sam kod nie pokaże,
   czy skład się nie rozjechał. Umowa ma mieć **6 stron, podpisy na stronie 5**.

⚠️ Przy edycji XML-a szablonu: `<w:t>` uzupełniamy o `xml:space="preserve"`
**tylko wtedy, gdy po `w:t` stoi spacja, `>` albo `/`** — inaczej to samo
podstawienie trafia w `<w:tbl>` i `<w:tblPr>` i psuje tabelę z podpisami.
`umowa_wypelnij.py` sprawdza poprawność XML-a przed zapisem, więc taki błąd
zatrzyma się na generatorze, a nie u klienta.

## Warianty utrzymania

| Wybór w formularzu | §4 ust. 5 (na ile) | §4 ust. 4 (płatne z góry za) |
|---|---|---|
| 12 miesięcy, płatne z góry za cały rok | 12 miesięcy | 12 miesięcy + zdanie z łączną kwotą |
| 12 miesięcy, płatne co miesiąc | 12 miesięcy | miesiąca |
| 6 miesięcy, płatne co miesiąc | 6 miesięcy | miesiąca |

Poza jednym zdaniem o łącznej opłacie przy płatności z góry (dodane 29.07.2026,
bo wcześniej trzeba było je dopisywać ręcznie) generator **nie dodaje do umowy
ani jednego słowa** ponad zatwierdzony wzór. Żadnych rabatów ani gratisów.

## Zaokrąglanie kwot (dlaczego to w ogóle jest opisane)

Kwoty liczymy w **groszach, na liczbach całkowitych**, a „połówkę” zaokrąglamy
zawsze w górę — tak samo w przeglądarce (`umowa.js`) i w generatorze
(`umowa_wypelnij.py`, `Decimal` + `ROUND_HALF_UP`). Zwykłe `round()` w Pythonie
zaokrągla połówki do liczby parzystej, więc formularz pokazywałby inny grosz
niż gotowa umowa. Zgodność sprawdzona na 2 mln kwot — zero różnic.
