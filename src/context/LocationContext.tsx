import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserLocation, requestLocation } from '../services/location';
import { log } from '../utils/logger';

interface LocationState {
  location: UserLocation | null;
  loading: boolean;
  denied: boolean;
  /**
   * Resolve the location. Pass `prompt: true` (default) to trigger the OS
   * permission dialog on demand (e.g. when the user taps "Ma position").
   */
  refresh: (prompt?: boolean) => Promise<void>;
}

const LocationContext = createContext<LocationState>({
  location: null,
  loading: true,
  denied: false,
  refresh: async () => {},
});

const CACHE_KEY = '@spotwave_location';
const CACHE_TTL = 15 * 60 * 1000;

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  // Monotonic token: only the most recent refresh() call is allowed to write
  // state, so two overlapping calls (e.g. rapid "Ma position" taps) can't apply
  // results out of order or leave `loading` stuck.
  const genRef = useRef(0);

  const fetchLocation = useCallback(async (prompt = true) => {
    const gen = ++genRef.current;
    const isCurrent = () => gen === genRef.current;
    setLoading(true);

    let hasCache = false;
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) {
        const { data, ts } = JSON.parse(raw);
        // Guard against corrupt cache: only accept valid numeric coordinates.
        if (
          data && typeof data.latitude === 'number' && typeof data.longitude === 'number'
          && Number.isFinite(data.latitude) && Number.isFinite(data.longitude)
        ) {
          if (!isCurrent()) return;
          setLocation(data);
          hasCache = true;
          if (Date.now() - ts < CACHE_TTL) {
            setLoading(false);
            return;
          }
        }
      }
    } catch (e) {
      log.warn('Location cache read error:', e);
    }

    if (hasCache && isCurrent()) setLoading(false);

    try {
      const loc = await requestLocation(prompt);
      if (!isCurrent()) return;
      if (loc) {
        setLocation(loc);
        setDenied(false);
        try {
          await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ data: loc, ts: Date.now() }));
        } catch (e) {
          log.warn('Location cache write error:', e);
        }
      } else if (!hasCache && prompt) {
        // Only flag as denied after an explicit prompt. On the silent startup
        // pass we leave the state neutral (the user hasn't been asked yet).
        setDenied(true);
      }
    } catch (e) {
      log.warn('Location fetch error:', e);
      if (isCurrent() && !hasCache && prompt) setDenied(true);
    } finally {
      // Always release the gate so screens can load data even if the GPS fix
      // never resolves (otherwise the app stays stuck on an empty screen).
      if (isCurrent()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Native: silent on startup (use an already-granted permission, never pop
    // the OS dialog here — the prompt is deferred to "Ma position").
    // Web (PWA): prompt on arrival so the browser asks for location right away
    // (there's no ambient "ma position" entry point that fits the desktop flow).
    fetchLocation(Platform.OS === 'web');
  }, [fetchLocation]);

  return (
    <LocationContext.Provider value={{ location, loading, denied, refresh: fetchLocation }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  return useContext(LocationContext);
}
