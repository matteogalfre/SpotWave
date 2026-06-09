import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ICONS } from '../utils/icons';
import { useI18n } from '../i18n';
import { useTheme } from '../context/ThemeContext';
import { useNetwork } from '../context/NetworkContext';

/** Fixed banner height (excluding the top safe-area inset) so overlays can offset below it. */
export const OFFLINE_BANNER_HEIGHT = 46;

export default function OfflineBanner() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { offline } = useNetwork();
  const insets = useSafeAreaInsets();

  if (!offline) return null;

  return (
    <View style={[s.root, { top: insets.top, backgroundColor: `${colors.red}F0` }]} accessibilityRole="alert" accessibilityLiveRegion="assertive">
      <View style={s.txtRow}>
        <MaterialCommunityIcons name={ICONS.offline} size={14} color="#fff" />
        <Text style={s.txt}>{t.offlineMsg}</Text>
      </View>
      <Text style={s.sub}>{t.offlineCached}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 9998,
    height: OFFLINE_BANNER_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  txtRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  txt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  sub: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '500', marginTop: 2 },
});
