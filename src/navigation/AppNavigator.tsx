import React, { useMemo } from 'react';
import { Platform } from 'react-native';
import { NavigationContainer, DefaultTheme, LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { RootStackParamList, MainTabParamList } from './types';

import SpotsScreen from '../screens/SpotsScreen';
import MapScreen from '../screens/MapScreen';
import FavoritesScreen from '../screens/FavoritesScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SpotDetailScreen from '../screens/SpotDetailScreen';

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
      SpotDetail: 'spot/:spotId',
    },
  },
};

function MainTabs() {
  const { colors, isDark } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.white15,
          borderTopWidth: 0.5,
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.white40,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="SpotsTab"
        component={SpotsScreen}
        options={{
          tabBarLabel: 'Spots',
          tabBarIcon: ({ color, size }) => <Ionicons name="water-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="MapTab"
        component={MapScreen}
        options={{
          tabBarLabel: 'Carte',
          tabBarIcon: ({ color, size }) => <Ionicons name="earth-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="FavoritesTab"
        component={FavoritesScreen}
        options={{
          tabBarLabel: 'Favoris',
          tabBarIcon: ({ color, size }) => <Ionicons name="star-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profil',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { colors, isDark } = useTheme();

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

  return (
    <NavigationContainer theme={navTheme} linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen
          name="SpotDetail"
          component={SpotDetailScreen}
          options={{ animation: 'fade_from_bottom', animationDuration: 250 }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
