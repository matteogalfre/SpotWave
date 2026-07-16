import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SurferProfile, WaveHeightPref, DEFAULT_PROFILE } from '../types';
import { log } from '../utils/logger';

const STORAGE_KEY = '@spotwave_profile';

const LEVELS = ['beginner', 'intermediate', 'expert'] as const;
const HEIGHTS: WaveHeightPref[] = ['0.5-1', '1-2', '2+'];

function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Coerce a stored (possibly corrupt / legacy) blob into a valid SurferProfile.
 * Unknown/out-of-range fields fall back to defaults instead of silently feeding
 * the scoring engine garbage. Legacy keys (breakType/windPref) are dropped.
 */
function sanitizeProfile(raw: any): SurferProfile {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PROFILE };
  const level = LEVELS.includes(raw.level) ? raw.level : DEFAULT_PROFILE.level;
  const heights = Array.isArray(raw.preferredHeight)
    ? raw.preferredHeight.filter((h: unknown): h is WaveHeightPref => HEIGHTS.includes(h as WaveHeightPref))
    : [];
  const preferredHeight = heights.length > 0 ? heights : [...DEFAULT_PROFILE.preferredHeight];
  const sessionDuration = typeof raw.sessionDuration === 'number' && raw.sessionDuration >= 0.5 && raw.sessionDuration <= 6
    ? raw.sessionDuration
    : DEFAULT_PROFILE.sessionDuration;
  let availableFrom = clampInt(raw.availableFrom, 0, 23, DEFAULT_PROFILE.availableFrom);
  let availableTo = clampInt(raw.availableTo, 1, 24, DEFAULT_PROFILE.availableTo);
  if (availableTo <= availableFrom) {
    availableFrom = DEFAULT_PROFILE.availableFrom;
    availableTo = DEFAULT_PROFILE.availableTo;
  }
  const preferredZone = typeof raw.preferredZone === 'string' && raw.preferredZone ? raw.preferredZone : undefined;
  return { level, preferredHeight, sessionDuration, availableFrom, availableTo, preferredZone };
}

interface ProfileContextType {
  profile: SurferProfile;
  updateProfile: (p: SurferProfile) => Promise<void>;
  isLoading: boolean;
  version: number;
}

const ProfileContext = createContext<ProfileContextType>({
  profile: DEFAULT_PROFILE,
  updateProfile: async () => {},
  isLoading: true,
  version: 0,
});

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<SurferProfile>(DEFAULT_PROFILE);
  const [isLoading, setIsLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          try {
            setProfile(sanitizeProfile(JSON.parse(raw)));
          } catch {
            AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
          }
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const updateProfile = useCallback(async (p: SurferProfile) => {
    // Persist a sanitized copy so a bad value can never reach storage/scoring.
    const clean = sanitizeProfile(p);
    setProfile(clean);
    setVersion(v => v + 1);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    } catch (e) {
      log.error('Failed to persist profile:', e instanceof Error ? e.message : 'unknown');
    }
  }, []);

  return (
    <ProfileContext.Provider value={{ profile, updateProfile, isLoading, version }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}
