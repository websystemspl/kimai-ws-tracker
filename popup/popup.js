import {
  api,
  ApiError,
  getSettings,
  isBillableRejected,
  isConfigured,
  localStamp,
} from '../lib/api.js';
import { applyI18n, initI18n, t } from '../lib/i18n.js';
import { validateDescription } from '../lib/validate.js';

const el = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');

let settings;
let running = null;
let clockTimer = null;
// Whether the entry about to start goes on the client's invoice, and whether the
// user said so themselves - an untouched value is left to Kimai to decide.
let billable = true;
let billableTouched = false;
// Kimai hands the billable field only to accounts allowed to edit it. Once it has
// turned a request down, the switch is locked and the entry is left to Kimai.
let billableAllowed = true;
// Seconds already booked by finished entries; the running one is added live.
let todaySeconds = 0;
let weekSeconds = 0;
let savedTimer = null;
let descriptionTimer = null;
// Locale segment of the Kimai URL, needed for the "all my entries" link.
let kimaiLocale = 'en';

/** How many past entries the popup lists before pointing at Kimai for the rest. */
const RECENT_SIZE = 20;

init();

async function init() {
  settings = await getSettings();
  ({ billableAllowed } = await chrome.storage.local.get({ billableAllowed: true }));
  ({ kimaiLocale } = await chrome.storage.local.get({ kimaiLocale: 'en' }));
  await initI18n(settings.language);
  applyI18n();

  el('settings').addEventListener('click', openOptions);
  el('goSettings').addEventListener('click', openOptions);
  el('toggle').addEventListener('click', onToggle);
  el('project').addEventListener('change', onProjectChange);
  el('activity').addEventListener('change', onActivityChange);
  el('billable').addEventListener('click', onBillableClick);

  el('beginTime').addEventListener('change', onBeginChange);

  const description = el('description');
  description.addEventListener('input', () => {
    showError('');
    autoGrow(description);
    // Closing the popup does not always deliver a blur event, so a running entry
    // also saves shortly after typing stops.
    if (running) {
      clearTimeout(descriptionTimer);
      descriptionTimer = setTimeout(() => saveDescription({ quiet: true }), 1200);
    }
  });
  description.addEventListener('blur', () => saveDescription());
  // Enter starts tracking, or saves the edited description of a running entry.
  // Shift+Enter adds a line.
  description.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      running ? description.blur() : onToggle();
    }
  });

  if (!isConfigured(settings)) {
    return show('unconfigured');
  }
  await render();
}

function openOptions() {
  chrome.runtime.openOptionsPage();
}

function show(...panels) {
  ['unconfigured', 'tracker', 'recentPanel'].forEach((id) => {
    el(id).hidden = !panels.includes(id);
  });
  // The message strips sit outside the panels, so they have to be cleared by hand
  // when the tracker goes away - otherwise an old error hangs over an empty window.
  if (!panels.includes('tracker')) {
    showError('');
    el('saved').hidden = true;
  }
}

function showError(message) {
  const box = el('error');
  box.textContent = message;
  box.hidden = !message;
}

/** Short confirmation that an edit of the running entry reached Kimai. */
function flash(message) {
  const box = el('saved');
  box.textContent = message;
  box.hidden = false;
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => { box.hidden = true; }, 2000);
}

function describeError(error) {
  if (!(error instanceof ApiError)) {
    return error.message;
  }
  if (error.status === 0) {
    return t('errConnection');
  }
  if (error.status === 401 || error.status === 403) {
    return t('errAuth');
  }
  if (error.status === 400 && error.message) {
    return t('errRejected', error.message);
  }
  return t('errServer', error.status);
}

function autoGrow(area) {
  area.style.height = 'auto';
  area.style.height = `${Math.min(area.scrollHeight, 96)}px`;
}

/** The dollar sign of the billable switches, with the slash of the "off" state. */
function moneyIcon(size) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor"`
    + ' stroke-width="2" stroke-linecap="round" aria-hidden="true">'
    + '<path d="M12 2v20"></path>'
    + '<path d="M17 6.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 3 5 3.5 5 1.6 5 3.5-2.2 3-5 3-5-1.1-5-3"></path>'
    + '<path class="slash" d="M3 21 21 3"></path></svg>';
}

// --- rendering --------------------------------------------------------------

async function render() {
  showError('');
  try {
    const active = await api.active(settings);
    running = active[0] || null;
    show('tracker', 'recentPanel');
    await fillPickers();
    running ? enterRunningState() : await enterIdleState();
    await renderRecent();
    await renderTotals();
  } catch (error) {
    show('tracker');
    showError(describeError(error));
  }
}

function enterRunningState() {
  const description = el('description');
  description.value = running.description || '';
  autoGrow(description);
  fillTimes();

  el('project').value = running.project?.id ?? '';
  el('activity').replaceChildren(new Option(running.activity?.name ?? '', ''));
  el('project').disabled = true;
  el('activity').disabled = true;

  paintProjectDot(running.project?.color);

  const toggle = el('toggle');
  toggle.classList.replace('start', 'stop');
  toggle.disabled = false;
  toggle.setAttribute('aria-label', t('stop'));

  billable = running.billable !== false;
  billableTouched = false;
  renderBillable();

  el('clock').hidden = false;
  startClock(new Date(running.begin).getTime());
}

async function enterIdleState() {
  stopClock();
  el('times').hidden = true;
  el('endTime').value = '';
  const description = el('description');
  description.value = '';
  autoGrow(description);
  description.focus();

  el('project').disabled = false;
  el('activity').disabled = false;
  paintProjectDot();
  el('clock').hidden = true;

  // While an entry runs, the activity picker only holds the label of that entry.
  // Rebuild the real list for the project still selected, otherwise starting the
  // next entry fails on "pick a type of work" with nothing to pick.
  if (!el('activity').querySelector('option[value]:not([value=""])')) {
    await onProjectChange();
    await restoreLastActivity();
  }

  const toggle = el('toggle');
  toggle.classList.replace('stop', 'start');
  toggle.disabled = false;
  toggle.setAttribute('aria-label', t('start'));

  // Coming back from a stopped entry, fall back to what the project implies.
  if (!billableTouched) {
    billable = billableDefault();
  }
  renderBillable();
}

// --- times and daily total -------------------------------------------------

function fillTimes() {
  const begin = new Date(running.begin);
  el('beginTime').value = `${pad(begin.getHours())}:${pad(begin.getMinutes())}`;
  el('endTime').value = '';
  el('times').hidden = false;
}

/** The same day as `day`, at the "HH:MM" wall clock of `value`. */
function withTime(day, value) {
  const [hours, minutes] = value.split(':').map(Number);
  const result = new Date(day);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

async function onBeginChange() {
  if (!running || !el('beginTime').value) {
    return;
  }
  showError('');
  const begin = withTime(new Date(running.begin), el('beginTime').value);
  if (begin.getTime() > Date.now()) {
    fillTimes();
    return showError(t('errBeginFuture'));
  }
  try {
    const updated = await api.update(settings, running.id, { begin: localStamp(begin) });
    running.begin = updated.begin;
    stopClock();
    startClock(new Date(running.begin).getTime());
    flash(t('savedTime'));
  } catch (error) {
    fillTimes();
    showError(describeError(error));
  }
}

async function renderTotals() {
  try {
    // One window covers both totals: the week contains today, so asking twice
    // would only be a second round trip for numbers already in hand.
    const entries = await api.range(settings, startOfWeek(), endOfToday());
    const today = new Date().toDateString();
    // Only closed entries are counted here; the running one is added live by the
    // clock. Dropping it by hand rather than trusting it to arrive with duration 0
    // keeps the total right whatever Kimai reports for an entry still going.
    const finished = entries.filter((entry) => entry.end);
    const seconds = (list) => list.reduce((sum, entry) => sum + (entry.duration || 0), 0);
    weekSeconds = seconds(finished);
    todaySeconds = seconds(
      finished.filter((entry) => new Date(entry.begin).toDateString() === today),
    );
    paintTotals();
  } catch {
    el('today').hidden = true;
    el('week').hidden = true;
  }
}

/** Monday 00:00 of the current week. */
function startOfWeek() {
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  // getDay() calls Sunday 0, and Sunday closes the week that began six days back.
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

function endOfToday() {
  const midnight = new Date();
  midnight.setHours(23, 59, 59, 0);
  return midnight;
}

/**
 * The dot sits inside the project select rather than in a column beside it, so
 * it is always on screen - grey while nothing is picked, the project colour once
 * something is.
 */
function paintProjectDot(color) {
  el('dot').style.background = color || 'var(--line)';
}

function paintTotals() {
  const live = running
    ? Math.max(0, Math.floor((Date.now() - new Date(running.begin).getTime()) / 1000))
    : 0;
  el('today').textContent = t('todayTotal', shortDuration(todaySeconds + live));
  el('today').hidden = false;
  el('week').textContent = t('weekTotal', shortDuration(weekSeconds + live));
  el('week').hidden = false;
}

// --- billable switch -------------------------------------------------------

function renderBillable() {
  const button = el('billable');
  const state = billable ? t('billableOn') : t('billableOff');
  const label = billableAllowed ? state : t('billableLocked');
  // The switch is an icon only, so the state has to reach a screen reader some
  // other way - hence the visually hidden word next to it.
  el('billableLabel').textContent = billable ? t('billableChipOn') : t('billableChipOff');
  button.classList.toggle('off', !billable);
  button.disabled = !billableAllowed;
  button.setAttribute('aria-pressed', String(billable));
  button.setAttribute('aria-label', label);
  button.title = label;
}

/**
 * Remembered across popup sessions, because the permission will not appear on its
 * own; saving the settings clears it, which is the moment to look again.
 */
async function lockBillable() {
  billableAllowed = false;
  await chrome.storage.local.set({ billableAllowed: false });
  renderBillable();
  lockRecentBillables();
}

/** Mirrors Kimai: billable unless the customer, project or activity says otherwise. */
function billableDefault() {
  const flagOf = (id) => el(id).selectedOptions[0]?.dataset.billable;
  return flagOf('project') !== 'false' && flagOf('activity') !== 'false';
}

function resetBillable() {
  billable = billableDefault();
  billableTouched = false;
  renderBillable();
}

async function onBillableClick() {
  billable = !billable;
  renderBillable();

  if (!running) {
    billableTouched = true;
    return;
  }
  // A running entry is corrected straight away, the same as its description.
  try {
    await api.update(settings, running.id, { billable });
    running.billable = billable;
    flash(t('savedBillable'));
  } catch (error) {
    billable = !billable;
    if (isBillableRejected(error)) {
      await lockBillable();
      return showError(t('errBillableDenied'));
    }
    renderBillable();
    showError(describeError(error));
  }
}

/** @param {{quiet?: boolean}} options - a save while typing stays silent. */
async function saveDescription({ quiet = false } = {}) {
  clearTimeout(descriptionTimer);
  if (!running) {
    return;
  }
  const text = el('description').value.trim();
  if (text === (running.description || '')) {
    return;
  }
  const check = validateDescription(text, Number(settings.minDescription));
  if (!check.ok) {
    if (quiet) {
      return;
    }
    return showError(check.reason === 'generic'
      ? t('errDescGeneric', check.word)
      : t('errDescShort', settings.minDescription));
  }
  try {
    await api.update(settings, running.id, { description: text });
    running.description = text;
    showError('');
    flash(t('savedDescription'));
  } catch (error) {
    showError(describeError(error));
  }
}

function startClock(startedAt) {
  const tick = () => {
    const s = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    el('clock').textContent = `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
    paintTotals();
  };
  tick();
  clockTimer = setInterval(tick, 1000);
}

function stopClock() {
  clearInterval(clockTimer);
  clockTimer = null;
}

async function fillPickers() {
  const select = el('project');
  if (select.options.length > 1) {
    return; // already built for this popup session
  }
  // Customers are fetched alongside because a non-billable customer makes every
  // project underneath it non-billable, and the project list only carries an id.
  const [projects, customers] = await Promise.all([
    api.projects(settings),
    api.customers(settings).catch(() => []),
  ]);
  const unbilledCustomers = new Set(
    customers.filter((customer) => !customer.billable).map((customer) => customer.id),
  );

  // Group by customer, otherwise a 74-entry flat list is unusable.
  const byCustomer = new Map();
  projects.forEach((project) => {
    const customer = project.parentTitle || '-';
    if (!byCustomer.has(customer)) {
      byCustomer.set(customer, []);
    }
    byCustomer.get(customer).push(project);
  });

  select.replaceChildren(new Option(t('chooseProject'), ''));
  [...byCustomer.keys()].sort((a, b) => a.localeCompare(b)).forEach((customer) => {
    const group = document.createElement('optgroup');
    group.label = customer;
    byCustomer.get(customer)
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((project) => {
        const option = new Option(project.name, project.id);
        option.dataset.color = project.color || '';
        option.dataset.billable = String(
          project.billable !== false && !unbilledCustomers.has(project.customer),
        );
        group.append(option);
      });
    select.append(group);
  });

  if (running) {
    return;
  }
  const last = await chrome.storage.local.get({ lastProject: '' });
  if (last.lastProject && select.querySelector(`option[value="${last.lastProject}"]`)) {
    select.value = last.lastProject;
  }
  await onProjectChange();
  await restoreLastActivity();
}

async function restoreLastActivity() {
  const { lastActivity } = await chrome.storage.local.get({ lastActivity: '' });
  const activity = el('activity');
  if (lastActivity && activity.querySelector(`option[value="${lastActivity}"]`)) {
    activity.value = lastActivity;
    resetBillable();
  }
}

async function onProjectChange() {
  const select = el('project');
  const chosen = select.selectedOptions[0];
  paintProjectDot(chosen?.dataset.color);

  const activity = el('activity');
  activity.replaceChildren(new Option(t('chooseActivity'), ''));
  try {
    const activities = await api.activities(settings, select.value || null);
    activities
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((item) => {
        const option = new Option(item.name, item.id);
        option.dataset.billable = String(item.billable !== false);
        activity.append(option);
      });
  } catch (error) {
    showError(describeError(error));
  }
  resetBillable();
}

function onActivityChange() {
  // A switch the user already flipped stays where they put it.
  if (!billableTouched) {
    resetBillable();
  }
}

async function renderRecent() {
  const list = el('recent');
  list.replaceChildren();
  el('recentPanel').hidden = false;
  try {
    const entries = await api.latest(settings, RECENT_SIZE);
    rememberKimaiLocale(entries);
    // The running entry already owns the tracker bar above.
    const usable = entries.filter((entry) => entry.end);
    groupByDay(usable).forEach(([, ofDay]) => {
      list.append(dayHeader(ofDay));
      ofDay.forEach((entry) => list.append(recentRow(entry)));
    });
    el('recentEmpty').hidden = usable.length > 0;
  } catch {
    list.replaceChildren();
    el('recentEmpty').hidden = false;
  }
  paintAllEntriesLink();
}

/** Local calendar day of an entry, as a comparable key. */
function dayKey(stamp) {
  const date = new Date(stamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** [[key, entries], ...] in the order the entries arrived, newest day first. */
function groupByDay(entries) {
  const days = new Map();
  entries.forEach((entry) => {
    const key = dayKey(entry.begin);
    if (!days.has(key)) {
      days.set(key, []);
    }
    days.get(key).push(entry);
  });
  return [...days.entries()];
}

function dayHeader(ofDay) {
  const row = document.createElement('div');
  row.className = 'day';

  const name = document.createElement('span');
  name.textContent = dayName(ofDay[0].begin);

  const total = document.createElement('span');
  total.className = 'sum';
  total.textContent = shortDuration(
    ofDay.reduce((sum, entry) => sum + (entry.duration || 0), 0),
  );

  row.append(name, total);
  return row;
}

function dayName(stamp) {
  const day = new Date(stamp);
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const daysBack = Math.round((midnight - new Date(day).setHours(0, 0, 0, 0)) / 86400000);
  if (daysBack === 0) {
    return t('dayToday');
  }
  if (daysBack === 1) {
    return t('dayYesterday');
  }
  return day.toLocaleDateString(document.documentElement.lang || undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** "1:09" - the same h:mm the header and the clock use. */
function shortDuration(seconds) {
  const total = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(total / 3600)}:${pad(Math.floor(total / 60) % 60)}`;
}

function clockOf(stamp) {
  const date = new Date(stamp);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function recentRow(entry) {
  const row = document.createElement('div');
  row.className = 'entry';

  const dot = document.createElement('span');
  dot.className = 'dot';
  dot.style.background = entry.project?.color || 'var(--muted)';

  const body = document.createElement('div');
  const desc = document.createElement('div');
  desc.className = 'desc';
  // Descriptions copied out of Trello or Slack carry line breaks. The clamp to
  // two lines is done in CSS, so the text itself only loses its own newlines.
  const text = (entry.description || '').replace(/\s+/g, ' ').trim();
  desc.textContent = text || t('noDescription');
  desc.classList.toggle('empty', !text);
  desc.title = entry.description || '';

  const meta = document.createElement('div');
  meta.className = 'meta';
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = [entry.project?.name, entry.activity?.name].filter(Boolean).join(' - ');
  meta.append(name);
  body.append(desc, meta);

  const when = document.createElement('div');
  when.className = 'num';
  const length = document.createElement('span');
  length.className = 'dur';
  length.textContent = shortDuration(entry.duration);
  const span = document.createElement('span');
  span.className = 'span';
  span.textContent = `${clockOf(entry.begin)}-${clockOf(entry.end)}`;
  when.append(length, span);

  const play = document.createElement('button');
  play.type = 'button';
  play.className = 'resume';
  play.title = t('resume');
  play.setAttribute('aria-label', t('resume'));
  play.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"'
    + ' aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>';
  play.addEventListener('click', () => resume(entry));

  row.append(dot, body, when, billableButton(entry), play);
  return row;
}

/**
 * Per-entry billable switch.
 *
 * Correcting how an entry was billed used to mean opening Kimai, so it is the one
 * edit the list offers. The click paints the new state immediately and reverts it
 * if Kimai says no - a round trip of a few hundred milliseconds is long enough for
 * a second click to land on a button that still shows the old state.
 */
function billableButton(entry) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'bill-mini';
  button.innerHTML = moneyIcon(13);
  button.disabled = !billableAllowed;
  paintBillableButton(button, entry.billable !== false);

  button.addEventListener('click', async () => {
    if (button.classList.contains('pending') || button.disabled) {
      return;
    }
    const wanted = entry.billable === false;
    button.classList.add('pending');
    paintBillableButton(button, wanted);
    showError('');
    try {
      await api.update(settings, entry.id, { billable: wanted });
      entry.billable = wanted;
      flash(t('savedBillable'));
    } catch (error) {
      paintBillableButton(button, !wanted);
      if (isBillableRejected(error)) {
        await lockBillable();
        return showError(t('errBillableDenied'));
      }
      showError(describeError(error));
    } finally {
      button.classList.remove('pending');
    }
  });

  return button;
}

function paintBillableButton(button, on) {
  const label = billableAllowed
    ? (on ? t('billableRowOn') : t('billableRowOff'))
    : t('billableLocked');
  button.classList.toggle('off', !on);
  button.setAttribute('aria-pressed', String(on));
  button.setAttribute('aria-label', label);
  button.title = label;
}

/** Kimai turned the flag down once, so the whole list stops offering it. */
function lockRecentBillables() {
  el('recent').querySelectorAll('.bill-mini').forEach((button) => {
    button.disabled = true;
    button.title = t('billableLocked');
    button.setAttribute('aria-label', t('billableLocked'));
  });
}

/**
 * Kimai has no locale-free route: /timesheet/ is a 404, only /{locale}/timesheet/
 * answers. The language of the account comes with the entries, so it is picked up
 * from there and kept for the next time the popup opens on an empty list.
 */
function rememberKimaiLocale(entries) {
  const language = entries.find((entry) => entry.user?.language)?.user.language;
  if (language && language !== kimaiLocale) {
    kimaiLocale = language;
    chrome.storage.local.set({ kimaiLocale: language });
  }
}

function paintAllEntriesLink() {
  const link = el('allEntries');
  link.href = `${settings.url}/${kimaiLocale}/timesheet/`;
  link.hidden = !settings.url;
}

async function resume(entry) {
  // Clicking resume while something runs switches the timer over: the current
  // entry is closed and the copied one starts in its place.
  if (running) {
    try {
      await api.stop(settings, running.id);
    } catch (error) {
      return showError(describeError(error));
    }
    running = null;
    await enterIdleState();
    await renderTotals();
  }

  el('description').value = entry.description || '';
  autoGrow(el('description'));

  const project = el('project');
  if (entry.project?.id && project.querySelector(`option[value="${entry.project.id}"]`)) {
    project.value = String(entry.project.id);
    await onProjectChange();
    const activity = el('activity');
    // A hidden activity (the Toggl import bucket) is absent here on purpose.
    if (entry.activity?.id && activity.querySelector(`option[value="${entry.activity.id}"]`)) {
      activity.value = String(entry.activity.id);
    }
  }

  // Repeating an entry repeats how it was billed, not the project default.
  billable = entry.billable !== false;
  billableTouched = true;
  renderBillable();

  await onToggle();
}

// --- actions ----------------------------------------------------------------

async function onToggle() {
  return running ? stopTracking() : startTracking();
}

async function startTracking() {
  showError('');
  const project = el('project').value;
  const activity = el('activity').value;
  const description = el('description').value.trim();

  if (!project) {
    return showError(t('errNoProject'));
  }
  if (!activity) {
    return showError(t('errNoActivity'));
  }

  const check = validateDescription(description, Number(settings.minDescription));
  if (!check.ok) {
    el('description').focus();
    return showError(check.reason === 'generic'
      ? t('errDescGeneric', check.word)
      : t('errDescShort', settings.minDescription));
  }

  const wanted = billableTouched && billableAllowed ? billable : undefined;

  el('toggle').disabled = true;
  let denied = false;
  try {
    const entry = { project: Number(project), activity: Number(activity), description };
    try {
      await api.start(settings, { ...entry, billable: wanted });
    } catch (error) {
      if (wanted === undefined || !isBillableRejected(error)) {
        throw error;
      }
      // The choice cannot be honoured, but the entry itself must not be lost:
      // start it again and let Kimai decide how it is billed.
      await lockBillable();
      await api.start(settings, entry);
      denied = true;
    }
    await chrome.storage.local.set({ lastProject: project, lastActivity: activity });
    chrome.runtime.sendMessage({ type: 'refresh' });
    await render();
    if (denied) {
      showError(t('errBillableDenied'));
    }
  } catch (error) {
    showError(describeError(error));
    el('toggle').disabled = false;
  }
}

async function stopTracking() {
  showError('');

  // An end time typed into the "to" field closes the entry there instead of now.
  const wanted = el('endTime').value;
  let endStamp = null;
  if (wanted) {
    const end = withTime(new Date(running.begin), wanted);
    if (end.getTime() <= new Date(running.begin).getTime()) {
      return showError(t('errEndBeforeBegin'));
    }
    endStamp = localStamp(end);
  }

  el('toggle').disabled = true;
  try {
    if (endStamp) {
      await api.update(settings, running.id, { end: endStamp });
    } else {
      await api.stop(settings, running.id);
    }
    stopClock();
    chrome.runtime.sendMessage({ type: 'refresh' });
    await render();
  } catch (error) {
    showError(describeError(error));
    el('toggle').disabled = false;
  }
}
