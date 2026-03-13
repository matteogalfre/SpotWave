import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import { SpotForecast } from '../types';

export type MainTabParamList = {
  SpotsTab: undefined;
  MapTab: { focusCountry?: string } | undefined;
  FavoritesTab: undefined;
  ProfileTab: undefined;
};

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  SpotDetail: { forecast: SpotForecast; spotIndex?: number };
};

export type SpotsScreenProps = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'SpotsTab'>,
  NativeStackScreenProps<RootStackParamList>
>;

export type MapScreenProps = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'MapTab'>,
  NativeStackScreenProps<RootStackParamList>
>;

export type FavoritesScreenProps = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'FavoritesTab'>,
  NativeStackScreenProps<RootStackParamList>
>;

export type ProfileScreenProps = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'ProfileTab'>,
  NativeStackScreenProps<RootStackParamList>
>;

export type SpotDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'SpotDetail'>;
