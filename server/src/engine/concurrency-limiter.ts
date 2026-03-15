/**
 * Concurrency limiter for expensive operations (spars, level tests).
 * Prevents overloading the Stockfish pool and TF.js training.
 */
export class ConcurrencyLimiter {
  private running = 0
  private queue: Array<{ resolve: () => void }> = []

  constructor(private maxConcurrent: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++
      return
    }

    return new Promise<void>((resolve) => {
      this.queue.push({ resolve })
    })
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!
      next.resolve()
    } else {
      this.running--
    }
  }

  /**
   * Run a function with concurrency limiting.
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await fn()
    } finally {
      this.release()
    }
  }

  getStats() {
    return {
      running: this.running,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
    }
  }
}
