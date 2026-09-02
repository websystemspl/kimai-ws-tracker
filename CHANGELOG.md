# Changelog

## 1.5.1

English is now the default locale, so the store listing and the browser read English for
anyone whose language is not Polish. The Polish texts stay and are still served to Polish
browsers. The language of the add-on window itself is unaffected: it is picked in the
settings and defaults to the browser.

## 1.5.0

Window widened to 460 px, because longer descriptions were costing too much scrolling.
The project colour dot moved inside the project select, where it no longer sits crooked
against the row below it. Weekly total added next to the daily one in the header, counted
from Monday. The toolbar badge reads `1:22` instead of `1h22`, which Chrome was clipping
at five characters.

Totals are now built from closed entries only, with the running one added by the clock.
Before that they relied on Kimai reporting a running entry with a zero duration.

## 1.4.0

New window layout. 400 px instead of 360, one spacing scale, list descriptions wrapping to
two lines instead of being cut after one (entries pasted from Trello often differ only
halfway through the sentence), day headers sticking while the list scrolls, a dashed border
marking the locked project and activity fields, and messages rendered as coloured strips.
The billable switch on the tracker bar became the `$` mark alone, with the wording kept for
screen readers.

New: a `$` mark on every row of the list flips that entry between billable and not without
opening Kimai. The new state is painted immediately and reverted if Kimai refuses.

## 1.3.0

The recent list shows real entries instead of one row per project and activity pair. It
used to read `/api/timesheets/recent`, which collapses the list that way, so a day spent on
a single project fitted into one row and the rest of the hours looked lost. It now reads
`/api/timesheets` sorted by date, split into days, with a daily total, a duration and a
time range per entry. A link to "My times" in Kimai was added below the list.

## 1.2.1

The add-on no longer breaks on accounts without the `edit_billable_own_timesheet`
permission. Every action used to fail there with a 400, because Kimai rejected the whole
request over the billable flag. The entry is now saved without it and the switch is dimmed
with an explanation. Messages about a 400 also say what Kimai actually rejected, rather
than just "Kimai returned error 400".

## 1.2.0

Notes from the team's first tests: editing the description, start time and end time of a
running entry, resume switching a running timer, the daily total in the header, and a
centred square on the stop button.

## 1.1.0

A billable switch next to the project and activity, a "not billable" label on entries in
the recent list, and resume carrying the billable flag across. Fix: after a timer stops,
the activity list is rebuilt for the selected project, so the next entry can be started
without picking the project again.

## 1.0.0

First release.
