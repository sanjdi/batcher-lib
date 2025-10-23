/**
 * A lightweight, generic batching utility.
 * Collects items of any type, supports manual and automatic flushing,
 * and allows error handling through a user-provided callback.
 */

export interface BatcherOptions {
  intervalMs?: number; // Optional: Flush interval in miliseconds
  onError?: (error: unknown) => void; // Optional: Callback invoked if the registered handler throws an error
}

export class Batcher<T> {
  private items: T[] = [];
  private handler?: (batch: T[]) => void;
  private readonly onError?: (error: unknown) => void;
  private timer?: ReturnType<typeof setInterval>;
  private readonly flushIntervalMs: number;

  constructor(options: BatcherOptions = {}) {
    this.flushIntervalMs = options.intervalMs ?? 500; // default 500ms
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
  registerHandler(handler: (batch: T[]) => void): void {
    this.handler = handler;
    this.startAutoFlush();
  }

  /**
   * Flushes the current batch immediately by invoking the handler.
   * Logs a warning if no handler has been registered.
   */
  flush(): void {
    if (!this.handler) {
      console.warn('[Batcher] flush() called with no handler registered');
      return;
    }

    const currentBatch = this.getBatch();
    if (currentBatch.length === 0) return;

    this.invokeHandler(currentBatch);
    this.clear();
  }

  /** Safely invokes the handler and reports any errors. */
  private invokeHandler(batch: T[]): void {
    try {
      this.handler?.(batch);
    } catch (error) {
      this.handleError(error);
    }
  }

  /** Centralized error handling logic for handler failures. */
  private handleError(error: unknown): void {
    if (this.onError) {
      this.onError(error);
    } else {
      console.error('[Batcher] handler threw an error:', error);
    }
  }

  /** Starts the periodic flush interval. */
  private startAutoFlush(): void {
    if (this.timer) return; // prevent multiple intervals
    this.timer = setInterval(() => this.flush(), this.flushIntervalMs);
  }

  /** Stops the periodic flush interval. */
  stopAutoFlush(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }
}
