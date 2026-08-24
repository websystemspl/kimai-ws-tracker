# Kimai - pomiar czasu (Web Systems)

Własny dodatek do Chrome i Firefox do startowania i zatrzymywania pomiaru czasu
w naszym Kimai. Napisany od zera - nie jest przeróbką dodatku „Time Tracker Addon
for Kimai", którego licencja zabrania modyfikacji i dystrybucji dzieł pochodnych.

## Czym się różni od gotowców ze sklepu

- **Polski i angielski**, przełączane w ustawieniach. Gotowe dodatki mają teksty
  niemieckie wpisane na sztywno, bez pliku tłumaczeń.
- **Nie pozwala zacząć pomiaru z bezwartościowym opisem.** Odrzuca puste, za krótkie
  i generyczne („poprawki", „call", „bug fixing", „n8n"). Kimai sam tego nie potrafi -
  pole opisu jest w nim zawsze opcjonalne.
- **Nowoczesne uwierzytelnianie** tokenem Bearer. Alternatywny „Kimai for Chrome"
  używa przestarzałego `X-AUTH`, ograniczanego w Kimai 2.65 rate-limiterem.
- Projekty pogrupowane po kliencie, więc lista 74 pozycji da się przejść.

## Instalacja

Dodatek nie jest w sklepie, więc instaluje się go z pliku.

**Chrome / Edge / Brave**

1. `chrome://extensions`
2. Włącz „Tryb dewelopera" (przełącznik w prawym górnym rogu).
3. „Załaduj rozpakowane" i wskaż ten katalog.

**Firefox** (do testów, znika po restarcie)

1. `about:debugging#/runtime/this-firefox`
2. „Wczytaj tymczasowy dodatek" i wskaż `manifest.json`.

## Konfiguracja

Po instalacji kliknij ikonę dodatku > Ustawienia:

| Pole | Wartość |
|---|---|
| Adres Kimai | `https://kimai.web-systems.pl` |
| Token API | własny, z panelu: Profil > API |
| Język | Polski / Angielski / jak w przeglądarce |
| Minimalna długość opisu | 15 (0 wyłącza sprawdzanie) |

„Sprawdź połączenie" potwierdzi, czy token działa.

Token to nie jest hasło do logowania. Każdy ma swój i może go w każdej chwili
unieważnić w panelu Kimai.

## Jak się tego używa

Ikona pokazuje na plakietce, ile trwa bieżący pomiar. Kliknięcie otwiera okno:

- **gdy nic nie mierzysz** - wybierasz projekt, rodzaj pracy, wpisujesz co robisz,
  klikasz „Rozpocznij". Ostatni projekt i rodzaj pracy są zapamiętywane.
- **gdy pomiar trwa** - widzisz co i od kiedy, klikasz „Zatrzymaj".
- **„Ostatnie wpisy"** - „Wznów" przepisuje projekt, rodzaj pracy i opis do formularza,
  żeby dało się kontynuować bez klikania od nowa.

## O opisach

Opis trafia do raportu, który widzi klient. Zasada jest prosta: ma odpowiadać na
pytanie „co konkretnie zrobiłem", a nie „w czym grzebałem".

| Źle | Dobrze |
|---|---|
| `n8n` | `n8n: workflow synchronizacji zamówień z Subiektem` |
| `poprawki` | `Poprawka walidacji NIP w formularzu rejestracji` |
| `call` | `Call z klientem: ustalenia do integracji płatności` |
| `bug fixing` | `Naprawa błędu 500 przy zapisie koszyka na produktach wariantowych` |
| (pusty) | cokolwiek konkretnego |

Opis z linkiem albo numerem zgłoszenia (`#412`, `PROJ-88`, adres karty Trello)
przechodzi walidację niezależnie od długości - taki wpis i tak da się odtworzyć.

## Struktura

```
manifest.json         deklaracja dodatku (Manifest V3)
background.js         plakietka z czasem trwania bieżącego pomiaru
lib/api.js            klient REST API Kimai
lib/i18n.js           ładowanie tłumaczeń z ręcznym wyborem języka
lib/validate.js       sprawdzanie jakości opisu
popup/                okno dodatku
options/              ustawienia
_locales/pl, /en      teksty
```

## Ograniczenia

- `host_permissions` obejmuje tylko `https://kimai.web-systems.pl`. Dla innej
  instancji trzeba dopisać jej adres w `manifest.json`.
- Instalacja z pliku - Chrome przy każdym starcie pokaże ostrzeżenie o trybie
  dewelopera. Zniknie dopiero po opublikowaniu dodatku w sklepie.
