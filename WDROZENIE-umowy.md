# Umowy z karty klienta — jak to działa

**Wszystko jest włączone i przetestowane (26.07.2026). Nie ma nic do klikania.**

## Dla handlowca

Karta klienta → pole **Umowa** → **„Stwórz umowę”**. Formularz sam podstawia
z karty nazwę firmy, e-mail i kwoty z zakładki „Usługi”. Dopisujesz adres,
NIP i wybierasz wariant abonamentu. Wysyłasz — po kilkunastu sekundach
gotowy PDF pojawia się na karcie i można go pobrać.

Umowy widzisz przy swoich klientach. Cudzych nie — tak samo jak z kartami.

## Co się dzieje pod spodem

```
formularz (umowa.html)
   │  zapis do tabeli contracts — to BAZA sprawdza, czy wolno
   ▼
automat na Macu Krzysztofa (co 60 s)
   │  1. składa PDF ze wzoru (LibreOffice)
   │  2. wrzuca do prywatnego bucketa 'umowy'
   │  3. status = ready
   │  4. komentarz @Krzysztof na karcie = dzwonek
   ▼
gotowy PDF na karcie → Autenti → klient
```

Składanie trwa około pięciu sekund. Sprawdzone na żywo od początku do końca.

⚠️ **Automat chodzi na Macu Krzysztofa.** Gdy Mac jest wyłączony, umowa czeka
w kolejce ze statusem „składa się…” i zostanie zrobiona po włączeniu.
Nic nie ginie. Gdyby to zaczęło przeszkadzać, w repo `kris20032/umowy-generator`
leży gotowa wersja chmurowa (GitHub Actions) — do włączenia jednym poleceniem.

## Gdzie co mieszka

| Rzecz | Miejsce |
|---|---|
| Formularz | `umowa.html` + `umowa.js` (to repo) |
| Przycisk i lista umów na karcie | `app.js`, funkcja `wypelnijUmowy` |
| Tabela, bucket, uprawnienia | `schema-umowy.sql` (wykonane w bazie) |
| Automat | `~/Library/Application Support/newbeginning/scripts/umowa-watcher.sh` + `umowa_build.py` |
| Wzór z polami | tamże, `umowa-szablon.docx` |
| Warianty abonamentu | tamże, `umowa_wypelnij.py` → `WARIANTY` |
| Zatwierdzony wzór (źródło) | `~/Desktop/UMOWA-Impulseo-WZOR-AKTUALNY-2026-07-26.docx` |

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
2. przerób go na szablon z polami:
   `python3 zrob_szablon.py <wzór> umowa-szablon.docx` (skrypt w repo `umowy-generator`),
3. podmień `umowa-szablon.docx` w katalogu automatu,
4. sprawdź na sucho jedną umową i **obejrzyj PDF** — sam kod nie pokaże,
   czy skład się nie rozjechał.

## Warianty abonamentu

| Wybór w formularzu | §4 ust. 5 (na ile) | §4 ust. 4 (płatne z góry za) |
|---|---|---|
| 12 miesięcy, płatne z góry za cały rok | 12 miesięcy | 12 miesięcy |
| 12 miesięcy, płatne co miesiąc | 12 miesięcy | miesiąca |
| 6 miesięcy, płatne co miesiąc | 6 miesięcy | miesiąca |

Generator **nie dodaje do umowy ani jednego słowa** ponad zatwierdzony wzór —
wypełnia tylko puste miejsca. Żadnych rabatów ani gratisów w treści.
