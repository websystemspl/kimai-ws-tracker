import { api, ApiError, getSettings, isConfigured } from '../lib/api.js';
import { applyI18n, initI18n, t } from '../lib/i18n.js';
import { validateDescription } from '../lib/validate.js';

const el = (id) => document.getElementById(id);

let settings;
let running = null;
let clockTimer = null;
// Whether the entry about to start goes on the client's invoice, and whether the
// user said so themselves - an untouched value is left to Kimai to decide.
let billable = true;
let billableTouched = false;

init();

async function init() {
  settings = await getSettings();
  await initI18n(settings.language);
  applyI18n();

  el('settings').addEventListener('click', openOptions);
  el('goSettings').addEventListener('click', openOptions);
  el('toggle').addEventListener('click', onToggle);
  el('project').addEventListener('change', onProjectChange);
  el('activity').addEventListener('change', onActivityChange);
  el('billable').addEventListener('click', onBillableClick);

  const description = el('description');
  description.addEventListener('input', () => {
    showError('');
    autoGrow(description);
  });
  // Enter starts tracking, Shift+Enter adds a line.
  description.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onToggle();
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
}

function showError(message) {
  const box = el('error');
  box.textContent = message;
  box.hidden = !message;
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
  return t('errServer', error.status);
}

function autoGrow(area) {
  area.style.height = 'auto';
  area.style.height = `${Math.min(area.scrollHeight, 92)}px`;
}

function markChosen(select) {
  select.classList.toggle('chosen', Boolean(select.value));
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
  } catch (error) {
    show('tracker');
    showError(describeError(error));
  }
}

function enterRunningState() {
  const description = el('description');
  description.value = running.description || '';
  description.readOnly = true;
  autoGrow(description);

  el('project').value = running.project?.id ?? '';
  el('activity').replaceChildren(new Option(running.activity?.name ?? '', ''));
  el('project').disabled = true;
  el('activity').disabled = true;
  markChosen(el('project'));
  markChosen(el('activity'));

  const dot = el('dot');
  dot.hidden = false;
  dot.style.background = running.project?.color || 'var(--muted)';

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
  const description = el('description');
  description.readOnly = false;
  description.value = '';
  autoGrow(description);
  description.focus();

  el('project').disabled = false;
  el('activity').disabled = false;
  el('dot').hidden = true;
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

// --- billable switch -------------------------------------------------------

function renderBillable() {
  const button = el('billable');
  const label = running
    ? t(billable ? 'billableStateOn' : 'billableStateOff')
    : t(billable ? 'billableOn' : 'billableOff');
  el('billableLabel').textContent = billable ? t('billableChipOn') : t('billableChipOff');
  button.classList.toggle('on', billable);
  button.setAttribute('aria-pressed', String(billable));
  button.setAttribute('aria-label', label);
  button.title = label;
  button.disabled = Boolean(running);
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

function onBillableClick() {
  if (running) {
    return;
  }
  billable = !billable;
  billableTouched = true;
  renderBillable();
}

function startClock(startedAt) {
  const pad = (n) => String(n).padStart(2, '0');
  const tick = () => {
    const s = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    el('clock').textContent = `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
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
    markChosen(activity);
    resetBillable();
  }
}

async function onProjectChange() {
  const select = el('project');
  markChosen(select);

  const chosen = select.selectedOptions[0];
  const dot = el('dot');
  dot.hidden = !select.value;
  dot.style.background = chosen?.dataset.color || 'var(--muted)';

  const activity = el('activity');
  activity.replaceChildren(new Option(t('chooseActivity'), ''));
  markChosen(activity);
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
  markChosen(el('activity'));
  // A switch the user already flipped stays where they put it.
  if (!billableTouched) {
    resetBillable();
  }
}

async function renderRecent() {
  const list = el('recent');
  list.replaceChildren();
  try {
    const entries = await api.recent(settings);
    const usable = entries.filter((entry) => entry.description);
    if (!usable.length) {
      el('recentPanel').hidden = true;
      return;
    }
    usable.forEach((entry) => list.append(recentRow(entry)));
    el('recentPanel').hidden = false;
  } catch {
    el('recentPanel').hidden = true;
  }
}

function recentRow(entry) {
  const row = document.createElement('li');

  const dot = document.createElement('span');
  dot.className = 'dot';
  dot.style.background = entry.project?.color || 'var(--muted)';

  const body = document.createElement('div');
  body.className = 'entry';
  const title = document.createElement('span');
  title.className = 'title truncate';
  title.textContent = entry.description;
  const where = document.createElement('span');
  where.className = 'where truncate';
  if (entry.billable === false) {
    const badge = document.createElement('span');
    badge.className = 'unbilled';
    badge.textContent = t('billableShortOff');
    where.append(badge);
  }
  where.append([entry.project?.name, entry.activity?.name].filter(Boolean).join(' - '));
  body.append(title, where);

  const play = document.createElement('button');
  play.type = 'button';
  play.className = 'play';
  play.title = t('resume');
  play.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">' +
    '<path fill="currentColor" d="M8 5v14l11-7z"/></svg>';
  play.addEventListener('click', () => resume(entry));

  row.append(dot, body, play);
  return row;
}

async function resume(entry) {
  if (running) {
    return;
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
      markChosen(activity);
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

  el('toggle').disabled = true;
  try {
    await api.start(settings, {
      project: Number(project),
      activity: Number(activity),
      description,
      billable: billableTouched ? billable : undefined,
    });
    await chrome.storage.local.set({ lastProject: project, lastActivity: activity });
    chrome.runtime.sendMessage({ type: 'refresh' });
    await render();
  } catch (error) {
    showError(describeError(error));
    el('toggle').disabled = false;
  }
}

async function stopTracking() {
  showError('');
  el('toggle').disabled = true;
  try {
    await api.stop(settings, running.id);
    stopClock();
    chrome.runtime.sendMessage({ type: 'refresh' });
    await render();
  } catch (error) {
    showError(describeError(error));
    el('toggle').disabled = false;
  }
}
