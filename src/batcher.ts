/**
 * A lightweight, generic batching utility.
 * Collects items of any type, supports manual and automatic flushing,
 * and allows both synchronous and asynchronous handlers with error handling.
 */

export interface BatcherOptions {
  /** Optional: Flush interval in milliseconds */
  intervalMs?: number;
  /** Optional: Callback invoked if the registered handler throws or rejects */
  onError?: (error: unknown) => void;
}

export class Batcher<T> {
  private items: T[] = [];
  private handler?: (batch: T[]) => void | Promise<void>;
  private readonly onError?: (error: unknown) => void;
  private timer?: ReturnType<typeof setInterval>;
  private readonly flushIntervalMs: number;

  /** concurrency control */
  private isFlushing = false;
  private pending = false;

  constructor(options: BatcherOptions = {}) {
    this.flushIntervalMs = options.intervalMs ?? 500;
    this.onError = options.onError;
  }

  /** Adds a single item to the batch. */
  add(item: T): void {
    this.items.push(item);
  }

  /** Adds multiple items to the batch at once. */
  addMany(items: T[]): void {
    this.items.push(...items);
  }

  /** Returns a shallow copy of the current batch contents. */
  getBatch(): T[] {
    return [...this.items];
  }

  /** Clears all items from the batch. */
  clear(): void {
    this.items = [];
  }

  /**
   * Registers a handler to process batches when flushed.
   * Automatically starts the flush interval if not already running.
   */
  registerHandler(handler: (batch: T[]) => void | Promise<void>): void {
    this.handler = handler;
    this.startAutoFlush();
  }

  /**
   * Flushes the current batch immediately.
   * Awaits async handlers and guarantees order.
   */
  async flush(): Promise<void> {
    if (this.isFlushing) {
      // queue a flush if one is already running
      this.pending = true;
      return;
    }

    if (!this.handler) {
      console.warn('[Batcher] flush() called with no handler registered');
      return;
    }

    const currentBatch = this.getBatch();
    if (currentBatch.length === 0) return;

    this.isFlushing = true;
    try {
      await this.invokeHandler(currentBatch);
      this.clear();
    } catch (err) {
      this.handleError(err);
    } finally {
      this.isFlushing = false;

      // run again immediately if data arrived mid‐flush
      if (this.pending) {
        this.pending = false;
        await this.flush();
      }
    }
  }

  /** Safely invokes the handler and reports any errors. */
  private async invokeHandler(batch: T[]): Promise<void> {
    try {
      await this.handler?.(batch);
    } catch (error) {
      this.handleError(error);
    }
  }

  /** Centralized error handling logic for handler failures. */
  private handleError(error: unknown): void {
    if (this.onError) this.onError(error);
    else console.error('[Batcher] handler threw an error:', error);
  }

  /** Starts the periodic flush interval. */
  private startAutoFlush(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      // always attempt flush — queued/pending logic handles overlap
      void this.flush();
    }, this.flushIntervalMs);
  }

  /** Stops the periodic flush interval. */
  stopAutoFlush(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }
}
