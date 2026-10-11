/**
 * Serializes upstream calls and guarantees a minimum interval between starts.
 *
 * AniDB bans abusive clients. This gate intentionally favors boring safety
 * over throughput. It does not retry failures.
 */
export class RateGateCapacityError extends Error {}

export class RateGate {
  private tail: Promise<void> = Promise.resolve();
  private lastStartedAt = 0;
  private pending = 0;

  constructor(private readonly minIntervalMs: number, private readonly maxPending = 32) {}

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.pending >= this.maxPending) throw new RateGateCapacityError("Upstream queue is full.");
    this.pending++;
    let release!: () => void;
    const previous = this.tail;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;

    try {
      const elapsed = Date.now() - this.lastStartedAt;
      const waitMs = Math.max(0, this.minIntervalMs - elapsed);
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }

      this.lastStartedAt = Date.now();
      return await operation();
    } finally {
      this.pending--;
      release();
    }
  }
}
