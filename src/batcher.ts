/**
 * A lightweight, generic batching utility.
 * Collects items of any type, supports manual and automatic flushing,
 * and allows both synchronous and asynchronous handlers with robust concurrency control.
 */

export interface BatcherOptions {
  /** Optional: Flush interval in milliseconds */
  intervalMs?: number;
  /** Optional: Callback invoked if the registered handler throws or rejects */
  onError?: (error: unknown) => void;
  /** Optional: Max number of items per flush (for streaming/batch mode) */
  batchSize?: number;
}

export class Batcher<T> {
  /** Internal queue of pending items (FIFO order). */
  private queue: T[] = [];

  /** The handler registered by user for each flush. */
  private handler?: (batch: T[]) => void | Promise<void>;

  /** Optional error callback. */
  private readonly onError?: (error: unknown) => void;

  /** Interval handle for automatic flush. */
  private timer?: ReturnType<typeof setInterval>;

  /** Flush configuration values. */
  private readonly flushIntervalMs: number;
  private readonly batchSize?: number;

  /** Concurrency control flags. */
  private flushing = false;
  private flushQueued = false;

  constructor(options: BatcherOptions = {}) {
    this.flushIntervalMs = options.intervalMs ?? 500;
    this.batchSize = options.batchSize;
    this.onError = options.onError;
  }

  /** Adds a single item to the queue. */
  add(item: T): void {
    this.queue.push(item);
  }

  /** Adds multiple items to the queue at once. */
  addMany(items: T[]): void {
    this.queue.push(...items);
  }

  /** Returns a shallow copy of the queue contents (for introspection). */
  getBatch(): T[] {
    return [...this.queue];
  }

  /** Clears all items from the queue. */
  clear(): void {
    this.queue = [];
  }

  /** Removes a single batch from the queue (up to batchSize, or entire queue). */
  private dequeueBatch(): T[] {
    if (!this.batchSize) {
      const batch = this.queue.splice(0, this.queue.length);
      return batch;
    }
    return this.queue.splice(0, this.batchSize);
  }

  /**
   * Registers a handler to process queued batches when flushed.
   * Automatically starts the interval if not already running.
   */
  registerHandler(handler: (batch: T[]) => void | Promise<void>): void {
    this.handler = handler;
    this.startAutoFlush();
  }

  /**
   * Main flush method — async-safe and queue-aware.
   * Ensures no overlapping flushes occur, and drains all queued data sequentially.
   */
  async flush(): Promise<void> {
    if (!this.handler) {
      console.warn('[Batcher] flush() called with no handler registered');
      return;
    }

    // Avoid concurrent flush overlap
    if (this.flushing) {
      this.flushQueued = true;
      return;
    }

    // Nothing to process
    if (this.queue.length === 0) return;

    this.flushing = true;
    try {
      // Drain queue completely in sequential chunks
      while (this.queue.length > 0) {
        const batch = this.dequeueBatch();
        await this.invokeHandler(batch);
      }
    } catch (error) {
      this.handleError(error);
    } finally {
      this.flushing = false;

      // If new items arrived mid-flush, queue another flush immediately
      if (this.flushQueued || this.queue.length > 0) {
        this.flushQueued = false;
        queueMicrotask(() => this.flush());
      }
    }
  }

  /** Safely invokes the handler and reports errors. */
  private async invokeHandler(batch: T[]): Promise<void> {
    try {
      await this.handler?.(batch);
    } catch (error) {
      this.handleError(error);
    }
  }

  /** Centralized error handling logic. */
  private handleError(error: unknown): void {
    if (this.onError) this.onError(error);
    else console.error('[Batcher] handler threw an error:', error);
  }

  /** Starts periodic flushing based on configured interval. */
  private startAutoFlush(): void {
    if (this.timer) return;
    this.timer = setInterval(async () => {
      try {
        await this.flush();
      } catch (err) {
        this.handleError(err);
      }
    }, this.flushIntervalMs);
  }

  /** Stops automatic flushing. */
  stopAutoFlush(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
