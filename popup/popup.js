import { api, ApiError, getSettings, isConfigured } from '../lib/api.js';
import { applyI18n, initI18n, t } from '../lib/i18n.js';
import { validateDescription } from '../lib/validate.js';

const el = (id) => document.getElementById(id);

let settings;
let running = null;
let clockTimer = null;

init();

async function init() {
  settings = await getSettings();
  await initI18n(settings.language);
  applyI18n();

  el('settings').addEventListener('click', openOptions);
  el('goSettings').addEventListener('click', openOptions);
  el('toggle').addEventListener('click', onToggle);
  el('project').addEventListener('change', onProjectChange);
  el('activity').addEventListener('change', () => markChosen(el('activity')));

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
    running ? enterRunningState() : enterIdleState();
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

  el('clock').hidden = false;
  startClock(new Date(running.begin).getTime());
}

function enterIdleState() {
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

  const toggle = el('toggle');
  toggle.classList.replace('stop', 'start');
  toggle.disabled = false;
  toggle.setAttribute('aria-label', t('start'));
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
  const projects = await api.projects(settings);

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
        group.append(option);
      });
    select.append(group);
  });

  if (running) {
    return;
  }
  const last = await chrome.storage.local.get({ lastProject: '', lastActivity: '' });
  if (last.lastProject && select.querySelector(`option[value="${last.lastProject}"]`)) {
    select.value = last.lastProject;
  }
  await onProjectChange();
  const activity = el('activity');
  if (last.lastActivity && activity.querySelector(`option[value="${last.lastActivity}"]`)) {
    activity.value = last.lastActivity;
    markChosen(activity);
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
      .forEach((item) => activity.append(new Option(item.name, item.id)));
  } catch (error) {
    showError(describeError(error));
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
  where.textContent = [entry.project?.name, entry.activity?.name].filter(Boolean).join(' - ');
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
