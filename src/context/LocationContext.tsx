import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserLocation, requestLocation } from '../services/location';
import { log } from '../utils/logger';

interface LocationState {
  location: UserLocation | null;
  loading: boolean;
  denied: boolean;
  refresh: () => Promise<void>;
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

  const fetchLocation = useCallback(async () => {
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

    if (hasCache) setLoading(false);

    try {
      const loc = await requestLocation();
      if (loc) {
        setLocation(loc);
        setDenied(false);
        try {
          await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ data: loc, ts: Date.now() }));
        } catch (e) {
          log.warn('Location cache write error:', e);
        }
      } else if (!hasCache) {
        setDenied(true);
      }
    } catch (e) {
      log.warn('Location fetch error:', e);
      if (!hasCache) setDenied(true);
    } finally {
      // Always release the gate so screens can load data even if the GPS fix
      // never resolves (otherwise the app stays stuck on an empty screen).
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocation();
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
