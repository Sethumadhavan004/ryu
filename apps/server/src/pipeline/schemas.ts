import { z } from "zod";

/**
 * Schemas are the spec (Research 04 §B5 rule 7): field descriptions carry the
 * instructions. The model returns lists per kind; code assigns IDs and
 * enforces evidence, so nothing the model says can create a dangling ref.
 */

const evidence = z
  .array(z.string())
  .describe("Utterance IDs (e.g. U012) where this is actually said. 1–4, most direct first.");
const confidence = z.number().describe("0–1: certainty the item is correctly stated AND attributed.");
const speaker = z.string().describe("Speaker ID like S2. Never a name.");

export const decisionOut = z.object({
  text: z.string().describe("The conclusion the group accepted, one sentence."),
  decidedBy: z.array(speaker),
  evidence,
  confidence,
});

export const commitmentOut = z.object({
  task: z.string().describe("What will be done, imperative, without the owner's name. e.g. 'Send the metrics deck'."),
  owner: speaker.nullable().describe("Who will do it. null when nobody accepted it."),
  requestedBy: speaker.nullable().describe("Who asked for it, if someone did; else null."),
  strength: z
    .enum(["firm", "tentative", "proposed"])
    .describe("firm: clear 'I will' or accepting a request. tentative: hedged ('I can try'). proposed: 'someone should…', owner null."),
  due: z.string().nullable().describe("ISO date (YYYY-MM-DD) resolved against the meeting date, or null."),
  dueText: z.string().nullable().describe("Original words for timing, e.g. 'by Friday', or null."),
  evidence,
  confidence,
});

export const questionOut = z.object({
  text: z.string(),
  askedBy: speaker,
  directedTo: speaker.nullable(),
  answered: z.boolean().describe("true only if the transcript contains the answer."),
  evidence,
  confidence,
});

export const riskOut = z.object({ text: z.string(), raisedBy: speaker, evidence, confidence });
export const positionOut = z.object({
  speaker,
  topic: z.string(),
  stance: z.string().describe("What they argued, one line."),
  evidence,
  confidence,
});
export const factOut = z.object({
  text: z.string().describe("A specific number, date, name or metric worth keeping."),
  statedBy: speaker,
  evidence,
  confidence,
});

export const ledgerOut = z.object({
  decisions: z.array(decisionOut),
  commitments: z.array(commitmentOut),
  questions: z.array(questionOut),
  risks: z.array(riskOut),
  positions: z.array(positionOut),
  facts: z.array(factOut),
  topics: z
    .array(z.object({ title: z.string().describe("≤5 words"), startUtt: z.string(), endUtt: z.string() }))
    .describe("2–8 contiguous topics covering the meeting in order."),
});
export type LedgerOut = z.infer<typeof ledgerOut>;

export const verifyOut = z.object({
  verdicts: z.array(
    z.object({
      id: z.string().describe("Atom ID being judged."),
      verdict: z.enum(["supported", "fix", "unsupported"]),
      reason: z.string().describe("One line."),
      fix: z
        .object({
          text: z.string().nullable(),
          task: z.string().nullable(),
          owner: z.string().nullable(),
          requestedBy: z.string().nullable(),
          strength: z.enum(["firm", "tentative", "proposed"]).nullable(),
          dueText: z.string().nullable(),
          answered: z.boolean().nullable(),
        })
        .nullable()
        .describe("Only for verdict=fix: corrected fields; null for fields that are fine."),
    }),
  ),
  missing: z
    .object({
      decisions: z.array(decisionOut),
      commitments: z.array(commitmentOut),
      questions: z.array(questionOut),
    })
    .describe("Important items present in the transcript but absent from the ledger. Empty lists if none."),
});

export const speakersOut = z.object({
  speakers: z.array(
    z.object({
      id: speaker,
      name: z.string().nullable().describe("Name ONLY if the transcript makes it evident; else null."),
      evidence: z.array(z.string()).describe("Utterance IDs proving the name (e.g. someone addressing them). Empty if name is null."),
    }),
  ),
});

export const meetingNoteOut = z.object({
  title: z.string().describe("Specific, ≤8 words."),
  tldr: z.string().describe("≤3 sentences. Lead with the most consequential outcome; mention unresolved blockers."),
  decisions: z.array(z.string()).describe("Decision IDs by importance."),
  actions: z.array(z.string()).describe("Commitment IDs by importance (firm/tentative first, proposed last)."),
  openQuestions: z.array(z.string()),
  risks: z.array(z.string()),
  topics: z.array(z.object({ topicId: z.string(), summary: z.string().describe("1–3 sentences."), atoms: z.array(z.string()) })),
});

export const personNoteOut = z.object({
  headline: z.string().describe("One sentence: this person's single most important takeaway."),
  decisionsAffectingYou: z
    .array(z.object({ atomId: z.string(), why: z.string().describe("≤15 words") }))
    .describe("Only decisions whose effect on this person is evident."),
  yourContributions: z
    .array(z.object({ summary: z.string(), atoms: z.array(z.string()) }))
    .describe("1–4 things they argued or reported."),
  suggestedFollowUps: z.array(z.string()).describe("≤3 next steps implied by the above. Empty if none."),
});

export const liveLedgerOut = z.object({
  atoms: z.array(
    z.object({
      kind: z.enum(["decision", "commitment", "question"]),
      text: z.string().describe("≤12 words. For commitments: 'Name: task'."),
      at: z.string().describe("mm:ss where it was heard."),
    }),
  ),
});

export const finalTranscriptOut = z.object({
  utterances: z.array(
    z.object({
      speaker: z.string().describe("Diarization label: A, B, C… consistent across the whole recording."),
      start: z.number().describe("Seconds from start."),
      end: z.number(),
      text: z.string(),
    }),
  ),
});

export const briefOut = z.object({ text: z.string().describe("What Ryu says aloud, ≤45 words.") });
