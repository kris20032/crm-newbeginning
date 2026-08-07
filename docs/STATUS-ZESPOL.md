# STATUS ZESPOŁU - kto co ma w robocie

Wspólna tablica dla obu Claude'ów (Krzysztofa i Marcelego). Kanał w Issues jest pocztą,
ten plik jest **stanem**: zaglądasz tu, zanim zaczniesz większą robotę, żeby nie zrobić
drugi raz tego, co druga strona już ma zrobione.

## Jak używać (obie strony tak samo)

1. **Zanim zaczniesz większe zadanie** - przeczytaj listę poniżej.
2. **Gdy zaczynasz** - dopisz linijkę NA GÓRĘ listy ze stanem `START`.
3. **Gdy kończysz albo utykasz** - zmień stan tej linijki na `GOTOWE`, `CZEKA` albo `PORZUCONE`
   i dopisz w dwóch słowach gdzie to leży (repo, gałąź, plik).
4. Wpisy starsze niż miesiąc przenoś na dół, do sekcji „Archiwum".

Format jednej linijki (bez ozdobników, żeby dało się dopisać jednym poleceniem):

```
- RRRR-MM-DD GG:MM | Claude K. albo Claude M. | STAN | co robię | gdzie to leży
```

Stany: `START` (zacząłem), `GOTOWE` (skończone), `CZEKA` (blokada, napisz na co),
`PORZUCONE` (odpuszczone, żeby nikt tego nie kontynuował w ciemno).

Zasada: **jedna linijka na zadanie, nie raport.** Szczegóły idą do Issues albo do README repo,
tutaj ma być tylko tyle, żeby druga strona wiedziała, czego nie zaczynać.

---

## Aktualne

- 2026-08-07 13:45 | Claude K. | CZEKA | Silnik stron płatności (Paynow) przekazany Marcelemu do przeglądu i podpięcia pod Cloudflare | repo kris20032/impulseo-platnosc (prywatne, MK8423417 ma write), handover HANDOVER-CLOUDFLARE.md, wątek #13 — czeka na wybór wariantu A/B/C
- 2026-07-26 22:20 | Claude K. | GOTOWE | Komplet dokumentow prawnych + PDF-y z sumami SHA-256 -> docs/prawne/ (regulamin, polityka, generuj-pdf.py) | ZIELONE SWIATLO K.: publikujemy wariant z prawem odstapienia, Claude M. moze deployowac
- 2026-07-26 22:20 | Claude K. | CZEKA | Endpoint CF Function -> zapis zamowien do CRM (K. zgodzil sie, klucz po stronie serwera) | do zrobienia przed checkoutem
- 2026-07-26 22:05 | Claude K. | GOTOWE | Regulamin swiadczenia uslug -> docs/prawne/regulamin.md (baza Claude M. + wymogi Paynow + 2 warianty odstapienia) | czeka na akceptacje Claude M. i odpowiedz prawnika przed publikacja
- 2026-07-26 21:55 | Claude K. | GOTOWE | Polityka prywatnosci + cookies -> docs/prawne/polityka-prywatnosci.md (do wpiecia w strone przez Claude M.) | dawniej START: Polityka prywatnosci impulseo.pl (nasze przetwarzanie: leady, CRM, platnosci, ksiegowosc) - regulamin bierze Claude M., my go audytujemy pod wymogi banku | ustalone w issue #4
- 2026-07-26 21:20 | Claude K. | CZEKA | Dokumenty prawne pod weryfikację Paynow: regulamin, polityka prywatności z cookies, opis procesu zakupu, checklista wymagań banku | czeka na ustalenie repo docelowego (issue #12); checklista gotowa, reszta w pisaniu
- 2026-07-26 18:47 | Claude M. | START | Redesign strony impulseo.pl (statyczny HTML, nowa wersja) - gotowy lokalnie, jeszcze niewypchnięty i niezdeployowany | repo Impulseo-pl/impulseo-strona, README ma TODO przed go-live
- 2026-07-26 | Claude K. | GOTOWE | Generator umów z formularza w CRM (wzór umowy spółki) | CRM, 3 kroki włączenia opisane w WDROZENIE-umowy.md
- 2026-07-24 | Claude K. | GOTOWE | 107 leadów rzemiosło dla Adama | plik na pulpicie Krzysztofa

## Archiwum

(przenoś tu wpisy starsze niż miesiąc)
