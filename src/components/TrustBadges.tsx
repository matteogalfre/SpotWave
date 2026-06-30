import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../i18n';

/**
 * SpotWave's core differentiator vs paid surf apps: free, no ads, no account.
 * Shown on the onboarding welcome screen and in the profile to reassure users
 * up-front (the #1 complaint about competitors is the paywall / forced login).
 */
export default function TrustBadges({ compact = false }: { compact?: boolean }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const items = [t.trustFree, t.trustNoAds, t.trustNoAccount];
  return (
    <View style={[s.row, compact && s.rowCompact]} accessibilityLabel={items.join(', ')}>
      {items.map((label, i) => (
        <View key={i} style={[s.pill, { backgroundColor: colors.accentDim }]}>
          <MaterialCommunityIcons name="check-circle" size={13} color={colors.accent} />
          <Text style={[s.txt, { color: colors.accent }]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  rowCompact: { gap: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  txt: { fontSize: 12, fontWeight: '700' },
});
