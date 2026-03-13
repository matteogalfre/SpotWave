import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserLocation, requestLocation } from '../services/location';

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
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) {
        const { data, ts } = JSON.parse(raw);
        if (Date.now() - ts < CACHE_TTL) {
          setLocation(data);
          setLoading(false);
          return;
        }
      }
    } catch (e) {
      console.warn('[SpotWave] Location cache read error:', e);
    }

    const loc = await requestLocation();
    if (loc) {
      setLocation(loc);
      setDenied(false);
      try {
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ data: loc, ts: Date.now() }));
      } catch (e) {
        console.warn('[SpotWave] Location cache write error:', e);
      }
    } else {
      setDenied(true);
    }
    setLoading(false);
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
