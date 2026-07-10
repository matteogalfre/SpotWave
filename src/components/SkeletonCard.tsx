import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export const useSharedShimmer = () => {
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
  return anim;
};

export function Shimmer({ w, h, r = 8, anim }: { w: number | `${number}%`; h: number; r?: number; anim: Animated.Value }) {
  const { colors } = useTheme();
  return (
    <Animated.View
      style={{
        width: w,
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
  const anim = useSharedShimmer();
  return (
    <View style={[st.card, { backgroundColor: colors.card }]}>
      <View style={st.head}>
        <Shimmer w={60} h={60} r={30} anim={anim} />
        <View style={st.info}>
          <Shimmer w={140} h={16} anim={anim} />
          <Shimmer w={100} h={12} anim={anim} />
        </View>
      </View>
      <View style={st.bar}>
        <Shimmer w={70} h={12} anim={anim} />
        <Shimmer w={50} h={12} anim={anim} />
        <Shimmer w={80} h={12} anim={anim} />
      </View>
      <Shimmer w="100%" h={30} r={10} anim={anim} />
    </View>
  );
}

const st = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 10, borderRadius: 16, padding: 16, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  info: { flex: 1, gap: 8 },
  bar: { flexDirection: 'row', gap: 12 },
});
