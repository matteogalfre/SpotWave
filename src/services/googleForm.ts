import { log } from '../utils/logger';

/**
 * Anonymous POST to a Google Form `formResponse` endpoint. `fields` maps
 * `entry.XXXX` ids to their string values. Returns the HTTP status (0 for an
 * opaque response), or null when no answer came back (offline, timeout).
 */
export async function postGoogleFormStatus(
  action: string,
  fields: Record<string, string>,
): Promise<number | null> {
  if (!action) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const body = Object.entries(fields)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    const res = await fetch(action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    });
    if (!res.ok && res.status !== 0) log.warn('Google Form answered HTTP', res.status);
    return res.status;
  } catch (e) {
    log.warn('Google Form submit failed:', (e as Error)?.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fire-and-forget variant. Returns true on success: Google Forms returns 200,
 * opaque responses report status 0.
 */
export async function postGoogleForm(
  action: string,
  fields: Record<string, string>,
): Promise<boolean> {
  const status = await postGoogleFormStatus(action, fields);
  return status === 0 || (status != null && status >= 200 && status < 300);
}
