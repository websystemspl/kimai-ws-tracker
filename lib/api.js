/**
 * Thin client for the Kimai REST API.
 *
 * Authentication uses the modern bearer token (Profile > API in Kimai). The
 * legacy X-AUTH-USER / X-AUTH-TOKEN pair is deprecated and rate limited, so it
 * is deliberately not supported here.
 */

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function getSettings() {
  const stored = await chrome.storage.sync.get({
    url: '',
    token: '',
    language: 'auto',
    minDescription: 15,
  });
  stored.url = stored.url.replace(/\/+$/, '');
  return stored;
}

export function isConfigured(settings) {
  return Boolean(settings.url && settings.token);
}

/** Origin pattern the extension needs in order to reach a given Kimai server. */
export function originOf(url) {
  return `${url.replace(/\/+$/, '')}/*`;
}

export function hasHostAccess(url) {
  return chrome.permissions.contains({ origins: [originOf(url)] });
}

/** Must be called from a user gesture - Chrome rejects it otherwise. */
export function requestHostAccess(url) {
  return chrome.permissions.request({ origins: [originOf(url)] });
}

async function request(settings, path, options = {}) {
  const headers = {
    Authorization: `Bearer ${settings.token}`,
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
  };

  let response;
  try {
    response = await fetch(`${settings.url}${path}`, { ...options, headers });
  } catch (cause) {
    throw new ApiError(0, cause.message);
  }

  if (response.status === 401 || response.status === 403) {
    throw new ApiError(response.status, 'unauthorized');
  }
  if (!response.ok) {
    throw new ApiError(response.status, await response.text());
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

export const api = {
  me: (s) => request(s, '/api/users/me'),

  // Without ignoreDates the API hides projects whose start/end window has passed.
  projects: (s) => request(s, '/api/projects?visible=1&ignoreDates=1'),

  customers: (s) => request(s, '/api/customers?visible=1'),

  activities: (s, projectId) => {
    const query = projectId
      ? `?visible=1&globals=true&project=${projectId}`
      : '?visible=1&globals=true';
    return request(s, `/api/activities${query}`);
  },

  active: (s) => request(s, '/api/timesheets/active'),

  recent: (s) => request(s, '/api/timesheets/recent?size=8'),

  /**
   * `billable` is optional on purpose: left out, Kimai derives it from the
   * customer, project and activity flags. It is only sent when the user
   * overrides that default with the switch in the popup.
   */
  start: (s, { project, activity, description, billable }) =>
    request(s, '/api/timesheets', {
      method: 'POST',
      body: JSON.stringify({
        begin: localNow(),
        project,
        activity,
        description,
        ...(billable === undefined ? {} : { billable }),
      }),
    }),

  stop: (s, id) => request(s, `/api/timesheets/${id}/stop`, { method: 'PATCH' }),

  /**
   * Partial update of one entry. Kimai accepts any subset of the edit form, so
   * a running entry can have its description, times or billable flag corrected
   * without touching the rest. Sending `end` also closes a running entry.
   */
  update: (s, id, changes) =>
    request(s, `/api/timesheets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
    }),

  /** Every entry of the calling user that starts today, for the daily total. */
  today: (s) => {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const midnightEnd = new Date(midnight);
    midnightEnd.setHours(23, 59, 59, 0);
    const query = `begin=${encodeURIComponent(localStamp(midnight))}` +
      `&end=${encodeURIComponent(localStamp(midnightEnd))}&size=100`;
    return request(s, `/api/timesheets?${query}`);
  },
};

/**
 * Kimai rejects a start time in the future, and an ISO string in UTC would be
 * read as local time by the server, so send the local wall clock without a zone.
 */
export function localStamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function localNow() {
  return localStamp(new Date(Date.now() - 1000));
}
