/**
 * Buffers streaming LLM tokens and emits complete sentences, so TTS can start
 * on the first sentence while the rest of the response is still generating.
 * Sentences are processed strictly in order (serialized queue) so audio
 * chunks reach the client in speaking order.
 */
export class SentenceSplitter {
  private buffer = "";
  private queue: Promise<void> = Promise.resolve();

  constructor(private onSentence: (sentence: string) => Promise<void>) {}

  push(token: string): void {
    this.buffer += token;
    // Split on sentence-ending punctuation followed by whitespace.
    const match = this.buffer.match(/^([\s\S]*?[.!?])\s+([\s\S]*)$/);
    if (match) {
      const [, sentence, rest] = match;
      this.buffer = rest;
      this.enqueue(sentence.trim());
    }
  }

  /** Emit whatever remains (final partial sentence). */
  flush(): void {
    const rest = this.buffer.trim();
    this.buffer = "";
    if (rest) this.enqueue(rest);
  }

  private enqueue(sentence: string): void {
    this.queue = this.queue.then(() => this.onSentence(sentence)).catch(() => {});
  }
}
