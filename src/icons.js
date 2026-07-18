import React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

// Chat-bubble-with-cross mark used in the app header / logo.
export function PharmIcon({ size = 26 }) {
  return (
    <Svg viewBox="0 0 48 48" width={size} height={size}>
      <Path d="M11 7h26a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H23l-8 7v-7h-4a4 4 0 0 1-4-4V11a4 4 0 0 1 4-4z" fill="#ffffff" />
      <Rect x="21.3" y="13" width="5.4" height="17" rx="2.7" fill="#0d6f66" />
      <Rect x="15.3" y="18.8" width="17.4" height="5.4" rx="2.7" fill="#0d6f66" />
    </Svg>
  );
}

// Small cross avatar shown beside each bot message.
export function PlusIcon({ size = 15 }) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Rect x="10" y="4.5" width="4" height="15" rx="2" fill="#ffffff" />
      <Rect x="4.5" y="10" width="15" height="4" rx="2" fill="#ffffff" />
    </Svg>
  );
}
