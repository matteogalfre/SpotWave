import React, { useEffect } from 'react';
import { Platform, Dimensions, View, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import AndroidNavBar from './src/components/AndroidNavBar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
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

// iOS PWA: with a black-translucent status bar, content draws under the Dynamic
// Island. This frosted strip (height = top safe-area inset) keeps the clock /
// battery legible over any content and gives the native iOS "material" top edge.
// Web-only, and only rendered when there's actually a top inset (standalone).
function WebStatusScrim({ isDark }: { isDark: boolean }) {
  const insets = useSafeAreaInsets();
  if (Platform.OS !== 'web' || insets.top <= 0) return null;
  const tint = isDark ? 'rgba(11,15,26,0.55)' : 'rgba(251,248,242,0.55)';
  return (
    <View
      pointerEvents="none"
      style={[styles.statusScrim, { height: insets.top }]}
    >
      <BlurView intensity={isDark ? 30 : 45} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} />
    </View>
  );
}

function AppContent() {
  const { isDark } = useTheme();

  useEffect(() => {
    // Android 16 forbids fixed-orientation on large screens, so the manifest no
    // longer locks orientation (app.json orientation: "default"). We keep the
    // portrait-tuned UI on phones by locking at runtime, while tablets, foldables
    // and Chromebooks stay free to rotate. Phone = shortest side < 600dp.
    if (Platform.OS === 'web') return;
    const { width, height } = Dimensions.get('window');
    const isPhone = Math.min(width, height) < 600;
    if (isPhone) {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    }
  }, []);

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
      {Platform.OS === 'android' && <AndroidNavBar isDark={isDark} />}
      <OfflineBanner />
      <AppNavigator />
      <WebStatusScrim isDark={isDark} />
    </>
  );
}

const styles = StyleSheet.create({
  statusScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
});

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
