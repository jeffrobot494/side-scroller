// A tiny bounded-concurrency task queue with retry/backoff.
//
// Player2's *synchronous* endpoints (chat completions, TTS, sync image,
// embeddings) hold a connection open while a model runs, and the account has an
// overall in-flight cap that is not published and varies by tier. Rather than
// guess per-endpoint limits, we funnel every synchronous call through one queue
// with a small concurrency budget. Async job endpoints (sprites, 3D, music,
// video) are already queued server-side, so they do NOT go through here — see
// the JobManager in client.js.

export class TaskQueue {
  /**
   * @param {object} [opts]
   * @param {number} [opts.concurrency] Max tasks in flight at once.
   * @param {number} [opts.maxRetries] Retries per task on 429 / transient error.
   */
  constructor({ concurrency = 3, maxRetries = 4 } = {}) {
    this.concurrency = concurrency;
    this.maxRetries = maxRetries;
    this._active = 0;
    this._pending = [];
  }

  /**
   * Run `task` (an async fn) when a slot is free. Resolves/rejects with its
   * result. Automatically retries on RateLimitError, honoring retryAfter.
   * @template T
   * @param {() => Promise<T>} task
   * @returns {Promise<T>}
   */
  run(task) {
    return new Promise((resolve, reject) => {
      this._pending.push({ task, resolve, reject, attempt: 0 });
      this._drain();
    });
  }

  get size() {
    return this._pending.length + this._active;
  }

  _drain() {
    while (this._active < this.concurrency && this._pending.length > 0) {
      const job = this._pending.shift();
      this._active++;
      this._exec(job);
    }
  }

  async _exec(job) {
    try {
      const result = await job.task();
      job.resolve(result);
    } catch (err) {
      const retryable = err && (err.name === "RateLimitError" || err.retryable);
      if (retryable && job.attempt < this.maxRetries) {
        job.attempt++;
        // Honor server's retry_after (seconds) if given, else exponential
        // backoff with jitter: 0.5s, 1s, 2s, 4s ...
        const serverWait = typeof err.retryAfter === "number" ? err.retryAfter * 1000 : 0;
        const backoff = 500 * 2 ** (job.attempt - 1);
        const wait = Math.max(serverWait, backoff) + Math.random() * 250;
        setTimeout(() => {
          this._pending.unshift(job); // retry ahead of newer work
          this._drain();
        }, wait);
      } else {
        job.reject(err);
      }
    } finally {
      this._active--;
      this._drain();
    }
  }
}
