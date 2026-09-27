import { google } from "@ai-sdk/google";
import { generateText, Output, type LanguageModel } from "ai";
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

/** One structured call. Every pipeline stage goes through here. */
export async function structured<S extends z.ZodType>(opts: {
  model: LanguageModel;
  schema: S;
  system: string;
  prompt: string;
  temperature: number;
  abortSignal?: AbortSignal;
}): Promise<z.infer<S>> {
  const { output } = await generateText({
    model: opts.model,
    output: Output.object({ schema: opts.schema }),
    system: opts.system,
    prompt: opts.prompt,
    temperature: opts.temperature,
    maxRetries: 2,
    abortSignal: opts.abortSignal,
  });
  return output as z.infer<S>;
}
