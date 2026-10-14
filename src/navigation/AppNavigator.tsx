import React, { useMemo, useState, useEffect } from 'react';
import { Platform, View, Text, TouchableOpacity, StyleSheet, Dimensions, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer, DefaultTheme, LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator, BottomTabBar } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { hapticLight } from '../utils/haptics';
import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../i18n';
import { RootStackParamList, MainTabParamList } from './types';
import { touchTarget, typography } from '../utils/tokens';
import { useWebLayout, WEB_TABBAR_BASE_HEIGHT, webTabBarSafePad } from '../utils/webLayout';

const isWeb = Platform.OS === 'web';

// Frosted-glass background for the web nav bars (iOS "material" look): a blur of
// whatever scrolls behind, tinted with the theme's tab-bar colour for legible
// icons. Web-only — native keeps its solid bars untouched.
function GlassBar({ isDark, position }: { isDark: boolean; position: 'top' | 'bottom' }) {
  const tintOverlay = isDark ? 'rgba(21,26,45,0.62)' : 'rgba(244,248,247,0.62)';
  const hairline = isDark ? 'rgba(234,238,246,0.14)' : 'rgba(14,58,69,0.10)';
  return (
    <View style={StyleSheet.absoluteFill}>
      <BlurView
        intensity={isDark ? 40 : 55}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tintOverlay }]} />
      <View
        style={[
          { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: hairline },
          position === 'bottom' ? { top: 0 } : { bottom: 0 },
        ]}
      />
    </View>
  );
}

import SpotsScreen from '../screens/SpotsScreen';
import MapScreen from '../screens/MapScreen';
import FavoritesScreen from '../screens/FavoritesScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SpotDetailScreen from '../screens/SpotDetailScreen';
import AboutScreen from '../screens/AboutScreen';
import GuideScreen from '../screens/GuideScreen';
import OnboardingScreen from '../screens/OnboardingScreen';

import type { SpotForecast } from '../types';

const ONBOARDING_KEY = '@spotwave_onboarded';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['spotwave://'],
  config: {
    screens: {
      MainTabs: {
        screens: {
          SpotsTab: 'spots',
          MapTab: 'map',
          FavoritesTab: 'favorites',
          ProfileTab: 'profile',
        },
      },
      About: 'about',
      // Only the spot id goes in the URL; the screen rebuilds the forecast.
      SpotDetail: {
        path: 'spot/:forecast',
        stringify: { forecast: (f: SpotForecast | string) => (typeof f === 'string' ? f : f.spot.id) },
      },
    },
  },
};

const TAB_ICONS: Record<string, { active: string; inactive: string }> = {
  SpotsTab: { active: 'water', inactive: 'water-outline' },
  MapTab: { active: 'earth', inactive: 'earth-outline' },
  FavoritesTab: { active: 'star', inactive: 'star-outline' },
  ProfileTab: { active: 'person', inactive: 'person-outline' },
};

function MainTabs() {
  const { colors, isDark } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { isWide } = useWebLayout();
  const { height: screenHeight } = Dimensions.get('window');
  const isSmallDevice = screenHeight < 700;
  const baseTabBarHeight = isSmallDevice ? 56 : 64;
  const tabBarHeight = baseTabBarHeight + Math.max(insets.bottom, Platform.OS === 'android' ? 6 : 0);
  const tabBarPaddingBottom = Math.max(insets.bottom, Platform.OS === 'android' ? 6 : 4);
  // iOS-style frosted bottom bar: content scrolls under a translucent blur.
  // Web + mobile layout only (desktop uses the custom top nav; native stays
  // solid). Kept compact: only a small, capped slice of the home-indicator
  // safe area is added, so the bar doesn't grow a tall empty strip at the bottom.
  const glassyTabBar = isWeb && !isWide;
  const glassySafePad = webTabBarSafePad(insets.bottom);
  const glassyHeight = baseTabBarHeight + glassySafePad;

  return (
    <Tab.Navigator
      // Keep inactive tabs mounted on web: react-native-web otherwise removes the
      // detached screen from the DOM, so switching tabs re-mounts it and re-runs
      // its data fetch (the "pages reload on tab change" bug). Native is untouched.
      detachInactiveScreens={!isWeb}
      // Desktop web: a fully custom, centered top nav bar (the built-in tab bar
      // clips / left-aligns when forced to the top). Native + narrow web keep the
      // stock bottom bar untouched.
      tabBar={(props) => (isWide ? <WebTopNav {...props} colors={colors} isDark={isDark} /> : <BottomTabBar {...props} />)}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarPosition: isWide ? 'top' : 'bottom',
        // Frosted, translucent bar drawn by GlassBar; content scrolls under it.
        tabBarBackground: glassyTabBar ? () => <GlassBar isDark={isDark} position="bottom" /> : undefined,
        tabBarStyle: glassyTabBar
          ? {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'transparent',
              borderTopWidth: 0,
              height: glassyHeight,
              paddingTop: isSmallDevice ? 4 : 6,
              paddingBottom: glassySafePad,
            }
          : {
              backgroundColor: colors.tabBar,
              borderTopColor: colors.border,
              borderTopWidth: StyleSheet.hairlineWidth,
              height: tabBarHeight,
              paddingTop: isSmallDevice ? 4 : 6,
              paddingBottom: tabBarPaddingBottom,
              // Lift the bar off the content: in light mode card (#FFF) is nearly the
              // same value as the sand bg, so a subtle upward shadow gives the
              // separation the hairline alone can't (avoids "white-on-white").
              ...Platform.select({
                android: { elevation: isDark ? 0 : 8 },
                ios: {
                  shadowColor: '#0E3A45',
                  shadowOffset: { width: 0, height: -2 },
                  shadowOpacity: isDark ? 0 : 0.08,
                  shadowRadius: 8,
                },
                default: {},
              }),
            },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: {
          ...typography.micro,
          fontSize: isSmallDevice ? 10 : 11,
          marginTop: isSmallDevice ? 1 : 2,
        },
        tabBarIcon: ({ focused, color }) => {
          const icons = TAB_ICONS[route.name] || { active: 'ellipse', inactive: 'ellipse-outline' };
          const iconName = focused ? icons.active : icons.inactive;
          return (
            <View style={tabStyles.iconContainer}>
              <Ionicons name={iconName as any} size={focused ? 24 : 22} color={color} />
              {focused && <View style={[tabStyles.dot, { backgroundColor: colors.accent }]} />}
            </View>
          );
        },
        tabBarButton: (props: any) => {
          const { onPress, ...rest } = props;
          return (
            <TouchableOpacity
              {...rest}
              onPress={(e: any) => {
                hapticLight();
                onPress?.(e);
              }}
              activeOpacity={0.7}
              accessibilityRole="tab"
            />
          );
        },
      })}
    >
      <Tab.Screen name="SpotsTab" component={SpotsScreen} options={{ tabBarLabel: t.tabSpots }} />
      <Tab.Screen name="MapTab" component={MapScreen} options={{ tabBarLabel: t.tabMap }} />
      <Tab.Screen name="FavoritesTab" component={FavoritesScreen} options={{ tabBarLabel: t.tabFavorites }} />
      <Tab.Screen name="ProfileTab" component={ProfileScreen} options={{ tabBarLabel: t.tabProfile }} />
    </Tab.Navigator>
  );
}

const tabStyles = StyleSheet.create({
  iconContainer: { alignItems: 'center' },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 4 },
});

const splash = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});

// Custom centered top navigation bar for desktop web.
function WebTopNav({ state, descriptors, navigation, colors, isDark }: any) {
  return (
    <View style={[webNav.bar, { backgroundColor: 'transparent' }]}>
      <GlassBar isDark={isDark} position="top" />
      <View style={webNav.inner}>
        {state.routes.map((route: any, index: number) => {
          const focused = state.index === index;
          const options = descriptors[route.key].options;
          const label = (options.tabBarLabel as string) ?? route.name;
          const icons = TAB_ICONS[route.name] || { active: 'ellipse', inactive: 'ellipse-outline' };
          const color = focused ? colors.accent : colors.textSecondary;
          const onPress = () => {
            hapticLight();
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };
          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              style={[webNav.item, focused && { backgroundColor: colors.accentDim }]}
            >
              <Ionicons name={(focused ? icons.active : icons.inactive) as any} size={20} color={color} />
              <Text style={[webNav.label, { color }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const webNav = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    height: 60,
    overflow: 'hidden',
  },
  inner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 10,
  },
  label: { ...typography.bodyBold, fontSize: 14 },
});

export default function AppNavigator() {
  const { colors, isDark } = useTheme();
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY)
      .then(val => setShowOnboarding(val !== 'true'))
      .catch(() => setShowOnboarding(true));
  }, []);

  const handleOnboardingComplete = () => {
    AsyncStorage.setItem(ONBOARDING_KEY, 'true').catch(() => {});
    setShowOnboarding(false);
  };

  const navTheme = useMemo(() => ({
    ...DefaultTheme,
    dark: isDark,
    colors: {
      ...DefaultTheme.colors,
      primary: colors.accent,
      background: colors.bg,
      card: colors.card,
      text: colors.white,
      border: 'transparent',
      notification: colors.accent,
    },
  }), [colors, isDark]);

  // While the onboarding flag hydrates, show a themed splash instead of a blank
  // white frame (avoids the cold-start flash before the first screen mounts).
  if (showOnboarding === null) {
    return (
      <View style={[splash.root, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (showOnboarding) {
    return <OnboardingScreen onComplete={handleOnboardingComplete} />;
  }

  return (
    <NavigationContainer theme={navTheme} linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen
          name="SpotDetail"
          component={SpotDetailScreen}
          options={{ animation: 'fade_from_bottom', animationDuration: 250 }}
        />
        <Stack.Screen name="About" component={AboutScreen} options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="Guide" component={GuideScreen} options={{ animation: 'slide_from_right' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
