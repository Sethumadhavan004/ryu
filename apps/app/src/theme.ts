import { Platform } from "react-native";

/**
 * SYSTEM design language — Solo Leveling's "System" window, taken seriously.
 *
 * Colour carries meaning (Research 04 §A1, principle 5):
 *   system blue  → Ryu / the System (AI, live, interactive)
 *   shadow violet→ capture: a meeting is being recorded
 *   gold         → things that are YOURS (your actions, owed to you)
 *   danger red   → errors, blockers
 */
export const C = {
  abyss: "#02050C",
  void: "#040A18",
  navy900: "#06112A",
  navy800: "#0A1A3A",
  navy700: "#10264F",
  line: "#1C3A6E",
  lineSoft: "rgba(77,163,255,0.18)",

  system: "#4DA3FF",
  systemHi: "#8CCBFF",
  systemGlow: "rgba(64,150,255,0.55)",
  ice: "#EAF4FF",
  text: "#C9DAF2",
  muted: "#7890B4",
  faint: "#3E5479",

  shadow: "#8B63FF",
  shadowHi: "#BBA4FF",
  shadowGlow: "rgba(139,99,255,0.55)",

  gold: "#FFD27A",
  goldGlow: "rgba(255,210,122,0.45)",
  danger: "#FF4D6A",
  ok: "#5CF2C2",
} as const;

export const F = {
  display: "ChakraPetch_600SemiBold",
  displayBold: "ChakraPetch_700Bold",
  label: "ChakraPetch_500Medium",
  body: "IBMPlexSans_400Regular",
  bodyMed: "IBMPlexSans_500Medium",
  bodySemi: "IBMPlexSans_600SemiBold",
  mono: "IBMPlexMono_400Regular",
  monoMed: "IBMPlexMono_500Medium",
} as const;

/** Expo-out: fast start, long settle. The easing of everything in Ryu. */
export const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
export const EASE_IN_OUT = "cubic-bezier(0.65, 0, 0.35, 1)";

export const isWeb = Platform.OS === "web";

/** Glow as a CSS box-shadow string (RN ≥0.76 and web both accept it). */
export const glow = (color: string = C.systemGlow, r = 18, inset = true) =>
  `0 0 0 1px rgba(40,120,255,0.18), 0 0 ${r}px ${color}${inset ? `, inset 0 0 ${Math.round(r * 1.3)}px rgba(56,140,255,0.16)` : ""}`;

export const textGlow = (color: string = C.systemGlow, r = 10) => ({
  textShadowColor: color,
  textShadowRadius: r,
  textShadowOffset: { width: 0, height: 0 },
});

/** Web-only style escape hatch (backdrop-filter, background-image, cursor…). */
export const web = (s: Record<string, unknown>): object => (isWeb ? (s as object) : {});
