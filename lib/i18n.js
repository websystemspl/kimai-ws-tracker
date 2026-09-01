/**
 * Translation loader.
 *
 * chrome.i18n follows the browser UI language and cannot be overridden, but the
 * team wants to pick Polish or English explicitly, so the locale files are read
 * directly and substituted into the DOM.
 */

const FALLBACK = 'en';
const SUPPORTED = ['pl', 'en'];

let messages = {};

function resolveLocale(setting) {
  if (SUPPORTED.includes(setting)) {
    return setting;
  }
  const ui = (chrome.i18n.getUILanguage() || FALLBACK).toLowerCase();
  const base = ui.split('-')[0];
  return SUPPORTED.includes(base) ? base : FALLBACK;
}

async function load(locale) {
  const url = chrome.runtime.getURL(`_locales/${locale}/messages.json`);
  const response = await fetch(url);
  return response.json();
}

export async function initI18n(setting) {
  const locale = resolveLocale(setting);
  messages = await load(locale);
  if (locale !== FALLBACK) {
    // Fill any gap in a translation with the English text rather than a raw key.
    const fallback = await load(FALLBACK);
    messages = { ...fallback, ...messages };
  }
  document.documentElement.lang = locale;
  return locale;
}

/** Look up a message and substitute $PLACEHOLDER$ values positionally. */
export function t(key, ...args) {
  const entry = messages[key];
  if (!entry) {
    return key;
  }
  let text = entry.message;
  const placeholders = entry.placeholders || {};
  Object.entries(placeholders).forEach(([name, spec]) => {
    const index = parseInt(String(spec.content).replace('$', ''), 10) - 1;
    const value = args[index] !== undefined ? String(args[index]) : '';
    text = text.replace(new RegExp(`\\$${name}\\$`, 'gi'), value);
  });
  return text;
}

/** Translate every [data-i18n] element and [data-i18n-*] attribute in the page. */
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  });
  root.querySelectorAll('[data-i18n-title]').forEach((element) => {
    element.title = t(element.dataset.i18nTitle);
  });
  root.querySelectorAll('[data-i18n-label]').forEach((element) => {
    element.setAttribute('aria-label', t(element.dataset.i18nLabel));
  });
}
