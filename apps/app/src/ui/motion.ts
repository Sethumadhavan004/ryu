import { cubicBezier } from "react-native-reanimated";

/** Expo-out — fast start, long settle. The house easing. */
export const easeOut = cubicBezier(0.16, 1, 0.3, 1);
export const easeInOut = cubicBezier(0.65, 0, 0.35, 1);
export const easeSnap = cubicBezier(0.2, 0.9, 0.1, 1);

export const ms = (n: number) => `${Math.round(n)}ms` as const;

/** The System window reveal: a line of light, then it unfolds. */
export const WINDOW_OPEN = {
  "0%": { opacity: 0, transform: [{ scaleX: 0.02 }, { scaleY: 0.004 }] },
  "30%": { opacity: 1, transform: [{ scaleX: 1 }, { scaleY: 0.004 }] },
  "100%": { opacity: 1, transform: [{ scaleX: 1 }, { scaleY: 1 }] },
};

export const FADE_UP = {
  from: { opacity: 0, transform: [{ translateY: 10 }] },
  to: { opacity: 1, transform: [{ translateY: 0 }] },
};

export const FADE_IN = { from: { opacity: 0 }, to: { opacity: 1 } };

export const PULSE = {
  "0%": { opacity: 1 },
  "50%": { opacity: 0.35 },
  "100%": { opacity: 1 },
};

export const SPIN = { from: { transform: [{ rotate: "0deg" }] }, to: { transform: [{ rotate: "360deg" }] } };
export const SPIN_REV = { from: { transform: [{ rotate: "360deg" }] }, to: { transform: [{ rotate: "0deg" }] } };
