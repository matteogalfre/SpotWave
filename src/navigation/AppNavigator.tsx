import React, { useMemo, useState, useEffect } from 'react';
import { Platform, View, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer, DefaultTheme, LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../i18n';
import { RootStackParamList, MainTabParamList } from './types';
import { touchTarget, typography } from '../utils/tokens';

import SpotsScreen from '../screens/SpotsScreen';
import MapScreen from '../screens/MapScreen';
import FavoritesScreen from '../screens/FavoritesScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SpotDetailScreen from '../screens/SpotDetailScreen';
import AboutScreen from '../screens/AboutScreen';
import GuideScreen from '../screens/GuideScreen';
import OnboardingScreen from '../screens/OnboardingScreen';

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
  const { height: screenHeight } = Dimensions.get('window');
  const isSmallDevice = screenHeight < 700;
  const baseTabBarHeight = isSmallDevice ? 56 : 64;
  const tabBarHeight = baseTabBarHeight + Math.max(insets.bottom, Platform.OS === 'android' ? 6 : 0);
  const tabBarPaddingBottom = Math.max(insets.bottom, Platform.OS === 'android' ? 6 : 4);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
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
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
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

  if (showOnboarding === null) return null;

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
