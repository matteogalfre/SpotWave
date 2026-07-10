import React from 'react';
import { NavigationBar } from 'expo-navigation-bar';

/**
 * Android edge-to-edge system nav bar styling. Isolated in its own module so the
 * web build can swap it for a no-op (AndroidNavBar.web.tsx) without pulling in
 * the Android-only expo-navigation-bar package.
 */
export default function AndroidNavBar({ isDark }: { isDark: boolean }) {
  return <NavigationBar style={isDark ? 'dark' : 'light'} />;
}
