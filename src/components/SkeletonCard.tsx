import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

function Shimmer({ w, h, r = 8 }: { w: number | string; h: number; r?: number }) {
  const { colors } = useTheme();
  const anim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  return (
    <Animated.View
      style={{
        width: w as any,
        height: h,
        borderRadius: r,
        backgroundColor: colors.cardLight,
        opacity: anim,
      }}
    />
  );
}

export default function SkeletonCard() {
  const { colors } = useTheme();
  return (
    <View style={[st.card, { backgroundColor: colors.card }]}>
      <View style={st.head}>
        <Shimmer w={60} h={60} r={30} />
        <View style={st.info}>
          <Shimmer w={140} h={16} />
          <Shimmer w={100} h={12} />
        </View>
      </View>
      <View style={st.bar}>
        <Shimmer w={70} h={12} />
        <Shimmer w={50} h={12} />
        <Shimmer w={80} h={12} />
      </View>
      <Shimmer w="100%" h={30} r={10} />
    </View>
  );
}

const st = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 10, borderRadius: 16, padding: 16, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  info: { flex: 1, gap: 8 },
  bar: { flexDirection: 'row', gap: 12 },
});
