import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '../i18n';

export default function OfflineBanner() {
  const { t } = useI18n();
  const [offline, setOffline] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      setOffline(state.isInternetReachable === false || state.isConnected === false);
    });
    return unsub;
  }, []);

  if (!offline) return null;

  return (
    <View style={[s.root, { top: insets.top }]} accessibilityRole="alert" accessibilityLiveRegion="assertive">
      <Text style={s.txt}>{t.offlineMsg}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { position: 'absolute', left: 0, right: 0, zIndex: 9998, backgroundColor: 'rgba(255,90,90,0.95)', paddingVertical: 8, alignItems: 'center' },
  txt: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
