import { Composition } from "remotion";
import { DURATION, FPS, RyuFeature } from "./RyuFeature";

export function Root() {
  return <Composition id="RyuFeature" component={RyuFeature} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} />;
}
