import { ChakraPetch_500Medium, ChakraPetch_600SemiBold, ChakraPetch_700Bold } from "@expo-google-fonts/chakra-petch";
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from "@expo-google-fonts/ibm-plex-mono";
import { IBMPlexSans_400Regular, IBMPlexSans_500Medium, IBMPlexSans_600SemiBold } from "@expo-google-fonts/ibm-plex-sans";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated from "react-native-reanimated";
import { demoRequested } from "./src/config";
import { boot } from "./src/lib/controller";
import { demoBoot } from "./src/lib/demo";
import { Boot } from "./src/screens/Boot";
import { Home } from "./src/screens/Home";
import { Meeting } from "./src/screens/Meeting";
import { Notes } from "./src/screens/Notes";
import { Processing } from "./src/screens/Processing";
import { useRyu } from "./src/state/store";
import { C } from "./src/theme";
import { Background } from "./src/ui/Background";
import { Captions, Notices, StatusChip, TopBar } from "./src/ui/Chrome";
import { easeOut, ms } from "./src/ui/motion";

const PHASE_IN = { from: { opacity: 0, transform: [{ scale: 0.985 }] }, to: { opacity: 1, transform: [{ scale: 1 }] } };

export default function App() {
  const [fontsLoaded] = useFonts({
    ChakraPetch_500Medium,
    ChakraPetch_600SemiBold,
    ChakraPetch_700Bold,
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
  });
  const phase = useRyu((s) => s.phase);
  const focus = useRyu((s) => s.focus);
  const { width, height } = useWindowDimensions();
  const compact = width < 820;

  useEffect(() => {
    if (demoRequested()) void demoBoot();
    else void boot();
  }, []);

  if (!fontsLoaded) return <View style={styles.root} />;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Background recording={phase === "meeting"} />
      <TopBar compact={compact} />
      {compact && phase !== "boot" ? (
        <View style={styles.chipCompact} pointerEvents="none">
          <StatusChip />
        </View>
      ) : null}
      <Animated.View
        key={phase}
        style={[styles.stage, { animationName: PHASE_IN, animationDuration: ms(520), animationTimingFunction: easeOut, animationFillMode: "both" }]}
      >
        {phase === "boot" && <Boot compact={compact} />}
        {phase === "home" && <Home compact={compact} width={width} height={height} />}
        {phase === "meeting" && <Meeting compact={compact} />}
        {phase === "processing" && <Processing compact={compact} />}
        {phase === "notes" && <Notes compact={compact} />}
      </Animated.View>
      {!compact && (phase === "home" || (phase === "notes" && !focus)) ? <Captions /> : null}
      <Notices compact={compact} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.abyss, overflow: "hidden" },
  stage: { flex: 1 },
  chipCompact: { position: "absolute", top: 54, left: 0, right: 0, alignItems: "center", zIndex: 20 },
});
