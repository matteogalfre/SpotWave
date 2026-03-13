import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      setOffline(!(state.isConnected ?? true));
    });
    return unsub;
  }, []);

  if (!offline) return null;

  return (
    <View style={[s.root, { top: insets.top }]} accessibilityRole="alert" accessibilityLiveRegion="assertive">
      <Text style={s.txt}>📡  Pas de connexion internet</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { position: 'absolute', left: 0, right: 0, zIndex: 9998, backgroundColor: 'rgba(255,90,90,0.95)', paddingVertical: 8, alignItems: 'center' },
  txt: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
