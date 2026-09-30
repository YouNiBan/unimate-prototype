import React from "react";
import Svg, { Path, Circle, G } from "react-native-svg";

// A compact Q&A symbol, drawn as a vector so it stays sharp in the tab bar.
export default function ForumIcon({ size = 24, color }: { size?: number; color: string }) {
  return <Svg width={size} height={size} viewBox="0 0 32 32" accessibilityElementsHidden importantForAccessibility="no">
    <G stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none">
      <Path d="M10 6V4a2 2 0 0 1 2-2l15 1a2 2 0 0 1 2 2v8M24 13V8a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v20a2 2 0 0 0 2 2h15a2 2 0 0 0 2-2v-2M9 11h10M9 15h6M9 20h5M9 25h7" />
      <Path d="M19.2 22.8a6 6 0 1 1 3.8 2.7l-4.5.3 1.3-3Z" />
      <Path d="M23.3 18.4a1.6 1.6 0 0 1 3.2 0c0 1.3-1.6 1.2-1.6 2.7" />
    </G>
    <Circle cx={24.9} cy={22.9} r={0.85} fill={color} />
  </Svg>;
}
