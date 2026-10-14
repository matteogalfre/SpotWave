import AsyncStorage from '@react-native-async-storage/async-storage';
import { setCrashReporter, getRecentErrors, log } from '../utils/logger';

/**
 * Journalisation locale des erreurs.
 *
 * Un anneau tampon sans dépendance, persisté dans AsyncStorage : les erreurs
 * récentes survivent à un crash puis un redémarrage, même hors ligne
 * (récupérables via {@link getPersistedCrashLog}).
 */

const CRASH_LOG_KEY = '@spotwave_crash_log';
const MAX_ENTRIES = 30;

export interface CrashEntry {
  time: string;
  message: string;
}

async function persistError(message: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CRASH_LOG_KEY);
    const list: CrashEntry[] = raw ? JSON.parse(raw) : [];
    list.push({ time: new Date().toISOString(), message });
    while (list.length > MAX_ENTRIES) list.shift();
    await AsyncStorage.setItem(CRASH_LOG_KEY, JSON.stringify(list));
  } catch {
    // Persister un log de crash ne doit jamais faire crasher l'app.
  }
}

/** Branche le pipeline d'erreurs de l'app. À appeler une fois, au plus tôt. */
export function initCrashReporter(): void {
  setCrashReporter((message) => {
    persistError(message);
  });
  log.info('Crash reporter ready (local persistence on)');
}

/** Journal persisté (survit au redémarrage), du plus ancien au plus récent. */
export async function getPersistedCrashLog(): Promise<CrashEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(CRASH_LOG_KEY);
    const persisted: CrashEntry[] = raw ? JSON.parse(raw) : [];
    // Fusion avec l'anneau en mémoire (les erreurs de cette session ne sont pas
    // forcément déjà écrites) pour avoir une vue complète.
    return [...persisted, ...getRecentErrors()];
  } catch {
    return [];
  }
}

export async function clearPersistedCrashLog(): Promise<void> {
  await AsyncStorage.removeItem(CRASH_LOG_KEY).catch(() => {});
}
