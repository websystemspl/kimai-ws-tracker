import { api, ApiError, getSettings, hasHostAccess, requestHostAccess } from '../lib/api.js';
import { applyI18n, initI18n, t } from '../lib/i18n.js';

const el = (id) => document.getElementById(id);

let settings;

init();

async function init() {
  settings = await getSettings();
  await initI18n(settings.language);
  applyI18n();

  el('url').value = settings.url;
  el('token').value = settings.token;
  el('language').value = settings.language;
  el('minDescription').value = settings.minDescription;

  el('save').addEventListener('click', save);
  el('test').addEventListener('click', test);
}

function readForm() {
  return {
    url: el('url').value.trim().replace(/\/+$/, ''),
    token: el('token').value.trim(),
    language: el('language').value,
    minDescription: Math.max(0, Number(el('minDescription').value) || 0),
  };
}

function status(message, bad = false) {
  const box = el('status');
  box.textContent = message;
  box.classList.toggle('bad', bad);
  box.hidden = false;
}

async function save() {
  const form = readForm();
  if (form.url && !(await hasHostAccess(form.url))) {
    const granted = await requestHostAccess(form.url);
    if (!granted) {
      return status(t('errNoPermission'), true);
    }
  }
  settings = form;
  await chrome.storage.sync.set(settings);
  status(t('optSaved'));
  await initI18n(settings.language);
  applyI18n();
}

async function test() {
  const form = readForm();
  try {
    if (form.url && !(await hasHostAccess(form.url)) && !(await requestHostAccess(form.url))) {
      return status(t('errNoPermission'), true);
    }
    const me = await api.me(form);
    status(t('optTestOk', me.alias || me.username));
  } catch (error) {
    const reason = error instanceof ApiError && (error.status === 401 || error.status === 403)
      ? t('errAuth')
      : error.message;
    status(t('optTestFail', reason), true);
  }
}
