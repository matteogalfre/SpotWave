import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, PressableProps, StyleProp, ViewStyle, AccessibilityInfo, GestureResponderEvent } from 'react-native';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Props extends Omit<PressableProps, 'style'> {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Scale reached while pressed (default 0.97). */
  scaleTo?: number;
}

/**
 * A Pressable that gently scales down while held, for a tactile, "native" feel.
 * Falls back to a plain press (no scale) when the OS "reduce motion" setting is on.
 * Uses the native driver so the animation stays smooth even under JS load.
 */
export default function PressableScale({ children, style, scaleTo = 0.97, onPressIn, onPressOut, ...rest }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const reduceMotion = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then(v => { reduceMotion.current = !!v; })
      .catch(() => {});
  }, []);

  const spring = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 0 }).start();

  const handleIn = (e: GestureResponderEvent) => {
    if (!reduceMotion.current) spring(scaleTo);
    onPressIn?.(e);
  };
  const handleOut = (e: GestureResponderEvent) => {
    if (!reduceMotion.current) spring(1);
    onPressOut?.(e);
  };

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={handleIn}
      onPressOut={handleOut}
      style={[style, { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}
