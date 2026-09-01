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
- **Przełącznik „płatne dla klienta"** przy projekcie i rodzaju pracy, jak w Toggl.
- Trwający wpis da się poprawić bez wchodzenia do panelu: opis, godzina rozpoczęcia,
  godzina zakończenia i płatność.
- Suma czasu z dzisiaj w nagłówku okna.

## Instalacja

Najprościej z [Chrome Web Store](https://chromewebstore.google.com/detail/kimai-pomiar-czasu-web-sy/eliiemekophpilppaobljfjkhbkmchjg) - to działa też w Edge i Brave.
W Firefoksie dodatku nie ma w sklepie, tam instaluje się go z pliku, tak samo jak
wersję prosto z repozytorium.

**Chrome / Edge / Brave**

1. **Rozpakuj ZIP** gdzieś na stałe. Chrome nie wczytuje archiwów - wskazanie pliku
   `.zip` kończy się błędem „Brak pliku manifestu lub nie można go odczytać".
2. `chrome://extensions`
3. Włącz „Tryb dewelopera" (przełącznik w prawym górnym rogu).
4. „Załaduj rozpakowane" i wskaż **rozpakowany katalog**. Wejdź do jego środka i dopiero
   tam kliknij „Otwórz" - `manifest.json` musi leżeć bezpośrednio w wybranym katalogu.

Rozpakowanego katalogu nie kasuj, Chrome wczytuje z niego pliki przy każdym starcie.

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
- **gdy pomiar trwa** - widzisz co i od kiedy, klikasz „Zatrzymaj". Opis, godzinę
  rozpoczęcia i płatność można poprawić w locie, patrz niżej.
- **„Ostatnie wpisy"** - dwadzieścia ostatnich wpisów, z podziałem na dni („Dziś",
  „Wczoraj", data) i sumą godzin przy każdym dniu, a przy wpisie czas trwania
  i zakres godzin. „Wznów" przepisuje projekt, rodzaj pracy, opis i znacznik
  płatności do formularza, żeby dało się kontynuować bez klikania od nowa. Jeśli akurat
  coś jest mierzone, „Wznów" zatrzymuje bieżący wpis i przełącza pomiar na wybrany.
  Pod listą jest link „Wszystkie moje wpisy w Kimai", otwierający „Moje czasy" w panelu.
- **W nagłówku** jest suma czasu z dzisiaj, razem z trwającym pomiarem.

## Poprawianie trwającego wpisu

Nie trzeba po to wchodzić do panelu Kimai.

| Co | Jak |
|---|---|
| Opis | pisz w polu opisu; zapisuje się chwilę po przerwaniu pisania, przy wyjściu z pola i pod Enterem |
| Godzina rozpoczęcia | pole „od" pod projektem; przyszłej godziny nie przyjmie |
| Godzina zakończenia | pole „do"; puste = „Zatrzymaj" kończy teraz, wpisana godzina kończy wpis o tej godzinie |
| Płatne / niepłatne | ten sam przełącznik co przy starcie |

Projekt i rodzaj pracy zostają zablokowane - ich zmiana to już inny wpis, nie poprawka.

## Płatne dla klienta

Obok wyboru projektu i rodzaju pracy jest przełącznik ze znakiem waluty - to samo,
co pole „Płatne" w Kimai i przycisk „$" w Toggl.

- **zielony** - godziny idą klientowi na fakturę,
- **szary, przekreślony** - czas wewnętrzny, nie do rozliczenia.

Domyślnie ustawia się tak, jak wynika z Kimai: klient, projekt i rodzaj pracy mają
własny znacznik „Płatne", a wyłączenie któregokolwiek z nich robi wpis niepłatnym.
Przełącznik zmienia to dla jednego wpisu i wraca do domyślnego po zmianie projektu.
Nietkniętego dodatek nie wysyła w ogóle - wtedy decyduje sama instancja Kimai.

Podczas trwającego pomiaru przełącznik działa tak samo - kliknięcie od razu poprawia
wpis. Wpisy niepłatne mają na liście ostatnich szarą etykietę „niepłatne".

### Uprawnienie po stronie Kimai

Pole „Płatne" nie jest w Kimai dostępne dla każdego. Daje je uprawnienie
`edit_billable_own_timesheet`, które domyślnie ma dopiero rola teamlead i wyżej -
zwykły `ROLE_USER` nie ma go ani w panelu, ani w API. Formularz wpisu w API nie zna
wtedy pola `billable`, a **całe żądanie** kończy się błędem 400
„This form should not contain extra fields.", więc bez obsługi tego przypadku
nie dało się nawet wystartować pomiaru.

Dodatek radzi sobie z tym sam: gdy Kimai odrzuci znacznik płatności, wysyła wpis
jeszcze raz bez niego (pomiar rusza, płatność ustala Kimai z klienta, projektu
i rodzaju pracy), a przełącznik wyszarza z wyjaśnieniem. Blokada trzyma się do
następnego zapisu ustawień - to moment, w którym warto sprawdzić jeszcze raz.

Żeby przełącznik działał, administrator Kimai włącza `edit_billable_own_timesheet`
dla roli `ROLE_USER`: Administracja > Role, kolumna `ROLE_USER`, sekcja
„Timesheet (own)".

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

## Uprawnienia

Dodatek nie ma z góry wpisanego adresu żadnego serwera. Przy zapisie ustawień
prosi o dostęp do tego adresu, który podałeś - i tylko do niego. Zgody udzielasz
w okienku Chrome, można ją cofnąć w `chrome://extensions`.

Poza tym używa `storage` (ustawienia i ostatni wybór) oraz `alarms` (odświeżanie
plakietki z czasem). Żadnych innych uprawnień, żadnej telemetrii.

## Historia zmian

- **1.3.0** - lista ostatnich wpisów pokazuje rzeczywiste wpisy, a nie po jednym na
  parę projekt + rodzaj pracy. Wcześniej brał je endpoint `/api/timesheets/recent`,
  który zwija listę do jednego wiersza na taką parę, więc dzień przepracowany na
  jednym projekcie mieścił się w jednej pozycji i reszta godzin wyglądała na zgubioną.
  Teraz idzie zwykłe `/api/timesheets` z sortowaniem po dacie, z podziałem na dni,
  sumą dnia, czasem trwania i zakresem godzin przy wpisie. Pod listą doszedł link
  do „Moich czasów" w panelu Kimai.

- **1.2.1** - dodatek przestaje się wykładać na kontach bez uprawnienia
  `edit_billable_own_timesheet`. Wcześniej każda akcja w oknie dodatku kończyła się
  u nich błędem 400, bo Kimai odrzucał całe żądanie ze znacznikiem płatności.
  Teraz wpis zapisuje się bez niego, a przełącznik jest wyszarzony z wyjaśnieniem.
  Komunikaty o błędzie 400 pokazują też, co konkretnie Kimai odrzucił, zamiast
  samego „Kimai zwrócił błąd: 400".

- **1.2.0** - uwagi zespołu z pierwszych testów: edycja opisu, godziny rozpoczęcia
  i zakończenia trwającego wpisu, „Wznów" przełącza trwający pomiar, suma czasu z dzisiaj
  w nagłówku, wycentrowany kwadrat na przycisku „Zatrzymaj".

- **1.1.0** - przełącznik „płatne dla klienta" przy pomiarze, etykieta wpisów
  niepłatnych na liście ostatnich, „Wznów" przenosi też znacznik płatności.
  Poprawka: po zatrzymaniu pomiaru lista rodzajów pracy odbudowuje się dla wybranego
  projektu, więc następny wpis da się wystartować bez klikania projektu od nowa.
- **1.0.0** - pierwsze wydanie.

## Ograniczenia

- Instalacja z pliku - Chrome przy każdym starcie pokazuje ostrzeżenie o trybie
  dewelopera. Znika po zainstalowaniu wersji ze sklepu.
- Firefox wczytany przez `about:debugging` znika po restarcie przeglądarki.
