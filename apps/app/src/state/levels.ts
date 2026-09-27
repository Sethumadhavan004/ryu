/**
 * Audio levels, 0..1, written ~60×/s by capture/voice and read inside
 * animation frames. Deliberately NOT React state: levels change every frame.
 */
export const levels = {
  /** The user's microphone. */
  input: 0,
  /** Ryu's voice. */
  output: 0,
  /** Sources that produce a fresh value on demand (analysers). */
  readers: { input: null as null | (() => number), output: null as null | (() => number) },
};

export function sampleLevels(): { input: number; output: number } {
  if (levels.readers.input) levels.input = levels.readers.input();
  if (levels.readers.output) levels.output = levels.readers.output();
  return { input: levels.input, output: levels.output };
}
