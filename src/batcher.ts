/**
 * A lightweight, generic batching utility.
 * Collects items of any type and provides access to the current batch.
 */
export class Batcher<T> {
  private items: T[] = [];
  private handler?: (batch: T[]) => void;

  /** Adds a single item to the batch */
  add(item: T): void {
    this.items.push(item);
  }

  /** Add multiple items at once to the batch */
  addMany(items: T[]): void {
    this.items.push(...items);
  }

  /** Returns all items currently in the batch */
  getBatch(): T[] {
    return [...this.items];
  }

  /** Registers a handler function that will be called when batch is flushed */
  registerHandler(handler: (batch: T[]) => void): void {
    this.handler = handler;
  }

  /** Invokes the registered handler with the current batch */
  flush(): void {
    if (this.handler) {
      this.handler([...this.items]);
    }
  }
}
