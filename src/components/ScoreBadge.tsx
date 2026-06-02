import React, { useEffect, useRef, memo } from 'react';
import { Text, StyleSheet, Animated, AccessibilityInfo } from 'react-native';
import { scoreColor as getScoreColor, scoreBg as getScoreBg } from '../theme';
import { useI18n } from '../i18n';

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
  const color = getScoreColor(score);
  const bg = getScoreBg(score);
  const d = DIM[size];

  const scaleAnim = useRef(new Animated.Value(animated ? 0.3 : 1)).current;
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

  return (
    <Animated.View
      style={[s.box, { width: d.box, height: d.box, borderRadius: d.box / 2, backgroundColor: bg, borderColor: color, transform: [{ scale: scaleAnim }] }]}
      accessibilityLabel={t.a11yScore(displayVal.toFixed(1))}
      accessibilityRole="text"
    >
      <Text style={[s.txt, { fontSize: d.font, color }]}>{displayVal.toFixed(1)}</Text>
    </Animated.View>
  );
});

const s = StyleSheet.create({
  box: { justifyContent: 'center', alignItems: 'center', borderWidth: 2 },
  txt: { fontWeight: '800' },
});
