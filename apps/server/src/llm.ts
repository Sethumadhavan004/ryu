import { google } from "@ai-sdk/google";
import { generateText, NoObjectGeneratedError, Output, type LanguageModel } from "ai";
import type { z } from "zod";
import { env } from "./env";

export interface Brain {
  main: LanguageModel;
  lite: LanguageModel;
  label: string;
}

export function defaultBrain(): Brain {
  if (!env.googleKey) throw new Error("GOOGLE_API_KEY is not set — the brain has no model.");
  return { main: google(env.llmModel), lite: google(env.llmLiteModel), label: env.llmModel };
}

/** A stalled provider call must surface as an error, not an endless spinner. */
const CALL_TIMEOUT_MS = 120_000;

/** One structured call. Every pipeline stage goes through here. */
export async function structured<S extends z.ZodType>(opts: {
  model: LanguageModel;
  schema: S;
  system: string;
  prompt: string;
  temperature: number;
  abortSignal?: AbortSignal;
}): Promise<z.infer<S>> {
  const timeout = AbortSignal.timeout(CALL_TIMEOUT_MS);
  try {
    const { output } = await generateText({
      model: opts.model,
      output: Output.object({ schema: opts.schema }),
      system: opts.system,
      prompt: opts.prompt,
      temperature: opts.temperature,
      // Free-tier keys hit per-minute 429s; more retries ride out the window.
      maxRetries: 4,
      abortSignal: opts.abortSignal ? AbortSignal.any([opts.abortSignal, timeout]) : timeout,
    });
    return output as z.infer<S>;
  } catch (e) {
    // The SDK's message is generic; the finish reason (e.g. "length") is the real cause.
    if (NoObjectGeneratedError.isInstance(e)) {
      throw new Error(`${e.message} (finish=${e.finishReason ?? "?"}) ${e.text?.slice(0, 200) ?? ""}`.trim());
    }
    throw e;
  }
}
