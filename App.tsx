import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationBar } from 'expo-navigation-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ProfileProvider } from './src/context/ProfileContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { LocationProvider } from './src/context/LocationContext';
import { NetworkProvider } from './src/context/NetworkContext';
import { I18nProvider } from './src/i18n';
import { ToastProvider } from './src/components/Toast';
import ErrorBoundary from './src/components/ErrorBoundary';
import OfflineBanner from './src/components/OfflineBanner';
import AppNavigator from './src/navigation/AppNavigator';
import { purgeOldCache } from './src/services/api';
import { maybeRequestReview } from './src/services/review';
import { flushPendingRatings } from './src/services/ratings';

function AppContent() {
  const { isDark } = useTheme();

  useEffect(() => {
    // Defer cache purge off the cold-start path: it scans + JSON-parses every
    // AsyncStorage cache entry, which we don't want competing with first paint.
    const purgeTimer = setTimeout(() => { purgeOldCache(); }, 2500);
    // Defer the in-app review prompt so it never interrupts cold start /
    // onboarding; it self-gates to the 3rd launch (once).
    const timer = setTimeout(() => { maybeRequestReview(); }, 4000);
    // Retry any ratings that couldn't reach the form earlier (offline, etc.).
    const flushTimer = setTimeout(() => { flushPendingRatings(); }, 6000);
    return () => { clearTimeout(purgeTimer); clearTimeout(timer); clearTimeout(flushTimer); };
  }, []);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {/* Android runs edge-to-edge: the system nav bar stays transparent (content
          draws under it, every screen pads with safe-area insets). We only keep
          its buttons legible by matching their contrast to the theme. */}
      {Platform.OS === 'android' && <NavigationBar style={isDark ? 'dark' : 'light'} />}
      <OfflineBanner />
      <AppNavigator />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <I18nProvider>
          <ThemeProvider>
            <ProfileProvider>
              <LocationProvider>
                <NetworkProvider>
                  <ToastProvider>
                    <AppContent />
                  </ToastProvider>
                </NetworkProvider>
              </LocationProvider>
            </ProfileProvider>
          </ThemeProvider>
        </I18nProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
