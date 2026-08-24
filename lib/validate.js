/**
 * Description quality check.
 *
 * Kimai itself always treats the description as optional, and 22% of the history
 * imported from Toggl is empty or says nothing ("poprawki", "call", "n8n").
 * Clients read these reports, so the add-on refuses to start a timer on one.
 */

const GENERIC = new Set([
  // Polish
  'poprawki', 'poprawka', 'poprawianie', 'praca', 'prace', 'prace biurowe', 'robota',
  'zmiany', 'zmiana', 'testy', 'test', 'analiza', 'spotkanie', 'narada', 'narady',
  'rozmowa', 'rozmowy', 'konfiguracja', 'aktualizacja', 'sprawdzenie', 'sprawdzanie',
  'przeglad', 'przegladanie', 'dokonczenie', 'kontynuacja', 'papiery', 'inne', 'rozne',
  'zadania', 'zadanie', 'pomoc', 'administracja', 'organizacja', 'planowanie',
  'programowanie', 'kodowanie', 'wdrozenie', 'przerwa', 'maile', 'mail', 'poczta',
  // English
  'work', 'working', 'fix', 'fixes', 'fixing', 'bug', 'bugs', 'bugfix', 'bug fixing',
  'debug', 'debugging', 'meeting', 'call', 'daily', 'standup', 'daily standup',
  'setup', 'update', 'updates', 'testing', 'research', 'review', 'code review',
  'deploy', 'deployment', 'refactor', 'refactoring', 'development', 'dev', 'misc',
  'other', 'todo', 'task', 'tasks', 'support', 'admin', 'demo', 'changes', 'stuff',
  'break', 'lunch', 'dinner break', 'discussion', 'migration', 'maintenance',
]);

/** Strip diacritics and punctuation so "Poprawki." and "poprawki" compare equal. */
function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s.,;:!-]+|[\s.,;:!-]+$/g, '');
}

/**
 * A description carrying a link or an issue reference is specific enough on its
 * own, however short it looks.
 */
function hasReference(text) {
  return /https?:\/\/|#\d+|\b[A-Z]{2,}-\d+\b/.test(text);
}

/**
 * @returns {{ok: true} | {ok: false, reason: 'short'|'generic', word?: string}}
 */
export function validateDescription(raw, minLength) {
  const text = (raw || '').trim();

  if (minLength <= 0) {
    return { ok: true };
  }
  if (hasReference(text) && text.length >= 3) {
    return { ok: true };
  }

  const normalized = normalize(text);
  if (GENERIC.has(normalized)) {
    return { ok: false, reason: 'generic', word: text };
  }
  if (text.length < minLength) {
    return { ok: false, reason: 'short' };
  }
  return { ok: true };
}
