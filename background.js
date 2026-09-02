/**
 * Keeps the toolbar badge showing the elapsed time of a running entry.
 */

import { api, getSettings, isConfigured } from './lib/api.js';

const ALARM = 'kimai-poll';

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM, { periodInMinutes: 1 });
  refresh();
});

chrome.runtime.onStartup.addListener(refresh);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) {
    refresh();
  }
});

// The popup pings after start/stop so the badge does not lag a whole minute.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'refresh') {
    refresh().then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

async function refresh() {
  const settings = await getSettings();
  if (!isConfigured(settings)) {
    return setBadge('', '#6b7280');
  }
  try {
    const running = await api.active(settings);
    if (!running.length) {
      return setBadge('', '#6b7280');
    }
    const started = new Date(running[0].begin).getTime();
    const minutes = Math.max(0, Math.floor((Date.now() - started) / 60000));
    const label = minutes < 60
      ? `${minutes}m`
      : `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
    return setBadge(label, '#16a34a');
  } catch {
    return setBadge('!', '#dc2626');
  }
}

function setBadge(text, color) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}
