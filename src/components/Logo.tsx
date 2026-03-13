import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface Props {
  size?: number;
  color?: string;
}

export default function Logo({ size = 28, color = '#00D4AA' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path
        d="M8 52 C24 32, 42 32, 50 52 C58 72, 76 72, 92 52"
        stroke={color}
        strokeWidth={9}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M20 68 C33 53, 44 53, 50 68 C56 83, 67 83, 80 68"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        fill="none"
        opacity={0.35}
      />
    </Svg>
  );
}
