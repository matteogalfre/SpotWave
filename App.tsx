import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ProfileProvider } from './src/context/ProfileContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { LocationProvider } from './src/context/LocationContext';
import { ToastProvider } from './src/components/Toast';
import ErrorBoundary from './src/components/ErrorBoundary';
import OfflineBanner from './src/components/OfflineBanner';
import AppNavigator from './src/navigation/AppNavigator';

function AppContent() {
  const { isDark } = useTheme();
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
        <ThemeProvider>
          <ProfileProvider>
            <LocationProvider>
              <ToastProvider>
                <AppContent />
              </ToastProvider>
            </LocationProvider>
          </ProfileProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
