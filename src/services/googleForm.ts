import { log } from '../utils/logger';

/**
 * Fire-and-forget anonymous POST to a Google Form `formResponse` endpoint.
 * `fields` maps `entry.XXXX` ids to their string values. Returns true on success.
 */
export async function postGoogleForm(
  action: string,
  fields: Record<string, string>,
): Promise<boolean> {
  if (!action) return false;
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
    // Google Forms returns 200 on success; opaque responses report status 0.
    return res.ok || res.status === 0;
  } catch (e) {
    log.warn('Google Form submit failed:', (e as Error)?.message);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
