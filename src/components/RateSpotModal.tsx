import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Pressable, PanResponder } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../i18n';
import { scoreColor } from '../theme';

interface Props {
  visible: boolean;
  spotName: string;
  appScore: number;
  onClose: () => void;
  onSubmit: (score: number) => void;
}

const THUMB = 26;

export default function RateSpotModal({ visible, spotName, appScore, onClose, onSubmit }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [picked, setPicked] = useState<number | null>(null);
  const [trackW, setTrackW] = useState(0);

  // Pre-fill the slider with the algorithm score so the user nudges from it.
  useEffect(() => {
    if (visible) setPicked(Math.max(0, Math.min(10, Math.round(appScore * 10) / 10)));
  }, [visible, appScore]);
  const trackRef = useRef<View>(null);
  const trackXRef = useRef(0);
  const trackWRef = useRef(0);

  // Use absolute pageX (not locationX, which becomes relative to the thumb and
  // makes the slider jump) and round to one decimal, like the score.
  const valueFromPageX = (pageX: number) => {
    const w = trackWRef.current;
    if (w <= 0) return 0;
    const x = pageX - trackXRef.current;
    const ratio = Math.max(0, Math.min(1, x / w));
    return Math.round(ratio * 100) / 10;
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

  const close = () => { setPicked(null); onClose(); };
  const send = () => { if (picked == null) return; onSubmit(picked); setPicked(null); };

  const ratio = picked == null ? 0.5 : picked / 10;
  const thumbLeft = Math.max(0, Math.min(trackW - THUMB, ratio * trackW - THUMB / 2));
  const fillW = ratio * trackW;
  const c = picked == null ? colors.white40 : scoreColor(picked);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={s.backdrop} onPress={close}>
        <Pressable style={[s.sheet, { backgroundColor: colors.bg, paddingBottom: insets.bottom + 20 }]} onPress={() => {}}>
          <View style={s.handle} />
          <Text style={[s.title, { color: colors.white }]}>{t.rateTitle}</Text>
          <Text style={[s.spot, { color: colors.accent }]}>{spotName}</Text>
          <Text style={[s.sub, { color: colors.white40 }]}>{t.rateSubtitle}</Text>

          <Text style={[s.bigNum, { color: c }]}>{picked == null ? '–' : picked.toFixed(1)}<Text style={[s.bigNumMax, { color: colors.white40 }]}>/10</Text></Text>

          <View
            ref={trackRef}
            style={s.track}
            onLayout={measureTrack}
            accessibilityRole="adjustable"
            accessibilityLabel={t.rateTitle}
            accessibilityValue={picked == null ? undefined : { min: 0, max: 10, now: picked }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) => {
              const step = e.nativeEvent.actionName === 'increment' ? 0.5 : -0.5;
              setPicked((p) => Math.max(0, Math.min(10, Math.round(((p ?? 5) + step) * 10) / 10)));
            }}
            {...pan.panHandlers}
          >
            <View pointerEvents="none" style={[s.trackBg, { backgroundColor: colors.white15 }]} />
            <View pointerEvents="none" style={[s.trackFill, { width: fillW, backgroundColor: c }]} />
            <View pointerEvents="none" style={[s.thumb, { left: thumbLeft, backgroundColor: c, borderColor: colors.white }]} />
          </View>
          <View style={s.scaleRow}>
            {[0, 2, 4, 6, 8, 10].map(n => (
              <Text key={n} style={[s.scaleTxt, { color: colors.white40 }]}>{n}</Text>
            ))}
          </View>

          <Text style={[s.hint, { color: colors.white40 }]}>{t.rateHint}</Text>
          <Text style={[s.appScore, { color: colors.white40 }]}>{t.rateAppScore(appScore.toFixed(1))}</Text>

          <TouchableOpacity
            onPress={send}
            disabled={picked == null}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t.rateSend}
            style={[s.send, { backgroundColor: picked == null ? colors.white15 : colors.accent }]}
          >
            <MaterialCommunityIcons name="send" size={16} color={picked == null ? colors.white40 : '#06121F'} />
            <Text style={[s.sendTxt, { color: picked == null ? colors.white40 : '#06121F' }]}>{t.rateSend}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={close} style={s.cancel} accessibilityRole="button" accessibilityLabel={t.rateCancel}>
            <Text style={[s.cancelTxt, { color: colors.white40 }]}>{t.rateCancel}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', marginBottom: 14 },
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
  appScore: { fontSize: 11, fontWeight: '600', textAlign: 'center', marginTop: 6 },
  send: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: 14, marginTop: 14 },
  sendTxt: { fontSize: 15, fontWeight: '800' },
  cancel: { alignItems: 'center', paddingVertical: 12, marginTop: 2 },
  cancelTxt: { fontSize: 13, fontWeight: '600' },
});
