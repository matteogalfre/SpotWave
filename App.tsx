import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
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

function AppContent() {
  const { isDark } = useTheme();

  useEffect(() => {
    purgeOldCache();
  }, []);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
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
