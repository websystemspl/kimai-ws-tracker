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

  activities: (s, projectId) => {
    const query = projectId
      ? `?visible=1&globals=true&project=${projectId}`
      : '?visible=1&globals=true';
    return request(s, `/api/activities${query}`);
  },

  active: (s) => request(s, '/api/timesheets/active'),

  recent: (s) => request(s, '/api/timesheets/recent?size=8'),

  start: (s, { project, activity, description }) =>
    request(s, '/api/timesheets', {
      method: 'POST',
      body: JSON.stringify({ begin: localNow(), project, activity, description }),
    }),

  stop: (s, id) => request(s, `/api/timesheets/${id}/stop`, { method: 'PATCH' }),
};

/**
 * Kimai rejects a start time in the future, and an ISO string in UTC would be
 * read as local time by the server, so send the local wall clock without a zone.
 */
function localNow() {
  const now = new Date(Date.now() - 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}
