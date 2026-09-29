import { continueRender, delayRender, staticFile } from "remotion";

/** Same tokens as apps/app/src/theme.ts: the video speaks the app's language. */
export const C = {
  abyss: "#02050C",
  void: "#040A18",
  navy900: "#06112A",
  navy800: "#0A1A3A",
  line: "#1C3A6E",
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
  ok: "#5CF2C2",
} as const;

export const F = {
  display: "Chakra Petch",
  body: "IBM Plex Sans",
  mono: "IBM Plex Mono",
} as const;

const FACES: [string, number, string][] = [
  [F.display, 500, "ChakraPetch_500Medium"],
  [F.display, 600, "ChakraPetch_600SemiBold"],
  [F.display, 700, "ChakraPetch_700Bold"],
  [F.body, 400, "IBMPlexSans_400Regular"],
  [F.body, 500, "IBMPlexSans_500Medium"],
  [F.body, 600, "IBMPlexSans_600SemiBold"],
  [F.mono, 400, "IBMPlexMono_400Regular"],
  [F.mono, 500, "IBMPlexMono_500Medium"],
];

let loaded = false;
/** Loads the app's own TTFs (copied from @expo-google-fonts) before the first frame renders. */
export function loadFonts() {
  if (loaded || typeof document === "undefined") return;
  loaded = true;
  const handle = delayRender("fonts");
  Promise.all(
    FACES.map(([family, weight, file]) => {
      const face = new FontFace(family, `url(${staticFile(`fonts/${file}.ttf`)})`, { weight: String(weight) });
      document.fonts.add(face);
      return face.load();
    }),
  )
    .then(() => continueRender(handle))
    .catch((e) => {
      console.error(e);
      continueRender(handle);
    });
}

/** Expo-out, the app's signature easing. */
export const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 4);
