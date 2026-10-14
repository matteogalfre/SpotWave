import React, { useEffect, useRef, memo } from 'react';
import { Text, StyleSheet, Animated, AccessibilityInfo, Platform } from 'react-native';
import { scoreColor as getScoreColor, scoreInk, scoreBg as getScoreBg } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useI18n, fmtDec } from '../i18n';

interface Props {
  score: number;
  size?: 'sm' | 'md' | 'lg' | 'hero';
  animated?: boolean;
}

const DIM = {
  sm:   { box: 34, font: 13 },
  md:   { box: 46, font: 17 },
  lg:   { box: 60, font: 22 },
  hero: { box: 80, font: 30 },
};

export default memo(function ScoreBadge({ score, size = 'md', animated = false }: Props) {
  const { t } = useI18n();
  const { isDark } = useTheme();
  const color = getScoreColor(score);
  const ink = scoreInk(score, isDark);
  const bg = getScoreBg(score);
  const d = DIM[size];

  const scaleAnim = useRef(new Animated.Value(animated ? 0.3 : 1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const displayScore = useRef(new Animated.Value(animated ? 0 : score)).current;
  const [displayVal, setDisplayVal] = React.useState(animated ? 0 : score);
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then(v => { reduceMotionRef.current = !!v; })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!animated || reduceMotionRef.current) {
      setDisplayVal(score);
      scaleAnim.setValue(1);
      return;
    }
    scaleAnim.setValue(0.3);
    displayScore.setValue(0);

    Animated.spring(scaleAnim, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
    Animated.timing(displayScore, { toValue: score, duration: 800, useNativeDriver: false }).start();

    const id = displayScore.addListener(({ value }) => {
      setDisplayVal(Math.round(value * 10) / 10);
    });
    return () => displayScore.removeListener(id);
  }, [score, animated, scaleAnim, displayScore]);

  // Epic scores gently "breathe" on the hero to celebrate a great day.
  const isEpic = size === 'hero' && score >= 8;
  useEffect(() => {
    if (!isEpic || reduceMotionRef.current) {
      pulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 950, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 950, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isEpic, pulseAnim]);

  // On the hero, cast a soft glow in the score's own colour so the app's
  // signature number reads as a crafted "moment", not just another chip.
  // iOS-only on purpose: Android's `elevation` draws a boxy/octagonal shadow
  // that shows through the translucent badge fill, which looks broken. iOS
  // shadow* props render a soft round glow that follows the circle.
  const halo = size === 'hero'
    ? Platform.select({
        ios: { shadowColor: color, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.45, shadowRadius: 14 },
        default: null,
      })
    : null;

  return (
    <Animated.View
      style={[s.box, halo, { width: d.box, height: d.box, borderRadius: d.box / 2, backgroundColor: bg, borderColor: color, transform: [{ scale: Animated.multiply(scaleAnim, pulseAnim) }] }]}
      accessibilityLabel={t.a11yScore(fmtDec(displayVal))}
      accessibilityRole="text"
    >
      <Text style={[s.txt, { fontSize: d.font, color: ink }]}>{fmtDec(displayVal)}</Text>
    </Animated.View>
  );
});

const s = StyleSheet.create({
  box: { justifyContent: 'center', alignItems: 'center', borderWidth: 2 },
  txt: { fontWeight: '800', fontVariant: ['tabular-nums'] },
});
