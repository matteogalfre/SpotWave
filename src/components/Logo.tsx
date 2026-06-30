import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface Props {
  size?: number;
  /**
   * Monochrome override: when set, both waves use this single color
   * (e.g. on a colored surface where the two-tone brand mark would clash).
   * Leave undefined to render the brand colors (D1: turquoise + blue).
   */
  mono?: string;
}

// SpotWave brand mark — "D1": two stacked waves.
export const BRAND_TURQUOISE = '#23C7C2';
export const BRAND_BLUE = '#1488B5';

export default function Logo({ size = 28, mono }: Props) {
  const top = mono ?? BRAND_TURQUOISE;
  const bottom = mono ?? BRAND_BLUE;
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        d="M7 22c5 0 5-5 10-5s5 5 10 5 5-5 10-5"
        stroke={top}
        strokeWidth={4}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M7 30c5 0 5-5 10-5s5 5 10 5 5-5 10-5"
        stroke={bottom}
        strokeWidth={4}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}
