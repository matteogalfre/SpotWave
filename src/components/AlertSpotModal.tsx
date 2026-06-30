import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Pressable, PanResponder } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../i18n';
import { scoreColor } from '../theme';
import { ICONS } from '../utils/icons';
import { DEFAULT_ALERT_SCORE } from '../services/alerts';

interface Props {
  visible: boolean;
  spotName: string;
  /** Existing alert threshold, or null if no alert is set yet. */
  initialScore: number | null;
  onClose: () => void;
  onSave: (minScore: number) => void;
  onDisable: () => void;
}

const THUMB = 26;
const MIN = 3;
const MAX = 9;

export default function AlertSpotModal({ visible, spotName, initialScore, onClose, onSave, onDisable }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [picked, setPicked] = useState(DEFAULT_ALERT_SCORE);
  const [trackW, setTrackW] = useState(0);
  const isActive = initialScore != null;

  useEffect(() => {
    if (visible) setPicked(initialScore ?? DEFAULT_ALERT_SCORE);
  }, [visible, initialScore]);

  const trackRef = useRef<View>(null);
  const trackXRef = useRef(0);
  const trackWRef = useRef(0);

  // Map the [MIN..MAX] usable range across the full track, snap to 0.5 steps.
  const valueFromPageX = (pageX: number) => {
    const w = trackWRef.current;
    if (w <= 0) return MIN;
    const ratio = Math.max(0, Math.min(1, (pageX - trackXRef.current) / w));
    const raw = MIN + ratio * (MAX - MIN);
    return Math.round(raw * 2) / 2;
  };

  const measureTrack = () => {
    trackRef.current?.measureInWindow((x, _y, w) => {
      trackXRef.current = x;
      trackWRef.current = w;
      setTrackW(w);
    });
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => setPicked(valueFromPageX(e.nativeEvent.pageX)),
      onPanResponderMove: (e) => setPicked(valueFromPageX(e.nativeEvent.pageX)),
    }),
  ).current;

  const ratio = (picked - MIN) / (MAX - MIN);
  const thumbLeft = Math.max(0, Math.min(trackW - THUMB, ratio * trackW - THUMB / 2));
  const fillW = ratio * trackW;
  const c = scoreColor(picked);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={[s.sheet, { backgroundColor: colors.bg, paddingBottom: insets.bottom + 20 }]} onPress={() => {}}>
          <View style={[s.handle, { backgroundColor: colors.white15 }]} />

          <MaterialCommunityIcons name={ICONS.bellRing} size={28} color={colors.accent} style={s.bell} />
          <Text style={[s.title, { color: colors.white }]}>{t.alertTitle}</Text>
          <Text style={[s.spot, { color: colors.accent }]}>{spotName}</Text>
          <Text style={[s.sub, { color: colors.white40 }]}>{t.alertSubtitle}</Text>

          <Text style={[s.bigNum, { color: c }]}>{picked.toFixed(1)}<Text style={[s.bigNumMax, { color: colors.white40 }]}>/10</Text></Text>

          <View
            ref={trackRef}
            style={s.track}
            onLayout={measureTrack}
            accessibilityRole="adjustable"
            accessibilityLabel={t.alertMinScore}
            accessibilityValue={{ min: MIN, max: MAX, now: picked }}
            {...pan.panHandlers}
          >
            <View pointerEvents="none" style={[s.trackBg, { backgroundColor: colors.white15 }]} />
            <View pointerEvents="none" style={[s.trackFill, { width: fillW, backgroundColor: c }]} />
            <View pointerEvents="none" style={[s.thumb, { left: thumbLeft, backgroundColor: c, borderColor: colors.white }]} />
          </View>
          <View style={s.scaleRow}>
            {[3, 4, 5, 6, 7, 8, 9].map(n => (
              <Text key={n} style={[s.scaleTxt, { color: colors.white40 }]}>{n}</Text>
            ))}
          </View>

          <Text style={[s.hint, { color: colors.white40 }]}>{t.alertPreview(picked.toFixed(1))}</Text>

          <TouchableOpacity
            onPress={() => onSave(picked)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t.alertSave}
            style={[s.send, { backgroundColor: colors.accent }]}
          >
            <MaterialCommunityIcons name={ICONS.bell} size={16} color="#06121F" />
            <Text style={[s.sendTxt, { color: '#06121F' }]}>{isActive ? t.alertUpdate : t.alertSave}</Text>
          </TouchableOpacity>

          {isActive ? (
            <TouchableOpacity onPress={onDisable} style={s.cancel} accessibilityRole="button" accessibilityLabel={t.alertDisable}>
              <Text style={[s.cancelTxt, { color: colors.red }]}>{t.alertDisable}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={onClose} style={s.cancel} accessibilityRole="button" accessibilityLabel={t.cancel}>
              <Text style={[s.cancelTxt, { color: colors.white40 }]}>{t.cancel}</Text>
            </TouchableOpacity>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 14 },
  bell: { alignSelf: 'center', marginBottom: 4 },
  title: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  spot: { fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: 2 },
  sub: { fontSize: 12, fontWeight: '500', textAlign: 'center', marginTop: 8, lineHeight: 17 },
  bigNum: { fontSize: 48, fontWeight: '900', textAlign: 'center', marginTop: 8 },
  bigNumMax: { fontSize: 20, fontWeight: '700' },
  track: { height: THUMB, justifyContent: 'center', marginTop: 6 },
  trackBg: { position: 'absolute', left: 0, right: 0, height: 6, borderRadius: 3 },
  trackFill: { position: 'absolute', left: 0, height: 6, borderRadius: 3 },
  thumb: { position: 'absolute', width: THUMB, height: THUMB, borderRadius: THUMB / 2, borderWidth: 3 },
  scaleRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  scaleTxt: { fontSize: 11, fontWeight: '600' },
  hint: { fontSize: 12, fontWeight: '500', textAlign: 'center', marginTop: 16, lineHeight: 17 },
  send: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: 14, marginTop: 16 },
  sendTxt: { fontSize: 15, fontWeight: '800' },
  cancel: { alignItems: 'center', paddingVertical: 12, marginTop: 2 },
  cancelTxt: { fontSize: 13, fontWeight: '600' },
});
