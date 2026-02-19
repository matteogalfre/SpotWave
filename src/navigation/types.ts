import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SpotForecast } from '../types';

export type RootStackParamList = {
  SpotsList: undefined;
  SpotDetail: { forecast: SpotForecast };
  Profile: undefined;
  Map: { forecasts: SpotForecast[] };
};

export type SpotsScreenProps = NativeStackScreenProps<RootStackParamList, 'SpotsList'>;
export type SpotDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'SpotDetail'>;
export type ProfileScreenProps = NativeStackScreenProps<RootStackParamList, 'Profile'>;
export type MapScreenProps = NativeStackScreenProps<RootStackParamList, 'Map'>;
