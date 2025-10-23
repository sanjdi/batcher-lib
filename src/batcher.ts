/**
 * A lightweight, generic batching utility.
 * Collects items of any type, supports manual and automatic flushing,
 * and invokes a registered handler on each flush.
 */

interface BatcherOptions {
  onError?: (error: unknown) => void;
}

export class Batcher<T> {
  private items: T[] = [];
  private handler?: (batch: T[]) => void;
  private readonly onError?: (error: unknown) => void;
  private timer?: ReturnType<typeof setInterval>;
  private readonly flushIntervalMs: number = 500; // default 500ms

  constructor(options: BatcherOptions = {}) {
    this.onError = options.onError;
  }

  /** Adds a single item to the batch */
  add(item: T): void {
    this.items.push(item);
  }

  /** Adds multiple items to the batch */
  addMany(items: T[]): void {
    this.items.push(...items);
  }

  /** Returns a shallow copy of the current batch */
  getBatch(): T[] {
    return [...this.items];
  }

  /** Clears all items from the batch */
  clear(): void {
    this.items = [];
  }

  /** Registers a handler function to process the batch on flush */
  registerHandler(handler: (batch: T[]) => void): void {
    this.handler = handler;
    this.startAutoFlush();
  }

  /** Manually triggers the handler with the current batch */
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

  /** Internal helper for safe handler invocation */
  private invokeHandler(batch: T[]): void {
    try {
      this.handler?.(batch);
    } catch (error) {
      if (this.onError) {
        this.onError(error);
      } else {
        console.error('[Batcher] handler threw an error:', error);
      }
    }
  }

  /** Starts the interval to automatically flush batches */
  private startAutoFlush(): void {
    if (this.timer) return; // already started
    this.timer = setInterval(() => this.flush(), this.flushIntervalMs);
  }

  /** Stops the automatic flush timer */
  stopAutoFlush(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }
}
