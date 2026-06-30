import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { SpotConfig, HourlyCondition, SpotForecast } from '../types';
import { RATING_FORM_ACTION, RATING_FORM_ENTRY } from '../utils/constants';
import { postGoogleForm } from './googleForm';

const STORE_KEY = '@sw_ratings';
const MAX_STORED = 500;

export interface RatingPayload {
  spotId: string;
  spotName: string;
  country: string;
  userScore: number;        // 0..10 the user gave
  appScore: number;         // SpotWave's current score
  localTime: string;        // spot-local hour the rating refers to
  swellH: number | null;
  swellT: number | null;
  swellDir: number | null;
  windSpeed: number | null;
  windGust: number | null;
  windDir: number | null;
  seaTemp: number | null;
  factors: {
    swellQuality: number; windQuality: number; cleanFactor: number;
    tideMatch: number; levelFit: number; rawScore: number; cappedScore: number;
    caps: string[]; windSwellOnly: boolean;
  } | null;
  ts: string;               // ISO submit time (UTC)
  appVersion: string;
  locale: string;
  day: string;              // spot-local day (YYYY-MM-DD) for dedup
}

interface StoredRating extends RatingPayload { sent: boolean }

const appVersion = (): string => {
  try { return Constants.expoConfig?.version ?? 'unknown'; } catch { return 'unknown'; }
};

export function buildRatingPayload(
  spot: SpotConfig,
  forecast: SpotForecast,
  cond: HourlyCondition | null | undefined,
  userScore: number,
  locale: string,
  day: string,
): RatingPayload {
  const f = cond?.factors;
  return {
    spotId: spot.id,
    spotName: spot.name,
    country: spot.country,
    userScore,
    appScore: Number(forecast.currentScore.toFixed(2)),
    localTime: cond?.time ?? '',
    swellH: cond ? Number(cond.swellHeight.toFixed(2)) : null,
    swellT: cond ? Number(cond.swellPeriod.toFixed(0)) : null,
    swellDir: cond ? Number(cond.swellDirection.toFixed(0)) : null,
    windSpeed: cond ? Number(cond.windSpeed.toFixed(0)) : null,
    windGust: cond ? Number(cond.windGusts.toFixed(0)) : null,
    windDir: cond ? Number(cond.windDirection.toFixed(0)) : null,
    seaTemp: cond ? Number(cond.seaTemp.toFixed(1)) : null,
    factors: f ? {
      swellQuality: Number(f.swellQuality.toFixed(3)),
      windQuality: Number(f.windQuality.toFixed(3)),
      cleanFactor: Number(f.cleanFactor.toFixed(3)),
      tideMatch: Number(f.tideMatch.toFixed(3)),
      levelFit: Number(f.levelFit.toFixed(3)),
      rawScore: Number(f.rawScore.toFixed(2)),
      cappedScore: Number(f.cappedScore.toFixed(2)),
      caps: f.caps,
      windSwellOnly: f.windSwellOnly,
    } : null,
    ts: new Date().toISOString(),
    appVersion: appVersion(),
    locale,
    day,
  };
}

async function loadAll(): Promise<StoredRating[]> {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as StoredRating[]) : [];
  } catch { return []; }
}

async function saveAll(list: StoredRating[]): Promise<void> {
  try { await AsyncStorage.setItem(STORE_KEY, JSON.stringify(list.slice(-MAX_STORED))); } catch { /* ignore */ }
}

/** True if this spot was already rated today (spot-local day). */
export async function hasRatedToday(spotId: string, day: string): Promise<boolean> {
  const list = await loadAll();
  return list.some(r => r.spotId === spotId && r.day === day);
}

/** Fire-and-forget anonymous POST to the configured Google Form. */
async function postToForm(payload: RatingPayload): Promise<boolean> {
  if (!RATING_FORM_ACTION || !RATING_FORM_ENTRY) return false;
  return postGoogleForm(RATING_FORM_ACTION, { [RATING_FORM_ENTRY]: JSON.stringify(payload) });
}

/** Retry any locally-stored ratings that never reached the form. */
export async function flushPendingRatings(): Promise<void> {
  const list = await loadAll();
  if (!list.some(r => !r.sent)) return;
  let changed = false;
  for (const r of list) {
    if (r.sent) continue;
    // eslint-disable-next-line no-await-in-loop
    const ok = await postToForm(r);
    if (ok) { r.sent = true; changed = true; }
  }
  if (changed) await saveAll(list);
}

/**
 * Stores the rating on-device (always) and tries to submit it to the form.
 * Returns true if it reached the form, false if it was only queued locally.
 */
export async function submitRating(payload: RatingPayload): Promise<boolean> {
  const list = await loadAll();
  const sent = await postToForm(payload);
  list.push({ ...payload, sent });
  await saveAll(list);
  return sent;
}
