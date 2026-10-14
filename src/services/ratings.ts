import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { SpotConfig, HourlyCondition, SpotForecast, SurferLevel } from '../types';
import { RATING_FORM_ACTION, RATING_FORM_ENTRY } from '../utils/constants';
import { postGoogleFormStatus } from './googleForm';

const STORE_KEY = '@sw_ratings';
const MAX_STORED = 500;
// A rating that still hasn't gone through after this many tries, or this long
// after it was given, is kept on-device but no longer retried.
const MAX_ATTEMPTS = 5;
const MAX_RETRY_AGE_MS = 30 * 24 * 3600 * 1000;

export interface RatingPayload {
  id: string;               // random per-rating id, lets the sheet drop duplicates
  spotId: string;
  spotName: string;
  country: string;
  userScore: number;        // 0..10 the user gave
  appScore: number;         // SpotWave's current score
  localTime: string;        // spot-local hour the rating refers to
  swellH: number | null;
  swellT: number | null;
  peakT: number | null;     // swell peak period (s)
  waveH: number | null;     // total sea height (m), the model blends it with swellH
  swellDir: number | null;
  windSpeed: number | null;
  windGust: number | null;
  windDir: number | null;
  seaTemp: number | null;
  factors: {
    swellQuality: number; windQuality: number; cleanFactor: number;
    tideMatch: number; levelFit: number; rawScore: number; cappedScore: number;
    caps: string[]; windSwellOnly: boolean;
    profileMatch?: number; windTrend?: number; consistency?: number;
    effectiveHeight?: number; effectivePeriod?: number | null; smallSurfDamp?: number;
  } | null;
  ts: string;               // ISO submit time (UTC)
  appVersion: string;
  locale: string;
  day: string;              // spot-local day (YYYY-MM-DD) for dedup
  level: SurferLevel;       // surfer level at rating time — dedup is per level
}

// Ratings stored by earlier app versions have no `id` nor `attempts`.
interface StoredRating extends Omit<RatingPayload, 'id'> {
  id?: string;
  sent: boolean;
  attempts?: number;
}

const appVersion = (): string => {
  try { return Constants.expoConfig?.version ?? 'unknown'; } catch { return 'unknown'; }
};

const newId = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Stable id for a stored rating, derived for legacy entries that lack one. */
const idOf = (r: StoredRating): string => r.id ?? `${r.spotId}|${r.level}|${r.ts}`;

/** What goes to the form: the payload only, never the local bookkeeping. */
function toPayload(r: StoredRating): RatingPayload {
  const p: Partial<StoredRating> = { ...r };
  delete p.sent;
  delete p.attempts;
  return { ...(p as RatingPayload), id: idOf(r) };
}

export function buildRatingPayload(
  spot: SpotConfig,
  forecast: SpotForecast,
  cond: HourlyCondition | null | undefined,
  userScore: number,
  locale: string,
  day: string,
  level: SurferLevel,
): RatingPayload {
  const f = cond?.factors;
  return {
    id: newId(),
    spotId: spot.id,
    spotName: spot.name,
    country: spot.country,
    userScore,
    appScore: Number(forecast.currentScore.toFixed(2)),
    localTime: cond?.time ?? '',
    swellH: cond ? Number(cond.swellHeight.toFixed(2)) : null,
    swellT: cond ? Number(cond.swellPeriod.toFixed(0)) : null,
    peakT: cond?.swellPeakPeriod != null ? Number(cond.swellPeakPeriod.toFixed(1)) : null,
    waveH: cond ? Number(cond.waveHeight.toFixed(2)) : null,
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
      profileMatch: Number(f.profileMatch.toFixed(3)),
      windTrend: Number(f.windTrend.toFixed(3)),
      consistency: Number(f.consistency.toFixed(3)),
      effectiveHeight: f.effectiveHeight != null ? Number(f.effectiveHeight.toFixed(2)) : undefined,
      effectivePeriod: f.effectivePeriod != null ? Number(f.effectivePeriod.toFixed(1)) : f.effectivePeriod,
      smallSurfDamp: f.smallSurfDamp != null ? Number(f.smallSurfDamp.toFixed(3)) : undefined,
    } : null,
    ts: new Date().toISOString(),
    appVersion: appVersion(),
    locale,
    day,
    level,
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

// Every read-modify-write of the store goes through this chain, so a rating
// submitted while a retry is in progress can't be overwritten by a stale list.
let storeChain: Promise<void> = Promise.resolve();
function mutate(fn: (list: StoredRating[]) => StoredRating[]): Promise<void> {
  const run = storeChain.then(async () => { await saveAll(fn(await loadAll())); });
  storeChain = run.catch(() => {});
  return run;
}

// Ids being posted right now: two flushes (or a flush and a submit) never post
// the same rating twice in parallel.
const inFlight = new Set<string>();

/**
 * Posts one rating and records the outcome. Any HTTP answer below 500 counts
 * as done: Google has either stored the response or rejected it for good, and
 * retrying cannot help. Counting a non-2xx answer as a failure is the likely
 * reason two ratings reached the sheet 8 times each in summer 2026: they were
 * resent at every launch. Only no answer / 5xx is retried.
 */
async function send(payload: RatingPayload): Promise<boolean> {
  inFlight.add(payload.id);
  try {
    const status = RATING_FORM_ACTION && RATING_FORM_ENTRY
      ? await postGoogleFormStatus(RATING_FORM_ACTION, { [RATING_FORM_ENTRY]: JSON.stringify(payload) })
      : null;
    const done = status != null && status < 500;
    await mutate(list => list.map(r => {
      if (idOf(r) !== payload.id) return r;
      return done ? { ...r, sent: true } : { ...r, attempts: (r.attempts ?? 0) + 1 };
    }));
    return done;
  } finally {
    inFlight.delete(payload.id);
  }
}

/**
 * True if this spot was already rated today (spot-local day) AT THIS LEVEL.
 * Dedup is per level, so a user can rate the same spot once as beginner, once
 * as intermediate and once as expert on the same day.
 */
export async function hasRatedToday(spotId: string, day: string, level: SurferLevel): Promise<boolean> {
  const list = await loadAll();
  return list.some(r => r.spotId === spotId && r.day === day && r.level === level);
}

/** Retry any locally-stored ratings that never reached the form. */
export async function flushPendingRatings(): Promise<void> {
  const now = Date.now();
  const pending = (await loadAll()).filter(r =>
    !r.sent
    && (r.attempts ?? 0) < MAX_ATTEMPTS
    && now - Date.parse(r.ts) < MAX_RETRY_AGE_MS);
  for (const r of pending) {
    if (inFlight.has(idOf(r))) continue;
    // eslint-disable-next-line no-await-in-loop
    await send(toPayload(r));
  }
}

/**
 * Stores the rating on-device (always) and tries to submit it to the form.
 * Returns true if it reached the form, false if it was only queued locally.
 */
export async function submitRating(payload: RatingPayload): Promise<boolean> {
  // Stored before posting, so the rating survives the app closing mid-send.
  await mutate(list => [...list, { ...payload, sent: false, attempts: 0 }]);
  return send(payload);
}
