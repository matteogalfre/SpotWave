import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SurferProfile, DEFAULT_PROFILE } from '../types';

const STORAGE_KEY = '@spotwave_profile';

interface ProfileContextType {
  profile: SurferProfile;
  updateProfile: (p: SurferProfile) => Promise<void>;
  isLoading: boolean;
}

const ProfileContext = createContext<ProfileContextType>({
  profile: DEFAULT_PROFILE,
  updateProfile: async () => {},
  isLoading: true,
});

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<SurferProfile>(DEFAULT_PROFILE);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
              setProfile({ ...DEFAULT_PROFILE, ...parsed });
            }
          } catch {
            AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
          }
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const updateProfile = useCallback(async (p: SurferProfile) => {
    setProfile(p);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  }, []);

  return (
    <ProfileContext.Provider value={{ profile, updateProfile, isLoading }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}
