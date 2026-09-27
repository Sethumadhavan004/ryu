import { AudioSession, registerGlobals } from "@livekit/react-native";

/** Native: install WebRTC globals once and start the audio session. */
let ready = false;
export async function prepareVoicePlatform(): Promise<void> {
  if (!ready) {
    registerGlobals();
    ready = true;
  }
  await AudioSession.startAudioSession();
}
